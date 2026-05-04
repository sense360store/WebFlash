/**
 * @fileoverview Rescue / Recovery Mode modal for re-flashing the bundled
 *   rescue firmware when a device is unbootable, mis-flashed, or otherwise
 *   needs a known-good baseline.
 * @module layout/rescue-modal
 */

import { detectCapabilities } from '../capabilities.js';
import { openErrorLogModal } from './error-log-modal.js';
import {
    recordRecoveryAcknowledged,
    recordRecoveryResult,
    recordBootloaderInstructionsShown
} from '../services/diagnostics.js';

const RESCUE_MANIFEST_URL = './firmware/rescue/manifest.json';
const RESCUE_VERSION_LABEL = 'Sense360 Rescue v1.0.0-rescue';

const BROWSER_MESSAGES = {
    firefox: 'Firefox does not support Web Serial API. Please open this page in <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a> to flash firmware.',
    safari: 'Safari does not support Web Serial API. Please open this page in <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a> to flash firmware.',
    other: 'Web Serial is not available in this browser. For the best experience, switch to <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a>.'
};

/** @type {HTMLElement|null} */
let modalElement = null;

/** @type {boolean} */
let isOpen = false;

/** @type {HTMLElement|null} */
let lastTrigger = null;

function createModal() {
    if (modalElement) {
        return modalElement;
    }

    modalElement = document.createElement('div');
    modalElement.className = 'rescue-modal';
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    modalElement.setAttribute('aria-labelledby', 'rescue-modal-title');
    modalElement.setAttribute('aria-hidden', 'true');
    modalElement.hidden = true;

    modalElement.innerHTML = `
        <div class="rescue-modal__backdrop" data-rescue-backdrop></div>
        <div class="rescue-modal__container" tabindex="-1">
            <div class="rescue-modal__header">
                <h2 id="rescue-modal-title" class="rescue-modal__title">
                    <svg class="rescue-modal__title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                    Rescue / Recovery Mode
                </h2>
                <button type="button" class="rescue-modal__close" data-rescue-close aria-label="Close rescue mode">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="rescue-modal__body">
                <section class="rescue-modal__section">
                    <h3 class="rescue-modal__section-title">When to use this</h3>
                    <p class="rescue-modal__text">
                        Use Rescue mode if your device fails to flash, ended up with the
                        wrong firmware, won&rsquo;t boot, or you want to return it to a
                        known-good baseline. The Rescue firmware is a minimal,
                        signed image that brings the hub back to a flashable state.
                    </p>
                    <p class="rescue-modal__text rescue-modal__text--muted">
                        After a successful rescue flash, return to the wizard to
                        re-install the firmware that matches your hardware.
                    </p>
                </section>

                <section class="rescue-modal__section rescue-modal__section--callout" data-rescue-capability hidden>
                    <p class="rescue-modal__capability" data-rescue-capability-message></p>
                </section>

                <section class="rescue-modal__section">
                    <h3 class="rescue-modal__section-title">Put the device into download mode</h3>
                    <ol class="rescue-modal__steps">
                        <li>Plug the hub into your computer with a USB <strong>data</strong> cable.</li>
                        <li>Press and hold the <strong>BOOT</strong> button.</li>
                        <li>While holding BOOT, briefly tap <strong>RESET</strong>, then release BOOT.</li>
                        <li>The device is now in download mode &mdash; click <strong>Install</strong> below and pick the new serial port.</li>
                    </ol>
                </section>

                <section class="rescue-modal__section rescue-modal__section--action">
                    <div class="rescue-modal__action-meta">
                        <h3 class="rescue-modal__section-title">Flash Rescue firmware</h3>
                        <p class="rescue-modal__version" data-rescue-version>${RESCUE_VERSION_LABEL}</p>
                        <p class="rescue-modal__warning">
                            This will <strong>erase the device</strong> and replace its firmware
                            with the rescue image. Any on-device configuration (Wi-Fi, names,
                            calibration) will be lost.
                        </p>
                    </div>
                    <label class="rescue-modal__ack">
                        <input type="checkbox" data-rescue-ack>
                        <span>I understand this will erase the device.</span>
                    </label>
                    <div class="rescue-modal__install" data-rescue-install-mount></div>
                </section>
            </div>
            <div class="rescue-modal__footer">
                <span class="rescue-modal__footer-label">Coming from a failed flash?</span>
                <button type="button" class="btn btn-tertiary rescue-modal__diagnostics" data-rescue-open-diagnostics>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    View error log
                </button>
                <button type="button" class="btn btn-tertiary rescue-modal__support-bundle" data-copy-support-bundle aria-label="Copy support bundle">
                    Copy support bundle
                </button>
            </div>
        </div>
    `;

    bindEvents(modalElement);
    document.body.appendChild(modalElement);
    return modalElement;
}

