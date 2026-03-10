/**
 * DOMSnapshotManager - DOM data-* 속성 스냅샷 관리
 *
 * AI가 JS를 제공할 때, JS가 동적으로 추가하는 data-* 속성(예: data-initialized)을
 * 저장 시 제거하기 위한 스냅샷 기반 추적 시스템.
 *
 * 로직:
 * 1. 프로젝트 로드 시 → captureSnapshot()으로 모든 data-* 속성 캡처
 * 2. AI HTML 적용 시 → addToSnapshot()으로 새 요소의 data-* 속성 추가
 * 3. 저장/미리보기 시 → cleanDynamicDataAttrs()로 스냅샷에 없는 data-* 제거
 */

import EventEmitter from './EventEmitter.js';

class DOMSnapshotManager extends EventEmitter {
    constructor() {
        super();
        this.snapshot = new Map();  // elementPath → Set<data-attr-name>
        this.previewFrame = null;
    }

    init(previewFrame) {
        this.previewFrame = previewFrame;
    }

    /**
     * 요소의 고유 경로 생성 (body 기준)
     * 예: 'body>div:0>section:1>div:0'
     * @param {Element} element - 경로를 생성할 요소
     * @param {Element} [bodyRef] - body 기준점 (clone된 문서용, 생략 시 ownerDocument.body 사용)
     */
    getElementPath(element, bodyRef = null) {
        const path = [];
        let current = element;
        const body = bodyRef || element.ownerDocument?.body;

        while (current && current !== body && current.parentElement) {
            const parent = current.parentElement;
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current);
            const tag = current.tagName.toLowerCase();
            path.unshift(`${tag}:${index}`);
            current = parent;
        }

