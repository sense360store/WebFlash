# WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001 — WebFlash first-release dry-run operator handoff

**Identifier:** `WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001`

This document mirrors the upstream `sense360store/esphome-public`
**first-release dry-run checklist** onto the WebFlash side. It is the
**operator handoff** that picks up exactly where the upstream dry-run leaves
off: the upstream checklist rehearses *release notes → build → artifact naming
→ checksums* with non-publishing lanes and only *describes* the WebFlash import
/ sign / manifest / deploy steps as a future hand-off; this document states
those WebFlash-owned steps, against WebFlash's **own live install surface**, as
a clear **no-publish operator handoff for the current stable release path**.

> **Docs/status only — promotes nothing, enables nothing, exposes nothing,
> imports nothing.** This document imports no firmware, regenerates no
> manifest, edits no [`firmware/sources.json`](../../firmware/sources.json)
> entry, changes no `REQUIRED_CONFIGS` value, adds no install card / kit /
> kit-preset, exposes no fan-control variant, marks no preview build stable,
> publishes or references no new firmware artifact, and changes no runtime
> install behaviour. Installability is decided by `manifest.json`,
> `firmware/sources.json`, the `REQUIRED_CONFIGS` allowlist in
> [`.github/workflows/firmware-publish.yml`](../../.github/workflows/firmware-publish.yml),
> [`scripts/utils/release-channels.js`](../../scripts/utils/release-channels.js),
> and the existing install gate — **not** by anything written here.

## Purpose and scope

WebFlash is **downstream** of `sense360store/esphome-public`. The cross-repo
boundary is exactly three stable surfaces — release **tags**,
**config-string** values, and **artifact names**. The upstream dry-run
rehearses the *publish* side without publishing; this handoff records the
*import* side without importing, so one operator can:

1. read, for the current stable first-release path, exactly **what WebFlash
   consumes from upstream** (config string, artifact name, version/channel, and
   the four release-body sections);
2. rehearse a future stable re-import end to end with **non-publishing,
   non-mutating** WebFlash lanes (importer `--dry-run`, manifest generator
   `--dry-run`, the read-only validators, and `npm test`); and
3. confirm — with explicit checks — that this rehearsal produced **no** import,
   **no** `firmware/sources.json` change, **no** `manifest.json` change, and
   **no** new WebFlash exposure.

It **threads** existing facts from the sources of truth below; it invents
nothing and changes no state. Where this document and a source-of-truth file
ever disagree, **the source-of-truth file wins** and this doc is the one to fix
— and **upstream wins for lifecycle / gate status** while the WebFlash
`manifest.json` wins for *what flashes today*.

### The one first-release-eligible stable path

There is exactly **one** stable, release-selectable WebFlash build, and it is
the only first-release path. It is **already imported and live** — backed by a
real signed `.bin` on disk, a `manifest.json` build, a `firmware/sources.json`
source, a `REQUIRED_CONFIGS` entry, a `scripts/data/kits.json` kit, and a
Stage-1 bundle preset.

| Field | Value |
|---|---|
| **Upstream bundle SKU** | `S360-KIT-BATH-P` (Bathroom) |
| **Config string** | `Ceiling-POE-VentIQ-RoomIQ` |
| **Channel** | `stable` |
| **Version (current)** | `1.0.0` |
| **Chip family** | `ESP32-S3` |
| **Artifact name pattern** | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v<x.y.z>-stable.bin` |
| **Artifact name (at v1.0.0)** | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` |
| **Upstream release tag** | [`v1.0.0`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0) |
| **WebFlash kit** | `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` → `Ceiling-POE-VentIQ-RoomIQ` |
| **WebFlash Stage-1 preset** | `S360-KIT-BATH-POE` (badge `Recommended`) |

> **Stable installable target: `Ceiling-POE-VentIQ-RoomIQ`.** This is the
> Bathroom stable build (`S360-KIT-BATH-P` upstream) and the only product
> WebFlash can install at first release. **No other config string is
> dry-run-eligible for a stable first release.** The preview LED build
> (`Ceiling-POE-VentIQ-RoomIQ-LED`,
> `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`) is
> **preview-only** — it rides the preview channel behind the `channel:preview`
> acknowledgement and is **not** part of this stable first-release handoff.

