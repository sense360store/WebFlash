/**
 * @fileoverview Pinned Ed25519 public keys that authenticate Sense360
 * firmware artifacts. The wizard refuses to flash any production
 * (`stable`-channel) build whose `signature_ed25519` does not verify
 * against an `active` key in this list.
 *
 * --- Source-of-truth contract ---
 *
 * This file IS the single source of truth at runtime — the wizard reads
 * it directly. A parallel JSON copy lives at
 * `firmware-signing/trusted-keys.json` so the Python publishing pipeline
 * (`scripts/gen-manifests.py`) and any future tooling can consume the
 * same trust anchors without parsing JS. The two files MUST stay aligned;
 * `__tests__/firmware-trusted-keys.test.js` enforces this.
 *
 * --- Key shape ---
 *
 *   kid             Stable opaque identifier referenced from the manifest's
 *                   `signature_key_id` field. Used to surface meaningful
 *                   errors ("signed by revoked key dev-2026-01") rather than
 *                   "signature did not verify".
 *   algo            Always `'ed25519'` for now. Reserved so a future
 *                   migration can introduce a second curve in lockstep.
 *   public_key_b64  Base64 of the raw 32-byte Ed25519 public key (RFC 8032,
 *                   §5.1.5). NOT a SubjectPublicKeyInfo blob — keeping the
 *                   raw form here matches what `crypto.subtle.importKey('raw',
 *                   ..., 'Ed25519', ...)` expects in the browser.
 *   status          'active'      — currently signs production firmware.
 *                                   Acceptable in any mode.
 *                   'superseded'  — was active; legacy artifacts still
 *                                   verify in diagnostics. NOT acceptable
 *                                   for new installs without explicit
 *                                   opt-in.
 *                   'test_only'   — fixture/CI key. Public AND private
 *                                   halves are intentionally exposed (e.g.
 *                                   committed to a public repo) so test
 *                                   fixtures can be signed end-to-end.
 *                                   The wizard MUST refuse signatures
 *                                   from these keys in production mode —
 *                                   anyone with read access could forge
 *                                   them. Acceptable only when explicitly
 *                                   in development/test mode.
 *                   'revoked'     — must NOT verify any new install.
 *                   'placeholder' — slot reserved for a not-yet-issued key
 *                                   (never accepted as a verifier).
 *   issued_at       ISO-8601 date string. Informational; not enforced.
 *   comment         Free-form note for auditors.
 *
 * --- Trust evaluation ---
 *
 * `verifyFirmwareSignature` accepts a signature if AND ONLY IF a key in this
 * list passes `isKeyAcceptable` for the supplied mode AND the Ed25519
 * verification call returns true. The default mode is 'production', which
 * accepts only `active` keys — `test_only`, `superseded`, `revoked`, and
 * `placeholder` keys are all refused. Tests, diagnostics, or local
 * development opt in to relaxed acceptance with `mode: 'test'` (or
 * `'development'`) and/or `allowSuperseded: true`. The deployed wizard
 * (production build) NEVER passes these flags.
 */

export const FIRMWARE_TRUST_SCHEMA_VERSION = 1;
export const FIRMWARE_SIGNATURE_ALGORITHM = 'ed25519';

// Domain-separation label prepended to every signed message. Lets us evolve
// the signature scheme later (e.g. to a manifest-binding signature) without
// the new verifier accidentally accepting old firmware-only signatures.
export const FIRMWARE_SIGNATURE_CONTEXT_LABEL = 'sense360-firmware-v1';

