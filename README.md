# WebFlash - Sense360 ESP32 Firmware Installer

Browser-based firmware installation for Sense360 ESP32 devices using ESP Web Tools.

**Live Site:** https://sense360store.github.io/WebFlash/

## Overview

WebFlash provides a step-by-step wizard for configuring and flashing Sense360 firmware to ESP32 devices directly from your browser. No drivers or local toolchains required.

## Requirements

- Chromium-based browser (Chrome, Edge, Opera)
- Windows, macOS, or Linux
- USB data cable
- Sense360 ESP32 device

Note: Firefox and Safari have limited Web Serial support and may not work.

## Quick Start

1. Navigate to https://sense360store.github.io/WebFlash/
2. Configure your device:
   - Select core type (Core or Core Voice)
   - Select mounting type (Wall or Ceiling)
   - Choose power source (USB, POE, or PWR Module)
   - Enable required modules (AirIQ, Presence, Comfort, Fan)
3. Review the recommended firmware configuration
4. Wait for firmware verification to complete
5. Acknowledge safety warnings
6. Click "Install Firmware" to flash via browser
7. Follow ESP Web Tools prompts to complete installation

## Configuration Options

### Core Type
- **Core**: Standard Sense360 core module without voice hardware
- **Core Voice**: Core with I2S microphone array and audio output for voice control (requires Rev B core or newer, J5 audio interface header)

### Mounting Type
- **Wall Mount**: Supports all power and module combinations
- **Ceiling Mount**: Excludes fan module options

### Power Source
- **USB Power**: USB-C connection
- **POE Module**: Power over Ethernet backplate
- **PWR Module**: External power supply module

### Expansion Modules
- **AirIQ Module**: None, Base, Pro
- **Presence Module**: None, Base, Pro
- **Comfort Module**: None, Base
- **Fan Module**: None, PWM, Analog (Wall mount only)
- **LED Ring**: None, Base (Required for Core Voice)

### Release Channels
- **Stable**: Production-ready firmware
- **Preview**: Early access to upcoming features
- **Beta**: Testing releases (not recommended for production)

## Installation Process

1. **Connect Device**: Plug device into computer via USB
2. **Select Configuration**: Choose mounting, power, and modules
3. **Review Firmware**: Verify selected firmware matches your hardware
4. **Verification**: Wait for cryptographic signature check
5. **Acknowledge**: Check safety warning acknowledgment
6. **Flash**: Click "Install Firmware" button
7. **Device Selection**: Choose correct serial port in browser dialog
8. **Wait**: Installation takes 1-2 minutes
9. **Complete**: Device reboots automatically when finished

## Wi-Fi Configuration

After flashing, the device will prompt for Wi-Fi credentials via Improv Serial protocol:

1. Keep browser window open after flashing
2. Enter Wi-Fi SSID when prompted
3. Enter Wi-Fi password
4. Device connects automatically

No manual hotspot connection required.

## Safety Information

- Only flash firmware from trusted sources
- Ensure correct firmware configuration matches your hardware
- Do not disconnect device during flashing
- Wi-Fi credentials are sent directly to device (not uploaded)
- All operations occur in your browser

## Support Features

The Review step includes utilities for troubleshooting:

- **Copy Support Info**: Captures device detection, browser support, and configuration
- **Copy Sharable Link**: Creates URL with your current configuration
- **Copy Firmware URL**: Direct link to firmware file

These can be shared with support teams for faster issue resolution.

## Troubleshooting

### Device Not Detected

- Use a data-capable USB cable (not charge-only)
- Try different USB port
- Close other programs using serial ports (Arduino IDE, PlatformIO, etc.)
- On Linux: Add user to `dialout` group and re-login

### Failed to Fetch Error

- Refresh page and try again
- Clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)
- Verify using official site URL
- Check internet connection

### Installation Fails

- Ensure device is in bootloader mode (press BOOT button if available)
- Try different USB cable or port
- Restart browser
- Check USB cable supports data transfer

### Wrong Firmware Installed

- Device will not function correctly with wrong configuration
- Flash correct firmware matching your hardware
- Contact support if unsure of configuration

For additional help, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Custom Firmware & Source Code

For users who want to build custom firmware configurations or modify the ESPHome YAML source files:

- **ESPHome Public Repository**: [sense360store/esphome-public](https://github.com/sense360store/esphome-public) - Contains ESPHome YAML configurations for DIY users compiling via Home Assistant/ESPHome

WebFlash provides pre-compiled firmware binaries for plug-and-play browser-based flashing. The esphome-public repository contains the source YAML files for users who want to customize or build their own firmware.

## Documentation

- **README.md** (this file): User guide for flashing devices
- **DEVELOPER.md**: Maintainer guide for publishing firmware
- **TROUBLESHOOTING.md**: Detailed troubleshooting steps
- **FEATURES.md**: Feature tracking and roadmap

## Project Structure

```
WebFlash/
├── index.html              # Web interface
├── app.js                  # Application logic
├── manifest.json           # Firmware catalog (auto-generated)
├── firmware-*.json         # Individual firmware manifests (auto-generated)
├── firmware/               # Firmware binaries and configurations
│   ├── configurations/     # Production firmware files
│   └── rescue/             # Recovery firmware
├── scripts/                # Manifest generation and sync scripts
├── css/                    # Stylesheets
└── __tests__/              # Test suite
```

## License

This project is for Sense360 device owners and authorized distributors.

## Support

For issues or questions:
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Review firmware configuration requirements
- Contact Sense360 support with device details and configuration
