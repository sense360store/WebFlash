# WebFlash — Sense360 Firmware Installer

WebFlash is the browser based firmware installer for Sense360 ESP32 hubs. It
flashes signed Sense360 firmware over USB using ESP Web Tools and Web Serial,
with no drivers and no local toolchain.

**Flash your device here: <https://sense360store.github.io/WebFlash/>**

That address is the canonical WebFlash URL. Always flash from it, never from
mirrors or third party copies.

## What you need

- A desktop Chromium based browser: Chrome, Edge, or Opera on Windows, macOS,
  or Linux. Firefox, Safari, and all mobile browsers cannot flash because they
  do not implement Web Serial.
- A USB data cable (charge only cables will not work).
- A Sense360 hub. Every flashable device is a Sense360 Core.

## Flash in three steps

1. Open <https://sense360store.github.io/WebFlash/> and pick your hardware:
   choose your kit by SKU, or select your power option and modules manually.
2. Review the recommended firmware, wait for the integrity and signature
   checks to pass, and acknowledge the pre flash checklist.
3. Click **Install Firmware**, choose the serial port when the browser asks,
   and keep the device powered and connected until it reboots.

After flashing, the installer walks you through Wi-Fi setup over Improv
Serial. The full walkthrough, every configuration option, and the post flash
validation steps are in the [user guide](docs/user-guide.md).

## Where to get help

- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — start here for connection,
  browser, and flashing problems.
- [SUPPORT.md](SUPPORT.md) — where to file defects, where to ask questions,
  and how order or warranty matters are routed.
- Release channels — what stable, preview, and experimental mean for a
  customer and what support each receives is documented in
  [docs/release-channels.md on sense360store/esphome-public](https://github.com/sense360store/esphome-public/blob/main/docs/release-channels.md).
  WebFlash's install time channel policy is
  [docs/release-channel-policy.md](docs/release-channel-policy.md).

## Documentation

- [docs/README.md](docs/README.md) — documentation index.
- [docs/user-guide.md](docs/user-guide.md) — full flashing guide.
- [docs/architecture.md](docs/architecture.md) — how WebFlash is built.
- [DEVELOPER.md](DEVELOPER.md) — maintainer guide for publishing firmware.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to file issues and open pull
  requests.

Firmware source:
[sense360store/esphome-public](https://github.com/sense360store/esphome-public)
holds the ESPHome YAML configurations the firmware is built from.

## License

This project is licensed under the [MIT License](LICENSE), Copyright (c) 2026
Sense360.

### Notice

The firmware binaries under `firmware/` are build artifacts of
[sense360store/esphome-public](https://github.com/sense360store/esphome-public)
and are distributed under that repository's MIT terms. Their integrity is
assured by ed25519 signing. They are not relicensed by this repository's
licence. See [NOTICE](NOTICE).
