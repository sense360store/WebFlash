# Support

This page explains where to get help with Sense360 WebFlash and Sense360 devices.

## Before you file anything

- Read [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common flashing problems (browser support, serial permissions, driver issues, recovery steps).
- WebFlash requires a desktop Chromium based browser (Chrome, Edge, or Opera) on Windows, macOS, or Linux. Mobile browsers, Firefox, and Safari cannot flash devices because they do not implement Web Serial.

## Defects (something is broken)

Use GitHub Issues:

- Problems with the WebFlash installer itself (the website, the wizard, flashing failures): [open an issue on this repository](https://github.com/sense360store/WebFlash/issues/new/choose). Use the "Flash failure" template and include your browser, browser version, and operating system.
- Problems with firmware behaviour after a successful flash (sensors, automations, ESPHome configuration): [open an issue on sense360store/esphome-public](https://github.com/sense360store/esphome-public/issues/new/choose).

If you are not sure which repository is right, file on this repository and we will route it.

## Questions and community help

Community questions and answers live in [GitHub Discussions on sense360store/esphome-public](https://github.com/sense360store/esphome-public/discussions). Use Discussions for "how do I", setup advice, and configuration questions rather than opening an issue.

## Orders, returns, and warranty

Order, shipping, return, and warranty matters are handled through the [mysense360.com contact page](https://mysense360.com/pages/contact), not through GitHub.

## What to include in a report

- The device configuration you selected in the wizard (or the sharable config URL).
- The firmware version and release channel shown in the installer.
- The output of the "Copy diagnostics" button where available. Diagnostics are redacted of sensitive values before copying.
