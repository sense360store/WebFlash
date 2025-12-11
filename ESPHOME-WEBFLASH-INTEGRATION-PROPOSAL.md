# ESPHome-Public → WebFlash Integration Proposal

**Purpose:** Automate firmware binary builds from `esphome-public` and distribute via `WebFlash`

---

## The Problem

Currently, `esphome-public` and `WebFlash` serve different user groups with no automated bridge:

| Repository | Purpose | Users |
|------------|---------|-------|
| `esphome-public` | Source YAML configurations | DIY users who compile via Home Assistant/ESPHome |
| `WebFlash` | Pre-compiled `.bin` binaries | Plug-and-play users who flash via browser |

**Current Pain Points:**
- Admin manually builds firmware in PlatformIO
- Manually renames each file to WebFlash naming convention (error-prone)
- Manually copies to WebFlash repo
- 47+ configurations to manage
- No traceability from source to binary

---

## Proposed Solution

Add a GitHub Actions workflow to `esphome-public` that:
1. Triggers when a release is created
2. Builds all 31 product configurations using ESPHome
3. Renames binaries to WebFlash-compatible format
4. Attaches them to the GitHub release
5. WebFlash's existing `sync-from-releases.py` pulls them in

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTOMATED PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  esphome-public                              WebFlash                       │
│  ┌─────────────────────┐                    ┌─────────────────────┐        │
│  │ 1. Create Release   │                    │                     │        │
│  │    (tag v2.2.0)     │                    │                     │        │
│  └──────────┬──────────┘                    │                     │        │
│             ▼                                │                     │        │
│  ┌─────────────────────┐                    │                     │        │
│  │ 2. CI Builds All    │                    │                     │        │
│  │    31 Products      │                    │                     │        │
│  │    via ESPHome      │                    │                     │        │
│  └──────────┬──────────┘                    │                     │        │
│             ▼                                │                     │        │
│  ┌─────────────────────┐                    │                     │        │
│  │ 3. Rename & attach  │────────────────────┼──┐                  │        │
│  │    to GitHub Release│                    │  │                  │        │
│  └─────────────────────┘                    │  ▼                  │        │
│                                             │ sync-from-releases  │        │
│                                             │         │           │        │
│                                             │         ▼           │        │
│                                             │ gen-manifests.py    │        │
│                                             │         │           │        │
│                                             │         ▼           │        │
│                                             │ Deploy to Pages     │        │
│                                             └─────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Benefits

| Metric | Before (Manual) | After (Automated) |
|--------|-----------------|-------------------|
| Time per release | 30-60 minutes | ~5 minutes |
| Error risk | High (manual naming) | Low (automated) |
| Naming consistency | Manual | Enforced |
| Traceability | None | Git SHA in release |
| Required admin actions | 7 steps | 1 step (create release) |

---

## Product → WebFlash Naming Mapping

The workflow maps ESPHome product names to WebFlash format:

```
Sense360-[CoreType]-[Mount]-[Power]-[Modules]-v[Version]-[Channel].bin
```

