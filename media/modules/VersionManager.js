import EventEmitter from './EventEmitter.js';

/**
 * VersionManager - Handles version control operations
 */
class VersionManager extends EventEmitter {
    constructor(projectId) {
        super();
        this.projectId = projectId;
        this.versions = [];
        this.currentVersionId = null;
        this.currentPreviewVersion = null;
        this.isPreviewingVersion = false;
    }

    /**
     * Set current version ID (called from EditorApp after project load)
     */
    setCurrentVersionId(versionId) {
        this.currentVersionId = versionId;
    }

    /**
     * Load versions from server
     */
    async loadVersions() {
        try {
            const response = await fetch(`/api/projects/${this.projectId}/versions`);
            if (response.ok) {
                this.versions = await response.json();
                this.emit('versions:loaded', this.versions);
                return this.versions;
            }
        } catch (err) {
            console.error('Failed to load versions:', err);
            this.emit('versions:error', err);
        }
        return [];
    }

    /**
     * Save a new version
     * @param {string} message - Version message
     * @param {boolean} isAuto - Whether this is an auto-save
     */
    async saveVersion(message = '', isAuto = false) {
        try {
            const response = await fetch(`/api/projects/${this.projectId}/versions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, isAuto })
            });

            if (response.ok) {
                const version = await response.json();
                await this.loadVersions();
                this.emit('version:saved', version);
                return version;
            }
        } catch (err) {
            console.error('Failed to save version:', err);
            this.emit('version:error', err);
        }
        return null;
    }

    /**
     * Update current version (overwrite files)
     */
    async updateCurrentVersion() {
        // currentVersionId가 없으면 업데이트 건너뜀 (버전이 아직 생성되지 않은 경우)
        if (!this.currentVersionId) {
            return null;
        }

        try {
            const response = await fetch(
                `/api/projects/${this.projectId}/versions/current/update`,
                { method: 'POST' }
            );

            if (response.ok) {
                const result = await response.json();
                await this.loadVersions();
                this.emit('version:updated', result);
                return result;
            }
        } catch (err) {
            console.error('Failed to update current version:', err);
            this.emit('version:error', err);
        }
        return null;
    }

    /**
     * Preview a specific version
     * @param {string} versionFolder - Version folder name
     */
    async previewVersion(versionFolder) {
        try {
            this.currentPreviewVersion = versionFolder;
            this.isPreviewingVersion = true;
            // Emit event - iframe will load via src URL (not doc.write)
            this.emit('version:preview', { versionFolder });
        } catch (err) {
            console.error('Failed to preview version:', err);
            this.emit('version:error', err);
        }
    }

    /**
     * Restore a version
     * @param {string} versionFolder - Version folder name
     */
    async restoreVersion(versionFolder) {
        try {
            const response = await fetch(
                `/api/projects/${this.projectId}/versions/${versionFolder}/restore`,
                { method: 'POST' }
            );

            if (response.ok) {
                const result = await response.json();
                this.currentPreviewVersion = null;
                this.isPreviewingVersion = false;
                await this.loadVersions();
                this.emit('version:restored', result);
                return result;
            }
        } catch (err) {
            console.error('Failed to restore version:', err);
            this.emit('version:error', err);
        }
        return null;
    }

    /**
     * Delete a version
     * @param {string} versionFolder - Version folder name
     */
    async deleteVersion(versionFolder) {
        try {
            const response = await fetch(
                `/api/projects/${this.projectId}/versions/${versionFolder}`,
                { method: 'DELETE' }
            );

            if (response.ok) {
                await this.loadVersions();
                this.emit('version:deleted', versionFolder);
                return true;
            }
        } catch (err) {
            console.error('Failed to delete version:', err);
            this.emit('version:error', err);
        }
        return false;
    }

    /**
     * Exit version preview mode
     */
    exitPreview() {
        this.currentPreviewVersion = null;
        this.isPreviewingVersion = false;
        this.emit('version:exitPreview');
    }

    /**
     * Publish a version
     * @param {string} versionFolder - Version folder name
     */
    async publishVersion(versionFolder) {
        try {
            const response = await fetch(
                `/api/projects/${this.projectId}/publish`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ versionFolder })
                }
            );

            if (response.ok) {
                const result = await response.json();
                await this.loadVersions();
                this.emit('version:published', result);
                return result;
            }
        } catch (err) {
            console.error('Failed to publish version:', err);
            this.emit('version:error', err);
        }
        return null;
    }

    /**
     * Get all versions
     */
    getVersions() {
        return this.versions;
    }

    /**
     * Check if currently previewing a version
     */
    isPreviewing() {
        return this.isPreviewingVersion;
    }

    /**
     * Get current preview version folder
     */
    getCurrentPreviewVersion() {
        return this.currentPreviewVersion;
    }
}

export default VersionManager;
