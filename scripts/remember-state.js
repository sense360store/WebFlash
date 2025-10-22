import { getPref, setPref, PREF_KEYS } from './prefs.js';

const STORAGE_VERSION = 2;

const EMPTY_STORAGE = Object.freeze({
    version: STORAGE_VERSION,
    lastState: null,
    presets: [],
    activePresetId: null
});

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

function cloneStatePayload(state) {
    if (!state || typeof state !== 'object') {
        return null;
    }

    const cloned = {};

    if (state.configuration && typeof state.configuration === 'object') {
        cloned.configuration = { ...state.configuration };
    }

    if (Number.isFinite(state.currentStep)) {
        cloned.currentStep = state.currentStep;
    }

    return cloned;
}

function clonePresetEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        id: entry.id,
        name: entry.name,
        state: cloneStatePayload(entry.state),
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
    };
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

function sanitizePresetName(name, fallback = 'Preset') {
    if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed.length > 0) {
            return trimmed.slice(0, 120);
        }
    }

    return fallback;
}

function normalizePresetEntry(entry, options = {}) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const name = sanitizePresetName(entry.name ?? '', null);
    const state = normalizeRememberedState(entry.state, options);

    if (!id || !name || !state) {
        return null;
    }

    const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now();
    const updatedAt = Number.isFinite(entry.updatedAt) ? entry.updatedAt : createdAt;

    return {
        id,
        name,
        state,
        createdAt,
        updatedAt
    };
}

function normalizeStoredPayload(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
        return { ...EMPTY_STORAGE };
    }

    if (rawPayload.version >= 2 || Array.isArray(rawPayload.presets) || rawPayload.lastState) {
        const presets = Array.isArray(rawPayload.presets)
            ? rawPayload.presets
                .filter(item => item && typeof item === 'object' && typeof item.id === 'string')
                .map(item => ({
                    id: item.id,
                    name: sanitizePresetName(item.name ?? '', 'Preset'),
                    state: cloneStatePayload(item.state),
                    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
                    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now()
                }))
            : [];

        return {
            version: STORAGE_VERSION,
            lastState: cloneStatePayload(rawPayload.lastState),
            presets,
            activePresetId: typeof rawPayload.activePresetId === 'string'
                ? rawPayload.activePresetId
                : null
        };
    }

    return {
        version: STORAGE_VERSION,
        lastState: cloneStatePayload(rawPayload),
        presets: [],
        activePresetId: null
    };
}

function readStoredPayload() {
    const raw = getPref(PREF_KEYS.lastWizardState, null);
    return normalizeStoredPayload(raw);
}

function writeStoredPayload(payload) {
    const normalized = normalizeStoredPayload(payload);

    const hasState = Boolean(normalized.lastState);
    const hasPresets = normalized.presets.length > 0;

    if (!hasState && !hasPresets) {
        setPref(PREF_KEYS.lastWizardState, null);
        return;
    }

    setPref(PREF_KEYS.lastWizardState, {
        version: STORAGE_VERSION,
        lastState: cloneStatePayload(normalized.lastState),
        presets: normalized.presets.map(clonePresetEntry).filter(Boolean),
        activePresetId: normalized.activePresetId || null
    });
}

function generatePresetId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
    const payload = readStoredPayload();
    const normalized = normalizeRememberedState(payload.lastState, options);

    if (!normalized && payload.lastState) {
        payload.lastState = null;
        writeStoredPayload(payload);
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

    const stored = readStoredPayload();
    stored.lastState = payload;
    stored.activePresetId = null;
    writeStoredPayload(stored);
    return payload;
}

export function clearRememberedState() {
    const stored = readStoredPayload();
    stored.lastState = null;
    stored.activePresetId = null;
    writeStoredPayload(stored);
}

export function listPresets(options = {}) {
    const stored = readStoredPayload();
    return stored.presets
        .map(entry => normalizePresetEntry(entry, options))
        .filter(Boolean)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function savePreset(name, configuration, options = {}) {
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

    const stored = readStoredPayload();
    const presetEntry = {
        id: generatePresetId(),
        name: sanitizePresetName(name, 'Preset'),
        state: payload,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    stored.presets.push(presetEntry);
    stored.lastState = payload;
    stored.activePresetId = presetEntry.id;
    writeStoredPayload(stored);

    return normalizePresetEntry(presetEntry, options);
}

export function renamePreset(id, newName, options = {}) {
    if (!id) {
        return null;
    }

    const stored = readStoredPayload();
    const preset = stored.presets.find(entry => entry.id === id);

    if (!preset) {
        return null;
    }

    preset.name = sanitizePresetName(newName, preset.name || 'Preset');
    preset.updatedAt = Date.now();
    writeStoredPayload(stored);

    return normalizePresetEntry(preset, options);
}

export function deletePreset(id) {
    if (!id) {
        return false;
    }

    const stored = readStoredPayload();
    const index = stored.presets.findIndex(entry => entry.id === id);

    if (index === -1) {
        return false;
    }

    stored.presets.splice(index, 1);

    if (stored.activePresetId === id) {
        stored.activePresetId = null;
    }

    if (!stored.presets.length && !stored.lastState) {
        setPref(PREF_KEYS.lastWizardState, null);
    } else {
        writeStoredPayload(stored);
    }

    return true;
}

export function getPreset(id, options = {}) {
    if (!id) {
        return null;
    }

    const stored = readStoredPayload();
    const preset = stored.presets.find(entry => entry.id === id);

    return preset ? normalizePresetEntry(preset, options) : null;
}

export function markPresetApplied(id, options = {}) {
    const stored = readStoredPayload();

    if (!id) {
        stored.activePresetId = null;
        writeStoredPayload(stored);
        return null;
    }

    const preset = stored.presets.find(entry => entry.id === id);
    if (!preset) {
        stored.activePresetId = null;
        writeStoredPayload(stored);
        return null;
    }

    const normalized = normalizePresetEntry(preset, options);

    stored.activePresetId = id;
    stored.lastState = cloneStatePayload(preset.state);
    preset.updatedAt = Date.now();
    writeStoredPayload(stored);

    return normalized;
}

const rememberStateApi = {
    isEnabled: isRememberEnabled,
    setEnabled: setRememberEnabled,
    load: loadRememberedState,
    persist: persistRememberedState,
    clear: clearRememberedState,
    normalize: normalizeRememberedState,
    listPresets,
    savePreset,
    renamePreset,
    deletePreset,
    getPreset,
    markPresetApplied
};

if (typeof window !== 'undefined' && !window.wizardRememberState) {
    Object.defineProperty(window, 'wizardRememberState', {
        value: rememberStateApi,
        configurable: true,
        writable: false
    });
}

export default rememberStateApi;
