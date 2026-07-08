# PRODUCT-KITS-CONSISTENCY-001 — WebFlash tracking

Programme: kit naming and display consistency (display / metadata layer only).
Repo scope for this file: `sense360store/WebFlash`.

## Step ledger (lowest non-EXECUTED step is the next session's work)

| Step | Title | Status |
|---|---|---|
| N1 | Fix kit display bugs + single-source derivation | EXECUTED — PR #590 (held for owner) |
| N2 | Kit visibility audit (only if N1 left it open) | PENDING |

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

### N2 disposition

N1 already produced the correct visible set (release-ready production configs
only, badges channel-accurate, no hardware-pending config visible), and the new
drift-guard pins it. N2 is expected to be a no-op confirmation; it stays PENDING
here until a session runs it and records the finding.

## Verification (N1)

- `npm test` — 73 suites / 1218 tests passed.
- `python3 scripts/gen-manifests.py --strict-validate --dry-run --mode development`
  — clean, 5 build entries, manifest unchanged (display-only change).
- `npm run validate:naming-policy` — passed.
- `npm run check:headers -- https://sense360store.github.io/WebFlash/` — 0 fail
  (the 7 warnings are the standing GitHub Pages inherent-limitation baseline).
