import * as vscode from 'vscode';
import { ZaemitEditorProvider } from './zaemitEditorProvider';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        ZaemitEditorProvider.register(context)
    );

    // 우클릭 메뉴: "Open with Zaemit Visual Editor"
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.openWithEditor', (uri: vscode.Uri) => {
            if (uri) {
                vscode.commands.executeCommand('vscode.openWith', uri, ZaemitEditorProvider.viewType);
            }
        })
    );

    // Status Bar에서 클릭 시 현재 HTML 파일을 Zaemit 에디터로 열기
    context.subscriptions.push(
        vscode.commands.registerCommand('zaemit.openCurrentFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('.html')) {
                vscode.commands.executeCommand('vscode.openWith', editor.document.uri, ZaemitEditorProvider.viewType);
            } else {
                vscode.window.showInformationMessage('Zaemit: HTML 파일을 열어주세요.');
            }
        })
    );

    // 하단 Status Bar 아이템 생성 (항상 표시)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(paintcan) Zaemit';
    statusBarItem.tooltip = 'Zaemit Visual Editor';
    statusBarItem.command = 'zaemit.openCurrentFile';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {}
