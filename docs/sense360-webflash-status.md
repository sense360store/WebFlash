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
| **Catalog → WebFlash eligibility rules** | [`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js) (contract doc `docs/product-import-readiness.md` archived — see [`docs/archive-index.md`](archive-index.md)) | WebFlash |
| **Per-family import readiness + follow-up PR slots** | [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md) | WebFlash |

WebFlash is **downstream** of the upstream roadmap. The upstream
`docs/sense360-roadmap-status.md` is authoritative for product lifecycle
(`production` / `preview` / `blocked` / `legacy-compatible` / `deprecated` /
`removed` / `hardware-pending` / `compile-only`). WebFlash mirrors only the
slice it can build a signed `.bin` for and ship through the importer. When the
two disagree, upstream wins for *lifecycle status* and the WebFlash manifest
wins for *what flashes today*.

## Currently supported / release-selectable products

These are the builds in `manifest.json` today. The **only release-selectable
(stable) default** is Release-One; everything else is preview-gated, blocked, or
has no imported artifact.

| Product (`config_string`) | Channel | Version | WebFlash exposure | In `REQUIRED_CONFIGS`? |
|---|---|---|---|---|
| **Release-One** — `Ceiling-POE-VentIQ-RoomIQ` | `stable` | 1.0.0 | Release-selectable. Default stable install path (Simple install). Backs the `S360-KIT-BATH-POE` kit and the `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` entry in `scripts/data/kits.json`. | **Yes** |
| **LED preview** — `Ceiling-POE-VentIQ-RoomIQ-LED` | `preview` | 1.0.0 | **Preview-only.** Visible in normal mode but never auto-selected; install gates on the `channel:preview` acknowledgement (WF-LED-003 Option A). Not a kit, not recommended. | No |
| **AirIQ preview** — `Ceiling-POE-AirIQ-RoomIQ` | `preview` | 1.0.0 | **Preview-only (Advanced install).** First preview batch (WF-PREVIEW-IMPORT-FIRST-BATCH-001). Never auto-selected; `channel:preview` acknowledgement required. Not stable, not a kit, not recommended, not a customer default. | No |
| **RoomIQ preview** — `Ceiling-POE-RoomIQ` | `preview` | 1.0.0 | **Preview-only (Advanced install).** First preview batch. Same preview gate + posture. | No |
| **RoomIQ + LED preview** — `Ceiling-POE-RoomIQ-LED` | `preview` | 1.0.0 | **Preview-only (Advanced install).** First preview batch. Distinct from the VentIQ LED preview. Same preview gate + posture. | No |
| **FanRelay preview** — `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Imported by WEBFLASH-RELAY-001 after upstream marked it WebFlash-import eligible (`webflash_import_eligibility.eligible=true`); the upstream catalog status stays `hardware-pending`. Fan relay control is an installer / developer preview — **not for normal customers**; `channel:preview` acknowledgement required. Not stable, not a kit, not recommended, not a customer default, not buyable. No hardware / bench / compliance / safety / commercial-availability proof claimed. Use the stable Bathroom PoE build for normal installs. | No |
| **FanPWM preview** — `Ceiling-POE-FanPWM` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Imported by WEBFLASH-PWM-001 after upstream marked it WebFlash-import eligible (`webflash_import_eligibility.eligible=true`); the upstream catalog status stays `hardware-pending`. PWM fan control (low-voltage / DC fans) is an installer / developer preview — **not for normal customers**; `channel:preview` acknowledgement required. Not stable, not a kit, not recommended, not a customer default, not buyable. No hardware / bench / compliance / safety / commercial-availability proof claimed. Use the stable Bathroom PoE build for normal installs. | No |
| **FanDAC preview** — `Ceiling-POE-FanDAC` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Imported by WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 (the preview-eligible import automation) after upstream marked it WebFlash-import eligible (`webflash_import_eligibility.eligible=true`); the upstream catalog status stays `hardware-pending`. Analog (0–10V) fan control is an installer / developer preview — **not for normal customers**; `channel:preview` acknowledgement required. Not stable, not a kit, not recommended, not a customer default, not buyable. No hardware / bench / compliance / safety / commercial-availability proof claimed. Use the stable Bathroom PoE build for normal installs. | No |
| **Bathroom + PWM bundle** — `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Full-composition room-bundle fan preview imported by WF-IMPORT-FAN-BUNDLES-001 (upstream `ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001`, catalog status `hardware-pending`). `channel:preview` + fan-control acknowledgements required. Not stable, not a kit yet, not recommended, not a customer default, not buyable. No hardware / bench / compliance / safety proof claimed. | No |
| **Bathroom + DAC bundle** — `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Full-composition room-bundle fan preview (WF-IMPORT-FAN-BUNDLES-001). `channel:preview` + fan-control + FanDAC analog address-switch acknowledgements required (S360-312 IC2 `0x5A`; `0x59` forbidden). `FANDAC-I2C-ADDR-001` bench verification stays pending. Not stable / kit / recommended / default / buyable. | No |
| **Kitchen + Relay bundle** — `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Full-composition room-bundle fan preview (WF-IMPORT-FAN-BUNDLES-001). `channel:preview` + fan-control acknowledgements required. Not stable / kit / recommended / default / buyable. No hardware / bench / compliance / safety proof claimed. | No |
| **Kitchen + DAC bundle** — `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Full-composition room-bundle fan preview (WF-IMPORT-FAN-BUNDLES-001). The `fandac_conflicts_with_airiq` mutex keeps AirIQ + FanDAC out of the one-click grammar; this is the address-overridden advanced exception. `channel:preview` + fan-control + FanDAC address-switch acknowledgements required; `FANDAC-I2C-ADDR-001` pending. Not stable / kit / recommended / default / buyable. | No |
| **Kitchen + PWM bundle** — `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | `preview` | 1.0.0 | **Preview / manual-preview (Advanced install only).** Full-composition room-bundle fan preview (WF-IMPORT-FAN-BUNDLES-001). `channel:preview` + fan-control acknowledgements required. Not stable / kit / recommended / default / buyable. No hardware / bench / compliance / safety proof claimed. | No |
| **Rescue** — `Rescue` | `rescue` | 1.0.0 | Recovery / unbricking build, reached via the recovery path + rescue modal. WebFlash-owned. | **Yes** |

`REQUIRED_CONFIGS` is **production-only**: `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
None of the twelve preview builds is on the allowlist — a `preview` catalog status
is import / manifest / kit eligible but never `REQUIRED_CONFIGS` eligible. The
default **Simple install** path resolves only to the stable Bathroom PoE build
(`Ceiling-POE-VentIQ-RoomIQ`); the preview builds appear only in the Advanced /
custom path behind the preview-channel acknowledgement.

## Preview firmware first batch (WF-PREVIEW-IMPORT-FIRST-BATCH-001)

WebFlash imported the first batch of preview firmware from the upstream
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview)
release. Three new preview-channel builds were added to `manifest.json`:

