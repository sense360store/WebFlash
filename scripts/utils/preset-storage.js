import { replaceState, setStep, getStep } from '../state.js';

const MEMORY_STORAGE = new Map();

const memoryStorageAdapter = {
    getItem(key) {
        return MEMORY_STORAGE.has(key) ? MEMORY_STORAGE.get(key) : null;
    },
    setItem(key, value) {
        MEMORY_STORAGE.set(key, value);
    },
    removeItem(key) {
        MEMORY_STORAGE.delete(key);
    }
};

const PRESET_STORAGE_OPTIONS = Object.freeze({
    storageKey: 'wizard.presets',
    maxEntries: 20
});

const presetCache = new Map();

function resolveStorage(options = {}) {
    if (options.storage && typeof options.storage.getItem === 'function' && typeof options.storage.setItem === 'function') {
        return options.storage;
    }

    if (typeof window !== 'undefined' && window?.localStorage && typeof window.localStorage.getItem === 'function') {
        return window.localStorage;
    }

    return memoryStorageAdapter;
}

function resolveOptions(options = {}) {
    const storageKey = typeof options.storageKey === 'string' && options.storageKey.trim()
        ? options.storageKey.trim()
        : PRESET_STORAGE_OPTIONS.storageKey;

    const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
        ? Math.floor(options.maxEntries)
        : PRESET_STORAGE_OPTIONS.maxEntries;

    return {
        storageKey,
        maxEntries,
        storage: resolveStorage(options)
    };
}

function clonePreset(preset) {
    if (typeof structuredClone === 'function') {
        return structuredClone(preset);
    }

    return JSON.parse(JSON.stringify(preset));
}

function readPresetEntries(options = {}) {
    const { storage, storageKey } = resolveOptions(options);
    let raw = null;

    try {
        raw = storage.getItem(storageKey);
    } catch (error) {
        console.warn('[preset-storage] Failed to read from storage', error);
        return [];
    }

    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter(entry => entry && typeof entry === 'object');
        }
    } catch (error) {
        console.warn('[preset-storage] Failed to parse stored presets', error);
    }

    return [];
}

function writePresetEntries(entries, options = {}) {
    const { storage, storageKey } = resolveOptions(options);
    try {
        storage.setItem(storageKey, JSON.stringify(entries));
    } catch (error) {
        console.warn('[preset-storage] Failed to write presets to storage', error);
    }
}

function normalizePresetState(state = {}) {
    const normalized = {
        mount: normalizeStringChoice(state.mount, ['wall', 'ceiling']),
        power: normalizeStringChoice(state.power, ['usb', 'poe', 'pwr']),
        airiq: normalizeStringChoice(state.airiq, ['none', 'base', 'pro'], 'none'),
        presence: normalizeStringChoice(state.presence, ['none', 'base', 'pro'], 'none'),
        comfort: normalizeStringChoice(state.comfort, ['none', 'base'], 'none'),
        fan: normalizeStringChoice(state.fan, ['none', 'pwm', 'analog'], 'none')
    };

    if (normalized.mount !== 'wall') {
        normalized.fan = 'none';
    }

    const currentStep = Number.isFinite(state.currentStep) ? clampStep(Math.trunc(state.currentStep)) : null;
    if (currentStep !== null) {
        normalized.currentStep = currentStep;
    }

    return normalized;
}

function normalizePresetConfiguration(configuration = {}, state = {}) {
    const normalizedState = normalizePresetState(state);
    const normalized = {
        mounting: normalizeStringChoice(configuration.mounting ?? normalizedState.mount, ['wall', 'ceiling']),
        power: normalizeStringChoice(configuration.power ?? normalizedState.power, ['usb', 'poe', 'pwr']),
        airiq: normalizeStringChoice(configuration.airiq ?? normalizedState.airiq, ['none', 'base', 'pro'], 'none'),
        presence: normalizeStringChoice(configuration.presence ?? normalizedState.presence, ['none', 'base', 'pro'], 'none'),
        comfort: normalizeStringChoice(configuration.comfort ?? normalizedState.comfort, ['none', 'base'], 'none'),
        fan: normalizeStringChoice(configuration.fan ?? normalizedState.fan, ['none', 'pwm', 'analog'], 'none')
    };

    if (normalized.mounting !== 'wall') {
        normalized.fan = 'none';
    }

    return normalized;
}

