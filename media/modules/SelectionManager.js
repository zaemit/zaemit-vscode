import EventEmitter from './EventEmitter.js';

/**
 * SelectionManager - Handles element and multi-element selection
 */
class SelectionManager extends EventEmitter {
    constructor() {
        super();
        this.selectedElement = null;
        this.selectedElements = [];
        this.multiSelectOverlays = [];
        this.previewFrame = null;
        this._lastMultiSelectTime = 0;
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

        // 기존 선택 해제
        this.deselectElement();
        // 새 iframe 참조
        this.previewFrame = iframe;
    }

    /**
     * Get the iframe document
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
     * Select an element
     * @param {Element} element
     */
    selectElement(element) {
        const doc = this.getDocument();
        if (!doc) return;

        // Don't select html or body
        if (element === doc.documentElement || element === doc.body) {
            return;
        }

        // Remove previous highlight
        if (this.selectedElement) {
            this.selectedElement.classList.remove('editor-highlight');
        }

        // Add new highlight
        this.selectedElement = element;
        element.classList.add('editor-highlight');

        this.emit('element:selected', element);
    }

    /**
     * Deselect current element
     */
    deselectElement() {
        if (this.selectedElement) {
            try {
                this.selectedElement.classList.remove('editor-highlight');
            } catch (e) {}
            this.selectedElement = null;
        }
        this.clearMultiSelection();
        this.emit('element:deselected');
    }

    /**
     * Handle multi-select (Shift+Click)
     * @param {Element} element
     */
    handleMultiSelect(element) {
        const doc = this.getDocument();
        if (!doc) return;

        // Don't multi-select html or body
        if (element === doc.documentElement || element === doc.body) {
            return;
        }

        // Debounce
        const now = Date.now();
        if (now - this._lastMultiSelectTime < 300) {
            return;
        }
        this._lastMultiSelectTime = now;

        // If element is already the primary selection, do nothing
        if (element === this.selectedElement) return;

        // If element is already in multi-selection, remove it (toggle behavior)
        if (this.selectedElements.includes(element)) {
            this.removeFromSelection(element);
            return;
        }

        // Add to multi-selection
        this.addToSelection(element);

        // Emit with count feedback
        const count = this.selectedElements.length + (this.selectedElement ? 1 : 0);
        this.emit('multiselect:changed', { elements: this.selectedElements, count });
    }

    /**
     * Add element to multi-selection
     * @param {Element} element
     */
    addToSelection(element) {
        const doc = this.getDocument();
        if (!doc || !element) return;

        if (element === doc.body || element === doc.documentElement) return;

        // Don't add duplicates
        if (this.selectedElements.includes(element)) return;

        // Don't add the primary selected element
        if (element === this.selectedElement) return;

        this.selectedElements.push(element);
        this.createMultiSelectOverlay(element);
    }

    /**
     * Remove element from multi-selection
     * @param {Element} element
     */
    removeFromSelection(element) {
        const index = this.selectedElements.indexOf(element);
        if (index > -1) {
            this.selectedElements.splice(index, 1);
            this.removeMultiSelectOverlay(element);
        }
    }

    /**
     * Create overlay for a single multi-selected element
     * @param {Element} element
     */
    createMultiSelectOverlay(element) {
        const doc = this.getDocument();
        if (!doc) return;

        const overlay = doc.createElement('div');
        overlay.className = 'editor-multi-select-overlay';

        doc.body.appendChild(overlay);

        this.multiSelectOverlays.push({
            element: element,
            overlay: overlay
        });

        this.updateSingleMultiSelectOverlay(element, overlay);
    }

    /**
     * Remove overlay for a specific element
     * @param {Element} element
     */
    removeMultiSelectOverlay(element) {
        const index = this.multiSelectOverlays.findIndex(item => item.element === element);
        if (index > -1) {
            const item = this.multiSelectOverlays[index];
            if (item.overlay && item.overlay.parentNode) {
                item.overlay.remove();
            }
            this.multiSelectOverlays.splice(index, 1);
        }
    }

