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

- Current import surface has eight builds (updated by WEBFLASH-PWM-001):
  - **Release-One stable** — `Ceiling-POE-VentIQ-RoomIQ` v1.0.0 (production)
  - **LED preview** — `Ceiling-POE-VentIQ-RoomIQ-LED` v1.0.0 (preview channel,
    manifest-only exposure under WF-LED-003 Option A)
  - **AirIQ preview** — `Ceiling-POE-AirIQ-RoomIQ` v1.0.0 (preview channel,
    first preview batch from upstream `v1.0.0-preview`)
  - **RoomIQ preview** — `Ceiling-POE-RoomIQ` v1.0.0 (preview channel,
    first preview batch)
  - **RoomIQ + LED preview** — `Ceiling-POE-RoomIQ-LED` v1.0.0 (preview channel,
    first preview batch; distinct from the VentIQ LED preview)
  - **FanRelay preview** — `Ceiling-POE-VentIQ-FanRelay-RoomIQ` v1.0.0 (preview /
    manual-preview channel; WEBFLASH-RELAY-001, from upstream `v1.0.0-preview`
    after #711 marked it `webflash_import_eligibility.eligible=true` — catalog
    status stays `hardware-pending`)
  - **FanPWM preview** — `Ceiling-POE-FanPWM` v1.0.0 (preview / manual-preview
    channel; WEBFLASH-PWM-001, from upstream `v1.0.0-preview` under the same
    #711 `webflash_import_eligibility.eligible=true` signal — catalog status
    stays `hardware-pending`)
  - **Rescue** — `Rescue` v1.0.0 (WebFlash-owned unbricking build)
