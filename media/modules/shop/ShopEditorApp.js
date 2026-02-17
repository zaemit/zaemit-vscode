import EventEmitter from '../EventEmitter.js';
import SectionManager from './SectionManager.js';
import ImageUploader from './ImageUploader.js';
import TemplateManager from './TemplateManager.js';

/**
 * ShopEditorApp - 쇼핑몰 상세페이지 빌더 오케스트레이터
 * 모든 모듈 초기화 및 이벤트 연결
 */
class ShopEditorApp extends EventEmitter {
    constructor() {
        super();
        this.modules = {};
        this.projectId = null;
        this.projectName = '';
        this.pageSettings = {
            width: 860,
            backgroundColor: '#ffffff'
        };
        this.initialized = false;
        this._autoSaveTimer = null;
        this._isDirty = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            // 프로젝트 ID 추출
            this.projectId = new URLSearchParams(window.location.search).get('id');
            if (!this.projectId) {
                this._showToast('프로젝트 ID가 없습니다.', 'error');
                return;
            }

            // 모듈 초기화
            this._initModules();

            // 이벤트 연결
            this._setupEvents();

            // UI 바인딩
            this._setupUI();

            // 프로젝트 데이터 로드
            await this._loadProject();

            this.initialized = true;
            console.log('ShopEditorApp initialized');
        } catch (err) {
            console.error('ShopEditorApp init failed:', err);
            this._showToast('에디터 초기화에 실패했습니다.', 'error');
        }
    }

    _initModules() {
        // Section Manager
        this.modules.sectionManager = new SectionManager();
        this.modules.sectionManager.init();

        // Image Uploader
        this.modules.imageUploader = new ImageUploader({ projectId: this.projectId });
        this.modules.imageUploader.init();

        // Template Manager
        this.modules.templateManager = new TemplateManager();
    }

    _setupEvents() {
        const { sectionManager, imageUploader } = this.modules;

        // Section 추가 요청
        sectionManager.on('request:addSection', ({ insertIndex } = {}) => {
            this._showAddSectionModal(insertIndex);
        });

        // Section 이미지 업로드 요청
        sectionManager.on('request:uploadImage', ({ sectionId }) => {
            imageUploader.openFilePicker((src) => {
                if (src) {
                    sectionManager.updateSectionData(sectionId, { src });
                }
            });
        });

        // 이미지 드래그 앤 드롭
        sectionManager.on('image:dropped', async ({ sectionId, file }) => {
            const src = await imageUploader.processFile(file);
            if (src) {
                sectionManager.updateSectionData(sectionId, { src });
            }
        });

        // 이미지 업로드 결과
        imageUploader.on('upload:error', ({ message }) => {
            this._showToast(message, 'error');
        });
        imageUploader.on('upload:start', () => {
            this._showToast('이미지 업로드 중...', 'info');
        });

        // 섹션 선택 → 속성 패널 업데이트
        sectionManager.on('section:selected', ({ section }) => {
            this._updatePropertyPanel(section);
        });
        sectionManager.on('section:deselected', () => {
            this._showPageSettings();
        });

        // 콘텐츠 변경 → 자동 저장
        sectionManager.on('content:changed', () => {
            this._markDirty();
        });
    }

    _setupUI() {
        // Add Section button
        const addSectionBtn = document.getElementById('addSectionBtn');
        addSectionBtn?.addEventListener('click', () => this._showAddSectionModal());

        // Add Section modal
        this._setupAddSectionModal();

        // Export
        this._setupExportModal();

        // Preview
        this._setupPreviewModal();

        // Page width settings
        this._setupPageSettings();

        // Zoom controls
        this._setupZoomControls();

        // Device toggle
        this._setupDeviceToggle();

        // Undo/Redo (basic)
        this._setupUndoRedo();

        // Keyboard shortcuts
        this._setupKeyboardShortcuts();

        // Template modal
        this._setupTemplateModal();

        // Canvas click to deselect
        const canvasContent = document.getElementById('canvasContent');
        canvasContent?.addEventListener('click', (e) => {
            if (e.target === canvasContent || e.target.closest('.canvas-empty-state')) return;
            // Only deselect if clicked on canvas background, not on a section
            if (!e.target.closest('.canvas-section')) {
                this.modules.sectionManager.deselectSection();
            }
        });

        // Page background color
        const pageBgColor = document.getElementById('pageBgColor');
        const pageBgColorText = document.getElementById('pageBgColorText');
        if (pageBgColor && pageBgColorText) {
            pageBgColor.addEventListener('input', (e) => {
                this.pageSettings.backgroundColor = e.target.value;
                pageBgColorText.value = e.target.value;
                this._applyPageSettings();
                this._markDirty();
            });
            pageBgColorText.addEventListener('change', (e) => {
                const val = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    this.pageSettings.backgroundColor = val;
                    pageBgColor.value = val;
                    this._applyPageSettings();
                    this._markDirty();
                }
            });
        }
    }

    // ===== Add Section Modal =====

    _setupAddSectionModal() {
        const modal = document.getElementById('addSectionModal');
        const closeBtn = document.getElementById('addSectionModalClose');
        this._addSectionInsertIndex = -1;

        closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        // Section type cards
        modal?.querySelectorAll('.section-type-card').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                this.modules.sectionManager.addSection(type, this._addSectionInsertIndex);
                modal.classList.add('hidden');
            });
        });
    }

    _showAddSectionModal(insertIndex = -1) {
        this._addSectionInsertIndex = insertIndex;
        const modal = document.getElementById('addSectionModal');
        modal?.classList.remove('hidden');
    }

    // ===== Export Modal =====

    _setupExportModal() {
        const exportBtn = document.getElementById('exportBtn');
        const modal = document.getElementById('exportModal');
        const closeBtn = document.getElementById('exportModalClose');

        exportBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
        closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        modal?.querySelectorAll('.export-option-card').forEach(card => {
            card.addEventListener('click', () => {
                const exportType = card.dataset.export;
                this._doExport(exportType);
                modal.classList.add('hidden');
            });
        });
    }

    _doExport(type) {
        const html = this.modules.sectionManager.toHTML(this.pageSettings.width, this.pageSettings.backgroundColor);

        switch (type) {
            case 'html': {
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.projectName || 'detail-page'}.html`;
                a.click();
                URL.revokeObjectURL(url);
                this._showToast('HTML 파일이 다운로드되었습니다.', 'success');
                break;
            }
            case 'clipboard': {
                navigator.clipboard.writeText(html).then(() => {
                    this._showToast('HTML 코드가 클립보드에 복사되었습니다.', 'success');
                }).catch(() => {
                    this._showToast('클립보드 복사에 실패했습니다.', 'error');
                });
                break;
            }
            case 'zip': {
                // ZIP export는 서버 API 활용
                this._exportZip(html);
                break;
            }
        }
    }

    async _exportZip(html) {
        try {
            const res = await fetch(`/api/projects/${this.projectId}/export`);
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.projectName || 'detail-page'}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                this._showToast('ZIP 파일이 다운로드되었습니다.', 'success');
            } else {
                // fallback: HTML만 다운로드
                this._doExport('html');
            }
        } catch {
            this._doExport('html');
        }
    }

    // ===== Preview Modal =====

    _setupPreviewModal() {
        const previewBtn = document.getElementById('previewBtn');
        const modal = document.getElementById('previewModal');
        const closeBtn = document.getElementById('previewModalClose');
        const frame = document.getElementById('previewFrame');

        previewBtn?.addEventListener('click', () => {
            const html = this.modules.sectionManager.toHTML(this.pageSettings.width, this.pageSettings.backgroundColor);
            frame.srcdoc = html;
            modal?.classList.remove('hidden');
        });

        closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        // Device toggle in preview
        modal?.querySelectorAll('.preview-device-toggle .device-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.preview-device-toggle .device-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const body = modal.querySelector('.preview-modal-body');
                if (btn.dataset.device === 'mobile') {
                    body.classList.add('mobile');
                } else {
                    body.classList.remove('mobile');
                }
            });
        });
    }

    // ===== Page Settings =====

    _setupPageSettings() {
        const widthBtns = document.querySelectorAll('.width-btn');
        const customInput = document.getElementById('customWidthInput');

        widthBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                widthBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const width = btn.dataset.width;
                if (width === 'custom') {
                    customInput?.classList.remove('hidden');
                    customInput?.focus();
                } else {
                    customInput?.classList.add('hidden');
                    this.pageSettings.width = parseInt(width);
                    this._applyPageSettings();
                    this._markDirty();
                }
            });
        });

        customInput?.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (val >= 400 && val <= 1400) {
                this.pageSettings.width = val;
                this._applyPageSettings();
                this._markDirty();
            }
        });
    }

    _applyPageSettings() {
        const wrapper = document.getElementById('canvasWrapper');
        const content = document.getElementById('canvasContent');
        if (wrapper) wrapper.style.width = `${this.pageSettings.width}px`;
        if (content) content.style.backgroundColor = this.pageSettings.backgroundColor;
    }

    // ===== Zoom =====

    _setupZoomControls() {
        this._zoom = 1;
        const zoomIn = document.getElementById('zoomInBtn');
        const zoomOut = document.getElementById('zoomOutBtn');
        const zoomLevel = document.getElementById('zoomLevel');

        zoomIn?.addEventListener('click', () => this._setZoom(this._zoom + 0.1));
        zoomOut?.addEventListener('click', () => this._setZoom(this._zoom - 0.1));

        // Ctrl+Scroll zoom
        const canvas = document.getElementById('previewCanvas');
        canvas?.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                this._setZoom(this._zoom + delta);
            }
        }, { passive: false });
    }

    _setZoom(level) {
        this._zoom = Math.max(0.25, Math.min(3, level));
        const wrapper = document.getElementById('canvasWrapper');
        if (wrapper) wrapper.style.transform = `scale(${this._zoom})`;
        if (wrapper) wrapper.style.transformOrigin = 'top center';

        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(this._zoom * 100)}%`;
    }

    // ===== Device Toggle =====

    _setupDeviceToggle() {
        document.querySelectorAll('.shop-toolbar .device-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.shop-toolbar .device-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const device = btn.dataset.device;
                const wrapper = document.getElementById('canvasWrapper');
                if (device === 'mobile') {
                    wrapper.style.width = '375px';
                } else {
                    wrapper.style.width = `${this.pageSettings.width}px`;
                }
            });
        });
    }

    // ===== Undo/Redo (간단한 스냅샷 기반) =====

    _setupUndoRedo() {
        this._undoStack = [];
        this._redoStack = [];

        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        undoBtn?.addEventListener('click', () => this._undo());
        redoBtn?.addEventListener('click', () => this._redo());
    }

    _pushUndoState() {
        const state = JSON.stringify(this.modules.sectionManager.toJSON());
        this._undoStack.push(state);
        this._redoStack = [];
        if (this._undoStack.length > 50) this._undoStack.shift();
        this._updateUndoRedoButtons();
    }

    _undo() {
        if (this._undoStack.length === 0) return;
        const currentState = JSON.stringify(this.modules.sectionManager.toJSON());
        this._redoStack.push(currentState);

        const prevState = this._undoStack.pop();
        this.modules.sectionManager.fromJSON(JSON.parse(prevState));
        this._updateUndoRedoButtons();
    }

    _redo() {
        if (this._redoStack.length === 0) return;
        const currentState = JSON.stringify(this.modules.sectionManager.toJSON());
        this._undoStack.push(currentState);

        const nextState = this._redoStack.pop();
        this.modules.sectionManager.fromJSON(JSON.parse(nextState));
        this._updateUndoRedoButtons();
    }

    _updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = this._undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;
    }

    // ===== Keyboard Shortcuts =====

    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Z: Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this._undo();
            }
            // Ctrl+Y or Ctrl+Shift+Z: Redo
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                this._redo();
            }
            // Ctrl+S: Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this._saveProject();
            }
            // Delete: Remove selected section (only if not editing text)
            if ((e.key === 'Delete' || e.key === 'Backspace') && !this._isEditingText()) {
                const selected = this.modules.sectionManager.getSelectedSection();
                if (selected) {
                    e.preventDefault();
                    this.modules.sectionManager.removeSection(selected.id);
                }
            }
            // Escape: Deselect
            if (e.key === 'Escape') {
                this.modules.sectionManager.deselectSection();
            }
        });
    }

    _isEditingText() {
        const active = document.activeElement;
        if (!active) return false;
        return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
    }

    // ===== Property Panel =====

    _updatePropertyPanel(section) {
        if (!section) {
            this._showPageSettings();
            return;
        }

        const pageSettings = document.getElementById('pageSettings');
        const sectionSettings = document.getElementById('sectionSettings');
        const panelTitle = document.getElementById('propertyPanelTitle');
        const imageSectionSettings = document.getElementById('imageSectionSettings');
        const textSectionSettings = document.getElementById('textSectionSettings');
        const htmlSectionSettings = document.getElementById('htmlSectionSettings');
        const spacerSectionSettings = document.getElementById('spacerSectionSettings');
        const dividerSectionSettings = document.getElementById('dividerSectionSettings');

        pageSettings?.classList.add('hidden');
        sectionSettings?.classList.remove('hidden');

        const typeLabels = {
            image: '이미지 섹션',
            text: '텍스트 섹션',
            'image-text': '이미지+텍스트',
            divider: '구분선',
            spacer: '여백',
            html: 'HTML 블록'
        };
        if (panelTitle) panelTitle.textContent = typeLabels[section.type] || '섹션 설정';

        // Show/hide type-specific settings
        const showImage = section.type === 'image' || section.type === 'image-text';
        const showText = section.type === 'text';
        const showHtml = section.type === 'html';
        const showSpacer = section.type === 'spacer';
        const showDivider = section.type === 'divider';

        imageSectionSettings?.classList.toggle('hidden', !showImage);
        textSectionSettings?.classList.toggle('hidden', !showText);
        htmlSectionSettings?.classList.toggle('hidden', !showHtml);
        spacerSectionSettings?.classList.toggle('hidden', !showSpacer);
        dividerSectionSettings?.classList.toggle('hidden', !showDivider);

        // Update image actions
        const imageActions = document.getElementById('imageActions');
        if (imageActions && showImage) {
            imageActions.classList.toggle('hidden', !section.data.src);
        }

        // Update section style inputs
        const bgColor = document.getElementById('sectionBgColor');
        const bgColorText = document.getElementById('sectionBgColorText');
        if (bgColor) bgColor.value = section.style.backgroundColor;
        if (bgColorText) bgColorText.value = section.style.backgroundColor;

        // Setup section-specific property bindings
        this._bindSectionProperties(section);
    }

    _bindSectionProperties(section) {
        // Section background color
        const bgColor = document.getElementById('sectionBgColor');
        const bgColorText = document.getElementById('sectionBgColorText');

        const bgHandler = (e) => {
            this.modules.sectionManager.updateSectionStyle(section.id, { backgroundColor: e.target.value });
            if (bgColorText && e.target !== bgColorText) bgColorText.value = e.target.value;
            if (bgColor && e.target !== bgColor) bgColor.value = e.target.value;
        };
        bgColor?.replaceWith(bgColor.cloneNode(true));
        bgColorText?.replaceWith(bgColorText.cloneNode(true));

        const newBgColor = document.getElementById('sectionBgColor');
        const newBgColorText = document.getElementById('sectionBgColorText');
        newBgColor?.addEventListener('input', bgHandler);
        newBgColorText?.addEventListener('change', bgHandler);

        // Padding
        ['Top', 'Bottom', 'Left', 'Right'].forEach(dir => {
            const input = document.getElementById(`sectionPadding${dir}`);
            if (!input) return;
            input.value = section.style[`padding${dir}`] || 0;

            const newInput = input.cloneNode(true);
            input.replaceWith(newInput);
            newInput.value = section.style[`padding${dir}`] || 0;
            newInput.addEventListener('change', (e) => {
                this.modules.sectionManager.updateSectionStyle(section.id, {
                    [`padding${dir}`]: parseInt(e.target.value) || 0
                });
            });
        });

        // Type-specific property bindings
        if (section.type === 'text') {
            this._bindTextProperties(section);
        }
        if (section.type === 'html') {
            this._bindHtmlProperties(section);
        }
        if (section.type === 'spacer') {
            this._bindSpacerProperties(section);
        }
        if (section.type === 'divider') {
            this._bindDividerProperties(section);
        }

        // Image replace button
        const replaceBtn = document.getElementById('replaceImageBtn');
        if (replaceBtn) {
            const newBtn = replaceBtn.cloneNode(true);
            replaceBtn.replaceWith(newBtn);
            newBtn.addEventListener('click', () => {
                this.modules.imageUploader.openFilePicker((src) => {
                    if (src) {
                        this.modules.sectionManager.updateSectionData(section.id, { src });
                    }
                });
            });
        }
    }

    _bindTextProperties(section) {
        const fontFamily = document.getElementById('sectionFontFamily');
        const fontSize = document.getElementById('sectionFontSize');
        const textColor = document.getElementById('sectionTextColor');
        const textColorText = document.getElementById('sectionTextColorText');

        if (fontFamily) {
            fontFamily.value = section.data.fontFamily;
            const newEl = fontFamily.cloneNode(true);
            fontFamily.replaceWith(newEl);
            newEl.value = section.data.fontFamily;
            newEl.addEventListener('change', (e) => {
                this.modules.sectionManager.updateSectionData(section.id, { fontFamily: e.target.value });
            });
        }

        if (fontSize) {
            fontSize.value = section.data.fontSize;
            const newEl = fontSize.cloneNode(true);
            fontSize.replaceWith(newEl);
            newEl.value = section.data.fontSize;
            newEl.addEventListener('change', (e) => {
                this.modules.sectionManager.updateSectionData(section.id, { fontSize: e.target.value });
            });
        }

        if (textColor) {
            textColor.value = section.data.color;
            const newEl = textColor.cloneNode(true);
            textColor.replaceWith(newEl);
            newEl.value = section.data.color;
            newEl.addEventListener('input', (e) => {
                this.modules.sectionManager.updateSectionData(section.id, { color: e.target.value });
                const txt = document.getElementById('sectionTextColorText');
                if (txt) txt.value = e.target.value;
            });
        }

        // Align buttons
        document.querySelectorAll('#sectionSettings .align-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.align === section.data.textAlign);

            const newBtn = btn.cloneNode(true);
            btn.replaceWith(newBtn);
            newBtn.classList.toggle('active', newBtn.dataset.align === section.data.textAlign);
            newBtn.addEventListener('click', () => {
                document.querySelectorAll('#sectionSettings .align-btn').forEach(b => b.classList.remove('active'));
                newBtn.classList.add('active');
                this.modules.sectionManager.updateSectionData(section.id, { textAlign: newBtn.dataset.align });
            });
        });
    }

    _bindHtmlProperties(section) {
        const editor = document.getElementById('htmlCodeEditor');
        const applyBtn = document.getElementById('applyHtmlCode');
        if (!editor || !applyBtn) return;

        // Set current code
        editor.value = section.data.code || '';

        // Clone to remove old listeners
        const newEditor = editor.cloneNode(true);
        editor.replaceWith(newEditor);
        newEditor.value = section.data.code || '';

        const newApplyBtn = applyBtn.cloneNode(true);
        applyBtn.replaceWith(newApplyBtn);

        newApplyBtn.addEventListener('click', () => {
            const code = newEditor.value;
            this.modules.sectionManager.updateSectionData(section.id, { code });
            this._showToast('HTML 코드가 적용되었습니다.', 'success');
        });

        // Ctrl+Enter shortcut to apply
        newEditor.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const code = newEditor.value;
                this.modules.sectionManager.updateSectionData(section.id, { code });
                this._showToast('HTML 코드가 적용되었습니다.', 'success');
            }
            // Tab key inserts spaces
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = newEditor.selectionStart;
                const end = newEditor.selectionEnd;
                newEditor.value = newEditor.value.substring(0, start) + '  ' + newEditor.value.substring(end);
                newEditor.selectionStart = newEditor.selectionEnd = start + 2;
            }
        });
    }

    _bindSpacerProperties(section) {
        const range = document.getElementById('spacerHeight');
        const valueLabel = document.getElementById('spacerHeightValue');
        if (!range) return;

        range.value = section.data.height || 40;
        if (valueLabel) valueLabel.textContent = `${range.value}px`;

        const newRange = range.cloneNode(true);
        range.replaceWith(newRange);
        newRange.value = section.data.height || 40;

        newRange.addEventListener('input', (e) => {
            const height = parseInt(e.target.value);
            if (valueLabel) valueLabel.textContent = `${height}px`;
            this.modules.sectionManager.updateSectionData(section.id, { height });
        });
    }

    _bindDividerProperties(section) {
        const colorInput = document.getElementById('dividerColor');
        const colorText = document.getElementById('dividerColorText');
        const thickness = document.getElementById('dividerThickness');
        const style = document.getElementById('dividerStyle');

        // Color
        if (colorInput) {
            colorInput.value = section.data.color || '#e0e0e0';
            const newEl = colorInput.cloneNode(true);
            colorInput.replaceWith(newEl);
            newEl.value = section.data.color || '#e0e0e0';
            newEl.addEventListener('input', (e) => {
                this.modules.sectionManager.updateSectionData(section.id, { color: e.target.value });
                const txt = document.getElementById('dividerColorText');
                if (txt) txt.value = e.target.value;
            });
        }
        if (colorText) {
            colorText.value = section.data.color || '#e0e0e0';
            const newEl = colorText.cloneNode(true);
            colorText.replaceWith(newEl);
            newEl.value = section.data.color || '#e0e0e0';
            newEl.addEventListener('change', (e) => {
                const val = e.target.value;
                if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
                    this.modules.sectionManager.updateSectionData(section.id, { color: val });
                    const clr = document.getElementById('dividerColor');
                    if (clr) clr.value = val;
                }
            });
        }

        // Thickness
        if (thickness) {
            thickness.value = section.data.thickness || 1;
            const newEl = thickness.cloneNode(true);
            thickness.replaceWith(newEl);
            newEl.value = section.data.thickness || 1;
            newEl.addEventListener('change', (e) => {
                this.modules.sectionManager.updateSectionData(section.id, { thickness: parseInt(e.target.value) || 1 });
            });
        }

        // Style
        if (style) {
            style.value = section.data.style || 'solid';
            const newEl = style.cloneNode(true);
            style.replaceWith(newEl);
            newEl.value = section.data.style || 'solid';
            newEl.addEventListener('change', (e) => {
                this.modules.sectionManager.updateSectionData(section.id, { style: e.target.value });
            });
        }
    }

    _showPageSettings() {
        const pageSettings = document.getElementById('pageSettings');
        const sectionSettings = document.getElementById('sectionSettings');
        const panelTitle = document.getElementById('propertyPanelTitle');

        pageSettings?.classList.remove('hidden');
        sectionSettings?.classList.add('hidden');
        if (panelTitle) panelTitle.textContent = '페이지 설정';
    }

    // ===== Template Modal =====

    _setupTemplateModal() {
        const modal = document.getElementById('templateModal');
        const closeBtn = document.getElementById('templateModalClose');
        if (!modal) return;

        closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        this._renderTemplateCards();
    }

    _renderTemplateCards() {
        const grid = document.getElementById('templateGrid');
        if (!grid) return;

        const templates = this.modules.templateManager.getTemplates();
        const categories = this.modules.templateManager.getCategories();

        let html = '';
        for (const category of categories) {
            const categoryTemplates = templates.filter(t => t.category === category);
            html += `<div class="template-category">
                <h4 class="template-category-title">${category}</h4>
                <div class="template-category-grid">`;

            for (const tmpl of categoryTemplates) {
                const sectionCount = tmpl.sections.length;
                const types = [...new Set(tmpl.sections.map(s => s.type))];
                const typeLabels = { image: '이미지', text: '텍스트', 'image-text': '이미지+텍스트', divider: '구분선', spacer: '여백', html: 'HTML' };
                const typeStr = types.map(t => typeLabels[t] || t).join(', ');

                html += `<button class="template-card" data-template-id="${tmpl.id}">
                    <div class="template-preview">
                        ${this._renderMiniPreview(tmpl.sections)}
                    </div>
                    <div class="template-info">
                        <span class="template-name">${tmpl.name}</span>
                        <span class="template-desc">${tmpl.description}</span>
                        <span class="template-meta">${sectionCount}개 섹션 · ${typeStr || '빈 페이지'}</span>
                    </div>
                </button>`;
            }

            html += `</div></div>`;
        }

        grid.innerHTML = html;

        // Bind click events
        grid.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', () => {
                const templateId = card.dataset.templateId;
                this._applyTemplate(templateId);
            });
        });
    }

    _renderMiniPreview(sections) {
        if (sections.length === 0) {
            return '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:11px;">빈 페이지</div>';
        }

        let html = '';
        const maxShow = 5;
        const shown = sections.slice(0, maxShow);

        for (const s of shown) {
            switch (s.type) {
                case 'image':
                case 'image-text':
                    html += '<div style="background:#e8e8e8;height:24px;border-radius:2px;margin:2px 0;"></div>';
                    break;
                case 'text':
                    html += '<div style="padding:2px 4px;"><div style="background:#ddd;height:3px;width:70%;border-radius:1px;margin:1px 0;"></div><div style="background:#eee;height:2px;width:90%;border-radius:1px;margin:1px 0;"></div></div>';
                    break;
                case 'divider':
                    html += '<div style="border-top:1px solid #ddd;margin:3px 4px;"></div>';
                    break;
                case 'spacer':
                    html += '<div style="height:6px;"></div>';
                    break;
                default:
                    html += '<div style="background:#f0f0f0;height:12px;border-radius:2px;margin:2px 0;"></div>';
            }
        }

        if (sections.length > maxShow) {
            html += `<div style="text-align:center;color:#aaa;font-size:9px;">+${sections.length - maxShow}개</div>`;
        }

        return html;
    }

    _applyTemplate(templateId) {
        const sections = this.modules.templateManager.getTemplateSections(templateId);
        const sectionManager = this.modules.sectionManager;

        // Clear existing sections
        sectionManager.sections = [];

        // Add template sections
        for (const sData of sections) {
            const section = {
                id: sectionManager.generateId(),
                type: sData.type,
                data: sData.data,
                style: sData.style
            };
            sectionManager.sections.push(section);
        }

        sectionManager.renderCanvas();
        sectionManager.renderSectionList();
        sectionManager.deselectSection();

        // Close modal
        const modal = document.getElementById('templateModal');
        modal?.classList.add('hidden');

        this._markDirty();
        this._showToast('템플릿이 적용되었습니다.', 'success');
    }

    showTemplateModal() {
        const modal = document.getElementById('templateModal');
        modal?.classList.remove('hidden');
    }

    // ===== Save / Load =====

    _markDirty() {
        this._isDirty = true;
        this._pushUndoState();
        this._updateSaveStatus('saving');

        clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => this._saveProject(), 2000);
    }

    async _saveProject() {
        if (!this.projectId) return;

        try {
            const data = {
                sections: this.modules.sectionManager.toJSON(),
                pageSettings: this.pageSettings
            };

            // HTML도 함께 저장
            const html = this.modules.sectionManager.toHTML(this.pageSettings.width, this.pageSettings.backgroundColor);

            await Promise.all([
                fetch(`/api/projects/${this.projectId}/files/shop-data.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: JSON.stringify(data, null, 2) })
                }),
                fetch(`/api/projects/${this.projectId}/files/index.html`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: html })
                })
            ]);

            this._isDirty = false;
            this._updateSaveStatus('saved');
        } catch (err) {
            console.error('Save failed:', err);
            this._updateSaveStatus('error');
        }
    }

    async _loadProject() {
        if (!this.projectId) return;

        try {
            // 프로젝트 메타 로드
            const metaRes = await fetch(`/api/projects/${this.projectId}`);
            if (metaRes.ok) {
                const meta = await metaRes.json();
                this.projectName = meta.name || 'Untitled';
                const projectNameEl = document.getElementById('projectName');
                if (projectNameEl) projectNameEl.textContent = this.projectName;
            }

            // 섹션 데이터 로드
            const dataRes = await fetch(`/api/projects/${this.projectId}/files/shop-data.json`);
            if (dataRes.ok) {
                const raw = await dataRes.json();
                let data;
                if (typeof raw.content === 'string') {
                    data = JSON.parse(raw.content);
                } else {
                    data = raw;
                }

                if (data.pageSettings) {
                    Object.assign(this.pageSettings, data.pageSettings);
                    this._applyPageSettings();

                    // Update UI
                    const bgColor = document.getElementById('pageBgColor');
                    const bgColorText = document.getElementById('pageBgColorText');
                    if (bgColor) bgColor.value = this.pageSettings.backgroundColor;
                    if (bgColorText) bgColorText.value = this.pageSettings.backgroundColor;
                }

                if (data.sections) {
                    this.modules.sectionManager.fromJSON(data.sections);
                }
            }
        } catch (err) {
            console.log('No existing shop data, starting fresh');
        }

        this._applyPageSettings();

        // 빈 프로젝트면 템플릿 선택 모달 자동 표시
        if (this.modules.sectionManager.sections.length === 0) {
            setTimeout(() => this.showTemplateModal(), 300);
        }
    }

    _updateSaveStatus(status) {
        const saveStatus = document.getElementById('saveStatus');
        const statusText = saveStatus?.querySelector('.status-text');
        const statusDot = saveStatus?.querySelector('.status-dot');

        if (!saveStatus) return;

        saveStatus.classList.remove('saving');

        switch (status) {
            case 'saving':
                saveStatus.classList.add('saving');
                if (statusText) statusText.textContent = '저장 중...';
                break;
            case 'saved':
                if (statusText) statusText.textContent = '저장됨';
                if (statusDot) statusDot.style.background = 'var(--success-color)';
                break;
            case 'error':
                if (statusText) statusText.textContent = '저장 실패';
                if (statusDot) statusDot.style.background = 'var(--danger-color)';
                break;
        }
    }

    // ===== Toast =====

    _showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== Getters =====

    getModule(name) {
        return this.modules[name] || null;
    }
}

export default ShopEditorApp;
