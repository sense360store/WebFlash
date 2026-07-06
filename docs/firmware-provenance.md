# Firmware provenance and verification

This page documents the firmware trust model: the preflight checks, the
provenance validation layer, the enforced integrity and signature install
gate, the required manifest fields, and the reviewer checklist. It was
relocated from the repository README when it became a short front door
(REPO-CUSTOMER-READY-001 S4).

## Preflight checks and install gating

Step 5 includes a **Preflight checks** panel with these labels:

- **Browser support**
- **Device connection visibility**
- **Connection quality**
- **Firmware verification**
- **User acknowledgement**

Each check reports `Pass`, `Warning`, or `Fail`. Current install/download gating behavior:

- Any `Fail` blocks install/download.
- The **Before you flash** checkbox (`I understand and will keep the hub powered and connected throughout flashing.`) must be checked.
- When at least one check reports `Warning`, an **Accept preflight warnings** checkbox appears in the preflight panel and must be checked before the install/download button is enabled. The checkbox is hidden again automatically as soon as the warning condition clears.

## Firmware provenance and verification

> **Trust model up front.** WebFlash validates provenance *metadata* and the
> required integrity fields at selection time, then verifies the downloaded
> bytes at install time: a SHA-256 integrity check and Ed25519 signature
> verification against a pinned trust list are both ENFORCED at the install
> gate (see "Signature verification — enforced install gate" below).
> Metadata presence alone is never presented as a completed verification.

Flashing is supply-chain-sensitive: the wizard hands a binary to ESP Web
Tools that overwrites the device's flash. WebFlash separates seven concerns
so the trust model is explicit and hard to bypass:

1. **Metadata presence** — does the manifest entry ship the fields we need
   to even reason about provenance? (`sha256`, `signature`, `source_commit`,
   `file_size`, firmware path, artifact identity)
2. **Hash integrity metadata** — does the entry expose a SHA-256 we can
   check the binary against once it has been downloaded?
3. **Hash verification after download** — performed by `state.js` when the
   browser supports SubtleCrypto: the downloaded bytes are hashed and
   compared to the manifest's `sha256`. This is real integrity enforcement
   over the bytes-on-the-wire.
4. **Signature metadata presence** — does the entry carry a `signature`
   blob? **The legacy `signature` field is a salted SHA-256 with a publicly
   known salt; it is integrity metadata, not a public-key signature.** The
   cryptographic signature is the separate `signature_ed25519` field.
5. **Cryptographic signature verification** — implemented and enforced at
   install time: the downloaded bytes are verified against the build's
   `signature_ed25519` using the pinned trust list in
   `scripts/utils/firmware-trusted-keys.js`. See "Signature verification —
   enforced install gate" below.
6. **Source provenance** — does the entry name the source commit AND a
   stable, **immutable** source URL (e.g. `/commit/<sha>`, never
   `/tree/main` or `/releases/latest`)?
7. **Release/changelog completeness** — does the build ship a
   human-authored changelog appropriate for its channel?

### What blocks flashing today

The runtime gate (`scripts/utils/firmware-provenance.js`) refuses to start a
binary download when any of these checks fail:

- `sha256_metadata_present` — missing for ANY remotely flashable channel
- `signature_metadata_present` — missing
- `source_commit_present` — missing
- `file_size_present` — missing or zero
- `firmware_path_present` — missing manifest `parts[].path`
- `artifact_identity_present` — missing `config_string`/`model`
- `file_size_plausible` — between the placeholder sentinel (≤64 B) and the
  per-artifact-type plausible threshold
- `source_url_immutable` — fails when `source_url` references a branch
  (`/tree/main`, `/blob/master`), a moving tag (`/releases/latest`), or
  doesn't include `source_commit` (production mode)
- `channel_allowed_for_mode` — fails when a `dev`/`test`/`nightly` channel
  build is loaded outside `?mode=development`
- `changelog_present` — fails for stable channels when the changelog is
  empty, an auto-generated synth line, or generic boilerplate
  ("Initial release.", "TBD", …)

Critical primitives (sha256, signature, source_commit, file_size, firmware
path, artifact identity) are blocking on **every** remotely flashable
channel, not just stable. A beta build missing `sha256` cannot be flashed.

