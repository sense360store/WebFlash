# Firmware import from `esphome-public`

WebFlash now imports raw firmware assets from
[`sense360store/esphome-public`](https://github.com/sense360store/esphome-public)
GitHub Releases. WebFlash owns sidecar generation, production signing,
manifest generation, and deployment; `esphome-public` only publishes the raw
`.bin` + checksum + build-info artifacts.

## Source repo and release

| Field          | Value                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| Source repo    | `sense360store/esphome-public`                                                         |
| Release tag    | `v1.0.0` (proven; further tags added by editing `firmware/sources.json`)               |
| WebFlash config| `Ceiling-POE-VentIQ-RoomIQ`                                                            |
| Asset          | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` (1,087,488 bytes)               |
| Other assets   | `checksums-sha256.txt`, `checksums-md5.txt`, `manifest.json` (upstream build-info)     |

**Current source-list state:** `firmware/sources.json` declares exactly one
active source — Release-One above. Every other shipping config (`Rescue`) is
built in-tree under `firmware/rescue/`; there is no longer any
`REQUIRED_CONFIGS` entry that relies on a missing-on-disk legacy build. New
shipping configurations expand `firmware/sources.json` (and, only after the
matching `.bin` lands on disk, `REQUIRED_CONFIGS`); they should not arrive
through hand-copying a `.bin` into `firmware/configurations/`.

## What gets imported

For each entry in `firmware/sources.json`, the importer:

1. Fetches release metadata via the GitHub API
   (`GET /repos/{repo}/releases/tags/{tag}`).
2. Asserts every filename in `required_assets` is present on the release.
3. Downloads the `.bin`, `checksums-sha256.txt`, and (best-effort) the
   upstream `manifest.json` to a temp directory.
4. Verifies the `.bin` SHA256 against the upstream `checksums-sha256.txt`.
   Mismatch aborts the import.
5. Scans the verified `.bin` bytes for known default/placeholder credential
   material (the W-H1 import gate,
   `scripts/check-firmware-default-credentials.py`: OTA / web / fallback-AP
   defaults plus the placeholder API encryption key in both its base64-literal
   and decoded 32-byte forms; the intentionally-public setup-network pair is
   the only exclusion). Any match aborts the import for that source, naming
   the credential class — checksum-valid but credential-dirty assets are
   refused.
6. Verifies size `>= min_size_bytes` (default 102_400). Smaller binaries are
   rejected as placeholders or truncated downloads.
7. Asserts the filename's parsed `config_string` matches the entry's declared
   `config_string`.
8. Asserts none of the entry's `block_tokens` (default `["FanTRIAC", "LED"]`)
   appear in the filename or parsed module list.
9. Parses the release body and refuses if any of `Changelog`, `Known Issues`,
   `Features`, `Hardware Requirements` is missing.
10. Writes the `.bin` to `firmware/configurations/<asset_name>` and a
    `<asset_name>.meta.json` sidecar.

## Sidecar layout

The generated sidecar carries both the parsed release-body sections (so they
flow into the WebFlash production manifest's per-build description) **and** a
`source` block for provenance / debug:

```json
{
  "changelog": [...],
  "known_issues": [...],
  "features": [...],
  "hardware_requirements": [...],
  "signed_by": "Sense360 release pipeline",
  "deprecated": false,
  "deprecation_reason": null,
  "artifact_type": "application",
  "improv": false,
  "source": {
    "source_repo": "sense360store/esphome-public",
    "release_tag": "v1.0.0",
    "release_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0",
    "source_asset_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
    "source_asset_sha256": "9169f2ce…",
    "source_manifest_git_sha": "0d0219bee8…",
    "source_manifest_esphome_version": "2025.3.0",
    "imported_at": "2026-05-13T09:48:23+00:00"
  }
}
```

### Improv Serial is opt-in per source

`improv` defaults to `false` in every generated sidecar: no currently shipped
upstream binary implements Improv Serial (verified empirically against
`sense360store/esphome-public`, which had no `improv_serial` component — the
firmware-side change is tracked there in `docs/improv-serial-finding.md`).
Advertising improv on a build that cannot answer makes ESP Web Tools stall
15 seconds after every install waiting for a handshake that never arrives,
and makes device identification impossible anyway. Once an upstream release
actually carries `improv_serial`, the matching `firmware/sources.json` entry
declares `"improv": true` and the importer carries that into the sidecar;
`gen-manifests.py` then emits `improv: true` for that build and restores the
`new_install_improv_wait_time` of 15 on its per-build manifest (manifests
whose builds have no improv get a wait time of 0). Rescue builds never opt
in.

## Where signed firmware lives

Imported binaries land in `firmware/configurations/` exactly like
hand-committed firmware. The existing
[`scripts/gen-manifests.py`](../scripts/gen-manifests.py) pipeline then signs
and indexes them — see `firmware-signing/README.md` for the trust model.
Signing keys never leave WebFlash; this importer does not call out to
`esphome-public` for any signing operation.

## Where the production manifest is generated

`scripts/gen-manifests.py` writes `manifest.json` and one
`firmware-<n>.json` per build. The publish workflow regenerates these on
every CI run, so the committed `manifest.json` is an informational snapshot —
the live deployed manifest is whatever CI produces at deploy time.

The upstream `manifest.json` included in the `esphome-public` release is
treated as **build-info metadata only**. The importer reads its
`source_commit` / `esphome_version` fields into the sidecar's `source` block
and never copies it into WebFlash's production manifest.

## Run the import

Local manual run (requires Python 3.11+ and network access to GitHub):

```bash
python3 scripts/import-firmware-sources.py
```

Filter to a single source:

```bash
python3 scripts/import-firmware-sources.py \
  --source-repo sense360store/esphome-public \
  --release-tag v1.0.0
```

Validate without writing files:

```bash
python3 scripts/import-firmware-sources.py --dry-run
```

Offline / rate-limited replay (feeds the release payload from a JSON file
instead of calling the API):

```bash
python3 scripts/import-firmware-sources.py \
  --source-repo sense360store/esphome-public \
  --release-tag v1.0.0 \
  --release-payload-file path/to/release.json
```

After the importer succeeds, regenerate the production manifest:

```bash
python3 scripts/gen-manifests.py --summary
```

…and commit the new `.bin`, `.meta.json`, `manifest.json`, and any new
`firmware-<n>.json` files together as a single change.

## CI workflow

`.github/workflows/firmware-import.yml` exposes a manual `workflow_dispatch`
trigger that runs the importer, regenerates manifests, and **auto-commits the
result to the same branch the workflow was dispatched from**. It does not
auto-merge and does not deploy directly — the existing
`firmware-publish.yml` workflow handles deploy on the resulting push after
review and merge.

Inputs:

* `source_repo` — optional; filter to a single source repo.
* `release_tag` — optional; filter to a single release tag.
* `dry_run` — `true` validates everything without writing files or committing.

## Smoke check

The cross-repo proof chain after import is:

```text
esphome-public GitHub Release v1.0.0
  → WebFlash importer finds .bin
  → checksum verified (SHA256 against upstream checksums-sha256.txt)
  → sidecar metadata generated (release-body sections + source provenance)
  → firmware signed (gen-manifests.py + firmware-signing/)
  → production manifest generated
  → manifest.json contains "Ceiling-POE-VentIQ-RoomIQ"
```

Run all three smoke checks:

```bash
# 1. Python importer unit tests
python3 -m unittest __tests__/python/test_import_firmware_sources.py -v

# 2. Naming policy
node scripts/validate-naming-policy.js firmware/configurations

# 3. Jest smoke (asserts manifest.json contains the imported config_string)
npm test -- manifest-required-configs
```

## Boundaries (do not regress)

* Production signing stays in WebFlash. Never move signing to
  `esphome-public`.
* The upstream `manifest.json` is build-info metadata; never the production
  manifest.
* Filename alone is not trusted. The importer always verifies SHA256 against
  the upstream `checksums-sha256.txt` and that the parsed `config_string`
  matches the source entry.
* Release-One blocks `FanTRIAC` and `LED` token firmware via
  `block_tokens`. Both must remain in the default list for the v1.0.0 source
  entry until hardware verification clears them.
* A `.bin` whose bytes carry a known default/placeholder credential is never
  staged, regardless of checksum validity (SECURITY-AUDIT-2026-06 W-H1,
  downstream half of upstream `esphome-public#779`). The denylist lives in
  `scripts/check-firmware-default-credentials.py` and is kept in lock-step
  with upstream's release gate; the four device-control credential classes
  (API encryption key, OTA password, web password, fallback-AP password) are
  never excluded from it. The scan gates **new** imports — the already-staged
  pin-verified skip path does not re-scan, so previously published pre-fix
  binaries are not torn out by a routine re-run; their clean rebuild +
  re-import is tracked separately (WF-H1-REIMPORT-CLEAN-001).

## Post-import safety net

`__tests__/manifest-health.test.js` (added by WF-CLEANUP-006) is the in-CI
guard that catches drift between an imported `.bin`, its `.meta.json`
sidecar, the regenerated `manifest.json` / `firmware-*.json`, and the
`REQUIRED_CONFIGS` allowlist. It runs as part of the existing
`npm test -- --ci` step in `.github/workflows/firmware-publish.yml` and
fails the publish run before deploy if:

* a `manifest.json` or `firmware-*.json` build references a `.bin` that is
  not on disk;
* a `firmware/configurations/*.bin` is missing its `.meta.json` sidecar
  (Rescue under `firmware/rescue/` is exempt — it uses the per-product
  `firmware/rescue/manifest.json` instead);
* the `firmware-*.json` set has drifted out of sync with `manifest.json`;
* a globally-blocked token (`FanTRIAC`) or a per-source `block_tokens`
  entry (e.g. `LED` on Release-One) reappears in a generated
  `config_string`;
* an entry in `.github/workflows/firmware-publish.yml`'s `REQUIRED_CONFIGS`
  is missing from `manifest.json`.

If the importer succeeds locally but this guard fails in CI, the failing
invariant is the source of truth — re-run the importer + manifest generation
rather than weakening the guard.

## Product-catalog alignment (WF-PRODUCT-001)

`__tests__/product-catalog-alignment.test.js` cross-checks every active
WebFlash firmware surface (`firmware/sources.json`, `manifest.json`, every
`firmware-*.json`, the workflow's `REQUIRED_CONFIGS`, and
`scripts/data/kits.json`) against the upstream lifecycle catalog at
[`sense360store/esphome-public/main/config/product-catalog.json`](https://github.com/sense360store/esphome-public/blob/main/config/product-catalog.json).
The test fails CI if any of those surfaces references a config that is
`blocked`, `legacy-compatible`, `deprecated`, `removed`, `hardware-pending`,
`compile-only`, or absent from the catalog. `firmware/sources.json` and
`REQUIRED_CONFIGS` are stricter and require `status: production`; manifests
and kits also accept `preview`. `Rescue` is a WebFlash-owned local recovery
build and is exempt by name from every check.

The test defaults to the vendored snapshot at
`__tests__/fixtures/esphome-product-catalog.json` so CI runs offline. To
re-validate against a freshly downloaded upstream catalog before refreshing
the fixture, set `PRODUCT_CATALOG_PATH` to the absolute path of the
downloaded JSON:

```bash
curl -sLo /tmp/product-catalog.json \
  https://raw.githubusercontent.com/sense360store/esphome-public/main/config/product-catalog.json
PRODUCT_CATALOG_PATH=/tmp/product-catalog.json \
  npm test -- product-catalog-alignment
```

Refresh the fixture only when upstream promotes a new config WebFlash needs
to ship, or when a status WebFlash relies on changes (e.g. FanTRIAC leaving
`blocked`).

### WF-PRODUCT-002 — fixture refresh checkpoint

Fixture-and-docs-only refresh against the current upstream
`sense360store/esphome-public` product catalog. The upstream snapshot at
refresh time held **33 products**: **1 production**
(`Ceiling-POE-VentIQ-RoomIQ`), **1 blocked**
(`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`), **0 preview**, and **31
legacy-compatible** entries enumerated by upstream PRODUCT-002. The two
real entries WebFlash mirrors carried only prose-level enrichments (`notes`
/ `reason` doc-link additions and GPIO5/GPIO6 / SX1509 / `ac_dimmer`
rationale on the FanTRIAC blocker) — no status changes, no schema changes.

Active WebFlash surfaces (`firmware/sources.json`, `manifest.json`,
`firmware-*.json`, the publish workflow's `REQUIRED_CONFIGS`, and
`scripts/data/kits.json`) still resolve only to Release-One
(`Ceiling-POE-VentIQ-RoomIQ`) plus the WebFlash-owned `Rescue` build.
**FanTRIAC remains blocked.** **LED remains excluded from Release-One**
— no upstream production or preview entry carried an LED token at refresh
time. Validate against a freshly downloaded upstream catalog via the
existing `PRODUCT_CATALOG_PATH` recipe shown above before refreshing the
fixture again.

### WF-PRODUCT-003 — fixture refresh checkpoint (LED preview)

Fixture-and-docs-only refresh against the current upstream
`sense360store/esphome-public` product catalog after upstream PRODUCT-009
promoted an LED-bearing sibling product to a preview build. The upstream
snapshot at refresh time held **34 products**: **1 production**
(`Ceiling-POE-VentIQ-RoomIQ`), **1 preview**
(`Ceiling-POE-VentIQ-RoomIQ-LED`, version `1.0.0`, channel `preview`,
artifact `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`,
`webflash_build_matrix: true`), **1 blocked**
(`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`), and **31 legacy-compatible**
entries. The WF-PRODUCT-002 fixture's synthetic
`Ceiling-POE-VentIQ-RoomIQ-Preview` placeholder was removed and replaced
with the real upstream LED preview entry, so the fixture now exercises
the preview-eligibility branch against real upstream data.

**WebFlash is aware of the LED preview but has not imported, signed,
manifested, or surfaced it.** Active WebFlash surfaces
(`firmware/sources.json`, `manifest.json`, `firmware-*.json`,
`REQUIRED_CONFIGS`, `scripts/data/kits.json`) still resolve only to
Release-One (`Ceiling-POE-VentIQ-RoomIQ`) plus the WebFlash-owned
`Rescue` build. **`REQUIRED_CONFIGS` remains production-only** —
Release-One + Rescue. **FanTRIAC remains blocked** under HW-005.
**Release-One remains LED-less**; `firmware/sources.json`'s
`block_tokens: ["FanTRIAC", "LED"]` on the v1.0.0 source still applies
and the manifest-health guard still rejects an LED token in any
generated `config_string`.

Before WebFlash can expose the LED preview, a separate change must (a)
add a new entry to `firmware/sources.json` covering the LED preview
artifact with appropriately-scoped `block_tokens` (LED can't be globally
blocked on the source that imports the LED build), (b) import the
upstream `.bin` via `scripts/import-firmware-sources.py` with checksum
verification, (c) sign and regenerate manifests via
`scripts/gen-manifests.py`, and (d) make a deliberate UX call on preview
exposure (manifest-only / kit / wizard). None of that lands in
WF-PRODUCT-003.

`__tests__/product-catalog-alignment.test.js` now carries a
`WF-PRODUCT-003 — upstream LED preview recognition` describe block that
pins both halves of the contract: the fixture exposes the LED preview as
`status: preview` with the upstream artifact_name/version/channel, and
each active WebFlash surface explicitly asserts it does **not** reference
the LED preview today.

### WF-LED-001 — LED preview import plan (docs only)

The forward-looking plan for the future LED preview import lives at
[`docs/led-preview-import-plan.md`](led-preview-import-plan.md). It is
docs only — WF-LED-001 does **not** import firmware, regenerate
manifests, modify `firmware/sources.json`, change `REQUIRED_CONFIGS`,
add LED UI, add a kit, unblock FanTRIAC, or claim a real LED preview
artifact exists yet. The plan documents the exact future
`firmware/sources.json` shape (including the per-source
`block_tokens: ["FanTRIAC"]` for the new LED preview source while the
Release-One source keeps `block_tokens: ["FanTRIAC", "LED"]`), the
required upstream proof fields, the import + regeneration sequence,
and the deferred UX decisions. Until the upstream proof fields land,
active WebFlash surfaces remain Release-One + Rescue only.

### WF-LED-002 — LED preview imported

Upstream
[`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview)
shipped a proven LED preview firmware artifact with every WF-LED-001
proof field in place (release tag, `.bin` asset with verified SHA256,
`checksums-sha256.txt`, `checksums-md5.txt`, upstream `manifest.json`,
and a release body containing all four canonical H2 sections —
`Changelog`, `Known Issues`, `Features`, `Hardware Requirements`).
WF-LED-002 imports that artifact and regenerates the WebFlash production
manifest.

**New entries**:

* `firmware/sources.json` gained a second source entry alongside the
  unchanged Release-One source:

  ```json
  {
    "source_repo": "sense360store/esphome-public",
    "release_tag": "v1.0.0-led-preview",
    "release_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview",
    "version": "1.0.0",
    "channel": "preview",
    "config_string": "Ceiling-POE-VentIQ-RoomIQ-LED",
    "asset_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin",
    "expected_sha256": "93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3",
    "min_size_bytes": 102400,
    "required_assets": [...],
    "required_release_body_sections": [...],
    "block_tokens": ["FanTRIAC"]
  }
  ```

* `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`
  (1,135,904 bytes,
  SHA256 `93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`)
  plus its `.meta.json` sidecar.
* `manifest.json` build entry with `config_string:
  Ceiling-POE-VentIQ-RoomIQ-LED`, `channel: preview`, `version: 1.0.0`,
  `chipFamily: ESP32-S3`, `improv: true`, `modules: ["VentIQ", "RoomIQ",
  "LED"]`.
* A new per-build manifest at `firmware-1.json` (the generator
  deterministically re-indexed Rescue from `firmware-1.json` to
  `firmware-2.json` to accommodate the new preview build between
  Release-One and Rescue).

**Importer hardening**: `scripts/import-firmware-sources.py` now enforces
a pinned `expected_sha256` field when present in a source entry —
the downloaded asset's SHA256 must match both the upstream
`checksums-sha256.txt` entry *and* the source entry's `expected_sha256`.
The Release-One source does not declare `expected_sha256` today, and
the behaviour for sources without the field is unchanged (verification
still runs against `checksums-sha256.txt` only).

**Per-source `block_tokens` invariants** are unchanged:

* Release-One source keeps `["FanTRIAC", "LED"]` — the LED block here
  is defence-in-depth against accidentally re-importing a future
  Release-One variant that ships an LED token.
* LED preview source uses `["FanTRIAC"]` only — adding `LED` here
  would make the importer reject the LED preview's own asset.
* The manifest-health guard still rejects `FanTRIAC` globally and
  enforces each source's `block_tokens` against its matching manifest
  build.

**Unchanged by WF-LED-002**:

* Release-One source entry (byte-identical).
* Release-One manifest build content (signatures + commit fields aside).
* Rescue build content.
* `REQUIRED_CONFIGS` in `.github/workflows/firmware-publish.yml` stays
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`. The LED preview enters
  `manifest.json` but **does not** enter the publish allowlist until
  upstream promotes the LED build to `status: production`.
* `scripts/data/kits.json` (Release-One-only). LED preview kit exposure
  is deferred to WF-LED-003.
* All UI / wizard / `sw.js` / `index.html` / workflow files.
* FanTRIAC blocked status (HW-005). FanTRIAC remains blocked globally
  by `manifest-health` and per-source by both `firmware/sources.json`
  entries.

The product-catalog alignment test's
`firmware/sources.json ↔ product catalog` describe block was relaxed
from production-only to admit `production` + `preview` source entries
(mirroring the existing manifest/kit `ELIGIBLE_STATUSES`); the
`REQUIRED_CONFIGS ↔ product catalog` block stays production-only via
its own separate test. The
`WF-PRODUCT-003 — upstream LED preview recognition` describe block was
updated to assert that the LED preview is now present in
`firmware/sources.json` + `manifest.json` while remaining absent from
`REQUIRED_CONFIGS` + `scripts/data/kits.json`.

### WF-LED-003 — LED preview exposure decision (Option A: manifest-only)

WF-LED-003 records the deliberate UX decision for the LED preview that
WF-LED-001 deferred and WF-LED-002 left untouched. **Option A wins:
manifest-only preview, no new kit, no new mode toggle, no wizard /
service-worker / workflow change.**

The reasoning is that the existing release-channel gate is already a
sufficient and correct exposure mechanism for an unverified preview
build:

* `scripts/utils/release-channels.js` declares the preview policy with
  `defaultSelectable: false` (never auto-selected, never tagged
  Recommended), `requiresAcknowledgement: true` (install gates on a
  `channel:preview` checkbox with experimental-build warning copy), and
  `hiddenByDefault: false` (the build remains visible in normal mode).
* The wizard already exposes the `LED` module: the
  `Sense360 LED <span>S360-300</span>` toggle and its hidden radios
  live in `index.html`, the `led` module key is wired into
  `MODULE_KEYS` / `MODULE_SEGMENT_FORMATTERS` / `parseConfigStringState`
  in `scripts/state.js`, and the `Sense360 LED` (S360-300) variant
  entry lives in `scripts/data/module-requirements.js`. Picking
  Ceiling + PoE + Bathroom + VentIQ + RoomIQ + LED produces
  `config_string: Ceiling-POE-VentIQ-RoomIQ-LED`, which (since
  WF-LED-002) resolves to the imported preview build.
* The combined effect is: stable Release-One is unchanged for any user
  who leaves the LED toggle off, and any user who turns LED on is
  funneled through the existing Preview badge + warning + acknowledgement
  gate before install can proceed. No fourth release mode is needed and
  none is introduced. `state.js`'s `VALID_RELEASE_MODES` stays
  `normal` / `recovery` / `development`.

WF-LED-003 deliberately does **not**:

* add an LED preview kit to `scripts/data/kits.json`;
* add an LED preview preset to `scripts/recommended-bundle.js`;
* introduce a `?mode=preview` URL parameter or any new release mode;
* relax `preview.defaultSelectable` / `preview.requiresAcknowledgement`
  / `preview.hiddenByDefault` in `scripts/utils/release-channels.js`;
* import firmware, regenerate manifests, or touch
  `firmware/sources.json`;
* mark the LED preview stable, add it to `REQUIRED_CONFIGS`, or unblock
  FanTRIAC.

A single targeted policy test was added to
`__tests__/release-channel-ui.test.js` (the
`WF-LED-003 — LED preview exposure model …` describe block) that pins
the LED-preview-shaped build against the exposure model: not
auto-selected by `pickDefaultBuild` (even as the sole candidate), stable
wins when both are candidates, `channel:preview` acknowledgement
required, visible in normal mode, Preview badge with warning tone,
never tagged Recommended. The pre-existing synthetic preview pins in
`__tests__/release-channels.test.js`, the manifest-shape / kit-shape /
`REQUIRED_CONFIGS` locks in
`__tests__/product-catalog-alignment.test.js`, and the LED kit guards
in `__tests__/kits-json.test.js` cover the remaining invariants.

A future WF-LED-004 may revisit the UX surface once **either** upstream
promotes the LED catalog entry to `status: production` (which would
unblock a `REQUIRED_CONFIGS` entry) **or** S360-300 bench verification
clears the LED hardware path (which would justify an explicit preview
kit or a dedicated preview-channel control). Neither precondition has
landed; WF-LED-003 does not act on either.

See [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md)
for the operator-validation container for the LED preview flash
path. WF-HW-TEST-001 recorded the pre-flight evidence and the
operator procedure; WF-HW-TEST-002 was the planned
operator-evidence-collection follow-up but **no operator evidence
was supplied**, so the hardware flash itself is
**pending — operator hardware test required** and no row was
flipped to a recorded outcome by WF-HW-TEST-002.

### WF-PRODUCT-004 — import readiness validator

[`docs/product-import-readiness.md`](product-import-readiness.md) and
[`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js)
add an advisory validator that classifies upstream product-catalog
entries against four independent surfaces (import / manifest /
`REQUIRED_CONFIGS` / kits) and cross-checks the live WebFlash surfaces
against the catalog lifecycle. It is reporting-only — it does not
import firmware, regenerate manifests, change `REQUIRED_CONFIGS`,
modify kits, or alter any UI / wizard / service-worker / workflow
surface. Run it before declaring a new source (sanity-check the
upstream catalog entry) or after regenerating manifests (confirm the
new surface state still matches the catalog):

```bash
node scripts/validate-product-import-readiness.js
node scripts/validate-product-import-readiness.js \
  --catalog /tmp/upstream-product-catalog.json \
  --config Ceiling-POE-VentIQ-RoomIQ-LED
node scripts/validate-product-import-readiness.js --format json
```

The validator's rules are the human-readable form of the assertions in
`__tests__/product-catalog-alignment.test.js`; see
`__tests__/product-import-readiness.test.js` for the Jest pin.

### WF-IMPORT-GAP-001 — WebFlash import readiness matrix

[`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
records the WebFlash-side import readiness matrix: when an upstream
release artifact is allowed to enter the WebFlash repo, what *class*
of import (`stable`, `preview`, `advanced / manual-warning`, `rescue`,
`docs-only`, `legacy-only`, `none`) it would be, and what runtime
exposure (`REQUIRED_CONFIGS`, kits, recommended path, preview /
advanced acknowledgement) that import does and does not unlock. The
matrix sits *in front of* the import mechanism documented here:
WF-PRODUCT-004 answers *catalog → eligibility*, WF-IMPORT-GAP-001
answers *eligibility → import sequencing*, and this doc describes
how the importer actually runs once the matrix says an import is
allowed.

WF-IMPORT-GAP-001 is documentation-only — it does not import
firmware, regenerate manifests, change `firmware/sources.json`,
change `REQUIRED_CONFIGS`, modify `scripts/data/kits.json`, or alter
any runtime / wizard / service-worker / workflow / test surface. It
reserves follow-up PR identifiers (`WF-IMPORT-RELAY-001`,
`WF-IMPORT-PWM-001`, `WF-IMPORT-DAC-001`, `WF-IMPORT-TRIAC-001`,
`WF-IMPORT-POWER-400-001`, `WF-IMPORT-POE-410-001`,
`WF-LED-STABLE-001`, `WF-REQUIRED-001`, `WF-KIT-LED-001`) for the
deliberate per-family imports and exposure decisions that will run
through the importer documented above. Release-One, the LED preview,
Rescue, the `REQUIRED_CONFIGS` allowlist, the kit list, and the
FanTRIAC HW-005 block are unchanged by WF-IMPORT-GAP-001.
