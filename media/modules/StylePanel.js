import EventEmitter from './EventEmitter.js';
import StyleManager from './styles/StyleManager.js';

class StylePanel extends EventEmitter {
    constructor(elementSelector, previewManager) {
        super();
        this.elementSelector = elementSelector;
        this.previewManager = previewManager;
        this.selectedElement = null;
        this.previewFrame = null;
        this.borderSideMode = 'all'; // 'all' or 'individual'
        this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
        this.styleManager = null;

        this.init();
    }

    setPreviewFrame(previewFrame, modules = null) {
        this.previewFrame = previewFrame;

        // Create editor facade for StyleManager
        const eventListeners = {};
        const editorFacade = {
            selectedElement: null,
            previewFrame: previewFrame,
            // ★ mainIframe: 항상 MultiCanvasManager의 mainIframe 사용 (싱글뷰/멀티뷰 모두)
            get mainIframe() {
                return modules?.multiCanvas?.mainIframe;
            },
            styleManager: null,
            modules: modules, // EditorApp의 modules 참조 (멀티뷰 동기화용)
            recordStyleChange: (element, property, oldValue, newValue) => {
                // CSS 기반 스타일 변경임을 표시 (cssMode: true)
                this.emit('style:changed', { element, property, oldValue, newValue, cssMode: true });
            },
            saveCurrentHTML: () => {
                this.emit('style:changed', {});
            },
            saveCurrentCSS: async () => {
                this.emit('css:changed', {});
            },
            showToast: () => {},
            updateOverlay: () => {
                modules?.overlay?.updateOverlay();
                modules?.gapOverlay?.updateGapOverlay();
            },
            // Event emitter methods for compatibility with BaseStyleSection
            on: (event, callback) => {
                if (!eventListeners[event]) {
                    eventListeners[event] = [];
                }
                eventListeners[event].push(callback);
            },
            emit: (event, data) => {
                if (eventListeners[event]) {
                    eventListeners[event].forEach(cb => cb(data));
                }
            }
        };

        this.styleManager = new StyleManager(editorFacade);
        editorFacade.styleManager = this.styleManager;
        this.styleManager.init();
        this._editorFacade = editorFacade;
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        if (!iframe) return;
        this.previewFrame = iframe;
        if (this._editorFacade) {
            this._editorFacade.previewFrame = iframe;
        }
    }

    init() {
        this.elementSelector.on('element:selected', (element) => {
            this.selectedElement = element;
            if (this._editorFacade) {
                this._editorFacade.selectedElement = element;
                // Emit to editorFacade so BaseStyleSection listeners are notified
                this._editorFacade.emit('element:selected', element);
            }
            this.updateStyles();
            this.showPanel();
        });

        this.elementSelector.on('element:deselected', () => {
            this.selectedElement = null;
            if (this._editorFacade) {
                this._editorFacade.selectedElement = null;
            }
            this.hidePanel();
        });

        this.setupStyleHandlers();
        // this.setupColorPickers(); // DISABLED - handled by TypographyStyleSection
        // this.setupAlignButtons(); // DISABLED - handled by TypographyStyleSection
        // this.setupBorderSideSelector(); // DISABLED - handled by BorderStyleSection
    }

    setupStyleHandlers() {
        const styleMap = {
            styleDisplay: 'display',
            stylePosition: 'position',
            styleWidth: 'width',
            styleHeight: 'height',
            // styleFontSize: 'fontSize',        // DISABLED - handled by TypographyStyleSection
            styleFontWeight: 'fontWeight',
            // styleColor: 'color',              // DISABLED - handled by TypographyStyleSection
            // styleBgColor: 'backgroundColor',  // DISABLED - handled by BackgroundStyleSection
            // styleBorderRadius: 'borderRadius' // DISABLED - handled by BorderStyleSection
        };

        Object.entries(styleMap).forEach(([inputId, styleProp]) => {
            this.bindStyleInput(inputId, styleProp);
        });

        // margin/padding은 SizeStyleSection에서 처리하므로 여기서 바인딩하지 않음
        // (중복 이벤트 핸들러 방지)

        // this.setupBorderInputs(); // DISABLED - handled by BorderStyleSection
    }

