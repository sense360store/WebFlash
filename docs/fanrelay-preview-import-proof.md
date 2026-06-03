# FanRelay preview import proof (WEBFLASH-RELAY-001)

This is the WebFlash-side import-proof record for the **FanRelay manual-preview
firmware** pulled from the upstream `sense360store/esphome-public` release
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview).

It records exactly what was imported, the verification that ran, the build
provenance, the upstream eligibility decision that authorised the import, and the
deliberate Advanced-install-only preview posture. It complements:

- [`docs/firmware-import.md`](firmware-import.md) — the importer mechanism.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — per-family import classes.
- [`docs/product-import-readiness.md`](product-import-readiness.md) — catalog
  eligibility classifier.
- [`docs/preview-import-first-batch-proof.md`](preview-import-first-batch-proof.md)
  — the first preview batch (AirIQ / RoomIQ / RoomIQ-LED).
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.

## Upstream eligibility decision (the unblock)

FanRelay was previously **not** WebFlash-importable: its upstream
`config/product-catalog.json` status is `hardware-pending` and
`webflash_build_matrix` is `false`, both of which the WebFlash catalog-alignment
guard rejects. WEBFLASH-RELAY-001 was held until upstream provided an explicit
authorisation.

Upstream PR
[`#711`](https://github.com/sense360store/esphome-public/pull/711)
(`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`, merged 2026-06-03) introduced a
**structured per-target WebFlash-import authorisation** in
`config/preview-release-targets.json` that is independent of the catalog
lifecycle `status`:

```json
"config_string": "Ceiling-POE-VentIQ-FanRelay-RoomIQ",
"webflash_import_eligibility": {
  "eligible": true,
  "exposure_class": "acknowledgement-gated"
},
"build_channel": "preview",
"delivery_lane": "manual-preview"
```

Upstream's two-concept model:

- **`webflash_import_eligibility.eligible`** = "WebFlash *may* import this as a
  preview" → **`true`** for FanRelay / FanPWM / FanDAC.
- **`webflash_build_matrix` / committed `config/webflash-builds.json` row** = "a
  committed one-click upstream build row" → **stays `false`** (no fan row added).

So `webflash_build_matrix: false` no longer means "preview import forbidden"; it
means "no committed upstream WebFlash build row". The downstream committed import
is exactly this WebFlash-side slice. The catalog `status` stays
`hardware-pending` (stable / full release stays blocked on mains-safety /
installation-approval / creepage / clearance evidence + competent-person
sign-off + GPIO3 strap-pin boot characterisation). **FanTRIAC stays
`eligible: false`** (build-blocked) and is **excluded**.

WebFlash honours `webflash_import_eligibility.eligible=true` for **import /
manifest / kit** eligibility only. It is **never** honoured for
`REQUIRED_CONFIGS` (production-only), and it is **never** honoured when
`eligible !== true`. This recognises a new, explicit upstream signal; it does not
relax the lifecycle-status gate for any entry that lacks it.

## Upstream source

| Field | Value |
|---|---|
| Source repo | `sense360store/esphome-public` |
| Release tag | `v1.0.0-preview` (prerelease) |
| Release URL | https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview |
| Source git sha | `0963afb9c9582f5021019d1635421e41c9dd10f6` |
| ESPHome version | `2026.4.5` |
| Hosted compile-proof run | [`26821900127`](https://github.com/sense360store/esphome-public/actions/runs/26821900127) (Preview Compile Dry-Run) |
| Eligibility decision | `RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001` (upstream PR #711) |

The upstream release body carries all four required `##` sections (Changelog,
Known Issues, Features, Hardware Requirements) and explicitly states the fan
artifacts are firmware-build proof only: not stable, not recommended, not a
customer default, not hardware verified, not buyable.

## What was imported (one build)

A single preview-channel build was imported into `firmware/configurations/` and
added to `manifest.json` (which grew from 6 to 7 builds):

| `config_string` | Asset | SHA256 | Size (bytes) | MD5 | `block_tokens` |
|---|---|---|---|---|---|
| `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanRelay-RoomIQ-v1.0.0-preview.bin` | `f9600a6b7891b520eff28314a001ff3b0d566224d3ab7d82de2e15242d026ca4` | 989,840 | `957da50def81ff919e028ee1ee40b263` | `["FanTRIAC", "LED"]` |

The source `block_tokens` are `["FanTRIAC", "LED"]` because the FanRelay config
carries neither token; blocking both keeps FanTRIAC and LED out of this source.

## What was NOT imported (and why)

- **FanPWM (`Ceiling-POE-FanPWM`)** and **FanDAC (`Ceiling-POE-FanDAC`)** — these
  are upstream-import-eligible (`webflash_import_eligibility.eligible=true`) too,
  but are **out of scope** for WEBFLASH-RELAY-001. They are reserved for the
  separate `WF-IMPORT-PWM-001` / `WF-IMPORT-DAC-001` follow-ups.
- **FanTRIAC** (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`) — upstream
  `eligible: false` (build-blocked); remains excluded and import-blocked.
- **No change** to Release-One, the LED preview, the first preview batch, or
  Rescue build content (only generator-refreshed provenance fields differ).

## Verification performed

All verification ran through the standard importer
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py); no
verification step was weakened or skipped. The importer's release-metadata fetch
normally hits `api.github.com`; in the import environment that endpoint was
network-restricted (HTTP 403 anonymous), so the `--release-payload-file` escape
hatch supplied the release metadata (obtained from the authoritative GitHub
release record) while the **binary was still downloaded over the network from
`github.com/.../releases/download/...` and verified for real**. The build passed:

1. **Required assets present** — `.bin` + `checksums-sha256.txt` +
   `checksums-md5.txt` + `manifest.json`.
2. **Release-body sections present** — the four canonical `##` sections.
3. **SHA256 vs upstream `checksums-sha256.txt`** — match.
4. **SHA256 vs source entry's pinned `expected_sha256`** — match (defence in
   depth).
5. **Filename == declared `asset_name`**, size ≥ `min_size_bytes` (102,400).
6. **Parsed `config_string` == declared `config_string`.**
7. **`block_tokens` absent** from filename / module list / `config_string`.

Commands (run on branch `claude/zen-gauss-Eg7yo`):

```bash
# Import (single-entry sources file + the verified release payload):
python3 scripts/import-firmware-sources.py \
  --sources <single-entry sources.json> \
  --source-repo sense360store/esphome-public \
  --release-tag v1.0.0-preview \
  --release-payload-file <v1.0.0-preview release metadata>
# → wrote firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanRelay-RoomIQ-v1.0.0-preview.bin
#   + .meta.json   (exit 0)

# Manifest regeneration (development mode = committed dev signing key):
python3 scripts/gen-manifests.py --firmware-dir firmware \
  --manifest-path manifest.json --manifest-prefix firmware- \
  --mode development --summary
# → Generated manifest.json and 7 ESP Web Tools manifest file(s) with 7 build entries.

# Validators:
node scripts/validate-naming-policy.js firmware/configurations   # ✅ passed
node scripts/validate-product-import-readiness.js                # exit 0, no cross-surface findings
npm test                                                         # 1437 passed / 78 suites
python3 -m unittest discover -s __tests__/python                 # 64 passed
```

On-disk SHA256 + size were re-confirmed to match the upstream values
(`f9600a6b…d026ca4` / 989,840 bytes).

## Manifest result

`gen-manifests.py` produced seven builds in deterministic order:

| `firmware-N.json` | `config_string` | Channel |
|---|---|---|
| `firmware-0.json` | `Ceiling-POE-AirIQ-RoomIQ` | preview |
| `firmware-1.json` | `Ceiling-POE-RoomIQ` | preview |
| `firmware-2.json` | `Ceiling-POE-RoomIQ-LED` | preview |
| `firmware-3.json` | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | **preview (FanRelay)** |
| `firmware-4.json` | `Ceiling-POE-VentIQ-RoomIQ` | stable (Release-One) |
| `firmware-5.json` | `Ceiling-POE-VentIQ-RoomIQ-LED` | preview (VentIQ LED preview) |
| `firmware-6.json` | `Rescue` | rescue |

The per-build manifest **indices are not stable** across regenerations (nothing
in the runtime hardcodes a `firmware-N.json` index — the wizard resolves builds
via `manifest.json` + `config_string`). The Release-One stable, the first preview
batch, the VentIQ LED preview, and the Rescue build entries are byte-identical to
before except for the `source_commit` / `source_url` / `build_date` provenance
fields the generator refreshes on every run; their `sha256` / `md5` /
`signature` / `signature_ed25519` / `file_size` are unchanged.

## Exposure / runtime

- **Module availability:** `Sense360 Relay` (S360-310) moves from
  `design-pending` to `available-preview` in
  [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js)
  with a bespoke installer/developer-preview warning detail. The card stays
  selectable in the Advanced (custom) path; install gates on the existing
  `channel:preview` acknowledgement.
- **Install gate unchanged:** the FanRelay build is a `preview`-channel build, so
  it is never auto-selected (`preview.defaultSelectable: false`) and requires the
  `channel:preview` acknowledgement (`scripts/utils/release-channels.js`). The
  default **Simple install** path still resolves only to the stable Bathroom PoE
  build `Ceiling-POE-VentIQ-RoomIQ`.

## Posture — preview / manual-preview only

This build is **firmware-build proof only**:

- preview / manual-preview firmware,
- fan relay control is an installer / developer preview,
- **not** stable,
- **not** recommended,
- **not** a customer default,
- **not** a kit / `REQUIRED_CONFIGS` entry,
- **not** buyable as a public shop product,
- with **no** hardware, bench, compliance, safety, or commercial-availability
  proof.

Normal customers should use the stable Bathroom PoE build
`Ceiling-POE-VentIQ-RoomIQ`.

## Do-not-change list (this PR)

Unchanged by WEBFLASH-RELAY-001:

- `REQUIRED_CONFIGS` stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
  (production-only) in `.github/workflows/firmware-publish.yml`.
- `scripts/data/kits.json` stays Release-One-only; `scripts/data/kit-presets.js`
  is unchanged (no FanRelay bundle card).
- Release-One stable, the first preview batch, the VentIQ LED preview, and Rescue
  build **content** (signatures / hashes / sizes) — only generator-refreshed
  provenance fields changed.
- `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the
  install gate / preflight / freshness engines, `scripts/simple-install.js`,
  `sw.js`, `_headers`, `index.html`, every CSS file, every `.github/workflows/*`
  file.
- The FanTRIAC import block (importer `block_tokens` enforcement + manifest-health
  guard), the WF-LED-003 preview-channel acknowledgement model, and the
  WF-TRIAC-001 advanced/manual-warning gate.
- **No FanPWM / FanDAC / FanTRIAC firmware imported. No LED-stable claim. No
  hardware / bench / compliance / safety / commercial-availability proof claimed.**

The runtime change is the Relay availability flip (`design-pending` →
`available-preview`) plus the guard recognition of
`webflash_import_eligibility.eligible` in
[`__tests__/product-catalog-alignment.test.js`](../__tests__/product-catalog-alignment.test.js)
and [`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js)
— honouring the new upstream signal, not weakening any check.
