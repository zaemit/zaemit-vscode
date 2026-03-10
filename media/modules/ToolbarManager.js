import EventEmitter from './EventEmitter.js';

class ToolbarManager extends EventEmitter {
    constructor(previewManager, fileManager) {
        super();
        this.previewManager = previewManager;
        this.fileManager = fileManager;
        this.projectId = null;

        this.init();
    }

    init() {
        document.getElementById('refreshPreview')?.addEventListener('click', () => {
            this.refreshPreview();
        });

        document.getElementById('downloadUrl')?.addEventListener('click', () => {
            this.downloadFromUrl();
        });

        document.getElementById('exportZip')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.exportZip();
        });

        this.initUserMenu();
        this.initSettingsPopup();
        this.initShortcutsModal();
        this.loadUserInfo();
    }

    /**
     * Set project ID for exports
     */
    setProjectId(projectId) {
        this.projectId = projectId;
    }

    /**
     * Initialize user dropdown menu
     */
    initUserMenu() {
        const userProfile = document.getElementById('userProfile');
        const userDropdown = document.getElementById('userDropdown');

        if (!userProfile || !userDropdown) return;

        // Toggle dropdown on click
        userProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userProfile.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
            }
        });

        // Preview button
        document.getElementById('openPreview')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openPreview();
            userDropdown.classList.add('hidden');
        });

        // Export ZIP button
        document.getElementById('exportZip')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.exportZip();
            userDropdown.classList.add('hidden');
        });

        // Logout button
        const logoutBtn = userDropdown.querySelector('.text-danger');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }

    /**
     * Initialize settings popup
     */
    initSettingsPopup() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPopup = document.getElementById('settingsPopup');
        const settingsCloseBtn = document.getElementById('settingsCloseBtn');
        const userDropdown = document.getElementById('userDropdown');

        if (!settingsBtn || !settingsPopup) return;

        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            userDropdown?.classList.add('hidden');
            settingsPopup.classList.remove('hidden');
        });

        settingsCloseBtn?.addEventListener('click', () => {
            settingsPopup.classList.add('hidden');
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!settingsPopup.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPopup.classList.add('hidden');
            }
        });

        // Quick text edit toggle
        const quickTextEditToggle = document.getElementById('quickTextEditToggle');
        if (quickTextEditToggle) {
            // Load saved setting
            const saved = localStorage.getItem('quickTextEdit');
            quickTextEditToggle.checked = saved !== 'false';

            quickTextEditToggle.addEventListener('change', () => {
                localStorage.setItem('quickTextEdit', quickTextEditToggle.checked);
                this.emit('settings:changed', { quickTextEdit: quickTextEditToggle.checked });
            });
        }
    }

    /**
     * Initialize shortcuts modal
     */
    initShortcutsModal() {
        const shortcutsBtn = document.getElementById('shortcutsBtn');
        const shortcutsModal = document.getElementById('shortcutsModal');
        const shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');
        const shortcutsOverlay = shortcutsModal?.querySelector('.shortcuts-modal-overlay');
        const userDropdown = document.getElementById('userDropdown');

        if (!shortcutsBtn || !shortcutsModal) return;

        // Open modal
        shortcutsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            userDropdown?.classList.add('hidden');
            shortcutsModal.classList.remove('hidden');
        });

        // Close on X button
        shortcutsCloseBtn?.addEventListener('click', () => {
            shortcutsModal.classList.add('hidden');
        });

        // Close on overlay click
        shortcutsOverlay?.addEventListener('click', () => {
            shortcutsModal.classList.add('hidden');
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !shortcutsModal.classList.contains('hidden')) {
                shortcutsModal.classList.add('hidden');
            }
        });
    }

    /**
     * Load user info from auth
     */
    async loadUserInfo() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        try {
            const response = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const user = await response.json();
                this.updateUserDisplay(user);
            }
        } catch (err) {
            console.error('Failed to load user info:', err);
        }
    }

    /**
     * Update user display in toolbar
     */
    updateUserDisplay(user) {
        const userAvatar = document.querySelector('.user-avatar span');
        const userName = document.querySelector('.user-name');

        if (userAvatar && user.name) {
            userAvatar.textContent = user.name.substring(0, 2).toUpperCase();
        }
        if (userName && user.name) {
            userName.textContent = user.name;
        }
    }

    /**
     * 프리뷰 전 저장 콜백 설정
     * EditorApp에서 설정하여 프리뷰 전에 최신 상태를 서버에 저장
     * @param {Function} saveCallback - async 저장 함수
     * @param {Function} unsavedChecker - 미저장 상태 확인 함수 (boolean 반환)
     */
    setSaveBeforePreview(saveCallback, unsavedChecker) {
        this._saveBeforePreview = saveCallback;
        this._checkUnsavedChanges = unsavedChecker;
    }

    /**
     * Open preview in new tab (with temporary token)
     */
    async openPreview() {
        if (!this.projectId) {
            this.emit('toolbar:error', { action: 'preview', error: new Error('Project not loaded') });
            return;
        }

        try {
            // 미저장 변경사항 확인 → 저장 여부 질문
            if (this._checkUnsavedChanges?.()) {
                const shouldSave = window.confirm('변경사항이 저장되지 않았습니다.\n저장하고 현재 버전으로 프리뷰하시겠습니까?');
                if (shouldSave && this._saveBeforePreview) {
                    await this._saveBeforePreview();
                }
            }

            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/projects/${this.projectId}/preview-token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate preview token');
            }

            const data = await response.json();
            window.open(data.url, '_blank');
        } catch (err) {
            console.error('Preview error:', err);
            this.emit('toolbar:error', { action: 'preview', error: err });
        }
    }

    /**
     * Logout user
     */
    async logout() {
        const token = localStorage.getItem('authToken');

        try {
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        }

        localStorage.removeItem('authToken');
        window.location.href = '/public/pages/login.html';
    }

    refreshPreview() {
        this.previewManager.refresh();
        this.emit('toolbar:action', { action: 'refresh' });
    }

    async downloadFromUrl() {
        const urlInput = document.getElementById('urlInput');
        const url = urlInput ? urlInput.value.trim() : '';

        if (!url) {
            this.emit('toolbar:error', { action: 'download', error: new Error('Please enter a URL') });
            return;
        }

        this.emit('toolbar:loading', { action: 'download', message: 'Downloading page...' });

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                throw new Error('Download failed');
            }

            this.emit('toolbar:success', { action: 'download', message: 'Page downloaded successfully' });
            await this.fileManager.loadFiles();
            this.previewManager.refresh();
        } catch (err) {
            console.error('Error downloading:', err);
            this.emit('toolbar:error', { action: 'download', error: err });
            throw err;
        }
    }

    async exportZip() {
        if (!this.projectId) {
            this.emit('toolbar:error', { action: 'export', error: new Error('Project not loaded') });
            return;
        }

        this.emit('toolbar:loading', { action: 'export', message: 'Creating ZIP file...' });

        try {
            const response = await fetch(`/api/projects/${this.projectId}/export`);
            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project-${this.projectId}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            this.emit('toolbar:success', { action: 'export', message: 'ZIP exported successfully' });
        } catch (err) {
            console.error('Error exporting:', err);
            this.emit('toolbar:error', { action: 'export', error: err });
            throw err;
        }
    }
}

export default ToolbarManager;
