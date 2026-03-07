import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { sendEvent } from './telemetry';
import { ZaemitEditorProvider } from './zaemitEditorProvider';

const FIGMA_API = 'https://api.figma.com/v1';
const SECRET_KEY = 'zaemit.figmaToken';

// ── Token 관리 ──────────────────────────────────────

export function registerFigmaCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.figmaSetToken', () => setFigmaToken(context)),
        vscode.commands.registerCommand('zaemit.figmaRemoveToken', () => removeFigmaToken(context)),
        vscode.commands.registerCommand('zaemit.figmaImport', () => importFromFigma(context)),
    );
}

async function setFigmaToken(context: vscode.ExtensionContext): Promise<void> {
    const current = await context.secrets.get(SECRET_KEY);

    const token = await vscode.window.showInputBox({
        title: 'Figma Personal Access Token',
        prompt: 'Figma → Settings → Security → Personal Access Tokens에서 발급받으세요\n(Press \'Enter\' to confirm or \'Escape\' to cancel)',
        placeHolder: 'figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        password: true,
        value: current ? '••••••••' : '',
        ignoreFocusOut: true,
        validateInput: (v) => {
            if (v === '••••••••') { return null; } // keep existing
            if (!v.trim()) { return '토큰을 입력해주세요'; }
            return null;
        }
    });

    if (!token || token === '••••••••') { return; }

    const trimmed = token.trim();

    // 토큰 유효성 검증
    const valid = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Figma 토큰 확인 중...',
    }, async () => {
        try {
            const res = await fetch(`${FIGMA_API}/me`, {
                headers: { 'X-Figma-Token': trimmed },
            });
            if (res.ok) {
                const me = await res.json();
                return me.handle || me.email || true;
            }
            return false;
        } catch { return false; }
    });

    if (!valid) {
        vscode.window.showErrorMessage('토큰이 유효하지 않습니다. Figma에서 새 토큰을 발급받으세요.');
        return;
    }

    await context.secrets.store(SECRET_KEY, trimmed);
    const userName = typeof valid === 'string' ? ` (${valid})` : '';
    vscode.window.showInformationMessage(`Figma 토큰이 확인되었습니다${userName}. 안전하게 저장됨.`);
    sendEvent('figma_token_set');
}

async function removeFigmaToken(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage('Figma 토큰이 삭제되었습니다.');
}

class FigmaRateLimitError extends Error {
    retryAfter: number;
    limitType: string = '';   // 'low' (View/Collab) or 'high' (Dev/Full)
    planTier: string = '';
    upgradeLink: string = '';
    constructor(retryAfter = 60) {
        super('Figma API 요청 제한');
        this.name = 'FigmaRateLimitError';
        this.retryAfter = retryAfter;
    }
}

// ── URL 파싱 ────────────────────────────────────────

interface FigmaUrlInfo {
    fileKey: string;
    nodeId?: string;
    fileName?: string;
}

function parseFigmaUrl(url: string): FigmaUrlInfo | null {
    // https://www.figma.com/design/ABC123/FileName?node-id=1-2
    // https://www.figma.com/file/ABC123/FileName
    // https://www.figma.com/design/ABC123/FileName/...
    const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)(?:\/([^?/]*))?/);
    if (!match) { return null; }

    const fileKey = match[1];
    const fileName = match[2] ? decodeURIComponent(match[2]).replace(/-/g, ' ') : undefined;

    // node-id 파라미터
    const nodeMatch = url.match(/node-id=([^&]+)/);
    const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : undefined;

    return { fileKey, nodeId, fileName };
}

// ── Figma API 호출 ──────────────────────────────────

type StatusCallback = (msg: string) => void;

async function figmaFetch(token: string, endpoint: string, retries = 2, onStatus?: StatusCallback): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    onStatus?.('Figma 서버에 연결 중...');

    try {
        const res = await fetch(`${FIGMA_API}${endpoint}`, {
            headers: { 'X-Figma-Token': token },
            signal: controller.signal,
        });

        if (!res.ok) {
            clearTimeout(timeout);
            if (res.status === 403) {
                throw new Error('Figma 토큰이 유효하지 않습니다.\n[Settings → Security → Personal Access Tokens]에서 새 토큰을 발급받으세요.');
            }
            if (res.status === 404) {
                throw new Error('Figma 파일을 찾을 수 없습니다.\nURL이 정확한지, 파일 접근 권한이 있는지 확인해주세요.');
            }
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
                const limitType = res.headers.get('x-figma-rate-limit-type') || ''; // 'low' or 'high'
                const planTier = res.headers.get('x-figma-plan-tier') || '';
                const upgradeLink = res.headers.get('x-figma-upgrade-link') || '';

                // low 타입은 재시도해도 바로 풀리지 않으므로 에러 처리
                const isLowSeat = limitType === 'low';
                if (!isLowSeat && retries > 0 && retryAfter <= 90) {
                    onStatus?.(`Figma 요청 제한 — ${retryAfter}초 대기 후 자동 재시도합니다 (${retries}회 남음)`);
                    await new Promise(r => setTimeout(r, retryAfter * 1000));
                    onStatus?.('재시도 중...');
                    return figmaFetch(token, endpoint, retries - 1, onStatus);
                }

                const err = new FigmaRateLimitError(retryAfter);
                err.limitType = limitType;
                err.planTier = planTier;
                err.upgradeLink = upgradeLink;
                throw err;
            }
            throw new Error(`Figma API 오류 (HTTP ${res.status})\n${res.statusText}`);
        }

        onStatus?.('데이터 수신 중...');
        const data = await res.json();
        clearTimeout(timeout);
        return data;
    } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error('Figma API 응답 시간 초과 (60초)\n네트워크 연결을 확인하거나, 파일이 너무 크면 특정 프레임 URL(node-id 포함)을 사용해보세요.');
        }
        if (err.message?.includes('Figma') || err.message?.includes('HTTP')) { throw err; }
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            throw new Error('Figma 서버에 연결할 수 없습니다.\n인터넷 연결을 확인해주세요.');
        }
        throw new Error(`Figma API 연결 실패\n${err.message}`);
    }
}

