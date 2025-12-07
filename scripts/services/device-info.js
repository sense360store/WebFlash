/**
 * @fileoverview Device information reading service using Web Serial API.
 * Reads firmware version, chip ID, and other device info before flashing.
 * @module services/device-info
 */

import { detectCapabilities } from '../capabilities.js';

/**
 * @typedef {Object} DeviceInfo
 * @property {string|null} chipId - The ESP32 chip ID (MAC-based)
 * @property {string|null} chipFamily - The ESP32 chip family (e.g., ESP32-S3)
 * @property {string|null} firmwareVersion - Current firmware version if detected
 * @property {string|null} firmwareName - Current firmware name if detected
 * @property {string|null} macAddress - Device MAC address
 * @property {number|null} flashSize - Flash size in bytes
 * @property {boolean} hasExistingFirmware - Whether ESPHome firmware was detected
 * @property {string|null} rawOutput - Raw serial output for debugging
 * @property {string|null} error - Error message if reading failed
 */

/**
 * @typedef {Object} ReadOptions
 * @property {number} [baudRate=115200] - Serial baud rate
 * @property {number} [timeout=5000] - Read timeout in milliseconds
 */

/** @type {SerialPort|null} */
let currentPort = null;

/** @type {ReadableStreamDefaultReader|null} */
let currentReader = null;

/** @type {boolean} */
let isReading = false;

/**
 * ESP32 chip family identification based on chip ID prefix
 */
const CHIP_FAMILIES = {
    0x00: 'ESP32',
    0x02: 'ESP32-S2',
    0x05: 'ESP32-C3',
    0x09: 'ESP32-S3',
    0x0C: 'ESP32-C2',
    0x0D: 'ESP32-C6',
    0x10: 'ESP32-H2'
};

/**
 * Checks if Web Serial API is available and supported.
 * @returns {boolean}
 */
export function isWebSerialSupported() {
    const caps = detectCapabilities();
    return caps.webSerial;
}

/**
 * Requests access to a serial port.
 * @returns {Promise<SerialPort|null>}
 */
