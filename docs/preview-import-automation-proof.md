# Preview-eligible import automation + FanDAC import proof (WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001)

This is the WebFlash-side record for **two** linked deliverables:

1. A guarded **automation path** for importing every upstream preview /
   manual-preview firmware artifact that upstream has explicitly marked
   WebFlash-import eligible — [`scripts/import-preview-eligible-sources.py`](../scripts/import-preview-eligible-sources.py).
   It replaces the one-off, per-family import runs
   (WF-PREVIEW-IMPORT-FIRST-BATCH-001, WEBFLASH-RELAY-001, WEBFLASH-PWM-001)
   with one discoverable, idempotent, heavily-guarded pass.
2. The **FanDAC manual-preview import** (`Ceiling-POE-FanDAC`) performed *by*
   that automation — the last currently-eligible fan-driver preview.

It complements:

- [`docs/firmware-import.md`](firmware-import.md) — the single-source importer
  mechanism the automation delegates to.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — per-family import classes.
- [`docs/product-import-readiness.md`](product-import-readiness.md) — catalog
  eligibility classifier.
- [`docs/fanrelay-preview-import-proof.md`](fanrelay-preview-import-proof.md) /
  [`docs/fanpwm-preview-import-proof.md`](fanpwm-preview-import-proof.md) — the
  two earlier fan-driver imports this automation generalises.
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.

## Why automate

Three preview imports had each been done by hand
(WF-PREVIEW-IMPORT-FIRST-BATCH-001 for the room previews, WEBFLASH-RELAY-001 for
FanRelay, WEBFLASH-PWM-001 for FanPWM). Each repeated the same shape: declare a
pinned `firmware/sources.json` source, run the importer, regenerate the manifest,
flip a module-availability pill, rebaseline the same build-count / source-list /
forbidden-token test guards. The automation captures that shape once, behind a
single set of guardrails, so the *next* eligible preview is a one-command,
fully-guarded operation instead of a hand-assembled checklist.

The automation is **not** an authority to import anything new on its own. The
pinned `expected_sha256` in `firmware/sources.json` remains the human-committed
trust anchor; the automation only discovers, cross-checks, guards, and batches
imports the operator has already declared.

## The automation: `scripts/import-preview-eligible-sources.py`

A thin, testable wrapper over
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py). It:

1. **Discovers** every upstream product-catalog entry carrying the explicit
   `webflash_import_eligibility.eligible: true` signal (upstream #711 /
   `RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`). Today that set is exactly
   **FanRelay / FanPWM / FanDAC**. A bare `status: preview` (the room previews,
   the LED preview) is **not** in scope — those were imported by the plain
   importer and are not re-managed here.
2. **Cross-checks** each discovered entry against the committed
   `firmware/sources.json` declaration (pinned SHA) and the on-disk
   `firmware/configurations/` state.
3. **Plans** one action per entry: `import` / `idempotent` / `skip` / `refuse`.
4. **Applies** the plan (`--apply`) by delegating each `import` to the existing
   `import_source_entry` machinery — so every checksum / pin / block-token /
   release-body / size gate the single-source importer enforces still runs
   unchanged. The actual `.bin` is downloaded over the network and verified for
   real.

### Guardrails (each enforced for every discovered target)

| Guardrail | Behaviour |
|---|---|
| Eligibility | only `webflash_import_eligibility.eligible == true` entries are discovered; `false` / absent is never imported |
| Channel | must be `channel: preview` or `delivery_lane: manual-preview`; stable / full-release is **refused** |
| Pinned SHA256 | the matching `firmware/sources.json` entry must carry a well-formed `expected_sha256`; a missing pin is a **hard refusal** |
| Upstream checksum match | delegated to `import_source_entry` (download verified against the release `checksums-sha256.txt` **and** the pin) |
| Release asset exists | delegated to `import_source_entry` |
| `.meta.json` provenance | delegated to `import_source_entry` (always written) |
| No stable import | refused (see Channel) |
| No `REQUIRED_CONFIGS` change | the wrapper never writes the workflow, and additionally re-reads `REQUIRED_CONFIGS` before/after and asserts it is unchanged; refuses any `status: production` target |
| TRIAC stays out | any `FanTRIAC`-token target is **refused** unless `--allow-triac` **and** an explicit `triac_preview_import_allowed: true` catalog opt-in (none exists) |
| No overwrite with different bytes | an on-disk `.bin` is only `idempotent` when its SHA matches the pin; a differing on-disk file is a **hard refusal** (never overwritten) |
| Simple install unchanged | only preview-channel builds are imported; the stable Bathroom PoE default path is untouched |

### Usage

