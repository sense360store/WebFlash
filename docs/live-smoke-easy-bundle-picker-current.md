# Live WebFlash smoke checklist — current Simple-install bundle picker (WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001)

This is the **consolidated live / manual smoke checklist** for the deployed
WebFlash site as it stands **today**, after the Simple-install bundle picker
(`WF-EASY-BUNDLE-PICKER-001`) and the import-gated fan-control expansion
(`WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001`) both landed, and after the standalone
FanRelay / FanPWM / FanDAC manual-previews were imported.

It records the **current expected end-state** of the live picker and rolls up the
two earlier checklists into one current-state pass:

- [`docs/live-smoke-easy-bundle-picker.md`](live-smoke-easy-bundle-picker.md) —
  the base picker checklist (six bundle cards).
- [`docs/live-smoke-easy-bundle-picker-fan-expansion.md`](live-smoke-easy-bundle-picker-fan-expansion.md)
  — the import-gated fan-control room bundles (still hidden today).
- [`docs/live-smoke-preview-import.md`](live-smoke-preview-import.md) — the
  preview-firmware import checklist.
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.

> **Verification only — no firmware imported.** This checklist imports no
> firmware, regenerates no manifest, edits no `firmware/sources.json` entry,
> changes no `REQUIRED_CONFIGS` value, adds no kit to `scripts/data/kits.json`,
> and weakens no acknowledgement / provenance / signature / freshness gate. The
> deterministic half of every row is locked by
> [`__tests__/wf-easy-bundle-picker-live-smoke.test.js`](../__tests__/wf-easy-bundle-picker-live-smoke.test.js);
> this doc covers the browser-observable behaviour a unit test cannot reach.

## What the deployed picker should show today

`manifest.json` carries **nine builds** (one stable, seven preview, one rescue).
Simple install leads with **"Choose your Sense360 kit"** and shows exactly the
**six** base bundle cards below. Each card is backed by a real build in the live
manifest, so none is a dead card.

### Visible base bundle cards (six)

| Bundle SKU | Card name | Firmware `config_string` | Channel | Gate |
|---|---|---|---|---|
| `S360-KIT-BATH-P` | Bathroom Bundle — PoE | `Ceiling-POE-VentIQ-RoomIQ` | **stable** | default / recommended |
| `S360-KIT-KITCHEN-P` | Kitchen Bundle — PoE | `Ceiling-POE-AirIQ-RoomIQ` | preview | preview ack |
| `S360-KIT-BEDROOM-P` | Bedroom Bundle — PoE | `Ceiling-POE-RoomIQ` | preview | preview ack |
| `S360-KIT-LIVING-P` | Living Room Bundle — PoE | `Ceiling-POE-RoomIQ-LED` | preview | preview ack |
| `S360-KIT-CORRIDOR-P` | Landing / Corridor Bundle — PoE | `Ceiling-POE-RoomIQ-LED` | preview | preview ack |
| `S360-KIT-BATH-P-REL` | Bathroom Bundle — PoE + Relay Fan Control | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview | preview ack **+ fan-control ack** |

The **Bathroom Relay** card is one of the six always-present base cards; its
`Ceiling-POE-VentIQ-FanRelay-RoomIQ` preview build is imported, so the card is
import-ready and **visible** today (behind its preview **and** fan-control
acknowledgements).

### Hidden fan-control expansion cards (five) — declared but import-gated

These full-composition fan-control room bundles are **declared and gated** but
**not exposed today**: their exact firmware is not in `manifest.json`, so the
import-readiness gate (`getExposableFanControlBundles`) returns an empty list and
no card is injected.

| Bundle SKU | Card name | Firmware `config_string` | Exposed today? |
|---|---|---|:---:|
| `S360-KIT-BATH-P-PWM` | Bathroom Bundle — PoE + PWM Fan Control | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | **No** |
| `S360-KIT-BATH-P-DAC` | Bathroom Bundle — PoE + 0–10V Fan Control | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | **No** |
| `S360-KIT-KITCHEN-P-REL` | Kitchen Bundle — PoE + Relay Extract Control | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | **No** |
| `S360-KIT-KITCHEN-P-PWM` | Kitchen Bundle — PoE + PWM Extract Control | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | **No** |
| `S360-KIT-KITCHEN-P-DAC` | Kitchen Bundle — PoE + 0–10V Extract Control | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | **No** |

A fan-control card lights up **only** once its exact full-composition
`config_string` is present in the live manifest (after a firmware-import PR fetches
the signed `.bin`, writes the `.meta.json` sidecar, pins the SHA-256 in
`firmware/sources.json`, and regenerates `manifest.json`). The two analog (0–10V)
bundles additionally require a GP8403 address-switch acknowledgement (IC1 `0x58` /
IC2 `0x5A`; `0x59` forbidden on the shared bus).

### Intentionally absent from Simple install

- The **standalone fan-driver previews** `Ceiling-POE-FanPWM` and
  `Ceiling-POE-FanDAC` **are in the manifest** today (imported as
  Advanced-install-only previews) but are **not room-bundle products**, so they
  **never** appear as a Simple-install card. They remain reachable only through
  **Advanced install** behind the `channel:preview` acknowledgement.
