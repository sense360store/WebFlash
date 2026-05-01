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
| Ceiling | Sensor | Sense360 RoomIQ | S360-200 | R4 | Presence + Comfort (two boards) | Merged board. PIR, LD2450, SEN0609, LTR-303ALS (light), SHT4x (temp and humidity), BMP351 (pressure). |
| Ceiling | Sensor | Sense360 AirIQ | S360-210 | R4 | `AirlQ Ceiling` (typo in old name) | Air quality board. CO2 (SCD41), VOC (SGP41), gas (MICS-4514 with STM8). Connectors for PM (SPS30) and HCHO (SFA30). |
| Ceiling | Sensor | Sense360 VentIQ | S360-211 | R4 | Bathroom Pro | Smaller air quality board for bathrooms. SGP41 on board. Connectors for IR temp and SPS30. |
| Ceiling | Indicator | Sense360 LED | S360-300 | R4 | LED Ring | Ring of WS2812B LEDs. |
| Inline | Driver | Sense360 Fan Relay | S360-310 | R4 | `S360-Relay-C` | On / off relay for bathroom fans. |
| Inline | Driver | Sense360 Fan PWM | S360-311 | R4 | `12vFan_PWM_PulseCounter` | 12V PWM fan driver, up to 4 fans with tach feedback. |
| Inline | Driver | Sense360 Fan DAC | S360-312 | R4 | `Fan_GP8403` | 0 to 10V analog fan driver, for example Cloudlift S12. |
| Inline | Driver | Sense360 TRIAC | S360-320 | R4 | `TRIAC_Board` | Phase dimmer for mains fan or lamp. |
| Power | PSU | Sense360 Mains PSU | S360-400 | R4 | PWR Module | Mains to 5V using HLK-5M05. |
| Power | PSU | Sense360 PoE PSU | S360-410 | R4 | PoE Module | PoE to 5V. |

Notes:

- The current wizard exposes Ceiling mount only; a "Wall" branch lingers in markup/legacy aliases but is not a supported product.
- `scripts/data/module-requirements.js` is the runtime source of truth for which SKUs are wired up, their headers, and conflicts. **Update both this file and the wizard SKU labels in `state.js`** (`MODULE_LABELS`, `MODULE_VARIANT_LABELS`, `MODULE_SEGMENT_FORMATTERS`) when introducing a new SKU; do not regress to model/variant nomenclature.

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

- The wizard configuration object (`mounting`, `power`, `bathroom`, plus module keys `voice`, `led`, `airiq`, `fan`, `ventiq`). Fan variants are `relay` / `pwm` / `dac` / `triac`; the legacy `analog` value normalises to `dac` via `normalizeStateForConfiguration`, with matching aliases in `scripts/utils/url-config.js` and `scripts/utils/preset-storage.js` so old shareable URLs and presets still resolve.
- Step gating via `getMaxReachableStep()` — step 2 unlocks once `mounting` is set, step 3 once `power` is set, etc.
- Manifest loading, parsing of `config_string` values like `"Ceiling-POE-AirIQ"` back into wizard state (`parseConfigStringState`), and matching builds to the current selection.
- The Step 5 preflight engine (`evaluatePreflightPolicy`) and connection-quality metrics fed by `navigator.serial` connect/disconnect events and ESP Web Tools `state-changed` events.
- All install/download gating: install only fires when no preflight `Fail` exists, the **Before you flash** checkbox is checked, and any `Warning` is acknowledged.

It exports a small surface (`getState`, `setState`, `replaceState`, `getStep`, `setStep`, `getMaxReachableStep`, `getTotalSteps`) and a `__testHooks` bundle used exclusively by Jest.

Other notable pieces:

