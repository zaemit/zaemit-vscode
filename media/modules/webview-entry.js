/**
 * WebView Entry Point for Zaemit VS Code Extension
 *
 * VSCodeBridge.js가 먼저 로드된 후 이 스크립트가 실행됩니다.
 * EditorApp을 초기화하고 VS Code Extension Host와 통신합니다.
 */
import EditorApp from './EditorApp.js';

let editorInstance = null;

function dismissSplash() {
    if (document.body.classList.contains('editor-ready')) return;
    document.body.classList.add('editor-ready');
    const splash = document.getElementById('zaemitSplash');
    if (splash) {
        splash.classList.add('fade-out');
        splash.addEventListener('transitionend', () => splash.remove(), { once: true });
        // transitionend가 안 뜨는 경우 대비
        setTimeout(() => { if (splash.parentNode) splash.remove(); }, 500);
    }
}

async function initializeEditor() {
    const bridge = window.vscBridge;
    if (!bridge) {
        console.error('[Zaemit] VSCodeBridge not found');
        dismissSplash();
        return;
    }

    // 안전장치: bridge.onReady가 호출 안 되는 경우 대비 (최대 8초)
    const splashTimeout = setTimeout(() => {
        console.warn('[Zaemit] Splash safety timeout — forcing dismiss');
        dismissSplash();
    }, 8000);

    // bridge가 준비될 때까지 대기 (init 메시지 수신 후)
    bridge.onReady(async () => {
        try {
            console.log('[Zaemit] Initializing editor...');
            editorInstance = new EditorApp();
            await editorInstance.init();
            window.editor = editorInstance;
            console.log('[Zaemit] Editor initialized successfully');

            clearTimeout(splashTimeout);
            dismissSplash();

            // Extension Host에 준비 완료 알림
            bridge.postMessage({ type: 'editor:ready' });
        } catch (error) {
            console.error('[Zaemit] Failed to initialize editor:', error);
            clearTimeout(splashTimeout);
            dismissSplash();
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
