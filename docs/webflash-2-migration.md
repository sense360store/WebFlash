# WebFlash 2.0 Migration Plan

Status: proposal. Owner: Neil. Target: replace the WebFlash 1.0 production
installer (repo root) with the WebFlash 2.0 redesign, without regressing the
trust model, release-channel gating, provenance gate, freshness/cache gating,
or accessibility.

This document is the controlling plan for the move. It defines the architecture
decision, the simulation-to-real mapping, the data-model corrections, the PR
sequence, the cutover, and the GA acceptance gates.

---

## 1. Current state

### What landed in PR #477 (merged)

PR #477 added a standalone design preview at `/webflash-2/`, ported from the
Claude Design handoff into vanilla ES modules (`scripts/h.js` hyperscript, no
React, no Babel, no build step). It is deliberately isolated from production:
it does not touch `index.html`, `sw.js`, `_headers`, `manifest.json`, or
`firmware/`.

Everything user-visible in the preview is simulated:

* Readiness checklist resolves on `setTimeout`, not on real checks.
* Flash progress is a `requestAnimationFrame` ring plus a hardcoded esptool
  console (`FLASH_PHASES`). It does not drive Web Serial or ESP Web Tools.
* Wi-Fi scan and connect are `setTimeout` with a hardcoded `NETWORKS` array.
  No real Improv Serial.
* Kit picker hardcodes two kits in `data.js`. It does not load `kits.json`.
* `buildTarget()` invents a target string and does not resolve against the
  manifest.

Two defects are already flagged by the Codex review on #477 and must be fixed
regardless of the migration:

1. TRIAC is not gated. `installable: false` only renders a note. The card is
   selectable and Continue only checks power plus sensing, so the user can
   reach the install flow for a target the UI says is not installable.
2. Preview gating is lost in advanced mode. `computeDevice()` hardcodes
   `isPreview: false`, so a preview-only selection (for example the LED ring)
   reaches Step 2 with no preview acknowledgement.

### What WebFlash 1.0 already provides (the engine)

The production installer is a mature trust system. None of this should be
rebuilt:

* `scripts/state.js`: central state machine, compatible-firmware lookup,
  SHA-256 verification of downloaded bytes via SubtleCrypto, the cache
  freshness policy matrix, acknowledgement prune-on-mismatch, post-flash
  validation states.
* `scripts/utils/release-channels.js`: seven-tier channel model (stable, beta,
  preview, development, recovery, deprecated, plus the recommended flag), the
  alias map, `getFirmwareAcknowledgementSignature`, `pickDefaultEligibleBuilds`.
* `scripts/utils/firmware-provenance.js`: `validateFirmwareProvenance(build)`,
  stable `CHECK_IDS`, the blocking install gate, the machine-readable result
  shape.
* `scripts/services/manifest-freshness.js`: re-fetch with `cache: 'no-store'`,
  current/stale/unknown verdict.
* `scripts/services/sw-update.js` and `scripts/services/cache-clear.js`:
  service-worker update detection and cache clearing.
* `scripts/data/kits.json` plus the kit-config loader (`loadKitCatalog`): kit
  catalogue, shareable links (`?configmode=kit&sku=`), the diagnostics
  configuration block, malformed-entry skipping.
* `scripts/utils/a11y.js`: focus trap, live regions (`announce`), focusable
  enumeration, plus the stepper and modal semantics.
* The support diagnostics bundle (`schema_version: 1`, full redaction).
* ESP Web Tools (`unpkg.com/esp-web-tools@10`): the actual flasher, Improv
  Serial provisioning, and the post-flash signal source.
* `sw.js` (`CACHE_NAME = webflash-v4`), `_headers`, and the CSP meta in
  `index.html`.
* The publishing pipeline: `.github/workflows/firmware-publish.yml`
  (`REQUIRED_CONFIGS`), `scripts/gen-manifests.py`,
  `scripts/import-firmware-sources.py`, `scripts/sync-from-releases.py`.
* Rescue/recovery (`?mode=recovery`) and development (`?mode=development`).

---

## 2. The decision: 2.0 is a view over the 1.0 engine

The 2.0 deliverable is a presentation layer. The 1.0 codebase is the logic and
trust layer. The migration binds the 2.0 view to the existing engine and
deletes each simulation as the real module is wired in.

**Chosen approach (A): adopt the 2.0 view over the 1.0 engine behind a flag,
then cut over.**

* Keep `state.js`, `utils/*`, `services/*`, the manifest pipeline, ESP Web
  Tools, `sw.js`, the CSP, and `kits.json` unchanged.
* Replace the 1.0 render layer with the 2.0 components, which are already
  vanilla ESM after #477.
