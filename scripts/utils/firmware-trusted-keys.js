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
 *                   'superseded'  — was active; legacy artifacts still verify.
 *                   'revoked'     — must NOT verify any new install.
 *                   'placeholder' — slot reserved for a not-yet-issued key
 *                                   (never accepted as a verifier).
 *   issued_at       ISO-8601 date string. Informational; not enforced.
 *   comment         Free-form note for auditors.
 *
 * --- Trust evaluation ---
 *
 * `verifyFirmwareSignature` accepts a signature if AND ONLY IF a key in this
 * list has `status === 'active'`, `algo === 'ed25519'`, and the Ed25519
 * verification call returns true. `superseded` keys verify only when the
 * caller explicitly opts in (used by diagnostics to identify legacy
 * artifacts); `revoked` and `placeholder` keys never verify.
 */

export const FIRMWARE_TRUST_SCHEMA_VERSION = 1;
export const FIRMWARE_SIGNATURE_ALGORITHM = 'ed25519';

// Domain-separation label prepended to every signed message. Lets us evolve
// the signature scheme later (e.g. to a manifest-binding signature) without
// the new verifier accidentally accepting old firmware-only signatures.
export const FIRMWARE_SIGNATURE_CONTEXT_LABEL = 'sense360-firmware-v1';

export const FIRMWARE_TRUSTED_KEYS = Object.freeze([
    Object.freeze({
        kid: 'dev-2026-01',
        algo: 'ed25519',
        public_key_b64: 'UAg82k9y+Ob+204H+3mmL6/lzdjJnT6+BACL/cmP5OM=',
        status: 'active',
        issued_at: '2026-05-05',
        comment: 'Development/CI signing key. Both halves are intentionally committed under firmware-signing/keys/ so the placeholder fixtures shipped in this repo can exercise the real verification path. MUST be rotated and marked \'revoked\' before this repo publishes real firmware. See firmware-signing/README.md.'
    })
]);

const ACCEPTABLE_STATUSES_FOR_INSTALL = new Set(['active']);
const ACCEPTABLE_STATUSES_FOR_DIAGNOSTICS = new Set(['active', 'superseded']);

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

/**
 * Return true when a key is currently allowed to authorise an install.
 * Diagnostics may opt in to also accept `superseded` keys via
 * `{ allowSuperseded: true }`; install-time callers MUST NOT.
 */
export function isKeyAcceptable(entry, { allowSuperseded = false } = {}) {
    if (!entry || typeof entry !== 'object') {
        return false;
    }
    if (entry.algo !== FIRMWARE_SIGNATURE_ALGORITHM) {
        return false;
    }
    const allowedSet = allowSuperseded
        ? ACCEPTABLE_STATUSES_FOR_DIAGNOSTICS
        : ACCEPTABLE_STATUSES_FOR_INSTALL;
    return allowedSet.has(entry.status);
}

/**
 * Iterate the trust list, yielding entries that are currently acceptable
 * for the given purpose. Order is preserved so the first 'active' entry is
 * tried first by the verifier (small but consistent ordering optimisation
 * when there are multiple concurrently-active keys, e.g. during rotation).
 */
export function listAcceptableKeys({ allowSuperseded = false } = {}) {
    return FIRMWARE_TRUSTED_KEYS.filter(entry => isKeyAcceptable(entry, { allowSuperseded }));
}
