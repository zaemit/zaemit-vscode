/**
 * BaseStyleSection - Abstract base class for style sections
 * Provides common interface and utilities for all style sections
 */
class BaseStyleSection {
    constructor(editor) {
        if (new.target === BaseStyleSection) {
            throw new Error('BaseStyleSection is abstract and cannot be instantiated directly');
        }
        this.editor = editor;
        this.initialized = false;
    }

    /**
     * Initialize the section - must be implemented by subclasses
     */
    init() {
        if (this.initialized) return;
        this.setupHandlers();
        this.initialized = true;
    }

    /**
     * Setup event handlers - must be implemented by subclasses
     */
    setupHandlers() {
        throw new Error('setupHandlers() must be implemented by subclass');
    }

    /**
     * Update UI with current element's style values - must be implemented by subclasses
     * @param {CSSStyleDeclaration} computed - Computed styles
     * @param {CSSStyleDeclaration} inline - Inline styles
     */
    updateUI(computed, inline) {
        throw new Error('updateUI() must be implemented by subclass');
    }

    // ==================== Utility Methods ====================

    /**
     * Get the currently selected element
     */
    get selectedElement() {
        return this.editor.selectedElement;
    }

    /**
     * Get the preview frame's window (멀티뷰 지원: 선택된 요소의 document 사용)
     */
    get previewWindow() {
        // 선택된 요소가 있으면 해당 요소의 document window 사용
        if (this.editor.selectedElement?.ownerDocument?.defaultView) {
            return this.editor.selectedElement.ownerDocument.defaultView;
        }
        return this.editor.previewFrame?.contentWindow;
    }

    /**
     * Get the current pseudo-class state (:hover, :focus, :active, or '')
     */
    get currentState() {
        return this.editor.styleManager?.getCurrentState() || '';
    }

    /**
     * Get the current breakpoint for media query (first selected, backwards compat)
     * @returns {object|null} { maxWidth: number } or null for all screens
     */
    get currentBreakpoint() {
        return this.editor.styleManager?.getCurrentBreakpoint() || null;
    }

    /**
     * Get all selected breakpoints
     * @returns {Array} ['pc'] or array of 'pc' and/or maxWidth values
     */
    get selectedBreakpoints() {
        return this.editor.styleManager?.getSelectedBreakpoints() || ['pc'];
    }

    /**
     * Convert camelCase JS style property to kebab-case CSS property.
     * Handles special cases like cssFloat → float.
     * @param {string} prop - camelCase property name (e.g. 'cssFloat', 'backgroundColor')
     * @returns {string} kebab-case CSS property name (e.g. 'float', 'background-color')
     */
    toKebabCase(prop) {
        const kebab = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        if (kebab === 'css-float') return 'float';
        // vendor prefix: webkitTextFillColor → -webkit-text-fill-color
        if (kebab.startsWith('webkit-')) return '-' + kebab;
        if (kebab.startsWith('moz-')) return '-' + kebab;
        if (kebab.startsWith('ms-')) return '-' + kebab;
        return kebab;
    }

    /**
     * Check if PC (base styles) is selected
     * @returns {boolean}
     */
    get isPCSelected() {
        return this.editor.styleManager?.isPCSelected() ?? true;
    }

    /**
     * Check if only PC is selected (no media queries)
     * @returns {boolean}
     */
    get isOnlyPCSelected() {
        return this.editor.styleManager?.isOnlyPCSelected() ?? true;
    }

    /**
     * Get media query breakpoints (excludes 'pc')
     * @returns {Array}
     */
    get mediaQueryBreakpoints() {
        return this.editor.styleManager?.getMediaQueryBreakpoints() || [];
    }

    /**
     * Get an element by ID
     */
    $(id) {
        return document.getElementById(id);
    }

    /**
     * Set input value - shows inline value if set, otherwise empty with computed as placeholder
     */
    setValue(id, inlineVal, computedVal) {
        const el = this.$(id);
        if (!el) return;

        // Don't update if element has focus (user is typing)
        if (document.activeElement === el) return;

        // Clean up decimal places
        const cleanValue = (val) => {
            if (val && typeof val === 'string') {
                return val.replace(/(\d+)\.\d+(px|em|rem|%|vh|vw|pt)/g, '$1$2');
            }
            return val || '';
        };

        const cleanedValue = cleanValue(inlineVal);

        // Set flag to prevent change event from applying style back
        el._isUpdatingUI = true;
        el.value = cleanedValue;
        el._valueBeforeFocus = cleanedValue; // Also update tracked value

        // Show computed value as placeholder if no inline value
        if (!inlineVal && computedVal) {
            el.placeholder = cleanValue(computedVal);
        } else {
            el.placeholder = '';
        }

        // Reset flag after current call stack
        setTimeout(() => { el._isUpdatingUI = false; }, 0);
    }

    /**
     * Set value with CSS rule support
     * Priority: inline > CSS rule > computed (for default state)
     * For pseudo-class states (:hover, :focus, :active): only CSS rules are shown
     * Shows the actual CSS value (like "100vh") in the input field
     * @param {string} inputId - The input element ID
     * @param {string} prop - CSS property name (camelCase)
     * @param {CSSStyleDeclaration} inline - Inline styles
     * @param {CSSStyleDeclaration} computed - Computed styles
     * @param {function} isDefault - Optional function to check if value is default (should be hidden)
     */
    setValueWithCSS(inputId, prop, inline, computed, isDefault = () => false) {
        const el = this.$(inputId);
        if (!el) return;

        // Don't update if element has focus (user is typing)
        if (document.activeElement === el) return;

        const state = this.currentState;

        const cleanValue = (val) => {
            if (val && typeof val === 'string') {
                return val.replace(/(\d+)\.\d+(px|em|rem|%|vh|vw|pt)/g, '$1$2');
            }
            return val || '';
        };

        // Helper to set value, adding option to select if needed
        const setElValue = (value, source) => {
            const cleanedValue = cleanValue(value);
            el.dataset.source = source;
            el.placeholder = '';

            // For select elements, add option if value doesn't exist
            if (el.tagName === 'SELECT' && cleanedValue) {
                const optionExists = Array.from(el.options).some(opt => opt.value === cleanedValue);
                if (!optionExists) {
                    // Remove previously added dynamic option
                    const dynamicOpt = el.querySelector('option[data-dynamic]');
                    if (dynamicOpt) dynamicOpt.remove();

                    // Add new dynamic option
                    const newOpt = document.createElement('option');
                    newOpt.value = cleanedValue;
                    newOpt.textContent = cleanedValue;
                    newOpt.dataset.dynamic = 'true';
                    el.insertBefore(newOpt, el.firstChild.nextSibling); // After first option
                }
            }

            // Set flag to prevent change event from applying style back
            el._isUpdatingUI = true;
            el.value = cleanedValue;
            el._valueBeforeFocus = cleanedValue; // Also update tracked value
            setTimeout(() => { el._isUpdatingUI = false; }, 0);
        };

        // For pseudo-class states, only show CSS rule values (inline styles don't apply)
        if (state) {
            const cssValue = this.getCSSRuleValueWithState(prop, state);
            if (cssValue) {
                setElValue(cssValue, 'css-state');
            } else {
                el._isUpdatingUI = true;
                el.value = '';
                el._valueBeforeFocus = '';
                el.dataset.source = 'none';
                el.placeholder = '(기본값 상속)';
                setTimeout(() => { el._isUpdatingUI = false; }, 0);
            }
            return;
        }

        // Default state: check inline first, then CSS rules, then computed
        // 1. Check inline style first
        if (inline[prop]) {
            setElValue(inline[prop], 'inline');
            return;
        }

        // 2. Check if a media query overrides this property at the current viewport
        const mqOverride = this._getMediaQueryOverrideValue(prop);
        if (mqOverride !== null) {
            if (!isDefault(mqOverride)) {
                setElValue(mqOverride, 'css');
            }
            // isDefault인 경우 (예: padding: 0px) → step 4로 이동하여 빈 칸 표시
            return;
        }

        // 3. Check base CSS rule value (preserves original units like %, vh, em)
        const cssRuleValue = this.getCSSRuleValue(prop);
        if (cssRuleValue && !isDefault(cssRuleValue)) {
            setElValue(cssRuleValue, 'css');
            return;
        }

        // 3. computed value 표시 (fallback - 항상 px, hover 오염 방지)
        const computedVal = this.getCleanComputedValue(prop) || computed[prop];
        if (computedVal && !isDefault(computedVal)) {
            setElValue(computedVal, 'computed');
            return;
        }

        // 4. computed가 기본값이면 빈 칸
        el._isUpdatingUI = true;
        el.value = '';
        el._valueBeforeFocus = '';
        el.dataset.source = 'computed';
        el.placeholder = '';
        setTimeout(() => { el._isUpdatingUI = false; }, 0);
    }

    /**
     * Update button group to reflect current value
     * @param {string} groupId - Button group element ID
     * @param {string} inlineVal - Inline style value
     * @param {string} computedVal - Computed style value
     * @param {string} [prop] - CSS property name (camelCase) for CSS rule lookup
     */
    setButtonGroup(groupId, inlineVal, computedVal, prop) {
        const group = this.$(groupId);
        if (!group) return;

        let value;
        const state = this.currentState;

        if (state && prop) {
            // Pseudo-class 상태: CSS 규칙에서 해당 상태의 값 조회
            // fallback은 clean computed (hover 오염 방지)
            const cssValue = this.getCSSRuleValueWithState(prop, state);
            value = cssValue || this.getCleanComputedValue(prop) || '';
        } else if (prop) {
            // 기본 상태: inline → CSS 규칙 → clean computed (hover 오염 방지)
            const cssValue = inlineVal ? '' : this.getCSSRuleValue(prop);
            value = inlineVal || cssValue || this.getCleanComputedValue(prop) || '';
        } else {
            value = inlineVal || computedVal || '';
        }

        group.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    }

