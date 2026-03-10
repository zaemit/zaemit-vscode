import EventEmitter from './EventEmitter.js';

/**
 * ResponsiveBreakManager - Handles responsive line breaks in text
 */
class ResponsiveBreakManager extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.styleManager = null;
    }

    /**
     * Initialize the manager
     * @param {HTMLIFrameElement} previewFrame
     */
    init(previewFrame) {
        this.previewFrame = previewFrame;

        // Setup iframe load listener to add indicators
        this.previewFrame.addEventListener('load', () => {
            this.addIndicatorsToExistingBRs();
            this.setupBrClickHandlers();
        });
    }

    /**
     * Set reference to StyleManager for breakpoint info
     * @param {Object} styleManager
     */
    setStyleManager(styleManager) {
        this.styleManager = styleManager;
    }

    /**
     * Insert a responsive line break at cursor position
     * @param {Object} currentSelection - Selection object with sel, range, isCursor
     */
    async insertResponsiveLineBreak(currentSelection) {
        if (!currentSelection) {
            this.emit('toast', { message: 'Place cursor where you want the line break', type: 'info' });
            return;
        }

        const doc = this.previewFrame.contentDocument;
        const { range, isCursor } = currentSelection;

        // If text is selected, collapse to end of selection
        if (!isCursor) {
            range.collapse(false);
        }

        try {
            // Get selected breakpoints from StyleManager
            const mediaBreakpoints = this.styleManager?.getMediaQueryBreakpoints() || [];
            const isPCSelected = this.styleManager?.isPCSelected() ?? true;

            // Create the BR element
            const br = doc.createElement('br');

            // If specific breakpoints are selected, add a class for responsive control
            let isResponsive = false;
            let brClass = '';
            if (mediaBreakpoints.length > 0 || !isPCSelected) {
                isResponsive = true;
                brClass = `br-responsive-${Date.now()}`;
                br.className = brClass;

                // Add CSS rules for responsive behavior
                await this.addResponsiveBreakRules(brClass, mediaBreakpoints, isPCSelected);
            }

            // Insert BR at cursor position
            range.insertNode(br);

            // Add visual indicator badge for responsive BR
            if (isResponsive) {
                const indicator = doc.createElement('span');
                indicator.className = 'br-indicator';
                indicator.dataset.brClass = brClass;
                const bpText = mediaBreakpoints.length > 0 ? mediaBreakpoints.join('/') : 'responsive';
                indicator.textContent = bpText;
                indicator.title = `Line break shown at: ${mediaBreakpoints.join('px, ')}px. Click to delete.`;
                br.parentNode.insertBefore(indicator, br.nextSibling);
            }

            // Move cursor after the BR
            const newRange = doc.createRange();
            newRange.setStartAfter(br);
            newRange.collapse(true);

            const sel = this.previewFrame.contentWindow.getSelection();
            sel.removeAllRanges();
            sel.addRange(newRange);

            // Hide toolbar and emit events
            document.getElementById('textSelectionToolbar')?.classList.remove('visible');
            this.emit('break:inserted');

            // Show feedback
            if (mediaBreakpoints.length > 0) {
                const bpStr = mediaBreakpoints.join('px, ') + 'px';
                this.emit('toast', { message: `Line break added for: ${bpStr}`, type: 'success' });
            } else {
                this.emit('toast', { message: 'Line break added', type: 'success' });
            }

        } catch (err) {
            console.error('Error inserting line break:', err);
            this.emit('toast', { message: 'Failed to insert line break', type: 'error' });
        }
    }

    /**
     * Add CSS rules for responsive line break
     * @param {string} brClass
     * @param {Array} breakpoints
     * @param {boolean} isPCSelected
     */
    async addResponsiveBreakRules(brClass, breakpoints, isPCSelected) {
        const doc = this.previewFrame.contentDocument;

        // Find style.css stylesheet
        let mainSheet = null;
        for (const sheet of doc.styleSheets) {
            if (sheet.href && sheet.href.includes('style.css')) {
                mainSheet = sheet;
                break;
            }
        }

        if (!mainSheet) {
            console.warn('No style.css found for responsive break rules');
            return;
        }

        try {
            // If PC is not selected, hide by default and show only on specific breakpoints
            if (!isPCSelected && breakpoints.length > 0) {
                mainSheet.insertRule(`.${brClass} { display: none; }`, mainSheet.cssRules.length);

                for (const maxWidth of breakpoints) {
                    const mediaRule = `@media (max-width: ${maxWidth}px) { .${brClass} { display: inline; } }`;
                    mainSheet.insertRule(mediaRule, mainSheet.cssRules.length);
                }
            }

            // Emit event to save CSS
            this.emit('css:changed');

        } catch (err) {
            console.error('Error adding responsive break rules:', err);
        }
    }

    /**
     * Add visual indicators to existing responsive BR elements
     */
    addIndicatorsToExistingBRs() {
        const doc = this.previewFrame?.contentDocument;
        if (!doc) return;

        const responsiveBRs = doc.querySelectorAll('br[class*="br-responsive-"]');

        responsiveBRs.forEach(br => {
            // Skip if indicator already exists
            const nextSibling = br.nextSibling;
            if (nextSibling && nextSibling.classList && nextSibling.classList.contains('br-indicator')) {
                return;
            }

            const brClass = br.className;
            const indicator = doc.createElement('span');
            indicator.className = 'br-indicator';
            indicator.dataset.brClass = brClass;

            const breakpoints = this.getBreakpointsFromCSS(brClass);
            const bpText = breakpoints.length > 0 ? breakpoints.join('/') : 'responsive';
            indicator.textContent = bpText;
            indicator.title = breakpoints.length > 0
                ? `Line break shown at: ${breakpoints.join('px, ')}px. Click to delete.`
                : 'Click to delete this responsive line break';
            br.parentNode.insertBefore(indicator, br.nextSibling);
        });
    }

    /**
     * Setup click handlers for BR elements and indicators
     */
    setupBrClickHandlers() {
        const doc = this.previewFrame?.contentDocument;
        if (!doc) return;

        doc.addEventListener('click', (e) => {
            // Handle indicator click
            if (e.target.classList.contains('br-indicator')) {
                e.preventDefault();
                e.stopPropagation();
                this.handleBrIndicatorClick(e.target);
                return;
            }

            // Handle responsive BR click
            if (e.target.tagName === 'BR' && e.target.className.includes('br-responsive-')) {
                e.preventDefault();
                e.stopPropagation();
                this.handleResponsiveBrClick(e.target);
            }
        });
    }

    /**
     * Extract breakpoint values from CSS rules for a BR class
     * @param {string} brClass
     * @returns {Array}
     */
    getBreakpointsFromCSS(brClass) {
        const doc = this.previewFrame?.contentDocument;
        if (!doc) return [];

        const breakpoints = [];
        try {
            for (const sheet of doc.styleSheets) {
                if (!sheet.cssRules) continue;
                for (const rule of sheet.cssRules) {
                    if (rule.type === CSSRule.MEDIA_RULE) {
                        const mediaText = rule.conditionText || rule.media?.mediaText || '';
                        for (const innerRule of rule.cssRules) {
                            if (innerRule.selectorText?.includes(brClass)) {
                                const match = mediaText.match(/max-width:\s*(\d+)px/);
                                if (match) {
                                    breakpoints.push(parseInt(match[1]));
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Cross-origin or other errors
        }
        return breakpoints.sort((a, b) => b - a);
    }

    /**
     * Handle click on BR indicator badge
     * @param {HTMLElement} indicator
     */
    handleBrIndicatorClick(indicator) {
        const doc = this.previewFrame.contentDocument;

        // Clear other selected indicators
        doc.querySelectorAll('.br-indicator.selected').forEach(other => {
            if (other !== indicator) other.classList.remove('selected');
        });

        if (indicator.classList.contains('selected')) {
            // Second click - delete
            const brClass = indicator.dataset.brClass;
            const br = doc.querySelector(`br[class="${brClass}"]`) || doc.querySelector(`br.${CSS.escape(brClass)}`);
            if (br) {
                this.deleteResponsiveBrWithIndicator(br, indicator);
            } else {
                indicator.remove();
                this.emit('break:deleted');
            }
        } else {
            // First click - select
            indicator.classList.add('selected');
            indicator.textContent = '↵ ✕ Delete';
            this.emit('toast', { message: 'Click again to delete this line break', type: 'info' });
        }
    }

    /**
     * Handle click on responsive BR element
     * @param {HTMLElement} br
     */
    handleResponsiveBrClick(br) {
        const doc = this.previewFrame.contentDocument;

        // Clear other selected BRs
        doc.querySelectorAll('br.br-selected').forEach(other => {
            if (other !== br) other.classList.remove('br-selected');
        });

        if (br.classList.contains('br-selected')) {
            // Second click - delete
            this.deleteResponsiveBr(br);
        } else {
            // First click - select
            br.classList.add('br-selected');
            this.emit('toast', { message: 'Click again to delete this line break', type: 'info' });
        }
    }

    /**
     * Delete a responsive BR element with its indicator
     * @param {HTMLElement} br
     * @param {HTMLElement} indicator
     */
    async deleteResponsiveBrWithIndicator(br, indicator) {
        const brClass = br.className;

        try {
            br.remove();
            indicator.remove();

            await this.removeResponsiveBrRules(brClass);

            this.emit('break:deleted');
            this.emit('toast', { message: 'Line break deleted', type: 'success' });

        } catch (err) {
            console.error('Error deleting responsive BR:', err);
            this.emit('toast', { message: 'Failed to delete line break', type: 'error' });
        }
    }

    /**
     * Delete a responsive BR element
     * @param {HTMLElement} br
     */
    async deleteResponsiveBr(br) {
        const brClass = br.className.replace('br-selected', '').trim();

        try {
            br.remove();

            await this.removeResponsiveBrRules(brClass);

            this.emit('break:deleted');
            this.emit('toast', { message: 'Line break deleted', type: 'success' });

        } catch (err) {
            console.error('Error deleting responsive BR:', err);
            this.emit('toast', { message: 'Failed to delete line break', type: 'error' });
        }
    }

    /**
     * Remove CSS rules associated with a responsive BR class
     * @param {string} brClass
     */
    async removeResponsiveBrRules(brClass) {
        const doc = this.previewFrame.contentDocument;

        let mainSheet = null;
        for (const sheet of doc.styleSheets) {
            if (sheet.href && sheet.href.includes('style.css')) {
                mainSheet = sheet;
                break;
            }
        }

        if (!mainSheet) return;

        try {
            const rulesToDelete = [];
            for (let i = 0; i < mainSheet.cssRules.length; i++) {
                const rule = mainSheet.cssRules[i];
                const ruleText = rule.cssText || '';

                if (ruleText.includes(brClass)) {
                    rulesToDelete.push(i);
                }
            }

            // Delete in reverse order
            for (let i = rulesToDelete.length - 1; i >= 0; i--) {
                mainSheet.deleteRule(rulesToDelete[i]);
            }

            this.emit('css:changed');

        } catch (err) {
            console.error('Error removing BR CSS rules:', err);
        }
    }
}

export default ResponsiveBreakManager;
