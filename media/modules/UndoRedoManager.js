import EventEmitter from './EventEmitter.js';

/**
 * UndoRedoManager - Unified Undo/Redo System
 *
 * Supports two types of changes:
 * 1. Property-level changes (style, attribute, content) - efficient for small edits
 * 2. Snapshot-based changes (AI, template, bulk operations) - for large changes
 *
 * All changes go through a single undo/redo stack for unified history.
 */
class UndoRedoManager extends EventEmitter {
    constructor(previewFrame) {
        super();
        this.previewFrame = previewFrame;
        this.activeFrame = previewFrame; // 활성 iframe (멀티뷰용)
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 100;
        this.isUndoRedoAction = false;
        this.suppressRecording = false; // Clear 등 특수 작업 중 일반 변경 기록 차단
        this.pendingChanges = [];

        // FileManager reference for snapshot-based undo (set via setFileManager)
        this.fileManager = null;

        // MultiCanvasManager reference for searching all iframes
        this.multiCanvasManager = null;
    }

    /**
     * Set MultiCanvasManager reference
     */
    setMultiCanvasManager(mcm) {
        this.multiCanvasManager = mcm;
    }

    /**
     * 모든 iframe에서 uid로 요소 찾기 (활성 iframe 우선)
     */
    findElementByUid(uid) {
        if (!uid) return null;

        // 1. 활성 iframe에서 먼저 검색 (사용자가 보는 화면)
        const activeIframe = this.multiCanvasManager?.getActiveIframe?.();
        if (activeIframe?.contentDocument) {
            const el = activeIframe.contentDocument.querySelector(`[data-zaemit-uid="${uid}"]`);
            if (el) {
                return el;
            }
        }

        // 2. multiCanvasManager의 모든 iframe에서 검색
        if (this.multiCanvasManager?.getIframes) {
            const iframes = this.multiCanvasManager.getIframes();
            for (const iframe of iframes) {
                if (iframe?.contentDocument) {
                    const el = iframe.contentDocument.querySelector(`[data-zaemit-uid="${uid}"]`);
                    if (el) {
                        // console.log('[UndoRedoManager] findElementByUid: found in multiCanvas iframe');
                        return el;
                    }
                }
            }
        }

        // 3. previewFrame에서 검색
        if (this.previewFrame?.contentDocument) {
            const el = this.previewFrame.contentDocument.querySelector(`[data-zaemit-uid="${uid}"]`);
            if (el) {
                // console.log('[UndoRedoManager] findElementByUid: found in previewFrame');
                return el;
            }
        }

        return null;
    }

    /**
     * 요소의 HTML을 모든 iframe에 동기화 (멀티뷰용)
     * @param {HTMLElement} sourceElement - 소스 요소
     * @param {string} uid - 요소의 고유 ID
     * @param {Document} sourceDoc - 소스 document (동기화에서 제외)
     */
    syncElementToAllIframes(sourceElement, uid, sourceDoc) {
        if (!sourceElement || !uid) return;

        const newHtml = sourceElement.outerHTML;
        const iframesToSync = [];

        // multiCanvasManager의 모든 iframe
        if (this.multiCanvasManager?.getIframes) {
            iframesToSync.push(...this.multiCanvasManager.getIframes());
        }

        // previewFrame 추가
        if (this.previewFrame) {
            iframesToSync.push(this.previewFrame);
        }

        let syncCount = 0;
        for (const iframe of iframesToSync) {
            const doc = iframe?.contentDocument;
            if (!doc || doc === sourceDoc) continue;

            const targetEl = doc.querySelector(`[data-zaemit-uid="${uid}"]`);
            if (targetEl) {
                targetEl.outerHTML = newHtml;
                syncCount++;
            }
        }

        if (syncCount > 0) {
            console.log(`[UndoRedoManager] syncElementToAllIframes: synced to ${syncCount} iframes`);
        }
    }

    /**
     * UID를 모든 iframe의 같은 위치 요소에 동기화
     * @param {string} uid - 동기화할 UID
     * @param {Object} location - 요소 위치 정보
     * @param {Document} sourceDoc - 소스 document (동기화에서 제외)
     */
    syncUidToAllIframes(uid, location, sourceDoc) {
        if (!uid || !location) return;

        const iframesToSync = [];

        // multiCanvasManager의 모든 iframe
        if (this.multiCanvasManager?.getIframes) {
            iframesToSync.push(...this.multiCanvasManager.getIframes());
        }

        // previewFrame 추가
        if (this.previewFrame) {
            iframesToSync.push(this.previewFrame);
        }

        let syncCount = 0;
        for (const iframe of iframesToSync) {
            const doc = iframe?.contentDocument;
            if (!doc || doc === sourceDoc) continue;

            // 이미 UID가 있는 요소가 있으면 건너뜀
            if (doc.querySelector(`[data-zaemit-uid="${uid}"]`)) continue;

            // location으로 같은 위치의 요소 찾기
            const targetEl = this.findElementByLocation(location, doc);
            if (targetEl && !targetEl.getAttribute('data-zaemit-uid')) {
                targetEl.setAttribute('data-zaemit-uid', uid);
                syncCount++;
            }
        }

        if (syncCount > 0) {
            console.log(`[UndoRedoManager] syncUidToAllIframes: synced uid ${uid} to ${syncCount} iframes`);
        }
    }

    /**
     * Temporarily suppress regular change recording (for Clear, etc.)
     * Snapshot recording is NOT affected.
     */
    setSuppressRecording(value) {
        this.suppressRecording = value;
    }

    /**
     * Set FileManager reference for snapshot-based operations
     */
    setFileManager(fileManager) {
        this.fileManager = fileManager;
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        this.activeFrame = iframe || this.previewFrame;
    }

    /**
     * Undo/Redo 작업 중인지 확인
     * @returns {boolean}
     */
    isUndoing() {
        return this.isUndoRedoAction;
    }

    /**
     * Get unique path to element from body
     * 에디터 요소 필터링 제거 - 원래 방식으로 복구
     */
    getElementPath(element) {
        const doc = element?.ownerDocument;
        if (!doc || !element) return null;
        if (element === doc.body) return [];

        const path = [];
        let current = element;

        while (current && current !== doc.body && current.parentElement) {
            const parent = current.parentElement;
            // 같은 태그명을 가진 형제들 중에서 인덱스 계산
            const siblings = Array.from(parent.children).filter(
                child => child.tagName === current.tagName
            );
            const index = siblings.indexOf(current);

            path.unshift({
                tag: current.tagName.toLowerCase(),
                index: index
            });

            current = parent;
        }

        return path;
    }

    /**
     * Find element by path
     * 에디터 요소 필터링 제거 - getElementPath와 일관성 유지
     */
    findElementByPath(path, doc = null) {
        doc = doc || this.getDocument();
        if (!doc || !path) return null;
        if (path.length === 0) return doc.body;

        let current = doc.body;

        for (const step of path) {
            if (!current) return null;

            // 같은 태그명을 가진 자식들 중에서 찾기
            const children = Array.from(current.children).filter(
                child => child.tagName.toLowerCase() === step.tag
            );

            if (step.index >= children.length) return null;
            current = children[step.index];
        }

        return current;
    }

    getDocument() {
        // ★ 항상 previewFrame 사용 (CSS 동기화로 다른 iframe도 자동 업데이트됨)
        return this.previewFrame?.contentDocument || null;
    }

    // ==================== Stable Selector Methods ====================

    /**
     * 에디터가 주입한 요소인지 확인
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    _isEditorElement(element) {
        if (!element) return false;

        // ID로 판별
        const id = element.id || '';
        if (id.startsWith('zaemit-') || id.startsWith('editor-')) return true;

        // 클래스로 판별 (에디터가 DOM에 주입한 요소만)
        // ★ selected-*, quick-text-edit 제외: 사용자 콘텐츠에 임시로 추가되는 클래스
        const classList = element.classList;
        if (classList) {
            for (const cls of classList) {
                if (cls.startsWith('zaemit-') ||
                    cls.startsWith('editor-')) {
                    return true;
                }
            }
        }

        // 태그 + 특정 속성으로 판별 (오버레이 등)
        const tagName = element.tagName?.toLowerCase();
        if (tagName === 'style' && (id === 'zaemit-temp-styles' || id === 'editor-styles')) {
            return true;
        }

        return false;
    }

    /**
     * 부모의 실제 콘텐츠 자식들만 필터링 (에디터 요소 제외)
     * @param {HTMLElement} parent
     * @returns {HTMLElement[]}
     */
    _getContentChildren(parent) {
        if (!parent) return [];
        return Array.from(parent.children).filter(child => !this._isEditorElement(child));
    }

    /**
     * 요소의 안정적인 선택자 또는 경로 정보 생성
     * ID/클래스가 있으면 CSS 선택자, 없으면 'body'만 반환 (경로는 childIndex로 처리)
     * @param {HTMLElement} element
     * @returns {string|null}
     */
    getStableSelector(element) {
        const doc = element?.ownerDocument;
        if (!doc || !element) return null;
        if (element === doc.body) return 'body';

        // 에디터 요소는 선택자 생성하지 않음
        if (this._isEditorElement(element)) return null;

        // 1. ID가 있으면 최우선
        if (element.id && !element.id.startsWith('zaemit-') && !element.id.startsWith('editor-')) {
            return '#' + CSS.escape(element.id);
        }

        // 2. 고유 클래스 찾기 (editor 관련 클래스 제외)
        const uniqueClass = this._findUniqueClass(element, doc);
        if (uniqueClass) {
            return '.' + CSS.escape(uniqueClass);
        }

        // 3. 부모의 선택자 반환 (자식 인덱스는 childIndex로 별도 처리)
        const parent = element.parentElement;
        if (!parent) return null;

        return this.getStableSelector(parent);
    }

    /**
     * 요소의 전체 경로 정보 (부모 선택자 + 경로 배열)
     * @param {HTMLElement} element
     * @returns {{ selector: string, path: number[] } | null}
     */
    getElementLocation(element) {
        const doc = element?.ownerDocument;
        if (!doc || !element) return null;
        if (element === doc.body) return { selector: 'body', path: [] };
        // ★ 수정: selected-* 클래스가 있어도 사용자 콘텐츠 요소이므로 위치 기록 필요
        // 진짜 에디터 요소(오버레이 등)는 _getContentChildren에서 필터링됨
        // if (this._isEditorElement(element)) return null;

        // ID나 고유 클래스가 있는 가장 가까운 조상 찾기
        let anchor = element;
        const pathFromAnchor = [];

        while (anchor && anchor !== doc.body) {
            // ID 체크
            if (anchor.id && !anchor.id.startsWith('zaemit-') && !anchor.id.startsWith('editor-')) {
                break;
            }
            // 고유 클래스 체크
            const uniqueClass = this._findUniqueClass(anchor, doc);
            if (uniqueClass) {
                break;
            }

            // 경로에 추가
            const parent = anchor.parentElement;
            if (!parent) return null;

            const contentChildren = this._getContentChildren(parent);
            const idx = contentChildren.indexOf(anchor);
            if (idx < 0) return null;

            pathFromAnchor.unshift(idx);
            anchor = parent;
        }

        // anchor의 선택자 생성
        let selector = 'body';
        let selectorIndex = 0;

        if (anchor !== doc.body) {
            if (anchor.id && !anchor.id.startsWith('zaemit-') && !anchor.id.startsWith('editor-')) {
                selector = '#' + CSS.escape(anchor.id);
                // ID는 고유하므로 selectorIndex = 0
            } else {
                const uniqueClass = this._findUniqueClass(anchor, doc);
                if (uniqueClass) {
                    selector = '.' + CSS.escape(uniqueClass);
                    // 동일 selector 중 몇 번째인지 계산 (복원 시 정확한 요소 찾기용)
                    const matches = doc.querySelectorAll(selector);
                    selectorIndex = Array.from(matches).indexOf(anchor);
                    if (selectorIndex === -1) selectorIndex = 0;
                }
            }
        }

        // absolutePath도 저장 (path 실패 시 fallback용)
        const absolutePath = this.getElementPath(element);

        return { selector, path: pathFromAnchor, selectorIndex, absolutePath };
    }

