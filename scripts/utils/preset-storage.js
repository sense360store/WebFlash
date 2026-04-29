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
const PRESET_NAME_RULES = Object.freeze({
    minLength: 3,
    maxLength: 40
});

const presetCache = new Map();
const PRESET_EXPORT_SCHEMA_VERSION = 1;

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
        const storageError = new PresetStorageError('read_failed', 'Failed to read presets from storage', error);
        console.warn('[preset-storage] Failed to read from storage', storageError);
        return { ok: false, error: storageError, data: [] };
    }

    if (!raw) {
        return { ok: true, error: null, data: [] };
    }

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return {
                ok: true,
                error: null,
                data: parsed.filter(entry => entry && typeof entry === 'object')
            };
        }
    } catch (error) {
        const parseError = new PresetStorageError('parse_failed', 'Failed to parse stored presets', error);
        console.warn('[preset-storage] Failed to parse stored presets', parseError);
        return { ok: false, error: parseError, data: [] };
    }

    return { ok: true, error: null, data: [] };
}

function writePresetEntries(entries, options = {}) {
    const { storage, storageKey } = resolveOptions(options);
    try {
        storage.setItem(storageKey, JSON.stringify(entries));
        return { ok: true, error: null, data: null };
    } catch (error) {
        const storageError = new PresetStorageError('write_failed', 'Failed to write presets to storage', error);
        console.warn('[preset-storage] Failed to write presets to storage', storageError);
        return { ok: false, error: storageError, data: null };
    }
}

