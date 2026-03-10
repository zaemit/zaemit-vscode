import LayoutStyleSection from './LayoutStyleSection.js';
import SizeStyleSection from './SizeStyleSection.js';
import BorderStyleSection from './BorderStyleSection.js';
import TypographyStyleSection from './TypographyStyleSection.js';
import BackgroundStyleSection from './BackgroundStyleSection.js';
import EffectsStyleSection from './EffectsStyleSection.js';
import OverflowStyleSection from './OverflowStyleSection.js';

/**
 * StyleManager - Orchestrates all style sections
 * Provides a unified interface for the editor to manage styles
 */
class StyleManager {
    constructor(editor) {
        this.editor = editor;
        this.sections = {};
        this.initialized = false;
        this.currentState = ''; // '', ':hover', ':focus', ':active'
        this.breakpointMode = 'all'; // 'all' or 'current'
        this.currentViewport = 'pc'; // Current active viewport from view mode buttons
        this.selectedBreakpoints = ['pc']; // ['pc'] for base styles, or array including 'pc' and/or maxWidth values like [768, 480]
        this.availableBreakpoints = []; // Dynamically populated from view buttons
    }

    /**
     * Initialize all style sections
     */
    init() {
        if (this.initialized) return;

        // Create all section instances
        this.sections = {
            layout: new LayoutStyleSection(this.editor),
            size: new SizeStyleSection(this.editor),
            border: new BorderStyleSection(this.editor),
            typography: new TypographyStyleSection(this.editor),
            background: new BackgroundStyleSection(this.editor),
            effects: new EffectsStyleSection(this.editor),
            overflow: new OverflowStyleSection(this.editor)
        };

        // Initialize all sections
        Object.values(this.sections).forEach(section => {
            section.init();
        });

        // Setup state selector
        this.setupStateSelector();

        // Setup breakpoint selector
        this.setupBreakpointSelector();

        this.initialized = true;
    }

