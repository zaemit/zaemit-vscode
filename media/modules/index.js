import EditorApp from './EditorApp.js';

let editorInstance = null;

async function initializeEditor() {
    try {
        editorInstance = new EditorApp();
        await editorInstance.init();

        window.editor = editorInstance;
    } catch (error) {
        console.error('Failed to initialize editor:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEditor);
} else {
    initializeEditor();
}

export { editorInstance, initializeEditor };
export default EditorApp;
