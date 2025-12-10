/**
 * @fileoverview Serial console service for live log viewing via Web Serial API.
 * @module services/serial-console
 */

import { detectCapabilities } from '../capabilities.js';

/**
 * @typedef {Object} ConsoleOptions
 * @property {number} [baudRate=115200] - Serial baud rate
 * @property {number} [maxLines=1000] - Maximum lines to keep in buffer
 * @property {function} [onData] - Callback when new data received
 * @property {function} [onConnect] - Callback when connected
 * @property {function} [onDisconnect] - Callback when disconnected
 * @property {function} [onError] - Callback on error
 */

/** @type {SerialPort|null} */
let consolePort = null;

/** @type {ReadableStreamDefaultReader|null} */
let consoleReader = null;

/** @type {boolean} */
let isConnected = false;

/** @type {boolean} */
let shouldReconnect = false;

/** @type {string[]} */
let logBuffer = [];

/** @type {number} */
let maxBufferLines = 1000;

/** @type {TextDecoder} */
const decoder = new TextDecoder('utf-8', { fatal: false });

/** @type {string} */
let partialLine = '';

/**
 * Log level patterns for ESPHome output
 */
const LOG_PATTERNS = {
    error: /^\[E\]|\[ERROR\]|error:|ERROR/i,
    warning: /^\[W\]|\[WARNING\]|warning:|WARN/i,
    info: /^\[I\]|\[INFO\]|info:/i,
    debug: /^\[D\]|\[DEBUG\]|debug:/i,
    verbose: /^\[V\]|\[VERBOSE\]/i
};

/**
 * Checks if Web Serial API is available.
 * @returns {boolean}
 */
export function isSerialSupported() {
    const caps = detectCapabilities();
    return caps.webSerial;
}

/**
 * Determines log level from a line of text.
 * @param {string} line - Log line to analyze
 * @returns {'error'|'warning'|'info'|'debug'|'verbose'|'default'}
 */
export function parseLogLevel(line) {
    if (LOG_PATTERNS.error.test(line)) return 'error';
    if (LOG_PATTERNS.warning.test(line)) return 'warning';
    if (LOG_PATTERNS.info.test(line)) return 'info';
    if (LOG_PATTERNS.debug.test(line)) return 'debug';
    if (LOG_PATTERNS.verbose.test(line)) return 'verbose';
    return 'default';
}

/**
 * Strips ANSI escape codes from text.
 * @param {string} text - Text with potential ANSI codes
 * @returns {string} Clean text
 */
