# Full-composition fan-bundle preview import proof (WF-IMPORT-FAN-BUNDLES-001)

This is the WebFlash-side import-proof record for the **five full-composition
Bathroom / Kitchen fan-control room-bundle preview firmware** builds pulled from
the upstream `sense360store/esphome-public` release
[`v1.0.0-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview)
(release id `333373906`).

It records exactly what was imported, the verification that ran, the build
provenance, the upstream eligibility decision that authorised the import, and the
deliberate Advanced-install-only preview posture. It is the direct sibling of the
single-driver fan imports (WEBFLASH-RELAY-001, WEBFLASH-PWM-001,
WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001) and complements:

- [`docs/firmware-import.md`](firmware-import.md) — the importer mechanism.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md)
  — per-family import classes.
- [`docs/product-import-readiness.md`](product-import-readiness.md) — catalog
  eligibility classifier.
- [`docs/fanrelay-preview-import-proof.md`](fanrelay-preview-import-proof.md) /
  [`docs/fanpwm-preview-import-proof.md`](fanpwm-preview-import-proof.md) /
  [`docs/preview-import-automation-proof.md`](preview-import-automation-proof.md)
  — the three single-driver fan imports this batch extends to full-composition
  room bundles.
- [`docs/sense360-webflash-status.md`](sense360-webflash-status.md) — the
  canonical live status doc.

## Upstream eligibility decision (the unblock)

None of these five configs is WebFlash-importable on lifecycle status alone:
each upstream `config/product-catalog.json` status is `hardware-pending` and
`webflash_build_matrix` is `false`, both of which the WebFlash catalog-alignment
guard rejects on their own.

The import is authorised by the same structured per-target signal that unblocked
FanRelay / FanPWM / FanDAC, extended to the full-composition room bundles.
Upstream `ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001` (the sibling of
`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`, recorded in
`config/room-bundle-fan-variants.json`) sets, on each of the five catalog
entries:

```json
"webflash_import_eligibility": {
  "eligible": true,
  "exposure_class": "acknowledgement-gated",
  "channel": "preview",
  "source_of_truth": "config/room-bundle-fan-variants.json",
  "upstream_decision": "ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001",
  "source_release_tag": "v1.0.0-preview"
}
```

Upstream's two-concept model (unchanged from the single-driver imports):

- **`webflash_import_eligibility.eligible`** = "WebFlash *may* import this as a
  preview" → **`true`** for all five room-bundle fan configs.
- **`webflash_build_matrix` / committed `config/webflash-builds.json` row** = "a
  committed one-click upstream build row" → **stays `false`** (no fan row added;
  the fan-token guardrail stands).

So `webflash_build_matrix: false` does not mean "preview import forbidden"; it
means "no committed upstream WebFlash build row". The downstream committed import
is exactly this WebFlash-side slice. Catalog `status` stays `hardware-pending`
(stable / full release stays blocked on hardware / bench / mains-safety /
compliance evidence). **FanTRIAC stays `eligible: false`** (build-blocked under
HW-005) and is **excluded**.

WebFlash honours `webflash_import_eligibility.eligible=true` for **import /
manifest / kit** eligibility only. It is **never** honoured for
`REQUIRED_CONFIGS` (production-only), and it is **never** honoured when
`eligible !== true`. The catalog-alignment guard and the readiness validator
already recognise that flag (added by WEBFLASH-RELAY-001), so no validator change
was needed — the five fixture rows ride the existing manual-preview lane.

## Upstream source

| Field | Value |
|---|---|
| Source repo | `sense360store/esphome-public` |
| Release tag | `v1.0.0-preview` (prerelease) |
| Release id | `333373906` |
| Release URL | https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview |
| Source git sha | `ad1d9575e17a1da450f31964401bb485a6b130c7` |
| ESPHome version | `2026.4.5` |
| Hosted compile-proof run | [`26913592989`](https://github.com/sense360store/esphome-public/actions/runs/26913592989) (Compile-only Firmware Validation) |
| Publish run | [`26947595936`](https://github.com/sense360store/esphome-public/actions/runs/26947595936) (Room-Bundle Fan Firmware Publish) |
| Eligibility decision | `ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001` (`config/room-bundle-fan-variants.json`) |

The upstream release body carries all four required `##` sections (Changelog,
Known Issues, Features, Hardware Requirements) and explicitly states the room
bundle fan artifacts are firmware-build / release proof only: not stable, not
recommended, not a customer default, not hardware verified, not buyable.

## What was imported (five builds)

`manifest.json` grew from **9 to 14 builds**:

