/**
 * @fileoverview Error logging service for capturing and storing application errors.
 * @module services/error-log
 */

/** @type {Array<ErrorLogEntry>} */
let errorLog = [];

/** @type {number} */
const MAX_LOG_SIZE = 100;

/** @type {Set<Function>} */
const listeners = new Set();

/**
 * @typedef {Object} ErrorLogEntry
 * @property {string} id - Unique identifier
 * @property {Date} timestamp - When the error occurred
 * @property {string} type - Error type (error, warning, info)
 * @property {string} source - Where the error originated
 * @property {string} message - Error message
 * @property {string} [stack] - Stack trace if available
 * @property {Object} [context] - Additional context
 */

/**
 * Generates a unique ID for log entries.
 * @returns {string}
 */
function generateId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Adds an entry to the error log.
 * @param {string} type - Entry type (error, warning, info)
 * @param {string} source - Error source/component
 * @param {string} message - Error message
 * @param {Object} [options] - Additional options
 * @param {string} [options.stack] - Stack trace
 * @param {Object} [options.context] - Additional context
 * @returns {ErrorLogEntry}
 */
export function addLogEntry(type, source, message, options = {}) {
    const entry = {
        id: generateId(),
        timestamp: new Date(),
        type,
        source,
        message,
        stack: options.stack || null,
        context: options.context || null
    };

    errorLog.unshift(entry);

    // Trim log if it exceeds max size
    if (errorLog.length > MAX_LOG_SIZE) {
        errorLog = errorLog.slice(0, MAX_LOG_SIZE);
    }

    // Notify listeners
    listeners.forEach(listener => {
        try {
            listener(entry, errorLog);
        } catch (e) {
            console.error('[error-log] Listener error:', e);
        }
    });

    return entry;
}

/**
 * Logs an error.
 * @param {string} source - Error source
 * @param {string|Error} error - Error message or Error object
 * @param {Object} [context] - Additional context
 * @returns {ErrorLogEntry}
 */
export function logError(source, error, context = null) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : null;
    return addLogEntry('error', source, message, { stack, context });
}

/**
 * Logs a warning.
 * @param {string} source - Warning source
 * @param {string} message - Warning message
 * @param {Object} [context] - Additional context
 * @returns {ErrorLogEntry}
 */
export function logWarning(source, message, context = null) {
    return addLogEntry('warning', source, message, { context });
}

/**
 * Logs an info message.
 * @param {string} source - Info source
 * @param {string} message - Info message
 * @param {Object} [context] - Additional context
 * @returns {ErrorLogEntry}
 */
export function logInfo(source, message, context = null) {
    return addLogEntry('info', source, message, { context });
}

/**
 * Gets all log entries.
 * @returns {Array<ErrorLogEntry>}
 */
export function getErrorLog() {
    return [...errorLog];
}

/**
 * Gets log entries filtered by type.
 * @param {string} type - Entry type to filter by
 * @returns {Array<ErrorLogEntry>}
 */
export function getLogByType(type) {
    return errorLog.filter(entry => entry.type === type);
}

/**
 * Gets the count of entries by type.
 * @returns {{error: number, warning: number, info: number, total: number}}
 */
export function getLogCounts() {
    const counts = { error: 0, warning: 0, info: 0, total: errorLog.length };
    for (const entry of errorLog) {
        if (counts.hasOwnProperty(entry.type)) {
            counts[entry.type]++;
        }
    }
    return counts;
}

/**
 * Clears the error log.
 */
export function clearErrorLog() {
    errorLog = [];
    listeners.forEach(listener => {
        try {
            listener(null, []);
        } catch (e) {
            console.error('[error-log] Listener error:', e);
        }
    });
}

/**
 * Subscribes to log updates.
 * @param {Function} callback - Callback function(entry, allEntries)
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/**
 * Exports the log as a JSON string.
 * @returns {string}
 */
export function exportLog() {
    return JSON.stringify(errorLog, null, 2);
}

/**
 * Formats a timestamp for display.
 * @param {Date} date - Date to format
 * @returns {string}
 */
export function formatTimestamp(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

/**
 * Initializes global error handlers to capture unhandled errors.
 */
export function initGlobalErrorHandlers() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
        logError('window', event.error || event.message, {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason;
        const message = error instanceof Error ? error.message : String(error);
        logError('promise', message, {
            reason: String(error)
        });
    });

    // Intercept console.error to capture logged errors
    const originalConsoleError = console.error;
    console.error = function(...args) {
        originalConsoleError.apply(console, args);

        // Extract source and message from console.error arguments
        const firstArg = args[0];
        if (typeof firstArg === 'string') {
            // Check for tagged format like "[source] message"
            const match = firstArg.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (match) {
                logError(match[1], match[2] + (args.length > 1 ? ' ' + args.slice(1).join(' ') : ''));
            } else {
                logError('console', args.join(' '));
            }
        } else if (firstArg instanceof Error) {
            logError('console', firstArg);
        }
    };

    // Intercept console.warn to capture warnings
    const originalConsoleWarn = console.warn;
    console.warn = function(...args) {
        originalConsoleWarn.apply(console, args);

        const firstArg = args[0];
        if (typeof firstArg === 'string') {
            const match = firstArg.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (match) {
                logWarning(match[1], match[2] + (args.length > 1 ? ' ' + args.slice(1).join(' ') : ''));
            } else {
                logWarning('console', args.join(' '));
            }
        }
    };
}

// Auto-initialize global error handlers on module load
// This ensures errors are captured from the very beginning
initGlobalErrorHandlers();

// Export for testing
export const __testHooks = Object.freeze({
    generateId,
    addLogEntry
});
