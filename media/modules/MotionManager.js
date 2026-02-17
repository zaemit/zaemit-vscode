import EventEmitter from './EventEmitter.js';

/**
 * MotionManager - CSS 모션(등장/퇴장 애니메이션) 관리 모듈
 * VS Code Extension 전용
 */
class MotionManager extends EventEmitter {
    constructor() {
        super();
        this._selectedElement = null;
    }

    /**
     * @keyframes 정의
     */
    static KEYFRAMES = `
@keyframes zaemit-fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes zaemit-slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
@keyframes zaemit-slideDown { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(0); } }
@keyframes zaemit-slideLeft { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
@keyframes zaemit-slideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
@keyframes zaemit-scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
@keyframes zaemit-bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
@keyframes zaemit-fadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes zaemit-slideOutUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-40px); } }
@keyframes zaemit-slideOutDown { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(40px); } }
`;

    /**
     * IntersectionObserver 스크립트 (iframe에 주입)
     */
    static OBSERVER_SCRIPT = `
(function() {
    if (window._zaemitMotionObserver) return;
    window._zaemitMotionObserver = true;

    function initMotionObserver() {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var el = entry.target;
                    var motion = el.getAttribute('data-zaemit-motion');
                    if (!motion) return;
                    var duration = el.getAttribute('data-zaemit-motion-duration') || '0.5s';
                    var delay = el.getAttribute('data-zaemit-motion-delay') || '0s';
                    el.style.animation = 'zaemit-' + motion + ' ' + duration + ' ' + delay + ' ease both';
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('[data-zaemit-motion]').forEach(function(el) {
            var trigger = el.getAttribute('data-zaemit-motion-trigger') || 'scroll';
            if (trigger === 'load') {
                var motion = el.getAttribute('data-zaemit-motion');
                var duration = el.getAttribute('data-zaemit-motion-duration') || '0.5s';
                var delay = el.getAttribute('data-zaemit-motion-delay') || '0s';
                el.style.animation = 'zaemit-' + motion + ' ' + duration + ' ' + delay + ' ease both';
            } else {
                observer.observe(el);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMotionObserver);
    } else {
        initMotionObserver();
    }
})();
`;

    init() {
        this._setupUI();
    }