| `config_string` | Asset | SHA256 | Size (bytes) | `block_tokens` |
|---|---|---|---|---|
| `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` | `6d988708558881d653ffbc7429ef8779a574878ac0ee26d745bf645be85befba` | 1,010,192 | `["FanTRIAC", "LED"]` |
| `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-VentIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` | `a08c82f735aa058614afda71dbec2d220d23a0a4fbb4cb46088adb82a41d8ef8` | 990,112 | `["FanTRIAC", "LED"]` |
| `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanRelay-RoomIQ-v1.0.0-preview.bin` | `97e54930f26074e38326fbeaff7a222c828df38a33be509327e77a0b0f24a83f` | 1,090,656 | `["FanTRIAC", "LED"]` |
| `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanDAC-RoomIQ-v1.0.0-preview.bin` | `903a37dc2faf3e1f87016c435e6076752b8c776e7a862f8986d5b5a4b19a994b` | 1,090,400 | `["FanTRIAC", "LED"]` |
| `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | `Sense360-Ceiling-POE-AirIQ-FanPWM-RoomIQ-v1.0.0-preview.bin` | `0ca10a2f3e867ae5693e36149276b0176294b2391fa9ef02ba7059d9c853a1cc` | 1,113,872 | `["FanTRIAC", "LED"]` |

Each source `block_tokens` is `["FanTRIAC", "LED"]` because none of the five
configs carries either token; blocking both keeps FanTRIAC and LED out of these
sources.

## What was NOT imported (and why)

- **FanTRIAC** (`Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`) — upstream
  `eligible: false` (build-blocked under HW-005); excluded and import-blocked.
  The importer's `block_tokens` enforcement and the manifest-health guard both
  still reject any FanTRIAC token.
- **No standalone fan-only previews** beyond the three already imported
  (`Ceiling-POE-FanRelay`-style single-driver builds) — out of scope; only the
  five full-composition room bundles were added.
- **No change** to Release-One, the LED preview, the first preview batch, the
  three single-driver fan previews, or the Rescue build content (only
  generator-refreshed provenance fields differ).

## Verification performed

All verification ran through the standard importer
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py) via
the preview-eligible import automation
[`scripts/import-preview-eligible-sources.py`](../scripts/import-preview-eligible-sources.py);
no verification step was weakened or skipped. The importer's release-metadata
fetch normally hits `api.github.com`; in the import environment that endpoint was
network-restricted (HTTP 403 anonymous), so the `--release-payload-dir` escape
hatch supplied the release metadata (obtained from the authoritative GitHub
release record) while the **binaries were still downloaded over the network from
`github.com/.../releases/download/...` and verified for real**. Each build passed:

1. **Required assets present** — `.bin` + `checksums-sha256.txt` +
   `checksums-md5.txt` + `manifest.json`.
2. **Release-body sections present** — the four canonical `##` sections.
3. **SHA256 vs upstream `checksums-sha256.txt`** — match.
4. **SHA256 vs the source entry's pinned `expected_sha256`** — match (defence in
   depth, from `config/room-bundle-fan-variants.json` publish evidence).
5. **Filename == declared `asset_name`**, size ≥ `min_size_bytes` (102,400).
6. **Parsed `config_string` == declared `config_string`.**
7. **`block_tokens` absent** from filename / module list / `config_string`.

### Exact commands and results

```bash
# 1. Dry-run plan (discovers all eight eligible fan-driver configs; the three
#    single-driver previews are idempotent on disk, the five room bundles import):
python3 scripts/import-preview-eligible-sources.py --dry-run
#   discovered (eligible) : 8
#   to import             : 5
#   idempotent (on disk)  : 3  (FanRelay, FanPWM, FanDAC)
#   refused               : 0
#   REQUIRED_CONFIGS unchanged : True
#   Overall: OK

# 2. Apply (five .bin downloaded from github.com + verified + staged):
python3 scripts/import-preview-eligible-sources.py --apply \
    --release-payload-dir /tmp/wf-payloads
#   imported : 5 ; import failures : 0 ; REQUIRED_CONFIGS unchanged : True ; Overall: OK

# 3. Manifest regeneration (development mode = committed dev signing key):
python3 scripts/gen-manifests.py --firmware-dir firmware \
    --manifest-path manifest.json --manifest-prefix firmware- \
    --mode development --summary
#   → Generated manifest.json and 14 ESP Web Tools manifest file(s) with 14 build entries.

# 4. Validators:
node scripts/validate-naming-policy.js firmware/configurations   # ✅ passed
node scripts/validate-product-import-readiness.js                # exit 0, no cross-surface findings
#   entries: 15 ; import-eligible: 13 ; manifest-eligible: 13 ;
#   REQUIRED_CONFIGS-eligible: 1 ; kit-eligible: 13 ; Overall: ✅ PASS
python3 scripts/gen-manifests.py --strict-validate --dry-run --mode development  # exit 0

# 5. Tests:
NODE_OPTIONS=--experimental-vm-modules npx jest                  # 60 suites / 1060 tests green
python3 -m unittest discover -s __tests__/python                 # 87 tests green
```

On-disk SHA256 + size were re-confirmed to match the upstream values for all
five binaries.

## Manifest result

`gen-manifests.py` produced fourteen builds in deterministic (alphabetical)
order:

