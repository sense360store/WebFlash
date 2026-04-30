# WebFlash Features

This document tracks implemented and planned features for the WebFlash firmware installation tool.

## Completed Features

### Core Wizard Interface
- [x] Step-by-step wizard interface (5 steps: Core → Mount → Power → Modules → Review)
- [x] Core type selection (Core or Core Voice)
- [x] Wall and Ceiling mounting support
- [x] Power source options (USB, POE, PWR)
- [x] Visual progress indicator with step navigation
- [x] Mobile-responsive design

### Module Support
- [x] AirIQ Module (Base/Pro) - Temperature, humidity, VOC/NOx sensors
- [x] Bathroom AirIQ Module (Base/Pro) - Ceiling-only with pressure sensor
- [x] Fan Module (PWM/Analog) - External fan control
- [x] Ceiling fan support

### Configuration & Compatibility
- [x] Module conflict detection with visual feedback
- [x] Hardware compatibility validation (core revision, headers)
- [x] Firmware recommendation engine
- [x] Default recommended bundle (Wall + USB + AirIQ Base)
- [x] Quick-start presets for common configurations

### Installation Features
- [x] ESP Web Tools v10 integration
- [x] Web Serial API support
- [x] Flash progress indicator (Connect → Erase → Write → Verify)
- [x] Pre-flash checklist acknowledgement (`Before you flash` checkbox)
- [x] Firmware integrity verification (SHA256, MD5)
- [x] Flash history tracking with export

### Presets & Preflight
- [x] Preset export to JSON from Review sidebar (`Export JSON`)
- [x] Preset import from JSON (`Import JSON`) with schema validation diagnostics
- [x] Import compatibility handling:
  - blocking mismatch is rejected
  - warning mismatch can be continued after confirmation (`Apply anyway?`)
- [x] Preflight checks panel with status badges (`Pass`, `Warning`, `Fail`)
- [x] Install/download gating on failed preflight checks
- [x] Warning-level preflight acknowledgement gate (`Accept preflight warnings` checkbox renders only when warnings are present)
- [x] One-click diagnostics bundle copy (`Copy diagnostics` on the preflight panel) with sensitive-key redaction

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

## MVP Gaps / Incomplete Areas

- [x] **Connection-quality heuristic wiring:** Stability window now resets on entry to the Review step, and `navigator.serial` `connect`/`disconnect` events plus ESP Web Tools `state-changed`/`error` transitions update the metrics directly so `Connection quality` reflects real serial lifecycle events.
- [x] **Diagnostics bundle copy flow:** `Copy diagnostics` on the preflight panel emits a single redacted JSON bundle (preflight results, configuration, firmware target, connection-quality snapshot) via the clipboard.
- [x] **Preflight warning acknowledgement UX:** `Accept preflight warnings` is rendered as a checkbox inside the preflight panel and is shown only when at least one warning is active.

---

## Planned Features

### Firmware Management
- [x] Firmware update checker (compare installed vs available)
- [ ] OTA (Over-the-Air) update support
- [x] Firmware changelog viewer
- [ ] Custom firmware upload option

### Device Management
- [ ] Device configuration backup/restore
- [ ] Multi-device batch flashing
- [ ] Device identification/naming
- [ ] Connected device dashboard

### Enhanced Configuration
- [x] User-saved configuration presets
- [x] Configuration import/export (JSON) in Review sidebar
- [ ] Configuration comparison tool
- [ ] Advanced mode with all options visible

### Diagnostics
- [ ] Device diagnostic mode
- [x] Sensor health check
- [x] Connection quality preflight check (event-driven telemetry from `navigator.serial` and ESP Web Tools install state)
- [x] Error log viewer

### Localization
- [ ] Multi-language support
- [ ] Localized documentation
