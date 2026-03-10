// CodeMirror 6 Bundle Source
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';

// CodeMirror Editor Wrapper Class
class CodeMirrorEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.view = null;
        this.currentLanguage = 'text';
        this._updateCallbacks = [];
    }

    init() {
        this._createEditor('', 'text');
        return Promise.resolve();
    }

    _createEditor(content, language) {
        // Clear existing view
        if (this.view) {
            this.view.destroy();
        }
        this.container.innerHTML = '';

        // Get language extension
        const langExt = this._getLanguageExtension(language);

        // Build extensions
        const extensions = [basicSetup, oneDark];

        if (langExt) {
            extensions.push(langExt);
        }

        extensions.push(EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                this._updateCallbacks.forEach(cb => cb(update));
            }
        }));

        // Create editor
        this.view = new EditorView({
            doc: content,
            extensions: extensions,
            parent: this.container
        });

        this.currentLanguage = language;
    }

    _getLanguageExtension(language) {
        switch (language) {
            case 'javascript':
            case 'js':
            case 'json':
                return javascript();
            case 'html':
            case 'htm':
                return html();
            case 'css':
                return css();
            default:
                return null;
        }
    }

    setLanguage(language) {
        if (this.currentLanguage !== language && this.view) {
            const content = this.getValue();
            this._createEditor(content, language);
        }
    }

    getValue() {
        return this.view ? this.view.state.doc.toString() : '';
    }

    setValue(content) {
        if (this.view) {
            this._createEditor(content || '', this.currentLanguage);
        }
    }

    onUpdate(callback) {
        this._updateCallbacks.push(callback);
    }

    focus() {
        if (this.view) {
            this.view.focus();
        }
    }

    destroy() {
        if (this.view) {
            this.view.destroy();
            this.view = null;
        }
    }
}

// Export
window.CodeMirrorEditor = CodeMirrorEditor;
export { CodeMirrorEditor };