| ESPHome Product | WebFlash Filename |
|-----------------|-------------------|
| `sense360-core-c-usb` | `Sense360-Core-Ceiling-USB-v{ver}-{ch}.bin` |
| `sense360-core-c-poe` | `Sense360-Core-Ceiling-POE-v{ver}-{ch}.bin` |
| `sense360-core-c-pwr` | `Sense360-Core-Ceiling-PWR-v{ver}-{ch}.bin` |
| `sense360-core-w-usb` | `Sense360-Core-Wall-USB-v{ver}-{ch}.bin` |
| `sense360-core-w-poe` | `Sense360-Core-Wall-POE-v{ver}-{ch}.bin` |
| `sense360-core-w-pwr` | `Sense360-Core-Wall-PWR-v{ver}-{ch}.bin` |
| `sense360-core-v-c-usb` | `Sense360-CoreVoice-Ceiling-USB-v{ver}-{ch}.bin` |
| `sense360-core-v-c-poe` | `Sense360-CoreVoice-Ceiling-POE-v{ver}-{ch}.bin` |
| `sense360-core-v-c-pwr` | `Sense360-CoreVoice-Ceiling-PWR-v{ver}-{ch}.bin` |
| `sense360-core-v-w-usb` | `Sense360-CoreVoice-Wall-USB-v{ver}-{ch}.bin` |
| `sense360-core-v-w-poe` | `Sense360-CoreVoice-Wall-POE-v{ver}-{ch}.bin` |
| `sense360-core-v-w-pwr` | `Sense360-CoreVoice-Wall-PWR-v{ver}-{ch}.bin` |
| `sense360-core-ceiling` | `Sense360-Core-Ceiling-USB-v{ver}-{ch}.bin` |
| `sense360-core-wall` | `Sense360-Core-Wall-USB-v{ver}-{ch}.bin` |
| `sense360-core-voice-ceiling` | `Sense360-CoreVoice-Ceiling-USB-v{ver}-{ch}.bin` |
| `sense360-core-voice-wall` | `Sense360-CoreVoice-Wall-USB-v{ver}-{ch}.bin` |
| `sense360-core-ceiling-bathroom` | `Sense360-Core-Ceiling-POE-BathroomAirIQ-v{ver}-{ch}.bin` |
| `sense360-core-ceiling-presence` | `Sense360-Core-Ceiling-POE-Presence-v{ver}-{ch}.bin` |
| `sense360-core-wall-presence` | `Sense360-Core-Wall-POE-Presence-v{ver}-{ch}.bin` |
| `sense360-mini-airiq` | `Sense360-Core-Wall-USB-AirIQBase-v{ver}-{ch}.bin` |
| `sense360-mini-airiq-basic` | `Sense360-Core-Wall-USB-AirIQBase-v{ver}-{ch}.bin` |
| `sense360-mini-airiq-advanced` | `Sense360-Core-Wall-USB-AirIQPro-v{ver}-{ch}.bin` |
| `sense360-mini-presence` | `Sense360-Core-Wall-USB-Presence-v{ver}-{ch}.bin` |
| `sense360-mini-presence-basic` | `Sense360-Core-Wall-USB-PresenceBase-v{ver}-{ch}.bin` |
| `sense360-mini-presence-advanced` | `Sense360-Core-Wall-USB-PresencePro-v{ver}-{ch}.bin` |
| `sense360-ceiling-s3-full` | `Sense360-Core-Ceiling-PWR-AirIQPro-Presence-Comfort-v{ver}-{ch}.bin` |
| `sense360-fan-pwm` | `Sense360-Core-Ceiling-PWR-FanPWM-v{ver}-{ch}.bin` |
| `sense360-poe` | `Sense360-Core-Ceiling-POE-v{ver}-{ch}.bin` |

---

## GitHub Actions Workflow

Save this as `.github/workflows/firmware-build-release.yml` in `esphome-public`:

