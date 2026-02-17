import * as vscode from 'vscode';
import * as path from 'path';
import { FileService } from './services/fileService';

/**
 * WebView → Extension Host 메시지 라우터
 * API URL을 분석하여 적절한 서비스로 라우팅
 */
export class MessageHandler {
    private fileService: FileService;
    private projectDir: string;
    private extensionUri: vscode.Uri;
    private customImageFolders: vscode.Uri[] = [];

    /** 내부 applyEdit 중일 때 true → onDidChangeTextDocument에서 무시용 */
    public isApplyingEdit = false;

    constructor(
        private webview: vscode.Webview,
        private document: vscode.TextDocument,
        projectDir: string,
        extensionUri: vscode.Uri
    ) {
        this.projectDir = projectDir;
        this.extensionUri = extensionUri;
        this.fileService = new FileService(projectDir);
    }

    async handleMessage(msg: any): Promise<void> {
        if (msg.type === 'api:request') {
            await this.handleApiRequest(msg);
        } else if (msg.type === 'images:browseFolder') {
            await this.handleBrowseFolder(msg);
        } else if (msg.type === 'images:listFolder') {
            await this.handleListFolder(msg);
        } else if (msg.type === 'images:saveDroppedFile') {
            await this.handleSaveDroppedFile(msg);
        } else if (msg.type === 'images:pickFile') {
            await this.handlePickFile(msg);
        } else if (msg.type === 'webview:loaded') {
            // WebView 로드 완료 → 초기 데이터 전송
            await this.sendInitData();
        } else if (msg.type === 'editor:ready') {
            console.log('[Zaemit] Editor initialized in WebView');
        } else if (msg.type === 'editor:error') {
            console.error('[Zaemit] Editor error:', msg.payload?.message);
            vscode.window.showErrorMessage(`Zaemit Editor Error: ${msg.payload?.message}`);
        }
    }

    /**
     * 초기 데이터 전송 (프로젝트 파일 내용)
     */
    private async sendInitData(): Promise<void> {
        const files: Record<string, string> = {};

        try {
            files['index.html'] = this.document.getText();
        } catch { /* ignore */ }

        try {
            files['style.css'] = await this.fileService.readFile('style.css');
        } catch { /* no style.css */ }

        try {
            files['script.js'] = await this.fileService.readFile('script.js');
        } catch { /* no script.js */ }

        const projectName = path.basename(this.projectDir);

        // ★ 프로젝트 폴더 webview URI 생성 (srcdoc 상대 경로 이미지 해결용)
        const projectBaseUri = this.webview.asWebviewUri(
            vscode.Uri.file(this.projectDir)
        );

        this.webview.postMessage({
            type: 'init',
            payload: {
                files,
                projectName,
                projectDir: this.projectDir,
                projectBaseUri: projectBaseUri.toString()
            }
        });
    }

    /**
     * /api/* 요청 처리
     */
    private async handleApiRequest(msg: any): Promise<void> {
        const { url, method, body } = msg.payload;
        const requestId = msg.requestId;

        try {
            const result = await this.routeApiRequest(url, method, body);
            this.webview.postMessage({
                type: 'api:response',
                requestId,
                payload: result
            });
        } catch (err: any) {
            this.webview.postMessage({
                type: 'api:response',
                requestId,
                error: err.message || 'Unknown error'
            });
        }
    }

