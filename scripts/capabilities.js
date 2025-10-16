export function detectCapabilities() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const ua = nav?.userAgent ?? '';

    const webSerial = Boolean(nav && 'serial' in nav);
    const webUSB = Boolean(nav && 'usb' in nav);

    let browser = 'other';
    const uaLower = ua.toLowerCase();

    if (uaLower.includes('edg/')) {
        browser = 'edge';
    } else if (uaLower.includes('chrome') && !uaLower.includes('edg') && !uaLower.includes('opr') && !uaLower.includes('brave')) {
        browser = 'chrome';
    }

    return {
        webSerial,
        webUSB,
        ua,
        browser
    };
}
