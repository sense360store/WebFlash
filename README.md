# WebFlash — Sense360 ESP32 Firmware Installer

A simple, browser‑based way to flash Sense360 ESP32 firmware using **ESP Web Tools**. No drivers or local toolchains required for most users.

**Live site:** https://sense360store.github.io/WebFlash/

---

## What is WebFlash?

WebFlash lets you select a device type and firmware channel (e.g. *stable* or *beta*) and then flash it directly from your browser over USB. After flashing, the device can be provisioned onto Wi‑Fi via Improv Serial.

---

## Key features

- **One‑click flashing** via ESP Web Tools (Web Serial / WebUSB)
- **Wi‑Fi setup** right after flashing (Improv Serial)
- **Filter & search** by device type, chip family, version, and channel
- **Mobile‑friendly** UI (works best on desktop for flashing)
- **Hosted on GitHub Pages** for easy, reliable access

> **Browser support:** Use a Chromium‑based browser (Chrome, Edge) on Windows, macOS, or Linux. (Firefox and Safari currently have limited Web Serial support.)

---

## Quick start (for users)

1. Go to **WebFlash**: https://sense360store.github.io/WebFlash/
2. Select your **Device Type**, **Chip Family**, and **Channel**.
3. Choose the desired **firmware version**.
4. Click **Connect** when prompted, select your device, and start flashing.
5. When flashing completes, follow the on‑screen steps to **enter Wi‑Fi details** (Improv).

> **Tip:** If your device does not appear, try a different USB cable/port, or close other serial tools (Arduino, esptool, etc.) that may have the port open.

---

## Ideas to improve the flashing experience

The current workflow gets the job done, but we can make it even more welcoming for first-time installers. A few ideas that balance functionality with visual polish:

- **Guided deployment checklist** – add a collapsible sidebar or modal that walks through prerequisites (USB cable, browser support, power). Each item could animate to a “checked” state as the user completes it.
- **Contextual highlight cues** – when the page prompts the user to click a button (e.g., *Connect* or *Install*), briefly pulse or glow the button so it stands out on the screen.
- **Progress timeline** – replace the plain text status messages with a horizontal timeline that fills step by step (detect device → erase → flash → verify → finish). Pair it with iconography to make successes/failures obvious.
- **Firmware cards with quick info** – show each firmware entry as a card with color-coded channel tags (stable = green, beta = amber) and hover animations that reveal checksum, release date, or changelog link.
- **Success animation & next steps** – celebrate a successful flash with a short checkmark animation and a clearly highlighted box that lists the next actions (e.g., “Press reset,” “Open provisioning app”).
- **Inline troubleshooting callouts** – surface the most common issues right beneath the flashing controls using accordion callouts so help is one click away.
- **Theming for dark/light modes** – allow the user to toggle between themes so the long flashing sessions are easier on the eyes.

Implementing even a few of these ideas should reduce friction, build confidence, and make the tool feel more polished.

---

## Supported devices

The WebFlash page lists all currently available Sense360 firmware. Typical categories include:

- **CO₂ Monitor** (ESP32‑S3) — stable/beta  
- **Env Monitor** (ESP32) — stable/beta  
- **Temp Sensor** (ESP32‑S3) — stable  

Availability depends on what firmware we publish. Always prefer **stable** for production devices.

---

## Safety & privacy

- Only flash firmware you trust.  
- WebFlash runs fully in your browser; it does **not** upload device secrets.  
- Your Wi‑Fi credentials are sent directly to the device using the Improv workflow.

---

## Troubleshooting

- **“Failed to fetch” during flashing**  
  Refresh the page and try again. If the issue persists, use Chrome/Edge and ensure you’re on the official site:  
  https://sense360store.github.io/WebFlash/

- **No device ports listed**  
  Use a data‑capable USB cable, try a different port, and close other serial tools. On Linux, you may need to add your user to the `dialout` group and re‑login.

- **CORS or manifest errors**  
  Clear cache (hard reload) and try again. If it continues, open an issue with details (device, OS, browser, steps).

---

## For maintainers (project team)

> These notes are for engineers publishing new firmware to the site.

<details>
<summary><strong>Adding or removing firmware (automated)</strong></summary>

**Add new firmware:**
```bash
# Place firmware in the directory that matches your device/chip/channel
cp build/MyFirmware.bin firmware/DeviceType/ChipFamily/Channel/Sense360-DeviceType-ChipFamily-vX.Y.Z-Channel.bin

# Rebuild manifests and UI metadata
python3 deploy-automation.py

# Commit and deploy
git add .
git commit -m "Add Sense360-DeviceType-...-vX.Y.Z-Channel.bin"
git push
