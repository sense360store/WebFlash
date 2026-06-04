# Live WebFlash smoke checklist — Simple-install fan-control bundle expansion (WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001)

This is the **live / manual smoke checklist** for the deployed WebFlash site
after the Simple-install bundle picker gained **import-gated full-composition
fan-control room bundles** (Bathroom / Kitchen + a fan driver). It complements
[`docs/live-smoke-easy-bundle-picker.md`](live-smoke-easy-bundle-picker.md)
(the base picker checklist) and does not replace it.

> **Staging + verification only.** This change imports **no firmware**,
> regenerates **no manifest**, edits **no `firmware/sources.json`** entry,
> changes **no `REQUIRED_CONFIGS`** value, and adds **no kit** to
> `scripts/data/kits.json`. It declares the fan-control room bundles and adds an
> **import-readiness gate** so a fan-control card only ever appears once its
> exact firmware `config_string` is present in the live manifest. The
> deterministic half of these checks is locked by
> [`__tests__/wf-easy-bundle-picker-fan-expansion.test.js`](../__tests__/wf-easy-bundle-picker-fan-expansion.test.js).

## Current status (as of this PR)

**None of the five fan-control bundle cards is visible today.** Upstream
`sense360store/esphome-public` PR #713 (`ROOM-BUNDLE-FAN-CONFIGS-001`) added the
five full-composition fan-control room-bundle *configs* but published **no
firmware**: each is `buildable-preview-compile-pending` (`compile_validation_status:
pending-ci`), with no `.bin`, no release/tag, and no WebFlash import. Because the
matching builds are therefore absent from `manifest.json`, the import-readiness
gate (`getExposableFanControlBundles`) returns an empty list and Simple install
shows exactly the original six bundle cards.

The five bundles are **declared, gated, and tested** so that a future
firmware-import PR (which fetches the signed `.bin`, writes the `.meta.json`
sidecar, pins the SHA-256 in `firmware/sources.json`, and regenerates
`manifest.json`) lights up the matching card automatically with no further wizard
code change.

## The five staged fan-control bundles

| Bundle SKU | Card name | Firmware `config_string` | Acknowledgements required |
|---|---|---|---|
| `S360-KIT-BATH-P-PWM` | Bathroom Bundle — PoE + PWM Fan Control | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | preview + fan-control |
| `S360-KIT-BATH-P-DAC` | Bathroom Bundle — PoE + 0–10V Fan Control | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | preview + fan-control + address-switch |
| `S360-KIT-KITCHEN-P-REL` | Kitchen Bundle — PoE + Relay Extract Control | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | preview + fan-control |
| `S360-KIT-KITCHEN-P-PWM` | Kitchen Bundle — PoE + PWM Extract Control | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | preview + fan-control |
| `S360-KIT-KITCHEN-P-DAC` | Kitchen Bundle — PoE + 0–10V Extract Control | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | preview + fan-control + address-switch |

