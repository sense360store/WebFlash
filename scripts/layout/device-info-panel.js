/**
 * @fileoverview Device information panel component for pre-flash diagnostics.
 * @module layout/device-info-panel
 */

import {
    isWebSerialSupported,
    readDeviceInfo,
    formatDeviceInfo,
    checkConfigCompatibility,
    closePort
} from '../services/device-info.js';

/** @type {HTMLElement|null} */
let panelElement = null;

/** @type {Object|null} */
let currentDeviceInfo = null;

/** @type {boolean} */
let isReading = false;

/**
 * Creates the device info panel element.
 * @returns {HTMLElement}
 */
function createPanel() {
    if (panelElement) {
        return panelElement;
    }

    panelElement = document.createElement('section');
    panelElement.className = 'device-info-panel';
    panelElement.setAttribute('aria-labelledby', 'device-info-heading');

    const isSupported = isWebSerialSupported();

    panelElement.innerHTML = `
        <div class="device-info-panel__header">
            <h4 id="device-info-heading" class="device-info-panel__title">
                <svg class="device-info-panel__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <line x1="9" y1="1" x2="9" y2="4"/>
                    <line x1="15" y1="1" x2="15" y2="4"/>
                    <line x1="9" y1="20" x2="9" y2="23"/>
                    <line x1="15" y1="20" x2="15" y2="23"/>
                    <line x1="20" y1="9" x2="23" y2="9"/>
                    <line x1="20" y1="14" x2="23" y2="14"/>
                    <line x1="1" y1="9" x2="4" y2="9"/>
                    <line x1="1" y1="14" x2="4" y2="14"/>
                </svg>
                Connected Device
            </h4>
            <span class="device-info-panel__status" data-device-status>Not connected</span>
        </div>
        <div class="device-info-panel__body">
            ${isSupported ? `
                <div class="device-info-panel__placeholder" data-device-placeholder>
                    <p>Read device information to verify chip type and check existing firmware.</p>
                    <button type="button" class="btn btn-secondary device-info-panel__read-btn" data-device-read>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                        Read Device Info
                    </button>
                </div>
                <div class="device-info-panel__loading" data-device-loading hidden>
                    <div class="device-info-panel__spinner"></div>
                    <p>Reading device info...</p>
                    <button type="button" class="btn btn-tertiary" data-device-cancel>Cancel</button>
                </div>
                <div class="device-info-panel__content" data-device-content hidden>
                    <dl class="device-info-panel__details" data-device-details></dl>
                    <div class="device-info-panel__warning" data-device-warning hidden></div>
                    <div class="device-info-panel__actions">
                        <button type="button" class="btn btn-tertiary" data-device-refresh>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 4v6h-6M1 20v-6h6"/>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                            Read Again
                        </button>
                    </div>
                </div>
                <div class="device-info-panel__error" data-device-error hidden>
                    <p class="device-info-panel__error-message" data-device-error-message></p>
                    <button type="button" class="btn btn-secondary" data-device-retry>Try Again</button>
                </div>
            ` : `
                <div class="device-info-panel__unsupported">
                    <p>Device reading requires Web Serial API, which is only available in Chrome and Edge on desktop.</p>
                </div>
            `}
        </div>
    `;

    // Bind event handlers if supported
    if (isSupported) {
        const readBtn = panelElement.querySelector('[data-device-read]');
        const refreshBtn = panelElement.querySelector('[data-device-refresh]');
        const retryBtn = panelElement.querySelector('[data-device-retry]');
        const cancelBtn = panelElement.querySelector('[data-device-cancel]');

        if (readBtn) {
            readBtn.addEventListener('click', handleRead);
        }
        if (refreshBtn) {
            refreshBtn.addEventListener('click', handleRead);
        }
        if (retryBtn) {
            retryBtn.addEventListener('click', handleRead);
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', handleCancel);
        }
    }

    return panelElement;
}

/**
 * Handles the read device info action.
 */
