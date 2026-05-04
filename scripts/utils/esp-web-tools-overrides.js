/**
 * @fileoverview ESP Web Tools overrides for enhanced firmware installation.
 * @module utils/esp-web-tools-overrides
 *
 * Provides custom firmware detection to warn users when attempting to
 * reinstall the same firmware version that's already on their device,
 * and routes connect/install errors through the WebFlash error log with
 * actionable, human-friendly messages.
 */

import { logError, logWarning, logInfo } from '../services/error-log.js';

/**
 * Maps an ESP Web Tools / esptool.js error string to a friendlier user message
 * and a suggested next step. Pattern matching is intentionally conservative —
 * unknown errors fall through unchanged so we never hide real diagnostics.
 *
 * @param {string} raw - The original error message from ESP Web Tools.
 * @returns {{summary: string, hint: string|null}}
 */
export function describeInstallError(raw) {
    const text = String(raw || '').trim();
    if (!text) {
        return { summary: 'Unknown installer error.', hint: null };
    }

    const lower = text.toLowerCase();

    if (lower.includes('failed to initialize') || lower.includes('serial port could not be opened')) {
        return {
            summary: 'Couldn’t open the serial port.',
            hint: 'Another app is probably holding the port. Close Arduino IDE, PlatformIO, the ESPHome dashboard, or any serial monitor and try again.'
        };
    }
    if (lower.includes('no port selected') || lower.includes('no device selected')) {
        return {
            summary: 'No serial port was selected.',
            hint: 'Click Install again and pick the Sense360 hub from the browser’s port picker. If nothing appears, swap the cable for a known-data USB cable.'
        };
    }
    if (lower.includes('failed to connect') || lower.includes('timed out waiting')) {
        return {
            summary: 'Couldn’t talk to the hub over USB.',
            hint: 'Hold BOOT, briefly tap RESET, release BOOT to enter download mode, then click Install again. Use a USB data cable plugged directly into the computer.'
        };
    }
    if (lower.includes('access denied') || lower.includes('permission denied') || lower.includes('securityerror')) {
        return {
            summary: 'The browser blocked access to the serial port.',
            hint: 'Reload the page over HTTPS, then re-grant USB permission. On macOS, also re-check Privacy & Security → USB.'
        };
    }
    if (lower.includes('checksum') || lower.includes('crc')) {
        return {
            summary: 'Verification failed mid-flash.',
            hint: 'The cable or USB port likely dropped the connection. Plug the hub directly into the computer (no hubs/extensions) and retry.'
        };
    }
    if (lower.includes('not supported') || lower.includes('webserial')) {
        return {
            summary: 'Your browser doesn’t support Web Serial.',
            hint: 'Switch to desktop Chrome, Edge, or Opera and reload the page.'
        };
    }

    return { summary: text, hint: null };
}

/**
 * Checks if the firmware to be installed matches what's already on the device.
 * This function is called by ESP Web Tools when the device reports its info
 * via the Improv protocol.
 *
 * @param {Object} manifest - The manifest object containing firmware info
 * @param {string} manifest.version - Firmware version from manifest
 * @param {string} manifest.name - Firmware name from manifest
 * @param {Object} improvInfo - Device info from Improv protocol
 * @param {string} improvInfo.firmware - Firmware name reported by device
 * @param {string} improvInfo.version - Firmware version reported by device
 * @param {string} improvInfo.name - Device name
 * @returns {boolean} True if the same firmware version is already installed
 */
export function checkSameFirmware(manifest, improvInfo) {
    if (!manifest || !improvInfo) {
        return false;
    }

    const manifestVersion = normalizeVersion(manifest.version);
    const deviceVersion = normalizeVersion(improvInfo.version);

    // Check if versions match
    if (manifestVersion && deviceVersion && manifestVersion === deviceVersion) {
        // Additionally verify it's the same firmware type if names are available
        if (manifest.name && improvInfo.firmware) {
            const manifestName = manifest.name.toLowerCase();
            const deviceFirmware = improvInfo.firmware.toLowerCase();

            // Check if both are Sense360 firmware
            if (manifestName.includes('sense360') && deviceFirmware.includes('sense360')) {
                console.log(
                    `[esp-web-tools] Same firmware detected: ${improvInfo.firmware} v${deviceVersion}`
                );
                return true;
            }
        }

        // If we can't verify names but versions match exactly, still warn
        if (manifestVersion === deviceVersion) {
            console.log(
                `[esp-web-tools] Same version detected on device: v${deviceVersion}`
            );
            return true;
        }
    }

    return false;
}

