/**
 * @fileoverview Sensor health check service for post-flash diagnostics.
 * Reads sensor data from the device to verify sensors are functioning.
 * @module services/sensor-health
 */

import { isWebSerialSupported } from './device-info.js';

/**
 * @typedef {Object} SensorReading
 * @property {string} name - Sensor name
 * @property {string} type - Sensor type (temperature, humidity, etc.)
 * @property {number|string|null} value - Current reading value
 * @property {string} unit - Unit of measurement
 * @property {string} status - Status (ok, warning, error, unavailable)
 * @property {string} [message] - Optional status message
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {boolean} success - Whether the health check completed
 * @property {SensorReading[]} sensors - Array of sensor readings
 * @property {number} healthyCount - Number of healthy sensors
 * @property {number} warningCount - Number of sensors with warnings
 * @property {number} errorCount - Number of failed sensors
 * @property {string} overallStatus - Overall health status
 * @property {string} [error] - Error message if check failed
 * @property {string} rawOutput - Raw serial output for debugging
 */

/** @type {SerialPort|null} */
let currentPort = null;

/** @type {ReadableStreamDefaultReader|null} */
let currentReader = null;

/** @type {boolean} */
let isRunning = false;

/**
 * Known sensor patterns in ESPHome log output.
 */
const SENSOR_PATTERNS = [
    // Temperature sensors
    { pattern: /\[sensor:.*?\]\s*'([^']+)'\s*:\s*Sending state\s*([\d.-]+)\s*°?([CF])/gi, type: 'temperature' },
    { pattern: /Temperature:\s*([\d.-]+)\s*°?([CF])/gi, type: 'temperature', name: 'Temperature' },

    // Humidity sensors
    { pattern: /\[sensor:.*?\]\s*'([^']+Humidity[^']*)'\s*:\s*Sending state\s*([\d.-]+)\s*%/gi, type: 'humidity' },
    { pattern: /Humidity:\s*([\d.-]+)\s*%/gi, type: 'humidity', name: 'Humidity' },

    // Pressure sensors
    { pattern: /\[sensor:.*?\]\s*'([^']+Pressure[^']*)'\s*:\s*Sending state\s*([\d.-]+)\s*(hPa|Pa|mbar)/gi, type: 'pressure' },
    { pattern: /Pressure:\s*([\d.-]+)\s*(hPa|Pa|mbar)/gi, type: 'pressure', name: 'Pressure' },

    // VOC/Gas sensors
    { pattern: /\[sensor:.*?\]\s*'([^']*VOC[^']*)'\s*:\s*Sending state\s*([\d.-]+)/gi, type: 'voc' },
    { pattern: /VOC\s*(?:Index)?:\s*([\d.-]+)/gi, type: 'voc', name: 'VOC Index' },

    // NOx sensors
    { pattern: /\[sensor:.*?\]\s*'([^']*NOx[^']*)'\s*:\s*Sending state\s*([\d.-]+)/gi, type: 'nox' },
    { pattern: /NOx\s*(?:Index)?:\s*([\d.-]+)/gi, type: 'nox', name: 'NOx Index' },

    // CO2 sensors
    { pattern: /\[sensor:.*?\]\s*'([^']*CO2[^']*)'\s*:\s*Sending state\s*([\d.-]+)\s*(ppm)?/gi, type: 'co2' },
    { pattern: /CO2:\s*([\d.-]+)\s*(ppm)?/gi, type: 'co2', name: 'CO2' },

    // Particulate matter
    { pattern: /\[sensor:.*?\]\s*'([^']*PM[\d.]+[^']*)'\s*:\s*Sending state\s*([\d.-]+)/gi, type: 'particulate' },
    { pattern: /PM(?:1\.0|2\.5|10):\s*([\d.-]+)\s*(µg\/m³)?/gi, type: 'particulate', name: 'Particulate' },

    // Light sensors
    { pattern: /\[sensor:.*?\]\s*'([^']*[Ll]ux[^']*)'\s*:\s*Sending state\s*([\d.-]+)/gi, type: 'light' },
    { pattern: /\[sensor:.*?\]\s*'([^']*[Ll]ight[^']*)'\s*:\s*Sending state\s*([\d.-]+)/gi, type: 'light' },
    { pattern: /Illuminance:\s*([\d.-]+)\s*(lx|lux)?/gi, type: 'light', name: 'Illuminance' },

    // Presence/Radar sensors
    { pattern: /\[binary_sensor:.*?\]\s*'([^']*[Pp]resence[^']*)'\s*:\s*Sending state\s*(ON|OFF|1|0)/gi, type: 'presence' },
    { pattern: /\[binary_sensor:.*?\]\s*'([^']*[Oo]ccupancy[^']*)'\s*:\s*Sending state\s*(ON|OFF|1|0)/gi, type: 'presence' },
    { pattern: /Presence:\s*(true|false|ON|OFF|detected|clear)/gi, type: 'presence', name: 'Presence' },

    // Generic sensor pattern
    { pattern: /\[sensor:.*?\]\s*'([^']+)'\s*:\s*Sending state\s*([\d.-]+)\s*([^\n]*)/gi, type: 'generic' }
];

