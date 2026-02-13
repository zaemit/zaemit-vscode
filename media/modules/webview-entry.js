/**
 * WebView Entry Point for Bazix VS Code Extension
 *
 * VSCodeBridge.js가 먼저 로드된 후 이 스크립트가 실행됩니다.
 * EditorApp을 초기화하고 VS Code Extension Host와 통신합니다.
 */
import EditorApp from './EditorApp.js';

let editorInstance = null;

async function initializeEditor() {
    const bridge = window.vscBridge;
    if (!bridge) {
        console.error('[Bazix] VSCodeBridge not found');
        return;
    }

    // bridge가 준비될 때까지 대기 (init 메시지 수신 후)
    bridge.onReady(async () => {
        try {
            console.log('[Bazix] Initializing editor...');
            editorInstance = new EditorApp();
            await editorInstance.init();
            window.editor = editorInstance;
            console.log('[Bazix] Editor initialized successfully');

            // Extension Host에 준비 완료 알림
            bridge.postMessage({ type: 'editor:ready' });
        } catch (error) {
            console.error('[Bazix] Failed to initialize editor:', error);
            bridge.postMessage({
                type: 'editor:error',
                payload: { message: error.message }
            });
        }
    });

    // Extension Host에 WebView 로드 완료 알림
    bridge.postMessage({ type: 'webview:loaded' });
}

// DOM 준비 상태에 따라 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEditor);
} else {
    initializeEditor();
}

export { editorInstance, initializeEditor };