        return path.length > 0 ? 'body>' + path.join('>') : 'body';
    }

    /**
     * 경로로 요소 찾기
     */
    findElementByPath(path, doc) {
        if (!path || path === 'body') return doc.body;
        if (!path.startsWith('body>')) return null;

        const parts = path.substring(5).split('>');
        let current = doc.body;

        for (const part of parts) {
            if (!current) return null;
            const colonIdx = part.lastIndexOf(':');
            if (colonIdx === -1) return null;

            const tag = part.substring(0, colonIdx);
            const index = parseInt(part.substring(colonIdx + 1), 10);

            const children = Array.from(current.children);
            const matchingChildren = children.filter(c => c.tagName.toLowerCase() === tag);
            current = matchingChildren[index];
        }

        return current;
    }

    /**
     * 현재 DOM의 모든 data-* 속성 캡처 (초기 스냅샷)
     */
    captureSnapshot() {
        const doc = this.previewFrame?.contentDocument;
        if (!doc?.body) {
            console.warn('[DOMSnapshot] captureSnapshot: document not available');
            return;
        }

        this.snapshot.clear();

        // body 자체도 추가
        const bodyAttrs = new Set();
        for (const attr of doc.body.attributes) {
            if (attr.name.startsWith('data-')) {
                bodyAttrs.add(attr.name);
            }
        }
        this.snapshot.set('body', bodyAttrs);

        // 모든 자식 요소
        doc.body.querySelectorAll('*').forEach(el => {
            // 에디터 관련 요소는 제외
            if (el.id && (el.id.startsWith('editor-') || el.id.startsWith('ai-'))) {
                return;
            }

            const path = this.getElementPath(el);
            const dataAttrs = new Set();

            for (const attr of el.attributes) {
                if (attr.name.startsWith('data-')) {
                    dataAttrs.add(attr.name);
                }
            }

            this.snapshot.set(path, dataAttrs);
        });

        console.log('[DOMSnapshot] 스냅샷 캡처 완료, 요소 수:', this.snapshot.size);
    }

    /**
     * AI HTML 적용 후 새 요소들을 스냅샷에 추가
     * @param {HTMLElement|HTMLElement[]} newElements - 새로 추가된 요소(들)
     */
    addToSnapshot(newElements) {
        if (!newElements) return;

        if (!Array.isArray(newElements)) {
            newElements = [newElements];
        }

        let addedCount = 0;

        for (const el of newElements) {
            if (!el || !el.tagName) continue;

            // 요소 자체 추가
            const path = this.getElementPath(el);
            const dataAttrs = new Set();
            for (const attr of el.attributes) {
                if (attr.name.startsWith('data-')) {
                    dataAttrs.add(attr.name);
                }
            }
            this.snapshot.set(path, dataAttrs);
            addedCount++;

            // 자식 요소들도 추가
            el.querySelectorAll('*').forEach(child => {
                // 에디터 관련 요소는 제외
                if (child.id && (child.id.startsWith('editor-') || child.id.startsWith('ai-'))) {
                    return;
                }

                const childPath = this.getElementPath(child);
                const childDataAttrs = new Set();
                for (const attr of child.attributes) {
                    if (attr.name.startsWith('data-')) {
                        childDataAttrs.add(attr.name);
                    }
                }
                this.snapshot.set(childPath, childDataAttrs);
                addedCount++;
            });
        }

        if (addedCount > 0) {
            console.log('[DOMSnapshot] 스냅샷에 요소 추가됨:', addedCount, '총 요소 수:', this.snapshot.size);
        }
    }

    /**
     * 스냅샷에 없는 data-* 속성 제거 (저장/미리보기 전 호출)
     * @param {Document|HTMLElement} target - 정리할 문서 또는 요소 (clone)
     */
    cleanDynamicDataAttrs(target) {
        const body = target.body || target.querySelector('body') || target;

        if (!body) {
            console.warn('[DOMSnapshot] cleanDynamicDataAttrs: body not found');
            return;
        }

        let removedCount = 0;

        // body 자체 처리
        if (body.tagName === 'BODY') {
            const bodySnapshot = this.snapshot.get('body') || new Set();
            const attrsToRemove = [];
            for (const attr of body.attributes) {
                if (attr.name.startsWith('data-') && !bodySnapshot.has(attr.name)) {
                    attrsToRemove.push(attr.name);
                }
            }
            attrsToRemove.forEach(name => {
                body.removeAttribute(name);
                removedCount++;
            });
        }

        // 모든 자식 요소 처리 - ★ body를 기준점으로 전달
        body.querySelectorAll('*').forEach(el => {
            // 에디터 관련 요소는 건너뜀 (어차피 _getCleanHTML에서 제거됨)
            if (el.id && (el.id.startsWith('editor-') || el.id.startsWith('ai-'))) {
                return;
            }

            // ★ 핵심 수정: clone된 body를 기준점으로 전달하여 올바른 경로 계산
            const path = this.getElementPath(el, body);
            const snapshotAttrs = this.snapshot.get(path) || new Set();

            const attrsToRemove = [];
            for (const attr of el.attributes) {
                if (attr.name.startsWith('data-') && !snapshotAttrs.has(attr.name)) {
                    attrsToRemove.push(attr.name);
                }
            }

            attrsToRemove.forEach(name => {
                el.removeAttribute(name);
                removedCount++;
            });
        });

        if (removedCount > 0) {
            console.log('[DOMSnapshot] 동적 data-* 속성 제거됨:', removedCount);
        }
    }

    /**
     * 스냅샷 초기화
     */
    clear() {
        this.snapshot.clear();
        console.log('[DOMSnapshot] 스냅샷 초기화됨');
    }

    /**
     * 스냅샷 크기 반환
     */
    getSize() {
        return this.snapshot.size;
    }

    /**
     * 디버그용: 스냅샷 내용 출력
     */
    debug() {
        console.log('[DOMSnapshot] === 스냅샷 내용 ===');
        this.snapshot.forEach((attrs, path) => {
            if (attrs.size > 0) {
                console.log(`  ${path}: ${Array.from(attrs).join(', ')}`);
            }
        });
        console.log('[DOMSnapshot] === 끝 ===');
    }
}

export default DOMSnapshotManager;