    /**
     * 위치 정보로 요소 찾기
     * @param {{ selector: string, path: number[], selectorIndex?: number }} location
     * @param {Document} doc
     * @returns {HTMLElement|null}
     */
    findElementByLocation(location, doc) {
        if (!location || !doc) return null;

        // legacyPath 형식 (getElementPath fallback)
        if (location.legacyPath) {
            return this.findElementByPath(location.legacyPath, doc);
        }

        // selectorIndex 사용하여 정확한 요소 선택 (동일 selector 중 몇 번째인지)
        let current = null;
        const selectorIndex = location.selectorIndex || 0;

        try {
            const matches = doc.querySelectorAll(location.selector);
            if (matches.length > selectorIndex) {
                current = matches[selectorIndex];
            } else if (matches.length > 0) {
                // selectorIndex 초과 시 첫 번째 사용 (fallback)
                current = matches[0];
            }
        } catch (e) {
            // 잘못된 selector
            return null;
        }

        if (!current) {
            console.warn('[UndoRedoManager] findElementByLocation: selector not found', location.selector);
            return null;
        }

        // path 따라 자식 탐색
        let pathFailed = false;
        for (let i = 0; i < location.path.length; i++) {
            const idx = location.path[i];
            const contentChildren = this._getContentChildren(current);
            if (idx >= contentChildren.length) {
                console.warn('[UndoRedoManager] findElementByLocation: path failed, trying absolutePath', {
                    pathStep: i,
                    pathIndex: idx,
                    childrenCount: contentChildren.length,
                    selector: location.selector
                });
                pathFailed = true;
                break;
            }
            current = contentChildren[idx];
        }

        // path 성공
        if (!pathFailed) {
            return current;
        }

        // path 실패 - absolutePath fallback (태그명 검증 포함)
        // ★ path가 실패해도 absolutePath로 올바른 요소를 찾을 수 있는 경우가 있음
        if (location.absolutePath) {
            const fallback = this.findElementByPath(location.absolutePath, doc);
            if (fallback) {
                // 태그명 검증: selector 기반이면 태그와 비교, 클래스/ID는 태그 무관
                const sel = location.selector || '';
                const selectorTag = sel.match(/^(\w+)/)?.[1]?.toLowerCase();
                if (!selectorTag || fallback.tagName.toLowerCase() === selectorTag ||
                    sel.startsWith('.') || sel.startsWith('#') || sel === 'body') {
                    console.warn('[UndoRedoManager] findElementByLocation: using absolutePath fallback');
                    return fallback;
                }
            }
        }
        return null;
    }

    /**
     * 문서에서 유일한 클래스 찾기
     * @param {HTMLElement} element
     * @param {Document} doc
     * @returns {string|null}
     */
    _findUniqueClass(element, doc) {
        const classes = Array.from(element.classList).filter(cls =>
            !cls.startsWith('zaemit-') &&
            !cls.startsWith('quick-text-edit') &&
            !cls.startsWith('editor-') &&
            !cls.startsWith('selected-')
        );

        for (const cls of classes) {
            try {
                if (doc.querySelectorAll('.' + CSS.escape(cls)).length === 1) {
                    return cls;
                }
            } catch (e) {
                // 잘못된 클래스명 건너뜀
            }
        }
        return null;
    }

    /**
     * 부모 요소의 안정적인 선택자 반환 (deprecated, use getElementLocation)
     * @param {HTMLElement} element
     * @returns {string|null}
     */
    getParentSelector(element) {
        const parent = element?.parentElement;
        if (!parent) return null;
        return this.getStableSelector(parent);
    }

    /**
     * 부모의 children 중 몇 번째인지 반환 (에디터 요소 제외)
     * @param {HTMLElement} element
     * @returns {number} -1 if not found
     */
    getChildIndex(element) {
        const parent = element?.parentElement;
        if (!parent) return -1;

        // 에디터 요소를 제외한 실제 콘텐츠 자식들 중에서 인덱스 계산
        const contentChildren = this._getContentChildren(parent);
        return contentChildren.indexOf(element);
    }

    /**
     * HTML 스냅샷 기반 변경 기록
     * DOM 구조 변경에 강건한 Undo/Redo를 위한 새로운 방식
     * @param {HTMLElement} element - 변경된 요소
     * @param {string} oldHtml - 변경 전 outerHTML
     * @param {string} newHtml - 변경 후 outerHTML
     */
    recordElementSnapshot(element, oldHtml, newHtml) {
        // console.log('[UndoRedoManager] recordElementSnapshot called', {
        //     element: element?.tagName,
        //     isUndoRedoAction: this.isUndoRedoAction,
        //     suppressRecording: this.suppressRecording,
        //     sameHtml: oldHtml === newHtml
        // });

        if (this.isUndoRedoAction || this.suppressRecording) return;
        if (oldHtml === newHtml) return;

        // 요소가 속한 document 사용
        const doc = element.ownerDocument;
        if (!doc) return;

        // ★ 요소에 고유 ID 부여
        let uid = element.getAttribute('data-zaemit-uid');
        const isNewUid = !uid;
        if (!uid) {
            uid = 'uid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            element.setAttribute('data-zaemit-uid', uid);
        }

        // ★ 새 UID인 경우 모든 iframe에 동기화
        if (isNewUid && this.multiCanvasManager?._isInitialized) {
            const location = this.getElementLocation(element);
            this.syncUidToAllIframes(uid, location, doc);
        }

        // oldHtml에도 uid 추가
        const tempDiv = doc.createElement('div');
        tempDiv.innerHTML = oldHtml;
        const oldElement = tempDiv.firstElementChild;
        if (oldElement) {
            oldElement.setAttribute('data-zaemit-uid', uid);
        }
        const markedOldHtml = tempDiv.innerHTML;

        // newHtml은 현재 요소에서 가져옴 (이미 uid 포함)
        const markedNewHtml = element.outerHTML;

        // 위치 정보는 fallback용
        const location = this.getElementLocation(element);

        this.pushChange({
            type: 'elementSnapshot',
            uid,
            location,
            oldHtml: markedOldHtml,
            newHtml: markedNewHtml,
            timestamp: Date.now()
        }, element);
    }

    /**
     * Update the last elementSnapshot's newHtml to current element state
     * Used for color picker: first input records, change updates final value
     * @param {HTMLElement} element - The element to get current HTML from
     */
    updateLastSnapshotNewHtml(element) {
        if (!element || this.undoStack.length === 0) return;

        const lastChange = this.undoStack[this.undoStack.length - 1];
        if (lastChange.type !== 'elementSnapshot') return;

        // UID가 일치하는지 확인
        const uid = element.getAttribute('data-zaemit-uid');
        if (!uid || lastChange.uid !== uid) return;

        // 현재 요소의 outerHTML로 newHtml 업데이트
        lastChange.newHtml = element.outerHTML;
    }

    /**
     * Generic method to record any change
     * Uses elementSnapshot for reliable undo/redo across DOM changes
     * @param {Object} change - { type, element, property, oldValue, newValue }
     */
    recordChange(change) {
        if (this.isUndoRedoAction || this.suppressRecording) {
            return;
        }

        const { type, element, property, oldValue, newValue } = change;

        // console.log('[UndoRedoManager] recordChange', { type, property, oldValue, newValue });

        if (oldValue === newValue) return;
        if (!element) return;

        // elementSnapshot 방식 사용: 현재 HTML(변경 후)을 저장하고,
        // 변경 전 HTML을 임시로 복원하여 저장
        const newHtml = element.outerHTML;

        // 변경 전 상태 복원 (임시) — try-finally로 반드시 newValue 복원 보장
        try {
            if (type === 'style' || !type) {
                // ★ 빈 문자열('')도 정상 값으로 처리
                if (oldValue !== null && oldValue !== undefined) {
                    element.style[property] = oldValue;
                } else {
                    element.style.removeProperty(this.toKebabCase(property));
                }
                const oldHtml = element.outerHTML;
                this.recordElementSnapshot(element, oldHtml, newHtml);
            } else if (type === 'attribute') {
                // ★ 빈 문자열('')도 정상 값으로 처리
                if (oldValue !== null && oldValue !== undefined) {
                    element.setAttribute(property, oldValue);
                } else {
                    element.removeAttribute(property);
                }
                const oldHtml = element.outerHTML;
                this.recordElementSnapshot(element, oldHtml, newHtml);
            } else if (type === 'content') {
                // content 타입: innerHTML은 빈 문자열도 유효한 값
                element.innerHTML = oldValue !== null && oldValue !== undefined ? oldValue : '';
                const oldHtml = element.outerHTML;
                this.recordElementSnapshot(element, oldHtml, newHtml);
            }
        } finally {
            // ★ 반드시 newValue 상태로 복원 (예외 발생 시에도)
            if (type === 'style' || !type) {
                if (newValue !== null && newValue !== undefined) {
                    element.style[property] = newValue;
                } else {
                    element.style.removeProperty(this.toKebabCase(property));
                }
            } else if (type === 'attribute') {
                if (newValue !== null && newValue !== undefined) {
                    element.setAttribute(property, newValue);
                } else {
                    element.removeAttribute(property);
                }
            } else if (type === 'content') {
                element.innerHTML = newValue !== null && newValue !== undefined ? newValue : '';
            }
        }
    }