    /**
     * Setup state selector buttons
     */
    setupStateSelector() {
        const selector = document.getElementById('stateSelector');
        if (!selector) return;

        selector.querySelectorAll('.state-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                selector.querySelectorAll('.state-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Set current state
                this.currentState = btn.dataset.state || '';

                // Update UI to show state-specific values
                this.updateUI();
            });
        });
    }

    /**
     * Get current pseudo-class state
     * @returns {string} Current state ('', ':hover', ':focus', ':active')
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * Set current pseudo-class state
     * @param {string} state - State to set
     */
    setCurrentState(state) {
        this.currentState = state;

        // Update button UI
        const selector = document.getElementById('stateSelector');
        if (selector) {
            selector.querySelectorAll('.state-btn').forEach(btn => {
                btn.classList.toggle('active', (btn.dataset.state || '') === state);
            });
        }

        this.updateUI();
    }

    /**
     * Update all sections with current element's styles
     * CSSOM 조작(deleteRule/insertRule) 없이 CSS 규칙 조회로 hover 오염 방지
     * - setButtonGroup: prop 지정 시 CSS 규칙을 computed보다 우선 조회
     * - setValueWithCSS: 이미 inline → CSS 규칙 → computed 순서로 처리
     * - 색상/textAlign: 각 section에서 CSS 규칙 우선 조회
     */
    updateUI() {
        if (!this.editor.selectedElement) return;

        // 요소가 속한 document의 window 사용 (멀티뷰 지원)
        const win = this.editor.selectedElement.ownerDocument.defaultView;
        const computed = win.getComputedStyle(this.editor.selectedElement);
        const inline = this.editor.selectedElement.style;

        // Update all sections
        Object.values(this.sections).forEach(section => {
            section.updateUI(computed, inline);
        });
    }

    /**
     * Get a specific section by name
     * @param {string} name - Section name (layout, size, border, typography, background, effects, overflow)
     */
    getSection(name) {
        return this.sections[name];
    }

    /**
     * Get all section instances
     */
    getAllSections() {
        return this.sections;
    }

    /**
     * Setup breakpoint mode toggle (All screens / Current only)
     */
    setupBreakpointSelector() {
        this.updateAvailableBreakpoints();

        const toggle = document.querySelector('.breakpoint-mode-toggle');
        if (!toggle) return;

        // Handle mode button clicks
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.breakpoint-mode-btn');
            if (!btn) return;

            const mode = btn.dataset.mode;
            this.setBreakpointMode(mode);
        });
    }

    /**
     * Set breakpoint mode (all or current)
     * @param {string} mode - 'all' or 'current'
     */
    setBreakpointMode(mode) {
        this.breakpointMode = mode;

        // Update button states
        document.querySelectorAll('.breakpoint-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update selected breakpoints based on mode
        if (mode === 'all') {
            this.selectedBreakpoints = ['pc', ...this.availableBreakpoints];
        } else {
            // Current only
            this.selectedBreakpoints = [this.currentViewport];
        }
    }

    /**
     * Update current viewport (called by ViewModeManager)
     * @param {string} viewport - 'pc' or breakpoint width (e.g., 768)
     */
    setCurrentViewport(viewport) {
        this.currentViewport = viewport;

        // Update label
        const label = document.getElementById('currentBreakpointLabel');
        if (label) {
            label.textContent = viewport === 'pc' ? 'PC only' : `${viewport}px only`;
        }

        // If in current mode, update selectedBreakpoints
        if (this.breakpointMode === 'current') {
            this.selectedBreakpoints = [viewport];
        }
    }

    /**
     * Update available breakpoints from view buttons
     */
    updateAvailableBreakpoints() {
        const viewModes = document.getElementById('viewModes');
        if (!viewModes) return;

        this.availableBreakpoints = [];

        viewModes.querySelectorAll('.view-btn').forEach(btn => {
            const width = btn.dataset.width;
            if (width && width !== '100%') {
                const px = parseInt(width);
                if (px && !this.availableBreakpoints.includes(px)) {
                    this.availableBreakpoints.push(px);
                }
            }
        });

        // Sort descending (largest first)
        this.availableBreakpoints.sort((a, b) => b - a);

        // Update selectedBreakpoints from checkboxes
        this.updateSelectedBreakpointsFromCheckboxes();
    }

    /**
     * Update selected breakpoints from view mode checkboxes
     */
    updateSelectedBreakpointsFromCheckboxes() {
        const viewModes = document.getElementById('viewModes');
        if (!viewModes) return;

        this.selectedBreakpoints = [];

        viewModes.querySelectorAll('.view-checkbox:checked').forEach(checkbox => {
            const width = checkbox.dataset.width;
            if (width === '100%') {
                this.selectedBreakpoints.push('pc');
            } else {
                const px = parseInt(width);
                if (px) {
                    this.selectedBreakpoints.push(px);
                }
            }
        });

        // Sort: 'pc' first, then by width descending
        this.selectedBreakpoints.sort((a, b) => {
            if (a === 'pc') return -1;
            if (b === 'pc') return 1;
            return b - a;
        });
    }

    /**
     * Handle breakpoint target change from ViewModeManager
     * @param {Object} data - { width, checked, targetBreakpoints }
     */
    onBreakpointTargetChanged(data) {
        this.updateSelectedBreakpointsFromCheckboxes();
    }

    /**
     * Get selected breakpoints for applying styles
     * @returns {Array} ['pc'] for base styles, or array of 'pc' and/or maxWidth values
     */
    getSelectedBreakpoints() {
        return this.selectedBreakpoints;
    }

    /**
     * Check if PC (base styles) is selected
     * @returns {boolean}
     */
    isPCSelected() {
        return this.selectedBreakpoints.includes('pc');
    }

    /**
     * Check if only PC is selected (no media queries)
     * @returns {boolean}
     */
    isOnlyPCSelected() {
        return this.selectedBreakpoints.length === 1 && this.selectedBreakpoints[0] === 'pc';
    }

    /**
     * Get media query breakpoints (excludes 'pc')
     * @returns {Array} Array of maxWidth values
     */
    getMediaQueryBreakpoints() {
        return this.selectedBreakpoints.filter(b => b !== 'pc');
    }

    /**
     * Get current breakpoint for media query (backwards compatibility)
     * Returns the first selected breakpoint if not PC-only
     * @returns {object|null} { maxWidth: number } or null for PC/base styles
     */
    getCurrentBreakpoint() {
        if (this.isOnlyPCSelected()) {
            return null;
        }
        // Return first non-PC breakpoint for backwards compat
        const first = this.selectedBreakpoints.find(b => b !== 'pc');
        return first ? { maxWidth: first } : null;
    }

    /**
     * Set current breakpoint based on view width (for UI sync)
     * @param {string|number} width - View width ('100%' for desktop, or pixel value)
     */
    setBreakpointFromViewWidth(width) {
        // Update available breakpoints when view changes
        this.updateAvailableBreakpoints();
    }

    /**
     * Change media query breakpoint value in CSS
     * @param {number} oldWidth - Old breakpoint width
     * @param {number} newWidth - New breakpoint width
     */
    changeMediaQueryBreakpoint(oldWidth, newWidth) {
        // Use first available section to call the method
        const firstSection = Object.values(this.sections)[0];
        if (firstSection && typeof firstSection.changeMediaQueryBreakpoint === 'function') {
            firstSection.changeMediaQueryBreakpoint(oldWidth, newWidth);
        }
    }

    /**
     * Remove media query breakpoint from CSS
     * @param {number} width - Breakpoint width to remove
     */
    removeMediaQueryBreakpoint(width) {
        // Use first available section to call the method
        const firstSection = Object.values(this.sections)[0];
        if (firstSection && typeof firstSection.removeMediaQueryBreakpoint === 'function') {
            firstSection.removeMediaQueryBreakpoint(width);
        }
    }

    /**
     * Get all available breakpoints (sorted descending)
     * @returns {number[]}
     */
    getAllBreakpoints() {
        return [...this.availableBreakpoints];
    }

    /**
     * Get OFF breakpoints that are smaller than the smallest ON breakpoint
     * Used for cascade prevention - need to save existing values to these breakpoints
     *
     * Example:
     * - availableBreakpoints: [1200, 1024, 768, 375]
     * - selectedBreakpoints (ON): [1024]
     * - Returns: [768] (the first OFF breakpoint smaller than 1024)
     *
     * @returns {number|null} The first OFF breakpoint to save existing value, or null
     */
    getFirstOffBreakpointBelow() {
        console.log('[getFirstOffBreakpointBelow] selectedBreakpoints:', this.selectedBreakpoints);
        console.log('[getFirstOffBreakpointBelow] availableBreakpoints:', this.availableBreakpoints);

        // Get smallest ON breakpoint (excluding 'pc')
        const onBreakpoints = this.selectedBreakpoints.filter(b => b !== 'pc');
        console.log('[getFirstOffBreakpointBelow] onBreakpoints (non-pc):', onBreakpoints);

        if (onBreakpoints.length === 0) {
            console.log('[getFirstOffBreakpointBelow] No non-pc breakpoints, returning null');
            return null; // No media query breakpoints selected
        }

        // Find smallest ON breakpoint
        const smallestOn = Math.min(...onBreakpoints);
        console.log('[getFirstOffBreakpointBelow] smallestOn:', smallestOn);

        // Find OFF breakpoints smaller than smallest ON
        const offBelow = this.availableBreakpoints.filter(bp =>
            bp < smallestOn && !this.selectedBreakpoints.includes(bp)
        );
        console.log('[getFirstOffBreakpointBelow] offBelow:', offBelow);

        if (offBelow.length === 0) {
            console.log('[getFirstOffBreakpointBelow] No OFF breakpoints below, returning null');
            return null;
        }

        // Return the largest OFF breakpoint below (first in sorted array)
        // This is enough to prevent cascade - smaller ones will inherit from this
        const result = Math.max(...offBelow);
        console.log('[getFirstOffBreakpointBelow] returning:', result);
        return result;
    }
}

export default StyleManager;
