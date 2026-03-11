import EventEmitter from './EventEmitter.js';

/**
 * ViewModeManager - Handles responsive viewport modes and breakpoint management
 */
class ViewModeManager extends EventEmitter {
    constructor(previewFrameId) {
        super();
        this.previewFrame = document.getElementById(previewFrameId);
        this.viewModes = document.getElementById('viewModes');
        this.currentView = 'pc';
        this.currentViewWidth = '100%';
        this.zoomManager = null;
        this.targetBreakpoints = new Set(['100%']); // Checked breakpoints for style application
        this.projectId = null;
        this.saveTimeout = null;
        this.isLoadingSettings = false;
        this.customPcWidth = null; // 사용자가 드래그로 설정한 PC 모드 너비 (null이면 기본값 사용)

        this.init();
    }

    /**
     * Set project ID for saving settings
     */
    setProjectId(projectId) {
        this.projectId = projectId;
    }

    /**
     * Set reference to ZoomManager for resize handle control
     */
    setZoomManager(zoomManager) {
        this.zoomManager = zoomManager;
    }

    init() {
        this.setupViewButtons();
        this.setupAddBreakpoint();
        this.setupCheckboxes();
    }

    /**
     * Setup checkbox event listeners for breakpoint targeting
     */
    setupCheckboxes() {
        if (!this.viewModes) return;

        // Initialize targetBreakpoints from checked checkboxes
        this.viewModes.querySelectorAll('.view-checkbox').forEach(checkbox => {
            if (checkbox.checked) {
                this.targetBreakpoints.add(checkbox.dataset.width);
            }
        });

        // Listen for checkbox changes
        this.viewModes.addEventListener('change', (e) => {
            if (e.target.classList.contains('view-checkbox')) {
                const width = e.target.dataset.width;
                if (e.target.checked) {
                    this.targetBreakpoints.add(width);
                } else {
                    this.targetBreakpoints.delete(width);
                }

                // 모든 체크박스가 해제되면 현재 보고 있는 뷰를 활성화
                if (this.targetBreakpoints.size === 0) {
                    const activeBtn = this.viewModes.querySelector('.view-btn.active');
                    if (activeBtn) {
                        const activeWidth = activeBtn.dataset.width;
                        const activeWrapper = activeBtn.closest('.view-btn-wrapper');
                        const activeCheckbox = activeWrapper?.querySelector('.view-checkbox');
                        if (activeCheckbox) {
                            activeCheckbox.checked = true;
                            this.targetBreakpoints.add(activeWidth);
                        }
                    }
                }

                this.emit('breakpoint:targetChanged', {
                    width,
                    checked: e.target.checked,
                    targetBreakpoints: Array.from(this.targetBreakpoints)
                });
            }
        });
    }