function normalizePresetState(state = {}) {
    const normalized = {
        mount: normalizeStringChoice(state.mount, ['wall', 'ceiling']),
        power: normalizeStringChoice(state.power, ['usb', 'poe', 'pwr']),
        airiq: normalizeStringChoice(state.airiq, ['none', 'base', 'pro'], 'none'),
        fan: normalizeStringChoice(state.fan, ['none', 'pwm', 'analog'], 'none'),
        voice: normalizeStringChoice(state.voice, ['none'], 'none')
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
        fan: normalizeStringChoice(configuration.fan ?? normalizedState.fan, ['none', 'pwm', 'analog'], 'none'),
        voice: normalizeStringChoice(configuration.voice ?? normalizedState.voice, ['none'], 'none')
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

    const validatedName = validatePresetName(entry.name, { allowEmpty: true });
    const name = validatedName.normalized || 'Preset';
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

function validatePresetName(value, options = {}) {
    const allowEmpty = options.allowEmpty !== false;
    const raw = typeof value === 'string' ? value : '';
    const normalized = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();

    if (!normalized) {
        return {
            valid: allowEmpty,
            normalized: '',
            reason: allowEmpty ? null : 'empty',
            message: allowEmpty ? '' : 'Enter a preset name.'
        };
    }

    if (normalized.length < PRESET_NAME_RULES.minLength) {
        return {
            valid: false,
            normalized,
            reason: 'minLength',
            message: `Preset names must be at least ${PRESET_NAME_RULES.minLength} characters.`
        };
    }

    if (normalized.length > PRESET_NAME_RULES.maxLength) {
        return {
            valid: false,
            normalized,
            reason: 'maxLength',
            message: `Preset names must be ${PRESET_NAME_RULES.maxLength} characters or fewer.`
        };
    }

    return {
        valid: true,
        normalized,
        reason: null,
        message: ''
    };
}

function createPresetId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `preset-${Date.now()}-${random}`;
}

function normalizePresetName(name) {
    if (typeof name !== 'string') {
        return '';
    }

    return name.trim().normalize('NFKC').toLocaleLowerCase();
}

function mapConfigurationToState(configuration = {}) {
    return normalizePresetState({
        mount: configuration.mounting,
        power: configuration.power,
        airiq: configuration.airiq,
        fan: configuration.fan
    });
}

function migrateDeprecatedPresetFields(entries = []) {
    if (!Array.isArray(entries)) {
        return { entries: [], changed: false };
    }

    let changed = false;
    const migrated = entries.map(entry => {
        if (!entry || typeof entry !== 'object') {
            return entry;
        }

        const nextEntry = { ...entry };

        if (nextEntry.state && typeof nextEntry.state === 'object' && !Array.isArray(nextEntry.state)) {
            const { presence, comfort, ...restState } = nextEntry.state;
            if (presence !== undefined || comfort !== undefined) {
                changed = true;
            }
            nextEntry.state = restState;
        }

        if (nextEntry.configuration && typeof nextEntry.configuration === 'object' && !Array.isArray(nextEntry.configuration)) {
            const { presence, comfort, ...restConfig } = nextEntry.configuration;
            if (presence !== undefined || comfort !== undefined) {
                changed = true;
            }
            nextEntry.configuration = restConfig;
        }

        return nextEntry;
    });

    return { entries: migrated, changed };
}

function ensurePresetList(options = {}) {
    const readResult = readPresetEntries(options);
    if (!readResult.ok) {
        return { ok: false, error: readResult.error, data: [] };
    }

    const migrated = migrateDeprecatedPresetFields(readResult.data);
    if (migrated.changed) {
        writePresetEntries(migrated.entries, options);
    }

    const normalized = migrated.entries
        .map(entry => normalizePresetEntry(entry))
        .filter(Boolean);

    presetCache.clear();
    normalized.forEach(entry => {
        presetCache.set(entry.id, clonePreset(entry));
    });

    return { ok: true, error: null, data: normalized };
}

function listPresets(options = {}) {
    const ensured = ensurePresetList(options);
    if (!ensured.ok) {
        return { ok: false, error: ensured.error, data: [] };
    }

    const presets = ensured.data
        .sort((a, b) => {
            const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0;
            const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0;
            return bTime - aTime;
        })
        .map(preset => clonePreset(preset));

    return { ok: true, error: null, data: presets };
}

function getPreset(id, options = {}) {
    if (presetCache.has(id)) {
        return { ok: true, error: null, data: clonePreset(presetCache.get(id)) };
    }

    const ensured = ensurePresetList(options);
    if (!ensured.ok) {
        return { ok: false, error: ensured.error, data: null };
    }

    const preset = ensured.data.find(entry => entry.id === id);
    return { ok: true, error: null, data: preset ? clonePreset(preset) : null };
}

function savePreset(name, configuration, options = {}) {
    const resolvedOptions = resolveOptions(options);
    const nameValidation = validatePresetName(name, { allowEmpty: true });
    const safeName = nameValidation.normalized || 'Preset';
    const state = options.state ? normalizePresetState(options.state) : mapConfigurationToState(configuration);
    const normalizedConfiguration = normalizePresetConfiguration(configuration, state);
    const timestamp = Date.now();
    const ensured = ensurePresetList(resolvedOptions);
    if (!ensured.ok) {
        return { ok: false, error: ensured.error, data: null };
    }
    const entries = ensured.data;

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

    const writeResult = writePresetEntries(entries, resolvedOptions);
    if (!writeResult.ok) {
        return { ok: false, error: writeResult.error, data: null };
    }
    presetCache.set(preset.id, clonePreset(preset));
    return { ok: true, error: null, data: clonePreset(preset) };
}

function upsertPresetByName(name, configuration, options = {}) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) {
        return null;
    }

    const resolvedOptions = resolveOptions(options);
    const ensured = ensurePresetList(resolvedOptions);
    if (!ensured.ok) {
        return { ok: false, error: ensured.error, data: null };
    }
    const entries = ensured.data;
    const existing = entries.find(entry => normalizePresetName(entry.name) === normalizedName);

    if (!existing) {
        return savePreset(name, configuration, options);
    }

    return updatePresetById(existing.id, preset => {
        const state = options.state ? normalizePresetState(options.state) : mapConfigurationToState(configuration);
        const normalizedConfiguration = normalizePresetConfiguration(configuration, state);
        const now = Date.now();
        const nextPreset = {
            ...preset,
            name: typeof name === 'string' && name.trim() ? name.trim() : preset.name,
            state,
            configuration: normalizedConfiguration,
            updatedAt: now
        };

        if (Number.isFinite(options.currentStep)) {
            const currentStep = clampStep(Math.trunc(options.currentStep));
            nextPreset.state.currentStep = currentStep;
            nextPreset.meta = {
                ...preset.meta,
                currentStep
            };
        }

        return nextPreset;
    }, resolvedOptions);
}

