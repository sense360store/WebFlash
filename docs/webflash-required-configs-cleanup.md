# WebFlash REQUIRED_CONFIGS Cleanup Decision

WF-CLEANUP-003 — decision-only follow-up to WF-CLEANUP-001
(`docs/webflash-cleanup-audit.md`) and WF-CLEANUP-002 (orphan FanTRIAC
`.bin` removal in commit `4f807c4`).

This document classifies every entry in `REQUIRED_CONFIGS` and every stale
duplicate manifest entry and proposes follow-up PRs. **No firmware
binaries, sidecars, manifests, sources, workflows, scripts, or
`REQUIRED_CONFIGS` are modified by this PR.** Removals and re-imports
belong to the follow-up PRs sequenced below.

Decision recorded on branch `claude/cleanup-stale-configs-firmware-A8u3o`
on top of commit `4cccd2f` (WF-CLEANUP-002 merge).

## Current source of truth

| Field | Value |
| --- | --- |
| Audit baseline | `docs/webflash-cleanup-audit.md` (WF-CLEANUP-001) |
| FanTRIAC orphan disposition | Resolved by WF-CLEANUP-002 — the orphan `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` was removed from `firmware/configurations/`. `block_tokens: ["FanTRIAC", "LED"]` remains in `firmware/sources.json`. |
| Production Release-One firmware | `Ceiling-POE-VentIQ-RoomIQ` v1.0.0 stable, imported from `sense360store/esphome-public` `v1.0.0`, signed, in `firmware/sources.json`, manifest build 15, file 1,087,488 B, sha256 `9169f2ce…d7ceffcc`. |
| Recovery firmware | `Rescue` v1.0.0, at `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin`, manifest build 14, file 524,288 B, sha256 `feeae47f…6d09d5c7`. Uses the legacy per-product `firmware/rescue/manifest.json` rather than a `.meta.json` sidecar. |
| REQUIRED_CONFIGS location | `.github/workflows/firmware-publish.yml:202-213` (10 entries; allowlist matches on `config_string` only — no version/channel pin). |
| Manifest state | `manifest.json` ships 16 builds (indexes 0–15); 14 of the 16 reference `.bin` files that are missing from disk and are 18-byte stubs in the manifest (`file_size: 18`), confirming they were never real signed binaries. |
| Disk state under `firmware/configurations/` | 1 binary on disk: `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` plus its `.meta.json` sidecar. |
| Disk state under `firmware/rescue/` | 1 binary on disk: `Sense360-Rescue-v1.0.0-rescue.bin` plus per-product `manifest.json`. |
| Upstream import sources | `firmware/sources.json` declares exactly **1** source — Release-One. No source entry exists for any other `REQUIRED_CONFIGS` config string. |

## REQUIRED_CONFIGS inventory

10 entries in the workflow guard, classified per the WF-CLEANUP-003 policy
agreed for this PR. `firmware-N` is the `firmware-N.json` per-build manifest
file consumed at runtime by `<esp-web-install-button manifest=…>`.

