# Upcoming PRs — WebFlash

## Maintenance rule

This file is the working queue source of truth for WebFlash. Every WebFlash PR
that changes queue state must update it in the same change set, no separate
follow-up:

- When a PR merges, move it from **Active / upcoming** to **Completed /
  merged** and record the PR number and one-line status.
- When a PR is deferred or blocked, leave it in **Active / upcoming** and
  record the explicit blocker (upstream key, hardware proof, or policy
  decision).
- When a new PR is queued, append it to **Active / upcoming** in the right
  priority slot, with status, purpose, and dependencies.
- Keep upstream `sense360store/esphome-public` rows in **Upstream
  dependencies** only — they are referenced as gating inputs, not as
  WebFlash-owned rows. Do not duplicate the upstream queue here.
- Do not invent PR numbers. If a PR number cannot be verified, leave it
  blank or annotate "PR number to fill when verified" rather than
  guessing.

## Current WebFlash surface summary

State of the repo at TRACKING-001:

- Current import surface has exactly three builds:
  - **Release-One stable** — `Ceiling-POE-VentIQ-RoomIQ` v1.0.0 (production)
  - **LED preview** — `Ceiling-POE-VentIQ-RoomIQ-LED` v1.0.0 (preview channel,
    manifest-only exposure under WF-LED-003 Option A)
  - **Rescue** — `Rescue` v1.0.0 (WebFlash-owned unbricking build)
