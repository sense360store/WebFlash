const PREF_KEYS = {
    rememberChoices: 'sense360.rememberChoices',
    lastWizardState: 'sense360.lastWizardState'
};

function resolveKey(key) {
    return PREF_KEYS[key] || key;
}

function getStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        console.warn('Local storage is not available:', error);
        return null;
    }
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
