# WEBFLASH-FIRST-RELEASE-GATES-SYNC-001 — WebFlash mirror of the upstream first-release gates

**Identifier:** `WEBFLASH-FIRST-RELEASE-GATES-SYNC-001`

This document mirrors the upstream `sense360store/esphome-public` first-release
gate checklist onto the WebFlash side, stated against WebFlash's **own live
install surface**. It answers, for WebFlash specifically:

1. **What can be installed today** (the stable first-release path);
2. **What is exposed only as preview**; and
3. **What must not be exposed yet** (blocked room bundles, blocked fan-control
   variants, and the shared S360-410 PoE blocker).

> **Docs only — promotes nothing, enables nothing, exposes nothing.** This
> document imports no firmware, regenerates no manifest, edits no
> [`firmware/sources.json`](../../firmware/sources.json) entry, changes no
> `REQUIRED_CONFIGS` value, adds no install card / kit / kit-preset, exposes no
> fan-control variant, marks no preview build stable, publishes no artifact, and
> changes no runtime install behaviour. Installability is decided by
> `manifest.json`, `firmware/sources.json`, the `REQUIRED_CONFIGS` allowlist in
> [`.github/workflows/firmware-publish.yml`](../../.github/workflows/firmware-publish.yml),
> `scripts/utils/release-channels.js`, and the existing install gate — **not** by
> anything written here.

## Exact upstream source

WebFlash is **downstream** of `sense360store/esphome-public`. The cross-repo
boundary is exactly three stable surfaces — release **tags**, **config-string**
values, and **artifact names** — so WebFlash mirrors only the slice it can build
a signed `.bin` for and ship through the importer. Lifecycle / gate truth is
owned upstream.