- `scripts/data/module-requirements.js` — hardware compatibility matrix (SKUs, headers, conflicts, `recommended`/`ceilingOnly`/`requiresBathroom` flags). **Constraint enforcement reads from this file**; keep it consistent with the canonical SKU table above and with the README option tables.
- `scripts/utils/url-config.js` — bidirectional parser for sharable config URLs. Maintains legacy aliases (e.g. `pwr` → `ac`, `BathroomAirIQ*` → `VentIQ`, fan `pwm` ↔ `base`, fan `analog` → `dac`) so old links still resolve. All `configSegment` outputs match the wizard's `MODULE_SEGMENT_FORMATTERS` in `scripts/state.js` (canonical `AirIQ` / `VentIQ` / `Fan` tokens — never `AirIQBase` / `FanPWM` / `FanAnalog`). The wizard URL key `voice` historically maps to `core` in the URL alias set.
- `scripts/utils/esp-web-tools-overrides.js` — installs a `MutationObserver` that attaches a `checkSameFirmware` override to every `<esp-web-install-button>` so users see a warning when reflashing the same version reported via Improv.
- `scripts/recommended-bundle.js` — quick-start preset application; uses `getMaxReachableStep` to jump straight to step 4 when applying a preset.
- `scripts/utils/preset-storage.js` — JSON preset import/export with schema versioning; deprecated keys (`presence`, `comfort`) are stripped on read, and legacy fan value `analog` is normalised to `dac` on import.
- `scripts/utils/flash-history.js` — flash attempts logged to `localStorage` for diagnostics; entries also strip deprecated keys.
- `sw.js` — service worker. Strategy is network-first for `*.bin` and `manifest.json`, stale-while-revalidate for everything else. **When you add new top-level scripts, add them to `STATIC_ASSETS` or `SCRIPT_MODULES` in `sw.js`** or they will not be available offline.

### Publishing pipeline

`scripts/gen-manifests.py` is the only way `manifest.json` and `firmware-*.json` should change — these files are **generated, not hand-edited**. It scans `firmware/`, parses each filename via the canonical pattern (see below), produces a single `manifest.json` with full per-build metadata (including hashes and a `config_string` like `Ceiling-POE-AirIQ`), and writes one `firmware-<index>.json` per build (the standard ESP Web Tools per-product manifest format).

The Python script still carries a legacy `model` / `variant` code path for binaries placed outside `firmware/configurations/`. **Treat this as deprecated** — do not introduce new firmware down that branch and do not extend Model/Variant metadata in new code. New SKUs and configurations belong in `firmware/configurations/` with the canonical `Sense360-...-vX.Y.Z-<channel>.bin` filename, identified by SKU/config-string only.

`scripts/validate-naming-policy.js` enforces:

- Canonical filename shape `Sense360-...-vX.Y.Z-(stable|preview|beta).(bin|md)`.
- Disallowed token migrations: `AirIQProv` → `AirIQPro`, `AirIQBase` → `AirIQ`, `BathroomAirIQ` → `Bathroom`, `FanPWM`/`FanAnalog` → `Fan`.
- Channel placement: only `*-stable.md` is allowed under `firmware/configurations/`. Preview/beta/dev release notes belong in `firmware/previews/`.

`.github/workflows/firmware-publish.yml` runs unit tests, the naming-policy validator, the manifest generator, and a `REQUIRED_CONFIGS` allowlist that fails the build if any of ~40 expected `config_string` values are missing from `manifest.json`. When updating that allowlist, search the workflow for `REQUIRED_CONFIGS` — adding a new firmware also means adding its config_string there if it is meant to be permanent.

### Frontend ↔ pipeline contract

The wizard's selection is reduced to a `config_string` (e.g. `Ceiling-POE-AirIQ`) and matched against `build.config_string` in `manifest.json`. `parseConfigStringState` in `state.js` and the canonical token formatters in `MODULE_SEGMENT_FORMATTERS` define how segments encode/decode (`AirIQ` → `airiq=airiq`, `VentIQ` → `ventiq=airiq`, `Fan` → `fan=relay|pwm|dac|triac`, `LED` → `led=airiq`, etc.). The fan formatter collapses every non-`none` variant to a single `Fan` token because the manifest carries one fan firmware per mounting/power combo (e.g. `Ceiling-USB-Fan`). The parser still accepts legacy `FanPWM` / `FanRelay` / `FanTRIAC` segments for old shareable links. When you add a new module token, update both:

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
- **Service worker cache name is `webflash-v2`.** Bumping the cache version (or the `?v=` query in `index.html`'s stylesheet links) is how forced refreshes are landed; the `activate` handler deletes any cache that starts with `webflash-` but is not the current name.
- **Generated files are committed.** `manifest.json`, every `firmware-*.json`, and every `firmware/configurations/*.bin` are tracked in git. Regenerate with `gen-manifests.py` and commit the diff together with the firmware change in the same commit.
- **Branch policy.** All AI-assisted development on this repo runs on a dedicated `claude/...` branch (see workflow instructions). Never push to `main` directly.
