# WebFlash - Sense360 ESP32 Firmware Installer

Browser-based firmware installation for Sense360 ESP32 devices using ESP Web Tools.

**Live Site:** https://sense360store.github.io/WebFlash/

## Overview

WebFlash provides a step-by-step wizard for configuring and flashing Sense360 firmware to ESP32 devices directly from your browser. No drivers or local toolchains required.

For how WebFlash is built — the publishing pipeline and wizard frontend, the `manifest.json` boundary, the desktop-only constraint, and the deploy gate — see [`docs/architecture.md`](docs/architecture.md).

## Requirements

- Chromium-based browser (Chrome, Edge, Opera)
- Windows, macOS, or Linux
- USB data cable
- Sense360 ESP32 device

Note: Firefox and Safari have limited Web Serial support and may not work.

## Quick Start

1. Navigate to https://sense360store.github.io/WebFlash/
2. Configure your device:
   - Select mounting type (Ceiling only)
   - Choose power source (USB, Sense360 PoE PSU, or Sense360 240v PSU)
   - Enable optional modules (Sense360 RoomIQ, Sense360 AirIQ or Sense360 VentIQ, Sense360 LED, Sense360 Relay/PWM/DAC, Sense360 TRIAC)
3. Review the recommended firmware configuration
4. Wait for the firmware integrity check to complete
5. Acknowledge **Before you flash** checklist
6. Resolve preflight failures (and warnings when applicable)
7. Click "Install Firmware" to flash via browser
8. Follow ESP Web Tools prompts to complete installation

## Configuration Options

### Mounting Type
- **Ceiling Mount**: The only currently supported mount.

### Power Source
- **USB Power**: USB-C connection direct to the Core.
- **Sense360 PoE PSU** (`S360-410`): Power over Ethernet backplate.
- **Sense360 240v PSU** (`S360-400`): 240V mains-to-5V supply (HLK-5M05).

### Expansion Modules
- **Sense360 RoomIQ** (`S360-200`): Room sensor board with PIR, mmWave presence (LD2450), light (LTR-303ALS), temperature/humidity (SHT4x), and pressure (BMP581).
- **Sense360 AirIQ** (`S360-210`): Air-quality board with CO₂ (SCD41), VOC (SGP41), and gas (MICS-4514). Optional connectors for SPS30 (PM) and SFA30 (HCHO).
- **Sense360 VentIQ** (`S360-211`): Bathroom-focused air-quality board (SGP41 onboard, IR-temp + SPS30 connectors). Only appears when Bathroom mode is on; mutually exclusive with AirIQ.
- **Sense360 LED** (`S360-300`): WS2812B addressable LED ring.
- **Sense360 Relay** (`S360-310`): On/off relay for bathroom fans.
- **Sense360 PWM** (`S360-311`): 12V PWM driver, up to 4 fans with tach feedback.
- **Sense360 DAC** (`S360-312`): 0–10V analog driver (e.g. Cloudlift S12). Conflicts with AirIQ on the shared DAC bus.
- **Sense360 TRIAC** (`S360-320`): Phase dimmer for mains fan or lamp.

### Kit / SKU configuration mode

Step 1 of the wizard now offers two paths:

1. **I know my kit or SKU** — for customers who bought a Sense360 bundle and
   want to pick it by name without thinking about cores, modules, or power
   options. The Step 1 picker loads kit metadata from
   [`scripts/data/kits.json`](scripts/data/kits.json) and offers both a
   searchable input (keyboard-friendly, autocompletes against the kit list)
   and a fallback dropdown.
2. **Choose hardware manually** — the original per-module flow (Mount → Power
   → Modules → Review). All compatibility checks, conflict warnings, release
   channel rules, provenance gating, and shareable-link behaviour remain
   unchanged in manual mode.

Selecting a kit is shorthand for the manual selections that match it: the
kit's `wizard_state` is fed through the same `setState()` that manual
selection uses, the existing compatible-firmware lookup runs, and the user
is taken to Step 5 to review the recommended firmware. Kit selection
**never** bypasses provenance, release-channel acknowledgement, the freshness
banner, or the install gate — it just fills in the same boxes a user would
have filled in manually.

#### Adding a new kit

Edit [`scripts/data/kits.json`](scripts/data/kits.json) and append a kit
entry. Each kit is an object with the following fields:

| Field | Required | Description |
|---|---|---|
| `sku` | ✅ | Customer-facing kit identifier. We use the `S360-KIT-…` prefix to keep kit SKUs distinct from per-module SKUs (`S360-100`, `S360-200`, …). Match is case-insensitive. |
| `display_name` | ✅ | Friendly product name shown in the picker and the explanation panel. |
| `description` | optional | One-sentence description shown under the title. |
| `recommended` | optional | Hint flag (defaults to `false`); reserved for future "recommended kit" UI. |
| `sample` | optional | Set to `true` for example/demo entries that integrators should replace with real SKUs. The diagnostics bundle records the `sample` flag so support can tell a real customer order from a placeholder selection. |
| `wizard_state` | ✅ | The exact wizard state the kit maps to. Must contain `mount: "ceiling"` and a `power` value (`usb`, `poe`, or `pwr`). All module slots default to `"none"` if omitted. Keys: `mount`, `power`, `bathroom`, `airiq`, `ventiq`, `roomiq`, `fan`, `led`, `voice`. |
| `components` | optional | Display-only list of `{sku, label}` pairs (e.g. `S360-100 — Sense360 Core`). |
| `headers_required` | optional | Display-only list of header names required to wire the kit up. |
| `firmware_config_string` | ✅ | Must exactly match a `build.config_string` in `manifest.json` (e.g. `Ceiling-POE-VentIQ-RoomIQ`). The kit-config loader rejects entries that don't resolve. |
| `firmware_channel` | optional | Default channel preference (`stable`, `beta`, `preview`, `dev`). The release-channel picker still requires the user to acknowledge non-stable channels — kit metadata never bypasses this. Defaults to `stable`. |
| `notes`, `known_limitations` | optional | String arrays surfaced in the explanation panel (currently unused; reserved). |

