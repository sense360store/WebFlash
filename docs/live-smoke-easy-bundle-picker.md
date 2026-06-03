# Live WebFlash smoke checklist — Simple-install bundle picker (WF-EASY-BUNDLE-PICKER-001)

This is the **live / manual smoke checklist** for the deployed WebFlash site
after Simple install became an **easy bundle picker** over the supported customer
bundle products. It confirms that, on the live GitHub Pages deployment, the
stable Bathroom PoE bundle is the default and the imported preview room bundles
are reachable from Simple install behind clear Preview labels and the existing
acknowledgement gates — without exposing any standalone fan-driver config, TRIAC,
or raw module combination.

It complements — and does not replace:

- [`docs/live-smoke-preview-import.md`](live-smoke-preview-import.md) — the live
  smoke checklist for the preview firmware imports the picker now surfaces.
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — the import-readiness matrix the bundle set is drawn from.

> **Presentation + verification only.** This change imports no firmware,
> regenerates no manifest, edits no `firmware/sources.json` entry, changes no
> `REQUIRED_CONFIGS` value, and adds no kit to `scripts/data/kits.json`. The
> deterministic half of these checks is locked by
> [`__tests__/wf-easy-bundle-picker.test.js`](../__tests__/wf-easy-bundle-picker.test.js);
> this doc covers the browser-observable behaviour a unit test cannot reach.

## What changed

Simple install used to resolve to a single fixed kit — the stable Bathroom PoE
build `Ceiling-POE-VentIQ-RoomIQ`. It is now a **bundle picker** backed by
[`scripts/data/simple-bundles.js`](../scripts/data/simple-bundles.js) and wired
by [`scripts/simple-install.js`](../scripts/simple-install.js). Selecting a card
feeds the bundle's `wizardState` through the same `setState()` the wizard/kit
flows use, so Step 5 resolves the matching firmware and **every install gate
(preview-channel acknowledgement, provenance, signature, freshness, preflight)
stays authoritative**.

## Bundle set — what Simple install should show today

| Bundle SKU | Card name | Firmware `config_string` | Channel | Gate |
|---|---|---|---|---|
| `S360-KIT-BATH-P` | Bathroom Bundle — PoE | `Ceiling-POE-VentIQ-RoomIQ` | **stable** | default / recommended |
| `S360-KIT-KITCHEN-P` | Kitchen Bundle — PoE | `Ceiling-POE-AirIQ-RoomIQ` | preview | preview ack |
| `S360-KIT-BEDROOM-P` | Bedroom Bundle — PoE | `Ceiling-POE-RoomIQ` | preview | preview ack |
| `S360-KIT-LIVING-P` | Living Room Bundle — PoE | `Ceiling-POE-RoomIQ-LED` | preview | preview ack |
| `S360-KIT-CORRIDOR-P` | Landing / Corridor Bundle — PoE | `Ceiling-POE-RoomIQ-LED` | preview | preview ack |
| `S360-KIT-BATH-P-REL` | Bathroom Bundle — PoE + Relay Fan Control | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview | preview ack **+ fan-control ack** |

**Never shown in Simple install** (intentionally absent — not room-bundle
products): the standalone fan-driver previews `Ceiling-POE-FanPWM` and
`Ceiling-POE-FanDAC`, any TRIAC firmware (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`
stays build-blocked), and any raw/custom module combination. Those remain
reachable only through **Advanced install**, behind their own availability pills
and acknowledgements.

## Manual smoke steps (live deployment)

1. **Default state.** Open the deployed site. Simple install leads with
   **"Choose your Sense360 kit"**. The **Bathroom Bundle — PoE** card is
   pre-selected (highlighted, `aria-checked="true"`) and badged **Recommended**.
   The detail card reads *Stable firmware · v1.0.0*; no preview note and no
   fan-control region are visible. → _Expected: a normal customer can install the
   stable Bathroom kit with no extra acknowledgement beyond the safety
   confirmation._
2. **Preview bundle.** Select **Kitchen Bundle — PoE**. The detail card updates
   to *Preview firmware*, the calm preview note appears, and the install CTA
   reads *Install preview firmware*. Attempt to install → the Step 5
   **channel:preview** acknowledgement must be checked first. → _Expected:
   install is blocked until the preview channel is acknowledged._
3. **LED preview bundles.** Select **Living Room Bundle — PoE** and **Landing /
   Corridor Bundle — PoE**. Both resolve to `Ceiling-POE-RoomIQ-LED` and gate on
   the preview acknowledgement. → _Expected: two room framings, one preview
   build, preview ack required._
4. **Fan-control bundle (stronger gate).** Select **Bathroom Bundle — PoE +
   Relay Fan Control**. A red **fan-control** region appears with a dedicated
   acknowledgement. Tick the *Confirm before installing* safety box only →
   install stays blocked. Tick the **fan-control acknowledgement** as well →
   the authoritative pre-flash gate is satisfied, then the preview-channel
   acknowledgement still applies on Step 5. → _Expected: the relay bundle needs
   BOTH the fan-control acknowledgement AND the preview acknowledgement._
5. **Technical metadata stays collapsed.** On every selection, the SKU, config
   string, channel, and firmware filename live only inside the collapsed
   **Technical details** disclosure — never in the always-visible copy.
6. **Advanced install + Recovery survive.** The **Advanced install** link opens
   the full multi-step wizard (with the module availability pills, the standalone
   fan previews, and TRIAC behind their own warnings). **Recovery** still opens
   the rescue modal.
7. **Provenance / freshness untouched.** Every bundle build is signed and
   provenance-verified; the manifest-freshness gate behaves exactly as before
   (stale = hard block; unknown = calm "couldn't recheck" note).

## Invariants (locked by tests)

- `REQUIRED_CONFIGS` is unchanged: `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
  (production-only).
- `manifest.json` is unchanged (9 builds); `firmware/sources.json` is unchanged;
  `scripts/data/kits.json` stays Release-One-only.
- The only **default-selectable** manifest build is the stable Bathroom PoE build
  — preview bundles are never auto-selected, never recommended, never buyable.
- No standalone fan-driver (`Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC`) or TRIAC
  config appears in the Simple-install surface.
- The preview-channel acknowledgement and the fan-control acknowledgement are
  both **strengthened, never weakened**; provenance / signature / freshness checks
  are untouched.

## Result log

| Date | Build (`webflash-app-shell`) | Reviewer | Result |
|---|---|---|---|
| _pending_ | `2026-06-01-5` | _operator_ | _pending — live smoke not yet run_ |

No hardware / bench / compliance / safety / commercial-availability proof is
claimed by this checklist or by the preview bundles it surfaces.