    setupBorderInputs() {
        const widthInput = document.getElementById('styleBorderWidth');
        const colorInput = document.getElementById('styleBorderColor');
        const colorPicker = document.getElementById('styleBorderColorPicker');

        if (widthInput) {
            widthInput.addEventListener('change', (e) => {
                this.applyBorderStyle('Width', e.target.value);
            });
        }

        if (colorInput) {
            colorInput.addEventListener('change', (e) => {
                this.applyBorderStyle('Color', e.target.value);
            });
        }

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                if (colorInput) colorInput.value = e.target.value;
                this.applyBorderStyle('Color', e.target.value);
            });
        }

        const styleGroup = document.getElementById('styleBorderStyleGroup');
        if (styleGroup) {
            styleGroup.querySelectorAll('.style-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    styleGroup.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.applyBorderStyle('Style', btn.dataset.value);
                });
            });
        }
    }

    applyBorderStyle(property, value) {
        if (!this.selectedElement) return;

        const sides = this.borderSideMode === 'all'
            ? ['Top', 'Right', 'Bottom', 'Left']
            : this.selectedBorderSides.map(s => s.charAt(0).toUpperCase() + s.slice(1));

        // Collect old values before applying
        const oldValues = {};
        sides.forEach(side => {
            const styleProp = `border${side}${property}`;
            oldValues[styleProp] = this.selectedElement.style[styleProp] || '';
        });

        sides.forEach(side => {
            const styleProp = `border${side}${property}`;
            this.selectedElement.style[styleProp] = value;
            // Emit individual change for each side
            this.emit('style:changed', {
                element: this.selectedElement,
                property: styleProp,
                oldValue: oldValues[styleProp],
                newValue: value
            });
        });
    }

    setupBorderSideSelector() {
        const sideGroup = document.getElementById('borderSideGroup');
        if (!sideGroup) return;

        const allBtn = sideGroup.querySelector('.all-btn');
        const sideBtns = sideGroup.querySelectorAll('.side-btn');

        // All button click - apply current values to all sides
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                if (this.selectedElement) {
                    // Apply current input values to all sides
                    ['top', 'right', 'bottom', 'left'].forEach(side => {
                        this.applyCurrentBorderValuesToSide(side);
                    });
                }
                this.borderSideMode = 'all';
                this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
                this.updateBorderSideButtons();
                this.updateBorderInputsForSide();
            });
        }

        // Individual side buttons (toggle)
        sideBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const side = btn.dataset.value;

                if (this.borderSideMode === 'all') {
                    this.borderSideMode = 'individual';
                    this.selectedBorderSides = [side];
                    // Remove border from other sides
                    if (this.selectedElement) {
                        this.removeBorderFromOtherSides(side);
                    }
                } else {
                    const idx = this.selectedBorderSides.indexOf(side);
                    if (idx > -1) {
                        // Deselecting - remove border from this side
                        this.selectedBorderSides.splice(idx, 1);
                        if (this.selectedElement) {
                            this.removeBorderFromSide(side);
                        }
                        // If no sides left, switch back to 'all' mode (no border state)
                        if (this.selectedBorderSides.length === 0) {
                            this.borderSideMode = 'all';
                            this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
                            // Clear border input values since no border exists
                            this.clearBorderInputs();
                            this.updateBorderSideButtons();
                            return;
                        }
                    } else {
                        this.selectedBorderSides.push(side);
                        // Apply current values to newly selected side
                        if (this.selectedElement) {
                            this.applyCurrentBorderValuesToSide(side);
                        }
                    }

                    if (this.selectedBorderSides.length === 4) {
                        this.borderSideMode = 'all';
                    }
                }

                this.updateBorderSideButtons();
                this.updateBorderInputsForSide();
            });
        });
    }

    // Remove border from sides other than the specified one
    removeBorderFromOtherSides(keepSide) {
        const allSides = ['top', 'right', 'bottom', 'left'];
        allSides.forEach(side => {
            if (side !== keepSide) {
                this.removeBorderFromSide(side);
            }
        });
    }

    // Remove border from a specific side
    removeBorderFromSide(side) {
        if (!this.selectedElement) return;
        const Side = side.charAt(0).toUpperCase() + side.slice(1);
        const props = ['Width', 'Style', 'Color'];

        props.forEach(prop => {
            const styleProp = `border${Side}${prop}`;
            const oldValue = this.selectedElement.style[styleProp] || '';
            this.selectedElement.style[styleProp] = '';
            if (oldValue) {
                this.emit('style:changed', {
                    element: this.selectedElement,
                    property: styleProp,
                    oldValue,
                    newValue: ''
                });
            }
        });
    }

    // Clear border input fields
    clearBorderInputs() {
        this.setInputValue('styleBorderWidth', '');
        this.setInputValue('styleBorderColor', '');
        this.setButtonGroupValue('styleBorderStyleGroup', '');
        const colorPicker = document.getElementById('styleBorderColorPicker');
        if (colorPicker) colorPicker.value = '#000000';
    }

    // Apply current border input values to a specific side
    applyCurrentBorderValuesToSide(side) {
        if (!this.selectedElement) return;

        const widthInput = document.getElementById('styleBorderWidth');
        const colorInput = document.getElementById('styleBorderColor');
        const styleGroup = document.getElementById('styleBorderStyleGroup');

        const Side = side.charAt(0).toUpperCase() + side.slice(1);

        let width = widthInput?.value || '';
        const color = colorInput?.value || '';
        const activeStyleBtn = styleGroup?.querySelector('.style-btn.active');
        const borderStyle = activeStyleBtn?.dataset.value || '';

        if (width && !isNaN(width) && !width.includes('px')) {
            width = width + 'px';
        }

        // Apply with undo tracking
        if (width) {
            const oldWidth = this.selectedElement.style[`border${Side}Width`] || '';
            this.selectedElement.style[`border${Side}Width`] = width;
            this.emit('style:changed', {
                element: this.selectedElement,
                property: `border${Side}Width`,
                oldValue: oldWidth,
                newValue: width
            });
        }
        if (borderStyle) {
            const oldStyle = this.selectedElement.style[`border${Side}Style`] || '';
            this.selectedElement.style[`border${Side}Style`] = borderStyle;
            this.emit('style:changed', {
                element: this.selectedElement,
                property: `border${Side}Style`,
                oldValue: oldStyle,
                newValue: borderStyle
            });
        }
        if (color) {
            const oldColor = this.selectedElement.style[`border${Side}Color`] || '';
            this.selectedElement.style[`border${Side}Color`] = color;
            this.emit('style:changed', {
                element: this.selectedElement,
                property: `border${Side}Color`,
                oldValue: oldColor,
                newValue: color
            });
        }
    }

    updateBorderSideButtons() {
        const sideGroup = document.getElementById('borderSideGroup');
        if (!sideGroup) return;

        const allBtn = sideGroup.querySelector('.all-btn');
        const sideBtns = sideGroup.querySelectorAll('.side-btn');

        if (allBtn) {
            allBtn.classList.toggle('active', this.borderSideMode === 'all');
        }

        sideBtns.forEach(btn => {
            const side = btn.dataset.value;
            if (this.borderSideMode === 'all') {
                btn.classList.remove('active');
            } else {
                btn.classList.toggle('active', this.selectedBorderSides.includes(side));
            }
        });
    }

    updateBorderInputsForSide() {
        if (!this.selectedElement) return;

        const inline = this.selectedElement.style;
        const win = this.previewManager.getWindow();
        const computed = win.getComputedStyle(this.selectedElement);
        let width, style, color;

        const getValue = (inlineVal, computedVal, defaultVal = '') => {
            if (inlineVal) return inlineVal;
            if (computedVal && computedVal !== defaultVal && computedVal !== '0px' && computedVal !== 'none') {
                return computedVal;
            }
            return '';
        };

        if (this.borderSideMode === 'all') {
            width = getValue(inline.borderWidth || inline.borderTopWidth, computed.borderTopWidth);
            style = getValue(inline.borderStyle || inline.borderTopStyle, computed.borderTopStyle, 'none');
            color = getValue(inline.borderColor || inline.borderTopColor, computed.borderTopColor);
        } else {
            const firstSide = this.selectedBorderSides[0];
            const side = firstSide.charAt(0).toUpperCase() + firstSide.slice(1);
            width = getValue(inline[`border${side}Width`], computed[`border${side}Width`]);
            style = getValue(inline[`border${side}Style`], computed[`border${side}Style`], 'none');
            color = getValue(inline[`border${side}Color`], computed[`border${side}Color`]);
        }

        this.setInputValue('styleBorderWidth', width);
        this.setInputValue('styleBorderColor', color);
        this.setButtonGroupValue('styleBorderStyleGroup', style);

        // Sync color picker
        const colorPicker = document.getElementById('styleBorderColorPicker');
        if (colorPicker && color) {
            try {
                if (color.startsWith('rgb')) {
                    const rgb = color.match(/\d+/g);
                    if (rgb && rgb.length >= 3) {
                        colorPicker.value = '#' + rgb.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
                    }
                } else if (color.startsWith('#')) {
                    colorPicker.value = color;
                }
            } catch (e) { }
        }
    }

    setButtonGroupValue(groupId, value) {
        const group = document.getElementById(groupId);
        if (!group) return;

        group.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    }

    bindStyleInput(inputId, styleProp) {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('change', (e) => {
                if (this.selectedElement) {
                    const oldValue = this.selectedElement.style[styleProp] || '';
                    this.selectedElement.style[styleProp] = e.target.value;
                    this.emit('style:changed', {
                        element: this.selectedElement,
                        property: styleProp,
                        oldValue,
                        newValue: e.target.value
                    });
                }
            });
        }
    }

    setupColorPickers() {
        this.bindColorPicker('styleColorPicker', 'styleColor', 'color');
        // DISABLED - background color handled by BackgroundStyleSection
        // this.bindColorPicker('styleBgColorPicker', 'styleBgColor', 'backgroundColor');
    }

    bindColorPicker(pickerId, textId, styleProp) {
        const picker = document.getElementById(pickerId);
        const textInput = document.getElementById(textId);

        if (picker && textInput) {
            // Track old value before change
            let oldValue = '';
            picker.addEventListener('focus', () => {
                if (this.selectedElement) {
                    oldValue = this.selectedElement.style[styleProp] || '';
                }
            });

            picker.addEventListener('input', (e) => {
                textInput.value = e.target.value;
                if (this.selectedElement) {
                    this.selectedElement.style[styleProp] = e.target.value;
                }
            });

            picker.addEventListener('change', (e) => {
                if (this.selectedElement) {
                    this.emit('style:changed', {
                        element: this.selectedElement,
                        property: styleProp,
                        oldValue,
                        newValue: e.target.value
                    });
                }
            });
        }
    }

    setupAlignButtons() {
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.selectedElement) {
                    const oldValue = this.selectedElement.style.textAlign || '';
                    document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.selectedElement.style.textAlign = btn.dataset.align;
                    this.emit('style:changed', {
                        element: this.selectedElement,
                        property: 'textAlign',
                        oldValue,
                        newValue: btn.dataset.align
                    });
                }
            });
        });
    }

    updateStyles() {
        if (!this.selectedElement) return;

        // StyleManager handles all style section updates (Layout, Size, Typography, etc.)
        // 색상 피커, 보더, 정렬 버튼 모두 StyleManager 내 각 섹션에서 state-aware 로직으로 처리
        if (this.styleManager) {
            this.styleManager.updateUI();
        }
    }

    /**
     * Sync color pickers with current color values
     * NOTE: Background color sync disabled - now handled by BackgroundStyleSection
     */
    syncColorPickers() {
        if (!this.selectedElement) return;

        const win = this.previewManager.getWindow();
        const computed = win.getComputedStyle(this.selectedElement);
        const inline = this.selectedElement.style;

        // Text color
        const textColor = inline.color || computed.color;
        this.syncColorPickerValue('styleColorPicker', 'styleColor', textColor);

        // Background color - DISABLED (handled by BackgroundStyleSection in StyleManager)
        // const bgColor = inline.backgroundColor || computed.backgroundColor;
        // this.syncColorPickerValue('styleBgColorPicker', 'styleBgColor', bgColor);
    }

    /**
     * Sync a color picker with its text input
     */
    syncColorPickerValue(pickerId, textId, colorValue) {
        const picker = document.getElementById(pickerId);
        const textInput = document.getElementById(textId);

        if (!colorValue || colorValue === 'transparent' || colorValue === 'rgba(0, 0, 0, 0)') {
            if (picker) picker.value = '#000000';
            return;
        }

        try {
            let hexColor = colorValue;

            // Convert rgb/rgba to hex
            if (colorValue.startsWith('rgb')) {
                const rgb = colorValue.match(/\d+/g);
                if (rgb && rgb.length >= 3) {
                    hexColor = '#' + rgb.slice(0, 3).map(x =>
                        parseInt(x).toString(16).padStart(2, '0')
                    ).join('');
                }
            }

            if (picker && hexColor.startsWith('#')) {
                picker.value = hexColor.length === 4 ?
                    '#' + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2] + hexColor[3] + hexColor[3] :
                    hexColor;
            }
        } catch (e) {
            // Ignore color parsing errors
        }
    }

    /**
     * Update text-align button states
     */
    updateAlignButtons(computed) {
        const textAlign = this.selectedElement?.style.textAlign || computed?.textAlign || 'left';
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.align === textAlign);
        });
    }

    detectBorderSides(computed) {
        const hasBorder = (side) => {
            const width = computed[`border${side}Width`];
            const style = computed[`border${side}Style`];
            return width && width !== '0px' && style && style !== 'none';
        };

        const sides = ['top', 'right', 'bottom', 'left'];
        const activeSides = sides.filter(s => hasBorder(s.charAt(0).toUpperCase() + s.slice(1)));

        if (activeSides.length === 0 || activeSides.length === 4) {
            this.borderSideMode = 'all';
            this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
        } else {
            this.borderSideMode = 'individual';
            this.selectedBorderSides = activeSides;
        }
    }

    setInputValue(inputId, value) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = value || '';
        }
    }

    showPanel() {
        document.querySelector('#tab-styles .no-selection')?.classList.add('hidden');
        document.querySelector('.style-properties')?.classList.remove('hidden');
        // Show state selector
        document.getElementById('stateSelectorContainer')?.classList.remove('hidden');
    }

    hidePanel() {
        document.querySelector('#tab-styles .no-selection')?.classList.remove('hidden');
        document.querySelector('.style-properties')?.classList.add('hidden');
        // Hide state selector
        document.getElementById('stateSelectorContainer')?.classList.add('hidden');
    }
}

export default StylePanel;
