import EventEmitter from './EventEmitter.js';

class LayerPanel extends EventEmitter {
    constructor(editor, previewManager = null) {
        super();
        this.editor = editor;
        this.previewManager = previewManager; // 멀티뷰 지원

        // DOM Elements
        this.panel = document.getElementById('layerPanel');
        this.toggleBtn = document.getElementById('layerPanelToggleBtn');
        this.expandBtn = document.getElementById('layerPanelExpandBtn');
        this.resizer = document.getElementById('layerResizer');
        this.treeContainer = document.getElementById('layerTree');
        this.selectionInfo = document.getElementById('layerSelectionInfo');
        this.bulkActions = document.getElementById('layerBulkActions');

        // State
        this.selectedElements = new Set();
        this.expandedNodes = new Set();
        this.expandedElements = new WeakSet(); // 요소 기반 expanded 상태 추적
        this._hasInitialExpand = false; // 첫 렌더링에서 자동 펼침 완료 여부
        this.elementToLayerMap = new WeakMap();
        this.layerToElementMap = new Map();
        this.dragState = null;
        this.contextMenu = null;
        this.isInternalSelection = false;

        // Clipboard
        this.clipboard = []; // 복사된 요소들의 HTML
        this.clipboardIsCut = false; // 잘라내기 여부

        // Element ID counter for layer mapping
        this.layerIdCounter = 0;

        this.init();
    }

    init() {
        if (!this.panel || !this.treeContainer) return;

        this.setupPanelToggle();
        this.setupResizer();
        this.setupBulkActions();
        this.setupKeyboardShortcuts();
        this.setupPreviewLoadListener();
    }

    getDocument() {
        // previewManager가 있으면 활성 iframe의 document 반환 (멀티뷰 지원)
        if (this.previewManager) {
            return this.previewManager.getDocument();
        }
        // fallback: 기존 방식
        if (this.editor && this.editor.previewFrame) {
            return this.editor.previewFrame.contentDocument ||
                   this.editor.previewFrame.contentWindow?.document;
        }
        return null;
    }

    /**
     * 활성 iframe 변경 시 레이어 트리 새로고침 (멀티뷰 지원)
     */
    setActiveIframe(iframe) {
        this.refresh();
    }

