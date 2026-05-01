# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

WebFlash is a static, browser-based firmware installer for Sense360 ESP32 hubs. The site is a single page that drives ESP Web Tools via Web Serial; there is no application server and no bundler. It is published to GitHub Pages from the repository root.

The codebase has two halves that meet at `manifest.json`:

1. A **publishing pipeline** (Python + GitHub Actions) that converts firmware binaries dropped under `firmware/` into `manifest.json` and per-build `firmware-N.json` files.
2. A **wizard frontend** (vanilla ES modules, no framework) that loads `manifest.json` at runtime, walks the user through a 5-step configuration, and hands a matching `firmware-N.json` to `<esp-web-install-button>`.

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
- Manifest loading, parsing of `config_string` values like `"Ceiling-POE-AirIQ"` back into wizard state (`parseConfigStringState`), and matching builds to the current selection.
- The Step 5 preflight engine (`evaluatePreflightPolicy`) and connection-quality metrics fed by `navigator.serial` connect/disconnect events and ESP Web Tools `state-changed` events.
- All install/download gating: install only fires when no preflight `Fail` exists, the **Before you flash** checkbox is checked, and any `Warning` is acknowledged.

It exports a small surface (`getState`, `setState`, `replaceState`, `getStep`, `setStep`, `getMaxReachableStep`, `getTotalSteps`) and a `__testHooks` bundle used exclusively by Jest.

Other notable pieces:

- `scripts/data/module-requirements.js` — hardware compatibility matrix (SKUs, headers, conflicts, `recommended`/`ceilingOnly`/`requiresBathroom` flags). **Constraint enforcement reads from this file**; keep it consistent with the README option tables.
- `scripts/utils/url-config.js` — bidirectional parser for sharable config URLs. Maintains legacy aliases (e.g. `pwr` → `ac`, `BathroomAirIQ*` → `VentIQ`, fan `pwm` ↔ `base`) so old links still resolve. The wizard URL key `voice` historically maps to `core` in the URL alias set.
- `scripts/utils/esp-web-tools-overrides.js` — installs a `MutationObserver` that attaches a `checkSameFirmware` override to every `<esp-web-install-button>` so users see a warning when reflashing the same version reported via Improv.
- `scripts/recommended-bundle.js` — quick-start preset application; uses `getMaxReachableStep` to jump straight to step 4 when applying a preset.
- `scripts/utils/preset-storage.js` — JSON preset import/export with schema versioning; deprecated keys (`presence`, `comfort`) are stripped on read.
- `scripts/utils/flash-history.js` — flash attempts logged to `localStorage` for diagnostics; entries also strip deprecated keys.
- `sw.js` — service worker. Strategy is network-first for `*.bin` and `manifest.json`, stale-while-revalidate for everything else. **When you add new top-level scripts, add them to `STATIC_ASSETS` or `SCRIPT_MODULES` in `sw.js`** or they will not be available offline.
- `scripts/wizard-state-observer.js` — `window.WizardState` legacy observer that infers state from the DOM via a `MutationObserver`. Newer code reads from `state.js` directly; this exists for older inspector code that watches the DOM.

### Publishing pipeline

`scripts/gen-manifests.py` is the only way `manifest.json` and `firmware-*.json` should change — these files are **generated, not hand-edited**. It scans `firmware/`, parses each filename via the canonical pattern (see below), produces a single `manifest.json` with full per-build metadata (including hashes and a `config_string` like `Ceiling-POE-AirIQ`), and writes one `firmware-<index>.json` per build for ESP Web Tools.

`scripts/validate-naming-policy.js` enforces:

- Canonical filename shape `Sense360-...-vX.Y.Z-(stable|preview|beta).(bin|md)`.
- Disallowed token migrations: `AirIQProv` → `AirIQPro`, `AirIQBase` → `AirIQ`, `BathroomAirIQ` → `Bathroom`, `FanPWM`/`FanAnalog` → `Fan`.
- Channel placement: only `*-stable.md` is allowed under `firmware/configurations/`. Preview/beta/dev release notes belong in `firmware/previews/`.

`.github/workflows/firmware-publish.yml` runs unit tests, the naming-policy validator, the manifest generator, and a `REQUIRED_CONFIGS` allowlist that fails the build if any of ~40 expected `config_string` values are missing from `manifest.json`. When updating that allowlist, search the workflow for `REQUIRED_CONFIGS` — adding a new firmware also means adding its config_string there if it is meant to be permanent.

### Frontend ↔ pipeline contract

The wizard's selection is reduced to a `config_string` (e.g. `Ceiling-POE-AirIQ`) and matched against `build.config_string` in `manifest.json`. `parseConfigStringState` in `state.js` and the canonical token formatters in `MODULE_SEGMENT_FORMATTERS` define how segments encode/decode (`AirIQ` → `airiq=airiq`, `VentIQ` → `ventiq=airiq`, `FanPWM` → `fan=pwm`, etc.). When you add a new module token, update both:

1. The wizard's segment formatter and `parseConfigStringState` in `scripts/state.js`.
2. `CANONICAL_MODULE_TOKENS` / token-handling logic in `scripts/gen-manifests.py`.

Otherwise the frontend will fail to find a build that the manifest claims exists.

## Conventions and gotchas

- **Pure ESM.** Tests require `NODE_OPTIONS=--experimental-vm-modules` (already set by `npm test`). Do not introduce CommonJS modules under `scripts/` or in tests; new tests should use `import { ... } from '@jest/globals'`. Jest config (`jest.config.cjs`) sets `transform: {}` — no transpilation.
- **No external runtime dependencies in the wizard.** The only third-party script loaded by `index.html` is `esp-web-tools` from unpkg, which is allowed by the `Content-Security-Policy` in `_headers`. If you need new origins (scripts, fonts, connect-src), update the CSP there.
- **`_headers` is GitHub-Pages-style.** It controls CORS, CSP, and cache rules. Firmware binaries are served with `Cache-Control: max-age=31536000`, so versioned filenames are critical — never overwrite a published `.bin` in place.
- **Disabled options live in the matrix, not in markup.** The README option tables document what is currently selectable; the actual gating comes from `module-requirements.js` (e.g. `ceilingOnly`, `requiresBathroom`) and the visibility logic in `getVisibleModuleGroupKeys` in `state.js`. AirIQ ↔ VentIQ is mutually exclusive and driven by the Bathroom toggle on Ceiling mounts.
- **Sensitive-value redaction.** `Copy diagnostics` and flash history both pass through redaction (`SENSITIVE_KEY_PATTERN` in `state.js`, `stripDeprecatedConfigurationFields` in `flash-history.js`). When adding new fields to diagnostics or history, audit whether they should be redacted before they ship.
- **Service worker cache name is `webflash-v1`.** Bumping the cache version (or the `?v=` query in `index.html`'s stylesheet links) is how forced refreshes are landed; the `activate` handler deletes any cache that starts with `webflash-` but is not the current name.
- **Generated files are committed.** `manifest.json`, every `firmware-*.json`, and every `firmware/configurations/*.bin` are tracked in git. Regenerate with `gen-manifests.py` and commit the diff together with the firmware change in the same commit.
- **Branch policy.** All AI-assisted development on this repo runs on a dedicated `claude/...` branch (see workflow instructions). Never push to `main` directly.
