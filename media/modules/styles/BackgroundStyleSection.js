import BaseStyleSection from './BaseStyleSection.js';

/**
 * BackgroundStyleSection - Handles background color, image, size, position, repeat
 */
class BackgroundStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
    }

    setupHandlers() {
        // Background color - 컬러피커 + 셀렉트 박스
        this.setupBgColorHandlers();

        // Background image
        this.setupStyleHandler('styleBgImage', 'backgroundImage');

        // Background size
        this.setupButtonGroup('styleBgSizeGroup', 'backgroundSize');

        // Background position
        this.setupStyleHandler('styleBgPosition', 'backgroundPosition');

        // Background repeat
        this.setupButtonGroup('styleBgRepeatGroup', 'backgroundRepeat');
    }

    updateUI(computed, inline) {
        const bgColorInput = this.$('styleBgColor');
        const bgColorPicker = this.$('styleBgColorPicker');
        if (!bgColorInput || !bgColorPicker) return;

        const state = this.currentState;
        let effectiveBgColor;

        if (state) {
            // Pseudo-class 상태: CSS 규칙에서 해당 상태의 값 조회
            const stateBgColor = this.getCSSRuleValueWithState('backgroundColor', state);
            effectiveBgColor = stateBgColor || '';
        } else {
            // 엘리먼트에 직접 설정된 배경색만 가져오기 (inline 또는 CSS rule)
            effectiveBgColor = inline.backgroundColor;

            if (!effectiveBgColor) {
                const ruleInfo = this.getCSSRuleInfo('backgroundColor');
                if (ruleInfo && ruleInfo.value &&
                    !this.isGenericSelector(ruleInfo.selector) &&
                    !this.isEditorInternalSelector(ruleInfo.selector)) {
                    effectiveBgColor = ruleInfo.value;
                }
            }
        }

        // CSS 변수(var(--name))인 경우 실제 값으로 해석
        if (effectiveBgColor && effectiveBgColor.includes('var(')) {
            if (state) {
                // pseudo-class 상태: _resolveCSSVariable로 변수 해석 (hover 오염 무관)
                effectiveBgColor = this._resolveCSSVariable(effectiveBgColor, 'backgroundColor');
            } else {
                // 기본 상태: getCleanComputedValue로 hover 오염 방지
                effectiveBgColor = this.getCleanComputedValue('backgroundColor');
            }
        }

        const hasDirectBgColor = effectiveBgColor &&
            effectiveBgColor !== 'rgba(0, 0, 0, 0)' &&
            effectiveBgColor !== 'transparent';

        if (hasDirectBgColor) {
            const hexColor = this.rgbToHex(effectiveBgColor);
            bgColorPicker.value = hexColor;
            bgColorInput.value = hexColor;
            // ★ Undo용 초기값 동기화
            bgColorPicker._valueBeforeFocus = hexColor;
            bgColorInput._valueBeforeFocus = hexColor;
        } else {
            bgColorPicker.value = '#ffffff';
            bgColorInput.value = '';
            // ★ Undo용 초기값 동기화
            bgColorPicker._valueBeforeFocus = '';
            bgColorInput._valueBeforeFocus = '';
        }

        // Background image
        this.setValueWithCSS('styleBgImage', 'backgroundImage', inline, computed, v => v === 'none');

        // Enable/disable background image edit button
        const bgEditBtn = document.getElementById('bgImageEditBtn');
        if (bgEditBtn) {
            const bgVal = inline.backgroundImage || this.getCSSRuleValue('backgroundImage') || this.getCleanComputedValue('backgroundImage');
            const hasUrl = bgVal && bgVal !== 'none' && bgVal.includes('url(');
            bgEditBtn.disabled = !hasUrl;
        }

        // Background size
        this.setButtonGroup('styleBgSizeGroup', inline.backgroundSize, computed.backgroundSize, 'backgroundSize');

        // Background position
        this.setValueWithCSS('styleBgPosition', 'backgroundPosition', inline, computed, v => v === '0% 0%');

        // Background repeat
        this.setButtonGroup('styleBgRepeatGroup', inline.backgroundRepeat, computed.backgroundRepeat, 'backgroundRepeat');
    }

    /**
     * Setup background color handlers for color picker and text input
     */
    setupBgColorHandlers() {
        const picker = this.$('styleBgColorPicker');
        const input = this.$('styleBgColor');

        if (!picker || !input) return;

        // Color picker handlers
        picker._isUpdatingUI = false;
        picker._userInteracting = false;

        picker.addEventListener('mousedown', () => {
            picker._userInteracting = true;
            // Use input.value (actual CSS value) not picker.value (display placeholder)
            // input.value is '' when no background, picker.value is '#ffffff' as placeholder
            picker._valueBeforeFocus = input.value;
            picker._elementAtFocus = this.selectedElement;

            // ★ 실시간 미리보기 전에 oldRules 미리 수집 (applyStyleChangeNoUndo가 CSS를 먼저 변경하므로)
            const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
            const mainDoc = mainFrame?.contentDocument;
            const undoRedo = this.editor.modules?.undoRedo;
            if (mainDoc && undoRedo && this.selectedElement) {
                const targetSelector = this.getBestSelector();
                if (targetSelector) {
                    picker._oldRulesBeforeFocus = undoRedo.collectAllRulesForSelector(targetSelector, 'backgroundColor', mainDoc);
                    console.log('[BackgroundStyleSection] Collected oldRules on mousedown:', picker._oldRulesBeforeFocus);
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
                await this.applyStyleChangeNoUndo('backgroundColor', newValue);
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
                // ★ mousedown에서 미리 수집한 oldRules를 전달 (실시간 미리보기로 이미 CSS가 변경된 상태이므로)
                const preCollectedOldRules = picker._oldRulesBeforeFocus || null;
                await this.applyStyleChange('backgroundColor', newValue, oldValue, preCollectedOldRules);
                this.editor.selectedElement = originalSelected;
            }

            picker._userInteracting = false;
            picker._valueBeforeFocus = newValue;
            picker._elementAtFocus = null;
            picker._oldRulesBeforeFocus = null;
        });

        // Text input handler - handles color values and clearing
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

            const oldValue = this.getEffectiveCSSValue('backgroundColor').value;
            const newValue = input.value.trim();

            if (oldValue !== newValue) {
                // Update color picker if valid hex color
                if (newValue && newValue.startsWith('#') && (newValue.length === 4 || newValue.length === 7)) {
                    picker.value = newValue.length === 4
                        ? '#' + newValue[1] + newValue[1] + newValue[2] + newValue[2] + newValue[3] + newValue[3]
                        : newValue;
                }
                await this.applyStyleChange('backgroundColor', newValue, oldValue);
            }
        });

        // ★ 정렬 버튼과 동일한 패턴 적용
        input.addEventListener('blur', async () => {
            if (!this.selectedElement) return;

            const oldValue = this.getEffectiveCSSValue('backgroundColor').value;
            const newValue = input.value.trim();

            if (oldValue !== newValue) {
                // Update color picker if valid hex color
                if (newValue && newValue.startsWith('#') && (newValue.length === 4 || newValue.length === 7)) {
                    picker.value = newValue.length === 4
                        ? '#' + newValue[1] + newValue[1] + newValue[2] + newValue[2] + newValue[3] + newValue[3]
                        : newValue;
                }
                await this.applyStyleChange('backgroundColor', newValue, oldValue);
            }
        });
    }
}

export default BackgroundStyleSection;