### Exact upstream source

| | |
|---|---|
| **Upstream source doc** | [`docs/first-release-dryrun-checklist.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-dryrun-checklist.md) |
| **Upstream canonical id** | `FIRST-RELEASE-DRYRUN-CHECKLIST-001` |
| **Upstream PR** | [#680](https://github.com/sense360store/esphome-public/pull/680) (merged) |
| **Upstream gate source** | [`docs/first-release-gates.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-gates.md) (`PRE-HW-PREP-FIRST-RELEASE-GATES-001`) |
| **Upstream headline** | The only first-release-eligible stable path is `S360-KIT-BATH-P` / `Ceiling-POE-VentIQ-RoomIQ` / `stable` / `v1.0.0`; the dry-run publishes nothing, builds no `.bin`, and changes no WebFlash exposure. |

### Sources of truth (WebFlash side — link, do not duplicate)

| Layer | Source of truth |
|---|---|
| Upstream first-release dry-run checklist | [`docs/first-release-dryrun-checklist.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-dryrun-checklist.md) (`FIRST-RELEASE-DRYRUN-CHECKLIST-001`) |
| WebFlash first-release gate mirror | [`WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md`](WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md) |
| What WebFlash can actually install today | [`manifest.json`](../../manifest.json) + [`firmware/sources.json`](../../firmware/sources.json) + `REQUIRED_CONFIGS` |
| Canonical WebFlash product / release status | [`../sense360-webflash-status.md`](../sense360-webflash-status.md) |
| Cross-repo importer mechanism | [`../firmware-import.md`](../firmware-import.md) · [`scripts/import-firmware-sources.py`](../../scripts/import-firmware-sources.py) |
| Catalog → WebFlash eligibility rules | [`../product-import-readiness.md`](../product-import-readiness.md) · [`scripts/validate-product-import-readiness.js`](../../scripts/validate-product-import-readiness.js) |
| Per-family import classes + reserved follow-up PR slots | [`../webflash-import-readiness-matrix.md`](../webflash-import-readiness-matrix.md) |
| Two-halves architecture + deploy gate | [`../architecture.md`](../architecture.md) |
| Live WebFlash PR queue | [`../../UPCOMING_PR.md`](../../UPCOMING_PR.md) |

---

## 1. The WebFlash side of the dry-run

The first-release path has six observable stages. Upstream exercises the first
four with **non-publishing** lanes and only *describes* the last two; the last
two are **WebFlash-owned**. This handoff is the WebFlash-side companion to
upstream §7 ("What WebFlash must mirror later").

| # | Stage | Owner | Produces a release? |
|---|---|---|---|
| 1 | Generate release notes | upstream | No |
| 2 | Validate release notes | upstream | No |
| 3 | Plan / rehearse the build | upstream | No |
| 4 | Inspect artifact naming + (optional) compile | upstream | No |
| 5 | Publish GitHub Release + checksums + build-info manifest | upstream (real `release: published` only) | Yes (future) |
| 6 | **Import / sign / manifest / deploy / smoke-test** | **WebFlash** | Deploys the installer (no upstream release) |

WebFlash couples to upstream **only** through release tags, config strings, and
artifact names; the upstream board/bundle/alias/shim YAML layering is invisible
to WebFlash (see [`../architecture.md`](../architecture.md) → *Cross-repo
contract*). Stage 6 is what this document rehearses **without** importing or
publishing anything.

---

## 2. Current stable config string (what WebFlash consumes)

The current stable first-release path is **already imported**. The live
[`firmware/sources.json`](../../firmware/sources.json) stable entry pins it:

| Field | Live value |
|---|---|
| `source_repo` | `sense360store/esphome-public` |
| `release_tag` | `v1.0.0` |
| `config_string` | **`Ceiling-POE-VentIQ-RoomIQ`** |
| `channel` | `stable` |
| `version` | `1.0.0` |
| `asset_name` | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` |
| `block_tokens` | `["FanTRIAC", "LED"]` |

This is the only stable config string WebFlash imports. A future stable
re-import (e.g. a `v1.0.1` / `v1.1.0` bump) changes **only** the
`release_tag` / `release_url` / `version` / `asset_name` / `expected_sha256`
fields of *this* entry — it introduces **no** new config string, **no** new
product, and **no** new channel. Writing that change is a future, real action,
**not** part of this handoff.

---

## 3. Expected artifact name

The first-release stable artifact name is the WebFlash contract pattern
`Sense360-{CONFIG_STRING}-v{VERSION}-{CHANNEL}.bin` bound to this config string
and the `stable` channel:

```
Sense360-Ceiling-POE-VentIQ-RoomIQ-v<x.y.z>-stable.bin
```

At the current version `x.y.z = 1.0.0`:

```
Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin
```

This string must match **exactly** — case, hyphens, the `v` prefix, and the
`-stable.bin` suffix all matter. It is the value the operator confirms in three
places that must agree:

- the upstream release asset name (what stage 5 publishes);
- [`firmware/sources.json`](../../firmware/sources.json) → stable
  `asset_name`;
- the imported file under `firmware/configurations/` and the `parts[].path` in
  the generated [`manifest.json`](../../manifest.json) stable build.

[`scripts/validate-naming-policy.js`](../../scripts/validate-naming-policy.js)
enforces the canonical `Sense360-...-vX.Y.Z-(stable|preview|beta).(bin|md)`
filename shape; the importer asserts the fetched asset against the source
entry's declared `asset_name`.

---

## 4. Expected upstream release-note source

WebFlash surfaces the **upstream GitHub release body** as the firmware's
release notes. The body that WebFlash consumes has **four required `##`
sections** — declared per source in
[`firmware/sources.json`](../../firmware/sources.json) →
`required_release_body_sections`:

- `## Changelog`
- `## Known Issues`
- `## Features`
- `## Hardware Requirements`

Expectations the operator confirms:

- The release-note source is the upstream release body at the pinned
  `release_tag` (`v1.0.0`), **not** a WebFlash-authored file. WebFlash does not
  generate or validate the upstream release notes — that is upstream stages 1–2
  (`scripts/generate_webflash_release_notes.py` +
  `scripts/validate-webflash-release-notes.py`), gated at upstream publish time.
- On the `stable` channel, filler changelog text (`TBD`, `Placeholder`,
  `Initial release`, …) is **rejected upstream at publish time**; WebFlash
  imports the body only after that gate has passed.
- After import, the four sections land in the generated `manifest.json` build
  as the `changelog` / `known_issues` / `features` / `hardware_requirements`
  arrays, which the wizard renders. The current stable build already carries
  these (e.g. the `## Known Issues` note that *VentIQ schematic verification is
  still pending* and that *Sense360 TRIAC / FanTRIAC is not included in this
  Release-One firmware*).

---

## 5. Expected checksum / source-update handoff

Integrity is enforced at import time, not asserted in this doc:

- **SHA-256 verification.** The importer
  ([`scripts/import-firmware-sources.py`](../../scripts/import-firmware-sources.py)
  → `verify_sha256`) downloads the upstream `.bin` **and** the upstream
  `checksums-sha256.txt`, and refuses to write the asset unless the computed
  SHA-256 matches the upstream checksum line for that file. `checksums-md5.txt`
  is carried for compatibility only; SHA-256 is the canonical integrity record.
- **Pinned `expected_sha256` (when declared).** A source entry may pin
  `expected_sha256`; when present the importer enforces it in addition to the
  upstream checksum (hardened by WF-LED-002). Today the **LED preview** source
  pins `expected_sha256: 93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`;
  the **Release-One stable** source relies on the upstream
  `checksums-sha256.txt` match plus the `min_size_bytes: 102400` floor. A
  future stable re-import would pin the new artifact's `expected_sha256` in the
  same stable entry.
- **Post-import integrity record.** Once imported and signed, the generated
  `manifest.json` stable build records the artifact `sha256`
  (`9169f2ce486d14d3c0e0b1d6e9adf558480db6ec301f8eac1622fda4d7ceffcc`),
  `md5`, `file_size` (`1087488` bytes), and the WebFlash production signatures
  (`signature` / `signature_ed25519` / `signature_key_id`). WebFlash — **not**
  upstream — owns signing; upstream publishes **unsigned** `.bin` assets plus
  checksums and a build-info `manifest.json` (metadata, **not** the production
  manifest).

The **source-update handoff** for a future stable release is therefore: bump
the stable `firmware/sources.json` entry (`release_tag`, `release_url`,
`version`, `asset_name`, `expected_sha256`) → re-run the importer → regenerate
manifests. **None of that is performed by this PR.**

---

## 6. WebFlash import expectations (stage 6, non-publishing rehearsal)

New firmware enters the WebFlash tree through the **cross-repo importer**, not
by hand-copying a `.bin`. The full stage-6 sequence (see
[`../firmware-import.md`](../firmware-import.md)) is:

1. **Import.** [`scripts/import-firmware-sources.py`](../../scripts/import-firmware-sources.py)
   (or dispatch [`.github/workflows/firmware-import.yml`](../../.github/workflows/firmware-import.yml))
   fetches the upstream `.bin`, SHA-256-verifies it (§5), enforces the
   per-source `block_tokens` allowlist (`["FanTRIAC", "LED"]` on the stable
   source), and writes the `<asset>.meta.json` sidecar.
2. **Generate manifests.** [`scripts/gen-manifests.py`](../../scripts/gen-manifests.py)
   scans `firmware/`, parses each filename, and regenerates a single
   `manifest.json` plus one `firmware-<index>.json` per build.
3. **Sign.** WebFlash signs the firmware with the production key (private key
   lives only in WebFlash).
4. **Deploy.** [`.github/workflows/firmware-publish.yml`](../../.github/workflows/firmware-publish.yml)
   runs the unit tests, the naming-policy validator, the manifest generator,
   and the `REQUIRED_CONFIGS` allowlist check, then deploys the static site to
   GitHub Pages.
5. **Smoke-test.** [`scripts/smoke-test-deployment.py`](../../scripts/smoke-test-deployment.py)
   confirms the deployed manifest is reachable, current, free of
   placeholder/tiny firmware, and that the rescue firmware exists.

### 6.1 Non-publishing, non-mutating rehearsal lanes

To rehearse stage 6 for a future stable re-import **without** importing or
deploying anything, an operator runs only read-only / `--dry-run` lanes:

```bash
# 1. Rehearse the import WITHOUT writing the .bin or sidecar.
#    Fetches + SHA-256-verifies the upstream asset, enforces block_tokens,
#    and prints "[dry-run] Would write ..." instead of writing.
python3 scripts/import-firmware-sources.py --dry-run

# 2. Preview manifest regeneration WITHOUT writing manifest.json / firmware-*.json.
python3 scripts/gen-manifests.py --dry-run --summary

# 3. Read-only validators.
node scripts/validate-naming-policy.js firmware/configurations
node scripts/validate-product-import-readiness.js

# 4. Full guard suite (manifest-health, product-catalog-alignment, kits, …).
npm test
```

None of these lanes writes firmware, mutates `firmware/sources.json` or
`manifest.json`, creates a GitHub release, or changes WebFlash exposure.

---

## 7. WebFlash no-publish / no-exposure safety checklist

Run top to bottom. Every box is a **non-publishing, non-exposing** action; this
handoff itself ticks none of them.

- [ ] **Importer dry-run is read-only.** `import-firmware-sources.py --dry-run`
      fetched + SHA-256-verified the upstream asset and printed `[dry-run] Would
      write …` — **no** `firmware/configurations/*.bin` and **no** `.meta.json`
      sidecar were written.
- [ ] **Manifest generator dry-run is read-only.** `gen-manifests.py --dry-run`
      printed `[dry-run] Would write …` — `manifest.json` and every
      `firmware-*.json` are byte-identical.
- [ ] **`firmware/sources.json` is unchanged.** Still exactly two upstream
      sources (`v1.0.0` stable + `v1.0.0-led-preview`); no new entry, no field
      edit.
- [ ] **`REQUIRED_CONFIGS` is unchanged.** Still production-only
      `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
- [ ] **No new exposure.** No install card, no kit
      (`scripts/data/kits.json`), and no Stage-1 kit-preset
      (`scripts/data/kit-presets.js`) was added or changed.
- [ ] **LED stays preview-only.** No LED build moved to `stable`, into
      `REQUIRED_CONFIGS`, or into a kit; the `channel:preview` acknowledgement
      gate is intact.
- [ ] **Fan-control variants stay not-exposed.** `FanRelay` / `FanPWM` /
      `FanDAC` / `FanTRIAC` have no build, source, or install card; the
      FanTRIAC `block_tokens` block stands.
- [ ] **Blocked room bundles stay not-installable.** Kitchen / Bedroom /
      Living / Corridor remain naming-reference only.
- [ ] **No artifact published or referenced as new.** No GitHub release, no
      tag, no new `.bin` referenced as published.
- [ ] **Runtime install behaviour unchanged.** No wizard, service-worker, CSP,
      or workflow change.

---

## 8. Post-import verification checklist (for a *future* real stable re-import)

This is the gate a real WebFlash stable re-import must clear. It is recorded
here for planning; **no box is ticked by this handoff.** Tick only with
recorded evidence (a run URL / release URL / hardware record).

### 8.1 Upstream handoff inputs (consumed, not produced here)

- [ ] Upstream `Build & Release Firmware` workflow completed on a real
      `release: published` event for the stable tag.
- [ ] Exactly one stable `.bin` is attached and its name matches the contract
      pattern (§3) exactly.
- [ ] `checksums-sha256.txt` is attached and lists the stable artifact; the
      recorded SHA-256 matches the `.bin`.
- [ ] The release body has all four `##` sections (§4) and passed the upstream
      publish-time gates.

### 8.2 WebFlash import / sign / manifest / deploy

- [ ] The stable `firmware/sources.json` entry was bumped (tag / version /
      asset_name / `expected_sha256`) and the importer SHA-256 verification
      passed (§5).
- [ ] The imported `.bin` + `.meta.json` sidecar are on disk under
      `firmware/configurations/`.
- [ ] `manifest.json` + every `firmware-*.json` were regenerated by
      `gen-manifests.py` and the `manifest-health` guard is green
      (no missing `.bin`, no missing sidecar, no per-build drift, no blocked
      token, every `REQUIRED_CONFIGS` entry present).
- [ ] The build is signed with the production key.
- [ ] `Ceiling-POE-VentIQ-RoomIQ` is present in the regenerated `manifest.json`
      and in `REQUIRED_CONFIGS`.

### 8.3 Deploy + smoke + hardware

- [ ] `firmware-publish.yml` deployed to GitHub Pages with the publish gate
      green (unit tests + naming policy + manifest generator +
      `REQUIRED_CONFIGS` allowlist).
- [ ] `smoke-test-deployment.py` passed (manifest reachable; commit current; no
      placeholder/tiny firmware; rescue firmware exists).
- [ ] Real-hardware flash test recorded (device flashes via WebFlash, boots,
      Wi-Fi/Improv completes, RoomIQ + VentIQ report, rescue path available).

---

## 9. No-new-exposure statement

This handoff mirrors a checklist; **it exposes nothing new and imports
nothing.** Specifically, this document — and the PR that adds it — does
**not**:

- **expose any new product.** No `manifest.json` build, `firmware/sources.json`
  source, or `.bin` is added; the only stable first-release path stays
  `Ceiling-POE-VentIQ-RoomIQ`.
- **expose any fan-control variant.** `FanRelay`, `FanPWM`, `FanDAC`, and
  `FanTRIAC` stay not-exposed; the FanTRIAC `block_tokens` block stands.
- **mark LED stable.** `Ceiling-POE-VentIQ-RoomIQ-LED` **remains preview-only**
  — preview channel, gated on the `channel:preview` acknowledgement, **not** in
  `REQUIRED_CONFIGS`, **not** a kit. **No LED-stable claim is made.**
- **make Kitchen / Bedroom / Living / Corridor installable.** They **remain not
  installable** — naming-reference only, with no build, source, or install
  card.
- **change `firmware/sources.json` or `manifest.json`.** Both are **not changed
  by this PR**; they stay byte-identical (§10).
- add or change any `REQUIRED_CONFIGS` entry, install card, kit, or kit-preset;
- publish or reference any new firmware artifact, tag, or release;
- change any runtime install behaviour, wizard surface, service worker, CSP, or
  workflow.

---

## 10. No-drift confirmation

Every install-surface value below is **unchanged** by this document and matches
the live repository state at handoff time.

| Surface | Value (unchanged) |
|---|---|
| `manifest.json` | 3 builds — `Ceiling-POE-VentIQ-RoomIQ` (stable), `Ceiling-POE-VentIQ-RoomIQ-LED` (preview), `Rescue` (rescue) |
| `firmware/sources.json` | 2 upstream sources — `v1.0.0` stable (`block_tokens: ["FanTRIAC", "LED"]`) and `v1.0.0-led-preview` (`block_tokens: ["FanTRIAC"]`); no fan-driver source |
| `REQUIRED_CONFIGS` | `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` (production-only) |
| `scripts/data/kits.json` | Release-One-only — `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` → `Ceiling-POE-VentIQ-RoomIQ` |
| `scripts/data/kit-presets.js` | 2 installable presets (`S360-KIT-BATH-POE` stable, `S360-KIT-BATH-POE-LED` preview) + 4 `Planned` fan-control cards |
| Fan-control exposure | None — no `FanPWM` / `FanRelay` / `FanDAC` / `FanTRIAC` build, source, or install card |
| S360-410 (PoE PSU) | `cataloged_unverified` upstream; PoE covered transitively via the `power=poe` segment; no standalone PoE-PSU build; broader bundle expansion stays blocked |

No firmware was imported; no manifest was regenerated; no source entry was
added or edited; no install card was added; no preset was changed; no
fan-control variant was exposed; no firmware artifact was published or
referenced as new.

---

## 11. WebFlash ↔ upstream dry-run stage map

| Upstream `docs/first-release-dryrun-checklist.md` section | WebFlash handoff |
|---|---|
| §"The one first-release-eligible stable path" | §"The one first-release-eligible stable path" (`Ceiling-POE-VentIQ-RoomIQ` / `stable` / `v1.0.0`) |
| §1 Stages 1–4 (release notes → build → naming → checksums) | §1 (upstream-owned; WebFlash consumes the outputs) |
| §5 Artifact naming + checksums | §3 Expected artifact name + §5 Expected checksum handoff |
| §6 What goes into upstream's `firmware/sources.json` later | §2 Current stable config string + §5 source-update handoff (WebFlash's own `firmware/sources.json`) |
| §7 What WebFlash must mirror later | §6 WebFlash import expectations (stage 6) |
| §8 Rollback / no-publish safety | §7 WebFlash no-publish / no-exposure safety checklist |
| §9 Dry-run checklist (operator) | §6.1 non-publishing rehearsal lanes + §7 |
| §10 Publish-readiness checklist | §8 Post-import verification checklist |
| §11 Guardrails (explicitly NOT changed) | §9 No-new-exposure statement + §10 No-drift confirmation |

