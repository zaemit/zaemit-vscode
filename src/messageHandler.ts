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

    constructor(
        private webview: vscode.Webview,
        private document: vscode.TextDocument,
        projectDir: string
    ) {
        this.projectDir = projectDir;
        this.fileService = new FileService(projectDir);
    }

    async handleMessage(msg: any): Promise<void> {
        if (msg.type === 'api:request') {
            await this.handleApiRequest(msg);
        } else if (msg.type === 'webview:loaded') {
            // WebView 로드 완료 → 초기 데이터 전송
            await this.sendInitData();
        } else if (msg.type === 'editor:ready') {
            console.log('[Bazix] Editor initialized in WebView');
        } else if (msg.type === 'editor:error') {
            console.error('[Bazix] Editor error:', msg.payload?.message);
            vscode.window.showErrorMessage(`Bazix Editor Error: ${msg.payload?.message}`);
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

        this.webview.postMessage({
            type: 'init',
            payload: {
                files,
                projectName,
                projectDir: this.projectDir
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
                await this.fileService.writeFile(filename, body.content);

                // index.html 저장 시 VS Code 문서도 업데이트
                if (filename === 'index.html') {
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(
                        this.document.uri,
                        new vscode.Range(0, 0, this.document.lineCount, 0),
                        body.content
                    );
                    await vscode.workspace.applyEdit(edit);
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
            return await this.fileService.listImages();
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
}
