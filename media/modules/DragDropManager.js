import EventEmitter from './EventEmitter.js';

/**
 * DragDropManager - Handles drag and drop reordering of elements
 * 원본 요소를 직접 DOM에서 이동하여 실제 CSS가 적용된 크기로 표시
 */
class DragDropManager extends EventEmitter {
    constructor(previewFrame) {
        super();
        this.previewFrame = previewFrame;
        this.isDragging = false;
        this.draggedElement = null;
        this.dragGhost = null; // 마우스를 따라다니는 고스트 요소
        this.originalParent = null;
        this.originalNextSibling = null;
        this.originalIndex = -1;
        this.savedContentEditables = [];
        this.lastMoveTime = 0;
        this.moveThrottleMs = 16; // ~60fps
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // 드래그 상태
        this.moveLockedUntil = 0; // DOM 이동 후 쿨다운
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.pendingMove = null;
        this.lastMoveMouseX = null; // DOM 이동 시점의 마우스 X
        this.lastMoveMouseY = null; // DOM 이동 시점의 마우스 Y
        // 히스테리시스: 마지막 이동 대상과 방향 기억 (역방향 전환에 더 큰 임계값 요구)
        this._lastMovedTarget = null;
        this._lastMovedPosition = null;
        this._lastMovedParent = null;

        // 외부 매니저 참조
        this.zoomManager = null;
        this.multiCanvasManager = null;

        // Grid/Flex 드래그 시 원본 영역 저장
        this.originalRect = null;
    }

    getDocument() {
        return this.previewFrame?.contentDocument || null;
    }

    /**
     * Set zoom manager reference
     */
    setZoomManager(zoomManager) {
        this.zoomManager = zoomManager;
    }

    /**
     * Set multi canvas manager reference
     */
    setMultiCanvasManager(multiCanvasManager) {
        this.multiCanvasManager = multiCanvasManager;
    }

    /**
     * Get current zoom level
     */
    getZoomLevel() {
        return this.zoomManager?.getZoomLevel?.() || 1;
    }

    /**
     * Check if multi-view mode is enabled
     */
    isMultiViewEnabled() {
        return this.multiCanvasManager?.isEnabled?.() || false;
    }

    /**
     * Set active iframe (멀티뷰 지원)
     */
    setActiveIframe(iframe) {
        this.previewFrame = iframe;
    }

    /**
     * Check if element cannot accept block-level children
     */
    isInlineOnlyElement(element) {
        if (!element) return true;

        const inlineOnlyElements = [
            'SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'STRIKE',
            'SUB', 'SUP', 'SMALL', 'BIG', 'MARK', 'DEL', 'INS',
            'ABBR', 'ACRONYM', 'CITE', 'CODE', 'DFN', 'KBD', 'SAMP', 'VAR',
            'TIME', 'DATA', 'Q', 'BDO', 'BDI', 'RUBY', 'RT', 'RP',
            'LABEL', 'BUTTON', 'SELECT', 'TEXTAREA',
            'OPTION', 'OPTGROUP'
        ];

        return inlineOnlyElements.includes(element.tagName);
    }

    /**
     * Initialize drag and drop
     */
    init() {
        // 초기화 불필요
    }

    /**
     * Start dragging an element
     */
    startDrag(element, event) {
        if (!element) return;

        const doc = this.getDocument();
        if (!doc) return;

        this.isDragging = true;
        this.draggedElement = element;
        this.originalParent = element.parentNode;
        this.originalNextSibling = element.nextSibling;
        this.originalIndex = Array.from(element.parentNode.children).indexOf(element);

        // Save contenteditable states
        this.savedContentEditables = [];
        doc.querySelectorAll('[contenteditable="true"]').forEach(el => {
            this.savedContentEditables.push({ element: el, value: 'true' });
            el.removeAttribute('contenteditable');
        });

        // 요소의 현재 위치와 크기 저장
        const rect = element.getBoundingClientRect();
        // Grid/Flex에서 원래 셀 영역 저장 (드래그 중 비교용)
        this.originalRect = {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
        };

        // event는 iframe 내부에서 발생하므로 clientX/Y는 이미 iframe viewport 기준
        // iframeRect를 빼거나 zoom으로 나눌 필요 없음
        this.dragOffsetX = event.clientX - rect.left;
        this.dragOffsetY = event.clientY - rect.top;

        // 드래그 중 스타일 적용 (원본은 반투명만)
        element.classList.add('editor-dragging');
        element.style.pointerEvents = 'none';
        element.style.opacity = '0.7';

        // 마우스 위치 초기화 (벌벌거림 방지용)
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        // Ghost 생성 (마우스를 따라다니는 복제본)
        this.createDragGhost(element, rect);

        // Ghost 초기 위치 설정
        this.updateGhostPosition(event);

        this.emit('drag:start', { element, event });
    }

