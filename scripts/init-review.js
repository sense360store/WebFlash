/**
 * @fileoverview Review step initialization with browser capability detection.
 * @module init-review
 */

import { detectCapabilities } from './capabilities.js';
import { renderCapabilityBar } from './ui-capability-bar.js';
import { renderDeviceInfoPanel } from './layout/device-info-panel.js';
import { createChangelogButton, initChangelogModal } from './layout/changelog-modal.js';
import { renderSensorHealthPanel } from './layout/sensor-health-panel.js';
import { createErrorLogButton, initErrorLogModal } from './layout/error-log-modal.js';
import { initGlobalErrorHandlers } from './services/error-log.js';

/**
 * Browser-specific messages for unsupported browsers.
 * @type {Object<string, string>}
 */
const BROWSER_MESSAGES = {
    firefox: 'Firefox does not support Web Serial API. Please open this page in <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a> to flash firmware.',
    safari: 'Safari does not support Web Serial API. Please open this page in <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a> to flash firmware.',
    other: 'Web Serial is not available in this browser. For the best experience, switch to <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a>.'
};

/**
 * Creates a capability warning note for unsupported browsers.
 * @param {HTMLElement|null} stepHeading - The heading element to focus after dismissal
 * @param {Object} capabilities - Browser capabilities from detectCapabilities()
 * @returns {HTMLElement} The warning note element
 * @private
 */
function createCapabilityNote(stepHeading, capabilities = {}) {
    const note = document.createElement('div');
    note.className = 'capability-note';
    note.setAttribute('role', 'alert');
    note.setAttribute('aria-live', 'assertive');

    const message = document.createElement('p');
    const browserMessage = BROWSER_MESSAGES[capabilities.browser] || BROWSER_MESSAGES.other;
    message.innerHTML = browserMessage;

    // Add detected browser info for context
    if (capabilities.browserName && capabilities.browser !== 'other') {
        const browserInfo = document.createElement('p');
        browserInfo.className = 'capability-note__browser';
        browserInfo.textContent = `Detected browser: ${capabilities.browserName}`;
        note.appendChild(browserInfo);
    }

    const actions = document.createElement('div');
    actions.className = 'capability-note__actions';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'capability-note__dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss browser support guidance');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', () => {
        note.remove();
        if (stepHeading) {
            stepHeading.focus();
        }
    });

    actions.appendChild(dismissBtn);

    note.appendChild(message);
    note.appendChild(actions);

    return note;
}

document.addEventListener('DOMContentLoaded', () => {
    const step = document.getElementById('step-4');
    if (!step) {
        return;
    }

    const capabilities = detectCapabilities();
    const heading = step.querySelector('h2');

    const capabilityBar = renderCapabilityBar(capabilities);

    if (heading) {
        if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
            heading.addEventListener('blur', () => {
                heading.removeAttribute('tabindex');
            }, { once: true });
        }
        step.insertBefore(capabilityBar, heading.nextSibling);
    } else {
        step.insertBefore(capabilityBar, step.firstChild);
    }

    if (!capabilities.webSerial) {
        const warning = createCapabilityNote(heading, capabilities);
        step.insertBefore(warning, capabilityBar.nextSibling);
    }

    // Initialize device info panel
    const deviceInfoContainer = document.querySelector('[data-device-info-mount]');
    if (deviceInfoContainer) {
        renderDeviceInfoPanel(deviceInfoContainer);
    }

    // Initialize changelog modal
    initChangelogModal();

    // Initialize error log modal and global error handlers
    initGlobalErrorHandlers();
    initErrorLogModal();

    // Add changelog button to firmware section
    const firmwareHeading = step.querySelector('.compatible-firmware-heading');
    if (firmwareHeading) {
        const changelogBtn = createChangelogButton();
        changelogBtn.classList.add('compatible-firmware-changelog-btn');
        firmwareHeading.appendChild(changelogBtn);

        // Add error log button
        const errorLogBtn = createErrorLogButton();
        errorLogBtn.classList.add('compatible-firmware-changelog-btn');
        firmwareHeading.appendChild(errorLogBtn);
    }

    // Initialize sensor health panel after device info container
    if (deviceInfoContainer) {
        const healthPanelContainer = document.createElement('div');
        healthPanelContainer.className = 'sensor-health-container';
        healthPanelContainer.setAttribute('data-sensor-health-mount', '');
        deviceInfoContainer.after(healthPanelContainer);
        renderSensorHealthPanel(healthPanelContainer);
    }
});
