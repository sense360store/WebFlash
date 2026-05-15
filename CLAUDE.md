# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

WebFlash is a static, browser-based firmware installer for Sense360 ESP32 hubs. The site is a single page that drives ESP Web Tools via Web Serial; there is no application server and no bundler. It is published to GitHub Pages from the repository root.

The codebase has two halves that meet at `manifest.json`:

1. A **publishing pipeline** (Python + GitHub Actions) that converts firmware binaries dropped under `firmware/` into `manifest.json` and per-build `firmware-N.json` files.
2. A **wizard frontend** (vanilla ES modules, no framework) that loads `manifest.json` at runtime, walks the user through a 5-step configuration, and hands a matching `firmware-N.json` to `<esp-web-install-button>`.

### Platform and standards

- **Follows the ESP Web Tools / esptool.js standard** for flashing ESP32 devices. The wizard renders the upstream `<esp-web-install-button>` component (loaded from unpkg) and consumes the standard ESP Web Tools manifest schema (`name`, `version`, `builds[].chipFamily`, `builds[].parts[].path`/`offset`, `improv`, etc.). Do not invent custom flash flows — extend behavior via the documented overrides surface (e.g. `checkSameFirmware` in `scripts/utils/esp-web-tools-overrides.js`) so the upstream component still drives connect/erase/write/verify.
- **Laptop / desktop only.** Web Serial is not available on iOS, Android Chrome, or any mobile browser, so WebFlash explicitly targets desktop Chromium-based browsers (Chrome, Edge, Opera) on Windows / macOS / Linux. Firefox and Safari are unsupported. Capability detection lives in `scripts/capabilities.js` and surfaces an unsupported-browser banner via `scripts/init-review.js`. Do not add mobile-first layout assumptions or features that imply mobile is a supported runtime — the install path will not work there.

## Sense360 hardware reference (canonical SKUs)

This is the **authoritative SKU list** for the supported hardware. The **Friendly name** column is the canonical user-facing label — use it verbatim in wizard markup, manifest descriptions, and module metadata. There is no Model/Variant axis: each SKU is its own product, and "Base / Pro" or model/variant terminology must be dropped when touching this code. The **Old name** column lists deprecated internal/historical names and exists only to help recognise legacy references; do not use these in new code.

| Group | Type | Friendly name | SKU | Rev | Old name | What it does |
|---|---|---|---|---|---|---|
| Ceiling | Hub | Sense360 Core | S360-100 | R4 | `360Core_Ceiling_V3_R` | Main board. Has the ESP32-S3 and connectors for all other modules. |
| Ceiling | Sensor | Sense360 RoomIQ | S360-200 | R4 | Presence + Comfort (two boards) | Merged board. PIR, LD2450, SEN0609, LTR-303ALS (light), SHT4x (temp and humidity), BMP581 (pressure). |
| Ceiling | Sensor | Sense360 AirIQ | S360-210 | R4 | `AirlQ Ceiling` (typo in old name) | Air quality board. CO2 (SCD41), VOC (SGP41), gas (MICS-4514 with STM8). Connectors for PM (SPS30) and HCHO (SFA30). |
| Ceiling | Sensor | Sense360 VentIQ | S360-211 | R4 | Bathroom Pro | Smaller air quality board for bathrooms. SGP41 on board. Connectors for IR temp and SPS30. |
| Ceiling | Indicator | Sense360 LED | S360-300 | R4 | LED Ring | Ring of WS2812B LEDs. |
| Inline | Driver | Sense360 Relay | S360-310 | R4 | `S360-Relay-C`, `Sense360 Fan Relay` | On / off relay for bathroom fans. |
| Inline | Driver | Sense360 PWM | S360-311 | R4 | `12vFan_PWM_PulseCounter`, `Sense360 Fan PWM` | 12V PWM fan driver, up to 4 fans with tach feedback. |
| Inline | Driver | Sense360 DAC | S360-312 | R4 | `Fan_GP8403`, `Sense360 Fan DAC` | 0 to 10V analog fan driver, for example Cloudlift S12. |
| Inline | Driver | Sense360 TRIAC | S360-320 | R4 | `TRIAC_Board` | Phase dimmer for mains fan or lamp. |
| Power | PSU | Sense360 240v PSU | S360-400 | R4 | PWR Module, `Sense360 Mains PSU` | 240V mains to 5V using HLK-5M05. |
| Power | PSU | Sense360 PoE PSU | S360-410 | R4 | PoE Module | PoE to 5V. |

