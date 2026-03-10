import EventEmitter from './EventEmitter.js';
import CodeEditor from './CodeEditor.js';

class FileManager extends EventEmitter {
    constructor(projectId = null) {
        super();
        this.projectId = projectId;
        this.files = {};
        this.currentFile = null;
        this.codeEditor = null;

        this.fileIcons = {
            html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
            </svg>`,
            css: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
            </svg>`,
            js: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
            </svg>`
        };

        this.init();
    }

    init() {
        // CodeEditor 초기화
        this.codeEditor = new CodeEditor('codeEditorContainer');
        this.codeEditor.init();

        // 코드 변경 이벤트 리스닝
        this.codeEditor.on('content:changed', ({ content, file }) => {
            if (file && this.files[file]) {
                this.files[file] = content;
            }
        });

        document.getElementById('saveFile')?.addEventListener('click', () => {
            this.saveCurrentFile();
        });

        // 모달 닫기 버튼 연결
        document.getElementById('closeCodeEditor')?.addEventListener('click', () => {
            this.hideCodeEditorModal();
        });

        // 모달 오버레이 클릭시 닫기
        document.getElementById('codeEditorModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'codeEditorModal') {
                this.hideCodeEditorModal();
            }
        });

        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('codeEditorModal');
                if (modal && !modal.classList.contains('hidden')) {
                    this.hideCodeEditorModal();
                }
            }
        });
    }

    /**
     * Set project ID (called after initialization)
     */
    setProjectId(projectId) {
        this.projectId = projectId;
    }

    async loadFiles() {
        if (!this.projectId) {
            console.error('FileManager: No project ID set');
            return;
        }

        try {
            const response = await fetch(`/api/projects/${this.projectId}/files`);
            const files = await response.json();

            this.files = {};
            files.forEach(f => {
                this.files[f.name] = f.content;
            });

            this.renderFileList();
            this.emit('files:loaded', this.files);
        } catch (err) {
            console.error('Error loading files:', err);
            this.emit('files:error', { action: 'load', error: err });
            throw err;
        }
    }

    renderFileList() {
        const list = document.getElementById('fileList');
        if (!list) return;

        list.innerHTML = '';

        Object.keys(this.files).forEach(filename => {
            const ext = filename.split('.').pop();
            const item = document.createElement('div');
            item.className = `file-item ${ext}`;
            item.innerHTML = `${this.fileIcons[ext] || this.fileIcons.html}<span>${filename}</span>`;
            item.addEventListener('click', () => this.openFile(filename));
            list.appendChild(item);
        });
    }

    openFile(filename) {
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
            if (item.querySelector('span').textContent === filename) {
                item.classList.add('active');
            }
        });

        this.currentFile = filename;
        const fileNameDisplay = document.getElementById('currentFileName');

        if (fileNameDisplay) fileNameDisplay.textContent = filename;

        // CodeEditor에서 파일 열기
        if (this.codeEditor) {
            this.codeEditor.openFile(filename, this.files[filename] || '');
        }

        // 코드 에디터 모달 열기
        this.showCodeEditorModal();

        this.emit('file:opened', { filename, content: this.files[filename] });
    }

    /**
     * 코드 에디터 모달 표시
     */
    showCodeEditorModal() {
        const modal = document.getElementById('codeEditorModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * 코드 에디터 모달 닫기
     */
    hideCodeEditorModal() {
        const modal = document.getElementById('codeEditorModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    async saveCurrentFile() {
        if (!this.currentFile || !this.projectId) {
            this.emit('files:error', { action: 'save', error: new Error('No file or project selected') });
            return;
        }

        // CodeEditor에서 현재 내용 가져오기
        const content = this.codeEditor ? this.codeEditor.getValue() : '';
        this.files[this.currentFile] = content;

        try {
            const response = await fetch(`/api/projects/${this.projectId}/files/${this.currentFile}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (response.ok) {
                this.emit('file:saved', { filename: this.currentFile, content });
            } else {
                throw new Error('Save failed');
            }
        } catch (err) {
            console.error('Error saving file:', err);
            this.emit('files:error', { action: 'save', error: err });
            throw err;
        }
    }

    /**
     * Save a specific file
     */
    async saveFile(filename, content) {
        if (!this.projectId) {
            console.error('FileManager: No project ID set');
            throw new Error('FileManager: No project ID set');
        }

        this.files[filename] = content;

        try {
            const url = `/api/projects/${this.projectId}/files/${filename}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 404) {
                    const error = new Error(`프로젝트를 찾을 수 없습니다 (ID: ${this.projectId}). 유효한 프로젝트 URL로 접속해주세요.`);
                    error.isProjectNotFound = true;
                    throw error;
                }
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();

            this.emit('file:saved', { filename, content });
        } catch (err) {
            console.error(`[FileManager] 저장 실패 ${filename}:`, err);
            this.emit('files:error', { action: 'save', error: err, isProjectNotFound: err.isProjectNotFound });
            throw err; // 에러를 상위로 전파
        }
    }

    async saveHTML(html) {
        await this.saveFile('index.html', html);
    }

    getCurrentFile() {
        return this.currentFile;
    }

    getFileContent(filename) {
        return this.files[filename];
    }

    getAllFiles() {
        return this.files;
    }

    getCodeEditor() {
        return this.codeEditor;
    }

    /**
     * Capture and save screenshot of the preview iframe
     */
    async captureScreenshot(iframe) {
        if (!this.projectId || !iframe) return;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const iframeWin = iframe.contentWindow;

            // Use html2canvas to capture the iframe content
            const canvas = await this.renderIframeToCanvas(iframe);
            if (!canvas) return;

            const screenshot = canvas.toDataURL('image/png', 0.8);

            await fetch(`/api/projects/${this.projectId}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ screenshot })
            });

            this.emit('screenshot:saved');
        } catch (err) {
            console.error('Error capturing screenshot:', err);
        }
    }

    /**
     * Render iframe content to canvas using html2canvas
     */
    async renderIframeToCanvas(iframe) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const body = iframeDoc.body;

            if (!body) return null;

            // Dynamically load html2canvas if not available
            if (!window.html2canvas) {
                await this.loadHtml2Canvas();
            }

            if (!window.html2canvas) {
                console.warn('html2canvas not available');
                return null;
            }

            // Suppress document.write violation warning from html2canvas
            const originalWarn = console.warn;
            console.warn = (...args) => {
                if (args[0]?.includes?.('document.write') || args[0]?.includes?.('[Violation]')) return;
                originalWarn.apply(console, args);
            };

            // Capture the iframe document
            const canvas = await window.html2canvas(iframeDoc.documentElement, {
                width: 800,
                height: 600,
                scale: 0.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            // Restore console.warn
            console.warn = originalWarn;

            return canvas;
        } catch (err) {
            console.error('Error rendering iframe to canvas:', err);
            return null;
        }
    }

    /**
     * Load html2canvas library dynamically
     */
    loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            if (window.html2canvas) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}

export default FileManager;
