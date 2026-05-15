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
5. Verifies size `>= min_size_bytes` (default 102_400). Smaller binaries are
   rejected as placeholders or truncated downloads.
6. Asserts the filename's parsed `config_string` matches the entry's declared
   `config_string`.
7. Asserts none of the entry's `block_tokens` (default `["FanTRIAC", "LED"]`)
   appear in the filename or parsed module list.
8. Parses the release body and refuses if any of `Changelog`, `Known Issues`,
   `Features`, `Hardware Requirements` is missing.
9. Writes the `.bin` to `firmware/configurations/<asset_name>` and a
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
  "improv": true,
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