export async function requestPort() {
    if (!isWebSerialSupported()) {
        throw new Error('Web Serial API is not supported in this browser');
    }

    try {
        // Request ESP32 devices specifically
        const port = await navigator.serial.requestPort({
            filters: [
                // Common ESP32 USB-to-Serial chips
                { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
                { usbVendorId: 0x1A86 }, // QinHeng CH340
                { usbVendorId: 0x0403 }, // FTDI
                { usbVendorId: 0x303A }, // Espressif
                { usbVendorId: 0x2341 }, // Arduino
            ]
        });
        return port;
    } catch (error) {
        if (error.name === 'NotFoundError') {
            // User cancelled the dialog
            return null;
        }
        throw error;
    }
}

/**
 * Reads device information from the connected serial port.
 * Attempts to detect existing ESPHome firmware or read chip info.
 * @param {ReadOptions} [options={}] - Read options
 * @returns {Promise<DeviceInfo>}
 */
export async function readDeviceInfo(options = {}) {
    const {
        baudRate = 115200,
        timeout = 5000
    } = options;

    if (!isWebSerialSupported()) {
        return createErrorResult('Web Serial API is not supported');
    }

    let port = null;
    let reader = null;
    let rawOutput = '';

    try {
        port = await requestPort();
        if (!port) {
            return createErrorResult('No device selected');
        }

        await port.open({ baudRate });
        currentPort = port;

        // Read from serial with timeout
        const result = await Promise.race([
            readSerialData(port, timeout),
            createTimeout(timeout)
        ]);

        rawOutput = result.data;

        // Try to parse ESPHome info from the output
        const deviceInfo = parseDeviceInfo(rawOutput);
        deviceInfo.rawOutput = rawOutput;

        return deviceInfo;

    } catch (error) {
        console.error('[device-info] Error reading device info:', error);
        return createErrorResult(error.message, rawOutput);
    } finally {
        await closePort();
    }
}

/**
 * Reads serial data from the port.
 * @param {SerialPort} port - The serial port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{data: string}>}
 */
async function readSerialData(port, timeout) {
    const decoder = new TextDecoder();
    let data = '';
    const startTime = Date.now();

    isReading = true;

    try {
        // First, trigger a reset to get boot messages
        await triggerDeviceReset(port);

        const reader = port.readable.getReader();
        currentReader = reader;

        while (isReading && (Date.now() - startTime) < timeout) {
            try {
                const { value, done } = await Promise.race([
                    reader.read(),
                    createTimeout(1000).then(() => ({ value: null, done: false, timeout: true }))
                ]);

                if (done) {
                    break;
                }

                if (value) {
                    data += decoder.decode(value, { stream: true });

                    // Check if we have enough info to stop early
                    if (hasEnoughInfo(data)) {
                        break;
                    }
                }
            } catch (readError) {
                if (readError.name !== 'TimeoutError') {
                    console.warn('[device-info] Read error:', readError);
                }
                break;
            }
        }

        reader.releaseLock();
        currentReader = null;

    } finally {
        isReading = false;
    }

    return { data };
}

/**
 * Triggers a device reset by toggling DTR/RTS signals.
 * This causes the ESP32 to restart and output boot information.
 * @param {SerialPort} port - The serial port
 */
async function triggerDeviceReset(port) {
    try {
        // Toggle DTR and RTS to trigger reset
        await port.setSignals({ dataTerminalReady: false, requestToSend: true });
        await sleep(100);
        await port.setSignals({ dataTerminalReady: true, requestToSend: false });
        await sleep(100);
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (error) {
        // Some serial adapters don't support signal control
        console.warn('[device-info] Could not trigger reset:', error.message);
    }
}

/**
 * Checks if we have collected enough information to stop reading.
 * @param {string} data - Collected serial data
 * @returns {boolean}
 */
function hasEnoughInfo(data) {
    // Check for ESPHome version info
    if (data.includes('ESPHome') && data.includes('version')) {
        return true;
    }

    // Check for ESP32 boot info
    if (data.includes('Chip is') && data.includes('MAC:')) {
        return true;
    }

    // Check for full boot sequence completion
    if (data.includes('Ready') || data.includes('WiFi connected')) {
        return true;
    }

    return false;
}

/**
 * Parses device information from raw serial output.
 * @param {string} data - Raw serial data
 * @returns {DeviceInfo}
 */
function parseDeviceInfo(data) {
    const info = {
        chipId: null,
        chipFamily: null,
        firmwareVersion: null,
        firmwareName: null,
        macAddress: null,
        flashSize: null,
        hasExistingFirmware: false,
        rawOutput: null,
        error: null
    };

    if (!data) {
        return info;
    }

    // Parse MAC address (common in both bootloader and ESPHome output)
    const macMatch = data.match(/MAC:\s*([0-9A-Fa-f:]{17})/);
    if (macMatch) {
        info.macAddress = macMatch[1].toUpperCase();
        // Generate chip ID from MAC (last 6 characters without colons)
        info.chipId = info.macAddress.replace(/:/g, '').slice(-6).toUpperCase();
    }

    // Parse chip family from bootloader output
    const chipMatch = data.match(/Chip is\s+(ESP32[^\s,]*)/i);
    if (chipMatch) {
        info.chipFamily = chipMatch[1].toUpperCase();
    }

    // Parse flash size
    const flashMatch = data.match(/(\d+)\s*MB\s*flash/i);
    if (flashMatch) {
        info.flashSize = parseInt(flashMatch[1], 10) * 1024 * 1024;
    } else {
        const flashBytesMatch = data.match(/flash\s*size[:\s]*(\d+)/i);
        if (flashBytesMatch) {
            info.flashSize = parseInt(flashBytesMatch[1], 10);
        }
    }

    // Parse ESPHome firmware info
    const esphomeVersionMatch = data.match(/ESPHome\s+version\s+([\d.]+)/i);
    if (esphomeVersionMatch) {
        info.firmwareVersion = esphomeVersionMatch[1];
        info.hasExistingFirmware = true;
    }

    // Alternative ESPHome version format
    const altVersionMatch = data.match(/\[I\]\[app:[\d]+\]\s*ESPHome\s+version\s+([\d.]+)/);
    if (altVersionMatch) {
        info.firmwareVersion = altVersionMatch[1];
        info.hasExistingFirmware = true;
    }

    // Parse firmware project name from ESPHome
    const projectMatch = data.match(/project\s+name[:\s]+([^\n\r]+)/i);
    if (projectMatch) {
        info.firmwareName = projectMatch[1].trim();
    }

    // Alternative: Parse from log output
    const nameMatch = data.match(/\[C\]\[esphome\..*?\]\s*(.+?)\s*(?:compil|$)/i);
    if (nameMatch && !info.firmwareName) {
        info.firmwareName = nameMatch[1].trim();
    }

    // Check for Sense360 specific patterns
    const sense360Match = data.match(/Sense360[^\n]*/i);
    if (sense360Match) {
        info.firmwareName = sense360Match[0].trim();
        info.hasExistingFirmware = true;
    }

    // Parse config string if present
    const configMatch = data.match(/(Wall|Ceiling)-(USB|POE|PWR)(-[A-Za-z]+)*/);
    if (configMatch) {
        info.firmwareName = configMatch[0];
        info.hasExistingFirmware = true;
    }

    return info;
}

/**
 * Creates an error result object.
 * @param {string} message - Error message
 * @param {string} [rawOutput] - Raw output if available
 * @returns {DeviceInfo}
 */
function createErrorResult(message, rawOutput = null) {
    return {
        chipId: null,
        chipFamily: null,
        firmwareVersion: null,
        firmwareName: null,
        macAddress: null,
        flashSize: null,
        hasExistingFirmware: false,
        rawOutput,
        error: message
    };
}

/**
 * Creates a timeout promise.
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise<never>}
 */
function createTimeout(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Timeout'));
        }, ms);
    });
}

