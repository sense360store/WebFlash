/**
 * @fileoverview Tests for the Ed25519 firmware authenticity verifier.
 *
 * The wizard runs in a Chromium browser; tests run under jsdom + Node 22.
 * Node 22's `crypto.webcrypto.subtle` implements the same Web Crypto
 * Ed25519 surface the wizard uses, so we can exercise the real verifier
 * by patching `globalThis.crypto` to point at it.
 */

import { describe, expect, test, beforeAll, beforeEach } from '@jest/globals';
import { webcrypto, generateKeyPairSync, sign as nodeSign, createPrivateKey } from 'node:crypto';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

// jsdom does not always expose TextEncoder on the global scope; back it
// with Node's TextEncoder so the synthetic test payloads work.
if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = NodeTextEncoder;
}

// Patch the global Web Crypto reference BEFORE importing the verifier so
// the cached capability probe sees a working `subtle`.
beforeAll(() => {
    // jsdom's default `crypto` does not implement Ed25519. Replace with
    // Node's webcrypto, which does.
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        configurable: true,
        writable: true
    });
});

const {
    verifyFirmwareSignature,
    extractSignatureFromBuild,
    SIGNATURE_RESULT_CODES,
    isWebCryptoEd25519Available,
    authenticityTierForCode,
    __resetEd25519CapabilityProbeForTests,
    FIRMWARE_SIGNATURE_INTERNALS
} = await import('../scripts/utils/firmware-signature.js');

const {
    FIRMWARE_TRUSTED_KEYS,
    FIRMWARE_SIGNATURE_ALGORITHM,
    FIRMWARE_SIGNATURE_CONTEXT_LABEL,
    findTrustedKey,
    listAcceptableKeys,
    isKeyAcceptable
} = await import('../scripts/utils/firmware-trusted-keys.js');

