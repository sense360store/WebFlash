/**
 * @fileoverview Firmware update checker service.
 * Compares installed device firmware with available versions.
 * @module services/update-checker
 */

import { compareVersions, getVersionsForConfig, getLatestVersion } from './changelog.js';

/**
 * @typedef {Object} UpdateCheckResult
 * @property {boolean} updateAvailable - Whether an update is available
 * @property {string|null} currentVersion - Currently installed version
 * @property {string|null} latestVersion - Latest available version
 * @property {string|null} latestStableVersion - Latest stable version
 * @property {string[]} availableVersions - All available versions
 * @property {string} channel - Detected channel of current version
 * @property {string} message - Human-readable status message
 */

/**
 * Checks if a firmware update is available for the device.
 * @param {Object} deviceInfo - Device info from readDeviceInfo
 * @param {string} [configString] - Configuration string to check versions for
 * @returns {Promise<UpdateCheckResult>}
 */
export async function checkForUpdates(deviceInfo, configString = null) {
    const result = {
        updateAvailable: false,
        currentVersion: null,
        latestVersion: null,
        latestStableVersion: null,
        availableVersions: [],
        channel: 'unknown',
        message: 'Unable to check for updates'
    };

    // Ensure we have version information
    if (!deviceInfo || !deviceInfo.firmwareVersion) {
        result.message = 'No firmware version detected on device';
        return result;
    }

    result.currentVersion = deviceInfo.firmwareVersion;

    try {
        // Get available versions for this configuration
        if (configString) {
            result.availableVersions = await getVersionsForConfig(configString);
        }

        // Get the latest stable version overall
        result.latestStableVersion = await getLatestVersion('stable');

        // Determine the latest version to compare against
        if (result.availableVersions.length > 0) {
            result.latestVersion = result.availableVersions[0]; // First is latest (sorted desc)
        } else {
            result.latestVersion = result.latestStableVersion;
        }

        // Detect current version's channel based on naming patterns
        result.channel = detectVersionChannel(result.currentVersion);

        // Compare versions
        if (result.latestVersion) {
            const comparison = compareVersions(result.latestVersion, result.currentVersion);

            if (comparison > 0) {
                result.updateAvailable = true;
                result.message = `Update available: v${result.latestVersion} (current: v${result.currentVersion})`;
            } else if (comparison === 0) {
                result.message = `You have the latest version (v${result.currentVersion})`;
            } else {
                result.message = `Your version (v${result.currentVersion}) is newer than released`;
            }
        } else {
            result.message = 'No version information available';
        }

    } catch (error) {
        console.error('[update-checker] Error checking for updates:', error);
        result.message = `Error checking for updates: ${error.message}`;
    }

    return result;
}

/**
 * Attempts to detect the release channel from a version string.
 * @param {string} version - Version string
 * @returns {string} Detected channel
 */
function detectVersionChannel(version) {
    if (!version) return 'unknown';

    const lowerVersion = version.toLowerCase();

    if (lowerVersion.includes('beta') || lowerVersion.includes('b')) {
        return 'beta';
    }
    if (lowerVersion.includes('preview') || lowerVersion.includes('alpha') || lowerVersion.includes('dev')) {
        return 'preview';
    }
    if (lowerVersion.includes('rc')) {
        return 'beta';
    }

    return 'stable';
}

/**
 * Formats the update check result for display.
 * @param {UpdateCheckResult} result - Update check result
 * @returns {Object} Formatted display info
 */
export function formatUpdateStatus(result) {
    if (result.updateAvailable) {
        return {
            status: 'update-available',
            icon: 'arrow-up',
            className: 'update-status--available',
            title: 'Update Available',
            message: result.message,
            action: `Upgrade to v${result.latestVersion}`
        };
    }

    if (result.currentVersion && result.latestVersion) {
        const comparison = compareVersions(result.currentVersion, result.latestVersion);

        if (comparison > 0) {
            return {
                status: 'newer-than-released',
                icon: 'star',
                className: 'update-status--newer',
                title: 'Development Version',
                message: result.message,
                action: null
            };
        }

        return {
            status: 'up-to-date',
            icon: 'check',
            className: 'update-status--current',
            title: 'Up to Date',
            message: result.message,
            action: null
        };
    }

    return {
        status: 'unknown',
        icon: 'help',
        className: 'update-status--unknown',
        title: 'Version Unknown',
        message: result.message,
        action: null
    };
}

/**
 * Creates an update notification element.
 * @param {UpdateCheckResult} result - Update check result
 * @returns {HTMLElement}
 */
export function createUpdateNotification(result) {
    const status = formatUpdateStatus(result);
    const notification = document.createElement('div');
    notification.className = `update-notification ${status.className}`;
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');

    const icons = {
        'arrow-up': `<path d="M12 19V5M5 12l7-7 7 7"/>`,
        'check': `<polyline points="20 6 9 17 4 12"/>`,
        'star': `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
        'help': `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`
    };

    notification.innerHTML = `
        <svg class="update-notification__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icons[status.icon] || icons.help}
        </svg>
        <div class="update-notification__content">
            <span class="update-notification__title">${escapeHtml(status.title)}</span>
            <span class="update-notification__message">${escapeHtml(result.message)}</span>
        </div>
        ${status.action && result.updateAvailable ? `
            <button type="button" class="btn btn-primary btn-sm update-notification__action" data-update-action>
                ${escapeHtml(status.action)}
            </button>
        ` : ''}
    `;

    return notification;
}

/**
 * Escapes HTML special characters.
 * @param {string} str - Input string
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export const __testHooks = Object.freeze({
    detectVersionChannel,
    formatUpdateStatus
});
