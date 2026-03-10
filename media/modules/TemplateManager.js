import EventEmitter from './EventEmitter.js';

/**
 * TemplateManager - 템플릿 관리 모듈
 * 시스템/사용자 템플릿을 조회, 검색, 삽입하는 기능을 제공합니다.
 */
class TemplateManager extends EventEmitter {
    constructor() {
        super();
        this.templates = [];
        this.categories = [
            { id: 'all', name: '전체' },
            { id: 'hero', name: '히어로' },
            { id: 'feature', name: '특징' },
            { id: 'pricing', name: '가격표' },
            { id: 'testimonial', name: '후기' },
            { id: 'cta', name: 'CTA' },
            { id: 'footer', name: '푸터' },
            { id: 'contact', name: '문의' },
            { id: 'gallery', name: '갤러리' },
            { id: 'video', name: '비디오' },
            { id: 'team', name: '팀' },
            { id: 'faq', name: 'FAQ' },
            { id: 'stats', name: '통계' },
            { id: 'header', name: '헤더' },
            { id: 'table', name: '테이블' },
            { id: 'custom', name: '사용자 정의' }
        ];
        this.currentCategory = 'all';
        this.currentType = 'all'; // 'all', 'system', 'user'
        this.searchQuery = '';
        this.isLoading = false;
        this.loaded = false;
        this.rendered = false; // DOM이 렌더링되었는지 추적

        // DOM references
        this.panel = null;
        this.templateGrid = null;
        this.searchInput = null;
        this.categorySelect = null;
        this.typeButtons = null;

        // Drag state
        this.draggedTemplate = null;
        this.dragPreview = null;

        // MultiCanvasManager 참조 (EditorApp에서 설정)
        this.multiCanvasManager = null;
    }

    /**
     * 초기화
     */
    init(multiCanvasManager = null) {
        this.multiCanvasManager = multiCanvasManager;

        this.panel = document.getElementById('templatePanel');
        if (!this.panel) {
            console.warn('TemplateManager: Template panel not found');
            return;
        }

        this.templateGrid = this.panel.querySelector('.template-grid');
        this.searchInput = this.panel.querySelector('.template-search-input');
        this.categorySelect = this.panel.querySelector('.template-category-select');
        this.typeButtons = this.panel.querySelectorAll('.template-type-btn');

        this.setupEventListeners();
    }

    /**
     * MultiCanvasManager 설정
     */
    setMultiCanvasManager(manager) {
        this.multiCanvasManager = manager;
    }