- Any **TRIAC** firmware (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`) stays
  build-blocked — no manifest build, no source entry, and **no** Simple-install
  card. TRIAC is selectable only in the custom/advanced path behind its own
  advanced/manual-warning gate.
- Any raw / custom module combination — Advanced install only.

## Manual smoke checklist (live deployment)

Run after a deploy, in a desktop Chromium browser (Chrome / Edge / Opera), in an
incognito window. The deployed page is
`https://sense360store.github.io/WebFlash/`.

- [ ] **Simple install loads cleanly.** The page opens on Simple install and
      leads with **"Choose your Sense360 kit"**. No error banner, no spinner that
      never resolves.
- [ ] **Bathroom Bundle — PoE is the default + Stable + Recommended.** Its card
      is pre-selected (highlighted, `aria-checked="true"`), badged **Recommended**,
      and the detail card reads *Stable firmware · v1.0.0*. No preview note and no
      fan-control region show for it.
- [ ] **The four base preview room cards appear.** Kitchen / Bedroom / Living /
      Corridor each show with a **Preview** label and none is marked Recommended.
- [ ] **Preview cards require acknowledgement.** Selecting Kitchen / Bedroom /
      Living / Corridor flips the detail card to *Preview firmware*, shows the calm
      preview note, and the CTA reads *Install preview firmware*. Install stays
      blocked until the Step 5 **channel:preview** acknowledgement is checked.
- [ ] **Bathroom Relay appears (import-ready).** The **Bathroom Bundle — PoE +
      Relay Fan Control** card is present and labelled **Preview** + **Fan control**.
      Selecting it reveals the red fan-control region; install stays blocked until
      **both** the safety confirmation and the fan-control acknowledgement are
      checked (and the preview channel is still acknowledged on Step 5).
- [ ] **The five fan-control expansion cards are hidden.** The picker shows
      **exactly six** cards. Confirm none of `S360-KIT-BATH-P-PWM`,
      `S360-KIT-BATH-P-DAC`, `S360-KIT-KITCHEN-P-REL`, `S360-KIT-KITCHEN-P-PWM`,
      `S360-KIT-KITCHEN-P-DAC` is shown (their firmware is not imported).
- [ ] **Standalone FanPWM / FanDAC are absent from Simple install.** No Simple
      card resolves to `Ceiling-POE-FanPWM` or `Ceiling-POE-FanDAC` — they live in
      Advanced install only.
- [ ] **TRIAC is absent.** No TRIAC card or token appears anywhere in the Simple
      install surface.
- [ ] **Advanced install remains available.** The **Advanced install** link opens
      the full multi-step wizard (with the module availability pills, the standalone
      fan previews, and TRIAC behind its own advanced/manual warning).
- [ ] **Recovery / Rescue remains available.** The **Recovery** link still opens
      the rescue modal; rescue firmware is unchanged.
- [ ] **Release notes open.** On the stable build and each preview build, the
      *View Release Notes* / changelog affordance opens (no dead `#` link).
- [ ] **No manifest-freshness false blocker.** Simple install does not show a
      *"Cannot install yet"* freshness block. Freshness *unknown* is a calm,
      non-blocking *"Couldn't recheck for updates"* note; only a genuinely *stale*
      manifest hard-blocks.
- [ ] **Install button gating works.** The stable Bathroom build becomes
      installable after only the single safety confirmation. Every preview bundle
      stays blocked until its acknowledgement(s) are satisfied. Technical metadata
      (SKU / config / channel / firmware file) stays inside the collapsed
      **Technical details** disclosure — never in the always-visible copy.

## Deterministic invariants (locked by the test)

[`__tests__/wf-easy-bundle-picker-live-smoke.test.js`](../__tests__/wf-easy-bundle-picker-live-smoke.test.js)
locks the machine-checkable half of every row above:

- `manifest.json` carries exactly nine builds; all six base bundle configs
  resolve to a live build with the matching channel.
- The Bathroom Relay base bundle's config is in the manifest (visible); none of
  the five fan-control expansion configs is (hidden) — `getExposableFanControlBundles`
  against the live manifest is empty.
- A fan-control card becomes exposable only when its exact full-composition config
  is in the manifest (synthetic), never from a standalone fan-only or TRIAC config.
- The standalone `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` builds are in the
  manifest yet are never the firmware target of any Simple bundle.
- TRIAC appears in no bundle and no manifest build.
- The stable Bathroom PoE build is the only default-selectable build, carries no
  channel acknowledgement, and is not deprecated (no false freshness block).
- Every preview base bundle build gates on `channel:preview`; every base build has
  a working release-notes affordance.
- `REQUIRED_CONFIGS` stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`;
  `scripts/data/kits.json` stays Release-One-only; `firmware/sources.json` declares
  no fan-control expansion source.

## Manual verification template

Record the live pass here when an operator runs it on the deployed page.

| Field | Value |
|---|---|
| Date | _YYYY-MM-DD_ |
| Browser | _e.g. Chrome 1xx on macOS / Windows / Linux_ |
| Deployed URL | `https://sense360store.github.io/WebFlash/` |
| Build marker (`webflash-app-shell`) | _from the page source_ |
| Manifest `generated_at` | _from `manifest.json` (e.g. `2026-06-03T…`)_ |
| Six base cards shown, Bathroom default | Pass / Fail |
| Preview cards gated on acknowledgement | Pass / Fail |
| Five fan-control expansion cards hidden | Pass / Fail |
| Standalone FanPWM / FanDAC absent from Simple | Pass / Fail |
| TRIAC absent | Pass / Fail |
| Advanced install + Recovery reachable | Pass / Fail |
| Release notes open; no freshness false blocker | Pass / Fail |
| Install gating works (stable + each preview) | Pass / Fail |
| Overall | Pass / Fail |

## Result log

| Date | Build (`webflash-app-shell`) | Reviewer | Result |
|---|---|---|---|
| _pending_ | _to fill_ | _operator_ | _pending — live smoke not yet run_ |

No hardware / bench / compliance / safety / commercial-availability proof is
claimed by this checklist or by the preview bundles it surfaces.
