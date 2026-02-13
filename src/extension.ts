import * as vscode from 'vscode';
import { BazixEditorProvider } from './bazixEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        BazixEditorProvider.register(context)
    );
}

export function deactivate() {}