/**
 * Sensor type metadata for display.
 */
const SENSOR_TYPES = {
    temperature: { icon: 'thermometer', unit: '°C', range: [-40, 85] },
    humidity: { icon: 'droplet', unit: '%', range: [0, 100] },
    pressure: { icon: 'gauge', unit: 'hPa', range: [300, 1100] },
    voc: { icon: 'wind', unit: 'index', range: [0, 500] },
    nox: { icon: 'wind', unit: 'index', range: [0, 500] },
    co2: { icon: 'cloud', unit: 'ppm', range: [400, 5000] },
    particulate: { icon: 'cloud', unit: 'µg/m³', range: [0, 500] },
    light: { icon: 'sun', unit: 'lx', range: [0, 100000] },
    presence: { icon: 'user', unit: '', range: null },
    generic: { icon: 'activity', unit: '', range: null }
};

/**
 * Runs a sensor health check by reading device serial output.
 * @param {Object} [options={}] - Check options
 * @param {number} [options.timeout=10000] - Timeout in milliseconds
 * @param {number} [options.baudRate=115200] - Serial baud rate
 * @returns {Promise<HealthCheckResult>}
 */
export async function runHealthCheck(options = {}) {
    const { timeout = 10000, baudRate = 115200 } = options;

    if (!isWebSerialSupported()) {
        return createErrorResult('Web Serial API is not supported in this browser');
    }

    if (isRunning) {
        return createErrorResult('Health check already in progress');
    }

    isRunning = true;
    let rawOutput = '';

    try {
        // Request serial port
        currentPort = await navigator.serial.requestPort({
            filters: [
                { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
                { usbVendorId: 0x1A86 }, // QinHeng CH340
                { usbVendorId: 0x0403 }, // FTDI
                { usbVendorId: 0x303A }, // Espressif
                { usbVendorId: 0x2341 }  // Arduino
            ]
        });

        if (!currentPort) {
            return createErrorResult('No device selected');
        }

        await currentPort.open({ baudRate });

        // Read serial data
        rawOutput = await readSerialData(currentPort, timeout);

        // Parse sensor readings from output
        const sensors = parseSensorReadings(rawOutput);

        // Calculate health statistics
        const healthyCount = sensors.filter(s => s.status === 'ok').length;
        const warningCount = sensors.filter(s => s.status === 'warning').length;
        const errorCount = sensors.filter(s => s.status === 'error').length;

        let overallStatus = 'healthy';
        if (errorCount > 0) {
            overallStatus = 'unhealthy';
        } else if (warningCount > 0) {
            overallStatus = 'degraded';
        } else if (sensors.length === 0) {
            overallStatus = 'no-sensors';
        }

        return {
            success: true,
            sensors,
            healthyCount,
            warningCount,
            errorCount,
            overallStatus,
            rawOutput
        };

    } catch (error) {
        console.error('[sensor-health] Health check error:', error);
        return createErrorResult(error.message, rawOutput);
    } finally {
        isRunning = false;
        await closePort();
    }
}

/**
 * Reads serial data from the port.
 * @param {SerialPort} port - Serial port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string>}
 */
async function readSerialData(port, timeout) {
    const decoder = new TextDecoder();
    let data = '';
    const startTime = Date.now();

    try {
        currentReader = port.readable.getReader();

        while (isRunning && (Date.now() - startTime) < timeout) {
            try {
                const readPromise = currentReader.read();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Read timeout')), 1000)
                );

                const { value, done } = await Promise.race([readPromise, timeoutPromise])
                    .catch(() => ({ value: null, done: false }));

                if (done) break;

                if (value) {
                    data += decoder.decode(value, { stream: true });

                    // Check if we have enough sensor data
                    if (hasEnoughSensorData(data)) {
                        break;
                    }
                }
            } catch {
                // Continue on read timeout
            }
        }

        currentReader.releaseLock();
        currentReader = null;

    } catch (error) {
        console.warn('[sensor-health] Read error:', error);
    }

    return data;
}

