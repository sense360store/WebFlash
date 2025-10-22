import { getPref, setPref, PREF_KEYS } from './prefs.js';

function clampStep(step, totalSteps) {
    const numeric = Number.parseInt(step, 10);

    if (!Number.isFinite(numeric) || numeric < 1) {
        return null;
    }

    if (Number.isFinite(totalSteps) && totalSteps > 0) {
        return Math.min(totalSteps, numeric);
    }

    return numeric;
}

function buildConfigurationSnapshot(configuration, defaultConfiguration = {}, allowedOptions = {}) {
    const snapshot = { ...defaultConfiguration };

    Object.keys(defaultConfiguration).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(configuration, key)) {
            return;
        }

        const value = configuration[key];

        if (value === null) {
            if (defaultConfiguration[key] === null) {
                snapshot[key] = null;
            }
            return;
        }

        const allowed = allowedOptions[key];
        if (!allowed || allowed.includes(value)) {
            snapshot[key] = value;
        }
    });

    if (snapshot.mounting !== 'wall') {
        snapshot.fan = 'none';
    }

    return snapshot;
}

export function normalizeRememberedState(rawState, options = {}) {
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
        return null;
    }

    const {
        defaultConfiguration = {},
        allowedOptions = {},
        totalSteps
    } = options;

    const configSource = rawState.configuration && typeof rawState.configuration === 'object'
        ? rawState.configuration
        : rawState;

    const normalizedConfiguration = { ...defaultConfiguration };
    let hasPersistedValue = false;

    Object.keys(defaultConfiguration).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(configSource, key)) {
            return;
        }

        const value = configSource[key];

        if (value === null) {
            if (defaultConfiguration[key] === null) {
                normalizedConfiguration[key] = null;
            }
            return;
        }

        const allowed = allowedOptions[key];
        if (!allowed || allowed.includes(value)) {
            normalizedConfiguration[key] = value;
            if (value !== defaultConfiguration[key]) {
                hasPersistedValue = true;
            }
        }
    });

    if (normalizedConfiguration.mounting !== 'wall') {
        normalizedConfiguration.fan = 'none';
    }

    const storedStep = rawState.currentStep ?? rawState.step ?? null;
    const normalizedStep = storedStep !== null && storedStep !== undefined
        ? clampStep(storedStep, totalSteps)
        : null;

    if (!hasPersistedValue && normalizedStep === null) {
        return null;
    }

    return {
        configuration: normalizedConfiguration,
        currentStep: normalizedStep
    };
}

export function isRememberEnabled() {
    return Boolean(getPref(PREF_KEYS.rememberChoices, false));
}

export function setRememberEnabled(enabled) {
    const normalized = Boolean(enabled);
    setPref(PREF_KEYS.rememberChoices, normalized);

    if (!normalized) {
        clearRememberedState();
    }
}

export function loadRememberedState(options = {}) {
    const rawState = getPref(PREF_KEYS.lastWizardState, null);
    const normalized = normalizeRememberedState(rawState, options);

    if (!normalized && rawState) {
        clearRememberedState();
    }

    return normalized;
}

export function persistRememberedState(configuration, options = {}) {
    if (!configuration || typeof configuration !== 'object') {
        return null;
    }

    const {
        defaultConfiguration = {},
        allowedOptions = {},
        totalSteps,
        currentStep
    } = options;

    const snapshot = buildConfigurationSnapshot(configuration, defaultConfiguration, allowedOptions);

    const payload = { configuration: snapshot };
    const normalizedStep = clampStep(currentStep, totalSteps);

    if (normalizedStep !== null) {
        payload.currentStep = normalizedStep;
    }

    setPref(PREF_KEYS.lastWizardState, payload);
    return payload;
}

export function clearRememberedState() {
    setPref(PREF_KEYS.lastWizardState, null);
}

const rememberStateApi = {
    isEnabled: isRememberEnabled,
    setEnabled: setRememberEnabled,
    load: loadRememberedState,
    persist: persistRememberedState,
    clear: clearRememberedState,
    normalize: normalizeRememberedState
};

if (typeof window !== 'undefined' && !window.wizardRememberState) {
    Object.defineProperty(window, 'wizardRememberState', {
        value: rememberStateApi,
        configurable: true,
        writable: false
    });
}

export default rememberStateApi;
