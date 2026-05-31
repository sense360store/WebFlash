# PRE-HW-PREP-FIRST-RELEASE-GATES-001 — First-Release & Expansion Gates (Canonical)

**Status:** Pre-hardware preparation. This document is the single canonical
first-release gate checklist. It defines **what can ship now**, **what is
blocked**, and **the exact evidence required** to clear each blocked path.

> **Guardrails enforced by this document**
> - Bundles are **not** promoted by this document.
> - WebFlash is **not** enabled by this document.
> - No artifacts are published by this document.
> - **S360-410 is not marked verified.**
> - **LED is not marked stable.**
> - **Fan-control variants are not marked release-ready.**
>
> This is a planning / gating artifact only. Promotion, WebFlash enablement,
> and artifact publication each require their own follow-up PRs listed in the
> **Next PR** table below, and each requires the evidence listed in the
> **Evidence Needed** table to be attached first.

---

## 1. Status Table — what can ship now vs. what is blocked

Legend:
- ✅ **Ship-ready (now)** — meets first-release gate; no open blocker.
- 🟡 **Conditional** — can proceed only after a specific, named gate clears.
- ⛔ **Blocked** — hard blocker open; must not ship / must not be promoted.

| ID | Item | Scope | First-release status | Gating summary |
|----|------|-------|----------------------|----------------|
| BATH-1 | Bathroom stable release | Stable channel | ✅ Ship-ready (now) | Stable line is the only first-release candidate; ships independently of expansion bundles. |
| KIT-1 | Kitchen bundle | Expansion bundle | ⛔ Blocked | Not promoted. Depends on AirIQ + RoomIQ evidence and S360-410 PoE blocker. |
| BED-1 | Bedroom bundle | Expansion bundle | ⛔ Blocked | Not promoted. Depends on RoomIQ evidence. |
| LIV-1 | Living LED bundle | Expansion / LED | ⛔ Blocked | Not promoted. LED not stable; depends on LED blocker. |
| COR-1 | Corridor LED bundle | Expansion / LED | ⛔ Blocked | Not promoted. LED not stable; depends on LED blocker. |
| FAN-REL | Fan-control variant — FanRelay | Fan-control | ⛔ Blocked | Not release-ready. Depends on FanRelay blocker. |
| FAN-PWM | Fan-control variant — FanPWM | Fan-control | ⛔ Blocked | Not release-ready. Depends on FanPWM blocker. |
| FAN-DAC | Fan-control variant — FanDAC | Fan-control | ⛔ Blocked | Not release-ready. Depends on FanDAC blocker. |
| HW-410 | S360-410 (shared PoE platform) | Hardware | ⛔ Blocked | Not verified. Shared PoE blocker is upstream of every PoE-powered bundle/variant. |

**Summary:** Only **Bathroom stable** is ship-ready at first release. All
expansion bundles (Kitchen, Bedroom, Living/Corridor LED), all fan-control
variants, and the S360-410 platform remain blocked and are **not** promoted.

---

## 2. Blocker Table — open hard blockers

| Blocker | Type | Blocks (downstream) | Why it blocks | Cleared when |
|---------|------|---------------------|---------------|--------------|
| **S360-410 shared PoE blocker** | Hardware / platform | KIT-1, BED-1, LIV-1, COR-1, FAN-REL, FAN-PWM, FAN-DAC (any PoE-powered path) | Shared PoE power/board path on S360-410 is unverified on real hardware; everything powered by it inherits the risk. | S360-410 PoE bring-up evidence accepted (see Evidence table). **Does not** mark S360-410 verified until that PR lands. |
| **AirIQ blocker** | Sensor / firmware | KIT-1 | AirIQ sensor pipeline lacks accepted on-hardware validation. | AirIQ validation evidence accepted. |
| **RoomIQ blocker** | Sensor / firmware | KIT-1, BED-1 | RoomIQ presence/room sensing lacks accepted on-hardware validation. | RoomIQ validation evidence accepted. |
| **LED blocker** | Subsystem | LIV-1, COR-1 | LED driver/animation subsystem not stable; timing/brightness/safety unverified. | LED stability evidence accepted. **LED is not marked stable** by this document. |
| **FanRelay blocker** | Fan-control variant | FAN-REL | Relay-driven fan control unverified on hardware. | FanRelay variant evidence accepted. |
| **FanPWM blocker** | Fan-control variant | FAN-PWM | PWM fan control unverified on hardware. | FanPWM variant evidence accepted. |
| **FanDAC blocker** | Fan-control variant | FAN-DAC | DAC fan control unverified on hardware. | FanDAC variant evidence accepted. |

**Dependency note:** The **S360-410 shared PoE blocker is upstream** of every
PoE-powered bundle and fan variant. Even if a sensor/subsystem blocker clears,
the dependent item stays blocked until the S360-410 PoE blocker also clears.

---

## 3. Evidence-Needed Table — exact evidence to clear each blocked path

