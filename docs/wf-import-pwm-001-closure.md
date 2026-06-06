# WF-IMPORT-PWM-001 closure note: FanPWM hosted as an acknowledgement-gated preview

**Status: CLOSED (record-only). No artifact change.**

This is a record-only closure note. It documents that the WF-IMPORT-PWM-001
objective, exercising the full SELV preview publish-and-host path on the FanPWM
bundle end to end as the rehearsal for the future TRIAC path, is already
satisfied: the FanPWM SELV room bundle `Ceiling-POE-VentIQ-FanPWM-RoomIQ` was
published upstream as a real preview artifact and is hosted in WebFlash as an
acknowledgement-gated preview, imported and merged to `main`, with the test
suite green.

This note imports no firmware, regenerates no manifest, re-signs nothing, and
overwrites no `.bin`. It reuses the already-published artifact and does not touch
the pinned `expected_sha256`. It is the closure record for an objective that
landed through the bulk fan-bundle import rather than a standalone PWM import PR.

## Why this is a closure note and not a fresh publish

Re-running the publish-and-host path now would be redundant and actively harmful:

- A fresh ESPHome compile is not bit-for-bit reproducible, so re-publishing would
  change the artifact SHA256 and either overwrite the already-published
  `v1.0.0-preview` release asset or break the `expected_sha256` already pinned in
  the merged WebFlash source entry.
- Re-importing would overwrite the published `.bin` in `firmware/configurations/`,
  which the project forbids (firmware binaries are served with a one-year
  immutable cache; versioned filenames are never overwritten in place).

The honest action is therefore to record the closure against the existing real
artifact, not to manufacture a duplicate one. No CI id is fabricated; every
identifier below is the real recorded value.

## Naming reconciliation

The identifier `WF-IMPORT-PWM-001` is used for two related FanPWM slices in this
repository. Both are hosted today as acknowledgement-gated previews:

