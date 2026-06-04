# WebFlash 2.0 Migration: Claude Code Prompt Pack

One prompt per PR. Companion to `webflash-2-migration-delivery.md` (the delivery
plan) and `webflash-2-migration.md` (the strategy). Attach **both** docs to
Claude Code each session. The prompts carry the load-bearing scope inline, but
the strategy doc holds the full simulation-to-real mapping and the data-model
corrections, so several PRs need it.

## How to use

1. Attach `webflash-2-migration-delivery.md` and `webflash-2-migration.md`.
2. Paste the **Standing Instructions** block once at the top of the session, or
   add it to the repo's `CLAUDE.md` once so it applies automatically and you can
   skip it thereafter.
3. Paste the block for the PR you are doing.
4. Let Claude Code author, self-verify, and open the PR. Resolve any Codex P1/P2
   findings before merge.

Do them in order. Each block lists its prerequisites so you do not run a PR
before its dependencies are merged.

---

## Standing Instructions (paste once per session, or put in CLAUDE.md)

```
You are working on the WebFlash 2.0 migration. The attached delivery plan and
strategy doc are the source of truth for scope, the simulation-to-real mapping,
the data-model corrections, and the acceptance gates. Read both before starting.

Repo conventions:
- Vanilla ES modules. No build step. No React or Babel runtime. No new
  third-party runtime dependency beyond ESP Web Tools from the documented unpkg
  origin already allowed by the CSP.
- Desktop Chromium only. Keep the mobile and unsupported fallback intact.

Trust model is non-negotiable:
- Never weaken a blocking gate: provenance, channel acknowledgement, manifest
  freshness, service-worker update.
- Never claim cryptographic signature verification on any surface. The
  signature_verified check stays skip until real verification is a separate,
  explicit project.
- Never expose any kit, module, or channel that 1.0 does not already expose. The
  release gates are the source of truth for what installs.

Flag discipline:
- The default UI stays ui=1 (the 1.0 view) until PR 12. Anything new is reachable
  only via ?ui=2 until then.

Implementation discipline:
- When you replace a simulation with a real binding, delete the simulation in the
  same PR. No dead simulated code paths behind the flag.
- Implement only this PR's scope. Do not start the next PR's work.

Self-verify before opening the PR, and paste the output into the PR body:
- npm test
- python3 scripts/gen-manifests.py --strict-validate --dry-run
- npm run check:headers -- https://sense360store.github.io/WebFlash/
- If the PR touches provenance, the manifest, or the install gate, fill the
  Reviewer checklist from the README "Reviewer checklist" section into the PR body.

PR body: a summary, the key changes, the simulation-to-real items addressed, the
verify output, and an explicit statement of what stays gated. Plain prose. Do not
use hyphens as sentence breakers. No emojis. Open the PR for Codex review and
resolve P1 and P2 findings before merge.
```

---

## PR 0 — Decision doc and ADR

```
Implement PR 0 from the attached delivery plan.

Goal: land the migration docs and record the method decision.
Prerequisites: none.

Scope:
- Add docs/webflash-2-migration.md and docs/webflash-2-migration-delivery.md
  (the attached files).
- Add a short ADR (docs/adr/0001-webflash-2-view-over-engine.md or the repo's
  existing ADR location) recording: approach A (the 2.0 view over the 1.0
  engine, behind ?ui=2), the rejected alternatives, and the view/engine boundary
  contract (the engine owns every gating decision; the view renders state and
  calls engine actions; the view never owns a gate).
- Optionally add the Standing Instructions block to CLAUDE.md.

Out of scope: any code change to the installer.

Acceptance: docs render on GitHub, internal links resolve, Mermaid diagram in the
delivery plan renders.

PR: branch wf2-00-decision-doc, base main. Default UI stays ui=1.
```

---

## PR 1 — Preview honesty and data-model fixes

