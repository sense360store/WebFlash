import { jest } from '@jest/globals';

const evaluateBrowserReadinessMock = jest.fn();
const detectCapabilitiesMock = jest.fn();
const openPreflightHelpModalMock = jest.fn();

async function loadBanner() {
    jest.unstable_mockModule('../scripts/capabilities.js', () => ({
        detectCapabilities: detectCapabilitiesMock,
        evaluateBrowserReadiness: evaluateBrowserReadinessMock,
        getBrowserGuidance: jest.fn(() => ({ name: 'Chrome', supported: true, guidance: 'OK' }))
    }));
    jest.unstable_mockModule('../scripts/layout/preflight-help-modal.js', () => ({
        openPreflightHelpModal: openPreflightHelpModalMock,
        closePreflightHelpModal: jest.fn(),
        initPreflightHelpModal: jest.fn()
    }));
    return import('../scripts/layout/preflight-banner.js');
}

describe('preflight banner', () => {
    let mod;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '<div data-preflight-banner-mount></div>';
        evaluateBrowserReadinessMock.mockReset();
        detectCapabilitiesMock.mockReset();
        openPreflightHelpModalMock.mockReset();

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

        mod = await loadBanner();
    });

    test('renders the supported state with a "Test browser & USB setup" CTA', () => {
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'ok',
            reasons: [],
            capabilities: detectCapabilitiesMock()
        });

        const mount = document.querySelector('[data-preflight-banner-mount]');
        mod.renderPreflightBanner(mount);

        const banner = mount.querySelector('.preflight-banner');
        expect(banner).not.toBeNull();
        expect(banner.dataset.level).toBe('ok');
        expect(banner.querySelector('.preflight-banner__title').textContent)
            .toMatch(/Your browser appears compatible/);
        expect(banner.querySelector('[data-preflight-help-open]')).not.toBeNull();
        expect(banner.querySelector('[data-preflight-help-open]').textContent)
            .toMatch(/Test browser/);
    });

    test('renders block state with the most severe reason and an "Open setup help" CTA', () => {
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'block',
            reasons: [
                {
                    code: 'mobile-browser',
                    severity: 'block',
                    title: 'Mobile devices can’t flash',
                    message: 'Switch to a desktop browser.'
                },
                {
                    code: 'no-web-serial',
                    severity: 'block',
                    title: 'Web Serial not available',
                    message: 'No Web Serial here.'
                }
            ],
            capabilities: detectCapabilitiesMock()
        });

        const mount = document.querySelector('[data-preflight-banner-mount]');
        mod.renderPreflightBanner(mount);

        const banner = mount.querySelector('.preflight-banner');
        expect(banner.dataset.level).toBe('block');
        expect(banner.getAttribute('role')).toBe('alert');
        expect(banner.querySelector('.preflight-banner__title').textContent)
            .toBe('Mobile devices can’t flash');
        expect(banner.querySelector('.preflight-banner__summary').textContent)
            .toBe('Switch to a desktop browser.');
        const reasonItems = banner.querySelectorAll('.preflight-banner__reasons li');
        expect(reasonItems.length).toBe(1);
        expect(reasonItems[0].textContent).toMatch(/Web Serial not available/);
        // No dismiss button when blocking.
        expect(banner.querySelector('.preflight-banner__dismiss')).toBeNull();
        const helpBtn = banner.querySelector('[data-preflight-help-open]');
        expect(helpBtn.textContent).toBe('Open setup help');
    });

    test('clicking the help action opens the preflight help modal', () => {
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'block',
            reasons: [{ code: 'no-web-serial', severity: 'block', title: 't', message: 'm' }],
            capabilities: detectCapabilitiesMock()
        });
        const mount = document.querySelector('[data-preflight-banner-mount]');
        mod.renderPreflightBanner(mount);
        mount.querySelector('[data-preflight-help-open]').click();
        expect(openPreflightHelpModalMock).toHaveBeenCalledTimes(1);
    });

    test('warn-level banner renders a dismiss button that removes the banner', () => {
        evaluateBrowserReadinessMock.mockReturnValue({
            level: 'warn',
            reasons: [{ code: 'untested-browser', severity: 'warn', title: 'Untested', message: 'Try Chrome.' }],
            capabilities: detectCapabilitiesMock()
        });
        const mount = document.querySelector('[data-preflight-banner-mount]');
        mod.renderPreflightBanner(mount);
        const banner = mount.querySelector('.preflight-banner');
        const dismiss = banner.querySelector('.preflight-banner__dismiss');
        expect(dismiss).not.toBeNull();
        dismiss.click();
        expect(mount.querySelector('.preflight-banner')).toBeNull();
    });
});
