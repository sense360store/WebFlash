# Developer Guide

This guide covers firmware publishing, manifest generation, and deployment workflows for WebFlash maintainers.

## Overview

WebFlash uses automated manifest generation to maintain firmware catalogs. All manifests are generated from firmware files - manual editing is not required.

See [`docs/wizard-ux-roadmap.md`](docs/wizard-ux-roadmap.md) for the live-wizard UX audit (WF-UX-001) and the PR sequence (`WF-UX-QUICK-001` through `WF-UX-007`, plus the operator-only `WF-HW-TEST-001` / `WF-HW-TEST-002` chain) tracking wizard-facing improvements. The roadmap is docs-only and does not change runtime UI behaviour, manifest generation, or any of the publishing steps documented below. The operator-validation container for the LED preview flash path lives at [`docs/led-preview-webflash-proof.md`](docs/led-preview-webflash-proof.md) (status: **pending — operator hardware test required**). WF-HW-TEST-001 captured the pre-flight live-deployment evidence and operator procedure; WF-HW-TEST-002 was the planned operator-evidence-collection follow-up but **no operator evidence was supplied**, so proof rows stay pending — LED preview channel, FanTRIAC blocked status, `REQUIRED_CONFIGS`, kits, manifest, firmware, and workflow surfaces are unchanged by WF-HW-TEST-002, and `S360-300-BENCH-001` / RELEASE-007 remain separate gates.

## Prerequisites

- Python 3.7+
- Git
- Access to repository
- Firmware binary files (.bin)

## Quick Reference

### Add Firmware