When you add a new firmware configuration to `manifest.json`, also add the
`config_string` to `REQUIRED_CONFIGS` in
`.github/workflows/firmware-publish.yml` so CI keeps the manifest covered.
New shipping firmware should arrive through the cross-repo importer —
declare it in [`firmware/sources.json`](firmware/sources.json) and run
[`scripts/import-firmware-sources.py`](scripts/import-firmware-sources.py)
(see [`docs/firmware-import.md`](docs/firmware-import.md)). Manual
placement of a `.bin` into `firmware/configurations/` is reserved for
hand-curated builds that already satisfy the `.meta.json` sidecar,
manifest-health, and `REQUIRED_CONFIGS` expectations.

Kits with malformed entries (missing `sku`, unknown `power` value,
unsupported `firmware_channel`, …) are silently skipped at load time so a
single bad entry can't break the whole picker. Skipped entries are
reported via `console.warn` and listed in the catalog's `skipped` array
returned by `loadKitCatalog()` — `__tests__/kit-config.test.js` exercises
each rejection path.

#### How kit metadata maps to manual configuration

A kit selection runs three steps:

1. The wizard module slots are **reset to defaults** so a stale manual pick
   doesn't combine with the kit definition.
2. The kit's `wizard_state` is applied via `setState()` — the same path the
   manual flow uses. AirIQ/VentIQ exclusivity, the bathroom toggle, and the
   fan/AirIQ DAC conflict are still enforced by `state.js`.
