import BaseStyleSection from './BaseStyleSection.js';

/**
 * EffectsStyleSection - Handles opacity, box-shadow, text-shadow, transform, transition, cursor
 */
class EffectsStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
    }

    setupHandlers() {
        // Opacity (range + text input)
        this.setupOpacityRange();
        this.setupStyleHandler('styleOpacity', 'opacity');

        // Box shadow (range + color + text input)
        this.setupBoxShadowRange();
        this.setupBoxShadowColor();
        this.setupStyleHandler('styleBoxShadow', 'boxShadow');

        // Text shadow (range + color + text input)
        this.setupTextShadowRange();
        this.setupTextShadowColor();
        this.setupStyleHandler('styleTextShadow', 'textShadow');

        // Transform
        this.setupStyleHandler('styleTransform', 'transform');

        // Transition
        this.setupStyleHandler('styleTransition', 'transition');

        // Cursor
        this.setupButtonGroup('styleCursorGroup', 'cursor');
    }

    updateUI(computed, inline) {
        const state = this.currentState;

        // Helper: pseudo-class 상태이면 해당 상태의 CSS 규칙 값, 아니면 inline || CSS rule 값
        const getEffective = (prop) => {
            if (state) {
                return this.getCSSRuleValueWithState(prop, state) || '';
            }
            return inline[prop] || this.getCSSRuleValue(prop) || '';
        };

        // Helper: CSS 변수 해결 및 clean computed fallback (hover 오염 방지)
        // state가 설정되어 있으면 fallback 없음 (해당 상태에 값이 없으면 빈 값)
        const resolveForUI = (prop, effectiveValue) => {
            if (effectiveValue && effectiveValue !== 'none' && !effectiveValue.includes('var(')) {
                return effectiveValue;
            }
            if (effectiveValue && effectiveValue.includes('var(')) {
                if (state) {
                    return this._resolveCSSVariable(effectiveValue, prop) || effectiveValue;
                }
                return this.getCleanComputedValue(prop) || effectiveValue;
            }
            // pseudo-class 상태이면 해당 상태에 값이 없는 것이므로 빈 값 반환
            if (state) return effectiveValue || '';
            // 기본 상태: clean computed fallback (hover 오염 방지)
            if (!effectiveValue) {
                const clean = this.getCleanComputedValue(prop);
                return (clean && clean !== 'none') ? clean : '';
            }
            return effectiveValue;
        };

        // Opacity
        this.setValueWithCSS('styleOpacity', 'opacity', inline, computed, v => v === '1');
        this.updateOpacityRange(getEffective('opacity') || '1');

        // Box shadow - CSS 규칙 기반 조회 (hover 오염 방지)
        const boxShadowValue = getEffective('boxShadow');
        this.setValueWithCSS('styleBoxShadow', 'boxShadow', inline, computed, v => v === 'none');
        const boxShadowForUI = resolveForUI('boxShadow', boxShadowValue);
        this.updateBoxShadowRange(boxShadowForUI);
        this.updateBoxShadowColor(boxShadowForUI);

        // Text shadow - CSS 규칙 기반 조회 (hover 오염 방지)
        const textShadowValue = getEffective('textShadow');
        this.setValueWithCSS('styleTextShadow', 'textShadow', inline, computed, v => v === 'none');
        const textShadowForUI = resolveForUI('textShadow', textShadowValue);
        this.updateTextShadowRange(textShadowForUI);
        this.updateTextShadowColor(textShadowForUI);

        // Transform
        this.setValueWithCSS('styleTransform', 'transform', inline, computed, v => v === 'none');

        // Transition
        this.setValueWithCSS('styleTransition', 'transition', inline, computed);

        // Cursor
        this.setButtonGroup('styleCursorGroup', inline.cursor, computed.cursor, 'cursor');
    }

    // ========== CSS Undo 헬퍼 메서드 ==========

    /**
     * mousedown 시 호출: 변경 전 oldRules 수집하여 컨트롤 요소에 저장
     * ★ getCSSRuleInfo를 1차 소스로 사용 (getBestSelector는 클래스/ID 없는 요소에서 null)
     */
    _collectCSSUndoOldRules(styleProp, controlEl) {
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor.modules?.undoRedo;

        // ★ getCSSRuleInfo를 1차 소스로 (텍스트 컬러 수정과 동일 패턴)
        const ruleInfo = this.getCSSRuleInfo(styleProp);
        const collectSelector = ruleInfo?.selector || this.getBestSelector();

        controlEl._cssOldRules = (mainDoc && undoRedo && collectSelector)
            ? undoRedo.collectAllRulesForSelector(collectSelector, styleProp, mainDoc) : {};
    }

    // ========== Opacity ==========

    /**
     * Setup opacity range slider
     */
    setupOpacityRange() {
        const range = this.$('styleOpacityRange');
        const text = this.$('styleOpacity');

        if (range && text) {
            range._valueBeforeFocus = range.value;

            range.addEventListener('mousedown', () => {
                range._valueBeforeFocus = range.value;
                // ★ CSS Undo를 위한 oldRules 수집 (CSS 변경 전)
                this._collectCSSUndoOldRules('opacity', range);
            });

            // Real-time preview without undo
            range.addEventListener('input', async (e) => {
                text.value = e.target.value;
                if (this.selectedElement) {
                    await this.applyStyleChangeNoUndo('opacity', e.target.value);
                }
            });

            // Record undo on change (when user releases slider)
            range.addEventListener('change', async (e) => {
                const newValue = e.target.value;
                const oldValue = range._valueBeforeFocus || '1';
                if (this.selectedElement && oldValue !== newValue) {
                    // ★ applyStyleChange로 통일 (셀렉터 부스팅 + undo 기록 + 동기화 일괄 처리)
                    await this.applyStyleChange('opacity', newValue, oldValue, range._cssOldRules);
                }
                range._valueBeforeFocus = newValue;
            });

            text.addEventListener('change', (e) => {
                range.value = e.target.value || 1;
            });
        }
    }

    /**
     * Update opacity range from current value
     */
    updateOpacityRange(value) {
        const range = this.$('styleOpacityRange');
        if (range) {
            range.value = value || 1;
        }
    }

    // ========== Box Shadow ==========

    /**
     * Setup box shadow range slider
     */
    setupBoxShadowRange() {
        const range = this.$('styleBoxShadowRange');
        const text = this.$('styleBoxShadow');
        const colorPicker = this.$('styleBoxShadowColor');

        if (range && text) {
            range._valueBeforeFocus = this.getEffectiveCSSValue('boxShadow').value;

            range.addEventListener('mousedown', () => {
                range._valueBeforeFocus = this.getEffectiveCSSValue('boxShadow').value;
                // ★ CSS Undo를 위한 oldRules 수집
                this._collectCSSUndoOldRules('boxShadow', range);
            });

            // Real-time preview without undo
            range.addEventListener('input', async (e) => {
                const val = parseInt(e.target.value);
                const color = colorPicker ? this.hexToRgba(colorPicker.value, 0.3) : 'rgba(0,0,0,0.3)';
                const shadow = val === 0 ? 'none' : `0 ${val}px ${val * 2}px ${color}`;
                text.value = shadow;
                if (this.selectedElement) {
                    await this.applyStyleChangeNoUndo('boxShadow', shadow);
                }
            });

            // Record undo on change
            range.addEventListener('change', async (e) => {
                const val = parseInt(e.target.value);
                const color = colorPicker ? this.hexToRgba(colorPicker.value, 0.3) : 'rgba(0,0,0,0.3)';
                const newValue = val === 0 ? 'none' : `0 ${val}px ${val * 2}px ${color}`;
                const oldValue = range._valueBeforeFocus || 'none';
                if (this.selectedElement && oldValue !== newValue) {
                    // ★ applyStyleChange로 통일 (셀렉터 부스팅 + undo 기록 + 동기화 일괄 처리)
                    await this.applyStyleChange('boxShadow', newValue, oldValue, range._cssOldRules);
                }
                range._valueBeforeFocus = newValue;
            });
        }
    }

    /**
     * Setup box shadow color picker
     */
    setupBoxShadowColor() {
        const colorPicker = this.$('styleBoxShadowColor');
        const range = this.$('styleBoxShadowRange');
        const text = this.$('styleBoxShadow');

        if (colorPicker && range && text) {
            colorPicker._valueBeforeFocus = '';
            colorPicker._userInteracting = false;

            colorPicker.addEventListener('mousedown', () => {
                colorPicker._userInteracting = true;
                colorPicker._valueBeforeFocus = this.getEffectiveCSSValue('boxShadow').value;
                // ★ CSS Undo를 위한 oldRules 수집
                this._collectCSSUndoOldRules('boxShadow', colorPicker);
            });

            // Real-time preview without undo
            colorPicker.addEventListener('input', async (e) => {
                if (!colorPicker._userInteracting) return;
                const val = parseInt(range.value);
                if (val === 0) return;

                const color = this.hexToRgba(e.target.value, 0.3);
                const shadow = `0 ${val}px ${val * 2}px ${color}`;
                text.value = shadow;
                if (this.selectedElement) {
                    await this.applyStyleChangeNoUndo('boxShadow', shadow);
                }
            });

            // Record undo on change
            colorPicker.addEventListener('change', async () => {
                if (!colorPicker._userInteracting) return;
                const val = parseInt(range.value);
                if (val === 0) {
                    colorPicker._userInteracting = false;
                    return;
                }

                const color = this.hexToRgba(colorPicker.value, 0.3);
                const newValue = `0 ${val}px ${val * 2}px ${color}`;
                const oldValue = colorPicker._valueBeforeFocus || 'none';

                if (this.selectedElement && oldValue !== newValue) {
                    // ★ applyStyleChange로 통일 (셀렉터 부스팅 + undo 기록 + 동기화 일괄 처리)
                    await this.applyStyleChange('boxShadow', newValue, oldValue, colorPicker._cssOldRules);
                }
                colorPicker._userInteracting = false;
                colorPicker._valueBeforeFocus = newValue;
            });
        }
    }

    /**
     * Update box shadow range from current value
     */
    updateBoxShadowRange(value) {
        const range = this.$('styleBoxShadowRange');
        if (!range) return;

        // Try to extract vertical offset from shadow value
        if (value && value !== 'none') {
            const match = value.match(/\d+/);
            if (match) {
                range.value = parseInt(match[0]);
                return;
            }
        }
        range.value = 0;
    }

    /**
     * Update box shadow color picker from current value
     */
    updateBoxShadowColor(value) {
        const colorPicker = this.$('styleBoxShadowColor');
        if (!colorPicker) return;

        if (value && value !== 'none') {
            const color = this.extractColorFromShadow(value);
            if (color) {
                colorPicker.value = color;
                return;
            }
        }
        colorPicker.value = '#000000';
    }

    // ========== Text Shadow ==========

    /**
     * Setup text shadow range slider
     */
    setupTextShadowRange() {
        const range = this.$('styleTextShadowRange');
        const text = this.$('styleTextShadow');
        const colorPicker = this.$('styleTextShadowColor');

        if (range && text) {
            range._valueBeforeFocus = this.getEffectiveCSSValue('textShadow').value;

            range.addEventListener('mousedown', () => {
                range._valueBeforeFocus = this.getEffectiveCSSValue('textShadow').value;
                // ★ CSS Undo를 위한 oldRules 수집
                this._collectCSSUndoOldRules('textShadow', range);
            });

            // Real-time preview without undo
            range.addEventListener('input', async (e) => {
                const val = parseInt(e.target.value);
                const color = colorPicker ? this.hexToRgba(colorPicker.value, 0.5) : 'rgba(0,0,0,0.5)';
                const shadow = val === 0 ? 'none' : `${val}px ${val}px ${val * 2}px ${color}`;
                text.value = shadow;
                if (this.selectedElement) {
                    await this.applyStyleChangeNoUndo('textShadow', shadow);
                }
            });

            // Record undo on change
            range.addEventListener('change', async (e) => {
                const val = parseInt(e.target.value);
                const color = colorPicker ? this.hexToRgba(colorPicker.value, 0.5) : 'rgba(0,0,0,0.5)';
                const newValue = val === 0 ? 'none' : `${val}px ${val}px ${val * 2}px ${color}`;
                const oldValue = range._valueBeforeFocus || 'none';
                if (this.selectedElement && oldValue !== newValue) {
                    // ★ applyStyleChange로 통일 (셀렉터 부스팅 + undo 기록 + 동기화 일괄 처리)
                    await this.applyStyleChange('textShadow', newValue, oldValue, range._cssOldRules);
                }
                range._valueBeforeFocus = newValue;
            });
        }
    }

    /**
     * Setup text shadow color picker
     */
    setupTextShadowColor() {
        const colorPicker = this.$('styleTextShadowColor');
        const range = this.$('styleTextShadowRange');
        const text = this.$('styleTextShadow');

        if (colorPicker && range && text) {
            colorPicker._valueBeforeFocus = '';
            colorPicker._userInteracting = false;

            colorPicker.addEventListener('mousedown', () => {
                colorPicker._userInteracting = true;
                colorPicker._valueBeforeFocus = this.getEffectiveCSSValue('textShadow').value;
                // ★ CSS Undo를 위한 oldRules 수집
                this._collectCSSUndoOldRules('textShadow', colorPicker);
            });

            // Real-time preview without undo
            colorPicker.addEventListener('input', async (e) => {
                if (!colorPicker._userInteracting) return;
                const val = parseInt(range.value);
                if (val === 0) return;

                const color = this.hexToRgba(e.target.value, 0.5);
                const shadow = `${val}px ${val}px ${val * 2}px ${color}`;
                text.value = shadow;
                if (this.selectedElement) {
                    await this.applyStyleChangeNoUndo('textShadow', shadow);
                }
            });

            // Record undo on change
            colorPicker.addEventListener('change', async () => {
                if (!colorPicker._userInteracting) return;
                const val = parseInt(range.value);
                if (val === 0) {
                    colorPicker._userInteracting = false;
                    return;
                }

                const color = this.hexToRgba(colorPicker.value, 0.5);
                const newValue = `${val}px ${val}px ${val * 2}px ${color}`;
                const oldValue = colorPicker._valueBeforeFocus || 'none';

                if (this.selectedElement && oldValue !== newValue) {
                    // ★ applyStyleChange로 통일 (셀렉터 부스팅 + undo 기록 + 동기화 일괄 처리)
                    await this.applyStyleChange('textShadow', newValue, oldValue, colorPicker._cssOldRules);
                }
                colorPicker._userInteracting = false;
                colorPicker._valueBeforeFocus = newValue;
            });
        }
    }

    /**
     * Update text shadow range from current value
     */
    updateTextShadowRange(value) {
        const range = this.$('styleTextShadowRange');
        if (!range) return;

        // Try to extract offset from shadow value
        if (value && value !== 'none') {
            const match = value.match(/\d+/);
            if (match) {
                range.value = parseInt(match[0]);
                return;
            }
        }
        range.value = 0;
    }

    /**
     * Update text shadow color picker from current value
     */
    updateTextShadowColor(value) {
        const colorPicker = this.$('styleTextShadowColor');
        if (!colorPicker) return;

        if (value && value !== 'none') {
            const color = this.extractColorFromShadow(value);
            if (color) {
                colorPicker.value = color;
                return;
            }
        }
        colorPicker.value = '#000000';
    }

    // ========== Utility ==========

    /**
     * Extract color from shadow value and convert to hex
     */
    extractColorFromShadow(shadowValue) {
        if (!shadowValue) return null;

        // Match rgba(r, g, b, a) or rgb(r, g, b)
        const rgbaMatch = shadowValue.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbaMatch) {
            const r = parseInt(rgbaMatch[1]);
            const g = parseInt(rgbaMatch[2]);
            const b = parseInt(rgbaMatch[3]);
            return this.rgbToHex(`rgb(${r}, ${g}, ${b})`);
        }

        // Match hex color
        const hexMatch = shadowValue.match(/#([0-9a-fA-F]{3,6})/);
        if (hexMatch) {
            return '#' + hexMatch[1];
        }

        return null;
    }

    /**
     * Convert hex to rgba
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

export default EffectsStyleSection;
