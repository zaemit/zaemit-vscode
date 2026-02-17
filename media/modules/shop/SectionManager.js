import EventEmitter from '../EventEmitter.js';

/**
 * SectionManager - 상세페이지 섹션 관리 모듈
 * 섹션 추가/삭제/이동/수정, 캔버스 렌더링, 섹션 리스트 동기화
 */
class SectionManager extends EventEmitter {
    constructor() {
        super();
        this.sections = [];
        this.selectedSectionId = null;
        this.dragState = null;
        this.sectionIdCounter = 0;
    }

    init() {
        this.canvasContent = document.getElementById('canvasContent');
        this.sectionList = document.getElementById('sectionList');
        this._setupDragDrop();
        this.renderCanvas();
        this.renderSectionList();
    }

    // ===== Section CRUD =====

    generateId() {
        return `section-${Date.now()}-${++this.sectionIdCounter}`;
    }

    addSection(type, insertIndex = -1, data = {}) {
        const section = {
            id: this.generateId(),
            type, // 'image', 'text', 'image-text', 'divider', 'spacer', 'html'
            data: this._getDefaultData(type, data),
            style: {
                backgroundColor: '#ffffff',
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: 0,
                paddingRight: 0,
            }
        };

        if (insertIndex >= 0 && insertIndex < this.sections.length) {
            this.sections.splice(insertIndex, 0, section);
        } else {
            this.sections.push(section);
        }

        this.renderCanvas();
        this.renderSectionList();
        this.selectSection(section.id);
        this.emit('section:added', { section });
        this.emit('content:changed');
        return section;
    }

    _getDefaultData(type, override = {}) {
        const defaults = {
            image: {
                src: '',
                alt: '상품 이미지',
                objectFit: 'cover',
                ...override
            },
            text: {
                content: '',
                fontFamily: "'Pretendard', sans-serif",
                fontSize: '16px',
                color: '#333333',
                textAlign: 'left',
                fontWeight: 'normal',
                ...override
            },
            'image-text': {
                src: '',
                alt: '상품 이미지',
                caption: '',
                captionFontSize: '14px',
                captionColor: '#555555',
                captionAlign: 'left',
                ...override
            },
            divider: {
                color: '#e0e0e0',
                thickness: 1,
                style: 'solid', // solid, dashed, dotted
                marginX: 32,
                ...override
            },
            spacer: {
                height: 40,
                ...override
            },
            html: {
                code: '',
                ...override
            }
        };
        return defaults[type] || {};
    }

    removeSection(sectionId) {
        const index = this.sections.findIndex(s => s.id === sectionId);
        if (index === -1) return;

        const removed = this.sections.splice(index, 1)[0];

        if (this.selectedSectionId === sectionId) {
            this.selectedSectionId = null;
            this.emit('section:deselected');
        }

        this.renderCanvas();
        this.renderSectionList();
        this.emit('section:removed', { section: removed, index });
        this.emit('content:changed');
    }

    duplicateSection(sectionId) {
        const index = this.sections.findIndex(s => s.id === sectionId);
        if (index === -1) return;

        const original = this.sections[index];
        const clone = {
            id: this.generateId(),
            type: original.type,
            data: JSON.parse(JSON.stringify(original.data)),
            style: JSON.parse(JSON.stringify(original.style)),
        };

        this.sections.splice(index + 1, 0, clone);
        this.renderCanvas();
        this.renderSectionList();
        this.selectSection(clone.id);
        this.emit('section:added', { section: clone });
        this.emit('content:changed');
    }

    moveSection(sectionId, newIndex) {
        const currentIndex = this.sections.findIndex(s => s.id === sectionId);
        if (currentIndex === -1 || currentIndex === newIndex) return;

        const [section] = this.sections.splice(currentIndex, 1);
        this.sections.splice(newIndex, 0, section);

        this.renderCanvas();
        this.renderSectionList();
        this.emit('section:moved', { section, from: currentIndex, to: newIndex });
        this.emit('content:changed');
    }

    updateSectionData(sectionId, dataUpdates) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;

