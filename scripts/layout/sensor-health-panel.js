/**
 * @fileoverview Sensor health check panel component for post-flash diagnostics.
 * @module layout/sensor-health-panel
 */

import { runHealthCheck, cancelHealthCheck, getSensorTypeInfo } from '../services/sensor-health.js';
import { isWebSerialSupported } from '../services/device-info.js';

/** @type {HTMLElement|null} */
let panelElement = null;

/** @type {boolean} */
let isRunning = false;

/**
 * Creates the sensor health panel element.
 * @returns {HTMLElement}
 */
function createPanel() {
    if (panelElement) {
        return panelElement;
    }

    panelElement = document.createElement('section');
    panelElement.className = 'sensor-health-panel';
    panelElement.setAttribute('aria-labelledby', 'sensor-health-heading');

    const isSupported = isWebSerialSupported();

    panelElement.innerHTML = `
        <div class="sensor-health-panel__header">
            <h4 id="sensor-health-heading" class="sensor-health-panel__title">
                <svg class="sensor-health-panel__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                Sensor Health Check
            </h4>
            <span class="sensor-health-panel__status" data-health-status>Not checked</span>
        </div>
        <p class="sensor-health-panel__description">
            Verify that all sensors are functioning correctly after firmware installation.
        </p>
        <div class="sensor-health-panel__body">
            ${isSupported ? `
                <div class="sensor-health-panel__placeholder" data-health-placeholder>
                    <p>Run a health check to verify sensor readings from your device.</p>
                    <button type="button" class="btn btn-secondary sensor-health-panel__check-btn" data-health-check>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                        </svg>
                        Run Health Check
                    </button>
                </div>
                <div class="sensor-health-panel__loading" data-health-loading hidden>
                    <div class="sensor-health-panel__spinner"></div>
                    <p>Reading sensor data...</p>
                    <p class="sensor-health-panel__loading-hint">This may take up to 10 seconds</p>
                    <button type="button" class="btn btn-tertiary" data-health-cancel>Cancel</button>
                </div>
                <div class="sensor-health-panel__results" data-health-results hidden>
                    <div class="sensor-health-panel__summary" data-health-summary></div>
                    <div class="sensor-health-panel__sensors" data-health-sensors></div>
                    <div class="sensor-health-panel__actions">
                        <button type="button" class="btn btn-tertiary" data-health-rerun>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 4v6h-6M1 20v-6h6"/>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                            Run Again
                        </button>
                        <button type="button" class="btn btn-tertiary" data-health-raw hidden>
                            Show Raw Output
                        </button>
                    </div>
                </div>
                <div class="sensor-health-panel__error" data-health-error hidden>
                    <p class="sensor-health-panel__error-message" data-health-error-message></p>
                    <button type="button" class="btn btn-secondary" data-health-retry>Try Again</button>
                </div>
            ` : `
                <div class="sensor-health-panel__unsupported">
                    <p>Sensor health check requires Web Serial API, which is only available in Chrome and Edge on desktop.</p>
                </div>
            `}
        </div>
    `;

    // Bind event handlers
    if (isSupported) {
        bindEventHandlers();
    }

    return panelElement;
}

/**
 * Binds event handlers to panel elements.
 */
function bindEventHandlers() {
    if (!panelElement) return;

    const checkBtn = panelElement.querySelector('[data-health-check]');
    const cancelBtn = panelElement.querySelector('[data-health-cancel]');
    const rerunBtn = panelElement.querySelector('[data-health-rerun]');
    const retryBtn = panelElement.querySelector('[data-health-retry]');
    const rawBtn = panelElement.querySelector('[data-health-raw]');

    if (checkBtn) {
        checkBtn.addEventListener('click', handleHealthCheck);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancel);
    }
    if (rerunBtn) {
        rerunBtn.addEventListener('click', handleHealthCheck);
    }
    if (retryBtn) {
        retryBtn.addEventListener('click', handleHealthCheck);
    }
    if (rawBtn) {
        rawBtn.addEventListener('click', toggleRawOutput);
    }
}

/**
 * Handles the health check action.
 */
async function handleHealthCheck() {
    if (isRunning || !panelElement) return;

    isRunning = true;
    showLoadingState();

    try {
        const result = await runHealthCheck({ timeout: 10000 });

        if (result.success) {
            showResults(result);
        } else {
            showErrorState(result.error || 'Health check failed');
        }
    } catch (error) {
        console.error('[sensor-health-panel] Error:', error);
        showErrorState(error.message || 'Health check failed');
    } finally {
        isRunning = false;
    }
}

/**
 * Handles cancel action.
 */
function handleCancel() {
    isRunning = false;
    cancelHealthCheck();
    showPlaceholderState();
}

/**
 * Shows the placeholder state.
 */
