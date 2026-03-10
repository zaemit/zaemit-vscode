import EventEmitter from './EventEmitter.js';

/**
 * SpacingDragManager - Handles margin and padding drag adjustments
 */
class SpacingDragManager extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.selectedElement = null;
    }

    /**
     * Initialize with preview frame reference
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
        this.previewFrame = iframe;
    }

    /**
     * Get the document from selected element or previewFrame
     * @returns {Document|null}
     */
    _getDocument() {
        if (this.selectedElement?.ownerDocument) {
            return this.selectedElement.ownerDocument;
        }
        return this.previewFrame?.contentDocument;
    }

    /**
     * Get the window from selected element or previewFrame
     * @returns {Window|null}
     */
    _getWindow() {
        if (this.selectedElement?.ownerDocument?.defaultView) {
            return this.selectedElement.ownerDocument.defaultView;
        }
        return this.previewFrame?.contentWindow;
    }

    /**
     * Set reference to current selection
     * @param {HTMLElement} element - Selected element
     */
    setSelection(element) {
        this.selectedElement = element;
    }

    /**
     * Get iframe transform (scale factor)
     * @returns {{scale: number}}
     */
    getIframeTransform() {
        const wrapper = document.querySelector('.preview-wrapper');
        if (!wrapper) return { scale: 1 };

        const transform = wrapper.style.transform || '';
        const scaleMatch = transform.match(/scale\(([\d.]+)\)/);

        return {
            scale: scaleMatch ? parseFloat(scaleMatch[1]) : 1
        };
    }

    /**
     * Convert kebab-case to camelCase
     * @param {string} str
     * @returns {string}
     */
    toCamelCase(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    }

    /**
     * Setup spacing handles event listeners
     * @param {Document} doc - iframe document
     */
    setupSpacingHandles(doc) {
        const allHandles = doc.querySelectorAll('.editor-spacing-handle');
        allHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.startSpacingDrag(e));
        });
    }

    /**
     * Start spacing drag operation
     * @param {Object} data - { type: 'margin'|'padding', side: 'top'|'right'|'bottom'|'left', event: MouseEvent }
     */
    startSpacingDrag(data) {
        if (!this.selectedElement) return;

        const { type, side, event: e } = data;
        e.preventDefault();
        e.stopPropagation();

        const direction = side;

        // Create overlay immediately for smooth start
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 99999;
            cursor: ${direction === 'top' || direction === 'bottom' ? 'ns-resize' : 'ew-resize'};
        `;
        document.body.appendChild(overlay);

        // Get handle for visual feedback
        const handle = e.target;
        if (handle) handle.classList.add('dragging');

        // Cache values after overlay is shown
        const spacingType = `${type}-${side}`; // e.g., 'margin-top', 'padding-left'
        const iframeDoc = this._getDocument();
        const iframeWindow = this._getWindow();
        const computed = iframeWindow.getComputedStyle(this.selectedElement);
        const camelCaseProp = this.toCamelCase(spacingType);
        const startValue = parseFloat(computed[camelCaseProp]) || 0;

        const startY = e.pageY;
        const startX = e.pageX;
        const scale = this.getIframeTransform().scale;

        // ★ computed style에서 oldValue 가져오기 (CSS 규칙 포함)
        const oldValue = computed[camelCaseProp] || '0px';

        const onMouseMove = (moveEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();

            let delta;
            // Margin: drag outward to increase (away from element)
            // Padding: drag inward to increase (toward element center)
            if (direction === 'top' || direction === 'bottom') {
                const currentY = moveEvent.pageY;
                const rawDelta = (currentY - startY) / scale;

                if (type === 'margin') {
                    // Margin-top: drag up (negative Y) to increase
                    // Margin-bottom: drag down (positive Y) to increase
                    delta = direction === 'top' ? -rawDelta : rawDelta;
                } else {
                    // Padding-top: drag down (positive Y) to increase
                    // Padding-bottom: drag up (negative Y) to increase
                    delta = direction === 'top' ? rawDelta : -rawDelta;
                }
            } else {
                const currentX = moveEvent.pageX;
                const rawDelta = (currentX - startX) / scale;

                if (type === 'margin') {
                    // Margin-left: drag left (negative X) to increase
                    // Margin-right: drag right (positive X) to increase
                    delta = direction === 'left' ? -rawDelta : rawDelta;
                } else {
                    // Padding-left: drag right (positive X) to increase
                    // Padding-right: drag left (negative X) to increase
                    delta = direction === 'left' ? rawDelta : -rawDelta;
                }
            }

            let newValue = Math.max(0, Math.round(startValue + delta));

            // Ctrl: 10씩, Shift: 50씩 스냅
            if (moveEvent.ctrlKey) {
                newValue = Math.round(newValue / 10) * 10;
            } else if (moveEvent.shiftKey) {
                newValue = Math.round(newValue / 50) * 50;
            }

            this.selectedElement.style[camelCaseProp] = newValue + 'px';

            this.emit('spacing:move', {
                element: this.selectedElement,
                property: camelCaseProp,
                value: newValue
            });
        };

        const onMouseUp = (upEvent) => {
            upEvent.preventDefault();
            upEvent.stopPropagation();

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (iframeDoc) {
                iframeDoc.removeEventListener('mousemove', onMouseMove);
                iframeDoc.removeEventListener('mouseup', onMouseUp);
            }

            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }

            if (handle) handle.classList.remove('dragging');

            // ★ 인라인 스타일이 설정되지 않은 경우 (드래그 안 함) computed 값 사용
            let newValue = this.selectedElement.style[camelCaseProp];
            if (!newValue) {
                // 드래그 안 했으면 현재 computed 값을 newValue로 사용 (변경 없음)
                const currentComputed = iframeWindow.getComputedStyle(this.selectedElement);
                newValue = currentComputed[camelCaseProp] || '0px';
            }

            const changes = [];

            if (oldValue !== newValue) {
                changes.push({
                    property: camelCaseProp,
                    oldValue: oldValue,
                    newValue: newValue
                });
            }

            this.emit('spacing:complete', {
                element: this.selectedElement,
                changes
            });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        if (iframeDoc) {
            iframeDoc.addEventListener('mousemove', onMouseMove);
            iframeDoc.addEventListener('mouseup', onMouseUp);
        }
    }
}

export default SpacingDragManager;
