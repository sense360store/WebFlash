/**
 * @fileoverview Preflight setup help modal. Walks the user through USB cable,
 * OS-specific driver/permission, and bootloader-mode troubleshooting before
 * a normal install, and provides a "Test browser and USB setup" action that
 * runs a non-destructive self-test (capability detection + serial port
 * picker + Web Serial probe).
 * @module layout/preflight-help-modal
 */

import { detectCapabilities, evaluateBrowserReadiness } from '../capabilities.js';
import { logInfo, logWarning, logError } from '../services/error-log.js';

/** @type {HTMLElement|null} */
let modalElement = null;
let isOpen = false;
/** @type {HTMLElement|null} */
let lastTrigger = null;

const OS_GUIDE = {
    windows: {
        title: 'Windows',
        steps: [
            'Plug the hub directly into a USB-A or USB-C port on the computer (avoid hubs and front-panel ports).',
            'Open <strong>Device Manager</strong> and look for the device under <em>Ports (COM &amp; LPT)</em> or <em>Other devices</em>.',
            'If it shows as “USB Serial Device” without a driver, install the <a href="https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers" target="_blank" rel="noopener noreferrer">Silicon Labs CP210x</a> or <a href="https://ftdichip.com/drivers/vcp-drivers/" target="_blank" rel="noopener noreferrer">FTDI VCP</a> driver, then unplug and reconnect the hub.',
            'Close any other tool that may be holding the COM port (Arduino IDE, PlatformIO, ESPHome dashboard, PuTTY).'
        ]
    },
    macos: {
        title: 'macOS',
        steps: [
            'Plug the hub directly into a USB port. If you only have USB-C ports, use a known-data cable or a powered USB-C hub.',
            'Open the browser, go to <strong>chrome://device-log</strong>, and confirm the device appears when you plug it in.',
            'If macOS prompts for permission to allow the device, accept it. If you previously denied it, open <strong>System Settings → Privacy &amp; Security</strong> and re-enable USB access for your browser.',
            'On Apple Silicon, use a USB-C data cable — many USB-C cables are charge-only and will not enumerate.'
        ]
    },
    linux: {
        title: 'Linux',
        steps: [
            'Plug the hub directly into the computer.',
            'Run <code>lsusb</code> in a terminal — you should see a Silicon Labs CP210x or similar USB-to-serial adapter.',
            'Run <code>ls /dev/ttyUSB* /dev/ttyACM*</code> to confirm the kernel created a device node.',
            'If permission is denied, add your user to the <code>dialout</code> (Debian / Ubuntu) or <code>uucp</code> (Arch) group and log out / log back in.'
        ]
    },
    chromeos: {
        title: 'ChromeOS',
        steps: [
            'Plug the hub directly into the Chromebook (USB-C dongles often work, USB-C hubs may not).',
            'When the install button asks for a port, you should see a CP210x / CH340 device in the picker.',
            'If nothing appears, swap the cable for a known-data USB cable and try again.'
        ]
    },
    android: {
        title: 'Android',
        steps: [
            'Web Serial isn’t supported on Android browsers. Open this page on a desktop or laptop running Chrome, Edge, or Opera.'
        ]
    },
    ios: {
        title: 'iOS / iPadOS',
        steps: [
            'Web Serial isn’t supported on Safari, Chrome, or any other iOS browser. Open this page on a desktop or laptop.'
        ]
    },
    unknown: {
        title: 'Other',
        steps: [
            'Plug the hub directly into your computer using a known-data USB cable.',
            'If your operating system isn’t listed above, check that it shows the Sense360 hub as a USB serial device and that no other application is holding the port.'
        ]
    }
};

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function createModal() {
    if (modalElement) {
        return modalElement;
    }

    modalElement = document.createElement('div');
    modalElement.className = 'preflight-help-modal rescue-modal';
    modalElement.dataset.preflightHelpModal = 'true';
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    modalElement.setAttribute('aria-labelledby', 'preflight-help-modal-title');
    modalElement.setAttribute('aria-hidden', 'true');
    modalElement.hidden = true;

    modalElement.innerHTML = `
        <div class="rescue-modal__backdrop" data-preflight-help-backdrop></div>
        <div class="rescue-modal__container preflight-help-modal__container" tabindex="-1">
            <div class="rescue-modal__header">
                <h2 id="preflight-help-modal-title" class="rescue-modal__title">Browser &amp; USB setup help</h2>
                <button type="button" class="rescue-modal__close" data-preflight-help-close aria-label="Close setup help">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="rescue-modal__body preflight-help-modal__body">
                <section class="preflight-help-modal__section" data-preflight-help-readiness></section>

                <section class="preflight-help-modal__section">
                    <h3 class="rescue-modal__section-title">USB cables matter</h3>
                    <p class="rescue-modal__text">Many USB cables (especially the ones bundled with phones and accessories) only carry power. They won’t enumerate as a serial device.</p>
                    <ul class="preflight-help-modal__list">
                        <li>Use a cable explicitly labelled <strong>data</strong> or <strong>sync</strong>, not <em>charge-only</em>.</li>
                        <li>Plug directly into the computer. Avoid hubs, KVM switches, and long extension cables.</li>
                        <li>If the hub blinks but never shows up, swap the cable before changing anything else.</li>
                    </ul>
                </section>

                <section class="preflight-help-modal__section" data-preflight-help-os></section>

                <section class="preflight-help-modal__section">
                    <h3 class="rescue-modal__section-title">Put the device into bootloader (download) mode</h3>
                    <p class="rescue-modal__text">Most hubs flash without this step. Try it if the device isn’t detected when you click Install.</p>
                    <ol class="rescue-modal__steps">
                        <li>Plug the hub into your computer with a USB <strong>data</strong> cable.</li>
                        <li>Press and hold <strong>BOOT</strong>.</li>
                        <li>While holding BOOT, briefly tap <strong>RESET</strong>, then release BOOT.</li>
                        <li>The hub is now in download mode — click Install and pick the new serial port.</li>
                    </ol>
                </section>

                <section class="preflight-help-modal__section preflight-help-modal__section--test">
                    <h3 class="rescue-modal__section-title">Test my browser and USB setup</h3>
                    <p class="rescue-modal__text">Runs a quick check: confirms Web Serial is reachable, then opens the browser’s serial-port picker so you can verify your hub appears. Nothing is written to the device.</p>
                    <button type="button" class="btn btn-primary preflight-help-modal__test" data-preflight-help-test>Run setup test</button>
                    <p class="preflight-help-modal__test-result" data-preflight-help-test-result aria-live="polite"></p>
                </section>

                <section class="preflight-help-modal__section preflight-help-modal__section--rescue">
                    <h3 class="rescue-modal__section-title">Still stuck?</h3>
                    <p class="rescue-modal__text">If the hub flashed previously but is now unresponsive, use Rescue / Recovery Mode to flash a known-good image.</p>
                    <button type="button" class="btn btn-secondary" data-rescue-open>Open Rescue / Recovery Mode</button>
                </section>
            </div>
        </div>
    `;

    bindEvents(modalElement);
    document.body.appendChild(modalElement);
    return modalElement;
}

