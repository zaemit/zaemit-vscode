/**
 * ImageEditorModal - 이미지 크롭, 리사이즈, 필터, 회전/뒤집기 편집 모달
 * Canvas API + CSS filter 하이브리드 방식
 */
import EventEmitter from './EventEmitter.js';

class ImageEditorModal extends EventEmitter {
    constructor(dependencies) {
        super();
        this.projectId = dependencies.projectId;
        this.undoRedoManager = dependencies.undoRedoManager;
        this.uiHelper = dependencies.uiHelper;
        this.imageManager = dependencies.imageManager;

        this.modal = null;
        this.canvas = null;
        this.ctx = null;
        this.previewImg = null;
        this.originalImage = null;
        this._initialImage = null; // Preserved for reset to open state
        this.targetElement = null;

        this.editState = {
            rotation: 0,
            flipH: false,
            flipV: false,
            crop: null,
            filters: {
                brightness: 100,
                contrast: 100,
                saturate: 100,
                grayscale: 0,
                blur: 0,
                sepia: 0
            }
        };

        this.cropMode = false;
        this.cropDrag = null;
        this.cropRect = null;
        this._isApplying = false;
        this._editMode = null; // 'img' or 'background'
    }

    init() {
        this._createModal();
    }

    _createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'image-editor-modal';
        this.modal.innerHTML = `
            <div class="image-editor-backdrop"></div>
            <div class="image-editor-container">
                <div class="image-editor-header">
                    <div class="editor-header-left">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                        </svg>
                        <h3>Image Editor</h3>
                    </div>
                    <div class="editor-header-right">
                        <span class="editor-image-info" id="editorImageInfo"></span>
                        <button class="image-editor-close" title="Close (Esc)">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="image-editor-body">
                    <div class="image-editor-tools">
                        <!-- Transform -->
                        <div class="tool-section">
                            <h4>Transform</h4>
                            <div class="tool-row">
                                <button class="tool-btn" data-action="rotateLeft" title="Rotate Left 90°">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                                </button>
                                <button class="tool-btn" data-action="rotateRight" title="Rotate Right 90°">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                                </button>
                                <button class="tool-btn" data-action="flipV" title="Flip Vertical">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><polyline points="4 8 8 4 8 20 4 16"/><polyline points="20 8 16 4 16 20 20 16"/></svg>
                                </button>
                                <button class="tool-btn" data-action="flipH" title="Flip Horizontal">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20"/><polyline points="8 4 4 8 20 8 16 4"/><polyline points="8 20 4 16 20 16 16 20"/></svg>
                                </button>
                            </div>
                        </div>
                        <!-- Crop -->
                        <div class="tool-section">
                            <h4>Crop</h4>
                            <div class="tool-row">
                                <button class="tool-btn crop-toggle-btn" data-action="cropToggle" title="Crop">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 002 2h15"/><path d="M1 6.13L16 6a2 2 0 012 2v15"/></svg>
                                    <span>Crop</span>
                                </button>
                                <button class="tool-btn crop-apply-btn hidden" data-action="cropApply" title="Apply Crop">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                    Apply
                                </button>
                                <button class="tool-btn crop-cancel-btn hidden" data-action="cropCancel" title="Cancel Crop">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    Cancel
                                </button>
                            </div>
                            <p class="tool-hint crop-hint hidden">Drag on the image to select crop area</p>
                        </div>
                        <!-- Resize -->
                        <div class="tool-section">
                            <h4>Resize</h4>
                            <div class="resize-inputs">
                                <div class="resize-row">
                                    <label>W</label>
                                    <input type="number" id="resizeWidth" class="resize-input" min="1" />
                                </div>
                                <button class="tool-btn resize-lock active" data-action="resizeLock" title="Lock aspect ratio">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                </button>
                                <div class="resize-row">
                                    <label>H</label>
                                    <input type="number" id="resizeHeight" class="resize-input" min="1" />
                                </div>
                            </div>
                        </div>
                        <!-- Filters -->
                        <div class="tool-section">
                            <h4>Adjustments</h4>
                            <div class="filter-controls">
                                <div class="filter-row" data-default="100">
                                    <label>Brightness</label>
                                    <div class="filter-slider-wrap">
                                        <input type="range" min="0" max="200" value="100" data-filter="brightness" />
                                    </div>
                                    <span class="filter-value">100</span>
                                </div>
                                <div class="filter-row" data-default="100">
                                    <label>Contrast</label>
                                    <div class="filter-slider-wrap">
                                        <input type="range" min="0" max="200" value="100" data-filter="contrast" />
                                    </div>
                                    <span class="filter-value">100</span>
                                </div>
                                <div class="filter-row" data-default="100">
                                    <label>Saturation</label>
                                    <div class="filter-slider-wrap">
                                        <input type="range" min="0" max="200" value="100" data-filter="saturate" />
                                    </div>
                                    <span class="filter-value">100</span>
                                </div>
                                <div class="filter-row" data-default="0">
                                    <label>Blur</label>
                                    <div class="filter-slider-wrap">
                                        <input type="range" min="0" max="20" value="0" data-filter="blur" />
                                    </div>
                                    <span class="filter-value">0</span>
                                </div>
                                <div class="filter-row" data-default="0">
                                    <label>Grayscale</label>
                                    <div class="filter-slider-wrap">
                                        <input type="range" min="0" max="100" value="0" data-filter="grayscale" />
                                    </div>
                                    <span class="filter-value">0</span>
                                </div>
                                <div class="filter-row" data-default="0">
                                    <label>Sepia</label>
                                    <div class="filter-slider-wrap">
                                        <input type="range" min="0" max="100" value="0" data-filter="sepia" />
                                    </div>
                                    <span class="filter-value">0</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="image-editor-preview">
                        <div class="preview-canvas-wrapper" id="previewCanvasWrapper">
                            <canvas id="imageEditorCanvas"></canvas>
                            <div class="crop-overlay hidden"></div>
                            <div class="crop-selection hidden" id="cropSelection">
                                <div class="crop-handle crop-handle-nw"></div>
                                <div class="crop-handle crop-handle-ne"></div>
                                <div class="crop-handle crop-handle-sw"></div>
                                <div class="crop-handle crop-handle-se"></div>
                                <div class="crop-guide crop-guide-h1"></div>
                                <div class="crop-guide crop-guide-h2"></div>
                                <div class="crop-guide crop-guide-v1"></div>
                                <div class="crop-guide crop-guide-v2"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="image-editor-footer">
                    <button class="editor-btn reset-btn" data-action="reset" title="Reset all changes">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                        Reset
                    </button>
                    <div class="footer-right">
                        <button class="editor-btn cancel-btn" data-action="cancel">Cancel</button>
                        <button class="editor-btn apply-btn" data-action="apply" id="editorApplyBtn">
                            <span class="apply-text">Save & Apply</span>
                            <span class="apply-loading hidden">
                                <span class="apply-spinner"></span>
                                Saving...
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.canvas = this.modal.querySelector('#imageEditorCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.cropOverlay = this.modal.querySelector('.crop-overlay');
        this.cropSelection = this.modal.querySelector('#cropSelection');
        this.canvasWrapper = this.modal.querySelector('#previewCanvasWrapper');
        this.previewArea = this.modal.querySelector('.image-editor-preview');

        this._setupEvents();
    }

    _setupEvents() {
        // Close
        this.modal.querySelector('.image-editor-backdrop').addEventListener('click', () => this.close());
        this.modal.querySelector('.image-editor-close').addEventListener('click', () => this.close());

        // Tool buttons
        this.modal.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => this._handleAction(btn.dataset.action));
        });

        // Filter sliders
        this.modal.querySelectorAll('[data-filter]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const filter = e.target.dataset.filter;
                const value = parseInt(e.target.value);
                this.editState.filters[filter] = value;
                const valueEl = e.target.closest('.filter-row').querySelector('.filter-value');
                if (valueEl) valueEl.textContent = value;
                this._updateSliderTrack(e.target);
                this._updatePreview();
            });

            // Double-click to reset slider
            slider.addEventListener('dblclick', (e) => {
                const row = e.target.closest('.filter-row');
                const defaultVal = parseInt(row?.dataset.default || '0');
                e.target.value = defaultVal;
                const filter = e.target.dataset.filter;
                this.editState.filters[filter] = defaultVal;
                const valueEl = row.querySelector('.filter-value');
                if (valueEl) valueEl.textContent = defaultVal;
                this._updateSliderTrack(e.target);
                this._updatePreview();
            });

            // Initialize slider track fills
            this._updateSliderTrack(slider);
        });

        // Resize inputs
        this._resizeLocked = true;
        const widthInput = this.modal.querySelector('#resizeWidth');
        const heightInput = this.modal.querySelector('#resizeHeight');

        widthInput?.addEventListener('change', () => {
            if (this._resizeLocked && this.originalImage) {
                const { width, height } = this._getEffectiveSize();
                const ratio = height / width;
                heightInput.value = Math.round(parseInt(widthInput.value) * ratio);
            }
        });
        heightInput?.addEventListener('change', () => {
            if (this._resizeLocked && this.originalImage) {
                const { width, height } = this._getEffectiveSize();
                const ratio = width / height;
                widthInput.value = Math.round(parseInt(heightInput.value) * ratio);
            }
        });

        // Crop overlay mouse events
        this._setupCropEvents();

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!this.modal.classList.contains('open')) return;
            if (e.key === 'Escape') {
                if (this.cropMode) {
                    this._cancelCrop();
                } else {
                    this.close();
                }
            }
            if (e.key === 'Enter' && this.cropMode && this.cropRect) {
                this._applyCrop();
            }
            // Arrow keys: move/resize crop selection
            if (this.cropMode && this.cropRect && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const cw = this.canvas.offsetWidth;
                const ch = this.canvas.offsetHeight;
                const r = this.cropRect;
                if (e.shiftKey) {
                    // Shift+Arrow: resize
                    if (e.key === 'ArrowRight') r.width = Math.min(r.width + 1, cw - r.x);
                    if (e.key === 'ArrowLeft') r.width = Math.max(r.width - 1, 5);
                    if (e.key === 'ArrowDown') r.height = Math.min(r.height + 1, ch - r.y);
                    if (e.key === 'ArrowUp') r.height = Math.max(r.height - 1, 5);
                } else {
                    // Arrow: move
                    if (e.key === 'ArrowRight') r.x = Math.min(r.x + 1, cw - r.width);
                    if (e.key === 'ArrowLeft') r.x = Math.max(r.x - 1, 0);
                    if (e.key === 'ArrowDown') r.y = Math.min(r.y + 1, ch - r.height);
                    if (e.key === 'ArrowUp') r.y = Math.max(r.y - 1, 0);
                }
                this._drawCropOverlay();
                this._drawCropSelection();
            }
        });
    }

    _updateSliderTrack(slider) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const val = parseFloat(slider.value);
        const percent = ((val - min) / (max - min)) * 100;
        // Set background directly for maximum browser compatibility
        if (!this._sliderColor) {
            this._sliderColor = getComputedStyle(this.modal).getPropertyValue('--primary').trim() || '#6c7ae0';
        }
        slider.style.background = `linear-gradient(to right, ${this._sliderColor} ${percent}%, rgba(255,255,255,0.15) ${percent}%)`;
        slider.style.borderRadius = '3px';
    }

    _setupCropEvents() {
        const area = this.previewArea;

        // Mousedown on preview area: new crop selection or handle resize
        area.addEventListener('mousedown', (e) => {
            if (!this.cropMode) return;

            const handle = e.target.closest('.crop-handle');
            if (handle && this.cropRect) {
                // Start handle resize
                const type = handle.className.match(/crop-handle-(\w+)/)?.[1];
                if (type) {
                    const r = this.cropRect;
                    this.cropDrag = {
                        type: 'handle',
                        handle: type,
                        dragging: true,
                        anchorX: type.includes('e') ? r.x : r.x + r.width,
                        anchorY: type.includes('s') ? r.y : r.y + r.height
                    };
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }

            // New crop selection
            const canvasRect = this.canvas.getBoundingClientRect();
            const startX = Math.max(0, Math.min(e.clientX - canvasRect.left, this.canvas.offsetWidth));
            const startY = Math.max(0, Math.min(e.clientY - canvasRect.top, this.canvas.offsetHeight));
            this.cropDrag = { type: 'new', startX, startY, dragging: true };
            this.cropRect = null;
            this.cropSelection.classList.add('hidden');
            e.preventDefault();
        });

        // Document-level mousemove: drag continues even outside the modal
        document.addEventListener('mousemove', (e) => {
            if (!this.cropDrag?.dragging) return;
            if (!this.modal.classList.contains('open')) return;

            const canvasRect = this.canvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - canvasRect.left, this.canvas.offsetWidth));
            const y = Math.max(0, Math.min(e.clientY - canvasRect.top, this.canvas.offsetHeight));

            if (this.cropDrag.type === 'handle') {
                const { anchorX, anchorY } = this.cropDrag;
                this.cropRect = {
                    x: Math.min(anchorX, x),
                    y: Math.min(anchorY, y),
                    width: Math.abs(x - anchorX),
                    height: Math.abs(y - anchorY)
                };
            } else {
                const sx = Math.min(this.cropDrag.startX, x);
                const sy = Math.min(this.cropDrag.startY, y);
                const ex = Math.max(this.cropDrag.startX, x);
                const ey = Math.max(this.cropDrag.startY, y);
                this.cropRect = { x: sx, y: sy, width: ex - sx, height: ey - sy };
            }

            this._drawCropOverlay();
            this._drawCropSelection();
        });

        // Document-level mouseup: never miss the end of drag
        document.addEventListener('mouseup', () => {
            if (this.cropDrag) this.cropDrag.dragging = false;
        });
    }

    _drawCropOverlay() {
        if (!this.cropRect) return;
        const { x, y, width, height } = this.cropRect;
        this.cropOverlay.style.cssText = `
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.55);
            clip-path: polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%,
                0% ${y}px,
                ${x}px ${y}px,
                ${x}px ${y + height}px,
                ${x + width}px ${y + height}px,
                ${x + width}px ${y}px,
                0% ${y}px
            );
            pointer-events: none;
        `;
    }

    _drawCropSelection() {
        if (!this.cropRect || this.cropRect.width < 3 || this.cropRect.height < 3) {
            this.cropSelection.classList.add('hidden');
            return;
        }
        this.cropSelection.classList.remove('hidden');
        const { x, y, width, height } = this.cropRect;
        this.cropSelection.style.cssText = `
            left: ${x}px; top: ${y}px;
            width: ${width}px; height: ${height}px;
        `;
    }

    _handleAction(action) {
        switch (action) {
            case 'rotateLeft':
                this.editState.rotation = (this.editState.rotation - 90 + 360) % 360;
                this._redraw();
                this._updateResizeInputs();
                break;
            case 'rotateRight':
                this.editState.rotation = (this.editState.rotation + 90) % 360;
                this._redraw();
                this._updateResizeInputs();
                break;
            case 'flipH':
                this.editState.flipH = !this.editState.flipH;
                this.modal.querySelector('[data-action="flipH"]')?.classList.toggle('active', this.editState.flipH);
                this._redraw();
                break;
            case 'flipV':
                this.editState.flipV = !this.editState.flipV;
                this.modal.querySelector('[data-action="flipV"]')?.classList.toggle('active', this.editState.flipV);
                this._redraw();
                break;
            case 'cropToggle':
                this._toggleCropMode();
                break;
            case 'cropApply':
                this._applyCrop();
                break;
            case 'cropCancel':
                this._cancelCrop();
                break;
            case 'resizeLock':
                this._resizeLocked = !this._resizeLocked;
                this.modal.querySelector('.resize-lock')?.classList.toggle('active', this._resizeLocked);
                break;
            case 'reset':
                this._reset();
                break;
            case 'cancel':
                this.close();
                break;
            case 'apply':
                this._apply();
                break;
        }
    }

    open(element, mode) {
        this._editMode = mode || 'img';

        let imageSrc;
        if (this._editMode === 'background') {
            if (!element) return;
            imageSrc = this._extractBgImageUrl(element);
            if (!imageSrc) {
                this.uiHelper?.showToast('No background image to edit', 'error');
                return;
            }
        } else {
            if (!element || element.tagName !== 'IMG') return;
            imageSrc = element.src;
        }

        this.targetElement = element;
        this._reset();

        // Load image and preserve initial for reset
        this._initialImage = new Image();
        this._initialImage.crossOrigin = 'anonymous';
        this._initialImage.onload = () => {
            this.originalImage = this._initialImage;
            this._updateResizeInputs();
            this._updateImageInfo();
            this._redraw();
            this.modal.classList.add('open');
            this.emit('editor:opened');
        };
        this._initialImage.onerror = () => {
            this.uiHelper?.showToast('Cannot edit this image (CORS restricted)', 'error');
        };
        this._initialImage.src = imageSrc;
    }

    _extractBgImageUrl(element) {
        const bg = getComputedStyle(element).backgroundImage;
        if (!bg || bg === 'none') return null;
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        return match ? match[1] : null;
    }

    close() {
        this.modal.classList.remove('open');
        this._cancelCrop();
        this.targetElement = null;
        this.originalImage = null;
        this._initialImage = null;
        this._editMode = null;
    }

    _reset() {
        this.editState = {
            rotation: 0,
            flipH: false,
            flipV: false,
            crop: null,
            filters: {
                brightness: 100,
                contrast: 100,
                saturate: 100,
                grayscale: 0,
                blur: 0,
                sepia: 0
            }
        };

        // Reset filter sliders
        this.modal.querySelectorAll('[data-filter]').forEach(slider => {
            const row = slider.closest('.filter-row');
            const defaultVal = parseInt(row?.dataset.default || '0');
            slider.value = defaultVal;
            const valueEl = row.querySelector('.filter-value');
            if (valueEl) valueEl.textContent = defaultVal;
            this._updateSliderTrack(slider);
        });

        // Reset flip buttons
        this.modal.querySelector('[data-action="flipH"]')?.classList.remove('active');
        this.modal.querySelector('[data-action="flipV"]')?.classList.remove('active');

        // Restore original image from open-time snapshot
        if (this._initialImage?.complete) {
            this.originalImage = this._initialImage;
        }

        // Cancel any active crop
        this._cancelCrop();

        if (this.originalImage?.complete) {
            this._updateResizeInputs();
            this._updateImageInfo();
            this._redraw();
        }
    }

    _updateImageInfo() {
        const infoEl = this.modal.querySelector('#editorImageInfo');
        if (!infoEl || !this.originalImage) return;
        const { width, height } = this._getEffectiveSize();
        infoEl.textContent = `${width} × ${height} px`;
    }

    _getEffectiveSize() {
        if (!this.originalImage) return { width: 0, height: 0 };

        let w = this.editState.crop ? this.editState.crop.width : this.originalImage.naturalWidth;
        let h = this.editState.crop ? this.editState.crop.height : this.originalImage.naturalHeight;

        // Swap dimensions for 90/270 degree rotation
        if (this.editState.rotation === 90 || this.editState.rotation === 270) {
            [w, h] = [h, w];
        }
        return { width: w, height: h };
    }

    _updateResizeInputs() {
        const { width, height } = this._getEffectiveSize();
        const widthInput = this.modal.querySelector('#resizeWidth');
        const heightInput = this.modal.querySelector('#resizeHeight');
        if (widthInput) widthInput.value = width;
        if (heightInput) heightInput.value = height;
    }

    _buildFilterString() {
        const f = this.editState.filters;
        let str = '';
        if (f.brightness !== 100) str += `brightness(${f.brightness}%) `;
        if (f.contrast !== 100) str += `contrast(${f.contrast}%) `;
        if (f.saturate !== 100) str += `saturate(${f.saturate}%) `;
        if (f.grayscale > 0) str += `grayscale(${f.grayscale}%) `;
        if (f.blur > 0) str += `blur(${f.blur}px) `;
        if (f.sepia > 0) str += `sepia(${f.sepia}%) `;
        return str.trim() || 'none';
    }

    _updatePreview() {
        // Use CSS filter on canvas for real-time preview
        this.canvas.style.filter = this._buildFilterString();
    }

    _redraw() {
        if (!this.originalImage) return;

        const img = this.originalImage;
        const crop = this.editState.crop;
        const sx = crop ? crop.x : 0;
        const sy = crop ? crop.y : 0;
        const sw = crop ? crop.width : img.naturalWidth;
        const sh = crop ? crop.height : img.naturalHeight;

        const rotation = this.editState.rotation;
        const isRotated = rotation === 90 || rotation === 270;

        // Canvas dimensions
        const cw = isRotated ? sh : sw;
        const ch = isRotated ? sw : sh;

        // Limit canvas display size - increased for larger modal
        const maxW = 900;
        const maxH = 650;
        const scale = Math.min(1, maxW / cw, maxH / ch);

        this.canvas.width = cw;
        this.canvas.height = ch;
        this.canvas.style.width = (cw * scale) + 'px';
        this.canvas.style.height = (ch * scale) + 'px';

        this.ctx.clearRect(0, 0, cw, ch);
        this.ctx.save();

        // Apply rotation and flip
        this.ctx.translate(cw / 2, ch / 2);
        this.ctx.rotate((rotation * Math.PI) / 180);
        if (this.editState.flipH) this.ctx.scale(-1, 1);
        if (this.editState.flipV) this.ctx.scale(1, -1);
        this.ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

        this.ctx.restore();

        // Apply CSS filter for preview
        this._updatePreview();
    }

    _toggleCropMode() {
        this.cropMode = !this.cropMode;
        this.modal.querySelector('.crop-toggle-btn')?.classList.toggle('active', this.cropMode);
        this.modal.querySelector('.crop-apply-btn')?.classList.toggle('hidden', !this.cropMode);
        this.modal.querySelector('.crop-cancel-btn')?.classList.toggle('hidden', !this.cropMode);
        this.modal.querySelector('.crop-hint')?.classList.toggle('hidden', !this.cropMode);
        this.cropOverlay.classList.toggle('hidden', !this.cropMode);

        // Cursor change on entire preview area
        this.previewArea.classList.toggle('crop-active', this.cropMode);

        if (!this.cropMode) {
            this.cropRect = null;
            this.cropOverlay.style.cssText = '';
            this.cropSelection.classList.add('hidden');
        }
    }

    _applyCrop() {
        if (!this.cropRect || this.cropRect.width < 5 || this.cropRect.height < 5) {
            this.uiHelper?.showToast('Select a crop area first', 'error');
            return;
        }

        // Convert displayed coordinates to actual canvas coordinates
        const displayScale = this.canvas.width / this.canvas.offsetWidth;
        const cropX = Math.round(this.cropRect.x * displayScale);
        const cropY = Math.round(this.cropRect.y * displayScale);
        const cropW = Math.round(this.cropRect.width * displayScale);
        const cropH = Math.round(this.cropRect.height * displayScale);

        // Get current canvas content as image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropW;
        tempCanvas.height = cropH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // Replace original with cropped version
        const croppedImg = new Image();
        croppedImg.onload = () => {
            this.originalImage = croppedImg;
            this.editState.rotation = 0;
            this.editState.flipH = false;
            this.editState.flipV = false;
            this.editState.crop = null;
            this.modal.querySelector('[data-action="flipH"]')?.classList.remove('active');
            this.modal.querySelector('[data-action="flipV"]')?.classList.remove('active');
            this._cancelCrop();
            this._updateResizeInputs();
            this._updateImageInfo();
            this._redraw();
        };
        croppedImg.src = tempCanvas.toDataURL();
    }

    _cancelCrop() {
        this.cropMode = false;
        this.cropRect = null;
        this.cropOverlay.classList.add('hidden');
        this.cropOverlay.style.cssText = '';
        this.cropSelection.classList.add('hidden');
        this.previewArea.classList.remove('crop-active');
        this.modal.querySelector('.crop-toggle-btn')?.classList.remove('active');
        this.modal.querySelector('.crop-apply-btn')?.classList.add('hidden');
        this.modal.querySelector('.crop-cancel-btn')?.classList.add('hidden');
        this.modal.querySelector('.crop-hint')?.classList.add('hidden');
    }

    _setApplyLoading(loading) {
        this._isApplying = loading;
        const btn = this.modal.querySelector('#editorApplyBtn');
        if (!btn) return;
        btn.disabled = loading;
        btn.querySelector('.apply-text')?.classList.toggle('hidden', loading);
        btn.querySelector('.apply-loading')?.classList.toggle('hidden', !loading);
    }

    async _apply() {
        if (!this.targetElement || !this.originalImage || this._isApplying) return;

        this._setApplyLoading(true);

        try {
            // Get final dimensions from resize inputs
            const targetW = parseInt(this.modal.querySelector('#resizeWidth')?.value) || this.canvas.width;
            const targetH = parseInt(this.modal.querySelector('#resizeHeight')?.value) || this.canvas.height;

            // Render final result to a new canvas
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetW;
            finalCanvas.height = targetH;
            const fCtx = finalCanvas.getContext('2d');

            // Apply filter to canvas context
            const filterStr = this._buildFilterString();
            if (filterStr !== 'none') {
                fCtx.filter = filterStr;
            }

            // Draw the current canvas content (with rotation/flip/crop already applied)
            // Remove CSS filter temporarily to get clean pixel data
            const savedFilter = this.canvas.style.filter;
            this.canvas.style.filter = 'none';

            // Redraw the source without CSS filter and capture
            this._redraw();
            this.canvas.style.filter = 'none';

            fCtx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, targetW, targetH);

            // Restore CSS filter
            this.canvas.style.filter = savedFilter;
            this._updatePreview();

            // Convert to blob
            const blob = await new Promise(resolve => {
                finalCanvas.toBlob(resolve, 'image/png', 0.92);
            });

            if (!blob) {
                this.uiHelper?.showToast('Failed to process image', 'error');
                return;
            }

            // Upload to server
            const formData = new FormData();
            formData.append('image', blob, 'edited_' + Date.now() + '.png');

            const response = await fetch(`/api/projects/${this.projectId}/images`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Upload failed');

            const newSrc = data.image.url;

            if (this._editMode === 'background') {
                // Background image mode
                const oldValue = this.targetElement.style.backgroundImage
                    || getComputedStyle(this.targetElement).backgroundImage;
                const newValue = `url(${newSrc})`;

                if (this.undoRedoManager) {
                    this.undoRedoManager.recordChange({
                        type: 'style',
                        element: this.targetElement,
                        property: 'background-image',
                        oldValue: oldValue || '',
                        newValue
                    });
                }

                this.targetElement.style.backgroundImage = newValue;
                this.emit('image:edited', { element: this.targetElement, mode: 'background', oldValue, newValue });
            } else {
                // IMG element mode
                const oldSrc = this.targetElement.src;

                if (this.undoRedoManager) {
                    this.undoRedoManager.recordAttributeChange(
                        this.targetElement,
                        'src',
                        oldSrc,
                        newSrc
                    );
                }

                this.targetElement.src = newSrc;
                this.emit('image:edited', { element: this.targetElement, mode: 'img', oldSrc, newSrc });
            }

            // Refresh image manager
            this.imageManager?.loadImages?.();

            this.uiHelper?.showToast('Image saved', 'success');
            this.close();

        } catch (error) {
            console.error('[ImageEditorModal] Save error:', error);
            this.uiHelper?.showToast(error.message || 'Failed to save image', 'error');
        } finally {
            this._setApplyLoading(false);
        }
    }
}

export default ImageEditorModal;
