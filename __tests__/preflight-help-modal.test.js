import { jest } from '@jest/globals';

const detectCapabilitiesMock = jest.fn();
const evaluateBrowserReadinessMock = jest.fn();
const logInfoMock = jest.fn();
const logWarningMock = jest.fn();
const logErrorMock = jest.fn();

async function loadModal() {
    jest.unstable_mockModule('../scripts/capabilities.js', () => ({
        detectCapabilities: detectCapabilitiesMock,
        evaluateBrowserReadiness: evaluateBrowserReadinessMock,
        getBrowserGuidance: jest.fn(() => ({ name: 'Chrome', supported: true, guidance: 'OK' }))
    }));
    jest.unstable_mockModule('../scripts/services/error-log.js', () => ({
        logInfo: logInfoMock,
        logWarning: logWarningMock,
        logError: logErrorMock
    }));
    return import('../scripts/layout/preflight-help-modal.js');
}

describe('preflight help modal', () => {
    let mod;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        detectCapabilitiesMock.mockReset();
        evaluateBrowserReadinessMock.mockReset();
        logInfoMock.mockReset();
        logWarningMock.mockReset();
        logErrorMock.mockReset();

        detectCapabilitiesMock.mockReturnValue({
            webSerial: true,
            browser: 'chrome',
            browserName: 'Chrome',
            os: 'macos',
            osName: 'macOS',
            isMobile: false,
            secureContext: true,
            isSupported: true
        });
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'ok',
            reasons: [],
            capabilities: detectCapabilitiesMock()
        });

        mod = await loadModal();
    });

    afterEach(() => {
        if (mod && mod.__testHooks) {
            mod.__testHooks.reset();
        }
    });

    test('opens with role=dialog and renders OS-specific guidance', () => {
        mod.openPreflightHelpModal();
        const modal = document.querySelector('.preflight-help-modal');
        expect(modal).not.toBeNull();
        expect(modal.getAttribute('role')).toBe('dialog');
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.hidden).toBe(false);
        const osSection = modal.querySelector('[data-preflight-help-os]');
        expect(osSection.textContent).toMatch(/macOS troubleshooting/);
    });

    test('readiness section shows ok message when no reasons present', () => {
        mod.openPreflightHelpModal();
        const readiness = document.querySelector('[data-preflight-help-readiness]');
        expect(readiness.dataset.level).toBe('ok');
        expect(readiness.textContent).toMatch(/No browser-side problems detected/);
    });

    test('readiness section lists block reasons with their severity', () => {
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'block',
            reasons: [{
                code: 'no-web-serial',
                severity: 'block',
                title: 'Web Serial not available',
                message: 'Switch to Chrome.'
            }],
            capabilities: detectCapabilitiesMock()
        });

        mod.openPreflightHelpModal();
        const readiness = document.querySelector('[data-preflight-help-readiness]');
        expect(readiness.dataset.level).toBe('block');
        const reasonItem = readiness.querySelector('.preflight-help-modal__reasons li');
        expect(reasonItem.dataset.severity).toBe('block');
        expect(reasonItem.textContent).toMatch(/Web Serial not available/);
    });

    test('Escape key closes the modal', () => {
        mod.openPreflightHelpModal();
        const modal = document.querySelector('.preflight-help-modal');
        modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(modal.hidden).toBe(true);
    });

    test('runSetupTest reports a fail when readiness is blocked', async () => {
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'block',
            reasons: [{
                code: 'mobile-browser',
                severity: 'block',
                title: 't',
                message: 'No mobile devices.'
            }],
            capabilities: detectCapabilitiesMock()
        });
        mod.openPreflightHelpModal();
        const modal = document.querySelector('.preflight-help-modal');
        await mod.__testHooks.runSetupTest(modal);
        const result = modal.querySelector('[data-preflight-help-test-result]');
        expect(result.dataset.level).toBe('fail');
        expect(result.textContent).toMatch(/No mobile devices/);
        expect(logWarningMock).toHaveBeenCalled();
    });

    test('runSetupTest reports a pass when navigator.serial.requestPort returns a port', async () => {
        const port = {
            getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 })
        };
        const requestPort = jest.fn(() => Promise.resolve(port));
        Object.defineProperty(global.navigator, 'serial', {
            value: { requestPort },
            configurable: true
        });

        mod.openPreflightHelpModal();
        const modal = document.querySelector('.preflight-help-modal');
        await mod.__testHooks.runSetupTest(modal);
        const result = modal.querySelector('[data-preflight-help-test-result]');
        expect(result.dataset.level).toBe('pass');
        expect(result.textContent).toMatch(/0x10c4/);
        expect(result.textContent).toMatch(/0xea60/);
        expect(logInfoMock).toHaveBeenCalled();
    });

    test('runSetupTest reports a warn when the user cancels the picker', async () => {
        const requestPort = jest.fn(() => {
            const err = new Error('No port selected');
            err.name = 'NotFoundError';
            return Promise.reject(err);
        });
        Object.defineProperty(global.navigator, 'serial', {
            value: { requestPort },
            configurable: true
        });

        mod.openPreflightHelpModal();
        const modal = document.querySelector('.preflight-help-modal');
        await mod.__testHooks.runSetupTest(modal);
        const result = modal.querySelector('[data-preflight-help-test-result]');
        expect(result.dataset.level).toBe('warn');
        expect(result.textContent).toMatch(/No port was selected/);
    });
});
