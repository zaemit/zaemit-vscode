import EventEmitter from './EventEmitter.js';

/**
 * ClipboardManager - Handles element copy/cut/paste operations
 */
class ClipboardManager extends EventEmitter {
    constructor(previewFrame) {
        super();
        this.previewFrame = previewFrame;
        this.clipboard = null;
        this.isCut = false;
    }

    getDocument() {
        return this.previewFrame?.contentDocument || null;
    }

    /**
     * Copy elements to clipboard
     * @param {HTMLElement|HTMLElement[]} elements - Element(s) to copy
     */
    copy(elements) {
        if (!elements) return false;

        // Normalize to array
        const elementsArray = Array.isArray(elements) ? elements : [elements];
        if (elementsArray.length === 0) return false;

        const doc = this.getDocument();
        if (!doc) return false;

        // Check for body/html elements
        for (const el of elementsArray) {
            if (el === doc.body || el === doc.documentElement) {
                this.emit('error', { message: 'Cannot copy body or html element' });
                return false;
            }
        }

        // Clone elements
        this.clipboard = elementsArray.map(el => el.cloneNode(true));
        this.isCut = false;

        this.emit('copy', { count: elementsArray.length });
        return true;
    }

    /**
     * Cut elements to clipboard
     * @param {HTMLElement|HTMLElement[]} elements - Element(s) to cut
     */
    cut(elements) {
        if (!elements) return false;

        // Normalize to array
        const elementsArray = Array.isArray(elements) ? elements : [elements];
        if (elementsArray.length === 0) return false;

        const doc = this.getDocument();
        if (!doc) return false;

        // Check for body/html elements
        for (const el of elementsArray) {
            if (el === doc.body || el === doc.documentElement) {
                this.emit('error', { message: 'Cannot cut body or html element' });
                return false;
            }
        }

        // Clone elements before removing
        this.clipboard = elementsArray.map(el => el.cloneNode(true));
        this.isCut = true;

        // Remove elements
        for (const el of elementsArray) {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }

        this.emit('cut', { count: elementsArray.length });
        return true;
    }

    /**
     * Paste elements from clipboard
     * @param {HTMLElement} targetParent - Parent element to paste into
     * @returns {HTMLElement[]} - Pasted elements
     */
    paste(targetParent) {
        if (!this.clipboard || this.clipboard.length === 0) {
            this.emit('error', { message: 'Nothing to paste' });
            return [];
        }

        const doc = this.getDocument();
        if (!doc) return [];

        // Default to body if no target
        const parent = targetParent || doc.body;

        // Clone and insert elements
        const pasted = [];
        for (const item of this.clipboard) {
            const clone = item.cloneNode(true);
            parent.appendChild(clone);
            pasted.push(clone);
        }

        // Clear clipboard if it was a cut operation
        if (this.isCut) {
            this.clipboard = null;
            this.isCut = false;
        }

        this.emit('paste', { count: pasted.length, elements: pasted });
        return pasted;
    }

    /**
     * Check if clipboard has content
     */
    hasContent() {
        return this.clipboard && this.clipboard.length > 0;
    }

    /**
     * Clear clipboard
     */
    clear() {
        this.clipboard = null;
        this.isCut = false;
    }

    /**
     * Get clipboard content count
     */
    getCount() {
        return this.clipboard ? this.clipboard.length : 0;
    }
}

export default ClipboardManager;