| Slice | `config_string` | Composition | Landed by |
|---|---|---|---|
| FanPWM **SELV room bundle** (this note's objective, the publish-and-host rehearsal) | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | Bathroom bundle (VentIQ + RoomIQ) plus the S360-311 PWM fan driver | `WF-IMPORT-FAN-BUNDLES-001` (PR **#498**, merged); surfaced as a kit card by `WF2-FAN-EXPANSION-001` (PR #500) |
| FanPWM **standalone** driver-only sibling | `Ceiling-POE-FanPWM` | S360-311 PWM fan driver only | `WEBFLASH-PWM-001` (a.k.a. the `WF-IMPORT-PWM-001` row in [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)) |

The readiness-matrix "Follow-up PR sequence" rows for the fan family predate
these landings and still read as future-tense reservations. This note is the
authoritative closure for the room-bundle FanPWM objective; the standalone
sibling is recorded under `WEBFLASH-PWM-001` in
[`docs/sense360-webflash-status.md`](sense360-webflash-status.md) and
[`docs/fanpwm-preview-import-proof.md`](fanpwm-preview-import-proof.md).

## Upstream publish evidence (real, not fabricated)

The FanPWM SELV room-bundle artifact is a real, CI-built, hosted asset on the
shared preview release. The publish ran through the existing room-bundle fan
publish workflow ([`.github/workflows/room-bundle-fan-publish.yml`](https://github.com/sense360store/esphome-public/blob/main/.github/workflows/room-bundle-fan-publish.yml)
in `sense360store/esphome-public`), the sibling of the single-driver
manual-preview fan publish lane.

| Field | Value |
|---|---|
| Source repo | `sense360store/esphome-public` |
| Release tag | `v1.0.0-preview` (prerelease) |
| Release id | `333373906` |
| Release URL | https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview |
| Asset | `Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` |
| Asset SHA256 | `6d988708558881d653ffbc7429ef8779a574878ac0ee26d745bf645be85befba` |
| Asset size | 1,010,192 bytes |
| Asset uploaded | `2026-06-04T11:04:20Z` by `github-actions[bot]` |
| Source git sha | `ad1d9575e17a1da450f31964401bb485a6b130c7` |
| ESPHome version | `2026.4.5` |
| Hosted compile-proof run | `26913592989` (Compile-only Firmware Validation; `ROOM-BUNDLE-FAN-COMPILE-RESULTS-001`) |
| Publish run | `26947595936` (Room-Bundle Fan Firmware Publish) |
| Eligibility decision | `ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001` (`webflash_import_eligibility.eligible=true`) |

The upstream release body carries all four canonical sections (Changelog, Known
Issues, Features, Hardware Requirements) and states explicitly that the
room-bundle fan artifacts are firmware-build / release proof only: not stable,
not recommended, not a customer default, not hardware verified, not buyable.

## WebFlash host evidence (real, merged to main)

The same artifact is hosted in WebFlash. The on-disk binary SHA256 matches the
upstream asset exactly.

- On disk: `firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin`
  plus its `.meta.json` sidecar. Local SHA256
  `6d988708558881d653ffbc7429ef8779a574878ac0ee26d745bf645be85befba` (matches
  upstream).
- `firmware/sources.json`: one preview source entry for
  `Ceiling-POE-VentIQ-FanPWM-RoomIQ` with `channel: preview`, a pinned
  `expected_sha256`, and `block_tokens: ["FanTRIAC", "LED"]` (the FanPWM config
  carries neither token; the block keeps FanTRIAC and LED out of the source).
- `manifest.json`: a build for `Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `channel:
  preview`, `version: 1.0.0`, with its generated `firmware-N.json` per-build
  manifest. The per-build index is not stable across regenerations; the runtime
  resolves builds via `manifest.json` plus `config_string`.
- Kit surface: `scripts/data/kits.json` carries `S360-KIT-BATH-P-PWM` mapping to
  `Ceiling-POE-VentIQ-FanPWM-RoomIQ` as a preview kit card (added by
  `WF2-FAN-EXPANSION-001`, PR #500).

The full import-proof for the five-bundle batch that includes this artifact is
[`docs/fan-bundle-preview-import-proof.md`](fan-bundle-preview-import-proof.md).

## Posture — SELV preview only

The S360-311 FanPWM driver is a SELV (5 to 12V) low-voltage DC fan control board.
This build is an installer / developer preview, firmware-build / release proof
only:

- **not** stable,
- **not** a customer default,
- **not** recommended,
- **not** auto-selected (`preview.defaultSelectable: false`),
- **not** in `REQUIRED_CONFIGS` (the allowlist stays
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only),
- **not** in the easy / Simple-install default path (the default Simple selection
  stays the stable Bathroom PoE build `Ceiling-POE-VentIQ-RoomIQ`),
- **not** buyable as a public shop product,

with **no** mains, bench, thermal, compliance, safety, or
commercial-availability fact asserted. No measured current or thermal evidence is
claimed; RPM / TachIO is not claimed. Normal customers should use the stable
Bathroom PoE build `Ceiling-POE-VentIQ-RoomIQ`.

Install stays gated. The build resolves only behind the `channel:preview`
acknowledgement (`scripts/utils/release-channels.js`, owned by the engine) plus
the fan-control acknowledgement that applies to every FanRelay / FanPWM / FanDAC
config. The engine verdict dominates; the acknowledgements can only make install
stricter, never arm it.

## FanTRIAC stays excluded

FanTRIAC is untouched by this note. It remains build-blocked and import-blocked:
the upstream room-bundle publish excludes `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`,
the WebFlash importer refuses any FanTRIAC-bearing asset, the manifest-health
guard fails CI if a `FanTRIAC` token reappears in a generated `config_string`,
and every FanPWM source entry keeps `FanTRIAC` in `block_tokens`. The upstream
TRIAC publish gate and its fail-closed tests are not touched by this note.

## Verification (no change made; current state confirmed green)

No firmware, manifest, source, eligibility, signing, or runtime surface was
changed by this note, so the existing pins continue to hold. The current state
was re-confirmed green at authoring time:

```
# WebFlash (the FanPWM preview / ack-gated / catalog / on-disk pins):
NODE_OPTIONS=--experimental-vm-modules npx jest \
  wf2-fan-expansion firmware-configurations-on-disk product-catalog-alignment kits-json
#   Test Suites: 4 passed, 4 total ; Tests: 114 passed, 114 total

# esphome-public (the TRIAC fail-closed publish-gate tests stay green and untouched):
python3 -m pytest tests/test_preview_fan_triac_build_rows.py \
  tests/test_room_bundle_fan_publish_results.py \
  tests/test_package_triac_001_operator_bench_proof.py -q
#   89 passed, 269 subtests passed
```

`__tests__/wf2-fan-expansion.test.js` already pins the closure invariant: the
`S360-KIT-BATH-P-PWM` kit resolves via the engine to
`Ceiling-POE-VentIQ-FanPWM-RoomIQ` as a `channel: preview`, installable build
that requires the fan-control acknowledgement, with the engine verdict dominating
so the build is never easy-mode or default-selectable.

## Do-not-change list (this note)

Unchanged by this closure note (docs-only):

- Every firmware binary, including
  `Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` and its
  `.meta.json` (no re-import, no re-sign, no overwrite, no `expected_sha256`
  change).
- `manifest.json`, every `firmware-*.json`, `firmware/sources.json`.
- `REQUIRED_CONFIGS = ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` (production-only).
- `scripts/data/kits.json`, `scripts/data/simple-bundles.js`,
  `scripts/install.js`, `scripts/state.js`, `scripts/engine.js`,
  `scripts/utils/release-channels.js`, and every other runtime / engine file.
- The install gate, preflight, provenance, freshness, and signing surfaces.
- `sw.js`, `_headers`, `index.html`, every CSS file, every `.github/workflows/*`
  file.
- FanDAC, FanRelay, and every TRIAC file, gate, and test. The upstream TRIAC
  publish gate and its fail-closed tests stay green and untouched.
- The FanTRIAC import block, the preview-channel acknowledgement model, and the
  fan-control acknowledgement.

No firmware imported. No preview made stable, default, recommended, or buyable.
No hardware, bench, mains, compliance, safety, or commercial-availability proof
claimed.
