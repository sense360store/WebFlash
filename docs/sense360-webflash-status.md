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

## Current release version(s)

WebFlash ships from `manifest.json`, which today carries exactly three builds.
All three are at version **1.0.0**:

| Config string | Channel | Version | Upstream release tag | Release-selectable? |
|---|---|---|---|---|
| `Ceiling-POE-VentIQ-RoomIQ` | `stable` | 1.0.0 | [`v1.0.0`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0) | **Yes** (default stable path) |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | `preview` | 1.0.0 | [`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview) | **Preview-only** (gated on `channel:preview` acknowledgement) |
| `Rescue` | `rescue` | 1.0.0 | _(built in-tree under `firmware/rescue/`)_ | Recovery path only |

- **Release-selectable target:** `Ceiling-POE-VentIQ-RoomIQ` (stable).
- **Preview target:** `Ceiling-POE-VentIQ-RoomIQ-LED` (S360-300 LED ring, preview channel).
- **Blocked / not WebFlash-exposed targets:** FanPWM (S360-311), FanRelay
  (S360-310), FanDAC (S360-312), FanTRIAC (S360-320), and any broader PoE
  bundle expansion that depends on S360-410 evidence. None of these has a
  `manifest.json` build, a `firmware/sources.json` source entry, an install
  card, or a release artifact in this repo.

## Bundle SKU mapping

Customer-facing Sense360 PoE **room bundle** SKUs (upstream
`BUNDLE-SKU-MATRIX-001`) are mirrored for naming consistency in
[`docs/webflash-bundle-sku-matrix.md`](webflash-bundle-sku-matrix.md). A bundle
SKU is **not** a firmware identifier — only `S360-KIT-BATH-P` resolves to an
installable WebFlash build today.

| Bundle SKU | Room | Firmware target today | WebFlash exposure |
|---|---|---|---|
| `S360-KIT-BATH-P` | bathroom | `Ceiling-POE-VentIQ-RoomIQ` | **Installable** (Release-One stable; same build as the `S360-KIT-BATH-POE` kit-intent card). |
| `S360-KIT-KITCHEN-P` | kitchen | _none_ | Naming reference only — no imported build. |
| `S360-KIT-LIVING-P` | living-room | _none_ | Naming reference only — LED preview-gated upstream. |
| `S360-KIT-BEDROOM-P` | bedroom | _none_ | Naming reference only — no imported build. |
| `S360-KIT-CORRIDOR-P` | corridor | _none_ | Naming reference only — LED preview-gated upstream. |

Per-bundle detail and the three parallel identifier spaces (Module SKU / Kit
SKU / Bundle SKU / firmware `config_string`) live in the bundle SKU matrix doc.
Broader PoE bundle expansion (Kitchen / Living / Bedroom / Corridor) stays
**blocked** until upstream ships the corresponding `RELEASE-…` artifacts and the
S360-410 PoE evidence gate closes (see guardrail 3).

## WebFlash roadmap

WebFlash is **downstream** of the upstream firmware roadmap. The authoritative
near-term lane order lives upstream in
[`docs/sense360-roadmap-status.md` §8](https://github.com/sense360store/esphome-public/blob/main/docs/sense360-roadmap-status.md);
the WebFlash-side import sequencing and per-family follow-up PR slots live in
[`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
and the live queue in [`UPCOMING_PR.md`](../UPCOMING_PR.md). Each WebFlash import
follow-up is **blocked behind** its upstream release artifact — none is started,
unblocked, or reprioritised by this doc:

| WebFlash follow-up | Target | Blocked behind |
|---|---|---|
| `WF-IMPORT-RELAY-001` | FanRelay (S360-310) import | upstream `RELEASE-RELAY-001` |
| `WF-IMPORT-PWM-001` | FanPWM (S360-311) import | upstream `RELEASE-PWM-001` |
| `WF-IMPORT-DAC-001` | FanDAC (S360-312) import | upstream `RELEASE-DAC-001` |
| `WF-IMPORT-TRIAC-001` | FanTRIAC (S360-320) import | upstream `RELEASE-TRIAC-001` + `WF-TRIAC-001` runtime UX |
| `WF-IMPORT-POWER-400-001` | S360-400 240v PSU import | upstream `RELEASE-POWER-400-001` |
| `WF-IMPORT-POE-410-001` | S360-410 PoE PSU import | S360-410 evidence gate (reserved no-op — PoE covered transitively today) |
| `WF-LED-STABLE-001` | LED preview→stable promotion | upstream `RELEASE-007` + bench proof `S360-300-BENCH-001` |
| `WF-REQUIRED-001` | any `REQUIRED_CONFIGS` change | a newly imported, backed `.bin` |
| `WF-KIT-LED-001` | any LED kit / recommended decision | LED stable promotion |

Four separation invariants travel with every roadmap row: *release artifact
existence does not mean WebFlash import*; *WebFlash import does not mean
`REQUIRED_CONFIGS`*; *WebFlash import does not mean kit / recommended / default
exposure*; *advanced / manual-warning import is not compliance certification.*

## Upstream canonical roadmap docs (source of record)

Lifecycle / roadmap / blocker status is owned upstream. Where this doc and an
upstream source-of-truth file disagree, **upstream wins for lifecycle status**
and the WebFlash manifest wins for *what flashes today*.

- [`docs/sense360-roadmap-status.md`](https://github.com/sense360store/esphome-public/blob/main/docs/sense360-roadmap-status.md)
  — single canonical upstream roadmap / status / blocker / upcoming-PR doc
  (`DOCS-CONSOLIDATION-ROADMAP-001`, verified by `DOCS-CONSOLIDATION-VERIFY-001`).
- [`docs/sense360-room-bundles.md`](https://github.com/sense360store/esphome-public/blob/main/docs/sense360-room-bundles.md)
  — canonical room bundle SKU definitions (`BUNDLE-SKU-MATRIX-001`).
- _There is no `docs/sense360-webflash-status.md` upstream_ — **this file** is
  the canonical WebFlash-side status doc, downstream of the upstream roadmap.

## Verification record (WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001)

Cross-checked against the live repository state on consolidation. Every status
statement above is sourced from a committed file:

- **Release targets match `manifest.json`.** `manifest.json` carries exactly
  three builds — `Ceiling-POE-VentIQ-RoomIQ` (stable), `Ceiling-POE-VentIQ-RoomIQ-LED`
  (preview), `Rescue` (rescue) — matching the targets enumerated above.
- **Source entries match `firmware/sources.json`.** Two upstream sources are
  declared: the v1.0.0 Release-One stable build (`block_tokens:
  ["FanTRIAC", "LED"]`) and the v1.0.0-led-preview build (`block_tokens:
  ["FanTRIAC"]`). No FanPWM / FanRelay / FanDAC / FanTRIAC source entry exists.
- **`REQUIRED_CONFIGS` is production-only.** The allowlist in
  [`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml)
  holds exactly `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`. The LED preview is
  deliberately absent.
- **FanPWM (S360-311) remains blocked / not release-ready.** No manifest build,
  no source entry, no install card, classified `no-firmware` by
  [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js).
  Matches upstream §6.2 (compile-proven native path, bench-pending, not
  release-ready).
- **LED (S360-300) remains preview-only.** No LED-stable claim; LED ships on the
  `preview` channel behind the `channel:preview` acknowledgement. Matches
  upstream §7.
- **S360-410 remains `cataloged_unverified`.** No verified claim is made; PoE is
  covered transitively via the `power=poe` segment of Release-One + LED preview.
  Matches upstream §6.1.
- **Stale SX1509 FanPWM active-path claims are absent.** The WebFlash side never
  exposed an SX1509 FanPWM path; nothing here asserts one. Matches upstream §6.2.

This verification is **prior-recorded, not a live cross-repo re-fetch** of
upstream binaries — WebFlash mirrors the upstream lifecycle slice it can build a
signed `.bin` for; upstream re-verification is owned by
`DOCS-CONSOLIDATION-VERIFY-001` in `sense360store/esphome-public`.

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
