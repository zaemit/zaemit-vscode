/**
 * MCPBridge - 에디터 WebView ↔ Extension Host(MCP) 간 브릿지
 *
 * VSCode 익스텐션 환경에서는 WebSocket 대신 postMessage를 사용합니다.
 * 에디터의 선택 상태, 페이지 HTML 등을 Extension Host로 전송하고,
 * MCP 서버(Claude Code)에서 오는 변경 요청을 에디터에 적용합니다.
 */
class MCPBridge {
    constructor(editorApp) {
        this.editor = editorApp;
    }

    init() {
        this._bindEditorEvents();
        this._bindExtensionMessages();

        // 초기 상태 전송 (에디터가 이미 로드된 후 init되므로)
        setTimeout(() => this._sendCurrentState(), 500);
    }

    // ========== Extension Host로 메시지 전송 ==========

    _postToExtension(type, payload) {
        if (window.vscBridge && window.vscBridge.vscode) {
            window.vscBridge.vscode.postMessage({ type, payload });
        }
    }

    // ========== 에디터 → Extension Host (상태 전송) ==========

    _bindEditorEvents() {
        const sel = this.editor.modules?.selection;
        if (sel) {
            sel.on('element:selected', (element) => {
                this._sendSelection(element);
            });
            sel.on('element:deselected', () => {
                this._postToExtension('mcp:selection', null);
            });
        }
    }

    _sendCurrentState() {
        // 현재 선택 요소
        const sel = this.editor.modules?.selection?.selectedElement;
        if (sel) {
            this._sendSelection(sel);
        }

        // 현재 페이지 HTML
        this._sendPageHtml();

        // 요소 트리
        this._sendElementTree();
    }

    _sendSelection(element) {
        if (!element) {
            this._postToExtension('mcp:selection', null);
            return;
        }

        const selector = this._generateSelector(element);
        const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element);