| Config string | Asset | SHA256 | Size (bytes) |
|---|---|---|---|
| `Ceiling-POE-AirIQ-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-RoomIQ-v1.0.0-preview.bin` | `16565de6…722bc7` | 1,089,296 |
| `Ceiling-POE-RoomIQ` | `Sense360-Ceiling-POE-RoomIQ-v1.0.0-preview.bin` | `2c7d691c…f47b937` | 956,976 |
| `Ceiling-POE-RoomIQ-LED` | `Sense360-Ceiling-POE-RoomIQ-LED-v1.0.0-preview.bin` | `d4f18824…6c9cb0` | 1,006,848 |

Provenance (recorded in each `.meta.json` sidecar): upstream
`sense360store/esphome-public@v1.0.0-preview`, build git sha
`2228bbb785a8d5b214d92cae08d1c760ba36ec47`, ESPHome `2026.4.5`, hosted compile
proof run `26821900127`. Each `.bin` was SHA-256-verified against the upstream
`checksums-sha256.txt` **and** the source entry's pinned `expected_sha256` by
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py).

**Posture — preview only.** These are **firmware-build proof only**: preview
firmware, **not stable**, **not recommended**, **not a customer default**, **not
hardware-verified**, and **not buyable as a public shop product**. No hardware /
bench / compliance / commercial-availability proof is claimed. They are exposed
**only** in the Advanced / custom install path and install only after the
`channel:preview` acknowledgement (`scripts/utils/release-channels.js`); the
default Simple install path still resolves only to the stable Bathroom PoE build
`Ceiling-POE-VentIQ-RoomIQ`. Normal customers should use that stable build.

**Not imported / unchanged.** The fourth `v1.0.0-preview` asset
(`Ceiling-POE-VentIQ-RoomIQ-LED`) was **not** re-imported — that config already
ships from `v1.0.0-led-preview`, and re-importing the same-named file would
overwrite a published `.bin` and break the existing LED preview.
`REQUIRED_CONFIGS` stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
(production-only), `scripts/data/kits.json` stays Release-One-only, the candidate
room bundles stay hidden / not buyable, and **the first batch imported no TRIAC
and no fan-driver firmware** (FanRelay was imported later, by WEBFLASH-RELAY-001
— see the next section; FanPWM / FanDAC / FanTRIAC remain unimported).

## FanRelay manual-preview (WEBFLASH-RELAY-001)

WebFlash imported the **FanRelay** manual-preview build from the same upstream
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview)
release after upstream PR #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`)
marked it **WebFlash-import eligible** — `webflash_import_eligibility.eligible=true`
in upstream `config/preview-release-targets.json` — while keeping the
`product-catalog.json` lifecycle status at `hardware-pending` and
`webflash_build_matrix=false` (no committed upstream build row). That structured
import-eligibility flag is the authorisation WebFlash honours for import /
manifest / kit eligibility; it is **never** honoured for `REQUIRED_CONFIGS`
(production-only), and FanTRIAC stays `eligible=false` / excluded.

| Config string | Asset | SHA256 | Size (bytes) |
|---|---|---|---|
| `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanRelay-RoomIQ-v1.0.0-preview.bin` | `f9600a6b…d026ca4` | 989,840 |

Provenance (in the `.meta.json` sidecar): upstream
`sense360store/esphome-public@v1.0.0-preview`, source git sha
`0963afb9c9582f5021019d1635421e41c9dd10f6`, ESPHome `2026.4.5`, hosted compile
proof run `26821900127`. The `.bin` was SHA-256-verified against the upstream
`checksums-sha256.txt` **and** the source entry's pinned `expected_sha256`. The
source entry carries `block_tokens: ["FanTRIAC", "LED"]`.

**Posture — preview / manual-preview only.** Fan relay control is an
installer / developer preview: **preview / manual-preview firmware**, **not for
normal customers**, exposed only in the **Advanced install** path behind the
`channel:preview` acknowledgement. **Not** stable, **not** recommended, **not**
a customer default, **not** a kit, **not** buyable as a public shop product, and
**never** auto-selected. **No** hardware, bench, compliance, safety, or
commercial-availability proof is claimed. Normal customers should use the stable
Bathroom PoE build `Ceiling-POE-VentIQ-RoomIQ`. **FanPWM was imported later, by
WEBFLASH-PWM-001 — see the next section; FanDAC / FanTRIAC remain unimported**
(FanDAC is upstream-import-eligible but out of scope; FanTRIAC stays build-blocked
and excluded).

## FanPWM manual-preview (WEBFLASH-PWM-001)

WebFlash imported the **FanPWM** manual-preview build from the same upstream
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview)
release under the same two-concept eligibility model as FanRelay: upstream PR
#711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`) marked it
**WebFlash-import eligible** — `webflash_import_eligibility.eligible=true` in
upstream `config/preview-release-targets.json` — while keeping the
`product-catalog.json` lifecycle status at `hardware-pending` and
`webflash_build_matrix=false` (no committed upstream build row). That structured
import-eligibility flag is the authorisation WebFlash honours for import /
manifest / kit eligibility; it is **never** honoured for `REQUIRED_CONFIGS`
(production-only), and FanTRIAC stays `eligible=false` / excluded.

| Config string | Asset | SHA256 | Size (bytes) |
|---|---|---|---|
| `Ceiling-POE-FanPWM` | `Sense360-Ceiling-POE-FanPWM-v1.0.0-preview.bin` | `4ef9f353…c59926` | 950,720 |

Provenance (in the `.meta.json` sidecar): upstream
`sense360store/esphome-public@v1.0.0-preview`, source git sha
`0963afb9c9582f5021019d1635421e41c9dd10f6`, ESPHome `2026.4.5`, hosted compile
proof run `26821900127`. The `.bin` was SHA-256-verified against the upstream
`checksums-sha256.txt` **and** the source entry's pinned `expected_sha256`. The
source entry carries `block_tokens: ["FanTRIAC", "LED"]`.