```
Implement PR 1 from the attached delivery plan. Apply the Standing Instructions.

Goal: make the merged /webflash-2/ preview honest. Touch only the preview.
Prerequisites: none.

Scope (all in webflash-2/scripts/):
- Gate TRIAC. installable:false currently only renders a note. Include the
  blocked flag in the disabled condition for the card and in the Continue gate so
  a not-installable target cannot reach Step 2. This is the Codex finding on #477.
- Fix advanced-mode preview gating. computeDevice() hardcodes isPreview:false.
  Derive isPreview from the selected modules and the resolved target so
  preview-only hardware (for example the LED ring) carries the preview
  acknowledgement into Step 2. This is the second Codex finding on #477.
- Data-model corrections in data.js: change the 240V PSU SKU from S360-420 to
  S360-400, and the power identifier from "240v" to "pwr" to match the engine.
- Read manifest.json to confirm the exact config_string token convention (for
  example Ceiling-POE-VentIQ-RoomIQ). Align buildTarget() output to that
  convention, including the mains-power token. Add a TODO noting PR 4 replaces
  buildTarget() with the engine's compatible-firmware lookup.
- Remove the false signature claim. Replace the "Signature valid, ed25519
  dev-2026-01" readiness copy with "signature metadata present" and render the
  signature check as skip, matching the 1.0 non-claim policy.

Out of scope: do not touch state.js, scripts/utils, scripts/services, index.html,
sw.js, manifest.json, or firmware. This PR stays inside the preview.

Acceptance: in the preview, blocked and preview hardware cannot reach Step 2
ungated; SKUs and identifiers match the canonical table and the engine; no
surface claims cryptographic signature verification. npm test green;
npm run check:headers green.

PR: branch wf2-01-preview-honesty, base main. Default UI stays ui=1.
```

---

## PR 2 — Engine API seam

```
Implement PR 2 from the attached delivery plan. Apply the Standing Instructions.

Goal: expose the 1.0 logic as a view-agnostic engine the 2.0 view can import.
This is a 1.0 refactor with no behaviour change. It is the pivot for Phase 3.
Prerequisites: none.

Scope:
- Confirm or extract named, view-agnostic exports from: scripts/state.js,
  scripts/utils/release-channels.js, scripts/utils/firmware-provenance.js,
  scripts/services/manifest-freshness.js, scripts/services/sw-update.js,
  scripts/services/cache-clear.js, the kit-config loader (loadKitCatalog),
  scripts/utils/a11y.js, and the diagnostics/support-bundle builder.
- If the 1.0 render and logic are entangled in any of these, extract the logic
  behind exports and add a views/ boundary. Do not change any user-visible
  behaviour of the 1.0 view.

Acceptance: npm test green, no UI or behaviour change to the 1.0 view, and a
trivial smoke import from a scratch module proves the 2.0 shell can import each
engine module.

PR: branch wf2-02-engine-seam, base main. Default UI stays ui=1.
```

---

## PR 3 — Mount the 2.0 shell under ?ui=2 with real accessibility

```
Implement PR 3 from the attached delivery plan. Apply the Standing Instructions.

Goal: render the 2.0 view inside the production shell behind ?ui=2, inheriting
the CSP, service worker, manifest, and headers. Wire real accessibility.
Prerequisites: PR 2 merged.

Scope:
- Mount the 2.0 view at the same origin behind ?ui=2. The default (ui=1) renders
  the unchanged 1.0 view. Share the index.html bootstrap, the CSP, the service
  worker, and the Google Fonts loads. No separate site, no second CSP.
- Wire accessibility from scripts/utils/a11y.js: skip-to-content link, the polite
  and assertive live regions with announce(), aria-current="step" on the rail,
  focus trap and focus restoration for any modal, and reduced-motion support.

Acceptance: ?ui=2 renders inside the production shell with the service worker and
CSP active; the default ui=1 view is unchanged; a11y Jest suites pass;
npm run check:headers green.

PR: branch wf2-03-mount-shell, base main. Default UI stays ui=1.
```

---

## PR 4 — Identify step on the real engine

```
Implement PR 4 from the attached delivery plan. Apply the Standing Instructions.

Goal: bind Step 1 to the real kit catalogue, state machine, and firmware lookup.
Prerequisites: PR 3 merged.

Scope:
- Load scripts/data/kits.json via loadKitCatalog. Replace the hardcoded KITS in
  webflash-2 data.js. Handle the sample and skipped cases as the loader defines.
- Use the real setState. Enforce, from state.js: AirIQ/VentIQ exclusivity, the
  AirIQ/DAC conflict, and the bathroom toggle.
- Replace buildTarget() with the engine's compatible-firmware lookup so a
  selection resolves to a real manifest build by config_string.
- Enforce installability gating per the release gates: a configuration with no
  installable stable or preview build is blocked from install and routed to the
  ESPHome source path, never to the install flow. This subsumes the TRIAC guard.
- Support shareable links: ?configmode=kit&sku= and the manual params. Show the
  unknown-SKU fallback and the one-click switch to manual mode.

Acceptance: kit and advanced selections resolve to real manifest builds; blocked
configurations cannot proceed to install in either kit or advanced mode; existing
manual and kit share links still work; npm test green including the kit-config
rejection paths.

PR: branch wf2-04-identify, base main. Default UI stays ui=1.
```

