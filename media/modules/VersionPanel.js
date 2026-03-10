import EventEmitter from './EventEmitter.js';

/**
 * VersionPanel - Handles version list UI rendering and interactions
 */
class VersionPanel extends EventEmitter {
    constructor(versionManager, projectLoader) {
        super();
        this.versionManager = versionManager;
        this.projectLoader = projectLoader;
        this.versions = [];
        this.currentPreviewVersion = null;
        this.isPreviewingVersion = false;
    }

    /**
     * Initialize the version panel
     */
    init() {
        this.setupVersionPanel();
        this.setupSaveModal();
    }

    /**
     * Set versions data
     * @param {Array} versions
     */
    setVersions(versions) {
        this.versions = versions;
        this.renderVersionList();
    }

    /**
     * Get project data
     * @returns {Object|null}
     */
    getProject() {
        return this.projectLoader?.getProject() || null;
    }

    /**
     * Render the version list
     */
    renderVersionList() {
        const list = document.getElementById('versionList');
        if (!list) return;

        list.innerHTML = '';

        const project = this.getProject();
        const publishedVersionId = project?.publishedVersionId || null;
        const publishedAt = project?.publishedAt || null;

        // Find the oldest (original) version from ALL versions (including isAuto)
        const oldestVersion = this.versions.length > 0
            ? this.versions.reduce((oldest, v) => {
                return new Date(v.createdAt) < new Date(oldest.createdAt) ? v : oldest;
            }, this.versions[0])
            : null;

        // Manual versions (isAuto: false) + Origin version (always shown)
        const manualVersions = this.versions.filter(v => !v.isAuto);
        let displayVersions = [...manualVersions];
        if (oldestVersion && !manualVersions.find(v => v.id === oldestVersion.id)) {
            displayVersions.push(oldestVersion);
        }

        // 1. Published 섹션 (맨 위) - 퍼블리시된 것이 있으면 항상 표시
        if (publishedAt) {
            const publishedVersion = publishedVersionId
                ? this.versions.find(v => v.id === publishedVersionId)
                : null;

            // 퍼블리시된 이름: 버전이 있으면 그 버전 이름, 없으면 "현재 작업 중"
            const publishedName = publishedVersion?.message || '현재 작업 중';
            const publishedDate = new Date(publishedAt).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            const isPreviewingPublished = this.currentPreviewVersion === 'published';
            const publishedItem = document.createElement('div');
            publishedItem.className = `version-item published ${isPreviewingPublished ? 'active' : ''}`;
            publishedItem.innerHTML = `
                <div class="version-info">
                    <span class="version-message">${publishedName}</span>
                    <span class="version-date">${publishedDate}</span>
                    <span class="version-published">Live</span>
                </div>
                <div class="version-actions">
                    <button class="btn btn-small ${isPreviewingPublished ? 'btn-primary' : 'btn-secondary'}" data-action="previewPublished" title="퍼블리시된 버전 미리보기">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-secondary" data-action="restorePublished" title="퍼블리시된 버전으로 복원">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1,4 1,10 7,10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </button>
                </div>
            `;
            this.attachVersionItemListeners(publishedItem);
            list.appendChild(publishedItem);

            // 구분선
            const divider = document.createElement('div');
            divider.className = 'version-divider';
            list.appendChild(divider);
        }

        // 2. 현재 작업 중 (항상 독립적으로 표시)
        const isPreviewingOther = this.currentPreviewVersion !== null;
        const workingDraftItem = document.createElement('div');
        workingDraftItem.className = `version-item current ${isPreviewingOther ? '' : 'active'}`;
        workingDraftItem.innerHTML = `
            <div class="version-info">
                <span class="version-message">현재 작업 중</span>
            </div>
            <div class="version-actions">
                ${isPreviewingOther ? `
                <button class="btn btn-small btn-primary" data-action="showCurrent" title="현재 작업으로 돌아가기">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
                ` : ''}
                <button class="btn-publish" data-action="publishCurrent" title="현재 작업 상태를 퍼블리시">
                    Publish
                </button>
            </div>
        `;
        this.attachVersionItemListeners(workingDraftItem);
        list.appendChild(workingDraftItem);

        // 3. 저장된 버전들 (최신순, Origin은 맨 아래)
        if (displayVersions.length > 0) {
            const sortedVersions = [...displayVersions].sort((a, b) => {
                if (oldestVersion) {
                    const aIsOrigin = a.id === oldestVersion.id;
                    const bIsOrigin = b.id === oldestVersion.id;
                    if (aIsOrigin && !bIsOrigin) return 1;
                    if (bIsOrigin && !aIsOrigin) return -1;
                }
                return new Date(b.createdAt) - new Date(a.createdAt);
            });

            // 구분선
            const divider = document.createElement('div');
            divider.className = 'version-divider';
            list.appendChild(divider);

            // Render saved versions
            sortedVersions.forEach(version => {
                const item = this.createVersionItem(version, {
                    isActive: this.currentPreviewVersion === version.folder,
                    isCurrent: false,
                    isPublished: false,
                    isOrigin: oldestVersion && version.id === oldestVersion.id,
                    oldestVersion
                });
                list.appendChild(item);
            });
        }
    }