    /**
     * Ghost 요소 생성 (마우스를 따라다니는 복제본)
     */
    createDragGhost(element, rect) {
        const doc = this.getDocument();
        if (!doc) return;

        // 요소의 실제 복제본 생성
        this.dragGhost = element.cloneNode(true);
        this.dragGhost.className = (element.className || '') + ' editor-drag-ghost';
        this.dragGhost.classList.remove('editor-dragging');

        // 부모로부터 상속받거나 CSS 셀렉터로 적용되는 스타일을 복사
        // (cloneNode는 인라인 스타일만 복사하므로 computed style 필요)
        const computed = element.ownerDocument.defaultView.getComputedStyle(element);
        const stylesToCopy = [
            'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
            'color', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight',
            'textAlign', 'textDecoration', 'letterSpacing',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'borderRadius',
            'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap'
        ];
        stylesToCopy.forEach(prop => {
            this.dragGhost.style[prop] = computed[prop];
        });

        // 드래그용 필수 스타일 (위 스타일들을 덮어씀)
        this.dragGhost.style.position = 'fixed';
        this.dragGhost.style.width = rect.width + 'px';
        this.dragGhost.style.height = rect.height + 'px';
        this.dragGhost.style.left = '0';
        this.dragGhost.style.top = '0';
        this.dragGhost.style.margin = '0';
        this.dragGhost.style.opacity = '0.2';
        this.dragGhost.style.pointerEvents = 'none';
        this.dragGhost.style.zIndex = '10003';
        this.dragGhost.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        this.dragGhost.style.outline = 'none';
        this.dragGhost.style.transform = 'scale(1) translateY(0)';
        this.dragGhost.style.transition = 'transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.15s ease-out';

        doc.body.appendChild(this.dragGhost);

        // 픽업 애니메이션 트리거 (확대 + 위로 올라오며 그림자 강화)
        requestAnimationFrame(() => {
            if (this.dragGhost) {
                this.dragGhost.style.transform = 'scale(1.08) translateY(-8px)';
                this.dragGhost.style.boxShadow = '0 16px 32px rgba(0,0,0,0.3)';
            }
        });
    }

    /**
     * Ghost 위치 업데이트
     */
    updateGhostPosition(event) {
        if (!this.dragGhost) return;

        // event는 iframe 내부에서 발생하므로 clientX/Y는 이미 iframe viewport 기준
        this.dragGhost.style.left = (event.clientX - this.dragOffsetX) + 'px';
        this.dragGhost.style.top = (event.clientY - this.dragOffsetY) + 'px';
    }

    /**
     * Handle drag move
     */
    onDragMove(event) {
        if (!this.isDragging) return;

        this.updateGhostPosition(event);
        this.updateDropTarget(event);

        this.emit('drag:move', { event });
    }

    /**
     * Update drop target and move element
     */
    updateDropTarget(event) {
        const doc = this.getDocument();
        if (!doc || !this.draggedElement) return;

        // 쿨다운 체크 (이동 직후 안정화)
        const now = Date.now();
        if (now < this.moveLockedUntil) return;

        // Throttle
        if (now - this.lastMoveTime < this.moveThrottleMs) return;
        this.lastMoveTime = now;

        // 마우스 위치로 타겟 감지 (마우스가 있는 곳이 드롭 위치)
        const mouseX = event.clientX;
        const mouseY = event.clientY;

        // 마우스 이동 최소 거리 체크 (레이아웃 리플로우로 인한 거짓 재평가 방지)
        // DOM 이동 후 마우스가 충분히 이동하지 않았으면 스킵
        if (this.lastMoveMouseX !== null) {
            const dx = mouseX - this.lastMoveMouseX;
            const dy = mouseY - this.lastMoveMouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 5) return;
        }

        this.lastMouseX = mouseX;
        this.lastMouseY = mouseY;

        // Grid 부모인 경우: 마우스가 원래 셀 영역에 있으면 이동 안 함
        // (Grid auto-placement에서 초기 jitter 방지)
        if (this.originalRect && this.originalParent) {
            const parentStyle = doc.defaultView?.getComputedStyle(this.originalParent);
            const isGrid = parentStyle && (
                parentStyle.display === 'grid' ||
                parentStyle.display === 'inline-grid'
            );

            if (isGrid) {
                if (mouseX >= this.originalRect.left &&
                    mouseX <= this.originalRect.right &&
                    mouseY >= this.originalRect.top &&
                    mouseY <= this.originalRect.bottom) {
                    return;
                }
            }
        }

