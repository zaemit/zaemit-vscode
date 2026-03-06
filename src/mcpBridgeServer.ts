import * as http from 'http';
import * as vscode from 'vscode';
import { openApiSpec, functionsSpec, apiDocsHtml } from './apiSpec';
import { sendEvent } from './telemetry';

/**
 * MCP Bridge Server
 *
 * Extension Host 내부에서 동작하는 작은 HTTP 서버.
 * Claude Code의 MCP 서버(mcp-server.js)가 이 HTTP 서버에 접속하여
 * 에디터 상태를 조회하고 변경 명령을 보냅니다.
 *
 * 구조:
 *   Claude Code ←stdio→ mcp-server.js ←HTTP→ MCPBridgeServer ←postMessage→ WebView
 */
export class MCPBridgeServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private webview: vscode.Webview | null = null;

    // 에디터 상태 저장소 (WebView에서 postMessage로 업데이트)
    private state = {
        selection: null as any,
        pageHtml: '' as string,
        pageUrl: '' as string,
        elementTree: [] as any[],
        projectDir: '' as string,
        connected: false,
    };

    // MCP 명령에 대한 응답 대기 (WebView에서 결과를 보내줄 때까지)
    private pendingCommands = new Map<string, {
        resolve: (value: any) => void;
        timer: ReturnType<typeof setTimeout>;
    }>();

    async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            // 랜덤 포트 사용 (0 = OS가 할당)
            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server!.address();
                if (addr && typeof addr !== 'string') {
                    this.port = addr.port;
                    console.log(`[MCP Bridge] HTTP server started on port ${this.port}`);
                    resolve(this.port);
                } else {
                    reject(new Error('Failed to get server address'));
                }
            });

            this.server.on('error', reject);
        });
    }

    getPort(): number {
        return this.port;
    }

    setWebview(webview: vscode.Webview | null) {
        this.webview = webview;
        this.state.connected = webview !== null;

        // WebView 연결 해제 시 대기 중인 명령 즉시 정리
        if (!webview) {
            for (const [id, pending] of this.pendingCommands) {
                clearTimeout(pending.timer);
                pending.resolve({ error: 'Editor disconnected' });
            }
            this.pendingCommands.clear();
        }

        sendEvent('mcp_bridge_connection', { connected: String(webview !== null) });
    }

    setProjectDir(dir: string) {
        this.state.projectDir = dir;
    }

    /**
     * WebView에서 보낸 상태 업데이트 처리
     */
    handleEditorMessage(msg: any) {
        switch (msg.type) {
            case 'mcp:selection':
                this.state.selection = msg.payload;
                break;
            case 'mcp:page-html':
                this.state.pageHtml = msg.payload;
                break;
            case 'mcp:page-url':
                this.state.pageUrl = msg.payload;
                break;
            case 'mcp:element-tree':
                this.state.elementTree = msg.payload;
                break;
            case 'mcp:command-result':
                // MCP 명령 실행 결과
                if (msg.commandId && this.pendingCommands.has(msg.commandId)) {
                    const pending = this.pendingCommands.get(msg.commandId)!;
                    clearTimeout(pending.timer);
                    this.pendingCommands.delete(msg.commandId);
                    pending.resolve(msg.payload);
                }
                break;
        }
    }

    /**
     * WebView에 MCP 명령 전송 후 결과 대기
     */
    private sendCommandToWebview(command: any): Promise<any> {
        return new Promise((resolve) => {
            if (!this.webview) {
                resolve({ error: 'No editor connected' });
                return;
            }

            const commandId = Math.random().toString(36).slice(2) + Date.now().toString(36);
            const timer = setTimeout(() => {
                this.pendingCommands.delete(commandId);
                resolve({ error: 'Command timeout' });
            }, 10000);

            this.pendingCommands.set(commandId, { resolve, timer });
            this.webview.postMessage({ ...command, commandId });
        });
    }

    /**
     * HTTP 요청 처리
     */
    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const url = req.url || '';
        const method = req.method || 'GET';

        // CORS 허용 (로컬만)
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.writeHead(200);
            res.end();
            return;
        }

        // MCP API 호출 추적 (docs/schema 제외)
        if (url.startsWith('/api/mcp/')) {
            sendEvent('mcp_api_call', { endpoint: url, method });
        }

        if (method === 'GET') {
            this.handleGet(url, res);
        } else if (method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                let parsed: any = {};
                try {
                    parsed = JSON.parse(body);
                } catch {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                    return;
                }
                this.handlePost(url, parsed, res);
            });
        } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    }

    private async handleGet(url: string, res: http.ServerResponse) {
        switch (url) {
            case '/':
            case '/docs':
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                res.end(apiDocsHtml(this.port));
                return;

            case '/openapi.json':
                res.writeHead(200);
                res.end(JSON.stringify(openApiSpec(this.port), null, 2));
                return;

            case '/functions.json':
                res.writeHead(200);
                res.end(JSON.stringify(functionsSpec(), null, 2));
                return;

            case '/api/mcp/state':
                res.writeHead(200);
                res.end(JSON.stringify({
                    selection: this.state.selection,
                    pageUrl: this.state.pageUrl,
                    projectDir: this.state.projectDir,
                    hasConnectedEditor: this.state.connected,
                }));
                break;

            case '/api/mcp/selection':
                if (!this.state.selection) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ selected: false }));
                } else {
                    res.writeHead(200);
                    res.end(JSON.stringify({ selected: true, ...this.state.selection }));
                }
                break;

            case '/api/mcp/page-html':
                res.writeHead(200);
                res.end(JSON.stringify({ html: this.state.pageHtml || '' }));
                break;

            case '/api/mcp/element-tree':
                res.writeHead(200);
                res.end(JSON.stringify({ tree: this.state.elementTree || [] }));
                break;

            case '/api/mcp/viewports':
                // 뷰포트 조회는 WebView에 직접 물어봐야 함 (동적 상태)
                if (!this.webview) {
                    res.writeHead(503);
                    res.end(JSON.stringify({ error: 'No editor connected' }));
                    return;
                }
                const vpResult = await this.sendCommandToWebview({ type: 'mcp:get-viewports', payload: {} });
                res.writeHead(200);
                res.end(JSON.stringify(vpResult));
                return;

            default:
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    private async handlePost(url: string, body: any, res: http.ServerResponse) {
        if (!this.webview) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'No editor connected' }));
            return;
        }

        let result: any;

        switch (url) {
            case '/api/mcp/update-element':
                if (!body.selector || !body.changes) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'selector and changes required' }));
                    return;
                }
                result = await this.sendCommandToWebview({
                    type: 'mcp:update-element',
                    payload: { selector: body.selector, changes: body.changes }
                });
                break;

            case '/api/mcp/replace-html':
                if (!body.selector || body.html === undefined) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'selector and html required' }));
                    return;
                }
                result = await this.sendCommandToWebview({
                    type: 'mcp:replace-html',
                    payload: { selector: body.selector, html: body.html }
                });
                break;

            case '/api/mcp/insert-element':
                if (!body.parentSelector || !body.html) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'parentSelector and html required' }));
                    return;
                }
                result = await this.sendCommandToWebview({
                    type: 'mcp:insert-element',
                    payload: { parentSelector: body.parentSelector, html: body.html, position: body.position || 'beforeend' }
                });
                break;

            case '/api/mcp/delete-element':
                if (!body.selector) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'selector required' }));
                    return;
                }
                result = await this.sendCommandToWebview({
                    type: 'mcp:delete-element',
                    payload: { selector: body.selector }
                });
                break;

            case '/api/mcp/toggle-viewport':
                if (!body.width) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'width required' }));
                    return;
                }
                result = await this.sendCommandToWebview({
                    type: 'mcp:toggle-viewport',
                    payload: { width: body.width, enabled: body.enabled }
                });
                break;

            case '/api/mcp/set-active-view':
                if (!body.width) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'width required' }));
                    return;
                }
                result = await this.sendCommandToWebview({
                    type: 'mcp:set-active-view',
                    payload: { width: body.width }
                });
                break;

            case '/api/mcp/toggle-multiview':
                result = await this.sendCommandToWebview({
                    type: 'mcp:toggle-multiview',
                    payload: { enabled: body.enabled }
                });
                break;

            case '/api/mcp/reload-page':
                result = await this.sendCommandToWebview({
                    type: 'mcp:reload-page',
                    payload: {}
                });
                break;

            default:
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
                return;
        }

        const hasError = result?.error;
        if (hasError) {
            sendEvent('mcp_command_error', { endpoint: url, error: String(result.error) });
        }

        res.writeHead(200);
        res.end(JSON.stringify(result || { success: true }));
    }

    stop() {
        for (const [, pending] of this.pendingCommands) {
            clearTimeout(pending.timer);
        }
        this.pendingCommands.clear();

        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