    /**
     * mainIframe 또는 첫 번째 iframe 가져오기
     * @returns {HTMLIFrameElement|null}
     */
    getMainIframe() {
        // 1. MultiCanvasManager의 mainIframe 사용
        if (this.multiCanvasManager?.mainIframe) {
            return this.multiCanvasManager.mainIframe;
        }
        // 2. MultiCanvasManager의 iframes[0] 사용
        if (this.multiCanvasManager?.iframes?.[0]) {
            return this.multiCanvasManager.iframes[0];
        }
        // 3. DOM에서 직접 찾기 (멀티뷰 컨테이너)
        const multiCanvasContainer = document.querySelector('.multi-canvas-container');
        if (multiCanvasContainer) {
            const iframe = multiCanvasContainer.querySelector('iframe');
            if (iframe) return iframe;
        }
        // 4. 폴백: 기본 previewFrame
        return document.getElementById('previewFrame');
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 검색
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.rendered = false; // 필터 변경 시 다시 렌더링 필요
                this.renderTemplates();
            });
        }

        // 카테고리 선택
        if (this.categorySelect) {
            this.categorySelect.addEventListener('change', (e) => {
                this.currentCategory = e.target.value;
                this.rendered = false; // 필터 변경 시 다시 렌더링 필요
                this.renderTemplates();
            });
        }

        // 타입 필터 (시스템/사용자)
        if (this.typeButtons) {
            this.typeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.typeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentType = btn.dataset.type;
                    this.rendered = false; // 필터 변경 시 다시 렌더링 필요
                    this.renderTemplates();
                });
            });
        }

        // 템플릿 저장 버튼
        const saveBtn = this.panel?.querySelector('.template-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveCurrentSelection());
        }

        // iframe에 드롭 이벤트 설정
        this.setupPreviewDropZone();
    }

    /**
     * Preview iframe에 드롭 존 설정 (드래그 앤 드롭은 추후 지원)
     */
    setupPreviewDropZone() {
        // 자동 스크롤 상태
        this.autoScrollInterval = null;
        // 드롭 존 기능은 getMainIframe() 기반으로 추후 재구현
    }

    /**
     * 드래그 중 자동 스크롤 처리
     */
    handleAutoScroll(e, doc) {
        const scrollZone = 80; // 스크롤 시작 영역 (px)
        const maxScrollSpeed = 20; // 최대 스크롤 속도
        const mainIframe = this.getMainIframe();
        const viewportHeight = mainIframe?.clientHeight || window.innerHeight;
        const mouseY = e.clientY;

        let scrollSpeed = 0;

        // 상단 가장자리 근처
        if (mouseY < scrollZone) {
            scrollSpeed = -maxScrollSpeed * (1 - mouseY / scrollZone);
        }
        // 하단 가장자리 근처
        else if (mouseY > viewportHeight - scrollZone) {
            scrollSpeed = maxScrollSpeed * (1 - (viewportHeight - mouseY) / scrollZone);
        }

        if (scrollSpeed !== 0) {
            this.startAutoScroll(doc, scrollSpeed);
        } else {
            this.stopAutoScroll();
        }
    }

    /**
     * 자동 스크롤 시작
     */
    startAutoScroll(doc, speed) {
        if (this.autoScrollInterval) {
            // 이미 스크롤 중이면 속도만 업데이트
            this.autoScrollSpeed = speed;
            return;
        }

        this.autoScrollSpeed = speed;
        this.autoScrollInterval = setInterval(() => {
            doc.documentElement.scrollTop += this.autoScrollSpeed;
        }, 16); // ~60fps
    }

    /**
     * 자동 스크롤 중지
     */
    stopAutoScroll() {
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
            this.autoScrollSpeed = 0;
        }
    }

    /**
     * 드롭 인디케이터 스타일 삽입
     */
    injectDropStyles(doc) {
        if (doc.getElementById('template-drop-styles')) return;

        const style = doc.createElement('style');
        style.id = 'template-drop-styles';
        style.textContent = `
            .template-drop-indicator {
                position: absolute;
                left: 0;
                right: 0;
                height: 4px;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                border-radius: 2px;
                pointer-events: none;
                z-index: 99999;
                box-shadow: 0 0 10px rgba(102, 126, 234, 0.5);
                animation: dropIndicatorPulse 1s ease-in-out infinite;
            }
            .template-drop-indicator::before,
            .template-drop-indicator::after {
                content: '';
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: 10px;
                height: 10px;
                background: #667eea;
                border-radius: 50%;
            }
            .template-drop-indicator::before { left: -5px; }
            .template-drop-indicator::after { right: -5px; }
            @keyframes dropIndicatorPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
            .template-drop-target {
                outline: 2px dashed #667eea !important;
                outline-offset: -2px;
                background-color: rgba(102, 126, 234, 0.05) !important;
            }
        `;
        doc.head.appendChild(style);
    }

    /**
     * 드롭 대상 요소 찾기
     */
    getDropTarget(e, doc) {
        const target = e.target.closest('section, header, footer, main, article, aside, nav, div[class]');
        return target || doc.body;
    }

    /**
     * 드롭 인디케이터 표시
     */
    showDropIndicator(e, doc) {
        let indicator = doc.getElementById('template-drop-indicator');
        if (!indicator) {
            indicator = doc.createElement('div');
            indicator.id = 'template-drop-indicator';
            indicator.className = 'template-drop-indicator';
            doc.body.appendChild(indicator);
        }

        // 이전 하이라이트 제거
        doc.querySelectorAll('.template-drop-target').forEach(el => {
            el.classList.remove('template-drop-target');
        });

        const target = this.getDropTarget(e, doc);
        if (target && target !== doc.body) {
            target.classList.add('template-drop-target');

            // 인디케이터 위치 설정 (타겟 아래)
            const rect = target.getBoundingClientRect();
            const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
            indicator.style.top = (rect.bottom + scrollTop) + 'px';
            indicator.style.display = 'block';
        } else {
            // body인 경우 마우스 위치 근처의 섹션 찾기
            const allSections = doc.querySelectorAll('section, header, footer, main, article');
            let closestSection = null;
            let closestDistance = Infinity;

            allSections.forEach(section => {
                const rect = section.getBoundingClientRect();
                const distance = Math.abs(e.clientY - rect.bottom);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSection = section;
                }
            });

            if (closestSection) {
                closestSection.classList.add('template-drop-target');
                const rect = closestSection.getBoundingClientRect();
                const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
                indicator.style.top = (rect.bottom + scrollTop) + 'px';
            } else {
                // 섹션이 없으면 body 맨 아래
                indicator.style.top = doc.body.scrollHeight + 'px';
            }
            indicator.style.display = 'block';
        }
    }

    /**
     * 드롭 인디케이터 숨기기
     */
    hideDropIndicator(doc) {
        const indicator = doc.getElementById('template-drop-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
        doc.querySelectorAll('.template-drop-target').forEach(el => {
            el.classList.remove('template-drop-target');
        });
    }

    /**
     * 현재 뷰포트 중앙에 보이는 섹션 찾기
     * 템플릿은 이 요소 뒤에 삽입됨
     */
    findVisibleBottomSection(doc) {
        // body의 직접 자식 중 실제 콘텐츠가 있는 섹션 요소 찾기
        const bodyChildren = Array.from(doc.body.children);
        const sections = bodyChildren.filter(el => {
            // 기본 태그 필터
            if (!['SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ARTICLE', 'NAV', 'ASIDE'].includes(el.tagName)) {
                return false;
            }
            // 에디터 내부 요소 제외
            if (el.id?.startsWith('zaemit-') || el.id?.startsWith('template-')) {
                return false;
            }
            // 크기가 없는 요소 제외 (display:none, 빈 요소 등)
            if (el.offsetHeight === 0) {
                return false;
            }
            return true;
        });

        if (sections.length === 0) return null;

        // 멀티뷰 컨테이너 확인
        const multiCanvasContainer = document.querySelector('.multi-canvas-container');
        const isMultiView = !!multiCanvasContainer;
        const mainIframe = this.getMainIframe();

        // iframe 내부 좌표계 기준 뷰포트 중앙 Y 계산
        let viewportCenterY = 0;

        if (isMultiView && mainIframe) {
            // 멀티뷰: 메인 문서 좌표 → iframe 내부 좌표 변환
            const containerRect = multiCanvasContainer.getBoundingClientRect();
            const iframeRect = mainIframe.getBoundingClientRect();

            // zoom 레벨 (ZoomManager에서 직접 가져오기)
            const zoom = this.multiCanvasManager?.zoomManager?.zoomLevel || 0.5;

            // containerHeight가 0인 경우 window.innerHeight 사용
            const containerHeight = containerRect.height || window.innerHeight;
            const containerTop = containerRect.height ? containerRect.top : 0;

            // 1. 메인 문서 화면 중앙 Y
            const screenCenterY = containerTop + containerHeight / 2;

            // 2. 화면 중앙이 iframe 화면상 어디인지 (iframe 상단 기준)
            const offsetFromIframeTop = screenCenterY - iframeRect.top;

            // 3. iframe 내부 좌표로 변환 (zoom 보정)
            viewportCenterY = offsetFromIframeTop / zoom;

        } else {
            // 단일뷰: iframe 내부 스크롤 위치 사용
            const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop || 0;
            const viewportHeight = mainIframe?.clientHeight || window.innerHeight;
            viewportCenterY = scrollTop + viewportHeight / 2;
        }

        // 섹션 선택: offsetTop(iframe 내부 좌표)과 viewportCenterY 비교
        let containingSection = null;
        let aboveSection = null;
        let aboveSectionBottom = -Infinity;

        sections.forEach((section, idx) => {
            const top = section.offsetTop;
            const bottom = top + section.offsetHeight;

            const contains = top <= viewportCenterY && viewportCenterY <= bottom;
            const isAbove = bottom <= viewportCenterY;

            if (contains) {
                containingSection = section;
            }
            if (isAbove && bottom > aboveSectionBottom) {
                aboveSection = section;
                aboveSectionBottom = bottom;
            }
        });

        return containingSection || aboveSection || sections[sections.length - 1];
    }

    /**
     * 삽입된 요소 하이라이트 애니메이션
     */
    highlightInsertedElement(element, doc) {
        // 하이라이트 스타일 삽입
        if (!doc.getElementById('template-highlight-styles')) {
            const style = doc.createElement('style');
            style.id = 'template-highlight-styles';
            style.textContent = `
                @keyframes templateInsertHighlight {
                    0% {
                        outline: 3px solid #667eea;
                        outline-offset: 0px;
                        background-color: rgba(102, 126, 234, 0.1);
                    }
                    50% {
                        outline: 3px solid #764ba2;
                        outline-offset: 4px;
                        background-color: rgba(118, 75, 162, 0.1);
                    }
                    100% {
                        outline: 0px solid transparent;
                        outline-offset: 0px;
                        background-color: transparent;
                    }
                }
                .template-inserted-highlight {
                    animation: templateInsertHighlight 1.5s ease-out forwards;
                }
            `;
            doc.head.appendChild(style);
        }

        // 하이라이트 클래스 추가
        element.classList.add('template-inserted-highlight');

        // 애니메이션 종료 후 클래스 제거
        setTimeout(() => {
            element.classList.remove('template-inserted-highlight');
        }, 1500);
    }

    /**
     * 삽입된 요소로 스크롤 (멀티뷰: virtual scroll via panY with animation)
     * 항상 스크롤 실행 (가시성 체크 없음)
     */
    scrollToElement(element, doc) {
        const multiCanvasContainer = document.querySelector('.multi-canvas-container');
        const isMultiView = !!multiCanvasContainer;
        const mainIframe = this.getMainIframe();

        if (isMultiView && mainIframe && this.multiCanvasManager) {
            const zoom = this.multiCanvasManager.zoomManager?.zoomLevel || 0.5;
            const currentPanY = this.multiCanvasManager.panY || 0;

            const containerRect = multiCanvasContainer.getBoundingClientRect();
            const containerHeight = containerRect.height || window.innerHeight;

            // 요소의 iframe 문서 내 절대 위치 (스케일 미적용)
            const elementOffsetTop = element.offsetTop;
            const elementHeight = element.offsetHeight;

            // 요소를 화면 중앙에 배치하기 위한 panY 계산
            // 화면 중앙 Y (컨테이너 기준) = containerHeight / 2
            // 요소 중심이 화면 중앙에 오려면:
            // containerRect.top + containerHeight/2 = iframeScreenTop + elementOffsetTop * zoom + elementHeight * zoom / 2
            //
            // iframeScreenTop = containerRect.top + panY (transform-origin: 0 0이고 translate가 적용됨)
            // 따라서:
            // containerHeight/2 = panY + elementOffsetTop * zoom + elementHeight * zoom / 2
            // panY = containerHeight/2 - elementOffsetTop * zoom - elementHeight * zoom / 2
            // panY = containerHeight/2 - (elementOffsetTop + elementHeight/2) * zoom

            const elementCenterInIframe = elementOffsetTop + (elementHeight / 2);
            const targetPanY = (containerHeight / 2) - (elementCenterInIframe * zoom);

            // 0.3초 애니메이션으로 panY 변경
            this._animatePanY(currentPanY, targetPanY, 300);
        } else {
            // 단일뷰: iframe 내부 스크롤
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * panY 애니메이션 (easeOutCubic)
     */
    _animatePanY(from, to, duration) {
        const startTime = performance.now();
        const diff = to - from;

        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);

            this.multiCanvasManager.panY = from + (diff * eased);
            this.multiCanvasManager.applyTransform();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * 템플릿 목록 로드
     */
    async loadTemplates() {
        if (this.isLoading) return;

        // 이미 로드 및 렌더링 완료된 경우 - 아무것도 하지 않음
        if (this.loaded && this.templates.length > 0 && this.rendered) {
            return;
        }

        this.isLoading = true;
        this.renderLoading();

        try {
            const response = await fetch('/api/templates');
            if (!response.ok) throw new Error('템플릿 로드 실패');

            const data = await response.json();
            this.templates = data.templates || [];
            this.loaded = true;
        } catch (error) {
            console.error('TemplateManager: Failed to load templates', error);
            this.templates = [];
        } finally {
            this.isLoading = false;
            this.renderTemplates();
        }
    }

    /**
     * 필터링된 템플릿 반환
     */
    getFilteredTemplates() {
        return this.templates.filter(template => {
            // 카테고리 필터
            if (this.currentCategory !== 'all' && template.category !== this.currentCategory) {
                return false;
            }

            // 타입 필터
            if (this.currentType !== 'all' && template.type !== this.currentType) {
                return false;
            }

            // 검색 필터
            if (this.searchQuery) {
                const searchTarget = `${template.name} ${template.description || ''}`.toLowerCase();
                if (!searchTarget.includes(this.searchQuery)) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * 로딩 상태 렌더링
     */
    renderLoading() {
        if (!this.templateGrid) return;

        this.templateGrid.innerHTML = `
            <div class="template-loading">
                <div class="spinner"></div>
                <span>템플릿 로드 중...</span>
            </div>
        `;
    }

    /**
     * 템플릿 목록 렌더링
     */
    renderTemplates() {
        if (!this.templateGrid) return;

        const filtered = this.getFilteredTemplates();

        if (filtered.length === 0) {
            this.templateGrid.innerHTML = `
                <div class="template-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    <p>템플릿이 없습니다</p>
                </div>
            `;
            return;
        }

        this.templateGrid.innerHTML = filtered.map(template => `
            <div class="template-item"
                 data-id="${template.id}"
                 draggable="true"
                 title="클릭: 미리보기 / 드래그: 삽입">
                <div class="template-thumbnail">
                    <div class="template-placeholder">${template.name.charAt(0)}</div>
                    <iframe class="template-preview-iframe" data-template-id="${template.id}" scrolling="no"></iframe>
                </div>
                <div class="template-footer">
                    <div class="template-info">
                        <span class="template-name">${template.name}</span>
                        <span class="template-type ${template.type}">${template.type === 'system' ? '기본' : '내 템플릿'}</span>
                    </div>
                    <button class="template-insert-btn" title="삽입">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // 이벤트 바인딩
        this.bindTemplateEvents();

        // 썸네일 로드 (지연 로드)
        this.loadThumbnails();

        // 렌더링 완료 플래그 설정
        this.rendered = true;
    }

    /**
     * 템플릿 썸네일 로드 (Intersection Observer 사용)
     */
    loadThumbnails() {
        const iframes = this.templateGrid.querySelectorAll('.template-preview-iframe');

        // Intersection Observer로 보이는 것만 로드
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const iframe = entry.target;
                    const templateId = iframe.dataset.templateId;

                    if (!iframe.dataset.loaded) {
                        this.loadThumbnailContent(iframe, templateId);
                        iframe.dataset.loaded = 'true';
                    }

                    observer.unobserve(iframe);
                }
            });
        }, { root: this.templateGrid.closest('.template-grid-container'), threshold: 0.1 });

        iframes.forEach(iframe => observer.observe(iframe));
    }

    /**
     * 개별 썸네일 콘텐츠 로드
     */
    async loadThumbnailContent(iframe, templateId) {
        try {
            const response = await fetch(`/api/templates/${templateId}/content`);
            if (!response.ok) return;

            const data = await response.json();
            if (!data.html) return;

            const html = this.getThumbnailHTML(data.html);
            iframe.srcdoc = html;

            // 로드 완료 시 placeholder 숨기기
            iframe.addEventListener('load', () => {
                const placeholder = iframe.previousElementSibling;
                if (placeholder?.classList.contains('template-placeholder')) {
                    placeholder.style.opacity = '0';
                }
                iframe.style.opacity = '1';
            });
        } catch (err) {
            console.warn('Failed to load thumbnail:', templateId, err);
        }
    }

    /**
     * 썸네일용 HTML 생성
     */
    getThumbnailHTML(contentHtml) {
        // 썸네일 영역: 약 160x100px, 원본: 800px 기준 → scale 0.2
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html {
            width: 800px;
            height: 500px;
            overflow: hidden;
        }
        body {
            width: 800px;
            transform-origin: top left;
            transform: scale(0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            pointer-events: none;
        }
    </style>
</head>
<body>${contentHtml}</body>
</html>`;
    }

    /**
     * 템플릿 아이템 이벤트 바인딩
     */
    bindTemplateEvents() {
        const items = this.templateGrid.querySelectorAll('.template-item');

        items.forEach(item => {
            const templateId = item.dataset.id;
            const template = this.templates.find(t => t.id === templateId);
            if (!template) return;

            // 드래그 시작
            item.addEventListener('dragstart', (e) => this.handleDragStart(e, template));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));

            // 썸네일 클릭 → 미리보기
            const thumbnail = item.querySelector('.template-thumbnail');
            if (thumbnail) {
                thumbnail.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.previewTemplate(template);
                });
            }

            // + 버튼 클릭 → 삽입
            const insertBtn = item.querySelector('.template-insert-btn');
            if (insertBtn) {
                insertBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadAndInsertTemplate(template);
                });
            }
        });
    }

    /**
     * 드래그 시작
     */
    handleDragStart(e, template) {
        this.draggedTemplate = template;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'template',
            id: template.id
        }));

        // 드래그 프리뷰 생성
        this.createDragPreview(template, e);

        e.target.classList.add('dragging');
        this.emit('template:dragstart', { template });
    }

    /**
     * 드래그 종료
     */
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.removeDragPreview();
        this.stopAutoScroll();
        this.draggedTemplate = null;
        this.emit('template:dragend');
    }

    /**
     * 드래그 프리뷰 생성
     */
    createDragPreview(template, e) {
        this.dragPreview = document.createElement('div');
        this.dragPreview.className = 'template-drag-preview';
        this.dragPreview.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <span>${template.name}</span>
        `;
        document.body.appendChild(this.dragPreview);

        // 커스텀 드래그 이미지
        e.dataTransfer.setDragImage(this.dragPreview, 60, 20);
    }

    /**
     * 드래그 프리뷰 제거
     */
    removeDragPreview() {
        if (this.dragPreview) {
            this.dragPreview.remove();
            this.dragPreview = null;
        }
    }

    /**
     * 템플릿 HTML 로드 후 삽입
     */
    async loadAndInsertTemplate(template, targetElement = null) {
        try {
            // API에서 템플릿 HTML 콘텐츠 가져오기
            const response = await fetch(`/api/templates/${template.id}/content`);
            if (!response.ok) throw new Error('템플릿 콘텐츠 로드 실패');

            const fullTemplate = await response.json();
            this.insertTemplate(fullTemplate, targetElement);
        } catch (error) {
            console.error('TemplateManager: Failed to load template content', error);
            this.emit('template:error', { message: '템플릿 로드에 실패했습니다.' });
        }
    }

    /**
     * 템플릿 삽입
     */
    insertTemplate(template, targetElement = null) {
        // mainIframe 또는 첫 번째 iframe 가져오기
        const mainIframe = this.getMainIframe();

        if (!mainIframe) {
            console.error('TemplateManager: No iframe available');
            this.emit('template:error', { message: '미리보기 프레임을 찾을 수 없습니다.' });
            return;
        }

        let doc;
        try {
            doc = mainIframe.contentDocument || mainIframe.contentWindow.document;
        } catch (err) {
            console.error('TemplateManager: Cannot access iframe document', err);
            this.emit('template:error', { message: '미리보기 문서에 접근할 수 없습니다.' });
            return;
        }

        if (!doc || !doc.body) {
            console.error('TemplateManager: Preview document not available');
            this.emit('template:error', { message: '미리보기 문서가 준비되지 않았습니다.' });
            return;
        }

        try {
            // HTML 파싱
            const temp = doc.createElement('div');
            temp.innerHTML = template.html;

            const newElement = temp.firstElementChild;
            if (!newElement) {
                console.error('TemplateManager: Invalid template HTML');
                this.emit('template:error', { message: '유효하지 않은 템플릿입니다.' });
                return;
            }

            // 삽입 위치 결정
            let insertTarget = targetElement;

            // 타겟이 없거나 body인 경우, 현재 뷰포트에서 가장 아래 보이는 섹션 찾기
            if (!insertTarget || insertTarget === doc.body) {
                insertTarget = this.findVisibleBottomSection(doc);
            }

            if (insertTarget && insertTarget !== doc.body && insertTarget.parentNode) {
                // 타겟 요소 뒤에 삽입
                insertTarget.parentNode.insertBefore(newElement, insertTarget.nextSibling);
            } else {
                // body 끝에 삽입
                doc.body.appendChild(newElement);
            }

            // 삽입된 요소 하이라이트 애니메이션 추가
            this.highlightInsertedElement(newElement, doc);

            // 삽입된 요소로 스크롤 (PC 모드와 멀티뷰 모드 모두 처리)
            setTimeout(() => {
                this.scrollToElement(newElement, doc);
            }, 100);

            // 이벤트 발생
            this.emit('template:inserted', { template, element: newElement });

        } catch (error) {
            console.error('TemplateManager: Failed to insert template', error);
            this.emit('template:error', { message: '템플릿 삽입에 실패했습니다.' });
        }
    }

    /**
     * 템플릿 미리보기 모달
     */
    async previewTemplate(template) {
        // 템플릿 콘텐츠 로드
        let fullTemplate = template;
        if (!template.html) {
            try {
                const response = await fetch(`/api/templates/${template.id}/content`);
                if (response.ok) {
                    fullTemplate = await response.json();
                }
            } catch (err) {
                console.error('Failed to load template for preview', err);
            }
        }

        // 기존 모달 제거
        const existingModal = document.querySelector('.template-preview-modal');
        if (existingModal) existingModal.remove();

        const previewHtml = this.getPreviewHTML(fullTemplate);

        const modal = document.createElement('div');
        modal.className = 'template-preview-modal';
        modal.innerHTML = `
            <div class="template-preview-backdrop"></div>
            <div class="template-preview-content">
                <div class="template-preview-header">
                    <h3>${fullTemplate.name}</h3>
                    <button class="template-preview-close">&times;</button>
                </div>
                <div class="template-preview-body">
                    <iframe class="template-preview-frame" srcdoc="${this.escapeHtml(previewHtml)}"></iframe>
                </div>
                <div class="template-preview-footer">
                    <button class="btn-secondary template-preview-cancel">취소</button>
                    <button class="btn-primary template-preview-insert">삽입</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트
        modal.querySelector('.template-preview-backdrop').addEventListener('click', () => modal.remove());
        modal.querySelector('.template-preview-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.template-preview-cancel').addEventListener('click', () => modal.remove());
        modal.querySelector('.template-preview-insert').addEventListener('click', () => {
            this.insertTemplate(fullTemplate);
            modal.remove();
        });

        // ESC 키로 닫기
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * 미리보기용 HTML 생성
     */
    getPreviewHTML(template) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                </style>
            </head>
            <body>
                ${template.html || ''}
            </body>
            </html>
        `;
    }

    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;');
    }

    /**
     * 현재 선택 요소를 템플릿으로 저장
     */
    async saveCurrentSelection() {
        // 선택된 요소 가져오기 (EditorApp에서 이벤트로 받아야 함)
        this.emit('template:requestSelection');
    }

    /**
     * 선택된 요소로 템플릿 저장 실행
     */
    async saveSelectedElement(element) {
        if (!element || element.tagName === 'BODY' || element.tagName === 'HTML') {
            alert('저장할 요소를 먼저 선택해주세요.');
            return;
        }

        const name = prompt('템플릿 이름을 입력하세요:');
        if (!name) return;

        const categoryOptions = this.categories.filter(c => c.id !== 'all').map(c => c.name).join(', ');
        const category = prompt(`카테고리를 입력하세요 (${categoryOptions}):`, 'custom');

        const templateData = {
            name,
            category: category || 'custom',
            html: element.outerHTML,
            description: ''
        };

        try {
            const response = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            });

            if (!response.ok) throw new Error('저장 실패');

            const saved = await response.json();
            this.templates.unshift(saved);
            this.renderTemplates();

            alert('템플릿이 저장되었습니다.');
        } catch (error) {
            console.error('TemplateManager: Failed to save template', error);
            alert('템플릿 저장에 실패했습니다.');
        }
    }

    /**
     * 패널 표시/숨김 토글
     */
    togglePanel() {
        if (this.panel) {
            this.panel.classList.toggle('hidden');
        }
    }

    /**
     * 패널 표시
     */
    showPanel() {
        if (this.panel) {
            this.panel.classList.remove('hidden');
        }
    }

    /**
     * 패널 숨김
     */
    hidePanel() {
        if (this.panel) {
            this.panel.classList.add('hidden');
        }
    }
}

export default TemplateManager;
