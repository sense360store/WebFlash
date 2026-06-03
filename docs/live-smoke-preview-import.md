# Live WebFlash smoke checklist — preview import (WF-LIVE-SMOKE-PREVIEW-IMPORT-001)

This is the **live / manual smoke checklist** for the deployed WebFlash site
after the first preview firmware batch
(`WF-PREVIEW-IMPORT-FIRST-BATCH-001`) landed. It confirms that, on the live
GitHub Pages deployment, **Simple install stays clean and stable-only** while
**Advanced install can reach the new preview builds** behind the preview
acknowledgement with working release notes.

It complements — and does not replace:

- [`docs/preview-import-first-batch-proof.md`](preview-import-first-batch-proof.md)
  — the import-proof record (assets, SHA256, sizes, commands).
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.
- [`docs/release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md`](release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md)
  — the earlier live manifest-freshness smoke record this checklist extends.

> **Docs / verification only.** This document imports no firmware, regenerates
> no manifest, edits no `firmware/sources.json` entry, changes no
> `REQUIRED_CONFIGS` value, adds no kit, and changes no runtime UI surface. The
> deterministic half of these checks is locked by
> [`__tests__/live-smoke-preview-import.test.js`](../__tests__/live-smoke-preview-import.test.js);
> this doc covers the browser-observable behaviour a unit test cannot reach.

## Scope — what the live deployment should show today

`manifest.json` carries **exactly eight builds**:

| `config_string` | Channel | Install surface |
|---|---|---|
| `Ceiling-POE-VentIQ-RoomIQ` | `stable` | Simple install (default) + Advanced |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | `preview` | Advanced only (preview ack) |
| `Ceiling-POE-AirIQ-RoomIQ` | `preview` | Advanced only (preview ack) |
| `Ceiling-POE-RoomIQ` | `preview` | Advanced only (preview ack) |
| `Ceiling-POE-RoomIQ-LED` | `preview` | Advanced only (preview ack) |
| `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | `preview` | Advanced only (preview ack) — FanRelay manual-preview (WEBFLASH-RELAY-001) |
| `Ceiling-POE-FanPWM` | `preview` | Advanced only (preview ack) — FanPWM manual-preview (WEBFLASH-PWM-001) |
| `Ceiling-POE-FanDAC` | `preview` | Advanced only (preview ack) — FanDAC manual-preview (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001) |
| `Rescue` | `rescue` | Recovery path / rescue modal |

- **Simple install** must remain **stable Bathroom PoE only**
  (`Ceiling-POE-VentIQ-RoomIQ`).
- The seven **preview** builds must be **Advanced-install-only**, never
  recommended / default / stable, each gated on the `channel:preview`
  acknowledgement.
- Candidate room bundles stay hidden / not buyable.
- **No TRIAC** (`FanTRIAC`) firmware was imported. `FanRelay`
  (WEBFLASH-RELAY-001), `FanPWM` (WEBFLASH-PWM-001), and `FanDAC`
  (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001) are the deliberate manual-preview
  exceptions; all three are Advanced-install-only.
- The existing **VentIQ LED preview** (`Ceiling-POE-VentIQ-RoomIQ-LED`, from
  `v1.0.0-led-preview`) was deliberately **not** overwritten.

## Pre-conditions

- Live URL: `https://sense360store.github.io/WebFlash/`
- Desktop Chromium browser (Chrome / Edge / Opera) on Windows / macOS / Linux —
  Web Serial is desktop-Chromium only.
- A **fresh / incognito** session (no stale service-worker cache) for at least
  one pass, so the freshness probe and the deployed asset versions are exercised
  cleanly.

## Checklist — Simple install (default path)

- [ ] **Loads without a false manifest-freshness error.** The page opens to
      Simple install without a "Cannot install yet" freshness block. An
      `unknown` freshness verdict is **non-blocking** (it may show the calm
      secondary "Couldn’t recheck for updates" note); only a genuine `stale`
      verdict hard-blocks.
- [ ] **Shows only stable Bathroom PoE.** The Simple hero resolves to the
      Sense360 Bathroom PoE kit (`Ceiling-POE-VentIQ-RoomIQ`, stable) — no build
      matrix, no channel picker.
- [ ] **Does not surface AirIQ / Bedroom / Living / Corridor preview choices.**
      No preview build, candidate room bundle, or preview-channel control
      appears in the Simple path.
- [ ] **Stable install becomes ready after the safety confirmation.** Ticking
      the single "Before you flash" safety confirmation flips the status to
      **Ready to install** and enables the Install button (no preview / advanced
      acknowledgement is required for the stable build).
- [ ] **Technical details collapsed by default** behind the hero disclosure;
      "Setup checks" / "Technical details" reveal them on demand.

## Checklist — Advanced install (custom path)

- [ ] **Can select the preview channel.** Switching to Advanced setup and
      building a preview configuration surfaces the `channel:preview`
      acknowledgement on Step 5.
