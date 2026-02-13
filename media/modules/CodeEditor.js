import EventEmitter from './EventEmitter.js';

// CodeMirror는 별도 <script> 태그로 로드되어 window.CodeMirror에 노출됨
// esbuild IIFE 번들 실행 시점에는 아직 없을 수 있으므로 lazy 접근
function _cm() { return window.CodeMirror || {}; }

/**
 * CodeEditor - CodeMirror 6 based code editor module
 * Sets appropriate language mode based on file type and provides syntax highlighting.
 */
class CodeEditor extends EventEmitter {
    constructor(containerId = 'codeEditorContainer') {
        super();
        this.containerId = containerId;
        this.container = null;
        this.editor = null;
        this.currentFile = null;
        this.currentLanguage = 'text';
        this.isInitialized = false;
        this.updateListener = null;

        // File extension to language mode mapping
        this.languageMap = {
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'js': 'javascript',
            'json': 'javascript',
            'ts': 'javascript',
            'txt': 'text'
        };
    }

    /**
     * Initialize editor
     */
    init() {
        this.container = document.getElementById(this.containerId);

        if (!this.container) {
            console.error(`CodeEditor: Container #${this.containerId} not found`);
            return false;
        }

        this._createEditor('', 'text');
        this.isInitialized = true;
        this.emit('editor:ready');
        return true;
    }

    /**
     * Create CodeMirror editor instance
     */
    _createEditor(content, language = 'text') {
        const { EditorView, EditorState, basicSetup, html, css, javascript, oneDark } = _cm();
        if (!EditorView) {
            console.warn('CodeEditor: CodeMirror not loaded yet');
            return;
        }

        // Remove existing editor
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }

        // Initialize container
        if (this.container) {
            this.container.innerHTML = '';
        }

        // Select language extension
        const extensions = [basicSetup];

        switch (language) {
            case 'html':
                extensions.push(html());
                break;
            case 'css':
                extensions.push(css());
                break;
            case 'javascript':
                extensions.push(javascript());
                break;
            default:
                // No specific language extension, use plain text
                break;
        }

        // Add theme
        extensions.push(oneDark);

        // Change event listener (create once)
        this.updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                // Timer for debounce
                if (this._changeTimeout) {
                    clearTimeout(this._changeTimeout);
                }
                this._changeTimeout = setTimeout(() => {
                    this.emit('content:changed', {
                        content: this.getValue(),
                        file: this.currentFile
                    });
                }, 300);
            }
        });

        extensions.push(this.updateListener);

        // Create editor
        try {
            this.editor = new EditorView({
                state: EditorState.create({
                    doc: content || '',
                    extensions: extensions
                }),
                parent: this.container
            });

            this.currentLanguage = language;
        } catch (error) {
            console.error('CodeEditor: Failed to create editor', error);
            this.editor = null;
        }
    }

    /**
     * Open file
     */
    openFile(filename, content) {
        this.currentFile = filename;
        const ext = filename.split('.').pop().toLowerCase();
        const language = this.languageMap[ext] || 'text';

        this._createEditor(content || '', language);

        this.emit('file:opened', {
            filename,
            language,
            content
        });
    }

    /**
     * Get current editor content
     */
    getValue() {
        if (!this.editor) return '';
        return this.editor.state.doc.toString();
    }

    /**
     * Set editor content
     */
    setValue(content) {
        if (!this.editor) return;

        const transaction = this.editor.state.update({
            changes: {
                from: 0,
                to: this.editor.state.doc.length,
                insert: content || ''
            }
        });

        this.editor.dispatch(transaction);
    }

    /**
     * Get current filename
     */
    getCurrentFile() {
        return this.currentFile;
    }

    /**
     * Focus editor
     */
    focus() {
        if (this.editor) {
            this.editor.focus();
        }
    }

    /**
     * Remove editor
     */
    destroy() {
        // 타이머 정리
        if (this._changeTimeout) {
            clearTimeout(this._changeTimeout);
            this._changeTimeout = null;
        }

        // Remove editor
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }

        this.updateListener = null;
        this.isInitialized = false;
        this.emit('editor:destroyed');
    }

    /**
     * 읽기 전용 모드 설정
     */
    setReadOnly(readonly) {
        if (!this.editor) return;
        const { EditorState, EditorView } = _cm();
        if (!EditorState || !EditorView) return;

        const readOnlyExtension = EditorState.readOnly.of(readonly);

        this.editor.dispatch({
            effects: EditorView.appendConfig.of(readOnlyExtension)
        });
    }

    /**
     * 에디터가 초기화되었는지 확인
     */
    isReady() {
        return this.isInitialized;
    }
}

export default CodeEditor;
