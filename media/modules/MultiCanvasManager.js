import EventEmitter from './EventEmitter.js';
import CursorUtils from './CursorUtils.js';

class MultiCanvasManager extends EventEmitter {
    constructor(mainIframeId) {
        super();
        this.mainIframe = document.getElementById(mainIframeId);
        this.iframes = [];
        this.isMultiViewEnabled = false;
        this.container = null;
        this.viewModeManager = null;
        this.previewManager = null;
        this.zoomManager = null;
        this._isInitialized = false; // iframe들이 생성되었는지 여부
        this.isPanningMode = false; // 패닝 모드 상태
        this.textEditingManager = null; // 텍스트 편집 상태 확인용

        // 성능 기반 플레이스홀더 사용 여부
        this._usePlaceholders = this._detectLowPerformance();
    }

    /**
     * 저사양 PC 감지
     * CPU 코어 4개 이하 또는 메모리 4GB 이하면 저사양으로 판단
     * @returns {boolean}
     */
    _detectLowPerformance() {
        const cores = navigator.hardwareConcurrency || 4;
        const memory = navigator.deviceMemory || 4; // GB (Chrome only)

        // 저사양 기준: 코어 4개 이하 또는 메모리 4GB 이하
        const isLowSpec = cores <= 4 || memory <= 4;

        console.log(`[MultiCanvasManager] Performance detection: ${cores} cores, ${memory}GB RAM → ${isLowSpec ? 'Low' : 'High'} performance mode`);

        return isLowSpec;
    }

    /**
     * 플레이스홀더 사용 여부 설정 (수동 오버라이드)
     * @param {boolean} use
     */
    setUsePlaceholders(use) {
        this._usePlaceholders = use;
    }

    /**
     * 특정 너비의 뷰가 체크(활성화)되어 있는지 확인
     * @param {number} width - iframe 너비
     * @returns {boolean}
     */
    _isViewChecked(width) {
        const viewModes = document.getElementById('viewModes');
        if (!viewModes) return true; // 뷰모드 패널이 없으면 기본 true
        const checkbox = viewModes.querySelector(`.view-checkbox[data-width="${width}"]`);
        return checkbox ? checkbox.checked : true;
    }

    /**
     * TextEditingManager 참조 설정 (텍스트 편집 중 스페이스바 패닝 방지)
     */
    setTextEditingManager(textEditingManager) {
        this.textEditingManager = textEditingManager;
    }

    setViewModeManager(vm) {
        this.viewModeManager = vm;
        // 뷰모드 변경 시 리사이즈 핸들 위치 업데이트
        vm.on('view:changed', ({ flash }) => {
            this._updateResizeHandles();
            this._updateActiveIframeHighlight();

            // 뷰모드 변경 시 활성 iframe 동기화 (AI 서비스 등에서 올바른 iframe 사용)
            const activeIdx = this.getActiveIndex();
            const activeIframe = this.iframes[activeIdx];
            if (activeIframe && this.previewManager) {
                this.previewManager.setActiveIframe(activeIframe);
            }

            // 멀티뷰 OFF 상태에서는 선택된 iframe만 보이도록 전환
            if (!this.isMultiViewEnabled && this._isInitialized) {
                const activeIdx = this.getActiveIndex();
                this.iframes.forEach((iframe, i) => {
                    iframe.style.display = i === activeIdx ? '' : 'none';
                });
            }

            // viewmode 버튼 포커스 제거 (Ctrl+0 등 키보드 단축키가 작동하도록)
            if (document.activeElement instanceof HTMLButtonElement) {
                document.activeElement.blur();
            }

            // 버튼 클릭 시 flash 효과
            if (flash && this.isMultiViewEnabled) {
                this._flashResizeHandles();
            }
        });

        // 새 breakpoint 추가 시 iframe도 추가
        vm.on('breakpoint:added', ({ width }) => {
            if (this.isMultiViewEnabled && this._isInitialized) {
                this._addIframeForBreakpoint(width);
            }
        });

        // breakpoint 삭제 시 iframe도 삭제
        vm.on('breakpoint:removed', ({ width }) => {
            if (this.isMultiViewEnabled && this._isInitialized) {
                this._removeIframeForBreakpoint(width);
            }
        });
    }
    setPreviewManager(pm) { this.previewManager = pm; }
    setZoomManager(zm) { this.zoomManager = zm; }
    setPanningMode(isPanning) { this.isPanningMode = isPanning; }

    init() {
        this._setupToggleButton();
    }

    // 해상도별 높이 범위 계산 (일반적인 디바이스 비율 기준)
    getHeightRange(width) {
        if (width >= 1200) {
            // PC: body 높이 기준 (100%)
            const bodyHeight = document.body.clientHeight;
            return { min: bodyHeight, max: bodyHeight };
        } else if (width >= 768) {
            // 태블릿: 4:3 ~ 3:4 비율 (iPad 등)
            // 세로모드 기준 3:4 = 0.75, 가로모드 4:3 = 1.33
            return { min: Math.round(width * 0.75), max: Math.round(width * 1.4) };
        } else {
            // 모바일: 16:9 ~ 21:9 비율 (일반 스마트폰)
            // 세로모드 기준 9:16 = 1.78, 9:21 = 2.33
            return { min: Math.round(width * 1.5), max: Math.round(width * 2.2) };
        }
    }

    // 콘텐츠 높이 계산 (100vh 요소 제한 적용 후, 스크롤 없이 전체 표시)
    calculateHeight(iframe, width) {
        const range = this.getHeightRange(width);
        try {
            const doc = iframe.contentDocument;
            if (!doc) return range.min;

            // overflow:hidden 상태에서 scrollHeight가 부정확할 수 있으므로
            // 일시적으로 overflow를 해제하고 측정
            const html = doc.documentElement;
            const body = doc.body;
            const origHtmlOverflow = html.style.overflow;
            const origBodyOverflow = body ? body.style.overflow : '';
            html.style.overflow = 'visible';
            if (body) body.style.overflow = 'visible';

            // scrollHeight 측정
            let contentHeight = Math.max(
                body?.scrollHeight || 0,
                html.scrollHeight || 0
            );

            // absolute 자식들의 bottom 좌표 포함 (CSS class 기반 포함)
            if (body) {
                const win = iframe.contentWindow;
                const iframeRect = html.getBoundingClientRect();
                // body 직속 자식 + relative 컨테이너의 자식까지 체크
                const candidates = Array.from(body.querySelectorAll('body > *, body > * > *'));
                for (let i = 0; i < candidates.length; i++) {
                    const el = candidates[i];
                    try {
                        if (win.getComputedStyle(el).position === 'absolute') {
                            const rect = el.getBoundingClientRect();
                            const bottom = rect.bottom - iframeRect.top;
                            if (bottom > contentHeight) contentHeight = Math.ceil(bottom);
                        }
                    } catch(e) {}
                }
            }

            // overflow 복원
            html.style.overflow = origHtmlOverflow;
            if (body) body.style.overflow = origBodyOverflow;

            return Math.max(range.min, contentHeight);
        } catch(e) {
            return range.min;
        }
    }