Notes:

- The current wizard exposes Ceiling mount only; a "Wall" branch lingers in markup/legacy aliases but is not a supported product.
- **Wizard coverage of the table:** the sensor/driver/indicator SKUs are *separately selectable* via `scripts/data/module-requirements.js` (RoomIQ S360-200, AirIQ S360-210, VentIQ S360-211, LED S360-300, Relay S360-310, PWM S360-311, DAC S360-312, TRIAC S360-320). Nothing is bundled — each SKU is its own product, and the user picks every module they have. The Core (S360-100) is the one exception: it is implicit because every flashable device is a Core. The 240v PSU (S360-400) and PoE PSU (S360-410) are surfaced through the `power` selection (`pwr` / `poe`) rather than as their own module entries. When introducing a new *selectable* SKU, add it to `module-requirements.js` and update the wizard SKU labels in `state.js` (`MODULE_LABELS`, `MODULE_VARIANT_LABELS`, `MODULE_SEGMENT_FORMATTERS`) — do not regress to model/variant nomenclature, and do not describe any SKU as "bundled".

## Commands

```bash
# Tests (Jest with experimental ESM VM modules — required because the codebase is pure ESM)
npm test
npm test -- url-config                  # filter by name
npm test -- __tests__/wizard-state.test.js
npm test -- --watch

# Naming-policy validator (also runs in CI before manifest generation)
npm run validate:naming-policy
# or directly:
node scripts/validate-naming-policy.js firmware/configurations

# Regenerate manifest.json + firmware-*.json after adding/removing firmware
python3 scripts/gen-manifests.py --summary
python3 scripts/gen-manifests.py --summary --dry-run    # preview without writing

# Local dev server (no build step — open in Chrome/Edge/Opera; Web Serial is required)
python3 -m http.server 5000
```

There is no lint or typecheck step. CI runs `npm test -- --ci` with `continue-on-error: true` (the suite is being cleaned up — do not skip hooks/flags to bypass). The Python publishing scripts have no test suite.

## Architecture

### Wizard frontend (entry: `app.js`)

`app.js` imports each wizard module exactly once and registers the service worker. The order in `app.js` matters — `state.js` must load before modules that read state, and `error-log.js` is imported early via `state.js` to capture manifest-load failures.

`scripts/state.js` (~5000 lines) is the **central state module** and the source of truth. It owns:

- The wizard configuration object (`mounting`, `power`, `bathroom`, plus module keys `voice`, `led`, `airiq`, `fan`, `ventiq`).
- Step gating via `getMaxReachableStep()` — step 2 unlocks once `mounting` is set, step 3 once `power` is set, etc.
- Manifest loading, parsing of `config_string` values like `"Ceiling-POE-VentIQ-RoomIQ"` back into wizard state (`parseConfigStringState`), and matching builds to the current selection.
- The Step 5 preflight engine (`evaluatePreflightPolicy`) and connection-quality metrics fed by `navigator.serial` connect/disconnect events and ESP Web Tools `state-changed` events.
- All install/download gating: install only fires when no preflight `Fail` exists, the **Before you flash** checkbox is checked, and any `Warning` is acknowledged.

It exports a small surface (`getState`, `setState`, `replaceState`, `getStep`, `setStep`, `getMaxReachableStep`, `getTotalSteps`) and a `__testHooks` bundle used exclusively by Jest.