function normalizePresetEntry(entry = {}) {
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : null;
    if (!id) {
        return null;
    }

    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Preset';
    const state = normalizePresetState(entry.state);
    const configuration = normalizePresetConfiguration(entry.configuration, state);
    const createdAt = normalizeTimestamp(entry.createdAt);
    const updatedAt = normalizeTimestamp(entry.updatedAt) ?? createdAt ?? Date.now();
    const appliedAt = normalizeTimestamp(entry.appliedAt);

    const normalized = {
        id,
        name,
        state,
        configuration,
        createdAt: createdAt ?? updatedAt,
        updatedAt,
        appliedAt: appliedAt ?? null
    };

    if (entry.meta && typeof entry.meta === 'object') {
        const meta = {};
        if (Number.isFinite(entry.meta.currentStep)) {
            meta.currentStep = clampStep(Math.trunc(entry.meta.currentStep));
        }
        normalized.meta = meta;
    } else if (state.currentStep !== undefined) {
        normalized.meta = { currentStep: state.currentStep };
    } else {
        normalized.meta = {};
    }

    return normalized;
}

function normalizeStringChoice(value, allowedValues, fallback = null) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized && allowedValues.includes(normalized)) {
        return normalized;
    }
    return fallback;
}

function normalizeTimestamp(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const timestamp = Math.trunc(value);
    return timestamp >= 0 ? timestamp : null;
}

function clampStep(step) {
    if (!Number.isFinite(step)) {
        return null;
    }

    const value = Math.max(1, Math.min(step, 4));
    return value;
}

function createPresetId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `preset-${Date.now()}-${random}`;
}

function mapConfigurationToState(configuration = {}) {
    return normalizePresetState({
        mount: configuration.mounting,
        power: configuration.power,
        airiq: configuration.airiq,
        presence: configuration.presence,
        comfort: configuration.comfort,
        fan: configuration.fan
    });
}

function ensurePresetList(options = {}) {
    const entries = readPresetEntries(options);
    const normalized = entries
        .map(entry => normalizePresetEntry(entry))
        .filter(Boolean);

    presetCache.clear();
    normalized.forEach(entry => {
        presetCache.set(entry.id, clonePreset(entry));
    });

    return normalized;
}

function listPresets(options = {}) {
    const presets = ensurePresetList(options)
        .sort((a, b) => {
            const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0;
            const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0;
            return bTime - aTime;
        })
        .map(preset => clonePreset(preset));

    return presets;
}

function getPreset(id, options = {}) {
    if (presetCache.has(id)) {
        return clonePreset(presetCache.get(id));
    }

    const presets = ensurePresetList(options);
    const preset = presets.find(entry => entry.id === id);
    return preset ? clonePreset(preset) : null;
}

function savePreset(name, configuration, options = {}) {
    const resolvedOptions = resolveOptions(options);
    const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'Preset';
    const state = options.state ? normalizePresetState(options.state) : mapConfigurationToState(configuration);
    const normalizedConfiguration = normalizePresetConfiguration(configuration, state);
    const timestamp = Date.now();
    const entries = ensurePresetList(resolvedOptions);

    const preset = {
        id: createPresetId(),
        name: safeName,
        state,
        configuration: normalizedConfiguration,
        createdAt: timestamp,
        updatedAt: timestamp,
        appliedAt: null,
        meta: {}
    };

    if (Number.isFinite(options.currentStep)) {
        const currentStep = clampStep(Math.trunc(options.currentStep));
        preset.state.currentStep = currentStep;
        preset.meta.currentStep = currentStep;
    }

    entries.unshift(preset);

    if (resolvedOptions.maxEntries > 0 && entries.length > resolvedOptions.maxEntries) {
        entries.length = resolvedOptions.maxEntries;
    }

    writePresetEntries(entries, resolvedOptions);
    presetCache.set(preset.id, clonePreset(preset));
    return clonePreset(preset);
}