function bindEvents(modal) {
    const backdrop = modal.querySelector('[data-preflight-help-backdrop]');
    const closeBtn = modal.querySelector('[data-preflight-help-close]');
    const testBtn = modal.querySelector('[data-preflight-help-test]');

    if (backdrop) {
        backdrop.addEventListener('click', closePreflightHelpModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closePreflightHelpModal);
    }
    if (testBtn) {
        testBtn.addEventListener('click', () => runSetupTest(modal));
    }

    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closePreflightHelpModal();
        }
    });
}

function renderReadiness(modal) {
    const mount = modal.querySelector('[data-preflight-help-readiness]');
    if (!mount) {
        return;
    }
    const readiness = evaluateBrowserReadiness(detectCapabilities());
    mount.dataset.level = readiness.level;
    mount.innerHTML = '';

    const heading = document.createElement('h3');
    heading.className = 'rescue-modal__section-title';
    heading.textContent = 'What we detected';
    mount.appendChild(heading);

    const summary = document.createElement('p');
    summary.className = 'rescue-modal__text';
    const caps = readiness.capabilities;
    summary.innerHTML = `Browser: <strong>${escapeHtml(caps.browserName || 'Unknown')}</strong> · OS: <strong>${escapeHtml(caps.osName)}</strong> · Web Serial: <strong>${caps.webSerial ? 'available' : 'unavailable'}</strong> · Secure context: <strong>${caps.secureContext ? 'yes' : 'no'}</strong>`;
    mount.appendChild(summary);

    if (readiness.reasons.length === 0) {
        const ok = document.createElement('p');
        ok.className = 'preflight-help-modal__readiness-ok';
        ok.textContent = 'No browser-side problems detected. Continue with the steps below if your device still isn’t recognised.';
        mount.appendChild(ok);
        return;
    }

    const list = document.createElement('ul');
    list.className = 'preflight-help-modal__reasons';
    readiness.reasons.forEach((reason) => {
        const li = document.createElement('li');
        li.dataset.severity = reason.severity;
        li.innerHTML = `<strong>${escapeHtml(reason.title)}.</strong> ${escapeHtml(reason.message)}`;
        list.appendChild(li);
    });
    mount.appendChild(list);
}

