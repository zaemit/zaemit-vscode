import EventEmitter from './EventEmitter.js';

/**
 * ImageToolbar - Floating toolbar for quick image transforms
 * IMG 요소 선택 시 회전/반전 등 간단한 변환을 즉시 수행하는 플로팅 툴바
 */
class ImageToolbar extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.selectedElement = null;
        this.zoomLevel = 1;
        this.toolbar = null;
    }

    init(previewFrame) {
        this.previewFrame = previewFrame;
        this._createToolbar();
    }

    setActiveIframe(iframe) {
        this.previewFrame = iframe;
    }

    setZoomLevel(zoom) {
        this.zoomLevel = zoom;
        if (this.selectedElement) {
            this._positionToolbar();
        }
    }

    /**
     * Show toolbar for the given IMG element
     */
    show(imgElement) {
        if (!imgElement || imgElement.tagName !== 'IMG') return;
        this.selectedElement = imgElement;
        this._updateButtonStates();
        this._positionToolbar();
        this.toolbar.classList.add('visible');
    }

    /**
     * Hide toolbar
     */
    hide() {
        this.selectedElement = null;
        if (this.toolbar) {
            this.toolbar.classList.remove('visible');
        }
    }

    /**
     * Update position (call on scroll, zoom, overlay update)
     */
    updatePosition() {
        if (this.selectedElement && this.toolbar?.classList.contains('visible')) {
            this._positionToolbar();
        }
    }

    /**
     * Create toolbar DOM dynamically
     */
    _createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'image-toolbar';
        toolbar.innerHTML = `
            <button data-action="rotateLeft" title="Rotate Left 90°">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            </button>
            <button data-action="rotateRight" title="Rotate Right 90°">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            </button>
            <div class="image-toolbar-divider"></div>
            <button data-action="flipH" title="Flip Horizontal">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20"/><polyline points="8 4 4 8 20 8 16 4"/><polyline points="8 20 4 16 20 16 16 20"/></svg>
            </button>
            <button data-action="flipV" title="Flip Vertical">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><polyline points="4 8 8 4 8 20 4 16"/><polyline points="20 8 16 4 16 20 20 16"/></svg>
            </button>
            <div class="image-toolbar-divider"></div>
            <button data-action="resetTransform" title="Reset Transform">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            <button data-action="editFull" title="Open Image Editor">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
        `;

        document.body.appendChild(toolbar);
        this.toolbar = toolbar;

        // Handle button clicks
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            switch (action) {
                case 'rotateLeft': this._rotateLeft(); break;
                case 'rotateRight': this._rotateRight(); break;
                case 'flipH': this._flipH(); break;
                case 'flipV': this._flipV(); break;
                case 'resetTransform': this._resetTransform(); break;
                case 'editFull': this.emit('toolbar:editFull'); break;
            }
        });

        // Prevent toolbar clicks from deselecting element
        toolbar.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Position toolbar below the selected image (or above if no room)
     */
    _positionToolbar() {
        if (!this.selectedElement || !this.toolbar || !this.previewFrame) return;

        const elementRect = this.selectedElement.getBoundingClientRect();
        const iframeRect = this.previewFrame.getBoundingClientRect();
        let zoom = this.zoomLevel || 1;

        const toolbarWidth = this.toolbar.offsetWidth || 280;
        const toolbarHeight = this.toolbar.offsetHeight || 40;

        // 이미지 아래쪽 중앙에 배치
        let x = iframeRect.left + (elementRect.left * zoom)
                + (elementRect.width * zoom / 2) - (toolbarWidth / 2);
        let y = iframeRect.top + ((elementRect.top + elementRect.height) * zoom) + 12;

        // 하단 넘침 → 이미지 위쪽에 배치
        if (y + toolbarHeight > window.innerHeight - 10) {
            y = iframeRect.top + (elementRect.top * zoom) - toolbarHeight - 12;
        }

        // 화면 경계 보정
        x = Math.max(10, Math.min(x, window.innerWidth - toolbarWidth - 10));
        y = Math.max(10, y);

        this.toolbar.style.left = x + 'px';
        this.toolbar.style.top = y + 'px';
    }

    /**
     * Update button active states based on current transform
     */
    _updateButtonStates() {
        if (!this.selectedElement || !this.toolbar) return;

        const parts = this._parseTransform(this._readCurrentTransform(this.selectedElement));
        const hasRotate = parts.rotate && parseFloat(parts.rotate) !== 0;
        const hasFlipH = parts.scaleX && parseFloat(parts.scaleX) === -1;
        const hasFlipV = parts.scaleY && parseFloat(parts.scaleY) === -1;
        const hasAny = hasRotate || hasFlipH || hasFlipV;

        this.toolbar.querySelector('[data-action="flipH"]')?.classList.toggle('active', hasFlipH);
        this.toolbar.querySelector('[data-action="flipV"]')?.classList.toggle('active', hasFlipV);
        this.toolbar.querySelector('[data-action="resetTransform"]')?.classList.toggle('active', hasAny);
    }

    // ========== Transform Operations ==========

    _rotateRight() {
        if (!this.selectedElement) return;
        const oldTransform = this._readCurrentTransform(this.selectedElement);
        const parts = this._parseTransform(oldTransform);
        const currentDeg = parts.rotate ? parseFloat(parts.rotate) : 0;
        parts.rotate = ((currentDeg + 90) % 360) + 'deg';
        this._applyTransform(oldTransform, this._buildTransform(parts));
    }

    _rotateLeft() {
        if (!this.selectedElement) return;
        const oldTransform = this._readCurrentTransform(this.selectedElement);
        const parts = this._parseTransform(oldTransform);
        const currentDeg = parts.rotate ? parseFloat(parts.rotate) : 0;
        parts.rotate = (((currentDeg - 90) % 360 + 360) % 360) + 'deg';
        this._applyTransform(oldTransform, this._buildTransform(parts));
    }

    _flipH() {
        if (!this.selectedElement) return;
        const oldTransform = this._readCurrentTransform(this.selectedElement);
        const parts = this._parseTransform(oldTransform);
        const currentScaleX = parts.scaleX ? parseFloat(parts.scaleX) : 1;
        parts.scaleX = String(currentScaleX === -1 ? 1 : -1);
        this._applyTransform(oldTransform, this._buildTransform(parts));
    }

    _flipV() {
        if (!this.selectedElement) return;
        const oldTransform = this._readCurrentTransform(this.selectedElement);
        const parts = this._parseTransform(oldTransform);
        const currentScaleY = parts.scaleY ? parseFloat(parts.scaleY) : 1;
        parts.scaleY = String(currentScaleY === -1 ? 1 : -1);
        this._applyTransform(oldTransform, this._buildTransform(parts));
    }

    _resetTransform() {
        if (!this.selectedElement) return;
        const oldTransform = this._readCurrentTransform(this.selectedElement);
        const parts = this._parseTransform(oldTransform);
        // rotate/scale만 리셋, translate 등은 보존
        parts.rotate = null;
        parts.scaleX = null;
        parts.scaleY = null;
        this._applyTransform(oldTransform, this._buildTransform(parts));
    }

    // ========== Transform Utilities ==========

    /**
     * Read current transform from inline style or CSS rules
     * (inline style이 비어있을 수 있음 - _applyDragStyleChanges 후 CSS로 이동되므로)
     */
    _readCurrentTransform(element) {
        // 1. inline style 우선
        if (element.style.transform) return element.style.transform;

        // 2. CSS rules에서 읽기 (:hover/:focus/:active 제외)
        const doc = element.ownerDocument;
        if (!doc) return '';

        let result = '';
        try {
            const sheets = doc.styleSheets;
            for (let si = 0; si < sheets.length; si++) {
                try {
                    const rules = sheets[si].cssRules;
                    if (!rules) continue;
                    for (let ri = 0; ri < rules.length; ri++) {
                        const rule = rules[ri];
                        if (rule.type !== 1) continue;
                        const sel = rule.selectorText;
                        if (!sel || sel.includes(':hover') || sel.includes(':focus') || sel.includes(':active')) continue;
                        try {
                            if (!element.matches(sel)) continue;
                        } catch (e) { continue; }
                        const val = rule.style.getPropertyValue('transform');
                        if (val && val !== 'none') result = val;
                    }
                } catch (e) { continue; }
            }
        } catch (e) {}

        return result;
    }

    /**
     * Parse CSS transform string into components
     */
    _parseTransform(str) {
        const result = { rotate: null, scaleX: null, scaleY: null, others: [] };
        if (!str || str === 'none') return result;

        const rotateMatch = str.match(/rotate\(([-\d.]+)deg\)/);
        if (rotateMatch) result.rotate = rotateMatch[1] + 'deg';

        const scaleXMatch = str.match(/scaleX\(([-\d.]+)\)/);
        if (scaleXMatch) result.scaleX = scaleXMatch[1];

        const scaleYMatch = str.match(/scaleY\(([-\d.]+)\)/);
        if (scaleYMatch) result.scaleY = scaleYMatch[1];

        // scale(x, y) 복합 표기
        if (!scaleXMatch && !scaleYMatch) {
            const scaleMatch = str.match(/scale\(([-\d.]+)(?:,\s*([-\d.]+))?\)/);
            if (scaleMatch) {
                result.scaleX = scaleMatch[1];
                result.scaleY = scaleMatch[2] || scaleMatch[1];
            }
        }

        // 나머지 함수 보존 (translate 등)
        const cleanedStr = str
            .replace(/rotate\([^)]*\)/g, '')
            .replace(/scaleX\([^)]*\)/g, '')
            .replace(/scaleY\([^)]*\)/g, '')
            .replace(/scale\([^)]*\)/g, '')
            .trim();
        if (cleanedStr) {
            result.others = cleanedStr.split(/\s+/).filter(s => s.length > 0);
        }

        return result;
    }

    /**
     * Build CSS transform string from components
     */
    _buildTransform(parts) {
        const fns = [];

        if (parts.others && parts.others.length > 0) {
            fns.push(...parts.others);
        }
        if (parts.rotate && parts.rotate !== '0deg') {
            fns.push(`rotate(${parts.rotate})`);
        }
        if (parts.scaleX && parts.scaleX !== '1') {
            fns.push(`scaleX(${parts.scaleX})`);
        }
        if (parts.scaleY && parts.scaleY !== '1') {
            fns.push(`scaleY(${parts.scaleY})`);
        }

        return fns.length > 0 ? fns.join(' ') : '';
    }

    /**
     * Apply transform and emit event
     */
    _applyTransform(oldValue, newValue) {
        const el = this.selectedElement;

        // CSS transition 비활성화 → 모션 없이 즉시 적용
        el.style.transition = 'none';
        el.style.transform = newValue;
        // reflow 강제 → 변경값 즉시 커밋
        void el.offsetHeight;
        // inline transition 제거 → CSS 규칙의 transition 복원 (값은 이미 커밋됨)
        el.style.removeProperty('transition');

        this.emit('transform:changed', {
            element: el,
            property: 'transform',
            oldValue,
            newValue
        });

        this.emit('toolbar:overlayUpdate');
        this._updateButtonStates();
        this._positionToolbar();
    }
}

export default ImageToolbar;