Other notable pieces:

- `scripts/data/module-requirements.js` — hardware compatibility matrix (SKUs, headers, conflicts, `recommended`/`ceilingOnly`/`requiresBathroom` flags). **Constraint enforcement reads from this file**; keep it consistent with the canonical SKU table above and with the README option tables.
- `scripts/utils/url-config.js` — bidirectional parser for sharable config URLs. Maintains legacy aliases (e.g. `pwr` → `ac`, `BathroomAirIQ*` → `VentIQ`, fan `pwm` ↔ `base`) so old links still resolve. The wizard URL key `voice` historically maps to `core` in the URL alias set.
- `scripts/utils/esp-web-tools-overrides.js` — installs a `MutationObserver` that attaches a `checkSameFirmware` override to every `<esp-web-install-button>` so users see a warning when reflashing the same version reported via Improv.
- `scripts/recommended-bundle.js` — quick-start preset application; uses `getMaxReachableStep` to jump straight to step 4 when applying a preset.
- `scripts/utils/preset-storage.js` — JSON preset import/export with schema versioning; deprecated keys (`presence`, `comfort`) are stripped on read.
- `scripts/utils/flash-history.js` — flash attempts logged to `localStorage` for diagnostics; entries also strip deprecated keys.
- `sw.js` — service worker. Strategy is network-first for `*.bin` and `manifest.json`, stale-while-revalidate for everything else. **When you add new top-level scripts, add them to `STATIC_ASSETS` or `SCRIPT_MODULES` in `sw.js`** or they will not be available offline.
- `scripts/wizard-state-observer.js` — `window.WizardState` legacy observer that infers state from the DOM via a `MutationObserver`. Newer code reads from `state.js` directly; this exists for older inspector code that watches the DOM.

### Publishing pipeline

`scripts/gen-manifests.py` is the only way `manifest.json` and `firmware-*.json` should change — these files are **generated, not hand-edited**. It scans `firmware/`, parses each filename via the canonical pattern (see below), produces a single `manifest.json` with full per-build metadata (including hashes and a `config_string` like `Ceiling-POE-VentIQ-RoomIQ`), and writes one `firmware-<index>.json` per build (the standard ESP Web Tools per-product manifest format). The generated manifest must match the actual `.bin` files on disk — the `__tests__/manifest-health.test.js` guard (WF-CLEANUP-006) fails CI before deploy if any `manifest.json` or `firmware-*.json` build references a missing `.bin`, if a `firmware/configurations/*.bin` lacks its `.meta.json` sidecar, if the per-build manifests drift out of sync with `manifest.json`, if a blocked token (`FanTRIAC` globally, plus any `block_tokens` declared for a matching source in `firmware/sources.json`) reappears in a `config_string`, or if a `REQUIRED_CONFIGS` entry is missing from `manifest.json`.

New firmware that is meant to ship enters the tree through the cross-repo importer, not through hand-copying a `.bin` into `firmware/configurations/`. Declare the source in [`firmware/sources.json`](firmware/sources.json) and run [`scripts/import-firmware-sources.py`](scripts/import-firmware-sources.py) (or dispatch `.github/workflows/firmware-import.yml`) — the importer fetches the upstream `.bin` from `sense360store/esphome-public`, verifies its SHA256 against the upstream `checksums-sha256.txt`, enforces the per-source `block_tokens` allowlist, and writes the `<asset>.meta.json` sidecar. The Rescue firmware (built in-tree under `firmware/rescue/`) is the only sanctioned exception. See [`docs/firmware-import.md`](docs/firmware-import.md) for the full contract.

The Python script still carries a legacy `model` / `variant` code path for binaries placed outside `firmware/configurations/`, and `scripts/compat-config.js` keeps a matching frontend lookup (`createModelSignature`, `lookup.type === 'model'`) for legacy share-links that arrive with `?model=…&variant=…` parameters. **Treat both as deprecated** — do not introduce new firmware down that branch and do not extend Model/Variant metadata in new code. New SKUs and configurations belong in `firmware/configurations/` with the canonical `Sense360-...-vX.Y.Z-<channel>.bin` filename, identified by SKU/config-string only.

