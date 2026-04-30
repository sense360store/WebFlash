# Troubleshooting Guide

Common issues and solutions for WebFlash firmware installation.

## Table of Contents

- [Preflight checks (Step 5) first](#preflight-checks-step-5-first)
- [Browser Issues](#browser-issues)
- [Connection Issues](#connection-issues)
- [Installation Issues](#installation-issues)
- [Configuration Issues](#configuration-issues)
- [Wi-Fi Setup Issues](#wi-fi-setup-issues)
- [Device Issues](#device-issues)
- [Advanced Debugging](#advanced-debugging)

## Preflight checks (Step 5) first

In **Step 5: Review & Install**, resolve preflight results before retrying installation.

### Browser support
- **Pass:** Web Serial API available.
- **Fail:** Browser does not support Web Serial.
- **Remediation:** Use Chrome/Edge/Opera, update browser, then reload WebFlash.

### Device connection visibility
- **Pass:** Device connected and readable.
- **Warning:** Device info not read yet, or partial-read/device-read warning.
- **Remediation:** Reconnect USB cable, avoid hubs, close other serial tools, then reconnect and retry detection.

### Connection quality
- **Pass:** Stable session window with no disconnect/failure counters.
- **Warning:** Minor instability observed (disconnect/retry/read-write failure counters or short stability window).
- **Fail:** Unstable link above fail thresholds.
- **Remediation:** Use a short known-good data cable, direct USB port, stable power, then wait for a stable 30+ second window before install.

### Firmware verification
- **Pass:** Firmware hash/signature checks complete.
- **Warning:** Verification pending or firmware not selected yet.
- **Fail:** Verification failed.
- **Remediation:** Wait for verification to finish, reselect firmware, refresh and retry if verification fails.

### User acknowledgement
- **Pass:** **Before you flash** acknowledgement checkbox is checked.
- **Warning:** Checklist not acknowledged.
- **Remediation:** Check `I understand and will keep the hub powered and connected throughout flashing.`

### Acknowledgement gating rules

Install/download controls are enabled only when:
1. Firmware is selected and verified.
2. **Before you flash** checklist is acknowledged.
3. No preflight `Fail` statuses remain.
4. Any preflight `Warning` statuses are acknowledged.

Current limitation: helper text references **Accept preflight warnings** acknowledgement, but that dedicated checkbox is not currently rendered in `index.html`.

## Browser Issues

### Unsupported Browser

**Symptoms:**
- "Web Serial not supported" message
- Install button disabled or missing
- Serial port selection not available

**Solutions:**
1. Use Chrome, Edge, or Opera browser (version 89+)
2. Update browser to latest version
3. Enable experimental features:
   - Navigate to `chrome://flags`
   - Search for "Web Serial API"
   - Enable the feature
   - Restart browser

**Note:** Firefox and Safari do not fully support Web Serial API.

## Connection Issues

### Device Not Detected

**Symptoms:**
- Empty port list when clicking "Connect"
- Device not showing up in serial port selection

**Solutions:**
1. Use a data-capable USB cable
2. Try a different USB port
3. Close Arduino IDE/PlatformIO/serial monitors
4. Install CP210x/CH340 drivers on Windows if needed
5. On Linux, add your user to `dialout`

## Installation Issues

### Installation Fails Immediately

**Solutions:**
1. Enter bootloader mode manually (BOOT + RESET sequence)
2. Power-cycle device and reconnect
3. Re-run from Step 5 after preflight statuses are resolved

### Installation Fails Partway

**Solutions:**
1. Refresh page and retry
2. Replace USB cable / change USB port
3. Avoid hubs and unstable power sources

### Verification Fails

**Solutions:**
1. Re-select firmware and retry
2. Switch to Stable channel
3. Use rescue firmware path if available

## Configuration Issues

### Wrong Firmware Selected

**Solutions:**
1. Verify physical hardware (mount, power, modules)
2. Re-flash with matching configuration

### Unsure of Configuration

**Solutions:**
1. Check device labels/documentation
2. Contact support with photos + serial number

## Wi-Fi Setup Issues

If Improv prompt does not appear after flash:
1. Keep the browser tab open after flashing
2. Reconnect serial session
3. Reboot device and retry

## Device Issues

If device boots but modules are missing:
1. Confirm module choices in wizard
2. Check physical module wiring/fit
3. Re-flash with corrected selections

## Advanced Debugging

Use Step 5 support utilities:
- **Copy Support Info**
- **Copy Sharable Link**
- **Copy Firmware URL**

MVP gap: there is currently no single diagnostics bundle copy action that combines all diagnostics into one share payload.