    /**
     * Record multiple style changes as a single undo entry
     * Uses elementSnapshot for reliable undo/redo across DOM changes
     * @param {HTMLElement} element - The element being changed
     * @param {Array} changes - Array of { property, oldValue, newValue }
     */
    recordMultipleStyleChanges(element, changes) {
        if (this.isUndoRedoAction) return;
        if (!changes || changes.length === 0) return;
        if (!element) return;

        // Filter out changes where old === new
        const validChanges = changes.filter(c => c.oldValue !== c.newValue);
        if (validChanges.length === 0) return;

        // ★ 현재 HTML 저장 (이미 newValue가 적용된 상태)
        const newHtml = element.outerHTML;

        // ★ 임시 요소를 생성하여 oldHtml 계산 (원본 요소 수정 안 함)
        // 멀티뷰 동기화 시 element와 changes 간 불일치 문제 해결
        const tempDiv = element.ownerDocument.createElement('div');
        tempDiv.innerHTML = newHtml;
        const tempElement = tempDiv.firstElementChild;

        // 임시 요소에 oldValue 적용
        validChanges.forEach(c => {
            if (c.oldValue !== null && c.oldValue !== undefined) {
                tempElement.style[c.property] = c.oldValue;
            } else {
                tempElement.style.removeProperty(this.toKebabCase(c.property));
            }
        });
        const oldHtml = tempElement.outerHTML;

        // ★ 원본 요소는 이미 newValue 상태이므로 복원 불필요

        this.recordElementSnapshot(element, oldHtml, newHtml);
    }

    /**
     * Record a style change
     * Uses elementSnapshot for reliable undo/redo across DOM changes
     */
    recordStyleChange(element, property, oldValue, newValue) {
        if (this.isUndoRedoAction) return;
        if (oldValue === newValue) return;
        if (!element) return;

        // ★ 현재 HTML 저장 (이미 newValue가 적용된 상태)
        const newHtml = element.outerHTML;

        // ★ 변경 전 상태로 임시 복원 (oldValue 직접 사용)
        // ★ 빈 문자열('')도 정상 값으로 처리
        if (oldValue !== null && oldValue !== undefined) {
            element.style[property] = oldValue;
        } else {
            element.style.removeProperty(this.toKebabCase(property));
        }
        const oldHtml = element.outerHTML;

        // ★ newValue로 복원 (element.style 읽기 제거)
        if (newValue !== null && newValue !== undefined) {
            element.style[property] = newValue;
        } else {
            element.style.removeProperty(this.toKebabCase(property));
        }

        this.recordElementSnapshot(element, oldHtml, newHtml);
    }

    /**
     * Record an attribute change
     * Uses elementSnapshot for reliable undo/redo across DOM changes
     */
    recordAttributeChange(element, attribute, oldValue, newValue) {
        if (this.isUndoRedoAction) return;
        if (oldValue === newValue) return;
        if (!element) return;

        // 현재 HTML (변경 후)
        const newHtml = element.outerHTML;

        // 현재 속성 값 백업
        const currentValue = element.getAttribute(attribute);

        // 변경 전 상태로 임시 복원
        // ★ nullish 체크 (빈 문자열 ''도 정상 값으로 복원)
        if (oldValue != null) {
            element.setAttribute(attribute, oldValue);
        } else {
            element.removeAttribute(attribute);
        }
        const oldHtml = element.outerHTML;

        // 원래 값 복원
        if (currentValue !== null) {
            element.setAttribute(attribute, currentValue);
        } else {
            element.removeAttribute(attribute);
        }

        this.recordElementSnapshot(element, oldHtml, newHtml);
    }

    /**
     * Record a content (innerHTML) change
     * Uses elementSnapshot for reliable undo/redo across DOM changes
     */
    recordContentChange(element, oldContent, newContent) {
        if (this.isUndoRedoAction) return;
        if (oldContent === newContent) return;
        if (!element) return;

        // 현재 HTML (변경 후)
        const newHtml = element.outerHTML;

        // 현재 내용 백업
        const currentContent = element.innerHTML;

        // 변경 전 상태로 임시 복원
        element.innerHTML = oldContent || '';
        const oldHtml = element.outerHTML;

        // 원래 값 복원
        element.innerHTML = currentContent;

        this.recordElementSnapshot(element, oldHtml, newHtml);
    }