```yaml
name: Build and Release Firmware

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version tag (e.g., 2.1.0)'
        required: true
      channel:
        description: 'Release channel'
        required: true
        default: 'stable'
        type: choice
        options:
          - stable
          - preview
          - beta

permissions:
  contents: write

env:
  ESPHOME_VERSION: "2024.11.0"

jobs:
  # ===========================================================================
  # Job 1: Generate build matrix from products directory
  # ===========================================================================
  generate-matrix:
    name: Generate Build Matrix
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.set-matrix.outputs.matrix }}
      version: ${{ steps.version.outputs.version }}
      channel: ${{ steps.version.outputs.channel }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Determine version and channel
        id: version
        run: |
          if [ "${{ github.event_name }}" == "release" ]; then
            VERSION="${{ github.event.release.tag_name }}"
            VERSION="${VERSION#v}"
            if [ "${{ github.event.release.prerelease }}" == "true" ]; then
              CHANNEL="preview"
            else
              CHANNEL="stable"
            fi
          else
            VERSION="${{ github.event.inputs.version }}"
            VERSION="${VERSION#v}"
            CHANNEL="${{ github.event.inputs.channel }}"
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "channel=$CHANNEL" >> $GITHUB_OUTPUT
          echo "Building version $VERSION on $CHANNEL channel"

      - name: Generate build matrix
        id: set-matrix
        run: |
          cat > /tmp/generate_matrix.py << 'PYTHON'
          import json
          import os
          from pathlib import Path

          # ESPHome product -> WebFlash naming components
          PRODUCT_MAP = {
              "sense360-core-c-usb": ("Core", "Ceiling", "USB", []),
              "sense360-core-c-poe": ("Core", "Ceiling", "POE", []),
              "sense360-core-c-pwr": ("Core", "Ceiling", "PWR", []),
              "sense360-core-w-usb": ("Core", "Wall", "USB", []),
              "sense360-core-w-poe": ("Core", "Wall", "POE", []),
              "sense360-core-w-pwr": ("Core", "Wall", "PWR", []),
              "sense360-core-v-c-usb": ("CoreVoice", "Ceiling", "USB", []),
              "sense360-core-v-c-poe": ("CoreVoice", "Ceiling", "POE", []),
              "sense360-core-v-c-pwr": ("CoreVoice", "Ceiling", "PWR", []),
              "sense360-core-v-w-usb": ("CoreVoice", "Wall", "USB", []),
              "sense360-core-v-w-poe": ("CoreVoice", "Wall", "POE", []),
              "sense360-core-v-w-pwr": ("CoreVoice", "Wall", "PWR", []),
              "sense360-core-ceiling": ("Core", "Ceiling", "USB", []),
              "sense360-core-wall": ("Core", "Wall", "USB", []),
              "sense360-core-voice-ceiling": ("CoreVoice", "Ceiling", "USB", []),
              "sense360-core-voice-wall": ("CoreVoice", "Wall", "USB", []),
              "sense360-core-ceiling-bathroom": ("Core", "Ceiling", "POE", ["BathroomAirIQ"]),
              "sense360-core-ceiling-presence": ("Core", "Ceiling", "POE", ["Presence"]),
              "sense360-core-wall-presence": ("Core", "Wall", "POE", ["Presence"]),
              "sense360-mini-airiq": ("Core", "Wall", "USB", ["AirIQBase"]),
              "sense360-mini-airiq-basic": ("Core", "Wall", "USB", ["AirIQBase"]),
              "sense360-mini-airiq-advanced": ("Core", "Wall", "USB", ["AirIQPro"]),
              "sense360-mini-presence": ("Core", "Wall", "USB", ["Presence"]),
              "sense360-mini-presence-basic": ("Core", "Wall", "USB", ["PresenceBase"]),
              "sense360-mini-presence-advanced": ("Core", "Wall", "USB", ["PresencePro"]),
              "sense360-mini-presence-ld2412": ("Core", "Wall", "USB", ["PresenceBase"]),
              "sense360-mini-presence-advanced-ld2412": ("Core", "Wall", "USB", ["PresencePro"]),
              "sense360-mini-airiq-ld2412": ("Core", "Wall", "USB", ["AirIQBase", "Presence"]),
              "sense360-ceiling-s3-full": ("Core", "Ceiling", "PWR", ["AirIQPro", "Presence", "Comfort"]),
              "sense360-fan-pwm": ("Core", "Ceiling", "PWR", ["FanPWM"]),
              "sense360-poe": ("Core", "Ceiling", "POE", []),
          }

          products_dir = Path("products")
          matrix_items = []

          for yaml_file in sorted(products_dir.glob("*.yaml")):
              product_name = yaml_file.stem
              if product_name not in PRODUCT_MAP:
                  print(f"Warning: No mapping for {product_name}, skipping")
                  continue
              matrix_items.append({
                  "product": product_name,
                  "yaml_file": str(yaml_file),
              })

          matrix = {"include": matrix_items}
          with open(os.environ.get("GITHUB_OUTPUT", "/dev/stdout"), "a") as f:
              f.write(f"matrix={json.dumps(matrix)}\n")
          PYTHON

          python3 /tmp/generate_matrix.py

  # ===========================================================================
  # Job 2: Build firmware for each product
  # ===========================================================================
  build:
    name: Build ${{ matrix.product }}
    needs: generate-matrix
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJson(needs.generate-matrix.outputs.matrix) }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install ESPHome
        run: pip install esphome==${{ env.ESPHOME_VERSION }}

      - name: Create secrets file
        run: |
          cat > secrets.yaml << 'EOF'
          wifi_ssid: "placeholder"
          wifi_password: "placeholder"
          api_encryption_key: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
          ota_password: "placeholder"
          EOF

      - name: Compile firmware
        run: esphome compile ${{ matrix.yaml_file }}

      - name: Generate WebFlash filename and prepare artifact
        id: artifact
        run: |
          VERSION="${{ needs.generate-matrix.outputs.version }}"
          CHANNEL="${{ needs.generate-matrix.outputs.channel }}"
          PRODUCT="${{ matrix.product }}"

          cat > /tmp/get_filename.py << PYTHON
          PRODUCT_MAP = {
              "sense360-core-c-usb": ("Core", "Ceiling", "USB", []),
              "sense360-core-c-poe": ("Core", "Ceiling", "POE", []),
              "sense360-core-c-pwr": ("Core", "Ceiling", "PWR", []),
              "sense360-core-w-usb": ("Core", "Wall", "USB", []),
              "sense360-core-w-poe": ("Core", "Wall", "POE", []),
              "sense360-core-w-pwr": ("Core", "Wall", "PWR", []),
              "sense360-core-v-c-usb": ("CoreVoice", "Ceiling", "USB", []),
              "sense360-core-v-c-poe": ("CoreVoice", "Ceiling", "POE", []),
              "sense360-core-v-c-pwr": ("CoreVoice", "Ceiling", "PWR", []),
              "sense360-core-v-w-usb": ("CoreVoice", "Wall", "USB", []),
              "sense360-core-v-w-poe": ("CoreVoice", "Wall", "POE", []),
              "sense360-core-v-w-pwr": ("CoreVoice", "Wall", "PWR", []),
              "sense360-core-ceiling": ("Core", "Ceiling", "USB", []),
              "sense360-core-wall": ("Core", "Wall", "USB", []),
              "sense360-core-voice-ceiling": ("CoreVoice", "Ceiling", "USB", []),
              "sense360-core-voice-wall": ("CoreVoice", "Wall", "USB", []),
              "sense360-core-ceiling-bathroom": ("Core", "Ceiling", "POE", ["BathroomAirIQ"]),
              "sense360-core-ceiling-presence": ("Core", "Ceiling", "POE", ["Presence"]),
              "sense360-core-wall-presence": ("Core", "Wall", "POE", ["Presence"]),
              "sense360-mini-airiq": ("Core", "Wall", "USB", ["AirIQBase"]),
              "sense360-mini-airiq-basic": ("Core", "Wall", "USB", ["AirIQBase"]),
              "sense360-mini-airiq-advanced": ("Core", "Wall", "USB", ["AirIQPro"]),
              "sense360-mini-presence": ("Core", "Wall", "USB", ["Presence"]),
              "sense360-mini-presence-basic": ("Core", "Wall", "USB", ["PresenceBase"]),
              "sense360-mini-presence-advanced": ("Core", "Wall", "USB", ["PresencePro"]),
              "sense360-mini-presence-ld2412": ("Core", "Wall", "USB", ["PresenceBase"]),
              "sense360-mini-presence-advanced-ld2412": ("Core", "Wall", "USB", ["PresencePro"]),
              "sense360-mini-airiq-ld2412": ("Core", "Wall", "USB", ["AirIQBase", "Presence"]),
              "sense360-ceiling-s3-full": ("Core", "Ceiling", "PWR", ["AirIQPro", "Presence", "Comfort"]),
              "sense360-fan-pwm": ("Core", "Ceiling", "PWR", ["FanPWM"]),
              "sense360-poe": ("Core", "Ceiling", "POE", []),
          }

          product = "$PRODUCT"
          version = "$VERSION"
          channel = "$CHANNEL"

          if product in PRODUCT_MAP:
              core_type, mount, power, modules = PRODUCT_MAP[product]
              parts = [core_type, mount, power] + modules
              config = "-".join(parts)
              print(f"Sense360-{config}-v{version}-{channel}.bin")
          else:
              print(f"Sense360-{product}-v{version}-{channel}.bin")
          PYTHON

          FILENAME=$(python3 /tmp/get_filename.py)
          echo "filename=$FILENAME" >> $GITHUB_OUTPUT

          # Find compiled firmware
          FIRMWARE_PATH=$(find .esphome/build -name "*.bin" -path "*/.pioenvs/*" | head -1)
          if [ -z "$FIRMWARE_PATH" ]; then
            echo "Error: No firmware binary found!"
            exit 1
          fi

          mkdir -p artifacts
          cp "$FIRMWARE_PATH" "artifacts/$FILENAME"
          echo "Created: artifacts/$FILENAME"

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: firmware-${{ matrix.product }}
          path: artifacts/*.bin
          retention-days: 1

  # ===========================================================================
  # Job 3: Attach all firmware to release
  # ===========================================================================
  release:
    name: Attach Firmware to Release
    needs: [generate-matrix, build]
    runs-on: ubuntu-latest
    if: github.event_name == 'release'
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: firmware
          pattern: firmware-*
          merge-multiple: true

      - name: List firmware files
        run: |
          echo "Firmware files to upload:"
          find firmware -name "*.bin" -exec ls -la {} \;

      - name: Generate checksums
        run: |
          cd firmware
          sha256sum *.bin > SHA256SUMS.txt
          md5sum *.bin > MD5SUMS.txt
          echo "=== SHA256 Checksums ==="
          cat SHA256SUMS.txt

      - name: Upload to release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            firmware/*.bin
            firmware/SHA256SUMS.txt
            firmware/MD5SUMS.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Summary
        run: |
          echo "## Firmware Release Complete" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Binaries attached to release:" >> $GITHUB_STEP_SUMMARY
          ls firmware/*.bin | wc -l >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "WebFlash can now sync using:" >> $GITHUB_STEP_SUMMARY
          echo "\`\`\`bash" >> $GITHUB_STEP_SUMMARY
          echo "python scripts/sync-from-releases.py --repo sense360store/esphome-public --tag ${{ github.event.release.tag_name }}" >> $GITHUB_STEP_SUMMARY
          echo "\`\`\`" >> $GITHUB_STEP_SUMMARY
```

