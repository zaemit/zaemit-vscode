import EventEmitter from './EventEmitter.js';

class PreviewManager extends EventEmitter {
    constructor(previewFrameId) {
        super();
        this.previewFrame = document.getElementById(previewFrameId);
        this.mainFrame = this.previewFrame; // 메인 iframe 저장
        this.activeFrame = this.previewFrame; // 활성 iframe (멀티뷰용)
        this.isReady = false;
        this.loadHandlerAttached = false;
        this.originalUrl = null; // 원본 프로젝트 URL 저장
        this.retryTimer = null; // 재시도 타이머 추적
        this.isPanningMode = false; // 패닝 모드 상태
        this.zoomManager = null; // ZoomManager 참조

        this.init();
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        if (this.activeFrame === iframe) return;
        this.activeFrame = iframe || this.mainFrame;
    }

    /**
     * 활성 iframe 반환 (멀티뷰 지원)
     * @returns {HTMLIFrameElement}
     */
    getActiveIframe() {
        return this.activeFrame;
    }

    /**
     * 메인 iframe으로 복원
     */
    resetToMainFrame() {
        this.activeFrame = this.mainFrame;
    }

    init() {
        // Always attach load event for future loads
        this.previewFrame.addEventListener('load', () => this.onFrameLoad());

        // Check if iframe is already loaded (has content)
        this.checkIfAlreadyLoaded();
    }

    /**
     * Check if iframe is already loaded and trigger onFrameLoad if so
     */
    checkIfAlreadyLoaded() {
        try {
            const doc = this.previewFrame.contentDocument || this.previewFrame.contentWindow?.document;
            // If document exists and has a body with content, it's already loaded
            if (doc && doc.body && doc.readyState === 'complete') {
                // Delay slightly to ensure all modules are initialized
                setTimeout(() => {
                    if (!this.isReady) {
                        this.onFrameLoad();
                    }
                }, 100);
            }
        } catch (e) {
            // Cross-origin or not loaded yet - will be handled by load event
        }
    }

