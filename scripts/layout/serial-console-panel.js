/**
 * @fileoverview Serial console panel component for live log viewing.
 * @module layout/serial-console-panel
 */

import { escapeHtml } from '../utils/escape-html.js';
import {
    isSerialSupported,
    isConsoleConnected,
    connectConsole,
    disconnectConsole,
    resetDevice,
    clearLogBuffer,
    exportLogs,
    getLogBuffer
} from '../services/serial-console.js';

/** @type {HTMLElement|null} */
let panelElement = null;

/** @type {HTMLElement|null} */
let logContainer = null;

/** @type {boolean} */
let autoScroll = true;

/** @type {boolean} */
let isPanelExpanded = false;

/** @type {number} */
const MAX_VISIBLE_LINES = 500;

/**
 * Creates the serial console panel element.
 * @returns {HTMLElement}
 */
function createPanel() {
    if (panelElement) {
        return panelElement;
    }

    panelElement = document.createElement('section');
    panelElement.className = 'serial-console-panel';
    panelElement.setAttribute('aria-labelledby', 'serial-console-heading');

    const isSupported = isSerialSupported();

    panelElement.innerHTML = `
        <div class="serial-console-panel__header">
            <button type="button" class="serial-console-panel__toggle" data-console-toggle aria-expanded="false">
                <svg class="serial-console-panel__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                <h4 id="serial-console-heading" class="serial-console-panel__title">Serial Console</h4>
                <span class="serial-console-panel__status" data-console-status>Disconnected</span>
                <svg class="serial-console-panel__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
        </div>
        <div class="serial-console-panel__body" data-console-body hidden>
            ${isSupported ? `
                <div class="serial-console-panel__toolbar">
                    <div class="serial-console-panel__toolbar-left">
                        <button type="button" class="btn btn-sm btn-primary" data-console-connect>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                            Connect
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" data-console-disconnect hidden>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            </svg>
                            Disconnect
                        </button>
                        <button type="button" class="btn btn-sm btn-tertiary" data-console-reset disabled title="Reset device">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 4v6h-6M1 20v-6h6"/>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                            Reset
                        </button>
                    </div>
                    <div class="serial-console-panel__toolbar-right">
                        <label class="serial-console-panel__autoscroll">
                            <input type="checkbox" data-console-autoscroll checked>
                            <span>Auto-scroll</span>
                        </label>
                        <button type="button" class="btn btn-sm btn-tertiary" data-console-clear title="Clear console">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                        <button type="button" class="btn btn-sm btn-tertiary" data-console-download title="Download logs">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="serial-console-panel__viewport" data-console-viewport>
                    <div class="serial-console-panel__output" data-console-output role="log" aria-live="polite" aria-label="Serial output">
                        <div class="serial-console-panel__placeholder-text">
                            Click "Connect" to start viewing serial output from your device.
                        </div>
                    </div>
                </div>
            ` : `
                <div class="serial-console-panel__unsupported">
                    <p>Serial console requires a browser with Web Serial API support.</p>
                    <p>Use Chrome, Edge, or Opera on desktop for this feature.</p>
                </div>
            `}
        </div>
    `;

    return panelElement;
}

/**
 * Updates the connection status display.
 * @param {'connected'|'disconnected'|'connecting'|'error'} status - Current status
 * @param {string} [message] - Optional status message
 */
function updateStatus(status, message) {
    if (!panelElement) return;

    const statusEl = panelElement.querySelector('[data-console-status]');
    const connectBtn = panelElement.querySelector('[data-console-connect]');
    const disconnectBtn = panelElement.querySelector('[data-console-disconnect]');
    const resetBtn = panelElement.querySelector('[data-console-reset]');

    if (statusEl) {
        statusEl.className = 'serial-console-panel__status';
        statusEl.classList.add(`serial-console-panel__status--${status}`);
        statusEl.textContent = message || status.charAt(0).toUpperCase() + status.slice(1);
    }

    if (connectBtn && disconnectBtn) {
        if (status === 'connected') {
            connectBtn.hidden = true;
            disconnectBtn.hidden = false;
            if (resetBtn) resetBtn.disabled = false;
        } else if (status === 'connecting') {
            connectBtn.disabled = true;
            connectBtn.hidden = false;
            disconnectBtn.hidden = true;
            if (resetBtn) resetBtn.disabled = true;
        } else {
            connectBtn.disabled = false;
            connectBtn.hidden = false;
            disconnectBtn.hidden = true;
            if (resetBtn) resetBtn.disabled = true;
        }
    }
}

/**
 * Appends a log entry to the console output.
 * @param {Object} entry - Log entry
 * @param {string} entry.level - Log level
 * @param {string} entry.text - Log text
 * @param {string} entry.formatted - Formatted log line
 */