`scripts/validate-naming-policy.js` enforces:

- Canonical filename shape `Sense360-...-vX.Y.Z-(stable|preview|beta).(bin|md)`.
- Disallowed token migrations: `AirIQProv` → `AirIQPro`, `AirIQBase` → `AirIQ`, `BathroomAirIQ` → `Bathroom`, `FanAnalog` → `FanDAC`. Fan variants are now preserved as variant-specific tokens (`FanRelay`, `FanPWM`, `FanDAC`, `FanTRIAC`) so each driver SKU lands on a different firmware binary; the legacy generic `Fan` token must not be used in new firmware.
- Channel placement: only `*-stable.md` is allowed under `firmware/configurations/`. Preview/beta/dev release notes belong in `firmware/previews/`.

`.github/workflows/firmware-publish.yml` runs unit tests, the naming-policy validator, the manifest generator, and a `REQUIRED_CONFIGS` allowlist that fails the build if any of the expected `config_string` values are missing from `manifest.json`. The live array in the workflow file is the source of truth. **As of WF-CLEANUP-004 the allowlist holds exactly 2 entries — `Ceiling-POE-VentIQ-RoomIQ` (current Release-One, imported from `sense360store/esphome-public` v1.0.0) and `Rescue`** — i.e. the configs WebFlash can actually ship today, each backed by a real signed `.bin` on disk. The 8 legacy entries that used to live here (`Ceiling-POE-AirIQ`, `Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`, `Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`, `Ceiling-Voice-POE-AirIQ`, `Ceiling-Voice-USB`) were removed because none had a backing `.bin` or a `firmware/sources.json` source entry. Do **not** re-add any legacy `config_string` to `REQUIRED_CONFIGS` until a corresponding source entry has been imported via `scripts/import-firmware-sources.py`, the `.bin` + `.meta.json` sidecar are on disk, and the regenerated manifest reflects the new build.

Two related invariants travel with the allowlist and must not be regressed:

- **FanTRIAC stays blocked from Release-One.** `firmware/sources.json` carries `block_tokens: ["FanTRIAC", "LED"]` on the v1.0.0 source entry, the importer refuses to ingest a FanTRIAC-bearing asset, and the manifest-health guard fails CI if a `FanTRIAC` token ever reappears in a generated `config_string`. The orphan `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` was removed by WF-CLEANUP-002. Do not re-add FanTRIAC to Release-One or to `REQUIRED_CONFIGS` until the S360-320 hardware verification work lands. (FanTRIAC stays a *permitted filename token* for the naming-policy validator and a real SKU in the hardware table; the block is enforced at import + manifest-health time, not at the filename layer.)
- **LED stays excluded from Release-One.** Same `block_tokens` mechanism. Do not introduce an `LED` token into Release-One's `config_string` unless the source declaration is updated deliberately and a separate LED build is imported.

