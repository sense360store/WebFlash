import { getDefaultState, getState, getStep, replaceState, setState, setStep } from './state.js';

const allowedOptions = Object.freeze({
    mount: ['wall', 'ceiling'],
    power: ['usb', 'poe', 'pwr'],
    airiq: ['none', 'base', 'pro'],
    presence: ['none', 'base', 'pro'],
    comfort: ['none', 'base'],
    fan: ['none', 'pwm', 'analog']
});

const recommendedPreset = Object.freeze({
    name: 'recommended',
    label: 'Recommended bundle',
    description: 'Wall mount with USB power plus AirIQ Base and Presence Base modules—our go-to starter bundle.',
    state: Object.freeze({
        mount: 'wall',
        power: 'usb',
        airiq: 'base',
        presence: 'base',
        comfort: 'none',
        fan: 'none'
    })
});

const presetRegistry = new Map([[recommendedPreset.name, recommendedPreset]]);

const keyAliases = new Map([
    ['mounting', 'mount'],
    ['mount', 'mount'],
    ['power', 'power'],
    ['airiq', 'airiq'],
    ['presence', 'presence'],
    ['comfort', 'comfort'],
    ['fan', 'fan']
]);

function normaliseKey(key) {
    return keyAliases.get(key) || null;
}

function sanitiseState(partialState = {}) {
    const defaults = getDefaultState();
    const cleanState = { ...defaults };

    Object.entries(partialState).forEach(([key, value]) => {
        const normalisedKey = normaliseKey(key);
        if (!normalisedKey) {
            return;
        }

        const allowed = allowedOptions[normalisedKey];
        if (!allowed) {
            return;
        }

        if (typeof value === 'string' && allowed.includes(value)) {
            cleanState[normalisedKey] = value;
        }
    });

    if (cleanState.mount === 'ceiling') {
        cleanState.fan = 'none';
    }

    return cleanState;
}

function sanitisePresetState(state = {}) {
    return sanitiseState(state);
}

const presetStates = new Map(
    Array.from(presetRegistry.entries()).map(([name, preset]) => [
        name,
        sanitisePresetState(preset.state)
    ])
);

function getPresetByName(name) {
    if (!name) {
        return null;
    }

    const key = name.toString().trim().toLowerCase();
    return presetRegistry.get(key) || null;
}

function getMatchingPreset(state = getState()) {
    const target = sanitiseState(state);
    const keys = Object.keys(allowedOptions);

    for (const [name, presetState] of presetStates.entries()) {
        const matches = keys.every((key) => (target[key] || 'none') === (presetState[key] || 'none'));
        if (matches) {
            return presetRegistry.get(name) || null;
        }
    }

    return null;
}

function parseFromLocation() {
    const combinedParams = new URLSearchParams();
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
    const hashParams = new URLSearchParams(hash);

    hashParams.forEach((value, key) => {
        combinedParams.set(key, value);
    });
    searchParams.forEach((value, key) => {
        combinedParams.set(key, value);
    });

    const defaults = getDefaultState();
    const presetParam = combinedParams.get('preset');
    const preset = getPresetByName(presetParam);
    const providedKeys = new Set();
    const baseState = preset ? { ...defaults, ...sanitisePresetState(preset.state) } : { ...defaults };
    const parsed = { ...baseState };

    combinedParams.forEach((value, key) => {
        const normalisedKey = normaliseKey(key);
        if (!normalisedKey) {
            return;
        }

        const allowed = allowedOptions[normalisedKey];
        if (!allowed || !allowed.includes(value)) {
            return;
        }

        parsed[normalisedKey] = value;
        providedKeys.add(normalisedKey);
    });

    if (parsed.mount === 'ceiling') {
        parsed.fan = 'none';
    }

    let parsedStep = null;
    const stepParam = combinedParams.get('step');
    if (stepParam) {
        const numericStep = parseInt(stepParam, 10);
        if (!Number.isNaN(numericStep)) {
            parsedStep = Math.max(1, numericStep);
        }
    }

    return {
        state: parsed,
        providedKeys,
        step: parsedStep,
        preset: preset ? preset.name : null
    };
}

function updateFromLocation(options = {}) {
    const { state, providedKeys, step, preset } = parseFromLocation();
    replaceState(state, options);
    if (typeof step === 'number') {
        setStep(step, options);
    }
    return { state, providedKeys, step, preset };
}

function getMaxReachableStep(state = getState()) {
    if (!state.mount) {
        return 1;
    }

    if (!state.power) {
        return 2;
    }

    return 4;
}

function stateToSearchParams(state = getState(), step = getStep()) {
    const params = new URLSearchParams();

    if (state.mount) {
        params.set('mount', state.mount);
    }

    if (state.power) {
        params.set('power', state.power);
    }

    params.set('airiq', state.airiq || 'none');
    params.set('presence', state.presence || 'none');
    params.set('comfort', state.comfort || 'none');

    if (state.mount === 'wall') {
        params.set('fan', state.fan || 'none');
    } else {
        params.set('fan', 'none');
    }

    const preset = getMatchingPreset(state);
    if (preset) {
        params.set('preset', preset.name);
    }

    if (Number.isFinite(step)) {
        params.set('step', String(Math.max(1, Math.min(4, Math.floor(step)))));
    }

    return params;
}

function updateUrl(state = getState(), step = getStep()) {
    const params = stateToSearchParams(state, step);
    const paramString = params.toString();
    const newUrl = paramString ? `${window.location.pathname}?${paramString}` : window.location.pathname;
    history.replaceState(null, '', newUrl);
    return newUrl;
}

function createSharableLink(baseUrl, state = getState(), step = getStep()) {
    const urlBase = baseUrl || `${window.location.origin}${window.location.pathname}`;
    const params = stateToSearchParams(state, step);
    const query = params.toString();
    return query ? `${urlBase}?${query}` : urlBase;
}

function applyPreset(statePatch = {}, options = {}) {
    const cleanState = sanitiseState(statePatch);
    setState(cleanState);
    const targetStep = options && Number.isFinite(options.step) ? options.step : null;
    if (Number.isFinite(targetStep)) {
        setStep(targetStep);
    }
    updateUrl(cleanState, getStep());
    return cleanState;
}

const api = {
    allowedOptions,
    applyPreset,
    createSharableLink,
    getMatchingPreset,
    getMaxReachableStep,
    getPresetByName,
    parseFromLocation,
    recommendedPreset,
    stateToSearchParams,
    updateFromLocation,
    updateUrl
};

if (typeof window !== 'undefined') {
    window.queryPresets = api;
}

export {
    allowedOptions,
    applyPreset,
    createSharableLink,
    getMatchingPreset,
    getMaxReachableStep,
    getPresetByName,
    parseFromLocation,
    recommendedPreset,
    stateToSearchParams,
    updateFromLocation,
    updateUrl
};
