# Release Notes System Guide

## Overview

The firmware management system now uses external release notes files to provide comprehensive metadata for each firmware version. This replaces the old hardcoded description system with a flexible, maintainable approach.

## How to Add/Update Firmware Release Notes

Release notes are automatically loaded from individual markdown files in the `release-notes/` directory. Each firmware version has its own comprehensive release notes file with rich metadata.

### File Structure

Release notes files are now stored directly in the firmware directory alongside the firmware files:

```
firmware/
├── CO2Monitor/
│   ├── CO2Monitor-ESP32S3-v1.0.0-stable.md
│   ├── Sense360-CO2Monitor-ESP32S3-v1.0.0-stable.bin
│   ├── CO2Monitor-ESP32S3-v1.0.1-stable.md
│   └── Sense360-CO2Monitor-ESP32S3-v1.0.1-stable.bin
└── EnvMonitor/
    ├── EnvMonitor-ESP32-v2.1.0-stable.md
    ├── Sense360-EnvMonitor-ESP32-v2.1.0-stable.bin
    ├── EnvMonitor-ESP32-v2.2.0-beta.md
    └── Sense360-EnvMonitor-ESP32-v2.2.0-beta.bin
```

### File Naming Convention

Release notes files follow this naming pattern:
```
{DeviceType}-{ChipFamily}-{Version}-{Channel}.md
```

Examples:
- `CO2Monitor-ESP32S3-v1.0.0-stable.md`
- `EnvMonitor-ESP32-v2.2.0-beta.md`
- `AirQMonitor-ESP32S2-v1.1.0-alpha.md`

### Required Markdown Structure

Each release notes file must include these sections:

```markdown
# {DeviceType} {ChipFamily} {Version} {Channel} Release

## Device Information
- **Device Type**: {DeviceType}
- **Chip Family**: {ChipFamily}
- **Version**: {Version}
- **Channel**: {Channel}
- **Release Date**: {Date}

## Release Description
{Brief description shown in web interface}

## Features
- Feature 1
- Feature 2
- Feature 3

## Hardware Requirements
- Hardware requirement 1
- Hardware requirement 2

## Installation Notes
{Installation instructions}

## Known Issues
- Known issue 1
- Known issue 2

## Changelog
- Change 1
- Change 2
```

### Current Release Notes Files

The system automatically scans the firmware directories for:
- `firmware/CO2Monitor/CO2Monitor-ESP32S3-v1.0.0-stable.md`
- `firmware/CO2Monitor/CO2Monitor-ESP32S3-v1.0.1-stable.md`
- `firmware/EnvMonitor/EnvMonitor-ESP32-v2.1.0-stable.md`
- `firmware/EnvMonitor/EnvMonitor-ESP32-v2.2.0-beta.md`

### Adding New Release Notes

1. Create firmware directory under `firmware/` (e.g., `firmware/CO2Monitor/`)
2. Place your firmware `.bin` file in the directory
3. Create a corresponding release notes `.md` file in the same directory
4. Follow the exact naming convention
5. Use the required markdown structure
6. Include all relevant sections

### Best Practices

1. **Keep descriptions concise** - The release description should be 5-10 words max
2. **Focus on user benefits** - What does this version provide to users?
3. **Differentiate stable vs beta** - Make it clear what's different between channels
4. **Use consistent terminology** - Match the language used in your documentation
5. **Update regularly** - Keep release notes current with actual firmware features
6. **Include comprehensive metadata** - Use all available sections for rich information

### Fallback Behavior

If no release notes file is found, the system uses generic fallbacks:
- **stable**: "Stable firmware release for {DeviceType} devices"
- **beta**: "Beta firmware release for {DeviceType} devices"
- **alpha**: "Alpha firmware release for {DeviceType} devices"

### Testing

After adding release notes:
1. Run `python3 deploy-automation.py` to regenerate manifests
2. Check the web interface to verify descriptions display correctly
3. Test that descriptions are included in search functionality
4. Verify that additional metadata is included in manifest files

### Manifest Integration

The release notes system automatically includes in manifest.json:
- **description**: Short description for web interface
- **features**: List of key features (limited to 5 items)
- **hardware_requirements**: Hardware needed (limited to 3 items)
- **known_issues**: Current issues (limited to 3 items)
- **changelog**: What's new (limited to 5 items)

### Automation Integration

The system integrates with `deploy-automation.py`:
1. Scans firmware directory for .bin files
2. Extracts metadata from file paths
3. Loads corresponding release notes file
4. Parses markdown sections using regex
5. Includes rich metadata in manifest files
6. Provides fallback descriptions for missing files

### Example Output

The descriptions appear in the web interface like this:

```
CO2Monitor v1.0.1 | ESP32-S3 | STABLE | Bug fixes and improved CO2 sensor accuracy | 14/07/2025
EnvMonitor v2.2.0 | ESP32 | BETA | Beta version with enhanced environmental analytics and alerts | 14/07/2025
```

The description appears between the channel (STABLE/BETA) and the release date, with additional metadata available in the manifest files.