    setupViewButtons() {
        if (!this.viewModes) return;

        // 헬퍼: 자신만/전체 활성화 토글 (Ctrl+우클릭, Ctrl+클릭, Alt+클릭, Alt+우클릭)
        // isSelfClick: 이미 active인 버튼을 클릭한 경우 true
        const toggleExclusive = (btn, isSelfClick = false) => {
            const width = btn.dataset.width;
            const allCheckboxes = Array.from(this.viewModes.querySelectorAll('.view-checkbox'));
            const checkedCount = allCheckboxes.filter(cb => cb.checked).length;
            const wrapper = btn.closest('.view-btn-wrapper');
            const currentCheckbox = wrapper?.querySelector('.view-checkbox');

            // 전체 ON 조건: 자신만 체크된 상태에서 "셀프 클릭"한 경우에만
            const isOnlyThisChecked = checkedCount === 1 && currentCheckbox?.checked && isSelfClick;

            if (isOnlyThisChecked) {
                // 전체 활성화
                allCheckboxes.forEach(cb => {
                    cb.checked = true;
                    this.targetBreakpoints.add(cb.dataset.width);
                });
            } else {
                // 자신만 활성화
                allCheckboxes.forEach(cb => {
                    cb.checked = false;
                });
                this.targetBreakpoints.clear();

                if (currentCheckbox) {
                    currentCheckbox.checked = true;
                    this.targetBreakpoints.add(width);
                }
            }

            this.emit('breakpoint:targetChanged', {
                width,
                checked: currentCheckbox?.checked || false,
                targetBreakpoints: Array.from(this.targetBreakpoints)
            });
        };

        // 체크박스 토글 공통 함수
        const toggleCheckbox = (wrapper) => {
            const checkbox = wrapper?.querySelector('.view-checkbox');
            if (!checkbox) return;

            checkbox.checked = !checkbox.checked;
            const width = checkbox.dataset.width;
            if (checkbox.checked) {
                this.targetBreakpoints.add(width);
            } else {
                this.targetBreakpoints.delete(width);
            }

            // 모든 체크박스가 해제되면 현재 보고 있는 뷰를 활성화
            if (this.targetBreakpoints.size === 0) {
                const activeBtn = this.viewModes.querySelector('.view-btn.active');
                if (activeBtn) {
                    const activeWidth = activeBtn.dataset.width;
                    const activeWrapper = activeBtn.closest('.view-btn-wrapper');
                    const activeCheckbox = activeWrapper?.querySelector('.view-checkbox');
                    if (activeCheckbox) {
                        activeCheckbox.checked = true;
                        this.targetBreakpoints.add(activeWidth);
                    }
                }
            }

            this.emit('breakpoint:targetChanged', {
                width,
                checked: checkbox.checked,
                targetBreakpoints: Array.from(this.targetBreakpoints)
            });
        };

        // 헬퍼: 범위 선택 (Shift+클릭)
        // - 범위 내 OFF가 하나라도 있으면 → 범위 내 모두 ON
        // - 범위 내 모두 ON이면 → active 버튼만 ON, 나머지 범위는 OFF
        const selectRange = (targetBtn) => {
            const buttons = Array.from(this.viewModes.querySelectorAll('.view-btn'));
            const activeBtn = this.viewModes.querySelector('.view-btn.active');
            if (!activeBtn) return;

            const activeIdx = buttons.indexOf(activeBtn);
            const targetIdx = buttons.indexOf(targetBtn);
            if (activeIdx === -1 || targetIdx === -1) return;

            const startIdx = Math.min(activeIdx, targetIdx);
            const endIdx = Math.max(activeIdx, targetIdx);

            // 범위 내 체크박스 상태 확인
            let allChecked = true;
            for (let i = startIdx; i <= endIdx; i++) {
                const wrapper = buttons[i].closest('.view-btn-wrapper');
                const checkbox = wrapper?.querySelector('.view-checkbox');
                if (checkbox && !checkbox.checked) {
                    allChecked = false;
                    break;
                }
            }

            if (allChecked) {
                // 모두 ON인 상태 → active 버튼만 ON, 나머지 범위는 OFF
                for (let i = startIdx; i <= endIdx; i++) {
                    if (i === activeIdx) continue; // active 버튼은 건드리지 않음
                    const wrapper = buttons[i].closest('.view-btn-wrapper');
                    const checkbox = wrapper?.querySelector('.view-checkbox');
                    if (checkbox && checkbox.checked) {
                        checkbox.checked = false;
                        this.targetBreakpoints.delete(checkbox.dataset.width);
                    }
                }
            } else {
                // OFF가 하나라도 있음 → 범위 내 모두 ON
                for (let i = startIdx; i <= endIdx; i++) {
                    const wrapper = buttons[i].closest('.view-btn-wrapper');
                    const checkbox = wrapper?.querySelector('.view-checkbox');
                    if (checkbox && !checkbox.checked) {
                        checkbox.checked = true;
                        this.targetBreakpoints.add(checkbox.dataset.width);
                    }
                }
            }

            this.emit('breakpoint:targetChanged', {
                width: targetBtn.dataset.width,
                checked: !allChecked,
                targetBreakpoints: Array.from(this.targetBreakpoints)
            });
        };

        this.viewModes.addEventListener('click', (e) => {
            // 체크 인디케이터 클릭: 버튼과 동일하게 동작
            // - 일반 클릭: viewmode 전환
            // - Ctrl+클릭: 체크박스 토글
            // - Shift+클릭: 범위 선택
            if (e.target.classList.contains('view-check-indicator')) {
                e.stopPropagation();
                const wrapper = e.target.closest('.view-btn-wrapper');
                const btn = wrapper?.querySelector('.view-btn');

                if (e.shiftKey) {
                    // Shift+클릭: 범위 선택
                    e.preventDefault();
                    if (btn) selectRange(btn);
                } else if (e.ctrlKey) {
                    // Ctrl+클릭: 체크박스 토글
                    e.preventDefault();
                    toggleCheckbox(wrapper);
                } else {
                    // 일반 클릭: viewmode 전환
                    if (btn) this.setViewMode(btn, true, true);
                }
                return;
            }

            const wrapper = e.target.closest('.view-btn-wrapper');
            const btn = e.target.closest('.view-btn');
            if (!btn) return;

            // Handle delete button click
            // ★ e.target이 span 내부 텍스트 노드일 수 있으므로 closest() 사용
            // ★ VS Code WebView은 allow-modals가 없어 confirm()이 항상 false → 바로 삭제
            const deleteBtn = e.target.closest?.('.view-delete-btn, .view-remove');
            if (deleteBtn) {
                e.stopPropagation();
                this.removeBreakpoint(wrapper || btn);
                return;
            }

            // Shift+클릭: 범위 선택 (viewmode 변경 없이 체크박스만 ON)
            if (e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                selectRange(btn);
                return;
            }

            // Ctrl+클릭: 해당 버튼의 체크박스 토글
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                toggleCheckbox(wrapper);
                return;
            }

            // Alt+클릭: 자신만/전체 활성화 토글 + 뷰모드 전환
            if (e.altKey) {
                e.preventDefault();
                const isSelfClick = btn.classList.contains('active');
                // 해당 버튼이 active가 아니면 뷰모드 전환도 함께
                if (!isSelfClick) {
                    this.setViewMode(btn, true, true);
                }
                toggleExclusive(btn, isSelfClick);
                return;
            }

            this.setViewMode(btn, true, true);
        });

