import { redact } from './redact.js';
import { getErrors } from './errors.js';

const DEFAULT_APP_INFO = {
    version: 'unknown',
    commit: ''
};

let pakoModulePromise = null;
const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function loadPako() {
    if (!pakoModulePromise) {
        pakoModulePromise = import('./vendor/pako.esm.mjs');
    }
    return pakoModulePromise;
}

function toBytes(text) {
    if (textEncoder) {
        return textEncoder.encode(text);
    }

    const bytes = [];
    for (let i = 0; i < text.length; i += 1) {
        let code = text.charCodeAt(i);

        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6));
            bytes.push(0x80 | (code & 0x3f));
        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const next = text.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                const combined = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
                bytes.push(0xf0 | (combined >> 18));
                bytes.push(0x80 | ((combined >> 12) & 0x3f));
                bytes.push(0x80 | ((combined >> 6) & 0x3f));
                bytes.push(0x80 | (combined & 0x3f));
                i += 1;
            } else {
                bytes.push(0xe0 | (code >> 12));
                bytes.push(0x80 | ((code >> 6) & 0x3f));
                bytes.push(0x80 | (code & 0x3f));
            }
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            bytes.push(0xe0 | (code >> 12));
            bytes.push(0x80 | ((code >> 6) & 0x3f));
            bytes.push(0x80 | (code & 0x3f));
        } else {
            bytes.push(0xe0 | (code >> 12));
            bytes.push(0x80 | ((code >> 6) & 0x3f));
            bytes.push(0x80 | (code & 0x3f));
        }
    }

    return Uint8Array.from(bytes);
}

function leftRotate(x, c) {
    return (x << c) | (x >>> (32 - c));
}

function add32(a, b) {
    return (a + b) >>> 0;
}