// Helper: convert a base64 string to bytes (matches the verifier's helper).
function b64ToBytes(b64) {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// Build a Node KeyObject for the dev key (raw 32-byte private seed) so we
// can sign synthetic test fixtures with the real production-trusted key.
function loadDevPrivateKey() {
    const repoRoot = process.cwd();
    const raw = fs.readFileSync(path.join(repoRoot, 'firmware-signing/keys/dev-2026-01-private.raw.b64'), 'utf8').trim();
    const seed = Buffer.from(raw, 'base64');
    expect(seed.length).toBe(32);
    // Ed25519 PKCS#8 wrapper for a raw 32-byte private key seed:
    //   0x30 0x2e 0x02 0x01 0x00 0x30 0x05 0x06 0x03 0x2b 0x65 0x70 0x04 0x22 0x04 0x20 + seed
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8 = Buffer.concat([pkcs8Prefix, seed]);
    return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
}

function signWithDevKey(messageBytes) {
    const nodeKey = loadDevPrivateKey();
    const sig = nodeSign(null, Buffer.from(messageBytes), nodeKey);
    return sig.toString('base64');
}

describe('firmware-trusted-keys — pinned trust list shape', () => {
    test('list is non-empty and frozen', () => {
        expect(FIRMWARE_TRUSTED_KEYS.length).toBeGreaterThan(0);
        expect(Object.isFrozen(FIRMWARE_TRUSTED_KEYS)).toBe(true);
    });

    test('every entry has a stable shape and a 32-byte raw Ed25519 public key', () => {
        for (const entry of FIRMWARE_TRUSTED_KEYS) {
            expect(typeof entry.kid).toBe('string');
            expect(entry.kid.length).toBeGreaterThan(0);
            expect(entry.algo).toBe(FIRMWARE_SIGNATURE_ALGORITHM);
            expect(['active', 'superseded', 'revoked', 'placeholder', 'test_only']).toContain(entry.status);
            expect(typeof entry.public_key_b64).toBe('string');
            const pub = b64ToBytes(entry.public_key_b64);
            expect(pub.length).toBe(FIRMWARE_SIGNATURE_INTERNALS.ED25519_PUBLIC_KEY_BYTES);
        }
    });

    test('CRITICAL: no committed test_only key has status active in the trust list', () => {
        // Backstop check: the dev/CI key under firmware-signing/keys/ has its
        // PRIVATE half committed to the public repo. Promoting any such key
        // to status='active' would let any reader of the repo sign forged
        // firmware that the wizard would happily install. The trust list
        // MUST mark these keys as 'test_only' so production-mode
        // verification refuses them.
        const fixturePublicB64 = fs.readFileSync(
            path.join(process.cwd(), 'firmware-signing/keys/dev-2026-01-public.raw.b64'),
            'utf8'
        ).trim();
        const matched = FIRMWARE_TRUSTED_KEYS.find(e => e.public_key_b64 === fixturePublicB64);
        expect(matched).not.toBeUndefined();
        expect(matched.status).toBe('test_only');
    });

    test('JSON mirror at firmware-signing/trusted-keys.json matches the JS source of truth', () => {
        // The Python publishing pipeline reads the JSON copy; the wizard
        // reads the JS copy. They MUST stay aligned, otherwise the
        // pipeline could sign with a key the wizard refuses to verify
        // (or vice versa).
        const jsonText = fs.readFileSync(
            path.join(process.cwd(), 'firmware-signing/trusted-keys.json'), 'utf8'
        );
        const data = JSON.parse(jsonText);
        expect(data.algorithm).toBe(FIRMWARE_SIGNATURE_ALGORITHM);
        expect(data.context_label).toBe(FIRMWARE_SIGNATURE_CONTEXT_LABEL);
        expect(Array.isArray(data.keys)).toBe(true);
        expect(data.keys.length).toBe(FIRMWARE_TRUSTED_KEYS.length);
        for (let i = 0; i < data.keys.length; i += 1) {
            const json = data.keys[i];
            const js = FIRMWARE_TRUSTED_KEYS[i];
            expect(json.kid).toBe(js.kid);
            expect(json.algo).toBe(js.algo);
            expect(json.status).toBe(js.status);
            expect(json.public_key_b64).toBe(js.public_key_b64);
        }
    });

    test('findTrustedKey returns the matching entry by kid', () => {
        const entry = findTrustedKey('dev-2026-01');
        expect(entry).not.toBeNull();
        expect(entry.kid).toBe('dev-2026-01');
    });

    test('findTrustedKey returns null for unknown kids', () => {
        expect(findTrustedKey('not-a-real-key')).toBeNull();
        expect(findTrustedKey('')).toBeNull();
        expect(findTrustedKey(null)).toBeNull();
    });

    test('listAcceptableKeys in production mode returns ONLY active entries', () => {
        const list = listAcceptableKeys();
        for (const entry of list) {
            // The repo currently only ships a 'test_only' key, so the
            // production list may be empty. What it MUST NOT do is
            // include test_only keys.
            expect(entry.status).toBe('active');
        }
        const productionList = listAcceptableKeys({ mode: 'production' });
        for (const entry of productionList) {
            expect(entry.status).toBe('active');
        }
    });

    test('listAcceptableKeys in test mode also returns test_only entries', () => {
        const list = listAcceptableKeys({ mode: 'test' });
        const statuses = new Set(list.map(e => e.status));
        // Repo currently ships exactly one test_only fixture key.
        expect(list.length).toBeGreaterThan(0);
        expect(statuses.has('test_only')).toBe(true);
    });

    test('isKeyAcceptable rejects revoked keys even when allowSuperseded is true', () => {
        const revoked = { kid: 'fake-revoked', algo: 'ed25519', status: 'revoked' };
        expect(isKeyAcceptable(revoked, { allowSuperseded: true })).toBe(false);
    });

    test('isKeyAcceptable rejects placeholders unconditionally', () => {
        const placeholder = { kid: 'fake-placeholder', algo: 'ed25519', status: 'placeholder' };
        expect(isKeyAcceptable(placeholder)).toBe(false);
        expect(isKeyAcceptable(placeholder, { allowSuperseded: true })).toBe(false);
    });

    test('isKeyAcceptable rejects test_only keys in production mode', () => {
        const fixture = { kid: 'fake-fixture', algo: 'ed25519', status: 'test_only' };
        expect(isKeyAcceptable(fixture)).toBe(false);
        expect(isKeyAcceptable(fixture, { mode: 'production' })).toBe(false);
        // Even allowSuperseded does NOT relax the production-mode test_only
        // refusal — superseded ≠ test_only and they have different threats.
        expect(isKeyAcceptable(fixture, { mode: 'production', allowSuperseded: true })).toBe(false);
    });

    test('isKeyAcceptable accepts test_only keys in test/development modes', () => {
        const fixture = { kid: 'fake-fixture', algo: 'ed25519', status: 'test_only' };
        expect(isKeyAcceptable(fixture, { mode: 'test' })).toBe(true);
        expect(isKeyAcceptable(fixture, { mode: 'development' })).toBe(true);
    });
});

describe('verifyFirmwareSignature — capability probe', () => {
    beforeEach(() => {
        __resetEd25519CapabilityProbeForTests();
    });

    test('returns true when crypto.subtle implements Ed25519', async () => {
        await expect(isWebCryptoEd25519Available()).resolves.toBe(true);
    });
});

describe('verifyFirmwareSignature — happy path', () => {
    // The committed dev-2026-01 key is marked 'test_only' in the trust list
    // because its private half is in the public repo. To exercise the
    // happy path we must opt into 'test' mode — the same path tests and
    // local development use. The deployed wizard NEVER passes mode='test'.
    const TEST_MODE = { mode: 'test' };

    test('valid signature against a pinned test_only key verifies in test mode', async () => {
        const message = new TextEncoder().encode('test fixture firmware payload');
        const sigB64 = signWithDevKey(message);
        const result = await verifyFirmwareSignature(message, sigB64, TEST_MODE);
        expect(result.ok).toBe(true);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.VERIFIED);
        expect(result.keyId).toBe('dev-2026-01');
        expect(result.message).toMatch(/dev-2026-01/);
    });

    test('verification works when an explicit key id is supplied', async () => {
        const message = new TextEncoder().encode('explicit key id');
        const sigB64 = signWithDevKey(message);
        const result = await verifyFirmwareSignature(message, sigB64, { keyId: 'dev-2026-01', ...TEST_MODE });
        expect(result.ok).toBe(true);
        expect(result.keyId).toBe('dev-2026-01');
    });

    test('verification works for ArrayBuffer input as well as Uint8Array', async () => {
        const message = new TextEncoder().encode('array buffer payload');
        const sigB64 = signWithDevKey(message);
        const arrayBuffer = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength);
        const result = await verifyFirmwareSignature(arrayBuffer, sigB64, TEST_MODE);
        expect(result.ok).toBe(true);
    });

    test('verifies the actual binary fixtures shipped in the manifest (test mode)', async () => {
        // Round-trip the development manifest: every signed binary in the
        // committed `manifest.json` must verify against the pinned dev
        // key under TEST mode. The deployed wizard runs in production
        // mode and would refuse these — that stricter behaviour is
        // covered by the dedicated production-refusal tests below.
        const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8'));
        const signed = manifest.builds.filter(b => b.signature_ed25519);
        expect(signed.length).toBeGreaterThan(0);
        for (const build of signed) {
            const binPath = build.parts[0].path;
            const bytes = fs.readFileSync(path.join(process.cwd(), binPath));
            const result = await verifyFirmwareSignature(
                new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
                build.signature_ed25519,
                { keyId: build.signature_key_id, ...TEST_MODE }
            );
            if (!result.ok) {
                throw new Error(
                    `Manifest build ${binPath} (key=${build.signature_key_id}) failed verification: ${result.code} — ${result.message}`
                );
            }
            expect(result.ok).toBe(true);
            expect(result.keyId).toBe(build.signature_key_id);
        }
    });
});

