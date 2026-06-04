# WebFlash Import Readiness Matrix (WF-IMPORT-GAP-001)

WF-IMPORT-GAP-001 — the WebFlash-side **import readiness matrix** that
answers when an upstream `sense360store/esphome-public` release artifact
is allowed to enter the WebFlash repo, what *class* of import it would
be, and what runtime exposure that import does and does not unlock.

> WF-IMPORT-GAP-001 is a **documentation / gating PR only.** It imports
> no firmware, regenerates no manifests, edits no
> `firmware/sources.json` entry, changes no `REQUIRED_CONFIGS` value,
> edits no kit, changes no runtime availability, and touches no
> workflow, test, service-worker, or wizard surface. The matrix is the
> *contract* a future import PR must satisfy; the import itself is a
> separate, deliberate follow-up.

## Purpose and scope

The upstream readiness / gating chain has four layers that already
exist (or are landing) in `sense360store/esphome-public`:

1. **PACKAGE-GAP-001** — Package YAML readiness matrix.
2. **PRODUCT-GAP-001** — Product YAML readiness matrix.
3. **WEBFLASH-GAP-001** — WebFlash wrapper / catalog / build readiness
   matrix.
4. **RELEASE-GAP-001** — Release artifact readiness matrix.

WF-IMPORT-GAP-001 is the **fifth layer** and sits in the WebFlash repo.
It answers questions that the upstream chain cannot answer alone:

- Which future upstream artifacts can eventually be imported into
  WebFlash?
- Which are not import-ready because no upstream release artifact
  exists?
- Which are not import-ready because upstream package / product /
  WebFlash-wrapper / release gates are still incomplete?
- Which imports would be **preview-only**?
- Which imports would be **advanced / manual-warning-only**?
- Which imports could ever be **stable**?
- Which imports must **not** become `REQUIRED_CONFIGS` by default?
- Which imports must **not** become a kit / default / recommended
  exposure by default?
- Which follow-up WebFlash import PRs should exist and in what order?

The matrix is presentation-only and reporting-only. It is the
human-readable companion to:

- [`docs/firmware-import.md`](firmware-import.md) — the cross-repo
  import *mechanism*.
- [`docs/product-import-readiness.md`](product-import-readiness.md) +
  [`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js) —
  WF-PRODUCT-004's machine-readable eligibility classifier for upstream
  catalog entries.
- [`docs/led-preview-import-plan.md`](led-preview-import-plan.md) — the
  preview-channel exposure decision worked example
  (WF-LED-001 → WF-LED-002 → WF-LED-003).

WF-PRODUCT-004 answers *catalog → eligibility* (does an upstream
catalog entry pass the four-dimensional eligibility filter?).
WF-IMPORT-GAP-001 answers *eligibility → import sequencing* (given
that an upstream entry is eligible, what is the **next allowed
import action**, what **class** of import is it, and what runtime
exposure does it unlock — or, more often, what runtime exposure does
it deliberately **not** unlock?).

## Core rule

A firmware artifact may be imported into the WebFlash repo **only
after all of the following gates are satisfied**:

1. **Hardware evidence and pin / package mapping** are adequate for
   the intended exposure class (stable needs more than preview;
   preview needs more than docs-only).
2. **Package YAML** is ready upstream (PACKAGE-GAP-001).
3. **Product YAML** exists and is approved upstream (PRODUCT-GAP-001).
4. **WebFlash wrapper / catalog / build entry** exists upstream
   (WEBFLASH-GAP-001) with `webflash_build_matrix: true`.
5. **Release artifact** exists upstream (RELEASE-GAP-001) — a real
   GitHub Release with the artifact `.bin` attached.
6. **Artifact name, version, channel, and checksum** are valid and
   match the upstream `checksums-sha256.txt` (and the
   `expected_sha256` pin in `firmware/sources.json` when WF-LED-002's
   hardening applies).
7. **Release notes and release proof** are valid (four canonical H2
   sections: `Changelog`, `Known Issues`, `Features`, `Hardware
   Requirements`).
8. **Import-readiness checks pass** — the
   [`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js)
   classifier (WF-PRODUCT-004) reports the entry as
   `import-eligible: true` for its intended class.
9. **The WebFlash exposure class is explicit.** Every import must be
   declared as exactly one of:
   - `stable`
   - `preview`
   - `advanced / manual-warning`
   - `rescue`
   - `docs-only / manual YAML`
   - `legacy-only`
   - `none`
10. **WebFlash runtime policy agrees with the import.** Imports
    interact with these surfaces, and every one must be deliberately
    decided per import:
    - `REQUIRED_CONFIGS` (production-only allowlist)
    - kits (`scripts/data/kits.json`)
    - recommended paths
    - preview acknowledgements
    - advanced / manual-warning gates
    - stale-data cleanup
    - service-worker / cache surface
    - manifest generation

Four separation invariants travel with every row of this matrix:

- **Release artifact existence does not automatically mean WebFlash
  import.** The upstream artifact existing is a *necessary* gate, not
  a *sufficient* one.
- **WebFlash import does not automatically mean `REQUIRED_CONFIGS`.**
  The publish-time allowlist is a separate, deliberate, production-
  only decision.
- **WebFlash import does not automatically mean kit / recommended /
  default exposure.** Kit + recommended + default selection are
  customer-facing UX decisions that follow import, never replace it.
- **Advanced / manual-warning import is not a compliance
  certification claim.** Surfacing FanTRIAC (or any future advanced
  build) behind an acknowledgement gate is an in-installer warning,
  not regulatory clearance.

## Status vocabulary

Every cell in the candidate table and every per-family posture
section uses **only** the policy-level labels below. The vocabulary is
deliberately flat (no nested taxonomy) and policy-only (no firmware
or manifest is touched by this PR):

- `not-import-ready` — at least one of the ten core-rule gates is
  unsatisfied; no import action is currently allowed.
- `missing-upstream-release-artifact` — no upstream GitHub Release
  carries the required `.bin`.
- `missing-upstream-build-matrix` — upstream catalog entry has
  `webflash_build_matrix: false` (or the field is absent).
- `missing-upstream-webflash-wrapper` — upstream catalog entry has
  no `webflash_wrapper` reference (WEBFLASH-GAP-001 incomplete).
- `missing-upstream-product-yaml` — upstream product YAML is absent
  or unapproved (PRODUCT-GAP-001 incomplete).
- `missing-upstream-package-readiness` — upstream package YAML is
  not in a ready state (PACKAGE-GAP-001 incomplete).
- `missing-hardware-evidence` — hardware verification / bench / pin
  mapping is insufficient for the intended exposure class.
- `preview-import-candidate` — when upstream gates complete, this
  family may be imported on `channel: preview` only.
- `advanced/manual-warning-import-only` — when upstream gates and
  WebFlash runtime UX both land, this family may be imported only
  behind an advanced-warning acknowledgement gate.
- `stable-import-candidate-after-promotion` — preview-imported
  today (or eligible to be), may be promoted to stable only after
  the matching upstream promotion **and** bench / release-proof
  gate.
- `stable-not-approved` — stable import is not currently approved;
  catalog status is not `production`, or bench evidence is missing.
- `not-required-configs` — by default, this import must **not**
  enter `REQUIRED_CONFIGS`. A separate deliberate PR is required to
  change that.
- `not-recommended` — by default, this import must **not** be the
  recommended / default-selected build.
- `not-kit-default` — by default, this import must **not** be
  surfaced as a kit or as the kit default.
- `preview-acknowledgement-required` — install gates on the
  existing `channel:preview` acknowledgement model
  (`scripts/utils/release-channels.js`).
