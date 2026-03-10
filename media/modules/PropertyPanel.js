import EventEmitter from './EventEmitter.js';

/**
 * PropertyPanel - Handles element property editing (ID, classes, tag, attributes, link options)
 */
class PropertyPanel extends EventEmitter {
    constructor(elementSelector) {
        super();
        this.elementSelector = elementSelector;
        this.selectedElement = null;
        this.previewFrame = null;

        // Boolean attributes list
        this.booleanAttrs = [
            'required', 'disabled', 'readonly', 'checked', 'selected', 'multiple',
            'hidden', 'autofocus', 'autoplay', 'controls', 'loop', 'muted',
            'novalidate', 'open', 'reversed', 'async', 'defer', 'download'
        ];

        // Select options for specific attributes
        this.selectOptions = {
            'target': ['', '_blank', '_self', '_parent', '_top'],
            'type': ['text', 'password', 'email', 'number', 'tel', 'url', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'file', 'hidden', 'checkbox', 'radio', 'range', 'submit', 'reset', 'button', 'image', 'search'],
            'loading': ['lazy', 'eager'],
            'autocomplete': ['on', 'off', 'name', 'email', 'username', 'new-password', 'current-password', 'tel', 'address-line1', 'address-line2', 'country', 'postal-code'],
            'aria-hidden': ['true', 'false'],
            'role': ['button', 'link', 'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'form', 'search', 'dialog', 'alert', 'alertdialog', 'menu', 'menuitem', 'tab', 'tablist', 'tabpanel', 'listbox', 'option', 'progressbar', 'slider', 'spinbutton', 'status', 'timer', 'tooltip', 'tree', 'treeitem']
        };

        // Default values for attributes
        this.defaultValues = {
            'href': '#',
            'src': '',
            'alt': '',
            'target': '_blank',
            'rel': 'noopener noreferrer',
            'type': 'text',
            'placeholder': '',
            'title': '',
            'aria-label': '',
            'loading': 'lazy',
            'tabindex': '0'
        };

        this.init();
    }

    /**
     * Set preview frame reference
     * @param {HTMLIFrameElement} frame
     */
    setPreviewFrame(frame) {
        this.previewFrame = frame;
    }

    init() {
        this.elementSelector.on('element:selected', (element) => {
            this.selectedElement = element;
            this.updateProperties();
            this.showPanel();
        });

        this.elementSelector.on('element:deselected', () => {
            this.selectedElement = null;
            this.hidePanel();
        });

        this.setupHandlers();
    }

    setupHandlers() {
        // ID handler
        document.getElementById('elementId')?.addEventListener('change', (e) => {
            if (this.selectedElement) {
                const oldValue = this.selectedElement.id;
                this.selectedElement.id = e.target.value;
                this.emit('property:changed', { element: this.selectedElement, property: 'id', oldValue, newValue: e.target.value });
            }
        });

        // Classes handler
        document.getElementById('elementClasses')?.addEventListener('change', (e) => {
            if (this.selectedElement) {
                const oldClasses = this.selectedElement.className.replace('editor-highlight', '').replace('editor-hover', '').trim();
                const newClasses = e.target.value.split(' ').filter(c => c);
                this.selectedElement.className = newClasses.join(' ');
                this.emit('property:changed', { element: this.selectedElement, property: 'class', oldValue: oldClasses, newValue: newClasses.join(' ') });
            }
        });

        // Tag change handler
        document.getElementById('elementTag')?.addEventListener('change', (e) => {
            if (this.selectedElement) {
                this.changeElementTag(e.target.value);
            }
        });

        // Content handler (for simple text elements)
        document.getElementById('elementContent')?.addEventListener('change', (e) => {
            if (this.selectedElement && this.selectedElement.childNodes.length <= 1) {
                const oldValue = this.selectedElement.textContent;
                this.selectedElement.textContent = e.target.value;
                this.emit('property:changed', { element: this.selectedElement, property: 'content', oldValue, newValue: e.target.value });
            }
        });

        // Attribute preset handler
        document.getElementById('attributePreset')?.addEventListener('change', (e) => {
            const attrName = e.target.value;
            if (!attrName || !this.selectedElement) {
                e.target.value = '';
                return;
            }

            if (attrName === 'custom') {
                this.addCustomAttribute();
            } else if (attrName === 'data-*') {
                this.addCustomAttribute('data-');
            } else {
                if (this.selectedElement.hasAttribute(attrName)) {
                    this.emit('toast', { message: `Attribute ${attrName} already exists`, type: 'info' });
                } else {
                    this.addAttributeFromPreset(attrName);
                }
            }
            e.target.value = '';
        });

        // Add attribute button handler
        document.getElementById('addAttribute')?.addEventListener('click', () => {
            const preset = document.getElementById('attributePreset');
            const attrName = preset?.value;

            if (!attrName || attrName === '' || attrName === 'custom') {
                this.addCustomAttribute();
            } else if (attrName === 'data-*') {
                this.addCustomAttribute('data-');
            } else {
                if (this.selectedElement && this.selectedElement.hasAttribute(attrName)) {
                    this.emit('toast', { message: `Attribute ${attrName} already exists`, type: 'info' });
                } else {
                    this.addAttributeFromPreset(attrName);
                }
            }
            if (preset) preset.value = '';
        });

        // Setup link options handlers
        this.setupLinkOptionsHandlers();

        // Setup image options handlers
        this.setupImageOptionsHandlers();
    }

    /**
     * Setup handlers for Image Options section
     */
    setupImageOptionsHandlers() {
        // src input
        document.getElementById('imageSrc')?.addEventListener('change', (e) => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            const oldValue = this.selectedElement.getAttribute('src') || '';
            this.selectedElement.setAttribute('src', e.target.value);
            this.emit('property:changed', { element: this.selectedElement, property: 'src', oldValue, newValue: e.target.value });
            this._updateImagePreview();
        });

        // alt input
        document.getElementById('imageAlt')?.addEventListener('change', (e) => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            const oldValue = this.selectedElement.getAttribute('alt') || '';
            this.selectedElement.setAttribute('alt', e.target.value);
            this.emit('property:changed', { element: this.selectedElement, property: 'alt', oldValue, newValue: e.target.value });
        });

