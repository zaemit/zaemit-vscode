import EventEmitter from './EventEmitter.js';

class Resizer extends EventEmitter {
    constructor(resizerId, panelSelector) {
        super();
        this.resizer = document.getElementById(resizerId);
        this.panel = document.querySelector(panelSelector);
        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 0;
        this.minWidth = 280;
        this.maxWidth = 500;

        this.init();
    }

    init() {
        if (!this.resizer || !this.panel) return;

        this.resizer.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());

        // Double-click to toggle panel visibility
        this.resizer.addEventListener('dblclick', () => this.togglePanel());

        // 패널 토글 버튼 연결
        const toggleBtn = document.getElementById('panelToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.togglePanel());
        }

        // 패널 확장 버튼 연결 (패널이 닫혔을 때 표시)
        this.expandBtn = document.getElementById('panelExpandBtn');
        if (this.expandBtn) {
            this.expandBtn.addEventListener('click', () => this.togglePanel());
        }
    }

    togglePanel() {
        if (!this.panel) return;

        if (this.panel.classList.contains('collapsed')) {
            this.panel.classList.remove('collapsed');
            this.panel.style.width = this._savedWidth || (this.minWidth + 'px');
            this.resizer.classList.remove('hidden');
            if (this.expandBtn) {
                this.expandBtn.classList.add('hidden');
            }
            this.emit('panel:expanded');
        } else {
            this._savedWidth = this.panel.style.width || (this.panel.offsetWidth + 'px');
            this.panel.classList.add('collapsed');
            this.panel.style.width = '0px';
            this.resizer.classList.add('hidden');
            if (this.expandBtn) {
                this.expandBtn.classList.remove('hidden');
            }
            this.emit('panel:collapsed');
        }
    }

    onMouseDown(e) {
        this.isResizing = true;
        this.startX = e.clientX;
        this.startWidth = this.panel.offsetWidth;
        this.resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        this.emit('resize:start', { width: this.startWidth });
    }

    onMouseMove(e) {
        if (!this.isResizing) return;

        const diff = this.startX - e.clientX;
        const newWidth = Math.min(Math.max(this.startWidth + diff, this.minWidth), this.maxWidth);
        this.panel.style.width = newWidth + 'px';

        this.emit('resize:move', { width: newWidth });
    }

    onMouseUp() {
        if (!this.isResizing) return;

        this.isResizing = false;
        this.resizer.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        this.emit('resize:end', { width: this.panel.offsetWidth });
    }

    setMinWidth(width) {
        this.minWidth = width;
    }

    setMaxWidth(width) {
        this.maxWidth = width;
    }
}

export default Resizer;
