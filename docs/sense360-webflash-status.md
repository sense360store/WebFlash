# Sense360 WebFlash Product & Release Status (canonical)

**Identifier:** `WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001`

This is the **single canonical WebFlash-side status document** for which Sense360
products WebFlash can install today, which are preview-only, and which are
intentionally not yet release-selectable. It consolidates the WebFlash roadmap /
feature / product-availability narrative that previously drifted across several
docs (notably the root `FEATURES.md`) into one place that tracks the **live
repository state**, not aspiration.

> **Docs-only.** This document imports no firmware, regenerates no manifests,
> edits no `firmware/sources.json` entry, changes no `REQUIRED_CONFIGS` value,
> adds no kit, and changes no runtime UI surface. Installability is decided by
> `manifest.json`, `firmware/sources.json`, the `REQUIRED_CONFIGS` allowlist in
> [`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml),
> `scripts/utils/release-channels.js`, and the existing install gate — **not** by
> anything written here. A product appearing in this document does **not** mean
> WebFlash can flash it.

## Source of record

| Layer | Source of record | Owner |
|---|---|---|
| **Sense360 product roadmap / lifecycle status** | `docs/sense360-roadmap-status.md` in [`sense360store/esphome-public`](https://github.com/sense360store/esphome-public/blob/main/docs/sense360-roadmap-status.md) | Upstream firmware repo |
| **What WebFlash can actually install** | `manifest.json` + `firmware/sources.json` + `REQUIRED_CONFIGS` in this repo | WebFlash |
| **Catalog → WebFlash eligibility rules** | [`docs/product-import-readiness.md`](product-import-readiness.md) + [`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js) | WebFlash |
| **Per-family import readiness + follow-up PR slots** | [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md) | WebFlash |

WebFlash is **downstream** of the upstream roadmap. The upstream
`docs/sense360-roadmap-status.md` is authoritative for product lifecycle
(`production` / `preview` / `blocked` / `legacy-compatible` / `deprecated` /
`removed` / `hardware-pending` / `compile-only`). WebFlash mirrors only the
slice it can build a signed `.bin` for and ship through the importer. When the
two disagree, upstream wins for *lifecycle status* and the WebFlash manifest
wins for *what flashes today*.

## Currently supported / release-selectable products

These are the **only** builds in `manifest.json` today. Everything else is
either preview-gated, blocked, or has no imported artifact.

| Product (`config_string`) | Channel | Version | WebFlash exposure | In `REQUIRED_CONFIGS`? |
|---|---|---|---|---|
| **Release-One** — `Ceiling-POE-VentIQ-RoomIQ` | `stable` | 1.0.0 | Release-selectable. Default stable install path. Backs the `S360-KIT-BATH-POE` kit and the `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` entry in `scripts/data/kits.json`. | **Yes** |
| **LED preview** — `Ceiling-POE-VentIQ-RoomIQ-LED` | `preview` | 1.0.0 | **Preview-only.** Visible in normal mode but never auto-selected; install gates on the `channel:preview` acknowledgement (WF-LED-003 Option A). Not a kit, not recommended. | No |
| **Rescue** — `Rescue` | `rescue` | 1.0.0 | Recovery / unbricking build, reached via the recovery path + rescue modal. WebFlash-owned. | **Yes** |

