import EventEmitter from './EventEmitter.js';

/**
 * AutoSaveManager - Handles automatic saving and recovery
 */
class AutoSaveManager extends EventEmitter {
    constructor(projectId) {
        super();
        this.projectId = projectId;
        this.autoSaveTimeout = null;
        this.autoSaveDelay = 5 * 60 * 1000; // 5 minutes
        this.autoSaveMinDelay = 5 * 60 * 1000; // 5 minutes after manual save
        this.lastManualSaveTime = null;
        this.sessionId = this.generateSessionId();
        this.dismissedAutoSave = false;
        this.hasUnsavedChanges = false;
        this.paused = false;
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Mark that there are unsaved changes
     */
    markChanged() {
        this.hasUnsavedChanges = true;
        this.scheduleAutoSave();
    }

    /**
     * Mark as saved
     */
    markSaved() {
        this.hasUnsavedChanges = false;
    }

    /**
     * Schedule auto-save
     */
    scheduleAutoSave() {
        if (this.paused) return;

        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Check if we should delay auto-save after manual save
        if (this.lastManualSaveTime) {
            const timeSinceManualSave = Date.now() - this.lastManualSaveTime;
            if (timeSinceManualSave < this.autoSaveMinDelay) {
                // Schedule for later
                this.autoSaveTimeout = setTimeout(() => {
                    this.scheduleAutoSave();
                }, this.autoSaveMinDelay - timeSinceManualSave);
                return;
            }
        }

        this.autoSaveTimeout = setTimeout(() => {
            this.triggerAutoSave();
        }, this.autoSaveDelay);
    }

    /**
     * Trigger auto-save
     */
    async triggerAutoSave() {
        if (!this.hasUnsavedChanges) return;

        // Emit event for EditorApp to perform actual save
        this.emit('autosave:trigger');
    }

    /**
     * Called by EditorApp after successful save
     */
    onSaveComplete() {
        this.hasUnsavedChanges = false;
        this.emit('autosave:success');
    }

    /**
     * Record manual save time
     */
    recordManualSave() {
        this.lastManualSaveTime = Date.now();
        this.hasUnsavedChanges = false;

        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
    }

    /**
     * Check for auto-save recovery
     */
    async checkRecovery() {
        if (this.dismissedAutoSave) return null;

        try {
            const response = await fetch(`/api/projects/${this.projectId}/autosave`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.sessionId !== this.sessionId) {
                    this.emit('recovery:available', data);
                    return data;
                }
            }
        } catch (err) {
            console.error('Failed to check recovery:', err);
        }
        return null;
    }

    /**
     * Recover from auto-save
     */
    async recover() {
        try {
            const response = await fetch(`/api/projects/${this.projectId}/autosave/recover`, {
                method: 'POST'
            });

            if (response.ok) {
                const result = await response.json();
                this.emit('recovery:success', result);
                return result;
            }
        } catch (err) {
            console.error('Recovery failed:', err);
            this.emit('recovery:error', err);
        }
        return null;
    }

    /**
     * Dismiss recovery
     */
    dismissRecovery() {
        this.dismissedAutoSave = true;
        this.emit('recovery:dismissed');
    }

    /**
     * Clear auto-save data
     */
    async clearAutoSave() {
        try {
            await fetch(`/api/projects/${this.projectId}/autosave`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.error('Failed to clear auto-save:', err);
        }
    }

    /**
     * Stop auto-save
     */
    stop() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
    }

    /**
     * Pause auto-save
     */
    pause() {
        this.paused = true;
        this.stop();
    }

    /**
     * Resume auto-save
     */
    resume() {
        this.paused = false;
        if (this.hasUnsavedChanges) {
            this.scheduleAutoSave();
        }
    }

    /**
     * Check if auto-save is paused
     */
    isPaused() {
        return this.paused;
    }

    /**
     * Check if there are unsaved changes
     */
    hasChanges() {
        return this.hasUnsavedChanges;
    }
}

export default AutoSaveManager;
