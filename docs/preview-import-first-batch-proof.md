# Preview firmware first-batch import proof (WF-PREVIEW-IMPORT-FIRST-BATCH-001)

This is the WebFlash-side import-proof record for the **first batch of preview
firmware** pulled from the upstream `sense360store/esphome-public` release
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview).

It records exactly what was imported, the verification that ran, the build
provenance, and the deliberate preview-only posture. It complements:

- [`docs/firmware-import.md`](firmware-import.md) — the importer mechanism.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — per-family import classes.
- [`docs/product-import-readiness.md`](product-import-readiness.md) — catalog
  eligibility classifier.
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.

## Upstream source

| Field | Value |
|---|---|
| Source repo | `sense360store/esphome-public` |
| Release tag | `v1.0.0-preview` (prerelease) |
| Release URL | https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview |
| Build git sha | `2228bbb785a8d5b214d92cae08d1c760ba36ec47` |
| ESPHome version | `2026.4.5` |
| Hosted compile-proof run | [`26821900127`](https://github.com/sense360store/esphome-public/actions/runs/26821900127) (Preview Compile Dry-Run, `workflow_dispatch`, 2026-06-02) |
| Upstream result-record PR | `sense360store/esphome-public#701` |

The upstream release body carries all four required `##` sections (Changelog,
Known Issues, Features, Hardware Requirements) and explicitly states the builds
are **firmware-build proof only**: not stable, not recommended, not a customer
default, not hardware verified, not a public shop product. The upstream catalog
(`config/product-catalog.json`) lists all four configs as `status: preview`, and
`config/webflash-builds.json` marks them `webflash_exposure_class:
acknowledgement-gated`, `warning_copy_key: preview`, `buyable: false`,
`recommended: false`, `customer_default: false`, `stable: false`.

## What was imported (three builds)

Three preview-channel builds were imported into `firmware/configurations/` and
added to `manifest.json` (which grew from 3 to 6 builds):

| `config_string` | Asset | SHA256 | Size (bytes) | MD5 | `block_tokens` |
|---|---|---|---|---|---|
| `Ceiling-POE-AirIQ-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-RoomIQ-v1.0.0-preview.bin` | `16565de6cd8b62c51d4fa8041eb5ffdb29fd2b8daddceecd73a6b0df5d722bc7` | 1,089,296 | `64ac41cae277f972cff14d42f918a94c` | `["FanTRIAC", "LED"]` |
| `Ceiling-POE-RoomIQ` | `Sense360-Ceiling-POE-RoomIQ-v1.0.0-preview.bin` | `2c7d691c70a557d8df4ef2ba58a6dc43195b952b6c209c89d5522a392f47b937` | 956,976 | `36e703b6449987aa19b4f434b68c85f7` | `["FanTRIAC", "LED"]` |
| `Ceiling-POE-RoomIQ-LED` | `Sense360-Ceiling-POE-RoomIQ-LED-v1.0.0-preview.bin` | `d4f18824466e95ba091dfd80e8159d544613e4c28f70f03ba81e9c8a676c9cb0` | 1,006,848 | `aeee599ed9f635564710f7bae793399c` | `["FanTRIAC"]` |

The `Ceiling-POE-RoomIQ-LED` source uses `block_tokens: ["FanTRIAC"]` (not
`["FanTRIAC", "LED"]`) because the config legitimately carries the `LED` token;
blocking `LED` would make the importer reject its own asset. The two non-LED
configs block both tokens.

## What was NOT imported (and why)

- **`Ceiling-POE-VentIQ-RoomIQ-LED` (the 4th `v1.0.0-preview` asset)** was **not**
  re-imported. That `config_string` already ships from the earlier
  `v1.0.0-led-preview` release (SHA256
  `93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`,
  1,135,904 bytes). The `v1.0.0-preview` variant is a *different* binary
  (1,027,744 bytes) under the **same filename**, so importing it would overwrite
  a published `.bin` in place and break the existing `v1.0.0-led-preview`
  behaviour. Both are forbidden, so the existing LED preview is kept unchanged
  and that config is already satisfied as a preview option.
- **No TRIAC** (FanTRIAC) — guardrail; remains blocked.
- **No fan manual-preview targets** (FanRelay / FanPWM / FanDAC) — not present in
  this release and not imported.

## Verification performed

All verification ran through the standard importer
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py);
no verification step was weakened or skipped. The importer's release-metadata
fetch normally hits `api.github.com`; in the import environment that endpoint
was network-restricted, so the `--release-payload-file` escape hatch supplied
the release metadata (obtained from the authoritative GitHub release record)
while the **binaries were still downloaded over the network from
`github.com/.../releases/download/...` and verified for real**. Each build
passed:

1. **Required assets present** — `.bin` + `checksums-sha256.txt` +
   `checksums-md5.txt` + `manifest.json`.