function updatePresetById(id, updater, options = {}) {
    if (typeof updater !== 'function') {
        return { ok: true, error: null, data: null };
    }

    const resolvedOptions = resolveOptions(options);
    const ensured = ensurePresetList(resolvedOptions);
    if (!ensured.ok) {
        return { ok: false, error: ensured.error, data: null };
    }
    const entries = ensured.data;
    const index = entries.findIndex(entry => entry.id === id);

    if (index === -1) {
        return { ok: true, error: null, data: null };
    }

    const original = entries[index];
    const updated = updater(clonePreset(original));

    if (!updated) {
        return { ok: true, error: null, data: null };
    }

    entries[index] = normalizePresetEntry({
        ...original,
        ...updated,
        id
    });

    if (!entries[index]) {
        entries.splice(index, 1);
    }

    const writeResult = writePresetEntries(entries, resolvedOptions);
    if (!writeResult.ok) {
        return { ok: false, error: writeResult.error, data: null };
    }
    presetCache.clear();
    entries.forEach(entry => presetCache.set(entry.id, clonePreset(entry)));

    return { ok: true, error: null, data: entries[index] ? clonePreset(entries[index]) : null };
}

function renamePreset(id, newName, options = {}) {
    const trimmed = typeof newName === 'string' && newName.trim() ? newName.trim() : null;
    if (!trimmed) {
        return { ok: true, error: null, data: null };
    }

    return updatePresetById(id, preset => ({
        ...preset,
        name: trimmed,
        updatedAt: Date.now()
    }), options);
}