* Ship behind a flag (`?ui=2`) at the same origin so it inherits the CSP, the
  service worker, the manifest, and the headers. Flip the default once parity
  holds, keep `?ui=1` as the rollback for one release, then remove the old view.

**Rejected approach (B): build a parallel backend for `/webflash-2/`.** This
duplicates the trust model, doubles the audit surface, and reintroduces exactly
the failures the 1.0 gate prevents. The value of this repo is the gate. Forking
it is the wrong move.

The seam is: the engine modules expose a view-agnostic API; the view renders
state and calls engine actions; the view never owns a gating decision.

---

## 3. Simulation-to-real mapping

Every simulated surface in the 2.0 preview maps to an existing 1.0 module. This
table is the build backlog.

| 2.0 simulation (file) | Real 1.0 module to bind to |
| --- | --- |
| Readiness checklist, `setTimeout` to OK (`install.js` `Readiness`, `CHECKS`) | Real preflight: browser support, secure context, manifest freshness (`manifest-freshness.js`), firmware verification (`firmware-provenance.js` plus SHA-256 in `state.js`), device detection over Web Serial |
| "Signature valid, ed25519 dev-2026-01" (`data.js` `CHECKS.verify`) | Incorrect claim. Must become "signature metadata present" with `signature_verified: skip`. See Section 8 |
| Flash progress ring plus fake esptool console (`install.js` `FlashProgress`, `FLASH_PHASES`) | ESP Web Tools install-button lifecycle events mapped to the ring and console |
| Pre-flight all pass enables install (`install.js`) | Composite install gate: provenance, freshness, SW-update, channel acknowledgement, before-you-flash acknowledgement |
| Preview acknowledgement, binary (`install.js`, `app.js`) | Full seven-tier release-channel acknowledgement, bound to the firmware-identity signature |
| Wi-Fi scan and connect, `setTimeout` plus `NETWORKS` (`connect.js`) | Improv Serial via ESP Web Tools. SSID and password never read, logged, or stored |
| Success "done" screen (`connect.js`) | Post-flash validation panel (eight states), Home Assistant handoff only when `improv: true` |
| Kit picker, two hardcoded kits (`data.js` `KITS`) | `kits.json` plus `loadKitCatalog`, including sample and skipped handling |
| `buildTarget()` returns `S360-CEIL-POE-VENTIQ-ROOMIQ` (`data.js`) | Must resolve to a manifest `config_string` (for example `Ceiling-POE-VentIQ-RoomIQ`). See Section 4 |
| Advanced builder conflicts (`identify.js`) | `state.js` AirIQ/VentIQ exclusivity, AirIQ/DAC conflict, bathroom toggle |
| "Rescue" topbar button, no-op (`app.js` `Topbar`) | The real `?mode=recovery` rescue path plus the rescue binary |
| Theme toggle (`app.js`) | Keep. Align to the 1.0 `theme.css` including reduced motion |
| No diagnostics | The support bundle (`schema_version: 1`, redaction) |
| No accessibility (focus trap, live regions, stepper aria) | `a11y.js` patterns, `aria-current="step"`, skip-to-content link |
| No SW, freshness, or cache-clear | `sw.js`, `manifest-freshness.js`, `sw-update.js`, `cache-clear.js` |
| React 18 plus Babel standalone from unpkg (handoff HTML) | Already resolved by #477's vanilla ESM port. Do not reintroduce |

---

## 4. Data-model corrections required

These are correctness fixes in `webflash-2/scripts/data.js`. They block any
real install binding because the view must speak the same identifiers as the
manifest and the canonical SKU table.

1. **240V PSU SKU is wrong.** `data.js` lists `S360-420`. The canonical SKU is
   `S360-400`, selected via `power=pwr`. Fix the SKU.
2. **Power identifier mismatch.** `data.js` uses `id: "240v"`. The engine uses
   `power=pwr`. Align to `pwr`, or map `240v` to `pwr` at the seam. Do not let
   two identifiers diverge.
3. **`buildTarget()` output diverges from the manifest.** The preview emits an
   uppercased `S360-CEIL-...` string. The manifest resolves builds by
   `config_string` (for example `Ceiling-POE-VentIQ-RoomIQ`). The view must use
   the 1.0 compatible-firmware lookup rather than inventing a target. Either
   remove `buildTarget()` and call the engine lookup, or make it emit the
   canonical `config_string`.
4. **Kit-to-firmware resolution.** The 2.0 kits carry only `target:
   "S360-KIT-BATH-POE"`, which is the kit SKU namespace (correct), but the
   manifest lookup needs the kit's `firmware_config_string`. Bind 2.0 kits to
   `kits.json` entries, which carry `wizard_state` plus `firmware_config_string`.