// ── Import 메인 흐름 ────────────────────────────────

async function importFromFigma(context: vscode.ExtensionContext): Promise<void> {
    const token = await context.secrets.get(SECRET_KEY);
    if (!token) {
        const action = await vscode.window.showWarningMessage(
            'Figma 토큰이 설정되지 않았습니다.',
            '토큰 설정하기'
        );
        if (action) { await setFigmaToken(context); }
        return;
    }

    const url = await vscode.window.showInputBox({
        title: 'Import from Figma',
        prompt: 'Figma 디자인 URL을 붙여넣으세요',
        placeHolder: 'https://www.figma.com/design/ABC123/MyDesign?node-id=1-2',
        ignoreFocusOut: true,
        validateInput: (v) => {
            if (!v.trim()) { return 'URL을 입력해주세요'; }
            if (!parseFigmaUrl(v)) { return '유효한 Figma URL이 아닙니다'; }
            return null;
        }
    });

    if (!url) { return; }

    const info = parseFigmaUrl(url)!;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Figma에서 디자인 가져오는 중...',
        cancellable: true
    }, async (progress, cancelToken) => {
        try {
            // progress 상태를 figmaFetch에 전달하는 콜백
            const reportStatus = (msg: string) => {
                if (cancelToken.isCancellationRequested) { throw new Error('사용자가 취소했습니다.'); }
                progress.report({ message: msg });
            };

            // 1. 디자인 데이터 가져오기
            reportStatus('Figma API 호출 중...');
            let nodes: any;

            // Step 1: 프레임 목록만 가볍게 가져오기 (depth=2: Document → Page → Frames)
            reportStatus('프레임 목록 로드 중...');
            const metaData = await figmaFetch(token, `/files/${info.fileKey}?depth=2`, 2, reportStatus);
            const firstPage = metaData.document?.children?.[0];
            if (!firstPage) { throw new Error('빈 Figma 파일입니다.\n페이지에 프레임을 추가한 후 다시 시도해주세요.'); }

            const allFrames = (firstPage.children || []).filter(
                (c: any) => CONTAINER_TYPES.has(c.type) && c.visible !== false
            );
            if (allFrames.length === 0) {
                throw new Error('페이지에 프레임이 없습니다.\n프레임을 추가한 후 다시 시도해주세요.');
            }

            let selectedFrameId: string;

            if (info.nodeId) {
                // URL에 node-id 지정 → 해당 프레임이거나, 그 노드를 포함하는 프레임 찾기
                const nodeIdColon = info.nodeId.replace('-', ':');
                // 직접 프레임인지 확인
                const directFrame = allFrames.find((f: any) => f.id === nodeIdColon);
                if (directFrame) {
                    selectedFrameId = directFrame.id;
                } else {
                    // depth=2 메타에서는 리프 노드가 안 보이므로, 부분 트리로 검색
                    // depth=4로 한번 더 가져와서 해당 노드가 어느 프레임에 있는지 확인
                    reportStatus('선택한 요소의 상위 프레임 탐색 중...');
                    const deepMeta = await figmaFetch(token, `/files/${info.fileKey}?depth=4`, 2, reportStatus);
                    const deepPage = deepMeta.document?.children?.[0];
                    const deepFrames = (deepPage?.children || []).filter(
                        (c: any) => CONTAINER_TYPES.has(c.type) && c.visible !== false
                    );

                    const containing = deepFrames.find((frame: any) =>
                        findNodeById(frame, nodeIdColon) !== null
                    );

                    if (containing) {
                        selectedFrameId = containing.id;
                        vscode.window.showInformationMessage(
                            `선택한 요소가 포함된 프레임 "${containing.name}"을 가져옵니다.`
                        );
                    } else {
                        // 못 찾으면 프레임 선택 UI
                        const picked = await pickFrame(firstPage, reportStatus);
                        selectedFrameId = picked.id;
                    }
                }
            } else if (allFrames.length === 1) {
                selectedFrameId = allFrames[0].id;
            } else {
                // 프레임 여러 개 → 사용자 선택
                const picked = await pickFrame(firstPage, reportStatus);
                selectedFrameId = picked.id;
            }

            // Step 2: 선택된 프레임만 풀 데이터로 가져오기 (/nodes 엔드포인트)
            reportStatus('선택한 프레임 전체 데이터 로드 중...');
            const frameData = await figmaFetch(token, `/files/${info.fileKey}/nodes?ids=${selectedFrameId}`, 2, reportStatus);
            const frameNodeData = frameData.nodes[Object.keys(frameData.nodes)[0]];
            if (!frameNodeData?.document) {
                throw new Error('프레임 데이터를 가져올 수 없습니다.');
            }
            nodes = frameNodeData.document;

            // 2. 이미지 내보내기
            reportStatus('이미지 에셋 확인 중...');
            const imageIds = collectImageNodeIds(nodes);
            let imageMap: Record<string, string> = {};
            if (imageIds.length > 0) {
                reportStatus(`이미지 ${imageIds.length}개 URL 요청 중...`);
                try {
                    const imgData = await figmaFetch(token, `/images/${info.fileKey}?ids=${imageIds.join(',')}&format=png&scale=2`, 2, reportStatus);
                    imageMap = imgData.images || {};
                } catch (imgErr: any) {
                    // 이미지 실패해도 계속 진행하되, 사용자에게 알림
                    vscode.window.showWarningMessage(`이미지 일부를 가져오지 못했습니다: ${imgErr.message}`);
                }
            }

            // 3. 프로젝트 폴더 생성: figma/{safeName}/
            progress.report({ message: '파일 저장 중...' });
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('워크스페이스 폴더를 열어주세요.');
            }

            const safeName = toSafeName(info.fileName || 'figma-import');
            const projectDir = vscode.Uri.joinPath(workspaceFolder.uri, 'figma', safeName);

            // 중복 폴더면 타임스탬프 붙이기
            const finalDir = await ensureUniqueDir(projectDir);
            const finalName = path.basename(finalDir.fsPath);

            // 폴더 생성
            await vscode.workspace.fs.createDirectory(finalDir);

            // 4. 이미지 로컬 다운로드
            let localImageMap: Record<string, string> = {};
            const imgTotal = Object.keys(imageMap).length;
            if (imgTotal > 0) {
                reportStatus(`이미지 ${imgTotal}개 다운로드 중...`);
                const imagesDir = vscode.Uri.joinPath(finalDir, 'images');
                await vscode.workspace.fs.createDirectory(imagesDir);
                localImageMap = await downloadImages(imageMap, imagesDir, (done) => {
                    reportStatus(`이미지 다운로드 중... (${done}/${imgTotal})`);
                });
                sendEvent('figma_images_downloaded', {}, {
                    totalImages: Object.keys(imageMap).length,
                    downloadedImages: Object.keys(localImageMap).length,
                });
            }

            // 5. 디버그: Figma 원본 데이터 저장
            reportStatus('디버그 데이터 저장 중...');
            const debugData = {
                _meta: {
                    fileKey: info.fileKey,
                    nodeId: info.nodeId,
                    fileName: info.fileName,
                    timestamp: new Date().toISOString(),
                    nodeCount: countNodes(nodes),
                    imageIds: imageIds.length,
                    imagesDownloaded: Object.keys(localImageMap).length,
                },
                nodes,
                imageMap,
                localImageMap,
            };
            const debugPath = vscode.Uri.joinPath(finalDir, '_figma-debug.json');
            await vscode.workspace.fs.writeFile(debugPath, Buffer.from(JSON.stringify(debugData, null, 2), 'utf-8'));

            // 6. HTML/CSS 변환
            reportStatus(`HTML/CSS 변환 중... (노드 ${countNodes(nodes)}개)`);
            const result = convertToHtml(nodes, localImageMap, finalName);

            // 7. 파일 저장
            reportStatus('파일 저장 중...');
            const htmlPath = vscode.Uri.joinPath(finalDir, 'index.html');
            const cssPath = vscode.Uri.joinPath(finalDir, 'style.css');

            await vscode.workspace.fs.writeFile(htmlPath, Buffer.from(result.html, 'utf-8'));
            await vscode.workspace.fs.writeFile(cssPath, Buffer.from(result.css, 'utf-8'));

            // 7. Zaemit 에디터에서 열기
            reportStatus('Zaemit 에디터에서 여는 중...');
            await vscode.commands.executeCommand('vscode.openWith', htmlPath, ZaemitEditorProvider.viewType);

            sendEvent('figma_import_success', {
                hasNodeId: String(!!info.nodeId),
                folderName: finalName,
            }, {
                imageCount: imageIds.length,
                downloadedImages: Object.keys(localImageMap).length,
                nodeCount: countNodes(nodes),
            });

            vscode.window.showInformationMessage(`Figma 디자인을 figma/${finalName}/에 가져왔습니다.`);

        } catch (err: any) {
            sendEvent('figma_import_error', { error: err.message || 'unknown' });

            if (err instanceof FigmaRateLimitError) {
                const rateErr = err as FigmaRateLimitError;
                const waitSec = rateErr.retryAfter;
                const waitDisplay = waitSec >= 60 ? `약 ${Math.ceil(waitSec / 60)}분` : `${waitSec}초`;

                let msg: string;
                const buttons: string[] = [];

                if (rateErr.limitType === 'low') {
                    // low 타입: Figma에서 더 엄격한 제한 적용
                    msg = `Figma API 요청 한도에 도달했습니다. 현재 계정의 좌석 유형에 따른 제한이며, 시간이 지나면 해제됩니다.${rateErr.upgradeLink ? ' 좌석을 업그레이드하면 한도가 완화될 수 있습니다.' : ''}`;
                    if (rateErr.upgradeLink) { buttons.push('좌석 업그레이드'); }
                    buttons.push('닫기');
                } else {
                    // 일반 429: 일시적 요청 제한
                    msg = `Figma에서 일시적으로 요청을 제한했습니다 (대기: ${waitDisplay}). 잠시 후 자동으로 해제됩니다.`;
                    buttons.push('대기 후 자동 재시도');
                    buttons.push('닫기');
                }

                const action = await vscode.window.showErrorMessage(msg, ...buttons);
                if (action === '대기 후 자동 재시도') {
                    const cancelled = await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Figma 요청 제한 해제 대기 중',
                        cancellable: true,
                    }, async (progress, cancelToken) => {
                        for (let i = waitSec; i > 0; i--) {
                            if (cancelToken.isCancellationRequested) { return true; }
                            const min = Math.floor(i / 60);
                            const sec = i % 60;
                            progress.report({ message: min > 0 ? `${min}분 ${sec}초 남음` : `${sec}초 남음` });
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        return false;
                    });
                    if (!cancelled) {
                        await importFromFigma(context);
                    }
                } else if (action === '좌석 업그레이드' && rateErr.upgradeLink) {
                    vscode.env.openExternal(vscode.Uri.parse(rateErr.upgradeLink));
                }
                return;
            }

            vscode.window.showErrorMessage(`Figma Import 실패: ${err.message}`);
        }
    });
}

