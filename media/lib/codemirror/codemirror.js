/**
 * CodeMirror-like Editor for Bazix Editor
 * MIT License
 *
 * Features:
 * - Syntax highlighting (basic)
 * - Auto-completion for HTML, CSS, JavaScript
 * - Line numbers
 * - Auto-closing brackets and tags
 * - Tab support
 */

// CodeMirror Core State
const Text = {
    of(text) {
        if (typeof text === 'string') text = text.split(/\r\n?|\n/);
        return new TextImpl(text);
    }
};

class TextImpl {
    constructor(lines) {
        this.lines = lines;
    }
    get length() {
        let len = 0;
        for (let line of this.lines) len += line.length;
        return len + this.lines.length - 1;
    }
    toString() {
        return this.lines.join('\n');
    }
    sliceString(from, to) {
        return this.toString().slice(from, to);
    }
}

// Simple EditorState
class EditorState {
    constructor(config) {
        this.doc = typeof config.doc === 'string' ? Text.of(config.doc) : config.doc;
        this.extensions = config.extensions || [];
        this.selection = { main: { from: 0, to: 0 } };
    }

    static create(config) {
        return new EditorState(config);
    }

    get sliceDoc() {
        return (from, to) => this.doc.sliceString(from, to);
    }
}

// Auto-completion data
const COMPLETIONS = {
    html: {
        tags: [
            'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote', 'body',
            'br', 'button', 'canvas', 'caption', 'code', 'col', 'colgroup', 'data', 'dd',
            'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset',
            'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
            'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'meta', 'meter', 'nav',
            'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre',
            'progress', 'q', 's', 'samp', 'script', 'section', 'select', 'small', 'source',
            'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td',
            'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track',
            'u', 'ul', 'var', 'video', 'wbr'
        ],
        attributes: {
            global: ['id', 'class', 'style', 'title', 'lang', 'dir', 'tabindex', 'hidden',
                'data-', 'aria-', 'role', 'onclick', 'onload', 'onchange', 'onsubmit'],
            a: ['href', 'target', 'rel', 'download', 'hreflang', 'type'],
            img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
            input: ['type', 'name', 'value', 'placeholder', 'required', 'disabled', 'readonly',
                'min', 'max', 'step', 'pattern', 'autocomplete', 'checked'],
            form: ['action', 'method', 'enctype', 'target', 'novalidate'],
            button: ['type', 'disabled', 'name', 'value'],
            link: ['href', 'rel', 'type', 'media'],
            meta: ['name', 'content', 'charset', 'http-equiv'],
            script: ['src', 'type', 'async', 'defer', 'crossorigin'],
            style: ['type', 'media'],
            iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'sandbox'],
            video: ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'width', 'height'],
            audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
            select: ['name', 'multiple', 'required', 'disabled', 'size'],
            textarea: ['name', 'rows', 'cols', 'placeholder', 'required', 'disabled', 'readonly'],
            table: ['border', 'cellpadding', 'cellspacing'],
            td: ['colspan', 'rowspan'],
            th: ['colspan', 'rowspan', 'scope']
        }
    },
    css: {
        properties: [
            'align-content', 'align-items', 'align-self', 'animation', 'animation-delay',
            'animation-direction', 'animation-duration', 'animation-fill-mode', 'animation-name',
            'animation-timing-function', 'background', 'background-color', 'background-image',
            'background-position', 'background-repeat', 'background-size', 'border', 'border-bottom',
            'border-color', 'border-left', 'border-radius', 'border-right', 'border-style',
            'border-top', 'border-width', 'bottom', 'box-shadow', 'box-sizing', 'color', 'cursor',
            'display', 'filter', 'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow',
            'flex-shrink', 'flex-wrap', 'float', 'font', 'font-family', 'font-size', 'font-style',
            'font-weight', 'gap', 'grid', 'grid-column', 'grid-gap', 'grid-row', 'grid-template-columns',
            'grid-template-rows', 'height', 'justify-content', 'left', 'letter-spacing', 'line-height',
            'list-style', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
            'max-height', 'max-width', 'min-height', 'min-width', 'object-fit', 'opacity', 'order',
            'outline', 'overflow', 'overflow-x', 'overflow-y', 'padding', 'padding-bottom',
            'padding-left', 'padding-right', 'padding-top', 'position', 'right', 'text-align',
            'text-decoration', 'text-indent', 'text-overflow', 'text-shadow', 'text-transform',
            'top', 'transform', 'transition', 'vertical-align', 'visibility', 'white-space',
            'width', 'word-break', 'word-spacing', 'word-wrap', 'z-index'
        ],
        values: {
            display: ['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'contents'],
            position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
            'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
            'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
            'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
            'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
            'align-content': ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around'],
            'text-align': ['left', 'right', 'center', 'justify'],
            'text-decoration': ['none', 'underline', 'overline', 'line-through'],
            'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
            'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            'font-style': ['normal', 'italic', 'oblique'],
            overflow: ['visible', 'hidden', 'scroll', 'auto'],
            visibility: ['visible', 'hidden', 'collapse'],
            cursor: ['auto', 'default', 'pointer', 'wait', 'text', 'move', 'not-allowed', 'crosshair', 'grab', 'grabbing'],
            'box-sizing': ['content-box', 'border-box'],
            'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line']
        },
        units: ['px', 'em', 'rem', '%', 'vw', 'vh', 'vmin', 'vmax', 'ch', 'ex', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'rad', 'turn', 's', 'ms'],
        colors: ['transparent', 'currentColor', 'inherit', 'initial', 'unset', 'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey']
    },
    javascript: {
        keywords: [
            'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
            'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
            'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'static', 'super',
            'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'
        ],
        builtins: [
            'Array', 'Boolean', 'console', 'Date', 'document', 'Error', 'Function', 'JSON',
            'localStorage', 'Map', 'Math', 'Number', 'Object', 'Promise', 'RegExp', 'Set',
            'sessionStorage', 'String', 'Symbol', 'window', 'fetch', 'setTimeout', 'setInterval',
            'clearTimeout', 'clearInterval', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
            'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent', 'alert', 'confirm', 'prompt'
        ],
        methods: {
            console: ['log', 'error', 'warn', 'info', 'debug', 'table', 'clear', 'group', 'groupEnd', 'time', 'timeEnd'],
            document: ['getElementById', 'getElementsByClassName', 'getElementsByTagName', 'querySelector', 'querySelectorAll', 'createElement', 'createTextNode', 'addEventListener', 'removeEventListener'],
            Array: ['push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join', 'reverse', 'sort', 'filter', 'map', 'reduce', 'forEach', 'find', 'findIndex', 'includes', 'indexOf', 'every', 'some', 'flat', 'flatMap'],
            String: ['charAt', 'charCodeAt', 'concat', 'includes', 'indexOf', 'lastIndexOf', 'match', 'replace', 'replaceAll', 'search', 'slice', 'split', 'substring', 'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd'],
            Object: ['keys', 'values', 'entries', 'assign', 'freeze', 'seal', 'create', 'defineProperty', 'hasOwnProperty'],
            Math: ['abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sqrt', 'random', 'sin', 'cos', 'tan', 'PI', 'E'],
            JSON: ['parse', 'stringify'],
            Promise: ['resolve', 'reject', 'all', 'race', 'allSettled', 'any']
        }
    }
};