async function handleRead() {
    if (isReading || !panelElement) {
        return;
    }

    isReading = true;
    showLoadingState();

    try {
        const info = await readDeviceInfo({ timeout: 6000 });
        currentDeviceInfo = info;

        if (info.error) {
            showErrorState(info.error);
        } else {
            showDeviceInfo(info);
        }
    } catch (error) {
        console.error('[device-info-panel] Read error:', error);
        showErrorState(error.message || 'Failed to read device');
    } finally {
        isReading = false;
    }
}

/**
 * Handles cancel action.
 */
async function handleCancel() {
    isReading = false;
    await closePort();
    showPlaceholderState();
}

/**
 * Shows the placeholder state.
 */
function showPlaceholderState() {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-device-placeholder]');
    const loading = panelElement.querySelector('[data-device-loading]');
    const content = panelElement.querySelector('[data-device-content]');
    const error = panelElement.querySelector('[data-device-error]');
    const status = panelElement.querySelector('[data-device-status]');

    if (placeholder) placeholder.hidden = false;
    if (loading) loading.hidden = true;
    if (content) content.hidden = true;
    if (error) error.hidden = true;
    if (status) {
        status.textContent = 'Not connected';
        status.className = 'device-info-panel__status';
    }
}

/**
 * Shows the loading state.
 */
function showLoadingState() {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-device-placeholder]');
    const loading = panelElement.querySelector('[data-device-loading]');
    const content = panelElement.querySelector('[data-device-content]');
    const error = panelElement.querySelector('[data-device-error]');
    const status = panelElement.querySelector('[data-device-status]');

    if (placeholder) placeholder.hidden = true;
    if (loading) loading.hidden = false;
    if (content) content.hidden = true;
    if (error) error.hidden = true;
    if (status) {
        status.textContent = 'Reading...';
        status.className = 'device-info-panel__status device-info-panel__status--reading';
    }
}

/**
 * Shows the device info content.
 * @param {Object} info - Device info object
 */
