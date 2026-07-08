# DRAFT — Security advisory: shared default credentials in published Sense360 firmware

> **Status: DRAFT. Not published. Do not act on this document as if it were a
> live advisory.** This is an in tree draft authored under
> REPO-CUSTOMER-READY-001 decision D4. Publication is an owner action, taken
> as a GitHub Security Advisory (GHSA), and is gated on
> WF-H1-REIMPORT-CLEAN-001 landing (clean, per device provisioned rebuilds of
> every affected build imported and live on the installer). Until that gate
> is met there is no fixed firmware to direct customers to, so this document
> must not be linked from any user facing surface, announced, or filed as a
> GHSA. The editor notes that previously marked unresolved detail were
> resolved at WF-H1-REIMPORT-CLEAN-001 step W3 (fixed versions and the per
> device provisioning flow); this document nonetheless remains a DRAFT until
> the owner publishes it.

## Summary

Sense360 firmware builds published through the WebFlash installer before the
credential fix carry a fixed, shared set of default credentials that is the
same on every device flashed with the same build. Anyone who knows the
defaults, which are publicly recoverable, can access and control an affected
device over the local network, and in some cases from radio range during
setup. Owners of affected devices should reflash to a fixed version using
WebFlash at https://sense360store.github.io/WebFlash/ as soon as fixed
versions are available.

This finding was identified by the June 2026 defensive security audit of
this repository (finding W-H1, `docs/security/SECURITY-AUDIT-2026-06.md`)
and its upstream counterpart in `sense360store/esphome-public`. The values
themselves are deliberately not repeated in this advisory; they are referred
to by credential class.

## Affected versions

Each stable configuration is affected at the version shown in the "Affected"
column and earlier, and is fixed at the version shown in the "Fixed" column
and later. Reflash to the fixed version using WebFlash:

| Configuration | Affected (this version and earlier) | Fixed (this version and later) |
|---|---|---|
| Ceiling-POE-VentIQ-RoomIQ | v1.0.4 | v1.0.7 |
| Ceiling-POE-RoomIQ | v1.0.5 | v1.0.8 |
| Ceiling-POE-AirIQ-RoomIQ | v1.0.6 | v1.0.9 |

The preview channel builds published alongside the stable releases are
affected in the same way, carrying test lane and historical default values
instead of the stable release defaults:

- **Ceiling-POE-VentIQ-RoomIQ-LED** (VentIQ LED preview): affected at
  v1.0.0-led-preview and earlier; fixed at v1.0.1-led-preview and later. This
  is an Advanced-install-only, acknowledgement-gated preview.
- The five v1.0.0-preview fan configurations were affected in the same way
  and have been removed from the installer rather than rebuilt, so there is
  no fixed version to reflash to for these configurations:
  - **Ceiling-POE-VentIQ-FanPWM-RoomIQ** (v1.0.0-preview): removed.
  - **Ceiling-POE-VentIQ-FanDAC-RoomIQ** (v1.0.0-preview): removed.
  - **Ceiling-POE-AirIQ-FanRelay-RoomIQ** (v1.0.0-preview): removed.
  - **Ceiling-POE-AirIQ-FanPWM-RoomIQ** (v1.0.0-preview): removed.
  - **Ceiling-POE-AirIQ-FanDAC-RoomIQ** (v1.0.0-preview): removed.

  These five were Advanced-install-only, acknowledgement-gated previews,
  never stable, recommended, default, or buyable, so removing them from the
  installer has no effect on the customer baseline. A device still running
  one of these fan previews should be reflashed to a fixed stable
  configuration that matches its installed modules.

The in tree Rescue build is not affected; it scans clean against the
credential denylist.

## What is the risk, in plain language

Every device flashed with an affected build shares the same built in
credentials for the surfaces that control the device:

- **Local API encryption key.** The key protecting the device's local
  control API is a publicly known placeholder, so any computer on the same
  network can connect to the device's control API as if it were the owner's
  home automation system. That includes reading sensors and operating
  anything the device switches, such as fans and other connected loads.