    /**
     * API URL 라우팅
     */
    private async routeApiRequest(url: string, method: string, body: any): Promise<any> {
        // /api/projects/:id/files - 파일 목록
        if (url.match(/\/api\/projects\/[^/]+\/files$/) && method === 'GET') {
            return await this.fileService.listFiles();
        }

        // /api/projects/:id/files/:filename - 파일 저장
        if (url.match(/\/api\/projects\/[^/]+\/files\//) && method === 'POST') {
            const filename = url.split('/files/')[1];
            if (filename && body?.content !== undefined) {
                // index.html 저장 시: 에디터가 주입한 인라인 태그 정리
                const content = filename === 'index.html'
                    ? this.cleanInjectedTags(body.content)
                    : body.content;

                await this.fileService.writeFile(filename, content);

                // VS Code에서 열린 문서가 있으면 동기화
                const filePath = path.join(this.projectDir, filename);
                const fileUri = vscode.Uri.file(filePath);

                if (filename === 'index.html') {
                    // CustomTextEditor의 document 업데이트 + 저장 (dirty 상태 해소)
                    this.isApplyingEdit = true;
                    try {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            this.document.uri,
                            new vscode.Range(0, 0, this.document.lineCount, 0),
                            content
                        );
                        await vscode.workspace.applyEdit(edit);
                        await this.document.save();
                    } finally {
                        this.isApplyingEdit = false;
                    }
                } else {
                    // CSS/JS 등 다른 파일: 열려있으면 동기화
                    const openDoc = vscode.workspace.textDocuments.find(
                        doc => doc.uri.fsPath === fileUri.fsPath
                    );
                    if (openDoc && !openDoc.isClosed) {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            openDoc.uri,
                            new vscode.Range(0, 0, openDoc.lineCount, 0),
                            body.content
                        );
                        await vscode.workspace.applyEdit(edit);
                    }
                }

                return { success: true };
            }
        }

        // /api/projects/:id - 프로젝트 메타데이터
        if (url.match(/\/api\/projects\/[^/]+$/) && method === 'GET') {
            return {
                id: 'vscode-project',
                name: path.basename(this.projectDir),
                folderName: path.basename(this.projectDir),
                versions: [],
                currentVersionId: null,
                publishedVersionId: null
            };
        }

        // /api/projects/:id/versions - 버전 목록
        if (url.match(/\/api\/projects\/[^/]+\/versions$/) && method === 'GET') {
            return [];
        }

        // /api/projects/:id/versions - 버전 생성
        if (url.match(/\/api\/projects\/[^/]+\/versions$/) && method === 'POST') {
            // TODO: Git 기반 버전 저장 구현
            return { id: Date.now().toString(), message: body?.message || 'Manual save', createdAt: new Date().toISOString() };
        }

        // /api/projects/:id/images - 이미지 목록
        if (url.match(/\/api\/projects\/[^/]+\/images$/) && method === 'GET') {
            const filenames = await this.fileService.listImages();
            const images = [];
            for (const name of filenames) {
                const fileUri = vscode.Uri.file(path.join(this.projectDir, name));
                const webviewUri = this.webview.asWebviewUri(fileUri);
                let size = 0;
                try {
                    const stat = await vscode.workspace.fs.stat(fileUri);
                    size = stat.size;
                } catch { /* ignore */ }
                images.push({ name, url: webviewUri.toString(), size });
            }
            return { images };
        }

        // /api/projects/:id/screenshot-exists
        if (url.includes('/screenshot-exists')) {
            return { exists: false };
        }

        // /api/projects/:id/screenshot - 스크린샷 저장 (VS Code에서는 무시)
        if (url.includes('/screenshot') && method === 'POST') {
            return { success: true };
        }

        // /api/projects/:id/view-settings - 뷰 설정
        if (url.includes('/view-settings') && method === 'PUT') {
            return { success: true };
        }

        // /api/icons/* - 아이콘 메타데이터
        if (url.includes('/api/icons/')) {
            return [];
        }

        // /api/templates - 템플릿
        if (url.includes('/api/templates')) {
            return [];
        }

        // /api/auth/* - 인증 (VS Code에서는 무시)
        if (url.includes('/api/auth/')) {
            return { authenticated: false };
        }

        // /api/credits/* - 크레딧 (VS Code에서는 무시)
        if (url.includes('/api/credits/')) {
            return { balance: 0 };
        }

        // /api/projects/:id/versions/autosave - 자동저장 확인
        if (url.includes('/autosave') && method === 'POST') {
            return { exists: false };
        }