function showDeviceInfo(info) {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-device-placeholder]');
    const loading = panelElement.querySelector('[data-device-loading]');
    const content = panelElement.querySelector('[data-device-content]');
    const error = panelElement.querySelector('[data-device-error]');
    const details = panelElement.querySelector('[data-device-details]');
    const warning = panelElement.querySelector('[data-device-warning]');
    const status = panelElement.querySelector('[data-device-status]');

    if (placeholder) placeholder.hidden = true;
    if (loading) loading.hidden = true;
    if (content) content.hidden = false;
    if (error) error.hidden = true;

    // Update status
    if (status) {
        if (info.hasExistingFirmware) {
            status.textContent = 'Firmware detected';
            status.className = 'device-info-panel__status device-info-panel__status--detected';
        } else if (info.chipFamily || info.macAddress) {
            status.textContent = 'Connected';
            status.className = 'device-info-panel__status device-info-panel__status--connected';
        } else {
            status.textContent = 'Partial read';
            status.className = 'device-info-panel__status device-info-panel__status--partial';
        }
    }

    // Render details
    if (details) {
        details.innerHTML = renderDeviceDetails(info);
    }

    // Check configuration compatibility
    if (warning) {
        const configString = window.currentConfigString || '';
        if (configString && info.hasExistingFirmware) {
            const compat = checkConfigCompatibility(info, configString);
            if (!compat.matches) {
                warning.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>${compat.message}</span>
                `;
                warning.hidden = false;
            } else {
                warning.hidden = true;
            }
        } else {
            warning.hidden = true;
        }
    }

    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('deviceInfoRead', {
        detail: { deviceInfo: info }
    }));
}

/**
 * Renders device details as definition list items.
 * @param {Object} info - Device info object
 * @returns {string} HTML string
 */
function renderDeviceDetails(info) {
    const items = [];

    if (info.chipFamily) {
        items.push(`
            <div class="device-info-panel__detail">
                <dt>Chip</dt>
                <dd>${escapeHtml(info.chipFamily)}</dd>
            </div>
        `);
    }

    if (info.chipId) {
        items.push(`
            <div class="device-info-panel__detail">
                <dt>Chip ID</dt>
                <dd><code>${escapeHtml(info.chipId)}</code></dd>
            </div>
        `);
    }

    if (info.macAddress) {
        items.push(`
            <div class="device-info-panel__detail">
                <dt>MAC Address</dt>
                <dd><code>${escapeHtml(info.macAddress)}</code></dd>
            </div>
        `);
    }

    if (info.flashSize) {
        const sizeMB = info.flashSize / (1024 * 1024);
        items.push(`
            <div class="device-info-panel__detail">
                <dt>Flash Size</dt>
                <dd>${sizeMB} MB</dd>
            </div>
        `);
    }

    if (info.hasExistingFirmware) {
        if (info.firmwareName) {
            items.push(`
                <div class="device-info-panel__detail device-info-panel__detail--firmware">
                    <dt>Current Firmware</dt>
                    <dd>${escapeHtml(info.firmwareName)}</dd>
                </div>
            `);
        }

        if (info.firmwareVersion) {
            items.push(`
                <div class="device-info-panel__detail">
                    <dt>Version</dt>
                    <dd>${escapeHtml(info.firmwareVersion)}</dd>
                </div>
            `);
        }
    } else if (info.chipFamily || info.macAddress) {
        items.push(`
            <div class="device-info-panel__detail device-info-panel__detail--info">
                <dt>Status</dt>
                <dd>No existing firmware detected</dd>
            </div>
        `);
    }

    if (items.length === 0) {
        return '<p class="device-info-panel__no-data">Could not read device details. The device may need to be reset.</p>';
    }

    return items.join('');
}

/**
 * Shows the error state.
 * @param {string} message - Error message
 */
function showErrorState(message) {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-device-placeholder]');
    const loading = panelElement.querySelector('[data-device-loading]');
    const content = panelElement.querySelector('[data-device-content]');
    const error = panelElement.querySelector('[data-device-error]');
    const errorMessage = panelElement.querySelector('[data-device-error-message]');
    const status = panelElement.querySelector('[data-device-status]');

    if (placeholder) placeholder.hidden = true;
    if (loading) loading.hidden = true;
    if (content) content.hidden = true;
    if (error) error.hidden = false;

    if (errorMessage) {
        // Provide user-friendly error messages
        let friendlyMessage = message;
        if (message.includes('No device selected')) {
            friendlyMessage = 'No device selected. Click the button and select your Sense360 hub from the list.';
        } else if (message.includes('Timeout')) {
            friendlyMessage = 'Device did not respond. Make sure the device is connected and powered on.';
        } else if (message.includes('already open') || message.includes('locked')) {
            friendlyMessage = 'Serial port is in use. Close any other applications using the device.';
        }
        errorMessage.textContent = friendlyMessage;
    }

    if (status) {
        status.textContent = 'Error';
        status.className = 'device-info-panel__status device-info-panel__status--error';
    }
}

/**
 * Escapes HTML special characters.
 * @param {string} str - Input string
 * @returns {string} Escaped string
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

/**
 * Renders the device info panel into a container element.
 * @param {HTMLElement} container - The container element
 * @returns {HTMLElement} The panel element
 */
export function renderDeviceInfoPanel(container) {
    const panel = createPanel();

    if (container && !container.contains(panel)) {
        container.appendChild(panel);
    }

    return panel;
}

/**
 * Gets the current device info if available.
 * @returns {Object|null}
 */
export function getCurrentDeviceInfo() {
    return currentDeviceInfo;
}

/**
 * Resets the panel to initial state.
 */
export function resetPanel() {
    currentDeviceInfo = null;
    showPlaceholderState();
}

export const __testHooks = Object.freeze({
    createPanel,
    renderDeviceDetails,
    showDeviceInfo,
    showErrorState
});