function updatePresetById(id, updater, options = {}) {
    if (typeof updater !== 'function') {
        return null;
    }

    const resolvedOptions = resolveOptions(options);
    const entries = ensurePresetList(resolvedOptions);
    const index = entries.findIndex(entry => entry.id === id);

    if (index === -1) {
        return null;
    }

    const original = entries[index];
    const updated = updater(clonePreset(original));

    if (!updated) {
        return null;
    }

    entries[index] = normalizePresetEntry({
        ...original,
        ...updated,
        id
    });

    if (!entries[index]) {
        entries.splice(index, 1);
    }

    writePresetEntries(entries, resolvedOptions);
    presetCache.clear();
    entries.forEach(entry => presetCache.set(entry.id, clonePreset(entry)));

    return entries[index] ? clonePreset(entries[index]) : null;
}

function renamePreset(id, newName, options = {}) {
    const trimmed = typeof newName === 'string' && newName.trim() ? newName.trim() : null;
    if (!trimmed) {
        return null;
    }

    return updatePresetById(id, preset => ({
        ...preset,
        name: trimmed,
        updatedAt: Date.now()
    }), options);
}

function deletePreset(id, options = {}) {
    const resolvedOptions = resolveOptions(options);
    const entries = ensurePresetList(resolvedOptions);
    const index = entries.findIndex(entry => entry.id === id);

    if (index === -1) {
        return false;
    }

    entries.splice(index, 1);
    writePresetEntries(entries, resolvedOptions);
    presetCache.delete(id);
    return true;
}

function markPresetApplied(id, options = {}) {
    return updatePresetById(id, preset => {
        const now = Date.now();
        const currentStep = Number.isFinite(options.currentStep)
            ? clampStep(Math.trunc(options.currentStep))
            : (preset.state?.currentStep ?? null);

        const nextPreset = {
            ...preset,
            appliedAt: now,
            updatedAt: now
        };

        if (currentStep !== null) {
            nextPreset.state = {
                ...preset.state,
                currentStep
            };
            nextPreset.meta = {
                ...preset.meta,
                currentStep
            };
        }

        return nextPreset;
    }, options);
}

function generatePresetName(state = {}) {
    const normalized = normalizePresetState(state);
    const parts = [];

    if (normalized.mount) {
        parts.push(capitalize(normalized.mount));
    }

    if (normalized.power) {
        parts.push(formatPower(normalized.power));
    }

    ['airiq', 'presence', 'comfort', 'fan'].forEach(key => {
        const value = normalized[key];
        if (!value || value === 'none') {
            return;
        }

        parts.push(formatModuleName(key, value));
    });

    return parts.length ? parts.join(' / ') : 'Preset';
}

function capitalize(value) {
    if (!value) {
        return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPower(value) {
    if (value === 'usb') {
        return 'USB Power';
    }
    if (value === 'poe') {
        return 'PoE Module';
    }
    if (value === 'pwr') {
        return 'PWR Module';
    }
    return capitalize(value);
}

function formatModuleName(moduleKey, value) {
    const labels = {
        airiq: {
            base: 'AirIQ Base',
            pro: 'AirIQ Pro'
        },
        presence: {
            base: 'Presence Base',
            pro: 'Presence Pro'
        },
        comfort: {
            base: 'Comfort Base'
        },
        fan: {
            pwm: 'Fan PWM',
            analog: 'Fan Analog'
        }
    };

    const mapping = labels[moduleKey];
    if (mapping && mapping[value]) {
        return mapping[value];
    }

    return `${capitalize(moduleKey)} ${capitalize(value)}`.trim();
}

function getCurrentWizardStep() {
    return getStep();
}

function applyPresetStateToWizard(state = {}) {
    if (!state || typeof state !== 'object') {
        return;
    }

    const normalized = normalizePresetState(state);
    const { currentStep, ...wizardState } = normalized;

    replaceState(wizardState);

    if (currentStep && Number.isFinite(currentStep)) {
        setStep(currentStep, { animate: false });
    }
}

export {
    presetCache,
    listPresets,
    getPreset,
    savePreset,
    renamePreset,
    deletePreset,
    markPresetApplied,
    generatePresetName,
    getCurrentWizardStep,
    applyPresetStateToWizard,
    PRESET_STORAGE_OPTIONS
};
