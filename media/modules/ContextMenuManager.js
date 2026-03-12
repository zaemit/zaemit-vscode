import EventEmitter from './EventEmitter.js';

/**
 * ContextMenuManager - Handles context menu operations
 * 컨텍스트 메뉴는 메인 document에 생성되어 zoom 영향을 받지 않음
 */
class ContextMenuManager extends EventEmitter {
    constructor() {
        super();
        this.contextMenu = null;
        this.previewFrame = null;
        this.zoomManager = null;
    }

    /**
     * Initialize context menu
     * @param {HTMLIFrameElement} previewFrame
     * @param {ZoomManager} zoomManager - zoom 레벨 참조용
     */
    init(previewFrame, zoomManager = null) {
        this.previewFrame = previewFrame;
        this.zoomManager = zoomManager;

        // iframe 내부 우클릭 이벤트 연결
        this.attachIframeContextMenu();
    }

    /**
     * iframe에 contextmenu 이벤트 핸들러 연결
     */
    attachIframeContextMenu() {
        const doc = this.getIframeDocument();
        if (!doc) return;

        // 기존 핸들러 제거
        if (this._iframeContextHandler) {
            doc.removeEventListener('contextmenu', this._iframeContextHandler);
        }

        this._iframeContextHandler = (e) => {
            // 기본 컨텍스트 메뉴 방지는 EditorApp에서 처리
        };

        doc.addEventListener('contextmenu', this._iframeContextHandler);
    }

    /**
     * iframe 핸들러 재연결 (HTML 변경 후 호출)
     */
    reattachIframeHandlers() {
        this.attachIframeContextMenu();
        this._attachIframeHideHandler();
        this._attachIframeEscapeHandler();
    }

    /**
     * iframe 클릭 시 메뉴 숨기기 핸들러 등록
     */
    _attachIframeHideHandler() {
        const doc = this.getIframeDocument();
        if (!doc) return;

        // 기존 핸들러 제거
        if (this._iframeHideHandler) {
            try {
                doc.removeEventListener('mousedown', this._iframeHideHandler);
            } catch (e) {
                // 이전 document가 사라진 경우
            }
        }

        this._iframeHideHandler = () => {
            this.hide();
        };

        doc.addEventListener('mousedown', this._iframeHideHandler);
    }

    /**
     * iframe에서 Escape 키로 메뉴 숨기기 핸들러 등록
     */
    _attachIframeEscapeHandler() {
        const doc = this.getIframeDocument();
        if (!doc) return;

        // 기존 핸들러 제거
        if (this._iframeEscapeHandler) {
            try {
                doc.removeEventListener('keydown', this._iframeEscapeHandler);
            } catch (e) {
                // 이전 document가 사라진 경우
            }
        }

        this._iframeEscapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        };

