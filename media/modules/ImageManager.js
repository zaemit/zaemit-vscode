/**
 * ImageManager - VS Code 전용 이미지 브라우저
 * 좌측 사이드바에 이미지 목록을 표시하고 폴더 선택/삭제/교체 기능 제공
 * (Unsplash 제거, 드래그앤드롭 업로드 제거 → 폴더 선택 방식)
 */

import EventEmitter from './EventEmitter.js';

class ImageManager extends EventEmitter {
    constructor(dependencies) {
        super();
        this.projectId = dependencies.projectId;
        this.previewManager = dependencies.previewManager;
        this.undoRedoManager = dependencies.undoRedoManager;
        this.uiHelper = dependencies.uiHelper;
        this.editorApp = dependencies.editorApp;

        this.panel = null;
        this.imageGrid = null;
        this.images = [];
        this.isOpen = false;
        this.selectedImageForReplace = null;
        this.lightbox = null;

        // 현재 선택된 폴더 경로
        this.currentFolder = null;
        this.folderNameEl = null;
    }

    init() {
        this.createPanel();
        this.createToggleButton();
        this.createLightbox();
        this.setupImageDoubleClick();
        this.loadImages();
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'imageManagerPanel';
        this.panel.className = 'image-manager-panel';
        this.panel.innerHTML = `
            <div class="image-manager-header">
                <h3>Images</h3>
                <div class="panel-header-actions">
                    <button class="panel-pin-btn" data-panel="image" title="Pin panel">
                        <svg class="pin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="17" x2="12" y2="22"/>
                            <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
                        </svg>
                    </button>
                    <button class="panel-close-btn image-panel-close" title="Close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="image-tab-content active" data-tab-content="my">
                <div class="image-manager-folder-zone" id="imageFolderZone">
                    <button class="folder-select-btn" id="folderSelectBtn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
                        </svg>
                        <span>이미지 폴더 선택</span>
                    </button>
                    <div class="folder-current" id="folderCurrent" style="display:none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
                        </svg>
                        <span class="folder-name" id="folderName"></span>
                        <button class="folder-change-btn" id="folderChangeBtn" title="폴더 변경">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="1 4 1 10 7 10"/>
                                <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                            </svg>
                        </button>
                    </div>
                    <button class="file-pick-btn" id="filePickBtn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 5v14M5 12h14"/>
                        </svg>
                        <span>파일 추가</span>
                    </button>
                </div>
                <div class="image-manager-grid" id="imageGrid">
                    <div class="image-grid-empty">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                        </svg>
                        <p>프로젝트 폴더의 이미지가 표시됩니다</p>
                        <span class="upload-hint">폴더를 선택하여 외부 이미지를 불러올 수 있습니다</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.panel);

        this.imageGrid = this.panel.querySelector('#imageGrid');
        this.folderNameEl = this.panel.querySelector('#folderName');

        // 이벤트 바인딩
        this.panel.querySelector('.image-panel-close').addEventListener('click', () => this.close());
        this.panel.querySelector('#folderSelectBtn').addEventListener('click', () => this.browseFolder());
        this.panel.querySelector('#folderChangeBtn').addEventListener('click', () => this.browseFolder());
        this.panel.querySelector('#filePickBtn').addEventListener('click', () => this.pickFile());
    }

    /**
     * VS Code 폴더 선택 다이얼로그 열기
     */
    async browseFolder() {
        const bridge = window.vscBridge;
        if (!bridge) return;

        try {
            const response = await bridge.sendCommand('images:browseFolder', {
                currentFolder: this.currentFolder
            });

            if (response?.cancelled) return;
            if (response?.folder) {
                this.currentFolder = response.folder;
                this.updateFolderDisplay();

                if (response.images) {
                    this.images = response.images;
                    this.renderImages();
                }
            }
        } catch (error) {
            console.error('[ImageManager] Browse folder error:', error);
        }
    }

    /**
     * VS Code 파일 선택 다이얼로그로 이미지 추가
     */
    async pickFile() {
        const bridge = window.vscBridge;
        if (!bridge) return;

        try {
            const response = await bridge.sendCommand('images:pickFile', {});

            if (response?.cancelled) return;
            if (response?.url) {
                this.uiHelper?.showToast('이미지가 추가되었습니다', 'success');
                await this.loadImages();
            }
        } catch (error) {
            console.error('[ImageManager] Pick file error:', error);
        }
    }

    /**
     * 현재 폴더 표시 업데이트
     */
    updateFolderDisplay() {
        const selectBtn = this.panel.querySelector('#folderSelectBtn');
        const currentEl = this.panel.querySelector('#folderCurrent');

        if (this.currentFolder) {
            const folderName = this.currentFolder.split(/[\\/]/).pop() || this.currentFolder;
            this.folderNameEl.textContent = folderName;
            this.folderNameEl.title = this.currentFolder;
            selectBtn.style.display = 'none';
            currentEl.style.display = 'flex';
        } else {
            selectBtn.style.display = 'flex';
            currentEl.style.display = 'none';
        }
    }

    createToggleButton() {
        const togglesArea = document.querySelector('.left-panel-toggles');
        if (!togglesArea) return;

        const btn = document.createElement('button');
        btn.className = 'left-panel-toggle-btn image-manager-toggle';
        btn.id = 'imagePanelExpandBtn';
        btn.title = '이미지 브라우저';
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
            </svg>
        `;
        btn.addEventListener('click', () => this.toggle());

        const templateBtn = togglesArea.querySelector('#templatePanelExpandBtn');
        if (templateBtn) {
            templateBtn.parentNode.insertBefore(btn, templateBtn.nextSibling);
        } else {
            togglesArea.appendChild(btn);
        }

        this.toggleBtn = btn;
    }

