/**
 * @fileoverview Browser capability detection for Web Serial and Web USB APIs.
 * @module capabilities
 */

/**
 * @typedef {'chrome'|'edge'|'firefox'|'safari'|'opera'|'brave'|'other'} BrowserType
 */

/**
 * @typedef {Object} BrowserCapabilities
 * @property {boolean} webSerial - Whether Web Serial API is available
 * @property {boolean} webUSB - Whether Web USB API is available
 * @property {string} ua - The browser's user agent string
 * @property {BrowserType} browser - Detected browser type
 * @property {boolean} isSupported - Whether the browser supports firmware flashing
 * @property {string} browserName - Human-readable browser name
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

/**
 * Detects browser capabilities required for firmware flashing.
 *
 * Checks for Web Serial API (required for ESP32 flashing) and Web USB API.
 * Also identifies the browser type to provide appropriate guidance.
 *
 * @returns {BrowserCapabilities} Object containing detected capabilities
 * @example
 * const caps = detectCapabilities();
 * if (!caps.webSerial) {
 *   console.warn('Web Serial not supported, flashing will not work');
 * }
 */
export function detectCapabilities() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const ua = nav?.userAgent ?? '';

    const webSerial = Boolean(nav && 'serial' in nav);
    const webUSB = Boolean(nav && 'usb' in nav);

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

    return {
        webSerial,
        webUSB,
        ua,
        browser,
        isSupported: info.supported && webSerial,
        browserName: info.name,
        guidance: info.guidance
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