// Auto-closing pairs
const AUTO_CLOSE = {
    '(': ')',
    '[': ']',
    '{': '}',
    '"': '"',
    "'": "'",
    '`': '`',
    '<': '>'
};

// EditorView - Main editor class
class EditorView {
    constructor(config) {
        this.parent = config.parent;
        this.state = config.state || EditorState.create({ doc: config.doc || '' });
        this._updateListeners = [];
        this.dom = null;
        this._textarea = null;
        this._lineNumbers = null;
        this._autocomplete = null;

        // Extract language from extensions
        this._language = 'text';
        if (this.state.extensions) {
            const langExtension = this.state.extensions.find(ext => ext.type === 'language');
            if (langExtension) {
                this._language = langExtension.name;
            }
        }

        this._completions = [];
        this._selectedCompletion = 0;

        this._init(config);
    }

    _init(config) {
        // Create editor container
        this.dom = document.createElement('div');
        this.dom.className = 'cm-editor';

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'cm-scroller';

        // Create line numbers
        this._lineNumbers = document.createElement('div');
        this._lineNumbers.className = 'cm-line-numbers';

        // Create content wrapper for syntax highlighting
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'cm-content-wrapper';

        // Create highlight layer (behind textarea)
        this._highlight = document.createElement('pre');
        this._highlight.className = 'cm-highlight';

        // Create textarea for actual editing
        this._textarea = document.createElement('textarea');
        this._textarea.className = 'cm-content';
        this._textarea.value = this.state.doc.toString();
        this._textarea.spellcheck = false;
        this._textarea.autocomplete = 'off';
        this._textarea.autocorrect = 'off';
        this._textarea.autocapitalize = 'off';
        this._textarea.wrap = 'off';

        contentWrapper.appendChild(this._highlight);
        contentWrapper.appendChild(this._textarea);
        this._contentWrapper = contentWrapper;

        // Create autocomplete dropdown
        this._autocomplete = document.createElement('div');
        this._autocomplete.className = 'cm-autocomplete';
        this._autocomplete.style.display = 'none';

        // Handle input
        this._textarea.addEventListener('input', (e) => {
            this._handleInput(e);
        });

        // Handle keydown
        this._textarea.addEventListener('keydown', (e) => {
            this._handleKeydown(e);
        });

        // Handle scroll sync
        this._textarea.addEventListener('scroll', () => {
            this._lineNumbers.scrollTop = this._textarea.scrollTop;
            this._highlight.scrollTop = this._textarea.scrollTop;
            this._highlight.scrollLeft = this._textarea.scrollLeft;
        });

        // Handle click to hide autocomplete
        this._textarea.addEventListener('click', () => {
            this._hideAutocomplete();
        });

        // Handle blur to hide autocomplete
        this._textarea.addEventListener('blur', (e) => {
            // Delay to allow click on autocomplete item
            setTimeout(() => {
                if (!this._autocomplete.contains(document.activeElement)) {
                    this._hideAutocomplete();
                }
            }, 150);
        });

        wrapper.appendChild(this._lineNumbers);
        wrapper.appendChild(this._contentWrapper);
        this.dom.appendChild(wrapper);
        this.dom.appendChild(this._autocomplete);

        if (this.parent) {
            this.parent.appendChild(this.dom);
        }

        // Initial line numbers and syntax highlight
        this._updateLineNumbers();
        this._updateHighlight();

        // Add styles
        this._injectStyles();
    }

