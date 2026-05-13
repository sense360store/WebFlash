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

Status: **blocked-reference**. FanTRIAC must remain blocked until hardware
verification (S360-320 schematic, GPIO/timing) lands. This PR does **not**
change the block. The orphan binary's fate (delete vs. wait) is a
follow-up decision.

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