### What only warns

- `lifecycle_status` — `deprecated: true` produces a warning the user must
  acknowledge in the release-channel layer; missing `deprecation_reason`
  warns but does not block.
- `changelog_present` on `preview`/`beta`/`rc`/`candidate` channels —
  warning rather than fail, since downstream channels are explicit opt-in.
- File-size placeholder fixtures (`≤64 B`) — tolerated by default so the
  18-byte stubs already shipped in the repo do not trip the gate; surfaces
  as a warning if `allowPlaceholderSize: false` is set.

### Signature verification — enforced install gate

Browser-side Ed25519 signature verification is implemented and ENFORCED at
install time. After the firmware download, the wizard verifies the bytes
against the build's `signature_ed25519` using a public key pinned in
`scripts/utils/firmware-trusted-keys.js` (`verifyFirmwareSignature`, invoked
by `verifyFirmwareIntegrity` in `scripts/state.js`). The install gate
(`evaluateInstallGate`) arms install only when BOTH the SHA-256 integrity
check and the Ed25519 authenticity check pass; the `signature_verified`
provenance check flips from `pending` to `pass`/`fail` based on the runtime
result.

In production mode only keys with `status: 'active'` may authorise an
install. Signatures from `test_only` keys (such as the committed
`dev-2026-01` fixture key), `superseded`, `revoked`, or unknown keys are
refused with a specific machine-readable reason code even when the signature
mathematically verifies. A missing, malformed, or tampered signature blocks
install with a clear reason in the preflight panel.

UI copy may claim verification ONLY when the engine's runtime verdict
passed. Pre-verification states must use non-claim phrasings such as
"Signature metadata present; authenticity will be verified before
flashing." Never present metadata presence as a completed verification.

### Required manifest fields

Every `manifest.json` `builds[]` entry must carry:

| Field | Purpose | Generated by |
|---|---|---|
| `sha256` | SHA-256 of the binary, re-checked at runtime against the downloaded bytes | `gen-manifests.py` (digest of `.bin`) |
| `signature` | Salted SHA-256 *integrity metadata* (NOT a public-key signature). Re-checked at runtime as a redundant integrity check; passing it does not establish cryptographic authenticity. | `gen-manifests.py` (digest + `Sense360 Firmware Signing Salt v1`) |
| `source_commit` | Git SHA the firmware was produced from; required so a flashed device is traceable to a specific tree | `WEBFLASH_SOURCE_COMMIT` env var, then `git rev-parse HEAD` |
| `source_url` | URL pointing at the **commit** the firmware was produced from. Mutable references like `/tree/main` or `/releases/latest` are rejected in production mode. | Built from `--source-url-template` (default: GitHub commit URL) |
| `signed_by` | Optional identifier of the signing party (CI, release engineer). Treated as metadata only — not as proof of verification. | Sidecar `*.meta.json` |
| `file_size` | Declared file size, validated against the per-artifact-type plausible threshold | `gen-manifests.py` (`stat`) |
| `artifact_type` | One of `application` (default, ≥100 KB), `rescue` (≥50 KB), `bootloader` (≥1 KB), `partition_table` (≥256 B), `test_fixture` (any size in dev/test mode). | `gen-manifests.py` from sidecar `artifact_type` |
| `local_only` | Optional. Marks builds that are not exposed via remote URLs; relaxes some metadata-presence checks. Defaults to `false`. | Sidecar `*.meta.json` |
| `changelog` | Non-empty list of **human-authored** change notes for stable builds. Auto-generated synth lines and generic boilerplate ("TBD", "Initial release.") are rejected. | Sidecar `*.meta.json` or release-notes file — never auto-synthesised |
| `deprecated` | Marks builds that should not be auto-selected | Sidecar `*.meta.json` (default `false`) |
| `deprecation_reason` | Free-form rationale; **required** when `deprecated: true` (production-mode strict validation enforces this). | Sidecar `*.meta.json` |

### Sidecar metadata

To attach hand-curated provenance to a build, drop a JSON sidecar next to the binary:

```
firmware/configurations/Sense360-<config>-v<X.Y.Z>-stable.bin
firmware/configurations/Sense360-<config>-v<X.Y.Z>-stable.meta.json
```