    setupPanelToggle() {
        // Panel toggle is now handled by EditorApp.js for unified left sidebar management
        // Only setup collapse/expand all buttons here

        // Collapse/Expand all buttons
        const collapseAllBtn = document.getElementById('layerCollapseAllBtn');
        const expandAllBtn = document.getElementById('layerExpandAllBtn');

        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => this.collapseAll());
        }
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => this.expandAll());
        }
    }

    setupResizer() {
        if (!this.resizer || !this.panel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const startResize = (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startWidth = this.panel.offsetWidth;
            this.resizer.classList.add('active');
            this.panel.style.transition = 'none'; // Disable transition during drag
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            // Create overlay to prevent iframe from capturing mouse events
            this.createResizeOverlay();
        };

        const doResize = (e) => {
            if (!isResizing) return;
            e.preventDefault();
            const diff = e.clientX - startX;
            const newWidth = Math.max(180, Math.min(500, startWidth + diff));
            this.panel.style.width = newWidth + 'px';
            this.panel.style.minWidth = newWidth + 'px';
        };

        const stopResize = () => {
            if (isResizing) {
                isResizing = false;
                this.resizer.classList.remove('active');
                this.panel.style.transition = ''; // Re-enable transition
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Remove overlay
                this.removeResizeOverlay();
            }
        };

        this.resizer.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);

        // Also handle mouse leaving the window
        document.addEventListener('mouseleave', stopResize);
    }

    createResizeOverlay() {
        // Create an overlay to prevent iframe from capturing mouse events during resize
        if (this.resizeOverlay) return;
        this.resizeOverlay = document.createElement('div');
        this.resizeOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            cursor: col-resize;
        `;
        document.body.appendChild(this.resizeOverlay);
    }

    removeResizeOverlay() {
        if (this.resizeOverlay && this.resizeOverlay.parentNode) {
            this.resizeOverlay.parentNode.removeChild(this.resizeOverlay);
            this.resizeOverlay = null;
        }
    }

    setupBulkActions() {
        const moveUpBtn = document.getElementById('layerBulkMoveUp');
        const moveDownBtn = document.getElementById('layerBulkMoveDown');
        const duplicateBtn = document.getElementById('layerBulkDuplicate');
        const deleteBtn = document.getElementById('layerBulkDelete');

        if (moveUpBtn) {
            moveUpBtn.addEventListener('click', () => this.moveSelectedElements('up'));
        }
        if (moveDownBtn) {
            moveDownBtn.addEventListener('click', () => this.moveSelectedElements('down'));
        }
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', () => this.duplicateSelectedElements());
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSelectedElements());
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle if layer panel is focused or has selection
            if (this.selectedElements.size === 0) return;
            if (document.activeElement.tagName === 'INPUT' ||
                document.activeElement.tagName === 'TEXTAREA') return;

            // 레이어 패널 내부에서만 동작하는 키
            const isInLayerPanel = this.panel.contains(document.activeElement) ||
                                   document.activeElement === document.body;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.deleteSelectedElements();
            } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                // Ctrl+C: 복사
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.copySelectedElements();
            } else if (e.key === 'x' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                // Ctrl+X: 잘라내기
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.cutSelectedElements();
            } else if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                // Ctrl+V: 붙여넣기
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.pasteElements();
            } else if (e.key === 'd' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                // Ctrl+D: 복제
                e.preventDefault();
                this.duplicateSelectedElements();
            } else if (e.key === 'ArrowUp' && e.altKey) {
                e.preventDefault();
                this.moveSelectedElements('up');
            } else if (e.key === 'ArrowDown' && e.altKey) {
                e.preventDefault();
                this.moveSelectedElements('down');
            } else if (e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey && !e.metaKey) {
                // 위쪽 항목 선택 (Shift: 복수 선택)
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.selectPreviousItem(e.shiftKey);
            } else if (e.key === 'ArrowDown' && !e.altKey && !e.ctrlKey && !e.metaKey) {
                // 아래쪽 항목 선택 (Shift: 복수 선택)
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.selectNextItem(e.shiftKey);
            } else if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                // 폴딩 (접기)
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.collapseSelectedItem();
            } else if (e.key === 'ArrowRight' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                // 언폴딩 (펼치기)
                if (!isInLayerPanel) return;
                e.preventDefault();
                this.expandSelectedItem();
            } else if (e.key === 'F2') {
                e.preventDefault();
                this.startRenameFirstSelected();
            }
        });
    }

    setupPreviewLoadListener() {
        if (this.editor && this.editor.previewFrame) {
            this.editor.previewFrame.addEventListener('load', () => {
                setTimeout(() => this.refresh(), 100);
            });
        }

        // Close context menu on click outside
        document.addEventListener('click', (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this.closeContextMenu();
            }
        });
    }

    // Called from editor when element is selected in preview
    onElementSelected(element) {
        if (this.isInternalSelection) return;
        this.syncSelectionFromPreview(element);
    }

    refresh() {
        const doc = this.getDocument();
        if (!doc || !doc.body) return;

        this.treeContainer.innerHTML = '';
        this.layerToElementMap.clear();
        this.expandedNodes.clear(); // layerId 기반은 초기화 (expandedElements는 유지)
        this.layerIdCounter = 0;

        // Build tree from body children
        const bodyChildren = Array.from(doc.body.children);
        bodyChildren.forEach(child => {
            if (this.shouldIncludeElement(child)) {
                const layerItem = this.createLayerItem(child);
                if (layerItem) {
                    this.treeContainer.appendChild(layerItem);
                }
            }
        });

        // 첫 렌더링 완료 표시 (이후부터는 expandedElements 기준)
        this._hasInitialExpand = true;
        this.updateSelectionInfo();
    }

    shouldIncludeElement(element) {
        // Skip script, style, and editor-specific elements
        const skipTags = ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'];
        if (skipTags.includes(element.tagName)) return false;

        // Skip editor injected styles
        if (element.tagName === 'STYLE' && element.textContent.includes('editor-highlight')) {
            return false;
        }

        // Skip editor UI elements injected into preview
        const id = element.id || '';
        const className = element.className || '';

        // List of editor-specific IDs to skip
        const editorIds = [
            'editor-overlay',
            'editor-margin-overlay',
            'editor-padding-overlay',
            'editor-context-menu',
            'editor-drop-indicator',
            'editor-multi-select-style'
        ];

        if (editorIds.includes(id)) return false;

        // Skip elements with editor- prefixed classes or br-indicator
        if (typeof className === 'string' && (
            className.includes('editor-overlay') ||
            className.includes('editor-margin') ||
            className.includes('editor-padding') ||
            className.includes('editor-context-menu') ||
            className.includes('editor-drop-indicator') ||
            className.includes('br-indicator')
        )) {
            return false;
        }

        // Skip elements with id starting with editor-
        if (id && id.startsWith('editor-')) {
            return false;
        }

        return true;
    }

    createLayerItem(element, depth = 0) {
        if (!this.shouldIncludeElement(element)) return null;

        const layerId = 'layer-' + (++this.layerIdCounter);
        this.elementToLayerMap.set(element, layerId);
        this.layerToElementMap.set(layerId, element);

        const item = document.createElement('div');
        item.className = 'layer-item';
        item.dataset.layerId = layerId;
        item.dataset.depth = depth;

        const hasChildren = this.getVisibleChildren(element).length > 0;
        // 요소 기반으로 expanded 상태 확인
        // 첫 렌더링 시 depth < 2는 자동 펼침, 이후에는 expandedElements 기준
        const isExpanded = this.expandedElements.has(element) ||
                          (depth < 2 && !this._hasInitialExpand);

        if (isExpanded) {
            this.expandedNodes.add(layerId);
            this.expandedElements.add(element);
        }

        // Row
        const row = document.createElement('div');
        row.className = 'layer-item-row';
        row.draggable = true;

        // Toggle arrow
        const toggle = document.createElement('span');
        toggle.className = 'layer-toggle' + (isExpanded ? ' expanded' : '') + (!hasChildren ? ' no-children' : '');
        toggle.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6"/>
        </svg>`;
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(layerId);
        });
        row.appendChild(toggle);

        // Tag name
        const tag = document.createElement('span');
        tag.className = 'layer-tag';
        tag.textContent = element.tagName.toLowerCase();
        row.appendChild(tag);

        // Custom label (from data-layer-name)
        const labelText = element.dataset.layerName || this.getDefaultLabel(element);
        const label = document.createElement('span');
        label.className = 'layer-label';
        label.textContent = labelText;
        label.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.startRename(layerId, label);
        });
        row.appendChild(label);

        // ID와 Classes를 하나의 뱃지로 표시
        const id = element.id;
        const classes = Array.from(element.classList).filter(c =>
            !c.startsWith('editor-')
        );

        if (id || classes.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'layer-selector-badge';

            let selectorText = '';
            if (id) {
                selectorText = '#' + id;
            }
            if (classes.length > 0) {
                // 클래스가 많으면 첫 번째만 표시
                const displayClass = classes[0];
                if (id) {
                    selectorText += '.' + displayClass;
                } else {
                    selectorText = '.' + displayClass;
                }
                if (classes.length > 1) {
                    selectorText += ' +' + (classes.length - 1);
                }
            }

            badge.textContent = selectorText;
            badge.title = (id ? '#' + id : '') + (classes.length > 0 ? '.' + classes.join('.') : '');
            row.appendChild(badge);
        }

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'layer-actions';

        // Duplicate button
        const dupBtn = document.createElement('button');
        dupBtn.className = 'layer-action';
        dupBtn.title = 'Duplicate';
        dupBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>`;
        dupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.duplicateElement(element);
        });
        actions.appendChild(dupBtn);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'layer-action danger';
        delBtn.title = 'Delete';
        delBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>`;
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteElement(element);
        });
        actions.appendChild(delBtn);

        row.appendChild(actions);

        // Row click handler
        row.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                // Toggle selection
                if (this.selectedElements.has(element)) {
                    this.removeFromSelection(element, layerId);
                } else {
                    this.addToSelection(element, layerId);
                }
            } else if (e.shiftKey && this.selectedElements.size > 0) {
                // Range selection
                this.rangeSelect(element, layerId);
            } else {
                // Single selection
                this.selectSingle(element, layerId);
            }
        });

        // Context menu
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, element, layerId);
        });

        // Drag & Drop
        this.setupDragAndDrop(row, element, layerId);

        item.appendChild(row);

        // Children container
        if (hasChildren) {
            const children = document.createElement('div');
            children.className = 'layer-children' + (isExpanded ? '' : ' collapsed');

            this.getVisibleChildren(element).forEach(child => {
                const childItem = this.createLayerItem(child, depth + 1);
                if (childItem) {
                    children.appendChild(childItem);
                }
            });

            item.appendChild(children);
        }

        return item;
    }

    getVisibleChildren(element) {
        return Array.from(element.children).filter(child =>
            this.shouldIncludeElement(child)
        );
    }

    getDefaultLabel(element) {
        // Generate a default label based on element content
        const textContent = element.textContent.trim();
        if (textContent && textContent.length < 30) {
            return textContent.substring(0, 25) + (textContent.length > 25 ? '...' : '');
        }
        return '';
    }

    toggleNode(layerId) {
        const item = this.treeContainer.querySelector(`[data-layer-id="${layerId}"]`);
        if (!item) return;

        const toggle = item.querySelector('.layer-toggle');
        const children = item.querySelector('.layer-children');
        const element = this.layerToElementMap.get(layerId);

        if (!children) return;

        if (this.expandedNodes.has(layerId)) {
            this.expandedNodes.delete(layerId);
            if (element) this.expandedElements.delete(element);
            toggle.classList.remove('expanded');
            children.classList.add('collapsed');
        } else {
            this.expandedNodes.add(layerId);
            if (element) this.expandedElements.add(element);
            toggle.classList.add('expanded');
            children.classList.remove('collapsed');
        }
    }

    /**
     * 현재 보이는 모든 레이어 항목의 row 요소를 순서대로 반환
     */
    getVisibleLayerRows() {
        const rows = [];
        const collectVisibleRows = (container) => {
            const items = container.querySelectorAll(':scope > .layer-item');
            items.forEach(item => {
                const row = item.querySelector(':scope > .layer-item-row');
                if (row) {
                    rows.push(row);
                }
                // 자식 컨테이너가 펼쳐져 있으면 자식도 수집
                const children = item.querySelector(':scope > .layer-children');
                if (children && !children.classList.contains('collapsed')) {
                    collectVisibleRows(children);
                }
            });
        };
        collectVisibleRows(this.treeContainer);
        return rows;
    }

    /**
     * 위쪽 항목 선택
     * @param {boolean} addToSelection - Shift 키로 복수 선택 여부
     */
    selectPreviousItem(addToSelection = false) {
        const visibleRows = this.getVisibleLayerRows();
        if (visibleRows.length === 0) return;

        // 현재 선택된 첫 번째 요소의 인덱스 찾기
        let currentIndex = -1;
        for (const el of this.selectedElements) {
            const layerId = this.elementToLayerMap.get(el);
            if (layerId) {
                const row = this.getRowByLayerId(layerId);
                const idx = visibleRows.indexOf(row);
                if (idx !== -1 && (currentIndex === -1 || idx < currentIndex)) {
                    currentIndex = idx;
                }
            }
        }

        // 위쪽으로 이동
        const newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        const targetRow = visibleRows[newIndex];
        if (targetRow) {
            const layerId = targetRow.closest('.layer-item').dataset.layerId;
            const element = this.layerToElementMap.get(layerId);
            if (element) {
                if (addToSelection) {
                    this.addToSelection(element, layerId);
                } else {
                    this.selectSingle(element, layerId);
                }
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    /**
     * 아래쪽 항목 선택
     * @param {boolean} addToSelection - Shift 키로 복수 선택 여부
     */
    selectNextItem(addToSelection = false) {
        const visibleRows = this.getVisibleLayerRows();
        if (visibleRows.length === 0) return;

        // 현재 선택된 마지막 요소의 인덱스 찾기
        let currentIndex = -1;
        for (const el of this.selectedElements) {
            const layerId = this.elementToLayerMap.get(el);
            if (layerId) {
                const row = this.getRowByLayerId(layerId);
                const idx = visibleRows.indexOf(row);
                if (idx !== -1 && idx > currentIndex) {
                    currentIndex = idx;
                }
            }
        }

        // 아래쪽으로 이동
        const newIndex = currentIndex < visibleRows.length - 1 ? currentIndex + 1 : visibleRows.length - 1;
        const targetRow = visibleRows[newIndex];
        if (targetRow) {
            const layerId = targetRow.closest('.layer-item').dataset.layerId;
            const element = this.layerToElementMap.get(layerId);
            if (element) {
                if (addToSelection) {
                    this.addToSelection(element, layerId);
                } else {
                    this.selectSingle(element, layerId);
                }
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    /**
     * 선택된 항목 폴딩 (접기)
     */
    collapseSelectedItem() {
        if (this.selectedElements.size === 0) return;

        const element = this.selectedElements.values().next().value;
        const layerId = this.elementToLayerMap.get(element);
        if (!layerId) return;

        const item = this.treeContainer.querySelector(`[data-layer-id="${layerId}"]`);
        if (!item) return;

        const children = item.querySelector('.layer-children');

        // 자식이 있고 펼쳐져 있으면 접기
        if (children && this.expandedNodes.has(layerId)) {
            this.toggleNode(layerId);
        } else {
            // 이미 접혀 있거나 자식이 없으면 부모로 이동
            const parentItem = item.parentElement?.closest('.layer-item');
            if (parentItem) {
                const parentLayerId = parentItem.dataset.layerId;
                const parentElement = this.layerToElementMap.get(parentLayerId);
                if (parentElement) {
                    this.selectSingle(parentElement, parentLayerId);
                    const parentRow = this.getRowByLayerId(parentLayerId);
                    parentRow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    }

    /**
     * 선택된 항목 언폴딩 (펼치기)
     */
    expandSelectedItem() {
        if (this.selectedElements.size === 0) return;

        const element = this.selectedElements.values().next().value;
        const layerId = this.elementToLayerMap.get(element);
        if (!layerId) return;

        const item = this.treeContainer.querySelector(`[data-layer-id="${layerId}"]`);
        if (!item) return;

        const children = item.querySelector('.layer-children');

        // 자식이 있으면
        if (children) {
            // 접혀 있으면 펼치기
            if (!this.expandedNodes.has(layerId)) {
                this.toggleNode(layerId);
            } else {
                // 이미 펼쳐져 있으면 첫 번째 자식으로 이동
                const firstChildItem = children.querySelector('.layer-item');
                if (firstChildItem) {
                    const childLayerId = firstChildItem.dataset.layerId;
                    const childElement = this.layerToElementMap.get(childLayerId);
                    if (childElement) {
                        this.selectSingle(childElement, childLayerId);
                        const childRow = this.getRowByLayerId(childLayerId);
                        childRow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            }
        }
    }

    collapseAll() {
        this.expandedNodes.clear();
        this.expandedElements = new WeakSet(); // 모두 접기
        this.treeContainer.querySelectorAll('.layer-toggle.expanded').forEach(toggle => {
            toggle.classList.remove('expanded');
        });
        this.treeContainer.querySelectorAll('.layer-children').forEach(children => {
            children.classList.add('collapsed');
        });
    }

    expandAll() {
        this.treeContainer.querySelectorAll('.layer-item').forEach(item => {
            const layerId = item.dataset.layerId;
            if (layerId) {
                this.expandedNodes.add(layerId);
                const element = this.layerToElementMap.get(layerId);
                if (element) this.expandedElements.add(element);
            }
        });
        this.treeContainer.querySelectorAll('.layer-toggle').forEach(toggle => {
            if (!toggle.classList.contains('no-children')) {
                toggle.classList.add('expanded');
            }
        });
        this.treeContainer.querySelectorAll('.layer-children').forEach(children => {
            children.classList.remove('collapsed');
        });
    }

    // Clipboard Operations

    /**
     * 선택된 요소들 복사
     */
    copySelectedElements() {
        if (this.selectedElements.size === 0) return;

        const elements = Array.from(this.selectedElements);
        // DOM 순서대로 정렬
        elements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        // HTML로 저장 (에디터 관련 클래스 제거)
        this.clipboard = elements.map(el => {
            const clone = el.cloneNode(true);
            clone.classList.remove('editor-highlight', 'editor-hover', 'editor-multi-select');
            return clone.outerHTML;
        });
        this.clipboardIsCut = false;

        this.showToast(`${elements.length}개 요소 복사됨`);
    }

    /**
     * 선택된 요소들 잘라내기
     */
    cutSelectedElements() {
        if (this.selectedElements.size === 0) return;

        const elements = Array.from(this.selectedElements);
        // DOM 순서대로 정렬
        elements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        // HTML로 저장
        this.clipboard = elements.map(el => {
            const clone = el.cloneNode(true);
            clone.classList.remove('editor-highlight', 'editor-hover', 'editor-multi-select');
            return clone.outerHTML;
        });
        this.clipboardIsCut = true;

        // 잘라낸 요소들에 시각적 표시 (반투명)
        elements.forEach(el => {
            el.style.opacity = '0.5';
            el.dataset.cutForClipboard = 'true';
        });

        this.showToast(`${elements.length}개 요소 잘라내기`);
    }

    /**
     * 클립보드 요소들 붙여넣기 (현재 선택된 요소 다음에)
     */
    pasteElements() {
        if (this.clipboard.length === 0) {
            this.showToast('클립보드가 비어있습니다');
            return;
        }

        const doc = this.getDocument();
        if (!doc) return;

        // 붙여넣기 위치 결정: 선택된 요소가 있으면 그 다음, 없으면 body 끝
        let targetElement = null;
        if (this.selectedElements.size > 0) {
            // 선택된 요소 중 마지막 요소
            const elements = Array.from(this.selectedElements);
            elements.sort((a, b) => {
                const pos = a.compareDocumentPosition(b);
                return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
            });
            targetElement = elements[elements.length - 1];
        }

        // 잘라내기였으면 원본 요소들 제거
        if (this.clipboardIsCut) {
            doc.querySelectorAll('[data-cut-for-clipboard="true"]').forEach(el => {
                el.remove();
            });
        }

        // 새 요소들 생성 및 삽입
        const parser = new DOMParser();
        const newElements = [];

        this.clipboard.forEach(html => {
            const parsed = parser.parseFromString(html, 'text/html');
            const newEl = parsed.body.firstElementChild;
            if (newEl) {
                // iframe의 document에 import
                const imported = doc.importNode(newEl, true);

                if (targetElement) {
                    // 선택된 요소 다음에 삽입
                    targetElement.parentNode.insertBefore(imported, targetElement.nextSibling);
                    targetElement = imported; // 다음 요소는 이 뒤에
                } else {
                    // body 끝에 추가
                    doc.body.appendChild(imported);
                }
                newElements.push(imported);
            }
        });

        // 잘라내기 후 붙여넣기 완료되면 클립보드 초기화
        if (this.clipboardIsCut) {
            this.clipboard = [];
            this.clipboardIsCut = false;
        }

        // 레이어 새로고침
        this.refresh();

        // 새로 붙여넣은 요소들 선택
        this.clearSelection();
        if (newElements.length > 0) {
            // 첫 번째 요소는 selectSingle로 선택 (overlay 업데이트 포함)
            const firstEl = newElements[0];
            const firstLayerId = this.elementToLayerMap.get(firstEl);
            if (firstLayerId) {
                this.selectSingle(firstEl, firstLayerId);
            }

            // 나머지 요소들은 addToSelection으로 추가
            for (let i = 1; i < newElements.length; i++) {
                const el = newElements[i];
                const layerId = this.elementToLayerMap.get(el);
                if (layerId) {
                    this.addToSelection(el, layerId);
                }
            }
        }

        this.emit('elements:pasted', { elements: newElements });
        this.triggerSave();
        this.showToast(`${newElements.length}개 요소 붙여넣기`);
    }

    // Selection Management
    selectSingle(element, layerId) {
        // Clear previous multi-select highlights
        this.selectedElements.forEach(el => {
            el.classList.remove('editor-multi-select');
        });

        this.clearSelectionUI();
        this.selectedElements.clear();
        this.selectedElements.add(element);

        const row = this.getRowByLayerId(layerId);
        if (row) {
            row.classList.add('selected');
        }

        // Sync with preview
        this.isInternalSelection = true;
        if (this.editor && typeof this.editor.selectElement === 'function') {
            this.editor.selectElement(element);
        }
        this.isInternalSelection = false;

        this.scrollToElementInPreview(element);
        this.updateSelectionInfo();
    }

    addToSelection(element, layerId) {
        this.selectedElements.add(element);

        const row = this.getRowByLayerId(layerId);
        if (row) {
            row.classList.add('selected');
        }

        // Add highlight to element in preview
        element.classList.add('editor-multi-select');

        this.updateSelectionInfo();
        this.updatePreviewMultiSelect();
    }

    removeFromSelection(element, layerId) {
        this.selectedElements.delete(element);

        const row = this.getRowByLayerId(layerId);
        if (row) {
            row.classList.remove('selected');
        }

        // Remove highlight from element in preview
        element.classList.remove('editor-multi-select');

        this.updateSelectionInfo();
        this.updatePreviewMultiSelect();
    }

    rangeSelect(endElement, endLayerId) {
        // Get all layer items in order
        const allRows = Array.from(this.treeContainer.querySelectorAll('.layer-item-row'));
        const endRow = this.getRowByLayerId(endLayerId);

        // Find the first selected element's row
        let startRow = null;
        for (const el of this.selectedElements) {
            const id = this.elementToLayerMap.get(el);
            if (id) {
                startRow = this.getRowByLayerId(id);
                break;
            }
        }

        if (!startRow || !endRow) return;

        const startIdx = allRows.indexOf(startRow);
        const endIdx = allRows.indexOf(endRow);

        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

        for (let i = from; i <= to; i++) {
            const row = allRows[i];
            const layerId = row.closest('.layer-item').dataset.layerId;
            const element = this.layerToElementMap.get(layerId);
            if (element) {
                this.addToSelection(element, layerId);
            }
        }
    }

    clearSelection() {
        // Clear multi-select highlights in preview
        this.selectedElements.forEach(el => {
            el.classList.remove('editor-multi-select');
        });
        this.clearSelectionUI();
        this.selectedElements.clear();
        this.updateSelectionInfo();
    }

    clearSelectionUI() {
        this.treeContainer.querySelectorAll('.layer-item-row.selected').forEach(row => {
            row.classList.remove('selected');
        });
    }

    // Update multi-select highlights in preview
    updatePreviewMultiSelect() {
        const doc = this.getDocument();
        if (!doc) return;

        // Inject multi-select style if not exists
        if (!doc.getElementById('editor-multi-select-style')) {
            const style = doc.createElement('style');
            style.id = 'editor-multi-select-style';
            style.textContent = `
                .editor-multi-select {
                    outline: 2px dashed #ffd700 !important;
                    outline-offset: 2px !important;
                }
                .editor-multi-select.editor-highlight {
                    outline: 2px solid #667eea !important;
                    box-shadow: 0 0 0 4px rgba(255, 215, 0, 0.3) !important;
                }
            `;
            doc.head.appendChild(style);
        }
    }

    syncSelectionFromPreview(element) {
        const layerId = this.elementToLayerMap.get(element);
        if (layerId) {
            // Clear previous multi-select highlights
            this.selectedElements.forEach(el => {
                el.classList.remove('editor-multi-select');
            });

            this.clearSelectionUI();
            this.selectedElements.clear();
            this.selectedElements.add(element);

            const row = this.getRowByLayerId(layerId);
            if (row) {
                row.classList.add('selected');

                // Scroll layer into view
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Expand parents
                this.expandParentsOf(layerId);
            }

            this.updateSelectionInfo();
        }
    }

    expandParentsOf(layerId) {
        let item = this.treeContainer.querySelector(`[data-layer-id="${layerId}"]`);
        if (!item) return;

        let parent = item.parentElement;
        while (parent && parent !== this.treeContainer) {
            if (parent.classList.contains('layer-children')) {
                parent.classList.remove('collapsed');
                const parentItem = parent.closest('.layer-item');
                if (parentItem) {
                    const parentId = parentItem.dataset.layerId;
                    this.expandedNodes.add(parentId);
                    const toggle = parentItem.querySelector('.layer-toggle');
                    if (toggle) toggle.classList.add('expanded');
                }
            }
            parent = parent.parentElement;
        }
    }

    updateSelectionInfo() {
        const count = this.selectedElements.size;
        const countSpan = this.selectionInfo?.querySelector('.selection-count');
        if (countSpan) {
            countSpan.textContent = `${count} selected`;
        }

        // Show/hide bulk actions
        if (this.bulkActions) {
            if (count > 0) {
                this.bulkActions.classList.remove('hidden');
            } else {
                this.bulkActions.classList.add('hidden');
            }
        }
    }

    getRowByLayerId(layerId) {
        const item = this.treeContainer.querySelector(`[data-layer-id="${layerId}"]`);
        return item ? item.querySelector('.layer-item-row') : null;
    }

    // Drag & Drop
    setupDragAndDrop(row, element, layerId) {
        row.addEventListener('dragstart', (e) => {
            this.dragState = {
                element,
                layerId,
                elements: this.selectedElements.has(element)
                    ? Array.from(this.selectedElements)
                    : [element]
            };
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', layerId);
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            this.clearDragIndicators();
            this.dragState = null;
        });

        row.addEventListener('dragover', (e) => {
            if (!this.dragState) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            this.clearDragIndicators();

            const rect = row.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;

            if (y < height * 0.25) {
                row.classList.add('drag-over-above');
            } else if (y > height * 0.75) {
                row.classList.add('drag-over-below');
            } else {
                row.classList.add('drag-over');
            }
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over', 'drag-over-above', 'drag-over-below');
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.dragState) return;

            const rect = row.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;

            let position = 'inside';
            if (y < height * 0.25) {
                position = 'before';
            } else if (y > height * 0.75) {
                position = 'after';
            }

            this.handleDrop(element, position);
            this.clearDragIndicators();
        });
    }

    clearDragIndicators() {
        this.treeContainer.querySelectorAll('.drag-over, .drag-over-above, .drag-over-below').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-above', 'drag-over-below');
        });
    }

    handleDrop(targetElement, position) {
        if (!this.dragState) return;

        const elements = this.dragState.elements;

        // Can't drop on self or children
        for (const el of elements) {
            if (el === targetElement || el.contains(targetElement)) {
                return;
            }
        }

        // Sort elements by their DOM position to maintain order
        elements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        // Record original positions for undo
        const moveData = elements.map(el => ({
            element: el,
            originalParent: el.parentElement,
            originalIndex: Array.from(el.parentElement.children).indexOf(el)
        }));

        elements.forEach(el => {
            switch (position) {
                case 'before':
                    targetElement.parentNode.insertBefore(el, targetElement);
                    break;
                case 'after':
                    targetElement.parentNode.insertBefore(el, targetElement.nextSibling);
                    break;
                case 'inside':
                    targetElement.appendChild(el);
                    break;
            }
        });

        this.refresh();
        this.emit('elements:moved', { elements, moveData, targetElement, position });
        this.triggerSave();
    }

    // Element Operations
    moveSelectedElements(direction) {
        if (this.selectedElements.size === 0) return;

        const elements = Array.from(this.selectedElements);

        // Sort by DOM position
        elements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        // Record original positions for undo
        const moveData = elements.map(el => ({
            element: el,
            originalParent: el.parentElement,
            originalIndex: Array.from(el.parentElement.children).indexOf(el)
        }));

        if (direction === 'up') {
            for (const el of elements) {
                const prev = el.previousElementSibling;
                if (prev && !elements.includes(prev)) {
                    el.parentNode.insertBefore(el, prev);
                }
            }
        } else {
            // Reverse for moving down
            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];
                const next = el.nextElementSibling;
                if (next && !elements.includes(next)) {
                    el.parentNode.insertBefore(next, el);
                }
            }
        }

        this.refresh();

        // Re-select elements
        elements.forEach(el => {
            const layerId = this.elementToLayerMap.get(el);
            if (layerId) {
                this.addToSelection(el, layerId);
            }
        });

        this.emit('elements:moved', { elements, moveData, direction });
        this.triggerSave();
    }

    duplicateElement(element) {
        const clone = element.cloneNode(true);
        clone.classList.remove('editor-highlight', 'editor-hover');
        const parent = element.parentElement;
        const index = Array.from(parent.children).indexOf(element) + 1;
        element.parentNode.insertBefore(clone, element.nextSibling);

        this.refresh();
        this.emit('element:duplicated', { clone, parent, index });
        this.triggerSave();
        this.showToast('Element duplicated');
    }

    duplicateSelectedElements() {
        if (this.selectedElements.size === 0) return;

        const elements = Array.from(this.selectedElements);
        const duplicateData = [];

        elements.forEach(el => {
            const clone = el.cloneNode(true);
            clone.classList.remove('editor-highlight', 'editor-hover');
            const parent = el.parentElement;
            const index = Array.from(parent.children).indexOf(el) + 1;
            el.parentNode.insertBefore(clone, el.nextSibling);
            duplicateData.push({ clone, parent, index });
        });

        this.refresh();

        // Select clones
        this.clearSelection();
        duplicateData.forEach(({ clone }) => {
            const layerId = this.elementToLayerMap.get(clone);
            if (layerId) {
                this.addToSelection(clone, layerId);
            }
        });

        this.emit('elements:duplicated', duplicateData);
        this.triggerSave();
        this.showToast(`${duplicateData.length} elements duplicated`);
    }

    deleteElement(element) {
        // Record for undo
        const parent = element.parentElement;
        const index = Array.from(parent.children).indexOf(element);
        const html = element.outerHTML;

        element.remove();
        this.selectedElements.delete(element);
        this.refresh();
        this.emit('element:deleted', { element, parent, index, html });
        this.triggerSave();
        this.showToast('Element deleted');
    }

    deleteSelectedElements() {
        if (this.selectedElements.size === 0) return;

        const count = this.selectedElements.size;
        const elements = Array.from(this.selectedElements);

        // Record for undo
        const deleteData = elements.map(el => {
            const parent = el.parentElement;
            return {
                element: el,
                parent: parent,
                index: parent ? Array.from(parent.children).indexOf(el) : -1,
                html: el.outerHTML
            };
        }).filter(data => data.parent !== null);

        elements.forEach(el => el.remove());
        this.selectedElements.clear();

        this.refresh();
        this.emit('elements:deleted', deleteData);
        this.triggerSave();
        this.showToast(`${count} elements deleted`);
    }

    // Rename / Label
    startRenameFirstSelected() {
        if (this.selectedElements.size === 0) return;

        const element = this.selectedElements.values().next().value;
        const layerId = this.elementToLayerMap.get(element);
        if (!layerId) return;

        const row = this.getRowByLayerId(layerId);
        if (!row) return;

        const label = row.querySelector('.layer-label');
        if (label) {
            this.startRename(layerId, label);
        }
    }

    startRename(layerId, labelSpan) {
        const element = this.layerToElementMap.get(layerId);
        if (!element) return;

        const currentName = element.dataset.layerName || labelSpan.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'layer-label-input';
        input.value = currentName;

        labelSpan.replaceWith(input);
        input.focus();
        input.select();

        const finishRename = () => {
            const newName = input.value.trim();
            // ★ DOM 변경 전에 oldName 캡처 (undo용)
            // null = 속성 없음 (undo 시 removeAttribute), '' = 빈 값
            const oldName = element.dataset.layerName ?? null;

            if (newName) {
                element.dataset.layerName = newName;
            } else {
                delete element.dataset.layerName;
            }

            // ★ 텍스트 전용 요소: rename 시 실제 textContent도 함께 변경
            // 자식 요소 없이 텍스트 노드만 있는 경우 프리뷰에도 반영
            let oldText = null;
            let textChanged = false;
            if (newName) {
                const isTextOnly = this._isTextOnlyElement(element);
                if (isTextOnly) {
                    oldText = element.textContent;
                    element.textContent = newName;
                    textChanged = true;
                }
            }

            const newLabel = document.createElement('span');
            newLabel.className = 'layer-label';
            newLabel.textContent = newName || this.getDefaultLabel(element);
            newLabel.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.startRename(layerId, newLabel);
            });

            input.replaceWith(newLabel);
            // ★ oldName, oldText를 이벤트에 포함 (EditorApp에서 정확한 undo 기록용)
            // newName이 빈 문자열이면 속성 삭제됨 → null 전달 (undo 시 removeAttribute)
            this.emit('element:renamed', { element, name: newName || null, oldName, oldText, textChanged });
            this.triggerSave();
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }

    /**
     * 텍스트 전용 요소인지 판별
     * 자식 Element 없이 텍스트 노드만 포함된 요소 (예: <p>text</p>, <h1>title</h1>)
     */
    _isTextOnlyElement(element) {
        if (!element || element.children.length > 0) return false;
        // 텍스트 노드가 하나라도 있어야 함
        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === Node.TEXT_NODE &&
                element.childNodes[i].textContent.trim().length > 0) {
                return true;
            }
        }
        return false;
    }

    // Scroll sync
    scrollToElementInPreview(element) {
        try {
            // Get the iframe's window for scrolling
            const iframeWindow = this.editor?.previewFrame?.contentWindow;
            if (!iframeWindow) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            // Get element's position relative to the iframe document
            const rect = element.getBoundingClientRect();
            const iframeDoc = iframeWindow.document;

            // Calculate the scroll position to center the element
            const elementTop = rect.top + iframeWindow.scrollY;
            const elementHeight = rect.height;
            const viewportHeight = iframeWindow.innerHeight;

            // Target scroll position to center the element
            const targetScrollY = elementTop - (viewportHeight / 2) + (elementHeight / 2);

            // Smooth scroll the iframe
            iframeWindow.scrollTo({
                top: Math.max(0, targetScrollY),
                behavior: 'smooth'
            });

            // Also highlight the element briefly for visual feedback
            this.flashHighlight(element);
        } catch (e) {
            // Fallback
            try {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e2) {
                // Ignore errors
            }
        }
    }

    // Flash highlight effect for visual feedback
    flashHighlight(element) {
        if (!element) return;

        // Skip flash highlight - let the main editor overlay handle selection visuals
        // This prevents the yellow outline from persisting
        return;
    }

    // Context Menu
    showContextMenu(e, element, layerId) {
        this.closeContextMenu();

        // If right-clicked element is not selected, select it
        if (!this.selectedElements.has(element)) {
            this.selectSingle(element, layerId);
        }

        const menu = document.createElement('div');
        menu.className = 'layer-context-menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        const items = [
            { label: 'Rename', icon: 'edit', action: () => this.startRenameFirstSelected() },
            { label: 'Duplicate', icon: 'copy', action: () => this.duplicateSelectedElements() },
            { divider: true },
            { label: 'Move Up', icon: 'up', action: () => this.moveSelectedElements('up') },
            { label: 'Move Down', icon: 'down', action: () => this.moveSelectedElements('down') },
            { divider: true },
            { label: 'Delete', icon: 'delete', danger: true, action: () => this.deleteSelectedElements() }
        ];

        items.forEach(item => {
            if (item.divider) {
                const divider = document.createElement('div');
                divider.className = 'layer-context-menu-divider';
                menu.appendChild(divider);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'layer-context-menu-item' + (item.danger ? ' danger' : '');
                menuItem.innerHTML = `<span>${item.label}</span>`;
                menuItem.addEventListener('click', () => {
                    item.action();
                    this.closeContextMenu();
                });
                menu.appendChild(menuItem);
            }
        });

        document.body.appendChild(menu);
        this.contextMenu = menu;

        // Adjust position if off screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (e.clientX - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (e.clientY - rect.height) + 'px';
        }
    }

    closeContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    // Utility methods
    triggerSave() {
        if (this.editor && typeof this.editor.saveHTMLDebounced === 'function') {
            this.editor.saveHTMLDebounced();
        } else if (this.editor && typeof this.editor.autoSave === 'function') {
            this.editor.autoSave();
        }
    }

    showToast(message) {
        if (this.editor && typeof this.editor.showToast === 'function') {
            this.editor.showToast(message);
        }
    }
}

export default LayerPanel;
