import BaseStyleSection from './BaseStyleSection.js';

/**
 * SizeStyleSection - Handles width, height, margin, padding, min/max sizes
 */
class SizeStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
    }

    setupHandlers() {
        // Box Model Width/Height
        this.setupStyleHandlerWithPx('boxWidth', 'width');
        this.setupStyleHandlerWithPx('boxHeight', 'height');

        // Min/Max Size
        this.setupStyleHandlerWithPx('styleMinWidth', 'minWidth');
        this.setupStyleHandlerWithPx('styleMinHeight', 'minHeight');
        this.setupStyleHandlerWithPx('styleMaxWidth', 'maxWidth');
        this.setupStyleHandlerWithPx('styleMaxHeight', 'maxHeight');

        // Margin & Padding
        ['Top', 'Right', 'Bottom', 'Left'].forEach(dir => {
            this.setupStyleHandlerWithPx(`margin${dir}`, `margin${dir}`);
            this.setupStyleHandlerWithPx(`padding${dir}`, `padding${dir}`);
        });
    }

    updateUI(computed, inline) {
        // ★ editor height-limited 요소: inline height/min-height/max-height는 에디터가 주입한 artifact
        // CSS 값을 표시하기 위해 inline 값을 무시
        let effectiveInline = inline;
        if (this.selectedElement?.dataset?.editorHeightLimited) {
            effectiveInline = { ...inline };
            delete effectiveInline.height;
            delete effectiveInline.minHeight;
            delete effectiveInline.maxHeight;
        }

        // Box Model Width/Height
        this.setValueWithCSS('boxWidth', 'width', effectiveInline, computed);
        this.setValueWithCSS('boxHeight', 'height', effectiveInline, computed);

        // Min/Max Size
        this.setValueWithCSS('styleMinWidth', 'minWidth', effectiveInline, computed, v => v === '0px');
        this.setValueWithCSS('styleMinHeight', 'minHeight', effectiveInline, computed, v => v === '0px');
        this.setValueWithCSS('styleMaxWidth', 'maxWidth', effectiveInline, computed, v => v === 'none');
        this.setValueWithCSS('styleMaxHeight', 'maxHeight', effectiveInline, computed, v => v === 'none');

        // Margin - 0px도 표시 (이전 요소 값이 남지 않도록)
        this.setValueWithCSS('marginTop', 'marginTop', inline, computed);
        this.setValueWithCSS('marginRight', 'marginRight', inline, computed);
        this.setValueWithCSS('marginBottom', 'marginBottom', inline, computed);
        this.setValueWithCSS('marginLeft', 'marginLeft', inline, computed);

        // Padding - 0px도 표시 (이전 요소 값이 남지 않도록)
        this.setValueWithCSS('paddingTop', 'paddingTop', inline, computed);
        this.setValueWithCSS('paddingRight', 'paddingRight', inline, computed);
        this.setValueWithCSS('paddingBottom', 'paddingBottom', inline, computed);
        this.setValueWithCSS('paddingLeft', 'paddingLeft', inline, computed);
    }
}

export default SizeStyleSection;
