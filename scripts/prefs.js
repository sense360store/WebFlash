const PREF_KEYS = {
    rememberChoices: 'sense360.rememberChoices',
    lastWizardState: 'sense360.lastWizardState'
};

function resolveKey(key) {
    return PREF_KEYS[key] || key;
}

const memoryStore = new Map();

export function getPref(key, defaultValue = null) {
    const storageKey = resolveKey(key);

    if (!memoryStore.has(storageKey)) {
        return defaultValue;
    }

    return memoryStore.get(storageKey);
}

export function setPref(key, value) {
    const storageKey = resolveKey(key);

    if (value === null || value === undefined) {
        memoryStore.delete(storageKey);
        return;
    }

    memoryStore.set(storageKey, value);
}

export { PREF_KEYS };