function appendLogEntry(entry) {
    if (!logContainer) return;

    // Remove placeholder if present
    const placeholder = logContainer.querySelector('.serial-console-panel__placeholder-text');
    if (placeholder) {
        placeholder.remove();
    }

    const lineEl = document.createElement('div');
    lineEl.className = `serial-console-panel__line serial-console-panel__line--${entry.level}`;
    lineEl.textContent = entry.formatted;

    logContainer.appendChild(lineEl);

    // Limit visible lines for performance
    const lines = logContainer.querySelectorAll('.serial-console-panel__line');
    if (lines.length > MAX_VISIBLE_LINES) {
        lines[0].remove();
    }

    // Auto-scroll if enabled
    if (autoScroll) {
        const viewport = panelElement?.querySelector('[data-console-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
}

/**
 * Clears all log entries from the console.
 */
function clearConsole() {
    if (!logContainer) return;

    logContainer.innerHTML = `
        <div class="serial-console-panel__placeholder-text">
            Console cleared. ${isConsoleConnected() ? 'Waiting for new output...' : 'Click "Connect" to start viewing serial output.'}
        </div>
    `;

    clearLogBuffer();
}

/**
 * Downloads the log buffer as a text file.
 */
function downloadLogs() {
    const logs = exportLogs();
    if (!logs) {
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sense360-serial-log-${timestamp}.txt`;

    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

/**
 * Handles connect button click.
 */
async function handleConnect() {
    updateStatus('connecting', 'Connecting...');

    const connected = await connectConsole({
        baudRate: 115200,
        maxLines: 1000,
        onData: (entry) => {
            appendLogEntry(entry);
        },
        onConnect: () => {
            updateStatus('connected', 'Connected');

            // Clear placeholder and show ready message
            if (logContainer) {
                const placeholder = logContainer.querySelector('.serial-console-panel__placeholder-text');
                if (placeholder) {
                    placeholder.textContent = 'Connected. Waiting for output...';
                }
            }
        },
        onDisconnect: () => {
            updateStatus('disconnected', 'Disconnected');
        },
        onError: (error) => {
            console.error('Serial console error:', error);
            updateStatus('error', 'Error');
        }
    });

    if (!connected) {
        updateStatus('disconnected', 'Disconnected');
    }
}

/**
 * Handles disconnect button click.
 */
async function handleDisconnect() {
    await disconnectConsole();
    updateStatus('disconnected', 'Disconnected');
}

/**
 * Handles reset button click.
 */
async function handleReset() {
    await resetDevice();

    // Add a system message
    if (logContainer) {
        const lineEl = document.createElement('div');
        lineEl.className = 'serial-console-panel__line serial-console-panel__line--system';
        lineEl.textContent = `[${new Date().toLocaleTimeString()}] --- Device reset triggered ---`;
        logContainer.appendChild(lineEl);
    }
}

/**
 * Toggles panel expansion.
 */
function togglePanel() {
    if (!panelElement) return;

    isPanelExpanded = !isPanelExpanded;

    const body = panelElement.querySelector('[data-console-body]');
    const toggle = panelElement.querySelector('[data-console-toggle]');

    if (body) {
        body.hidden = !isPanelExpanded;
    }

    if (toggle) {
        toggle.setAttribute('aria-expanded', String(isPanelExpanded));
    }

    panelElement.classList.toggle('is-expanded', isPanelExpanded);
}

/**
 * Binds event listeners to panel elements.
 */
function bindEvents() {
    if (!panelElement) return;

    // Toggle panel
    const toggleBtn = panelElement.querySelector('[data-console-toggle]');
    toggleBtn?.addEventListener('click', togglePanel);

    // Connect button
    const connectBtn = panelElement.querySelector('[data-console-connect]');
    connectBtn?.addEventListener('click', handleConnect);

    // Disconnect button
    const disconnectBtn = panelElement.querySelector('[data-console-disconnect]');
    disconnectBtn?.addEventListener('click', handleDisconnect);

    // Reset button
    const resetBtn = panelElement.querySelector('[data-console-reset]');
    resetBtn?.addEventListener('click', handleReset);

    // Clear button
    const clearBtn = panelElement.querySelector('[data-console-clear]');
    clearBtn?.addEventListener('click', clearConsole);

    // Download button
    const downloadBtn = panelElement.querySelector('[data-console-download]');
    downloadBtn?.addEventListener('click', downloadLogs);

    // Auto-scroll checkbox
    const autoScrollCheckbox = panelElement.querySelector('[data-console-autoscroll]');
    autoScrollCheckbox?.addEventListener('change', (e) => {
        autoScroll = e.target.checked;
    });

    // Store reference to output container
    logContainer = panelElement.querySelector('[data-console-output]');
}

/**
 * Initializes the serial console panel.
 * @param {HTMLElement} mountPoint - Element to mount the panel into
 * @returns {HTMLElement|null} The panel element or null if mount point missing
 */
export function initSerialConsolePanel(mountPoint) {
    if (!mountPoint) {
        console.warn('Serial console panel mount point not found');
        return null;
    }

    const panel = createPanel();
    mountPoint.appendChild(panel);
    bindEvents();

    return panel;
}

/**
 * Gets the serial console panel element.
 * @returns {HTMLElement|null}
 */
export function getSerialConsolePanel() {
    return panelElement;
}

/**
 * Expands the serial console panel.
 */
export function expandSerialConsole() {
    if (!isPanelExpanded) {
        togglePanel();
    }
}

/**
 * Collapses the serial console panel.
 */
export function collapseSerialConsole() {
    if (isPanelExpanded) {
        togglePanel();
    }
}
