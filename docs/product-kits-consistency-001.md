# PRODUCT-KITS-CONSISTENCY-001 — WebFlash tracking

Programme: kit naming and display consistency (display / metadata layer only).
Repo scope for this file: `sense360store/WebFlash`.

## Step ledger (lowest non-EXECUTED step is the next session's work)

| Step | Title | Status |
|---|---|---|
| N1 | Fix kit display bugs + single-source derivation | EXECUTED — PR #590 (held for owner) |
| N2 | Kit visibility audit (only if N1 left it open) | EXECUTED (no-op confirmation) — PR TBD (held for owner) |

> N3 (guide-title alignment) lives in the `sense360store/esphome-public`
> repo and is tracked by that repo's own copy of this file, not here.

## SAFETY RULE (applies to every step)

The `hardware-pending` configs (mains / relay fan variants + RoomIQ-LED,
`bench_proof: NONE`) MUST NOT be surfaced as installable kits. Kit visibility
is limited to release-ready configs (catalog status `production`, or `preview`
with an explicit preview badge). No step promotes, unblocks, or displays a
hardware-pending or compile-only config as installable. No step changes
`firmware/`, `firmware/sources.json` served entries, manifests, or any released
binary. This is display / metadata (and, in N3, docs) only.

## N1 — EXECUTED

Fixed the two display bugs the flasher screenshot exposed and made the kit
metadata impossible to drift from served reality again.

- **Bug 2 (Bedroom description):** the Bedroom bundle (`Ceiling-POE-RoomIQ`,
  served stable v1.0.8) carried a description that read "Preview firmware —
  acknowledge the preview channel before installing". The badge already keyed
  off the real stable channel (`kitFilterChannel` / `firmware_channel` in
  `scripts/identify.js`), so only the description text was wrong. It now reads
  "Stable firmware — ready to install".
- **Bug 1 (stale version):** the per-kit version was never carried in
  `kits.json` — `scripts/app.js` `resolveKitVersions` already resolves it live
  from the served manifest (`config_string` → `build.version`), the exact build
  the Install step would flash. The fix was therefore to LOCK that derivation
  with a contract test rather than re-author a number. Bathroom now shows the
  served v1.0.7 and Bedroom the served v1.0.8.
- **Canonical names:** the two visible kits were aligned to the canonical
  consumer bundle names ("Sense360 Bathroom Bundle — PoE", "Sense360 Bedroom
  Bundle — PoE"), vendored for the offline drift-guard in
  `__tests__/fixtures/room-bundle-skus.json` (a mirror of
  `config/room-bundle-skus.json` in esphome-public). N3 aligns the upstream
  guide titles to the same names.
- **Drift guard:** `__tests__/kit-served-consistency.test.js` asserts, for every
  visible kit, that its `firmware_channel` and its served manifest version equal
  the reviewed served surface (`__tests__/fixtures/expected-surface.json`), that
  it maps to a release-ready catalog config (never hardware-pending /
  compile-only / blocked), that its `display_name` matches the canonical bundle
  name, and that `kits.json` never carries its own copy of a firmware version.

Visible kit set is unchanged: Bathroom (recommended, stable) and Bedroom
(stable). No hardware-pending config was promoted or surfaced.

### N2 disposition (planned)

N1 already produced the correct visible set (release-ready production configs
only, badges channel-accurate, no hardware-pending config visible), and the new
drift-guard pins it. N2 was expected to be a no-op confirmation; the section
below records the finding from the session that ran it.

## Verification (N1)

- `npm test` — 73 suites / 1218 tests passed.
- `python3 scripts/gen-manifests.py --strict-validate --dry-run --mode development`
  — clean, 5 build entries, manifest unchanged (display-only change).
- `npm run validate:naming-policy` — passed.
- `npm run check:headers -- https://sense360store.github.io/WebFlash/` — 0 fail
  (the 7 warnings are the standing GitHub Pages inherent-limitation baseline).

## N2 — EXECUTED (no-op confirmation, no kit added)

Audited the visible kit set against the served firmware surface and the vendored
product catalog. The two currently-visible kits are safe, correct, and
channel-accurate; the SAFETY RULE holds. No kit was added, promoted, or
re-badged. The visible set is unchanged from N1.

### Served release-ready surface vs. kit coverage (verified 2026-07-08)

| config_string | version | channel | catalog status | offered as kit? |
|---|---|---|---|---|
| `Ceiling-POE-VentIQ-RoomIQ` | 1.0.7 | stable | production | yes — Bathroom (recommended) |
| `Ceiling-POE-RoomIQ` | 1.0.8 | stable | production | yes — Bedroom |
| `Ceiling-POE-AirIQ-RoomIQ` | 1.0.9 | stable | production | no |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | 1.0.1 | preview | preview | no |

Both offered kits map to `production` / stable served builds, their
`firmware_channel` and displayed (manifest-derived) version equal the reviewed
served surface, and their `display_name` matches the canonical consumer bundle
name. No hardware-pending, compile-only, or blocked config is surfaced. The
SAFETY-RULE ceiling ("kit visibility = release-ready only, no hardware-pending")
is satisfied and is pinned by `__tests__/kit-served-consistency.test.js` from N1.

### The two un-surfaced release-ready configs — deferred, not added

Two served configs are release-ready but are not offered as kits:

- `Ceiling-POE-AirIQ-RoomIQ` — production, stable v1.0.9 (the air-quality
  "Kitchen"-class bundle).
- `Ceiling-POE-VentIQ-RoomIQ-LED` — preview v1.0.1 (would require the
  preview-channel acknowledgement at install).

N2's spec makes adding these conditional on their being "genuinely intended as a
consumer kit." That intent is a product-owner decision and is not derivable from
the codebase. Two further blockers keep this out of N2's safe scope:

1. **Canonical name sourcing.** A kit's `display_name` must equal the canonical
   consumer bundle name owned by `config/room-bundle-skus.json` in
   `sense360store/esphome-public` (kit names are not re-authored). Only Bathroom
   and Bedroom are vendored in `__tests__/fixtures/room-bundle-skus.json`; the
   canonical names for the AirIQ ("Kitchen") and LED-preview bundles are not
   present, so a kit could not be added here without inventing a name.
2. **No standing intent signal — and the trend is reductive.** Recent surface
   work has been de-listing, not adding: CI-PIPELINE-CLARITY-001 P4b de-listed
   `Ceiling-POE-RoomIQ-LED` for picker parity, and WF-H1-REIMPORT-CLEAN-001 W1
   retired the fan / LED preview kit cards. Nothing indicates AirIQ-RoomIQ or
   VentIQ-RoomIQ-LED is presently intended as a consumer kit.

Because both un-surfaced configs are release-ready (production and badged-preview
respectively), adding either later stays inside the SAFETY RULE — this is
explicitly *not* a hardware-pending promotion. It is deferred pending an owner
product decision plus the upstream canonical name. If the owner confirms intent,
a follow-up PR would add the kit sourced from `config/room-bundle-skus.json` with
a channel-accurate badge (stable for AirIQ, preview-gated for the LED build).

### Verification (N2)

- `npm test` — full suite green (see PR body for the run).
- Change is documentation only (this tracker). No `kits.json`, `firmware/`,
  `firmware/sources.json`, manifest, binary, release-channel, or install-gate
  change. Visible kit set unchanged.
