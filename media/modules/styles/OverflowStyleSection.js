import BaseStyleSection from './BaseStyleSection.js';

/**
 * OverflowStyleSection - Handles overflow-x and overflow-y
 */
class OverflowStyleSection extends BaseStyleSection {
    constructor(editor) {
        super(editor);
    }

    setupHandlers() {
        this.setupButtonGroup('styleOverflowXGroup', 'overflowX');
        this.setupButtonGroup('styleOverflowYGroup', 'overflowY');
    }

    updateUI(computed, inline) {
        // Show computed values for button groups
        this.setButtonGroup('styleOverflowXGroup', inline.overflowX, computed.overflowX, 'overflowX');
        this.setButtonGroup('styleOverflowYGroup', inline.overflowY, computed.overflowY, 'overflowY');
    }
}

export default OverflowStyleSection;