function deletePreset(id, options = {}) {
    const resolvedOptions = resolveOptions(options);
    const ensured = ensurePresetList(resolvedOptions);
    if (!ensured.ok) {
        return { ok: false, error: ensured.error, data: false };
    }
    const entries = ensured.data;
    const index = entries.findIndex(entry => entry.id === id);

    if (index === -1) {
        return { ok: true, error: null, data: false };
    }

    entries.splice(index, 1);
    const writeResult = writePresetEntries(entries, resolvedOptions);
    if (!writeResult.ok) {
        return { ok: false, error: writeResult.error, data: false };
    }
    presetCache.delete(id);
    return { ok: true, error: null, data: true };
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

function buildHardwareTargetFromConfiguration(configuration = {}) {
    const mounting = configuration.mounting || 'unknown';
    const power = configuration.power || 'unknown';
    return `sense360-${mounting}-${power}`;
}

function serializePresetConfig(preset, options = {}) {
    if (!preset || typeof preset !== 'object') {
        return null;
    }

    const normalized = normalizePresetEntry(preset);
    if (!normalized) {
        return null;
    }

    const schemaVersion = Number.isFinite(options.schemaVersion)
        ? Math.trunc(options.schemaVersion)
        : PRESET_EXPORT_SCHEMA_VERSION;
    const hardwareTarget = typeof options.hardwareTarget === 'string' && options.hardwareTarget.trim()
        ? options.hardwareTarget.trim()
        : buildHardwareTargetFromConfiguration(normalized.configuration);

    return {
        schemaVersion,
        hardwareTarget,
        preset: clonePreset(normalized)
    };
}

function deserializePresetConfig(payload) {
    const validation = validatePresetImportPayload(payload);
    if (!validation.ok) {
        return validation;
    }

    return {
        ok: true,
        data: validation.data,
        metadata: validation.metadata
    };
}

function validatePresetImportPayload(payload) {
    const fieldErrors = [];

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            ok: false,
            code: 'invalid_payload_shape',
            message: 'Import payload must be an object.',
            fieldErrors: [{ path: '', message: 'Expected a JSON object payload.' }]
        };
    }

    const requiredTopLevelKeys = ['schemaVersion', 'hardwareTarget', 'preset'];
    requiredTopLevelKeys.forEach(key => {
        if (!(key in payload)) {
            fieldErrors.push({ path: key, message: `Missing required key "${key}".` });
        }
    });

    if (fieldErrors.length) {
        return { ok: false, code: 'missing_required_keys', message: 'Payload is missing required top-level keys.', fieldErrors };
    }

    if (!Number.isFinite(payload.schemaVersion)) {
        fieldErrors.push({ path: 'schemaVersion', message: 'schemaVersion must be a finite number.' });
    }

    if (typeof payload.hardwareTarget !== 'string' || !payload.hardwareTarget.trim()) {
        fieldErrors.push({ path: 'hardwareTarget', message: 'hardwareTarget must be a non-empty string.' });
    }

    const preset = payload.preset;
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
        fieldErrors.push({ path: 'preset', message: 'preset must be an object.' });
    } else {
        ['id', 'name'].forEach(key => {
            if (!(key in preset)) {
                fieldErrors.push({ path: `preset.${key}`, message: `Missing required key "${key}".` });
            }
        });

        if (!('state' in preset) && !('configuration' in preset)) {
            fieldErrors.push({ path: 'preset', message: 'preset must include state or configuration.' });
        }

        const stateValue = preset.state;
        if (stateValue !== undefined && (typeof stateValue !== 'object' || stateValue === null || Array.isArray(stateValue))) {
            fieldErrors.push({ path: 'preset.state', message: 'preset.state must be an object when provided.' });
        }

        const configValue = preset.configuration;
        if (configValue !== undefined && (typeof configValue !== 'object' || configValue === null || Array.isArray(configValue))) {
            fieldErrors.push({ path: 'preset.configuration', message: 'preset.configuration must be an object when provided.' });
        }

        const enumValidations = [
            { path: 'preset.state.mount', value: preset.state?.mount, allowed: ['wall', 'ceiling'] },
            { path: 'preset.state.power', value: preset.state?.power, allowed: ['usb', 'poe', 'pwr'] },
            { path: 'preset.state.airiq', value: preset.state?.airiq, allowed: ['none', 'base', 'pro'] },
            { path: 'preset.state.fan', value: preset.state?.fan, allowed: ['none', 'pwm', 'analog'] },
                        { path: 'preset.state.voice', value: preset.state?.voice, allowed: ['none', 'base'] },
            { path: 'preset.configuration.mounting', value: preset.configuration?.mounting, allowed: ['wall', 'ceiling'] },
            { path: 'preset.configuration.power', value: preset.configuration?.power, allowed: ['usb', 'poe', 'pwr'] },
            { path: 'preset.configuration.airiq', value: preset.configuration?.airiq, allowed: ['none', 'base', 'pro'] },
            { path: 'preset.configuration.fan', value: preset.configuration?.fan, allowed: ['none', 'pwm', 'analog'] },
            { path: 'preset.configuration.voice', value: preset.configuration?.voice, allowed: ['none', 'base'] },
        ];

        enumValidations.forEach(({ path, value, allowed }) => {
            if (value === undefined || value === null) {
                return;
            }
            const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
            if (!normalized || !allowed.includes(normalized)) {
                fieldErrors.push({
                    path,
                    message: `Invalid value "${value}" for ${path}. Allowed values: ${allowed.join(', ')}.`
                });
            }
        });
    }

    if (fieldErrors.length) {
        return {
            ok: false,
            code: 'invalid_payload',
            message: 'Import payload validation failed.',
            fieldErrors
        };
    }

    const rawStateVoice = typeof payload?.preset?.state?.voice === 'string' ? payload.preset.state.voice.trim().toLowerCase() : '';
    const rawConfigVoice = typeof payload?.preset?.configuration?.voice === 'string' ? payload.preset.configuration.voice.trim().toLowerCase() : '';
    const hadCoreVoice = rawStateVoice === 'base' || rawConfigVoice === 'base';

    const normalizedPreset = normalizePresetEntry(payload.preset);
    if (!normalizedPreset) {
        return {
            ok: false,
            code: 'invalid_preset',
            message: 'Preset could not be normalized.',
            fieldErrors: [{ path: 'preset', message: 'Preset is invalid or missing required values.' }]
        };
    }

    const normalizedWithVoiceFallback = {
        ...normalizedPreset,
        state: {
            ...normalizedPreset.state,
            voice: 'none'
        },
        configuration: {
            ...normalizedPreset.configuration,
            voice: 'none'
        }
    };

    return {
        ok: true,
        data: normalizedWithVoiceFallback,
        metadata: {
            schemaVersion: Math.trunc(payload.schemaVersion),
            hardwareTarget: payload.hardwareTarget.trim(),
            notices: hadCoreVoice ? ['Core Voice is coming soon and was downgraded to Core.'] : []
        }
    };
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

    ['airiq', 'fan'].forEach(key => {
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
            base: 'AirIQ',
            pro: 'AirIQ'
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
    upsertPresetByName,
    normalizePresetName,
    renamePreset,
    deletePreset,
    markPresetApplied,
    generatePresetName,
    getCurrentWizardStep,
    applyPresetStateToWizard,
    PRESET_STORAGE_OPTIONS,
    PRESET_NAME_RULES,
    PRESET_EXPORT_SCHEMA_VERSION,
    serializePresetConfig,
    deserializePresetConfig,
    validatePresetImportPayload,
    validatePresetName
};
