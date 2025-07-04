# ESP32 Firmware Flasher

## Overview

This is a web-based ESP32 firmware flashing tool that uses the official ESP Web Tools library to provide a reliable, browser-based interface for flashing firmware to ESP32 devices via USB. The application is designed as a static web app suitable for GitHub Pages deployment, providing a minimal but professional interface similar to established ESP flashing tools.

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
├── index.html                    # Main application page with ESP Web Tools
├── manifest.json                 # ESP Web Tools firmware manifest
├── css/style.css                 # Application styles
├── README.md                     # Project documentation
├── _headers                      # CORS headers for GitHub Pages
├── .github/workflows/deploy.yml  # GitHub Actions deployment
└── firmware/                     # Firmware binary files
    ├── esp32-merged-firmware.bin
    ├── esp32s2-merged-firmware.bin
    ├── esp32c3-merged-firmware.bin
    └── esp32s3-merged-firmware.bin
```

## Recent Changes
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