        // 기본: 빈 응답
        console.warn(`[MessageHandler] Unhandled API: ${method} ${url}`);
        return {};
    }

    /**
     * 폴더 선택 다이얼로그 → 이미지 목록 반환
     */
    private async handleBrowseFolder(msg: any): Promise<void> {
        const requestId = msg.requestId;
        try {
            const defaultUri = msg.payload?.currentFolder
                ? vscode.Uri.file(msg.payload.currentFolder)
                : vscode.Uri.file(this.projectDir);

            const result = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                defaultUri,
                title: 'Select Image Folder'
            });

            if (result && result.length > 0) {
                const folderPath = result[0].fsPath;

                // localResourceRoots에 새 폴더 추가
                this.addLocalResourceRoot(result[0]);

                const images = await this.scanFolderForImages(folderPath);
                this.webview.postMessage({
                    type: 'images:browseFolder',
                    requestId,
                    payload: { folder: folderPath, images }
                });
            } else {
                // 사용자 취소
                this.webview.postMessage({
                    type: 'images:browseFolder',
                    requestId,
                    payload: { cancelled: true }
                });
            }
        } catch (err: any) {
            this.webview.postMessage({
                type: 'images:browseFolder',
                requestId,
                error: err.message || 'Browse folder failed'
            });
        }
    }

    /**
     * 특정 폴더의 이미지 목록 반환 (다이얼로그 없이)
     */
    private async handleListFolder(msg: any): Promise<void> {
        const requestId = msg.requestId;
        try {
            const folderPath = msg.payload?.folder;
            let images: any[];

            if (!folderPath) {
                // 기본: 프로젝트 루트 (기존 listImages 동작 - images/ 하위 포함)
                const filenames = await this.fileService.listImages();
                images = [];
                for (const name of filenames) {
                    const fileUri = vscode.Uri.file(path.join(this.projectDir, name));
                    const webviewUri = this.webview.asWebviewUri(fileUri);
                    let size = 0;
                    try {
                        const stat = await vscode.workspace.fs.stat(fileUri);
                        size = stat.size;
                    } catch { /* ignore */ }
                    images.push({ name, url: webviewUri.toString(), size });
                }
            } else {
                // 커스텀 폴더
                this.addLocalResourceRoot(vscode.Uri.file(folderPath));
                images = await this.scanFolderForImages(folderPath);
            }

            this.webview.postMessage({
                type: 'images:listFolder',
                requestId,
                payload: { folder: folderPath || this.projectDir, images }
            });
        } catch (err: any) {
            this.webview.postMessage({
                type: 'images:listFolder',
                requestId,
                error: err.message || 'List folder failed'
            });
        }
    }

    /**
     * 폴더에서 이미지 파일 스캔 → webview URI 포함 목록 반환
     */
    private async scanFolderForImages(folderPath: string): Promise<any[]> {
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
        const images: any[] = [];

        try {
            const dirUri = vscode.Uri.file(folderPath);
            const entries = await vscode.workspace.fs.readDirectory(dirUri);

            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File) continue;
                const ext = path.extname(name).toLowerCase();
                if (!imageExts.includes(ext)) continue;

                const fileUri = vscode.Uri.file(path.join(folderPath, name));
                const webviewUri = this.webview.asWebviewUri(fileUri);
                let size = 0;
                try {
                    const stat = await vscode.workspace.fs.stat(fileUri);
                    size = stat.size;
                } catch { /* ignore */ }
                images.push({ name, url: webviewUri.toString(), size });
            }
        } catch (err) {
            console.error('[MessageHandler] Error scanning folder:', err);
        }

        return images;
    }

    /**
     * localResourceRoots에 새 폴더 추가 (webview에서 접근 가능하도록)
     */
    private addLocalResourceRoot(folderUri: vscode.Uri): void {
        // 이미 포함된 폴더인지 확인
        const exists = this.customImageFolders.some(
            f => f.fsPath === folderUri.fsPath
        );
        if (exists) return;

        this.customImageFolders.push(folderUri);

        // webview options 업데이트
        this.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(this.projectDir),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
                vscode.Uri.joinPath(this.extensionUri, 'dist'),
                ...this.customImageFolders
            ]
        };
    }

    /**
     * VS Code 탐색기에서 드롭된 이미지 파일을 프로젝트 폴더에 저장
     * - base64Data: webview에서 FileReader로 읽은 base64 데이터
     * - filePath: 파일 시스템 경로 (복사)
     */
    private async handleSaveDroppedFile(msg: any): Promise<void> {
        const requestId = msg.requestId;
        try {
            const { filename, base64Data, filePath } = msg.payload;
            if (!filename) {
                throw new Error('Filename is required');
            }

            // 대상 파일 경로 결정 (중복 시 suffix 추가)
            let finalFilename = filename;
            let targetPath = path.join(this.projectDir, finalFilename);
            let counter = 1;

            // 동일 파일인지 확인 (같은 프로젝트 내 파일이면 복사 불필요)
            if (filePath) {
                const normalizedSource = path.normalize(filePath);
                const normalizedTarget = path.normalize(targetPath);
                if (normalizedSource === normalizedTarget) {
                    // 이미 프로젝트 폴더 내 파일 → 바로 webview URI 반환
                    const fileUri = vscode.Uri.file(targetPath);
                    const webviewUri = this.webview.asWebviewUri(fileUri);
                    this.webview.postMessage({
                        type: 'images:saveDroppedFile',
                        requestId,
                        payload: { url: webviewUri.toString(), name: finalFilename }
                    });
                    return;
                }
            }

            // 파일명 중복 확인
            while (true) {
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
                    // 파일이 존재하면 suffix 추가
                    const ext = path.extname(filename);
                    const base = path.basename(filename, ext);
                    finalFilename = `${base}_${counter}${ext}`;
                    targetPath = path.join(this.projectDir, finalFilename);
                    counter++;
                } catch {
                    // 파일이 없으면 이 이름 사용
                    break;
                }
            }

            const targetUri = vscode.Uri.file(targetPath);

            if (base64Data) {
                // base64 → 바이너리 → 파일 저장
                const buffer = Buffer.from(base64Data, 'base64');
                await vscode.workspace.fs.writeFile(targetUri, buffer);
            } else if (filePath) {
                // 파일 복사
                const sourceUri = vscode.Uri.file(filePath);
                await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });
            } else {
                throw new Error('Either base64Data or filePath is required');
            }

            // webview URI 생성 및 반환
            const webviewUri = this.webview.asWebviewUri(targetUri);
            this.webview.postMessage({
                type: 'images:saveDroppedFile',
                requestId,
                payload: { url: webviewUri.toString(), name: finalFilename }
            });
        } catch (err: any) {
            this.webview.postMessage({
                type: 'images:saveDroppedFile',
                requestId,
                error: err.message || 'Save dropped file failed'
            });
        }
    }

    /**
     * VS Code 파일 선택 다이얼로그로 이미지 파일 선택
     * - 프로젝트 폴더 내 파일: 그대로 webview URI 반환
     * - 외부 파일: 프로젝트 폴더로 복사 후 webview URI 반환
     */
    private async handlePickFile(msg: any): Promise<void> {
        const requestId = msg.requestId;
        try {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']
                },
                title: '이미지 파일 선택'
            });

            if (!result || result.length === 0) {
                this.webview.postMessage({
                    type: 'images:pickFile',
                    requestId,
                    payload: { cancelled: true }
                });
                return;
            }

            const sourceUri = result[0];
            const sourcePath = sourceUri.fsPath;
            const filename = path.basename(sourcePath);

            // 프로젝트 폴더 내 파일인지 확인
            const normalizedSource = path.normalize(sourcePath);
            const normalizedProject = path.normalize(this.projectDir);

            let targetPath: string;
            let finalFilename: string;

            if (normalizedSource.startsWith(normalizedProject + path.sep) ||
                normalizedSource === normalizedProject) {
                // 이미 프로젝트 폴더 내 → 그대로 사용
                targetPath = sourcePath;
                finalFilename = path.relative(this.projectDir, sourcePath).replace(/\\/g, '/');
            } else {
                // 외부 파일 → 프로젝트 폴더로 복사 (중복 확인)
                finalFilename = filename;
                targetPath = path.join(this.projectDir, finalFilename);
                let counter = 1;

                while (true) {
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
                        const ext = path.extname(filename);
                        const base = path.basename(filename, ext);
                        finalFilename = `${base}_${counter}${ext}`;
                        targetPath = path.join(this.projectDir, finalFilename);
                        counter++;
                    } catch {
                        break;
                    }
                }

                await vscode.workspace.fs.copy(sourceUri, vscode.Uri.file(targetPath));
            }

            // localResourceRoots에 소스 폴더 추가 (필요 시)
            const sourceFolder = vscode.Uri.file(path.dirname(sourcePath));
            this.addLocalResourceRoot(sourceFolder);

            const webviewUri = this.webview.asWebviewUri(vscode.Uri.file(targetPath));
            this.webview.postMessage({
                type: 'images:pickFile',
                requestId,
                payload: { url: webviewUri.toString(), name: finalFilename }
            });
        } catch (err: any) {
            this.webview.postMessage({
                type: 'images:pickFile',
                requestId,
                error: err.message || 'Pick file failed'
            });
        }
    }

    /**
     * 에디터가 srcdoc 프리뷰용으로 주입한 인라인 태그 정리
     * - <style id="zaemit-injected-css"> → <link href="style.css"> 복원
     * - <style id="zaemit-temp-styles"> 제거 (이미 style.css에 병합됨)
     * - <script id="zaemit-injected-js"> → <script src="script.js"> 복원
     * - <script id="zaemit-link-interceptor"> 제거 (에디터 전용)
     */
    private cleanInjectedTags(html: string): string {
        let result = html;

        // 1. <style id="zaemit-injected-css">...</style> → <link href="style.css">
        const beforeCss = result;
        result = result.replace(/<style\s+id=["']zaemit-injected-css["'][^>]*>[\s\S]*?<\/style>/gi, '');
        if (result !== beforeCss) {
            // </head> 앞에 <link href="style.css"> 복원
            if (result.includes('</head>')) {
                result = result.replace('</head>', '  <link rel="stylesheet" href="style.css">\n</head>');
            }
        }

        // 2. <style id="zaemit-temp-styles">...</style> 제거
        result = result.replace(/<style\s+id=["']zaemit-temp-styles["'][^>]*>[\s\S]*?<\/style>/gi, '');

        // 3. <script id="zaemit-injected-js">...</script> → <script src="script.js">
        const beforeJs = result;
        result = result.replace(/<script\s+id=["']zaemit-injected-js["'][^>]*>[\s\S]*?<\/script>/gi, '');
        if (result !== beforeJs) {
            // </body> 앞에 <script src="script.js"> 복원
            if (result.includes('</body>')) {
                result = result.replace('</body>', '  <script src="script.js"></script>\n</body>');
            }
        }

        // 4. <script id="zaemit-link-interceptor">...</script> 제거
        result = result.replace(/<script\s+id=["']zaemit-link-interceptor["'][^>]*>[\s\S]*?<\/script>/gi, '');

        // 5. bare 링크 인터셉터 제거 (ID 없이 저장된 이전 버그 잔재)
        result = result.replace(/<script>\s*document\.addEventListener\("click",function\(e\)\{var a=e\.target\.closest\("a"\);if\(a&&a\.href\)\{e\.preventDefault\(\);\}\}\);\s*<\/script>/gi, '');

        // 빈 줄 정리 (연속 3줄 이상 → 1줄)
        result = result.replace(/\n{3,}/g, '\n\n');

        return result;
    }
}
