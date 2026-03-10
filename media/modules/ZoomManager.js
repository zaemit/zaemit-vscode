import EventEmitter from './EventEmitter.js';
import CursorUtils from './CursorUtils.js';

/**
 * ZoomManager - Handles zoom and pan functionality for the preview iframe
 */
class ZoomManager extends EventEmitter {
    constructor(previewFrameId) {
        super();
        this.previewFrame = document.getElementById(previewFrameId);
        this.zoomLevelDisplay = document.getElementById('zoomLevelDisplay');

        // Zoom settings
        this.zoomLevel = 1;
        this.minZoom = 0.01;  // 1%까지 축소 가능
        this.maxZoom = 100;   // 10000%까지 확대 가능
        this.zoomStep = 0.1;

        // PC 마우스 휠 누적 설정 (터치패드와 구분)
        this._wheelZoomAccumulated = 0;
        this._wheelZoomThreshold = 200;  // PC 휠 누적 임계값
        this._mouseWheelDeltaMin = 50;   // 이 값 이상이면 마우스 휠로 간주

        // 줌 가속도 설정
        this._zoomAccelBaseRate = 0.42;  // 기본 속도
        this._zoomAccelMaxRate = 1.05;   // 최대 속도 (가속 시)
        this._zoomAccelWindow = 300;     // 가속도 측정 윈도우 (ms)
        this._zoomAccelHistory = [];     // 최근 줌 이벤트 타임스탬프

        // Pan settings
        this.isPanning = false;
        this.isSpacePressed = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.panOffsetX = 0;
        this.panOffsetY = 0;

        // Preview resize handles
        this.previewContainer = null;
        this.resizeHandleLeft = null;
        this.resizeHandleRight = null;

        // Reference to ViewModeManager for breakpoint constraints
        this.viewModeManager = null;

        // Reference to MultiCanvasManager for multi-view mode
        this.multiCanvasManager = null;

        // Reference to TextEditingManager for text editing state check
        this.textEditingManager = null;

        // Stored breakpoint constraints at resize start (to prevent corruption during resize)
        this.resizeConstraints = null;

        this.init();
    }

    /**
     * Set reference to ViewModeManager for breakpoint constraints
     */
    setViewModeManager(viewModeManager) {
        this.viewModeManager = viewModeManager;
    }

    /**
     * Set reference to TextEditingManager for text editing state check
     */
    setTextEditingManager(textEditingManager) {
        this.textEditingManager = textEditingManager;
    }

    /**
     * Set reference to MultiCanvasManager for multi-view mode
     */
    setMultiCanvasManager(multiCanvasManager) {
        this.multiCanvasManager = multiCanvasManager;
    }

    init() {
        this.setupZoomControls();
        this.setupZoomDropdown();
        this.setupWheelZoom();
        this.setupPanning();
        this.setupPreviewResize();
        this.setupTransitionListener();
    }

    /**
     * Listen for transition end to update resize handles after animations complete
     */
    setupTransitionListener() {
        if (!this.previewFrame) return;

        this.previewFrame.addEventListener('transitionend', (e) => {
            // Only respond to width/transform transitions on the iframe itself
            if (e.target === this.previewFrame &&
                (e.propertyName === 'width' || e.propertyName === 'transform')) {
                this.updateResizeHandles();
                this.showResizeHandlesDuringTransition();
            }
        });
    }

    /**
     * Hide resize handles during zoom/view mode transitions
     */
    hideResizeHandlesDuringTransition() {
        if (this.resizeHandleLeft) {
            this.resizeHandleLeft.style.opacity = '0';
            this.resizeHandleLeft.style.pointerEvents = 'none';
        }
        if (this.resizeHandleRight) {
            this.resizeHandleRight.style.opacity = '0';
            this.resizeHandleRight.style.pointerEvents = 'none';
        }
        if (this.resizeHandleBottom) {
            this.resizeHandleBottom.style.opacity = '0';
            this.resizeHandleBottom.style.pointerEvents = 'none';
        }
    }

    /**
     * Show resize handles after transition completes (if not in PC mode)
     */
    showResizeHandlesDuringTransition() {
        // Don't show if handles are supposed to be hidden (PC mode)
        if (this.resizeHandleLeft?.classList.contains('hidden')) return;

        if (this.resizeHandleLeft) {
            this.resizeHandleLeft.style.opacity = '';
            this.resizeHandleLeft.style.pointerEvents = '';
        }
        if (this.resizeHandleRight) {
            this.resizeHandleRight.style.opacity = '';
            this.resizeHandleRight.style.pointerEvents = '';
        }
        if (this.resizeHandleBottom) {
            this.resizeHandleBottom.style.opacity = '';
            this.resizeHandleBottom.style.pointerEvents = '';
        }
    }

