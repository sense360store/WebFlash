const memoryStore = new Map();

export function getPref(key, defaultValue = null) {
    if (!memoryStore.has(key)) {
        return defaultValue;
    }

    return memoryStore.get(key);
}

export function setPref(key, value) {
    if (value === null || value === undefined) {
        memoryStore.delete(key);
        return;
    }

    memoryStore.set(key, value);
}
