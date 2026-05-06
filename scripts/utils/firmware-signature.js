/**
 * @fileoverview Real cryptographic verification of Sense360 firmware
 * artifacts.
 *
 * Verifies an Ed25519 (RFC 8032) signature over the firmware binary's
 * bytes against a public key pinned in `firmware-trusted-keys.js`. This is
 * the only check in WebFlash that proves cryptographic *authenticity* — the
 * existing SHA-256 / salted-hash "signature" fields prove integrity against
 * whatever the manifest claims, and a manifest-only attacker can satisfy
 * those by editing both the `.bin` and the manifest entry. An Ed25519
 * signature cannot be produced without the private key, so a successful
 * verify means the bytes were authorised by the holder of one of the
 * trusted keys.
 *
 * --- What gets signed ---
 *
 * The signature is computed over the firmware binary bytes themselves.
 * Ed25519 signs arbitrary-length messages (it hashes internally with
 * SHA-512), so there is no separate manifest canonicalisation step to get
 * wrong. The wizard already downloads the binary to verify SHA-256, so
 * adding signature verification adds one more `crypto.subtle` call against
 * data already in memory.
 *
 * The signing pipeline (`scripts/gen-manifests.py`) writes the base64-encoded
 * 64-byte raw signature to `build.signature_ed25519` and the issuing key id
 * to `build.signature_key_id`. The same fields are mirrored on each
 * `build.parts[]` entry so a single binary download has everything needed
 * to verify locally.
 *
 * --- Public API ---
 *
 *   verifyFirmwareSignature(bytes, signatureB64, options)
 *     Verify a single firmware part. Returns a structured result with a
 *     stable `code` so callers can branch without parsing strings.
 *
 *   extractSignatureFromBuild(build, partIndex)
 *     Pull the (signatureB64, keyId) pair from a manifest entry, falling
 *     back from the per-part fields to the top-level fields.
 *
 *   isWebCryptoEd25519Available()
 *     Async capability probe. Returns true once we have round-tripped a
 *     dummy Ed25519 verify call against `crypto.subtle` (cached). Lets the
 *     UI surface a meaningful "browser does not support firmware
 *     authenticity" message instead of failing every install silently.
 *
 *   SIGNATURE_RESULT_CODES
 *     Frozen enum of result codes. Consumers MUST branch on these instead
 *     of the human-readable `message`, which may be reworded.
 */

import {
    FIRMWARE_SIGNATURE_ALGORITHM,
    findTrustedKey,
    listAcceptableKeys,
    isKeyAcceptable
} from './firmware-trusted-keys.js';

// ---------------------------------------------------------------------------
// Result codes (stable, machine-readable contract)
// ---------------------------------------------------------------------------

export const SIGNATURE_RESULT_CODES = Object.freeze({
    /** Verification passed against an acceptable key. */
    VERIFIED: 'verified',
    /** Manifest carries no signature_ed25519 / no inline part signature. */
    MISSING_SIGNATURE: 'missing_signature',
    /** Signature was malformed (wrong base64, wrong byte length, etc). */
    MALFORMED_SIGNATURE: 'malformed_signature',
    /** Signature mathematically verifies, but the issuing key is not active.
     * Surfaced separately so support can spot rotation gaps. */
    KEY_REVOKED: 'key_revoked',
    /** Signature mathematically verifies, but the issuing key is `test_only`
     * and the wizard is running in production mode. Anyone with read access
     * to the public repo could forge such a signature, so the install gate
     * MUST refuse it. Distinct from SIGNATURE_INVALID so support sees the
     * "wrong key class" reason and can guide users to a real release build. */
    KEY_TEST_ONLY_IN_PRODUCTION: 'key_test_only_in_production',
    /** Signature names a key id we have never trusted. */
    UNKNOWN_KEY: 'unknown_key',
    /** No pinned key produced a verifying signature for these bytes. */
    SIGNATURE_INVALID: 'signature_invalid',
    /** Browser/runtime does not support Ed25519 in WebCrypto. */
    UNSUPPORTED_RUNTIME: 'unsupported_runtime',
    /** Caller-supplied input was missing or the wrong type. */
    INVALID_INPUT: 'invalid_input'
});

const ED25519_SIGNATURE_BYTES = 64;
const ED25519_PUBLIC_KEY_BYTES = 32;

// ---------------------------------------------------------------------------
// Encoding helpers (browser / Node 22 both expose atob/Uint8Array)
// ---------------------------------------------------------------------------