| | |
|---|---|
| **Upstream source doc** | [`docs/first-release-gates.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-gates.md) |
| **Upstream canonical id** | `PRE-HW-PREP-FIRST-RELEASE-GATES-001` |
| **Upstream PR** | [#679](https://github.com/sense360store/esphome-public/pull/679) (merged) |
| **Upstream headline** | `S360-KIT-BATH-P` (Bathroom, stable) = the Release-One WebFlash build `Ceiling-POE-VentIQ-RoomIQ` ships today as the only first-release path. Kitchen / Bedroom / Living / Corridor are **not** first-release eligible. Fan-control variants are **planning-only**. Hardware bench tasks are **future-only**. `S360-410` remains `cataloged_unverified` (not verified). LED is **preview-only**. |

Where this document and an upstream source-of-truth file ever disagree,
**upstream wins for lifecycle / gate status** and the WebFlash `manifest.json`
wins for *what flashes today*. This is the WebFlash-side companion to the
in-repo [`PRE-HW-PREP-FIRST-RELEASE-GATES-001.md`](PRE-HW-PREP-FIRST-RELEASE-GATES-001.md)
gate mirror and the canonical
[`docs/sense360-webflash-status.md`](../sense360-webflash-status.md) status doc.

---

## 1. Installable today — the stable first-release path

There is exactly **one** stable, release-selectable WebFlash build, and it is
the only first-release path. It is backed by a real signed `.bin` on disk, a
`manifest.json` build, a `firmware/sources.json` source, a `REQUIRED_CONFIGS`
entry, a `scripts/data/kits.json` kit, and a Stage-1 bundle preset.

| Config string | Channel | WebFlash exposure | Upstream bundle | First-release? |
|---|---|---|---|:---:|
| **`Ceiling-POE-VentIQ-RoomIQ`** | `stable` | **Installable.** Default stable install path. `manifest.json` build (stable); in `REQUIRED_CONFIGS`; kit `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`; Stage-1 preset `S360-KIT-BATH-POE` (badge `Recommended`). | `S360-KIT-BATH-P` (Bathroom) | **YES — ships today** |

> **Stable installable target: `Ceiling-POE-VentIQ-RoomIQ`.** This is the
> Bathroom stable build (`S360-KIT-BATH-P` upstream) and the only product
> WebFlash can install at first release. Mirrors upstream §1.

---

## 2. Preview product — exposed but gated, never stable

Exactly **one** preview build is WebFlash-exposed. It is visible in normal mode
but never auto-selected, and install gates on the `channel:preview`
acknowledgement (WF-LED-003 Option A). It is **preview-only — not stable.**

| Config string | Channel | WebFlash exposure | Upstream | Stable? |
|---|---|---|---|:---:|
| **`Ceiling-POE-VentIQ-RoomIQ-LED`** | `preview` | **Preview-only.** `manifest.json` build (preview); installs only after the `channel:preview` acknowledgement; Stage-1 preset `S360-KIT-BATH-POE-LED` (badge `Preview`). **Not** in `REQUIRED_CONFIGS`, **not** a kit. | LED variant (S360-300 ring) | **No** |

> **Preview target: `Ceiling-POE-VentIQ-RoomIQ-LED`** — the LED preview target,
> already exposed on the preview channel. **LED stays preview-only; no
> LED-stable claim is made.** LED-stable is gated upstream behind `RELEASE-007`
> + bench proof `S360-300-BENCH-001`, plus the reserved WebFlash follow-ups
> `WF-LED-STABLE-001` / `WF-REQUIRED-001` / `WF-KIT-LED-001` and the operator
> flash proof in [`../led-preview-webflash-proof.md`](../led-preview-webflash-proof.md)
> (status: **pending**). Mirrors upstream §7.

---

## 3. Blocked room bundles — not WebFlash-exposed

The four non-Bathroom PoE room bundles are **not first-release eligible**
upstream and are **not installable** in WebFlash. They appear in WebFlash only
as naming references in [`../webflash-bundle-sku-matrix.md`](../webflash-bundle-sku-matrix.md);
none has a `manifest.json` build, a `firmware/sources.json` source entry, an
install card, a kit, or a kit-preset.

| Bundle SKU | Room | WebFlash exposure | Upstream first-release eligibility |
|---|---|---|---|
| `S360-KIT-KITCHEN-P` | kitchen | **Not exposed** — naming reference only | Not eligible (AirIQ sensor-stack evidence + the shared S360-410 PoE chain) |
| `S360-KIT-BEDROOM-P` | bedroom | **Not exposed** — naming reference only | Not eligible (shared S360-410 PoE chain) |
| `S360-KIT-LIVING-P` | living-room | **Not exposed** — naming reference only | Not eligible (LED preview→stable gauntlet + shared S360-410 PoE chain) |
| `S360-KIT-CORRIDOR-P` | corridor | **Not exposed** — naming reference only | Not eligible (LED gauntlet + shared S360-410 PoE chain) |

> **Not exposed / not installable: Kitchen, Bedroom, Living, Corridor.** Each
> stays blocked until upstream ships the corresponding `RELEASE-…` artifact and
> the S360-410 PoE evidence gate closes; the reserved
> `WF-IMPORT-POE-410-001` slot is an expected no-op unless a distinct PoE
> artifact appears. Mirrors upstream §2.

---

## 4. Blocked fan-control variants — not WebFlash-exposed

No fan-driver firmware is imported, published, or release-ready in WebFlash.
None of the four fan drivers has a `manifest.json` build, a `firmware/sources.json`
source entry, or an importable artifact. The four planned fan-control bundle
preset cards in [`../../scripts/data/kit-presets.js`](../../scripts/data/kit-presets.js)
(`S360-KIT-BATH-RELAY`, `S360-KIT-BATH-TRIAC`, `S360-KIT-DUCT-PWM`,
`S360-KIT-DUCT-DAC`) are **non-installable `Planned` cards** that never mutate
wizard state.

| Fan driver | Token | Board | WebFlash exposure |
|---|---|---|---|
| Fan relay | **`FanRelay`** | S360-310 | **Not exposed.** No build / source / card. Module classified `design-pending`. Import gated behind upstream `RELEASE-RELAY-001` → `WF-IMPORT-RELAY-001`. |
| Fan PWM | **`FanPWM`** | S360-311 | **Not exposed.** No build / source / card. Module classified `no-firmware` (hidden / not release-ready). Import gated behind upstream `RELEASE-PWM-001` → `WF-IMPORT-PWM-001`. |
| Fan DAC | **`FanDAC`** | S360-312 | **Not exposed.** No build / source / card. Module classified `no-firmware`. Import gated behind upstream `RELEASE-DAC-001` → `WF-IMPORT-DAC-001`. |
| TRIAC | **`FanTRIAC` / `TRIAC`** | S360-320 | **Not exposed / not importable.** Selectable in the *custom* path only behind the WF-TRIAC-001 `advanced-manual-warning` in-installer acknowledgement gate — **not** Release-One, **not** `REQUIRED_CONFIGS`, **not** a kit, **not** compliance-certified. `block_tokens` keep FanTRIAC out of every imported artifact. Import gated behind upstream `RELEASE-TRIAC-001` + `WF-IMPORT-TRIAC-001`. |

> **Not exposed: FanRelay, FanPWM, FanDAC, TRIAC.** The advanced/manual-warning
> *visibility* of TRIAC in the custom wizard path is **not** the same as TRIAC
> importability — no FanTRIAC artifact may be imported until upstream promotes it
> and `WF-IMPORT-TRIAC-001` opens. Mirrors upstream §4 / §5.

### 4.1 Fan-control bundle variants are planning-only upstream

The upstream fan-control **bundle** variants in
`config/room-bundle-fan-variants.json` (`ROOM-BUNDLE-FAN-VARIANTS-001`) are
**Bathroom / Kitchen add-ons only** and stay `planning` / `webflash_exposed: false`.
**Fan-control bundle variants are planning-only upstream** — not first-release,
not WebFlash-exposed, and no fan bundle SKU is introduced here.

| Upstream variant SKU | Base bundle | Fan driver | Lifecycle | WebFlash |
|---|---|---|---|---|
| `S360-KIT-BATH-P-REL` | `S360-KIT-BATH-P` | S360-310 relay | planning | not-exposed |
| `S360-KIT-BATH-P-DAC` | `S360-KIT-BATH-P` | S360-312 0–10V | planning | not-exposed |
| `S360-KIT-BATH-P-PWM` | `S360-KIT-BATH-P` | S360-311 pwm | planning | not-exposed |
| `S360-KIT-KITCHEN-P-DAC` | `S360-KIT-KITCHEN-P` | S360-312 0–10V | planning | not-exposed |
| `S360-KIT-KITCHEN-P-REL` | `S360-KIT-KITCHEN-P` | S360-310 relay | planning | not-exposed |

No TRIAC (S360-320) customer-facing fan variant is proposed upstream; no
Corridor / Living / Bedroom fan variant exists. Mirrors upstream §2.1.

---

## 5. Shared S360-410 PoE blocker

`S360-410` (Sense360 PoE PSU) remains `cataloged_unverified` upstream and is the
shared blocker under every non-Bathroom PoE bundle (§3) and every PoE-powered
fan variant (§4). WebFlash makes **no verified claim** for S360-410: PoE is
covered *transitively* today through the `power=poe` segment of the Release-One
stable build and the LED preview build — there is **no** standalone PoE-PSU
WebFlash build and **no** importable firmware behind the blocked room bundles.
Broader PoE bundle expansion stays **blocked** until the upstream S360-410 PoE
evidence chain closes. Mirrors upstream §3 / §3.1.

---

## 6. No-new-exposure statement

This sync mirrors a checklist; **it exposes nothing new.** Specifically, this
document does **not**:

- add any `manifest.json` build, `firmware/sources.json` source, or `.bin`;
- add or change any `REQUIRED_CONFIGS` entry (stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`);
- add any install card, kit (`scripts/data/kits.json`), or Stage-1 kit-preset
  (`scripts/data/kit-presets.js`);
