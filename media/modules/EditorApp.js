import EventEmitter from './EventEmitter.js';
import Resizer from './Resizer.js';
import TabManager from './TabManager.js';
import ViewModeManager from './ViewModeManager.js';
import PreviewManager from './PreviewManager.js';
import ElementSelector from './ElementSelector.js';
import PropertyPanel from './PropertyPanel.js';
import StylePanel from './StylePanel.js';
import FileManager from './FileManager.js';
import ToolbarManager from './ToolbarManager.js';
import UIHelper from './UIHelper.js';
import LayerPanel from './LayerPanel.js';
// New modular imports
import KeyboardManager from './KeyboardManager.js';
import SelectionManager from './SelectionManager.js';
import ContextMenuManager from './ContextMenuManager.js';
import TextEditingManager from './TextEditingManager.js';
import ProjectLoader from './ProjectLoader.js';
import ZoomManager from './ZoomManager.js';
import UndoRedoManager from './UndoRedoManager.js';
import ClipboardManager from './ClipboardManager.js';
// VersionManager, AutoSaveManager disabled for VS Code (premium feature)
// import VersionManager from './VersionManager.js';
// import AutoSaveManager from './AutoSaveManager.js';
import OverlayManager from './OverlayManager.js';
import DragDropManager from './DragDropManager.js';
import SettingsManager from './SettingsManager.js';
// Phase 1: Resize/Drag modules
import ResizeDragManager from './ResizeDragManager.js';
import SpacingDragManager from './SpacingDragManager.js';
import GapOverlayManager from './GapOverlayManager.js';
// Phase 2: Version Panel disabled for VS Code (premium feature)
// import VersionPanel from './VersionPanel.js';
// Phase 3: Recovery module disabled for VS Code (depends on AutoSave)
// import RecoveryModal from './RecoveryModal.js';
// Phase 5: Text toolbar modules
import TextSelectionToolbar from './TextSelectionToolbar.js';
import ResponsiveBreakManager from './ResponsiveBreakManager.js';
// Phase 6: AI Chat (removed for VS Code - use VS Code built-in AI)
// Phase 7: Template Manager disabled for VS Code (premium feature)
// import TemplateManager from './TemplateManager.js';
// Phase 8: Table Editor
import TableEditor from './TableEditor.js';
// Phase 9: DOM Snapshot Manager (AI data-* 속성 추적)
import DOMSnapshotManager from './DOMSnapshotManager.js';
// Phase 10: Multi Canvas Manager
import MultiCanvasManager from './MultiCanvasManager.js';
// Phase 11: Image Manager & Editor
import ImageManager from './ImageManager.js';
import ImageEditorModal from './ImageEditorModal.js';
// Phase 12: Image Toolbar (inline quick transforms)
import ImageToolbar from './ImageToolbar.js';
// Phase 13: Icon Picker disabled for VS Code (premium feature)
// import IconPickerManager from './IconPickerManager.js';
// Phase 14: Motion Manager (VS Code only)
import MotionManager from './MotionManager.js';

class EditorApp extends EventEmitter {
    constructor() {
        super();
        this.modules = {};
        this.initialized = false;
        this.screenshotTimer = null;

        // ★ data/blob URL → 상대 경로 매핑 (VS Code 이미지 URL 복원용)
        this._imageUrlMap = new Map();

        // 유료 기능 플래그 (나중에 라이선스 체크로 교체)
        this._premiumFeatures = {
            icons: false,
            templates: false,
            versionControl: false,
            publish: false,
            imageLibrary: false,
        };
    }

    async init() {
        if (this.initialized) {
            console.warn('EditorApp already initialized');
            return;
        }

        try {
            this.initializeModules();
            this.setupEventListeners();
            this.setupPreviewVerticalResize();
            this.setupBeforeUnloadWarning();
            await this.loadInitialData();
            this.initialized = true;
            this.emit('app:ready');
        } catch (error) {
            console.error('Failed to initialize EditorApp:', error);
            this.emit('app:error', error);
            throw error;
        }
    }

