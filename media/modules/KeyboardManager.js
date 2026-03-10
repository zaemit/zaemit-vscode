import EventEmitter from './EventEmitter.js';

/**
 * KeyboardManager - Handles keyboard shortcuts and events
 */
class KeyboardManager extends EventEmitter {
    constructor(editor) {
        super();
        this.editor = editor;
        this.previewFrame = null;
        this._handlers = [];
    }

    /**
     * Initialize keyboard shortcuts
     * @param {HTMLIFrameElement} previewFrame - Preview iframe element
     */
    init(previewFrame) {
        this.previewFrame = previewFrame;
        this.setupKeyboardShortcuts();
    }

    /**
     * Check if user is currently editing text (includes style panel inputs)
     */
    isEditingText() {
        const activeElement = document.activeElement;
        let iframeActive = null;

        try {
            const iframeDoc = this.previewFrame?.contentDocument;
            iframeActive = iframeDoc?.activeElement;
        } catch (e) {}

        // Check main document inputs
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
            return true;
        }

        // Check if actively editing in iframe (must have editor-editable class)
        // This class is removed when editing ends, so it's a reliable check
        if (iframeActive?.classList?.contains('editor-editable') ||
            iframeActive?.classList?.contains('quick-text-edit')) {
            return true;
        }

        return false;
    }

    /**
     * Check if user is editing text content inside the iframe only
     * (Does NOT include style panel inputs - use for shortcuts like Alt+P)
     */
    isEditingInIframe() {
        try {
            const iframeDoc = this.previewFrame?.contentDocument;
            const iframeActive = iframeDoc?.activeElement;
            if (iframeActive?.classList?.contains('editor-editable') ||
                iframeActive?.classList?.contains('quick-text-edit')) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    /**
     * Check if there's text selection
     */
    hasTextSelection() {
        // Check main document selection
        const mainSelection = window.getSelection();
        if (mainSelection && mainSelection.toString().length > 0) return true;

        // Check iframe selection
        try {
            const iframeSelection = this.previewFrame?.contentWindow?.getSelection();
            if (iframeSelection && iframeSelection.toString().length > 0) return true;
        } catch (err) {}

        return false;
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        // Store handleKeydown as instance method for reuse
        this.handleKeydown = (e) => {
            // Alt+V / Enter / ESC (미니 AI 대화창) → AIChatManager._registerGlobalShortcuts()에서 처리

            // Ctrl+S or Cmd+S - Save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.emit('shortcut:save');
                return;
            }

            // Ctrl+Z or Cmd+Z - Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                if (this.isEditingText()) return; // Allow browser native undo
                e.preventDefault();
                this.emit('shortcut:undo');
                return;
            }

            // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z - Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                if (this.isEditingText()) return; // Allow browser native redo
                e.preventDefault();
                this.emit('shortcut:redo');
                return;
            }

            // Ctrl+C - Copy element (텍스트 편집 중이면 기본 동작)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey && !e.altKey) {
                if (this.isEditingText()) return; // 텍스트 복사 유지
                e.preventDefault();
                this.emit('shortcut:copyElement');
                return;
            }

            // Ctrl+X - Cut element (텍스트 편집 중이면 기본 동작)
            if ((e.ctrlKey || e.metaKey) && e.key === 'x' && !e.shiftKey && !e.altKey) {
                if (this.isEditingText()) return; // 텍스트 잘라내기 유지
                e.preventDefault();
                this.emit('shortcut:cutElement');
                return;
            }

            // Ctrl+V - Paste element (텍스트 편집 중이면 기본 동작)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey && !e.altKey) {
                if (this.isEditingText()) return; // 텍스트 붙여넣기 유지
                e.preventDefault();
                this.emit('shortcut:pasteElement');
                return;
            }

            // Ctrl+D - Duplicate element (항상 요소 복제)
            if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !e.shiftKey && !e.altKey) {
                e.preventDefault(); // 브라우저 북마크 방지
                this.emit('shortcut:duplicateElement');
                return;
            }

            // Ctrl+0 or Cmd+0 - Reset zoom to 100%
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.emit('shortcut:resetZoom');
                return;
            }

            // Ctrl+Shift+L - Toggle layer panel
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
                e.preventDefault();
                this.emit('shortcut:toggleLayerPanel');
                return;
            }

            // Ctrl+Shift+P - Toggle property panel
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyP') {
                e.preventDefault();
                this.emit('shortcut:togglePropertyPanel');
                return;
            }

            // Ctrl+Shift+T - Toggle template panel
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyT') {
                e.preventDefault();
                this.emit('shortcut:toggleTemplatePanel');
                return;
            }

            // Ctrl+Shift+1-8 - Switch view mode by index
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
                const digitMatch = e.code.match(/^Digit([1-8])$/);
                if (digitMatch) {
                    e.preventDefault();
                    const index = parseInt(digitMatch[1]);
                    this.emit('shortcut:viewMode', index);
                    return;
                }
            }

            // Ctrl+Alt+Shift+K - Open shortcuts modal
            if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && e.code === 'KeyK') {
                e.preventDefault();
                this.emit('shortcut:openShortcuts');
                return;
            }

            // Ctrl+Alt+Shift+S - Publish
            if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && e.code === 'KeyS') {
                e.preventDefault();
                this.emit('shortcut:publish');
                return;
            }

            // Delete or Backspace - Delete element
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.isEditingText()) return;
                e.preventDefault();
                this.emit('shortcut:deleteElement');
                return;
            }

            // Alt + Arrow Up - Move element up (DOM order)
            if (e.altKey && e.key === 'ArrowUp') {
                e.preventDefault();
                this.emit('shortcut:moveElementUp');
                return;
            }

            // Alt + Arrow Down - Move element down (DOM order)
            if (e.altKey && e.key === 'ArrowDown') {
                e.preventDefault();
                this.emit('shortcut:moveElementDown');
                return;
            }

            // Arrow keys - Nudge absolute element (1px, Ctrl: 10px)
            if (!e.altKey && !e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                if (this.isEditingText()) return;
                const step = (e.ctrlKey || e.metaKey) ? 10 : 1;
                const dir = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
                const [dx, dy] = dir[e.key];
                e.preventDefault();
                this.emit('shortcut:nudge', { dx, dy });
                return;
            }

            // ★ Alt+P를 먼저 처리 (Alt+L/M/R의 isEditingText() early return에 의해 차단되지 않도록)
            // ★ isEditingInIframe()만 체크: 스타일 패널 input에서는 차단하지 않음
            if (e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyP') {
                if (this.isEditingInIframe()) return;
                e.preventDefault();
                this.emit('shortcut:selectParent');
                return;
            }

            // Alt + L/M/R for alignment (use e.code for reliability with Alt key)
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                // Skip if editing text
                if (this.isEditingText()) return;

                if (e.code === 'KeyL') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.emit('shortcut:alignElement', 'left');
                    return;
                }
                if (e.code === 'KeyM') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.emit('shortcut:alignElement', 'center');
                    return;
                }
                if (e.code === 'KeyR') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.emit('shortcut:alignElement', 'right');
                    return;
                }
            }

            // Alt+Shift shortcuts for text formatting and z-index
            if (e.altKey && e.shiftKey && !e.ctrlKey) {
                // Alt+Shift+Up/Down - z-index adjustment
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.emit('shortcut:zIndexUp');
                    return;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.emit('shortcut:zIndexDown');
                    return;
                }

                // Text formatting shortcuts (work on both text selection and element)
                // Alt+Shift+B - Bold
                if (e.code === 'KeyB') {
                    e.preventDefault();
                    this.emit('shortcut:bold');
                    return;
                }
                // Alt+Shift+I - Italic
                if (e.code === 'KeyI') {
                    e.preventDefault();
                    this.emit('shortcut:italic');
                    return;
                }
                // Alt+Shift+U - Underline
                if (e.code === 'KeyU') {
                    e.preventDefault();
                    this.emit('shortcut:underline');
                    return;
                }
                // Alt+Shift+= (Plus) - Increase font size
                if (e.code === 'Equal' || e.key === '+') {
                    e.preventDefault();
                    this.emit('shortcut:fontSizeUp');
                    return;
                }
                // Alt+Shift+- (Minus) - Decrease font size
                if (e.code === 'Minus' || e.key === '-') {
                    e.preventDefault();
                    this.emit('shortcut:fontSizeDown');
                    return;
                }
                // Alt+Shift+L - Text align left
                if (e.code === 'KeyL') {
                    e.preventDefault();
                    this.emit('shortcut:textAlignLeft');
                    return;
                }
                // Alt+Shift+E - Text align center (E for cEnter)
                if (e.code === 'KeyE') {
                    e.preventDefault();
                    this.emit('shortcut:textAlignCenter');
                    return;
                }
                // Alt+Shift+R - Text align right
                if (e.code === 'KeyR') {
                    e.preventDefault();
                    this.emit('shortcut:textAlignRight');
                    return;
                }
                // Alt+Shift+J - Text align justify
                if (e.code === 'KeyJ') {
                    e.preventDefault();
                    this.emit('shortcut:textAlignJustify');
                    return;
                }
                // Alt+Shift+H - Increase line height (H for Height)
                if (e.code === 'KeyH') {
                    e.preventDefault();
                    this.emit('shortcut:lineHeightUp');
                    return;
                }
                // Alt+Shift+G - Decrease line height
                if (e.code === 'KeyG') {
                    e.preventDefault();
                    this.emit('shortcut:lineHeightDown');
                    return;
                }
                // Alt+Shift+K - Increase letter spacing (K for Kerning)
                if (e.code === 'KeyK') {
                    e.preventDefault();
                    this.emit('shortcut:letterSpacingUp');
                    return;
                }
                // Alt+Shift+N - Decrease letter spacing (N for Narrow)
                if (e.code === 'KeyN') {
                    e.preventDefault();
                    this.emit('shortcut:letterSpacingDown');
                    return;
                }
            }

            // Ctrl+Shift+< (Comma) - Decrease font size
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Comma') {
                if (this.isEditingText()) return;
                e.preventDefault();
                this.emit('shortcut:fontSizeDown');
                return;
            }

            // Ctrl+Shift+> (Period) - Increase font size
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Period') {
                if (this.isEditingText()) return;
                e.preventDefault();
                this.emit('shortcut:fontSizeUp');
                return;
            }

            // [ - z-index down
            if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (this.isEditingText()) return;
                e.preventDefault();
                this.emit('shortcut:zIndexDown');
                return;
            }

            // ] - z-index up
            if (e.key === ']' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (this.isEditingText()) return;
                e.preventDefault();
                this.emit('shortcut:zIndexUp');
                return;
            }

            // Escape - Deselect element (only when not editing text)
            if (e.key === 'Escape') {
                // If editing text, let the text editor handle ESC (blur)
                if (this.isEditingText()) return;
                this.emit('shortcut:escape');
                return;
            }
        };

        // Store handler for cleanup
        this._handlers.push({ target: document, event: 'keydown', handler: this.handleKeydown });
        document.addEventListener('keydown', this.handleKeydown);

        // Also capture keyboard events from iframe
        if (this.previewFrame) {
            this._iframeDoc = null; // Track current iframe document

            this.attachIframeHandler = () => {
                try {
                    const iframeDoc = this.previewFrame.contentDocument ||
                                     this.previewFrame.contentWindow.document;
                    if (iframeDoc) {
                        // Remove from old iframe doc if different
                        if (this._iframeDoc && this._iframeDoc !== iframeDoc) {
                            this._iframeDoc.removeEventListener('keydown', this.handleKeydown);
                        }
                        // Always remove first to prevent duplicates
                        iframeDoc.removeEventListener('keydown', this.handleKeydown);
                        iframeDoc.addEventListener('keydown', this.handleKeydown);
                        this._iframeDoc = iframeDoc;
                    }
                } catch (err) {
                    // Silently fail if iframe is cross-origin
                }
            };

            // Attach on load
            this.previewFrame.addEventListener('load', this.attachIframeHandler);

            // Also attach immediately if already loaded
            if (this.previewFrame.contentDocument?.readyState === 'complete') {
                this.attachIframeHandler();
            }
        }
    }

    /**
     * Re-attach keyboard handler to iframe (call after iframe content changes)
     */
    reattachIframeHandler() {
        if (this.attachIframeHandler) {
            this.attachIframeHandler();
        }
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        if (!iframe) return;
        this.previewFrame = iframe;
        this.reattachIframeHandler();
    }

    /**
     * Cleanup handlers
     */
    destroy() {
        this._handlers.forEach(({ target, event, handler }) => {
            target.removeEventListener(event, handler);
        });
        this._handlers = [];
    }
}

export default KeyboardManager;
