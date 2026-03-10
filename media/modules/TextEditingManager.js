import EventEmitter from './EventEmitter.js';

/**
 * TextEditingManager - Handles text editing and text selection formatting
 */
class TextEditingManager extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.currentSelection = null;
        this.isEditing = false;
        this._currentEditElement = null;
        this._currentCleanup = null;
    }

    /**
     * Initialize with preview iframe
     * @param {HTMLIFrameElement} previewFrame
     */
    init(previewFrame) {
        this.previewFrame = previewFrame;
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        if (this.previewFrame === iframe) return;
        // 편집 중이면 종료
        if (this.isEditing) {
            this.stopEditing();
        }
        this.previewFrame = iframe;
    }

    /**
     * 현재 텍스트 편집 종료
     */
    stopEditing() {
        if (this._currentCleanup) {
            this._currentCleanup();
            this._currentCleanup = null;
            this._currentEditElement = null;
        }
        this.isEditing = false;
    }

    /**
     * Get iframe document
     */
    getDocument() {
        try {
            return this.previewFrame?.contentDocument ||
                   this.previewFrame?.contentWindow?.document;
        } catch (e) {
            return null;
        }
    }

    /**
     * Get iframe window
     */
    getWindow() {
        try {
            return this.previewFrame?.contentWindow;
        } catch (e) {
            return null;
        }
    }

    /**
     * Check if element is text-editable
     * 태그 화이트리스트 대신 텍스트 노드 존재 여부로 판단
     * @param {Element} element
     * @returns {boolean}
     */
    isTextEditable(element) {
        if (!element) return false;

        // 1. 직접적인 텍스트 노드가 있으면 편집 가능 (DIV든 SECTION이든 상관없음)
        for (let i = 0; i < element.childNodes.length; i++) {
            const node = element.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                return true;
            }
        }

        // 2. 알려진 텍스트 태그: 인라인 자식만 있고 텍스트가 있는 경우도 허용
        //    (예: <p><strong>bold</strong></p> — 직접 텍스트 노드 없지만 편집 가능)
        const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'LI', 'TD', 'TH', 'LABEL', 'BUTTON'];
        if (textTags.includes(element.tagName) && element.textContent.trim().length > 0) {
            const blockTags = ['DIV', 'SECTION', 'ARTICLE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'TABLE', 'UL', 'OL', 'FORM', 'FIELDSET', 'FIGURE', 'BLOCKQUOTE', 'PRE'];
            for (let i = 0; i < element.children.length; i++) {
                if (blockTags.includes(element.children[i].tagName)) return false;
            }
            return true;
        }

        return false;
    }

    /**
     * Enable text editing on element
     * @param {Element} element
     * @param {Object} options - { selectAll: boolean } - defaults to true
     * @returns {{ oldContent: string, cleanup: Function } | null}
     */
    enableEditing(element, options = {}) {
        if (!this.isTextEditable(element)) return null;
        if (element.classList.contains('editor-editable')) return null;

        const { selectAll = true } = options;
        const oldContent = element.innerHTML;
        this.isEditing = true;

        // Make editable
        element.setAttribute('contenteditable', 'true');
        element.classList.add('editor-editable');
        // body에 텍스트 편집 모드 표시 (cursor/user-select 전환)
        element.ownerDocument?.body?.classList.add('zaemit-text-editing');
        element.focus();

        // Select all text only if requested (default behavior)
        if (selectAll) {
            this.selectAllText(element);
        }

        // Setup paste handler for plain text only
        const pasteHandler = (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            this.insertTextAtCursor(text);
        };
        element.addEventListener('paste', pasteHandler);

        // Return cleanup function
        const cleanup = () => {
            element.removeAttribute('contenteditable');
            element.classList.remove('editor-editable');
            element.classList.remove('quick-text-edit');
            // body에서 텍스트 편집 모드 해제
            element.ownerDocument?.body?.classList.remove('zaemit-text-editing');
            element.removeEventListener('paste', pasteHandler);
            this.isEditing = false;

            const newContent = element.innerHTML;
            if (oldContent !== newContent) {
                this.emit('content:changed', { element, oldContent, newContent });
            }
            // cleanup 호출 시 저장된 참조도 제거
            this._currentCleanup = null;
            this._currentEditElement = null;
        };

        // 현재 편집 상태 저장 (stopEditing에서 사용)
        this._currentCleanup = cleanup;
        this._currentEditElement = element;

        return { oldContent, cleanup };
    }

    /**
     * Select all text in element
     * @param {Element} element
     */
    selectAllText(element) {
        const win = this.getWindow();
        if (!win) return;

        try {
            // ★ iframe의 document에서 Range 생성 (document.createRange()는 메인 문서)
            const doc = element.ownerDocument || win.document;
            const range = doc.createRange();
            range.selectNodeContents(element);
            const sel = win.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            console.warn('selectAllText failed:', e);
        }
    }

    /**
     * Insert text at cursor position
     * @param {string} text
     */
    insertTextAtCursor(text) {
        const win = this.getWindow();
        if (!win) return;

        try {
            const sel = win.getSelection();
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                // ★ iframe의 document에서 TextNode 생성
                const doc = range.startContainer.ownerDocument || win.document;
                range.deleteContents();
                range.insertNode(doc.createTextNode(text));
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } catch (e) {
            console.warn('insertTextAtCursor failed:', e);
        }
    }

    /**
     * Get current text selection
     * @returns {{ selection: Selection, range: Range, isCursor: boolean } | null}
     */
    getSelection() {
        const win = this.getWindow();
        if (!win) return null;

        try {
            const sel = win.getSelection();
            if (!sel || sel.rangeCount === 0) return null;

            const range = sel.getRangeAt(0);
            return {
                selection: sel,
                range: range,
                isCursor: sel.isCollapsed
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Check if there's text selected
     * @returns {boolean}
     */
    hasTextSelected() {
        const selInfo = this.getSelection();
        return selInfo && !selInfo.isCursor && selInfo.selection.toString().trim().length > 0;
    }

    /**
     * Apply style to selected text
     * @param {string} property - CSS property
     * @param {string} value - CSS value
     */
    applyStyleToSelection(property, value) {
        const selInfo = this.getSelection();
        if (!selInfo || selInfo.isCursor) return false;

        const doc = this.getDocument();
        if (!doc) return false;

        const { selection, range } = selInfo;

        // Check if selection is within an editable element
        const container = range.commonAncestorContainer;
        const textElement = container.nodeType === 3 ? container.parentElement : container;
        if (!textElement?.isContentEditable && !textElement?.closest('[contenteditable="true"]')) {
            return false;
        }

        // Wrap selection in span with style
        const selectedText = range.extractContents();
        const span = doc.createElement('span');
        span.style[property] = value;
        span.appendChild(selectedText);
        range.insertNode(span);

        // Re-select the wrapped content
        selection.removeAllRanges();
        const newRange = doc.createRange();
        newRange.selectNodeContents(span);
        selection.addRange(newRange);

        this.emit('style:applied', { property, value, element: span });
        return true;
    }

    /**
     * Toggle style on selected text
     * @param {string} property - CSS property
     * @param {string} value - CSS value
     */
    toggleStyleOnSelection(property, value) {
        const selInfo = this.getSelection();
        if (!selInfo || selInfo.isCursor) return false;

        // Check if style is already applied
        const doc = this.getDocument();
        const container = selInfo.range.commonAncestorContainer;
        const parentSpan = container.nodeType === 3
            ? container.parentElement
            : container;

        if (parentSpan && parentSpan.style[property] === value) {
            // Remove style
            parentSpan.style[property] = '';
            if (!parentSpan.getAttribute('style')?.trim()) {
                // Unwrap span if no styles left
                const parent = parentSpan.parentNode;
                while (parentSpan.firstChild) {
                    parent.insertBefore(parentSpan.firstChild, parentSpan);
                }
                parent.removeChild(parentSpan);
            }
            return true;
        }

        return this.applyStyleToSelection(property, value);
    }

    /**
     * Clear formatting from selected text
     */
    clearFormatting() {
        const selInfo = this.getSelection();
        if (!selInfo) return false;

        const doc = this.getDocument();
        if (!doc) return false;

        const text = selInfo.selection.toString();
        if (!text) return false;

        // Replace selection with plain text
        const textNode = doc.createTextNode(text);
        selInfo.range.deleteContents();
        selInfo.range.insertNode(textNode);

        this.emit('formatting:cleared');
        return true;
    }

    /**
     * Insert line break at cursor
     * @param {string} breakpointClass - Optional CSS class for responsive break
     */
    insertLineBreak(breakpointClass = '') {
        const selInfo = this.getSelection();
        if (!selInfo) return false;

        const doc = this.getDocument();
        if (!doc) return false;

        const br = doc.createElement('br');
        if (breakpointClass) {
            br.className = breakpointClass;
        }

        selInfo.range.deleteContents();
        selInfo.range.insertNode(br);

        // Move cursor after BR
        selInfo.range.setStartAfter(br);
        selInfo.range.collapse(true);
        selInfo.selection.removeAllRanges();
        selInfo.selection.addRange(selInfo.range);

        this.emit('linebreak:inserted', { breakpointClass });
        return true;
    }

    /**
     * Check if currently editing
     * @returns {boolean}
     */
    isCurrentlyEditing() {
        return this.isEditing;
    }

    /**
     * Store current selection for later use
     */
    storeSelection() {
        this.currentSelection = this.getSelection();
    }

    /**
     * Restore stored selection
     */
    restoreSelection() {
        if (!this.currentSelection) return;

        const win = this.getWindow();
        if (!win) return;

        try {
            const sel = win.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSelection.range);
        } catch (e) {
            console.warn('Failed to restore selection:', e);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.currentSelection = null;
        this.isEditing = false;
    }
}

export default TextEditingManager;
