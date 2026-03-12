import EventEmitter from './EventEmitter.js';
import CursorUtils from './CursorUtils.js';

/**
 * OverlayManager - Handles selection overlay, resize handles, and spacing handles
 */
class OverlayManager extends EventEmitter {
    constructor(previewFrame) {
        super();
        this.previewFrame = previewFrame;
        this.overlay = null;
        this.marginOverlay = null;
        this.paddingOverlay = null;
        this.resizeHandles = [];
        this.spacingHandles = [];
        this.borderDragZones = [];
        this.currentElement = null;
        this.isDragging = false;
        this.isSpacingHandlesVisible = false;
        this.isSpacingDragging = false;
        this.isSpacePressed = false;
        this._activeDragHandle = null;
        this._suppressUntilLeave = false;

        // spacing handle hover 감지 (mousemove 기반)
        this._onDocMouseMove = (e) => {
            if (!this.currentElement || this.isSpacePressed) return;
            let anyOver = false;
            this.spacingHandles.forEach(handle => {
                if (handle.style.display === 'none') return;
                if (handle.classList.contains('dragging')) return;
                const dot = handle.querySelector('div');
                if (!dot) return;
                const r = handle.getBoundingClientRect();
                const over = e.clientX >= r.left && e.clientX <= r.right &&
                             e.clientY >= r.top && e.clientY <= r.bottom;
                if (over) anyOver = true;
                dot.style.setProperty('opacity', (!this._suppressUntilLeave && over) ? '0.8' : '0', 'important');
            });
            // 마우스가 모든 핸들 밖에 있을 때 suppress 해제
            if (this._suppressUntilLeave && !anyOver) {
                this._suppressUntilLeave = false;
            }
        };
        // iframe 밖으로 마우스 나갈 때 모든 dot 숨김
        this._onDocMouseLeave = () => {
            this.spacingHandles.forEach(handle => {
                if (handle.classList.contains('dragging')) return;
                const dot = handle.querySelector('div');
                if (dot) dot.style.setProperty('opacity', '0', 'important');
            });
        };

        // Space 키 상태 추적 (panning 우선 - spacing handle 완전 비활성화)
        this._onSpaceDown = () => {
            this.isSpacePressed = true;
            this.spacingHandles.forEach(h => {
                h.style.setProperty('pointer-events', 'none', 'important');
                const dot = h.querySelector('div');
                if (dot) dot.style.setProperty('opacity', '0', 'important');
            });
        };
        this._onSpaceUp = () => {
            this.isSpacePressed = false;
            this.spacingHandles.forEach(h => {
                h.style.setProperty('pointer-events', 'auto', 'important');
            });
        };
        this._onKeyDown = (e) => {
            if (e.code === 'Space') this._onSpaceDown();
        };
        this._onKeyUp = (e) => {
            if (e.code === 'Space') this._onSpaceUp();
        };
        // 메인 document에 이벤트 등록
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    getDocument() {
        return this.previewFrame?.contentDocument || null;
    }

    /**
     * iframe에 적용된 zoom scale 가져오기
     */
    _getZoomScale() {
        const iframe = this.previewFrame;
        if (!iframe) return 1;
        // 1차: iframe style.transform에서 scale 파싱
        const transform = iframe.style?.transform || '';
        const match = transform.match(/scale\(([\d.]+)\)/);
        if (match) return parseFloat(match[1]);
        // 2차: 레이아웃 크기 vs 렌더링 크기 비율로 감지
        const cssW = iframe.offsetWidth;
        const visualW = iframe.getBoundingClientRect().width;
        if (cssW > 0 && visualW > 0) {
            const ratio = visualW / cssW;
            if (Math.abs(ratio - 1) > 0.01) return ratio;
        }
        return 1;
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        // 같은 iframe이고 오버레이가 DOM에 연결되어 있으면 스킵
        if (this.previewFrame === iframe && this.overlay?.isConnected) return;

        // 기존 오버레이 제거
        this.destroy();

        // 새 iframe 참조
        this.previewFrame = iframe;

        // 새 iframe에 오버레이 생성
        this.createOverlays();
    }

    /**
     * Reinitialize overlays (call after DOM is replaced, e.g., after undo/redo snapshot restore)
     */
    reinitialize() {
        // Clear references to old overlay elements
        this.overlay = null;
        this.marginOverlay = null;
        this.paddingOverlay = null;
        this.resizeHandles = [];
        this.spacingHandles = [];
        this.borderDragZones = [];
        this.moveHandle = null;
        this.rotateHandle = null;
        this.currentElement = null;

        // Recreate all overlays
        this.createOverlays();
    }

    /**
     * Create all overlays
     */
    createOverlays() {
        const doc = this.getDocument();
        if (!doc) return;

        // iframe document에 이벤트 등록
        doc.addEventListener('keydown', this._onKeyDown);
        doc.addEventListener('keyup', this._onKeyUp);
        doc.addEventListener('mousemove', this._onDocMouseMove);
        doc.addEventListener('mouseleave', this._onDocMouseLeave);

        // 오버레이 컨테이너: html (documentElement) 사용
        // body에 max-width가 있으면 중앙 정렬되어 좌표가 틀어질 수 있음
        const overlayContainer = doc.documentElement;

        // Main selection overlay
        this.overlay = doc.createElement('div');
        this.overlay.id = 'editor-overlay';
        this.overlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            border: 1px solid #667eea;
            background: transparent;
            z-index: 10000;
            display: none;
            box-sizing: content-box;
            padding: 0;
            margin: 0;
            min-width: 0;
            min-height: 0;
            max-width: none;
            max-height: none;
        `;
        overlayContainer.appendChild(this.overlay);

        // Create border drag zones for initiating drag
        this.createBorderDragZones();

        // Margin overlay (border-only, no fill)
        this.marginOverlay = doc.createElement('div');
        this.marginOverlay.id = 'editor-margin-overlay';
        this.marginOverlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            background: transparent;
            z-index: 9998;
            display: none;
            box-sizing: border-box;
            padding: 0;
            margin: 0;
        `;
        overlayContainer.appendChild(this.marginOverlay);

        // Padding overlay (border-only, no fill)
        this.paddingOverlay = doc.createElement('div');
        this.paddingOverlay.id = 'editor-padding-overlay';
        this.paddingOverlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            background: transparent;
            z-index: 9999;
            display: none;
            box-sizing: border-box;
            padding: 0;
            margin: 0;
        `;
        overlayContainer.appendChild(this.paddingOverlay);

        this.createResizeHandles();
        this.createSpacingHandles();
        this._injectSpacingStyles(doc);
        this.createMoveHandle();
        this.createRotateHandle();
    }

    /**
     * Create border drag zones (top, right, bottom, left edges)
     * These allow initiating drag from the overlay border
     */
    createBorderDragZones() {
        const doc = this.getDocument();
        if (!doc || !this.overlay) return;

        this.borderDragZones = [];
        const sides = ['top', 'right', 'bottom', 'left'];

        sides.forEach(side => {
            const zone = doc.createElement('div');
            zone.className = `editor-border-drag-zone editor-border-${side}`;
            zone.dataset.side = side;

            const isVertical = side === 'left' || side === 'right';
            const thickness = '10px'; // Hit area thickness

            zone.style.cssText = `
                position: absolute;
                ${isVertical ? 'width' : 'height'}: ${thickness};
                ${isVertical ? 'height' : 'width'}: 100%;
                ${side}: -5px;
                ${isVertical ? 'top' : 'left'}: 0;
                cursor: default;
                pointer-events: auto;
                z-index: 10001;
                background: transparent;
                box-sizing: content-box;
                padding: 0;
                margin: 0;
            `;

            zone.addEventListener('mouseenter', () => {
                if (!this.isDragging) {
                    this.overlay.style.borderColor = '#4f5bd5';
                    this.overlay.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.3)';
                }
            });

            zone.addEventListener('mouseleave', () => {
                if (!this.isDragging) {
                    this.overlay.style.borderColor = '#667eea';
                    this.overlay.style.boxShadow = 'none';
                }
            });

            // Start drag on mousedown
            zone.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.isDragging = true;

                // non-static → left/top 이동, static → DOM 위치 드래그
                const el = this.currentElement;
                if (el) {
                    const pos = el.ownerDocument.defaultView.getComputedStyle(el).position;
                    if (pos !== 'static') {
                        this.emit('move:start', e);
                        return;
                    }
                }
                this.emit('drag:start', { element: el, event: e });
            });

            // Prevent click from propagating to element selection
            zone.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
            }, true);

            this.overlay.appendChild(zone);
            this.borderDragZones.push(zone);
        });
    }

    /**
     * Create resize handles
     */
    createResizeHandles() {
        const doc = this.getDocument();
        if (!doc || !this.overlay) return;

        const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        const cursors = {
            nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize',
            se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize'
        };

        positions.forEach(pos => {
            const handle = doc.createElement('div');
            handle.className = `editor-resize-handle editor-resize-${pos}`;
            handle.dataset.position = pos;
            handle.style.cssText = `
                position: absolute;
                width: 6px;
                height: 6px;
                background: #fff;
                border: 1px solid #667eea;
                border-radius: 1px;
                cursor: ${cursors[pos]};
                pointer-events: auto;
                z-index: 10001;
                box-sizing: content-box;
                padding: 0;
                margin: 0;
                min-width: 0;
                min-height: 0;
            `;

            // Position the handle
            this.positionHandle(handle, pos);

            this.overlay.appendChild(handle);
            this.resizeHandles.push(handle);

            // Mousedown - start resize immediately (no delay)
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.emit('resize:start', { position: pos, event: e });
            });

            // Double click - reset size to auto/100%
            handle.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.emit('resize:reset', { position: pos });
            });
        });
    }

    /**
     * Create spacing (margin/padding) drag handles
     */
    createSpacingHandles() {
        const doc = this.getDocument();
        if (!doc) return;

        // Spacing handle positions: top, right, bottom, left for both margin and padding
        const positions = ['top', 'right', 'bottom', 'left'];

        // Create margin handles
        positions.forEach(pos => {
            const handle = this.createSpacingHandle(doc, 'margin', pos);
            this.spacingHandles.push(handle);
        });

        // Create padding handles
        positions.forEach(pos => {
            const handle = this.createSpacingHandle(doc, 'padding', pos);
            this.spacingHandles.push(handle);
        });
    }

    /**
     * Create a single spacing handle
     */
    createSpacingHandle(doc, type, side) {
        // Create wrapper for larger hit area (투명 영역 - 시각적 요소 없음)
        const wrapper = doc.createElement('div');
        wrapper.className = `editor-spacing-handle editor-${type}-handle-${side}`;
        wrapper.dataset.type = type;
        wrapper.dataset.side = side;

        const isVertical = side === 'top' || side === 'bottom';
        const pointerEvents = this.isSpacePressed ? 'none' : 'auto';

        // wrapper: 순수 hit area. opacity 관리 안 함 (투명이므로 보이지 않음)
        wrapper.style.cssText = `
            position: absolute !important;
            cursor: ${isVertical ? 'ns-resize' : 'ew-resize'} !important;
            pointer-events: ${pointerEvents} !important;
            z-index: ${type === 'margin' ? 9999 : 10000} !important;
            display: none !important;
            box-sizing: content-box !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: transparent !important;
            transform: none !important;
            transition: none !important;
            opacity: 1 !important;
            float: none !important;
        `;

        // dot: 시각적 핸들 (유일한 시각 요소)
        const dot = doc.createElement('div');
        const color = type === 'margin' ? 'rgba(255, 180, 120, 0.85)' : 'rgba(140, 220, 170, 0.85)';
        const borderColor = type === 'margin' ? 'rgba(230, 140, 80, 0.9)' : 'rgba(80, 180, 120, 0.9)';

        dot.style.cssText = `
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            width: ${isVertical ? '16px' : '3px'} !important;
            height: ${isVertical ? '3px' : '16px'} !important;
            background: ${color} !important;
            border: none !important;
            border-radius: 1px !important;
            transform: translate(-50%, -50%) !important;
            transition: opacity 0.3s ease !important;
            pointer-events: none !important;
            opacity: 0 !important;
            box-sizing: content-box !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            float: none !important;
            min-width: 0 !important;
            min-height: 0 !important;
            max-width: none !important;
            max-height: none !important;
        `;

        wrapper.appendChild(dot);

        // mousedown: 드래그 시작
        wrapper.addEventListener('mousedown', (e) => {
            if (this.isSpacePressed) return;

            e.stopPropagation();
            e.preventDefault();
            this.isSpacingDragging = true;
            this._activeDragHandle = wrapper;

            // 드래그 중 dot 진하게 (transition 없이 즉시)
            dot.style.setProperty('transition', 'none', 'important');
            dot.style.setProperty('opacity', '1', 'important');

            this.emit('spacing:start', { type, side, event: e });

            const onMouseUp = () => {
                this.isSpacingDragging = false;
                this._activeDragHandle = null;
                dot.style.setProperty('transition', 'opacity 0.3s ease', 'important');
                dot.style.setProperty('opacity', '0', 'important');

                document.removeEventListener('mouseup', onMouseUp);
                doc.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mouseup', onMouseUp);
            doc.addEventListener('mouseup', onMouseUp);
        });

        doc.documentElement.appendChild(wrapper);
        return wrapper;
    }

    /**
     * Create move handle (hidden — drag is initiated from iframe mousedown)
     */
    createMoveHandle() {
        const doc = this.getDocument();
        if (!doc || !this.overlay) return;

        const handle = doc.createElement('div');
        handle.className = 'editor-move-handle';
        handle.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            display: none;
        `;

        this.overlay.appendChild(handle);
        this.moveHandle = handle;
    }

    /**
     * Create rotate handle (above overlay)
     */
    createRotateHandle() {
        const doc = this.getDocument();
        if (!doc || !this.overlay) return;

        // 회전 커서 SVG (모서리별 방향)
        const rotateCursors = {
            nw: this._makeRotateCursor('nw'),
            ne: this._makeRotateCursor('ne'),
            se: this._makeRotateCursor('se'),
            sw: this._makeRotateCursor('sw')
        };

        // 4개 모서리에 보이지 않는 회전 감지 영역 생성
        this.rotateZones = [];
        const corners = ['nw', 'ne', 'se', 'sw'];
        const positions = {
            nw: 'top: -30px; left: -30px;',
            ne: 'top: -30px; right: -30px;',
            se: 'bottom: -30px; right: -30px;',
            sw: 'bottom: -30px; left: -30px;'
        };

        corners.forEach(corner => {
            const zone = doc.createElement('div');
            zone.className = `editor-rotate-zone editor-rotate-${corner}`;
            zone.dataset.corner = corner;
            zone.style.cssText = `
                position: absolute;
                ${positions[corner]}
                width: 26px;
                height: 26px;
                pointer-events: auto;
                z-index: 10002;
                box-sizing: content-box;
                padding: 0;
                margin: 0;
                cursor: ${rotateCursors[corner]};
            `;

            zone.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.emit('rotate:start', e);
            });

            this.overlay.appendChild(zone);
            this.rotateZones.push(zone);
        });