2. **Release-body sections present** — the four canonical `##` sections.
3. **SHA256 vs upstream `checksums-sha256.txt`** — match.
4. **SHA256 vs source entry's pinned `expected_sha256`** — match (defence in
   depth).
5. **Filename == declared `asset_name`**, size ≥ `min_size_bytes` (102,400).
6. **Parsed `config_string` == declared `config_string`.**
7. **`block_tokens` absent** from filename / module list / `config_string`.

Commands (run on branch `claude/zealous-hawking-P3aK5`):

```bash
# Per-config import (single-entry sources files + the verified release payload):
python3 scripts/import-firmware-sources.py \
  --sources <single-entry sources.json> \
  --source-repo sense360store/esphome-public \
  --release-tag v1.0.0-preview \
  --release-payload-file <v1.0.0-preview release metadata>
# → wrote firmware/configurations/<asset>.bin + <asset>.meta.json   (exit 0)

# Manifest regeneration (development mode = committed dev signing key):
python3 scripts/gen-manifests.py --firmware-dir firmware \
  --manifest-path manifest.json --manifest-prefix firmware- \
  --mode development --summary
# → Generated manifest.json and 6 ESP Web Tools manifest file(s) with 6 build entries.

# Validators:
node scripts/validate-naming-policy.js firmware/configurations   # ✅ passed
node scripts/validate-product-import-readiness.js                # exit 0, no cross-surface findings
npm test                                                         # 1401 passed / 77 suites
python3 -m unittest discover -s __tests__/python                 # 64 passed
```

On-disk SHA256 + size were re-confirmed to match the upstream values for all
three imported binaries.

## Manifest result

`gen-manifests.py` produced six builds in deterministic order:

| `firmware-N.json` | `config_string` | Channel |
|---|---|---|
| `firmware-0.json` | `Ceiling-POE-AirIQ-RoomIQ` | preview |
| `firmware-1.json` | `Ceiling-POE-RoomIQ` | preview |
| `firmware-2.json` | `Ceiling-POE-RoomIQ-LED` | preview |
| `firmware-3.json` | `Ceiling-POE-VentIQ-RoomIQ` | stable (Release-One) |
| `firmware-4.json` | `Ceiling-POE-VentIQ-RoomIQ-LED` | preview (LED preview) |
| `firmware-5.json` | `Rescue` | rescue |

The per-build manifest **indices are not stable** across regenerations (nothing
in the runtime hardcodes a `firmware-N.json` index — the wizard resolves builds
via `manifest.json` + `config_string`). The Release-One stable, VentIQ LED
preview, and Rescue build entries are byte-identical to before except for the
`source_commit` / `source_url` / `build_date` provenance fields the generator
refreshes on every run; their `sha256` / `md5` / `signature` /
`signature_ed25519` / `file_size` are unchanged.

## Posture — preview only

These builds are **firmware-build proof only**:

- preview firmware,
- **not** stable,
- **not** recommended,
- **not** a customer default,
- **not** hardware verified,
- **not** buyable as a public shop product,
- with **no** hardware / bench / compliance / commercial-availability proof.

Exposure is via the existing release-channel gate
([`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js)):
`preview.defaultSelectable: false` (never auto-selected),
`preview.requiresAcknowledgement: true` (install gates on a `channel:preview`
acknowledgement with experimental-build warning copy). They appear only in the
Advanced / custom install path. The default **Simple install** path is unchanged
and still resolves only to the stable Bathroom PoE build
`Ceiling-POE-VentIQ-RoomIQ`. Normal customers should use that stable build.

## Do-not-change list (this PR)

Unchanged by WF-PREVIEW-IMPORT-FIRST-BATCH-001:

- `REQUIRED_CONFIGS` stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
  (production-only) in `.github/workflows/firmware-publish.yml`.
- `scripts/data/kits.json` stays Release-One-only; the candidate room bundles
  stay hidden / not buyable.
- Release-One stable, VentIQ LED preview, and Rescue build **content**
  (signatures / hashes / sizes) — only generator-refreshed provenance fields
  changed.
- `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`,
  the install gate / preflight / freshness engines, `scripts/data/kit-presets.js`,
  `scripts/data/module-requirements.js`, `sw.js`, `_headers`, `index.html`,
  every CSS file, every `.github/workflows/*` file.
- The FanTRIAC HW-005 import block (importer `block_tokens` enforcement), the
  WF-LED-003 preview-channel acknowledgement model, and the WF-TRIAC-001
  advanced/manual-warning gate.
- No TRIAC and no fan-driver (FanRelay / FanPWM / FanDAC) firmware imported. No
  LED-stable claim. No `RELEASE-007` / `S360-300-BENCH-001` completion claim.

The only runtime change is the removal of the static AirIQ `no-firmware`
override in [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js)
so AirIQ derives `available-preview` from the now-present manifest build — the
honest reflection of "a preview build exists," matching how LED is handled.