// ── 이미지 노드 수집 ────────────────────────────────

function collectImageNodeIds(node: any): string[] {
    const ids: string[] = [];

    function walk(n: any) {
        // IMAGE fill이 있는 노드
        if (n.fills?.some((f: any) => f.type === 'IMAGE')) {
            ids.push(n.id);
        }
        // VECTOR, BOOLEAN_OPERATION 등 복잡한 도형도 이미지로 내보내기
        if (['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'REGULAR_POLYGON'].includes(n.type)) {
            ids.push(n.id);
        }
        if (n.children) {
            n.children.forEach(walk);
        }
    }

    walk(node);
    return [...new Set(ids)];
}


// ── 레이아웃 분석 (non-autolayout 프레임용) ─────────

const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'SECTION', 'COMPONENT_SET']);

// ── Figma → HTML/CSS 변환 ───────────────────────────

interface ConvertResult {
    html: string;
    css: string;
}

let classCounter = 0;

const usedFonts = new Set<string>();

// Figma 폰트명 → Google Fonts 호환 이름 변환
function normalizeGoogleFontName(figmaName: string): string {
    // "OFL Sorts Mill Goudy TT" → "Sorts Mill Goudy"
    let name = figmaName;
    name = name.replace(/^OFL\s+/i, '');    // OFL 접두사 제거
    name = name.replace(/\s+TT$/i, '');      // TT 접미사 제거
    name = name.replace(/\s+OT$/i, '');      // OT 접미사 제거
    return name.trim();
}

