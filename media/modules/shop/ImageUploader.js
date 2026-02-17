import EventEmitter from '../EventEmitter.js';

/**
 * ImageUploader - 이미지 업로드 & 관리 모듈
 * 파일 선택, 드래그&드롭, 서버 업로드, base64 변환
 */
class ImageUploader extends EventEmitter {
    constructor({ projectId }) {
        super();
        this.projectId = projectId;
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    }

    init() {
        this.fileInput = document.getElementById('imageFileInput');
        this.uploadArea = document.getElementById('imageUploadArea');
        this._pendingCallback = null;

        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
        }
        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', () => this.openFilePicker());
            this._setupUploadAreaDragDrop();
        }
    }

    /**
     * 파일 선택 다이얼로그 열기
     * @param {Function} callback - 파일 업로드 후 콜백 (src) => {}
     */
    openFilePicker(callback) {
        this._pendingCallback = callback || null;
        if (this.fileInput) {
            this.fileInput.value = '';
            this.fileInput.click();
        }
    }

    async _handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        await this.processFile(file);
    }

    async processFile(file) {
        // Validate
        if (!this.allowedTypes.includes(file.type)) {
            this.emit('upload:error', { message: '지원하지 않는 이미지 형식입니다. (JPG, PNG, GIF, WebP만 가능)' });
            return null;
        }
        if (file.size > this.maxFileSize) {
            this.emit('upload:error', { message: '파일 크기가 10MB를 초과합니다.' });
            return null;
        }

        this.emit('upload:start', { fileName: file.name });

        try {
            // 서버에 업로드 시도, 실패하면 base64 fallback
            let src;
            if (this.projectId) {
                src = await this._uploadToServer(file);
            }

            if (!src) {
                src = await this._toBase64(file);
            }

            this.emit('upload:complete', { src, fileName: file.name });

            if (this._pendingCallback) {
                this._pendingCallback(src);
                this._pendingCallback = null;
            }

            return src;
        } catch (err) {
            console.error('Image upload error:', err);
            this.emit('upload:error', { message: '이미지 업로드에 실패했습니다.' });
            return null;
        }
    }

    async _uploadToServer(file) {
        try {
            const formData = new FormData();
            formData.append('image', file);

            const res = await fetch(`/api/projects/${this.projectId}/images`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) return null;

            const data = await res.json();
            return data.image?.url || null;
        } catch {
            return null;
        }
    }

    _toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _setupUploadAreaDragDrop() {
        if (!this.uploadArea) return;

        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('drag-over');
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('drag-over');
        });
        this.uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('drag-over');

            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith('image/')) {
                await this.processFile(file);
            }
        });
    }

    /**
     * URL에서 이미지 로드 (외부 이미지 URL 지원)
     */
    async loadFromUrl(url) {
        try {
            this.emit('upload:start', { fileName: url });
            const res = await fetch(url);
            const blob = await res.blob();
            const src = await this._toBase64(new File([blob], 'image.jpg', { type: blob.type }));
            this.emit('upload:complete', { src, fileName: url });
            return src;
        } catch (err) {
            this.emit('upload:error', { message: 'URL에서 이미지를 불러올 수 없습니다.' });
            return null;
        }
    }
}

export default ImageUploader;