    createLightbox() {
        this.lightbox = document.createElement('div');
        this.lightbox.className = 'image-lightbox';
        this.lightbox.innerHTML = `
            <div class="lightbox-backdrop"></div>
            <div class="lightbox-content">
                <img class="lightbox-image" src="" alt="" />
                <div class="lightbox-info">
                    <span class="lightbox-name"></span>
                    <span class="lightbox-size"></span>
                </div>
                <button class="lightbox-close" title="Close">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
                <button class="lightbox-prev" title="Previous">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
                <button class="lightbox-next" title="Next">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </button>
            </div>
        `;
        document.body.appendChild(this.lightbox);

        this.lightbox.querySelector('.lightbox-backdrop').addEventListener('click', () => this.closeLightbox());
        this.lightbox.querySelector('.lightbox-close').addEventListener('click', () => this.closeLightbox());
        this.lightbox.querySelector('.lightbox-prev').addEventListener('click', () => this.navigateLightbox(-1));
        this.lightbox.querySelector('.lightbox-next').addEventListener('click', () => this.navigateLightbox(1));

        document.addEventListener('keydown', (e) => {
            if (!this.lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') this.closeLightbox();
            if (e.key === 'ArrowLeft') this.navigateLightbox(-1);
            if (e.key === 'ArrowRight') this.navigateLightbox(1);
        });
    }

    openLightbox(imageUrl, imageName, imageSize) {
        const img = this.lightbox.querySelector('.lightbox-image');
        const nameEl = this.lightbox.querySelector('.lightbox-name');
        const sizeEl = this.lightbox.querySelector('.lightbox-size');

        img.src = imageUrl;
        img.alt = imageName;
        nameEl.textContent = imageName;
        sizeEl.textContent = imageSize || '';

        this.currentLightboxIndex = this.images.findIndex(i => i.url === imageUrl);

        const prevBtn = this.lightbox.querySelector('.lightbox-prev');
        const nextBtn = this.lightbox.querySelector('.lightbox-next');
        prevBtn.style.display = this.currentLightboxIndex > 0 ? '' : 'none';
        nextBtn.style.display = this.currentLightboxIndex < this.images.length - 1 ? '' : 'none';

        this.lightbox.classList.add('open');
    }

    closeLightbox() {
        this.lightbox.classList.remove('open');
    }

    navigateLightbox(direction) {
        const newIndex = this.currentLightboxIndex + direction;
        if (newIndex < 0 || newIndex >= this.images.length) return;

        const image = this.images[newIndex];
        this.openLightbox(image.url, image.name, this.formatSize(image.size));
    }

    setupImageDoubleClick() {
        // EditorApp에서 element:dblclick → IMG 분기를 처리
    }

    async loadImages() {
        try {
            const response = await fetch(`/api/projects/${this.projectId}/images`);
            const data = await response.json();
            this.images = data.images || [];
            this.renderImages();
        } catch (error) {
            console.error('[ImageManager] Failed to load images:', error);
        }
    }

    renderImages() {
        if (this.images.length === 0) {
            this.imageGrid.innerHTML = `
                <div class="image-grid-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                    </svg>
                    <p>이미지가 없습니다</p>
                    <span class="upload-hint">폴더를 선택하여 이미지를 불러오세요</span>
                </div>
            `;
            return;
        }

        this.imageGrid.innerHTML = this.images.map(img => `
            <div class="image-item" data-url="${img.url}" data-name="${img.name}">
                <div class="image-thumb">
                    <img src="${img.url}" alt="${img.name}" loading="lazy" />
                </div>
                <div class="image-info">
                    <span class="image-name" title="${img.name}">${this.truncateName(img.name)}</span>
                    <span class="image-size">${this.formatSize(img.size)}</span>
                </div>
                <div class="image-actions">
                    <button class="image-action-btn copy-url" title="Copy URL">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                    </button>
                    <button class="image-action-btn delete-image" title="Delete">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // 이벤트 바인딩
        this.imageGrid.querySelectorAll('.image-item').forEach(item => {
            const url = item.dataset.url;
            const name = item.dataset.name;
            const image = this.images.find(i => i.url === url);

            // 썸네일 클릭
            item.querySelector('.image-thumb').addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedImageForReplace) {
                    this.replaceImage(url);
                } else {
                    this.openLightbox(url, name, image ? this.formatSize(image.size) : '');
                }
            });

            // 아이템 클릭 (교체 모드)
            item.addEventListener('click', () => {
                if (this.selectedImageForReplace) {
                    this.replaceImage(url);
                }
            });

            // 드래그
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', url);
                e.dataTransfer.setData('text/html', `<img src="${url}" alt="${name}" />`);
                e.dataTransfer.setData('application/x-zaemit-image', JSON.stringify({ url, name }));
                e.dataTransfer.effectAllowed = 'copy';
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            // URL 복사
            item.querySelector('.copy-url').addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(url);
                this.uiHelper?.showToast('URL copied', 'success');
            });

            // 삭제
            item.querySelector('.delete-image').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteImage(name);
            });
        });
    }

    async deleteImage(filename) {
        if (!confirm(`"${filename}" 삭제하시겠습니까?`)) return;

        try {
            const response = await fetch(`/api/projects/${this.projectId}/images/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Delete failed');
            }

            this.uiHelper?.showToast('이미지가 삭제되었습니다', 'success');
            await this.loadImages();

        } catch (error) {
            console.error('[ImageManager] Delete error:', error);
            this.uiHelper?.showToast(error.message || '삭제 실패', 'error');
        }
    }

