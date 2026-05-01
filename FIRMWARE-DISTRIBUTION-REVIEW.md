# Firmware Distribution & Upload Process Review

> **Status note (May 2026):** this document is a historical process review and is partly out of date. The pain-point analysis and CI/CD recommendations still apply, but the **naming examples below pre-date the canonical SKU model**. For current naming and the authoritative SKU table see [`CLAUDE.md`](CLAUDE.md#sense360-hardware-reference-canonical-skus) and [`DEVELOPER.md`](DEVELOPER.md#canonical-module-token-policy). Treat the legacy `AirIQBase` / `AirIQPro` / `BathroomAirIQ` / `FanPWM` / `FanAnalog` / `CoreVoice` / `Wall` tokens that appear here as historical &mdash; they must not be used in new artifacts.

## Executive Summary

This document reviews the current firmware distribution and uploading process to GitHub for the WebFlash project, identifies pain points from an admin perspective, and proposes improvements including CI/CD automation opportunities.

---

## Current Process Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FIRMWARE DISTRIBUTION FLOW                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ Admin Build │ -> │ Manual Upload to │ -> │ Manifest         │   │
│  │ Firmware    │    │ GitHub           │    │ Generation       │   │
│  └─────────────┘    └──────────────────┘    └──────────────────┘   │
│                              │                        │             │
│                              v                        v             │
│                     ┌──────────────────┐    ┌──────────────────┐   │
│                     │ GitHub Pages     │ <- │ ESP Web Tools    │   │
│                     │ Deployment       │    │ Manifests        │   │
│                     └──────────────────┘    └──────────────────┘   │
│                              │                                      │
│                              v                                      │
│                     ┌──────────────────┐                           │
│                     │ End User         │                           │
│                     │ WebFlash UI      │                           │
│                     └──────────────────┘                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Firmware Binaries | `firmware/configurations/*.bin` | 47+ firmware variants |
| Release Notes (stable) | `firmware/configurations/*-stable.md` | Production-discoverable markdown docs |
| Release Notes (preview/beta/dev) | `firmware/previews/*.md` | Segregated non-production markdown docs |
| Main Manifest | `manifest.json` | Central catalog for WebFlash UI |
| ESP Web Tools Manifests | `firmware-*.json` | Individual manifests for flashing |
| Manifest Generator | `scripts/gen-manifests.py` | Automated manifest creation |
| Release Sync | `scripts/sync-from-releases.py` | GitHub release integration |
| CI/CD Workflow | `.github/workflows/firmware-publish.yml` | Automated deployment |

---

## Current Admin Workflow

### Manual Upload Process (Most Common)

The current admin process for uploading a new firmware version:

```bash
# Step 1: Build firmware locally (outside this repo)
# Admin compiles firmware in PlatformIO/ESP-IDF

# Step 2: Rename binary to follow the canonical naming convention
mv firmware.bin Sense360-Ceiling-USB-AirIQ-v1.2.0-stable.bin

# Step 3: Copy to WebFlash repository
cp Sense360-Ceiling-USB-AirIQ-v1.2.0-stable.bin \
   /path/to/WebFlash/firmware/configurations/

# Step 4: Create release notes (optional)
nano firmware/configurations/Sense360-Ceiling-USB-AirIQ-v1.2.0-stable.md
# (for preview/beta/dev channels use firmware/previews/)

# Step 5: Run manifest generator
python3 scripts/gen-manifests.py --summary

# Step 6: Commit and push
git add .
git commit -m "Add Ceiling USB AirIQ v1.2.0 stable firmware"
git push origin main

# Step 7: GitHub Actions deploys to GitHub Pages automatically
```

### Via GitHub Releases (Alternative)

```bash
# Step 1: Create release with properly named .bin files
gh release create v1.2.0 \
  --title "Sense360 v1.2.0" \
  --notes "Release notes" \
  Sense360-*.bin

# Step 2: CI/CD automatically syncs and deploys
# (sync-from-releases.py is triggered)
```

---

## Pain Points for Admins

### 1. Manual Naming is Error-Prone

**Problem:** Admin must manually construct complex filenames following strict convention:
```
Sense360-[CoreType]-[MountType]-[PowerType]-[Modules]-v[Version]-[Channel].bin
```

**Examples of valid names (canonical, current):**
- `Sense360-Ceiling-USB-v1.0.0-stable.bin`
- `Sense360-Ceiling-POE-AirIQ-v2.0.0-preview.bin`
- `Sense360-Ceiling-PWR-VentIQ-v1.0.0-stable.bin`

**Historical examples that use disallowed tokens (for reference only):**
- `Sense360-Core-Wall-USB-v1.0.0-stable.bin` (Wall is dropped)
- `Sense360-CoreVoice-Ceiling-POE-AirIQPro-v2.0.0-preview.bin` (Voice integration is not exposed; AirIQPro replaced by plain AirIQ)
- `Sense360-Core-Ceiling-PWR-BathroomAirIQ-FanPWM-v1.0.0-stable.bin` (BathroomAirIQ &rarr; VentIQ; FanPWM &rarr; Fan)

**Issues:**
- 9 components to correctly assemble
- Module order matters (affects config_string lookup)
- Typos cause silent failures (firmware won't show in UI)
- No validation at upload time

### 2. Release Notes Not Linked to Build Process

**Problem:** Release notes are:
- Created manually as separate `.md` files
- Must exactly match firmware filename (easy to mismatch)
- No template enforcement
- No automated generation from build metadata

**Current state:** Only 13 of 47+ firmware files have release notes (28%)

### 3. No Automated Build-to-Distribution Pipeline

**Problem:** Firmware is built in a separate repository/environment:
- Build artifact must be manually transferred
- Version numbering is manual
- No traceability from source to deployed binary
- Checksums/signatures generated at distribution time, not build time

### 4. Multi-Configuration Management is Tedious

**Problem:** With 47+ configurations, releasing a new version requires:
- Building each configuration separately
- Renaming each file manually
- No batch upload tooling
- No way to verify all required configurations are present before deploy

### 5. No Staging/Preview Environment

**Problem:**
- Changes deploy directly to production GitHub Pages
- No way to test new firmware in a staging environment
- CI validation only checks if required configs exist, not if they work

---

## How Firmware Notes Are Currently Added

### Manual Process

1. Create markdown file matching firmware name:
   ```
   firmware/configurations/Sense360-Core-Wall-USB-v1.0.0-stable.md
   ```

2. Follow template format:
   ```markdown
   # Sense360 [Config] v[Version] ([Channel])

   ## Configuration Details
   - **Mounting Type**: [Wall/Ceiling]
   - **Power Option**: [USB/POE/PWR]
   - **Expansion Modules**: [Modules list]
   - **Chip Family**: ESP32-S3
   - **Version**: v[Version]
   - **Channel**: [stable/preview/beta]
   - **Release Date**: YYYY-MM-DD

   ## Description
   Brief description...

   ## Hardware Requirements
   - Requirement 1

   ## Features
   - Feature 1

   ## Known Issues
   - Issue 1 (if any)
   ```

3. Commit with firmware binary

### Issues with Current Approach

- Notes are **not required** (optional)
- No validation of content format
- Release notes are not included in manifest.json (metadata only)
- No changelog tracking across versions
- Timestamps come from file mtime, not release date in notes

---

## Naming Convention Analysis

### Current Naming Scheme

```
Sense360-[CoreType]-[MountType]-[PowerType]-[Modules]-v[Version]-[Channel].bin
```

### Strengths

1. **Self-describing**: Filename contains all configuration metadata
2. **Parseable**: `gen-manifests.py` extracts metadata from filename
3. **Unique**: Each configuration has distinct filename
4. **Sortable**: Alphabetical sorting groups related configs

### Weaknesses

1. **Long filenames**: Up to 80+ characters
   - `Sense360-CoreVoice-Ceiling-PWR-AirIQPro-FanPWM-v1.2.3-preview.bin`

2. **Module ordering**: No enforced order, can lead to inconsistencies
   - `AirIQ-Fan` vs `Fan-AirIQ`

3. **No build metadata**: Missing build number, git commit, build date

4. **Legacy support overhead**: System still supports legacy format without CoreType

### Recommendation: Enhanced Naming

Consider adding build metadata as optional suffix (using current canonical naming):
```
Sense360-Ceiling-USB-AirIQ-v1.2.0-stable.bin           # Standard
Sense360-Ceiling-USB-AirIQ-v1.2.0-stable+b1234.bin     # With build number
Sense360-Ceiling-USB-AirIQ-v1.2.0-stable+abc1234.bin   # With git short SHA
```

---

## CI/CD Automation Opportunities

### Current Automation

The existing CI/CD (`firmware-publish.yml`) handles:
- Manifest generation on push
- GitHub release sync
- Required configuration validation
- GitHub Pages deployment

**What's missing:**
- Automated firmware building
- Version bump automation
- Release notes generation
- Multi-config batch processing
- Staging environment

### Proposed: Full CI/CD Pipeline

#### Option A: Build + Distribute in Same Repo

```yaml
# .github/workflows/firmware-build-and-publish.yml
name: Build and Publish Firmware

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release'
        required: true
      channel:
        description: 'Release channel'
        default: 'stable'

jobs:
  build-matrix:
    strategy:
      matrix:
        config:
          - { mount: "Wall", power: "USB", modules: "" }
          - { mount: "Wall", power: "USB", modules: "AirIQBase" }
          - { mount: "Ceiling", power: "POE", modules: "AirIQPro" }
          # ... all 45+ configurations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup PlatformIO
        uses: actions/setup-python@v5
      - name: Build firmware
        run: |
          pio run -e ${{ matrix.config.mount }}-${{ matrix.config.power }}
      - name: Rename and upload artifact
        # Generate proper filename from matrix config

  publish:
    needs: build-matrix
    steps:
      - name: Download all artifacts
      - name: Generate manifests
      - name: Deploy to GitHub Pages
```

#### Option B: Separate Build Repo with Automated Distribution

```
┌────────────────────┐        ┌─────────────────────┐
│ Firmware Build Repo│        │ WebFlash Repo       │
│ (sense360-firmware)│        │ (Distribution)      │
├────────────────────┤        ├─────────────────────┤
│ - PlatformIO proj  │        │ - manifest.json     │
│ - Build matrix CI  │        │ - firmware/*.bin    │
│ - Version tagging  │  ───>  │ - release notes     │
│ - Artifact upload  │        │ - GitHub Pages      │
└────────────────────┘        └─────────────────────┘

# Build repo creates GitHub Release with .bin assets
# WebFlash repo's CI automatically syncs on release event
```

#### Option C: Admin Upload Tool (Recommended for Current Setup)

Create a CLI tool to simplify admin workflow:

```python
#!/usr/bin/env python3
"""
firmware-upload.py - Simplified firmware upload for admins

Usage:
    python scripts/firmware-upload.py \
        --file /path/to/firmware.bin \
        --mount Wall \
        --power USB \
        --modules AirIQBase \
        --version 1.2.0 \
        --channel stable \
        --notes "Bug fixes and performance improvements"
"""

# Features:
# 1. Interactive prompts for missing parameters
# 2. Auto-generates correct filename
# 3. Creates release notes from template
# 4. Validates configuration exists in matrix
# 5. Computes checksums
# 6. Runs manifest generator
# 7. Creates git commit
```

### Proposed CI/CD Improvements

#### 1. Add Firmware Validation Step

```yaml
- name: Validate firmware binaries
  run: |
    for bin in firmware/configurations/*.bin; do
      # Check file size (should be > 100KB for real firmware)
      size=$(stat -f%z "$bin" 2>/dev/null || stat -c%s "$bin")
      if [ "$size" -lt 100000 ]; then
        echo "WARNING: $bin seems too small ($size bytes)"
      fi

      # Check ESP32 magic bytes
      magic=$(xxd -l 1 "$bin" | awk '{print $2}')
      if [ "$magic" != "e9" ]; then
        echo "WARNING: $bin doesn't have ESP32 magic byte"
      fi
    done
```

#### 2. Add Staging Environment

```yaml
jobs:
  build:
    # ... existing build steps

  deploy-staging:
    if: github.ref != 'refs/heads/main'
    needs: build
    environment: staging
    steps:
      - name: Deploy to staging
        uses: actions/deploy-pages@v4
        with:
          artifact_name: staging-artifact

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: build
    environment: production
    steps:
      - name: Deploy to production
        uses: actions/deploy-pages@v4
```

#### 3. Automated Release Notes Generation

```yaml
- name: Generate release notes from changelog
  run: |
    python scripts/gen-release-notes.py \
      --version ${{ github.ref_name }} \
      --output firmware/configurations/
```

#### 4. Version Consistency Check

```yaml
- name: Check version consistency
  run: |
    # Ensure all configs have same version for major releases
    versions=$(python -c "
    import json
    with open('manifest.json') as f:
        data = json.load(f)
    versions = set(b['version'] for b in data['builds'])
    print('\n'.join(sorted(versions)))
    ")
    echo "Versions in manifest: $versions"
```

---

## Recommendations Summary

### Quick Wins (Low Effort, High Impact)

1. **Create admin upload helper script** (`scripts/firmware-upload.py`)
   - Interactive prompts for configuration
   - Auto-generates correct filename
   - Creates release notes from template
   - Validates before commit

2. **Add release notes template generator**
   - Pre-fill based on filename metadata
   - Include sensor information automatically
   - Add date stamp

3. **Improve CI validation**
   - Check firmware file sizes
   - Validate ESP32 magic bytes
   - Warn about missing release notes

### Medium-Term Improvements

4. **Implement staging environment**
   - Deploy PRs to preview URL
   - Test before merging to main

5. **Add version bump automation**
   - Script to increment version across all configs
   - Generate changelog from commits

6. **Create module order normalization**
   - Enforce consistent module ordering in filenames
   - Auto-reorder during manifest generation

### Long-Term (Full Automation)

7. **Unified build pipeline**
   - Build all configurations from single PlatformIO project
   - Automated matrix builds in CI
   - Direct artifact-to-distribution pipeline

8. **Release management system**
   - Web-based release dashboard
   - One-click release to all channels
   - Automatic rollback capability

---

## Appendix: Configuration Matrix

> The sample matrix that previously lived here used legacy `Wall` / `CoreVoice` / `AirIQBase` / `AirIQPro` / `BathroomAirIQ` tokens and is no longer authoritative.

The current required configurations are defined as the `REQUIRED_CONFIGS` allowlist in [`.github/workflows/firmware-publish.yml`](.github/workflows/firmware-publish.yml). At the time of writing the allowlist contains roughly 44 entries keyed by canonical `config_string` (for example `Ceiling-POE-AirIQ`, `Ceiling-POE-VentIQ`, `Ceiling-USB-Fan`, `Rescue`). Adding a new permanent firmware means adding its `config_string` there.

For the live shape of every published build (channel, version, hashes, structured metadata), inspect the generated [`manifest.json`](manifest.json).

---

## Files Referenced

- `.github/workflows/firmware-publish.yml` - CI/CD workflow
- `scripts/gen-manifests.py` - Manifest generator
- `scripts/sync-from-releases.py` - Release sync
- `DEVELOPER.md` - Developer guide
- `manifest.json` - Generated manifest
- `firmware/configurations/*.bin` - Firmware binaries
- `firmware/configurations/*-stable.md` - Stable release notes (production path)
- `firmware/previews/*.md` - Preview/Beta/Dev release notes (non-production path)

## Related Repositories

- **[esphome-public](https://github.com/sense360store/esphome-public)**: Source ESPHome YAML configurations for DIY users compiling via Home Assistant/ESPHome