| Path | Blocker(s) to clear | Exact evidence required | Acceptance criteria |
|------|---------------------|-------------------------|---------------------|
| **S360-410 platform** | S360-410 shared PoE blocker | PoE bring-up report on physical S360-410: 802.3 negotiation log, measured input voltage/current under load, thermal reading at steady state, sustained-power soak duration. | All measurements within board spec; soak passes with no fault/reset; signed off on real hardware. |
| **Kitchen bundle** | S360-410 PoE + AirIQ + RoomIQ | AirIQ calibration + accuracy run vs. reference; RoomIQ presence/room accuracy run; bundle integration log on S360-410 hardware. | AirIQ + RoomIQ within accuracy thresholds on hardware **and** S360-410 PoE evidence accepted. |
| **Bedroom bundle** | S360-410 PoE + RoomIQ | RoomIQ presence/room accuracy run; bundle integration log on S360-410 hardware. | RoomIQ within accuracy thresholds on hardware **and** S360-410 PoE evidence accepted. |
| **Living LED bundle** | S360-410 PoE + LED | LED stability run: sustained drive test, brightness/color accuracy, thermal under full load, flicker/timing capture. | LED subsystem stable on hardware (no faults over soak) **and** S360-410 PoE evidence accepted. |
| **Corridor LED bundle** | S360-410 PoE + LED | Same LED stability run as Living, in corridor wiring/topology. | LED subsystem stable on hardware **and** S360-410 PoE evidence accepted. |
| **FanRelay variant** | S360-410 PoE + FanRelay | Relay switching test: on/off cycling endurance, inrush capture, no chatter; integration log on hardware. | Relay control verified over endurance cycles on hardware **and** S360-410 PoE evidence accepted. |
| **FanPWM variant** | S360-410 PoE + FanPWM | PWM sweep across duty range, RPM linearity/measurement, audible-noise check; integration log on hardware. | PWM control verified across full range on hardware **and** S360-410 PoE evidence accepted. |
| **FanDAC variant** | S360-410 PoE + FanDAC | DAC output linearity sweep, voltage accuracy vs. setpoint, RPM mapping; integration log on hardware. | DAC control verified across range on hardware **and** S360-410 PoE evidence accepted. |

> Until the evidence above is **attached and accepted in the corresponding
> follow-up PR**, the item stays ⛔ Blocked and is not promoted.

---

## 4. Next PR Table — what each follow-up PR does

These are the only paths by which a blocked item advances. Each is a separate
PR; none are authorized by this document beyond being enumerated.

| Next PR (proposed ID) | Purpose | Precondition (evidence) | Outcome on merge |
|-----------------------|---------|--------------------------|------------------|
| `HW-S360-410-POE-VERIFY-001` | Attach + accept S360-410 PoE bring-up evidence | PoE bring-up report (Evidence table) | Clears S360-410 shared PoE blocker; unblocks downstream gates (does **not** auto-promote anything). |
| `BUNDLE-KITCHEN-AIRIQ-001` | Attach AirIQ validation evidence | AirIQ calibration/accuracy run | Clears AirIQ blocker for Kitchen. |
| `BUNDLE-ROOMIQ-VALIDATE-001` | Attach RoomIQ validation evidence | RoomIQ accuracy run | Clears RoomIQ blocker for Kitchen + Bedroom. |
| `LED-STABILITY-VERIFY-001` | Attach LED stability evidence | LED stability run | Clears LED blocker for Living + Corridor (does **not** mark LED stable until merged). |
| `FAN-RELAY-VERIFY-001` | Attach FanRelay variant evidence | Relay endurance run | Clears FanRelay blocker. |
| `FAN-PWM-VERIFY-001` | Attach FanPWM variant evidence | PWM sweep run | Clears FanPWM blocker. |
| `FAN-DAC-VERIFY-001` | Attach FanDAC variant evidence | DAC sweep run | Clears FanDAC blocker. |
| `BUNDLE-PROMOTE-*` (per bundle) | Promote a bundle after all its blockers clear | All upstream blockers cleared (incl. S360-410 PoE) | Promotes the specific bundle. **Separate from this PR.** |
| `WEBFLASH-ENABLE-*` (per target) | Enable WebFlash for a verified target | Target promoted + artifacts published | Enables WebFlash. **Separate from this PR.** |

---

## 5. Release / WebFlash Impact Table

| Item | First-release ship? | Promote bundle? | Enable WebFlash? | Publish artifacts? | Notes |
|------|---------------------|-----------------|------------------|--------------------|-------|
| Bathroom stable | ✅ Yes (stable channel) | N/A (not a bundle) | ❌ No (out of scope here) | ❌ No | Stable line only; ships independently. |
| Kitchen bundle | ❌ No | ❌ No | ❌ No | ❌ No | Blocked: S360-410 PoE + AirIQ + RoomIQ. |
| Bedroom bundle | ❌ No | ❌ No | ❌ No | ❌ No | Blocked: S360-410 PoE + RoomIQ. |
| Living LED bundle | ❌ No | ❌ No | ❌ No | ❌ No | Blocked: S360-410 PoE + LED (LED not stable). |
| Corridor LED bundle | ❌ No | ❌ No | ❌ No | ❌ No | Blocked: S360-410 PoE + LED (LED not stable). |
| FanRelay variant | ❌ No | ❌ No | ❌ No | ❌ No | Not release-ready. |
| FanPWM variant | ❌ No | ❌ No | ❌ No | ❌ No | Not release-ready. |
| FanDAC variant | ❌ No | ❌ No | ❌ No | ❌ No | Not release-ready. |
| S360-410 platform | ❌ No | N/A | ❌ No | ❌ No | Not verified; shared PoE blocker open. |

**Net WebFlash impact of this PR:** none. WebFlash remains disabled for all
targets. No artifacts are published. No bundle is promoted. S360-410 remains
unverified, LED remains not-stable, and all fan variants remain not
release-ready — consistent with the guardrails above.

---

### Change log
- `PRE-HW-PREP-FIRST-RELEASE-GATES-001` — initial consolidation of
  first-release and expansion gates into this canonical checklist.