function bindEvents(modal) {
    const backdrop = modal.querySelector('[data-rescue-backdrop]');
    const closeBtn = modal.querySelector('[data-rescue-close]');
    const ackCheckbox = modal.querySelector('[data-rescue-ack]');
    const diagnosticsBtn = modal.querySelector('[data-rescue-open-diagnostics]');

    if (backdrop) {
        backdrop.addEventListener('click', closeRescueModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeRescueModal);
    }
    if (ackCheckbox) {
        ackCheckbox.addEventListener('change', () => {
            recordRecoveryAcknowledged(Boolean(ackCheckbox.checked));
            updateInstallEnabled(modal);
        });
    }
    if (diagnosticsBtn) {
        diagnosticsBtn.addEventListener('click', () => {
            try {
                openErrorLogModal();
            } catch (err) {
                console.warn('[rescue-modal] Failed to open error log modal', err);
            }
        });
    }

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeRescueModal();
        }
    });
}

function ensureInstallButton(modal) {
    const mount = modal.querySelector('[data-rescue-install-mount]');
    if (!mount) return null;

    let button = mount.querySelector('esp-web-install-button');
    if (button) {
        return button;
    }

    button = document.createElement('esp-web-install-button');
    button.setAttribute('manifest', RESCUE_MANIFEST_URL);
    button.setAttribute('erase-first', '');
    button.dataset.rescueInstall = 'true';

    const slottedButton = document.createElement('button');
    slottedButton.type = 'button';
    slottedButton.slot = 'activate';
    slottedButton.className = 'btn btn-primary rescue-modal__install-button';
    slottedButton.textContent = 'Install Rescue firmware';

    const unsupported = document.createElement('span');
    unsupported.slot = 'unsupported';
    unsupported.className = 'rescue-modal__install-unsupported';
    unsupported.textContent = 'Web Serial is not supported in this browser.';

    button.appendChild(slottedButton);
    button.appendChild(unsupported);
    mount.appendChild(button);

    button.addEventListener('state-changed', (event) => {
        const detail = event?.detail;
        if (!detail) {
            return;
        }
        const state = detail.state || '';
        const message = detail.message || '';
        if (detail.error || state === 'ERROR' || /error|failed|abort/i.test(message)) {
            recordRecoveryResult({
                result: 'failed',
                error: detail.error || { message: message || 'Recovery flash error' }
            });
        } else if (state === 'FINISHED') {
            recordRecoveryResult({ result: 'success' });
        }
    });

    return button;
}

function updateInstallEnabled(modal) {
    const ackCheckbox = modal.querySelector('[data-rescue-ack]');
    const button = modal.querySelector('esp-web-install-button [slot="activate"]');
    if (!button) return;
    const checked = !!(ackCheckbox && ackCheckbox.checked);
    button.disabled = !checked;
    button.setAttribute('aria-disabled', String(!checked));
}

function applyCapabilityMessage(modal) {
    const callout = modal.querySelector('[data-rescue-capability]');
    const message = modal.querySelector('[data-rescue-capability-message]');
    if (!callout || !message) return;

    const capabilities = detectCapabilities();
    if (capabilities.webSerial) {
        callout.hidden = true;
        message.innerHTML = '';
        return;
    }

    const browserKey = capabilities.browser && BROWSER_MESSAGES[capabilities.browser]
        ? capabilities.browser
        : 'other';
    callout.hidden = false;
    message.innerHTML = BROWSER_MESSAGES[browserKey];
}

/**
 * Opens the rescue modal.
 * @param {{ trigger?: HTMLElement|null }} [options]
 */
export function openRescueModal(options = {}) {
    const modal = createModal();
    lastTrigger = options.trigger || document.activeElement;

    applyCapabilityMessage(modal);
    ensureInstallButton(modal);
    recordBootloaderInstructionsShown(true);

    const ackCheckbox = modal.querySelector('[data-rescue-ack]');
    if (ackCheckbox) {
        ackCheckbox.checked = false;
    }
    recordRecoveryAcknowledged(false);
    updateInstallEnabled(modal);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    isOpen = true;

    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        const closeBtn = modal.querySelector('[data-rescue-close]');
        if (closeBtn) {
            closeBtn.focus();
        }
    }, 50);
}

/**
 * Closes the rescue modal and returns focus to the trigger element.
 */
export function closeRescueModal() {
    if (!modalElement || !isOpen) {
        return;
    }

    modalElement.hidden = true;
    modalElement.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.body.style.overflow = '';

    if (lastTrigger && typeof lastTrigger.focus === 'function' && document.contains(lastTrigger)) {
        lastTrigger.focus();
    }
    lastTrigger = null;
}

/**
 * Lazy-initializes the rescue modal so the DOM only inflates on first open.
 */
export function initRescueModal() {
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-rescue-open]');
        if (trigger) {
            e.preventDefault();
            openRescueModal({ trigger });
        }
    });
}

export const __testHooks = Object.freeze({
    createModal,
    ensureInstallButton,
    updateInstallEnabled,
    applyCapabilityMessage,
    isOpen: () => isOpen,
    reset: () => {
        if (modalElement && modalElement.parentNode) {
            modalElement.parentNode.removeChild(modalElement);
        }
        modalElement = null;
        isOpen = false;
        lastTrigger = null;
        document.body.style.overflow = '';
    }
});
