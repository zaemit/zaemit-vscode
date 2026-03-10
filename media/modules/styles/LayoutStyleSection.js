import BaseStyleSection from './BaseStyleSection.js';

/**
 * LayoutStyleSection - Handles display, position, z-index, flexbox, and grid styles
 */
class LayoutStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
    }

    setupHandlers() {
        // Display button group with flex/grid section toggle
        this.setupDisplayButtonGroup();

        // Position button group with position fields toggle
        this.setupPositionButtonGroup();

        // Position inputs
        this.setupStyleHandlerWithPx('styleTop', 'top');
        this.setupStyleHandlerWithPx('styleRight', 'right');
        this.setupStyleHandlerWithPx('styleBottom', 'bottom');
        this.setupStyleHandlerWithPx('styleLeft', 'left');

        // Float
        this.setupButtonGroup('styleFloatGroup', 'cssFloat');

        // Z-Index
        this.setupStyleHandler('styleZIndex', 'zIndex');

        // Direction (ltr/rtl)
        this.setupButtonGroup('styleDirectionGroup', 'direction');

        // Flexbox
        this.setupButtonGroup('styleFlexDirectionGroup', 'flexDirection');
        this.setupButtonGroup('styleFlexWrapGroup', 'flexWrap');
        this.setupButtonGroup('styleJustifyContentGroup', 'justifyContent');
        this.setupButtonGroup('styleAlignItemsGroup', 'alignItems');
        this.setupButtonGroup('styleAlignContentGroup', 'alignContent');
        this.setupStyleHandlerWithPx('styleGap', 'gap');
        this.setupStyleHandler('styleFlex', 'flex');

        // Grid
        this.setupButtonGroup('styleGridAutoFlowGroup', 'gridAutoFlow');
        this.setupStyleHandler('styleGridTemplateColumns', 'gridTemplateColumns');
        this.setupStyleHandler('styleGridTemplateRows', 'gridTemplateRows');
        this.setupStyleHandlerWithPx('styleColumnGap', 'columnGap');
        this.setupStyleHandlerWithPx('styleRowGap', 'rowGap');
        this.setupButtonGroup('styleJustifyItemsGroup', 'justifyItems');
        this.setupButtonGroup('styleAlignItemsGridGroup', 'alignItems');
        this.setupStyleHandler('styleGridColumn', 'gridColumn');
        this.setupStyleHandler('styleGridRow', 'gridRow');
    }

    updateUI(computed, inline) {
        // Display
        const display = inline.display || this.getCSSRuleValue('display') || computed.display || 'block';
        this.setButtonGroup('styleDisplayGroup', inline.display, computed.display, 'display');
        this.updateDisplaySectionVisibility(display);

        // Position
        const position = inline.position || this.getCSSRuleValue('position') || computed.position || 'static';
        this.setButtonGroup('stylePositionGroup', inline.position, computed.position, 'position');
        this.updatePositionFieldsVisibility(position);

        // Position values - always show
        this.setValueWithCSS('styleTop', 'top', inline, computed);
        this.setValueWithCSS('styleRight', 'right', inline, computed);
        this.setValueWithCSS('styleBottom', 'bottom', inline, computed);
        this.setValueWithCSS('styleLeft', 'left', inline, computed);

        // Float
        this.setButtonGroup('styleFloatGroup', inline.cssFloat, computed.cssFloat, 'cssFloat');

        // Z-Index
        this.setValueWithCSS('styleZIndex', 'zIndex', inline, computed, v => v === 'auto');

        // Direction (ltr/rtl)
        this.setButtonGroup('styleDirectionGroup', inline.direction, computed.direction, 'direction');

        // Flexbox - show computed values for button groups when display is flex
        const isFlex = display === 'flex' || display === 'inline-flex';
        this.setButtonGroup('styleFlexDirectionGroup', inline.flexDirection, isFlex ? computed.flexDirection : '', 'flexDirection');
        this.setButtonGroup('styleFlexWrapGroup', inline.flexWrap, isFlex ? computed.flexWrap : '', 'flexWrap');
        this.setButtonGroup('styleJustifyContentGroup', inline.justifyContent, isFlex ? computed.justifyContent : '', 'justifyContent');
        this.setButtonGroup('styleAlignItemsGroup', inline.alignItems, isFlex ? computed.alignItems : '', 'alignItems');
        this.setButtonGroup('styleAlignContentGroup', inline.alignContent, isFlex ? computed.alignContent : '', 'alignContent');
        this.setValueWithCSS('styleGap', 'gap', inline, computed, v => !isFlex);
        this.setValueWithCSS('styleFlex', 'flex', inline, computed);

        // Grid - show computed values for button groups when display is grid
        const isGrid = display === 'grid' || display === 'inline-grid';
        this.setButtonGroup('styleGridAutoFlowGroup', inline.gridAutoFlow, isGrid ? computed.gridAutoFlow : '', 'gridAutoFlow');
        this.setValueWithCSS('styleGridTemplateColumns', 'gridTemplateColumns', inline, computed, v => !isGrid);
        this.setValueWithCSS('styleGridTemplateRows', 'gridTemplateRows', inline, computed, v => !isGrid);
        this.setValueWithCSS('styleColumnGap', 'columnGap', inline, computed, v => !isGrid);
        this.setValueWithCSS('styleRowGap', 'rowGap', inline, computed, v => !isGrid);
        this.setButtonGroup('styleJustifyItemsGroup', inline.justifyItems, isGrid ? computed.justifyItems : '', 'justifyItems');
        this.setButtonGroup('styleAlignItemsGridGroup', inline.alignItems, isGrid ? computed.alignItems : '', 'alignItems');
        this.setValueWithCSS('styleGridColumn', 'gridColumn', inline, computed);
        this.setValueWithCSS('styleGridRow', 'gridRow', inline, computed);
    }

    /**
     * Setup display button group with flex/grid section visibility toggle
     */
    setupDisplayButtonGroup() {
        const group = this.$('styleDisplayGroup');
        if (!group) return;

        group.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!this.selectedElement) return;

                const oldValue = this.getEffectiveCSSValue('display').value;
                const isActive = btn.classList.contains('active');
                const value = isActive ? '' : btn.dataset.value;

                group.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                if (!isActive) {
                    btn.classList.add('active');
                }

                // Use applyStyleChange to respect state (hover, focus, etc.)
                await this.applyStyleChange('display', value, oldValue);
                this.updateDisplaySectionVisibility(value);
            });
        });
    }

    /**
     * Setup position button group with position fields visibility toggle
     */
    setupPositionButtonGroup() {
        const group = this.$('stylePositionGroup');
        if (!group) return;

        group.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!this.selectedElement) return;

                const oldValue = this.getEffectiveCSSValue('position').value;
                const isActive = btn.classList.contains('active');
                const value = isActive ? '' : btn.dataset.value;

                group.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                if (!isActive) {
                    btn.classList.add('active');
                }

                // Use applyStyleChange to respect state (hover, focus, etc.)
                await this.applyStyleChange('position', value, oldValue);
                this.updatePositionFieldsVisibility(value || 'static');
            });
        });
    }

    /**
     * Toggle flex/grid sections visibility based on display value
     */
    updateDisplaySectionVisibility(display) {
        const flexSection = this.$('flexboxSection');
        const gridSection = this.$('gridSection');

        flexSection?.classList.toggle('hidden', display !== 'flex');
        gridSection?.classList.toggle('hidden', display !== 'grid');
    }

    /**
     * Toggle position fields visibility based on position value
     * Always show position fields (top, right, bottom, left)
     */
    updatePositionFieldsVisibility(position) {
        const positionFields = this.$('positionFieldsGroup');
        // Always show position fields
        positionFields?.classList.remove('hidden');
    }
}

export default LayoutStyleSection;
