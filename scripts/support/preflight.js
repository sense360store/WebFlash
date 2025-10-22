const SUPPORTED_BROWSER_PATTERNS = [
    /\bChrome\//i,
    /\bEdg\//i
];

const UNSUPPORTED_BROWSER_PATTERNS = [
    /\bOPR\//i,
    /\bFirefox\//i
];

const MANDATORY_CHECKS = Object.freeze(['browser', 'webSerial']);

function getNavigator() {
    return typeof navigator !== 'undefined' ? navigator : undefined;
}

function buildResult(status, message, { tip = '', meta = {} } = {}) {
    return { status, message, tip, meta };
}

function detectBrowserSupport() {
    const nav = getNavigator();
    if (!nav) {
        return buildResult('fail', 'Cannot detect browser capabilities in this environment.', {
            tip: 'Open the installer in Chrome or Edge on a desktop system.'
        });
    }

    const uaData = nav.userAgentData || null;
    const brands = Array.isArray(uaData?.brands) ? uaData.brands : [];
    const brandString = brands.map(brand => brand.brand || brand.name || '').join(' ');
    const ua = String(nav.userAgent || brandString || '').trim();

    if (!ua) {
        return buildResult('warn', 'Unable to identify your browser version.', {
            tip: 'Continue if you are using Chrome 89+ or Edge 89+.'
        });
    }

    const isSupportedBrand = brands.some(({ brand = '', name = '' }) => {
        const value = (brand || name || '').toLowerCase();
        return value.includes('chrome') || value.includes('chromium') || value.includes('edge');
    });

    const matchesSupportedPattern = SUPPORTED_BROWSER_PATTERNS.some(pattern => pattern.test(ua));
    const matchesUnsupportedPattern = UNSUPPORTED_BROWSER_PATTERNS.some(pattern => pattern.test(ua));
    const hasSafariToken = /\bSafari\//i.test(ua);
    const safariOnly = hasSafariToken && !matchesSupportedPattern && !isSupportedBrand;

    if ((isSupportedBrand || matchesSupportedPattern) && !matchesUnsupportedPattern && !safariOnly) {
        const versionMatch = ua.match(/(?:Chrome|Edg)\/(\d+)/i);
        const version = versionMatch ? Number.parseInt(versionMatch[1], 10) : null;
        const versionLabel = version ? ` (v${version})` : '';
        const browserName = ua.includes('Edg/') ? 'Microsoft Edge' : 'Google Chrome';

        return buildResult('pass', `${browserName}${versionLabel} is supported.`, {
            meta: { browser: browserName, version }
        });
    }

    if (matchesUnsupportedPattern || safariOnly) {
        return buildResult('fail', 'This browser does not support Web Serial.', {
            tip: 'Switch to the latest Chrome or Edge and reload this page.'
        });
    }

    return buildResult('warn', 'Browser support is unconfirmed.', {
        tip: 'For the best experience, use Chrome or Edge on desktop.'
    });
}

function checkSecureContext() {
    if (typeof window === 'undefined') {
        return false;
    }
    if (typeof window.isSecureContext === 'boolean') {
        return window.isSecureContext;
    }
    return false;
}

function detectWebSerialSupport() {
    const nav = getNavigator();
    const secure = checkSecureContext();

    if (!secure) {
        return buildResult('fail', 'Web Serial requires a secure (HTTPS) origin.', {
            tip: 'Reload the installer from https:// (or localhost) to continue.'
        });
    }

    if (!nav || typeof nav.serial === 'undefined') {
        return buildResult('fail', 'Web Serial API is not available in this browser.', {
            tip: 'Use Chrome or Edge 89+ and ensure experimental flags are enabled if needed.'
        });
    }

    return buildResult('pass', 'Web Serial API is available.');
}

