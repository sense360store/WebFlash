import { getDefaultState, getState, getStep, replaceState, setState, setStep } from './state.js';

const allowedOptions = Object.freeze({
    mount: ['wall', 'ceiling'],
    power: ['usb', 'poe', 'pwr'],
    airiq: ['none', 'base', 'pro'],
    presence: ['none', 'base', 'pro'],
    comfort: ['none', 'base'],
    fan: ['none', 'pwm', 'analog']
});

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
    const providedKeys = new Set();
    const parsed = { ...defaults };

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
        step: parsedStep
    };
}

function updateFromLocation(options = {}) {
    const { state, providedKeys, step } = parseFromLocation();
    replaceState(state, options);
    if (typeof step === 'number') {
        setStep(step, options);
    }
    return { state, providedKeys, step };
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

function applyPreset(statePatch = {}) {
    const cleanState = sanitiseState(statePatch);
    setState(cleanState);
    updateUrl(cleanState, getStep());
}

const api = {
    allowedOptions,
    applyPreset,
    createSharableLink,
    getMaxReachableStep,
    parseFromLocation,
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
    getMaxReachableStep,
    parseFromLocation,
    stateToSearchParams,
    updateFromLocation,
    updateUrl
};