        this._postToExtension('mcp:selection', {
            selector,
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            textContent: element.textContent?.substring(0, 200) || '',
            outerHTML: element.outerHTML?.substring(0, 2000) || '',
            attributes: this._getAttributes(element),
            computedStyles: computedStyle ? {
                display: computedStyle.display,
                position: computedStyle.position,
                width: computedStyle.width,
                height: computedStyle.height,
                color: computedStyle.color,
                backgroundColor: computedStyle.backgroundColor,
                fontSize: computedStyle.fontSize,
                fontFamily: computedStyle.fontFamily,
                margin: computedStyle.margin,
                padding: computedStyle.padding,
                border: computedStyle.border,
            } : null,
            childCount: element.children?.length || 0,
            parentTag: element.parentElement?.tagName?.toLowerCase() || null,
        });
    }

    _sendPageHtml() {
        try {
            const iframe = this.editor.modules?.selection?.previewFrame;
            const doc = iframe?.contentDocument;
            if (doc) {
                this._postToExtension('mcp:page-html', doc.documentElement.outerHTML);
                this._postToExtension('mcp:page-url', iframe.src || null);
            }
        } catch (e) {
            // cross-origin iframe
        }
    }

    _sendElementTree() {
        try {
            const iframe = this.editor.modules?.selection?.previewFrame;
            const doc = iframe?.contentDocument;
            if (!doc || !doc.body) return;

            const tree = this._buildTree(doc.body, 0, 3);
            this._postToExtension('mcp:element-tree', tree);
        } catch (e) {
            // cross-origin iframe
        }
    }

    _buildTree(element, depth, maxDepth) {
        if (!element || depth > maxDepth) return null;

        const node = {
            tag: element.tagName?.toLowerCase(),
            id: element.id || undefined,
            class: element.className || undefined,
            selector: this._generateSelector(element),
            children: [],
        };

        if (element.children) {
            for (let i = 0; i < element.children.length && i < 50; i++) {
                const child = this._buildTree(element.children[i], depth + 1, maxDepth);
                if (child) node.children.push(child);
            }
        }

        return node;
    }

    // ========== Extension Host → 에디터 (변경 적용) ==========

    _bindExtensionMessages() {
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg || !msg.type) return;

            // MCP 명령만 처리
            if (!msg.type.startsWith('mcp:')) return;
            // 상태 전송 메시지는 무시 (우리가 보낸 것)
            if (msg.type === 'mcp:selection' || msg.type === 'mcp:page-html' ||
                msg.type === 'mcp:page-url' || msg.type === 'mcp:element-tree') return;

            // 뷰포트/해상도 명령은 document 없이도 처리 가능
            let result;
            try {
                switch (msg.type) {
                    case 'mcp:get-viewports':
                        result = this._getViewports();
                        this._sendCommandResult(msg.commandId, result);
                        return;
                    case 'mcp:toggle-viewport':
                        result = this._toggleViewport(msg.payload.width, msg.payload.enabled);
                        this._sendCommandResult(msg.commandId, result);
                        return;
                    case 'mcp:set-active-view':
                        result = this._setActiveView(msg.payload.width);
                        this._sendCommandResult(msg.commandId, result);
                        return;
                    case 'mcp:toggle-multiview':
                        result = this._toggleMultiView(msg.payload.enabled);
                        this._sendCommandResult(msg.commandId, result);
                        return;
                    case 'mcp:reload-page':
                        result = this._reloadPage();
                        this._sendCommandResult(msg.commandId, result);
                        return;
                }
            } catch (e) {
                this._sendCommandResult(msg.commandId, { error: e.message });
                return;
            }

            const iframe = this.editor.modules?.selection?.previewFrame;
            const doc = iframe?.contentDocument;
            if (!doc) {
                this._sendCommandResult(msg.commandId, { error: 'No document available' });
                return;
            }

            try {
                switch (msg.type) {
                    case 'mcp:update-element':
                        result = this._applyUpdate(doc, msg.payload.selector, msg.payload.changes);
                        break;
                    case 'mcp:replace-html':
                        result = this._applyReplaceHtml(doc, msg.payload.selector, msg.payload.html);
                        break;
                    case 'mcp:insert-element':
                        result = this._applyInsert(doc, msg.payload.parentSelector, msg.payload.html, msg.payload.position);
                        break;
                    case 'mcp:delete-element':
                        result = this._applyDelete(doc, msg.payload.selector);
                        break;
                    default:
                        result = { error: 'Unknown command' };
                }
            } catch (e) {
                result = { error: e.message };
            }

            this._sendCommandResult(msg.commandId, result || { success: true });
        });
    }

    _sendCommandResult(commandId, payload) {
        if (commandId && window.vscBridge && window.vscBridge.vscode) {
            // commandId는 최상위에 보내야 mcpBridgeServer가 매칭할 수 있음
            window.vscBridge.vscode.postMessage({
                type: 'mcp:command-result',
                commandId,
                payload,
            });
        }
    }

    _applyUpdate(doc, selector, changes) {
        const el = doc.querySelector(selector);
        if (!el) return { error: `Element not found: ${selector}` };

        if (changes.style) {
            const failed = [];
            for (const [prop, value] of Object.entries(changes.style)) {
                try {
                    el.style[prop] = value;
                } catch (e) {
                    failed.push(prop);
                }
            }
            if (failed.length > 0) {
                this._notifyEditorChanged(el);
                return { success: true, warning: `Failed to set: ${failed.join(', ')}` };
            }
        }

        if (changes.attributes) {
            for (const [attr, value] of Object.entries(changes.attributes)) {
                if (value === null) {
                    el.removeAttribute(attr);
                } else {
                    el.setAttribute(attr, value);
                }
            }
        }

        if (changes.textContent !== undefined) {
            el.textContent = changes.textContent;
        }

        if (changes.innerHTML !== undefined) {
            el.innerHTML = changes.innerHTML;
        }

        this._notifyEditorChanged(el);
        return { success: true };
    }

    _applyReplaceHtml(doc, selector, html) {
        const el = doc.querySelector(selector);
        if (!el) return { error: `Element not found: ${selector}` };
        el.outerHTML = html;
        this._notifyEditorChanged(null);
        return { success: true };
    }

    _applyInsert(doc, parentSelector, html, position) {
        const parent = doc.querySelector(parentSelector);
        if (!parent) return { error: `Parent not found: ${parentSelector}` };
        parent.insertAdjacentHTML(position || 'beforeend', html);
        this._notifyEditorChanged(parent);
        return { success: true };
    }

    _applyDelete(doc, selector) {
        const el = doc.querySelector(selector);
        if (!el) return { error: `Element not found: ${selector}` };
        // 선택된 요소라면 삭제 전 선택 해제
        if (this.editor.modules?.selection?.selectedElement === el) {
            this.editor.modules.selection.deselectElement?.();
        }
        el.remove();
        this._notifyEditorChanged(null);
        return { success: true };
    }

    _notifyEditorChanged(element) {
        // 1. DOM 스냅샷 갱신
        if (this.editor.modules?.domSnapshot) {
            this.editor.modules.domSnapshot.captureSnapshot?.();
        }

        // 2. 선택 오버레이 갱신
        if (element && this.editor.modules?.overlay) {
            this.editor.modules.overlay.updateOverlays?.();
            this.editor.modules.overlay.update?.(element);
        }

        // 3. 멀티캔버스 동기화 (다른 뷰포트에도 반영)
        if (this.editor.modules?.multiCanvas?.isMultiViewEnabled) {
            this.editor.modules.multiCanvas.syncCSSToAllCanvases?.(true);
            // 인라인 스타일도 동기화 (MCP에서 el.style 변경 시)
            if (element) {
                this._syncInlineStyleToAllIframes(element);
            }
        }

        // 4. 파일 저장 트리거 (saveHTML → 디바운스 → 실제 파일 저장)
        if (this.editor.saveHTML) {
            this.editor.saveHTML();
        }

        // 5. MCP Bridge로 최신 HTML 전송
        setTimeout(() => {
            this._sendPageHtml();
            this._sendElementTree();
        }, 200);
    }

    // ========== 뷰포트/해상도 제어 ==========

    _getViewports() {
        const viewModes = document.getElementById('viewModes');
        if (!viewModes) return { error: 'ViewModes panel not found' };

        const viewports = [];
        viewModes.querySelectorAll('.view-btn-wrapper').forEach(wrapper => {
            const btn = wrapper.querySelector('.view-btn');
            const checkbox = wrapper.querySelector('.view-checkbox');
            if (btn) {
                viewports.push({
                    width: btn.dataset.width || checkbox?.dataset?.width,
                    label: btn.textContent?.trim() || '',
                    active: btn.classList.contains('active'),
                    enabled: checkbox ? checkbox.checked : true,
                });
            }
        });

        const multiCanvas = this.editor.modules?.multiCanvas;
        return {
            success: true,
            viewports,
            multiViewEnabled: multiCanvas?.isMultiViewEnabled || false,
        };
    }

    _toggleViewport(width, enabled) {
        const viewModes = document.getElementById('viewModes');
        if (!viewModes) return { error: 'ViewModes panel not found' };

        const checkbox = viewModes.querySelector(`.view-checkbox[data-width="${width}"]`);
        if (!checkbox) return { error: `Viewport not found: ${width}` };

        if (enabled === true || enabled === false) {
            checkbox.checked = enabled;
        } else {
            checkbox.checked = !checkbox.checked;
        }

        // change 이벤트를 발생시켜 ViewModeManager가 처리하도록
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, width, enabled: checkbox.checked };
    }

    _setActiveView(width) {
        const viewModes = document.getElementById('viewModes');
        if (!viewModes) return { error: 'ViewModes panel not found' };

        const btn = viewModes.querySelector(`.view-btn[data-width="${width}"]`);
        if (!btn) return { error: `View button not found: ${width}` };

        btn.click();
        return { success: true, width };
    }

    _toggleMultiView(enabled) {
        const multiCanvas = this.editor.modules?.multiCanvas;
        if (!multiCanvas) return { error: 'MultiCanvasManager not available' };

        if (enabled === true || enabled === false) {
            if (enabled && !multiCanvas.isMultiViewEnabled) {
                multiCanvas.enableMultiView();
            } else if (!enabled && multiCanvas.isMultiViewEnabled) {
                multiCanvas.disableMultiView();
            }
        } else {
            // toggle
            if (multiCanvas.isMultiViewEnabled) {
                multiCanvas.disableMultiView();
            } else {
                multiCanvas.enableMultiView();
            }
        }

        return { success: true, multiViewEnabled: multiCanvas.isMultiViewEnabled };
    }

    _reloadPage() {
        const preview = this.editor.modules?.preview;
        if (!preview) return { error: 'PreviewManager not available' };

        preview.refresh();
        return { success: true };
    }

    // ========== 멀티뷰 인라인 스타일 동기화 ==========

    /**
     * element의 inline style을 모든 멀티뷰 iframe에 동기화.
     * syncElementStyleFromElement는 source iframe 감지에 실패할 수 있으므로
     * path 기반으로 직접 동기화.
     */
    _syncInlineStyleToAllIframes(element) {
        const multiCanvas = this.editor.modules?.multiCanvas;
        if (!multiCanvas?._getElementPath || !multiCanvas?._findElementByPath) return;

        const elementPath = multiCanvas._getElementPath(element);
        if (!elementPath) return;

        const styleAttr = element.getAttribute('style') || '';

        (multiCanvas.iframes || []).forEach(iframe => {
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;
                // source element가 이 iframe에 있으면 건너뜀
                if (doc.body?.contains(element)) return;
                const targetEl = multiCanvas._findElementByPath(elementPath, doc);
                if (!targetEl) return;
                if (styleAttr) {
                    targetEl.setAttribute('style', styleAttr);
                } else {
                    targetEl.removeAttribute('style');
                }
            } catch (e) {
                // cross-origin 등 무시
            }
        });
    }

    // ========== 유틸리티 ==========

    _generateSelector(element) {
        if (element.id) return `#${CSS.escape(element.id)}`;

        const parts = [];
        let current = element;

        while (current && current !== current.ownerDocument?.body) {
            let selector = current.tagName.toLowerCase();

            if (current.id) {
                parts.unshift(`#${CSS.escape(current.id)}`);
                break;
            }

            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(
                    c => c.tagName === current.tagName
                );
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-of-type(${index})`;
                }
            }

            parts.unshift(selector);
            current = current.parentElement;
        }

        return parts.length ? `body > ${parts.join(' > ')}` : 'body';
    }

    _getAttributes(element) {
        const attrs = {};
        for (const attr of element.attributes || []) {
            attrs[attr.name] = attr.value;
        }
        return attrs;
    }
}

export default MCPBridge;