function md5FromString(text) {
    const data = toBytes(text);
    const length = data.length;
    const words = [];

    for (let i = 0; i < length; i += 1) {
        words[i >> 2] = words[i >> 2] || 0;
        words[i >> 2] |= data[i] << ((i % 4) * 8);
    }

    words[length >> 2] = words[length >> 2] || 0;
    words[length >> 2] |= 0x80 << ((length % 4) * 8);

    const totalBits = length * 8;
    const totalWords = (((length + 8) >> 6) + 1) * 16;
    while (words.length < totalWords) {
        words.push(0);
    }

    words[totalWords - 2] = totalBits & 0xffffffff;
    words[totalWords - 1] = (totalBits >>> 32) & 0xffffffff;

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    const ff = (x, y, z) => (x & y) | (~x & z);
    const gg = (x, y, z) => (x & z) | (y & ~z);
    const hh = (x, y, z) => x ^ y ^ z;
    const ii = (x, y, z) => y ^ (x | ~z);

    const round = (func, aIn, bIn, cIn, dIn, x, s, t) => {
        const res = add32(aIn, add32(func(bIn, cIn, dIn), add32(x, t)));
        return add32(leftRotate(res, s), bIn);
    };

    for (let i = 0; i < words.length; i += 16) {
        let aa = a;
        let bb = b;
        let cc = c;
        let dd = d;

        a = round(ff, a, b, c, d, words[i + 0], 7, 0xd76aa478);
        d = round(ff, d, a, b, c, words[i + 1], 12, 0xe8c7b756);
        c = round(ff, c, d, a, b, words[i + 2], 17, 0x242070db);
        b = round(ff, b, c, d, a, words[i + 3], 22, 0xc1bdceee);
        a = round(ff, a, b, c, d, words[i + 4], 7, 0xf57c0faf);
        d = round(ff, d, a, b, c, words[i + 5], 12, 0x4787c62a);
        c = round(ff, c, d, a, b, words[i + 6], 17, 0xa8304613);
        b = round(ff, b, c, d, a, words[i + 7], 22, 0xfd469501);
        a = round(ff, a, b, c, d, words[i + 8], 7, 0x698098d8);
        d = round(ff, d, a, b, c, words[i + 9], 12, 0x8b44f7af);
        c = round(ff, c, d, a, b, words[i + 10], 17, 0xffff5bb1);
        b = round(ff, b, c, d, a, words[i + 11], 22, 0x895cd7be);
        a = round(ff, a, b, c, d, words[i + 12], 7, 0x6b901122);
        d = round(ff, d, a, b, c, words[i + 13], 12, 0xfd987193);
        c = round(ff, c, d, a, b, words[i + 14], 17, 0xa679438e);
        b = round(ff, b, c, d, a, words[i + 15], 22, 0x49b40821);

        a = round(gg, a, b, c, d, words[i + 1], 5, 0xf61e2562);
        d = round(gg, d, a, b, c, words[i + 6], 9, 0xc040b340);
        c = round(gg, c, d, a, b, words[i + 11], 14, 0x265e5a51);
        b = round(gg, b, c, d, a, words[i + 0], 20, 0xe9b6c7aa);
        a = round(gg, a, b, c, d, words[i + 5], 5, 0xd62f105d);
        d = round(gg, d, a, b, c, words[i + 10], 9, 0x02441453);
        c = round(gg, c, d, a, b, words[i + 15], 14, 0xd8a1e681);
        b = round(gg, b, c, d, a, words[i + 4], 20, 0xe7d3fbc8);
        a = round(gg, a, b, c, d, words[i + 9], 5, 0x21e1cde6);
        d = round(gg, d, a, b, c, words[i + 14], 9, 0xc33707d6);
        c = round(gg, c, d, a, b, words[i + 3], 14, 0xf4d50d87);
        b = round(gg, b, c, d, a, words[i + 8], 20, 0x455a14ed);
        a = round(gg, a, b, c, d, words[i + 13], 5, 0xa9e3e905);
        d = round(gg, d, a, b, c, words[i + 2], 9, 0xfcefa3f8);
        c = round(gg, c, d, a, b, words[i + 7], 14, 0x676f02d9);
        b = round(gg, b, c, d, a, words[i + 12], 20, 0x8d2a4c8a);

        a = round(hh, a, b, c, d, words[i + 5], 4, 0xfffa3942);
        d = round(hh, d, a, b, c, words[i + 8], 11, 0x8771f681);
        c = round(hh, c, d, a, b, words[i + 11], 16, 0x6d9d6122);
        b = round(hh, b, c, d, a, words[i + 14], 23, 0xfde5380c);
        a = round(hh, a, b, c, d, words[i + 1], 4, 0xa4beea44);
        d = round(hh, d, a, b, c, words[i + 4], 11, 0x4bdecfa9);
        c = round(hh, c, d, a, b, words[i + 7], 16, 0xf6bb4b60);
        b = round(hh, b, c, d, a, words[i + 10], 23, 0xbebfbc70);
        a = round(hh, a, b, c, d, words[i + 13], 4, 0x289b7ec6);
        d = round(hh, d, a, b, c, words[i + 0], 11, 0xeaa127fa);
        c = round(hh, c, d, a, b, words[i + 3], 16, 0xd4ef3085);
        b = round(hh, b, c, d, a, words[i + 6], 23, 0x04881d05);
        a = round(hh, a, b, c, d, words[i + 9], 4, 0xd9d4d039);
        d = round(hh, d, a, b, c, words[i + 12], 11, 0xe6db99e5);
        c = round(hh, c, d, a, b, words[i + 15], 16, 0x1fa27cf8);
        b = round(hh, b, c, d, a, words[i + 2], 23, 0xc4ac5665);

        a = round(ii, a, b, c, d, words[i + 0], 6, 0xf4292244);
        d = round(ii, d, a, b, c, words[i + 7], 10, 0x432aff97);
        c = round(ii, c, d, a, b, words[i + 14], 15, 0xab9423a7);
        b = round(ii, b, c, d, a, words[i + 5], 21, 0xfc93a039);
        a = round(ii, a, b, c, d, words[i + 12], 6, 0x655b59c3);
        d = round(ii, d, a, b, c, words[i + 3], 10, 0x8f0ccc92);
        c = round(ii, c, d, a, b, words[i + 10], 15, 0xffeff47d);
        b = round(ii, b, c, d, a, words[i + 1], 21, 0x85845dd1);
        a = round(ii, a, b, c, d, words[i + 8], 6, 0x6fa87e4f);
        d = round(ii, d, a, b, c, words[i + 15], 10, 0xfe2ce6e0);
        c = round(ii, c, d, a, b, words[i + 6], 15, 0xa3014314);
        b = round(ii, b, c, d, a, words[i + 13], 21, 0x4e0811a1);
        a = round(ii, a, b, c, d, words[i + 4], 6, 0xf7537e82);
        d = round(ii, d, a, b, c, words[i + 11], 10, 0xbd3af235);
        c = round(ii, c, d, a, b, words[i + 2], 15, 0x2ad7d2bb);
        b = round(ii, b, c, d, a, words[i + 9], 21, 0xeb86d391);

        a = add32(a, aa);
        b = add32(b, bb);
        c = add32(c, cc);
        d = add32(d, dd);
    }

    const toHex = (n) => {
        let hex = '';
        for (let i = 0; i < 4; i += 1) {
            const byte = (n >>> (i * 8)) & 0xff;
            hex += byte.toString(16).padStart(2, '0');
        }
        return hex;
    };

    return [a, b, c, d].map(toHex).join('');
}