        // Browse button - open image browser
        document.getElementById('imageFromBrowser')?.addEventListener('click', () => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            this.emit('image:openBrowser', { element: this.selectedElement });
        });

        // Upload button
        document.getElementById('imageFromUpload')?.addEventListener('click', () => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            this.emit('image:uploadRequest', { element: this.selectedElement });
        });

        // Edit button - open image editor
        document.getElementById('imageEditBtn')?.addEventListener('click', () => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            this.emit('image:editRequest', { element: this.selectedElement });
        });

        // Width/Height with aspect ratio lock
        this._imageSizeLocked = true;
        const lockBtn = document.getElementById('imageSizeLock');
        lockBtn?.addEventListener('click', () => {
            this._imageSizeLocked = !this._imageSizeLocked;
            lockBtn.classList.toggle('active', this._imageSizeLocked);
        });

        document.getElementById('imageWidth')?.addEventListener('change', (e) => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            const el = this.selectedElement;
            const oldW = el.getAttribute('width') || '';
            const oldH = el.getAttribute('height') || '';
            const newW = e.target.value;

            if (newW) {
                el.setAttribute('width', newW);
                if (this._imageSizeLocked && el.naturalWidth && el.naturalHeight) {
                    const ratio = el.naturalHeight / el.naturalWidth;
                    const newH = Math.round(parseInt(newW) * ratio);
                    el.setAttribute('height', newH);
                    document.getElementById('imageHeight').value = newH;
                    this.emit('property:changed', { element: el, property: 'height', oldValue: oldH, newValue: String(newH) });
                }
            } else {
                el.removeAttribute('width');
            }
            this.emit('property:changed', { element: el, property: 'width', oldValue: oldW, newValue: newW });
        });

        document.getElementById('imageHeight')?.addEventListener('change', (e) => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            const el = this.selectedElement;
            const oldW = el.getAttribute('width') || '';
            const oldH = el.getAttribute('height') || '';
            const newH = e.target.value;

            if (newH) {
                el.setAttribute('height', newH);
                if (this._imageSizeLocked && el.naturalWidth && el.naturalHeight) {
                    const ratio = el.naturalWidth / el.naturalHeight;
                    const newW = Math.round(parseInt(newH) * ratio);
                    el.setAttribute('width', newW);
                    document.getElementById('imageWidth').value = newW;
                    this.emit('property:changed', { element: el, property: 'width', oldValue: oldW, newValue: String(newW) });
                }
            } else {
                el.removeAttribute('height');
            }
            this.emit('property:changed', { element: el, property: 'height', oldValue: oldH, newValue: newH });
        });

        // Object Fit button group
        document.getElementById('imageObjectFitGroup')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || !this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
            const value = btn.dataset.value;
            const oldValue = this.selectedElement.style.objectFit || '';
            this.selectedElement.style.objectFit = value;
            this._updateObjectFitButtons(value);
            this.emit('property:changed', { element: this.selectedElement, property: 'style.objectFit', oldValue, newValue: value });
        });
    }

    _updateImagePreview() {
        const thumb = document.getElementById('imagePreviewThumb');
        const sizeInfo = document.getElementById('imageNaturalSize');
        if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;

        if (thumb) thumb.src = this.selectedElement.src;
        if (sizeInfo) {
            const el = this.selectedElement;
            if (el.naturalWidth && el.naturalHeight) {
                sizeInfo.textContent = `${el.naturalWidth} × ${el.naturalHeight}`;
            } else {
                // Wait for image to load
                const tempImg = new Image();
                tempImg.onload = () => {
                    sizeInfo.textContent = `${tempImg.naturalWidth} × ${tempImg.naturalHeight}`;
                };
                tempImg.src = el.src;
            }
        }
    }

    _updateObjectFitButtons(activeValue) {
        const group = document.getElementById('imageObjectFitGroup');
        if (!group) return;
        group.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === activeValue);
        });
    }

    /**
     * Change element tag
     * @param {string} newTag
     */
    changeElementTag(newTag) {
        if (!this.selectedElement || !this.previewFrame) return;

        const oldElement = this.selectedElement;
        const oldHTML = oldElement.outerHTML;
        const iframeDoc = this.previewFrame.contentDocument;

        // Create new element
        const newElement = iframeDoc.createElement(newTag);

        // Copy attributes
        Array.from(oldElement.attributes).forEach(attr => {
            newElement.setAttribute(attr.name, attr.value);
        });

        // Move children
        while (oldElement.firstChild) {
            newElement.appendChild(oldElement.firstChild);
        }

        // Replace element
        oldElement.parentNode.replaceChild(newElement, oldElement);

        // Update selection
        this.selectedElement = newElement;

        this.emit('property:changed', {
            element: newElement,
            property: 'tag',
            oldValue: oldHTML,
            newValue: newElement.outerHTML
        });
        this.emit('element:tagChanged', { oldElement, newElement });
    }

    updateProperties() {
        if (!this.selectedElement) return;

        const tagSelect = document.getElementById('elementTag');
        const idInput = document.getElementById('elementId');
        const classInput = document.getElementById('elementClasses');
        const contentInput = document.getElementById('elementContent');

        const currentTag = this.selectedElement.tagName.toLowerCase();

        // Handle tag select - add option if not exists
        if (tagSelect) {
            if (!Array.from(tagSelect.options).some(opt => opt.value === currentTag)) {
                const option = document.createElement('option');
                option.value = currentTag;
                option.textContent = currentTag;
                tagSelect.appendChild(option);
            }
            tagSelect.value = currentTag;
        }

        if (idInput) idInput.value = this.selectedElement.id || '';
        if (classInput) {
            // Use getAttribute for SVG compatibility (className is SVGAnimatedString for SVG elements)
            const classValue = this.selectedElement.getAttribute('class') || '';
            classInput.value = classValue
                .replace('editor-highlight', '')
                .replace('editor-hover', '')
                .replace('quick-text-edit', '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Content field - handle different cases
        if (contentInput) {
            const hasOnlyText = this.selectedElement.childNodes.length === 1 &&
                this.selectedElement.childNodes[0].nodeType === 3;
            const hasNoChildren = this.selectedElement.childNodes.length === 0;
            const hasDirectTextOnly = this.hasOnlyDirectTextContent();

            if (hasOnlyText || hasNoChildren) {
                // Simple text content or empty element
                contentInput.value = this.selectedElement.textContent || '';
                contentInput.disabled = false;
                contentInput.placeholder = 'Enter text content...';
            } else if (hasDirectTextOnly) {
                // Has only direct text nodes (no child elements)
                contentInput.value = this.getDirectTextContent();
                contentInput.disabled = false;
                contentInput.placeholder = 'Text content';
            } else {
                // Has child elements - show placeholder
                contentInput.value = '';
                contentInput.disabled = true;
                contentInput.placeholder = `Contains ${this.selectedElement.children.length} child element(s)`;
            }
        }

        this.updateAttributesList();
        this.updateLinkOptions();
    }

    /**
     * Check if element has only direct text content (no child elements)
     */
    hasOnlyDirectTextContent() {
        if (!this.selectedElement) return false;
        for (const child of this.selectedElement.childNodes) {
            if (child.nodeType === 1) return false; // Element node
        }
        return true;
    }

    /**
     * Get direct text content (excluding child elements' text)
     */
    getDirectTextContent() {
        if (!this.selectedElement) return '';
        let text = '';
        for (const child of this.selectedElement.childNodes) {
            if (child.nodeType === 3) { // Text node
                text += child.textContent;
            }
        }
        return text.trim();
    }

    /**
     * Update Link Options section for <a> tags
     */
    updateLinkOptions() {
        const linkSection = document.getElementById('linkOptionsSection');
        if (!linkSection || !this.selectedElement) {
            if (linkSection) linkSection.classList.add('hidden');
            return;
        }

        const tag = this.selectedElement.tagName.toLowerCase();

        if (tag === 'a') {
            linkSection.classList.remove('hidden');

            // href value
            const hrefInput = document.getElementById('linkHref');
            if (hrefInput) {
                hrefInput.value = this.selectedElement.getAttribute('href') || '';
            }

            // new tab toggle
            const target = this.selectedElement.getAttribute('target') || '';
            const newTabToggle = document.getElementById('linkNewTabToggle');
            if (newTabToggle) {
                newTabToggle.checked = target === '_blank';
            }
        } else {
            linkSection.classList.add('hidden');
        }

        // Update image section
        const imageSection = document.getElementById('imageOptionsSection');
        if (imageSection) {
            const imgTag = this.selectedElement?.tagName.toLowerCase();
            if (imgTag === 'img') {
                imageSection.classList.remove('hidden');

                const srcInput = document.getElementById('imageSrc');
                const altInput = document.getElementById('imageAlt');
                const widthInput = document.getElementById('imageWidth');
                const heightInput = document.getElementById('imageHeight');

                if (srcInput) srcInput.value = this.selectedElement.getAttribute('src') || '';
                if (altInput) altInput.value = this.selectedElement.getAttribute('alt') || '';
                if (widthInput) widthInput.value = this.selectedElement.getAttribute('width') || '';
                if (heightInput) heightInput.value = this.selectedElement.getAttribute('height') || '';

                this._updateImagePreview();
                this._updateObjectFitButtons(this.selectedElement.style.objectFit || '');
            } else {
                imageSection.classList.add('hidden');
            }
        }
    }

    /**
     * Setup handlers for Link Options section
     */
    setupLinkOptionsHandlers() {
        // href input - 빈값 시 href 속성 제거 (href="" 방지)
        document.getElementById('linkHref')?.addEventListener('change', (e) => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'a') return;
            const oldValue = this.selectedElement.getAttribute('href') || '';
            const newValue = e.target.value.trim();

            if (newValue) {
                this.selectedElement.setAttribute('href', newValue);
            } else {
                this.selectedElement.removeAttribute('href');
            }
            this.emit('property:changed', { element: this.selectedElement, property: 'href', oldValue, newValue: newValue || null });
        });

        // ★ 링크 해제 버튼 (a 태그를 자식 내용으로 unwrap)
        document.getElementById('unlinkBtn')?.addEventListener('click', () => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'a') return;

            const aElement = this.selectedElement;
            const parent = aElement.parentElement;
            if (!parent) return;

            // Undo를 위한 이전 상태 저장
            const oldOuterHTML = aElement.outerHTML;

            // a 태그의 자식 노드들을 a 태그 위치에 삽입
            const doc = aElement.ownerDocument;
            const fragment = doc.createDocumentFragment();
            while (aElement.firstChild) {
                fragment.appendChild(aElement.firstChild);
            }

            // 첫 번째 요소를 기억 (선택 대상)
            const firstChild = fragment.firstElementChild;

            parent.replaceChild(fragment, aElement);

            // 이벤트 발생
            this.emit('link:removed', { parent, oldOuterHTML, newElement: firstChild || parent });
        });

        // new tab toggle
        document.getElementById('linkNewTabToggle')?.addEventListener('change', (e) => {
            if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'a') return;

            const oldValue = this.selectedElement.getAttribute('target') || '';
            const newValue = e.target.checked ? '_blank' : '';

            if (newValue) {
                this.selectedElement.setAttribute('target', '_blank');
                // Auto-add noopener for security
                const currentRel = this.selectedElement.getAttribute('rel') || '';
                if (!currentRel.includes('noopener')) {
                    const newRel = (currentRel + ' noopener').trim();
                    this.selectedElement.setAttribute('rel', newRel);
                    this.updateLinkOptions();
                }
            } else {
                this.selectedElement.removeAttribute('target');
            }

            this.emit('property:changed', { element: this.selectedElement, property: 'target', oldValue, newValue });
        });

    }

    updateAttributesList() {
        const list = document.getElementById('attributesList');
        if (!list || !this.selectedElement) return;

        list.innerHTML = '';

        // Skip attributes that are handled elsewhere
        const tag = this.selectedElement.tagName.toLowerCase();
        const skipAttrs = ['id', 'class', 'style'];
        if (tag === 'a') {
            skipAttrs.push('href', 'target', 'rel');
        }
        if (tag === 'img') {
            skipAttrs.push('src', 'alt', 'width', 'height');
        }

        Array.from(this.selectedElement.attributes).forEach(attr => {
            if (skipAttrs.includes(attr.name)) return;

            const isBooleanAttr = this.booleanAttrs.includes(attr.name);
            const row = this.createAttributeRow(attr.name, attr.value, isBooleanAttr, true);
            list.appendChild(row);
        });
    }

    /**
     * Create attribute row element
     * @param {string} name
     * @param {string} value
     * @param {boolean} isBoolean
     * @param {boolean} readonly - whether name is readonly
     * @returns {HTMLElement}
     */
    createAttributeRow(name = '', value = '', isBoolean = false, readonly = false) {
        const row = document.createElement('div');
        row.className = 'attribute-row' + (isBoolean ? ' boolean-attr' : '');
        row.innerHTML = `
            <input type="text" value="${this.escapeHtml(name)}" placeholder="name" class="attr-name" ${readonly ? 'readonly' : ''} />
            ${this.getAttributeValueInput(name, value, isBoolean)}
            <button class="attr-delete" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        // Delete button handler
        row.querySelector('.attr-delete').addEventListener('click', () => {
            this.removeAttributeRow(row);
        });

        // Value change handler
        const valueInput = row.querySelector('.attr-value, .attr-value-select');
        if (valueInput) {
            valueInput.addEventListener('change', () => this.applyAttributes());
        }

        // Name change handler (for custom attributes)
        if (!readonly) {
            row.querySelector('.attr-name').addEventListener('change', () => this.applyAttributes());
        }

        return row;
    }

    /**
     * Get attribute value input based on attribute type
     * @param {string} attrName
     * @param {string} attrValue
     * @param {boolean} isBoolean
     * @returns {string}
     */
    getAttributeValueInput(attrName, attrValue, isBoolean) {
        if (isBoolean) {
            return ''; // Boolean attributes have no value input
        }

        // Check if this attribute has predefined options
        if (this.selectOptions[attrName]) {
            const options = this.selectOptions[attrName].map(opt =>
                `<option value="${opt}" ${opt === attrValue ? 'selected' : ''}>${opt || '(none)'}</option>`
            ).join('');
            return `<select class="attr-value-select">${options}<option value="__custom__">Custom...</option></select>`;
        }

        return `<input type="text" value="${this.escapeHtml(attrValue)}" placeholder="value" class="attr-value" />`;
    }

    /**
     * Add attribute from preset dropdown
     * @param {string} attrName
     */
    addAttributeFromPreset(attrName) {
        if (!this.selectedElement) return;

        const isBooleanAttr = this.booleanAttrs.includes(attrName);
        const oldValue = this.selectedElement.getAttribute(attrName);

        if (isBooleanAttr) {
            this.selectedElement.setAttribute(attrName, '');
        } else {
            this.selectedElement.setAttribute(attrName, this.defaultValues[attrName] || '');
        }

        this.emit('property:changed', {
            element: this.selectedElement,
            property: 'attribute',
            action: 'add',
            name: attrName,
            oldValue: oldValue || '',
            newValue: this.selectedElement.getAttribute(attrName)
        });

        this.updateAttributesList();
        this.updateLinkOptions();
        this.emit('toast', { message: `Attribute ${attrName} added`, type: 'success' });
    }

    /**
     * Add custom attribute with optional prefix
     * @param {string} prefix
     */
    addCustomAttribute(prefix = '') {
        const list = document.getElementById('attributesList');
        if (!list) return;

        const row = this.createAttributeRow(prefix, '', false, false);
        list.appendChild(row);

        // Focus name input
        const nameInput = row.querySelector('.attr-name');
        nameInput.focus();
        if (prefix) {
            nameInput.setSelectionRange(prefix.length, prefix.length);
        }
    }

    removeAttributeRow(row) {
        const attrName = row.querySelector('.attr-name').value;
        if (this.selectedElement && attrName) {
            const oldValue = this.selectedElement.getAttribute(attrName);
            this.selectedElement.removeAttribute(attrName);
            this.emit('property:changed', { element: this.selectedElement, property: 'attribute', action: 'remove', name: attrName, oldValue, newValue: '' });
        }
        row.remove();
    }

    applyAttributes() {
        if (!this.selectedElement) return;

        const rows = document.querySelectorAll('.attribute-row');
        rows.forEach(row => {
            const nameInput = row.querySelector('.attr-name');
            const valueInput = row.querySelector('.attr-value');
            const valueSelect = row.querySelector('.attr-value-select');

            const name = nameInput ? nameInput.value.trim() : '';

            if (!name || ['id', 'class', 'style'].includes(name)) return;

            // Handle "Custom..." selection in select
            if (valueSelect && valueSelect.value === '__custom__') {
                const currentValue = this.selectedElement.getAttribute(name) || '';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'attr-value';
                input.value = currentValue;
                input.placeholder = 'value';
                valueSelect.replaceWith(input);
                input.focus();
                input.addEventListener('change', () => this.applyAttributes());
                return;
            }

            // Boolean attribute (no value)
            if (row.classList.contains('boolean-attr')) {
                this.selectedElement.setAttribute(name, '');
                return;
            }

            // Get value from input or select
            let value = '';
            if (valueInput) {
                value = valueInput.value;
            } else if (valueSelect) {
                value = valueSelect.value;
            }

            this.selectedElement.setAttribute(name, value);
        });

        this.emit('property:changed', { element: this.selectedElement, property: 'attributes', action: 'apply' });
    }

    /**
     * Escape HTML special characters
     * @param {string} str
     * @returns {string}
     */
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }

    showPanel() {
        document.querySelector('.no-selection')?.classList.add('hidden');
        document.querySelector('.element-properties')?.classList.remove('hidden');
    }

    hidePanel() {
        document.querySelector('.no-selection')?.classList.remove('hidden');
        document.querySelector('.element-properties')?.classList.add('hidden');
    }

    /**
     * Get selected element
     * @returns {HTMLElement|null}
     */
    getSelectedElement() {
        return this.selectedElement;
    }

    /**
     * Set selected element directly
     * @param {HTMLElement|null} element
     */
    setSelectedElement(element) {
        this.selectedElement = element;
        if (element) {
            this.updateProperties();
            this.showPanel();
        } else {
            this.hidePanel();
        }
    }
}

export default PropertyPanel;