| Config string | In manifest | firmware-N | .bin | .meta.json | Source entry | Status | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Ceiling-POE-AirIQ` | ✅ (builds 0–4) | ✅ (`firmware-0.json` … `firmware-4.json`) | ❌ | ❌ | ❌ | stale (legacy AirIQ, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-POE-VentIQ` | ✅ (build 5) | ✅ (`firmware-5.json`) | ❌ | ❌ | ❌ | stale (legacy, missing bin, no source — distinct from `Ceiling-POE-VentIQ-RoomIQ`) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-POE-VentIQ-RoomIQ` | ✅ (build 15) | ✅ (`firmware-15.json`) | ✅ | ✅ | ✅ (Release-One) | **current** | **Do not change.** Protect. |
| `Ceiling-PWR-AirIQ` | ✅ (builds 6–8) | ✅ (`firmware-6.json` … `firmware-8.json`) | ❌ | ❌ | ❌ | stale (legacy AirIQ, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-USB` | ✅ (build 9) | ✅ (`firmware-9.json`) | ❌ | ❌ | ❌ | stale (legacy, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-USB-AirIQ` | ✅ (build 10) | ✅ (`firmware-10.json`) | ❌ | ❌ | ❌ | stale (legacy AirIQ, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-USB-FanPWM` | ✅ (build 11) | ✅ (`firmware-11.json`) | ❌ | ❌ | ❌ | stale (legacy, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-Voice-POE-AirIQ` | ✅ (build 12) | ✅ (`firmware-12.json`) | ❌ | ❌ | ❌ | stale (legacy AirIQ, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Ceiling-Voice-USB` | ✅ (build 13) | ✅ (`firmware-13.json`) | ❌ | ❌ | ❌ | stale (legacy, missing bin, no source) | **needs-owner-decision (WF-CLEANUP-004)** |
| `Rescue` | ✅ (build 14) | ✅ (`firmware-14.json`) | ✅ | ⚠️ (per-product `firmware/rescue/manifest.json` instead of a `<asset>.meta.json` sidecar) | ❌ (not imported — built in-tree) | **current** | **Do not change.** Protect. |

Footnotes:

* "In manifest" / "firmware-N" / ".bin" / ".meta.json" / "Source entry"
  columns are independent presence checks against the on-disk state at the
  WF-CLEANUP-003 commit; they intentionally do **not** check checksums or
  signatures.
* For the 8 stale legacy entries, every signature/hash field in the
  manifest is populated against an 18-byte placeholder — there is no real
  signed payload anywhere on disk or in `firmware/sources.json` for any of
  them.
* The Rescue `.meta.json` column is ⚠️ rather than ❌ because the
  per-product `firmware/rescue/manifest.json` is the long-standing
  sanctioned format for Rescue. Migrating Rescue to the
  `<asset>.meta.json` layout is out of scope here and is not in the
  follow-up sequence.

## Stale manifest-only entries

Six manifest entries that reference missing `.bin` files **and** are not
the only entry covering their `REQUIRED_CONFIGS` slot. Because
`REQUIRED_CONFIGS` matches on `config_string` only — not on
version/channel — these duplicates can be pruned from `manifest.json`
later without breaking the workflow guard.

| Config string | Firmware file | Status | Recommended action |
| --- | --- | --- | --- |
| `Ceiling-POE-AirIQ` (v1.0.0 / stable, build 1; `deprecated: true`, "Superseded by v2.0.0") | `firmware/configurations/Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin` | stale-duplicate (older stable shadowed by build 0 v2.0.0) | **candidate-for-manifest-pruning (WF-CLEANUP-006)** |
| `Ceiling-POE-AirIQ` (v2.0.0 / beta, build 2) | `firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-beta.bin` | stale-duplicate (beta channel; not required by `REQUIRED_CONFIGS`) | **candidate-for-manifest-pruning (WF-CLEANUP-006)** |
| `Ceiling-POE-AirIQ` (v1.0.1 / beta, build 3) | `firmware/configurations/Sense360-Ceiling-POE-AirIQ-v1.0.1-beta.bin` | stale-duplicate (beta channel; not required by `REQUIRED_CONFIGS`) | **candidate-for-manifest-pruning (WF-CLEANUP-006)** |
| `Ceiling-POE-AirIQ` (v1.0.0 / beta, build 4) | `firmware/configurations/Sense360-Ceiling-POE-AirIQ-v1.0.0-beta.bin` | stale-duplicate (beta channel; not required by `REQUIRED_CONFIGS`) | **candidate-for-manifest-pruning (WF-CLEANUP-006)** |
| `Ceiling-PWR-AirIQ` (v1.0.0 / stable, build 7) | `firmware/configurations/Sense360-Ceiling-PWR-AirIQ-v1.0.0-stable.bin` | stale-duplicate (older stable shadowed by build 6 v1.0.1) | **candidate-for-manifest-pruning (WF-CLEANUP-006)** |
| `Ceiling-PWR-AirIQ` (v1.0.1 / beta, build 8) | `firmware/configurations/Sense360-Ceiling-PWR-AirIQ-v1.0.1-beta.bin` | stale-duplicate (beta channel; not required by `REQUIRED_CONFIGS`) | **candidate-for-manifest-pruning (WF-CLEANUP-006)** |

The remaining stale manifest entries (builds 0, 5, 6, 9, 10, 11, 12, 13)
are **not** in this table because each is the sole manifest representative
of a `REQUIRED_CONFIGS` `config_string`. Pruning any of those without
first updating `REQUIRED_CONFIGS` would break the workflow guard. Their
fate is therefore deferred to WF-CLEANUP-004 (which is also the
`needs-owner-decision` PR for the 8 legacy `REQUIRED_CONFIGS` entries) and
WF-CLEANUP-005 (manifest regeneration).

## Recommended actions

1. **Protect Release-One and Rescue.** `Ceiling-POE-VentIQ-RoomIQ`
   (manifest build 15) and `Rescue` (manifest build 14) are the only two
   `REQUIRED_CONFIGS` entries with real `.bin` files on disk and are the
   only configurations the deployed installer can currently flash. Their
   files, sidecars, manifest entries, and `firmware-N.json` companions
   must not be deleted, renamed, or rewritten without an explicit
   follow-up sign-off.

2. **Defer all 8 legacy `REQUIRED_CONFIGS` entries to a stakeholder
   call** (`Ceiling-POE-AirIQ`, `Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`,
   `Ceiling-USB`, `Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`,
   `Ceiling-Voice-POE-AirIQ`, `Ceiling-Voice-USB`). They are
   `needs-owner-decision` because two outcomes are both defensible:

   * **Path A — keep and import.** Add a `firmware/sources.json` entry
     pointing at a future `sense360store/esphome-public` release that
     publishes a real `.bin` for the config_string. The `REQUIRED_CONFIGS`
     line keeps expressing the product-line intent until that import
     lands. WF-CLEANUP-004 adds the source entries; WF-CLEANUP-005
     regenerates the manifest after the importer has run.
   * **Path B — remove and prune.** Drop the entry from
     `REQUIRED_CONFIGS` in `.github/workflows/firmware-publish.yml`, then
     prune the matching manifest build(s) in `manifest.json` and the
     `firmware-N.json` companion(s). The deployed wizard would then stop
     surfacing an install option that silently fails at flash-time
     (`<esp-web-install-button>` fetches the binary at install-time only,
     after preflight and after the user has plugged in the device).

   Per the WF-CLEANUP-003 policy agreed for this PR, **this document does
   not preselect Path A or Path B for any of the 8 entries.** The choice
   must be made per-config in WF-CLEANUP-004.

3. **Prune the 6 stale duplicate manifest entries** (builds 1, 2, 3, 4,
   7, 8) in WF-CLEANUP-006 once the legacy-entries decision in
   WF-CLEANUP-004 is settled. Because none of those six are the sole
   manifest representative of their `config_string`, pruning them does
   not affect the `REQUIRED_CONFIGS` workflow guard or change which
   configurations the wizard surfaces.

4. **Do not regenerate the manifest in this PR.** `gen-manifests.py`
   reads only `firmware/configurations/` and `firmware/rescue/` — with
   today's disk state it would shrink the manifest from 16 builds to
   2 (`Ceiling-POE-VentIQ-RoomIQ` + `Rescue`) and the workflow's
   `REQUIRED_CONFIGS` guard would immediately fail on push for 8 of the
   10 entries. Regeneration is sequenced as WF-CLEANUP-005, after the
   legacy-entries decision.

## Follow-up PR sequence

Sequenced so each PR keeps CI green and the deployed installer in a
known-good state at every commit.

| PR | Purpose | Touches |
| --- | --- | --- |
| **WF-CLEANUP-004** | Stakeholder call: per-config Path A (re-import: add `firmware/sources.json` entry) vs Path B (remove from `REQUIRED_CONFIGS`) for each of the 8 legacy entries listed above. May land as a single PR if all 8 take the same path, or as one PR per path. | `firmware/sources.json` (Path A) and/or `.github/workflows/firmware-publish.yml` `REQUIRED_CONFIGS` array (Path B). |
| **WF-CLEANUP-005** | After WF-CLEANUP-004 lands: regenerate `manifest.json` and `firmware-*.json` from the resulting disk state. For Path A configs, run `python3 scripts/import-firmware-sources.py` first; for Path B configs, just run `python3 scripts/gen-manifests.py --summary`. Commit `.bin`, `.meta.json`, `manifest.json`, and the renumbered `firmware-*.json` files together. Verify the workflow's `REQUIRED_CONFIGS` guard passes and `__tests__/firmware-signature.test.js` goes green. | `manifest.json`, `firmware-*.json`, plus any newly imported `firmware/configurations/*.bin` / `*.meta.json`. |
| **WF-CLEANUP-006** | Prune the 6 stale duplicate manifest entries (builds 1, 2, 3, 4, 7, 8). May be folded into WF-CLEANUP-005 if regeneration naturally drops them; called out separately because pruning a `deprecated: true` build (build 1) and the older-stable shadow (build 7) is an explicit policy decision. | `manifest.json`, the renumbered `firmware-*.json`. |
| **WF-CLEANUP-007** | Add a CI guard that fails the workflow if any `manifest.json` build references a `.bin` or `.meta.json` that is missing from disk, or whose recorded `sha256` does not match the file on disk. This would have surfaced the WF-CLEANUP-001 audit findings as a CI failure rather than a follow-up audit. (Already proposed by WF-CLEANUP-001 as WF-CLEANUP-008; renumbered here for clarity.) | New test or workflow step. |
| **WF-CLEANUP-008 (doc-drift) — superseded by WF-CLEANUP-007** | Originally proposed bumping `CLAUDE.md:105` from "holds 9 entries" to "holds 10 entries" after WF-CLEANUP-004 lands. Superseded: WF-CLEANUP-004 took **Path B** for all 8 legacy entries, so the final allowlist is **2 entries** (`Ceiling-POE-VentIQ-RoomIQ` and `Rescue`), not 10. WF-CLEANUP-007 rewrote `CLAUDE.md`'s `REQUIRED_CONFIGS` paragraph against the actual 2-entry state, so this row is no longer actionable. The slot **WF-CLEANUP-008** is now reused for the GitHub Pages deployed-surface audit described below. | n/a (superseded). |

`gen-manifests.py` hardening (block_tokens enforcement in the generator,
not just in the importer) is **already shipped** by WF-CLEANUP-002's
removal of the orphan FanTRIAC binary plus the importer's existing
`block_tokens` enforcement, so it is **not** re-listed here.

## Do-not-delete list

The following items must not be deleted, renamed, or rewritten without an
explicit follow-up sign-off, and certainly not as part of this PR:

| Item | Reason |
| --- | --- |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` | Current Release-One firmware. Imported, signed, in `sources.json`, in `REQUIRED_CONFIGS`, served by the deployed installer. |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.meta.json` | Production sidecar carrying provenance, release-body sections, and `source.imported_at`. |
| `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin` | Current Rescue firmware. In `REQUIRED_CONFIGS`. Unbricking path. |
| `firmware/rescue/manifest.json` | Per-product manifest consumed at install-time by `<esp-web-install-button>` for the Rescue path. |
| `manifest.json` | Single source of truth for the deployed installer. Regenerate only via `gen-manifests.py`; do not hand-edit. |
| `firmware-0.json` … `firmware-15.json` | Consumed at runtime by `<esp-web-install-button manifest="firmware-N.json">`. Renumbering happens only through `gen-manifests.py`. |
| `firmware/sources.json` | Only declarative record of cross-repo import scope; carries `block_tokens` for `FanTRIAC` and `LED`. |
| `.github/workflows/firmware-publish.yml` | Holds `REQUIRED_CONFIGS`. Pruning entries here changes which products ship. |
| `.github/workflows/firmware-import.yml` | Cross-repo import workflow. Out of scope for this PR. |
| `scripts/gen-manifests.py` | Sole sanctioned manifest writer. |
| `scripts/import-firmware-sources.py` | Sole sanctioned importer. Enforces `block_tokens` for `FanTRIAC` / `LED`. |
| Every `REQUIRED_CONFIGS` entry (all 10) | This PR is decision-only. Removing or adding entries belongs to WF-CLEANUP-004. |

## Validation results

The brief's three validation commands were run on this branch at the
WF-CLEANUP-003 commit. Findings are recorded honestly; nothing was fixed
to make a command pass.

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- --ci` | **53 of 54 suites passed; 748 of 750 tests passed.** 2 failures, both in `__tests__/firmware-signature.test.js`. | Both failures are `ENOENT: no such file or directory, open '…/firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin'` at `firmware-signature.test.js:252` and `:309`. **Pre-existing**, caused entirely by the 14 missing legacy `.bin` files documented above. Identical to the WF-CLEANUP-001 audit baseline. Not fixed in this PR; the test will go green once WF-CLEANUP-005 regenerates the manifest from the post-WF-CLEANUP-004 disk state. |
| `node scripts/validate-naming-policy.js firmware/configurations` | **PASS** (exit 0). | Only one binary on disk under `firmware/configurations/` (`Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin`) and its filename matches the canonical `Sense360-...-vX.Y.Z-(stable\|preview\|beta).bin` pattern. |
| `python3 scripts/gen-manifests.py --summary --dry-run` | **Refuses (exit 1)** in production mode: `Signing key id 'dev-2026-01' is marked 'test_only' (its private half is exposed in the repo). It MUST NOT sign production manifests`. This is the intended production-mode behaviour with only the in-tree dev key available. | Re-ran as `python3 scripts/gen-manifests.py --summary --dry-run --mode development`: **succeeds (exit 0)** and shows the generator would shrink `manifest.json` from 16 builds to 2 (`Ceiling-POE-VentIQ-RoomIQ` stable + `Rescue`) and would renumber every `firmware-*.json` file. Regeneration is **not** performed in this PR — the resulting manifest would fail the `REQUIRED_CONFIGS` workflow guard for 8 of the 10 entries. Sequenced as WF-CLEANUP-005. |

Environment notes (recorded for the next auditor; nothing committed):

* `npm install --no-audit --no-fund --no-save` was needed to populate
  `node_modules/` before `npm test` could run on this sandbox image.
* `pip install --user cffi cryptography` was needed to restore the
  `_cffi_backend` binding on the sandbox image's Python 3.11 install
  before `gen-manifests.py` could reach its signing path. Without it,
  `gen-manifests.py` aborts at `pyo3_runtime.PanicException: Python API
  call failed` before any manifest output is produced.

## Acceptance criteria checklist

* ✅ Every `REQUIRED_CONFIGS` entry is classified
  (`Ceiling-POE-VentIQ-RoomIQ` and `Rescue` as `current`; the other 8 as
  `needs-owner-decision`).
* ✅ Every stale manifest-only entry (the 6 duplicate version/channel
  variants of `Ceiling-POE-AirIQ` and `Ceiling-PWR-AirIQ`) is classified.
* ✅ Current Release-One (`Ceiling-POE-VentIQ-RoomIQ`) and `Rescue` are
  clearly protected in the **Do-not-delete list** and in the table itself.
* ✅ Follow-up PRs are proposed (WF-CLEANUP-004 … WF-CLEANUP-008).
* ✅ No firmware/manifest/signing/deploy/installer/importer/source/config-string
  behaviour changes; only this document is added.

## WF-CLEANUP-004 outcome

WF-CLEANUP-004 landed **Path B (remove from `REQUIRED_CONFIGS`)** for all
8 legacy entries listed in the table above (`Ceiling-POE-AirIQ`,
`Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`,
`Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`, `Ceiling-Voice-POE-AirIQ`,
`Ceiling-Voice-USB`). None of them had a `.bin` on disk or a source entry,
so keeping them in the workflow guard expressed intent the repo could not
satisfy. The allowlist in `.github/workflows/firmware-publish.yml` now
contains only the two configs WebFlash can actually ship today:

* `Ceiling-POE-VentIQ-RoomIQ` (current Release-One)
* `Rescue`

Scope of WF-CLEANUP-004 — what changed and what did not:

* **Changed:** `REQUIRED_CONFIGS` array and surrounding comment in
  `.github/workflows/firmware-publish.yml`; this document; the audit
  document at `docs/webflash-cleanup-audit.md`; a `CHANGELOG.md` bullet
  under `[Unreleased] → Changed`.
* **Unchanged:** `manifest.json`, every `firmware-*.json`, every
  `firmware/configurations/*.bin` and `*.meta.json`, `firmware/rescue/*`,
  `firmware/sources.json`, all scripts, the signing path, manifest
  generation behaviour, deploy behaviour, installer UX, source importer
  behaviour, config-string parsing, the Release-One import, the Rescue
  firmware, the `FanTRIAC` blocked status, and the `LED` exclusion status.

Manifest pruning, `firmware-*.json` regeneration, and the regenerated
`gen-manifests.py` output are intentionally deferred to **WF-CLEANUP-005
— regenerate/prune manifests to actual disk state**. Until that PR lands,
`manifest.json` continues to carry the 14 stale build entries pointing at
missing `.bin` files documented in the table above, and the two
pre-existing `__tests__/firmware-signature.test.js` failures (`ENOENT` on
`Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin` at lines 252 and 309)
remain. Path B as applied here does **not** itself surface or hide any
build in the deployed installer — it only stops the CI guard from
treating those 8 legacy configs as required ship-ready configs.

Re-import remains possible at any time: WF-CLEANUP-004 takes Path B for
the current snapshot but does not foreclose Path A. Any of the 8 removed
configs can be re-added to `REQUIRED_CONFIGS` once a corresponding entry
lands in `firmware/sources.json`, the importer pulls the `.bin` from a
future `sense360store/esphome-public` release, and the regenerated
manifest reflects it.

## WF-CLEANUP-005 update

WF-CLEANUP-005 has now regenerated `manifest.json` and the numbered
`firmware-*.json` files against the actual on-disk firmware assets, so
the generated manifest state finally matches the `REQUIRED_CONFIGS`
allowlist this document set. The 14 stale build entries and the
corresponding stale `firmware-*.json` files that the closing paragraphs
above predicted have been pruned by the generator. After regeneration:

* `manifest.json` carries exactly 2 builds — `Ceiling-POE-VentIQ-RoomIQ`
  (stable v1.0.0) and `Rescue` (rescue v1.0.0). Both `REQUIRED_CONFIGS`
  entries are present.
* Only `firmware-0.json` (`Ceiling-POE-VentIQ-RoomIQ`) and
  `firmware-1.json` (`Rescue`) remain; the 14 stale numbered manifests
  were deleted by the generator's glob-cleanup step.
* Every `.bin` referenced from `manifest.json` and the surviving
  `firmware-*.json` files exists on disk.
* The two pre-existing `__tests__/firmware-signature.test.js` `ENOENT`
  failures recorded above are resolved by the regeneration. See the
  WF-CLEANUP-005 update in `docs/webflash-cleanup-audit.md` for the
  three new downstream test failures (rooted in `scripts/data/kits.json`
  and a deprecated-build backstop, both off-limits in this PR) and the
  follow-up tasks tracking them.

Scope of WF-CLEANUP-005 — what changed and what did not:

* **Changed:** `manifest.json`, the surviving `firmware-0.json` and
  `firmware-1.json` (regenerated), and this document plus
  `docs/webflash-cleanup-audit.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `.github/workflows/*`, all of `scripts/`, the signing path, manifest
  generation behaviour, deploy behaviour, installer UX, source importer
  behaviour, config-string parsing, the `REQUIRED_CONFIGS` allowlist
  itself, the Release-One import, the Rescue firmware, the `FanTRIAC`
  blocked status, and the `LED` exclusion status. No legacy configs and
  no FanTRIAC entry were re-introduced.

## WF-CLEANUP-006 update

WF-CLEANUP-006 adds an automated guard preventing generated manifests
from referencing missing binaries or drifting out of sync with the
firmware actually on disk. It ships as a single Jest suite at
`__tests__/manifest-health.test.js` and runs as part of the existing
`npm test -- --ci` step in `.github/workflows/firmware-publish.yml`, so
the publish run fails before deploy if any of the following invariants
break:

* every `manifest.json` build part path resolves to a file on disk;
* every `firmware-*.json` build part path resolves to a file on disk;
* every `firmware/configurations/*.bin` has a sibling `.meta.json`
  sidecar (Rescue under `firmware/rescue/` remains exempt — it uses the
  per-product `firmware/rescue/manifest.json` instead);
* the `firmware-*.json` set is in sync with `manifest.json` (equal build
  counts, every per-build manifest's path is also in `manifest.json`, no
  orphan `firmware-N.json` files);
* no manifest build's `config_string` carries the globally blocked
  `FanTRIAC` token, and for every `firmware/sources.json` source that
  declares `block_tokens`, the matching manifest build contains none of
  those tokens (this is what keeps `LED` out of the current Release-One
  `Ceiling-POE-VentIQ-RoomIQ` without globally banning `LED` for any
  future LED build);
* every entry in `REQUIRED_CONFIGS` (parsed from
  `.github/workflows/firmware-publish.yml`) appears as a `config_string`
  in `manifest.json`.

Scope of WF-CLEANUP-006 — what changed and what did not:

* **Changed:** new `__tests__/manifest-health.test.js`, this document,
  `docs/webflash-cleanup-audit.md`, and a short mention in
  `DEVELOPER.md`'s Automated Testing section.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*`, `scripts/gen-manifests.py`,
  `scripts/validate-naming-policy.js`, `CLAUDE.md`, all firmware-signing
  artifacts, the wizard frontend, and `sw.js`. The guard is a pure
  read-only check — no manifest generation, signing, deploy, installer
  UX, source importer, config-string parsing, `REQUIRED_CONFIGS`
  allowlist, Release-One import, Rescue firmware, FanTRIAC blocked
  status, or LED exclusion status changes.

Validation at the WF-CLEANUP-006 commit (clean tree post-WF-CLEANUP-005):

* `npm test -- manifest-health` — 9 of 9 tests pass.
* `npm test -- --ci` — 52 of 55 suites pass; 756 of 759 tests pass. The
  9 new tests all pass; the 3 pre-existing failures
  (`kits-json.test.js`, `module-selection-guidance.test.js`,
  `firmware-provenance.test.js`) recorded by WF-CLEANUP-005 remain and
  are explicitly out of scope.
* `node scripts/validate-naming-policy.js firmware/configurations` —
  passes.
* `python3 scripts/gen-manifests.py --summary --dry-run --mode development`
  — passes; idempotent (2 builds, 2 per-build manifests).

## WF-CLEANUP-007 update

WF-CLEANUP-007 is a **docs / agent-context-only** PR. It updates stale
agent and developer guidance so future maintainers and coding agents do
not reintroduce the legacy 10-entry / FanTRIAC / manual-copy assumptions
that WF-CLEANUP-004 through WF-CLEANUP-006 already retired.

The proposed **WF-CLEANUP-008 (doc-drift)** row in the follow-up table
above was based on the pre-WF-CLEANUP-004 plan where the allowlist would
have grown from 9 to 10 entries. WF-CLEANUP-004 actually took **Path B**
for all 8 legacy entries, leaving the allowlist at 2 entries
(`Ceiling-POE-VentIQ-RoomIQ` + `Rescue`). WF-CLEANUP-007 rewrites
`CLAUDE.md` against that real state, so the "bump from 9 to 10" plan no
longer applies and is marked superseded inline. The
**WF-CLEANUP-008** slot is reused for the GitHub Pages deployed-surface
audit (see the closing section of `docs/webflash-cleanup-audit.md`).

Scope of WF-CLEANUP-007 — what changed and what did not:

* **Changed:** `CLAUDE.md` (`REQUIRED_CONFIGS` paragraph and inline
  `config_string` examples), `DEVELOPER.md` (Quick Reference reframed
  around the importer, "Via Direct Commit" labelled legacy, Example
  release asset / body / sidecar swapped to the current Release-One,
  legacy filename examples cleaned), `docs/firmware-import.md` (current
  source-list state + manifest-health-guard pointer),
  `docs/webflash-cleanup-audit.md` (WF-CLEANUP-007 update + new
  WF-CLEANUP-008 follow-up), this document (this update section +
  superseded row), and minor `README.md` example refreshes.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*`, all of `scripts/`, all of
  `__tests__/`, `sw.js`, `package.json`, the wizard frontend, all
  firmware-signing artifacts. No code, workflow, manifest, firmware,
  frontend, runtime, service-worker, or test behaviour changes. The
  signing path, manifest generation behaviour, deploy behaviour,
  installer UX, source importer behaviour, config-string parsing,
  `REQUIRED_CONFIGS` allowlist itself, Release-One import, Rescue
  firmware, FanTRIAC blocked status, and LED exclusion status all
  stay exactly as they landed in WF-CLEANUP-004 through WF-CLEANUP-006.

Re-import remains the only sanctioned path back to a legacy `config_string`:
any of the 8 removed configs can be re-added to `REQUIRED_CONFIGS` once a
corresponding `firmware/sources.json` entry lands, the importer pulls a
real `.bin` + `.meta.json` from a future `sense360store/esphome-public`
release, and the regenerated manifest reflects it. Manual placement of a
`.bin` into `firmware/configurations/` is not the normal intake path —
the manifest-health guard (WF-CLEANUP-006) will fail CI if sidecar /
source / `REQUIRED_CONFIGS` expectations are not satisfied.

## WF-CLEANUP-010 update

WF-CLEANUP-010 reconciles `scripts/data/kits.json` with the WF-CLEANUP-004
`REQUIRED_CONFIGS` allowlist. The 6 legacy sample kits pointed at the
8 legacy configs Path B'd out of `REQUIRED_CONFIGS`
(`Ceiling-POE-AirIQ`, `Ceiling-USB-AirIQ`, `Ceiling-PWR-AirIQ`,
`Ceiling-USB`, `Ceiling-USB-FanPWM`, `Ceiling-POE-VentIQ`), so the kit
picker would have silently lost every entry after the next deploy.
WF-CLEANUP-010 removes those 6 samples and adds one Release-One sample
kit (`S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`) mapped to the only production
allowlist entry, `Ceiling-POE-VentIQ-RoomIQ`. The Rescue entry stays
untouched — it is reached through the rescue release-mode flow, not
through `kits.json`.

The kit-catalog change does **not** modify `REQUIRED_CONFIGS`, the
manifest, the importer, or any firmware on disk. Re-import is still the
only sanctioned path to a legacy config; bringing a legacy kit back to
the picker would require restoring its `config_string` in `manifest.json`
first via a fresh source-import.

Scope of WF-CLEANUP-010 — what changed and what did not:

* **Changed:** `scripts/data/kits.json` (6 stale samples removed, 1
  Release-One sample added), `__tests__/kits-json.test.js` (three new
  guards: no FanTRIAC kit, no Release-One LED kit, at least one
  Release-One kit), `docs/webflash-cleanup-audit.md`, this document,
  and `docs/github-pages-surface-audit.md`.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*` (including the WF-CLEANUP-004
  `REQUIRED_CONFIGS` allowlist), `scripts/gen-manifests.py`,
  `scripts/import-firmware-sources.py`, `scripts/validate-naming-policy.js`,
  `scripts/utils/kit-config.js`, `sw.js`, `index.html`, and the wizard
  frontend. No manifest, signing, deploy, importer, service-worker,
  Release-One, Rescue, FanTRIAC blocked status, or LED exclusion status
  changes.
## WF-CLEANUP-009 update

WF-CLEANUP-009 is a **post-deploy smoke-test fix** that aligns
`scripts/smoke-test-deployment.py` with the `REQUIRED_CONFIGS` state
captured in this document. The smoke test ran after every deploy with a
stale default required config (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`),
which would have failed every deploy after the WF-CLEANUP-004 / 002 work
landed because that config is neither in `REQUIRED_CONFIGS` nor in
`manifest.json`.

Scope of WF-CLEANUP-009 — what changed and what did not:

* **Changed:** `scripts/smoke-test-deployment.py` (default
  `DEFAULT_REQUIRED_CONFIG` flipped from
  `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` to `Ceiling-POE-VentIQ-RoomIQ`;
  module docstring updated accordingly), new
  `__tests__/python/test_smoke_test_deployment.py` (drift guards:
  pins the default to the current Release-One `config_string`, asserts
  no `FanTRIAC` reference survives anywhere in the smoke-test script,
  and asserts the default appears in the workflow's `REQUIRED_CONFIGS`
  allowlist), short status notes in `docs/github-pages-surface-audit.md`,
  `docs/webflash-cleanup-audit.md`, and this document.
* **Unchanged:** every `firmware/configurations/*.bin` and `*.meta.json`,
  `firmware/rescue/*`, `firmware/sources.json`, `manifest.json`, every
  `firmware-*.json`, `.github/workflows/*` (including the
  `REQUIRED_CONFIGS` bash array and the smoke-test invocation),
  `sw.js`, `index.html`, the wizard frontend, all firmware-signing
  artifacts. The signing path, manifest generation behaviour, deploy
  behaviour, installer UX, source importer behaviour, config-string
  parsing, `REQUIRED_CONFIGS` allowlist itself, Release-One import,
  Rescue firmware, FanTRIAC blocked status, and LED exclusion status
  all stay exactly as they landed in WF-CLEANUP-004 through
  WF-CLEANUP-007.