describe('verifyFirmwareSignature — production-mode refusal of test_only keys', () => {
    test('signature from test_only key is REFUSED with KEY_TEST_ONLY_IN_PRODUCTION in production mode', async () => {
        const message = new TextEncoder().encode('production install attempt');
        const sigB64 = signWithDevKey(message);
        // mode defaults to 'production' — the same default the deployed
        // wizard uses. The signature is mathematically valid AND the
        // named key is on the trust list, but its status is 'test_only'
        // so the install gate must refuse.
        const result = await verifyFirmwareSignature(message, sigB64, { keyId: 'dev-2026-01' });
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.KEY_TEST_ONLY_IN_PRODUCTION);
        expect(result.keyId).toBe('dev-2026-01');
        expect(result.keyStatus).toBe('test_only');
        expect(result.message).toMatch(/test_only/i);
    });

    test('signature from test_only key without explicit keyId is also refused', async () => {
        // No keyId supplied — verifier walks the acceptable-keys list.
        // In production mode, that list excludes test_only entries, so
        // verification falls through to SIGNATURE_INVALID rather than
        // happily verifying against the dev key.
        const message = new TextEncoder().encode('production install attempt');
        const sigB64 = signWithDevKey(message);
        const result = await verifyFirmwareSignature(message, sigB64);
        expect(result.ok).toBe(false);
        expect([
            SIGNATURE_RESULT_CODES.SIGNATURE_INVALID,
            SIGNATURE_RESULT_CODES.UNKNOWN_KEY
        ]).toContain(result.code);
    });

    test('every fixture binary in manifest.json is REFUSED in production mode', async () => {
        // The single most important regression test: the committed
        // manifest, signed by the test_only key, must NOT install via
        // the wizard's production-mode install gate.
        const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8'));
        const signed = manifest.builds.filter(b => b.signature_ed25519);
        expect(signed.length).toBeGreaterThan(0);
        for (const build of signed) {
            const binPath = build.parts[0].path;
            const bytes = fs.readFileSync(path.join(process.cwd(), binPath));
            const result = await verifyFirmwareSignature(
                new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
                build.signature_ed25519,
                { keyId: build.signature_key_id }
                // Note: no `mode` option ⇒ production default
            );
            expect(result.ok).toBe(false);
            expect(result.code).toBe(SIGNATURE_RESULT_CODES.KEY_TEST_ONLY_IN_PRODUCTION);
        }
    });

    test('production mode refusal is by-design: all current signed fixtures fail', async () => {
        // Asserts the explicit policy contract: in production mode, NO
        // currently-shipped fixture verifies, because all of them are
        // signed by test_only keys. If this test starts passing, it
        // means a real production key has been added — at which point
        // the trust-list test_only marker on dev-2026-01 may need to be
        // re-checked too.
        const message = new TextEncoder().encode('outsider firmware');
        const sigB64 = signWithDevKey(message);
        const result = await verifyFirmwareSignature(message, sigB64, { keyId: 'dev-2026-01', mode: 'production' });
        expect(result.ok).toBe(false);
    });
});