function renderOsSection(modal) {
    const mount = modal.querySelector('[data-preflight-help-os]');
    if (!mount) {
        return;
    }
    const caps = detectCapabilities();
    const guide = OS_GUIDE[caps.os] || OS_GUIDE.unknown;

    mount.innerHTML = '';
    const heading = document.createElement('h3');
    heading.className = 'rescue-modal__section-title';
    heading.textContent = `${guide.title} troubleshooting`;
    mount.appendChild(heading);

    const list = document.createElement('ol');
    list.className = 'rescue-modal__steps';
    guide.steps.forEach((step) => {
        const li = document.createElement('li');
        li.innerHTML = step;
        list.appendChild(li);
    });
    mount.appendChild(list);
}

function setTestResult(modal, level, message) {
    const result = modal.querySelector('[data-preflight-help-test-result]');
    if (!result) {
        return;
    }
    result.dataset.level = level;
    result.textContent = message;
}

async function runSetupTest(modal) {
    const button = modal.querySelector('[data-preflight-help-test]');
    if (button) {
        button.disabled = true;
        button.dataset.busy = 'true';
    }
    setTestResult(modal, 'info', 'Running browser and USB setup checks…');

    try {
        const caps = detectCapabilities();
        const readiness = evaluateBrowserReadiness(caps);

        if (readiness.level === 'block') {
            const first = readiness.reasons[0];
            setTestResult(modal, 'fail', `Cannot continue — ${first?.message || 'browser is not compatible.'}`);
            logWarning('preflight-help', 'Setup test failed: browser readiness blocked.', {
                code: first?.code || 'unknown',
                browser: caps.browser,
                os: caps.os
            });
            return;
        }

        if (!navigator?.serial?.requestPort) {
            setTestResult(modal, 'fail', 'navigator.serial.requestPort is unavailable. Use desktop Chrome, Edge, or Opera.');
            logWarning('preflight-help', 'Setup test failed: requestPort unavailable.');
            return;
        }

        try {
            const port = await navigator.serial.requestPort({});
            const info = typeof port?.getInfo === 'function' ? port.getInfo() : {};
            const vid = info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : 'unknown';
            const pid = info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : 'unknown';
            setTestResult(
                modal,
                'pass',
                `Browser sees a serial device (vendor ${vid}, product ${pid}). You’re ready to flash. The device was not opened or modified.`
            );
            logInfo('preflight-help', 'Setup test passed: serial port granted.', { vid, pid, browser: caps.browser, os: caps.os });
        } catch (error) {
            const name = error?.name || 'Error';
            if (name === 'NotFoundError' || name === 'AbortError') {
                setTestResult(
                    modal,
                    'warn',
                    'No port was selected. If your hub doesn’t appear in the picker, swap the USB cable for a known-data cable, plug it directly into the computer, and try again.'
                );
            } else if (name === 'SecurityError') {
                setTestResult(
                    modal,
                    'fail',
                    'The browser blocked the serial-port request. Make sure the page is loaded over HTTPS and that the OS hasn’t denied USB access for this browser.'
                );
            } else {
                setTestResult(
                    modal,
                    'fail',
                    `Setup test failed: ${error?.message || name}. Check the cable, port, and OS-specific tips below.`
                );
            }
            logError('preflight-help', error, { browser: caps.browser, os: caps.os });
        }
    } finally {
        if (button) {
            button.disabled = false;
            delete button.dataset.busy;
        }
    }
}

/**
 * @param {{ trigger?: HTMLElement|null }} [options]
 */
export function openPreflightHelpModal(options = {}) {
    const modal = createModal();
    lastTrigger = options.trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    renderReadiness(modal);
    renderOsSection(modal);
    setTestResult(modal, 'idle', '');

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        const closeBtn = modal.querySelector('[data-preflight-help-close]');
        if (closeBtn) {
            closeBtn.focus();
        }
    }, 50);
}

export function closePreflightHelpModal() {
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
 * Lazy-init the modal so the DOM only inflates on first open. Wires up clicks
 * on any element with `data-preflight-help-open`.
 */
export function initPreflightHelpModal() {
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest?.('[data-preflight-help-open]');
        if (trigger) {
            event.preventDefault();
            openPreflightHelpModal({ trigger });
        }
    });
}

export const __testHooks = Object.freeze({
    OS_GUIDE,
    runSetupTest,
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