function base64ToBytes(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    // Trim whitespace and tolerate URL-safe base64 since some pipelines
    // generate that variant; we still reject anything else as malformed.
    const normalised = value.trim().replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)) {
        return null;
    }
    try {
        if (typeof atob === 'function') {
            const binary = atob(normalised);
            const out = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                out[i] = binary.charCodeAt(i);
            }
            return out;
        }
        // Node fallback (tests / SSR). globalThis.Buffer is provided by Node.
        if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
            const buf = globalThis.Buffer.from(normalised, 'base64');
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        }
    } catch {
        return null;
    }
    return null;
}

function getSubtle() {
    if (typeof crypto !== 'undefined' && crypto && crypto.subtle) {
        return crypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
        return globalThis.crypto.subtle;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

let webCryptoEd25519Probe = null;

/**
 * Async one-shot probe that confirms `crypto.subtle` actually accepts
 * `'Ed25519'`. Some older Chromium builds expose `subtle` but do not yet
 * implement the curve. Cached after first call.
 */
export async function isWebCryptoEd25519Available() {
    if (webCryptoEd25519Probe !== null) {
        return webCryptoEd25519Probe;
    }
    webCryptoEd25519Probe = (async () => {
        const subtle = getSubtle();
        if (!subtle || typeof subtle.importKey !== 'function' || typeof subtle.verify !== 'function') {
            return false;
        }
        try {
            // Import a fixed dummy public key purely as a feature test. The
            // exact value doesn't matter — we just need importKey to succeed.
            const probeKey = new Uint8Array(ED25519_PUBLIC_KEY_BYTES);
            await subtle.importKey('raw', probeKey, { name: 'Ed25519' }, false, ['verify']);
            return true;
        } catch {
            return false;
        }
    })();
    return webCryptoEd25519Probe;
}

/** Test-only escape hatch to reset the cached probe. */
export function __resetEd25519CapabilityProbeForTests() {
    webCryptoEd25519Probe = null;
}

// ---------------------------------------------------------------------------
// Manifest extraction
// ---------------------------------------------------------------------------

/**
 * Pull the `(signatureB64, keyId)` pair from a manifest build entry. Reads
 * per-part fields first (so multi-part builds can use distinct keys per
 * partition) and falls back to the top-level fields. Returns null when
 * neither is present so callers can surface MISSING_SIGNATURE.
 */
export function extractSignatureFromBuild(build, partIndex = 0) {
    if (!build || typeof build !== 'object') {
        return null;
    }
    const part = Array.isArray(build.parts) ? build.parts[partIndex] : null;
    const signatureB64 = (part && typeof part.signature_ed25519 === 'string' && part.signature_ed25519.trim())
        || (typeof build.signature_ed25519 === 'string' ? build.signature_ed25519.trim() : '');
    const keyId = (part && typeof part.signature_key_id === 'string' && part.signature_key_id.trim())
        || (typeof build.signature_key_id === 'string' ? build.signature_key_id.trim() : '');
    if (!signatureB64) {
        return null;
    }
    return { signatureB64, keyId };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function makeResult(code, message, extras = {}) {
    return {
        ok: code === SIGNATURE_RESULT_CODES.VERIFIED,
        code,
        message,
        ...extras
    };
}

async function importEd25519Key(rawBytes) {
    const subtle = getSubtle();
    if (!subtle) {
        return null;
    }
    try {
        return await subtle.importKey(
            'raw',
            rawBytes,
            { name: 'Ed25519' },
            false,
            ['verify']
        );
    } catch {
        return null;
    }
}

async function tryVerifyAgainstKey({ subtle, entry, signatureBytes, messageBytes }) {
    const pubBytes = base64ToBytes(entry.public_key_b64);
    if (!pubBytes || pubBytes.length !== ED25519_PUBLIC_KEY_BYTES) {
        return false;
    }
    const cryptoKey = await importEd25519Key(pubBytes);
    if (!cryptoKey) {
        return false;
    }
    try {
        return await subtle.verify({ name: 'Ed25519' }, cryptoKey, signatureBytes, messageBytes);
    } catch {
        return false;
    }
}

/**
 * Verify a single firmware part. The bytes are signed directly under
 * Ed25519; `signatureB64` is the base64 of the raw 64-byte signature.
 *
 * @param {ArrayBuffer|Uint8Array} firmwareBytes Bytes whose authenticity is being checked.
 * @param {string} signatureB64 Base64-encoded raw 64-byte Ed25519 signature.
 * @param {object} [options]
 * @param {string} [options.keyId] Optional key id from the manifest. When
 *     present, verification is restricted to that key — a stricter and more
 *     diagnostic-friendly mode than "any pinned key".
 * @param {boolean} [options.allowSuperseded] When true, also accept keys
 *     in `status: 'superseded'`. Used by diagnostics, NEVER at install
 *     time. Defaults to false.
 * @param {'production'|'development'|'test'} [options.mode] Trust mode.
 *     The default is 'production', which only accepts keys with
 *     `status: 'active'`. Tests and local development can pass
 *     'development' or 'test' to also accept `status: 'test_only'` keys
 *     (whose private halves are intentionally exposed in the public repo
 *     for fixture signing). The deployed wizard MUST always run in
 *     'production' mode for the install path; 'test_only' keys would
 *     otherwise let any reader of the repo forge installable firmware.
 * @returns {Promise<{ok:boolean, code:string, message:string,
 *     keyId?:string, keyStatus?:string}>}
 */
export async function verifyFirmwareSignature(firmwareBytes, signatureB64, options = {}) {
    // Duck-type the input. `instanceof` is realm-specific, so cross-realm
    // typed arrays (Node Uint8Array consumed under jsdom in tests, or
    // anything generated by a worker) would fail an
    // `instanceof Uint8Array` check despite being correctly-shaped byte
    // buffers. We accept anything that looks like an ArrayBuffer or an
    // ArrayBufferView and reject the rest.
    const tag = firmwareBytes && typeof firmwareBytes === 'object'
        ? Object.prototype.toString.call(firmwareBytes)
        : '';
    const looksLikeArrayBuffer = tag === '[object ArrayBuffer]'
        || tag === '[object SharedArrayBuffer]';
    const looksLikeTypedArray = firmwareBytes
        && typeof firmwareBytes === 'object'
        && typeof firmwareBytes.byteLength === 'number'
        && typeof firmwareBytes.byteOffset === 'number'
        && firmwareBytes.buffer
        && typeof firmwareBytes.buffer === 'object';
    if (!looksLikeArrayBuffer && !looksLikeTypedArray) {
        return makeResult(
            SIGNATURE_RESULT_CODES.INVALID_INPUT,
            'Firmware bytes were not provided as an ArrayBuffer or Uint8Array.'
        );
    }
    if (typeof signatureB64 !== 'string' || !signatureB64.trim()) {
        return makeResult(
            SIGNATURE_RESULT_CODES.MISSING_SIGNATURE,
            'No Ed25519 signature is available for this firmware build.'
        );
    }

    const subtle = getSubtle();
    if (!subtle) {
        return makeResult(
            SIGNATURE_RESULT_CODES.UNSUPPORTED_RUNTIME,
            'Web Crypto API is not available; cannot verify firmware authenticity.'
        );
    }
    const ed25519Available = await isWebCryptoEd25519Available();
    if (!ed25519Available) {
        return makeResult(
            SIGNATURE_RESULT_CODES.UNSUPPORTED_RUNTIME,
            'This browser does not implement Ed25519 in Web Crypto; cannot verify firmware authenticity.'
        );
    }

    const signatureBytes = base64ToBytes(signatureB64.trim());
    if (!signatureBytes || signatureBytes.length !== ED25519_SIGNATURE_BYTES) {
        return makeResult(
            SIGNATURE_RESULT_CODES.MALFORMED_SIGNATURE,
            `Signature is not a valid base64-encoded ${ED25519_SIGNATURE_BYTES}-byte Ed25519 value.`
        );
    }

    let messageBytes;
    if (looksLikeTypedArray) {
        // Re-wrap to a Uint8Array under the current realm so subtle.verify
        // accepts the buffer reference. ArrayBuffer-backed typed arrays
        // share the same underlying memory — no copy.
        messageBytes = new Uint8Array(
            firmwareBytes.buffer,
            firmwareBytes.byteOffset,
            firmwareBytes.byteLength
        );
    } else {
        messageBytes = new Uint8Array(firmwareBytes);
    }

    const requestedKeyId = typeof options.keyId === 'string' ? options.keyId.trim() : '';
    const allowSuperseded = options.allowSuperseded === true;
    const mode = options.mode || 'production';
    const modeOpts = { allowSuperseded, mode };

    if (requestedKeyId) {
        const entry = findTrustedKey(requestedKeyId);
        if (!entry) {
            // We still try verification against acceptable keys — it's
            // possible someone signed under a key we trust but mislabelled
            // the kid. But surface UNKNOWN_KEY when no fallback verifies
            // either, so operators see it.
            for (const candidate of listAcceptableKeys(modeOpts)) {
                if (await tryVerifyAgainstKey({ subtle, entry: candidate, signatureBytes, messageBytes })) {
                    return makeResult(
                        SIGNATURE_RESULT_CODES.VERIFIED,
                        `Signature verified against trusted key ${candidate.kid}.`,
                        { keyId: candidate.kid, keyStatus: candidate.status }
                    );
                }
            }
            return makeResult(
                SIGNATURE_RESULT_CODES.UNKNOWN_KEY,
                `Signature claims key id '${requestedKeyId}', which is not on the trust list.`,
                { keyId: requestedKeyId }
            );
        }
        if (!isKeyAcceptable(entry, modeOpts)) {
            // Verify against the named key purely so we can return a
            // specific reason code (KEY_REVOKED / KEY_TEST_ONLY_IN_PRODUCTION
            // vs the generic SIGNATURE_INVALID) when the math actually
            // checks out — that distinction matters for support and
            // rotation diagnostics.
            const matches = await tryVerifyAgainstKey({ subtle, entry, signatureBytes, messageBytes });
            if (matches) {
                if (entry.status === 'test_only') {
                    // Production-mode refusal of a fixture/CI key. Anyone
                    // with read access to the repo can sign these, so the
                    // install gate must hard-fail.
                    return makeResult(
                        SIGNATURE_RESULT_CODES.KEY_TEST_ONLY_IN_PRODUCTION,
                        `Signature verifies against key '${entry.kid}', but that key is marked 'test_only' and cannot authorise installs in production mode (its private half is exposed for fixture signing).`,
                        { keyId: entry.kid, keyStatus: entry.status }
                    );
                }
                return makeResult(
                    SIGNATURE_RESULT_CODES.KEY_REVOKED,
                    `Signature verifies against key '${entry.kid}', but that key is marked '${entry.status}' and cannot authorise an install.`,
                    { keyId: entry.kid, keyStatus: entry.status }
                );
            }
            return makeResult(
                SIGNATURE_RESULT_CODES.SIGNATURE_INVALID,
                `Signature did not verify against key '${entry.kid}' (status: ${entry.status}).`,
                { keyId: entry.kid, keyStatus: entry.status }
            );
        }
        const matches = await tryVerifyAgainstKey({ subtle, entry, signatureBytes, messageBytes });
        if (matches) {
            return makeResult(
                SIGNATURE_RESULT_CODES.VERIFIED,
                `Signature verified against trusted key ${entry.kid}.`,
                { keyId: entry.kid, keyStatus: entry.status }
            );
        }
        return makeResult(
            SIGNATURE_RESULT_CODES.SIGNATURE_INVALID,
            `Signature did not verify against the named key '${entry.kid}'.`,
            { keyId: entry.kid, keyStatus: entry.status }
        );
    }

    // No key id supplied — try every acceptable key in order.
    const candidates = listAcceptableKeys(modeOpts);
    if (candidates.length === 0) {
        return makeResult(
            SIGNATURE_RESULT_CODES.UNKNOWN_KEY,
            mode === 'production'
                ? 'No active production firmware signing keys are pinned in the trust list.'
                : 'No acceptable firmware signing keys for the current trust mode.'
        );
    }
    for (const candidate of candidates) {
        if (await tryVerifyAgainstKey({ subtle, entry: candidate, signatureBytes, messageBytes })) {
            return makeResult(
                SIGNATURE_RESULT_CODES.VERIFIED,
                `Signature verified against trusted key ${candidate.kid}.`,
                { keyId: candidate.kid, keyStatus: candidate.status }
            );
        }
    }
    return makeResult(
        SIGNATURE_RESULT_CODES.SIGNATURE_INVALID,
        'Signature did not verify against any trusted firmware signing key.'
    );
}

/**
 * Convenience: returns the human-readable status that should be shown in
 * the provenance UI for a result code, tiered into the three trust levels
 * the UI surfaces (metadata / integrity / authenticity).
 */
export function authenticityTierForCode(code) {
    if (code === SIGNATURE_RESULT_CODES.VERIFIED) {
        return 'verified';
    }
    if (code === SIGNATURE_RESULT_CODES.UNSUPPORTED_RUNTIME) {
        return 'unavailable';
    }
    if (code === SIGNATURE_RESULT_CODES.MISSING_SIGNATURE) {
        return 'missing';
    }
    return 'failed';
}

export const FIRMWARE_SIGNATURE_INTERNALS = Object.freeze({
    base64ToBytes,
    ED25519_SIGNATURE_BYTES,
    ED25519_PUBLIC_KEY_BYTES,
    FIRMWARE_SIGNATURE_ALGORITHM
});