        // 마우스 위치의 모든 요소 감지 (숨기지 않고 필터링)
        const elements = doc.elementsFromPoint(mouseX, mouseY);

        // 원본 요소와 Ghost를 제외한 첫 번째 요소 찾기
        const targetElement = elements.find(el =>
            el !== this.draggedElement &&
            el !== this.dragGhost &&
            !el.classList?.contains('editor-drag-ghost')
        );

        if (!targetElement) {
            this.pendingMove = null;
            return;
        }

        // (그리드 빈 셀은 findInsertPositionAmongChildren에서 처리)

        // targetElement의 rect가 마우스를 포함하는지 확인
        // Grid/Flex 부모 안에서 마우스가 타겟 rect 밖 = 빈 셀 영역이므로 이동 안 함
        const targetRect = targetElement.getBoundingClientRect();
        let isMouseInsideTarget =
            mouseX >= targetRect.left && mouseX <= targetRect.right &&
            mouseY >= targetRect.top && mouseY <= targetRect.bottom;

        if (!isMouseInsideTarget) {
            const parent = targetElement.parentNode;
            if (parent && parent !== doc.body && parent !== doc.documentElement) {
                const parentStyle = doc.defaultView?.getComputedStyle(parent);
                const isParentGridOrFlex = parentStyle && (
                    parentStyle.display === 'grid' ||
                    parentStyle.display === 'inline-grid' ||
                    parentStyle.display === 'flex' ||
                    parentStyle.display === 'inline-flex'
                );

                if (isParentGridOrFlex) {
                    // gap 영역 vs 빈 셀 영역 구분:
                    // - 마우스Y가 요소의 Y범위 안 → gap 영역 (비교 허용)
                    // - 마우스Y가 요소의 Y범위 밖 → 빈 셀 영역 (이동 안 함)
                    if (mouseY < targetRect.top || mouseY > targetRect.bottom) {
                        this.pendingMove = null;
                        return;
                    }
                    // flex-column에서 align-items로 자식이 좁을 때:
                    // 마우스 X가 자식 rect 밖이지만 Y 범위 안이면 해당 자식 위에 있는 것으로 간주
                    const isParentFlexColumn = (
                        parentStyle.display === 'flex' || parentStyle.display === 'inline-flex'
                    ) && (
                        parentStyle.flexDirection === 'column' || parentStyle.flexDirection === 'column-reverse'
                    );
                    if (isParentFlexColumn) {
                        // flex-column: Y 범위 안이면 해당 자식 위로 간주 (X 무관)
                        isMouseInsideTarget = true;
                    }
                    // gap 영역이면 계속 진행 (비교 허용) - 부모로 dropTarget 변경됨
                }
            }
        }

        // Skip invalid targets
        if (targetElement === this.draggedElement) return;
        if (targetElement === doc.body || targetElement === doc.documentElement) {
            // body에 드롭 시 맨 마지막에 추가
            if (this.draggedElement.parentNode !== doc.body ||
                this.draggedElement.nextSibling !== null) {
                this.pendingMove = null;
                doc.body.appendChild(this.draggedElement);
                this.moveLockedUntil = Date.now() + 50;
            }
            return;
        }
        if (targetElement.id?.startsWith('editor-')) return;
        if (targetElement.classList?.contains('editor-drag-ghost')) return;
        // 드래그 중인 요소 자체거나 그 자식이면 무시
        if (targetElement === this.draggedElement) return;
        if (this.draggedElement.contains(targetElement)) return;

        let dropTarget = targetElement;
        let position;

        // Grid/Flex 자식이고 마우스가 X범위 밖이면 → 부모(Grid)로 dropTarget 변경
        // 이렇게 해야 findInsertPositionAmongChildren에서 Grid 처리 로직을 탐
        if (!isMouseInsideTarget) {
            const parent = targetElement.parentNode;
            if (parent && parent !== doc.body && parent !== doc.documentElement) {
                const parentStyle = doc.defaultView?.getComputedStyle(parent);
                const isParentGridOrFlex = parentStyle && (
                    parentStyle.display === 'grid' ||
                    parentStyle.display === 'inline-grid' ||
                    parentStyle.display === 'flex' ||
                    parentStyle.display === 'inline-flex'
                );

                if (isParentGridOrFlex) {
                    // 부모(Grid)로 dropTarget 변경하여 자식들 사이에서 위치 찾기
                    dropTarget = parent;
                }
            }
        }

