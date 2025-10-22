const PREF_KEYS = {
    rememberChoices: 'sense360.rememberChoices',
    lastWizardState: 'sense360.lastWizardState'
};

function resolveKey(key) {
    return PREF_KEYS[key] || key;
}

function resolveStorageCandidate(source) {
    if (!source) {
        return null;
    }

    const injected = source.__rememberStateStorage;
    if (injected && typeof injected.getItem === 'function') {
        return injected;
    }

    let storage;
    try {
        storage = source.localStorage;
    } catch (error) {
        console.warn('Failed to access localStorage on candidate source', error);
        return null;
    }

    if (storage && typeof storage.getItem === 'function') {
        return storage;
    }

    return null;
}

function getStorage() {
    const sources = [];

    if (typeof globalThis !== 'undefined') {
        sources.push(globalThis);

        if (globalThis.window && globalThis.window !== globalThis) {
            sources.push(globalThis.window);
        }
    }

    if (typeof global !== 'undefined' && !sources.includes(global)) {
        sources.push(global);

        if (global.window && !sources.includes(global.window)) {
            sources.push(global.window);
        }
    }

    if (typeof window !== 'undefined' && !sources.includes(window)) {
        sources.push(window);
    }

    for (const candidate of sources) {
        const storage = resolveStorageCandidate(candidate);
        if (storage) {
            return storage;
        }
    }

    console.warn('Local storage is not available: falling back to null storage');
    return null;
}

export function getPref(key, defaultValue = null) {
    const storage = getStorage();
    if (!storage) {
        return defaultValue;
    }

    const storageKey = resolveKey(key);
    const rawValue = storage.getItem(storageKey);

    if (rawValue === null) {
        return defaultValue;
    }

    try {
        return JSON.parse(rawValue);
    } catch (error) {
        console.warn('Failed to parse stored preference', storageKey, error);
        return defaultValue;
    }
}

export function setPref(key, value) {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    const storageKey = resolveKey(key);

    try {
        if (value === null || value === undefined) {
            storage.removeItem(storageKey);
        } else {
            storage.setItem(storageKey, JSON.stringify(value));
        }
    } catch (error) {
        console.warn('Failed to persist preference', storageKey, error);
    }
}

export { PREF_KEYS };
