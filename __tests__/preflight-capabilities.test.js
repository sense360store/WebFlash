import { jest } from '@jest/globals';

const ORIGINAL_NAVIGATOR = global.navigator;

function withNavigator(props, fn) {
    const original = global.navigator;
    Object.defineProperty(global, 'navigator', {
        value: { ...original, ...props },
        configurable: true
    });
    try {
        return fn();
    } finally {
        Object.defineProperty(global, 'navigator', {
            value: original,
            configurable: true
        });
    }
}

function withWindow(secureContext, fn) {
    const original = window.isSecureContext;
    Object.defineProperty(window, 'isSecureContext', {
        value: secureContext,
        configurable: true
    });
    try {
        return fn();
    } finally {
        Object.defineProperty(window, 'isSecureContext', {
            value: original,
            configurable: true
        });
    }
}

describe('capabilities detection', () => {
    afterEach(() => {
        Object.defineProperty(global, 'navigator', {
            value: ORIGINAL_NAVIGATOR,
            configurable: true
        });
    });

    test('detects desktop Chrome with Web Serial as supported', async () => {
        const { detectCapabilities } = await import('../scripts/capabilities.js');
        const caps = withNavigator(
            {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36',
                serial: {},
                usb: {}
            },
            () => withWindow(true, () => detectCapabilities())
        );
        expect(caps.browser).toBe('chrome');
        expect(caps.os).toBe('macos');
        expect(caps.isMobile).toBe(false);
        expect(caps.webSerial).toBe(true);
        expect(caps.secureContext).toBe(true);
        expect(caps.isSupported).toBe(true);
    });

    test('flags iOS Safari as mobile + unsupported', async () => {
        const { detectCapabilities, evaluateBrowserReadiness } = await import('../scripts/capabilities.js');
        const caps = withNavigator(
            {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
                maxTouchPoints: 5
            },
            () => withWindow(true, () => detectCapabilities())
        );
        expect(caps.isMobile).toBe(true);
        expect(caps.os).toBe('ios');
        expect(caps.webSerial).toBe(false);
        expect(caps.isSupported).toBe(false);

        const readiness = evaluateBrowserReadiness(caps);
        expect(readiness.level).toBe('block');
        expect(readiness.reasons.some(r => r.code === 'mobile-browser')).toBe(true);
    });

    test('flags Firefox desktop as missing Web Serial', async () => {
        const { detectCapabilities, evaluateBrowserReadiness } = await import('../scripts/capabilities.js');
        const caps = withNavigator(
            {
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
            },
            () => withWindow(true, () => detectCapabilities())
        );
        expect(caps.browser).toBe('firefox');
        expect(caps.os).toBe('linux');
        expect(caps.webSerial).toBe(false);

        const readiness = evaluateBrowserReadiness(caps);
        expect(readiness.level).toBe('block');
        const reason = readiness.reasons.find(r => r.code === 'no-web-serial');
        expect(reason).toBeDefined();
        expect(reason.message).toMatch(/Mozilla Firefox/);
    });

    test('insecure context blocks even with Web Serial present', async () => {
        const { detectCapabilities, evaluateBrowserReadiness } = await import('../scripts/capabilities.js');
        const caps = withNavigator(
            {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
                serial: {}
            },
            () => withWindow(false, () => detectCapabilities())
        );
        expect(caps.browser).toBe('edge');
        expect(caps.secureContext).toBe(false);

        const readiness = evaluateBrowserReadiness(caps);
        expect(readiness.level).toBe('block');
        expect(readiness.reasons.some(r => r.code === 'insecure-context')).toBe(true);
    });

    test('emits warn for an untested Chromium fork that still exposes Web Serial', async () => {
        const { detectCapabilities, evaluateBrowserReadiness } = await import('../scripts/capabilities.js');
        const caps = withNavigator(
            {
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ExoticChromium/9.9',
                serial: {}
            },
            () => withWindow(true, () => detectCapabilities())
        );
        expect(caps.browser).toBe('other');
        const readiness = evaluateBrowserReadiness(caps);
        expect(readiness.level).toBe('warn');
        expect(readiness.reasons[0].code).toBe('untested-browser');
    });
});