        // inside 가능 여부 먼저 판단
        const voidElements = ['IMG', 'INPUT', 'BR', 'HR', 'AREA', 'BASE', 'COL', 'EMBED', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'];
        const isVoidElement = voidElements.includes(dropTarget.tagName);
        const isInlineOnly = this.isInlineOnlyElement(dropTarget);
        const canDropInside = !isVoidElement && !isInlineOnly;

        // 부모 요소의 자식들 사이 공백에 마우스가 있는 경우 처리
        if (canDropInside && dropTarget.children.length > 0) {
            const insertPosition = this.findInsertPositionAmongChildren(dropTarget, mouseX, mouseY);
            if (insertPosition) {
                dropTarget = insertPosition.target;
                position = insertPosition.position;

                // inside가 반환된 경우: 해당 요소의 자식들 중 정확한 위치 찾기
                if (position === 'inside' && dropTarget.children.length > 0) {
                    const innerPos = this.findInsertPositionAmongChildren(dropTarget, mouseX, mouseY);
                    if (innerPos) {
                        dropTarget = innerPos.target;
                        position = innerPos.position;
                    }
                    // innerPos가 null이면 그대로 inside 유지 (appendChild)
                }
            } else {
                // Grid/Flex 컨테이너에서 null 반환 시 (빈 셀 영역)
                const targetStyle = doc.defaultView?.getComputedStyle(dropTarget);
                const isGridOrFlex = targetStyle && (
                    targetStyle.display === 'grid' ||
                    targetStyle.display === 'inline-grid' ||
                    targetStyle.display === 'flex' ||
                    targetStyle.display === 'inline-flex'
                );
                if (isGridOrFlex) {
                    // Grid/Flex에서 null → 이동 안 함
                    // (빈 셀 이동은 조기 감지에서 처리됨)
                    this.pendingMove = null;
                    return;
                }
            }
        }

        // position이 아직 결정되지 않았으면 기본 로직 사용
        if (!position) {
            const rect = dropTarget.getBoundingClientRect();
            const relativeY = (mouseY - rect.top) / rect.height;

            // Grid/Flex 자식인 경우: inside 없이 50/50 before/after
            // (Flex/Grid 레이아웃에서는 자식 안으로 들어가는 것보다 형제 간 이동이 자연스러움)
            const parentOfDrop = dropTarget.parentNode;
            const isChildOfGridFlex = parentOfDrop && parentOfDrop !== doc.body &&
                parentOfDrop !== doc.documentElement && (() => {
                    const ps = doc.defaultView?.getComputedStyle(parentOfDrop);
                    return ps && (ps.display === 'grid' || ps.display === 'inline-grid' ||
                                  ps.display === 'flex' || ps.display === 'inline-flex');
                })();

            // 히스테리시스: 같은 부모 컨텍스트의 형제이면 역방향 전환에 더 큰 임계값
            let threshold = 0.5;
            const isSiblingContext = this._lastMovedTarget === dropTarget ||
                (this._lastMovedParent && this._lastMovedParent === dropTarget.parentNode);
            if (isSiblingContext && this._lastMovedPosition === 'before') threshold = 0.7;
            else if (isSiblingContext && this._lastMovedPosition === 'after') threshold = 0.3;

            if (isChildOfGridFlex && !canDropInside) {
                // Grid/Flex 자식이면서 inside 불가 (img, input 등): before/after만
                position = relativeY < threshold ? 'before' : 'after';
            } else if (isChildOfGridFlex && canDropInside) {
                // Grid/Flex 자식이면서 inside 가능 (div 등): before/inside/after
                const beforeThreshold = this._lastMovedTarget === dropTarget && this._lastMovedPosition === 'inside' ? 0.15 : 0.25;
                const afterThreshold = this._lastMovedTarget === dropTarget && this._lastMovedPosition === 'inside' ? 0.85 : 0.75;
                if (relativeY < beforeThreshold) {
                    position = 'before';
                } else if (relativeY > afterThreshold) {
                    position = 'after';
                } else {
                    position = 'inside';
                }
            } else if (canDropInside) {
                // 일반 블록 요소: before(상단) / inside(중앙) / after(하단)
                // 히스테리시스는 before/after 경계에만 적용
                const beforeThreshold = this._lastMovedTarget === dropTarget && this._lastMovedPosition === 'inside' ? 0.15 : 0.25;
                const afterThreshold = this._lastMovedTarget === dropTarget && this._lastMovedPosition === 'inside' ? 0.85 : 0.75;
                if (relativeY < beforeThreshold) {
                    position = 'before';
                } else if (relativeY > afterThreshold) {
                    position = 'after';
                } else {
                    position = 'inside';
                }
            } else {
                // 인라인/void 요소: before/after
                position = relativeY < threshold ? 'before' : 'after';
            }
        }

        // 원본 요소를 새 위치로 이동
        this.moveElementTo(dropTarget, position);

        // 이동 후 pendingMove 리셋
        this.pendingMove = null;
    }

