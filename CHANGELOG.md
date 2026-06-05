# Changelog

All notable changes to WebFlash are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Imported the five full-composition fan-control room-bundle previews
  (WF-IMPORT-FAN-BUNDLES-001).** Imported `Ceiling-POE-VentIQ-FanPWM-RoomIQ`,
  `Ceiling-POE-VentIQ-FanDAC-RoomIQ`, `Ceiling-POE-AirIQ-FanRelay-RoomIQ`,
  `Ceiling-POE-AirIQ-FanDAC-RoomIQ`, and `Ceiling-POE-AirIQ-FanPWM-RoomIQ` from the
  upstream `sense360store/esphome-public` `v1.0.0-preview` release (release id
  333373906) as Advanced-install-only preview builds, authorised by upstream
  `ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001` (`webflash_import_eligibility.eligible=true`).
  Added five `firmware/sources.json` entries (channel `preview`, pinned
  `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the five `.bin` +
  `.meta.json` sidecars via the preview-eligible import automation (each SHA-256
  verified against the upstream `checksums-sha256.txt` and the pinned value), and
  regenerated `manifest.json` (9 → **14 builds**) + `firmware-*.json`. Mirrored the
  five rows into `__tests__/fixtures/esphome-product-catalog.json` (status
  `hardware-pending` + the eligibility block) and rebaselined the build-count /
  source-list / readiness test pins from 9 to 14 builds. Import-proof at
  [`docs/fan-bundle-preview-import-proof.md`](docs/fan-bundle-preview-import-proof.md).
  **Import-only:** no kit card added (`scripts/data/kits.json` stays at six;
  surfacing is the follow-up `WF2-FAN-EXPANSION-001`), no install gate / engine /
  view / `scripts/install.js` change, `REQUIRED_CONFIGS` unchanged
  (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), the stable
  Bathroom PoE build and all previously imported builds byte-identical in
  signature and hash (only provenance fields refreshed), and the
  `fandac_conflicts_with_airiq` mutex unchanged. TRIAC not imported; FanTRIAC stays
  build-blocked. `FANDAC-I2C-ADDR-001` stays pending — no FanDAC address claimed
  physically verified. No hardware / bench / compliance / safety /
  commercial-availability proof claimed.

### Removed
- **WebFlash 1.0 view decommissioned; WebFlash 2.0 is the only view (PR 13).**
  The final step of the WebFlash 2.0 migration. After the GA cutover (PR 12)
  soaked a stable release, the `?ui=1` rollback and the entire 1.0 render layer
  were removed, and the 2.0 view was folded from `webflash-2/` into the repo
  root, so the 2.0 redesign is now the single installer view at the site root.
  Removed the dual-view machinery (`scripts/ui-version.js` and the `?ui` branch in
  `scripts/bootstrap.js`, which now always mounts `scripts/shell.js`), the 1.0
  entry points (the repo-root `app.js` and `ui.js`), every 1.0-only render module
  (`kit-mode`, `kit-presets`, `navigation`, `recommended-bundle`, `simple-install`,
  `theme-toggle`, `wizard-state-observer`, `compat-config`, `init-review`,
  `ui-capability-bar`, `prefs`, `build-info`, the `scripts/layout/*` panels except
  the reused `rescue-modal` / `error-log-modal` / `freshness-banner`, the four
  UI-only `scripts/services/*`, the `scripts/data/{kit-presets,simple-bundles,fan-bundle-import-readiness}.js`
  and `scripts/content/option-tooltips.js` data modules, and
  `scripts/utils/{esp-web-tools-overrides,preset-storage,qr-code}.js`), and the 1.0
  wizard markup from `index.html` (now a minimal 2.0 shell). Folded
  `webflash-2/scripts/*` into `scripts/`, `webflash-2/app.css` to `app.css`, and
  `webflash-2/assets/` to `assets/`. Rebuilt `sw.js` (`CACHE_NAME` to
  `webflash-v16`, precache list rewritten for the single-view module graph) and
  bumped the cache-bust token to `202606043`. The **engine and the trust model are
  unchanged**: no firmware, `manifest.json`, `firmware/sources.json`,
  `REQUIRED_CONFIGS`, kit, release-channel, provenance, freshness, or install-gate
  logic changed, and the kept `css/*.css` sheets remain because the reused rescue
  and error-log modals render with them. Removed the obsolete 1.0 and dual-view
  Jest suites and rebased the `wf2-*` view suites onto the folded `scripts/` paths.

### Added
- **Live Simple-install bundle-picker smoke verification (WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001).**
  Docs + test only — verifies the **current deployed** Simple-install end-state
  after the bundle picker (`WF-EASY-BUNDLE-PICKER-001`) and the import-gated
  fan-control expansion (`WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001`) landed, and
  after the standalone FanRelay / FanPWM / FanDAC manual-previews were imported.
  Added the consolidated current-state checklist at
  [`docs/live-smoke-easy-bundle-picker-current.md`](docs/live-smoke-easy-bundle-picker-current.md)
  and the deterministic guard
  [`__tests__/wf-easy-bundle-picker-live-smoke.test.js`](__tests__/wf-easy-bundle-picker-live-smoke.test.js),
  pinned against the live `manifest.json` (9 builds): all six base bundles resolve
  to a live build with the stable `S360-KIT-BATH-P` (`Ceiling-POE-VentIQ-RoomIQ`)
  as the default / recommended / only default-selectable choice; the Bathroom
  Relay base card (`Ceiling-POE-VentIQ-FanRelay-RoomIQ`) is import-ready and
  visible; the five fan-control **expansion** configs
  (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `Ceiling-POE-VentIQ-FanDAC-RoomIQ`,
  `Ceiling-POE-AirIQ-FanRelay-RoomIQ`, `Ceiling-POE-AirIQ-FanPWM-RoomIQ`,
  `Ceiling-POE-AirIQ-FanDAC-RoomIQ`) are absent so `getExposableFanControlBundles`
  is empty (declared-but-hidden); a synthetic manifest exposes a fan card only on
  its exact full-composition config; the standalone `Ceiling-POE-FanPWM` /
  `Ceiling-POE-FanDAC` previews present in the manifest never become a Simple card;
  TRIAC is absent everywhere; the stable build has no channel-ack / freshness
  false-blocker; preview bundles stay `channel:preview`-gated. Added the
  smoke-record section to `docs/sense360-webflash-status.md` and the queue rows in
  `UPCOMING_PR.md`. **No firmware imported, no runtime surface changed** —
  `manifest.json` (9 builds), `firmware/sources.json`, `REQUIRED_CONFIGS`,
  `scripts/data/kits.json`, `scripts/data/simple-bundles.js`,
  `scripts/simple-install.js`, `index.html`, `sw.js`, and every workflow are
  byte-identical. No hidden fan-control card exposed, no standalone fan / TRIAC
  card exposed, no preview made stable / recommended / default, no acknowledgement
  weakened.
- **Fan-control room bundles in Simple install (WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001).**
  Declared and **import-gated** the five full-composition fan-control room
  bundles from upstream `ROOM-BUNDLE-FAN-CONFIGS-001` (esphome-public #713):
  `S360-KIT-BATH-P-PWM` (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`), `S360-KIT-BATH-P-DAC`
  (`Ceiling-POE-VentIQ-FanDAC-RoomIQ`), `S360-KIT-KITCHEN-P-REL`
  (`Ceiling-POE-AirIQ-FanRelay-RoomIQ`), `S360-KIT-KITCHEN-P-PWM`
  (`Ceiling-POE-AirIQ-FanPWM-RoomIQ`), and `S360-KIT-KITCHEN-P-DAC`
  (`Ceiling-POE-AirIQ-FanDAC-RoomIQ`). Added `FAN_CONTROL_BUNDLES` plus the
  import-readiness gate (`isFanControlBundleImportReady` /
  `getExposableFanControlBundles` / `isFullRoomBundle` / `validateFanControlBundle`
  / `bundleRequiresDacAddressAcknowledgement`) to
  [`scripts/data/simple-bundles.js`](scripts/data/simple-bundles.js); a
  fan-control card is exposed **only** when its exact firmware `config_string` is
  present in the live `manifest.json`. Extended
  [`scripts/simple-install.js`](scripts/simple-install.js) to inject import-ready
  fan-control cards into the picker and to AND a third **analog-fan
  address-switch** acknowledgement (GP8403 IC1 `0x58` / IC2 `0x5A`; `0x59`
  forbidden) into the authoritative pre-flash gate alongside the fan-control
  acknowledgement; added the staged `[data-simple-bundle-dac-address]` region to
  [`index.html`](index.html); published the live manifest config-string set as the
  additive `window.webflashManifestConfigStrings` global from
  [`scripts/state.js`](scripts/state.js). Bumped `CACHE_NAME` (`webflash-v13`), the
  cache-bust token (`202606016`), and the app-shell marker (`2026-06-01-6`). Added
  [`__tests__/wf-easy-bundle-picker-fan-expansion.test.js`](__tests__/wf-easy-bundle-picker-fan-expansion.test.js)
  and [`docs/live-smoke-easy-bundle-picker-fan-expansion.md`](docs/live-smoke-easy-bundle-picker-fan-expansion.md);
  updated `docs/live-smoke-easy-bundle-picker.md`,
  `docs/webflash-import-readiness-matrix.md`, `docs/sense360-webflash-status.md`,
  and `UPCOMING_PR.md`. **No firmware imported** — upstream #713 published no
  artifact (compile-pending), so today the gate returns nothing and the picker
  shows exactly the six base bundles. `manifest.json` (9 builds),
  `firmware/sources.json`, `REQUIRED_CONFIGS`, `scripts/data/kits.json`, and the
  install / preflight / provenance / signature / freshness engines are unchanged.
  TRIAC stays excluded; the FanDAC address switch (`FANDAC-I2C-ADDR-001`) is not
  claimed physically verified. No preview bundle made stable / default /
  recommended / buyable; no hardware / bench / compliance / safety /
  commercial-availability proof claimed.
- **Simple-install bundle picker (WF-EASY-BUNDLE-PICKER-001).** Turned the
  default **Simple install** view from a single fixed Bathroom PoE path into an
  easy **bundle picker** over the supported customer bundle products. The stable
  Bathroom PoE bundle (`Ceiling-POE-VentIQ-RoomIQ`) stays the default +
  recommended choice; the imported preview room bundles now appear behind clear
  **Preview** labels and the existing acknowledgement gates. Added a presentation-
  only bundle data source
  ([`scripts/data/simple-bundles.js`](scripts/data/simple-bundles.js)) describing
  six customer bundle choices — `S360-KIT-BATH-P` (Bathroom — PoE, **stable /
  default**), `S360-KIT-KITCHEN-P` (`Ceiling-POE-AirIQ-RoomIQ`),
  `S360-KIT-BEDROOM-P` (`Ceiling-POE-RoomIQ`), `S360-KIT-LIVING-P` and
  `S360-KIT-CORRIDOR-P` (both `Ceiling-POE-RoomIQ-LED`), and `S360-KIT-BATH-P-REL`
  (`Ceiling-POE-VentIQ-FanRelay-RoomIQ`, **preview + fan-control acknowledgement**)
  — each carrying its display name, room/use-case, firmware config string,
  channel, badges, module summary, default/recommended flags, preview- and
  fan-control-acknowledgement requirements, buyable/shop-ready flag, and warning
  copy. Selecting a card feeds the bundle's `wizardState` through the same
  `setState()` the wizard/kit flows use, so Step 5 resolves the matching firmware
  and **every install gate stays authoritative**: preview bundles still require
  the `channel:preview` acknowledgement in
  [`scripts/utils/release-channels.js`](scripts/utils/release-channels.js), and
  the Bathroom Relay bundle additionally requires a **fan-control acknowledgement**
  composed (AND-ed) into the authoritative `[data-preflash-acknowledge]` gate so
  install stays blocked until both are complete. Reworked the
  [`index.html`](index.html) Simple-install section to lead with "Choose your
  Sense360 kit" + the six bundle cards (technical metadata stays collapsed in the
  Technical details disclosure), extended
  [`scripts/simple-install.js`](scripts/simple-install.js) with the picker
  controller, added bundle-picker styles to
  [`css/wizard-style.css`](css/wizard-style.css), registered
  `scripts/data/simple-bundles.js` in `sw.js` `SCRIPT_MODULES`, and bumped the
  cache-bust token + `CACHE_NAME` (`webflash-v12`). Added
  [`__tests__/wf-easy-bundle-picker.test.js`](__tests__/wf-easy-bundle-picker.test.js)
  and the live-smoke checklist
  [`docs/live-smoke-easy-bundle-picker.md`](docs/live-smoke-easy-bundle-picker.md).
  **Unchanged:** every firmware binary, `manifest.json` (still 9 builds),
  `firmware/sources.json`, `REQUIRED_CONFIGS`
  (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only),
  `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js`,
  `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the
  provenance / signature / freshness / preflight engines, and the FanTRIAC build
  block. The standalone `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` previews and
  TRIAC are intentionally **not** room-bundle products and never appear in Simple
  install. No firmware imported. No hardware / bench / compliance / safety /
  commercial-availability proof claimed.
- **Preview-eligible firmware import automation + FanDAC import
  (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001).** Added a guarded automation path
  ([`scripts/import-preview-eligible-sources.py`](scripts/import-preview-eligible-sources.py))
  that replaces the one-off, per-family preview imports
  (WF-PREVIEW-IMPORT-FIRST-BATCH-001 / WEBFLASH-RELAY-001 / WEBFLASH-PWM-001) with
  one discoverable, idempotent pass. It discovers every upstream catalog entry
  carrying `webflash_import_eligibility.eligible=true` (FanRelay / FanPWM /
  FanDAC), cross-checks the pinned `firmware/sources.json` source + on-disk state,
  and imports the missing ones behind uniform guardrails: eligibility flag,
  `preview` / `manual-preview` channel only (stable refused), **mandatory**
  `expected_sha256` pin, upstream `checksums-sha256.txt` match (delegated to the
  unchanged single-source importer), TRIAC refusal (even if flagged, absent an
  explicit `triac_preview_import_allowed` opt-in), overwrite protection (never
  overwrites an on-disk `.bin` with different bytes), idempotency, and a
  `REQUIRED_CONFIGS`-unchanged assertion. Used the automation to import the last
  eligible fan-driver preview, `Ceiling-POE-FanDAC`
  (`Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin`, SHA256 `151894c1…a39b9f`,
  930,400 bytes), as an **Advanced-install-only, preview / manual-preview**
  option from the shared `sense360store/esphome-public` `v1.0.0-preview` release.
  Added a `firmware/sources.json` source entry (`channel: preview`, pinned
  `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the `.bin` +
  `.meta.json` sidecar, and regenerated `manifest.json` (8 → **9 builds**) +
  `firmware-*.json`. `Sense360 DAC` (S360-312) moves from `no-firmware` to
  `available-preview` in `scripts/utils/module-availability.js` with a bespoke
  installer/developer-preview warning (0–10V analog fan control); the FanDAC ↔
  AirIQ DAC-bus mutex is unchanged. Added a 23-test Python suite
  (`__tests__/python/test_import_preview_eligible_sources.py`) and the full
  import-proof at `docs/preview-import-automation-proof.md`. **Unchanged:** Simple
  install (still stable Bathroom PoE `Ceiling-POE-VentIQ-RoomIQ` only),
  `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only),
  `scripts/data/kits.json` / `kit-presets.js`, `scripts/import-firmware-sources.py`
  (reused unchanged), the FanTRIAC block, the WF-LED-003 preview acknowledgement
  model, and every install / preflight / freshness gate. **No FanTRIAC imported;
  no hardware / bench / compliance / safety / commercial-availability proof
  claimed.**
- **FanPWM preview firmware import (WEBFLASH-PWM-001).** Imported the upstream
  `Ceiling-POE-FanPWM` manual-preview firmware from the shared
  `sense360store/esphome-public` `v1.0.0-preview` release (SHA256
  `4ef9f353…c59926`, 950,720 bytes) as an **Advanced-install-only, preview /
  manual-preview** option. Same upstream two-concept eligibility model as
  FanRelay: upstream PR #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`) set
  `webflash_import_eligibility.eligible=true` in
  `config/preview-release-targets.json` while keeping the catalog status
  `hardware-pending` and `webflash_build_matrix=false`. Added a
  `firmware/sources.json` source entry (`channel: preview`, pinned
  `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the `.bin` +
  `.meta.json` sidecar, and regenerated `manifest.json` (7 → **8 builds**) +
  `firmware-*.json`. `Sense360 PWM` (S360-311) moves from `no-firmware` to
  `available-preview` in `scripts/utils/module-availability.js` with a bespoke
  installer/developer-preview warning (low-voltage / DC fan control). The
  catalog-alignment guard and the readiness validator already recognise the
  `webflash_import_eligibility.eligible` signal (from WEBFLASH-RELAY-001), so the
  FanPWM fixture row rides the existing manual-preview lane — import / manifest /
  kit eligible, **never** `REQUIRED_CONFIGS` (production-only). Full import-proof
  record at `docs/fanpwm-preview-import-proof.md`. **Unchanged:** Simple install
  (still stable Bathroom PoE `Ceiling-POE-VentIQ-RoomIQ` only), `REQUIRED_CONFIGS`
  (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` /
  `kit-presets.js`, the FanTRIAC block, the WF-LED-003 preview acknowledgement
  model, and every install / preflight / freshness gate. **No FanDAC / FanTRIAC
  imported; no hardware / bench / compliance / safety / commercial-availability
  proof claimed.**
- **FanRelay preview firmware import (WEBFLASH-RELAY-001).** Imported the upstream
  `Ceiling-POE-VentIQ-FanRelay-RoomIQ` manual-preview firmware from the shared
  `sense360store/esphome-public` `v1.0.0-preview` release (SHA256
  `f9600a6b…d026ca4`, 989,840 bytes) as an **Advanced-install-only, preview /
  manual-preview** option. The import was authorised by upstream PR #711
  (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`), which set
  `webflash_import_eligibility.eligible=true` in
  `config/preview-release-targets.json` while keeping the catalog status
  `hardware-pending` and `webflash_build_matrix=false`. Added a
  `firmware/sources.json` source entry (`channel: preview`, pinned
  `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the `.bin` +
  `.meta.json` sidecar, and regenerated `manifest.json` (6 → **7 builds**) +
  `firmware-*.json`. `Sense360 Relay` (S360-310) moves from `design-pending` to
  `available-preview` in `scripts/utils/module-availability.js` with a bespoke
  installer/developer-preview warning. Taught the catalog-alignment guard
  (`__tests__/product-catalog-alignment.test.js`) and the readiness validator
  (`scripts/validate-product-import-readiness.js`) to recognise the new
  `webflash_import_eligibility.eligible` signal for import / manifest / kit
  eligibility — **never** for `REQUIRED_CONFIGS` (production-only) and **never**
  when `eligible !== true` (FanTRIAC stays rejected). Full import-proof record at
  `docs/fanrelay-preview-import-proof.md`. **Unchanged:** Simple install (still
  stable Bathroom PoE `Ceiling-POE-VentIQ-RoomIQ` only), `REQUIRED_CONFIGS`
  (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` /
  `kit-presets.js`, the FanTRIAC block, the WF-LED-003 preview acknowledgement
  model, and every install / preflight / freshness gate. **No FanPWM / FanDAC /
  FanTRIAC imported; no hardware / bench / compliance / safety /
  commercial-availability proof claimed.**
- **Live preview-import smoke checklist (WF-LIVE-SMOKE-PREVIEW-IMPORT-001).**
  Added a live / manual smoke checklist at `docs/live-smoke-preview-import.md`
  (with a manual verification template) to verify the deployed GitHub Pages site
  after the first preview firmware batch: Simple install stays clean and
  stable-only (`Ceiling-POE-VentIQ-RoomIQ`, no false freshness block, no AirIQ /
  room-bundle preview leakage) while Advanced install can reach the new preview
  builds (`Ceiling-POE-AirIQ-RoomIQ`, `Ceiling-POE-RoomIQ`,
  `Ceiling-POE-RoomIQ-LED`) behind the `channel:preview` acknowledgement with
  working in-card release notes. Locked the deterministic invariants in
  `__tests__/live-smoke-preview-import.test.js` (exactly six manifest builds,
  preview builds Advanced-only and acknowledgement-gated, Simple install
  resolves only to the stable Bathroom PoE build, preview release notes present
  and not dead links, no TRIAC / fan-driver firmware imported, AirIQ availability
  derived from the manifest, the existing VentIQ LED preview preserved, Rescue
  still reachable). Docs + test only: no firmware imported, no Simple-install
  default changed, no preview made recommended/default/stable, no candidate
  bundle exposed as buyable, no provenance / signature / freshness check
  weakened, no preview warning removed.
- **First preview firmware batch (WF-PREVIEW-IMPORT-FIRST-BATCH-001).** Imported
  three preview-channel builds from upstream `sense360store/esphome-public`
  release `v1.0.0-preview`: `Ceiling-POE-AirIQ-RoomIQ` (SHA256 `16565de6…`,
  1,089,296 bytes), `Ceiling-POE-RoomIQ` (`2c7d691c…`, 956,976 bytes), and
  `Ceiling-POE-RoomIQ-LED` (`d4f18824…`, 1,006,848 bytes). Each `.bin` was
  SHA-256-verified against the upstream `checksums-sha256.txt` and the source
  entry's pinned `expected_sha256`; provenance (upstream git sha
  `2228bbb7…`, ESPHome `2026.4.5`, compile run `26821900127`) is recorded in
  each `.meta.json` sidecar. `manifest.json` grew from 3 to 6 builds and AirIQ
  now derives `available-preview` (the static `no-firmware` override was
  removed). The three previews are **Advanced-install-only** behind the
  `channel:preview` acknowledgement — not stable, not recommended, not a
  customer default, not in `REQUIRED_CONFIGS`, not a kit, not buyable; they are
  firmware-build proof only (no hardware / bench / compliance /
  commercial-availability proof). Simple install still resolves only to the
  stable Bathroom PoE build `Ceiling-POE-VentIQ-RoomIQ`. No TRIAC or fan-driver
  (FanRelay / FanPWM / FanDAC) firmware was imported, and the existing
  `v1.0.0-led-preview` build is unchanged.
- Cross-repo firmware importer: `scripts/import-firmware-sources.py` pulls
  raw `.bin` assets from `sense360store/esphome-public` GitHub Releases,
  verifies SHA256 against the upstream `checksums-sha256.txt`, parses the
  release body's `## Changelog` / `## Known Issues` / `## Features` /
  `## Hardware Requirements` sections, and writes a WebFlash sidecar with
  full source provenance (`source_repo`, `release_tag`, `release_url`,
  `source_asset_name`, `source_asset_sha256`, `source_manifest_git_sha`,
  `source_manifest_esphome_version`, `imported_at`).
- Declarative source manifest at `firmware/sources.json` (schema_version 1).
  Release-One source: `sense360store/esphome-public@v1.0.0`, config
  `Ceiling-POE-VentIQ-RoomIQ`, with `block_tokens: ["FanTRIAC", "LED"]`.
- `.github/workflows/firmware-import.yml` — manual `workflow_dispatch`
  workflow that runs the importer, regenerates manifests, and auto-commits
  to the dispatching branch. Does not auto-merge and does not deploy.
- Ed25519-signed Release-One firmware entry `Ceiling-POE-VentIQ-RoomIQ`
  v1.0.0 imported from upstream esphome-public release (1,087,488 bytes,
  SHA256 `9169f2ce486d14d3c0e0b1d6e9adf558480db6ec301f8eac1622fda4d7ceffcc`).
- Python unit tests (`__tests__/python/test_import_firmware_sources.py`,
  20 cases) covering: missing asset, wrong filename, tiny `.bin`, checksum
  mismatch, missing release-body section, blocked FanTRIAC, blocked LED,
  happy path, dry-run, sidecar provenance.
- Jest smoke test (`__tests__/manifest-required-configs.test.js`) asserting
  `manifest.json` contains the imported `Ceiling-POE-VentIQ-RoomIQ` build.
- Content Security Policy (CSP) headers for enhanced security
- JSDoc documentation for key JavaScript modules
- CHANGELOG.md for tracking release history
- Service worker for offline caching support
- Improved browser compatibility messaging

### Security
- Added X-Frame-Options, X-Content-Type-Options, and X-XSS-Protection headers
- Implemented strict Referrer-Policy

### Changed
- **WebFlash 2.0 GA cutover (PR 12).** The 2.0 view is now the production default
  at the site root. PR 11 had introduced `scripts/ui-version.js` with a host-aware
  `resolveUiVersion(search, hostname)` (production defaulted to the 1.0 view, beta
  surfaces to the 2.0 view); the cutover flips the production surface default to
  the 2.0 view too, so `resolveUiVersion` now returns the 2.0 view as the default
  on every surface, with `?ui=1` kept as the one release rollback override (a
  later PR removes the dual view). `scripts/bootstrap.js` still delegates to
  `resolveUiVersion`; both views run at the same origin and share the same Content
  Security Policy, service worker, manifest, and install gate, so no gate is
  weakened: provenance, channel acknowledgement, SHA-256 verification, manifest
  freshness, service worker update, and installability stay engine owned and are
  enforced identically in both views. Bumped `sw.js` `CACHE_NAME` to `webflash-v15`
  (the existing `activate` handler still purges every non-current `webflash-*`
  cache) and the shared cache-bust token to `202606042` in lockstep across
  `index.html`, `scripts/bootstrap.js`, `app.js`, `scripts/build-info.js`, and the
  `webflash-app-shell` marker (`2026-06-04-2`) so the changed tokenless resolver is
  never served stale. Updated `__tests__/wf2-beta-default.test.js` for the flipped
  production default and added `__tests__/wf2-ga-cutover.test.js` pinning the
  cutover (production defaults to 2.0, `?ui=1` fallback), the `webflash-v15` floor,
  the token lockstep, and the unchanged activate purge and per-asset-class fetch
  strategy. The migration docs named `webflash-v5`, but the WF-UX and
  bundle-picker work churned the live cache to `webflash-v13` and PR 11 took
  `webflash-v14`, so the cutover lands at `webflash-v15`. No firmware,
  `manifest.json`, `firmware/sources.json`, `REQUIRED_CONFIGS`, kit,
  release-channel, or install-gate logic changed. Merging the cutover to
  production stays gated on the PR 11 beta dogfood and clean S360-410 PoE flash
  evidence, which is a manual hardware step.
- `Ceiling-POE-VentIQ-RoomIQ` added to the `REQUIRED_CONFIGS` allowlist in
  `.github/workflows/firmware-publish.yml`. The 9 pre-existing required
  configs are unchanged; pruning stale entries is tracked as a separate
  cleanup/audit PR.
- Removed 8 stale legacy configs (`Ceiling-POE-AirIQ`,
  `Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`,
  `Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`, `Ceiling-Voice-POE-AirIQ`,
  `Ceiling-Voice-USB`) from `REQUIRED_CONFIGS` in
  `.github/workflows/firmware-publish.yml`. The publish guard now tracks
  Release-One (`Ceiling-POE-VentIQ-RoomIQ`) and `Rescue` only — the two
  configs backed by a real signed `.bin` on disk. Manifest pruning of the
  matching stale builds is deferred to a follow-up cleanup PR.
- Retired legacy module variants were removed from manifests and distribution artifacts.

### Fixed
- Manifest freshness no longer reports a false `missing-generated-at` warning on
  a full page refresh directly into the review step (`step=5`). New browser
  DevTools HAR evidence (refresh straight into `step=5`) confirmed
  `/WebFlash/manifest.json` is fetched successfully, returns HTTP 200 JSON with a
  top-level `generated_at`, that a second request to the same URL also returns
  valid JSON with `generated_at`, and that a manual "Check for update again"
  succeeds — so this was neither a bad manifest file nor a missing `generated_at`
  in the deployed root manifest. The remaining cause was a **startup
  ordering/race**: the review-step freshness trigger could run before the loaded
  manifest metadata had been captured, so the comparison ran against null loaded
  metadata. A manual recheck worked only because the manifest had already loaded
  by then. Fixes:
  - `checkManifestFreshnessNow()` now **awaits the in-flight manifest load**
    (`manifestLoadPromise`, or starts a load) and re-captures the loaded metadata
    before running the comparison whenever the metadata is missing and the load
    has not definitively failed. A load that has already failed is left alone so
    the recheck still surfaces the real `missing-loaded-generated-at` error
    instead of silently re-fetching.
  - `triggerManifestFreshnessCheckIfNeeded()` no longer pre-marks the check as
    run; `manifestFreshnessHasRun` flips only once `checkManifestFreshnessNow()`
    has a real fetch/check result, so a premature, still-loading invocation can
    no longer latch the gate and block the real check from ever running.
  - A new `manifest-load-pending` reason code distinguishes a transient
    still-loading state from the definitive `missing-loaded-generated-at`,
    `missing-fetched-generated-at`, and `missing-both-generated-at` diagnoses; it
    does not latch a verdict.
  - The initial refresh and a manual "Check for update again" now produce the
    same freshness result; stale still hard-blocks and a failed manifest load
    still reports a real error.
- Root manifest freshness check no longer reports a false
  `missing-generated-at` warning on the live Simple install. Browser DevTools
  HAR capture confirmed the deployed `/WebFlash/manifest.json` is valid JSON
  with a top-level `generated_at` and `source_commit`, so the warning was a
  loaded-metadata bug, not bad published content. Fixes:
  - `loadManifestData()` now captures the root manifest's top-level metadata
    (`generated_at`, `manifest_version`, `source_commit`) on **every**
    successful load (initial, force reload, retry-success) — previously this
    capture was reachable only via test hooks, so production never recorded a
    loaded timestamp for the recheck to compare against.
  - A load that exhausts its retries now **clears** the captured metadata so a
    failed reload can never leave stale data that falsely reads as `current`;
    the freshness fallback resolves to `unknown` (non-blocking) instead.
  - The freshness probe targets the absolute `/WebFlash/manifest.json` on
    GitHub Pages (instead of a relative path that can misresolve to the domain
    root), tolerates a nested `manifest.generated_at` envelope in addition to
    the canonical top-level field, and attaches explicit diagnostics (fetched
    URL, HTTP status, content-type, top-level keys, top-level/nested
    `generated_at` presence, selected timestamp source) to every verdict.
  - The opaque `missing-generated-at` reason code is split into
    `missing-loaded-generated-at` / `missing-fetched-generated-at` /
    `missing-both-generated-at` so the failing side is named.

  A root manifest with a valid `generated_at` now resolves to
  `current`/`same-or-newer` (no firmware-list warning); unknown freshness
  remains non-blocking, stale still hard-blocks, and fetch/HTTP/parse failures
  remain individually diagnosed.

## [2.0.0] - 2025

### Added
- Complete documentation rewrite with comprehensive guides
- Improved ESP Web Tools compliance (upgraded to v10)
- Enhanced landing page with path selector for pre-built vs custom firmware
- Unified landing experience with firmware path options
- ESPHome public repository link for custom firmware builds
- Visual feedback for module conflicts

### Changed
- Updated firmware card layout and styling
- Improved install assumption messaging for missing modules
- Enhanced pre-flash acknowledgement warning styling
- Better synchronization of review summary visibility with step transitions

### Fixed
- Wizard initialization on already-loaded documents
- Firmware controls label updates
- Firmware integrity verification order
- Ready helper text wrapping for multi-line content

## [1.0.0] - 2024

### Added
- Initial release of WebFlash firmware configuration tool
- Step-by-step wizard interface (Mounting, Power, Modules, Review)
- Support for Wall and Ceiling mounting configurations
- Power source options: USB, POE, PWR
- Module support: AirIQ (Base/Pro), Fan (PWM/Analog)
- Hardware compatibility validation and conflict detection
- Direct install via URL parameters
- Sharable configuration links
- Pre-flash safety checklist and diagnostics
- Firmware integrity verification (SHA256, MD5)
- ESP Web Tools integration for browser-based flashing
- Improv Serial protocol support for Wi-Fi setup
- Browser capability detection (Web Serial, Web USB)
- Automated manifest generation from firmware binaries
- GitHub Actions CI/CD for deployment to GitHub Pages
- Comprehensive error handling and user feedback
- XSS prevention with HTML escaping throughout

### Security
- Input validation for all URL parameters
- Firmware signature verification
- No external runtime dependencies
