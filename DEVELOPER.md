# Developer Guide

This guide covers firmware publishing, manifest generation, and deployment workflows for WebFlash maintainers.

## Overview

WebFlash uses automated manifest generation to maintain firmware catalogs. All manifests are generated from firmware files - manual editing is not required.

## Prerequisites

- Python 3.7+
- Git
- Access to repository
- Firmware binary files (.bin)

## Quick Reference

### Add Firmware
```bash
# 1. Place firmware in directory
cp firmware.bin firmware/configurations/Sense360-[CoreType]-[Config]-v[Version]-[Channel].bin

# 2. Create release notes (optional)
# stable notes (production-discoverable):
nano firmware/configurations/Sense360-[CoreType]-[Config]-v[Version]-stable.md
# preview/beta notes (non-production path):
nano firmware/previews/Sense360-[CoreType]-[Config]-v[Version]-[Channel].md

# 3. Generate manifests
python3 scripts/gen-manifests.py --summary

# 4. Commit and push
git add .
git commit -m "Add [Config] v[Version] firmware"
git push origin main
```

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

**Voice** (optional): Insert the `Voice` segment immediately after the mount when the build includes voice-assistant integration (e.g. `Sense360-Ceiling-Voice-USB-...`). Voice builds use the LED ring's integrated I2S microphone.

**PowerType**: `USB`, `POE`, or `PWR`. These map to USB Power, Sense360 PoE PSU (`S360-410`), and Sense360 Mains PSU (`S360-400`) respectively.

**Modules** (optional): Combination of canonical SKU tokens:
- `RoomIQ` — Sense360 RoomIQ (`S360-200`). Room sensor board: PIR, LD2450 (mmWave presence), SEN0609, LTR-303ALS (light), SHT4x (temp/humidity), BMP581 (pressure).
- `AirIQ` — Sense360 AirIQ (`S360-210`). Air-quality stack: SCD41 (CO₂), SGP41 (VOC), MICS-4514 (gas), with optional SPS30 (PM) / SFA30 (HCHO) connectors.
- `VentIQ` — Sense360 VentIQ (`S360-211`). Bathroom-focused air-quality stack with onboard SGP41; IR-temp and SPS30 connectors. Ceiling + Bathroom mode only.
- `Fan` — Sense360 Fan driver (`S360-310` Relay, `S360-311` PWM, or `S360-312` DAC). The specific driver is selected at runtime via the wizard.
- `LED` — Sense360 LED (`S360-300`), addressable WS2812B ring; required for voice builds.

**Module Constraints:**
- `Bathroom` is only available for Ceiling installations.
- `VentIQ` requires `Bathroom` to be enabled.
- `AirIQ` and `VentIQ` are mutually exclusive: the Bathroom toggle drives which one is visible on Ceiling mounts.
- Voice builds require the `LED` ring (integrated I2S microphone lives on the LED board).
- `Fan DAC` (`S360-312`) conflicts with `AirIQ` because both contend for the shared DAC bus.

**Module Sensors:**
- Sense360 RoomIQ (`S360-200`): PIR, LD2450 (mmWave presence), SEN0609, LTR-303ALS (light), SHT4x (temp/humidity), BMP581 (pressure).
- Sense360 AirIQ (`S360-210`): SCD41 (CO₂), SGP41 (VOC), MICS-4514 + STM8 (gas), optional SPS30 (PM), optional SFA30 (HCHO).
- Sense360 VentIQ (`S360-211`): SGP41 (VOC) onboard, optional MLX90614 (IR surface temp), optional SPS30 (PM).
- Sense360 LED (`S360-300`): WS2812B addressable LEDs, integrated I2S microphone for voice builds.

**Version**: Semantic version (e.g., `1.0.0`, `1.2.3`)

**Channel**: `stable`, `preview`, or `beta`


### Canonical module token policy

Use these module tokens in firmware filenames and manifest metadata: `AirIQ`, `VentIQ`, `Fan`, `LED`, `Voice`.

The naming-policy validator (`scripts/validate-naming-policy.js`) actively rejects deprecated variant tokens — `AirIQBase`, `AirIQPro`, `AirIQProv`, `BathroomAirIQ` (and its `Base`/`Pro` suffixes), `FanPWM`, `FanAnalog`. These are still recognised as read-time aliases by tooling and URL parsing for backwards compatibility, but they must not be used in new filenames or metadata.