    _injectStyles() {
        if (document.getElementById('cm-styles')) return;

        const style = document.createElement('style');
        style.id = 'cm-styles';
        style.textContent = `
            .cm-editor {
                position: relative;
                height: 100%;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.5;
                background: #1e1e2e;
                color: #cdd6f4;
            }
            .cm-scroller {
                display: flex;
                height: 100%;
                overflow: hidden;
            }
            .cm-line-numbers {
                flex-shrink: 0;
                width: 50px;
                padding: 10px 8px 10px 0;
                text-align: right;
                color: #6c7086;
                background: #1e1e2e;
                border-right: 1px solid #313244;
                overflow: hidden;
                user-select: none;
                font-family: inherit;
                font-size: inherit;
                line-height: inherit;
                white-space: pre;
            }
            .cm-content-wrapper {
                flex: 1;
                position: relative;
                overflow: hidden;
            }
            .cm-highlight {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                padding: 10px;
                margin: 0;
                border: none;
                font-family: inherit;
                font-size: inherit;
                line-height: inherit;
                white-space: pre;
                overflow: auto;
                tab-size: 4;
                pointer-events: none;
                user-select: none;
                color: #cdd6f4;
            }
            .cm-content {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                padding: 10px;
                margin: 0;
                border: none;
                outline: none;
                resize: none;
                background: transparent;
                color: transparent;
                caret-color: #cdd6f4;
                font-family: inherit;
                font-size: inherit;
                line-height: inherit;
                white-space: pre;
                overflow: auto;
                tab-size: 4;
                -webkit-text-fill-color: transparent;
            }
            /* Syntax highlighting colors */
            .cm-highlight .tag { color: #f38ba8 !important; }
            .cm-highlight .attr-name { color: #fab387 !important; }
            .cm-highlight .attr-value { color: #a6e3a1 !important; }
            .cm-highlight .string { color: #a6e3a1 !important; }
            .cm-highlight .comment { color: #6c7086 !important; font-style: italic; }
            .cm-highlight .keyword { color: #cba6f7 !important; }
            .cm-highlight .number { color: #fab387 !important; }
            .cm-highlight .property { color: #89b4fa !important; }
            .cm-highlight .value { color: #f9e2af !important; }
            .cm-highlight .selector { color: #f38ba8 !important; }
            .cm-highlight .function { color: #89dceb !important; }
            .cm-highlight .operator { color: #94e2d5 !important; }
            .cm-highlight .punctuation { color: #cdd6f4 !important; }
            .cm-autocomplete {
                position: absolute;
                background: #313244;
                border: 1px solid #45475a;
                border-radius: 6px;
                max-height: 200px;
                overflow-y: auto;
                z-index: 100;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                min-width: 180px;
            }
            .cm-autocomplete-item {
                padding: 6px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .cm-autocomplete-item:hover,
            .cm-autocomplete-item.selected {
                background: #45475a;
            }
            .cm-autocomplete-item .type {
                font-size: 10px;
                padding: 2px 4px;
                border-radius: 3px;
                background: #585b70;
                color: #cdd6f4;
            }
            .cm-autocomplete-item .type.tag { background: #f38ba8; color: #1e1e2e; }
            .cm-autocomplete-item .type.attr { background: #a6e3a1; color: #1e1e2e; }
            .cm-autocomplete-item .type.prop { background: #89b4fa; color: #1e1e2e; }
            .cm-autocomplete-item .type.value { background: #fab387; color: #1e1e2e; }
            .cm-autocomplete-item .type.keyword { background: #cba6f7; color: #1e1e2e; }
            .cm-autocomplete-item .type.builtin { background: #94e2d5; color: #1e1e2e; }
            .cm-autocomplete-item .type.method { background: #f9e2af; color: #1e1e2e; }
            .cm-autocomplete-empty {
                padding: 8px 12px;
                color: #6c7086;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }

    _handleInput(e) {
        const newDoc = Text.of(this._textarea.value);
        const oldState = this.state;
        this.state = new EditorState({
            doc: newDoc,
            extensions: oldState.extensions
        });

        // Update line numbers and syntax highlight
        this._updateLineNumbers();
        this._updateHighlight();

        // Trigger autocomplete
        this._triggerAutocomplete();

        // Notify listeners
        this._updateListeners.forEach(listener => {
            listener({
                state: this.state,
                docChanged: true,
                changes: { empty: false }
            });
        });
    }

    _handleKeydown(e) {
        const { key, ctrlKey, metaKey, shiftKey } = e;

        // Handle autocomplete navigation
        if (this._autocomplete.style.display !== 'none') {
            if (key === 'ArrowDown') {
                e.preventDefault();
                this._selectedCompletion = Math.min(this._selectedCompletion + 1, this._completions.length - 1);
                this._updateAutocompleteSelection();
                return;
            }
            if (key === 'ArrowUp') {
                e.preventDefault();
                this._selectedCompletion = Math.max(this._selectedCompletion - 1, 0);
                this._updateAutocompleteSelection();
                return;
            }
            if (key === 'Enter' || key === 'Tab') {
                if (this._completions.length > 0) {
                    e.preventDefault();
                    this._applyCompletion(this._completions[this._selectedCompletion]);
                    return;
                }
            }
            if (key === 'Escape') {
                e.preventDefault();
                this._hideAutocomplete();
                return;
            }
        }

        // Tab key - insert spaces or apply completion
        if (key === 'Tab' && !shiftKey) {
            e.preventDefault();
            const start = this._textarea.selectionStart;
            const end = this._textarea.selectionEnd;
            const value = this._textarea.value;
            this._textarea.value = value.substring(0, start) + '    ' + value.substring(end);
            this._textarea.selectionStart = this._textarea.selectionEnd = start + 4;
            this._textarea.dispatchEvent(new Event('input'));
            return;
        }

        // Auto-closing brackets and quotes
        if (AUTO_CLOSE[key] && !ctrlKey && !metaKey) {
            const start = this._textarea.selectionStart;
            const end = this._textarea.selectionEnd;
            const value = this._textarea.value;
            const closeChar = AUTO_CLOSE[key];

            // Check if next char is the same closing char (skip if so)
            if (key === closeChar && value[start] === closeChar) {
                e.preventDefault();
                this._textarea.selectionStart = this._textarea.selectionEnd = start + 1;
                return;
            }

            // Auto-close
            if (start === end) {
                e.preventDefault();
                this._textarea.value = value.substring(0, start) + key + closeChar + value.substring(end);
                this._textarea.selectionStart = this._textarea.selectionEnd = start + 1;
                this._textarea.dispatchEvent(new Event('input'));
                return;
            }
        }

        // Auto-close HTML tags
        if (key === '>' && this._language === 'html') {
            const start = this._textarea.selectionStart;
            const value = this._textarea.value;

            // Find opening tag
            const beforeCursor = value.substring(0, start);
            const tagMatch = beforeCursor.match(/<(\w+)(?:\s[^>]*)?$/);

            if (tagMatch && !beforeCursor.endsWith('/')) {
                const tagName = tagMatch[1];
                const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];

                if (!selfClosingTags.includes(tagName.toLowerCase())) {
                    e.preventDefault();
                    const closeTag = `></${tagName}>`;
                    this._textarea.value = value.substring(0, start) + closeTag + value.substring(start);
                    this._textarea.selectionStart = this._textarea.selectionEnd = start + 1;
                    this._textarea.dispatchEvent(new Event('input'));
                    return;
                }
            }
        }

        // Ctrl+Space to trigger autocomplete
        if ((ctrlKey || metaKey) && key === ' ') {
            e.preventDefault();
            this._triggerAutocomplete(true);
            return;
        }

        // Enter key - auto indent
        if (key === 'Enter' && !ctrlKey && !metaKey && !shiftKey) {
            e.preventDefault();
            const start = this._textarea.selectionStart;
            const value = this._textarea.value;

            // Get current line
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const currentLine = value.substring(lineStart, start);

            // Get leading whitespace from current line
            const indentMatch = currentLine.match(/^(\s*)/);
            let indent = indentMatch ? indentMatch[1] : '';

            // Check if we should add extra indent (after { or : in CSS, or > in HTML)
            const trimmedLine = currentLine.trim();
            const lastChar = trimmedLine.slice(-1);

            if (lastChar === '{' || (lastChar === ':' && this._language === 'css')) {
                indent += '    ';
            } else if (lastChar === '>' && this._language === 'html') {
                // Check if it's an opening tag (not closing or self-closing)
                const tagMatch = currentLine.match(/<(\w+)(?:\s[^>]*)?>$/);
                if (tagMatch) {
                    const tagName = tagMatch[1];
                    const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
                    if (!selfClosingTags.includes(tagName.toLowerCase()) && !currentLine.includes('</')) {
                        indent += '    ';
                    }
                }
            }

            // Insert newline with indent
            const newValue = value.substring(0, start) + '\n' + indent + value.substring(start);
            this._textarea.value = newValue;
            this._textarea.selectionStart = this._textarea.selectionEnd = start + 1 + indent.length;
            this._textarea.dispatchEvent(new Event('input'));
            return;
        }
    }

    _updateLineNumbers() {
        const lines = this._textarea.value.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += i + '\n';
        }
        this._lineNumbers.textContent = html;
    }

    _triggerAutocomplete(force = false) {
        const value = this._textarea.value;
        const pos = this._textarea.selectionStart;

        // Get word at cursor
        const beforeCursor = value.substring(0, pos);
        const afterCursor = value.substring(pos);

        let completions = [];
        let prefix = '';
        let startPos = pos;

        if (this._language === 'html') {
            completions = this._getHtmlCompletions(beforeCursor, afterCursor);
        } else if (this._language === 'css') {
            completions = this._getCssCompletions(beforeCursor, afterCursor);
        } else if (this._language === 'javascript') {
            completions = this._getJsCompletions(beforeCursor, afterCursor);
        }

        // Filter by prefix
        const wordMatch = beforeCursor.match(/[\w-]+$/);
        if (wordMatch) {
            prefix = wordMatch[0].toLowerCase();
            startPos = pos - prefix.length;
            completions = completions.filter(c => c.text.toLowerCase().startsWith(prefix));
        }

        // Show or hide autocomplete
        if (completions.length > 0 && (force || prefix.length >= 1)) {
            this._completions = completions;
            this._selectedCompletion = 0;
            this._showAutocomplete(completions, startPos);
        } else {
            this._hideAutocomplete();
        }
    }

    _getHtmlCompletions(before, after) {
        const completions = [];

        // Check if we're inside a tag (for attributes)
        const tagMatch = before.match(/<(\w+)\s+[^>]*$/);
        if (tagMatch) {
            const tagName = tagMatch[1].toLowerCase();
            const attrs = [...(COMPLETIONS.html.attributes.global || []), ...(COMPLETIONS.html.attributes[tagName] || [])];
            attrs.forEach(attr => {
                completions.push({ text: attr + '=""', display: attr, type: 'attr', cursorOffset: -1 });
            });
            return completions;
        }

        // Check if we're starting a tag
        if (before.match(/<\w*$/)) {
            COMPLETIONS.html.tags.forEach(tag => {
                completions.push({ text: tag, display: tag, type: 'tag' });
            });
        }

        return completions;
    }

    _getCssCompletions(before, after) {
        const completions = [];

        // Check if we're after a property name (suggesting values)
        const propMatch = before.match(/([\w-]+)\s*:\s*[\w-]*$/);
        if (propMatch) {
            const propName = propMatch[1];
            const values = COMPLETIONS.css.values[propName] || [];
            values.forEach(val => {
                completions.push({ text: val, display: val, type: 'value' });
            });
            // Add colors if property might accept color
            if (['color', 'background', 'background-color', 'border-color', 'outline-color'].includes(propName)) {
                COMPLETIONS.css.colors.forEach(color => {
                    completions.push({ text: color, display: color, type: 'value' });
                });
            }
            return completions;
        }

        // Suggest properties
        if (before.match(/[{;]\s*[\w-]*$/) || before.match(/^\s*[\w-]*$/)) {
            COMPLETIONS.css.properties.forEach(prop => {
                completions.push({ text: prop + ': ', display: prop, type: 'prop' });
            });
        }

        return completions;
    }

    _getJsCompletions(before, after) {
        const completions = [];

        // Check for method completion (e.g., "console.")
        const objMatch = before.match(/(\w+)\.[\w]*$/);
        if (objMatch) {
            const objName = objMatch[1];
            const methods = COMPLETIONS.javascript.methods[objName] || [];
            methods.forEach(method => {
                completions.push({ text: method, display: method, type: 'method' });
            });
            return completions;
        }

        // Keywords and builtins
        COMPLETIONS.javascript.keywords.forEach(kw => {
            completions.push({ text: kw, display: kw, type: 'keyword' });
        });
        COMPLETIONS.javascript.builtins.forEach(bi => {
            completions.push({ text: bi, display: bi, type: 'builtin' });
        });

        return completions;
    }

    _showAutocomplete(completions, startPos) {
        this._autocomplete.innerHTML = '';

        completions.slice(0, 15).forEach((comp, idx) => {
            const item = document.createElement('div');
            item.className = 'cm-autocomplete-item' + (idx === 0 ? ' selected' : '');
            item.innerHTML = `<span class="type ${comp.type}">${comp.type}</span><span>${comp.display}</span>`;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this._applyCompletion(comp);
            });
            this._autocomplete.appendChild(item);
        });

        // Position the autocomplete dropdown
        const rect = this._textarea.getBoundingClientRect();
        const coords = this._getCaretCoordinates();

        this._autocomplete.style.left = (coords.left + 50) + 'px'; // 50 = line numbers width
        this._autocomplete.style.top = (coords.top + 20) + 'px';
        this._autocomplete.style.display = 'block';
    }

    _hideAutocomplete() {
        this._autocomplete.style.display = 'none';
        this._completions = [];
    }

    _updateAutocompleteSelection() {
        const items = this._autocomplete.querySelectorAll('.cm-autocomplete-item');
        items.forEach((item, idx) => {
            item.classList.toggle('selected', idx === this._selectedCompletion);
        });

        // Scroll into view
        const selected = items[this._selectedCompletion];
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    _applyCompletion(completion) {
        const value = this._textarea.value;
        const pos = this._textarea.selectionStart;
        const before = value.substring(0, pos);

        // Find prefix to replace
        const wordMatch = before.match(/[\w-]+$/);
        const prefixLen = wordMatch ? wordMatch[0].length : 0;
        const startPos = pos - prefixLen;

        const newValue = value.substring(0, startPos) + completion.text + value.substring(pos);
        this._textarea.value = newValue;

        // Set cursor position
        let cursorPos = startPos + completion.text.length;
        if (completion.cursorOffset) {
            cursorPos += completion.cursorOffset;
        }
        this._textarea.selectionStart = this._textarea.selectionEnd = cursorPos;

        this._hideAutocomplete();
        this._textarea.dispatchEvent(new Event('input'));
    }

    _getCaretCoordinates() {
        // Approximate caret position
        const style = window.getComputedStyle(this._textarea);
        const lineHeight = parseFloat(style.lineHeight) || 20;
        const fontSize = parseFloat(style.fontSize) || 13;

        const value = this._textarea.value;
        const pos = this._textarea.selectionStart;
        const lines = value.substring(0, pos).split('\n');
        const currentLine = lines.length;
        const currentCol = lines[lines.length - 1].length;

        return {
            top: (currentLine - 1) * lineHeight + 10 - this._textarea.scrollTop,
            left: currentCol * (fontSize * 0.6) + 10 - this._textarea.scrollLeft
        };
    }

    setLanguage(lang) {
        this._language = lang;
        this.dom.setAttribute('data-language', lang);
        this._updateHighlight();
    }

    _updateHighlight() {
        if (!this._highlight) return;

        const code = this._textarea.value;
        let highlighted = '';

        switch (this._language) {
            case 'html':
                highlighted = this._highlightHTML(code);
                break;
            case 'css':
                highlighted = this._highlightCSS(code);
                break;
            case 'javascript':
                highlighted = this._highlightJS(code);
                break;
            default:
                highlighted = this._escapeHtml(code);
        }

        this._highlight.innerHTML = highlighted + '\n'; // Extra newline for scrolling
    }

    _escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _highlightHTML(code) {
        let result = '';
        let i = 0;

        while (i < code.length) {
            // Comments
            if (code.slice(i, i + 4) === '<!--') {
                const end = code.indexOf('-->', i + 4);
                const endPos = end === -1 ? code.length : end + 3;
                result += `<span class="comment">${this._escapeHtml(code.slice(i, endPos))}</span>`;
                i = endPos;
            }
            // Tags
            else if (code[i] === '<') {
                const tagEnd = code.indexOf('>', i);
                if (tagEnd !== -1) {
                    const tagContent = code.slice(i, tagEnd + 1);
                    result += this._highlightHTMLTag(tagContent);
                    i = tagEnd + 1;
                } else {
                    result += this._escapeHtml(code[i]);
                    i++;
                }
            }
            else {
                result += this._escapeHtml(code[i]);
                i++;
            }
        }

        return result;
    }

    _highlightHTMLTag(tag) {
        // Match tag name and attributes
        const match = tag.match(/^(<\/?)([\w-]+)(.*?)(\/?>)$/s);
        if (!match) return this._escapeHtml(tag);

        const [, open, tagName, attrs, close] = match;
        let result = `<span class="punctuation">${this._escapeHtml(open)}</span>`;
        result += `<span class="tag">${this._escapeHtml(tagName)}</span>`;

        // Highlight attributes
        if (attrs) {
            result += attrs.replace(/([\w-]+)(=)("[^"]*"|'[^']*')?/g, (m, name, eq, val) => {
                let attrResult = `<span class="attr-name">${this._escapeHtml(name)}</span>`;
                attrResult += `<span class="punctuation">${eq}</span>`;
                if (val) attrResult += `<span class="attr-value">${this._escapeHtml(val)}</span>`;
                return attrResult;
            }).replace(/([^<]*)$/, (m) => this._escapeHtml(m));
        }

        result += `<span class="punctuation">${this._escapeHtml(close)}</span>`;
        return result;
    }

    _highlightCSS(code) {
        let result = '';
        let i = 0;

        while (i < code.length) {
            // Comments
            if (code.slice(i, i + 2) === '/*') {
                const end = code.indexOf('*/', i + 2);
                const endPos = end === -1 ? code.length : end + 2;
                result += `<span class="comment">${this._escapeHtml(code.slice(i, endPos))}</span>`;
                i = endPos;
            }
            // Strings
            else if (code[i] === '"' || code[i] === "'") {
                const quote = code[i];
                let j = i + 1;
                while (j < code.length && code[j] !== quote) {
                    if (code[j] === '\\') j++;
                    j++;
                }
                result += `<span class="string">${this._escapeHtml(code.slice(i, j + 1))}</span>`;
                i = j + 1;
            }
            // Selectors (before {)
            else if (code[i].match(/[.#@\w\[\]:*-]/)) {
                let j = i;
                while (j < code.length && !'{};'.includes(code[j])) j++;
                const chunk = code.slice(i, j);
                if (code[j] === '{') {
                    result += `<span class="selector">${this._escapeHtml(chunk)}</span>`;
                } else {
                    // Property: value inside block
                    const colonIdx = chunk.indexOf(':');
                    if (colonIdx !== -1) {
                        result += `<span class="property">${this._escapeHtml(chunk.slice(0, colonIdx))}</span>`;
                        result += `<span class="punctuation">:</span>`;
                        result += `<span class="value">${this._escapeHtml(chunk.slice(colonIdx + 1))}</span>`;
                    } else {
                        result += this._escapeHtml(chunk);
                    }
                }
                i = j;
            }
            // Punctuation
            else if ('{}();:,'.includes(code[i])) {
                result += `<span class="punctuation">${this._escapeHtml(code[i])}</span>`;
                i++;
            }
            else {
                result += this._escapeHtml(code[i]);
                i++;
            }
        }

        return result;
    }

    _highlightJS(code) {
        const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'import', 'export', 'default', 'from', 'async', 'await', 'this', 'super', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'];
        let result = '';
        let i = 0;

        while (i < code.length) {
            // Comments
            if (code.slice(i, i + 2) === '//') {
                const end = code.indexOf('\n', i);
                const endPos = end === -1 ? code.length : end;
                result += `<span class="comment">${this._escapeHtml(code.slice(i, endPos))}</span>`;
                i = endPos;
            }
            else if (code.slice(i, i + 2) === '/*') {
                const end = code.indexOf('*/', i + 2);
                const endPos = end === -1 ? code.length : end + 2;
                result += `<span class="comment">${this._escapeHtml(code.slice(i, endPos))}</span>`;
                i = endPos;
            }
            // Strings
            else if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
                const quote = code[i];
                let j = i + 1;
                while (j < code.length && code[j] !== quote) {
                    if (code[j] === '\\') j++;
                    j++;
                }
                result += `<span class="string">${this._escapeHtml(code.slice(i, j + 1))}</span>`;
                i = j + 1;
            }
            // Numbers
            else if (code[i].match(/\d/)) {
                let j = i;
                while (j < code.length && code[j].match(/[\d.xXa-fA-F]/)) j++;
                result += `<span class="number">${this._escapeHtml(code.slice(i, j))}</span>`;
                i = j;
            }
            // Words (identifiers, keywords)
            else if (code[i].match(/[a-zA-Z_$]/)) {
                let j = i;
                while (j < code.length && code[j].match(/[\w$]/)) j++;
                const word = code.slice(i, j);
                if (keywords.includes(word)) {
                    result += `<span class="keyword">${this._escapeHtml(word)}</span>`;
                } else if (code[j] === '(') {
                    result += `<span class="function">${this._escapeHtml(word)}</span>`;
                } else {
                    result += this._escapeHtml(word);
                }
                i = j;
            }
            // Operators
            else if ('+-*/%=<>!&|^~?:'.includes(code[i])) {
                result += `<span class="operator">${this._escapeHtml(code[i])}</span>`;
                i++;
            }
            // Punctuation
            else if ('{}[]();,.'.includes(code[i])) {
                result += `<span class="punctuation">${this._escapeHtml(code[i])}</span>`;
                i++;
            }
            else {
                result += this._escapeHtml(code[i]);
                i++;
            }
        }

        return result;
    }

    dispatch(transaction) {
        if (transaction.changes) {
            const newDoc = transaction.changes.newDoc || this.state.doc;
            this.state = new EditorState({
                doc: newDoc,
                extensions: this.state.extensions
            });
            this._textarea.value = this.state.doc.toString();
            this._updateLineNumbers();
        }
    }

    get docView() {
        return {
            dom: this._textarea
        };
    }

    static updateListener = {
        of(callback) {
            return { type: 'updateListener', callback };
        }
    };

    destroy() {
        if (this.dom && this.dom.parentNode) {
            this.dom.parentNode.removeChild(this.dom);
        }
    }

    focus() {
        if (this._textarea) {
            this._textarea.focus();
        }
    }

    getValue() {
        return this._textarea ? this._textarea.value : '';
    }

    setValue(value) {
        if (this._textarea) {
            this._textarea.value = value;
            this.state = new EditorState({
                doc: Text.of(value),
                extensions: this.state.extensions
            });
            this._updateLineNumbers();
            this._updateHighlight();
        }
    }
}

// Basic setup extension
function basicSetup() {
    return { type: 'basicSetup' };
}

// Language support placeholders
function html() {
    return { type: 'language', name: 'html' };
}

function css() {
    return { type: 'language', name: 'css' };
}

function javascript() {
    return { type: 'language', name: 'javascript' };
}

// Theme
const oneDark = { type: 'theme', name: 'oneDark' };

// Export for ES modules
export {
    EditorView,
    EditorState,
    basicSetup,
    html,
    css,
    javascript,
    oneDark
};

// Also attach to window for non-module usage
if (typeof window !== 'undefined') {
    window.CodeMirror = {
        EditorView,
        EditorState,
        basicSetup,
        html,
        css,
        javascript,
        oneDark
    };
}