**The canonical intake path is the cross-repo importer** ([next section](#import-firmware-from-esphome-public-github-releases)). New shipping firmware should be declared in [`firmware/sources.json`](firmware/sources.json) and pulled in via [`scripts/import-firmware-sources.py`](scripts/import-firmware-sources.py), which generates the `.meta.json` sidecar from the upstream release body and refuses any asset that fails SHA256 verification or carries a blocked token (`FanTRIAC`, `LED`). The Rescue firmware (built in-tree under `firmware/rescue/`) is the only sanctioned exception.

The legacy "drop a `.bin` into the directory and re-run the generator" flow is preserved below for hand-curated builds that already satisfy the sidecar / source-declaration / manifest-health expectations, but it is **not** how new Release-One firmware should arrive. The `__tests__/manifest-health.test.js` guard (WF-CLEANUP-006) fails CI if any `manifest.json` build references a missing `.bin`, or if a `firmware/configurations/*.bin` is missing its `.meta.json` sidecar.

```bash
# Legacy direct-commit flow — use the importer (next section) for upstream
# firmware. Use this only when you have a hand-curated build that already has
# a matching .meta.json sidecar, satisfies block_tokens, and is recognised by
# REQUIRED_CONFIGS.

# 1. Place firmware in directory
cp firmware.bin firmware/configurations/Sense360-[Config]-v[Version]-[Channel].bin

# 2. Create release notes (optional)
# stable notes (production-discoverable):
nano firmware/configurations/Sense360-[Config]-v[Version]-stable.md
# preview/beta notes (non-production path):
nano firmware/previews/Sense360-[Config]-v[Version]-[Channel].md

# 3. Generate manifests
python3 scripts/gen-manifests.py --summary

# 4. Commit and push
git add .
git commit -m "Add [Config] v[Version] firmware"
git push origin main
```

### Import Firmware from `esphome-public` GitHub Releases

Cross-repo firmware imports are declared in
[`firmware/sources.json`](firmware/sources.json) and run via
[`scripts/import-firmware-sources.py`](scripts/import-firmware-sources.py).
The importer downloads the `.bin`, verifies its SHA256 against the upstream
`checksums-sha256.txt`, parses the release body, generates a sidecar with
source provenance, and stages everything under `firmware/configurations/`
for the existing signing + manifest-generation pipeline.

```bash
# 1. Run the importer (single source, or omit flags to import everything)
python3 scripts/import-firmware-sources.py \
  --source-repo sense360store/esphome-public \
  --release-tag v1.0.0

# 2. Regenerate manifests + sign
python3 scripts/gen-manifests.py --summary

# 3. Commit the .bin, .meta.json, manifest.json, and firmware-N.json
git add firmware/configurations manifest.json firmware-*.json
git commit -m "Import Ceiling-POE-VentIQ-RoomIQ from esphome-public v1.0.0"
```

Or run [`firmware-import.yml`](.github/workflows/firmware-import.yml) via
`workflow_dispatch` to do the same in CI; it auto-commits the result to the
branch you dispatch from and never auto-merges or deploys directly.

See [`docs/firmware-import.md`](docs/firmware-import.md) for the full
contract: required release-body sections, blocked tokens, sidecar provenance
fields, and the smoke-check pipeline.

### Remove Firmware
```bash
# 1. Delete firmware file
rm firmware/configurations/Sense360-[CoreType]-[Config]-v[Version]-[Channel].bin

# 2. Delete release notes
rm firmware/configurations/Sense360-[CoreType]-[Config]-v[Version]-stable.md
rm firmware/previews/Sense360-[CoreType]-[Config]-v[Version]-[Channel].md

# 3. Regenerate manifests
python3 scripts/gen-manifests.py --summary

# 4. Commit and push
git add .
git commit -m "Remove [Config] v[Version] firmware"
git push origin main
```

## Firmware File Naming

Firmware files must follow this exact naming convention:

```
Sense360-[CoreType]-[MountType]-[PowerType]-[Modules]-v[Version]-[Channel].bin
```

### Components

**MountType**: `Ceiling` is the only supported mount. (`Wall` lingers as a legacy alias but no firmware should target it.)

**Voice** (legacy / not WebFlash-installable today): `Voice` is preserved as a recognised filename token by the naming-policy validator and as a URL alias by `scripts/utils/url-config.js` so old shareable links still resolve, but the customer-facing wizard exposes only the standard `voice=none` ("Core") radio and no Voice-bearing firmware is currently published. Do not author new Voice-bearing filenames; the segment is documented here only so the validator and URL parser contracts remain readable.

**PowerType**: `USB`, `POE`, or `PWR`. These map to USB Power, Sense360 PoE PSU (`S360-410`), and Sense360 240v PSU (`S360-400`) respectively.

**Modules** (optional): Combination of canonical SKU tokens:
- `RoomIQ` — Sense360 RoomIQ (`S360-200`). Room sensor board: PIR, LD2450 (mmWave presence), SEN0609, LTR-303ALS (light), SHT4x (temp/humidity), BMP581 (pressure).
- `AirIQ` — Sense360 AirIQ (`S360-210`). Air-quality stack: SCD41 (CO₂), SGP41 (VOC), MICS-4514 (gas), with optional SPS30 (PM) / SFA30 (HCHO) connectors.
- `VentIQ` — Sense360 VentIQ (`S360-211`). Bathroom-focused air-quality stack with onboard SGP41; IR-temp and SPS30 connectors. Ceiling + Bathroom mode only.
- `Fan` — Sense360 driver (`S360-310` Relay, `S360-311` PWM, or `S360-312` DAC). The specific driver is selected at runtime via the wizard.
- `LED` — Sense360 LED (`S360-300`), addressable WS2812B ring. Selectable via the LED module toggle in the wizard; when paired with Ceiling + PoE + VentIQ + RoomIQ it resolves to the current LED preview build (`Ceiling-POE-VentIQ-RoomIQ-LED`, `channel: preview`, gated by the existing `channel:preview` acknowledgement).

**Module Constraints:**
- `Bathroom` is only available for Ceiling installations.
- `VentIQ` requires `Bathroom` to be enabled.
- `AirIQ` and `VentIQ` are mutually exclusive: the Bathroom toggle drives which one is visible on Ceiling mounts.
- `DAC` (`S360-312`) conflicts with `AirIQ` because both contend for the shared DAC bus.

**Module Sensors:**
- Sense360 RoomIQ (`S360-200`): PIR, LD2450 (mmWave presence), SEN0609, LTR-303ALS (light), SHT4x (temp/humidity), BMP581 (pressure).
- Sense360 AirIQ (`S360-210`): SCD41 (CO₂), SGP41 (VOC), MICS-4514 + STM8 (gas), optional SPS30 (PM), optional SFA30 (HCHO).
- Sense360 VentIQ (`S360-211`): SGP41 (VOC) onboard, optional MLX90614 (IR surface temp), optional SPS30 (PM).
- Sense360 LED (`S360-300`): WS2812B addressable LED ring.

**Version**: Semantic version (e.g., `1.0.0`, `1.2.3`)

**Channel**: `stable`, `preview`, or `beta`


### Canonical module token policy

Use these module tokens in firmware filenames and manifest metadata: `AirIQ`, `VentIQ`, `FanRelay`, `FanPWM`, `FanDAC`, `FanTRIAC`, `LED`, `Voice`.

Fan variants are encoded as variant-specific tokens because each driver SKU (S360-310 / S360-311 / S360-312 / S360-320) needs a different binary — the legacy generic `Fan` token is no longer accepted in new filenames.

The naming-policy validator (`scripts/validate-naming-policy.js`) actively rejects deprecated variant tokens — `AirIQBase`, `AirIQPro`, `AirIQProv`, `BathroomAirIQ` (and its `Base`/`Pro` suffixes), and `FanAnalog` (renamed to `FanDAC` to match the current SKU). These are still recognised as read-time aliases by tooling and URL parsing for backwards compatibility, but they must not be used in new filenames or metadata.

### Examples

These are the application firmware artifacts WebFlash currently ships. Both
are produced by the cross-repo importer (see
[`docs/firmware-import.md`](docs/firmware-import.md)) from
`sense360store/esphome-public` and live under `firmware/configurations/`
with matching `.meta.json` sidecars.

```
Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin       # Release-One (stable)
Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin  # LED preview (channel: preview, ack-gated)
```

The standalone Rescue artifact (`firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin`)
is built in-tree, not via the importer, and is the only sanctioned exception
to the `firmware/sources.json` source-of-truth contract.

#### Filename shape — historical / do-not-copy examples

Older filenames are preserved here only as period-accurate illustrations of
the `Sense360-[Mount]-[Power]-[Modules]-vX.Y.Z-[channel].bin` shape. **None
of these names ship today** — they reference configurations that are no
longer published, that use validator-rejected tokens (`Wall`, `Voice` in
filename position, `AirIQBase` / `AirIQPro`, `VentIQBase` / `VentIQPro`,
`FanAnalog`, `Core` / `CoreVoice` prefix), or that are currently blocked
from Release-One by `firmware/sources.json` `block_tokens` (`FanTRIAC`).
Do **not** copy these into new filenames; the naming-policy validator
will reject them, and the importer + manifest-health guards will refuse
to ship them.

```
# Historical / not currently shipping — illustrative only:
Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin
Sense360-Ceiling-PWR-AirIQ-v1.0.0-stable.bin
Sense360-Ceiling-USB-AirIQ-v1.0.0-stable.bin
Sense360-Ceiling-USB-FanPWM-v1.0.0-stable.bin
Sense360-Ceiling-USB-FanDAC-v1.0.0-stable.bin
Sense360-Ceiling-Voice-POE-AirIQ-v1.0.0-stable.bin   # Voice not customer-facing today
Sense360-Ceiling-Voice-USB-v1.0.0-stable.bin         # Voice not customer-facing today
```

`FanTRIAC` and `Wall` are accepted by the naming-policy validator as
*filename tokens* (so legacy artefacts can still be parsed by tooling) but
remain excluded from production WebFlash: `FanTRIAC` is blocked at import +
manifest-health time pending S360-320 hardware verification (HW-005), and
`Wall` is hidden from the wizard surface.


## Naming Policy Validator

Run the naming-policy validator before generating manifests or publishing:

```bash
node scripts/validate-naming-policy.js firmware/configurations
```

The validator enforces:

- **Allowed canonical token forms**: use `AirIQ`, `VentIQ`, `FanRelay`, `FanPWM`, `FanDAC`, `FanTRIAC`, `LED`, and `Voice` naming.
- **Disallowed/deprecated tokens**:
  - `AirIQProv` → migrate to `AirIQPro`
  - `AirIQBase` → migrate to `AirIQ`
  - `BathroomAirIQ` → migrate to `Bathroom`
  - `FanAnalog` → migrate to `FanDAC` (matches the renamed Sense360 DAC SKU)
- **Channel artifact placement**: only `stable` release notes (`*.md`) are allowed under `firmware/configurations/`. Preview/beta notes should not be stored in the production firmware directory.
- **Canonical filename shape**: `Sense360-...-vX.Y.Z-(stable|preview|beta).(bin|md)`

Migration rule of thumb: rename artifacts in place to canonical tokens, regenerate manifests, then verify CI passes.

## Release Notes

Release notes are optional markdown files with channel-based storage policy:
- `stable` notes live in `firmware/configurations/` (production-discoverable path).
- `preview`/`beta`/`dev` notes live in `firmware/previews/` (segregated non-production path).

### File Naming

Release notes files must match their firmware file:

```
# Firmware file
Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin

# Release notes file (stable)
firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.md

# Release notes file (preview/beta/dev)
firmware/previews/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.1.0-preview.md
```

### Format

```markdown
# Sense360 [Config] v[Version] ([Channel])

## Configuration Details
- **Mounting Type**: Ceiling
- **Power Option**: [USB/POE/PWR]
- **Expansion Modules**: [Modules list]
- **Chip Family**: ESP32-S3
- **Version**: v[Version]
- **Channel**: [stable/preview/beta]
- **Release Date**: YYYY-MM-DD

## Description
Brief description of this firmware release.

## Hardware Requirements
- Requirement 1
- Requirement 2
- Requirement 3

## Features
- Feature 1
- Feature 2
- Feature 3

## Installation Notes
Special installation instructions if any.

## Known Issues
- Issue 1
- Issue 2
```

## Manifest Generation

### Generate All Manifests

```bash
cd WebFlash
python3 scripts/gen-manifests.py --summary
```

This scans the firmware directory and:
1. Extracts metadata from filenames and paths
2. Loads release notes if available
3. Generates `manifest.json` with all firmware builds
4. Creates individual `firmware-N.json` files for ESP Web Tools
5. Adds Improv Serial support automatically
6. Uses relative URLs for GitHub Pages compatibility

### Preview Without Writing

```bash
python3 scripts/gen-manifests.py --summary --dry-run
```

Shows what would be generated without creating files.

### Verify Manifests

```bash
# Check manifest contents
python3 -c "
import json
with open('manifest.json') as f:
    data = json.load(f)
    print(f'Total builds: {len(data[\"builds\"])}')
    for build in data['builds']:
        print(f'{build[\"name\"]} v{build[\"version\"]} ({build[\"channel\"]})')
"

# List individual manifests
ls -la firmware-*.json
```

## Deployment

### Automated Deployment

GitHub Actions automatically:
1. Runs manifest generator on push to main
2. Deploys to GitHub Pages
3. Sets correct CORS headers for ESP Web Tools

No manual deployment steps required.

### Manual Deployment

For local testing:

```bash
# Start local server
python3 -m http.server 5000

# Test in browser
open http://localhost:5000
```

## Firmware Publishing Workflows

### Via Direct Commit (legacy)

> **Use the importer for upstream firmware.** Direct-commit intake is a
> legacy path retained for hand-curated builds that already have a matching
> `.meta.json` sidecar and would not be rejected by the manifest-health
> guard or the `block_tokens` allowlist (`FanTRIAC` and `LED` are currently
> blocked on the Release-One source). For Release-One imports from
> `sense360store/esphome-public`, see
> [Import Firmware from `esphome-public` GitHub Releases](#import-firmware-from-esphome-public-github-releases)
> above.

**For new shipping firmware, prefer the importer.** Declare the upstream
source in [`firmware/sources.json`](firmware/sources.json) and run
[`scripts/import-firmware-sources.py`](scripts/import-firmware-sources.py)
(or dispatch `.github/workflows/firmware-import.yml`); see
[`docs/firmware-import.md`](docs/firmware-import.md) for the full contract.
The importer fetches the upstream `.bin`, verifies its SHA256 against the
upstream `checksums-sha256.txt`, enforces the per-source `block_tokens`
allowlist, and writes the `<asset>.meta.json` sidecar that
`manifest-health.test.js` and `gen-manifests.py --mode production` require.

The legacy hand-copy walkthrough below is retained for hand-curated builds
that already satisfy the sidecar + naming-policy + manifest-health
contract. The Rescue firmware under `firmware/rescue/` is the only
sanctioned in-tree exception today.

```bash
# 1. Add firmware to repository (legacy flow; prefer the importer for new builds).
#    Use a canonical filename — Ceiling mount only, current modules only.
cp your-firmware.bin firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin

# 2. Author the matching .meta.json sidecar (changelog, known_issues, features,
#    hardware_requirements, signed_by, deprecated, artifact_type, improv).
#    See an existing sidecar under firmware/configurations/ for the schema.

# 3. (Optional) Stable release notes also live alongside the .bin:
cat > firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.md << 'EOF'
# Sense360 Ceiling POE VentIQ RoomIQ v1.0.0 (stable)
[Release notes content]
EOF

# 4. Generate manifests
python3 scripts/gen-manifests.py --summary

# 5. Verify
python3 -m http.server 5000  # Test locally

# 6. Commit and push (firmware binary + sidecar + regenerated manifests in
#    the same commit).
git add .
git commit -m "Add Ceiling-POE-VentIQ-RoomIQ v1.0.0 stable firmware"
git push origin main
```

### Via GitHub Releases (recommended)

The release-published workflow downloads the asset, derives a sidecar from
the release body, signs the manifest, and deploys — no manual sidecar
authoring required. The full operator flow is:

1. Build the firmware binary.
2. Create a GitHub Release.
3. Attach a correctly-named `.bin` asset (canonical
   `Sense360-...-vX.Y.Z-(stable|preview|beta).bin` — see "Firmware File Naming"
   above; rescue assets follow `Sense360-Rescue-vX.Y.Z-...bin`).
4. Fill in the release body using the four supported Markdown sections
   (`## Changelog`, `## Known Issues`, `## Features`, `## Hardware Requirements`).
5. Publish the release.
6. GitHub Actions runs `scripts/sync-from-releases.py`, which:
   - Downloads each `.bin` and stores it in `firmware/configurations/` (or
     `firmware/rescue/` for rescue builds).
   - Generates a matching `*.meta.json` sidecar from the release body unless
     a hand-curated sidecar already exists (manual sidecars always win).
   - Validates the stable-channel changelog (rejects empty/generic filler).
   - Signs and regenerates manifests via `scripts/gen-manifests.py`
     (`--mode production` when the `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64`
     secret is set), then deploys to GitHub Pages.

#### Example release asset

This worked example mirrors the current Release-One firmware
(`Ceiling-POE-VentIQ-RoomIQ`, imported from `sense360store/esphome-public`
v1.0.0). FanTRIAC and LED are intentionally absent — both tokens are
currently blocked from Release-One via `firmware/sources.json` `block_tokens`
and would be rejected by the importer.

```
Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin
```

#### Example release body

```markdown
## Changelog

- Initial production stable release for Ceiling-POE-VentIQ-RoomIQ
  with PoE power, VentIQ bathroom air-quality sensing, and RoomIQ
  room sensing.

## Known Issues

- Sense360 TRIAC / FanTRIAC is not included in this Release-One firmware.
- Sense360 TRIAC remains blocked until S360-320 schematic and direct GPIO
  / timing requirements are verified.

## Features

- PoE-powered Sense360 Core configuration
- VentIQ bathroom air-quality sensing
- RoomIQ room sensing

## Hardware Requirements

- Sense360 Core R4 or newer
- Sense360 PoE PSU
- Sense360 VentIQ module
- Sense360 RoomIQ module
- No Sense360 TRIAC module for this Release-One firmware
- No Sense360 LED module for this Release-One firmware
```

CI will produce
`firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.meta.json`
with this payload:

```json
{
  "changelog": [
    "Initial production stable release for Ceiling-POE-VentIQ-RoomIQ ..."
  ],
  "known_issues": [
    "Sense360 TRIAC / FanTRIAC is not included in this Release-One firmware.",
    "Sense360 TRIAC remains blocked until S360-320 schematic and direct GPIO/timing requirements are verified."
  ],
  "features": [
    "PoE-powered Sense360 Core configuration",
    "VentIQ bathroom air-quality sensing",
    "RoomIQ room sensing"
  ],
  "hardware_requirements": [
    "Sense360 Core R4 or newer",
    "Sense360 PoE PSU",
    "Sense360 VentIQ module",
    "Sense360 RoomIQ module",
    "No Sense360 TRIAC module for this Release-One firmware.",
    "No Sense360 LED module for this Release-One firmware."
  ],
  "signed_by": "Sense360 release pipeline",
  "deprecated": false,
  "deprecation_reason": null,
  "artifact_type": "application",
  "improv": true
}
```

Rescue assets (filename starts with `Sense360-Rescue-`) override
`artifact_type` to `"rescue"` and `improv` to `false` automatically; everything
else (signed_by, parsed body sections) is identical.

#### Stable-channel quality gate

`scripts/sync-from-releases.py` mirrors the changelog rules in
`scripts/gen-manifests.py`. CI fails the publish run when:

- The `## Changelog` section is missing or empty for a stable, non-rescue
  asset (rescue builds and preview/beta channels do not require a changelog
  in the release body).
- Every `## Changelog` bullet is generic filler — `Initial release`,
  `First release`, `Firmware release`, `See release notes`, `TBD`, `TODO`,
  `N/A`, `Placeholder`, `No changes`, `Nothing to report`.
- The asset filename does not match the canonical
  `Sense360-...-vX.Y.Z-(stable|preview|beta).bin` shape.
- A manual sidecar is malformed or otherwise rejected by
  `gen-manifests.py`'s validation.
- Production mode is requested but the
  `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` / `WEBFLASH_FIRMWARE_KEY_ID` secrets
  are not available.

When a hand-authored sidecar is committed alongside the binary it takes
precedence over the generated one; this preserves the existing manual
workflow for builds that need bespoke metadata (e.g. deprecation reasons,
custom `signed_by` identifiers).

#### Legacy CLI (kept for reference)

```bash
# 1. Create GitHub release
gh release create v1.0.0 \
  --title "Sense360 v1.0.0" \
  --notes "$(cat release-notes.md)" \
  firmware/*.bin

# 2. Workflow automatically syncs and deploys
```

## Verification Checklist

After adding firmware:

- [ ] Manifest generator runs without errors
- [ ] Firmware appears in `manifest.json`
- [ ] Individual manifest created (`firmware-N.json`)
- [ ] Release notes included if provided
- [ ] Improv support enabled (`"improv": true`)
- [ ] Local testing works (`python3 -m http.server 5000`)
- [ ] Firmware visible in WebFlash wizard
- [ ] Installation works via ESP Web Tools

After removing firmware:

- [ ] Manifest generator runs without errors
- [ ] Firmware removed from `manifest.json`
- [ ] Individual manifest deleted
- [ ] Remaining manifests renumbered correctly
- [ ] Firmware not visible in WebFlash wizard

## Testing

### Manual Testing

```bash
# Start local server
python3 -m http.server 5000

# In browser:
# 1. Navigate to http://localhost:5000
# 2. Step through wizard
# 3. Verify firmware appears in recommendations
# 4. Test "Install Firmware" button
# 5. Verify serial logs capture works
```

### Automated Testing

```bash
# Run test suite (if available)
python3 -m pytest

# Test manifest generation
python3 scripts/gen-manifests.py --summary --dry-run
```

`__tests__/manifest-health.test.js` is the WF-CLEANUP-006 guard: it runs
under the same `npm test -- --ci` step the publish workflow already uses
and fails CI before deploy if `manifest.json` or any `firmware-*.json`
references a missing `.bin`, if a `firmware/configurations/*.bin` lacks
its `.meta.json` sidecar, if the per-build manifests drift out of sync
with `manifest.json`, if a blocked token (`FanTRIAC` globally, plus any
`block_tokens` declared in `firmware/sources.json` for a matching
source) reappears in a generated `config_string`, or if a
`REQUIRED_CONFIGS` entry is missing from `manifest.json`. Run it in
isolation with `npm test -- manifest-health`.

`__tests__/product-catalog-alignment.test.js` (WF-PRODUCT-001) is the
companion alignment guard: it cross-checks `firmware/sources.json`,
`manifest.json`, every `firmware-*.json`, the workflow's
`REQUIRED_CONFIGS`, and `scripts/data/kits.json` against the upstream
[`sense360store/esphome-public`](https://github.com/sense360store/esphome-public/blob/main/config/product-catalog.json)
product lifecycle catalog and fails CI if any active WebFlash surface
references a config that is `blocked`, `legacy-compatible`, `deprecated`,
`removed`, `hardware-pending`, `compile-only`, or absent from the catalog.
The importer and `REQUIRED_CONFIGS` paths are stricter and require
`status: production`; manifests and kits also admit `preview`. `Rescue`
is exempt by name. The test defaults to the vendored snapshot at
`__tests__/fixtures/esphome-product-catalog.json`; set
`PRODUCT_CATALOG_PATH` to a freshly downloaded copy to validate live.
Run in isolation with `npm test -- product-catalog-alignment`.
WF-PRODUCT-002 refreshed the vendored snapshot against the current
upstream catalog (33 products = 1 production / 1 blocked / 0 preview /
31 legacy-compatible at refresh time); no status WebFlash mirrors
changed, active surfaces still resolve only to Release-One + Rescue,
FanTRIAC remains blocked, and LED remains excluded from Release-One.
WF-PRODUCT-003 refreshed it again after upstream PRODUCT-009 promoted
an LED-bearing sibling product to a preview build (34 products =
1 production / 1 preview / 1 blocked / 31 legacy-compatible at refresh
time); the synthetic preview placeholder was removed and replaced with
the real upstream `Ceiling-POE-VentIQ-RoomIQ-LED` preview entry
(artifact `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`).
The alignment test gained an explicit `WF-PRODUCT-003 — upstream LED
preview recognition` describe block that pins both halves of the
contract: the fixture exposes the LED preview as `status: preview`,
and every active WebFlash surface explicitly asserts it does not
reference the LED preview today. WF-LED-001
added [`docs/led-preview-import-plan.md`](docs/led-preview-import-plan.md)
— a docs-only forward-looking plan that records the upstream proof
fields required before WebFlash may import, the future
`firmware/sources.json` source entry shape (with
`block_tokens: ["FanTRIAC"]` for the LED preview source while the
Release-One source keeps `block_tokens: ["FanTRIAC", "LED"]`), the
import + manifest-regeneration sequence, the deferred UX / kit
decisions, and the explicit do-not-change list. WF-LED-002 then
executed that import once upstream
[`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview)
shipped a proven artifact (SHA256
`93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`,
1,135,904 bytes, release body with all four canonical H2 sections).
WF-LED-002 added a second `firmware/sources.json` entry for the LED
preview (`channel: preview`, `block_tokens: ["FanTRIAC"]`, pinned
`expected_sha256`), imported the `.bin` plus `.meta.json` sidecar,
regenerated `manifest.json` (now 3 builds — Release-One stable + LED
preview + Rescue) and the per-build manifests (`firmware-0.json` =
Release-One, `firmware-1.json` = LED preview, `firmware-2.json` =
Rescue after deterministic re-indexing), and hardened
`scripts/import-firmware-sources.py` to enforce `expected_sha256` when
present (backward compatible when absent — preserves Release-One
behaviour). The WF-PRODUCT-003 alignment-test describe block was
updated to assert LED preview presence in `firmware/sources.json` +
`manifest.json` and absence in `REQUIRED_CONFIGS` +
`scripts/data/kits.json`. Unchanged: Release-One source entry,
Release-One manifest build content, Rescue build content,
`REQUIRED_CONFIGS` (still production-only), `scripts/data/kits.json`
(still Release-One-only), every UI / wizard / `sw.js` / `index.html` /
workflow file, and the FanTRIAC blocked status. WF-LED-003 then
resolved the deferred UX call with Option A — manifest-only preview,
no new kit, no new mode toggle, no wizard / service-worker / workflow
change. The exposure mechanism is the existing release-channel gate
already implemented in `scripts/utils/release-channels.js`
(`preview.defaultSelectable: false` so the LED build is never auto-
selected, `preview.requiresAcknowledgement: true` so install gates on
a `channel:preview` checkbox with experimental-build warning copy,
`preview.hiddenByDefault: false` so the build is visible in normal
mode) combined with the existing LED module toggle in step 4 of the
wizard (`index.html`'s `Sense360 LED` toggle, plus the `led` module key
wired into `MODULE_KEYS` / `MODULE_SEGMENT_FORMATTERS` /
`parseConfigStringState` in `scripts/state.js` and the
`Sense360 LED` (S360-300) variant entry in
`scripts/data/module-requirements.js`). With the LED toggle off the
stable Release-One install path is byte-identical to pre-WF-LED-002;
with the LED toggle on the wizard produces
`config_string: Ceiling-POE-VentIQ-RoomIQ-LED` and resolves to the
preview build behind the existing preview gate. WF-LED-003 added a
targeted policy-level test in
`__tests__/release-channel-ui.test.js`
(`WF-LED-003 — LED preview exposure model …` describe block) that
pins the LED-preview-shaped build's identity against the policy: never
auto-selected by `pickDefaultBuild`, stable wins when both are
candidates, `channel:preview` acknowledgement required, visible in
normal mode, Preview badge with warning tone, never tagged
Recommended. WF-LED-003 changed no firmware, no manifest, no
`firmware/sources.json`, no kit, no UI markup, no wizard runtime, no
`sw.js`, no workflow, no signing material; `REQUIRED_CONFIGS` stays
production-only and FanTRIAC stays blocked. A future WF-LED-004 may
revisit the UX surface only after **either** upstream promotes the
LED catalog entry to `status: production` **or** S360-300 bench
verification clears the LED hardware path; neither precondition has
landed as of WF-LED-003.

WF-PRODUCT-004 then adds an advisory readiness validator at
[`scripts/validate-product-import-readiness.js`](scripts/validate-product-import-readiness.js)
with the contract doc at
[`docs/product-import-readiness.md`](docs/product-import-readiness.md)
and the Jest pin at
[`__tests__/product-import-readiness.test.js`](__tests__/product-import-readiness.test.js).
The validator classifies every upstream catalog entry against four
independent surfaces — **import-eligible**, **manifest-eligible**,
**`REQUIRED_CONFIGS`-eligible**, **kit-eligible** — and cross-checks
the live WebFlash surfaces against the catalog lifecycle. It is
reporting-only and does not import firmware, regenerate manifests,
change `REQUIRED_CONFIGS`, modify kits, or touch any UI / wizard /
`sw.js` / workflow surface. Run it as:

```bash
# default: Markdown report against the vendored fixture
node scripts/validate-product-import-readiness.js
# or via npm
npm run validate:product-import-readiness

# fresh upstream catalog
node scripts/validate-product-import-readiness.js \
  --catalog /tmp/upstream-product-catalog.json

# single-entry filter, JSON output
node scripts/validate-product-import-readiness.js \
  --config Ceiling-POE-VentIQ-RoomIQ-LED \
  --format json
```

Exit codes: `0` on consistent classification, `1` on any eligibility
or cross-surface violation, `2` on usage / load error. Today's
classifications (unchanged by WF-PRODUCT-004): Release-One = import +
manifest + `REQUIRED_CONFIGS` + kit eligible; LED preview = import +
manifest + kit eligible but **not** `REQUIRED_CONFIGS` eligible
(preview-channel only); FanTRIAC blocked entry = ineligible
everywhere; legacy-compatible representative = ineligible everywhere;
`Rescue` is exempt by name throughout. Run the test pin in isolation
with `npm run test:product-import-readiness`.

## Directory Structure

```
WebFlash/
├── firmware/
│   ├── configurations/          # Production firmware files
│   │   ├── Sense360-*.bin       # Firmware binaries
│   │   └── Sense360-*.md        # Release notes (optional)
│   └── rescue/                  # Recovery firmware
├── scripts/
│   ├── gen-manifests.py         # Main manifest generator
│   └── sync-from-releases.py    # GitHub release sync
├── css/                         # Stylesheets
├── __tests__/                   # Test suite
├── .github/workflows/           # CI/CD automation
├── manifest.json                # Generated: main firmware catalog
├── firmware-*.json              # Generated: individual manifests
└── index.html                   # Web interface
```

## Manifest File Format

### manifest.json

Main catalog containing all firmware builds. The example below uses the
current Release-One artifact; consult the in-tree `manifest.json` for the
full schema including hashes, signatures, sidecar-derived fields
(`features`, `hardware_requirements`, `known_issues`, `changelog`), and
provenance fields (`source_commit`, `source_url`, `signed_by`).

```json
{
  "name": "Sense360 Modular Platform Firmware",
  "builds": [
    {
      "name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable",
      "version": "1.0.0",
      "channel": "stable",
      "chipFamily": "ESP32-S3",
      "improv": true,
      "description": "Stable firmware for Sense360 Ceiling-POE-VentIQ-RoomIQ configuration. Recommended for production deployments.",
      "parts": [
        {
          "path": "firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
          "offset": 0
        }
      ]
    }
  ]
}
```

### firmware-N.json

Individual manifests for ESP Web Tools:

```json
{
  "name": "Sense360 ESP32 Firmware - Core Module",
  "version": "1.0.0",
  "builds": [
    {
      "chipFamily": "ESP32-S3",
      "improv": true,
      "parts": [
        {
          "path": "firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
          "offset": 0
        }
      ]
    }
  ]
}
```

## Troubleshooting

### Manifest Generator Errors

**"No firmware files found"**
- Check directory structure: `firmware/configurations/*.bin`
- Verify files have `.bin` extension
- Ensure proper naming convention

**"Failed to parse filename"**
- Verify filename follows exact convention
- Check all required components present
- Ensure version format is correct (v1.0.0)

**"Duplicate firmware detected"**
- Remove duplicate files
- Check version numbers are unique
- Verify channel is specified correctly

### Deployment Issues

**Firmware not appearing on site**
- Check GitHub Actions status
- Verify manifest.json contains firmware
- Clear browser cache and refresh
- Check CORS headers in _headers file

**ESP Web Tools "Failed to fetch"**
- Verify relative URLs in manifests
- Check firmware file exists in repository
- Ensure GitHub Pages deployment succeeded
- Test with local server first

### Release Notes Not Loading

**Release notes missing in UI**
- Verify .md file matches .bin filename exactly
- Check markdown format is correct
- Ensure file is committed to repository
- Regenerate manifests after adding notes

## Best Practices

### Version Management

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Increment MAJOR for breaking changes
- Increment MINOR for new features
- Increment PATCH for bug fixes
- Always test before marking as stable

### Channel Usage

- **stable**: Production deployments only
- **preview**: Early access, feature-complete
- **beta**: Testing, may have known issues
- Never publish untested firmware to stable

#
## Naming Policy Validator

Run the naming-policy validator before generating manifests or publishing:

```bash
node scripts/validate-naming-policy.js firmware/configurations
```

The validator enforces:

- **Allowed canonical token forms**: use `AirIQ`, `VentIQ`, `FanRelay`, `FanPWM`, `FanDAC`, `FanTRIAC`, `LED`, and `Voice` naming.
- **Disallowed/deprecated tokens**:
  - `AirIQProv` → migrate to `AirIQPro`
  - `AirIQBase` → migrate to `AirIQ`
  - `BathroomAirIQ` → migrate to `Bathroom`
  - `FanAnalog` → migrate to `FanDAC` (matches the renamed Sense360 DAC SKU)
- **Channel artifact placement**: only `stable` release notes (`*.md`) are allowed under `firmware/configurations/`. Preview/beta notes should not be stored in the production firmware directory.
- **Canonical filename shape**: `Sense360-...-vX.Y.Z-(stable|preview|beta).(bin|md)`

Migration rule of thumb: rename artifacts in place to canonical tokens, regenerate manifests, then verify CI passes.

## Release Notes

- Write clear, concise descriptions
- List hardware requirements explicitly
- Document known issues
- Include installation notes for complex setups
- Keep language consistent across releases

### Git Workflow

- Create feature branches for major changes
- Test locally before pushing to main
- Write descriptive commit messages
- Tag releases with version numbers
- Keep commit history clean

## Automation Architecture

### Manifest Generation Pipeline

1. Scan firmware directories
2. Parse filenames for metadata
3. Load stable release notes from `firmware/configurations/` and non-stable release notes from `firmware/previews/`
4. Generate main manifest
5. Create individual manifests
6. Validate all manifests
7. Write to repository

### GitHub Actions Workflow

1. Trigger on push to main
2. Checkout repository
3. Run manifest generator
4. Commit generated files (if changed)
5. Deploy to GitHub Pages
6. Set CORS headers

## Advanced Topics

### Custom Firmware Paths

To use different firmware directory structure, modify `scripts/gen-manifests.py`:

```python
FIRMWARE_DIR = "path/to/firmware"
```

### Adding New Channels

Edit manifest generator to support additional channels:

```python
VALID_CHANNELS = ['stable', 'preview', 'beta', 'alpha', 'custom']
```

### Multi-Part Firmware

For firmware requiring multiple binary parts:

```json
"parts": [
  {"path": "bootloader.bin", "offset": 0},
  {"path": "partition-table.bin", "offset": 32768},
  {"path": "firmware.bin", "offset": 65536}
]
```

Currently single-part firmware is standard for Sense360 devices.

## Support

For development questions:
- Review this guide
- Check existing firmware examples
- Test locally before deploying
- Contact development team if issues persist

## Related Repositories

- **[esphome-public](https://github.com/sense360store/esphome-public)**: Source ESPHome YAML configurations for DIY users. Firmware compiled from this repository is distributed through WebFlash for browser-based installation.

## Related Documentation

- [README.md](README.md): User guide
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md): Common issues
- [docs/sense360-webflash-status.md](docs/sense360-webflash-status.md): Canonical WebFlash Sense360 product & release status (consolidates the legacy `FEATURES.md` roadmap; references the upstream `sense360store/esphome-public` `docs/sense360-roadmap-status.md`)
- [FEATURES.md](FEATURES.md): Deprecated — redirects to the canonical status doc above
- [ESP Web Tools Documentation](https://esphome.github.io/esp-web-tools/)