### Examples

```
Sense360-Core-Wall-USB-v1.0.0-stable.bin
Sense360-Core-Ceiling-POE-AirIQBase-v1.0.0-stable.bin
Sense360-CoreVoice-Ceiling-POE-LED-v1.0.0-stable.bin
Sense360-CoreVoice-Wall-PWR-LED-AirIQPro-v1.2.0-preview.bin
Sense360-Core-Ceiling-POE-AirIQPro-v2.0.0-beta.bin
Sense360-Core-Ceiling-POE-VentIQBase-v1.0.0-stable.bin
Sense360-CoreVoice-Ceiling-PWR-LED-VentIQPro-v1.0.0-stable.bin
Sense360-Core-Wall-USB-FanPWM-v1.0.0-stable.bin
Sense360-Core-Wall-USB-LED-v1.0.0-stable.bin
Sense360-Core-Ceiling-POE-LED-AirIQBase-v1.0.0-stable.bin
```


## Naming Policy Validator

Run the naming-policy validator before generating manifests or publishing:

```bash
node scripts/validate-naming-policy.js firmware/configurations
```

The validator enforces:

- **Allowed canonical token forms**: use `AirIQ`, `AirIQPro`, `Bathroom`, and `Fan` naming.
- **Disallowed/deprecated tokens**:
  - `AirIQProv` → migrate to `AirIQPro`
  - `AirIQBase` → migrate to `AirIQ`
  - `BathroomAirIQ` → migrate to `Bathroom`
  - `FanPWM` and `FanAnalog` → migrate to `Fan`
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
Sense360-Core-Wall-USB-v1.0.0-stable.bin

# Release notes file (stable)
firmware/configurations/Sense360-Core-Wall-USB-v1.0.0-stable.md

# Release notes file (preview/beta/dev)
firmware/previews/Sense360-Core-Wall-USB-v1.1.0-preview.md
```

### Format

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

### Via Direct Commit

```bash
# 1. Add firmware to repository
cp your-firmware.bin firmware/configurations/Sense360-Core-Wall-USB-v1.0.0-stable.bin

# 2. Create release notes (optional)
cat > firmware/configurations/Sense360-Core-Wall-USB-v1.0.0-stable.md << 'EOF'
# Sense360 Core Wall USB v1.0.0 (stable)
[Release notes content]
EOF

# 3. Generate manifests
python3 scripts/gen-manifests.py --summary

# 4. Verify
python3 -m http.server 5000  # Test locally

# 5. Commit and push
git add .
git commit -m "Add Core Wall USB v1.0.0 stable firmware"
git push origin main
```

### Via GitHub Releases

```bash
# 1. Create GitHub release
gh release create v1.0.0 \
  --title "Sense360 v1.0.0" \
  --notes "Release notes here" \
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

Main catalog containing all firmware builds:

```json
{
  "name": "Sense360 Firmware Collection",
  "builds": [
    {
      "name": "Sense360-Core-Wall-USB-v1.0.0-stable",
      "version": "1.0.0",
      "channel": "stable",
      "chipFamily": "ESP32-S3",
      "improv": true,
      "description": "Firmware description",
      "parts": [
        {
          "path": "firmware/configurations/Sense360-Core-Wall-USB-v1.0.0-stable.bin",
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
  "name": "Sense360-Core-Wall-USB-v1.0.0-stable",
  "version": "1.0.0",
  "builds": [
    {
      "chipFamily": "ESP32-S3",
      "improv": true,
      "parts": [
        {
          "path": "firmware/configurations/Sense360-Core-Wall-USB-v1.0.0-stable.bin",
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

- **Allowed canonical token forms**: use `AirIQ`, `AirIQPro`, `Bathroom`, and `Fan` naming.
- **Disallowed/deprecated tokens**:
  - `AirIQProv` → migrate to `AirIQPro`
  - `AirIQBase` → migrate to `AirIQ`
  - `BathroomAirIQ` → migrate to `Bathroom`
  - `FanPWM` and `FanAnalog` → migrate to `Fan`
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
- [FEATURES.md](FEATURES.md): Feature tracking and roadmap
- [ESP Web Tools Documentation](https://esphome.github.io/esp-web-tools/)