---

## How to Use

### Initial Setup (One-Time)

1. Copy the workflow above to `esphome-public/.github/workflows/firmware-build-release.yml`
2. Commit and push to main branch

### Each Release

1. **Create a release in esphome-public:**
   ```bash
   gh release create v2.2.0 --title "Firmware v2.2.0" --notes "Release notes"
   ```

2. **CI automatically:**
   - Builds all 31 products (~10-15 minutes)
   - Attaches `.bin` files with WebFlash-compatible names
   - Generates SHA256/MD5 checksums

3. **Sync to WebFlash:**
   ```bash
   cd WebFlash
   python scripts/sync-from-releases.py \
     --repo sense360store/esphome-public \
     --tag v2.2.0 \
     --target-dir firmware/configurations

   python scripts/gen-manifests.py --summary
   git add . && git commit -m "Sync v2.2.0 from esphome-public"
   git push
   ```

### For Preview/Beta Releases

```bash
# Mark as prerelease → automatically uses "preview" channel
gh release create v2.2.0-rc1 --prerelease --title "Firmware v2.2.0 RC1"
```

---

## Testing the Workflow

Before deploying to production, test with a prerelease:

```bash
# Create test release
gh release create v0.0.1-test --prerelease --title "CI Test"

# Watch the Actions tab for build progress
# Verify binaries are attached with correct naming

# Clean up
gh release delete v0.0.1-test --yes
git push origin --delete v0.0.1-test
```

---

## Questions / Notes

- The workflow uses ESPHome version `2024.11.0` - update as needed
- Build time is ~10-15 minutes for all 31 products (parallel matrix)
- Products not in the mapping are skipped with a warning
- Channel is determined by: release → `stable`, prerelease → `preview`

---

*Generated for WebFlash ↔ ESPHome-Public integration*
