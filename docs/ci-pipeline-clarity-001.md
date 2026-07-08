# CI-PIPELINE-CLARITY-001 — WebFlash tracking

Pipeline-clarity + product-state-correction programme. Six steps across both
repos (esphome-public + WebFlash), mostly CI/docs, with two product-state
changes held for owner sign-off. One session, one step, one held PR, lowest
non-EXECUTED step first. Full audit context lives in the esphome-public
`ci-pipeline-audit.md`; this file is the WebFlash-side tracker.

## Owner decisions (folded in 2026-07-08)

- **FanTRIAC is ready to release** — wire it in fully (P3, esphome-public).
- **RoomIQ-LED (`Ceiling-POE-RoomIQ-LED`) was never built or served** — 404
  upstream, not in the served set, not previously de-listed. It is de-listed
  from release config, not rebuilt (P4).

## WebFlash-owned steps

- **P4b — RoomIQ-LED picker parity.** Remove `Ceiling-POE-RoomIQ-LED` from the
  `add-firmware-source.yml` dropdown to match esphome-public P4a. Update any
  WebFlash test or fixture that references it as release-eligible.

The other steps (P1, P2, P3, P4a, P5, P6) are esphome-public-owned and tracked
in that repo's `docs/ci-pipeline-clarity-001.md`. P5 also links this pipeline
README into the WebFlash README/CONTRIBUTING (docs-only, esphome-public-driven).

## Ground truth verified for P4b (WebFlash, 2026-07-08)

`Ceiling-POE-RoomIQ-LED` before this change:

- NOT in `manifest.json`, NOT in `firmware/sources.json`, NO `.bin` on disk
  (only the distinct `Ceiling-POE-VentIQ-RoomIQ-LED` preview exists).
- Already in the `retired` register of
  `__tests__/fixtures/expected-surface.json` (retired in #553 — the upstream
  v1.0.0-preview asset left the regenerated `checksums-sha256.txt`).
- Still advertised as release-eligible in two WebFlash surfaces: the
  `add-firmware-source.yml` picker, and the vendored upstream-catalog fixture
  `__tests__/fixtures/esphome-product-catalog.json` (`status: preview`,
  `webflash_build_matrix: true`, notes claiming a completed import).

## Execution log

| Step | Status | PR | Notes |
|---|---|---|---|
| P4b | EXECUTED | #589 (held for owner) | Removed `Ceiling-POE-RoomIQ-LED` from the `add-firmware-source.yml` `config_string` dropdown. De-listed it in the vendored catalog fixture (`status: preview` → `hardware-pending`, `webflash_build_matrix` → `false`, notes/`stable_blocker`/`hardware_status` rewritten to record the not-built/404 state and preserve the catalog entry for a proper future build). Updated `__tests__/product-import-readiness.test.js`: the config is now asserted NOT import / manifest / kit / REQUIRED_CONFIGS eligible, and the hardcoded import-eligible summary count dropped 13 → 12. No firmware, `manifest.json`, `firmware/sources.json`, `REQUIRED_CONFIGS`, `kits.json`, or install-gate logic changed. |

Lowest non-EXECUTED WebFlash step after this session: none (P4b is WebFlash's
only step). Remaining programme work is esphome-public-owned.

## What stays gated (unchanged by P4b)

- Real Ed25519 + SHA-256 install-gate verification, provenance, channel
  acknowledgement, manifest freshness, service-worker update.
- Preview builds never auto-selected; TRIAC selection stays behind the
  advanced/manual-warning acknowledgement; FanTRIAC stays import-blocked in
  WebFlash. REQUIRED_CONFIGS stays production-only (`Ceiling-POE-VentIQ-RoomIQ`,
  `Rescue`).
- The served surface is unchanged: de-listing RoomIQ-LED removes an
  advertised-but-artifactless option; it does not add, remove, or alter any
  real build.
