import { describe, expect, test } from '@jest/globals';
import {
    redactValue,
    REDACTION_PLACEHOLDERS,
    __testHooks
} from '../scripts/services/diagnostics.js';

describe('redactValue — key-based password category', () => {
    test('redacts plain `password` key', () => {
        expect(redactValue({ password: 'hunter2' })).toEqual({
            password: REDACTION_PLACEHOLDERS.PASSWORD
        });
    });

    test('redacts `passphrase` key', () => {
        expect(redactValue({ passphrase: 'sense360-correct-horse' })).toEqual({
            passphrase: REDACTION_PLACEHOLDERS.PASSWORD
        });
    });

    test('redacts nested wifi.password', () => {
        const input = { wifi: { ssid: 'home', password: 'topsecret' } };
        const result = redactValue(input);
        expect(result.wifi.password).toBe(REDACTION_PLACEHOLDERS.PASSWORD);
        expect(result.wifi.ssid).toBe(REDACTION_PLACEHOLDERS.DEFAULT);
    });
});

describe('redactValue — token category', () => {
    test('redacts `api_key`', () => {
        expect(redactValue({ api_key: 'sk-abc' }).api_key).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    });

    test('redacts camelCase `apiKey`', () => {
        expect(redactValue({ apiKey: 'sk-abc' }).apiKey).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    });

    test('redacts `authorization`', () => {
        expect(redactValue({ authorization: 'Bearer xyz' }).authorization).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    });

    test('redacts `cookie`', () => {
        expect(redactValue({ cookie: 'session=abc' }).cookie).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    });

    test('redacts `jwt` and `bearer`', () => {
        expect(redactValue({ jwt: 'eyJhbGciOi...' }).jwt).toBe(REDACTION_PLACEHOLDERS.TOKEN);
        expect(redactValue({ bearer: 'token-here' }).bearer).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    });

    test('redacts `token`', () => {
        expect(redactValue({ token: 'abcd' }).token).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    });
});

describe('redactValue — MAC address (key OR value)', () => {
    test('redacts MAC value even when key is benign', () => {
        const input = { device: 'aa:bb:cc:dd:ee:ff' };
        expect(redactValue(input).device).toBe(REDACTION_PLACEHOLDERS.MAC);
    });

    test('redacts hyphenated MAC value', () => {
        expect(redactValue({ x: 'AA-BB-CC-DD-EE-FF' }).x).toBe(REDACTION_PLACEHOLDERS.MAC);
    });

    test('redacts when key matches `mac`', () => {
        expect(redactValue({ mac: 'whatever' }).mac).toBe(REDACTION_PLACEHOLDERS.MAC);
    });

    test('redacts when key matches `bssid`', () => {
        expect(redactValue({ bssid: 'aa:bb:cc:dd:ee:ff' }).bssid).toBe(REDACTION_PLACEHOLDERS.MAC);
    });

    test('does not redact a non-MAC string under benign key', () => {
        expect(redactValue({ note: 'aa:bb' }).note).toBe('aa:bb');
    });
});

describe('redactValue — filesystem paths (key OR value)', () => {
    test('redacts unix-style /home/* path value', () => {
        expect(redactValue({ note: '/home/alice/x.bin' }).note).toBe(REDACTION_PLACEHOLDERS.PATH);
    });

    test('redacts /Users/* path value', () => {
        expect(redactValue({ note: '/Users/bob/Downloads/file' }).note).toBe(REDACTION_PLACEHOLDERS.PATH);
    });

    test('redacts Windows-style C:\\Users path value', () => {
        expect(redactValue({ note: 'C:\\Users\\bob\\file.bin' }).note).toBe(REDACTION_PLACEHOLDERS.PATH);
    });

    test('redacts when key is `path`', () => {
        expect(redactValue({ path: '/abc' }).path).toBe(REDACTION_PLACEHOLDERS.PATH);
    });

    test('redacts when key is `filename`', () => {
        expect(redactValue({ filename: 'firmware.bin' }).filename).toBe(REDACTION_PLACEHOLDERS.PATH);
    });
});

describe('redactValue — URL handling', () => {
    test('strips query string for keys that look like URLs', () => {
        const result = redactValue({ source_url: 'https://example.com/x?token=abc&y=1' });
        expect(result.source_url).toBe('https://example.com/x?[REDACTED_QUERY]');
    });

    test('keeps URL pathname when no query string', () => {
        const result = redactValue({ source_url: 'https://example.com/path' });
        expect(result.source_url).toBe('https://example.com/path');
    });

    test('redacts unparseable URL values', () => {
        const result = redactValue({ url: '' });
        expect(result.url).toBe(REDACTION_PLACEHOLDERS.URL);
    });
});

describe('redactValue — recursion and pass-through', () => {
    test('recurses into nested arrays and objects', () => {
        const input = {
            outer: [
                { password: 'a', meta: { token: 'b', label: 'safe' } },
                { description: 'safe' }
            ]
        };
        const result = redactValue(input);
        expect(result.outer[0].password).toBe(REDACTION_PLACEHOLDERS.PASSWORD);
        expect(result.outer[0].meta.token).toBe(REDACTION_PLACEHOLDERS.TOKEN);
        expect(result.outer[0].meta.label).toBe('safe');
        expect(result.outer[1].description).toBe('safe');
    });

    test('passes through primitives that are not sensitive', () => {
        expect(redactValue({ count: 5, name: 'webflash' })).toEqual({ count: 5, name: 'webflash' });
    });

    test('handles null and undefined safely', () => {
        expect(redactValue(null)).toBe(null);
        expect(redactValue(undefined)).toBe(undefined);
    });

    test('signature key is redacted with the default placeholder', () => {
        expect(redactValue({ signature: 'abc' }).signature).toBe(REDACTION_PLACEHOLDERS.DEFAULT);
    });

    test('private key is redacted with secret placeholder', () => {
        expect(redactValue({ private_key: 'abc' }).private_key).toBe(REDACTION_PLACEHOLDERS.SECRET);
    });
});

describe('classifyKey / classifyValue helpers', () => {
    test('classifyKey detects categories', () => {
        expect(__testHooks.categoryForKey('app.password')).toBe('PASSWORD');
        expect(__testHooks.categoryForKey('outer.api_key')).toBe('TOKEN');
        expect(__testHooks.categoryForKey('outer.something_else')).toBe(null);
    });

    test('classifyValue detects MAC and PATH values', () => {
        expect(__testHooks.categoryForValue('aa:bb:cc:dd:ee:ff')).toBe('MAC');
        expect(__testHooks.categoryForValue('/home/x')).toBe('PATH');
        expect(__testHooks.categoryForValue('plain text')).toBe(null);
    });
});
