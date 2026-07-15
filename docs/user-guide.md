# WebFlash user guide

WebFlash provides a step-by-step wizard for configuring and flashing Sense360
firmware to ESP32 devices directly from your browser. No drivers or local
toolchains required. The canonical flasher URL is
<https://sense360store.github.io/WebFlash/>.

This guide was relocated from the repository README when it became a short
front door (REPO-CUSTOMER-READY-001 S4). For how WebFlash is built — the
publishing pipeline and wizard frontend, the `manifest.json` boundary, the
desktop-only constraint, and the deploy gate — see
[`architecture.md`](architecture.md).

## Requirements

- Chromium-based browser (Chrome, Edge, Opera)
- Windows, macOS, or Linux
- USB data cable
- Sense360 ESP32 device

Note: Firefox and Safari have limited Web Serial support and may not work.

## Quick Start

1. Navigate to https://sense360store.github.io/WebFlash/
2. Configure your device:
   - Select mounting type (Ceiling only)
   - Choose power source (USB, Sense360 PoE PSU, or Sense360 240v PSU)
   - Enable optional modules (Sense360 RoomIQ, Sense360 AirIQ or Sense360 VentIQ, Sense360 LED, Sense360 Relay/PWM/DAC, Sense360 TRIAC)
3. Review the recommended firmware configuration
4. Wait for the firmware integrity check to complete
5. Acknowledge **Before you flash** checklist
6. Resolve preflight failures (and warnings when applicable)
7. Click "Install Firmware" to flash via browser
8. Follow ESP Web Tools prompts to complete installation

## Configuration Options

### Mounting Type

- **Ceiling Mount**: The only currently supported mount.

### Power Source

- **USB Power**: USB-C connection direct to the Core.
- **Sense360 PoE PSU** (`S360-410`): Power over Ethernet backplate.
- **Sense360 240v PSU** (`S360-400`): 240V mains-to-5V supply (HLK-5M05).

### Expansion Modules

- **Sense360 RoomIQ** (`S360-200`): Room sensor board with PIR presence, light (LTR-303ALS), temperature/humidity (SHT4x), and pressure (BMP581) on board, plus connectors for optional LD2450 (J2) and SEN0609/C4001 (J3) radar modules (connector-attached, not included by default).
- **Sense360 AirIQ** (`S360-210`): Air-quality board with CO₂ (SCD41), VOC/NOx indices (SGP41), and an uncalibrated gas sensor (MiCS-4514). External connector for the optional SPS30 particulate module (not included). Formaldehyde sensor fitment unresolved; not currently exposed as a supported customer function.
- **Sense360 VentIQ** (`S360-211`): Bathroom-focused air-quality board. SGP41 (VOC/NOx indices) is the only on-board sensor; external connectors for optional IR surface-temp and SPS30 modules (not included). Only appears when Bathroom mode is on; mutually exclusive with AirIQ. In combined setups RoomIQ supplies the temperature and humidity readings.
- **Sense360 LED** (`S360-300`): WS2812B addressable LED ring.
- **Sense360 Relay** (`S360-310`): On/off relay for bathroom fans.
- **Sense360 PWM** (`S360-311`): 12V PWM driver, up to 4 fans with tach feedback.
- **Sense360 DAC** (`S360-312`): 0–10V analog driver (e.g. Cloudlift S12). Conflicts with AirIQ on the shared DAC bus.
- **Sense360 TRIAC** (`S360-320`): Phase dimmer for mains fan or lamp.

The full operator-facing option inventory and the compatibility matrix the
wizard enforces live in [`hardware-options.md`](hardware-options.md). The room
preset picker (choosing a room / firmware preset instead of per-module
selection) is documented in [`kit-configuration.md`](kit-configuration.md).
A room preset is an installer firmware preset, never a statement that a
commercial bundle is available or buyable. The release
channel policy (stable, beta, preview, development, recovery) is documented
in [`release-channel-policy.md`](release-channel-policy.md).

## Interface version

WebFlash ships a single installer view at the site root, served from the
production shell (`index.html` loads `scripts/bootstrap.js`, which mounts the 2.0
view in `scripts/shell.js`). There is no `?ui` flag and no alternate view: the
WebFlash 2.0 redesign is the only view. The earlier 1.0 view and its one release
`?ui=1` rollback were removed after the 2.0 GA cutover soaked a stable release.
The view is a render layer only: every gating decision (provenance, channel
acknowledgement, SHA-256 verification of the downloaded bytes, manifest
freshness, service worker update, installability per the release gates, and the
desktop only capability check) is owned by the engine (`scripts/state.js`,
`scripts/utils/*`, `scripts/services/*`), which the migration left unchanged. See
`docs/webflash-2-migration.md` (archived — see
[`archive-index.md`](archive-index.md)) and the decision
record [`adr/0001-webflash-2-view-over-engine.md`](adr/0001-webflash-2-view-over-engine.md).

## Installation Process