    /**
     * Record a structure change (add/remove/move elements)
     */
    recordStructureChange(type, data) {
        if (this.isUndoRedoAction) return;

        this.pushChange({
            type: 'structure',
            structureType: type,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Record a snapshot-based change (AI, template, bulk operations)
     * This captures the entire state of files before and after the change.
     * @param {string} label - Description of the change (e.g., 'AI 스타일 변경', '템플릿 추가')
     * @param {Object} beforeSnapshot - { html, css, js } content before change
     * @param {Object} afterSnapshot - { html, css, js } content after change
     * @param {Object} options - Additional options { cssFileName, jsFileName }
     */
    recordSnapshot(label, beforeSnapshot, afterSnapshot, options = {}) {
        if (this.isUndoRedoAction) return;

        this.pushChange({
            type: 'snapshot',
            label,
            before: beforeSnapshot,
            after: afterSnapshot,
            cssFileName: options.cssFileName || 'style.css',
            jsFileName: options.jsFileName || 'script.js',
            timestamp: Date.now()
        });
    }

    /**
     * Create a snapshot of current file state
     * @param {Object} options - { includeHtml, includeCss, includeJs, cssFileName, jsFileName }
     * @returns {Object} Snapshot object
     */
    createSnapshot(options = {}) {
        if (!this.fileManager) {
            console.warn('[UndoRedoManager] FileManager not set, cannot create snapshot');
            return null;
        }

        const snapshot = {};
        const cssFileName = options.cssFileName || this.getCSSFileName();
        const jsFileName = options.jsFileName || this.getJSFileName();

        if (options.includeHtml !== false) {
            snapshot.html = this.fileManager.getFileContent('index.html') || '';
        }
        if (options.includeCss !== false) {
            snapshot.css = this.fileManager.getFileContent(cssFileName) || '';
            snapshot.cssFileName = cssFileName;
        }
        if (options.includeJs !== false) {
            snapshot.js = this.fileManager.getFileContent(jsFileName) || '';
            snapshot.jsFileName = jsFileName;
        }

        return snapshot;
    }

    /**
     * Get CSS filename from preview document
     */
    getCSSFileName() {
        const doc = this.getDocument();
        if (doc) {
            const link = doc.querySelector('link[rel="stylesheet"]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const fileName = href.split('/').pop().split('?')[0];
                if (fileName && fileName.endsWith('.css')) return fileName;
            }
        }
        return 'style.css';
    }

    /**
     * Get JS filename from preview document
     */
    getJSFileName() {
        const doc = this.getDocument();
        if (doc) {
            const script = doc.querySelector('script[src]:not([src^="http"])');
            if (script) {
                const src = script.getAttribute('src') || '';
                const fileName = src.split('/').pop().split('?')[0];
                if (fileName && fileName.endsWith('.js')) return fileName;
            }
        }
        return 'script.js';
    }

    /**
     * 트랜잭션 시작 - 이후 pushChange 호출을 버퍼에 수집
     * endTransaction()으로 하나의 undo 항목으로 묶음
     */
    beginTransaction() {
        if (this.isUndoRedoAction || this.suppressRecording) return;
        this._transactionChanges = [];
    }

    /**
     * 트랜잭션 종료 - 버퍼에 수집된 변경들을 하나의 undo 항목으로 push
     */
    endTransaction() {
        if (!this._transactionChanges) return;
        const changes = this._transactionChanges;
        this._transactionChanges = null;

        if (changes.length === 0) return;
        if (changes.length === 1) {
            // 단일 변경은 그대로 push (불필요한 래핑 방지)
            this.undoStack.push(changes[0]);
        } else {
            this.undoStack.push({
                type: 'transaction',
                changes,
                timestamp: Date.now()
            });
        }
        this.redoStack = [];
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        this.emit('history:changed');
    }

    /**
     * Push change to undo stack
     * @param {Object} change - 변경 데이터 (저장용)
     * @param {HTMLElement} element - 원본 요소 (동기화용, 저장되지 않음)
     */
    pushChange(change, element = null) {
        // Undo/Redo 작업 중 또는 기록 억제 중에는 새 변경을 기록하지 않음
        // (이벤트 핸들러 등에서 실수로 변경이 기록되는 것을 방지)
        if (this.isUndoRedoAction || this.suppressRecording) {
            return;
        }

        // 트랜잭션 모드: undoStack 대신 버퍼에 수집
        if (this._transactionChanges) {
            this._transactionChanges.push(change);
            // 동기화용 이벤트는 개별 change마다 발생 (멀티뷰 실시간 반영)
            this.emit('change:recorded', { ...change, element });
            return;
        }

        this.undoStack.push(change);

        // Clear redo stack on new change
        this.redoStack = [];

        // Limit history size
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }

        this.emit('history:changed');
        // 멀티캔버스 동기화용 이벤트 (change 데이터 + element 포함)
        // element는 동기화에만 사용되고 저장되지 않음 (메모리 누수 방지)
        this.emit('change:recorded', { ...change, element });
    }

    /**
     * Undo last change
     */
    async undo() {
        console.log('[UNDO] ===== Ctrl+Z pressed =====');
        console.log('[UNDO] Stack size:', this.undoStack.length);
        if (this.undoStack.length > 0) {
            const topChange = this.undoStack[this.undoStack.length - 1];
            console.log('[UNDO] Top change:', JSON.stringify({
                type: topChange?.type,
                property: topChange?.property,
                oldValue: topChange?.oldValue,
                newValue: topChange?.newValue,
                breakpoints: topChange?.breakpoints,
                selector: topChange?.selector
            }, null, 2));
        }

        if (this.undoStack.length === 0) {
            console.log('[UNDO] Stack empty - nothing to undo');
            return false;
        }

        const change = this.undoStack.pop();
        console.log('[UNDO] Popped change:', change?.type);
        this.isUndoRedoAction = true;
        this.suppressRecording = true;  // ★ 비동기 이벤트 핸들러에서 변경 기록 방지

        try {
            const success = await this.revertChange(change);
            if (success === false) {
                // revertChange가 실패하면 undoStack에 다시 넣음
                this.undoStack.push(change);
                return false;
            }
            this.redoStack.push(change);
            this.emit('undo', change);
            this.emit('history:changed');

            // ★ 멀티뷰: Undo 후 CSS 동기화
            if (this.multiCanvasManager?._isInitialized) {
                this.multiCanvasManager.syncCSSToAllCanvases();
            }

            return true;
        } catch (err) {
            console.error('[UndoRedoManager] Undo failed:', err);
            // 에러 발생 시에도 undoStack에 다시 넣음
            this.undoStack.push(change);
            return false;
        } finally {
            this.isUndoRedoAction = false;
            // ★ microtask에서 해제 (동기 이벤트 핸들러 완료 보장, setTimeout 경쟁 조건 제거)
            queueMicrotask(() => {
                this.suppressRecording = false;
            });
        }
    }

    /**
     * Redo last undone change
     */
    async redo() {
        if (this.redoStack.length === 0) {
            return false;
        }

        const change = this.redoStack.pop();
        this.isUndoRedoAction = true;
        this.suppressRecording = true;  // ★ 비동기 이벤트 핸들러에서 변경 기록 방지

        try {
            const success = await this.applyChange(change);
            if (success === false) {
                // applyChange가 실패하면 redoStack에 다시 넣음
                this.redoStack.push(change);
                return false;
            }
            this.undoStack.push(change);
            this.emit('redo', change);
            this.emit('history:changed');

            // ★ 멀티뷰: Redo 후 CSS 동기화
            if (this.multiCanvasManager?._isInitialized) {
                this.multiCanvasManager.syncCSSToAllCanvases();
            }

            return true;
        } catch (err) {
            console.error('[UndoRedoManager] Redo failed:', err);
            // 에러 발생 시에도 redoStack에 다시 넣음
            this.redoStack.push(change);
            return false;
        } finally {
            this.isUndoRedoAction = false;
            // ★ microtask에서 해제 (동기 이벤트 핸들러 완료 보장, setTimeout 경쟁 조건 제거)
            queueMicrotask(() => {
                this.suppressRecording = false;
            });
        }
    }

    /**
     * Convert camelCase to kebab-case
     */
    toKebabCase(str) {
        const kebab = str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        // vendor prefix: webkitTextFillColor → -webkit-text-fill-color
        if (kebab.startsWith('webkit-')) return '-' + kebab;
        if (kebab.startsWith('moz-')) return '-' + kebab;
        if (kebab.startsWith('ms-')) return '-' + kebab;
        return kebab;
    }

    /**
     * Revert a change (for undo)
     * @returns {boolean|undefined} false if element not found, undefined otherwise
     */
    async revertChange(change) {
        // ★ 기록 시점과 동일한 document 사용 (activeFrame 우선)
        const doc = this.getDocument();
        if (!doc) {
            console.warn('[UndoRedoManager] revertChange: document not available');
            return false;
        }

        switch (change.type) {
            case 'style': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] revertChange(style): element not found at path', change.elementPath);
                    return false;
                }
                // ★ nullish 체크 (빈 문자열 ''이나 0도 정상 값으로 복원)
                if (change.oldValue != null) {
                    element.style[change.property] = change.oldValue;
                } else {
                    // removeProperty requires kebab-case
                    const kebabProp = this.toKebabCase(change.property);
                    element.style.removeProperty(kebabProp);
                }
                break;
            }
            case 'cssStyle': {
                // CSS 파일에 저장된 스타일 변경 되돌리기
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] revertChange(cssStyle): element not found at path', change.elementPath);
                    return false;
                }
                this.revertCSSStyleChange(element, change.property, change.oldValue, doc);
                break;
            }
            case 'attribute': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] revertChange(attribute): element not found at path', change.elementPath);
                    return false;
                }
                // ★ nullish 체크 (빈 문자열 ''도 정상 값으로 복원)
                if (change.oldValue != null) {
                    element.setAttribute(change.property, change.oldValue);
                } else {
                    element.removeAttribute(change.property);
                }
                break;
            }
            case 'content': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] revertChange(content): element not found at path', change.elementPath);
                    return false;
                }
                element.innerHTML = change.oldValue;
                break;
            }
            case 'multiStyle': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] revertChange(multiStyle): element not found at path', change.elementPath);
                    return false;
                }
                if (change.changes) {
                    change.changes.forEach(c => {
                        // ★ nullish 체크 (빈 문자열 ''이나 0도 정상 값으로 복원)
                        if (c.oldValue != null) {
                            element.style[c.property] = c.oldValue;
                        } else {
                            const kebabProp = this.toKebabCase(c.property);
                            element.style.removeProperty(kebabProp);
                        }
                    });
                }
                break;
            }
            case 'cssStyleMulti': {
                // CSS 파일에 저장된 스타일 변경 되돌리기 (여러 브레이크포인트 동시)
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] revertChange(cssStyleMulti): element not found at path', change.elementPath);
                    return false;
                }
                this.revertCSSStyleMulti(element, change.property, change.breakpoints, change.oldValue, doc);
                break;
            }
            case 'elementSnapshot': {
                // ★ 활성 iframe에서 위치 기반으로 요소 찾기
                const activeIframe = this.multiCanvasManager?.getActiveIframe?.();
                const activeDoc = activeIframe?.contentDocument || doc;

                let target = null;

                // 1. 활성 iframe에서 location으로 찾기
                if (change.location && activeDoc) {
                    target = this.findElementByLocation(change.location, activeDoc);
                }

                // 2. 못 찾으면 uid로 시도 (fallback)
                if (!target && change.uid) {
                    target = this.findElementByUid(change.uid);
                }

                // console.log('[UndoRedoManager] revertChange target:', target?.tagName);

                if (!target) {
                    console.warn('[UndoRedoManager] revertChange: element not found');
                    return false;
                }

                // 태그명 검증 (잘못된 요소 수정 방지)
                const oldTagMatch = change.oldHtml.match(/^<(\w+)/);
                const expectedTag = oldTagMatch ? oldTagMatch[1].toLowerCase() : null;
                if (expectedTag && target.tagName.toLowerCase() !== expectedTag) {
                    console.warn('[UndoRedoManager] revertChange(elementSnapshot): tag mismatch', {
                        expected: expectedTag,
                        found: target.tagName.toLowerCase()
                    });
                    return false;
                }

                // outerHTML 교체 전 부모와 위치 기억
                const parent = target.parentElement;
                const nextSibling = target.nextSibling;
                const targetDoc = target.ownerDocument;

                // ★ outerHTML 교체 전: 현재 요소 내 script 태그 수집 (스냅샷 이후 추가된 것 보존)
                const preservedScripts = Array.from(target.querySelectorAll('script'));

                // outerHTML 교체
                target.outerHTML = change.oldHtml;

                // 교체된 새 요소 찾기
                let newElement = change.uid ? targetDoc.querySelector(`[data-zaemit-uid="${change.uid}"]`) : null;
                if (!newElement) {
                    newElement = nextSibling ? nextSibling.previousElementSibling : parent?.lastElementChild;
                }

                // ★ 보존된 script 태그 중 oldHtml에 없던 것을 새 요소에 복원
                // cloneNode(true)로 script를 추가하면 브라우저가 재실행하므로,
                // innerHTML으로 비활성 삽입 후 속성만 복사하는 방식 사용
                if (newElement && preservedScripts.length > 0) {
                    preservedScripts.forEach(script => {
                        const src = script.getAttribute('src') || '';
                        const text = script.textContent || '';
                        let exists = false;
                        if (src) {
                            exists = !!newElement.querySelector(`script[src="${CSS.escape(src)}"]`);
                        } else if (text.trim()) {
                            exists = Array.from(newElement.querySelectorAll('script:not([src])')).some(
                                s => s.textContent.trim() === text.trim()
                            );
                        }
                        if (!exists) {
                            // script 재실행 방지: outerHTML을 통해 비활성 삽입
                            const wrapper = targetDoc.createElement('div');
                            wrapper.innerHTML = script.outerHTML;
                            const inertScript = wrapper.firstChild;
                            if (inertScript) {
                                newElement.appendChild(inertScript);
                            }
                        }
                    });
                }

                // 새 요소 정보를 change에 저장 (onUndoRedo에서 사용)
                change._restoredElement = newElement;

                // ★ 멀티뷰: 다른 모든 iframe에 HTML 동기화
                if (newElement && change.uid && this.multiCanvasManager?._isInitialized) {
                    this.syncElementToAllIframes(newElement, change.uid, targetDoc);
                }
                break;
            }
            case 'cssRuleSnapshot': {
                // ★ 새로운 방식: 모든 미디어쿼리 규칙을 한번에 복원
                this.revertCSSRuleSnapshot(change, doc);
                break;
            }
            case 'transaction': {
                // ★ 트랜잭션: 묶인 변경들을 역순으로 복원
                if (change.changes) {
                    for (let i = change.changes.length - 1; i >= 0; i--) {
                        await this.revertChange(change.changes[i]);
                    }
                }
                break;
            }
            case 'structure': {
                const structResult = this.revertStructureChange(change);
                if (structResult === false) return false;
                // ★ 멀티뷰: 구조 변경 후 body HTML을 모든 iframe에 동기화 (mainIframe 기준)
                if (this.multiCanvasManager?._isInitialized) {
                    this.multiCanvasManager.syncBodyToAll?.(true);
                }
                break;
            }
            case 'snapshot':
                await this.restoreSnapshot(change.before, change);
                break;
        }
    }

    /**
     * Apply a change (for redo)
     * @returns {boolean|undefined} false if element not found, undefined otherwise
     */
    async applyChange(change) {
        // ★ 기록 시점과 동일한 document 사용 (activeFrame 우선)
        const doc = this.getDocument();
        if (!doc) {
            console.warn('[UndoRedoManager] applyChange: document not available');
            return false;
        }

        switch (change.type) {
            case 'style': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] applyChange(style): element not found at path', change.elementPath);
                    return false;
                }
                // ★ nullish 체크 (빈 문자열 ''이나 0도 정상 값으로 적용)
                if (change.newValue != null) {
                    element.style[change.property] = change.newValue;
                } else {
                    // removeProperty requires kebab-case
                    const kebabProp = this.toKebabCase(change.property);
                    element.style.removeProperty(kebabProp);
                }
                break;
            }
            case 'cssStyle': {
                // CSS 파일에 저장된 스타일 변경 다시 적용 (redo)
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] applyChange(cssStyle): element not found at path', change.elementPath);
                    return false;
                }
                this.applyCSSStyleChange(element, change.property, change.newValue, doc);
                break;
            }
            case 'attribute': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] applyChange(attribute): element not found at path', change.elementPath);
                    return false;
                }
                // ★ nullish 체크 (빈 문자열 ''도 정상 값으로 적용)
                if (change.newValue != null) {
                    element.setAttribute(change.property, change.newValue);
                } else {
                    element.removeAttribute(change.property);
                }
                break;
            }
            case 'content': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] applyChange(content): element not found at path', change.elementPath);
                    return false;
                }
                element.innerHTML = change.newValue;
                break;
            }
            case 'multiStyle': {
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] applyChange(multiStyle): element not found at path', change.elementPath);
                    return false;
                }
                if (change.changes) {
                    change.changes.forEach(c => {
                        // ★ nullish 체크 (빈 문자열 ''이나 0도 정상 값으로 적용)
                        if (c.newValue != null) {
                            element.style[c.property] = c.newValue;
                        } else {
                            const kebabProp = this.toKebabCase(c.property);
                            element.style.removeProperty(kebabProp);
                        }
                    });
                }
                break;
            }
            case 'cssStyleMulti': {
                // CSS 파일에 저장된 스타일 변경 다시 적용 (여러 브레이크포인트 동시)
                const element = this.findElementByPath(change.elementPath, doc);
                if (!element) {
                    console.warn('[UndoRedoManager] applyChange(cssStyleMulti): element not found at path', change.elementPath);
                    return false;
                }
                this.applyCSSStyleMulti(element, change.property, change.breakpoints, change.newValue, doc);
                break;
            }
            case 'elementSnapshot': {
                // ★ 활성 iframe에서 위치 기반으로 요소 찾기
                const activeIframe = this.multiCanvasManager?.getActiveIframe?.();
                const activeDoc = activeIframe?.contentDocument || doc;

                let target = null;

                // 1. 활성 iframe에서 location으로 찾기
                if (change.location && activeDoc) {
                    target = this.findElementByLocation(change.location, activeDoc);
                }

                // 2. 못 찾으면 uid로 시도
                if (!target && change.uid) {
                    target = this.findElementByUid(change.uid);
                }

                if (!target) {
                    console.warn('[UndoRedoManager] applyChange: element not found');
                    return false;
                }

                // 태그명 검증
                const newTagMatch = change.newHtml.match(/^<(\w+)/);
                const expectedTag = newTagMatch ? newTagMatch[1].toLowerCase() : null;
                if (expectedTag && target.tagName.toLowerCase() !== expectedTag) {
                    console.warn('[UndoRedoManager] applyChange: tag mismatch');
                    return false;
                }

                // outerHTML 교체 전 부모와 위치 기억
                const parent = target.parentElement;
                const nextSibling = target.nextSibling;
                const targetDoc = target.ownerDocument;

                // ★ outerHTML 교체 전: 현재 요소 내 script 태그 수집 (스냅샷 이후 추가된 것 보존)
                const preservedScripts = Array.from(target.querySelectorAll('script'));

                // outerHTML 교체
                target.outerHTML = change.newHtml;

                // 교체된 새 요소 찾기 (uid로 찾기 - newHtml에 uid 포함됨)
                let newElement = change.uid ? targetDoc.querySelector(`[data-zaemit-uid="${change.uid}"]`) : null;
                if (!newElement) {
                    newElement = nextSibling ? nextSibling.previousElementSibling : parent?.lastElementChild;
                }

                // ★ 보존된 script 태그 중 newHtml에 없던 것을 새 요소에 복원
                if (newElement && preservedScripts.length > 0) {
                    preservedScripts.forEach(script => {
                        const src = script.getAttribute('src') || '';
                        const text = script.textContent || '';
                        let exists = false;
                        if (src) {
                            exists = !!newElement.querySelector(`script[src="${CSS.escape(src)}"]`);
                        } else if (text.trim()) {
                            exists = Array.from(newElement.querySelectorAll('script:not([src])')).some(
                                s => s.textContent.trim() === text.trim()
                            );
                        }
                        if (!exists) {
                            const wrapper = targetDoc.createElement('div');
                            wrapper.innerHTML = script.outerHTML;
                            const inertScript = wrapper.firstChild;
                            if (inertScript) {
                                newElement.appendChild(inertScript);
                            }
                        }
                    });
                }

                // 새 요소 정보를 change에 저장 (onUndoRedo에서 사용)
                change._restoredElement = newElement;

                // ★ 멀티뷰: 다른 모든 iframe에 HTML 동기화
                if (newElement && change.uid && this.multiCanvasManager?._isInitialized) {
                    this.syncElementToAllIframes(newElement, change.uid, targetDoc);
                }
                break;
            }
            case 'cssRuleSnapshot': {
                // ★ 새로운 방식: 모든 미디어쿼리 규칙을 한번에 적용
                this.applyCSSRuleSnapshot(change, doc);
                break;
            }
            case 'transaction': {
                // ★ 트랜잭션: 묶인 변경들을 순서대로 적용
                if (change.changes) {
                    for (const subChange of change.changes) {
                        await this.applyChange(subChange);
                    }
                }
                break;
            }
            case 'structure': {
                const structResult2 = this.applyStructureChange(change);
                if (structResult2 === false) return false;
                // ★ 멀티뷰: 구조 변경 후 body HTML을 모든 iframe에 동기화 (mainIframe 기준)
                if (this.multiCanvasManager?._isInitialized) {
                    this.multiCanvasManager.syncBodyToAll?.(true);
                }
                break;
            }
            case 'snapshot':
                await this.restoreSnapshot(change.after, change);
                break;
        }
    }

    /**
     * Restore a snapshot (for both undo and redo)
     * @param {Object} snapshot - The snapshot to restore
     * @param {Object} change - The change object containing file names
     */
    async restoreSnapshot(snapshot, change) {
        if (!this.fileManager) {
            console.warn('[UndoRedoManager] FileManager not set, cannot restore snapshot');
            return;
        }

        const doc = this.getDocument();
        const cssFileName = change.cssFileName || snapshot.cssFileName || 'style.css';
        const jsFileName = change.jsFileName || snapshot.jsFileName || 'script.js';
        let needsRefresh = false;
        let cssChanged = false;

        try {
            // 현재 파일 내용 가져오기 (비교용)
            const currentCSS = this.fileManager.getFileContent(cssFileName) || '';
            const currentHTML = this.fileManager.getFileContent('index.html') || '';
            const currentJS = this.fileManager.getFileContent(jsFileName) || '';

            // CSS 복원 - 실제로 다를 때만 저장
            if (snapshot.css !== undefined && snapshot.css !== currentCSS) {
                await this.fileManager.saveFile(cssFileName, snapshot.css);
                cssChanged = true;
            }

            // HTML 복원 - 실제로 다를 때만 저장하고 새로고침
            if (snapshot.html !== undefined && snapshot.html !== currentHTML) {
                await this.fileManager.saveFile('index.html', snapshot.html);
                needsRefresh = true;
            }

            // JS 복원 - 실제로 다를 때만 저장하고 새로고침
            if (snapshot.js !== undefined && snapshot.js !== currentJS) {
                await this.fileManager.saveFile(jsFileName, snapshot.js);
                needsRefresh = true;
            }

            // zaemit-temp-styles 태그 복원 (AI 수정 Undo용)
            // 새로고침 여부와 관계없이 현재 iframe에 즉시 적용
            const tempCSS = snapshot.tempCSS;
            if (tempCSS !== undefined && doc) {
                let tempStyleTag = doc.getElementById('zaemit-temp-styles');
                const currentTempCSS = tempStyleTag?.textContent || '';

                // tempCSS가 실제로 변경된 경우에만 처리
                if (tempCSS !== currentTempCSS) {
                    if (tempCSS) {
                        // 내용이 있으면 태그 생성/업데이트
                        if (!tempStyleTag) {
                            tempStyleTag = doc.createElement('style');
                            tempStyleTag.id = 'zaemit-temp-styles';
                            (doc.head || doc.documentElement).appendChild(tempStyleTag);
                        }
                        tempStyleTag.textContent = tempCSS;
                    } else {
                        // 내용이 없으면 태그 내용 제거
                        if (tempStyleTag) {
                            tempStyleTag.textContent = '';
                        }
                    }
                }
            }

            // 복원 완료 이벤트 발생 (needsRefresh, cssChanged, tempCSS 전달)
            this.emit('snapshot:restored', { change, snapshot, needsRefresh, cssChanged, tempCSS });

        } catch (err) {
            console.error('[UndoRedoManager] 스냅샷 복원 실패:', err);
        }
    }

    /**
     * Revert structure change
     * ★ 항상 mainIframe에서 수행 (syncBodyToAll이 mainIframe 기준으로 동기화)
     */
    revertStructureChange(change) {
        // Implement based on structure change type
        const { structureType, data } = change;
        // ★ CSS와 마찬가지로 mainIframe 사용
        const doc = this.multiCanvasManager?.mainIframe?.contentDocument || this.getDocument();
        if (!doc) return false;

        switch (structureType) {
            case 'delete':
                // Re-insert deleted element (parentPath can be empty array for body)
                if (data.html && data.parentPath !== undefined) {
                    const parent = this.findElementByPath(data.parentPath, doc);
                    if (!parent) {
                        console.warn('[UndoRedoManager] revertStructureChange(delete): parent not found');
                        return false;
                    }
                    const temp = doc.createElement('div');
                    temp.innerHTML = data.html;
                    const element = temp.firstElementChild;
                    if (element) {
                        const refChild = parent.children[data.index] || null;
                        parent.insertBefore(element, refChild);
                    }
                }
                break;
            case 'add':
                // Remove added element
                // 1차 시도: elementPath로 직접 찾기 (가장 정확)
                if (data.elementPath) {
                    const element = this.findElementByPath(data.elementPath, doc);
                    if (element) {
                        element.remove();
                        break;
                    }
                }
                // 2차 시도: parentPath + index (폴백)
                if (data.parentPath !== undefined && data.index !== undefined) {
                    const parent = this.findElementByPath(data.parentPath, doc);
                    if (parent && parent.children[data.index]) {
                        parent.children[data.index].remove();
                        break;
                    }
                }
                console.warn('[UndoRedoManager] revertStructureChange(add): element not found');
                return false;
            case 'move':
                // Move back to original position - element is at new position
                {
                    const originalParent = this.findElementByPath(data.originalParentPath, doc);
                    const newParent = this.findElementByPath(data.newParentPath, doc);
                    let element = null;

                    // 1차: elementPath로 직접 찾기 (가장 정확)
                    if (data.elementPath) {
                        element = this.findElementByPath(data.elementPath, doc);
                    }

                    // 2차: newParent + newIndex로 찾기 (폴백)
                    if (!element && newParent && data.newIndex !== undefined) {
                        element = newParent.children[data.newIndex];
                    }

                    if (!element || !originalParent) {
                        console.warn('[UndoRedoManager] revertStructureChange(move): element or parent not found');
                        return false;
                    }

                    // 순환 참조 체크: element가 originalParent를 포함하는지 확인
                    if (element.contains(originalParent)) {
                        break;
                    }
                    // 같은 위치면 이동 불필요
                    if (element.parentNode === originalParent) {
                        const currentIndex = Array.from(originalParent.children).indexOf(element);
                        if (currentIndex === data.originalIndex) {
                            break;
                        }
                    }
                    // 핵심 수정: element를 먼저 제거한 후 refChild 계산
                    // insertBefore는 element를 자동으로 제거하지만,
                    // refChild 인덱스 계산 시점에는 아직 제거되지 않아 잘못된 위치가 됨
                    element.remove();
                    const refChild = originalParent.children[data.originalIndex] || null;
                    originalParent.insertBefore(element, refChild);
                }
                break;
            case 'unwrap':
                // Undo: unwrap된 자식들을 다시 원래 <a> 태그로 감싸기
                {
                    if (!data.oldOuterHTML || !data.parentPath) {
                        console.warn('[UndoRedoManager] revertStructureChange(unwrap): missing data');
                        return false;
                    }
                    const parent = this.findElementByPath(data.parentPath, doc);
                    if (!parent) {
                        console.warn('[UndoRedoManager] revertStructureChange(unwrap): parent not found');
                        return false;
                    }
                    // oldOuterHTML에서 원본 <a> 태그 복원
                    const temp = doc.createElement('div');
                    temp.innerHTML = data.oldOuterHTML;
                    const restoredA = temp.firstElementChild;
                    if (!restoredA) return false;

                    // unwrap 시 자식이 parent에 삽입된 위치에 <a> 태그 복원
                    const childIndex = data.childIndex || 0;
                    const refChild = parent.children[childIndex] || null;
                    parent.insertBefore(restoredA, refChild);

                    // unwrap으로 풀려나온 자식 노드들 제거 (이미 restoredA 안에 원본이 있으므로)
                    // oldOuterHTML의 자식 개수만큼 다음 sibling 제거
                    const childCount = restoredA.childNodes.length;
                    for (let i = 0; i < childCount; i++) {
                        const next = restoredA.nextSibling;
                        if (next) next.remove();
                    }
                }
                break;
        }
        return true;
    }

    /**
     * Apply structure change
     * ★ 항상 mainIframe에서 수행 (syncBodyToAll이 mainIframe 기준으로 동기화)
     */
    applyStructureChange(change) {
        // Implement based on structure change type
        const { structureType, data } = change;
        // ★ CSS와 마찬가지로 mainIframe 사용
        const doc = this.multiCanvasManager?.mainIframe?.contentDocument || this.getDocument();
        if (!doc) return false;

        switch (structureType) {
            case 'delete':
                // Delete element again - find it at parentPath + index
                if (data.parentPath !== undefined && data.index !== undefined) {
                    const parent = this.findElementByPath(data.parentPath, doc);
                    if (parent && parent.children[data.index]) {
                        parent.children[data.index].remove();
                    } else {
                        console.warn('[UndoRedoManager] applyStructureChange(delete): element not found');
                        return false;
                    }
                }
                break;
            case 'add':
                // Re-add element (parentPath can be empty array for body)
                if (data.html && data.parentPath !== undefined) {
                    const parent = this.findElementByPath(data.parentPath, doc);
                    if (!parent) {
                        console.warn('[UndoRedoManager] applyStructureChange(add): parent not found');
                        return false;
                    }
                    const temp = doc.createElement('div');
                    temp.innerHTML = data.html;
                    const element = temp.firstElementChild;
                    if (element) {
                        const refChild = parent.children[data.index] || null;
                        parent.insertBefore(element, refChild);
                    }
                }
                break;
            case 'move':
                // Move to new position - after undo, element is at original position
                // Redo: 원래 위치(originalParent)에서 새 위치(newParent)로 다시 이동
                {
                    const originalParent = this.findElementByPath(data.originalParentPath, doc);
                    const newParent = this.findElementByPath(data.newParentPath, doc);
                    let element = null;

                    // 1차: originalParent + originalIndex로 찾기 (Redo 시 가장 정확)
                    if (originalParent && data.originalIndex !== undefined) {
                        element = originalParent.children[data.originalIndex];
                    }

                    // 2차: elementPath로 시도 (폴백)
                    if (!element && data.elementPath) {
                        element = this.findElementByPath(data.elementPath, doc);
                    }

                    if (!element || !newParent) {
                        console.warn('[UndoRedoManager] applyStructureChange(move): element or parent not found');
                        return false;
                    }

                    // 순환 참조 체크: element가 newParent를 포함하는지 확인
                    if (element.contains(newParent)) {
                        break;
                    }
                    // 같은 위치면 이동 불필요
                    if (element.parentNode === newParent) {
                        const currentIndex = Array.from(newParent.children).indexOf(element);
                        if (currentIndex === data.newIndex) {
                            break;
                        }
                    }
                    // 핵심 수정: element를 먼저 제거한 후 refChild 계산
                    // insertBefore는 element를 자동으로 제거하지만,
                    // refChild 인덱스 계산 시점에는 아직 제거되지 않아 잘못된 위치가 됨
                    element.remove();
                    const refChild = newParent.children[data.newIndex] || null;
                    newParent.insertBefore(element, refChild);
                }
                break;
            case 'unwrap':
                // Redo: <a> 태그를 다시 unwrap (자식들로 교체)
                {
                    if (!data.parentPath) return false;
                    const parent = this.findElementByPath(data.parentPath, doc);
                    if (!parent) return false;

                    const childIndex = data.childIndex || 0;
                    const aElement = parent.children[childIndex];
                    if (!aElement || aElement.tagName?.toLowerCase() !== 'a') {
                        console.warn('[UndoRedoManager] applyStructureChange(unwrap): <a> element not found at index', childIndex);
                        return false;
                    }

                    const fragment = doc.createDocumentFragment();
                    while (aElement.firstChild) {
                        fragment.appendChild(aElement.firstChild);
                    }
                    parent.replaceChild(fragment, aElement);
                }
                break;
        }
        return true;
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.emit('history:changed');
    }

    // ==================== CSS Style Change Methods ====================

    /**
     * Revert a CSS style change (for undo)
     * @param {HTMLElement} element - Target element
     * @param {string} property - CSS property name (camelCase), optionally with @breakpoint suffix
     * @param {string} oldValue - Value to restore
     * @param {Document} doc - Document context
     */
    revertCSSStyleChange(element, property, oldValue, doc) {
        // breakpoint 정보 파싱 (예: "color@625" → { prop: "color", breakpoint: 625 })
        const { prop } = this._parsePropertyWithBreakpoint(property);
        const kebabProp = this.toKebabCase(prop);
        const ruleInfo = this.findCSSRuleForElement(element, property, doc);

        if (ruleInfo && ruleInfo.rule) {
            // CSS 규칙이 있으면 수정
            if (oldValue != null) {
                ruleInfo.rule.style.setProperty(kebabProp, oldValue);
            } else {
                ruleInfo.rule.style.removeProperty(kebabProp);
            }
        } else {
            // CSS 규칙이 없으면 inline 스타일로 폴백
            if (oldValue != null) {
                element.style[prop] = oldValue;
            } else {
                element.style.removeProperty(kebabProp);
            }
        }
    }

    /**
     * Apply a CSS style change (for redo)
     * @param {HTMLElement} element - Target element
     * @param {string} property - CSS property name (camelCase), optionally with @breakpoint suffix
     * @param {string} newValue - Value to apply
     * @param {Document} doc - Document context
     */
    applyCSSStyleChange(element, property, newValue, doc) {
        // breakpoint 정보 파싱 (예: "color@625" → { prop: "color", breakpoint: 625 })
        const { prop, breakpoint } = this._parsePropertyWithBreakpoint(property);
        const kebabProp = this.toKebabCase(prop);
        const ruleInfo = this.findCSSRuleForElement(element, property, doc);

        if (ruleInfo && ruleInfo.rule) {
            // CSS 규칙이 있으면 수정
            if (newValue != null) {
                ruleInfo.rule.style.setProperty(kebabProp, newValue);
            } else {
                ruleInfo.rule.style.removeProperty(kebabProp);
            }
        } else if (newValue != null) {
            // CSS 규칙이 없고 새 값이 있으면 규칙 생성 시도
            const selector = this.getBestSelectorForElement(element);
            if (selector) {
                let rule;
                if (breakpoint) {
                    // ★ breakpoint가 있으면 미디어쿼리 내에 규칙 생성
                    rule = this.findOrCreateCSSRuleInMedia(selector, breakpoint, doc);
                } else {
                    rule = this.findOrCreateCSSRule(selector, doc);
                }
                if (rule) {
                    rule.style.setProperty(kebabProp, newValue);
                }
            }
        }
        // 저장은 onUndoRedo에서 saveHTML()로 처리됨 (temp tag 유지)
    }

    /**
     * Revert CSS style change for multiple breakpoints at once (for undo)
     * @param {HTMLElement} element - Target element
     * @param {string} property - CSS property name (camelCase)
     * @param {Array} breakpoints - Array of breakpoints ('pc' or numbers)
     * @param {string} oldValue - Value to restore
     * @param {Document} doc - Document context
     */
    revertCSSStyleMulti(element, property, breakpoints, oldValue, doc) {
        if (!breakpoints || breakpoints.length === 0) return;

        // ★ 핵심: CSS 수정은 항상 mainIframe에서 해야 함 (syncCSSToAllCanvases가 mainIframe을 기준으로 동기화)
        const mainDoc = this.multiCanvasManager?.mainIframe?.contentDocument || doc;
        const kebabProp = this.toKebabCase(property);

        for (const bp of breakpoints) {
            if (bp === 'pc') {
                // PC (base) rule - no media query
                const ruleInfo = this.findCSSRuleForElement(element, property, mainDoc);
                if (ruleInfo && ruleInfo.rule) {
                    if (oldValue != null) {
                        ruleInfo.rule.style.setProperty(kebabProp, oldValue);
                    } else {
                        ruleInfo.rule.style.removeProperty(kebabProp);
                    }
                } else if (oldValue != null) {
                    element.style[property] = oldValue;
                } else {
                    element.style.removeProperty(kebabProp);
                }
            } else {
                // Media query breakpoint
                const propertyWithBp = `${property}@${bp}`;
                const ruleInfo = this.findCSSRuleForElement(element, propertyWithBp, mainDoc);
                if (ruleInfo && ruleInfo.rule) {
                    if (oldValue != null) {
                        ruleInfo.rule.style.setProperty(kebabProp, oldValue);
                    } else {
                        ruleInfo.rule.style.removeProperty(kebabProp);
                    }
                }
            }
        }
    }

    /**
     * Apply CSS style change for multiple breakpoints at once (for redo)
     * @param {HTMLElement} element - Target element
     * @param {string} property - CSS property name (camelCase)
     * @param {Array} breakpoints - Array of breakpoints ('pc' or numbers)
     * @param {string} newValue - Value to apply
     * @param {Document} doc - Document context
     */
    applyCSSStyleMulti(element, property, breakpoints, newValue, doc) {
        if (!breakpoints || breakpoints.length === 0) return;

        // ★ 핵심: CSS 수정은 항상 mainIframe에서 해야 함 (syncCSSToAllCanvases가 mainIframe을 기준으로 동기화)
        const mainDoc = this.multiCanvasManager?.mainIframe?.contentDocument || doc;
        const kebabProp = this.toKebabCase(property);
        const selector = this.getBestSelectorForElement(element);

        for (const bp of breakpoints) {
            if (bp === 'pc') {
                // PC (base) rule - no media query
                const ruleInfo = this.findCSSRuleForElement(element, property, mainDoc);
                if (ruleInfo && ruleInfo.rule) {
                    if (newValue != null) {
                        ruleInfo.rule.style.setProperty(kebabProp, newValue);
                    } else {
                        ruleInfo.rule.style.removeProperty(kebabProp);
                    }
                } else if (newValue != null && selector) {
                    const rule = this.findOrCreateCSSRule(selector, mainDoc);
                    if (rule) {
                        rule.style.setProperty(kebabProp, newValue);
                    }
                }
            } else {
                // Media query breakpoint
                const propertyWithBp = `${property}@${bp}`;
                const ruleInfo = this.findCSSRuleForElement(element, propertyWithBp, mainDoc);
                if (ruleInfo && ruleInfo.rule) {
                    if (newValue != null) {
                        ruleInfo.rule.style.setProperty(kebabProp, newValue);
                    } else {
                        ruleInfo.rule.style.removeProperty(kebabProp);
                    }
                } else if (newValue != null && selector) {
                    const rule = this.findOrCreateCSSRuleInMedia(selector, bp, mainDoc);
                    if (rule) {
                        rule.style.setProperty(kebabProp, newValue);
                    }
                }
            }
        }
    }

    /**
     * Record a CSS style change for multiple breakpoints as a single undo entry
     * @param {HTMLElement} element - Target element
     * @param {string} property - CSS property name (camelCase)
     * @param {Array} breakpoints - Array of breakpoints ('pc' or numbers)
     * @param {string} oldValue - Old value
     * @param {string} newValue - New value
     */
    recordCSSStyleMulti(element, property, breakpoints, oldValue, newValue) {
        console.log('[RECORD] recordCSSStyleMulti:', { property, oldValue, newValue, breakpoints });
        if (this.isUndoRedoAction) {
            console.log('[RECORD] Skipped - isUndoRedoAction is true');
            return;
        }
        if (oldValue === newValue) {
            console.log('[RECORD] Skipped - oldValue === newValue');
            return;
        }
        if (!breakpoints || breakpoints.length === 0) {
            console.log('[RECORD] Skipped - no breakpoints');
            return;
        }

        const path = this.getElementPath(element);
        if (!path) return;

        this.pushChange({
            type: 'cssStyleMulti',
            elementPath: path,
            property,
            breakpoints: [...breakpoints], // copy array
            oldValue: oldValue || '',
            newValue: newValue || '',
            timestamp: Date.now()
        }, element);
    }

    /**
     * Find CSS rule that applies to an element for a specific property
     * @param {HTMLElement} element - Target element
     * @param {string} property - CSS property name (camelCase), optionally with @breakpoint suffix
     * @param {Document} doc - Document context
     * @returns {object|null} { rule, selector, value } or null
     */
    findCSSRuleForElement(element, property, doc) {
        if (!element || !doc) return null;

        // breakpoint 정보 파싱 (예: "color@625" → { prop: "color", breakpoint: 625 })
        const { prop, breakpoint } = this._parsePropertyWithBreakpoint(property);
        const kebabProp = this.toKebabCase(prop);
        const matchedRules = [];

        try {
            for (const sheet of doc.styleSheets) {
                // style.css 또는 zaemit-temp-styles 임시 태그만 검색
                const isStyleCSS = sheet.href && sheet.href.includes('style.css');
                const isTempStyle = sheet.ownerNode && sheet.ownerNode.id === 'zaemit-temp-styles';
                if (!isStyleCSS && !isTempStyle) continue;

                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (let i = 0; i < rules.length; i++) {
                        const rule = rules[i];

                        // CSSStyleRule (type=1) - 일반 규칙
                        if (rule.type === 1) {
                            // breakpoint가 지정되면 일반 규칙은 스킵
                            if (breakpoint) continue;

                            this._tryMatchRule(element, rule, kebabProp, matchedRules, i);
                        }
                        // CSSMediaRule (type=4) - 미디어쿼리 규칙
                        else if (rule.type === 4) {
                            // breakpoint가 없으면 미디어쿼리는 스킵
                            if (!breakpoint) continue;

                            // 미디어쿼리 조건 확인 (예: "(max-width: 625px)")
                            if (!this._matchesMediaBreakpoint(rule, breakpoint)) continue;

                            // 미디어쿼리 내부의 규칙 검색
                            const innerRules = rule.cssRules;
                            if (!innerRules) continue;

                            for (let j = 0; j < innerRules.length; j++) {
                                const innerRule = innerRules[j];
                                if (innerRule.type !== 1) continue;

                                this._tryMatchRule(element, innerRule, kebabProp, matchedRules, j, rule);
                            }
                        }
                    }
                } catch (e) {
                    // 크로스 오리진 에러
                    continue;
                }
            }
        } catch (e) {
            console.warn('[UndoRedo] Error finding CSS rules:', e);
        }

        // 가장 높은 specificity의 규칙 반환 (값이 있는 것 우선)
        if (matchedRules.length > 0) {
            // 값이 있는 규칙 우선
            const rulesWithValue = matchedRules.filter(r => r.value);
            const targetRules = rulesWithValue.length > 0 ? rulesWithValue : matchedRules;

            targetRules.sort((a, b) => {
                for (let i = 0; i < 3; i++) {
                    if (b.specificity[i] !== a.specificity[i]) {
                        return b.specificity[i] - a.specificity[i];
                    }
                }
                return b.index - a.index;
            });
            return targetRules[0];
        }

        return null;
    }

    /**
     * Get the best selector for an element (ID > class > none)
     * @param {HTMLElement} element - Target element
     * @returns {string|null} CSS selector or null
     */
    getBestSelectorForElement(element) {
        if (!element) return null;

        // ID가 있으면 사용
        if (element.id) {
            return '#' + element.id;
        }

        // 클래스가 있으면 첫 번째 non-editor 클래스 사용
        const nonEditorClasses = Array.from(element.classList).filter(cls =>
            !cls.startsWith('zaemit-') &&
            !cls.startsWith('quick-text-edit') &&
            !cls.startsWith('editor-') &&
            !cls.startsWith('selected-')
        );

        if (nonEditorClasses.length > 0) {
            return '.' + nonEditorClasses[0];
        }

        return null;
    }

    /**
     * Find or create a CSS rule in the main stylesheet
     * @param {string} selector - CSS selector
     * @param {Document} doc - Document context
     * @returns {CSSStyleRule|null}
     */
    findOrCreateCSSRule(selector, doc) {
        if (!selector || !doc) return null;

        let mainSheet = null;

        // ★ zaemit-temp-styles 우선 선택 (applyStyleChange와 동일한 시트 사용)
        // style.css CSSOM은 syncCSSToAllCanvases/saveHTML에 반영 안 되므로 fallback만
        for (const sheet of doc.styleSheets) {
            const isTempStyle = sheet.ownerNode && sheet.ownerNode.id === 'zaemit-temp-styles';
            if (isTempStyle) {
                mainSheet = sheet;
                break;
            }
            const isStyleCSS = sheet.href && sheet.href.includes('style.css');
            if (isStyleCSS && !mainSheet) {
                mainSheet = sheet; // fallback
            }
        }

        if (!mainSheet) {
            console.warn('[UndoRedo] findOrCreateCSSRule: no mainSheet found for selector:', selector);
            return null;
        }

        const sheetId = mainSheet.ownerNode?.id || mainSheet.href || 'unknown';
        console.log('[UndoRedo] findOrCreateCSSRule: using sheet:', sheetId, 'for selector:', selector);

        try {
            // 기존 규칙 찾기
            for (const rule of mainSheet.cssRules) {
                if (rule.type === 1 && rule.selectorText === selector) {
                    console.log('[UndoRedo] findOrCreateCSSRule: found existing rule');
                    return rule;
                }
            }

            // 새 규칙 생성
            console.log('[UndoRedo] findOrCreateCSSRule: creating new rule');
            const ruleText = `${selector} { }`;
            const index = mainSheet.insertRule(ruleText, mainSheet.cssRules.length);
            return mainSheet.cssRules[index];
        } catch (e) {
            console.warn('[UndoRedo] Failed to find/create CSS rule:', e);
            return null;
        }
    }

    /**
     * Find or create CSS rule within a media query
     * @param {string} selector - CSS selector
     * @param {number} breakpoint - Max-width breakpoint (e.g., 625)
     * @param {Document} doc - Document context
     * @returns {CSSStyleRule|null}
     */
    findOrCreateCSSRuleInMedia(selector, breakpoint, doc) {
        if (!selector || !breakpoint || !doc) return null;

        let mainSheet = null;

        // ★ zaemit-temp-styles 우선 선택 (findOrCreateCSSRule과 동일 패턴)
        for (const sheet of doc.styleSheets) {
            const isTempStyle = sheet.ownerNode && sheet.ownerNode.id === 'zaemit-temp-styles';
            if (isTempStyle) {
                mainSheet = sheet;
                break;
            }
            const isStyleCSS = sheet.href && sheet.href.includes('style.css');
            if (isStyleCSS && !mainSheet) {
                mainSheet = sheet; // fallback
            }
        }

        if (!mainSheet) return null;

        try {
            // +1px 오프셋 고려 (findOrCreateMediaRule에서 추가됨)
            const adjustedBreakpoint = breakpoint + 1;

            // 먼저 기존 미디어쿼리 찾기
            let mediaRule = null;
            for (const rule of mainSheet.cssRules) {
                if (rule.type === 4) { // CSSMediaRule
                    if (this._matchesMediaBreakpoint(rule, breakpoint)) {
                        mediaRule = rule;
                        break;
                    }
                }
            }

            // 미디어쿼리가 없으면 생성
            if (!mediaRule) {
                const mediaRuleText = `@media (max-width: ${adjustedBreakpoint}px) {}`;
                const index = mainSheet.insertRule(mediaRuleText, mainSheet.cssRules.length);
                mediaRule = mainSheet.cssRules[index];
            }

            // 미디어쿼리 내에서 selector에 해당하는 규칙 찾기
            for (const rule of mediaRule.cssRules) {
                if (rule.type === 1 && rule.selectorText === selector) {
                    return rule;
                }
            }

            // 새 규칙 생성 (미디어쿼리 내부)
            const ruleText = `${selector} { }`;
            const index = mediaRule.insertRule(ruleText, mediaRule.cssRules.length);
            return mediaRule.cssRules[index];
        } catch (e) {
            console.warn('[UndoRedo] Failed to find/create CSS rule in media:', e);
            return null;
        }
    }

    /**
     * property 문자열에서 CSS 속성명과 breakpoint 분리
     * @param {string} property - "color" 또는 "color@625"
     * @returns {{ prop: string, breakpoint: number|null }}
     */
    _parsePropertyWithBreakpoint(property) {
        if (!property) return { prop: property, breakpoint: null };

        const atIndex = property.indexOf('@');
        if (atIndex === -1) {
            return { prop: property, breakpoint: null };
        }

        return {
            prop: property.substring(0, atIndex),
            breakpoint: parseInt(property.substring(atIndex + 1), 10) || null
        };
    }

    /**
     * 미디어쿼리 규칙이 특정 breakpoint와 매치되는지 확인
     * @param {CSSMediaRule} mediaRule
     * @param {number} breakpoint
     * @returns {boolean}
     */
    _matchesMediaBreakpoint(mediaRule, breakpoint) {
        const conditionText = mediaRule.conditionText || mediaRule.media?.mediaText || '';
        // "(max-width: 625px)" 형태에서 숫자 추출
        const match = conditionText.match(/max-width:\s*(\d+)px/);
        if (match) {
            const mediaWidth = parseInt(match[1], 10);
            // findOrCreateMediaRule()에서 +1px 여유를 추가하므로
            // breakpoint 또는 breakpoint + 1과 매칭
            return mediaWidth === breakpoint || mediaWidth === breakpoint + 1;
        }
        return false;
    }

    /**
     * 요소가 CSS 규칙과 매치되면 matchedRules에 추가
     * @param {HTMLElement} element
     * @param {CSSStyleRule} rule
     * @param {string} kebabProp - kebab-case CSS property
     * @param {Array} matchedRules - 결과 배열
     * @param {number} index
     * @param {CSSMediaRule|null} parentMediaRule - 부모 미디어쿼리 (있을 경우)
     */
    _tryMatchRule(element, rule, kebabProp, matchedRules, index, parentMediaRule = null) {
        try {
            if (element.matches(rule.selectorText)) {
                const value = rule.style.getPropertyValue(kebabProp);
                matchedRules.push({
                    rule,
                    selector: rule.selectorText,
                    value,
                    index,
                    specificity: this.calculateSpecificity(rule.selectorText),
                    mediaRule: parentMediaRule
                });
            }
        } catch (e) {
            // 잘못된 셀렉터는 건너뜀
        }
    }

    /**
     * Calculate CSS specificity for a selector
     * Returns [ids, classes, elements]
     */
    calculateSpecificity(selectorText) {
        if (!selectorText) return [0, 0, 0];

        let ids = 0;
        let classes = 0;
        let elements = 0;

        const idMatches = selectorText.match(/#[a-zA-Z_-][a-zA-Z0-9_-]*/g);
        if (idMatches) ids = idMatches.length;

        const classMatches = selectorText.match(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g);
        if (classMatches) classes += classMatches.length;

        const attrMatches = selectorText.match(/\[[^\]]+\]/g);
        if (attrMatches) classes += attrMatches.length;

        const pseudoClassMatches = selectorText.match(/:[a-zA-Z-]+(?!\()/g);
        if (pseudoClassMatches) classes += pseudoClassMatches.length;

        const elementMatches = selectorText.match(/(?:^|[\s>+~])([a-zA-Z][a-zA-Z0-9]*)/g);
        if (elementMatches) elements = elementMatches.length;

        return [ids, classes, elements];
    }

    // ==================== CSS Rule Snapshot Methods ====================

    /**
     * Collect all CSS rules for a selector across all media queries
     * Reads from mainIframe (iframe0) as the source of truth
     * @param {string} selector - CSS selector (e.g., '.line')
     * @param {string} property - CSS property name (camelCase)
     * @param {Document} doc - Document context (mainIframe document)
     * @returns {Object} Rules object { pc: value|null, 769: value|null, ... }
     */
    collectAllRulesForSelector(selector, property, doc) {
        if (!selector || !property || !doc) return {};

        const kebabProp = this.toKebabCase(property);
        const rules = {};

        try {
            for (const sheet of doc.styleSheets) {
                // zaemit-temp-styles 또는 style.css만 검색
                const isStyleCSS = sheet.href && sheet.href.includes('style.css');
                const isTempStyle = sheet.ownerNode && sheet.ownerNode.id === 'zaemit-temp-styles';
                if (!isStyleCSS && !isTempStyle) continue;

                try {
                    const cssRules = sheet.cssRules || sheet.rules;
                    if (!cssRules) continue;

                    for (let i = 0; i < cssRules.length; i++) {
                        const rule = cssRules[i];

                        // CSSStyleRule (type=1) - PC (base) rule
                        if (rule.type === 1 && rule.selectorText === selector) {
                            const value = rule.style.getPropertyValue(kebabProp);
                            if (value) {
                                rules.pc = value;
                            }
                        }
                        // CSSMediaRule (type=4) - media query rules
                        else if (rule.type === 4) {
                            const conditionText = rule.conditionText || rule.media?.mediaText || '';
                            const match = conditionText.match(/max-width:\s*(\d+)px/);
                            if (!match) continue;

                            const breakpoint = parseInt(match[1], 10);
                            const innerRules = rule.cssRules;
                            if (!innerRules) continue;

                            for (let j = 0; j < innerRules.length; j++) {
                                const innerRule = innerRules[j];
                                if (innerRule.type === 1 && innerRule.selectorText === selector) {
                                    const value = innerRule.style.getPropertyValue(kebabProp);
                                    if (value) {
                                        rules[breakpoint] = value;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin error
                    continue;
                }
            }
        } catch (e) {
            console.warn('[UndoRedo] Error collecting CSS rules:', e);
        }

        return rules;
    }

    /**
     * Record a CSS rule snapshot change for undo/redo
     * @param {HTMLElement} element - Target element (for path/location)
     * @param {string} selector - CSS selector
     * @param {string} property - CSS property name (camelCase)
     * @param {Object} oldRules - Rules before change { pc: value|null, 769: value|null, ... }
     * @param {Object} newRules - Rules after change { pc: value|null, 769: value|null, ... }
     */
    recordCSSRuleSnapshot(element, selector, property, oldRules, newRules) {
        console.log('[RECORD] recordCSSRuleSnapshot:', { selector, property, oldRules, newRules });

        if (this.isUndoRedoAction || this.suppressRecording) {
            console.log('[RECORD] Skipped - isUndoRedoAction or suppressRecording');
            return;
        }

        // Check if there's any actual change
        const oldKeys = Object.keys(oldRules || {});
        const newKeys = Object.keys(newRules || {});
        const allKeys = new Set([...oldKeys, ...newKeys]);

        let hasChange = false;
        for (const key of allKeys) {
            if ((oldRules?.[key] || '') !== (newRules?.[key] || '')) {
                hasChange = true;
                break;
            }
        }

        if (!hasChange) {
            console.log('[RECORD] Skipped - no actual change');
            return;
        }

        const path = this.getElementPath(element);
        if (!path) return;

        this.pushChange({
            type: 'cssRuleSnapshot',
            elementPath: path,
            selector,
            property,
            oldRules: oldRules || {},
            newRules: newRules || {},
            timestamp: Date.now()
        }, element);
    }

    /**
     * Revert CSS rule snapshot (for undo)
     * Restores all media query rules at once
     * @param {Object} change - The change record
     * @param {Document} doc - Document context
     */
    revertCSSRuleSnapshot(change, doc) {
        const { selector, property, oldRules } = change;
        if (!selector || !property || !oldRules) return;

        // ★ 항상 mainIframe에서 수정 (syncCSSToAllCanvases가 mainIframe 기준으로 동기화)
        const mainDoc = this.multiCanvasManager?.mainIframe?.contentDocument || doc;
        const kebabProp = this.toKebabCase(property);

        console.log('[UNDO] revertCSSRuleSnapshot:', { selector, property, kebabProp, oldRules });

        // ★ CSS 규칙 복원 후 inline style이 override하지 않도록 제거
        // applyStyleChange가 inline→CSS 전환했을 수 있으므로, Undo 시에도 inline을 정리해야 함
        if (mainDoc) {
            try {
                // pseudo-class selector (:hover, :focus, :active)에서 base selector 추출
                const baseSelector = selector.replace(/:(hover|focus|active)$/i, '');
                const targets = mainDoc.querySelectorAll(baseSelector);
                targets.forEach(targetEl => {
                    if (targetEl.style.getPropertyValue(kebabProp)) {
                        targetEl.style.removeProperty(kebabProp);
                    }
                });
            } catch(e) { /* selector가 invalid할 수 있음 */ }
        }

        // Restore all rules from snapshot
        const allBreakpoints = Object.keys(oldRules);

        for (const bp of allBreakpoints) {
            const value = oldRules[bp];

            if (bp === 'pc') {
                // PC (base) rule - no media query
                const rule = this.findOrCreateCSSRule(selector, mainDoc);
                if (rule) {
                    if (value) {
                        rule.style.setProperty(kebabProp, value);
                    } else {
                        rule.style.removeProperty(kebabProp);
                    }
                }
            } else {
                // Media query breakpoint
                const breakpoint = parseInt(bp, 10);
                if (!isNaN(breakpoint)) {
                    const rule = this.findOrCreateCSSRuleInMedia(selector, breakpoint, mainDoc);
                    if (rule) {
                        if (value) {
                            rule.style.setProperty(kebabProp, value);
                        } else {
                            rule.style.removeProperty(kebabProp);
                        }
                    }
                }
            }
        }

        // Also clear any breakpoints that were added in newRules but not in oldRules
        const newRules = change.newRules || {};
        for (const bp of Object.keys(newRules)) {
            if (!(bp in oldRules)) {
                // This breakpoint was added, need to remove it
                if (bp === 'pc') {
                    const rule = this.findOrCreateCSSRule(selector, mainDoc);
                    if (rule) {
                        rule.style.removeProperty(kebabProp);
                    }
                } else {
                    const breakpoint = parseInt(bp, 10);
                    if (!isNaN(breakpoint)) {
                        const rule = this.findOrCreateCSSRuleInMedia(selector, breakpoint, mainDoc);
                        if (rule) {
                            rule.style.removeProperty(kebabProp);
                        }
                    }
                }
            }
        }
    }

    /**
     * Apply CSS rule snapshot (for redo)
     * Applies all media query rules at once
     * @param {Object} change - The change record
     * @param {Document} doc - Document context
     */
    applyCSSRuleSnapshot(change, doc) {
        const { selector, property, newRules } = change;
        if (!selector || !property || !newRules) return;

        // ★ 항상 mainIframe에서 수정
        const mainDoc = this.multiCanvasManager?.mainIframe?.contentDocument || doc;
        const kebabProp = this.toKebabCase(property);

        console.log('[REDO] applyCSSRuleSnapshot:', { selector, property, newRules });

        // Apply all rules from snapshot
        const allBreakpoints = Object.keys(newRules);

        for (const bp of allBreakpoints) {
            const value = newRules[bp];

            if (bp === 'pc') {
                // PC (base) rule - no media query
                const rule = this.findOrCreateCSSRule(selector, mainDoc);
                if (rule) {
                    if (value) {
                        rule.style.setProperty(kebabProp, value);
                    } else {
                        rule.style.removeProperty(kebabProp);
                    }
                }
            } else {
                // Media query breakpoint
                const breakpoint = parseInt(bp, 10);
                if (!isNaN(breakpoint)) {
                    const rule = this.findOrCreateCSSRuleInMedia(selector, breakpoint, mainDoc);
                    if (rule) {
                        if (value) {
                            rule.style.setProperty(kebabProp, value);
                        } else {
                            rule.style.removeProperty(kebabProp);
                        }
                    }
                }
            }
        }

        // Also clear any breakpoints that were in oldRules but not in newRules
        const oldRules = change.oldRules || {};
        for (const bp of Object.keys(oldRules)) {
            if (!(bp in newRules)) {
                // This breakpoint was removed, need to clear it
                if (bp === 'pc') {
                    const rule = this.findOrCreateCSSRule(selector, mainDoc);
                    if (rule) {
                        rule.style.removeProperty(kebabProp);
                    }
                } else {
                    const breakpoint = parseInt(bp, 10);
                    if (!isNaN(breakpoint)) {
                        const rule = this.findOrCreateCSSRuleInMedia(selector, breakpoint, mainDoc);
                        if (rule) {
                            rule.style.removeProperty(kebabProp);
                        }
                    }
                }
            }
        }
    }
}

export default UndoRedoManager;