    setupZoomControls() {
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => this.resetZoom());
        }

        // Ctrl+0 to reset zoom
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
        });

        // Click zoom label to reset zoom
        const zoomLabel = document.querySelector('.zoom-label');
        if (zoomLabel) {
            zoomLabel.style.cursor = 'pointer';
            zoomLabel.title = 'Click to reset zoom to 100%';
            zoomLabel.addEventListener('click', () => this.resetZoom());
        }
    }

    setupZoomDropdown() {
        const zoomControl = document.getElementById('zoomControl');
        const zoomDropdown = document.getElementById('zoomDropdown');

        if (!this.zoomLevelDisplay || !zoomDropdown) {
            console.warn('[ZoomManager] setupZoomDropdown: missing elements');
            return;
        }

        // Move dropdown to body for proper fixed positioning
        document.body.appendChild(zoomDropdown);

        // Toggle dropdown on click
        this.zoomLevelDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasHidden = zoomDropdown.classList.contains('hidden');

            if (wasHidden) {
                // Position and show dropdown
                const rect = this.zoomLevelDisplay.getBoundingClientRect();
                zoomDropdown.style.top = (rect.bottom + 4) + 'px';
                zoomDropdown.style.left = rect.left + 'px';
                zoomDropdown.style.position = 'fixed';
                zoomDropdown.style.zIndex = '10000';
                zoomDropdown.classList.remove('hidden');
            } else {
                zoomDropdown.classList.add('hidden');
            }

            this.updateActiveZoomOption();
        });

        // Handle zoom option selection
        zoomDropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.zoom-option');
            if (!option) return;

            e.stopPropagation();
            const newZoom = parseFloat(option.dataset.zoom);
            if (isNaN(newZoom)) return;

            this.setZoom(newZoom);
            zoomDropdown.classList.add('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            // zoomDropdown이 body로 이동되었으므로 별도로 체크
            if (!zoomControl?.contains(e.target) && !zoomDropdown.contains(e.target)) {
                zoomDropdown.classList.add('hidden');
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                zoomDropdown.classList.add('hidden');
            }
        });
    }

    /**
     * Update active state in zoom dropdown
     */
    updateActiveZoomOption() {
        const zoomDropdown = document.getElementById('zoomDropdown');
        if (!zoomDropdown) return;

        const options = zoomDropdown.querySelectorAll('.zoom-option');
        options.forEach(option => {
            const optionZoom = parseFloat(option.dataset.zoom);
            // Mark as active if close to current zoom (within 0.05)
            if (Math.abs(optionZoom - this.zoomLevel) < 0.05) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    /**
     * Set zoom to specific level
     * 활성화된 iframe이 화면에 보이는 영역의 중앙을 기준으로 확대/축소
     */
    setZoom(newZoom) {
        if (newZoom < this.minZoom || newZoom > this.maxZoom) {
            return;
        }

        const panel = document.querySelector('.preview-panel');
        if (!panel || !this.multiCanvasManager) return;

        const panelRect = panel.getBoundingClientRect();
        const oldZoom = this.zoomLevel;
        const panX = this.multiCanvasManager.panX || 0;
        const panY = this.multiCanvasManager.panY || 0;

        // 활성화된 iframe 가져오기 (단일뷰: previewFrame, 멀티뷰: iframes[activeIdx])
        const activeIdx = this.multiCanvasManager.getActiveIndex?.() || 0;
        const activeIframe = this.multiCanvasManager.iframes?.[activeIdx] || this.previewFrame;
        if (!activeIframe) return;

        // 활성 iframe의 화면상 위치 (getBoundingClientRect 사용)
        const iframeRect = activeIframe.getBoundingClientRect();
        const iframeLeft = iframeRect.left - panelRect.left;
        const iframeTop = iframeRect.top - panelRect.top;
        const iframeRight = iframeLeft + iframeRect.width;
        const iframeBottom = iframeTop + iframeRect.height;

        // panel 영역
        const panelWidth = panelRect.width;
        const panelHeight = panelRect.height;

        // iframe과 panel의 교차 영역 (화면에 보이는 부분)
        const visibleLeft = Math.max(iframeLeft, 0);
        const visibleTop = Math.max(iframeTop, 0);
        const visibleRight = Math.min(iframeRight, panelWidth);
        const visibleBottom = Math.min(iframeBottom, panelHeight);

        // 보이는 영역의 중앙 (panel 기준 좌표)
        const visibleCenterX = (visibleLeft + visibleRight) / 2;
        const visibleCenterY = (visibleTop + visibleBottom) / 2;

        // 보이는 영역 중앙 아래의 콘텐츠 좌표
        const contentX = (visibleCenterX - panX) / oldZoom;
        const contentY = (visibleCenterY - panY) / oldZoom;

        // 새 pan 값 계산 (보이는 영역 중앙의 콘텐츠가 그대로 유지되도록)
        this.multiCanvasManager.panX = visibleCenterX - contentX * newZoom;
        this.multiCanvasManager.panY = visibleCenterY - contentY * newZoom;

        this.zoomLevel = newZoom;
        this.multiCanvasManager._showPlaceholdersAndTransform();
    }

    setupWheelZoom() {
        const previewWrapper = this.previewFrame?.parentElement;
        if (!previewWrapper) return;

        // 줌 커서는 Ctrl+휠 할 때만 표시 (Ctrl 키만 눌렀을 때는 표시 안 함)
        const previewPanel = document.querySelector('.preview-panel') || previewWrapper;
        this._zoomCursorTarget = previewPanel;

        // Wheel zoom on wrapper
        previewWrapper.addEventListener('wheel', (e) => {
            // 이벤트 버블링 방지 (멀티캔버스 컨테이너 핸들러 중복 실행 방지)
            e.stopPropagation();

            if (e.ctrlKey || e.metaKey) {
                // Ctrl+휠: 줌
                e.preventDefault();

                // 줌 방향에 따라 커서 변경 (클래스 기반으로 !important 우선순위 확보)
                const zoomCursor = e.deltaY < 0 ? CursorUtils.zoomIn() : CursorUtils.zoomOut();
                const zoomClass = e.deltaY < 0 ? 'zooming-in' : 'zooming-out';
                previewPanel.style.cursor = zoomCursor;

                // iframe html, body에 클래스 추가 (body 영역 밖 html 영역도 포함)
                try {
                    const iframeDoc = this.previewFrame?.contentDocument;
                    if (iframeDoc) {
                        iframeDoc.documentElement.classList.remove('zooming-in', 'zooming-out');
                        iframeDoc.documentElement.classList.add(zoomClass);
                        if (iframeDoc.body) {
                            iframeDoc.body.classList.remove('zooming-in', 'zooming-out');
                            iframeDoc.body.classList.add(zoomClass);
                        }
                    }
                } catch (err) { /* CORS */ }

                clearTimeout(this._zoomCursorTimer);
                this._zoomCursorTimer = setTimeout(() => {
                    previewPanel.style.cursor = '';
                    try {
                        const iframeDoc = this.previewFrame?.contentDocument;
                        if (iframeDoc) {
                            iframeDoc.documentElement.classList.remove('zooming-in', 'zooming-out');
                            if (iframeDoc.body) {
                                iframeDoc.body.classList.remove('zooming-in', 'zooming-out');
                            }
                        }
                    } catch (err) { /* CORS */ }
                }, 150);

                // PC 휠 / 터치패드 구분하여 줌 처리
                const zoomDelta = this._processWheelZoom(e.deltaY);
                if (zoomDelta === 0) return;

                const wrapperRect = previewWrapper.getBoundingClientRect();
                const mouseX = e.clientX - wrapperRect.left;
                const mouseY = e.clientY - wrapperRect.top;

                const oldZoom = this.zoomLevel;
                this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + zoomDelta));

                if (oldZoom !== this.zoomLevel) {
                    this.applyZoomToAllCanvases(mouseX, mouseY, oldZoom);
                }
            } else {
                // 일반 휠: 캔버스 패닝 (스페이스바 드래그와 동일하게 동작)
                e.preventDefault();
                this._handleWheelPanAllCanvases(e);
            }
        }, { passive: false });

        // Wheel zoom inside iframe
        this.previewFrame.addEventListener('load', () => {
            this._attachIframeWheelHandler();
        });
    }

    /**
     * 줌 가속도 계수 계산 (빠르게 휠할수록 가속)
     * @returns {number} 0.6 ~ 1.5 범위의 속도 계수
     */
    _getZoomAccelFactor() {
        const now = performance.now();
        this._zoomAccelHistory.push(now);
        // 윈도우 밖의 오래된 항목 제거
        const cutoff = now - this._zoomAccelWindow;
        while (this._zoomAccelHistory.length > 0 && this._zoomAccelHistory[0] < cutoff) {
            this._zoomAccelHistory.shift();
        }
        // 윈도우 내 이벤트 수로 가속도 결정 (1개=기본, 5개 이상=최대)
        const count = this._zoomAccelHistory.length;
        const t = Math.min((count - 1) / 4, 1); // 0~1 보간
        return this._zoomAccelBaseRate + t * (this._zoomAccelMaxRate - this._zoomAccelBaseRate);
    }

    /**
     * PC 마우스 휠과 터치패드를 구분하여 줌 처리
     * 비율 기반 줌: 현재 줌 레벨에 비례하여 변경량 결정
     * @param {number} deltaY - wheel 이벤트의 deltaY
     * @returns {number} 줌 변경량 (0이면 변경 없음)
     */
    _processWheelZoom(deltaY) {
        const isMouseWheel = Math.abs(deltaY) >= this._mouseWheelDeltaMin;
        const accel = this._getZoomAccelFactor();
        // 비율 기반: 현재 줌의 10% * 가속도 계수
        const proportionalStep = this.zoomLevel * 0.1 * accel;

        if (isMouseWheel) {
            // PC 마우스 휠: 누적 후 임계값 넘으면 줌 변경
            this._wheelZoomAccumulated += deltaY;

            if (Math.abs(this._wheelZoomAccumulated) >= this._wheelZoomThreshold) {
                const direction = this._wheelZoomAccumulated > 0 ? -1 : 1;
                this._wheelZoomAccumulated = 0;  // 리셋
                return direction * proportionalStep;
            }
            return 0;  // 아직 임계값 미달
        } else {
            // 터치패드: 즉시 줌 변경
            return deltaY < 0 ? proportionalStep : -proportionalStep;
        }
    }

    /**
     * Attach wheel handler to iframe document
     * Can be called after iframe content changes
     */
    _attachIframeWheelHandler() {
        const previewWrapper = this.previewFrame?.parentElement;
        if (!previewWrapper) return;

        try {
            const iframeDoc = this.previewFrame.contentDocument;
            if (!iframeDoc) return;

            // Remove existing handler if any
            if (this._iframeWheelHandler) {
                iframeDoc.removeEventListener('wheel', this._iframeWheelHandler);
            }

            this._iframeWheelHandler = (e) => {
                // 브라우저 네이티브 스크롤 즉시 차단 (트랙패드 제스처 소비 방지)
                e.preventDefault();

                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+휠: 줌

                    // 줌 방향에 따라 커서 변경 (클래스 기반으로 !important 우선순위 확보)
                    const zoomCursor = e.deltaY < 0 ? CursorUtils.zoomIn() : CursorUtils.zoomOut();
                    const zoomClass = e.deltaY < 0 ? 'zooming-in' : 'zooming-out';
                    const previewPanel = this.previewFrame?.closest('.preview-panel');
                    if (previewPanel) previewPanel.style.cursor = zoomCursor;
                    // html, body 모두에 클래스 추가 (body 영역 밖도 포함)
                    iframeDoc.documentElement.classList.remove('zooming-in', 'zooming-out');
                    iframeDoc.documentElement.classList.add(zoomClass);
                    if (iframeDoc.body) {
                        iframeDoc.body.classList.remove('zooming-in', 'zooming-out');
                        iframeDoc.body.classList.add(zoomClass);
                    }

                    clearTimeout(this._zoomCursorTimer);
                    this._zoomCursorTimer = setTimeout(() => {
                        if (previewPanel) previewPanel.style.cursor = '';
                        iframeDoc.documentElement.classList.remove('zooming-in', 'zooming-out');
                        if (iframeDoc.body) iframeDoc.body.classList.remove('zooming-in', 'zooming-out');
                    }, 150);

                    // PC 휠 / 터치패드 구분하여 줌 처리
                    const zoomDelta = this._processWheelZoom(e.deltaY);
                    if (zoomDelta === 0) return;

                    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + zoomDelta));
                    if (newZoom === this.zoomLevel) return;

                    // iframe 내부 마우스 좌표를 wrapper 기준 좌표로 변환
                    const wrapperRect = previewWrapper.getBoundingClientRect();
                    const frameRect = this.previewFrame.getBoundingClientRect();

                    const cursorScreenX = frameRect.left + (e.clientX * this.zoomLevel);
                    const cursorScreenY = frameRect.top + (e.clientY * this.zoomLevel);

                    const cursorX = cursorScreenX - wrapperRect.left;
                    const cursorY = cursorScreenY - wrapperRect.top;

                    const oldZoom = this.zoomLevel;
                    this.zoomLevel = newZoom;

                    this.applyZoomToAllCanvases(cursorX, cursorY, oldZoom);
                } else {
                    // 일반 휠: 캔버스 패닝 (스페이스바 드래그와 동일하게 동작)
                    this._handleWheelPanAllCanvases(e);
                }
            };

            iframeDoc.addEventListener('wheel', this._iframeWheelHandler, { passive: false });
        } catch (e) {
            // Cross-origin iframe
        }
    }

    setupPanning() {
        const previewWrapper = this.previewFrame?.parentElement;
        if (!previewWrapper) return;

        // Create pan overlay
        const panOverlay = document.createElement('div');
        panOverlay.id = 'editor-pan-overlay';
        panOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 100;
            display: none;
        `;
        previewWrapper.appendChild(panOverlay);

        // iframe에서 postMessage로 전달된 스페이스바 이벤트 처리
        window.addEventListener('message', (e) => {
            if (e.data.type === 'editor-space-down') {
                // ★ 멀티캔버스 모드에서는 MultiCanvasManager가 패닝 담당
                if (this.multiCanvasManager?._isInitialized) {
                    return;
                }
                // 텍스트 편집 중이면 무시
                if (this.textEditingManager?.isCurrentlyEditing()) {
                    return;
                }
                if (!this.isSpacePressed) {
                    this.isSpacePressed = true;
                    panOverlay.style.display = 'block';
                    panOverlay.style.cursor = CursorUtils.grab();

                    // 패닝 모드 클래스 추가 (CSS로 리사이즈 핸들 비활성화)
                    document.body.classList.add('panning-mode');
                    // iframe html/body에도 패닝 모드 클래스 추가
                    this._setIframePanningMode(true);

                    // 스페이스바 누르면 리사이즈 핸들 비활성화 (패닝 우선)
                    this._disableResizeHandles();

                    // 기존 editor-hover 클래스 모두 제거
                    this._clearAllHoverStates();

                    // 패닝 모드 시작 이벤트
                    this.emit('panning:mode-start');

                    // 모든 iframe에 스페이스바 상태 브로드캐스트
                    this._broadcastSpaceState(true);
                }
            } else if (e.data.type === 'editor-space-up') {
                this.isSpacePressed = false;
                if (!this.isPanning) {
                    panOverlay.style.display = 'none';
                }
                // 패닝 모드 클래스 제거
                document.body.classList.remove('panning-mode');
                // iframe html/body에서도 패닝 모드 클래스 제거
                this._setIframePanningMode(false);

                // 스페이스바 해제 시 리사이즈 핸들 복원
                this._enableResizeHandles();

                // 패닝 모드 종료 이벤트
                this.emit('panning:mode-end');

                // 모든 iframe에 스페이스바 상태 브로드캐스트
                this._broadcastSpaceState(false);
            }
        });

        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                // ★ 멀티캔버스 모드에서는 MultiCanvasManager가 패닝 담당
                if (this.multiCanvasManager?._isInitialized) {
                    return;
                }

                // TextEditingManager 플래그 직접 확인 (가장 신뢰할 수 있는 체크)
                if (this.textEditingManager?.isCurrentlyEditing()) {
                    return; // 텍스트 편집 중이면 스페이스 입력 허용
                }

                const activeEl = document.activeElement;
                let iframeActiveEl = null;
                try {
                    iframeActiveEl = this.previewFrame.contentDocument?.activeElement;
                } catch (err) {}

                // Check if we're in a text input context (fallback)
                const isInTextInput =
                    (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) ||
                    (iframeActiveEl && (iframeActiveEl.isContentEditable ||
                                        iframeActiveEl.classList?.contains('editor-editable') ||
                                        iframeActiveEl.classList?.contains('quick-text-edit')));

                if (isInTextInput) {
                    return; // Allow normal space typing in text fields
                }

                // Prevent default scroll behavior for spacebar
                e.preventDefault();
                e.stopPropagation();

                if (!this.isSpacePressed) {
                    this.isSpacePressed = true;
                    panOverlay.style.display = 'block';
                    panOverlay.style.cursor = CursorUtils.grab();

                    // 패닝 모드 클래스 추가 (CSS로 리사이즈 핸들 비활성화)
                    document.body.classList.add('panning-mode');
                    // iframe html/body에도 패닝 모드 클래스 추가
                    this._setIframePanningMode(true);

                    // 스페이스바 누르면 리사이즈 핸들 비활성화 (패닝 우선)
                    this._disableResizeHandles();

                    // 기존 editor-hover 클래스 모두 제거
                    this._clearAllHoverStates();

                    // 패닝 모드 시작 이벤트
                    this.emit('panning:mode-start');

                    // 모든 iframe에 스페이스바 상태 브로드캐스트
                    this._broadcastSpaceState(true);
                }
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                if (!this.isPanning) {
                    panOverlay.style.display = 'none';
                }
                // 패닝 모드 클래스 제거
                document.body.classList.remove('panning-mode');
                // iframe html/body에서도 패닝 모드 클래스 제거
                this._setIframePanningMode(false);

                // 스페이스바 해제 시 리사이즈 핸들 복원
                this._enableResizeHandles();

                // 패닝 모드 종료 이벤트
                this.emit('panning:mode-end');

                // 모든 iframe에 스페이스바 상태 브로드캐스트
                this._broadcastSpaceState(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        // ★ 윈도우 포커스 잃으면 space 상태 리셋 (alt-tab 등으로 keyup 누락 방지)
        const resetSpaceState = () => {
            if (this.isSpacePressed) {
                this.isSpacePressed = false;
                if (!this.isPanning) {
                    panOverlay.style.display = 'none';
                }
                document.body.classList.remove('panning-mode');
                this._setIframePanningMode(false);
                this._enableResizeHandles();
                this.emit('panning:mode-end');
                this._broadcastSpaceState(false);
            }
            if (this.isPanning) {
                this.isPanning = false;
                panOverlay.style.display = 'none';
                panOverlay.style.cursor = '';
                this._setIframePanningGrabbing(false);
                this.previewFrame.style.transition = '';
            }
        };
        window.addEventListener('blur', resetSpaceState);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) resetSpaceState();
        });

        panOverlay.addEventListener('mousedown', (e) => {
            if (this.isSpacePressed) {
                e.preventDefault();
                e.stopPropagation();
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                panOverlay.style.cursor = CursorUtils.grabbing();
                // iframe html/body에 grabbing 클래스 추가
                this._setIframePanningGrabbing(true);

                // Pan 중에는 transition 비활성화
                this.previewFrame.style.transition = 'none';

                const currentTransform = this.previewFrame.style.transform;
                const translateMatch = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                if (translateMatch) {
                    this.panOffsetX = parseFloat(translateMatch[1]) || 0;
                    this.panOffsetY = parseFloat(translateMatch[2]) || 0;
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const deltaX = e.clientX - this.panStartX;
                const deltaY = e.clientY - this.panStartY;

                const newTranslateX = this.panOffsetX + deltaX;
                const newTranslateY = this.panOffsetY + deltaY;

                const newTransform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${this.zoomLevel})`;

                this.previewFrame.style.transformOrigin = '0 0';
                this.previewFrame.style.transform = newTransform;

                // 멀티뷰 모드일 때 보조 캔버스들에도 동일한 transform 적용
                if (this.multiCanvasManager?.isEnabled()) {
                    const iframes = this.multiCanvasManager.getIframes();
                    if (iframes && iframes.length > 0) {
                        iframes.forEach((iframe) => {
                            if (iframe === this.previewFrame) return;
                            iframe.style.transformOrigin = '0 0';
                            iframe.style.transform = newTransform;
                        });
                    }
                }

                this.emit('zoom:changed', this.zoomLevel);
                requestAnimationFrame(() => this.updateResizeHandles());
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                panOverlay.style.cursor = this.isSpacePressed ? CursorUtils.grab() : '';
                // iframe html/body에서 grabbing 클래스 제거
                this._setIframePanningGrabbing(false);
                if (!this.isSpacePressed) {
                    panOverlay.style.display = 'none';
                }
                // Pan 종료 후 transition 복원
                this.previewFrame.style.transition = '';
            }
        });

        // Handle in iframe too
        this.previewFrame.addEventListener('load', () => {
            this._attachIframePanHandlers();
        });

        // iframe이 이미 로드된 경우 즉시 핸들러 등록
        if (this.previewFrame.contentDocument?.readyState === 'complete') {
            this._attachIframePanHandlers();
        }
    }

    /**
     * Setup preview resize handles for viewport width adjustment
     */
    setupPreviewResize() {
        const wrapper = document.querySelector('.preview-wrapper');
        if (!wrapper) return;

        // Store wrapper reference
        this.previewWrapper = wrapper;

        // Create resize handles with fixed positioning
        const leftHandle = document.createElement('div');
        leftHandle.className = 'preview-resize-handle left';
        leftHandle.style.position = 'fixed';
        leftHandle.style.zIndex = '50';

        const rightHandle = document.createElement('div');
        rightHandle.className = 'preview-resize-handle right';
        rightHandle.style.position = 'fixed';
        rightHandle.style.zIndex = '50';

        const bottomHandle = document.createElement('div');
        bottomHandle.className = 'preview-resize-handle bottom';
        bottomHandle.style.position = 'fixed';
        bottomHandle.style.zIndex = '50';

        // Create container for preview with handles
        const container = document.createElement('div');
        container.className = 'preview-container';

        // Move iframe into container
        wrapper.insertBefore(container, this.previewFrame);
        container.appendChild(this.previewFrame);

        // Add handles to body with position: fixed for accurate positioning
        document.body.appendChild(leftHandle);
        document.body.appendChild(rightHandle);
        document.body.appendChild(bottomHandle);

        // Store references
        this.previewContainer = container;
        this.resizeHandleLeft = leftHandle;
        this.resizeHandleRight = rightHandle;
        this.resizeHandleBottom = bottomHandle;

        // Initially hide handles (will be shown after view mode is set)
        leftHandle.classList.add('hidden');
        rightHandle.classList.add('hidden');
        bottomHandle.classList.add('hidden');

        // 핸들 위에서도 휠 패닝이 작동하도록 이벤트 추가
        const handleWheel = (e) => {
            if (e.ctrlKey || e.metaKey) {
                // Ctrl+휠: 줌 - PC 휠 / 터치패드 구분
                e.preventDefault();
                const zoomDelta = this._processWheelZoom(e.deltaY);
                if (zoomDelta === 0) return;

                const wrapperRect = wrapper.getBoundingClientRect();
                const mouseX = e.clientX - wrapperRect.left;
                const mouseY = e.clientY - wrapperRect.top;
                const oldZoom = this.zoomLevel;

                this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + zoomDelta));

                if (oldZoom !== this.zoomLevel) {
                    this.applyZoomToAllCanvases(mouseX, mouseY, oldZoom);
                }
            } else {
                // 일반 휠: 캔버스 패닝
                this._handleWheelPanAllCanvases(e);
            }
        };

        leftHandle.addEventListener('wheel', handleWheel, { passive: false });
        rightHandle.addEventListener('wheel', handleWheel, { passive: false });
        bottomHandle.addEventListener('wheel', handleWheel, { passive: false });

        // Show handles after initial layout settles
        setTimeout(() => {
            this.setResizeHandlesVisible(true);
        }, 100);

        // Resize logic - 화면상 중심을 기준으로 좌우 확장
        const startResize = (e, side) => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startWidth = this.previewFrame.offsetWidth;
            const scale = this.zoomLevel || 1;

            // 시작 시 캔버스의 화면상 중심 X 좌표 저장 (이 위치를 유지)
            const startFrameRect = this.previewFrame.getBoundingClientRect();
            const canvasCenterX = startFrameRect.left + startFrameRect.width / 2;

            // 현재 translateY 저장 (Y는 변경하지 않음)
            const startTransform = this.getIframeTransform();
            const startTranslateY = startTransform.translateY;

            const handle = side === 'left' ? leftHandle : rightHandle;
            handle.classList.add('dragging');
            container.classList.add('resizing');

            // Store breakpoint constraints at resize start (before any width updates corrupt the list)
            this.resizeConstraints = this.calculateBreakpointConstraints();

            // 자주 쓰는 해상도 목록 (snap 대상)
            const commonWidths = [1680, 1440, 1366, 1280, 1156, 1024, 840, 768, 640, 560, 480, 430, 414, 390, 375, 360, 320];
            const snapThreshold = 15; // snap 진입 범위 (px)
            const snapEscapeThreshold = 20; // snap 탈출 범위 (px) - 더 크게 해서 sticky 느낌
            let lastSnappedWidth = null; // 마지막으로 snap된 해상도

            const onMouseMove = (e) => {
                e.preventDefault();
                const diff = e.clientX - startX;
                const scaledDiff = diff / scale;

                let newWidth;

                if (side === 'right') {
                    // 오른쪽 핸들: 오른쪽으로 늘어남
                    newWidth = startWidth + scaledDiff;
                } else {
                    // 왼쪽 핸들: 왼쪽으로 늘어남 (마우스 왼쪽 = diff < 0 = width 증가)
                    newWidth = startWidth - scaledDiff;
                }

                // Ctrl key: snap to 10px increments
                if (e.ctrlKey) {
                    newWidth = Math.round(newWidth / 10) * 10;
                    lastSnappedWidth = null;
                } else {
                    // 현재 snap 상태에서 벗어나려면 더 많이 이동해야 함 (sticky 느낌)
                    if (lastSnappedWidth !== null) {
                        if (Math.abs(newWidth - lastSnappedWidth) <= snapEscapeThreshold) {
                            newWidth = lastSnappedWidth;
                        } else {
                            lastSnappedWidth = null;
                        }
                    }

                    // 새로운 snap 포인트 찾기
                    if (lastSnappedWidth === null) {
                        for (const commonWidth of commonWidths) {
                            if (Math.abs(newWidth - commonWidth) <= snapThreshold) {
                                newWidth = commonWidth;
                                lastSnappedWidth = commonWidth;
                                break;
                            }
                        }
                    }
                }

                // Use stored constraints from resize start (not live values that get corrupted)
                const { minWidth, maxWidth } = this.resizeConstraints;

                // Clamp width within breakpoint constraints
                const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

                // 너비 적용
                this.previewFrame.style.width = clampedWidth + 'px';
                container.style.width = clampedWidth + 'px';

                // 화면상 중심(canvasCenterX) 유지를 위한 translateX 계산
                const wrapperRect = wrapper.getBoundingClientRect();
                const isFullscreen = wrapper.classList.contains('fullscreen-mode');

                // 새 화면 너비 (스케일 적용)
                const newScreenWidth = clampedWidth * scale;

                // 원래 왼쪽 (transform 없을 때, 화면 좌표)
                let originalLeft;
                if (isFullscreen) {
                    // PC 모드: flex-start이므로 왼쪽 정렬
                    originalLeft = wrapperRect.left;
                } else {
                    // 일반 모드: flexbox 중앙 정렬
                    originalLeft = wrapperRect.left + (wrapperRect.width - clampedWidth) / 2;
                }

                // 중심이 canvasCenterX에 오도록 하는 새 왼쪽 위치
                const newLeft = canvasCenterX - newScreenWidth / 2;

                // 새 translateX 계산
                const newTranslateX = newLeft - originalLeft;

                this.previewFrame.style.transformOrigin = '0 0';
                this.previewFrame.style.transform = `translate(${newTranslateX}px, ${startTranslateY}px) scale(${scale})`;

                // panOffset 업데이트 (다음 줌/패닝에서 사용)
                this.panOffsetX = newTranslateX;

                this.emit('viewport:resized', { width: Math.round(clampedWidth) });
                this.updateResizeHandles();
            };

            const onMouseUp = () => {
                handle.classList.remove('dragging');
                container.classList.remove('resizing');
                this.resizeConstraints = null; // Clear stored constraints
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // Emit resize end event with final width
                const finalWidth = parseInt(this.previewFrame.style.width) || 0;
                this.emit('viewport:resizeEnd', { width: finalWidth });
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        leftHandle.addEventListener('mousedown', (e) => startResize(e, 'left'));
        rightHandle.addEventListener('mousedown', (e) => startResize(e, 'right'));

        // Bottom handle resize logic - 높이 조절
        const startBottomResize = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startY = e.clientY;
            const scale = this.zoomLevel || 1;
            const startHeight = this.previewFrame.offsetHeight;

            bottomHandle.classList.add('dragging');
            container.classList.add('resizing');

            const onMouseMove = (e) => {
                e.preventDefault();
                const diff = e.clientY - startY;
                const scaledDiff = diff / scale;

                let newHeight = startHeight + scaledDiff;

                // Ctrl key: snap to 10px increments
                if (e.ctrlKey) {
                    newHeight = Math.round(newHeight / 10) * 10;
                }

                // 최소/최대 높이 제한
                const minHeight = 200;
                const maxHeight = 50000;
                const clampedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

                // 높이 적용
                this.previewFrame.style.height = clampedHeight + 'px';

                this.emit('viewport:heightResized', { height: Math.round(clampedHeight) });
                this.updateResizeHandles();
            };

            const onMouseUp = () => {
                bottomHandle.classList.remove('dragging');
                container.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                const finalHeight = parseInt(this.previewFrame.style.height) || 0;
                this.emit('viewport:heightResizeEnd', { height: finalHeight });
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        bottomHandle.addEventListener('mousedown', startBottomResize);

        // Initial position update after layout settles
        requestAnimationFrame(() => this.updateResizeHandles());
    }

    /**
     * Update resize handles position to match iframe's transformed position
     * Uses screen coordinates directly since handles are position: fixed
     * Hides handles that are outside the visible wrapper area
     */
    updateResizeHandles() {
        if (!this.resizeHandleLeft || !this.resizeHandleRight || !this.previewWrapper) return;

        const frameRect = this.previewFrame.getBoundingClientRect();
        const wrapperRect = this.previewWrapper.getBoundingClientRect();

        // Left handle position
        const leftHandleX = frameRect.left - 8;
        this.resizeHandleLeft.style.left = leftHandleX + 'px';
        this.resizeHandleLeft.style.top = frameRect.top + 'px';
        this.resizeHandleLeft.style.height = frameRect.height + 'px';

        // Right handle position
        const rightHandleX = frameRect.right - 8;
        this.resizeHandleRight.style.left = rightHandleX + 'px';
        this.resizeHandleRight.style.top = frameRect.top + 'px';
        this.resizeHandleRight.style.height = frameRect.height + 'px';

        // Bottom handle position
        if (this.resizeHandleBottom) {
            this.resizeHandleBottom.style.left = frameRect.left + 'px';
            this.resizeHandleBottom.style.top = (frameRect.bottom - 8) + 'px';
            this.resizeHandleBottom.style.width = frameRect.width + 'px';

            // Bottom handle visible if iframe bottom edge is inside wrapper
            const bottomVisible = frameRect.bottom < wrapperRect.bottom - 20;
            this.resizeHandleBottom.style.visibility = bottomVisible ? '' : 'hidden';
        }

        // Hide handles if they are outside the wrapper (canvas fills the screen)
        // Left handle visible if iframe left edge is inside wrapper (with some margin)
        const leftVisible = frameRect.left > wrapperRect.left + 20;
        this.resizeHandleLeft.style.visibility = leftVisible ? '' : 'hidden';

        // Right handle visible if iframe right edge is inside wrapper (with some margin)
        const rightVisible = frameRect.right < wrapperRect.right - 20;
        this.resizeHandleRight.style.visibility = rightVisible ? '' : 'hidden';
    }

    /**
     * Show/hide resize handles
     */
    setResizeHandlesVisible(visible) {
        if (visible) {
            // Use requestAnimationFrame to ensure layout is calculated
            requestAnimationFrame(() => {
                this.updateResizeHandles();
                if (this.resizeHandleLeft) {
                    this.resizeHandleLeft.classList.remove('hidden');
                    // Clear transition hiding styles
                    this.resizeHandleLeft.style.opacity = '';
                    this.resizeHandleLeft.style.pointerEvents = '';
                }
                if (this.resizeHandleRight) {
                    this.resizeHandleRight.classList.remove('hidden');
                    // Clear transition hiding styles
                    this.resizeHandleRight.style.opacity = '';
                    this.resizeHandleRight.style.pointerEvents = '';
                }
                if (this.resizeHandleBottom) {
                    this.resizeHandleBottom.classList.remove('hidden');
                    this.resizeHandleBottom.style.opacity = '';
                    this.resizeHandleBottom.style.pointerEvents = '';
                }
            });
        } else {
            if (this.resizeHandleLeft) {
                this.resizeHandleLeft.classList.add('hidden');
            }
            if (this.resizeHandleRight) {
                this.resizeHandleRight.classList.add('hidden');
            }
            if (this.resizeHandleBottom) {
                this.resizeHandleBottom.classList.add('hidden');
            }
        }
    }

    applyZoomAtPoint(pointX, pointY, oldZoom) {
        const wrapper = this.previewFrame.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const frameRect = this.previewFrame.getBoundingClientRect();

        const currentTransform = this.previewFrame.style.transform;
        let currentTranslateX = 0;
        let currentTranslateY = 0;

        const translateMatch = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (translateMatch) {
            currentTranslateX = parseFloat(translateMatch[1]) || 0;
            currentTranslateY = parseFloat(translateMatch[2]) || 0;
        }

        // iframe의 현재 화면상 위치 (wrapper 기준)
        const frameLeftInWrapper = frameRect.left - wrapperRect.left;
        const frameTopInWrapper = frameRect.top - wrapperRect.top;

        // pointX, pointY를 iframe의 콘텐츠 좌표로 변환
        // frameRect는 이미 scale이 적용된 상태이므로 oldZoom으로 나눔
        const contentX = (pointX - frameLeftInWrapper) / oldZoom;
        const contentY = (pointY - frameTopInWrapper) / oldZoom;

        // 새 줌 적용 후 같은 콘텐츠 위치가 같은 화면 위치에 오도록 translate 계산
        // 새로운 프레임 왼쪽 위치 = pointX - contentX * newZoom
        const newFrameLeft = pointX - contentX * this.zoomLevel;
        const newFrameTop = pointY - contentY * this.zoomLevel;

        // translate는 원래 위치에서의 이동량
        // iframe의 원래 위치(transform 없을 때) = wrapper 중앙 - iframe 너비/2 (중앙 정렬 시)
        // 하지만 CSS로 중앙 정렬되므로, translate는 그 중앙 정렬된 위치에서의 추가 이동
        // 현재 frameLeftInWrapper = (원래위치) + currentTranslateX * oldZoom (scale 적용 후)
        // 원래위치 = frameLeftInWrapper - currentTranslateX (scale 전 기준이 아니라 scale 후 기준으로 봐야함)

        // 간단히: 새 translate = 현재 translate + (새위치 - 현재위치)
        const deltaX = newFrameLeft - frameLeftInWrapper;
        const deltaY = newFrameTop - frameTopInWrapper;

        const newTranslateX = currentTranslateX + deltaX;
        const newTranslateY = currentTranslateY + deltaY;

        this.panOffsetX = newTranslateX;
        this.panOffsetY = newTranslateY;

        this.previewFrame.style.transformOrigin = '0 0';
        this.previewFrame.style.transform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${this.zoomLevel})`;

        this.updateZoomIndicator();
        // Wait for layout update before repositioning handles
        requestAnimationFrame(() => this.updateResizeHandles());
        this.emit('zoom:changed', this.zoomLevel);
    }

    zoomIn() {
        const oldZoom = this.zoomLevel;
        const step = this.zoomLevel * 0.1 * this._zoomAccelBaseRate;
        this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + step);

        const wrapper = this.previewFrame.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();

        // wrapper 화면 중앙을 기준으로 확대
        const centerX = wrapperRect.width / 2;
        const centerY = wrapperRect.height / 2;

        this.applyZoomToAllCanvases(centerX, centerY, oldZoom);
    }

    zoomOut() {
        const oldZoom = this.zoomLevel;
        const step = this.zoomLevel * 0.1 * this._zoomAccelBaseRate;
        this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - step);

        const wrapper = this.previewFrame.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();

        // wrapper 화면 중앙을 기준으로 축소
        const centerX = wrapperRect.width / 2;
        const centerY = wrapperRect.height / 2;

        this.applyZoomToAllCanvases(centerX, centerY, oldZoom);
    }

    resetZoom() {
        this.zoomLevel = 1;
        this.panOffsetX = 0;
        this.panOffsetY = 0;
        this.previewFrame.style.transform = '';
        this.previewFrame.style.transformOrigin = '';

        // 멀티캔버스 모드에서는 resetView 사용
        if (this.multiCanvasManager?.isEnabled()) {
            this.multiCanvasManager.resetView();
            return;
        }

        // 높이를 콘텐츠 전체 높이에 맞춤
        this.setCanvasHeightToContent();

        // 너비를 현재 뷰모드 해상도에 맞춤
        if (this.viewModeManager) {
            const currentWidth = this.viewModeManager.currentViewWidth;
            if (currentWidth === '100%') {
                // PC 모드: 너비를 비움 (100%)
                this.previewFrame.style.width = '';
                if (this.previewContainer) {
                    this.previewContainer.style.width = '';
                }
            } else {
                // 다른 모드: 지정된 너비
                const widthValue = typeof currentWidth === 'number' ? currentWidth : parseInt(currentWidth);
                this.previewFrame.style.width = widthValue + 'px';
                if (this.previewContainer) {
                    this.previewContainer.style.width = widthValue + 'px';
                }
            }
        }

        this.updateZoomIndicator();
        requestAnimationFrame(() => this.updateResizeHandles());
    }

    /**
     * Reset zoom with smooth animation (for view mode transitions)
     * Sets transform to identity first, then cleans up after transition
     */
    resetZoomAnimated() {
        this.zoomLevel = 1;
        this.panOffsetX = 0;
        this.panOffsetY = 0;

        // Hide handles during transition
        this.hideResizeHandlesDuringTransition();

        // 먼저 identity transform으로 애니메이션 (smooth-transition 클래스가 적용된 상태)
        this.previewFrame.style.transform = 'translate(0px, 0px) scale(1)';
        this.previewFrame.style.transformOrigin = '0 0';
        this.updateZoomIndicator();

        // 트랜지션 완료 후 transform 속성 정리 (transitionend에서 핸들 위치 업데이트됨)
        setTimeout(() => {
            this.previewFrame.style.transform = '';
            this.previewFrame.style.transformOrigin = '';
        }, 90);
        this.emit('zoom:changed', this.zoomLevel);
    }

    /**
     * 뷰모드 변경 전 현재 캔버스 중심 좌표 저장
     * @returns {{ centerX: number, centerY: number, scale: number, translateY: number }}
     */
    captureCanvasCenter() {
        const frameRect = this.previewFrame.getBoundingClientRect();
        const currentTransform = this.getIframeTransform();
        return {
            centerX: frameRect.left + frameRect.width / 2,
            centerY: frameRect.top + frameRect.height / 2,
            scale: this.zoomLevel || 1,
            translateY: currentTransform.translateY
        };
    }

    /**
     * 뷰모드 변경 애니메이션 - JavaScript로 매 프레임 transform 계산하여 중심 유지
     * @param {number|string} newWidth - 새 너비 (픽셀 또는 '100%')
     * @param {boolean} isFullscreen - PC 모드 여부
     * @param {{ centerX: number, centerY: number, scale: number, translateY: number }} savedCenter - 저장된 중심 좌표
     * @param {number} oldWidth - 이전 너비 (픽셀)
     */
    animateViewModeChange(newWidth, isFullscreen, savedCenter, oldWidth) {
        const wrapper = this.previewWrapper;
        const container = this.previewContainer;
        if (!wrapper || !savedCenter) return;

        const scale = savedCenter.scale;
        const wrapperRect = wrapper.getBoundingClientRect();

        // 최종 너비 결정
        let targetWidth;
        if (newWidth === '100%') {
            targetWidth = wrapperRect.width;
        } else {
            targetWidth = typeof newWidth === 'number' ? newWidth : parseInt(newWidth);
        }

        const startWidth = oldWidth || this.previewFrame.offsetWidth;
        const duration = 75; // ms
        const startTime = performance.now();

        // easeOut 함수
        const easeOut = (t) => 1 - Math.pow(1 - t, 2);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOut(progress);

            // 현재 너비 계산
            const currentWidth = startWidth + (targetWidth - startWidth) * easedProgress;

            // 너비 적용
            this.previewFrame.style.width = currentWidth + 'px';
            if (container) container.style.width = currentWidth + 'px';

            // flexbox 위치 계산 (현재 너비 기준)
            // 애니메이션 중에는 실제 wrapper 클래스 상태를 확인 (fullscreen-mode는 애니메이션 후 추가됨)
            const isCurrentlyFullscreen = wrapper.classList.contains('fullscreen-mode');
            let originalLeft;
            if (isCurrentlyFullscreen) {
                originalLeft = wrapperRect.left;
            } else {
                originalLeft = wrapperRect.left + (wrapperRect.width - currentWidth) / 2;
            }

            // 중심 유지를 위한 transform 계산
            const screenWidth = currentWidth * scale;
            const newLeft = savedCenter.centerX - screenWidth / 2;
            const translateX = newLeft - originalLeft;

            // transform 적용
            this.previewFrame.style.transformOrigin = '0 0';
            this.previewFrame.style.transform = `translate(${translateX}px, ${savedCenter.translateY}px) scale(${scale})`;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // 애니메이션 완료 - 최종 값 설정
                let finalTranslateX = translateX;

                if (newWidth === '100%') {
                    // PC 모드: 너비를 빈 값으로 설정
                    this.previewFrame.style.width = '';
                    if (container) container.style.width = '';

                    // width='' 설정 후 실제 레이아웃 기준으로 transform 재계산
                    const freshWrapperRect = wrapper.getBoundingClientRect();
                    const finalWidth = this.previewFrame.offsetWidth;
                    const finalOriginalLeft = freshWrapperRect.left + (freshWrapperRect.width - finalWidth) / 2;
                    const finalScreenWidth = finalWidth * scale;
                    const finalNewLeft = savedCenter.centerX - finalScreenWidth / 2;
                    finalTranslateX = finalNewLeft - finalOriginalLeft;

                    this.previewFrame.style.transform = `translate(${finalTranslateX}px, ${savedCenter.translateY}px) scale(${scale})`;
                }

                this.panOffsetX = finalTranslateX;
                this.panOffsetY = savedCenter.translateY;
                this.updateResizeHandles();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * 뷰모드 변경 후 저장된 캔버스 중심을 유지하도록 transform 조정 (즉시 적용, 애니메이션 없음)
     * @param {number|string} newWidth - 새 너비 (픽셀 또는 '100%')
     * @param {boolean} isFullscreen - PC 모드 여부
     * @param {{ centerX: number, centerY: number, scale: number, translateY: number }} savedCenter - 저장된 중심 좌표
     */
    applyTransformForViewModeChange(newWidth, isFullscreen, savedCenter) {
        const wrapper = this.previewWrapper;
        if (!wrapper || !savedCenter) return;

        const scale = savedCenter.scale;

        // 1. 최종 CSS 너비 결정 (DOM 읽지 않고 직접 계산)
        let cssWidth;
        if (newWidth === '100%') {
            cssWidth = wrapper.getBoundingClientRect().width;
        } else {
            cssWidth = typeof newWidth === 'number' ? newWidth : parseInt(newWidth);
        }

        // 2. flexbox가 최종 배치할 위치 계산 (트랜지션 무관하게 최종 값)
        const wrapperRect = wrapper.getBoundingClientRect();
        let originalLeft;
        if (isFullscreen) {
            // PC 모드: flex-start, 왼쪽 정렬
            originalLeft = wrapperRect.left;
        } else {
            // 다른 모드: 중앙 정렬
            originalLeft = wrapperRect.left + (wrapperRect.width - cssWidth) / 2;
        }

        // 3. 새 화면 너비 (스케일 적용)
        const newScreenWidth = cssWidth * scale;

        // 4. 저장된 중심이 유지되도록 새 왼쪽 위치 계산
        const newLeft = savedCenter.centerX - newScreenWidth / 2;

        // 5. 새 translateX 계산
        const newTranslateX = newLeft - originalLeft;

        // 6. transform 적용
        this.previewFrame.style.transformOrigin = '0 0';
        this.previewFrame.style.transform = `translate(${newTranslateX}px, ${savedCenter.translateY}px) scale(${scale})`;

        // panOffset 업데이트
        this.panOffsetX = newTranslateX;
        this.panOffsetY = savedCenter.translateY;
    }

    updateZoomIndicator() {
        const raw = this.zoomLevel * 100;
        const percentage = raw < 10 ? Math.round(raw * 10) / 10 : Math.round(raw);
        if (this.zoomLevelDisplay) {
            this.zoomLevelDisplay.textContent = `${percentage}%`;
        }
    }

    /**
     * Get current iframe transform values
     * @returns {{ translateX: number, translateY: number, scale: number }}
     */
    getIframeTransform() {
        const transform = this.previewFrame.style.transform;
        let translateX = 0, translateY = 0, scale = 1;

        if (transform) {
            const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
            if (translateMatch) {
                translateX = parseFloat(translateMatch[1]) || 0;
                translateY = parseFloat(translateMatch[2]) || 0;
            }

            const scaleMatch = transform.match(/scale\(([^)]+)\)/);
            if (scaleMatch) {
                scale = parseFloat(scaleMatch[1]) || 1;
            }
        }

        return { translateX, translateY, scale };
    }

    getZoomLevel() {
        return this.zoomLevel;
    }

    /**
     * Get preview container reference
     */
    getPreviewContainer() {
        return this.previewContainer;
    }

    /**
     * Set viewport width
     */
    setViewportWidth(width) {
        if (this.previewFrame) {
            this.previewFrame.style.width = width + 'px';
        }
        if (this.previewContainer) {
            this.previewContainer.style.width = width + 'px';
        }
        this.updateResizeHandles();
    }

    /**
     * Set canvas height to match content height
     * Called on initial load to fit the entire page content
     */
    setCanvasHeightToContent() {
        try {
            const iframeDoc = this.previewFrame?.contentDocument;
            if (!iframeDoc || !iframeDoc.body) return;

            // Get the full content height
            const contentHeight = Math.max(
                iframeDoc.body.scrollHeight,
                iframeDoc.documentElement.scrollHeight
            );

            // Set minimum height (wrapper height)
            const wrapperHeight = this.previewWrapper?.offsetHeight || 600;
            const finalHeight = Math.max(contentHeight, wrapperHeight);

            this.previewFrame.style.height = finalHeight + 'px';
            this.updateResizeHandles();

            console.log('[ZoomManager] Canvas height set to content:', finalHeight + 'px');
        } catch (err) {
            console.error('[ZoomManager] Cannot set canvas height to content:', err);
        }
    }

    /**
     * Get min/max width constraints based on current breakpoint
     * - Max width: less than PC (1680px)
     * - Min width: greater than the next smaller breakpoint
     * @returns {{ minWidth: number, maxWidth: number }}
     */
    getBreakpointConstraints() {
        // If we have stored constraints from resize start, use those
        if (this.resizeConstraints) {
            return this.resizeConstraints;
        }
        return this.calculateBreakpointConstraints();
    }

    /**
     * Calculate breakpoint constraints based on button position in the list
     * Uses DOM order of buttons (which is sorted by width descending) to determine boundaries
     * @returns {{ minWidth: number, maxWidth: number }}
     */
    calculateBreakpointConstraints() {
        const MIN_ABSOLUTE = 320;
        const MAX_ABSOLUTE = 10000; // 사실상 제한 없음

        // Default constraints
        let minWidth = MIN_ABSOLUTE;
        let maxWidth = MAX_ABSOLUTE;

        // If ViewModeManager is available, get breakpoint-aware constraints
        if (this.viewModeManager && this.viewModeManager.viewModes) {
            const viewModes = this.viewModeManager.viewModes;
            const btns = Array.from(viewModes.querySelectorAll('.view-btn'));

            // Get current active button
            const activeBtn = viewModes.querySelector('.view-btn.active');

            // PC 모드일 때는 제한 없음
            if (!activeBtn || activeBtn.dataset.width === '100%') {
                return { minWidth, maxWidth };
            }

            // Find the active button's index in the button list
            const activeIndex = btns.indexOf(activeBtn);

            // Find the previous breakpoint (larger - appears before in list)
            // and next breakpoint (smaller - appears after in list)
            let prevBreakpoint = null;
            let nextBreakpoint = null;

            // Look for previous button (larger breakpoint)
            for (let i = activeIndex - 1; i >= 0; i--) {
                const btn = btns[i];
                if (btn.dataset.width === '100%') {
                    // PC 모드는 1680px로 취급
                    prevBreakpoint = 1680;
                    break;
                }
                const w = parseInt(btn.dataset.width);
                if (!isNaN(w)) {
                    prevBreakpoint = w;
                    break;
                }
            }

            // Look for next button (smaller breakpoint)
            for (let i = activeIndex + 1; i < btns.length; i++) {
                const btn = btns[i];
                if (btn.classList.contains('view-add-btn')) continue; // Skip add button
                const w = parseInt(btn.dataset.width);
                if (!isNaN(w)) {
                    nextBreakpoint = w;
                    break;
                }
            }

            // Max width: just below previous (larger) breakpoint or MAX_ABSOLUTE
            if (prevBreakpoint !== null) {
                maxWidth = prevBreakpoint - 1;
            } else {
                maxWidth = MAX_ABSOLUTE;
            }

            // Min width: just above next (smaller) breakpoint or MIN_ABSOLUTE
            if (nextBreakpoint !== null) {
                minWidth = nextBreakpoint + 1;
            } else {
                minWidth = MIN_ABSOLUTE;
            }
        }

        return { minWidth, maxWidth };
    }

    /**
     * Reattach iframe handlers after content changes
     * Should be called when iframe content is modified directly (not via iframe load)
     */
    reattachIframeHandlers() {
        this._attachIframeWheelHandler();
        this._attachIframePanHandlers();
    }

    /**
     * 보조 캔버스에 줌/패닝 휠 핸들러 추가
     * MultiCanvasManager에서 캔버스 생성 시 호출
     */
    setupSecondaryCanvasHandlers(wrapper, iframe) {
        if (!wrapper || !iframe) return;

        // 이미 핸들러가 등록되어 있으면 건너뜀
        if (wrapper._zoomHandlerAttached) return;
        wrapper._zoomHandlerAttached = true;

        // Wrapper에 휠 이벤트 핸들러 추가
        wrapper.addEventListener('wheel', (e) => {
            // 이벤트 버블링 방지 (멀티캔버스 컨테이너 핸들러 중복 실행 방지)
            e.stopPropagation();
            e.preventDefault();

            if (e.ctrlKey || e.metaKey) {
                // Ctrl+휠: 줌 - PC 휠 / 터치패드 구분
                const zoomDelta = this._processWheelZoom(e.deltaY);
                if (zoomDelta === 0) return;

                // 메인 wrapper 기준 좌표로 변환
                const mainWrapperRect = this.previewWrapper.getBoundingClientRect();
                const secondaryWrapperRect = wrapper.getBoundingClientRect();

                const relX = (e.clientX - secondaryWrapperRect.left) / secondaryWrapperRect.width;
                const relY = (e.clientY - secondaryWrapperRect.top) / secondaryWrapperRect.height;

                const mouseX = mainWrapperRect.width * relX;
                const mouseY = mainWrapperRect.height * relY;

                const oldZoom = this.zoomLevel;
                this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + zoomDelta));

                if (oldZoom !== this.zoomLevel) {
                    this.applyZoomToAllCanvases(mouseX, mouseY, oldZoom);
                }
            } else {
                // 일반 휠: 패닝
                this._handleWheelPanAllCanvases(e);
            }
        }, { passive: false });

        // iframe 내부에도 휠 핸들러 추가 (이미 로드된 상태에서 호출됨)
        this._attachSecondaryIframeWheelHandler(wrapper, iframe);

        // iframe 내부에 키보드 핸들러 추가 (스페이스바 패닝)
        this._attachSecondaryIframePanHandlers(iframe);
    }

    /**
     * 보조 캔버스 iframe 내부에 휠 핸들러 연결
     */
    _attachSecondaryIframeWheelHandler(wrapper, iframe) {
        try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) return;

            // 이미 핸들러가 등록되어 있으면 건너뜀
            if (iframe._wheelHandlerAttached) return;
            iframe._wheelHandlerAttached = true;

            iframeDoc.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();

                    // PC 휠 / 터치패드 구분하여 줌 처리
                    const zoomDelta = this._processWheelZoom(e.deltaY);
                    if (zoomDelta === 0) return;

                    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + zoomDelta));
                    if (newZoom === this.zoomLevel) return;

                    // 메인 wrapper 기준 좌표로 변환
                    const mainWrapperRect = this.previewWrapper.getBoundingClientRect();
                    const frameRect = iframe.getBoundingClientRect();

                    // iframe 내부 마우스 좌표를 화면 좌표로 변환
                    const cursorScreenX = frameRect.left + (e.clientX * this.zoomLevel);
                    const cursorScreenY = frameRect.top + (e.clientY * this.zoomLevel);

                    // 보조 캔버스 내 상대 위치
                    const secondaryWrapperRect = wrapper.getBoundingClientRect();
                    const relX = (cursorScreenX - secondaryWrapperRect.left) / secondaryWrapperRect.width;
                    const relY = (cursorScreenY - secondaryWrapperRect.top) / secondaryWrapperRect.height;

                    // 메인 wrapper 기준 좌표로 변환
                    const cursorX = mainWrapperRect.width * relX;
                    const cursorY = mainWrapperRect.height * relY;

                    const oldZoom = this.zoomLevel;
                    this.zoomLevel = newZoom;

                    this.applyZoomToAllCanvases(cursorX, cursorY, oldZoom);
                } else {
                    this._handleWheelPanAllCanvases(e);
                }
            }, { passive: false });
        } catch (err) {
            // Cross-origin iframe
        }
    }

    /**
     * 보조 캔버스 iframe 내부에 패닝 키보드 핸들러 연결
     */
    _attachSecondaryIframePanHandlers(iframe) {
        try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) return;

            // 이미 핸들러가 등록되어 있으면 건너뜀
            if (iframe._panHandlerAttached) return;
            iframe._panHandlerAttached = true;

            const handleKeyDown = (e) => {
                if (e.code === 'Space') {
                    // ★ 멀티캔버스 모드에서는 MultiCanvasManager가 패닝 담당
                    if (this.multiCanvasManager?._isInitialized) {
                        return;
                    }

                    // TextEditingManager 플래그 직접 확인
                    if (this.textEditingManager?.isCurrentlyEditing()) {
                        return;
                    }

                    const iframeActiveEl = iframeDoc.activeElement;

                    // Check if we're in a text input context (fallback)
                    const isInTextInput =
                        iframeActiveEl && (iframeActiveEl.isContentEditable ||
                                            iframeActiveEl.classList?.contains('editor-editable') ||
                                            iframeActiveEl.classList?.contains('quick-text-edit'));

                    if (isInTextInput) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    const panOverlay = document.getElementById('editor-pan-overlay');
                    if (!this.isSpacePressed && panOverlay) {
                        this.isSpacePressed = true;
                        panOverlay.style.display = 'block';
                        panOverlay.style.cursor = CursorUtils.grab();

                        // 패닝 모드 클래스 추가 (CSS로 리사이즈 핸들 비활성화)
                        document.body.classList.add('panning-mode');

                        // 스페이스바 누르면 리사이즈 핸들 비활성화 (패닝 우선)
                        this._disableResizeHandles();

                        // 기존 editor-hover 클래스 모두 제거
                        this._clearAllHoverStates();

                        // 패닝 모드 시작 이벤트
                        this.emit('panning:mode-start');
                    }
                }
            };

            const handleKeyUp = (e) => {
                if (e.code === 'Space') {
                    this.isSpacePressed = false;
                    const panOverlay = document.getElementById('editor-pan-overlay');
                    if (!this.isPanning && panOverlay) {
                        panOverlay.style.display = 'none';
                    }
                    // 패닝 모드 클래스 제거
                    document.body.classList.remove('panning-mode');

                    // 스페이스바 해제 시 리사이즈 핸들 복원
                    this._enableResizeHandles();

                    // 패닝 모드 종료 이벤트
                    this.emit('panning:mode-end');
                }
            };

            iframeDoc.addEventListener('keydown', handleKeyDown);
            iframeDoc.addEventListener('keyup', handleKeyUp);
        } catch (err) {
            // Cross-origin iframe
        }
    }

    /**
     * 특정 iframe에 줌 적용 (wrapper 기준 좌표 사용)
     * @param {HTMLIFrameElement} iframe - 대상 iframe
     * @param {number} pointX - wrapper 기준 X 좌표
     * @param {number} pointY - wrapper 기준 Y 좌표
     * @param {number} oldZoom - 이전 줌 레벨
     */
    _applyZoomToIframe(iframe, pointX, pointY, oldZoom) {
        const wrapper = iframe.parentElement;
        if (!wrapper) return;

        const wrapperRect = wrapper.getBoundingClientRect();
        const frameRect = iframe.getBoundingClientRect();

        const currentTransform = iframe.style.transform;
        let currentTranslateX = 0;
        let currentTranslateY = 0;

        const translateMatch = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (translateMatch) {
            currentTranslateX = parseFloat(translateMatch[1]) || 0;
            currentTranslateY = parseFloat(translateMatch[2]) || 0;
        }

        // iframe의 현재 화면상 위치 (wrapper 기준)
        const frameLeftInWrapper = frameRect.left - wrapperRect.left;
        const frameTopInWrapper = frameRect.top - wrapperRect.top;

        // pointX, pointY를 iframe의 콘텐츠 좌표로 변환
        const contentX = (pointX - frameLeftInWrapper) / oldZoom;
        const contentY = (pointY - frameTopInWrapper) / oldZoom;

        // 새 줌 적용 후 같은 콘텐츠 위치가 같은 화면 위치에 오도록 translate 계산
        const newFrameLeft = pointX - contentX * this.zoomLevel;
        const newFrameTop = pointY - contentY * this.zoomLevel;

        const deltaX = newFrameLeft - frameLeftInWrapper;
        const deltaY = newFrameTop - frameTopInWrapper;

        const newTranslateX = currentTranslateX + deltaX;
        const newTranslateY = currentTranslateY + deltaY;

        iframe.style.transformOrigin = '0 0';
        iframe.style.transform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${this.zoomLevel})`;
    }

    /**
     * 모든 캔버스에 줌 적용 (멀티뷰 모드)
     */
    applyZoomToAllCanvases(pointX, pointY, oldZoom) {
        // 메인 캔버스에 줌 적용
        this.applyZoomAtPoint(pointX, pointY, oldZoom);

        // 멀티뷰 모드일 때 보조 캔버스들에도 개별적으로 줌 적용
        if (this.multiCanvasManager?.isEnabled()) {
            const iframes = this.multiCanvasManager.getIframes();
            if (!iframes || iframes.length === 0) return;

            iframes.forEach((iframe) => {
                if (iframe === this.previewFrame) return; // 메인 캔버스는 건너뜀

                // 각 캔버스의 wrapper 기준 중앙 좌표 계산
                const wrapper = iframe.parentElement;
                if (!wrapper) return;

                const wrapperRect = wrapper.getBoundingClientRect();
                const centerX = wrapperRect.width / 2;
                const centerY = wrapperRect.height / 2;

                // 개별 캔버스에 줌 적용
                this._applyZoomToIframe(iframe, centerX, centerY, oldZoom);
            });
        }
    }

    /**
     * 모든 캔버스에 패닝 적용 (멀티뷰 모드)
     */
    _handleWheelPanAllCanvases(e) {
        e.preventDefault();

        // 저장된 panOffset에서 현재 위치 읽기 (regex 파싱 대신 안정적인 JS 프로퍼티 사용)
        const newTranslateX = (this.panOffsetX || 0) - e.deltaX;
        const newTranslateY = (this.panOffsetY || 0) - e.deltaY;

        // 범위 제한 없이 자유롭게 패닝
        this.panOffsetX = newTranslateX;
        this.panOffsetY = newTranslateY;

        const newTransform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${this.zoomLevel})`;

        this.previewFrame.style.transformOrigin = '0 0';
        this.previewFrame.style.transform = newTransform;

        // 멀티뷰 모드일 때 보조 캔버스들에도 동일한 transform 적용
        if (this.multiCanvasManager?.isEnabled()) {
            const iframes = this.multiCanvasManager.getIframes();
            if (iframes && iframes.length > 0) {
                iframes.forEach((iframe) => {
                    if (iframe === this.previewFrame) return;
                    iframe.style.transformOrigin = '0 0';
                    iframe.style.transform = newTransform;
                });
            }
        }

        this.updateResizeHandles();
    }

    /**
     * 스페이스바 패닝 중 리사이즈 핸들 비활성화
     */
    _disableResizeHandles() {
        // preview-resize-handle 숨김
        if (this.resizeHandleLeft) {
            this.resizeHandleLeft.style.display = 'none';
        }
        if (this.resizeHandleRight) {
            this.resizeHandleRight.style.display = 'none';
        }
        if (this.resizeHandleBottom) {
            this.resizeHandleBottom.style.display = 'none';
        }
        // 멀티캔버스 리사이즈 핸들도 숨김
        document.querySelectorAll('.multicanvas-resize-handle').forEach(handle => {
            handle.style.display = 'none';
        });
    }

    /**
     * 스페이스바 해제 시 리사이즈 핸들 복원
     */
    _enableResizeHandles() {
        // preview-resize-handle 복원
        if (this.resizeHandleLeft && !this.resizeHandleLeft.classList.contains('hidden')) {
            this.resizeHandleLeft.style.display = '';
        }
        if (this.resizeHandleRight && !this.resizeHandleRight.classList.contains('hidden')) {
            this.resizeHandleRight.style.display = '';
        }
        if (this.resizeHandleBottom && !this.resizeHandleBottom.classList.contains('hidden')) {
            this.resizeHandleBottom.style.display = '';
        }
        // 멀티캔버스 리사이즈 핸들 복원
        document.querySelectorAll('.multicanvas-resize-handle').forEach(handle => {
            handle.style.display = '';
        });
    }

    /**
     * 모든 iframe에서 editor-hover 클래스 제거
     * 스페이스바 패닝 시작 시 호출
     */
    _clearAllHoverStates() {
        try {
            // 메인 iframe의 editor-hover 제거
            const mainDoc = this.previewFrame?.contentDocument;
            if (mainDoc) {
                mainDoc.querySelectorAll('.editor-hover').forEach(el => {
                    el.classList.remove('editor-hover');
                });
            }

            // 멀티캔버스 모드일 때 보조 iframe들의 editor-hover도 제거
            if (this.multiCanvasManager?.isEnabled()) {
                const iframes = this.multiCanvasManager.iframes;
                if (iframes) {
                    iframes.forEach((iframe) => {
                        if (iframe === this.previewFrame) return;
                        try {
                            const doc = iframe?.contentDocument;
                            if (doc) {
                                doc.querySelectorAll('.editor-hover').forEach(el => {
                                    el.classList.remove('editor-hover');
                                });
                            }
                        } catch (err) {
                            // Cross-origin iframe
                        }
                    });
                }
            }
        } catch (err) {
            // Cross-origin iframe
        }
    }

    /**
     * 모든 iframe에 스페이스바 상태 브로드캐스트
     * 멀티캔버스 모드에서 모든 iframe이 동일한 스페이스바 상태를 유지하도록 함
     */
    _broadcastSpaceState(isPressed) {
        // 메인 iframe
        try {
            this.previewFrame?.contentWindow?.postMessage(
                { type: 'editor-space-state', isPressed }, '*'
            );
        } catch (e) {}

        // 멀티캔버스 iframe들
        if (this.multiCanvasManager?.isEnabled()) {
            const iframes = this.multiCanvasManager.iframes;
            if (iframes) {
                iframes.forEach((iframe) => {
                    try {
                        iframe?.contentWindow?.postMessage(
                            { type: 'editor-space-state', isPressed }, '*'
                        );
                    } catch (e) {}
                });
            }
        }
    }

    /**
     * iframe의 html/body에 panning-mode 클래스 추가/제거
     * body 영역 밖의 html 영역에서도 커서가 적용되도록 함
     */
    _setIframePanningMode(enable) {
        // 메인 iframe
        try {
            const doc = this.previewFrame?.contentDocument;
            if (doc) {
                if (enable) {
                    doc.documentElement.classList.add('panning-mode');
                    doc.body?.classList.add('panning-mode');
                } else {
                    doc.documentElement.classList.remove('panning-mode');
                    doc.body?.classList.remove('panning-mode');
                }
            }
        } catch (e) {}

        // 멀티캔버스 iframe들
        if (this.multiCanvasManager?.isEnabled()) {
            const iframes = this.multiCanvasManager.iframes;
            if (iframes) {
                iframes.forEach((iframe) => {
                    try {
                        const doc = iframe?.contentDocument;
                        if (doc) {
                            if (enable) {
                                doc.documentElement.classList.add('panning-mode');
                                doc.body?.classList.add('panning-mode');
                            } else {
                                doc.documentElement.classList.remove('panning-mode');
                                doc.body?.classList.remove('panning-mode');
                            }
                        }
                    } catch (e) {}
                });
            }
        }
    }

    /**
     * iframe의 html/body에 panning-grabbing 클래스 추가/제거
     * 드래그 중 grabbing 커서 표시
     */
    _setIframePanningGrabbing(enable) {
        // 메인 iframe
        try {
            const doc = this.previewFrame?.contentDocument;
            if (doc) {
                if (enable) {
                    doc.documentElement.classList.add('panning-grabbing');
                    doc.body?.classList.add('panning-grabbing');
                } else {
                    doc.documentElement.classList.remove('panning-grabbing');
                    doc.body?.classList.remove('panning-grabbing');
                }
            }
        } catch (e) {}

        // 멀티캔버스 iframe들
        if (this.multiCanvasManager?.isEnabled()) {
            const iframes = this.multiCanvasManager.iframes;
            if (iframes) {
                iframes.forEach((iframe) => {
                    try {
                        const doc = iframe?.contentDocument;
                        if (doc) {
                            if (enable) {
                                doc.documentElement.classList.add('panning-grabbing');
                                doc.body?.classList.add('panning-grabbing');
                            } else {
                                doc.documentElement.classList.remove('panning-grabbing');
                                doc.body?.classList.remove('panning-grabbing');
                            }
                        }
                    } catch (e) {}
                });
            }
        }
    }

    /**
     * Attach pan-related handlers to iframe document
     */
    _attachIframePanHandlers() {
        try {
            const iframeDoc = this.previewFrame?.contentDocument;
            if (!iframeDoc) return;

            const handleKeyDown = (e) => {
                if (e.code === 'Space') {
                    // ★ 멀티캔버스 모드에서는 MultiCanvasManager가 패닝 담당
                    if (this.multiCanvasManager?._isInitialized) {
                        return;
                    }

                    // TextEditingManager 플래그 직접 확인
                    if (this.textEditingManager?.isCurrentlyEditing()) {
                        return;
                    }

                    const iframeActiveEl = iframeDoc.activeElement;

                    // Check if we're in a text input context (fallback)
                    const isInTextInput =
                        iframeActiveEl && (iframeActiveEl.isContentEditable ||
                                            iframeActiveEl.classList?.contains('editor-editable') ||
                                            iframeActiveEl.classList?.contains('quick-text-edit'));

                    if (isInTextInput) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    const panOverlay = document.getElementById('editor-pan-overlay');
                    if (!this.isSpacePressed && panOverlay) {
                        this.isSpacePressed = true;
                        panOverlay.style.display = 'block';
                        panOverlay.style.cursor = CursorUtils.grab();

                        // 패닝 모드 클래스 추가 (CSS로 리사이즈 핸들 비활성화)
                        document.body.classList.add('panning-mode');

                        // 스페이스바 누르면 리사이즈 핸들 비활성화 (패닝 우선)
                        this._disableResizeHandles();

                        // 기존 editor-hover 클래스 모두 제거
                        this._clearAllHoverStates();

                        // 패닝 모드 시작 이벤트
                        this.emit('panning:mode-start');

                        // 모든 iframe에 스페이스바 상태 브로드캐스트
                        this._broadcastSpaceState(true);
                    }
                }
            };

            const handleKeyUp = (e) => {
                if (e.code === 'Space') {
                    this.isSpacePressed = false;
                    const panOverlay = document.getElementById('editor-pan-overlay');
                    if (!this.isPanning && panOverlay) {
                        panOverlay.style.display = 'none';
                    }
                    // 패닝 모드 클래스 제거
                    document.body.classList.remove('panning-mode');

                    // 스페이스바 해제 시 리사이즈 핸들 복원
                    this._enableResizeHandles();

                    // 패닝 모드 종료 이벤트
                    this.emit('panning:mode-end');

                    // 모든 iframe에 스페이스바 상태 브로드캐스트
                    this._broadcastSpaceState(false);
                }
            };

            // Remove existing handlers if any
            if (this._iframePanKeyDownHandler) {
                iframeDoc.removeEventListener('keydown', this._iframePanKeyDownHandler);
            }
            if (this._iframePanKeyUpHandler) {
                iframeDoc.removeEventListener('keyup', this._iframePanKeyUpHandler);
            }

            this._iframePanKeyDownHandler = handleKeyDown;
            this._iframePanKeyUpHandler = handleKeyUp;

            iframeDoc.addEventListener('keydown', handleKeyDown);
            iframeDoc.addEventListener('keyup', handleKeyUp);
        } catch (e) {
            // Cross-origin iframe
        }
    }
}

export default ZoomManager;