**Posture — preview / manual-preview only.** PWM fan control drives
low-voltage / DC fans and is an installer / developer preview: **preview /
manual-preview firmware**, **not for normal customers**, exposed only in the
**Advanced install** path behind the `channel:preview` acknowledgement. **Not**
stable, **not** recommended, **not** a customer default, **not** a kit, **not**
buyable as a public shop product, and **never** auto-selected. RPM / TachIO is
not claimed. **No** hardware, bench, compliance, safety, or commercial-availability
proof is claimed. Normal customers should use the stable Bathroom PoE build
`Ceiling-POE-VentIQ-RoomIQ`. **FanDAC was imported later, by
WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — see the next section; FanTRIAC stays
build-blocked and excluded.**

## FanDAC manual-preview (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001)

WebFlash imported the **FanDAC** manual-preview build from the same upstream
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview)
release under the same two-concept eligibility model as FanRelay / FanPWM —
upstream PR #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`) marked it
**WebFlash-import eligible** (`webflash_import_eligibility.eligible=true`) while
the `product-catalog.json` lifecycle status stays `hardware-pending` and
`webflash_build_matrix=false`. This import was performed by the new
**preview-eligible import automation**
([`scripts/import-preview-eligible-sources.py`](../scripts/import-preview-eligible-sources.py)),
which discovers every eligible preview target, cross-checks the pinned source +
on-disk state, and imports the missing ones behind a uniform set of guardrails
(eligibility flag, preview channel, mandatory SHA256 pin, upstream checksum
match, TRIAC refusal, overwrite protection, idempotency, and a
`REQUIRED_CONFIGS`-unchanged assertion). That structured import-eligibility flag
is the authorisation WebFlash honours for import / manifest / kit eligibility; it
is **never** honoured for `REQUIRED_CONFIGS` (production-only), and FanTRIAC stays
`eligible=false` / excluded.

| Config string | Asset | SHA256 | Size (bytes) |
|---|---|---|---|
| `Ceiling-POE-FanDAC` | `Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin` | `151894c1…a39b9f` | 930,400 |

Provenance (in the `.meta.json` sidecar): upstream
`sense360store/esphome-public@v1.0.0-preview`, source git sha
`0963afb9c9582f5021019d1635421e41c9dd10f6`, ESPHome `2026.4.5`, hosted compile
proof run `26821900127`. The `.bin` was SHA-256-verified against the upstream
`checksums-sha256.txt` **and** the source entry's pinned `expected_sha256`. The
source entry carries `block_tokens: ["FanTRIAC", "LED"]`.

**Posture — preview / manual-preview only.** Analog (0–10V) fan control (for
example Cloudlift S12) is an installer / developer preview: **preview /
manual-preview firmware**, **not for normal customers**, exposed only in the
**Advanced install** path behind the `channel:preview` acknowledgement. **Not**
stable, **not** recommended, **not** a customer default, **not** a kit, **not**
buyable as a public shop product, and **never** auto-selected. **No** hardware,
bench, compliance, safety, or commercial-availability proof is claimed. The
FanDAC ↔ AirIQ DAC-bus mutex is unchanged. Normal customers should use the stable
Bathroom PoE build `Ceiling-POE-VentIQ-RoomIQ`. **FanTRIAC was not imported**
(it stays build-blocked and excluded). Full import-proof at
`docs/preview-import-automation-proof.md` (archived — see
[`docs/archive-index.md`](archive-index.md)).

## Full-composition fan-bundle previews (WF-IMPORT-FAN-BUNDLES-001)

WebFlash imported the five **full-composition Bathroom / Kitchen fan-control
room-bundle** preview builds from the same upstream
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview)
release (release id `333373906`), authorised by upstream
`ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001` (`webflash_import_eligibility.eligible=true`
in `config/room-bundle-fan-variants.json`; catalog status stays `hardware-pending`,
`webflash_build_matrix` stays `false`). `manifest.json` grew from **9 to 14 builds**:

| Config string | Asset | SHA256 | Size (bytes) |
|---|---|---|---|
| `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` | `6d988708…85befba` | 1,010,192 |
| `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` | `a08c82f7…41d8ef8` | 990,112 |
| `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanRelay-RoomIQ-v1.0.0-preview.bin` | `97e54930…0f24a83f` | 1,090,656 |
| `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` | `903a37dc…b19a994b` | 1,090,400 |
| `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` | `0ca10a2f…9c853a1cc` | 1,113,872 |

Provenance (recorded in each `.meta.json`): upstream
`sense360store/esphome-public@v1.0.0-preview`, build git sha
`ad1d9575e17a1da450f31964401bb485a6b130c7`, ESPHome `2026.4.5`, compile run
`26913592989`, publish run `26947595936`. Each `.bin` was SHA-256-verified against
the upstream `checksums-sha256.txt` **and** the source entry's pinned
`expected_sha256` (from the publish evidence) by the preview-eligible import
automation.

**Posture — preview / manual-preview only, import-only PR.** These are
**firmware-build / release proof only**: full-composition fan-control room bundles
are an installer / developer preview, **not stable**, **not recommended**, **not a
customer default**, **not a kit** (this PR imports only — surfacing as kit cards is
the follow-up `WF2-FAN-EXPANSION-001`), **not buyable**, and **never**
auto-selected. Install gates on the `channel:preview` acknowledgement plus the
WF2-FAN-CONTROL-GATES-001 fan-control acknowledgement, and (for the two FanDAC
bundles) the FanDAC analog address-switch acknowledgement (S360-312 IC2 `0x5A`;
`0x59` forbidden — it collides with the air-quality SGP41). `FANDAC-I2C-ADDR-001`
bench verification stays **pending**; no FanDAC address is claimed physically
verified. The `fandac_conflicts_with_airiq` mutex (`scripts/data.js` +
`scripts/identify.js`) is unchanged, so AirIQ + FanDAC stays unselectable in the
wizard. **FanTRIAC was not imported** (build-blocked, excluded). No hardware /
bench / compliance / safety / commercial-availability proof claimed. Full
import-proof at
`docs/fan-bundle-preview-import-proof.md` (archived — see
[`docs/archive-index.md`](archive-index.md)).