    /**
     * 자식들을 열(column)로 그룹화
     * X좌표(left)가 비슷한 요소들끼리 같은 열로 분류
     */
    groupChildrenByColumn(children) {
        const childRects = children.map(child => ({
            element: child,
            rect: child.getBoundingClientRect()
        }));

        // X좌표(left) 기준으로 정렬
        childRects.sort((a, b) => a.rect.left - b.rect.left);

        const columns = [];
        const tolerance = 20; // 20px 이내면 같은 열로 취급

        for (const item of childRects) {
            // 기존 열 중 X좌표가 비슷한 열 찾기
            let foundColumn = columns.find(col => {
                const colLeft = col[0].rect.left;
                return Math.abs(item.rect.left - colLeft) < tolerance;
            });

            if (foundColumn) {
                foundColumn.push(item);
            } else {
                columns.push([item]);
            }
        }

        // 각 열 내에서 Y좌표 기준으로 정렬
        columns.forEach(col => col.sort((a, b) => a.rect.top - b.rect.top));

        return columns;
    }

    /**
     * 자식들을 행(row)으로 그룹화
     * Y좌표(top)가 비슷한 요소들끼리 같은 행으로 분류
     */
    groupChildrenByRow(children) {
        const childRects = children.map(child => ({
            element: child,
            rect: child.getBoundingClientRect()
        }));

        // Y좌표(top) 기준으로 정렬
        childRects.sort((a, b) => a.rect.top - b.rect.top);

        const rows = [];
        const tolerance = 20; // 20px 이내면 같은 행으로 취급

        for (const item of childRects) {
            // 기존 행 중 Y좌표가 비슷한 행 찾기
            let foundRow = rows.find(row => {
                const rowTop = row[0].rect.top;
                return Math.abs(item.rect.top - rowTop) < tolerance;
            });

            if (foundRow) {
                foundRow.push(item);
            } else {
                rows.push([item]);
            }
        }

        // 각 행 내에서 X좌표 기준으로 정렬
        rows.forEach(row => row.sort((a, b) => a.rect.left - b.rect.left));

        return rows;
    }

