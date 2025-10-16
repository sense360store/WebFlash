const defaultState = Object.freeze({
    mount: null,
    power: null,
    airiq: 'none',
    presence: 'none',
    comfort: 'none',
    fan: 'none'
});

let configurationRef = {
    mount: defaultState.mount,
    power: defaultState.power,
    airiq: defaultState.airiq,
    presence: defaultState.presence,
    comfort: defaultState.comfort,
    fan: defaultState.fan
};

let currentStep = 1;
const listeners = new Set();

function cloneState() {
    return {
        mount: configurationRef.mount ?? configurationRef.mounting ?? defaultState.mount,
        power: configurationRef.power ?? defaultState.power,
        airiq: configurationRef.airiq ?? defaultState.airiq,
        presence: configurationRef.presence ?? defaultState.presence,
        comfort: configurationRef.comfort ?? defaultState.comfort,
        fan: configurationRef.fan ?? defaultState.fan
    };
}

function notify(options = {}) {
    if (options.silent) {
        return;
    }

    const snapshot = cloneState();
    const meta = { step: currentStep };

    listeners.forEach((listener) => {
        try {
            listener(snapshot, meta);
        } catch (error) {
            console.error('wizardState listener error', error);
        }
    });

    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('wizard:state-change', {
            detail: {
                state: snapshot,
                step: currentStep
            }
        }));
    }
}

function applyKeyValue(key, value) {
    const normalisedValue = value ?? defaultState[key];

    if (key === 'mount' || key === 'mounting') {
        configurationRef.mount = normalisedValue;
        configurationRef.mounting = normalisedValue;
    } else if (key in configurationRef) {
        configurationRef[key] = normalisedValue;
    }
}

function setState(partialState = {}, options = {}) {
    if (!configurationRef) {
        return;
    }

    let changed = false;

    Object.entries(partialState).forEach(([key, value]) => {
        const normalisedKey = key === 'mounting' ? 'mount' : key;
        const previous = cloneState()[normalisedKey];

        applyKeyValue(normalisedKey, value);

        if (previous !== cloneState()[normalisedKey]) {
            changed = true;
        }
    });

    if (changed) {
        notify(options);
    }
}

function replaceState(nextState = {}, options = {}) {
    const fullState = { ...defaultState, ...nextState };

    Object.keys(defaultState).forEach((key) => {
        applyKeyValue(key, fullState[key]);
    });

    notify(options);
}

function resetState(options = {}) {
    replaceState(defaultState, options);
}

function getState() {
    return cloneState();
}

function getDefaultState() {
    return { ...defaultState };
}

function subscribe(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    listeners.add(listener);
    listener(cloneState(), { step: currentStep });

    return () => {
        listeners.delete(listener);
    };
}

function attach(configuration, options = {}) {
    if (!configuration || typeof configuration !== 'object') {
        return;
    }

    configurationRef = configuration;
    if (!('mount' in configurationRef)) {
        configurationRef.mount = configurationRef.mounting ?? defaultState.mount;
    }

    Object.keys(defaultState).forEach((key) => {
        if (!(key in configurationRef)) {
            configurationRef[key] = defaultState[key];
        }
    });

    notify({ ...options, silent: true });
}

function getStep() {
    return currentStep;
}

function setStep(stepValue, options = {}) {
    const numericStep = Number(stepValue);
    if (!Number.isFinite(numericStep)) {
        return;
    }

    const boundedStep = Math.max(1, Math.floor(numericStep));

    if (currentStep === boundedStep) {
        return;
    }

    currentStep = boundedStep;
    notify(options);
}

const api = {
    attach,
    getState,
    getDefaultState,
    setState,
    replaceState,
    resetState,
    subscribe,
    getStep,
    setStep
};

if (typeof window !== 'undefined') {
    window.wizardState = api;
}

export {
    attach,
    getState,
    getDefaultState,
    getStep,
    replaceState,
    resetState,
    setState,
    setStep,
    subscribe
};