- expose any fan-control variant — `FanRelay`, `FanPWM`, `FanDAC`, and `FanTRIAC`
  stay not-exposed, and the FanTRIAC `block_tokens` block stands;
- mark LED (`Ceiling-POE-VentIQ-RoomIQ-LED`) stable, or move it into
  `REQUIRED_CONFIGS` / kits;
- mark Kitchen / Bedroom / Living / Corridor installable;
- mark `S360-410` verified or publish / reference any new firmware artifact;
- change any runtime install behaviour, wizard surface, service worker, or
  workflow.

The only first-release path WebFlash exposes remains the stable
`Ceiling-POE-VentIQ-RoomIQ`; the only preview path remains
`Ceiling-POE-VentIQ-RoomIQ-LED` behind its acknowledgement gate.

---

## 7. No-drift confirmation

Every install-surface value below is **unchanged** by this document and matches
the live repository state at sync time.

| Surface | Value (unchanged) |
|---|---|
| `manifest.json` | 3 builds — `Ceiling-POE-VentIQ-RoomIQ` (stable), `Ceiling-POE-VentIQ-RoomIQ-LED` (preview), `Rescue` (rescue) |
| `firmware/sources.json` | 2 upstream sources — `v1.0.0` stable (`block_tokens: ["FanTRIAC", "LED"]`) and `v1.0.0-led-preview` (`block_tokens: ["FanTRIAC"]`); no fan-driver source |
| `REQUIRED_CONFIGS` | `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` (production-only) |
| `scripts/data/kits.json` | Release-One-only — `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` → `Ceiling-POE-VentIQ-RoomIQ` |
| `scripts/data/kit-presets.js` | 2 installable presets (`S360-KIT-BATH-POE` stable, `S360-KIT-BATH-POE-LED` preview) + 4 `Planned` fan-control cards |
| Fan-control exposure | None — no `FanPWM` / `FanRelay` / `FanDAC` / `FanTRIAC` build, source, or install card |

