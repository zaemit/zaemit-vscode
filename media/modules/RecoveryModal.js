import EventEmitter from './EventEmitter.js';

/**
 * RecoveryModal - Handles auto-save recovery modal
 */
class RecoveryModal extends EventEmitter {
    constructor(autoSaveManager) {
        super();
        this.autoSaveManager = autoSaveManager;
        this.versions = [];
        this.pendingAutoSaveVersion = null;
        this.pendingManualSaveVersion = null;
    }

    /**
     * Initialize the recovery modal
     */
    init() {
        this.setupModalHandlers();
    }

    /**
     * Set versions data
     * @param {Array} versions
     */
    setVersions(versions) {
        this.versions = versions;
    }

    /**
     * Check if auto-save recovery is needed
     * @returns {boolean}
     */
    async checkRecovery() {
        if (this.versions.length === 0) return false;

        // Find auto-save version
        const autoSaveVersion = this.versions.find(v => v.isAuto === true);
        if (!autoSaveVersion) return false;

        // Find latest manual save version
        const latestManualSave = this.versions.find(v => v.isAuto !== true);

        // If no manual save exists, or auto-save is newer than manual save
        if (!latestManualSave) {
            // Auto-save exists but no manual save - show recovery
            this.showModal(autoSaveVersion, null);
            return true;
        }

        const autoSaveTime = new Date(autoSaveVersion.createdAt);
        const manualSaveTime = new Date(latestManualSave.createdAt);

        if (autoSaveTime > manualSaveTime) {
            // Auto-save is newer - show recovery modal
            this.showModal(autoSaveVersion, latestManualSave);
            return true;
        }

        return false;
    }

    /**
     * Show the recovery modal
     * @param {Object} autoSaveVersion
     * @param {Object|null} latestManualSave
     */
    showModal(autoSaveVersion, latestManualSave) {
        const modal = document.getElementById('autoSaveRecoveryModal');
        const infoEl = document.getElementById('autoSaveRecoveryInfo');

        if (!modal || !infoEl) return;

        const autoSaveDate = new Date(autoSaveVersion.createdAt);
        const formattedAutoSave = autoSaveDate.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let infoText = `Auto-save time: ${formattedAutoSave}`;

        if (latestManualSave) {
            const manualSaveDate = new Date(latestManualSave.createdAt);
            const formattedManual = manualSaveDate.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            infoText += `<br>Manual save time: ${formattedManual} (${latestManualSave.message})`;
        }

        infoEl.innerHTML = infoText;

        // Store version info for handlers
        this.pendingAutoSaveVersion = autoSaveVersion;
        this.pendingManualSaveVersion = latestManualSave;

        modal.classList.remove('hidden');
    }

    /**
     * Hide the modal
     */
    hideModal() {
        const modal = document.getElementById('autoSaveRecoveryModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Setup modal button handlers
     */
    setupModalHandlers() {
        // Close button
        const closeBtn = document.getElementById('closeAutoSaveRecoveryModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideModal();
                this.handleDismiss();
            });
        }

        // Dismiss button (load manual save)
        const dismissBtn = document.getElementById('dismissAutoSaveRecovery');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                this.hideModal();
                this.handleDismiss();
            });
        }

        // Confirm button (load auto-save)
        const confirmBtn = document.getElementById('confirmAutoSaveRecovery');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.hideModal();
                this.handleConfirm();
            });
        }
    }

    /**
     * Handle user confirming recovery
     */
    handleConfirm() {
        this.emit('recovery:confirm', {
            autoSaveVersion: this.pendingAutoSaveVersion,
            manualSaveVersion: this.pendingManualSaveVersion
        });
    }

    /**
     * Handle user dismissing recovery
     */
    handleDismiss() {
        this.emit('recovery:dismiss', {
            autoSaveVersion: this.pendingAutoSaveVersion,
            manualSaveVersion: this.pendingManualSaveVersion
        });
    }

    /**
     * Get pending auto-save version
     * @returns {Object|null}
     */
    getPendingAutoSaveVersion() {
        return this.pendingAutoSaveVersion;
    }

    /**
     * Get pending manual save version
     * @returns {Object|null}
     */
    getPendingManualSaveVersion() {
        return this.pendingManualSaveVersion;
    }
}

export default RecoveryModal;
