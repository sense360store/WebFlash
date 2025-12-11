# ESPHome-Public Integration Proposal

This directory contains proposed changes to automate firmware distribution between `esphome-public` and `WebFlash`.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROPOSED AUTOMATED PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                    ┌─────────────────────┐        │
│  │   esphome-public    │                    │      WebFlash       │        │
│  │   (Source Repo)     │                    │  (Distribution)     │        │
│  └──────────┬──────────┘                    └──────────┬──────────┘        │
│             │                                          │                    │
│             ▼                                          │                    │
│  ┌─────────────────────┐                              │                    │
│  │ 1. Create Release   │                              │                    │
│  │    (tag v2.1.0)     │                              │                    │
│  └──────────┬──────────┘                              │                    │
│             │                                          │                    │
│             ▼                                          │                    │
│  ┌─────────────────────┐                              │                    │
│  │ 2. CI Builds All    │                              │                    │
│  │    Products (31)    │                              │                    │
│  │    - ESPHome compile│                              │                    │
│  │    - Rename to      │                              │                    │
│  │      WebFlash format│                              │                    │
│  └──────────┬──────────┘                              │                    │
│             │                                          │                    │
│             ▼                                          │                    │
│  ┌─────────────────────┐                              │                    │
│  │ 3. Attach .bin to   │                              │                    │
│  │    GitHub Release   │──────────────────────────────┼──┐                 │
│  │    + SHA256SUMS     │                              │  │                 │
│  └─────────────────────┘                              │  │                 │
│                                                        │  │                 │
│                                          ┌─────────────┼──┼─────────┐      │
│                                          │             ▼  │         │      │
│                                          │  ┌─────────────────────┐ │      │
│                                          │  │ 4. sync-from-       │ │      │
│                                          │  │    releases.py      │ │      │
│                                          │  │    downloads .bin   │ │      │
│                                          │  └──────────┬──────────┘ │      │
│                                          │             │            │      │
│                                          │             ▼            │      │
│                                          │  ┌─────────────────────┐ │      │
│                                          │  │ 5. gen-manifests.py │ │      │
│                                          │  │    regenerates      │ │      │
│                                          │  │    manifest.json    │ │      │
│                                          │  └──────────┬──────────┘ │      │
│                                          │             │            │      │
│                                          │             ▼            │      │
│                                          │  ┌─────────────────────┐ │      │
│                                          │  │ 6. Deploy to        │ │      │
│                                          │  │    GitHub Pages     │ │      │
│                                          │  └─────────────────────┘ │      │
│                                          │                          │      │
│                                          │      WebFlash CI/CD      │      │
│                                          └──────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files in This Directory

| File | Purpose | Install Location |
|------|---------|------------------|
| `firmware-build-release.yml` | GitHub Actions workflow to build all ESPHome products | `esphome-public/.github/workflows/` |
| `product-mapping.json` | Maps ESPHome product names to WebFlash naming | Reference document |
| `README.md` | This integration guide | N/A |

## Installation Steps

### Step 1: Add Build Workflow to esphome-public

Copy the workflow file:

```bash
cp proposed-esphome-integration/firmware-build-release.yml \
   ../esphome-public/.github/workflows/
```

### Step 2: Create a Release in esphome-public

```bash
cd ../esphome-public

# Tag and push
git tag v2.2.0
git push origin v2.2.0

# Create release via GitHub CLI
gh release create v2.2.0 \
  --title "Sense360 Firmware v2.2.0" \
  --notes "Release notes here"
```

### Step 3: CI Automatically Builds and Attaches Firmware

The workflow will:
1. Build all 31 product configurations using ESPHome
2. Rename binaries to WebFlash format (e.g., `Sense360-Core-Ceiling-POE-v2.2.0-stable.bin`)
3. Attach all `.bin` files to the GitHub release
4. Generate SHA256/MD5 checksums

### Step 4: WebFlash Automatically Syncs

The existing WebFlash workflow (`firmware-publish.yml`) already supports syncing from releases:

```yaml
- name: Sync firmware assets from release
  if: github.event_name == 'release'
  run: |
    python scripts/sync-from-releases.py \
      --repo "sense360store/esphome-public" \
      --tag "v2.2.0" \
      --target-dir firmware
```

To trigger manually:
```bash
python scripts/sync-from-releases.py \
  --repo sense360store/esphome-public \
  --tag v2.2.0 \
  --target-dir firmware/configurations
```

## Product to WebFlash Mapping

| ESPHome Product | WebFlash Filename |
|-----------------|-------------------|
| `sense360-core-c-usb` | `Sense360-Core-Ceiling-USB-v{ver}-{ch}.bin` |
| `sense360-core-c-poe` | `Sense360-Core-Ceiling-POE-v{ver}-{ch}.bin` |
| `sense360-core-c-pwr` | `Sense360-Core-Ceiling-PWR-v{ver}-{ch}.bin` |
| `sense360-core-w-usb` | `Sense360-Core-Wall-USB-v{ver}-{ch}.bin` |
| `sense360-core-w-poe` | `Sense360-Core-Wall-POE-v{ver}-{ch}.bin` |
| `sense360-core-w-pwr` | `Sense360-Core-Wall-PWR-v{ver}-{ch}.bin` |
| `sense360-core-v-c-*` | `Sense360-CoreVoice-Ceiling-{power}-v{ver}-{ch}.bin` |
| `sense360-core-v-w-*` | `Sense360-CoreVoice-Wall-{power}-v{ver}-{ch}.bin` |
| `sense360-core-ceiling-bathroom` | `Sense360-Core-Ceiling-POE-BathroomAirIQ-v{ver}-{ch}.bin` |
| `sense360-mini-airiq-advanced` | `Sense360-Core-Wall-USB-AirIQPro-v{ver}-{ch}.bin` |
| `sense360-ceiling-s3-full` | `Sense360-Core-Ceiling-PWR-AirIQPro-Presence-Comfort-v{ver}-{ch}.bin` |

See `product-mapping.json` for the complete mapping.

## Benefits of This Integration

### Before (Manual Process)
1. Admin builds firmware locally in PlatformIO
2. Manually renames each file (error-prone)
3. Manually copies to WebFlash repo
4. Runs manifest generator
5. Commits and pushes

**Time per release:** ~30-60 minutes
**Error risk:** High (naming errors, missing configs)

### After (Automated Pipeline)
1. Create GitHub release in esphome-public
2. CI builds all configurations automatically
3. WebFlash syncs automatically

**Time per release:** ~5 minutes (just create release)
**Error risk:** Low (automated naming, validation)

## Configuration Coverage

The workflow builds **31 product configurations** covering:

- **Core Types:** Core (standard), CoreVoice (with microphone)
- **Mounts:** Ceiling, Wall
- **Power:** USB, POE, PWR
- **Modules:** AirIQ (Base/Pro), Bathroom, Presence, Comfort, Fan

This generates ~31 firmware binaries per release, which maps to the 35+ required configurations in WebFlash.

## Future Enhancements

1. **Auto-generate release notes** from ESPHome changelog
2. **Matrix expansion** for module combinations
3. **Cross-repo webhook** for instant sync
4. **Staging releases** for preview channel testing