    /**
     * Apply style change - respects CSS priority (inline > CSS rule)
     * For pseudo-class states, always uses CSS (inline styles don't support pseudo-classes)
     * Uses CSS Rule Snapshot for undo/redo to capture all media query rules at once
     * @param {string} styleProp - CSS property name (camelCase)
     * @param {string} newValue - New value to set
     * @param {string} oldValue - Old value for undo
     * @param {Object} preCollectedOldRules - Optional pre-collected oldRules (for color picker where preview already changed CSS)
     */
    async applyStyleChange(styleProp, newValue, oldValue, preCollectedOldRules = null) {
        if (!this.selectedElement) {
            return;
        }

        try {
        const state = this.currentState;
        const mediaBreakpoints = this.mediaQueryBreakpoints;
        const kebabProperty = this.toKebabCase(styleProp);

        // For pseudo-class states (:hover, :focus, :active), use separate handling
        if (state) {
            await this.applyStyleChangeWithState(styleProp, newValue, oldValue, state);
            return;
        }

        // ★ PC만 ON이어도 cascade 방지 필요 (색상 핸들러와 동일한 패턴)
        // 사용 가능한 브레이크포인트가 있으면 preventCascade 호출
        this.editor.styleManager?.updateAvailableBreakpoints();
        const allBreakpoints = this.editor.styleManager?.getAllBreakpoints() || [];

        // ★ selector 미리 결정 (스냅샷용)
        let existingRuleInfo = this.getCSSRuleInfo(styleProp);
        let targetSelector = existingRuleInfo?.selector;
        // ★ 셀렉터 고유성 판단은 mainDoc 기준 (CSS 쓰기 대상과 동일 문서)
        const selectorDoc = this._getMainDoc();

        // generic selector 또는 비고유(공유) 셀렉터면 고유 셀렉터로 대체
        if (!targetSelector || this.isGenericSelector(targetSelector) ||
            !this.isSelectorUnique(targetSelector, selectorDoc)) {
            // ★ 기존 공유 셀렉터를 전달하여 specificity boosting
            const sharedSelector = existingRuleInfo?.selector || null;
            targetSelector = this.getOrCreateUniqueSelector(sharedSelector);
            if (targetSelector) {
                // ★ 멀티뷰: 새 클래스를 모든 iframe의 같은 요소에 동기화
                // getOrCreateUniqueSelector가 selectedElement에만 클래스를 추가하므로
                // 다른 iframe 요소에도 반영해야 CSS 셀렉터가 매칭됨
                if (this.editor?.modules?.multiCanvas?._isInitialized) {
                    this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
                }
                await this.editor.saveCurrentHTML();
            }
        }

        // ★ 변경 전: mainIframe에서 모든 미디어쿼리 규칙 수집 → oldRules
        // getMainStylesheet()와 동일한 document를 사용해야 함
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor.modules?.undoRedo;
        let oldRules = {};
        if (preCollectedOldRules) {
            // ★ 색상 피커 등에서 미리 수집된 oldRules 사용 (실시간 미리보기로 이미 CSS가 변경된 경우)
            oldRules = preCollectedOldRules;
        } else if (mainDoc && undoRedo && targetSelector) {
            oldRules = undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc);
            // ★ 셀렉터가 부스팅/변경된 경우, 원래 셀렉터의 값도 수집 (undo 복원용)
            // 새 셀렉터에는 아직 CSS 규칙이 없으므로 oldRules가 비어있을 수 있음
            if (Object.keys(oldRules).length === 0 && existingRuleInfo?.selector &&
                existingRuleInfo.selector !== targetSelector) {
                oldRules = undoRedo.collectAllRulesForSelector(existingRuleInfo.selector, styleProp, mainDoc);
            }
        }

        // ★ inline→CSS 전환 시 oldRules에 inline 값 보존
        // CSS 규칙에 없지만 inline에 있는 값을 PC base로 포함 (undo 시 복원 가능)
        const inlineVal = this.selectedElement.style.getPropertyValue(kebabProperty);
        if (inlineVal && !oldRules.pc) {
            oldRules.pc = inlineVal;
        }

        // ★ 최종 fallback: getCSSRuleInfo에서 찾은 값 사용
        // HTML 내장 <style> 태그, zaemit-injected-css 등 collectAllRulesForSelector가 검색하지 않는 시트의 값
        // ★ preCollectedOldRules가 제공된 경우 스킵: 실시간 미리보기(input)로 CSS가 이미 변경되어
        //    existingRuleInfo.value가 새 값을 반환하므로 oldRules를 잘못 덮어씀
        if (!preCollectedOldRules && Object.keys(oldRules).length === 0 && existingRuleInfo?.value) {
            oldRules.pc = existingRuleInfo.value;
        }

        // cascade 방지 (다른 breakpoints에 기존 값 보존)
        if (allBreakpoints.length > 0 && targetSelector) {
            await this.preventCascade(styleProp, oldValue, targetSelector);
        }

        // ★ 실제 변경 적용
        let changeApplied = false;

        // ★ non-PC 뷰포트 편집 시 자동 미디어쿼리 타겟팅 (멀티뷰/싱글뷰 공통)
        // non-PC 뷰포트에서 편집하면 해당 뷰포트의 미디어쿼리만 타겟
        // (PC base 규칙은 변경하지 않음 → 해당 뷰포트 이하에만 영향)
        let effectiveMediaBreakpoints = [...mediaBreakpoints];
        let effectiveIsPCSelected = this.isPCSelected;

        const currentViewport = this.editor?.styleManager?.currentViewport;
        if (currentViewport && currentViewport !== 'pc') {
            const vpWidth = parseInt(currentViewport);
            if (vpWidth) {
                // non-PC 뷰포트 편집 → 현재 뷰포트의 미디어쿼리만 타겟 (PC base 제외)
                effectiveMediaBreakpoints = [vpWidth];
                effectiveIsPCSelected = false;
            }
        }

        // Apply to media query breakpoints if any are selected
        // 멀티뷰 ON/OFF와 무관하게 체크박스 선택 기준으로 미디어쿼리 적용
        // (모든 스타일 변경은 getMainStylesheet()를 통해 mainIframe CSSOM을 직접 수정하므로 안전)
        // skipRecord=true: 개별 기록하지 않고, 마지막에 cssRuleSnapshot으로 한번에 기록
        if (effectiveMediaBreakpoints.length > 0) {
            await this.applyStyleChangeToBreakpoints(styleProp, newValue, oldValue, effectiveMediaBreakpoints, true, targetSelector);
            changeApplied = true;
        }

        // If PC is selected, apply to base styles
        if (effectiveIsPCSelected) {
            // ★ height 관련 속성 변경 시 limitViewportHeightElements opt-out
            // 에디터가 100vh 이상 요소에 주입한 !important 인라인을 사용자가 수정하면
            // 자동 높이 제한에서 제외하여 사용자 의도를 존중
            const heightRelatedProps = ['height', 'minHeight', 'maxHeight'];
            if (heightRelatedProps.includes(styleProp) && this.selectedElement.dataset.editorHeightLimited) {
                // 에디터가 주입한 !important 인라인 전부 제거하고 원본 복원
                const origH = this.selectedElement.dataset.editorOriginalHeight;
                const origMinH = this.selectedElement.dataset.editorOriginalMinHeight;
                const origMaxH = this.selectedElement.dataset.editorOriginalMaxHeight;

                this.selectedElement.style.removeProperty('height');
                this.selectedElement.style.removeProperty('min-height');
                this.selectedElement.style.removeProperty('max-height');

                if (origH) this.selectedElement.style.height = origH;
                if (origMinH) this.selectedElement.style.minHeight = origMinH;
                if (origMaxH) this.selectedElement.style.maxHeight = origMaxH;

                delete this.selectedElement.dataset.editorHeightLimited;
                delete this.selectedElement.dataset.editorOriginalHeight;
                delete this.selectedElement.dataset.editorOriginalMinHeight;
                delete this.selectedElement.dataset.editorOriginalMaxHeight;

                // opt-out 플래그 설정 (limitViewportHeightElements에서 스킵)
                this.selectedElement.dataset.editorNoHeightLimit = 'true';

                // 멀티뷰: 다른 iframe의 같은 요소에도 opt-out 전파
                const mc = this.editor?.modules?.multiCanvas;
                if (mc?._isInitialized) {
                    const elPath = mc._getElementPath(this.selectedElement);
                    if (elPath) {
                        mc.iframes?.forEach(iframe => {
                            try {
                                const doc = iframe.contentDocument;
                                if (!doc?.body?.contains(this.selectedElement)) {
                                    const target = mc._findElementByPath(elPath, doc);
                                    if (target) {
                                        target.style.removeProperty('height');
                                        target.style.removeProperty('min-height');
                                        target.style.removeProperty('max-height');
                                        if (origH) target.style.height = origH;
                                        if (origMinH) target.style.minHeight = origMinH;
                                        if (origMaxH) target.style.maxHeight = origMaxH;
                                        delete target.dataset.editorHeightLimited;
                                        delete target.dataset.editorOriginalHeight;
                                        delete target.dataset.editorOriginalMinHeight;
                                        delete target.dataset.editorOriginalMaxHeight;
                                        target.dataset.editorNoHeightLimit = 'true';
                                    }
                                }
                            } catch (e) { /* cross-origin */ }
                        });
                    }
                }
            }

            // Remove any existing inline style for this property (migrate to CSS)
            if (this.selectedElement.style[styleProp]) {
                this.selectedElement.style.removeProperty(kebabProperty);
                await this.editor.saveCurrentHTML();
            }

            // Apply to CSS rule
            const rule = this.findOrCreateRule(targetSelector);
            if (rule) {
                if (newValue) {
                    // ★ gap shorthand/longhand 충돌 정리
                    // gap shorthand 설정 시 기존 longhand 제거, longhand 설정 시 기존 shorthand 분리
                    this._cleanupGapConflict(rule, kebabProperty);
                    rule.style.setProperty(kebabProperty, newValue);
                } else {
                    rule.style.removeProperty(kebabProperty);
                    // ★ 다른 stylesheet(zaemit-injected-css, style.css <link> 등)의 동일 selector 규칙에서도 제거
                    // findOrCreateRule()은 zaemit-temp-styles만 사용하므로 원본 규칙의 값은 그대로 남음
                    if (existingRuleInfo?.rule && existingRuleInfo.rule !== rule &&
                        existingRuleInfo.selector === targetSelector) {
                        try {
                            existingRuleInfo.rule.style.removeProperty(kebabProperty);
                        } catch (e) { /* cross-origin stylesheet */ }
                    }
                    // ★ saveCSS()에서 CSS 파일 텍스트에서도 제거하도록 추적
                    if (this.editor._trackCSSPropertyRemoval) {
                        this.editor._trackCSSPropertyRemoval(targetSelector, kebabProperty);
                    }
                }
                changeApplied = true;
            } else {
                // Fallback to inline style if CSS rule creation fails
                if (newValue) {
                    this.selectedElement.style.setProperty(kebabProperty, newValue);
                } else {
                    this.selectedElement.style.removeProperty(kebabProperty);
                }
                changeApplied = true;
            }
        }

        // ★ 부스팅 셀렉터가 미디어쿼리 규칙을 오버라이드하지 않도록 보존
        // base 셀렉터 [0,2,0]이 @media 내 [0,1,0] 규칙을 이기는 문제 방지
        if (changeApplied && targetSelector) {
            this._preserveMediaQueryValues(targetSelector, kebabProperty);
        }

        // ★ 동일 property를 가진 다른 매칭 규칙에서 제거 (CSS 충돌 방지)
        // 요소에 여러 generated class가 있을 때, 이전 값이 남아 새 값을 오버라이드하는 문제 해결
        if (changeApplied && targetSelector) {
            let htmlChanged = this._cleanupConflictingRules(targetSelector, kebabProperty);
            // ★ 고아 클래스 정리: CSS 규칙이 없는 이전 세션의 generated 클래스 제거
            if (this.cleanupOrphanedClasses(targetSelector)) {
                htmlChanged = true;
            }
            if (htmlChanged) {
                await this.editor.saveCurrentHTML();
            }
        }

        // ★ mainIframe에 규칙 추가/수정 후 모든 iframe에 동기화
        if (this.editor?.modules?.multiCanvas?._isInitialized) {
            this.editor.modules.multiCanvas.syncCSSToAllCanvases();
            // inline style 변경(제거 포함)도 다른 iframe에 동기화
            this.editor.modules.multiCanvas.syncElementStyleFromElement(this.selectedElement);
        }

        // 오버레이 위치/크기 업데이트
        if (this.editor.updateOverlay) {
            this.editor.updateOverlay();
        }

        // ★ 변경 후: mainIframe에서 모든 미디어쿼리 규칙 수집 → newRules
        // 그리고 cssRuleSnapshot으로 기록
        if (changeApplied && mainDoc && undoRedo && targetSelector) {
            const newRules = undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc);
            undoRedo.recordCSSRuleSnapshot(
                this.selectedElement,
                targetSelector,
                styleProp,
                oldRules,
                newRules
            );
            await this.editor.saveCurrentCSS();
        }
        } catch (err) {
            console.error('[BaseStyleSection] applyStyleChange error:', err);
            throw err;
        }
    }

    /**
     * Apply style change for a specific pseudo-class state
     * @param {string} styleProp - CSS property name (camelCase)
     * @param {string} newValue - New value to set
     * @param {string} oldValue - Old value for undo
     * @param {string} state - Pseudo-class state (:hover, :focus, :active)
     */
    async applyStyleChangeWithState(styleProp, newValue, oldValue, state) {
        if (!this.selectedElement || !this.previewWindow) {
            return;
        }

        const doc = this.previewWindow.document;
        const kebabProperty = this.toKebabCase(styleProp);
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor.modules?.undoRedo;

        // ★ pseudo-class 상태 변경은 CSS 규칙으로만 처리해야 함
        // inline 스타일이 있으면 CSS 규칙으로 이동 후 제거
        // (인라인 스타일은 :hover 등 pseudo-class보다 우선순위가 높아 hover가 작동하지 않음)
        if (this.selectedElement.style[styleProp]) {
            const defaultValue = this.selectedElement.style[styleProp];
            this.selectedElement.style.removeProperty(kebabProperty);

            // ★ 고유 selector로 CSS 규칙 이동 (getBestSelector 대신 getOrCreateUniqueSelector 사용)
            // getBestSelector()는 태그명만으로 구성된 넓은 범위 selector를 반환할 수 있어
            // 의도치 않은 요소에 hover 스타일이 적용되는 문제 방지
            const baseSelector = this.getOrCreateUniqueSelector(null);
            if (baseSelector) {
                // ★ 멀티뷰: 새 클래스를 모든 iframe에 동기화
                if (this.editor?.modules?.multiCanvas?._isInitialized) {
                    this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
                }
                const baseRule = this.findOrCreateRule(baseSelector);
                if (baseRule && !baseRule.style.getPropertyValue(kebabProperty)) {
                    baseRule.style.setProperty(kebabProperty, defaultValue);
                }
            }
        }

        // Find existing CSS rule with the pseudo-class (exclude generic selectors)
        const ruleInfo = this.getCSSRuleInfoWithState(styleProp, state, true);

        if (ruleInfo && ruleInfo.rule && !this.isGenericSelector(ruleInfo.selector)) {
            const targetSelector = ruleInfo.selector;
            // ★ 변경 전 oldRules 수집
            const oldRules = (mainDoc && undoRedo && targetSelector)
                ? undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc) : {};

            // Modify existing rule with specific selector
            if (newValue) {
                ruleInfo.rule.style.setProperty(kebabProperty, newValue);
            } else {
                ruleInfo.rule.style.removeProperty(kebabProperty);
            }
            // ★ mainIframe에 규칙 수정 후 모든 iframe에 동기화
            if (this.editor?.modules?.multiCanvas?._isInitialized) {
                this.editor.modules.multiCanvas.syncCSSToAllCanvases();
                // inline style 제거(라인 527-529)도 다른 iframe에 동기화
                this.editor.modules.multiCanvas.syncElementStyleFromElement(this.selectedElement);
            }
            if (this.editor.updateOverlay) {
                this.editor.updateOverlay();
            }
            // ★ recordCSSRuleSnapshot으로 기록 (recordStyleChange 대체)
            if (mainDoc && undoRedo && targetSelector) {
                const newRules = undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc);
                undoRedo.recordCSSRuleSnapshot(this.selectedElement, targetSelector, styleProp, oldRules, newRules);
            }
            await this.editor.saveCurrentCSS();
            return;
        }

        // ★ 고유 selector 확보 (generic selector 방지)
        let bestSelector = this.getOrCreateUniqueSelector(null);

        // fallback: getOrCreateUniqueSelector가 실패하면 기존 방식
        if (!bestSelector) {
            bestSelector = this.getBestSelector();
            if (!bestSelector) {
                const generatedClass = this.generateUniqueClass();
                this.selectedElement.classList.add(generatedClass);
                bestSelector = '.' + generatedClass;
            }
        }

        // ★ 멀티뷰: 새 클래스를 모든 iframe에 동기화
        if (this.editor?.modules?.multiCanvas?._isInitialized) {
            this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
        }

        // Save HTML to persist the selector class
        this.editor.saveCurrentHTML();

        // ★ 변경 전 oldRules 수집 (새 규칙 생성 전)
        const selectorWithState = bestSelector + state;
        const oldRules = (mainDoc && undoRedo)
            ? undoRedo.collectAllRulesForSelector(selectorWithState, styleProp, mainDoc) : {};

        // No existing rule with pseudo-class - need to create one
        const added = await this.addCSSRuleWithState(styleProp, newValue, state);
        if (added) {
            // ★ mainIframe에 규칙 추가 후 모든 iframe에 동기화
            if (this.editor?.modules?.multiCanvas?._isInitialized) {
                this.editor.modules.multiCanvas.syncCSSToAllCanvases();
                // inline style 제거(라인 527-529)도 다른 iframe에 동기화
                this.editor.modules.multiCanvas.syncElementStyleFromElement(this.selectedElement);
            }
            if (this.editor.updateOverlay) {
                this.editor.updateOverlay();
            }
            // ★ recordCSSRuleSnapshot으로 기록 (recordStyleChange 대체)
            if (mainDoc && undoRedo) {
                const newRules = undoRedo.collectAllRulesForSelector(selectorWithState, styleProp, mainDoc);
                undoRedo.recordCSSRuleSnapshot(this.selectedElement, selectorWithState, styleProp, oldRules, newRules);
            }
        }
    }

    /**
     * Add a new CSS rule for the selected element
     * @param {string} property - CSS property (camelCase)
     * @param {string} value - CSS value
     * @returns {boolean} Whether rule was added
     */
    async addCSSRule(property, value) {
        if (!this.selectedElement || !value) return false;

        const selector = this.getBestSelector();
        if (!selector) return false;

        const kebabProperty = this.toKebabCase(property);
        const rule = this.findOrCreateRule(selector);

        if (rule) {
            rule.style.setProperty(kebabProperty, value);
            this.editor.recordStyleChange(this.selectedElement, property, '', value);
            await this.editor.saveCurrentCSS();
            return true;
        }
        return false;
    }

    /**
     * Add a new CSS rule for the selected element (without saving)
     * Used when moving inline styles to CSS
     * @param {string} property - CSS property (camelCase)
     * @param {string} value - CSS value
     * @returns {boolean} Whether rule was added
     */
    async addCSSRuleNoSave(property, value) {
        if (!this.selectedElement || !value) return false;

        const selector = this.getBestSelector();
        if (!selector) return false;

        const kebabProperty = this.toKebabCase(property);
        const rule = this.findOrCreateRule(selector);

        if (rule) {
            rule.style.setProperty(kebabProperty, value);
            return true;
        }
        return false;
    }

    /**
     * Setup a basic style input handler
     */
    setupStyleHandler(inputId, styleProp) {
        const input = this.$(inputId);
        if (!input) return;

        // Flag to prevent applying during UI update
        input._isUpdatingUI = false;
        // Track value before user interaction
        input._valueBeforeFocus = input.value || '';
        // For SELECT: track if dropdown was actually opened and option was clicked
        input._dropdownOpened = false;
        input._optionClicked = false;

        // Select all on focus/click (only for text inputs, not select elements)
        if (input.tagName === 'INPUT' && input.select) {
            input.addEventListener('focus', () => input.select());
            input.addEventListener('click', () => input.select());
        }

        // Track value when user focuses on the input
        input.addEventListener('focus', () => {
            input._valueBeforeFocus = input.value || '';
            input._elementAtFocus = this.selectedElement;
            if (input.tagName === 'SELECT') {
                input._dropdownOpened = true;
            }
        });

        // For SELECT elements: detect when an option is actually selected
        if (input.tagName === 'SELECT') {
            // mouseup on select means user clicked on an option
            input.addEventListener('mouseup', () => {
                if (input._dropdownOpened) {
                    input._optionClicked = true;
                }
            });

            // blur means dropdown closed
            input.addEventListener('blur', () => {
                input._dropdownOpened = false;
                input._elementAtFocus = null;
                // Reset after a short delay to allow change event to fire first
                setTimeout(() => {
                    input._optionClicked = false;
                }, 50);
            });
        }

        input.addEventListener('change', async (e) => {
            // Skip if this is a programmatic update from updateUI
            if (input._isUpdatingUI) {
                return;
            }

            // Use element from focus time, not current selection
            const targetElement = input._elementAtFocus || this.selectedElement;
            if (!targetElement) {
                return;
            }

            const newValue = e.target.value;

            // Skip if value hasn't actually changed from before focus
            if (input._valueBeforeFocus === newValue) {
                return;
            }

            // Use tracked oldValue from focus event for correct undo
            const oldValue = input._valueBeforeFocus || '';

            // Temporarily set selectedElement to target for applyStyleChange
            const originalSelected = this.editor.selectedElement;
            this.editor.selectedElement = targetElement;

            // ★ applyStyleChange 내부에서 cssRuleSnapshot으로 undo 기록
            // (recordStyleChange와 이중 기록 방지 - cssRuleSnapshot만 사용)
            await this.applyStyleChange(styleProp, newValue, oldValue);
            this.editor.selectedElement = originalSelected;

            input._valueBeforeFocus = newValue;
            input._optionClicked = false;
        });

        // Enter 키 처리 (INPUT 요소만, SELECT 제외)
        if (input.tagName === 'INPUT') {
            input.addEventListener('keydown', async (e) => {
                if (e.key !== 'Enter') return;
                if (input._isUpdatingUI) return;

                const targetElement = input._elementAtFocus || this.selectedElement;
                if (!targetElement) return;

                e.preventDefault();

                const newValue = input.value.trim();
                const oldValue = input._valueBeforeFocus || '';

                if (oldValue !== newValue) {
                    const originalSelected = this.editor.selectedElement;
                    this.editor.selectedElement = targetElement;

                    // ★ applyStyleChange 내부에서 cssRuleSnapshot으로 undo 기록
                    await this.applyStyleChange(styleProp, newValue, oldValue);

                    this.editor.selectedElement = originalSelected;
                    input._valueBeforeFocus = newValue;
                }

                input.blur();
            });
        }
    }

    /**
     * Parse a CSS value into numeric part and unit.
     * e.g. "16px" → { num: 16, unit: "px" }, "1.5em" → { num: 1.5, unit: "em" }
     * Returns null if not a numeric value.
     */
    _parseCSSValue(value) {
        if (!value) return null;
        const match = value.toString().trim().match(/^(-?\d+(?:\.\d+)?)\s*(px|%|em|rem|vw|vh|vmin|vmax|ch|ex|pt|cm|mm|in)?$/);
        if (!match) return null;
        return { num: parseFloat(match[1]), unit: match[2] || '' };
    }

    /**
     * Setup a style input handler that auto-adds 'px' to numeric values
     * and supports Arrow Up/Down to increment/decrement
     */
    setupStyleHandlerWithPx(inputId, styleProp) {
        const input = this.$(inputId);
        if (!input) return;

        input._isUpdatingUI = false;
        input._valueBeforeFocus = input.value || '';

        // Select all on focus/click
        input.addEventListener('focus', () => {
            input._valueBeforeFocus = input.value || '';
            input._elementAtFocus = this.selectedElement;
            input.select();
        });
        input.addEventListener('click', () => input.select());

        // Auto-add unit + apply on change
        input.addEventListener('change', async (e) => {
            if (input._isUpdatingUI) return;

            const targetElement = input._elementAtFocus || this.selectedElement;
            if (!targetElement) return;

            let value = e.target.value.trim();
            const oldValue = input._valueBeforeFocus || '';

            // If value is just a number, add the unit from the old value or default to px
            if (value && /^-?\d+(\.\d+)?$/.test(value)) {
                const oldParsed = this._parseCSSValue(oldValue);
                const unit = oldParsed?.unit || 'px';
                value = value + unit;
                e.target.value = value;
            }

            if (oldValue === value) return;

            const originalSelected = this.editor.selectedElement;
            this.editor.selectedElement = targetElement;
            await this.applyStyleChange(styleProp, value, oldValue);
            this.editor.selectedElement = originalSelected;

            input._valueBeforeFocus = value;
        });

        // Enter key + Arrow Up/Down
        input.addEventListener('keydown', async (e) => {
            if (input._isUpdatingUI) return;

            const targetElement = input._elementAtFocus || this.selectedElement;
            if (!targetElement) return;

            // Enter: apply and blur
            if (e.key === 'Enter') {
                e.preventDefault();
                let value = input.value.trim();
                const oldValue = input._valueBeforeFocus || '';

                if (value && /^-?\d+(\.\d+)?$/.test(value)) {
                    const oldParsed = this._parseCSSValue(oldValue);
                    const unit = oldParsed?.unit || 'px';
                    value = value + unit;
                    input.value = value;
                }

                if (oldValue !== value) {
                    const originalSelected = this.editor.selectedElement;
                    this.editor.selectedElement = targetElement;
                    await this.applyStyleChange(styleProp, value, oldValue);
                    this.editor.selectedElement = originalSelected;
                    input._valueBeforeFocus = value;
                }
                input.blur();
                return;
            }

            // Arrow Up/Down: increment/decrement
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();

                const currentValue = input.value.trim();
                let parsed = this._parseCSSValue(currentValue);

                // If current value is just a number without unit, infer from existing CSS or default px
                if (!parsed) {
                    // Try to parse as bare number
                    const bareNum = parseFloat(currentValue);
                    if (isNaN(bareNum)) return;
                    parsed = { num: bareNum, unit: '' };
                }

                // Determine unit: from parsed, or from old value, or default 'px'
                let unit = parsed.unit;
                if (!unit) {
                    const oldParsed = this._parseCSSValue(input._valueBeforeFocus);
                    unit = oldParsed?.unit || 'px';
                }

                // Step: Shift=10, Alt=0.1, default=1
                let step = 1;
                if (e.shiftKey) step = 10;
                else if (e.altKey) step = 0.1;

                const direction = e.key === 'ArrowUp' ? 1 : -1;
                let newNum = parsed.num + (step * direction);

                // Round to avoid float precision issues
                newNum = Math.round(newNum * 100) / 100;

                const newValue = newNum + unit;
                const oldValue = input._valueBeforeFocus || '';
                input.value = newValue;

                // Live preview without undo (undo recorded on blur/Enter)
                const originalSelected = this.editor.selectedElement;
                this.editor.selectedElement = targetElement;
                await this.applyStyleChangeNoUndo(styleProp, newValue);
                this.editor.selectedElement = originalSelected;
            }
        });

        // On blur after arrow key changes: commit with undo
        input.addEventListener('blur', async () => {
            if (input._isUpdatingUI) return;

            const targetElement = input._elementAtFocus || this.selectedElement;
            const currentValue = input.value.trim();
            const oldValue = input._valueBeforeFocus || '';

            if (targetElement && oldValue !== currentValue && currentValue) {
                const originalSelected = this.editor.selectedElement;
                this.editor.selectedElement = targetElement;
                await this.applyStyleChange(styleProp, currentValue, oldValue);
                this.editor.selectedElement = originalSelected;
                input._valueBeforeFocus = currentValue;
            }

            input._elementAtFocus = null;
        });
    }

    /**
     * Apply style change without recording undo (for real-time preview)
     */
    async applyStyleChangeNoUndo(styleProp, newValue) {
        if (!this.selectedElement) return;

        const state = this.currentState;
        let mediaBreakpoints = [...this.mediaQueryBreakpoints];
        const kebabProperty = this.toKebabCase(styleProp);

        // ★ non-PC 뷰포트 편집 시 자동 미디어쿼리 타겟팅 (멀티뷰/싱글뷰 공통)
        // non-PC 뷰포트에서 편집하면 해당 뷰포트의 미디어쿼리만 타겟
        let effectiveIsPCSelected = this.isPCSelected;
        const currentViewport = this.editor?.styleManager?.currentViewport;
        if (currentViewport && currentViewport !== 'pc') {
            const vpWidth = parseInt(currentViewport);
            if (vpWidth) {
                mediaBreakpoints = [vpWidth];
                effectiveIsPCSelected = false;
            }
        }

        // ★ Pseudo-class 상태이면 :hover/:focus/:active 규칙만 수정하고 반환
        // inline 스타일이나 base CSS 규칙은 건드리지 않음
        if (state) {
            // ★ recordStyleChange 등에서 설정된 inline 스타일 제거 (CSS 규칙으로만 처리)
            if (this.selectedElement.style[styleProp]) {
                this.selectedElement.style.removeProperty(kebabProperty);
            }

            const ruleInfo = this.getCSSRuleInfoWithState(styleProp, state, true);
            if (ruleInfo && ruleInfo.rule) {
                if (newValue) {
                    ruleInfo.rule.style.setProperty(kebabProperty, newValue);
                } else {
                    ruleInfo.rule.style.removeProperty(kebabProperty);
                }
            } else if (newValue) {
                // 기존 규칙 없으면 새로 생성 (실시간 미리보기용)
                await this.addCSSRuleWithState(styleProp, newValue, state);
            }
            // 동기화
            if (this.editor?.modules?.multiCanvas?._isInitialized) {
                this.editor.modules.multiCanvas.syncCSSToAllCanvases();
            }
            return;
        }

        // ★ PC 규칙 수정 전에 oldValue 저장 (preventCascade에서 사용)
        // newValue 적용 후에는 computed style이 변경되므로 미리 저장해야 함
        let oldValueForCascade = '';
        if (effectiveIsPCSelected && this.previewWindow && this.selectedElement) {
            const computed = this.previewWindow.getComputedStyle(this.selectedElement);
            oldValueForCascade = computed[styleProp] || '';
        }

        // Remove any existing inline style for this property (CSS takes over)
        if (this.selectedElement.style[styleProp]) {
            this.selectedElement.style.removeProperty(kebabProperty);
        }

        // Apply to media query breakpoints if any are selected
        // 멀티뷰 ON/OFF와 무관하게 체크박스 선택 기준으로 미디어쿼리 적용
        if (mediaBreakpoints.length > 0) {
            // ★ base 규칙에서 사용 중인 셀렉터 확인 (boosted 포함)
            // ★ generic 셀렉터(*, h2 등)는 미디어쿼리에 사용하지 않음
            const baseRuleInfo = this.getCSSRuleInfo(styleProp);
            let mediaSelector = (baseRuleInfo?.selector && !this.isGenericSelector(baseRuleInfo.selector))
                ? baseRuleInfo.selector : this.getBestSelector();

            // ★ 셀렉터가 없으면 고유 셀렉터 생성 (plain 요소 대응)
            if (!mediaSelector) {
                mediaSelector = this.getOrCreateUniqueSelector(null);
                if (!mediaSelector) {
                    const cls = this.generateUniqueClass();
                    this.selectedElement.classList.add(cls);
                    mediaSelector = '.' + cls;
                }
                // 멀티뷰: 새 클래스를 모든 iframe에 동기화
                if (this.editor?.modules?.multiCanvas?._isInitialized) {
                    this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
                }
            }

            for (const maxWidth of mediaBreakpoints) {
                if (maxWidth === 'pc') continue;

                if (newValue) {
                    await this.addCSSRuleInMediaQueryNoSave(styleProp, newValue, maxWidth, mediaSelector);
                } else {
                    if (mediaSelector) {
                        const rule = this.findOrCreateRuleInMediaQuery(mediaSelector, maxWidth);
                        if (rule) {
                            rule.style.removeProperty(kebabProperty);
                        }
                    }
                }
            }

            // ★ boosted base 셀렉터가 media query 규칙을 오버라이드하지 않도록 보존
            // 기존에 non-boosted 셀렉터로 만들어진 media query 규칙도 보호
            if (baseRuleInfo?.selector) {
                this._preserveMediaQueryValues(baseRuleInfo.selector, kebabProperty);
            }

            if (this.editor?.modules?.multiCanvas?._isInitialized) {
                this.editor.modules.multiCanvas.syncCSSToAllCanvases();
            }
        }

        // PC 미선택이면 동기화만 하고 반환
        if (!effectiveIsPCSelected) {
            if (this.editor?.modules?.multiCanvas?._isInitialized) {
                this.editor.modules.multiCanvas.syncCSSToAllCanvases();
            }
            return;
        }

        // Default state - update CSS rule
        // ★ 먼저 현재 실제로 적용된 CSS 규칙을 찾음 (specificity가 높은 규칙)
        const existingRuleInfo = this.getCSSRuleInfo(styleProp);
        // ★ 셀렉터 고유성 판단은 mainDoc 기준 (CSS 쓰기 대상과 동일 문서)
        const noUndoDoc = this._getMainDoc();

        // ★ 고유성 검증: 기존 규칙의 셀렉터가 공유(비고유)면 고유 셀렉터로 대체
        const isExistingUnique = existingRuleInfo &&
            !this.isGenericSelector(existingRuleInfo.selector) &&
            this.isSelectorUnique(existingRuleInfo.selector, noUndoDoc);

        if (isExistingUnique) {
            // 고유 셀렉터 → 기존 규칙 직접 수정
            const rule = this.findOrCreateRule(existingRuleInfo.selector);
            if (rule) {
                if (newValue) {
                    this._cleanupGapConflict(rule, kebabProperty);
                    rule.style.setProperty(kebabProperty, newValue);
                } else {
                    rule.style.removeProperty(kebabProperty);
                }
            } else {
                if (newValue) {
                    this.selectedElement.style.setProperty(kebabProperty, newValue);
                } else {
                    this.selectedElement.style.removeProperty(kebabProperty);
                }
            }
        } else {
            // 기존 규칙 없거나 generic/비고유 → 고유 셀렉터 확보
            // ★ 기존 공유 셀렉터를 전달하여 specificity boosting
            const sharedSelector = existingRuleInfo?.selector || null;
            let bestSelector = this.getOrCreateUniqueSelector(sharedSelector);
            if (!bestSelector) {
                // fallback (selectedElement가 null 등 극단적 케이스)
                const generatedClass = this.generateUniqueClass();
                this.selectedElement.classList.add(generatedClass);
                bestSelector = '.' + generatedClass;
            }

            // ★ 멀티뷰: 클래스를 모든 iframe의 같은 요소에 동기화
            if (this.editor?.modules?.multiCanvas?._isInitialized) {
                this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
            }

            const rule = this.findOrCreateRule(bestSelector);
            if (rule) {
                if (newValue) {
                    this._cleanupGapConflict(rule, kebabProperty);
                    rule.style.setProperty(kebabProperty, newValue);
                } else {
                    rule.style.removeProperty(kebabProperty);
                }
            } else {
                if (newValue) {
                    this.selectedElement.style.setProperty(kebabProperty, newValue);
                } else {
                    this.selectedElement.style.removeProperty(kebabProperty);
                }
            }
        }

        // ★★★ PC 규칙 수정 후 cascade prevention (syncCSSToAllCanvases 전에 실행해야 함!)
        // OFF 상태인 다른 뷰포트가 기본 규칙(PC)을 상속받지 않도록
        this.editor?.styleManager?.updateAvailableBreakpoints?.();
        const allBreakpoints = this.editor?.styleManager?.getAllBreakpoints?.() || [];
        const selectorForCascade = isExistingUnique ? existingRuleInfo.selector : (this.getOrCreateUniqueSelector(existingRuleInfo?.selector) || this.getBestSelector());
        if (allBreakpoints.length > 0 && selectorForCascade && oldValueForCascade) {
            await this.preventCascade(styleProp, oldValueForCascade, selectorForCascade);
        }

        // ★ boosted 셀렉터가 media query 규칙을 오버라이드하지 않도록 보존
        if (selectorForCascade) {
            this._preserveMediaQueryValues(selectorForCascade, kebabProperty);
        }

        // ★ 멀티뷰: cascade prevention 후 CSS 동기화
        if (this.editor?.modules?.multiCanvas?._isInitialized) {
            this.editor.modules.multiCanvas.syncCSSToAllCanvases();
        }

        // Update overlay to reflect size/position changes in real-time
        if (this.editor.updateOverlay) {
            this.editor.updateOverlay();
        }

        // Force reflow to ensure media query rules are applied immediately
        // Without this, CSSOM changes to media queries may not render until user interaction
        if (mediaBreakpoints.length > 0 && this.selectedElement) {
            // Reading offsetHeight forces the browser to recalculate styles
            void this.selectedElement.offsetHeight;
        }
    }

    /**
     * Setup a button group handler for style properties
     */
    setupButtonGroup(groupId, styleProp, options = {}) {
        const group = this.$(groupId);
        if (!group) {
            console.warn('[setupButtonGroup] Group not found:', groupId);
            return;
        }

        const { onBeforeChange, onAfterChange } = options;

        group.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!this.selectedElement) return;

                const oldValue = this.getEffectiveCSSValue(styleProp).value;
                const isActive = btn.classList.contains('active');
                const value = isActive ? '' : btn.dataset.value;

                if (onBeforeChange) {
                    onBeforeChange(value, oldValue);
                }

                // Update button states
                group.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                if (!isActive) {
                    btn.classList.add('active');
                }

                // ★ applyStyleChange 내부에서 cssRuleSnapshot으로 undo 기록
                // (recordStyleChange와 이중 기록 방지 - cssRuleSnapshot만 사용)
                await this.applyStyleChange(styleProp, value, oldValue);

                if (onAfterChange) {
                    onAfterChange(value, oldValue);
                }
            });
        });
    }

    /**
     * Setup a color picker with linked text input
     */
    setupColorPicker(pickerId, textId, styleProp) {
        const picker = this.$(pickerId);
        const textInput = this.$(textId);

        if (picker && textInput) {
            // Flag to prevent applying color during UI update
            picker._isUpdatingUI = false;
            // Track last value to detect actual changes
            picker._lastValue = picker.value;
            // Track if user is actively interacting with picker
            picker._userInteracting = false;

            // Track when user starts interacting
            picker.addEventListener('mousedown', () => {
                picker._userInteracting = true;
                picker._valueBeforeFocus = picker.value;
                picker._elementAtFocus = this.selectedElement;

                // ★ 실시간 미리보기 전에 oldRules 미리 수집 (applyStyleChangeNoUndo가 CSS를 먼저 변경하므로)
                // 반드시 여기서 수집해야 함: input 이벤트의 applyStyleChangeNoUndo가 CSS를 변경한 뒤
                // change 이벤트의 applyStyleChange에서 수집하면 이미 변경된 값이 old로 잡힘
                const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
                const mainDoc = mainFrame?.contentDocument;
                const undoRedo = this.editor.modules?.undoRedo;
                if (mainDoc && undoRedo && this.selectedElement) {
                    // getCSSRuleInfo로 가장 높은 specificity 규칙의 셀렉터를 우선 사용
                    const ruleInfo = this.getCSSRuleInfo(styleProp);
                    const targetSelector = ruleInfo?.selector || this.getBestSelector();
                    if (targetSelector) {
                        picker._oldRulesBeforeFocus = undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc);
                    } else {
                        // 셀렉터 없음 = CSS 규칙 없음 → 빈 객체 (undo 시 속성 제거됨)
                        picker._oldRulesBeforeFocus = {};
                    }
                    picker._selectorAtFocus = targetSelector;
                    console.log('[setupColorPicker] Collected oldRules on mousedown:', picker._oldRulesBeforeFocus);
                }
            });

            // Real-time preview without undo recording
            picker.addEventListener('input', async (e) => {
                // Skip if this is a programmatic update from updateUI
                if (picker._isUpdatingUI) return;
                // Skip if user hasn't actually started interacting
                if (!picker._userInteracting) return;

                const newValue = e.target.value;
                textInput.value = newValue;

                // Use element from mousedown time, not current selection
                const targetElement = picker._elementAtFocus || this.selectedElement;
                if (targetElement) {
                    // Temporarily set selectedElement for applyStyleChangeNoUndo
                    const originalSelected = this.editor.selectedElement;
                    this.editor.selectedElement = targetElement;
                    // Apply without recording undo (will record on change)
                    await this.applyStyleChangeNoUndo(styleProp, newValue);
                    this.editor.selectedElement = originalSelected;
                }
            });

            // Record undo on change (when user finishes selecting)
            picker.addEventListener('change', async () => {
                if (!picker._userInteracting) return;

                const newValue = picker.value;
                const oldValue = picker._valueBeforeFocus || '';

                // Use element from mousedown time, not current selection
                const targetElement = picker._elementAtFocus || this.selectedElement;
                if (targetElement && oldValue !== newValue) {
                    // Temporarily set selectedElement for applyStyleChange
                    const originalSelected = this.editor.selectedElement;
                    this.editor.selectedElement = targetElement;
                    // ★ mousedown에서 미리 수집한 oldRules를 전달 (실시간 미리보기로 이미 CSS가 변경된 상태이므로)
                    const preCollectedOldRules = picker._oldRulesBeforeFocus || null;
                    await this.applyStyleChange(styleProp, newValue, oldValue, preCollectedOldRules);
                    this.editor.selectedElement = originalSelected;
                }

                picker._userInteracting = false;
                picker._valueBeforeFocus = newValue;
                picker._elementAtFocus = null;
                picker._oldRulesBeforeFocus = null;
                picker._selectorAtFocus = null;
            });
        }
    }

    /**
     * Safely set color picker value without triggering input event
     */
    setColorPickerValue(pickerId, value) {
        const picker = this.$(pickerId);
        if (picker) {
            picker._isUpdatingUI = true;
            picker._userInteracting = false;
            picker.value = value;
            picker._lastValue = value; // Update last value to prevent false positives
            // Use setTimeout to reset flag after current call stack
            setTimeout(() => {
                picker._isUpdatingUI = false;
            }, 0);
        }
    }

    /**
     * Convert RGB color to hex
     */
    rgbToHex(rgb) {
        if (!rgb || rgb.startsWith('#')) return rgb || '#000000';
        const match = rgb.match(/\d+/g);
        if (!match || match.length < 3) return '#000000';
        const r = parseInt(match[0]).toString(16).padStart(2, '0');
        const g = parseInt(match[1]).toString(16).padStart(2, '0');
        const b = parseInt(match[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    /**
     * Log CSSOM state of all iframes after style change
     * @param {string} styleProp - The CSS property that was changed
     */
    _logAllIframesCSSOM(styleProp) {
        console.log('='.repeat(80));
        console.log(`[CSSOM DEBUG] Style changed: ${styleProp}`);
        console.log('='.repeat(80));

        // Get all iframes from MultiCanvasManager
        const multiCanvas = this.editor?.modules?.multiCanvas;
        if (!multiCanvas) {
            console.log('[CSSOM DEBUG] MultiCanvasManager not available');
            return;
        }

        const iframes = multiCanvas.getIframes ? multiCanvas.getIframes() : [];
        console.log(`[CSSOM DEBUG] Total iframes: ${iframes.length}`);

        if (iframes.length === 0) {
            // Single iframe mode - use previewWindow
            console.log('[CSSOM DEBUG] Single iframe mode');
            this._logSingleIframeCSSOM(this.previewWindow, 'Main Preview', null);
        } else {
            // Multi-view mode
            iframes.forEach((iframe, index) => {
                const width = iframe.style.width || iframe.dataset.width || 'unknown';
                const label = `iframe[${index}] (style.width=${width})`;
                const win = iframe.contentWindow;
                this._logSingleIframeCSSOM(win, label, iframe);
            });
        }

        console.log('='.repeat(80));
    }

    /**
     * Log CSSOM state of a single iframe
     * @param {Window} win - The iframe's window object
     * @param {string} label - Label for this iframe in logs
     * @param {HTMLIFrameElement|null} iframe - The iframe element
     */
    _logSingleIframeCSSOM(win, label, iframe) {
        console.log('-'.repeat(60));
        console.log(`[CSSOM] ${label}`);

        if (!win || !win.document) {
            console.log(`  Window not available`);
            return;
        }

        // Log iframe dimensions
        console.log(`  innerWidth: ${win.innerWidth}px, innerHeight: ${win.innerHeight}px`);
        if (iframe) {
            const rect = iframe.getBoundingClientRect();
            console.log(`  iframe rect: ${rect.width}x${rect.height}`);
        }

        const doc = win.document;
        const tempStyle = doc.getElementById('zaemit-temp-styles');

        if (!tempStyle) {
            console.log(`  zaemit-temp-styles: NOT FOUND`);
            return;
        }

        if (!tempStyle.sheet) {
            console.log(`  zaemit-temp-styles: found but NO SHEET`);
            console.log(`  textContent: ${tempStyle.textContent}`);
            return;
        }

        const sheet = tempStyle.sheet;
        const rules = sheet.cssRules || sheet.rules;

        console.log(`  zaemit-temp-styles: ${rules.length} rules`);

        // Group rules by type
        const baseRules = [];
        const mediaRules = {};

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];

            // CSSRule.MEDIA_RULE = 4, CSSRule.STYLE_RULE = 1
            if (rule.type === 4) {
                // Media query rule
                const mediaText = rule.conditionText || rule.media?.mediaText || 'unknown';
                if (!mediaRules[mediaText]) {
                    mediaRules[mediaText] = [];
                }
                // Get inner rules
                const innerRules = rule.cssRules || [];
                for (let j = 0; j < innerRules.length; j++) {
                    mediaRules[mediaText].push(innerRules[j].cssText);
                }
            } else if (rule.type === 1) {
                // Regular style rule
                baseRules.push(rule.cssText);
            }
        }

        // Log base rules
        if (baseRules.length > 0) {
            console.log(`  [Base Rules] (${baseRules.length})`);
            baseRules.forEach(rule => console.log(`    ${rule}`));
        }

        // Log media query rules
        const mediaKeys = Object.keys(mediaRules).sort((a, b) => {
            // Extract max-width values and sort descending
            const aMatch = a.match(/max-width:\s*(\d+)px/i);
            const bMatch = b.match(/max-width:\s*(\d+)px/i);
            const aWidth = aMatch ? parseInt(aMatch[1]) : 9999;
            const bWidth = bMatch ? parseInt(bMatch[1]) : 9999;
            return bWidth - aWidth;
        });

        if (mediaKeys.length > 0) {
            mediaKeys.forEach(mediaText => {
                // Check if this media query matches current viewport
                const match = mediaText.match(/max-width:\s*(\d+)px/i);
                const maxWidth = match ? parseInt(match[1]) : null;
                const isActive = maxWidth ? win.innerWidth <= maxWidth : false;
                const activeMarker = isActive ? ' ✓ ACTIVE' : '';

                console.log(`  [@media (${mediaText})]${activeMarker} (${mediaRules[mediaText].length} rules)`);
                mediaRules[mediaText].forEach(rule => console.log(`    ${rule}`));
            });
        } else {
            console.log(`  [Media Queries] NONE`);
        }
    }

    /**
     * Get CSS rule value for the selected element from stylesheets
     * This returns the actual CSS value (like "100vh") instead of computed pixels
     * @param {string} property - CSS property name (camelCase like 'minHeight' or kebab-case like 'min-height')
     * @returns {string} The CSS value from stylesheet rules, or empty string if not found
     */
    getCSSRuleValue(property) {
        const ruleInfo = this.getCSSRuleInfo(property);
        return ruleInfo ? ruleInfo.value : '';
    }

    /**
     * Get computed value without :hover contamination.
     * 마우스 hover 상태에서 클릭하면 getComputedStyle이 :hover CSS를 반영하므로,
     * 해당 속성만 :hover 규칙에서 임시 제거 후 clean computed 값을 읽고 복원.
     * 상속 속성(color, font-*, text-* 등)은 조상 요소의 :hover 규칙도 처리.
     * 속성 단위 조작이므로 레이아웃/100vh에 영향 없음.
     * @param {string} prop - CSS property name (camelCase)
     * @returns {string} Clean computed value
     */
    getCleanComputedValue(prop) {
        const element = this.selectedElement;
        if (!element) return '';

        const win = element.ownerDocument?.defaultView;
        if (!win) return '';

        // hover 상태가 아니면 computed는 깨끗함
        let isHovered = false;
        try { isHovered = element.matches(':hover'); } catch (e) { /* skip */ }
        if (!isHovered) {
            return win.getComputedStyle(element)[prop] || '';
        }

        const doc = element.ownerDocument;
        const kebabProp = this.toKebabCase(prop);

        // 상속 속성은 조상 요소의 :hover 규칙도 확인해야 함
        // (자식 hover → 부모도 hover → 부모의 :hover { color } 이 자식에 상속)
        const inheritedProps = [
            'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
            'textDecoration', 'textDecorationLine', 'textTransform', 'textAlign',
            'lineHeight', 'letterSpacing', 'cursor', 'visibility'
        ];
        const checkAncestors = inheritedProps.includes(prop);

        // hover 중인 요소 목록 수집 (선택 요소 + 상속 속성이면 조상도)
        const hoveredElements = [element];
        if (checkAncestors) {
            let parent = element.parentElement;
            while (parent && parent !== doc.documentElement) {
                try {
                    if (parent.matches(':hover')) {
                        hoveredElements.push(parent);
                    }
                } catch (e) { break; }
                parent = parent.parentElement;
            }
        }

        // 모든 hover 요소의 :hover 규칙에서 해당 속성 임시 제거
        const saved = []; // { rule, value, priority }

        try {
            const sheets = Array.from(doc.styleSheets);
            for (let si = 0; si < sheets.length; si++) {
                let rules;
                try { rules = sheets[si].cssRules || sheets[si].rules; } catch (e) { continue; }
                if (!rules) continue;

                for (let ri = 0; ri < rules.length; ri++) {
                    const rule = rules[ri];

                    // top-level :hover 규칙
                    if (rule.type === 1 && rule.selectorText && rule.selectorText.includes(':hover')) {
                        this._neutralizeHoverProp(rule, hoveredElements, doc, kebabProp, saved);
                    }

                    // @media 내부 :hover 규칙
                    if (rule.type === 4 && rule.cssRules) {
                        for (let ii = 0; ii < rule.cssRules.length; ii++) {
                            const innerRule = rule.cssRules[ii];
                            if (innerRule.type === 1 && innerRule.selectorText && innerRule.selectorText.includes(':hover')) {
                                this._neutralizeHoverProp(innerRule, hoveredElements, doc, kebabProp, saved);
                            }
                        }
                    }
                }
            }
        } catch (e) { /* skip */ }

        if (saved.length === 0) {
            return win.getComputedStyle(element)[prop] || '';
        }

        // ★ transition 임시 비활성화 (hover 속성 제거 시 전환 애니메이션 방지)
        // CSS `transition: 0.25s` 등이 있으면 hover 제거 후에도 computed 값이
        // 즉시 변경되지 않고 중간 애니메이션 값을 반환하는 문제 해결
        const savedTransition = element.style.getPropertyValue('transition');
        const savedTransitionPriority = element.style.getPropertyPriority('transition');
        element.style.setProperty('transition', 'none', 'important');
        void element.offsetHeight; // reflow 강제

        // clean computed 값 읽기
        const cleanValue = win.getComputedStyle(element)[prop] || '';

        // transition 복원
        if (savedTransition) {
            element.style.setProperty('transition', savedTransition, savedTransitionPriority);
        } else {
            element.style.removeProperty('transition');
        }

        // :hover 속성 복원 (shorthand 대응: item.property 사용)
        for (const item of saved) {
            item.rule.style.setProperty(item.property, item.value, item.priority);
        }

        return cleanValue;
    }

    /**
     * Helper: :hover 규칙에서 속성 임시 제거 (hoveredElements 중 매치되는 요소가 있으면)
     * CSS 변수(var()) 포함 shorthand는 브라우저가 longhand로 분해하지 않으므로
     * longhand가 없으면 관련 shorthand도 검색.
     */
    _neutralizeHoverProp(rule, hoveredElements, doc, kebabProp, saved) {
        let val = rule.style.getPropertyValue(kebabProp);
        let actualProp = kebabProp;

        // var() 포함 shorthand 대응: longhand가 없으면 관련 shorthand 확인
        if (!val) {
            const shorthands = this._getRelatedShorthands(kebabProp);
            for (const sh of shorthands) {
                val = rule.style.getPropertyValue(sh);
                if (val) {
                    actualProp = sh;
                    break;
                }
            }
        }

        if (!val) return;
        for (const el of hoveredElements) {
            if (this.selectorWithStateMatchesElement(rule.selectorText, ':hover', el, doc)) {
                saved.push({ rule, property: actualProp, value: val, priority: rule.style.getPropertyPriority(actualProp) });
                rule.style.removeProperty(actualProp);
                return; // 한 규칙당 한 번만 제거
            }
        }
    }

    /**
     * longhand CSS 속성에 대응하는 shorthand 목록 반환.
     * CSS 변수가 포함된 shorthand는 longhand로 분해되지 않으므로 fallback 검색에 사용.
     * @param {string} kebabProp - longhand CSS property (kebab-case)
     * @returns {string[]} 관련 shorthand 속성 목록 (우선순위 순)
     */
    _getRelatedShorthands(kebabProp) {
        const shorthands = [];

        // border-top-color → border-color, border-top, border
        const borderLonghand = kebabProp.match(/^border-(top|right|bottom|left)-(.+)$/);
        if (borderLonghand) {
            shorthands.push(`border-${borderLonghand[2]}`);  // border-color
            shorthands.push(`border-${borderLonghand[1]}`);  // border-top
            shorthands.push('border');
        }

        // margin-top → margin, padding-top → padding
        const boxMatch = kebabProp.match(/^(margin|padding)-(top|right|bottom|left)$/);
        if (boxMatch) {
            shorthands.push(boxMatch[1]);
        }

        // background-color → background
        if (kebabProp.startsWith('background-')) {
            shorthands.push('background');
        }

        // font-family, font-size → font
        if (kebabProp.startsWith('font-') && kebabProp !== 'font') {
            shorthands.push('font');
        }

        return shorthands;
    }

    /**
     * CSS 변수(var(--name))를 실제 값으로 해석.
     * 요소에 임시 인라인 스타일로 적용 후 getComputedStyle로 계산된 값을 읽음.
     * hover 상태와 무관하게 변수값을 해석할 수 있음.
     * @param {string} varValue - CSS 변수 포함 값 (예: 'var(--c-primary)')
     * @param {string} prop - CSS property name (camelCase, 예: 'color')
     * @returns {string} Resolved CSS value, or empty string on failure
     */
    _resolveCSSVariable(varValue, prop) {
        const element = this.selectedElement;
        if (!element || !varValue) return '';

        const win = element.ownerDocument?.defaultView;
        if (!win) return '';

        const kebabProp = this.toKebabCase(prop);

        // 기존 인라인 값 백업
        const savedValue = element.style.getPropertyValue(kebabProp);
        const savedPriority = element.style.getPropertyPriority(kebabProp);

        // CSS 변수를 인라인 !important로 임시 적용
        element.style.setProperty(kebabProp, varValue, 'important');

        // computed 값 읽기
        const resolved = win.getComputedStyle(element)[prop] || '';

        // 인라인 값 복원
        if (savedValue) {
            element.style.setProperty(kebabProp, savedValue, savedPriority);
        } else {
            element.style.removeProperty(kebabProp);
        }

        return resolved;
    }

    /**
     * Get CSS value from applicable media queries at the current viewport width.
     * Uses classic for loops (same pattern as getCSSRuleInfoInMediaQuery).
     * Returns the last matching value in source order (CSS cascade: later wins for same specificity).
     * @param {string} property - CSS property name (camelCase)
     * @returns {string|null} The media query CSS value, or null if no media query overrides
     */
    _getMediaQueryOverrideValue(property) {
        if (!this.selectedElement || !this.previewWindow) return null;

        const viewportWidth = this.previewWindow.innerWidth;
        if (!viewportWidth) return null;

        const doc = this.previewWindow.document;
        const element = this.selectedElement;
        const kebabProp = this.toKebabCase(property);

        let lastMatch = null;

        try {
            const sheets = Array.from(doc.styleSheets);
            for (let si = 0; si < sheets.length; si++) {
                let rules;
                try { rules = sheets[si].cssRules || sheets[si].rules; } catch (e) { continue; }
                if (!rules) continue;

                for (let ri = 0; ri < rules.length; ri++) {
                    if (rules[ri].type !== 4) continue; // CSSMediaRule only

                    const conditionText = rules[ri].conditionText || (rules[ri].media && rules[ri].media.mediaText) || '';
                    const match = conditionText.match(/max-width:\s*(\d+)px/i);
                    if (!match) continue;

                    const mqMaxWidth = parseInt(match[1]);
                    if (viewportWidth > mqMaxWidth) continue; // This media query doesn't apply

                    // This media query applies - check inner rules
                    const innerRules = rules[ri].cssRules;
                    for (let ii = 0; ii < innerRules.length; ii++) {
                        if (innerRules[ii].type !== 1) continue;

                        try {
                            if (this.selectorMatchesElement(innerRules[ii].selectorText, element, doc)) {
                                let val = innerRules[ii].style.getPropertyValue(kebabProp);
                                // ★ CSS 변수 shorthand 대응
                                if (!val) {
                                    val = this._resolveFromShorthand(innerRules[ii], kebabProp);
                                }
                                if (val) {
                                    lastMatch = val;
                                }
                            }
                        } catch (e) { continue; }
                    }
                }
            }
        } catch (e) {}

        return lastMatch;
    }

    /**
     * Get the main stylesheet for editing (always uses zaemit-temp-styles)
     * External stylesheets (style.css) cannot be saved through CSSOM modifications,
     * so we always use the temp style tag and merge to file on save.
     *
     * 중요: 멀티뷰 모드에서도 항상 mainIframe(previewFrame)의 zaemit-temp-styles 사용
     * 이유: CSS는 모든 뷰에서 공유되는 하나의 파일이므로 mainIframe에서 관리
     * syncCSSToAllCanvases()가 mainIframe에서 읽어서 다른 iframe에 동기화함
     *
     * @returns {CSSStyleSheet|null}
     */
    /**
     * CSS 쓰기 대상인 mainIframe의 document 반환
     * 셀렉터 고유성 판단도 이 문서 기준으로 수행해야 함 (판단-기록 문서 일치)
     */
    _getMainDoc() {
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        return mainFrame?.contentDocument || this.previewWindow?.document;
    }

    getMainStylesheet() {
        // 멀티뷰 모드에서도 항상 mainIframe의 zaemit-temp-styles 사용
        // mainIframe은 CSS 저장용으로 항상 고정된 iframe (setActiveIframe으로 변경 안 됨)
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        // ★ 항상 mainFrame의 document만 사용 (this.previewWindow는 활성 iframe이므로 사용하면 안 됨)
        const doc = mainFrame?.contentDocument;
        if (!doc) {
            console.warn('[getMainStylesheet] mainFrame.contentDocument is null');
            return null;
        }

        // Always use zaemit-temp-styles for editing
        // External stylesheets (style.css) CSSOM changes don't persist to file
        let tempStyle = doc.getElementById('zaemit-temp-styles');
        if (tempStyle) {
            return tempStyle.sheet;
        }

        // Create new temp style tag
        tempStyle = doc.createElement('style');
        tempStyle.id = 'zaemit-temp-styles';
        (doc.head || doc.documentElement).appendChild(tempStyle);
        return tempStyle.sheet;
    }

    /**
     * Find or create a CSS rule for the given selector in the main stylesheet
     * @param {string} selector - CSS selector
     * @returns {CSSStyleRule|null}
     */
    findOrCreateRule(selector) {
        const mainSheet = this.getMainStylesheet();
        if (!mainSheet || !selector) return null;

        try {
            // First, check if rule with this selector already exists
            for (const rule of mainSheet.cssRules) {
                if (rule.type === 1 && rule.selectorText === selector) {
                    return rule;
                }
            }

            // No existing rule, create new one
            // IMPORTANT: Insert BEFORE media queries so base rules don't override them
            // (CSS specificity: when equal, last rule wins - media queries must come after base rules)
            let insertIndex = mainSheet.cssRules.length;
            for (let i = 0; i < mainSheet.cssRules.length; i++) {
                if (mainSheet.cssRules[i].type === 4) { // CSSMediaRule
                    insertIndex = i;
                    break;
                }
            }

            const ruleText = `${selector} { }`;
            const index = mainSheet.insertRule(ruleText, insertIndex);
            return mainSheet.cssRules[index];
        } catch (e) {
            console.warn('Failed to find/create CSS rule:', e);
            return null;
        }
    }

    /**
     * Find or create a CSS rule for the given selector within a media query
     * @param {string} selector - CSS selector
     * @param {number} maxWidth - Max width for the media query
     * @returns {CSSStyleRule|null}
     */
    findOrCreateRuleInMediaQuery(selector, maxWidth) {
        if (!selector) return null;

        const mediaRule = this.findOrCreateMediaRule(maxWidth);
        if (!mediaRule) return null;

        try {
            // First, check if rule with this selector already exists in the media query
            for (const rule of mediaRule.cssRules) {
                if (rule.type === 1 && rule.selectorText === selector) {
                    return rule;
                }
            }

            // No existing rule, create new one inside media query
            const ruleText = `${selector} { }`;
            const index = mediaRule.insertRule(ruleText, mediaRule.cssRules.length);
            return mediaRule.cssRules[index];
        } catch (e) {
            console.warn('Failed to find/create CSS rule in media query:', e);
            return null;
        }
    }

    /**
     * Get detailed CSS rule info for a property
     * @param {string} property - CSS property name (camelCase)
     * @returns {object|null} { value, selector, rule, ruleIndex, sheetIndex } or null
     */
    getCSSRuleInfo(property) {
        if (!this.selectedElement || !this.previewWindow) return null;

        const element = this.selectedElement;
        // active iframe에서 CSS 읽기
        const doc = this.previewWindow.document;

        // Convert camelCase to kebab-case for CSS matching
        const kebabProperty = this.toKebabCase(property);

        // Store matched rules with specificity and location info
        const matchedRules = [];

        try {
            // Iterate through all stylesheets
            const sheets = Array.from(doc.styleSheets);
            for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
                const sheet = sheets[sheetIndex];
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
                        const rule = rules[ruleIndex];
                        if (rule.type !== 1) continue; // Only style rules (type 1)

                        // ★ pseudo-class 규칙 제외 (hover 상태에서 매칭 방지)
                        // :hover/:focus/:active 규칙은 getCSSRuleInfoWithState()로 별도 조회
                        const sel = rule.selectorText;
                        if (sel && (sel.includes(':hover') || sel.includes(':focus') || sel.includes(':active'))) continue;

                        // Check if this rule's selector matches the element
                        if (this.selectorMatchesElement(sel, element, doc)) {
                            let value = rule.style.getPropertyValue(kebabProperty);
                            // ★ CSS 변수 shorthand 대응: longhand가 없으면 shorthand에서 추출
                            if (!value) {
                                value = this._resolveFromShorthand(rule, kebabProperty);
                            }
                            if (value) {
                                // ★ 콤마 구분 셀렉터 처리: 매칭되는 개별 부분만 사용
                                // "*, ::before, ::after"에서 실제 매칭은 "*"뿐이므로
                                // specificity를 [0,0,0]으로 정확히 계산
                                const matchingSel = this._getMatchingIndividualSelector(sel, element);
                                const specificity = this.calculateSpecificity(matchingSel);
                                matchedRules.push({
                                    value,
                                    specificity,
                                    selector: matchingSel,
                                    rule,
                                    ruleIndex,
                                    sheetIndex,
                                    sheet
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin stylesheet, skip
                    continue;
                }
            }
        } catch (e) {
            console.warn('Error reading stylesheets:', e);
        }

        // Return the rule with highest specificity
        if (matchedRules.length > 0) {
            matchedRules.sort((a, b) => {
                // Compare specificity arrays [ids, classes, elements]
                for (let i = 0; i < 3; i++) {
                    if (b.specificity[i] !== a.specificity[i]) {
                        return b.specificity[i] - a.specificity[i];
                    }
                }
                // If same specificity, prefer later rules (higher sheet/rule index)
                if (b.sheetIndex !== a.sheetIndex) {
                    return b.sheetIndex - a.sheetIndex;
                }
                return b.ruleIndex - a.ruleIndex;
            });
            return matchedRules[0];
        }

        return null;
    }

    /**
     * 같은 selector의 다른 규칙들에서 특정 property 제거 (중복 방지)
     * @param {string} selector - CSS selector
     * @param {string} property - CSS property (camelCase)
     * @param {CSSStyleRule} excludeRule - 제외할 규칙 (값을 설정한 규칙)
     */
    removePropertyFromOtherRules(selector, property, excludeRule) {
        const doc = this.previewWindow?.document;
        if (!doc) return;

        const kebabProperty = this.toKebabCase(property);

        for (const sheet of doc.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule.type !== 1) continue;  // Only style rules
                    if (rule === excludeRule) continue;  // 값을 설정한 규칙 제외
                    if (rule.selectorText !== selector) continue;  // 같은 selector만

                    // 같은 selector의 다른 규칙에서 property 제거
                    if (rule.style.getPropertyValue(kebabProperty)) {
                        // ★ gap shorthand 보호: column-gap/row-gap 제거 시
                        // gap shorthand에서 파생된 값이면 shorthand를 분리하여
                        // 나머지 longhand는 보존 (removeProperty가 shorthand 전체를 파괴하는 것 방지)
                        this._splitGapBeforeRemove(rule, kebabProperty);
                        rule.style.removeProperty(kebabProperty);
                    }
                }
            } catch (e) { /* CORS */ }
        }
    }

    /**
     * gap shorthand에서 파생된 longhand를 제거하기 전에 shorthand를 분리
     * CSSOM에서 removeProperty('column-gap') 호출 시 gap shorthand 전체가 파괴되어
     * row-gap까지 사라지는 문제 방지
     * @param {CSSStyleRule} rule - CSS rule
     * @param {string} kebabProp - 제거할 longhand property (column-gap 또는 row-gap)
     */
    _splitGapBeforeRemove(rule, kebabProp) {
        if (kebabProp !== 'column-gap' && kebabProp !== 'row-gap') return;
        const gapValue = rule.style.getPropertyValue('gap');
        if (!gapValue) return;

        // gap shorthand 파싱: "20px" 또는 "10px 20px" (row-gap column-gap)
        const parts = gapValue.trim().split(/\s+/);
        const rowGapVal = parts[0];
        const colGapVal = parts.length > 1 ? parts[1] : parts[0];

        // shorthand 제거 후 나머지 longhand만 보존
        rule.style.removeProperty('gap');
        if (kebabProp === 'column-gap') {
            rule.style.setProperty('row-gap', rowGapVal);
        } else {
            rule.style.setProperty('column-gap', colGapVal);
        }
    }

    /**
     * 부스팅된 base 셀렉터가 미디어쿼리 규칙을 오버라이드하지 않도록 보존
     * base 셀렉터 specificity([0,2,0])가 미디어쿼리 내 원본 셀렉터([0,1,0])보다 높으면,
     * 미디어쿼리 내에 동일 부스팅 셀렉터로 기존 값을 복사하여 cascade 보호
     * @param {string} boostedSelector - 부스팅된 base 셀렉터 (예: .section-title.h2-m5jv2v)
     * @param {string} kebabProperty - CSS property (kebab-case)
     */
    _preserveMediaQueryValues(boostedSelector, kebabProperty) {
        const el = this.selectedElement;
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const doc = mainFrame?.contentDocument;
        if (!el || !doc) return;

        // 부스팅 셀렉터가 아니면 (단일 클래스 등) 미디어쿼리 오버라이드 가능성 낮음
        const boostedSpec = this.calculateSpecificity(boostedSelector);

        // ★ gap shorthand/longhand: 관련 속성도 함께 검사
        // base에서 gap을 변경하면 media query의 column-gap/row-gap도 영향받음
        const propsToCheck = [kebabProperty];
        if (kebabProperty === 'gap') {
            propsToCheck.push('column-gap', 'row-gap');
        } else if (kebabProperty === 'column-gap' || kebabProperty === 'row-gap') {
            propsToCheck.push('gap');
        }

        for (const sheet of doc.styleSheets) {
            try {
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    const rule = sheet.cssRules[i];
                    if (rule.type !== 4) continue; // CSSMediaRule만

                    const mediaRule = rule;

                    // 미디어쿼리 내의 규칙 검사
                    for (let j = 0; j < mediaRule.cssRules.length; j++) {
                        const innerRule = mediaRule.cssRules[j];
                        if (innerRule.type !== 1) continue;

                        const sel = innerRule.selectorText;

                        // ★ 관련 속성 중 하나라도 있으면 충돌 후보
                        let foundProp = '';
                        let foundVal = '';
                        for (const prop of propsToCheck) {
                            const v = innerRule.style.getPropertyValue(prop);
                            if (v) {
                                foundProp = prop;
                                foundVal = v;
                                break;
                            }
                        }
                        if (!foundVal) continue;

                        // 이 요소에 매칭되는 규칙인지 확인
                        if (!this.selectorMatchesElement(sel, el, doc)) continue;

                        // 이미 부스팅된 셀렉터와 같으면 이 미디어쿼리는 이미 처리됨
                        if (sel === boostedSelector) {
                            break;
                        }

                        // specificity 비교: base의 부스팅 셀렉터가 미디어쿼리 내 셀렉터보다 높으면
                        // ★ 콤마 구분 셀렉터: 매칭 부분만으로 specificity 계산
                        const matchingInnerSel = this._getMatchingIndividualSelector(sel, el);
                        const innerSpec = this.calculateSpecificity(matchingInnerSel);
                        let baseWins = false;
                        for (let k = 0; k < 3; k++) {
                            if (boostedSpec[k] > innerSpec[k]) { baseWins = true; break; }
                            else if (innerSpec[k] > boostedSpec[k]) { break; }
                        }

                        if (baseWins) {
                            // 미디어쿼리 내에 부스팅 셀렉터로 기존 값 복사
                            const conditionText = mediaRule.conditionText || mediaRule.media?.mediaText || '';
                            const maxWidthMatch = conditionText.match(/max-width:\s*(\d+)px/i);
                            if (maxWidthMatch) {
                                const maxWidth = parseInt(maxWidthMatch[1]) - 1; // +1px 보정 역산
                                const preserveRule = this.findOrCreateRuleInMediaQuery(boostedSelector, maxWidth);
                                if (preserveRule) {
                                    // ★ gap shorthand/longhand 충돌 방지하며 값 복사
                                    if (foundProp === kebabProperty) {
                                        // 같은 속성이면 기존 로직
                                        if (!preserveRule.style.getPropertyValue(kebabProperty)) {
                                            preserveRule.style.setProperty(kebabProperty, foundVal);
                                        }
                                    } else {
                                        // 관련 속성 (gap ↔ column-gap/row-gap): 원래 속성 그대로 복사
                                        if (!preserveRule.style.getPropertyValue(foundProp)) {
                                            preserveRule.style.setProperty(foundProp, foundVal);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) { /* cross-origin */ }
        }
    }

    /**
     * 요소에서 CSS 규칙이 없는 고아 생성 클래스를 제거
     * 이전 편집 세션에서 생성된 후 규칙이 merge/삭제된 클래스들 정리
     * @param {string|null} keepSelector - 현재 사용 중인 selector (보존)
     * @returns {boolean} HTML 변경 여부
     */
    cleanupOrphanedClasses(keepSelector = null) {
        const el = this.selectedElement;
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const doc = mainFrame?.contentDocument;
        if (!el || !doc) return false;

        // generated class 패턴: tag-randomid (예: h2-m5jv2v, div-abc123)
        const generatedClassPattern = /^[a-z][a-z0-9]*-[a-z0-9]{4,}$/;
        const classesToRemove = [];

        // keepSelector에서 사용 중인 클래스명 추출
        const keepClasses = new Set();
        if (keepSelector) {
            const matches = keepSelector.match(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
            if (matches) {
                for (const m of matches) keepClasses.add(m.substring(1));
            }
        }

        // 모든 stylesheet에서 규칙이 있는 클래스 수집
        const classesWithRules = new Set();
        for (const sheet of doc.styleSheets) {
            try {
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    const rule = sheet.cssRules[i];
                    if (rule.type !== 1) continue;
                    const sel = rule.selectorText;
                    if (!sel) continue;
                    const clsMatches = sel.match(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
                    if (clsMatches) {
                        for (const cls of clsMatches) classesWithRules.add(cls.substring(1));
                    }
                }
            } catch (e) { /* cross-origin */ }
        }

        // 요소의 generated 클래스 중 규칙이 없는 것 찾기
        for (const cls of Array.from(el.classList)) {
            if (!generatedClassPattern.test(cls)) continue;
            if (keepClasses.has(cls)) continue;
            if (classesWithRules.has(cls)) continue;
            classesToRemove.push(cls);
        }

        if (classesToRemove.length > 0) {
            for (const cls of classesToRemove) {
                el.classList.remove(cls);
            }
            return true;
        }
        return false;
    }

    /**
     * 동일 property를 가진 다른 매칭 규칙에서 해당 property 제거 (CSS 충돌 방지)
     * 요소에 여러 generated class가 있을 때 이전 값이 남아 새 값을 오버라이드하는 문제 해결
     * - zaemit-temp-styles의 대상 selector 규칙만 건너뜀 (방금 값을 설정한 규칙)
     * - 같은 selector라도 다른 sheet에 있으면 정리 (old value 제거)
     * - 공유 selector(여러 요소에 매칭)는 건너뜀 (다른 요소에 영향 방지)
     * - 빈 규칙은 삭제하고 해당 class를 요소에서 제거
     * @param {string} targetSelector - 현재 값을 설정한 selector
     * @param {string} kebabProperty - CSS property (kebab-case)
     * @returns {boolean} HTML 변경 여부 (class 제거 시 true)
     */
    _cleanupConflictingRules(targetSelector, kebabProperty) {
        const el = this.selectedElement;
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const doc = mainFrame?.contentDocument;
        if (!el || !doc) return false;

        let htmlChanged = false;

        for (const sheet of doc.styleSheets) {
            const isTempStyles = sheet.ownerNode?.id === 'zaemit-temp-styles';
            try {
                for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
                    const rule = sheet.cssRules[i];
                    if (rule.type !== 1) continue;
                    const sel = rule.selectorText;

                    // ★ zaemit-temp-styles의 대상 selector만 건너뜀 (방금 값을 설정한 규칙)
                    // 같은 selector라도 다른 sheet(zaemit-injected-css, style.css <link>)에 있으면 정리 대상
                    if (isTempStyles && sel === targetSelector) continue;

                    // 해당 property가 없으면 skip
                    if (!rule.style.getPropertyValue(kebabProperty)) continue;

                    // 이 요소에 매칭되는 규칙인지 확인
                    if (!this.selectorMatchesElement(sel, el, doc)) continue;

                    // 고유 selector만 수정 (공유 selector 수정 시 다른 요소에 영향)
                    if (!this.isSelectorUnique(sel, doc)) continue;

                    // 충돌 property 제거
                    rule.style.removeProperty(kebabProperty);

                    // saveCSS에서 파일 텍스트에도 반영
                    // ★ target selector는 merge에서 처리되므로 track 불필요 (중복 제거 방지)
                    if (sel !== targetSelector && this.editor._trackCSSPropertyRemoval) {
                        this.editor._trackCSSPropertyRemoval(sel, kebabProperty);
                    }

                    // 규칙이 비었으면 규칙 삭제 + 클래스 제거
                    if (rule.style.length === 0) {
                        // 단일 클래스 selector면 요소에서 클래스 제거
                        if (/^\.[a-zA-Z]/.test(sel) && !sel.includes(' ') && !sel.includes(',') && !sel.includes(':')) {
                            const className = sel.substring(1);
                            if (el.classList.contains(className)) {
                                el.classList.remove(className);
                                htmlChanged = true;
                            }
                        }
                        // ★ boosted selector (예: .section-title.h2-abc123) 내의 class도 제거
                        else if (sel.includes('.') && !sel.includes(' ') && !sel.includes(',')) {
                            const classes = sel.match(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
                            if (classes) {
                                for (const cls of classes) {
                                    const className = cls.substring(1);
                                    // generated class 패턴인 경우만 제거 (원본 class 보존)
                                    if (/^[a-z]+-[a-z0-9]+$/.test(className) && el.classList.contains(className)) {
                                        el.classList.remove(className);
                                        htmlChanged = true;
                                    }
                                }
                            }
                        }
                        sheet.deleteRule(i);
                    }
                }
            } catch (e) { /* cross-origin */ }
        }

        return htmlChanged;
    }

    /**
     * Update CSS rule value in stylesheet (modifies the CSS file)
     * @param {string} property - CSS property name (camelCase)
     * @param {string} newValue - New value to set
     * @returns {boolean} Whether the update was successful
     */
    async updateCSSRule(property, newValue) {
        const ruleInfo = this.getCSSRuleInfo(property);
        const kebabProperty = this.toKebabCase(property);

        if (ruleInfo && ruleInfo.rule) {
            // Update the rule in the CSSOM
            if (newValue) {
                ruleInfo.rule.style.setProperty(kebabProperty, newValue);
            } else {
                ruleInfo.rule.style.removeProperty(kebabProperty);
            }

            // Save CSS file
            await this.editor.saveCurrentCSS();
            return true;
        }

        return false;
    }

    /**
     * Get the best selector for adding a new CSS rule for this element
     * Prefers: ID > class > tag
     * Returns null for generic elements without specific selectors
     */
    getBestSelector() {
        if (!this.selectedElement) return null;

        const el = this.selectedElement;

        // Prefer ID
        if (el.id) {
            return '#' + el.id;
        }

        // Then class (only non-editor classes)
        const nonEditorClasses = Array.from(el.classList).filter(cls =>
            !cls.startsWith('zaemit-') &&
            !cls.startsWith('quick-text-edit') &&
            !cls.startsWith('editor-') &&
            !cls.startsWith('selected-') &&
            !cls.startsWith('table-cell-')
        );
        if (nonEditorClasses.length > 0) {
            return '.' + nonEditorClasses[0];
        }

        // Don't return generic tag selectors
        return null;
    }

    /**
     * Generate a unique class name for the element
     * @returns {string} Unique class name like 'el-abc123'
     */
    generateUniqueClass() {
        const tagName = this.selectedElement.tagName.toLowerCase();
        const randomPart = Math.random().toString(36).substring(2, 8);
        return `${tagName}-${randomPart}`;
    }

    /**
     * 셀렉터가 현재 문서에서 하나의 요소에만 매칭되는지 확인
     * @param {string} selector - CSS selector
     * @param {Document} doc - iframe document
     * @returns {boolean}
     */
    isSelectorUnique(selector, doc) {
        if (!selector || !doc) return false;
        try {
            return doc.querySelectorAll(selector).length === 1;
        } catch (e) { return false; }
    }

    /**
     * 기존 CSS 규칙에서 요소에 유일하게 매칭되는 고유 셀렉터 찾기
     * AIChatManager._findBestExistingSelector() 로직 축소 이식
     * @param {Element} el - 대상 요소
     * @param {Document} doc - iframe document
     * @returns {string|null}
     */
    _findExistingUniqueSelector(el, doc) {
        const matchedSelectors = [];

        for (const sheet of doc.styleSheets) {
            if (sheet.ownerNode?.id === 'editor-styles') continue;
            if (sheet.ownerNode?.id === 'zaemit-temp-styles') continue;
            try {
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    const rule = sheet.cssRules[i];
                    if (rule.type !== 1) continue;
                    const sel = rule.selectorText;
                    if (!sel) continue;
                    // pseudo-class/pseudo-element 포함 셀렉터 제외
                    if (/:(hover|focus|active|visited|before|after)/.test(sel)) continue;
                    // 에디터 내부 클래스 제외
                    if (/zaemit-|editor-|selected-/.test(sel)) continue;

                    const parts = sel.split(',').map(s => s.trim());
                    for (const part of parts) {
                        if (!part) continue;
                        try {
                            if (el.matches(part) && doc.querySelectorAll(part).length === 1) {
                                matchedSelectors.push({
                                    selector: part,
                                    specificity: this.calculateSpecificity(part)
                                });
                            }
                        } catch (e) { /* invalid selector */ }
                    }
                }
            } catch (e) { /* CORS */ }
        }

        if (matchedSelectors.length === 0) return null;

        // specificity 내림차순 정렬 → 최고 specificity 고유 셀렉터 반환
        matchedSelectors.sort((a, b) => {
            for (let i = 0; i < 3; i++) {
                if (b.specificity[i] !== a.specificity[i]) return b.specificity[i] - a.specificity[i];
            }
            return 0;
        });
        return matchedSelectors[0].selector;
    }

    /**
     * 기존 CSS에서 고유 셀렉터를 찾거나, 없으면 고유 클래스를 생성하여 반환
     * ★ 모든 단계에서 specificity boosting 적용
     * @param {string|null} selectorToOverride - 이 셀렉터보다 높은 specificity 보장 (getCSSRuleInfo에서 찾은 공유 셀렉터)
     * @returns {string|null} 고유 셀렉터 또는 null
     */
    getOrCreateUniqueSelector(selectorToOverride = null) {
        if (!this.selectedElement) return null;
        const el = this.selectedElement;
        // ★ 셀렉터 고유성 판단은 mainDoc 기준 (CSS 쓰기 대상과 동일 문서)
        const doc = this._getMainDoc();
        if (!doc) return null;

        // 1단계: 기존 CSS 규칙에서 고유 셀렉터 찾기
        const uniqueSelector = this._findExistingUniqueSelector(el, doc);
        if (uniqueSelector) {
            return this._boostSelectorIfNeeded(uniqueSelector, el, doc, selectorToOverride);
        }

        // 2단계: 요소의 모든 non-editor 클래스에서 DOM상 고유한 것 찾기
        // ★ getBestSelector()는 첫 번째 클래스만 반환하므로, 이전에 생성된 고유 클래스를 놓칠 수 있음
        // 모든 클래스를 순회하여 이미 고유한 클래스가 있으면 재사용
        const nonEditorClasses = Array.from(el.classList).filter(cls =>
            !cls.startsWith('zaemit-') &&
            !cls.startsWith('quick-text-edit') &&
            !cls.startsWith('editor-') &&
            !cls.startsWith('selected-') &&
            !cls.startsWith('table-cell-')
        );
        for (const cls of nonEditorClasses) {
            const sel = '.' + cls;
            try {
                if (doc.querySelectorAll(sel).length === 1) {
                    return this._boostSelectorIfNeeded(sel, el, doc, selectorToOverride);
                }
            } catch (e) { /* invalid selector */ }
        }

        // 3단계: 고유 클래스 생성
        const generatedClass = this.generateUniqueClass();
        el.classList.add(generatedClass);

        return this._boostSelectorIfNeeded('.' + generatedClass, el, doc, selectorToOverride);
    }

    /**
     * 고유 셀렉터의 specificity가 기존 공유 셀렉터보다 낮으면 boosting
     * @param {string} uniqueSelector - 고유 셀렉터
     * @param {Element} el - 대상 요소
     * @param {Document} doc - iframe document
     * @param {string|null} knownSharedSelector - 이미 알려진 공유 셀렉터 (getCSSRuleInfo 결과)
     * @returns {string} 필요 시 boosted된 셀렉터
     */
    _boostSelectorIfNeeded(uniqueSelector, el, doc, knownSharedSelector = null) {
        // 비교 대상 결정: 전달된 공유 셀렉터 우선, 없으면 자동 탐색
        let sharedSelector = null;
        if (knownSharedSelector && !this.isGenericSelector(knownSharedSelector)) {
            sharedSelector = knownSharedSelector;
        }
        if (!sharedSelector) {
            sharedSelector = this._findHighestMatchingSelector(el, doc);
        }
        if (!sharedSelector) return uniqueSelector;

        const uniqueSpec = this.calculateSpecificity(uniqueSelector);
        const sharedSpec = this.calculateSpecificity(sharedSelector);

        // specificity 비교: 공유 셀렉터가 같거나 더 높으면 boosting 필요
        let needsBoost = false;
        let isHigher = false;
        for (let i = 0; i < 3; i++) {
            if (sharedSpec[i] > uniqueSpec[i]) {
                needsBoost = true;
                break;
            } else if (uniqueSpec[i] > sharedSpec[i]) {
                isHigher = true;
                break;
            }
        }

        // ★ Equal specificity도 boost 필요
        // CSS 파일에서 generated class가 원본 class보다 앞에 위치하면
        // 동일 specificity에서 순서가 뒤인 원본이 우선됨 → 유저 설정값 무효화
        if (!needsBoost && !isHigher && uniqueSelector !== sharedSelector) {
            needsBoost = true;
        }

        if (!needsBoost) return uniqueSelector;

        // 고유 셀렉터에서 클래스명 추출하여 boosting
        const classMatch = uniqueSelector.match(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/);
        if (classMatch) {
            return this.buildBoostedSelector(sharedSelector, classMatch[1]);
        }

        return uniqueSelector;
    }

    /**
     * 요소에 매칭되는 최고 specificity CSS 셀렉터 찾기 (고유 여부 무관)
     * 고유 클래스 결합(boosting) 시 specificity 기준으로 사용
     * @param {Element} el - 대상 요소
     * @param {Document} doc - iframe document
     * @returns {string|null} 최고 specificity 셀렉터
     */
    _findHighestMatchingSelector(el, doc) {
        let best = null;
        let bestSpec = [0, 0, 0];

        for (const sheet of doc.styleSheets) {
            if (sheet.ownerNode?.id === 'editor-styles') continue;
            if (sheet.ownerNode?.id === 'zaemit-temp-styles') continue;
            try {
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    const rule = sheet.cssRules[i];
                    if (rule.type !== 1) continue;
                    const sel = rule.selectorText;
                    if (!sel) continue;
                    if (/:(hover|focus|active|visited|before|after)/.test(sel)) continue;
                    if (/zaemit-|editor-|selected-/.test(sel)) continue;

                    const parts = sel.split(',').map(s => s.trim());
                    for (const part of parts) {
                        if (!part) continue;
                        try {
                            if (!el.matches(part)) continue;
                            const spec = this.calculateSpecificity(part);
                            // specificity 비교: [id, class, element]
                            for (let j = 0; j < 3; j++) {
                                if (spec[j] > bestSpec[j]) {
                                    best = part;
                                    bestSpec = spec;
                                    break;
                                } else if (spec[j] < bestSpec[j]) {
                                    break;
                                }
                            }
                        } catch (e) { /* invalid selector */ }
                    }
                }
            } catch (e) { /* CORS */ }
        }

        return best;
    }

    /**
     * 공유 셀렉터에 고유 클래스를 결합하여 specificity를 유지하면서 고유하게 만듦
     * @param {string} sharedSelector - 공유 셀렉터 (예: ".card p")
     * @param {string} uniqueClass - 고유 클래스명 (예: "p-abc123")
     * @returns {string} 결합된 셀렉터 (예: ".card p.p-abc123")
     */
    buildBoostedSelector(sharedSelector, uniqueClass) {
        const parts = sharedSelector.trim().split(/\s+/);
        parts[parts.length - 1] += '.' + uniqueClass;
        return parts.join(' ');
    }

    /**
     * Check if a selector is an editor-internal selector
     * These selectors are used by the editor itself and should be ignored
     * @param {string} selector - CSS selector text
     * @returns {boolean} true if it's an editor-internal selector
     */
    isEditorInternalSelector(selector) {
        if (!selector) return false;

        const editorSelectors = [
            '.editor-highlight',
            '.zaemit-',
            '.quick-text-edit',
            '[data-zaemit-',
            '.selected-element'
        ];

        const lowerSelector = selector.toLowerCase();
        return editorSelectors.some(es => lowerSelector.includes(es.toLowerCase()));
    }

    /**
     * Resolve a longhand CSS property from its shorthand.
     * CSS 변수가 포함된 shorthand에서 CSSOM이 longhand로 분해하지 못하는 경우 대응.
     * 예: `border: 1px solid var(--x)` → `border-top-width` = empty → shorthand에서 추출
     * @param {CSSStyleRule} rule - CSS rule object
     * @param {string} kebabProperty - kebab-case longhand property (e.g. 'border-top-width')
     * @returns {string} Extracted value or empty string
     */
    _resolveFromShorthand(rule, kebabProperty) {
        // border-* shorthand resolution
        const borderMatch = kebabProperty.match(/^border(?:-(top|right|bottom|left))?-(width|style|color)$/);
        if (borderMatch) {
            const component = borderMatch[2]; // 'width', 'style', 'color'
            // Try border shorthand (CSS variable가 포함되면 여기에 값이 있음)
            const borderValue = rule.style.getPropertyValue('border');
            if (borderValue) {
                return this._parseBorderShorthandComponent(borderValue, component);
            }
            // Try border-width/style/color 중간 shorthand
            const midValue = rule.style.getPropertyValue(`border-${component}`);
            if (midValue) {
                // "1px 2px 3px 4px" 형태이면 side에 맞는 값 추출
                const side = borderMatch[1]; // 'top', 'right', 'bottom', 'left' or undefined
                return this._extractSideFromFourValues(midValue, side);
            }
        }

        // margin/padding shorthand resolution
        const spacingMatch = kebabProperty.match(/^(margin|padding)-(top|right|bottom|left)$/);
        if (spacingMatch) {
            const shorthand = spacingMatch[1]; // 'margin' or 'padding'
            const side = spacingMatch[2];
            const shorthandValue = rule.style.getPropertyValue(shorthand);
            if (shorthandValue) {
                return this._extractSideFromFourValues(shorthandValue, side);
            }
        }

        // gap shorthand resolution (gap → column-gap / row-gap)
        if (kebabProperty === 'column-gap' || kebabProperty === 'row-gap') {
            const gapValue = rule.style.getPropertyValue('gap');
            if (gapValue) {
                const parts = gapValue.trim().split(/\s+/);
                if (kebabProperty === 'row-gap') {
                    return parts[0]; // gap: <row> <col> → row-gap = first value
                } else {
                    return parts.length > 1 ? parts[1] : parts[0]; // column-gap = second or first
                }
            }
        }

        // background shorthand resolution
        // background: var(--surface) 등 CSS variable 포함 시 CSSOM이 longhand 분해 불가
        const bgLonghands = ['background-image', 'background-color', 'background-size',
            'background-position', 'background-repeat', 'background-attachment',
            'background-origin', 'background-clip'];
        if (bgLonghands.includes(kebabProperty)) {
            const bgValue = rule.style.getPropertyValue('background');
            if (bgValue) {
                // shorthand 값이 있으면 → 해당 longhand 요청에 대해 shorthand 값 자체를 반환
                // (CSS variable이 포함되어 개별 분해 불가하므로 shorthand 통째로 반환)
                return bgValue;
            }
        }

        return '';
    }

    /**
     * Parse border shorthand value to extract a specific component.
     * border shorthand format: <width> || <style> || <color>
     * @param {string} borderValue - e.g. "1px solid var(--border-subtle)"
     * @param {string} component - 'width', 'style', or 'color'
     * @returns {string}
     */
    _parseBorderShorthandComponent(borderValue, component) {
        if (!borderValue) return '';

        const borderStyleKeywords = ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'];
        const widthKeywords = ['thin', 'medium', 'thick'];

        // 괄호를 보존하면서 토큰 분리 (var(), rgb() 등)
        const tokens = [];
        let current = '';
        let depth = 0;
        for (const ch of borderValue) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (ch === ' ' && depth === 0) {
                if (current) tokens.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        if (current) tokens.push(current);

        let width = '', style = '';
        const colorTokens = [];

        for (const token of tokens) {
            const lower = token.toLowerCase();
            if (borderStyleKeywords.includes(lower)) {
                style = token;
            } else if (widthKeywords.includes(lower) || /^[\d.]/.test(token)) {
                width = token;
            } else {
                colorTokens.push(token);
            }
        }

        switch (component) {
            case 'width': return width;
            case 'style': return style;
            case 'color': return colorTokens.join(' ');
            default: return '';
        }
    }

    /**
     * Extract a side value from CSS four-value shorthand (top right bottom left).
     * e.g. "10px 20px 30px 40px" → side='left' → "40px"
     * @param {string} shorthandValue
     * @param {string} [side] - 'top', 'right', 'bottom', 'left' or undefined (returns first)
     * @returns {string}
     */
    _extractSideFromFourValues(shorthandValue, side) {
        if (!shorthandValue) return '';

        // 괄호 보존 토큰 분리
        const tokens = [];
        let current = '';
        let depth = 0;
        for (const ch of shorthandValue) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (ch === ' ' && depth === 0) {
                if (current) tokens.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        if (current) tokens.push(current);

        if (tokens.length === 0) return '';

        // CSS four-value syntax: top right bottom left
        const sideIndex = { 'top': 0, 'right': 1, 'bottom': 2, 'left': 3 };
        const idx = side ? (sideIndex[side] || 0) : 0;

        if (tokens.length === 1) return tokens[0];
        if (tokens.length === 2) return tokens[idx % 2]; // top/bottom=0, right/left=1
        if (tokens.length === 3) {
            // top, right, bottom (left = right)
            if (idx === 3) return tokens[1]; // left = right
            return tokens[idx];
        }
        return tokens[idx] || tokens[0];
    }

    /**
     * Check if a selector is a generic/universal selector
     * Generic selectors like *, p, div, span should not be modified directly
     * @param {string} selector - CSS selector text
     * @returns {boolean} true if it's a generic selector
     */
    isGenericSelector(selector) {
        if (!selector) return true;

        // List of generic selectors that should not be directly modified
        const genericSelectors = [
            '*',
            'html', 'body',
            'div', 'span', 'p', 'a', 'img',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li',
            'table', 'tr', 'td', 'th', 'thead', 'tbody',
            'form', 'input', 'button', 'textarea', 'select', 'label',
            'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
            'figure', 'figcaption', 'blockquote', 'pre', 'code',
            'strong', 'em', 'b', 'i', 'u', 'small', 'sub', 'sup',
            'br', 'hr'
        ];

        // Normalize selector - handle comma-separated selectors
        const selectors = selector.split(',').map(s => s.trim());

        for (const sel of selectors) {
            // Check if selector is a simple generic tag
            const normalizedSel = sel.toLowerCase().trim();

            // If any part contains class (.) or id (#) or attribute ([), it's specific enough
            if (normalizedSel.includes('.') || normalizedSel.includes('#') || normalizedSel.includes('[')) {
                return false;
            }

            // Check for exact generic tag match (with possible pseudo-classes)
            const baseSel = normalizedSel.split(':')[0].trim();
            if (genericSelectors.includes(baseSel)) {
                return true;
            }

            // Check for * (universal selector)
            if (baseSel === '*') {
                return true;
            }
        }

        return false;
    }

    /**
     * 콤마 구분 셀렉터에서 실제 매칭되는 개별 셀렉터 부분 추출
     * CSS 규칙의 selectorText가 "*, ::before, ::after" 같은 경우
     * 실제 DOM 요소에 매칭되는 부분만 반환하여 정확한 specificity 계산 가능
     * @param {string} selectorText - 콤마 구분 셀렉터 텍스트
     * @param {Element} element - 대상 DOM 요소
     * @returns {string} 매칭되는 개별 셀렉터 (가장 높은 specificity)
     */
    _getMatchingIndividualSelector(selectorText, element) {
        if (!selectorText || !element) return selectorText;
        if (!selectorText.includes(',')) return selectorText;

        const parts = selectorText.split(',').map(s => s.trim());
        let bestPart = null;
        let bestSpec = [-1, -1, -1];

        for (const part of parts) {
            if (!part) continue;
            try {
                if (element.matches(part)) {
                    const spec = this.calculateSpecificity(part);
                    let isBetter = false;
                    for (let i = 0; i < 3; i++) {
                        if (spec[i] > bestSpec[i]) { isBetter = true; break; }
                        else if (spec[i] < bestSpec[i]) { break; }
                    }
                    if (isBetter || bestSpec[0] === -1) {
                        bestPart = part;
                        bestSpec = spec;
                    }
                }
            } catch (e) { /* pseudo-element like ::before throws in matches() */ }
        }

        return bestPart || selectorText;
    }

    /**
     * Check if a CSS selector matches an element
     */
    selectorMatchesElement(selectorText, element, doc) {
        if (!selectorText || !element) return false;

        try {
            // Handle multiple selectors (comma-separated)
            const selectors = selectorText.split(',').map(s => s.trim());

            for (const selector of selectors) {
                if (!selector) continue;

                // Use matches() to check if element matches selector
                if (element.matches && element.matches(selector)) {
                    return true;
                }
            }
        } catch (e) {
            // Invalid selector, skip
            return false;
        }

        return false;
    }

    /**
     * Calculate CSS specificity for a selector
     * Returns [ids, classes, elements]
     */
    calculateSpecificity(selectorText) {
        if (!selectorText) return [0, 0, 0];

        let ids = 0;
        let classes = 0;
        let elements = 0;

        // Count IDs (#)
        const idMatches = selectorText.match(/#[a-zA-Z_-][a-zA-Z0-9_-]*/g);
        if (idMatches) ids = idMatches.length;

        // Count classes (.), attributes ([]), and pseudo-classes (:not, :hover, etc.)
        const classMatches = selectorText.match(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g);
        if (classMatches) classes += classMatches.length;

        const attrMatches = selectorText.match(/\[[^\]]+\]/g);
        if (attrMatches) classes += attrMatches.length;

        const pseudoClassMatches = selectorText.match(/:[a-zA-Z-]+(?!\()/g);
        if (pseudoClassMatches) classes += pseudoClassMatches.length;

        // Count element selectors and pseudo-elements (::)
        const elementMatches = selectorText.match(/(?:^|[\s>+~])([a-zA-Z][a-zA-Z0-9]*)/g);
        if (elementMatches) elements = elementMatches.length;

        const pseudoElementMatches = selectorText.match(/::[a-zA-Z-]+/g);
        if (pseudoElementMatches) elements += pseudoElementMatches.length;

        return [ids, classes, elements];
    }

    /**
     * Get CSS rule value for a specific pseudo-class state
     * @param {string} property - CSS property name (camelCase)
     * @param {string} state - Pseudo-class state (:hover, :focus, :active)
     * @returns {string} The CSS value from stylesheet rules, or empty string if not found
     */
    getCSSRuleValueWithState(property, state) {
        const ruleInfo = this.getCSSRuleInfoWithState(property, state, false);
        return ruleInfo ? ruleInfo.value : '';
    }

    /**
     * Get detailed CSS rule info for a property with pseudo-class state
     * @param {string} property - CSS property name (camelCase)
     * @param {string} state - Pseudo-class state (:hover, :focus, :active)
     * @param {boolean} returnRuleObj - Whether to return the full rule object
     * @returns {object|null} { value, selector, rule, ruleIndex, sheetIndex } or null
     */
    getCSSRuleInfoWithState(property, state, returnRuleObj = false) {
        if (!this.selectedElement || !this.previewWindow || !state) return null;

        const element = this.selectedElement;
        const doc = this.previewWindow.document;

        // Convert camelCase to kebab-case for CSS matching
        const kebabProperty = this.toKebabCase(property);

        // Store matched rules with specificity and location info
        const matchedRules = [];

        try {
            // Iterate through all stylesheets
            const sheets = Array.from(doc.styleSheets);
            for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
                const sheet = sheets[sheetIndex];
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
                        const rule = rules[ruleIndex];
                        if (rule.type !== 1) continue; // Only style rules (type 1)

                        const selectorText = rule.selectorText;

                        // Check if selector includes the pseudo-class state
                        if (!selectorText.includes(state)) continue;

                        // Check if base selector (without pseudo-class) matches the element
                        if (this.selectorWithStateMatchesElement(selectorText, state, element, doc)) {
                            let value = rule.style.getPropertyValue(kebabProperty);
                            // ★ CSS 변수 shorthand 대응
                            if (!value) {
                                value = this._resolveFromShorthand(rule, kebabProperty);
                            }
                            if (value || returnRuleObj) {
                                const specificity = this.calculateSpecificity(selectorText);
                                matchedRules.push({
                                    value: value || '',
                                    specificity,
                                    selector: selectorText,
                                    rule,
                                    ruleIndex,
                                    sheetIndex,
                                    sheet
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin stylesheet, skip
                    continue;
                }
            }
        } catch (e) {
            console.warn('Error reading stylesheets:', e);
        }

        // Return the rule with highest specificity
        if (matchedRules.length > 0) {
            matchedRules.sort((a, b) => {
                // Compare specificity arrays [ids, classes, elements]
                for (let i = 0; i < 3; i++) {
                    if (b.specificity[i] !== a.specificity[i]) {
                        return b.specificity[i] - a.specificity[i];
                    }
                }
                // If same specificity, prefer later rules (higher sheet/rule index)
                if (b.sheetIndex !== a.sheetIndex) {
                    return b.sheetIndex - a.sheetIndex;
                }
                return b.ruleIndex - a.ruleIndex;
            });
            return matchedRules[0];
        }

        return null;
    }

    /**
     * Check if a CSS selector with pseudo-class matches an element
     * @param {string} selectorText - Full selector text (e.g., ".class:hover")
     * @param {string} state - Pseudo-class state (:hover, :focus, :active)
     * @param {Element} element - Element to match against
     * @param {Document} doc - Document context
     * @returns {boolean} Whether the base selector matches the element
     */
    selectorWithStateMatchesElement(selectorText, state, element, doc) {
        if (!selectorText || !element || !state) return false;

        try {
            // Handle multiple selectors (comma-separated)
            const selectors = selectorText.split(',').map(s => s.trim());

            for (const selector of selectors) {
                if (!selector || !selector.includes(state)) continue;

                // Remove the pseudo-class to get the base selector
                // Handle cases like ".class:hover", ".class:hover:focus", "div.class:hover"
                const baseSelector = selector.replace(new RegExp(state + '(?=[^a-zA-Z-]|$)', 'g'), '').trim();

                if (!baseSelector) continue;

                // Use matches() to check if element matches base selector
                if (element.matches && element.matches(baseSelector)) {
                    return true;
                }
            }
        } catch (e) {
            // Invalid selector, skip
            return false;
        }

        return false;
    }

    /**
     * Add a new CSS rule with pseudo-class state for the selected element
     * @param {string} property - CSS property (camelCase)
     * @param {string} value - CSS value
     * @param {string} state - Pseudo-class state (:hover, :focus, :active)
     * @returns {boolean} Whether rule was added
     */
    async addCSSRuleWithState(property, value, state) {
        if (!this.selectedElement || !value || !state) return false;

        let baseSelector = this.getOrCreateUniqueSelector(null);
        if (!baseSelector) {
            baseSelector = this.getBestSelector();
            if (!baseSelector) return false;
        }
        if (this.editor?.modules?.multiCanvas?._isInitialized) {
            this.editor.modules.multiCanvas.syncElementClassesFromElement?.(this.selectedElement);
        }

        const fullSelector = baseSelector + state;
        const kebabProperty = this.toKebabCase(property);
        const rule = this.findOrCreateRule(fullSelector);

        if (rule) {
            rule.style.setProperty(kebabProperty, value);
            await this.editor.saveCurrentCSS();
            return true;
        }
        return false;
    }

    /**
     * Get the effective CSS value for a property
     * Priority: inline > stylesheet rule > computed (as fallback)
     * @param {string} property - CSS property name (camelCase)
     * @returns {object} { value: string, source: 'inline'|'css'|'computed' }
     */
    getEffectiveCSSValue(property) {
        if (!this.selectedElement) return { value: '', source: 'none' };

        // 1. Check inline style first
        const inlineValue = this.selectedElement.style[property];
        if (inlineValue) {
            return { value: inlineValue, source: 'inline' };
        }

        // 2. Check CSS rule value
        const cssValue = this.getCSSRuleValue(property);
        if (cssValue) {
            return { value: cssValue, source: 'css' };
        }

        // 3. Fall back to computed (but this will be in pixels)
        if (this.previewWindow) {
            const computed = this.previewWindow.getComputedStyle(this.selectedElement);
            const computedValue = computed[property];
            if (computedValue) {
                return { value: computedValue, source: 'computed' };
            }
        }

        return { value: '', source: 'none' };
    }

    // ==================== Media Query Methods ====================

    /**
     * Find or create a media query rule in the stylesheet
     * @param {number} maxWidth - Max width for the media query
     * @returns {CSSMediaRule|null} The media rule or null
     */
    findOrCreateMediaRule(maxWidth) {
        if (!this.previewWindow) {
            return null;
        }

        // ★ 소수점 렌더링 오차 대응: +1px 여유 추가
        // 예: 631px 뷰포트 → 실제 요소 631.2px (zoom으로 인한 소수점)
        // 미디어쿼리 @media (max-width: 632px) 사용하여 631.2px < 632px 조건 충족
        const adjustedWidth = maxWidth + 1;

        // Normalize media query format for comparison (no extra spaces)
        const normalizeMediaQuery = (query) => {
            return query.replace(/\s+/g, ' ').replace(/:\s*/g, ': ').trim();
        };
        const targetQuery = normalizeMediaQuery(`(max-width: ${adjustedWidth}px)`);

        // Use getMainStylesheet() to get zaemit-temp-styles
        const mainSheet = this.getMainStylesheet();
        if (!mainSheet) {
            return null;
        }

        try {
            // Look for existing media rule
            for (const rule of mainSheet.cssRules) {
                if (rule.type === 4) { // CSSMediaRule
                    const ruleQuery = normalizeMediaQuery(rule.conditionText || rule.media.mediaText || '');
                    if (ruleQuery === targetQuery) {
                        return rule;
                    }
                }
            }

            // Create new media rule at the correct position
            // CSS 미디어쿼리 순서: 큰 max-width가 먼저, 작은 max-width가 나중에
            // 예: @media (max-width: 769px) 다음에 @media (max-width: 481px)
            // 이렇게 해야 480px 뷰포트에서 481px 규칙이 769px 규칙을 덮어씀
            const mediaRuleText = `@media (max-width: ${adjustedWidth}px) {}`;

            // 삽입 위치 찾기: 새 미디어쿼리보다 작은 max-width를 가진 첫 번째 미디어쿼리 앞
            let insertIndex = mainSheet.cssRules.length;
            for (let i = 0; i < mainSheet.cssRules.length; i++) {
                const rule = mainSheet.cssRules[i];
                if (rule.type === 4) { // CSSMediaRule
                    const match = (rule.conditionText || rule.media?.mediaText || '').match(/max-width:\s*(\d+)px/i);
                    if (match) {
                        const existingWidth = parseInt(match[1]);
                        if (existingWidth < adjustedWidth) {
                            // 기존 미디어쿼리가 새 것보다 작으면 그 앞에 삽입
                            insertIndex = i;
                            break;
                        }
                    }
                }
            }

            const index = mainSheet.insertRule(mediaRuleText, insertIndex);
            return mainSheet.cssRules[index];
        } catch (e) {
            console.warn('Failed to find/create media rule:', e);
            return null;
        }
    }

    /**
     * Get CSS rule info within a specific media query
     * @param {string} property - CSS property name (camelCase)
     * @param {number} maxWidth - Max width for the media query
     * @returns {object|null} { value, selector, rule, mediaRule } or null
     */
    getCSSRuleInfoInMediaQuery(property, maxWidth) {
        if (!this.selectedElement || !this.previewWindow) return null;

        const doc = this.previewWindow.document;
        const kebabProperty = this.toKebabCase(property);

        // Normalize media query format for comparison
        const normalizeMediaQuery = (query) => {
            return query.replace(/\s+/g, ' ').replace(/:\s*/g, ': ').trim();
        };
        // ★ findOrCreateMediaRule()과 동일하게 +1px 적용
        const adjustedWidth = maxWidth + 1;
        const targetQuery = normalizeMediaQuery(`(max-width: ${adjustedWidth}px)`);

        const matchedRules = [];

        try {
            for (const sheet of doc.styleSheets) {
                // Check style.css or zaemit-temp-styles (inline style tag without href)
                const isStyleCSS = sheet.href && sheet.href.includes('style.css');
                const isTempStyles = !sheet.href && sheet.ownerNode?.id === 'zaemit-temp-styles';
                if (!isStyleCSS && !isTempStyles) continue;

                try {
                    for (const rule of sheet.cssRules) {
                        // Only process media rules matching our query
                        if (rule.type !== 4) continue;
                        const ruleQuery = normalizeMediaQuery(rule.conditionText || rule.media.mediaText || '');
                        if (ruleQuery !== targetQuery) continue;

                        // Search within the media rule
                        for (let i = 0; i < rule.cssRules.length; i++) {
                            const innerRule = rule.cssRules[i];
                            if (innerRule.type !== 1) continue;

                            if (this.selectorMatchesElement(innerRule.selectorText, this.selectedElement, doc)) {
                                const value = innerRule.style.getPropertyValue(kebabProperty);
                                if (value) {
                                    // ★ 콤마 구분 셀렉터: 매칭 부분만으로 specificity 계산
                                    const matchingSel = this._getMatchingIndividualSelector(innerRule.selectorText, this.selectedElement);
                                    const specificity = this.calculateSpecificity(matchingSel);
                                    matchedRules.push({
                                        value,
                                        specificity,
                                        selector: innerRule.selectorText,
                                        rule: innerRule,
                                        ruleIndex: i,
                                        mediaRule: rule
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            console.warn('Error reading media query rules:', e);
        }

        if (matchedRules.length > 0) {
            matchedRules.sort((a, b) => {
                for (let i = 0; i < 3; i++) {
                    if (b.specificity[i] !== a.specificity[i]) {
                        return b.specificity[i] - a.specificity[i];
                    }
                }
                return b.ruleIndex - a.ruleIndex;
            });
            return matchedRules[0];
        }

        return null;
    }

    /**
     * Add or update a CSS rule within a media query
     * @param {string} property - CSS property (camelCase)
     * @param {string} value - CSS value
     * @param {number} maxWidth - Max width for the media query
     * @returns {boolean} Whether rule was added/updated
     */
    async addCSSRuleInMediaQuery(property, value, maxWidth) {
        if (!this.selectedElement || !value) return false;

        const selector = this.getBestSelector();
        if (!selector) return false;

        const kebabProperty = this.toKebabCase(property);
        const rule = this.findOrCreateRuleInMediaQuery(selector, maxWidth);

        if (rule) {
            rule.style.setProperty(kebabProperty, value);
            await this.editor.saveCurrentCSS();
            return true;
        }
        return false;
    }

    /**
     * Apply style change considering current breakpoint (media query)
     * @param {string} styleProp - CSS property name (camelCase)
     * @param {string} newValue - New value to set
     * @param {string} oldValue - Old value for undo
     */
    async applyStyleChangeWithBreakpoint(styleProp, newValue, oldValue) {
        if (!this.selectedElement) return;

        const breakpoint = this.currentBreakpoint;
        const state = this.currentState;
        const kebabProperty = this.toKebabCase(styleProp);

        // If no breakpoint, use default behavior
        if (!breakpoint) {
            await this.applyStyleChange(styleProp, newValue, oldValue);
            return;
        }

        // Check if element has a specific selector for media query styles
        const bestSelector = this.getBestSelector();
        if (!bestSelector) {
            // Cannot apply media query style without specific selector
            this.editor.showToast?.('클래스나 ID가 없어 미디어쿼리 스타일을 적용할 수 없습니다', 'warning');
            return;
        }

        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor.modules?.undoRedo;

        // With breakpoint: always use media query in CSS
        const maxWidth = breakpoint.maxWidth;

        // Check for existing rule in media query (exclude generic selectors)
        const ruleInfo = this.getCSSRuleInfoInMediaQuery(styleProp, maxWidth);

        if (ruleInfo && ruleInfo.rule && !this.isGenericSelector(ruleInfo.selector)) {
            const targetSelector = ruleInfo.selector;
            // ★ 변경 전 oldRules 수집
            const oldRules = (mainDoc && undoRedo && targetSelector)
                ? undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc) : {};

            // Update existing rule with specific selector
            if (newValue) {
                ruleInfo.rule.style.setProperty(kebabProperty, newValue);
            } else {
                ruleInfo.rule.style.removeProperty(kebabProperty);
            }
            // ★ recordCSSRuleSnapshot으로 기록 (recordStyleChange 대체)
            if (mainDoc && undoRedo && targetSelector) {
                const newRules = undoRedo.collectAllRulesForSelector(targetSelector, styleProp, mainDoc);
                undoRedo.recordCSSRuleSnapshot(this.selectedElement, targetSelector, styleProp, oldRules, newRules);
            }
            await this.editor.saveCurrentCSS();
            return;
        }

        // ★ 변경 전 oldRules 수집 (새 규칙 생성 전)
        const oldRules = (mainDoc && undoRedo)
            ? undoRedo.collectAllRulesForSelector(bestSelector, styleProp, mainDoc) : {};

        // Add new rule in media query
        const added = await this.addCSSRuleInMediaQuery(styleProp, newValue, maxWidth);
        if (added) {
            // ★ recordCSSRuleSnapshot으로 기록 (recordStyleChange 대체)
            if (mainDoc && undoRedo) {
                const newRules = undoRedo.collectAllRulesForSelector(bestSelector, styleProp, mainDoc);
                undoRedo.recordCSSRuleSnapshot(this.selectedElement, bestSelector, styleProp, oldRules, newRules);
            }
        }
    }

    /**
     * Apply style change to multiple breakpoints (media queries)
     * @param {string} styleProp - CSS property name (camelCase)
     * @param {string} newValue - New value to set
     * @param {string} oldValue - Old value for undo
     * @param {Array} breakpoints - Array of maxWidth values
     * @param {boolean} skipRecord - If true, skip recording change (caller will record)
     * @param {string|null} targetSelector - Pre-determined (boosted) selector from caller. If null, determines own selector.
     * @returns {Array} Array of successfully applied breakpoints
     */
    async applyStyleChangeToBreakpoints(styleProp, newValue, oldValue, breakpoints, skipRecord = false, targetSelector = null) {
        if (!this.selectedElement || !breakpoints || breakpoints.length === 0) {
            return [];
        }

        // ★ 호출자가 이미 부스팅된 셀렉터를 전달한 경우 그대로 사용 (공유 셀렉터 오염 방지)
        // targetSelector가 없으면 기존 로직으로 자체 결정 (하위호환)
        let bestSelector = targetSelector;
        if (!bestSelector) {
            const existingRuleInfo = this.getCSSRuleInfo(styleProp);
            bestSelector = (existingRuleInfo?.selector && !this.isGenericSelector(existingRuleInfo.selector))
                ? existingRuleInfo.selector : this.getBestSelector();
        }

        // If no selector exists, auto-generate a class
        if (!bestSelector) {
            const generatedClass = this.generateUniqueClass();
            this.selectedElement.classList.add(generatedClass);
            bestSelector = '.' + generatedClass;
            // Save HTML to persist the new class
            this.editor.saveCurrentHTML();
        }

        const kebabProperty = this.toKebabCase(styleProp);
        const appliedBreakpoints = [];
        const mainFrame = this.editor?.mainIframe || this.editor?.previewFrame;
        const mainDoc = mainFrame?.contentDocument;
        const undoRedo = this.editor.modules?.undoRedo;

        // ★ 변경 전 oldRules 수집 (skipRecord=false일 때만 필요)
        const oldRules = (!skipRecord && mainDoc && undoRedo && bestSelector)
            ? undoRedo.collectAllRulesForSelector(bestSelector, styleProp, mainDoc) : {};

        // If inline style exists, move it to base CSS rule first (so media queries can override)
        const inlineValue = this.selectedElement.style[styleProp];
        if (inlineValue) {
            // Remove inline style
            this.selectedElement.style[styleProp] = '';

            // If PC is selected, add to base CSS rule
            if (this.isPCSelected) {
                await this.addCSSRuleNoSave(styleProp, inlineValue);
            }

            // Save HTML to remove inline style
            this.editor.saveCurrentHTML();
        }

        // ===== CASCADE PREVENTION =====
        // preventCascade()는 applyStyleChange()에서 이미 호출됨 (중복 제거)
        // 모든 스타일 핸들러에서 동일하게 처리됨

        for (const maxWidth of breakpoints) {
            if (maxWidth === 'pc') continue; // Skip 'pc' - handled as base styles

            // ★ 항상 mainIframe의 규칙 사용 (getCSSRuleInfoInMediaQuery는 활성 iframe을 사용하므로 사용하지 않음)
            // findOrCreateRuleInMediaQuery()는 mainIframe을 올바르게 사용
            if (newValue) {
                // 값 설정 시: addCSSRuleInMediaQueryNoSave()가 기존 규칙이 있으면 업데이트, 없으면 생성
                const added = await this.addCSSRuleInMediaQueryNoSave(styleProp, newValue, maxWidth, bestSelector);
                if (added) {
                    appliedBreakpoints.push(maxWidth);
                }
            } else {
                // 값 제거 시: mainIframe의 규칙에서 속성 제거 (boosted 셀렉터 사용)
                const rule = this.findOrCreateRuleInMediaQuery(bestSelector, maxWidth);
                if (rule) {
                    rule.style.removeProperty(kebabProperty);
                    appliedBreakpoints.push(maxWidth);
                }
            }
        }

        // Record the change with all applied breakpoints and save CSS once
        // skipRecord=true일 때는 호출자(applyStyleChange)가 cssRuleSnapshot으로 기록함
        if (appliedBreakpoints.length > 0 && !skipRecord) {
            // ★ recordCSSRuleSnapshot으로 기록 (recordStyleChange 대체)
            if (mainDoc && undoRedo && bestSelector) {
                const newRules = undoRedo.collectAllRulesForSelector(bestSelector, styleProp, mainDoc);
                undoRedo.recordCSSRuleSnapshot(this.selectedElement, bestSelector, styleProp, oldRules, newRules);
            }
            await this.editor.saveCurrentCSS();
        }

        return appliedBreakpoints;
    }

    /**
     * Prevent CSS cascade by saving existing value to ALL unselected breakpoints
     * When changing style at specific breakpoints, preserve original value for others
     *
     * Example:
     * - Breakpoints: 1200, 768, 480, 375
     * - Only 768px selected (ON), others OFF
     * - Change color at 768px from black to red
     * - Without prevention: All <= 768px become red (cascade)
     * - With prevention: Save "black" to 480px and 375px, so they stay black
     *
     * @param {string} styleProp - CSS property name (camelCase)
     * @param {string} oldValue - The existing value to preserve
     * @param {string} selector - CSS selector for the element
     */
    async preventCascade(styleProp, oldValue, selector) {
        const allBreakpoints = this.editor.styleManager?.getAllBreakpoints() || [];
        if (allBreakpoints.length === 0) return;

        // ★★★ 체크박스 기반으로 활성화 상태 확인 (iframes 배열이 아님!)
        // selectedBreakpoints: 체크박스로 선택된 브레이크포인트들 (예: ['pc'] 또는 ['pc', 768, 480])
        const selectedBreakpoints = this.editor.styleManager?.selectedBreakpoints || ['pc'];

        // 전체 활성화 여부: 선택된 브레이크포인트 수 >= 전체 뷰포트 수 (breakpoints + PC)
        const isAllViewsEnabled = selectedBreakpoints.length >= allBreakpoints.length + 1;
        // ★ 멀티뷰가 실제로 활성화된 상태에서만 전체 cascade 허용
        // 싱글뷰에서는 모든 체크박스가 ON이어도 다른 뷰의 값을 보존
        const isMultiViewActive = this.editor?.modules?.multiCanvas?.isEnabled?.() ?? false;
        if (isAllViewsEnabled && isMultiViewActive) return; // 멀티뷰 + 전체 활성화 시만 cascade 허용

        // Get the value to preserve
        let valueToPreserve = oldValue;

        // If oldValue is empty, get from computed styles
        if (!valueToPreserve && this.previewWindow && this.selectedElement) {
            const computed = this.previewWindow.getComputedStyle(this.selectedElement);
            valueToPreserve = computed[styleProp];
        }

        if (!valueToPreserve) return;

        const kebabProperty = this.toKebabCase(styleProp);

        // 체크박스로 선택된 브레이크포인트 (숫자만, 'pc' 제외)
        const activeBreakpoints = new Set(
            selectedBreakpoints.filter(bp => typeof bp === 'number')
        );

        // 현재 뷰모드 확인
        const isPCMode = this.editor?.modules?.viewMode?.isPCMode?.() ?? true;

        // ★★★ 비활성화된 브레이크포인트에 oldValue 저장
        for (const bp of allBreakpoints) {
            // 활성화된 브레이크포인트는 건너뜀
            if (activeBreakpoints.has(bp)) continue;

            // 이미 값이 있으면 스킵
            const existingRule = this.getCSSRuleInfoInMediaQuery(styleProp, bp);
            if (existingRule && existingRule.value) continue;

            const rule = this.findOrCreateRuleInMediaQuery(selector, bp);
            if (rule) {
                this._setCascadePreserveValue(rule, kebabProperty, valueToPreserve);
            }
        }

        // ★ PC 모드가 아닌 경우, 베이스 스타일에도 원래값 보존
        if (!isPCMode) {
            const baseRule = this.findOrCreateRule(selector);
            if (baseRule) {
                this._setCascadePreserveValue(baseRule, kebabProperty, valueToPreserve);
            }
        }
    }

    /**
     * Cascade prevention용: gap shorthand/longhand 충돌 없이 값 설정
     * gap shorthand는 항상 longhand(column-gap, row-gap)로 분리하여 설정하고,
     * longhand 설정 시 기존 gap shorthand가 있으면 스킵함.
     * 이는 다른 stylesheet(style.css)의 longhand 값이 shorthand에 의해 덮어쓰이는 것을 방지.
     * @param {CSSStyleRule} rule - CSS 규칙
     * @param {string} kebabProperty - kebab-case 속성명
     * @param {string} value - 보존할 값
     */
    _setCascadePreserveValue(rule, kebabProperty, value) {
        if (!rule || !value) return;

        if (kebabProperty === 'gap') {
            // ★ gap shorthand → 항상 longhand로 분리하여 설정
            // shorthand는 기존 longhand를 덮어쓰므로, longhand 개별 설정이 안전
            const parts = value.trim().split(/\s+/);
            const rowGapVal = parts[0];
            const colGapVal = parts.length > 1 ? parts[1] : parts[0];

            // 이미 값이 있는 longhand는 스킵 (기존 값 보존)
            if (!rule.style.getPropertyValue('column-gap') && !rule.style.getPropertyValue('gap')) {
                rule.style.setProperty('column-gap', colGapVal);
            }
            if (!rule.style.getPropertyValue('row-gap') && !rule.style.getPropertyValue('gap')) {
                rule.style.setProperty('row-gap', rowGapVal);
            }
        } else if (kebabProperty === 'column-gap' || kebabProperty === 'row-gap') {
            // longhand 설정 시 기존 gap shorthand가 있으면 스킵 (shorthand가 이미 커버)
            if (!rule.style.getPropertyValue('gap') && !rule.style.getPropertyValue(kebabProperty)) {
                rule.style.setProperty(kebabProperty, value);
            }
        } else {
            // 일반 속성: 기존 값이 없을 때만 설정
            if (!rule.style.getPropertyValue(kebabProperty)) {
                rule.style.setProperty(kebabProperty, value);
            }
        }
    }

    /**
     * Add or update a CSS rule within a media query (without saving)
     * @param {string} property - CSS property (camelCase)
     * @param {string} value - CSS value
     * @param {number} maxWidth - Max width for the media query
     * @returns {boolean} Whether rule was added/updated
     */
    async addCSSRuleInMediaQueryNoSave(property, value, maxWidth, targetSelector = null) {
        if (!this.selectedElement || !value) {
            return false;
        }

        // ★ 호출자가 부스팅 완료된 셀렉터를 전달한 경우 그대로 사용
        let selector = targetSelector;

        if (!selector) {
            // 하위호환: 셀렉터가 전달되지 않으면 기존 로직으로 자체 결정
            const existingRuleInfo = this.getCSSRuleInfo(property);
            if (existingRuleInfo?.selector && !this.isGenericSelector(existingRuleInfo.selector)) {
                selector = existingRuleInfo.selector;
            }
            if (!selector) {
                selector = this.getBestSelector();
            }
        }

        if (!selector) {
            return false;
        }

        const kebabProperty = this.toKebabCase(property);
        const rule = this.findOrCreateRuleInMediaQuery(selector, maxWidth);

        if (rule) {
            rule.style.setProperty(kebabProperty, value);
            return true;
        }
        return false;
    }

    /**
     * Change media query breakpoint value
     * @param {number} oldWidth - Old breakpoint width
     * @param {number} newWidth - New breakpoint width
     */
    changeMediaQueryBreakpoint(oldWidth, newWidth) {
        if (!this.previewWindow) return;

        const mainSheet = this.getMainStylesheet();
        if (!mainSheet || !mainSheet.cssRules) return;

        // ★ findOrCreateMediaRule()과 동일하게 +1px 적용
        const normalizeCondition = (w) => `(max-width: ${w + 1}px)`;
        const oldCondition = normalizeCondition(oldWidth);
        const newCondition = normalizeCondition(newWidth);

        // Find all @media rules with old condition
        const rulesToMove = [];
        for (let i = mainSheet.cssRules.length - 1; i >= 0; i--) {
            const rule = mainSheet.cssRules[i];
            if (rule.type === CSSRule.MEDIA_RULE) {
                const conditionText = rule.conditionText || rule.media.mediaText || '';
                const normalized = conditionText.replace(/\s+/g, ' ').replace(/:\s*/g, ': ').trim();
                if (normalized === oldCondition) {
                    // Save inner rules
                    const innerRules = [];
                    for (let j = 0; j < rule.cssRules.length; j++) {
                        innerRules.push(rule.cssRules[j].cssText);
                    }
                    rulesToMove.push({ index: i, innerRules });
                }
            }
        }

        // Delete old rules and create new ones
        rulesToMove.forEach(({ index, innerRules }) => {
            mainSheet.deleteRule(index);

            // Create new media query with new condition
            if (innerRules.length > 0) {
                const newMediaRule = `@media ${newCondition} { ${innerRules.join(' ')} }`;
                try {
                    mainSheet.insertRule(newMediaRule, mainSheet.cssRules.length);
                } catch (e) {
                    console.warn('Failed to insert media rule:', e);
                }
            }
        });

        // Also update zaemit-temp-styles if exists
        const doc = this.previewWindow.document;
        const tempStyle = doc?.getElementById('zaemit-temp-styles');
        if (tempStyle?.sheet) {
            const tempSheet = tempStyle.sheet;
            const tempRulesToMove = [];
            for (let i = tempSheet.cssRules.length - 1; i >= 0; i--) {
                const rule = tempSheet.cssRules[i];
                if (rule.type === CSSRule.MEDIA_RULE) {
                    const conditionText = rule.conditionText || rule.media.mediaText || '';
                    const normalized = conditionText.replace(/\s+/g, ' ').replace(/:\s*/g, ': ').trim();
                    if (normalized === oldCondition) {
                        const innerRules = [];
                        for (let j = 0; j < rule.cssRules.length; j++) {
                            innerRules.push(rule.cssRules[j].cssText);
                        }
                        tempRulesToMove.push({ index: i, innerRules });
                    }
                }
            }
            tempRulesToMove.forEach(({ index, innerRules }) => {
                tempSheet.deleteRule(index);
                if (innerRules.length > 0) {
                    const newMediaRule = `@media ${newCondition} { ${innerRules.join(' ')} }`;
                    try {
                        tempSheet.insertRule(newMediaRule, tempSheet.cssRules.length);
                    } catch (e) {
                        console.warn('Failed to insert temp media rule:', e);
                    }
                }
            });
        }
    }

    /**
     * 요소에 적용되는 모든 CSS 규칙에서 특정 속성을 제거하거나 새 값으로 업데이트
     * 인라인 스타일, 여러 CSS 규칙, 미디어쿼리 내 규칙 모두 처리
     * @param {HTMLElement} element - 대상 요소
     * @param {string} property - CSS 속성 (camelCase)
     * @param {string|null} newValue - 새 값 (null이면 제거만)
     * @param {Document} doc - 요소의 document
     * @param {string|null} excludeSelector - 이 셀렉터는 제외 (우리가 설정하려는 규칙)
     */
    clearConflictingStyles(element, property, newValue = null, doc = null, excludeSelector = null) {
        if (!element) return;

        const targetDoc = doc || element.ownerDocument;
        if (!targetDoc) return;

        const kebabProp = this.toKebabCase(property);

        // 1. 인라인 스타일 제거
        // ★ gap shorthand 인라인 분리: column-gap/row-gap 제거 시 인라인 gap도 분리
        if (kebabProp === 'column-gap' || kebabProp === 'row-gap') {
            const inlineGap = element.style.getPropertyValue('gap');
            if (inlineGap) {
                const parts = inlineGap.trim().split(/\s+/);
                const rowVal = parts[0];
                const colVal = parts.length > 1 ? parts[1] : parts[0];
                element.style.removeProperty('gap');
                if (kebabProp === 'column-gap') {
                    element.style.setProperty('row-gap', rowVal);
                } else {
                    element.style.setProperty('column-gap', colVal);
                }
            }
        }
        element.style.removeProperty(kebabProp);

        // 2. CSS 규칙에서는 관련 속성도 제거 (shorthand/longhand 관계)
        const relatedProps = this._getRelatedProperties(kebabProp);
        for (const sheet of targetDoc.styleSheets) {
            try {
                for (const prop of relatedProps) {
                    this._clearPropertyFromRules(sheet.cssRules, element, prop, null, excludeSelector);
                }
            } catch (e) {
                // CORS 등으로 접근 불가한 스타일시트는 건너뜀
            }
        }
    }

    /**
     * CSS 속성의 shorthand/longhand 관계 속성들 반환
     * @param {string} kebabProp - kebab-case 속성명
     * @returns {string[]} 관련 속성 배열 (자기 자신 포함)
     */
    _getRelatedProperties(kebabProp) {
        const props = [kebabProp];

        // border 관련
        if (kebabProp.startsWith('border-')) {
            // border-top, border-right, border-bottom, border-left
            if (/^border-(top|right|bottom|left)$/.test(kebabProp)) {
                props.push('border');
            }
            // border-top-width, border-top-style, border-top-color 등
            else if (/^border-(top|right|bottom|left)-(width|style|color)$/.test(kebabProp)) {
                const match = kebabProp.match(/^border-(top|right|bottom|left)-(width|style|color)$/);
                if (match) {
                    const side = match[1];
                    const type = match[2];
                    props.push(`border-${side}`);      // border-top
                    props.push(`border-${type}`);      // border-width
                    props.push('border');              // border
                }
            }
            // border-width, border-style, border-color
            else if (/^border-(width|style|color)$/.test(kebabProp)) {
                props.push('border');
            }
            // border-radius 관련
            else if (kebabProp.includes('radius')) {
                props.push('border-radius');
            }
        }

        // margin/padding 관련
        if (/^(margin|padding)-(top|right|bottom|left)$/.test(kebabProp)) {
            const match = kebabProp.match(/^(margin|padding)/);
            if (match) {
                props.push(match[1]); // margin 또는 padding shorthand
            }
        }

        // gap 관련 (shorthand ↔ longhand)
        if (kebabProp === 'column-gap' || kebabProp === 'row-gap') {
            props.push('gap'); // longhand 변경 시 shorthand도 정리
        } else if (kebabProp === 'gap') {
            props.push('column-gap', 'row-gap'); // shorthand 변경 시 longhand도 정리
        }

        return [...new Set(props)]; // 중복 제거
    }

    /**
     * Clean up gap shorthand/longhand conflicts in a CSS rule.
     * - Setting `gap` shorthand: remove existing `column-gap` and `row-gap` longhands
     * - Setting `column-gap` or `row-gap`: split existing `gap` shorthand into longhands
     * @param {CSSStyleRule} rule - The CSS rule to clean up
     * @param {string} kebabProp - The property being set
     */
    _cleanupGapConflict(rule, kebabProp) {
        if (!rule) return;

        if (kebabProp === 'gap') {
            // Setting shorthand → remove longhands (shorthand will cover both)
            rule.style.removeProperty('column-gap');
            rule.style.removeProperty('row-gap');
        } else if (kebabProp === 'column-gap' || kebabProp === 'row-gap') {
            // Setting longhand → split shorthand into longhands
            const gapValue = rule.style.getPropertyValue('gap');
            if (!gapValue) return;

            const parts = gapValue.trim().split(/\s+/);
            const rowGapVal = parts[0];
            const colGapVal = parts.length > 1 ? parts[1] : parts[0];

            rule.style.removeProperty('gap');
            // Set the other longhand only if it doesn't already exist
            if (kebabProp === 'column-gap' && !rule.style.getPropertyValue('row-gap')) {
                rule.style.setProperty('row-gap', rowGapVal);
            } else if (kebabProp === 'row-gap' && !rule.style.getPropertyValue('column-gap')) {
                rule.style.setProperty('column-gap', colGapVal);
            }
        }
    }

    /**
     * CSS 규칙 목록에서 특정 속성 제거/업데이트 (재귀적으로 미디어쿼리 내부도 처리)
     * @private
     */
    _clearPropertyFromRules(rules, element, kebabProp, newValue, excludeSelector) {
        if (!rules) return;

        for (const rule of rules) {
            if (rule.type === 1) { // CSSStyleRule
                // 제외할 셀렉터면 건너뜀
                if (excludeSelector && rule.selectorText === excludeSelector) continue;

                // 요소가 이 셀렉터와 매치되는지 확인
                try {
                    if (element.matches(rule.selectorText)) {
                        // 해당 속성이 있으면 처리
                        if (rule.style.getPropertyValue(kebabProp)) {
                            if (newValue !== null) {
                                // 새 값으로 업데이트
                                rule.style.setProperty(kebabProp, newValue);
                            } else {
                                // 값 제거
                                rule.style.removeProperty(kebabProp);
                            }
                        }
                    }
                } catch (e) {
                    // 잘못된 셀렉터는 건너뜀
                }
            } else if (rule.type === 4) { // CSSMediaRule
                // 미디어쿼리 안의 규칙도 재귀적으로 처리
                this._clearPropertyFromRules(rule.cssRules, element, kebabProp, newValue, excludeSelector);
            }
        }
    }

    /**
     * 여러 요소에 대해 충돌하는 스타일 제거 (멀티뷰용)
     * @param {Array} elementsInfo - [{ element, doc }] 배열
     * @param {Array} properties - CSS 속성 배열 (camelCase)
     * @param {string|null} newValue - 새 값 (null이면 제거만)
     * @param {string|null} excludeSelector - 제외할 셀렉터
     */
    clearConflictingStylesMultiple(elementsInfo, properties, newValue = null, excludeSelector = null) {
        for (const { element, doc } of elementsInfo) {
            for (const property of properties) {
                this.clearConflictingStyles(element, property, newValue, doc, excludeSelector);
            }
        }
    }

    /**
     * Remove media query breakpoint
     * @param {number} width - Breakpoint width to remove
     */
    removeMediaQueryBreakpoint(width) {
        if (!this.previewWindow) return;

        // ★ findOrCreateMediaRule()과 동일하게 +1px 적용
        const targetCondition = `(max-width: ${width + 1}px)`;

        // Remove from main stylesheet
        const mainSheet = this.getMainStylesheet();
        if (mainSheet && mainSheet.cssRules) {
            for (let i = mainSheet.cssRules.length - 1; i >= 0; i--) {
                const rule = mainSheet.cssRules[i];
                if (rule.type === CSSRule.MEDIA_RULE) {
                    const conditionText = rule.conditionText || rule.media.mediaText || '';
                    const normalized = conditionText.replace(/\s+/g, ' ').replace(/:\s*/g, ': ').trim();
                    if (normalized === targetCondition) {
                        mainSheet.deleteRule(i);
                    }
                }
            }
        }

        // Also remove from zaemit-temp-styles if exists
        const doc = this.previewWindow.document;
        const tempStyle = doc?.getElementById('zaemit-temp-styles');
        if (tempStyle?.sheet) {
            const tempSheet = tempStyle.sheet;
            for (let i = tempSheet.cssRules.length - 1; i >= 0; i--) {
                const rule = tempSheet.cssRules[i];
                if (rule.type === CSSRule.MEDIA_RULE) {
                    const conditionText = rule.conditionText || rule.media.mediaText || '';
                    const normalized = conditionText.replace(/\s+/g, ' ').replace(/:\s*/g, ': ').trim();
                    if (normalized === targetCondition) {
                        tempSheet.deleteRule(i);
                    }
                }
            }
        }
    }
}

export default BaseStyleSection;