- `advanced-warning-required` — install gates on an advanced /
  manual-warning acknowledgement. **Live** as of
  [WF-TRIAC-001](wizard-ux-roadmap.md#wf-triac-001--landed)
  (`scripts/utils/module-availability.js` exposes the
  `advanced-manual-warning` state; `scripts/state.js` enforces a
  per-`(module,variant)` acknowledgement orthogonal to the
  release-channel acknowledgement model). Currently scopes to
  `fan=triac` only.
- `release-proof-required` — the upstream release notes + asset +
  checksum proof model must be satisfied before import.
- `import-readiness-required` — WF-PRODUCT-004
  ([`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js))
  must report `import-eligible: true` for this entry before import.
- `docs-only` — currently appears only in docs / planning; no
  firmware, manifest, source, kit, or runtime surface change.
- `legacy-only` — supported in URL share-link aliases / runtime
  back-compat layers only; not a path for new imports.
- `rescue-only` — recovery / unbrick path; lives in
  `firmware/rescue/`, not `firmware/configurations/`.
- `blocked-from-standard-import` — explicitly blocked under an
  upstream block (e.g. FanTRIAC HW-005 + COMPLIANCE-001) regardless
  of release-artifact availability.
- `unknown` — classification cannot be assigned with current
  evidence; treated as `not-import-ready` until evidence lands.

## Import classes

Every candidate row in this matrix lands in exactly one of the
following classes. The class is not a channel — it is the *posture*
the import inherits when (or if) it eventually lands.

| Class | Meaning |
|---|---|
| `none` | No import path is currently planned. The family may live in `module-availability.js` as `no-firmware` / `design-pending` / `blocked`, but no `firmware/sources.json` declaration exists or is intended. |
| `docs-only / manual YAML only` | The family is mentioned in planning docs (or in upstream product YAML) but is not a candidate for the WebFlash importer. |
| `preview import candidate` | When upstream release proof + product / wrapper gates clear, this family may be imported on `channel: preview` and surfaced behind the existing preview acknowledgement model. Never auto-selected, never `REQUIRED_CONFIGS`, never a default kit. |
| `advanced / manual-warning import only` | The family may be imported only behind an explicit advanced-warning acknowledgement gate (future runtime UX). Not default-selectable, never `REQUIRED_CONFIGS`, never a default kit. Advanced / manual-warning is **not** a compliance certification claim. |
| `stable import candidate after promotion` | The family is preview-import-eligible (or already preview-imported) and may be promoted to `channel: stable` only after the matching upstream promotion to `status: production` **and** bench / release-proof clearance. |
| `stable import` | Already imported as `channel: stable`. Today: Release-One only. |
| `rescue import` | Lives in `firmware/rescue/` with its own manifest; the rescue flow is separate from the product wizard. Today: the WebFlash-owned Rescue build only. |
| `legacy-only` | Survives only as URL alias / back-compat plumbing; not a path for new imports. |

The four reminders from [Core rule](#core-rule) repeat here, scoped
to import classes:

- Preview import does **not** mean stable.
- Stable import does **not** automatically mean `REQUIRED_CONFIGS`.
- Imported firmware does **not** automatically mean kit / recommended
  / default exposure.
- Advanced / manual-warning import does **not** mean compliance
  certification.

## Current WebFlash import surface

Three live builds, pinned by [`manifest.json`](../manifest.json) +
the three per-build manifests + [`firmware/sources.json`](../firmware/sources.json).
This table records *what is already imported*, not what could be.

| `config_string` | Asset | Channel | Source entry | In `REQUIRED_CONFIGS`? | In `kits.json`? | Preview ack? |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `Ceiling-POE-VentIQ-RoomIQ` | `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` | `stable` | yes (`v1.0.0`, `block_tokens: ["FanTRIAC", "LED"]`) | ✅ | ✅ (`S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`) | — |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin` | `preview` | yes (`v1.0.0-led-preview`, `expected_sha256` pinned, `block_tokens: ["FanTRIAC"]`) | ❌ (intentional under WF-LED-003) | ❌ (intentional under WF-LED-003) | ✅ required |
| `Rescue` | `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin` | `rescue` | n/a (WebFlash-owned) | ✅ (named exemption) | n/a | n/a |

`REQUIRED_CONFIGS` at the time of this matrix (the source of truth
is the `REQUIRED_CONFIGS=( … )` array in
[`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml)):

```
REQUIRED_CONFIGS=(
  "Ceiling-POE-VentIQ-RoomIQ"
  "Rescue"
)
```

Kit surface at the time of this matrix
([`scripts/data/kits.json`](../scripts/data/kits.json)): one kit
(`S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`) mapping to the Release-One
`config_string`. No LED kit. No FanTRIAC kit. No Relay / PWM / DAC /
AirIQ / 240V-PSU kit.

Module-availability surface today
([`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js),
WF-WIZARD-AVAIL-001, amended by [WF-TRIAC-001](wizard-ux-roadmap.md#wf-triac-001--landed)):

- `Sense360 RoomIQ` (S360-200) → `available-stable`
- `Sense360 VentIQ` (S360-211) → `available-stable`
- `Sense360 LED` (S360-300) → `available-preview`
- `Sense360 AirIQ` (S360-210) → `available-preview` (WF-PREVIEW-IMPORT-FIRST-BATCH-001 — `Ceiling-POE-AirIQ-RoomIQ` preview build imported)
- `Sense360 Relay` (S360-310) → `available-preview` (WEBFLASH-RELAY-001 — FanRelay manual-preview build imported)
- `Sense360 PWM` (S360-311) → `available-preview` (WEBFLASH-PWM-001 — FanPWM manual-preview build imported)
- `Sense360 DAC` (S360-312) → `available-preview` (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — FanDAC manual-preview build imported)
- `Sense360 TRIAC` (S360-320) → `advanced-manual-warning` (per WF-TRIAC-001 — visible + selectable in the custom path, gated by an inline acknowledgement; install still blocked because no FanTRIAC artifact has been imported)
- Voice → `legacy-only`

This matrix does not modify any of those classifications. It records
the **import-side** counterpart to those runtime states.

## Candidate import table

Each row is a *future* import family. The "Allowed import action
now" column is the only column that records what may happen as a
result of WF-IMPORT-GAP-001 (the answer is **none** for every
non-imported row — this PR imports nothing). The remaining columns
describe the contract a future per-family import PR must satisfy.

| Candidate family | Required upstream release | Current upstream gate status | Current WebFlash source / import status | Current manifest status | Allowed import action now | Future import class | `REQUIRED_CONFIGS` eligibility | Kit / recommended eligibility | Runtime UX gate | Follow-up owner |
|---|---|---|---|---|:---:|---|---|---|---|---|
| Relay / S360-310 | upstream `v1.0.0-preview` artifact + #711 `webflash_import_eligibility.eligible=true` | **import-eligible** via #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`); catalog `status: hardware-pending` + `webflash_build_matrix: false` (stable / full release still blocked) | **imported** — `firmware/sources.json` FanRelay preview source (`block_tokens: ["FanTRIAC", "LED"]`) | **present** — `Ceiling-POE-VentIQ-FanRelay-RoomIQ` preview build | **imported (WEBFLASH-RELAY-001)** | `preview import` (landed) | `not-required-configs` | `not-kit-default`, `not-recommended` | `preview-acknowledgement-required` (live) | **WEBFLASH-RELAY-001 — landed** |
| PWM / S360-311 | upstream `v1.0.0-preview` artifact + #711 `webflash_import_eligibility.eligible=true` | **import-eligible** via #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`); catalog `status: hardware-pending` + `webflash_build_matrix: false` (stable / full release still blocked on measured current / thermal evidence) | **imported** — `firmware/sources.json` FanPWM preview source (`block_tokens: ["FanTRIAC", "LED"]`) | **present** — `Ceiling-POE-FanPWM` preview build | **imported (WEBFLASH-PWM-001)** | `preview import` (landed) | `not-required-configs` | `not-kit-default`, `not-recommended` | `preview-acknowledgement-required` (live) | **WEBFLASH-PWM-001 — landed** |
| DAC / S360-312 | upstream `v1.0.0-preview` artifact + #711 `webflash_import_eligibility.eligible=true` | **import-eligible** via #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`); catalog `status: hardware-pending` + `webflash_build_matrix: false` (stable / full release still blocked on Cloudlift S12 / J3 harness + product-bench evidence + S360-312 schematic / BOM); FanDAC ↔ AirIQ mutex remains wizard policy | **imported** — `firmware/sources.json` FanDAC preview source (`block_tokens: ["FanTRIAC", "LED"]`) | **present** — `Ceiling-POE-FanDAC` preview build | **imported (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001)** | `preview import` (landed) | `not-required-configs` | `not-kit-default`, `not-recommended` | `preview-acknowledgement-required` (live) | **WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — landed** (was `WF-IMPORT-DAC-001`) |
| TRIAC / S360-320 | `RELEASE-TRIAC-001` | `blocked-from-standard-import` at the importer layer under HW-005 + COMPLIANCE-001; S360-320-R4 schematic exists but mains-side compliance and timing evidence incomplete; `firmware/sources.json` `block_tokens` keeps `FanTRIAC` excluded from every active source. Wizard-side runtime UX precondition satisfied by [WF-TRIAC-001](wizard-ux-roadmap.md#wf-triac-001--landed) (`advanced-manual-warning` availability state + inline ack region). | none (FanTRIAC import-blocked) | none | **none** | `advanced / manual-warning import only` (runtime UX live, upstream gate pending) | `not-required-configs` (never by default) | `not-kit-default`, `not-recommended` (never by default) | `advanced-warning-required` (live — WF-TRIAC-001) | `WF-IMPORT-TRIAC-001` after `RELEASE-TRIAC-001`; `WF-TRIAC-001` runtime UX precondition satisfied |
| Power / S360-400 (240V PSU) | `RELEASE-POWER-400-001` | `missing-upstream-release-artifact`, `missing-upstream-product-yaml`, `missing-hardware-evidence` | none (no `pwr` config_string in `manifest.json`) | none | **none** | `none` until evidence + product / release gates land; thereafter likely `preview import candidate` | `not-required-configs` | `not-kit-default`, `not-recommended` | `preview-acknowledgement-required` (provisional) | `WF-IMPORT-POWER-400-001` after `RELEASE-POWER-400-001` |
| PoE / S360-410 | n/a — already covered | already shipped *as part of* Release-One (`Ceiling-POE-VentIQ-RoomIQ`) and the LED preview (`Ceiling-POE-VentIQ-RoomIQ-LED`) via the `power=poe` config segment | covered transitively by the Release-One + LED preview source entries | covered transitively (no separate `S360-410`-named build) | **none** (no separate import action in this PR; no separate import action planned unless upstream ships a PoE-PSU-specific image) | not a distinct import class today | n/a (Release-One already in `REQUIRED_CONFIGS`) | n/a (Release-One already a kit) | n/a | `WF-IMPORT-POE-410-001` reserved (expected no-op unless upstream ships a PoE-PSU-specific image) |
| LED stable | `RELEASE-007` | `missing-upstream-release-artifact` for `status: production` LED catalog entry; upstream currently `status: preview` only; bench evidence (`S360-300-BENCH-001`) pending | LED preview source entry exists (`v1.0.0-led-preview`); no separate stable source entry | LED preview build present; no LED stable build | **none** | `stable import candidate after promotion` | `not-required-configs` (until upstream `status: production` **and** a deliberate `WF-REQUIRED-001`-class PR) | `not-kit-default`, `not-recommended` (until upstream promotes and a deliberate `WF-KIT-LED-001` PR lands) | `preview-acknowledgement-required` (today) → potentially removed only after stable promotion + kit / recommended decision | `WF-LED-STABLE-001` after `RELEASE-007` and `S360-300-BENCH-001` |
| AirIQ / S360-210 | upstream AirIQ release (identifier TBD) | `missing-upstream-release-artifact`; documented hardware, no current build; AirIQ ↔ VentIQ mutex is settled wizard policy | none | none | **none** | `preview import candidate` (after gates) | `not-required-configs` | `not-kit-default`, `not-recommended` | `preview-acknowledgement-required` | reserved — no `WF-IMPORT-AIRIQ-001` identifier assigned by this matrix; a future PR may number it deliberately |
| Full-composition fan-control **room bundles** (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `Ceiling-POE-VentIQ-FanDAC-RoomIQ`, `Ceiling-POE-AirIQ-FanRelay-RoomIQ`, `Ceiling-POE-AirIQ-FanPWM-RoomIQ`, `Ceiling-POE-AirIQ-FanDAC-RoomIQ`) | upstream full-composition fan bundle **compile + publish** (per `ROOM-BUNDLE-FAN-CONFIGS-001` / #713) | **compile-pending / no artifact** — #713 added the five product YAMLs but published no firmware (`compile_validation_status: pending-ci`, `buildable-preview-compile-pending`, no `.bin`, no release, catalog `status: hardware-pending`). FanDAC variants additionally gated on `FANDAC-I2C-ADDR-001` (GP8403 IC1 `0x58` / IC2 `0x5A`; `0x59` forbidden with VentIQ/AirIQ) — bench-verification PENDING. | none (no source entry) | none (no manifest build) | **none** | `preview import candidate` (after upstream compile + publish + a WebFlash firmware-import PR) | `not-required-configs` | `not-kit-default`, `not-recommended` | `preview-acknowledgement-required` + `fan-control-acknowledgement-required` (+ `analog-fan-address-switch-acknowledgement-required` for the two DAC variants) — **all staged + tested under WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001; expected import shape staged + tested under WF-FAN-BUNDLE-IMPORT-READINESS-001** | `WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001` (declares the bundles + import-readiness gate; imports nothing) → `WF-FAN-BUNDLE-IMPORT-READINESS-001` (declares the expected artifact name + source-entry skeleton + readiness checks; imports nothing) → `WF-IMPORT-FAN-BUNDLES-001` (the future per-config firmware-import PR, after upstream compile/publish). |

The "Allowed import action now" column is uniformly **none** across
every non-imported row because WF-IMPORT-GAP-001 is documentation
only. Per-family postures below expand each row.

> **Fan-control room-bundle exposure (WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001).**
> The Simple-install bundle picker now *declares* the five full-composition
> fan-control room bundles and gates them on the live manifest
> (`getExposableFanControlBundles` in
> [`scripts/data/simple-bundles.js`](../scripts/data/simple-bundles.js)): a card
> appears only when the exact firmware `config_string` is present in
> `manifest.json` — which only happens after a firmware-import PR fetches the
> signed `.bin`, writes the `.meta.json` sidecar, pins the SHA-256 in
> `firmware/sources.json`, and regenerates the manifest. As of this PR **none of
> the five firmware configs is compiled, published, or imported**, so no card is
> exposed and the picker shows exactly the six base bundles. TRIAC remains
> excluded from this lane. See
> [`docs/live-smoke-easy-bundle-picker-fan-expansion.md`](live-smoke-easy-bundle-picker-fan-expansion.md).
>
> **Fan-control room-bundle import readiness (WF-FAN-BUNDLE-IMPORT-READINESS-001).**
> Upstream then recorded compile proof for the five full-composition fan bundles
> (`ROOM-BUNDLE-FAN-CONFIGS-001` follow-ups, upstream #716) and planned their
> publication (upstream #717) — but **still published no artifact**, so nothing
> is imported and every card stays hidden. WF-FAN-BUNDLE-IMPORT-READINESS-001 is a
> **readiness-prep slice** (docs + tests + a non-runtime readiness descriptor at
> [`scripts/data/fan-bundle-import-readiness.js`](../scripts/data/fan-bundle-import-readiness.js)):
> it declares, per future artifact, the **expected `config_string`, the expected
> canonical artifact filename + `.meta.json` sidecar, the expected `channel:
> preview`, the expected `block_tokens: ["FanTRIAC", "LED"]`, the full room-bundle
> flag, the Simple-picker card gate, and the required acknowledgements** (preview +
> fan-control, plus the analog address-switch acknowledgement for the two FanDAC
> bundles), and a ready-to-fill `firmware/sources.json` source-entry skeleton with
> everything **except** the human-pinned `expected_sha256`. It imports no firmware,
> edits no `manifest.json` / `firmware/sources.json`, changes no `REQUIRED_CONFIGS`,
> and exposes no card; it only makes the future per-config import PR small and
> mechanical. See
> [Full-composition fan-control room bundles import posture](#full-composition-fan-control-room-bundles-import-posture).

## Relay / S360-310 import posture

- **Landed (WEBFLASH-RELAY-001):** `module-availability.js` now classifies
  Relay as `available-preview`. A FanRelay manual-preview build
  (`Ceiling-POE-VentIQ-FanRelay-RoomIQ`) has been imported from upstream
  `v1.0.0-preview` and is present in `firmware/sources.json` +
  `manifest.json`. The import was authorised **not** by a catalog
  `status: preview` promotion but by upstream #711
  (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`), which set
  `webflash_import_eligibility.eligible=true` in
  `config/preview-release-targets.json` while keeping the catalog status
  `hardware-pending` and `webflash_build_matrix: false` (no committed
  upstream build row). WebFlash's catalog-alignment guard +
  `scripts/validate-product-import-readiness.js` recognise that explicit
  flag for import / manifest / kit eligibility (via the manual-preview
  lane), never for `REQUIRED_CONFIGS`.
- **Allowed import action now:** done — the FanRelay preview is imported as
  an Advanced-install-only, acknowledgement-gated build.
- **Future import class:** `preview import` (landed). Stable / full release
  stays blocked on the mains-safety / installation-approval / creepage /
  clearance evidence + competent-person sign-off + GPIO3 strap-pin boot
  characterisation recorded in the upstream `stable_blocker`.
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs`. The preview
  import does **not** make Relay `REQUIRED_CONFIGS`-eligible — that requires
  upstream promoting the catalog entry to `status: production` *and* a
  deliberate `WF-REQUIRED-001`-class PR.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` by default. A Relay kit is a separate UX /
  product decision and is not pre-decided here.
- **Runtime UX gate:** `preview-acknowledgement-required` (existing
  `scripts/utils/release-channels.js` model). No new mode toggle
  needed for a preview import.
- **Follow-up owner:** `WF-IMPORT-RELAY-001` lands only after
  `RELEASE-RELAY-001`. It must (a) declare a Relay source entry in
  `firmware/sources.json` with appropriate `block_tokens`, (b) run
  the importer, (c) regenerate `manifest.json` + the relevant
  `firmware-N.json`, (d) leave `REQUIRED_CONFIGS` and kits
  unchanged, (e) preserve the WF-LED-003 preview acknowledgement
  contract.

## PWM / S360-311 import posture

- **Landed (WEBFLASH-PWM-001):** `module-availability.js` now classifies
  PWM as `available-preview`. A FanPWM manual-preview build
  (`Ceiling-POE-FanPWM`) has been imported from upstream `v1.0.0-preview`
  and is present in `firmware/sources.json` + `manifest.json`. As with
  FanRelay, the import was authorised **not** by a catalog `status: preview`
  promotion but by upstream #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`),
  which set `webflash_import_eligibility.eligible=true` in
  `config/preview-release-targets.json` while keeping the catalog status
  `hardware-pending` and `webflash_build_matrix: false`. WebFlash's
  catalog-alignment guard + `scripts/validate-product-import-readiness.js`
  recognise that flag for import / manifest / kit eligibility (via the
  manual-preview lane), never for `REQUIRED_CONFIGS`.
- **Allowed import action now:** done — the FanPWM preview is imported as
  an Advanced-install-only, acknowledgement-gated build.
- **Future import class:** `preview import` (landed). Stable / full release
  stays blocked on the measured current / thermal evidence recorded in the
  upstream `stable_blocker`; RPM / TachIO is not claimed.
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs`. The preview
  import does **not** make PWM `REQUIRED_CONFIGS`-eligible — that requires
  upstream promoting the catalog entry to `status: production` *and* a
  deliberate `WF-REQUIRED-001`-class PR.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` by default.
- **Runtime UX gate:** `preview-acknowledgement-required` (live).
- **Follow-up owner:** **WEBFLASH-PWM-001 (a.k.a. WF-IMPORT-PWM-001) — landed.**

## DAC / S360-312 import posture

- **Landed (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001):**
  `module-availability.js` now classifies DAC as `available-preview`.
  A FanDAC manual-preview build (`Ceiling-POE-FanDAC`) has been
  imported from upstream `v1.0.0-preview` and is present in
  `firmware/sources.json` + `manifest.json`. As with FanRelay /
  FanPWM, the import was authorised **not** by a catalog
  `status: preview` promotion but by upstream #711
  (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`)'s
  `webflash_import_eligibility.eligible=true` signal while the catalog
  status stays `hardware-pending` and `webflash_build_matrix: false`.
  The import was performed by the preview-eligible import automation
  ([`scripts/import-preview-eligible-sources.py`](../scripts/import-preview-eligible-sources.py)),
  not a one-off run. The FanDAC ↔ AirIQ DAC-bus mutex remains a wizard
  policy concern, enforced through `module-requirements.js`
  conflict-pair plumbing (unchanged by this PR).
- **Allowed import action now:** done — the FanDAC preview is imported as
  an Advanced-install-only, acknowledgement-gated build.
- **Future import class:** `preview import` (landed). Stable / full release
  stays blocked on Cloudlift S12 / J3 harness + product-bench evidence and
  the S360-312 schematic / BOM recorded in the upstream `stable_blocker`.
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs`. The preview
  import does **not** make DAC `REQUIRED_CONFIGS`-eligible.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` by default.
- **Runtime UX gate:** `preview-acknowledgement-required` (live). The
  FanDAC ↔ AirIQ mutex must continue to be enforced by the
  existing runtime gating — the DAC import does **not** unlock
  simultaneous DAC + AirIQ.
- **Follow-up owner:** **WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001
  (a.k.a. WF-IMPORT-DAC-001) — landed.** Full import-proof at
  [`docs/preview-import-automation-proof.md`](preview-import-automation-proof.md).

## TRIAC / S360-320 import posture

- **Today (post-WF-TRIAC-001):** `module-availability.js` classifies
  TRIAC as `advanced-manual-warning` under HW-005 + COMPLIANCE-001
  (the eighth availability state, added by
  [WF-TRIAC-001](wizard-ux-roadmap.md#wf-triac-001--landed)). The
  wizard renders TRIAC with the `is-advanced-warning` affordance —
  visible AND selectable in the custom path, paired with an inline
  `[data-advanced-warning-region]` warning + acknowledgement
  checkbox. The runtime UX precondition for `WF-IMPORT-TRIAC-001`
  is therefore satisfied; the import precondition is **not**. Every
  active `firmware/sources.json` source still carries `FanTRIAC` in
  `block_tokens`; the Release-One source additionally carries `LED`
  in `block_tokens`; the LED preview source carries only `FanTRIAC`.
  `__tests__/manifest-health.test.js` fails CI if a `FanTRIAC`
  token ever appears in a generated `config_string`.
- **Allowed import action now:** none. TRIAC remains
  `blocked-from-standard-import`. WF-TRIAC-001 imported nothing,
  added no manifest entry, added no source, added no kit, did not
  modify `REQUIRED_CONFIGS`, and did not unblock the importer's
  `block_tokens` enforcement.
- **Future import class:** `advanced / manual-warning import
  only`. TRIAC will never enter the standard preview / stable
  channels at import time; the only sanctioned future surface is
  behind the wizard's advanced-warning acknowledgement gate
  (WF-TRIAC-001's runtime UX, now live).
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs`
  (**never by default**). Even an advanced / manual-warning
  TRIAC build is `not-required-configs` until a separate,
  explicit `WF-REQUIRED-001`-class PR with compliance evidence
  changes that policy.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` (**never by default**). TRIAC is never a
  default kit; it is never recommended; it is never auto-selected.
- **Compliance disclaimer:** the advanced / manual-warning class
  is an *in-installer warning gate*, not a compliance
  certification claim. The matrix records this explicitly so a
  future TRIAC import PR cannot conflate the two. WF-TRIAC-001's
  wizard copy makes the same disclaimer customer-facing:
  *"not compliance-certified by WebFlash."*
- **Runtime UX gate:** `advanced-warning-required` — **landed**
  by WF-TRIAC-001. The wizard now exposes an inline
  per-`(module,variant)` acknowledgement that the install gate
  in `scripts/state.js` (`getOutstandingAdvancedWarningAcknowledgements`)
  enforces. The gate is **orthogonal** to the channel
  acknowledgements (preview / beta / development / deprecated) —
  the WF-LED-003 preview model is unchanged. The existing
  preview-channel acknowledgement remains **insufficient** for a
  TRIAC import; `WF-IMPORT-TRIAC-001` will reuse the
  advanced-warning ack model, not the preview one.
- **Follow-up owner:** `WF-IMPORT-TRIAC-001` after
  `RELEASE-TRIAC-001` upstream. The `WF-TRIAC-001` runtime UX
  precondition is satisfied; the missing precondition is the
  upstream release artifact. When that lands, the per-family
  import PR (a) declares a TRIAC source entry in
  `firmware/sources.json` with appropriate `block_tokens`,
  (b) runs the importer, (c) regenerates `manifest.json` + the
  relevant `firmware-N.json`, (d) keeps the artifact off
  `REQUIRED_CONFIGS`, (e) keeps the artifact out of
  `scripts/data/kits.json`, (f) reuses the WF-TRIAC-001 ack
  surface (no new acknowledgement plumbing required).

## Power / S360-400 (240V PSU) import posture

- **Today:** No `pwr` config_string exists in `manifest.json` — the
  wizard exposes the 240V PSU through the `power` selection, but no
  current Release-One artifact targets the mains-PSU power path.
  No upstream release artifact for the mains-PSU image, no upstream
  product YAML, no hardware evidence captured in the WebFlash repo.
- **Allowed import action now:** none.
- **Future import class:** `none` until upstream package / product
  / wrapper / release gates land. After that, the family is
  expected to follow the `preview import candidate` path before
  any stable promotion.
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs` by
  default.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` by default.
- **Runtime UX gate:** `preview-acknowledgement-required`
  (provisional, assuming the family takes the standard preview
  route when its gates eventually clear).
- **Follow-up owner:** `WF-IMPORT-POWER-400-001` after
  `RELEASE-POWER-400-001`.

## PoE / S360-410 import posture

- **Today:** S360-410 is **already covered** by the existing
  Release-One artifact (`Ceiling-POE-VentIQ-RoomIQ`) and the LED
  preview artifact (`Ceiling-POE-VentIQ-RoomIQ-LED`), both of which
  carry the `POE` config-string segment. The PoE PSU is surfaced
  through the wizard's `power` selection (`poe`) rather than as its
  own module entry, and the same upstream Release-One artifact
  satisfies the PoE-powered install path. `module-availability.js`
  does not classify S360-410 directly; the runtime treats the PoE
  PSU as a power-source choice rather than an installable module.
- **Allowed import action now:** **none**. WF-IMPORT-GAP-001 does
  **not** create a separate PoE import action because no separate
  artifact is needed.
- **Future import class:** not a distinct import class today.
- **`REQUIRED_CONFIGS` eligibility:** n/a — `Ceiling-POE-VentIQ-RoomIQ`
  is already in `REQUIRED_CONFIGS` and remains there unchanged by
  this matrix.
- **Kit / recommended eligibility:** n/a — the existing
  `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` kit already maps to the
  PoE-powered Release-One config.
- **Runtime UX gate:** n/a — install gating for PoE-powered builds
  is whatever the matching `config_string` requires (stable for
  Release-One; preview-ack for the LED preview).
- **Follow-up owner:** `WF-IMPORT-POE-410-001` is **reserved** but
  expected to remain a no-op unless upstream ships a PoE-PSU-
  specific image distinct from the current PoE-powered Release-One
  artifact. If that ever happens, the slot exists; otherwise it
  stays unused.

## LED stable import posture

- **Today:** LED is present in the WebFlash repo **only** as a
  preview build (`Ceiling-POE-VentIQ-RoomIQ-LED`, `channel:
  preview`, gated by `channel:preview` acknowledgement under
  WF-LED-003). Upstream `sense360store/esphome-public` classifies
  the LED catalog entry as `status: preview`. No LED stable
  artifact exists upstream; no separate stable source entry
  appears in `firmware/sources.json`. Bench evidence
  (`S360-300-BENCH-001`) and the release-proof gate (`RELEASE-007`)
  are both pending.
- **Allowed import action now:** none. `WF-IMPORT-GAP-001` does
  **not** promote LED to stable, does **not** import an LED stable
  build, does **not** modify the LED preview source entry or
  manifest build, and does **not** change the LED preview
  acknowledgement contract.
- **Future import class:** `stable import candidate after
  promotion`. The class transition (preview → stable) is a
  **separate** PR (`WF-LED-STABLE-001`), gated on **both**
  upstream promotion to `status: production` **and** bench /
  release-proof clearance.
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs`
  automatically. Even after LED is imported as stable, adding it
  to `REQUIRED_CONFIGS` is a further deliberate PR (the
  `WF-REQUIRED-001`-class decision); see
  [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md)
  for the production-only rule.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` automatically. An LED kit is its own decision
  (`WF-KIT-LED-001`) and is not pre-decided here.
- **Runtime UX gate (today):** `preview-acknowledgement-required`
  (the LED preview gate stays on under WF-LED-003).
- **Runtime UX gate (future stable):** removal of the preview
  acknowledgement for the stable LED build only — and only after
  the upstream promotion **and** the bench / release-proof gate
  **and** the deliberate kit / recommended decision land.
- **Follow-up owner:** `WF-LED-STABLE-001` after `RELEASE-007`
  and `S360-300-BENCH-001`.

## AirIQ / S360-210 import posture

- **Today:** `module-availability.js` classifies AirIQ as
  `no-firmware`. Hardware is documented (CO₂ SCD41, VOC SGP41, gas
  MICS-4514, optional SPS30 / SFA30), but no upstream release
  artifact carries an AirIQ-bearing `.bin`, no upstream product /
  wrapper gates have completed for a `Ceiling-*-AirIQ-*` family,
  and no `firmware/sources.json` declaration exists. The
  AirIQ ↔ VentIQ mutex (driven by the wizard's Bathroom toggle on
  Ceiling mounts) is settled policy and is enforced by the
  existing wizard plumbing.
- **Allowed import action now:** none.
- **Future import class:** `preview import candidate` (after
  the upstream gates clear).
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs` by
  default.
- **Kit / recommended eligibility:** `not-kit-default`,
  `not-recommended` by default.
- **Runtime UX gate:** `preview-acknowledgement-required`.
  Any AirIQ import must continue to honour the AirIQ ↔ VentIQ
  mutex.
- **Follow-up owner:** **no `WF-IMPORT-AIRIQ-001` identifier is
  assigned by this matrix.** AirIQ is a candidate family without
  numbered scheduling — a future PR may number it deliberately
  when the upstream package / product / release gates begin to
  resolve. Listing AirIQ here records the candidate; it does not
  pre-commit a PR slot.

## Full-composition fan-control room bundles import posture

The five full-composition fan-control **room bundles**
(`Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `Ceiling-POE-VentIQ-FanDAC-RoomIQ`,
`Ceiling-POE-AirIQ-FanRelay-RoomIQ`, `Ceiling-POE-AirIQ-FanPWM-RoomIQ`,
`Ceiling-POE-AirIQ-FanDAC-RoomIQ`) each carry the room-sensing hardware
(RoomIQ + a room air sensor: VentIQ or AirIQ) **and** a fan driver. They
are distinct from the standalone fan-only previews
(`Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC`), which are Advanced-install-only
and never a Simple-install bundle.

- **Today:** **declared, gated, and now import-ready-checked, but not
  imported.** WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 declared the five
  bundles in [`scripts/data/simple-bundles.js`](../scripts/data/simple-bundles.js)
  and gated them on the live manifest (`getExposableFanControlBundles`).
  Upstream recorded compile proof (upstream #716) and planned publication
  (upstream #717), but published **no `.bin`, no release asset, no checksum**,
  so none of the five `config_string` values is in `manifest.json` and every
  card stays hidden — the picker shows exactly the six base bundles.
- **WF-FAN-BUNDLE-IMPORT-READINESS-001 (readiness prep, this PR):** added the
  non-runtime readiness descriptor
  [`scripts/data/fan-bundle-import-readiness.js`](../scripts/data/fan-bundle-import-readiness.js)
  + the test pin
  [`__tests__/wf-fan-bundle-import-readiness.test.js`](../__tests__/wf-fan-bundle-import-readiness.test.js).
  For each future artifact it declares the **expected `config_string`**, the
  **expected canonical artifact filename** (`Sense360-<config>-v1.0.0-preview.bin`,
  naming-policy conformant) + `.meta.json` sidecar, the **expected
  `channel: preview`**, the **expected `block_tokens: ["FanTRIAC", "LED"]`**, the
  **full room-bundle flag**, the **Simple-picker card gate**, and the **required
  acknowledgements** (preview + fan-control, plus the analog address-switch
  acknowledgement — naming `0x58` / `0x5A` / forbidden `0x59` — for the two FanDAC
  bundles). It also produces a ready-to-fill `firmware/sources.json` source-entry
  skeleton with everything **except** the human-pinned `expected_sha256`.
- **Allowed import action now:** none. WF-FAN-BUNDLE-IMPORT-READINESS-001
  imports no firmware, edits no `manifest.json` / `firmware/sources.json`,
  changes no `REQUIRED_CONFIGS`, adds no kit, and exposes no card.
- **Expected artifact filenames** (the future import PR confirms these against
  the real published artifacts):

  | Bundle SKU | `config_string` | Expected artifact | Acknowledgements |
  |---|---|---|---|
  | `S360-KIT-BATH-P-PWM` | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` | preview + fan-control |
  | `S360-KIT-BATH-P-DAC` | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` | preview + fan-control + address-switch |
  | `S360-KIT-KITCHEN-P-REL` | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanRelay-RoomIQ-v1.0.0-preview.bin` | preview + fan-control |
  | `S360-KIT-KITCHEN-P-PWM` | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` | preview + fan-control |
  | `S360-KIT-KITCHEN-P-DAC` | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` | preview + fan-control + address-switch |

- **Future import class:** `preview import candidate`. Each lands on
  `channel: preview` behind the existing preview acknowledgement, plus the
  WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 fan-control acknowledgement (and the
  analog address-switch acknowledgement for the two FanDAC bundles).
- **`REQUIRED_CONFIGS` eligibility:** `not-required-configs`. Preview imports
  are never `REQUIRED_CONFIGS`-eligible.
- **Kit / recommended eligibility:** `not-kit-default`, `not-recommended`,
  never buyable, never default-selectable.
- **Runtime UX gate:** `preview-acknowledgement-required` +
  `fan-control-acknowledgement-required` (+
  `analog-fan-address-switch-acknowledgement-required` for the FanDAC bundles).
  No gate is weakened; the third (address-switch) gate is strictly additive.
- **TRIAC stays out.** The fan-control bundle lane never carries a `FanTRIAC` /
  `TRIAC` token, and the readiness validator rejects any TRIAC-bearing
  expectation. FanTRIAC remains `blocked-from-standard-import`.
- **The future import is mechanical.** When upstream publishes a fan-bundle
  `.bin`, the per-config import PR (provisional `WF-IMPORT-FAN-BUNDLES-001`)
  copies the readiness module's source-entry skeleton into
  `firmware/sources.json`, pins the published artifact's SHA-256 as
  `expected_sha256`, runs the importer + `scripts/gen-manifests.py`, and the
  matching Simple-install card lights up with no further wizard-code change —
  exactly as the FanRelay / FanPWM / FanDAC standalone previews already did.
- **Follow-up owner:** `WF-FAN-BUNDLE-IMPORT-READINESS-001` (this PR, readiness
  prep only) → `WF-IMPORT-FAN-BUNDLES-001` (the future per-config firmware-import
  PR, after upstream publishes the artifacts).

## Upstream compile-only validation signal

Upstream `sense360store/esphome-public` runs a **compile-only validation
lane** that proves a YAML / package / product / WebFlash-wrapper
configuration compiles cleanly under ESPHome with the current package
set, secrets provisioning, and ESP-IDF / Arduino toolchain. This signal
is an *input* to WebFlash planning, not a WebFlash-side gate. The
matrix records it here so future per-family import PRs (every
`WF-IMPORT-…-001` row in the [Follow-up PR sequence](#follow-up-pr-sequence))
can reason about upstream readiness without confusing the two layers.

The relevant upstream PRs (sourced from
`sense360store/esphome-public`, not this repo — numbers refer to
upstream, not WebFlash):

- **`FW-COMPILE-MATRIX-001` (upstream #544)** — added the compile-only
  validation lane itself; gives upstream a way to ensure every active
  YAML still compiles against the current package set without
  producing a release artifact.
- **`FW-COMPILE-FIX-001` (upstream #546)** — fixed full-compile
  secrets provisioning so the lane can run end-to-end on the two
  currently-WebFlash-shipped YAMLs.
- **`FW-COMPILE-RESULT-001` (upstream #547)** — recorded successful
  full-compile evidence for the two YAMLs WebFlash currently imports
  (Release-One stable + LED preview). This is the upstream
  *compile-only* confidence signal for the two builds already
  imported by WebFlash; it is **not** a re-flash, a re-release, or a
  re-import event on the WebFlash side.
- **`FW-COMPILE-POE-NONFAN-001` (upstream #548)** — added five
  PoE non-fan compile-only *skeletons*. These are YAML / package /
  product configurations that compile clean upstream but have **no
  upstream release artifact**, no upstream `webflash_build_matrix`
  bridge, and no WebFlash source entry. Compile-only success here
  means *YAML is well-formed against the current package set*, not
  that any of these become installable.
- **`FW-COMPILE-EXPAND-001` (upstream #549)** — added the candidate
  ledger ranking the next compile-only targets (currently dominated
  by PoE non-fan LED variants). The ledger is upstream planning
  signal; WebFlash imports nothing from it.

### What compile-only proves

- **YAML / package / ESPHome compile confidence.** The configuration
  is syntactically valid against the active package set, all
  referenced symbols resolve, and the toolchain produces a binary
  without error. This is necessary, but not sufficient, for any
  exposure class.
- **Continuous integration against package drift.** When upstream
  packages change, the compile-only lane catches breakage in
  configurations that would otherwise silently rot.

### What compile-only does **not** prove

- **Compile-only does not produce a WebFlash-importable artifact.**
  No `.bin` is attached to a GitHub Release; no
  `checksums-sha256.txt` entry exists; no `expected_sha256` can be
  pinned in `firmware/sources.json`. The
  [Core rule](#core-rule) gates that an import requires — *upstream
  release artifact exists, release notes carry the four canonical H2
  sections, checksum matches `checksums-sha256.txt`* — are all
  unsatisfied by compile-only success alone.
- **Compile-only does not imply `preview` readiness.** Preview
  imports still require the upstream catalog entry at `status:
  preview` **and** a real upstream release artifact (the
  `release-proof-required` gate). The LED preview is the worked
  example: `FW-COMPILE-RESULT-001` proved the YAML compiles, but the
  LED preview only became WebFlash-importable when upstream
  `v1.0.0-led-preview` shipped a signed `.bin` with the canonical
  release-body sections (see
  [`docs/led-preview-import-plan.md`](led-preview-import-plan.md)).
- **Compile-only does not imply `stable` readiness.** Stable imports
  additionally require upstream `status: production`, bench evidence
  (`S360-300-BENCH-001`-class), and a deliberate WebFlash
  `WF-IMPORT-…-001` PR that runs the importer.
- **Compile-only does not imply hardware proof.** A binary that
  builds does not exercise any hardware path. Hardware proof remains
  a separate gate (operator validation, e.g.
  [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md);
  upstream bench gates such as `S360-300-BENCH-001`).
- **Compile-only does not imply `REQUIRED_CONFIGS` eligibility.**
  `REQUIRED_CONFIGS` is the production-only deploy allowlist and is
  unrelated to whether a YAML compiles. WF-PRODUCT-004
  ([`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js))
  continues to enforce `production` + `stable` as the only state
  that may enter `REQUIRED_CONFIGS`. Compile-only catalog entries
  fail the alignment check today
  ([`docs/firmware-import.md`](firmware-import.md): `compile-only`
  is listed alongside `blocked` / `legacy-compatible` / `deprecated`
  / `removed` / `hardware-pending` as a status that WebFlash
  surfaces must not reference).
- **Compile-only does not imply kit / recommended / default
  exposure.** Kit + recommended decisions follow import, not the
  compile-only signal.

### Current upstream compile-only targets

| Target group | Upstream PR | Compile-only status | WebFlash import status today |
|---|---|---|---|
| Release-One stable YAML (`Ceiling-POE-VentIQ-RoomIQ`) | `FW-COMPILE-RESULT-001` (#547) | compiles clean | **already imported** as `channel: stable` v1.0.0; in `REQUIRED_CONFIGS`; backs `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`. No change driven by the compile-only signal. |
| LED preview YAML (`Ceiling-POE-VentIQ-RoomIQ-LED`) | `FW-COMPILE-RESULT-001` (#547) | compiles clean | **already imported** as `channel: preview` v1.0.0 under WF-LED-002; manifest-only exposure under WF-LED-003. No change driven by the compile-only signal. `RELEASE-007` still gates LED-stable; bench evidence (`S360-300-BENCH-001`) still gates the operator-proof path. |
| PoE non-fan compile-only skeletons (5 entries) | `FW-COMPILE-POE-NONFAN-001` (#548) | compiles clean | **no import.** No upstream release artifact, no `webflash_build_matrix` bridge, no WebFlash source entry, no `firmware/sources.json` declaration, no manifest entry, no kit, no `REQUIRED_CONFIGS` line. Allowed import action: **none** (compile-only-only). |
| PoE non-fan LED candidates (next upstream lane) | `FW-COMPILE-EXPAND-001` (#549) — candidate ledger | candidate ranking only — **not yet compiled** | **no import.** Listed here as upstream planning visibility; not yet eligible for any class even at the upstream `preview` gate. |

### How WebFlash treats the compile-only signal

- **Awareness, not exposure.** WF-IMPORT-GAP-001's
  [Candidate import table](#candidate-import-table) and per-family
  postures already classify every non-imported family with
  `not-import-ready` + the specific missing gates. Compile-only
  success **does not** flip any row from `not-import-ready` to
  `preview import candidate`; the missing gates remain missing
  (`missing-upstream-release-artifact`,
  `missing-upstream-webflash-wrapper`, etc.).
- **No new follow-up PR identifiers are reserved by this signal.**
  The compile-only lane does not unlock a new `WF-IMPORT-…-001`
  slot — every existing slot still gates on its named upstream
  `RELEASE-…` precondition.
- **The candidate ledger (`FW-COMPILE-EXPAND-001`) is upstream
  scheduling input, not WebFlash scheduling input.** WebFlash
  reads it for visibility; the WebFlash queue
  ([`UPCOMING_PR.md`](../UPCOMING_PR.md)) does not duplicate or
  re-order it.
- **Compile-only entries that ever become release artifacts will
  flow through the existing `WF-IMPORT-…-001` machinery.** When
  (and only when) an upstream compile-only configuration is
  promoted to a real GitHub Release with the canonical proof
  shape, the matching `WF-IMPORT-…-001` PR opens — not before.
- **Compile-only must not be confused with the WebFlash readiness
  classifier.** `scripts/validate-product-import-readiness.js`
  continues to treat `compile-only` catalog status as ineligible
  across all four eligibility dimensions; this section does not
  weaken that rule.

### What WF-UPSTREAM-COMPILE-AWARE-001 does **not** do

- **No firmware import.** No `.bin` enters
  `firmware/configurations/` or `firmware/rescue/`.
- **No manifest regeneration.** `manifest.json` and every
  `firmware-*.json` stay byte-identical.
- **No `firmware/sources.json` change.** No new source entry, no
  edited `block_tokens`, no edited `expected_sha256`.
- **No `REQUIRED_CONFIGS` change.** The production-only allowlist
  stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
- **No LED stable promotion.** LED preview stays preview;
  `RELEASE-007` / `S360-300-BENCH-001` still gate the stable path.
- **No PoE non-fan UI exposure.** The five compile-only skeletons
  from upstream #548 do **not** appear in
  `scripts/data/kits.json`, `scripts/data/kit-presets.js`,
  `scripts/data/module-requirements.js`, or any wizard surface.
- **No hardware-proof claim.** Operator validation
  (`docs/led-preview-webflash-proof.md`) remains `pending`; this
  section adds nothing to that evidence.
- **No `RELEASE-007` unblock claim.** The LED stable release gate
  remains entirely upstream-owned.

## Release-One and LED preview safety

The following statements are *load-bearing* and must remain true
across WF-IMPORT-GAP-001 and every future import PR:

**Release-One (`Ceiling-POE-VentIQ-RoomIQ`):**

- The Release-One stable artifact, channel, version, manifest entry,
  per-build manifest (`firmware-0.json`), `REQUIRED_CONFIGS`
  membership, kit (`S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`), and the
  Release-One source entry in `firmware/sources.json` (including its
  `block_tokens: ["FanTRIAC", "LED"]`) are **byte-identical to
  pre-WF-IMPORT-GAP-001 and must remain so**.
- No missing-module import may be added to Release-One (no LED,
  no FanTRIAC, no Relay/PWM/DAC). Release-One stays the no-TRIAC,
  no-LED configuration until a deliberate `WF-RELEASE-ONE-…`-class
  PR is opened (none is opened by this matrix).

**LED preview (`Ceiling-POE-VentIQ-RoomIQ-LED`):**

- The LED preview artifact, channel (`preview`), version,
  `expected_sha256` pin, manifest entry, per-build manifest
  (`firmware-1.json`), `block_tokens: ["FanTRIAC"]`, and the
  WF-LED-003 *manifest-only* exposure decision (no kit, no
  `REQUIRED_CONFIGS` entry, `channel:preview` acknowledgement
  required, `defaultSelectable: false`, `hiddenByDefault: false`,
  not Recommended) are **byte-identical to pre-WF-IMPORT-GAP-001
  and must remain so**.
- WF-IMPORT-GAP-001 does **not** promote LED to stable, does
  **not** add LED to `REQUIRED_CONFIGS`, does **not** add an LED
  kit, and does **not** weaken the `channel:preview`
  acknowledgement gate.

**Rescue (`firmware/rescue/…`):**

- The Rescue artifact, manifest, and the named exemption in
  `REQUIRED_CONFIGS` are **byte-identical to pre-WF-IMPORT-GAP-001
  and must remain so**. The rescue flow remains separate from the
  product wizard.

**FanTRIAC:**

- Stays `blocked-from-standard-import`. Every active source's
  `block_tokens` retains `FanTRIAC`. WF-IMPORT-GAP-001 does **not**
  unblock FanTRIAC, does **not** import a FanTRIAC build, and does
  **not** expose FanTRIAC behind any acknowledgement.

## `REQUIRED_CONFIGS` policy

`REQUIRED_CONFIGS` is the publish-time *baseline site-health*
allowlist, not a record of every valid imported firmware. The rules
this matrix formalises:

- `REQUIRED_CONFIGS` is **production-only**. The catalog entry
  backing a `REQUIRED_CONFIGS` member must be `status: production`,
  `channel: stable`. WF-PRODUCT-004 fails closed on any other
  combination.
- New **preview imports are not** `REQUIRED_CONFIGS` (even when they
  are import / manifest eligible). The LED preview is the live
  embodiment of this rule under WF-LED-003.
- New **advanced / manual-warning imports are not**
  `REQUIRED_CONFIGS`. FanTRIAC, if it is ever imported, is **never**
  `REQUIRED_CONFIGS` by default — and is never `REQUIRED_CONFIGS`
  without a separate, deliberate `WF-REQUIRED-001`-class PR
  accompanied by compliance evidence.
- An **LED stable import** does **not** automatically become
  `REQUIRED_CONFIGS`. The promotion to stable and the promotion
  into `REQUIRED_CONFIGS` are *two separate* decisions, even when
  upstream catalog state would technically allow the latter.
- Any future `REQUIRED_CONFIGS` addition is a **separate explicit
  PR** (`WF-REQUIRED-001` placeholder). The matrix records this
  separation; it does not pre-decide when (or whether) the PR opens.

See [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md)
for the longer-form rationale that this section preserves.

## Kit / recommended path policy

- **Importability is separate from kit / recommended exposure.** An
  artifact can be imported and still not be a kit. An artifact can
  be a kit and still not be the recommended default.
- A firmware **can be preview** and not kit-exposed. The LED
  preview is the live example under WF-LED-003.
- **Advanced / manual-warning imports must not be kit / default /
  recommended.** FanTRIAC is never a kit, never the default,
  never the recommended path — even if it is one day imported
  behind the advanced-warning gate.
- **Relay / PWM / DAC need separate UX / product decisions** before
  a kit or recommended exposure can land. The matrix does not
  pre-commit those decisions.
- The decision to expose an imported firmware as a kit is captured
  by a `WF-KIT-…`-class PR (e.g. `WF-KIT-LED-001` for a potential
  LED kit). The matrix reserves the PR slot but does not open it.
- **Simple-install bundle-picker exposure (WF-EASY-BUNDLE-PICKER-001)
  is presentation-only and respects every separation invariant.**
  The bundle picker
  ([`scripts/data/simple-bundles.js`](../scripts/data/simple-bundles.js))
  surfaces the already-imported preview room bundles
  (`Ceiling-POE-AirIQ-RoomIQ`, `Ceiling-POE-RoomIQ`,
  `Ceiling-POE-RoomIQ-LED`, `Ceiling-POE-VentIQ-FanRelay-RoomIQ`) in
  Simple install **behind the existing preview acknowledgement** (the
  relay bundle behind an additional fan-control acknowledgement). It
  changes no import class, imports no firmware, and never makes a
  preview bundle stable, default, recommended, buyable, or a
  `REQUIRED_CONFIGS` / `scripts/data/kits.json` entry — only the stable
  Bathroom PoE bundle is default/recommended. Standalone fan-driver
  configs (`Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC`) and TRIAC are
  **not** room-bundle products and never appear in the picker.

## Preview acknowledgement policy

- Preview imports require the **release-channel acknowledgement**
  implemented in
  [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js)
  (`preview.requiresAcknowledgement: true`,
  `preview.defaultSelectable: false`,
  `preview.hiddenByDefault: false`,
  `preview.acknowledgementLabel: "I understand this is an
  experimental preview build and accept the risk of running it."`).
- The **current LED preview acknowledgement is unchanged** under
  WF-IMPORT-GAP-001 (WF-LED-003 invariant intact).
- **Future preview imports must reuse or explicitly extend the
  preview acknowledgement model.** Bypassing or weakening the
  preview acknowledgement is not an option for any of the candidate
  rows above.
- WF-IMPORT-GAP-001 **does not weaken channel acknowledgement** in
  any form.

## Advanced / manual-warning import policy

- Advanced / manual-warning imports require an **explicit warning
  + acknowledgement gate** before install can proceed. The gate
  must be authored *in addition to* the existing preview /
  development channel acknowledgements, not in place of them.
- **FanTRIAC requires this path** before any FanTRIAC artifact may
  be exposed. No earlier path (preview / stable) is acceptable
  for FanTRIAC.
- **Advanced / manual-warning is not compliance certification.**
  The acknowledgement is an in-installer warning gate. It does
  not constitute regulatory clearance, mains-side compliance, or
  certification for sale.
- **Advanced / manual-warning imports are not default-selectable.**
  `pickDefaultBuild` (or any future equivalent) must never auto-
  select an advanced / manual-warning build, even when it is the
  sole candidate for a given `config_string`.
- The runtime UX for advanced / manual-warning installs is **not
  yet implemented**. `WF-IMPORT-TRIAC-001` depends on `WF-TRIAC-001`
  authoring that runtime UX before any TRIAC import may proceed.

## Manifest / source / firmware-N gates

Every future import PR must satisfy each of the gates below before
it is mergeable. The matrix records the gates; the per-family
import PRs implement them.

- **Upstream artifact exists** at the declared `release_url` and
  carries the expected `asset_name`.
- **Artifact SHA256 is known and pinned** via `expected_sha256` in
  the `firmware/sources.json` entry (the WF-LED-002 hardening
  requires this; the importer enforces it when present).
- **`firmware/sources.json` source entry is correct** — the source
  carries the right `source_repo`, `release_tag`, `release_url`,
  `version`, `channel`, `config_string`, `asset_name`,
  `min_size_bytes`, `required_assets`,
  `required_release_body_sections`, and `block_tokens`. New
  entries must keep `FanTRIAC` in `block_tokens` unless and until
  the TRIAC advanced / manual-warning path lands.
- **Importer (`scripts/import-firmware-sources.py`) validates the
  upstream catalog status / exposure class** — the importer rejects
  any source whose upstream catalog status is incompatible with
  the requested `channel`.
- **Manifest generation (`scripts/gen-manifests.py`) creates the
  correct `firmware-N.json`** — the deterministic per-build manifest
  index must match the post-import manifest order.
- **Artifact path exists on disk** under `firmware/configurations/`
  (for configurations) or `firmware/rescue/` (for Rescue only)
  with the matching `.meta.json` sidecar.
- **Release channel metadata is correct** — `channel`, `version`,
  `chipFamily`, `parts[].path` / `offset`, signing material, and
  improv flag all match the upstream proof.
- **Readiness strings are correct** — the wizard's six canonical
  readiness states (WF-UX-002:
  [`scripts/utils/firmware-readiness.js`](../scripts/utils/firmware-readiness.js))
  continue to map 1:1 to the canonical copy. Imports must not
  introduce a seventh state.
- **Tests cover the manifest surface** —
  `__tests__/manifest-health.test.js`,
  `__tests__/manifest-required-configs.test.js`,
  `__tests__/product-catalog-alignment.test.js`,
  `__tests__/product-import-readiness.test.js`,
  `__tests__/kits-json.test.js`,
  `__tests__/release-channel-ui.test.js`,
  `__tests__/module-availability.test.js`,
  `__tests__/readiness-strings.test.js`,
  `__tests__/wizard-state.test.js`,
  `__tests__/a11y-static-html.test.js`,
  and `__tests__/github-pages-surface.test.js` continue to pass.
- **Smoke deployment honours `REQUIRED_CONFIGS`** —
  [`scripts/smoke-test-deployment.py`](../scripts/smoke-test-deployment.py)
  still receives the same `REQUIRED_CONFIGS` array as
  `.github/workflows/firmware-publish.yml`.

## Stale-data and cache-surface gates

Every future import PR must also pass the cache / stale-data
hygiene checks below:

- **Stale runtime data must be removed or quarantined** —
  diagnostics redaction, flash-history sanitisation, preset import
  / export compatibility, and URL-config legacy aliases must
  continue to work; deprecated keys must continue to be stripped
  on read.
- **No stale manifest, `firmware-N.json`, kit, source, or cache
  surface may remain** — `manifest.json`, every `firmware-*.json`,
  `scripts/data/kits.json`, `firmware/sources.json`, and any
  service-worker cache must reflect the post-import state with no
  orphans.
- **Service-worker / cache changes must be explicit.**
  [`sw.js`](../sw.js)'s `STATIC_ASSETS` and `SCRIPT_MODULES`
  arrays, the `webflash-v1` cache name, and the network-first /
  stale-while-revalidate strategies must be deliberately
  considered for any new top-level script. If a new script is
  added (none is added by this matrix), it must be enrolled in
  `sw.js` or it will not be available offline.
- **No stale legacy configs may become installable accidentally.**
  Any `REQUIRED_CONFIGS` entry that loses its backing source
  entry must be removed in the same PR (WF-CLEANUP-004 / -005
  established this rule; it stands).

## Follow-up PR sequence

Each row below is a separate, deliberate PR. None of them are
opened by WF-IMPORT-GAP-001. Each precondition is upstream and
external to this matrix unless otherwise stated.

| Follow-up PR | Precondition | Scope |
|---|---|---|
| `WF-IMPORT-RELAY-001` | `RELEASE-RELAY-001` upstream | Import Relay preview only. No `REQUIRED_CONFIGS` change. No kit. |
| `WF-IMPORT-PWM-001` | `RELEASE-PWM-001` upstream | Import PWM preview only. No `REQUIRED_CONFIGS` change. No kit. |
| `WF-IMPORT-DAC-001` | `RELEASE-DAC-001` upstream | Import DAC preview only. Preserve FanDAC ↔ AirIQ mutex. No `REQUIRED_CONFIGS` change. No kit. |
| `WF-IMPORT-TRIAC-001` | `RELEASE-TRIAC-001` upstream **and** `WF-TRIAC-001` runtime UX | Advanced / manual-warning import only. Never `REQUIRED_CONFIGS`. Never kit. Never default-selectable. Not a compliance certification. |
| `WF-FAN-BUNDLE-IMPORT-READINESS-001` | upstream fan-bundle compile proof (upstream #716) + planned publication (upstream #717) | **Landed (readiness prep).** Declares the expected artifact filename + `firmware/sources.json` source-entry skeleton + readiness checks for the five full-composition fan bundles. Imports nothing; exposes nothing. |
| `WF-IMPORT-FAN-BUNDLES-001` | upstream publishes the five fan-bundle `.bin` artifacts (after upstream #717) | Import the published fan-control room bundles preview-only, behind the preview + fan-control (+ analog address-switch) acknowledgements. No `REQUIRED_CONFIGS` change. No kit. Never default-selectable. TRIAC excluded. |
| `WF-IMPORT-POWER-400-001` | `RELEASE-POWER-400-001` upstream | 240V PSU import; class TBD by upstream evidence. |
| `WF-IMPORT-POE-410-001` | upstream PoE-PSU-specific image (if ever) | Reserved slot; expected no-op unless upstream ships a separate PoE-PSU artifact. |
| `WF-LED-STABLE-001` | `RELEASE-007` **and** `S360-300-BENCH-001` | LED stable import; **does not** auto-promote to `REQUIRED_CONFIGS`; **does not** auto-add an LED kit. |
| `WF-REQUIRED-001` | a deliberate `REQUIRED_CONFIGS` decision (per-family) | Adds (or removes) a `config_string` from the publish workflow's `REQUIRED_CONFIGS` array. Always production-only. |
| `WF-KIT-LED-001` | a deliberate LED kit / recommended decision | Adds an LED kit / recommended path. Separate from `WF-LED-STABLE-001`. |

Recommended ordering when these PRs eventually become available:
upstream gates land in **PACKAGE → PRODUCT → WEBFLASH → RELEASE**
order; the WebFlash side follows with `WF-IMPORT-…-001` per family,
then optionally `WF-REQUIRED-001` and `WF-KIT-…-001` once the
import has shipped and the customer-facing decision is made.

## Do-not-change guardrails

WF-IMPORT-GAP-001 is documentation only. The following files are
**not** edited:

- `firmware/*` (no binary added, removed, or modified)
- `manifest.json`
- every `firmware-*.json`
- `firmware/sources.json`
- `scripts/data/kits.json`
- `scripts/utils/release-channels.js`
- `scripts/utils/firmware-readiness.js`
- `scripts/utils/module-availability.js`
- `scripts/utils/url-config.js`
- `scripts/import-firmware-sources.py`
- `scripts/gen-manifests.py`
- `scripts/validate-product-import-readiness.js`
- `scripts/smoke-test-deployment.py`
- `scripts/state.js`
- every `.github/workflows/*` file (`REQUIRED_CONFIGS` array
  unchanged)
- every `__tests__/*` file (no new test, no edited test)
- `sw.js`
- `_headers`
- `index.html`
- every CSS file
- every other runtime JS file under `scripts/`

The matrix changes:

- Adds this doc (`docs/webflash-import-readiness-matrix.md`).
- Adds short cross-link checkpoints to
  [`docs/firmware-import.md`](firmware-import.md),
  [`docs/product-import-readiness.md`](product-import-readiness.md),
  [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md),
  [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md),
  [`docs/led-preview-import-plan.md`](led-preview-import-plan.md),
  [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md), and a single
  convention bullet in [`CLAUDE.md`](../CLAUDE.md).

Invariants that travel through this PR unchanged:

- Release-One is `Ceiling-POE-VentIQ-RoomIQ`, `channel: stable`,
  `version: 1.0.0`.
- LED preview (`Ceiling-POE-VentIQ-RoomIQ-LED`) stays on
  `channel: preview`, manifest-only exposure, no kit, no
  `REQUIRED_CONFIGS` entry (WF-LED-003).
- FanTRIAC stays blocked (HW-005 + COMPLIANCE-001). It must not
  appear in any active WebFlash surface.
- `REQUIRED_CONFIGS` is production-only and holds exactly
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
- `Rescue` is exempt by name from every catalog-membership check.
- The WF-WIZARD-AVAIL-001 module-availability classifications
  (RoomIQ + VentIQ `available-stable`; LED `available-preview`;
  AirIQ + PWM + DAC `no-firmware`; Relay `design-pending`; TRIAC
  `blocked`; Voice `legacy-only`) are unchanged.
- The WF-UX-002 readiness-string surface and the
  WF-LED-003 preview-channel exposure model are unchanged.

## See also

- [`docs/firmware-import.md`](firmware-import.md) — cross-repo
  import contract (the *mechanism*). The matrix is the
  *sequencing* + *exposure-class* contract that sits in front of
  the import mechanism.
- [`docs/product-import-readiness.md`](product-import-readiness.md) —
  WF-PRODUCT-004 advisory validator for upstream catalog entries.
  Answers *catalog → eligibility*; the matrix answers *eligibility
  → import sequencing*.
- [`docs/led-preview-import-plan.md`](led-preview-import-plan.md) —
  WF-LED-001 / -002 / -003 history; the live worked example of
  the preview-import-candidate → preview-imported pathway and the
  WF-LED-003 manifest-only exposure decision.
- [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md) —
  operator-validation container for the LED preview flash path
  (WF-HW-TEST-001 / -002, status `pending — operator hardware test
  required`). The matrix records the *import* side of LED-stable
  promotion; the proof doc records the *operator-evidence* side.
- [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) — live-wizard
  UX audit and PR roadmap (`WF-UX-QUICK-001` through `WF-UX-007`
  plus the operator-only `WF-HW-TEST-001` / `WF-HW-TEST-002`
  chain). The matrix preserves every do-not-change guardrail
  recorded there.
- [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md) —
  cleanup history; the WF-CLEANUP and WF-PRODUCT series shaped the
  current import surface that the matrix records.
- [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md) —
  rationale for the production-only `REQUIRED_CONFIGS` allowlist
  that the matrix preserves.
- [`docs/github-pages-surface-audit.md`](github-pages-surface-audit.md) —
  live deployment delta; the matrix's "Current WebFlash import
  surface" section aligns with the live-surface contract recorded
  there.
- [`CLAUDE.md`](../CLAUDE.md) — canonical SKU table and platform
  standards. Every SKU referenced in the matrix uses the canonical
  Friendly Name + SKU pair pinned by that table.
