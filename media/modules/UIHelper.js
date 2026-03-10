import EventEmitter from './EventEmitter.js';

class UIHelper extends EventEmitter {
    constructor() {
        super();
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingMessage = document.getElementById('loadingMessage');
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');
        this.saveStatus = document.getElementById('saveStatus');
    }

    /**
     * Set save status to Unsaved
     */
    setUnsaved() {
        if (this.saveStatus) {
            this.saveStatus.classList.add('unsaved');
            const text = this.saveStatus.querySelector('.status-text');
            if (text) text.textContent = 'Unsaved';
        }
    }

    /**
     * Set save status to Saved
     */
    setSaved() {
        if (this.saveStatus) {
            this.saveStatus.classList.remove('unsaved');
            const text = this.saveStatus.querySelector('.status-text');
            if (text) text.textContent = 'Saved';
        }
    }

    showLoading(message = 'Loading...') {
        if (this.loadingMessage) {
            this.loadingMessage.textContent = message;
        }
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('hidden');
        }
        this.emit('ui:loading:show', { message });
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
        this.emit('ui:loading:hide');
    }

    showToast(message, type = 'info', duration = 3000) {
        if (this.toastMessage) {
            this.toastMessage.textContent = message;
        }
        if (this.toast) {
            this.toast.className = 'toast ' + type;
            this.toast.classList.remove('hidden');

            setTimeout(() => {
                this.toast.classList.add('hidden');
            }, duration);
        }
        this.emit('ui:toast:show', { message, type, duration });
    }

    showSuccess(message, duration = 3000) {
        this.showToast(message, 'success', duration);
    }

    showError(message, duration = 3000) {
        this.showToast(message, 'error', duration);
    }

    showWarning(message, duration = 3000) {
        this.showToast(message, 'warning', duration);
    }

    showInfo(message, duration = 3000) {
        this.showToast(message, 'info', duration);
    }

    confirm(message, callback) {
        if (window.confirm(message)) {
            callback();
        }
    }

    prompt(message, defaultValue = '', callback) {
        const result = window.prompt(message, defaultValue);
        if (result !== null) {
            callback(result);
        }
    }
}

export default UIHelper;