---

## Cross-references

- Upstream first-release dry-run checklist:
  [`sense360store/esphome-public` → `docs/first-release-dryrun-checklist.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-dryrun-checklist.md)
  (`FIRST-RELEASE-DRYRUN-CHECKLIST-001`, PR #680).
- Upstream first-release gate checklist:
  [`docs/first-release-gates.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-gates.md)
  (`PRE-HW-PREP-FIRST-RELEASE-GATES-001`, PR #679).
- WebFlash first-release gate mirror:
  [`WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md`](WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md).
- In-repo gate mirror:
  [`PRE-HW-PREP-FIRST-RELEASE-GATES-001.md`](PRE-HW-PREP-FIRST-RELEASE-GATES-001.md).
- Canonical WebFlash status:
  [`../sense360-webflash-status.md`](../sense360-webflash-status.md).
- Cross-repo importer mechanism:
  [`../firmware-import.md`](../firmware-import.md).
- Catalog eligibility classifier contract:
  [`../product-import-readiness.md`](../product-import-readiness.md).
- Per-family import classes + reserved follow-up PR slots:
  [`../webflash-import-readiness-matrix.md`](../webflash-import-readiness-matrix.md).
- Two-halves architecture + deploy gate:
  [`../architecture.md`](../architecture.md).
- Live WebFlash PR queue: [`../../UPCOMING_PR.md`](../../UPCOMING_PR.md).
