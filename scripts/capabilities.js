/**
 * @fileoverview Browser capability detection for Web Serial and Web USB APIs.
 * @module capabilities
 */

/**
 * @typedef {'chrome'|'edge'|'firefox'|'safari'|'opera'|'brave'|'other'} BrowserType
 */

/**
 * @typedef {'macos'|'windows'|'linux'|'chromeos'|'android'|'ios'|'unknown'} OperatingSystem
 */

/**
 * @typedef {Object} BrowserCapabilities
 * @property {boolean} webSerial - Whether Web Serial API is available
 * @property {boolean} webUSB - Whether Web USB API is available
 * @property {string} ua - The browser's user agent string
 * @property {BrowserType} browser - Detected browser type
 * @property {boolean} isSupported - Whether the browser supports firmware flashing
 * @property {string} browserName - Human-readable browser name
 * @property {boolean} secureContext - Whether the page is loaded in a secure context
 * @property {boolean} isMobile - Whether the user agent looks like a mobile device
 * @property {OperatingSystem} os - Detected operating system
 * @property {string} osName - Human-readable OS name
 */

/**
 * Browser-specific information for user guidance.
 * @type {Object<BrowserType, {name: string, supported: boolean, guidance: string}>}
 */
const BROWSER_INFO = {
    chrome: {
        name: 'Google Chrome',
        supported: true,
        guidance: 'You\'re using a supported browser.'
    },
    edge: {
        name: 'Microsoft Edge',
        supported: true,
        guidance: 'You\'re using a supported browser.'
    },
    firefox: {
        name: 'Mozilla Firefox',
        supported: false,
        guidance: 'Firefox does not support Web Serial. Please use Chrome or Edge.'
    },
    safari: {
        name: 'Safari',
        supported: false,
        guidance: 'Safari does not support Web Serial. Please use Chrome or Edge.'
    },
    opera: {
        name: 'Opera',
        supported: true,
        guidance: 'Opera supports Web Serial, but Chrome or Edge is recommended.'
    },
    brave: {
        name: 'Brave',
        supported: true,
        guidance: 'Brave supports Web Serial. If issues occur, try Chrome.'
    },
    other: {
        name: 'Unknown Browser',
        supported: false,
        guidance: 'Your browser may not support Web Serial. Please use Chrome or Edge.'
    }
};

const OS_NAMES = {
    macos: 'macOS',
    windows: 'Windows',
    linux: 'Linux',
    chromeos: 'ChromeOS',
    android: 'Android',
    ios: 'iOS / iPadOS',
    unknown: 'Unknown'
};

/**
 * @param {string} uaLower - lowercased user agent
 * @returns {OperatingSystem}
 */
function detectOs(uaLower) {
    if (!uaLower) {
        return 'unknown';
    }
    if (uaLower.includes('cros') || uaLower.includes('chromeos')) {
        return 'chromeos';
    }
    if (uaLower.includes('android')) {
        return 'android';
    }
    // iPadOS 13+ identifies as Mac unless we check for touch points; do that only in browsers.
    const looksLikeIPad = typeof navigator !== 'undefined'
        && /macintosh/.test(uaLower)
        && (navigator.maxTouchPoints || 0) > 1;
    if (uaLower.includes('iphone') || uaLower.includes('ipad') || uaLower.includes('ipod') || looksLikeIPad) {
        return 'ios';
    }
    if (uaLower.includes('windows')) {
        return 'windows';
    }
    if (uaLower.includes('mac os') || uaLower.includes('macintosh')) {
        return 'macos';
    }
    if (uaLower.includes('linux')) {
        return 'linux';
    }
    return 'unknown';
}

/**
 * @param {string} uaLower - lowercased user agent
 * @param {OperatingSystem} os
 * @returns {boolean}
 */
function detectMobile(uaLower, os) {
    if (os === 'android' || os === 'ios') {
        return true;
    }
    if (!uaLower) {
        return false;
    }
    return /\bmobi\b|mobile|tablet|iemobile|opera mini/.test(uaLower);
}

/**
 * Detects browser capabilities required for firmware flashing.
 *
 * Checks for Web Serial API (required for ESP32 flashing) and Web USB API.
 * Also identifies the browser type, operating system, secure-context status,
 * and whether the user agent looks like a mobile device, so callers can give
 * specific guidance before the user tries to install.
 *
 * @returns {BrowserCapabilities} Object containing detected capabilities
 */