Supported keys (all optional):

```json
{
  "artifact_type": "application",
  "local_only": false,
  "deprecated": true,
  "deprecation_reason": "Superseded by v2.0.0; retained for diagnostic comparison.",
  "signed_by": "Sense360 release pipeline",
  "source_commit": "abcdef1234...",
  "source_url": "https://github.com/sense360store/WebFlash/commit/abcdef1234",
  "changelog": ["Fixes mmWave driver init crash on cold boot."],
  "known_issues": ["LED ring may flash white briefly during update."],
  "features": ["PoE-powered Sense360 Core configuration"],
  "hardware_requirements": ["Sense360 Core R4 or newer"],
  "improv": true
}
```

When firmware is published via a GitHub Release,
`scripts/sync-from-releases.py` parses the release body and writes this
sidecar automatically — see `DEVELOPER.md → Via GitHub Releases` for the
full operator flow. Hand-authored sidecars committed alongside the
binary are detected before generation runs and take precedence, so
manual overrides keep working.

The publishing pipeline enforces sidecar quality so sidecars cannot
silently paper over missing provenance with boilerplate:

- `changelog` must be a non-empty array for stable builds; generic
  filler text (`"Initial release."`, `"TBD"`, `"Placeholder"`, …) is
  treated as missing.
- `source_commit` is required for traceability.
- `deprecation_reason` is required when `deprecated: true`.
- `known_issues`, when present, must be an array.
- `signed_by` is recorded as metadata; it is never treated as proof of
  verification.

When no sidecar is present, `gen-manifests.py` falls back to git for
`source_commit`/`source_url`. Changelogs are **never** auto-synthesised — a
generated changelog proves only that the generator ran, not that a human
documented the release.

### Runtime install gate

Before any binary is downloaded, `scripts/utils/firmware-provenance.js`
runs `validateFirmwareProvenance(build)`:

- **Critical primitives** (`sha256`, `signature`, `source_commit`,
  `file_size`, firmware path, artifact identity) are **blocking on every
  remotely flashable channel** — stable, beta, preview, rc, candidate,
  rescue. A beta build missing `sha256` cannot be flashed.
- **Stable channel changelog**: missing/auto-generated/filler produces a
  `fail` status with a blocking install reason.
- **Other channel changelog (preview/beta)**: missing changelog surfaces
  as a warning rather than a fail.
- **dev/nightly/experimental/test channels** are blocked unless the page
  is loaded with `?mode=development`. The runtime check refuses to flash
  them in production mode even when their metadata is otherwise valid.
- **File size sanity** is artifact-type aware. `application` requires
  ≥100 KB; `rescue` ≥50 KB; `bootloader` ≥1 KB; `partition_table` ≥256 B.
  `test_fixture` is exempt only when running in development/test mode.
- **Source URL immutability**: a `source_url` that references a branch,
  HEAD, or `/releases/latest` blocks install in production mode. The URL
  must contain the recorded `source_commit`.
- **Deprecated builds**: `deprecated: true` removes the build from default
  selection (`pickDefaultEligibleBuilds`) and tags the dropdown entry
  with "· Deprecated". Users can still pick it manually; doing so
  surfaces a warning and the deprecation reason in the verification panel.

### Strict (production) validation at publish time

`scripts/gen-manifests.py` accepts an explicit `--mode` flag with
`production` (the default), `development`, or `test`:

- `production` — refuses to write a customer-facing manifest with weak
  provenance: missing critical primitives, mutable `source_url`,
  development/test channels, deprecated without reason, sidecar
  boilerplate, or synthesised stable changelog. **Fails the build loudly.**
- `development` — relaxes channel and source-URL strictness for bench
  builds, but still demands every critical primitive.
- `test` — additionally tolerates `artifact_type=test_fixture` builds.

`--strict-validate` is a legacy alias for `--mode=production`.

### Machine-readable result shape

`validateFirmwareProvenance` returns a stable, machine-readable shape:

