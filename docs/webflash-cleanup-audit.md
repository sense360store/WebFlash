# WebFlash Cleanup Audit

WF-CLEANUP-001 — audit-only follow-up to WF-001.

This document compares WebFlash's manifest / config state with what is actually
on disk under `firmware/` and classifies every entry so that follow-up cleanup
PRs can be scoped safely. **No firmware binaries, manifests, sidecars,
workflows, or scripts were modified by this PR.**

Audit performed on branch `claude/audit-webflash-state-MkAOY` at commit
`9b669ab` (merge of #400 — Release-One import).

## Current source of truth

| Field | Value |
| --- | --- |
| Source repo | `sense360store/esphome-public` |
| Release tag | `v1.0.0` |
| WebFlash config string | `Ceiling-POE-VentIQ-RoomIQ` |
| Imported asset | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` |
| Asset size | 1,087,488 bytes |
| Asset sha256 | `9169f2ce486d14d3c0e0b1d6e9adf558480db6ec301f8eac1622fda4d7ceffcc` |
| Sidecar | `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.meta.json` (present) |
| Manifest index | `manifest.json` build 15 (also published as `firmware-15.json`) |
| Source imported_at | `2026-05-13T09:48:23+00:00` |
| Sources file | `firmware/sources.json` (1 source, `block_tokens: ["FanTRIAC", "LED"]`) |

`Ceiling-POE-VentIQ-RoomIQ` is the **only** WebFlash build currently backed by
an imported asset from `esphome-public`. Every other build entry in
`manifest.json` predates the cross-repo import and references a `.bin` that no
longer exists on disk.

The standalone `Rescue` build (`firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin`)
also has a backing `.bin` on disk — but it is not an `esphome-public` import;
it ships from the WebFlash repo itself and uses a per-product
`firmware/rescue/manifest.json` rather than a `.meta.json` sidecar.

## Audit method

1. Programmatically walked `manifest.json` builds, `firmware-*.json` files,
   `firmware/configurations/`, `firmware/rescue/`, and `firmware/sources.json`,
   and parsed `REQUIRED_CONFIGS` out of
   `.github/workflows/firmware-publish.yml`.
2. For each `manifest.json` build, recorded: `config_string`, version,
   channel, declared `.bin` path, whether the `.bin` exists on disk, whether
   a `.meta.json` sidecar exists, whether the matching `firmware-N.json`
   exists, which signature fields are populated, whether the
   `config_string` is in `REQUIRED_CONFIGS`, and whether it is sourced from
   `firmware/sources.json`.
3. Identified orphan `.bin` files (on disk but unreferenced by
   `manifest.json`).
4. Ran the validation commands listed in the issue brief and recorded
   pass/fail verbatim (see **Generated manifest risk** below). No fixes were
   applied to make any command pass.

The audit script was an inline `python3` one-liner via `Bash`; it was not
committed.

## Findings summary

| # | Item | Status | Evidence | Recommended action |
| --- | --- | --- | --- | --- |
| 1 | `Ceiling-POE-VentIQ-RoomIQ` v1.0.0-stable | **current** | manifest build 15, `firmware-15.json`, `.bin` + `.meta.json` present, only entry in `sources.json`, in `REQUIRED_CONFIGS` | Keep. Do not touch. |
| 2 | `Rescue` v1.0.0-rescue | **current** | manifest build 14, `firmware-14.json`, `.bin` present at `firmware/rescue/`, in `REQUIRED_CONFIGS` | Keep. Note: no `.meta.json` sidecar — uses `firmware/rescue/manifest.json` instead, which is the legacy per-product layout. Out-of-scope to migrate in this PR. |
| 3 | 8 of the 10 entries in `REQUIRED_CONFIGS` have a manifest entry **but no `.bin` on disk** | **candidate-for-reimport** | See **REQUIRED_CONFIGS review** | Decide per-config whether to re-import from a future `esphome-public` release or to remove from `REQUIRED_CONFIGS`. **Both are out of scope for this PR.** |
| 4 | 5 manifest entries are **not in `REQUIRED_CONFIGS`** and `.bin` is also missing on disk (`Ceiling-POE-AirIQ` v2.0.0/beta, v1.0.1/beta, v1.0.0/beta; `Ceiling-PWR-AirIQ` v1.0.1/beta; `Ceiling-POE-AirIQ` v1.0.0/stable, plus extra stable channel duplicates) | **candidate-for-removal** | Manifest carries them; nothing references them externally; channels not in the allowlist | Drop from `manifest.json` via `gen-manifests.py` after binaries land or after stakeholder sign-off. **Not in this PR.** |
| 5 | Orphan `.bin` on disk: `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` | **blocked-reference** | On disk, no sidecar, not in `manifest.json`, FanTRIAC is in `sources.json` `block_tokens`, but `gen-manifests.py --dry-run` shows it *would* be picked up if the manifest were regenerated today | Decide whether to delete the binary or wait for hardware verification. **Not in this PR.** Block enforcement currently sits in the importer, not in `gen-manifests.py`. |
| 6 | `manifest.json` references binaries that do not exist on disk for 14 of 16 builds (everything except Rescue and `Ceiling-POE-VentIQ-RoomIQ`) | **stale** | Verified file-by-file (see table) | See actions #3 and #4. |
| 7 | `firmware-signature.test.js` fails (2 tests) | **pre-existing** | `Test Suites: 1 failed, 53 passed`. Both failures are `ENOENT` on `Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin` | Will be resolved automatically by fixing the underlying manifest/file mismatch. **Do not skip or weaken the test.** |
| 8 | `CLAUDE.md` says `REQUIRED_CONFIGS` "holds 9 entries" — the workflow currently holds 10 (added `Ceiling-POE-VentIQ-RoomIQ`) | **doc drift** | `CLAUDE.md:105` vs `.github/workflows/firmware-publish.yml:202-213` | Update CLAUDE.md to "10 entries" and add `Ceiling-POE-VentIQ-RoomIQ` to the inline list. **Not in this PR** per the brief. |

## Manifest entries vs firmware files

Columns: M = present in `manifest.json`, N = matching `firmware-N.json` exists,
B = `.bin` on disk, S = `.meta.json` sidecar (or `firmware/rescue/manifest.json`
for the rescue build), R = listed in `REQUIRED_CONFIGS`, Src = listed in
`firmware/sources.json`. Sig = signature fields populated in the manifest entry
(`signature`, `signature_ed25519`, `signature_key_id`, plus `md5` and `sha256`).

| Idx | Config string | Version / Channel | Firmware file | M | N | B | S | R | Src | Sig | Status | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Ceiling-POE-AirIQ | 2.0.0 / stable | Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 1 | Ceiling-POE-AirIQ | 1.0.0 / stable | Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-removal (older stable shadowed by v2.0.0) |
| 2 | Ceiling-POE-AirIQ | 2.0.0 / beta | Sense360-Ceiling-POE-AirIQ-v2.0.0-beta.bin | ✅ | ✅ | ❌ | ❌ | ✅\* | ❌ | ✅ | stale | candidate-for-removal (beta channel; only `config_string` is in `REQUIRED_CONFIGS`, not the beta variant specifically) |
| 3 | Ceiling-POE-AirIQ | 1.0.1 / beta | Sense360-Ceiling-POE-AirIQ-v1.0.1-beta.bin | ✅ | ✅ | ❌ | ❌ | ✅\* | ❌ | ✅ | stale | candidate-for-removal |
| 4 | Ceiling-POE-AirIQ | 1.0.0 / beta | Sense360-Ceiling-POE-AirIQ-v1.0.0-beta.bin | ✅ | ✅ | ❌ | ❌ | ✅\* | ❌ | ✅ | stale | candidate-for-removal |
| 5 | Ceiling-POE-VentIQ | 1.0.0 / stable | Sense360-Ceiling-POE-VentIQ-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 6 | Ceiling-PWR-AirIQ | 1.0.1 / stable | Sense360-Ceiling-PWR-AirIQ-v1.0.1-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 7 | Ceiling-PWR-AirIQ | 1.0.0 / stable | Sense360-Ceiling-PWR-AirIQ-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-removal (older stable shadowed by v1.0.1) |
| 8 | Ceiling-PWR-AirIQ | 1.0.1 / beta | Sense360-Ceiling-PWR-AirIQ-v1.0.1-beta.bin | ✅ | ✅ | ❌ | ❌ | ✅\* | ❌ | ✅ | stale | candidate-for-removal |
| 9 | Ceiling-USB | 1.0.0 / stable | Sense360-Ceiling-USB-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 10 | Ceiling-USB-AirIQ | 1.0.0 / stable | Sense360-Ceiling-USB-AirIQ-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 11 | Ceiling-USB-FanPWM | 1.0.0 / stable | Sense360-Ceiling-USB-FanPWM-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 12 | Ceiling-Voice-POE-AirIQ | 1.0.0 / stable | Sense360-Ceiling-Voice-POE-AirIQ-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 13 | Ceiling-Voice-USB | 1.0.0 / stable | Sense360-Ceiling-Voice-USB-v1.0.0-stable.bin | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | stale | candidate-for-reimport |
| 14 | Rescue | 1.0.0 / rescue | Sense360-Rescue-v1.0.0-rescue.bin (at `firmware/rescue/`) | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | current | keep |
| 15 | Ceiling-POE-VentIQ-RoomIQ | 1.0.0 / stable | Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | current | keep |
| — | Ceiling-POE-VentIQ-FanTRIAC-RoomIQ | 1.0.0 / stable | Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin (orphan) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | n/a | blocked-reference | hold pending TRIAC hardware verification, then either re-import or delete |

\* `REQUIRED_CONFIGS` matches on `config_string` only; it does not pin a
specific channel or version. The workflow check passes as long as **any**
build with the matching `config_string` is present, so the beta entries
satisfy the check today via the missing stable counterpart's mere presence
in the manifest. Removing them would not break the workflow guard *unless*
the only manifest entry with that `config_string` is the one being removed.

For row 14 (`Rescue`): the sidecar column is ⚠️ because `Rescue` uses a
separate `firmware/rescue/manifest.json` rather than the
`<asset>.meta.json` layout used by `firmware/configurations/`. The
top-level `manifest.json` build entry was generated with full signature
fields, so it is functionally complete — this is a structural
inconsistency, not a missing-data finding.

## REQUIRED_CONFIGS review

`REQUIRED_CONFIGS` in `.github/workflows/firmware-publish.yml` (lines
202–213) currently holds **10 entries**:

| Config string | In manifest? | `.bin` on disk? | Status |
| --- | --- | --- | --- |
| Ceiling-POE-AirIQ | ✅ (builds 0–4) | ❌ | **candidate-for-reimport** |
| Ceiling-POE-VentIQ | ✅ (build 5) | ❌ | **candidate-for-reimport** |
| Ceiling-POE-VentIQ-RoomIQ | ✅ (build 15) | ✅ | **current** |
| Ceiling-PWR-AirIQ | ✅ (builds 6–8) | ❌ | **candidate-for-reimport** |
| Ceiling-USB | ✅ (build 9) | ❌ | **candidate-for-reimport** |
| Ceiling-USB-AirIQ | ✅ (build 10) | ❌ | **candidate-for-reimport** |
| Ceiling-USB-FanPWM | ✅ (build 11) | ❌ | **candidate-for-reimport** |
| Ceiling-Voice-POE-AirIQ | ✅ (build 12) | ❌ | **candidate-for-reimport** |
| Ceiling-Voice-USB | ✅ (build 13) | ❌ | **candidate-for-reimport** |
| Rescue | ✅ (build 14) | ✅ | **current** |

Per the brief, every config in `REQUIRED_CONFIGS` whose `.bin` is missing is
classified as **candidate-for-reimport** — not **candidate-for-removal** —
because the workflow guard expresses an explicit product-line intent. The
choice between re-import and removal belongs to the follow-up cleanup PR,
not to this audit.

**CLAUDE.md drift:** `CLAUDE.md:105` describes `REQUIRED_CONFIGS` as
"holding 9 entries" and enumerates them without `Ceiling-POE-VentIQ-RoomIQ`.
The workflow now holds **10** entries. Recommend updating CLAUDE.md as a
non-blocking doc fix in a follow-up PR (not addressed here, per the brief).

## Release-One / esphome-public import state

| Aspect | State |
| --- | --- |
| Sources file | `firmware/sources.json` (schema_version 1) |
| Sources count | 1 |
| Source entry | `sense360store/esphome-public` @ `v1.0.0`, channel `stable`, config `Ceiling-POE-VentIQ-RoomIQ` |
| Block tokens | `["FanTRIAC", "LED"]` |
| Required release-body sections | `Changelog`, `Known Issues`, `Features`, `Hardware Requirements` |
| Asset imported | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` (1,087,488 B) |
| Asset sha256 (verified) | `9169f2ce…d7ceffcc` |
| Sidecar | present, includes `source.imported_at = 2026-05-13T09:48:23+00:00`, `source_manifest_git_sha`, `source_manifest_esphome_version = 2025.3.0` |
| Manifest pin (per CLAUDE.md / commit `60c30c5`/`60e9c1f`) | build 15 of `manifest.json` |
| Signature fields | `signature`, `signature_ed25519`, `signature_key_id = dev-2026-01` |

The import path is **proven and working** for `Ceiling-POE-VentIQ-RoomIQ`.
Every other build still in `manifest.json` was generated before this
importer existed and therefore has no `source` provenance block, no
upstream release tag, and no recoverable upstream asset URL recorded.

## FanTRIAC / TRIAC references

Findings:

1. **Orphan binary on disk:**
   `firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin`
   (934,736 B, `mtime 2026-05-07`, pre-dates the Release-One import).
2. **No matching `.meta.json` sidecar** for that binary.
3. **No manifest entry.** `config_string` `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`
   does not appear in `manifest.json` and is not in `REQUIRED_CONFIGS`.
4. **`sources.json` actively blocks it.** `block_tokens` is
   `["FanTRIAC", "LED"]`, so the importer would refuse to re-import a
   FanTRIAC asset even if `esphome-public` published one.
5. **`gen-manifests.py --mode development --dry-run` *would* include it.**
   The script scans `firmware/configurations/` and surfaces the FanTRIAC
   binary as a build (and would generate a fresh `firmware-0.json`
   for it). The `block_tokens` enforcement currently lives only in the
   importer, not in `gen-manifests.py`. **This is a real risk** — if anyone
   regenerates manifests without first removing the orphan, FanTRIAC ends
   up shipped.
6. **Wizard surface acknowledges TRIAC.** `index.html:651` and the rest of
   the wizard markup expose a "fan-triac" hint, and `module-requirements.js`
   carries the `S360-320` TRIAC SKU, but no live build is available.

Status: **blocked-reference**. FanTRIAC must remain blocked at the
importer / manifest / `REQUIRED_CONFIGS` / kit layers until hardware
verification (S360-320 schematic, GPIO/timing) and compliance work
land. This PR does **not** change the block. The orphan binary's fate
(delete vs. wait) is a follow-up decision.

**Update (WF-TRIAC-001):** the wizard-side runtime UX gate for TRIAC
has since landed. `scripts/utils/module-availability.js` exposes an
eighth availability state `advanced-manual-warning`, and the TRIAC
card in `index.html` now ships with the `is-advanced-warning`
affordance + an inline `[data-advanced-warning-region]` warning +
acknowledgement checkbox. TRIAC is therefore **visible and
selectable in the custom path** behind an explicit acknowledgement.
This is a customer-facing *visibility* change only — the
`firmware/sources.json` `block_tokens: ["FanTRIAC", "LED"]` import-
time block is unchanged, the orphan binary on disk is unchanged,
the manifest is unchanged, `REQUIRED_CONFIGS` is unchanged, and
`scripts/data/kits.json` is unchanged. FanTRIAC remains not
Release-One, not `REQUIRED_CONFIGS`, not kit / default, not
recommended, not auto-selected, not compliance-certified. The
`WF-IMPORT-TRIAC-001` follow-up still requires upstream
`RELEASE-TRIAC-001`.

## LED / LED Ring references

Findings:

1. **No LED binary on disk.** No file under `firmware/configurations/` or
   `firmware/rescue/` contains the `LED` token.
2. **No LED manifest entry.** No `config_string` in `manifest.json` includes
   the `LED` token.
3. **`sources.json` blocks LED.** `block_tokens` includes `LED`, so the
   importer would refuse an LED-bearing asset.
4. **Wizard surface still exposes LED.** `scripts/data/module-requirements.js`
   defines the LED module (`Sense360 LED`, S360-300). `scripts/state.js`
   includes LED in `MODULE_LABELS`, `MODULE_VARIANT_LABELS`, and the
   `Mount-Power[-AirIQ|-VentIQ][-Fan{Variant}][-RoomIQ][-LED]` segment
   order. The wizard can therefore *select* LED, but no firmware target
   will match.
5. **Release-One sidecar explicitly excludes LED.** The sidecar's
   `hardware_requirements` includes "No Sense360 LED module for this
   Release-One firmware."

Status: **excluded from Release-One**. LED is documented as excluded both in
sources `block_tokens` and in the imported sidecar. No artifact action is
needed in this PR.

## Missing firmware binaries

14 of 16 `manifest.json` builds reference a `.bin` that is not present on disk:

```
firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-beta.bin
firmware/configurations/Sense360-Ceiling-POE-AirIQ-v1.0.1-beta.bin
firmware/configurations/Sense360-Ceiling-POE-AirIQ-v1.0.0-beta.bin
firmware/configurations/Sense360-Ceiling-POE-VentIQ-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-PWR-AirIQ-v1.0.1-stable.bin
firmware/configurations/Sense360-Ceiling-PWR-AirIQ-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-PWR-AirIQ-v1.0.1-beta.bin
firmware/configurations/Sense360-Ceiling-USB-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-USB-AirIQ-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-USB-FanPWM-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-Voice-POE-AirIQ-v1.0.0-stable.bin
firmware/configurations/Sense360-Ceiling-Voice-USB-v1.0.0-stable.bin
```

All 14 still have a `firmware-N.json` companion file and full signature
fields in `manifest.json`. The signature fields are unverifiable in this
state — `verifyFirmwareSignature` reads the actual `.bin` bytes
(`__tests__/firmware-signature.test.js:252`) and short-circuits with
`ENOENT` before it can validate.

## Missing sidecars

| Item | Sidecar expected at | Present? |
| --- | --- | --- |
| `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` | same dir, `.meta.json` | ✅ |
| `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` (orphan) | same dir, `.meta.json` | ❌ |
| `Sense360-Rescue-v1.0.0-rescue.bin` | `firmware/rescue/manifest.json` (legacy per-product manifest layout) | ✅ (the per-product manifest is present, but no `<asset>.meta.json`) |
| Any other manifest build | n/a (the underlying `.bin` is missing) | ❌ |

## Generated manifest risk

`gen-manifests.py` is the only sanctioned writer of `manifest.json` and the
numbered `firmware-*.json` files. It scans `firmware/configurations/` and
`firmware/rescue/` for binaries; it does **not** consult
`firmware/sources.json` or `block_tokens`.

`python3 scripts/gen-manifests.py --summary --dry-run --mode development`
(this branch) reports the following intended actions:

```
Idx  Device/Config                                Channel  Version  Path
0    Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ  stable   1.0.0    firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin
1    Sense360-Ceiling-POE-VentIQ-RoomIQ           stable   1.0.0    firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin
2    Sense360-Rescue                              rescue   1.0.0    firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin

[dry-run] Would write /home/user/WebFlash/manifest.json
[dry-run] Would remove /home/user/WebFlash/firmware-0.json
[dry-run] Would remove /home/user/WebFlash/firmware-1.json
...
[dry-run] Would remove /home/user/WebFlash/firmware-15.json
[dry-run] Would write /home/user/WebFlash/firmware-0.json
[dry-run] Would write /home/user/WebFlash/firmware-1.json
[dry-run] Would write /home/user/WebFlash/firmware-2.json
Generated /home/user/WebFlash/manifest.json and 3 ESP Web Tools manifest file(s) with 3 build entries.
```

**Implications, in order of severity:**

1. **Regeneration today would publish FanTRIAC.** The orphan
   `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` binary becomes build 0 of the new
   manifest. `block_tokens` is not enforced by `gen-manifests.py`, only by
   the importer. This breaks the brief's "FanTRIAC remains blocked"
   invariant.
2. **Regeneration today would shrink the manifest from 16 builds to 3** and
   fail the `REQUIRED_CONFIGS` workflow guard immediately (8 of the 10
   required configs would disappear). CI would block deploy. This is a
   functioning guard, but it means anyone running the generator on this
   tree without staging upstream firmware first will produce a manifest
   that cannot ship.
3. **The dry-run also flagged that the orphan FanTRIAC binary has no
   sidecar / no changelog,** which would block manifest generation in
   `production` mode but not in `development` mode.

`gen-manifests.py` itself works correctly. The risk is in the directory
state, not in the script.

## Live/deployed installer risk

The wizard composes the install element with the manifest URL pinned by
index:

```
state.js:5069
<esp-web-install-button manifest="firmware-${manifestIndex}.json" ...>
```

Consequences for the live site (GitHub Pages):

* `firmware-0.json` … `firmware-15.json` are all served and all valid JSON;
  ESP Web Tools will accept them.
* `firmware-15.json` and `firmware-14.json` (Rescue) resolve to `.bin` files
  that **do** exist on the deployed site, so flashing works for
  `Ceiling-POE-VentIQ-RoomIQ` and `Rescue`.
* `firmware-0.json` … `firmware-13.json` resolve to `.bin` files that **do
  not** exist. If a user reaches one of those configurations in the wizard
  (Ceiling + POE/PWR/USB + AirIQ/VentIQ/Voice/FanPWM combinations) and
  clicks Install, the install will fail at flash-time when ESP Web Tools
  attempts to download the binary — after the user has already plugged in
  hardware and granted Web Serial access.
* `sw.js` caches `manifest.json` and `firmware/rescue/manifest.json` but
  does **not** cache `firmware-*.json` by name. The numbered manifests are
  fetched directly each time, so the failure mode is consistent (and not
  masked by stale cache).
* The Step 5 preflight engine (`evaluatePreflightPolicy` in `state.js`) does
  not verify that the chosen build's `.bin` is fetchable before flashing —
  the binary fetch happens inside ESP Web Tools, after preflight passes.

**Net effect:** the deployed installer is broken for every product
configuration except `Ceiling-POE-VentIQ-RoomIQ` and `Rescue`. Pruning the
stale manifest entries would correctly hide them from the wizard, but
pruning before either a re-import or a deliberate `REQUIRED_CONFIGS`
update will fail the CI guard. The two changes must land together.

The risk of removing entries **without** understanding live traffic is that
any user who has previously bookmarked / shared a wizard URL pointing at
one of the stale configurations (the wizard does support sharable config
URLs via `scripts/utils/url-config.js`) would land on a configuration that
no longer matches any build, and would see an empty install panel. That
failure mode is preferable to the current behaviour (silent download
failure mid-flash), but it is still a UX regression to plan for.

## Recommended follow-up PRs

Sequenced so each PR keeps CI green and the production installer in a
known-good state at every commit.

1. **WF-CLEANUP-002 — Decide FanTRIAC orphan disposition.**
   Either delete `firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin`,
   or move it under a quarantine path that `gen-manifests.py` does not
   scan. Do not regenerate manifests until this is resolved (see #4).
   Touches: 1 binary file.
   **Resolved:** WF-CLEANUP-002 removed the orphan FanTRIAC `.bin` from
   `firmware/configurations/` so manifest regeneration cannot accidentally
   publish it.

2. **WF-CLEANUP-003 — Teach `gen-manifests.py` to honour
   `firmware/sources.json` `block_tokens`.**
   Defence-in-depth so the FanTRIAC scenario cannot recur regardless of
   what lands in `firmware/configurations/`. Add a unit test for the
   block path. Touches: `scripts/gen-manifests.py`, new test under
   `__tests__/` or `scripts/`.

3. **WF-CLEANUP-004 — Decide per-config: re-import or remove.**
   For each `REQUIRED_CONFIGS` entry whose `.bin` is missing
   (`Ceiling-POE-AirIQ`, `Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`,
   `Ceiling-USB`, `Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`,
   `Ceiling-Voice-POE-AirIQ`, `Ceiling-Voice-USB`) make a stakeholder call.
   For each chosen for re-import: add a `firmware/sources.json` entry
   pointing at an `esphome-public` release. For each chosen for removal:
   drop the config from `REQUIRED_CONFIGS` *and* prune the corresponding
   manifest entries.

4. **WF-CLEANUP-005 — Regenerate manifest.**
   Once #1–#3 are merged, run `gen-manifests.py` for real and commit the
   resulting `manifest.json` and `firmware-*.json` together with the
   firmware binaries. Verify `REQUIRED_CONFIGS` guard passes and live
   installer load succeeds for every remaining config.

5. **WF-CLEANUP-006 — Prune the stale beta/older-stable channel
   duplicates.**
   `Ceiling-POE-AirIQ` v1.0.0/v1.0.1/v2.0.0 beta, `Ceiling-POE-AirIQ`
   v1.0.0 stable (shadowed by v2.0.0), `Ceiling-PWR-AirIQ` v1.0.0
   stable (shadowed by v1.0.1), `Ceiling-PWR-AirIQ` v1.0.1 beta. None
   are required for the CI guard once the stable counterpart is
   regenerated. Drops 5 manifest entries.

6. **WF-CLEANUP-007 — Update `CLAUDE.md` REQUIRED_CONFIGS count.**
   Bump from "9 entries" to "10 entries" and add `Ceiling-POE-VentIQ-RoomIQ`
   to the inline enumeration. Documentation-only.

7. **WF-CLEANUP-008 — Add a "manifest health" CI check.**
   For every build in `manifest.json`, assert (a) the `.bin` exists, (b) the
   `.meta.json` sidecar or `firmware/rescue/manifest.json` exists, and (c)
   the recorded `sha256` matches the file on disk. This would have
   surfaced this audit's findings as a CI failure in WF-001 rather than as
   a follow-up audit.

8. **WF-CLEANUP-009 — Preflight UX for unmatched configurations.**
   If a sharable wizard URL resolves to a `config_string` that has no
   manifest build, surface a clear preflight error instead of an empty
   install panel. Touches the Step 5 preflight engine only.

## Do-not-delete list

The following items **must not be deleted, renamed, or rewritten** without an
explicit follow-up sign-off, and certainly not as part of this PR:

| Item | Reason |
| --- | --- |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` | Current Release-One firmware. Imported, signed, in `sources.json`, in `REQUIRED_CONFIGS`, used by deployed installer. |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.meta.json` | Production sidecar with provenance + release-body sections. |
| `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin` | Current Rescue firmware. In `REQUIRED_CONFIGS`. Unbricking path. |
| `firmware/rescue/manifest.json` | Per-product manifest used at install-time. |
| `manifest.json` | Single source of truth for the deployed installer. Regenerate via `gen-manifests.py` only; do not hand-edit. |
| `firmware-0.json` … `firmware-15.json` | Consumed at runtime by `<esp-web-install-button manifest="firmware-N.json">`. Removing any of them changes wizard behaviour for that index. |
| `firmware/sources.json` | Only declarative record of cross-repo import scope; carries `block_tokens` for FanTRIAC and LED. |
| `.github/workflows/firmware-publish.yml` | Holds `REQUIRED_CONFIGS`; pruning entries here changes shipped products. |
| `.github/workflows/firmware-import.yml` | Cross-repo import path. Out of scope for this PR. |
| `scripts/gen-manifests.py` | Sole sanctioned manifest writer. |
| `scripts/import-firmware-sources.py` | Sole sanctioned importer. Enforces `block_tokens` for FanTRIAC / LED. |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` | **Conditional.** Keep until WF-CLEANUP-002 makes a call. Do not delete in this PR. |

## Pre-existing test failures

For honesty: this audit ran the validation commands listed in the brief.

| Command | Result |
| --- | --- |
| `npm test -- --ci` | **53 suites passed, 1 failed** — `__tests__/firmware-signature.test.js`. **748 of 750 tests passed.** Both failing tests are `ENOENT: no such file or directory, open '/home/user/WebFlash/firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin'` at `firmware-signature.test.js:252` and `:309`. This is the pre-existing failure the brief warned about; it is caused entirely by the missing `.bin` files documented above. Not fixed in this PR. |
| `node scripts/validate-naming-policy.js firmware/configurations` | **PASS** — both binaries on disk match the canonical naming pattern. (The orphan FanTRIAC binary passes naming policy because the policy only validates the filename shape, not membership in `block_tokens`.) |
| `python3 scripts/gen-manifests.py --summary --dry-run` | **No-op exit 0** with a warning that mode `production` cannot use the test-only dev key. Re-ran with `--mode development`; see **Generated manifest risk**. |
| `npm run lint` | Not run — no `lint` script defined in `package.json`. |
| `npm run build` | Not run — no `build` script defined in `package.json`. (WebFlash has no bundler; the project is served as-is.) |

Environment fix-ups required to reach the validation step (recorded for the
next auditor; these did **not** touch repository state):

* `npm install --no-audit --no-fund --no-save` to populate `node_modules/`
  (jest was not pre-installed).
* `pip install --user cffi cryptography` to repair the `cryptography` Python
  binding on the sandbox image (`_cffi_backend` not loadable for Python
  3.11). This affects only the gen-manifests dry-run path.

Neither fix was committed.

## WF-CLEANUP-004 update

WF-CLEANUP-004 has now landed against the **REQUIRED_CONFIGS review** /
finding #3 table above. The stakeholder call for the 8 missing-`.bin`
entries was made: all 8 were removed from `REQUIRED_CONFIGS` in
`.github/workflows/firmware-publish.yml` (Path B / remove). The publish
guard now tracks only `Ceiling-POE-VentIQ-RoomIQ` and `Rescue` — the two
configs WebFlash can actually ship today. See
`docs/webflash-required-configs-cleanup.md` for the per-config decision
and the explicit out-of-scope list.

This update is **workflow + docs only**. None of the audit's recorded
disk-state findings change: the 14 stale `manifest.json` builds, every
`firmware-*.json`, the orphan-resolution status of FanTRIAC (already
resolved by WF-CLEANUP-002), the `LED` exclusion, and the pre-existing
`firmware-signature.test.js` ENOENT failures are all still as documented
above. Manifest regeneration to clear those is sequenced as
**WF-CLEANUP-005 — regenerate/prune manifests to actual disk state**.

## WF-CLEANUP-005 update

WF-CLEANUP-005 has now landed. `manifest.json` and the numbered
`firmware-*.json` files were regenerated from the actual on-disk
firmware assets by running

```
python3 scripts/gen-manifests.py \
  --firmware-dir firmware \
  --manifest-path manifest.json \
  --manifest-prefix firmware- \
  --mode development \
  --summary
```

(the same invocation the publish workflow uses for PR builds without
the production signing secret). The generator's
`write_individual_manifests` glob-cleanup removed the 14 stale
`firmware-*.json` files automatically. The post-regeneration generated
state is:

| File | Contents |
|------|----------|
| `manifest.json` | 2 builds — `Ceiling-POE-VentIQ-RoomIQ` (stable v1.0.0) and `Rescue` (rescue v1.0.0) |
| `firmware-0.json` | `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` |
| `firmware-1.json` | `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin` |

Every referenced `.bin` exists on disk. None of the previously stale
config strings (`Ceiling-POE-AirIQ`, `Ceiling-POE-VentIQ` without
`-RoomIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`, `Ceiling-USB-AirIQ`,
`Ceiling-USB-FanPWM`, `Ceiling-Voice-POE-AirIQ`, `Ceiling-Voice-USB`,
`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`) remain in any generated manifest
file. No firmware binary, sidecar, source entry, workflow,
script, signing key, or installer asset was touched by this PR.

The two suites the audit flagged in **Pre-existing test failures**
(`__tests__/firmware-signature.test.js`) and in **Required
investigation** (`__tests__/manifest-required-configs.test.js`) now
pass cleanly against the regenerated manifest. The
`firmware-signature.test.js` `ENOENT` failures the audit recorded are
fully resolved by this PR.

Three new failures surfaced once the legacy `config_string` entries
left the manifest. They are downstream of files that this PR is
explicitly forbidden from touching, so they are tracked here as
follow-ups rather than fixed inline:

| Failing suite | Root cause | Suggested follow-up |
|---|---|---|
| `__tests__/kits-json.test.js` | `scripts/data/kits.json` still lists six legacy `firmware_config_string` values (`Ceiling-POE-AirIQ`, `Ceiling-USB-AirIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`, `Ceiling-USB-FanPWM`, `Ceiling-POE-VentIQ`) that no longer exist as manifest builds. | **WF-CLEANUP-006 (kits catalog)** — prune the legacy kit entries from `scripts/data/kits.json` (Path B) or re-import their firmware (Path A) once a stakeholder call is made. Out of scope for WF-CLEANUP-005 — `scripts/*` is off-limits per the brief. |
| `__tests__/module-selection-guidance.test.js` | Same root cause: the suite asserts every `kits.json` kit resolves to a manifest build. | Resolved by the same WF-CLEANUP-006 follow-up. |
| `__tests__/firmware-provenance.test.js` (one case: *at least one build is marked deprecated to exercise the dropdown skip*) | Backstop test that assumed at least one legacy build carried `deprecated: true`. Both regenerated builds carry `deprecated: false` (the Release-One and Rescue sidecars both set it false). | **WF-CLEANUP-007 (deprecated-build backstop)** — either land a future deprecated build, or relax the assertion. Cannot be fixed under this PR without editing a `.meta.json` sidecar (forbidden) or the test (out of scope). |

Validation snapshot after regeneration:

* `python3 scripts/gen-manifests.py --summary --dry-run --mode development` reports the same 2 builds and re-emits the same 2 per-build manifests (idempotent).
* `node scripts/validate-naming-policy.js firmware/configurations` passes.
* `npm test -- --ci`: 51 of 54 suites pass, 747 of 750 tests pass. The 3 failing suites are the new downstream failures listed above; none of them fails because of a missing `.bin`.

## WF-CLEANUP-006 update

WF-CLEANUP-006 adds an automated guard preventing generated manifests from
referencing missing binaries or otherwise drifting out of sync with the
firmware actually on disk. The guard ships as a single Jest suite at
`__tests__/manifest-health.test.js` and is picked up by the existing
`npm test -- --ci` step in `.github/workflows/firmware-publish.yml`, so it
fails the publish run before deploy if any of the following invariants
break:

1. Every `manifest.json` build's `parts[].path` resolves to a file on disk.
2. Every `firmware-*.json` build's `parts[].path` resolves to a file on disk.
3. Every `firmware/configurations/*.bin` has a matching `.meta.json` sidecar
   (Rescue under `firmware/rescue/` is exempt; it uses
   `firmware/rescue/manifest.json` instead, per the convention recorded
   above).
4. The `firmware-*.json` set is in sync with `manifest.json` — equal build
   counts, every per-build manifest references a path the top-level
   manifest also references, and no stale `firmware-N.json` files survive
   a regeneration.
5. No manifest build's `config_string` contains the globally blocked
   `FanTRIAC` token, and for every `firmware/sources.json` source that
   declares `block_tokens`, the matching manifest build's `config_string`
   contains none of those tokens. This is the mechanism that keeps `LED`
   out of the current Release-One (`Ceiling-POE-VentIQ-RoomIQ`) without
   globally banning `LED` for any future LED build.
6. Every entry in `REQUIRED_CONFIGS` (parsed from
   `.github/workflows/firmware-publish.yml`) appears as a `config_string`
   in `manifest.json`.

Scope of WF-CLEANUP-006 — what changed and what did not:

* **Changed:** new `__tests__/manifest-health.test.js`, this document,
  `docs/webflash-required-configs-cleanup.md`, and a short note in
  `DEVELOPER.md`'s Automated Testing section.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*`, `scripts/gen-manifests.py`,
  `scripts/validate-naming-policy.js`, `CLAUDE.md`, all firmware-signing
  artifacts, the wizard frontend, and `sw.js`. The guard is a pure
  read-only check — no manifest generation, signing, deploy, installer
  UX, source importer behaviour, config-string parsing, `REQUIRED_CONFIGS`
  allowlist, Release-One import, Rescue firmware, FanTRIAC blocked
  status, or LED exclusion status changes.

Validation snapshot at the WF-CLEANUP-006 commit (same tree state as
WF-CLEANUP-005):

* `npm test -- manifest-health` — 9 of 9 tests pass.
* `npm test -- --ci` — 52 of 55 suites pass; 756 of 759 tests pass. The 9
  newly-added tests all pass; the same 3 pre-existing failures
  (`kits-json.test.js`, `module-selection-guidance.test.js`,
  `firmware-provenance.test.js`) tracked in the WF-CLEANUP-005 update
  above remain and are explicitly out of scope.
* `node scripts/validate-naming-policy.js firmware/configurations` —
  passes.
* `python3 scripts/gen-manifests.py --summary --dry-run --mode development`
  — passes; output is idempotent (2 builds, 2 per-build manifests).

## WF-CLEANUP-007 update

WF-CLEANUP-007 is a **docs / agent-context-only** PR. It updates stale
agent and developer guidance so future maintainers and coding agents do
not reintroduce old manifest / config assumptions that WF-CLEANUP-004,
WF-CLEANUP-005, and WF-CLEANUP-006 already retired.

Scope of WF-CLEANUP-007 — what changed and what did not:

* **Changed:** `CLAUDE.md` (refresh of the `REQUIRED_CONFIGS` paragraph
  to reflect the 2-entry allowlist — `Ceiling-POE-VentIQ-RoomIQ` and
  `Rescue` — plus the importer / manifest-health / FanTRIAC-blocked /
  LED-excluded policy and an updated `config_string` example),
  `DEVELOPER.md` (Quick Reference reframed around the importer, the
  legacy direct-commit flow explicitly labelled, the Example release
  asset / body / sidecar swapped from the blocked
  `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` to the current Release-One
  `Ceiling-POE-VentIQ-RoomIQ`, validator-rejected legacy filename
  examples removed), `docs/firmware-import.md` (added a "current
  source-list state" note and a manifest-health-guard section),
  `docs/webflash-cleanup-audit.md` (this section), the
  `docs/webflash-required-configs-cleanup.md` update section, and minor
  `README.md` example refreshes.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*`, all of `scripts/`, all of
  `__tests__/`, `sw.js`, the wizard frontend, `package.json`, all
  firmware-signing artifacts. No code, workflow, manifest, firmware,
  frontend, runtime, service-worker, or test behaviour changes. The
  signing path, manifest generation behaviour, deploy behaviour,
  installer UX, source importer behaviour, config-string parsing,
  `REQUIRED_CONFIGS` allowlist, Release-One import, Rescue firmware,
  FanTRIAC blocked status, and LED exclusion status all stay as they
  landed in WF-CLEANUP-004 through WF-CLEANUP-006.

Validation snapshot at the WF-CLEANUP-007 commit:

* `npm test -- --ci` — recorded inline with the commit.
* `node scripts/validate-naming-policy.js firmware/configurations` —
  expected pass; no firmware filenames changed.
* `python3 scripts/gen-manifests.py --summary --dry-run --mode development`
  — expected pass; no firmware or sidecar changes, so the dry-run output
  must remain idempotent (2 builds, 2 per-build manifests).
* Sanity grep: `9 entries` / `10 entries` no longer appears as a current
  claim in `CLAUDE.md`, `README.md`, `DEVELOPER.md`, or `docs/`; any
  `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` references that remain are
  clearly labelled as legacy / blocked / historical, not as current
  Release-One.

## Next recommended follow-up — WF-CLEANUP-008

The follow-up after WF-CLEANUP-007 is **WF-CLEANUP-008 — Audit GitHub
Pages deployed surface**. It is intentionally **not** folded into
WF-CLEANUP-007 (which stays docs / context only) and should land as its
own PR.

Suggested scope when WF-CLEANUP-008 lands:

* fetch the live GitHub Pages `manifest.json` and compare it against the
  committed `manifest.json` (build count, `config_string` set,
  `generated_at`, `source_commit`);
* fetch every live `firmware-*.json` and confirm every `parts[].path`
  resolves on the deployed site (no 404s, no stale legacy build URLs);
* verify the service-worker cache behaviour against the cache-policy
  block in `sw.js` (especially that the cache name and per-asset
  strategies match what's documented in `README.md`'s "Cache and version
  policy" / "Per-asset cache policy" sections);
* check static HTML / JS references for any hardcoded `firmware-N.json`
  or `config_string` that pre-dates the 2-build manifest state;
* enumerate stale share-link / URL-parameter shapes (legacy
  `Ceiling-POE-AirIQ` etc.) and confirm the URL parser falls back
  cleanly when the resolved `config_string` no longer matches a
  manifest build;
* exercise the wizard end-to-end against deployed assets for
  configurations that no longer have a manifest build, and check the
  Step 5 preflight UX (`WF-CLEANUP-009 — Preflight UX for unmatched
  configurations` is the natural follow-up if gaps are found);
* review post-deploy smoke-test coverage in
  `.github/workflows/firmware-publish.yml` — confirm there is (or add) a
  step that verifies the live `manifest.json` after deploy matches the
  same `REQUIRED_CONFIGS` invariant the build step enforces, so a stale
  cached deploy can't outlive the source tree.

  **Status (WF-CLEANUP-009):** the post-deploy smoke test
  (`scripts/smoke-test-deployment.py`) had a stale default
  (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`); it now defaults to
  `Ceiling-POE-VentIQ-RoomIQ` and `__tests__/python/test_smoke_test_deployment.py`
  guards it against drifting back (and against any future `FanTRIAC`
  reference in the smoke-test script), and asserts the default is one
  of the workflow's `REQUIRED_CONFIGS` entries.

WF-CLEANUP-008 is read-only / observability work plus any
docs / CI updates that fall out of the audit; it should not itself
modify firmware, signing keys, manifests, the importer, or the wizard
frontend.

## WF-CLEANUP-010 update

WF-CLEANUP-010 reconciles `scripts/data/kits.json` with the cleaned
manifest. The six legacy sample kits surfaced as downstream failures by
WF-CLEANUP-005 (`Ceiling-POE-AirIQ`, `Ceiling-USB-AirIQ`,
`Ceiling-PWR-AirIQ`, `Ceiling-USB`, `Ceiling-USB-FanPWM`,
`Ceiling-POE-VentIQ`) all pointed at firmware that is no longer
published. They are removed in this PR rather than remapped to
Release-One — the underlying hardware (AirIQ / USB / 240v PSU / PWM fan)
does not match Release-One, so silently rewriting the firmware pointer
would have presented unsupported hardware as currently shippable. A
single new sample kit, `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`, replaces
them; it maps to the only production config in `manifest.json` today,
`Ceiling-POE-VentIQ-RoomIQ` (Sense360 Core + VentIQ + RoomIQ + PoE PSU).

The two downstream test failures tracked in the WF-CLEANUP-005 table
above — `__tests__/kits-json.test.js` and
`__tests__/module-selection-guidance.test.js` — are resolved by this PR.
`__tests__/firmware-provenance.test.js` (the deprecated-build backstop)
is untouched and still tracked separately. The kits-json suite was
strengthened with three new invariants so the drift cannot return
silently: no active kit may reference a `FanTRIAC` firmware config, no
active kit may enable `LED` for Release-One, and at least one active
kit must map to `Ceiling-POE-VentIQ-RoomIQ`.

Scope of WF-CLEANUP-010 — what changed and what did not:

* **Changed:** `scripts/data/kits.json` (6 stale samples removed, 1
  Release-One sample added), `__tests__/kits-json.test.js` (three new
  guards), this document, `docs/webflash-required-configs-cleanup.md`,
  and `docs/github-pages-surface-audit.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `manifest.json`, every `firmware-*.json`, `.github/workflows/*`,
  `scripts/gen-manifests.py`, `scripts/import-firmware-sources.py`,
  `scripts/validate-naming-policy.js`, `scripts/utils/kit-config.js`,
  `sw.js`, `index.html`, the wizard frontend, and `CLAUDE.md` /
  `DEVELOPER.md` (neither mentions kits). No manifest generation,
  signing, deploy, installer UX, source importer, config-string
  parsing, `REQUIRED_CONFIGS` allowlist, Release-One import, Rescue
  firmware, FanTRIAC blocked status, or LED exclusion status changes.
  The kit schema in `scripts/utils/kit-config.js` was not extended —
  the brief explicitly preferred not inventing a `deprecated` /
  `available` / `firmware_status` field unless a test proved it was
  required, and removing the stale samples covered the goal.

## WF-PRODUCT-001 — product-catalog alignment guard

Tests-only PR. Adds `__tests__/product-catalog-alignment.test.js` and a
vendored fixture at `__tests__/fixtures/esphome-product-catalog.json`. The
guard fails CI if `firmware/sources.json`, `manifest.json`, any
`firmware-*.json`, the publish workflow's `REQUIRED_CONFIGS`, or
`scripts/data/kits.json` references a config that the upstream
`sense360store/esphome-public` product catalog has marked anything other
than WebFlash-eligible (`production` for the import + publish path,
`production`/`preview` for manifests and kits). `Rescue` is exempt by name.
The test defaults to the offline fixture; set `PRODUCT_CATALOG_PATH` to a
downloaded catalog to validate against upstream live. No firmware,
manifests, importer, generator, workflow, or UI behavior changed.

## WF-PRODUCT-002 — product-catalog fixture refresh

Fixture-and-docs-only refresh. The vendored snapshot at
`__tests__/fixtures/esphome-product-catalog.json` was re-aligned with the
current upstream `sense360store/esphome-public` product catalog. The
upstream snapshot at refresh time held **33 products**: **1 production**
(`Ceiling-POE-VentIQ-RoomIQ`), **1 blocked**
(`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`), **0 preview**, and **31
legacy-compatible** entries enumerated by upstream PRODUCT-002. Status
fields on the two real entries WebFlash mirrors are unchanged; only the
`notes` / `reason` prose was synced (doc-link additions, plus the
GPIO5/GPIO6 / SX1509 / `ac_dimmer` rationale on the FanTRIAC blocker).
The fixture stays intentionally minimal — one representative
legacy-compatible row plus a clearly-labelled synthetic preview row —
because cloning all 31 legacy YAMLs would add churn without expanding
real coverage (the alignment test's "config_string not in catalog" branch
already rejects unknown legacy ids).

Active WebFlash surfaces (`firmware/sources.json`, `manifest.json`,
`firmware-*.json`, `REQUIRED_CONFIGS`, `scripts/data/kits.json`) still
resolve only to Release-One (`Ceiling-POE-VentIQ-RoomIQ`) plus the
WebFlash-owned `Rescue` build. **FanTRIAC remains blocked.** **LED
remains excluded from Release-One** — no upstream production or preview
entry carried an LED token at refresh time. The
`PRODUCT_CATALOG_PATH` environment variable remains the documented way
to validate the alignment test against a freshly downloaded upstream
catalog before refreshing the fixture again.

Scope of WF-PRODUCT-002 — what changed and what did not:

* **Changed:** `__tests__/fixtures/esphome-product-catalog.json` (prose
  on real entries synced; `_comment` block records the refresh and the
  upstream snapshot stats; synthetic preview and representative
  legacy-compatible rows are now explicit about being fixture-only),
  `docs/firmware-import.md`, this document,
  `docs/webflash-required-configs-cleanup.md`, `CLAUDE.md`, and
  `DEVELOPER.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*`, all of `scripts/`, all of
  `__tests__/` outside the fixture (the alignment test itself was not
  modified), `sw.js`, `index.html`, the wizard frontend, all
  firmware-signing artifacts. No firmware, manifests, importer,
  generator, workflow, kit metadata, signing path, installer UX,
  service-worker, source importer, `REQUIRED_CONFIGS` allowlist,
  Release-One import, Rescue firmware, FanTRIAC blocked status, or LED
  exclusion status changed.

## WF-PRODUCT-003 — product-catalog fixture refresh (LED preview)

Fixture-tests-and-docs refresh. Upstream `sense360store/esphome-public`
PRODUCT-009 promoted an LED-bearing sibling product
(`Ceiling-POE-VentIQ-RoomIQ-LED`) to a preview build with
`status: preview`, `channel: preview`, `version: 1.0.0`, `artifact_name:
Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`, and
`webflash_build_matrix: true`. The vendored alignment fixture at
`__tests__/fixtures/esphome-product-catalog.json` was re-aligned with
the current upstream catalog: the WF-PRODUCT-002 fixture's synthetic
`Ceiling-POE-VentIQ-RoomIQ-Preview` placeholder was removed and
replaced with the real upstream LED preview row, so the fixture's
preview-eligibility branch now exercises real upstream data.

The upstream snapshot at WF-PRODUCT-003 refresh time held **34
products**: **1 production** (`Ceiling-POE-VentIQ-RoomIQ`), **1
preview** (`Ceiling-POE-VentIQ-RoomIQ-LED`), **1 blocked**
(`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`), and **31 legacy-compatible**
entries. The fixture stays intentionally minimal — one row per real
upstream status WebFlash branches on, plus one representative
legacy-compatible row — because cloning all 31 legacy YAMLs would add
churn without expanding real coverage.

**WebFlash is aware of the LED preview but has not imported, signed,
manifested, or surfaced it.** Active WebFlash surfaces
(`firmware/sources.json`, `manifest.json`, `firmware-*.json`,
`REQUIRED_CONFIGS`, `scripts/data/kits.json`) still resolve only to
Release-One (`Ceiling-POE-VentIQ-RoomIQ`) plus the WebFlash-owned
`Rescue` build. **`REQUIRED_CONFIGS` remains production-only**.
**FanTRIAC remains blocked** under HW-005. **Release-One remains
LED-less**; the `firmware/sources.json` `block_tokens: ["FanTRIAC",
"LED"]` defence on the v1.0.0 source is unchanged and the manifest-
health guard still rejects an LED token in any generated `config_string`.

`__tests__/product-catalog-alignment.test.js` gained an explicit
`WF-PRODUCT-003 — upstream LED preview recognition` describe block
that pins both halves of the awareness-but-non-exposure contract: the
fixture exposes the LED preview as `status: preview` with the upstream
artifact_name / version / channel, and each active WebFlash surface
explicitly asserts it does **not** reference the LED preview today. A
manifest-shape snapshot lock (`manifest.json builds resolve to exactly
Release-One + Rescue`) and the kit-shape snapshot lock (`kits.json
references only Release-One`) document the unchanged-by-this-PR state.

Scope of WF-PRODUCT-003 — what changed and what did not:

* **Changed:** `__tests__/fixtures/esphome-product-catalog.json` (the
  synthetic preview row was removed and replaced with the real
  upstream LED preview row; `_comment` block bumped to record the
  WF-PRODUCT-003 refresh and the new upstream snapshot stats),
  `__tests__/product-catalog-alignment.test.js` (added the
  WF-PRODUCT-003 describe block and two named constants for the LED
  preview config string + artifact name — no rule changes to the
  existing alignment blocks), `docs/firmware-import.md`, this
  document, `docs/webflash-required-configs-cleanup.md`, `CLAUDE.md`,
  and `DEVELOPER.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `manifest.json`, every `firmware-*.json`, `.github/workflows/*`
  (including the `REQUIRED_CONFIGS` bash array), all of `scripts/`,
  `scripts/data/kits.json`, all of `__tests__/` outside the fixture
  and the alignment test, `__tests__/python/*` (the Python importer
  tests already negatively assert that an LED `.bin` is rejected by
  the Release-One source's `block_tokens`; unchanged here), `sw.js`,
  `index.html`, the wizard frontend, all firmware-signing artifacts.
  No firmware, manifests, importer, generator, workflow, kit
  metadata, signing path, installer UX, service-worker, source
  importer, `REQUIRED_CONFIGS` allowlist, Release-One import, Rescue
  firmware, FanTRIAC blocked status, or LED runtime-exposure status
  changed.

## WF-LED-001 — LED preview import plan (docs only)

WF-LED-001 is a **docs-only** PR that authors a forward-looking import
plan for the upstream LED preview build. The plan lives at
[`docs/led-preview-import-plan.md`](led-preview-import-plan.md) and
records the exact future shape of a second `firmware/sources.json`
source entry (using `block_tokens: ["FanTRIAC"]` only — `LED` would
prevent the importer from accepting its own asset), the seven upstream
proof fields that must land before WebFlash may import, the
import / regeneration sequence, the expected `manifest.json` outcome
(2 builds → 3 builds, with the new build carrying `channel: preview`),
the deferred UX / kit decisions, and the explicit do-not-change list.

**Nothing about WebFlash's current state changes under WF-LED-001.**
Active WebFlash surfaces (`firmware/sources.json`, `manifest.json`,
every `firmware-*.json`, the publish workflow's `REQUIRED_CONFIGS`,
and `scripts/data/kits.json`) still resolve only to Release-One
(`Ceiling-POE-VentIQ-RoomIQ`) plus the WebFlash-owned `Rescue` build.
**`REQUIRED_CONFIGS` remains production-only.** **FanTRIAC remains
blocked** under HW-005. **Release-One's source keeps
`block_tokens: ["FanTRIAC", "LED"]`** — the `LED` block on Release-One
is unchanged, because per-source `block_tokens` (enforced by
`scripts/import-firmware-sources.py` and asserted by
`__tests__/manifest-health.test.js`) let a future LED preview source
accept `LED` builds while Release-One continues to reject them. No
upstream LED preview artifact is proven yet.

Scope of WF-LED-001 — what changed and what did not:

* **Changed:** new `docs/led-preview-import-plan.md`, plus minimal
  cross-link sentences in `docs/firmware-import.md`, this document,
  `docs/webflash-required-configs-cleanup.md`, `CLAUDE.md`, and
  `DEVELOPER.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `manifest.json`, every `firmware-*.json`, `.github/workflows/*`,
  all of `scripts/`, `scripts/data/kits.json`, all of `__tests__/`
  (the WF-PRODUCT-003 `upstream LED preview recognition` describe
  block in `__tests__/product-catalog-alignment.test.js` is the live
  guard that already pins the no-exposure contract; WF-LED-001
  intentionally does not duplicate it), `sw.js`, `index.html`, the
  wizard frontend, all firmware-signing artifacts. No firmware,
  manifests, importer, generator, workflow, kit metadata, signing
  path, installer UX, service-worker, source importer,
  `REQUIRED_CONFIGS` allowlist, Release-One import, Rescue firmware,
  FanTRIAC blocked status, or LED runtime-exposure status changed.

## WF-LED-002 — LED preview imported

WF-LED-002 executes the import + manifest-regeneration sequence
documented by WF-LED-001 now that upstream
[`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview)
shipped a proven LED preview artifact (SHA256
`93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`,
1,135,904 bytes, release body carries all four canonical H2 sections).

Scope of WF-LED-002 — what changed and what did not:

* **Changed:**
  * `firmware/sources.json` gained a second source entry for the LED
    preview with `block_tokens: ["FanTRIAC"]` and a pinned
    `expected_sha256` field. Release-One source entry is byte-identical.
  * `scripts/import-firmware-sources.py` learned to enforce
    `expected_sha256` against the downloaded asset when the field is
    present (backward compatible when absent). The upstream
    `checksums-sha256.txt` verification is preserved unchanged.
  * `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`
    plus its `.meta.json` sidecar — imported through the regular
    cross-repo importer flow.
  * `manifest.json` grew from 2 builds to 3 (Release-One stable + LED
    preview + Rescue). LED preview build: `channel: preview`,
    `version: 1.0.0`, `chipFamily: ESP32-S3`, `improv: true`,
    `modules: ["VentIQ", "RoomIQ", "LED"]`.
  * `firmware-1.json` now hosts the LED preview build; the generator's
    deterministic ordering moved Rescue from `firmware-1.json` to
    `firmware-2.json`. Per-build manifest indices are not stable
    identifiers, only their part-path references are.
  * `__tests__/python/test_import_firmware_sources.py` gained four
    positive tests covering the new `expected_sha256` enforcement paths
    plus a positive `block_tokens: ["FanTRIAC"]` test for the LED
    preview source (the existing Release-One LED + FanTRIAC block tests
    are unchanged).
  * `__tests__/product-catalog-alignment.test.js` — the
    `firmware/sources.json ↔ product catalog` describe block relaxed
    from production-only to admit `preview`-status sources too
    (REQUIRED_CONFIGS stays production-only via its own separate test).
    The `WF-PRODUCT-003 — upstream LED preview recognition` describe
    block was updated to assert LED preview presence in
    `firmware/sources.json` + `manifest.json` and absence in
    `REQUIRED_CONFIGS` + `scripts/data/kits.json`.

* **Unchanged:**
  * Release-One source entry (`block_tokens: ["FanTRIAC", "LED"]` preserved).
  * Release-One manifest build content.
  * Rescue build content.
  * `REQUIRED_CONFIGS` in `.github/workflows/firmware-publish.yml` stays
    `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`. LED preview is **not**
    added to the publish allowlist until upstream promotes the LED
    build to `status: production`.
  * `scripts/data/kits.json`. LED preview kit exposure is deferred to
    WF-LED-003 (separate UX call).
  * All UI / wizard / `sw.js` / `index.html` / workflow files.
  * FanTRIAC blocked status under HW-005. FanTRIAC remains blocked
    globally (`manifest-health` guard) and per-source (both
    `firmware/sources.json` entries declare `FanTRIAC` in
    `block_tokens`).
  * Naming-policy validator. `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`
    matches the existing canonical-filename regex and carries no
    disallowed legacy tokens.
  * Smoke-test default (`Ceiling-POE-VentIQ-RoomIQ`). The smoke test
    only validates stable builds; the LED preview is channel=preview.

## WF-LED-003 — LED preview exposure decision (Option A: manifest-only)

WF-LED-003 records the deliberate UX decision for the imported LED
preview firmware that WF-LED-001 deferred and WF-LED-002 left
untouched. **Option A wins: manifest-only preview, no new kit, no new
mode toggle, no wizard / service-worker / workflow change, no firmware
or manifest regeneration.**

The investigation observed that the wizard already wires the `led`
module end-to-end (`index.html` step-4 toggle, `MODULE_KEYS` /
`MODULE_SEGMENT_FORMATTERS` / `parseConfigStringState` in
`scripts/state.js`, the `Sense360 LED` (S360-300) variant in
`scripts/data/module-requirements.js`), and that the release-channel
policy in `scripts/utils/release-channels.js` already implements an
appropriate preview gate (`defaultSelectable: false`,
`requiresAcknowledgement: true`, `hiddenByDefault: false`). With
WF-LED-002 having imported the preview firmware into `manifest.json`,
picking Ceiling + PoE + Bathroom + VentIQ + RoomIQ + LED in the wizard
now resolves to the preview build, surfaces the Preview badge +
experimental-build warning copy + `channel:preview` acknowledgement,
and gates install on that acknowledgement. Stable Release-One behaviour
is unchanged for any user who leaves the LED toggle off.

WF-LED-003 therefore:

* makes no firmware, manifest, source-list, kit, workflow, or wizard
  runtime change;
* relies on the existing release-channel gate as the single LED preview
  exposure mechanism;
* adds documentation in
  [`docs/led-preview-import-plan.md`](led-preview-import-plan.md)
  (extended LANDED banner + revised "UI and kit implications" +
  follow-up sequence update), [`docs/firmware-import.md`](firmware-import.md)
  (new `WF-LED-003 — LED preview exposure decision` subsection), this
  document, [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md),
  [`docs/github-pages-surface-audit.md`](github-pages-surface-audit.md),
  `CLAUDE.md`, and `DEVELOPER.md`;
* adds one targeted policy-level test in
  `__tests__/release-channel-ui.test.js`
  (`WF-LED-003 — LED preview exposure model …` describe block) that
  pins the LED-preview-shaped build's identity against the policy:
  never auto-selected by `pickDefaultBuild`, stable Release-One wins
  when both are candidate-eligible, `channel:preview` acknowledgement
  required, visible in normal mode, Preview badge with warning tone,
  never tagged Recommended.

Scope of WF-LED-003 — what changed and what did not:

* **Changed:** new doc text in the files listed above, one new
  describe block in `__tests__/release-channel-ui.test.js`. No rule
  changes to any existing test.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `manifest.json`, every `firmware-*.json`, `.github/workflows/*`
  (including `REQUIRED_CONFIGS`), all of `scripts/` (importer,
  generator, validator, runtime, `state.js`, `release-channels.js`,
  `recommended-bundle.js`, `kit-mode.js`, `gen-manifests.py`,
  `import-firmware-sources.py`, `validate-naming-policy.js`),
  `scripts/data/kits.json`, all of `__tests__/` outside the new
  describe block, `sw.js`, `index.html`, the wizard frontend, all
  firmware-signing artifacts. No firmware, manifests, importer,
  generator, workflow, kit metadata, signing path, installer UX,
  service-worker, source importer, `REQUIRED_CONFIGS` allowlist,
  Release-One import, Rescue firmware, FanTRIAC blocked status, or
  LED preview channel/version/artifact changed. Release-One stable
  install path is byte-identical to pre-WF-LED-003.

What a future WF-LED-004 could do, when its precondition lands:

* If upstream `sense360store/esphome-public` promotes the
  `Ceiling-POE-VentIQ-RoomIQ-LED` catalog entry from `status: preview`
  to `status: production`: add the config_string to
  `REQUIRED_CONFIGS` in `.github/workflows/firmware-publish.yml` after
  refreshing the alignment fixture, and re-evaluate kit / wizard
  promotion in the same PR or a follow-up.
* If S360-300 hardware bench verification clears the LED path while
  upstream still labels the catalog entry preview: optionally add a
  preview-labelled kit to `scripts/data/kits.json` (with explicit
  preview presentation in the kit UI) or add a dedicated preview-
  channel control. Either path is acceptable; WF-LED-003 does not
  pre-decide between them.

Neither precondition has landed as of WF-LED-003; the do-not-change
list above stays in force until it does.

## See also

* [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) — WF-UX-001
  live-wizard UX audit and PR roadmap (`WF-UX-QUICK-001` through
  `WF-UX-007` plus the operator-only `WF-HW-TEST-001` /
  `WF-HW-TEST-002` chain). Builds on the Release-One + Rescue +
  LED-preview surface area established by the WF-CLEANUP and WF-LED
  PRs catalogued here; preserves every do-not-change invariant
  recorded in this audit.
* [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md) —
  operator-validation container for the LED preview flash path.
  WF-HW-TEST-001 recorded live-deployment pre-flight evidence and
  the operator procedure; WF-HW-TEST-002 was the planned
  operator-evidence-collection follow-up but **no operator evidence
  was supplied**, so hardware flash status remains
  **pending — operator hardware test required** and no row was
  flipped to a recorded outcome by WF-HW-TEST-002.
* [`docs/product-import-readiness.md`](product-import-readiness.md) —
  WF-PRODUCT-004 advisory readiness validator. Codifies the
  Release-One / LED preview / FanTRIAC / legacy-compatible
  eligibility model captured by this audit as a runnable Node CLI
  plus Jest pin
  (`__tests__/product-import-readiness.test.js`).
* [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md) —
  WF-IMPORT-GAP-001 WebFlash-side import readiness matrix. Extends
  the audit history catalogued here forward into future per-family
  imports: classifies every candidate import family (Relay / PWM /
  DAC / TRIAC / 240V PSU / PoE PSU / LED stable / AirIQ) against
  the seven import classes (`none`, `docs-only`, `preview import
  candidate`, `advanced / manual-warning import only`, `stable
  import candidate after promotion`, `stable import`, `rescue
  import`, `legacy-only`), reserves the deliberate follow-up PR
  identifiers (`WF-IMPORT-RELAY-001`, `WF-IMPORT-PWM-001`,
  `WF-IMPORT-DAC-001`, `WF-IMPORT-TRIAC-001`,
  `WF-IMPORT-POWER-400-001`, `WF-IMPORT-POE-410-001`,
  `WF-LED-STABLE-001`, `WF-REQUIRED-001`, `WF-KIT-LED-001`), and
  preserves every do-not-change invariant recorded in this audit
  — including the production-only `REQUIRED_CONFIGS`, the
  Release-One-only kit, the FanTRIAC HW-005 block, and the
  WF-LED-003 manifest-only LED preview exposure. WF-IMPORT-GAP-001
  is documentation-only.

## WF-IMPORT-GAP-001 update

WF-IMPORT-GAP-001 adds the WebFlash-side **import readiness matrix**
at [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md).
The matrix is the downstream companion to PACKAGE-GAP-001 /
PRODUCT-GAP-001 / WEBFLASH-GAP-001 / RELEASE-GAP-001 upstream and to
WF-PRODUCT-004 ([`docs/product-import-readiness.md`](product-import-readiness.md))
in-repo: it records *which future upstream artifacts can eventually
be imported into WebFlash*, *what class* of import they would be,
and *what runtime exposure that import does and does not unlock*.

WF-IMPORT-GAP-001 imports nothing. It does not:

* import firmware (no new `.bin` and no new `.meta.json`),
* regenerate `manifest.json` or any `firmware-*.json`,
* edit `firmware/sources.json`,
* edit the `REQUIRED_CONFIGS` array in
  `.github/workflows/firmware-publish.yml` (still
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`),
* edit `scripts/data/kits.json` (still Release-One only),
* edit `scripts/utils/release-channels.js`,
  `scripts/utils/firmware-readiness.js`,
  `scripts/utils/module-availability.js`,
  `scripts/import-firmware-sources.py`,
  `scripts/gen-manifests.py`,
  `scripts/validate-product-import-readiness.js`, or
  `scripts/smoke-test-deployment.py`,
* edit `sw.js`, `_headers`, `index.html`, any CSS, any runtime JS,
  or any `__tests__/*` file,
* add a new test, or
* edit any workflow file under `.github/workflows/`.

Per-family classifications recorded by the matrix:

* **Release-One (`Ceiling-POE-VentIQ-RoomIQ`)** — `stable import`,
  already imported, in `REQUIRED_CONFIGS`, in `kits.json`, byte-
  identical to pre-WF-IMPORT-GAP-001.
* **LED preview (`Ceiling-POE-VentIQ-RoomIQ-LED`)** — `preview
  import`, already imported, **not** in `REQUIRED_CONFIGS`, **not**
  in `kits.json`, `channel:preview` acknowledgement required
  (WF-LED-003 invariant). LED stable is a separate
  `stable import candidate after promotion` class — gated on
  `RELEASE-007` + `S360-300-BENCH-001` and tracked as
  `WF-LED-STABLE-001`.
* **Rescue (`firmware/rescue/…`)** — `rescue import`, already
  imported, named exemption in `REQUIRED_CONFIGS`, byte-identical.
* **FanTRIAC / S360-320** — `blocked-from-standard-import` today;
  future class `advanced / manual-warning import only`; never
  `REQUIRED_CONFIGS` by default; never kit; never recommended;
  advanced-warning runtime UX (`WF-TRIAC-001`) required before
  `WF-IMPORT-TRIAC-001` may proceed.
* **Relay / S360-310, PWM / S360-311, DAC / S360-312, 240V PSU /
  S360-400, AirIQ / S360-210** — `not-import-ready` today;
  classified as future `preview import candidate` families. Per-
  family follow-up PRs (`WF-IMPORT-RELAY-001`, `WF-IMPORT-PWM-001`,
  `WF-IMPORT-DAC-001`, `WF-IMPORT-POWER-400-001`) are reserved
  pending the matching `RELEASE-…-001` upstream artifacts; AirIQ is
  listed as a candidate without a numbered PR slot.
* **PoE PSU / S360-410** — already covered transitively by the
  existing Release-One + LED preview `power=poe` artifacts. No
  separate import action exists or is planned;
  `WF-IMPORT-POE-410-001` is reserved as a no-op slot unless
  upstream ever ships a PoE-PSU-specific image.

Scope of WF-IMPORT-GAP-001 — what changed and what did not:

* **Changed:** new doc at
  [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md);
  short cross-link checkpoints in
  [`docs/firmware-import.md`](firmware-import.md),
  [`docs/product-import-readiness.md`](product-import-readiness.md),
  [`docs/led-preview-import-plan.md`](led-preview-import-plan.md),
  [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md),
  [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md),
  this document, and a single convention bullet in `CLAUDE.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `manifest.json`, every `firmware-*.json`, `.github/workflows/*`
  (including `REQUIRED_CONFIGS`), all of `scripts/` (importer,
  generator, validator, runtime, `state.js`, `release-channels.js`,
  `firmware-readiness.js`, `module-availability.js`,
  `recommended-bundle.js`, `kit-mode.js`, `gen-manifests.py`,
  `import-firmware-sources.py`, `validate-product-import-readiness.js`,
  `validate-naming-policy.js`, `smoke-test-deployment.py`),
  `scripts/data/kits.json`, all of `__tests__/`, `sw.js`,
  `_headers`, `index.html`, every CSS file, the wizard frontend,
  the rescue modal, the rescue manifest, all firmware-signing
  artifacts. Release-One stable install path, LED preview
  acknowledgement contract, FanTRIAC HW-005 block, Voice
  quarantine, the WF-WIZARD-AVAIL-001 module-availability
  classifications, and the WF-UX-002 readiness-string surface are
  all byte-identical to pre-WF-IMPORT-GAP-001.