    /**
     * Setup beforeunload warning for unsaved changes
     */
    setupBeforeUnloadWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges()) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }

    initializeModules() {
        const previewFrame = document.getElementById('previewFrame');

        // Core UI modules
        this.modules.ui = new UIHelper();
        this.modules.resizer = new Resizer('resizer', '.properties-panel');
        this.modules.tabManager = new TabManager();
        this.modules.preview = new PreviewManager('previewFrame');

        // Zoom and pan (must be before ViewModeManager)
        this.modules.zoom = new ZoomManager('previewFrame');
        this.modules.preview.setZoomManager(this.modules.zoom);

        // View mode manager (needs ZoomManager reference)
        this.modules.viewMode = new ViewModeManager('previewFrame');
        this.modules.viewMode.setZoomManager(this.modules.zoom);
        this.modules.zoom.setViewModeManager(this.modules.viewMode);

        // Project and file management
        this.modules.projectLoader = new ProjectLoader();
        // VS Code Extension: bridge에서 projectId 가져오기 (URL 파라미터 대신)
        const projectId = window.vscBridge?.projectId || this.modules.projectLoader.getProjectIdFromUrl() || 'vscode-project';
        this.modules.fileManager = new FileManager(projectId);

        // Selection and interaction
        this.modules.selection = new SelectionManager();
        this.modules.selection.init(previewFrame);

        this.modules.elementSelector = new ElementSelector(this.modules.preview);
        this.modules.contextMenu = new ContextMenuManager();
        this.modules.contextMenu.init(previewFrame, this.modules.zoom);

        this.modules.textEditing = new TextEditingManager();
        this.modules.textEditing.init(previewFrame);
        this.modules.zoom.setTextEditingManager(this.modules.textEditing);

        // Keyboard shortcuts
        this.modules.keyboard = new KeyboardManager(this);
        this.modules.keyboard.init(previewFrame);

        // Undo/Redo
        this.modules.undoRedo = new UndoRedoManager(previewFrame);
        this.modules.undoRedo.setFileManager(this.modules.fileManager);

        // Clipboard
        this.modules.clipboard = new ClipboardManager(previewFrame);

        // Version control disabled in VS Code (premium feature)
        this.modules.version = null;
        this.modules.autoSave = null;

        // Overlay and handles
        this.modules.overlay = new OverlayManager(previewFrame);

        // Drag and drop
        this.modules.dragDrop = new DragDropManager(previewFrame);

        // Connect ElementSelector to DragDropManager for drag state checking
        this.modules.elementSelector.setDragDropManager(this.modules.dragDrop);

        // Settings
        this.modules.settings = new SettingsManager();
        this.modules.settings.setupUI();

        // Resize/Drag managers (Phase 1)
        this.modules.resizeDrag = new ResizeDragManager();
        this.modules.resizeDrag.init(previewFrame);

        this.modules.spacingDrag = new SpacingDragManager();
        this.modules.spacingDrag.init(previewFrame);

        this.modules.gapOverlay = new GapOverlayManager();
        this.modules.gapOverlay.init(previewFrame);
        this.modules.gapOverlay.setZoomManager(this.modules.zoom);

        // Phase 2: Version Panel disabled in VS Code (premium feature)
        this.modules.versionPanel = null;
        this.modules.publishManager = null;

        // Phase 3: Recovery Modal disabled in VS Code (depends on AutoSave)
        this.modules.recoveryModal = null;

        // Phase 5: Text Selection Toolbar and Responsive Break Manager
        this.modules.textToolbar = new TextSelectionToolbar();
        this.modules.textToolbar.init(previewFrame);

        this.modules.responsiveBreak = new ResponsiveBreakManager();
        this.modules.responsiveBreak.init(previewFrame);

        // Phase 9: DOM Snapshot Manager (AI data-* 속성 추적)
        this.modules.domSnapshot = new DOMSnapshotManager();
        this.modules.domSnapshot.init(previewFrame);

        // Phase 10: Multi Canvas Manager
        this.modules.multiCanvas = new MultiCanvasManager('previewFrame');
        this.modules.multiCanvas.setViewModeManager(this.modules.viewMode);
        this.modules.multiCanvas.setPreviewManager(this.modules.preview);
        this.modules.multiCanvas.setZoomManager(this.modules.zoom);
        this.modules.multiCanvas.init();
        this.modules.multiCanvas.setTextEditingManager(this.modules.textEditing);
        this.modules.zoom.setMultiCanvasManager(this.modules.multiCanvas);
        this.modules.undoRedo.setMultiCanvasManager(this.modules.multiCanvas);

        // DragDropManager에 zoom, multiCanvas 매니저 설정
        this.modules.dragDrop.setZoomManager(this.modules.zoom);
        this.modules.dragDrop.setMultiCanvasManager(this.modules.multiCanvas);

        // Phase 6: AI Chat Manager removed for VS Code Extension
        // AI는 VS Code 내장 AI (Copilot, Claude 등) 사용
        this.modules.aiChat = null;

        // Phase 7: Template Manager disabled in VS Code (premium feature)
        this.modules.templateManager = null;

        // Phase 8: Table Editor
        this.modules.tableEditor = new TableEditor({
            undoRedoManager: this.modules.undoRedo,
            selectionManager: this.modules.selection,
            uiHelper: this.modules.ui
        });
        this.modules.tableEditor.init(previewFrame);
        this.modules.tableEditor.setMultiCanvasManager(this.modules.multiCanvas);

        // Connect ElementSelector to TableEditor for cell selection mode checking
        this.modules.elementSelector.setTableEditor(this.modules.tableEditor);

        // Phase 11: Image Manager
        this.modules.imageManager = new ImageManager({
            projectId,
            previewManager: this.modules.preview,
            undoRedoManager: this.modules.undoRedo,
            uiHelper: this.modules.ui,
            editorApp: this
        });
        this.modules.imageManager.init();

        // Image Editor Modal
        this.modules.imageEditor = new ImageEditorModal({
            projectId,
            undoRedoManager: this.modules.undoRedo,
            uiHelper: this.modules.ui,
            imageManager: this.modules.imageManager
        });
        this.modules.imageEditor.init();

        // Image Toolbar (inline quick transforms)
        this.modules.imageToolbar = new ImageToolbar();
        this.modules.imageToolbar.init(previewFrame);

        // Phase 13: Icon Picker disabled in VS Code (premium feature)
        this.modules.iconPicker = null;

        // Phase 14: Motion Manager (VS Code only)
        this.modules.motionManager = new MotionManager();
        this.modules.motionManager.init();

        // Property panels
        this.modules.propertyPanel = new PropertyPanel(this.modules.elementSelector);
        this.modules.propertyPanel.setPreviewFrame(previewFrame);
        this.modules.stylePanel = new StylePanel(
            this.modules.elementSelector,
            this.modules.preview
        );
        this.modules.stylePanel.setPreviewFrame(previewFrame, this.modules);

        // Toolbar
        this.modules.toolbar = new ToolbarManager(
            this.modules.preview,
            this.modules.fileManager
        );

        // Layer Panel (previewManager 전달로 멀티뷰 지원)
        this.modules.layerPanel = new LayerPanel(null, this.modules.preview);

        // 초기 editor 연결 (preview:loaded 전에도 작동하도록)
        this.modules.layerPanel.editor = {
            previewFrame: previewFrame,
            selectElement: (el) => {
                // elementSelector를 통해 선택 (이벤트 발생)
                this.modules.elementSelector?.selectElement(el);

                // el이 속한 iframe을 찾아서 overlay 업데이트
                const activeIframe = el.ownerDocument?.defaultView?.frameElement || previewFrame;
                if (activeIframe && this.modules.overlay) {
                    this.modules.overlay.setActiveIframe(activeIframe);
                    this.modules.overlay.update(el);
                }
            },
            showToast: (msg) => this.modules.ui?.showSuccess(msg),
            saveHTMLDebounced: () => this.saveHTML()
        };

        // Connect layer panel to preview manager
        this.modules.preview.on('preview:loaded', () => {
            // Create overlays inside iframe
            this.modules.overlay.createOverlays();

            // Initialize drag and drop manager
            this.modules.dragDrop.init();

            // 멀티뷰 자동 활성화 (토글 없이 항상 활성화)
            this.modules.multiCanvas.autoEnable();

            // Create gap overlay inside iframe
            const doc = this.modules.preview.getDocument();
            this.modules.gapOverlay.createGapOverlay(doc);

            // Reattach context menu iframe handlers (메뉴는 메인 document에 생성됨)
            this.modules.contextMenu.reattachIframeHandlers();

            // Re-inject table editor styles
            this.modules.tableEditor.injectResizeStyles();


            this.modules.layerPanel.editor = {
                previewFrame: previewFrame,
                selectElement: (el) => {
                    this.modules.elementSelector.selectElement(el);

                    // el이 속한 iframe을 찾아서 overlay 업데이트
                    const activeIframe = el.ownerDocument?.defaultView?.frameElement || previewFrame;
                    if (activeIframe && this.modules.overlay) {
                        this.modules.overlay.setActiveIframe(activeIframe);
                        this.modules.overlay.update(el);
                    }
                },
                showToast: (msg) => this.modules.ui.showSuccess(msg),
                saveHTMLDebounced: () => this.saveHTML()
            };
            this.modules.layerPanel.refresh();

            // DOM 스냅샷 캡처 (JS 실행 전, data-* 속성 추적용)
            // 약간의 딜레이를 두어 초기 렌더링이 완료된 후 캡처
            setTimeout(() => {
                this.modules.domSnapshot?.captureSnapshot();
            }, 100);

            // iframe 두번 로딩 완료 후 1초 후에 스크롤 트리거 및 높이 재계산
            // (멀티뷰 iframe들이 모두 로드된 후 실행)
            setTimeout(() => {
                this.triggerFullPageScroll();
            }, 1000);

            // 최초 접속 시 스크린샷 캡처 (스크린샷 없으면)
            this.captureScreenshotIfMissing();

            // Motion Manager: iframe 로드 후 @keyframes + observer 재주입
            const previewDoc = this.modules.preview.getDocument();
            if (previewDoc) {
                this.modules.motionManager?.reinjectAssets(previewDoc);
            }

            // VS Code: 멀티캔버스 첫 번째 iframe 로드 후 상대 경로 이미지 → data URL 변환
            // (autoEnable()로 새 iframe 생성 → onload 완료 후 document에 접근 가능)
            if (window.vscBridge) {
                const onMainIframeLoaded = (iframe) => {
                    this.modules.multiCanvas.off('multiview:mainIframeLoaded', onMainIframeLoaded);
                    const iframeDoc = iframe.contentDocument;
                    if (iframeDoc) {
                        this._resolveIframeImages(iframeDoc).catch(err =>
                            console.error('[resolveImages] Error:', err)
                        );
                    }
                };
                this.modules.multiCanvas.on('multiview:mainIframeLoaded', onMainIframeLoaded);
            }
        });

        // Sync element selection between modules
        this.modules.elementSelector.on('element:selected', (element) => {
            // 새 요소 선택 전 텍스트 편집 상태 정리 (다른 요소 선택 시에만)
            const currentEditElement = this.modules.textEditing?._currentEditElement;
            if (this.modules.textEditing?.isCurrentlyEditing() && currentEditElement !== element) {
                this.modules.textEditing.stopEditing();
            }

            if (this.modules.layerPanel) {
                this.modules.layerPanel.onElementSelected(element);
            }
            this.modules.selection.selectElement(element);

            // 활성 iframe과 overlay 동기화 (멀티뷰 지원)
            const activeIframe = this.modules.preview.getActiveIframe?.() ||
                                 document.getElementById('previewFrame');
            if (activeIframe && this.modules.overlay) {
                this.modules.overlay.setActiveIframe(activeIframe);
            }

            // Update overlay position
            this.modules.overlay.update(element);

            // Update drag managers with selection (Phase 1)
            const overlay = this.modules.overlay.getOverlay();
            this.modules.resizeDrag.setSelection(element, overlay);
            this.modules.spacingDrag.setSelection(element);
            this.modules.gapOverlay.setSelection(element);
            // Update gap overlay for the selected element
            this.modules.gapOverlay.updateGapOverlay(this.modules.zoom.getZoomLevel());

            // Phase 8: Show table editor toolbar if table or table child selected
            const table = this.modules.tableEditor.getTableFromElement(element);
            if (table) {
                this.modules.tableEditor.showToolbar(table);
                // If clicked on a cell (TD/TH), enter cell selection mode immediately
                if (element.tagName === 'TD' || element.tagName === 'TH') {
                    this.modules.tableEditor.enterCellSelectionMode(element);
                }
            } else {
                this.modules.tableEditor.hideToolbar();
            }

            // Image toolbar: show for IMG, hide for others
            if (element.tagName === 'IMG') {
                this.modules.imageToolbar.show(element);
            } else {
                this.modules.imageToolbar.hide();
            }

            // Notify AI Chat of selection
            this.modules.aiChat?.emit('element:selected', { element });

            // Icon Picker: update replace target if select-mode is active
            if (this.modules.iconPicker && this._isLucideIcon(element)) {
                this.modules.iconPicker.updateSelectedIcon(this._findLucideSvg(element));
            }

            // Motion Manager: update panel
            this.modules.motionManager?.setSelectedElement(element);
        });

        // When element is deselected (from ElementSelector)
        this.modules.elementSelector.on('element:deselected', () => {
            this.clearSelectionUI();
            this.modules.motionManager?.clearSelection();
            // Notify AI Chat of deselection
            this.modules.aiChat?.emit('element:deselected');
        });

        // When element is deselected (from SelectionManager - for cut, escape, etc.)
        this.modules.selection.on('element:deselected', () => {
            this.clearSelectionUI();
            this.modules.motionManager?.clearSelection();
            // Notify AI Chat of deselection
            this.modules.aiChat?.emit('element:deselected');
        });

        // Double-click for text editing / image selection / icon replacement
        this.modules.preview.on('element:dblclick', (element, clickInfo) => {
            // Image element: open image selector
            if (element.tagName === 'IMG') {
                this.modules.imageManager.openImageSelector(element);
                return;
            }
            // Lucide icon (SVG): open icon selector for replacement (premium feature)
            if (this.modules.iconPicker && this._isLucideIcon(element)) {
                this.modules.iconPicker.openIconSelector(this._findLucideSvg(element));
                return;
            }
            // Skip if this is a table cell and TableEditor is handling it
            if ((element.tagName === 'TD' || element.tagName === 'TH') &&
                this.modules.tableEditor?.cellSelectionMode) {
                return;
            }
            this.startTextEditing(element, clickInfo);
        });

        // Quick text edit mode - single click to edit text elements
        // Only triggers when clicking directly on text content (not padding/margin areas)
        this.modules.preview.on('element:click', (element, clickInfo) => {
            // Ignore clicks during drag operation
            if (this.modules.dragDrop?.isDraggingElement()) return;
            if (!this.modules.settings.get('quickTextEdit')) return;
            if (!clickInfo || !this.modules.textEditing.isTextEditable(element)) return;
            if (!this.isTextContentElement(element)) return;

            // Check if click position is actually over text content
            const doc = this.modules.preview.getDocument();
            if (!doc) return;

            const x = clickInfo.clientX;
            const y = clickInfo.clientY;

            // Get caret position from click coordinates
            let range = null;

            // Try caretRangeFromPoint (Chrome, Safari)
            if (doc.caretRangeFromPoint) {
                range = doc.caretRangeFromPoint(x, y);
            }
            // Try caretPositionFromPoint (Firefox)
            else if (doc.caretPositionFromPoint) {
                const pos = doc.caretPositionFromPoint(x, y);
                if (pos && pos.offsetNode) {
                    range = doc.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.collapse(true);
                }
            }

            // Only proceed if we got a valid text position
            if (!range || !range.startContainer) return;
            if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
            if (!element.contains(range.startContainer)) return;

            // Additional check: verify click is within the text node's bounding box
            // caretRangeFromPoint returns nearest text even if click is in padding/margin
            const textNode = range.startContainer;
            const textRange = doc.createRange();
            textRange.selectNodeContents(textNode);
            const textRects = textRange.getClientRects();

            let isClickOnText = false;
            for (const rect of textRects) {
                // Add small tolerance (2px) for easier clicking
                if (x >= rect.left - 2 && x <= rect.right + 2 &&
                    y >= rect.top - 2 && y <= rect.bottom + 2) {
                    isClickOnText = true;
                    break;
                }
            }

            if (!isClickOnText) return;

            // Start editing and place cursor at click position
            setTimeout(() => {
                this.startTextEditingAtPosition(element, range);
            }, 50);
        });

        // 우클릭 컨텍스트 메뉴
        this.modules.preview.on('element:contextmenu', ({ element, event }) => {
            // 먼저 요소 선택
            this.modules.elementSelector.selectElement(element);
            // 컨텍스트 메뉴 표시 (iframe 이벤트 좌표를 화면 좌표로 변환)
            this.modules.contextMenu.showFromIframeEvent(event, {
                hasClipboard: this.modules.clipboard.hasContent(),
                elementTag: element.tagName,
                element
            });
        });

        // ===== MultiCanvasManager 이벤트 (멀티뷰 편집 지원) =====
        // 멀티뷰 OFF 상태에서도 멀티캔버스 iframe을 계속 사용하므로 isEnabled() 체크 제거
        this.modules.multiCanvas.on('element:click', (element, info) => {
            // 컨텍스트 메뉴 닫기
            this.modules.contextMenu?.hide();

            // 활성 iframe 업데이트
            if (info?.iframe) {
                this._updateActiveIframe(info.iframe);
            }

            // 드래그 중이면 무시
            if (this.modules.dragDrop?.isDraggingElement()) return;

            // 요소 선택
            this.modules.elementSelector.selectElement(element);

            // Quick text edit 처리
            if (this.modules.settings.get('quickTextEdit') && info) {
                this._handleQuickTextEdit(element, info);
            }
        });

        this.modules.multiCanvas.on('element:dblclick', (element, info) => {
            if (info?.iframe) {
                this._updateActiveIframe(info.iframe);
            }

            if (element.tagName === 'IMG') {
                this.modules.imageManager.openImageSelector(element);
                return;
            }

            if (this.modules.iconPicker && this._isLucideIcon(element)) {
                this.modules.iconPicker.openIconSelector(this._findLucideSvg(element));
                return;
            }

            this.startTextEditing(element, info);
        });

        this.modules.multiCanvas.on('element:contextmenu', ({ element, event, iframe }) => {
            if (iframe) {
                this._updateActiveIframe(iframe);
            }

            this.modules.elementSelector.selectElement(element);
            this.modules.contextMenu.showFromIframeEvent(event, {
                hasClipboard: this.modules.clipboard.hasContent(),
                iframe: iframe,
                elementTag: element.tagName,
                element
            });
        });

        // 멀티뷰 비활성화 시 현재 선택된 iframe 유지
        this.modules.multiCanvas.on('multiview:disabled', ({ activeIframe }) => {
            // 현재 보이는 iframe으로 계속 작업 (메인 iframe이 아닐 수 있음)
            if (activeIframe) {
                this.modules.preview.setActiveIframe(activeIframe);
                this.modules.selection.setActiveIframe(activeIframe);
                this.modules.overlay.setActiveIframe(activeIframe);
                this.modules.resizeDrag.setActiveIframe(activeIframe);
                this.modules.spacingDrag.setActiveIframe(activeIframe);
                this.modules.undoRedo?.setActiveIframe(activeIframe);
                this.modules.keyboard?.setActiveIframe(activeIframe);
                this.modules.stylePanel?.setActiveIframe(activeIframe);
            }
        });

        // 멀티뷰 활성화 시 CSS를 모든 캔버스에 동기화 및 기본 iframe 설정
        this.modules.multiCanvas.on('multiview:enabled', () => {
            this.modules.multiCanvas.syncCSSToAllCanvases(true);
        });

        // Connect overlay resize events to ResizeDragManager
        this.modules.overlay.on('resize:start', (data) => {
            this.modules.resizeDrag.startResize(data);
        });

        this.modules.overlay.on('resize:reset', (data) => {
            this.modules.resizeDrag.resetSizeToAuto(data);
        });

        // Connect spacing drag events
        this.modules.overlay.on('spacing:start', (data) => {
            this.modules.spacingDrag.startSpacingDrag(data);
        });

        // Connect rotate events
        this.modules.overlay.on('rotate:start', (e) => {
            this.modules.resizeDrag.startRotate(e);
        });

        // Connect move events
        this.modules.overlay.on('move:start', (e) => {
            this.modules.resizeDrag.startMove(e);
        });

        // Connect drag events from overlay border zones
        this.modules.overlay.on('drag:start', ({ element, event }) => {
            if (element) {
                // overlay는 iframe 내부에 있으므로 event 좌표는 이미 iframe 기준
                this.modules.dragDrop.startDrag(element, event);
                this.modules.overlay.hide();
            }
        });

        // Handle drag move and end in iframe
        this.modules.preview.on('preview:loaded', () => {
            this._attachDragHandlersToIframe(this.modules.preview.previewFrame);
        });


        // Handle drag events from DragDropManager
        this.modules.dragDrop.on('drop', ({ element, target, position, originalParent, originalIndex }) => {
            // Record structure change for undo (move operation)
            const originalParentPath = this.modules.undoRedo.getElementPath(originalParent);

            // Calculate new parent and index based on drop position
            let newParent, newIndex;
            if (position === 'inside' || position === 'moved') {
                // 'moved': DragDropManager에서 target이 이미 finalParent(새 부모)임
                newParent = target;
                newIndex = Array.from(target.children).indexOf(element);
            } else {
                newParent = target.parentNode;
                newIndex = Array.from(newParent.children).indexOf(element);
            }
            const newParentPath = this.modules.undoRedo.getElementPath(newParent);

            // 이동된 요소의 현재 path 저장 (undo 시 요소를 찾기 위해)
            const elementPath = this.modules.undoRedo.getElementPath(element);

            console.log('[EditorApp] DOM 위치 이동 기록:', {
                elementPath,
                originalParentPath,
                originalIndex,
                newParentPath,
                newIndex
            });

            this.modules.undoRedo.recordStructureChange('move', {
                elementPath,
                originalParentPath,
                originalIndex,
                newParentPath,
                newIndex
            });

            // Element was moved, update layer panel
            if (this.modules.layerPanel) {
                this.modules.layerPanel.refresh();
            }
            // saveHTML()은 mouseup 핸들러에서 drag:end 이후에 호출됨
            // 여기서 호출하면 cleanup 전에 동기화되어 드래그 요소가 복제됨
        });

        // 드래그 시작 시 멀티캔버스 동기화 비활성화 (드래그 요소 복제 방지)
        this.modules.dragDrop.on('drag:start', () => {
            this.modules.multiCanvas?.setDragging?.(true);
            this.modules.gapOverlay?.hide();
        });

        // 드래그 종료 시 모든 iframe에서 임시 요소 정리 및 동기화 재활성화
        this.modules.dragDrop.on('drag:end', () => {
            this._cleanupDragElementsInAllIframes();
            this.modules.multiCanvas?.setDragging?.(false);
            // 드래그 중 스킵된 동기화를 수동으로 수행
            this.modules.multiCanvas?.syncBodyToAll?.();
            this.modules.gapOverlay?.show();
        });

        // 드래그 취소 시에도 동기화 재활성화
        this.modules.dragDrop.on('drag:cancel', () => {
            this._cleanupDragElementsInAllIframes();
            this.modules.multiCanvas?.setDragging?.(false);
            this.modules.gapOverlay?.show();
        });

    }

    /**
     * 모든 iframe에서 드래그 관련 임시 요소 제거
     */
    _cleanupDragElementsInAllIframes() {
        const cleanup = (doc) => {
            if (!doc) return;
            // drop indicator 제거 (legacy)
            const indicator = doc.getElementById('editor-drop-indicator');
            if (indicator) indicator.remove();
            // drag ghost 제거
            doc.querySelectorAll('.editor-drag-ghost').forEach(el => el.remove());
            // placeholder 제거
            doc.querySelectorAll('.editor-placeholder').forEach(el => el.remove());
            // drag clone 제거 (legacy)
            doc.querySelectorAll('.editor-drag-clone').forEach(el => el.remove());
            // dragging 클래스 및 스타일 제거
            doc.querySelectorAll('.editor-dragging').forEach(el => {
                el.classList.remove('editor-dragging');
                el.style.opacity = '';
                el.style.outline = '';
                el.style.outlineOffset = '';
                el.style.display = '';
            });
            // transition 스타일 제거
            doc.querySelectorAll('[style*="transition"]').forEach(el => {
                if (!el.id?.startsWith('editor-')) {
                    el.style.transition = '';
                }
            });
        };

        // 메인 iframe
        cleanup(this.modules.preview.getDocument());

        // 멀티캔버스 iframe들
        if (this.modules.multiCanvas?.isEnabled()) {
            const iframes = this.modules.multiCanvas.iframes;
            if (iframes) {
                iframes.forEach(iframe => {
                    try {
                        cleanup(iframe?.contentDocument);
                    } catch (e) {}
                });
            }
        }
    }

    setupEventListeners() {
        this.modules.propertyPanel.on('property:changed', ({ element, property, oldValue, newValue }) => {
            // Record to UndoRedoManager if valid change data provided
            if (element && property && (oldValue !== undefined || newValue !== undefined)) {
                // style.XXX 형태면 inline style 변경으로 기록
                if (property.startsWith('style.')) {
                    this.modules.undoRedo.recordChange({
                        type: 'style',
                        element,
                        property: property.substring(6), // 'style.objectFit' → 'objectFit'
                        oldValue: oldValue ?? null,
                        newValue: newValue ?? null
                    });
                } else {
                    this.modules.undoRedo.recordChange({
                        type: 'attribute',
                        element,
                        property,
                        oldValue: oldValue ?? null,
                        newValue: newValue ?? null
                    });
                }
            }
            this.saveHTML();
            // Update overlay position/size after property change
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        // ImageManager events
        this.modules.imageManager.on('image:replaced', ({ element, oldSrc, newSrc }) => {
            this.saveHTML();
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
            });
            // Refresh PropertyPanel if the replaced element is selected
            if (element === this.modules.selection.getSelectedElement()) {
                this.modules.propertyPanel.updateProperties(element);
            }
        });

        // IconPickerManager events (premium feature - may be null)
        this.modules.iconPicker?.on('icon:inserted', ({ element, iconName }) => {
            this.saveHTML();
            if (this.modules.multiCanvas?._isInitialized) {
                this.modules.multiCanvas.syncBodyToAll();
                this.modules.multiCanvas.iframes?.forEach(iframe => {
                    this.reinitializeIframeLibraries(iframe);
                });
            }
            requestAnimationFrame(() => {
                this.modules.overlay?.updateOverlay();
            });
        });

        this.modules.iconPicker?.on('icon:replaced', ({ element, iconName }) => {
            this.saveHTML();
            if (this.modules.multiCanvas?._isInitialized) {
                this.modules.multiCanvas.syncBodyToAll();
                this.modules.multiCanvas.iframes?.forEach(iframe => {
                    this.reinitializeIframeLibraries(iframe);
                });
            }
            requestAnimationFrame(() => {
                this.modules.overlay?.updateOverlay();
            });
        });

        // PropertyPanel image events
        this.modules.propertyPanel.on('image:openBrowser', ({ element }) => {
            this.modules.imageManager.openImageSelector(element);
        });

        this.modules.propertyPanel.on('image:uploadRequest', ({ element }) => {
            // Set the element for replacement, then trigger file input
            this.modules.imageManager.selectedImageForReplace = element;
            this.modules.imageManager.open();
            // Trigger upload input after panel opens
            setTimeout(() => {
                this.modules.imageManager.uploadInput?.click();
            }, 100);
        });

        this.modules.propertyPanel.on('image:editRequest', ({ element }) => {
            this.modules.imageEditor?.open(element);
        });

        // Background image edit button in style panel
        document.getElementById('bgImageEditBtn')?.addEventListener('click', () => {
            const el = this.modules.selection.getSelectedElement();
            if (!el) return;
            this.modules.imageEditor?.open(el, 'background');
        });

        // ImageEditorModal events
        this.modules.imageEditor.on('editor:opened', () => {
            this.modules.imageToolbar?.hide();
        });
        this.modules.imageEditor.on('image:edited', ({ element, oldSrc, newSrc }) => {
            this.saveHTML();
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
            });
            if (element === this.modules.selection.getSelectedElement()) {
                this.modules.propertyPanel.updateProperties(element);
            }
        });

        this.modules.propertyPanel.on('toast', ({ message, type }) => {
            if (type === 'success') {
                this.modules.ui.showSuccess(message);
            } else if (type === 'error') {
                this.modules.ui.showError(message);
            } else {
                this.modules.ui.showInfo(message);
            }
        });

        this.modules.propertyPanel.on('element:tagChanged', ({ newElement }) => {
            // Reselect the new element after tag change
            this.modules.elementSelector.selectElement(newElement);
            this.modules.overlay.updateOverlay();
        });

        this.modules.stylePanel.on('style:changed', ({ element, property, oldValue, newValue, cssMode }) => {
            // ★ cssMode=true면 BaseStyleSection에서 recordCSSRuleSnapshot으로 이미 기록됨
            // inline 스타일 변경만 recordChange로 기록 (이중 기록 방지)
            if (!cssMode && element && property && (oldValue !== undefined || newValue !== undefined)) {
                this.modules.undoRedo.recordChange({
                    type: 'style',
                    element,
                    property,
                    oldValue: oldValue ?? null,
                    newValue: newValue ?? null
                });
            }
            this.saveHTML();
            // Update overlay position/size after style change
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        // CSS 변경 시 style.css 파일 저장
        this.modules.stylePanel.on('css:changed', () => {
            this.saveCSS();
        });

        this.modules.elementSelector.on('element:duplicated', ({ clone, parent, index }) => {
            // Record for undo - duplicate is like 'add'
            if (parent && clone) {
                this.modules.undoRedo.recordStructureChange('add', {
                    elementPath: this.modules.undoRedo.getElementPath(clone),
                    parentPath: this.modules.undoRedo.getElementPath(parent),
                    index,
                    html: clone.outerHTML
                });
            }
            this.modules.ui.showSuccess('Element duplicated');
            this.saveHTML();
            // Update overlay after duplicate
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        this.modules.elementSelector.on('element:deleted', ({ parent, index, html }) => {
            // Record for undo before any state changes
            if (parent && html !== undefined) {
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                this.modules.undoRedo.recordStructureChange('delete', {
                    parentPath,
                    index,
                    html
                });
            }

            // deselectElement will trigger clearSelectionUI via element:deselected event
            this.modules.selection.deselectElement();
            this.modules.layerPanel?.refresh();
            this.modules.ui.showSuccess('Element deleted');
            this.saveHTML();
        });

        this.modules.fileManager.on('file:saved', ({ filename }) => {
            // Update save status to Saved
            this.modules.ui.setSaved();

            // Capture screenshot when HTML is saved (debounced)
            if (filename === this._fileNames?.html) {
                this.captureScreenshotDebounced();
            }
        });

        this.modules.fileManager.on('files:error', ({ action, error, isProjectNotFound }) => {
            if (isProjectNotFound) {
                this.modules.ui.showError(error.message, 5000);
            } else {
                this.modules.ui.showError(`Error ${action}: ${error.message}`);
            }
        });

        this.modules.toolbar.on('toolbar:loading', ({ message }) => {
            this.modules.ui.showLoading(message);
        });

        this.modules.toolbar.on('toolbar:success', ({ message }) => {
            this.modules.ui.hideLoading();
            this.modules.ui.showSuccess(message);
        });

        this.modules.toolbar.on('toolbar:error', ({ action, error }) => {
            this.modules.ui.hideLoading();
            this.modules.ui.showError(`Error ${action}: ${error.message}`);
        });

        // Layer Panel events
        this.modules.layerPanel.on('element:duplicated', ({ clone, parent, index }) => {
            // Record for undo - duplicate is like 'add'
            this.modules.undoRedo.recordStructureChange('add', {
                elementPath: this.modules.undoRedo.getElementPath(clone),
                parentPath: this.modules.undoRedo.getElementPath(parent),
                index,
                html: clone.outerHTML
            });
            this.modules.ui.showSuccess('Element duplicated');
            this.saveHTML();
            // Update overlay after duplicate
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        this.modules.layerPanel.on('elements:duplicated', (duplicateData) => {
            // Record each duplicate for undo
            duplicateData.forEach(({ clone, parent, index }) => {
                this.modules.undoRedo.recordStructureChange('add', {
                    elementPath: this.modules.undoRedo.getElementPath(clone),
                    parentPath: this.modules.undoRedo.getElementPath(parent),
                    index,
                    html: clone.outerHTML
                });
            });
            this.modules.ui.showSuccess(`${duplicateData.length} elements duplicated`);
            this.saveHTML();
            // Update overlay after duplicates
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        this.modules.layerPanel.on('element:deleted', ({ parent, index, html }) => {
            // Record for undo
            this.modules.undoRedo.recordStructureChange('delete', {
                parentPath: this.modules.undoRedo.getElementPath(parent),
                index,
                html
            });
            this.modules.ui.showSuccess('Element deleted');
            this.saveHTML();
            // Update overlay after delete (may need to hide if deleted element was selected)
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        this.modules.layerPanel.on('elements:deleted', (deleteData) => {
            // Record each delete for undo (in reverse order for proper undo)
            [...deleteData].reverse().forEach(({ parent, index, html }) => {
                this.modules.undoRedo.recordStructureChange('delete', {
                    parentPath: this.modules.undoRedo.getElementPath(parent),
                    index,
                    html
                });
            });
            this.modules.ui.showSuccess(`${deleteData.length} elements deleted`);
            this.saveHTML();
            // Update overlay after deletes
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        this.modules.layerPanel.on('elements:moved', ({ elements, moveData }) => {
            // Record each move for undo
            moveData.forEach((data, i) => {
                const element = elements[i];
                this.modules.undoRedo.recordStructureChange('move', {
                    elementPath: this.modules.undoRedo.getElementPath(element),
                    originalParentPath: this.modules.undoRedo.getElementPath(data.originalParent),
                    originalIndex: data.originalIndex,
                    newParentPath: this.modules.undoRedo.getElementPath(element.parentElement),
                    newIndex: Array.from(element.parentElement.children).indexOf(element)
                });
            });

            // 선택 상자 오버레이 업데이트
            if (elements.length > 0) {
                this.modules.overlay.update(elements[0]);
                this.modules.gapOverlay?.updateGapOverlay();
            }

            this.saveHTML();
        });

        this.modules.layerPanel.on('element:renamed', ({ element, name, oldName }) => {
            // Record attribute change for undo
            // ★ oldName은 LayerPanel에서 DOM 변경 전에 캡처된 값 사용
            this.modules.undoRedo.recordAttributeChange(
                element,
                'data-layer-name',
                oldName,
                name
            );
            this.saveHTML();
        });

        this.modules.layerPanel.on('elements:pasted', ({ elements }) => {
            // Record each paste for undo - paste is like 'add'
            elements.forEach((element) => {
                const parent = element.parentElement;
                if (parent) {
                    const index = Array.from(parent.children).indexOf(element);
                    this.modules.undoRedo.recordStructureChange('add', {
                        elementPath: this.modules.undoRedo.getElementPath(element),
                        parentPath: this.modules.undoRedo.getElementPath(parent),
                        index,
                        html: element.outerHTML
                    });
                }
            });
            this.saveHTML();
        });

        // Table Editor events
        this.modules.tableEditor.on('cellSelectionMode:entered', () => {
            // Hide overlay when entering cell selection mode
            this.modules.overlay.hide();
            this.modules.resizeDrag.setSelection(null, null);
            this.modules.spacingDrag.setSelection(null);
        });

        this.modules.tableEditor.on('cellSelectionMode:exited', () => {
            // Re-show overlay when exiting cell selection mode
            const element = this.modules.selection.getSelectedElement();
            if (element) {
                this.modules.overlay.update(element);
                const overlay = this.modules.overlay.getOverlay();
                this.modules.resizeDrag.setSelection(element, overlay);
                this.modules.spacingDrag.setSelection(element);
            }
        });

        this.modules.tableEditor.on('table:modified', () => {
            this.saveHTML();
        });

        this.modules.tableEditor.on('table:deselected', () => {
            // Re-show overlay when table is deselected
            const element = this.modules.selection.getSelectedElement();
            if (element) {
                this.modules.overlay.update(element);
            }
        });

        // Save status click → save to server
        document.getElementById('saveStatus')?.addEventListener('click', async () => {
            await this.saveCSS();
            await this.saveToServer();
            this.modules.ui.showSuccess('Saved');
        });

        // Keyboard shortcut events
        this.modules.keyboard.on('shortcut:save', async () => {
            // 서버에 저장 (Ctrl+S) - 프로젝트 루트에만 저장
            // 저장된 버전들은 별개이므로 버전 폴더는 건드리지 않음
            await this.saveCSS();
            await this.saveToServer();
        });

        this.modules.keyboard.on('shortcut:undo', async () => {
            await this.modules.undoRedo.undo();
        });

        this.modules.keyboard.on('shortcut:redo', async () => {
            await this.modules.undoRedo.redo();
        });

        // Undo/Redo 버튼 클릭
        document.getElementById('undoBtn')?.addEventListener('click', async () => {
            await this.modules.undoRedo.undo();
        });
        document.getElementById('redoBtn')?.addEventListener('click', async () => {
            await this.modules.undoRedo.redo();
        });

        this.modules.keyboard.on('shortcut:resetZoom', () => {
            this.modules.zoom.resetZoom();
        });

        this.modules.keyboard.on('shortcut:copyElement', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element && this.modules.clipboard.copy(element)) {
                this.modules.ui.showToast('Element copied', 'success');
            }
        });

        this.modules.keyboard.on('shortcut:cutElement', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element) {
                // Record structure change before cut (element will be removed)
                const parent = element.parentNode;
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                const index = Array.from(parent.children).indexOf(element);
                const html = element.outerHTML;

                if (this.modules.clipboard.cut(element)) {
                    // Record delete for undo
                    this.modules.undoRedo.recordStructureChange('delete', {
                        parentPath,
                        index,
                        html
                    });
                    this.modules.ui.showToast('Element cut', 'success');
                    this.modules.selection.deselectElement();
                    this.modules.layerPanel?.refresh();
                    this.saveHTML();
                }
            }
        });

        this.modules.keyboard.on('shortcut:pasteElement', () => {
            const element = this.modules.selection.getSelectedElement();
            // Paste inside the selected element, or body if nothing selected
            const target = element || this.modules.preview.getDocument()?.body;
            if (target) {
                const pasted = this.modules.clipboard.paste(target);
                if (pasted.length > 0) {
                    // Record structure change for undo
                    const parentPath = this.modules.undoRedo.getElementPath(target);
                    for (let i = 0; i < pasted.length; i++) {
                        const pastedEl = pasted[i];
                        const index = Array.from(target.children).indexOf(pastedEl);
                        this.modules.undoRedo.recordStructureChange('add', {
                            parentPath,
                            index,
                            html: pastedEl.outerHTML
                        });
                    }
                    this.modules.ui.showToast('Element pasted', 'success');
                    this.modules.layerPanel?.refresh();
                    this.saveHTML();
                    // Update overlay after paste
                    requestAnimationFrame(() => {
                        this.modules.overlay.updateOverlay();
                        this.modules.gapOverlay?.updateGapOverlay();
                    });
                }
            }
        });

        this.modules.keyboard.on('shortcut:duplicateElement', () => {
            this.modules.elementSelector.duplicateSelected();
        });

        this.modules.keyboard.on('shortcut:deleteElement', () => {
            this.modules.elementSelector.deleteSelected();
        });

        this.modules.keyboard.on('shortcut:escape', () => {
            // If in table cell selection mode, exit to table selection mode
            if (this.modules.tableEditor.cellSelectionMode) {
                this.modules.tableEditor.exitCellSelectionMode();
                // Re-select the table element to show overlay
                const table = this.modules.tableEditor.selectedTable;
                if (table) {
                    this.modules.elementSelector.selectElement(table);
                }
                return;
            }
            this.modules.selection.deselectElement();
        });

        this.modules.keyboard.on('shortcut:selectParent', () => {
            // 테이블 셀 선택 모드에서는 테이블 전체를 선택
            if (this.modules.tableEditor?.cellSelectionMode && this.modules.tableEditor?.selectedTable) {
                const table = this.modules.tableEditor.selectedTable;
                this.modules.tableEditor.exitCellSelectionMode();
                this.modules.elementSelector.selectElement(table);
                return;
            }

            const element = this.modules.selection.getSelectedElement();
            if (element && element.parentElement && element.parentElement.tagName !== 'BODY') {
                this.modules.elementSelector.selectElement(element.parentElement);
            }
        });

        this.modules.keyboard.on('shortcut:moveElementUp', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element && element.previousElementSibling) {
                const parent = element.parentNode;
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                const originalIndex = Array.from(parent.children).indexOf(element);

                element.parentNode.insertBefore(element, element.previousElementSibling);

                const newIndex = Array.from(parent.children).indexOf(element);
                this.modules.undoRedo.recordStructureChange('move', {
                    originalParentPath: parentPath,
                    originalIndex,
                    newParentPath: parentPath,
                    newIndex
                });

                this.modules.overlay.update(element);
                this.modules.layerPanel?.refresh();
                this.saveHTML();
            }
        });

        this.modules.keyboard.on('shortcut:moveElementDown', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element && element.nextElementSibling) {
                const parent = element.parentNode;
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                const originalIndex = Array.from(parent.children).indexOf(element);

                element.parentNode.insertBefore(element.nextElementSibling, element);

                const newIndex = Array.from(parent.children).indexOf(element);
                this.modules.undoRedo.recordStructureChange('move', {
                    originalParentPath: parentPath,
                    originalIndex,
                    newParentPath: parentPath,
                    newIndex
                });

                this.modules.overlay.update(element);
                this.modules.layerPanel?.refresh();
                this.saveHTML();
            }
        });

        this.modules.keyboard.on('shortcut:alignElement', (alignment) => {
            this.alignElement(alignment);
        });

        // Z-index adjustment shortcuts
        this.modules.keyboard.on('shortcut:zIndexUp', () => {
            this.adjustZIndex('up');
        });

        this.modules.keyboard.on('shortcut:zIndexDown', () => {
            this.adjustZIndex('down');
        });

        // Text formatting shortcuts
        this.modules.keyboard.on('shortcut:bold', () => {
            this.applyTextStyle('fontWeight', 'bold', 'normal');
        });

        this.modules.keyboard.on('shortcut:italic', () => {
            this.applyTextStyle('fontStyle', 'italic', 'normal');
        });

        this.modules.keyboard.on('shortcut:underline', () => {
            this.applyTextStyle('textDecoration', 'underline', 'none');
        });

        this.modules.keyboard.on('shortcut:fontSizeUp', () => {
            this.adjustFontSize(2);
        });

        this.modules.keyboard.on('shortcut:fontSizeDown', () => {
            this.adjustFontSize(-2);
        });

        this.modules.keyboard.on('shortcut:textAlignLeft', () => {
            this.applyTextAlign('left');
        });

        this.modules.keyboard.on('shortcut:textAlignCenter', () => {
            this.applyTextAlign('center');
        });

        this.modules.keyboard.on('shortcut:textAlignRight', () => {
            this.applyTextAlign('right');
        });

        this.modules.keyboard.on('shortcut:textAlignJustify', () => {
            this.applyTextAlign('justify');
        });

        this.modules.keyboard.on('shortcut:lineHeightUp', () => {
            this.adjustLineHeight(0.1);
        });

        this.modules.keyboard.on('shortcut:lineHeightDown', () => {
            this.adjustLineHeight(-0.1);
        });

        this.modules.keyboard.on('shortcut:letterSpacingUp', () => {
            this.adjustLetterSpacing(0.5);
        });

        this.modules.keyboard.on('shortcut:letterSpacingDown', () => {
            this.adjustLetterSpacing(-0.5);
        });

        // Panel toggle shortcuts
        this.modules.keyboard.on('shortcut:toggleLayerPanel', () => {
            this.toggleLayerPanel();
        });

        this.modules.keyboard.on('shortcut:togglePropertyPanel', () => {
            this.togglePropertyPanel();
        });

        // View mode shortcuts
        this.modules.keyboard.on('shortcut:viewMode', (index) => {
            this.modules.viewMode.setViewModeByIndex(index);
        });

        // Shortcuts modal shortcut
        this.modules.keyboard.on('shortcut:openShortcuts', () => {
            const shortcutsModal = document.getElementById('shortcutsModal');
            if (shortcutsModal) {
                shortcutsModal.classList.remove('hidden');
            }
        });

        // Publish shortcut (Ctrl+Alt+Shift+S) - disabled in VS Code (premium feature)
        this.modules.keyboard.on('shortcut:publish', async () => {
            this.modules.ui.showInfo('Publish is a premium feature (coming soon)');
        });

        // Alt+V / Enter / ESC (미니 AI 대화창) → AIChatManager._registerGlobalShortcuts()에서 처리

        // Context menu events
        this.modules.contextMenu.on('action:copy', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element && this.modules.clipboard.copy(element)) {
                this.modules.ui.showToast('Element copied', 'success');
            }
        });

        this.modules.contextMenu.on('action:cut', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element) {
                // Record structure change before cut (element will be removed)
                const parent = element.parentNode;
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                const index = Array.from(parent.children).indexOf(element);
                const html = element.outerHTML;

                if (this.modules.clipboard.cut(element)) {
                    // Record delete for undo
                    this.modules.undoRedo.recordStructureChange('delete', {
                        parentPath,
                        index,
                        html
                    });
                    this.modules.ui.showToast('Element cut', 'success');
                    this.modules.selection.deselectElement();
                    this.modules.layerPanel?.refresh();
                    this.saveHTML();
                }
            }
        });

        this.modules.contextMenu.on('action:paste', () => {
            const element = this.modules.selection.getSelectedElement();
            // Paste inside the selected element, or body if nothing selected
            const target = element || this.modules.preview.getDocument()?.body;
            if (target) {
                const pasted = this.modules.clipboard.paste(target);
                if (pasted.length > 0) {
                    // Record structure change for undo
                    const parentPath = this.modules.undoRedo.getElementPath(target);
                    for (let i = 0; i < pasted.length; i++) {
                        const pastedEl = pasted[i];
                        const index = Array.from(target.children).indexOf(pastedEl);
                        this.modules.undoRedo.recordStructureChange('add', {
                            parentPath,
                            index,
                            html: pastedEl.outerHTML
                        });
                    }
                    this.modules.ui.showToast('Element pasted', 'success');
                    this.modules.layerPanel?.refresh();
                    this.saveHTML();
                }
            }
        });

        this.modules.contextMenu.on('action:duplicate', () => {
            this.modules.elementSelector.duplicateSelected();
        });

        this.modules.contextMenu.on('action:delete', () => {
            this.modules.elementSelector.deleteSelected();
        });

        this.modules.contextMenu.on('action:moveUp', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element && element.previousElementSibling) {
                const parent = element.parentNode;
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                const originalIndex = Array.from(parent.children).indexOf(element);

                element.parentNode.insertBefore(element, element.previousElementSibling);

                const newIndex = Array.from(parent.children).indexOf(element);
                this.modules.undoRedo.recordStructureChange('move', {
                    originalParentPath: parentPath,
                    originalIndex,
                    newParentPath: parentPath,
                    newIndex
                });

                this.modules.overlay.update(element);
                this.modules.layerPanel?.refresh();
                this.saveHTML();
            }
        });

        this.modules.contextMenu.on('action:moveDown', () => {
            const element = this.modules.selection.getSelectedElement();
            if (element && element.nextElementSibling) {
                const parent = element.parentNode;
                const parentPath = this.modules.undoRedo.getElementPath(parent);
                const originalIndex = Array.from(parent.children).indexOf(element);

                element.parentNode.insertBefore(element.nextElementSibling, element);

                const newIndex = Array.from(parent.children).indexOf(element);
                this.modules.undoRedo.recordStructureChange('move', {
                    originalParentPath: parentPath,
                    originalIndex,
                    newParentPath: parentPath,
                    newIndex
                });

                this.modules.overlay.update(element);
                this.modules.layerPanel?.refresh();
                this.saveHTML();
            }
        });

        this.modules.contextMenu.on('action:selectParent', () => {
            // 테이블 셀 선택 모드에서는 테이블 전체를 선택
            if (this.modules.tableEditor?.cellSelectionMode && this.modules.tableEditor?.selectedTable) {
                const table = this.modules.tableEditor.selectedTable;
                this.modules.tableEditor.exitCellSelectionMode();
                this.modules.elementSelector.selectElement(table);
                return;
            }

            const element = this.modules.selection.getSelectedElement();
            if (element && element.parentElement && element.parentElement.tagName !== 'BODY') {
                this.modules.elementSelector.selectElement(element.parentElement);
            }
        });

        this.modules.contextMenu.on('action:alignLeft', () => {
            this.alignElement('left');
        });

        this.modules.contextMenu.on('action:alignCenter', () => {
            this.alignElement('center');
        });

        this.modules.contextMenu.on('action:alignRight', () => {
            this.alignElement('right');
        });

        // Image context menu actions
        this.modules.contextMenu.on('action:replaceImage', () => {
            const el = this.modules.selection.getSelectedElement();
            if (el?.tagName === 'IMG') {
                this.modules.imageManager.openImageSelector(el);
            }
        });
        this.modules.contextMenu.on('action:editImage', () => {
            const el = this.modules.selection.getSelectedElement();
            if (el?.tagName === 'IMG') {
                this.modules.imageEditor.open(el);
            }
        });
        this.modules.contextMenu.on('action:copyImageUrl', () => {
            const el = this.modules.selection.getSelectedElement();
            if (el?.tagName === 'IMG' && el.src) {
                navigator.clipboard.writeText(el.src);
                this.modules.ui.showSuccess('Image URL copied');
            }
        });
        this.modules.contextMenu.on('action:editBgImage', () => {
            const el = this.modules.selection.getSelectedElement();
            if (el) {
                this.modules.imageEditor.open(el, 'background');
            }
        });

        // Text editing events
        this.modules.textEditing.on('content:changed', ({ element, oldContent, newContent }) => {
            // Clear 작업 중에는 content 변경 무시 (snapshot으로 처리됨)
            if (this._isClearingInlineTag) {
                return;
            }
            this.modules.undoRedo.recordChange({
                type: 'content',
                element,
                oldValue: oldContent,
                newValue: newContent
            });
            this.saveHTML();
        });

        // Version events (disabled in VS Code - premium feature)

        // AI Chat events removed for VS Code Extension

        // AI Chat/Action events removed for VS Code Extension

        // Auto-save events (disabled in VS Code - manual save only)

        // Resize/Drag manager events (Phase 1)
        this.modules.resizeDrag.on('resize:move', () => {
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            this.modules.imageToolbar?.updatePosition();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        this.modules.resizeDrag.on('resize:complete', async ({ element, changes, message }) => {
            if (changes && changes.length > 0) {
                const section = this._getAnyStyleSection();
                if (section) {
                    await this._applyDragStyleChanges(element, changes, section);
                } else {
                    // Fallback: section 없으면 최소한 inline 제거
                    this._removeInlineStyles(element, changes);
                }
            }

            // Update overlay and style panel after resize
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
            if (message) {
                this.modules.ui.showInfo(message);
            }
        });

        this.modules.resizeDrag.on('rotate:move', () => {
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            this.modules.imageToolbar?.updatePosition();
        });

        this.modules.resizeDrag.on('rotate:complete', async ({ element, changes }) => {
            if (changes && changes.length > 0) {
                const section = this._getAnyStyleSection();
                if (section) {
                    await this._applyDragStyleChanges(element, changes, section);
                } else {
                    this._removeInlineStyles(element, changes);
                }
            }

            // Update overlay and style panel after rotate
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        // ImageToolbar events (quick rotate/flip)
        this.modules.imageToolbar.on('transform:changed', async ({ element, property, oldValue, newValue }) => {
            // inline→CSS 이동 시에도 transition 비활성화 (모션 방지)
            element.style.transition = 'none';
            void element.offsetHeight;

            const changes = [{ property, oldValue, newValue }];
            const section = this._getAnyStyleSection();
            if (section) {
                await this._applyDragStyleChanges(element, changes, section);
            } else {
                this._removeInlineStyles(element, changes);
            }

            // transition 복원 (값은 이미 커밋됨)
            element.style.removeProperty('transition');

            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel?.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        this.modules.imageToolbar.on('toolbar:editFull', () => {
            const el = this.modules.selection.getSelectedElement();
            if (el?.tagName === 'IMG') {
                this.modules.imageEditor?.open(el);
            }
        });

        this.modules.imageToolbar.on('toolbar:overlayUpdate', () => {
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
        });

        this.modules.resizeDrag.on('move:move', () => {
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        this.modules.resizeDrag.on('move:complete', async ({ element, changes }) => {
            // move는 position 관련 속성 (left, top, right, bottom) 사용
            if (changes && changes.length > 0) {
                const section = this._getAnyStyleSection();
                if (section) {
                    await this._applyDragStyleChanges(element, changes, section);
                } else {
                    this._removeInlineStyles(element, changes);
                }
            }

            // Update overlay and style panel after move
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        this.modules.resizeDrag.on('move:error', ({ message }) => {
            this.modules.ui.showError(message);
        });

        // Spacing drag events
        this.modules.spacingDrag.on('spacing:move', () => {
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        this.modules.spacingDrag.on('spacing:complete', async ({ element, changes }) => {
            if (changes && changes.length > 0) {
                const section = this._getAnyStyleSection();
                if (section) {
                    await this._applyDragStyleChanges(element, changes, section);
                } else {
                    this._removeInlineStyles(element, changes);
                }
            }

            // Update overlay and style panel after spacing change
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        // Gap overlay events
        this.modules.gapOverlay.on('gap:move', () => {
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay.updateGapOverlay();
        });

        this.modules.gapOverlay.on('gap:complete', async ({ element, changes }) => {
            if (changes && changes.length > 0) {
                const section = this._getAnyStyleSection();
                if (section) {
                    await this._applyDragStyleChanges(element, changes, section);
                } else {
                    this._removeInlineStyles(element, changes);
                }
            }

            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        });

        // Version Manager events (disabled in VS Code - premium feature)

        // Version Panel, Publish Manager events (disabled in VS Code - premium feature)

        // Recovery Modal events (disabled in VS Code - depends on AutoSave)

        // Text Selection Toolbar events
        this.modules.textToolbar.on('toolbar:save', () => {
            this.saveHTML();
        });

        this.modules.textToolbar.on('style:changed', ({ element, property, oldValue, newValue }) => {
            this.modules.undoRedo.recordChange({
                type: 'style',
                element,
                property,
                oldValue,
                newValue
            });
        });

        this.modules.textToolbar.on('content:changed', ({ element, oldContent, newContent }) => {
            this.modules.undoRedo.recordChange({
                type: 'content',
                element,
                oldValue: oldContent,
                newValue: newContent
            });
        });

        this.modules.textToolbar.on('toolbar:lineBreak', (currentSelection) => {
            this.modules.responsiveBreak.insertResponsiveLineBreak(currentSelection);
        });

        // Clear 전에 before snapshot 저장 + 일반 변경 기록 차단
        this.modules.textToolbar.on('formatting:beforeClear', () => {
            // Clear 작업 중 플래그 설정 (content:changed 무시용)
            this._isClearingInlineTag = true;
            // Clear 작업 중 다른 content 변경이 기록되지 않도록 차단
            this.modules.undoRedo.setSuppressRecording(true);

            const cleanHtml = this._getCleanHTML();
            if (cleanHtml) {
                this._clearBeforeSnapshot = { html: cleanHtml };
            }
        });

        // Clear 후에 after snapshot과 함께 recordSnapshot 호출 + 기록 차단 해제
        this.modules.textToolbar.on('formatting:cleared', () => {
            if (this._clearBeforeSnapshot) {
                const afterHtml = this._getCleanHTML();

                if (afterHtml) {
                    this.modules.undoRedo.recordSnapshot(
                        '인라인 서식 제거',
                        this._clearBeforeSnapshot,
                        { html: afterHtml },
                        { includeCss: false, includeJs: false }
                    );
                }
                this._clearBeforeSnapshot = null;
            }
            this.modules.selection.deselectElement();
            // 모든 작업 완료 후 플래그 해제 (약간 지연)
            setTimeout(() => {
                this._isClearingInlineTag = false;
                this.modules.undoRedo.setSuppressRecording(false);
            }, 50);
        });

        this.modules.textToolbar.on('toolbar:escaped', () => {
            // Re-show overlay for selected element after ESC from text editing
            // (but not for table cells - TableEditor handles those)
            const selected = this.modules.elementSelector.getSelectedElement();
            if (selected) {
                const isTableCell = selected.tagName === 'TD' || selected.tagName === 'TH';
                const inCellMode = this.modules.tableEditor?.cellSelectionMode;
                if (!isTableCell || !inCellMode) {
                    this.modules.overlay.update(selected);
                }
            }
            // Re-attach keyboard handler and focus iframe
            this.modules.keyboard.reattachIframeHandler();
            setTimeout(() => {
                const win = this.modules.preview.getWindow();
                if (win) {
                    win.focus();
                }
            }, 10);
        });

        // Responsive Break Manager events
        this.modules.responsiveBreak.on('break:inserted', () => {
            this.saveHTML();
        });

        this.modules.responsiveBreak.on('break:deleted', () => {
            this.saveHTML();
        });

        this.modules.responsiveBreak.on('css:changed', () => {
            // CSS 변경은 임시 태그에 저장되므로 HTML만 저장 (publish 시에만 병합)
            this.saveHTML();
        });

        this.modules.responsiveBreak.on('toast', ({ message, type }) => {
            if (type === 'success') {
                this.modules.ui.showSuccess(message);
            } else if (type === 'error') {
                this.modules.ui.showError(message);
            } else {
                this.modules.ui.showInfo(message);
            }
        });

        // Multi-select events
        this.modules.selection.on('multiselect:changed', ({ count }) => {
            this.modules.ui.showInfo(`${count} elements selected`);
        });

        // Zoom events - update overlay when zoom changes
        this.modules.zoom.on('zoom:changed', (zoomLevel) => {
            // Update overlay position after zoom
            this.modules.overlay.updateOverlay();
            // Update multi-select overlays
            this.modules.selection.updateMultiSelectOverlays();
            // Update gap overlay if visible
            if (this.modules.gapOverlay) {
                this.modules.gapOverlay.updateGapOverlay();
            }
            // Update text toolbar zoom level
            this.modules.textToolbar?.setZoomLevel(zoomLevel);
            // Update image toolbar zoom level and position
            this.modules.imageToolbar?.setZoomLevel(zoomLevel);
        });

        // Viewport resize events
        this.modules.zoom.on('viewport:resized', ({ width }) => {
            this.modules.viewMode.updateViewportWidth(width);
            // Update overlay position/size after viewport resize
            requestAnimationFrame(() => {
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();
            });
        });

        // Save breakpoint width when resize ends
        this.modules.zoom.on('viewport:resizeEnd', () => {
            this.modules.viewMode.scheduleSaveSettings();
        });

        // 패닝 모드 이벤트 - hover 비활성화
        this.modules.zoom.on('panning:mode-start', () => {
            this.modules.preview.setPanningMode(true);
            this.modules.multiCanvas?.setPanningMode(true);
        });
        this.modules.zoom.on('panning:mode-end', () => {
            this.modules.preview.setPanningMode(false);
            this.modules.multiCanvas?.setPanningMode(false);
        });

        // View mode events
        this.modules.viewMode.on('view:changed', ({ view, width }) => {
            // 멀티뷰가 활성화되어 있으면 활성 iframe 업데이트
            // (UndoRedoManager, StylePanel 등이 올바른 iframe을 참조하도록)
            if (this.modules.multiCanvas?.isEnabled()) {
                const activeIdx = this.modules.multiCanvas.getActiveIndex();
                const activeIframe = this.modules.multiCanvas.iframes?.[activeIdx];
                if (activeIframe) {
                    this._updateActiveIframe(activeIframe);
                }
            }

            // Notify StyleManager of viewport change
            if (this.modules.stylePanel && this.modules.stylePanel.styleManager) {
                const viewport = width === '100%' ? 'pc' : parseInt(width);
                this.modules.stylePanel.styleManager.setCurrentViewport(viewport);
                this.modules.stylePanel.styleManager.setBreakpointFromViewWidth(width);
            }

            // Update overlay position continuously during viewport resize transition
            const updateOverlays = () => {
                const selectedElement = this.modules.selection.getSelectedElement();
                if (selectedElement) {
                    this.modules.overlay.update(selectedElement);
                }
                this.modules.selection.updateMultiSelectOverlays();
                this.modules.gapOverlay?.updateGapOverlay(this.modules.zoom.getZoomLevel());
            };

            // Update immediately and during transition (every 16ms = ~60fps)
            updateOverlays();
            const startTime = Date.now();
            const transitionDuration = 350;
            const animationFrame = () => {
                if (Date.now() - startTime < transitionDuration) {
                    updateOverlays();
                    requestAnimationFrame(animationFrame);
                } else {
                    // Final update after transition completes
                    updateOverlays();
                }
            };
            requestAnimationFrame(animationFrame);
        });

        // Breakpoint target change events (checkbox)
        this.modules.viewMode.on('breakpoint:targetChanged', (data) => {
            if (this.modules.stylePanel && this.modules.stylePanel.styleManager) {
                this.modules.stylePanel.styleManager.onBreakpointTargetChanged(data);
            }
        });

        // Breakpoint width change events (iframe drag resize)
        this.modules.viewMode.on('breakpoint:widthChanged', async ({ oldWidth, newWidth }) => {
            // Change media query breakpoint in CSS
            if (this.modules.stylePanel && this.modules.stylePanel.styleManager) {
                this.modules.stylePanel.styleManager.changeMediaQueryBreakpoint(oldWidth, newWidth);
            }
            // CSS 저장 시 동기화 스킵 (미디어쿼리 구조 변경은 값 동기화 불필요)
            // await 사용하여 saveCSS 완료 후 플래그 리셋 (비동기 타이밍 문제 해결)
            this._skipSyncOnSave = true;
            await this.saveCSS();
            this._skipSyncOnSave = false;
        });

        // Breakpoint removed events
        this.modules.viewMode.on('breakpoint:removed', async ({ width }) => {
            // Remove media query breakpoint from CSS
            if (this.modules.stylePanel && this.modules.stylePanel.styleManager) {
                this.modules.stylePanel.styleManager.removeMediaQueryBreakpoint(width);
            }
            // CSS 저장 시 동기화 스킵 (미디어쿼리 구조 변경은 값 동기화 불필요)
            // await 사용하여 saveCSS 완료 후 플래그 리셋 (비동기 타이밍 문제 해결)
            this._skipSyncOnSave = true;
            await this.saveCSS();
            this._skipSyncOnSave = false;
        });

        // Undo/Redo events - update UI after changes
        this.modules.undoRedo.on('undo', (change) => {
            // ★ 멀티캔버스 동기화를 먼저 수행 (onUndoRedo에서 속성창이 올바른 값을 읽도록)
            // ★ _isInitialized만 체크 (isEnabled/isMultiViewEnabled 체크 금지!)
            if (this.modules.multiCanvas?._isInitialized) {
                // elementSnapshot 타입: 복원된 요소의 스타일을 다른 iframe에 동기화
                if (change.type === 'elementSnapshot' && change._restoredElement) {
                    this._syncElementToOtherIframes(change._restoredElement);
                } else {
                    // Undo 시 oldValue가 적용되므로 oldValue를 newValue로 바꿔서 동기화
                    this.modules.multiCanvas.syncChange(this._swapChangeValues(change));
                }
                // CSS 전체 동기화 (미디어쿼리 포함 모든 뷰에 반영)
                this.modules.multiCanvas.syncCSSToAllCanvases();
            }
            // 동기화 후 UI 업데이트
            this.onUndoRedo(change);
        });

        this.modules.undoRedo.on('redo', (change) => {
            // ★ 멀티캔버스 동기화를 먼저 수행 (onUndoRedo에서 속성창이 올바른 값을 읽도록)
            // ★ _isInitialized만 체크 (isEnabled/isMultiViewEnabled 체크 금지!)
            if (this.modules.multiCanvas?._isInitialized) {
                // elementSnapshot 타입: 복원된 요소의 스타일을 다른 iframe에 동기화
                if (change.type === 'elementSnapshot' && change._restoredElement) {
                    this._syncElementToOtherIframes(change._restoredElement);
                } else {
                    // Redo 시 newValue가 적용되므로 그대로 동기화
                    this.modules.multiCanvas.syncChange(change);
                }
                // CSS 전체 동기화 (미디어쿼리 포함 모든 뷰에 반영)
                this.modules.multiCanvas.syncCSSToAllCanvases();
            }
            // 동기화 후 UI 업데이트
            this.onUndoRedo(change);
        });

        // 변경 기록 시 멀티캔버스 동기화 (리로드 없이 변경 사항만 전달)
        this.modules.undoRedo.on('change:recorded', (change) => {
            // 미디어쿼리 구조 변경 시 동기화 스킵 (breakpoint:widthChanged, breakpoint:removed)
            if (this._skipSyncOnSave) return;
            // ★ _isInitialized만 체크 (isEnabled/isMultiViewEnabled 체크 금지!)
            if (this.modules.multiCanvas?._isInitialized) {
                this.modules.multiCanvas.syncChange(change);
            }
        });

        // CSS 스타일 Undo/Redo는 saveHTML()로 처리됨 (temp tag 유지, style.css 병합은 publish 시점에만)

        // Snapshot restored event (for AI changes, template insertions, etc.)
        this.modules.undoRedo.on('snapshot:restored', ({ change, needsRefresh, cssChanged, tempCSS }) => {

            // HTML/JS가 변경된 경우 iframe 새로고침 필요
            if (needsRefresh) {
                // 새로고침 후 처리할 작업
                const onRefreshComplete = () => {
                    // 비동기 콜백에서 새 변경이 기록되지 않도록 플래그 설정
                    // (이 플래그가 없으면 콜백 내 동작이 redoStack을 초기화할 수 있음)
                    this.modules.undoRedo.isUndoRedoAction = true;

                    try {
                    // tempCSS 재적용 (새로고침으로 사라짐)
                    if (tempCSS) {
                        const doc = this.modules.preview.getDocument();
                        if (doc) {
                            let tempStyleTag = doc.getElementById('zaemit-temp-styles');
                            if (!tempStyleTag) {
                                tempStyleTag = doc.createElement('style');
                                tempStyleTag.id = 'zaemit-temp-styles';
                                (doc.head || doc.documentElement).appendChild(tempStyleTag);
                            }
                            tempStyleTag.textContent = tempCSS;
                        }
                    }
                    // 모듈 초기화
                    this.modules.layerPanel?.refresh();
                    this.modules.selection?.deselectElement();
                    this.modules.overlay?.reinitialize();
                    this.modules.zoom?.reattachIframeHandlers();
                    this.modules.textToolbar?.reattachIframeHandlers?.();
                    this.modules.contextMenu?.reattachIframeHandlers?.();
                    this.modules.dragDrop?.reattachIframeHandlers?.();
                    // 100vh 요소 높이 제한 재적용
                    this.modules.preview?.limitViewportHeightElements?.();

                    // 멀티캔버스 전체 동기화 (새로고침 완료 후)
                    if (this.modules.multiCanvas?.isEnabled()) {
                        this.modules.multiCanvas.syncBodyToAll?.();
                        this.modules.multiCanvas.syncCSSToAllCanvases?.();
                    }
                    } finally {
                        // 비동기 콜백 완료 후 플래그 해제
                        this.modules.undoRedo.isUndoRedoAction = false;
                    }
                };

                // iframe load 이벤트로 새로고침 완료 감지
                const frame = this.modules.preview.getFrame();
                const loadHandler = () => {
                    frame.removeEventListener('load', loadHandler);
                    // DOM이 준비된 후 처리
                    setTimeout(onRefreshComplete, 50);
                };
                frame.addEventListener('load', loadHandler);

                // iframe 새로고침
                this.modules.preview.refresh();
            } else {
                // 새로고침 불필요 - 기존 로직
                this.modules.layerPanel?.refresh();
                this.modules.selection?.deselectElement();
                this.modules.overlay?.reinitialize();
                this.modules.zoom?.reattachIframeHandlers();
                this.modules.textToolbar?.reattachIframeHandlers?.();
                this.modules.contextMenu?.reattachIframeHandlers?.();
                this.modules.dragDrop?.reattachIframeHandlers?.();

                // 멀티캔버스 동기화 (CSS 또는 tempCSS 변경 시)
                if (this.modules.multiCanvas?.isEnabled()) {
                    if (cssChanged) {
                        this.modules.multiCanvas.syncCSSToAllCanvases?.();
                    }
                    // tempCSS도 멀티캔버스에 동기화
                    if (tempCSS !== undefined) {
                        this.modules.multiCanvas.syncTempCSSToAll?.(tempCSS);
                    }
                }
            }
        });

        // Template Manager events (disabled in VS Code - premium feature)

        // Motion Manager events (VS Code only)
        this.modules.motionManager?.on('motion:applied', ({ element, motion, oldMotion }) => {
            this.modules.undoRedo.recordChange({
                type: 'attribute',
                element,
                property: 'data-zaemit-motion',
                oldValue: oldMotion,
                newValue: motion
            });
            this.saveHTML();
        });

        this.modules.motionManager?.on('motion:removed', ({ element, oldMotion }) => {
            this.modules.undoRedo.recordChange({
                type: 'attribute',
                element,
                property: 'data-zaemit-motion',
                oldValue: oldMotion,
                newValue: ''
            });
            this.saveHTML();
        });

        this.modules.motionManager?.on('motion:changed', () => {
            this.saveHTML();
        });

        // Motion 탭 전환 시 현재 선택된 요소의 모션 상태 반영
        this.modules.tabManager.on('tab:change', ({ to }) => {
            if (to === 'motion') {
                const sel = this.modules.selection.getSelectedElement();
                if (sel) {
                    this.modules.motionManager?.setSelectedElement(sel);
                } else {
                    this.modules.motionManager?.clearSelection();
                }
            }
        });

        // Template panel toggle button event
        const templatePanelExpandBtn = document.getElementById('templatePanelExpandBtn');
        if (templatePanelExpandBtn) {
            templatePanelExpandBtn.addEventListener('click', () => {
                this.toggleTemplatePanel();
            });
        }

        // Template panel close button (uses the panel-toggle-btn inside template panel)
        const templatePanelToggleBtn = document.getElementById('templatePanelToggleBtn');
        if (templatePanelToggleBtn) {
            templatePanelToggleBtn.addEventListener('click', () => {
                const templatePanel = document.getElementById('templatePanel');
                templatePanel?.classList.add('hidden');
                templatePanelExpandBtn?.classList.remove('active');
            });
        }

        // Layer panel toggle button event
        const layerPanelExpandBtnEl = document.getElementById('layerPanelExpandBtn');
        if (layerPanelExpandBtnEl) {
            layerPanelExpandBtnEl.addEventListener('click', () => {
                this.toggleLayerPanel();
            });
        }

        // Layer panel close button (uses the panel-toggle-btn inside layer panel)
        const layerPanelToggleBtn = document.getElementById('layerPanelToggleBtn');
        if (layerPanelToggleBtn) {
            layerPanelToggleBtn.addEventListener('click', () => {
                const layerPanel = document.getElementById('layerPanel');
                const layerExpandBtn = document.getElementById('layerPanelExpandBtn');
                const layerResizer = document.getElementById('layerResizer');
                layerPanel?.classList.add('collapsed');
                layerExpandBtn?.classList.remove('active');
                layerResizer?.classList.add('hidden');
            });
        }

        // Keyboard shortcut for template panel (Ctrl+Shift+T)
        this.modules.keyboard.on('shortcut:toggleTemplatePanel', () => {
            this.toggleTemplatePanel();
        });

        // ★ VS Code 전용: 파일에서 이미지 삽입 기능
        if (window.vscBridge) {
            this._setupExternalFileDrop();
            this._injectInsertImageMenuItem();
        }
    }

    /**
     * Handle UI updates after undo/redo
     */
    onUndoRedo(change) {
        // Save the changes
        this.saveHTML();

        // 현재 선택된 요소가 DOM에서 disconnected 되었는지 확인
        const currentSelected = this.modules.selection.getSelectedElement();
        if (currentSelected && !currentSelected.isConnected) {
            // 요소가 DOM에서 분리됨 - 경로를 통해 새 요소 찾기 시도
            let newElement = null;
            if (change.elementPath) {
                newElement = this.modules.undoRedo.findElementByPath(change.elementPath);
            } else if (change.location) {
                // elementSnapshot 타입은 location 사용
                newElement = this.modules.undoRedo.findElementByLocation(
                    change.location,
                    this.modules.preview.getDocument()
                );
            }

            if (newElement && newElement.isConnected) {
                // 새 요소로 재선택
                this.modules.selection.selectElement(newElement);
            } else {
                // 요소를 찾을 수 없으면 선택 해제
                this.modules.selection.deselectElement();
            }
        }

        // Refresh layer panel for structure changes
        if (change.type === 'structure') {
            this.modules.layerPanel.refresh();

            // Clear selection if element was deleted or moved
            // deselectElement will trigger clearSelectionUI via element:deselected event
            if (change.structureType === 'delete' || change.structureType === 'move') {
                this.modules.selection.deselectElement();
            }
        }

        // Update overlay and style panel for style changes (single or multiple)
        if (change.type === 'style' || change.type === 'multiStyle') {
            const element = this.modules.undoRedo.findElementByPath(change.elementPath);
            if (element && element.isConnected) {
                // 요소가 현재 선택된 요소와 같으면 오버레이 업데이트
                const selected = this.modules.selection.getSelectedElement();
                if (selected === element || !selected) {
                    this.modules.overlay.updateOverlay();
                }

                // Update style panel
                if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                    this.modules.stylePanel.updateStyles();
                }
            }
        }

        // Update overlay and style panel for elementSnapshot changes (inline style undo/redo)
        if (change.type === 'elementSnapshot') {
            // ★ 멀티뷰: active iframe에서 요소 찾기 (UI 업데이트를 위해)
            let element = null;
            const activeIframe = this.modules.multiCanvas?.getActiveIframe?.();
            const activeDoc = activeIframe?.contentDocument || this.modules.preview.getDocument();

            // 1. UID로 active iframe에서 찾기
            if (change.uid && activeDoc) {
                element = activeDoc.querySelector(`[data-zaemit-uid="${change.uid}"]`);
            }

            // 2. 못 찾으면 location으로 시도
            if (!element && change.location && activeDoc) {
                element = this.modules.undoRedo.findElementByLocation(change.location, activeDoc);
            }

            // 3. 그래도 못 찾으면 _restoredElement 사용
            if (!element) {
                element = change._restoredElement;
            }

            if (element && element.isConnected) {
                // 요소 재선택하여 오버레이 업데이트
                this.modules.selection.selectElement(element);

                // ★ 새 요소로 직접 오버레이 업데이트 (outerHTML 교체로 currentElement가 disconnected 되므로)
                this.modules.overlay.update(element);
                this.modules.gapOverlay?.updateGapOverlay();

                // Update style panel
                if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                    this.modules.stylePanel.updateStyles();
                }
            }
            // 임시 참조 삭제
            delete change._restoredElement;
        }

        // Update property panel for attribute changes
        if (change.type === 'attribute') {
            const element = this.modules.undoRedo.findElementByPath(change.elementPath);
            if (element) {
                // Refresh layer panel to show updated names/attributes
                this.modules.layerPanel.refresh();

                // Update property panel
                if (this.modules.propertyPanel && this.modules.propertyPanel.updateProperties) {
                    this.modules.propertyPanel.updateProperties();
                }
            }
        }

        // Update for content changes
        if (change.type === 'content') {
            this.modules.layerPanel.refresh();
        }

        // Update overlay and style panel for CSS style changes
        if (change.type === 'cssStyle' || change.type === 'cssStyleMulti') {
            const element = this.modules.undoRedo.findElementByPath(change.elementPath);
            if (element && element.isConnected) {
                // 오버레이 업데이트
                this.modules.overlay.updateOverlay();
                this.modules.gapOverlay?.updateGapOverlay();

                // Update style panel
                if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                    this.modules.stylePanel.updateStyles();
                }
            }
        }

        // ★ Update overlay and style panel for cssRuleSnapshot changes (배경이미지 등 CSS 규칙 복원)
        if (change.type === 'cssRuleSnapshot') {
            // 오버레이 업데이트
            this.modules.overlay.updateOverlay();
            this.modules.gapOverlay?.updateGapOverlay();

            // Update style panel
            if (this.modules.stylePanel && this.modules.stylePanel.updateStyles) {
                this.modules.stylePanel.updateStyles();
            }
        }

        // Update for snapshot changes (AI, template, etc.)
        if (change.type === 'snapshot') {
            // 레이어 패널 갱신
            this.modules.layerPanel.refresh();
            // 선택 해제 (DOM이 변경되어 기존 참조가 무효화됨)
            this.modules.selection.deselectElement();
            // iframe 핸들러 재연결
            this.modules.zoom?.reattachIframeHandlers();
            this.modules.textToolbar?.reattachIframeHandlers?.();
            this.modules.contextMenu?.reattachIframeHandlers?.();
            this.modules.dragDrop?.reattachIframeHandlers?.();
        }

        // snapshot 타입의 limitViewportHeightElements()는
        // snapshot:restored 핸들러의 onRefreshComplete에서 처리됨 (중복 호출 방지)

        // ★ 모든 undo/redo 후 선택된 요소가 있으면 overlay 업데이트 (위치/크기 변경 반영)
        const selected = this.modules.selection.getSelectedElement();
        if (selected && selected.isConnected) {
            this.modules.overlay.update(selected);
            this.modules.gapOverlay?.updateGapOverlay();
        }
    }

    /**
     * StyleManager의 아무 section이나 가져오기 (fallback용)
     * 모든 section은 BaseStyleSection을 상속하므로 공통 메소드 사용 가능
     * @returns {BaseStyleSection|null}
     */
    _getAnyStyleSection() {
        const sections = this.modules.stylePanel?.styleManager?.sections;
        if (!sections) return null;
        return sections.size || sections.layout || sections.border
            || sections.typography || sections.background || sections.effects
            || Object.values(sections)[0] || null;
    }

    /**
     * StyleSection 없이 inline style만 제거하고 CSS에 적용 (fallback)
     * @param {HTMLElement} element - 대상 요소
     * @param {Array} changes - [{ property, oldValue, newValue }] 배열
     */
    _removeInlineStyles(element, changes) {
        if (!element || !changes) return;

        const mainIframe = this.modules.multiCanvas?.mainIframe || this.modules.preview?.previewFrame;
        const mainDoc = mainIframe?.contentDocument;

        // mainElement 찾기
        let mainElement = element;
        if (mainDoc && element.ownerDocument !== mainDoc) {
            const path = this.modules.multiCanvas?._getElementPath(element);
            if (path) {
                mainElement = this.modules.multiCanvas._findElementByPath(path, mainDoc) || element;
            }
        }

        // camelCase → kebab-case 변환
        const toKebabCase = (str) => {
            if (str === 'cssFloat') return 'float';
            const kebab = str.replace(/([A-Z])/g, '-$1').toLowerCase();
            // vendor prefix: webkitTextFillColor → -webkit-text-fill-color
            if (kebab.startsWith('webkit-')) return '-' + kebab;
            if (kebab.startsWith('moz-')) return '-' + kebab;
            if (kebab.startsWith('ms-')) return '-' + kebab;
            return kebab;
        };

        // CSS에 적용할 selector 찾기
        let selector = null;
        if (mainElement.id) {
            selector = '#' + mainElement.id;
        } else {
            const nonEditorClasses = Array.from(mainElement.classList).filter(cls =>
                !cls.startsWith('zaemit-') &&
                !cls.startsWith('quick-text-edit') &&
                !cls.startsWith('editor-') &&
                !cls.startsWith('selected-') &&
                !cls.startsWith('table-cell-')
            );
            if (nonEditorClasses.length > 0) {
                selector = '.' + nonEditorClasses[0];
            }
        }

        // selector가 없으면 고유 클래스 생성
        if (!selector) {
            const tagName = mainElement.tagName.toLowerCase();
            const randomPart = Math.random().toString(36).substring(2, 8);
            const generatedClass = `${tagName}-${randomPart}`;
            mainElement.classList.add(generatedClass);
            selector = '.' + generatedClass;
            this.saveHTML();
        }

        // CSS 규칙 찾기/생성
        const cssName = this._fileNames?.css || 'style.css';
        const styleSheet = mainDoc?.querySelector(`link[href*="${cssName}"]`)?.sheet
            || mainDoc?.querySelector('style#zaemit-temp-styles')?.sheet;

        if (styleSheet) {
            // 기존 규칙 찾기
            let rule = null;
            try {
                for (const r of styleSheet.cssRules) {
                    if (r.selectorText === selector) {
                        rule = r;
                        break;
                    }
                }
            } catch (e) { /* CORS */ }

            // 규칙이 없으면 생성
            if (!rule) {
                try {
                    const index = styleSheet.insertRule(`${selector} {}`, styleSheet.cssRules.length);
                    rule = styleSheet.cssRules[index];
                } catch (e) {
                    console.warn('Failed to create CSS rule:', e);
                }
            }

            // CSS에 값 적용 및 inline 제거
            for (const change of changes) {
                const kebabProp = toKebabCase(change.property);

                // CSS에 적용
                if (rule && change.newValue) {
                    rule.style.setProperty(kebabProp, change.newValue);
                }

                // inline 제거
                element.style.removeProperty(kebabProp);
                if (mainElement !== element) {
                    mainElement.style.removeProperty(kebabProp);
                }
            }

            // CSS 저장
            this.saveCSS();
        } else {
            // stylesheet 없으면 최소한 inline만 제거
            for (const change of changes) {
                const kebabProp = toKebabCase(change.property);
                element.style.removeProperty(kebabProp);
                if (mainElement !== element) {
                    mainElement.style.removeProperty(kebabProp);
                }
            }
        }

        this.saveHTML();
    }

    /**
     * 드래그로 스타일 변경 시 공통 처리 (cascade prevention 포함)
     * spacing, gap, resize, rotate, move 등 모든 드래그 핸들러에서 사용
     * @param {HTMLElement} element - 변경된 요소 (활성 iframe의 요소)
     * @param {Array} changes - [{ property, oldValue, newValue }] 배열
     * @param {BaseStyleSection} styleSection - 사용할 스타일 섹션 (size 또는 layout)
     */
    async _applyDragStyleChanges(element, changes, styleSection) {
        if (!changes || changes.length === 0 || !styleSection) return;

        const isPCMode = this.modules.viewMode?.isPCMode?.() ?? true;
        const currentViewWidth = this.modules.viewMode?.getCurrentWidth?.() || '100%';

        // ★ mainIframe 요소 찾기 (싱글뷰/멀티뷰 공통)
        const mainIframe = this.modules.multiCanvas?.mainIframe || this.modules.preview?.previewFrame;
        const mainDoc = mainIframe?.contentDocument;
        let mainElement = element;

        if (mainDoc && element.ownerDocument !== mainDoc) {
            const path = this.modules.multiCanvas?._getElementPath(element);
            if (path) {
                mainElement = this.modules.multiCanvas._findElementByPath(path, mainDoc) || element;
            }
        }

        if (!mainElement) return;

        // editor facade 임시 설정
        const originalFacadeElement = this.modules.stylePanel?._editorFacade?.selectedElement;
        if (this.modules.stylePanel?._editorFacade) {
            this.modules.stylePanel._editorFacade.selectedElement = mainElement;
        }

        // ★ selector 확보 — 고유 셀렉터 우선 탐색 (공유 셀렉터 수정 방지)
        let selector = styleSection.getOrCreateUniqueSelector();
        if (!selector) {
            // fallback: getOrCreateUniqueSelector가 null (selectedElement 없음 등)
            const generatedClass = styleSection.generateUniqueClass();
            mainElement.classList.add(generatedClass);
            selector = '.' + generatedClass;
        }
        this.saveHTML();

        // ★ 멀티캔버스 초기화 여부 (_isInitialized만 체크, isMultiViewEnabled 체크 금지!)
        const isMultiCanvasInitialized = this.modules.multiCanvas?._isInitialized ?? false;

        // ★ breakpoints 업데이트 및 가져오기
        this.modules.stylePanel?.styleManager?.updateAvailableBreakpoints?.();
        const allBreakpoints = this.modules.stylePanel?.styleManager?.getAllBreakpoints?.() || [];

        // ★★★ oldRules 수집 및 실제 적용 중인 규칙 찾기 (Undo용 - 모든 CSS 변경 전에 수집해야 함!)
        const oldRulesMap = {};
        const existingRuleInfoMap = {};  // 각 property별 실제 적용 중인 규칙 정보
        for (const change of changes) {
            // 실제 적용 중인 CSS 규칙 찾기 (가장 높은 specificity)
            const existingRuleInfo = styleSection.getCSSRuleInfo(change.property);
            existingRuleInfoMap[change.property] = existingRuleInfo;

            // Undo용 oldRules 수집 — 고유 셀렉터만 사용 (공유 셀렉터면 기본 selector 사용)
            const isUnique = existingRuleInfo ? styleSection.isSelectorUnique(existingRuleInfo.selector, mainDoc) : false;
            const targetSelector = (isUnique && existingRuleInfo?.selector) ? existingRuleInfo.selector : selector;
            oldRulesMap[change.property] = this.modules.undoRedo?.collectAllRulesForSelector?.(targetSelector, change.property, mainDoc) || { pc: change.oldValue || '' };
        }

        // ★★★ CSS 규칙 생성 (fallback용)
        const baseRule = styleSection.findOrCreateRule(selector);

        // ★★★ 활성화된 뷰포트 정보
        const selectedBreakpoints = this.modules.stylePanel?.styleManager?.selectedBreakpoints || ['pc'];
        const isAllViewsEnabled = selectedBreakpoints.length >= allBreakpoints.length + 1;
        const isPCActive = selectedBreakpoints.includes('pc');

        // ★★★ CSS 규칙에 값 먼저 설정 (인라인 제거 전에!)
        // 활성화된(체크된) 모든 뷰포트에 적용
        for (const change of changes) {
            const kebabProp = styleSection.toKebabCase(change.property);

            // 1. PC가 활성화되어 있으면 CSS 규칙에 적용
            if (isPCActive) {
                // ★ 실제 적용 중인 높은 specificity 규칙 사용 (있으면)
                const existingRuleInfo = existingRuleInfoMap[change.property];
                if (existingRuleInfo && existingRuleInfo.rule) {
                    // ★ 셀렉터 고유성 검증 — 공유 셀렉터면 기존 규칙 수정하지 않음
                    const isUnique = styleSection.isSelectorUnique(existingRuleInfo.selector, mainDoc);
                    // ★ zaemit-temp-styles에 있는 규칙만 직접 수정 (다른 시트의 CSSOM 변경은 saveCSS에 반영 안 됨)
                    const isInTempStyles = existingRuleInfo.sheet?.ownerNode?.id === 'zaemit-temp-styles';

                    if (isUnique && isInTempStyles) {
                        // ★ gap shorthand → longhand 분리
                        this._splitGapShorthand(existingRuleInfo.rule, kebabProp);
                        // 고유 셀렉터 in temp-styles → 기존 규칙 직접 수정
                        existingRuleInfo.rule.style.setProperty(kebabProp, change.newValue);
                        styleSection.removePropertyFromOtherRules(
                            existingRuleInfo.selector,
                            change.property,
                            existingRuleInfo.rule
                        );
                    } else if (isUnique && !isInTempStyles) {
                        // 고유 셀렉터 but 다른 시트 → temp-styles에 같은 셀렉터로 규칙 생성
                        const tempRule = styleSection.findOrCreateRule(existingRuleInfo.selector);
                        if (tempRule) {
                            this._splitGapShorthand(tempRule, kebabProp);
                            tempRule.style.setProperty(kebabProp, change.newValue);
                        }
                    } else {
                        // 공유 셀렉터 → 고유 셀렉터(selector)의 베이스 규칙에 값 설정
                        if (baseRule) {
                            this._splitGapShorthand(baseRule, kebabProp);
                            baseRule.style.setProperty(kebabProp, change.newValue);
                        }
                    }
                } else if (baseRule) {
                    // 기존 규칙 없으면 베이스 규칙에 적용
                    this._splitGapShorthand(baseRule, kebabProp);
                    baseRule.style.setProperty(kebabProp, change.newValue);
                }
            }

            // 2. 활성화된 각 미디어쿼리 브레이크포인트에 적용
            for (const bp of allBreakpoints) {
                if (selectedBreakpoints.includes(bp)) {
                    // ★ 미디어쿼리 규칙에서도 gap shorthand 분리
                    const mediaRule = styleSection.findOrCreateRuleInMediaQuery(selector, bp);
                    if (mediaRule) {
                        this._splitGapShorthand(mediaRule, kebabProp);
                    }
                    // 활성화된 브레이크포인트 → newValue 적용
                    await styleSection.addCSSRuleInMediaQueryNoSave(change.property, change.newValue, bp);
                }
            }
        }

        // ★★★ 비활성화된 뷰포트에는 oldValue 보존 (cascade prevention)
        if (!isAllViewsEnabled) {
            for (const change of changes) {
                if (!change.oldValue) continue;
                const kebabProp = styleSection.toKebabCase(change.property);

                // PC가 비활성화되어 있으면 베이스 규칙에 oldValue 보존
                if (!isPCActive && baseRule && !baseRule.style.getPropertyValue(kebabProp)) {
                    // ★ gap longhand 설정 시 기존 gap shorthand가 있으면 스킵
                    if ((kebabProp === 'column-gap' || kebabProp === 'row-gap') && baseRule.style.getPropertyValue('gap')) {
                        // gap shorthand가 이미 값을 커버하므로 longhand 추가 불필요
                    } else {
                        baseRule.style.setProperty(kebabProp, change.oldValue);
                    }
                }

                // 비활성화된 브레이크포인트에 oldValue 보존
                for (const bp of allBreakpoints) {
                    if (!selectedBreakpoints.includes(bp)) {
                        const mediaRule = styleSection.findOrCreateRuleInMediaQuery(selector, bp);
                        if (mediaRule && !mediaRule.style.getPropertyValue(kebabProp)) {
                            // ★ gap longhand 설정 시 기존 gap shorthand가 있으면 스킵
                            if ((kebabProp === 'column-gap' || kebabProp === 'row-gap') && mediaRule.style.getPropertyValue('gap')) {
                                // gap shorthand가 이미 값을 커버
                            } else {
                                mediaRule.style.setProperty(kebabProp, change.oldValue);
                            }
                        }
                    }
                }
            }
        }

        // ★★★ CSS 동기화를 먼저! (다른 iframe들에 CSS 규칙 전파)
        // 인라인 스타일 제거 전에 동기화해야 튀는 현상 방지
        if (isMultiCanvasInitialized) {
            this.modules.multiCanvas.syncCSSToAllCanvases();
        }

        // ★★★ 이제 인라인 스타일 제거 (CSS 규칙이 모든 iframe에 동기화되어 있으므로 안전)
        for (const change of changes) {
            const kebabProp = styleSection.toKebabCase(change.property);
            element.style.removeProperty(kebabProp);
            if (mainElement !== element) {
                mainElement.style.removeProperty(kebabProp);
            }
        }

        // ★★★ 멀티뷰: 모든 iframe에서 충돌하는 스타일 제거
        if (isMultiCanvasInitialized) {
            const iframes = this.modules.multiCanvas?.iframes || [];
            const path = this.modules.multiCanvas?._getElementPath(mainElement);
            const properties = changes.map(c => c.property);

            for (const iframe of iframes) {
                if (iframe === mainIframe) continue;
                const iframeDoc = iframe?.contentDocument;
                if (!iframeDoc) continue;
                const iframeElement = path ? this.modules.multiCanvas._findElementByPath(path, iframeDoc) : null;
                if (!iframeElement) continue;

                for (const property of properties) {
                    styleSection.clearConflictingStyles(iframeElement, property, null, iframeDoc, selector);
                }
            }
        }

        // ★★★ Undo 기록 (recordCSSRuleSnapshot 사용)
        for (const change of changes) {
            const oldRules = oldRulesMap[change.property];
            // ★ 고유 셀렉터(selector)로 통일 — 공유 규칙은 수정하지 않으므로
            const existingRuleInfo = existingRuleInfoMap[change.property];
            const isUnique = existingRuleInfo ? styleSection.isSelectorUnique(existingRuleInfo.selector, mainDoc) : false;
            const targetSelector = (isUnique && existingRuleInfo?.selector) ? existingRuleInfo.selector : selector;
            const newRules = this.modules.undoRedo?.collectAllRulesForSelector?.(targetSelector, change.property, mainDoc) || {};
            this.modules.undoRedo?.recordCSSRuleSnapshot?.(mainElement, targetSelector, change.property, oldRules, newRules);
        }

        // 원래 선택된 요소 복원
        if (this.modules.stylePanel?._editorFacade) {
            this.modules.stylePanel._editorFacade.selectedElement = originalFacadeElement;
        }

        // CSS 저장
        this._skipSyncOnSave = true;
        await this.saveCSS();
        this._skipSyncOnSave = false;

        // ★ 멀티뷰 동기화 (_isInitialized만 체크, isMultiViewEnabled 체크 금지!)
        if (this.modules.multiCanvas?._isInitialized) {
            this.modules.multiCanvas.syncCSSToAllCanvases();
        }
        this.saveHTML();
    }

    /**
     * Split gap shorthand into column-gap/row-gap longhands when setting a longhand.
     * Prevents the shorthand from overriding the newly set longhand value.
     * @param {CSSStyleRule} rule - CSS rule to check
     * @param {string} kebabProp - The longhand property being set (column-gap or row-gap)
     */
    _splitGapShorthand(rule, kebabProp) {
        if (!rule || (kebabProp !== 'column-gap' && kebabProp !== 'row-gap')) return;
        const gapValue = rule.style.getPropertyValue('gap');
        if (!gapValue) return;

        // Parse gap shorthand: "20px" or "10px 20px" (row-gap column-gap)
        const parts = gapValue.trim().split(/\s+/);
        const rowGapVal = parts[0];
        const colGapVal = parts.length > 1 ? parts[1] : parts[0];

        // Remove shorthand, set longhands (the caller will override one of them)
        rule.style.removeProperty('gap');
        if (!rule.style.getPropertyValue('row-gap')) {
            rule.style.setProperty('row-gap', rowGapVal);
        }
        if (!rule.style.getPropertyValue('column-gap')) {
            rule.style.setProperty('column-gap', colGapVal);
        }
    }

    /**
     * Save CSS file (merges temp styles into style.css)
     * 원본 파일 내용을 유지하면서 임시 스타일만 병합
     */
    async saveCSS() {
        try {
            // 멀티뷰 모드일 때: 활성 iframe의 CSS를 메인 iframe으로 먼저 동기화
            // (syncCSSRuleToAllCanvases는 기본 규칙만 동기화하므로 미디어쿼리가 누락될 수 있음)
            // _skipSyncOnSave 플래그가 true면 동기화 스킵 (미디어쿼리 너비 변경 시)
            if (this.modules.multiCanvas?.isEnabled() && !this._skipSyncOnSave) {
                this._syncActiveToMainCSS();
            }

            // 항상 메인(PC) iframe의 CSS를 저장
            const doc = this.modules.preview.getMainDocument();

            // 원본 CSS 파일 내용 가져오기 (CSSOM이 아닌 파일 직접)
            const cssFileName = this._fileNames?.css || 'style.css';
            let cssContent = this.modules.fileManager.getFileContent(cssFileName) || '';

            // 에디터 내부 선택자 목록 (저장에서 제외)
            const editorSelectors = [
                '.editor-highlight',
                '.editor-hover',
                '.editor-multi-select',
                '.zaemit-',
                '.quick-text-edit',
                '[data-zaemit-'
            ];

            // Merge temp styles from zaemit-temp-styles tag (Property panel changes)
            const tempStyleTag = doc.getElementById('zaemit-temp-styles');
            if (tempStyleTag && tempStyleTag.sheet && tempStyleTag.sheet.cssRules.length > 0) {
                for (const rule of tempStyleTag.sheet.cssRules) {
                    const selectorText = rule.selectorText || '';
                    const isEditorRule = editorSelectors.some(sel =>
                        selectorText.includes(sel)
                    );
                    // 빈 규칙(속성 없음) 스킵
                    if (!isEditorRule && rule.cssText && rule.style?.length > 0) {
                        // ★ VS Code: CSSOM의 blob/data URL을 원래 상대 경로로 복원
                        let cleanCssText = rule.cssText;
                        if (window.vscBridge) {
                            cleanCssText = this._restoreImageUrlsInCssText(cleanCssText, selectorText, doc);
                        }
                        // 새 규칙을 기존 CSS에 병합
                        cssContent = this.mergeCSSRule(cssContent, selectorText, cleanCssText);
                    }
                }
                // 임시 태그는 유지 (새로고침 시 자동 제거됨)
            }

            // ★ 추적된 CSS 속성 제거 반영 (applyStyleChange에서 속성 제거 시 추적됨)
            if (this._cssPropertyRemovals?.length > 0) {
                for (const removal of this._cssPropertyRemovals) {
                    cssContent = this._removeCSSPropertyFromText(cssContent, removal.selector, removal.property);
                }
                this._cssPropertyRemovals = [];
            }

            // 빈 규칙 제거 (예: .foo {\n  ;\n} 또는 .foo { } 또는 .foo {\n})
            cssContent = cssContent.replace(/[^{}]+\{\s*;?\s*\}/g, '');

            // 빈 줄 정리
            cssContent = cssContent.replace(/\n{3,}/g, '\n\n').trim();

            if (cssContent) {
                await this.modules.fileManager.saveFile(cssFileName, cssContent);
            }

            // 멀티캔버스 CSS 동기화
            // _skipSyncOnSave 플래그가 true면 동기화 스킵 (미디어쿼리 너비 변경 시)
            if (this.modules.multiCanvas?.isEnabled() && !this._skipSyncOnSave) {
                this.modules.multiCanvas.syncCSSToAllCanvases();
            }
        } catch (err) {
            console.error('Error saving CSS:', err);
        }
    }

    /**
     * VS Code: CSSOM 규칙 텍스트의 blob/data URL을 원래 상대 경로로 복원
     * saveCSS 병합 시 사용 (CSSOM에는 data URL이 들어가 있지만 파일에는 상대 경로 저장)
     * @param {string} cssText - CSS rule text (e.g., ".foo { background-image: url('data:...'); }")
     * @param {string} selector - CSS selector
     * @param {Document} doc - iframe document
     * @returns {string} - 복원된 CSS text
     */
    _restoreImageUrlsInCssText(cssText, selector, doc) {
        if (!cssText.includes('url(')) return cssText;
        // blob: 또는 data:image URL이 없으면 변환 불필요
        if (!cssText.includes('blob:') && !cssText.includes('data:image')) return cssText;

        // ★ 1단계: _imageUrlMap에서 data/blob URL → 상대 경로 매핑으로 복원 (가장 신뢰)
        const blobDataUrlRegex = /url\(['"]?(blob:[^'")\s]+|data:image\/[^'")\s]+)['"]?\)/gi;
        let mapRestored = false;
        cssText = cssText.replace(blobDataUrlRegex, (match, rawUrl) => {
            const saveUrl = this._imageUrlMap.get(rawUrl);
            if (saveUrl) {
                mapRestored = true;
                return `url("${saveUrl}")`;
            }
            return match; // 매핑 없으면 원본 유지
        });

        // 모든 blob/data URL이 복원되었으면 완료
        if (!cssText.includes('blob:') && !cssText.includes('data:image')) return cssText;

        // ★ 2단계: selector로 DOM 요소를 찾아 data-zaemit-save-url 가져오기
        try {
            const el = doc.querySelector(selector);
            const saveUrl = el?.getAttribute('data-zaemit-save-url');
            if (saveUrl) {
                cssText = cssText.replace(
                    /url\(['"]?(?:blob:[^'")\s]+|data:image\/[^'")\s]+)['"]?\)/gi,
                    `url("${saveUrl}")`
                );
                return cssText;
            }
        } catch (e) {
            // 잘못된 selector 무시
        }

        // ★ 3단계: CSS 원본 파일에서 원래 URL 찾기
        const originalCss = this.modules.fileManager.getFileContent(this._fileNames?.css || 'style.css') || '';
        const originalUrl = this._findOriginalUrlInCss(originalCss, selector);
        if (originalUrl) {
            cssText = cssText.replace(
                /url\(['"]?(?:blob:[^'")\s]+|data:image\/[^'")\s]+)['"]?\)/gi,
                `url("${originalUrl}")`
            );
            return cssText;
        }

        // ★ 4단계: 복원 불가 → blob/data URL 포함 속성만 제거 (파일 오염 방지)
        // 단, 경고 로그 출력
        console.warn('[saveCSS] URL 복원 실패 - background-image 제거:', selector);
        cssText = cssText.replace(
            /\s*background(?:-image)?:\s*url\(['"]?(?:blob:[^'")\s]+|data:image\/[^'")\s]+)['"]?\)\s*;?/gi,
            ''
        );
        return cssText;
    }

    /**
     * CSS 원본 텍스트에서 특정 selector의 background-image url 추출
     */
    _findOriginalUrlInCss(cssText, selector) {
        if (!cssText || !selector) return null;
        // selector를 regex 이스케이프
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // selector { ... background-image: url("..."); ... } 매칭
        const ruleRegex = new RegExp(escaped + '\\s*\\{([^}]+)\\}', 'i');
        const ruleMatch = cssText.match(ruleRegex);
        if (!ruleMatch) return null;
        const ruleBody = ruleMatch[1];
        // background-image: url("path") 추출
        const urlMatch = ruleBody.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
        if (!urlMatch) return null;
        const url = urlMatch[1];
        // blob/data URL이 아닌 경우만 반환
        if (url.startsWith('blob:') || url.startsWith('data:')) return null;
        return url;
    }

    /**
     * CSS 속성 제거를 추적 (saveCSS에서 파일 텍스트에 반영)
     * @param {string} selector - CSS selector
     * @param {string} property - CSS property (kebab-case)
     */
    _trackCSSPropertyRemoval(selector, property) {
        if (!this._cssPropertyRemovals) {
            this._cssPropertyRemovals = [];
        }
        const exists = this._cssPropertyRemovals.some(
            r => r.selector === selector && r.property === property
        );
        if (!exists) {
            this._cssPropertyRemovals.push({ selector, property });
        }
    }

    /**
     * CSS 텍스트에서 특정 selector의 특정 property 제거
     * @param {string} css - CSS text content
     * @param {string} selector - CSS selector
     * @param {string} property - CSS property (kebab-case)
     * @returns {string} Modified CSS text
     */
    _removeCSSPropertyFromText(css, selector, property) {
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedSelector})\\s*\\{([^}]*)\\}`, 'g');
        return css.replace(regex, (match, sel, props) => {
            const lines = props.split(';')
                .map(l => l.trim())
                .filter(l => {
                    if (!l) return false;
                    const colonIdx = l.indexOf(':');
                    if (colonIdx < 0) return false;
                    return l.substring(0, colonIdx).trim() !== property;
                });
            if (lines.length === 0) return ''; // 빈 규칙 제거
            return `${sel} {\n  ${lines.join(';\n  ')};\n}`;
        });
    }

    /**
     * 활성 iframe의 CSS를 메인 iframe으로 동기화
     * (저장 전에 호출하여 미디어쿼리 등 모든 CSS가 메인에 반영되도록 함)
     */
    _syncActiveToMainCSS() {
        const activeDoc = this.modules.preview.getDocument();
        const mainDoc = this.modules.preview.getMainDocument();

        if (!activeDoc || !mainDoc || activeDoc === mainDoc) return;

        const activeTempStyle = activeDoc.getElementById('zaemit-temp-styles');
        if (!activeTempStyle?.sheet?.cssRules) return;

        // 활성 iframe의 CSS를 추출
        let cssContent = '';
        for (const rule of activeTempStyle.sheet.cssRules) {
            cssContent += rule.cssText + '\n';
        }

        // 메인 iframe의 zaemit-temp-styles에 복사
        let mainTempStyle = mainDoc.getElementById('zaemit-temp-styles');
        if (mainTempStyle) {
            mainTempStyle.remove();
        }
        mainTempStyle = mainDoc.createElement('style');
        mainTempStyle.id = 'zaemit-temp-styles';
        mainTempStyle.textContent = cssContent;
        mainDoc.head.appendChild(mainTempStyle);
    }

    /**
     * Merge a single CSS rule into existing CSS content
     * 같은 선택자가 있으면 속성을 병합, 없으면 추가
     */
    mergeCSSRule(existingCSS, selector, ruleText) {
        if (!selector || !ruleText) return existingCSS;

        // ruleText에서 속성 부분만 추출 (selector { properties })
        const propsMatch = ruleText.match(/\{([^}]*)\}/);
        if (!propsMatch) return existingCSS;
        const newProps = propsMatch[1].trim();

        // 기존 CSS에서 같은 선택자 찾기
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const selectorRegex = new RegExp(
            `(${escapedSelector})\\s*\\{([^}]*)\\}`,
            'g'
        );

        let found = false;
        const mergedCSS = existingCSS.replace(selectorRegex, (match, sel, existingProps) => {
            found = true;
            // 기존 속성과 새 속성 병합
            const mergedProps = this.mergeCSSProperties(existingProps, newProps);
            return `${sel} {\n  ${mergedProps}\n}`;
        });

        if (found) {
            return mergedCSS;
        } else {
            // 새 규칙 추가
            return existingCSS.trim() + '\n\n' + ruleText;
        }
    }

    /**
     * Merge CSS properties, new values override existing
     */
    mergeCSSProperties(existingProps, newProps) {
        const props = {};

        // 기존 속성 파싱
        existingProps.split(';').forEach(decl => {
            const colonIdx = decl.indexOf(':');
            if (colonIdx > 0) {
                const prop = decl.substring(0, colonIdx).trim();
                const val = decl.substring(colonIdx + 1).trim();
                if (prop && val) props[prop] = val;
            }
        });

        // 새 속성으로 덮어쓰기
        newProps.split(';').forEach(decl => {
            const colonIdx = decl.indexOf(':');
            if (colonIdx > 0) {
                const prop = decl.substring(0, colonIdx).trim();
                const val = decl.substring(colonIdx + 1).trim();
                if (prop && val) props[prop] = val;
            }
        });

        // 속성 문자열로 변환
        return Object.entries(props)
            .map(([prop, val]) => `${prop}: ${val}`)
            .join(';\n  ') + ';';
    }

    /**
     * Merge AI-generated CSS into existing CSS content
     * Avoids duplicates by replacing existing rules with same selector
     */
    mergeAICSS(existingCSS, aiCSS, editorSelectors) {
        // Simple approach: parse AI CSS and merge/append rules
        // This uses a basic regex-based parser for CSS rules

        const ruleRegex = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
        let match;
        let mergedCSS = existingCSS;

        while ((match = ruleRegex.exec(aiCSS)) !== null) {
            const selector = match[1].trim();
            const properties = match[2].trim();

            // Skip editor-internal selectors
            const isEditorRule = editorSelectors.some(sel => selector.includes(sel));
            if (isEditorRule) continue;

            // Check if this selector already exists in merged CSS
            const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existingRuleRegex = new RegExp(
                `${escapedSelector}\\s*\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}`,
                'g'
            );

            if (existingRuleRegex.test(mergedCSS)) {
                // Replace existing rule
                mergedCSS = mergedCSS.replace(existingRuleRegex, `${selector} {\n  ${properties}\n}`);
            } else {
                // Append new rule
                mergedCSS = mergedCSS.trim() + `\n\n${selector} {\n  ${properties}\n}`;
            }
        }

        // Clean up multiple blank lines
        mergedCSS = mergedCSS.replace(/\n{3,}/g, '\n\n').trim();

        return mergedCSS;
    }

    async loadInitialData() {
        try {
            const bridge = window.vscBridge;
            const projectId = bridge?.projectId || 'vscode-project';

            // ★ 파일명 매핑 캐싱 (실제 HTML/CSS/JS 파일명)
            this._fileNames = {
                html: bridge?.getFileName?.('html') || 'index.html',
                css: bridge?.getFileName?.('css') || 'style.css',
                js: bridge?.getFileName?.('js') || 'script.js'
            };

            // VS Code Extension: projectLoader를 통해 서버 대신 bridge에서 데이터 로드
            // ProjectLoader.getProjectIdFromUrl() → bridge에서 직접 가져옴
            this.modules.projectLoader._projectId = projectId;

            // Update UI with project name
            const projectNameEl = document.getElementById('projectName');
            if (projectNameEl) {
                projectNameEl.textContent = bridge?.projectName || 'VS Code Project';
            }

            // Set project ID for toolbar
            this.modules.toolbar.setProjectId(projectId);

            // 프리뷰 전 저장 콜백 + 미저장 상태 체커 설정
            this.modules.toolbar.setSaveBeforePreview(
                async () => {
                    await this.saveCSS();
                    await this.saveToServer();
                },
                () => this.hasUnsavedChanges()
            );

            // Set project ID for view mode manager
            this.modules.viewMode.setProjectId(projectId);

            // VS Code Extension: srcdoc 방식으로 프리뷰 로드
            const previewFrame = document.getElementById('previewFrame');
            if (previewFrame && bridge) {
                const htmlContent = bridge.getHtmlFile();
                let cssContent = bridge.getCssFile();
                const jsContent = bridge.getJsFile();

                let fullHtml = htmlContent;

                // ★ 이전 세션에서 정리 안 된 인제션 태그 먼저 제거
                // (regex 버그 등으로 HTML 파일에 잔류할 수 있음)
                fullHtml = fullHtml.replace(/<style\s+id=["']zaemit-injected-css["'][^>]*>[\s\S]*?<\/style>/gi, '');
                fullHtml = fullHtml.replace(/<style\s+id=["']zaemit-temp-styles["'][^>]*>[\s\S]*?<\/style>/gi, '');
                fullHtml = fullHtml.replace(/<script\s+id=["']zaemit-injected-js["'][^>]*>[\s\S]*?<\/script>/gi, '');
                fullHtml = fullHtml.replace(/<script\s+id=["']zaemit-link-interceptor["'][^>]*>[\s\S]*?<\/script>/gi, '');

                // ★ bare 링크 인터셉터 제거 (ID 없이 저장된 이전 버그 잔재)
                fullHtml = fullHtml.replace(/<script>\s*document\.addEventListener\("click",function\(e\)\{var a=e\.target\.closest\("a"\);if\(a&&a\.href\)\{e\.preventDefault\(\);\}\}\);\s*<\/script>/gi, '');

                // ★ bare script.js 중복 제거 (ID 없이 저장된 이전 버그 잔재)
                // 속성 없는 <script>...</script> 중 내용이 script.js와 동일하면 제거
                if (jsContent) {
                    const trimmedJs = jsContent.trim();
                    fullHtml = fullHtml.replace(/<script>([\s\S]*?)<\/script>/gi, (match, content) => {
                        return content.trim() === trimmedJs ? '' : match;
                    });
                }

                // ★ stale blob URL 정리 (이전 세션에서 누출된 blob URL은 무효)
                // 인라인 스타일의 blob URL → none 으로 교체
                fullHtml = fullHtml.replace(/url\(&quot;blob:[^&]*&quot;\)/gi, 'none');
                fullHtml = fullHtml.replace(/url\(['"]?blob:[^'")\s]+['"]?\)/gi, 'none');
                // img src 등의 blob URL 제거
                fullHtml = fullHtml.replace(/(src\s*=\s*["'])blob:[^"']+(['"])/gi, '$1$2');

                // ★ CSS 파일의 stale blob URL 정리 (이전 세션에서 누출된 blob URL은 무효)
                if (cssContent) {
                    cssContent = cssContent.replace(/url\(['"]?blob:[^'")\s]+['"]?\)/gi, 'url("none")');
                }

                // CSS 인라인 주입
                if (cssContent) {
                    const styleTag = '<style id="zaemit-injected-css">' + cssContent + '</style>';
                    if (fullHtml.includes('</head>')) {
                        fullHtml = fullHtml.replace('</head>', styleTag + '</head>');
                    } else {
                        fullHtml = styleTag + fullHtml;
                    }
                }

                // 외부 CSS 링크 제거 (이미 인라인 주입)
                if (this._fileNames.css) {
                    const escapedCss = this._fileNames.css.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    fullHtml = fullHtml.replace(new RegExp(`<link[^>]*href=["'][^"']*${escapedCss}["'][^>]*>`, 'gi'), '');
                }

                // JS 인라인 주입 (ID로 식별 가능하게)
                if (jsContent) {
                    const scriptTag = '<script id="zaemit-injected-js">' + jsContent + '<\/script>';
                    if (fullHtml.includes('</body>')) {
                        fullHtml = fullHtml.replace('</body>', scriptTag + '</body>');
                    } else {
                        fullHtml += scriptTag;
                    }
                }

                // 외부 JS 스크립트 링크 제거
                if (this._fileNames.js) {
                    const escapedJs = this._fileNames.js.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    fullHtml = fullHtml.replace(new RegExp(`<script[^>]*src=["'][^"']*${escapedJs}["'][^>]*><\\/script>`, 'gi'), '');
                }

                // 링크 클릭 차단 스크립트 주입 (ID로 식별 가능하게)
                const interceptScript = '<script id="zaemit-link-interceptor">document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}});<\/script>';
                if (fullHtml.includes('</body>')) {
                    fullHtml = fullHtml.replace('</body>', interceptScript + '</body>');
                }

                // ★ 프로젝트 폴더 base URI 주입 (상대 경로 이미지/리소스 해결)
                // 주의: webview.asWebviewUri()가 URL-인코딩된 문자열 반환
                //   (예: file%2B.vscode-resource → file+.vscode-resource)
                //   <base> 태그의 href는 디코딩된 URL이어야 브라우저가 호스트명을 해석함
                const projectBaseUri = window.vscBridge?.projectBaseUri;
                if (projectBaseUri) {
                    const decodedBaseUri = decodeURIComponent(projectBaseUri);
                    const baseTag = `<base id="zaemit-editor-base" href="${decodedBaseUri}/">`;
                    if (fullHtml.includes('<head>')) {
                        fullHtml = fullHtml.replace('<head>', `<head>\n${baseTag}`);
                    } else {
                        fullHtml = `<head>${baseTag}</head>\n` + fullHtml;
                    }
                }

                // srcdoc 방식으로 로드
                // 이미지 등 상대 경로 리소스는 _resolveIframeImages()에서
                // 부모 webview fetch → iframe blob URL로 변환하여 해결
                previewFrame.srcdoc = fullHtml;
            }

            // Load files for code editor
            await this.modules.fileManager.loadFiles();

            // Version loading disabled in VS Code (premium feature)
        } catch (error) {
            console.error('Failed to load initial data:', error);
            throw error;
        }
    }

    /**
     * Check if element is primarily a text content element
     * (has only text children and is a typical text container)
     */
    isTextContentElement(element) {
        if (!element) return false;

        // Check tag name for typical text elements
        const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'LABEL', 'LI', 'TD', 'TH', 'BUTTON', 'STRONG', 'EM', 'B', 'I', 'U'];
        if (!textTags.includes(element.tagName)) return false;

        // Check if element contains mostly text (not complex nested elements)
        const childNodes = element.childNodes;
        let textLength = 0;
        let hasBlockElements = false;

        for (const node of childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                textLength += node.textContent.trim().length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Allow inline elements like span, a, strong, em
                const inlineTags = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'BR'];
                if (!inlineTags.includes(node.tagName)) {
                    hasBlockElements = true;
                }
            }
        }

        // Element should have text and no block elements
        return textLength > 0 && !hasBlockElements;
    }

    /**
     * Start text editing on an element (triggered by double-click)
     * @param {Element} element
     * @param {Object} clickInfo - { clientX, clientY } click position
     */
    startTextEditing(element, clickInfo) {
        if (!element) return;

        // Check if element is text-editable
        if (!this.modules.textEditing.isTextEditable(element)) {
            return;
        }

        // Enable editing without selecting all text
        const editSession = this.modules.textEditing.enableEditing(element, { selectAll: false });
        if (!editSession) return;

        // Place cursor at click position
        if (clickInfo?.clientX !== undefined && clickInfo?.clientY !== undefined) {
            const doc = this.modules.preview.getDocument();
            const win = this.modules.preview.getWindow();
            if (doc && win) {
                let range = null;
                const x = clickInfo.clientX;
                const y = clickInfo.clientY;

                // Try caretRangeFromPoint (Chrome, Safari)
                if (doc.caretRangeFromPoint) {
                    range = doc.caretRangeFromPoint(x, y);
                }
                // Try caretPositionFromPoint (Firefox)
                else if (doc.caretPositionFromPoint) {
                    const pos = doc.caretPositionFromPoint(x, y);
                    if (pos && pos.offsetNode) {
                        range = doc.createRange();
                        range.setStart(pos.offsetNode, pos.offset);
                        range.collapse(true);
                    }
                }

                // Set cursor at click position
                if (range && element.contains(range.startContainer)) {
                    const sel = win.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }

        // Keep overlay visible during text editing (don't hide it)
        // The element is still selected, just in text editing mode

        // Track if editing has ended to prevent double cleanup
        let editingEnded = false;

        // Variables to hold event handlers for cleanup
        let onKeydown = null;
        let iframeKeydown = null;
        const iframeDoc = this.modules.preview.getDocument();

        // Setup blur handler to end editing
        const endEditing = (focusIframe = false) => {
            if (editingEnded) return;
            editingEnded = true;

            element.removeEventListener('blur', onBlur);
            element.removeEventListener('keydown', onKeydown, true);
            if (iframeDoc && iframeKeydown) {
                iframeDoc.removeEventListener('keydown', iframeKeydown, true);
            }
            editSession.cleanup();
            this.saveHTML();

            // Re-show overlay (but not for table cells - TableEditor handles those)
            const selected = this.modules.elementSelector.getSelectedElement();
            if (selected) {
                // Don't show overlay on table cells when in cell selection mode
                const isTableCell = selected.tagName === 'TD' || selected.tagName === 'TH';
                const inCellMode = this.modules.tableEditor?.cellSelectionMode;
                if (!isTableCell || !inCellMode) {
                    this.modules.overlay.update(selected);
                }
            }

            // Focus iframe document to enable keyboard shortcuts
            if (focusIframe) {
                // Re-attach keyboard handler first
                this.modules.keyboard.reattachIframeHandler();
                // Then focus iframe
                setTimeout(() => {
                    const win = this.modules.preview.getWindow();
                    if (win) {
                        win.focus();
                    }
                }, 10);
            }
        };

        const onBlur = (e) => {
            // Delay to allow clicking on formatting toolbar
            setTimeout(() => {
                if (editingEnded) return;
                if (!element.contains(document.activeElement) &&
                    !element.contains(this.modules.preview.getDocument()?.activeElement)) {
                    endEditing(false);
                }
            }, 100);
        };

        element.addEventListener('blur', onBlur);

        // Also handle Enter key to insert line break and Escape to exit
        onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                endEditing(true);
            }
        };
        // Use capture phase to ensure we get the event first
        element.addEventListener('keydown', onKeydown, true);

        // Also listen on iframe document in case element doesn't receive the event
        iframeKeydown = (e) => {
            if (e.key === 'Escape' && !editingEnded) {
                e.preventDefault();
                e.stopPropagation();
                endEditing(true);
            }
        };
        if (iframeDoc) {
            iframeDoc.addEventListener('keydown', iframeKeydown, true);
        }
    }

    /**
     * Start text editing at a specific position (for quick text edit on single click)
     * Places cursor at the click position instead of selecting all text
     * @param {HTMLElement} element - Element to edit
     * @param {Range} range - Range indicating where to place the cursor
     */
    startTextEditingAtPosition(element, range) {
        if (!element) return;

        // Check if element is text-editable
        if (!this.modules.textEditing.isTextEditable(element)) {
            return;
        }

        // Enable editing and get cleanup function
        const editSession = this.modules.textEditing.enableEditing(element, { selectAll: false });
        if (!editSession) return;

        // Keep overlay visible during quick text edit (don't hide it)
        // The element is still selected, just in text editing mode

        // Place cursor at the specified position
        const doc = this.modules.preview.getDocument();
        const win = this.modules.preview.getWindow();
        if (doc && win && range) {
            try {
                const selection = win.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (err) {
                // If setting position fails, just focus the element
                element.focus();
            }
        }

        // Track if editing has ended to prevent double cleanup
        let editingEnded = false;

        // Setup blur handler to end editing
        const endEditing = (focusIframe = false) => {
            if (editingEnded) return;
            editingEnded = true;

            element.removeEventListener('blur', onBlur);
            element.removeEventListener('keydown', onKeydown);
            editSession.cleanup();
            this.saveHTML();

            // Re-show overlay (but not for table cells - TableEditor handles those)
            const selected = this.modules.elementSelector.getSelectedElement();
            if (selected) {
                // Don't show overlay on table cells when in cell selection mode
                const isTableCell = selected.tagName === 'TD' || selected.tagName === 'TH';
                const inCellMode = this.modules.tableEditor?.cellSelectionMode;
                if (!isTableCell || !inCellMode) {
                    this.modules.overlay.update(selected);
                }
            }

            // Focus iframe document to enable keyboard shortcuts
            if (focusIframe) {
                // Re-attach keyboard handler first
                this.modules.keyboard.reattachIframeHandler();
                // Then focus iframe
                setTimeout(() => {
                    const win = this.modules.preview.getWindow();
                    if (win) {
                        win.focus();
                    }
                }, 10);
            }
        };

        const onBlur = (e) => {
            // Delay to allow clicking on formatting toolbar
            setTimeout(() => {
                if (editingEnded) return;
                if (!element.contains(document.activeElement) &&
                    !element.contains(this.modules.preview.getDocument()?.activeElement)) {
                    endEditing(false);
                }
            }, 100);
        };

        element.addEventListener('blur', onBlur);

        // Also handle Escape to exit
        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                endEditing(true);
            }
        };
        // Use capture phase to ensure we get the event first
        element.addEventListener('keydown', onKeydown, true);

        // Also listen on iframe document in case element doesn't receive the event
        const iframeDoc = this.modules.preview.getDocument();
        const iframeKeydown = (e) => {
            if (e.key === 'Escape' && !editingEnded) {
                e.preventDefault();
                e.stopPropagation();
                iframeDoc.removeEventListener('keydown', iframeKeydown, true);
                endEditing(true);
            }
        };
        if (iframeDoc) {
            iframeDoc.addEventListener('keydown', iframeKeydown, true);
        }
    }

    /**
     * Clear all selection-related UI (overlay, handles, etc.)
     * Called when element is deselected from any source
     */
    clearSelectionUI() {
        this.modules.overlay.hide();
        this.modules.resizeDrag.setSelection(null, null);
        this.modules.spacingDrag.setSelection(null);
        this.modules.gapOverlay.setSelection(null);
        this.modules.gapOverlay.hide();
        this.modules.tableEditor.hideToolbar();
        this.modules.imageToolbar?.hide();
    }

    /**
     * Align element horizontally using margin auto (no float)
     * CSS 룰로 적용 (인라인 스타일 아님)
     * @param {'left'|'center'|'right'} alignment
     */
    async alignElement(alignment) {
        const element = this.modules.selection.getSelectedElement();
        if (!element) return;

        const sizeSection = this.modules.stylePanel?.styleManager?.sections?.size;
        const layoutSection = this.modules.stylePanel?.styleManager?.sections?.layout;
        if (!sizeSection) return;

        // Check if element needs to be block-level for margin auto to work
        const computed = this.modules.preview.getWindow().getComputedStyle(element);
        const isInline = computed.display === 'inline' || computed.display === 'inline-block';

        // 인라인 요소는 block으로 변경 (margin auto가 작동하도록)
        const changes = [];
        if (isInline && (alignment === 'center' || alignment === 'right')) {
            changes.push({
                property: 'display',
                oldValue: computed.display,
                newValue: 'block'
            });
        }

        // margin 값 결정
        let marginLeft, marginRight;
        switch (alignment) {
            case 'left':
                marginLeft = '0';
                marginRight = 'auto';
                break;
            case 'center':
                marginLeft = 'auto';
                marginRight = 'auto';
                break;
            case 'right':
                marginLeft = 'auto';
                marginRight = '0';
                break;
        }

        changes.push({
            property: 'marginLeft',
            oldValue: computed.marginLeft,
            newValue: marginLeft
        });
        changes.push({
            property: 'marginRight',
            oldValue: computed.marginRight,
            newValue: marginRight
        });

        // display 변경은 layoutSection, margin 변경은 sizeSection 사용
        const displayChanges = changes.filter(c => c.property === 'display');
        const marginChanges = changes.filter(c => c.property !== 'display');

        if (displayChanges.length > 0 && layoutSection) {
            await this._applyDragStyleChanges(element, displayChanges, layoutSection);
        }
        if (marginChanges.length > 0) {
            await this._applyDragStyleChanges(element, marginChanges, sizeSection);
        }

        this.modules.overlay.update(element);
        this.modules.stylePanel?.updateStyles?.();
    }

    /**
     * Adjust z-index relative to siblings
     * @param {'up'|'down'} direction
     */
    adjustZIndex(direction) {
        const element = this.modules.selection.getSelectedElement();
        if (!element || !element.parentElement) return;

        const doc = this.modules.preview.getDocument();
        const win = this.modules.preview.getWindow();
        if (!win) return;

        const parent = element.parentElement;
        const siblings = Array.from(parent.children).filter(el => el !== element);

        // Get current z-index
        const computed = win.getComputedStyle(element);
        let currentZ = parseInt(computed.zIndex) || 0;
        if (computed.zIndex === 'auto') currentZ = 0;

        // Get sibling z-indexes
        const siblingZIndexes = siblings.map(sib => {
            const sibComputed = win.getComputedStyle(sib);
            const z = parseInt(sibComputed.zIndex);
            return isNaN(z) ? 0 : z;
        });

        // Include current element's z-index for comparison
        const allZIndexes = [...siblingZIndexes, currentZ].sort((a, b) => a - b);
        const minZ = Math.min(...allZIndexes, 0);
        const maxZ = Math.max(...allZIndexes, 0);

        const oldValue = element.style.zIndex;
        let newZ;

        if (direction === 'up') {
            // Find next higher z-index or increment by 1
            const higherZIndexes = siblingZIndexes.filter(z => z > currentZ).sort((a, b) => a - b);
            if (higherZIndexes.length > 0) {
                newZ = higherZIndexes[0] + 1; // Go above the next higher sibling
            } else {
                newZ = maxZ + 1; // Go to max + 1
            }
        } else {
            // Find next lower z-index or decrement by 1
            const lowerZIndexes = siblingZIndexes.filter(z => z < currentZ).sort((a, b) => b - a);
            if (lowerZIndexes.length > 0) {
                newZ = lowerZIndexes[0] - 1; // Go below the next lower sibling
            } else {
                newZ = minZ - 1; // Go to min - 1
            }
        }

        element.style.zIndex = newZ.toString();

        // Record for undo
        this.modules.undoRedo.recordChange({
            type: 'style',
            element,
            property: 'zIndex',
            oldValue: oldValue || '',
            newValue: element.style.zIndex
        });

        this.modules.stylePanel?.updateStyles?.();
        this.saveHTML();
        this.modules.ui.showToast(`z-index: ${newZ}`, 'info');
    }

    /**
     * Apply text style toggle (for bold, italic, underline)
     * @param {string} property - CSS property
     * @param {string} onValue - Value when enabled
     * @param {string} offValue - Value when disabled
     */
    applyTextStyle(property, onValue, offValue) {
        const element = this.modules.selection.getSelectedElement();
        if (!element) return;

        const win = this.modules.preview.getWindow();
        if (!win) return;

        const computed = win.getComputedStyle(element);
        const currentValue = computed[property];

        // Toggle: if current matches onValue, set to offValue, otherwise set to onValue
        const isOn = currentValue === onValue ||
                     (property === 'fontWeight' && (currentValue === 'bold' || parseInt(currentValue) >= 700)) ||
                     (property === 'textDecoration' && currentValue.includes('underline'));

        const oldValue = element.style[property];
        const newValue = isOn ? offValue : onValue;
        element.style[property] = newValue;

        // Record for undo
        this.modules.undoRedo.recordChange({
            type: 'style',
            element,
            property,
            oldValue: oldValue || '',
            newValue: element.style[property]
        });

        this.modules.overlay.update(element);
        this.modules.stylePanel?.updateStyles?.();
        this.saveHTML();
    }

    /**
     * Adjust font size
     * @param {number} delta - Amount to change (positive or negative)
     */
    adjustFontSize(delta) {
        const element = this.modules.selection.getSelectedElement();
        if (!element) return;

        const win = this.modules.preview.getWindow();
        if (!win) return;

        const computed = win.getComputedStyle(element);
        const currentSize = parseFloat(computed.fontSize) || 16;
        const newSize = Math.max(8, Math.min(200, currentSize + delta));

        const oldValue = element.style.fontSize;
        element.style.fontSize = newSize + 'px';

        // Record for undo
        this.modules.undoRedo.recordChange({
            type: 'style',
            element,
            property: 'fontSize',
            oldValue: oldValue || '',
            newValue: element.style.fontSize
        });

        this.modules.overlay.update(element);
        this.modules.stylePanel?.updateStyles?.();
        this.saveHTML();
        this.modules.ui.showToast(`Font size: ${newSize}px`, 'info');
    }

    /**
     * Apply text alignment
     * @param {'left'|'center'|'right'|'justify'} align
     */
    applyTextAlign(align) {
        const element = this.modules.selection.getSelectedElement();
        if (!element) return;

        const oldValue = element.style.textAlign;
        element.style.textAlign = align;

        // Record for undo
        this.modules.undoRedo.recordChange({
            type: 'style',
            element,
            property: 'textAlign',
            oldValue: oldValue || '',
            newValue: element.style.textAlign
        });

        this.modules.overlay.update(element);
        this.modules.stylePanel?.updateStyles?.();
        this.saveHTML();
    }

    /**
     * Adjust line height
     * @param {number} delta - Amount to change (positive or negative)
     */
    adjustLineHeight(delta) {
        const element = this.modules.selection.getSelectedElement();
        if (!element) return;

        const win = this.modules.preview.getWindow();
        if (!win) return;

        const computed = win.getComputedStyle(element);
        // Get line-height as a multiplier
        let currentLH;
        if (computed.lineHeight === 'normal') {
            currentLH = 1.2;
        } else {
            const fontSize = parseFloat(computed.fontSize) || 16;
            currentLH = parseFloat(computed.lineHeight) / fontSize;
        }

        const newLH = Math.max(0.5, Math.min(5, currentLH + delta));
        const oldValue = element.style.lineHeight;
        element.style.lineHeight = newLH.toFixed(1);

        // Record for undo
        this.modules.undoRedo.recordChange({
            type: 'style',
            element,
            property: 'lineHeight',
            oldValue: oldValue || '',
            newValue: element.style.lineHeight
        });

        this.modules.overlay.update(element);
        this.modules.stylePanel?.updateStyles?.();
        this.saveHTML();
        this.modules.ui.showToast(`Line height: ${newLH.toFixed(1)}`, 'info');
    }

    /**
     * Adjust letter spacing
     * @param {number} delta - Amount to change in px (positive or negative)
     */
    adjustLetterSpacing(delta) {
        const element = this.modules.selection.getSelectedElement();
        if (!element) return;

        const win = this.modules.preview.getWindow();
        if (!win) return;

        const computed = win.getComputedStyle(element);
        let currentLS = parseFloat(computed.letterSpacing);
        if (isNaN(currentLS) || computed.letterSpacing === 'normal') {
            currentLS = 0;
        }

        const newLS = Math.max(-10, Math.min(50, currentLS + delta));
        const oldValue = element.style.letterSpacing;
        element.style.letterSpacing = newLS + 'px';

        // Record for undo
        this.modules.undoRedo.recordChange({
            type: 'style',
            element,
            property: 'letterSpacing',
            oldValue: oldValue || '',
            newValue: element.style.letterSpacing
        });

        this.modules.overlay.update(element);
        this.modules.stylePanel?.updateStyles?.();
        this.saveHTML();
        this.modules.ui.showToast(`Letter spacing: ${newLS}px`, 'info');
    }

    /**
     * Toggle layer panel visibility
     */
    toggleLayerPanel() {
        const layerPanel = document.getElementById('layerPanel');
        const layerExpandBtn = document.getElementById('layerPanelExpandBtn');
        const resizer = document.getElementById('layerResizer');

        if (!layerPanel) return;

        const isCollapsed = layerPanel.classList.contains('collapsed');

        if (isCollapsed) {
            this.closeAllLeftPanels('layer');
            layerPanel.classList.remove('collapsed');
            layerExpandBtn?.classList.add('active');
            resizer?.classList.remove('hidden');

            if (this.modules.layerPanel) {
                this.modules.layerPanel.refresh();
                const selectedElement = this.modules.selection.getSelectedElement();
                if (selectedElement) {
                    setTimeout(() => {
                        this.modules.layerPanel.syncSelectionFromPreview(selectedElement);
                    }, 100);
                }
            }
        } else {
            layerPanel.classList.add('collapsed');
            layerPanel.style.width = '';
            layerPanel.style.minWidth = '';
            layerExpandBtn?.classList.remove('active');
            resizer?.classList.add('hidden');
        }
    }

    /**
     * Toggle property panel visibility
     */
    togglePropertyPanel() {
        const propertiesPanel = document.getElementById('propertiesPanel');
        const resizer = document.getElementById('resizer');

        if (!propertiesPanel) return;

        const isCollapsed = propertiesPanel.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand the panel
            propertiesPanel.classList.remove('collapsed');
            propertiesPanel.style.width = '';
            propertiesPanel.style.minWidth = '';
            resizer?.classList.remove('hidden');
        } else {
            // Collapse the panel
            propertiesPanel.classList.add('collapsed');
            resizer?.classList.add('hidden');
        }
    }

    /**
     * Toggle template panel visibility
     */
    toggleTemplatePanel() {
        const templatePanel = document.getElementById('templatePanel');
        const templateExpandBtn = document.getElementById('templatePanelExpandBtn');

        if (!templatePanel) return;

        const isHidden = templatePanel.classList.contains('hidden');

        if (isHidden) {
            this.closeAllLeftPanels('template');
            templatePanel.classList.remove('hidden');
            templateExpandBtn?.classList.add('active');
            this.modules.templateManager?.loadTemplates();
        } else {
            templatePanel.classList.add('hidden');
            templateExpandBtn?.classList.remove('active');
        }
    }

    /**
     * 좌측 패널들을 닫기 (특정 패널 제외)
     * @param {string} except - 닫지 않을 패널 ('image', 'template', 'layer', 'ai')
     */
    closeAllLeftPanels(except) {
        if (except !== 'layer') {
            const layerPanel = document.getElementById('layerPanel');
            const layerExpandBtn = document.getElementById('layerPanelExpandBtn');
            const layerResizer = document.getElementById('layerResizer');
            layerPanel?.classList.add('collapsed');
            layerPanel && (layerPanel.style.width = '');
            layerPanel && (layerPanel.style.minWidth = '');
            layerExpandBtn?.classList.remove('active');
            layerResizer?.classList.add('hidden');
        }
        if (except !== 'template') {
            const templatePanel = document.getElementById('templatePanel');
            const templateExpandBtn = document.getElementById('templatePanelExpandBtn');
            templatePanel?.classList.add('hidden');
            templateExpandBtn?.classList.remove('active');
        }
        if (except !== 'image') {
            this.modules.imageManager?.close();
        }
        if (except !== 'icon') {
            this.modules.iconPicker?.close();
        }
        if (except !== 'ai') {
            if (this.modules.aiChat && this.modules.aiChat.isOpen) {
                this.modules.aiChat.closePanel();
            }
        }
    }

    /**
     * Mark as unsaved - called when changes are made
     * Does NOT save to server - only marks the state
     */
    /**
     * iframe 내 서드파티 라이브러리 재초기화 (Lucide, Feather, FontAwesome 등)
     * HTML 파일에 스크립트를 주입하지 않고, contentWindow에서 프로그래밍적으로 호출
     * @param {HTMLIFrameElement|Document} [iframeOrDoc] - 대상 iframe 또는 document (없으면 메인 iframe)
     */
    reinitializeIframeLibraries(iframeOrDoc) {
        let win;
        if (iframeOrDoc?.contentWindow) {
            win = iframeOrDoc.contentWindow;
        } else if (iframeOrDoc?.defaultView) {
            win = iframeOrDoc.defaultView;
        } else {
            win = this.modules.preview?.getMainFrame()?.contentWindow;
        }
        if (!win) return;

        try {
            if (win.lucide?.createIcons) {
                win.lucide.createIcons();
            }
            if (win.feather?.replace) {
                win.feather.replace();
            }
            if (win.FontAwesome?.dom?.i2svg) {
                win.FontAwesome.dom.i2svg();
            }
        } catch (e) {
            console.warn('[reinitializeIframeLibraries] 라이브러리 재초기화 오류:', e);
        }
    }

    saveHTML() {
        // Mark as unsaved (no server save)
        this.modules.ui.setUnsaved();
        this._hasUnsavedChanges = true;
        // AutoSave disabled in VS Code (manual save only)
        this.modules.autoSave?.markChanged();
        // 멀티캔버스 동기화는 UndoRedoManager의 change:recorded 이벤트에서 처리
    }

    /**
     * Save all files to server (called on Ctrl+S or auto-save)
     */
    async saveToServer() {
        try {
            const html = this._getCleanHTML();
            if (html) {
                // ★ 실제 HTML 파일명으로 저장 (saveHTML()은 'index.html' 하드코딩이므로 우회)
                await this.modules.fileManager.saveFile(this._fileNames?.html || 'index.html', html);
                this._hasUnsavedChanges = false;
                this.modules.ui.setSaved();
            }
        } catch (err) {
            console.error('Error saving to server:', err);
            this.modules.ui.showError('Save failed: ' + err.message);
        }
    }

    /**
     * Check if there are unsaved changes
     */
    hasUnsavedChanges() {
        return this._hasUnsavedChanges === true;
    }

    // ========== AI 코드 적용 후 검증 파이프라인 ==========

    /**
     * AI 코드 적용 후 결과물 검증 (공식 파이프라인)
     * 각 validator는 독립적이므로 await 없이 병렬 실행
     */
    async _runPostApplyValidators() {
        this._validateForbiddenPatterns();   // 즉시 (DOM 검사 + Lucide 변환)
        this._validateAndFixImages();        // 내부 0.5초 대기
        this._validateScriptErrors();        // 내부 1초 대기
    }

    // ---------- Validator 1: 이미지 URL 검증 ----------

    /**
     * iframe 내 깨진/금지 이미지 URL 감지 → 자동 대체
     * 내부에서 0.5초 대기 후 검증 시작
     */
    async _validateAndFixImages() {
        // 0.5초 대기 (이미지 로드 시작 대기)
        await new Promise(r => setTimeout(r, 500));

        const frame = this.modules.preview?.getMainFrame();
        const doc = frame?.contentDocument;
        if (!doc?.body) return;

        const images = Array.from(doc.body.querySelectorAll('img[src]'));
        if (images.length === 0) return;

        // 1단계: 금지된 이미지 서비스 즉시 교체
        const FORBIDDEN_HOSTS = ['via.placeholder.com', 'placekitten.com', 'picsum.photos', 'placehold.co', 'placeholder.com', 'dummyimage.com'];
        let modified = false;

        images.forEach(img => {
            if (!img.src) return;
            try {
                const url = new URL(img.src);
                if (FORBIDDEN_HOSTS.some(h => url.hostname.includes(h))) {
                    img.src = this._getFallbackImageUrl(img);
                    modified = true;
                }
                // ?random= 파라미터 → 매번 다른 이미지 방지
                if (url.searchParams.has('random')) {
                    url.searchParams.delete('random');
                    img.src = url.toString();
                    modified = true;
                }
            } catch (e) { /* invalid URL은 아래 로드 검증에서 처리 */ }
        });

        // 2단계: 로드 실패 검증 (1초 타임아웃)
        const results = await Promise.allSettled(images.map(img => {
            if (!img.src || img.src.startsWith('data:') || img.src.startsWith('blob:')) {
                return Promise.resolve({ img, broken: false });
            }
            if (img.complete) {
                return Promise.resolve({ img, broken: img.naturalWidth === 0 });
            }
            return new Promise(resolve => {
                const timeout = setTimeout(() => resolve({ img, broken: true }), 1000);
                img.addEventListener('load', () => { clearTimeout(timeout); resolve({ img, broken: false }); }, { once: true });
                img.addEventListener('error', () => { clearTimeout(timeout); resolve({ img, broken: true }); }, { once: true });
            });
        }));

        const brokenImages = results
            .filter(r => r.status === 'fulfilled' && r.value.broken)
            .map(r => r.value.img);

        if (brokenImages.length > 0) {
            console.log(`[Validator] 깨진 이미지 ${brokenImages.length}개 감지 → 자동 대체`);
            brokenImages.forEach(img => {
                img.src = this._getFallbackImageUrl(img);
            });
            modified = true;
        }

        if (!modified) return;

        if (this.modules.multiCanvas?._isInitialized) {
            this.modules.multiCanvas.syncBodyToAll();
        }
        this.saveHTML();
    }

    /**
     * alt 텍스트 키워드 기반 Unsplash 대체 이미지 URL 반환
     */
    _getFallbackImageUrl(img) {
        const alt = (img.alt || img.title || '').toLowerCase();
        const width = img.width || img.naturalWidth || 800;
        const height = img.height || img.naturalHeight || 600;

        const CATEGORIES = [
            { keys: ['steel', 'fence', 'metal', 'iron', '철', '휀스', '펜스', '강철', '울타리'], id: 'photo-1530982011887-3cc11cc85693' },
            { keys: ['construction', 'build', '건설', '시공', '공사'], id: 'photo-1504307651254-35680f356dfd' },
            { keys: ['factory', 'industrial', 'manufacture', '공장', '산업', '제조'], id: 'photo-1513828583688-c52646db42da' },
            { keys: ['office', 'business', 'corporate', '사무', '비즈니스', '기업', '회사'], id: 'photo-1486406146926-c627a92ad1ab' },
            { keys: ['nature', 'landscape', 'park', 'garden', '자연', '풍경', '공원', '정원'], id: 'photo-1470071459604-3b5ec3a7fe05' },
            { keys: ['tech', 'computer', 'digital', 'code', '기술', '컴퓨터', 'IT'], id: 'photo-1518770660439-4636190af475' },
            { keys: ['food', 'restaurant', 'cook', 'cafe', '음식', '요리', '레스토랑', '카페'], id: 'photo-1504674900247-0877df9cc836' },
            { keys: ['team', 'people', 'person', 'staff', '팀', '사람', '직원', '인물'], id: 'photo-1522202176988-66273c2fd55f' },
            { keys: ['building', 'architecture', 'house', 'apartment', '건물', '건축', '주택', '아파트'], id: 'photo-1487958449943-2429e8be8625' },
            { keys: ['city', 'urban', 'skyline', '도시', '도심'], id: 'photo-1449824913935-59a10b8d2000' },
            { keys: ['interior', 'room', 'design', 'home', '인테리어', '실내', '디자인'], id: 'photo-1618221195710-dd6b41faaea6' },
            { keys: ['safety', 'security', 'protect', '안전', '보안', '방호', '보호'], id: 'photo-1558618666-fcd25c85f82e' },
        ];

        for (const cat of CATEGORIES) {
            if (cat.keys.some(k => alt.includes(k))) {
                return `https://images.unsplash.com/${cat.id}?auto=format&fit=crop&w=${width}&h=${height}&q=80`;
            }
        }

        return `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=${width}&h=${height}&q=80`;
    }

    // ---------- Validator 2: 스크립트 오류 감지 ----------

    /**
     * iframe 내 JS 런타임 오류 감지 (콘솔 경고만)
     * 내부에서 1초 대기 후 수집 결과 출력
     */
    async _validateScriptErrors() {
        const frame = this.modules.preview?.getMainFrame();
        const win = frame?.contentWindow;
        if (!win) return;

        const errors = [];
        const origHandler = win.onerror;

        win.onerror = (msg, src, line, col, err) => {
            if (src?.includes('editor-injected')) return;
            errors.push({ msg, line });
            if (origHandler) origHandler(msg, src, line, col, err);
        };

        await new Promise(r => setTimeout(r, 1000));
        win.onerror = origHandler;

        if (errors.length > 0) {
            console.warn(`[Validator] JS 오류 ${errors.length}개 감지:`, errors);
        }
    }

    // ---------- Validator 3: 금지 패턴 감지 + Lucide 변환 ----------

    /** Font Awesome / Material Icons → Lucide 아이콘 매핑 테이블 */
    static ICON_MAP = {
        // 네비게이션
        'home': 'home', 'house': 'home',
        'bars': 'menu', 'navicon': 'menu', 'menu': 'menu',
        'search': 'search', 'magnifying-glass': 'search',
        'times': 'x', 'close': 'x', 'xmark': 'x',
        'arrow-left': 'arrow-left', 'arrow-right': 'arrow-right',
        'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down',
        'chevron-left': 'chevron-left', 'chevron-right': 'chevron-right',
        'chevron-up': 'chevron-up', 'chevron-down': 'chevron-down',
        'angle-left': 'chevron-left', 'angle-right': 'chevron-right',
        'angle-up': 'chevron-up', 'angle-down': 'chevron-down',
        // 액션
        'check': 'check', 'done': 'check',
        'plus': 'plus', 'add': 'plus',
        'minus': 'minus', 'remove': 'minus',
        'edit': 'pencil', 'pen': 'pencil', 'pencil': 'pencil', 'pencil-alt': 'pencil',
        'trash': 'trash-2', 'trash-alt': 'trash-2', 'delete': 'trash-2',
        'download': 'download', 'file-download': 'download',
        'upload': 'upload', 'file-upload': 'upload',
        'share': 'share-2', 'share-alt': 'share-2',
        'copy': 'copy', 'clone': 'copy',
        'save': 'save', 'floppy-disk': 'save',
        'print': 'printer',
        'refresh': 'refresh-cw', 'sync': 'refresh-cw', 'rotate': 'refresh-cw',
        // 커뮤니케이션
        'envelope': 'mail', 'email': 'mail', 'mail': 'mail',
        'phone': 'phone', 'phone-alt': 'phone',
        'comment': 'message-circle', 'comments': 'message-circle', 'chat': 'message-circle',
        'bell': 'bell', 'notifications': 'bell',
        // 미디어
        'image': 'image', 'photo': 'image', 'picture-o': 'image',
        'camera': 'camera',
        'video': 'video', 'videocam': 'video', 'film': 'film',
        'music': 'music', 'headphones': 'headphones',
        'play': 'play', 'play-circle': 'play-circle',
        'pause': 'pause',
        'stop': 'square',
        'volume-up': 'volume-2', 'volume-down': 'volume-1', 'volume-off': 'volume-x',
        // 소셜 (Lucide에 없는 것 → 일반 아이콘)
        'facebook': 'globe', 'facebook-f': 'globe',
        'twitter': 'globe', 'x-twitter': 'globe',
        'instagram': 'camera',
        'youtube': 'play-circle',
        'linkedin': 'globe', 'linkedin-in': 'globe',
        'github': 'github',
        'google': 'globe',
        'tiktok': 'globe',
        // UI 요소
        'user': 'user', 'person': 'user', 'account-circle': 'user',
        'users': 'users', 'people': 'users', 'group': 'users',
        'cog': 'settings', 'gear': 'settings', 'settings': 'settings',
        'sliders': 'sliders-horizontal',
        'lock': 'lock', 'unlock': 'unlock',
        'key': 'key',
        'eye': 'eye', 'visibility': 'eye',
        'eye-slash': 'eye-off', 'visibility-off': 'eye-off',
        'link': 'link', 'unlink': 'unlink',
        'external-link': 'external-link', 'open-in-new': 'external-link',
        'filter': 'filter', 'filter-list': 'filter',
        'sort': 'arrow-up-down',
        'list': 'list', 'th-list': 'list',
        'grid': 'grid', 'th': 'grid-3x3', 'apps': 'grid-3x3', 'dashboard': 'layout-dashboard',
        // 상태/정보
        'info': 'info', 'info-circle': 'info',
        'question': 'help-circle', 'question-circle': 'help-circle', 'help': 'help-circle',
        'exclamation': 'alert-triangle', 'warning': 'alert-triangle', 'exclamation-triangle': 'alert-triangle',
        'exclamation-circle': 'alert-circle',
        'check-circle': 'check-circle', 'verified': 'check-circle',
        'times-circle': 'x-circle', 'cancel': 'x-circle',
        'ban': 'ban',
        // 파일/문서
        'file': 'file', 'description': 'file-text',
        'file-alt': 'file-text', 'file-text': 'file-text',
        'folder': 'folder', 'folder-open': 'folder-open',
        'document': 'file-text', 'article': 'file-text',
        // 쇼핑
        'shopping-cart': 'shopping-cart', 'cart': 'shopping-cart', 'shopping-bag': 'shopping-bag',
        'credit-card': 'credit-card', 'payment': 'credit-card',
        'tag': 'tag', 'tags': 'tags', 'label': 'tag',
        'store': 'store',
        // 기타
        'star': 'star', 'star-half': 'star-half',
        'heart': 'heart', 'favorite': 'heart',
        'thumbs-up': 'thumbs-up', 'thumb-up': 'thumbs-up',
        'thumbs-down': 'thumbs-down', 'thumb-down': 'thumbs-down',
        'flag': 'flag',
        'bookmark': 'bookmark',
        'calendar': 'calendar', 'event': 'calendar', 'date-range': 'calendar',
        'clock': 'clock', 'time': 'clock', 'access-time': 'clock', 'history': 'clock',
        'map': 'map', 'map-marker': 'map-pin', 'location-on': 'map-pin', 'map-pin': 'map-pin', 'location': 'map-pin', 'place': 'map-pin',
        'globe': 'globe', 'earth': 'globe', 'language': 'globe', 'public': 'globe',
        'sun': 'sun', 'light-mode': 'sun',
        'moon': 'moon', 'dark-mode': 'moon',
        'cloud': 'cloud',
        'bolt': 'zap', 'flash-on': 'zap', 'lightning': 'zap',
        'fire': 'flame',
        'shield': 'shield', 'security': 'shield', 'shield-check': 'shield-check', 'verified-user': 'shield-check',
        'code': 'code',
        'terminal': 'terminal',
        'database': 'database', 'storage': 'database',
        'server': 'server',
        'wifi': 'wifi',
        'chart-bar': 'bar-chart-2', 'bar-chart': 'bar-chart-2', 'analytics': 'bar-chart-2',
        'chart-line': 'line-chart', 'trending-up': 'trending-up', 'show-chart': 'trending-up',
        'chart-pie': 'pie-chart', 'pie-chart': 'pie-chart',
        'rocket': 'rocket',
        'trophy': 'trophy',
        'gift': 'gift',
        'graduation-cap': 'graduation-cap', 'school': 'graduation-cap',
        'book': 'book-open', 'menu-book': 'book-open',
        'lightbulb': 'lightbulb', 'idea': 'lightbulb', 'tips-and-updates': 'lightbulb',
        'palette': 'palette',
        'brush': 'paintbrush',
        'wrench': 'wrench', 'build': 'wrench', 'tool': 'wrench',
        'truck': 'truck', 'local-shipping': 'truck',
        'plane': 'plane', 'flight': 'plane',
        'car': 'car',
        'bicycle': 'bike',
        'coffee': 'coffee',
        'utensils': 'utensils', 'restaurant': 'utensils',
        'hospital': 'building-2', 'local-hospital': 'building-2',
        'stethoscope': 'stethoscope',
        'circle': 'circle', 'square': 'square',
    };

    /** FA 클래스 무시 목록 (스타일/수식어 클래스) */
    static FA_IGNORE_CLASSES = [
        'fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-duotone', 'fa-thin',
        'fa-fw', 'fa-lg', 'fa-xs', 'fa-sm', 'fa-1x', 'fa-2x', 'fa-3x', 'fa-4x', 'fa-5x',
        'fa-6x', 'fa-7x', 'fa-8x', 'fa-9x', 'fa-10x',
        'fa-spin', 'fa-pulse', 'fa-beat', 'fa-bounce', 'fa-flip', 'fa-shake', 'fa-fade',
        'fa-inverse', 'fa-stack', 'fa-stack-1x', 'fa-stack-2x',
    ];

    /**
     * 금지된 아이콘 라이브러리 감지 → Lucide 아이콘으로 변환
     */
    async _validateForbiddenPatterns() {
        const frame = this.modules.preview?.getMainFrame();
        const doc = frame?.contentDocument;
        if (!doc?.body) return;

        let modified = false;
        const ICON_MAP = EditorApp.ICON_MAP;

        // 1. 금지된 아이콘 CSS/JS 링크 제거
        doc.querySelectorAll(
            'link[href*="font-awesome"], link[href*="fontawesome"], link[href*="material"]'
        ).forEach(el => { el.remove(); modified = true; });

        doc.querySelectorAll(
            'script[src*="font-awesome"], script[src*="fontawesome"], script[src*="material"]'
        ).forEach(el => { el.remove(); modified = true; });

        // 2. Font Awesome → Lucide 변환
        const faSelectors = 'i[class*="fa-"], i[class*="fas "], i[class*="far "], i[class*="fab "], i[class*="fal "], i[class*="fad "], span[class*="fa-"]';
        doc.querySelectorAll(faSelectors).forEach(el => {
            const lucideName = this._faToLucide(el);
            const replacement = doc.createElement('i');
            if (lucideName) {
                replacement.setAttribute('data-lucide', lucideName);
            } else {
                replacement.setAttribute('data-lucide', 'circle'); // 매핑 없으면 기본 아이콘
            }
            // non-FA 클래스 보존 (크기, 색상 유틸리티 등)
            const keepClasses = Array.from(el.classList).filter(c =>
                !c.startsWith('fa-') && !['fas', 'far', 'fab', 'fal', 'fad', 'fa'].includes(c)
            );
            if (keepClasses.length > 0) replacement.className = keepClasses.join(' ');
            el.replaceWith(replacement);
            modified = true;
        });

        // 3. Material Icons → Lucide 변환
        doc.querySelectorAll('.material-icons, [class*="material-symbols"]').forEach(el => {
            const iconText = el.textContent.trim().toLowerCase().replace(/_/g, '-');
            const lucideName = ICON_MAP[iconText] || 'circle';
            const replacement = doc.createElement('i');
            replacement.setAttribute('data-lucide', lucideName);
            const keepClasses = Array.from(el.classList).filter(c =>
                c !== 'material-icons' && !c.startsWith('material-symbols')
            );
            if (keepClasses.length > 0) replacement.className = keepClasses.join(' ');
            el.replaceWith(replacement);
            modified = true;
        });

        if (!modified) return;

        // 4. Lucide CDN 스크립트 확인 및 주입
        this._ensureLucideCDN(doc);

        // 5. Lucide 아이콘 렌더링
        this.reinitializeIframeLibraries(doc);

        console.log('[Validator] 금지된 아이콘 → Lucide 변환 완료');

        if (this.modules.multiCanvas?._isInitialized) {
            this.modules.multiCanvas.syncBodyToAll();
        }
        this.saveHTML();
    }

    /**
     * FA 요소에서 아이콘 이름 추출 → Lucide 이름 반환
     * @param {HTMLElement} el - FA 아이콘 요소
     * @returns {string|null} Lucide 아이콘 이름 또는 null
     */
    _faToLucide(el) {
        const classes = Array.from(el.classList);
        for (const cls of classes) {
            if (cls.startsWith('fa-') && !EditorApp.FA_IGNORE_CLASSES.includes(cls)) {
                const iconName = cls.replace('fa-', '');
                return EditorApp.ICON_MAP[iconName] || null;
            }
        }
        return null;
    }

    /**
     * Lucide 아이콘 SVG인지 판별
     */
    _isLucideIcon(element) {
        if (!element) return false;
        // Lucide renders <svg class="lucide lucide-icon-name" data-lucide="icon-name">
        if (element.tagName === 'svg' || element.tagName === 'SVG') {
            const cls = element.getAttribute('class') || '';
            if (cls.includes('lucide')) return true;
            if (element.getAttribute('data-lucide')) return true;
        }
        // Could also be a child of SVG (path, line, etc.) — walk up
        let el = element;
        for (let i = 0; i < 3 && el; i++) {
            if (el.tagName === 'svg' || el.tagName === 'SVG') {
                const cls = el.getAttribute('class') || '';
                if (cls.includes('lucide') || el.getAttribute('data-lucide')) return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    /**
     * 요소에서 가장 가까운 Lucide SVG 요소를 찾아 반환
     */
    _findLucideSvg(element) {
        let el = element;
        for (let i = 0; i < 5 && el; i++) {
            if ((el.tagName === 'svg' || el.tagName === 'SVG') &&
                ((el.getAttribute('class') || '').includes('lucide') || el.getAttribute('data-lucide'))) {
                return el;
            }
            el = el.parentElement;
        }
        return element;
    }

    /**
     * Lucide CDN 스크립트가 없으면 주입
     * @param {Document} doc - iframe document
     */
    _ensureLucideCDN(doc) {
        if (doc.querySelector('script[src*="lucide"]')) return;

        const script = doc.createElement('script');
        script.src = 'https://unpkg.com/lucide@latest';
        doc.head.appendChild(script);

        const initScript = doc.createElement('script');
        initScript.textContent = 'document.addEventListener("DOMContentLoaded",function(){if(window.lucide)lucide.createIcons()});';
        doc.body.appendChild(initScript);
    }

    /**
     * 활성 iframe 변경 시 관련 모듈 업데이트 (멀티뷰 지원)
     * @param {HTMLIFrameElement} iframe
     */
    _updateActiveIframe(iframe) {
        if (!iframe) return;

        // 활성 iframe을 사용하는 모듈들 업데이트
        this.modules.preview.setActiveIframe(iframe);
        this.modules.selection.setActiveIframe(iframe);
        this.modules.overlay.setActiveIframe(iframe);
        this.modules.textEditing.setActiveIframe(iframe);
        this.modules.textToolbar?.setActiveIframe(iframe);
        this.modules.resizeDrag?.setActiveIframe(iframe);
        this.modules.spacingDrag?.setActiveIframe(iframe);
        this.modules.stylePanel?.setActiveIframe(iframe);
        this.modules.layerPanel?.setActiveIframe(iframe);
        this.modules.undoRedo?.setActiveIframe(iframe);
        this.modules.keyboard?.setActiveIframe(iframe);
        this.modules.dragDrop?.setActiveIframe(iframe);
        this.modules.gapOverlay?.setActiveIframe(iframe);

        // 드래그 핸들러 등록 (iframe별로 필요)
        this._attachDragHandlersToIframe(iframe);

        // Update zoom level for text toolbar and image toolbar
        const zoomLevel = this.modules.zoom?.zoomLevel || 1;
        this.modules.textToolbar?.setZoomLevel(zoomLevel);
        this.modules.imageToolbar?.setActiveIframe(iframe);
        this.modules.imageToolbar?.setZoomLevel(zoomLevel);

        // 멀티뷰에서 selectedBreakpoints 업데이트
        // 체크박스 자동 ON은 하지 않음 (사용자가 OFF로 설정한 의도 존중)
        // 대신 현재 체크된 상태만 반영
        if (this.modules.multiCanvas?.isMultiViewEnabled) {
            this.modules.stylePanel?.styleManager?.updateSelectedBreakpointsFromCheckboxes?.();
        }
    }

    /**
     * iframe에 드래그 관련 핸들러 등록 (멀티뷰 지원)
     */
    _attachDragHandlersToIframe(iframe) {
        const doc = iframe?.contentDocument;
        if (!doc) return;

        // 이미 핸들러가 등록되어 있으면 스킵 (중복 방지)
        if (doc._dragHandlersAttached) return;
        doc._dragHandlersAttached = true;

        doc.addEventListener('mousemove', (e) => {
            if (this.modules.dragDrop.isDraggingElement()) {
                this.modules.dragDrop.onDragMove(e);
            }
        });

        doc.addEventListener('mouseup', (e) => {
            if (this.modules.dragDrop.isDraggingElement()) {
                this.modules.dragDrop.endDrag(true);
                this.modules.overlay.endDrag();
                this.saveHTML();
                const selected = this.modules.elementSelector.getSelectedElement();
                if (selected) {
                    this.modules.overlay.update(selected);
                }
            }
        });

        doc.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modules.dragDrop.isDraggingElement()) {
                this.modules.dragDrop.cancelDrag();
                this.modules.overlay.endDrag();
                const selected = this.modules.elementSelector.getSelectedElement();
                if (selected) {
                    this.modules.overlay.update(selected);
                }
            }
        });

        // ★ 이미지 패널에서 드래그한 이미지 드롭 처리
        doc.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('application/x-zaemit-image')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                this._showImageDropFeedback(e, doc);
            }
        });

        doc.addEventListener('dragleave', (e) => {
            // iframe 밖으로 나갈 때만 피드백 제거
            if (!e.relatedTarget || !doc.contains(e.relatedTarget)) {
                this._clearImageDropFeedback(doc);
            }
        });

        doc.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('application/x-zaemit-image')) {
                e.preventDefault();
                this._clearImageDropFeedback(doc);
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/x-zaemit-image'));
                    this._handleImageDrop(e, data, doc).catch(err => {
                        console.error('[EditorApp] Image drop async error:', err);
                    });
                } catch (err) {
                    console.error('[EditorApp] Image drop error:', err);
                }
            }
        });
    }

    /**
     * 이미지 드롭 시 대상 요소 시각적 피드백
     */
    _showImageDropFeedback(e, doc) {
        const target = doc.elementFromPoint(e.clientX, e.clientY);
        if (!target || target === doc.body || target === doc.documentElement) return;

        // 에디터 오버레이 요소 무시
        if (target.id?.startsWith('editor-') || target.classList?.contains('editor-resize-handle') ||
            target.classList?.contains('editor-spacing-handle')) return;

        // 이전 피드백 제거
        this._clearImageDropFeedback(doc);

        // 피드백 표시
        const isImg = target.tagName === 'IMG';
        target.setAttribute('data-zaemit-drop-target', '');
        target.style.setProperty('outline', isImg ? '2px solid #2196F3' : '2px dashed #2196F3', 'important');
        target.style.setProperty('outline-offset', '-2px', 'important');
    }

    /**
     * 이미지 드롭 피드백 제거
     */
    _clearImageDropFeedback(doc) {
        const prev = doc.querySelector('[data-zaemit-drop-target]');
        if (prev) {
            prev.removeAttribute('data-zaemit-drop-target');
            prev.style.removeProperty('outline');
            prev.style.removeProperty('outline-offset');
        }
    }

    /**
     * 이미지 드롭 처리: IMG → src 교체, 그 외 → background-image 설정
     */
    async _handleImageDrop(e, data, doc) {
        const target = doc.elementFromPoint(e.clientX, e.clientY);
        if (!target || target === doc.body || target === doc.documentElement) return;

        // 에디터 오버레이 요소 무시
        if (target.id?.startsWith('editor-') || target.classList?.contains('editor-resize-handle') ||
            target.classList?.contains('editor-spacing-handle')) return;

        // ★ VS Code: webview URI → data URL 변환
        // srcdoc iframe(origin: null)에서 webview URI 직접 로딩 불가
        // → 부모 webview에서 fetch → base64 data URL로 변환 (인라인이라 origin 무관)
        let renderUrl = data.url;
        let saveUrl = data.url;

        if (window.vscBridge) {
            saveUrl = this._toRelativeImagePath(data.url);
            try {
                const response = await fetch(data.url);
                if (response.ok) {
                    const blob = await response.blob();
                    renderUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                }
            } catch (err) {
                console.warn('[EditorApp] Image fetch for data URL failed:', err);
            }
        } else {
            renderUrl = this._toRelativeImagePath(data.url);
            saveUrl = renderUrl;
        }

        if (target.tagName === 'IMG') {
            // IMG 요소: src 교체
            const oldSrc = target.getAttribute('src') || '';
            target.setAttribute('src', renderUrl);
            if (window.vscBridge) {
                target.setAttribute('data-zaemit-save-url', saveUrl);
                this._imageUrlMap.set(renderUrl, saveUrl);
            }

            this.modules.undoRedo.recordChange({
                type: 'attribute',
                element: target,
                property: 'src',
                oldValue: oldSrc,
                newValue: renderUrl,
                timestamp: Date.now()
            });

            // 요소 선택 및 저장
            this.modules.elementSelector?.selectElement(target);
            this.saveHTML();
        } else {
            // ★ 일반 요소: CSS 규칙으로 background-image 설정
            // 멀티뷰 활성화 상태에 따라 전체/일부 브레이크포인트에 적용
            if (window.vscBridge) {
                target.setAttribute('data-zaemit-save-url', saveUrl);
                // ★ data URL → 상대 경로 매핑 저장 (saveCSS URL 복원용)
                this._imageUrlMap.set(renderUrl, saveUrl);
            }

            // 1) 먼저 요소 선택 (style section의 selectedElement 참조 설정)
            this.modules.elementSelector?.selectElement(target);

            // 2) BackgroundStyleSection 접근
            const bgSection = this.modules.stylePanel?.styleManager?.sections?.background;
            if (!bgSection) {
                // fallback: style section 미사용 시 inline 적용
                target.style.backgroundImage = `url('${renderUrl}')`;
                target.style.backgroundSize = 'cover';
                target.style.backgroundRepeat = 'no-repeat';
                this.saveHTML();
                this.modules.uiHelper?.showToast('Background image set', 'success');
                return;
            }

            // 3) 기본값 설정 여부 판단 (CSS 규칙 적용 전에 확인)
            const win = doc.defaultView;
            const computed = win?.getComputedStyle(target);
            const needSize = computed &&
                (!target.style.backgroundSize) &&
                (computed.backgroundSize === 'auto' || computed.backgroundSize === 'auto auto');
            const needRepeat = computed &&
                (!target.style.backgroundRepeat) &&
                computed.backgroundRepeat === 'repeat';

            // 4) background-image CSS 규칙 적용 (렌더링용 URL 사용)
            //    applyStyleChange: 셀렉터 boosting + 미디어쿼리 + cascade prevention + 멀티뷰 동기화 + undo 기록
            //    CSS specificity: 부스팅 셀렉터(.a.b [0,2,0])가 원본(.a [0,1,0])의 background shorthand를 자연 오버라이드
            const oldBg = bgSection.getEffectiveCSSValue('backgroundImage').value;
            await bgSection.applyStyleChange('backgroundImage', `url('${renderUrl}')`, oldBg);

            // 5) 기본값 설정 (backgroundSize, backgroundRepeat)
            if (needSize) {
                const oldSize = bgSection.getEffectiveCSSValue('backgroundSize').value;
                await bgSection.applyStyleChange('backgroundSize', 'cover', oldSize);
            }
            if (needRepeat) {
                const oldRepeat = bgSection.getEffectiveCSSValue('backgroundRepeat').value;
                await bgSection.applyStyleChange('backgroundRepeat', 'no-repeat', oldRepeat);
            }

            // 6) ★ HTML + CSS 즉시 서버 저장
            //    applyStyleChange가 CSS를 saveCSS()로 저장하지만, 이벤트 기반이라 비동기 경쟁 가능
            //    HTML은 부스팅 클래스(h2-xxx)를 포함해야 하므로 즉시 저장 필수
            await this.saveToServer();
        }

        this.modules.uiHelper?.showToast(
            target.tagName === 'IMG' ? 'Image replaced' : 'Background image set',
            'success'
        );
    }

    /**
     * 이미지 URL을 HTML 기준 상대 경로로 변환
     * VS Code: webview URI → projectBaseUri 기준 상대 경로
     * Web: /projects/folder-name/path → path
     */
    _toRelativeImagePath(url) {
        // VS Code webview URI: projectBaseUri 기준으로 상대 경로 추출
        const baseUri = window.vscBridge?.projectBaseUri;
        if (baseUri) {
            // percent-encoding 정규화 (file+ vs file%2B 등)
            const decodedUrl = decodeURIComponent(url);
            const decodedBase = decodeURIComponent(baseUri);
            if (decodedUrl.startsWith(decodedBase)) {
                let relative = decodedUrl.substring(decodedBase.length);
                if (relative.startsWith('/')) relative = relative.substring(1);
                return relative;
            }
        }

        // Web editor: /projects/folder-name/images/photo.jpg → images/photo.jpg
        if (url.startsWith('/projects/')) {
            const parts = url.split('/');
            return parts.slice(3).join('/');
        }

        return url;
    }

    /**
     * VS Code: iframe 로드 후 상대 경로 이미지/배경을 blob URL로 변환
     * srcdoc iframe(origin: null)에서 webview URI 직접 로딩 불가
     * → 부모 webview에서 fetch → iframe 컨텍스트에서 blob URL 생성
     * 저장 시 _getCleanHTML()에서 data-zaemit-save-url 기반으로 원래 경로 복원
     */
    async _resolveIframeImages(doc) {
        if (!window.vscBridge) { console.log('[resolveImages] Skip: no vscBridge'); return; }
        const baseUri = window.vscBridge.projectBaseUri;
        if (!baseUri) { console.log('[resolveImages] Skip: no projectBaseUri'); return; }

        const iframeWindow = doc.defaultView;
        if (!iframeWindow) { console.log('[resolveImages] Skip: no defaultView'); return; }

        console.log('[resolveImages] Starting... baseUri:', baseUri);
        const decodedBase = decodeURIComponent(baseUri);

        // blob → data URL 변환 헬퍼
        const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        // Data URL 캐시 (같은 이미지 중복 fetch 방지)
        const dataUrlCache = new Map();
        const toDataUrl = async (fetchUrl) => {
            if (dataUrlCache.has(fetchUrl)) return dataUrlCache.get(fetchUrl);
            try {
                console.log('[resolveImages] Fetching:', fetchUrl);
                const response = await fetch(fetchUrl);
                if (!response.ok) {
                    console.warn('[resolveImages] Fetch failed:', response.status, fetchUrl);
                    dataUrlCache.set(fetchUrl, null);
                    return null;
                }
                const blob = await response.blob();
                const dataUrl = await blobToDataUrl(blob);
                console.log('[resolveImages] OK:', fetchUrl, '→ data URL (' + blob.size + ' bytes)');
                dataUrlCache.set(fetchUrl, dataUrl);
                return dataUrl;
            } catch (err) {
                console.warn('[resolveImages] Fetch error:', fetchUrl, err.message);
                dataUrlCache.set(fetchUrl, null);
                return null;
            }
        };

        // URL이 변환 필요한지 판단
        const needsResolve = (url) => {
            if (!url) return false;
            url = url.trim();
            if (!url || url === 'none' || url === 'initial' || url === 'inherit') return false;
            if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('javascript:')) return false;
            if (url.startsWith('//')) return false;
            // 외부 URL (vscode 리소스가 아닌 http/https)은 그대로
            if ((url.startsWith('http:') || url.startsWith('https:')) &&
                !url.includes('vscode-resource') && !url.includes('vscode-cdn')) return false;
            return true;
        };

        // 상대 경로를 fetch 가능한 webview URI로 변환
        // decodedBase 사용: URL-인코딩된 호스트명(%2B 등)은 fetch에서 실패함
        const toFetchUrl = (url) => {
            if (url.includes('vscode-resource') || url.includes('vscode-cdn')) return decodeURIComponent(url);
            return decodedBase + '/' + url;
        };

        // 원본 상대 경로 추출 (저장용)
        const toSavePath = (url) => {
            const decoded = decodeURIComponent(url);
            if (decoded.startsWith(decodedBase)) {
                let rel = decoded.substring(decodedBase.length);
                if (rel.startsWith('/')) rel = rel.substring(1);
                return rel;
            }
            return url;
        };

        const promises = [];

        // 1. <img src>, <source src>, <video src/poster> 처리
        const imgEls = doc.querySelectorAll('img[src], source[src], video[src], video[poster]');
        console.log('[resolveImages] Step 1: Found', imgEls.length, 'img/source/video elements');
        imgEls.forEach(el => {
            if (el.id?.startsWith('editor-') || el.closest('[id^="editor-"]')) return;

            for (const attr of ['src', 'poster']) {
                const val = el.getAttribute(attr);
                if (!val || !needsResolve(val)) continue;
                console.log('[resolveImages] IMG attr:', attr, '=', val);

                const savePath = toSavePath(val);
                const fetchUrl = toFetchUrl(val);

                promises.push(
                    toDataUrl(fetchUrl).then(dataUrl => {
                        if (dataUrl) {
                            el.setAttribute(attr, dataUrl);
                            el.setAttribute('data-zaemit-save-url', savePath);
                            this._imageUrlMap.set(dataUrl, savePath);
                        }
                    })
                );
            }
        });

        // 2. 인라인 style의 url() 처리 (background-image 등)
        const styledEls = doc.querySelectorAll('[style]');
        console.log('[resolveImages] Step 2: Found', styledEls.length, 'elements with style attribute');
        styledEls.forEach(el => {
            if (el.id?.startsWith('editor-') || el.closest('[id^="editor-"]')) return;

            const style = el.getAttribute('style');
            if (!style || !style.includes('url(')) return;
            console.log('[resolveImages] Style url() found in:', el.tagName, el.className?.substring?.(0, 30));

            const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
            let match;
            const urlsToResolve = [];
            while ((match = urlRegex.exec(style)) !== null) {
                if (needsResolve(match[1])) {
                    urlsToResolve.push(match[1]);
                }
            }
            if (urlsToResolve.length === 0) return;

            promises.push(
                Promise.all(
                    urlsToResolve.map(url => toDataUrl(toFetchUrl(url)).then(dataUrl => ({ url, dataUrl })))
                ).then(results => {
                    let newStyle = style;
                    let firstSavePath = null;
                    for (const { url, dataUrl } of results) {
                        if (dataUrl) {
                            const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            newStyle = newStyle.replace(
                                new RegExp(`url\\(['"]?${escaped}['"]?\\)`, 'g'),
                                `url('${dataUrl}')`
                            );
                            const sp = toSavePath(url);
                            if (!firstSavePath) firstSavePath = sp;
                            this._imageUrlMap.set(dataUrl, sp);
                        }
                    }
                    if (newStyle !== style) {
                        el.setAttribute('style', newStyle);
                        if (firstSavePath) el.setAttribute('data-zaemit-save-url', firstSavePath);
                    }
                })
            );
        });

        // 3. <style> 태그 내 CSS url() 처리
        // CSSOM 규칙의 url()은 base tag에 의해 절대 URI로 resolve됨
        // → vscode-resource URL을 찾아 data URL로 변환
        // (saveCSS()는 원본 텍스트 기반이므로 CSSOM data URL이 저장 파일에 누출되지 않음)
        const styleEls = doc.querySelectorAll('style');
        console.log('[resolveImages] Step 3: Found', styleEls.length, 'style elements');
        for (const styleEl of styleEls) {
            if (styleEl.id?.startsWith('editor-') || styleEl.id === 'zaemit-temp-styles') continue;
            console.log('[resolveImages] Processing <style id="' + (styleEl.id || '') + '">');

            const sheet = styleEl.sheet;
            if (!sheet) continue;

            try {
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    const rule = sheet.cssRules[i];
                    if (rule.type !== CSSRule.STYLE_RULE) continue;

                    const propsToCheck = ['background-image', 'background', 'list-style-image', 'content', 'border-image-source'];
                    for (const prop of propsToCheck) {
                        const val = rule.style.getPropertyValue(prop);
                        if (!val || !val.includes('url(')) continue;

                        const cssUrlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
                        let cssMatch;
                        const cssUrlsToResolve = [];
                        while ((cssMatch = cssUrlRegex.exec(val)) !== null) {
                            if (needsResolve(cssMatch[1])) {
                                cssUrlsToResolve.push(cssMatch[1]);
                            }
                        }
                        if (cssUrlsToResolve.length === 0) continue;
                        console.log('[resolveImages] CSS rule:', rule.selectorText, prop, '→', cssUrlsToResolve);

                        const ruleRef = rule;
                        const propRef = prop;
                        const valRef = val;

                        promises.push(
                            Promise.all(
                                cssUrlsToResolve.map(url => toDataUrl(toFetchUrl(url)).then(dataUrl => ({ url, dataUrl })))
                            ).then(results => {
                                let newVal = valRef;
                                let firstSavePathForRule = null;
                                for (const { url, dataUrl } of results) {
                                    if (dataUrl) {
                                        const sp = toSavePath(url);
                                        if (!firstSavePathForRule) firstSavePathForRule = sp;
                                        this._imageUrlMap.set(dataUrl, sp);
                                        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                        newVal = newVal.replace(
                                            new RegExp(`url\\(['"]?${escaped}['"]?\\)`, 'g'),
                                            `url('${dataUrl}')`
                                        );
                                    }
                                }
                                if (newVal !== valRef) {
                                    ruleRef.style.setProperty(propRef, newVal);
                                    // ★ CSS 규칙의 원래 URL을 매칭 요소에 저장
                                    // saveCSS()에서 data URL → 원래 경로 복원 시 사용
                                    if (firstSavePathForRule) {
                                        try {
                                            const matchedEl = doc.querySelector(ruleRef.selectorText);
                                            if (matchedEl && !matchedEl.getAttribute('data-zaemit-save-url')) {
                                                matchedEl.setAttribute('data-zaemit-save-url', firstSavePathForRule);
                                            }
                                        } catch(e) {}
                                    }
                                }
                            })
                        );
                    }
                }
            } catch (err) {
                // Cross-origin stylesheet 접근 실패 시 무시
            }
        }

        if (promises.length > 0) {
            console.log(`[EditorApp] Resolving ${promises.length} image reference(s) to blob URLs...`);
            await Promise.allSettled(promises);
            console.log('[EditorApp] Image resolution complete');
        }
    }

    /**
     * VS Code 탐색기에서 이미지 파일을 에디터 캔버스에 드래그앤드롭하는 기능 설정
     * - IMG 요소 위: src 교체
     * - 일반 요소 위: background-image 설정
     */
    _setupExternalFileDrop() {
        // VS Code 환경에서만 활성화
        if (!window.vscBridge) return;

        const previewWrapper = document.querySelector('.preview-wrapper');
        if (!previewWrapper) return;

        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.avif'];

        // 이미지 파일 확인
        const isImageFile = (name) => {
            if (!name) return false;
            const ext = '.' + name.split('.').pop().toLowerCase();
            return imageExts.includes(ext);
        };

        // iframe 내부 좌표 계산 (zoom 보정)
        const getIframeCoords = (e) => {
            const iframe = this.modules.preview.previewFrame;
            if (!iframe) return null;
            const rect = iframe.getBoundingClientRect();
            const zoomLevel = this.modules.zoom?.getZoomLevel() || 1;
            return {
                x: (e.clientX - rect.left) / zoomLevel,
                y: (e.clientY - rect.top) / zoomLevel
            };
        };

        previewWrapper.addEventListener('dragover', (e) => {
            // 이미지 패널 내부 드래그는 별도 핸들러에서 처리
            if (e.dataTransfer.types.includes('application/x-zaemit-image')) return;

            // 외부 파일 드롭 허용
            if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';

                // iframe 내부 요소 피드백 표시
                const iframe = this.modules.preview.previewFrame;
                const doc = iframe?.contentDocument;
                if (doc) {
                    const coords = getIframeCoords(e);
                    if (coords) {
                        this._showExternalDropFeedback(doc, coords.x, coords.y);
                    }
                }
            }
        });

        previewWrapper.addEventListener('dragleave', (e) => {
            if (!e.relatedTarget || !previewWrapper.contains(e.relatedTarget)) {
                const doc = this.modules.preview.previewFrame?.contentDocument;
                if (doc) this._clearImageDropFeedback(doc);
            }
        });

        previewWrapper.addEventListener('drop', async (e) => {
            // 이미지 패널 내부 드래그는 별도 핸들러에서 처리
            if (e.dataTransfer.types.includes('application/x-zaemit-image')) return;

            e.preventDefault();
            e.stopPropagation();

            const iframe = this.modules.preview.previewFrame;
            const doc = iframe?.contentDocument;
            if (!doc) return;

            this._clearImageDropFeedback(doc);

            // iframe 내부 좌표 계산
            const coords = getIframeCoords(e);
            if (!coords) return;

            // 1. Files API로 파일 데이터 확인
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (!isImageFile(file.name)) {
                    this.modules.ui?.showToast('Only image files can be dropped', 'warning');
                    return;
                }

                // FileReader로 base64 인코딩
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    const base64 = evt.target.result.split(',')[1];
                    await this._processExternalImageDrop(file.name, { base64Data: base64 }, doc, coords);
                };
                reader.readAsDataURL(file);
                return;
            }

            // 2. URI list로 파일 경로 확인
            const uriList = e.dataTransfer.getData('text/uri-list');
            if (uriList) {
                const uri = uriList.split('\n').find(u => u.trim() && !u.startsWith('#'));
                if (uri) {
                    let filePath = '';
                    const trimmedUri = uri.trim();

                    if (trimmedUri.startsWith('file:///')) {
                        // file:///C:/path/to/image.png → C:\path\to\image.png
                        filePath = decodeURIComponent(trimmedUri.replace('file:///', ''));
                        // Unix path 유지 (Extension Host가 처리)
                    } else if (trimmedUri.startsWith('file://')) {
                        filePath = decodeURIComponent(trimmedUri.replace('file://', ''));
                    }

                    if (filePath) {
                        const name = filePath.split(/[/\\]/).pop();
                        if (!isImageFile(name)) {
                            this.modules.ui?.showToast('Only image files can be dropped', 'warning');
                            return;
                        }
                        await this._processExternalImageDrop(name, { filePath }, doc, coords);
                        return;
                    }
                }
            }

            // 3. text/plain 폴백 (파일 경로일 수 있음)
            const textData = e.dataTransfer.getData('text/plain');
            if (textData) {
                const name = textData.split(/[/\\]/).pop();
                if (isImageFile(name)) {
                    await this._processExternalImageDrop(name, { filePath: textData }, doc, coords);
                }
            }
        });
    }

    /**
     * 외부 드롭 시 iframe 내부 요소에 시각적 피드백 표시
     */
    _showExternalDropFeedback(doc, x, y) {
        const target = doc.elementFromPoint(x, y);
        if (!target || target === doc.body || target === doc.documentElement) return;
        if (target.id?.startsWith('editor-') || target.classList?.contains('editor-resize-handle') ||
            target.classList?.contains('editor-spacing-handle')) return;

        // 이전 피드백 제거
        this._clearImageDropFeedback(doc);

        const isImg = target.tagName === 'IMG';
        target.setAttribute('data-zaemit-drop-target', '');
        target.style.setProperty('outline', isImg ? '3px solid #2196F3' : '3px dashed #4CAF50', 'important');
        target.style.setProperty('outline-offset', '-3px', 'important');
    }

    /**
     * 외부에서 드롭된 이미지를 Extension Host로 전송하여 프로젝트 폴더에 저장 후 적용
     */
    async _processExternalImageDrop(filename, data, doc, coords) {
        try {
            this.modules.ui?.showToast('Saving image...', 'info');

            // Extension Host에 파일 저장 요청
            const result = await window.vscBridge.sendCommand('images:saveDroppedFile', {
                filename,
                ...data
            });

            if (!result || !result.url) {
                this.modules.ui?.showToast('Failed to save image', 'error');
                return;
            }

            // 기존 _handleImageDrop 로직 재사용 (mock event 전달)
            this._handleImageDrop(
                { clientX: coords.x, clientY: coords.y },
                { url: result.url, name: result.name },
                doc
            );
        } catch (err) {
            console.error('[EditorApp] External image drop error:', err);
            this.modules.ui?.showToast('Image drop failed: ' + err.message, 'error');
        }
    }

    /**
     * VS Code 전용: 컨텍스트 메뉴에 "파일에서 이미지 삽입" 아이템 동적 추가
     */
    _injectInsertImageMenuItem() {
        const menu = this.modules.contextMenu.contextMenu;
        if (!menu) return;

        // 구분선 추가
        const divider = document.createElement('div');
        divider.className = 'editor-context-menu-divider';

        // 메뉴 아이템 추가
        const item = document.createElement('div');
        item.className = 'editor-context-menu-item';
        item.dataset.action = 'insertImageFromFile';
        item.innerHTML = '<span class="icon">📂</span><span>Insert image from file</span><span class="shortcut"></span>';

        menu.appendChild(divider);
        menu.appendChild(item);

        // 이벤트 핸들러 등록
        this.modules.contextMenu.on('action:insertImageFromFile', () => {
            this._insertImageFromFile();
        });
    }

    /**
     * VS Code 파일 선택 다이얼로그를 열어 이미지를 선택하고 선택된 요소에 적용
     * - IMG 요소: src 교체
     * - 일반 요소: background-image 설정
     */
    async _insertImageFromFile() {
        const element = this.modules.selection.getSelectedElement();
        if (!element) {
            this.modules.ui?.showToast('Please select an element first', 'warning');
            return;
        }

        try {
            const result = await window.vscBridge.sendCommand('images:pickFile');
            if (!result || result.cancelled) return;
            if (!result.url) {
                this.modules.ui?.showToast('Failed to select image', 'error');
                return;
            }

            const doc = this.modules.preview.getDocument();
            if (!doc) return;

            const url = this._toRelativeImagePath(result.url);

            if (element.tagName === 'IMG') {
                // IMG 요소: src 교체
                const oldSrc = element.getAttribute('src') || '';
                element.setAttribute('src', url);
                this.modules.undoRedo.recordChange({
                    type: 'attribute',
                    elementPath: this.modules.undoRedo.getElementPath(element),
                    property: 'src',
                    oldValue: oldSrc,
                    newValue: url,
                    timestamp: Date.now()
                });
            } else {
                // 일반 요소: background-image 설정
                const win = doc.defaultView;
                const computed = win.getComputedStyle(element);
                const oldBg = element.style.backgroundImage || '';

                element.style.backgroundImage = `url('${url}')`;
                if (!element.style.backgroundSize && computed.backgroundSize === 'auto') {
                    element.style.backgroundSize = 'cover';
                }
                if (!element.style.backgroundRepeat && computed.backgroundRepeat === 'repeat') {
                    element.style.backgroundRepeat = 'no-repeat';
                }

                this.modules.undoRedo.recordChange({
                    type: 'style',
                    elementPath: this.modules.undoRedo.getElementPath(element),
                    property: 'backgroundImage',
                    oldValue: oldBg,
                    newValue: `url('${url}')`,
                    timestamp: Date.now()
                });
            }

            this.saveHTML();
            this.modules.overlay.updateOverlay();
            this.modules.ui?.showToast(
                element.tagName === 'IMG' ? 'Image replaced' : 'Background image set',
                'success'
            );
        } catch (err) {
            console.error('[EditorApp] Insert image from file error:', err);
            this.modules.ui?.showToast('Failed to insert image: ' + err.message, 'error');
        }
    }

    /**
     * Undo용 변경 객체 값 스왑 (oldValue ↔ newValue)
     */
    _swapChangeValues(change) {
        if (!change) return change;

        const swapped = { ...change };

        // structure 타입: Undo 시 add↔delete 반전
        if (change.type === 'structure' && change.structureType) {
            if (change.structureType === 'add') {
                swapped.structureType = 'delete';
            } else if (change.structureType === 'delete') {
                swapped.structureType = 'add';
            }
            // move는 그대로 (body 전체 동기화)
            return swapped;
        }

        if (change.type === 'multiStyle' && change.changes) {
            swapped.changes = change.changes.map(c => ({
                ...c,
                oldValue: c.newValue,
                newValue: c.oldValue
            }));
        } else {
            swapped.oldValue = change.newValue;
            swapped.newValue = change.oldValue;
        }

        return swapped;
    }

    /**
     * mainIframe 요소의 스타일을 다른 모든 iframe에 동기화
     * elementSnapshot undo/redo 후 호출됨
     */
    _syncElementToOtherIframes(element) {
        // ★ _isInitialized만 체크, isMultiViewEnabled 체크 금지!
        if (!element || !this.modules.multiCanvas?._isInitialized) return;

        const mc = this.modules.multiCanvas;
        const path = mc._getElementPath(element);
        if (!path) return;

        // ★ outerHTML 전체를 동기화 (undo/redo는 outerHTML을 교체하므로)
        const outerHTML = element.outerHTML;

        mc.iframes.forEach((iframe) => {
            // mainIframe은 이미 업데이트됨, 건너뜀
            if (iframe === mc.mainIframe) return;

            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                const targetEl = mc._findElementByPath(path, doc);
                if (!targetEl) return;

                // ★ outerHTML 전체를 교체
                targetEl.outerHTML = outerHTML;
            } catch (e) {
                console.error('[EditorApp] _syncElementToOtherIframes error:', e);
            }
        });
    }

    /**
     * Quick text edit 클릭 처리 (멀티뷰 지원)
     */
    _handleQuickTextEdit(element, clickInfo) {
        if (!this.modules.textEditing.isTextEditable(element)) return;
        if (!this.isTextContentElement(element)) return;

        const doc = this.modules.selection.getDocument();
        if (!doc) return;

        const x = clickInfo.clientX;
        const y = clickInfo.clientY;

        let range = null;
        if (doc.caretRangeFromPoint) {
            range = doc.caretRangeFromPoint(x, y);
        } else if (doc.caretPositionFromPoint) {
            const pos = doc.caretPositionFromPoint(x, y);
            if (pos && pos.offsetNode) {
                range = doc.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        }

        if (!range || !range.startContainer) return;
        if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
        if (!element.contains(range.startContainer)) return;

        const textNode = range.startContainer;
        const textRange = doc.createRange();
        textRange.selectNodeContents(textNode);
        const textRects = textRange.getClientRects();

        let isClickOnText = false;
        for (const rect of textRects) {
            if (x >= rect.left - 2 && x <= rect.right + 2 &&
                y >= rect.top - 2 && y <= rect.bottom + 2) {
                isClickOnText = true;
                break;
            }
        }

        if (!isClickOnText) return;

        setTimeout(() => {
            this.startTextEditingAtPosition(element, range);
        }, 50);
    }

    /**
     * Get clean HTML for saving (removes editor elements)
     */
    _getCleanHTML() {
        try {
            // 멀티캔버스 iframe이 존재하면 첫 번째 iframe(PC 버전)에서,
            // 아니면 메인 preview에서 document 가져오기
            // HTML은 항상 PC 버전 기준으로 저장 (반응형 스타일은 CSS에서 처리)
            let doc;
            const iframes = this.modules.multiCanvas?.iframes;
            if (iframes?.length > 0 && iframes[0]?.contentDocument) {
                doc = iframes[0].contentDocument;
            }
            if (!doc) {
                doc = this.modules.preview.getDocument();
            }

            // Clone the document element to avoid modifying the live DOM
            const clonedDoc = doc.documentElement.cloneNode(true);

            // Remove editor-related classes from clone
            clonedDoc.querySelectorAll('.editor-highlight, .editor-hover, .editor-multi-select').forEach(el => {
                el.classList.remove('editor-highlight', 'editor-hover', 'editor-multi-select');
            });

            // Remove table cell selection classes (::before 오버레이 제거)
            clonedDoc.querySelectorAll('.table-cell-selected, .table-cell-editing, .table-header-selected').forEach(el => {
                el.classList.remove('table-cell-selected', 'table-cell-editing', 'table-header-selected');
            });

            // Remove editor-injected <base> tag (srcdoc용 상대 경로 해결용)
            const editorBase = clonedDoc.querySelector('#zaemit-editor-base');
            if (editorBase) editorBase.remove();

            // Remove editor UI elements from clone
            const editorElementSelectors = [
                '#editor-overlay',
                '#editor-margin-overlay',
                '#editor-padding-overlay',
                '#editor-context-menu',
                '#editor-drop-indicator',
                '#editor-multi-select-style',
                '#editor-gap-overlay',
                '.br-indicator',
                '.editor-spacing-handle',
                '.editor-resize-handle',
                '.editor-move-handle',
                '.editor-rotate-handle',
                '.editor-gap-area',
                '.editor-drag-clone',
                '.editor-border-drag-zone',
                '.editor-dragging',
                '.editor-context-menu',
                '.editor-context-menu-item',
                '.editor-context-menu-divider',
                '[class*="editor-overlay"]',
                '[class*="editor-drop-indicator"]'
            ];

            editorElementSelectors.forEach(selector => {
                clonedDoc.querySelectorAll(selector).forEach(el => el.remove());
            });

            // Remove elements with id starting with editor-, ai-injected-, or ai-pending-
            clonedDoc.querySelectorAll('[id]').forEach(el => {
                if (el.id.startsWith('editor-') || el.id.startsWith('ai-injected-') || el.id.startsWith('ai-pending-')) {
                    el.remove();
                }
            });

            // Remove contenteditable attributes
            clonedDoc.querySelectorAll('[contenteditable="true"]').forEach(el => {
                if (!el.classList.contains('editor-editable')) {
                    el.removeAttribute('contenteditable');
                }
            });

            // Remove script initialization flags set by JS
            // These prevent re-initialization but should not be saved to HTML
            // Patterns: kebab-case (data-*-init) and camelCase (data-*Init, data-*Initialized)
            clonedDoc.querySelectorAll('*').forEach(el => {
                const attrsToRemove = [];
                for (const attr of el.attributes) {
                    if (attr.name.startsWith('data-')) {
                        const name = attr.name;
                        // kebab-case: data-*-init, data-*-initialized, data-*-ready, data-*-loaded
                        if (name.endsWith('-init') ||
                            name.endsWith('-initialized') ||
                            name.endsWith('-ready') ||
                            name.endsWith('-loaded')) {
                            attrsToRemove.push(name);
                        }
                        // camelCase uppercase: data-*Init, data-*Initialized, data-*Ready, data-*Loaded
                        else if (name.endsWith('Init') ||
                                 name.endsWith('Initialized') ||
                                 name.endsWith('Ready') ||
                                 name.endsWith('Loaded')) {
                            attrsToRemove.push(name);
                        }
                        // camelCase lowercase: data-*init, data-*initialized, data-*ready, data-*loaded
                        // (dataset.formready -> data-formready, dataset.imagesloaded -> data-imagesloaded)
                        else if (name.endsWith('init') ||
                                 name.endsWith('initialized') ||
                                 name.endsWith('ready') ||
                                 name.endsWith('loaded')) {
                            attrsToRemove.push(name);
                        }
                    }
                }
                attrsToRemove.forEach(attr => el.removeAttribute(attr));
            });

            // 스냅샷 기반 동적 data-* 속성 제거
            // (초기 로드 시 없었고, AI HTML에도 없는 data-* 속성 = JS가 동적으로 추가한 것)
            if (this.modules.domSnapshot) {
                // clonedDoc의 body 요소 찾기
                const clonedBody = clonedDoc.querySelector('body');
                if (clonedBody) {
                    this.modules.domSnapshot.cleanDynamicDataAttrs(clonedBody);
                }
            }

            // Serialize zaemit-temp-styles CSSOM rules to textContent before saving
            // (CSSOM modifications via rule.style.setProperty don't update textContent)
            const tempStyle = clonedDoc.querySelector('#zaemit-temp-styles');
            if (tempStyle) {
                const liveStyle = doc.getElementById('zaemit-temp-styles');
                if (liveStyle && liveStyle.sheet) {
                    let cssText = '';
                    for (const rule of liveStyle.sheet.cssRules) {
                        cssText += rule.cssText + '\n';
                    }
                    tempStyle.textContent = cssText;
                }
            }

            // Remove editor height-limit attributes and restore original styles
            clonedDoc.querySelectorAll('[data-editor-height-limited]').forEach(el => {
                // Restore original inline styles
                const origHeight = el.dataset.editorOriginalHeight;
                const origMinHeight = el.dataset.editorOriginalMinHeight;
                const origMaxHeight = el.dataset.editorOriginalMaxHeight;

                // Remove the !important styles we added
                el.style.removeProperty('height');
                el.style.removeProperty('min-height');
                el.style.removeProperty('max-height');

                // Restore original values (skip editor artifact px values)
                if (origHeight && origHeight !== 'auto') el.style.height = origHeight;
                if (origMinHeight && parseFloat(origMinHeight) < 3000) el.style.minHeight = origMinHeight;
                if (origMaxHeight) el.style.maxHeight = origMaxHeight;

                // Remove editor data attributes
                el.removeAttribute('data-editor-height-limited');
                el.removeAttribute('data-editor-original-height');
                el.removeAttribute('data-editor-original-min-height');
                el.removeAttribute('data-editor-original-max-height');

                // style 속성이 비었으면 제거
                if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
            });

            // Clean stale editor height artifacts (이전 버그로 저장된 거대 min-height)
            clonedDoc.querySelectorAll('[style*="min-height"]').forEach(el => {
                if (el.dataset.editorHeightLimited) return;
                const minH = parseFloat(el.style.minHeight);
                if (minH > 3000 && el.style.height === 'auto') {
                    el.style.removeProperty('height');
                    el.style.removeProperty('min-height');
                    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
                }
            });

            // Remove overflow: hidden added by _hideIframeScrollbar (멀티캔버스용)
            // html 요소(clonedDoc 자체)와 body 요소 모두 처리
            [clonedDoc, clonedDoc.querySelector('body')].forEach(el => {
                if (el?.hasAttribute('data-editor-overflow-hidden')) {
                    const origOverflow = el.getAttribute('data-editor-orig-overflow');
                    if (origOverflow) {
                        el.style.overflow = origOverflow;
                    } else {
                        el.style.removeProperty('overflow');
                    }
                    el.removeAttribute('data-editor-overflow-hidden');
                    el.removeAttribute('data-editor-orig-overflow');
                    // style 속성이 비었으면 제거
                    if (!el.getAttribute('style')?.trim()) {
                        el.removeAttribute('style');
                    }
                }
            });

            // Remove editor-injected style tags
            clonedDoc.querySelectorAll('style').forEach(style => {
                const content = style.textContent;
                if (content.includes('editor-highlight') ||
                    content.includes('editor-multi-select') ||
                    style.id?.startsWith('editor-') ||
                    // scrollbar 숨김 스타일 (MultiCanvasManager가 주입, id 없이 저장될 수 있음)
                    (content.includes('overflow: hidden !important') && content.includes('scrollbar'))) {
                    style.remove();
                }
            });

            // Remove chrome-extension scripts (브라우저 확장프로그램이 주입한 스크립트)
            clonedDoc.querySelectorAll('script[src^="chrome-extension://"]').forEach(el => el.remove());

            // Clean html/body 요소의 에디터 오염 속성
            // overflow:hidden (에디터/확장이 추가), 빈 class 속성 정리
            [clonedDoc, clonedDoc.querySelector('body')].forEach(el => {
                if (!el) return;
                if (el.style?.overflow === 'hidden' && !el.hasAttribute('data-editor-overflow-hidden')) {
                    el.style.removeProperty('overflow');
                }
                if (!el.getAttribute('style')?.trim()) {
                    el.removeAttribute('style');
                }
                if (el.getAttribute('class') === '') {
                    el.removeAttribute('class');
                }
            });

            // ===== VS Code Extension: 인라인 주입 태그 정리 =====
            // srcdoc 프리뷰를 위해 주입한 인라인 CSS/JS를 제거하고 외부 파일 참조 복원
            if (window.vscBridge) {
                const head = clonedDoc.querySelector('head');
                const body = clonedDoc.querySelector('body');

                // 1. <style id="zaemit-injected-css"> 모두 제거 → <link href="실제CSS파일명"> 복원
                const injectedCssList = clonedDoc.querySelectorAll('#zaemit-injected-css');
                if (injectedCssList.length > 0) {
                    injectedCssList.forEach(el => el.remove());
                    if (head && this._fileNames?.css) {
                        const link = doc.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = this._fileNames.css;
                        head.appendChild(link);
                    }
                }

                // 2. <style id="zaemit-temp-styles"> 모두 제거 (saveCSS()에서 이미 style.css에 병합됨)
                clonedDoc.querySelectorAll('#zaemit-temp-styles').forEach(el => el.remove());

                // 3. <script id="zaemit-injected-js"> 모두 제거 → <script src="실제JS파일명"> 복원
                const injectedJsList = clonedDoc.querySelectorAll('#zaemit-injected-js');
                if (injectedJsList.length > 0) {
                    injectedJsList.forEach(el => el.remove());
                    if (body && this._fileNames?.js) {
                        const script = doc.createElement('script');
                        script.src = this._fileNames.js;
                        body.appendChild(script);
                    }
                }

                // 4. <script id="zaemit-link-interceptor"> 모두 제거 (에디터 전용)
                clonedDoc.querySelectorAll('#zaemit-link-interceptor').forEach(el => el.remove());

                // 5. blob/data URL → 상대 경로 변환 (data-zaemit-save-url 속성 기반)
                clonedDoc.querySelectorAll('[data-zaemit-save-url]').forEach(el => {
                    const saveUrl = el.getAttribute('data-zaemit-save-url');
                    // background-image blob/data URL 변환
                    const style = el.getAttribute('style');
                    if (style && (style.includes('blob:') || style.includes('data:image'))) {
                        el.setAttribute('style', style.replace(/url\(['"]?(?:blob:|data:image\/)[^'")\s]+['"]?\)/gi, `url('${saveUrl}')`));
                    }
                    // src blob/data URL 변환
                    const src = el.getAttribute('src');
                    if (src && (src.startsWith('blob:') || src.startsWith('data:image'))) {
                        el.setAttribute('src', saveUrl);
                    }
                    el.removeAttribute('data-zaemit-save-url');
                });

                // 5-b. data-zaemit-save-url 없이 남아있는 stale blob/data URL 정리
                clonedDoc.querySelectorAll('[style]').forEach(el => {
                    const style = el.getAttribute('style');
                    if (style && style.includes('blob:')) {
                        const cleaned = style.replace(/url\(['"]?blob:[^'")\s]+['"]?\)/gi, 'none');
                        el.setAttribute('style', cleaned);
                    }
                });
                clonedDoc.querySelectorAll('img[src], source[src], video[src]').forEach(el => {
                    const src = el.getAttribute('src');
                    if (src && src.startsWith('blob:')) {
                        el.removeAttribute('src');
                    }
                });

                // 6. webview URI → 상대 경로 변환 (인라인 스타일 + src 속성, fallback)
                const baseUri = window.vscBridge?.projectBaseUri;
                if (baseUri) {
                    const decodedBase = decodeURIComponent(baseUri);
                    clonedDoc.querySelectorAll('[style]').forEach(el => {
                        let style = el.getAttribute('style');
                        if (style && (style.includes('vscode-resource') || style.includes('vscode-cdn'))) {
                            // url('webviewUri/path') → url('relativePath')
                            style = style.replace(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/gi, (match, fullUrl) => {
                                const decoded = decodeURIComponent(fullUrl);
                                if (decoded.startsWith(decodedBase)) {
                                    let rel = decoded.substring(decodedBase.length);
                                    if (rel.startsWith('/')) rel = rel.substring(1);
                                    return `url('${rel}')`;
                                }
                                return match;
                            });
                            el.setAttribute('style', style);
                        }
                    });
                    clonedDoc.querySelectorAll('img[src], source[src], video[src], audio[src]').forEach(el => {
                        const src = el.getAttribute('src');
                        if (src && (src.includes('vscode-resource') || src.includes('vscode-cdn'))) {
                            const decoded = decodeURIComponent(src);
                            if (decoded.startsWith(decodedBase)) {
                                let rel = decoded.substring(decodedBase.length);
                                if (rel.startsWith('/')) rel = rel.substring(1);
                                el.setAttribute('src', rel);
                            }
                        }
                    });
                }

                // 7. bare 링크 인터셉터 + script.js 중복 제거 (ID 없이 저장된 이전 버그 잔재)
                const jsFileContent = window.vscBridge?.getJsFile?.();
                const trimmedJsContent = jsFileContent?.trim();
                clonedDoc.querySelectorAll('script').forEach(script => {
                    // src나 id가 있으면 건드리지 않음 (외부 참조 또는 이미 처리됨)
                    if (script.src || script.id) return;
                    const content = script.textContent.trim();
                    // 링크 인터셉터 패턴
                    if (content.includes('e.target.closest("a")') && content.includes('e.preventDefault()')) {
                        script.remove();
                        return;
                    }
                    // script.js 내용과 동일한 bare script
                    if (trimmedJsContent && content === trimmedJsContent) {
                        script.remove();
                    }
                });
            }

            const html = '<!DOCTYPE html>\n' + clonedDoc.outerHTML;
            return html;
        } catch (err) {
            console.error('Error getting clean HTML:', err);
            return null;
        }
    }

    /**
     * Capture screenshot with debounce (30 seconds)
     */
    captureScreenshotDebounced() {
        if (this.screenshotTimer) {
            clearTimeout(this.screenshotTimer);
        }

        // Capture screenshot 30 seconds after last save
        this.screenshotTimer = setTimeout(() => {
            this.captureScreenshot();
        }, 30000);
    }

    /**
     * Capture screenshot of the preview iframe
     */
    async captureScreenshot() {
        try {
            const iframe = this.modules.preview.getFrame();
            if (iframe) {
                await this.modules.fileManager.captureScreenshot(iframe);
            }
        } catch (err) {
            console.error('Error capturing screenshot:', err);
        }
    }

    /**
     * 페이지 하단까지 스크롤 트리거 후 캔버스 높이 설정
     * lazy loading 콘텐츠 렌더링을 유도함
     * 멀티뷰: 각 iframe onload에서 이미 스크롤 트리거됨, 여기서는 높이 재계산만
     */
    triggerFullPageScroll() {
        try {
            // 멀티뷰 활성화 시: 스크롤 트리거는 이미 onload에서 했으므로 높이 재계산만
            if (this.modules.multiCanvas?.isEnabled()) {
                this.modules.multiCanvas.recalculateAllHeights();
                return;
            }

            // 싱글뷰: 기존 로직
            const iframeDoc = this.modules.preview?.getDocument();
            const iframeWin = this.modules.preview?.getWindow();
            if (!iframeDoc || !iframeWin) return;

            // 페이지 전체 높이
            const fullHeight = Math.max(
                iframeDoc.body.scrollHeight,
                iframeDoc.documentElement.scrollHeight
            );

            // 하단으로 스크롤 트리거
            iframeWin.scrollTo(0, fullHeight);

            // 약간의 딜레이 후 상단으로 복귀 및 캔버스 높이 설정
            setTimeout(() => {
                iframeWin.scrollTo(0, 0);
                this.modules.zoom?.setCanvasHeightToContent();
            }, 100);
        } catch (err) {
            console.error('[EditorApp] triggerFullPageScroll error:', err);
            // 실패해도 캔버스 높이는 설정 시도
            if (this.modules.multiCanvas?.isEnabled()) {
                this.modules.multiCanvas.recalculateAllHeights();
            } else {
                this.modules.zoom?.setCanvasHeightToContent();
            }
        }
    }

    /**
     * 스크린샷이 없으면 캡처 (최초 접속 시)
     */
    async captureScreenshotIfMissing() {
        try {
            const projectId = this.modules.projectLoader.getProjectId();
            if (!projectId) return;

            // API를 통해 스크린샷 존재 확인 (404 에러 방지)
            const response = await fetch(`/api/projects/${projectId}/screenshot-exists`);
            if (!response.ok) return;

            const { exists } = await response.json();

            // 스크린샷이 없으면 캡처
            if (!exists) {
                // 약간의 지연 후 캡처 (iframe 렌더링 안정화)
                setTimeout(() => this.captureScreenshot(), 1000);
            }
        } catch (err) {
            // 네트워크 오류 시에도 스크린샷 캡처 시도
            setTimeout(() => this.captureScreenshot(), 1000);
        }
    }

    /**
     * Rename a version
     */
    async renameVersion(folder, newMessage) {
        try {
            const projectId = this.modules.projectLoader.getProjectIdFromUrl();
            const response = await fetch(`/api/projects/${projectId}/versions/${folder}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: newMessage })
            });

            if (response.ok) {
                await this.modules.version?.loadVersions();
                this.modules.ui.showSuccess('Version renamed');
            } else {
                throw new Error('Failed to rename version');
            }
        } catch (err) {
            console.error('Error renaming version:', err);
            this.modules.ui.showError('Failed to rename version');
        }
    }

    getModule(name) {
        return this.modules[name];
    }

    getAllModules() {
        return this.modules;
    }

    /**
     * 특정 요소로 즉시 스크롤 (새로고침 없이)
     * @param {string} selector - CSS 선택자
     */
    scrollToElement(selector) {
        if (!selector) return;

        try {
            const doc = this.modules.preview.getDocument();
            if (!doc) return;

            const element = doc.querySelector(selector);
            if (element) {
                element.scrollIntoView({
                    behavior: 'instant',
                    block: 'center',
                    inline: 'center'
                });
                console.log('[EditorApp] 📍 Scrolled to element:', selector);
            } else {
                console.warn('[EditorApp] ⚠️ Element not found for scroll:', selector);
            }
        } catch (err) {
            console.error('[EditorApp] ❌ Scroll error:', err);
        }
    }

    /**
     * iframe 로드 후 특정 요소로 스크롤
     * @param {string} selector - CSS 선택자
     */
    scrollToElementAfterLoad(selector) {
        if (!selector) return;

        // preview:loaded 이벤트를 한 번만 리스닝
        const onLoaded = () => {
            this.modules.preview.off('preview:loaded', onLoaded);
            this.scrollToElement(selector);
        };

        this.modules.preview.on('preview:loaded', onLoaded);
    }

    /**
     * Setup preview vertical resize handle for adjusting preview height
     */
    setupPreviewVerticalResize() {
        const resizeHandle = document.getElementById('previewVerticalResizeHandle');
        const previewPanel = document.querySelector('.preview-panel');

        if (!resizeHandle || !previewPanel) return;

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = previewPanel.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - startY;
            const newHeight = Math.min(Math.max(200, startHeight + deltaY), window.innerHeight - 100);
            previewPanel.style.height = `${newHeight}px`;
            previewPanel.style.flex = 'none'; // Override flex behavior when manually resized
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    destroy() {
        Object.values(this.modules).forEach(module => {
            if (module && typeof module.removeAllListeners === 'function') {
                module.removeAllListeners();
            }
        });
        this.modules = {};
        this.initialized = false;
        this.emit('app:destroyed');
    }
}

export default EditorApp;