WF-PRODUCT-001 adds `__tests__/product-catalog-alignment.test.js` (with a vendored snapshot at `__tests__/fixtures/esphome-product-catalog.json`) which cross-checks `firmware/sources.json`, `manifest.json`, every `firmware-*.json`, the workflow's `REQUIRED_CONFIGS`, and `scripts/data/kits.json` against the upstream `sense360store/esphome-public` product lifecycle catalog. WebFlash-eligible statuses are `production` (required for `REQUIRED_CONFIGS`) and `preview` (also accepted for sources, manifests, and kits — relaxed from production-only by WF-LED-002 so the LED preview source can land alongside Release-One); `blocked`, `legacy-compatible`, `deprecated`, `removed`, `hardware-pending`, and `compile-only` all fail. `Rescue` is exempt by name. The fixture is the offline default; set `PRODUCT_CATALOG_PATH` to validate against a freshly downloaded upstream catalog. WF-PRODUCT-002 refreshed that fixture against the current upstream state — the upstream snapshot at refresh time held 33 products (1 production = `Ceiling-POE-VentIQ-RoomIQ`, 1 blocked = `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`, 0 preview, 31 legacy-compatible enumerated by upstream PRODUCT-002), no status WebFlash mirrors changed, no LED-bearing product appeared upstream, active WebFlash surfaces still resolve only to Release-One + Rescue, and FanTRIAC remains blocked / LED remains excluded from Release-One. WF-PRODUCT-003 refreshed the fixture again after upstream PRODUCT-009 promoted an LED-bearing sibling product (`Ceiling-POE-VentIQ-RoomIQ-LED`, `status: preview`, `channel: preview`, `version: 1.0.0`, `artifact_name: Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`, `webflash_build_matrix: true`) — the upstream snapshot now holds 34 products (1 production / 1 preview / 1 blocked / 31 legacy-compatible), the WF-PRODUCT-002 synthetic preview placeholder was removed and replaced with the real upstream LED preview row, and the alignment test gained an explicit `WF-PRODUCT-003 — upstream LED preview recognition` describe block that pins both halves of the awareness-but-non-exposure contract. WF-LED-001 is a docs-only follow-up that authors [`docs/led-preview-import-plan.md`](docs/led-preview-import-plan.md) capturing the future LED preview import shape — the upstream proof fields required before WebFlash may import, the future `firmware/sources.json` source entry's `block_tokens: ["FanTRIAC"]` (Release-One's source keeps `["FanTRIAC", "LED"]`), the import + manifest-regeneration sequence, the deferred UX / kit decisions, and the do-not-change list. WF-LED-001 imports no firmware, regenerates no manifests, modifies no `firmware/sources.json`, changes no `REQUIRED_CONFIGS`, and adds no LED UI or kit. WF-LED-002 then performs the import: upstream [`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview) shipped a proven LED preview artifact (SHA256 `93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`, 1,135,904 bytes, release body with all four canonical H2 sections), and WF-LED-002 added a second `firmware/sources.json` entry (`channel: preview`, `block_tokens: ["FanTRIAC"]`, pinned `expected_sha256`), imported the `.bin` + `.meta.json` sidecar, regenerated `manifest.json` (now 3 builds — Release-One stable + LED preview + Rescue) and the per-build manifests (`firmware-0.json` = Release-One, `firmware-1.json` = LED preview, `firmware-2.json` = Rescue after deterministic re-indexing). WF-LED-002 also hardened `scripts/import-firmware-sources.py` to enforce `expected_sha256` when present (backward compatible when absent). Unchanged by WF-LED-002: Release-One source entry, Release-One manifest build content, Rescue build content, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` — production-only), `scripts/data/kits.json` (still Release-One-only), every UI / wizard / `sw.js` / `index.html` / workflow file, and FanTRIAC blocked status under HW-005. The `WF-PRODUCT-003 — upstream LED preview recognition` describe block now asserts LED preview presence in `firmware/sources.json` + `manifest.json` and absence in `REQUIRED_CONFIGS` + `scripts/data/kits.json`. WF-LED-003 then resolved the deferred UX call with **Option A — manifest-only preview**: no new kit, no new mode toggle, no wizard / service-worker / workflow / signing / firmware / manifest / `firmware/sources.json` change. The exposure mechanism is the existing release-channel gate in `scripts/utils/release-channels.js` (`preview.defaultSelectable: false` so the LED build is never auto-selected even as the sole candidate, `preview.requiresAcknowledgement: true` so install gates on a `channel:preview` checkbox with experimental-build warning copy, `preview.hiddenByDefault: false` so the build is visible in normal mode without a `?mode=preview` toggle — `state.js`'s `VALID_RELEASE_MODES` stays `normal` / `recovery` / `development`) combined with the existing LED module toggle in step 4 of the wizard (`Sense360 LED` toggle in `index.html`, `led` module key wired into `MODULE_KEYS` / `MODULE_SEGMENT_FORMATTERS` / `parseConfigStringState` in `scripts/state.js`, and the `Sense360 LED` (S360-300) variant entry in `scripts/data/module-requirements.js`). With the LED toggle off the stable Release-One install path is byte-identical to pre-WF-LED-002; with the LED toggle on the wizard produces `config_string: Ceiling-POE-VentIQ-RoomIQ-LED` and resolves to the preview build behind the existing preview gate. WF-LED-003 added a targeted policy-level test in `__tests__/release-channel-ui.test.js` (`WF-LED-003 — LED preview exposure model …` describe block) that pins the LED-preview-shaped build against the exposure model: never auto-selected by `pickDefaultBuild`, stable wins when both are candidates, `channel:preview` acknowledgement required, visible in normal mode, Preview badge with warning tone, never tagged Recommended. A future WF-LED-004 may revisit the UX surface only after **either** upstream promotes the LED catalog entry to `status: production` (which would unblock a `REQUIRED_CONFIGS` entry) **or** S360-300 bench verification clears the LED hardware path (which would justify a preview-labelled kit or a dedicated preview-channel control); neither precondition has landed as of WF-LED-003. WF-PRODUCT-004 then adds an advisory readiness validator at [`scripts/validate-product-import-readiness.js`](scripts/validate-product-import-readiness.js) with the contract doc at [`docs/product-import-readiness.md`](docs/product-import-readiness.md). The validator classifies every upstream catalog entry against four independent dimensions — **import-eligible**, **manifest-eligible**, **`REQUIRED_CONFIGS`-eligible**, **kit-eligible** — and cross-checks the live WebFlash surfaces (`firmware/sources.json`, `manifest.json`, `REQUIRED_CONFIGS`, `scripts/data/kits.json`) against the catalog lifecycle. `production`+`stable` is the only state that may enter `REQUIRED_CONFIGS`; `preview` is import / manifest / kit eligible but never `REQUIRED_CONFIGS` eligible; `blocked` / `legacy-compatible` / `deprecated` / `removed` / `hardware-pending` / `compile-only` never qualify; `Rescue` is exempt by name. Today's classifications are unchanged by WF-PRODUCT-004: Release-One (`Ceiling-POE-VentIQ-RoomIQ`) is import + manifest + `REQUIRED_CONFIGS` + kit eligible; the LED preview (`Ceiling-POE-VentIQ-RoomIQ-LED`) is import + manifest + kit eligible but **not** `REQUIRED_CONFIGS` eligible; the FanTRIAC blocked entry is ineligible everywhere; the legacy-compatible representative is ineligible everywhere. WF-PRODUCT-004 is reporting-only — it does not import firmware, regenerate manifests, change `REQUIRED_CONFIGS`, add kits, modify any UI / wizard / `sw.js` / workflow surface, or alter `__tests__/fixtures/esphome-product-catalog.json`. Defaults to Markdown output against the vendored fixture; supports `--catalog <path>`, `--config <config_string>`, `--format markdown|json`; exits 0 on consistent classification, 1 on violation, 2 on usage error. The Jest pin at [`__tests__/product-import-readiness.test.js`](__tests__/product-import-readiness.test.js) (run via `npm run test:product-import-readiness`) locks the rules and the current fixture classifications.

