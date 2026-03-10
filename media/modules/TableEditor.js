import EventEmitter from './EventEmitter.js';

/**
 * TableEditor - 표(테이블) 편집 모듈
 * 테이블 선택 시 행/열 추가/삭제, 셀 병합 등의 기능을 제공합니다.
 */
class TableEditor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.previewFrame = null;
        this.undoRedoManager = options.undoRedoManager;
        this.selectionManager = options.selectionManager;
        this.uiHelper = options.uiHelper;

        this.selectedTable = null;
        this.selectedCells = [];
        this.isSelecting = false;
        this.startCell = null;

        // Toolbar element
        this.toolbar = null;
        this.isToolbarVisible = false;

        // Cell selection mode - true when user has entered cell selection mode
        // First click on table = table selection (overlay visible)
        // Second click (or click on already selected table) = cell selection mode
        this.cellSelectionMode = false;

        // Track event listeners for cleanup
        this._tableClickHandler = null;
        this._tableMousedownHandler = null;
        this._tableDblclickHandler = null;
        this._docMousemoveHandler = null;
        this._docMouseupHandler = null;

        // Cell editing state
        this.editingCell = null;

        // Column resize state
        this.isResizingColumn = false;
        this.resizeColumnIndex = -1;
        this.resizeStartX = 0;
        this.resizeStartWidth = 0;
        this.resizeTargetCell = null;

        // MultiCanvasManager 참조 (zoom, pan 정보)
        this.multiCanvasManager = null;
    }

    init(previewFrame) {
        this.previewFrame = previewFrame;
        this.createToolbar();
        this.injectResizeStyles();
    }

    /**
     * MultiCanvasManager 설정
     */
    setMultiCanvasManager(manager) {
        this.multiCanvasManager = manager;
    }

    /**
     * 현재 zoom 레벨 가져오기
     */
    _getZoom() {
        // 1. MultiCanvasManager에서 가져오기 (멀티뷰)
        if (this.multiCanvasManager?.zoomManager?.zoomLevel) {
            return this.multiCanvasManager.zoomManager.zoomLevel;
        }

        // 2. 멀티 캔버스 컨테이너의 transform에서 가져오기
        const multiContainer = document.querySelector('.multi-canvas-container');
        if (multiContainer?.style.transform) {
            const scaleMatch = multiContainer.style.transform.match(/scale\(([^)]+)\)/);
            if (scaleMatch) return parseFloat(scaleMatch[1]);
        }

        // 3. 테이블이 속한 iframe의 transform에서 가져오기
        if (this.selectedTable) {
            const tableDoc = this.selectedTable.ownerDocument;
            const iframe = this._findIframeForDocument(tableDoc);
            if (iframe?.style.transform) {
                const scaleMatch = iframe.style.transform.match(/scale\(([^)]+)\)/);
                if (scaleMatch) return parseFloat(scaleMatch[1]);
            }
        }

        // 4. previewFrame transform에서 가져오기 (싱글뷰 fallback)
        if (this.previewFrame?.style.transform) {
            const scaleMatch = this.previewFrame.style.transform.match(/scale\(([^)]+)\)/);
            if (scaleMatch) return parseFloat(scaleMatch[1]);
        }

        return 1;
    }

    /**
     * 화면 좌표를 iframe 내부 좌표로 변환
     * @param {number} screenX - 화면 X 좌표
     * @param {number} screenY - 화면 Y 좌표
     * @returns {{x: number, y: number}} iframe 내부 좌표
     */
    _screenToIframeCoords(screenX, screenY) {
        const iframe = this.previewFrame;
        if (!iframe) return { x: screenX, y: screenY };

        const iframeRect = iframe.getBoundingClientRect();
        const zoom = this._getZoom();

        // 화면 좌표에서 iframe 위치를 빼고 zoom으로 나눔
        const x = (screenX - iframeRect.left) / zoom;
        const y = (screenY - iframeRect.top) / zoom;

        return { x, y };
    }

    /**
     * Create floating table editor toolbar
     */
    createToolbar() {
        // Remove existing toolbar if any
        if (this.toolbar) {
            this.toolbar.remove();
        }

        this.toolbar = document.createElement('div');
        this.toolbar.className = 'table-editor-toolbar';
        this.toolbar.innerHTML = `
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">행</span>
                <button class="table-btn" data-action="addRowAbove" title="위에 행 추가">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                </button>
                <button class="table-btn" data-action="addRowBelow" title="아래에 행 추가">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12l7 7 7-7"/>
                    </svg>
                </button>
                <button class="table-btn table-btn-danger" data-action="deleteRow" title="행 삭제">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                    </svg>
                </button>
            </div>
            <div class="table-toolbar-divider"></div>
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">열</span>
                <button class="table-btn" data-action="addColLeft" title="왼쪽에 열 추가">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 5l-7 7 7 7"/>
                    </svg>
                </button>
                <button class="table-btn" data-action="addColRight" title="오른쪽에 열 추가">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
                <button class="table-btn table-btn-danger" data-action="deleteCol" title="열 삭제">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                    </svg>
                </button>
            </div>
            <div class="table-toolbar-divider"></div>
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">셀</span>
                <button class="table-btn" data-action="mergeCells" title="셀 병합">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M9 3v18M3 9h18"/>
                    </svg>
                </button>
                <button class="table-btn" data-action="splitCell" title="셀 분할">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M12 3v18M3 12h18"/>
                    </svg>
                </button>
            </div>
            <div class="table-toolbar-divider"></div>
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">배경</span>
                <div class="table-color-wrapper">
                    <input type="color" class="table-color-input" data-action="cellBgColor" title="셀 배경색" value="#ffffff">
                    <svg class="table-color-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.3"/>
                    </svg>
                </div>
                <button class="table-btn table-btn-small" data-action="clearBgColor" title="배경색 제거">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="table-toolbar-divider"></div>
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">테두리</span>
                <div class="table-color-wrapper">
                    <input type="color" class="table-color-input" data-action="cellBorderColor" title="셀 테두리색" value="#dee2e6">
                    <svg class="table-color-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                    </svg>
                </div>
                <button class="table-btn table-btn-small" data-action="clearBorderColor" title="테두리 제거">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="table-toolbar-divider"></div>
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">너비</span>
                <input type="number" class="table-number-input" data-action="cellWidth" title="셀 너비 (px)" placeholder="px" min="20" max="1000">
            </div>
            <div class="table-toolbar-divider"></div>
            <div class="table-toolbar-section">
                <span class="table-toolbar-label">헤더</span>
                <button class="table-btn" data-action="toggleHeader" title="헤더 행 토글">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M3 9h18"/>
                    </svg>
                </button>
            </div>
        `;

        document.body.appendChild(this.toolbar);
        this.setupToolbarEvents();
    }

    /**
     * Setup toolbar button events
     */
    setupToolbarEvents() {
        // 버튼 클릭 전에 선택 상태 저장 (mousedown이 click보다 먼저 발생)
        this._savedCellsForAction = null;

        this.toolbar.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('.table-btn');
            if (btn && this.selectedCells.length > 0) {
                this._savedCellsForAction = [...this.selectedCells];
            }
        });

        this.toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.table-btn');
            if (!btn) return;

            // 저장된 선택 상태 복원 (클릭 시 focus 이동으로 선택이 해제될 수 있음)
            if (this._savedCellsForAction && this._savedCellsForAction.length > 0) {
                const validCells = this._savedCellsForAction.filter(cell =>
                    cell && cell.parentNode && this.selectedTable?.contains(cell)
                );
                if (validCells.length > 0 && this.selectedCells.length === 0) {
                    this.selectedCells = validCells;
                }
            }

            const action = btn.dataset.action;
            this.executeAction(action);

            // 자체 선택 관리 액션은 setTimeout 하이라이트 제외
            const managesOwnSelection = ['mergeCells', 'toggleHeader'];
            if (!managesOwnSelection.includes(action)) {
                // 액션 실행 후 선택 상태 강제 유지
                // setTimeout으로 DOM 업데이트 완료 후 실행
                setTimeout(() => {
                    if (this.selectedCells.length > 0) {
                        this.highlightSelectedCells();
                    }
                }, 0);
            }
            this._savedCellsForAction = null;
        });

        // Color picker change
        // 컬러피커 사용 중 셀 선택 상태 유지를 위한 저장 변수
        this._colorPickerSavedCells = null;

        this.toolbar.querySelectorAll('.table-color-input').forEach(input => {
            // mousedown에서 선택 상태 저장 (focus보다 먼저 발생, iframe focus 유실 전)
            input.addEventListener('mousedown', () => {
                if (this.selectedCells.length > 0) {
                    this._colorPickerSavedCells = [...this.selectedCells];
                }
            });

            // 컬러피커 닫힐 때 선택 상태 복원
            input.addEventListener('blur', () => {
                // 약간의 지연 후 복원 (색상 적용 완료 후)
                setTimeout(() => {
                    if (this._colorPickerSavedCells && this._colorPickerSavedCells.length > 0) {
                        // 저장된 셀이 아직 유효하면 복원
                        const validCells = this._colorPickerSavedCells.filter(cell =>
                            cell && cell.parentNode && this.selectedTable?.contains(cell)
                        );
                        if (validCells.length > 0) {
                            this.selectedCells = validCells;
                            this.highlightSelectedCells();
                        }
                    }
                    this._colorPickerSavedCells = null;
                }, 50);
            });

            input.addEventListener('change', (e) => {
                const action = e.target.dataset.action;
                // 저장된 셀이 있으면 사용, 없으면 현재 선택된 셀 사용
                const cellsToUse = this._colorPickerSavedCells || this.selectedCells;
                if (cellsToUse.length > 0) {
                    this._applyColorToSpecificCells(action, e.target.value, cellsToUse);
                }
            });

            // Also update on input for live preview
            input.addEventListener('input', (e) => {
                const action = e.target.dataset.action;
                // 저장된 셀이 있으면 사용, 없으면 현재 선택된 셀 사용
                const cellsToUse = this._colorPickerSavedCells || this.selectedCells;
                if (cellsToUse.length > 0) {
                    this._applyColorToSpecificCells(action, e.target.value, cellsToUse);
                }
            });
        });

        // Number input change
        this.toolbar.querySelectorAll('.table-number-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const action = e.target.dataset.action;
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                    this.executeAction(action, value);
                }
            });
        });

        // Prevent toolbar from stealing focus
        this.toolbar.addEventListener('mousedown', (e) => {
            // Allow color picker and number input
            if (e.target.type === 'color' || e.target.type === 'number') {
                return;
            }
            e.preventDefault();
        });
    }

    /**
     * Validate and refresh selected cells (remove deleted cells from array)
     */
    validateSelectedCells() {
        if (!this.selectedTable) {
            this.selectedCells = [];
            return;
        }

        // Filter out cells that are no longer in the DOM
        this.selectedCells = this.selectedCells.filter(cell => {
            return cell && cell.parentNode && this.selectedTable.contains(cell);
        });
    }

    /**
     * Store positions of currently selected cells (before DOM changes)
     */
    storeSelectedCellPositions() {
        if (!this.selectedTable || this.selectedCells.length === 0) {
            return [];
        }

        const cellPositions = [];
        const rows = this._getDirectRows(this.selectedTable);

        this.selectedCells.forEach(cell => {
            const row = cell.closest('tr');
            if (!row) return;

            const rowIndex = rows.indexOf(row);
            const colIndex = this.getCellIndex(cell);

            if (rowIndex >= 0 && colIndex >= 0) {
                cellPositions.push({ rowIndex, colIndex });
            }
        });

        return cellPositions;
    }

    /**
     * Restore cell selection from stored positions (after DOM changes)
     */
    restoreSelectedCellsFromPositions(cellPositions, action = '', actionCell = null) {
        if (!this.selectedTable || !cellPositions || cellPositions.length === 0) {
            return;
        }

        // Get action cell's position to determine where row/col was added
        let actionRowIndex = -1;
        let actionColIndex = -1;

        if (actionCell) {
            const rows = this._getDirectRows(this.selectedTable);
            const actionRow = actionCell.closest('tr');
            if (actionRow) {
                actionRowIndex = rows.indexOf(actionRow);
                actionColIndex = this.getCellIndex(actionCell);

                // Adjust to get the ORIGINAL position (before the add operation)
                // The adjustment logic below expects the pre-add position
                if (action === 'addRowAbove') {
                    actionRowIndex = actionRowIndex - 1;  // Row was added above, so original was 1 less
                }
                if (action === 'addColLeft') {
                    actionColIndex = actionColIndex - 1;  // Column was added left, so original was 1 less
                }
            }
        }

        this.selectedCells = [];
        const rows = this._getDirectRows(this.selectedTable);

        cellPositions.forEach(pos => {
            let adjustedRowIndex = pos.rowIndex;
            let adjustedColIndex = pos.colIndex;

            // Adjust row position based on action
            if (action === 'addRowAbove' && actionRowIndex >= 0) {
                // Row added above - increment if cell was at or below insertion point
                if (pos.rowIndex >= actionRowIndex) {
                    adjustedRowIndex = pos.rowIndex + 1;
                }
            } else if (action === 'addRowBelow' && actionRowIndex >= 0) {
                // Row added below - increment if cell was below insertion point
                if (pos.rowIndex > actionRowIndex) {
                    adjustedRowIndex = pos.rowIndex + 1;
                }
            } else if (action === 'deleteRow' && actionRowIndex >= 0) {
                if (pos.rowIndex === actionRowIndex) {
                    return; // Skip deleted row
                }
                if (pos.rowIndex > actionRowIndex) {
                    adjustedRowIndex = pos.rowIndex - 1;
                }
            }

            // Adjust column position based on action
            if (action === 'addColLeft' && actionColIndex >= 0) {
                // Column added left - increment if cell was at or right of insertion point
                if (pos.colIndex >= actionColIndex) {
                    adjustedColIndex = pos.colIndex + 1;
                }
            } else if (action === 'addColRight' && actionColIndex >= 0) {
                // Column added right - increment if cell was right of insertion point
                if (pos.colIndex > actionColIndex) {
                    adjustedColIndex = pos.colIndex + 1;
                }
            } else if (action === 'deleteCol' && actionColIndex >= 0) {
                if (pos.colIndex === actionColIndex) {
                    return; // Skip deleted column
                }
                if (pos.colIndex > actionColIndex) {
                    adjustedColIndex = pos.colIndex - 1;
                }
            }

            // Find cell at adjusted position
            if (adjustedRowIndex >= 0 && adjustedRowIndex < rows.length) {
                const row = rows[adjustedRowIndex];
                const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                if (adjustedColIndex >= 0 && adjustedColIndex < cells.length) {
                    this.selectedCells.push(cells[adjustedColIndex]);
                }
            }
        });

        this.highlightSelectedCells();
    }

    /**
     * Get valid selected cells count
     */
    getValidSelectedCellsCount() {
        this.validateSelectedCells();
        return this.selectedCells.length;
    }

    /**
     * Get table HTML without selection classes (for saving/undo)
     */
    getCleanTableHTML() {
        if (!this.selectedTable) return '';

        // 선택 관련 클래스 임시 제거
        const selectedCells = this.selectedTable.querySelectorAll('.table-cell-selected');
        const headerSelectedCells = this.selectedTable.querySelectorAll('.table-header-selected');

        selectedCells.forEach(cell => cell.classList.remove('table-cell-selected'));
        headerSelectedCells.forEach(cell => cell.classList.remove('table-header-selected'));

        const cleanHTML = this.selectedTable.outerHTML;

        // 클래스 복원
        selectedCells.forEach(cell => cell.classList.add('table-cell-selected'));
        headerSelectedCells.forEach(cell => cell.classList.add('table-header-selected'));

        return cleanHTML;
    }

    /**
     * Execute table editing action
     */
    executeAction(action, value) {
        if (!this.selectedTable) return;

        // Validate selected cells first
        this.validateSelectedCells();

        const cell = this.getSelectedCell();
        const needsCellSelection = ['addRowAbove', 'addRowBelow', 'deleteRow', 'addColLeft', 'addColRight', 'deleteCol', 'cellBgColor', 'cellBorderColor', 'clearBgColor', 'clearBorderColor', 'cellWidth'];

        if (!cell && needsCellSelection.includes(action)) {
            this.uiHelper?.showToast('셀을 선택해주세요', 'warning');
            return;
        }

        // Record for undo (without selection classes)
        const oldHTML = this.getCleanTableHTML();

        // Store cell positions before DOM changes
        const needsPositionRestore = ['addRowAbove', 'addRowBelow', 'deleteRow', 'addColLeft', 'addColRight', 'deleteCol'];
        let savedPositions = null;
        if (needsPositionRestore.includes(action)) {
            savedPositions = this.storeSelectedCellPositions();
        }

        switch (action) {
            case 'addRowAbove':
                this.addRow(cell, 'above');
                break;
            case 'addRowBelow':
                this.addRow(cell, 'below');
                break;
            case 'deleteRow':
                this.deleteRow(cell);
                break;
            case 'addColLeft':
                this.addColumn(cell, 'left');
                break;
            case 'addColRight':
                this.addColumn(cell, 'right');
                break;
            case 'deleteCol':
                this.deleteColumn(cell);
                break;
            case 'mergeCells':
                this.mergeCells();
                break;
            case 'splitCell':
                this.splitCell(cell);
                break;
            case 'toggleHeader':
                this.toggleHeader();
                break;
            case 'cellBgColor':
                this.setCellBackgroundColor(value);
                break;
            case 'cellBorderColor':
                this.setCellBorderColor(value);
                break;
            case 'clearBgColor':
                this.clearCellBackgroundColor();
                break;
            case 'clearBorderColor':
                this.clearCellBorder();
                break;
            case 'cellWidth':
                this.setCellWidth(value);
                break;
        }

        // Record change for undo/redo (without selection classes)
        const newHTML = this.getCleanTableHTML();
        if (this.undoRedoManager && oldHTML !== newHTML) {
            this.undoRedoManager.recordChange({
                type: 'content',
                element: this.selectedTable,
                oldValue: oldHTML,
                newValue: newHTML
            });
        }

        this.emit('table:modified', { table: this.selectedTable, action });

        // 액션 후 선택된 셀 상태 유지 및 리프레시
        // mergeCells, toggleHeader는 자체적으로 선택을 관리하므로 제외
        const managesOwnSelection = ['mergeCells', 'toggleHeader'];

        if (savedPositions && savedPositions.length > 0) {
            // DOM 변경 작업(행/열 추가/삭제) 후에는 저장된 위치로 셀 참조를 복원
            this.restoreSelectedCellsFromPositions(savedPositions, action, cell);
        } else if (!managesOwnSelection.includes(action)) {
            // 일반 액션(스타일 변경 등)은 기존 선택 유지
            this.validateSelectedCells();
            this.highlightSelectedCells();
        }

        if (this.selectedCells.length > 0) {
            this.emit('cell:selected', { cell: this.selectedCells[0], cells: this.selectedCells });
        }
    }

    /**
     * Get currently selected cell (first one)
     */
    getSelectedCell() {
        this.validateSelectedCells();
        if (this.selectedCells.length > 0) {
            return this.selectedCells[0];
        }
        return null;
    }

    /**
     * Apply color to specific cells (for color picker live preview)
     * @param {string} action - 'cellBgColor' or 'cellBorderColor'
     * @param {string} color - color value
     * @param {Array} cells - array of cells to apply color to
     */
    _applyColorToSpecificCells(action, color, cells) {
        if (!cells || cells.length === 0) return;

        if (action === 'cellBgColor') {
            cells.forEach(cell => {
                if (cell && cell.style) {
                    cell.style.backgroundColor = color;
                }
            });
        } else if (action === 'cellBorderColor') {
            // Ensure table uses border-separate for individual cell borders
            if (this.selectedTable) {
                this.selectedTable.style.borderCollapse = 'separate';
                if (!this.selectedTable.style.borderSpacing) {
                    this.selectedTable.style.borderSpacing = '0';
                }
            }
            cells.forEach(cell => {
                if (cell && cell.style) {
                    cell.style.borderTop = `1px solid ${color}`;
                    cell.style.borderRight = `1px solid ${color}`;
                    cell.style.borderBottom = `1px solid ${color}`;
                    cell.style.borderLeft = `1px solid ${color}`;
                }
            });
        }

        // Emit table modified for undo/redo and save
        this.emit('table:modified', { table: this.selectedTable, action });
    }

    /**
     * Set background color for selected cells
     */
    setCellBackgroundColor(color) {
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) return;

        this.selectedCells.forEach(cell => {
            cell.style.backgroundColor = color;
        });
    }

    /**
     * Clear background color for selected cells
     */
    clearCellBackgroundColor() {
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) return;

        this.selectedCells.forEach(cell => {
            cell.style.backgroundColor = '';
        });
    }

    /**
     * Set border color for selected cells
     */
    setCellBorderColor(color) {
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) return;

        // Ensure table uses border-separate for individual cell borders
        if (this.selectedTable) {
            this.selectedTable.style.borderCollapse = 'separate';
            if (!this.selectedTable.style.borderSpacing) {
                this.selectedTable.style.borderSpacing = '0';
            }
        }

        this.selectedCells.forEach(cell => {
            // Apply border to all four sides individually to avoid collapse issues
            cell.style.borderTop = `1px solid ${color}`;
            cell.style.borderRight = `1px solid ${color}`;
            cell.style.borderBottom = `1px solid ${color}`;
            cell.style.borderLeft = `1px solid ${color}`;
        });
    }

    /**
     * Clear border for selected cells
     */
    clearCellBorder() {
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) return;

        this.selectedCells.forEach(cell => {
            cell.style.border = '';
            cell.style.borderTop = '';
            cell.style.borderRight = '';
            cell.style.borderBottom = '';
            cell.style.borderLeft = '';
            cell.style.borderColor = '';
            cell.style.borderWidth = '';
            cell.style.borderStyle = '';
        });
    }

    /**
     * Set width for selected cells
     */
    setCellWidth(width) {
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) return;

        // Ensure table-layout: fixed for precise column width control
        if (this.selectedTable) {
            this.selectedTable.style.tableLayout = 'fixed';
        }

        // Apply width to all cells in the same column(s)
        const columnIndices = new Set();
        this.selectedCells.forEach(cell => {
            const index = this.getCellIndex(cell);
            if (index >= 0) columnIndices.add(index);
        });

        // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
        const rows = this._getDirectRows(this.selectedTable);
        columnIndices.forEach(colIndex => {
            rows.forEach(row => {
                const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                if (cells[colIndex]) {
                    cells[colIndex].style.width = width + 'px';
                }
            });
        });
    }

    /**
     * Add a new row above or below the current cell
     */
    addRow(cell, position) {
        const VERSION = '[TableEditor v2.3]';
        console.log(VERSION, '=== addRow 시작 ===', position);
        const row = cell.closest('tr');
        if (!row) {
            console.log(VERSION, 'ERROR: row를 찾을 수 없음');
            return;
        }

        // Build grid to understand the table structure with merged cells
        const grid = this.buildTableGrid();
        console.log(VERSION, 'grid 생성됨, length:', grid.length);
        const rows = this._getDirectRows(this.selectedTable);

        if (grid.length === 0) return;

        // 병합된 셀의 경계를 기준으로 행 위치 결정
        const cellBounds = this.getCellBoundaries(cell);
        if (!cellBounds) return;

        // "아래에 행 추가": 병합된 셀의 마지막 행(maxRow) 기준
        // "위에 행 추가": 병합된 셀의 첫 번째 행(minRow) 기준
        const baseRowIndex = position === 'above' ? cellBounds.minRow : cellBounds.maxRow;
        const targetRow = rows[baseRowIndex];
        if (!targetRow) return;

        // Determine how many columns the table has
        const columnCount = grid[0].length;
        console.log(VERSION, 'columnCount:', columnCount, 'baseRowIndex:', baseRowIndex, 'cellBounds:', cellBounds);

        // Create new row element
        const cellDoc = row.ownerDocument;
        const newRow = cellDoc.createElement('tr');

        // Determine the new row's position in the grid
        const newRowIndex = position === 'above' ? baseRowIndex : baseRowIndex + 1;
        console.log(VERSION, 'newRowIndex:', newRowIndex);

        // Track cells we've already extended to avoid extending them multiple times
        const extendedCells = new Set();

        // For each column, check if we need to create a new cell or if a cell spans into this position
        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
            let needsNewCell = true;

            // Check if a cell from above (for 'above') or current row (for 'below') spans into this position
            if (position === 'above') {
                // Check all rows above the base row
                for (let r = 0; r < baseRowIndex; r++) {
                    const cellAtPos = grid[r][colIndex];
                    if (cellAtPos) {
                        const bounds = this.getCellBoundaries(cellAtPos);
                        // If this cell spans down to cover the new row position
                        if (bounds.maxRow >= newRowIndex) {
                            // Only extend if we haven't already extended this cell
                            if (!extendedCells.has(cellAtPos)) {
                                console.log(VERSION, `col${colIndex}: 확장 (above) - bounds:`, bounds);
                                cellAtPos.rowSpan = (bounds.maxRow - bounds.minRow + 2);
                                extendedCells.add(cellAtPos);
                            }
                            needsNewCell = false;
                            break;
                        }
                    }
                }
            } else {
                // For 'below', only extend cells that span BEYOND the base row (병합 셀의 마지막 행)
                for (let r = 0; r <= baseRowIndex; r++) {
                    const cellAtPos = grid[r][colIndex];
                    if (cellAtPos) {
                        const bounds = this.getCellBoundaries(cellAtPos);
                        // Only extend if cell spans PAST the base row (not just to it)
                        if (bounds.maxRow > baseRowIndex) {
                            // Only extend if we haven't already extended this cell
                            if (!extendedCells.has(cellAtPos)) {
                                console.log(VERSION, `col${colIndex}: 확장 (below) - bounds:`, bounds);
                                cellAtPos.rowSpan = (bounds.maxRow - bounds.minRow + 2);
                                extendedCells.add(cellAtPos);
                            }
                            needsNewCell = false;
                            break;
                        }
                    }
                }
            }

            console.log(VERSION, `col${colIndex}: needsNewCell =`, needsNewCell);

            // Create a new cell if needed
            if (needsNewCell) {
                // Use the same cell type as the target row
                const referenceCells = Array.from(targetRow.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                const tagName = referenceCells.length > 0 ? referenceCells[0].tagName.toLowerCase() : 'td';
                const newCell = cellDoc.createElement(tagName);
                newCell.textContent = '';

                // Copy basic styles from reference
                if (referenceCells.length > 0) {
                    const cellWin = cellDoc.defaultView || window;
                    const computedStyle = cellWin.getComputedStyle(referenceCells[0]);
                    newCell.style.padding = computedStyle.padding;
                    newCell.style.border = computedStyle.border;
                    newCell.style.textAlign = computedStyle.textAlign;
                }

                newRow.appendChild(newCell);
            }
        }

        // Insert the new row at the correct position based on merged cell boundaries
        console.log(VERSION, 'newRow에 추가된 셀 개수:', newRow.children.length);
        console.log(VERSION, 'targetRow.parentNode:', targetRow.parentNode.tagName);

        if (position === 'above') {
            targetRow.parentNode.insertBefore(newRow, targetRow);
            console.log(VERSION, '행이 위에 삽입됨 (baseRowIndex:', baseRowIndex, ')');
        } else {
            targetRow.parentNode.insertBefore(newRow, targetRow.nextSibling);
            console.log(VERSION, '행이 아래에 삽입됨 (baseRowIndex:', baseRowIndex, ')');
        }

        console.log(VERSION, '=== addRow 완료 ===');
        this.uiHelper?.showToast('행이 추가되었습니다', 'success');
    }

    /**
     * Delete the row containing the current cell
     */
    deleteRow(cell) {
        const row = cell.closest('tr');
        if (!row) return;

        // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
        const allRows = this._getDirectRows(this.selectedTable);

        if (allRows.length <= 1) {
            this.uiHelper?.showToast('마지막 행은 삭제할 수 없습니다', 'warning');
            return;
        }

        // Clear selection before removing
        this.selectedCells = this.selectedCells.filter(c => !row.contains(c));

        row.remove();

        // Validate and refresh selection
        this.validateSelectedCells();
        this.highlightSelectedCells();

        this.uiHelper?.showToast('행이 삭제되었습니다', 'success');
    }

    /**
     * Add a new column to the left or right of the current cell
     */
    addColumn(cell, position) {
        const VERSION = '[TableEditor v2.3]';
        console.log(VERSION, '=== addColumn 시작 ===', position);
        // Build grid to understand the table structure with merged cells
        const grid = this.buildTableGrid();
        console.log(VERSION, 'grid 생성됨, length:', grid.length);
        if (grid.length === 0) return;

        const rows = this._getDirectRows(this.selectedTable);

        // 병합된 셀의 경계를 기준으로 열 위치 결정
        const cellBounds = this.getCellBoundaries(cell);
        if (!cellBounds) return;

        // "오른쪽에 열 추가": 병합된 셀의 마지막 열(maxCol) 기준
        // "왼쪽에 열 추가": 병합된 셀의 첫 번째 열(minCol) 기준
        const baseColIndex = position === 'left' ? cellBounds.minCol : cellBounds.maxCol;

        // Determine the new column position
        const newColIndex = position === 'left' ? baseColIndex : baseColIndex + 1;
        console.log(VERSION, 'baseColIndex:', baseColIndex, 'newColIndex:', newColIndex, 'cellBounds:', cellBounds);

        // Track cells we've already extended to avoid extending them multiple times
        const extendedCells = new Set();

        // For each row, check if we need to add a new cell
        rows.forEach((row, rIdx) => {
            let needsNewCell = true;
            let insertBeforeCell = null;

            // Check if a cell from the left spans into this column position
            if (position === 'left') {
                // Check all columns to the left of the base column
                for (let c = 0; c < baseColIndex; c++) {
                    const cellAtPos = grid[rIdx][c];
                    if (cellAtPos) {
                        const bounds = this.getCellBoundaries(cellAtPos);
                        // If this cell spans right to cover the new column position
                        if (bounds.maxCol >= newColIndex) {
                            // Only extend if we haven't already extended this cell
                            if (!extendedCells.has(cellAtPos)) {
                                console.log(VERSION, `row${rIdx}: 확장 (left) - bounds:`, bounds);
                                cellAtPos.colSpan = (bounds.maxCol - bounds.minCol + 2);
                                extendedCells.add(cellAtPos);
                            }
                            needsNewCell = false;
                            break;
                        }
                    }
                }
                // Find the first cell in this row that starts at or after baseColIndex
                // (병합된 셀은 다른 행에 있을 수 있으므로, 실제 이 행의 DOM 셀을 찾아야 함)
                const rowCells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                for (const c of rowCells) {
                    const bounds = this.getCellBoundaries(c);
                    if (bounds && bounds.minCol >= baseColIndex) {
                        insertBeforeCell = c;
                        break;
                    }
                }
            } else {
                // For 'right', only extend cells that span BEYOND the base column (병합 셀의 마지막 열)
                for (let c = 0; c <= baseColIndex; c++) {
                    const cellAtPos = grid[rIdx][c];
                    if (cellAtPos) {
                        const bounds = this.getCellBoundaries(cellAtPos);
                        // Only extend if cell spans PAST the base column (not just to it)
                        if (bounds.maxCol > baseColIndex) {
                            // Only extend if we haven't already extended this cell
                            if (!extendedCells.has(cellAtPos)) {
                                console.log(VERSION, `row${rIdx}: 확장 (right) - bounds:`, bounds);
                                cellAtPos.colSpan = (bounds.maxCol - bounds.minCol + 2);
                                extendedCells.add(cellAtPos);
                            }
                            needsNewCell = false;
                            break;
                        }
                    }
                }
                // Find the first cell in this row that starts after baseColIndex
                // (병합된 셀의 nextElementSibling은 다른 행의 셀일 수 있으므로, 실제 이 행의 DOM 셀을 찾아야 함)
                const rowCells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                for (const c of rowCells) {
                    const bounds = this.getCellBoundaries(c);
                    if (bounds && bounds.minCol > baseColIndex) {
                        insertBeforeCell = c;
                        break;
                    }
                }
            }

            console.log(VERSION, `row${rIdx}: needsNewCell =`, needsNewCell);

            // Create a new cell if needed
            if (needsNewCell) {
                const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                const referenceCell = cells.length > 0 ? cells[0] : null;

                // cell이 속한 document 사용
                const cellDoc = row.ownerDocument;
                const tagName = referenceCell ? referenceCell.tagName.toLowerCase() : 'td';
                const newCell = cellDoc.createElement(tagName);
                newCell.textContent = '';

                // Copy basic styles from reference
                if (referenceCell) {
                    const cellWin = cellDoc.defaultView || window;
                    const computedStyle = cellWin.getComputedStyle(referenceCell);
                    newCell.style.padding = computedStyle.padding;
                    newCell.style.border = computedStyle.border;
                    newCell.style.textAlign = computedStyle.textAlign;
                }

                // Insert the new cell
                if (insertBeforeCell && insertBeforeCell.parentNode === row) {
                    row.insertBefore(newCell, insertBeforeCell);
                } else {
                    row.appendChild(newCell);
                }
            }
        });

        console.log(VERSION, '=== addColumn 완료 ===');
        this.uiHelper?.showToast('열이 추가되었습니다', 'success');
    }

    /**
     * Delete the column containing the current cell
     */
    deleteColumn(cell) {
        const cellIndex = this.getCellIndex(cell);
        if (cellIndex === -1) return;

        // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
        const rows = this._getDirectRows(this.selectedTable);
        const firstRow = rows[0];
        const firstRowCells = firstRow ? Array.from(firstRow.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH') : [];
        const cellCount = firstRowCells.length;

        if (cellCount <= 1) {
            this.uiHelper?.showToast('마지막 열은 삭제할 수 없습니다', 'warning');
            return;
        }

        // Collect cells to delete
        const cellsToDelete = [];
        rows.forEach(row => {
            const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
            const targetCell = cells[cellIndex];
            if (targetCell) {
                cellsToDelete.push(targetCell);
            }
        });

        // Remove from selection
        this.selectedCells = this.selectedCells.filter(c => !cellsToDelete.includes(c));

        // Delete cells
        cellsToDelete.forEach(c => c.remove());

        // Validate and refresh selection
        this.validateSelectedCells();
        this.highlightSelectedCells();

        this.uiHelper?.showToast('열이 삭제되었습니다', 'success');
    }

    /**
     * Get the column index of a cell (direct children only, excluding nested tables)
     */
    getCellIndex(cell) {
        if (!cell) return -1;
        const row = cell.closest('tr');
        if (!row) return -1;

        // 직접 자식 셀만 확인 (중첩 테이블 셀 제외)
        const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        return cells.indexOf(cell);
    }

    /**
     * Build a logical grid map of the table
     * Returns a map where grid[row][col] = cell element
     * Accounts for rowspan and colspan
     */
    buildTableGrid() {
        const rows = this._getDirectRows(this.selectedTable);
        const grid = [];

        // Initialize grid
        rows.forEach(() => grid.push([]));

        // Fill grid with cells
        rows.forEach((row, rowIndex) => {
            const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
            let colIndex = 0;

            cells.forEach(cell => {
                // Find next available column in this row
                while (grid[rowIndex][colIndex]) {
                    colIndex++;
                }

                const rowspan = parseInt(cell.rowSpan) || 1;
                const colspan = parseInt(cell.colSpan) || 1;

                // Fill grid for this cell's span
                for (let r = 0; r < rowspan && rowIndex + r < rows.length; r++) {
                    for (let c = 0; c < colspan; c++) {
                        grid[rowIndex + r][colIndex + c] = cell;
                    }
                }

                colIndex += colspan;
            });
        });

        return grid;
    }

    /**
     * Get actual cell boundaries considering rowspan and colspan
     */
    getCellBoundaries(cell) {
        if (!cell || !this.selectedTable) return null;

        const grid = this.buildTableGrid();
        let minRow = Infinity, maxRow = -1;
        let minCol = Infinity, maxCol = -1;

        // Find all positions where this cell appears in the grid
        grid.forEach((row, rowIndex) => {
            row.forEach((gridCell, colIndex) => {
                if (gridCell === cell) {
                    minRow = Math.min(minRow, rowIndex);
                    maxRow = Math.max(maxRow, rowIndex);
                    minCol = Math.min(minCol, colIndex);
                    maxCol = Math.max(maxCol, colIndex);
                }
            });
        });

        if (minRow === Infinity) return null;

        return { minRow, maxRow, minCol, maxCol };
    }

    /**
     * Merge selected cells
     */
    mergeCells() {
        this.validateSelectedCells();

        if (this.selectedCells.length < 2) {
            this.uiHelper?.showToast('병합할 셀을 2개 이상 선택해주세요', 'warning');
            return;
        }

        // Get bounding box of selected cells
        const bounds = this.getSelectionBounds();
        if (!bounds) return;

        const { minRow, maxRow, minCol, maxCol } = bounds;
        const rowspan = maxRow - minRow + 1;
        const colspan = maxCol - minCol + 1;

        // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
        const rows = this._getDirectRows(this.selectedTable);
        const rowCells = Array.from(rows[minRow].children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        const firstCell = rowCells[minCol];

        if (!firstCell) return;

        // Collect content from all cells
        let content = [];
        for (let r = minRow; r <= maxRow; r++) {
            const currentRowCells = Array.from(rows[r].children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
            for (let c = minCol; c <= maxCol; c++) {
                const cell = currentRowCells[c];
                if (cell && cell.textContent.trim()) {
                    content.push(cell.textContent.trim());
                }
            }
        }

        // Set rowspan and colspan on first cell
        if (rowspan > 1) firstCell.rowSpan = rowspan;
        if (colspan > 1) firstCell.colSpan = colspan;
        firstCell.textContent = content.join(' ');

        // Remove other cells
        for (let r = minRow; r <= maxRow; r++) {
            const currentRowCells = Array.from(rows[r].children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
            for (let c = minCol; c <= maxCol; c++) {
                if (r === minRow && c === minCol) continue;
                const cell = currentRowCells[c];
                if (cell) cell.remove();
            }
        }

        this.selectedCells = [firstCell];
        this.highlightSelectedCells();
        this.uiHelper?.showToast('셀이 병합되었습니다', 'success');
    }

    /**
     * Split a merged cell
     */
    splitCell(cell) {
        if (!cell) return;

        const rowspan = cell.rowSpan || 1;
        const colspan = cell.colSpan || 1;

        if (rowspan === 1 && colspan === 1) {
            this.uiHelper?.showToast('분할할 수 있는 병합된 셀이 아닙니다', 'warning');
            return;
        }

        const row = cell.closest('tr');
        // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
        const rows = this._getDirectRows(this.selectedTable);
        const rowIndex = rows.indexOf(row);
        const cellIndex = this.getCellIndex(cell);

        // Reset the cell
        const content = cell.textContent;
        cell.removeAttribute('rowspan');
        cell.removeAttribute('colspan');

        // Add extra cells in the same row
        // cell이 속한 document 사용
        const cellDoc = cell.ownerDocument;
        for (let c = 1; c < colspan; c++) {
            const newCell = cellDoc.createElement(cell.tagName.toLowerCase());
            newCell.style.cssText = cell.style.cssText;
            cell.parentNode.insertBefore(newCell, cell.nextSibling);
        }

        // Add cells in rows below
        for (let r = 1; r < rowspan; r++) {
            const targetRow = rows[rowIndex + r];
            if (!targetRow) continue;

            for (let c = 0; c < colspan; c++) {
                const newCell = cellDoc.createElement(cell.tagName.toLowerCase());
                newCell.style.cssText = cell.style.cssText;

                // 직접 자식 셀만 가져오기 (중첩 테이블 제외)
                const existingCells = Array.from(targetRow.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH');
                if (existingCells[cellIndex]) {
                    targetRow.insertBefore(newCell, existingCells[cellIndex]);
                } else {
                    targetRow.appendChild(newCell);
                }
            }
        }

        this.uiHelper?.showToast('셀이 분할되었습니다', 'success');
    }

    /**
     * Toggle header for selected cells (td ↔ th)
     */
    toggleHeader() {
        if (!this.selectedTable) return;
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) {
            this.uiHelper?.showToast('셀을 선택해주세요', 'warning');
            return;
        }

        const tableDoc = this.selectedTable.ownerDocument;

        // 모든 선택된 셀이 헤더인지 확인
        const allHeaders = this.selectedCells.every(cell => cell.tagName === 'TH');

        this.selectedCells.forEach(cell => {
            const isHeader = cell.tagName === 'TH';
            const newTag = allHeaders ? 'td' : 'th'; // 모두 헤더면 td로, 아니면 th로

            if ((allHeaders && isHeader) || (!allHeaders && !isHeader)) {
                // 변환 필요
                const newCell = tableDoc.createElement(newTag);
                newCell.innerHTML = cell.innerHTML;
                newCell.style.cssText = cell.style.cssText;

                // 속성 복사 (colspan, rowspan 등)
                Array.from(cell.attributes).forEach(attr => {
                    if (attr.name !== 'class') {
                        newCell.setAttribute(attr.name, attr.value);
                    }
                });

                cell.replaceWith(newCell);
            }
        });

        // 헤더 토글 후 선택 해제
        this.clearCellSelection();

        if (allHeaders) {
            this.uiHelper?.showToast('헤더가 해제되었습니다', 'success');
        } else {
            this.uiHelper?.showToast('헤더가 설정되었습니다', 'success');
        }
    }

    /**
     * Get bounds of selected cells
     */
    getSelectionBounds() {
        this.validateSelectedCells();
        if (this.selectedCells.length === 0) return null;

        // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
        const rows = this._getDirectRows(this.selectedTable);
        let minRow = Infinity, maxRow = -1;
        let minCol = Infinity, maxCol = -1;

        this.selectedCells.forEach(cell => {
            const row = cell.closest('tr');
            if (!row) return;

            const rowIndex = rows.indexOf(row);
            const cellIndex = this.getCellIndex(cell);

            if (rowIndex >= 0 && cellIndex >= 0) {
                minRow = Math.min(minRow, rowIndex);
                maxRow = Math.max(maxRow, rowIndex);
                minCol = Math.min(minCol, cellIndex);
                maxCol = Math.max(maxCol, cellIndex);
            }
        });

        if (minRow === Infinity) return null;

        return { minRow, maxRow, minCol, maxCol };
    }

    /**
     * Show toolbar for the selected table
     */
    showToolbar(table) {
        if (this.selectedTable !== table) {
            // Different table - completely reset previous state
            if (this.selectedTable) {
                // 이전 테이블의 하이라이트 제거 (selectedTable 변경 전에!)
                this.selectedTable.querySelectorAll('.table-cell-selected').forEach(cell => {
                    cell.classList.remove('table-cell-selected');
                });
            }
            this.selectedCells = [];
            this.cellSelectionMode = false;
            this.removeCellSelectionListeners();
            this.removeColumnResizeListeners();
            this.selectedTable = table;
            this.setupColumnResize(table);
            // 테이블 선택 시 바로 셀 선택 핸들러 등록 (첫 클릭부터 드래그 가능)
            this.cellSelectionMode = true;
            this.setupCellSelection(table);
            // 셀 선택 모드 진입 이벤트 발생 (EditorApp에서 오버레이 숨김)
            this.emit('cellSelectionMode:entered', { table });
        } else {
            this.selectedTable = table;
            // 이미 같은 테이블이 선택된 경우에도 오버레이 숨김 유지
            if (this.cellSelectionMode) {
                this.emit('cellSelectionMode:entered', { table });
            }
        }
        this.isToolbarVisible = true;
        this.toolbar.classList.add('visible');
        this.positionToolbar();
    }

    /**
     * Hide the toolbar
     */
    hideToolbar() {
        this.isToolbarVisible = false;
        this.toolbar.classList.remove('visible');
        this.clearCellSelection();
        this.removeCellSelectionListeners();
        this.removeColumnResizeListeners();
        this.selectedTable = null;
        this.cellSelectionMode = false;

        // Emit event so EditorApp can re-enable overlay
        this.emit('table:deselected');
    }

    /**
     * Position toolbar above the table
     */
    positionToolbar() {
        if (!this.selectedTable) return;

        // 테이블이 속한 iframe 찾기
        const tableDoc = this.selectedTable.ownerDocument;
        const iframe = this._findIframeForDocument(tableDoc);
        if (!iframe) return;

        const iframeRect = iframe.getBoundingClientRect();
        const zoom = this._getZoom();

        // Get table position relative to iframe content
        // tableRect is in iframe's internal coordinate system
        const tableRect = this.selectedTable.getBoundingClientRect();

        // Convert to screen coordinates by applying zoom
        const tableScreenLeft = iframeRect.left + tableRect.left * zoom;
        const tableScreenTop = iframeRect.top + tableRect.top * zoom;
        const tableScreenWidth = tableRect.width * zoom;
        const tableScreenBottom = iframeRect.top + (tableRect.top + tableRect.height) * zoom;

        const toolbarRect = this.toolbar.getBoundingClientRect();

        // Position toolbar above the table's screen position
        let top = tableScreenTop - toolbarRect.height - 10;
        let left = tableScreenLeft + (tableScreenWidth / 2) - (toolbarRect.width / 2);

        // Keep within viewport
        if (top < 10) {
            top = tableScreenBottom + 10;
        }
        if (left < 10) left = 10;
        if (left + toolbarRect.width > window.innerWidth - 10) {
            left = window.innerWidth - toolbarRect.width - 10;
        }

        this.toolbar.style.top = `${top}px`;
        this.toolbar.style.left = `${left}px`;
    }

    /**
     * 문서에 해당하는 iframe 찾기
     */
    _findIframeForDocument(doc) {
        if (!doc) return this.previewFrame;

        // 1. previewFrame 확인
        if (this.previewFrame?.contentDocument === doc) {
            return this.previewFrame;
        }

        // 2. 멀티뷰 iframe들 확인
        if (this.multiCanvasManager) {
            const iframes = this.multiCanvasManager.iframes || [];
            for (const iframe of iframes) {
                if (iframe?.contentDocument === doc) {
                    return iframe;
                }
            }
        }

        // 3. DOM에서 모든 iframe 검색 (fallback)
        const allIframes = document.querySelectorAll('iframe');
        for (const iframe of allIframes) {
            try {
                if (iframe.contentDocument === doc) {
                    return iframe;
                }
            } catch (e) {
                // cross-origin iframe 무시
            }
        }

        return this.previewFrame;
    }

    /**
     * Remove cell selection listeners from table
     */
    removeCellSelectionListeners() {
        if (!this.selectedTable) return;

        // selectedTable이 속한 document 사용
        const doc = this.selectedTable.ownerDocument;
        if (!doc) return;

        if (this._tableClickHandler) {
            this.selectedTable.removeEventListener('click', this._tableClickHandler);
        }
        if (this._tableMousedownHandler) {
            this.selectedTable.removeEventListener('mousedown', this._tableMousedownHandler);
        }
        if (this._tableDblclickHandler) {
            this.selectedTable.removeEventListener('dblclick', this._tableDblclickHandler);
        }
        if (this._docMousemoveHandler) {
            doc.removeEventListener('mousemove', this._docMousemoveHandler);
        }
        if (this._docMouseupHandler) {
            doc.removeEventListener('mouseup', this._docMouseupHandler);
        }

        // Remove selecting mode class
        if (this.selectedTable) {
            this.selectedTable.classList.remove('table-selecting-mode');
        }

        // Exit edit mode if active
        this.exitCellEditMode();

        this._tableClickHandler = null;
        this._tableMousedownHandler = null;
        this._tableDblclickHandler = null;
        this._docMousemoveHandler = null;
        this._docMouseupHandler = null;
    }

    /**
     * Setup cell selection within table
     */
    setupCellSelection(table) {
        if (!table) return;

        // Remove previous listeners if any
        this.removeCellSelectionListeners();

        // table이 속한 document 사용 (멀티뷰에서 다른 iframe일 수 있음)
        const doc = table.ownerDocument;
        if (!doc) return;

        // 해당 iframe에 셀 선택 CSS 스타일 주입
        this.injectResizeStyles(doc);

        // Add selecting mode class to prevent text selection
        table.classList.add('table-selecting-mode');

        // Click handler - only for Ctrl/Shift modifiers
        // Normal clicks are handled by mousedown/mouseup
        this._tableClickHandler = (e) => {
            const cell = e.target.closest('td, th');
            if (!cell) return;

            // If clicking on a cell that's in edit mode, don't handle as selection
            if (this.editingCell === cell) {
                return;
            }

            // Exit edit mode if clicking outside editing cell
            if (this.editingCell) {
                this.exitCellEditMode();
            }

            if (e.ctrlKey || e.metaKey) {
                // Multi-select with Ctrl
                this.toggleCellSelection(cell);
                this.updateStyleInputs();
                e.stopPropagation();
            } else if (e.shiftKey && this.selectedCells.length > 0) {
                // Range select with Shift
                this.selectCellRange(this.selectedCells[0], cell);
                this.updateStyleInputs();
                e.stopPropagation();
            }
            // Normal clicks handled by mouseup
        };

        // Double-click handler for text editing
        this._tableDblclickHandler = (e) => {
            const cell = e.target.closest('td, th');
            if (!cell) return;

            // Stop the event from propagating to prevent other handlers
            e.stopPropagation();

            // Don't prevent default - allow browser's native text selection on dblclick
            // Enter edit mode for this cell
            this.enterCellEditMode(cell);
        };

        // Mousedown handler for drag selection
        this._tableMousedownHandler = (e) => {
            const cell = e.target.closest('td, th');
            if (!cell) return;

            // If cell is in edit mode, allow normal text selection
            if (this.editingCell === cell) {
                return;
            }

            // Exit edit mode if clicking outside editing cell
            if (this.editingCell) {
                this.exitCellEditMode();
            }

            // Check if clicking on resize handle area (right edge of cell)
            // 이벤트가 table(iframe 내부)에 등록되어 있으므로 clientX는 이미 iframe 좌표
            const cellRect = cell.getBoundingClientRect();
            const rightEdge = cellRect.right;
            if (rightEdge - e.clientX <= 6 && e.clientX <= rightEdge) {
                // This is a resize operation, not cell selection
                return;
            }

            // Prevent text selection during drag
            e.preventDefault();

            // Clear any text selection that might exist
            const selection = doc.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }

            // Skip if Ctrl or Shift is pressed (handled by click)
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                return;
            }

            // Store startCell BEFORE any selection changes
            this.startCell = cell;
            this.isSelecting = true;
            this.dragMoved = false;
            this.lastDragCell = cell;

            // Select the start cell immediately for visual feedback
            this.clearCellSelection();
            this.selectedCells = [cell];
            this.highlightSelectedCells();
            this.emit('cell:selected', { cell, cells: this.selectedCells });
        };

        // Mousemove handler
        this._docMousemoveHandler = (e) => {
            if (!this.isSelecting || !this.startCell) return;

            // If in edit mode, don't handle as cell selection
            if (this.editingCell) return;

            // Clear any text selection during drag
            const selection = doc.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }

            // 항상 elementFromPoint 사용하여 정확한 셀 감지
            // 이벤트가 iframe doc에 등록되어 있으므로 clientX/clientY는 이미 iframe 좌표
            const elementUnderCursor = doc.elementFromPoint(e.clientX, e.clientY);
            if (!elementUnderCursor) return;

            const cell = elementUnderCursor.closest('td, th');
            if (!cell) return;

            // 같은 테이블 내의 셀인지 확인
            if (cell.closest('table') !== this.selectedTable) return;

            // Only update if we moved to a different cell
            if (cell !== this.lastDragCell) {
                this.lastDragCell = cell;
                this.dragMoved = true;
                // Use stored startCell for range selection
                this.selectCellRangeInternal(this.startCell, cell);
            }
        };

        // Mouseup handler
        this._docMouseupHandler = () => {
            if (this.isSelecting) {
                // Update style inputs and emit event at end of selection
                this.updateStyleInputs();
                if (this.selectedCells.length > 0) {
                    this.emit('cell:selected', { cell: this.selectedCells[0], cells: this.selectedCells });
                }
            }
            this.isSelecting = false;
            this.startCell = null;
            this.lastDragCell = null;
            this.dragMoved = false;
        };

        table.addEventListener('click', this._tableClickHandler);
        table.addEventListener('dblclick', this._tableDblclickHandler);
        table.addEventListener('mousedown', this._tableMousedownHandler);
        doc.addEventListener('mousemove', this._docMousemoveHandler);
        doc.addEventListener('mouseup', this._docMouseupHandler);
    }

    /**
     * Enter cell edit mode (allows text editing)
     */
    enterCellEditMode(cell) {
        if (!cell) return;

        // Exit previous edit mode if any
        this.exitCellEditMode();

        // Keep cell in selected state visually but clear multi-selection
        // Remove other cells from selection, keep only this one
        if (this.selectedTable) {
            this.selectedTable.querySelectorAll('.table-cell-selected').forEach(c => {
                if (c !== cell) {
                    c.classList.remove('table-cell-selected', 'table-header-selected');
                }
            });
        }
        this.selectedCells = [cell];
        cell.classList.add('table-cell-selected');
        // 헤더 셀이면 주황색 오버레이
        if (cell.tagName === 'TH') {
            cell.classList.add('table-header-selected');
        } else {
            cell.classList.remove('table-header-selected');
        }
        this._updateHeaderButtonState(cell.tagName === 'TH');

        // Set up edit mode
        this.editingCell = cell;
        cell.classList.add('table-cell-editing');
        cell.setAttribute('contenteditable', 'true');

        // Remove selecting mode from table to allow text selection
        if (this.selectedTable) {
            this.selectedTable.classList.remove('table-selecting-mode');
        }

        // Emit editstart BEFORE focusing to ensure overlay is hidden
        this.emit('cell:editstart', { cell });

        // Focus the cell - browser's native dblclick selection will handle text selection
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            if (this.editingCell !== cell) return; // Check if still in edit mode

            // cell이 속한 document 사용
            const doc = cell.ownerDocument;
            if (!doc) return;

            // Only focus if not already focused (dblclick may have already focused)
            if (doc.activeElement !== cell) {
                cell.focus();
            }

            // Check if there's already a selection from browser's dblclick
            const selection = doc.getSelection();
            // If no selection or selection is collapsed, select all content
            if (!selection || selection.isCollapsed || selection.toString().length === 0) {
                const range = doc.createRange();
                range.selectNodeContents(cell);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });

        // Listen for blur/escape to exit edit mode
        this._cellEditBlurHandler = (e) => {
            // Small delay to handle click events properly
            setTimeout(() => {
                if (this.editingCell === cell) {
                    this.exitCellEditMode();
                }
            }, 150);
        };

        this._cellEditKeydownHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // Prevent KeyboardManager from handling ESC
                this.exitCellEditMode();
                // Cell selection state is maintained, no need to re-select
            } else if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                this.exitCellEditMode();
                // Move to next/previous cell
                this.moveToAdjacentCell(cell, e.shiftKey ? 'left' : 'right');
            }
        };

        cell.addEventListener('blur', this._cellEditBlurHandler);
        cell.addEventListener('keydown', this._cellEditKeydownHandler);
    }

    /**
     * Exit cell edit mode
     */
    exitCellEditMode() {
        if (!this.editingCell) return;

        const cell = this.editingCell;

        // Remove event listeners
        if (this._cellEditBlurHandler) {
            cell.removeEventListener('blur', this._cellEditBlurHandler);
        }
        if (this._cellEditKeydownHandler) {
            cell.removeEventListener('keydown', this._cellEditKeydownHandler);
        }

        // Remove edit mode styling but keep cell selected
        cell.classList.remove('table-cell-editing');
        cell.removeAttribute('contenteditable');

        // Restore selecting mode on table
        if (this.selectedTable) {
            this.selectedTable.classList.add('table-selecting-mode');
        }

        // Clear text selection (not cell selection)
        const doc = cell.ownerDocument;
        if (doc) {
            const selection = doc.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }
        }

        this._cellEditBlurHandler = null;
        this._cellEditKeydownHandler = null;

        const previousCell = this.editingCell;
        this.editingCell = null;

        this.emit('cell:editend', { cell: previousCell });
        this.emit('table:modified', { table: this.selectedTable, action: 'textEdit' });
    }

    /**
     * Move to adjacent cell (for Tab navigation in edit mode)
     */
    moveToAdjacentCell(cell, direction) {
        if (!cell || !this.selectedTable) return;

        const row = cell.closest('tr');
        if (!row) return;

        const cells = Array.from(row.querySelectorAll('td, th'));
        const currentIndex = cells.indexOf(cell);

        let targetCell = null;

        if (direction === 'right') {
            if (currentIndex < cells.length - 1) {
                targetCell = cells[currentIndex + 1];
            } else {
                // Move to first cell of next row
                const nextRow = row.nextElementSibling;
                if (nextRow) {
                    targetCell = nextRow.querySelector('td, th');
                }
            }
        } else if (direction === 'left') {
            if (currentIndex > 0) {
                targetCell = cells[currentIndex - 1];
            } else {
                // Move to last cell of previous row
                const prevRow = row.previousElementSibling;
                if (prevRow) {
                    const prevCells = prevRow.querySelectorAll('td, th');
                    targetCell = prevCells[prevCells.length - 1];
                }
            }
        }

        if (targetCell) {
            this.selectCell(targetCell);
        }
    }

    /**
     * Update style inputs based on selected cell
     */
    updateStyleInputs() {
        const cell = this.getSelectedCell();
        if (!cell) return;

        const bgColorInput = this.toolbar.querySelector('[data-action="cellBgColor"]');
        const borderColorInput = this.toolbar.querySelector('[data-action="cellBorderColor"]');
        const widthInput = this.toolbar.querySelector('[data-action="cellWidth"]');

        if (bgColorInput) {
            const bgColor = cell.style.backgroundColor || '';
            // Always update - use default white if no color set
            bgColorInput.value = bgColor ? (this.rgbToHex(bgColor) || '#ffffff') : '#ffffff';
        }

        if (borderColorInput) {
            // Check individual border properties too
            const borderColor = cell.style.borderColor || cell.style.borderTopColor || '';
            // Always update - use default gray if no color set
            borderColorInput.value = borderColor ? (this.rgbToHex(borderColor) || '#dee2e6') : '#dee2e6';
        }

        if (widthInput) {
            const width = parseInt(cell.style.width);
            widthInput.value = isNaN(width) ? '' : width;
        }
    }

    /**
     * Convert RGB color to hex
     */
    rgbToHex(rgb) {
        if (!rgb) return null;
        if (rgb.startsWith('#')) return rgb;

        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return null;

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Select a single cell
     */
    selectCell(cell) {
        this.clearCellSelection();
        this.selectedCells = [cell];
        this.highlightSelectedCells();
        this.updateStyleInputs();
        this.emit('cell:selected', { cell, cells: this.selectedCells });
    }

    /**
     * Toggle cell selection (for multi-select)
     */
    toggleCellSelection(cell) {
        const index = this.selectedCells.indexOf(cell);
        if (index > -1) {
            this.selectedCells.splice(index, 1);
        } else {
            this.selectedCells.push(cell);
        }
        this.highlightSelectedCells();
        this.updateStyleInputs();
        this.emit('cell:selected', { cell, cells: this.selectedCells });
    }

    /**
     * Select a range of cells
     */
    selectCellRange(startCell, endCell) {
        this.selectCellRangeInternal(startCell, endCell);
        this.updateStyleInputs();
        this.emit('cell:selected', { cell: this.selectedCells[0], cells: this.selectedCells });
    }

    /**
     * Internal method to select a range of cells (without emitting events)
     * Used during drag selection
     */
    selectCellRangeInternal(startCell, endCell) {
        if (!startCell || !endCell || !this.selectedTable) return;

        // 논리적 그리드 기반으로 셀 범위 선택 (병합된 셀 고려)
        const grid = this.buildTableGrid();
        if (grid.length === 0) return;

        // 시작 셀과 끝 셀의 논리적 경계 가져오기
        const startBounds = this.getCellBoundaries(startCell);
        const endBounds = this.getCellBoundaries(endCell);

        if (!startBounds || !endBounds) return;

        // 두 셀의 경계를 포함하는 초기 범위 계산
        let minRow = Math.min(startBounds.minRow, endBounds.minRow);
        let maxRow = Math.max(startBounds.maxRow, endBounds.maxRow);
        let minCol = Math.min(startBounds.minCol, endBounds.minCol);
        let maxCol = Math.max(startBounds.maxCol, endBounds.maxCol);

        // 범위 내 병합된 셀이 부분적으로 걸치면 범위를 확장 (수렴할 때까지 반복)
        let expanded = true;
        while (expanded) {
            expanded = false;
            const checkedCells = new Set();

            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cell = grid[r]?.[c];
                    if (cell && !checkedCells.has(cell)) {
                        checkedCells.add(cell);
                        const bounds = this.getCellBoundaries(cell);
                        if (bounds) {
                            // 셀의 경계가 현재 범위를 벗어나면 확장
                            if (bounds.minRow < minRow) { minRow = bounds.minRow; expanded = true; }
                            if (bounds.maxRow > maxRow) { maxRow = bounds.maxRow; expanded = true; }
                            if (bounds.minCol < minCol) { minCol = bounds.minCol; expanded = true; }
                            if (bounds.maxCol > maxCol) { maxCol = bounds.maxCol; expanded = true; }
                        }
                    }
                }
            }
        }

        // Clear previous selection highlight
        if (this.selectedTable) {
            this.selectedTable.querySelectorAll('.table-cell-selected').forEach(cell => {
                cell.classList.remove('table-cell-selected', 'table-header-selected');
            });
        }
        this.selectedCells = [];

        // 그리드에서 확장된 범위 내 고유 셀들을 수집
        const selectedSet = new Set();
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const cell = grid[r]?.[c];
                if (cell && !selectedSet.has(cell)) {
                    selectedSet.add(cell);
                    this.selectedCells.push(cell);
                }
            }
        }

        // 모든 선택된 셀이 헤더인지 확인 후 클래스 추가
        const allHeaders = this.selectedCells.length > 0 &&
            this.selectedCells.every(cell => cell.tagName === 'TH');

        this.selectedCells.forEach(cell => {
            cell.classList.add('table-cell-selected');
            if (allHeaders) {
                cell.classList.add('table-header-selected');
            }
        });

        // 툴바 헤더 버튼 상태 업데이트
        this._updateHeaderButtonState(allHeaders);
    }

    /**
     * Get direct tr children of a table (excluding nested tables)
     */
    _getDirectRows(table) {
        const rows = [];
        // Check for thead, tbody, tfoot
        const sections = ['thead', 'tbody', 'tfoot'];
        let foundSection = false;

        for (const sectionName of sections) {
            const section = table.querySelector(`:scope > ${sectionName}`);
            if (section) {
                foundSection = true;
                Array.from(section.children).forEach(child => {
                    if (child.tagName === 'TR') {
                        rows.push(child);
                    }
                });
            }
        }

        // If no thead/tbody/tfoot, get direct tr children
        if (!foundSection) {
            Array.from(table.children).forEach(child => {
                if (child.tagName === 'TR') {
                    rows.push(child);
                }
            });
        }

        return rows;
    }

    /**
     * Highlight selected cells
     */
    highlightSelectedCells() {
        // Clear previous highlights
        if (this.selectedTable) {
            this.selectedTable.querySelectorAll('.table-cell-selected').forEach(cell => {
                cell.classList.remove('table-cell-selected', 'table-header-selected');
            });
        }

        // 모든 선택된 셀이 헤더(th)인지 확인
        const allHeaders = this.selectedCells.length > 0 &&
            this.selectedCells.every(cell => cell && cell.tagName === 'TH');

        // Add highlight to currently selected cells
        // Note: validation should be done BEFORE calling this method
        this.selectedCells.forEach(cell => {
            if (cell && cell.classList) {
                cell.classList.add('table-cell-selected');
                // 모든 선택이 헤더일 때만 주황색 오버레이
                if (allHeaders) {
                    cell.classList.add('table-header-selected');
                }
            }
        });

        // 툴바 헤더 버튼 상태 업데이트
        this._updateHeaderButtonState(allHeaders);
    }

    /**
     * Clear cell selection
     */
    clearCellSelection() {
        const hadSelection = this.selectedCells.length > 0;
        if (this.selectedTable) {
            this.selectedTable.querySelectorAll('.table-cell-selected').forEach(cell => {
                cell.classList.remove('table-cell-selected', 'table-header-selected');
            });
        }
        this.selectedCells = [];
        this._updateHeaderButtonState(false);
        if (hadSelection) {
            this.emit('cell:deselected');
        }
    }

    /**
     * Update header button active state in toolbar
     */
    _updateHeaderButtonState(isHeader) {
        const headerBtn = this.toolbar?.querySelector('[data-action="toggleHeader"]');
        if (headerBtn) {
            if (isHeader) {
                headerBtn.classList.add('active');
            } else {
                headerBtn.classList.remove('active');
            }
        }
    }

    /**
     * Check if any cells are selected
     */
    hasCellSelection() {
        this.validateSelectedCells();
        return this.selectedCells.length > 0;
    }

    /**
     * Check if element is a table or inside a table
     */
    isTableElement(element) {
        if (!element) return false;
        return element.tagName === 'TABLE' || element.closest('table');
    }

    /**
     * Get the table element from any table-related element
     */
    getTableFromElement(element) {
        if (!element) return null;
        if (element.tagName === 'TABLE') return element;
        return element.closest('table');
    }

    /**
     * Called when an element is selected in the editor
     * First click on table = table selection (overlay visible, can move/resize)
     * Second click = enters cell selection mode
     */
    onElementSelected(element) {
        const table = this.getTableFromElement(element);

        if (table) {
            if (this.selectedTable !== table) {
                // Different table selected - show toolbar but don't enter cell selection mode yet
                this.hideToolbar(); // Clean up previous table
                this.selectedTable = table;
                this.cellSelectionMode = false;
                this.isToolbarVisible = true;
                this.toolbar.classList.add('visible');
                this.setupColumnResize(table);
                // Don't setup cell selection yet - wait for second click
            }
            this.positionToolbar();
        } else {
            this.hideToolbar();
        }
    }

    /**
     * Enter cell selection mode for the currently selected table
     * Called when user clicks on an already-selected table
     * @param {HTMLElement} clickedCell - The cell that was clicked (optional)
     */
    enterCellSelectionMode(clickedCell = null) {
        if (!this.selectedTable) return;

        // 셀 선택 모드가 아니면 활성화
        if (!this.cellSelectionMode) {
            this.cellSelectionMode = true;
            this.setupCellSelection(this.selectedTable);
        }

        // If a cell was clicked, select it immediately
        if (clickedCell && (clickedCell.tagName === 'TD' || clickedCell.tagName === 'TH')) {
            this.clearCellSelection();
            this.selectedCells = [clickedCell];
            this.highlightSelectedCells();
            this.emit('cell:selected', { cell: clickedCell, cells: this.selectedCells });
        }

        // Emit event so EditorApp can disable the overlay
        this.emit('cellSelectionMode:entered', { table: this.selectedTable });
    }

    /**
     * Exit cell selection mode (back to table selection)
     */
    exitCellSelectionMode() {
        if (!this.cellSelectionMode) return;

        this.cellSelectionMode = false;
        this.clearCellSelection();
        this.removeCellSelectionListeners();
        this.exitCellEditMode();

        // Remove selecting mode class
        if (this.selectedTable) {
            this.selectedTable.classList.remove('table-selecting-mode');
        }

        // Emit event so EditorApp can re-enable the overlay
        this.emit('cellSelectionMode:exited', { table: this.selectedTable });
    }

    /**
     * Update toolbar position (e.g., on scroll or zoom change)
     */
    updatePosition() {
        if (this.isToolbarVisible) {
            this.positionToolbar();
        }
    }

    /**
     * Inject column resize styles into iframe
     * @param {Document} targetDoc - optional document to inject styles into
     */
    injectResizeStyles(targetDoc = null) {
        const doc = targetDoc || this.previewFrame?.contentDocument;
        if (!doc) return;

        // 기존 스타일이 있으면 제거하고 새로 생성 (CSS 업데이트 반영)
        const existingStyle = doc.getElementById('table-resize-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        const style = doc.createElement('style');
        style.id = 'table-resize-styles';
        style.textContent = `
            /* 셀 선택 하이라이트 - ::before로 배경색 오버레이만 (사용자 border 보존) */
            .table-cell-selected::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(102, 126, 234, 0.3);
                pointer-events: none;
                z-index: 9;
            }
            /* 헤더 셀 선택 시 주황색 오버레이 (모든 선택이 헤더일 때만) */
            .table-cell-selected.table-header-selected::before {
                background-color: rgba(234, 156, 102, 0.4);
            }
            /* 셀 선택 모드 */
            .table-selecting-mode {
                user-select: none;
            }
            /* Column resize cursor on cell borders */
            td, th {
                position: relative;
            }
            td::after, th::after {
                content: '';
                position: absolute;
                top: 0;
                right: 0;
                width: 4px;
                height: 100%;
                cursor: col-resize;
                z-index: 10;
            }
            /* Hide resize handle on last cell of each row */
            td:last-child::after, th:last-child::after {
                display: none;
            }
            /* Visual indicator on hover */
            td:hover::after, th:hover::after {
                background: rgba(102, 126, 234, 0.3);
            }
            /* During resize */
            .table-resizing {
                cursor: col-resize !important;
                user-select: none !important;
            }
            .table-resizing * {
                cursor: col-resize !important;
            }
        `;
        doc.head.appendChild(style);
    }

    /**
     * Setup column resize handlers for a table
     */
    setupColumnResize(table) {
        if (!table) return;

        // table이 속한 document 사용 (멀티뷰에서 다른 iframe일 수 있음)
        const doc = table.ownerDocument;
        if (!doc) return;

        // Remove previous handlers if any
        this.removeColumnResizeListeners();

        this._columnResizeMousedownHandler = (e) => {
            const cell = e.target.closest('td, th');
            if (!cell) return;

            // Check if clicking on the right edge (resize handle area)
            // 이벤트가 table(iframe 내부)에 등록되어 있으므로 clientX는 이미 iframe 좌표
            const cellRect = cell.getBoundingClientRect();
            const clickX = e.clientX;
            const rightEdge = cellRect.right;

            // Only start resize if clicking within 4px of right edge (CSS와 동일)
            if (rightEdge - clickX <= 4 && clickX <= rightEdge) {
                e.preventDefault();
                e.stopPropagation();

                this.isResizingColumn = true;
                this.resizeStartX = e.clientX;  // 이미 iframe 좌표
                this.resizeTargetCell = cell;
                this.resizeColumnIndex = this.getCellIndex(cell);
                this.resizeStartWidth = cell.offsetWidth;

                // Get the next column's width for paired resizing
                const row = cell.closest('tr');
                const cells = row.querySelectorAll('td, th');
                const nextCell = cells[this.resizeColumnIndex + 1];
                this.resizeNextColumnWidth = nextCell ? nextCell.offsetWidth : 0;
                this.resizeHasNextColumn = !!nextCell;

                // Ensure table-layout: fixed for precise column width control
                table.style.tableLayout = 'fixed';

                // Add resizing class to body
                doc.body.classList.add('table-resizing');

                // Record initial state for undo
                this._resizeOldHTML = table.outerHTML;
            }
        };

        this._columnResizeMousemoveHandler = (e) => {
            if (!this.isResizingColumn || !this.resizeTargetCell) return;

            e.preventDefault();

            // 이벤트가 doc(iframe 내부)에 등록되어 있으므로 clientX는 이미 iframe 좌표
            const diff = e.clientX - this.resizeStartX;
            const minWidth = 30;

            // Calculate new widths for current and next column
            let newWidth = this.resizeStartWidth + diff;
            let newNextWidth = this.resizeNextColumnWidth - diff;

            // Enforce minimum widths
            if (newWidth < minWidth) {
                newWidth = minWidth;
                newNextWidth = this.resizeStartWidth + this.resizeNextColumnWidth - minWidth;
            }
            if (this.resizeHasNextColumn && newNextWidth < minWidth) {
                newNextWidth = minWidth;
                newWidth = this.resizeStartWidth + this.resizeNextColumnWidth - minWidth;
            }

            // Apply width to all cells in both columns
            // 직접 자식 tr만 가져오기 (중첩 테이블 제외)
            const rows = this._getDirectRows(table);
            rows.forEach(row => {
                const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                // Current column
                if (cells[this.resizeColumnIndex]) {
                    cells[this.resizeColumnIndex].style.width = newWidth + 'px';
                }
                // Next column (paired resizing)
                if (this.resizeHasNextColumn && cells[this.resizeColumnIndex + 1]) {
                    cells[this.resizeColumnIndex + 1].style.width = newNextWidth + 'px';
                }
            });

            // Update width input if visible
            const widthInput = this.toolbar?.querySelector('[data-action="cellWidth"]');
            if (widthInput) {
                widthInput.value = Math.round(newWidth);
            }
        };

        this._columnResizeMouseupHandler = () => {
            if (this.isResizingColumn) {
                // Record change for undo
                if (this.undoRedoManager && this._resizeOldHTML !== table.outerHTML) {
                    this.undoRedoManager.recordChange({
                        type: 'content',
                        element: table,
                        oldValue: this._resizeOldHTML,
                        newValue: table.outerHTML
                    });
                }

                this.emit('table:modified', { table, action: 'columnResize' });
            }

            this.isResizingColumn = false;
            this.resizeTargetCell = null;
            this.resizeColumnIndex = -1;
            this._resizeOldHTML = null;

            doc.body.classList.remove('table-resizing');
        };

        table.addEventListener('mousedown', this._columnResizeMousedownHandler);
        doc.addEventListener('mousemove', this._columnResizeMousemoveHandler);
        doc.addEventListener('mouseup', this._columnResizeMouseupHandler);

        // Store table reference for cleanup
        this._resizeTable = table;
    }

    /**
     * Remove column resize listeners
     */
    removeColumnResizeListeners() {
        if (!this._resizeTable) return;

        // _resizeTable이 속한 document 사용
        const doc = this._resizeTable.ownerDocument;

        if (this._columnResizeMousedownHandler) {
            this._resizeTable.removeEventListener('mousedown', this._columnResizeMousedownHandler);
        }
        if (doc && this._columnResizeMousemoveHandler) {
            doc.removeEventListener('mousemove', this._columnResizeMousemoveHandler);
        }
        if (doc && this._columnResizeMouseupHandler) {
            doc.removeEventListener('mouseup', this._columnResizeMouseupHandler);
        }

        this._columnResizeMousedownHandler = null;
        this._columnResizeMousemoveHandler = null;
        this._columnResizeMouseupHandler = null;
        this._resizeTable = null;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.exitCellEditMode();
        this.removeCellSelectionListeners();
        this.removeColumnResizeListeners();
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
        this.selectedTable = null;
        this.selectedCells = [];
        this.editingCell = null;
    }
}

export default TableEditor;