## Simple-install bundle picker (WF-EASY-BUNDLE-PICKER-001)

The default **Simple install** view is now an easy **bundle picker** over the
supported customer bundle products (presentation-only data source
[`scripts/data/simple-bundles.js`](../scripts/data/simple-bundles.js), wired by
[`scripts/simple-install.js`](../scripts/simple-install.js)). It leads with
"Choose your Sense360 kit" and surfaces six bundle cards:

| Bundle SKU | Card | `config_string` | Channel | Gate |
|---|---|---|---|---|
| `S360-KIT-BATH-P` | Bathroom Bundle — PoE | `Ceiling-POE-VentIQ-RoomIQ` | **stable** | default / recommended |
| `S360-KIT-KITCHEN-P` | Kitchen Bundle — PoE | `Ceiling-POE-AirIQ-RoomIQ` | preview | preview ack |
| `S360-KIT-BEDROOM-P` | Bedroom Bundle — PoE | `Ceiling-POE-RoomIQ` | preview | preview ack |
| `S360-KIT-LIVING-P` | Living Room Bundle — PoE | `Ceiling-POE-RoomIQ-LED` | preview | preview ack |
| `S360-KIT-CORRIDOR-P` | Landing / Corridor Bundle — PoE | `Ceiling-POE-RoomIQ-LED` | preview | preview ack |
| `S360-KIT-BATH-P-REL` | Bathroom Bundle — PoE + Relay Fan Control | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview | preview ack **+ fan-control ack** |

The stable Bathroom PoE bundle is selected by default and is the only
default/recommended/buyable choice. Selecting any card feeds the bundle's
`wizardState` through the existing `setState()`, so Step 5 resolves the matching
build and **every install gate stays authoritative**: preview bundles still
require the `channel:preview` acknowledgement, and the Bathroom Relay bundle adds
a **fan-control acknowledgement** composed into the authoritative pre-flash gate
(install is blocked until both are checked). Technical metadata (SKU / config /
channel / firmware file) stays inside the collapsed Technical details disclosure.

Intentionally **absent** from Simple install (not room-bundle products): the
standalone fan-driver previews `Ceiling-POE-FanPWM` and `Ceiling-POE-FanDAC`, any
TRIAC firmware (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` stays build-blocked), and any
raw/custom module combination — all of which remain reachable only through
**Advanced install**. `REQUIRED_CONFIGS`, `manifest.json` (9 builds),
`firmware/sources.json`, and `scripts/data/kits.json` are unchanged; no firmware
was imported. Live checklist:
`docs/live-smoke-easy-bundle-picker.md` (archived — see
[`docs/archive-index.md`](archive-index.md)).

## Fan-control room bundles — declared + import-gated, not yet exposed (WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001)

The Simple-install picker now **declares** five full-composition fan-control room
bundles and **import-gates** them on the live manifest. A fan-control card only
ever appears once its exact firmware `config_string` is present in `manifest.json`
(via `getExposableFanControlBundles` in
[`scripts/data/simple-bundles.js`](../scripts/data/simple-bundles.js)).

| Bundle SKU | Card name | Firmware `config_string` | Acknowledgements | Exposed today? |
|---|---|---|---|:---:|
| `S360-KIT-BATH-P-PWM` | Bathroom Bundle — PoE + PWM Fan Control | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | preview + fan-control | **No** |
| `S360-KIT-BATH-P-DAC` | Bathroom Bundle — PoE + 0–10V Fan Control | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | preview + fan-control + address-switch | **No** |
| `S360-KIT-KITCHEN-P-REL` | Kitchen Bundle — PoE + Relay Extract Control | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | preview + fan-control | **No** |
| `S360-KIT-KITCHEN-P-PWM` | Kitchen Bundle — PoE + PWM Extract Control | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | preview + fan-control | **No** |
| `S360-KIT-KITCHEN-P-DAC` | Kitchen Bundle — PoE + 0–10V Extract Control | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | preview + fan-control + address-switch | **No** |

**None is exposed today.** Upstream `ROOM-BUNDLE-FAN-CONFIGS-001` (#713) added the
five product YAMLs but published **no firmware** (`compile_validation_status:
pending-ci`, `buildable-preview-compile-pending`, no `.bin`, no release; catalog
`status: hardware-pending`), so the matching builds are absent from `manifest.json`
and the gate returns an empty list — the picker shows exactly the six base
bundles. The two analog (DAC) bundles carry an additional GP8403 **address-switch**
acknowledgement (IC1 `0x58` / IC2 `0x5A`; `0x59` forbidden with VentIQ/AirIQ); the
upstream bench gate `FANDAC-I2C-ADDR-001` is PENDING and the address switch is
**not** claimed physically verified. The definitions + gate + acknowledgement
plumbing are staged so a future firmware-import PR lights up the matching card with
no further wizard code change. TRIAC stays excluded. Live checklist:
`docs/live-smoke-easy-bundle-picker-fan-expansion.md` (archived — see
[`docs/archive-index.md`](archive-index.md)).

**Import readiness prepared (WF-FAN-BUNDLE-IMPORT-READINESS-001).** Upstream then
recorded compile proof for the five bundles (upstream #716) and planned publication
(upstream #717) — still **no artifact**, so nothing is imported and all five cards
stay hidden. WebFlash now stages the **expected import shape** for each future
artifact in the non-runtime readiness descriptor
[`scripts/data/fan-bundle-import-readiness.js`](../scripts/data/fan-bundle-import-readiness.js)
(pinned by `__tests__/wf-fan-bundle-import-readiness.test.js`): the expected
`config_string`, the expected canonical artifact filename
(`Sense360-<config>-v1.0.0-preview.bin`) + `.meta.json` sidecar, the expected
`channel: preview`, the expected `block_tokens: ["FanTRIAC", "LED"]`, the full
room-bundle flag, the Simple-picker card gate, the required acknowledgements
(preview + fan-control, plus the analog address-switch acknowledgement for the two
FanDAC bundles), and a ready-to-fill `firmware/sources.json` source-entry skeleton
with everything **except** the human-pinned `expected_sha256`. This makes the future
per-config import PR small and mechanical. It imports no firmware, edits no
`manifest.json` / `firmware/sources.json`, changes no `REQUIRED_CONFIGS`, adds no
kit, and exposes no card. See
[`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md) →
*Full-composition fan-control room bundles import posture*.

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
| S360-210 | Sense360 AirIQ | `available-preview` | **Preview-only — not stable.** Derived from the `Ceiling-POE-AirIQ-RoomIQ` preview build (WF-PREVIEW-IMPORT-FIRST-BATCH-001) behind the preview acknowledgement. The static `no-firmware` override was removed once the build shipped. |
| S360-310 | Sense360 Relay | `available-preview` | **Preview / manual-preview — Advanced install only (WEBFLASH-RELAY-001).** Derived from the `Ceiling-POE-VentIQ-FanRelay-RoomIQ` preview build behind the `channel:preview` acknowledgement. **Not for normal customers**, not stable, not a kit, not recommended. No hardware / bench / compliance / safety proof claimed. |
| S360-311 | Sense360 PWM (**FanPWM**) | `available-preview` | **Preview / manual-preview — Advanced install only (WEBFLASH-PWM-001).** Derived from the `Ceiling-POE-FanPWM` preview build behind the `channel:preview` acknowledgement. Low-voltage / DC fan control. **Not for normal customers**, not stable, not a kit, not recommended. No hardware / bench / compliance / safety proof claimed. |
| S360-312 | Sense360 DAC | `available-preview` | **Preview / manual-preview — Advanced install only (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001).** Derived from the `Ceiling-POE-FanDAC` preview build behind the `channel:preview` acknowledgement. Analog (0–10V) fan control. **Not for normal customers**, not stable, not a kit, not recommended. No hardware / bench / compliance / safety proof claimed. |
| S360-320 | Sense360 TRIAC | `advanced-manual-warning` | Selectable in the custom path behind an in-installer warning gate (WF-TRIAC-001). **Not** compliance-certified, **not** import-allowed, **not** Release-One. |
| S360-400 | Sense360 240v PSU | covered transitively | `power=ac` segment; no separate artifact. |
| S360-410 | Sense360 PoE PSU | covered transitively | `power=poe` segment; **see blocker below.** |