    onFrameLoad() {
        // Prevent duplicate initialization
        if (this.isReady) return;

        // Wait for iframe body to have content
        const doc = this.getDocument();
        if (!doc || !doc.body || doc.body.children.length === 0) {
            // 기존 재시도 타이머가 있으면 취소
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
            }
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                // 이미 ready 상태면 재시도하지 않음
                if (!this.isReady) {
                    this.onFrameLoad();
                }
            }, 100);
            return;
        }

        // 재시도 타이머가 있으면 취소 (이미 성공했으므로)
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        this.isReady = true;
        this.injectStyles();
        this.limitViewportHeightElements();
        this.attachListeners();
        this.emit('preview:loaded');
    }

    injectStyles() {
        try {
            const doc = this.getDocument();
            this.injectStylesTo(doc);
        } catch (err) {
            console.error('Cannot inject styles:', err);
        }
    }

    /**
     * 특정 document에 에디터 스타일 주입 (멀티캔버스 지원)
     */
    injectStylesTo(doc) {
        if (!doc) return;
        try {
            // 이미 주입되어 있으면 스킵
            if (doc.getElementById('editor-injected-styles')) return;

            const style = doc.createElement('style');
            style.id = 'editor-injected-styles';
            // Only inject hover style - selection is handled by OverlayManager
            style.textContent = `
                /* body 배경 폴백 - specificity 0이므로 어떤 CSS 규칙이든 자연스럽게 오버라이드 */
                :where(body) { background-color: #fff; }

                /* Custom scrollbar - 어두운 트랙, 연한 회색 썸 */
                ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                ::-webkit-scrollbar-track {
                    background: #1e1e1e;
                }
                ::-webkit-scrollbar-thumb {
                    background: #4a4a4a;
                    border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: #5a5a5a;
                }
                ::-webkit-scrollbar-corner {
                    background: #1e1e1e;
                }
                /* Firefox scrollbar */
                html {
                    scrollbar-width: thin;
                    scrollbar-color: #4a4a4a #1e1e1e;
                    overscroll-behavior: none;
                }

                /* 편집 모드 전에는 텍스트 선택/커서 차단 */
                body:not(.zaemit-text-editing) * {
                    user-select: none !important;
                    -webkit-user-select: none !important;
                    cursor: default !important;
                }
                body:not(.zaemit-text-editing) a,
                body:not(.zaemit-text-editing) button,
                body:not(.zaemit-text-editing) input,
                body:not(.zaemit-text-editing) textarea,
                body:not(.zaemit-text-editing) select {
                    cursor: default !important;
                }
                /* 텍스트 편집 모드에서는 정상 커서 */
                body.zaemit-text-editing [contenteditable="true"],
                body.zaemit-text-editing [contenteditable="true"] * {
                    user-select: auto !important;
                    -webkit-user-select: auto !important;
                    cursor: text !important;
                }
                .editor-hover {
                    outline: 1px dashed #667eea !important;
                    outline-offset: 1px;
                }
                /* Prevent ::before and ::after from blocking clicks */
                *::before, *::after {
                    pointer-events: none !important;
                }
                /* Exception: Table cell resize handles need pointer-events */
                td::after, th::after {
                    pointer-events: auto !important;
                }
                /* Table cell selection styles - 스타일은 TableEditor.js의 ::before에서 처리 */
                .table-cell-editing {
                    background: rgba(255, 255, 255, 0.95) !important;
                    outline: 2px solid #10b981 !important;
                    outline-offset: -2px;
                }
                .table-selecting-mode {
                    user-select: none !important;
                    -webkit-user-select: none !important;
                }
                .table-selecting-mode td,
                .table-selecting-mode th {
                    cursor: cell !important;
                }
                /* Remove contenteditable outline */
                [contenteditable]:focus,
                [contenteditable="true"]:focus,
                .editor-editable:focus {
                    outline: none !important;
                }
                /* 텍스트 편집 모드에서만 텍스트 커서 사용 */
                .editor-editable {
                    cursor: text !important;
                }
                /* 패닝 모드에서는 grab 커서 강제 적용 (html, body 모두 적용) */
                html.panning-mode,
                html.panning-mode *,
                body.panning-mode,
                body.panning-mode * {
                    cursor: grab !important;
                }
                /* 패닝 드래그 중에는 grabbing 커서 */
                html.panning-grabbing,
                html.panning-grabbing *,
                body.panning-grabbing,
                body.panning-grabbing * {
                    cursor: grabbing !important;
                }
                /* 줌 모드에서는 줌 커서 강제 적용 (html, body 모두 적용) */
                html.zooming-in,
                html.zooming-in *,
                body.zooming-in,
                body.zooming-in * {
                    cursor: zoom-in !important;
                }
                html.zooming-out,
                html.zooming-out *,
                body.zooming-out,
                body.zooming-out * {
                    cursor: zoom-out !important;
                }
                .editor-multi-select-overlay {
                    position: absolute;
                    pointer-events: none;
                    border: 2px dashed #667eea;
                    background: rgba(102, 126, 234, 0.05);
                    z-index: 9999;
                }
                /* Gap overlay styles */
                .editor-gap-area {
                    position: absolute;
                    background: rgba(138, 43, 226, 0.2);
                    pointer-events: auto;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .editor-gap-area:hover {
                    background: rgba(138, 43, 226, 0.4);
                }
                .editor-gap-area.horizontal {
                    cursor: ew-resize;
                }
                .editor-gap-area.vertical {
                    cursor: ns-resize;
                }
                .editor-gap-area.dragging {
                    background: rgba(138, 43, 226, 0.5);
                }
                .editor-gap-tooltip {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: 10001;
                }
                /* Context menu styles */
                .editor-context-menu {
                    position: fixed;
                    background: #1e1e2e;
                    border: 1px solid #3a3a4a;
                    border-radius: 6px;
                    padding: 4px 0;
                    min-width: 180px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                    z-index: 99999;
                    display: none;
                }
                .editor-context-menu.visible {
                    display: block;
                }
                .editor-context-menu-item {
                    display: flex;
                    align-items: center;
                    padding: 8px 12px;
                    cursor: pointer;
                    color: #e0e0e0;
                    font-size: 13px;
                }
                .editor-context-menu-item:hover {
                    background: rgba(102, 126, 234, 0.2);
                }
                .editor-context-menu-item.disabled {
                    opacity: 0.4;
                    pointer-events: none;
                }
                .editor-context-menu-item.danger {
                    color: #ff6b6b;
                }
                .editor-context-menu-item .icon {
                    width: 20px;
                    margin-right: 8px;
                }
                .editor-context-menu-item .shortcut {
                    margin-left: auto;
                    color: #888;
                    font-size: 11px;
                }
                .editor-context-menu-divider {
                    height: 1px;
                    background: #3a3a4a;
                    margin: 4px 0;
                }

                /* ========== 에디터 모드 100vh 제한 ========== */
                /* 인라인 스타일에 100vh가 명시된 요소만 제한 - viewport height로 고정 */
                [style*="height: 100vh"],
                [style*="height:100vh"],
                [style*="height: 100svh"],
                [style*="height:100svh"],
                [style*="height: 100dvh"],
                [style*="height:100dvh"],
                [style*="min-height: 100vh"],
                [style*="min-height:100vh"],
                [style*="min-height: 100svh"],
                [style*="min-height:100svh"],
                [style*="min-height: 100dvh"],
                [style*="min-height:100dvh"] {
                    height: auto !important;
                    min-height: 100vh !important;
                    max-height: 100vh !important;
                }

                /* ========== 스크롤 애니메이션 초기화 (에디터 모드) ========== */
                /* AI 생성 코드의 스크롤 모션 초기 상태를 무력화하여 에디터에서 요소 표시 */

                /* opacity:0 + transition/transform 조합 = 스크롤 애니메이션 초기 상태 */
                [style*="opacity: 0"][style*="transition"],
                [style*="opacity:0"][style*="transition"],
                [style*="opacity: 0"][style*="transform"],
                [style*="opacity:0"][style*="transform"] {
                    opacity: 1 !important;
                    transform: none !important;
                    visibility: visible !important;
                }

                /* visibility:hidden + transition 조합 */
                [style*="visibility: hidden"][style*="transition"],
                [style*="visibility:hidden"][style*="transition"] {
                    visibility: visible !important;
                    opacity: 1 !important;
                }

                /* clip-path 기반 숨김 + transition */
                [style*="clip-path"][style*="transition"] {
                    clip-path: none !important;
                }

                /* filter:blur + opacity:0 */
                [style*="filter"][style*="opacity: 0"],
                [style*="filter"][style*="opacity:0"] {
                    filter: none !important;
                    opacity: 1 !important;
                }

                /* ========== CSS 클래스 기반 등장 애니메이션 강제 표시 ========== */
                /* JS 스캔으로 opacity:0인 요소에 추가되는 클래스 (zaemit- 접두사 → 저장 시 자동 제거) */
                .zaemit-force-visible {
                    opacity: 1 !important;
                    visibility: visible !important;
                    transform: none !important;
                }
            `;
            doc.head.appendChild(style);

            // 스페이스바 키보드 이벤트를 상위 document로 전달하는 스크립트 주입
            if (!doc.getElementById('editor-injected-script')) {
                const script = doc.createElement('script');
                script.id = 'editor-injected-script';
                script.textContent = `
                    // ★ IntersectionObserver 래핑: observe 즉시 isIntersecting=true 콜백
                    // 에디터에서 스크롤 애니메이션 요소가 숨겨지지 않도록 함
                    (function() {
                        var OrigIO = window.IntersectionObserver;
                        if (!OrigIO) return;
                        window.IntersectionObserver = function(callback, options) {
                            var instance = new OrigIO(callback, options);
                            var origObserve = instance.observe.bind(instance);
                            instance.observe = function(target) {
                                origObserve(target);
                                requestAnimationFrame(function() {
                                    try {
                                        callback([{
                                            target: target,
                                            isIntersecting: true,
                                            intersectionRatio: 1.0,
                                            boundingClientRect: target.getBoundingClientRect(),
                                            intersectionRect: target.getBoundingClientRect(),
                                            rootBounds: null,
                                            time: performance.now()
                                        }], instance);
                                    } catch(e) {}
                                });
                            };
                            return instance;
                        };
                        window.IntersectionObserver.prototype = OrigIO.prototype;
                    })();

                    (function() {
                        var isSpacePressed = false;

                        // 부모에서 스페이스바 상태 브로드캐스트 수신
                        window.addEventListener('message', function(e) {
                            if (e.data && e.data.type === 'editor-space-state') {
                                isSpacePressed = e.data.isPressed;
                            }
                        });

                        document.addEventListener('keydown', function(e) {
                            if (e.code === 'Space') {
                                var activeEl = document.activeElement;
                                var isTextInput = activeEl && (
                                    activeEl.isContentEditable ||
                                    activeEl.classList.contains('editor-editable') ||
                                    activeEl.classList.contains('quick-text-edit') ||
                                    activeEl.tagName === 'INPUT' ||
                                    activeEl.tagName === 'TEXTAREA'
                                );
                                if (!isTextInput) {
                                    isSpacePressed = true;
                                    e.preventDefault();
                                    window.parent.postMessage({ type: 'editor-space-down' }, '*');
                                }
                            }
                        });

                        document.addEventListener('keyup', function(e) {
                            if (e.code === 'Space') {
                                isSpacePressed = false;
                                window.parent.postMessage({ type: 'editor-space-up' }, '*');
                            }
                        });

                        // 스페이스바 눌린 상태에서 클릭/링크 차단 (capture phase)
                        document.addEventListener('click', function(e) {
                            if (isSpacePressed) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }, true);
                    })();

                    // ★ CSS 클래스 기반 opacity:0 요소 강제 표시 (등장 애니메이션 무력화)
                    // 인라인 스타일이 아닌 CSS 클래스로 opacity:0이 설정된 요소도 처리
                    (function() {
                        function forceShowHidden() {
                            var body = document.body;
                            if (!body) return;
                            var els = body.querySelectorAll('*');
                            for (var i = 0; i < els.length; i++) {
                                var el = els[i];
                                var tag = el.tagName;
                                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' ||
                                    tag === 'META' || tag === 'BR' || tag === 'HR' || tag === 'NOSCRIPT') continue;
                                try {
                                    var cs = getComputedStyle(el);
                                    if (cs.display === 'none') continue;
                                    if (parseFloat(cs.opacity) < 0.1) {
                                        el.classList.add('zaemit-force-visible');
                                    }
                                } catch(e) {}
                            }
                        }

                        // 페이지 로드 후 CSS 애니메이션 완료 대기 후 스캔
                        if (document.readyState === 'complete') {
                            setTimeout(forceShowHidden, 500);
                        } else {
                            window.addEventListener('load', function() {
                                setTimeout(forceShowHidden, 500);
                            });
                        }

                        // body 교체 후 외부에서 재호출할 수 있도록 전역 함수 등록
                        window._bazixForceShowHidden = forceShowHidden;
                    })();
                `;
                doc.head.appendChild(script);
            }
        } catch (err) {
            console.error('Cannot inject styles:', err);
        }
    }

    /**
     * CSS 클래스 기반 등장 애니메이션 요소를 강제로 표시
     * body 교체 후 재호출하여 새로운 opacity:0 요소도 처리
     * @param {Document} doc - 대상 document (지정하지 않으면 활성 iframe)
     */
    forceShowAnimationElements(doc) {
        if (!doc) {
            try {
                doc = this.getDocument();
            } catch (e) { return; }
        }
        if (!doc) return;
        try {
            const win = doc.defaultView;
            if (win && typeof win._bazixForceShowHidden === 'function') {
                win._bazixForceShowHidden();
            }
        } catch (e) {
            // iframe 접근 불가 시 무시
        }
    }

    /**
     * 100vh 사용 요소들의 높이를 에디터에서 편집 가능하도록 제한
     * CSS 파일에서 정의된 100vh는 속성 선택자로 잡을 수 없으므로 JS로 처리
     */
    /**
     * 뷰포트 너비에 따른 적정 높이 범위 계산
     * MultiCanvasManager.getHeightRange()와 동일한 공식
     */
    getHeightRange(width) {
        if (width >= 1200) {
            // PC: body 높이 기준
            const bodyHeight = document.body.clientHeight;
            return { min: bodyHeight, max: bodyHeight };
        } else if (width >= 768) {
            // 태블릿: 4:3 ~ 3:4 비율
            return { min: Math.round(width * 0.75), max: Math.round(width * 1.4) };
        } else {
            // 모바일: 16:9 ~ 21:9 비율
            return { min: Math.round(width * 1.5), max: Math.round(width * 2.2) };
        }
    }

    limitViewportHeightElements() {
        try {
            // 활성 iframe 사용 (멀티뷰 모드에서 정확한 iframe 참조)
            const frame = this.activeFrame || this.previewFrame;
            const doc = frame.contentDocument || frame.contentWindow?.document;
            const win = frame.contentWindow;
            if (!doc || !win) return;

            // iframe 너비로 적정 뷰포트 높이 계산 (MultiCanvasManager와 동일 공식)
            const iframeWidth = frame.offsetWidth || win.innerWidth;
            const range = this.getHeightRange(iframeWidth);
            const viewportHeight = range.min;

            // 이전에 제한했던 요소들의 inline override를 먼저 초기화 (재평가를 위해)
            const previouslyLimited = doc.body.querySelectorAll('[data-editor-height-limited]');
            previouslyLimited.forEach(el => {
                const origH = el.dataset.editorOriginalHeight;
                const origMinH = el.dataset.editorOriginalMinHeight;
                const origMaxH = el.dataset.editorOriginalMaxHeight;
                // 원래 스타일로 복원하여 CSS 값을 정확히 읽을 수 있게 함
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
                if (computed.position === 'relative') {
                    const hasAbsChild = Array.from(el.children).some(child => {
                        return win.getComputedStyle(child).position === 'absolute';
                    });
                    if (hasAbsChild) return;
                }

                // height나 min-height가 viewport height의 99% 이상인 경우만 제한
                const threshold = viewportHeight * 0.99;

                if (height >= threshold || minHeight >= threshold) {
                    // 원래 스타일 백업 (나중에 복원용)
                    el.dataset.editorOriginalHeight = el.style.height || '';
                    el.dataset.editorOriginalMinHeight = el.style.minHeight || '';
                    el.dataset.editorOriginalMaxHeight = el.style.maxHeight || '';

                    // 높이 제한 적용 (height:auto가 콘텐츠 초과 시 자동 확장)
                    el.style.setProperty('height', 'auto', 'important');
                    el.style.setProperty('min-height', `${viewportHeight}px`, 'important');
                    el.style.removeProperty('max-height');
                    el.dataset.editorHeightLimited = 'true';
                }
            });
        } catch (err) {
            console.error('Cannot limit viewport height elements:', err);
        }
    }

    attachListeners() {
        try {
            const doc = this.getDocument();

            if (!doc.body) {
                return;
            }

            // Alt+V / Enter / ESC (미니 AI 대화창) → AIChatManager._attachShortcutsToIframes()에서 처리

            // Helper to check if target is an editor UI element
            const isEditorUI = (target) => {
                return target.closest('#editor-overlay') ||
                    target.closest('#editor-margin-overlay') ||
                    target.closest('#editor-padding-overlay') ||
                    target.closest('.editor-context-menu') ||
                    target.classList.contains('editor-context-menu-item') ||
                    target.classList.contains('editor-spacing-handle') ||
                    target.classList.contains('editor-resize-handle') ||
                    target.classList.contains('editor-move-handle') ||
                    target.classList.contains('editor-rotate-handle') ||
                    target.classList.contains('editor-gap-area') ||
                    target.classList.contains('editor-border-drag-zone') ||
                    target.classList.contains('editor-drag-clone');
            };

            // Use capture phase on document for more reliable event catching
            doc.addEventListener('click', (e) => {
                // 패닝 모드에서는 클릭 무시
                const isSpacePressed = this.zoomManager?.isSpacePressed;
                if (this.isPanningMode || isSpacePressed) {
                    return;
                }

                // Ignore clicks on overlay handles and editor UI
                if (isEditorUI(e.target)) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                this.emit('element:click', e.target, {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    offsetX: e.offsetX,
                    offsetY: e.offsetY,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey
                });
            }, true);

            doc.addEventListener('dblclick', (e) => {
                // 패닝 모드에서는 더블클릭 무시
                const isSpacePressed = this.zoomManager?.isSpacePressed;
                if (this.isPanningMode || isSpacePressed) {
                    return;
                }

                // Ignore double clicks on editor UI
                if (isEditorUI(e.target)) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                this.emit('element:dblclick', e.target, {
                    clientX: e.clientX,
                    clientY: e.clientY
                });
            }, true);

            doc.addEventListener('mouseover', (e) => {
                // 패닝 모드에서는 hover 비활성화 (ZoomManager의 isSpacePressed 직접 확인)
                const isSpacePressed = this.zoomManager?.isSpacePressed;
                if (this.isPanningMode || isSpacePressed) {
                    return;
                }

                // Don't highlight editor UI elements
                if (isEditorUI(e.target)) {
                    return;
                }

                if (e.target !== doc.body && e.target !== doc.documentElement) {
                    e.target.classList.add('editor-hover');
                    this.emit('element:hover', e.target);
                }
            }, true);

            doc.addEventListener('mouseout', (e) => {
                if (isEditorUI(e.target)) {
                    return;
                }

                e.target.classList.remove('editor-hover');
                this.emit('element:unhover', e.target);
            }, true);

            // 우클릭 컨텍스트 메뉴
            doc.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.emit('element:contextmenu', {
                    element: e.target,
                    event: e  // 이벤트 객체 전달 (좌표 변환에 필요)
                });
            }, true);
        } catch (err) {
            console.error('Cannot attach listeners:', err);
        }
    }

    getDocument() {
        const frame = this.activeFrame || this.previewFrame;
        return frame.contentDocument || frame.contentWindow?.document;
    }

    getWindow() {
        const frame = this.activeFrame || this.previewFrame;
        return frame.contentWindow;
    }

    getFrame() {
        return this.activeFrame || this.previewFrame;
    }

    /**
     * 메인 iframe의 document 반환 (멀티뷰 동기화 등에 사용)
     */
    getMainDocument() {
        return this.mainFrame.contentDocument || this.mainFrame.contentWindow?.document;
    }

    /**
     * 메인 iframe 반환
     */
    getMainFrame() {
        return this.mainFrame;
    }

    /**
     * ZoomManager 참조 설정
     */
    setZoomManager(zoomManager) {
        this.zoomManager = zoomManager;
    }

    /**
     * 패닝 모드 상태 설정
     * @param {boolean} isPanning
     */
    setPanningMode(isPanning) {
        this.isPanningMode = isPanning;
    }

    refresh() {
        // Reset ready state so load event will re-initialize
        this.isReady = false;

        // 캐시 방지를 위해 타임스탬프 추가
        const timestamp = Date.now();
        let targetUrl = this.originalUrl || this.previewFrame.src;

        // URL에 타임스탬프 파라미터 추가
        try {
            const urlObj = new URL(targetUrl);
            urlObj.searchParams.set('_refresh', timestamp.toString());
            targetUrl = urlObj.toString();
        } catch (e) {
            // URL 파싱 실패시 쿼리스트링으로 직접 추가
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl = `${targetUrl}${separator}_refresh=${timestamp}`;
        }

        console.log('[PreviewManager] 🔄 Refreshing iframe with URL:', targetUrl);
        this.previewFrame.src = targetUrl;
        this.emit('preview:refresh');
    }

    /**
     * CSS만 새로고침 (iframe 전체를 새로고침하지 않음)
     */
    refreshCSS() {
        const doc = this.getDocument();
        if (!doc) {
            console.error('[PreviewManager] ❌ Cannot get document for CSS refresh');
            return;
        }

        // 모든 <link rel="stylesheet"> 태그 찾기
        const links = doc.querySelectorAll('link[rel="stylesheet"]');
        console.log('[PreviewManager] 📝 Found', links.length, 'CSS link tags');

        if (links.length === 0) {
            console.warn('[PreviewManager] ⚠️ No CSS <link> tags found, trying <style> tags');
            // <style> 태그가 있는 경우는 전체 새로고침 필요
            this.refresh();
            return;
        }

        links.forEach((link, index) => {
            const href = link.getAttribute('href');
            console.log(`[PreviewManager] 🔗 Link ${index}: Original href:`, href);
            if (href) {
                // 상대 경로인 경우 절대 경로로 변환
                let absoluteHref = href;
                if (!href.startsWith('http') && !href.startsWith('/')) {
                    // 상대 경로를 iframe의 base URL에 맞게 변환
                    const iframeUrl = new URL(this.previewFrame.src);
                    const baseUrl = iframeUrl.origin + iframeUrl.pathname.substring(0, iframeUrl.pathname.lastIndexOf('/') + 1);
                    absoluteHref = baseUrl + href;
                    console.log(`[PreviewManager] 📍 Converted to absolute:`, absoluteHref);
                }

                // 캐시 방지를 위해 타임스탬프 추가
                const urlObj = new URL(absoluteHref);
                urlObj.searchParams.set('t', Date.now().toString());
                const newHref = urlObj.toString();

                link.setAttribute('href', newHref);
                console.log('[PreviewManager] ✅ Updated href:', newHref);
            }
        });

        console.log('[PreviewManager] 🎨 CSS refreshed without full reload');
    }

    /**
     * JS만 새로고침 (스크립트 태그를 재로드)
     */
    refreshJS() {
        const doc = this.getDocument();
        if (!doc) {
            console.error('[PreviewManager] ❌ Cannot get document for JS refresh');
            return;
        }

        // 모든 <script src="..."> 태그 찾기
        const scripts = doc.querySelectorAll('script[src]');
        console.log('[PreviewManager] 📝 Found', scripts.length, 'JS script tags');

        if (scripts.length === 0) {
            console.warn('[PreviewManager] ⚠️ No external JS <script> tags found');
            // 외부 스크립트가 없으면 전체 새로고침
            this.refresh();
            return;
        }

        scripts.forEach((script, index) => {
            const src = script.getAttribute('src');
            console.log(`[PreviewManager] 🔗 Script ${index}: Original src:`, src);
            if (src) {
                // 상대 경로인 경우 절대 경로로 변환
                let absoluteSrc = src;
                if (!src.startsWith('http') && !src.startsWith('/')) {
                    const iframeUrl = new URL(this.previewFrame.src);
                    const baseUrl = iframeUrl.origin + iframeUrl.pathname.substring(0, iframeUrl.pathname.lastIndexOf('/') + 1);
                    absoluteSrc = baseUrl + src;
                    console.log(`[PreviewManager] 📍 Converted to absolute:`, absoluteSrc);
                }

                // 캐시 방지를 위해 타임스탬프 추가
                const urlObj = new URL(absoluteSrc);
                urlObj.searchParams.set('t', Date.now().toString());
                const newSrc = urlObj.toString();

                // 기존 스크립트 제거하고 새로 추가
                const newScript = doc.createElement('script');
                newScript.src = newSrc;
                newScript.type = script.type || 'text/javascript';

                // 기존 스크립트의 다른 속성들 복사
                if (script.async) newScript.async = true;
                if (script.defer) newScript.defer = true;

                script.parentNode.replaceChild(newScript, script);
                console.log('[PreviewManager] ✅ Updated script src:', newSrc);
            }
        });

        console.log('[PreviewManager] 🎨 JS refreshed without full reload');
    }

    /**
     * 원본 프로젝트 URL 설정
     */
    setOriginalUrl(url) {
        this.originalUrl = url;
    }

    /**
     * 원본 URL로 복귀
     */
    restoreOriginal() {
        if (this.originalUrl) {
            this.isReady = false;
            this.previewFrame.src = this.originalUrl;
        }
    }

    getHTML() {
        try {
            const doc = this.getDocument();
            return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        } catch (err) {
            console.error('Cannot get HTML:', err);
            return null;
        }
    }
}

export default PreviewManager;
