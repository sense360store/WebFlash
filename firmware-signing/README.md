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
surface to get wrong.

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

## Production rotation — required before shipping real firmware

When this repo starts publishing real `*.bin` artifacts:

1. **Generate a production keypair** off-machine (HSM or air-gapped host):
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
2. **Pin the new public key** in both
   `scripts/utils/firmware-trusted-keys.js` and
   `firmware-signing/trusted-keys.json`. Give it a `kid` like
   `prod-2026-Q2`. Set `status: 'active'` and add a `comment` field
   referencing the rotation ticket. **Do NOT** commit the matching
   private key anywhere; it lives only in CI secrets.
3. **Leave the dev key as `test_only`** (or move it to `revoked` if no
   tests still need it). Do NOT delete the entry; keeping it in the list
   lets diagnostics identify legacy fixture signatures.
4. **Store the production private key in CI secrets**, not in the repo. Set
   `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` (raw 32-byte seed, base64) and
   `WEBFLASH_FIRMWARE_KEY_ID=prod-2026-Q2` in the GitHub Actions secrets
   so `gen-manifests.py` can sign at publish time. The publish workflow
   already wires those env vars through.
5. **Run the publish pipeline in production mode** — `gen-manifests.py`
   defaults to `--mode production`, which refuses to sign with a
   `test_only` key. An accidental fall-back to the committed dev key
   will fail the build with a loud error (rather than silently produce
   a manifest the wizard would refuse).
6. **Rotate periodically**: each rotation adds a new `active` key and
   marks the previous one `superseded`. Production firmware signed under
   the previous key continues to verify in diagnostics until that key
   is moved to `revoked`.

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