Each is **preview-only**, never recommended / default / buyable, and a **full
room bundle** (room sensors + fan driver) — never a fan-only / manual config.
TRIAC (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`) is deliberately excluded and stays
build-blocked.

## Import readiness for the five future artifacts (WF-FAN-BUNDLE-IMPORT-READINESS-001)

Upstream `sense360store/esphome-public` then recorded compile proof for the five
full-composition fan bundles (upstream #716) and planned their publication
(upstream #717), but **published no artifact**. WF-FAN-BUNDLE-IMPORT-READINESS-001
prepares WebFlash so the eventual firmware-import PR is small and mechanical —
**docs + tests + a non-runtime readiness descriptor only**
([`scripts/data/fan-bundle-import-readiness.js`](../scripts/data/fan-bundle-import-readiness.js),
pinned by [`__tests__/wf-fan-bundle-import-readiness.test.js`](../__tests__/wf-fan-bundle-import-readiness.test.js)).
It declares, per future artifact, the **expected canonical filename** below (each
naming-policy conformant, channel `preview`, `block_tokens: ["FanTRIAC", "LED"]`),
plus a ready-to-fill `firmware/sources.json` source-entry skeleton with everything
**except** the human-pinned `expected_sha256`:

| Firmware `config_string` | Expected artifact filename |
|---|---|
| `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` |
| `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` |
| `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanRelay-RoomIQ-v1.0.0-preview.bin` |
| `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` |
| `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` |

This is **expected** shape — the import PR confirms the version / channel /
filename / SHA-256 against the real published artifact. The readiness prep imports
no firmware, edits no `manifest.json` / `firmware/sources.json`, changes no
`REQUIRED_CONFIGS`, adds no kit, and exposes no card; all five remain hidden.

### Analog (0–10V) address-switch acknowledgement

The two analog (DAC) bundles require a third, strongest acknowledgement before
install: the installer must confirm the GP8403 driver is switched so **IC1 uses
`0x58` and IC2 uses `0x5A`**, and that **`0x59` must not be used** (the room
air-quality sensor already uses `0x59` on the shared bus). This address setting
has **not been physically verified** (the upstream bench gate `FANDAC-I2C-ADDR-001`
is PENDING and is referenced only here / in developer-only data fields, never in
customer copy).

## Manual smoke checklist

Run after a deploy, in a desktop Chromium browser, in an incognito window.

- [ ] Open the deployed WebFlash. Simple install leads with **“Choose your
      Sense360 kit”**.
- [ ] **Bathroom Bundle — PoE** is selected by default and marked **Recommended /
      Stable**.
- [ ] The base room bundles (Kitchen / Bedroom / Living / Corridor / Bathroom
      Relay) still appear with **Preview** labels.
- [ ] **Today: no fan-control bundle cards (Bathroom PWM/DAC, Kitchen REL/PWM/DAC)
      appear** — the firmware has not been imported. Confirm the picker shows
      exactly the six base cards.
- [ ] Confirm standalone `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` are **absent**
      from Simple install (they remain Advanced-install-only).
- [ ] Confirm **TRIAC is absent** from Simple install.
- [ ] Advanced install still exposes the full wizard with its advanced / manual
      module surfaces.
- [ ] Recovery / Rescue still opens from the Simple path.
- [ ] Release notes / changelog affordances on the stable build are not dead
      links.
- [ ] The install button stays blocked until every required acknowledgement is
      checked.

### After a future fan-control firmware import (re-run then)

- [ ] The imported fan-control bundle’s card appears in the picker with
      **Preview** + **Fan control** labels.
- [ ] Selecting **Bathroom PWM** reveals the preview note + the fan-control
      acknowledgement; install stays blocked until **both** the safety
      confirmation and the fan-control acknowledgement are checked.
- [ ] Selecting **Bathroom DAC** additionally reveals the **address-switch**
      acknowledgement; install stays blocked until **all three** (preview /
      fan-control / address-switch) are satisfied. The copy names `0x58`, `0x5A`,
      and forbidden `0x59`.
- [ ] Selecting **Kitchen Relay / PWM / DAC** shows the correct gates (DAC adds
      the address-switch acknowledgement).
- [ ] Each fan-control card resolves to its exact full-composition
      `config_string` (verify in the collapsed Technical details).
- [ ] No fan-control bundle is ever Recommended / default / buyable.

## Do-not-change list (this PR)

Every firmware binary, `manifest.json` (still 9 builds), every `firmware-*.json`,
`firmware/sources.json`, the `REQUIRED_CONFIGS = ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
allowlist, `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js`,
`scripts/data/module-requirements.js` field values, `scripts/utils/release-channels.js`,
`scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, the
install gate / preflight / provenance / signature / freshness engines, and every
`.github/workflows/*` file are unchanged. The default **Simple install** selection
is the byte-identical stable Bathroom PoE build. No firmware imported. No preview
fan bundle made stable / default / recommended / buyable. No hardware / bench /
compliance / safety / commercial-availability proof claimed, and the FanDAC
address switch is **not** claimed to be physically verified.
