# WebFlash Architecture

**Identifier:** `WEBFLASH-ARCH-DOCS-001`

This is the **human-facing architecture overview** for WebFlash. It explains how
the project is shaped, where the boundary between its two halves sits, why the
installer is desktop-only, and what actually stops a bad firmware manifest from
shipping. If you are a contributor opening this repository for the first time,
start here.

> **Docs only.** This document describes the existing design. It changes no
> runtime, manifest, firmware, or workflow behaviour. Installability is decided
> by `manifest.json`, `firmware/sources.json`, the `REQUIRED_CONFIGS` allowlist
> in [`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml),
> `scripts/utils/release-channels.js`, and the runtime install gate — never by
> anything written here.

The AI-facing engineering guide lives in [`CLAUDE.md`](../CLAUDE.md); the
canonical "what installs today" status lives in
[`docs/sense360-webflash-status.md`](sense360-webflash-status.md). This file is
the conceptual map that ties them together.

## The two halves

WebFlash is a static, browser-based firmware installer for Sense360 ESP32 hubs.
There is **no application server and no bundler** — the site is published to
GitHub Pages from the repository root. The codebase is best understood as two
independent halves that only ever communicate through one file, `manifest.json`:

### 1. The publishing pipeline (Python + GitHub Actions)

The pipeline turns firmware binaries into the catalog the browser reads:

- New firmware enters the tree through the **cross-repo importer**
  ([`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py),
  dispatched by [`.github/workflows/firmware-import.yml`](../.github/workflows/firmware-import.yml)),
  which fetches each upstream `.bin` from `sense360store/esphome-public`,
  verifies its SHA-256 against the upstream checksums, enforces the per-source
  `block_tokens` allowlist, and writes a `<asset>.meta.json` sidecar. The
  full contract record (`docs/firmware-import.md`) is archived — see
  [`docs/archive-index.md`](archive-index.md).
- [`scripts/gen-manifests.py`](../scripts/gen-manifests.py) then scans
  `firmware/`, parses each filename via the canonical naming pattern, and
  **generates** a single `manifest.json` (with per-build metadata, hashes, and a
  `config_string` like `Ceiling-POE-VentIQ-RoomIQ`) plus one `firmware-N.json`
  per build (the standard ESP Web Tools per-product manifest format). These
  files are generated, never hand-edited.
- [`scripts/validate-naming-policy.js`](../scripts/validate-naming-policy.js)
  enforces the canonical `Sense360-...-vX.Y.Z-<channel>.bin` filename shape and
  the disallowed token migrations.

