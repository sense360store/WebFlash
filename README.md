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
   - Select mounting type (Ceiling)
   - Choose power source (USB, Sense360 PoE PSU, or Sense360 Mains PSU)
   - Enable required modules (Sense360 RoomIQ, Sense360 AirIQ or Sense360 VentIQ, Sense360 LED, Sense360 Fan Relay / Fan PWM / Fan DAC, Sense360 TRIAC)
3. Review the recommended firmware configuration
4. Wait for firmware verification to complete
5. Acknowledge **Before you flash** checklist
6. Resolve preflight failures (and warnings when applicable)
7. Click "Install Firmware" to flash via browser
8. Follow ESP Web Tools prompts to complete installation

## Configuration Options

Each option below is a separate Sense360 SKU. The product taxonomy is flat — there is no Base/Pro or Model/Variant axis, so older "AirIQ Base/Pro" or "LED Base" labels do not map to current SKUs.

### Mounting Type
- **Ceiling Mount**: The currently supported mount style. A "Wall" branch lingers in markup and legacy URL aliases but is not a supported product.

### Power Source
- **USB Power**: USB-C connection, no separate PSU
- **Sense360 PoE PSU** (S360-410): PoE-to-5V power module
- **Sense360 Mains PSU** (S360-400): Mains-to-5V power module (HLK-5M05)

### Sensor Modules (Ceiling)
- **Sense360 RoomIQ** (S360-200): Combined presence and comfort board (PIR, LD2450, SEN0609, LTR-303ALS light, SHT4x temperature/humidity, BMP351 pressure)
- **Sense360 AirIQ** (S360-210): Air quality board (CO₂ SCD41, VOC SGP41, gas MICS-4514) with optional PM (SPS30) and HCHO (SFA30) connectors. Hidden when Bathroom mode is enabled.
- **Sense360 VentIQ** (S360-211): Bathroom-focused air quality board (SGP41) with optional IR temperature and SPS30 connectors. Only appears when Bathroom mode is enabled on a Ceiling hub. Mutually exclusive with AirIQ.

### Indicator Modules
- **Sense360 LED** (S360-300): Ring of WS2812B LEDs

### Inline Fan / Switching Drivers
- **Sense360 Fan Relay** (S360-310): On / off relay for bathroom fans
- **Sense360 Fan PWM** (S360-311): 12V PWM driver, up to 4 fans with tach feedback
- **Sense360 Fan DAC** (S360-312): 0–10V analog driver (for example Cloudlift S12). Conflicts with AirIQ — both occupy the shared DAC bus.
- **Sense360 TRIAC** (S360-320): Phase dimmer for mains fan or lamp

### Release Channels
- **Stable**: Production-ready firmware
- **Preview**: Early access to upcoming features
- **Beta**: Testing releases (not recommended for production)


## Canonical Option Inventory Table

The table below lists the canonical Sense360 SKUs. The **Friendly name** column is the user-facing label used verbatim in the wizard, manifest descriptions, and module metadata. The **Old name** column lists deprecated internal/historical names retained only to help recognise legacy references — they should not appear in new code or UI copy.