function showPlaceholderState() {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-health-placeholder]');
    const loading = panelElement.querySelector('[data-health-loading]');
    const results = panelElement.querySelector('[data-health-results]');
    const error = panelElement.querySelector('[data-health-error]');
    const status = panelElement.querySelector('[data-health-status]');

    if (placeholder) placeholder.hidden = false;
    if (loading) loading.hidden = true;
    if (results) results.hidden = true;
    if (error) error.hidden = true;
    if (status) {
        status.textContent = 'Not checked';
        status.className = 'sensor-health-panel__status';
    }
}

/**
 * Shows the loading state.
 */
function showLoadingState() {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-health-placeholder]');
    const loading = panelElement.querySelector('[data-health-loading]');
    const results = panelElement.querySelector('[data-health-results]');
    const error = panelElement.querySelector('[data-health-error]');
    const status = panelElement.querySelector('[data-health-status]');

    if (placeholder) placeholder.hidden = true;
    if (loading) loading.hidden = false;
    if (results) results.hidden = true;
    if (error) error.hidden = true;
    if (status) {
        status.textContent = 'Checking...';
        status.className = 'sensor-health-panel__status sensor-health-panel__status--checking';
    }
}

/**
 * Shows the health check results.
 * @param {Object} result - Health check result
 */
function showResults(result) {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-health-placeholder]');
    const loading = panelElement.querySelector('[data-health-loading]');
    const results = panelElement.querySelector('[data-health-results]');
    const error = panelElement.querySelector('[data-health-error]');
    const summary = panelElement.querySelector('[data-health-summary]');
    const sensors = panelElement.querySelector('[data-health-sensors]');
    const status = panelElement.querySelector('[data-health-status]');
    const rawBtn = panelElement.querySelector('[data-health-raw]');

    if (placeholder) placeholder.hidden = true;
    if (loading) loading.hidden = true;
    if (results) results.hidden = false;
    if (error) error.hidden = true;

    // Update status badge
    if (status) {
        const statusText = {
            'healthy': 'All Good',
            'degraded': 'Warnings',
            'unhealthy': 'Issues Found',
            'no-sensors': 'No Sensors',
            'error': 'Error'
        }[result.overallStatus] || 'Unknown';

        status.textContent = statusText;
        status.className = `sensor-health-panel__status sensor-health-panel__status--${result.overallStatus}`;
    }

    // Render summary
    if (summary) {
        summary.innerHTML = renderSummary(result);
    }

    // Render sensor list
    if (sensors) {
        sensors.innerHTML = renderSensorList(result.sensors);
    }

    // Show raw output button if we have data
    if (rawBtn && result.rawOutput) {
        rawBtn.hidden = false;
        rawBtn.dataset.rawOutput = result.rawOutput;
    }

    // Store result for potential re-display
    panelElement.dataset.lastResult = JSON.stringify(result);

    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('sensorHealthChecked', {
        detail: { result }
    }));
}

/**
 * Renders the health summary.
 * @param {Object} result - Health check result
 * @returns {string}
 */