```js
{
  status: 'pass' | 'warn' | 'fail',
  blocking: true,
  warnings: ['…'],
  failures: [{ id, label, detail }],
  checks: [
    {
      id: 'sha256_metadata_present',     // stable, never reworded
      label: 'SHA-256 metadata',         // human copy, may change
      status: 'pass' | 'warn' | 'fail' | 'skip',
      severity: 'block' | 'warn' | 'info',
      detail: '…'
    },
    …
  ]
}
```

Stable check IDs are exported from
`scripts/utils/firmware-provenance.js` as `CHECK_IDS`. Other systems
(release-channel UI, diagnostics bundle) consume this shape by id and
must not parse `summary`/`detail` strings.

### Changelog severity ladder

The changelog has its own channel-aware severity ladder so stable releases are held to a higher bar than experimental builds:

| Channel(s) | Missing changelog | Auto-generated changelog (matches the historical synth pattern) |
|---|---|---|
| `stable` / `general` / `production` / `lts` | **Fail** — blocks install | **Fail** — treated identically to missing |
| `preview` / `beta` / `rc` / `candidate` | Warning — install allowed once acknowledged | Warning |
| `dev` / `nightly` / `experimental` / `rescue` / `test` | Allowed (silent) | Allowed (silent) |
| Unknown channel | Warning | Warning |

The auto-generated detection matches the exact one-line pattern `<Channel> build of Sense360 <Descriptor> v<Version>.` produced by older versions of `gen-manifests.py`. Multi-entry changelogs that include such a line alongside real notes are not flagged — only the "generator ran but nobody wrote anything" case is rejected.

### What the user sees

Step 5 renders a **Provenance metadata verified** panel inside the firmware
card listing every check with pass/warn/fail/skip icons. The source commit
links out to the upstream commit URL when available. The
`signature_verified` check starts as pending and flips to **pass** or
**fail** from the engine's runtime verdict once the downloaded bytes have
been verified — it never claims verification before the engine has actually
performed it. If any blocking check fails, the panel turns red, the install
button stays disabled, and the helper banner reproduces the blocking
reason.

### Tooling for maintainers

- `python3 scripts/gen-manifests.py --strict-validate` (alias for
  `--mode=production`) promotes provenance findings to build failures. The
  default mode is also `production`; pass `--mode=development` to opt out
  for local bench runs.
- `python3 scripts/gen-manifests.py --mode=development` relaxes channel
  and source-URL strictness while still requiring every critical
  primitive.
- `WEBFLASH_SOURCE_COMMIT=<sha> python3 scripts/gen-manifests.py`
  overrides the source commit (useful when running outside a git
  checkout).
- `python3 scripts/gen-manifests.py --source-url-template "https://example.com/commit/{commit}"`
  customises the per-build `source_url`. The template MUST include
  `{commit}` so the URL is pinned to the specific tree.
- `npm test -- firmware-provenance` runs both the unit and the
  install-gate integration tests for this feature.

### Reviewer checklist

When reviewing a PR that touches provenance, manifest generation, or the
install gate, confirm each item:

- [ ] stable firmware missing `sha256` blocks the install gate
- [ ] beta firmware missing `sha256` blocks the install gate (not just warns)
- [ ] rescue firmware missing `sha256` blocks the install gate
- [ ] stable build missing `changelog` fails strict validation
- [ ] synthesised/filler stable changelog fails strict validation
- [ ] mutable `source_url` (`/tree/main`, `/releases/latest`) fails
      production validation
- [ ] deprecated build requires `deprecation_reason`
- [ ] UI does not claim cryptographic signature verification anywhere
      except from the engine's runtime verdict
- [ ] tests pass: `npm test -- firmware-provenance`
- [ ] generated manifest passes strict validation:
      `python3 scripts/gen-manifests.py --strict-validate --dry-run`

### Status-to-remediation quick map

- **Browser support = Fail**: switch to a Chromium browser with Web Serial (Chrome/Edge/Opera).
- **Device connection visibility = Warning**: connect/reconnect USB, close other serial apps, re-read device info.
- **Connection quality = Warning/Fail**: keep cable and power stable for at least 30s, avoid hubs, retry after reconnecting.
- **Firmware verification = Warning/Fail**: wait for the SHA-256 integrity check to finish or reselect firmware/retry download if the integrity check fails.
- **User acknowledgement = Warning**: check the **Before you flash** acknowledgement checkbox.
