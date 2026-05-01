# WebFlash - Sense360 ESP32 Firmware Installer

Browser-based firmware installation for Sense360 ESP32 devices using ESP Web Tools.

**Live Site:** https://sense360store.github.io/WebFlash/

## Overview

WebFlash provides a step-by-step wizard for configuring and flashing Sense360 firmware to ESP32 devices directly from your browser. It uses [ESP Web Tools](https://esphome.github.io/esp-web-tools/) and `esptool.js` over the Web Serial API &mdash; no drivers, no local toolchain.

## Requirements

- Desktop Chromium-based browser (Chrome, Edge, or Opera) on Windows, macOS, or Linux
- USB *data* cable (charge-only cables won't enumerate)
- Sense360 ESP32 hub

WebFlash is **desktop-only**. Web Serial isn't available on iOS, Android Chrome, or any mobile browser, and Firefox and Safari do not support it. If you open the site on an unsupported browser the install path will be disabled and you'll see a banner pointing you to a supported one.

## Quick Start

1. Navigate to https://sense360store.github.io/WebFlash/
2. Walk through the 5-step wizard:
   1. **Mounting** &mdash; only Ceiling is currently selectable
   2. **Core** &mdash; Sense360 Core (S360-100). Voice integration is not currently exposed
   3. **Power** &mdash; USB, Sense360 PoE PSU (S360-410), or Sense360 Mains PSU (S360-400)
   4. **Modules** &mdash; toggle Sense360 RoomIQ, AirIQ, VentIQ (when Bathroom mode is on), LED, and the Fan / switching board
   5. **Review** &mdash; verify the matched firmware, resolve preflight failures, acknowledge the *Before you flash* checkbox, then click Install
3. Follow the ESP Web Tools prompts in the browser to choose the serial port and complete installation
4. After flashing, stay on the page &mdash; WebFlash will offer to provision Wi-Fi over the same USB connection (Improv Serial)

## Configuration Options

There is no Model / Variant axis &mdash; each Sense360 SKU is its own product. The wizard exposes the Ceiling-mount line today; a Wall branch lingers in markup as a legacy alias and is not a supported product.

### Mounting
- **Ceiling** &mdash; the only supported mount

### Core
- **Sense360 Core (S360-100, R4)** &mdash; ESP32-S3 main board

### Power
- **USB** &mdash; USB-C from your computer
- **Sense360 PoE PSU (S360-410, R4)** &mdash; PoE backplate, PoE &rarr; 5V
- **Sense360 Mains PSU (S360-400, R4)** &mdash; mains &rarr; 5V via HLK-5M05

### Expansion modules

| Module | SKU | Notes |
|---|---|---|
| Sense360 RoomIQ | S360-200 | Presence + comfort sensors (PIR, LD2450, SEN0609, LTR-303ALS, SHT4x, BMP351). |
| Sense360 AirIQ | S360-210 | Air quality (CO₂, VOC, gas) with optional PM and HCHO connectors. Mutually exclusive with VentIQ &mdash; the Bathroom toggle switches between them on Ceiling mounts. |
| Sense360 VentIQ | S360-211 | Bathroom-focused air quality with onboard SGP41 plus IR temp / SPS30 connectors. Available only on Ceiling + Bathroom mode. |
| Sense360 LED | S360-300 | Ring of WS2812B LEDs. |
| Sense360 Fan Relay | S360-310 | On / off relay for bathroom fans. |
| Sense360 Fan PWM | S360-311 | 12V PWM fan driver (up to 4 fans with tach feedback). |
| Sense360 Fan DAC | S360-312 | 0&ndash;10V analog fan driver (e.g. Cloudlift S12). Conflicts with AirIQ on the shared DAC bus. |
| Sense360 TRIAC | S360-320 | Phase dimmer for mains fan or lamp. |

### Release channels
- **Stable** &mdash; production-ready firmware
- **Preview** &mdash; early access to upcoming features
- **Beta** &mdash; testing releases (not recommended for production)


## Compatibility matrix

Legend: ✅ allowed, 🚫 blocked by current UI logic, ⚠️ conditionally allowed.

### Mount × Power

| Mount \ Power | USB | PoE | Mains |
|---|---:|---:|---:|
| Ceiling | ✅ | ✅ | ✅ |
| Wall | 🚫 (legacy alias only) | 🚫 | 🚫 |

### Mount × Module

| Mount | Bathroom mode | AirIQ | VentIQ | Fan / switching | LED |
|---|---|---|---|---|---|
| Ceiling + Bathroom OFF | n/a | optional | hidden | Relay / PWM / DAC / TRIAC | optional |
| Ceiling + Bathroom ON | enabled | hidden | optional | Relay / PWM / DAC / TRIAC | optional |
| Wall | n/a | not selectable (legacy alias only) | not selectable | not selectable | not selectable |

### Enforced module-combination constraints

| Combination | Result | Constraint source |
|---|---|---|
| AirIQ + Fan DAC | 🚫 blocked | Shared DAC bus conflict in `scripts/data/module-requirements.js`. |
| AirIQ + VentIQ simultaneously | 🚫 blocked | Mutually exclusive; the Bathroom toggle switches between them. |
| VentIQ on a non-Ceiling mount | 🚫 hidden and reset | `requiresBathroom` + `ceilingOnly` in `module-requirements.js`. |

### Source of truth

- Hardware compatibility and conflicts: `scripts/data/module-requirements.js`
- UI gating, visibility, auto-reset rules: `scripts/state.js`
- Canonical SKU table: [`CLAUDE.md`](CLAUDE.md#sense360-hardware-reference-canonical-skus)

Keep this README in sync with those files whenever option logic changes.

## Preflight checks and install gating

Step 5 includes a **Preflight checks** panel with these labels:

- **Browser support**
- **Device connection visibility**
- **Connection quality**
- **Firmware verification**
- **User acknowledgement**

Each check reports `Pass`, `Warning`, or `Fail`. Current install/download gating behavior:

- Any `Fail` blocks install/download.
- The **Before you flash** checkbox (`I understand and will keep the hub powered and connected throughout flashing.`) must be checked.
- When at least one check reports `Warning`, an **Accept preflight warnings** checkbox appears in the preflight panel and must be checked before the install/download button is enabled. The checkbox is hidden again automatically as soon as the warning condition clears.

### Status-to-remediation quick map

- **Browser support = Fail**: switch to a Chromium browser with Web Serial (Chrome/Edge/Opera).
- **Device connection visibility = Warning**: connect/reconnect USB, close other serial apps, re-read device info.
- **Connection quality = Warning/Fail**: keep cable and power stable for at least 30s, avoid hubs, retry after reconnecting.
- **Firmware verification = Warning/Fail**: wait for verification to finish or reselect firmware/retry download if verification fails.
- **User acknowledgement = Warning**: check the **Before you flash** acknowledgement checkbox.

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
- **Copy Diagnostics**: Single redacted JSON bundle on the preflight panel containing browser capabilities, preflight check results, the selected configuration, the firmware target, and a connection-quality snapshot. Sensitive identifiers (IDs, MACs, serial numbers, tokens, signatures, paths, URLs) are replaced with `[REDACTED]` before copy.

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

Most devices auto-enter bootloader mode when ESP Web Tools opens the serial port. Try these in order:

- Try a different USB cable or USB port
- Use a known-good USB *data* cable (charge-only cables won't enumerate)
- Restart the browser and retry the install
- **Only if the device still isn't detected:** hold `BOOT`, tap `RESET`, then release `BOOT` to enter recovery mode manually, and retry the install while still in recovery

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