1. **Connect Device**: Plug device into computer via USB
2. **Select Configuration**: Choose mounting, power, and modules
3. **Review Firmware**: Verify selected firmware matches your hardware
4. **Verification**: Wait for the SHA-256 integrity check and the Ed25519
   signature verification to complete (see
   [`firmware-provenance.md`](firmware-provenance.md) for the full trust
   model)
5. **Acknowledge**: Check safety warning acknowledgment
6. **Flash**: Click "Install Firmware" button
7. **Device Selection**: Choose correct serial port in browser dialog
8. **Wait**: Installation takes 1-2 minutes
9. **Complete**: Device reboots automatically when finished

## After Flashing: Validation & Handoff

WebFlash distinguishes "firmware was flashed" from "the device is actually
ready to use" via a structured post-flash result panel that appears on the
review/install step. The panel reports one of eight states:
`not_started`, `in_progress`, `completed`, `completed_validation_passed`,
`completed_validation_unknown`, `completed_validation_failed`, `failed`,
`cancelled`.

### What WebFlash can validate

After a flash completes, WebFlash performs a best-effort, read-only
validation pass against the device:

- **Serial reconnect** — does the host see the device come back on
  `navigator.serial`?
- **Improv-reported firmware identity** — does the device's Improv frame
  report a firmware family that matches the selected build?
- **Version match** — does the Improv-reported version equal the selected
  build version?
- **Improv endpoint reachability** — for builds that advertise
  `improv: true`, did we receive an Improv frame at all?
- **Wi-Fi provisioning** — only marked passed/failed when the user
  actually engages the Improv Wi-Fi step and the host emits a
  provisioning result. WebFlash never reads, displays, logs, or stores
  the SSID or password.

### What WebFlash cannot validate

- **On-device firmware authenticity after flashing.** Signature and
  integrity verification run against the downloaded bytes at install time
  (see [`firmware-provenance.md`](firmware-provenance.md)); WebFlash cannot
  re-verify what is on the device afterwards.
- **Sensor health or on-device behaviour.** Whether the BMP581 actually
  reads pressure or whether ESPHome boots cleanly is the device's job;
  WebFlash only knows what the device reports back over USB.
- **User cancellation with certainty.** ESP Web Tools does not surface a
  clean "user cancelled" signal. If the installer returns to idle without
  reaching `finished` or `error` and without a `detail.error`, WebFlash
  reports `cancelled` heuristically.

### `passed`, `failed`, and `unknown`

- `passed` — every check observed evidence of success.
- `failed` — at least one check observed evidence of failure (e.g. a
  firmware-family mismatch or an Improv error).
- `unknown` — at least one check could not gather evidence either way.
  This is the **honest default** and is the expected outcome for many
  builds, including any build that doesn't expose Improv. It does not
  mean the flash failed.

### Home Assistant handoff

The Home Assistant next-steps block is shown only when the selected
build advertises `improv: true` (i.e. ESPHome-style firmware that exposes
discovery). Rescue and other non-ESPHome builds suppress it.

### Wi-Fi provisioning handoff

Shown when the build advertises Improv Serial. The status string is one
of `continue`, `already_done`, `unavailable`, or `failed`. Wi-Fi
credentials are never persisted in URLs, `localStorage`, the support
bundle, or the flash history.

### When to use Rescue / Recovery Mode

- The flash failed mid-write.
- The device no longer boots after flashing.
- The validation panel reports `failed` and the device reports a
  different firmware family than the selected build.
- Repeated installs are returning `unknown` and the device never
  appears in Home Assistant.

The post-flash panel offers a one-click "Open Rescue & Recovery" button
when the flash fails or is cancelled.

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

For additional help, see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)

## Support Diagnostics

When something goes wrong (preflight failure, install error, recovery flash, stale cache), WebFlash can produce a structured **support bundle** — a single redacted JSON document that captures everything support needs to reproduce your issue.

- **What it contains.** App and build version, browser environment (browser, version, platform, secure context, Web Serial support), manifest source (`manifest_version`, `generated_at`, `source_commit`, `freshness`), selected firmware (config, version, channel, provenance status, `sha256_present`/`signature_present` booleans), wizard state (current step, modules), preflight results, recovery context (mode, acknowledgements, last result), cache state (service worker, update availability), and the latest flash attempt. The bundle does **not** include firmware binaries, raw `sha256`/`signature` values, or Wi-Fi passwords.
- **How to capture.** "Copy support bundle" or "Download JSON" buttons appear on the Step 5 preflight panel, the rescue / recovery modal, the browser & USB setup help modal, and the error log modal. Clicking copy puts the bundle on your clipboard; download writes a `webflash-support-bundle-<timestamp>.json` file you can attach to a support email.
- **Privacy and redaction.** Before the bundle leaves the page, WebFlash strips Wi-Fi passwords, tokens, API keys, authorization headers, cookies, MAC addresses, filesystem paths, and URL query strings. Sensitive values become `[REDACTED_PASSWORD]`, `[REDACTED_TOKEN]`, `[REDACTED_MAC]`, `[REDACTED_PATH]`, etc. Free-form error messages are scrubbed for embedded paths, MACs, and bearer tokens. Review the JSON before sharing if your environment is sensitive.
- **Versioned schema.** The top-level `schema_version: 1` lets support tooling pin to a known shape. Field names are stable; new fields will be added under existing sections rather than reshaping the document.
- **Session-scoped.** The bundle reflects the *current* page session. Refreshing the page resets `last_usb_test_result`, recovery acknowledgements, `cache_clear_requested`, and similar transient signals. Persistent flash history is captured from `localStorage`, but always redacted before inclusion.