function convertToHtml(rootNode: any, imageMap: Record<string, string>, title: string): ConvertResult {
    classCounter = 0;
    usedFonts.clear();
    const cssRules: string[] = [];

    // 루트 스타일
    cssRules.push(`* { margin: 0; padding: 0; box-sizing: border-box; }`);
    // body 배경색: 루트 노드의 backgroundColor 적용
    const rootBg = rootNode.backgroundColor;
    const bodyBgColor = rootBg ? `background-color: ${figmaColor(rootBg)}; ` : '';
    cssRules.push(`body { ${bodyBgColor}font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow-x: hidden; }`);

    const bodyContent = renderNode(rootNode, cssRules, imageMap, true);

    // Google Fonts import 생성
    let fontLink = '';
    if (usedFonts.size > 0) {
        const families = Array.from(usedFonts)
            .map(f => f.replace(/ /g, '+') + ':wght@100;200;300;400;500;600;700;800;900')
            .join('&family=');
        fontLink = `\n    <link rel="preconnect" href="https://fonts.googleapis.com">` +
                   `\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
                   `\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${families}&display=swap">`;
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>${fontLink}
    <link rel="stylesheet" href="style.css">
</head>
<body>
${bodyContent}
</body>
</html>`;

    const css = cssRules.join('\n\n');

    return { html, css };
}

function renderNode(node: any, cssRules: string[], imageMap: Record<string, string>, isRoot = false): string {
    if (!node) { return ''; }

    const className = `f-${++classCounter}`;
    const styles: string[] = [];
    const attrs: string[] = [`class="${className}"`];

    // 크기
    const box = node.absoluteBoundingBox || node.size;
    const isText = node.type === 'TEXT';
    const hasChildren = node.children?.length > 0;
    // FILL/HUG은 부모 flex에서 크기가 결정되므로 고정 width 불필요
    const skipWidth = node.layoutSizingHorizontal === 'FILL' || node.layoutSizingHorizontal === 'HUG';
    if (box && !isRoot && !isText && !node._absolutePos) {
        if (node._layoutContext && node._parentBox) {
            const pw = node._parentBox.width;
            const ratio = box.width / pw;
            if (node._layoutContext === 'grid') {
                if (box.height) { styles.push(`min-height: ${Math.round(box.height)}px`); }
            } else if (node._layoutContext === 'flex-row') {
                if (!skipWidth) {
                    if (box.width < 48) {
                        styles.push(`width: ${Math.round(box.width)}px`);
                        styles.push(`flex-shrink: 0`);
                    } else if (ratio > 0.95) {
                        styles.push(`flex: 1`);
                    } else {
                        styles.push(`flex: 0 0 ${(ratio * 100).toFixed(1)}%`);
                    }
                }
                if (box.height && !hasChildren) { styles.push(`min-height: ${Math.round(box.height)}px`); }
            } else if (node._layoutContext === 'flex-column') {
                if (!skipWidth) {
                    if (ratio > 0.95) {
                        styles.push(`width: 100%`);
                    } else if (box.width < 48) {
                        styles.push(`width: ${Math.round(box.width)}px`);
                    } else {
                        styles.push(`width: ${(ratio * 100).toFixed(1)}%`);
                    }
                }
                if (box.height && !hasChildren) { styles.push(`min-height: ${Math.round(box.height)}px`); }
            } else {
                if (box.width && !skipWidth) { styles.push(`width: ${Math.round(box.width)}px`); }
                if (box.height && !hasChildren) { styles.push(`min-height: ${Math.round(box.height)}px`); }
            }
        } else {
            if (box.width && !skipWidth) { styles.push(`width: ${Math.round(box.width)}px`); }
            if (box.height && !hasChildren) { styles.push(`min-height: ${Math.round(box.height)}px`); }
        }
    }
    if (isRoot) {
        styles.push(`width: 100%`);
        // Auto Layout이 있는 루트 → flex, 없으면 absolute 배치 (아래에서 처리)
        if (node.layoutMode) {
            styles.push(`display: flex`);
            styles.push(`flex-direction: ${node.layoutMode === 'VERTICAL' ? 'column' : 'row'}`);
        }
    }

    // Auto Layout → Flexbox
    if (node.layoutMode) {
        styles.push(`display: flex`);
        styles.push(`flex-direction: ${node.layoutMode === 'VERTICAL' ? 'column' : 'row'}`);
        if (node.itemSpacing != null) {
            styles.push(`gap: ${Math.round(node.itemSpacing)}px`);
        }
        // 정렬
        const alignMap: Record<string, string> = {
            'MIN': 'flex-start', 'CENTER': 'center', 'MAX': 'flex-end',
            'SPACE_BETWEEN': 'space-between',
        };
        if (node.primaryAxisAlignItems) {
            styles.push(`justify-content: ${alignMap[node.primaryAxisAlignItems] || 'flex-start'}`);
        }
        if (node.counterAxisAlignItems) {
            styles.push(`align-items: ${alignMap[node.counterAxisAlignItems] || 'flex-start'}`);
        }
        // wrap
        if (node.layoutWrap === 'WRAP') {
            styles.push(`flex-wrap: wrap`);
        }
        // 패딩
        if (node.paddingTop != null) { styles.push(`padding: ${r(node.paddingTop)}px ${r(node.paddingRight)}px ${r(node.paddingBottom)}px ${r(node.paddingLeft)}px`); }
    } else if (node.children?.length > 0 && !node.layoutMode && CONTAINER_TYPES.has(node.type)) {
        // Auto Layout 없는 컨테이너 → 좌표계 기반 absolute 배치
        node._useAbsolute = true;
        styles.push(`position: relative`);
        // _absolutePos가 있으면 부모의 absolute 배치에서 width/height 처리
        if (box && !node._absolutePos) {
            styles.push(`width: 100%`);
            styles.push(`min-height: ${Math.round(box.height)}px`);
        }
    }

    // layoutSizingHorizontal/Vertical
    if (node.layoutSizingHorizontal === 'FILL') { styles.push(`flex: 1`); }
    if (node.layoutSizingHorizontal === 'HUG') { styles.push(`width: auto`); }
    if (node.layoutSizingVertical === 'HUG') { /* height auto by default */ }
    if (node.layoutSizingVertical === 'FILL') { styles.push(`flex: 1`); }

    // 배경색 (TEXT 노드는 제외 — fill이 텍스트 색상이므로)
    // imageMap에 있는 non-RECTANGLE 노드도 제외 — <img>로 렌더링되므로 bg-color가 투명 영역을 덮음
    const willRenderAsImg = imageMap[node.id] && node.type !== 'RECTANGLE';
    if (node.type !== 'TEXT' && !willRenderAsImg) {
        const bgFill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (bgFill?.color) {
            styles.push(`background-color: ${figmaColor(bgFill.color, bgFill.opacity)}`);
        }
        // 그라디언트
        const gradFill = node.fills?.find((f: any) => f.type?.includes('GRADIENT') && f.visible !== false);
        if (gradFill) {
            const grad = convertGradient(gradFill);
            if (grad) { styles.push(`background: ${grad}`); }
        }
    }

    // 테두리 (이미지로 export되는 노드는 stroke가 이미 PNG에 포함되므로 제외)
    if (node.strokes?.length > 0 && !willRenderAsImg) {
        const stroke = node.strokes.find((s: any) => s.type === 'SOLID' && s.visible !== false);
        if (stroke?.color) {
            const w = node.strokeWeight || 1;
            styles.push(`border: ${w}px solid ${figmaColor(stroke.color, stroke.opacity)}`);
        }
    }

    // 둥근 모서리
    if (node.cornerRadius) {
        styles.push(`border-radius: ${Math.round(node.cornerRadius)}px`);
    } else if (node.rectangleCornerRadii) {
        const [tl, tr, br, bl] = node.rectangleCornerRadii.map(r);
        styles.push(`border-radius: ${tl}px ${tr}px ${br}px ${bl}px`);
    }

    // 그림자 (TEXT 노드는 제외 — Figma의 텍스트 shadow는 웹에서 다르게 렌더링됨)
    if (!isText) {
        const shadow = node.effects?.find((e: any) => e.type === 'DROP_SHADOW' && e.visible !== false);
        if (shadow) {
            const { offset, radius, color } = shadow;
            styles.push(`box-shadow: ${r(offset?.x)}px ${r(offset?.y)}px ${r(radius)}px ${figmaColor(color)}`);
        }
    }

    // 투명도
    if (node.opacity != null && node.opacity < 1) {
        styles.push(`opacity: ${node.opacity.toFixed(2)}`);
    }

    // overflow (루트 노드는 제외 — 웹페이지 전체 스크롤이 필요하므로)
    if (node.clipsContent && !isRoot) {
        styles.push(`overflow: hidden`);
    }

    // 좌표계 기반 absolute 배치 (non-autolayout 자식)
    // 노드 타입별 렌더링보다 먼저 적용해야 TEXT/IMAGE 등 리프 노드에도 좌표가 반영됨
    if (node._absolutePos) {
        const ap = node._absolutePos;
        const rotRad = node.rotation || 0;
        const rotDeg = Math.abs(rotRad) > 0.01 ? Math.round(rotRad * 180 / Math.PI) : 0;
        const is90 = Math.abs(Math.abs(rotDeg) - 90) < 2;

        if (is90 && rotDeg !== 0) {
            // 90° 회전: AABB(width↔height 스왑된 상태) → 원래 크기 복원 후 회전 적용
            const origW = ap.height; // 회전 전 너비 = AABB 높이
            const origH = ap.width;  // 회전 전 높이 = AABB 너비
            const cx = ap.left + ap.width / 2;  // AABB 중심
            const cy = ap.top + ap.height / 2;
            const newLeft = cx - origW / 2;
            const newTop = cy - origH / 2;
            const leftPct = (newLeft / ap.parentWidth * 100).toFixed(2);
            const widthPct = (origW / ap.parentWidth * 100).toFixed(2);
            styles.push(`position: absolute`);
            styles.push(`left: ${leftPct}%`);
            styles.push(`top: ${Math.round(newTop)}px`);
            styles.push(`width: ${widthPct}%`);
            styles.push(`height: ${Math.round(origH)}px`);
            // Figma positive = CCW, CSS positive = CW → negate
            styles.push(`transform: rotate(${-rotDeg}deg)`);
        } else {
            const leftPct = (ap.left / ap.parentWidth * 100).toFixed(2);
            const widthPct = (ap.width / ap.parentWidth * 100).toFixed(2);
            styles.push(`position: absolute`);
            styles.push(`left: ${leftPct}%`);
            styles.push(`top: ${Math.round(ap.top)}px`);
            styles.push(`width: ${widthPct}%`);
            styles.push(`height: ${Math.round(ap.height)}px`);
            // 임의 각도 회전
            if (rotDeg !== 0) {
                styles.push(`transform: rotate(${-rotDeg}deg)`);
            }
        }
        if (ap.zIndex > 0) { styles.push(`z-index: ${ap.zIndex}`); }
    }

    // ── 노드 타입별 렌더링 ──

    // TEXT
    if (node.type === 'TEXT') {
        const ts = node.style || {};
        if (ts.fontFamily) {
            const googleName = normalizeGoogleFontName(ts.fontFamily);
            styles.push(`font-family: '${googleName}', sans-serif`);
            usedFonts.add(googleName);
        }
        if (ts.fontSize) { styles.push(`font-size: ${Math.round(ts.fontSize)}px`); }
        if (ts.fontWeight && ts.fontWeight !== 400) { styles.push(`font-weight: ${ts.fontWeight}`); }
        if (ts.lineHeightPx) { styles.push(`line-height: ${Math.round(ts.lineHeightPx)}px`); }
        if (ts.letterSpacing) { styles.push(`letter-spacing: ${ts.letterSpacing.toFixed(1)}px`); }
        if (ts.textAlignHorizontal) {
            const taMap: Record<string, string> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
            styles.push(`text-align: ${taMap[ts.textAlignHorizontal] || 'left'}`);
        }

        // 텍스트 색상
        const textFill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (textFill?.color) {
            styles.push(`color: ${figmaColor(textFill.color, textFill.opacity)}`);
        }

        cssRules.push(`.${className} { ${styles.join('; ')}; }`);
        const text = escapeHtml(node.characters || '');
        return `  <p ${attrs.join(' ')}>${text}</p>\n`;
    }

    // IMAGE fill 또는 벡터 → img 또는 background-image
    if (imageMap[node.id]) {
        if (node.type === 'RECTANGLE') {
            // RECTANGLE + IMAGE fill → CSS background-image (배경 텍스처)
            styles.push(`background-image: url('${imageMap[node.id]}')`);
            styles.push(`background-size: cover`);
            styles.push(`background-position: center`);
            cssRules.push(`.${className} { ${styles.join('; ')}; }`);
            return `  <div ${attrs.join(' ')}></div>\n`;
        }
        styles.push(`object-fit: cover`);
        cssRules.push(`.${className} { ${styles.join('; ')}; }`);
        return `  <img ${attrs.join(' ')} src="${imageMap[node.id]}" alt="${escapeHtml(node.name || 'image')}" />\n`;
    }

    // 작은 ELLIPSE/VECTOR (이미지 없음) → CSS로 bullet/아이콘 렌더링
    if (['ELLIPSE', 'STAR', 'REGULAR_POLYGON', 'LINE'].includes(node.type) && !node.children?.length) {
        const w = box?.width || 0;
        const h = box?.height || 0;
        if (w > 0 && w <= 12 && h <= 12) {
            // 작은 원/도형 → bullet dot
            const fill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false);
            const color = fill?.color ? figmaColor(fill.color, fill.opacity) : '#757575';
            styles.push(`width: ${Math.round(w)}px`);
            styles.push(`height: ${Math.round(h)}px`);
            styles.push(`border-radius: 50%`);
            styles.push(`background-color: ${color}`);
            styles.push(`flex-shrink: 0`);
            cssRules.push(`.${className} { ${styles.join('; ')}; }`);
            return `  <span ${attrs.join(' ')}></span>\n`;
        }
        // 중간 크기 도형은 border로 표현
        if (w > 0) {
            const stroke = node.strokes?.find((s: any) => s.type === 'SOLID' && s.visible !== false);
            if (stroke?.color) {
                const sw = node.strokeWeight || 1;
                styles.push(`border: ${sw}px solid ${figmaColor(stroke.color, stroke.opacity)}`);
            }
            if (node.type === 'ELLIPSE') { styles.push(`border-radius: 50%`); }
            styles.push(`flex-shrink: 0`);
            cssRules.push(`.${className} { ${styles.join('; ')}; }`);
            return `  <span ${attrs.join(' ')}></span>\n`;
        }
    }

    // INSTANCE, COMPONENT, FRAME, GROUP, SECTION → div
    let childrenHtml = '';
    if (node.children?.length > 0) {
        const parentBox = node.absoluteBoundingBox;
        let childIdx = 0;
        childrenHtml = node.children
            .filter((c: any) => c.visible !== false)
            .map((child: any) => {
                // Non-autolayout 컨테이너의 자식 → 좌표계 기반 absolute 배치
                if (node._useAbsolute && parentBox && child.absoluteBoundingBox) {
                    const cb = child.absoluteBoundingBox;
                    child._absolutePos = {
                        left: cb.x - parentBox.x,
                        top: cb.y - parentBox.y,
                        width: cb.width,
                        height: cb.height,
                        parentWidth: parentBox.width,
                        parentHeight: parentBox.height,
                        zIndex: childIdx,
                    };
                    childIdx++;
                }
                return renderNode(child, cssRules, imageMap);
            })
            .join('');
    }

    cssRules.push(`.${className} { ${styles.join('; ')}; }`);

    if (!childrenHtml) {
        return `  <div ${attrs.join(' ')}></div>\n`;
    }
    return `  <div ${attrs.join(' ')}>\n${childrenHtml}  </div>\n`;
}

// ── 유틸리티 ────────────────────────────────────────

function r(n: any): number {
    return Math.round(Number(n) || 0);
}

function figmaColor(c: any, opacity?: number): string {
    if (!c) { return 'transparent'; }
    const red = Math.round((c.r || 0) * 255);
    const green = Math.round((c.g || 0) * 255);
    const blue = Math.round((c.b || 0) * 255);
    const alpha = opacity != null ? opacity : (c.a != null ? c.a : 1);
    if (alpha < 1) {
        return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`;
    }
    return `#${hex(red)}${hex(green)}${hex(blue)}`;
}

