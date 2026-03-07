import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ZaemitEditorProvider } from './zaemitEditorProvider';
import { MCPBridgeServer } from './mcpBridgeServer';
import { autoSetupMcp } from './mcpAutoSetup';
import { initTelemetry, sendEvent, disposeTelemetry } from './telemetry';
import { registerFigmaCommands, runResponsiveOptimization } from './figmaImport';
import { ZaemitSidebarProvider } from './sidebarProvider';

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

    // ── Zaemit 메인 메뉴 ──
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.showMainMenu', async () => {
            const port = mcpBridgeServer.getPort();
            const items: (vscode.QuickPickItem & { action: string })[] = [
                { label: '$(file-code) 현재 파일 비주얼 에디터로 열기', description: 'Ctrl+Shift+E', action: 'open-editor' },
                { label: '', kind: vscode.QuickPickItemKind.Separator, action: '', description: '' },
                { label: '$(cloud-download) Figma에서 디자인 가져오기', description: 'Ctrl+Shift+F', action: 'figma-import' },
                { label: '$(key) Figma 토큰 설정', action: 'figma-token' },
                { label: '', kind: vscode.QuickPickItemKind.Separator, action: '', description: '' },
                { label: '$(plug) API 서버 옵션', description: port ? `Port ${port}` : 'Not running', action: 'api-menu' },
                { label: '', kind: vscode.QuickPickItemKind.Separator, action: '', description: '' },
                { label: '$(keyboard) 단축키 보기', action: 'shortcuts' },
                { label: '$(book) 문서 보기', action: 'docs' },
            ];

            const pick = await vscode.window.showQuickPick(items, {
                title: '$(paintcan) Zaemit Visual Editor',
                placeHolder: '원하는 기능을 선택하세요',
            });

            if (!pick) { return; }
            switch (pick.action) {
                case 'open-editor':
                    vscode.commands.executeCommand('zaemit.openCurrentFile');
                    break;
                case 'figma-import':
                    vscode.commands.executeCommand('zaemit.figmaImport');
                    break;
                case 'figma-token':
                    vscode.commands.executeCommand('zaemit.figmaSetToken');
                    break;
                case 'api-menu':
                    vscode.commands.executeCommand('zaemit.showApiMenu');
                    break;
                case 'shortcuts':
                    vscode.commands.executeCommand('zaemit.showShortcuts');
                    break;
                case 'docs':
                    vscode.env.openExternal(vscode.Uri.parse('https://zaemit.github.io/zaemit-vscode/'));
                    break;
            }
        })
    );

    // ── 단축키 보기 ──
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.showShortcuts', async () => {
            const isMac = process.platform === 'darwin';
            const mod = isMac ? 'Cmd' : 'Ctrl';
            const shortcuts = [
                { label: `$(paintcan) Zaemit 메뉴 열기`, description: `${mod}+Shift+Z` },
                { label: `$(file-code) 비주얼 에디터 열기`, description: `${mod}+Shift+E`, detail: 'HTML 파일이 열려있을 때' },
                { label: `$(cloud-download) Figma Import`, description: `${mod}+Shift+F` },
            ];

            await vscode.window.showQuickPick(shortcuts, {
                title: '$(keyboard) Zaemit 단축키',
                placeHolder: '단축키 목록입니다. ESC로 닫으세요.',
            });
        })
    );

    // 문서 열기
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.openDocs', () => {
            vscode.env.openExternal(vscode.Uri.parse('https://zaemit.github.io/zaemit-vscode/'));
        })
    );

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

    // Figma Import 커맨드 등록
    registerFigmaCommands(context);

    // 반응형 최적화 커맨드 (사이드바, 에디터 버튼에서 재호출 가능)
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.responsiveOptimize', () => runResponsiveOptimization())
    );

    // 사이드바 패널 등록
    const sidebarProvider = new ZaemitSidebarProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ZaemitSidebarProvider.viewType, sidebarProvider)
    );

    // AI 도구 연동 자동 설정 (.mcp.json, CLAUDE.md)
    autoSetupMcp(context);

    // 하단 Status Bar: 메인 메뉴 버튼 (항상 표시)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(paintcan) Zaemit';
    statusBarItem.tooltip = 'Zaemit 메뉴 열기 (Ctrl+Shift+Z)';
    statusBarItem.command = 'zaemit.showMainMenu';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 하단 Status Bar: Figma Import 버튼
    const figmaStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    figmaStatusBarItem.text = '$(cloud-download) Figma';
    figmaStatusBarItem.tooltip = 'Figma에서 디자인 가져오기 (Ctrl+Shift+F)';
    figmaStatusBarItem.command = 'zaemit.figmaImport';
    figmaStatusBarItem.show();
    context.subscriptions.push(figmaStatusBarItem);
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
