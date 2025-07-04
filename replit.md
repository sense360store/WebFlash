# ESP32 Firmware Flasher

## Overview

This is a web-based ESP32 firmware flashing tool that leverages the Web Serial API to connect directly to ESP32 devices via USB and flash firmware. The application is designed as a static web app suitable for GitHub Pages deployment, providing a minimal but functional interface similar to ESP Web Tools.

## System Architecture

### Frontend Architecture
- **Pure JavaScript ES6 modules** with no build process required
- **Static HTML/CSS/JS** structure for GitHub Pages compatibility
- **Modular design** with separate classes for different functionalities:
  - `ESPFlasher` - Handles device connection and firmware flashing
  - `SerialMonitor` - Manages serial communication and monitoring
  - `ESP32FlasherApp` - Main application controller

### Browser Requirements
- **Chrome or Edge browsers only** - No fallback or polyfills
- **HTTPS required** - Web Serial API restriction
- **Web Serial API support** - Modern browser feature

## Key Components

### 1. Device Connection (`ESPFlasher`)
- Connects to ESP32 devices via Web Serial API
- Supports multiple USB-to-serial chip vendors (CP2102, CH340, FT232, ESP32-S2)
- Automatically detects connected ESP device type
- Manages bootloader mode entry for flashing

### 2. Serial Monitor (`SerialMonitor`)
- Provides real-time serial output display
- Allows sending commands to connected devices
- Implements basic terminal functionality
- No simulation - only real device output

### 3. Firmware Management
- **Manifest-based selection** - Uses `manifest.json` to describe available firmware
- **Automatic chip detection** - Selects correct firmware based on connected device
- **Merged binary support** - Uses single `.bin` files for ESP32/ESP-IDF v4+
- **Multi-chip support** - ESP32, ESP32-S2, ESP32-C3, ESP32-S3

### 4. User Interface
- Minimal, functional design
- Connection status display
- Progress tracking for firmware flashing
- Live serial console
- Wi-Fi provisioning interface (optional Improv standard)

## Data Flow

1. **Device Connection Flow**:
   - User clicks connect → Browser shows device picker → Device selected → Serial port opened → Device info retrieved

2. **Firmware Flashing Flow**:
   - Load manifest → Detect chip type → Select appropriate firmware → Enter bootloader mode → Flash firmware → Monitor progress

3. **Serial Communication Flow**:
   - Establish serial connection → Start monitoring loop → Display real-time output → Accept user commands

## External Dependencies

### Browser APIs
- **Web Serial API** - Core functionality for device communication
- **File API** - For loading firmware binaries
- **TextEncoder/TextDecoder** - For serial data conversion

### No External Libraries
- Pure JavaScript implementation
- No build tools or bundlers required
- No third-party dependencies

## Deployment Strategy

### GitHub Pages Deployment
- **Static hosting** - No server-side processing required
- **GitHub Actions workflow** - Automated deployment on push to main
- **CORS headers** - Proper configuration for manifest and firmware files
- **HTTPS enforcement** - Required for Web Serial API

### File Structure
```
/
├── index.html          # Main application page
├── manifest.json       # Firmware manifest
├── css/style.css       # Application styles
├── js/
│   ├── main.js         # Main application controller
│   ├── esp-flasher.js  # Device connection and flashing
│   └── serial-monitor.js # Serial communication
└── firmware/           # Firmware binary files
    ├── esp32-merged-firmware.bin
    ├── esp32s2-merged-firmware.bin
    ├── esp32c3-merged-firmware.bin
    └── esp32s3-merged-firmware.bin
```

## Changelog
- July 04, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.