import EventEmitter from './EventEmitter.js';

/**
 * TextSelectionToolbar - Handles text selection and inline formatting toolbar
 */
class TextSelectionToolbar extends EventEmitter {
    constructor() {
        super();
        this.previewFrame = null;
        this.currentSelection = null;
        this.selectedElement = null;
        this.zoomLevel = 1;
        this.isPreviewingVersion = false;
    }

    /**
     * Initialize the toolbar
     * @param {HTMLIFrameElement} previewFrame
     */
    init(previewFrame) {
        this.previewFrame = previewFrame;
        this.setupToolbar();
        this.setupSelectionListener();
    }

    /**
     * 활성 iframe 변경 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    setActiveIframe(iframe) {
        if (this.previewFrame === iframe) return;
        // 툴바 숨기기
        this.hideToolbar();
        this.previewFrame = iframe;
        // 새 iframe에 선택 리스너 다시 연결
        this.setupSelectionListener();
    }

    /**
     * Set zoom level for position calculations
     * @param {number} zoom
     */
    setZoomLevel(zoom) {
        this.zoomLevel = zoom;
    }

    /**
     * Set version preview mode
     * @param {boolean} isPreviewing
     */
    setPreviewingVersion(isPreviewing) {
        this.isPreviewingVersion = isPreviewing;
    }

    /**
     * Set selected element (for fallback styling)
     * @param {HTMLElement|null} element
     */
    setSelectedElement(element) {
        this.selectedElement = element;
    }

    /**
     * Setup selection change listener on iframe
     */
    setupSelectionListener() {
        if (!this.previewFrame) return;

        const checkSelection = () => {
            try {
                const iframeDoc = this.previewFrame.contentDocument;
                if (!iframeDoc) return;

                iframeDoc.addEventListener('selectionchange', () => {
                    this.handleTextSelection();
                });

                // Also listen for mouseup in iframe
                iframeDoc.addEventListener('mouseup', () => {
                    setTimeout(() => this.handleTextSelection(), 10);
                });
            } catch (e) {
                // Cross-origin or not loaded yet
            }
        };

        // Setup on load
        this.previewFrame.addEventListener('load', checkSelection);

        // Also setup if already loaded
        if (this.previewFrame.contentDocument?.readyState === 'complete') {
            checkSelection();
        }
    }

    /**
     * Reattach iframe handlers after content change
     */
    reattachIframeHandlers() {
        this.setupSelectionListener();
    }

    /**
     * Handle text selection in iframe
     */
    handleTextSelection() {
        if (this.isPreviewingVersion) return;

        const toolbar = document.getElementById('textSelectionToolbar');
        const lineBreakBtn = document.getElementById('selectionLineBreak');

        if (!toolbar) return;

        try {
            const sel = this.previewFrame.contentWindow.getSelection();

            if (!sel || sel.rangeCount === 0) {
                toolbar.classList.remove('visible');
                return;
            }

            const range = sel.getRangeAt(0);

            // Check if cursor is inside an editable text element
            const container = range.commonAncestorContainer;
            const textElement = container.nodeType === 3 ? container.parentElement : container;

            // Only show toolbar if inside a text-containing element
            if (!textElement || textElement === this.previewFrame.contentDocument.body) {
                toolbar.classList.remove('visible');
                return;
            }

            // Only show toolbar when element is in edit mode (contentEditable)
            const isInEditMode = textElement.isContentEditable ||
                                 textElement.closest('[contenteditable="true"]');
            if (!isInEditMode) {
                toolbar.classList.remove('visible');
                return;
            }

            const hasTextSelection = !sel.isCollapsed && sel.toString().trim();
            const hasCursor = sel.isCollapsed;

            // Show toolbar for both cursor position and text selection
            if (!hasTextSelection && !hasCursor) {
                toolbar.classList.remove('visible');
                return;
            }

            // 선택된 요소의 경계 상자 기준으로 툴바 위치 (선택 상자 위에 고정)
            const elementRect = textElement.getBoundingClientRect();
            const iframeRect = this.previewFrame.getBoundingClientRect();

            // Get zoom level - check multiple sources
            let zoom = this.zoomLevel || 1;

            // First check iframe's own transform
            const iframeTransform = this.previewFrame.style.transform;
            if (iframeTransform) {
                const scaleMatch = iframeTransform.match(/scale\(([^)]+)\)/);
                if (scaleMatch) zoom = parseFloat(scaleMatch[1]);
            }

            // For multi-view, check container transform
            const multiContainer = document.querySelector('.multi-canvas-container');
            if (multiContainer) {
                const containerTransform = multiContainer.style.transform;
                if (containerTransform) {
                    const scaleMatch = containerTransform.match(/scale\(([^)]+)\)/);
                    if (scaleMatch) zoom = parseFloat(scaleMatch[1]);
                }
            }

