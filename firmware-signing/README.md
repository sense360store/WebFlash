# Firmware signing

WebFlash refuses to flash production (`stable`-channel) firmware unless the
binary's bytes verify against an Ed25519 signature produced by a private key
whose **matching public key is pinned in source AND has `status: 'active'`** at:

- `scripts/utils/firmware-trusted-keys.js` — the pinned trust list, consumed
  by the wizard at install time.
- `firmware-signing/trusted-keys.json` — the canonical trust list shared by
  `scripts/gen-manifests.py`. Keep this file in sync with the JS list (the
  Jest suite enforces it via the `firmware-trusted-keys` describe block in
  `__tests__/firmware-signature.test.js`).

The Web Crypto API verifies Ed25519 (RFC 8032) signatures natively in every
Chromium-based browser ≥ 113, which is the WebFlash supported runtime. The
signature is computed over the **firmware binary bytes themselves** — not
over the manifest, not over the SHA-256, not over any JSON canonicalisation.
This is the simplest defensible binding: the SHA-256 check proves the
downloaded bytes match the manifest, and the Ed25519 check proves the bytes
were signed by a key on the trust list. There is no JSON canonicalisation
surface to get wrong. The corresponding **manifest-mapping** gap that this
narrow signing scope leaves open is documented under
[Threat model → Manifest-mapping authenticity gap](#manifest-mapping-authenticity-gap)
below; read that section before relying on the signature for anything
beyond byte-level provenance.

## Current production-readiness status

WebFlash is presently in a transitional posture: the **verification path is
production-ready**, but the **artifacts being verified are not**. The live
wizard correctly refuses every install it serves today, which is the
intended outcome until the cutover items below are completed.

| Component                                       | State                  | What it means                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `scripts/utils/firmware-signature.js` gate      | **Production-ready**   | Refuses installs unless an `active`-status pinned key verifies the firmware bytes. Hard-refuses `test_only` keys in production mode (`KEY_TEST_ONLY_IN_PRODUCTION`).                                                                                          |
| `scripts/utils/firmware-trusted-keys.js` schema | **Production-ready**   | Trust list shape, statuses, and Jest backstops (`__tests__/firmware-signature.test.js`) are in place.                                                                                                                                                         |
| `scripts/gen-manifests.py` signing pipeline     | **Production-ready**   | Refuses to sign with a `test_only` key in `--mode production`. Defaults to `--mode production` and confirms the public key matches the pinned trust-list entry before signing.                                                                                |
| `.github/workflows/firmware-publish.yml`        | **Production-ready**   | Already wires `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` / `WEBFLASH_FIRMWARE_KEY_ID` from secrets and switches to `--mode production` automatically when the secret is present.                                                                                     |
| `firmware/configurations/*.bin`                 | **Pending — placeholders** | Every committed `.bin` is the literal 18-byte string `Binary placeholder`. They are not flashable firmware; they exist so end-to-end tests can exercise the real verification path under `--mode test`.                                                       |
| `firmware/rescue/*.bin`                         | **Pending — placeholder** | The single 524288-byte rescue image is a synthetic placeholder, not a real recovery build.                                                                                                                                                                    |
| Pinned `active` production signing key          | **Pending**            | Only `dev-2026-01` (`status: 'test_only'`) is in the trust list. No `active` production key is pinned yet, so even a correctly-signed real binary would not verify in production mode (no acceptable verifier).                                              |
| GitHub Actions secrets                          | **Pending**            | `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` and `WEBFLASH_FIRMWARE_KEY_ID` are not set in the repository's Actions secrets, so CI falls back to `--mode development` and signs the placeholders with the committed dev key. The deployed wizard correctly refuses.   |
| Live `manifest.json`                            | **Pending**            | Every `signature_key_id` field on the deployed `manifest.json` is `dev-2026-01`. The next publish that runs in `--mode production` will replace these.                                                                                                        |

The four **Pending** rows are tracked as the
[Production cutover checklist](#production-cutover-checklist) below. Each
row also calls out **what** the deployed wizard would refuse if the
cutover stalls at that step — so partial cutover is observable, never
silent.

## Trust statuses

Every entry in the trust list carries a `status` value that drives the
install-time policy. The deployed wizard runs in **production mode**;
tests, CI, and local development can pass `mode: 'test'` /
`mode: 'development'` to relax acceptance.

| Status        | Production mode | Test/dev mode | Use case                                                                 |
| ------------- | --------------- | ------------- | ------------------------------------------------------------------------ |
| `active`      | Verifies        | Verifies      | Real production signing key. Private half lives only in CI secrets.      |
| `test_only`   | **REFUSED**     | Verifies      | Fixture/CI key. Private half is intentionally exposed (e.g. in this repo). |
| `superseded`  | Refused         | Refused       | Was active; legacy artifacts identified via diagnostics opt-in.          |
| `revoked`     | Refused         | Refused       | Compromised or rotated-out key.                                          |
| `placeholder` | Refused         | Refused       | Reserved slot for a not-yet-issued key.                                  |

## CRITICAL: never promote `dev-2026-01` to `active`

The `dev-2026-01` key currently shipped in the trust list has its **private
half committed under `firmware-signing/keys/dev-2026-01-private.*`**. Anyone
with read access to this repository can sign firmware that mathematically
verifies against the pinned public key — so the wizard refuses signatures
from `test_only` keys in production mode by design.

If `dev-2026-01.status` is ever changed to `active`, every reader of the
public repo can produce installable firmware. The Jest suite has an explicit
backstop test (`CRITICAL: no committed test_only key has status active in
the trust list`) that fails if this happens; **do not delete or weaken
that test**.

## What ships in this directory

```
firmware-signing/
├── README.md                       (this file)
├── trusted-keys.json               canonical trust list (Python + JS share it)
└── keys/
    ├── dev-2026-01-public.pem      dev public key, PEM SPKI
    ├── dev-2026-01-public.raw.b64  dev public key, raw 32-byte base64
    ├── dev-2026-01-private.pem     dev private key, PEM PKCS#8 — TEST_ONLY
    └── dev-2026-01-private.raw.b64 dev private key, raw 32-byte seed base64
```

The `dev-2026-01` key is **committed in full (public + private)** because
this repository ships only ~18-byte placeholder fixtures, not real
firmware. The dev key exists so:

1. The placeholder binaries can be signed end-to-end and the install gate
   exercises the real verification path under test mode (rather than a stub).
2. The Jest test suite can sign synthetic test fixtures without per-developer
   key setup.
3. Anyone running the publishing pipeline locally on placeholder binaries
   gets a working manifest with valid signatures via
   `python3 scripts/gen-manifests.py --mode development`.

The deployed wizard, running in production mode, **refuses signatures
from this key**. Fixture binaries are NOT installable from the public
WebFlash deployment — that is by design.

## Production signing key setup

This is the runbook for landing the first `active` production signing key
(and for every later rotation). Each step is independently safe to redo;
the only step that touches secrets is step 4.

The example values below show what the **next planned active key** looks
like — `kid` `sense360-prod-2026-02`, public key
`wmKfWDXhpdjQP92/FnAjaWCV5bVV3coholhtNxJF99M=`. Substitute your own
freshly generated values when actually performing the cutover. Treat any
private seed that has been transmitted over an unencrypted channel
(chat, email, screen share) as **already compromised**, and regenerate
before pinning.

1. **Generate a production keypair** off-machine (HSM or air-gapped host).
   The private seed must never be written to a host that is networked
   while the seed is in cleartext. The Python keygen snippet below is
   suitable for an air-gapped run:
   ```bash
   python3 -c "
   from cryptography.hazmat.primitives.asymmetric import ed25519
   from cryptography.hazmat.primitives import serialization
   import base64
   k = ed25519.Ed25519PrivateKey.generate()
   pub = k.public_key().public_bytes(
       encoding=serialization.Encoding.Raw,
       format=serialization.PublicFormat.Raw,
   )
   priv = k.private_bytes(
       encoding=serialization.Encoding.Raw,
       format=serialization.PrivateFormat.Raw,
       encryption_algorithm=serialization.NoEncryption(),
   )
   print('public  (b64):', base64.b64encode(pub).decode())
   print('private (b64):', base64.b64encode(priv).decode())
   "
   ```
   You will end up with two values:
   - `public  (b64): <32-byte raw key, base64>` — safe to publish; this is
     what gets pinned in source.
   - `private (b64): <32-byte raw seed, base64>` — secret; this is what
     becomes the `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` GitHub Actions
     secret. **Do not paste it into chat, an issue, a commit, or any
     unencrypted channel.**

2. **Pin the new public key** in both
   `scripts/utils/firmware-trusted-keys.js` and
   `firmware-signing/trusted-keys.json`. Both files MUST stay in lockstep —
   the JS copy is the runtime source of truth for the wizard, the JSON
   copy is what `scripts/gen-manifests.py` reads, and
   `__tests__/firmware-signature.test.js` enforces that they match
   field-for-field.

   In `scripts/utils/firmware-trusted-keys.js`, append a new frozen entry
   to `FIRMWARE_TRUSTED_KEYS` ahead of the dev key (so the production key
   is tried first by the verifier):
   ```js
   Object.freeze({
       kid: 'sense360-prod-2026-02',
       algo: 'ed25519',
       public_key_b64: 'wmKfWDXhpdjQP92/FnAjaWCV5bVV3coholhtNxJF99M=',
       status: 'active',
       issued_at: '2026-05-06',
       comment: 'Initial active production signing key. Private half is held only in GitHub Actions secrets (WEBFLASH_FIRMWARE_PRIVATE_KEY_B64). Rotation ticket: <link>.'
   }),
   ```

   In `firmware-signing/trusted-keys.json`, mirror the entry (same order)
   inside the `keys` array:
   ```json
   {
       "kid": "sense360-prod-2026-02",
       "algo": "ed25519",
       "public_key_b64": "wmKfWDXhpdjQP92/FnAjaWCV5bVV3coholhtNxJF99M=",
       "status": "active",
       "issued_at": "2026-05-06",
       "comment": "Initial active production signing key. Private half is held only in GitHub Actions secrets (WEBFLASH_FIRMWARE_PRIVATE_KEY_B64). Rotation ticket: <link>."
   }
   ```

   **Do NOT** commit the matching private key anywhere in the repository;
   it lives only in CI secrets (step 4).

3. **Leave the dev key as `test_only`** (or move it to `revoked` if no
   tests still need it). Do NOT delete the entry; keeping it in the list
   lets diagnostics identify legacy fixture signatures, and the
   `CRITICAL: no committed test_only key has status active in the trust
   list` Jest backstop fails immediately if its status is ever flipped
   to `active`. The dev key MUST keep `status: 'test_only'` for as long
   as its private half is committed under
   `firmware-signing/keys/dev-2026-01-private.*`.

4. **Store the production private key in CI secrets**, not in the repo.
   In the repository's GitHub UI:
   *Settings → Secrets and variables → Actions → New repository secret*
   - `WEBFLASH_FIRMWARE_KEY_ID`
     Value: the `kid` you pinned in step 2
     (e.g. `sense360-prod-2026-02`).
   - `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64`
     Value: the raw 32-byte Ed25519 seed, base64-encoded — i.e. the
     `private (b64)` value emitted by the keygen snippet in step 1.
     Treat this as a credential of the same sensitivity as a deploy
     token.

   The `Publish: Deploy Site (auto on merge)` workflow already wires those env vars through
   to `gen-manifests.py` (see
   `.github/workflows/firmware-publish.yml` and the
   `Generate firmware manifests` step). No workflow edit is required.

5. **Run the publish pipeline in production mode.** `gen-manifests.py`
   defaults to `--mode production`, which refuses to sign with a
   `test_only` key. The CI step branches on the presence of
   `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64`: when set, it logs
   `Production signing key provided; running gen-manifests in --mode
   production.`; when missing, it logs a `::warning::` and falls back
   to `--mode development` with the committed dev key. Always confirm
   the production-mode log line is the one you see — a silent fallback
   means the secret was not picked up.

6. **Rotate periodically** by repeating steps 1–5 with a new `kid`
   (e.g. `sense360-prod-2026-Q3`). Each rotation adds a new `active`
   key and marks the previous one `superseded`. Production firmware
   signed under the previous key continues to verify in diagnostics
   (with `allowSuperseded: true`) until that key is moved to `revoked`.
   Multiple `active` entries are supported during a rotation window:
   the verifier tries each in order, so a re-signed manifest can land
   on Pages before the old key is retired.

## Production cutover checklist

This is the operator-facing punch list to take WebFlash from "verification
path correct, artifacts placeholder" (the [Current production-readiness
status](#current-production-readiness-status) snapshot above) to
"deployed wizard installs real signed firmware". Each row is independent
and can be tracked separately in a deployment ticket.

- [ ] **1. Replace placeholder `.bin` files with real firmware artifacts.**
  Drop real ESPHome / PlatformIO build outputs under
  `firmware/configurations/` (and `firmware/rescue/` for the recovery
  build), following the canonical filename pattern enforced by
  `scripts/validate-naming-policy.js`:
  `Sense360-<config>-vX.Y.Z-(stable|preview|beta).bin`. Delete the
  18-byte placeholder files in the same commit so no half-real,
  half-placeholder state ever ships. Re-run
  `python3 scripts/gen-manifests.py --summary --dry-run` locally to
  confirm the manifest still resolves cleanly.

- [ ] **2. Add and pin the active production public key.**
  Follow [Production signing key setup](#production-signing-key-setup)
  steps 1–3 above. The acceptance check is: `npm test --
  firmware-signature` is green, the JS and JSON trust lists match
  field-for-field, the dev key still has `status: 'test_only'`, and
  there is exactly one (or more, during rotation) entry with
  `status: 'active'`.

- [ ] **3. Configure GitHub Actions secrets.**
  Set `WEBFLASH_FIRMWARE_KEY_ID` and `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64`
  per [Production signing key setup](#production-signing-key-setup)
  step 4. Both must be set; the workflow only switches to
  `--mode production` when `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` is
  non-empty, and `gen-manifests.py` exits with a loud error if
  `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` is set without
  `WEBFLASH_FIRMWARE_KEY_ID`.

- [ ] **4. Run a production manifest generation.**
  Push the firmware-replacement commit to `main` (or trigger the
  `Publish: Deploy Site (auto on merge)` workflow manually). In the workflow log for the
  `Generate firmware manifests` step, confirm the line
  `Production signing key provided; running gen-manifests in --mode
  production.`. If you see the warning
  `No production signing key in CI secrets; falling back to --mode
  development with the committed test_only dev key`, the secret was not
  picked up — fix step 3 before continuing.

- [ ] **5. Verify the deployed `manifest.json` uses the production key id.**
  After CI deploys, fetch
  `https://sense360store.github.io/WebFlash/manifest.json` and confirm
  every `signature_key_id` is the production `kid` you pinned in step
  2 (e.g. `sense360-prod-2026-02`) and **not** `dev-2026-01`. A single
  remaining `dev-2026-01` reference means the publish ran in
  `--mode development`; revisit step 4. Also confirm `source_commit`
  matches the head commit of `main`.

- [ ] **6. Verify the live wizard's install gate end-to-end.**
  Open the deployed wizard
  (`https://sense360store.github.io/WebFlash/`) in a Chromium-based
  desktop browser. For positive coverage: walk through a
  `stable`-channel build and confirm the install button is enabled
  with no "test/dev signing key" warning. For negative coverage:
  manually craft a local `manifest.json` whose `signature_key_id` is
  `dev-2026-01`, serve it from `python3 -m http.server`, and confirm
  the wizard refuses with the `KEY_TEST_ONLY_IN_PRODUCTION` reason
  code (this is the regression test for the "dev key accidentally
  resurrects" path).

- [ ] **7. Real hardware flash test.**
  Connect at least one Sense360 ESP32-S3 Core hub via USB to a
  Chromium browser that supports Web Serial, complete the wizard for
  one production-signed configuration, and run
  `<esp-web-install-button>` end-to-end. Confirm the device boots
  into the expected firmware (Improv reports the new version, sensors
  enumerate as expected). Until at least one such end-to-end install
  succeeds against real hardware, the cutover is **not** complete —
  passing the install gate only proves authenticity, not that the
  binary is the firmware you intended to ship.

## Signing a binary manually

For local fixture builds (test mode):

```bash
python3 scripts/gen-manifests.py --mode development --summary
```

`gen-manifests.py` autodiscovers the dev key under
`firmware-signing/keys/dev-2026-01-private.raw.b64` and emits a
`signature_ed25519` (base64 raw 64-byte signature) plus a `signature_key_id`
on every manifest entry.

For production publish, override the key with environment variables:

```bash
WEBFLASH_FIRMWARE_PRIVATE_KEY_B64=<base64-raw-32-byte-seed> \
WEBFLASH_FIRMWARE_KEY_ID=prod-2026-Q2 \
python3 scripts/gen-manifests.py --mode production
```

or with CLI flags:

```bash
python3 scripts/gen-manifests.py \
    --mode production \
    --signing-key /path/to/secret/prod-2026-Q2-private.raw.b64 \
    --signing-key-id prod-2026-Q2
```

The default mode is `production`, which refuses to sign with a
`test_only` key. CI invocations should NOT pass `--mode development` —
that would silently sign production manifests with whatever key was
available, which the wizard would later refuse for every user.

## Threat model

The Ed25519 signature defends against the case where the manifest *and*
the binary are both replaced by an attacker who has write access to the
deployed `manifest.json` and `firmware/configurations/*.bin` (e.g. via a
compromised release pipeline or a stolen GitHub Pages deploy token).
Without a private key whose matching public key is pinned with
`status: 'active'`, such an attacker cannot produce a signature that
verifies against the production trust list, so the wizard refuses to
flash.

The signature does **not** protect against:

- A compromised wizard build (the trust list itself could be replaced).
  Defenders should monitor `scripts/utils/firmware-trusted-keys.js` for
  unauthorised changes — promoting a `test_only` entry to `active`, or
  adding a brand-new `active` entry under attacker control, would let
  malicious firmware verify. CI integrity (signed commits, branch
  protection, code review on the trust-list file specifically) is the
  upstream control.
- Compromise of the production private key. Rotate immediately, mark
  the old key `revoked`, and re-sign all live firmware under the new key.
  The wizard re-evaluates trust on every page load.
- The committed `test_only` dev key being used to sign test/dev binaries
  hosted *off* the production WebFlash deployment. The signature would
  verify against the pinned key under test mode, but the deployed
  wizard refuses test_only keys in production mode regardless. If you
  want the deployed wizard to accept fixture builds, you must
  legitimately rotate to a new `active` production key — not relax the
  test_only refusal.

### Manifest-mapping authenticity gap

The current Ed25519 signature is computed over the **firmware binary
bytes only** — see `sign_firmware_bytes` in
`scripts/gen-manifests.py` and `verifyFirmwareSignature` in
`scripts/utils/firmware-signature.js`. It does NOT bind the bytes to:

- `config_string` (e.g. `Ceiling-POE-AirIQ`)
- `version` and `channel` (`stable` / `beta` / `rescue` / etc.)
- `artifact_type` (`application` vs `rescue`)
- `source_commit` / `source_url`
- `known_issues`, `hardware_requirements`, `device_type`,
  `chipFamily`, or any other `manifest.json` metadata field

An attacker who can rewrite `manifest.json` on the deployed Pages site
but **cannot** mint a new signature can still:

1. Take a binary that was legitimately signed for one configuration
   (say a rescue image, or a Voice variant on POE).
2. Move its `parts[].path` / `signature_ed25519` / `signature_key_id`
   triple under a different `config_string` entry in `manifest.json`,
   together with the matching `sha256` and `md5` (the integrity
   metadata travels with the bytes).
3. Cause a user who selected the "wrong" configuration in the wizard
   to download and flash an authentic-but-mismatched binary. Both the
   SHA-256 integrity check (`state.js` after download) and the Ed25519
   authenticity check (`firmware-signature.js`) will pass — neither
   knows what the binary was *supposed* to be.

The compensating controls today are:

- `_headers` serves `manifest.json` and the `.bin` files from the same
  origin. Any attacker capable of mapping a signed binary onto the
  wrong `config_string` already has full write access to the deployed
  artifact set, so the gap does not widen the existing trust boundary
  beyond a wizard-build / Pages-deploy compromise.
- The `REQUIRED_CONFIGS` allowlist in
  `.github/workflows/firmware-publish.yml` fails the publish if any
  expected `config_string` is missing, which catches accidental
  mappings produced by the publishing pipeline (not malicious ones).
- `_headers` cache rules give versioned `.bin` files a long TTL but
  keep `manifest.json` short, so a malicious mapping at least
  invalidates quickly once the legitimate manifest is restored.
- `scripts/utils/firmware-provenance.js` cross-checks
  `config_string` against structured `mounting` / `power` / `modules`
  fields and against the `parts[].path` filename, which catches the
  obvious case where the swapped binary's filename does not match the
  config it is being served as. It does NOT cover an attacker who also
  rewrites `parts[].path` and `mounting` / `power` / `modules` to
  match the false `config_string`.

**This gap is acknowledged and accepted for the current release.** The
threat is plausible only against an attacker who can already overwrite
`manifest.json` on Pages, in which case the same attacker is also free
to rewrite `scripts/utils/firmware-trusted-keys.js` and effectively own
the install path end-to-end. Within that boundary the byte-level
signature still raises the bar from "trivial swap" to "must compromise
either the wizard build or the production private key", which is the
property the current design is buying.

Closing the gap properly requires a v2 signature scheme that signs a
canonical envelope binding the firmware hash and its identifying
metadata together. The hooks for that future migration are already in
place — `FIRMWARE_SIGNATURE_CONTEXT_LABEL` in
`scripts/utils/firmware-trusted-keys.js` is documented as the
domain-separation tag whose purpose is exactly to let a v2 verifier
reject v1 firmware-only signatures (and vice versa) without ambiguity.
A future PR that closes this gap should:

- Rev `FIRMWARE_SIGNATURE_CONTEXT_LABEL` from `sense360-firmware-v1`
  to `sense360-firmware-v2` so the new verifier does not accidentally
  accept old firmware-only signatures. Note that v1 does **not** currently
  prepend this label to the signed bytes (it signs the raw `.bin`), so the
  v2 change must start actually prepending the label in both the signer and
  the verifier at the same time — revving the constant alone is a no-op.
- Define a canonical envelope (e.g. `context_label || H(config_string
  || channel || version || artifact_type || file_size || sha256) ||
  firmware_bytes`) and update both `sign_firmware_bytes` in
  `scripts/gen-manifests.py` and `verifyFirmwareSignature` in
  `scripts/utils/firmware-signature.js` to sign / verify against it.
- Regenerate every fixture signature under the new envelope and
  refresh `__tests__/firmware-signature.test.js` to cover the new
  binding.
- Decide whether the rollout overlaps both schemes (verifier accepts
  v1 OR v2 during a window) or is a hard cutover; either is fine, but
  the choice belongs in that PR's design notes, not here.

That work is deferred until real production firmware is in flight; once
it is, the v2 scheme should land before any signature-only attacker
becomes a realistic threat.
