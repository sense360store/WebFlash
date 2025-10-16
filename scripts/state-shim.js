(function () {
    const DEFAULT_STATE = Object.freeze({
        mount: null,
        power: null,
        airiq: 'none',
        presence: 'none',
        comfort: 'none',
        fan: 'none',
        step: 1
    });

    const listeners = new Set();
    let cachedState = buildSnapshot();

    function safeConfiguration() {
        try {
            return typeof configuration === 'object' && configuration !== null ? configuration : {};
        } catch (error) {
            return {};
        }
    }

    function safeStep() {
        try {
            if (typeof currentStep === 'number' && Number.isFinite(currentStep)) {
                return currentStep;
            }
        } catch (error) {
            // ignore
        }
        return DEFAULT_STATE.step;
    }

    function buildSnapshot() {
        const state = safeConfiguration();
        const mount = state.mounting || null;
        const fanValue = mount === 'wall' ? state.fan || 'none' : 'none';

        return {
            mount,
            power: state.power || null,
            airiq: state.airiq || 'none',
            presence: state.presence || 'none',
            comfort: state.comfort || 'none',
            fan: fanValue,
            step: safeStep()
        };
    }

    function cloneSnapshot(snapshot) {
        return { ...snapshot };
    }

    function notifyListeners({ force = false } = {}) {
        const nextState = buildSnapshot();
        const keys = Object.keys(DEFAULT_STATE);
        const hasChanged = force || keys.some(key => cachedState[key] !== nextState[key]);

        if (!hasChanged) {
            return;
        }

        cachedState = nextState;
        listeners.forEach(listener => {
            try {
                listener(cloneSnapshot(cachedState));
            } catch (error) {
                console.error('WebFlash state subscriber failed', error);
            }
        });
    }

    function subscribe(listener, options = {}) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        listeners.add(listener);

        if (!options.silent) {
            try {
                listener(cloneSnapshot(cachedState));
            } catch (error) {
                console.error('WebFlash state subscriber failed during init', error);
            }
        }

        return () => {
            listeners.delete(listener);
        };
    }

    function wrapAndNotify(functionName) {
        const original = window[functionName];
        if (typeof original !== 'function') {
            return;
        }

        window[functionName] = function (...args) {
            const result = original.apply(this, args);
            notifyListeners();
            return result;
        };
    }

    window.webflashWizard = window.webflashWizard || {};
    window.webflashWizard.state = {
        getDefaultState: () => cloneSnapshot(DEFAULT_STATE),
        getState: () => cloneSnapshot(cachedState),
        getStep: () => cachedState.step,
        subscribe,
        notify: () => notifyListeners({ force: true })
    };

    [
        'handleMountingChange',
        'handlePowerChange',
        'updateConfiguration',
        'applyConfiguration',
        'setStep',
        'initializeFromUrl'
    ].forEach(wrapAndNotify);

    document.addEventListener('DOMContentLoaded', () => {
        cachedState = buildSnapshot();
        notifyListeners({ force: true });
    });
})();
