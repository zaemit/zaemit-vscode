import * as vscode from 'vscode';

export class ZaemitSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zaemit.menu';
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage((msg) => {
            if (msg.command === 'zaemit.openLink' && msg.url) {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
                return;
            }
            if (msg.command) {
                vscode.commands.executeCommand(msg.command);
            }
        });
    }

    private _getHtml(): string {
        const isMac = process.platform === 'darwin';
        const mod = isMac ? 'Cmd' : 'Ctrl';

        // Lucide SVG icons (stroke-based, 16x16) + Figma logo
        const icons = {
            monitor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
            figma: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 24c2.2 0 4-1.8 4-4v-4H8c-2.2 0-4 1.8-4 4s1.8 4 4 4z" fill="#0ACF83"/><path d="M4 12c0-2.2 1.8-4 4-4h4v8H8c-2.2 0-4-1.8-4-4z" fill="#A259FF"/><path d="M4 4c0-2.2 1.8-4 4-4h4v8H8C5.8 8 4 6.2 4 4z" fill="#F24E1E"/><path d="M12 0h4c2.2 0 4 1.8 4 4s-1.8 4-4 4h-4V0z" fill="#FF7262"/><path d="M20 12c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4 4 1.8 4 4z" fill="#1ABCFE"/></svg>',
            cloudDownload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8l-4-4"/><path d="M12 21l4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>',
            key: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
            trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
            plug: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/></svg>',
            keyboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>',
            menu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
            fileCode: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12l-2 2 2 2"/><path d="M14 12l2 2-2 2"/></svg>',
            bookOpen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
            github: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
            star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
            messageCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>',
            heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/></svg>',
            smartphone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
        };

        return /*html*/`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        padding: 12px 8px;
    }
    .section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
        padding: 8px 8px 4px;
        opacity: 0.7;
    }
    .menu-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 10px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: 13px;
        cursor: pointer;
        text-align: left;
    }
    .menu-btn:hover {
        background: var(--vscode-list-hoverBackground);
    }
    .menu-btn:active {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }
    .menu-btn .icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        opacity: 0.8;
    }
    .menu-btn .icon svg { width: 16px; height: 16px; }
    .menu-btn .label { flex: 1; }
    .menu-btn .shortcut {
        font-size: 11px;
        opacity: 0.5;
        flex-shrink: 0;
    }
    .divider {
        height: 1px;
        background: var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, rgba(128,128,128,0.2)));
        margin: 6px 8px;
    }
    .primary-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 8px 12px;
        margin: 4px 0;
        border: none;
        border-radius: 4px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-family: var(--vscode-font-family);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
    }
    .primary-btn:hover { background: var(--vscode-button-hoverBackground); }
    .primary-btn svg { width: 16px; height: 16px; }
    .secondary-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 7px 12px;
        margin: 4px 0;
        border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-widget-border));
        border-radius: 4px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        font-family: var(--vscode-font-family);
        font-size: 13px;
        cursor: pointer;
    }
    .secondary-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .secondary-btn svg { width: 16px; height: 16px; }
    .review-card {
        text-align: center;
        padding: 14px 12px;
        margin: 4px 0 0;
        border-radius: 6px;
        background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08));
        border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
    }
    .review-icon { margin-bottom: 6px; opacity: 0.7; }
    .review-icon svg { width: 20px; height: 20px; stroke: #e25555; }
    .review-text {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 2px;
    }
    .review-sub {
        font-size: 11px;
        opacity: 0.6;
        margin-bottom: 10px;
    }
    .review-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border: none;
        border-radius: 4px;
        background: #f5a623;
        color: #fff;
        font-family: var(--vscode-font-family);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .review-btn:hover { background: #e6951a; }
    .review-btn svg { width: 14px; height: 14px; stroke: #fff; }
</style>
</head>
<body>

<div class="section-title">Editor</div>
<button class="primary-btn" onclick="run('zaemit.openCurrentFile')">
    ${icons.monitor} Open Visual Editor
</button>

<div class="divider"></div>

<div class="section-title">Figma</div>
<button class="secondary-btn" onclick="run('zaemit.figmaImport')">
    ${icons.figma} Import from Figma
</button>
<button class="menu-btn" onclick="run('zaemit.figmaSetToken')">
    <span class="icon">${icons.key}</span>
    <span class="label">Set Figma Token</span>
</button>
<button class="menu-btn" onclick="run('zaemit.figmaRemoveToken')">
    <span class="icon">${icons.trash}</span>
    <span class="label">Remove Token</span>
</button>
<button class="secondary-btn" onclick="run('zaemit.responsiveOptimize')" style="margin-top:6px">
    ${icons.smartphone} AI Responsive Optimization
</button>

<div class="divider"></div>

<div class="section-title">Tools</div>
<button class="menu-btn" onclick="run('zaemit.showApiMenu')">
    <span class="icon">${icons.plug}</span>
    <span class="label">API Server</span>
</button>
<button class="menu-btn" onclick="run('zaemit.showShortcuts')">
    <span class="icon">${icons.keyboard}</span>
    <span class="label">Keyboard Shortcuts</span>
</button>
<button class="menu-btn" onclick="run('zaemit.openDocs')">
    <span class="icon">${icons.bookOpen}</span>
    <span class="label">Documentation</span>
</button>

<div class="divider"></div>

<div class="section-title">Shortcuts</div>
<button class="menu-btn" style="cursor:default;opacity:0.7;" disabled>
    <span class="icon">${icons.menu}</span>
    <span class="label">Zaemit Menu</span>
    <span class="shortcut">${mod}+Shift+Z</span>
</button>
<button class="menu-btn" style="cursor:default;opacity:0.7;" disabled>
    <span class="icon">${icons.fileCode}</span>
    <span class="label">Visual Editor</span>
    <span class="shortcut">${mod}+Shift+E</span>
</button>
<button class="menu-btn" style="cursor:default;opacity:0.7;" disabled>
    <span class="icon">${icons.figma}</span>
    <span class="label">Figma Import</span>
    <span class="shortcut">${mod}+Shift+F</span>
</button>

<div class="divider"></div>

<div class="section-title">Community</div>
<button class="menu-btn" onclick="link('https://github.com/zaemit/zaemit-vscode')">
    <span class="icon">${icons.github}</span>
    <span class="label">GitHub</span>
</button>
<button class="menu-btn" onclick="link('https://marketplace.visualstudio.com/items?itemName=zaemit.zaemit-visual-editor&ssr=false#qna')">
    <span class="icon">${icons.messageCircle}</span>
    <span class="label">Q&A</span>
</button>
<button class="menu-btn" onclick="link('https://github.com/zaemit/zaemit-vscode/issues')">
    <span class="icon">${icons.fileCode}</span>
    <span class="label">Report Issue</span>
</button>

<div class="divider"></div>

<div class="review-card">
    <div class="review-icon">${icons.heart}</div>
    <p class="review-text">Enjoying Zaemit?</p>
    <p class="review-sub">A review helps us grow!</p>
    <button class="review-btn" onclick="link('https://marketplace.visualstudio.com/items?itemName=zaemit.zaemit-visual-editor&ssr=false#review-details')">
        ${icons.star} Leave a Review
    </button>
</div>

<script>
    const vscode = acquireVsCodeApi();
    function run(command) {
        vscode.postMessage({ command });
    }
    function link(url) {
        vscode.postMessage({ command: 'zaemit.openLink', url: url });
    }
</script>
</body>
</html>`;
    }
}