        Object.assign(section.data, dataUpdates);
        this._updateCanvasSection(section);
        this._updateSectionListItem(section);
        this.emit('section:updated', { section });
        this.emit('content:changed');
    }

    updateSectionStyle(sectionId, styleUpdates) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;

        Object.assign(section.style, styleUpdates);
        this._applyCanvasSectionStyle(section);
        this.emit('section:updated', { section });
        this.emit('content:changed');
    }

    selectSection(sectionId) {
        this.selectedSectionId = sectionId;

        // Update canvas selection
        this.canvasContent.querySelectorAll('.canvas-section').forEach(el => {
            el.classList.toggle('selected', el.dataset.sectionId === sectionId);
        });

        // Update section list selection
        this.sectionList.querySelectorAll('.section-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.sectionId === sectionId);
        });

        const section = this.sections.find(s => s.id === sectionId);
        this.emit('section:selected', { section });
    }

    deselectSection() {
        this.selectedSectionId = null;
        this.canvasContent.querySelectorAll('.canvas-section.selected').forEach(el => {
            el.classList.remove('selected');
        });
        this.sectionList.querySelectorAll('.section-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        this.emit('section:deselected');
    }

    getSelectedSection() {
        if (!this.selectedSectionId) return null;
        return this.sections.find(s => s.id === this.selectedSectionId) || null;
    }

    // ===== Canvas Rendering =====

    renderCanvas() {
        this.canvasContent.innerHTML = '';

        if (this.sections.length === 0) {
            this.canvasContent.innerHTML = `
                <div class="canvas-empty-state" id="canvasEmptyState">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    <p>상세페이지를 시작하세요</p>
                    <span>클릭하여 첫 섹션을 추가하세요</span>
                </div>
            `;
            const emptyState = this.canvasContent.querySelector('#canvasEmptyState');
            emptyState.addEventListener('click', () => this.emit('request:addSection'));
            return;
        }

        this.sections.forEach((section, index) => {
            // Add between indicator
            if (index > 0) {
                const between = document.createElement('div');
                between.className = 'canvas-section-add-between';
                between.innerHTML = `<button class="add-between-btn" data-index="${index}">+</button>`;
                between.querySelector('.add-between-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.emit('request:addSection', { insertIndex: index });
                });
                this.canvasContent.appendChild(between);
            }

            const el = this._createCanvasSectionElement(section);
            this.canvasContent.appendChild(el);
        });
    }

    _createCanvasSectionElement(section) {
        const el = document.createElement('div');
        el.className = `canvas-section canvas-section-${section.type}`;
        el.dataset.sectionId = section.id;
        if (section.id === this.selectedSectionId) {
            el.classList.add('selected');
        }

        // Drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'canvas-section-drag-handle';
        dragHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/>
            <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
            <circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>
        </svg>`;
        el.appendChild(dragHandle);

        // Section content
        const content = this._createSectionContent(section);
        el.appendChild(content);

        // Apply styles
        this._applyCanvasSectionStyle(section, el);

        // Click to select
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectSection(section.id);
        });

        return el;
    }

    _createSectionContent(section) {
        const wrapper = document.createElement('div');
        wrapper.className = 'section-content-wrapper';

        switch (section.type) {
            case 'image': {
                if (section.data.src) {
                    const img = document.createElement('img');
                    img.src = section.data.src;
                    img.alt = section.data.alt || '';
                    img.style.display = 'block';
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    wrapper.appendChild(img);
                } else {
                    wrapper.innerHTML = `
                        <div style="padding: 60px 20px; text-align: center; background: #f8f8f8; color: #999; cursor: pointer;" class="image-drop-zone">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px;">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21,15 16,10 5,21"/>
                            </svg>
                            <p style="font-size: 14px;">이미지를 드래그하거나 클릭하여 추가</p>
                        </div>
                    `;
                    const dropZone = wrapper.querySelector('.image-drop-zone');
                    dropZone.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.emit('request:uploadImage', { sectionId: section.id });
                    });
                    this._setupDropZone(dropZone, section.id);
                }
                break;
            }
            case 'text': {
                const textEl = document.createElement('div');
                textEl.className = 'canvas-section-text';
                textEl.contentEditable = true;
                textEl.innerHTML = section.data.content || '';
                textEl.style.fontFamily = section.data.fontFamily;
                textEl.style.fontSize = section.data.fontSize;
                textEl.style.color = section.data.color;
                textEl.style.textAlign = section.data.textAlign;
                textEl.style.fontWeight = section.data.fontWeight;

                textEl.addEventListener('input', () => {
                    section.data.content = textEl.innerHTML;
                    this.emit('content:changed');
                });
                textEl.addEventListener('click', (e) => e.stopPropagation());
                textEl.addEventListener('focus', () => this.selectSection(section.id));

                wrapper.appendChild(textEl);
                break;
            }
            case 'image-text': {
                // Image part
                const imgPart = document.createElement('div');
                imgPart.className = 'image-part';
                if (section.data.src) {
                    imgPart.innerHTML = `<img src="${section.data.src}" alt="${section.data.alt || ''}" style="display:block;width:100%;height:auto;">`;
                } else {
                    imgPart.innerHTML = `
                        <div style="padding: 40px 20px; text-align: center; background: #f8f8f8; color: #999; cursor: pointer;" class="image-drop-zone">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21,15 16,10 5,21"/>
                            </svg>
                            <p style="font-size: 13px; margin-top: 6px;">이미지 추가</p>
                        </div>
                    `;
                    const dropZone = imgPart.querySelector('.image-drop-zone');
                    dropZone.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.emit('request:uploadImage', { sectionId: section.id });
                    });
                    this._setupDropZone(dropZone, section.id);
                }
                wrapper.appendChild(imgPart);

                // Text part
                const textPart = document.createElement('div');
                textPart.className = 'text-part';
                textPart.contentEditable = true;
                textPart.innerHTML = section.data.caption || '';
                textPart.style.fontSize = section.data.captionFontSize;
                textPart.style.color = section.data.captionColor;
                textPart.style.textAlign = section.data.captionAlign;

                textPart.addEventListener('input', () => {
                    section.data.caption = textPart.innerHTML;
                    this.emit('content:changed');
                });
                textPart.addEventListener('click', (e) => e.stopPropagation());
                textPart.addEventListener('focus', () => this.selectSection(section.id));

                wrapper.appendChild(textPart);
                break;
            }
            case 'divider': {
                const hr = document.createElement('hr');
                hr.style.border = 'none';
                hr.style.borderTop = `${section.data.thickness}px ${section.data.style} ${section.data.color}`;
                hr.style.margin = `0 ${section.data.marginX}px`;
                wrapper.style.padding = '16px 0';
                wrapper.appendChild(hr);
                break;
            }
            case 'spacer': {
                wrapper.style.height = `${section.data.height}px`;
                wrapper.className += ' canvas-section-spacer';

                // Drag resize handle
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'spacer-resize-handle';
                resizeHandle.innerHTML = `<svg width="16" height="4" viewBox="0 0 16 4"><line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" stroke-width="1.5"/><line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" stroke-width="1.5"/></svg>`;

                let startY = 0, startHeight = 0;
                const onMouseMove = (e) => {
                    const delta = e.clientY - startY;
                    const newHeight = Math.max(10, Math.min(200, startHeight + delta));
                    section.data.height = newHeight;
                    wrapper.style.height = `${newHeight}px`;
                };
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    this.emit('section:updated', { section });
                    this.emit('content:changed');
                };
                resizeHandle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startY = e.clientY;
                    startHeight = section.data.height;
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });

                wrapper.appendChild(resizeHandle);
                break;
            }
            case 'html': {
                const container = document.createElement('div');
                container.className = 'canvas-section-html';
                if (section.data.code) {
                    container.innerHTML = section.data.code;
                } else {
                    container.innerHTML = `
                        <div style="padding: 40px 20px; text-align: center; color: #999; background: #fafafa;">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px;">
                                <polyline points="16,18 22,12 16,6"/>
                                <polyline points="8,6 2,12 8,18"/>
                            </svg>
                            <p style="font-size: 13px;">HTML 코드를 입력하세요</p>
                        </div>
                    `;
                }
                wrapper.appendChild(container);
                break;
            }
        }

        return wrapper;
    }

    _applyCanvasSectionStyle(section, el) {
        el = el || this.canvasContent.querySelector(`[data-section-id="${section.id}"]`);
        if (!el) return;

        const s = section.style;
        el.style.backgroundColor = s.backgroundColor;
        el.style.paddingTop = `${s.paddingTop}px`;
        el.style.paddingBottom = `${s.paddingBottom}px`;
        el.style.paddingLeft = `${s.paddingLeft}px`;
        el.style.paddingRight = `${s.paddingRight}px`;
    }

    _updateCanvasSection(section) {
        const el = this.canvasContent.querySelector(`[data-section-id="${section.id}"]`);
        if (!el) return;

        // Rebuild content
        const dragHandle = el.querySelector('.canvas-section-drag-handle');
        el.innerHTML = '';
        if (dragHandle) el.appendChild(dragHandle);

        const content = this._createSectionContent(section);
        el.appendChild(content);
        this._applyCanvasSectionStyle(section, el);
    }

    _setupDropZone(dropZone, sectionId) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#667eea';
            dropZone.style.background = '#f0f0ff';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = '';
            dropZone.style.background = '#f8f8f8';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '';
            dropZone.style.background = '#f8f8f8';

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    this.emit('image:dropped', { sectionId, file });
                }
            }
        });
    }

    // ===== Section List Rendering =====

    renderSectionList() {
        // Clear existing items but preserve empty state logic
        const emptyState = this.sectionList.querySelector('.section-empty-state');

        this.sectionList.innerHTML = '';

        if (this.sections.length === 0) {
            if (emptyState) {
                this.sectionList.appendChild(emptyState);
            } else {
                this.sectionList.innerHTML = `
                    <div class="section-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <line x1="12" y1="8" x2="12" y2="16"/>
                            <line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                        <p>섹션을 추가하여<br>상세페이지를 만들어보세요</p>
                    </div>
                `;
            }
            return;
        }

        this.sections.forEach((section, index) => {
            const item = this._createSectionListItem(section, index);
            this.sectionList.appendChild(item);
        });
    }

    _createSectionListItem(section, index) {
        const item = document.createElement('div');
        item.className = 'section-item';
        item.dataset.sectionId = section.id;
        item.draggable = true;
        if (section.id === this.selectedSectionId) {
            item.classList.add('selected');
        }

        const typeLabels = {
            image: '이미지',
            text: '텍스트',
            'image-text': '이미지+텍스트',
            divider: '구분선',
            spacer: '여백',
            html: 'HTML'
        };

        const typeIcons = {
            image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>`,
            text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4,7 4,4 20,4 20,7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
            'image-text': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="10" rx="2"/><line x1="3" y1="17" x2="15" y2="17"/><line x1="3" y1="21" x2="11" y2="21"/></svg>`,
            divider: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
            spacer: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="3" x2="12" y2="9"/><polyline points="8,7 12,3 16,7"/><line x1="12" y1="21" x2="12" y2="15"/><polyline points="8,17 12,21 16,17"/></svg>`,
            html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>`
        };

        // Preview area
        const preview = document.createElement('div');
        preview.className = 'section-item-preview';
        if (section.type === 'image' && section.data.src) {
            preview.innerHTML = `<img src="${section.data.src}" alt="">`;
        } else if (section.type === 'image-text' && section.data.src) {
            preview.innerHTML = `<img src="${section.data.src}" alt="">`;
        } else {
            preview.innerHTML = `<div class="preview-placeholder">${typeIcons[section.type] || ''}</div>`;
        }
        item.appendChild(preview);

        // Info bar
        const info = document.createElement('div');
        info.className = 'section-item-info';
        info.innerHTML = `
            <span class="section-item-label">${index + 1}. ${typeLabels[section.type] || section.type}</span>
            <span class="section-item-type">${section.type}</span>
        `;
        item.appendChild(info);

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'section-item-actions';
        actions.innerHTML = `
            <button class="section-action-btn" data-action="duplicate" title="복제">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
            </button>
            <button class="section-action-btn danger" data-action="delete" title="삭제">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        `;

        actions.querySelectorAll('.section-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'duplicate') this.duplicateSection(section.id);
                if (action === 'delete') this.removeSection(section.id);
            });
        });
        item.appendChild(actions);

        // Click to select
        item.addEventListener('click', () => this.selectSection(section.id));

        // Drag events for reordering
        item.addEventListener('dragstart', (e) => {
            this.dragState = { sectionId: section.id, index };
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', section.id);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            this.dragState = null;
            this.sectionList.querySelectorAll('.drop-indicator').forEach(el => el.remove());
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.dragState) return;

            // Show drop indicator
            const rect = item.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            const isAbove = e.clientY < mid;

            this.sectionList.querySelectorAll('.drop-indicator').forEach(el => el.remove());
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            if (isAbove) {
                item.parentNode.insertBefore(indicator, item);
            } else {
                item.parentNode.insertBefore(indicator, item.nextSibling);
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.dragState) return;

            const rect = item.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            const targetIndex = e.clientY < mid ? index : index + 1;

            this.moveSection(this.dragState.sectionId, targetIndex);
            this.sectionList.querySelectorAll('.drop-indicator').forEach(el => el.remove());
        });

        return item;
    }

    _updateSectionListItem(section) {
        const item = this.sectionList.querySelector(`[data-section-id="${section.id}"]`);
        if (!item) return;

        // Update preview image if applicable
        const preview = item.querySelector('.section-item-preview');
        if ((section.type === 'image' || section.type === 'image-text') && section.data.src) {
            preview.innerHTML = `<img src="${section.data.src}" alt="">`;
        }
    }

    // ===== Drag & Drop setup =====

    _setupDragDrop() {
        this.sectionList.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
    }

    // ===== Serialization =====

    toJSON() {
        return {
            sections: this.sections.map(s => ({
                id: s.id,
                type: s.type,
                data: { ...s.data },
                style: { ...s.style }
            }))
        };
    }

    fromJSON(json) {
        if (!json || !json.sections) return;
        this.sections = json.sections.map(s => ({
            id: s.id || this.generateId(),
            type: s.type,
            data: { ...s.data },
            style: { ...s.style }
        }));
        this.renderCanvas();
        this.renderSectionList();
    }

    // ===== HTML Export =====

    toHTML(pageWidth = 860, pageBgColor = '#ffffff') {
        let sectionsHTML = '';

        for (const section of this.sections) {
            const style = section.style;
            const sectionStyle = `background-color:${style.backgroundColor};padding:${style.paddingTop}px ${style.paddingRight}px ${style.paddingBottom}px ${style.paddingLeft}px;`;

            switch (section.type) {
                case 'image':
                    if (section.data.src) {
                        sectionsHTML += `<div style="${sectionStyle}"><img src="${section.data.src}" alt="${section.data.alt || ''}" style="display:block;width:100%;height:auto;"></div>\n`;
                    }
                    break;
                case 'text':
                    sectionsHTML += `<div style="${sectionStyle}font-family:${section.data.fontFamily};font-size:${section.data.fontSize};color:${section.data.color};text-align:${section.data.textAlign};font-weight:${section.data.fontWeight};padding:24px 32px;line-height:1.8;">${section.data.content}</div>\n`;
                    break;
                case 'image-text':
                    sectionsHTML += `<div style="${sectionStyle}">`;
                    if (section.data.src) {
                        sectionsHTML += `<img src="${section.data.src}" alt="${section.data.alt || ''}" style="display:block;width:100%;height:auto;">`;
                    }
                    if (section.data.caption) {
                        sectionsHTML += `<div style="padding:16px 32px;font-size:${section.data.captionFontSize};color:${section.data.captionColor};text-align:${section.data.captionAlign};line-height:1.8;">${section.data.caption}</div>`;
                    }
                    sectionsHTML += `</div>\n`;
                    break;
                case 'divider':
                    sectionsHTML += `<div style="${sectionStyle}padding:16px ${section.data.marginX}px;"><hr style="border:none;border-top:${section.data.thickness}px ${section.data.style} ${section.data.color};"></div>\n`;
                    break;
                case 'spacer':
                    sectionsHTML += `<div style="${sectionStyle}height:${section.data.height}px;"></div>\n`;
                    break;
                case 'html':
                    sectionsHTML += `<div style="${sectionStyle}">${section.data.code}</div>\n`;
                    break;
            }
        }

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>상품 상세페이지</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5; }
        .detail-page { max-width: ${pageWidth}px; margin: 0 auto; background: ${pageBgColor}; }
        img { max-width: 100%; height: auto; }
        @media (max-width: ${pageWidth}px) {
            .detail-page { max-width: 100%; }
        }
    </style>
</head>
<body>
    <div class="detail-page">
${sectionsHTML}
    </div>
</body>
</html>`;
    }
}

export default SectionManager;
