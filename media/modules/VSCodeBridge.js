/**
 * VSCodeBridge - VS Code Extension과 WebView 간 통신 브릿지
 *
 * 핵심 기능:
 * 1. window.fetch를 인터셉트하여 /api/* 호출을 postMessage로 라우팅
 * 2. Extension Host로부터의 메시지를 수신하여 콜백 실행
 * 3. 프로젝트 파일 내용을 로컬 캐시로 관리
 */

class VSCodeBridge {
    constructor() {
        // acquireVsCodeApi()는 한 번만 호출 가능
        this.vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
        this.pending = new Map(); // requestId -> { resolve, reject }
        this.listeners = new Map(); // type -> [callback]
        this.projectFiles = {}; // 프로젝트 파일 캐시 { html, css, js }
        this.projectId = 'vscode-project'; // VS Code에서는 고정 ID
        this.projectName = '';
        this.projectDir = '';
        this.projectBaseUri = '';
        this._ready = false;
        this._readyCallbacks = [];

        this._setupMessageHandler();
        this._interceptFetch();
    }

    /**
     * Extension Host에서 오는 메시지 처리
     */
    _setupMessageHandler() {
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg || !msg.type) return;

            // 요청-응답 매칭
            if (msg.requestId && this.pending.has(msg.requestId)) {
                const { resolve, reject } = this.pending.get(msg.requestId);
                this.pending.delete(msg.requestId);
                if (msg.error) {
                    reject(new Error(msg.error));
                } else {
                    resolve(msg.payload);
                }
                return;
            }

            // 이벤트 리스너 호출
            if (this.listeners.has(msg.type)) {
                for (const cb of this.listeners.get(msg.type)) {
                    cb(msg.payload);
                }
            }

            // 특수 메시지 처리
            switch (msg.type) {
                case 'init':
                    this.projectFiles = msg.payload.files || {};
                    this.projectName = msg.payload.projectName || '';
                    this.projectDir = msg.payload.projectDir || '';
                    this.projectBaseUri = msg.payload.projectBaseUri || '';
                    this._ready = true;
                    for (const cb of this._readyCallbacks) cb();
                    this._readyCallbacks = [];
                    break;

                case 'file:externalChange':
                    if (msg.payload.filename && msg.payload.content !== undefined) {
                        this.projectFiles[msg.payload.filename] = msg.payload.content;
                    }
                    break;
            }
        });
    }

    /**
     * window.fetch를 인터셉트하여 /api/* 호출을 postMessage로 라우팅
     */
    _interceptFetch() {
        const originalFetch = window.fetch.bind(window);
        const bridge = this;

        window.fetch = async function(url, options = {}) {
            const urlStr = typeof url === 'string' ? url : url.toString();

            // /api/ 경로만 인터셉트
            if (!urlStr.startsWith('/api/')) {
                return originalFetch(url, options);
            }

            try {
                const result = await bridge.request(urlStr, options);
                // fetch-compatible Response 객체 생성
                return new Response(JSON.stringify(result), {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    statusText: 'Internal Server Error',
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        };
    }

    /**
     * Extension Host에 요청 전송 (요청-응답 패턴)
     */
    request(apiUrl, options = {}) {
        return new Promise((resolve, reject) => {
            const requestId = this._generateId();
            const method = (options.method || 'GET').toUpperCase();
            let body = null;
            try {
                body = options.body ? JSON.parse(options.body) : null;
            } catch {
                body = options.body;
            }

            this.pending.set(requestId, { resolve, reject });

            this.postMessage({
                type: 'api:request',
                requestId,
                payload: {
                    url: apiUrl,
                    method,
                    body
                }
            });

            // 30초 타임아웃
            setTimeout(() => {
                if (this.pending.has(requestId)) {
                    this.pending.delete(requestId);
                    reject(new Error(`Request timeout: ${method} ${apiUrl}`));
                }
            }, 30000);
        });
    }

    /**
     * Extension Host에 메시지 전송
     */
    postMessage(msg) {
        if (this.vscode) {
            this.vscode.postMessage(msg);
        }
    }

    /**
     * Extension Host에 커맨드 전송 (비-API 요청-응답 패턴)
     * api:request가 아닌 커스텀 메시지 타입 사용
     */
    sendCommand(type, payload = {}) {
        return new Promise((resolve, reject) => {
            const requestId = this._generateId();
            this.pending.set(requestId, { resolve, reject });

            this.postMessage({
                type,
                requestId,
                payload
            });

            // 60초 타임아웃 (폴더 다이얼로그 대기 시간 고려)
            setTimeout(() => {
                if (this.pending.has(requestId)) {
                    this.pending.delete(requestId);
                    reject(new Error(`Command timeout: ${type}`));
                }
            }, 60000);
        });
    }

    /**
     * 이벤트 리스너 등록
     */
    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(callback);
    }

    /**
     * 준비 완료 대기
     */
    onReady(callback) {
        if (this._ready) {
            callback();
        } else {
            this._readyCallbacks.push(callback);
        }
    }

    /**
     * 프로젝트 파일 가져오기
     */
    getFile(filename) {
        return this.projectFiles[filename] || '';
    }

    /**
     * 프로젝트 파일 설정
     */
    setFile(filename, content) {
        this.projectFiles[filename] = content;
    }

    _generateId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
}

// 전역 싱글턴 인스턴스 생성
window.vscBridge = new VSCodeBridge();
