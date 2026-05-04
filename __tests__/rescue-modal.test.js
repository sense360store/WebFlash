import { jest } from '@jest/globals';

const detectCapabilitiesMock = jest.fn();
const openErrorLogModalMock = jest.fn();

async function loadRescueModal() {
    jest.unstable_mockModule('../scripts/capabilities.js', () => ({
        detectCapabilities: detectCapabilitiesMock,
        getBrowserGuidance: jest.fn(() => ({ name: 'Chrome', supported: true, guidance: 'OK' }))
    }));
    jest.unstable_mockModule('../scripts/layout/error-log-modal.js', () => ({
        openErrorLogModal: openErrorLogModalMock,
        createErrorLogButton: jest.fn(() => document.createElement('button')),
        initErrorLogModal: jest.fn(),
        closeModal: jest.fn()
    }));

    return import('../scripts/layout/rescue-modal.js');
}

describe('rescue-modal', () => {
    let mod;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        detectCapabilitiesMock.mockReset();
        detectCapabilitiesMock.mockReturnValue({
            webSerial: true,
            browser: 'chrome',
            browserName: 'Chrome',
            isSupported: true
        });
        openErrorLogModalMock.mockReset();

        mod = await loadRescueModal();
    });

    afterEach(() => {
        if (mod && mod.__testHooks) {
            mod.__testHooks.reset();
        }
    });

    test('openRescueModal renders the dialog with aria-modal="true"', () => {
        mod.openRescueModal();
        const modal = document.querySelector('.rescue-modal');
        expect(modal).not.toBeNull();
        expect(modal.getAttribute('role')).toBe('dialog');
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-hidden')).toBe('false');
        expect(modal.hidden).toBe(false);
    });

    test('install button is disabled until the ack checkbox is checked', () => {
        mod.openRescueModal();
        const ack = document.querySelector('[data-rescue-ack]');
        const activate = document.querySelector('esp-web-install-button [slot="activate"]');

        expect(ack).not.toBeNull();
        expect(activate).not.toBeNull();
        expect(activate.disabled).toBe(true);
        expect(activate.getAttribute('aria-disabled')).toBe('true');

        ack.checked = true;
        ack.dispatchEvent(new Event('change'));

        expect(activate.disabled).toBe(false);
        expect(activate.getAttribute('aria-disabled')).toBe('false');

        ack.checked = false;
        ack.dispatchEvent(new Event('change'));

        expect(activate.disabled).toBe(true);
        expect(activate.getAttribute('aria-disabled')).toBe('true');
    });

    test('Escape key closes the modal and returns focus to the trigger', () => {
        const trigger = document.createElement('button');
        trigger.textContent = 'Open rescue';
        document.body.appendChild(trigger);
        trigger.focus();

        mod.openRescueModal({ trigger });
        const modal = document.querySelector('.rescue-modal');
        expect(modal.hidden).toBe(false);

        modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(modal.hidden).toBe(true);
        expect(modal.getAttribute('aria-hidden')).toBe('true');
        expect(document.activeElement).toBe(trigger);
    });

    test('backdrop click and closeRescueModal both hide the modal', () => {
        mod.openRescueModal();
        const modal = document.querySelector('.rescue-modal');
        const backdrop = modal.querySelector('[data-rescue-backdrop]');

        backdrop.click();
        expect(modal.hidden).toBe(true);

        mod.openRescueModal();
        expect(modal.hidden).toBe(false);
        mod.closeRescueModal();
        expect(modal.hidden).toBe(true);
    });

    test('shows a capability warning when Web Serial is not available', () => {
        detectCapabilitiesMock.mockReturnValue({
            webSerial: false,
            browser: 'firefox',
            browserName: 'Firefox',
            isSupported: false
        });

        mod.openRescueModal();
        const callout = document.querySelector('[data-rescue-capability]');
        const message = document.querySelector('[data-rescue-capability-message]');
        expect(callout.hidden).toBe(false);
        expect(message.innerHTML).toMatch(/Firefox does not support Web Serial/);
    });

    test('opens the error log modal when "View error log" is clicked', () => {
        mod.openRescueModal();
        const diagnosticsBtn = document.querySelector('[data-rescue-open-diagnostics]');
        expect(diagnosticsBtn).not.toBeNull();
        diagnosticsBtn.click();
        expect(openErrorLogModalMock).toHaveBeenCalledTimes(1);
    });

    test('install button uses the rescue manifest URL and erase-first attribute', () => {
        mod.openRescueModal();
        const button = document.querySelector('esp-web-install-button');
        expect(button).not.toBeNull();
        expect(button.getAttribute('manifest')).toBe('./firmware/rescue/manifest.json');
        expect(button.hasAttribute('erase-first')).toBe(true);
    });

    test('copy is honest about what rescue can and cannot fix', () => {
        mod.openRescueModal();
        const body = document.querySelector('.rescue-modal__body').textContent;
        // Hardware/cable/driver/bootloader caveats must appear so the modal
        // does not overclaim "factory restore" or unbrick guarantees.
        expect(body).toMatch(/hardware/i);
        expect(body).toMatch(/cable/i);
        // The salted-SHA-256 metadata is integrity, not authenticity, so the
        // copy must not advertise the rescue image as cryptographically
        // "signed" (see firmware-provenance.js trust-model docstring).
        expect(body).not.toMatch(/signed image|signed firmware/i);
    });

    test('cancellation messages are recorded as cancelled, not failed', async () => {
        const diagnostics = await import('../scripts/services/diagnostics.js');
        diagnostics.resetSessionDiagnosticsStateForTests();

        mod.openRescueModal();
        const installButton = document.querySelector('esp-web-install-button');
        installButton.dispatchEvent(new CustomEvent('state-changed', {
            detail: { state: 'ERROR', message: 'User cancelled the install dialog' }
        }));

        const session = diagnostics.getSessionDiagnosticsState();
        expect(session.lastRecoveryResult).toBe('cancelled');
    });

    test('genuine error messages are recorded as failed', async () => {
        const diagnostics = await import('../scripts/services/diagnostics.js');
        diagnostics.resetSessionDiagnosticsStateForTests();

        mod.openRescueModal();
        const installButton = document.querySelector('esp-web-install-button');
        installButton.dispatchEvent(new CustomEvent('state-changed', {
            detail: {
                state: 'ERROR',
                message: 'Failed to connect to ESP32',
                error: new Error('Failed to connect to ESP32')
            }
        }));

        const session = diagnostics.getSessionDiagnosticsState();
        expect(session.lastRecoveryResult).toBe('failed');
    });

    test('successful FINISHED state clears any prior recovery error', async () => {
        const diagnostics = await import('../scripts/services/diagnostics.js');
        diagnostics.resetSessionDiagnosticsStateForTests();

        mod.openRescueModal();
        const installButton = document.querySelector('esp-web-install-button');

        installButton.dispatchEvent(new CustomEvent('state-changed', {
            detail: {
                state: 'ERROR',
                message: 'Failed to connect',
                error: new Error('Failed to connect')
            }
        }));
        expect(diagnostics.getSessionDiagnosticsState().lastRecoveryResult).toBe('failed');

        installButton.dispatchEvent(new CustomEvent('state-changed', {
            detail: { state: 'FINISHED' }
        }));
        const finalSession = diagnostics.getSessionDiagnosticsState();
        expect(finalSession.lastRecoveryResult).toBe('success');
        expect(finalSession.lastRecoveryError).toBeUndefined();
    });

    test('opening the modal resets the acknowledgement to false', async () => {
        const diagnostics = await import('../scripts/services/diagnostics.js');
        diagnostics.resetSessionDiagnosticsStateForTests();

        mod.openRescueModal();
        const ack = document.querySelector('[data-rescue-ack]');
        ack.checked = true;
        ack.dispatchEvent(new Event('change'));
        expect(diagnostics.getSessionDiagnosticsState().recoveryAcknowledged).toBe(true);

        mod.closeRescueModal();
        mod.openRescueModal();

        const ackAfter = document.querySelector('[data-rescue-ack]');
        expect(ackAfter.checked).toBe(false);
        expect(diagnostics.getSessionDiagnosticsState().recoveryAcknowledged).toBe(false);
    });
});