No install card was added; no preset was changed; no fan-control variant was
exposed; no firmware artifact was published or referenced as new.

---

## 8. WebFlash ↔ upstream gate map

| Upstream `docs/first-release-gates.md` section | WebFlash mirror |
|---|---|
| §1 Current shippable release | §1 Installable today (`Ceiling-POE-VentIQ-RoomIQ`) + §2 Preview (`Ceiling-POE-VentIQ-RoomIQ-LED`) |
| §2 Blocked bundle expansions | §3 Blocked room bundles (Kitchen / Bedroom / Living / Corridor) |
| §2.1 Fan-control variants (planning-only) | §4.1 Fan-control bundle variants are planning-only upstream |
| §3 / §3.1 Hardware blockers / S360-410 | §5 Shared S360-410 PoE blocker |
| §4 / §5 Firmware / WebFlash blockers | §4 Blocked fan-control variants (not WebFlash-exposed) |
| §7 LED preview status | §2 Preview product (LED preview-only, not stable) |
| §11 Guardrails (explicitly NOT changed) | §6 No-new-exposure statement + §7 No-drift confirmation |

---

## Cross-references

- Upstream canonical gate checklist:
  [`sense360store/esphome-public` → `docs/first-release-gates.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-gates.md)
  (`PRE-HW-PREP-FIRST-RELEASE-GATES-001`, PR #679).
- In-repo gate mirror:
  [`PRE-HW-PREP-FIRST-RELEASE-GATES-001.md`](PRE-HW-PREP-FIRST-RELEASE-GATES-001.md).
- Canonical WebFlash status:
  [`../sense360-webflash-status.md`](../sense360-webflash-status.md)
  (`WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001`).
- Room bundle SKU naming mirror:
  [`../webflash-bundle-sku-matrix.md`](../webflash-bundle-sku-matrix.md).
- Per-family import classes + reserved follow-up PR slots:
  [`../webflash-import-readiness-matrix.md`](../webflash-import-readiness-matrix.md).
- Catalog eligibility classifier contract:
  [`../product-import-readiness.md`](../product-import-readiness.md).
- Live WebFlash PR queue: [`../../UPCOMING_PR.md`](../../UPCOMING_PR.md).
