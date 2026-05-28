# WebFlash Bundle SKU Matrix (WEBFLASH-BUNDLE-SKU-MATRIX-001)

WEBFLASH-BUNDLE-SKU-MATRIX-001 — local documentation mirror of the Sense360
**PoE room bundle SKU naming** introduced upstream in
`sense360store/esphome-public` `BUNDLE-SKU-MATRIX-001`. WebFlash refers to
the same customer-facing room bundle identifiers so that diagnostics,
support, and any future kit-preset / catalog work can name room bundles
consistently across both repositories.

> **This document is naming-reference only.** It imports no firmware,
> regenerates no manifests, edits no `firmware/sources.json` entry,
> changes no `REQUIRED_CONFIGS` value, edits no kit-preset entry, adds no
> entry to `scripts/data/kits.json`, and changes no runtime UI surface.
> A bundle SKU appearing in this matrix does **not** imply that WebFlash
> can install firmware for it today — installability is still decided
> by `manifest.json`, `firmware/sources.json`, `REQUIRED_CONFIGS`,
> `scripts/utils/release-channels.js`, and the existing install gate.

## Identifier spaces

Three SKU identifier spaces coexist. They are deliberately separate
because they answer different questions:

| Identifier space | Example | Audience | Source of truth |
|---|---|---|---|
| **Module SKU** | `S360-100`, `S360-200`, `S360-211`, `S360-300`, `S360-410` | Inventory / support | Canonical SKU table in [`CLAUDE.md`](../CLAUDE.md), [`scripts/data/module-requirements.js`](../scripts/data/module-requirements.js) |
| **Kit SKU** (kit-intent matrix) | `S360-KIT-BATH-POE`, `S360-KIT-BATH-POE-LED`, `S360-KIT-BATH-RELAY` | Customer (module-focused kits) | Upstream `KIT-MATRIX-001` ([`docs/kit-intent-matrix.md`](https://github.com/sense360store/esphome-public/blob/main/docs/kit-intent-matrix.md) in `sense360store/esphome-public`); local mirror at [`scripts/data/kit-presets.js`](../scripts/data/kit-presets.js) |
| **Bundle SKU** (room bundle matrix) | `S360-KIT-BATH-P`, `S360-KIT-KITCHEN-P`, `S360-KIT-LIVING-P`, `S360-KIT-BEDROOM-P`, `S360-KIT-CORRIDOR-P` | Customer (room-focused PoE bundles) | Upstream `BUNDLE-SKU-MATRIX-001` in `sense360store/esphome-public`; this document mirrors the naming |
| **Firmware config string** | `Ceiling-POE-VentIQ-RoomIQ`, `Ceiling-POE-VentIQ-RoomIQ-LED`, `Rescue` | Build / WebFlash / release | [`manifest.json`](../manifest.json), [`firmware/sources.json`](../firmware/sources.json), `REQUIRED_CONFIGS` in [`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml) |

The room-focused **Bundle SKU** namespace introduced by upstream
`BUNDLE-SKU-MATRIX-001` is a *parallel* customer-facing layer next to the
existing module-focused **Kit SKU** namespace from `KIT-MATRIX-001`. Both
spaces are presentation-only from WebFlash's perspective; neither one is
the firmware identifier.

## Room bundle SKUs (PoE)

Each bundle name uses the `-P` suffix to indicate the Sense360 PoE PSU
(`S360-410`) is the bundled power supply.

| Bundle SKU | Customer-facing name | Upstream status (`BUNDLE-SKU-MATRIX-001`) | WebFlash exposure today |
|---|---|---|---|
| `S360-KIT-BATH-P`     | Sense360 Bathroom Bundle — PoE          | Productized PoE room bundle | **Already covered** by the existing Release-One stable installable surface — same firmware `config_string` as the existing `S360-KIT-BATH-POE` kit-intent entry. No new installable. |
| `S360-KIT-KITCHEN-P`  | Sense360 Kitchen Bundle — PoE           | Productized PoE room bundle | **Naming reference only.** No matching firmware build is imported. Not exposed as a kit-preset, not in `scripts/data/kits.json`, not in `manifest.json`, not in `REQUIRED_CONFIGS`. |
| `S360-KIT-LIVING-P`   | Sense360 Living Room Bundle — PoE       | Productized PoE room bundle | **Naming reference only.** Same exposure status as `S360-KIT-KITCHEN-P`. |
| `S360-KIT-BEDROOM-P`  | Sense360 Bedroom Bundle — PoE           | Productized PoE room bundle | **Naming reference only.** Same exposure status as `S360-KIT-KITCHEN-P`. |
| `S360-KIT-CORRIDOR-P` | Sense360 Landing / Corridor Bundle — PoE | Productized PoE room bundle | **Naming reference only.** Same exposure status as `S360-KIT-KITCHEN-P`. |

## Per-bundle mapping detail

### `S360-KIT-BATH-P` — Sense360 Bathroom Bundle — PoE

- **Upstream room bundle SKU.** `S360-KIT-BATH-P` (`BUNDLE-SKU-MATRIX-001`).
- **Adjacent upstream kit-intent SKU.** `S360-KIT-BATH-POE` (`KIT-MATRIX-001`).
- **Firmware config string today.** `Ceiling-POE-VentIQ-RoomIQ` (Release-One stable).
- **Manifest channel.** `stable`.
- **`REQUIRED_CONFIGS`-eligible today?** Yes — `Ceiling-POE-VentIQ-RoomIQ`
  is one of the two entries in the production-only allowlist (the other
  is `Rescue`).
- **Kit-preset card.** Already exposed under the kit-intent ID
  `S360-KIT-BATH-POE` (`status: stable`, `badge: Recommended`) by
  `WF-KIT-PRESETS-001`. **No new card is added by
  WEBFLASH-BUNDLE-SKU-MATRIX-001** — the existing kit-intent card
  already resolves to the same firmware build.
- **Module composition (informational).** Sense360 Core (S360-100) +
  Sense360 RoomIQ (S360-200) + Sense360 VentIQ (S360-211) + Sense360
  PoE PSU (S360-410). LED (S360-300) is deliberately routed through the
  preview kit-intent SKU `S360-KIT-BATH-POE-LED` until LED stable gates
  close upstream (`RELEASE-007` + `S360-300-BENCH-001` +
  `WF-HW-TEST-001` / `WF-HW-TEST-003`).

### `S360-KIT-KITCHEN-P` — Sense360 Kitchen Bundle — PoE

- **Upstream room bundle SKU.** `S360-KIT-KITCHEN-P` (`BUNDLE-SKU-MATRIX-001`).
- **Adjacent upstream kit-intent SKU.** None today — kitchen room
  bundles are not yet enumerated in `KIT-MATRIX-001`.
- **Firmware config string today.** None.
- **Manifest channel.** Not applicable — no matching build is imported.
- **`REQUIRED_CONFIGS`-eligible today?** No.
- **Kit-preset card.** Not added — WebFlash has no installable firmware
  for this room bundle, and exposing it as a kit-preset would imply
  installability that does not exist.
- **Why not exposed?** No upstream WebFlash-build-matrix `config_string`
  has been declared for a kitchen-targeted firmware. Until an upstream
  release artifact and product-catalog entry exist for the kitchen
  bundle's intended firmware, WebFlash cannot import, expose, or
  resolve it.

### `S360-KIT-LIVING-P` — Sense360 Living Room Bundle — PoE

- **Upstream room bundle SKU.** `S360-KIT-LIVING-P` (`BUNDLE-SKU-MATRIX-001`).
- **Adjacent upstream kit-intent SKU.** None today.
- **Firmware config string today.** None.
- **Manifest channel.** Not applicable.
- **`REQUIRED_CONFIGS`-eligible today?** No.
- **Kit-preset card.** Not added.
- **Why not exposed?** Same as `S360-KIT-KITCHEN-P` — no upstream
  release artifact has been declared and imported for a living-room
  firmware target.

### `S360-KIT-BEDROOM-P` — Sense360 Bedroom Bundle — PoE

- **Upstream room bundle SKU.** `S360-KIT-BEDROOM-P` (`BUNDLE-SKU-MATRIX-001`).
- **Adjacent upstream kit-intent SKU.** None today.
- **Firmware config string today.** None.
- **Manifest channel.** Not applicable.
- **`REQUIRED_CONFIGS`-eligible today?** No.
- **Kit-preset card.** Not added.
- **Why not exposed?** Same as `S360-KIT-KITCHEN-P`.

### `S360-KIT-CORRIDOR-P` — Sense360 Landing / Corridor Bundle — PoE

- **Upstream room bundle SKU.** `S360-KIT-CORRIDOR-P` (`BUNDLE-SKU-MATRIX-001`).
- **Adjacent upstream kit-intent SKU.** None today.
- **Firmware config string today.** None.
- **Manifest channel.** Not applicable.
- **`REQUIRED_CONFIGS`-eligible today?** No.
- **Kit-preset card.** Not added.
- **Why not exposed?** Same as `S360-KIT-KITCHEN-P`.

## Separation invariants

The same separation invariants documented in
[`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
apply to every row above:

1. **Bundle SKU existence does not imply WebFlash import.** A bundle
   appearing in upstream `BUNDLE-SKU-MATRIX-001` does not by itself
   create an importable firmware artifact in WebFlash.
2. **WebFlash import does not imply `REQUIRED_CONFIGS`.** Even if a
   future room-bundle-targeted firmware is imported, it must pass the
   independent WF-PRODUCT-004 readiness rules before it may join the
   production-only deploy allowlist.
3. **WebFlash import does not imply kit / recommended / default
   exposure.** Adding a `scripts/data/kits.json` entry or a
   `scripts/data/kit-presets.js` preset is a separate, deliberate
   decision per bundle.
4. **Preview / candidate firmware stays preview / candidate.** The
   LED-bearing variants remain preview-gated under the existing
   WF-LED-003 exposure model; no LED stable promotion is claimed by
   this document. Fan-driver candidate builds (Relay / PWM / DAC /
   TRIAC) remain non-installable until their respective upstream
   `RELEASE-…` artifacts ship and a per-driver `WF-IMPORT-…-001`
   follow-up imports them.

## Bathroom mapping note

The bathroom bundle (`S360-KIT-BATH-P`) is the only entry in this
matrix that resolves to an already-installable WebFlash firmware build.
This is because:

- The Release-One stable `Ceiling-POE-VentIQ-RoomIQ` build was imported
  by `WF-LED-002`'s sibling import chain and predates this matrix.
- The pre-existing kit-intent SKU `S360-KIT-BATH-POE` (introduced by
  `WF-KIT-PRESETS-001`) already exposes that build as a productized,
  recommended bundle preset.
- The room bundle SKU `S360-KIT-BATH-P` describes the *same* customer
  bundle in the *room bundle* namespace. WebFlash deliberately does
  **not** duplicate the kit-preset card under the new `-P` identifier;
  doing so would suggest two parallel installables when there is only
  one.

A future follow-up (not part of WEBFLASH-BUNDLE-SKU-MATRIX-001) may
extend `scripts/data/kit-presets.js` with a presentation-only
cross-reference between the two namespaces if support / diagnostics
work surfaces a need. That decision is out of scope here.

## Hard do-not-change list

WEBFLASH-BUNDLE-SKU-MATRIX-001 is documentation-only. It must not change:

- `manifest.json`
- every `firmware-*.json`
- `firmware/sources.json`
- every firmware binary or `.meta.json` sidecar under `firmware/`
- `scripts/data/kits.json`
- `scripts/data/kit-presets.js`
- `scripts/data/module-requirements.js`
- every other file under `scripts/`
- every workflow under `.github/workflows/`
- the `REQUIRED_CONFIGS` allowlist (sourced from
  `.github/workflows/firmware-publish.yml`)
- the release-channel policy in `scripts/utils/release-channels.js`
- every wizard / UX surface in `index.html` and every file under `css/`
- every test under `__tests__/` (including fixtures)
- `sw.js` (service worker, cache name, precache list)
- `_headers` (CSP, CORS, cache rules)
- the WF-LED-003 preview-channel exposure model
- the FanTRIAC HW-005 block (`block_tokens` on Release-One source stays
  `["FanTRIAC", "LED"]`; on the LED preview source stays
  `["FanTRIAC"]`)
- the WF-TRIAC-001 advanced/manual-warning runtime UX
- the Rescue install path

## Follow-up identifiers (not opened by this PR)

The follow-up PR identifiers reserved by
[`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
(`WF-IMPORT-RELAY-001`, `WF-IMPORT-PWM-001`, `WF-IMPORT-DAC-001`,
`WF-IMPORT-TRIAC-001`, `WF-IMPORT-POWER-400-001`,
`WF-IMPORT-POE-410-001`, `WF-LED-STABLE-001`, `WF-REQUIRED-001`,
`WF-KIT-LED-001`) continue to gate any actual installability change.
WEBFLASH-BUNDLE-SKU-MATRIX-001 does not consume, satisfy, or close any
of those reservations.

If a future PR adds presentation-only room-bundle kit-preset cross-references
into `scripts/data/kit-presets.js`, that PR is a separate change and must
be sequenced behind upstream `BUNDLE-SKU-MATRIX-001` landing and the
relevant kit / `REQUIRED_CONFIGS` decision PRs above. No identifier is
reserved for that follow-up at this time.