    _setupUI() {
        // 모션 버튼 클릭 핸들러
        document.querySelectorAll('.motion-btn[data-motion]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this._selectedElement) {
                    console.warn('[MotionManager] No element selected');
                    return;
                }
                this._applyMotion(btn.dataset.motion);
            });
        });

        // 설정 변경 핸들러 (변경 시 즉시 미리보기 재생)
        document.getElementById('motionDuration')?.addEventListener('change', (e) => {
            if (!this._selectedElement) return;
            this._selectedElement.setAttribute('data-zaemit-motion-duration', e.target.value);
            this._previewMotion();
            this.emit('motion:changed');
        });

        document.getElementById('motionDelay')?.addEventListener('change', (e) => {
            if (!this._selectedElement) return;
            this._selectedElement.setAttribute('data-zaemit-motion-delay', e.target.value);
            this._previewMotion();
            this.emit('motion:changed');
        });

        document.getElementById('motionTrigger')?.addEventListener('change', (e) => {
            if (!this._selectedElement) return;
            this._selectedElement.setAttribute('data-zaemit-motion-trigger', e.target.value);
            this.emit('motion:changed');
        });

        // 미리보기 버튼
        document.getElementById('previewMotionBtn')?.addEventListener('click', () => {
            this._previewMotion();
        });

        // 제거 버튼
        document.getElementById('removeMotionBtn')?.addEventListener('click', () => {
            this._removeMotion();
        });
    }

    /**
     * 선택된 요소의 ownerDocument를 통해 iframe document 가져오기
     * (multiCanvas, iframe 재로드 등에 관계없이 항상 올바른 document 반환)
     */
    _getElementDocument() {
        return this._selectedElement?.ownerDocument || null;
    }

    /**
     * 선택된 요소 설정 (element:selected 이벤트에서 호출)
     */
    setSelectedElement(element) {
        this._selectedElement = element;
        this._updateUI();
    }

    /**
     * 선택 해제 (element:deselected 이벤트에서 호출)
     */
    clearSelection() {
        this._selectedElement = null;
        this._updateUI();
    }

    /**
     * UI 업데이트 (선택 상태에 따라 패널 표시/숨김)
     */
    _updateUI() {
        const noSelection = document.getElementById('motionNoSelection');
        const properties = document.getElementById('motionProperties');
        const currentDisplay = document.getElementById('motionCurrent');
        const currentName = document.getElementById('motionCurrentName');

        if (!this._selectedElement) {
            noSelection?.classList.remove('hidden');
            properties?.classList.add('hidden');
            return;
        }

        noSelection?.classList.add('hidden');
        properties?.classList.remove('hidden');

        // 현재 모션 표시
        const currentMotion = this._selectedElement.getAttribute('data-zaemit-motion');
        if (currentMotion) {
            currentDisplay?.classList.remove('hidden');
            if (currentName) currentName.textContent = currentMotion;

            // 버튼 활성화 상태
            document.querySelectorAll('.motion-btn[data-motion]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.motion === currentMotion);
            });

            // 설정값 동기화
            const duration = this._selectedElement.getAttribute('data-zaemit-motion-duration') || '0.5s';
            const delay = this._selectedElement.getAttribute('data-zaemit-motion-delay') || '0s';
            const trigger = this._selectedElement.getAttribute('data-zaemit-motion-trigger') || 'scroll';

            const durationSelect = document.getElementById('motionDuration');
            const delaySelect = document.getElementById('motionDelay');
            const triggerSelect = document.getElementById('motionTrigger');

            if (durationSelect) durationSelect.value = duration;
            if (delaySelect) delaySelect.value = delay;
            if (triggerSelect) triggerSelect.value = trigger;
        } else {
            currentDisplay?.classList.add('hidden');
            if (currentName) currentName.textContent = 'None';
            document.querySelectorAll('.motion-btn[data-motion]').forEach(btn => {
                btn.classList.remove('active');
            });
        }
    }

    /**
     * 모션 적용
     */
    _applyMotion(motionName) {
        if (!this._selectedElement) return;

        const oldMotion = this._selectedElement.getAttribute('data-zaemit-motion') || '';
        const duration = document.getElementById('motionDuration')?.value || '0.5s';
        const delay = document.getElementById('motionDelay')?.value || '0s';
        const trigger = document.getElementById('motionTrigger')?.value || 'scroll';

        this._selectedElement.setAttribute('data-zaemit-motion', motionName);
        this._selectedElement.setAttribute('data-zaemit-motion-duration', duration);
        this._selectedElement.setAttribute('data-zaemit-motion-delay', delay);
        this._selectedElement.setAttribute('data-zaemit-motion-trigger', trigger);

        // @keyframes를 선택된 요소의 document에 주입
        this._injectKeyframes();

        // 즉시 미리보기
        this._previewMotion();

        this._updateUI();
        this.emit('motion:applied', { element: this._selectedElement, motion: motionName, oldMotion });
    }

    /**
     * 모션 제거
     */
    _removeMotion() {
        if (!this._selectedElement) return;

        const oldMotion = this._selectedElement.getAttribute('data-zaemit-motion') || '';

        this._selectedElement.removeAttribute('data-zaemit-motion');
        this._selectedElement.removeAttribute('data-zaemit-motion-duration');
        this._selectedElement.removeAttribute('data-zaemit-motion-delay');
        this._selectedElement.removeAttribute('data-zaemit-motion-trigger');
        this._selectedElement.style.animation = '';
        this._selectedElement.style.opacity = '';
        this._selectedElement.style.transform = '';

        this._updateUI();
        this.emit('motion:removed', { element: this._selectedElement, oldMotion });
    }

    /**
     * 모션 미리보기 (선택된 요소에 애니메이션 재생)
     */
    _previewMotion() {
        if (!this._selectedElement) return;

        const motionName = this._selectedElement.getAttribute('data-zaemit-motion');
        if (!motionName) return;

        const duration = this._selectedElement.getAttribute('data-zaemit-motion-duration') || '0.5s';
        const delay = this._selectedElement.getAttribute('data-zaemit-motion-delay') || '0s';

        // @keyframes 주입 확인
        this._injectKeyframes();

        // 애니메이션 리셋 후 재생
        this._selectedElement.style.animation = 'none';
        // reflow 강제
        void this._selectedElement.offsetHeight;
        this._selectedElement.style.animation = `zaemit-${motionName} ${duration} ${delay} ease both`;
    }

    /**
     * 선택된 요소의 document에 @keyframes 주입
     * (ownerDocument를 사용하므로 multiCanvas에서도 올바른 document에 주입)
     */
    _injectKeyframes() {
        const doc = this._getElementDocument();
        if (!doc) {
            console.warn('[MotionManager] No document found for selected element');
            return;
        }

        if (!doc.getElementById('zaemit-motion-keyframes')) {
            const style = doc.createElement('style');
            style.id = 'zaemit-motion-keyframes';
            style.textContent = MotionManager.KEYFRAMES;
            (doc.head || doc.documentElement).appendChild(style);
        }
    }

    /**
     * 특정 iframe document에 @keyframes + observer 주입
     * (iframe 리로드 후 data-zaemit-motion 요소가 있으면 재주입)
     */
    reinjectAssets(iframeDoc) {
        if (!iframeDoc) return;

        // @keyframes 주입
        if (!iframeDoc.getElementById('zaemit-motion-keyframes')) {
            // data-zaemit-motion 속성이 있는 요소가 있을 때만 주입
            if (iframeDoc.querySelector('[data-zaemit-motion]')) {
                const style = iframeDoc.createElement('style');
                style.id = 'zaemit-motion-keyframes';
                style.textContent = MotionManager.KEYFRAMES;
                (iframeDoc.head || iframeDoc.documentElement).appendChild(style);

                // Observer 스크립트 주입
                if (!iframeDoc.getElementById('zaemit-motion-observer')) {
                    const script = iframeDoc.createElement('script');
                    script.id = 'zaemit-motion-observer';
                    script.textContent = MotionManager.OBSERVER_SCRIPT;
                    iframeDoc.body.appendChild(script);
                }
            }
        }
    }
}

export default MotionManager;