export function stripAnsiCodes(text) {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Formats a timestamp for log display.
 * @param {Date} [date=new Date()] - Date to format
 * @returns {string} Formatted time string (HH:MM:SS.mmm)
 */
export function formatTimestamp(date = new Date()) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

/**
 * Gets current connection status.
 * @returns {boolean}
 */
export function isConsoleConnected() {
    return isConnected;
}

/**
 * Gets the log buffer contents.
 * @returns {string[]}
 */
export function getLogBuffer() {
    return [...logBuffer];
}

/**
 * Clears the log buffer.
 */
export function clearLogBuffer() {
    logBuffer = [];
    partialLine = '';
}

/**
 * Connects to a serial port and starts streaming data.
 * @param {ConsoleOptions} [options={}] - Connection options
 * @returns {Promise<boolean>} True if connected successfully
 */
export async function connectConsole(options = {}) {
    const {
        baudRate = 115200,
        maxLines = 1000,
        onData,
        onConnect,
        onDisconnect,
        onError
    } = options;

    if (!isSerialSupported()) {
        onError?.(new Error('Web Serial API is not supported in this browser'));
        return false;
    }

    if (isConnected) {
        return true;
    }

    maxBufferLines = maxLines;

    try {
        // Request port access
        consolePort = await navigator.serial.requestPort({
            filters: [
                { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
                { usbVendorId: 0x1A86 }, // QinHeng CH340
                { usbVendorId: 0x0403 }, // FTDI
                { usbVendorId: 0x303A }, // Espressif
                { usbVendorId: 0x2341 }, // Arduino
            ]
        });

        if (!consolePort) {
            return false;
        }

        // Open the port
        await consolePort.open({ baudRate });
        isConnected = true;
        shouldReconnect = true;

        onConnect?.();

        // Start reading loop
        readLoop(onData, onDisconnect, onError);

        return true;
    } catch (error) {
        if (error.name === 'NotFoundError') {
            // User cancelled - not an error
            return false;
        }
        onError?.(error);
        return false;
    }
}

/**
 * Disconnects from the serial port.
 * @returns {Promise<void>}
 */
export async function disconnectConsole() {
    shouldReconnect = false;
    isConnected = false;

    try {
        if (consoleReader) {
            await consoleReader.cancel();
            consoleReader.releaseLock();
            consoleReader = null;
        }
    } catch (e) {
        // Ignore cancel errors
    }

    try {
        if (consolePort) {
            await consolePort.close();
            consolePort = null;
        }
    } catch (e) {
        // Ignore close errors
    }
}

/**
 * Triggers a device reset via DTR/RTS signals.
 * @returns {Promise<void>}
 */
export async function resetDevice() {
    if (!consolePort || !isConnected) {
        return;
    }

    try {
        // Toggle DTR/RTS to trigger ESP32 reset
        await consolePort.setSignals({ dataTerminalReady: false, requestToSend: true });
        await new Promise(resolve => setTimeout(resolve, 100));
        await consolePort.setSignals({ dataTerminalReady: true, requestToSend: false });
        await new Promise(resolve => setTimeout(resolve, 50));
        await consolePort.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (error) {
        console.warn('Failed to reset device:', error);
    }
}

/**
 * Sends data to the serial port.
 * @param {string} data - Data to send
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendData(data) {
    if (!consolePort || !isConnected || !consolePort.writable) {
        return false;
    }

    try {
        const writer = consolePort.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(data));
        writer.releaseLock();
        return true;
    } catch (error) {
        console.warn('Failed to send data:', error);
        return false;
    }
}

/**
 * Internal read loop for streaming serial data.
 * @param {function} onData - Data callback
 * @param {function} onDisconnect - Disconnect callback
 * @param {function} onError - Error callback
 */
async function readLoop(onData, onDisconnect, onError) {
    if (!consolePort || !consolePort.readable) {
        return;
    }

    try {
        consoleReader = consolePort.readable.getReader();

        while (isConnected && shouldReconnect) {
            try {
                const { value, done } = await consoleReader.read();

                if (done) {
                    break;
                }

                if (value) {
                    processSerialData(value, onData);
                }
            } catch (readError) {
                if (isConnected) {
                    onError?.(readError);
                }
                break;
            }
        }
    } catch (error) {
        if (isConnected) {
            onError?.(error);
        }
    } finally {
        isConnected = false;

        try {
            consoleReader?.releaseLock();
            consoleReader = null;
        } catch (e) {
            // Ignore
        }

        onDisconnect?.();
    }
}

/**
 * Processes incoming serial data into lines.
 * @param {Uint8Array} data - Raw serial data
 * @param {function} onData - Data callback
 */
function processSerialData(data, onData) {
    const text = decoder.decode(data, { stream: true });
    const cleanText = stripAnsiCodes(text);

    // Combine with any partial line from previous chunk
    const combined = partialLine + cleanText;
    const lines = combined.split(/\r?\n/);

    // Last element might be incomplete
    partialLine = lines.pop() || '';

    const timestamp = new Date();

    for (const line of lines) {
        if (line.trim()) {
            const level = parseLogLevel(line);
            const entry = {
                timestamp,
                level,
                text: line,
                formatted: `[${formatTimestamp(timestamp)}] ${line}`
            };

            // Add to buffer
            logBuffer.push(entry.formatted);
            if (logBuffer.length > maxBufferLines) {
                logBuffer.shift();
            }

            onData?.(entry);
        }
    }
}

/**
 * Exports the log buffer as a downloadable text file.
 * @returns {string} Log content as text
 */
export function exportLogs() {
    return logBuffer.join('\n');
}