## Standing guardrails

These four invariants are the point of the consolidation. They must remain
true and visible:

1. **Fan drivers stay out of Release-One / kits / `REQUIRED_CONFIGS`.** **Relay**
   (WEBFLASH-RELAY-001), **PWM** (WEBFLASH-PWM-001), and **DAC**
   (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001) are now Advanced-install **previews**
   — acknowledgement-gated, not release-selectable, not a kit/default, not
   recommended, not in `REQUIRED_CONFIGS`, with no hardware/bench/compliance proof
   claimed. **TRIAC** is selectable only behind the WF-TRIAC-001
   advanced/manual-warning gate and remains import-blocked.
2. **LED (S360-300) stays preview-only.** The `Ceiling-POE-VentIQ-RoomIQ-LED`
   build ships on the `preview` channel and installs only after the
   `channel:preview` acknowledgement. It is **not** marked stable, **not** in
   `REQUIRED_CONFIGS`, and **not** in `scripts/data/kits.json`. LED stable is
   blocked behind upstream `RELEASE-007` + bench proof `S360-300-BENCH-001` and
   the reserved `WF-LED-STABLE-001` import / `WF-REQUIRED-001` allowlist /
   `WF-KIT-LED-001` kit decisions, plus the operator flash proof formerly
   containered in `docs/led-preview-webflash-proof.md` (archived with no
   operator evidence recorded — see [`docs/archive-index.md`](archive-index.md);
   status: **pending**).
3. **S360-410 PoE PSU blocker stays visible for broader bundle expansion.** PoE
   power is covered *transitively* today via the `power=poe` segment of
   Release-One and the LED preview — there is **no** standalone PoE-PSU build,
   and there is **no** importable firmware behind the additional room bundles
   (`S360-KIT-KITCHEN-P`, `S360-KIT-LIVING-P`, `S360-KIT-BEDROOM-P`,
   `S360-KIT-CORRIDOR-P` in `docs/webflash-bundle-sku-matrix.md`, archived —
   see [`docs/archive-index.md`](archive-index.md)),
   which are naming-reference only. Broader PoE bundle expansion is therefore
   **blocked** until upstream ships the corresponding `RELEASE-…` artifacts; the
   reserved `WF-IMPORT-POE-410-001` slot is an expected no-op unless a distinct
   PoE artifact appears.
4. **FanTRIAC stays blocked from Release-One.** `block_tokens: ["FanTRIAC", "LED"]`
   on the Release-One source and `["FanTRIAC"]` on the LED preview source both
   stand. The manifest-health guard fails CI if a `FanTRIAC` token reappears in a
   generated `config_string`.

## Current release version(s)

WebFlash ships from `manifest.json`, which today carries exactly nine builds.
All nine are at version **1.0.0**:

| Config string | Channel | Version | Upstream release tag | Release-selectable? |
|---|---|---|---|---|
| `Ceiling-POE-VentIQ-RoomIQ` | `stable` | 1.0.0 | [`v1.0.0`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0) | **Yes** (default stable path) |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | `preview` | 1.0.0 | [`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview) | **Preview-only** (gated on `channel:preview` acknowledgement) |
| `Ceiling-POE-AirIQ-RoomIQ` | `preview` | 1.0.0 | [`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview) | **Preview-only** (Advanced install; `channel:preview` acknowledgement) |
| `Ceiling-POE-RoomIQ` | `preview` | 1.0.0 | [`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview) | **Preview-only** (Advanced install; `channel:preview` acknowledgement) |
| `Ceiling-POE-RoomIQ-LED` | `preview` | 1.0.0 | [`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview) | **Preview-only** (Advanced install; `channel:preview` acknowledgement) |
| `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | `preview` | 1.0.0 | [`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview) | **Preview / manual-preview** (Advanced install only; `channel:preview` acknowledgement) — WEBFLASH-RELAY-001 |
| `Ceiling-POE-FanPWM` | `preview` | 1.0.0 | [`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview) | **Preview / manual-preview** (Advanced install only; `channel:preview` acknowledgement) — WEBFLASH-PWM-001 |
| `Ceiling-POE-FanDAC` | `preview` | 1.0.0 | [`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview) | **Preview / manual-preview** (Advanced install only; `channel:preview` acknowledgement) — WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 |
| `Rescue` | `rescue` | 1.0.0 | _(built in-tree under `firmware/rescue/`)_ | Recovery path only |