5. **Installability gating must follow the release gates.** Only the Bathroom
   PoE kit is installable on the stable path. Bathroom PoE plus LED is preview.
   Fan-control variants (relay, TRIAC, PWM, DAC) and room bundles are blocked or
   planned, and the mains boards ship open-source only with no signed WebFlash
   build. The advanced builder must block install for any configuration with no
   installable stable or preview build, and route the user to the ESPHome
   source path instead. This subsumes the TRIAC bug.
6. **Minor doc consistency.** AirIQ HCHO is SFA40, not SFA30. The 1.0 README has
   a stale SFA30 mention in one place. Low priority, fold into a docs PR.

---

## 5. PR sequence

Phased so 1.0 keeps working at every step and each subsystem is reviewable on
its own. Each PR states its acceptance condition.

### Phase 0: decision and scaffolding

* **PR 0. Migration decision doc.** Commit this file as
  `docs/webflash-2-migration.md`, plus a short ADR recording approach A and the
  view/engine boundary contract. Accept: doc merged, boundary agreed.

### Phase 1: make the merged preview honest (cheap, immediate)

* **PR 1. Fix the two Codex findings and the data model.** Gate TRIAC on
  `blocked` (disable the card and the Continue button). Derive `isPreview` in
  advanced mode from the selected modules and the resolved target rather than
  hardcoding `false`. Apply the Section 4 corrections (S360-400, `pwr`,
  `config_string` alignment). Accept: blocked and preview hardware cannot reach
  Step 2 ungated in the preview; SKUs match the canonical table.
* **PR 1b. Remove the false signature claim.** Replace "Signature valid,
  ed25519" copy with "signature metadata present" and render
  `signature_verified` as skip. Accept: no surface in `/webflash-2/` claims
  cryptographic signature verification.

### Phase 2: establish the view/engine seam (no 1.0 behaviour change)

* **PR 2. Confirm or extract a view-agnostic engine API.** Ensure `state.js`,
  `release-channels.js`, `firmware-provenance.js`, `manifest-freshness.js`,
  `sw-update.js`, `cache-clear.js`, the kit loader, `a11y.js`, and the
  diagnostics builder export named, view-agnostic functions. If 1.0's render and
  logic are entangled, refactor logic out behind exports and add a `views/`
  boundary. Accept: `npm test` green, no UI change, the 2.0 shell can import the
  engine.

### Phase 3: wire the 2.0 view to the engine, one subsystem per PR, behind `?ui=2`

* **PR 3. Mount the 2.0 shell at the same origin under `?ui=2`.** Share the
  `index.html` bootstrap, CSP, service worker, and fonts. Wire real
  accessibility: skip link, live regions, `aria-current`, focus trap, reduced
  motion. Accept: `?ui=2` renders inside the production shell with the SW and
  CSP active; a11y tests pass.
* **PR 4. Identify step on the real engine.** Load `kits.json` via
  `loadKitCatalog`. Use real `setState`. Enforce AirIQ/VentIQ exclusivity, the
  AirIQ/DAC conflict, and the bathroom toggle from `state.js`. Use the real
  compatible-firmware lookup. Enforce installability gating (blocked configs
  route to the ESPHome source path, never to install). Support
  `?configmode=kit&sku=` and the unknown-SKU fallback. Accept: kit and advanced
  selections resolve to real manifest builds; blocked configs cannot proceed to
  install; existing share links still work.
* **PR 5. Install gate on the real engine.** Compose the gate: provenance
  (`validateFirmwareProvenance`, `CHECK_IDS`), SHA-256 after download
  (SubtleCrypto in `state.js`), manifest freshness, SW-update, channel
  acknowledgement (seven-tier, identity-bound), before-you-flash acknowledgement.
  Map the preflight panel to real check results. Delete the `CHECKS` simulation.
  Accept: every blocking provenance check blocks install in the 2.0 view across
  stable, beta, preview, and rescue; acknowledgement prunes on identity
  mismatch.
* **PR 6. Real flashing through ESP Web Tools.** Drive the install-button web
  component and map its lifecycle events (initializing, manifest, preparing,
  erasing, writing, finished, error) to the 2.0 progress ring and console.
  Replace `FLASH_PHASES` and the rAF loop. Enforce desktop Chromium only with
  the mobile fallback message. Accept: a real device flashes from the 2.0 view;
  progress reflects real esptool events.
* **PR 7. Connect step and post-flash validation.** Improv Serial provisioning
  via ESP Web Tools, replacing `NETWORKS` and `setTimeout`. SSID and password
  never read, logged, or stored. Post-flash validation panel with the eight
  states. Home Assistant handoff only when `improv: true`. Accept: provisioning
  works on a real device; the validation panel reports the honest state;
  credentials are never persisted.
