# Changelog

All notable changes to WebFlash are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Content Security Policy (CSP) headers for enhanced security
- JSDoc documentation for key JavaScript modules
- CHANGELOG.md for tracking release history
- Service worker for offline caching support
- Improved browser compatibility messaging

### Security
- Added X-Frame-Options, X-Content-Type-Options, and X-XSS-Protection headers
- Implemented strict Referrer-Policy

## [2.0.0] - 2025

### Added
- Complete documentation rewrite with comprehensive guides
- Improved ESP Web Tools compliance (upgraded to v10)
- Enhanced landing page with path selector for pre-built vs custom firmware
- Unified landing experience with firmware path options
- ESPHome public repository link for custom firmware builds
- Visual feedback for module conflicts

### Changed
- Updated firmware card layout and styling
- Improved install assumption messaging for missing modules
- Enhanced pre-flash acknowledgement warning styling
- Better synchronization of review summary visibility with step transitions

### Fixed
- Wizard initialization on already-loaded documents
- Firmware controls label updates
- Firmware integrity verification order
- Ready helper text wrapping for multi-line content

## [1.0.0] - 2024

### Added
- Initial release of WebFlash firmware configuration tool
- Step-by-step wizard interface (Mounting, Power, Modules, Review)
- Support for Wall and Ceiling mounting configurations
- Power source options: USB, POE, PWR
- Module support: AirIQ (Base/Pro), Presence (Base/Pro), Comfort, Fan (PWM/Analog)
- Hardware compatibility validation and conflict detection
- Direct install via URL parameters
- Sharable configuration links
- Pre-flash safety checklist and diagnostics
- Firmware integrity verification (SHA256, MD5)
- ESP Web Tools integration for browser-based flashing
- Improv Serial protocol support for Wi-Fi setup
- Browser capability detection (Web Serial, Web USB)
- Automated manifest generation from firmware binaries
- GitHub Actions CI/CD for deployment to GitHub Pages
- Comprehensive error handling and user feedback
- XSS prevention with HTML escaping throughout

### Security
- Input validation for all URL parameters
- Firmware signature verification
- No external runtime dependencies