- **Release-selectable target:** `Ceiling-POE-VentIQ-RoomIQ` (stable) — the only
  Simple-install / customer-default path.
- **Preview targets (Advanced install, `channel:preview` acknowledgement):**
  `Ceiling-POE-VentIQ-RoomIQ-LED` (S360-300 LED ring), the first preview
  batch `Ceiling-POE-AirIQ-RoomIQ`, `Ceiling-POE-RoomIQ`, and
  `Ceiling-POE-RoomIQ-LED` (WF-PREVIEW-IMPORT-FIRST-BATCH-001), the
  FanRelay manual-preview `Ceiling-POE-VentIQ-FanRelay-RoomIQ` (S360-310;
  WEBFLASH-RELAY-001), the FanPWM manual-preview `Ceiling-POE-FanPWM`
  (S360-311; WEBFLASH-PWM-001), and the FanDAC manual-preview
  `Ceiling-POE-FanDAC` (S360-312; WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001). All are
  firmware-build-proof only — **not** hardware-verified, **not** stable, **not**
  recommended, **not** a customer default, and **not** buyable as a public shop
  product. FanRelay, FanPWM and FanDAC are installer / developer previews and
  **not for normal customers**.
- **Blocked / not WebFlash-exposed targets:** FanTRIAC (S360-320) and any broader
  PoE bundle expansion that depends on S360-410 evidence. Neither has a
  `manifest.json` build, a `firmware/sources.json` source entry, an install card,
  or a release artifact in this repo. (FanTRIAC stays `eligible=false` /
  build-blocked under HW-005.)

## Bundle SKU mapping

Customer-facing Sense360 PoE **room bundle** SKUs (upstream
`BUNDLE-SKU-MATRIX-001`) are mirrored for naming consistency in
`docs/webflash-bundle-sku-matrix.md` (archived — see
[`docs/archive-index.md`](archive-index.md)). A bundle
SKU is **not** a firmware identifier — only `S360-KIT-BATH-P` resolves to a
**stable** installable WebFlash build; the other room bundles now resolve to
imported **preview** builds (Advanced-install / preview-acknowledgement-gated)
and, as of `WF-EASY-BUNDLE-PICKER-001`, are surfaced in the Simple-install
**bundle picker** behind their Preview labels and acknowledgement gates.

| Bundle SKU | Room | Firmware target today | WebFlash exposure |
|---|---|---|---|
| `S360-KIT-BATH-P` | bathroom | `Ceiling-POE-VentIQ-RoomIQ` | **Installable — stable** (Release-One; Simple-install default + recommended; same build as the `S360-KIT-BATH-POE` kit-intent card). |
| `S360-KIT-KITCHEN-P` | kitchen | `Ceiling-POE-AirIQ-RoomIQ` | **Preview** — Simple-install bundle picker, behind the preview acknowledgement. Not stable, not default, not buyable. |
| `S360-KIT-LIVING-P` | living-room | `Ceiling-POE-RoomIQ-LED` | **Preview** — Simple-install bundle picker, behind the preview acknowledgement. Not stable, not default, not buyable. |
| `S360-KIT-BEDROOM-P` | bedroom | `Ceiling-POE-RoomIQ` | **Preview** — Simple-install bundle picker, behind the preview acknowledgement. Not stable, not default, not buyable. |
| `S360-KIT-CORRIDOR-P` | corridor | `Ceiling-POE-RoomIQ-LED` | **Preview** — Simple-install bundle picker (shares the Living build). Not stable, not default, not buyable. |
| `S360-KIT-BATH-P-REL` | bathroom (with fan) | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | **Preview** — Simple-install bundle picker, behind the preview **and** fan-control acknowledgements. Not stable, not default, not buyable. |

Per-bundle detail and the three parallel identifier spaces (Module SKU / Kit
SKU / Bundle SKU / firmware `config_string`) live in the bundle SKU matrix doc.
Broader PoE bundle promotion to **stable / buyable** (Kitchen / Living / Bedroom /
Corridor / Relay) stays **blocked** until upstream ships the corresponding
`RELEASE-…` artifacts and the S360-410 PoE evidence gate closes (see guardrail 3);
the preview exposure above never implies stability, default, or buyability.

## First-release gate sync (WEBFLASH-FIRST-RELEASE-GATES-SYNC-001)