/**
 * Normalizes a version string for comparison.
 * Handles various formats like "1.0.0", "v1.0.0", "1.0.0-beta", etc.
 *
 * @param {string|undefined|null} version - Version string to normalize
 * @returns {string} Normalized version string
 */
function normalizeVersion(version) {
    if (!version || typeof version !== 'string') {
        return '';
    }

    // Remove leading 'v' or 'V'
    let normalized = version.trim();
    if (normalized[0] === 'v' || normalized[0] === 'V') {
        normalized = normalized.slice(1);
    }

    return normalized.toLowerCase();
}

/**
 * Creates an overrides object for ESP Web Tools install button.
 *
 * @returns {Object} Overrides configuration object
 */
export function createEspWebToolsOverrides() {
    return {
        checkSameFirmware
    };
}

/**
 * Attaches a state-changed listener to an esp-web-install-button so that
 * connect / install errors are rerouted into the WebFlash error log with a
 * friendlier message + hint, while still letting the component manage its
 * own UI. Idempotent per element.
 *
 * @param {HTMLElement} button
 */
export function attachInstallErrorTelemetry(button) {
    if (!button || button.dataset.installErrorTelemetry === 'true') {
        return;
    }
    button.dataset.installErrorTelemetry = 'true';

    const handleStateChange = (event) => {
        const detail = event?.detail;
        if (!detail) {
            return;
        }
        const state = detail.state || detail.message || '';
        const message = detail.message || '';
        const error = detail.error;

        if (error || state === 'ERROR' || /error|failed|abort/i.test(message)) {
            const raw = error?.message || message || 'Unknown installer error';
            const { summary, hint } = describeInstallError(raw);
            const fullMessage = hint ? `${summary} ${hint}` : summary;
            logError('esp-web-tools', fullMessage, {
                originalMessage: raw,
                state: state || null,
                hint: hint || null,
                errorName: error?.name || null
            });
            return;
        }

        if (state === 'WARNING') {
            logWarning('esp-web-tools', message || 'Installer warning', { state });
            return;
        }

        // Useful lifecycle markers; help users correlate diagnostics later.
        if (state === 'INITIALIZING' || state === 'PREPARING' || state === 'WRITING' || state === 'FINISHED') {
            logInfo('esp-web-tools', message || `Installer state: ${state}`, { state });
        }
    };

    button.addEventListener('state-changed', handleStateChange);
}

/**
 * Applies overrides to all esp-web-install-button elements on the page.
 * Should be called after the buttons are rendered.
 */
export function applyEspWebToolsOverrides() {
    const overrides = createEspWebToolsOverrides();
    const installButtons = document.querySelectorAll('esp-web-install-button');

    installButtons.forEach(button => {
        if (!button.hasAttribute('data-overrides-applied')) {
            button.overrides = overrides;
            button.setAttribute('data-overrides-applied', 'true');
        }
        attachInstallErrorTelemetry(button);
    });
}

/**
 * Sets up a MutationObserver to automatically apply overrides to
 * dynamically created esp-web-install-button elements.
 */
export function setupEspWebToolsOverridesObserver() {
    const overrides = createEspWebToolsOverrides();

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    continue;
                }

                // Check if the added node is an esp-web-install-button
                if (node.tagName === 'ESP-WEB-INSTALL-BUTTON') {
                    if (!node.hasAttribute('data-overrides-applied')) {
                        node.overrides = overrides;
                        node.setAttribute('data-overrides-applied', 'true');
                    }
                    attachInstallErrorTelemetry(node);
                }

                // Check descendants
                const buttons = node.querySelectorAll?.('esp-web-install-button');
                buttons?.forEach(button => {
                    if (!button.hasAttribute('data-overrides-applied')) {
                        button.overrides = overrides;
                        button.setAttribute('data-overrides-applied', 'true');
                    }
                    attachInstallErrorTelemetry(button);
                });
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Apply to any existing buttons
    applyEspWebToolsOverrides();

    return observer;
}

// Auto-initialize when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEspWebToolsOverridesObserver);
} else {
    setupEspWebToolsOverridesObserver();
}
