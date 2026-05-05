# Firmware signing

WebFlash refuses to flash production (`stable`-channel) firmware unless the
binary's bytes verify against an Ed25519 signature produced by a private key
whose **matching public key is pinned in source** at:

- `scripts/utils/firmware-trusted-keys.js` — the pinned trust list, consumed
  by the wizard at install time.
- `firmware-signing/trusted-keys.json` — the canonical trust list shared by
  `scripts/gen-manifests.py`. Keep this file in sync with the JS list (the
  Jest suite enforces it via `__tests__/firmware-trusted-keys.test.js`).

The Web Crypto API verifies Ed25519 (RFC 8032) signatures natively in every
Chromium-based browser ≥ 113, which is the WebFlash supported runtime. The
signature is computed over the **firmware binary bytes themselves** — not over
the manifest, not over the SHA-256, not over any JSON canonicalisation. This
is the simplest defensible binding: the SHA-256 check proves the downloaded
bytes match the manifest, and the Ed25519 check proves the bytes were signed
by a key on the trust list. There is no JSON canonicalisation surface to get
wrong.

## What ships in this directory

```
firmware-signing/
├── README.md                       (this file)
├── trusted-keys.json               canonical trust list (Python + JS share it)
└── keys/
    ├── dev-2026-01-public.pem      dev public key, PEM SPKI
    ├── dev-2026-01-public.raw.b64  dev public key, raw 32-byte base64
    ├── dev-2026-01-private.pem     dev private key, PEM PKCS#8 — DEV ONLY
    └── dev-2026-01-private.raw.b64 dev private key, raw 32-byte seed base64
```

The `dev-2026-01` key is **committed in full (public + private)** because
this repository ships only ~18-byte placeholder fixtures, not real firmware.
The dev key exists so:

1. The placeholder binaries can be signed end-to-end and the install gate
   exercises the real verification path (rather than a stub).
2. The Jest test suite can sign synthetic test fixtures without per-developer
   key setup.
3. Anyone running the publishing pipeline locally on placeholder binaries
   gets a working manifest with valid signatures.

## ⚠️ Production rotation — required before shipping real firmware

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
   referencing the rotation ticket.
3. **Mark the dev key revoked**: change its `status` to `'revoked'` (do
   *not* delete it — keep it in the list so historical signatures can
   still be diagnosed). The wizard refuses to verify against revoked keys.
4. **Store the private key in CI secrets**, not in the repo. Set
   `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` (raw 32-byte seed, base64) and
   `WEBFLASH_FIRMWARE_KEY_ID=prod-2026-Q2` in the GitHub Actions secrets
   so `gen-manifests.py` can sign at publish time.
5. **Delete `firmware-signing/keys/dev-2026-01-private*`** from the
   working tree. The dev *public* key entry stays in the trust list as
   `revoked` so support engineers can identify legacy fixture signatures.
6. **Rotate periodically**: each rotation adds a new `active` key and
   marks the previous one `superseded`. Production firmware signed under
   the previous key continues to verify until that key is moved to
   `revoked`.

## Signing a binary manually (for the dev key)

```bash
python3 scripts/gen-manifests.py --summary
```

`gen-manifests.py` autodiscovers the dev key under
`firmware-signing/keys/dev-2026-01-private.raw.b64` and emits a
`signature_ed25519` (base64 raw 64-byte signature) plus a `signature_key_id`
on every manifest entry.

Override the key at runtime with environment variables:

```bash
WEBFLASH_FIRMWARE_PRIVATE_KEY_B64=<base64-raw-32-byte-seed> \
WEBFLASH_FIRMWARE_KEY_ID=prod-2026-Q2 \
python3 scripts/gen-manifests.py
```

or with CLI flags:

```bash
python3 scripts/gen-manifests.py \
    --signing-key firmware-signing/keys/prod-2026-Q2-private.raw.b64 \
    --signing-key-id prod-2026-Q2
```

## Threat model

The Ed25519 signature defends against the case where the manifest *and*
the binary are both replaced by an attacker who has write access to the
deployed `manifest.json` and `firmware/configurations/*.bin` (e.g. via a
compromised release pipeline or a stolen GitHub Pages deploy token).
Without the corresponding private key, such an attacker cannot produce a
signature that verifies against the pinned public key, so the wizard
refuses to flash.

The signature does **not** protect against:

- A compromised wizard build (the trust list itself could be replaced).
  Defenders should monitor `scripts/utils/firmware-trusted-keys.js` for
  unauthorised changes — adding a key under attacker control would let
  malicious firmware verify. CI integrity (signed commits, branch
  protection) is the upstream control.
- Compromise of the production private key. Rotate immediately, mark
  the old key `revoked`, and re-sign all live firmware under the new key.
  The wizard re-evaluates trust on every page load.