Upstream `sense360store/esphome-public` merged the canonical first-release gate
checklist `PRE-HW-PREP-FIRST-RELEASE-GATES-001` (PR #679) and now carries it at
[`docs/first-release-gates.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-gates.md).
The WebFlash-side mirror, stated against this repo's live install surface, is
[`docs/release-gates/WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md`](release-gates/WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md).
It re-states, in WebFlash terms, what the tables above already encode:

- **Stable installable today:** `Ceiling-POE-VentIQ-RoomIQ` (Bathroom,
  `S360-KIT-BATH-P`) — the only first-release path.
- **Preview, exposed but gated:** `Ceiling-POE-VentIQ-RoomIQ-LED` — the LED
  preview target, **preview-only**, never auto-selected, gated on the
  `channel:preview` acknowledgement. **No LED-stable claim is made.**
- **Not exposed / not installable:** Kitchen, Bedroom, Living, Corridor room
  bundles — naming reference only, no imported build.
- **Not exposed:** `FanRelay`, `FanPWM`, `FanDAC`, and `FanTRIAC` — no manifest
  build, no source entry, no install card. The upstream fan-control **bundle**
  variants are **planning-only** (`webflash_exposed: false`).
- **Shared S360-410 PoE blocker** stays visible (guardrail 3); PoE is covered
  transitively via the `power=poe` segment and no standalone PoE-PSU build
  exists.

The gate sync is **docs-only**: it adds no manifest build, source, install card,
kit, or kit-preset, and exposes no fan-control variant. See the sync doc's
no-new-exposure statement and no-drift table for the full surface confirmation.

## First-release dry-run handoff (WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001)

Upstream `sense360store/esphome-public` merged the first-release **dry-run
checklist** `FIRST-RELEASE-DRYRUN-CHECKLIST-001` (PR #680) at
[`docs/first-release-dryrun-checklist.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-dryrun-checklist.md)
— an operator checklist that rehearses the publish side of the first-release
path (release notes → build → artifact naming → checksums) with non-publishing
lanes and only *describes* the WebFlash import / sign / manifest / deploy steps
as a future hand-off. The WebFlash-side companion that states those
WebFlash-owned steps against this repo's live install surface is
[`docs/release-gates/WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001.md`](release-gates/WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001.md).
It is a **no-publish operator handoff for the current stable release path** and
re-states, in WebFlash import terms, what the tables above already encode:

- **Current stable config string:** `Ceiling-POE-VentIQ-RoomIQ` (Bathroom,
  upstream `S360-KIT-BATH-P`), `stable` / `v1.0.0` — already imported and live.
- **Expected artifact name pattern:**
  `Sense360-Ceiling-POE-VentIQ-RoomIQ-v<x.y.z>-stable.bin`; at v1.0.0,
  `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin`.
- **Expected upstream release-note source:** the upstream GitHub release body at
  the pinned tag, with the four required `##` sections (Changelog / Known
  Issues / Features / Hardware Requirements).
- **Expected checksum / source-update handoff:** the importer SHA-256-verifies
  the fetched `.bin` against the upstream `checksums-sha256.txt` (and the
  source entry's `expected_sha256` when declared); a future stable re-import
  bumps only the stable `firmware/sources.json` entry.
- **WebFlash import expectations:** importer → `gen-manifests.py` → production
  signing → `firmware-publish.yml` deploy → smoke test, with a non-publishing
  rehearsal that uses only `--dry-run` / read-only lanes.
- **No-publish / no-exposure + post-import verification checklists.**

The handoff is **docs/status only**: it imports no firmware, changes no
`firmware/sources.json` or `manifest.json`, adds no install card / kit /
kit-preset, exposes no fan-control variant, makes no LED-stable claim, keeps
Kitchen / Bedroom / Living / Corridor not installable, and publishes no
artifact. See the handoff doc's no-new-exposure statement (§9) and no-drift
table (§10) for the full surface confirmation.

## Live manifest freshness smoke test (WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001)

A live smoke test of the deployed page's manifest freshness check is recorded
at
[`docs/release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md`](release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md).
It checks whether `https://sense360store.github.io/WebFlash/` loads the current
firmware manifest cleanly in a fresh session, after an earlier session reported
the *"Freshness unknown — Could not confirm firmware manifest freshness"*
warning.

- **Result: PASS.** The live `manifest.json` returns HTTP 200 with a present,
  parseable `generated_at` (`2026-05-29T18:46:09…`), open CORS, and a stable
  `generated_at` across `no-store` re-fetches — so the freshness check resolves
  to `current`, with neither the *"Freshness unknown"* nor the *"Newer firmware
  manifest available"* warning appearing.
- **Live install surface confirmed:** `Ceiling-POE-VentIQ-RoomIQ` (stable
  v1.0.0), `Ceiling-POE-VentIQ-RoomIQ-LED` (preview-only), and `Rescue` — no
  fan-control variant, no LED-stable build, no Kitchen / Bedroom / Living /
  Corridor bundle.
- **Likely cause of the earlier warning:** stale local browser / service-worker
  cache or a transient `no-store` re-fetch failure — not a manifest metadata
  issue, not a CORS issue, and not a WebFlash bug. No
  `WEBFLASH-FRESHNESS-UNKNOWN-DIAGNOSTICS-001` follow-up is opened.

The smoke test is **docs / status only**: it changes no runtime behaviour, no
`manifest.json`, no `firmware/sources.json`, no `REQUIRED_CONFIGS`, and adds no
install card / kit / kit-preset. See the record's verdict section and
do-not-change confirmation for the full surface statement.

## Live preview-import smoke checklist (WF-LIVE-SMOKE-PREVIEW-IMPORT-001)

After the first preview firmware batch landed
(`WF-PREVIEW-IMPORT-FIRST-BATCH-001`), the live / manual smoke checklist for the
deployed page is recorded at `docs/live-smoke-preview-import.md` (archived —
see [`docs/archive-index.md`](archive-index.md)). It verifies
on the live GitHub Pages deployment that **Simple install stays clean and
stable-only** while **Advanced install can reach the new preview builds** behind
the `channel:preview` acknowledgement with working release notes:

- **Simple install** loads without a false manifest-freshness error, shows only
  the stable Bathroom PoE build (`Ceiling-POE-VentIQ-RoomIQ`), surfaces no
  AirIQ / room-bundle preview choices, and becomes ready after the single safety
  confirmation.
- **Advanced install** can select the preview channel and reach
  `Ceiling-POE-AirIQ-RoomIQ`, `Ceiling-POE-RoomIQ`, and `Ceiling-POE-RoomIQ-LED`
  — each with the preview warning + acknowledgement, working in-card release
  notes (no dead links), `preview` channel metadata, and never
  recommended/default.
- **TRIAC and fan-driver** (`FanRelay` / `FanPWM` / `FanDAC`) firmware stays
  absent, candidate bundles stay not-buyable, the existing **VentIQ LED preview**
  still works, and **Rescue / recovery** stays available.

The deterministic half of the checklist is locked by
[`__tests__/live-smoke-preview-import.test.js`](../__tests__/live-smoke-preview-import.test.js)
(exactly nine builds, preview builds Advanced-only / acknowledgement-gated, Simple
install resolves only to stable Bathroom PoE, preview release notes present, no
TRIAC import (FanRelay / FanPWM / FanDAC are the deliberate manual-preview
exceptions), AirIQ availability derived from the manifest, VentIQ LED preview
preserved); the doc carries the browser-observable rows and a manual
verification template. The checklist is **docs / verification only** — it imports
no firmware, changes no `manifest.json` / `firmware/sources.json` /
`REQUIRED_CONFIGS` / kit, and weakens no provenance / signature / freshness
check. Current status: **pending — live operator pass required.**

## Live bundle-picker smoke checklist (WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001)

After the Simple-install **bundle picker** (`WF-EASY-BUNDLE-PICKER-001`) and the
import-gated **fan-control expansion** (`WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001`)
landed — and after the standalone FanRelay / FanPWM / FanDAC manual-previews were
imported — the consolidated current-state live / manual smoke checklist for the
deployed picker is recorded at
`docs/live-smoke-easy-bundle-picker-current.md` (archived — see
[`docs/archive-index.md`](archive-index.md)).
It verifies on the live GitHub Pages deployment that Simple install shows exactly
the **six base bundle cards** with the stable Bathroom PoE bundle as the default,
while every other surface stays honest:

- **Simple install loads cleanly** with no false manifest-freshness block; the
  **Bathroom Bundle — PoE** (`Ceiling-POE-VentIQ-RoomIQ`) is the **Stable /
  Recommended / default** selection.
- The **Kitchen / Bedroom / Living / Corridor** base preview cards appear behind
  the `channel:preview` acknowledgement, and the **Bathroom Relay** card
  (`Ceiling-POE-VentIQ-FanRelay-RoomIQ`) is import-ready and visible behind its
  preview **and** fan-control acknowledgements.
- The **five fan-control expansion cards** (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`,
  `Ceiling-POE-VentIQ-FanDAC-RoomIQ`, `Ceiling-POE-AirIQ-FanRelay-RoomIQ`,
  `Ceiling-POE-AirIQ-FanPWM-RoomIQ`, `Ceiling-POE-AirIQ-FanDAC-RoomIQ`) stay
  **hidden** — their firmware is not imported, so the import-readiness gate shows
  nothing.
- The standalone fan-driver previews `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC`
  are in the manifest but **never** become a Simple-install card, **TRIAC** is
  absent, **Advanced install** + **Recovery / Rescue** stay reachable, release
  notes open, and install-button gating stays authoritative.

The deterministic half of the checklist is locked by
[`__tests__/wf-easy-bundle-picker-live-smoke.test.js`](../__tests__/wf-easy-bundle-picker-live-smoke.test.js)
(exactly nine builds; six base bundles backed by live builds; the five
fan-control expansion configs absent so no card is exposable; the import gate
lights a card only on its exact full-composition config; standalone FanPWM /
FanDAC and TRIAC never become Simple cards; stable Bathroom PoE the only
default-selectable build with no freshness false-blocker; preview bundles
`channel:preview`-gated; `REQUIRED_CONFIGS` / `manifest.json` / `firmware/sources.json`
/ `scripts/data/kits.json` unchanged). The checklist is **docs / verification
only** — it imports no firmware, exposes no hidden card, marks no preview
stable / recommended / default, weakens no acknowledgement, and changes no
`REQUIRED_CONFIGS`. Current status: **pending — live operator pass required.**

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
| `WF-IMPORT-RELAY-001` | FanRelay (S360-310) **preview imported** (WEBFLASH-RELAY-001) | _preview done via #711_; stable promotion blocked behind upstream `RELEASE-RELAY-001` |
| `WF-IMPORT-PWM-001` | FanPWM (S360-311) **preview imported** (WEBFLASH-PWM-001) | _preview done via #711_; stable promotion blocked behind upstream `RELEASE-PWM-001` |
| `WF-IMPORT-DAC-001` | FanDAC (S360-312) **preview imported** (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001) | _preview done via #711_; stable promotion blocked behind upstream `RELEASE-DAC-001` |
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
  nine builds — `Ceiling-POE-VentIQ-RoomIQ` (stable), `Ceiling-POE-VentIQ-RoomIQ-LED`
  (preview), the first preview batch `Ceiling-POE-AirIQ-RoomIQ` /
  `Ceiling-POE-RoomIQ` / `Ceiling-POE-RoomIQ-LED` (preview), the three fan-driver
  manual-previews `Ceiling-POE-VentIQ-FanRelay-RoomIQ` / `Ceiling-POE-FanPWM` /
  `Ceiling-POE-FanDAC` (preview), and `Rescue` (rescue) — matching the targets
  enumerated above.
- **Source entries match `firmware/sources.json`.** Eight upstream sources are
  declared: the v1.0.0 Release-One stable build (`block_tokens:
  ["FanTRIAC", "LED"]`), the v1.0.0-led-preview build (`block_tokens:
  ["FanTRIAC"]`), and six v1.0.0-preview builds — `Ceiling-POE-AirIQ-RoomIQ`,
  `Ceiling-POE-RoomIQ`, `Ceiling-POE-VentIQ-FanRelay-RoomIQ`, `Ceiling-POE-FanPWM`
  and `Ceiling-POE-FanDAC` (`block_tokens: ["FanTRIAC", "LED"]`) and
  `Ceiling-POE-RoomIQ-LED` (`block_tokens: ["FanTRIAC"]`). No FanTRIAC source
  entry exists.
- **`REQUIRED_CONFIGS` is production-only.** The allowlist in
  [`.github/workflows/firmware-publish.yml`](../.github/workflows/firmware-publish.yml)
  holds exactly `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`. The six preview builds
  are deliberately absent.
- **FanPWM (S360-311) / FanRelay (S360-310) / FanDAC (S360-312) are preview-only.**
  Each ships a manual-preview build (`available-preview` in
  [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js))
  behind the `channel:preview` acknowledgement — never stable, never a kit /
  default, never in `REQUIRED_CONFIGS`. Stable / full release stays blocked on the
  upstream hardware / bench evidence. FanTRIAC (S360-320) remains build-blocked
  with no manifest build, no source entry, and no install card.
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
  drifted (e.g. AirIQ listed as supported and as the recommended bundle). AirIQ
  now ships a **preview-only** build (`Ceiling-POE-AirIQ-RoomIQ`, not stable, not
  recommended, not a customer default); the recommended state remains RoomIQ +
  VentIQ over PoE with `fan: none`.

## Still authoritative — not superseded

This consolidation is scoped to **product / release status**. The following docs
remain the source of truth in their own lanes and are *not* replaced here:

- [`UPCOMING_PR.md`](../UPCOMING_PR.md) — live WebFlash PR queue (completed /
  active / blocked). Every queue-state-changing PR still updates it.
- [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) — wizard UX audit + PR
  sequence (WF-UX-*). [`docs/ux-roadmap.md`](ux-roadmap.md) is its source review.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — per-family import classes + reserved follow-up PR identifiers.
- `docs/product-import-readiness.md` — catalog eligibility classifier
  contract (archived — see [`docs/archive-index.md`](archive-index.md)).
- `docs/firmware-import.md` — the importer mechanism record (archived — see
  [`docs/archive-index.md`](archive-index.md)).
- `docs/led-preview-import-plan.md` / `docs/led-preview-webflash-proof.md` —
  LED preview import shape + operator proof container (both archived — see
  [`docs/archive-index.md`](archive-index.md)).
- `docs/webflash-bundle-sku-matrix.md` — room bundle SKU naming mirror
  (archived — see [`docs/archive-index.md`](archive-index.md)).

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