    // iframe 내부 스크롤바 숨김
    _hideIframeScrollbar(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;

            // 원본 overflow 값 저장 후 hidden 적용 (저장 시 복원용)
            if (!doc.documentElement.hasAttribute('data-editor-overflow-hidden')) {
                doc.documentElement.setAttribute('data-editor-overflow-hidden', '');
                doc.documentElement.setAttribute('data-editor-orig-overflow', doc.documentElement.style.overflow || '');
            }
            if (doc.body && !doc.body.hasAttribute('data-editor-overflow-hidden')) {
                doc.body.setAttribute('data-editor-overflow-hidden', '');
                doc.body.setAttribute('data-editor-orig-overflow', doc.body.style.overflow || '');
            }

            doc.documentElement.style.overflow = 'hidden';
            if (doc.body) doc.body.style.overflow = 'hidden';

            // 스크롤바 숨김 스타일 주입 (editor- ID로 저장 시 자동 제거)
            if (!doc.getElementById('editor-scrollbar-hide')) {
                const style = doc.createElement('style');
                style.id = 'editor-scrollbar-hide';
                style.textContent = `
                    html, body { overflow: hidden !important; }
                    ::-webkit-scrollbar { display: none !important; }
                    * { scrollbar-width: none !important; }
                `;
                doc.head.appendChild(style);
            }
        } catch(e) {}
    }

    /**
     * iframe에서 스크롤 트리거 (lazy loading 콘텐츠 렌더링 유도)
     * 높이 계산 전에 호출하여 IntersectionObserver 등이 작동하도록 함
     * @param {HTMLIFrameElement} iframe
     * @param {Function} callback - 스크롤 완료 후 호출될 콜백
     */
    _triggerScrollForLazyLoad(iframe, callback) {
        try {
            const iframeDoc = iframe.contentDocument;
            const iframeWin = iframe.contentWindow;
            if (!iframeDoc || !iframeWin) {
                callback?.();
                return;
            }

            // 페이지 전체 높이
            const fullHeight = Math.max(
                iframeDoc.body.scrollHeight,
                iframeDoc.documentElement.scrollHeight
            );

            // 하단으로 스크롤 트리거
            iframeWin.scrollTo(0, fullHeight);

            // 50ms 후 상단으로 복귀, 100ms 후 콜백 실행
            setTimeout(() => {
                iframeWin.scrollTo(0, 0);
                setTimeout(() => {
                    callback?.();
                }, 50);
            }, 50);
        } catch (e) {
            callback?.();
        }
    }

    /**
     * 에디터 UI 요소인지 체크
     */
    _isEditorUI(target) {
        if (!target || !target.closest) return false;
        return target.closest('#editor-overlay') ||
            target.closest('#editor-margin-overlay') ||
            target.closest('#editor-padding-overlay') ||
            target.closest('.editor-context-menu') ||
            target.classList?.contains('editor-context-menu-item') ||
            target.classList?.contains('editor-spacing-handle') ||
            target.classList?.contains('editor-resize-handle') ||
            target.classList?.contains('editor-move-handle') ||
            target.classList?.contains('editor-rotate-handle') ||
            target.classList?.contains('editor-gap-area') ||
            target.classList?.contains('editor-border-drag-zone') ||
            target.classList?.contains('editor-drag-clone');
    }

    /**
     * iframe에 편집 이벤트 리스너 연결 (멀티뷰 편집 지원)
     */
    _attachEditListeners(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;

            // mousedown: 요소 선택 + 드래그 threshold 감지 (first-click-drag 지원)
            const DRAG_THRESHOLD = 4;
            doc.addEventListener('mousedown', (e) => {
                if (this.isPanningMode || this._isSpaceDown || this.zoomManager?.isSpacePressed) return;
                if (this._isEditorUI(e.target)) return;
                if (e.button !== 0) return; // left button only

                e.preventDefault();
                e.stopPropagation();

                // ★ preventDefault()가 포커스 전이를 차단하므로 수동으로 iframe 포커스 설정
                // (키보드 단축키가 iframe document의 keydown 핸들러에 도달하려면 필수)
                try { iframe.contentWindow.focus(); } catch (_) {}

                this._selectIframe(parseInt(iframe.dataset.index));

                const target = e.target;
                const startX = e.clientX;
                const startY = e.clientY;
                let dragStarted = false;

                const clickInfo = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    offsetX: e.offsetX,
                    offsetY: e.offsetY,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    iframe: iframe
                };

                // 즉시 선택 (드래그 여부와 관계없이)
                this.emit('element:click', target, clickInfo);

                const onMouseMove = (moveE) => {
                    if (dragStarted) return;
                    const dx = moveE.clientX - startX;
                    const dy = moveE.clientY - startY;
                    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
                        dragStarted = true;
                        // 드래그 시작: non-static → left/top move, static → DOM drag
                        this.emit('element:dragstart', target, {
                            event: e, // original mousedown event for startMove/startDrag
                            iframe: iframe
                        });
                        cleanup();
                    }
                };

                const onMouseUp = () => {
                    cleanup();
                    // mouseup without drag = pure click (selection already done above)
                };

                const cleanup = () => {
                    doc.removeEventListener('mousemove', onMouseMove, true);
                    doc.removeEventListener('mouseup', onMouseUp, true);
                };

                doc.addEventListener('mousemove', onMouseMove, true);
                doc.addEventListener('mouseup', onMouseUp, true);
            }, true);

            // 더블클릭 이벤트 - 텍스트 편집
            doc.addEventListener('dblclick', (e) => {
                if (this.isPanningMode || this._isSpaceDown || this.zoomManager?.isSpacePressed) return;
                if (this._isEditorUI(e.target)) return;
                e.preventDefault();
                e.stopPropagation();
                this.emit('element:dblclick', e.target, {
                    iframe,
                    clientX: e.clientX,
                    clientY: e.clientY
                });
            }, true);

            // 우클릭 컨텍스트 메뉴
            doc.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.emit('element:contextmenu', { element: e.target, event: e, iframe });
            }, true);

            // hover 이벤트 - 요소 하이라이트
            doc.addEventListener('mouseover', (e) => {
                if (this.isPanningMode || this._isSpaceDown || this.zoomManager?.isSpacePressed) return;
                if (this._isEditorUI(e.target)) return;
                if (e.target !== doc.body && e.target !== doc.documentElement) {
                    e.target.classList.add('editor-hover');
                    this.emit('element:hover', e.target);
                }
            }, true);

            doc.addEventListener('mouseout', (e) => {
                if (this._isEditorUI(e.target)) return;
                e.target.classList.remove('editor-hover');
                this.emit('element:unhover', e.target);
            }, true);
        } catch(e) {
            console.error('[MultiCanvasManager] Failed to attach edit listeners:', e);
        }
    }

    // 100vh 요소 높이 제한 (해상도별 min/max 적용)
    limitViewportHeightElements(iframe, width) {
        try {
            const doc = iframe.contentDocument;
            const win = iframe.contentWindow;
            if (!doc || !win) return;

            const range = this.getHeightRange(width);
            const viewportHeight = range.min;

            // 이전에 제한했던 요소들의 inline override를 먼저 초기화 (재평가를 위해)
            const previouslyLimited = doc.body.querySelectorAll('[data-editor-height-limited]');
            previouslyLimited.forEach(el => {
                const origH = el.dataset.editorOriginalHeight;
                const origMinH = el.dataset.editorOriginalMinHeight;
                const origMaxH = el.dataset.editorOriginalMaxHeight;
                if (origH !== undefined) el.style.height = origH;
                else el.style.removeProperty('height');
                if (origMinH !== undefined) el.style.minHeight = origMinH;
                else el.style.removeProperty('min-height');
                if (origMaxH !== undefined) el.style.maxHeight = origMaxH;
                else el.style.removeProperty('max-height');
                delete el.dataset.editorHeightLimited;
                delete el.dataset.editorOriginalHeight;
                delete el.dataset.editorOriginalMinHeight;
                delete el.dataset.editorOriginalMaxHeight;
            });

            // 100vh를 사용할 수 있는 블록 레벨 요소 체크 (AI 생성 페이지 대응)
            const sectionTags = ['section', 'article', 'div', 'main', 'header', 'nav', 'aside'];
            const selector = sectionTags.join(', ');
            const sectionElements = doc.body.querySelectorAll(selector);

            sectionElements.forEach(el => {
                // footer 내부 요소는 제외
                if (el.closest('footer')) return;
                // ★ 사용자가 스타일 패널에서 직접 height를 수정한 요소는 스킵
                if (el.dataset.editorNoHeightLimit) return;

                const computed = win.getComputedStyle(el);
                const height = parseFloat(computed.height);
                const minHeight = parseFloat(computed.minHeight);

                // position:relative 컨테이너에 absolute 자식이 있으면 제외
                // (Figma import 등 absolute 레이아웃 — 높이 제한하면 콘텐츠 잘림)
                if (computed.position === 'relative') {
                    const hasAbsChild = Array.from(el.children).some(child => {
                        return win.getComputedStyle(child).position === 'absolute';
                    });
                    if (hasAbsChild) return;
                }

                // viewport height의 99% 이상인 경우 (100vh 사용 요소)
                const threshold = viewportHeight * 0.99;

                if (height >= threshold || minHeight >= threshold) {
                    el.dataset.editorOriginalHeight = el.style.height || '';
                    el.dataset.editorOriginalMinHeight = el.style.minHeight || '';
                    el.dataset.editorOriginalMaxHeight = el.style.maxHeight || '';

                    el.style.setProperty('height', 'auto', 'important');
                    el.style.setProperty('min-height', `${viewportHeight}px`, 'important');
                    el.style.removeProperty('max-height');
                    el.dataset.editorHeightLimited = 'true';
                }
            });
        } catch(e) {
            console.error('limitViewportHeightElements error:', e);
        }
    }

    autoEnable() {
        if (!this.isMultiViewEnabled) this.enableMultiView();
    }

    enableMultiView() {
        if (this.isMultiViewEnabled || !this.viewModeManager) return;
        this.isMultiViewEnabled = true;

        const panel = document.querySelector('.preview-panel');
        if (!panel) return;

        // 이미 초기화되었으면 숨겨진 iframe들만 다시 보이게
        if (this._isInitialized && this.container) {
            // ★ container 복원 및 preview-wrapper 숨기기
            this.container.style.display = '';
            const existingWrapper = document.querySelector('.preview-wrapper');
            if (existingWrapper) existingWrapper.style.display = 'none';

            // 모든 iframe display 복원
            this.iframes.forEach(iframe => {
                iframe.style.display = '';
            });
            // ★ mainIframe 참조 보장
            if (this.iframes[0] && this.mainIframe !== this.iframes[0]) {
                this._originalMainIframe = this.mainIframe;
                this.mainIframe = this.iframes[0];
            }

            // ★ 재활성화 시 mainIframe(원본 previewFrame) 기준으로 모든 iframe DOM 재합치
            // OFF 상태에서 수정된 HTML이 숨겨진 iframe에 반영되지 않았을 수 있음
            this._reconcileAllIframes();
            // ★ OFF 상태에서 변경된 CSS도 동기화 (_reconcileAllIframes는 HTML만 처리)
            this.syncCSSToAllCanvases(true);

            this._updateToggleButtonState();
            this._updateResizeHandles();
            this.emit('multiview:enabled');
            return;
        }

        // 처음 초기화
        // ★ 원본 iframe의 zaemit-temp-styles CSSOM 규칙 추출
        // (srcdoc 생성 시 outerHTML은 CSSOM으로 추가된 규칙을 직렬화하지 않음)
        const originalTempCSS = this._extractTempStylesCSS();

        const html = this.previewManager?.getHTML();

        // 컨테이너 생성
        this.container = document.createElement('div');
        this.container.className = 'multi-canvas-container';

        // iframe들 생성 (absolute 배치용 left 계산)
        const buttons = this.viewModeManager.getViewModeButtons();
        const gap = 120;
        let currentLeft = 0;

        buttons.forEach((btn, index) => {
            const width = btn.dataset.width;
            const iframe = document.createElement('iframe');
            // PC(100%): 사용자 설정 너비 > 패널 너비(최소 1680) 순으로 적용
            const iframeWidth = width === '100%'
                ? (this.viewModeManager?.customPcWidth || Math.max(panel.clientWidth, 1680))
                : parseInt(width);
            iframe.style.width = iframeWidth + 'px';
            iframe.style.left = currentLeft + 'px';
            iframe.dataset.index = index;
            iframe.dataset.breakpointWidth = width; // ★ 보조 식별자 (삭제 시 정확한 매칭용)
            // 다음 iframe의 left 위치 계산
            currentLeft += iframeWidth + gap;
            // 기본 높이는 해상도별 범위의 최소값
            const range = this.getHeightRange(iframeWidth);
            iframe.style.height = range.min + 'px';
            iframe.style.background = 'transparent';

            // PC 제외한 iframe은 높이 계산 완료 전까지 숨김
            if (iframeWidth < 1200) {
                iframe.style.opacity = '0';
            }

            if (html) {
                this._loadIframeContent(iframe, html);
                iframe.onload = () => {
                    const w = parseInt(iframe.style.width);
                    try {
                        this.previewManager?.injectStylesTo(iframe.contentDocument);
                        // ★ 원본 iframe의 zaemit-temp-styles CSSOM 규칙 주입
                        if (originalTempCSS) {
                            this._injectTempStyles(iframe.contentDocument, originalTempCSS);
                        }
                        // 100vh 요소에 해상도별 min/max 높이 적용
                        this.limitViewportHeightElements(iframe, w);
                        // iframe 내부 스크롤바 완전히 숨김
                        this._hideIframeScrollbar(iframe);
                        // iframe 내부에서도 줌/휠패닝 작동하도록
                        iframe.contentDocument.addEventListener('wheel', e => {
                            e.preventDefault();
                            if (e.ctrlKey) {
                                const z = this.zoomManager?.zoomLevel || 1;
                                const frameRect = iframe.getBoundingClientRect();
                                const screenX = frameRect.left + e.clientX * z;
                                const screenY = frameRect.top + e.clientY * z;
                                this.zoom(e.deltaY, screenX, screenY);
                            } else {
                                this.pan(e.deltaY, e.deltaX);
                            }
                        }, { passive: false });
                        // 스페이스바+드래그 패닝
                        this._attachIframePanHandlers(iframe);
                        this._attachIframeTouchHandlers(iframe);
                        // 편집 이벤트 리스너 연결 (클릭, 더블클릭, 컨텍스트메뉴, hover)
                        this._attachEditListeners(iframe);
                    } catch(e) {}

                    // 첫 번째 iframe(PC 뷰) 로드 완료 시 이벤트 발생
                    if (index === 0) {
                        this.emit('multiview:mainIframeLoaded', iframe);
                    }

                    // 높이 계산 함수 (100vh 제한 후 높이 계산)
                    const calcAndSetHeight = () => {
                        this.limitViewportHeightElements(iframe, w);
                        const h = this.calculateHeight(iframe, w);
                        iframe.style.height = h + 'px';
                        this._updateResizeHandles();
                    };

                    // 스크롤 트리거 (lazy loading 유도) 후 높이 계산
                    this._triggerScrollForLazyLoad(iframe, () => {
                        // PC(1200px 이상)는 바로 처리
                        if (w >= 1200) {
                            calcAndSetHeight();
                        } else {
                            // 로딩 오버레이 표시 (PC 제외)
                            const loader = this._createIframeLoader(iframe);
                            calcAndSetHeight();
                            // ★ rAF 2회 + setTimeout fallback으로 렌더링 완료 보장
                            let revealed = false;
                            const revealIframe = () => {
                                if (revealed) return;
                                revealed = true;
                                calcAndSetHeight();
                                loader.remove();
                                iframe.style.opacity = '';
                            };
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    revealIframe();
                                });
                            });
                            setTimeout(revealIframe, 500);
                        }
                    });
                };
            }

            this.container.appendChild(iframe);
            this.iframes.push(iframe);
        });

        document.querySelector('.preview-wrapper').style.display = 'none';
        panel.classList.add('multi-view-active');
        panel.appendChild(this.container);

        this._isInitialized = true;

        // ★ 멀티뷰 모드에서 mainIframe을 첫 번째 iframe(PC 뷰)으로 업데이트
        // syncElementStyleFromElement 등에서 mainIframe 참조가 올바르게 동작하도록
        if (this.iframes[0]) {
            this._originalMainIframe = this.mainIframe;  // 원본 저장
            this.mainIframe = this.iframes[0];
            console.log('[MultiCanvasManager] mainIframe updated to iframes[0]');
        }

        this._updateToggleButtonState();
        this._setupGlobalHandlers(panel);

        // 기본 줌 50%로 시작 (처음 초기화 시에만)
        if (this.zoomManager && this.panX === undefined) {
            this.zoomManager.zoomLevel = 0.5;
            this.panX = 0;
            this.panY = 0;
        }
        this.applyTransform();

        // 리사이즈 핸들 생성
        this._createResizeHandles();
        this._updateResizeHandles();

        // 활성 iframe을 previewManager에 설정 (AI 서비스 등이 올바른 iframe 사용)
        const activeIdx = this.getActiveIndex();
        if (this.iframes[activeIdx] && this.previewManager) {
            this.previewManager.setActiveIframe(this.iframes[activeIdx]);
        }

        // 활성 iframe 테두리 표시
        this._updateActiveIframeHighlight();

        this.emit('multiview:enabled');
    }

    _setupGlobalHandlers(panel) {
        // 이미 핸들러가 있으면 건너뜀
        if (this._globalWheelHandler) return;

        // 전역 휠 이벤트 - Ctrl+휠은 멀티뷰 활성 시에만 줌
        this._globalWheelHandler = e => {
            // Ctrl+휠: 멀티뷰 활성 상태에서만 MCM 줌 처리
            // 멀티뷰 비활성 시 ZoomManager가 처리하도록 패스
            if (e.ctrlKey || e.metaKey) {
                if (!this.isMultiViewEnabled) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.zoom(e.deltaY, e.clientX, e.clientY);
                return;
            }

            // 일반 휠 패닝은 멀티뷰 모드에서만
            if (!this.isMultiViewEnabled) return;

            // 일반 휠: preview-panel 영역 내에서만 패닝
            const panel = document.querySelector('.preview-panel');
            if (!panel?.contains(e.target) && e.target !== panel) return;

            e.preventDefault();
            this.pan(e.deltaY, e.deltaX);
        };
        // window 레벨에서 capture 단계로 최우선 처리하여 브라우저 기본 동작 완전 차단
        window.addEventListener('wheel', this._globalWheelHandler, { passive: false, capture: true });

        // 터치스크린 (아이패드 등)
        // - 한 손가락 드래그: 패닝 (스크롤)
        // - 두 손가락 핀치: 줌 (거리 변화만, 패닝 없음)
        let lastTouchX = 0;
        let lastTouchY = 0;
        let lastTouchDist = 0;
        let touchMode = null; // 'pan' | 'pinch'

        this._globalTouchStartHandler = e => {
            const panel = document.querySelector('.preview-panel');
            if (!panel?.contains(e.target) && e.target !== panel) return;

            if (e.touches.length === 1) {
                e.preventDefault();
                touchMode = 'pan';
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                e.preventDefault();
                touchMode = 'pinch';
                this._isTouchPinching = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDist = Math.sqrt(dx * dx + dy * dy);
            }
        };

        this._globalTouchMoveHandler = e => {
            if (touchMode === 'pan' && e.touches.length === 1) {
                e.preventDefault();
                const deltaX = e.touches[0].clientX - lastTouchX;
                const deltaY = e.touches[0].clientY - lastTouchY;
                this.pan(-deltaY, -deltaX);
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            } else if (touchMode === 'pinch' && e.touches.length === 2 && lastTouchDist > 0) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const newDist = Math.sqrt(dx * dx + dy * dy);
                const scale = newDist / lastTouchDist;

                if (Math.abs(scale - 1) > 0.005) {
                    // zoom() 우회 - 누적/threshold 없이 직접 적용 (벌벌거림 방지)
                    const oldZoom = this.zoomManager?.zoomLevel || 1;
                    const minZoom = MultiCanvasManager.ZOOM_LEVELS[0];
                    const maxZoom = MultiCanvasManager.ZOOM_LEVELS[MultiCanvasManager.ZOOM_LEVELS.length - 1];
                    const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * scale));

                    if (Math.abs(oldZoom - newZoom) > 0.001) {
                        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                        const panel = document.querySelector('.preview-panel');
                        if (panel) {
                            const panelRect = panel.getBoundingClientRect();
                            const mouseX = centerX - panelRect.left;
                            const mouseY = centerY - panelRect.top;
                            const panX = this.panX || 0;
                            const panY = this.panY || 0;
                            const contentX = (mouseX - panX) / oldZoom;
                            const contentY = (mouseY - panY) / oldZoom;
                            this.panX = mouseX - contentX * newZoom;
                            this.panY = mouseY - contentY * newZoom;
                        }

                        this.zoomManager.zoomLevel = newZoom;
                        // 핀치 중에는 transform만 적용, 플레이스홀더 복원 타이머 없음
                        this.applyTransform();
                    }
                    lastTouchDist = newDist;
                }
            }
        };

        this._globalTouchEndHandler = e => {
            if (e.touches.length === 0) {
                touchMode = null;
                lastTouchDist = 0;
                this._isTouchPinching = false;
            } else if (e.touches.length === 1 && touchMode === 'pinch') {
                // 핀치에서 손가락 하나 뗌 → 패닝으로 전환
                touchMode = 'pan';
                this._isTouchPinching = false;
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            }
        };

        window.addEventListener('touchstart', this._globalTouchStartHandler, { passive: false });
        window.addEventListener('touchmove', this._globalTouchMoveHandler, { passive: false });
        window.addEventListener('touchend', this._globalTouchEndHandler);

        // 스페이스바+드래그 패닝
        this._setupSpacePan(panel);

        // 전역 키보드 줌 (Ctrl+0: 리셋, Ctrl++/-: 줌 인/아웃)
        this._globalKeyHandler = e => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (!this._isInitialized) return; // iframe이 초기화되지 않았으면 무시

            // Ctrl+0: 뷰 리셋 (줌 100%, 선택된 iframe 중앙, top 0)
            if (e.key === '0' || e.code === 'Digit0') {
                e.preventDefault();
                this.resetView();
                return;
            }

            // Ctrl++: 줌 인
            if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
                e.preventDefault();
                this.zoom(-1, window.innerWidth / 2, window.innerHeight / 2);
            }
            // Ctrl+-: 줌 아웃
            else if (e.key === '-' || e.code === 'NumpadSubtract') {
                e.preventDefault();
                this.zoom(1, window.innerWidth / 2, window.innerHeight / 2);
            }
        };
        document.addEventListener('keydown', this._globalKeyHandler, true); // capture: true
    }

    _removeGlobalHandlers() {
        if (this._globalWheelHandler) {
            window.removeEventListener('wheel', this._globalWheelHandler, { capture: true });
            this._globalWheelHandler = null;
        }
        if (this._globalKeyHandler) {
            document.removeEventListener('keydown', this._globalKeyHandler, true);
            this._globalKeyHandler = null;
        }
        if (this._globalTouchStartHandler) {
            window.removeEventListener('touchstart', this._globalTouchStartHandler);
            window.removeEventListener('touchmove', this._globalTouchMoveHandler);
            window.removeEventListener('touchend', this._globalTouchEndHandler);
            this._globalTouchStartHandler = null;
            this._globalTouchMoveHandler = null;
            this._globalTouchEndHandler = null;
        }
        if (this._spacePanCleanup) {
            this._spacePanCleanup();
            this._spacePanCleanup = null;
        }
    }

    /**
     * 모든 iframe의 html/body에 panning-grabbing 클래스 추가/제거
     * body 바깥 html 영역에서도 grabbing 커서가 표시되도록 함
     * @param {boolean} isGrabbing - true면 추가, false면 제거
     */
    _setAllIframesPanningGrabbing(isGrabbing) {
        this.iframes.forEach(iframe => {
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;
                const html = doc.documentElement;
                const body = doc.body;
                if (isGrabbing) {
                    html?.classList.add('panning-grabbing');
                    body?.classList.add('panning-grabbing');
                } else {
                    html?.classList.remove('panning-grabbing');
                    body?.classList.remove('panning-grabbing');
                }
            } catch(e) {}
        });
    }

    _setupSpacePan(panel) {
        if (this._spacePanCleanup) return; // 이미 설정됨

        this._isSpaceDown = false;
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panStartPanX = 0;
        this._panStartPanY = 0;
        this._panel = panel;

        this._onKeyDown = e => {
            if (e.code === 'Space' && !this._isSpaceDown) {
                // 텍스트 편집 중이면 스페이스 입력 허용
                if (this.textEditingManager?.isCurrentlyEditing()) {
                    return;
                }

                // 텍스트 입력 필드에서도 스페이스 허용
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                    return;
                }

                e.preventDefault();
                this._isSpaceDown = true;
                panel.style.cursor = CursorUtils.grab();
                // panning-mode 클래스 추가 (CSS로 리사이즈 핸들 비활성화 + iframe 커서 변경)
                document.body.classList.add('panning-mode');
                // iframe들에 panning-mode 클래스 추가 (cursor: grab !important 적용)
                this.iframes.forEach(f => {
                    try {
                        f.contentDocument.documentElement.classList.add('panning-mode');
                        f.contentDocument.body?.classList.add('panning-mode');
                    } catch(e) {}
                });
            }
        };

        this._onKeyUp = e => {
            if (e.code === 'Space') {
                this._endSpacePan();
            }
        };

        // ★ 윈도우 포커스 잃으면 space 상태 리셋 (alt-tab 등으로 keyup 누락 방지)
        this._onWindowBlur = () => {
            if (this._isSpaceDown || this._isPanning) {
                this._endSpacePan();
            }
        };
        this._onVisibilityChange = () => {
            if (document.hidden && (this._isSpaceDown || this._isPanning)) {
                this._endSpacePan();
            }
        };

        this._onMouseDown = e => {
            if (this._isSpaceDown) {
                this._isPanning = true;
                this._panStartX = e.clientX;
                this._panStartY = e.clientY;
                this._panStartPanX = this.panX || 0;
                this._panStartPanY = this.panY || 0;
                panel.style.cursor = CursorUtils.grabbing();
                // 모든 iframe의 html/body에 grabbing 클래스 추가
                this._setAllIframesPanningGrabbing(true);

                // 저사양 PC에서만 플레이스홀더 생성
                if (this._usePlaceholders) {
                    this._createPlaceholders();
                }

                e.preventDefault();
            }
        };

        this._onMouseMove = e => {
            if (this._isPanning) {
                this.panX = this._panStartPanX + (e.clientX - this._panStartX);
                this.panY = this._panStartPanY + (e.clientY - this._panStartY);
                this.applyTransform();
            }
        };

        this._onMouseUp = () => {
            if (this._isPanning) {
                this._isPanning = false;
                const cursor = this._isSpaceDown ? CursorUtils.grab() : '';
                panel.style.cursor = cursor;
                // 모든 iframe의 html/body에서 grabbing 클래스 제거
                this._setAllIframesPanningGrabbing(false);

                // 패닝 종료 시 플레이스홀더 제거
                this._removePlaceholders();
            }
        };

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onWindowBlur);
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        panel.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);

        // cleanup 저장
        this._spacePanCleanup = () => {
            document.removeEventListener('keydown', this._onKeyDown);
            document.removeEventListener('keyup', this._onKeyUp);
            window.removeEventListener('blur', this._onWindowBlur);
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            panel.removeEventListener('mousedown', this._onMouseDown);
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup', this._onMouseUp);
        };
    }

    /**
     * Space panning 상태 완전 리셋
     */
    _endSpacePan() {
        this._isSpaceDown = false;
        this._isPanning = false;
        if (this._panel) this._panel.style.cursor = '';
        document.body.classList.remove('panning-mode');
        this._setAllIframesPanningGrabbing(false);
        this.iframes.forEach(f => {
            try {
                f.contentDocument.documentElement.classList.remove('panning-mode');
                f.contentDocument.body?.classList.remove('panning-mode');
                f.contentDocument.body.style.cursor = '';
            } catch(e) {}
        });
        this._removePlaceholders?.();
    }

    // iframe 내부에 패닝 이벤트 연결
    _attachIframePanHandlers(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;

            // iframe 내부에서도 키보드 단축키 감지
            doc.addEventListener('keydown', e => {
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+0: 뷰 리셋 (줌 100%, 선택된 iframe 중앙, top 0)
                    if (e.key === '0' || e.code === 'Digit0') {
                        e.preventDefault();
                        this.resetView();
                        return;
                    }
                    // Ctrl++: 줌 인
                    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
                        e.preventDefault();
                        this.zoom(-1, window.innerWidth / 2, window.innerHeight / 2);
                        return;
                    }
                    // Ctrl+-: 줌 아웃
                    if (e.key === '-' || e.code === 'NumpadSubtract') {
                        e.preventDefault();
                        this.zoom(1, window.innerWidth / 2, window.innerHeight / 2);
                        return;
                    }
                }

                // 스페이스바: 패닝 모드
                if (e.code === 'Space' && !this._isSpaceDown) {
                    // 텍스트 편집 중이면 스페이스 입력 허용
                    if (this.textEditingManager?.isCurrentlyEditing()) {
                        return;
                    }

                    // iframe 내부 텍스트 입력 필드에서도 스페이스 허용
                    const iframeActiveEl = doc.activeElement;
                    if (iframeActiveEl && (iframeActiveEl.isContentEditable ||
                        iframeActiveEl.classList?.contains('editor-editable') ||
                        iframeActiveEl.classList?.contains('quick-text-edit'))) {
                        return;
                    }

                    e.preventDefault();
                    this._isSpaceDown = true;
                    this._panel.style.cursor = CursorUtils.grab();
                    // panning-mode 클래스 추가 (CSS cursor: grab !important 적용)
                    document.body.classList.add('panning-mode');
                    this.iframes.forEach(f => {
                        try {
                            f.contentDocument.documentElement.classList.add('panning-mode');
                            f.contentDocument.body?.classList.add('panning-mode');
                        } catch(err) {}
                    });
                }
            });

            doc.addEventListener('keyup', e => {
                if (e.code === 'Space') {
                    this._endSpacePan();
                }
            });

            doc.addEventListener('mousedown', e => {
                if (this._isSpaceDown) {
                    this._isPanning = true;
                    // iframe 내부 좌표를 화면 좌표로 변환
                    const z = this.zoomManager?.zoomLevel || 1;
                    const rect = iframe.getBoundingClientRect();
                    this._panStartX = rect.left + e.clientX * z;
                    this._panStartY = rect.top + e.clientY * z;
                    this._panStartPanX = this.panX || 0;
                    this._panStartPanY = this.panY || 0;
                    this._panel.style.cursor = CursorUtils.grabbing();
                    // 모든 iframe의 html/body에 grabbing 클래스 추가
                    this._setAllIframesPanningGrabbing(true);

                    // 저사양 PC에서만 플레이스홀더 생성
                    if (this._usePlaceholders) {
                        this._createPlaceholders();
                    }

                    e.preventDefault();
                }
            });

            doc.addEventListener('mousemove', e => {
                if (this._isPanning) {
                    const z = this.zoomManager?.zoomLevel || 1;
                    const rect = iframe.getBoundingClientRect();
                    const clientX = rect.left + e.clientX * z;
                    const clientY = rect.top + e.clientY * z;
                    this.panX = this._panStartPanX + (clientX - this._panStartX);
                    this.panY = this._panStartPanY + (clientY - this._panStartY);
                    this.applyTransform();
                }
            });

            doc.addEventListener('mouseup', () => {
                if (this._isPanning) {
                    this._isPanning = false;
                    const cursor = this._isSpaceDown ? CursorUtils.grab() : '';
                    this._panel.style.cursor = cursor;
                    // 모든 iframe의 html/body에서 grabbing 클래스 제거
                    this._setAllIframesPanningGrabbing(false);

                    // 패닝 종료 시 플레이스홀더 제거
                    this._removePlaceholders();
                }
            });
        } catch(e) {}
    }

    /**
     * iframe 내부에 터치 핸들러 연결 (두 손가락 핀치 줌만)
     * zoom()의 누적/threshold를 우회하고 직접 줌 적용 (벌벌거림 방지)
     */
    _attachIframeTouchHandlers(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc || iframe._touchHandlerAttached) return;
            iframe._touchHandlerAttached = true;

            let lastDist = 0;
            let isPinching = false;

            doc.addEventListener('touchstart', e => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    lastDist = Math.sqrt(dx * dx + dy * dy);
                    isPinching = true;
                    this._isTouchPinching = true; // 플레이스홀더 복원 억제용
                }
            }, { passive: false });

            doc.addEventListener('touchmove', e => {
                if (e.touches.length === 2 && lastDist > 0) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const newDist = Math.sqrt(dx * dx + dy * dy);
                    const scale = newDist / lastDist;

                    if (Math.abs(scale - 1) > 0.005) {
                        const oldZoom = this.zoomManager?.zoomLevel || 1;
                        const minZoom = MultiCanvasManager.ZOOM_LEVELS[0];
                        const maxZoom = MultiCanvasManager.ZOOM_LEVELS[MultiCanvasManager.ZOOM_LEVELS.length - 1];
                        const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * scale));

                        if (Math.abs(oldZoom - newZoom) > 0.001) {
                            // iframe 좌표 → 화면 좌표 → 패널 좌표
                            const r = iframe.getBoundingClientRect();
                            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                            const screenX = r.left + cx * oldZoom;
                            const screenY = r.top + cy * oldZoom;

                            const panel = document.querySelector('.preview-panel');
                            if (panel) {
                                const panelRect = panel.getBoundingClientRect();
                                const mouseX = screenX - panelRect.left;
                                const mouseY = screenY - panelRect.top;

                                const panX = this.panX || 0;
                                const panY = this.panY || 0;
                                const contentX = (mouseX - panX) / oldZoom;
                                const contentY = (mouseY - panY) / oldZoom;

                                this.panX = mouseX - contentX * newZoom;
                                this.panY = mouseY - contentY * newZoom;
                            }

                            this.zoomManager.zoomLevel = newZoom;
                            // 핀치 중에는 transform만 적용, 플레이스홀더 복원 타이머 없음
                            this.applyTransform();
                        }
                        lastDist = newDist;
                    }
                }
            }, { passive: false });

            doc.addEventListener('touchend', e => {
                if (e.touches.length < 2) {
                    lastDist = 0;
                    if (isPinching) {
                        isPinching = false;
                        this._isTouchPinching = false;
                    }
                }
            });
        } catch(e) {}
    }

    // 줌 레벨 스텝 (1% ~ 10000%)
    static ZOOM_LEVELS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 5.0, 10, 20, 50, 100];

    zoom(delta, clientX, clientY) {
        if (!this.zoomManager) return;

        // 줌 방향에 따라 커서 변경 (클래스 기반으로 !important 우선순위 확보)
        const panel = document.querySelector('.preview-panel');
        const zoomCursor = delta < 0 ? CursorUtils.zoomIn() : CursorUtils.zoomOut();
        const zoomClass = delta < 0 ? 'zooming-in' : 'zooming-out';
        if (panel) {
            panel.style.cursor = zoomCursor;

            // 모든 iframe html/body에 클래스 추가 (body 영역 밖도 포함)
            this.iframes.forEach(iframe => {
                try {
                    const doc = iframe.contentDocument;
                    if (doc) {
                        doc.documentElement.classList.remove('zooming-in', 'zooming-out');
                        doc.documentElement.classList.add(zoomClass);
                        if (doc.body) {
                            doc.body.classList.remove('zooming-in', 'zooming-out');
                            doc.body.classList.add(zoomClass);
                        }
                    }
                } catch (err) { /* CORS */ }
            });

            clearTimeout(this._zoomCursorTimer);
            this._zoomCursorTimer = setTimeout(() => {
                if (!this._isSpaceDown) panel.style.cursor = '';
                // 모든 iframe html/body에서 클래스 제거
                this.iframes.forEach(iframe => {
                    try {
                        const doc = iframe.contentDocument;
                        if (doc) {
                            doc.documentElement.classList.remove('zooming-in', 'zooming-out');
                            if (doc.body) {
                                doc.body.classList.remove('zooming-in', 'zooming-out');
                            }
                        }
                    } catch (err) { /* CORS */ }
                });
            }, 300);
        }

        const oldZoom = this.zoomManager.zoomLevel;
        const minZoom = MultiCanvasManager.ZOOM_LEVELS[0];
        const maxZoom = MultiCanvasManager.ZOOM_LEVELS[MultiCanvasManager.ZOOM_LEVELS.length - 1];

        // delta 누적 후 threshold 초과 시에만 줌 적용 (렌더링 빈도 감소)
        this._zoomAccum = (this._zoomAccum || 0) + delta;
        if (Math.abs(this._zoomAccum) < 10) return;
        // PC 마우스(deltaY ~100)는 클램프, 터치패드(deltaY ~10-15)는 그대로
        const clampedDelta = Math.sign(this._zoomAccum) * Math.min(Math.abs(this._zoomAccum), 20);
        this._zoomAccum = 0;
        // 가속도 계산 (ZoomManager와 동일 로직)
        const accel = this.zoomManager?._getZoomAccelFactor?.() ?? 0.6;
        const zoomFactor = Math.pow(0.99, clampedDelta * accel);
        const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * zoomFactor));
        if (Math.abs(oldZoom - newZoom) < 0.0001) return;

        // 부모 패널 기준 마우스 좌표 (transform 영향 없음)
        if (!panel) return;
        const panelRect = panel.getBoundingClientRect();
        const mouseX = clientX - panelRect.left;
        const mouseY = clientY - panelRect.top;

        // 현재 pan 값
        const panX = this.panX || 0;
        const panY = this.panY || 0;

        // 마우스 아래 콘텐츠 좌표 (줌 적용 전)
        const contentX = (mouseX - panX) / oldZoom;
        const contentY = (mouseY - panY) / oldZoom;

        // 새 pan 값 계산 (마우스 아래 콘텐츠가 그대로 유지되도록)
        this.panX = mouseX - contentX * newZoom;
        this.panY = mouseY - contentY * newZoom;

        this.zoomManager.zoomLevel = newZoom;

        // 플레이스홀더 모드로 변환 적용
        this._showPlaceholdersAndTransform();
    }

    pan(deltaY, deltaX = 0) {
        this.panY = (this.panY || 0) - deltaY;
        this.panX = (this.panX || 0) - deltaX;
        // 플레이스홀더 모드로 변환 적용
        this._showPlaceholdersAndTransform();
    }

    // 줌/패닝 시 플레이스홀더 표시 및 디바운스로 복원
    _showPlaceholdersAndTransform() {
        // 고성능 PC면 플레이스홀더 없이 바로 transform 적용
        if (!this._usePlaceholders) {
            this.applyTransform();
            return;
        }

        // 플레이스홀더가 없으면 생성
        if (!this._placeholders) {
            this._createPlaceholders();
        }

        // transform 적용
        this.applyTransform();

        // 리사이즈 중이거나 스페이스+드래그 패닝 중이면 디바운스 타이머 설정 안 함
        if (this._isResizing || this._isPanning) {
            return;
        }

        // 기존 타이머 클리어
        if (this._placeholderRestoreTimer) {
            clearTimeout(this._placeholderRestoreTimer);
        }

        // 150ms 후 iframe 복원
        this._placeholderRestoreTimer = setTimeout(() => {
            this._removePlaceholders();
            this._placeholderRestoreTimer = null;
        }, 150);
    }

    applyTransform() {
        const z = this.zoomManager?.zoomLevel || 1;
        const x = this.panX || 0;
        const y = this.panY || 0;

        // 단일뷰: previewFrame에 transform 적용
        // 멀티뷰: container 전체에 transform 적용
        const target = this.container || this.zoomManager?.previewFrame;
        if (target) {
            target.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
            target.style.transformOrigin = '0 0';
        }
        this.zoomManager?.updateZoomIndicator();
    }

    /**
     * 모든 iframe 배열 반환
     * @returns {HTMLIFrameElement[]}
     */
    getIframes() {
        return this.iframes || [];
    }

    /**
     * 모든 iframe 높이 재계산
     */
    recalculateAllHeights() {
        if (!this.iframes || this.iframes.length === 0) return;

        this.iframes.forEach(iframe => {
            try {
                const w = parseInt(iframe.style.width);
                // 100vh 요소 높이 제한 재적용 후 높이 계산
                this.limitViewportHeightElements(iframe, w);
                const h = this.calculateHeight(iframe, w);
                iframe.style.height = h + 'px';
            } catch (e) {
                // 무시
            }
        });

        this._updateResizeHandles();
    }

    /**
     * 요소에서 최적의 CSS selector 계산
     * @param {HTMLElement} element
     * @returns {string|null}
     */
    _getElementSelector(element) {
        if (!element) return null;

        // ID 우선
        if (element.id) {
            return '#' + element.id;
        }

        // 클래스 (에디터 관련 클래스 제외)
        const nonEditorClasses = Array.from(element.classList || []).filter(cls =>
            !cls.startsWith('zaemit-') &&
            !cls.startsWith('quick-text-edit') &&
            !cls.startsWith('editor-') &&
            !cls.startsWith('selected-') &&
            !cls.startsWith('table-cell-')
        );
        if (nonEditorClasses.length > 0) {
            return '.' + nonEditorClasses[0];
        }

        return null;
    }

    /**
     * 해당 iframe이 동기화 대상인지 확인 (targetBreakpoints 체크)
     * @param {HTMLIFrameElement} iframe
     * @param {number} activeIdx - 현재 활성 iframe 인덱스
     * @returns {boolean}
     */
    _shouldSyncToIframe(iframe, activeIdx) {
        const i = parseInt(iframe.dataset.index);

        // 활성 iframe은 제외
        if (i === activeIdx) return false;

        // 숨겨진 iframe은 제외
        if (iframe.style.display === 'none') return false;

        // targetBreakpoints 확인
        if (!this.viewModeManager) return true; // viewModeManager 없으면 모두 동기화

        const targetBreakpoints = this.viewModeManager.targetBreakpoints;
        if (!targetBreakpoints || targetBreakpoints.size === 0) return true; // 비어있으면 모두 동기화

        // iframe의 너비가 targetBreakpoints에 포함되어 있는지 확인
        const iframeWidth = Math.round(parseFloat(iframe.style.width));

        // targetBreakpoints는 Set<string>이므로 문자열로 비교
        // 또한 "100%" 같은 특수 값도 처리
        for (const bp of targetBreakpoints) {
            if (bp === '100%') {
                // PC 모드: 1200px 이상
                if (iframeWidth >= 1200) return true;
            } else {
                const bpWidth = parseInt(bp);
                if (iframeWidth === bpWidth) return true;
            }
        }

        return false;
    }

    /**
     * 드래그 중 상태 설정 (동기화 스킵용)
     * @param {boolean} isDragging
     */
    setDragging(isDragging) {
        this._isDragging = isDragging;
    }

    /**
     * 변경 사항만 다른 iframe에 동기화 (리로드 없이)
     * @param {Object} change - { type, elementPath, property, oldValue, newValue, changes }
     */
    syncChange(change) {
        // 드래그 중에는 동기화 스킵 (임시 요소가 복제되는 것 방지)
        if (this._isDragging) return;
        // ★ _isInitialized만 체크 (isMultiViewEnabled 제거)
        // OFF 상태에서도 숨겨진 iframe에 변경 반영하여 재활성화 시 일관성 유지
        if (!this._isInitialized) return;
        if (!change) return;

        // cssStyle 또는 style 타입은 CSS 변경 - CSS만 동기화
        // (미디어쿼리 포함 모든 CSS를 동기화해야 함 - 파일은 하나니까)
        // HTML 전체 동기화 제거 - 높이 등 상태가 리셋되므로 필요시 엘리먼트 단위로만 동기화
        if (change.type === 'cssStyle' || change.type === 'style' || change.type === 'multiStyle') {
            this.syncCSSToAllCanvases();

            // 클래스 변경이 있으면 해당 엘리먼트만 동기화 (전체 HTML 동기화 대신)
            // element가 있으면 직접 사용 (elementPath가 null일 수 있음 - 멀티뷰에서 다른 iframe의 요소)
            if (change.element) {
                this.syncElementClassesFromElement(change.element);
            } else if (change.elementPath) {
                this.syncElementClassesToAllCanvases(change.elementPath);
            }
            return;
        }

        // structure 타입: change.data에 elementPath가 있음 - 요소 단위로 동기화
        if (change.type === 'structure' && change.data) {
            this._syncStructureChange(change);
            return;
        }

        // snapshot 타입 또는 elementPath가 없는 경우
        if (!change.elementPath) {
            if (change.type === 'snapshot') {
                this._syncBodyContent();
            } else if (change.type === 'elementSnapshot' && change.element) {
                // ★ elementSnapshot: 텍스트/속성 변경 등 recordElementSnapshot()으로 기록된 변경
                // elementPath가 없으므로 change.element로 위치를 찾아 요소 단위 동기화
                this._syncElementSnapshot(change);
            }
            return;
        }

        const activeIdx = this.getActiveIndex();

        this.iframes.forEach((iframe) => {
            // targetBreakpoints 기반 필터링
            if (!this._shouldSyncToIframe(iframe, activeIdx)) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                const element = this._findElementByPath(change.elementPath, doc);
                if (!element) return;

                switch (change.type) {
                    case 'style':
                        element.style[change.property] = change.newValue;
                        break;

                    case 'multiStyle':
                        if (change.changes) {
                            change.changes.forEach(c => {
                                element.style[c.property] = c.newValue;
                            });
                        }
                        break;

                    case 'attribute':
                        if (change.newValue === null || change.newValue === '') {
                            element.removeAttribute(change.property);
                        } else {
                            element.setAttribute(change.property, change.newValue);
                        }
                        break;

                    case 'content':
                        element.innerHTML = change.newValue;
                        break;

                    case 'structure':
                    case 'tagChange':
                        // 구조 변경은 outerHTML 교체
                        if (change.newValue) {
                            element.outerHTML = change.newValue;
                        }
                        break;
                }
            } catch (e) {
                // 동기화 실패 무시
            }
        });
    }

    /**
     * structure 변경을 요소 단위로 동기화 (innerHTML 전체 교체 대신)
     * add/delete는 요소 단위로 처리, move는 body 동기화
     * @param {Object} change - structure 변경 객체
     */
    _syncStructureChange(change) {
        const activeIdx = this.getActiveIndex();
        const { structureType, data } = change;

        if (!data) {
            this._syncBodyContent();
            return;
        }

        // move는 복잡한 변경이므로 body 전체 동기화
        if (structureType === 'move') {
            this._syncBodyContent();
            return;
        }

        this.iframes.forEach((iframe) => {
            const i = parseInt(iframe.dataset.index);
            // HTML은 모든 뷰에서 공유되므로 활성 iframe만 제외하고 모두 동기화
            // (체크박스 상태와 무관 - _shouldSyncToIframe 사용 안 함)
            if (i === activeIdx) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                switch (structureType) {
                    case 'add': {
                        // 복제/추가: parentPath의 index 위치에 html 삽입
                        const parent = this._findElementByPath(data.parentPath, doc);
                        if (parent && data.html) {
                            const temp = doc.createElement('div');
                            temp.innerHTML = data.html;
                            const newElement = temp.firstElementChild;
                            if (newElement) {
                                const refChild = parent.children[data.index] || null;
                                parent.insertBefore(newElement, refChild);
                            }
                        }
                        break;
                    }
                    case 'delete': {
                        // 삭제: elementPath로 요소 찾아서 제거
                        if (data.elementPath) {
                            const element = this._findElementByPath(data.elementPath, doc);
                            if (element) element.remove();
                        } else if (data.parentPath !== undefined && data.index !== undefined) {
                            // elementPath가 없으면 parentPath + index로 제거
                            const parent = this._findElementByPath(data.parentPath, doc);
                            if (parent && parent.children[data.index]) {
                                parent.children[data.index].remove();
                            }
                        }
                        break;
                    }
                    default:
                        // 알 수 없는 structureType은 body 동기화
                        this._syncBodyContent();
                        return;
                }
            } catch (e) {
                console.warn('[MultiCanvasManager] _syncStructureChange error:', e);
            }
        });
    }

    /**
     * 에디터 UI 클래스를 제거한 깨끗한 HTML 반환
     * @param {HTMLElement} body - body 요소
     * @returns {string} 정제된 innerHTML
     */
    _getCleanBodyHTML(body) {
        const clone = body.cloneNode(true);

        // 에디터 클래스 제거
        clone.querySelectorAll('*').forEach(el => {
            const classes = Array.from(el.classList);
            classes.forEach(cls => {
                if (cls.startsWith('editor-') ||
                    cls.startsWith('zaemit-') ||
                    cls.startsWith('selected-') ||
                    cls.startsWith('table-cell-') ||
                    cls.startsWith('quick-text-edit')) {
                    el.classList.remove(cls);
                }
            });
            // class 속성이 비어있으면 제거
            if (el.classList.length === 0) {
                el.removeAttribute('class');
            }
        });

        // 에디터 오버레이 요소 및 드래그 임시 요소 제거
        clone.querySelectorAll(
            '#editor-overlay, #editor-margin-overlay, #editor-padding-overlay, ' +
            '.editor-spacing-handle, .editor-context-menu, #zaemit-temp-styles, ' +
            '#editor-drop-indicator, .editor-drag-clone, ' +
            '.editor-drag-ghost, .editor-placeholder'
        ).forEach(el => el.remove());

        return clone.innerHTML;
    }

    /**
     * 특정 엘리먼트의 클래스만 다른 iframe에 동기화
     * 전체 HTML 동기화 대신 사용 - 높이 등 상태가 유지됨
     * @param {Array} elementPath - 엘리먼트 경로 [{tag, index}, ...]
     */
    syncElementClassesToAllCanvases(elementPath) {
        if (!this._isInitialized || !elementPath) return;

        const activeIdx = this.getActiveIndex();
        const activeIframe = this.iframes[activeIdx];
        if (!activeIframe?.contentDocument) return;

        // 활성 iframe에서 소스 엘리먼트 찾기
        const sourceElement = this._findElementByPath(elementPath, activeIframe.contentDocument);
        if (!sourceElement) return;

        // 에디터 클래스 제외한 클래스 목록
        const cleanClasses = this._getCleanClasses(sourceElement);

        this.iframes.forEach((iframe, i) => {
            if (i === activeIdx) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                // 경로로 대상 엘리먼트 찾기
                const targetEl = this._findElementByPath(elementPath, doc);
                if (!targetEl) return;

                // 에디터 클래스가 아닌 새 클래스만 추가
                cleanClasses.forEach(cls => {
                    if (!targetEl.classList.contains(cls)) {
                        targetEl.classList.add(cls);
                    }
                });
            } catch (e) {
                console.error('[MultiCanvasManager] syncElementClassesToAllCanvases error:', e);
            }
        });
    }

    /**
     * 활성 iframe의 선택된 요소 클래스를 모든 iframe에 동기화
     * elementPath 대신 element를 직접 받아서 처리 (멀티뷰에서 다른 iframe의 요소일 때 유용)
     * @param {HTMLElement} sourceElement - 소스 요소 (활성 iframe에서)
     */
    syncElementClassesFromElement(sourceElement) {
        if (!this._isInitialized || !sourceElement) return;

        const activeIdx = this.getActiveIndex();

        // 소스 요소에서 경로 직접 생성
        const elementPath = this._getElementPath(sourceElement);
        if (!elementPath) return;

        // 에디터 클래스 제외한 클래스 목록
        const cleanClasses = this._getCleanClasses(sourceElement);

        this.iframes.forEach((iframe, i) => {
            if (i === activeIdx) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                // 경로로 대상 엘리먼트 찾기
                const targetEl = this._findElementByPath(elementPath, doc);
                if (!targetEl) return;

                // 에디터 클래스가 아닌 새 클래스만 추가
                cleanClasses.forEach(cls => {
                    if (!targetEl.classList.contains(cls)) {
                        targetEl.classList.add(cls);
                    }
                });
            } catch (e) {
                console.error('[MultiCanvasManager] syncElementClassesFromElement error:', e);
            }
        });
    }

    /**
     * 활성 iframe의 선택된 요소 inline style을 모든 iframe에 동기화
     * 드래그 리사이즈 등 inline style 변경 시 사용
     * @param {HTMLElement} sourceElement - 소스 요소 (활성 iframe에서)
     */
    syncElementStyleFromElement(sourceElement) {
        console.log('[syncElementStyleFromElement] Called, element:', sourceElement?.tagName);
        if (!this._isInitialized || !sourceElement) {
            console.log('[syncElementStyleFromElement] Early return - not initialized or no element');
            return;
        }

        // 소스 요소에서 경로 직접 생성
        const elementPath = this._getElementPath(sourceElement);
        console.log('[syncElementStyleFromElement] Element path:', elementPath);
        if (!elementPath) return;

        // 소스 요소의 style attribute 가져오기
        const styleAttr = sourceElement.getAttribute('style') || '';
        console.log('[syncElementStyleFromElement] Style attr:', styleAttr);

        // ★ 소스 요소가 어느 iframe에서 왔는지 확인
        const sourceIframe = this.iframes.find(iframe => {
            try {
                return iframe.contentDocument?.body?.contains(sourceElement);
            } catch (e) {
                return false;
            }
        });
        const sourceIdx = this.iframes.indexOf(sourceIframe);
        console.log('[syncElementStyleFromElement] Source iframe index:', sourceIdx, 'isMainIframe:', sourceIframe === this.mainIframe);

        this.iframes.forEach((iframe, idx) => {
            // ★ 소스 iframe만 건너뜀 (자기 자신에게 동기화 불필요)
            if (iframe === sourceIframe) {
                console.log(`[syncElementStyleFromElement] Skipping iframe[${idx}] (source)`);
                return;
            }

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                // 경로로 대상 엘리먼트 찾기
                const targetEl = this._findElementByPath(elementPath, doc);
                if (!targetEl) {
                    console.log(`[syncElementStyleFromElement] iframe[${idx}]: target element not found`);
                    return;
                }

                // style attribute 동기화
                const isMain = iframe === this.mainIframe;
                console.log(`[syncElementStyleFromElement] Syncing to iframe[${idx}], isMainIframe:`, isMain, 'styleAttr:', styleAttr);
                if (styleAttr) {
                    targetEl.setAttribute('style', styleAttr);
                } else {
                    targetEl.removeAttribute('style');
                }
                console.log(`[syncElementStyleFromElement] iframe[${idx}] synced, target style:`, targetEl.getAttribute('style'));
            } catch (e) {
                console.error('[MultiCanvasManager] syncElementStyleFromElement error:', e);
            }
        });
    }

    /**
     * 요소에서 경로 생성 (body 기준)
     * @param {HTMLElement} element
     * @returns {Array|null} 경로 배열 [{ tag, index }, ...]
     */
    _getElementPath(element) {
        if (!element) return null;

        const path = [];
        let current = element;

        while (current && current.tagName !== 'BODY') {
            const parent = current.parentElement;
            if (!parent) break;

            const siblings = Array.from(parent.children).filter(
                el => el.tagName === current.tagName
            );
            const index = siblings.indexOf(current);

            path.unshift({ tag: current.tagName.toLowerCase(), index });
            current = parent;
        }

        return path;
    }

    /**
     * 에디터 클래스를 제외한 클래스 목록 반환
     * @param {HTMLElement} element
     * @returns {string[]}
     */
    _getCleanClasses(element) {
        return Array.from(element.classList).filter(cls =>
            !cls.startsWith('editor-') &&
            !cls.startsWith('zaemit-') &&
            !cls.startsWith('selected-') &&
            !cls.startsWith('table-cell-') &&
            !cls.startsWith('quick-text-edit')
        );
    }

    /**
     * body 내용만 동기화 (iframe 리로드 없이)
     * 에디터 UI 클래스는 제외하고 동기화
     * 구조 변경이므로 숨겨진 iframe에도 동기화 (HTML 파일은 하나)
     * 주의: 높이 등 상태가 리셋될 수 있으므로 구조 변경 시에만 사용
     */
    _syncBodyContent() {
        const activeIdx = this.getActiveIndex();
        const activeIframe = this.iframes[activeIdx];
        if (!activeIframe?.contentDocument?.body) return;

        // 에디터 클래스 제거한 깨끗한 HTML
        const cleanHTML = this._getCleanBodyHTML(activeIframe.contentDocument.body);
        console.log('[_syncBodyContent] Syncing from activeIframe[' + activeIdx + '] to all others');

        this.iframes.forEach((iframe, i) => {
            // 활성 iframe만 제외 (이미 변경됨)
            // 숨겨진 iframe에도 동기화 (나중에 표시될 때 최신 상태여야 함)
            if (i === activeIdx) return;

            try {
                const doc = iframe.contentDocument;
                if (doc?.body) {
                    doc.body.innerHTML = cleanHTML;

                    // body 교체 후 100vh 요소 높이 재계산 + iframe 높이 업데이트
                    const w = parseInt(iframe.style.width) || 480;
                    this.limitViewportHeightElements(iframe, w);
                    iframe.style.height = this.calculateHeight(iframe, w) + 'px';
                }
            } catch (e) {
                // 동기화 실패 무시
            }
        });
    }

    /**
     * elementSnapshot 타입의 변경을 요소 단위로 다른 iframe에 동기화
     * recordElementSnapshot()으로 기록된 텍스트/속성 변경에 사용
     * @param {Object} change - { type: 'elementSnapshot', element, newHtml, ... }
     */
    _syncElementSnapshot(change) {
        const activeIdx = this.getActiveIndex();
        const activeIframe = this.iframes[activeIdx];
        if (!activeIframe?.contentDocument) return;

        // change.element에서 body까지의 경로 추출
        const elementPath = this._getElementPath(change.element, activeIframe.contentDocument);
        if (!elementPath) return;

        // 에디터 클래스 등을 제거한 깨끗한 outerHTML
        const cleanOuterHTML = this._getCleanElementHTML(change.element);

        this.iframes.forEach((iframe, i) => {
            if (i === activeIdx) return;
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;
                const targetEl = this._findElementByPath(elementPath, doc);
                if (!targetEl) return;
                targetEl.outerHTML = cleanOuterHTML;
            } catch (e) {}
        });
    }

    /**
     * 요소의 body부터의 경로를 [{tag, index}] 형태로 반환
     * _findElementByPath()와 호환되는 형식
     * @param {HTMLElement} element - 대상 요소
     * @param {Document} doc - 요소가 속한 document
     * @returns {Array|null} [{tag, index}, ...] 또는 null
     */
    _getElementPath(element, doc) {
        if (!element || !doc?.body) return null;
        const path = [];
        let current = element;
        while (current && current !== doc.body) {
            const parent = current.parentElement;
            if (!parent) return null;
            const tag = current.tagName.toLowerCase();
            const siblings = Array.from(parent.children).filter(c => c.tagName.toLowerCase() === tag);
            const index = siblings.indexOf(current);
            path.unshift({ tag, index });
            current = parent;
        }
        return current === doc.body ? path : null;
    }

    /**
     * 요소의 outerHTML에서 에디터 전용 클래스/속성을 제거한 깨끗한 HTML 반환
     * @param {HTMLElement} element - 대상 요소
     * @returns {string} 정제된 outerHTML
     */
    _getCleanElementHTML(element) {
        const clone = element.cloneNode(true);
        // 에디터 전용 클래스 제거
        clone.classList.remove('editor-editable', 'quick-text-edit', 'zaemit-force-visible');
        clone.removeAttribute('contenteditable');
        // data-zaemit-uid는 유지 (undo/redo에 필요)
        return clone.outerHTML;
    }

    /**
     * body 내용을 모든 iframe에 동기화 (public API)
     * AI 서비스 등 외부에서 호출 시 사용
     * @param {boolean} fromMainIframe - true면 mainIframe 기준, false면 활성 iframe 기준
     */
    syncBodyToAll(fromMainIframe = false) {
        console.log('[syncBodyToAll] Called with fromMainIframe:', fromMainIframe);
        if (fromMainIframe) {
            this._syncBodyFromMainIframe();
        } else {
            this._syncBodyContent();
        }
    }

    /**
     * 외부 소스 iframe에서 모든 멀티캔버스 iframe으로 body 동기화
     * html-full 적용 후 preview:loaded에서 사용
     * 숨겨진 프리뷰 iframe(서버에서 새 HTML 로드됨)을 소스로 사용
     * @param {HTMLIFrameElement} sourceIframe - 소스 iframe (숨겨진 프리뷰 iframe)
     */
    syncBodyFromSource(sourceIframe) {
        if (!sourceIframe?.contentDocument?.body) {
            console.warn('[syncBodyFromSource] 소스 iframe body 없음');
            return;
        }

        const cleanHTML = this._getCleanBodyHTML(sourceIframe.contentDocument.body);
        console.log('[syncBodyFromSource] Syncing from external source iframe to all', this.iframes.length, 'iframes');

        this.iframes.forEach((iframe) => {
            try {
                const doc = iframe.contentDocument;
                if (doc?.body) {
                    doc.body.innerHTML = cleanHTML;

                    // body 교체 후 100vh 요소 높이 재계산 + iframe 높이 업데이트
                    const w = parseInt(iframe.style.width) || 480;
                    this.limitViewportHeightElements(iframe, w);
                    iframe.style.height = this.calculateHeight(iframe, w) + 'px';
                }
            } catch (e) {
                console.warn('[syncBodyFromSource] iframe 동기화 실패:', e);
            }
        });

        // ★ body 교체 후 등장 애니메이션 요소 강제 표시 (CSS 클래스 기반 opacity:0)
        requestAnimationFrame(() => {
            this.iframes.forEach(iframe => {
                try {
                    this.previewManager?.forceShowAnimationElements(iframe.contentDocument);
                } catch (e) {}
            });
        });
    }

    /**
     * mainIframe의 body를 다른 모든 iframe에 동기화
     * Undo/Redo에서 사용 (mainIframe에서 변경 후 동기화)
     */
    _syncBodyFromMainIframe() {
        if (!this.mainIframe?.contentDocument?.body) return;

        // 에디터 클래스 제거한 깨끗한 HTML
        const cleanHTML = this._getCleanBodyHTML(this.mainIframe.contentDocument.body);
        console.log('[_syncBodyFromMainIframe] Syncing from mainIframe to all others');

        this.iframes.forEach((iframe, idx) => {
            // mainIframe만 제외 (이미 변경됨)
            if (iframe === this.mainIframe) return;

            try {
                const doc = iframe.contentDocument;
                if (doc?.body) {
                    doc.body.innerHTML = cleanHTML;

                    // body 교체 후 100vh 요소 높이 재계산 + iframe 높이 업데이트
                    const w = parseInt(iframe.style.width) || 480;
                    this.limitViewportHeightElements(iframe, w);
                    iframe.style.height = this.calculateHeight(iframe, w) + 'px';
                }
            } catch (e) {
                // 동기화 실패 무시
            }
        });

        // ★ body 교체 후 등장 애니메이션 요소 강제 표시
        requestAnimationFrame(() => {
            this.iframes.forEach(iframe => {
                if (iframe === this.mainIframe) return;
                try {
                    this.previewManager?.forceShowAnimationElements(iframe.contentDocument);
                } catch (e) {}
            });
        });
    }

    /**
     * zaemit-temp-styles (AI 임시 스타일)를 모든 iframe에 동기화
     * @param {string} tempCSS - 임시 CSS 내용
     */
    syncTempCSSToAll(tempCSS) {
        // ★ _isInitialized만 체크: OFF 상태에서도 숨겨진 iframe에 CSS 동기화
        if (!this._isInitialized) return;

        this.iframes.forEach((iframe) => {
            try {
                // OFF 상태(체크박스 해제)인 뷰는 동기화 스킵
                const width = parseInt(iframe.style.width) || iframe.offsetWidth;
                if (!this._isViewChecked(width)) {
                    return;
                }

                const doc = iframe.contentDocument;
                if (!doc) return;

                let tempStyleTag = doc.getElementById('zaemit-temp-styles');
                if (tempCSS) {
                    // 내용이 있으면 태그 생성/업데이트
                    if (!tempStyleTag) {
                        tempStyleTag = doc.createElement('style');
                        tempStyleTag.id = 'zaemit-temp-styles';
                        (doc.head || doc.documentElement).appendChild(tempStyleTag);
                    }
                    tempStyleTag.textContent = tempCSS;
                } else {
                    // 내용이 없으면 태그 내용 제거
                    if (tempStyleTag) {
                        tempStyleTag.textContent = '';
                    }
                }
            } catch (err) {
                console.error('[MultiCanvasManager] syncTempCSSToAll 오류:', err);
            }
        });
    }

    /**
     * 요소 경로로 요소 찾기
     */
    _findElementByPath(path, doc) {
        if (!doc || !path) return null;
        if (path.length === 0) return doc.body;

        let current = doc.body;
        for (const step of path) {
            if (!current) return null;
            const children = Array.from(current.children).filter(
                child => child.tagName.toLowerCase() === step.tag
            );
            if (step.index >= children.length) return null;
            current = children[step.index];
        }
        return current;
    }

    /**
     * 특정 CSS 규칙만 다른 iframe에 동기화 (전체 복사 대신 개별 규칙만)
     * @param {HTMLElement} element - 대상 요소
     * @param {string} property - CSS 속성 (camelCase)
     * @param {string} value - 새 값
     */
    syncCSSRuleToAllCanvases(element, property, value) {
        // ★ _isInitialized만 체크: OFF 상태에서도 숨겨진 iframe에 CSS 동기화
        if (!this._isInitialized || !element) return;

        const activeIdx = this.getActiveIndex();
        const activeIframe = this.iframes[activeIdx];
        if (!activeIframe?.contentDocument) return;

        // element에서 selector 계산
        const selector = this._getElementSelector(element);
        if (!selector) {
            this.syncCSSToAllCanvases();
            return;
        }

        const kebabProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();

        this.iframes.forEach((iframe) => {
            const i = parseInt(iframe.dataset.index);
            // CSS는 모든 iframe에 동기화 (체크 여부 무관 - 파일은 하나니까)
            // 단, 자신(활성 iframe)은 건너뜀
            if (i === activeIdx) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                // zaemit-temp-styles 찾기 또는 생성
                let tempStyle = doc.getElementById('zaemit-temp-styles');
                if (!tempStyle) {
                    tempStyle = doc.createElement('style');
                    tempStyle.id = 'zaemit-temp-styles';
                    doc.body.appendChild(tempStyle);
                }

                const sheet = tempStyle.sheet;
                if (!sheet) return;

                // 해당 selector의 규칙 찾기
                let rule = null;
                for (const r of sheet.cssRules) {
                    if (r.type === 1 && r.selectorText === selector) {
                        rule = r;
                        break;
                    }
                }

                // 규칙이 없으면 추가 (미디어 쿼리 앞에 추가하여 순서 유지)
                if (!rule) {
                    // 미디어 쿼리가 시작하는 위치 찾기
                    let insertIndex = sheet.cssRules.length;
                    for (let j = 0; j < sheet.cssRules.length; j++) {
                        if (sheet.cssRules[j].type === 4) { // CSSMediaRule
                            insertIndex = j;
                            break;
                        }
                    }
                    const ruleText = `${selector} { }`;
                    const index = sheet.insertRule(ruleText, insertIndex);
                    rule = sheet.cssRules[index];
                }

                // 해당 property만 업데이트
                if (value) {
                    rule.style.setProperty(kebabProperty, value);
                } else {
                    rule.style.removeProperty(kebabProperty);
                }
            } catch (e) {
                console.error('[MultiCanvasManager] syncCSSRuleToAllCanvases error:', e);
            }
        });
    }

    /**
     * CSS를 체크된 뷰모드의 iframe에만 동기화
     * CSS만 변경 시 사용 (반응형 스타일이므로 체크된 뷰에만 적용)
     */
    syncCSSToCheckedCanvases() {
        // ★ _isInitialized만 체크: OFF 상태에서도 숨겨진 iframe에 CSS 동기화
        if (!this._isInitialized) return;

        const activeIdx = this.getActiveIndex();
        const activeIframe = this.iframes[activeIdx];
        if (!activeIframe?.contentDocument) return;

        const activeTempStyle = activeIframe.contentDocument.getElementById('zaemit-temp-styles');
        if (!activeTempStyle) return;

        // CSSOM에서 CSS 텍스트 추출
        let cssContent = '';
        const sheet = activeTempStyle.sheet;
        if (sheet && sheet.cssRules) {
            for (const rule of sheet.cssRules) {
                cssContent += rule.cssText + '\n';
            }
        } else {
            cssContent = activeTempStyle.textContent;
        }

        this.iframes.forEach((iframe) => {
            // _shouldSyncToIframe() 사용 → 체크된 뷰만 동기화
            if (!this._shouldSyncToIframe(iframe, activeIdx)) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                // 기존 태그 재사용 (깜빡임 방지)
                let tempStyleTag = doc.getElementById('zaemit-temp-styles');
                if (!tempStyleTag) {
                    tempStyleTag = doc.createElement('style');
                    tempStyleTag.id = 'zaemit-temp-styles';
                    doc.body.appendChild(tempStyleTag);
                }
                tempStyleTag.textContent = cssContent;

                // CSS 변경 후 100vh 요소 높이 재계산 + iframe 높이 업데이트
                const w = parseInt(iframe.style.width) || 480;
                this.limitViewportHeightElements(iframe, w);
                iframe.style.height = this.calculateHeight(iframe, w) + 'px';
            } catch (e) {
                // 동기화 실패 무시
            }
        });
    }

    /**
     * CSS만 다른 iframe에 동기화 (리로드 없이)
     * zaemit-temp-styles 태그만 동기화 (에디터에서 사용하는 임시 스타일 태그)
     * @param {boolean} forceAll - true면 체크박스 상태 무시하고 모든 뷰에 동기화 (실시간 미리보기용)
     */
    syncCSSToAllCanvases(forceAll = false) {
        if (!this._isInitialized) return;

        // Undo/Redo는 항상 mainIframe(previewFrame)에서 실행됨
        // 따라서 mainIframe에서 CSS를 읽어서 모든 다른 iframe에 동기화
        const sourceIframe = this.mainIframe;
        if (!sourceIframe?.contentDocument) return;

        // mainIframe의 zaemit-temp-styles 태그 찾기
        const sourceTempStyle = sourceIframe.contentDocument.getElementById('zaemit-temp-styles');
        if (!sourceTempStyle) return;

        // CSSOM에서 CSS 텍스트 추출 (textContent는 CSSOM 변경 반영 안 됨)
        // rule.style.setProperty()로 수정된 CSS는 cssRules에서 가져와야 함
        // ★ 미디어쿼리 순서 정렬: 큰 max-width가 먼저, 작은 max-width가 나중에
        let cssContent = '';
        const sheet = sourceTempStyle.sheet;
        if (sheet && sheet.cssRules) {
            const baseRules = [];
            const mediaRules = [];

            for (const rule of sheet.cssRules) {
                if (rule.type === 4) { // CSSMediaRule
                    const match = (rule.conditionText || rule.media?.mediaText || '').match(/max-width:\s*(\d+)px/i);
                    const width = match ? parseInt(match[1]) : 0;
                    mediaRules.push({ width, cssText: rule.cssText });
                } else {
                    baseRules.push(rule.cssText);
                }
            }

            // 미디어쿼리 정렬: 큰 width → 작은 width (내림차순)
            mediaRules.sort((a, b) => b.width - a.width);

            // base rules 먼저, 그 다음 정렬된 media rules
            cssContent = baseRules.join('\n') + '\n' + mediaRules.map(r => r.cssText).join('\n');

            // ★ mainIframe의 CSSOM도 정렬된 CSS로 업데이트 (미디어쿼리 순서 수정)
            sourceTempStyle.textContent = cssContent;
        } else {
            // fallback to textContent
            cssContent = sourceTempStyle.textContent;
        }

        this.iframes.forEach((iframe, idx) => {
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                // mainIframe은 CSS 이미 업데이트됨 → 높이 재계산
                if (iframe === this.mainIframe) {
                    const w = parseInt(iframe.style.width) || 1920;
                    this.limitViewportHeightElements(iframe, w);
                    iframe.style.height = this.calculateHeight(iframe, w) + 'px';
                    return;
                }

                // 다른 iframe: CSS 동기화 + 배경 재평가 + 높이 재계산
                let tempStyleTag = doc.getElementById('zaemit-temp-styles');
                if (!tempStyleTag) {
                    tempStyleTag = doc.createElement('style');
                    tempStyleTag.id = 'zaemit-temp-styles';
                    (doc.head || doc.body).appendChild(tempStyleTag);
                }
                tempStyleTag.textContent = cssContent;

                // CSS 변경 후 100vh 요소 높이 재계산 + iframe 높이 업데이트
                const w = parseInt(iframe.style.width) || 480;
                this.limitViewportHeightElements(iframe, w);
                iframe.style.height = this.calculateHeight(iframe, w) + 'px';
            } catch (e) {
                console.error('[MultiCanvasManager] syncCSSToAllCanvases: error syncing to iframe', idx, e);
            }
        });
    }

    /**
     * 현재 mainIframe의 zaemit-temp-styles CSSOM 규칙을 텍스트로 추출
     * enableMultiView() 시 srcdoc으로 생성되는 iframe에 CSSOM 규칙을 전달하기 위해 사용
     * (outerHTML은 CSSOM으로 추가된 규칙을 직렬화하지 않으므로 별도 추출 필요)
     * @returns {string} CSS text
     */
    _extractTempStylesCSS() {
        const mainFrame = this.mainIframe;
        if (!mainFrame?.contentDocument) return '';

        const tempStyle = mainFrame.contentDocument.getElementById('zaemit-temp-styles');
        if (!tempStyle?.sheet?.cssRules) return '';

        const baseRules = [];
        const mediaRules = [];

        for (const rule of tempStyle.sheet.cssRules) {
            if (rule.type === 4) { // CSSMediaRule
                const match = (rule.conditionText || rule.media?.mediaText || '').match(/max-width:\s*(\d+)px/i);
                const width = match ? parseInt(match[1]) : 0;
                mediaRules.push({ width, cssText: rule.cssText });
            } else {
                baseRules.push(rule.cssText);
            }
        }

        // 미디어쿼리 정렬: 큰 width → 작은 width (내림차순)
        mediaRules.sort((a, b) => b.width - a.width);

        return baseRules.join('\n') + '\n' + mediaRules.map(r => r.cssText).join('\n');
    }

    /**
     * iframe document의 zaemit-temp-styles에 CSS 텍스트 주입
     * @param {Document} doc - 대상 iframe의 document
     * @param {string} cssContent - 주입할 CSS 텍스트
     */
    _injectTempStyles(doc, cssContent) {
        if (!doc || !cssContent) return;

        let tempStyle = doc.getElementById('zaemit-temp-styles');
        if (!tempStyle) {
            tempStyle = doc.createElement('style');
            tempStyle.id = 'zaemit-temp-styles';
            (doc.head || doc.documentElement).appendChild(tempStyle);
        }
        tempStyle.textContent = cssContent;
    }

    /**
     * srcdoc용 HTML에 <base> 태그 주입
     * srcdoc의 base URL이 about:srcdoc이 되어 상대 경로가 깨지는 문제 해결
     * @param {string} html - 원본 HTML
     * @returns {string} base 태그가 주입된 HTML
     */
    _injectBaseTag(html) {
        if (!html) return html;

        // previewManager의 originalUrl에서 프로젝트 디렉토리 경로 추출
        const originalUrl = this.previewManager?.originalUrl;
        if (!originalUrl) return html;

        // '/projects/folder-name/index.html' → '/projects/folder-name/'
        const baseHref = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
        if (!baseHref) return html;

        const baseTag = `<base id="zaemit-editor-base" href="${baseHref}">`;

        // <head> 태그 바로 뒤에 삽입 (기존 base 태그가 있으면 스킵)
        if (html.includes('id="zaemit-editor-base"')) return html;

        const headMatch = html.match(/<head[^>]*>/i);
        if (headMatch) {
            const insertPos = html.indexOf(headMatch[0]) + headMatch[0].length;
            return html.slice(0, insertPos) + '\n' + baseTag + html.slice(insertPos);
        }

        return html;
    }

    /**
     * iframe에 HTML 콘텐츠 로드
     * srcdoc 사용 (이미지 등 리소스는 _resolveIframeImages에서 blob URL로 변환)
     */
    _loadIframeContent(iframe, html) {
        const processedHtml = this._injectBaseTag(html);
        iframe.srcdoc = processedHtml;
    }

    /**
     * 전체 HTML 동기화 (초기 로드, 구조 대량 변경 시 사용)
     */
    syncToAllCanvases() {
        // ★ _isInitialized만 체크: OFF 상태에서도 숨겨진 iframe에 HTML 동기화
        if (!this._isInitialized) return;
        try {
            const activeIdx = this.getActiveIndex();
            const activeIframe = this.iframes[activeIdx];
            if (!activeIframe?.contentDocument?.documentElement) return;

            const html = '<!DOCTYPE html>\n' + activeIframe.contentDocument.documentElement.outerHTML;

            this.iframes.forEach((f, i) => {
                // 활성 iframe만 제외 (숨겨진 iframe에도 동기화 - HTML 파일은 하나)
                if (i === activeIdx) return;

                // 현재 높이 보존
                const currentHeight = f.style.height;

                this._loadIframeContent(f, html);
                f.onload = () => {
                    const w = parseInt(f.style.width);
                    try {
                        // ★ 선택 하이라이트가 동기화된 iframe에 따라오지 않도록 제거
                        f.contentDocument.querySelectorAll('.editor-highlight').forEach(
                            el => el.classList.remove('editor-highlight')
                        );
                        this.previewManager?.injectStylesTo(f.contentDocument);
                        this.limitViewportHeightElements(f, w);
                        this._hideIframeScrollbar(f);
                        f.contentDocument.addEventListener('wheel', e => {
                            e.preventDefault();
                            if (e.ctrlKey) {
                                const z = this.zoomManager?.zoomLevel || 1;
                                const frameRect = f.getBoundingClientRect();
                                const screenX = frameRect.left + e.clientX * z;
                                const screenY = frameRect.top + e.clientY * z;
                                this.zoom(e.deltaY, screenX, screenY);
                            } else {
                                this.pan(e.deltaY, e.deltaX);
                            }
                        }, { passive: false });
                        this._attachIframePanHandlers(f);
                        this._attachIframeTouchHandlers(f);
                        this._attachEditListeners(f);
                    } catch(e) {}
                    // 100vh 제한 후 높이 재계산 (srcdoc 리로드 후 CSS 재적용됨)
                    this.limitViewportHeightElements(f, w);
                    f.style.height = this.calculateHeight(f, w) + 'px';
                };
            });
        } catch(e) {}
    }

    getActiveIframe() { return this.iframes[this._activeIndex] || this.iframes[0] || this.mainIframe; }
    isEnabled() { return this.isMultiViewEnabled; }

    // 현재 활성 뷰모드 인덱스 반환
    getActiveIndex() {
        // ViewModeManager에서 현재 선택된 뷰모드 버튼 찾기
        const buttons = this.viewModeManager?.getViewModeButtons() || [];
        for (let i = 0; i < buttons.length; i++) {
            if (buttons[i].classList.contains('active')) {
                return i;
            }
        }
        return 0;
    }

    // 선택된 뷰모드 iframe을 화면 중앙에 배치
    centerActiveIframe() {
        const panel = document.querySelector('.preview-panel');
        if (!panel || !this.iframes.length) return;

        const activeIdx = this.getActiveIndex();
        const iframe = this.iframes[activeIdx];
        if (!iframe) return;

        // iframe의 left와 width (absolute 배치이므로 style에서 가져옴)
        const iframeLeft = parseFloat(iframe.style.left) || 0;
        const iframeWidth = parseFloat(iframe.style.width) || iframe.offsetWidth;

        // iframe 중심 좌표
        const iframeCenterX = iframeLeft + iframeWidth / 2;

        // panel 중심 좌표
        const panelCenterX = panel.clientWidth / 2;

        // panX 계산: iframe 중심이 panel 중심에 오도록
        // zoom=1 기준이므로 그대로 계산
        this.panX = panelCenterX - iframeCenterX;
        this.panY = 0;

        this.applyTransform();
    }

    /**
     * 뷰 리셋: 줌 100%, 선택된 iframe 중앙 정렬, top 0
     */
    resetView() {
        const panel = document.querySelector('.preview-panel');
        if (!panel || !this.iframes.length) return;

        const activeIdx = this.getActiveIndex();
        const iframe = this.iframes[activeIdx];
        if (!iframe) return;

        // 1. 줌 100%로 리셋
        if (this.zoomManager) {
            this.zoomManager.zoomLevel = 1;
        }

        // 2. 선택된 iframe 중앙 정렬
        const iframeLeft = parseFloat(iframe.style.left) || 0;
        const iframeWidth = parseFloat(iframe.style.width) || iframe.offsetWidth;
        const iframeCenterX = iframeLeft + iframeWidth / 2;
        const panelCenterX = panel.clientWidth / 2;

        this.panX = panelCenterX - iframeCenterX;

        // 3. Top 0
        this.panY = 0;

        // 4. transform 적용
        this.applyTransform();

        // 5. 줌 인디케이터 업데이트
        this.zoomManager?.updateZoomIndicator();
    }

    // 리사이즈 핸들 생성
    _createResizeHandles() {
        if (this._resizeHandles) return; // 이미 생성됨

        this._resizeHandles = {
            left: document.createElement('div'),
            right: document.createElement('div'),
            bottom: document.createElement('div')
        };

        this._resizeHandles.left.className = 'multicanvas-resize-handle multicanvas-resize-handle-left';
        this._resizeHandles.right.className = 'multicanvas-resize-handle multicanvas-resize-handle-right';
        this._resizeHandles.bottom.className = 'multicanvas-resize-handle multicanvas-resize-handle-bottom';

        Object.values(this._resizeHandles).forEach(handle => {
            this.container.appendChild(handle);
        });

        this._setupResizeDrag();
    }

    // 리사이즈 핸들 위치 업데이트
    _updateResizeHandles() {
        if (!this._resizeHandles || !this.iframes.length) return;

        const activeIdx = this.getActiveIndex();
        const iframe = this.iframes[activeIdx];
        if (!iframe) return;

        const left = parseFloat(iframe.style.left) || 0;
        const width = parseFloat(iframe.style.width) || iframe.offsetWidth;
        const height = parseFloat(iframe.style.height) || iframe.offsetHeight;

        // 좌측 핸들 (iframe 좌측 경계)
        this._resizeHandles.left.style.left = left + 'px';
        this._resizeHandles.left.style.top = '0px';
        this._resizeHandles.left.style.height = height + 'px';

        // 우측 핸들 (iframe 우측 경계)
        this._resizeHandles.right.style.left = (left + width - 4) + 'px';
        this._resizeHandles.right.style.top = '0px';
        this._resizeHandles.right.style.height = height + 'px';

        // 하단 핸들 (iframe 하단 경계)
        this._resizeHandles.bottom.style.left = left + 'px';
        this._resizeHandles.bottom.style.top = (height - 4) + 'px';
        this._resizeHandles.bottom.style.width = width + 'px';
    }

    // 리사이즈 드래그 핸들러 설정
    _setupResizeDrag() {
        if (!this._resizeHandles) return;

        const setupDrag = (handle, direction) => {
            let startX, startY, startWidth, startHeight, startLeft;
            let activeIdx;
            let activePlaceholder;
            let isDragging = false;

            const onMouseDown = (e) => {
                e.preventDefault();
                e.stopPropagation();

                activeIdx = this.getActiveIndex();
                const activeIframe = this.iframes[activeIdx];
                if (!activeIframe) return;

                isDragging = true;
                this._isResizing = true; // 리사이즈 중 플래그
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseFloat(activeIframe.style.width) || activeIframe.offsetWidth;
                startHeight = parseFloat(activeIframe.style.height) || activeIframe.offsetHeight;
                startLeft = parseFloat(activeIframe.style.left) || 0;

                handle.classList.add('active');
                this.container.classList.add('resizing');

                // 저사양 PC에서만 플레이스홀더 생성
                if (this._usePlaceholders) {
                    this._createPlaceholders();
                    activePlaceholder = this._placeholders[activeIdx];
                } else {
                    activePlaceholder = null;
                }

                // window 레벨 + capture로 빠른 마우스 움직임 대응
                window.addEventListener('mousemove', onMouseMove, true);
                window.addEventListener('mouseup', onMouseUp, true);
            };

            const onMouseMove = (e) => {
                if (!isDragging) return;

                e.preventDefault();
                e.stopPropagation();

                const activeIframe = this.iframes[activeIdx];
                const zoom = this.zoomManager?.zoomLevel || 1;
                const deltaX = (e.clientX - startX) / zoom;
                const deltaY = (e.clientY - startY) / zoom;

                // 플레이스홀더 또는 iframe 직접 업데이트
                const target = activePlaceholder || activeIframe;

                let currentWidth;
                if (direction === 'left') {
                    // 좌측: 너비 줄이고, left 증가
                    currentWidth = Math.max(200, startWidth - deltaX);

                    // 이전 iframe보다 작아야 하고, 다음 iframe보다 커야 함
                    currentWidth = this._clampWidthByNeighbors(activeIdx, currentWidth);

                    const widthDiff = startWidth - currentWidth;
                    target.style.width = currentWidth + 'px';
                    target.style.left = (startLeft + widthDiff) + 'px';
                } else if (direction === 'right') {
                    // 우측: 너비만 증가
                    currentWidth = Math.max(200, startWidth + deltaX);

                    // 이전 iframe보다 작아야 하고, 다음 iframe보다 커야 함
                    currentWidth = this._clampWidthByNeighbors(activeIdx, currentWidth);

                    target.style.width = currentWidth + 'px';
                } else if (direction === 'bottom') {
                    // 하단: 높이만 증가
                    const newHeight = Math.max(200, startHeight + deltaY);
                    target.style.height = newHeight + 'px';
                }

                // 드래그 중 viewMode 버튼에 너비 표시
                if (currentWidth !== undefined) {
                    this.viewModeManager?.updateBreakpointWidthDisplay(activeIdx, currentWidth);
                }

                // 플레이스홀더 사용 시 플레이스홀더 기준, 아니면 iframe 기준으로 핸들 위치 업데이트
                if (activePlaceholder) {
                    this._updateResizeHandlesFromPlaceholder(activePlaceholder);
                } else {
                    this._updateResizeHandles();
                }
            };

            const onMouseUp = (e) => {
                if (!isDragging) return;

                e.preventDefault();
                e.stopPropagation();

                isDragging = false;
                this._isResizing = false; // 리사이즈 완료
                handle.classList.remove('active');
                this.container.classList.remove('resizing');
                window.removeEventListener('mousemove', onMouseMove, true);
                window.removeEventListener('mouseup', onMouseUp, true);

                // 플레이스홀더 사용 시 크기를 iframe에 적용
                if (activePlaceholder) {
                    const activeIframe = this.iframes[activeIdx];
                    activeIframe.style.width = activePlaceholder.style.width;
                    activeIframe.style.height = activePlaceholder.style.height;
                    activeIframe.style.left = activePlaceholder.style.left;

                    // 플레이스홀더 제거 및 iframe 복원
                    this._removePlaceholders();
                }

                // 너비 변경 시 다른 iframe들 위치 재조정 및 viewMode 버튼 동기화
                if (direction === 'left' || direction === 'right') {
                    const newWidth = parseFloat(this.iframes[activeIdx].style.width);

                    // viewMode 버튼 너비 업데이트
                    this.viewModeManager?.updateBreakpointWidth(activeIdx, newWidth);

                    this._recalculateIframePositions();
                }

                this._updateResizeHandles();
            };

            handle.addEventListener('mousedown', onMouseDown);
        };

        setupDrag(this._resizeHandles.left, 'left');
        setupDrag(this._resizeHandles.right, 'right');
        setupDrag(this._resizeHandles.bottom, 'bottom');
    }

    /**
     * iframe 너비를 인접 iframe 기준으로 제한
     * - 이전 iframe(왼쪽)보다 작아야 함 (최소 1px 차이)
     * - 다음 iframe(오른쪽)보다 커야 함 (최소 1px 차이)
     * 미디어쿼리가 연속적으로 적용되도록 함
     * @param {number} idx - 현재 iframe 인덱스
     * @param {number} width - 원하는 너비
     * @returns {number} 제한된 너비
     */
    _clampWidthByNeighbors(idx, width) {
        // 이전 iframe (더 큰 너비) 확인
        if (idx > 0) {
            const prevIframe = this.iframes[idx - 1];
            const prevWidth = parseFloat(prevIframe.style.width) || prevIframe.offsetWidth;
            // 이전 iframe보다 최소 1px 작아야 함
            if (width >= prevWidth) {
                width = prevWidth - 1;
            }
        }

        // 다음 iframe (더 작은 너비) 확인
        if (idx < this.iframes.length - 1) {
            const nextIframe = this.iframes[idx + 1];
            const nextWidth = parseFloat(nextIframe.style.width) || nextIframe.offsetWidth;
            // 다음 iframe보다 최소 1px 커야 함
            if (width <= nextWidth) {
                width = nextWidth + 1;
            }
        }

        return Math.max(200, width); // 최소 200px 보장
    }

    // 드래그용 플레이스홀더 생성
    _createPlaceholders() {
        if (this._placeholders) return;

        this._placeholders = [];

        this.iframes.forEach((iframe, index) => {
            const placeholder = document.createElement('div');
            placeholder.className = 'multicanvas-placeholder';
            placeholder.style.cssText = `
                position: absolute;
                left: ${iframe.style.left};
                width: ${iframe.style.width};
                height: ${iframe.style.height};
                background: #1a1a2e;
                border: 2px dashed #00d4ff;
                box-sizing: border-box;
                pointer-events: none;
            `;

            // 너비 라벨 표시
            const label = document.createElement('div');
            label.className = 'multicanvas-placeholder-label';
            label.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #00d4ff;
                font-size: 24px;
                font-weight: bold;
                opacity: 0.8;
            `;
            label.textContent = parseInt(iframe.style.width) + 'px';
            placeholder.appendChild(label);

            this.container.appendChild(placeholder);
            this._placeholders.push(placeholder);

            // iframe 숨기기
            iframe.style.visibility = 'hidden';
        });
    }

    // 플레이스홀더 제거 및 iframe 복원
    _removePlaceholders() {
        if (!this._placeholders) return;

        this._placeholders.forEach(p => p.remove());
        this._placeholders = null;

        // iframe 복원
        this.iframes.forEach(iframe => {
            iframe.style.visibility = '';
        });
    }

    // 플레이스홀더 기준으로 리사이즈 핸들 위치 업데이트
    _updateResizeHandlesFromPlaceholder(placeholder) {
        if (!this._resizeHandles || !placeholder) return;

        const left = parseFloat(placeholder.style.left) || 0;
        const width = parseFloat(placeholder.style.width) || 0;
        const height = parseFloat(placeholder.style.height) || 0;

        // 좌측 핸들
        this._resizeHandles.left.style.left = left + 'px';
        this._resizeHandles.left.style.height = height + 'px';

        // 우측 핸들
        this._resizeHandles.right.style.left = (left + width - 4) + 'px';
        this._resizeHandles.right.style.height = height + 'px';

        // 하단 핸들
        this._resizeHandles.bottom.style.left = left + 'px';
        this._resizeHandles.bottom.style.top = (height - 4) + 'px';
        this._resizeHandles.bottom.style.width = width + 'px';

        // 플레이스홀더 라벨 업데이트
        const label = placeholder.querySelector('.multicanvas-placeholder-label');
        if (label) {
            label.textContent = Math.round(width) + 'px';
        }
    }

    /**
     * 활성 iframe에 테두리 하이라이트 표시
     * 멀티뷰 모드에서 현재 편집 중인 iframe을 시각적으로 구분
     */
    _updateActiveIframeHighlight() {
        if (!this.isMultiViewEnabled || !this.iframes?.length) return;

        const activeIdx = this.getActiveIndex();
        this.iframes.forEach((iframe, i) => {
            if (i === activeIdx) {
                iframe.style.outline = '3px solid #3b82f6';
                iframe.style.outlineOffset = '-3px';
            } else {
                iframe.style.outline = '';
                iframe.style.outlineOffset = '';
            }
        });
    }

    // iframe 선택 시 viewmode 버튼과 동기화
    _selectIframe(index) {
        const buttons = this.viewModeManager?.getViewModeButtons();
        if (!buttons || !buttons[index]) return;

        // 이미 해당 버튼이 active면 무시
        if (buttons[index].classList.contains('active')) {
            return;
        }

        // viewmode 버튼 클릭하여 동기화 (flash 없이)
        this.viewModeManager?.setViewMode(buttons[index], true, false);
    }

    // iframe 로딩 오버레이 생성
    _createIframeLoader(iframe) {
        const loader = document.createElement('div');
        loader.className = 'multicanvas-loader';
        loader.style.cssText = `
            position: absolute;
            left: ${iframe.style.left};
            width: ${iframe.style.width};
            height: ${iframe.style.height};
            background: rgba(26, 26, 46, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        `;

        // 스피너
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 40px;
            height: 40px;
            border: 3px solid rgba(0, 212, 255, 0.3);
            border-top-color: #00d4ff;
            border-radius: 50%;
            animation: multicanvas-spin 0.8s linear infinite;
        `;
        loader.appendChild(spinner);

        // 스피너 애니메이션 (없으면 추가)
        if (!document.getElementById('multicanvas-loader-style')) {
            const style = document.createElement('style');
            style.id = 'multicanvas-loader-style';
            style.textContent = `
                @keyframes multicanvas-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        this.container.appendChild(loader);
        return loader;
    }

    // 리사이즈 핸들 일시적으로 보여주기
    _flashResizeHandles() {
        if (!this._resizeHandles) return;

        Object.values(this._resizeHandles).forEach(handle => {
            handle.classList.add('flash');
        });

        // 0.2초 후 사라짐
        setTimeout(() => {
            Object.values(this._resizeHandles).forEach(handle => {
                handle.classList.remove('flash');
            });
        }, 200);
    }

    // 모든 iframe의 left 위치 재계산
    _recalculateIframePositions() {
        const gap = 120;
        let currentLeft = 0;

        this.iframes.forEach((iframe) => {
            iframe.style.left = currentLeft + 'px';
            const width = parseFloat(iframe.style.width) || iframe.offsetWidth;
            currentLeft += width + gap;
        });

        this._updateResizeHandles();
    }

    // breakpoint 추가 시 iframe 추가
    _addIframeForBreakpoint(width) {
        if (!this.container) return;

        const html = this.previewManager?.getHTML();
        const buttons = this.viewModeManager?.getViewModeButtons() || [];

        // 새 버튼의 인덱스 찾기
        let newIndex = -1;
        for (let i = 0; i < buttons.length; i++) {
            if (parseInt(buttons[i].dataset.width) === width) {
                newIndex = i;
                break;
            }
        }
        if (newIndex === -1) return;

        // iframe 생성
        const iframe = document.createElement('iframe');
        iframe.style.width = width + 'px';
        iframe.dataset.index = newIndex;
        iframe.dataset.breakpointWidth = width; // ★ 보조 식별자 (삭제 시 정확한 매칭용)

        const range = this.getHeightRange(width);
        iframe.style.height = range.min + 'px';
        iframe.style.background = 'transparent';

        // PC 제외한 iframe은 높이 계산 완료 전까지 숨김
        if (width < 1200) {
            iframe.style.opacity = '0';
        }

        if (html) {
            this._loadIframeContent(iframe, html);
            iframe.onload = () => {
                try {
                    // ★ 선택 하이라이트가 새 iframe에 따라오지 않도록 제거
                    iframe.contentDocument.querySelectorAll('.editor-highlight').forEach(
                        el => el.classList.remove('editor-highlight')
                    );

                    this.previewManager?.injectStylesTo(iframe.contentDocument);

                    // ★ 메인 iframe의 CSSOM 규칙을 새 iframe에 주입
                    // srcdoc는 CSSOM 변경을 직렬화하지 않으므로, enableMultiView()와 동일하게
                    // _extractTempStylesCSS()로 추출한 CSS를 새 iframe에 주입해야 함
                    const tempCSS = this._extractTempStylesCSS();
                    if (tempCSS) {
                        this._injectTempStyles(iframe.contentDocument, tempCSS);
                    }

                    this.limitViewportHeightElements(iframe, width);
                    this._hideIframeScrollbar(iframe);
                    iframe.contentDocument.addEventListener('wheel', e => {
                        e.preventDefault();
                        if (e.ctrlKey) {
                            const z = this.zoomManager?.zoomLevel || 1;
                            const frameRect = iframe.getBoundingClientRect();
                            const screenX = frameRect.left + e.clientX * z;
                            const screenY = frameRect.top + e.clientY * z;
                            this.zoom(e.deltaY, screenX, screenY);
                        } else {
                            this.pan(e.deltaY, e.deltaX);
                        }
                    }, { passive: false });
                    this._attachIframePanHandlers(iframe);
                    this._attachIframeTouchHandlers(iframe);
                    // 편집 이벤트 리스너 연결 (클릭, 더블클릭, 컨텍스트메뉴, hover)
                    this._attachEditListeners(iframe);

                    // ★ iframe 준비 완료 후 이벤트 emit (VS Code 이미지 resolve 등에 활용)
                    // onload 내부에서 emit해야 contentDocument 접근 가능
                    this.emit('iframe:added', iframe);
                } catch(e) {
                    console.error('[MultiCanvasManager] _addIframeForBreakpoint onload error:', e);
                }

                // 높이 계산 함수 (100vh 제한 후 높이 계산)
                const calcAndSetHeight = () => {
                    this.limitViewportHeightElements(iframe, width);
                    const h = this.calculateHeight(iframe, width);
                    iframe.style.height = h + 'px';
                    this._updateResizeHandles();
                };

                // 스크롤 트리거 (lazy loading 유도) 후 높이 계산
                this._triggerScrollForLazyLoad(iframe, () => {
                    // PC(1200px 이상)는 바로 처리
                    if (width >= 1200) {
                        calcAndSetHeight();
                    } else {
                        // 로딩 오버레이 표시 (PC 제외)
                        const loader = this._createIframeLoader(iframe);
                        calcAndSetHeight();
                        // ★ rAF 2회 + setTimeout fallback으로 렌더링 완료 보장
                        let revealed = false;
                        const revealIframe = () => {
                            if (revealed) return;
                            revealed = true;
                            calcAndSetHeight();
                            loader.remove();
                            iframe.style.opacity = '';
                        };
                        // rAF 2회 시도 (일반적으로 충분)
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                revealIframe();
                            });
                        });
                        // ★ fallback: rAF가 지연되는 경우 대비 (복잡한 페이지, 저사양)
                        setTimeout(revealIframe, 500);
                    }
                });
            };
        }

        // 올바른 위치에 삽입 (인덱스에 따라)
        if (newIndex < this.iframes.length) {
            this.container.insertBefore(iframe, this.iframes[newIndex]);
            this.iframes.splice(newIndex, 0, iframe);
        } else {
            // 리사이즈 핸들 앞에 삽입
            if (this._resizeHandles) {
                this.container.insertBefore(iframe, this._resizeHandles.left);
            } else {
                this.container.appendChild(iframe);
            }
            this.iframes.push(iframe);
        }

        // 모든 iframe 인덱스 재설정
        this.iframes.forEach((f, i) => {
            f.dataset.index = i;
        });

        this._recalculateIframePositions();

        // 새 iframe에 활성 하이라이트 표시
        this._updateActiveIframeHighlight();
    }

    // breakpoint 삭제 시 iframe 삭제
    _removeIframeForBreakpoint(width) {
        if (!this.container) {
            console.warn('[MultiCanvasManager] _removeIframeForBreakpoint: container is null for width', width);
            return;
        }

        // 해당 너비의 iframe 찾기
        const targetWidth = String(width);

        // ★ 1차: dataset.breakpointWidth로 정확한 매칭 (zoom/소수점 문제 방지)
        let index = this.iframes.findIndex(iframe =>
            iframe.dataset.breakpointWidth === targetWidth
        );

        // ★ 2차 fallback: style.width 비교 (기존 로직)
        if (index === -1) {
            const numWidth = parseInt(width);
            index = this.iframes.findIndex(iframe =>
                Math.round(parseFloat(iframe.style.width)) === numWidth
            );
        }

        if (index === -1) {
            console.warn('[MultiCanvasManager] _removeIframeForBreakpoint: iframe not found for width', width);
            return;
        }

        // iframe 삭제
        const iframe = this.iframes[index];
        iframe.remove();
        this.iframes.splice(index, 1);

        // 모든 iframe 인덱스 재설정
        this.iframes.forEach((f, i) => {
            f.dataset.index = i;
        });

        this._recalculateIframePositions();

        // 삭제 후 활성 iframe 하이라이트 업데이트
        this._updateActiveIframeHighlight();
    }

    // 활성 뷰모드 설정 (외부에서 호출)
    setActiveIndex(index) {
        this._activeIndex = index;
        this._updateResizeHandles();
    }

    // 리사이즈 핸들 위치 업데이트 (외부 호출용)
    updateResizeHandles() {
        this._updateResizeHandles();
    }

    // 멀티뷰 토글 버튼 생성 (뷰모드 버튼 좌측에 배치)
    _setupToggleButton() {
        const viewModes = document.querySelector('.view-modes');
        if (!viewModes || this._toggleButton) return;

        this._toggleButton = document.createElement('button');
        this._toggleButton.className = 'multiview-toggle-btn active';
        this._toggleButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6" height="6" rx="1"/>
            <rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/>
            <rect x="9" y="9" width="6" height="6" rx="1"/>
        </svg>`;
        this._toggleButton.title = '멀티뷰 토글';
        this._toggleButton.addEventListener('click', () => {
            if (this.isMultiViewEnabled) {
                this.disableMultiView();
            } else {
                this.enableMultiView();
            }
        });

        viewModes.insertBefore(this._toggleButton, viewModes.firstChild);
    }

    _updateToggleButtonState() {
        if (!this._toggleButton) return;
        if (this.isMultiViewEnabled) {
            this._toggleButton.classList.add('active');
        } else {
            this._toggleButton.classList.remove('active');
        }
    }

    /**
     * mainIframe의 zaemit-temp-styles CSSOM을 대상 iframe에 복사
     * (멀티뷰 해제 시 원본 previewFrame으로 CSS 역동기화용)
     */
    _syncTempStylesTo(targetIframe) {
        const sourceDoc = this.mainIframe?.contentDocument;
        const targetDoc = targetIframe?.contentDocument;
        if (!sourceDoc || !targetDoc) return;

        const sourceTempStyle = sourceDoc.getElementById('zaemit-temp-styles');
        if (!sourceTempStyle?.sheet?.cssRules) return;

        let cssContent = '';
        for (let i = 0; i < sourceTempStyle.sheet.cssRules.length; i++) {
            cssContent += sourceTempStyle.sheet.cssRules[i].cssText + '\n';
        }

        let targetTempStyle = targetDoc.getElementById('zaemit-temp-styles');
        if (!targetTempStyle) {
            targetTempStyle = targetDoc.createElement('style');
            targetTempStyle.id = 'zaemit-temp-styles';
            (targetDoc.head || targetDoc.body).appendChild(targetTempStyle);
        }
        targetTempStyle.textContent = cssContent;
    }

    /**
     * mainIframe(원본 previewFrame) 기준으로 모든 멀티뷰 iframe DOM 재합치
     * 멀티뷰 재활성화 시 OFF 상태에서 변경된 HTML을 반영
     */
    _reconcileAllIframes() {
        const sourceIframe = this._originalMainIframe || this.mainIframe;
        if (!sourceIframe?.contentDocument?.body) return;

        const cleanHTML = this._getCleanBodyHTML(sourceIframe.contentDocument.body);

        this.iframes.forEach((iframe) => {
            if (iframe === sourceIframe) return;
            try {
                const doc = iframe.contentDocument;
                if (doc?.body) {
                    doc.body.innerHTML = cleanHTML;
                    const w = parseInt(iframe.style.width) || 480;
                    this.limitViewportHeightElements(iframe, w);
                    iframe.style.height = this.calculateHeight(iframe, w) + 'px';
                }
            } catch (e) {}
        });
    }

    disableMultiView() {
        if (!this.isMultiViewEnabled) return;
        this.isMultiViewEnabled = false;

        // ★ 멀티뷰 중 변경된 CSS를 원본 previewFrame에 반영 (복원 전)
        if (this._originalMainIframe && this.mainIframe !== this._originalMainIframe) {
            this._syncTempStylesTo(this._originalMainIframe);
        }

        // ★ mainIframe을 원본으로 복원 (싱글뷰에서도 CSS 적용이 정상 동작하도록)
        if (this._originalMainIframe) {
            this.mainIframe = this._originalMainIframe;
            this._originalMainIframe = null;
            console.log('[MultiCanvasManager] mainIframe restored to original');
        }

        // 현재 선택된 뷰모드 인덱스 가져오기
        const activeIdx = this.getActiveIndex();
        const activeIframe = this.iframes[activeIdx];

        // 활성 iframe 하이라이트 제거 + 선택된 뷰모드 외 iframe들만 숨김
        this.iframes.forEach((iframe, i) => {
            iframe.style.outline = '';
            iframe.style.outlineOffset = '';
            if (i !== activeIdx) {
                iframe.style.display = 'none';
            }
        });

        // ★ preview-wrapper 복원 (enableMultiView에서 display:none 처리됨)
        const wrapper = document.querySelector('.preview-wrapper');
        if (wrapper) wrapper.style.display = '';

        // ★ 멀티뷰 container 숨기기
        if (this.container) this.container.style.display = 'none';

        // ★ ZoomManager pan 상태 동기화 (MCM의 pan 상태 → ZoomManager)
        if (this.zoomManager) {
            this.zoomManager.panOffsetX = this.panX || 0;
            this.zoomManager.panOffsetY = this.panY || 0;
            this.zoomManager.previewFrame.style.transformOrigin = '0 0';
            this.zoomManager.previewFrame.style.transform =
                `translate(${this.panX || 0}px, ${this.panY || 0}px) scale(${this.zoomManager.zoomLevel})`;
        }

        // 현재 선택된 iframe 정보와 함께 이벤트 발생
        // (각 모듈이 현재 보이는 iframe을 계속 참조해야 선택/오버레이 등이 정상 동작)
        this.emit('multiview:disabled', { activeIframe });

        // 토글 버튼 상태 업데이트
        this._updateToggleButtonState();
    }

    destroy() {
        this._removeGlobalHandlers();
        this.container?.remove();
        this.iframes = [];
        this._isInitialized = false;
    }
}

export default MultiCanvasManager;