function clone(value) {
    if (!value || typeof value !== 'object') {
        return value;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        if (Array.isArray(value)) {
            return value.map((item) => clone(item));
        }
        return { ...value };
    }
}

function gatherCapabilities(capabilities = {}) {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    return {
        webSerial: Boolean(capabilities.webSerial ?? (nav && 'serial' in nav)),
        webUSB: Boolean(capabilities.webUSB ?? (nav && 'usb' in nav)),
        ua: capabilities.ua ?? nav?.userAgent ?? '',
        platform: capabilities.platform ?? nav?.platform ?? '',
        locale: capabilities.locale ?? nav?.language ?? ''
    };
}

function normaliseApp(app = {}) {
    return {
        ...DEFAULT_APP_INFO,
        ...clone(app)
    };
}

function normaliseState(state = {}, allowIPs) {
    return redact(state, { allowIPs });
}

function sanitiseErrors(allowIPs) {
    return getErrors().map((entry) => ({
        ...entry,
        message: typeof entry.message === 'string' ? redact(entry.message, { allowIPs }) : entry.message,
        stack: typeof entry.stack === 'string' ? redact(entry.stack, { allowIPs }) : entry.stack,
        cause: typeof entry.cause === 'string' ? redact(entry.cause, { allowIPs }) : entry.cause
    }));
}

function sanitiseSerial(lines = [], allowIPs) {
    if (!Array.isArray(lines)) {
        return [];
    }
    return lines.map((line) => {
        if (typeof line === 'string') {
            return redact(line, { allowIPs });
        }
        return redact(String(line ?? ''), { allowIPs });
    });
}

async function createSupportBundle(options = {}) {
    const allowIPs = Boolean(options.includeIPs);
    const app = normaliseApp(options.app);
    const state = normaliseState(options.stateSnapshot ?? {}, allowIPs);
    const capabilities = redact(gatherCapabilities(options.capabilities), { allowIPs });
    const serialLines = sanitiseSerial(options.serialLogLines, allowIPs);
    const serial = {
        lines: serialLines,
        count: serialLines.length
    };

    const payload = {
        ts: new Date().toISOString(),
        app,
        state,
        capabilities,
        errors: sanitiseErrors(allowIPs),
        serial
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const sizeBytes = toBytes(jsonString).length;
    const md5 = md5FromString(jsonString);

    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    const fileName = `webflash_support_${Date.now()}_${md5.slice(0, 8)}.json`;

    const deviceId = state?.deviceId || state?.device || state?.config_string || 'unknown-device';
    const channel = state?.channel || state?.firmwareChannel || options.stateSnapshot?.channel || 'unknown-channel';
    const guidanceSeen = state?.postInstallGuidance?.seen === true;
    const guidanceTag = `guidance:${guidanceSeen ? 'yes' : 'no'}`;
    const summary = `WebFlash ${app.version} – ${deviceId}/${channel} – ${md5.slice(0, 8)} – ${guidanceTag}`;

    return {
        jsonBlob,
        fileName,
        summary,
        md5,
        sizeBytes,
        payload
    };
}

async function createGzip(blob, baseFileName = 'bundle.json') {
    if (!(blob instanceof Blob)) {
        throw new TypeError('Expected a Blob instance');
    }

    const [arrayBuffer, pako] = await Promise.all([
        blob.arrayBuffer(),
        loadPako()
    ]);

    const gzipped = pako.gzip(new Uint8Array(arrayBuffer));
    const gzBlob = new Blob([gzipped], { type: 'application/gzip' });
    const gzFileName = baseFileName.endsWith('.gz') ? baseFileName : `${baseFileName}.gz`;

    return { gzBlob, gzFileName };
}

export { createSupportBundle, createGzip };
