# Sense360 ESP32 Installer

## Overview

This is a web-based installer for Sense360 v2.0.0 firmware that uses the official ESP Web Tools library to provide a reliable, browser-based interface for flashing Sense360 firmware to ESP32 devices via USB. The application is designed as a static web app suitable for GitHub Pages deployment, providing a minimal but professional interface for end users to easily install Sense360 firmware.

## System Architecture

### Frontend Architecture
- **Static HTML/CSS** structure for GitHub Pages compatibility
- **ESP Web Tools integration** - Uses the official, battle-tested ESP Web Tools library
- **No custom JavaScript** - Leverages ESP Web Tools' built-in functionality
- **Minimal dependencies** - Only relies on ESP Web Tools CDN

### Browser Requirements
- **Chrome or Edge browsers only** - Web Serial API restriction
- **HTTPS required** - Web Serial API security requirement
- **Web Serial API support** - Modern browser feature

## Key Components

### 1. ESP Web Tools Integration
- Uses official ESP Web Tools library from `https://unpkg.com/esp-web-tools@10`
- Handles all device connection and flashing logic
- Provides built-in progress tracking and error handling
- Supports automatic chip detection and firmware selection

### 2. Manifest-based Configuration
- **Manifest-driven** - Uses `manifest.json` to describe available firmware
- **Multi-chip support** - ESP32, ESP32-S2, ESP32-C3, ESP32-S3
- **Improv protocol support** - Built-in Wi-Fi provisioning capability
- **Standard format** - Follows ESP Web Tools manifest specification

### 3. User Interface
- Clean, professional design with feature highlights
- Built-in browser compatibility warnings
- Comprehensive troubleshooting guide
- Responsive layout for mobile and desktop

### 4. Error Handling
- ESP Web Tools provides built-in error handling
- Custom UI slots for "not supported" and "not allowed" scenarios
- Clear user guidance for common issues

## Data Flow

1. **Library Loading**:
   - ESP Web Tools loads from CDN → Registers custom elements → Ready for use

2. **Device Connection**:
   - User clicks connect → ESP Web Tools shows device picker → Device selected → Connection established

3. **Firmware Flashing**:
   - ESP Web Tools loads manifest → Detects chip type → Selects firmware → Flashes device → Shows progress

## External Dependencies

### ESP Web Tools
- **Official library** - Maintained by ESPHome team
- **CDN delivery** - Served from unpkg.com
- **Proven reliability** - Used by ESPHome and other major projects
- **Built-in features** - Device detection, flashing, Improv support

### Browser APIs (handled by ESP Web Tools)
- **Web Serial API** - Core functionality
- **File API** - Firmware loading
- **Web Components** - Custom elements

## Deployment Strategy

### GitHub Pages Deployment
- **Static hosting** - No server-side processing required
- **GitHub Actions workflow** - Automated deployment on push to main
- **CORS headers** - Proper configuration for manifest and firmware files
- **HTTPS enforcement** - Required for Web Serial API

### File Structure
```
/
├── index.html                    # Sense360 installer page with ESP Web Tools
├── manifest.json                 # ESP Web Tools manifest for Sense360 firmware
├── css/style.css                 # Application styles
├── README.md                     # Project documentation
├── _headers                      # CORS headers for GitHub Pages
├── .github/workflows/deploy.yml  # GitHub Actions deployment
└── firmware/                     # Firmware binary files
    ├── Sense360-Fan-PWM-S3-v1.0.0-Stable.bin      # Fan control with PWM (ESP32-S3)
    ├── Sense360-AirQ-CO2-WROOM1-v1.0.0-Beta.bin   # Air Quality CO2 monitoring (ESP32)
    ├── Sense360-Multi-S3-v2.1.3-Stable.bin        # Multi-function firmware (ESP32-S3)
    └── sense360_v2.v2.0.0.factory.bin              # Legacy firmware file
```

## Recent Changes
- July 04, 2025: Implemented structured naming convention for firmware releases
  - Added consistent naming format: Sense360-[Family]-[Feature/Type]-[Board/Chip]-[Version]-[Channel].bin
  - Created three distinct firmware variants: Fan-PWM, AirQ-CO2, and Multi-function
  - Updated manifest.json to use new firmware naming structure with proper chip family mapping
  - Added firmware documentation table in README.md with naming convention guidelines
  - Updated UI to reflect multiple firmware variants and applications

- July 04, 2025: Applied clean minimal theme based on user preference
  - Changed from gradient to clean white background with subtle styling
  - Reduced text sizes and simplified visual design for professional appearance
  - Maintained all ESP32 variant compatibility with cleaner interface

- July 04, 2025: Resolved ESP32-S3 compatibility issue by adding support for multiple ESP32 variants (ESP32, ESP32-S3, ESP32-S2, ESP32-C3) in manifest.json
  - Fixed "board not supported" error that was preventing firmware installation on ESP32-S3 devices
  - Updated manifest.json to include all ESP32 chip families using the same Sense360 firmware binary
  - Added modern gradient theme with enhanced visual design and improved user experience
  - Updated UI to reflect multi-chip support in firmware features list

- July 04, 2025: Customized for Sense360 v2.0.0 firmware
  - Added specific Sense360 v2.0.0 factory firmware binary
  - Updated manifest.json to target Sense360 firmware specifically
  - Rebranded interface as "Sense360 ESP32 Installer"
  - Added firmware feature highlights and installation instructions
  - Focused UI on single firmware option for simplified user experience

- July 04, 2025: Major architectural refactor to use ESP Web Tools
  - Removed custom JavaScript implementation (main.js, esp-flasher.js, serial-monitor.js)
  - Integrated official ESP Web Tools library for reliable device communication
  - Redesigned UI with professional layout and comprehensive troubleshooting
  - Updated manifest.json to ESP Web Tools standard format
  - Added detailed README and project documentation

## Changelog
- July 04, 2025: Initial setup with custom Web Serial API implementation
- July 04, 2025: Complete refactor to use ESP Web Tools library

## User Preferences

Preferred communication style: Simple, everyday language.