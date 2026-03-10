import BaseStyleSection from './BaseStyleSection.js';

/**
 * BorderStyleSection - Handles border width, style, color, radius with per-side support
 */
class BorderStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
        this.borderSideMode = 'all'; // 'all' or 'individual'
        this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
        this.activeBorderSide = null; // 개별 모드에서 현재 편집 중인 면 (null이면 all 모드)
    }

    /**
     * Get the sides to apply changes to.
     * In 'all' mode: all 4 sides.
     * In 'individual' mode: only the activeBorderSide.
     */
    getActiveSides() {
        if (this.borderSideMode === 'all') {
            // All 모드에서 개별 면 편집 중이면 그 면만 반환
            if (this.activeBorderSide && this.activeBorderSide !== 'all') {
                return [this.activeBorderSide.charAt(0).toUpperCase() + this.activeBorderSide.slice(1)];
            }
            return ['Top', 'Right', 'Bottom', 'Left'];
        }
        if (this.activeBorderSide) {
            return [this.activeBorderSide.charAt(0).toUpperCase() + this.activeBorderSide.slice(1)];
        }
        return this.selectedBorderSides.map(s => s.charAt(0).toUpperCase() + s.slice(1));
    }

    setupHandlers() {
        this.setupBorderSideSelector();
        this.setupBorderInputHandlers();
        this.setupStyleHandlerWithPx('styleBorderRadius', 'borderRadius');
    }

    updateUI(computed, inline) {
        // Detect which sides have borders and set mode accordingly
        this.detectBorderSides(computed);
        this.updateBorderSideButtons();
        this.updateBorderInputsForCurrentSide(computed, inline);

        // Border radius - show computed value if no inline value
        this.setValueWithCSS('styleBorderRadius', 'borderRadius', inline, computed, v => v === '0px');
    }

    /**
     * Setup border side selector (All vs Individual sides)
     * - All 버튼: 전체 선택/해제 토글 (누르면 4면 모두 ON, 해제하면 모두 OFF)
     * - All 활성 중 개별 버튼 클릭 → All 해제, 4면 ON 유지, 클릭한 면 editing
     * - Individual 모드 3-state:
     *   OFF → 클릭 → ON + editing (보더 적용)
     *   ON (not editing) → 클릭 → editing (편집 대상 전환)
     *   ON + editing → 클릭 → OFF (보더 제거)
     */
    setupBorderSideSelector() {
        const sideGroup = this.$('borderSideGroup');
        if (!sideGroup) return;

        const allBtn = sideGroup.querySelector('.all-btn');
        const sideBtns = sideGroup.querySelectorAll('.side-btn');

        // All 버튼: 상태별 토글
        //   OFF → ON + editing (파란 테두리, 보더 적용)
        //   ON (not editing) → editing (파란 테두리)
        //   editing → OFF (보더 제거)
        if (allBtn) {
            allBtn.addEventListener('click', async () => {
                if (this.borderSideMode === 'all' && this.activeBorderSide === 'all') {
                    // ═══ editing → OFF ═══
                    await this._removeBorderFromActiveSides();
                    this.borderSideMode = 'individual';
                    this.selectedBorderSides = [];
                    this.activeBorderSide = null;
                    this.clearBorderInputs();
                } else if (this.borderSideMode === 'all') {
                    // ═══ ON (not editing) → editing ═══
                    this.activeBorderSide = 'all';
                } else {
                    // ═══ OFF/Partial → ON + editing ═══
                    this.borderSideMode = 'all';
                    this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
                    this.activeBorderSide = 'all';
                    await this._applyBorderInputsToActiveSides();
                }
                this.updateBorderSideButtons();
                this.updateBorderInputsForCurrentSide();
            });
        }

        // 개별 면 버튼: 3-state 토글
        sideBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const side = btn.dataset.value;

                if (this.borderSideMode === 'all') {
                    if (this.activeBorderSide === side) {
                        // ═══ editing → OFF (해당 면만 제거) ═══
                        // 1) activeBorderSide 유지한 채 제거 (getActiveSides가 이 면 반환)
                        await this._removeBorderFromActiveSides();
                        // 2) 모드 전환: all → individual, 제거한 면 빼기
                        this.borderSideMode = 'individual';
                        this.selectedBorderSides = ['top', 'right', 'bottom', 'left'].filter(s => s !== side);
                        this.activeBorderSide = null;
                    } else {
                        // ═══ 편집 대상 전환 (활성화) ═══
                        this.activeBorderSide = side;
                    }
                } else {
                    const idx = this.selectedBorderSides.indexOf(side);
                    if (idx > -1 && this.activeBorderSide === side) {
                        // ═══ ON + editing → OFF ═══
                        // 1) activeBorderSide 유지한 채 제거 (getActiveSides가 이 면 반환)
                        await this._removeBorderFromActiveSides();
                        // 2) 상태 업데이트
                        this.selectedBorderSides.splice(idx, 1);
                        this.activeBorderSide = null;
                    } else if (idx > -1) {
                        // ★ ON (not editing) → editing (편집 대상 전환)
                        this.activeBorderSide = side;
                    } else {
                        // ═══ OFF → ON + editing ═══
                        // 1) 상태 먼저 설정 (getActiveSides가 이 면 반환)
                        this.selectedBorderSides.push(side);
                        this.activeBorderSide = side;
                        // 2) 현재 입력값을 이 면에 적용
                        await this._applyBorderInputsToActiveSides();
                    }
                }

                this.updateBorderSideButtons();
                this.updateBorderInputsForCurrentSide();
            });
        });
    }

    /**
     * Setup border input handlers (width, style, color)
     */
    /**
     * Collect oldRules for all border sides before modification
     */
    /**
     * border undo용 타겟 셀렉터 결정 (applyBorderPropertyNoUndo와 동일한 로직)
     * @param {string} property - 'Width', 'Color', 'Style'
     * @returns {string|null} 타겟 셀렉터
     */
    _determineBorderTargetSelector(property) {
        const doc = this.previewWindow?.document;
        if (!doc) return null;

        const sides = this.getActiveSides();
        const firstStyleProp = `border${sides[0]}${property}`;
        const existingRuleInfo = this.getCSSRuleInfo(firstStyleProp);

        // ★ applyBorderPropertyNoUndo와 완전히 동일한 로직
        // 항상 getOrCreateUniqueSelector를 거쳐야 boosting이 필요한 경우 대응 가능
        let sharedSelector = null;
        if (existingRuleInfo?.selector &&
            (this.isGenericSelector(existingRuleInfo.selector) ||
             !this.isSelectorUnique(existingRuleInfo.selector, doc))) {
            sharedSelector = existingRuleInfo.selector;
        }

        return this.getOrCreateUniqueSelector(sharedSelector);
    }

    _collectBorderOldRules(property) {
        const sides = this.getActiveSides();

        // ★ applyBorderPropertyNoUndo와 동일한 셀렉터 결정 로직 사용
        const selector = this._determineBorderTargetSelector(property);
        if (!selector) return null;

        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor?.modules?.undoRedo;
        if (!mainDoc || !undoRedo) return null;

        const result = { _selector: selector }; // ★ 셀렉터도 함께 저장
        for (const side of sides) {
            const styleProp = `border${side}${property}`;
            result[side] = undoRedo.collectAllRulesForSelector(selector, styleProp, mainDoc);
        }
        return result;
    }

    setupBorderInputHandlers() {
        const widthInput = this.$('styleBorderWidth');
        const colorInput = this.$('styleBorderColor');
        const colorPicker = this.$('styleBorderColorPicker');
        const styleGroup = this.$('styleBorderStyleGroup');

        if (widthInput) {
            widthInput._valueBeforeFocus = '';
            widthInput._valueChanged = false;
            widthInput._oldRules = null;

            widthInput.addEventListener('focus', () => {
                widthInput.select();
                widthInput._valueBeforeFocus = widthInput.value || '';
                widthInput._valueChanged = false;
                widthInput._oldRules = this._collectBorderOldRules('Width');
            });

            // Real-time preview
            widthInput.addEventListener('input', (e) => {
                let value = e.target.value;
                if (value && !isNaN(value) && !value.includes('px')) {
                    value = value + 'px';
                }
                this.applyBorderPropertyNoUndo('Width', value);
                widthInput._valueChanged = true;
            });

            // Record undo on blur
            widthInput.addEventListener('blur', async () => {
                if (!widthInput._valueChanged) return;

                let value = widthInput.value;
                if (value && !isNaN(value) && !value.includes('px')) {
                    value = value + 'px';
                    widthInput.value = value;
                }

                const oldValue = widthInput._valueBeforeFocus;
                if (oldValue !== value) {
                    this.recordBorderUndo('Width', oldValue, value, widthInput._oldRules);
                    await this.editor.saveCurrentCSS();
                    await this.editor.saveCurrentHTML();
                }
                widthInput._valueBeforeFocus = value;
                widthInput._valueChanged = false;
                widthInput._oldRules = null;
            });

            widthInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') widthInput.blur();
            });
        }

        if (colorInput) {
            colorInput._valueBeforeFocus = '';
            colorInput._valueChanged = false;
            colorInput._oldRules = null;

            colorInput.addEventListener('focus', () => {
                colorInput._valueBeforeFocus = colorInput.value || '';
                colorInput._valueChanged = false;
                colorInput._oldRules = this._collectBorderOldRules('Color');
            });

            colorInput.addEventListener('input', (e) => {
                if (colorPicker) colorPicker.value = e.target.value;
                this.applyBorderPropertyNoUndo('Color', e.target.value);
                colorInput._valueChanged = true;
            });

            colorInput.addEventListener('blur', async () => {
                if (!colorInput._valueChanged) return;
                const oldValue = colorInput._valueBeforeFocus;
                const value = colorInput.value;
                if (oldValue !== value) {
                    this.recordBorderUndo('Color', oldValue, value, colorInput._oldRules);
                    await this.editor.saveCurrentCSS();
                    await this.editor.saveCurrentHTML();
                }
                colorInput._valueBeforeFocus = value;
                colorInput._valueChanged = false;
                colorInput._oldRules = null;
            });
        }

        if (colorPicker) {
            colorPicker._valueBeforeFocus = '';
            colorPicker._userInteracting = false;
            colorPicker._oldRules = null;

            colorPicker.addEventListener('mousedown', () => {
                colorPicker._userInteracting = true;
                colorPicker._valueBeforeFocus = colorPicker.value;
                colorPicker._oldRules = this._collectBorderOldRules('Color');
            });

            colorPicker.addEventListener('input', (e) => {
                if (!colorPicker._userInteracting) return;
                if (colorInput) colorInput.value = e.target.value;
                this.applyBorderPropertyNoUndo('Color', e.target.value);
            });

            colorPicker.addEventListener('change', async () => {
                if (colorPicker._userInteracting) {
                    const oldValue = colorPicker._valueBeforeFocus;
                    const value = colorPicker.value;
                    if (oldValue !== value) {
                        this.recordBorderUndo('Color', oldValue, value, colorPicker._oldRules);
                        await this.editor.saveCurrentCSS();
                        await this.editor.saveCurrentHTML();
                    }
                }
                colorPicker._userInteracting = false;
                colorPicker._oldRules = null;
            });
        }

        if (styleGroup) {
            styleGroup.querySelectorAll('.style-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const activeBtn = styleGroup.querySelector('.style-btn.active');
                    const oldValue = activeBtn?.dataset.value || '';

                    // Collect oldRules BEFORE modification
                    const oldRules = this._collectBorderOldRules('Style');

                    styleGroup.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const newValue = btn.dataset.value;

                    // Use NoUndo version to prevent double recording
                    await this.applyBorderPropertyNoUndo('Style', newValue);

                    if (oldValue !== newValue) {
                        this.recordBorderUndo('Style', oldValue, newValue, oldRules);
                        await this.editor.saveCurrentCSS();
                        await this.editor.saveCurrentHTML();
                    }
                });
            });
        }
    }

    /**
     * Apply border property without recording undo (for real-time preview)
     * Pseudo-class 상태를 인식하여 :hover/:focus/:active 규칙에 적용
     */
    async applyBorderPropertyNoUndo(property, value) {
        if (!this.selectedElement) return;

        const state = this.currentState;
        const sides = this.getActiveSides();

        const kebabProperty = (side) => `border-${side.toLowerCase()}-${property.toLowerCase()}`;

        // Pseudo-class 상태이면 :hover/:focus/:active 규칙에 적용
        if (state) {
            let bestSelector = this.getBestSelector();
            if (!bestSelector) {
                const generatedClass = this.generateUniqueClass();
                this.selectedElement.classList.add(generatedClass);
                bestSelector = '.' + generatedClass;
                this.editor.saveCurrentHTML();
            }

            for (const side of sides) {
                const styleProp = `border${side}${property}`;
                const ruleInfo = this.getCSSRuleInfoWithState(styleProp, state, true);

                if (ruleInfo && ruleInfo.rule && !this.isGenericSelector(ruleInfo.selector)) {
                    if (value) {
                        ruleInfo.rule.style.setProperty(kebabProperty(side), value);
                    } else {
                        ruleInfo.rule.style.removeProperty(kebabProperty(side));
                    }
                } else if (value) {
                    // :hover 규칙이 없으면 새로 생성
                    await this.addCSSRuleWithState(styleProp, value, state);
                }
            }
        } else {
            // ★ 기본 상태 - applyStyleChangeNoUndo와 동일한 미디어쿼리 + isPCSelected 패턴
            const el = this.selectedElement;
            // ★ 셀렉터 고유성 판단은 mainDoc 기준 (CSS 쓰기 대상과 동일 문서)
            const doc = this._getMainDoc();
            if (!doc) return;

            const mediaBreakpoints = this.mediaQueryBreakpoints;

            // ★ PC 규칙 수정 전에 oldValues 저장 (preventCascade에서 사용)
            // newValue 적용 후에는 computed style이 변경되므로 미리 저장
            const oldValuesForCascade = {};
            if (this.isPCSelected && this.previewWindow) {
                const computed = this.previewWindow.getComputedStyle(el);
                for (const side of sides) {
                    const styleProp = `border${side}${property}`;
                    oldValuesForCascade[side] = computed?.[styleProp] || '';
                }
            }

            // ── (A) 미디어쿼리 처리 (applyStyleChangeNoUndo 패턴) ──
            if (mediaBreakpoints.length > 0) {
                const firstStyleProp = `border${sides[0]}${property}`;
                const baseRuleInfo = this.getCSSRuleInfo(firstStyleProp);
                const mediaSelector = (baseRuleInfo?.selector && !this.isGenericSelector(baseRuleInfo.selector))
                    ? baseRuleInfo.selector : this.getBestSelector();

                if (mediaSelector) {
                    for (const maxWidth of mediaBreakpoints) {
                        if (maxWidth === 'pc') continue;
                        const mqRule = this.findOrCreateRuleInMediaQuery(mediaSelector, maxWidth);
                        if (!mqRule) continue;
                        for (const side of sides) {
                            const kp = kebabProperty(side);
                            if (value) {
                                mqRule.style.setProperty(kp, value);
                            } else {
                                mqRule.style.removeProperty(kp);
                            }
                        }
                    }
                }

                // boosted 셀렉터가 media query 규칙을 오버라이드하지 않도록 보존
                if (baseRuleInfo?.selector) {
                    for (const side of sides) {
                        this._preserveMediaQueryValues(baseRuleInfo.selector, kebabProperty(side));
                    }
                }

                if (this.editor?.modules?.multiCanvas?._isInitialized) {
                    this.editor.modules.multiCanvas.syncCSSToAllCanvases();
                }
            }

            // ── (B) PC 미선택이면 동기화만 하고 반환 ──
            if (!this.isPCSelected) {
                if (this.editor?.modules?.multiCanvas?._isInitialized) {
                    this.editor.modules.multiCanvas.syncCSSToAllCanvases();
                }
                if (this.editor.updateOverlay) {
                    this.editor.updateOverlay();
                }
                return;
            }

            // ── (C) PC 규칙 적용 (기존 로직) ──
            // 1) 기존 규칙에서 공유 셀렉터 확인 (specificity boosting 기준)
            const firstStyleProp = `border${sides[0]}${property}`;
            const existingRuleInfo = this.getCSSRuleInfo(firstStyleProp);
            let sharedSelector = null;
            if (existingRuleInfo?.selector &&
                (this.isGenericSelector(existingRuleInfo.selector) ||
                 !this.isSelectorUnique(existingRuleInfo.selector, doc))) {
                sharedSelector = existingRuleInfo.selector;
            }

            // 2) 고유 셀렉터 확보 (boosting 포함) - applyStyleChange와 동일
            const targetSelector = this.getOrCreateUniqueSelector(sharedSelector);
            if (!targetSelector) return;

            // 3) temp-styles에 규칙 생성/찾기
            const rule = this.findOrCreateRule(targetSelector);
            if (!rule) return;

            // 4) ★ cascade prevention (CSS 적용 전에 실행 - applyStyleChange 패턴과 동일)
            this.editor?.styleManager?.updateAvailableBreakpoints?.();
            const allBreakpoints = this.editor?.styleManager?.getAllBreakpoints?.() || [];
            if (allBreakpoints.length > 0 && targetSelector) {
                for (const side of sides) {
                    const styleProp = `border${side}${property}`;
                    const oldValue = oldValuesForCascade[side];
                    if (oldValue) {
                        await this.preventCascade(styleProp, oldValue, targetSelector);
                    }
                }
            }

            // 5) 각 면의 값 적용
            for (const side of sides) {
                // inline 스타일 제거 (CSS로 이관)
                const kp = kebabProperty(side);
                if (el.style.getPropertyValue(kp)) {
                    el.style.removeProperty(kp);
                }

                if (value) {
                    rule.style.setProperty(kp, value);
                } else {
                    rule.style.removeProperty(kp);
                    // 원본 규칙에서도 제거
                    if (existingRuleInfo?.rule && existingRuleInfo.rule !== rule) {
                        try { existingRuleInfo.rule.style.removeProperty(kp); } catch (e) {}
                    }
                    if (this.editor._trackCSSPropertyRemoval) {
                        this.editor._trackCSSPropertyRemoval(targetSelector, kp);
                    }
                }
            }

            // 6) ★ 미디어쿼리 값 보존 (부스팅 셀렉터가 @media 규칙 오버라이드 방지)
            for (const side of sides) {
                this._preserveMediaQueryValues(targetSelector, kebabProperty(side));
            }

            // 7) ★ 충돌하는 규칙 정리 (핵심!)
            let htmlChanged = false;
            for (const side of sides) {
                if (this._cleanupConflictingRules(targetSelector, kebabProperty(side))) {
                    htmlChanged = true;
                }
            }
            // ★ 고아 클래스 정리
            if (this.cleanupOrphanedClasses(targetSelector)) {
                htmlChanged = true;
            }
            if (htmlChanged) {
                await this.editor.saveCurrentHTML();
            }
        }

        // ★ mainIframe에 규칙 수정 후 모든 iframe에 동기화
        // 클래스도 동기화 (getOrCreateUniqueSelector가 클래스를 추가한 경우)
        if (this.editor?.modules?.multiCanvas?._isInitialized) {
            this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
            this.editor.modules.multiCanvas.syncCSSToAllCanvases();
            // inline style 제거(라인 400-404)도 다른 iframe에 동기화
            this.editor.modules.multiCanvas.syncElementStyleFromElement(this.selectedElement);
        }

        if (this.editor.updateOverlay) {
            this.editor.updateOverlay();
        }
    }

    /**
     * Record undo for border property changes using CSS rule snapshot
     */
    recordBorderUndo(property, oldValue, newValue, preCollectedOldRules = null) {
        if (!this.selectedElement) return;

        const sides = this.getActiveSides();

        // ★ preCollectedOldRules에 저장된 셀렉터 우선, 없으면 재결정
        const selector = preCollectedOldRules?._selector || this._determineBorderTargetSelector(property);
        if (!selector) return;

        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor?.modules?.undoRedo;
        if (!mainDoc || !undoRedo) return;

        // ★ 트랜잭션: all-sides 변경을 1개 undo 항목으로 묶음
        undoRedo.beginTransaction();
        try {
            for (const side of sides) {
                const styleProp = `border${side}${property}`;

                // Use pre-collected oldRules if available, otherwise collect current state as old
                const oldRules = preCollectedOldRules?.[side] || { pc: oldValue || '' };
                const newRules = undoRedo.collectAllRulesForSelector(selector, styleProp, mainDoc);

                undoRedo.recordCSSRuleSnapshot(
                    this.selectedElement,
                    selector,
                    styleProp,
                    oldRules,
                    newRules
                );
            }
        } finally {
            undoRedo.endTransaction();
        }
    }

    /**
     * Apply a border property to selected sides
     * @deprecated 사용처 없음. applyBorderPropertyNoUndo + recordBorderUndo 패턴으로 대체됨.
     */
    async applyBorderProperty(property, value) {
        if (!this.selectedElement) return;

        const sides = this.getActiveSides();

        for (const side of sides) {
            const styleProp = `border${side}${property}`;
            const oldValue = this.getEffectiveCSSValue(styleProp).value;
            // Use applyStyleChange to respect state (hover, focus, etc.)
            await this.applyStyleChange(styleProp, value, oldValue);
        }
    }

    /**
     * Apply current border input values to a specific side
     */
    async applyCurrentBorderValuesToSide(side) {
        const widthInput = this.$('styleBorderWidth');
        const colorInput = this.$('styleBorderColor');
        const styleGroup = this.$('styleBorderStyleGroup');

        const Side = side.charAt(0).toUpperCase() + side.slice(1);

        let width = widthInput?.value || '';
        const color = colorInput?.value || '';
        const activeStyleBtn = styleGroup?.querySelector('.style-btn.active');
        const borderStyle = activeStyleBtn?.dataset.value || '';

        if (width && !isNaN(width) && !width.includes('px')) {
            width = width + 'px';
        }

        // Use applyStyleChange to respect state (hover, focus, etc.)
        if (width) {
            const oldWidth = this.getEffectiveCSSValue(`border${Side}Width`).value;
            await this.applyStyleChange(`border${Side}Width`, width, oldWidth);
        }
        if (borderStyle) {
            const oldStyle = this.getEffectiveCSSValue(`border${Side}Style`).value;
            await this.applyStyleChange(`border${Side}Style`, borderStyle, oldStyle);
        }
        if (color) {
            const oldColor = this.getEffectiveCSSValue(`border${Side}Color`).value;
            await this.applyStyleChange(`border${Side}Color`, color, oldColor);
        }
    }

    /**
     * Remove border from sides other than the specified one
     */
    async removeBorderFromOtherSides(keepSide) {
        const allSides = ['top', 'right', 'bottom', 'left'];
        for (const side of allSides) {
            if (side !== keepSide) {
                await this.removeBorderFromSide(side);
            }
        }
    }

    /**
     * Clear border input fields
     */
    clearBorderInputs() {
        const widthInput = this.$('styleBorderWidth');
        const colorInput = this.$('styleBorderColor');
        const colorPicker = this.$('styleBorderColorPicker');
        const styleGroup = this.$('styleBorderStyleGroup');

        if (widthInput) widthInput.value = '';
        if (colorInput) colorInput.value = '';
        if (colorPicker) colorPicker.value = '#000000';
        if (styleGroup) {
            styleGroup.querySelectorAll('.style-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        }
    }

    /**
     * Remove border from a specific side
     */
    async removeBorderFromSide(side) {
        if (!this.selectedElement) return;
        const Side = side.charAt(0).toUpperCase() + side.slice(1);

        // ★ activeBorderSide 임시 설정 (getActiveSides()가 이 면만 반환하도록)
        const prevActiveSide = this.activeBorderSide;
        this.activeBorderSide = side;

        // 1) undo용 old rules 수집 (변경 전)
        const oldRulesWidth = this._collectBorderOldRules('Width');
        const oldRulesStyle = this._collectBorderOldRules('Style');

        // 2) applyBorderPropertyNoUndo로 CSS 적용
        //    명시적 '0'/'none' 사용 (다른 stylesheet 오버라이드 필요)
        await this.applyBorderPropertyNoUndo('Width', '0');
        await this.applyBorderPropertyNoUndo('Style', 'none');

        // 3) 단일 트랜잭션으로 undo 기록
        const selector = this._determineBorderTargetSelector('Width');
        const mainDoc = (this.editor?.mainIframe || this.editor?.previewFrame)?.contentDocument;
        const undoRedo = this.editor?.modules?.undoRedo;
        if (selector && mainDoc && undoRedo) {
            undoRedo.beginTransaction();
            try {
                for (const [prop, oldMap] of [['Width', oldRulesWidth], ['Style', oldRulesStyle]]) {
                    if (!oldMap) continue;
                    const styleProp = `border${Side}${prop}`;
                    const oldRules = oldMap[Side] || {};
                    const newRules = undoRedo.collectAllRulesForSelector(selector, styleProp, mainDoc);
                    undoRedo.recordCSSRuleSnapshot(this.selectedElement, selector, styleProp, oldRules, newRules);
                }
            } finally {
                undoRedo.endTransaction();
            }
        }

        // 4) CSS/HTML 저장
        await this.editor.saveCurrentCSS();
        await this.editor.saveCurrentHTML();

        // 5) activeBorderSide 복원
        this.activeBorderSide = prevActiveSide;
    }

    /**
     * 현재 입력 필드 값(width, style, color)을 getActiveSides() 모든 면에 일괄 적용
     * - applyBorderPropertyNoUndo 사용 (미디어쿼리 + isPCSelected 가드 포함)
     * - 단일 트랜잭션으로 undo 기록
     * - CSS/HTML 1회 저장
     */
    async _applyBorderInputsToActiveSides() {
        if (!this.selectedElement) return;

        // 1) 입력값 읽기
        const widthInput = this.$('styleBorderWidth');
        const colorInput = this.$('styleBorderColor');
        const styleGroup = this.$('styleBorderStyleGroup');
        let width = widthInput?.value || '';
        const color = colorInput?.value || '';
        const activeStyleBtn = styleGroup?.querySelector('.style-btn.active');
        const borderStyle = activeStyleBtn?.dataset.value || '';
        if (width && !isNaN(width) && !width.includes('px')) width += 'px';

        // 적용할 값이 하나도 없으면 종료
        if (!width && !borderStyle && !color) return;

        // 2) undo용 old rules 수집 (변경 전)
        const oldRulesWidth = width ? this._collectBorderOldRules('Width') : null;
        const oldRulesStyle = borderStyle ? this._collectBorderOldRules('Style') : null;
        const oldRulesColor = color ? this._collectBorderOldRules('Color') : null;

        // 3) applyBorderPropertyNoUndo로 CSS 적용 (isPCSelected 가드 없음)
        if (width) await this.applyBorderPropertyNoUndo('Width', width);
        if (borderStyle) await this.applyBorderPropertyNoUndo('Style', borderStyle);
        if (color) await this.applyBorderPropertyNoUndo('Color', color);

        // 4) 단일 트랜잭션으로 undo 기록
        //    (beginTransaction은 중첩 불가 → recordBorderUndo 대신 직접 기록)
        const selector = this._determineBorderTargetSelector('Width');
        const mainDoc = (this.editor?.mainIframe || this.editor?.previewFrame)?.contentDocument;
        const undoRedo = this.editor?.modules?.undoRedo;
        if (selector && mainDoc && undoRedo) {
            const sides = this.getActiveSides();
            undoRedo.beginTransaction();
            try {
                for (const [prop, oldMap] of [['Width', oldRulesWidth], ['Style', oldRulesStyle], ['Color', oldRulesColor]]) {
                    if (!oldMap) continue;
                    for (const side of sides) {
                        const styleProp = `border${side}${prop}`;
                        const oldRules = oldMap[side] || {};
                        const newRules = undoRedo.collectAllRulesForSelector(selector, styleProp, mainDoc);
                        undoRedo.recordCSSRuleSnapshot(this.selectedElement, selector, styleProp, oldRules, newRules);
                    }
                }
            } finally {
                undoRedo.endTransaction();
            }
        }

        // 5) CSS/HTML 1회 저장
        await this.editor.saveCurrentCSS();
        await this.editor.saveCurrentHTML();
    }

    /**
     * getActiveSides() 모든 면에서 border 제거 (width:'0', style:'none')
     * - applyBorderPropertyNoUndo 사용 (미디어쿼리 + isPCSelected 가드 포함)
     * - 단일 트랜잭션으로 undo 기록
     * - CSS/HTML 1회 저장
     */
    async _removeBorderFromActiveSides() {
        if (!this.selectedElement) return;

        // 1) undo용 old rules 수집 (변경 전)
        const oldRulesWidth = this._collectBorderOldRules('Width');
        const oldRulesStyle = this._collectBorderOldRules('Style');

        // 2) applyBorderPropertyNoUndo로 CSS 제거
        //    명시적 '0'/'none' 사용 (다른 stylesheet 오버라이드 필요)
        await this.applyBorderPropertyNoUndo('Width', '0');
        await this.applyBorderPropertyNoUndo('Style', 'none');

        // 3) 단일 트랜잭션으로 undo 기록
        const selector = this._determineBorderTargetSelector('Width');
        const mainDoc = (this.editor?.mainIframe || this.editor?.previewFrame)?.contentDocument;
        const undoRedo = this.editor?.modules?.undoRedo;
        if (selector && mainDoc && undoRedo) {
            const sides = this.getActiveSides();
            undoRedo.beginTransaction();
            try {
                for (const [prop, oldMap] of [['Width', oldRulesWidth], ['Style', oldRulesStyle]]) {
                    if (!oldMap) continue;
                    for (const side of sides) {
                        const styleProp = `border${side}${prop}`;
                        const oldRules = oldMap[side] || {};
                        const newRules = undoRedo.collectAllRulesForSelector(selector, styleProp, mainDoc);
                        undoRedo.recordCSSRuleSnapshot(this.selectedElement, selector, styleProp, oldRules, newRules);
                    }
                }
            } finally {
                undoRedo.endTransaction();
            }
        }

        // 4) CSS/HTML 1회 저장
        await this.editor.saveCurrentCSS();
        await this.editor.saveCurrentHTML();
    }

    /**
     * Detect which sides have border and set mode accordingly
     */
    detectBorderSides(computed) {
        const hasBorder = (side) => {
            const width = computed[`border${side}Width`];
            const style = computed[`border${side}Style`];
            return width && width !== '0px' && style && style !== 'none';
        };

        const sides = ['top', 'right', 'bottom', 'left'];
        const activeSides = sides.filter(s => hasBorder(s.charAt(0).toUpperCase() + s.slice(1)));

        if (activeSides.length === 4) {
            // 4면 모두 보더 → All 모드
            this.borderSideMode = 'all';
            this.selectedBorderSides = ['top', 'right', 'bottom', 'left'];
            this.activeBorderSide = null;
        } else {
            // 0~3면 보더 → Individual 모드, 보더 있는 면만 ON
            this.borderSideMode = 'individual';
            this.selectedBorderSides = activeSides;
            this.activeBorderSide = null;
        }
    }

    /**
     * Update border side button states
     */
    updateBorderSideButtons() {
        const sideGroup = this.$('borderSideGroup');
        if (!sideGroup) return;

        const allBtn = sideGroup.querySelector('.all-btn');
        const sideBtns = sideGroup.querySelectorAll('.side-btn');

        if (allBtn) {
            allBtn.classList.toggle('active', this.borderSideMode === 'all');
            allBtn.classList.toggle('editing', this.activeBorderSide === 'all');
        }

        sideBtns.forEach(btn => {
            const side = btn.dataset.value;
            if (this.borderSideMode === 'all') {
                btn.classList.add('active');
                // All 모드에서 개별 면 편집 중이면 해당 면에 editing 표시
                btn.classList.toggle('editing', side === this.activeBorderSide);
            } else {
                btn.classList.toggle('active', this.selectedBorderSides.includes(side));
                btn.classList.toggle('editing', side === this.activeBorderSide);
            }
        });
    }

    /**
     * Update border inputs to reflect current side's values
     */
    updateBorderInputsForCurrentSide(computed, inline) {
        if (!this.selectedElement) return;

        // Use stored or get fresh styles
        if (!computed || !inline) {
            const win = this.previewWindow;
            if (!win) return;
            computed = win.getComputedStyle(this.selectedElement);
            inline = this.selectedElement.style;
        }

        const state = this.currentState;
        let width, style, color;

        // ★ 표시할 면 결정: all 모드에서 개별 면 편집 중이면 해당 면, 아니면 top 기준
        const displaySide = this.borderSideMode === 'all'
            ? (this.activeBorderSide && this.activeBorderSide !== 'all'
                ? this.activeBorderSide.charAt(0).toUpperCase() + this.activeBorderSide.slice(1)
                : 'Top')
            : this.activeBorderSide
                ? this.activeBorderSide.charAt(0).toUpperCase() + this.activeBorderSide.slice(1)
                : (this.selectedBorderSides[0] || 'top').charAt(0).toUpperCase() +
                  (this.selectedBorderSides[0] || 'top').slice(1);

        if (state) {
            // Pseudo-class 상태: CSS 규칙에서 해당 상태의 값 조회
            const getStateValue = (prop, defaultVal = '') => {
                const val = this.getCSSRuleValueWithState(prop, state);
                if (val && val !== defaultVal && val !== '0px' && val !== 'none') return val;
                // fallback: clean computed (hover 오염 방지)
                const cleanComp = this.getCleanComputedValue(prop);
                if (cleanComp && cleanComp !== defaultVal && cleanComp !== '0px' && cleanComp !== 'none') return cleanComp;
                return '';
            };

            width = getStateValue(`border${displaySide}Width`);
            style = getStateValue(`border${displaySide}Style`, 'none');
            color = getStateValue(`border${displaySide}Color`);
        } else {
            // 기본 상태: inline → CSS 규칙 → clean computed (hover 오염 방지)
            const getValue = (inlineVal, prop, defaultVal = '') => {
                if (inlineVal) return inlineVal;
                // CSS 규칙 우선, 없으면 clean computed
                const cssVal = this.getCSSRuleValue(prop);
                if (cssVal && cssVal !== defaultVal && cssVal !== '0px' && cssVal !== 'none') return cssVal;
                const cleanVal = this.getCleanComputedValue(prop);
                if (cleanVal && cleanVal !== defaultVal && cleanVal !== '0px' && cleanVal !== 'none') return cleanVal;
                return '';
            };

            if (this.borderSideMode === 'all') {
                width = getValue(inline.borderWidth || inline.borderTopWidth, `border${displaySide}Width`);
                style = getValue(inline.borderStyle || inline.borderTopStyle, `border${displaySide}Style`, 'none');
                color = getValue(inline.borderColor || inline.borderTopColor, `border${displaySide}Color`);
            } else {
                width = getValue(inline[`border${displaySide}Width`], `border${displaySide}Width`);
                style = getValue(inline[`border${displaySide}Style`], `border${displaySide}Style`, 'none');
                color = getValue(inline[`border${displaySide}Color`], `border${displaySide}Color`);
            }
        }

        // CSS 변수 resolve: var(--x) 형태이면 실제 값으로 해석
        if (width && width.includes('var(')) {
            const sideProp = `border${displaySide}Width`;
            width = (state ? this._resolveCSSVariable(width, sideProp) : this.getCleanComputedValue(sideProp)) || width;
        }
        if (color && color.includes('var(')) {
            const sideProp = `border${displaySide}Color`;
            color = (state ? this._resolveCSSVariable(color, sideProp) : this.getCleanComputedValue(sideProp)) || color;
        }

        const widthInput = this.$('styleBorderWidth');
        const colorInput = this.$('styleBorderColor');
        const colorPicker = this.$('styleBorderColorPicker');
        const styleGroup = this.$('styleBorderStyleGroup');

        // ★ border가 실질적으로 없으면 (style=none 또는 width=0) color 필드 비우기
        // CSS 규격상 border-color 미지정 시 currentColor(=color 속성) 상속하므로
        // border 없는데 Typography 색상이 표시되는 UI 혼란 방지
        const effectiveStyle = style || 'none';
        const effectiveWidth = width ? parseFloat(width) : 0;
        const hasBorder = effectiveStyle !== 'none' && effectiveStyle !== 'hidden' && effectiveWidth > 0;

        if (widthInput) widthInput.value = width || '';
        if (colorInput) colorInput.value = hasBorder ? (color || '') : '';
        if (colorPicker && color && hasBorder) {
            try {
                colorPicker.value = this.rgbToHex(color);
            } catch (e) { }
        } else if (colorPicker && !hasBorder) {
            try { colorPicker.value = '#000000'; } catch (e) { }
        }
        if (styleGroup) {
            styleGroup.querySelectorAll('.style-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === style);
            });
        }
    }
}

export default BorderStyleSection;