- [ ] **Can reach each first-batch preview build:**
  - [ ] `Ceiling-POE-AirIQ-RoomIQ` — AirIQ + RoomIQ over PoE.
  - [ ] `Ceiling-POE-RoomIQ` — RoomIQ over PoE.
  - [ ] `Ceiling-POE-RoomIQ-LED` — RoomIQ + LED over PoE.
- [ ] **Each preview build shows the preview warning / acknowledgement.** The
      experimental-build warning copy renders and the install button stays gated
      until the `channel:preview` checkbox is ticked.
- [ ] **Each preview build has working release notes.** "View Release Notes"
      opens the in-card changelog disclosure (every preview build ships an
      embedded `changelog`); the control is a real button/link.
- [ ] **Release notes are not dead links.** No "View Release Notes" affordance
      points at a literal `#` anchor or a 404.
- [ ] **Firmware metadata shows channel `preview`.** The firmware card / details
      report the `preview` channel for each preview build.
- [ ] **Preview builds are not recommended / default.** No preview build carries
      a "Recommended" badge or is auto-selected; the default pick is the stable
      build.
- [ ] **Candidate bundles are not buyable.** The planned fan-control / room
      bundle cards stay in their non-installable subsection.
- [ ] **TRIAC is absent** from the installable firmware set (TRIAC stays
      selectable only behind its advanced/manual warning gate, with no imported
      firmware). FanRelay / FanPWM / FanDAC are the deliberate Advanced-install
      manual-preview exceptions (acknowledgement-gated), not Simple-install
      options.
- [ ] **Existing VentIQ LED preview still works.**
      `Ceiling-POE-VentIQ-RoomIQ-LED` still resolves and installs behind the
      preview acknowledgement (unchanged from `v1.0.0-led-preview`).

## Checklist — Recovery

- [ ] **Rescue / recovery still available.** The Recovery path card opens the
      rescue modal and the rescue firmware install flow is reachable.

## Manual verification template

Copy this block per run and fill it in. Screenshots / console logs are optional
but recommended for any FAIL.

```
WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — live verification run
--------------------------------------------------------
Date / tester        :
Browser + version    :              (e.g. Chrome 137 on macOS 15)
URL                  : https://sense360store.github.io/WebFlash/
App version / build  :              (footer build timestamp, if shown)
manifest generated_at:              (from /WebFlash/manifest.json)
Session              : [ ] fresh/incognito   [ ] returning

Simple install
  Loads without false freshness error ....... [ ] PASS  [ ] FAIL
  Shows only stable Bathroom PoE ............ [ ] PASS  [ ] FAIL
  No AirIQ/Bedroom/Living/Corridor previews . [ ] PASS  [ ] FAIL
  Ready after safety confirmation ........... [ ] PASS  [ ] FAIL

Advanced install
  Can select preview channel ................ [ ] PASS  [ ] FAIL
  Reaches Ceiling-POE-AirIQ-RoomIQ .......... [ ] PASS  [ ] FAIL
  Reaches Ceiling-POE-RoomIQ ................ [ ] PASS  [ ] FAIL
  Reaches Ceiling-POE-RoomIQ-LED ............ [ ] PASS  [ ] FAIL
  Preview warning + acknowledgement shown ... [ ] PASS  [ ] FAIL
  Release notes open (not dead) ............. [ ] PASS  [ ] FAIL
  Channel metadata reads "preview" .......... [ ] PASS  [ ] FAIL
  Previews not recommended/default .......... [ ] PASS  [ ] FAIL
  Candidate bundles not buyable ............. [ ] PASS  [ ] FAIL
  TRIAC + fan-driver firmware absent ........ [ ] PASS  [ ] FAIL
  VentIQ LED preview still works ............ [ ] PASS  [ ] FAIL

Recovery
  Rescue / recovery available ............... [ ] PASS  [ ] FAIL

Observed Simple install state    :
Observed Advanced preview builds :
Screenshots / logs (optional)    :
Pass/fail notes                  :
```

## Result

| Field | Value |
|---|---|
| Status | **Pending — live operator pass required** |
| Last run | _none recorded_ |
| Verdict | _to be filled by the live run_ |

Record the completed template above (or a link to the captured run) when a live
pass is performed. A live divergence from the expected six-build / stable-only
Simple-install posture opens a targeted follow-up; a clean pass is the
non-blocking confirmation.

## Do-not-change confirmation

This checklist changes no install behaviour. Every firmware binary,
`manifest.json`, every `firmware-*.json`, `firmware/sources.json`, the
`REQUIRED_CONFIGS = ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` allowlist,
`scripts/data/kits.json`, `scripts/data/kit-presets.js`,
`scripts/utils/release-channels.js`, `scripts/utils/module-availability.js`,
every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, and every
runtime JS file are unchanged. No firmware imported, no Simple-install default
changed, no preview made recommended/default/stable, no candidate bundle exposed
as buyable, no TRIAC or fan-driver firmware imported, no provenance / signature /
freshness check weakened, no preview warning removed, and the existing VentIQ LED
preview was not overwritten.