## Accessibility

WebFlash is intended to be usable with a keyboard and with screen readers, within the limits of the underlying Web Serial install flow. The conventions documented below are enforced by the code in `scripts/utils/a11y.js` plus the modal/wizard layout modules.

- **Keyboard navigation.** Every interactive element — header rescue/theme toggle, wizard stepper, option cards, firmware select, acknowledgement checkboxes, support and download buttons, post-flash actions, modal close buttons — is reachable with `Tab`, activates on `Enter` (and `Space` for buttons), and follows visual reading order. A "Skip to main content" link is the first focusable element on the page so keyboard users can bypass the header.
- **Modal focus behavior.** The rescue/recovery, preflight setup help, error log, changelog, and QR-code dialogs all use `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby`-linked title. Opening a modal moves focus inside, traps `Tab`/`Shift+Tab` within the dialog, closes on `Escape`, and restores focus to the element that opened it. Focus restoration is covered by `__tests__/rescue-modal.test.js` and `__tests__/a11y-modal-focus.test.js`.
- **Live region conventions.** Status changes (preflight, USB test results, support bundle copied, step navigation, rescue success/failure) announce through two app-wide live regions defined in `index.html`: `#webflash-a11y-live-region` (`aria-live="polite"`, used for non-blocking updates) and `#webflash-a11y-alert-region` (`aria-live="assertive"`, reserved for blocking errors). Use `announce(message)` or `announce(message, { assertive: true })` from `scripts/utils/a11y.js` rather than reinventing live regions inside individual modules. Inline `role="status"` containers on the preflight panel, freshness/preflight banners, and post-flash result panel still apply for surfaces where the message is also visible.
- **Stepper semantics.** The active wizard step carries `aria-current="step"`. Reachability is exposed via `aria-disabled="true"` on unreached steps and a composed `aria-label` (`"Step N: Name — current step | completed | not yet available | available"`) so screen-reader users can hear their position in the flow.
- **Reduced motion.** All transitions and animations respect `@media (prefers-reduced-motion: reduce)` (see `css/theme.css`). When the user opts out of motion, step transitions, banner pulses, and modal animations collapse to near-zero duration; no essential state depends on animation.
- **Color independence.** Status indicators (release-channel badges, provenance pass/fail rows, preflight statuses, post-flash validation states, freshness banners) always combine color with a text label or icon. Focus rings use a dedicated CSS variable (`--focus-ring`) so the keyboard outline remains visible across themes.
- **Mobile fallback.** Web Serial only works on desktop Chromium browsers. The mobile/unsupported message in `scripts/init-review.js` and the preflight banner stay readable and operable on small screens; the rescue and changelog modals scroll internally rather than truncating.

### Running accessibility-focused tests

Accessibility-related Jest suites live alongside the rest of the test code:

```bash
npm test -- a11y-utils                # focus trap, live region, getFocusableElements
npm test -- a11y-modal-focus          # focus restoration for changelog & error-log modals
npm test -- a11y-static-html          # static index.html structure checks
npm test -- rescue-modal              # rescue dialog semantics + focus return
npm test -- preflight-help-modal      # setup help dialog
```

Some tests in the broader suite have unrelated pre-existing failures (notably the wizard-state suite); the accessibility-specific tests above run independently.

## Custom Firmware & Source Code

For users who want to build custom firmware configurations or modify the ESPHome YAML source files:

- **ESPHome Public Repository**: [sense360store/esphome-public](https://github.com/sense360store/esphome-public) - Contains ESPHome YAML configurations for DIY users compiling via Home Assistant/ESPHome

WebFlash provides pre-compiled firmware binaries for plug-and-play browser-based flashing. The esphome-public repository contains the source YAML files for users who want to customize or build their own firmware.

## Project Structure

```
WebFlash/
├── index.html              # Web interface
├── manifest.json           # Firmware catalog (auto-generated)
├── firmware-*.json         # Individual firmware manifests (auto-generated)
├── firmware/               # Firmware binaries and configurations
│   ├── configurations/     # Production firmware files
│   └── rescue/             # Recovery firmware
├── scripts/                # Wizard modules, manifest generation and sync scripts
├── css/                    # Stylesheets
├── docs/                   # Documentation (this guide, architecture, trust model)
└── __tests__/              # Test suite
```