/**
 * Checks if we have collected enough sensor data.
 * @param {string} data - Collected serial data
 * @returns {boolean}
 */
function hasEnoughSensorData(data) {
    // Look for multiple sensor readings
    const sensorMatches = data.match(/\[sensor:.*?\]/g) || [];
    const binaryMatches = data.match(/\[binary_sensor:.*?\]/g) || [];

    return (sensorMatches.length + binaryMatches.length) >= 3;
}

/**
 * Parses sensor readings from raw serial output.
 * @param {string} data - Raw serial data
 * @returns {SensorReading[]}
 */
function parseSensorReadings(data) {
    const sensors = new Map();

    for (const { pattern, type, name: defaultName } of SENSOR_PATTERNS) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(data)) !== null) {
            const name = defaultName || match[1] || `${type} sensor`;
            const value = parseFloat(match[defaultName ? 1 : 2]) || match[defaultName ? 1 : 2];
            const unit = match[defaultName ? 2 : 3] || SENSOR_TYPES[type]?.unit || '';

            // Use sensor name as key to avoid duplicates
            const key = name.toLowerCase().replace(/\s+/g, '_');

            if (!sensors.has(key) || type !== 'generic') {
                sensors.set(key, {
                    name: cleanSensorName(name),
                    type,
                    value,
                    unit: cleanUnit(unit),
                    status: evaluateSensorStatus(type, value),
                    message: ''
                });
            }
        }
    }

    return Array.from(sensors.values());
}

/**
 * Cleans up a sensor name for display.
 * @param {string} name - Raw sensor name
 * @returns {string}
 */
function cleanSensorName(name) {
    return name
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Cleans up a unit string.
 * @param {string} unit - Raw unit
 * @returns {string}
 */
function cleanUnit(unit) {
    if (!unit) return '';
    return unit.trim().replace(/^\s*,\s*/, '');
}

/**
 * Evaluates sensor health status based on reading value.
 * @param {string} type - Sensor type
 * @param {number|string} value - Sensor reading
 * @returns {string} Status: ok, warning, error
 */
function evaluateSensorStatus(type, value) {
    const typeInfo = SENSOR_TYPES[type];

    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
        return 'error';
    }

    // Binary sensors (presence)
    if (type === 'presence') {
        return 'ok';
    }

    // Check range for numeric sensors
    if (typeInfo?.range && typeof value === 'number') {
        const [min, max] = typeInfo.range;

        if (value < min || value > max) {
            return 'warning';
        }
    }

    // Special checks for specific sensor types
    if (type === 'temperature' && typeof value === 'number') {
        if (value < -20 || value > 50) {
            return 'warning'; // Unusual but possible
        }
    }

    if (type === 'humidity' && typeof value === 'number') {
        if (value < 0 || value > 100) {
            return 'error'; // Impossible value
        }
    }

    return 'ok';
}

/**
 * Creates an error result object.
 * @param {string} message - Error message
 * @param {string} [rawOutput] - Raw output if available
 * @returns {HealthCheckResult}
 */
function createErrorResult(message, rawOutput = '') {
    return {
        success: false,
        sensors: [],
        healthyCount: 0,
        warningCount: 0,
        errorCount: 0,
        overallStatus: 'error',
        error: message,
        rawOutput
    };
}

/**
 * Closes the current serial port connection.
 */
export async function closePort() {
    isRunning = false;

    if (currentReader) {
        try {
            await currentReader.cancel();
            currentReader.releaseLock();
        } catch {
            // Ignore cleanup errors
        }
        currentReader = null;
    }

    if (currentPort) {
        try {
            await currentPort.close();
        } catch {
            // Port may already be closed
        }
        currentPort = null;
    }
}

/**
 * Stops an in-progress health check.
 */
export function cancelHealthCheck() {
    isRunning = false;
    closePort();
}

/**
 * Gets metadata for a sensor type.
 * @param {string} type - Sensor type
 * @returns {Object}
 */
export function getSensorTypeInfo(type) {
    return SENSOR_TYPES[type] || SENSOR_TYPES.generic;
}

export const __testHooks = Object.freeze({
    parseSensorReadings,
    evaluateSensorStatus,
    cleanSensorName,
    SENSOR_PATTERNS,
    SENSOR_TYPES
});