| Group | Type | Friendly name | SKU | Rev | Old name | What it does |
|---|---|---|---|---|---|---|
| Ceiling | Hub | Sense360 Core | S360-100 | R4 | `360Core_Ceiling_V3_R` | Main board with the ESP32-S3 and connectors for all other modules. |
| Ceiling | Sensor | Sense360 RoomIQ | S360-200 | R4 | Presence + Comfort (two boards) | Merged board: PIR, LD2450, SEN0609, LTR-303ALS (light), SHT4x (temperature/humidity), BMP351 (pressure). |
| Ceiling | Sensor | Sense360 AirIQ | S360-210 | R4 | `AirlQ Ceiling` (typo in old name) | Air quality board (CO₂ SCD41, VOC SGP41, gas MICS-4514 with STM8). Connectors for PM (SPS30) and HCHO (SFA30). |
| Ceiling | Sensor | Sense360 VentIQ | S360-211 | R4 | Bathroom Pro | Smaller air quality board for bathrooms (SGP41 onboard). Connectors for IR temperature and SPS30. |
| Ceiling | Indicator | Sense360 LED | S360-300 | R4 | LED Ring | Ring of WS2812B LEDs. |
| Inline | Driver | Sense360 Fan Relay | S360-310 | R4 | `S360-Relay-C` | On / off relay for bathroom fans. |
| Inline | Driver | Sense360 Fan PWM | S360-311 | R4 | `12vFan_PWM_PulseCounter` | 12V PWM fan driver, up to 4 fans with tach feedback. |
| Inline | Driver | Sense360 Fan DAC | S360-312 | R4 | `Fan_GP8403` | 0 to 10V analog fan driver, for example Cloudlift S12. |
| Inline | Driver | Sense360 TRIAC | S360-320 | R4 | `TRIAC_Board` | Phase dimmer for mains fan or lamp. |
| Power | PSU | Sense360 Mains PSU | S360-400 | R4 | PWR Module | Mains to 5V using HLK-5M05. |
| Power | PSU | Sense360 PoE PSU | S360-410 | R4 | PoE Module | PoE to 5V. |

Notes:

- The current wizard exposes Ceiling mount only; a "Wall" branch lingers in markup/legacy aliases but is not a supported product.
- Each SKU is its own product. There is no Base/Pro or Model/Variant axis — labels such as "AirIQ Base/Pro", "VentIQ Base/Pro", or "LED Base" do not map to current SKUs and must not appear in new wizard markup or manifest metadata.
- AirIQ and VentIQ are mutually exclusive: VentIQ replaces AirIQ when Bathroom mode is enabled on a Ceiling hub.
- Voice-enabled hubs are not currently selectable; the `voice` module key only exposes `none`.

### Source of Truth

Constraint enforcement is implemented in `scripts/data/module-requirements.js` (SKUs, headers, conflicts, `ceilingOnly`/`requiresBathroom` flags) and in `scripts/state.js` (`MODULE_LABELS`, `MODULE_VARIANT_LABELS`, `MODULE_SEGMENT_FORMATTERS`, UI gating, and auto-resets). Keep this README synchronized with those files whenever option logic changes.

## Compatibility Matrix

Legend: ✅ allowed, 🚫 blocked by current UI logic, ⚠️ conditionally allowed.

### Mount × Power compatibility (current UI)

| Mount \ Power | USB | Sense360 PoE PSU | Sense360 Mains PSU |
|---|---:|---:|---:|
| Ceiling | ✅ | ✅ | ✅ |

> Wall mount lingers in markup and legacy URL aliases but is not a supported product, so only Ceiling combinations are exposed in the running wizard.

### Mount × Module compatibility (current UI constraints)

| Mount | Bathroom mode | RoomIQ | AirIQ | VentIQ | LED | Fan / TRIAC |
|---|---|---|---|---|---|---|
| Ceiling + Bathroom OFF | n/a | optional | optional (`none`, `airiq`) | hidden, forced `none` | optional (`none`, `airiq`) | optional (`none`, `relay`, `pwm`, `analog`, `triac`) |
| Ceiling + Bathroom ON | enabled | optional | hidden, forced `none` | optional (`none`, `airiq`) | optional (`none`, `airiq`) | optional (`none`, `relay`, `pwm`, `analog`, `triac`) |

### Enforced module-combination constraints

| Combination | Result | Constraint source |
|---|---|---|
| AirIQ + Sense360 Fan DAC (analog) | 🚫 blocked | Shared DAC bus conflict in `scripts/data/module-requirements.js`. |
| AirIQ + VentIQ on the same hub | 🚫 blocked | The Bathroom toggle swaps between AirIQ and VentIQ; both cannot be enabled simultaneously. |
| Mount != Ceiling, or Bathroom mode OFF | VentIQ hidden and reset to `none` | `ceilingOnly` and `requiresBathroom` flags on the `ventiq` matrix entry. |
| Voice (`voice`) module | Forced `none` | Only the `none` variant is exposed in the current wizard. |



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
