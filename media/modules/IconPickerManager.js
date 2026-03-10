import EventEmitter from './EventEmitter.js';

class IconPickerManager extends EventEmitter {
    constructor(dependencies) {
        super();
        this.previewManager = dependencies.previewManager;
        this.undoRedoManager = dependencies.undoRedoManager;
        this.uiHelper = dependencies.uiHelper;
        this.editorApp = dependencies.editorApp;
        this.selectionManager = dependencies.selectionManager;

        this.panel = null;
        this.toggleBtn = null;
        this.isOpen = false;
        this.iconGrid = null;

        this.allIcons = [];
        this.filteredIcons = [];
        this.svgData = {};
        this.iconDataLoaded = false;
        this.isLoading = false;

        this.searchQuery = '';
        this.searchDebounceTimer = null;
        this.currentCategory = 'all';
        this.categories = [];

        this.visibleCount = 80;
        this.loadedCount = 0;
        this.scrollObserver = null;
        this.sentinel = null;

        this.iconSize = 24;
        this.iconColor = '';
        this.iconStrokeWidth = 2;

        this.selectedIconForReplace = null;
    }

    init() {
        this.createPanel();
        this.createToggleButton();
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'iconPickerPanel';
        this.panel.className = 'icon-picker-panel';
        this.panel.innerHTML = `
            <div class="icon-picker-header">
                <h3>Icons</h3>
                <div class="panel-header-actions">
                    <button class="panel-toggle-btn icon-panel-close" title="Close Panel">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15,18 9,12 15,6"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="icon-picker-search">
                <div class="icon-search-input-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="iconSearchInput"
                           placeholder="Search icons..."
                           autocomplete="off" />
                </div>
            </div>
            <div class="icon-picker-categories">
                <select id="iconCategorySelect" class="icon-category-select">
                    <option value="all">All Categories</option>
                </select>
            </div>
            <div class="icon-picker-settings">
                <div class="icon-setting-row">
                    <label>Size</label>
                    <input type="number" id="iconSizeInput" value="24" min="12" max="128" step="4" />
                    <span>px</span>
                </div>
                <div class="icon-setting-row">
                    <label>Color</label>
                    <input type="color" id="iconColorInput" value="#000000" />
                    <button class="icon-color-reset" id="iconColorReset" title="currentColor (inherit)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                        </svg>
                    </button>
                </div>
                <div class="icon-setting-row">
                    <label>Stroke</label>
                    <input type="number" id="iconStrokeInput" value="2" min="0.5" max="4" step="0.5" />
                </div>
            </div>
            <div class="icon-picker-grid" id="iconGrid">
                <div class="icon-grid-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                    </svg>
                    <p>Click to load icons</p>
                </div>
            </div>
            <div class="icon-picker-footer">
                <span class="icon-result-count" id="iconResultCount"></span>
            </div>
        `;

        document.body.appendChild(this.panel);

        this.iconGrid = this.panel.querySelector('#iconGrid');

        this.panel.querySelector('.icon-panel-close').addEventListener('click', () => this.close());

        // Search
        const searchInput = this.panel.querySelector('#iconSearchInput');
        searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.applyFilters();
            }, 300);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(this.searchDebounceTimer);
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.applyFilters();
            }
        });

        // Category
        this.panel.querySelector('#iconCategorySelect').addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.applyFilters();
        });

        // Settings
        this.panel.querySelector('#iconSizeInput').addEventListener('change', (e) => {
            this.iconSize = parseInt(e.target.value) || 24;
        });
        this.panel.querySelector('#iconColorInput').addEventListener('input', (e) => {
            this.iconColor = e.target.value;
        });
        this.panel.querySelector('#iconColorReset').addEventListener('click', () => {
            this.iconColor = '';
            this.panel.querySelector('#iconColorInput').value = '#000000';
        });
        this.panel.querySelector('#iconStrokeInput').addEventListener('change', (e) => {
            this.iconStrokeWidth = parseFloat(e.target.value) || 2;
        });
    }

    createToggleButton() {
        const togglesArea = document.querySelector('.left-panel-toggles');
        if (!togglesArea) return;

        const btn = document.createElement('button');
        btn.className = 'left-panel-toggle-btn icon-picker-toggle';
        btn.id = 'iconPanelExpandBtn';
        btn.title = 'Icons';
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
        `;
        btn.addEventListener('click', () => this.toggle());

        const imageBtn = togglesArea.querySelector('#imagePanelExpandBtn');
        if (imageBtn) {
            imageBtn.parentNode.insertBefore(btn, imageBtn.nextSibling);
        } else {
            togglesArea.appendChild(btn);
        }

        this.toggleBtn = btn;
    }

    async loadIconData() {
        if (this.iconDataLoaded || this.isLoading) return;
        this.isLoading = true;

        this.iconGrid.innerHTML = `
            <div class="icon-grid-loading">
                <div class="icon-loading-spinner"></div>
                <p>Loading icons...</p>
            </div>
        `;

        try {
            const [metaRes, svgRes] = await Promise.all([
                fetch('/api/icons/metadata'),
                fetch('/api/icons/svg-data')
            ]);

            if (!metaRes.ok || !svgRes.ok) {
                throw new Error('Failed to fetch icon data');
            }

            const metadata = await metaRes.json();
            const svgData = await svgRes.json();

            this.svgData = svgData;
            this.categories = metadata.categories || [];

            // Build icon list with category info from tags
            this.allIcons = (metadata.icons || []).map(icon => ({
                name: icon.name,
                tags: icon.tags || [],
                hasSvg: !!svgData[icon.name]
            })).filter(icon => icon.hasSvg);

            // Sort alphabetically
            this.allIcons.sort((a, b) => a.name.localeCompare(b.name));

            // Populate category dropdown
            this.populateCategories();

            this.iconDataLoaded = true;
            this.applyFilters();
        } catch (error) {
            console.error('Failed to load icon data:', error);
            this.iconGrid.innerHTML = `
                <div class="icon-grid-empty">
                    <p>Failed to load icons</p>
                    <button class="icon-retry-btn" style="margin-top:8px;padding:4px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:var(--text-primary);cursor:pointer;">Retry</button>
                </div>
            `;
            this.iconGrid.querySelector('.icon-retry-btn')?.addEventListener('click', () => {
                this.isLoading = false;
                this.loadIconData();
            });
        } finally {
            this.isLoading = false;
        }
    }

    populateCategories() {
        const select = this.panel.querySelector('#iconCategorySelect');
        select.innerHTML = '<option value="all">All Categories</option>';
        for (const cat of this.categories) {
            if (cat.id === 'all') continue;
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        }
    }

    applyFilters() {
        let icons = this.allIcons;

        // Search filter
        if (this.searchQuery) {
            icons = icons.filter(icon =>
                icon.name.includes(this.searchQuery) ||
                icon.tags.some(tag => tag.includes(this.searchQuery))
            );
        }

        // Category filter (tag-based matching)
        if (this.currentCategory !== 'all') {
            const cat = this.currentCategory.toLowerCase();
            icons = icons.filter(icon =>
                icon.tags.some(tag => tag.includes(cat)) ||
                icon.name.includes(cat)
            );
        }

        this.filteredIcons = icons;
        this.loadedCount = 0;
        this.renderIcons();
    }

    renderIcons() {
        this.iconGrid.innerHTML = '';

        if (this.filteredIcons.length === 0) {
            this.iconGrid.innerHTML = `
                <div class="icon-grid-empty">
                    <p>No icons found</p>
                </div>
            `;
            this.updateResultCount(0);
            return;
        }

        const batch = this.filteredIcons.slice(0, this.visibleCount);
        this.loadedCount = batch.length;

        const fragment = document.createDocumentFragment();
        for (const icon of batch) {
            fragment.appendChild(this.createIconItem(icon));
        }
        this.iconGrid.appendChild(fragment);

        // Infinite scroll sentinel
        if (this.loadedCount < this.filteredIcons.length) {
            this.setupInfiniteScroll();
        }

        this.updateResultCount(this.filteredIcons.length);
    }

    createIconItem(icon) {
        const div = document.createElement('div');
        div.className = 'icon-item';
        div.dataset.iconName = icon.name;
        div.title = icon.name;

        const svgBody = this.svgData[icon.name] || '';
        div.innerHTML = `
            <div class="icon-preview">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgBody}</svg>
            </div>
            <span class="icon-name">${icon.name}</span>
        `;

        div.addEventListener('click', () => {
            if (this.selectedIconForReplace) {
                this.replaceIcon(icon.name);
            } else {
                this.insertIcon(icon.name);
            }
        });

        return div;
    }

    setupInfiniteScroll() {
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
        }

        this.sentinel = document.createElement('div');
        this.sentinel.className = 'icon-scroll-sentinel';
        this.iconGrid.appendChild(this.sentinel);

        this.scrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.loadMore();
            }
        }, {
            root: this.iconGrid,
            rootMargin: '100px'
        });

        this.scrollObserver.observe(this.sentinel);
    }

    loadMore() {
        if (this.loadedCount >= this.filteredIcons.length) {
            if (this.scrollObserver) {
                this.scrollObserver.disconnect();
                this.scrollObserver = null;
            }
            if (this.sentinel) {
                this.sentinel.remove();
                this.sentinel = null;
            }
            return;
        }

        const nextBatch = this.filteredIcons.slice(this.loadedCount, this.loadedCount + this.visibleCount);
        this.loadedCount += nextBatch.length;

        // Remove sentinel temporarily
        if (this.sentinel) this.sentinel.remove();

        const fragment = document.createDocumentFragment();
        for (const icon of nextBatch) {
            fragment.appendChild(this.createIconItem(icon));
        }
        this.iconGrid.appendChild(fragment);

        // Re-add sentinel if more to load
        if (this.loadedCount < this.filteredIcons.length) {
            this.iconGrid.appendChild(this.sentinel);
            this.scrollObserver?.observe(this.sentinel);
        } else {
            if (this.scrollObserver) {
                this.scrollObserver.disconnect();
                this.scrollObserver = null;
            }
            this.sentinel = null;
        }
    }

    updateResultCount(count) {
        const el = this.panel.querySelector('#iconResultCount');
        if (el) {
            el.textContent = `${count} icon${count !== 1 ? 's' : ''}`;
        }
    }

    insertIcon(iconName) {
        const mainIframe = this.previewManager.getMainFrame();
        if (!mainIframe) return;

        const doc = mainIframe.contentDocument || mainIframe.contentWindow.document;
        if (!doc || !doc.body) return;

        // Create <i data-lucide="icon-name">
        const iconEl = doc.createElement('i');
        iconEl.setAttribute('data-lucide', iconName);

        // Apply size/color/stroke as inline style
        const styles = [];
        if (this.iconSize && this.iconSize !== 24) {
            styles.push(`width:${this.iconSize}px`);
            styles.push(`height:${this.iconSize}px`);
        }
        if (this.iconColor) {
            styles.push(`color:${this.iconColor}`);
        }
        if (this.iconStrokeWidth && this.iconStrokeWidth !== 2) {
            iconEl.setAttribute('data-lucide-stroke-width', this.iconStrokeWidth);
        }
        if (styles.length > 0) {
            iconEl.setAttribute('style', styles.join(';'));
        }

        // Determine insert target
        const selectedElement = this.selectionManager?.getSelectedElement?.();
        if (selectedElement && selectedElement !== doc.body && selectedElement.parentNode) {
            selectedElement.parentNode.insertBefore(iconEl, selectedElement.nextSibling);
        } else {
            doc.body.appendChild(iconEl);
        }

        // Ensure Lucide CDN is loaded
        this.editorApp._ensureLucideCDN(doc);

        // Reinitialize Lucide to render <i> → <svg>
        const win = mainIframe.contentWindow;
        const renderIcon = () => {
            if (win.lucide?.createIcons) {
                win.lucide.createIcons();
                this._afterIconInserted(doc, iconName, iconEl);
            } else {
                // Wait for Lucide script to load
                setTimeout(renderIcon, 200);
            }
        };

        setTimeout(renderIcon, 100);

        this.uiHelper?.showToast?.(`Icon "${iconName}" inserted`, 'success');
    }

    _afterIconInserted(doc, iconName, originalEl) {
        setTimeout(() => {
            // Find the rendered SVG (Lucide replaces <i> with <svg>)
            // The original <i> element is replaced, so find the SVG near its position
            const allLucideSvgs = doc.querySelectorAll(`svg[class*="lucide-${iconName}"]`);
            const renderedSvg = allLucideSvgs.length > 0
                ? allLucideSvgs[allLucideSvgs.length - 1]
                : null;

            const targetEl = renderedSvg || originalEl;

            // Record for UndoRedo - ★ recordStructureChange 사용 (recordChange는 structure 미지원)
            if (targetEl.parentNode && this.undoRedoManager) {
                const parentPath = this.undoRedoManager.getElementPath(targetEl.parentNode);
                const index = Array.from(targetEl.parentNode.children).indexOf(targetEl);
                this.undoRedoManager.recordStructureChange('add', {
                    elementPath: this.undoRedoManager.getElementPath(targetEl),
                    parentPath,
                    index,
                    html: targetEl.outerHTML
                });
            }

            this.emit('icon:inserted', {
                element: targetEl,
                iconName: iconName
            });
        }, 200);
    }

    // === Select Mode (icon replacement on double-click) ===

    openIconSelector(svgElement) {
        this.selectedIconForReplace = svgElement;
        this.open();
        this.panel.classList.add('select-mode');
        this.panel.querySelector('.icon-picker-header h3').textContent = 'Select Icon';
    }

    replaceIcon(newIconName) {
        if (!this.selectedIconForReplace) return;

        const el = this.selectedIconForReplace;
        const doc = el.ownerDocument;
        if (!doc) return;

        // Record old HTML for undo
        const oldHtml = el.outerHTML;
        const parent = el.parentNode;
        if (!parent) return;

        // Create new <i data-lucide="newIconName"> element
        const newIconEl = doc.createElement('i');
        newIconEl.setAttribute('data-lucide', newIconName);

        // Preserve size/color from original SVG
        const oldWidth = el.getAttribute('width') || el.style.width;
        const oldHeight = el.getAttribute('height') || el.style.height;
        const oldColor = el.style.color || el.getAttribute('stroke');

        const styles = [];
        if (oldWidth && oldWidth !== '24') {
            const w = parseInt(oldWidth);
            if (w) {
                styles.push(`width:${w}px`);
                styles.push(`height:${w}px`);
            }
        }
        if (oldColor && oldColor !== 'currentColor') {
            styles.push(`color:${oldColor}`);
        }
        if (styles.length > 0) {
            newIconEl.setAttribute('style', styles.join(';'));
        }

        // Replace in DOM
        parent.replaceChild(newIconEl, el);

        // Ensure Lucide CDN & render
        this.editorApp._ensureLucideCDN(doc);
        const win = doc.defaultView;
        const render = () => {
            if (win?.lucide?.createIcons) {
                win.lucide.createIcons();
                this._afterIconReplaced(doc, newIconName, newIconEl, oldHtml, parent);
            } else {
                setTimeout(render, 200);
            }
        };
        setTimeout(render, 100);

        this.uiHelper?.showToast?.(`Icon changed to "${newIconName}"`, 'success');
    }

    _afterIconReplaced(doc, iconName, originalEl, oldHtml, parent) {
        setTimeout(() => {
            const allLucideSvgs = doc.querySelectorAll(`svg[class*="lucide-${iconName}"]`);
            const renderedSvg = allLucideSvgs.length > 0
                ? allLucideSvgs[allLucideSvgs.length - 1]
                : null;
            const targetEl = renderedSvg || originalEl;

            // Keep select mode: update reference to the new rendered SVG
            this.selectedIconForReplace = targetEl;

            // UndoRedo: ★ recordElementSnapshot 사용 (아이콘 교체 = DOM 요소 교체)
            if (this.undoRedoManager && targetEl) {
                this.undoRedoManager.recordElementSnapshot(targetEl, oldHtml, targetEl.outerHTML);
            }

            this.emit('icon:replaced', {
                element: targetEl,
                iconName: iconName
            });
        }, 200);
    }

    /**
     * 외부에서 선택된 요소가 Lucide 아이콘일 때 교체 대상 갱신
     */
    updateSelectedIcon(svgElement) {
        if (!this.isOpen || !this.panel.classList.contains('select-mode')) return;
        this.selectedIconForReplace = svgElement;
    }

    cancelSelectMode() {
        this.selectedIconForReplace = null;
        this.panel.classList.remove('select-mode');
        this.panel.querySelector('.icon-picker-header h3').textContent = 'Icons';
    }

    open() {
        if (this.isOpen) return;
        this.editorApp.closeAllLeftPanels('icon');
        this.panel.classList.add('open');
        this.isOpen = true;
        this.toggleBtn?.classList.add('active');

        if (!this.iconDataLoaded) {
            this.loadIconData();
        }
    }

    close() {
        if (!this.isOpen) return;
        if (this.selectedIconForReplace) {
            this.cancelSelectMode();
        }
        this.panel.classList.remove('open');
        this.isOpen = false;
        this.toggleBtn?.classList.remove('active');
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}

export default IconPickerManager;