3. The existing compatible-firmware lookup picks the firmware build that
   matches the kit's `firmware_config_string`. If no compatible firmware is
   available (e.g. the manifest is stale or the kit references a
   `config_string` that hasn't been published yet) the wizard surfaces a
   clear error and offers a fallback to manual mode.

#### Unknown SKUs

If the user types or pastes a SKU that isn't in the catalog, the picker
shows: *"We could not find that kit. Check the label or choose hardware
manually."* The "Continue" button stays disabled until a valid kit is
chosen, and a one-click switch to manual mode is offered.

#### Switching between kit and manual mode

- Switching to manual after a kit selection clears the kit's diagnostics
  fields but keeps the resolved hardware selections so Step 4 reflects what
  the kit applied — the user can fine-tune from there.
- Switching to kit mode after manual selections resets module slots back to
  `"none"` *before* applying the kit, so a stale manual pick can never
  silently combine with the kit definition.
- The `mode: "kit" | "manual"` field in the diagnostics bundle records
  which path was last active, plus the SKU when in kit mode.

#### Shareable links

A kit-mode share link uses two extra parameters in addition to the existing
manual-mode params (`mount`, `power`, `airiq`, …):

- `configmode=kit` — explicitly requests the kit picker (defaults to `kit`
  when neither `configmode=` nor manual params are present).
- `sku=<SKU>` — the kit SKU. Match is case-insensitive.

Example: `https://flash.sense360.com/?configmode=kit&sku=S360-KIT-CEILING-AIRIQ-POE`.

If the SKU is unknown the page falls back to the manual flow and shows a
"No kit found for SKU …" error. Existing manual share links continue to
work — the picker detects manual params (`mount=`, `power=`, …) in the URL
and stays in manual mode.

> Note: we deliberately use `configmode=…` rather than `mode=…` because
> the existing release-channel logic in `state.js` already consumes
> `mode=recovery` / `mode=development`. Keeping the kit picker on its own
> namespace prevents the two systems from clobbering each other.

#### Diagnostics

The diagnostics bundle (`Copy diagnostics` in Step 5) carries a top-level
`configuration` block:

```json
{
  "configuration": {
    "mode": "kit",
    "sku": "S360-KIT-CEILING-AIRIQ-POE",
    "kit_display_name": "Sense360 Ceiling AirIQ Kit (PoE)",
    "kit_sample": true,
    "resolved_core": "core",
    "resolved_modules": ["airiq"],
    "resolved_power": "poe",
    "resolved_firmware_config": "Ceiling-POE-VentIQ-RoomIQ"
  }
}
```

Manual mode emits a leaner block with `mode: "manual"`, `selected_core`,
`selected_modules`, and `selected_power`. Kit metadata never includes
customer identity, order details, shipping data, or anything that wasn't
already in the public kit definition.

### Release Channels

WebFlash organises every firmware build under one of seven release tiers. The
wizard surfaces the channel as a badge, displays the warning copy described
below, and gates the install button on the matching acknowledgements before
ESP Web Tools is allowed to start.

| Channel | Audience | Default? | Visibility | Warning copy | Acknowledgement |
|---|---|---|---|---|---|
| **Stable** | All customers / production deployments | ✅ Default when compatible and not deprecated | Always visible | None | None |
| **Beta** | Testers willing to accept regressions ahead of stable | ❌ Never default | Always visible | "Beta firmware is intended for testers…" (visible warning) | Required tickbox before install |
| **Preview** | Experimenters evaluating upcoming capabilities | ❌ Never default | Always visible | "Preview firmware is experimental…" (stronger warning) | Required tickbox before install |
| **Development** | Internal engineers / advanced users running unsupported builds | ❌ Never default | **Hidden** unless the wizard is loaded with `?mode=development` | "Development firmware is intended for internal testing…" (danger banner) | Required tickbox before install |
| **Recovery** (rescue) | Users intentionally entering the unbrick / rollback / factory-restore path | ❌ Never default | **Hidden** unless the wizard is loaded with `?mode=recovery` | "Recovery firmware is for unbricking, factory restore, or rollback only…" (danger banner) | Channel itself is the consent gesture; warning copy is shown |
| **Deprecated** | Lifecycle-retired builds retained for diagnostic comparison | ❌ Never default | Visible alongside its channel | "This firmware build is deprecated…" (warning banner with reason) | Required tickbox before install |
| **Recommended** | Not a channel — a presentation flag | — | Renders as an extra badge on the auto-selected default | None | None |

Notes on the policy:

- **Stable is the only `defaultSelectable` tier.** When the user finishes the
  wizard, the firmware version dropdown auto-picks the newest non-deprecated
  stable build. Beta / preview / dev / rescue stay user-selectable but never
  become the default.
- **Deprecated is orthogonal to channel.** A deprecated stable build still
  shows the `Stable` badge plus a separate `Deprecated` badge, and requires a
  deprecation acknowledgement on top of any channel acknowledgement.
- **Hidden tiers must be opted into via URL.** Recovery firmware appears only
  when the page is loaded with `?mode=recovery`; development firmware appears
  only with `?mode=development`. Production deployments must never link to
  those modes from public marketing surfaces.
- **No browser-side cryptographic signature verification is implemented.**
  The channel UI displays the provenance results produced by the
  validation layer in `scripts/utils/firmware-provenance.js`, but the
  browser does not verify firmware against a pinned trusted public key.
  The presence of a `signature` blob in the manifest is signing
  *metadata*, not proof of cryptographic authenticity. See the
  "Firmware provenance and verification" section below for the full
  trust model.
- **Channel synonyms.** `general`, `ga`, `release`, `prod`, `production`,
  `lts` map to **Stable**. `rc`, `candidate` map to **Beta**. `prerelease`
  maps to **Preview**. `alpha`, `nightly`, `canary`, `experimental` map to
  **Development**. `recovery`, `rollback`, `restore`, `unbrick` map to
  **Recovery**. The full alias map lives in
  [`scripts/utils/release-channels.js`](scripts/utils/release-channels.js).
- **Acknowledgement is bound to firmware identity.** Consent ticked for one
  risky build does **not** carry over to a different risky build. Each
  acknowledgement is internally bound to a firmware-identity signature
  derived from `(channel, build ID/URL, version, config_string, deprecated,
  deprecation_reason)`. If any of those fields change — including a hardware-
  profile switch in step 4, a new beta/preview/dev version appearing in the
  manifest, the deprecated flag flipping, or the deprecation reason being
  rewritten — the gate treats prior consent as stale and forces the user to
  acknowledge again. The signature helper is
  `getFirmwareAcknowledgementSignature` in
  [`scripts/utils/release-channels.js`](scripts/utils/release-channels.js); the
  prune-on-mismatch enforcement lives in `state.js`.


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



## Preflight checks and install gating

Step 5 includes a **Preflight checks** panel with these labels:

- **Browser support**
- **Device connection visibility**
- **Connection quality**
- **Firmware verification**
- **User acknowledgement**

Each check reports `Pass`, `Warning`, or `Fail`. Current install/download gating behavior:

- Any `Fail` blocks install/download.
- The **Before you flash** checkbox (`I understand and will keep the hub powered and connected throughout flashing.`) must be checked.
- When at least one check reports `Warning`, an **Accept preflight warnings** checkbox appears in the preflight panel and must be checked before the install/download button is enabled. The checkbox is hidden again automatically as soon as the warning condition clears.

## Firmware provenance and verification

> **Limitation up front.** WebFlash validates provenance *metadata* and the
> required integrity fields. Unless browser-side signature verification is
> implemented, signature metadata presence does not by itself prove
> cryptographic authenticity. The runtime install gate is honest about this
> and surfaces it as an explicit `signature_verified: skip` check.

Flashing is supply-chain-sensitive: the wizard hands a binary to ESP Web
Tools that overwrites the device's flash. WebFlash separates seven concerns
so the trust model is explicit and hard to bypass:

1. **Metadata presence** — does the manifest entry ship the fields we need
   to even reason about provenance? (`sha256`, `signature`, `source_commit`,
   `file_size`, firmware path, artifact identity)
2. **Hash integrity metadata** — does the entry expose a SHA-256 we can
   check the binary against once it has been downloaded?
3. **Hash verification after download** — performed by `state.js` when the
   browser supports SubtleCrypto: the downloaded bytes are hashed and
   compared to the manifest's `sha256`. This is real integrity enforcement
   over the bytes-on-the-wire.
4. **Signature metadata presence** — does the entry carry a `signature`
   blob? **The existing `signature` is a salted SHA-256 with a publicly
   known salt; it is integrity metadata, not a public-key signature.**
5. **Cryptographic signature verification** — **not implemented.** The
   browser does not verify the firmware against a pinned trusted public
   key. The check `signature_verified` is reported with `status: 'skip'` so
   consumers cannot accidentally interpret a `pass` as authenticity.
6. **Source provenance** — does the entry name the source commit AND a
   stable, **immutable** source URL (e.g. `/commit/<sha>`, never
   `/tree/main` or `/releases/latest`)?
7. **Release/changelog completeness** — does the build ship a
   human-authored changelog appropriate for its channel?

### What blocks flashing today

The runtime gate (`scripts/utils/firmware-provenance.js`) refuses to start a
binary download when any of these checks fail:

- `sha256_metadata_present` — missing for ANY remotely flashable channel
- `signature_metadata_present` — missing
- `source_commit_present` — missing
- `file_size_present` — missing or zero
- `firmware_path_present` — missing manifest `parts[].path`
- `artifact_identity_present` — missing `config_string`/`model`
- `file_size_plausible` — between the placeholder sentinel (≤64 B) and the
  per-artifact-type plausible threshold
- `source_url_immutable` — fails when `source_url` references a branch
  (`/tree/main`, `/blob/master`), a moving tag (`/releases/latest`), or
  doesn't include `source_commit` (production mode)
- `channel_allowed_for_mode` — fails when a `dev`/`test`/`nightly` channel
  build is loaded outside `?mode=development`
- `changelog_present` — fails for stable channels when the changelog is
  empty, an auto-generated synth line, or generic boilerplate
  ("Initial release.", "TBD", …)

Critical primitives (sha256, signature, source_commit, file_size, firmware
path, artifact identity) are blocking on **every** remotely flashable
channel, not just stable. A beta build missing `sha256` cannot be flashed.

### What only warns

- `lifecycle_status` — `deprecated: true` produces a warning the user must
  acknowledge in the release-channel layer; missing `deprecation_reason`
  warns but does not block.
- `changelog_present` on `preview`/`beta`/`rc`/`candidate` channels —
  warning rather than fail, since downstream channels are explicit opt-in.
- File-size placeholder fixtures (`≤64 B`) — tolerated by default so the
  18-byte stubs already shipped in the repo do not trip the gate; surfaces
  as a warning if `allowPlaceholderSize: false` is set.

### Signature verification — explicit non-claim

WebFlash deliberately does NOT use the words "signature verified",
"cryptographically verified firmware", "signed firmware verified", or
"verified signature" in any user-facing surface. The acceptable phrasings
across UI and docs are:

- "Signature metadata present."
- "Firmware includes signing metadata."
- "SHA-256 metadata is present."
- "Firmware integrity is checked separately after download."
- "Browser-side signature verification is not yet implemented."

If browser-side signature verification is added later, flip the
`signature_verified` check from `skip` to `pass`/`fail` and update this
section.

### Required manifest fields

Every `manifest.json` `builds[]` entry must carry:

| Field | Purpose | Generated by |
|---|---|---|
| `sha256` | SHA-256 of the binary, re-checked at runtime against the downloaded bytes | `gen-manifests.py` (digest of `.bin`) |
| `signature` | Salted SHA-256 *integrity metadata* (NOT a public-key signature). Re-checked at runtime as a redundant integrity check; passing it does not establish cryptographic authenticity. | `gen-manifests.py` (digest + `Sense360 Firmware Signing Salt v1`) |
| `source_commit` | Git SHA the firmware was produced from; required so a flashed device is traceable to a specific tree | `WEBFLASH_SOURCE_COMMIT` env var, then `git rev-parse HEAD` |
| `source_url` | URL pointing at the **commit** the firmware was produced from. Mutable references like `/tree/main` or `/releases/latest` are rejected in production mode. | Built from `--source-url-template` (default: GitHub commit URL) |
| `signed_by` | Optional identifier of the signing party (CI, release engineer). Treated as metadata only — not as proof of verification. | Sidecar `*.meta.json` |
| `file_size` | Declared file size, validated against the per-artifact-type plausible threshold | `gen-manifests.py` (`stat`) |
| `artifact_type` | One of `application` (default, ≥100 KB), `rescue` (≥50 KB), `bootloader` (≥1 KB), `partition_table` (≥256 B), `test_fixture` (any size in dev/test mode). | `gen-manifests.py` from sidecar `artifact_type` |
| `local_only` | Optional. Marks builds that are not exposed via remote URLs; relaxes some metadata-presence checks. Defaults to `false`. | Sidecar `*.meta.json` |
| `changelog` | Non-empty list of **human-authored** change notes for stable builds. Auto-generated synth lines and generic boilerplate ("TBD", "Initial release.") are rejected. | Sidecar `*.meta.json` or release-notes file — never auto-synthesised |
| `deprecated` | Marks builds that should not be auto-selected | Sidecar `*.meta.json` (default `false`) |
| `deprecation_reason` | Free-form rationale; **required** when `deprecated: true` (production-mode strict validation enforces this). | Sidecar `*.meta.json` |

### Sidecar metadata

To attach hand-curated provenance to a build, drop a JSON sidecar next to the binary:

```
firmware/configurations/Sense360-<config>-v<X.Y.Z>-stable.bin
firmware/configurations/Sense360-<config>-v<X.Y.Z>-stable.meta.json
```

Supported keys (all optional):

```json
{
  "artifact_type": "application",
  "local_only": false,
  "deprecated": true,
  "deprecation_reason": "Superseded by v2.0.0; retained for diagnostic comparison.",
  "signed_by": "Sense360 release pipeline",
  "source_commit": "abcdef1234...",
  "source_url": "https://github.com/sense360store/WebFlash/commit/abcdef1234",
  "changelog": ["Fixes mmWave driver init crash on cold boot."],
  "known_issues": ["LED ring may flash white briefly during update."],
  "features": ["PoE-powered Sense360 Core configuration"],
  "hardware_requirements": ["Sense360 Core R4 or newer"],
  "improv": true
}
```

When firmware is published via a GitHub Release,
`scripts/sync-from-releases.py` parses the release body and writes this
sidecar automatically — see `DEVELOPER.md → Via GitHub Releases` for the
full operator flow. Hand-authored sidecars committed alongside the
binary are detected before generation runs and take precedence, so
manual overrides keep working.

The publishing pipeline enforces sidecar quality so sidecars cannot
silently paper over missing provenance with boilerplate:

- `changelog` must be a non-empty array for stable builds; generic
  filler text (`"Initial release."`, `"TBD"`, `"Placeholder"`, …) is
  treated as missing.
- `source_commit` is required for traceability.
- `deprecation_reason` is required when `deprecated: true`.
- `known_issues`, when present, must be an array.
- `signed_by` is recorded as metadata; it is never treated as proof of
  verification.

When no sidecar is present, `gen-manifests.py` falls back to git for
`source_commit`/`source_url`. Changelogs are **never** auto-synthesised — a
generated changelog proves only that the generator ran, not that a human
documented the release.

### Runtime install gate

Before any binary is downloaded, `scripts/utils/firmware-provenance.js`
runs `validateFirmwareProvenance(build)`:

- **Critical primitives** (`sha256`, `signature`, `source_commit`,
  `file_size`, firmware path, artifact identity) are **blocking on every
  remotely flashable channel** — stable, beta, preview, rc, candidate,
  rescue. A beta build missing `sha256` cannot be flashed.
- **Stable channel changelog**: missing/auto-generated/filler produces a
  `fail` status with a blocking install reason.
- **Other channel changelog (preview/beta)**: missing changelog surfaces
  as a warning rather than a fail.
- **dev/nightly/experimental/test channels** are blocked unless the page
  is loaded with `?mode=development`. The runtime check refuses to flash
  them in production mode even when their metadata is otherwise valid.
- **File size sanity** is artifact-type aware. `application` requires
  ≥100 KB; `rescue` ≥50 KB; `bootloader` ≥1 KB; `partition_table` ≥256 B.
  `test_fixture` is exempt only when running in development/test mode.
- **Source URL immutability**: a `source_url` that references a branch,
  HEAD, or `/releases/latest` blocks install in production mode. The URL
  must contain the recorded `source_commit`.
- **Deprecated builds**: `deprecated: true` removes the build from default
  selection (`pickDefaultEligibleBuilds`) and tags the dropdown entry
  with "· Deprecated". Users can still pick it manually; doing so
  surfaces a warning and the deprecation reason in the verification panel.

### Strict (production) validation at publish time

`scripts/gen-manifests.py` accepts an explicit `--mode` flag with
`production` (the default), `development`, or `test`:

- `production` — refuses to write a customer-facing manifest with weak
  provenance: missing critical primitives, mutable `source_url`,
  development/test channels, deprecated without reason, sidecar
  boilerplate, or synthesised stable changelog. **Fails the build loudly.**
- `development` — relaxes channel and source-URL strictness for bench
  builds, but still demands every critical primitive.
- `test` — additionally tolerates `artifact_type=test_fixture` builds.

`--strict-validate` is a legacy alias for `--mode=production`.

### Machine-readable result shape

`validateFirmwareProvenance` returns a stable, machine-readable shape:

```js
{
  status: 'pass' | 'warn' | 'fail',
  blocking: true,
  warnings: ['…'],
  failures: [{ id, label, detail }],
  checks: [
    {
      id: 'sha256_metadata_present',     // stable, never reworded
      label: 'SHA-256 metadata',         // human copy, may change
      status: 'pass' | 'warn' | 'fail' | 'skip',
      severity: 'block' | 'warn' | 'info',
      detail: '…'
    },
    …
  ]
}
```

Stable check IDs are exported from
`scripts/utils/firmware-provenance.js` as `CHECK_IDS`. Other systems
(release-channel UI, diagnostics bundle) consume this shape by id and
must not parse `summary`/`detail` strings.

### Changelog severity ladder

The changelog has its own channel-aware severity ladder so stable releases are held to a higher bar than experimental builds:

| Channel(s) | Missing changelog | Auto-generated changelog (matches the historical synth pattern) |
|---|---|---|
| `stable` / `general` / `production` / `lts` | **Fail** — blocks install | **Fail** — treated identically to missing |
| `preview` / `beta` / `rc` / `candidate` | Warning — install allowed once acknowledged | Warning |
| `dev` / `nightly` / `experimental` / `rescue` / `test` | Allowed (silent) | Allowed (silent) |
| Unknown channel | Warning | Warning |

The auto-generated detection matches the exact one-line pattern `<Channel> build of Sense360 <Descriptor> v<Version>.` produced by older versions of `gen-manifests.py`. Multi-entry changelogs that include such a line alongside real notes are not flagged — only the "generator ran but nobody wrote anything" case is rejected.

### What the user sees

Step 5 renders a **Provenance metadata verified** panel inside the firmware
card listing every check with pass/warn/fail/skip icons. The source commit
links out to the upstream commit URL when available. The
`signature_verified` check always renders as **skip** with the explicit
disclosure that browser-side signature verification is not yet
implemented. If any blocking check fails, the panel turns red, the install
button stays disabled, and the helper banner reproduces the blocking
reason.

### Tooling for maintainers

- `python3 scripts/gen-manifests.py --strict-validate` (alias for
  `--mode=production`) promotes provenance findings to build failures. The
  default mode is also `production`; pass `--mode=development` to opt out
  for local bench runs.
- `python3 scripts/gen-manifests.py --mode=development` relaxes channel
  and source-URL strictness while still requiring every critical
  primitive.
- `WEBFLASH_SOURCE_COMMIT=<sha> python3 scripts/gen-manifests.py`
  overrides the source commit (useful when running outside a git
  checkout).
- `python3 scripts/gen-manifests.py --source-url-template "https://example.com/commit/{commit}"`
  customises the per-build `source_url`. The template MUST include
  `{commit}` so the URL is pinned to the specific tree.
- `npm test -- firmware-provenance` runs both the unit and the
  install-gate integration tests for this feature.

### Reviewer checklist

When reviewing a PR that touches provenance, manifest generation, or the
install gate, confirm each item:

- [ ] stable firmware missing `sha256` blocks the install gate
- [ ] beta firmware missing `sha256` blocks the install gate (not just warns)
- [ ] rescue firmware missing `sha256` blocks the install gate
- [ ] stable build missing `changelog` fails strict validation
- [ ] synthesised/filler stable changelog fails strict validation
- [ ] mutable `source_url` (`/tree/main`, `/releases/latest`) fails
      production validation
- [ ] deprecated build requires `deprecation_reason`
- [ ] UI does not claim cryptographic signature verification anywhere
- [ ] tests pass: `npm test -- firmware-provenance`
- [ ] generated manifest passes strict validation:
      `python3 scripts/gen-manifests.py --strict-validate --dry-run`

### Status-to-remediation quick map

- **Browser support = Fail**: switch to a Chromium browser with Web Serial (Chrome/Edge/Opera).
- **Device connection visibility = Warning**: connect/reconnect USB, close other serial apps, re-read device info.
- **Connection quality = Warning/Fail**: keep cable and power stable for at least 30s, avoid hubs, retry after reconnecting.
- **Firmware verification = Warning/Fail**: wait for the SHA-256 integrity check to finish or reselect firmware/retry download if the integrity check fails.
- **User acknowledgement = Warning**: check the **Before you flash** acknowledgement checkbox.

## Cache and version policy

WebFlash refuses to flash firmware while the running installer code or the
loaded firmware manifest may be stale. Three independent surfaces enforce
this; all three are visible in the **About this installer** panel and in the
**Copy diagnostics** payload.

### App build / version metadata

- Source of truth: [`scripts/build-info.js`](scripts/build-info.js), which
  exports `BUILD_INFO = { appVersion, buildCommit, buildTimestamp }`.
- A future build pipeline may overwrite this file at release time, but the
  app must tolerate any field being missing or set to `'unknown'` /
  `'0.0.0-dev'` without crashing. Diagnostics renders missing fields as
  `unknown` rather than redacting or omitting them.

### Manifest version / generated metadata

- `manifest.json` carries top-level `manifest_version` (schema number),
  `generated_at` (ISO 8601 UTC), and `source_commit` (git SHA), injected
  by [`scripts/gen-manifests.py`](scripts/gen-manifests.py). The git SHA
  is reused from the existing `detect_source_commit()` helper.
- The wizard captures these on initial manifest load and exposes them via
  the About panel and `Copy diagnostics`.

### Service worker update behavior

- Registration and update detection live in
  [`scripts/services/sw-update.js`](scripts/services/sw-update.js).
- When the SW reports a waiting worker, the freshness banner shows
  *"A WebFlash update is available. Reload before flashing."* with a
  **Reload now** action. Clicking **Reload now** posts `SKIP_WAITING` to
  the waiting worker and reloads once it takes control.
- A secondary **Continue without reloading** button dismisses the block
  and downgrades the banner to a warning. See the install gating policy
  below for the resulting behavior.

### Manifest freshness behavior

- After the wizard loads `manifest.json` it re-fetches the same URL with
  `cache: 'no-store'` (see
  [`scripts/services/manifest-freshness.js`](scripts/services/manifest-freshness.js))
  and compares the live `generated_at` to the loaded one. The verdict is
  one of:
  - `current` — install allowed.
  - `stale` — a newer manifest is published; install is blocked until the
    user reloads.
  - `unknown` — the network call failed or `generated_at` was missing /
    unparseable. The freshness banner shows
    *"WebFlash could not confirm that the firmware manifest is current.
    Check your connection or reload before flashing."* The user must click
    **Acknowledge and continue** before the install gate opens.

### Install gating policy (the matrix)

The same matrix is enforced in
[`scripts/state.js`](scripts/state.js) under the `CACHE FRESHNESS POLICY`
comment block (search for that string). It composes with — does not
replace — the existing pre-flash checklist, preflight policy, and
release-channel acknowledgements.

| Condition                                        | Install button | Visible UI                       |
| ------------------------------------------------ | -------------- | -------------------------------- |
| SW update pending **and not** dismissed          | **Disabled**   | Block-level banner + Reload now  |
| SW update pending **and** dismissed              | Allowed        | Warning banner + Reload now      |
| Manifest freshness `current`                     | Allowed        | (no banner)                      |
| Manifest freshness `stale`                       | **Disabled**   | Block-level banner + Reload now  |
| Manifest freshness `unknown`, **not** ack'd      | **Disabled**   | Warning banner + Acknowledge     |
| Manifest freshness `unknown`, ack'd              | Allowed        | Warning banner stays visible     |

### Cache clear behavior

- The About panel exposes **Clear cached installer data**. Implemented in
  [`scripts/services/cache-clear.js`](scripts/services/cache-clear.js).
- It posts `CLEAR_CACHE` to the active service worker (which deletes the
  WebFlash-owned cache only), unregisters the worker, and reloads the
  page. **It does not modify or erase your device.** It does not touch
  cookies, localStorage outside the WebFlash namespace, IndexedDB, or any
  caches outside the SW.

### Per-asset cache policy

Documented in the comment block at the top of
[`sw.js`](sw.js):

| Asset class                 | Strategy                  | Why                                                  |
| --------------------------- | ------------------------- | ---------------------------------------------------- |
| App shell (HTML/CSS/JS/img) | stale-while-revalidate    | Update detection drives the reload prompt.           |
| `manifest.json`             | network-first             | Page also re-fetches with `cache: 'no-store'`.       |
| Firmware binaries (`*.bin`) | network-first             | Cached on success so a previously-flashed config is offline-available; never serve stale. The rescue binary is additionally precached so first-visit offline rescue works. |
| Cross-origin (unpkg ESPWT)  | not intercepted           | Browser-managed.                                     |

`CACHE_NAME` is `webflash-v4`. The `activate` handler purges any cache
that starts with `webflash-` but is not the current name, so subsequent
bumps just work.

## Deployment & security headers

The live site is hosted on GitHub Pages
(<https://sense360store.github.io/WebFlash/>). GitHub Pages does **not**
honor the `_headers` file at the repo root — that file follows the
Netlify / Cloudflare Pages convention and is committed so a future
migration to one of those hosts automatically gets the full security
header set (CSP, Permissions-Policy, COOP, CORP, Referrer-Policy,
X-Frame-Options).

On GitHub Pages today the effective Content-Security-Policy reaches
browsers via a `<meta http-equiv="Content-Security-Policy">` tag in
`index.html` that mirrors the directives in `_headers`. Meta tags cannot
enforce `frame-ancestors`, `report-uri`, or `sandbox`, so clickjacking
protection (X-Frame-Options / frame-ancestors) is unavailable on GitHub
Pages and is a known limitation of this hosting choice.

To audit any deployment's response headers, run:

```bash
npm run check:headers -- https://sense360store.github.io/WebFlash/
```

The script (`scripts/check-headers.js`) classifies each finding as
`pass`, `warn`, or `fail` and exits non-zero on any failure. Localhost
hosts (for `python3 -m http.server`-style local dev) and `*.github.io`
hosts get an automatic downgrade so the missing CSP / Permissions-Policy
on those hosts is reported as `warn` rather than `fail`. Pass `--json`
for machine-readable output suitable for CI.

The only third-party runtime dependency is
`https://unpkg.com/esp-web-tools@10/dist/web/install-button.js`, allowed
by the CSP `script-src`. Fonts come from `fonts.googleapis.com` and
`fonts.gstatic.com`. There are no analytics, no other CDNs, and no
inline scripts — the bootstrap loader was externalized to
`scripts/bootstrap.js` so the CSP `script-src` can remain `'self'` plus
the documented unpkg origin without `'unsafe-inline'`.

## Installation Process

1. **Connect Device**: Plug device into computer via USB
2. **Select Configuration**: Choose mounting, power, and modules
3. **Review Firmware**: Verify selected firmware matches your hardware
4. **Verification**: Wait for the SHA-256 integrity check (browser-side
   cryptographic signature verification is **not** implemented; see
   "Firmware provenance and verification" below for the full trust model)
5. **Acknowledge**: Check safety warning acknowledgment
6. **Flash**: Click "Install Firmware" button
7. **Device Selection**: Choose correct serial port in browser dialog
8. **Wait**: Installation takes 1-2 minutes
9. **Complete**: Device reboots automatically when finished

## After Flashing: Validation & Handoff

WebFlash distinguishes "firmware was flashed" from "the device is actually
ready to use" via a structured post-flash result panel that appears on the
review/install step. The panel reports one of eight states:
`not_started`, `in_progress`, `completed`, `completed_validation_passed`,
`completed_validation_unknown`, `completed_validation_failed`, `failed`,
`cancelled`.

### What WebFlash can validate

After a flash completes, WebFlash performs a best-effort, read-only
validation pass against the device:

- **Serial reconnect** — does the host see the device come back on
  `navigator.serial`?
- **Improv-reported firmware identity** — does the device's Improv frame
  report a firmware family that matches the selected build?
- **Version match** — does the Improv-reported version equal the selected
  build version?
- **Improv endpoint reachability** — for builds that advertise
  `improv: true`, did we receive an Improv frame at all?
- **Wi-Fi provisioning** — only marked passed/failed when the user
  actually engages the Improv Wi-Fi step and the host emits a
  provisioning result. WebFlash never reads, displays, logs, or stores
  the SSID or password.

### What WebFlash cannot validate

- **Cryptographic authenticity at runtime.** Browser-side signature
  verification is out of scope; provenance is checked from the manifest at
  install time, not against the running device.
- **Sensor health or on-device behaviour.** Whether the BMP581 actually
  reads pressure or whether ESPHome boots cleanly is the device's job;
  WebFlash only knows what the device reports back over USB.
- **User cancellation with certainty.** ESP Web Tools does not surface a
  clean "user cancelled" signal. If the installer returns to idle without
  reaching `finished` or `error` and without a `detail.error`, WebFlash
  reports `cancelled` heuristically.

### `passed`, `failed`, and `unknown`

- `passed` — every check observed evidence of success.
- `failed` — at least one check observed evidence of failure (e.g. a
  firmware-family mismatch or an Improv error).
- `unknown` — at least one check could not gather evidence either way.
  This is the **honest default** and is the expected outcome for many
  builds, including any build that doesn't expose Improv. It does not
  mean the flash failed.

### Home Assistant handoff

The Home Assistant next-steps block is shown only when the selected
build advertises `improv: true` (i.e. ESPHome-style firmware that exposes
discovery). Rescue and other non-ESPHome builds suppress it.

### Wi-Fi provisioning handoff

Shown when the build advertises Improv Serial. The status string is one
of `continue`, `already_done`, `unavailable`, or `failed`. Wi-Fi
credentials are never persisted in URLs, `localStorage`, the support
bundle, or the flash history.

### When to use Rescue / Recovery Mode

- The flash failed mid-write.
- The device no longer boots after flashing.
- The validation panel reports `failed` and the device reports a
  different firmware family than the selected build.
- Repeated installs are returning `unknown` and the device never
  appears in Home Assistant.

The post-flash panel offers a one-click "Open Rescue & Recovery" button
when the flash fails or is cancelled.

## Wi-Fi Configuration

After flashing, the device will prompt for Wi-Fi credentials via Improv Serial protocol:

1. Keep browser window open after flashing
2. Enter Wi-Fi SSID when prompted
3. Enter Wi-Fi password
4. Device connects automatically

No manual hotspot connection required.

## Safety Information

- Only flash firmware from trusted sources
- Ensure correct firmware configuration matches your hardware
- Do not disconnect device during flashing
- Wi-Fi credentials are sent directly to device (not uploaded)
- All operations occur in your browser

## Support Features

The Review step includes utilities for troubleshooting:

- **Copy Support Info**: Captures device detection, browser support, and configuration
- **Copy Sharable Link**: Creates URL with your current configuration
- **Copy Firmware URL**: Direct link to firmware file
- **Copy Diagnostics**: Single redacted JSON bundle on the preflight panel containing browser capabilities, preflight check results, the selected configuration, the firmware target, and a connection-quality snapshot. Sensitive identifiers (IDs, MACs, serial numbers, tokens, signatures, paths, URLs) are replaced with `[REDACTED]` before copy.

These can be shared with support teams for faster issue resolution.

## Troubleshooting

### Device Not Detected

- Use a data-capable USB cable (not charge-only)
- Try different USB port
- Close other programs using serial ports (Arduino IDE, PlatformIO, etc.)
- On Linux: Add user to `dialout` group and re-login

### Failed to Fetch Error

- Refresh page and try again
- Clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)
- Verify using official site URL
- Check internet connection

### Installation Fails

Most devices auto-enter bootloader mode when ESP Web Tools opens the serial port. Try these in order:

- Try a different USB cable or USB port
- Use a known-good USB *data* cable (charge-only cables won't enumerate)
- Restart the browser and retry the install
- **Only if the device still isn't detected:** hold `BOOT`, tap `RESET`, then release `BOOT` to enter recovery mode manually, and retry the install while still in recovery

### Wrong Firmware Installed

- Device will not function correctly with wrong configuration
- Flash correct firmware matching your hardware
- Contact support if unsure of configuration

For additional help, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Support Diagnostics

When something goes wrong (preflight failure, install error, recovery flash, stale cache), WebFlash can produce a structured **support bundle** — a single redacted JSON document that captures everything support needs to reproduce your issue.

- **What it contains.** App and build version, browser environment (browser, version, platform, secure context, Web Serial support), manifest source (`manifest_version`, `generated_at`, `source_commit`, `freshness`), selected firmware (config, version, channel, provenance status, `sha256_present`/`signature_present` booleans), wizard state (current step, modules), preflight results, recovery context (mode, acknowledgements, last result), cache state (service worker, update availability), and the latest flash attempt. The bundle does **not** include firmware binaries, raw `sha256`/`signature` values, or Wi-Fi passwords.
- **How to capture.** "Copy support bundle" or "Download JSON" buttons appear on the Step 5 preflight panel, the rescue / recovery modal, the browser & USB setup help modal, and the error log modal. Clicking copy puts the bundle on your clipboard; download writes a `webflash-support-bundle-<timestamp>.json` file you can attach to a support email.
- **Privacy and redaction.** Before the bundle leaves the page, WebFlash strips Wi-Fi passwords, tokens, API keys, authorization headers, cookies, MAC addresses, filesystem paths, and URL query strings. Sensitive values become `[REDACTED_PASSWORD]`, `[REDACTED_TOKEN]`, `[REDACTED_MAC]`, `[REDACTED_PATH]`, etc. Free-form error messages are scrubbed for embedded paths, MACs, and bearer tokens. Review the JSON before sharing if your environment is sensitive.
- **Versioned schema.** The top-level `schema_version: 1` lets support tooling pin to a known shape. Field names are stable; new fields will be added under existing sections rather than reshaping the document.
- **Session-scoped.** The bundle reflects the *current* page session. Refreshing the page resets `last_usb_test_result`, recovery acknowledgements, `cache_clear_requested`, and similar transient signals. Persistent flash history is captured from `localStorage`, but always redacted before inclusion.

## Accessibility

WebFlash is intended to be usable with a keyboard and with screen readers, within the limits of the underlying Web Serial install flow. The conventions documented below are enforced by the code in `scripts/utils/a11y.js` plus the modal/wizard layout modules.

- **Keyboard navigation.** Every interactive element — header rescue/theme toggle, wizard stepper, option cards, firmware select, acknowledgement checkboxes, support and download buttons, post-flash actions, modal close buttons — is reachable with `Tab`, activates on `Enter` (and `Space` for buttons), and follows visual reading order. A "Skip to main content" link is the first focusable element on the page so keyboard users can bypass the header.
- **Modal focus behavior.** The rescue/recovery, preflight setup help, error log, changelog, and QR-code dialogs all use `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby`-linked title. Opening a modal moves focus inside, traps `Tab`/`Shift+Tab` within the dialog, closes on `Escape`, and restores focus to the element that opened it. Focus restoration is covered by `__tests__/rescue-modal.test.js` and `__tests__/a11y-modal-focus.test.js`.
- **Live region conventions.** Status changes (preflight, USB test results, support bundle copied, step navigation, rescue success/failure) announce through two app-wide live regions defined in `index.html`: `#webflash-a11y-live-region` (`aria-live="polite"`, used for non-blocking updates) and `#webflash-a11y-alert-region` (`aria-live="assertive"`, reserved for blocking errors). Use `announce(message)` or `announce(message, { assertive: true })` from `scripts/utils/a11y.js` rather than reinventing live regions inside individual modules. Inline `role="status"` containers on the preflight panel, freshness/preflight banners, and post-flash result panel still apply for surfaces where the message is also visible.
- **Stepper semantics.** The active wizard step carries `aria-current="step"`. Reachability is exposed via `aria-disabled="true"` on unreached steps and a composed `aria-label` (`"Step N: Name — current step | completed | not yet available | available"`) so screen-reader users can hear their position in the flow.
- **Reduced motion.** All transitions and animations respect `@media (prefers-reduced-motion: reduce)` (see `css/theme.css`). When the user opts out of motion, step transitions, banner pulses, and modal animations collapse to near-zero duration; no essential state depends on animation.
- **Color independence.** Status indicators (release-channel badges, provenance pass/fail rows, preflight statuses, post-flash validation states, freshness banners) always combine color with a text label or icon. Focus rings use a dedicated CSS variable (`--focus-ring`) so the keyboard outline remains visible across themes.
- **Mobile fallback.** Web Serial only works on desktop Chromium browsers. The mobile/unsupported message in `scripts/init-review.js` and the preflight banner stay readable and operable on small screens; the rescue and changelog modals scroll internally rather than truncating.

### Running accessibility-focused tests

Accessibility-related Jest suites live alongside the rest of the test code:

```bash
npm test -- a11y-utils                # focus trap, live region, getFocusableElements
npm test -- a11y-modal-focus          # focus restoration for changelog & error-log modals
npm test -- a11y-static-html          # static index.html structure checks
npm test -- rescue-modal              # rescue dialog semantics + focus return
npm test -- preflight-help-modal      # setup help dialog
```

Some tests in the broader suite have unrelated pre-existing failures (notably the wizard-state suite); the accessibility-specific tests above run independently.

## Custom Firmware & Source Code

For users who want to build custom firmware configurations or modify the ESPHome YAML source files:

- **ESPHome Public Repository**: [sense360store/esphome-public](https://github.com/sense360store/esphome-public) - Contains ESPHome YAML configurations for DIY users compiling via Home Assistant/ESPHome

WebFlash provides pre-compiled firmware binaries for plug-and-play browser-based flashing. The esphome-public repository contains the source YAML files for users who want to customize or build their own firmware.

## Documentation

- **README.md** (this file): User guide for flashing devices
- **DEVELOPER.md**: Maintainer guide for publishing firmware
- **TROUBLESHOOTING.md**: Detailed troubleshooting steps
- **docs/sense360-webflash-status.md**: Canonical WebFlash Sense360 product & release status (what installs today, what is preview-only, what is blocked)
- **docs/release-gates/WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md**: WebFlash mirror of the upstream `sense360store/esphome-public` first-release gate checklist (`docs/first-release-gates.md`) — installable stable path, preview product, blocked room bundles, blocked fan-control variants, and the no-new-exposure statement
- **FEATURES.md**: Deprecated — redirects to the canonical status doc above

## Project Structure

```
WebFlash/
├── index.html              # Web interface
├── app.js                  # Application logic
├── manifest.json           # Firmware catalog (auto-generated)
├── firmware-*.json         # Individual firmware manifests (auto-generated)
├── firmware/               # Firmware binaries and configurations
│   ├── configurations/     # Production firmware files
│   └── rescue/             # Recovery firmware
├── scripts/                # Manifest generation and sync scripts
├── css/                    # Stylesheets
└── __tests__/              # Test suite
```

## License

This project is for Sense360 device owners and authorized distributors.

## Support

For issues or questions:
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Review firmware configuration requirements
- Contact Sense360 support with device details and configuration
