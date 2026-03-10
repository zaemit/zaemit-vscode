import EventEmitter from './EventEmitter.js';

/**
 * SettingsManager - Handles editor settings and preferences
 */
class SettingsManager extends EventEmitter {
    constructor() {
        super();

        // Default settings
        this.defaults = {
            autoSave: true,
            quickTextEdit: false,
            showGrid: false,
            snapToGrid: false,
            gridSize: 10,
            darkMode: false,
            fontSize: 14,
            confirmDelete: true,
            showLayerPanel: false
        };

        this.settings = { ...this.defaults };
        this.storageKey = 'zaemit-editor-settings';

        this.load();
    }

    /**
     * Load settings from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.settings = { ...this.defaults, ...parsed };
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }

        this.emit('settings:loaded', this.settings);
    }

    /**
     * Save settings to localStorage
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            this.emit('settings:saved', this.settings);
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
    }

    /**
     * Get a setting value
     */
    get(key) {
        return this.settings[key];
    }

    /**
     * Set a setting value
     */
    set(key, value) {
        const oldValue = this.settings[key];
        this.settings[key] = value;
        this.save();

        this.emit('setting:changed', { key, value, oldValue });
        this.emit(`setting:${key}`, value);
    }

    /**
     * Toggle a boolean setting
     */
    toggle(key) {
        if (typeof this.settings[key] === 'boolean') {
            this.set(key, !this.settings[key]);
            return this.settings[key];
        }
        return null;
    }

    /**
     * Get all settings
     */
    getAll() {
        return { ...this.settings };
    }

    /**
     * Reset to defaults
     */
    reset() {
        this.settings = { ...this.defaults };
        this.save();
        this.emit('settings:reset', this.settings);
    }

    /**
     * Reset a specific setting
     */
    resetSetting(key) {
        if (key in this.defaults) {
            this.set(key, this.defaults[key]);
        }
    }

    /**
     * Import settings
     */
    import(settings) {
        this.settings = { ...this.defaults, ...settings };
        this.save();
        this.emit('settings:imported', this.settings);
    }

    /**
     * Export settings
     */
    export() {
        return JSON.stringify(this.settings, null, 2);
    }

    /**
     * Apply settings to UI elements
     */
    applyToUI() {
        // Auto-save toggle
        const autoSaveToggle = document.getElementById('autoSaveToggle');
        if (autoSaveToggle) {
            autoSaveToggle.checked = this.settings.autoSave;
        }

        // Quick text edit toggle
        const quickTextToggle = document.getElementById('quickTextEditToggle');
        if (quickTextToggle) {
            quickTextToggle.checked = this.settings.quickTextEdit;
        }

        this.emit('settings:applied');
    }

    /**
     * Setup UI event listeners
     */
    setupUI() {
        // Auto-save toggle
        const autoSaveToggle = document.getElementById('autoSaveToggle');
        if (autoSaveToggle) {
            autoSaveToggle.addEventListener('change', (e) => {
                this.set('autoSave', e.target.checked);
            });
        }

        // Quick text edit toggle
        const quickTextToggle = document.getElementById('quickTextEditToggle');
        if (quickTextToggle) {
            quickTextToggle.addEventListener('change', (e) => {
                this.set('quickTextEdit', e.target.checked);
            });
        }

        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const closeSettingsBtn = document.querySelector('.close-settings');

        if (settingsBtn && settingsPanel) {
            settingsBtn.addEventListener('click', () => {
                settingsPanel.classList.toggle('visible');
            });

            if (closeSettingsBtn) {
                closeSettingsBtn.addEventListener('click', () => {
                    settingsPanel.classList.remove('visible');
                });
            }

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!settingsPanel.contains(e.target) &&
                    !settingsBtn.contains(e.target) &&
                    settingsPanel.classList.contains('visible')) {
                    settingsPanel.classList.remove('visible');
                }
            });
        }

        this.applyToUI();
    }
}

export default SettingsManager;