describe('verifyFirmwareSignature — failure modes', () => {
    // Most failure-mode assertions verify the SHAPE of a verification
    // failure (wrong code, wrong key, malformed signature). To exercise
    // those code paths we need at least one acceptable key — the test
    // mode lets the test_only dev key count, since the trust list does
    // not currently ship an active production key.
    const TEST_MODE = { mode: 'test' };

    test('signature over different bytes is rejected', async () => {
        const message = new TextEncoder().encode('payload A');
        const tampered = new TextEncoder().encode('payload B');
        const sigB64 = signWithDevKey(message);
        const result = await verifyFirmwareSignature(tampered, sigB64, TEST_MODE);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.SIGNATURE_INVALID);
    });

    test('missing signature returns MISSING_SIGNATURE', async () => {
        const message = new TextEncoder().encode('whatever');
        const result = await verifyFirmwareSignature(message, '', TEST_MODE);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.MISSING_SIGNATURE);
    });

    test('null signature returns MISSING_SIGNATURE', async () => {
        const message = new TextEncoder().encode('whatever');
        const result = await verifyFirmwareSignature(message, null, TEST_MODE);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.MISSING_SIGNATURE);
    });

    test('malformed base64 signature returns MALFORMED_SIGNATURE', async () => {
        const message = new TextEncoder().encode('whatever');
        const result = await verifyFirmwareSignature(message, 'not really base64!!!', TEST_MODE);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.MALFORMED_SIGNATURE);
    });

    test('signature with wrong byte length returns MALFORMED_SIGNATURE', async () => {
        const message = new TextEncoder().encode('whatever');
        // Valid base64 but only 8 bytes.
        const result = await verifyFirmwareSignature(
            message,
            Buffer.from(new Uint8Array(8)).toString('base64'),
            TEST_MODE
        );
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.MALFORMED_SIGNATURE);
    });

    test('non-ArrayBuffer/Uint8Array input returns INVALID_INPUT', async () => {
        const result = await verifyFirmwareSignature('a string is not bytes', 'AAAA', TEST_MODE);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.INVALID_INPUT);
    });

    test('unknown key id with non-verifying signature returns UNKNOWN_KEY', async () => {
        // Sign with a brand-new untrusted key, supply a key id we have
        // never heard of. The verifier still tries every acceptable key
        // as a fallback (under TEST mode that includes the dev key),
        // fails to verify, and surfaces UNKNOWN_KEY so support sees the
        // kid mismatch.
        const { privateKey } = generateKeyPairSync('ed25519');
        const message = new TextEncoder().encode('outsider payload');
        const sigB64 = nodeSign(null, Buffer.from(message), privateKey).toString('base64');
        const result = await verifyFirmwareSignature(message, sigB64, { keyId: 'never-heard-of-this-key', ...TEST_MODE });
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.UNKNOWN_KEY);
        expect(result.keyId).toBe('never-heard-of-this-key');
    });

    test('signature from outsider key with no key id returns SIGNATURE_INVALID', async () => {
        // Signature is mathematically valid but was produced under a key
        // not on the trust list, with no key id supplied — every pinned
        // key fails to verify, so we get SIGNATURE_INVALID rather than
        // UNKNOWN_KEY.
        const { privateKey } = generateKeyPairSync('ed25519');
        const message = new TextEncoder().encode('outsider payload');
        const sigB64 = nodeSign(null, Buffer.from(message), privateKey).toString('base64');
        const result = await verifyFirmwareSignature(message, sigB64, TEST_MODE);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.SIGNATURE_INVALID);
    });

    test('production-mode call against an outsider key returns SIGNATURE_INVALID', async () => {
        // Now that an `active` production key is pinned in the trust list
        // (sense360-prod-2026-02), production-mode verification of an
        // outsider signature exercises the "verify against every
        // acceptable key, none match" branch and returns
        // SIGNATURE_INVALID — distinct from the UNKNOWN_KEY signal that
        // only fires when zero acceptable keys are pinned at all (a
        // configuration error). Keeping a separate production-mode case
        // here so a regression in the trust list (e.g. accidental
        // removal of all active keys) would resurface as a different
        // result code than the test-mode counterpart above.
        const { privateKey } = generateKeyPairSync('ed25519');
        const message = new TextEncoder().encode('production attempt');
        const sigB64 = nodeSign(null, Buffer.from(message), privateKey).toString('base64');
        const result = await verifyFirmwareSignature(message, sigB64);
        expect(result.ok).toBe(false);
        expect(result.code).toBe(SIGNATURE_RESULT_CODES.SIGNATURE_INVALID);
    });
});

