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

    /** 열린 HTML 파일명 (VS Code가 열어준 파일) */
    public htmlFilename: string;

    /** HTML에서 감지된 CSS 파일명 (없으면 null) */
    public cssFilename: string | null;

    /** HTML에서 감지된 JS 파일명 (없으면 null) */
    public jsFilename: string | null;

    /** 내부 저장 시 외부 watcher 중복 방지 콜백 */
    public onInternalSave?: (filename: string) => void;

    constructor(
        private webview: vscode.Webview,
        private document: vscode.TextDocument,
        projectDir: string,
        extensionUri: vscode.Uri
    ) {
        this.projectDir = projectDir;
        this.extensionUri = extensionUri;
        this.fileService = new FileService(projectDir);

        // 열린 HTML 파일명 추출
        this.htmlFilename = path.basename(document.uri.fsPath);

        // HTML에서 CSS/JS 참조 파일명 감지
        const detected = this.detectLinkedFiles(document.getText());
        this.cssFilename = detected.cssFilename;
        this.jsFilename = detected.jsFilename;
    }

    /**
     * HTML 내용에서 로컬 CSS/JS 참조 파일명 감지
     */
    private detectLinkedFiles(htmlContent: string): { cssFilename: string | null; jsFilename: string | null } {
        let cssFilename: string | null = null;
        let jsFilename: string | null = null;

        // CSS: <link rel="stylesheet" href="xxx"> (rel과 href 순서 무관)
        const linkRegex = /<link[^>]*(?:rel=["']stylesheet["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*rel=["']stylesheet["'])[^>]*>/gi;
        let match;
        while ((match = linkRegex.exec(htmlContent)) !== null) {
            const href = match[1] || match[2];
            if (href && this.isLocalFile(href)) {
                cssFilename = href;
                break;
            }
        }

        // JS: <script src="xxx">
        const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
        while ((match = scriptRegex.exec(htmlContent)) !== null) {
            const src = match[1];
            if (src && this.isLocalFile(src)) {
                jsFilename = src;
                break;
            }
        }

        return { cssFilename, jsFilename };
    }

    /**
     * URL이 로컬 파일인지 판별 (외부 URL, CDN 제외)
     */
    private isLocalFile(url: string): boolean {
        if (!url) return false;
        // 외부 URL 제외
        if (/^(https?:|\/\/|data:|blob:)/i.test(url)) return false;
        // CDN 도메인 패턴 제외
        if (url.includes('cdn.') || url.includes('cdnjs.') || url.includes('googleapis.com')) return false;
        // node_modules 제외
        if (url.includes('node_modules/')) return false;
        // zaemit 에디터 내부 ID 제외
        if (url.includes('zaemit-')) return false;
        return true;
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
            // ★ 실제 HTML 파일명을 키로 사용
            files[this.htmlFilename] = this.document.getText();
        } catch { /* ignore */ }

        // CSS: 감지된 파일명 사용, 없으면 style.css 폴백 시도
        const cssName = this.cssFilename || 'style.css';
        try {
            const cssContent = await this.fileService.readFile(cssName);
            files[cssName] = cssContent;
        } catch { /* no css file */ }

        // JS: 감지된 파일명 사용, 없으면 script.js 폴백 시도
        const jsName = this.jsFilename || 'script.js';
        try {
            const jsContent = await this.fileService.readFile(jsName);
            files[jsName] = jsContent;
        } catch { /* no js file */ }

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
                projectBaseUri: projectBaseUri.toString(),
                // ★ 파일명 매핑 정보 추가 전달
                fileNames: {
                    html: this.htmlFilename,
                    css: this.cssFilename,  // null이면 CSS 파일 없음 → style.css 폴백
                    js: this.jsFilename     // null이면 JS 파일 없음 → script.js 폴백
                }
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
                // ★ CSS/JS 파일명 동적 감지 (에디터에서 최초 생성 시)
                // 원본 HTML에 <link>/<script src> 없이 시작해도,
                // 에디터에서 스타일/스크립트 편집 시 파일이 자동 생성됨
                if (!this.cssFilename && filename.endsWith('.css')) {
                    this.cssFilename = filename;
                }
                if (!this.jsFilename && filename.endsWith('.js')) {
                    this.jsFilename = filename;
                }

                // ★ 열린 HTML 파일 저장 시: 에디터가 주입한 인라인 태그 정리
                const content = filename === this.htmlFilename
                    ? this.cleanInjectedTags(body.content)
                    : body.content;

                if (filename === this.htmlFilename) {
                    // HTML 파일: VS Code document API를 통해서만 저장
                    // (fileService.writeFile + document.save 이중 쓰기 → "file is newer" 충돌 방지)
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
                    // CSS/JS 등 다른 파일: fileService로 디스크 직접 저장
                    this.onInternalSave?.(filename);
                    await this.fileService.writeFile(filename, content);

                    // 열려있으면 VS Code 문서도 동기화
                    const filePath = path.join(this.projectDir, filename);
                    const fileUri = vscode.Uri.file(filePath);
                    const openDoc = vscode.workspace.textDocuments.find(
                        doc => doc.uri.fsPath === fileUri.fsPath
                    );
                    if (openDoc && !openDoc.isClosed) {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            openDoc.uri,
                            new vscode.Range(0, 0, openDoc.lineCount, 0),
                            content
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
     * - <style id="zaemit-injected-css"> → <link href="실제CSS파일명"> 복원
     * - <style id="zaemit-temp-styles"> 제거 (이미 CSS 파일에 병합됨)
     * - <script id="zaemit-injected-js"> → <script src="실제JS파일명"> 복원
     * - <script id="zaemit-link-interceptor"> 제거 (에디터 전용)
     */
    private cleanInjectedTags(html: string): string {
        let result = html;

        // 1. <style id="zaemit-injected-css">...</style> 제거
        result = result.replace(/<style\s+id=["']zaemit-injected-css["'][^>]*>[\s\S]*?<\/style>/gi, '');

        // 2. <style id="zaemit-temp-styles">...</style> 제거
        result = result.replace(/<style\s+id=["']zaemit-temp-styles["'][^>]*>[\s\S]*?<\/style>/gi, '');

        // 3. CSS 파일이 존재하면 <link> 태그 확실히 복원
        // ★ 원본 HTML에 CSS 없이 시작해도, 에디터에서 스타일 편집하면 CSS 파일이 자동 생성되므로
        //    <link> 태그가 반드시 있어야 다시 열었을 때 스타일이 적용됨
        if (this.cssFilename && result.includes('</head>')) {
            const linkPattern = new RegExp(`<link[^>]*href=["']${this.cssFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
            if (!linkPattern.test(result)) {
                result = result.replace('</head>', `  <link rel="stylesheet" href="${this.cssFilename}">\n</head>`);
            }
        }

        // 4. <script id="zaemit-injected-js">...</script> 제거
        result = result.replace(/<script\s+id=["']zaemit-injected-js["'][^>]*>[\s\S]*?<\/script>/gi, '');

        // 5. <script id="zaemit-link-interceptor">...</script> 제거
        result = result.replace(/<script\s+id=["']zaemit-link-interceptor["'][^>]*>[\s\S]*?<\/script>/gi, '');

        // 6. bare 링크 인터셉터 제거 (ID 없이 저장된 이전 버그 잔재)
        result = result.replace(/<script>\s*document\.addEventListener\("click",function\(e\)\{var a=e\.target\.closest\("a"\);if\(a&&a\.href\)\{e\.preventDefault\(\);\}\}\);\s*<\/script>/gi, '');

        // 7. JS 파일이 존재하면 <script src> 태그 확실히 복원
        if (this.jsFilename && result.includes('</body>')) {
            const scriptPattern = new RegExp(`<script[^>]*src=["']${this.jsFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
            if (!scriptPattern.test(result)) {
                result = result.replace('</body>', `  <script src="${this.jsFilename}"></script>\n</body>`);
            }
        }

        // 빈 줄 정리 (연속 3줄 이상 → 1줄)
        result = result.replace(/\n{3,}/g, '\n\n');

        return result;
    }
}