function hex(n: number): string {
    return n.toString(16).padStart(2, '0');
}

function convertGradient(fill: any): string | null {
    if (!fill.gradientStops || !fill.gradientHandlePositions) { return null; }
    const stops = fill.gradientStops
        .map((s: any) => `${figmaColor(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');

    if (fill.type === 'GRADIENT_LINEAR') {
        const h = fill.gradientHandlePositions;
        if (h.length >= 2) {
            const angle = Math.round(Math.atan2(h[1].y - h[0].y, h[1].x - h[0].x) * 180 / Math.PI + 90);
            return `linear-gradient(${angle}deg, ${stops})`;
        }
    }
    if (fill.type === 'GRADIENT_RADIAL') {
        return `radial-gradient(circle, ${stops})`;
    }
    return `linear-gradient(180deg, ${stops})`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toSafeName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 50) || 'figma-import';
}

async function ensureUniqueDir(baseUri: vscode.Uri): Promise<vscode.Uri> {
    let target = baseUri;
    let counter = 0;
    while (true) {
        try {
            await vscode.workspace.fs.stat(target);
            // 존재하면 숫자 붙이기
            counter++;
            target = vscode.Uri.joinPath(
                vscode.Uri.joinPath(baseUri, '..'),
                `${path.basename(baseUri.fsPath)}-${counter}`
            );
        } catch {
            // 없으면 사용
            return target;
        }
    }
}

async function downloadImages(
    imageMap: Record<string, string>,
    imagesDir: vscode.Uri,
    onProgress?: (done: number) => void
): Promise<Record<string, string>> {
    const localMap: Record<string, string> = {};
    let idx = 0;
    let done = 0;

    const entries = Object.entries(imageMap).filter(([, url]) => !!url);
    const CONCURRENCY = 5;

    // 병렬 다운로드 (동시 5개)
    const downloadOne = async ([nodeId, url]: [string, string]) => {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 15000);
            const res = await fetch(url, { signal: ctrl.signal });
            if (!res.ok) { clearTimeout(t); return; }
            const buffer = Buffer.from(await res.arrayBuffer());
            clearTimeout(t);
            const ext = url.includes('.svg') ? 'svg' : 'png';
            const fileIdx = ++idx;
            const filename = `img-${fileIdx}.${ext}`;
            const filePath = vscode.Uri.joinPath(imagesDir, filename);
            await vscode.workspace.fs.writeFile(filePath, buffer);
            localMap[nodeId] = `images/${filename}`;
        } catch { /* skip failed/timed-out images */ }
        done++;
        onProgress?.(done);
    };

    // 청크 단위 병렬 실행
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
        const chunk = entries.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(downloadOne));
    }

    return localMap;
}

function countNodes(node: any): number {
    let count = 1;
    if (node.children) {
        for (const child of node.children) {
            count += countNodes(child);
        }
    }
    return count;
}

function findNodeById(root: any, id: string): any | null {
    if (root.id === id) { return root; }
    if (root.children) {
        for (const child of root.children) {
            const found = findNodeById(child, id);
            if (found) { return found; }
        }
    }
    return null;
}

async function pickFrame(page: any, reportStatus: StatusCallback): Promise<any> {
    const frames = (page.children || []).filter(
        (c: any) => CONTAINER_TYPES.has(c.type) && c.visible !== false
    );
    if (frames.length === 0) {
        throw new Error('페이지에 프레임이 없습니다.\n프레임을 추가한 후 다시 시도해주세요.');
    }

    if (frames.length === 1) {
        return frames[0];
    }

    // 프레임 여러 개 → 사용자 선택
    reportStatus('프레임 선택 대기 중...');

    // 3개 이하: 우측 하단 알림 버튼으로 선택
    if (frames.length <= 3) {
        const btnLabels = frames.map((f: any, i: number) => {
            const name = f.name || `Frame ${i + 1}`;
            const size = f.absoluteBoundingBox
                ? ` (${Math.round(f.absoluteBoundingBox.width)}×${Math.round(f.absoluteBoundingBox.height)})`
                : '';
            return name + size;
        });

        const picked = await vscode.window.showInformationMessage(
            `${frames.length}개의 프레임이 있습니다. 가져올 프레임을 선택하세요.`,
            ...btnLabels
        );

        if (!picked) { return frames[0]; }
        const idx = btnLabels.indexOf(picked);
        return frames[idx >= 0 ? idx : 0];
    }

    // 4개 이상: 상단 QuickPick (알림 버튼 최대 3개 제한)
    const items = frames.map((f: any, i: number) => {
        const size = f.absoluteBoundingBox
            ? `${Math.round(f.absoluteBoundingBox.width)}×${Math.round(f.absoluteBoundingBox.height)}`
            : '';
        return {
            label: `${i === 0 ? '$(star-full) ' : ''}${f.name || `Frame ${i + 1}`}`,
            description: size,
            detail: i === 0 ? '첫 번째 프레임 (기본 선택)' : undefined,
            frame: f,
        };
    });

    const picked = await vscode.window.showQuickPick(items, {
        title: `Figma 프레임 선택 (${frames.length}개)`,
        placeHolder: '가져올 프레임을 선택하세요 (ESC = 첫 번째 프레임)',
    });

    return picked ? picked.frame : frames[0];
}

// ── AI 반응형 최적화 ────────────────────────────────

// 외부에서 호출 가능 (사이드바, 에디터 버튼 등)
export async function runResponsiveOptimization(projectDir?: vscode.Uri): Promise<void> {
    // projectDir이 없으면 현재 에디터에서 추출
    if (!projectDir) {
        const activeEditor = vscode.window.activeTextEditor;
        const customEditors = vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .find(t => (t.input as any)?.viewType === 'zaemit.visualEditor');

        const uri = activeEditor?.document.uri
            || (customEditors?.input as any)?.uri;

        if (uri) {
            projectDir = vscode.Uri.file(path.dirname(uri.fsPath));
        } else {
            vscode.window.showWarningMessage('HTML 파일을 에디터에서 열어주세요.');
            return;
        }
    }

    return promptResponsiveOptimization(projectDir);
}

async function promptResponsiveOptimization(projectDir: vscode.Uri): Promise<void> {
    // 파일 존재 확인
    const cssUri = vscode.Uri.joinPath(projectDir, 'style.css');
    const htmlUri = vscode.Uri.joinPath(projectDir, 'index.html');
    try {
        await vscode.workspace.fs.stat(htmlUri);
        await vscode.workspace.fs.stat(cssUri);
    } catch {
        vscode.window.showWarningMessage('index.html과 style.css가 있는 폴더에서 실행해주세요.');
        return;
    }

    // 한 단계로: AI 도구 선택 버튼이 바로 알림에 포함
    const pick = await vscode.window.showInformationMessage(
        '반응형 최적화: AI가 absolute → flexbox/grid 변환 + 미디어쿼리를 추가합니다.',
        'Claude Code',
        'Copilot',
        'Cursor',
        '프롬프트 복사'
    );

    if (!pick) { return; }

    const actionMap: Record<string, string> = {
        'Claude Code': 'claude',
        'Copilot': 'copilot',
        'Cursor': 'cursor',
        '프롬프트 복사': 'copy',
    };
    const selectedAction = actionMap[pick];

    const htmlPath = vscode.Uri.joinPath(projectDir, 'index.html').fsPath;
    const cssPath = cssUri.fsPath;
    const prompt = buildResponsivePrompt(htmlPath, cssPath);
    sendEvent('figma_responsive_start', { tool: selectedAction });

    switch (selectedAction) {
        case 'claude': {
            const TIMEOUT_SEC = 180;
            const outputChannel = vscode.window.createOutputChannel('Zaemit AI', 'css');
            outputChannel.show(true);
            outputChannel.appendLine('/* Claude AI 반응형 최적화 - 생성 중... */\n');

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Claude AI 반응형 최적화',
                cancellable: true,
            }, (progress, token) => {
                return new Promise<void>((resolve) => {
                    const startTime = Date.now();
                    let received = false;
                    let settled = false;
                    const finish = () => { if (!settled) { settled = true; clearInterval(timer); clearTimeout(timeoutId); resolve(); } };

                    const timer = setInterval(() => {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: received ? `생성 중... (${elapsed}초)` : `AI 응답 대기 중... (${elapsed}초)` });
                    }, 1000);

                    // 타임아웃
                    const timeoutId = setTimeout(() => {
                        if (!settled) {
                            proc.kill();
                            outputChannel.appendLine(`\n/* ⏰ 타임아웃 (${TIMEOUT_SEC}초) */`);
                            vscode.window.showErrorMessage(`AI 응답 타임아웃 (${TIMEOUT_SEC}초). 프롬프트가 너무 클 수 있습니다. '프롬프트 복사'로 직접 시도해보세요.`);
                            finish();
                        }
                    }, TIMEOUT_SEC * 1000);

                    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
                        cwd,
                        shell: true,
                        stdio: ['pipe', 'pipe', 'pipe'],
                    });

                    let fullOutput = '';

                    token.onCancellationRequested(() => {
                        proc.kill();
                        outputChannel.appendLine('\n/* 취소됨 */');
                        finish();
                    });

                    proc.stdin!.write(prompt);
                    proc.stdin!.end();

                    proc.stdout!.on('data', (data: Buffer) => {
                        received = true;
                        const text = data.toString();
                        fullOutput += text;
                        outputChannel.append(text);
                    });

                    proc.stderr!.on('data', (data: Buffer) => {
                        const text = data.toString().trim();
                        if (text) { outputChannel.appendLine(`/* ${text} */`); }
                    });

                    proc.on('error', (err: Error) => {
                        if (!settled) {
                            outputChannel.appendLine(`\n/* 실행 실패: ${err.message} */`);
                            vscode.window.showErrorMessage(
                                `Claude Code 실행 실패: ${err.message}\n'claude' CLI가 설치되어 있는지 확인하세요.`
                            );
                        }
                        finish();
                    });

                    proc.on('close', async (code: number | null) => {
                        if (settled) { return; }
                        const elapsed = Math.round((Date.now() - startTime) / 1000);

                        if (code === 0 && fullOutput.trim()) {
                            let css = fullOutput.trim();
                            css = css.replace(/^```(?:css)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');

                            await vscode.workspace.fs.writeFile(cssUri, Buffer.from(css, 'utf-8'));
                            outputChannel.appendLine(`\n\n/* ✅ style.css 업데이트 완료 (${elapsed}초) */`);
                            sendEvent('figma_responsive_complete', { tool: 'claude' });
                            vscode.window.showInformationMessage(`반응형 최적화 완료! (${elapsed}초)`);
                        } else {
                            outputChannel.appendLine(`\n/* ❌ 실패 (exit: ${code}, ${elapsed}초) */`);
                            vscode.window.showErrorMessage(`AI 최적화 실패 (exit: ${code})`);
                        }
                        finish();
                    });
                });
            });
            break;
        }
        case 'copilot': {
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
                '프롬프트가 클립보드에 복사되었습니다. Copilot Chat (Ctrl+Shift+I)을 열고 붙여넣으세요.'
            );
            try { await vscode.commands.executeCommand('workbench.action.chat.open'); } catch {}
            break;
        }
        case 'cursor': {
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
                '프롬프트가 클립보드에 복사되었습니다. Cursor Composer (Ctrl+I)를 열고 붙여넣으세요.'
            );
            break;
        }
        case 'copy': {
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage('반응형 최적화 프롬프트가 클립보드에 복사되었습니다.');
            break;
        }
    }
}