export function detectCapabilities() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const ua = nav?.userAgent ?? '';

    const webSerial = Boolean(nav && 'serial' in nav);
    const webUSB = Boolean(nav && 'usb' in nav);
    const secureContext = typeof window !== 'undefined' && typeof window.isSecureContext === 'boolean'
        ? window.isSecureContext
        // jsdom doesn't always set isSecureContext; default to true so detection
        // doesn't generate false negatives in tests / older runtimes.
        : true;

    let browser = 'other';
    const uaLower = ua.toLowerCase();

    // Order matters: check more specific patterns first
    if (uaLower.includes('edg/')) {
        browser = 'edge';
    } else if (uaLower.includes('brave')) {
        browser = 'brave';
    } else if (uaLower.includes('opr/') || uaLower.includes('opera')) {
        browser = 'opera';
    } else if (uaLower.includes('firefox')) {
        browser = 'firefox';
    } else if (uaLower.includes('safari') && !uaLower.includes('chrome')) {
        browser = 'safari';
    } else if (uaLower.includes('chrome')) {
        browser = 'chrome';
    }

    const info = BROWSER_INFO[browser] || BROWSER_INFO.other;
    const os = detectOs(uaLower);
    const isMobile = detectMobile(uaLower, os);

    return {
        webSerial,
        webUSB,
        ua,
        browser,
        isSupported: info.supported && webSerial && secureContext && !isMobile,
        browserName: info.name,
        guidance: info.guidance,
        secureContext,
        isMobile,
        os,
        osName: OS_NAMES[os] || OS_NAMES.unknown
    };
}

/**
 * Gets browser-specific guidance for the user.
 * @param {BrowserType} browser - The detected browser type
 * @returns {{name: string, supported: boolean, guidance: string}} Browser information
 */
export function getBrowserGuidance(browser) {
    return BROWSER_INFO[browser] || BROWSER_INFO.other;
}

/**
 * @typedef {Object} BrowserReadinessReason
 * @property {string} code - Stable identifier for the reason
 * @property {'block'|'warn'} severity - 'block' prevents flashing, 'warn' is advisory
 * @property {string} title - Short headline
 * @property {string} message - Detailed user-facing message
 * @property {string} [action] - Suggested action label
 */

/**
 * @typedef {Object} BrowserReadiness
 * @property {'ok'|'warn'|'block'} level
 * @property {Array<BrowserReadinessReason>} reasons
 * @property {BrowserCapabilities} capabilities
 */

/**
 * Evaluates whether the browser is ready to flash firmware and returns a
 * structured list of reasons (mobile, insecure context, missing Web Serial,
 * unsupported browser). Order matters: more severe reasons first so the UI
 * can show the most actionable problem at the top.
 *
 * @param {BrowserCapabilities} [capabilities]
 * @returns {BrowserReadiness}
 */
export function evaluateBrowserReadiness(capabilities = detectCapabilities()) {
    /** @type {Array<BrowserReadinessReason>} */
    const reasons = [];
    let level = 'ok';

    const escalate = (next) => {
        if (next === 'block') {
            level = 'block';
        } else if (next === 'warn' && level !== 'block') {
            level = 'warn';
        }
    };

    if (capabilities.isMobile) {
        reasons.push({
            code: 'mobile-browser',
            severity: 'block',
            title: 'Mobile devices can’t flash',
            message: 'Web Serial isn’t available on mobile browsers. Open this page on a desktop or laptop running Chrome, Edge, or Opera and plug the hub into a USB port.',
            action: 'Open on a laptop or desktop'
        });
        escalate('block');
    }

    if (!capabilities.secureContext) {
        reasons.push({
            code: 'insecure-context',
            severity: 'block',
            title: 'Insecure page',
            message: 'Web Serial only works when the page is served over HTTPS or from localhost. Reload the page using its https:// address.',
            action: 'Reload over HTTPS'
        });
        escalate('block');
    }

    if (!capabilities.webSerial) {
        const knownBlocked = capabilities.browser === 'firefox' || capabilities.browser === 'safari';
        reasons.push({
            code: 'no-web-serial',
            severity: 'block',
            title: 'Web Serial not available',
            message: knownBlocked
                ? `${capabilities.browserName} doesn’t implement Web Serial. Open this page in desktop Chrome, Edge, or Opera to flash.`
                : 'This browser doesn’t expose the Web Serial API. Use desktop Chrome, Edge, or Opera to flash.',
            action: 'Switch to a Chromium browser'
        });
        escalate('block');
    } else if (!capabilities.isSupported && !capabilities.isMobile && capabilities.secureContext) {
        // Web Serial exists but the browser isn't on the recommended list (e.g.
        // an unknown Chromium fork). Allow flashing but warn the user.
        reasons.push({
            code: 'untested-browser',
            severity: 'warn',
            title: 'Untested browser',
            message: `Your browser (${capabilities.browserName || 'Unknown'}) isn’t one of the browsers Sense360 tests against. Flashing may still work — if it doesn’t, switch to Chrome or Edge.`,
            action: 'Continue at your own risk'
        });
        escalate('warn');
    }

    return { level, reasons, capabilities };
}
