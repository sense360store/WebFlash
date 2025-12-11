/**
 * @fileoverview ESP Web Tools overrides for enhanced firmware installation.
 * @module utils/esp-web-tools-overrides
 *
 * Provides custom firmware detection to warn users when attempting to
 * reinstall the same firmware version that's already on their device.
 */

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
                }

                // Check descendants
                const buttons = node.querySelectorAll?.('esp-web-install-button');
                buttons?.forEach(button => {
                    if (!button.hasAttribute('data-overrides-applied')) {
                        button.overrides = overrides;
                        button.setAttribute('data-overrides-applied', 'true');
                    }
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