This half is driven by [`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml),
which runs on push, regenerates the manifest, runs the publish gate (below), and
deploys the static site to GitHub Pages.

### 2. The wizard frontend (vanilla ES modules)

The frontend is a single page (`index.html` + `app.js`) built from **vanilla ES
modules with no framework and no build step**. It:

- loads `manifest.json` at runtime,
- walks the user through a 5-step configuration (mount → power → bathroom →
  modules → review),
- reduces that selection to a `config_string`, matches it against
  `build.config_string` in the manifest, and
- hands the matching `firmware-N.json` to the upstream
  `<esp-web-install-button>` component to drive the actual flash.

[`scripts/state.js`](../scripts/state.js) is the central state module and source
of truth; the deeper module-by-module breakdown lives in
[`CLAUDE.md`](../CLAUDE.md) under *Architecture → Wizard frontend*.

## The boundary file: `manifest.json`

The two halves never call each other. They meet **only** at `manifest.json`:

- the pipeline is the only writer (via `gen-manifests.py`);
- the wizard is the only runtime reader.

A selection in the wizard is encoded into a `config_string`, and the wizard
looks for a `build.config_string` that matches. `parseConfigStringState` in
`state.js` and the token formatters in `MODULE_SEGMENT_FORMATTERS` define how
segments encode and decode; the matching token logic in `gen-manifests.py`
defines how the pipeline emits them. **Both sides must agree on a token** — if
they drift, the frontend cannot find a build the manifest claims exists. Keeping
the contract honest is exactly why the deploy gate (below) exists.

## Platform constraint: desktop Chromium only

WebFlash flashes over the browser, which depends on the **Web Serial API**
(`navigator.serial`). Web Serial is implemented only in desktop Chromium-based
browsers (Chrome, Edge, Opera) on Windows / macOS / Linux. It is **not**
available on iOS, Android Chrome, any mobile browser, Firefox, or Safari — so on
those platforms the install path simply cannot work.

WebFlash therefore explicitly targets desktop Chromium. Capability detection
lives in [`scripts/capabilities.js`](../scripts/capabilities.js) (reached through
the `engine.capabilities` facade), and the install view
([`scripts/install.js`](../scripts/install.js)) surfaces the unsupported-browser
banner.
Do not add mobile-first layout assumptions or features that imply mobile is a
supported runtime.

## Standard: ESP Web Tools

WebFlash follows the **ESP Web Tools / esptool.js standard** for flashing ESP32
devices rather than implementing its own flash protocol. The wizard renders the
upstream `<esp-web-install-button>` component (loaded from unpkg) and consumes
the standard ESP Web Tools manifest schema (`name`, `version`,
`builds[].chipFamily`, `builds[].parts[].path`/`offset`, `improv`, …). Connect /
erase / write / verify is owned by the upstream component; the install view
([`scripts/install.js`](../scripts/install.js)) only renders the button, its
unsupported / not-allowed fallback slots, and the surrounding gate UI, and
observes the component's `state-changed` events for the flash lifecycle.

## Cross-repo contract: downstream of `sense360store/esphome-public`

WebFlash is **downstream** of [`sense360store/esphome-public`](https://github.com/sense360store/esphome-public).
That repository owns the product ESPHome YAML, the build/publish pipeline, and
the release `.bin` artifacts. Internally its product YAML is now a **four-tier
composition** (the finalized board/bundle refactor): an authoritative
`packages/boards/s360-*.yaml` layer with one canonical package per board SKU
(`S360-100` Core, `S360-200` RoomIQ, `S360-210` AirIQ, `S360-211` VentIQ,
`S360-300` LED, `S360-410` PoE PSU); thin **legacy aliases** that `!include`
their board package so historical functional paths resolve byte-identically;
`products/bundles/*.yaml` named **1:1 to each WebFlash config string**; and
thin **product shims** (`products/sense360-*.yaml`) that preserve the
customer-pinned include path. **None of that layering is visible to WebFlash** —
WebFlash couples to the upstream repo through exactly three stable surfaces:
GitHub release **tags**, **config-string** values, and **artifact names**, and
no WebFlash file references any `packages/` or `products/` path.

WebFlash consumes those releases through
[`firmware/sources.json`](../firmware/sources.json): each source entry pins an
upstream release tag and asset name, the importer fetches and SHA-256-verifies
it, and only then does it enter the WebFlash tree.

The signing boundary matters: `esphome-public` publishes **unsigned** raw `.bin`
assets plus SHA-256/MD5 checksums and a build-info `manifest.json` (metadata,
**not** a production manifest), and **WebFlash is the production signing /
deployment authority** — it consumes the unsigned assets and generates its own
production `manifest.json` and per-build `firmware-N.json`. The whole-pipeline
view that spans both repositories is documented upstream in
[`sense360store/esphome-public` → `docs/system-architecture.md`](https://github.com/sense360store/esphome-public/blob/main/docs/system-architecture.md);
the board/bundle/alias/shim layering and the explicit "this is invisible to
WebFlash" note live in its
[Inside esphome-public](https://github.com/sense360store/esphome-public/blob/main/docs/system-architecture.md#inside-esphome-public-board--bundle--alias--shim-layers)
section, and the per-token naming rules in
[`docs/webflash-contract.md`](https://github.com/sense360store/esphome-public/blob/main/docs/webflash-contract.md).
Because config strings and artifact names were held byte-identical throughout
that refactor, the WebFlash import surface was unaffected — re-audited and
recorded under `WEBFLASH-ARCH-SYNC-001` in `docs/product-import-readiness.md`
(archived — see [`docs/archive-index.md`](archive-index.md)).

For which upstream products WebFlash actually mirrors today (and which are
preview-only, blocked, or unimported), see the canonical
[`docs/sense360-webflash-status.md`](sense360-webflash-status.md).

## The deploy gate: what stops a bad manifest from shipping

[`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml)
deploys to GitHub Pages **on push**. The publish *trigger* is therefore
automatic — but a deploy only proceeds if the firmware catalog is internally
consistent. Three things fail CI before the deploy job runs:

1. **The `manifest-health` guard suite**
   ([`__tests__/manifest-health.test.js`](../__tests__/manifest-health.test.js),
   WF-CLEANUP-006) — runs in the unit-test gate and fails if:
   - any `manifest.json` or `firmware-*.json` build references a `.bin` that is
     not on disk,
   - a `firmware/configurations/*.bin` is missing its `.meta.json` sidecar,
   - the per-build `firmware-*.json` files drift out of sync with
     `manifest.json`,
   - a **blocked token** reappears in a generated `config_string`, or
   - a `REQUIRED_CONFIGS` entry is missing from `manifest.json`.

2. **The `block_tokens` allowlist** — declared per source in
   [`firmware/sources.json`](../firmware/sources.json) (e.g.
   `["FanTRIAC", "LED"]` on the Release-One source). The importer refuses to
   ingest an asset bearing a blocked token, and the manifest-health guard fails
   CI if a blocked token ever surfaces in a generated `config_string`. `FanTRIAC`
   is additionally blocked globally while S360-320 hardware verification is
   pending.

3. **The `REQUIRED_CONFIGS` check** — a bash allowlist in the *Assert required
   configs present* step of `firmware-publish.yml`. The build fails if any
   expected `config_string` is missing from the freshly generated
   `manifest.json`. The live array in the workflow file is the source of truth
   and today holds exactly two entries — `Ceiling-POE-VentIQ-RoomIQ`
   (Release-One) and `Rescue`. The same allowlist is cross-checked from the test
   side by the manifest-health guard and by
   [`__tests__/sense360-webflash-status.test.js`](../__tests__/sense360-webflash-status.test.js).

Together these make the deploy safety model **explicit**: the publish trigger is
"push", and the publish gate is "the manifest must reference real, sidecar-backed
binaries, carry no blocked token, and cover every required config — or CI fails
before anything reaches GitHub Pages."

## The canonical SKU table

The **authoritative Sense360 SKU list** (Friendly name, SKU, revision, and what
each board does) lives in [`CLAUDE.md`](../CLAUDE.md) under *Sense360 hardware
reference (canonical SKUs)*. It is intentionally **not** duplicated here so the
two cannot drift; consult `CLAUDE.md` for the canonical table and the
[`docs/hardware-options.md`](hardware-options.md) *Canonical Option Inventory
Table* for the operator-facing mirror.

## Related documentation

- [`CLAUDE.md`](../CLAUDE.md) — AI-facing engineering guide; canonical SKU table;
  per-module deep dive.
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — canonical
  product / release status (what installs today).
- `docs/firmware-import.md` — the cross-repo importer mechanism record
  (archived — see [`docs/archive-index.md`](archive-index.md)).
- `docs/webflash-import-readiness-matrix.md` / `docs/product-import-readiness.md`
  (both archived — see [`docs/archive-index.md`](archive-index.md)) — import
  eligibility classes and the catalog eligibility validator.
- [`README.md`](../README.md) — the repository front door; the full
  user-facing flashing guide lives in [`docs/user-guide.md`](user-guide.md).
- [`sense360store/esphome-public` → `docs/system-architecture.md`](https://github.com/sense360store/esphome-public/blob/main/docs/system-architecture.md)
  — the whole-system view spanning both repositories.