### Frontend ↔ pipeline contract

The wizard's selection is reduced to a `config_string` (e.g. `Ceiling-POE-VentIQ-RoomIQ`) and matched against `build.config_string` in `manifest.json`. `parseConfigStringState` in `state.js` and the canonical token formatters in `MODULE_SEGMENT_FORMATTERS` define how segments encode/decode (`AirIQ` → `airiq=airiq`, `VentIQ` → `ventiq=airiq`, `FanRelay` → `fan=relay`, `FanPWM` → `fan=pwm`, `FanDAC` → `fan=analog`, `FanTRIAC` → `fan=triac`, etc.). When you add a new module token, update both:

1. The wizard's segment formatter and `parseConfigStringState` in `scripts/state.js`.
2. `CANONICAL_MODULE_TOKENS` / token-handling logic in `scripts/gen-manifests.py`.

Otherwise the frontend will fail to find a build that the manifest claims exists.

## Conventions and gotchas

- **Desktop / Web Serial only.** The install path depends on `navigator.serial`, which is only implemented on desktop Chromium browsers. Do not add code paths that assume mobile or non-Chromium browsers can flash; gate any new install-time UI behind the existing capability detection in `scripts/capabilities.js` and surface unsupported-browser messaging through `init-review.js`.
- **Pure ESM.** Tests require `NODE_OPTIONS=--experimental-vm-modules` (already set by `npm test`). Do not introduce CommonJS modules under `scripts/` or in tests; new tests should use `import { ... } from '@jest/globals'`. Jest config (`jest.config.cjs`) sets `transform: {}` — no transpilation.
- **No external runtime dependencies in the wizard.** The only third-party script loaded by `index.html` is `esp-web-tools` from unpkg, which is allowed by the `Content-Security-Policy` in `_headers`. If you need new origins (scripts, fonts, connect-src), update the CSP there.
- **`_headers` is GitHub-Pages-style.** It controls CORS, CSP, and cache rules. Firmware binaries are served with `Cache-Control: max-age=31536000`, so versioned filenames are critical — never overwrite a published `.bin` in place.
- **Disabled options live in the matrix, not in markup.** The canonical SKU table above documents the products; runtime gating comes from `module-requirements.js` (e.g. `ceilingOnly`, `requiresBathroom`) and the visibility logic in `getVisibleModuleGroupKeys` in `state.js`. AirIQ ↔ VentIQ is mutually exclusive and driven by the Bathroom toggle on Ceiling mounts.
- **No Model/Variant axis.** The product taxonomy is flat (one SKU per product). When extending the wizard, do not add Base/Pro variants or model/variant fields; add a new SKU entry to `module-requirements.js` and a new module key to `MODULE_KEYS` in `state.js` instead.
- **Sensitive-value redaction.** `Copy diagnostics` and flash history both pass through redaction (`SENSITIVE_KEY_PATTERN` in `state.js`, `stripDeprecatedConfigurationFields` in `flash-history.js`). When adding new fields to diagnostics or history, audit whether they should be redacted before they ship.
- **Service worker cache name is `webflash-v1`.** Bumping the cache version (or the `?v=` query in `index.html`'s stylesheet links) is how forced refreshes are landed; the `activate` handler deletes any cache that starts with `webflash-` but is not the current name.
- **Generated files are committed.** `manifest.json`, every `firmware-*.json`, and every `firmware/configurations/*.bin` are tracked in git. Regenerate with `gen-manifests.py` and commit the diff together with the firmware change in the same commit.
- **Branch policy.** All AI-assisted development on this repo runs on a dedicated `claude/...` branch (see workflow instructions). Never push to `main` directly.
- **Wizard UX roadmap.** Live-wizard UX audit, severity-classified findings, target first-run flow, and PR sequencing for `WF-UX-QUICK-001` through `WF-UX-007` (plus the operator-only `WF-HW-TEST-001`) live in [`docs/wizard-ux-roadmap.md`](docs/wizard-ux-roadmap.md). Reference it when proposing UX-shaped changes; WF-LED-003's preview-channel exposure model and the FanTRIAC block must round-trip through that roadmap's do-not-change guardrails. The WF-HW-TEST-001 operator-validation container for the LED preview flash path lives at [`docs/led-preview-webflash-proof.md`](docs/led-preview-webflash-proof.md) (status: **pending — operator hardware test required**; pre-flight live-deployment evidence captured, hardware flash not yet performed).
