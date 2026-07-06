# DRAFT — Security advisory: shared default credentials in published Sense360 firmware

> **Status: DRAFT. Not published. Do not act on this document as if it were a
> live advisory.** This is an in tree draft authored under
> REPO-CUSTOMER-READY-001 decision D4. Publication is an owner action, taken
> as a GitHub Security Advisory (GHSA), and is gated on
> WF-H1-REIMPORT-CLEAN-001 landing (clean, per device provisioned rebuilds of
> every affected build imported and live on the installer). Until that gate
> is met there is no fixed firmware to direct customers to, so this document
> must not be linked from any user facing surface, announced, or filed as a
> GHSA. Editor notes marked `[TO RESOLVE BEFORE PUBLICATION]` must be
> resolved before the owner publishes.

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

All stable firmware builds published on the WebFlash installer up to and
including the versions below are affected:

| Configuration | Affected stable versions |
|---|---|
| Ceiling-POE-VentIQ-RoomIQ | v1.0.4 and earlier |
| Ceiling-POE-RoomIQ | v1.0.5 and earlier |
| Ceiling-POE-AirIQ-RoomIQ | v1.0.6 and earlier |

The preview channel builds published alongside them (the v1.0.0 preview
builds of the AirIQ and VentIQ fan configurations and the VentIQ LED
configuration) are affected in the same way, carrying test lane and
historical default values instead of the stable release defaults. The
in tree Rescue build is not affected; it scans clean against the credential
denylist.

`[TO RESOLVE BEFORE PUBLICATION]` Insert the first fixed version for each
configuration once WF-H1-REIMPORT-CLEAN-001 has landed, and restate the
table as "affected: versions before X.Y.Z, fixed: X.Y.Z and later" for each
row.

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

`[TO RESOLVE BEFORE PUBLICATION]` Confirm each step below against the fixed
builds' actual provisioning flow (per device credential handling is defined
upstream by SEC-ESP-PROVISIONING-001) before publishing.

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
- At publication, resolve the `[TO RESOLVE BEFORE PUBLICATION]` notes,
  remove internal tracking identifiers from the customer visible GHSA text,
  and route support questions per `SUPPORT.md`.
