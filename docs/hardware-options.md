# Hardware options and compatibility

This page carries the operator-facing option inventory and the compatibility
matrix the wizard enforces. It was relocated from the repository README when
it became a short front door (REPO-CUSTOMER-READY-001 S4). Runtime gating
comes from `scripts/data/module-requirements.js` and the visibility logic in
`scripts/state.js`; keep this page consistent with both and with the
canonical SKU table in [`../CLAUDE.md`](../CLAUDE.md).

## Canonical Option Inventory Table

The table below is the **documentation source for operator-facing names**, mirroring the canonical SKU table in `CLAUDE.md`. All product SKUs are revision **R4** unless noted.

| Group | Friendly name | SKU | Notes |
|---|---|---|---|
| Hub | Sense360 Core | S360-100 | The main board; every flashable device is a Core. |
| Sensor | Sense360 RoomIQ | S360-200 | Room sensor board (PIR, mmWave, light, temp/humidity, pressure). |
| Sensor | Sense360 AirIQ | S360-210 | Air-quality sensor board. |
| Sensor | Sense360 VentIQ | S360-211 | Bathroom-focused air-quality board; only on Ceiling + Bathroom mode and mutually exclusive with AirIQ. |
| Indicator | Sense360 LED | S360-300 | Addressable WS2812B LED ring. |
| Driver | Sense360 Relay | S360-310 | On/off relay for bathroom fans. |
| Driver | Sense360 PWM | S360-311 | 12V PWM driver, up to 4 fans with tach feedback. |
| Driver | Sense360 DAC | S360-312 | 0–10V analog driver. Conflicts with AirIQ on the shared DAC bus. |
| Driver | Sense360 TRIAC | S360-320 | Phase dimmer for mains fan or lamp. |
| Mount | Ceiling Mount | — | The only mount currently enabled in the UI. |
| Power | USB Power | — | Direct USB-C to the Core. |
| Power | Sense360 PoE PSU | S360-410 | Selected via `power=poe`. |
| Power | Sense360 240v PSU | S360-400 | Selected via `power=pwr`. |

Each SKU is its own product. Modules are selected individually — nothing is bundled.

## Compatibility Matrix

Legend: ✅ allowed, 🚫 blocked by current UI logic, ⚠️ conditionally allowed.

### Mount × Power compatibility (current UI)

| Mount \ Power | USB | Sense360 PoE PSU | Sense360 240v PSU |
|---|---:|---:|---:|
| Ceiling | ✅ | ✅ | ✅ |

### Mount × Module compatibility (current UI constraints)

| Mount | Bathroom mode | RoomIQ | AirIQ | VentIQ | Fan | LED |
|---|---|---|---|---|---|---|
| Ceiling + Bathroom OFF | n/a | `none`, enabled | `none`, enabled | hidden (`none`) | `none`, Relay, PWM, DAC | `none`, enabled |
| Ceiling + Bathroom ON | enabled | `none`, enabled | hidden (`none`) | `none`, enabled | `none`, Relay, PWM, DAC | `none`, enabled |

### Enforced module-combination constraints

| Combination | Result | Constraint source |
|---|---|---|
| Sense360 AirIQ + Sense360 DAC | 🚫 blocked | Shared DAC bus conflict metadata in module requirements. |
| Sense360 AirIQ + Sense360 VentIQ | 🚫 blocked | AirIQ and VentIQ are mutually exclusive; the Bathroom toggle drives which one is visible on Ceiling mounts. |
| Mount != Ceiling | VentIQ hidden and reset to `none` | UI logic auto-hides VentIQ unless Ceiling + Bathroom. |