- **Over the air update password.** The password that authorises firmware
  replacement over the network is the same on every affected device, so a
  network reachable device can be permanently reflashed with attacker
  supplied firmware.
- **Web interface password.** The device's built in web page accepts a
  shared default username and password, giving control of the device to
  anyone on the network who knows them.
- **Fallback hotspot password.** When a device cannot reach Wi-Fi it opens
  its own recovery hotspot; the hotspot password is a shared default, so
  someone within radio range at that moment can join it and reconfigure the
  device.

Because the same values ship in every affected build, knowing them once is
enough to affect any reachable affected device. Reflashing through WebFlash
writes the downloaded build as is, so an affected device cannot be re keyed
by its owner without a fixed build to flash.

The intentionally public first boot setup network name and password are not
part of this advisory. They exist only so a brand new device can be brought
online, are documented as public, and grant no control over the device's
API, update, or web surfaces.

## What to do: reflash with WebFlash

The steps below have been confirmed against the fixed builds and the
installer's actual flow. Per device credential handling is defined upstream
by SEC-ESP-PROVISIONING-001: the fixed builds no longer embed the shared
default credentials, and each fixed device establishes its own unique local
API encryption key, over the air update password, web interface password, and
fallback hotspot password in place of the shared release defaults, so
reflashing to a fixed version re-keys the device away from the publicly known
values. The WebFlash installer flow the steps describe (SHA-256 and Ed25519
verification before write, then Improv Wi-Fi setup) is unchanged by this fix.
The four fixed builds now served on the installer (v1.0.7, v1.0.8, and v1.0.9
stable, plus v1.0.1-led-preview) each scan clean against the credential
denylist.

1. On a desktop or laptop running a Chromium based browser (Chrome, Edge,
   or Opera), open https://sense360store.github.io/WebFlash/. Mobile
   browsers cannot flash because they lack Web Serial.
2. Connect the Sense360 hub to the computer with a USB data cable.
3. Walk through the wizard and select the configuration matching the
   installed modules. Confirm the offered stable version is a fixed version
   per the table above before installing.
4. Follow the install steps. The installer verifies the firmware's SHA-256
   checksum and Ed25519 signature before writing, and Improv Wi-Fi setup
   runs after flashing to put the device back on the network.
5. If the device is unreachable or the standard flow fails, use the
   installer's recovery path and see `TROUBLESHOOTING.md` in this
   repository.

## After reflashing: verify the fix

1. In the installer, confirm the reported installed version matches the
   fixed version for the configuration, per the table above.
2. Open the device's web interface and confirm it no longer accepts the old
   shared default credentials.
3. When re adopting the device in a home automation system, confirm the
   local API requires the device's own encryption key rather than accepting
   the previous placeholder.
4. If any of these checks fail, the device is still on an affected build.
   Repeat the reflash, and if it persists file a flash failure issue on
   this repository.

## Publication gate

- Publication is an owner action, not part of any automated pipeline.
- The owner publishes this advisory as a GitHub Security Advisory (GHSA)
  only after WF-H1-REIMPORT-CLEAN-001 lands: clean rebuilds without shared
  defaults exist upstream, have passed the importer's credential gate
  (`scripts/check-firmware-default-credentials.py`), and are live on the
  installer for every affected configuration.
- Until then this file stays a DRAFT, unlinked from any user facing
  surface. The import gate already blocks re importing any credential dirty
  binary, and the upstream release gate (esphome-public #779) blocks
  producing new ones.
- The publication editor notes (the fixed version for each configuration and
  the per device provisioning flow) were resolved at
  WF-H1-REIMPORT-CLEAN-001 step W3 and are filled in above. At publication
  the owner still removes internal tracking identifiers from the customer
  visible GHSA text and routes support questions per `SUPPORT.md`.