    openImageSelector(imgElement) {
        this.selectedImageForReplace = imgElement;
        this.open();

        this.panel.classList.add('select-mode');
        this.panel.querySelector('.image-manager-header h3').textContent = 'Select Image';
    }

    replaceImage(newUrl) {
        if (!this.selectedImageForReplace) return;

        const oldSrc = this.selectedImageForReplace.src;

        if (this.undoRedoManager) {
            this.undoRedoManager.recordAttributeChange(
                this.selectedImageForReplace,
                'src',
                oldSrc,
                newUrl
            );
        }

        this.selectedImageForReplace.src = newUrl;
        this.emit('image:replaced', { element: this.selectedImageForReplace, oldSrc, newSrc: newUrl });

        this.cancelSelectMode();
        this.uiHelper?.showToast('이미지가 교체되었습니다', 'success');
    }

    cancelSelectMode() {
        this.selectedImageForReplace = null;
        this.panel.classList.remove('select-mode');
        this.panel.querySelector('.image-manager-header h3').textContent = 'Images';
    }

    open() {
        if (this.editorApp) {
            this.editorApp.closeAllLeftPanels('image');
        }

        this.panel.classList.add('open');
        this.isOpen = true;
        this.toggleBtn?.classList.add('active');
        this.loadImages();
    }

    close() {
        this.panel.classList.remove('open');
        this.isOpen = false;
        this.toggleBtn?.classList.remove('active');
        this.cancelSelectMode();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    truncateName(name, maxLength = 15) {
        if (name.length <= maxLength) return name;
        const ext = name.split('.').pop();
        const baseName = name.slice(0, name.length - ext.length - 1);
        return baseName.slice(0, maxLength - ext.length - 3) + '...' + ext;
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
}

export default ImageManager;
