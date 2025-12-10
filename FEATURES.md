# WebFlash Features

This document tracks implemented and planned features for the WebFlash firmware installation tool.

## Completed Features

### Core Wizard Interface
- [x] Step-by-step wizard interface (4 steps: Mount → Power → Modules → Review)
- [x] Wall and Ceiling mounting support
- [x] Power source options (USB, POE, PWR)
- [x] Visual progress indicator with step navigation
- [x] Mobile-responsive design

### Module Support
- [x] AirIQ Module (Base/Pro) - Temperature, humidity, VOC/NOx sensors
- [x] Bathroom AirIQ Module (Base/Pro) - Ceiling-only with pressure sensor
- [x] Presence Module (Base/Pro) - mmWave radar occupancy detection
- [x] Comfort Module - Temperature and ambient light
- [x] Fan Module (PWM/Analog) - External fan control
- [x] Ceiling fan support

### Configuration & Compatibility
- [x] Module conflict detection with visual feedback
- [x] Hardware compatibility validation (core revision, headers)
- [x] Firmware recommendation engine
- [x] Default recommended bundle (Wall + USB + AirIQ Base + Presence Base)
- [x] Quick-start presets for common configurations

### Installation Features
- [x] ESP Web Tools v10 integration
- [x] Web Serial API support
- [x] Flash progress indicator (Connect → Erase → Write → Verify)
- [x] Pre-flash safety acknowledgment
- [x] Firmware integrity verification (SHA256, MD5)
- [x] Flash history tracking with export

### Post-Installation
- [x] Improv Serial protocol for WiFi setup
- [x] Automatic WiFi credential entry

### User Experience
- [x] Dark/light theme toggle with persistent preference
- [x] Browser capability detection
- [x] Sharable configuration links via URL parameters
- [x] QR code generation for device configuration
- [x] Copy support info feature
- [x] Copy firmware URL for direct downloads
- [x] Release notes display (markdown support)

### Technical Features
- [x] Service worker for offline support
- [x] Multiple release channels (Stable, Preview, Beta)
- [x] Automated manifest generation
- [x] GitHub Actions CI/CD deployment
- [x] Comprehensive test suite

---

## Planned Features

### Voice Control
- [x] Voice module UI support in wizard
- [x] Voice assistant integration options
- [x] Voice firmware configuration

### Firmware Management
- [ ] Firmware update checker (compare installed vs available)
- [ ] OTA (Over-the-Air) update support
- [ ] Firmware changelog viewer
- [ ] Custom firmware upload option

### Device Management
- [ ] Device configuration backup/restore
- [ ] Multi-device batch flashing
- [ ] Device identification/naming
- [ ] Connected device dashboard

### Enhanced Configuration
- [ ] User-saved configuration presets
- [ ] Configuration import/export (JSON)
- [ ] Configuration comparison tool
- [ ] Advanced mode with all options visible

### Diagnostics
- [ ] Device diagnostic mode
- [ ] Sensor health check
- [ ] Connection quality indicator
- [ ] Error log viewer

### Localization
- [ ] Multi-language support
- [ ] Localized documentation

---

## Version History

| Version | Key Features Added |
|---------|-------------------|
| 2.0.0   | Bathroom AirIQ, Flash progress indicator, Ceiling fan support, Theme toggle |
| 1.0.0   | Initial release with core wizard, module support, safety features |

---

*Last updated: December 2025*
