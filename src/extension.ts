import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ZaemitEditorProvider } from './zaemitEditorProvider';
import { MCPBridgeServer } from './mcpBridgeServer';
import { autoSetupMcp } from './mcpAutoSetup';
import { initTelemetry, sendEvent, disposeTelemetry } from './telemetry';

let statusBarItem: vscode.StatusBarItem;
let apiStatusBarItem: vscode.StatusBarItem;
export const mcpBridgeServer = new MCPBridgeServer();

export function activate(context: vscode.ExtensionContext) {
    // 텔레메트리 초기화 (VS Code 설정 자동 존중)
    initTelemetry(context);

    // MCP Bridge HTTP 서버 시작
    mcpBridgeServer.start().then((port) => {
        // 포트 파일에 기록 (MCP 서버가 읽을 수 있도록)
        const portFile = path.join(os.tmpdir(), 'zaemit-mcp-port');
        fs.writeFileSync(portFile, String(port));
        console.log(`[Zaemit] MCP Bridge server on port ${port}`);

        // API 상태바 표시
        apiStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        apiStatusBarItem.text = `$(plug) API :${port}`;
        apiStatusBarItem.tooltip = `Zaemit API running on http://127.0.0.1:${port}\nClick for options`;
        apiStatusBarItem.command = 'zaemit.showApiMenu';
        apiStatusBarItem.show();
        context.subscriptions.push(apiStatusBarItem);
    }).catch((err) => {
        console.error('[Zaemit] Failed to start MCP Bridge server:', err);
    });

    // API 메뉴 커맨드
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.showApiMenu', async () => {
            const port = mcpBridgeServer.getPort();
            const baseUrl = `http://127.0.0.1:${port}`;
            const pick = await vscode.window.showQuickPick([
                { label: '$(globe) Open API Docs in Browser', detail: `${baseUrl}/docs`, action: 'open-docs' },
                { label: '$(copy) Copy Base URL', detail: baseUrl, action: 'copy-url' },
                { label: '$(json) Copy OpenAPI Schema URL', detail: `${baseUrl}/openapi.json`, action: 'copy-openapi' },
                { label: '$(symbol-function) Copy Functions Schema URL', detail: `${baseUrl}/functions.json`, action: 'copy-functions' },
                { label: '$(terminal) Copy curl test command', detail: `curl ${baseUrl}/api/mcp/state`, action: 'copy-curl' },
            ], { title: 'Zaemit API', placeHolder: 'Select an action' });

            if (!pick) { return; }
            switch ((pick as any).action) {
                case 'open-docs':
                    vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/docs`));
                    break;
                case 'copy-url':
                    await vscode.env.clipboard.writeText(baseUrl);
                    vscode.window.showInformationMessage(`Copied: ${baseUrl}`);
                    break;
                case 'copy-openapi':
                    await vscode.env.clipboard.writeText(`${baseUrl}/openapi.json`);
                    vscode.window.showInformationMessage('OpenAPI schema URL copied!');
                    break;
                case 'copy-functions':
                    await vscode.env.clipboard.writeText(`${baseUrl}/functions.json`);
                    vscode.window.showInformationMessage('Functions schema URL copied!');
                    break;
                case 'copy-curl':
                    await vscode.env.clipboard.writeText(`curl ${baseUrl}/api/mcp/state`);
                    vscode.window.showInformationMessage('curl command copied!');
                    break;
            }
        })
    );

    context.subscriptions.push(
        ZaemitEditorProvider.register(context)
    );

    // 우클릭 메뉴: "Open with Zaemit Visual Editor"
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.openWithEditor', (uri: vscode.Uri) => {
            if (uri) {
                sendEvent('editor_opened', { source: 'context_menu' });
                vscode.commands.executeCommand('vscode.openWith', uri, ZaemitEditorProvider.viewType);
            }
        })
    );

    // Status Bar에서 클릭 시 현재 HTML 파일을 Zaemit 에디터로 열기
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.openCurrentFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('.html')) {
                sendEvent('editor_opened', { source: 'statusbar' });
                vscode.commands.executeCommand('vscode.openWith', editor.document.uri, ZaemitEditorProvider.viewType);
            } else {
                vscode.window.showInformationMessage('Zaemit: HTML 파일을 열어주세요.');
            }
        })
    );

    // AI 도구 연동 자동 설정 (.mcp.json, CLAUDE.md)
    autoSetupMcp(context);

    // 하단 Status Bar 아이템 생성 (항상 표시)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(paintcan) Zaemit';
    statusBarItem.tooltip = 'Zaemit Visual Editor';
    statusBarItem.command = 'zaemit.openCurrentFile';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    disposeTelemetry();
    mcpBridgeServer.stop();
    // 포트 파일 정리
    try {
        const portFile = path.join(os.tmpdir(), 'zaemit-mcp-port');
        fs.unlinkSync(portFile);
    } catch {}
}
