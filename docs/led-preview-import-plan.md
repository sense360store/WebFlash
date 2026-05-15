# LED preview import plan (WF-LED-001 → WF-LED-002 → WF-LED-003)

> **WF-LED-002 status: LANDED.** The LED preview firmware
> `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin` (SHA256
> `93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3`,
> 1,135,904 bytes) has been imported from upstream release
> [`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview)
> via `scripts/import-firmware-sources.py`, signed via
> `scripts/gen-manifests.py`, and surfaced in `manifest.json` as
> `config_string: Ceiling-POE-VentIQ-RoomIQ-LED`, `channel: preview`,
> `version: 1.0.0`. The per-build manifest now lives at `firmware-1.json`
> (Release-One is `firmware-0.json`, Rescue is `firmware-2.json` after the
> deterministic re-index).
>
> The unchanged invariants are preserved: Release-One source still carries
> `block_tokens: ["FanTRIAC", "LED"]`, the LED preview source carries
> `block_tokens: ["FanTRIAC"]` only, `REQUIRED_CONFIGS` stays production-only
> (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json`
> remains Release-One-only, FanTRIAC remains blocked, and no UI / wizard /
> workflow / `sw.js` / `index.html` change landed in this PR. WF-LED-002
> also hardened `scripts/import-firmware-sources.py` to enforce
> `expected_sha256` against the downloaded asset when the field is present,
> while preserving backward-compatible behaviour for Release-One (which
> does not declare `expected_sha256`). The sections below remain as
> historical planning context.

> **WF-LED-003 status: LANDED — Option A chosen.** The LED preview is
> exposed by `manifest.json` only, with the existing
> release-channel gate as the single exposure mechanism. **No new kit, no
> recommended-bundle preset, no `?mode=preview` toggle, and no wizard /
> service-worker / workflow change.** The investigation that informed
> the decision is in [`docs/firmware-import.md`](firmware-import.md)
> (WF-LED-003 section) and
> [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md)
> (WF-LED-003 section). Concretely:
>
> * The wizard already wires the `led` module key end-to-end (toggle in
>   `index.html`, segment formatter + `parseConfigStringState` in
>   `scripts/state.js`, `Sense360 LED` (S360-300) entry in
>   `scripts/data/module-requirements.js`). Picking Ceiling + PoE + VentIQ
>   + RoomIQ + LED produces `config_string: Ceiling-POE-VentIQ-RoomIQ-LED`,
>   which now resolves to the imported preview build.
> * `scripts/utils/release-channels.js` already pins the preview-channel
>   policy: `defaultSelectable: false` (the LED preview is never the
>   recommended/auto-selected build, even when it is the only candidate
>   for its config_string), `requiresAcknowledgement: true` (install is
>   gated behind a `channel:preview` checkbox with experimental-build
>   warning copy), `hiddenByDefault: false` (preview builds remain
>   visible in normal mode — the opt-in is the module toggle, not a
>   `?mode=…` URL).
> * Stable Release-One behaviour is unchanged. With the LED toggle off,
>   the wizard still produces `Ceiling-POE-VentIQ-RoomIQ`, which still
>   resolves to the same Release-One stable build, with the same auto-
>   selected recommended status, no acknowledgement, and no warning.
> * The do-not-change list is enforced: `scripts/data/kits.json`,
>   `firmware/sources.json`, `manifest.json`, every `firmware-*.json`,
>   `index.html`, `scripts/state.js`, `scripts/utils/release-channels.js`,
>   `scripts/recommended-bundle.js`, `scripts/kit-mode.js`, `sw.js`, and
>   every workflow / signing file are untouched. `REQUIRED_CONFIGS`
>   remains production-only. FanTRIAC remains blocked. LED is never
>   marked stable, never enters `REQUIRED_CONFIGS`, and never enters
>   kits under WF-LED-003.
> * One targeted policy-level test was added to
>   `__tests__/release-channel-ui.test.js`
>   (`WF-LED-003 — LED preview exposure model …` describe block). It
>   pins the LED-preview-shaped build's identity against the policy: not
>   auto-selected by `pickDefaultBuild`, stable wins when both are
>   candidates, `channel:preview` acknowledgement required, visible in
>   normal mode, Preview badge with warning tone, never tagged
>   Recommended. The pre-existing synthetic preview pins in
>   `__tests__/release-channels.test.js` and the manifest-shape /
>   kit-shape / `REQUIRED_CONFIGS` locks in
>   `__tests__/product-catalog-alignment.test.js` cover the rest of the
>   invariants.
> * A future WF-LED-004 may promote the LED preview to a recommended kit
>   or a dedicated preview-channel UI control, but only after S360-300
>   bench verification clears the LED hardware path and/or upstream
>   promotes the catalog entry to `status: production`. Neither
>   precondition has landed; WF-LED-003 does not act on either.

This document captures WebFlash's **future** import / publish plan for the
upstream LED preview build. It is planning material only — **no firmware is
imported, no manifests are regenerated, no UI is changed, no kit is added,
no `REQUIRED_CONFIGS` entry is added, no `firmware/sources.json` source is
added, and FanTRIAC remains blocked.** Until a real upstream release artifact
is proven (see [Upstream proof fields required](#upstream-proof-fields-required)
below), WebFlash must not import the LED preview.

## Purpose and scope

* **In scope:** documenting the exact shape of the future LED preview source
  entry in `firmware/sources.json`, the import + manifest-regeneration
  sequence, the expected `manifest.json` outcome, and the test / UI / kit
  implications. Recording the do-not-change list. Recording the follow-up
  PR sequence.
* **Out of scope:** importing the LED preview `.bin`, signing it,
  regenerating any manifest, modifying `firmware/sources.json`,
  modifying `scripts/data/kits.json`, exposing LED in the wizard, adding
  the LED preview to `REQUIRED_CONFIGS`, or unblocking FanTRIAC. None of
  those land under WF-LED-001.

## Current state (as of WF-LED-001)

* **Active WebFlash surfaces remain Release-One + Rescue only.**
  `firmware/sources.json`, `manifest.json`, every `firmware-*.json`, the
  publish workflow's `REQUIRED_CONFIGS`, and `scripts/data/kits.json` all
  resolve to exactly two builds:
  * `Ceiling-POE-VentIQ-RoomIQ` (Release-One, `channel: stable`,
    `version: 1.0.0`, imported from `sense360store/esphome-public@v1.0.0`).
  * `Rescue` (WebFlash-owned in-tree recovery firmware,
    `channel: rescue`, `version: 1.0.0`).
* **`REQUIRED_CONFIGS` remains production-only:** exactly
  `Ceiling-POE-VentIQ-RoomIQ` and `Rescue`. The LED preview is not in this
  list and must not be added while it carries `status: preview` upstream.
* **The LED preview exists upstream and in the WebFlash alignment fixture
  only.** Upstream `sense360store/esphome-public` PRODUCT-009 promoted
  `Ceiling-POE-VentIQ-RoomIQ-LED` to a preview catalog entry
  (`status: preview`, `channel: preview`, `version: 1.0.0`,
  `artifact_name: Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`,
  `webflash_build_matrix: true`). WF-PRODUCT-003 mirrored that entry into
  `__tests__/fixtures/esphome-product-catalog.json` so the
  preview-eligibility branch of
  `__tests__/product-catalog-alignment.test.js` is exercised against real
  upstream data. **No real upstream GitHub Release artifact has been
  proven yet.** RELEASE-003 marked the proof fields pending.
* **FanTRIAC remains blocked** under HW-005. The orphan
  `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` was
  removed by WF-CLEANUP-002. The `firmware/sources.json` Release-One
  source carries `block_tokens: ["FanTRIAC", "LED"]` (unchanged).
* **The no-exposure contract is enforced today** by the
  `WF-PRODUCT-003 — upstream LED preview recognition` describe block in
  `__tests__/product-catalog-alignment.test.js`: each active WebFlash
  surface explicitly asserts it does not reference the LED preview, and
  the manifest-shape and kit-shape snapshot locks pin the current state
  to Release-One + Rescue.

## Upstream proof fields required

Before WebFlash may import the LED preview, **all** of the following must
exist in `sense360store/esphome-public`:

1. A real GitHub Release tag (e.g. `v1.1.0-led-preview` or whatever
   upstream chooses) — the value that will go into the new
   `firmware/sources.json` entry's `release_tag` field.
2. A release asset named exactly
   `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`,
   downloadable from that release.
3. A `checksums-sha256.txt` release asset that lists the LED `.bin` with
   its real SHA256 hex digest.
4. A `checksums-md5.txt` release asset that lists the LED `.bin` with
   its real MD5 hex digest.
5. A `manifest.json` release asset (upstream build-info metadata; consumed
   best-effort by the importer for the `source_manifest_git_sha` /
   `source_manifest_esphome_version` provenance fields).
6. A release body that contains all four canonical H2 sections:
   `## Changelog`, `## Known Issues`, `## Features`,
   `## Hardware Requirements`. The importer parses these and refuses
   the import if any heading is missing.
7. A published, version-locked SHA256 for the `.bin` (the value WebFlash
   will record in the new source entry's `expected_sha256` field for
   defence-in-depth against future drift).

Until every one of the seven items above is verifiable on a real upstream
release, **WebFlash must not import the LED preview.** WF-LED-001 does
not assert any of these fields exist today — it only records what is
required before the import can proceed.

## Future `firmware/sources.json` shape

When the upstream proof fields above land, a follow-up PR (tentatively
WF-LED-002) will **add** a second source entry to `firmware/sources.json`.
The Release-One entry stays untouched.

Illustrative shape of the new entry (real values filled in by the future
PR; placeholders below):

```json
{
  "source_repo": "sense360store/esphome-public",
  "release_tag": "<future-led-preview-tag>",
  "release_url": "https://github.com/sense360store/esphome-public/releases/tag/<future-led-preview-tag>",
  "version": "1.0.0",
  "channel": "preview",
  "config_string": "Ceiling-POE-VentIQ-RoomIQ-LED",
  "asset_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin",
  "min_size_bytes": 102400,
  "required_assets": [
    "Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin",
    "checksums-sha256.txt",
    "checksums-md5.txt",
    "manifest.json"
  ],
  "required_release_body_sections": [
    "Changelog",
    "Known Issues",
    "Features",
    "Hardware Requirements"
  ],
  "expected_sha256": "<real-upstream-sha256>",
  "block_tokens": [
    "FanTRIAC"
  ]
}
```

### Per-source `block_tokens` invariant

* **Release-One source keeps `block_tokens: ["FanTRIAC", "LED"]`.**
  This must not change. The Release-One asset is LED-less by design; the
  `LED` block protects against accidentally re-importing a future
  upstream Release-One variant that includes LED.
* **The LED preview source uses `block_tokens: ["FanTRIAC"]` only.**
  `LED` cannot appear in `block_tokens` for the LED preview source — the
  importer's `assert_block_tokens_absent` would otherwise reject the LED
  build's own filename.
* The two sources coexist because `block_tokens` is **per-source**, not
  global:
  * `scripts/import-firmware-sources.py` reads
    `entry.get("block_tokens")` for each source independently
    (see the importer's `import_source_entry` flow); the default
    `("FanTRIAC", "LED")` is only used when a source omits the key.
  * `__tests__/manifest-health.test.js` enforces per-source
    `block_tokens` against the matching manifest build only (the test
    explicitly notes: "do NOT globally ban tokens like LED — the repo
    may add an LED build later"). `FanTRIAC` stays globally blocked
    via a separate assertion.
* **FanTRIAC remains blocked** in both source entries. There is no path
  in this plan that unblocks FanTRIAC. S360-320 hardware verification
  (HW-005) is the only thing that can lift the FanTRIAC block, and that
  is upstream's call.

## Import and regeneration sequence (future work)

Documented here for the follow-up PR; **not executed by WF-LED-001**.

1. **Wait for upstream proof.** Confirm every item in
   [Upstream proof fields required](#upstream-proof-fields-required) is
   present on a real `sense360store/esphome-public` release.
2. **Add the LED preview source entry** to `firmware/sources.json`
   (alongside the existing Release-One entry — never modify Release-One).
   Use `block_tokens: ["FanTRIAC"]` only.
3. **Run the importer** with explicit filters so only the LED preview
   source is imported:
   ```bash
   python3 scripts/import-firmware-sources.py \
     --source-repo sense360store/esphome-public \
     --release-tag <future-led-preview-tag>
   ```
   The importer will (a) fetch release metadata, (b) verify all
   `required_assets` are present, (c) download the `.bin` and
   `checksums-sha256.txt`, (d) verify the SHA256 against the upstream
   manifest, (e) verify `size >= min_size_bytes`, (f) verify the
   parsed `config_string` matches `Ceiling-POE-VentIQ-RoomIQ-LED`,
   (g) verify `FanTRIAC` is absent from the asset name / module list,
   (h) verify the release body has all four canonical H2 sections, and
   (i) write the `.bin` plus a `.meta.json` sidecar under
   `firmware/configurations/`.
4. **Regenerate manifests** via the existing pipeline:
   ```bash
   python3 scripts/gen-manifests.py --summary
   ```
   This is the only sanctioned writer of `manifest.json` and
   `firmware-*.json`.
5. **Commit everything together** — the new `.bin`, its `.meta.json`
   sidecar, the updated `firmware/sources.json`, the regenerated
   `manifest.json`, and the new `firmware-2.json` — as a single PR.
6. **`REQUIRED_CONFIGS` stays unchanged** in this import PR. The LED
   preview enters `manifest.json` (because `manifest.json` accepts
   `production` and `preview` statuses), but it **must not** enter
   `REQUIRED_CONFIGS` until upstream promotes the LED build to
   `status: production`. The publish workflow's allowlist admits only
   production-status configs plus the named `Rescue` exception, and
   `__tests__/product-catalog-alignment.test.js` fails closed if a
   non-production config is added to `REQUIRED_CONFIGS`.
7. **UX exposure is a separate PR.** The decision on whether to expose
   the LED preview in the wizard, in a preview kit, or only via a
   sharable URL is intentionally deferred — see
   [UI and kit implications](#ui-and-kit-implications) below.

## Expected manifest outcome (future, not now)

After the future import + regeneration sequence above lands:

* `manifest.json` grows from 2 builds to 3 builds. The new build will
  carry:
  * `config_string: Ceiling-POE-VentIQ-RoomIQ-LED`
  * `channel: preview`
  * `version: 1.0.0`
  * `chipFamily: ESP32-S3`
  * `improv: true`
  * full signature fields populated by `gen-manifests.py`
  * `modules`: `["VentIQ", "RoomIQ", "LED"]`
* A new `firmware-2.json` will appear alongside the existing
  `firmware-0.json` (Release-One) and `firmware-1.json` (Rescue). The
  per-build manifest indices are determined by the generator's
  deterministic ordering; they are not stable identifiers and may be
  reassigned by future regenerations.
* `__tests__/manifest-health.test.js` will start enforcing the LED
  preview source's `block_tokens: ["FanTRIAC"]` against the new build
  automatically (the test iterates every source's `block_tokens`).
* `__tests__/product-catalog-alignment.test.js` will start matching the
  LED preview build against the catalog fixture's `status: preview`
  entry, which is already eligible for `manifest.json` exposure under
  `ELIGIBLE_STATUSES` (`production` + `preview`).

None of this happens in WF-LED-001. It is captured here so the future
PR has an explicit acceptance shape.

## Smoke-test implications

The following files will need updates **in the future import PR** (not
in WF-LED-001):

* **`__tests__/product-catalog-alignment.test.js`** — the
  `WF-PRODUCT-003 — upstream LED preview recognition` describe block's
  "does not reference the LED preview" assertions will need to flip to
  "does reference the LED preview" once the import lands. The
  manifest-shape snapshot lock at line 559 (`builds resolve to exactly
  Release-One + Rescue`) and any kit-shape snapshot lock (line 571)
  must be updated in lockstep with the import.
* **`__tests__/python/test_import_firmware_sources.py`** — the
  Release-One LED-block test (`test_led_blocked_for_release_one`)
  stays as-is (still asserts the Release-One source rejects LED). A
  new test asserting the LED preview source accepts LED but rejects
  FanTRIAC may be added.
* **`scripts/smoke-test-deployment.py` + `__tests__/python/test_smoke_test_deployment.py`** —
  may want a second post-deploy probe for the LED preview build,
  depending on the UX decision in the follow-up PR.
* **`__tests__/manifest-required-configs.test.js`** — only changes if
  `REQUIRED_CONFIGS` itself changes. For a preview-channel import it
  does **not**, so this test stays untouched at import time.

WF-LED-001 changes none of these files.

## UI and kit implications (resolved by WF-LED-003)

WF-LED-001 left these questions open; WF-LED-002 imported the firmware
without acting on them; WF-LED-003 resolves them via **Option A —
manifest-only preview, no new kit, no new mode toggle, no wizard /
service-worker / workflow change**.

* **Wizard surface.** The wizard already encodes `LED` as a selectable
  module via `scripts/data/module-requirements.js` (the `Sense360 LED`
  / S360-300 variant entry) and the
  `Mount-Power[-AirIQ|-VentIQ][-Fan{Variant}][-RoomIQ][-LED]` segment
  order in `scripts/state.js` (`MODULE_KEYS`, `MODULE_SEGMENT_FORMATTERS`,
  `parseConfigStringState`). The `index.html` step-4 markup carries the
  `Sense360 LED <span>S360-300</span>` toggle and its hidden radios.
  Now that WF-LED-002 has imported the matching firmware, picking
  Ceiling + PoE + Bathroom + VentIQ + RoomIQ + LED produces
  `config_string: Ceiling-POE-VentIQ-RoomIQ-LED` and resolves to the
  preview build. **WF-LED-003 does not change the wizard.** The
  exposure mechanism is the existing release-channel gate:
  `scripts/utils/release-channels.js` keeps `preview.defaultSelectable
  = false` (never auto-selected, never recommended), `preview.requires
  Acknowledgement = true` (`channel:preview` checkbox with experimental
  warning copy), and `preview.hiddenByDefault = false` (the build is
  visible in normal mode — the opt-in is the LED module toggle in
  step 4, not a `?mode=` URL). No new toggle, no new mode, no new
  warning copy.
* **Kit catalog.** `scripts/data/kits.json` stays Release-One-only.
  Adding an LED preview kit would imply a Recommended-style affordance
  that the preview status does not justify — S360-300 bench-verification
  questions remain open and upstream still labels the LED catalog entry
  `status: preview`. The kit-shape snapshot lock in
  `__tests__/product-catalog-alignment.test.js` and the LED-must-be-none
  / no-LED-config-string assertions in `__tests__/kits-json.test.js`
  remain in force. A future WF-LED-004 may add a preview kit (with
  explicit preview labelling in the kit UI) once bench verification
  clears.
* **Sharable URL parsing.** `scripts/utils/url-config.js` already
  parses the `LED` token; no parser change is needed and none lands
  under WF-LED-003. Sharable URLs that encode `&led=led` resolve to
  the preview build via the same wizard path as a manual selection.
  Acknowledgement state is intentionally never carried in the URL
  (covered by the existing
  `__tests__/release-channel-url-state.test.js` guards) so a shared
  link can never auto-replay a preview acknowledgement for the
  recipient.
* **No `?mode=preview` introduced.** WF-LED-003 explicitly does not
  add a fourth release mode. `state.js`'s `VALID_RELEASE_MODES`
  (`normal` / `recovery` / `development`) and the matching
  `?mode=recovery` / `?mode=development` URL parameters stay exactly
  as documented in the README "Release channels" section.

## Do-not-change list

The following items must remain unchanged by WF-LED-001 (and by every
PR until the upstream proof fields land and a deliberate import PR
runs):

| Item | Why |
|------|-----|
| `firmware/configurations/*` | No new firmware lands in this PR. |
| `firmware/rescue/*` | Rescue is unrelated to the LED preview. |
| `firmware/sources.json` | Adding the LED preview source requires real upstream proof. |
| `manifest.json` | Regenerated only by `gen-manifests.py`, only after an import. |
| Every `firmware-*.json` | Same as `manifest.json`. |
| `scripts/data/kits.json` | Kit exposure is a separate UX call. |
| `.github/workflows/*` | `REQUIRED_CONFIGS` stays production-only; the publish allowlist must not gain an LED entry. |
| `sw.js` | No new top-level scripts; cache policy unchanged. |
| `index.html` | No UI exposure of the LED preview in this PR. |
| All of `scripts/` | No script changes (importer, generator, validator, runtime, etc.). |
| All of `__tests__/` | No test changes — WF-PRODUCT-003 already pins the no-exposure contract. |
| Signing keys / `firmware-signing/` | No signing operations. |
| Release-One `block_tokens` | Stays `["FanTRIAC", "LED"]`. |
| FanTRIAC blocked status | Stays blocked under HW-005. |

The plan must not (and this document does not):

* import LED firmware,
* regenerate manifests,
* add LED UI,
* add an LED kit,
* publish WebFlash,
* unblock FanTRIAC,
* add the LED preview to `REQUIRED_CONFIGS`, or
* claim a real LED preview artifact exists today.

## Follow-up PR sequence

Recorded as a roadmap; none of these are part of WF-LED-001.

1. **Upstream RELEASE-004 (or equivalent)** — publishes a real
   GitHub Release with all seven proof fields listed above. Done
   upstream, not in WebFlash.
2. **WF-LED-002 — Import the LED preview.** Adds the second source
   entry to `firmware/sources.json` with `block_tokens: ["FanTRIAC"]`,
   runs the importer, runs the manifest generator, commits the new
   `.bin`, `.meta.json`, regenerated `manifest.json`, and new
   `firmware-2.json`. Leaves `REQUIRED_CONFIGS` and the wizard / kit
   surfaces unchanged. Updates the WF-PRODUCT-003 describe block to
   flip the no-exposure assertions on the manifest side only.
3. **WF-LED-003 — UX decision for the LED preview (LANDED).** Decided
   Option A — manifest-only preview, no kit, no new mode toggle, no
   wizard / service-worker / workflow change. The existing
   release-channel gate (preview badge + warning + acknowledgement,
   `defaultSelectable: false`) plus the existing LED module toggle in
   step 4 are the entire exposure surface. The PR is docs + one
   targeted policy-level test
   (`__tests__/release-channel-ui.test.js`'s
   `WF-LED-003 — LED preview exposure model …` describe block). Touched
   no firmware, no manifest, no `firmware/sources.json`, no kit, no UI
   markup, no wizard runtime, no `sw.js`, no workflow, no signing key.
4. **WF-LED-004 (potential, only if and when upstream promotes LED to
   `status: production`)** — promotes the LED config from
   manifest-only exposure to a `REQUIRED_CONFIGS` entry. Requires the
   alignment test's catalog status to flip to `production` first.
   Until that happens, `REQUIRED_CONFIGS` stays production-only.
5. **WF-LED-004 (alternative path, if S360-300 bench verification
   completes before upstream promotes the catalog entry)** —
   introduces a deliberate UX surface (recommended kit, dedicated
   preview-channel control, or both). WF-LED-003 does not pre-decide
   between this branch and step 4 above; either is acceptable when its
   precondition lands. Neither precondition has landed as of
   WF-LED-003.

## Cross-references

* [`docs/firmware-import.md`](firmware-import.md) — full cross-repo
  import contract; this plan is a forward-looking addendum.
* [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md) —
  audit history; see the WF-PRODUCT-003 section for the
  awareness-but-non-exposure baseline.
* [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md) —
  rationale for the production-only `REQUIRED_CONFIGS` policy that
  WF-LED-001 preserves.
* [`docs/github-pages-surface-audit.md`](github-pages-surface-audit.md) —
  current deployed-surface state; LED is excluded from Release-One
  there too.
* `__tests__/product-catalog-alignment.test.js` — the
  `WF-PRODUCT-003 — upstream LED preview recognition` describe block
  is the live guard that pins the no-exposure contract today; no
  duplicate guard is added by WF-LED-001.
* `__tests__/manifest-health.test.js` — per-source `block_tokens`
  enforcement against matching manifest builds (the "do NOT globally
  ban tokens like LED" test).
* `__tests__/python/test_import_firmware_sources.py` — Release-One
  source rejects LED via `block_tokens` (unchanged here).
