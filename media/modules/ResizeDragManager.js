import EventEmitter from './EventEmitter.js';

/**
 * ResizeDragManager - Handles element resize, rotate, and move operations
 */
class ResizeDragManager extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.selectedElement = null;
        this.overlay = null;
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
     * Set references to current selection
     * @param {HTMLElement} element - Selected element
     * @param {HTMLElement} overlay - Overlay element
     */
    setSelection(element, overlay) {
        this.selectedElement = element;
        this.overlay = overlay;
    }

    /**
     * Get iframe transform (scale factor)
     * @returns {{scale: number, translateX: number, translateY: number}}
     */
    getIframeTransform() {
        // iframe 엘리먼트 → .preview-wrapper 순으로 transform 탐색
        const sources = [
            this.previewFrame,
            document.querySelector('.preview-wrapper')
        ];
        for (const el of sources) {
            const transform = el?.style?.transform;
            if (!transform) continue;
            const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
            if (!scaleMatch) continue;
            const translateMatch = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
            return {
                scale: parseFloat(scaleMatch[1]),
                translateX: translateMatch ? parseFloat(translateMatch[1]) : 0,
                translateY: translateMatch ? parseFloat(translateMatch[2]) : 0
            };
        }
        // fallback: layout vs visual size ratio
        const iframe = this.previewFrame;
        if (iframe) {
            const cssW = iframe.offsetWidth;
            const visualW = iframe.getBoundingClientRect().width;
            if (cssW > 0 && visualW > 0 && Math.abs(visualW / cssW - 1) > 0.01) {
                return { scale: visualW / cssW, translateX: 0, translateY: 0 };
            }
        }
        return { scale: 1, translateX: 0, translateY: 0 };
    }

    /**
     * Double-click to toggle between auto and 100%
     * @param {Object} data - { position: string }
     */
    resetSizeToAuto(data) {
        if (!this.selectedElement) return;

        const handle = data.position;
        const iframeDoc = this._getDocument();
        const computed = iframeDoc?.defaultView?.getComputedStyle(this.selectedElement);

        // ★ 실제 CSS 값 가져오기 (인라인 → CSS 규칙 순서)
        // computed는 항상 px 값이므로 토글 판단에 사용 불가
        const getActualCSSValue = (prop) => {
            // 1. 인라인 스타일 확인
            const inline = this.selectedElement.style[prop];
            if (inline) return inline;

            // 2. CSS 규칙에서 확인 (zaemit-temp-styles 또는 style.css)
            const selector = this._getBestSelector();
            if (selector) {
                for (const sheet of iframeDoc.styleSheets) {
                    try {
                        for (const rule of sheet.cssRules) {
                            if (rule.selectorText === selector) {
                                const value = rule.style.getPropertyValue(prop);
                                if (value) return value;
                            }
                        }
                    } catch (e) { /* CORS */ }
                }
            }

            // 3. 없으면 빈 문자열 (auto로 취급)
            return '';
        };

        const actualWidth = getActualCSSValue('width');
        const actualHeight = getActualCSSValue('height');

        // computed 값은 Undo용 oldValue로 사용
        const oldWidth = computed?.width || 'auto';
        const oldHeight = computed?.height || 'auto';

        const toggleSize = (actualValue) => {
            // 실제 CSS 값 기준으로 토글
            if (!actualValue || actualValue === 'auto') {
                return '100%';
            } else if (actualValue === '100%') {
                return 'auto';
            } else {
                // px 등 다른 값이면 auto로
                return 'auto';
            }
        };

        const isHorizontal = handle === 'e' || handle === 'w';
        const isVertical = handle === 'n' || handle === 's';
        const isCorner = handle.length === 2;

        // ★ min/max 제약 확인
        const minWidth = computed?.minWidth;
        const maxWidth = computed?.maxWidth;
        const minHeight = computed?.minHeight;
        const maxHeight = computed?.maxHeight;

        // min/max가 설정되어 있는지 확인 (기본값 제외)
        const hasMinWidth = minWidth && minWidth !== '0px' && minWidth !== 'auto';
        const hasMaxWidth = maxWidth && maxWidth !== 'none' && maxWidth !== 'auto';
        const hasMinHeight = minHeight && minHeight !== '0px' && minHeight !== 'auto';
        const hasMaxHeight = maxHeight && maxHeight !== 'none' && maxHeight !== 'auto';

        let toastMsg = '';
        let warningMsg = '';
        const changes = [];

        if (isHorizontal) {
            const newWidth = toggleSize(actualWidth);
            changes.push({ property: 'width', oldValue: oldWidth, newValue: newWidth });
            this.selectedElement.style.width = newWidth;
            toastMsg = `Width: ${newWidth}`;

            // min/max-width 경고
            if (hasMinWidth || hasMaxWidth) {
                const constraints = [];
                if (hasMinWidth) constraints.push(`min: ${minWidth}`);
                if (hasMaxWidth) constraints.push(`max: ${maxWidth}`);
                warningMsg = `⚠️ 너비 제약: ${constraints.join(', ')}`;
            }
        } else if (handle === 's') {
            // 아래쪽: 무조건 auto (토글 없음)
            changes.push({ property: 'height', oldValue: oldHeight, newValue: 'auto' });
            this.selectedElement.style.height = 'auto';
            toastMsg = `Height: auto`;

            // min/max-height 경고
            if (hasMinHeight || hasMaxHeight) {
                const constraints = [];
                if (hasMinHeight) constraints.push(`min: ${minHeight}`);
                if (hasMaxHeight) constraints.push(`max: ${maxHeight}`);
                warningMsg = `⚠️ 높이 제약: ${constraints.join(', ')}`;
            }
        } else if (isVertical) {
            // 위쪽: 기존 토글 유지
            const newHeight = toggleSize(actualHeight);
            changes.push({ property: 'height', oldValue: oldHeight, newValue: newHeight });
            this.selectedElement.style.height = newHeight;
            toastMsg = `Height: ${newHeight}`;

            // min/max-height 경고
            if (hasMinHeight || hasMaxHeight) {
                const constraints = [];
                if (hasMinHeight) constraints.push(`min: ${minHeight}`);
                if (hasMaxHeight) constraints.push(`max: ${maxHeight}`);
                warningMsg = `⚠️ 높이 제약: ${constraints.join(', ')}`;
            }
        } else if (isCorner) {
            const newWidth = toggleSize(actualWidth);
            const newHeight = toggleSize(actualHeight);
            changes.push({ property: 'width', oldValue: oldWidth, newValue: newWidth });
            changes.push({ property: 'height', oldValue: oldHeight, newValue: newHeight });
            this.selectedElement.style.width = newWidth;
            this.selectedElement.style.height = newHeight;
            toastMsg = `Size: ${newWidth} × ${newHeight}`;

            // min/max 경고 (너비와 높이 모두)
            const constraints = [];
            if (hasMinWidth) constraints.push(`min-width: ${minWidth}`);
            if (hasMaxWidth) constraints.push(`max-width: ${maxWidth}`);
            if (hasMinHeight) constraints.push(`min-height: ${minHeight}`);
            if (hasMaxHeight) constraints.push(`max-height: ${maxHeight}`);
            if (constraints.length > 0) {
                warningMsg = `⚠️ 크기 제약: ${constraints.join(', ')}`;
            }
        }

        // 경고 메시지가 있으면 추가
        if (warningMsg) {
            toastMsg = `${toastMsg}\n${warningMsg}`;
        }

        this.emit('resize:complete', {
            element: this.selectedElement,
            changes,
            message: toastMsg
        });
    }

    /**
     * Start resize operation
     * @param {Object} data - { position: string, event: MouseEvent }
     */
    startResize(data) {
        const { position, event: e } = data;
        e.preventDefault();
        e.stopPropagation();
        if (!this.selectedElement) return;

        const handle = position;
        const iframeDoc = this._getDocument();

        // Create overlay immediately for smooth start
        const cursorMap = {
            'nw': 'nwse-resize', 'se': 'nwse-resize',
            'ne': 'nesw-resize', 'sw': 'nesw-resize',
            'n': 'ns-resize', 's': 'ns-resize',
            'e': 'ew-resize', 'w': 'ew-resize'
        };
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 99999;
            cursor: ${cursorMap[handle] || 'nwse-resize'};
            user-select: none;
            -webkit-user-select: none;
        `;
        document.body.appendChild(overlay);

        // Prevent text selection
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        if (iframeDoc && iframeDoc.body) {
            iframeDoc.body.style.userSelect = 'none';
            iframeDoc.body.style.webkitUserSelect = 'none';
        }

        // Cache values after overlay is shown (user sees immediate feedback)
        const scale = this.getIframeTransform().scale;
        // screenX/Y: 어느 document에서 이벤트가 발생해도 동일한 좌표 공간
        const startX = e.screenX;
        const startY = e.screenY;
        const startRect = this.selectedElement.getBoundingClientRect();
        // iframe 내부 getBoundingClientRect()는 부모 scale 영향 없음 — 그대로 사용
        const startWidth = startRect.width;
        const startHeight = startRect.height;
        const computed = iframeDoc.defaultView.getComputedStyle(this.selectedElement);
        const startLeft = parseFloat(computed.left) || 0;
        const startTop = parseFloat(computed.top) || 0;

        // ★ computed style에서 oldValue 가져오기 (CSS 규칙 포함)
        const oldStyles = {
            width: computed.width || 'auto',
            height: computed.height || 'auto',
            left: computed.left || 'auto',
            top: computed.top || 'auto'
        };

        const onMouseMove = (moveEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const dx = (moveEvent.screenX - startX) / scale;
            const dy = (moveEvent.screenY - startY) / scale;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (handle.includes('e')) newWidth = startWidth + dx;
            if (handle.includes('w')) { newWidth = startWidth - dx; newLeft = startLeft + dx; }
            if (handle.includes('s')) newHeight = startHeight + dy;
            if (handle.includes('n')) { newHeight = startHeight - dy; newTop = startTop + dy; }

            if (newWidth >= 20) {
                this.selectedElement.style.width = Math.round(newWidth) + 'px';
                if (handle.includes('w')) this.selectedElement.style.left = Math.round(newLeft) + 'px';
            }
            if (newHeight >= 20) {
                this.selectedElement.style.height = Math.round(newHeight) + 'px';
                if (handle.includes('n')) this.selectedElement.style.top = Math.round(newTop) + 'px';
            }

            this.emit('resize:move', { element: this.selectedElement });
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

            // Restore text selection
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
            if (iframeDoc && iframeDoc.body) {
                iframeDoc.body.style.userSelect = '';
                iframeDoc.body.style.webkitUserSelect = '';
            }

            // ★ 인라인 스타일이 설정되지 않은 경우 (드래그 안 함) computed 값 사용
            const currentComputed = iframeDoc.defaultView.getComputedStyle(this.selectedElement);
            const getNewValue = (prop) => {
                const inline = this.selectedElement.style[prop];
                // 인라인 스타일이 없으면 computed 값 사용 (변경 없음)
                return inline || currentComputed[prop] || 'auto';
            };

            const changes = [];
            const newWidth = getNewValue('width');
            const newHeight = getNewValue('height');
            const newLeft = getNewValue('left');
            const newTop = getNewValue('top');

            if (oldStyles.width !== newWidth) {
                changes.push({ property: 'width', oldValue: oldStyles.width, newValue: newWidth });
            }
            if (oldStyles.height !== newHeight) {
                changes.push({ property: 'height', oldValue: oldStyles.height, newValue: newHeight });
            }
            if (oldStyles.left !== newLeft) {
                changes.push({ property: 'left', oldValue: oldStyles.left, newValue: newLeft });
            }
            if (oldStyles.top !== newTop) {
                changes.push({ property: 'top', oldValue: oldStyles.top, newValue: newTop });
            }

            this.emit('resize:complete', { element: this.selectedElement, changes });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        if (iframeDoc) {
            iframeDoc.addEventListener('mousemove', onMouseMove);
            iframeDoc.addEventListener('mouseup', onMouseUp);
        }
    }

    /**
     * Start rotate operation
     * @param {MouseEvent} e
     */
    startRotate(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.selectedElement) return;

        const doc = this._getDocument();
        const iframeRect = this.previewFrame.getBoundingClientRect();
        const rect = this.selectedElement.getBoundingClientRect();

        const centerX = iframeRect.left + rect.left + rect.width / 2;
        const centerY = iframeRect.top + rect.top + rect.height / 2;

        // CSS 규칙에서 현재 transform 읽기 (inline이 비어있을 수 있음)
        const oldTransform = this._readCurrentTransform(this.selectedElement);

        // Get current rotation angle from transform
        let currentRotation = 0;
        const rotateMatch = oldTransform.match(/rotate\(([-\d.]+)deg\)/);
        if (rotateMatch) {
            currentRotation = parseFloat(rotateMatch[1]);
        }

        // Calculate initial angle from mouse position
        const initialDx = e.clientX - centerX;
        const initialDy = e.clientY - centerY;
        const initialAngle = Math.atan2(initialDy, initialDx) * (180 / Math.PI) + 90;

        const rotateHandle = this.overlay?.querySelector('.editor-rotate-handle');
        if (rotateHandle) rotateHandle.style.cursor = 'grabbing';

        const onMouseMove = (moveEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            if (!this.selectedElement) return;

            const dx = moveEvent.clientX - centerX;
            const dy = moveEvent.clientY - centerY;
            let mouseAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

            // Calculate angle delta from initial mouse position
            let angleDelta = mouseAngle - initialAngle;

            // Calculate final angle (current rotation + delta)
            let angle = currentRotation + angleDelta;

            // Normalize angle to 0-360
            while (angle < 0) angle += 360;
            while (angle >= 360) angle -= 360;

            // Shift: 15 degree snap
            if (moveEvent.shiftKey) {
                angle = Math.round(angle / 15) * 15;
            }
            // Ctrl: 45 degree snap
            if (moveEvent.ctrlKey) {
                angle = Math.round(angle / 45) * 45;
            }

            // rotate만 변경, 기존 scaleX/scaleY 등 보존
            const preserved = this._parsePreservedTransform(oldTransform);
            let newTransformStr = `rotate(${Math.round(angle)}deg)`;
            if (preserved.scaleX) newTransformStr += ` scaleX(${preserved.scaleX})`;
            if (preserved.scaleY) newTransformStr += ` scaleY(${preserved.scaleY})`;
            if (preserved.others) newTransformStr = preserved.others + ' ' + newTransformStr;
            this.selectedElement.style.transform = newTransformStr;
            this.emit('rotate:move', { element: this.selectedElement, angle });
        };

        const onMouseUp = (upEvent) => {
            upEvent.preventDefault();
            upEvent.stopPropagation();

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            doc.removeEventListener('mousemove', onMouseMove);
            doc.removeEventListener('mouseup', onMouseUp);

            if (rotateHandle) rotateHandle.style.cursor = 'grab';

            const changes = [];
            if (this.selectedElement && oldTransform !== this.selectedElement.style.transform) {
                changes.push({
                    property: 'transform',
                    oldValue: oldTransform,
                    newValue: this.selectedElement.style.transform
                });
            }

            this.emit('rotate:complete', { element: this.selectedElement, changes });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        doc.addEventListener('mousemove', onMouseMove);
        doc.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Collect snap targets with rect info for rendering
     */
    _collectSnapTargets(element) {
        const doc = element.ownerDocument;
        const win = doc.defaultView;
        const targets = [];

        // iframe 경계
        targets.push({
            type: 'frame',
            rect: { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight,
                    width: win.innerWidth, height: win.innerHeight }
        });

        // 부모 요소 경계
        const parent = element.parentElement;
        if (parent && parent !== doc.body && parent !== doc.documentElement) {
            const pr = parent.getBoundingClientRect();
            targets.push({
                type: 'parent',
                rect: { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom,
                        width: pr.width, height: pr.height }
            });
        }

        // 형제 요소들
        if (parent) {
            for (const sib of parent.children) {
                if (sib === element) continue;
                const cn = sib.className || '';
                if (typeof cn === 'string' && cn.includes('editor-')) continue;
                try {
                    const r = sib.getBoundingClientRect();
                    if (r.width < 1 && r.height < 1) continue;
                    targets.push({
                        type: 'sibling',
                        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                                width: r.width, height: r.height }
                    });
                } catch (e) {}
            }
        }

        return targets;
    }

    /**
     * Check snap — returns offset + matched targets for rendering
     */
    _checkSnap(movingRect, targets, threshold = 5) {
        const mxE = [movingRect.left, movingRect.left + movingRect.width / 2, movingRect.right];
        const myE = [movingRect.top, movingRect.top + movingRect.height / 2, movingRect.bottom];

        // X축: find best snap position
        let bestDx = threshold + 1, snapXPos = null, snapXOffset = null;
        for (const t of targets) {
            const tx = [t.rect.left, t.rect.left + t.rect.width / 2, t.rect.right];
            for (const me of mxE) {
                for (const te of tx) {
                    const d = Math.abs(me - te);
                    if (d < bestDx) { bestDx = d; snapXPos = te; snapXOffset = te - me; }
                }
            }
        }
        // Collect all targets matching at that snap X position
        let xMatches = [];
        if (bestDx <= threshold && snapXPos !== null) {
            for (const t of targets) {
                const tx = [t.rect.left, t.rect.left + t.rect.width / 2, t.rect.right];
                for (const te of tx) {
                    if (Math.abs(te - snapXPos) < 1) {
                        xMatches.push(t);
                        break;
                    }
                }
            }
        }

        // Y축: find best snap position
        let bestDy = threshold + 1, snapYPos = null, snapYOffset = null;
        for (const t of targets) {
            const ty = [t.rect.top, t.rect.top + t.rect.height / 2, t.rect.bottom];
            for (const me of myE) {
                for (const te of ty) {
                    const d = Math.abs(me - te);
                    if (d < bestDy) { bestDy = d; snapYPos = te; snapYOffset = te - me; }
                }
            }
        }
        let yMatches = [];
        if (bestDy <= threshold && snapYPos !== null) {
            for (const t of targets) {
                const ty = [t.rect.top, t.rect.top + t.rect.height / 2, t.rect.bottom];
                for (const te of ty) {
                    if (Math.abs(te - snapYPos) < 1) {
                        yMatches.push(t);
                        break;
                    }
                }
            }
        }

        return {
            snapX: bestDx <= threshold ? { offset: snapXOffset, pos: snapXPos, matches: xMatches } : null,
            snapY: bestDy <= threshold ? { offset: snapYOffset, pos: snapYPos, matches: yMatches } : null
        };
    }

    /**
     * Render snap guides: alignment lines + crosshair markers + gap distance labels
     */
    _renderSnapGuides(doc, movingRect, snapResult) {
        this._clearSnapLines(doc);

        const { snapX, snapY } = snapResult;
        if (!snapX && !snapY) return;

        const c = doc.createElement('div');
        c.className = 'editor-snap-lines';
        c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999;';

        const COLOR = '#7CFC00';
        const zoom = this.getIframeTransform().scale;
        const inv = 1 / zoom;
        const PAD = 10;

        // X축 snap → 수직 정렬선
        if (snapX) {
            const x = snapX.pos;
            let lineTop = movingRect.top, lineBot = movingRect.bottom;
            for (const m of snapX.matches) {
                lineTop = Math.min(lineTop, m.rect.top);
                lineBot = Math.max(lineBot, m.rect.bottom);
            }
            // 수직선
            this._snapLine(c, x - 0.5 * inv, lineTop - PAD, inv, lineBot - lineTop + PAD * 2, COLOR, inv);
            // 이동 요소 마커
            this._snapMarker(c, x, movingRect.top, COLOR, inv);
            this._snapMarker(c, x, movingRect.bottom, COLOR, inv);
            // 타겟 마커 + 갭 거리
            for (const m of snapX.matches) {
                if (m.type !== 'frame') {
                    this._snapMarker(c, x, m.rect.top, COLOR, inv);
                    this._snapMarker(c, x, m.rect.bottom, COLOR, inv);
                }
                // 수직 갭 계산
                let gap = 0, gapMid = 0;
                if (movingRect.bottom <= m.rect.top) {
                    gap = m.rect.top - movingRect.bottom;
                    gapMid = (movingRect.bottom + m.rect.top) / 2;
                } else if (m.rect.bottom <= movingRect.top) {
                    gap = movingRect.top - m.rect.bottom;
                    gapMid = (m.rect.bottom + movingRect.top) / 2;
                }
                if (gap > 1) {
                    this._snapGapLine(c, x, Math.min(movingRect.bottom, m.rect.bottom),
                                      Math.max(movingRect.top, m.rect.top), 'v', COLOR, inv);
                    this._snapLabel(c, x + 8 * inv, gapMid - 9 * inv, Math.round(gap), COLOR, inv);
                }
            }
        }

        // Y축 snap → 수평 정렬선
        if (snapY) {
            const y = snapY.pos;
            let lineLeft = movingRect.left, lineRight = movingRect.right;
            for (const m of snapY.matches) {
                lineLeft = Math.min(lineLeft, m.rect.left);
                lineRight = Math.max(lineRight, m.rect.right);
            }
            // 수평선
            this._snapLine(c, lineLeft - PAD, y - 0.5 * inv, lineRight - lineLeft + PAD * 2, inv, COLOR, inv);
            // 이동 요소 마커
            this._snapMarker(c, movingRect.left, y, COLOR, inv);
            this._snapMarker(c, movingRect.right, y, COLOR, inv);
            // 타겟 마커 + 갭 거리
            for (const m of snapY.matches) {
                if (m.type !== 'frame') {
                    this._snapMarker(c, m.rect.left, y, COLOR, inv);
                    this._snapMarker(c, m.rect.right, y, COLOR, inv);
                }
                // 수평 갭 계산
                let gap = 0, gapMid = 0;
                if (movingRect.right <= m.rect.left) {
                    gap = m.rect.left - movingRect.right;
                    gapMid = (movingRect.right + m.rect.left) / 2;
                } else if (m.rect.right <= movingRect.left) {
                    gap = movingRect.left - m.rect.right;
                    gapMid = (m.rect.right + movingRect.left) / 2;
                }
                if (gap > 1) {
                    this._snapGapLine(c, Math.min(movingRect.right, m.rect.right), y,
                                      Math.max(movingRect.left, m.rect.left), 'h', COLOR, inv);
                    this._snapLabel(c, gapMid - 14 * inv, y + 8 * inv, Math.round(gap), COLOR, inv);
                }
            }
        }

        doc.documentElement.appendChild(c);
    }

    _snapLine(container, x, y, w, h, color, inv = 1) {
        const doc = container.ownerDocument;
        // 어두운 배경(그림자) — 어떤 배경에서도 보이도록
        const shadow = doc.createElement('div');
        const sw = Math.max(w, 3 * inv);
        const sh = Math.max(h, 3 * inv);
        shadow.style.cssText = `position:fixed;left:${x - inv}px;top:${y - inv}px;width:${sw}px;height:${sh}px;background:rgba(0,0,0,0.5);pointer-events:none;`;
        container.appendChild(shadow);
        // 밝은 선
        const el = doc.createElement('div');
        el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${color};pointer-events:none;`;
        container.appendChild(el);
    }

    _snapMarker(container, x, y, color, inv = 1) {
        const S = 10 * inv;
        const T = Math.max(inv, 1);
        const doc = container.ownerDocument;
        const h = doc.createElement('div');
        h.style.cssText = `position:fixed;left:${x - S / 2}px;top:${y - T / 2}px;width:${S}px;height:${T}px;background:${color};box-shadow:0 0 ${2 * inv}px rgba(0,0,0,0.7);pointer-events:none;`;
        const v = doc.createElement('div');
        v.style.cssText = `position:fixed;left:${x - T / 2}px;top:${y - S / 2}px;width:${T}px;height:${S}px;background:${color};box-shadow:0 0 ${2 * inv}px rgba(0,0,0,0.7);pointer-events:none;`;
        container.appendChild(h);
        container.appendChild(v);
    }

    _snapGapLine(container, from1, from2, to, dir, color, inv = 1) {
        const T = Math.max(inv, 1);
        const dash = 4 * inv;
        const doc = container.ownerDocument;
        if (dir === 'v') {
            const top = Math.min(from2, to);
            const height = Math.abs(to - from2);
            const el = doc.createElement('div');
            el.style.cssText = `position:fixed;left:${from1 - T / 2}px;top:${top}px;width:${T}px;height:${height}px;background:repeating-linear-gradient(to bottom,${color} 0,${color} ${dash}px,transparent ${dash}px,transparent ${dash * 2}px);pointer-events:none;`;
            container.appendChild(el);
        } else {
            const left = Math.min(from1, to);
            const width = Math.abs(to - from1);
            const el = doc.createElement('div');
            el.style.cssText = `position:fixed;left:${left}px;top:${from2 - T / 2}px;width:${width}px;height:${T}px;background:repeating-linear-gradient(to right,${color} 0,${color} ${dash}px,transparent ${dash}px,transparent ${dash * 2}px);pointer-events:none;`;
            container.appendChild(el);
        }
    }

    _snapLabel(container, x, y, value, color, inv = 1) {
        const fontSize = 11 * inv;
        const padH = 5 * inv;
        const padV = 2 * inv;
        const radius = 3 * inv;
        const lh = 14 * inv;
        const el = container.ownerDocument.createElement('div');
        el.textContent = value;
        el.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:rgba(0,0,0,0.8);color:${color};font-size:${fontSize}px;font-family:system-ui,sans-serif;padding:${padV}px ${padH}px;border-radius:${radius}px;line-height:${lh}px;pointer-events:none;white-space:nowrap;font-weight:700;border:${inv}px solid ${color};`;
        container.appendChild(el);
    }

    _clearSnapLines(doc) {
        const existing = doc?.querySelector('.editor-snap-lines');
        if (existing) existing.remove();
    }

    /**
     * Start move operation
     * @param {MouseEvent} e
     */
    startMove(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.selectedElement) return;

        const iframeDoc = this._getDocument();
        const computed = iframeDoc.defaultView.getComputedStyle(this.selectedElement);
        const position = computed.position;
        const scale = this.getIframeTransform().scale;

        // Cannot move static elements
        if (position === 'static') {
            this.emit('move:error', { message: 'Cannot move static positioned element' });
            return;
        }

        // screenX/Y: 어느 document에서 이벤트가 발생해도 동일한 좌표 공간
        const startX = e.screenX;
        const startY = e.screenY;

        let startLeft = parseFloat(computed.left) || 0;
        let startTop = parseFloat(computed.top) || 0;

        if (computed.left === 'auto') startLeft = 0;
        if (computed.top === 'auto') startTop = 0;

        // ★ computed style에서 oldValue 가져오기 (CSS 규칙 포함)
        const oldLeft = computed.left || 'auto';
        const oldTop = computed.top || 'auto';

        // Snap targets 수집
        const snapTargets = this._collectSnapTargets(this.selectedElement);
        const startRect = this.selectedElement.getBoundingClientRect();

        // Create overlay for smooth dragging
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 99999;
            cursor: default;
        `;
        document.body.appendChild(overlay);

        const onMouseMove = (moveEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const dx = (moveEvent.screenX - startX) / scale;
            const dy = (moveEvent.screenY - startY) / scale;

            let newLeft = startLeft + dx;
            let newTop = startTop + dy;

            // Shift: constrain to horizontal/vertical
            if (moveEvent.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    newTop = startTop;
                } else {
                    newLeft = startLeft;
                }
            }

            // Snap 계산
            const movedRect = {
                left: startRect.left + dx,
                top: startRect.top + dy,
                width: startRect.width,
                height: startRect.height,
                right: startRect.right + dx,
                bottom: startRect.bottom + dy
            };
            const snapResult = this._checkSnap(movedRect, snapTargets);

            if (snapResult.snapX) newLeft += snapResult.snapX.offset;
            if (snapResult.snapY) newTop += snapResult.snapY.offset;

            this.selectedElement.style.left = Math.round(newLeft) + 'px';
            this.selectedElement.style.top = Math.round(newTop) + 'px';

            // Snap 가이드 렌더링 (snapped 후 최종 rect 사용)
            const finalRect = {
                left: movedRect.left + (snapResult.snapX ? snapResult.snapX.offset : 0),
                top: movedRect.top + (snapResult.snapY ? snapResult.snapY.offset : 0),
                width: movedRect.width, height: movedRect.height,
                right: movedRect.right + (snapResult.snapX ? snapResult.snapX.offset : 0),
                bottom: movedRect.bottom + (snapResult.snapY ? snapResult.snapY.offset : 0)
            };
            this._renderSnapGuides(iframeDoc, finalRect, snapResult);

            this.emit('move:move', { element: this.selectedElement });
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

            // Snap lines 정리
            this._clearSnapLines(iframeDoc);

            const moveHandle = iframeDoc.querySelector('.editor-move-handle');
            if (moveHandle) moveHandle.style.cursor = 'default';

            // ★ 인라인 스타일이 설정되지 않은 경우 (드래그 안 함) computed 값 사용
            const currentComputed = iframeDoc.defaultView.getComputedStyle(this.selectedElement);
            const newLeft = this.selectedElement.style.left || currentComputed.left || 'auto';
            const newTop = this.selectedElement.style.top || currentComputed.top || 'auto';

            const changes = [];
            if (oldLeft !== newLeft) {
                changes.push({ property: 'left', oldValue: oldLeft, newValue: newLeft });
            }
            if (oldTop !== newTop) {
                changes.push({ property: 'top', oldValue: oldTop, newValue: newTop });
            }

            this.emit('move:complete', { element: this.selectedElement, changes });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        if (iframeDoc) {
            iframeDoc.addEventListener('mousemove', onMouseMove);
            iframeDoc.addEventListener('mouseup', onMouseUp);
        }
    }

    /**
     * Read current transform from inline style or CSS rules
     * (inline style이 비어있을 수 있음 - _applyDragStyleChanges 후 CSS로 이동되므로)
     */
    _readCurrentTransform(element) {
        // 1. inline style 우선
        if (element.style.transform) return element.style.transform;

        // 2. CSS rules에서 읽기 (:hover/:focus/:active 제외)
        const doc = element.ownerDocument;
        if (!doc) return '';

        let result = '';
        try {
            const sheets = doc.styleSheets;
            for (let si = 0; si < sheets.length; si++) {
                try {
                    const rules = sheets[si].cssRules;
                    if (!rules) continue;
                    for (let ri = 0; ri < rules.length; ri++) {
                        const rule = rules[ri];
                        if (rule.type !== 1) continue;
                        const sel = rule.selectorText;
                        if (!sel || sel.includes(':hover') || sel.includes(':focus') || sel.includes(':active')) continue;
                        try {
                            if (!element.matches(sel)) continue;
                        } catch (e) { continue; }
                        const val = rule.style.getPropertyValue('transform');
                        if (val && val !== 'none') result = val;
                    }
                } catch (e) { continue; }
            }
        } catch (e) {}

        return result;
    }

    /**
     * Parse transform string to preserve non-rotate parts (scaleX, scaleY, others)
     */
    _parsePreservedTransform(str) {
        const result = { scaleX: null, scaleY: null, others: null };
        if (!str || str === 'none') return result;

        const scaleXMatch = str.match(/scaleX\(([-\d.]+)\)/);
        if (scaleXMatch && scaleXMatch[1] !== '1') result.scaleX = scaleXMatch[1];

        const scaleYMatch = str.match(/scaleY\(([-\d.]+)\)/);
        if (scaleYMatch && scaleYMatch[1] !== '1') result.scaleY = scaleYMatch[1];

        const othersStr = str
            .replace(/rotate\([^)]*\)/g, '')
            .replace(/scaleX\([^)]*\)/g, '')
            .replace(/scaleY\([^)]*\)/g, '')
            .trim();
        if (othersStr) result.others = othersStr;

        return result;
    }

    /**
     * Get best CSS selector for selected element
     * @returns {string|null}
     */
    _getBestSelector() {
        if (!this.selectedElement) return null;

        // 1. ID가 있으면 사용
        if (this.selectedElement.id) {
            return '#' + this.selectedElement.id;
        }

        // 2. zaemit- 클래스가 있으면 사용
        for (const cls of this.selectedElement.classList) {
            if (cls.startsWith('zaemit-')) {
                return '.' + cls;
            }
        }

        // 3. 첫 번째 클래스 사용
        if (this.selectedElement.classList.length > 0) {
            return '.' + this.selectedElement.classList[0];
        }

        return null;
    }
}

export default ResizeDragManager;
