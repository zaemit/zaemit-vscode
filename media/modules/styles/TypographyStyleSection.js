import BaseStyleSection from './BaseStyleSection.js';

/**
 * TypographyStyleSection - Handles font family, size, weight, style, decoration, transform, color, line-height, letter-spacing, text-align
 */
class TypographyStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
    }

    setupHandlers() {
        // Font properties
        this.setupStyleHandler('styleFontFamily', 'fontFamily');
        this.setupStyleHandlerWithPx('styleFontSize', 'fontSize');
        this.setupButtonGroup('styleFontWeightGroup', 'fontWeight');
        this.setupButtonGroup('styleFontStyleGroup', 'fontStyle');
        this.setupButtonGroup('styleTextDecorationGroup', 'textDecoration');
        this.setupButtonGroup('styleTextTransformGroup', 'textTransform');

        // Line/Letter spacing
        this.setupStyleHandlerWithPx('styleLineHeight', 'lineHeight');
        this.setupStyleHandlerWithPx('styleLetterSpacing', 'letterSpacing');

        // Color - custom handler for picker + text input sync
        this.setupColorHandlers();

        // Text align buttons
        this.setupTextAlignButtons();
    }

    updateUI(computed, inline) {
        const state = this.currentState;

        // Font properties
        this.setValueWithCSS('styleFontFamily', 'fontFamily', inline, computed);
        this.setValueWithCSS('styleFontSize', 'fontSize', inline, computed);

        // Font weight - normalize computed value (e.g., '700' -> 'bold', '400' -> 'normal')
        const fontWeightMap = { '400': 'normal', '700': 'bold', '100': '100', '200': '200', '300': '300', '500': '500', '600': '600', '800': '800', '900': '900' };
        const computedWeight = fontWeightMap[computed.fontWeight] || computed.fontWeight;
        this.setButtonGroup('styleFontWeightGroup', inline.fontWeight, computedWeight, 'fontWeight');

        this.setButtonGroup('styleFontStyleGroup', inline.fontStyle, computed.fontStyle, 'fontStyle');

        // Text decoration - handle multiple values like "underline solid rgb(...)"
        const inlineDecoration = inline.textDecoration ? inline.textDecoration.split(' ')[0] : '';
        const computedDecoration = computed.textDecorationLine || computed.textDecoration?.split(' ')[0] || '';
        this.setButtonGroup('styleTextDecorationGroup', inlineDecoration, computedDecoration, 'textDecorationLine');

        this.setButtonGroup('styleTextTransformGroup', inline.textTransform, computed.textTransform, 'textTransform');

        // Line/Letter spacing
        this.setValueWithCSS('styleLineHeight', 'lineHeight', inline, computed, v => v === 'normal');
        this.setValueWithCSS('styleLetterSpacing', 'letterSpacing', inline, computed, v => v === 'normal');

        // Color - skip update if user is interacting with picker
        const colorPicker = this.$('styleColorPicker');
        const colorInput = this.$('styleColor');
        if (!colorPicker?._userInteracting) {
            let effectiveColor;

            if (state) {
                // Pseudo-class 상태: CSS 규칙에서 해당 상태의 값 조회
                // fallback은 clean computed (hover 오염 방지)
                const stateColor = this.getCSSRuleValueWithState('color', state);
                effectiveColor = stateColor || this.getCleanComputedValue('color');
            } else {
                const cssRuleColor = this.getCSSRuleValue('color');
                effectiveColor = inline.color || cssRuleColor || this.getCleanComputedValue('color');
            }

            // CSS 변수(var(--name))인 경우 실제 값으로 해석
            if (effectiveColor && effectiveColor.includes('var(')) {
                if (state) {
                    // pseudo-class 상태: _resolveCSSVariable로 변수 해석 (hover 오염 무관)
                    effectiveColor = this._resolveCSSVariable(effectiveColor, 'color');
                } else {
                    // 기본 상태: getCleanComputedValue로 hover 오염 방지
                    effectiveColor = this.getCleanComputedValue('color');
                }
            }

            if (effectiveColor) {
                const hex = this.rgbToHex(effectiveColor);
                const colorValue = hex || effectiveColor;
                if (colorInput) {
                    colorInput._isUpdatingUI = true;
                    colorInput.value = colorValue;
                    colorInput._valueBeforeFocus = colorValue;  // ★ Undo용 초기값 동기화
                    colorInput._isUpdatingUI = false;
                }
                if (colorPicker) {
                    colorPicker._isUpdatingUI = true;
                    this.setColorPickerValue('styleColorPicker', hex);
                    colorPicker._valueBeforeFocus = colorValue;  // ★ Undo용 초기값 동기화
                    colorPicker._isUpdatingUI = false;
                }
            }
        }

        // Text align
        let textAlign;
        if (state) {
            const stateAlign = this.getCSSRuleValueWithState('textAlign', state);
            textAlign = stateAlign || this.getCleanComputedValue('textAlign') || '';
        } else {
            textAlign = inline.textAlign || this.getCSSRuleValue('textAlign') || this.getCleanComputedValue('textAlign') || '';
        }
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.align === textAlign);
        });
    }

    /**
     * Setup text color handlers for color picker and text input
     * Similar to BackgroundStyleSection.setupBgColorHandlers()
     */
    setupColorHandlers() {
        const picker = this.$('styleColorPicker');
        const input = this.$('styleColor');

        if (!picker || !input) return;

        // Color picker handlers
        picker._isUpdatingUI = false;
        picker._userInteracting = false;

        picker.addEventListener('mousedown', () => {
            picker._userInteracting = true;
            picker._valueBeforeFocus = input.value;
            picker._elementAtFocus = this.selectedElement;

            // ★ 실시간 미리보기(input 이벤트)가 CSS를 먼저 변경하므로,
            //    변경 전에 oldRules를 미리 수집해야 undo가 정확한 원래 값을 복원할 수 있음
            const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
            const mainDoc = mainFrame?.contentDocument;
            const undoRedo = this.editor.modules?.undoRedo;
            if (mainDoc && undoRedo && this.selectedElement) {
                // ★ 1차: getCSSRuleInfo에서 현재 적용 중인 CSS 규칙의 셀렉터 확보
                //    (getBestSelector는 클래스/ID 없는 요소에서 null 반환 → .hero h1 같은 규칙을 놓침)
                const ruleInfo = this.getCSSRuleInfo('color');
                const bestSelector = this.getBestSelector();
                let collectSelector = ruleInfo?.selector || bestSelector;

                // ★ 셀렉터가 없으면 미리 생성 (applyStyleChangeNoUndo가 어차피 필요로 할 것이므로)
                // 미리 생성해야 oldRules를 정확한 셀렉터로 수집 가능
                if (!collectSelector) {
                    collectSelector = this.getOrCreateUniqueSelector(null);
                    if (collectSelector && this.editor?.modules?.multiCanvas?._isInitialized) {
                        this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
                    }
                }

                if (collectSelector) {
                    picker._oldRulesBeforeFocus = undoRedo.collectAllRulesForSelector(collectSelector, 'color', mainDoc);
                    picker._oldRulesTextFill = undoRedo.collectAllRulesForSelector(collectSelector, 'webkitTextFillColor', mainDoc);
                    console.log('[TypographyStyleSection] Collected oldRules on mousedown:', picker._oldRulesBeforeFocus, 'selector:', collectSelector);
                } else {
                    // ★ 극한 fallback: 셀렉터 생성도 실패 (selectedElement가 null 등)
                    picker._oldRulesBeforeFocus = {};
                    picker._oldRulesTextFill = {};
                }
            }
        });

        // ★ 실시간 미리보기 (Undo 기록 안함)
        picker.addEventListener('input', async (e) => {
            if (picker._isUpdatingUI) return;
            if (!picker._userInteracting) return;

            const newValue = e.target.value;
            input.value = newValue;

            if (this.selectedElement) {
                // 실시간 미리보기만 (Undo는 change에서 기록)
                await this.applyStyleChangeNoUndo('color', newValue);
                // ★ gradient text: -webkit-text-fill-color도 함께 변경
                await this._handleTextFillColorOverride(newValue, false);
            }
        });

        // ★ 정렬 버튼과 동일한 패턴: applyStyleChange로 CSS rule 수정 + Undo 기록 + 동기화
        picker.addEventListener('change', async () => {
            if (!picker._userInteracting) return;

            const newValue = picker.value;
            const oldValue = picker._valueBeforeFocus || '';

            // Use element from mousedown time, not current selection
            const targetElement = picker._elementAtFocus || this.selectedElement;
            if (targetElement && oldValue !== newValue) {
                const originalSelected = this.editor.selectedElement;
                this.editor.selectedElement = targetElement;
                // ★ 트랜잭션: color + webkitTextFillColor를 1개 undo 항목으로 묶음
                const undoRedo = this.editor?.modules?.undoRedo;
                undoRedo?.beginTransaction();
                try {
                    // ★ mousedown에서 미리 수집한 oldRules를 전달 (실시간 미리보기로 이미 CSS가 변경된 상태이므로)
                    const preCollectedOldRules = picker._oldRulesBeforeFocus || null;
                    await this.applyStyleChange('color', newValue, oldValue, preCollectedOldRules);
                    // ★ gradient text: -webkit-text-fill-color도 함께 변경 (미리 수집한 oldRules 전달)
                    const preCollectedTextFill = picker._oldRulesTextFill || null;
                    await this._handleTextFillColorOverride(newValue, true, preCollectedTextFill);
                } finally {
                    undoRedo?.endTransaction();
                }
                this.editor.selectedElement = originalSelected;
            }

            picker._userInteracting = false;
            picker._valueBeforeFocus = newValue;
            picker._elementAtFocus = null;
            picker._oldRulesBeforeFocus = null;
            picker._oldRulesTextFill = null;
        });

        // Text input handler
        input._isUpdatingUI = false;
        input._valueBeforeFocus = input.value;

        input.addEventListener('focus', () => {
            input._valueBeforeFocus = input.value;
        });

        // ★ 정렬 버튼(setupTextAlignButtons)과 동일한 패턴 적용
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            if (!this.selectedElement) return;

            e.preventDefault();
            input.blur();

            const oldValue = this.getEffectiveCSSValue('color').value;
            const newValue = input.value.trim();

            if (oldValue !== newValue) {
                // Update color picker if valid hex color
                if (newValue && newValue.startsWith('#') && (newValue.length === 4 || newValue.length === 7)) {
                    picker.value = newValue.length === 4
                        ? '#' + newValue[1] + newValue[1] + newValue[2] + newValue[2] + newValue[3] + newValue[3]
                        : newValue;
                }
                // ★ 트랜잭션: color + webkitTextFillColor를 1개 undo 항목으로 묶음
                const undoRedo = this.editor?.modules?.undoRedo;
                undoRedo?.beginTransaction();
                try {
                    await this.applyStyleChange('color', newValue, oldValue);
                    // ★ gradient text: -webkit-text-fill-color도 함께 변경
                    await this._handleTextFillColorOverride(newValue);
                } finally {
                    undoRedo?.endTransaction();
                }
            }
        });

        // ★ 정렬 버튼과 동일한 패턴 적용
        input.addEventListener('change', async () => {
            if (!this.selectedElement) return;

            const oldValue = this.getEffectiveCSSValue('color').value;
            const newValue = input.value.trim();

            if (oldValue !== newValue) {
                // Update color picker
                const hex = this.rgbToHex(newValue) || newValue;
                if (hex && hex.startsWith('#')) {
                    picker.value = hex;
                }
                // ★ 트랜잭션: color + webkitTextFillColor를 1개 undo 항목으로 묶음
                const undoRedo = this.editor?.modules?.undoRedo;
                undoRedo?.beginTransaction();
                try {
                    await this.applyStyleChange('color', newValue, oldValue);
                    // ★ gradient text: -webkit-text-fill-color도 함께 변경
                    await this._handleTextFillColorOverride(newValue);
                } finally {
                    undoRedo?.endTransaction();
                }
            }
        });
    }

    /**
     * Handle -webkit-text-fill-color override when changing color.
     * If -webkit-text-fill-color is explicitly set (e.g., 'transparent' for gradient text),
     * also update it to the new color so the color change is visible.
     * @param {string} newColorValue - New color value
     * @param {boolean} useUndo - Whether to record undo (false for live preview)
     * @param {Object} preCollectedOldRules - Pre-collected oldRules for undo (optional)
     */
    async _handleTextFillColorOverride(newColorValue, useUndo = true, preCollectedOldRules = null) {
        if (!this.selectedElement) return;

        // Check if -webkit-text-fill-color is explicitly set in CSS rule or inline
        const ruleInfo = this.getCSSRuleInfo('webkitTextFillColor');
        const inlineValue = this.selectedElement.style.getPropertyValue('-webkit-text-fill-color');

        if (!ruleInfo && !inlineValue) return; // Not explicitly set, no override needed

        if (useUndo) {
            const oldValue = ruleInfo?.value || inlineValue || '';
            await this.applyStyleChange('webkitTextFillColor', newColorValue, oldValue, preCollectedOldRules);
        } else {
            await this.applyStyleChangeNoUndo('webkitTextFillColor', newColorValue);
        }
    }

    /**
     * Setup text align button handlers
     */
    setupTextAlignButtons() {
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!this.selectedElement) return;

                const oldValue = this.getEffectiveCSSValue('textAlign').value;
                const newValue = btn.dataset.align;

                document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Use applyStyleChange to respect state (hover, focus, etc.)
                await this.applyStyleChange('textAlign', newValue, oldValue);
            });
        });
    }
}

export default TypographyStyleSection;