async function detectPorts() {
    const nav = getNavigator();

    if (!nav || typeof nav.serial === 'undefined') {
        return buildResult('info', 'Waiting for Web Serial support before scanning devices.');
    }

    const portsResult = { count: 0, descriptions: [] };

    try {
        const ports = await nav.serial.getPorts();
        const normalized = Array.isArray(ports) ? ports : [];
        portsResult.count = normalized.length;
        portsResult.descriptions = normalized.map((port, index) => {
            if (!port || typeof port !== 'object') {
                return `Device ${index + 1}`;
            }

            const info = port.getInfo ? port.getInfo() : {};
            const usbVendorId = info?.usbVendorId;
            const usbProductId = info?.usbProductId;

            if (usbVendorId || usbProductId) {
                const vendorHex = usbVendorId ? `0x${usbVendorId.toString(16).padStart(4, '0')}` : 'unknown vendor';
                const productHex = usbProductId ? `0x${usbProductId.toString(16).padStart(4, '0')}` : 'unknown product';
                return `USB ${vendorHex}/${productHex}`;
            }

            return `Device ${index + 1}`;
        });
    } catch (error) {
        const message = error?.message || 'Unable to enumerate serial devices.';
        return buildResult('warn', message, {
            tip: 'Close other apps that might be using the device and try again.',
            meta: { error }
        });
    }

    if (portsResult.count > 0) {
        const plural = portsResult.count === 1 ? 'device' : 'devices';
        return buildResult('pass', `Found ${portsResult.count} authorized ${plural}.`, {
            meta: portsResult
        });
    }

    return buildResult('warn', 'No authorized devices detected yet.', {
        tip: 'Connect the Sense360 hub, enter boot mode, then retry the checks.',
        meta: portsResult
    });
}

async function detectBatteryState() {
    const nav = getNavigator();
    if (!nav || typeof nav.getBattery !== 'function') {
        return buildResult('info', 'Battery information is not available in this browser.', {
            meta: { supported: false }
        });
    }

    try {
        const battery = await nav.getBattery();
        const level = typeof battery.level === 'number' ? Math.max(0, Math.min(1, battery.level)) : null;
        const charging = Boolean(battery.charging);
        const percent = level !== null ? Math.round(level * 100) : null;
        const percentLabel = percent !== null ? `${percent}%` : 'unknown level';
        const chargingLabel = charging ? ' and charging' : '';
        const meta = { supported: true, level, percent, charging };

        if (percent !== null && !charging && percent < 25) {
            return buildResult('warn', `Battery at ${percentLabel}${chargingLabel}.`, {
                tip: 'Charge the hub or keep it powered during flashing.',
                meta
            });
        }

        return buildResult('pass', `Battery at ${percentLabel}${chargingLabel}.`, { meta });
    } catch (error) {
        return buildResult('warn', 'Unable to read battery status.', {
            tip: 'Ensure the device is connected and try the checks again.',
            meta: { error }
        });
    }
}

export async function runPreflightDiagnostics() {
    const timestamp = Date.now();

    const browser = detectBrowserSupport();
    const webSerial = detectWebSerialSupport();

    let ports;
    let battery;

    try {
        ports = await detectPorts();
    } catch (error) {
        ports = buildResult('warn', 'Serial device scan failed unexpectedly.', {
            tip: 'Reload the page and try again.',
            meta: { error }
        });
    }

    try {
        battery = await detectBatteryState();
    } catch (error) {
        battery = buildResult('warn', 'Battery diagnostics encountered an error.', {
            tip: 'Ensure the hub is powered and retry.',
            meta: { error }
        });
    }

    return {
        timestamp,
        checks: {
            browser,
            webSerial,
            ports,
            battery
        }
    };
}

export function didMandatoryChecksPass(result) {
    if (!result || typeof result !== 'object') {
        return false;
    }

    const checks = result.checks || {};
    return MANDATORY_CHECKS.every((key) => checks[key]?.status === 'pass');
}

export function firstBlockingCheck(result) {
    if (!result || typeof result !== 'object') {
        return null;
    }

    const checks = result.checks || {};
    for (const key of MANDATORY_CHECKS) {
        const check = checks[key];
        if (!check || check.status !== 'pass') {
            return { key, ...check };
        }
    }

    return null;
}

export { MANDATORY_CHECKS };
