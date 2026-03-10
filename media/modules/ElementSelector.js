import EventEmitter from './EventEmitter.js';

class ElementSelector extends EventEmitter {
    constructor(previewManager) {
        super();
        this.previewManager = previewManager;
        this.selectedElement = null;
        this.dragDropManager = null;
        this.tableEditor = null;

        this.init();
    }

    /**
     * Set DragDropManager reference to check drag state
     */
    setDragDropManager(dragDropManager) {
        this.dragDropManager = dragDropManager;
    }

    /**
     * Set TableEditor reference to check cell selection mode
     */
    setTableEditor(tableEditor) {
        this.tableEditor = tableEditor;
    }

    init() {
        this.previewManager.on('element:click', (element) => {
            // Ignore clicks during drag operation
            if (this.dragDropManager?.isDraggingElement()) {
                return;
            }
            // Ignore clicks on table cells when in cell selection mode
            if (this.tableEditor?.cellSelectionMode) {
                const table = this.tableEditor.getTableFromElement(element);
                if (table === this.tableEditor.selectedTable) {
                    // Let TableEditor handle cell selection
                    return;
                }
            }
            this.selectElement(element);
        });
    }

    selectElement(element) {
        const doc = this.previewManager.getDocument();

        if (element === doc.body || element === doc.documentElement) {
            return;
        }

        // Clear previous selection (OverlayManager handles visual overlay)
        this.selectedElement = element;

        this.emit('element:selected', element);
    }

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement = null;
            this.emit('element:deselected');
        }
    }

    getSelectedElement() {
        return this.selectedElement;
    }

    duplicateSelected() {
        if (!this.selectedElement) return null;

        const clone = this.selectedElement.cloneNode(true);
        const parent = this.selectedElement.parentNode;
        parent.insertBefore(clone, this.selectedElement.nextSibling);

        // Calculate index of the clone in parent
        const index = Array.from(parent.children).indexOf(clone);

        this.emit('element:duplicated', { clone, parent, index });
        return clone;
    }

    deleteSelected() {
        if (!this.selectedElement) return;

        const element = this.selectedElement;
        const parent = element.parentElement;
        const index = parent ? Array.from(parent.children).indexOf(element) : 0;
        const html = element.outerHTML;

        element.remove();
        this.selectedElement = null;

        this.emit('element:deleted', { element, parent, index, html });
    }
}

export default ElementSelector;