        // 호환성을 위해 rotateHandle과 rotateLine은 null로 설정
        this.rotateHandle = null;
        this.rotateLine = null;
    }

    /**
     * Generate a rotate cursor as CSS url() with SVG data URI
     * @param {string} corner - Corner identifier: 'nw', 'ne', 'se', 'sw'
     * @returns {string} CSS cursor value
     */
    _makeRotateCursor(corner) {
        return CursorUtils.rotate(corner);
    }

    /**
     * Inject CSS transition for spacing handle dots
     */
    _injectSpacingStyles(doc) {
        const existing = doc.getElementById('editor-spacing-styles');
        if (existing) existing.remove();

        const style = doc.createElement('style');
        style.id = 'editor-spacing-styles';
        // transition/opacity는 inline !important로 JS에서 직접 관리
        // 사용자 CSS 오버라이드 방지를 위해 빈 룰셋 유지
        style.textContent = ``;
        (doc.head || doc.documentElement).appendChild(style);
    }

    /**
     * Position a resize handle
     */
    positionHandle(handle, pos) {
        this._positionHandleZoom(handle, pos, '-4.5px', 'calc(50% - 4px)');
    }

    _positionHandleZoom(handle, pos, offset, center) {
        // Reset all position properties
        handle.style.top = ''; handle.style.bottom = '';
        handle.style.left = ''; handle.style.right = '';

        switch (pos) {
            case 'nw': handle.style.top = offset; handle.style.left = offset; break;
            case 'n': handle.style.top = offset; handle.style.left = center; break;
            case 'ne': handle.style.top = offset; handle.style.right = offset; break;
            case 'e': handle.style.top = center; handle.style.right = offset; break;
            case 'se': handle.style.bottom = offset; handle.style.right = offset; break;
            case 's': handle.style.bottom = offset; handle.style.left = center; break;
            case 'sw': handle.style.bottom = offset; handle.style.left = offset; break;
            case 'w': handle.style.top = center; handle.style.left = offset; break;
        }
    }

    /**
     * Update overlay position for element
     */
    update(element) {
        if (!element) {
            this.hide();
            return;
        }

        // 요소가 DOM에서 분리되었는지 확인
        if (!element.isConnected) {
            this.hide();
            this.currentElement = null;
            return;
        }

        // 엘리먼트 전환 시 모든 dot 숨김 + suppress 활성화
        // (마우스가 모든 핸들 밖으로 나간 뒤에야 hover 활성화)
        if (this.currentElement !== element) {
            this.spacingHandles.forEach(handle => {
                const dot = handle.querySelector('div');
                if (dot) dot.style.setProperty('opacity', '0', 'important');
            });
            this._suppressUntilLeave = true;
        }
        this.currentElement = element;

        // element가 속한 document 사용 (멀티뷰에서 다른 iframe일 수 있음)
        const elementDoc = element.ownerDocument;
        if (!elementDoc || !elementDoc.body) return;

        // 오버레이가 element와 다른 document에 있으면 재생성
        if (this.overlay && this.overlay.ownerDocument !== elementDoc) {
            this.destroy();
        }

        // previewFrame 업데이트 (element가 속한 iframe으로)
        const elementWindow = elementDoc.defaultView;
        if (elementWindow && elementWindow.frameElement) {
            this.previewFrame = elementWindow.frameElement;
        }

        // 오버레이가 없거나 DOM에서 분리되었으면 재생성
        if (!this.overlay || !this.overlay.isConnected) {
            this.createOverlays();
            if (!this.overlay) return;  // 생성 실패 시 반환
        }

        // spacing handles가 분리되었으면 다시 생성
        if (this.spacingHandles.length === 0 || !this.spacingHandles[0]?.isConnected) {
            // 기존 참조 정리
            this.spacingHandles = [];
            this.createSpacingHandles();
        }

        const rect = element.getBoundingClientRect();
        // html (documentElement) 기준으로 좌표 계산 (body에 max-width가 있을 수 있음)
        const htmlRect = elementDoc.documentElement.getBoundingClientRect();
        const scrollX = elementDoc.defaultView.scrollX || 0;
        const scrollY = elementDoc.defaultView.scrollY || 0;

        // html 기준 상대 좌표 계산
        const left = rect.left - htmlRect.left + scrollX;
        const top = rect.top - htmlRect.top + scrollY;

        // Zoom compensation
        const zoom = this._getZoomScale();
        const inv = 1 / zoom;

        // Update main overlay
        this.overlay.style.display = 'block';
        this.overlay.style.left = left + 'px';
        this.overlay.style.top = top + 'px';
        this.overlay.style.width = rect.width + 'px';
        this.overlay.style.height = rect.height + 'px';
        this.overlay.style.borderWidth = (1 * inv) + 'px';

        // Check element properties for handle visibility
        const computed = elementDoc.defaultView.getComputedStyle(element);
        const position = computed.position;
        const display = computed.display;

        // Inline elements cannot be resized/rotated
        const isInline = display === 'inline';
        const isMovable = position !== 'static';

        // Show/hide resize handles + zoom compensation
        const handleSize = 6 * inv;
        const handleBorder = 1 * inv;
        const handleTotal = handleSize + handleBorder * 2;
        const handleOffset = -(handleTotal / 2 - 0.5 * inv) + 'px'; // center on 1px border
        const handleCenter = `calc(50% - ${handleTotal / 2}px)`;

        this.resizeHandles.forEach(handle => {
            handle.style.display = isInline ? 'none' : 'block';
            handle.style.width = handleSize + 'px';
            handle.style.height = handleSize + 'px';
            handle.style.borderWidth = handleBorder + 'px';
            this._positionHandleZoom(handle, handle.dataset.position, handleOffset, handleCenter);
        });

        // Border drag zones zoom compensation
        if (this.borderDragZones) {
            const zoneThick = 10 * inv;
            const zoneOffset = -5 * inv;
            this.borderDragZones.forEach(zone => {
                const side = zone.dataset.side;
                const isVert = side === 'left' || side === 'right';
                if (isVert) {
                    zone.style.width = zoneThick + 'px';
                } else {
                    zone.style.height = zoneThick + 'px';
                }
                zone.style[side] = zoneOffset + 'px';
            });
        }

        // Move handle: 비활성 (드래그는 iframe mousedown에서 처리)
        if (this.moveHandle) {
            this.moveHandle.style.display = 'none';
        }

        // Show/hide rotate zones + zoom compensation
        if (this.rotateZones) {
            const rzSize = 25 * inv;
            const rzOffset = -30 * inv;
            this.rotateZones.forEach(zone => {
                zone.style.display = isInline ? 'none' : 'block';
                zone.style.width = rzSize + 'px';
                zone.style.height = rzSize + 'px';
                const corner = zone.dataset.corner;
                if (corner === 'nw' || corner === 'ne') zone.style.top = rzOffset + 'px';
                if (corner === 'sw' || corner === 'se') zone.style.bottom = rzOffset + 'px';
                if (corner === 'nw' || corner === 'sw') zone.style.left = rzOffset + 'px';
                if (corner === 'ne' || corner === 'se') zone.style.right = rzOffset + 'px';
            });
        }

        // Update spacing overlays (pass zoom for compensation)
        this._currentZoom = zoom;
        this.updateSpacingOverlays(element, rect, scrollX, scrollY, htmlRect);
    }

    /**
     * Update margin and padding overlays
     */
    updateSpacingOverlays(element, rect, scrollX, scrollY, htmlRect = null) {
        // element가 속한 document 사용
        const doc = element.ownerDocument;
        if (!doc) return;
        // html 기준으로 좌표 계산 (body에 max-width가 있을 수 있음)
        if (!htmlRect) htmlRect = doc.documentElement?.getBoundingClientRect() || { left: 0, top: 0 };

        const computed = doc.defaultView.getComputedStyle(element);

        // Get margin values
        const marginTop = parseFloat(computed.marginTop) || 0;
        const marginRight = parseFloat(computed.marginRight) || 0;
        const marginBottom = parseFloat(computed.marginBottom) || 0;
        const marginLeft = parseFloat(computed.marginLeft) || 0;

        // Get padding values
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const paddingRight = parseFloat(computed.paddingRight) || 0;
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const paddingLeft = parseFloat(computed.paddingLeft) || 0;

        // html 기준 상대 좌표 계산
        const baseLeft = rect.left - htmlRect.left + scrollX;
        const baseTop = rect.top - htmlRect.top + scrollY;

        // Update margin overlay (around the element)
        if (this.marginOverlay) {
            const hasMargin = marginTop || marginRight || marginBottom || marginLeft;
            this.marginOverlay.style.display = hasMargin ? 'block' : 'none';

            if (hasMargin) {
                this.marginOverlay.style.left = (baseLeft - marginLeft) + 'px';
                this.marginOverlay.style.top = (baseTop - marginTop) + 'px';
                this.marginOverlay.style.width = (rect.width + marginLeft + marginRight) + 'px';
                this.marginOverlay.style.height = (rect.height + marginTop + marginBottom) + 'px';
                this.marginOverlay.style.borderWidth = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
                this.marginOverlay.style.borderStyle = 'solid';
                this.marginOverlay.style.borderColor = 'rgba(255, 200, 150, 0.08)';
                this.marginOverlay.style.background = 'transparent';
            }
        }

        // Update padding overlay (inside the element)
        if (this.paddingOverlay) {
            const hasPadding = paddingTop || paddingRight || paddingBottom || paddingLeft;
            this.paddingOverlay.style.display = hasPadding ? 'block' : 'none';

            if (hasPadding) {
                this.paddingOverlay.style.left = baseLeft + 'px';
                this.paddingOverlay.style.top = baseTop + 'px';
                this.paddingOverlay.style.width = rect.width + 'px';
                this.paddingOverlay.style.height = rect.height + 'px';
                this.paddingOverlay.style.borderWidth = `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`;
                this.paddingOverlay.style.borderStyle = 'solid';
                this.paddingOverlay.style.borderColor = 'rgba(150, 220, 180, 0.08)';
                this.paddingOverlay.style.background = 'transparent';
            }
        }

        // Update spacing handles
        this.updateSpacingHandles(rect, scrollX, scrollY, {
            marginTop, marginRight, marginBottom, marginLeft,
            paddingTop, paddingRight, paddingBottom, paddingLeft
        }, htmlRect);
    }

    /**
     * Update spacing handle positions
     */
    updateSpacingHandles(rect, scrollX, scrollY, spacing, htmlRect = null) {
        const minOffset = 24; // 선택 상자와 겹치지 않도록 최소 오프셋 (클릭 용이성)
        const MIN_SIZE_FOR_PADDING_HANDLES = 80; // 패딩 핸들 표시 최소 크기 (작은 요소에서 텍스트 클릭 방해 방지)
        if (!htmlRect) htmlRect = { left: 0, top: 0 };

        const isTooSmallForPadding = rect.width < MIN_SIZE_FOR_PADDING_HANDLES ||
                                      rect.height < MIN_SIZE_FOR_PADDING_HANDLES;

        // 테이블 셀(TD, TH)은 마진 핸들 숨김
        const isTableCell = this.currentElement?.tagName === 'TD' ||
                            this.currentElement?.tagName === 'TH';

        this.spacingHandles.forEach(handle => {
            const type = handle.dataset.type;
            const side = handle.dataset.side;
            const value = spacing[`${type}${side.charAt(0).toUpperCase() + side.slice(1)}`];

            // 테이블 셀은 마진 핸들 숨김
            if (type === 'margin' && isTableCell) {
                handle.style.setProperty('display', 'none', 'important');
                return;
            }

            // 패딩 핸들은 요소가 너무 작으면 숨김
            if (type === 'padding' && isTooSmallForPadding) {
                handle.style.setProperty('display', 'none', 'important');
                return;
            }

            // 마진 핸들은 항상 표시 (value가 0이어도 드래그로 값 추가 가능)
            handle.style.setProperty('display', 'block', 'important');

            // spacing 값 저장 (hover 시 동적 크기 계산용)
            handle.dataset.value = value;

            // html 기준 상대 좌표
            const elemLeft = rect.left - htmlRect.left + scrollX;
            const elemTop = rect.top - htmlRect.top + scrollY;

            // 선택 상자 버튼과의 간섭 방지 (테두리에서 gap만큼 떨어진 영역만 hover)
            const borderGap = 18;
            const minHitSize = 28;  // spacing이 0이어도 최소 hover 영역 보장
            const hitSize = Math.max(minHitSize, value);
            const adjustedHitSize = Math.max(10, hitSize - borderGap);

            // ★ dot 버튼 주변만 hit area로 사용 (요소 전체 가장자리 대신)
            // top/bottom 핸들: 가로 36px, 세로 hitSize (요소 중앙 정렬)
            // left/right 핸들: 가로 hitSize, 세로 36px (요소 중앙 정렬)
            const hitAreaCross = 36;

            // setProperty로 !important 유지 (사용자 CSS 오버라이드 방지)
            const s = handle.style;
            if (type === 'margin') {
                // Margin: 요소 바깥 영역 (테두리에서 gap만큼 떨어진 곳부터)
                switch (side) {
                    case 'top':
                        s.setProperty('left', (elemLeft + rect.width / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('top', (elemTop - hitSize) + 'px', 'important');
                        s.setProperty('width', hitAreaCross + 'px', 'important');
                        s.setProperty('height', adjustedHitSize + 'px', 'important');
                        break;
                    case 'bottom':
                        s.setProperty('left', (elemLeft + rect.width / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('top', (elemTop + rect.height + borderGap) + 'px', 'important');
                        s.setProperty('width', hitAreaCross + 'px', 'important');
                        s.setProperty('height', adjustedHitSize + 'px', 'important');
                        break;
                    case 'left':
                        s.setProperty('left', (elemLeft - hitSize) + 'px', 'important');
                        s.setProperty('top', (elemTop + rect.height / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('width', adjustedHitSize + 'px', 'important');
                        s.setProperty('height', hitAreaCross + 'px', 'important');
                        break;
                    case 'right':
                        s.setProperty('left', (elemLeft + rect.width + borderGap) + 'px', 'important');
                        s.setProperty('top', (elemTop + rect.height / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('width', adjustedHitSize + 'px', 'important');
                        s.setProperty('height', hitAreaCross + 'px', 'important');
                        break;
                }
            } else {
                // Padding: 요소 안쪽 영역 (테두리에서 gap만큼 안쪽부터)
                switch (side) {
                    case 'top':
                        s.setProperty('left', (elemLeft + rect.width / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('top', (elemTop + borderGap) + 'px', 'important');
                        s.setProperty('width', hitAreaCross + 'px', 'important');
                        s.setProperty('height', adjustedHitSize + 'px', 'important');
                        break;
                    case 'bottom':
                        s.setProperty('left', (elemLeft + rect.width / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('top', (elemTop + rect.height - hitSize) + 'px', 'important');
                        s.setProperty('width', hitAreaCross + 'px', 'important');
                        s.setProperty('height', adjustedHitSize + 'px', 'important');
                        break;
                    case 'left':
                        s.setProperty('left', (elemLeft + borderGap) + 'px', 'important');
                        s.setProperty('top', (elemTop + rect.height / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('width', adjustedHitSize + 'px', 'important');
                        s.setProperty('height', hitAreaCross + 'px', 'important');
                        break;
                    case 'right':
                        s.setProperty('left', (elemLeft + rect.width - hitSize) + 'px', 'important');
                        s.setProperty('top', (elemTop + rect.height / 2 - hitAreaCross / 2) + 'px', 'important');
                        s.setProperty('width', adjustedHitSize + 'px', 'important');
                        s.setProperty('height', hitAreaCross + 'px', 'important');
                        break;
                }
            }

            // Spacing dot zoom compensation (리사이즈 핸들과 동일한 inv 방식)
            const zoom = this._currentZoom || 1;
            const inv = 1 / zoom;
            const dot = handle.querySelector('div');
            if (dot) {
                const isVert = side === 'top' || side === 'bottom';
                dot.style.setProperty('width', (isVert ? 16 : 3) * inv + 'px', 'important');
                dot.style.setProperty('height', (isVert ? 3 : 16) * inv + 'px', 'important');
                dot.style.setProperty('border-radius', 1 * inv + 'px', 'important');
            }
        });
    }

    /**
     * Show or hide spacing handles with opacity transition
     * @param {boolean} show - Whether to show or hide
     */
    showSpacingHandles(show) {
        // 드래그 중이면 숨기지 않음
        if (!show && this.isSpacingDragging) return;

        this.isSpacingHandlesVisible = show;
        if (!show) {
            this.spacingHandles.forEach(handle => {
                const dot = handle.querySelector('div');
                if (dot) dot.style.setProperty('opacity', '0', 'important');
            });
        }
    }

    /**
     * Hide all overlays
     */
    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.marginOverlay) this.marginOverlay.style.display = 'none';
        if (this.paddingOverlay) this.paddingOverlay.style.display = 'none';
        this.spacingHandles.forEach(handle => {
            handle.style.setProperty('display', 'none', 'important');
        });
        this.isSpacingHandlesVisible = false;
        this.currentElement = null;
    }

    /**
     * Get main overlay element
     * @returns {HTMLElement|null}
     */
    getOverlay() {
        return this.overlay;
    }

    /**
     * Update overlay for current element (alias for update with currentElement)
     */
    updateOverlay() {
        if (this.currentElement) {
            // 요소가 DOM에서 분리되었는지 확인
            if (!this.currentElement.isConnected) {
                this.hide();
                this.currentElement = null;
                return;
            }
            this.update(this.currentElement);
        }
    }

    /**
     * Show/hide resize handles
     */
    showResizeHandles(show = true) {
        this.resizeHandles.forEach(handle => {
            handle.style.display = show ? 'block' : 'none';
        });
    }

    /**
     * End drag state (called by DragDropManager)
     */
    endDrag() {
        this.isDragging = false;
        if (this.overlay) {
            this.overlay.style.borderColor = '#667eea';
            this.overlay.style.boxShadow = 'none';
        }
    }

    /**
     * Destroy overlays
     */
    destroy() {
        // iframe doc의 이벤트 리스너 제거
        const doc = this.getDocument();
        if (doc) {
            doc.removeEventListener('keydown', this._onKeyDown);
            doc.removeEventListener('keyup', this._onKeyUp);
            doc.removeEventListener('mousemove', this._onDocMouseMove);
            doc.removeEventListener('mouseleave', this._onDocMouseLeave);
            const spacingStyle = doc.getElementById('editor-spacing-styles');
            if (spacingStyle) spacingStyle.remove();
        }

        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        if (this.marginOverlay && this.marginOverlay.parentNode) {
            this.marginOverlay.parentNode.removeChild(this.marginOverlay);
        }
        if (this.paddingOverlay && this.paddingOverlay.parentNode) {
            this.paddingOverlay.parentNode.removeChild(this.paddingOverlay);
        }
        this.spacingHandles.forEach(handle => {
            if (handle && handle.parentNode) {
                handle.parentNode.removeChild(handle);
            }
        });
        this.borderDragZones.forEach(zone => {
            if (zone && zone.parentNode) {
                zone.parentNode.removeChild(zone);
            }
        });
        if (this.moveHandle && this.moveHandle.parentNode) {
            this.moveHandle.parentNode.removeChild(this.moveHandle);
        }
        if (this.rotateZones) {
            this.rotateZones.forEach(zone => {
                if (zone.parentNode) zone.parentNode.removeChild(zone);
            });
        }

        // 참조 정리
        this.overlay = null;
        this.marginOverlay = null;
        this.paddingOverlay = null;
        this.resizeHandles = [];
        this.spacingHandles = [];
        this.borderDragZones = [];
        this.moveHandle = null;
        this.rotateHandle = null;
        this.rotateLine = null;
        this.rotateZones = [];
        this.currentElement = null;
        this.isDragging = false;
    }
}

export default OverlayManager;
