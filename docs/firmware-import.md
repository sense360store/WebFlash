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