```bash
# Plan only (default; safe; no .bin downloads).
python3 scripts/import-preview-eligible-sources.py --dry-run

# Apply (download + verify + stage every importable target).
python3 scripts/import-preview-eligible-sources.py --apply

# Hermetic / network-restricted apply (api.github.com 403 anonymous):
python3 scripts/import-preview-eligible-sources.py --apply \
    --release-payload-dir /tmp/wf-payloads

# JSON report (for CI / tests).
python3 scripts/import-preview-eligible-sources.py --format json
```

After a successful apply, regenerate the manifest exactly as the one-off flow
does (`scripts/gen-manifests.py`). The automation is import-only; it does not
sign, regenerate the manifest, or touch any wizard / workflow surface.

## Upstream source (FanDAC)

| Field | Value |
|---|---|
| Source repo | `sense360store/esphome-public` |
| Release tag | `v1.0.0-preview` (prerelease) |
| Release URL | https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview |
| Source git sha | `0963afb9c9582f5021019d1635421e41c9dd10f6` |
| ESPHome version | `2026.4.5` |
| Hosted compile-proof run | [`26821900127`](https://github.com/sense360store/esphome-public/actions/runs/26821900127) (Preview Compile Dry-Run) |
| Eligibility decision | `RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001` (upstream PR #711) |

FanDAC rides the same two-concept eligibility model as FanRelay / FanPWM: the
`product-catalog.json` lifecycle status stays `hardware-pending` and
`webflash_build_matrix` stays `false`, while
`webflash_import_eligibility.eligible=true` (in
`config/preview-release-targets.json`) authorises an Advanced-install-only,
acknowledgement-gated preview import. Stable / full release stays blocked on
Cloudlift S12 / J3 harness + product-bench evidence and the S360-312 schematic /
BOM. The upstream release body carries all four required `##` sections.

## What was imported (one build, by the automation)

`manifest.json` grew from **8 to 9 builds**:

| `config_string` | Asset | SHA256 | Size (bytes) | MD5 | `block_tokens` |
|---|---|---|---|---|---|
| `Ceiling-POE-FanDAC` | `Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin` | `151894c1408c5ae9d45f56382e392a82539a87d2882f443fa9bc78cdb6a39b9f` | 930,400 | `024d35c408c9ac04d125e2d5bd1f5d78` | `["FanTRIAC", "LED"]` |

The source `block_tokens` are `["FanTRIAC", "LED"]` because the FanDAC config
carries neither token; blocking both keeps FanTRIAC and LED out of this source.

## What was NOT imported (and why)

- **FanTRIAC** (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`) — upstream
  `eligible: false` (build-blocked under HW-005); never discovered, and the
  automation's TRIAC guard refuses it even if a future fixture flipped the flag.
- **No new room / LED preview** — those are `status: preview` (no explicit flag)
  and are out of the automation's discovery scope; already imported and unchanged.
- **No stable / production import.** The automation refuses stable channels.

## Verification performed

All verification ran through the standard importer
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py) via
the automation wrapper; no verification step was weakened or skipped. As with the
FanRelay / FanPWM imports, `api.github.com` was network-restricted (HTTP 403
anonymous), so a `--release-payload-dir` payload supplied the release metadata
(from the authoritative GitHub release record) while the **binary was downloaded
over the network from `github.com/.../releases/download/...` and verified for
real**. The build passed every gate:

1. Required assets present (`.bin` + `checksums-sha256.txt` + `checksums-md5.txt`
   + `manifest.json`).
2. Release-body sections present (the four canonical `##` sections).
3. SHA256 vs upstream `checksums-sha256.txt` — match.
4. SHA256 vs the source entry's pinned `expected_sha256` — match (defence in depth).
5. Filename == declared `asset_name`; size ≥ `min_size_bytes` (102,400).
6. Parsed `config_string` == declared `config_string`.
7. `block_tokens` absent from filename / module list / `config_string`.

### Exact commands and results

```bash
# 1. Dry-run plan (discovers FanRelay/FanPWM/FanDAC; FanRelay/FanPWM idempotent,
#    FanDAC to import):
python3 scripts/import-preview-eligible-sources.py --dry-run
#   discovered (eligible) : 3
#   to import             : 1   (Ceiling-POE-FanDAC)
#   idempotent (on disk)  : 2   (FanRelay, FanPWM)
#   refused               : 0
#   REQUIRED_CONFIGS unchanged : True
#   Overall: OK

# 2. Apply (FanDAC downloaded from github.com + verified + staged):
python3 scripts/import-preview-eligible-sources.py --apply \
    --release-payload-dir /tmp/wf-payloads
#   → wrote firmware/configurations/Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin
#   → wrote firmware/configurations/Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.meta.json
#   imported : 1 ; import failures : 0 ; Overall: OK

# 3. Manifest regeneration (development mode = committed dev signing key):
python3 scripts/gen-manifests.py --firmware-dir firmware \
    --manifest-path manifest.json --manifest-prefix firmware- \
    --mode development --summary
#   → Generated manifest.json and 9 ESP Web Tools manifest file(s) with 9 build entries.

# 4. Validators:
node scripts/validate-naming-policy.js firmware/configurations   # ✅ passed
node scripts/validate-product-import-readiness.js                # exit 0, no cross-surface findings
#   entries: 10 ; import-eligible: 8 ; manifest-eligible: 8 ;
#   REQUIRED_CONFIGS-eligible: 1 ; kit-eligible: 8 ; Overall: ✅ PASS

# 5. Tests:
NODE_OPTIONS=--experimental-vm-modules npx jest                  # 78 suites / 1452 tests green
python3 -m unittest discover -s __tests__/python                 # 87 tests green
```

On-disk SHA256 + size were re-confirmed to match the upstream values
(`151894c1…a39b9f` / 930,400 bytes).

## Manifest result

`gen-manifests.py` produced nine builds in deterministic order:

| `firmware-N.json` | `config_string` | Channel |
|---|---|---|
| `firmware-0.json` | `Ceiling-POE-AirIQ-RoomIQ` | preview |
| `firmware-1.json` | `Ceiling-POE-FanDAC` | **preview (FanDAC)** |
| `firmware-2.json` | `Ceiling-POE-FanPWM` | preview (FanPWM) |
| `firmware-3.json` | `Ceiling-POE-RoomIQ` | preview |
| `firmware-4.json` | `Ceiling-POE-RoomIQ-LED` | preview |
| `firmware-5.json` | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview (FanRelay) |
| `firmware-6.json` | `Ceiling-POE-VentIQ-RoomIQ` | stable (Release-One) |
| `firmware-7.json` | `Ceiling-POE-VentIQ-RoomIQ-LED` | preview (VentIQ LED preview) |
| `firmware-8.json` | `Rescue` | rescue |

The per-build manifest **indices are not stable** across regenerations (the
runtime resolves builds via `manifest.json` + `config_string`). Every
pre-existing build's content — `sha256` / `md5` / `signature` /
`signature_ed25519` / `file_size` / `channel` / `version` — is byte-identical to
before; only the generator-refreshed `source_commit` / `source_url` /
`build_date` provenance fields differ.

## Exposure / runtime

- **Module availability:** `Sense360 DAC` (S360-312) moves from `no-firmware` to
  `available-preview` in
  [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js)
  with a bespoke installer/developer-preview warning detail (0 to 10V analog fan
  control, for example Cloudlift S12). The card stays selectable in the Advanced
  (custom) path; install gates on the existing `channel:preview` acknowledgement.
  The declarative `availability` field in
  [`scripts/data/module-requirements.js`](../scripts/data/module-requirements.js)
  is kept consistent. The FanDAC ↔ AirIQ DAC-bus mutex is unchanged.
- **Install gate unchanged:** the FanDAC build is a `preview`-channel build, so it
  is never auto-selected (`preview.defaultSelectable: false`) and requires the
  `channel:preview` acknowledgement (`scripts/utils/release-channels.js`). The
  default **Simple install** path still resolves only to the stable Bathroom PoE
  build `Ceiling-POE-VentIQ-RoomIQ`.

## Posture — preview / manual-preview only

This build is **firmware-build proof only**: preview / manual-preview firmware;
analog fan control is an installer / developer preview; **not** stable, **not**
recommended, **not** a customer default, **not** a kit / `REQUIRED_CONFIGS`
entry, **not** buyable as a public shop product; **no** hardware, bench,
compliance, safety, or commercial-availability proof is claimed. Normal customers
should use the stable Bathroom PoE build `Ceiling-POE-VentIQ-RoomIQ`.

## Do-not-change list (this PR)

Unchanged by WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001:

- `REQUIRED_CONFIGS` stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
  (production-only) in `.github/workflows/firmware-publish.yml`.
- `scripts/data/kits.json` stays Release-One-only; `scripts/data/kit-presets.js`
  is unchanged (no FanDAC card).
- Release-One stable, the first preview batch, the VentIQ LED preview, the
  FanRelay preview, the FanPWM preview, and Rescue build **content** (signatures
  / hashes / sizes / channel / version) — only generator-refreshed
  `source_commit` / `source_url` / `build_date` provenance fields changed.
- `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the
  install gate / preflight / freshness engines, `scripts/simple-install.js`,
  `scripts/import-firmware-sources.py` (reused unchanged), `sw.js`, `_headers`,
  `index.html`, every CSS file, every `.github/workflows/*` file.
- The FanTRIAC import block (importer `block_tokens` enforcement + manifest-health
  guard + the automation's TRIAC guard), the WF-LED-003 preview-channel
  acknowledgement model, and the WF-TRIAC-001 advanced/manual-warning gate.
- **No FanTRIAC firmware imported. No LED-stable claim. No hardware / bench /
  compliance / safety / commercial-availability proof claimed.**