    /**
     * 부모 요소의 자식들 사이에서 마우스 위치에 맞는 삽입 위치 찾기
     */
    findInsertPositionAmongChildren(parent, mouseX, mouseY) {
        const children = Array.from(parent.children).filter(
            child => child !== this.draggedElement &&
                     child !== this.dragGhost &&
                     !child.classList?.contains('editor-drag-ghost')
        );

        if (children.length === 0) return null;

        // 부모가 Grid/Flex인지 확인
        const doc = this.getDocument();
        const parentStyle = doc?.defaultView?.getComputedStyle(parent);
        const isGridOrFlex = parentStyle && (
            parentStyle.display === 'grid' ||
            parentStyle.display === 'inline-grid' ||
            parentStyle.display === 'flex' ||
            parentStyle.display === 'inline-flex'
        );

        // flex-direction 확인: column이면 모든 자식이 수직 배치 → column 그룹핑 불필요
        const isFlexColumn = parentStyle && (
            parentStyle.display === 'flex' || parentStyle.display === 'inline-flex'
        ) && (
            parentStyle.flexDirection === 'column' || parentStyle.flexDirection === 'column-reverse'
        );

        // Grid/Flex인 경우: 마우스가 속한 열의 요소들만 필터링
        let targetChildren = children;
        if (isGridOrFlex) {
            // flex-column: 모든 자식이 하나의 열 (align-items로 X가 달라도 같은 열)
            // grid/flex-row: X좌표 기준으로 열 그룹화
            const columns = isFlexColumn
                ? [children.map(child => ({ element: child, rect: child.getBoundingClientRect() }))]
                : this.groupChildrenByColumn(children);

            // 마우스 X좌표가 속한 열 찾기
            const mouseColumn = columns.find(col => {
                const minX = Math.min(...col.map(c => c.rect.left));
                const maxX = Math.max(...col.map(c => c.rect.right));
                return mouseX >= minX && mouseX <= maxX;
            });

            if (mouseColumn) {
                targetChildren = mouseColumn.map(c => c.element);

                // 해당 열 내에서 Y범위 비교
                for (let i = 0; i < targetChildren.length; i++) {
                    const child = targetChildren[i];
                    const rect = child.getBoundingClientRect();

                    if (mouseY >= rect.top && mouseY <= rect.bottom) {
                        const relativeY = (mouseY - rect.top) / rect.height;

                        // 자식이 inside 가능한 컨테이너(div 등)인지 확인
                        const childVoid = ['IMG', 'INPUT', 'BR', 'HR', 'AREA', 'BASE', 'COL', 'EMBED', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'];
                        const childCanDropInside = !childVoid.includes(child.tagName) && !this.isInlineOnlyElement(child);

                        if (childCanDropInside && child.children.length > 0) {
                            // 컨테이너 자식: before(상단 25%) / inside(중앙 50%) / after(하단 25%)
                            const beforeTh = this._lastMovedTarget === child && this._lastMovedPosition === 'inside' ? 0.15 : 0.25;
                            const afterTh = this._lastMovedTarget === child && this._lastMovedPosition === 'inside' ? 0.85 : 0.75;
                            if (relativeY < beforeTh) {
                                return { target: child, position: 'before' };
                            } else if (relativeY > afterTh) {
                                return { target: child, position: 'after' };
                            } else {
                                return { target: child, position: 'inside' };
                            }
                        }

                        // 비컨테이너 또는 자식 없는 요소: before/after만
                        // 히스테리시스: 같은 부모 컨텍스트의 형제이면 역방향 전환에 더 큰 임계값
                        let threshold = 0.5;
                        const isSiblingContext = this._lastMovedTarget === child ||
                            (this._lastMovedParent && this._lastMovedParent === child.parentNode);
                        if (isSiblingContext && this._lastMovedPosition === 'before') threshold = 0.7;
                        else if (isSiblingContext && this._lastMovedPosition === 'after') threshold = 0.3;
                        return {
                            target: child,
                            position: relativeY < threshold ? 'before' : 'after'
                        };
                    }
                }

                // 열 내에서 요소 rect에 매칭 안 됨 → gap 영역인지 확인
                // 두 요소 사이 수직 gap: 아래쪽 요소 앞에 삽입
                for (let i = 0; i < targetChildren.length - 1; i++) {
                    const current = targetChildren[i];
                    const next = targetChildren[i + 1];
                    const currentRect = current.getBoundingClientRect();
                    const nextRect = next.getBoundingClientRect();

                    if (mouseY > currentRect.bottom && mouseY < nextRect.top) {
                        return { target: next, position: 'before' };
                    }
                }

                // 열의 첫 번째 요소 위
                const firstInColumn = targetChildren[0];
                const firstRect = firstInColumn.getBoundingClientRect();
                if (mouseY < firstRect.top) {
                    return { target: firstInColumn, position: 'before' };
                }

                // 열의 마지막 요소 아래
                const lastInColumn = targetChildren[targetChildren.length - 1];
                const lastColumnRect = lastInColumn.getBoundingClientRect();
                if (mouseY > lastColumnRect.bottom) {
                    // M이 이미 이 컨테이너 안에 있으면 → 이동 안 함 (리플로우로 인한 잘못된 판정 방지)
                    // M이 밖에서 오면 → 빈 셀 진입 (마지막 자식 뒤)
                    if (this.draggedElement.parentNode === parent) {
                        return null;
                    }
                    return { target: children[children.length - 1], position: 'after' };
                }

                // 그 외
                if (this.draggedElement.parentNode === parent) {
                    return null;
                }
                return { target: children[children.length - 1], position: 'after' };
            } else {
                // 마우스가 어떤 열에도 속하지 않음 → 행 기준으로 같은 행의 마지막 요소와 비교
                const rows = this.groupChildrenByRow(children);

                // 마우스 Y좌표가 속한 행 찾기
                const mouseRow = rows.find(row => {
                    const minY = Math.min(...row.map(c => c.rect.top));
                    const maxY = Math.max(...row.map(c => c.rect.bottom));
                    return mouseY >= minY && mouseY <= maxY;
                });

                if (mouseRow) {
                    // 마우스가 행 내 요소의 X범위 안에 있는지 확인
                    const insideElement = mouseRow.find(item =>
                        mouseX >= item.rect.left && mouseX <= item.rect.right
                    );
                    if (insideElement) {
                        // 요소 위에 있음
                        const relativeY = (mouseY - insideElement.rect.top) / insideElement.rect.height;
                        const el = insideElement.element;

                        // 자식이 inside 가능한 컨테이너(div 등)인지 확인
                        const elVoid = ['IMG', 'INPUT', 'BR', 'HR', 'AREA', 'BASE', 'COL', 'EMBED', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'];
                        const elCanDropInside = !elVoid.includes(el.tagName) && !this.isInlineOnlyElement(el);

                        if (elCanDropInside && el.children.length > 0) {
                            // 컨테이너 자식: before/inside/after
                            const beforeTh = this._lastMovedTarget === el && this._lastMovedPosition === 'inside' ? 0.15 : 0.25;
                            const afterTh = this._lastMovedTarget === el && this._lastMovedPosition === 'inside' ? 0.85 : 0.75;
                            if (relativeY < beforeTh) {
                                return { target: el, position: 'before' };
                            } else if (relativeY > afterTh) {
                                return { target: el, position: 'after' };
                            } else {
                                return { target: el, position: 'inside' };
                            }
                        }

                        // 비컨테이너: before/after만
                        let threshold = 0.5;
                        const isSiblingContext = this._lastMovedTarget === el ||
                            (this._lastMovedParent && this._lastMovedParent === el.parentNode);
                        if (isSiblingContext && this._lastMovedPosition === 'before') threshold = 0.7;
                        else if (isSiblingContext && this._lastMovedPosition === 'after') threshold = 0.3;
                        return {
                            target: el,
                            position: relativeY < threshold ? 'before' : 'after'
                        };
                    }

                    // 요소 사이 gap 영역 (두 요소 X범위 사이)인지 확인
                    for (let i = 0; i < mouseRow.length - 1; i++) {
                        const current = mouseRow[i];
                        const next = mouseRow[i + 1];
                        if (mouseX > current.rect.right && mouseX < next.rect.left) {
                            // 두 요소 사이 gap → 왼쪽 요소 뒤에 삽입
                            return { target: current.element, position: 'after' };
                        }
                    }

                    // 행 내에서 모든 요소의 왼쪽 또는 오른쪽 바깥
                    const firstInRow = mouseRow[0];
                    const lastInRow = mouseRow[mouseRow.length - 1];
                    if (mouseX < firstInRow.rect.left) {
                        // 첫 번째 요소 왼쪽 → 첫 번째 요소 앞에 삽입
                        return { target: firstInRow.element, position: 'before' };
                    }
                    // 마지막 요소 오른쪽 → 마지막 요소 뒤에 삽입
                    return { target: lastInRow.element, position: 'after' };
                }

                // 어떤 행에도 속하지 않음 → 패딩 영역 (위/아래/행 사이)
                const allRects = children.map(c => c.getBoundingClientRect());
                const minTop = Math.min(...allRects.map(r => r.top));
                const maxBottom = Math.max(...allRects.map(r => r.bottom));

                if (mouseY < minTop) {
                    // 모든 자식 위 (padding-top 영역) → 첫 번째 자식 앞
                    return { target: children[0], position: 'before' };
                }
                if (mouseY > maxBottom) {
                    // 모든 자식 아래 (padding-bottom 영역) → 마지막 자식 뒤
                    return { target: children[children.length - 1], position: 'after' };
                }

                // 행 사이 gap 영역 (열 밖) → 위쪽 행의 마지막 요소 뒤에 삽입
                for (let i = 0; i < rows.length - 1; i++) {
                    const currentRowBottom = Math.max(...rows[i].map(c => c.rect.bottom));
                    const nextRowTop = Math.min(...rows[i + 1].map(c => c.rect.top));
                    if (mouseY > currentRowBottom && mouseY < nextRowTop) {
                        const lastInCurrentRow = rows[i][rows[i].length - 1];
                        return { target: lastInCurrentRow.element, position: 'after' };
                    }
                }

                // 어떤 행에도 열에도 매칭 안 됨
                if (this.draggedElement.parentNode === parent) {
                    return null;
                }
                return { target: children[children.length - 1], position: 'after' };
            }
        }

        // 일반 레이아웃: 위쪽/아래쪽 공백 처리
        for (let i = 0; i < targetChildren.length; i++) {
            const child = targetChildren[i];
            const rect = child.getBoundingClientRect();

            if (mouseY >= rect.top && mouseY <= rect.bottom) {
                const relativeY = (mouseY - rect.top) / rect.height;
                return {
                    target: child,
                    position: relativeY < 0.5 ? 'before' : 'after'
                };
            }

            if (mouseY < rect.top) {
                return { target: child, position: 'before' };
            }
        }

        // 마지막 요소 아래쪽 (일반 레이아웃에서만)
        const lastChild = targetChildren[targetChildren.length - 1];
        if (lastChild) {
            const lastRect = lastChild.getBoundingClientRect();
            if (mouseY > lastRect.bottom) {
                return { target: lastChild, position: 'after' };
            }
        }

        return null;
    }

    /**
     * 요소를 새 위치로 이동
     */
    moveElementTo(targetElement, position) {
        if (!this.draggedElement || !targetElement) return;

        // 현재 DOM 위치와 같으면 스킵 (불필요한 DOM 조작 방지)
        const currentNext = this.draggedElement.nextElementSibling;
        const currentPrev = this.draggedElement.previousElementSibling;
        const currentParent = this.draggedElement.parentNode;

        let needsMove = false;

        switch (position) {
            case 'before':
                if (currentNext !== targetElement || currentParent !== targetElement.parentNode) {
                    needsMove = true;
                }
                break;
            case 'after':
                if (currentPrev !== targetElement || currentParent !== targetElement.parentNode) {
                    needsMove = true;
                }
                break;
            case 'inside':
                if (currentParent !== targetElement) {
                    needsMove = true;
                }
                break;
        }

        if (!needsMove) return;

        // 히스테리시스용 마지막 이동 결과 기록
        // 같은 부모 컨텍스트의 형제들에 대해 히스테리시스가 적용되도록
        // target뿐 아니라 부모도 기록
        this._lastMovedTarget = targetElement;
        this._lastMovedPosition = position;
        this._lastMovedParent = targetElement.parentNode;

        // DOM 이동
        switch (position) {
            case 'before':
                targetElement.parentNode.insertBefore(this.draggedElement, targetElement);
                break;
            case 'after':
                targetElement.parentNode.insertBefore(this.draggedElement, targetElement.nextSibling);
                break;
            case 'inside':
                targetElement.appendChild(this.draggedElement);
                break;
        }

        // DOM 이동 후 쿨다운 + 마우스 위치 기록
        this.moveLockedUntil = Date.now() + 50;
        this.lastMoveMouseX = this.lastMouseX;
        this.lastMoveMouseY = this.lastMouseY;
    }

    /**
     * End drag operation
     */
    endDrag(commit = true) {
        if (!this.isDragging) return;

        // 드래그 스타일 제거
        if (this.draggedElement) {
            this.draggedElement.classList.remove('editor-dragging');
            this.draggedElement.style.pointerEvents = '';
            this.draggedElement.style.opacity = '';
        }

        // Ghost 제거
        if (this.dragGhost && this.dragGhost.parentNode) {
            this.dragGhost.parentNode.removeChild(this.dragGhost);
        }
        this.dragGhost = null;

        // 벌벌거림 방지 상태 초기화
        this.moveLockedUntil = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.pendingMove = null;
        this.originalRect = null;
        this.lastMoveMouseX = null;
        this.lastMoveMouseY = null;
        this._lastMovedTarget = null;
        this._lastMovedPosition = null;
        this._lastMovedParent = null;

        // Restore contenteditable
        this.savedContentEditables.forEach(({ element, value }) => {
            element.setAttribute('contenteditable', value);
        });
        this.savedContentEditables = [];

        const movedElement = this.draggedElement;
        const finalParent = movedElement?.parentNode;
        const finalIndex = movedElement && finalParent ?
            Array.from(finalParent.children).indexOf(movedElement) : -1;

        // 위치가 변경되었는지 확인
        const positionChanged = commit && movedElement && (
            this.originalParent !== finalParent ||
            this.originalIndex !== finalIndex
        );

        if (positionChanged) {
            this.emit('drop', {
                element: movedElement,
                target: finalParent,
                position: 'moved',
                originalParent: this.originalParent,
                originalIndex: this.originalIndex
            });
        }

        this.isDragging = false;
        this.draggedElement = null;

        this.emit('drag:end', { element: movedElement, commit });
    }

    /**
     * Cancel drag operation - restore original position
     */
    cancelDrag() {
        if (!this.isDragging || !this.draggedElement) {
            this.endDrag(false);
            return;
        }

        // 원래 위치로 복원
        if (this.originalParent) {
            if (this.originalNextSibling) {
                this.originalParent.insertBefore(this.draggedElement, this.originalNextSibling);
            } else {
                this.originalParent.appendChild(this.draggedElement);
            }
        }

        this.endDrag(false);
        this.emit('drag:cancel');
    }

    /**
     * Check if currently dragging
     */
    isDraggingElement() {
        return this.isDragging;
    }

    /**
     * Reattach iframe handlers after DOM changes
     */
    reattachIframeHandlers() {
        // 별도 reattach 불필요
    }

    /**
     * Destroy manager
     */
    destroy() {
        if (this.dragGhost && this.dragGhost.parentNode) {
            this.dragGhost.parentNode.removeChild(this.dragGhost);
        }
        this.dragGhost = null;
        this.draggedElement = null;
    }
}

export default DragDropManager;