    /**
     * Create a version item element
     */
    createVersionItem(version, { isActive, isCurrent, isPublished, isOrigin, oldestVersion }) {
        const item = document.createElement('div');
        // Published version cannot be current (it's a read-only snapshot)
        item.className = `version-item ${isActive ? 'active' : ''} ${!isPublished && isCurrent ? 'current' : ''} ${isPublished ? 'published' : ''} ${isOrigin ? 'origin' : ''}`;

        const date = new Date(version.createdAt);
        const formattedDate = date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Published version is read-only snapshot - show preview and restore buttons only
        if (isPublished) {
            item.innerHTML = `
                <div class="version-info">
                    <span class="version-message">${version.message || 'No message'}</span>
                    <span class="version-date">${formattedDate}</span>
                    <span class="version-published">Live</span>
                </div>
                <div class="version-actions">
                    <button class="btn btn-small ${isActive ? 'btn-primary' : 'btn-secondary'}" data-action="preview" data-folder="${version.folder}" title="Preview published version">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-secondary" data-action="restore" data-folder="${version.folder}" title="Restore to this version">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1,4 1,10 7,10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </button>
                </div>
            `;
        } else if (isOrigin) {
            // Origin version is read-only - show preview and restore buttons only with "Original" badge
            item.innerHTML = `
                <div class="version-info">
                    <span class="version-message">${version.message || 'No message'}</span>
                    <span class="version-date">${formattedDate}</span>
                    <span class="version-original-badge">Original</span>
                </div>
                <div class="version-actions">
                    <button class="btn btn-small ${isActive ? 'btn-primary' : 'btn-secondary'}" data-action="preview" data-folder="${version.folder}" title="Preview original version">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-secondary" data-action="restore" data-folder="${version.folder}" title="Restore to original version">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1,4 1,10 7,10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </button>
                </div>
            `;
        } else {
            item.innerHTML = `
                <div class="version-info">
                    <span class="version-message" data-folder="${version.folder}" title="Click to rename">${version.message || 'No message'}</span>
                    <span class="version-date">${formattedDate}</span>
                    ${isCurrent ? '<span class="version-current">Current</span>' : ''}
                </div>
                <div class="version-actions">
                    <button class="btn-publish" data-action="publish" data-version-id="${version.id}" title="Publish this version">
                        Publish
                    </button>
                    <button class="btn btn-small ${isActive ? 'btn-primary' : 'btn-secondary'}" data-action="${isCurrent ? 'showCurrent' : 'preview'}" data-folder="${version.folder}" title="${isCurrent ? 'Current' : 'Preview'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    ${!isCurrent ? `
                    <button class="btn btn-small btn-secondary" data-action="restore" data-folder="${version.folder}" title="Restore">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1,4 1,10 7,10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </button>
                    ` : ''}
                    <button class="btn btn-small btn-secondary" data-action="rename" data-folder="${version.folder}" data-message="${(version.message || '').replace(/"/g, '&quot;')}" title="Rename">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete" data-folder="${version.folder}" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
        }

        // Add event listeners
        this.attachVersionItemListeners(item);
        return item;
    }

    /**
     * Attach event listeners to version item buttons
     * @param {HTMLElement} item
     */
    attachVersionItemListeners(item) {
        item.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const folder = btn.dataset.folder;
                const versionId = btn.dataset.versionId;
                const message = btn.dataset.message;

                switch (action) {
                    case 'publish':
                        this.emit('version:publish', { versionId });
                        break;
                    case 'publishCurrent':
                        // 현재 작업 상태를 바로 퍼블리시
                        this.emit('version:publishCurrent');
                        break;
                    case 'preview':
                        this.emit('version:preview', { folder });
                        break;
                    case 'previewPublished':
                        // 퍼블리시된 버전 미리보기 (published 폴더)
                        this.emit('version:previewPublished');
                        break;
                    case 'showCurrent':
                        this.emit('version:showCurrent');
                        break;
                    case 'restore':
                        this.emit('version:restore', { folder });
                        break;
                    case 'restorePublished':
                        // 퍼블리시된 버전으로 복원 (published 폴더에서)
                        this.emit('version:restorePublished');
                        break;
                    case 'rename':
                        this.emit('version:rename', { folder, currentMessage: message });
                        break;
                    case 'delete':
                        this.emit('version:delete', { folder });
                        break;
                }
            });
        });
    }

    /**
     * Setup version panel toggle
     */
    setupVersionPanel() {
        const showBtn = document.getElementById('showVersions');
        const closeBtn = document.getElementById('closeVersions');
        const panel = document.getElementById('versionPanel');

        if (showBtn) {
            showBtn.addEventListener('click', () => {
                panel?.classList.toggle('hidden');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel?.classList.add('hidden');
            });
        }

        // Save Version button in version panel
        const saveVersionBtn = document.getElementById('saveVersionBtn');
        if (saveVersionBtn) {
            saveVersionBtn.addEventListener('click', () => {
                this.showSaveModal();
            });
        }

        // Legacy: Save modal (for backward compatibility)
        const saveVersionOld = document.getElementById('saveVersion');
        if (saveVersionOld) {
            saveVersionOld.addEventListener('click', () => {
                this.showSaveModal();
            });
        }
    }

    /**
     * Setup save modal
     */
    setupSaveModal() {
        const closeSaveModal = document.getElementById('closeSaveModal');
        const cancelSave = document.getElementById('cancelSave');
        const confirmSave = document.getElementById('confirmSave');
        const versionMessage = document.getElementById('versionMessage');

        if (closeSaveModal) {
            closeSaveModal.addEventListener('click', () => {
                this.hideSaveModal();
            });
        }

        if (cancelSave) {
            cancelSave.addEventListener('click', () => {
                this.hideSaveModal();
            });
        }

        if (confirmSave) {
            confirmSave.addEventListener('click', () => {
                const message = versionMessage?.value || '';
                this.emit('version:save', { message });
                this.hideSaveModal();
            });
        }

        if (versionMessage) {
            versionMessage.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const message = versionMessage.value || '';
                    this.emit('version:save', { message });
                    this.hideSaveModal();
                }
            });
        }
    }

    /**
     * Show save modal
     */
    showSaveModal() {
        const modal = document.getElementById('saveModal');
        const input = document.getElementById('versionMessage');
        if (modal) {
            modal.classList.remove('hidden');
            input?.focus();
        }
    }

    /**
     * Hide save modal
     */
    hideSaveModal() {
        const modal = document.getElementById('saveModal');
        const input = document.getElementById('versionMessage');
        if (modal) {
            modal.classList.add('hidden');
        }
        if (input) {
            input.value = '';
        }
    }

    /**
     * Set preview state
     * @param {string|null} folder
     */
    setPreviewVersion(folder) {
        this.currentPreviewVersion = folder;
        this.isPreviewingVersion = !!folder;
        this.renderVersionList();
    }

    /**
     * Clear preview state
     */
    clearPreviewVersion() {
        this.currentPreviewVersion = null;
        this.isPreviewingVersion = false;
        this.renderVersionList();
    }
}

export default VersionPanel;