/**
 * Sleep for a specified duration.
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Closes the current serial port connection.
 */
export async function closePort() {
    isReading = false;

    if (currentReader) {
        try {
            await currentReader.cancel();
            currentReader.releaseLock();
        } catch (error) {
            // Ignore errors during cleanup
        }
        currentReader = null;
    }

    if (currentPort) {
        try {
            await currentPort.close();
        } catch (error) {
            // Port may already be closed
        }
        currentPort = null;
    }
}

/**
 * Formats device info for display.
 * @param {DeviceInfo} info - Device info object
 * @returns {string} Formatted string
 */
export function formatDeviceInfo(info) {
    if (info.error) {
        return `Error: ${info.error}`;
    }

    const parts = [];

    if (info.chipFamily) {
        parts.push(`Chip: ${info.chipFamily}`);
    }

    if (info.chipId) {
        parts.push(`ID: ${info.chipId}`);
    }

    if (info.macAddress) {
        parts.push(`MAC: ${info.macAddress}`);
    }

    if (info.hasExistingFirmware) {
        if (info.firmwareName) {
            parts.push(`Firmware: ${info.firmwareName}`);
        }
        if (info.firmwareVersion) {
            parts.push(`Version: ${info.firmwareVersion}`);
        }
    } else {
        parts.push('No existing firmware detected');
    }

    if (info.flashSize) {
        const sizeMB = info.flashSize / (1024 * 1024);
        parts.push(`Flash: ${sizeMB}MB`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No device information available';
}

/**
 * Checks if the current configuration matches the device's existing firmware.
 * @param {DeviceInfo} deviceInfo - Device info from readDeviceInfo
 * @param {string} configString - Current wizard configuration string
 * @returns {{matches: boolean, message: string}}
 */
export function checkConfigCompatibility(deviceInfo, configString) {
    if (!deviceInfo.hasExistingFirmware || !deviceInfo.firmwareName) {
        return {
            matches: true,
            message: 'No existing firmware to compare'
        };
    }

    const existingConfig = deviceInfo.firmwareName;
    const normalizedExisting = existingConfig.toLowerCase().replace(/[-_\s]/g, '');
    const normalizedNew = configString.toLowerCase().replace(/[-_\s]/g, '');

    // Check for exact match
    if (normalizedExisting.includes(normalizedNew) || normalizedNew.includes(normalizedExisting)) {
        return {
            matches: true,
            message: 'Configuration matches existing firmware'
        };
    }

    // Check for mount/power compatibility
    const existingMount = normalizedExisting.includes('ceiling') ? 'ceiling' : 'wall';
    const newMount = normalizedNew.includes('ceiling') ? 'ceiling' : 'wall';

    if (existingMount !== newMount) {
        return {
            matches: false,
            message: `Warning: Device has ${existingMount} mount firmware, but you selected ${newMount} mount`
        };
    }

    return {
        matches: false,
        message: `Note: Device has "${existingConfig}" but you selected "${configString}"`
    };
}

export const __testHooks = Object.freeze({
    parseDeviceInfo,
    hasEnoughInfo,
    formatDeviceInfo
});