function renderSummary(result) {
    const { healthyCount, warningCount, errorCount, sensors, overallStatus } = result;
    const total = sensors.length;

    if (total === 0) {
        return `
            <div class="sensor-health-summary sensor-health-summary--empty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 15h8M9 9h.01M15 9h.01"/>
                </svg>
                <p>No sensor readings detected. Make sure the device is fully booted and sensors are initialized.</p>
            </div>
        `;
    }

    const icons = {
        healthy: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
        degraded: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
        unhealthy: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`
    };

    return `
        <div class="sensor-health-summary sensor-health-summary--${overallStatus}">
            <svg class="sensor-health-summary__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${icons[overallStatus] || icons.healthy}
            </svg>
            <div class="sensor-health-summary__text">
                <span class="sensor-health-summary__count">
                    ${healthyCount}/${total} sensors healthy
                </span>
                ${warningCount > 0 ? `<span class="sensor-health-summary__warnings">${warningCount} warning${warningCount > 1 ? 's' : ''}</span>` : ''}
                ${errorCount > 0 ? `<span class="sensor-health-summary__errors">${errorCount} error${errorCount > 1 ? 's' : ''}</span>` : ''}
            </div>
        </div>
    `;
}

/**
 * Renders the sensor list.
 * @param {Array} sensors - Array of sensor readings
 * @returns {string}
 */
function renderSensorList(sensors) {
    if (!sensors || sensors.length === 0) {
        return '';
    }

    return `
        <ul class="sensor-health-list">
            ${sensors.map(sensor => renderSensorItem(sensor)).join('')}
        </ul>
    `;
}

/**
 * Renders a single sensor item.
 * @param {Object} sensor - Sensor reading
 * @returns {string}
 */
function renderSensorItem(sensor) {
    const typeInfo = getSensorTypeInfo(sensor.type);

    const icons = {
        thermometer: `<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>`,
        droplet: `<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>`,
        gauge: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
        wind: `<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>`,
        cloud: `<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>`,
        sun: `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`,
        user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
        activity: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`
    };

    const statusIcons = {
        ok: `<polyline points="20 6 9 17 4 12"/>`,
        warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
        error: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`
    };

    const displayValue = formatSensorValue(sensor);

    return `
        <li class="sensor-health-item sensor-health-item--${sensor.status}">
            <svg class="sensor-health-item__type-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${icons[typeInfo.icon] || icons.activity}
            </svg>
            <div class="sensor-health-item__info">
                <span class="sensor-health-item__name">${escapeHtml(sensor.name)}</span>
                <span class="sensor-health-item__value">${displayValue}</span>
            </div>
            <svg class="sensor-health-item__status-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${statusIcons[sensor.status] || statusIcons.ok}
            </svg>
        </li>
    `;
}

/**
 * Formats a sensor value for display.
 * @param {Object} sensor - Sensor reading
 * @returns {string}
 */
function formatSensorValue(sensor) {
    if (sensor.value === null || sensor.value === undefined) {
        return 'N/A';
    }

    if (sensor.type === 'presence') {
        const val = String(sensor.value).toLowerCase();
        if (val === 'on' || val === '1' || val === 'true' || val === 'detected') {
            return 'Detected';
        }
        return 'Clear';
    }

    if (typeof sensor.value === 'number') {
        const formatted = sensor.value.toFixed(sensor.value % 1 === 0 ? 0 : 1);
        return `${formatted}${sensor.unit ? ' ' + sensor.unit : ''}`;
    }

    return `${sensor.value}${sensor.unit ? ' ' + sensor.unit : ''}`;
}

/**
 * Shows the error state.
 * @param {string} message - Error message
 */
function showErrorState(message) {
    if (!panelElement) return;

    const placeholder = panelElement.querySelector('[data-health-placeholder]');
    const loading = panelElement.querySelector('[data-health-loading]');
    const results = panelElement.querySelector('[data-health-results]');
    const error = panelElement.querySelector('[data-health-error]');
    const errorMessage = panelElement.querySelector('[data-health-error-message]');
    const status = panelElement.querySelector('[data-health-status]');

    if (placeholder) placeholder.hidden = true;
    if (loading) loading.hidden = true;
    if (results) results.hidden = true;
    if (error) error.hidden = false;

    if (errorMessage) {
        let friendlyMessage = message;
        if (message.includes('No device selected')) {
            friendlyMessage = 'No device selected. Click the button and select your Sense360 hub.';
        } else if (message.includes('already open') || message.includes('locked')) {
            friendlyMessage = 'Serial port is in use. Close other applications or try again.';
        }
        errorMessage.textContent = friendlyMessage;
    }

    if (status) {
        status.textContent = 'Error';
        status.className = 'sensor-health-panel__status sensor-health-panel__status--error';
    }
}

/**
 * Toggles raw output display.
 */
function toggleRawOutput() {
    if (!panelElement) return;

    const rawBtn = panelElement.querySelector('[data-health-raw]');
    const sensors = panelElement.querySelector('[data-health-sensors]');

    if (!rawBtn || !sensors) return;

    const isShowingRaw = rawBtn.dataset.showingRaw === 'true';

    if (isShowingRaw) {
        // Show sensor list
        const lastResult = panelElement.dataset.lastResult;
        if (lastResult) {
            const result = JSON.parse(lastResult);
            sensors.innerHTML = renderSensorList(result.sensors);
        }
        rawBtn.textContent = 'Show Raw Output';
        rawBtn.dataset.showingRaw = 'false';
    } else {
        // Show raw output
        const rawOutput = rawBtn.dataset.rawOutput || '';
        sensors.innerHTML = `
            <pre class="sensor-health-raw">${escapeHtml(rawOutput) || 'No raw output available'}</pre>
        `;
        rawBtn.textContent = 'Show Sensors';
        rawBtn.dataset.showingRaw = 'true';
    }
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

/**
 * Renders the sensor health panel into a container.
 * @param {HTMLElement} container - Container element
 * @returns {HTMLElement}
 */
export function renderSensorHealthPanel(container) {
    const panel = createPanel();

    if (container && !container.contains(panel)) {
        container.appendChild(panel);
    }

    return panel;
}

/**
 * Resets the panel to initial state.
 */
export function resetPanel() {
    showPlaceholderState();
}

export const __testHooks = Object.freeze({
    createPanel,
    renderSummary,
    renderSensorList,
    formatSensorValue
});
