/**
 * @fileoverview QR code modal component for configuration sharing.
 * @module layout/qr-code-modal
 */

import { generateQRCodeSVG } from '../utils/qr-code.js';

/** @type {HTMLElement|null} */
let modalElement = null;

/** @type {HTMLElement|null} */
let qrContainer = null;

/** @type {HTMLElement|null} */
let urlDisplay = null;

/** @type {string|null} */
let currentUrl = null;

/**
 * Creates the QR code modal element and appends it to the document.
 * @returns {HTMLElement} The modal element
 */
function createModal() {
    if (modalElement) {
        return modalElement;
    }

    modalElement = document.createElement('div');
    modalElement.id = 'qr-code-modal';
    modalElement.className = 'qr-code-modal';
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    modalElement.setAttribute('aria-labelledby', 'qr-modal-title');
    modalElement.setAttribute('tabindex', '-1');
    modalElement.hidden = true;

    modalElement.innerHTML = `
        <div class="qr-code-modal__backdrop" data-qr-modal-close></div>
        <div class="qr-code-modal__content">
            <div class="qr-code-modal__header">
                <h3 id="qr-modal-title" class="qr-code-modal__title">Scan to share configuration</h3>
                <button type="button" class="qr-code-modal__close" data-qr-modal-close aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="qr-code-modal__body">
                <div class="qr-code-modal__qr-container" data-qr-container>
                    <div class="qr-code-modal__loading">Generating QR code...</div>
                </div>
                <p class="qr-code-modal__instructions">
                    Scan this QR code with your phone to open the same configuration on another device.
                </p>
                <div class="qr-code-modal__url-container">
                    <input type="text" class="qr-code-modal__url-input" data-qr-url readonly aria-label="Configuration URL">
                    <button type="button" class="btn btn-secondary qr-code-modal__copy-btn" data-qr-copy>
                        Copy
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalElement);

    // Cache element references
    qrContainer = modalElement.querySelector('[data-qr-container]');
    urlDisplay = modalElement.querySelector('[data-qr-url]');

    // Bind event handlers
    modalElement.querySelectorAll('[data-qr-modal-close]').forEach(el => {
        el.addEventListener('click', closeModal);
    });

    const copyBtn = modalElement.querySelector('[data-qr-copy]');
    if (copyBtn) {
        copyBtn.addEventListener('click', handleCopy);
    }

    // Close on escape
    modalElement.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    return modalElement;
}

/**
 * Opens the QR code modal with the given URL.
 * @param {string} url - The URL to encode as a QR code
 */
export function openQRCodeModal(url) {
    const modal = createModal();
    currentUrl = url;

    // Generate QR code
    if (qrContainer) {
        try {
            const svg = generateQRCodeSVG(url, {
                size: 280,
                margin: 2,
                darkColor: '#1a1a2e',
                lightColor: '#ffffff'
            });
            qrContainer.innerHTML = svg;
        } catch (error) {
            console.error('[qr-code-modal] Failed to generate QR code:', error);
            qrContainer.innerHTML = `
                <div class="qr-code-modal__error">
                    <p>Could not generate QR code.</p>
                    <p class="qr-code-modal__error-detail">URL may be too long for QR encoding.</p>
                </div>
            `;
        }
    }

    // Update URL display
    if (urlDisplay) {
        urlDisplay.value = url;
    }

    // Show modal
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('qr-modal-open');

    // Focus the modal for accessibility
    requestAnimationFrame(() => {
        modal.focus();
    });
}

/**
 * Closes the QR code modal.
 */
export function closeModal() {
    if (modalElement) {
        modalElement.hidden = true;
        modalElement.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('qr-modal-open');
    }
}

/**
 * Handles copying the URL to clipboard.
 */
async function handleCopy(event) {
    const button = event.currentTarget;
    if (!currentUrl || !button) {
        return;
    }

    try {
        await navigator.clipboard.writeText(currentUrl);
        showCopyFeedback(button, 'Copied!');
    } catch (error) {
        // Fallback for older browsers
        try {
            if (urlDisplay) {
                urlDisplay.select();
                document.execCommand('copy');
                showCopyFeedback(button, 'Copied!');
            }
        } catch (fallbackError) {
            console.error('[qr-code-modal] Failed to copy:', fallbackError);
            showCopyFeedback(button, 'Copy failed');
        }
    }
}

/**
 * Shows temporary feedback on the copy button.
 * @param {HTMLElement} button - The button element
 * @param {string} message - Feedback message
 */
function showCopyFeedback(button, message) {
    const originalText = button.textContent;
    button.textContent = message;

    setTimeout(() => {
        button.textContent = originalText;
    }, 1500);
}

/**
 * Checks if the modal is currently open.
 * @returns {boolean}
 */
export function isModalOpen() {
    return modalElement && !modalElement.hidden;
}

// Export for testing
export const __testHooks = Object.freeze({
    createModal,
    closeModal
});