            // 요소 상단 중앙에 툴바 배치 (선택 상자 약간 위)
            let toolbarX = iframeRect.left + (elementRect.left * zoom) + (elementRect.width * zoom / 2) - 150;
            let toolbarY = iframeRect.top + (elementRect.top * zoom) - 50;

            // Ensure toolbar stays within viewport
            toolbarX = Math.max(10, Math.min(toolbarX, window.innerWidth - 320));
            toolbarY = Math.max(50, toolbarY);

            toolbar.style.left = toolbarX + 'px';
            toolbar.style.top = toolbarY + 'px';
            toolbar.classList.add('visible');

            // Always show line break button
            if (lineBreakBtn) {
                lineBreakBtn.style.display = 'inline-flex';
            }

            // Store current selection
            this.currentSelection = { sel, range, isCursor: hasCursor };

            // Update toolbar UI to reflect current selection's styles
            this.updateTextToolbarState(textElement);

        } catch (err) {
            toolbar.classList.remove('visible');
        }
    }

    /**
     * Update toolbar button states based on current selection
     * @param {HTMLElement} element
     */
    updateTextToolbarState(element) {
        if (!element) return;

        try {
            const iframeWindow = this.previewFrame.contentWindow;
            if (!iframeWindow) return;

            // Get the actual element with styles (could be a span wrapper)
            let styledElement = element;
            if (this.currentSelection && !this.currentSelection.isCursor) {
                const container = this.currentSelection.range.commonAncestorContainer;
                if (container.nodeType === 3 && container.parentElement.tagName === 'SPAN') {
                    styledElement = container.parentElement;
                }
            }

            const styledComputed = iframeWindow.getComputedStyle(styledElement);

            // Update font family dropdown
            this.updateFontFamilyDropdown(styledComputed.fontFamily);

            // Update font size dropdown
            this.updateFontSizeDropdown(styledComputed.fontSize);

            // Update color picker
            const colorPicker = document.getElementById('selectionColor');
            if (colorPicker) {
                const color = styledComputed.color;
                colorPicker.value = this.rgbToHex(color) || '#000000';
            }

            // Update background color picker
            const bgColorPicker = document.getElementById('selectionBgColor');
            if (bgColorPicker) {
                const bgColor = styledComputed.backgroundColor;
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    bgColorPicker.value = this.rgbToHex(bgColor) || '#ffff00';
                }
            }

            // Update button states (bold, italic, underline, strikethrough)
            const boldBtn = document.getElementById('selectionBold');
            const italicBtn = document.getElementById('selectionItalic');
            const underlineBtn = document.getElementById('selectionUnderline');
            const strikeBtn = document.getElementById('selectionStrike');

            if (boldBtn) {
                const isBold = parseInt(styledComputed.fontWeight) >= 700 || styledComputed.fontWeight === 'bold';
                boldBtn.classList.toggle('active', isBold);
            }
            if (italicBtn) {
                italicBtn.classList.toggle('active', styledComputed.fontStyle === 'italic');
            }
            if (underlineBtn) {
                underlineBtn.classList.toggle('active', styledComputed.textDecoration.includes('underline'));
            }
            if (strikeBtn) {
                strikeBtn.classList.toggle('active', styledComputed.textDecoration.includes('line-through'));
            }
        } catch (e) {
            // Silently fail if we can't get computed styles
        }
    }

    /**
     * Update font family dropdown
     * @param {string} computedFontFamily
     */
    updateFontFamilyDropdown(computedFontFamily) {
        const fontSelect = document.getElementById('selectionFontFamily');
        if (!fontSelect || !computedFontFamily) return;

        const normalizeFont = (str) => str.replace(/['"]/g, '').toLowerCase().trim();
        const computedFonts = computedFontFamily.split(',').map(f => normalizeFont(f));
        const computedPrimary = computedFonts[0] || '';

        const genericFonts = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system', 'blinkmacsystemfont'];
        const isPrimaryGeneric = genericFonts.includes(computedPrimary);

        let matched = false;

        // Try exact match on primary font
        for (const opt of fontSelect.options) {
            if (!opt.value || opt.dataset.custom === 'true') continue;
            const optPrimary = normalizeFont(opt.value.split(',')[0]);
            if (computedPrimary === optPrimary) {
                fontSelect.value = opt.value;
                matched = true;
                break;
            }
        }

        // If primary is not generic and not matched, show as custom font
        if (!matched && computedPrimary && !isPrimaryGeneric) {
            const existingCustom = fontSelect.querySelector('option[data-custom="true"]');
            if (existingCustom) existingCustom.remove();

            const customOption = document.createElement('option');
            customOption.dataset.custom = 'true';
            customOption.value = computedFontFamily;
            const displayName = computedPrimary
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            customOption.textContent = displayName;
            fontSelect.insertBefore(customOption, fontSelect.options[1]);
            fontSelect.value = computedFontFamily;
            matched = true;
        }

        // If still no match, try by generic font family
        if (!matched && isPrimaryGeneric) {
            for (const opt of fontSelect.options) {
                if (!opt.value || opt.dataset.custom === 'true') continue;
                if (normalizeFont(opt.value).includes(computedPrimary)) {
                    fontSelect.value = opt.value;
                    matched = true;
                    break;
                }
            }
        }

        if (!matched) {
            fontSelect.value = '';
        }
    }

    /**
     * Update font size dropdown
     * @param {string} fontSize
     */
    updateFontSizeDropdown(fontSize) {
        const sizeSelect = document.getElementById('selectionFontSize');
        if (!sizeSelect) return;

        let matched = false;
        for (const opt of sizeSelect.options) {
            if (opt.value === fontSize) {
                sizeSelect.value = opt.value;
                matched = true;
                break;
            }
        }

        if (!matched) {
            const sizeNum = parseFloat(fontSize);
            let closestOpt = null;
            let closestDiff = Infinity;
            for (const opt of sizeSelect.options) {
                if (!opt.value) continue;
                const optNum = parseFloat(opt.value);
                const diff = Math.abs(optNum - sizeNum);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestOpt = opt;
                }
            }
            if (closestOpt && closestDiff <= 2) {
                sizeSelect.value = closestOpt.value;
            } else {
                sizeSelect.value = '';
            }
        }
    }

    /**
     * Setup toolbar button handlers
     */
    setupToolbar() {
        const toolbar = document.getElementById('textSelectionToolbar');
        if (!toolbar) return;

        // Font family
        document.getElementById('selectionFontFamily')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.applySelectionStyle('fontFamily', e.target.value);
                e.target.value = '';
            }
        });

        // Font size
        document.getElementById('selectionFontSize')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.applySelectionStyle('fontSize', e.target.value);
                e.target.value = '';
            }
        });

        // Text color - input for live preview (no span wrap), change for final apply
        const colorPicker = document.getElementById('selectionColor');
        if (colorPicker) {
            let colorPreviewActive = false;
            let originalSelection = null;

            colorPicker.addEventListener('mousedown', () => {
                // Save selection state before color picker interaction
                colorPreviewActive = true;
                originalSelection = this.currentSelection ? { ...this.currentSelection } : null;
            });

            colorPicker.addEventListener('input', (e) => {
                // Preview only - apply style without wrapping in span
                this.previewSelectionStyle('color', e.target.value);
            });

            colorPicker.addEventListener('change', (e) => {
                // Final apply - wrap in span if needed
                if (colorPreviewActive && originalSelection) {
                    this.currentSelection = originalSelection;
                    this.applySelectionStyle('color', e.target.value, true);
                }
                colorPreviewActive = false;
                originalSelection = null;
            });
        }

        // Background color - same pattern
        const bgColorPicker = document.getElementById('selectionBgColor');
        if (bgColorPicker) {
            let bgColorPreviewActive = false;
            let originalBgSelection = null;

            bgColorPicker.addEventListener('mousedown', () => {
                bgColorPreviewActive = true;
                originalBgSelection = this.currentSelection ? { ...this.currentSelection } : null;
            });

            bgColorPicker.addEventListener('input', (e) => {
                this.previewSelectionStyle('backgroundColor', e.target.value);
            });

            bgColorPicker.addEventListener('change', (e) => {
                if (bgColorPreviewActive && originalBgSelection) {
                    this.currentSelection = originalBgSelection;
                    this.applySelectionStyle('backgroundColor', e.target.value, true);
                }
                bgColorPreviewActive = false;
                originalBgSelection = null;
            });
        }

        // Bold
        document.getElementById('selectionBold')?.addEventListener('click', () => {
            this.applySelectionStyle('fontWeight', 'bold');
        });

        // Italic
        document.getElementById('selectionItalic')?.addEventListener('click', () => {
            this.applySelectionStyle('fontStyle', 'italic');
        });

        // Underline
        document.getElementById('selectionUnderline')?.addEventListener('click', () => {
            this.applySelectionStyle('textDecoration', 'underline');
        });

        // Strikethrough
        document.getElementById('selectionStrike')?.addEventListener('click', () => {
            this.applySelectionStyle('textDecoration', 'line-through');
        });

        // Link
        document.getElementById('selectionLink')?.addEventListener('click', () => {
            this.showLinkModal();
        });

        // Line break
        document.getElementById('selectionLineBreak')?.addEventListener('click', () => {
            this.emit('toolbar:lineBreak', this.currentSelection);
        });

        // Clear formatting
        document.getElementById('selectionClear')?.addEventListener('click', () => {
            this.clearSelectionFormatting();
        });

        // Hide toolbar when clicking outside
        document.addEventListener('mousedown', (e) => {
            if (!toolbar.contains(e.target)) {
                setTimeout(() => {
                    const sel = this.previewFrame?.contentWindow?.getSelection();
                    if (!sel || sel.isCollapsed) {
                        toolbar.classList.remove('visible');
                    }
                }, 100);
            }
        });

        // Handle ESC key to exit text editing and hide toolbar
        this.setupEscapeHandler();
    }

    /**
     * Setup ESC key handler for exiting text editing mode
     */
    setupEscapeHandler() {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                const toolbar = document.getElementById('textSelectionToolbar');
                if (toolbar && toolbar.classList.contains('visible')) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Hide toolbar
                    toolbar.classList.remove('visible');

                    // Clear selection in iframe
                    try {
                        const sel = this.previewFrame?.contentWindow?.getSelection();
                        if (sel) {
                            sel.removeAllRanges();
                        }
                    } catch (err) {}

                    // Blur any contenteditable element
                    try {
                        const doc = this.previewFrame?.contentDocument;
                        if (doc) {
                            const active = doc.activeElement;
                            if (active && active.isContentEditable) {
                                active.blur();
                            }
                            // Remove editor-editable class
                            doc.querySelectorAll('.editor-editable').forEach(el => {
                                el.removeAttribute('contenteditable');
                                el.classList.remove('editor-editable');
                            });
                        }
                    } catch (err) {}

                    // Emit event to show overlay again
                    this.emit('toolbar:escaped');
                }
            }
        };

        // Listen on main document
        document.addEventListener('keydown', handleEscape, true);

        // Listen on iframe document when loaded
        const attachToIframe = () => {
            try {
                const iframeDoc = this.previewFrame?.contentDocument;
                if (iframeDoc) {
                    iframeDoc.removeEventListener('keydown', handleEscape, true);
                    iframeDoc.addEventListener('keydown', handleEscape, true);
                }
            } catch (err) {}
        };

        if (this.previewFrame) {
            this.previewFrame.addEventListener('load', attachToIframe);
            if (this.previewFrame.contentDocument?.readyState === 'complete') {
                attachToIframe();
            }
        }
    }

    /**
     * Apply style to current selection
     * @param {string} property
     * @param {string} value
     * @param {boolean} shouldSave
     */
    applySelectionStyle(property, value, shouldSave = true) {
        // Clean up any preview styles
        const previewStyle = this.previewFrame?.contentDocument?.getElementById('editor-color-preview-style');
        if (previewStyle) {
            previewStyle.remove();
        }

        // Priority: text selection > element selection
        if (this.currentSelection) {
            try {
                const { sel, range } = this.currentSelection;
                const doc = this.previewFrame.contentDocument;

                // Check if selection is collapsed (no text selected)
                if (range.collapsed) {
                    // No text selected, apply to element if available
                    if (this.selectedElement) {
                        const oldValue = this.selectedElement.style[property];
                        this.selectedElement.style[property] = value;
                        // ★ gradient text: -webkit-text-fill-color가 설정되어 있으면 함께 변경
                        if (property === 'color') {
                            this._overrideTextFillColor(this.selectedElement, value);
                        }
                        this.emit('style:changed', {
                            element: this.selectedElement,
                            property,
                            oldValue,
                            newValue: value
                        });
                        if (shouldSave) this.emit('toolbar:save');
                    }
                    return;
                }

                // Check if selection is entirely within a single span
                let container = range.commonAncestorContainer;
                if (container.nodeType === Node.TEXT_NODE) {
                    container = container.parentNode;
                }

                // If already in a span and selection covers entire content, just update style
                if (container.tagName === 'SPAN' && range.toString() === container.textContent) {
                    const oldValue = container.style[property];
                    container.style[property] = value;
                    // ★ gradient text: -webkit-text-fill-color가 상속되면 함께 변경
                    if (property === 'color') {
                        this._overrideTextFillColor(container, value);
                    }
                    this.emit('style:changed', {
                        element: container,
                        property,
                        oldValue,
                        newValue: value
                    });
                    if (shouldSave) this.emit('toolbar:save');
                    return;
                }

                // Wrap selection in span with style
                const span = doc.createElement('span');
                span.style[property] = value;
                // ★ gradient text: -webkit-text-fill-color가 상속되면 함께 설정
                if (property === 'color') {
                    this._overrideTextFillColor(span, value);
                }

                // Get parent element for undo recording
                let parentElement = container;
                if (container.nodeType === Node.TEXT_NODE) {
                    parentElement = container.parentNode;
                }
                const oldContent = parentElement.innerHTML;

                // Extract and wrap the selected content
                const contents = range.extractContents();
                span.appendChild(contents);
                range.insertNode(span);

                // Record content change for undo
                const newContent = parentElement.innerHTML;
                this.emit('content:changed', {
                    element: parentElement,
                    oldContent,
                    newContent
                });

                // Restore selection (span이 여전히 문서에 있는지 확인)
                try {
                    if (span.isConnected && doc.contains(span)) {
                        sel.removeAllRanges();
                        const newRange = doc.createRange();
                        newRange.selectNodeContents(span);
                        sel.addRange(newRange);
                        this.currentSelection = { sel, range: newRange };
                    }
                } catch (selErr) {
                    console.warn('Could not restore selection after style apply:', selErr);
                }

                if (shouldSave) this.emit('toolbar:save');

            } catch (err) {
                console.error('Error applying style:', err);
            }
            return;
        }

        // No text selection, apply to selected element
        if (this.selectedElement) {
            const oldValue = this.selectedElement.style[property];
            this.selectedElement.style[property] = value;
            this.emit('style:changed', {
                element: this.selectedElement,
                property,
                oldValue,
                newValue: value
            });
            if (shouldSave) this.emit('toolbar:save');
        }
    }

    /**
     * Preview style on selection without wrapping in span
     * Used for color pickers during drag to show live preview
     * @param {string} property - CSS property
     * @param {string} value - CSS value
     */
    previewSelectionStyle(property, value) {
        if (!this.currentSelection) {
            // Fallback to element styling
            if (this.selectedElement) {
                this.selectedElement.style[property] = value;
                // ★ gradient text: -webkit-text-fill-color 함께 변경
                if (property === 'color') {
                    this._overrideTextFillColor(this.selectedElement, value);
                }
            }
            return;
        }

        try {
            const { range } = this.currentSelection;
            const doc = this.previewFrame?.contentDocument;
            if (!doc) return;

            // Check if selection is collapsed
            if (range.collapsed) {
                if (this.selectedElement) {
                    this.selectedElement.style[property] = value;
                    // ★ gradient text: -webkit-text-fill-color 함께 변경
                    if (property === 'color') {
                        this._overrideTextFillColor(this.selectedElement, value);
                    }
                }
                return;
            }

            // Check if already in a styled span
            let container = range.commonAncestorContainer;
            if (container.nodeType === Node.TEXT_NODE) {
                container = container.parentNode;
            }

            if (container.tagName === 'SPAN' && range.toString() === container.textContent) {
                // Already in span, just update style for preview
                container.style[property] = value;
                // ★ gradient text: -webkit-text-fill-color 함께 변경
                if (property === 'color') {
                    this._overrideTextFillColor(container, value);
                }
                return;
            }

            // For text not in span, use CSS highlight (temporary visual only)
            // Create or update a temporary style element for preview
            let previewStyle = doc.getElementById('editor-color-preview-style');
            if (!previewStyle) {
                previewStyle = doc.createElement('style');
                previewStyle.id = 'editor-color-preview-style';
                doc.head.appendChild(previewStyle);
            }

            // Use ::selection pseudo-element for preview (limited but works)
            // This won't perfectly match but gives visual feedback
            const kebabProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            previewStyle.textContent = `::selection { ${kebabProp}: ${value} !important; }`;

        } catch (err) {
            console.warn('Error previewing style:', err);
        }
    }

    /**
     * Clear formatting from selected element (unwrap inline tag)
     */
    clearSelectionFormatting() {
        const doc = this.previewFrame?.contentDocument;
        if (!doc) return;

        // currentSelection에서 인라인 태그 추출
        if (!this.currentSelection || !this.currentSelection.range) {
            this.hideToolbar();
            return;
        }

        const { range } = this.currentSelection;
        let element = range.commonAncestorContainer;

        // 텍스트 노드면 부모로 이동
        if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentNode;
        }

        // body나 html은 unwrap 불가
        if (!element || element === doc.body || element === doc.documentElement) {
            return;
        }

        // 인라인 태그만 unwrap (블록 요소는 제외)
        const inlineTags = ['SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'A', 'MARK', 'SUB', 'SUP', 'SMALL', 'CODE'];
        if (!inlineTags.includes(element.tagName)) {
            return;
        }

        try {
            const parent = element.parentNode;

            // Clear 전에 snapshot 생성 요청 (EditorApp에서 HTML 저장)
            this.emit('formatting:beforeClear');

            // Move all child nodes to parent before the element
            while (element.firstChild) {
                parent.insertBefore(element.firstChild, element);
            }

            // Remove the now-empty element
            parent.removeChild(element);

            // Merge adjacent text nodes
            parent.normalize();

            // Clear 완료 - snapshot 기반 undo 기록
            this.emit('formatting:cleared');
            this.hideToolbar();
            this.emit('toolbar:save');

        } catch (err) {
            console.error('Error clearing formatting:', err);
        }
    }

    /**
     * Position link modal near the selection
     * @param {HTMLElement} modal
     */
    _positionLinkModal(modal) {
        if (!this.currentSelection) return;

        const { range } = this.currentSelection;
        const rects = range.getClientRects();
        if (rects.length === 0) return;

        // iframe과 zoom 정보
        const iframeRect = this.previewFrame.getBoundingClientRect();
        const zoom = this.zoomLevel || 1;

        // 선택 영역의 첫 번째 rect 사용 (클릭한 위치에 가까운)
        const selRect = rects[0];

        // 화면 좌표로 변환
        const selLeft = iframeRect.left + selRect.left * zoom;
        const selTop = iframeRect.top + selRect.top * zoom;
        const selBottom = iframeRect.top + selRect.bottom * zoom;

        // 모달 크기 (임시로 표시해서 측정)
        modal.style.visibility = 'hidden';
        modal.classList.remove('hidden');
        const modalWidth = modal.offsetWidth;
        const modalHeight = modal.offsetHeight;
        modal.classList.add('hidden');
        modal.style.visibility = '';

        // 기본: 선택 영역 아래에 배치
        let left = selLeft;
        let top = selBottom + 8;

        // 화면 오른쪽 넘침 방지
        if (left + modalWidth > window.innerWidth - 16) {
            left = window.innerWidth - modalWidth - 16;
        }
        // 화면 왼쪽 넘침 방지
        if (left < 16) {
            left = 16;
        }

        // 화면 아래 넘침 시 선택 영역 위에 배치
        if (top + modalHeight > window.innerHeight - 16) {
            top = selTop - modalHeight - 8;
        }
        // 그래도 위로 넘치면 화면 안에 맞춤
        if (top < 16) {
            top = 16;
        }

        modal.style.left = left + 'px';
        modal.style.top = top + 'px';
    }

    /**
     * Show link modal
     */
    showLinkModal() {
        if (!this.currentSelection) return;

        const modal = document.getElementById('linkModal');
        const urlInput = document.getElementById('linkModalUrl');
        const newTabCheck = document.getElementById('linkModalNewTab');
        const applyBtn = document.getElementById('linkModalApply');
        const cancelBtn = document.getElementById('linkModalCancel');

        if (!modal || !urlInput || !newTabCheck || !applyBtn || !cancelBtn) return;

        // Position modal near selection
        this._positionLinkModal(modal);

        // Check if selection is already a link
        const { range } = this.currentSelection;
        let container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) {
            container = container.parentNode;
        }

        // If already a link, pre-fill values
        const existingLink = container.tagName === 'A' ? container : container.closest('a');
        if (existingLink) {
            urlInput.value = existingLink.getAttribute('href') || '';
            newTabCheck.checked = existingLink.getAttribute('target') === '_blank';
        } else {
            urlInput.value = '';
            newTabCheck.checked = false;
        }

        // Show modal
        modal.classList.remove('hidden');
        urlInput.focus();

        // Handle apply
        const handleApply = () => {
            const url = urlInput.value.trim();
            if (url) {
                this.applyLink(url, newTabCheck.checked);
            }
            cleanup();
        };

        // Handle cancel
        const handleCancel = () => {
            cleanup();
        };

        // Handle enter key
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleApply();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        // Cleanup function
        const cleanup = () => {
            modal.classList.add('hidden');
            applyBtn.removeEventListener('click', handleApply);
            cancelBtn.removeEventListener('click', handleCancel);
            urlInput.removeEventListener('keydown', handleKeydown);
        };

        // Add listeners
        applyBtn.addEventListener('click', handleApply);
        cancelBtn.addEventListener('click', handleCancel);
        urlInput.addEventListener('keydown', handleKeydown);
    }

    /**
     * Apply link to selection
     * @param {string} url
     * @param {boolean} newTab
     */
    applyLink(url, newTab) {
        if (!this.currentSelection) return;

        try {
            const { sel, range } = this.currentSelection;
            const doc = this.previewFrame.contentDocument;

            // Check if selection is collapsed
            if (range.collapsed) {
                this.emit('toast', { message: 'Please select text to add a link', type: 'info' });
                return;
            }

            // Check if already in a link element
            let container = range.commonAncestorContainer;
            if (container.nodeType === Node.TEXT_NODE) {
                container = container.parentNode;
            }

            const existingLink = container.tagName === 'A' ? container : container.closest('a');

            if (existingLink && range.toString() === existingLink.textContent) {
                // Update existing link
                const oldHref = existingLink.getAttribute('href') || '';
                existingLink.setAttribute('href', url);

                if (newTab) {
                    existingLink.setAttribute('target', '_blank');
                    const currentRel = existingLink.getAttribute('rel') || '';
                    if (!currentRel.includes('noopener')) {
                        existingLink.setAttribute('rel', (currentRel + ' noopener').trim());
                    }
                } else {
                    existingLink.removeAttribute('target');
                    const currentRel = existingLink.getAttribute('rel') || '';
                    const newRel = currentRel.replace(/\s*noopener\s*/g, ' ').trim();
                    if (newRel) {
                        existingLink.setAttribute('rel', newRel);
                    } else {
                        existingLink.removeAttribute('rel');
                    }
                }

                this.emit('attribute:changed', {
                    element: existingLink,
                    attribute: 'href',
                    oldValue: oldHref,
                    newValue: url
                });
                this.emit('toolbar:save');
                return;
            }

            // Create new link
            const link = doc.createElement('a');
            link.setAttribute('href', url);

            if (newTab) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener');
            }

            // Get parent element for undo recording
            let parentElement = container;
            if (container.nodeType === Node.TEXT_NODE) {
                parentElement = container.parentNode;
            }
            const oldContent = parentElement.innerHTML;

            // Extract and wrap the selected content
            const contents = range.extractContents();
            link.appendChild(contents);
            range.insertNode(link);

            // Record content change for undo
            const newContent = parentElement.innerHTML;
            this.emit('content:changed', {
                element: parentElement,
                oldContent,
                newContent
            });

            // Restore selection (link가 여전히 문서에 있는지 확인)
            // content:changed 이벤트가 멀티뷰 동기화를 트리거할 수 있음
            try {
                if (link.isConnected && doc.contains(link)) {
                    sel.removeAllRanges();
                    const newRange = doc.createRange();
                    newRange.selectNodeContents(link);
                    sel.addRange(newRange);
                    this.currentSelection = { sel, range: newRange };
                }
            } catch (selErr) {
                console.warn('Could not restore selection after link insert:', selErr);
            }

            this.emit('toolbar:save');

        } catch (err) {
            console.error('Error applying link:', err);
            this.emit('toast', { message: 'Failed to apply link', type: 'error' });
        }
    }

    /**
     * Hide the toolbar
     */
    hideToolbar() {
        const toolbar = document.getElementById('textSelectionToolbar');
        if (toolbar) {
            toolbar.classList.remove('visible');
        }
    }

    /**
     * Get current selection
     * @returns {Object|null}
     */
    getCurrentSelection() {
        return this.currentSelection;
    }

    /**
     * Convert RGB to hex
     * @param {string} rgb
     * @returns {string|null}
     */
    rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent') return null;
        if (rgb.startsWith('#')) return rgb;

        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Override -webkit-text-fill-color when changing color.
     * If the element or its ancestors have -webkit-text-fill-color set
     * (e.g., 'transparent' for gradient text), set it to the new color
     * so the color change is visible.
     * @param {HTMLElement} element - Target element
     * @param {string} colorValue - New color value
     */
    _overrideTextFillColor(element, colorValue) {
        if (!element) return;
        const win = element.ownerDocument?.defaultView;
        if (!win) return;
        const computed = win.getComputedStyle(element);
        const textFillColor = computed.webkitTextFillColor;
        // Only override if explicitly set to transparent (gradient text pattern)
        // 'transparent' or 'rgba(0, 0, 0, 0)' indicates gradient text
        if (textFillColor === 'transparent' || textFillColor === 'rgba(0, 0, 0, 0)') {
            element.style.webkitTextFillColor = colorValue;
        }
    }
}

export default TextSelectionToolbar;