- `REQUIRED_CONFIGS` is production-only:
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
- `scripts/data/kits.json` is Release-One-only.
- **WF-TRIAC-001 runtime UX has landed** (#432). TRIAC is the eighth
  module-availability state (`advanced-manual-warning`); the card is visible
  and selectable in the custom path behind an in-installer
  acknowledgement gate. TRIAC remains not Release-One, not
  `REQUIRED_CONFIGS`, not kit / recommended, not auto-selected, not
  import-allowed (`block_tokens: ["FanTRIAC", "LED"]` on Release-One and
  `["FanTRIAC"]` on the LED preview source both stand), and not
  compliance-certified.
- **WF-STALE-001 minimal cleanup has landed** (#433). Fixture/doc-only
  cleanup against the current Release-One baseline; no runtime, manifest,
  firmware, source, kit, or `REQUIRED_CONFIGS` change.
- No `FanRelay`, `FanPWM`, `FanDAC`, or `FanTRIAC` firmware artifact has
  been imported. Each remains queued behind a discrete upstream release.
- **LED stable import remains blocked** by:
  - operator hardware proof (WF-HW-TEST-002 follow-up — operator evidence
    still pending; the docs PR merged as #430 without evidence), and
  - upstream `sense360store/esphome-public` `RELEASE-007` (LED stable
    catalog promotion).

## Completed / merged PRs

| PR key | PR# | Status | What merged | What did not change | Follow-up impact |
|---|---|---|---|---|---|
| WF-CLEANUP-001 | #401 | Merged | Initial audit doc inventorying manifest vs. on-disk state; classified 14/16 builds as stale, identified orphan FanTRIAC binary, surfaced live-installer risk. | No firmware, manifest, sidecar, workflow, or script changes. | Opened the WF-CLEANUP-002 through -010 sequence. |
| WF-CLEANUP-002 | #402 | Merged | Removed the orphan `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` from `firmware/configurations/`. | Manifest, sources.json, workflow, `REQUIRED_CONFIGS`, tests unchanged. | Eliminated re-publication risk on next manifest regeneration. |
| WF-CLEANUP-003 | #403 | Merged | Decision document classifying every `REQUIRED_CONFIGS` entry and stale manifest build; proposed WF-CLEANUP-004..-008 sequence; do-not-delete list. | No firmware, manifest, sources, workflow, or `REQUIRED_CONFIGS` changes. | Sequenced the cleanup PR train. |
| WF-CLEANUP-004 | #404 | Merged | Dropped 8 stale legacy `config_string` entries from `REQUIRED_CONFIGS` (Path B / remove). | No firmware, manifest, or runtime changes. | Allowlist now matches what WebFlash can actually ship; manifest pruning deferred to WF-CLEANUP-005. |
| WF-CLEANUP-005 | #405 | Merged | Regenerated `manifest.json` (16 → 2 builds at the time) and pruned 14 stale `firmware-*.json` files to match on-disk state. | No firmware binaries, signing path, workflow, or UI changes. | Resolved pre-existing `firmware-signature.test.js` ENOENT failures. |
| WF-CLEANUP-006 | #406 | Merged | Added the `__tests__/manifest-health.test.js` guard suite (missing-bin / sidecar / per-build drift / blocked-token / `REQUIRED_CONFIGS` coverage). | Read-only — no manifest, firmware, importer, generator, or UI changes. | Manifest drift now fails CI before deploy. |
| WF-CLEANUP-007 | #407 | Merged | Refreshed `CLAUDE.md`, `DEVELOPER.md`, `README.md`, and import docs to reflect the 2-entry allowlist and importer-first intake. | No code, workflow, manifest, firmware, or test changes. | Documentation now matches actual Release-One state. |
| WF-CLEANUP-008 | #408 | Merged | Audit of GitHub Pages deployed surface, service-worker caching, wizard URL handling, and live-origin manifest state. | Audit-only — no runtime, manifest, importer, smoke-test, or workflow changes. | Surfaced WF-CLEANUP-009 (stale smoke-test default) and WF-CLEANUP-010 (kit drift). |
| WF-CLEANUP-009 | #409 | Merged | Fixed `scripts/smoke-test-deployment.py` `DEFAULT_REQUIRED_CONFIG` (stale FanTRIAC → Release-One) and added stdlib-only Python drift guards. | No firmware, manifest, signing, workflow YAML, or UI changes. | Post-deploy smoke test stopped failing on stale default. |
| WF-CLEANUP-010 | #410 | Merged | Reconciled `scripts/data/kits.json` with the cleaned manifest — removed 6 stale sample kits, added single Release-One kit, added 3 invariant guards in `__tests__/kits-json.test.js`. | No firmware, manifest, importer, generator, signing, or workflow changes. | Kit catalog drift prevented going forward. |
| WF-PRODUCT-001 | #411 | Merged | Added the product-catalog alignment guard (`__tests__/product-catalog-alignment.test.js` + vendored upstream catalog fixture). | No firmware, manifest, importer, generator, workflow, kit, or UI changes. | WebFlash surfaces now cross-check against upstream lifecycle catalog. |
| WF-PRODUCT-002 | #412 | Merged | Refreshed the vendored product-catalog fixture against the current upstream snapshot (33 products). | Fixture + docs only — no firmware, manifest, importer, generator, workflow, kit, or UI changes. | Established the refresh checkpoint pattern. |
| WF-PRODUCT-003 | #413 | Merged | Mirrored the real upstream LED preview entry into the fixture; added `WF-PRODUCT-003 — upstream LED preview recognition` describe block pinning awareness-but-non-exposure. | Active WebFlash surfaces unchanged (still Release-One + Rescue only at this point). | Established LED preview awareness contract. |
| WF-LED-001 | #414 | Merged | Docs-only LED preview import plan (`docs/led-preview-import-plan.md`) capturing required upstream proof fields, future `firmware/sources.json` shape, import sequence, deferred UX decisions. | No firmware imported, no manifests regenerated, no `firmware/sources.json` change, no `REQUIRED_CONFIGS` change, no kit/UI exposure. | Authored the import-readiness checklist used by WF-LED-002. |
| WF-LED-002 | #415 | Merged | Imported the LED preview `.bin` + `.meta.json` from upstream `v1.0.0-led-preview`; added LED preview source entry to `firmware/sources.json` with pinned `expected_sha256`; regenerated manifests (now 3 builds); hardened importer SHA256 enforcement. | Release-One source entry, Release-One manifest content, `REQUIRED_CONFIGS`, `scripts/data/kits.json`, every UI/wizard/`sw.js`/workflow surface, FanTRIAC HW-005 block. | First non-Release-One firmware in the manifest; sets WF-LED-003 exposure decision in motion. |
| WF-LED-003 | #416 | Merged | Resolved deferred LED preview UX as **Option A — manifest-only preview**, leaning entirely on existing release-channel gate (`preview.defaultSelectable: false`, `requiresAcknowledgement: true`, `hiddenByDefault: false`) + existing LED module toggle. Added `WF-LED-003 — LED preview exposure model` describe block in `__tests__/release-channel-ui.test.js`. | No firmware, manifest, sources, kit, workflow, `REQUIRED_CONFIGS`, runtime UI, or service-worker changes. | LED preview reachable in normal mode behind preview acknowledgement; stable Release-One path byte-identical with LED toggle off. |
| WF-UX-001 | #417 | Merged | Live-wizard UX audit (`docs/wizard-ux-roadmap.md`), 10 severity-classified findings, target first-run flow, and PR sequencing for WF-UX-QUICK-001 → WF-UX-007 plus WF-HW-TEST-001/002. | Docs-only — no runtime, firmware, manifest, kit, workflow, signing, or wizard logic changes. | Opened the WF-UX-QUICK-001..-007 + WF-HW-TEST-001/-002 series. |
| WF-UX-QUICK-001 | #418 | Merged | Removed visible admin note from popovers; normalized browser-support copy to canonical "Chrome, Edge, or Opera" across 10+ surfaces; promoted Opera to first-class supported. | No firmware, manifest, kit, source, workflow, install/preflight, Release-One, LED-preview, or FanTRIAC-block changes. | Browser-support copy now consistent; admin-note regression test in place. |
| WF-DEPLOY-001 | #419 | Merged | Removed a stale `firmware-provenance.test.js` assertion that required ≥1 deprecated build (no longer valid against the 3-build manifest); added network-free `__tests__/github-pages-surface.test.js` deploy-contract guard; bumped static cache-buster query strings to trigger `firmware-publish.yml`. | No firmware, manifest, `REQUIRED_CONFIGS`, kit, wizard, service-worker, or smoke-test logic changes. | Unblocked the `firmware-publish.yml` deploy chain that had been failing since May-7. |
| WF-HW-TEST-001 | #420 | Merged | Created the LED preview operator-validation proof container (`docs/led-preview-webflash-proof.md`) with pre-flight evidence, 16-step operator procedure, and exhaustive do-not-change guardrails. | No firmware flash performed; no manifest/runtime/workflow changes. Operator evidence rows all marked `pending`. | Operator hardware test gate established; follow-up evidence pending. |
| WF-PRODUCT-004 | #421 | Merged | Advisory `scripts/validate-product-import-readiness.js` plus contract doc (`docs/product-import-readiness.md`) classifying every catalog entry against four independent eligibility dimensions (import / manifest / `REQUIRED_CONFIGS` / kit). Jest pin at `__tests__/product-import-readiness.test.js`. | Read-only — no firmware imported, no manifests regenerated, no `REQUIRED_CONFIGS` change, no kit, no UI/wizard/`sw.js`/workflow change, fixture unchanged. | Catalog-to-surface eligibility now machine-checkable. |
| WF-UX-002 | #422 | Merged | Consolidated three competing firmware-readiness strings into a single `scripts/utils/firmware-readiness.js` classifier with six canonical states; retargeted stale quick-start preset; removed `Ceiling-USB` minimal preset. | Policy layer (release-channel acks, install gate, channel visibility, provenance) unchanged. | Consistent firmware-readiness copy across Step 4 / Step 5 / sidebar; stale presets gone. |
| WF-UX-003 | #423 | Merged | Demoted Step 5 secondary actions (Download .bin / Copy install link / Open HA) and made `<esp-web-install-button>` the sole primary CTA; removed self-referential helper paragraph. | No firmware, manifest, kit, install-gating, or post-flash logic changes. | Primary install CTA hierarchy clarified. |
| WF-UX-004 | #424 | Merged | Added the preflight verdict headline card (`derivePreflightVerdict()` → ready / attention / blocked) with details disclosure; tightened warning-override visibility (hidden when any fail is present). | `evaluatePreflightPolicy()` gating logic unchanged — verdict is pure presentation. | Step 5 preflight reads as a verdict, not a diagnostic dump. |
| WF-WIZARD-AVAIL-001 | #426 | Merged | Added the presentation-only module-availability classifier (`scripts/utils/module-availability.js`) with seven states (later extended to eight by WF-TRIAC-001); per-card pills + `data-availability-state` hooks; static overrides for AirIQ / Relay / PWM / DAC / TRIAC / Voice. | Not the install gate — `release-channels.js` (preview ack), provenance, freshness, and preflight remain authoritative. | Step 4 cards now declare honest availability state before Step 5. |
| WF-UX-005 | #427 | Merged | Step-model cleanup — canonical step labels pinned across desktop/mobile, Step 1 / Step 2 DOM source order swapped to match logical order. | Hidden `mounting=ceiling` default + `voice='none'` Core radio preserved; no script changes needed because routing keys off numeric panel IDs. | Stepper labels and DOM order now consistent. |
| WF-UX-006 | #428 | Merged | Step 1 path selector (kit / custom / recovery) replacing legacy binary mode picker; new `[data-start-paths]` button group; presentation-only path state on top of existing kit/manual mode model. | Path value never enters `config_string`, manifest, `firmware-*.json`, `firmware/sources.json`, kits, release-channels, install gate, or any workflow. | Step 1 customer-path split landed; rescue modal delegation reused. |
| WF-UX-007 | #429 | Merged | Outcome-first Step 4 module labels (e.g. "Room sensing" / "Air quality sensing" / "Bathroom air sensing") with technical Friendly Name + SKU moved to `.module-card__meta` secondary tier; orphan `airiq.base` / `airiq.pro` tooltips removed. | Config-string grammar, manifest matching, kit matching, URL aliases, release channels, preview acknowledgement, module availability, TRIAC HW-005 block, Voice quarantine — all unchanged. `MODULE_LABELS` Fan group still resolves to `"Fan / Switching"` so diagnostics/summary keep the technical label. | Step 4 reads customer-first; technical labels preserved for support. |
| WF-HW-TEST-002 | #430 | Merged | Documented WF-HW-TEST-002 as the planned operator-evidence-collection follow-up to WF-HW-TEST-001, **with no operator evidence supplied**; expanded the proof container header and added the "WF-HW-TEST-002 follow-up record" section. | No firmware flash performed; no firmware, manifest, `REQUIRED_CONFIGS`, kit, runtime, workflow, source, or signing changes. Every proof row stays `pending`. | Operator hardware proof still required — see queue item 1. |
| WF-IMPORT-GAP-001 | #431 | Merged | Documentation-only WebFlash import readiness matrix (`docs/webflash-import-readiness-matrix.md`) classifying every candidate import family across seven import classes; reserved deliberate follow-up PR identifiers; formalized four separation invariants. | No firmware, manifests, sources, `REQUIRED_CONFIGS`, kits, UX, workflows, tests, service-worker, or runtime changes. | Future import PRs (`WF-IMPORT-RELAY-001`, `WF-IMPORT-PWM-001`, `WF-IMPORT-DAC-001`, `WF-IMPORT-TRIAC-001`, `WF-IMPORT-POWER-400-001`, `WF-IMPORT-POE-410-001`, `WF-LED-STABLE-001`, `WF-REQUIRED-001`, `WF-KIT-LED-001`) now have reserved slots and gating rules. |
| WF-TRIAC-001 | #432 | Merged | Moved Sense360 TRIAC (S360-320) from `blocked` to `advanced-manual-warning` (eighth availability state); added inline `[data-advanced-warning-region]` with load-bearing risk copy + session-only acknowledgement Map; orthogonal install-gate clause AND-ed into `readyToFlash`. | FanTRIAC remains blocked at the import / manifest / kit / `REQUIRED_CONFIGS` / compliance layers (`block_tokens: ["FanTRIAC", "LED"]` on Release-One and `["FanTRIAC"]` on the LED preview source both stand). Channel acknowledgements (preview / beta / development / deprecated) unchanged. Release-One stable, LED preview, Rescue install paths byte-identical. | TRIAC is now selectable in the custom path behind an in-installer warning gate; future `WF-IMPORT-TRIAC-001` still requires upstream `RELEASE-TRIAC-001`. |
| WF-STALE-001 | #433 | Merged | Minimal stale fixture/doc cleanup — re-anchored `VALID_STABLE_BUILD` fixture in `__tests__/firmware-provenance.test.js` from `Ceiling-POE-AirIQ` to `Ceiling-POE-VentIQ-RoomIQ`; added historical-snapshot note to `FIRMWARE-DISTRIBUTION-REVIEW.md`. | No runtime, manifest, firmware, source, kit, or `REQUIRED_CONFIGS` changes. Authoritative allowlist remains live in `.github/workflows/firmware-publish.yml` + `CLAUDE.md`. | Stale `Ceiling-POE-AirIQ` reference removed from the fixture surface. |
| WF-KIT-PRESETS-001 | #435 | Merged | Added Stage 1 productized kit bundle presets above the existing path cards. Two installable presets (Bathroom PoE → `Ceiling-POE-VentIQ-RoomIQ` stable, Bathroom PoE + LED → `Ceiling-POE-VentIQ-RoomIQ-LED` preview) plus four planned fan-control kits (Relay / TRIAC / PWM / DAC) in a collapsible non-installable subsection. Introduced `scripts/data/kit-presets.js` (local mirror of upstream KIT-MATRIX-001) + `scripts/kit-presets.js` controller + `__tests__/kit-presets.test.js` (23 assertions). Diagnostics records preset SKU + display name + resolved `config_string` via the existing `setSelectedKitSku` / `setActiveKitMetadata` surface. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js` cache strategy / cache version, every Step 2-5 surface, the rescue modal, the WF-UX-006 path cards, the WF-LED-003 preview-channel acknowledgement model, the WF-TRIAC-001 advanced/manual-warning gate, the FanTRIAC HW-005 block, and the LED-stable exclusion are byte-identical. FanTRIAC stays blocked; LED stable claim NOT made; `S360-300-BENCH-001` / `WF-HW-TEST-003` / `RELEASE-007` NOT claimed complete. | Stage 1 leads with productized bundles instead of SKU lookup; installability remains manifest-driven and the preview preset still gates on the existing preview-channel acknowledgement. `WF-KIT-LED-001` (queue item 4) is **untouched** — bundle presets are presentation-only and do not add an LED-bearing kit to `scripts/data/kits.json`. |
| WF-UPSTREAM-COMPILE-AWARE-001 | #437 | Merged | Documented the upstream `sense360store/esphome-public` compile-only validation pipeline (upstream `FW-COMPILE-MATRIX-001` / #544, `FW-COMPILE-FIX-001` / #546, `FW-COMPILE-RESULT-001` / #547, `FW-COMPILE-POE-NONFAN-001` / #548, `FW-COMPILE-EXPAND-001` / #549) inside `docs/webflash-import-readiness-matrix.md` as a WebFlash planning signal only. The matrix now records that compile-only **does not equal** WebFlash import readiness, **does not create** importable artifacts, **does not imply** preview/stable readiness, **does not imply** hardware proof, **does not imply** `REQUIRED_CONFIGS` eligibility, and **does not imply** kit / recommended / default exposure. Captures the current compile-only target groups (Release-One + LED preview YAMLs already imported; the five PoE non-fan compile-only skeletons from upstream #548 that are **not** imported; the PoE non-fan LED candidate ledger from upstream #549). | No firmware imported, no manifest change, no `firmware/sources.json` change, no `REQUIRED_CONFIGS` change, no kit change, no runtime UI surface, no workflow change, no hardware proof claim. The WF-PRODUCT-004 classifier continues to treat `compile-only` upstream catalog status as ineligible across all four eligibility dimensions. The LED preview proof container (`docs/led-preview-webflash-proof.md`) remains `pending`; upstream `RELEASE-007` remains unblocked by this PR. | **No new WebFlash follow-up identifiers were reserved by this signal.** The matrix recognises upstream compile-only success as a *planning signal* on top of the existing import-class taxonomy; each downstream WebFlash import (RELAY / PWM / DAC / TRIAC / POWER-400 / POE-410 / LED stable) still depends on its own upstream `RELEASE-…` artifact and the WF-IMPORT-GAP-001 follow-up slot reserved for it. |
| WEBFLASH-ARCH-DOCS-001 | _PR number to fill when verified_ | Merged | Promoted the architecture explanation out of the AI-facing `CLAUDE.md` into a new human-facing [`docs/architecture.md`](docs/architecture.md) (two-halves model, `manifest.json` boundary, desktop Chromium-only Web Serial constraint, ESP Web Tools standard, cross-repo contract downstream of `sense360store/esphome-public`, and the explicit deploy gate — `manifest-health` guard suite + per-source `block_tokens` + `REQUIRED_CONFIGS`). De-duplicated the `CLAUDE.md` overview prose to a link (canonical SKU table stays authoritative in `CLAUDE.md`); added a one-line `README.md` Overview link; added a short header comment to `firmware-publish.yml` pointing to the doc and naming the guard suite (comment only); added the additive `__tests__/architecture-doc.test.js` docs guard pinning the doc + the `CLAUDE.md` / `README.md` links. | Markdown, one workflow header comment, and one additive docs-guard test only. No runtime, manifest, firmware, source, kit, `REQUIRED_CONFIGS`, release-channel, `sw.js`, CSS, `index.html`, or workflow trigger/step change. Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, and every runtime file is byte-identical. The FanTRIAC HW-005 block, the WF-LED-003 preview-channel acknowledgement model, and the WF-TRIAC-001 advanced/manual-warning gate all stand unchanged. | Human contributors now have a single architecture entry point; the deploy safety model is documented instead of implicit; `CLAUDE.md` and `docs/architecture.md` cannot drift because the prose lives in one place and the other links to it. |
| WF-FRESHNESS-UX-001 | #439 | Merged | Copy + test clarification only. Replaced the ambiguous "install with the manifest you have" wording on the unknown-verdict freshness gate with the clearer "use the firmware list already loaded in this browser" phrasing across the preflight detail (`scripts/state.js` `getManifestFreshnessCheck`, both warn and acknowledged paths), the install-gate blocking reason (`evaluateFreshnessGate` → install-button / download / copy-URL / summary-install tooltips), the freshness banner summary (`scripts/layout/freshness-banner.js` `pickActiveState` for the `manifest-unknown` case), and the inline acknowledgement description (`index.html` → `#manifest-freshness-ack-description`). Added targeted Jest pins: `__tests__/wizard-state.test.js` gained a `WF-FRESHNESS-UX-001 — clarified freshness warning copy` describe block; `__tests__/cache-freshness.test.js` gained a pin on the unknown-freshness banner summary; `__tests__/a11y-static-html.test.js` gained a `WF-FRESHNESS-UX-001 — clarified manifest freshness ack copy in static index.html` describe block. | **No safety semantics change.** The freshness probe still runs, the recheck control is still rendered, install remains gated when freshness cannot be confirmed until the user explicitly checks the override acknowledgement, the override is scoped to the `unknown` verdict (the `stale` hard fail still cannot be acknowledged), and the freshness ack stays orthogonal to the preview-channel acknowledgement gate (WF-LED-003) and the advanced/manual-warning gate (WF-TRIAC-001). No firmware imported, no manifest regenerated, no `firmware/sources.json` change, no `REQUIRED_CONFIGS` change, no kit change, no release-channel-policy change, no preview-acknowledgement change, no install-button hard-gate change, no `sw.js` change, no workflow change, no FanTRIAC block change, no Rescue install-path change, no hardware-proof claim. Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `scripts/data/kits.json`, `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, the FanTRIAC HW-005 block, the LED preview exposure model, the Rescue install path, and every other wizard surface byte-identical. | Freshness `unknown`-verdict copy now reads consistently as "the firmware list already loaded in this browser" across preflight / install-gate / banner / inline ack surfaces; safety gating unchanged. |
| WEBFLASH-BUNDLE-SKU-MATRIX-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only local mirror of the upstream `sense360store/esphome-public` `BUNDLE-SKU-MATRIX-001` Sense360 PoE **room bundle** SKU naming. Adds [`docs/webflash-bundle-sku-matrix.md`](docs/webflash-bundle-sku-matrix.md) enumerating the five room bundle SKUs (`S360-KIT-BATH-P`, `S360-KIT-KITCHEN-P`, `S360-KIT-LIVING-P`, `S360-KIT-BEDROOM-P`, `S360-KIT-CORRIDOR-P`), their customer-facing names, and per-bundle WebFlash exposure status. `S360-KIT-BATH-P` resolves to the existing Release-One stable `Ceiling-POE-VentIQ-RoomIQ` build via the pre-existing `WF-KIT-PRESETS-001` kit-intent card `S360-KIT-BATH-POE` — no duplicate kit-preset card is added under the `-P` identifier. Kitchen / Living / Bedroom / Corridor are recorded as naming reference only (no matching firmware build, no `firmware/sources.json` entry, no `manifest.json` build, no `REQUIRED_CONFIGS` entry, no kit / kit-preset entry). Three identifier spaces (Module SKU / Kit SKU / Bundle SKU / firmware `config_string`) are documented as deliberately parallel. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, every other file under `scripts/`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, every Step 1-5 wizard surface, the rescue modal, the WF-UX-006 path cards, the WF-KIT-PRESETS-001 bundle preset surface, the WF-LED-003 preview-channel acknowledgement model, the WF-TRIAC-001 advanced/manual-warning gate, and the FanTRIAC HW-005 block are byte-identical. No firmware imported. No LED-stable claim. No fan-candidate promotion. No new `REQUIRED_CONFIGS` entry. No new kit-preset card. `RELEASE-007` / `S360-300-BENCH-001` / `WF-HW-TEST-003` not claimed complete. | WebFlash now mirrors upstream `BUNDLE-SKU-MATRIX-001` room bundle naming for support / diagnostics / future cross-namespace reference work. Any future PR that wants to expose a room bundle as installable still has to go through the existing upstream `RELEASE-…` + `WF-IMPORT-…-001` chain (and, for LED, the LED stable gauntlet). |
| WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only consolidation of the WebFlash Sense360 roadmap / feature / product-availability narrative into one canonical doc. Adds [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md) (currently supported / release-selectable products = Release-One stable `Ceiling-POE-VentIQ-RoomIQ` + LED preview `Ceiling-POE-VentIQ-RoomIQ-LED` preview-only + Rescue; per-SKU module-availability snapshot; four standing guardrails; plus current release version(s), a bundle-SKU mapping summary, a WebFlash roadmap section keyed to the reserved `WF-IMPORT-…` follow-ups, links back to the upstream canonical roadmap docs, and a verification record) and references the upstream `sense360store/esphome-public` `docs/sense360-roadmap-status.md` as the lifecycle source of record. Adds a docs guard at [`__tests__/sense360-webflash-status.test.js`](__tests__/sense360-webflash-status.test.js) pinning canonical-doc existence + FEATURES redirect, release-selectable/preview targets vs. manifest exposure, FanPWM blocked, LED preview-only, and the S360-410 no-verified-claim invariant. Redirects the stale root `FEATURES.md` to the canonical doc (it had drifted — e.g. AirIQ listed as supported / recommended). Repoints the README + DEVELOPER doc indexes. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json`, `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, every file under `scripts/`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, every CSS file, every runtime JS file, every existing test, and every fixture are byte-identical (the only new code artifact is the additive docs-guard test `__tests__/sense360-webflash-status.test.js`). No firmware imported. No FanPWM install card. No LED-stable claim. No artifact published. FanTRIAC HW-005 block, WF-LED-003 preview acknowledgement model, and WF-TRIAC-001 advanced/manual-warning gate all stand. | WebFlash product status now lives in one canonical doc that tracks live repo state and defers lifecycle to the upstream roadmap; FanPWM stays hidden, LED stays preview-only, the S360-410 broader-bundle-expansion blocker stays visible; a CI guard now fails if the canonical doc drifts from the live install surface. |

## Active / upcoming WebFlash queue

Priority-ordered. Update the **Status** column in-place as each PR is opened
or lands, then move the row to **Completed / merged** on merge.

0. **WF-HW-TEST-002 follow-up — Complete LED preview operator flash proof.**
   Status: **Planned / hardware required — operator evidence still
   pending** (the docs PR already merged as #430 *without* operator
   evidence, so the proof container's rows remain `pending`).
   Purpose: Fill the LED preview proof with real flash evidence — Web
   Serial connect, esptool flash, Improv hand-off, Home Assistant
   hand-off, LED ring behaviour, support-bundle excerpt, reconnect.
   Dependencies: Real hardware and a human operator; pairs with
   upstream `sense360store/esphome-public` `S360-300-BENCH-001`. Does
   not by itself promote LED to stable, change `REQUIRED_CONFIGS`,
   alter kits, or unblock `RELEASE-007`.

1. **WF-LED-STABLE-001 — Stable LED WebFlash import.**
   Status: **Blocked by stable artifact.**
   Purpose: Import a stable-channel LED `.bin` (+ `.meta.json` sidecar)
   when upstream ships one; add a second source entry / regenerate
   manifests under the existing importer contract.
   Dependencies: Upstream `sense360store/esphome-public` `RELEASE-007`
   (LED stable build + catalog promotion to `status: production`).

2. **WF-REQUIRED-001 — Decide whether LED stable becomes `REQUIRED_CONFIGS`.**
   Status: **Separate decision.**
   Purpose: After WF-LED-STABLE-001 lands, decide whether the stable
   LED config joins the production-only `REQUIRED_CONFIGS` allowlist.
   Dependencies: WF-LED-STABLE-001 merged.
   Note: **Stable does not automatically mean `REQUIRED_CONFIGS`.**
   `REQUIRED_CONFIGS` is the deploy-allowlist and carries WF-PRODUCT-004
   eligibility rules independent of catalog status.

3. **WF-KIT-LED-001 — Decide LED kit / recommended bundle exposure.**
   Status: **Separate UX / product decision.**
   Purpose: Decide whether to add an LED-bearing kit to
   `scripts/data/kits.json` and/or surface LED in the recommended
   bundle / quick-start preset.
   Dependencies: Operator hardware proof (WF-HW-TEST-002 follow-up
   complete) and/or stable promotion (WF-REQUIRED-001). Either
   precondition is sufficient for the decision; both should be
   considered before exposure changes.

4. **WF-IMPORT-RELAY-001 — Import FanRelay preview artifact.**
   Status: **Blocked.**
   Purpose: Import S360-310 FanRelay preview `.bin` + sidecar; add
   source entry with appropriate `block_tokens`; regenerate manifests.
   Dependencies: Upstream `sense360store/esphome-public`
   `RELEASE-RELAY-001` (FanRelay preview build + catalog
   promotion to `status: preview` or higher).
   Note: **Not `REQUIRED_CONFIGS` by default.** WF-PRODUCT-004
   classifies preview entries as import / manifest / kit eligible but
   never `REQUIRED_CONFIGS`-eligible.

5. **WF-IMPORT-PWM-001 — Import FanPWM preview artifact.**
   Status: **Blocked.**
   Purpose: Import S360-311 FanPWM preview `.bin` + sidecar.
   Dependencies: Upstream `RELEASE-PWM-001`.

6. **WF-IMPORT-DAC-001 — Import FanDAC preview artifact.**
   Status: **Blocked.**
   Purpose: Import S360-312 FanDAC preview `.bin` + sidecar.
   Dependencies: Upstream `RELEASE-DAC-001`.

7. **WF-IMPORT-POWER-400-001 — Import S360-400 artifact.**
   Status: **Blocked.**
   Purpose: Import Sense360 240v PSU (S360-400) artifact if upstream
   ships a separate build (the current Release-One already covers
   `power=ac` transitively via the Ceiling-POE-VentIQ-RoomIQ source).
   Dependencies: Upstream `RELEASE-POWER-400-001`.

8. **WF-IMPORT-POE-410-001 — Import S360-410 artifact.**
   Status: **Blocked / likely no-op unless a separate PoE release
   exists.**
   Purpose: Same shape as item 7, for Sense360 PoE PSU (S360-410). PoE
   is currently covered transitively by both Release-One and LED
   preview (`power=poe`); a dedicated import is only opened if
   upstream ships a distinct PoE artifact.
   Dependencies: Upstream `RELEASE-POE-410-001`.

9. **WF-IMPORT-TRIAC-001 — Import FanTRIAC advanced/manual artifact.**
   Status: **Blocked.**
   Purpose: Import S360-320 FanTRIAC `.bin` + sidecar; lift the
   importer-level `FanTRIAC` block on the specific imported source
   entry (the other source entries' `block_tokens` stay).
   Dependencies: Upstream `RELEASE-TRIAC-001` **and** the
   advanced/manual-warning policy already shipped by WF-TRIAC-001.
   Note: **Not `REQUIRED_CONFIGS`, not kit, not recommended.** WF-TRIAC-001
   is an in-installer warning gate, not a compliance certification claim;
   `WF-IMPORT-TRIAC-001` does not by itself unlock production exposure.

10. **WF-PRODUCT-005 — Enforce deprecated/removed import-readiness policy.**
    Status: **Planned / policy follow-up.**
    Purpose: Extend `scripts/validate-product-import-readiness.js`
    and the Jest pin to actively enforce the `deprecated` / `removed`
    catalog statuses (today they classify as ineligible across all
    four dimensions but the rule is asserted only at the
    classification layer).
    Dependencies: Upstream `sense360store/esphome-public`
    `PRODUCT-DEP-002`, **or** the first actual upstream
    `deprecated` / `removed` catalog entry (whichever arrives first).

## Upstream dependencies

These are tracked in `sense360store/esphome-public`'s own `UPCOMING_PR.md` —
referenced here as dependencies only, never duplicated as WebFlash-owned
rows. Always check the upstream file for the live state; the items below
are pointers, not status:

- **`CORE-ABSTRACT-BUS-001`** — Core abstract bus refactor; precedes the
  per-module driver firmware that any WebFlash fan / power import would
  rely on.
- **`HW-ASSETS-400` / `HW-PINMAP-400-FOLLOWUP`** — S360-400 (240v PSU)
  hardware assets and pinmap; precedes `RELEASE-POWER-400-001` and
  therefore WF-IMPORT-POWER-400-001 (queue item 7).
- **`HW-ASSETS-410` / `HW-PINMAP-410-FOLLOWUP`** — S360-410 (PoE PSU)
  hardware assets and pinmap; precedes `RELEASE-POE-410-001` and
  therefore WF-IMPORT-POE-410-001 (queue item 8).
- **`package/` / `product/` / `WebFlash-upstream/` / `release/` slices** —
  the upstream packaging, product-catalog, WebFlash-bridge, and
  release-orchestration slices that feed every WebFlash import. Any
  WebFlash queue item that says "Dependencies: upstream `RELEASE-…`"
  ultimately resolves through these slices.
- **`RELEASE-007`** — LED stable release; gates WF-LED-STABLE-001
  (queue item 1) and, downstream, the `REQUIRED_CONFIGS` decision
  (WF-REQUIRED-001, queue item 2) and any LED-bearing kit
  (WF-KIT-LED-001, queue item 3).

## Do-not-change guardrails

TRACKING-001 is documentation-only. This PR (and every future PR that
only updates queue state) must not touch:

- `manifest.json`
- every `firmware-*.json`
- `firmware/sources.json`
- every firmware binary or `.meta.json` sidecar under `firmware/`
- `scripts/data/kits.json`
- every file under `scripts/` (including `gen-manifests.py`,
  `import-firmware-sources.py`, `validate-naming-policy.js`,
  `validate-product-import-readiness.js`, `smoke-test-deployment.py`,
  every wizard runtime module under `scripts/`, every layout/utility
  module, and every content/data helper)
- every workflow under `.github/workflows/`
- the `REQUIRED_CONFIGS` allowlist (sourced from
  `.github/workflows/firmware-publish.yml`)
- the release-channel policy in `scripts/utils/release-channels.js`
  (preview acknowledgement, `defaultSelectable`, `hiddenByDefault`,
  visibility)
- every wizard / UX surface in `index.html` and every file under `css/`
- every test under `__tests__/` (including fixtures)
- `sw.js` (service worker, cache name, precache list)
- `_headers` (CSP, CORS, cache rules)
- the WF-LED-003 preview-channel exposure model
- the FanTRIAC HW-005 block (`block_tokens` on Release-One source
  stays `["FanTRIAC", "LED"]`; on the LED preview source stays
  `["FanTRIAC"]`)
- the WF-TRIAC-001 advanced/manual-warning runtime UX
- the Rescue install path
- every generated manifest output (`manifest.json` + every
  `firmware-*.json` is generated by `scripts/gen-manifests.py` and must
  be committed alongside the firmware change that produced it, not by
  this tracking PR)