function buildResponsivePrompt(htmlPath: string, cssPath: string): string {
    return `Convert a Figma-imported design to responsive CSS.

## Files
- HTML: ${htmlPath}
- CSS: ${cssPath}

Read both files first, then rewrite style.css with the following rules.

## Rules

### Layout (ALL absolute → flexbox/grid)
This is auto-generated from Figma. ALL layouts use position:relative on parents + position:absolute with left/top on children. Convert ALL to modern CSS:
- Remove ALL position:absolute, position:relative, left, top
- Reconstruct with display:flex (flex-direction, gap, align-items, justify-content) or display:grid
- Analyze absolute coordinates to infer intended layout direction and spacing
- Container widths → max-width + width:100%
- Element widths → flex:1, percentage, or min/max-width
- Images → max-width:100%; height:auto
- Fixed heights → min-height or remove
- Only keep position:absolute for genuine overlays/badges

### Breakpoints
- Desktop: default (MUST look identical to original)
- Tablet @media(max-width:768px): stack horizontal→vertical, fonts -10~15%, grid 3→2col
- Mobile @media(max-width:480px): single column, full-width, min 44px tap targets

### Preservation (CRITICAL)
Desktop view MUST be pixel-identical to original. Preserve ALL colors, fonts, sizes, weights, border-radius, shadows, gradients, opacity, image ratios. Do NOT remove elements or change class names.

### Best Practices
rem/em for fonts (base 16px), overflow-x:hidden on body, word-break:break-word for narrow containers.

## OUTPUT
Output ONLY the complete CSS that replaces the current style.css. No explanations, no markdown fences, just raw CSS. Include responsive sections with comments: /* Tablet */ and /* Mobile */`;
}
