const DEFAULT_CAPACITY = 300;

function normaliseCapacity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_CAPACITY;
    }
    return Math.max(1, Math.floor(numeric));
}

export function createRingBuffer(capacity = DEFAULT_CAPACITY) {
    const maxSize = normaliseCapacity(capacity);
    const buffer = new Array(maxSize);
    let head = 0;
    let size = 0;

    function push(line) {
        if (line === undefined || line === null) {
            return;
        }

        const value = String(line);
        buffer[head] = value;
        head = (head + 1) % maxSize;
        if (size < maxSize) {
            size += 1;
        }
    }

    function toArray() {
        if (size === 0) {
            return [];
        }

        const result = new Array(size);
        for (let i = 0; i < size; i += 1) {
            const index = (head - size + i + maxSize) % maxSize;
            result[i] = buffer[index];
        }
        return result;
    }

    function clear() {
        head = 0;
        size = 0;
        buffer.fill(undefined);
    }

    return Object.freeze({
        push,
        toArray,
        clear
    });
}
