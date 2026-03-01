import * as vscode from 'vscode';
import * as path from 'path';
import { MessageHandler } from './messageHandler';

export class ZaemitEditorProvider implements vscode.CustomTextEditorProvider {

    public static readonly viewType = 'zaemit.visualEditor';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            ZaemitEditorProvider.viewType,
            new ZaemitEditorProvider(context),
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        );
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const projectDir = path.dirname(document.uri.fsPath);
        const mediaPath = vscode.Uri.joinPath(this.context.extensionUri, 'media');

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(projectDir),
                mediaPath,
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ]
        };

        // 에디터 탭에 Z 로고 아이콘 표시
        webviewPanel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icons', 'zaemit-icon-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icons', 'zaemit-icon-dark.svg')
        };

        // WebView HTML 로드 및 URI 치환
        webviewPanel.webview.html = await this.getWebviewContent(
            webviewPanel.webview,
            projectDir
        );

        // 메시지 핸들러 설정
        const messageHandler = new MessageHandler(
            webviewPanel.webview,
            document,
            projectDir,
            this.context.extensionUri
        );

        webviewPanel.webview.onDidReceiveMessage(
            (msg) => messageHandler.handleMessage(msg)
        );

        // 문서 외부 변경 감지 (에디터 내부 저장은 무시)
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (messageHandler.isApplyingEdit) { return; }
            if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
                webviewPanel.webview.postMessage({
                    type: 'file:externalChange',
                    payload: { filename: messageHandler.htmlFilename, content: document.getText() }
                });
            }
        });

        // ★ CSS/JS 파일 외부 변경 감지 (FileSystemWatcher)
        // 사용자가 VS Code 텍스트 에디터에서 CSS/JS를 수정하면 비주얼 에디터에 반영
        const cssJsWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(projectDir, '**/*.{css,js}')
        );

        // 내부 저장 중복 방지 (파일명 기반 추적)
        const pendingSaves = new Set<string>();
        messageHandler.onInternalSave = (filename: string) => {
            pendingSaves.add(filename);
            setTimeout(() => pendingSaves.delete(filename), 1000);
        };

        const handleCssJsChange = async (uri: vscode.Uri) => {
            const filename = path.relative(projectDir, uri.fsPath).replace(/\\/g, '/');
            if (pendingSaves.has(filename) || pendingSaves.has(path.basename(uri.fsPath))) return;
            try {
                const content = Buffer.from(
                    await vscode.workspace.fs.readFile(uri)
                ).toString('utf-8');
                webviewPanel.webview.postMessage({
                    type: 'file:externalChange',
                    payload: { filename, content }
                });
            } catch (e) {
                // 파일 삭제된 경우 무시
            }
        };

        cssJsWatcher.onDidChange(handleCssJsChange);
        cssJsWatcher.onDidCreate(handleCssJsChange);

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            cssJsWatcher.dispose();
        });
    }

    private async getWebviewContent(
        webview: vscode.Webview,
        projectDir: string
    ): Promise<string> {
        const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');

        // editor.html 읽기
        const htmlPath = vscode.Uri.joinPath(mediaUri, 'editor.html');
        const htmlBytes = await vscode.workspace.fs.readFile(htmlPath);
        let html = Buffer.from(htmlBytes).toString('utf-8');

        // WebView URI 생성
        const editorCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'editor.css'));
        const codemirrorCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'lib', 'codemirror', 'codemirror.css'));
        const bridgeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'bridge.js'));
        const codemirrorJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'lib', 'codemirror', 'codemirror.js'));
        const webviewJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));

        // CSP 설정
        const cspContent = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net`,
            `script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'`,
            `img-src ${webview.cspSource} https: data: blob:`,
            `font-src ${webview.cspSource} https: data:`,
            `frame-src blob: data: ${webview.cspSource}`,
            `connect-src ${webview.cspSource} https: data: blob:`
        ].join('; ');

        // 플레이스홀더 치환
        html = html.replace('{{cspContent}}', cspContent);
        html = html.replace('{{editorCssUri}}', editorCssUri.toString());
        html = html.replace('{{codemirrorCssUri}}', codemirrorCssUri.toString());
        html = html.replace('{{bridgeUri}}', bridgeUri.toString());
        html = html.replace('{{codemirrorJsUri}}', codemirrorJsUri.toString());
        html = html.replace('{{webviewJsUri}}', webviewJsUri.toString());

        return html;
    }
}