export const FIRMWARE_TRUSTED_KEYS = Object.freeze([
    Object.freeze({
        kid: 'sense360-prod-2026-02',
        algo: 'ed25519',
        public_key_b64: 'wmKfWDXhpdjQP92/FnAjaWCV5bVV3coholhtNxJF99M=',
        // First active production signing key. The matching private half
        // lives ONLY in the WEBFLASH_FIRMWARE_PRIVATE_KEY_B64 GitHub
        // Actions secret and is never written to this repository. See
        // firmware-signing/README.md → "Production signing key setup"
        // for the cutover runbook and rotation procedure.
        status: 'active',
        issued_at: '2026-05-06',
        comment: 'First active production signing key. Private half is held only in the WEBFLASH_FIRMWARE_PRIVATE_KEY_B64 GitHub Actions secret. See firmware-signing/README.md.'
    }),
    Object.freeze({
        kid: 'dev-2026-01',
        algo: 'ed25519',
        public_key_b64: 'UAg82k9y+Ob+204H+3mmL6/lzdjJnT6+BACL/cmP5OM=',
        // CRITICAL: status MUST stay 'test_only' as long as the matching
        // PRIVATE key is committed to this repository under
        // firmware-signing/keys/dev-2026-01-private.*. Anyone with git
        // access can read the private key and forge signatures, so the
        // wizard must refuse this key in production mode. The fixture
        // binaries in the repo are signed by it purely so end-to-end
        // tests exercise the real verification path; they are NOT
        // installable from the deployed wizard.
        status: 'test_only',
        issued_at: '2026-05-05',
        comment: 'Development/CI fixture key. Private half is committed to the public repo (see firmware-signing/keys/), so this key MUST NEVER be promoted to \'active\' — anyone with read access could sign forged firmware. Production deployments MUST publish manifests signed by a separate \'active\' key whose private half lives only in CI secrets. See firmware-signing/README.md for the rotation procedure.'
    })
]);

// Acceptable-status policy by mode. The deployed wizard (production build)
// passes mode='production' (or omits it, since that's the default). Tests
// and local development can pass mode='test' or 'development' to broaden
// acceptance. Note: revoked and placeholder are NEVER acceptable.
const ACCEPTABLE_STATUSES_BY_MODE = Object.freeze({
    production: new Set(['active']),
    development: new Set(['active', 'test_only']),
    test: new Set(['active', 'test_only'])
});

/**
 * Return the trust-list entry for `kid`, or null if the kid is unknown.
 * Lookup is case-sensitive: kids are stable identifiers, not free text.
 */
export function findTrustedKey(kid) {
    if (typeof kid !== 'string' || !kid) {
        return null;
    }
    return FIRMWARE_TRUSTED_KEYS.find(entry => entry.kid === kid) || null;
}

function normaliseTrustMode(mode) {
    const key = String(mode || '').trim().toLowerCase();
    if (key === 'development' || key === 'dev' || key === 'debug') {
        return 'development';
    }
    if (key === 'test' || key === 'testing') {
        return 'test';
    }
    return 'production';
}

/**
 * Return true when a key is currently allowed to authorise an install
 * UNDER THE GIVEN MODE.
 *
 *   - In 'production' (the default), only `active` keys verify. Keys
 *     marked `test_only` are NEVER acceptable in production, even if the
 *     signature mathematically checks out — anyone with read access to
 *     the public repo can forge signatures from such keys.
 *   - In 'development' or 'test', `test_only` keys are also acceptable
 *     so test fixtures can exercise the real verification path.
 *
 *  Diagnostics may opt in to also accept `superseded` keys via
 * `{ allowSuperseded: true }`; install-time callers MUST NOT.
 */
export function isKeyAcceptable(entry, { allowSuperseded = false, mode = 'production' } = {}) {
    if (!entry || typeof entry !== 'object') {
        return false;
    }
    if (entry.algo !== FIRMWARE_SIGNATURE_ALGORITHM) {
        return false;
    }
    const trustMode = normaliseTrustMode(mode);
    const baseSet = ACCEPTABLE_STATUSES_BY_MODE[trustMode] || ACCEPTABLE_STATUSES_BY_MODE.production;
    if (baseSet.has(entry.status)) {
        return true;
    }
    if (allowSuperseded && entry.status === 'superseded') {
        return true;
    }
    return false;
}

/**
 * Iterate the trust list, yielding entries that are currently acceptable
 * for the given purpose. Order is preserved so the first acceptable entry
 * is tried first by the verifier (small but consistent ordering
 * optimisation when there are multiple concurrently-active keys, e.g.
 * during rotation).
 */
export function listAcceptableKeys({ allowSuperseded = false, mode = 'production' } = {}) {
    return FIRMWARE_TRUSTED_KEYS.filter(entry =>
        isKeyAcceptable(entry, { allowSuperseded, mode })
    );
}

/**
 * Test-only check that surfaces test_only keys explicitly. Lets the
 * static gate produce a "this build is signed by a test/dev key — refuse
 * for stable in production" verdict without re-implementing the status
 * lookup.
 */
export function isTestOnlyKey(entry) {
    return Boolean(entry && entry.status === 'test_only');
}
