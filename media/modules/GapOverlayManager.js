import EventEmitter from './EventEmitter.js';

/**
 * GapOverlayManager - Handles flex/grid gap visualization and drag resizing
 */
class GapOverlayManager extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.zoomManager = null;
        this.selectedElement = null;
        this.gapOverlay = null;
        this.isDraggingGap = false;
        this._currentDragGapType = null;
        this._currentDragGapValue = null;
    }

    /**
     * Initialize with preview frame reference
     * @param {HTMLIFrameElement} previewFrame
     */
    init(previewFrame) {
        this.previewFrame = previewFrame;
    }

    /**
     * Set ZoomManager reference for accurate scale detection
     */
    setZoomManager(zoomManager) {
        this.zoomManager = zoomManager;
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        if (this.previewFrame === iframe) return;
        this.previewFrame = iframe;

        // 새 iframe에 gap overlay 재생성
        const doc = iframe?.contentDocument;
        if (doc) {
            this.createGapOverlay(doc);
        }
    }

    /**
     * Set reference to current selection and create gap overlay
     * @param {HTMLElement} element - Selected element
     */
    setSelection(element) {
        this.selectedElement = element;
    }

    /**
     * Create gap overlay element in iframe
     * @param {Document} doc - iframe document
     */
    createGapOverlay(doc) {
        // Remove existing
        const existing = doc.getElementById('editor-gap-overlay');
        if (existing) existing.remove();

        this.gapOverlay = doc.createElement('div');
        this.gapOverlay.id = 'editor-gap-overlay';
        this.gapOverlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 99996;
            display: none;
        `;
        doc.body.appendChild(this.gapOverlay);
    }

    /**
     * Get iframe transform (scale factor)
     * @returns {{scale: number}}
     */
    getIframeTransform() {
        // ZoomManager가 있으면 직접 zoomLevel 사용
        if (this.zoomManager) {
            return { scale: this.zoomManager.zoomLevel || 1 };
        }

        // fallback: previewFrame의 transform에서 추출
        if (this.previewFrame) {
            const transform = this.previewFrame.style.transform || '';
            const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
            if (scaleMatch) {
                return { scale: parseFloat(scaleMatch[1]) };
            }
        }

        return { scale: 1 };
    }

    /**
     * Update gap overlay visualization
     * @param {number} scale - Current zoom scale (optional, will be auto-detected)
     */
    updateGapOverlay(scale) {
        if (!this.gapOverlay || !this.selectedElement) {
            if (this.gapOverlay) this.gapOverlay.style.display = 'none';
            return;
        }

        const win = this.previewFrame.contentWindow;
        const doc = this.previewFrame.contentDocument;
        if (!win || !doc) return;

        // Auto-detect scale if not provided
        if (scale === undefined) {
            scale = this.getIframeTransform().scale || 1;
        }

        const computed = win.getComputedStyle(this.selectedElement);
        const display = computed.display;

        // Only show gap overlay for flex/grid containers
        if (display !== 'flex' && display !== 'grid' &&
            display !== 'inline-flex' && display !== 'inline-grid') {
            this.gapOverlay.style.display = 'none';
            return;
        }

        const gap = parseFloat(computed.gap) || 0;
        const rowGap = parseFloat(computed.rowGap) || gap;
        const columnGap = parseFloat(computed.columnGap) || gap;

        // Hide if no gap
        if (rowGap === 0 && columnGap === 0) {
            this.gapOverlay.style.display = 'none';
            return;
        }

        // Get visible children
        const children = Array.from(this.selectedElement.children).filter(el => {
            const cs = win.getComputedStyle(el);
            return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed';
        });

        if (children.length < 2) {
            this.gapOverlay.style.display = 'none';
            return;
        }

        // Clear existing gap areas
        this.gapOverlay.innerHTML = '';
        this.gapOverlay.style.display = 'block';

        const containerRect = this.selectedElement.getBoundingClientRect();
        const childRects = children.map(child => child.getBoundingClientRect());

        // Sort children by position for proper gap detection
        const sortedByRow = [...childRects].sort((a, b) => a.top - b.top || a.left - b.left);

        // Group children by rows
        const rows = [];
        let currentRow = [sortedByRow[0]];
        for (let i = 1; i < sortedByRow.length; i++) {
            const rect = sortedByRow[i];
            const lastInRow = currentRow[currentRow.length - 1];
            if (Math.abs(rect.top - lastInRow.top) < lastInRow.height * 0.3) {
                currentRow.push(rect);
            } else {
                rows.push(currentRow.sort((a, b) => a.left - b.left));
                currentRow = [rect];
            }
        }
        rows.push(currentRow.sort((a, b) => a.left - b.left));

        // Get scroll offsets
        const scrollX = win.scrollX || doc.documentElement.scrollLeft || 0;
        const scrollY = win.scrollY || doc.documentElement.scrollTop || 0;

        // Create column gap areas
        if (columnGap > 0) {
            for (const row of rows) {
                for (let i = 0; i < row.length - 1; i++) {
                    const current = row[i];
                    const next = row[i + 1];
                    const gapLeft = current.right;
                    const gapRight = next.left;
                    const gapWidth = gapRight - gapLeft;

                    if (gapWidth > 2) {
                        const gapArea = this.createGapArea(
                            gapLeft - containerRect.left,
                            Math.min(current.top, next.top) - containerRect.top,
                            gapWidth,
                            Math.max(current.height, next.height),
                            'horizontal',
                            'columnGap',
                            columnGap
                        );
                        this.gapOverlay.appendChild(gapArea);
                    }
                }
            }
        }

        // Create row gap areas
        if (rowGap > 0 && rows.length > 1) {
            for (let i = 0; i < rows.length - 1; i++) {
                const currentRowItems = rows[i];
                const nextRowItems = rows[i + 1];

                const currentBottom = Math.max(...currentRowItems.map(r => r.bottom));
                const nextTop = Math.min(...nextRowItems.map(r => r.top));
                const gapHeight = nextTop - currentBottom;

                if (gapHeight > 2) {
                    const rowLeft = Math.min(...currentRowItems.map(r => r.left), ...nextRowItems.map(r => r.left));
                    const rowRight = Math.max(...currentRowItems.map(r => r.right), ...nextRowItems.map(r => r.right));

                    const gapArea = this.createGapArea(
                        rowLeft - containerRect.left,
                        currentBottom - containerRect.top,
                        rowRight - rowLeft,
                        gapHeight,
                        'vertical',
                        'rowGap',
                        rowGap
                    );
                    this.gapOverlay.appendChild(gapArea);
                }
            }
        }

        // Position gap overlay (inside iframe, no scale adjustment needed)
        const rect = this.selectedElement.getBoundingClientRect();
        this.gapOverlay.style.left = (rect.left + scrollX) + 'px';
        this.gapOverlay.style.top = (rect.top + scrollY) + 'px';
        this.gapOverlay.style.width = rect.width + 'px';
        this.gapOverlay.style.height = rect.height + 'px';
    }

    /**
     * Create a gap area element for drag resizing
     */
    createGapArea(left, top, width, height, direction, gapType, currentValue) {
        const doc = this.previewFrame.contentDocument;
        const gapArea = doc.createElement('div');
        gapArea.className = `editor-gap-area ${direction}`;
        gapArea.style.left = left + 'px';
        gapArea.style.top = top + 'px';
        gapArea.style.width = width + 'px';
        gapArea.style.height = height + 'px';
        gapArea.dataset.gapType = gapType;
        gapArea.dataset.currentValue = currentValue;

        // If currently dragging this gap type, add dragging class
        if (this.isDraggingGap && this._currentDragGapType === gapType) {
            gapArea.classList.add('dragging');
        }

        // Add tooltip
        const tooltip = doc.createElement('div');
        tooltip.className = 'editor-gap-tooltip';
        tooltip.textContent = `${gapType === 'columnGap' ? 'Col' : 'Row'} Gap: ${currentValue}px`;
        tooltip.style.display = 'none';
        gapArea.appendChild(tooltip);

        // Show tooltip on hover
        gapArea.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
            if (direction === 'horizontal') {
                tooltip.style.left = '50%';
                tooltip.style.top = '-25px';
                tooltip.style.transform = 'translateX(-50%)';
            } else {
                tooltip.style.left = '50%';
                tooltip.style.top = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
            }
        });

        gapArea.addEventListener('mouseleave', () => {
            if (!this.isDraggingGap) {
                tooltip.style.display = 'none';
            }
        });

        // Setup drag handler
        this.setupGapDragHandler(gapArea, gapType, direction, tooltip);

        return gapArea;
    }

    /**
     * Setup drag handler for gap resizing
     */
    setupGapDragHandler(gapArea, gapType, direction, tooltip) {
        let startPos = 0;
        let startValue = 0;
        let oldValue = '';

        const onMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.isDraggingGap = true;
            gapArea.classList.add('dragging');

            startPos = direction === 'horizontal' ? e.pageX : e.pageY;
            startValue = parseFloat(gapArea.dataset.currentValue) || 0;

            // ★ computed style에서 oldValue 가져오기 (CSS 규칙/미디어쿼리에 있는 값 포함)
            // inline style만 읽으면 CSS 규칙의 값을 놓쳐 cascade prevention 실패
            const win = this.selectedElement.ownerDocument?.defaultView;
            if (win) {
                const computed = win.getComputedStyle(this.selectedElement);
                oldValue = computed[gapType] || '0px';
            } else {
                oldValue = this.selectedElement.style[gapType] || '0px';
            }

            if (tooltip) tooltip.style.display = 'block';

            const onMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                moveEvent.stopPropagation();

                const currentPos = direction === 'horizontal' ? moveEvent.pageX : moveEvent.pageY;
                const delta = currentPos - startPos;
                const currentScale = this.getIframeTransform().scale;
                const newValue = Math.max(0, Math.round(startValue + delta / currentScale));

                if (gapType === 'columnGap') {
                    this.selectedElement.style.columnGap = newValue + 'px';
                } else if (gapType === 'rowGap') {
                    this.selectedElement.style.rowGap = newValue + 'px';
                }

                this._currentDragGapValue = newValue;
                this._currentDragGapType = gapType;

                // Emit event for overlay update
                this.emit('gap:move', {
                    element: this.selectedElement,
                    gapType,
                    value: newValue
                });

                // Update tooltip
                const draggingArea = this.gapOverlay.querySelector('.editor-gap-area.dragging');
                if (draggingArea) {
                    const tip = draggingArea.querySelector('.editor-gap-tooltip');
                    if (tip) {
                        tip.style.display = 'block';
                        tip.textContent = `${gapType === 'columnGap' ? 'Col' : 'Row'} Gap: ${newValue}px`;
                    }
                }
            };

            const onMouseUp = (upEvent) => {
                upEvent.preventDefault();
                upEvent.stopPropagation();

                const finalValue = this._currentDragGapValue || 0;

                this.isDraggingGap = false;
                this._currentDragGapType = null;
                this._currentDragGapValue = null;

                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                const iframeDoc = this.previewFrame.contentDocument;
                if (iframeDoc) {
                    iframeDoc.removeEventListener('mousemove', onMouseMove);
                    iframeDoc.removeEventListener('mouseup', onMouseUp);
                }

                const changes = [];
                if (finalValue !== startValue) {
                    changes.push({
                        property: gapType,
                        oldValue: oldValue || '0px',
                        newValue: finalValue + 'px'
                    });
                }

                this.emit('gap:complete', {
                    element: this.selectedElement,
                    changes
                });

                // Refresh gap overlay
                this.updateGapOverlay(this.getIframeTransform().scale);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            const iframeDoc = this.previewFrame.contentDocument;
            if (iframeDoc) {
                iframeDoc.addEventListener('mousemove', onMouseMove);
                iframeDoc.addEventListener('mouseup', onMouseUp);
            }
        };

        gapArea.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Hide gap overlay
     */
    hide() {
        if (this.gapOverlay) {
            this.gapOverlay.style.display = 'none';
        }
    }

    /**
     * Show gap overlay
     */
    show() {
        if (this.gapOverlay && this.selectedElement) {
            this.updateGapOverlay(this.getIframeTransform().scale);
        }
    }
}

export default GapOverlayManager;