        doc.addEventListener('keydown', this._iframeEscapeHandler);
    }

    /**
     * Get iframe document
     */
    getIframeDocument() {
        try {
            return this.previewFrame?.contentDocument ||
                   this.previewFrame?.contentWindow?.document;
        } catch (e) {
            return null;
        }
    }

    /**
     * Create context menu element in main document (not iframe)
     */
    createContextMenu() {
        // Remove existing menu
        const existing = document.querySelector('.editor-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'editor-context-menu';
        const lucide = (paths) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
        const icons = {
            copy:        lucide('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
            scissors:    lucide('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'),
            paste:       lucide('<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2"/><path d="M21 14H11"/><path d="m15 10-4 4 4 4"/>'),
            copyPlus:    lucide('<line x1="15" y1="12" x2="15" y2="18"/><line x1="12" y1="15" x2="18" y2="15"/><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
            arrowUp:     lucide('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
            arrowDown:   lucide('<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/>'),
            cornerUpLeft:lucide('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
            alignLeft:   lucide('<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="14" x2="3" y2="14"/><line x1="15" y1="18" x2="3" y2="18"/>'),
            alignCenter: lucide('<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="18" y1="14" x2="6" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>'),
            alignRight:  lucide('<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/><line x1="21" y1="18" x2="9" y2="18"/>'),
            image:       lucide('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
            pencil:      lucide('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'),
            link:        lucide('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
            trash:       lucide('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
        };

        menu.innerHTML = `
            <div class="editor-context-menu-item" data-action="copy">
                <span class="icon">${icons.copy}</span>
                <span>Copy</span>
                <span class="shortcut">Ctrl+C</span>
            </div>
            <div class="editor-context-menu-item" data-action="cut">
                <span class="icon">${icons.scissors}</span>
                <span>Cut</span>
                <span class="shortcut">Ctrl+X</span>
            </div>
            <div class="editor-context-menu-item" data-action="paste">
                <span class="icon">${icons.paste}</span>
                <span>Paste</span>
                <span class="shortcut">Ctrl+V</span>
            </div>
            <div class="editor-context-menu-item" data-action="duplicate">
                <span class="icon">${icons.copyPlus}</span>
                <span>Duplicate</span>
                <span class="shortcut">Ctrl+D</span>
            </div>
            <div class="editor-context-menu-divider"></div>
            <div class="editor-context-menu-item" data-action="moveUp">
                <span class="icon">${icons.arrowUp}</span>
                <span>Move Up</span>
                <span class="shortcut">Alt+↑</span>
            </div>
            <div class="editor-context-menu-item" data-action="moveDown">
                <span class="icon">${icons.arrowDown}</span>
                <span>Move Down</span>
                <span class="shortcut">Alt+↓</span>
            </div>
            <div class="editor-context-menu-divider"></div>
            <div class="editor-context-menu-item" data-action="selectParent">
                <span class="icon">${icons.cornerUpLeft}</span>
                <span>Select Parent</span>
                <span class="shortcut">Alt+P</span>
            </div>
            <div class="editor-context-menu-divider"></div>
            <div class="editor-context-menu-item" data-action="alignLeft">
                <span class="icon">${icons.alignLeft}</span>
                <span>Align Left</span>
                <span class="shortcut">Alt+L</span>
            </div>
            <div class="editor-context-menu-item" data-action="alignCenter">
                <span class="icon">${icons.alignCenter}</span>
                <span>Align Center</span>
                <span class="shortcut">Alt+M</span>
            </div>
            <div class="editor-context-menu-item" data-action="alignRight">
                <span class="icon">${icons.alignRight}</span>
                <span>Align Right</span>
                <span class="shortcut">Alt+R</span>
            </div>
            <div class="editor-context-menu-divider image-menu-divider hidden"></div>
            <div class="editor-context-menu-item image-menu-item hidden" data-action="replaceImage">
                <span class="icon">${icons.image}</span>
                <span>Replace Image</span>
                <span class="shortcut"></span>
            </div>
            <div class="editor-context-menu-item image-menu-item hidden" data-action="editImage">
                <span class="icon">${icons.pencil}</span>
                <span>Edit Image</span>
                <span class="shortcut"></span>
            </div>
            <div class="editor-context-menu-item image-menu-item hidden" data-action="copyImageUrl">
                <span class="icon">${icons.link}</span>
                <span>Copy Image URL</span>
                <span class="shortcut"></span>
            </div>
            <div class="editor-context-menu-divider bg-image-menu-divider hidden"></div>
            <div class="editor-context-menu-item bg-image-menu-item hidden" data-action="editBgImage">
                <span class="icon">${icons.image}</span>
                <span>Edit Background Image</span>
                <span class="shortcut"></span>
            </div>
            <div class="editor-context-menu-divider"></div>
            <div class="editor-context-menu-item danger" data-action="delete">
                <span class="icon">${icons.trash}</span>
                <span>Delete</span>
                <span class="shortcut">Del</span>
            </div>
        `;

        document.body.appendChild(menu);
        this.contextMenu = menu;

        // Handle menu item clicks
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.editor-context-menu-item');
            if (!item || item.classList.contains('disabled')) return;

            const action = item.dataset.action;
            this.emit('action:' + action);
            this.hide();
        });

        // Hide on click outside (main document)
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.editor-context-menu')) {
                this.hide();
            }
        });

        // Hide on click inside iframe (재등록 가능하도록 분리)
        this._attachIframeHideHandler();

        // Hide on escape (main document)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });

        // Hide on escape (iframe) - 재등록 가능하도록 분리
        this._attachIframeEscapeHandler();

        return menu;
    }

    /**
     * Show context menu at screen position
     * @param {number} screenX - Screen X position (main document coordinates)
     * @param {number} screenY - Screen Y position (main document coordinates)
     * @param {Object} options - Menu options
     */
    show(screenX, screenY, options = {}) {
        if (!this.contextMenu) {
            this.createContextMenu();
        }

        // Update menu items based on options
        const pasteItem = this.contextMenu.querySelector('[data-action="paste"]');
        if (pasteItem) {
            pasteItem.classList.toggle('disabled', !options.hasClipboard);
        }

        // Show/hide image-related items
        const isImage = options.elementTag === 'IMG';
        this.contextMenu.querySelectorAll('.image-menu-item, .image-menu-divider').forEach(el => {
            el.classList.toggle('hidden', !isImage);
        });

        // Show/hide background image edit item
        let hasBgImage = false;
        if (!isImage && options.element) {
            try {
                const bg = getComputedStyle(options.element).backgroundImage;
                hasBgImage = bg && bg !== 'none' && bg.includes('url(');
            } catch (e) { /* cross-origin */ }
        }
        this.contextMenu.querySelectorAll('.bg-image-menu-item, .bg-image-menu-divider').forEach(el => {
            el.classList.toggle('hidden', !hasBgImage);
        });

        // Position menu in main document coordinates
        this.contextMenu.style.left = screenX + 'px';
        this.contextMenu.style.top = screenY + 'px';
        this.contextMenu.classList.add('visible');

        // Ensure menu stays within viewport (main document viewport)
        const menuRect = this.contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (menuRect.right > viewportWidth) {
            this.contextMenu.style.left = (screenX - menuRect.width) + 'px';
        }
        if (menuRect.bottom > viewportHeight) {
            this.contextMenu.style.top = (screenY - menuRect.height) + 'px';
        }
    }

    /**
     * Show context menu from iframe event
     * iframe 내부 좌표를 메인 document 좌표로 변환하여 메뉴 표시
     * @param {MouseEvent} iframeEvent - iframe 내부에서 발생한 이벤트
     * @param {Object} options - Menu options (iframe: 멀티뷰에서 클릭된 iframe)
     */
    showFromIframeEvent(iframeEvent, options = {}) {
        // 멀티뷰: 전달받은 iframe 사용, 단일뷰: previewFrame 사용
        const targetFrame = options.iframe || this.previewFrame;
        if (!targetFrame) return;

        const iframeRect = targetFrame.getBoundingClientRect();
        const zoom = this.zoomManager?.getZoomLevel() || 1;

        // iframe 내부 좌표를 화면 좌표로 변환
        // Note: pan 오프셋은 iframeRect(CSS transform)에 이미 반영됨
        const screenX = iframeRect.left + iframeEvent.clientX * zoom;
        const screenY = iframeRect.top + iframeEvent.clientY * zoom;

        this.show(screenX, screenY, options);
    }

    /**
     * Hide context menu
     */
    hide() {
        if (this.contextMenu) {
            this.contextMenu.classList.remove('visible');
        }
    }

    /**
     * Check if context menu is visible
     * @returns {boolean}
     */
    isVisible() {
        return this.contextMenu?.classList.contains('visible') || false;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }
}

export default ContextMenuManager;
