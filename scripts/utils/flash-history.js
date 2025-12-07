/**
 * @fileoverview Flash history tracking for WebFlash.
 * Records firmware installation attempts in localStorage for troubleshooting.
 * @module utils/flash-history
 */

const STORAGE_KEY = 'webflash-flash-history';
const MAX_HISTORY_ENTRIES = 50;

/**
 * @typedef {Object} FlashHistoryEntry
 * @property {string} id - Unique entry identifier
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} configString - Configuration string (e.g., "Wall-USB-AirIQBase")
 * @property {string} firmwareVersion - Firmware version (e.g., "1.0.0")
 * @property {string} channel - Release channel (stable, beta, preview)
 * @property {string} status - Flash status: 'started', 'success', 'error'
 * @property {string} [errorMessage] - Error message if status is 'error'
 * @property {string} browser - Browser name
 * @property {number} duration - Duration in milliseconds (for completed flashes)
 */

/**
 * Storage adapter with fallback to memory if localStorage unavailable.
 */
const storage = (() => {
    let memoryStore = [];

    const isAvailable = () => {
        try {
            const test = '__webflash_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch {
            return false;
        }
    };

    return {
        read() {
            if (!isAvailable()) {
                return memoryStore;
            }
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            } catch (error) {
                console.warn('[flash-history] Failed to read from storage', error);
                return [];
            }
        },
        write(entries) {
            if (!isAvailable()) {
                memoryStore = entries;
                return;
            }
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
            } catch (error) {
                console.warn('[flash-history] Failed to write to storage', error);
            }
        }
    };
})();

/**
 * Generates a unique ID for history entries.
 * @returns {string}
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Gets the browser name from user agent.
 * @returns {string}
 */
function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Opera') || ua.includes('OPR/')) return 'Opera';
    return 'Unknown';
}

/**
 * Records a flash attempt starting.
 * @param {Object} params
 * @param {string} params.configString - Configuration string
 * @param {string} params.firmwareVersion - Firmware version
 * @param {string} params.channel - Release channel
 * @returns {string} Entry ID for updating later
 */
export function recordFlashStart({ configString, firmwareVersion, channel }) {
    const entries = storage.read();
    const entry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        configString: configString || 'Unknown',
        firmwareVersion: firmwareVersion || 'Unknown',
        channel: channel || 'Unknown',
        status: 'started',
        browser: getBrowserName(),
        duration: 0
    };

    entries.unshift(entry);

    // Trim to max entries
    if (entries.length > MAX_HISTORY_ENTRIES) {
        entries.length = MAX_HISTORY_ENTRIES;
    }

    storage.write(entries);
    return entry.id;
}

/**
 * Updates a flash entry with success status.
 * @param {string} entryId - Entry ID from recordFlashStart
 * @param {number} [duration] - Duration in milliseconds
 */
export function recordFlashSuccess(entryId, duration = 0) {
    const entries = storage.read();
    const entry = entries.find(e => e.id === entryId);
    if (entry) {
        entry.status = 'success';
        entry.duration = duration;
        storage.write(entries);
    }
}

/**
 * Updates a flash entry with error status.
 * @param {string} entryId - Entry ID from recordFlashStart
 * @param {string} [errorMessage] - Error message
 */
export function recordFlashError(entryId, errorMessage = 'Unknown error') {
    const entries = storage.read();
    const entry = entries.find(e => e.id === entryId);
    if (entry) {
        entry.status = 'error';
        entry.errorMessage = errorMessage;
        storage.write(entries);
    }
}

/**
 * Gets all flash history entries.
 * @returns {FlashHistoryEntry[]}
 */
export function getFlashHistory() {
    return storage.read();
}

/**
 * Clears all flash history.
 */
export function clearFlashHistory() {
    storage.write([]);
}

/**
 * Gets flash history summary statistics.
 * @returns {Object}
 */
export function getFlashStats() {
    const entries = storage.read();
    const total = entries.length;
    const successful = entries.filter(e => e.status === 'success').length;
    const failed = entries.filter(e => e.status === 'error').length;
    const inProgress = entries.filter(e => e.status === 'started').length;

    return {
        total,
        successful,
        failed,
        inProgress,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0
    };
}

/**
 * Formats a history entry for display.
 * @param {FlashHistoryEntry} entry
 * @returns {string}
 */
export function formatHistoryEntry(entry) {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const status = entry.status === 'success' ? 'Success' :
        entry.status === 'error' ? 'Failed' : 'In Progress';
    const duration = entry.duration > 0 ? ` (${Math.round(entry.duration / 1000)}s)` : '';

    return `${dateStr} ${timeStr} - ${entry.configString} v${entry.firmwareVersion} (${entry.channel}) - ${status}${duration}`;
}

/**
 * Exports flash history as text for support.
 * @returns {string}
 */
export function exportFlashHistoryText() {
    const entries = storage.read();
    const stats = getFlashStats();

    if (entries.length === 0) {
        return 'No flash history recorded.';
    }

    const lines = [
        '=== WebFlash History ===',
        `Total: ${stats.total} | Success: ${stats.successful} | Failed: ${stats.failed}`,
        '',
        ...entries.map(formatHistoryEntry)
    ];

    return lines.join('\n');
}
