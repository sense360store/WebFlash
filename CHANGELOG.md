# Changelog

All notable changes to WebFlash are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Cross-repo firmware importer: `scripts/import-firmware-sources.py` pulls
  raw `.bin` assets from `sense360store/esphome-public` GitHub Releases,
  verifies SHA256 against the upstream `checksums-sha256.txt`, parses the
  release body's `## Changelog` / `## Known Issues` / `## Features` /
  `## Hardware Requirements` sections, and writes a WebFlash sidecar with
  full source provenance (`source_repo`, `release_tag`, `release_url`,
  `source_asset_name`, `source_asset_sha256`, `source_manifest_git_sha`,
  `source_manifest_esphome_version`, `imported_at`).
- Declarative source manifest at `firmware/sources.json` (schema_version 1).
  Release-One source: `sense360store/esphome-public@v1.0.0`, config
  `Ceiling-POE-VentIQ-RoomIQ`, with `block_tokens: ["FanTRIAC", "LED"]`.
- `.github/workflows/firmware-import.yml` — manual `workflow_dispatch`
  workflow that runs the importer, regenerates manifests, and auto-commits
  to the dispatching branch. Does not auto-merge and does not deploy.
- Ed25519-signed Release-One firmware entry `Ceiling-POE-VentIQ-RoomIQ`
  v1.0.0 imported from upstream esphome-public release (1,087,488 bytes,
  SHA256 `9169f2ce486d14d3c0e0b1d6e9adf558480db6ec301f8eac1622fda4d7ceffcc`).
- Python unit tests (`__tests__/python/test_import_firmware_sources.py`,
  20 cases) covering: missing asset, wrong filename, tiny `.bin`, checksum
  mismatch, missing release-body section, blocked FanTRIAC, blocked LED,
  happy path, dry-run, sidecar provenance.
- Jest smoke test (`__tests__/manifest-required-configs.test.js`) asserting
  `manifest.json` contains the imported `Ceiling-POE-VentIQ-RoomIQ` build.
- Content Security Policy (CSP) headers for enhanced security
- JSDoc documentation for key JavaScript modules
- CHANGELOG.md for tracking release history
- Service worker for offline caching support
- Improved browser compatibility messaging

### Security
- Added X-Frame-Options, X-Content-Type-Options, and X-XSS-Protection headers
- Implemented strict Referrer-Policy

### Changed
- `Ceiling-POE-VentIQ-RoomIQ` added to the `REQUIRED_CONFIGS` allowlist in
  `.github/workflows/firmware-publish.yml`. The 9 pre-existing required
  configs are unchanged; pruning stale entries is tracked as a separate
  cleanup/audit PR.
- Removed 8 stale legacy configs (`Ceiling-POE-AirIQ`,
  `Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`,
  `Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`, `Ceiling-Voice-POE-AirIQ`,
  `Ceiling-Voice-USB`) from `REQUIRED_CONFIGS` in
  `.github/workflows/firmware-publish.yml`. The publish guard now tracks
  Release-One (`Ceiling-POE-VentIQ-RoomIQ`) and `Rescue` only — the two
  configs backed by a real signed `.bin` on disk. Manifest pruning of the
  matching stale builds is deferred to a follow-up cleanup PR.
- Retired legacy module variants were removed from manifests and distribution artifacts.

### Fixed
- Root manifest freshness check no longer reports a false
  `missing-generated-at` warning on the live Simple install. The successful
  manifest-load path now captures the root manifest's top-level
  `generated_at` (previously only reachable via test hooks), so the live
  recheck has a loaded timestamp to compare against. The freshness probe now
  targets the absolute `/WebFlash/manifest.json` on GitHub Pages (instead of a
  relative path that can misresolve to the domain root), tolerates a nested
  `manifest.generated_at` envelope in addition to the canonical top-level
  field, and attaches explicit diagnostics (fetched URL, HTTP status,
  content-type, top-level keys, top-level/nested `generated_at` presence, and
  the selected timestamp source) to every verdict. A root manifest with a
  valid `generated_at` now resolves to `current`/`same-or-newer`; stale still
  hard-blocks and fetch/HTTP/parse failures remain individually diagnosed.

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
- Module support: AirIQ (Base/Pro), Fan (PWM/Analog)
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