| `firmware-N.json` | `config_string` | Channel |
|---|---|---|
| `firmware-0.json` | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | **preview (new)** |
| `firmware-1.json` | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | **preview (new)** |
| `firmware-2.json` | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | **preview (new)** |
| `firmware-3.json` | `Ceiling-POE-AirIQ-RoomIQ` | preview |
| `firmware-4.json` | `Ceiling-POE-FanDAC` | preview |
| `firmware-5.json` | `Ceiling-POE-FanPWM` | preview |
| `firmware-6.json` | `Ceiling-POE-RoomIQ` | preview |
| `firmware-7.json` | `Ceiling-POE-RoomIQ-LED` | preview |
| `firmware-8.json` | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | **preview (new)** |
| `firmware-9.json` | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | **preview (new)** |
| `firmware-10.json` | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview |
| `firmware-11.json` | `Ceiling-POE-VentIQ-RoomIQ` | stable (Release-One) |
| `firmware-12.json` | `Ceiling-POE-VentIQ-RoomIQ-LED` | preview |
| `firmware-13.json` | `Rescue` | rescue |

The per-build manifest **indices are not stable** across regenerations (nothing
in the runtime hardcodes a `firmware-N.json` index — the wizard resolves builds
via `manifest.json` + `config_string`). Every pre-existing build's content —
`sha256` / `md5` / `signature` / `signature_ed25519` / `file_size` / `channel` /
`version` — is byte-identical to before; only the generator-refreshed
`source_commit` / `source_url` / `build_date` provenance fields differ.

## Exposure / runtime

- **No view / engine change.** This is an import-only PR. The five builds land in
  `manifest.json` + `firmware/sources.json` + on disk; surfacing them as kit
  cards is the follow-up `WF2-FAN-EXPANSION-001`.
- **Install gate unchanged.** Each build is a `preview`-channel build, so it is
  never auto-selected (`preview.defaultSelectable: false`) and requires the
  `channel:preview` acknowledgement (`scripts/utils/release-channels.js`). The
  fan-control acknowledgement and (for the two FanDAC bundles) the FanDAC analog
  address-switch acknowledgement landed in `WF2-FAN-CONTROL-GATES-001` stay
  authoritative.
- **AirIQ + FanDAC stays out of the one-click grammar.** The
  `fandac_conflicts_with_airiq` mutex (`scripts/data.js`
  `airiq.conflicts=['dac']`, enforced by `scripts/identify.js` hard-disabling the
  conflicting option) is unchanged — a user can never select AirIQ + FanDAC in
  the wizard. The `Ceiling-POE-AirIQ-FanDAC-RoomIQ` / `Ceiling-POE-VentIQ-FanDAC-RoomIQ`
  builds exist as advanced / manual address-overridden previews behind the
  documented S360-312 IC2 `0x5A` DIP-switch requirement (IC1 `0x58`; `0x59` is
  forbidden, it collides with the air-quality SGP41). `FANDAC-I2C-ADDR-001`
  bench verification stays **pending**; no FanDAC address is claimed physically
  verified.

## Posture — preview / manual-preview only

These five builds are **firmware-build / release proof only**:

- preview / manual-preview firmware,
- full-composition room-bundle fan control is an installer / developer preview,
- **not** stable,
- **not** recommended,
- **not** a customer default,
- **not** a kit / `REQUIRED_CONFIGS` entry,
- **not** buyable as a public shop product,
- with **no** hardware, bench, mains-safety, compliance, safety, or
  commercial-availability proof claimed.

Normal customers should use the stable Bathroom PoE build
`Ceiling-POE-VentIQ-RoomIQ`.

## Do-not-change list (this PR)

Unchanged by WF-IMPORT-FAN-BUNDLES-001:

- `REQUIRED_CONFIGS` stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`
  (production-only) in `.github/workflows/firmware-publish.yml`.
- `scripts/data/kits.json` stays at six kits (no fan-expansion cards); surfacing
  is the follow-up `WF2-FAN-EXPANSION-001`.
- Release-One stable, the LED preview, the first preview batch, the three
  single-driver fan previews, and the Rescue build **content** (signatures /
  hashes / sizes / channel / version) — only generator-refreshed
  `source_commit` / `source_url` / `build_date` provenance fields changed.
- `scripts/install.js`, the engine (`scripts/state.js`, `scripts/engine.js`,
  `scripts/utils/*`), the install gate / preflight / freshness engines,
  `scripts/data.js`, `scripts/identify.js`, `scripts/utils/release-channels.js`,
  every view file, `sw.js`, `_headers`, `index.html`, every CSS file, every
  `.github/workflows/*` file.
- The FanTRIAC import block (importer `block_tokens` enforcement + manifest-health
  guard + the automation's TRIAC guard), the WF-LED-003 preview-channel
  acknowledgement model, and the WF2-FAN-CONTROL-GATES-001 fan-control / FanDAC
  address acknowledgements.
- **No TRIAC firmware imported. No LED-stable claim. No FanDAC address physically
  verified (`FANDAC-I2C-ADDR-001` stays pending). No hardware / bench /
  compliance / safety / commercial-availability proof claimed.**