* **PR 8. Rescue and development modes.** Wire the topbar "Rescue" to the real
  `?mode=recovery` path. Honour `?mode=development` visibility. Ensure the rescue
  binary is precached. Accept: recovery and development behave as in 1.0.
* **PR 9. Diagnostics and support bundle.** Wire the `schema_version: 1` bundle
  with redaction into the 2.0 surfaces (preflight panel, rescue modal, error
  log). Accept: the bundle matches the 1.0 schema and redacts as before.

### Phase 4: parity, audit, cutover

* **PR 10. Test and audit parity.** Port and extend the Jest suites against the
  2.0 view bound to the engine: provenance gate, channel-ack prune-on-mismatch,
  freshness matrix, kit-config rejection paths, a11y focus and modal, post-flash
  states. Accept: `npm test` green, `gen-manifests.py --strict-validate
  --dry-run` green, `npm run check:headers` green.
* **PR 11. Internal and beta cutover.** Default `?ui=2` for internal and beta,
  keep `?ui=1` as fallback. Dogfood against real S360-410 PoE hardware, which is
  the master shipping gate. Capture flash evidence. Accept: clean flash evidence
  on S360-410 PoE; no regressions reported.
* **PR 12. GA cutover.** Flip 2.0 to default at the repo root. Keep the 1.0 view
  at `?ui=1` for one release as rollback. Update README, docs, and CHANGELOG.
  Bump `CACHE_NAME` so the SW serves the new shell; verify the update banner and
  manifest freshness still gate. (The flip lives in `scripts/ui-version.js` so
  `resolveUiVersion` defaults every surface to the 2.0 view, with `?ui=1` the
  rollback. The cutover landed at `webflash-v15`, not the originally named
  `webflash-v5`: the WF-UX and bundle-picker work churned the live cache to
  `webflash-v13` and PR 11 took `webflash-v14`, so the GA bump is the next
  monotonic step.) Accept: GA live; rollback path verified; freshness and SW
  gating intact.
* **PR 13. Decommission the 1.0 view.** After one stable release with no
  regressions, remove `?ui=1` and the old render layer. Keep the engine. Fold the
  `/webflash-2/` path into the root. Accept: single view, engine unchanged,
  tests green.

---

## 6. Cutover and rollback

* Same origin throughout, so the CSP, service worker, headers, and manifest are
  inherited. Never a separate site.
* Flag-gated (`?ui=2` and `?ui=1`) so a user can opt into either view immediately
  by changing the URL. Changing the site default is a separate operation: it is a
  commit that ships through the GitHub Pages deploy.
* Bump `CACHE_NAME` on GA so the stale 1.0 shell is purged. The existing
  `activate` purge already removes non-current `webflash-` caches.
* Rollback: before GA, revert the offending PR and production is unaffected
  because the default is still `?ui=1`. At and after GA, a user returns to the
  1.0 view immediately via `?ui=1`, but rolling back the site default is a git
  revert of the cutover commit plus the GitHub Pages rebuild it triggers, not a
  flag flip, because GitHub Pages serves a static default with no remotely
  mutable flag. A true no-deploy default toggle would require a runtime flag
  source and likely a different host and is out of scope.
* Do not GA without the S360-410 PoE flash evidence. It is the existing master
  shipping gate and applies to the 2.0 cutover unchanged.

---

## 7. GA acceptance gates (definition of done)

All must hold before the default flips:

* No user-facing claim of cryptographic signature verification anywhere.
* Every blocking provenance check still blocks install in the 2.0 view across
  stable, beta, preview, and rescue.
* Channel acknowledgement still prunes on firmware-identity mismatch.
* Manifest freshness and SW-update gating still disable install per the matrix.
* Blocked hardware (fan-control variants, mains boards open-source-only, room
  bundles) cannot reach a real install in either kit or advanced mode.
* The diagnostics bundle still redacts; Wi-Fi credentials are never persisted.
* Accessibility holds: keyboard reachable, focus trap, live regions,
  `aria-current`, reduced motion.
* `npm test`, `gen-manifests.py --strict-validate --dry-run`, and `npm run
  check:headers` all green.
* Desktop Chromium only, with the mobile and unsupported fallback present.

---

## 8. Out of scope and explicitly deferred

* **Real ed25519 browser-side signature verification.** 1.0 deliberately does
  not implement this and forbids claiming it. The 2.0 migration must keep the
  same non-claim. Implementing real verification is a separate project: pin a
  trusted public key, verify the binary after download, then flip
  `signature_verified` from skip to pass or fail and update the docs. It is not
  a prerequisite for the 2.0 cutover and must not be implied by 2.0 UI copy in
  the meantime.
* **New hardware exposure.** The migration is UI parity, not a product change.
  It must not expose any kit, module, or channel that 1.0 does not already
  expose. The release gates remain the source of truth for what installs.