---

## PR 5 — Install gate on the real engine

```
Implement PR 5 from the attached delivery plan. Apply the Standing Instructions.

Goal: replace the simulated readiness checklist with the real composite install
gate.
Prerequisites: PR 4 merged.

Scope:
- Compose the gate from the engine: provenance via validateFirmwareProvenance and
  CHECK_IDS; SHA-256 verification of the downloaded bytes via SubtleCrypto in
  state.js; manifest freshness; service-worker update; channel acknowledgement
  across the seven tiers, bound to the firmware-identity signature via
  getFirmwareAcknowledgementSignature; and the before-you-flash acknowledgement.
- Map the 2.0 preflight panel to the real check results by stable check id, not by
  parsing summary or detail strings.
- Delete the CHECKS simulation and its timers.

Acceptance: every blocking provenance check blocks install in the 2.0 view across
stable, beta, preview, and rescue; acknowledgement prunes on a firmware-identity
mismatch; the freshness and service-worker matrix disables install as specified;
npm test -- firmware-provenance green.

PR: branch wf2-05-install-gate, base main. Default UI stays ui=1.
```

---

## PR 6 — Real flashing through ESP Web Tools

```
Implement PR 6 from the attached delivery plan. Apply the Standing Instructions.

Goal: replace the simulated flash with real flashing.
Prerequisites: PR 5 merged.

Scope:
- Drive the ESP Web Tools install-button web component. Map its lifecycle events
  (initializing, manifest, preparing, erasing, writing, finished, error) to the
  2.0 progress ring and console.
- Delete FLASH_PHASES and the requestAnimationFrame loop.
- Enforce desktop Chromium only with the mobile and unsupported fallback message.

Acceptance: a real device flashes from the 2.0 view; the progress ring and console
reflect real esptool events, not a timer; the install button only arms when the PR
5 gate passes.

PR: branch wf2-06-real-flash, base main. Default UI stays ui=1.
```

---

## PR 7 — Improv connect and post-flash validation

```
Implement PR 7 from the attached delivery plan. Apply the Standing Instructions.

Goal: replace the simulated Wi-Fi step with real Improv provisioning and wire the
post-flash validation panel.
Prerequisites: PR 6 merged.

Scope:
- Provision Wi-Fi over Improv Serial via ESP Web Tools. Delete the NETWORKS array
  and the setTimeout scan and connect. SSID and password are never read, logged,
  or stored anywhere, including URLs, localStorage, the support bundle, and flash
  history.
- Wire the post-flash validation panel with the eight states. Show the Home
  Assistant handoff only when the selected build advertises improv:true.

Acceptance: provisioning works on a real device; the validation panel reports the
honest state including unknown as the default for builds without Improv;
credentials are never persisted; npm test green for the post-flash states.

PR: branch wf2-07-improv-postflash, base main. Default UI stays ui=1.
```

---

## PR 8 — Rescue and development modes

```
Implement PR 8 from the attached delivery plan. Apply the Standing Instructions.

Goal: wire the real recovery and development paths into the 2.0 view.
Prerequisites: PR 3 merged. Independent of the PR 4 to 7 spine.

Scope:
- Wire the topbar Rescue button to the real ?mode=recovery rescue and recovery
  path and its modal.
- Honour ?mode=development visibility for development-channel builds.
- Ensure the rescue binary is precached as in 1.0 so first-visit offline rescue
  works.

Acceptance: recovery and development modes behave as in the 1.0 view; the rescue
modal semantics and focus behaviour pass their a11y tests; npm test green.

PR: branch wf2-08-rescue-dev, base main. Default UI stays ui=1.
```

---

## PR 9 — Diagnostics and support bundle

