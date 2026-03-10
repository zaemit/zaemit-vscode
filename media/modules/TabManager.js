import EventEmitter from './EventEmitter.js';

class TabManager extends EventEmitter {
    constructor(tabBtnSelector = '.tab-btn', tabContentSelector = '.tab-content') {
        super();
        this.tabBtns = document.querySelectorAll(tabBtnSelector);
        this.tabContents = document.querySelectorAll(tabContentSelector);
        this.activeTab = null;

        this.init();
    }

    init() {
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.activateTab(btn.dataset.tab));
        });

        const activeBtn = Array.from(this.tabBtns).find(btn => btn.classList.contains('active'));
        if (activeBtn) {
            this.activeTab = activeBtn.dataset.tab;
        }
    }

    activateTab(tabName) {
        this.tabBtns.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.tabContents.forEach(content => {
            const contentTab = content.id.replace('tab-', '');
            if (contentTab === tabName) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        const previousTab = this.activeTab;
        this.activeTab = tabName;

        this.emit('tab:change', {
            from: previousTab,
            to: tabName
        });
    }

    getActiveTab() {
        return this.activeTab;
    }
}

export default TabManager;