describe('extractSignatureFromBuild', () => {
    test('reads top-level signature_ed25519 + signature_key_id', () => {
        const build = {
            signature_ed25519: 'AAAA',
            signature_key_id: 'dev-2026-01'
        };
        const extracted = extractSignatureFromBuild(build);
        expect(extracted).toEqual({ signatureB64: 'AAAA', keyId: 'dev-2026-01' });
    });

    test('prefers per-part fields when present', () => {
        const build = {
            signature_ed25519: 'top-level',
            signature_key_id: 'top-key',
            parts: [{ signature_ed25519: 'per-part', signature_key_id: 'per-part-key' }]
        };
        const extracted = extractSignatureFromBuild(build);
        expect(extracted.signatureB64).toBe('per-part');
        expect(extracted.keyId).toBe('per-part-key');
    });

    test('returns null when no signature_ed25519 field is present anywhere', () => {
        expect(extractSignatureFromBuild({ parts: [{}] })).toBeNull();
        expect(extractSignatureFromBuild({})).toBeNull();
        expect(extractSignatureFromBuild(null)).toBeNull();
    });
});

describe('verifyFirmwareSignature — applySignatureVerificationResult integration', () => {
    test('runtime verification result merges into the static provenance report (test mode)', async () => {
        // End-to-end shape check under test mode: take a static
        // provenance report whose signature_verified entry is 'pending',
        // run a real verification with the test_only dev key, and merge
        // — the report should flip to 'pass' and the authenticity tier
        // should report 'pass'. This proves the merge mechanics work
        // even with the test key. The production-mode refusal is
        // covered by separate tests.
        const { validateFirmwareProvenance, applySignatureVerificationResult, TRUST_TIERS } =
            await import('../scripts/utils/firmware-provenance.js');
        const message = new TextEncoder().encode('integration payload');
        const sigB64 = signWithDevKey(message);
        const sigResult = await verifyFirmwareSignature(message, sigB64, { mode: 'test' });
        expect(sigResult.ok).toBe(true);

        const build = {
            channel: 'stable',
            sha256: 'a'.repeat(64),
            signature: 'AAAA',
            signature_ed25519: sigB64,
            signature_key_id: 'dev-2026-01',
            source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            file_size: 524288,
            changelog: ['Hand-authored release notes for stable v1.0.0.'],
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v1.0.0-stable.bin', offset: 0 }],
            config_string: 'Ceiling-USB',
            artifact_type: 'application',
            deprecated: false
        };
        const staticReport = validateFirmwareProvenance(build, { mode: 'test' });
        expect(staticReport.tiers[TRUST_TIERS.AUTHENTICITY]).toBe('pending');

        const merged = applySignatureVerificationResult(staticReport, sigResult);
        expect(merged.tiers[TRUST_TIERS.AUTHENTICITY]).toBe('pass');
        expect(merged.summary).toMatch(/Ed25519 signature authenticated/i);
    });

    test('production mode static gate REFUSES test_only-signed stable build before runtime check', async () => {
        const { validateFirmwareProvenance, TRUST_TIERS } =
            await import('../scripts/utils/firmware-provenance.js');
        const build = {
            channel: 'stable',
            sha256: 'a'.repeat(64),
            signature: 'AAAA',
            signature_ed25519: 'kgpXnONkJ8YZhazkL4U8NlOiFW1Xwbri37UI6jEOwfAOHzvR/YCxZ4m6NKJypOdvya8khHFjrw6rHSMaSu//Aw==',
            signature_key_id: 'dev-2026-01',
            source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            file_size: 524288,
            changelog: ['Hand-authored release notes for stable v1.0.0.'],
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v1.0.0-stable.bin', offset: 0 }],
            config_string: 'Ceiling-USB',
            artifact_type: 'application',
            deprecated: false
        };
        const report = validateFirmwareProvenance(build);  // mode defaults to 'production'
        expect(report.ok).toBe(false);
        expect(report.tiers[TRUST_TIERS.METADATA]).toBe('fail');
        expect(report.blockingReasons.join(' ')).toMatch(/test_only/);
    });

    test('runtime verification failure flips authenticity tier to fail', async () => {
        const { validateFirmwareProvenance, applySignatureVerificationResult, TRUST_TIERS } =
            await import('../scripts/utils/firmware-provenance.js');
        const build = {
            channel: 'stable',
            sha256: 'a'.repeat(64),
            signature: 'AAAA',
            signature_ed25519: 'kgpXnONkJ8YZhazkL4U8NlOiFW1Xwbri37UI6jEOwfAOHzvR/YCxZ4m6NKJypOdvya8khHFjrw6rHSMaSu//Aw==',
            signature_key_id: 'dev-2026-01',
            source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            file_size: 524288,
            changelog: ['Hand-authored release notes for stable v1.0.0.'],
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v1.0.0-stable.bin', offset: 0 }],
            config_string: 'Ceiling-USB',
            artifact_type: 'application',
            deprecated: false
        };
        const staticReport = validateFirmwareProvenance(build);
        const failedSig = {
            ok: false,
            code: SIGNATURE_RESULT_CODES.SIGNATURE_INVALID,
            message: 'Signature did not verify against any trusted firmware signing key.'
        };
        const merged = applySignatureVerificationResult(staticReport, failedSig);
        expect(merged.ok).toBe(false);
        expect(merged.tiers[TRUST_TIERS.AUTHENTICITY]).toBe('fail');
        expect(merged.blockingReasons.join(' ')).toMatch(/did not verify/i);
    });

    test('UNSUPPORTED_RUNTIME flips authenticity tier to unavailable for stable builds', async () => {
        const { validateFirmwareProvenance, applySignatureVerificationResult, TRUST_TIERS } =
            await import('../scripts/utils/firmware-provenance.js');
        const build = {
            channel: 'stable',
            sha256: 'a'.repeat(64),
            signature: 'AAAA',
            signature_ed25519: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            signature_key_id: 'dev-2026-01',
            source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
            file_size: 524288,
            changelog: ['Hand-authored release notes for stable v1.0.0.'],
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v1.0.0-stable.bin', offset: 0 }],
            config_string: 'Ceiling-USB',
            artifact_type: 'application',
            deprecated: false
        };
        const staticReport = validateFirmwareProvenance(build);
        const merged = applySignatureVerificationResult(staticReport, {
            ok: false,
            code: SIGNATURE_RESULT_CODES.UNSUPPORTED_RUNTIME,
            message: 'Browser does not support Ed25519.'
        });
        // The signature_verified check is now 'fail' + 'block' for stable
        // builds, so the install gate (which keys off `report.ok`) refuses.
        expect(merged.ok).toBe(false);
        expect(merged.tiers[TRUST_TIERS.AUTHENTICITY]).toBe('fail');
    });
});

describe('authenticityTierForCode', () => {
    test('verified maps to verified tier', () => {
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.VERIFIED)).toBe('verified');
    });

    test('unsupported_runtime maps to unavailable tier', () => {
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.UNSUPPORTED_RUNTIME)).toBe('unavailable');
    });

    test('missing_signature maps to missing tier', () => {
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.MISSING_SIGNATURE)).toBe('missing');
    });

    test('every other failure maps to failed tier', () => {
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.SIGNATURE_INVALID)).toBe('failed');
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.MALFORMED_SIGNATURE)).toBe('failed');
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.KEY_REVOKED)).toBe('failed');
        expect(authenticityTierForCode(SIGNATURE_RESULT_CODES.UNKNOWN_KEY)).toBe('failed');
    });
});