- The six preview builds are preview-channel only (Advanced install,
  `channel:preview` acknowledgement): not stable, not recommended, not a
  customer default, not in `REQUIRED_CONFIGS`, not a kit, not buyable. The
  default Simple install path still resolves only to the stable Bathroom PoE
  build.
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
- **WF-UX-008 customer-facing copy cleanup has landed** (#452). Internal task /
  release / tracking IDs (`RELEASE-…-001`, `WF-IMPORT-…`, `HW-005`,
  `COMPLIANCE-001`, `KIT-MATRIX-001`) no longer appear in any customer-visible
  wizard copy; they survive only in the dev/support-only `kit-presets.js`
  `upstreamRef` / `blockers` fields and the `module-availability.js`
  `reasonCode`. The custom path is reframed as **"Advanced setup"**. Copy +
  test only — no firmware, manifest, source, kit, `REQUIRED_CONFIGS`,
  install-gate, or safety-semantics change, and no hardware behaviour
  verified.
- **WF-UX-009 Review three-task flow has landed** (#454). Step 5 is restructured
  into three visible customer tasks — **Check your kit** → **Confirm safe
  flashing** → **Install firmware** — with the selected-kit summary first, the
  safety/preflight acknowledgements second, and the dominant
  `<esp-web-install-button>` last. Secondary actions (Download `.bin`, Copy
  install link, Open Home Assistant, Recovery) are demoted into collapsed
  labelled `<details>` disclosures; diagnostics stay support-oriented inside the
  preflight disclosure. Markup + CSS + test only — every install gate (preflight
  policy, manifest freshness, release-channel acknowledgements, advanced/manual
  warnings, provenance/installability) and firmware-selection logic is unchanged.
- **The Simple install UX + manifest-freshness epic has fully landed**
  (#454–#466). Step 1 now leads with a default, product-focused **Simple
  install** for the stable Sense360 Bathroom PoE kit behind an explicit
  **Simple / Advanced** path split; firmware technical detail, secondary
  actions, and diagnostics are collapsed behind disclosures; **freshness
  'unknown' is non-blocking** and routed through calm Simple-install copy
  (Advanced install keeps the acknowledgement gate) while **'stale' stays a
  hard block in both modes**; the manifest-freshness **startup race** and
  **root-manifest check** are fixed (`scripts/state.js` waits for the in-flight
  load before comparing; `scripts/services/manifest-freshness.js` carries
  structured reason codes incl. `manifest-load-pending`); and **View Release
  Notes** opens in-card on the live site. Per-PR detail + do-not-change
  records live in the Completed / merged table: #454 (WF-UX-009), #455
  (WF-UX-010), #456 (WF-UX-011), #457 (WF-UX-012), #458 (WF-UX-013), #459
  (WF-UX-014), #460 (WF-UX-015), #461 + #462 (WF-UX-016), #463 (WF-UX-017),
  #464 (WF-FRESHNESS-ROOT-MANIFEST-001), #465 (WF-UX-018), #466
  (WF-MANIFEST-FRESHNESS-RACE-001). **No** firmware, `manifest.json`,
  `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS`,
  `scripts/data/kits.json`, release-channel policy, FanTRIAC block, or
  service-worker fetch-strategy change landed — Simple install remains stable
  Bathroom PoE only, the stale hard block stands, and LED stays preview-only.
- **`FanRelay`, `FanPWM` and `FanDAC` are now imported** as Advanced-install
  preview / manual-preview builds (WEBFLASH-RELAY-001, WEBFLASH-PWM-001, and
  WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — the latter via the new preview-eligible
  import automation), all authorised by upstream #711's
  `webflash_import_eligibility.eligible=true` signal. Only `FanTRIAC` remains
  **not imported**: it stays `eligible=false` / build-blocked under HW-005, and
  the automation refuses it even if the flag were flipped.
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
| WF-HW-TEST-002 | #430 | Merged | Documented WF-HW-TEST-002 as the planned operator-evidence-collection follow-up to WF-HW-TEST-001, **with no operator evidence supplied**; expanded the proof container header and added the "WF-HW-TEST-002 follow-up record" section. | No firmware flash performed; no firmware, manifest, `REQUIRED_CONFIGS`, kit, runtime, workflow, source, or signing changes. Every proof row stays `pending`. | Operator hardware proof still required — see the WF-HW-TEST-002 follow-up queue item. |
| WF-IMPORT-GAP-001 | #431 | Merged | Documentation-only WebFlash import readiness matrix (`docs/webflash-import-readiness-matrix.md`) classifying every candidate import family across seven import classes; reserved deliberate follow-up PR identifiers; formalized four separation invariants. | No firmware, manifests, sources, `REQUIRED_CONFIGS`, kits, UX, workflows, tests, service-worker, or runtime changes. | Future import PRs (`WF-IMPORT-RELAY-001`, `WF-IMPORT-PWM-001`, `WF-IMPORT-DAC-001`, `WF-IMPORT-TRIAC-001`, `WF-IMPORT-POWER-400-001`, `WF-IMPORT-POE-410-001`, `WF-LED-STABLE-001`, `WF-REQUIRED-001`, `WF-KIT-LED-001`) now have reserved slots and gating rules. |
| WF-TRIAC-001 | #432 | Merged | Moved Sense360 TRIAC (S360-320) from `blocked` to `advanced-manual-warning` (eighth availability state); added inline `[data-advanced-warning-region]` with load-bearing risk copy + session-only acknowledgement Map; orthogonal install-gate clause AND-ed into `readyToFlash`. | FanTRIAC remains blocked at the import / manifest / kit / `REQUIRED_CONFIGS` / compliance layers (`block_tokens: ["FanTRIAC", "LED"]` on Release-One and `["FanTRIAC"]` on the LED preview source both stand). Channel acknowledgements (preview / beta / development / deprecated) unchanged. Release-One stable, LED preview, Rescue install paths byte-identical. | TRIAC is now selectable in the custom path behind an in-installer warning gate; future `WF-IMPORT-TRIAC-001` still requires upstream `RELEASE-TRIAC-001`. |
| WF-STALE-001 | #433 | Merged | Minimal stale fixture/doc cleanup — re-anchored `VALID_STABLE_BUILD` fixture in `__tests__/firmware-provenance.test.js` from `Ceiling-POE-AirIQ` to `Ceiling-POE-VentIQ-RoomIQ`; added historical-snapshot note to `FIRMWARE-DISTRIBUTION-REVIEW.md`. | No runtime, manifest, firmware, source, kit, or `REQUIRED_CONFIGS` changes. Authoritative allowlist remains live in `.github/workflows/firmware-publish.yml` + `CLAUDE.md`. | Stale `Ceiling-POE-AirIQ` reference removed from the fixture surface. |
| WF-KIT-PRESETS-001 | #435 | Merged | Added Stage 1 productized kit bundle presets above the existing path cards. Two installable presets (Bathroom PoE → `Ceiling-POE-VentIQ-RoomIQ` stable, Bathroom PoE + LED → `Ceiling-POE-VentIQ-RoomIQ-LED` preview) plus four planned fan-control kits (Relay / TRIAC / PWM / DAC) in a collapsible non-installable subsection. Introduced `scripts/data/kit-presets.js` (local mirror of upstream KIT-MATRIX-001) + `scripts/kit-presets.js` controller + `__tests__/kit-presets.test.js` (23 assertions). Diagnostics records preset SKU + display name + resolved `config_string` via the existing `setSelectedKitSku` / `setActiveKitMetadata` surface. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js` cache strategy / cache version, every Step 2-5 surface, the rescue modal, the WF-UX-006 path cards, the WF-LED-003 preview-channel acknowledgement model, the WF-TRIAC-001 advanced/manual-warning gate, the FanTRIAC HW-005 block, and the LED-stable exclusion are byte-identical. FanTRIAC stays blocked; LED stable claim NOT made; `S360-300-BENCH-001` / `WF-HW-TEST-003` / `RELEASE-007` NOT claimed complete. | Stage 1 leads with productized bundles instead of SKU lookup; installability remains manifest-driven and the preview preset still gates on the existing preview-channel acknowledgement. `WF-KIT-LED-001` (the LED-kit queue item) is **untouched** — bundle presets are presentation-only and do not add an LED-bearing kit to `scripts/data/kits.json`. |
| WF-UPSTREAM-COMPILE-AWARE-001 | #437 | Merged | Documented the upstream `sense360store/esphome-public` compile-only validation pipeline (upstream `FW-COMPILE-MATRIX-001` / #544, `FW-COMPILE-FIX-001` / #546, `FW-COMPILE-RESULT-001` / #547, `FW-COMPILE-POE-NONFAN-001` / #548, `FW-COMPILE-EXPAND-001` / #549) inside `docs/webflash-import-readiness-matrix.md` as a WebFlash planning signal only. The matrix now records that compile-only **does not equal** WebFlash import readiness, **does not create** importable artifacts, **does not imply** preview/stable readiness, **does not imply** hardware proof, **does not imply** `REQUIRED_CONFIGS` eligibility, and **does not imply** kit / recommended / default exposure. Captures the current compile-only target groups (Release-One + LED preview YAMLs already imported; the five PoE non-fan compile-only skeletons from upstream #548 that are **not** imported; the PoE non-fan LED candidate ledger from upstream #549). | No firmware imported, no manifest change, no `firmware/sources.json` change, no `REQUIRED_CONFIGS` change, no kit change, no runtime UI surface, no workflow change, no hardware proof claim. The WF-PRODUCT-004 classifier continues to treat `compile-only` upstream catalog status as ineligible across all four eligibility dimensions. The LED preview proof container (`docs/led-preview-webflash-proof.md`) remains `pending`; upstream `RELEASE-007` remains unblocked by this PR. | **No new WebFlash follow-up identifiers were reserved by this signal.** The matrix recognises upstream compile-only success as a *planning signal* on top of the existing import-class taxonomy; each downstream WebFlash import (RELAY / PWM / DAC / TRIAC / POWER-400 / POE-410 / LED stable) still depends on its own upstream `RELEASE-…` artifact and the WF-IMPORT-GAP-001 follow-up slot reserved for it. |
| WEBFLASH-ARCH-DOCS-001 | _PR number to fill when verified_ | Merged | Promoted the architecture explanation out of the AI-facing `CLAUDE.md` into a new human-facing [`docs/architecture.md`](docs/architecture.md) (two-halves model, `manifest.json` boundary, desktop Chromium-only Web Serial constraint, ESP Web Tools standard, cross-repo contract downstream of `sense360store/esphome-public`, and the explicit deploy gate — `manifest-health` guard suite + per-source `block_tokens` + `REQUIRED_CONFIGS`). De-duplicated the `CLAUDE.md` overview prose to a link (canonical SKU table stays authoritative in `CLAUDE.md`); added a one-line `README.md` Overview link; added a short header comment to `firmware-publish.yml` pointing to the doc and naming the guard suite (comment only); added the additive `__tests__/architecture-doc.test.js` docs guard pinning the doc + the `CLAUDE.md` / `README.md` links. | Markdown, one workflow header comment, and one additive docs-guard test only. No runtime, manifest, firmware, source, kit, `REQUIRED_CONFIGS`, release-channel, `sw.js`, CSS, `index.html`, or workflow trigger/step change. Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, and every runtime file is byte-identical. The FanTRIAC HW-005 block, the WF-LED-003 preview-channel acknowledgement model, and the WF-TRIAC-001 advanced/manual-warning gate all stand unchanged. | Human contributors now have a single architecture entry point; the deploy safety model is documented instead of implicit; `CLAUDE.md` and `docs/architecture.md` cannot drift because the prose lives in one place and the other links to it. |
| WF-FRESHNESS-UX-001 | #439 | Merged | Copy + test clarification only. Replaced the ambiguous "install with the manifest you have" wording on the unknown-verdict freshness gate with the clearer "use the firmware list already loaded in this browser" phrasing across the preflight detail (`scripts/state.js` `getManifestFreshnessCheck`, both warn and acknowledged paths), the install-gate blocking reason (`evaluateFreshnessGate` → install-button / download / copy-URL / summary-install tooltips), the freshness banner summary (`scripts/layout/freshness-banner.js` `pickActiveState` for the `manifest-unknown` case), and the inline acknowledgement description (`index.html` → `#manifest-freshness-ack-description`). Added targeted Jest pins: `__tests__/wizard-state.test.js` gained a `WF-FRESHNESS-UX-001 — clarified freshness warning copy` describe block; `__tests__/cache-freshness.test.js` gained a pin on the unknown-freshness banner summary; `__tests__/a11y-static-html.test.js` gained a `WF-FRESHNESS-UX-001 — clarified manifest freshness ack copy in static index.html` describe block. | **No safety semantics change.** The freshness probe still runs, the recheck control is still rendered, install remains gated when freshness cannot be confirmed until the user explicitly checks the override acknowledgement, the override is scoped to the `unknown` verdict (the `stale` hard fail still cannot be acknowledged), and the freshness ack stays orthogonal to the preview-channel acknowledgement gate (WF-LED-003) and the advanced/manual-warning gate (WF-TRIAC-001). No firmware imported, no manifest regenerated, no `firmware/sources.json` change, no `REQUIRED_CONFIGS` change, no kit change, no release-channel-policy change, no preview-acknowledgement change, no install-button hard-gate change, no `sw.js` change, no workflow change, no FanTRIAC block change, no Rescue install-path change, no hardware-proof claim. Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `scripts/data/kits.json`, `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, the FanTRIAC HW-005 block, the LED preview exposure model, the Rescue install path, and every other wizard surface byte-identical. | Freshness `unknown`-verdict copy now reads consistently as "the firmware list already loaded in this browser" across preflight / install-gate / banner / inline ack surfaces; safety gating unchanged. |
| WEBFLASH-BUNDLE-SKU-MATRIX-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only local mirror of the upstream `sense360store/esphome-public` `BUNDLE-SKU-MATRIX-001` Sense360 PoE **room bundle** SKU naming. Adds [`docs/webflash-bundle-sku-matrix.md`](docs/webflash-bundle-sku-matrix.md) enumerating the five room bundle SKUs (`S360-KIT-BATH-P`, `S360-KIT-KITCHEN-P`, `S360-KIT-LIVING-P`, `S360-KIT-BEDROOM-P`, `S360-KIT-CORRIDOR-P`), their customer-facing names, and per-bundle WebFlash exposure status. `S360-KIT-BATH-P` resolves to the existing Release-One stable `Ceiling-POE-VentIQ-RoomIQ` build via the pre-existing `WF-KIT-PRESETS-001` kit-intent card `S360-KIT-BATH-POE` — no duplicate kit-preset card is added under the `-P` identifier. Kitchen / Living / Bedroom / Corridor are recorded as naming reference only (no matching firmware build, no `firmware/sources.json` entry, no `manifest.json` build, no `REQUIRED_CONFIGS` entry, no kit / kit-preset entry). Three identifier spaces (Module SKU / Kit SKU / Bundle SKU / firmware `config_string`) are documented as deliberately parallel. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, every other file under `scripts/`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, every Step 1-5 wizard surface, the rescue modal, the WF-UX-006 path cards, the WF-KIT-PRESETS-001 bundle preset surface, the WF-LED-003 preview-channel acknowledgement model, the WF-TRIAC-001 advanced/manual-warning gate, and the FanTRIAC HW-005 block are byte-identical. No firmware imported. No LED-stable claim. No fan-candidate promotion. No new `REQUIRED_CONFIGS` entry. No new kit-preset card. `RELEASE-007` / `S360-300-BENCH-001` / `WF-HW-TEST-003` not claimed complete. | WebFlash now mirrors upstream `BUNDLE-SKU-MATRIX-001` room bundle naming for support / diagnostics / future cross-namespace reference work. Any future PR that wants to expose a room bundle as installable still has to go through the existing upstream `RELEASE-…` + `WF-IMPORT-…-001` chain (and, for LED, the LED stable gauntlet). |
| WEBFLASH-ARCH-SYNC-001 | _(open — PR # to fill at merge)_ | In review | Docs-and-audit-only close-out of the architecture epic on the WebFlash side. Synced [`docs/architecture.md`](docs/architecture.md) *Cross-repo contract* wording to the finalized upstream [`docs/system-architecture.md`](https://github.com/sense360store/esphome-public/blob/main/docs/system-architecture.md) (four-tier board/bundle/alias/shim layering described as invisible to WebFlash; the unsigned-`.bin`-plus-checksums upstream output; WebFlash as the signing / production-manifest authority; boundary = release tags + config strings + artifact names), pointed the link at the precise `#inside-esphome-public-…` anchor, aligned `CLAUDE.md` project-overview wording to the same terminology (AI-specific guidance intact, links to `docs/architecture.md` rather than duplicating), and recorded a dated `WEBFLASH-ARCH-SYNC-001` no-drift re-audit in [`docs/product-import-readiness.md`](docs/product-import-readiness.md) (10 per-check passes proving every config string + artifact name WebFlash consumes is byte-identical to the upstream authoritative `config/webflash-builds.json` after the board/bundle/`PACKAGE-RENAME-001..005` refactor). | **No-drift confirmed — the upstream board/bundle/rename refactor changed nothing on the WebFlash import surface.** Markdown only. No `manifest.json`, `firmware-0/1/2.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/*`, kit, release-channel, `sw.js`, CSS, `index.html`, or workflow change. Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, and every runtime file is byte-identical. FanTRIAC HW-005 block (`["FanTRIAC", "LED"]` on Release-One, `["FanTRIAC"]` on LED preview), WF-LED-003 preview-channel acknowledgement model, and WF-TRIAC-001 advanced/manual-warning gate all stand. | **Architecture epic closed across both repos** — upstream side by `DOCS-ARCH-REFRESH-001` (#665) on the finalized board/bundle architecture; WebFlash side by this PR. The cross-repo boundary (tags + config strings + artifact names) is now documented identically on both sides and proven non-drifting. |
| WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only consolidation of the WebFlash Sense360 roadmap / feature / product-availability narrative into one canonical doc. Adds [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md) (currently supported / release-selectable products = Release-One stable `Ceiling-POE-VentIQ-RoomIQ` + LED preview `Ceiling-POE-VentIQ-RoomIQ-LED` preview-only + Rescue; per-SKU module-availability snapshot; four standing guardrails; plus current release version(s), a bundle-SKU mapping summary, a WebFlash roadmap section keyed to the reserved `WF-IMPORT-…` follow-ups, links back to the upstream canonical roadmap docs, and a verification record) and references the upstream `sense360store/esphome-public` `docs/sense360-roadmap-status.md` as the lifecycle source of record. Adds a docs guard at [`__tests__/sense360-webflash-status.test.js`](__tests__/sense360-webflash-status.test.js) pinning canonical-doc existence + FEATURES redirect, release-selectable/preview targets vs. manifest exposure, FanPWM blocked, LED preview-only, and the S360-410 no-verified-claim invariant. Redirects the stale root `FEATURES.md` to the canonical doc (it had drifted — e.g. AirIQ listed as supported / recommended). Repoints the README + DEVELOPER doc indexes. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json`, `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, every file under `scripts/`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, every CSS file, every runtime JS file, every existing test, and every fixture are byte-identical (the only new code artifact is the additive docs-guard test `__tests__/sense360-webflash-status.test.js`). No firmware imported. No FanPWM install card. No LED-stable claim. No artifact published. FanTRIAC HW-005 block, WF-LED-003 preview acknowledgement model, and WF-TRIAC-001 advanced/manual-warning gate all stand. | WebFlash product status now lives in one canonical doc that tracks live repo state and defers lifecycle to the upstream roadmap; FanPWM stays hidden, LED stays preview-only, the S360-410 broader-bundle-expansion blocker stays visible; a CI guard now fails if the canonical doc drifts from the live install surface. |
| WEBFLASH-FIRST-RELEASE-GATES-SYNC-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only mirror of the upstream `sense360store/esphome-public` first-release gate checklist (`PRE-HW-PREP-FIRST-RELEASE-GATES-001`, upstream PR #679, now at [`docs/first-release-gates.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-gates.md)) onto the WebFlash side. Adds [`docs/release-gates/WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md`](docs/release-gates/WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md) stating, against the live install surface: stable installable = `Ceiling-POE-VentIQ-RoomIQ` (Bathroom `S360-KIT-BATH-P`, the only first-release path); preview = `Ceiling-POE-VentIQ-RoomIQ-LED` (LED preview target, preview-only, gated on the `channel:preview` acknowledgement, no LED-stable claim); not exposed = Kitchen / Bedroom / Living / Corridor room bundles (naming reference only); not exposed = `FanRelay` / `FanPWM` / `FanDAC` / `FanTRIAC` fan drivers; fan-control bundle variants planning-only upstream (`webflash_exposed: false`); shared S360-410 PoE blocker stays visible. Includes the exact upstream source link, a no-new-exposure statement, a no-drift table, and a WebFlash↔upstream gate map. Adds a "First-release gate sync" pointer section to [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md) and a README Documentation-index link. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/data/kit-presets.js` (2 installable + 4 planned cards, unchanged), `scripts/data/module-requirements.js`, every file under `scripts/`, `scripts/utils/release-channels.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, every CSS / runtime JS file, every test, and every fixture are byte-identical. No firmware imported. No install card added. No fan-control variant exposed. No LED-stable claim. No artifact published or referenced as new. The FanTRIAC HW-005 block (`block_tokens: ["FanTRIAC", "LED"]` on Release-One, `["FanTRIAC"]` on the LED preview source), the WF-LED-003 preview-channel acknowledgement model, and the WF-TRIAC-001 advanced/manual-warning gate all stand. | WebFlash now plainly mirrors the upstream first-release gates against its own install surface — installable stable = `Ceiling-POE-VentIQ-RoomIQ`, preview = LED, blocked = Kitchen / Bedroom / Living / Corridor + all fan drivers — and explicitly links the upstream `docs/first-release-gates.md` source of truth. Any future exposure still goes through the upstream `RELEASE-…` + `WF-IMPORT-…-001` chain. |
| WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only mirror of the upstream `sense360store/esphome-public` first-release **dry-run checklist** (`FIRST-RELEASE-DRYRUN-CHECKLIST-001`, upstream PR #680, [`docs/first-release-dryrun-checklist.md`](https://github.com/sense360store/esphome-public/blob/main/docs/first-release-dryrun-checklist.md)) onto the WebFlash side. Adds [`docs/release-gates/WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001.md`](docs/release-gates/WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001.md) — the WebFlash **no-publish operator handoff for the current stable release path**: current stable config string `Ceiling-POE-VentIQ-RoomIQ` (Bathroom `S360-KIT-BATH-P`, `stable`, `v1.0.0`, already imported and live); expected artifact name pattern `Sense360-Ceiling-POE-VentIQ-RoomIQ-v<x.y.z>-stable.bin` (at v1.0.0 `…-v1.0.0-stable.bin`); expected upstream release-note source (the upstream GitHub release body's four `##` sections — Changelog / Known Issues / Features / Hardware Requirements); expected checksum/source-update handoff (importer SHA-256 verification vs upstream `checksums-sha256.txt` + the source entry's `expected_sha256` when declared); WebFlash import expectations (importer → `gen-manifests.py` → production signing → `firmware-publish.yml` deploy → smoke test) with non-publishing `--dry-run` / read-only rehearsal lanes; a no-publish/no-exposure safety checklist; a post-import verification checklist; a no-new-exposure statement; a no-drift table; and a WebFlash↔upstream stage map. Adds a "First-release dry-run handoff" pointer section to [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md) and a README Documentation-index link. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, every file under `scripts/`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, every CSS / runtime JS file, every test, and every fixture are byte-identical. No firmware imported. No install card added. No fan-control variant exposed. No LED-stable claim. Kitchen / Bedroom / Living / Corridor stay not installable. No artifact published or referenced as new. The FanTRIAC HW-005 block (`block_tokens: ["FanTRIAC", "LED"]` on Release-One, `["FanTRIAC"]` on the LED preview source), the WF-LED-003 preview-channel acknowledgement model, and the WF-TRIAC-001 advanced/manual-warning gate all stand. | WebFlash now carries a concrete no-publish operator handoff for the current stable release path that mirrors the upstream dry-run checklist and documents the WebFlash-owned import / sign / manifest / deploy side (stage 6). Any future stable re-import still goes through the importer SHA-256 contract + `gen-manifests.py` + the `REQUIRED_CONFIGS` gate; any new exposure still goes through the upstream `RELEASE-…` + `WF-IMPORT-…-001` chain. |
| WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001 | _(open — PR # to fill at merge)_ | In review | Documentation-only record of a **live manifest freshness smoke test** of the deployed page (`https://sense360store.github.io/WebFlash/`), opened after an earlier browser session reported the *"Freshness unknown — Could not confirm firmware manifest freshness"* warning. Adds [`docs/release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md`](docs/release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md) recording **PASS**: the live `manifest.json` returns HTTP 200 with a present, parseable `generated_at` (`2026-05-29T18:46:09…`), open CORS (`access-control-allow-origin: *`), and an identical `generated_at` across two `cache: 'no-store'` re-fetches, so the freshness check resolves to `current` — neither the *"Freshness unknown"* (warn) nor the *"Newer firmware manifest available"* (stale) banner appears in a fresh session. Confirms the live install surface (`Ceiling-POE-VentIQ-RoomIQ` stable v1.0.0 + `Ceiling-POE-VentIQ-RoomIQ-LED` preview-only + `Rescue`; no fan-control variant; no LED-stable build; no Kitchen / Bedroom / Living / Corridor bundle). Documents the freshness verdict logic, the `unknown`/`stale`/`current` conditions, an honest methodology note (automated live-origin HTTP verification + deterministic verdict analysis; no GUI browser, so a human incognito visual pass is a recommended non-blocking follow-up), and the do-not-change confirmation. Adds a "Live manifest freshness smoke test" pointer section to [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md). Likely cause of the earlier warning recorded as stale local browser/service-worker cache or a transient `no-store` re-fetch failure — **not** a manifest metadata issue, CORS issue, or WebFlash bug — so no `WEBFLASH-FRESHNESS-UNKNOWN-DIAGNOSTICS-001` follow-up is opened. | Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, every file under `scripts/` (including `scripts/services/manifest-freshness.js` and `scripts/layout/freshness-banner.js`), `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, every `.github/workflows/*` file, `sw.js`, `_headers`, `index.html`, every CSS / runtime JS file, every test, and every fixture are byte-identical. No runtime behaviour changed (no confirmed bug found, so nothing scoped to change). No firmware imported. No install card added. No fan-control variant exposed. No LED-stable claim. Kitchen / Bedroom / Living / Corridor stay not installable. No artifact published. The FanTRIAC HW-005 block, the WF-LED-003 preview-channel acknowledgement model, and the WF-TRIAC-001 advanced/manual-warning gate all stand. | WebFlash now has a recorded live-origin smoke test confirming the manifest freshness check passes in a fresh session; the earlier *"Freshness unknown"* warning is attributed to stale local cache / a transient re-fetch failure rather than a manifest or WebFlash defect, and a human incognito visual re-confirm is the only (non-blocking) open follow-up. |
| WF-UX-008 | #452 | Merged | Customer-facing copy cleanup. Removed internal engineering / task / release / tracking IDs (`RELEASE-RELAY-001`, `WF-IMPORT-RELAY-001`, `RELEASE-TRIAC-001`, `WF-IMPORT-TRIAC-001`, `RELEASE-PWM-001`, `RELEASE-DAC-001`, `HW-005`, `COMPLIANCE-001`, `KIT-MATRIX-001`, `UPCOMING_PR.md`, `scripts/import-firmware-sources.py`) from the customer-visible wizard surface and replaced them with plain-language availability text plus a next step: the Stage 1 planned-bundle card meta lines + planned intro + source line + TRIAC description in `index.html`, the `notAvailableReason` / `warning` copy in `scripts/data/kit-presets.js`, and the TRIAC advanced/manual-warning `detail` prose (both the per-variant override and the config-string classifier) in `scripts/utils/module-availability.js`. Internal references now live only in developer/support-only data (`kit-presets.js` `upstreamRef` / `blockers` — never rendered to customers, no consumers outside the data module) and the machine-readable `module-availability.js` `reasonCode` (`hw-005-advanced-manual`, never rendered as prose) used for diagnostics. Reframed the customer-facing "Custom configuration" path to **"Advanced setup"** (high-level goal #2) with customer-safe guidance ("Use this only if your hardware doesn't match a kit") across the Step 1 path card, the panel header, the kit-panel switch link, and the `kit-mode.js` announce — the data hooks (`data-start-path="custom"`, `configmode=custom`, `data-custom-path-panel`) and URL contract are unchanged. Added guard tests: `__tests__/a11y-static-html.test.js` `WF-UX-008 — no internal task/release/tracking IDs in customer-facing copy` describe block (bundle section / planned cards / path panels) + the Advanced-setup copy pin; `__tests__/kit-presets.test.js` customer-facing-field ID guard + planned-reason next-step pin; refreshed `__tests__/module-availability.test.js` + `__tests__/wizard-state.test.js` TRIAC `detail` assertions (now assert the IDs are absent from the rendered prose and present only in `reasonCode`). | **No install / firmware / safety-semantics change — copy + test only.** Every firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (still Release-One-only), `scripts/data/module-requirements.js` field values, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the install gate, the preflight / freshness engines, `sw.js`, `_headers`, every `.github/workflows/*` file are byte-identical. The WF-WIZARD-AVAIL-001 availability *states* + `reasonCode` values, the WF-TRIAC-001 advanced/manual-warning install gate, the WF-LED-003 preview-channel acknowledgement model, the FanTRIAC HW-005 import block (`block_tokens` unchanged), and the WF-UX-006 path data-hooks / URL contract all stand. No firmware imported. **No hardware behaviour verified** — the WF-HW-TEST-002 operator-evidence gate remains pending. | Customer-facing UI no longer exposes internal tracking IDs; every unavailable kit states a plain-language reason + a next step; the advanced path is reframed as "Advanced setup" with when-to-use guidance. Support traceability is preserved via the dev-only `upstreamRef` / `blockers` data and the `reasonCode` diagnostic hook. |
| WF-UX-009 | #454 | Merged | Restructured Step 5 Review into a guided three-task flow — **Check your kit** → **Confirm safe flashing** → **Install firmware** — with the `<esp-web-install-button>` dominant and Download / Copy / HA / Recovery demoted into collapsed `<details>`. | Markup + CSS + test only; every Step 5 install gate (preflight, freshness, channel + advanced/manual acks, provenance) re-parented unchanged. No firmware / `manifest.json` / `firmware-*.json` / `firmware/sources.json` / `REQUIRED_CONFIGS` / `scripts/data/kits.json` / `sw.js` change. | Review reads as a three-task customer flow; install action is structurally dominant. |
| WF-UX-010 | #455 | Merged | Reworked Step 1 so the stable `S360-KIT-BATH-POE` bundle is the single dominant primary card, LED preview is clearly secondary, planned fan kits stay collapsed, and kit / Advanced setup / Recovery / SKU search become secondary "other ways to start". | Markup + CSS + test only; no firmware / `manifest.json` / `firmware-*.json` / `firmware/sources.json` / `REQUIRED_CONFIGS` / `scripts/data/kits.json` / release-channel / `sw.js` change. LED preview-only, fans non-installable, FanTRIAC block all stand. | A normal kit buyer reads Step 1 as "install the Sense360 Bathroom PoE kit (stable)" first. |
| WF-UX-011 | #456 | Merged | Added the default product-focused **Simple install** landing for the stable Bathroom PoE kit (`[data-simple-install]` hero via `scripts/simple-install.js`) reusing the existing Step 5 install surface + every gate; full wizard preserved behind **Advanced setup**. | Markup + CSS + one additive `state.js` readiness broadcast + test; no firmware / `manifest.json` / `firmware/sources.json` / `REQUIRED_CONFIGS` / release-channel / installability / `sw.js`-strategy change. Stale hard block stands. | Established the Simple install hero + readiness broadcast. |
| WF-UX-012 | #457 | Merged | Split Step 1 into an explicit **Simple install** (recommended, default) vs **Advanced install** path picker; Simple shows one clean product card + a single safety checkbox mirroring the authoritative `[data-preflash-acknowledge]`. | Markup + CSS + `scripts/simple-install.js` + test; install gate authoritative in `state.js`, never bypassed. No firmware / manifest / sources / `REQUIRED_CONFIGS` / release-channel / `sw.js`-strategy change. LED preview-only, fans non-installable, TRIAC advanced/manual. | Simple / Advanced path split landed. |
| WF-UX-013 | #458 | Merged | Reduced Simple-install warning noise — freshness `unknown` surfaces once in the hero as calm "Could not recheck for updates" with Reload / Continue (Continue ticks the authoritative freshness ack); duplicate freshness / preflight surfaces suppressed in Simple mode; stale stays a hard block. | `index.html` + CSS + `scripts/simple-install.js` + test; **no `state.js`** change, no firmware / manifest / sources / `REQUIRED_CONFIGS` / release-channel / stale-block / `sw.js`-strategy change. | Simple install reads calm; gate stays authoritative. |
| WF-UX-014 | #459 | Merged | Made the WF-UX-013 calm freshness copy actually deploy — threaded an `APP_SHELL_BUILD` cache-bust token from HTML through `bootstrap.js` → `app.js` → `scripts/simple-install.js?v=…`; bumped `sw.js` `CACHE_NAME` v5→v6 to re-prime; added a support-only app-shell build marker. | Deploy-layer + presentation only; **no** `state.js` gate, firmware, manifest, sources, `REQUIRED_CONFIGS`, release-channel, or `sw.js` fetch-*strategy* change. | Fixed the deployed mixed old/new Simple-install UI; calm freshness copy ships. |
| WF-UX-015 | #460 | Merged | Collapsed all firmware / provenance / release-metadata detail in Simple mode behind a single hero **"Technical details"** disclosure; default Simple path shows one product card + one safety confirmation + one Install action. Bumped cache-bust + `sw.js` `CACHE_NAME` v6→v7 in lockstep. | Presentation + deploy-layer only; `createFirmwareCardHtml` unchanged, Advanced renders the full card. No `manifest.json` / `firmware/sources.json` / `REQUIRED_CONFIGS` / firmware / installability / `sw.js`-strategy change. | Default Simple path is genuinely simple. |
| WF-UX-016 | #461, #462 | Merged | Routed freshness `unknown` through the calm Simple-install copy instead of `preflight-fail` — `scripts/state.js` `deriveInstallReadinessReason` attributes the freshness axis to its own reason (`freshness-unknown` / `firmware-stale`); #462 fixed remaining Simple-install freshness leakage and the release-notes link. Rode the `sw.js` `CACHE_NAME` v7→v8 re-prime. | Presentation / deploy-layer only; gate untouched (Continue still ticks the freshness ack, stale stays a hard block). No firmware / manifest / sources / `REQUIRED_CONFIGS` / release-channel / `sw.js`-strategy change. | Simple path no longer renders "Cannot install yet" for an unknown verdict. |
| WF-UX-017 | #463 | Merged | Made freshness `unknown` **non-blocking in Simple install** by making `evaluateFreshnessGate` the single freshness authority (`evaluateGatingPreflightPolicy` excludes the `manifest-freshness` row so it can never double-block); Advanced keeps the ack gate, **stale stays a hard block in both modes**. Added structured `reason` codes in `scripts/services/manifest-freshness.js`; `CACHE_NAME` v9→v10. Adds `docs/wf-ux-017-freshness-diagnosis.md`. | Presentation / gate-only; no firmware / `manifest.json` / `firmware/sources.json` / `REQUIRED_CONFIGS` / `scripts/data/kits.json` / release-channel / TRIAC / `sw.js`-strategy change. | Install button enables for an unknown verdict in Simple install; live cause now diagnosable. |
| WF-FRESHNESS-ROOT-MANIFEST-001 | #464 | Merged | Fixed the root-manifest freshness check so the loaded root-manifest metadata (`generated_at`, `manifest_version`, `source_commit`) is captured via `captureManifestMetadata()` on every successful `loadManifestData()` and cleared on a failed load, collapsing the opaque `missing-generated-at` into specific `missing-loaded` / `missing-fetched` / `missing-both` reasons. | `scripts/state.js` + `scripts/services/manifest-freshness.js` + test; freshness verdict semantics (current / stale / unknown) unchanged. No firmware / manifest / sources / `REQUIRED_CONFIGS` / `sw.js`-strategy change. | Loaded-side metadata reliably captured; reason codes sharpened. |
| WF-UX-018 | #465 | Merged | Fixed **View Release Notes** doing nothing on the live site — removed the `selectFirmwareById()` call in `toggleReleaseNotes()` that rebuilt `#compatible-firmware` and detached the just-captured trigger; the disclosure is presentational and reads the changelog from `firmwareOptionsMap`. Bumped `sw.js` `CACHE_NAME` v10→v11. Adds a live-path test. | Bugfix + cache-name bump + test only; `sw.js` fetch-*strategy*, install gate, freshness engines, FanTRIAC block all unchanged. No firmware / manifest / sources / `REQUIRED_CONFIGS` / `index.html` / CSS change. | Release notes open in-card for stable + LED-preview builds; pinned by a live-path test. |
| WF-MANIFEST-FRESHNESS-RACE-001 | #466 | Merged | Fixed the manifest-freshness **startup race** — `checkManifestFreshnessNow()` now awaits the in-flight `manifestLoadPromise` and re-captures metadata before comparing; `triggerManifestFreshnessCheckIfNeeded()` no longer pre-marks the check run; added the transient `manifest-load-pending` reason (eleventh code). Adds `__tests__/wf-manifest-freshness-race.test.js` + `docs/wf-manifest-freshness-race-diagnosis.md`. | `scripts/state.js` + `scripts/services/manifest-freshness.js` + test/docs; verdict semantics unchanged, stale still hard-blocks. No firmware / `manifest.json` / `firmware-*.json` / `firmware/sources.json` / `REQUIRED_CONFIGS` / `sw.js`-strategy change. | A full refresh into `step=5` no longer shows a false `missing-generated-at`; initial refresh == manual recheck. |
| WF-PREVIEW-IMPORT-FIRST-BATCH-001 | — (PR open) | PR open | Imported the first preview firmware batch from upstream `v1.0.0-preview` — three preview-channel builds (`Ceiling-POE-AirIQ-RoomIQ`, `Ceiling-POE-RoomIQ`, `Ceiling-POE-RoomIQ-LED`), each SHA-256-verified against the upstream checksums + pinned `expected_sha256`. Added 3 `firmware/sources.json` entries, 3 `.bin` + `.meta.json` sidecars, regenerated `manifest.json` (3→6 builds) + `firmware-*.json`, removed the AirIQ `no-firmware` override so AirIQ derives `available-preview`, refreshed the catalog fixture + alignment/availability tests, and updated status docs. | `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`), `scripts/data/kits.json` (Release-One-only), Release-One stable + VentIQ LED preview + Rescue build content (signatures/hashes byte-identical; only `source_commit`/`source_url`/`build_date` provenance refreshed), `scripts/utils/release-channels.js`, the install gate, `sw.js`, `_headers`, `index.html`, every workflow. No TRIAC / FanRelay / FanPWM / FanDAC import. The 4th `v1.0.0-preview` asset (`Ceiling-POE-VentIQ-RoomIQ-LED`) was NOT re-imported (already shipped via `v1.0.0-led-preview`). | Preview builds are Advanced-install-only behind the `channel:preview` acknowledgement; firmware-build proof only (no hardware / bench / compliance / commercial-availability proof). Simple install still resolves only to stable Bathroom PoE. |
| WEBFLASH-RELAY-001 (a.k.a. WF-IMPORT-RELAY-001) | _(open — PR # to fill at merge)_ | In review | Imported the `Ceiling-POE-VentIQ-FanRelay-RoomIQ` manual-preview firmware from upstream `v1.0.0-preview` (SHA256 `f9600a6b…d026ca4`, 989,840 bytes) as an **Advanced-install-only preview**. Authorised by upstream #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`) which set `webflash_import_eligibility.eligible=true` while the catalog status stays `hardware-pending` / `webflash_build_matrix=false`. Added 1 `firmware/sources.json` entry (`channel: preview`, pinned `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the `.bin` + `.meta.json`, regenerated `manifest.json` (6→7 builds) + `firmware-*.json`. Flipped `Sense360 Relay` (S360-310) `design-pending`→`available-preview` with bespoke installer/developer-preview copy. Taught `__tests__/product-catalog-alignment.test.js` + `scripts/validate-product-import-readiness.js` to recognise `webflash_import_eligibility.eligible` (import / manifest / kit only — never `REQUIRED_CONFIGS`, never when `eligible!==true`). Mirrored the FanRelay row into the catalog fixture (`status: hardware-pending` + eligibility object). Added `docs/fanrelay-preview-import-proof.md`; updated `docs/sense360-webflash-status.md`, `docs/live-smoke-preview-import.md`, `CHANGELOG.md`. Rebaselined the build-count / source-list test pins (7 builds; FanRelay dropped from the forbidden-fan-token guards). | `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js` (no FanRelay card), Release-One stable + first preview batch + VentIQ LED preview + Rescue build **content** (signatures/hashes byte-identical; only provenance refreshed), `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the install gate / preflight / freshness engines, `scripts/simple-install.js`, `sw.js`, `_headers`, `index.html`, every CSS, every `.github/workflows/*` file. FanTRIAC import block, WF-LED-003 preview acknowledgement model, WF-TRIAC-001 advanced/manual-warning gate all stand. **No FanPWM / FanDAC / FanTRIAC imported. No hardware / bench / compliance / safety / commercial-availability proof claimed.** | FanRelay reachable in the Advanced (custom) path behind the existing `channel:preview` acknowledgement; Simple install unchanged (stable Bathroom PoE only). WebFlash now recognises the upstream two-concept eligibility model (`webflash_import_eligibility` vs. `webflash_build_matrix`). FanPWM / FanDAC remain reserved for `WF-IMPORT-PWM-001` / `WF-IMPORT-DAC-001`. |
| WEBFLASH-PWM-001 (a.k.a. WF-IMPORT-PWM-001) | _(open — PR # to fill at merge)_ | In review | Imported the `Ceiling-POE-FanPWM` manual-preview firmware from upstream `v1.0.0-preview` (SHA256 `4ef9f353…c59926`, 950,720 bytes) as an **Advanced-install-only preview**, the direct sibling of WEBFLASH-RELAY-001. Authorised by the same upstream #711 (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`) `webflash_import_eligibility.eligible=true` signal while the catalog status stays `hardware-pending` / `webflash_build_matrix=false`. Added 1 `firmware/sources.json` entry (`channel: preview`, pinned `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the `.bin` + `.meta.json`, regenerated `manifest.json` (7→8 builds) + `firmware-*.json`. Flipped `Sense360 PWM` (S360-311) `no-firmware`→`available-preview` with bespoke installer/developer-preview copy (low-voltage / DC fan control). Mirrored the FanPWM row into the catalog fixture (`status: hardware-pending` + eligibility object); the catalog-alignment guard + `scripts/validate-product-import-readiness.js` already recognise `webflash_import_eligibility.eligible` (no validator change needed). Added `docs/fanpwm-preview-import-proof.md`; updated `docs/sense360-webflash-status.md`, `docs/live-smoke-preview-import.md`, `docs/webflash-import-readiness-matrix.md`, `CHANGELOG.md`. Rebaselined the build-count / source-list test pins (8 builds; FanPWM dropped from the forbidden-fan-token guards). | `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js` (no FanPWM card), Release-One stable + first preview batch + VentIQ LED preview + FanRelay preview + Rescue build **content** (signatures/hashes/`build_date` byte-identical; only `source_commit`/`source_url` provenance refreshed), `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the install gate / preflight / freshness engines, `scripts/simple-install.js`, `sw.js`, `_headers`, `index.html`, every CSS, every `.github/workflows/*` file. FanTRIAC import block, WF-LED-003 preview acknowledgement model, WF-TRIAC-001 advanced/manual-warning gate all stand. **No FanDAC / FanTRIAC imported. No hardware / bench / compliance / safety / commercial-availability proof claimed.** | FanPWM reachable in the Advanced (custom) path behind the existing `channel:preview` acknowledgement; Simple install unchanged (stable Bathroom PoE only). FanDAC remains reserved for `WF-IMPORT-DAC-001`; FanTRIAC stays build-blocked. |
| WF-EASY-BUNDLE-PICKER-001 | _(open — PR # to fill at merge)_ | In review | Turned the default **Simple install** view from a single fixed Bathroom PoE path into an easy **bundle picker** over the supported customer bundle products. Added presentation-only data source [`scripts/data/simple-bundles.js`](scripts/data/simple-bundles.js) with six bundles — `S360-KIT-BATH-P` (Bathroom — PoE → `Ceiling-POE-VentIQ-RoomIQ`, **stable / default / recommended**), `S360-KIT-KITCHEN-P` (→ `Ceiling-POE-AirIQ-RoomIQ`), `S360-KIT-BEDROOM-P` (→ `Ceiling-POE-RoomIQ`), `S360-KIT-LIVING-P` + `S360-KIT-CORRIDOR-P` (→ `Ceiling-POE-RoomIQ-LED`), `S360-KIT-BATH-P-REL` (→ `Ceiling-POE-VentIQ-FanRelay-RoomIQ`, **preview + fan-control ack**) — each carrying display name / room / config string / channel / badges / module summary / default+recommended flags / preview- + fan-control-ack requirements / buyable flag / warning. Reworked the [`index.html`](index.html) Simple-install section to lead with "Choose your Sense360 kit" + six cards (technical metadata stays in the collapsed Technical details disclosure), extended [`scripts/simple-install.js`](scripts/simple-install.js) with the picker controller (selecting a card feeds the bundle's `wizardState` through the existing `setState()`; the fan-control acknowledgement is AND-ed into the authoritative `[data-preflash-acknowledge]` gate), added bundle-picker styles to `css/wizard-style.css`, registered `scripts/data/simple-bundles.js` in `sw.js` `SCRIPT_MODULES`, bumped the cache-bust token (`202606015`) + `CACHE_NAME` (`webflash-v12`). Added `__tests__/wf-easy-bundle-picker.test.js` (27 assertions) + `docs/live-smoke-easy-bundle-picker.md`; updated `docs/sense360-webflash-status.md`, `docs/live-smoke-preview-import.md`, `docs/webflash-import-readiness-matrix.md`, `CHANGELOG.md`. | Every firmware binary, `manifest.json` (still 9 builds), every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, the install gate / preflight / provenance / signature / freshness engines, and every `.github/workflows/*` file are unchanged. No firmware imported. Standalone `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` previews and TRIAC stay **out** of Simple install (Advanced-only). FanTRIAC build block, WF-LED-003 preview-channel acknowledgement model, WF-TRIAC-001 advanced/manual-warning gate all stand. **No hardware / bench / compliance / safety / commercial-availability proof claimed.** | Simple install is now a kit picker: stable Bathroom PoE is the default + recommended choice, and the imported preview room bundles are reachable behind their Preview labels + acknowledgement gates (the relay bundle behind an extra fan-control ack). Preview bundles are never default / recommended / buyable. Advanced install + Recovery unchanged. No new `REQUIRED_CONFIGS` / kit entry; promotion to stable/buyable still needs the upstream `RELEASE-…` chain + the S360-410 PoE evidence gate. |
| WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 (a.k.a. WF-IMPORT-DAC-001) | _(open — PR # to fill at merge)_ | In review | Added a guarded **preview-eligible import automation** ([`scripts/import-preview-eligible-sources.py`](scripts/import-preview-eligible-sources.py)) that discovers every upstream catalog entry carrying `webflash_import_eligibility.eligible=true` (FanRelay / FanPWM / FanDAC), cross-checks the pinned `firmware/sources.json` source + on-disk state, and imports the missing ones behind uniform guardrails (eligibility flag, preview channel, mandatory SHA256 pin, upstream checksum match, TRIAC refusal, overwrite protection, idempotency, `REQUIRED_CONFIGS`-unchanged assertion). Used it to import the last eligible fan-driver preview — `Ceiling-POE-FanDAC` (SHA256 `151894c1…a39b9f`, 930,400 bytes) — as an **Advanced-install-only preview**. Added 1 `firmware/sources.json` entry (`channel: preview`, pinned `expected_sha256`, `block_tokens: ["FanTRIAC", "LED"]`), staged the `.bin` + `.meta.json`, regenerated `manifest.json` (8→9 builds) + `firmware-*.json`. Flipped `Sense360 DAC` (S360-312) `no-firmware`→`available-preview` with bespoke installer/developer-preview copy (0–10V analog fan control). Mirrored the FanDAC row into the catalog fixture (`status: hardware-pending` + eligibility object); the existing manual-preview lane already recognises the flag (no validator change). Added `__tests__/python/test_import_preview_eligible_sources.py` (23 tests: discovery, idempotency, FanDAC import, TRIAC refusal, missing-config skip, mandatory pin, overwrite block, REQUIRED_CONFIGS-unchanged, preview-channel posture). Added `docs/preview-import-automation-proof.md`; updated `docs/webflash-import-readiness-matrix.md`, `docs/sense360-webflash-status.md`, `docs/live-smoke-preview-import.md`, `CHANGELOG.md`. Rebaselined the build-count / source-list test pins (9 builds; FanDAC dropped from the forbidden-fan-token guards). | `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js` (no FanDAC card), Release-One stable + first preview batch + VentIQ LED preview + FanRelay preview + FanPWM preview + Rescue build **content** (signatures/hashes/sizes/channel/version byte-identical; only `source_commit`/`source_url`/`build_date` provenance refreshed), `scripts/import-firmware-sources.py` (reused unchanged), `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, the install gate / preflight / freshness engines, `scripts/simple-install.js`, `sw.js`, `_headers`, `index.html`, every CSS, every `.github/workflows/*` file. FanTRIAC import block, WF-LED-003 preview acknowledgement model, WF-TRIAC-001 advanced/manual-warning gate all stand. **No FanTRIAC imported. No hardware / bench / compliance / safety / commercial-availability proof claimed.** | FanDAC reachable in the Advanced (custom) path behind the existing `channel:preview` acknowledgement; Simple install unchanged (stable Bathroom PoE only). The next eligible preview is now a one-command, fully-guarded operation. FanTRIAC stays build-blocked. |
| WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 | _(open — PR # to fill at merge)_ | In review | Expanded the Simple-install bundle picker to **declare and import-gate** the five full-composition fan-control room bundles from upstream `ROOM-BUNDLE-FAN-CONFIGS-001` (#713): `S360-KIT-BATH-P-PWM` (→ `Ceiling-POE-VentIQ-FanPWM-RoomIQ`), `S360-KIT-BATH-P-DAC` (→ `Ceiling-POE-VentIQ-FanDAC-RoomIQ`), `S360-KIT-KITCHEN-P-REL` (→ `Ceiling-POE-AirIQ-FanRelay-RoomIQ`), `S360-KIT-KITCHEN-P-PWM` (→ `Ceiling-POE-AirIQ-FanPWM-RoomIQ`), `S360-KIT-KITCHEN-P-DAC` (→ `Ceiling-POE-AirIQ-FanDAC-RoomIQ`). Added `FAN_CONTROL_BUNDLES` + the import-readiness gate (`isFanControlBundleImportReady` / `getExposableFanControlBundles` / `isFullRoomBundle` / `validateFanControlBundle` / `bundleRequiresDacAddressAcknowledgement`) to [`scripts/data/simple-bundles.js`](scripts/data/simple-bundles.js); extended [`scripts/simple-install.js`](scripts/simple-install.js) to inject import-ready fan cards into the picker (none today) and AND a third **analog-fan address-switch** acknowledgement into the authoritative pre-flash gate; added the staged `[data-simple-bundle-dac-address]` region (0x58 / 0x5A / forbidden 0x59 copy) to [`index.html`](index.html); published the live manifest config_string set as the additive `window.webflashManifestConfigStrings` global from `scripts/state.js`. Bumped `CACHE_NAME` (`webflash-v13`) + cache-bust token (`202606016`) + app-shell marker (`2026-06-01-6`). Added `__tests__/wf-easy-bundle-picker-fan-expansion.test.js` (26 assertions) + `docs/live-smoke-easy-bundle-picker-fan-expansion.md`; updated `docs/live-smoke-easy-bundle-picker.md`, `docs/webflash-import-readiness-matrix.md`, `docs/sense360-webflash-status.md`, `UPCOMING_PR.md`, `CHANGELOG.md`. | **No firmware imported.** Every firmware binary, `manifest.json` (still 9 builds), every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/kit-presets.js`, `scripts/data/module-requirements.js`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `scripts/utils/module-availability.js`, the install gate / preflight / provenance / signature / freshness engines, and every `.github/workflows/*` file are unchanged. The six base bundle cards + the stable Bathroom PoE default are unchanged. | **None of the five fan-control cards is exposed today** — upstream #713 published no firmware (`compile_validation_status: pending-ci`, `buildable-preview-compile-pending`, no `.bin`, no release), so the gate keys off the live manifest and shows exactly the six base bundles. The definitions + gate + acknowledgement plumbing are staged so a future per-config firmware-import PR lights up the matching card automatically. TRIAC stays excluded. FanDAC address policy `FANDAC-I2C-ADDR-001` remains PENDING (referenced only in docs/developer fields). **No preview bundle made stable / default / recommended / buyable. No hardware / bench / compliance / safety / commercial-availability proof claimed; the FanDAC address switch is not claimed physically verified.** |
| WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 | _(open — PR # to fill at merge)_ | In review | **Docs + test only.** Added the consolidated current-state live / manual smoke checklist for the deployed Simple-install bundle picker at [`docs/live-smoke-easy-bundle-picker-current.md`](docs/live-smoke-easy-bundle-picker-current.md) and the deterministic guard [`__tests__/wf-easy-bundle-picker-live-smoke.test.js`](__tests__/wf-easy-bundle-picker-live-smoke.test.js). The guard pins the live end-state: `manifest.json` carries nine builds; all six base bundles (`S360-KIT-BATH-P` → `Ceiling-POE-VentIQ-RoomIQ` stable default, `S360-KIT-KITCHEN-P` → `Ceiling-POE-AirIQ-RoomIQ`, `S360-KIT-BEDROOM-P` → `Ceiling-POE-RoomIQ`, `S360-KIT-LIVING-P` + `S360-KIT-CORRIDOR-P` → `Ceiling-POE-RoomIQ-LED`, `S360-KIT-BATH-P-REL` → `Ceiling-POE-VentIQ-FanRelay-RoomIQ`) resolve to a live build; the five fan-control expansion configs (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `Ceiling-POE-VentIQ-FanDAC-RoomIQ`, `Ceiling-POE-AirIQ-FanRelay-RoomIQ`, `Ceiling-POE-AirIQ-FanPWM-RoomIQ`, `Ceiling-POE-AirIQ-FanDAC-RoomIQ`) are absent so `getExposableFanControlBundles` is empty; a synthetic manifest exposes a fan card only on its exact full-composition config; the standalone `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` previews present in the manifest never become a Simple card; TRIAC is absent everywhere; the stable Bathroom PoE build is the only default-selectable build with no freshness false-blocker; preview bundles stay `channel:preview`-gated. Updated [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md) with the smoke-record section. | **No firmware imported.** Every firmware binary, `manifest.json` (still 9 builds), every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/simple-bundles.js`, `scripts/simple-install.js`, `scripts/data/kit-presets.js`, `scripts/utils/release-channels.js`, `scripts/utils/module-availability.js`, the install gate / preflight / provenance / signature / freshness engines, `index.html`, every CSS file, `sw.js` (cache name / cache-bust token unchanged), and every `.github/workflows/*` file are byte-identical. No hidden fan-control card exposed, no standalone fan / TRIAC card exposed, no preview made stable / recommended / default, no acknowledgement weakened. | Realizes the bundle-picker slice of the planned `WF-LIVE-SMOKE-SIMPLE-INSTALL-001` row below: the deployed picker end-state is now machine-verified after the picker + fan-expansion + fan-driver-preview PRs. A human incognito visual pass on `https://sense360store.github.io/WebFlash/` is the recommended (non-blocking) confirmation. No new `REQUIRED_CONFIGS` / kit entry; fan-control expansion cards stay hidden until their firmware is imported. |
| WF-FAN-BUNDLE-IMPORT-READINESS-001 | _(open — PR # to fill at merge)_ | In review | **Docs + test only — readiness prep for the five future full-composition fan-control bundle artifacts (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `Ceiling-POE-VentIQ-FanDAC-RoomIQ`, `Ceiling-POE-AirIQ-FanRelay-RoomIQ`, `Ceiling-POE-AirIQ-FanPWM-RoomIQ`, `Ceiling-POE-AirIQ-FanDAC-RoomIQ`).** Added the non-runtime readiness descriptor [`scripts/data/fan-bundle-import-readiness.js`](scripts/data/fan-bundle-import-readiness.js) (derived from `FAN_CONTROL_BUNDLES` so it cannot drift) declaring, per future artifact, the expected `config_string`, expected canonical artifact filename (`Sense360-<config>-v1.0.0-preview.bin`) + `.meta.json` sidecar, expected `channel: preview`, expected `block_tokens: ["FanTRIAC", "LED"]`, the full room-bundle flag, the Simple-picker card gate, and the required acknowledgements (preview + fan-control, plus the analog address-switch acknowledgement naming `0x58` / `0x5A` / forbidden `0x59` for the two FanDAC bundles), plus `buildExpectedSourceEntry` (a ready-to-fill `firmware/sources.json` skeleton with everything **except** the human-pinned `expected_sha256`), `validateFanBundleImportExpectation`, and `getFanBundleImportReadinessReport`. Added the test pin [`__tests__/wf-fan-bundle-import-readiness.test.js`](__tests__/wf-fan-bundle-import-readiness.test.js) (33 assertions: expected-shape integrity, naming-policy-conformant filenames, source-entry skeleton vs. a real preview entry minus the pin, FanDAC `0x58`/`0x5A`/`0x59` copy, synthetic manifest exposes exactly the matching card, source-without-manifest stays hidden, standalone fan-only + TRIAC never expose a card, no stable/default/recommended/buyable, live REQUIRED_CONFIGS / manifest / sources / kits / on-disk unchanged). Updated [`docs/webflash-import-readiness-matrix.md`](docs/webflash-import-readiness-matrix.md), [`docs/live-smoke-easy-bundle-picker-fan-expansion.md`](docs/live-smoke-easy-bundle-picker-fan-expansion.md), [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md), `CLAUDE.md`. | **No firmware imported.** Every firmware binary, `manifest.json` (still 9 builds), every `firmware-*.json`, `firmware/sources.json`, `REQUIRED_CONFIGS` (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`, production-only), `scripts/data/kits.json` (Release-One-only), `scripts/data/simple-bundles.js`, `scripts/simple-install.js`, `scripts/data/kit-presets.js`, `scripts/utils/release-channels.js`, `scripts/utils/module-availability.js`, `scripts/validate-product-import-readiness.js`, `scripts/import-firmware-sources.py`, `scripts/import-preview-eligible-sources.py`, `__tests__/fixtures/esphome-product-catalog.json`, the install gate / preflight / provenance / signature / freshness engines, `index.html`, every CSS file, `sw.js` (cache name / SCRIPT_MODULES unchanged — the readiness module is non-runtime), and every `.github/workflows/*` file are byte-identical. | None of the five fan-control cards is exposed (still no artifact). The readiness descriptor + test make the future per-config import PR (`WF-IMPORT-FAN-BUNDLES-001`) small and mechanical: copy the source-entry skeleton, pin the published artifact's SHA-256, run the importer + `gen-manifests.py`, and the matching card lights up. No acknowledgement weakened (the analog address-switch gate is strictly additive). TRIAC stays build-blocked. **No preview made stable / default / recommended / buyable. No hardware / bench / compliance / safety / commercial-availability proof claimed.** |

## Active / upcoming WebFlash queue

Priority-ordered. Update the **Status** column in-place as each PR is opened
or lands, then move the row to **Completed / merged** on merge.

### Standing blockers / invariants

These gate every item below and must not be regressed by any queue PR:

- **WebFlash cannot import new preview builds until upstream artifacts
  exist.** Every `WF-IMPORT-…` / `WF-PREVIEW-IMPORT-…` item below is blocked
  until `sense360store/esphome-public` publishes the corresponding
  `RELEASE-…` artifact (signed-able `.bin` + checksum + catalog promotion).
  No speculative import.
- **Simple install remains stable Bathroom PoE only.** The default Simple
  install path resolves only to Release-One `Ceiling-POE-VentIQ-RoomIQ`
  (stable, v1.0.0). No preview, fan, or advanced build is selectable from
  Simple install.
- **Preview / advanced-preview appears only in Advanced install.** The LED
  preview (and any future preview/advanced-preview artifact) is reachable
  only through Advanced install behind the existing `channel:preview`
  acknowledgement; it is never auto-selected and never enters the Simple
  path.
- **TRIAC remains advanced / manual only.** Sense360 TRIAC (S360-320) stays
  `advanced-manual-warning` — not recommended, not default, not a kit, not
  auto-selected, not in `REQUIRED_CONFIGS`, not import-allowed (the
  `block_tokens` import block stands), and not compliance-certified.

### Queue

0. **WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — Verify live WebFlash after the preview
   import.**
   Status: **PR open — docs + test only.**
   Purpose: Add and run a live / manual smoke checklist for the deployed
   GitHub Pages site after the first preview firmware batch
   (`WF-PREVIEW-IMPORT-FIRST-BATCH-001`) landed. Confirms **Simple install
   stays clean and stable-only** (`Ceiling-POE-VentIQ-RoomIQ`, no false
   freshness block, no AirIQ / room-bundle preview leakage) while **Advanced
   install can reach the new preview builds** (`Ceiling-POE-AirIQ-RoomIQ`,
   `Ceiling-POE-RoomIQ`, `Ceiling-POE-RoomIQ-LED`) behind the `channel:preview`
   acknowledgement with working in-card release notes. Adds the checklist +
   manual verification template at
   [`docs/live-smoke-preview-import.md`](../docs/live-smoke-preview-import.md)
   and the deterministic guard
   [`__tests__/live-smoke-preview-import.test.js`](../__tests__/live-smoke-preview-import.test.js)
   (exactly eight builds after WEBFLASH-PWM-001, preview Advanced-only /
   acknowledgement-gated, Simple resolves only to stable Bathroom PoE, preview
   release notes present, no DAC / TRIAC fan-driver import — FanRelay + FanPWM
   excepted, AirIQ availability derived from the manifest, VentIQ LED preview
   preserved, Rescue available). Extends the Simple-only
   `WF-LIVE-SMOKE-SIMPLE-INSTALL-001` row below into the preview-import surface.
   Dependencies: None — `WF-PREVIEW-IMPORT-FIRST-BATCH-001` merged (#468). A
   human incognito visual pass is the recommended (non-blocking) confirmation.
   Note: **Docs / test only.** No firmware imported, no Simple-install default
   changed, no preview made recommended/default/stable, no candidate bundle
   exposed as buyable, no TRIAC / fan-driver import, no provenance / signature /
   freshness check weakened, no preview warning removed, and the existing
   VentIQ LED preview was not overwritten.

1. **WF-LIVE-SMOKE-SIMPLE-INSTALL-001 — Verify the live Simple install
   end-state.**
   Status: **Ready — next real work (no upstream dependency).**
   Purpose: Verify the deployed GitHub Pages
   (`https://sense360store.github.io/WebFlash/`) Simple install now reflects
   the merged #454–#466 end-state — **no false freshness warning** (freshness
   `unknown` is non-blocking; only a genuine `stale` hard-blocks), **View
   Release Notes opens** in-card, the **Install button becomes available**
   after the single safety confirmation, and **technical details are
   collapsed** by default behind the hero disclosure. Record the result as a
   live-smoke doc under `docs/release-gates/` (extends the existing
   `WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001` pattern). Docs-only; opens a
   targeted follow-up only if the live page diverges from the merged source.
   Dependencies: None — the fixes are merged and deployed. A human incognito
   visual pass is the recommended (non-blocking) confirmation.
   Note: The **bundle-picker slice** of this verification is now covered by
   `WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001` (see the In review table above) —
   [`docs/live-smoke-easy-bundle-picker-current.md`](../docs/live-smoke-easy-bundle-picker-current.md)
   + [`__tests__/wf-easy-bundle-picker-live-smoke.test.js`](../__tests__/wf-easy-bundle-picker-live-smoke.test.js)
   pin the current six-card / stable-default / fan-expansion-hidden end-state.

2. **WF-PREVIEW-IMPORT-POLICY-001 — Prepare WebFlash import rules for upstream
   preview artifacts.**
   Status: **Planned / policy (docs-only; no artifact yet).**
   Purpose: Define — *before* any preview artifact exists — the WebFlash
   import rules for upstream preview builds: the required upstream proof
   fields, the `firmware/sources.json` source-entry shape (`channel: preview`,
   `block_tokens`, pinned `expected_sha256`), the importer →
   `gen-manifests.py` → sign → deploy sequence, the Advanced-install-only
   exposure contract (preview never enters Simple install or
   `REQUIRED_CONFIGS`), and the do-not-change list. Reuses the
   `docs/webflash-import-readiness-matrix.md` + `docs/product-import-readiness.md`
   contracts.
   Dependencies: None to author (docs/policy). Gates
   WF-PREVIEW-IMPORT-FIRST-BATCH-001.
   Note: **Policy only — imports nothing.** No firmware, manifest, sources,
   `REQUIRED_CONFIGS`, or kit change.

3. **WF-PREVIEW-IMPORT-FIRST-BATCH-001 — Import the first upstream preview
   artifacts.**
   Status: **Blocked — upstream preview artifacts do not exist yet.**
   Purpose: Import the first batch of upstream preview `.bin` + `.meta.json`
   artifacts once they are published, following WF-PREVIEW-IMPORT-POLICY-001:
   add the `firmware/sources.json` source entries, regenerate `manifest.json`
   + per-build manifests, expose in Advanced install behind the preview
   acknowledgement. **Not before the artifacts exist.**
   Dependencies: Upstream `sense360store/esphome-public` preview
   `RELEASE-…` artifacts **and** WF-PREVIEW-IMPORT-POLICY-001 merged.
   Note: **Not `REQUIRED_CONFIGS`, not Simple install, not a kit.** Preview
   is import / manifest / kit-eligible but never `REQUIRED_CONFIGS`-eligible.

4. **WF-ADVANCED-PREVIEW-TRIAC-GATE-001 — Define the advanced/manual TRIAC
   preview warning UX before import.**
   Status: **Planned / UX policy (docs-only; pre-import).**
   Purpose: Define the advanced/manual warning UX for a future TRIAC
   *preview* artifact **before** any import — how the existing WF-TRIAC-001
   `advanced-manual-warning` acknowledgement region, copy, and install-gate
   clause extend to a preview-channel TRIAC build in Advanced install, so the
   warning + acknowledgement + non-default + non-recommended + non-kit
   guarantees are pinned ahead of `WF-IMPORT-TRIAC-001`.
   Dependencies: None to author (extends the shipped WF-TRIAC-001 UX). Sits in
   front of `WF-IMPORT-TRIAC-001`, which still requires upstream
   `RELEASE-TRIAC-001`.
   Note: Advanced/manual-warning is an in-installer warning gate, **not** a
   compliance certification claim.

5. **WF-HW-TEST-002 follow-up — Complete LED preview operator flash proof.**
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

6. **WF-LED-STABLE-001 — Stable LED WebFlash import.**
   Status: **Blocked by stable artifact.**
   Purpose: Import a stable-channel LED `.bin` (+ `.meta.json` sidecar)
   when upstream ships one; add a second source entry / regenerate
   manifests under the existing importer contract.
   Dependencies: Upstream `sense360store/esphome-public` `RELEASE-007`
   (LED stable build + catalog promotion to `status: production`).

7. **WF-REQUIRED-001 — Decide whether LED stable becomes `REQUIRED_CONFIGS`.**
   Status: **Separate decision.**
   Purpose: After WF-LED-STABLE-001 lands, decide whether the stable
   LED config joins the production-only `REQUIRED_CONFIGS` allowlist.
   Dependencies: WF-LED-STABLE-001 merged.
   Note: **Stable does not automatically mean `REQUIRED_CONFIGS`.**
   `REQUIRED_CONFIGS` is the deploy-allowlist and carries WF-PRODUCT-004
   eligibility rules independent of catalog status.

8. **WF-KIT-LED-001 — Decide LED kit / recommended bundle exposure.**
   Status: **Separate UX / product decision.**
   Purpose: Decide whether to add an LED-bearing kit to
   `scripts/data/kits.json` and/or surface LED in the recommended
   bundle / quick-start preset.
   Dependencies: Operator hardware proof (WF-HW-TEST-002 follow-up
   complete) and/or stable promotion (WF-REQUIRED-001). Either
   precondition is sufficient for the decision; both should be
   considered before exposure changes.

9. **WF-IMPORT-RELAY-001 / WEBFLASH-RELAY-001 — Import FanRelay preview artifact.**
   Status: **Done — landed as WEBFLASH-RELAY-001 (this PR).**
   Imported the S360-310 FanRelay preview `.bin` + sidecar
   (`Ceiling-POE-VentIQ-FanRelay-RoomIQ`, from upstream `v1.0.0-preview`),
   added the source entry with `block_tokens: ["FanTRIAC", "LED"]`, and
   regenerated manifests (6 → 7 builds). Unblocked **not** by a catalog
   `status: preview` promotion but by upstream #711
   (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`), which set
   `webflash_import_eligibility.eligible=true` in
   `config/preview-release-targets.json` while keeping catalog status
   `hardware-pending`. WebFlash recognises that explicit flag for import /
   manifest / kit eligibility.
   Note: **Not `REQUIRED_CONFIGS`, not a kit, not recommended, not default.**
   WF-PRODUCT-004 classifies preview / import-eligible entries as import /
   manifest / kit eligible but never `REQUIRED_CONFIGS`-eligible.

10. **WF-IMPORT-PWM-001 / WEBFLASH-PWM-001 — Import FanPWM preview artifact.**
    Status: **Done — landed as WEBFLASH-PWM-001 (this PR).**
    Imported the S360-311 FanPWM preview `.bin` + sidecar
    (`Ceiling-POE-FanPWM`, from upstream `v1.0.0-preview`), added the source
    entry with `block_tokens: ["FanTRIAC", "LED"]`, and regenerated manifests
    (7 → 8 builds). Unblocked — like FanRelay — **not** by a catalog
    `status: preview` promotion but by upstream #711
    (`RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001`)'s
    `webflash_import_eligibility.eligible=true` signal while catalog status
    stays `hardware-pending`.
    Note: **Not `REQUIRED_CONFIGS`, not a kit, not recommended, not default.**
    Preview / import-eligible entries are import / manifest / kit eligible but
    never `REQUIRED_CONFIGS`-eligible.

11. **WF-IMPORT-DAC-001 — Import FanDAC preview artifact. ✅ Done**
    (as **WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001** — see the In review table above).
    The S360-312 FanDAC preview `.bin` + sidecar were imported via the new
    preview-eligible import automation, authorised — like FanRelay / FanPWM — by
    upstream #711's `webflash_import_eligibility.eligible=true` signal (the
    manual-preview lane), **not** by a stable `RELEASE-DAC-001` promotion. Stable /
    full release stays blocked behind upstream `RELEASE-DAC-001`.
    Note: **Not `REQUIRED_CONFIGS`, not a kit, not recommended, not default.**

12. **WF-IMPORT-POWER-400-001 — Import S360-400 artifact.**
    Status: **Blocked.**
    Purpose: Import Sense360 240v PSU (S360-400) artifact if upstream
    ships a separate build (the current Release-One already covers
    `power=ac` transitively via the Ceiling-POE-VentIQ-RoomIQ source).
    Dependencies: Upstream `RELEASE-POWER-400-001`.

13. **WF-IMPORT-POE-410-001 — Import S360-410 artifact.**
    Status: **Blocked / likely no-op unless a separate PoE release
    exists.**
    Purpose: Same shape as item 12, for Sense360 PoE PSU (S360-410). PoE
    is currently covered transitively by both Release-One and LED
    preview (`power=poe`); a dedicated import is only opened if
    upstream ships a distinct PoE artifact.
    Dependencies: Upstream `RELEASE-POE-410-001`.

14. **WF-IMPORT-TRIAC-001 — Import FanTRIAC advanced/manual artifact.**
    Status: **Blocked.**
    Purpose: Import S360-320 FanTRIAC `.bin` + sidecar; lift the
    importer-level `FanTRIAC` block on the specific imported source
    entry (the other source entries' `block_tokens` stay).
    Dependencies: Upstream `RELEASE-TRIAC-001`, the advanced/manual-warning
    policy already shipped by WF-TRIAC-001, **and**
    WF-ADVANCED-PREVIEW-TRIAC-GATE-001 (item 4).
    Note: **Not `REQUIRED_CONFIGS`, not kit, not recommended.** WF-TRIAC-001
    is an in-installer warning gate, not a compliance certification claim;
    `WF-IMPORT-TRIAC-001` does not by itself unlock production exposure.

15. **WF-PRODUCT-005 — Enforce deprecated/removed import-readiness policy.**
    Status: **Planned / policy follow-up.**
    Purpose: Extend `scripts/validate-product-import-readiness.js`
    and the Jest pin to actively enforce the `deprecated` / `removed`
    catalog statuses (today they classify as ineligible across all
    four dimensions but the rule is asserted only at the
    classification layer).
    Dependencies: Upstream `sense360store/esphome-public`
    `PRODUCT-DEP-002`, **or** the first actual upstream
    `deprecated` / `removed` catalog entry (whichever arrives first).

16. **WF-IMPORT-FAN-BUNDLES-001 — Import the five full-composition fan-control
    room-bundle artifacts.**
    Status: **Blocked — upstream artifacts do not exist yet** (compile proof
    recorded upstream #716; publication planned upstream #717; no `.bin`/release
    published). Readiness prepared by **WF-FAN-BUNDLE-IMPORT-READINESS-001** (see
    the In review table above).
    Purpose: Once upstream publishes the five preview `.bin` artifacts
    (`Ceiling-POE-VentIQ-FanPWM-RoomIQ`, `Ceiling-POE-VentIQ-FanDAC-RoomIQ`,
    `Ceiling-POE-AirIQ-FanRelay-RoomIQ`, `Ceiling-POE-AirIQ-FanPWM-RoomIQ`,
    `Ceiling-POE-AirIQ-FanDAC-RoomIQ`), import them by copying the
    `scripts/data/fan-bundle-import-readiness.js` source-entry skeleton into
    `firmware/sources.json`, pinning each published artifact's `expected_sha256`,
    running the importer + `scripts/gen-manifests.py`, and committing the
    regenerated `manifest.json` + per-build manifests. The matching Simple-install
    cards light up automatically via the existing `getExposableFanControlBundles`
    gate.
    Dependencies: Upstream publication of the five fan-bundle artifacts (after
    upstream #717).
    Note: **Preview-only, Advanced-install-only.** Not `REQUIRED_CONFIGS`, not a
    kit, not recommended, not default, never buyable. Each gates on preview +
    fan-control acknowledgements (the two FanDAC bundles also on the analog
    address-switch acknowledgement). TRIAC stays build-blocked.

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
  therefore WF-IMPORT-POWER-400-001 (queue item 12).
- **`HW-ASSETS-410` / `HW-PINMAP-410-FOLLOWUP`** — S360-410 (PoE PSU)
  hardware assets and pinmap; precedes `RELEASE-POE-410-001` and
  therefore WF-IMPORT-POE-410-001 (queue item 13).
- **`package/` / `product/` / `WebFlash-upstream/` / `release/` slices** —
  the upstream packaging, product-catalog, WebFlash-bridge, and
  release-orchestration slices that feed every WebFlash import. Any
  WebFlash queue item that says "Dependencies: upstream `RELEASE-…`"
  ultimately resolves through these slices.
- **`RELEASE-007`** — LED stable release; gates WF-LED-STABLE-001
  (queue item 6) and, downstream, the `REQUIRED_CONFIGS` decision
  (WF-REQUIRED-001, queue item 7) and any LED-bearing kit
  (WF-KIT-LED-001, queue item 8).
- **`WEBFLASH-RELEASE-MATRIX-ALIGNMENT-001`** — upstream docs-only
  reconciliation at
  [`docs/release-matrix-webflash-alignment.md`](https://github.com/sense360store/esphome-public/blob/main/docs/release-matrix-webflash-alignment.md)
  that produces the canonical cross-layer release matrix (bundle SKU ·
  config · YAML · channel · compile · artifact · release-note · WebFlash ·
  blocker · notes), classifies every target, and records WebFlash exposure.
  It confirms the WebFlash-side state this repo already implements: exactly
  `Ceiling-POE-VentIQ-RoomIQ` (stable) + `Ceiling-POE-VentIQ-RoomIQ-LED`
  (preview, manifest-only under WF-LED-003) + `Rescue` are exposed; no fan
  driver is exposed. **No WebFlash change is required by this upstream PR** —
  no import, no `manifest.json` / `firmware/sources.json` edit, no
  `REQUIRED_CONFIGS` change, no kit, no UI change. Reference only.

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