        // 더블클릭: 체크박스 토글 (우클릭과 동일)
        this.viewModes.addEventListener('dblclick', (e) => {
            const btn = e.target.closest('.view-btn');
            if (!btn) return;
            e.preventDefault();
            const wrapper = btn.closest('.view-btn-wrapper');
            toggleCheckbox(wrapper);
        });

        // Right-click to toggle checkbox, Ctrl/Alt+Right-click to activate only this one
        this.viewModes.addEventListener('contextmenu', (e) => {
            const btn = e.target.closest('.view-btn');
            if (!btn) return;

            e.preventDefault();

            // Ctrl+우클릭 또는 Alt+우클릭: 자신만/전체 활성화 토글 + 뷰모드 전환
            if (e.ctrlKey || e.altKey) {
                const isSelfClick = btn.classList.contains('active');
                // 해당 버튼이 active가 아니면 뷰모드 전환도 함께
                if (!isSelfClick) {
                    this.setViewMode(btn, true, true);
                }
                toggleExclusive(btn, isSelfClick);
                return;
            }

            // 일반 우클릭: 체크박스 토글
            const wrapper = btn.closest('.view-btn-wrapper');
            toggleCheckbox(wrapper);
        });

        // Set initial view
        const activeBtn = this.viewModes.querySelector('.view-btn.active');
        if (activeBtn) {
            this.setViewMode(activeBtn, false);
        }
    }

    setupAddBreakpoint() {
        const addBtn = this.viewModes?.querySelector('.view-add-btn');
        if (!addBtn) return;

        // Create dropdown menu for common breakpoints
        const dropdown = document.createElement('div');
        dropdown.className = 'breakpoint-dropdown hidden';
        dropdown.innerHTML = `
            <div class="breakpoint-option" data-width="1440">1440px (Desktop XL)</div>
            <div class="breakpoint-option" data-width="1280">1280px (Desktop L)</div>
            <div class="breakpoint-option" data-width="1024">1024px (Tablet L)</div>
            <div class="breakpoint-option" data-width="768">768px (Tablet)</div>
            <div class="breakpoint-option" data-width="640">640px (Mobile L)</div>
            <div class="breakpoint-option" data-width="480">480px (Mobile M)</div>
            <div class="breakpoint-option" data-width="375">375px (Mobile S)</div>
            <div class="breakpoint-option" data-width="320">320px (Mobile XS)</div>
        `;

        // Append dropdown to body for fixed positioning
        document.body.appendChild(dropdown);

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');

            // Position dropdown below the add button using fixed positioning
            const btnRect = addBtn.getBoundingClientRect();
            dropdown.style.top = (btnRect.bottom + 4) + 'px';
            dropdown.style.left = btnRect.left + 'px';
        });

        // Handle dropdown option clicks
        dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.breakpoint-option');
            if (option) {
                const width = parseInt(option.dataset.width);
                this.addBreakpoint(width);
                dropdown.classList.add('hidden');
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!addBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }

    /**
     * Set view mode from button click
     * @param {HTMLElement} btn - View mode button
     * @param {boolean} emitEvent - Whether to emit view:changed event
     * @param {boolean} flash - Whether to flash resize handles (only for direct button clicks)
     */
    setViewMode(btn, emitEvent = true, flash = false) {
        if (!btn) return;

        const previewWrapper = document.querySelector('.preview-wrapper');
        const width = btn.dataset.width;
        const view = btn.dataset.view;

        // 이전 활성 버튼 정보
        const prevActiveBtn = this.viewModes.querySelector('.view-btn.active');
        const prevWrapper = prevActiveBtn?.closest('.view-btn-wrapper');
        const prevCheckbox = prevWrapper?.querySelector('.view-checkbox');

        // 새 버튼 정보
        const newWrapper = btn.closest('.view-btn-wrapper');
        const newCheckbox = newWrapper?.querySelector('.view-checkbox');

        // 체크박스 로직
        const allCheckboxes = Array.from(this.viewModes.querySelectorAll('.view-checkbox'));
        const checkedCheckboxes = allCheckboxes.filter(cb => cb.checked);

        // 이전 버튼이 "자신만 ON" 상태였는지 확인
        const prevWasOnlyChecked = checkedCheckboxes.length === 1 &&
            prevCheckbox && prevCheckbox.checked;

        if (prevWasOnlyChecked && newCheckbox && prevCheckbox !== newCheckbox) {
            // 이전 뷰가 자신만 ON → Alt+클릭과 동일 (이전 OFF, 새 ON만)
            prevCheckbox.checked = false;
            this.targetBreakpoints.delete(prevCheckbox.dataset.width);
            newCheckbox.checked = true;
            this.targetBreakpoints.add(newCheckbox.dataset.width);
        } else if (newCheckbox && !newCheckbox.checked) {
            // 새 뷰가 OFF 상태면 ON으로 변경
            newCheckbox.checked = true;
            this.targetBreakpoints.add(newCheckbox.dataset.width);
        }

        // Update active state
        this.viewModes.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.currentView = view;
        this.currentViewWidth = width;

        // Get container for transition
        const container = this.zoomManager?.getPreviewContainer();

        // Hide resize handles during transition
        if (this.zoomManager) {
            this.zoomManager.hideResizeHandlesDuringTransition();
        }

        // 뷰모드 변경 전 상태 저장
        const isFullscreen = width === '100%';
        const savedCenter = this.zoomManager?.captureCanvasCenter();
        const oldWidth = this.previewFrame.offsetWidth;

        // PC mode (100%)
        if (width === '100%') {
            // 트랜지션 완료 후 fullscreen-mode 클래스 추가
            setTimeout(() => {
                this.previewFrame.classList.add('fullscreen-mode');
                if (previewWrapper) previewWrapper.classList.add('fullscreen-mode');
                if (container) container.classList.add('fullscreen-mode');
            }, 90);

            const resizer = document.getElementById('resizer');
            if (resizer) resizer.classList.add('hidden');

            // PC 모드에서도 핸들 보이기
            if (this.zoomManager) {
                setTimeout(() => {
                    this.zoomManager.setResizeHandlesVisible(true);
                }, 90);
            }
        } else {
            // Non-PC mode
            this.previewFrame.classList.remove('fullscreen-mode');
            if (previewWrapper) previewWrapper.classList.remove('fullscreen-mode');
            if (container) container.classList.remove('fullscreen-mode');

            const resizer = document.getElementById('resizer');
            if (resizer) resizer.classList.remove('hidden');

            // Show handles AFTER transition completes
            if (this.zoomManager) {
                setTimeout(() => {
                    this.zoomManager.setResizeHandlesVisible(true);
                }, 90);
            }
        }

        // JavaScript 애니메이션으로 너비와 transform 동시 변경 (중심 유지)
        if (this.zoomManager && savedCenter) {
            this.zoomManager.animateViewModeChange(width, isFullscreen, savedCenter, oldWidth);
        } else {
            // zoomManager 없으면 직접 너비 설정
            if (width === '100%') {
                this.previewFrame.style.width = '';
                if (container) container.style.width = '';
            } else {
                this.previewFrame.style.width = width + 'px';
                if (container) container.style.width = width + 'px';
            }
        }

        // Remove legacy classes
        this.previewFrame.classList.remove('tablet', 'mobile');

        if (emitEvent) {
            this.emit('view:changed', {
                view: this.currentView,
                width: this.currentViewWidth,
                flash
            });
            // Don't save on view change - only save when breakpoints are added/removed
        }
    }

    /**
     * Add a new custom breakpoint
     */
    addBreakpoint(width) {
        if (!this.viewModes) return;

        // 중복 체크 (같은 너비의 breakpoint가 이미 있으면 추가하지 않음)
        const existing = this.viewModes.querySelector(`.view-btn[data-width="${width}"]`);
        if (existing) return;

        // Find correct position (sorted by width descending)
        // "+" 버튼 뒤에 있는 wrapper(480 fixed 등)도 포함하여 정렬
        const wrappers = Array.from(this.viewModes.querySelectorAll('.view-btn-wrapper'));
        let insertBefore = null;

        for (const wrapper of wrappers) {
            const btn = wrapper.querySelector('.view-btn');
            const btnWidth = btn?.dataset.width;
            if (btnWidth && btnWidth !== '100%' && parseInt(btnWidth) < width) {
                insertBefore = wrapper;
                break;
            }
        }

        // 삽입 위치가 없으면 (모든 기존 버튼보다 작은 너비) 맨 끝에 추가
        if (!insertBefore) {
            const lastWrapper = wrappers[wrappers.length - 1];
            insertBefore = lastWrapper ? lastWrapper.nextSibling : null;
        }

        // Create wrapper with checkbox and button (checkbox before button, indicator inside button)
        const wrapper = document.createElement('div');
        wrapper.className = 'view-btn-wrapper';
        wrapper.innerHTML = `
            <input type="checkbox" class="view-checkbox" data-width="${width}" id="check-${width}">
            <button class="view-btn" data-view="tablet-${width}" data-width="${width}" title="${width}px">
                <span class="view-check-indicator"></span>
                <svg class="view-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                </svg>
                <span class="view-label">${width}</span>
                <span class="view-remove" title="Remove breakpoint">×</span>
            </button>
        `;

        if (insertBefore) {
            this.viewModes.insertBefore(wrapper, insertBefore);
        } else {
            this.viewModes.appendChild(wrapper);
        }

        // Activate the new breakpoint
        const newBtn = wrapper.querySelector('.view-btn');
        this.setViewMode(newBtn);

        this.emit('breakpoint:added', { width });

        // Save settings when breakpoint added
        this.scheduleSaveSettings();
    }

    /**
     * Remove a custom breakpoint
     */
    removeBreakpoint(element) {
        // element can be wrapper or button
        const wrapper = element.classList.contains('view-btn-wrapper') ? element : element.closest('.view-btn-wrapper');
        const btn = wrapper ? wrapper.querySelector('.view-btn') : element;

        if (!btn || btn.dataset.fixed === 'true') return;

        const width = btn.dataset.width;
        const wasActive = btn.classList.contains('active');

        // Remove from target breakpoints
        this.targetBreakpoints.delete(width);

        // Remove wrapper or button
        if (wrapper) {
            wrapper.remove();
        } else {
            btn.remove();
        }

        // If removed breakpoint was active, switch to PC
        if (wasActive) {
            const pcBtn = this.viewModes.querySelector('.view-btn[data-width="100%"]');
            if (pcBtn) {
                this.setViewMode(pcBtn);
            }
        }

        this.emit('breakpoint:removed', { width });

        // Save settings when breakpoint removed
        this.scheduleSaveSettings();
    }

    /**
     * Update current viewport width (called during resize)
     */
    updateViewportWidth(width) {
        this.currentViewWidth = width.toString();

        // Update active button label if it's a custom breakpoint
        const activeBtn = this.viewModes?.querySelector('.view-btn.active');
        if (activeBtn && activeBtn.dataset.fixed !== 'true') {
            activeBtn.dataset.width = this.currentViewWidth;
            const label = activeBtn.querySelector('.view-label');
            if (label) label.textContent = this.currentViewWidth;
            activeBtn.title = this.currentViewWidth + 'px';
        }

        this.emit('viewport:widthChanged', { width: this.currentViewWidth });
    }

    /**
     * Update breakpoint width display only (called during drag)
     * Does not emit events or save settings - just visual update
     * @param {number} index - Button index
     * @param {number} width - Current width value
     */
    updateBreakpointWidthDisplay(index, width) {
        const buttons = this.getViewModeButtons();
        const btn = buttons[index];
        if (!btn || btn.dataset.fixed === 'true') return;

        const label = btn.querySelector('.view-label');
        if (label) label.textContent = Math.round(width);
    }

    /**
     * Update breakpoint width by index (called from MultiCanvasManager drag)
     * @param {number} index - Button index
     * @param {number} newWidth - New width value
     */
    updateBreakpointWidth(index, newWidth) {
        const buttons = this.getViewModeButtons();
        const btn = buttons[index];
        if (!btn) return;

        // PC(100%) 너비 변경: customPcWidth에 저장만 하고 설정 저장
        if (btn.dataset.fixed === 'true' && btn.dataset.width === '100%') {
            this.customPcWidth = Math.round(newWidth);
            this.scheduleSaveSettings();
            return;
        }

        if (btn.dataset.fixed === 'true') return; // PC 외 고정 버튼은 변경 불가

        const oldWidth = parseInt(btn.dataset.width);
        newWidth = Math.round(newWidth);
        if (oldWidth === newWidth) return;

        // 버튼 업데이트
        btn.dataset.width = newWidth;
        const label = btn.querySelector('.view-label');
        if (label) label.textContent = newWidth;
        btn.title = newWidth + 'px';

        // 체크박스 data-width도 업데이트
        const wrapper = btn.closest('.view-btn-wrapper');
        const checkbox = wrapper?.querySelector('.view-checkbox');
        if (checkbox) checkbox.dataset.width = newWidth;

        // targetBreakpoints 업데이트
        if (this.targetBreakpoints.has(oldWidth.toString())) {
            this.targetBreakpoints.delete(oldWidth.toString());
            this.targetBreakpoints.add(newWidth.toString());
        }

        // currentViewWidth도 업데이트 (활성 버튼인 경우)
        if (btn.classList.contains('active')) {
            this.currentViewWidth = newWidth.toString();
        }

        // 이벤트 발생 (미디어쿼리 변경용)
        this.emit('breakpoint:widthChanged', {
            index,
            oldWidth,
            newWidth
        });

        // 설정 저장
        this.scheduleSaveSettings();
    }

    /**
     * Get current view mode
     */
    getCurrentView() {
        return this.currentView;
    }

    /**
     * Get current viewport width
     */
    getCurrentWidth() {
        return this.currentViewWidth;
    }

    /**
     * Check if current view is PC (fullscreen)
     */
    isPCMode() {
        return this.currentViewWidth === '100%';
    }

    /**
     * Switch to view mode by index (1-based)
     * @param {number} index - 1-based index of the view button
     */
    setViewModeByIndex(index) {
        if (!this.viewModes) return;

        const btns = Array.from(this.viewModes.querySelectorAll('.view-btn'));
        const targetBtn = btns[index - 1]; // Convert to 0-based

        if (targetBtn) {
            this.setViewMode(targetBtn);
        }
    }

    /**
     * Get all view mode buttons
     */
    getViewModeButtons() {
        if (!this.viewModes) return [];
        return Array.from(this.viewModes.querySelectorAll('.view-btn'));
    }

    /**
     * Get target breakpoints (checked ones)
     * @returns {string[]} Array of width values
     */
    getTargetBreakpoints() {
        return Array.from(this.targetBreakpoints);
    }

    /**
     * Check if current view is targeted for style application
     * @returns {boolean}
     */
    isCurrentViewTargeted() {
        return this.targetBreakpoints.has(this.currentViewWidth);
    }

    /**
     * Check if a specific breakpoint is targeted
     * @param {string} width
     * @returns {boolean}
     */
    isBreakpointTargeted(width) {
        return this.targetBreakpoints.has(width);
    }

    /**
     * Set checkbox state for a breakpoint
     * @param {string} width
     * @param {boolean} checked
     */
    setBreakpointTargeted(width, checked) {
        const checkbox = this.viewModes?.querySelector(`.view-checkbox[data-width="${width}"]`);
        if (checkbox) {
            checkbox.checked = checked;
            if (checked) {
                this.targetBreakpoints.add(width);
            } else {
                this.targetBreakpoints.delete(width);
            }
        }
    }

    /**
     * Get current view settings for saving
     * @returns {Object}
     */
    getViewSettings() {
        const breakpoints = [];

        // Collect all custom breakpoints (non-fixed buttons)
        this.viewModes?.querySelectorAll('.view-btn-wrapper').forEach(wrapper => {
            const btn = wrapper.querySelector('.view-btn');
            if (btn && btn.dataset.fixed !== 'true') {
                breakpoints.push(parseInt(btn.dataset.width));
            }
        });

        // Only save breakpoints, not current view (always start in PC mode)
        const settings = { breakpoints };
        if (this.customPcWidth) {
            settings.customPcWidth = this.customPcWidth;
        }
        return settings;
    }

    /**
     * Load view settings from project data
     * @param {Object} viewSettings
     */
    loadViewSettings(viewSettings) {
        if (!viewSettings) return;

        this.isLoadingSettings = true;

        try {
            // Remove all custom breakpoints first
            const customWrappers = Array.from(this.viewModes?.querySelectorAll('.view-btn-wrapper') || []);
            customWrappers.forEach(wrapper => {
                const btn = wrapper.querySelector('.view-btn');
                if (btn && btn.dataset.fixed !== 'true') {
                    wrapper.remove();
                }
            });

            // Add breakpoints from settings
            if (viewSettings.breakpoints && Array.isArray(viewSettings.breakpoints)) {
                // Sort by width descending before adding
                const sortedBreakpoints = [...viewSettings.breakpoints].sort((a, b) => b - a);

                sortedBreakpoints.forEach(width => {
                    if (typeof width === 'number' && !isNaN(width)) {
                        this.addBreakpointSilent(width);
                    }
                });
            }

            // 사용자가 설정한 PC 너비 복원
            if (viewSettings.customPcWidth) {
                this.customPcWidth = viewSettings.customPcWidth;
            }

            // Always start in PC mode (don't restore current view)
        } finally {
            this.isLoadingSettings = false;
        }
    }

    /**
     * Add breakpoint without triggering save (for loading)
     * @param {number} width
     */
    addBreakpointSilent(width) {
        if (!this.viewModes) return;

        // Check if already exists
        const existing = this.viewModes.querySelector(`.view-btn[data-width="${width}"]`);
        if (existing) return;

        // Find correct position (sorted by width descending)
        // "+" 버튼 뒤에 있는 wrapper(480 fixed 등)도 포함하여 정렬
        const wrappers = Array.from(this.viewModes.querySelectorAll('.view-btn-wrapper'));
        let insertBefore = null;

        for (const wrapper of wrappers) {
            const btn = wrapper.querySelector('.view-btn');
            const btnWidth = btn?.dataset.width;
            if (btnWidth && btnWidth !== '100%' && parseInt(btnWidth) < width) {
                insertBefore = wrapper;
                break;
            }
        }

        // 삽입 위치가 없으면 (모든 기존 버튼보다 작은 너비) 맨 끝에 추가
        if (!insertBefore) {
            const lastWrapper = wrappers[wrappers.length - 1];
            insertBefore = lastWrapper ? lastWrapper.nextSibling : null;
        }

        // Create wrapper with checkbox and button
        const wrapper = document.createElement('div');
        wrapper.className = 'view-btn-wrapper';
        wrapper.innerHTML = `
            <input type="checkbox" class="view-checkbox" data-width="${width}" id="check-${width}">
            <button class="view-btn" data-view="tablet-${width}" data-width="${width}" title="${width}px">
                <span class="view-check-indicator"></span>
                <svg class="view-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                </svg>
                <span class="view-label">${width}</span>
                <span class="view-remove" title="Remove breakpoint">×</span>
            </button>
        `;

        if (insertBefore) {
            this.viewModes.insertBefore(wrapper, insertBefore);
        } else {
            this.viewModes.appendChild(wrapper);
        }
    }

    /**
     * Save view settings to server (debounced)
     */
    scheduleSaveSettings() {
        if (!this.projectId || this.isLoadingSettings) return;

        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.saveSettings();
        }, 1000);
    }

    /**
     * Save view settings to server
     */
    async saveSettings() {
        if (!this.projectId) return;

        const settings = this.getViewSettings();

        try {
            const response = await fetch(`/api/projects/${this.projectId}/view-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                console.error('Failed to save view settings');
            }
        } catch (err) {
            console.error('Error saving view settings:', err);
        }
    }
}

export default ViewModeManager;