```
Implement PR 9 from the attached delivery plan. Apply the Standing Instructions.

Goal: wire the redacted support bundle into the 2.0 surfaces.
Prerequisites: PR 3 merged for the scaffold. Fully wired once PR 4, PR 5, and PR 7
are merged.

Scope:
- Wire the schema_version:1 support bundle with full redaction into the 2.0
  surfaces: the preflight panel, the rescue and recovery modal, and the error log
  modal. Provide the copy and download actions.
- The bundle must carry the same sections and the same redaction as 1.0 and must
  never include firmware binaries, raw sha256 or signature values, or Wi-Fi
  passwords.

Acceptance: the bundle matches the 1.0 schema by section and field; redaction
strips passwords, tokens, MACs, paths, and URL query strings; npm test green for
the diagnostics suite.

PR: branch wf2-09-diagnostics, base main. Default UI stays ui=1.
```

---

## PR 10 — Test and audit parity

```
Implement PR 10 from the attached delivery plan. Apply the Standing Instructions.

Goal: bring the 2.0 view bound to the engine up to 1.0 test and audit parity.
Prerequisites: PR 7, PR 8, and PR 9 merged.

Scope:
- Port and extend the Jest suites to cover the 2.0 view bound to the engine: the
  provenance gate, the channel-acknowledgement prune-on-mismatch, the freshness
  matrix, the kit-config rejection paths, a11y focus and modal behaviour, and the
  post-flash states.

Acceptance: npm test green; python3 scripts/gen-manifests.py --strict-validate
--dry-run green; npm run check:headers green.

PR: branch wf2-10-test-parity, base main. Default UI stays ui=1.
```

---

## PR 11 — Beta default and S360-410 evidence

```
Implement PR 11 from the attached delivery plan. Apply the Standing Instructions.

Goal: default ?ui=2 for the beta surface and prepare the hardware evidence gate.
Prerequisites: PR 10 merged.

Scope:
- Make ?ui=2 the default for the internal and beta surface, keeping ?ui=1 as the
  fallback. Production default stays ui=1.
- Add an evidence-capture checklist to the PR for the S360-410 PoE flash: device,
  config string, firmware version and channel, the eight-state validation result,
  and the Improv provisioning result. Note in the PR that the physical flash and
  the attached evidence are a manual step I perform; the agent cannot flash
  hardware.

Acceptance: the beta surface defaults to the 2.0 view with the ui=1 fallback
working; production default is unchanged; the evidence checklist is in the PR body
ready for me to fill from a real S360-410 PoE flash. This PR does not merge to a
GA default without that evidence.

PR: branch wf2-11-beta-default, base main. Default UI stays ui=1 in production,
ui=2 on the beta surface.
```

---

## PR 12 — GA cutover

```
Implement PR 12 from the attached delivery plan. Apply the Standing Instructions.

Goal: flip the default to the 2.0 view and bump the cache.
Prerequisites: PR 11 merged and the S360-410 PoE flash evidence attached and clean.

Scope:
- Flip the default UI to ui=2 at the repo root. Keep the 1.0 view reachable at
  ?ui=1 as the rollback for one release.
- Bump CACHE_NAME to webflash-v5 so the service worker serves the new shell.
  Confirm the activate handler purges the old webflash- cache.
- Update README, the docs, and CHANGELOG.
- Verify the update banner and manifest freshness still gate after the cache bump.

Acceptance: the 2.0 view is the default at the root; ?ui=1 still loads the 1.0
view; a user returns to the 1.0 view immediately via ?ui=1, and rolling back the
site default is a git revert of the cutover commit plus the GitHub Pages rebuild
it triggers, not a flag flip; the freshness and service-worker gating still
disable install per the matrix; npm test, the strict manifest dry run, and
check:headers all green.

PR: branch wf2-12-ga-cutover, base main. Default UI flips to ui=2, ui=1 fallback.
```

---

## PR 13 — Remove the 1.0 view

```
Implement PR 13 from the attached delivery plan. Apply the Standing Instructions.

Goal: decommission the 1.0 view after a clean GA release.
Prerequisites: PR 12 live for one stable release with no regression reports.

Scope:
- Remove the ?ui=1 fallback and the old 1.0 render layer. Keep the engine modules
  unchanged.
- Fold the /webflash-2/ path into the root so the 2.0 view is the only view.

Acceptance: a single view at the root; the engine and the trust model are
unchanged; npm test, the strict manifest dry run, and check:headers all green.

PR: branch wf2-13-remove-1.0-view, base main. Default UI is ui=2 with no fallback.
```
