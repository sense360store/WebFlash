# Standing invariants (WebFlash)

These are the standing blockers / invariants that gate every WebFlash PR.
They were carried **verbatim** out of the retired `UPCOMING_PR.md` working
queue tracker when it was removed under `DOCS-DISPOSITION-001` Phase 2
(Step P2.3); the queue history is recoverable via
[`docs/archive-index.md`](archive-index.md). The esphome-public counterpart
lives at `docs/standing-invariants.md` on
[`sense360store/esphome-public`](https://github.com/sense360store/esphome-public/blob/main/docs/standing-invariants.md).

## Standing blockers / invariants

These gate every WebFlash PR and must not be regressed:

- **The 2.0 view is the sole root view.** There is no `?ui=1` fallback and the
  1.0 render modules (`scripts/ui-version.js` and the rest of the 1.0 layer)
  were removed by PR 13. Any new work targets the single 2.0 view directly.
- **The engine owns every gate.** The view (`scripts/app.js` and friends)
  renders the engine verdict (`evaluateInstallGate`, `resolveCompatibleFirmware`)
  and never owns a gating decision. Provenance, channel acknowledgement,
  SHA-256 verification, manifest freshness, and the service-worker update gate
  must **never** be weakened.
- **Kit-picker default + recommended choice stays stable Bathroom PoE.**
  `Ceiling-POE-VentIQ-RoomIQ` (the single `scripts/data/kits.json` kit) is the
  default and recommended selection; preview bundles are never default, never
  recommended, never buyable.
- **Preview is never stable or hardware-verified.** Every preview-channel build
  stays Advanced-only behind the `channel:preview` acknowledgement and carries
  no hardware / bench / compliance / commercial-availability claim.
- **Standalone FanPWM / FanDAC stay out of the picker.** The
  `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` previews are advanced-builder
  only and never appear as bundle / kit cards.
- **TRIAC stays blocked.** Sense360 TRIAC (S360-320) stays
  advanced/manual-warning and build-blocked — not recommended, not default,
  not a kit, not in `REQUIRED_CONFIGS`, not import-allowed, not
  compliance-certified.
- **`FANDAC-I2C-ADDR-001` stays pending.** The analog (FanDAC) address-switch
  acknowledgement (`0x58` / `0x5A`, forbidden `0x59`) is not physically
  verified; any FanDAC exposure keeps that acknowledgement additive.
- **No browser-side signature-verification claim.** `signature_verified` stays
  skip; cryptographic signature verification in the browser is a separate,
  explicit future project, never claimed on any surface.

Note on the last bullet: it is carried verbatim from the queue tracker as
written at DOCS-CLEANUP-001 time. The engine has since landed real, enforced
Ed25519 verification at the install gate (`verifyFirmwareIntegrity` in
`scripts/state.js` against `scripts/utils/firmware-trusted-keys.js`); the
still-operative rule is the one in `CLAUDE.md`: never claim verification the
engine has not actually performed, and never weaken that gate.

## Do-not-change guardrails for docs / tracking-only PRs

Every PR that only updates documentation or tracking state must not touch:

- the engine modules — `scripts/state.js`, `scripts/capabilities.js`, every
  file under `scripts/utils/` (including `release-channels.js`,
  `firmware-provenance.js`, `kit-config.js`, `a11y.js`) and every file under
  `scripts/services/` (including `manifest-freshness.js`, `sw-update.js`,
  `diagnostics.js`)
- `manifest.json` and every `firmware-*.json`
- `firmware/sources.json` and every firmware binary / `.meta.json` sidecar
  under `firmware/`
- the `REQUIRED_CONFIGS` allowlist (sourced from
  `.github/workflows/firmware-publish.yml`)
- `scripts/utils/release-channels.js` (preview acknowledgement,
  `defaultSelectable`, `hiddenByDefault`, visibility)
- `sw.js` (service worker, cache name, precache list) and `_headers` (CSP,
  CORS, cache rules)
- the FanTRIAC HW-005 block (`block_tokens` stays `["FanTRIAC", "LED"]` on the
  Release-One source and `["FanTRIAC"]` on the preview sources)
- the firmware-signing + import pipeline — `scripts/gen-manifests.py`,
  `scripts/import-firmware-sources.py`,
  `scripts/import-preview-eligible-sources.py`,
  `scripts/sync-from-releases.py`, `scripts/validate-naming-policy.js`,
  `scripts/validate-product-import-readiness.js`, and the signing workflow
  `.github/workflows/firmware-publish.yml`
- every other workflow under `.github/workflows/`
- every test under `__tests__/` (including fixtures)
- the 2.0 view files (`scripts/app.js`, `scripts/data.js`,
  `scripts/identify.js`, `scripts/install.js`, `scripts/connect.js`,
  `scripts/engine.js`, `index.html`, `app.css`, and every file under `css/`)

`scripts/data/kits.json` (the 2.0 kit catalogue) is edited only by a kit /
bundle-picker code PR — never by a tracking / docs PR.