`REQUIRED_CONFIGS` is **production-only**: `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
The LED preview is deliberately *not* on the allowlist — a `preview` catalog
status is import / manifest / kit eligible but never `REQUIRED_CONFIGS` eligible.

## Module availability snapshot

Step 4 classifies every module variant through the presentation-only
classifier in [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js).
The classifier is **not** the install gate. Current per-SKU state:

| SKU | Friendly name | Availability state | Notes |
|---|---|---|---|
| S360-100 | Sense360 Core | implicit | Every flashable device is a Core. |
| S360-200 | Sense360 RoomIQ | `available-stable` | Part of Release-One. |
| S360-211 | Sense360 VentIQ | `available-stable` | Part of Release-One (Bathroom toggle). |
| S360-300 | Sense360 LED | `available-preview` | **Preview-only — not stable.** Derived from the LED preview build behind the preview acknowledgement. |
| S360-210 | Sense360 AirIQ | `no-firmware` | No WebFlash build ships. |
| S360-310 | Sense360 Relay | `design-pending` | No S360-310 schematic uploaded upstream. |
| S360-311 | Sense360 PWM (**FanPWM**) | `no-firmware` | **Hidden / not release-ready.** Schematic exists upstream; no WebFlash build ships. No install card. |
| S360-312 | Sense360 DAC | `no-firmware` | Schematic exists upstream; no WebFlash build ships. |
| S360-320 | Sense360 TRIAC | `advanced-manual-warning` | Selectable in the custom path behind an in-installer warning gate (WF-TRIAC-001). **Not** compliance-certified, **not** import-allowed, **not** Release-One. |
| S360-400 | Sense360 240v PSU | covered transitively | `power=ac` segment; no separate artifact. |
| S360-410 | Sense360 PoE PSU | covered transitively | `power=poe` segment; **see blocker below.** |

## Standing guardrails

These four invariants are the point of the consolidation. They must remain
true and visible:

1. **FanPWM (S360-311) stays hidden / not release-ready.** Classified
   `no-firmware`; no install card; no manifest build; no source entry. Importing
   it is gated behind upstream `RELEASE-PWM-001` and the reserved
   `WF-IMPORT-PWM-001` follow-up. (The sibling fan drivers — Relay / DAC / TRIAC
   — are likewise not release-selectable; TRIAC is selectable only behind the
   WF-TRIAC-001 advanced/manual-warning gate and remains import-blocked.)
2. **LED (S360-300) stays preview-only.** The `Ceiling-POE-VentIQ-RoomIQ-LED`
   build ships on the `preview` channel and installs only after the
   `channel:preview` acknowledgement. It is **not** marked stable, **not** in
   `REQUIRED_CONFIGS`, and **not** in `scripts/data/kits.json`. LED stable is
   blocked behind upstream `RELEASE-007` + bench proof `S360-300-BENCH-001` and
   the reserved `WF-LED-STABLE-001` import / `WF-REQUIRED-001` allowlist /
   `WF-KIT-LED-001` kit decisions, plus the operator flash proof in
   [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md)
   (status: **pending**).
3. **S360-410 PoE PSU blocker stays visible for broader bundle expansion.** PoE
   power is covered *transitively* today via the `power=poe` segment of
   Release-One and the LED preview — there is **no** standalone PoE-PSU build,
   and there is **no** importable firmware behind the additional room bundles
   (`S360-KIT-KITCHEN-P`, `S360-KIT-LIVING-P`, `S360-KIT-BEDROOM-P`,
   `S360-KIT-CORRIDOR-P` in [`docs/webflash-bundle-sku-matrix.md`](webflash-bundle-sku-matrix.md)),
   which are naming-reference only. Broader PoE bundle expansion is therefore
   **blocked** until upstream ships the corresponding `RELEASE-…` artifacts; the
   reserved `WF-IMPORT-POE-410-001` slot is an expected no-op unless a distinct
   PoE artifact appears.
4. **FanTRIAC stays blocked from Release-One.** `block_tokens: ["FanTRIAC", "LED"]`
   on the Release-One source and `["FanTRIAC"]` on the LED preview source both
   stand. The manifest-health guard fails CI if a `FanTRIAC` token reappears in a
   generated `config_string`.

## What this document supersedes

- **`FEATURES.md`** (repo root) is **deprecated** as a status/roadmap source and
  now redirects here. Its old "module support" / "recommended bundle" claims had
  drifted (e.g. AirIQ listed as supported and as the recommended bundle, which is
  no longer true — AirIQ is `no-firmware` and the recommended state is RoomIQ +
  VentIQ over PoE with `fan: none`).

## Still authoritative — not superseded

This consolidation is scoped to **product / release status**. The following docs
remain the source of truth in their own lanes and are *not* replaced here:

- [`UPCOMING_PR.md`](../UPCOMING_PR.md) — live WebFlash PR queue (completed /
  active / blocked). Every queue-state-changing PR still updates it.
- [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) — wizard UX audit + PR
  sequence (WF-UX-*). [`docs/ux-roadmap.md`](ux-roadmap.md) is its source review.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — per-family import classes + reserved follow-up PR identifiers.
- [`docs/product-import-readiness.md`](product-import-readiness.md) — catalog
  eligibility classifier contract.
- [`docs/firmware-import.md`](firmware-import.md) — the importer mechanism.
- [`docs/led-preview-import-plan.md`](led-preview-import-plan.md) /
  [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md) — LED
  preview import shape + operator proof container.
- [`docs/webflash-bundle-sku-matrix.md`](webflash-bundle-sku-matrix.md) — room
  bundle SKU naming mirror.

## Do-not-change list (this PR)

Every firmware binary, `manifest.json`, every `firmware-*.json`,
`firmware/sources.json`, the `REQUIRED_CONFIGS = ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
allowlist, `scripts/data/kits.json`, `scripts/data/kit-presets.js`,
`scripts/data/module-requirements.js`, `scripts/utils/release-channels.js`,
`scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`,
every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, every CSS
file, every runtime JS file, every test, and every fixture are byte-identical to
pre-`WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001`. No firmware imported. No
FanPWM install card. No LED-stable claim. No artifact published. The FanTRIAC
HW-005 block, the WF-LED-003 preview-channel acknowledgement model, and the
WF-TRIAC-001 advanced/manual-warning gate all stand unchanged.