    /**
     * Update single multi-select overlay position
     * @param {Element} element
     * @param {HTMLElement} overlay
     */
    updateSingleMultiSelectOverlay(element, overlay) {
        if (!element || !overlay) return;

        try {
            const rect = element.getBoundingClientRect();
            overlay.style.display = 'block';
            overlay.style.left = rect.left + 'px';
            overlay.style.top = rect.top + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
        } catch (e) {
            overlay.style.display = 'none';
        }
    }

    /**
     * Clear multi-selection
     */
    clearMultiSelection() {
        this.selectedElements.forEach(el => {
            try {
                el.classList.remove('editor-multi-selected');
            } catch (e) {}
        });
        this.selectedElements = [];
        this.clearMultiSelectOverlays();
        this.emit('multiselect:cleared');
    }

    /**
     * Update multi-selection overlays
     */
    updateMultiSelectOverlays() {
        // Remove overlays for elements no longer in DOM
        this.multiSelectOverlays = this.multiSelectOverlays.filter(item => {
            if (!item.element || !item.element.isConnected) {
                if (item.overlay && item.overlay.parentNode) {
                    item.overlay.remove();
                }
                return false;
            }
            return true;
        });

        // Also clean selectedElements
        this.selectedElements = this.selectedElements.filter(el => el && el.isConnected);

        // Update positions
        this.multiSelectOverlays.forEach(item => {
            this.updateSingleMultiSelectOverlay(item.element, item.overlay);
        });
    }

    /**
     * Clear multi-selection overlays
     */
    clearMultiSelectOverlays() {
        this.multiSelectOverlays.forEach(item => {
            try {
                if (item.overlay && item.overlay.parentNode) {
                    item.overlay.remove();
                }
            } catch (e) {}
        });
        this.multiSelectOverlays = [];
    }

    /**
     * Get all selected elements
     * @returns {Element[]}
     */
    getAllSelectedElements() {
        const elements = [...this.selectedElements];
        if (this.selectedElement && !elements.includes(this.selectedElement)) {
            elements.unshift(this.selectedElement);
        }
        return elements;
    }

    /**
     * Check if an element is selected
     * @param {Element} element
     * @returns {boolean}
     */
    isSelected(element) {
        return element === this.selectedElement ||
               this.selectedElements.includes(element);
    }

    /**
     * Get currently selected element
     * @returns {Element|null}
     */
    getSelectedElement() {
        // 요소가 DOM에서 분리되었는지 확인
        if (this.selectedElement && !this.selectedElement.isConnected) {
            this.selectedElement = null;
        }
        return this.selectedElement;
    }

    /**
     * Update overlay positions (call on scroll/resize)
     */
    updateOverlayPositions() {
        this.updateMultiSelectOverlays();
    }

    /**
     * Select parent element
     */
    selectParent() {
        if (!this.selectedElement) return;

        const doc = this.getDocument();
        if (!doc) return;

        const parent = this.selectedElement.parentElement;
        if (parent && parent !== doc.body && parent !== doc.documentElement) {
            this.selectElement(parent);
        }
    }

    /**
     * Select first child element
     */
    selectFirstChild() {
        if (!this.selectedElement) return;

        const firstChild = this.selectedElement.children[0];
        if (firstChild) {
            this.selectElement(firstChild);
        }
    }

    /**
     * Select next sibling element
     */
    selectNextSibling() {
        if (!this.selectedElement) return;

        const next = this.selectedElement.nextElementSibling;
        if (next) {
            this.selectElement(next);
        }
    }

    /**
     * Select previous sibling element
     */
    selectPreviousSibling() {
        if (!this.selectedElement) return;

        const prev = this.selectedElement.previousElementSibling;
        if (prev) {
            this.selectElement(prev);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.deselectElement();
        this.clearMultiSelection();
    }
}

export default SelectionManager;
