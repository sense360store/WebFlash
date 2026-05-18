# WebFlash Wizard UX Roadmap

> **WF-UX-001 — audit only.** This document is a docs-only deliverable. No
> runtime UI behaviour, firmware, manifest, kit, source, workflow, signing,
> service worker, or wizard logic was changed by the PR that introduces it.
> Release-One install behaviour, the LED preview exposure model, and the
> FanTRIAC block are all unchanged.

## Purpose and scope

This roadmap audits the deployed WebFlash wizard end-to-end against the
recent UX feedback, classifies the findings by severity, proposes a
cleaned-up target first-run flow, and breaks the follow-up work into
PR-sized units (`WF-UX-QUICK-001` through `WF-UX-007` plus the
operator-only `WF-HW-TEST-001` / `WF-HW-TEST-002` chain). It is
paired with — but does not replace —
[`docs/ux-roadmap.md`](ux-roadmap.md), the May-2026 external review.
That earlier doc is a strategic vision review; this one is a current
live-wizard audit with explicit file/line citations and a concrete PR
sequence.

**In scope.** Live-wizard journey map; severity-classified findings;
target first-run flow; firmware-readiness, preflight, preview-channel,
kit-vs-custom, browser-support, primary-CTA, and jargon policies;
quick-wins separated from larger restructuring; PR plan with per-PR
acceptance criteria; hardware/operator validation gaps; do-not-change
guardrails.

**Out of scope.** Any change to the runtime wizard. Specifically: no
edit to `index.html`, `scripts/state.js`, `scripts/utils/release-channels.js`,
`scripts/data/kits.json`, `scripts/data/module-requirements.js`,
`manifest.json`, `firmware-*.json`, `firmware/sources.json`,
`firmware/configurations/*`, `sw.js`, any workflow under
`.github/workflows/`, or any test under `__tests__/`. No firmware
import, no manifest regeneration, no LED kit addition, no preview
toggle, no FanTRIAC unblock. The admin-note removal and the
browser-support copy normalisation called out below are explicitly
**not** done by WF-UX-001 — they are the first follow-up PR
(`WF-UX-QUICK-001`).

## Current deployed wizard state

### Live vs in-repo snapshot (2026-05-15)

A fresh `curl` of the live origin (`https://sense360store.github.io/WebFlash/`)
shows that the deployed `manifest.json` is older than the in-repo one:

| Surface | Live (2026-05-07) | In-repo HEAD (2026-05-15) |
| --- | --- | --- |
| `manifest.json` `source_commit` | `821e33017df5e66f812cf0d570800f73c083de15` | `f75a31ad415f92afc5be81456404a705dbe3b820` |
| `manifest.json` `builds[]` | 16 across 10 `config_string` values | 3: Release-One stable + LED preview + Rescue |
| `firmware-*.json` indices | `firmware-0.json` … `firmware-15.json` | `firmware-0.json`, `firmware-1.json`, `firmware-2.json` |
| `index.html` admin-note + browser-support copy + readiness strings | Same wording as repo, slightly different line numbers (`Admin note` at deployed `:993` vs repo `:1005`) | See citations below |
| `index.html` LED toggle markup | Not present on the live build | Present at `index.html:659-673` |

The UX findings below were verified against both:

* the **live wizard** as deployed on 2026-05-15, which still references
  the legacy 16-build manifest (`Ceiling-POE-AirIQ`, `Ceiling-USB`,
  etc.), and
* the **post-WF-LED-003 in-repo state** that will deploy next, which
  collapses the wizard's matchable surface to Release-One + Rescue
  with a manifest-only preview slot for LED.

Where a finding is sensitive to that delta, it is called out
explicitly. Most of the findings (admin note, browser-support copy,
DOM source order, label drift, jargon, primary CTA placement,
preflight panel framing) are identical across both states.

### Wizard step model

The wizard is a 5-step linear flow ([`scripts/state.js:71-72`](../scripts/state.js#L71)
caps `getTotalSteps()` at 5). Step gating is owned by
`getMaxReachableStep()` ([`scripts/state.js:6556-6566`](../scripts/state.js#L6556)):
step 2 unlocks once `mounting` is set, step 3 once `power` is set,
step 5 once both are set. The Core step (step 2) always exists in the
DOM, but functionally contains a single radio (the standard "Core"
voice=none variant, [`index.html:213`](../index.html#L213)) — every
user picks it.

The desktop sidebar stepper ([`index.html:113-165`](../index.html#L113))
and the mobile progress bar ([`index.html:169-190`](../index.html#L169))
both ship in the DOM at all viewports; the responsive layout swaps
which one is visible.

## End-to-end journey map

Walked as far as the UI allowed without real USB hardware. Hardware-gated
steps are marked with `[HW]` and tracked under [Hardware/operator
validation still required](#hardwareoperator-validation-still-required).

> **Snapshot note.** This map captures the wizard as walked at audit
> time, *before* WF-UX-005 (step-model cleanup) landed. The step
> labels listed in steps 3, 6, 7, 8, and 9 below ("Pick a starting
> point", "Configure your Core", "How is the hub powered?", "Add
> expansion modules", "Review & install") and the index.html line
> ranges referenced from those steps describe the pre-WF-UX-005
> markup. After WF-UX-005 the canonical labels are **Start / Core /
> Power / Modules / Review** on both stepper surfaces, the H2s are
> **Start with your hardware / Confirm your Core / Choose power /
> Pick modules / Review and install**, and DOM source order matches
> logical order (step-1 → step-2 → step-3 → step-4 → step-5). See the
> WF-UX-005 row in [Roadmap broken into follow-up PRs](#roadmap-broken-into-followup-prs)
> and the Resolved-by notes on Findings #1 and #2 below.

1. **Landing.** Page loads with the `Sense360 Firmware Installer` hero
   ([`index.html:36-67`](../index.html#L36)) and an expandable
   "Before you start" prereq panel ([`index.html:72-109`](../index.html#L72)).
2. **Prerequisites panel.** Top-level copy says "Chrome, Edge, or Opera"
   ([`index.html:82`](../index.html#L82), [`:89`](../index.html#L89));
   has "Test browser & USB setup" and "Open Rescue / Recovery Mode"
   buttons.
3. **Step 1 — "Pick a starting point".** Markup at
   [`index.html:241-320`](../index.html#L241). Shows the kit-vs-manual
   radio pair (kit is the default per `kit-mode.js:setMode('kit',
   {silent: true})` at [`scripts/kit-mode.js:425`](../scripts/kit-mode.js#L425)).
4. **Kit path.** Kit panel ([`index.html:267-292`](../index.html#L267))
   exposes a search input + datalist + select dropdown over
   `scripts/data/kits.json`. The catalogue currently holds a single
   sample kit (`S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` →
   `Ceiling-POE-VentIQ-RoomIQ`, [`scripts/data/kits.json:13-41`](../scripts/data/kits.json#L13)).
   "Continue with this kit" jumps to Step 5.
5. **Manual / quick-start path.** Manual panel
   ([`index.html:294-313`](../index.html#L294)) exposes two preset
   buttons ("Ceiling + AirIQ over PoE", "Ceiling Core over USB") plus
   a "Configure manually →" link to Step 2.
6. **Step 2 — "Configure your Core".** Markup at
   [`index.html:193-239`](../index.html#L193). Single Core radio
   ([`:213`](../index.html#L213)); ships a "Use desktop Chrome or
   Edge" safety notice ([`:204`](../index.html#L204)).
7. **Step 3 — "How is the hub powered?"** Markup at
   [`index.html:323-395`](../index.html#L323). USB / PoE / 240v PSU.
8. **Step 4 — "Add expansion modules".** Markup at
   [`index.html:398-722`](../index.html#L398). Bathroom toggle
   ([`:407-420`](../index.html#L407)), RoomIQ / AirIQ / VentIQ toggle
   modules, Fan / Switching variant group, LED toggle module
   ([`:659-673`](../index.html#L659)). Live "Firmware target
   preview" pane at the bottom ([`:703-716`](../index.html#L703))
   with the warning string "This exact firmware target is not
   published yet" ([`:714`](../index.html#L714)).
9. **Step 5 — "Review & install".** Markup at
   [`index.html:725-904`](../index.html#L725). Configuration summary,
   Preflight checks panel, "Before you flash" checklist, Compatible
   Firmware heading + `<esp-web-install-button>` container, wizard
   actions footer with the "Other options — the main Install button
   is on the firmware card above." label
   ([`:840`](../index.html#L840)).
10. **Preflight panel.** Six diagnostic rows
    ([`index.html:746-789`](../index.html#L746)): browser-support,
    device-visibility, connection-quality, firmware-verification,
    user-acknowledgement, manifest-freshness. Verdicts categorised
    as `pass`/`warn`/`fail` by `evaluatePreflightPolicy()` at
    [`scripts/state.js:558-569`](../scripts/state.js#L558). Install
    gating is computed at
    [`scripts/state.js:3104`](../scripts/state.js#L3104) and combines
    preflight, the pre-flash checkbox, channel acknowledgements, and
    manifest-freshness.
11. **Channel acknowledgement panel.** Renders inside the firmware
    section at [`index.html:828-833`](../index.html#L828); populated
    by `renderChannelAcknowledgementPanel()` near
    [`scripts/state.js:5541`](../scripts/state.js#L5541). For the
    preview channel this is the `channel:preview` checkbox with the
    experimental-build warning copy
    ([`scripts/utils/release-channels.js:112-125`](../scripts/utils/release-channels.js#L112)).
12. **Install action.** `<esp-web-install-button>` injected into
    `#compatible-firmware` by `state.js` (rendered near
    [`scripts/state.js:5069`](../scripts/state.js#L5069)). `[HW]`
    actual flash + Improv Wi-Fi handoff not verified.
13. **Secondary actions.** Wizard-actions footer
    ([`index.html:836-849`](../index.html#L836)): Back, Download
    .bin, Copy install link, Open Home Assistant. `[HW]` post-flash
    Home Assistant + Wi-Fi flow not verified.
14. **Mobile summary drawer.** Independent layout at
    [`index.html:912-979`](../index.html#L912) with a third Install
    button at [`:969`](../index.html#L969) and its own readiness
    string "No build selected yet." at
    [`:962`](../index.html#L962).
15. **Rescue / Recovery.** Header trigger at
    [`index.html:44-50`](../index.html#L44); modal markup is created
    on demand by `scripts/layout/rescue-modal.js`. `[HW]` recovery
    flow not exercised against a real device.
16. **Browser-not-supported banner.** Static fallback at
    [`index.html:1008-1016`](../index.html#L1008); says "desktop
    Chrome or Edge".
17. **Admin note popover footer.** Visible inside every option-info
    popover ([`index.html:981-1006`](../index.html#L981)) — the
    string "Admin note: edit these info popovers in
    `scripts/content/option-tooltips.js`." at
    [`:1005`](../index.html#L1005).

## Severity summary

| # | Finding | Severity |
| --- | --- | --- |
| 1 | Duplicate / conflicting progress labels for step 1 | High |
| 2 | Step 2 markup precedes Step 1 in DOM source order | High |
| 3 | Browser-support copy disagrees across surfaces (Chrome/Edge/Opera vs Chrome/Edge) | High |
| 4 | Primary Install CTA buried by secondary actions | High |
| 5 | Firmware-readiness copy is ambiguous (three competing strings) | High |
| 6 | Quick-start presets bake in removed `config_string` values | High (latent) |
| 7 | Jargon-heavy module / SKU / header labels everywhere in Step 4 | Medium |
| 8 | Preflight reads like diagnostics, not a user gate | Medium |
| 9 | Preview-channel messaging must stay explicit through any restructure | Medium |
| 10 | Internal "Admin note" rendered as visible text on every popover | Low / quick fix |

## Findings

### 1. Duplicate / conflicting progress model (High)

The same wizard step is labelled three different things:

* Desktop sidebar stepper, step 1 label: **"Get started"**
  ([`index.html:121`](../index.html#L121)).
* Mobile progress bar, step 1 label: **"Mounting"**
  ([`index.html:172`](../index.html#L172)).
* The step's own `<h2>` heading: **"Pick a starting point"**
  ([`index.html:243`](../index.html#L243)).

Subsequent steps (Core, Power, Modules, Review) are consistent across
the two progress models, but the step-1 trio of names is the most
visible inconsistency a first-time user hits in their first few
seconds. The mobile "Mounting" label is also a fossil: Step 1 stopped
being a mounting picker when the kit-vs-manual choice was introduced
(only the hidden `<input type="hidden" name="mounting" value="ceiling"
data-mounting-default>` at [`index.html:315`](../index.html#L315) still
encodes mounting).

> **Resolved by WF-UX-005.** Desktop sidebar, mobile progress bar, and
> the step-1 `<h2>` all now land on a single label per step. Canonical
> mapping pinned by `__tests__/a11y-static-html.test.js` (the
> `WF-UX-005 — step model cleanup` describe block):
>
> | Step | Stepper label (desktop + mobile) | H2 heading                 |
> | ---- | -------------------------------- | -------------------------- |
> | 1    | Start                            | Start with your hardware   |
> | 2    | Core                             | Confirm your Core          |
> | 3    | Power                            | Choose power               |
> | 4    | Modules                          | Pick modules               |
> | 5    | Review                           | Review and install         |
>
> The hidden `mounting=ceiling` default input survives inside Step 1
> (Step 1 is no longer presented as a mounting picker, but mounting
> still defaults to ceiling for `getMaxReachableStep()`). Step 2 keeps
> its `voice='none'` Core radio for share-link back-compat —
> WF-UX-005 did not collapse Step 2.

### 2. Out-of-order DOM source (High)

The DOM lists Step 2 (`<div id="step-2" …>`) at
[`index.html:193-239`](../index.html#L193) **before** Step 1
(`<div id="step-1" …>`) at
[`index.html:241-320`](../index.html#L241). Both are hidden via
`hidden`/`aria-hidden="true"` while inactive, so visual users only
ever see the active step, but assistive tools that walk the DOM in
source order surface "Configure your Core" before "Pick a starting
point" — which matches the reported UX feedback "Configure your Core
appears before Pick a starting point". Steps 3 → 5 are in source order
([`:323`](../index.html#L323), [`:398`](../index.html#L398),
[`:725`](../index.html#L725)).

> **Resolved by WF-UX-005.** The Step 1 / Step 2 panel markup is now
> swapped in `index.html` so DOM source order matches logical order
> (step-1 → step-2 → step-3 → step-4 → step-5). Pinned by two new
> assertions in the `WF-UX-005 — step model cleanup` describe block in
> `__tests__/a11y-static-html.test.js`: every `.wizard-step` panel
> under `#main-content` has an `id` matching its source-order index,
> and `step-1.compareDocumentPosition(step-2)` confirms step-1
> precedes step-2. `getMaxReachableStep()`, `setStep()`, animation
> transitions, and URL-step routing all key off the numeric panel ID
> (`document.getElementById('step-${N}')`), so the swap is markup-only
> and required no `scripts/state.js` change.

### 3. Inconsistent browser-support copy (High)

Project canon (per [`CLAUDE.md:17`](../CLAUDE.md#L17)) is **Chrome,
Edge, or Opera** on desktop. Two surfaces match canon:

* Top prereq summary: [`index.html:82`](../index.html#L82),
  [`:89`](../index.html#L89).

Many surfaces disagree, listing only **Chrome or Edge**:

* Step 2 safety notice: [`index.html:204`](../index.html#L204).
* Step 5 step-intro: [`index.html:729`](../index.html#L729).
* Browser-not-supported fallback: [`index.html:1012`](../index.html#L1012).
* Review-step browser messages: [`scripts/init-review.js:19-21`](../scripts/init-review.js#L19).
* Inline review HTML in state.js: [`scripts/state.js:5075`](../scripts/state.js#L5075).
* Rescue modal messages: [`scripts/layout/rescue-modal.js:21-23`](../scripts/layout/rescue-modal.js#L21).
* Sensor-health panel: [`scripts/layout/sensor-health-panel.js:82`](../scripts/layout/sensor-health-panel.js#L82).
* Splitview mount-point fallback: [`scripts/layout/init-splitview.js:103`](../scripts/layout/init-splitview.js#L103), [`:106`](../scripts/layout/init-splitview.js#L106).
* Compat-config inline message: [`scripts/compat-config.js:617`](../scripts/compat-config.js#L617).
* Capability-detection guidance for Firefox/Safari/other:
  [`scripts/capabilities.js:46`](../scripts/capabilities.js#L46),
  [`:51`](../scripts/capabilities.js#L51),
  [`:66`](../scripts/capabilities.js#L66),
  [`:275`](../scripts/capabilities.js#L275).

(`scripts/capabilities.js` does include Opera in the on-device
detection telemetry — line `:54-56` registers Opera as a recognised
browser and `:239`, `:263-264` use "Chrome, Edge, or Opera" in
some unsupported-runtime messages. So the inconsistency is largely a
copy issue in the wizard's user-visible strings, not a capability
detection bug.)

### 4. Primary Install CTA buried (High)

The install action is the upstream `<esp-web-install-button>` element
injected into `#compatible-firmware` by `state.js` (created near
[`scripts/state.js:5069`](../scripts/state.js#L5069)). The Step 5
wizard-actions footer surrounds it with two competing presentations:

* A row of secondary actions — Back, Download .bin, Copy install
  link, and "Open Home Assistant" (which is presented as
  `btn-primary`) — at
  [`index.html:836-849`](../index.html#L836).
* A self-referential explanatory label inside the same row:
  *"Other options — the main Install button is on the firmware card
  above."* at [`index.html:840`](../index.html#L840).

A third Install button exists in the mobile summary drawer at
[`index.html:969`](../index.html#L969). The user has to scroll up
from the wizard-actions footer to the firmware card to find the
actual install affordance, the secondary actions visually outweigh
it, and the copy admits as much.

### 5. Firmware readiness ambiguity (High)

Three different strings describe overlapping readiness states with no
unified model:

* Step 4 firmware-target-preview warning:
  *"This exact firmware target is not published yet. You can still
  review your selection, but installation will require a matching
  firmware build."* — [`index.html:713-715`](../index.html#L713).
* Mobile summary firmware-empty message: *"No build selected yet."*
  at [`index.html:962`](../index.html#L962) (static markup; no
  state.js fallback overrides it).
* Step 5 "Compatible Firmware" heading
  ([`index.html:813-815`](../index.html#L813)) goes blank — only
  the label survives — when no build matches. Update path is
  `updateCompatibleFirmwareHeading()` near
  [`scripts/state.js:5430-5450`](../scripts/state.js#L5430).

Five distinct readiness situations exist (stable available; preview
available; no build published; rescue mode; unsupported browser) and
the UI does not pick one phrase per state. The first time a user
sees "not published yet" they cannot tell whether they are
in *"this configuration was never published"* (a config error to
fix) or *"manifest hasn't reached the deployed site yet"* (a freshness
state).

### 6. Stale quick-start presets (High, latent)

The two Step 1 presets in [`scripts/recommended-bundle.js:3-8`](../scripts/recommended-bundle.js#L3)
and the matching markup at [`index.html:296-307`](../index.html#L296)
target:

* **Ceiling + AirIQ over PoE** → `config_string: Ceiling-POE-AirIQ`.
* **Ceiling Core over USB** → `config_string: Ceiling-USB`.

Neither config exists in the in-repo `manifest.json` after WF-LED-002
([only `Ceiling-POE-VentIQ-RoomIQ`, `Ceiling-POE-VentIQ-RoomIQ-LED`,
and `Rescue` survive](../manifest.json)). The live deployed manifest
still has both `config_string` values today, but the next deploy
will leave the presets pointing at no build — and per finding #5 the
user will then see the ambiguous "not published yet" copy with no
indication that they hit a misconfigured shortcut.

This is the only finding that is materially worse on the post-WF-LED-003
codebase than on the live site. It is called out as "latent" because
it is not visibly broken on the live deployment today, but ships as
a regression the next time the in-repo `manifest.json` is deployed.

### 7. Jargon-heavy module / SKU / header labels (Medium)

Step 4 surfaces these technical tokens before a first-time user has
any glossary to map them to outcomes:

* Module names: `AirIQ`, `VentIQ`, `RoomIQ`, `Relay`, `PWM`, `DAC`,
  `TRIAC`, `LED`. All canonical per
  [`CLAUDE.md:23-35`](../CLAUDE.md#L23), but the wizard does not
  unpack them on first encounter — the descriptions assume the
  reader already knows what "PWM tach feedback" means.
* SKU codes inside every module heading: e.g.
  *"Sense360 RoomIQ S360-200"* at
  [`index.html:428`](../index.html#L428), and similarly for AirIQ
  (`:446`), VentIQ (`:466`), and every Fan / LED card under
  [`:506-654`](../index.html#L506).
* Hardware-bus strings: `J3 sensor bus`, `J4 sensor bus`,
  `J7 auxiliary power`, `J11 LED data`, `J12 LED power`,
  `S360-Relay-C`, `12vFan_PWM_PulseCounter`, `Fan_GP8403`,
  `TRIAC_Board` — all visible in module-specs rows at
  [`index.html:430-666`](../index.html#L430).
* Section heading "Firmware target preview" at
  [`index.html:710`](../index.html#L710), referencing the
  "firmware target" string the user has had no chance to learn.
* Per-module-card *"Core R4"* line ([`index.html:551-647`](../index.html#L551))
  surfaces the hardware revision even before the user has chosen
  whether the modules apply.
* `scripts/content/option-tooltips.js` still carries `airiq.base` /
  `airiq.pro` entries at lines `125-164` — leftover Model/Variant
  copy after the SKU-only refactor; per [`CLAUDE.md:131-132`](../CLAUDE.md#L131)
  Model/Variant nomenclature must be dropped.

### 8. Preflight reads like diagnostics, not a user gate (Medium)

The Step 5 preflight panel at
[`index.html:737-789`](../index.html#L737) renders six per-check
rows (browser-support, device-visibility, connection-quality,
firmware-verification, user-acknowledgement, manifest-freshness) with:

* a "Copy support bundle" / "Download JSON" button pair right under
  the heading ([`:741-744`](../index.html#L741)),
* a per-check inline-action surface for manifest-freshness (
  "Recheck manifest freshness" + an acceptance checkbox at
  [`:776-782`](../index.html#L776)),
* a "Accept preflight warnings" master checkbox at
  [`:785-788`](../index.html#L785).

`evaluatePreflightPolicy()` at
[`scripts/state.js:558-569`](../scripts/state.js#L558) already
collapses every row to one of `pass` / `warn` / `fail`, and
`canInstall` is computed from the same data at
[`scripts/state.js:565`](../scripts/state.js#L565). But the UI
exposes the raw per-row verdict and the support-bundle controls
inline with no headline verdict, so the user sees a six-row
engineering panel instead of a single "Ready / Needs attention /
Blocked" decision they can act on.

### 9. Preview-channel messaging must stay explicit (Medium)

The LED preview is reachable today by toggling the Step 4 LED module
([`index.html:659-673`](../index.html#L659)), which causes
`config_string: Ceiling-POE-VentIQ-RoomIQ-LED` to be generated and
matched against the imported preview build. WF-LED-003 pinned the
exposure model: the preview build is **visible in normal mode**, is
**never auto-selected** (`defaultSelectable: false`), and **always
requires acknowledgement** (`requiresAcknowledgement: true`) per
[`scripts/utils/release-channels.js:111-125`](../scripts/utils/release-channels.js#L111).

The acknowledgement panel renders inside the firmware section at
[`index.html:828-833`](../index.html#L828), populated by
`renderChannelAcknowledgementPanel()` near
[`scripts/state.js:5541`](../scripts/state.js#L5541), and the
install gate ingests it via `channelAcksSatisfied` at
[`scripts/state.js:3091`](../scripts/state.js#L3091).

Severity is medium because there is no current regression — this is a
policy guardrail. Any restructuring done by WF-UX-002, WF-UX-003,
WF-UX-004, or WF-UX-005 **must preserve** the Preview badge, the
preview-channel acknowledgement checkbox, the `defaultSelectable:
false` semantics (a preview build never wins when the user has not
opted in), and the
`__tests__/release-channel-ui.test.js`
*"WF-LED-003 — LED preview exposure model …"* describe block.

### 10. Visible internal Admin note (Low / quick fix)

[`index.html:1005`](../index.html#L1005) renders, inside every
option-info popover that any module/option chip can open, the
literal string:

> Admin note: edit these info popovers in
> `scripts/content/option-tooltips.js`.

The string is rendered as visible text inside
`.option-info-popover__edit-hint`. It is neither `sr-only` nor
`hidden`. End users see it every time they tap any info chip.

## Recommended target flow

A confidence-first first-run journey, designed around the policy
constraints above. Numbering matches the
[Acceptance criteria for future work](#acceptance-criteria-for-future-work)
section.

1. **Check setup.** A single panel: desktop browser (Chrome, Edge, or
   Opera), USB data cable, close other serial tools. One headline
   verdict ("You're ready" / "Switch browser to continue" /
   "Plug in a USB data cable"). Hardware can be plugged in later, but
   the browser must be capable to proceed.
2. **Identify hardware.** Three entry paths:
   * *"I bought a kit"* — SKU search, deterministic mapping to a
     known firmware profile, skip module config.
   * *"I'm building a custom configuration"* — manual module wizard.
   * *"Recovery / rescue"* — direct entry to Rescue mode.
3. **Pick firmware.** Show the matched stable build with a
   Recommended badge inline. If only a preview build is available,
   render the preview-channel gate inline (badge + warning +
   acknowledgement) before exposing Install. If no build matches,
   render a single "no build available for this configuration"
   state with actionable next steps (switch modules / file a
   request / open Rescue).
4. **Review readiness.** A single verdict — `Ready to install` /
   `Needs attention` / `Blocked` — with per-check details collapsed
   behind a "Why?" disclosure. Support-bundle controls move to
   Diagnostics, not the headline.
5. **Install.** The `<esp-web-install-button>` as the single
   visually dominant CTA. Secondary actions (Download .bin, Copy
   install link, Open Home Assistant) move to a quieter "More
   actions" group below the install card.
6. **Connect Wi-Fi.** Improv handoff inline with the install
   result. (Today this is implicit in `improv: true` on every
   build; the journey does not advertise it strongly enough.)
7. **Finish / Home Assistant.** Link out, surface the discovery
   path, offer to copy the device URL.

## Firmware readiness model

Five states, one phrase per state. WF-UX-002 picks the canonical
wording; this doc records the state contract.

| State | Trigger | Suggested copy direction |
| --- | --- | --- |
| `stable-available` | A `stable`-channel build matches the current selection. | "Ready to install — stable build vX.Y.Z." |
| `preview-available` | Only a `preview`-channel build matches (e.g. LED toggle on). | "A preview build is available. Acknowledge to install." |
| `no-build` | No build in the deployed `manifest.json` matches. | "No build available for this configuration yet." (with "adjust your modules" / "open Rescue" affordances) |
| `rescue` | User has entered Rescue / Recovery. | "Recovery firmware ready — this will overwrite your current configuration." |
| `unsupported-browser` | `capabilities.js` flags Web Serial unavailable. | "Install isn't available in this browser. Open this page in desktop Chrome, Edge, or Opera." |

The three current strings flagged in finding #5 — *"This exact
firmware target is not published yet"*, *"No build selected yet"*,
and the blank Compatible Firmware heading — all collapse into the
`no-build` state with one canonical phrase. The "preview" state
must keep its existing acknowledgement gate from finding #9.

## Preflight model

Today's six rows already carry the right data
([`scripts/state.js:558-569`](../scripts/state.js#L558) produces a
`pass` / `warn` / `fail` verdict per check and combines them into
`canInstall`). The UI surfaces the rows but not the headline.

WF-UX-004 collapses them into one user verdict at the top of the
panel:

| Headline verdict | Trigger | Effect on install |
| --- | --- | --- |
| **Ready to install** | All checks `pass` (pending checks also resolve here — pending is neither warn nor fail). | Install enabled. |
| **Needs attention** | Any check `warn`, no `fail`. | Install enabled only after the existing "Accept preflight warnings" checkbox (matches current `preflightWarningsAcknowledged` semantics at [`state.js:459-462`](../scripts/state.js#L459)). |
| **Blocked** | Any check `fail`. | Install disabled — the override checkbox is hidden because no amount of acknowledgement can lift a hard fail. |

Per-row detail and support-bundle controls move into a "Preflight details"
disclosure so the user is not asked to interpret six parallel rows. The
aggregate verdict must remain a pure function of the existing
`evaluatePreflightPolicy()` output — no new gating logic, no policy
regression for finding #9. The override visibility tightens alongside
the verdict introduction: today the panel shows the "Accept preflight
warnings" checkbox whenever any check is `warn`, including when a `fail`
is also present (ticking it then is a dead end because
`evaluatePreflightPolicy` still returns `canInstall === false`); after
WF-UX-004 the override is shown only when warnings are the *sole*
obstacle. Hard blockers cannot be overridden through this control.

## Preview-channel / LED preview treatment

WF-LED-003 is the binding policy. WF-UX work **must not** change:

* `scripts/utils/release-channels.js` `preview` policy
  (`defaultSelectable: false`, `requiresAcknowledgement: true`,
  `hiddenByDefault: false`, warning copy at
  [`:117`](../scripts/utils/release-channels.js#L117)).
* The LED toggle in Step 4 at
  [`index.html:659-673`](../index.html#L659) as the sole reachable
  affordance for the LED preview.
* The acknowledgement panel mount at
  [`index.html:828-833`](../index.html#L828) and the
  `channelAcksSatisfied` gate at
  [`scripts/state.js:3091`](../scripts/state.js#L3091).
* The Preview badge / warning tone produced by
  `getFirmwareBadges` / `getFirmwareWarnings` in
  [`scripts/utils/release-channels.js:256-313`](../scripts/utils/release-channels.js#L256).
* The `WF-LED-003 — LED preview exposure model …` describe block
  in `__tests__/release-channel-ui.test.js`.

WF-UX-002 / WF-UX-003 may rewrite the *visual* layout of those
elements, but every policy invariant has to round-trip through
the same release-channel utility and the same test guard.

## Kit vs custom configuration split

> **Resolved by WF-UX-006.** Step 1 now exposes three explicit
> path cards — *I bought a kit* / *Custom configuration* /
> *Recovery* — via the static `[data-start-path]` button group at
> [`index.html:202-214`](../index.html#L202). The previous binary
> `[data-config-mode-picker]` radio set survives as a hidden
> back-compat surface (`.config-mode-picker--legacy`,
> `aria-hidden="true"`) so the kit-mode change-listener and older
> share-links keep parsing.

* **Kit path.** Reveals the existing `[data-kit-mode-panel]`
  (catalogue dropdown + summary card + "Most popular" preset
  fallback for users without an SKU). End-to-end the kit path
  applies the only entry in
  [`scripts/data/kits.json:13-41`](../scripts/data/kits.json#L13)
  — `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` →
  `Ceiling-POE-VentIQ-RoomIQ` (stable). LED stays `'none'`, AirIQ
  stays `'none'`, every fan variant stays `'none'`. Provenance,
  release-channel acknowledgement, freshness, and preflight gates
  remain authoritative per
  [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js)
  — kit selection never bypasses them. "Continue with this kit"
  jumps to `min(5, getMaxReachableStep())` (= Step 5) as before.
* **Custom path.** Reveals the new `[data-custom-path-panel]`
  (which keeps `[data-manual-mode-panel]` as a back-compat alias),
  with explanatory copy listing the three Step-4 availability
  outcomes — available / preview-requires-acknowledgement /
  not-installable. "Continue to Core →" advances through the
  normal 5-step wizard. WF-WIZARD-AVAIL-001's per-card pills do
  the heavy lifting in Step 4 (RoomIQ + VentIQ available-stable,
  AirIQ + PWM + DAC no-firmware, Relay design-pending, TRIAC
  blocked, LED available-preview).
* **Recovery path.** Carries `data-rescue-open` so the existing
  delegated handler in
  [`scripts/layout/rescue-modal.js`](../scripts/layout/rescue-modal.js)
  opens the rescue/recovery modal. Recovery does NOT become a
  normal wizard step; the existing rescue firmware / rescue
  manifest / `firmware/rescue/manifest.json` / modal install logic
  is unchanged. Rescue is also still reachable from the header
  trigger at [`index.html:49`](../index.html#L49), the prereq
  panel fallback at [`index.html:112`](../index.html#L112), and
  the post-flash handoff at [`index.html:911`](../index.html#L911).

Path-state plumbing lives in
[`scripts/kit-mode.js`](../scripts/kit-mode.js):
`setPath('kit'|'custom'|'recovery')` layers on top of the legacy
`setMode('kit'|'manual')`; `getCurrentPath()` is exposed via
`__testHooks`. URL contract uses the existing `configmode=`
namespace — `configmode=kit`, `configmode=kit&sku=…`, and the
new canonical `configmode=custom`, with `configmode=manual`
accepted as a back-compat alias. No separate `path=` URL key was
introduced.

The kit catalogue still holds exactly one entry, and expansion of
the catalogue is gated on future product decisions (FanTRIAC
remains blocked under HW-005 + COMPLIANCE-001; LED stays excluded
from Release-One via `firmware/sources.json` `block_tokens`).
WF-UX-006 makes no firmware / manifest / sources / kit /
release-channel / workflow / deployment change.

## Browser support copy policy

Canonical phrase: **"desktop Chrome, Edge, or Opera"** (matches
[`CLAUDE.md:17`](../CLAUDE.md#L17) and the existing top prereq
panel). Every other Web-Serial-required surface lists the same
three browsers, with capability detection per
[`scripts/capabilities.js`](../scripts/capabilities.js) deciding
whether to surface the unsupported-browser banner.

WF-UX-QUICK-001 lands this normalisation across the
[`index.html`, `init-review.js`, `state.js`, and the four
layout/compat modules listed in finding #3](#3-inconsistent-browsersupport-copy-high).
Firefox, Safari, and mobile browsers remain explicitly unsupported
— this PR does **not** change which browsers are eligible, only
the wording.

## Primary CTA policy

The primary action on Step 5 is **install firmware**. Everything
else demotes:

* `<esp-web-install-button>` is the visual focal point of the
  firmware card.
* Download .bin, Copy install link, and Open Home Assistant move
  into a clearly secondary "More actions" group.
* The self-referential "Other options — the main Install button
  is on the firmware card above." label at
  [`index.html:840`](../index.html#L840) is removed by
  WF-UX-003.
* Mobile and desktop expose exactly one primary install
  affordance each — WF-UX-003 kept the mobile-drawer Install at
  [`index.html:969`](../index.html#L969) as a forwarding relay;
  see [Mobile drawer install relay](#mobile-drawer-install-relay)
  below.

The post-install Home Assistant CTA is its own primary in the
post-flash panel ([`index.html:869-873`](../index.html#L869)), not
on the pre-install Step 5 footer. WF-UX-003 demoted the pre-install
`#open-ha-integrations-btn` to `btn-secondary`; the post-flash
`[data-post-flash-ha-open]` button stays `btn-primary`.

### Mobile drawer install relay

The `data-module-summary-install` button at
[`index.html:969`](../index.html#L969) is **not** a duplicate install
path. WF-UX-003 reviewed it and kept it as-is on these grounds:

* It is hidden on desktop. `.wizard-summary { display: none; }` is
  the default at [`css/layout.css:234-236`](../css/layout.css#L234);
  the drawer only becomes visible inside the `≤880px` media query
  at [`css/layout.css:471-486`](../css/layout.css#L471). On desktop
  — the only runtime where Web Serial is supported — the only
  install affordance is the upstream `<esp-web-install-button>` in
  the firmware card.
* On mobile it is a forwarding relay, not an alternate install
  path. The handler at
  [`scripts/state.js:5890-5919`](../scripts/state.js#L5890)
  (`bindSummaryInstallButton`) re-evaluates `policy.canInstall`,
  outstanding channel acknowledgements, and the freshness gate
  before dispatching a click to the real `<esp-web-install-button>
  button[slot="activate"]`. It cannot bypass any install gate.
* Removing it would widen WF-UX-003's scope to deleting the relay
  handler, its disabled-state plumbing at
  [`scripts/state.js:3289-3316`](../scripts/state.js#L3289), and
  two `wizard-state.test.js` fixtures, without changing the
  desktop install hierarchy that the PR set out to clean up.

If a future PR removes the mobile summary drawer wholesale (e.g.
as part of WF-UX-005 / WF-UX-006 mobile-surface decisions), the
relay drops out with it. Until then, WF-UX-003 treats the relay
as out of scope.

## Jargon / label policy

Outcome-first user-facing labels in primary headings; technical
detail in tooltips, popovers, or "specs" disclosures. Concretely:

* Module group titles use the canonical Friendly Name from
  [`CLAUDE.md:23-35`](../CLAUDE.md#L23) (e.g. "Sense360 RoomIQ")
  with the SKU code moved out of the heading into a smaller
  metadata row.
* Header / pinout strings (`J3 sensor bus`, `Fan_GP8403`,
  `TRIAC_Board`) move into a "Hardware specs" disclosure inside
  each card, not the visible inline copy.
* "Firmware target preview" renames to a plain-language label
  (e.g. "Firmware match preview") so the user doesn't have to
  learn what a "firmware target" is.
* `Core R4` only appears when it is actionable — i.e. when the
  user's selection would conflict with an older revision.
* The `airiq.base` / `airiq.pro` entries in
  [`scripts/content/option-tooltips.js:125-164`](../scripts/content/option-tooltips.js#L125)
  are deleted as part of WF-UX-007 (Model/Variant nomenclature is
  banned per [`CLAUDE.md:131-132`](../CLAUDE.md#L131)).

## Quick wins

These three changes are low-risk copy / markup edits that need no
state.js, no release-channel, no kit, no manifest, no test
restructuring. They are the candidates for WF-UX-QUICK-001:

1. Delete the `Admin note: edit these info popovers in
   scripts/content/option-tooltips.js.` paragraph at
   [`index.html:1005`](../index.html#L1005).
2. Normalise every Web-Serial-required string to the canonical
   "desktop Chrome, Edge, or Opera" phrase across the surfaces
   listed in finding #3.
3. Confirm via grep + tests that no other internal-facing string
   (CLAUDE.md / DEVELOPER.md content, file paths, internal task
   IDs) is rendered in user-visible markup.

## Roadmap broken into follow-up PRs

The PRs are ordered by risk; later PRs may reorganise the same
files multiple times, so earlier PRs should aim to be merged
quickly to avoid stacking.

> **Status:** WF-UX-QUICK-001 landed — the visible Admin note was removed
> from the option-info popover, and all user-facing browser-support copy was
> normalised to the canonical phrase **`Chrome, Edge, or Opera`**. The Opera
> guidance in `scripts/capabilities.js` was promoted to first-class supported
> ("You're using a supported browser."), and the `BROWSER_MESSAGES` blocks in
> `scripts/init-review.js` and `scripts/layout/rescue-modal.js` were collapsed
> to a single canonical sentence each (one Web Serial API anchor, no separate
> Chrome/Edge download links). Static-HTML regression checks live in
> `__tests__/a11y-static-html.test.js` (`WF-UX-QUICK-001` describe block).
> No firmware, manifest, kit, source, workflow, service-worker, install,
> preflight, Release-One, LED-preview-exposure, or FanTRIAC-block change.

> **Status:** WF-UX-002 landed — the three competing readiness strings
> ("This exact firmware target is not published yet", "No build selected yet",
> the blank `Compatible Firmware:` heading) collapse into a single
> presentation-only helper `getFirmwareReadiness()` in `scripts/state.js` that
> returns one of six canonical tags (`no-selection`, `stable-ready`,
> `preview-ready`, `no-build`, `rescue-ready`, `unsupported-browser`) plus the
> approved headline/body copy from the [Firmware readiness model](#firmware-readiness-model)
> table. Three render sites read from the helper: Step 4's
> `updateFirmwareTargetPreview()` warning, Step 5's
> `updateCompatibleFirmwareHeading()` selection span (now non-blank under the
> `no-build` state), and the sidebar/mobile firmware mini-card empty-state in
> `scripts/layout/state-summary.js` (`renderFirmwareSummary` →
> `applyFirmwareEmptyCopy`). The `renderFirmwareNotAvailable()` H4 also pulls
> from the canonical headline so the "no published firmware" message reads
> identically in every surface. Stable, preview, and rescue paths are
> unchanged at the policy layer — `release-channels.js` (defaultSelectable,
> requiresAcknowledgement, hiddenByDefault), the channel-acknowledgement
> install gate, and the WF-LED-003 LED preview exposure model are untouched.
> The stale Step 1 quick-start presets were resolved by retargeting the
> "Most popular" preset to the published Release-One config
> (`Ceiling-POE-VentIQ-RoomIQ`) — same end state as the
> `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` kit — and removing the second preset
> that used to point at `Ceiling-USB`. No LED preview preset was added; the
> LED preview path stays gated by the existing module toggle plus the
> `channel:preview` acknowledgement. Tests live in
> `__tests__/readiness-strings.test.js` (the new readiness contract),
> `__tests__/a11y-static-html.test.js` (preset/manifest alignment + canonical
> copy in static HTML), and refreshed assertions in
> `__tests__/wizard-state.test.js`, `__tests__/firmware-not-available.test.js`,
> and `__tests__/module-selection-guidance.test.js`. No firmware, manifest,
> source, kit, workflow, service-worker, preflight, Release-One,
> LED-preview-exposure, or FanTRIAC-block change.

| PR | Scope | Risk | Acceptance criteria |
| --- | --- | --- | --- |
| **WF-UX-QUICK-001** ✅ landed | Removed the Admin note (was at [`index.html:1005`](../index.html#L1005)). Normalised browser-support copy across [`index.html:204`](../index.html#L204), [`:729`](../index.html#L729), [`:1012`](../index.html#L1012), [`scripts/init-review.js:19-21`](../scripts/init-review.js#L19), [`scripts/state.js:5075`](../scripts/state.js#L5075), [`scripts/layout/rescue-modal.js:21-23`](../scripts/layout/rescue-modal.js#L21), [`scripts/layout/sensor-health-panel.js:82`](../scripts/layout/sensor-health-panel.js#L82), [`scripts/layout/init-splitview.js:103-106`](../scripts/layout/init-splitview.js#L103), [`scripts/layout/device-info-panel.js:93`](../scripts/layout/device-info-panel.js#L93), [`scripts/compat-config.js:617`](../scripts/compat-config.js#L617), and the five `scripts/capabilities.js` messages flagged in finding #3 (including the previously self-contradictory Opera guidance), to the canonical phrase **`Chrome, Edge, or Opera`**. | Low | (a) ✅ No `Admin note` string in static HTML — pinned by `__tests__/a11y-static-html.test.js`. (b) ✅ `grep -RIn "Chrome or Edge\|Chrome/Edge\|Chrome and Edge"` against `index.html`/`scripts/` returns zero hits. (c) ✅ `__tests__/preflight-capabilities.test.js`, `__tests__/release-channel-ui.test.js`, and `npm test -- --ci` pass without modification. (d) ✅ Release-One install behaviour and LED preview exposure unchanged. |
| **WF-UX-002** | Firmware-readiness state cleanup. Replace the three competing strings at [`index.html:714`](../index.html#L714), [`:962`](../index.html#L962), and the blank-heading path through [`scripts/state.js:5430-5450`](../scripts/state.js#L5430) with the five-state model in [Firmware readiness model](#firmware-readiness-model). Also fix the stale quick-start presets at [`index.html:296-307`](../index.html#L296) / [`scripts/recommended-bundle.js:3-8`](../scripts/recommended-bundle.js#L3) — either point them at a currently published `config_string` or remove them. | Medium | (a) The five readiness states map 1:1 to five canonical strings, asserted in a new `__tests__/readiness-strings.test.js`. (b) Clicking either Step 1 preset on a build of the in-repo manifest resolves to a published `config_string`. (c) Preview build still requires `channel:preview` acknowledgement (finding #9 invariant). (d) `manifest-health` and `kits-json` tests green. |
| **WF-UX-003** ✅ landed | Primary CTA + review-page hierarchy. The `<esp-web-install-button>` rendered into `#compatible-firmware` by [`scripts/state.js:5122`](../scripts/state.js#L5122) remains the sole real install affordance. A short `firmware-section__lead` paragraph now precedes [`index.html:813`](../index.html#L813) and names the action ("Click **Install Firmware** on the firmware card below to flash your hub over USB."). The self-referential *"Other options — the main Install button is on the firmware card above."* paragraph that previously lived at `index.html:840` is removed, the wrapping container is renamed from `.primary-action-group` to `.secondary-action-group` (markup semantics now match the UX, with the two `scripts/state.js` selectors at `:3331` and `:5820` and every test fixture under `__tests__/*.test.js` rolled forward in the same PR), and an `<h3 class="secondary-actions-label">More actions</h3>` introduces the demoted controls. `#open-ha-integrations-btn` in the Step 5 footer is demoted from `btn-primary` to `btn-secondary` so it stops competing with the real Install button (the post-flash next-step `[data-post-flash-ha-open]` at [`index.html:872`](../index.html#L872) stays `btn-primary` because it is the dominant action *after* a successful flash). The mobile drawer Install at [`index.html:969`](../index.html#L969) stays in place — see [Mobile drawer install relay](#mobile-drawer-install-relay) below. | Medium | (a) ✅ One install affordance per viewport on desktop (the only supported install runtime — `.wizard-summary` is `display: none` outside the `≤880px` media query at [`css/layout.css:234-236, 471-486`](../css/layout.css#L234)). (b) ✅ `getRequiredAcknowledgements` and `channelAcksSatisfied` gating unchanged — install button stays disabled until acknowledgements are satisfied (no edit to [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js) and no edit to the `channelAcksSatisfied` site at [`scripts/state.js:3091`](../scripts/state.js#L3091)). (c) ✅ `__tests__/release-channel-ui.test.js` green; the WF-LED-003 preview exposure model interlock survives. (d) ✅ Provenance + freshness gates untouched; `__tests__/firmware-provenance-gating.test.js` and `__tests__/cache-freshness.test.js` pass after the test-fixture rename. (e) ✅ `__tests__/a11y-static-html.test.js` gained a `WF-UX-003 — primary CTA hierarchy on Step 5` describe block that pins the self-referential copy removal, the firmware-section lead, the `secondary-action-group` rename, the "More actions" heading, the Open-HA demotion, the demoted-controls accessible-name survival, the post-flash HA primary preservation, and the absence of a static-markup duplicate install button. |
| **WF-UX-004** ✅ landed | Preflight redesign. The six per-check rows at [`index.html:737-796`](../index.html#L737) are now demoted under a native `<details data-preflight-details>` disclosure, and a single headline verdict card (`[data-preflight-verdict]`, `data-verdict="ready|attention|blocked"`) sits above them with the canonical copy from [Preflight model](#preflight-model). Verdict derivation is a pure helper `derivePreflightVerdict(checks)` (added next to `evaluatePreflightPolicy()` at [`scripts/state.js:559-619`](../scripts/state.js#L559)) — `evaluatePreflightPolicy()` itself is unchanged, so the verdict and the install gate read the same `checks` array and cannot disagree. The "Copy support bundle" / "Download JSON" controls relocated from the panel header into a `Diagnostics` subsection inside the disclosure (same `[data-copy-support-bundle]` / `[data-download-support-bundle]` / `[data-preflight-support-actions]` data hooks, same handlers). The disclosure auto-opens for non-ready verdicts on first render and stays where the user last toggled it afterwards. The warning-override visibility tightened to `warn ≥ 1 && fail === 0` — hard blockers no longer expose an override that can't unlock install. The pre-flash checklist, manifest-freshness recheck/ack controls, channel acknowledgement panel, install gating compound, and capability detection are untouched. | Medium | (a) ✅ Headline verdict derives purely from the same `checks` array `evaluatePreflightPolicy()` consumes; no new gating logic. (b) ✅ `__tests__/preflight-gating.test.js` gained a `WF-UX-004 — preflight verdict` describe block pinning verdict derivation, override visibility refinement, override-cannot-bypass-hard-blockers, details auto-open / user-toggle-wins, and support-bundle availability; the existing 19 tests remain unchanged. (c) ✅ `__tests__/a11y-static-html.test.js` gained a `WF-UX-004 — preflight verdict + details disclosure` describe block pinning the section labelling, the verdict ARIA hooks + default copy, the disclosure shape, the Diagnostics subsection, and the override default-hidden + `aria-describedby`. (d) ✅ The "Accept preflight warnings" master checkbox semantics survive (`preflightWarningsAcknowledged` still flips canInstall when warns are the sole obstacle). (e) ✅ Manifest-freshness recheck + ack control still wired (unchanged code path, unchanged tests). (f) ✅ Preview acknowledgement remains a separate gate (`channelAcksSatisfied`) and is untouched. (g) ✅ Release-One install behaviour and LED preview exposure unchanged. |
| **WF-UX-005** ✅ landed | Step-model cleanup. Aligned desktop sidebar, mobile progress bar, and every step `<h2>` on one coherent step model — canonical short labels **Start / Core / Power / Modules / Review** on both stepper surfaces, descriptive H2s **Start with your hardware / Confirm your Core / Choose power / Pick modules / Review and install**. Swapped the Step 1 and Step 2 panel markup in `index.html` so DOM source order is step-1 → step-2 → step-3 → step-4 → step-5. **Decisions and non-goals:** Step 2 was **not** collapsed (one Core radio survives as the `voice='none'` share-link back-compat placeholder); `id="step-N"` / `data-step="N"` / `id="step-N-heading"` / `aria-labelledby` wiring untouched; the hidden `mounting=ceiling` default input still lives inside Step 1; no `scripts/state.js`, `scripts/navigation.js`, CSS, service-worker, firmware, manifest, sources, kit, or workflow file was modified. The `<h2>` text changes flow into screen-reader announcements automatically because `scripts/navigation.js:goToStep()` already announces `Step N of 5: <h2 text>`. | Medium / high | (a) ✅ Step 1 has the same label across desktop, mobile, and `<h2>` (Start / Start / Start with your hardware), and steps 2–5 are likewise consistent — pinned by `__tests__/a11y-static-html.test.js` `WF-UX-005 — step model cleanup`. (b) ✅ DOM source order matches user-visible order (`step-1.compareDocumentPosition(step-2)` confirms `DOCUMENT_POSITION_FOLLOWING`; legacy `Get started` / `Mounting` / `Pick a starting point` / `Configure your Core` / `How is the hub powered?` / `Add expansion modules` / `Review &amp; install` strings are absent). (c) ✅ `getMaxReachableStep()` unchanged; `__tests__/wizard-state.test.js` green (the `'fresh visit … lands on Step 1: Start'` rename + stale-comment updates are the only test edits there). (d) ✅ Step 5 review surface unchanged — preflight verdict, channel acknowledgement, primary CTA hierarchy, install gating, and module-availability classifier all untouched. (e) ✅ Release-One stable install path byte-identical with the LED toggle off; LED preview still gated by `channel:preview` acknowledgement (WF-LED-003 invariant intact). (f) ✅ FanTRIAC remains blocked under HW-005. |
| **WF-UX-006** ✅ landed | Kit / Custom / Recovery path split at Step 1. Replaced the legacy binary `[data-config-mode-picker]` radio set with three `<button data-start-path="kit|custom|recovery">` cards in [`index.html:202-214`](../index.html#L202). Customer-facing copy is **"I bought a kit" / "Custom configuration" / "Recovery"** with risk-specific descriptions ("Some modules are not yet available in WebFlash and will be clearly marked." / "Use this only for recovery or bootloader repair."). The kit card reveals the existing `[data-kit-mode-panel]` (kit catalogue + dropdown + summary + the relocated "Most popular" preset card as a no-SKU fallback). The custom card reveals a new `[data-custom-path-panel]` (which keeps `[data-manual-mode-panel]` as a back-compat alias) and advances through the normal 5-step wizard via the existing `[data-next]` button. The recovery card carries `data-rescue-open` so the existing rescue-modal delegated click handler in [`scripts/layout/rescue-modal.js`](../scripts/layout/rescue-modal.js) opens the dialog — rescue firmware, the rescue manifest, and the modal's install logic are untouched. [`scripts/kit-mode.js`](../scripts/kit-mode.js) gains a `setPath('kit'\|'custom'\|'recovery')` layer on top of the existing `setMode('kit'\|'manual')`; `setPath` exposes `getCurrentPath` via `__testHooks`. The legacy `[data-config-mode-input]` radios survive as a hidden back-compat surface (`.config-mode-picker--legacy`, `aria-hidden="true"`, `hidden`) so the kit-mode change-listener and older share-links keep parsing. URL contract: `configmode=kit` + `configmode=kit&sku=…` keep working; `configmode=custom` is the new canonical alias; `configmode=manual` is accepted as a back-compat alias. No new `path=` URL key. **Decisions and non-goals:** the path value is presentation-only and never enters config strings, manifests, kits, release-channel policy, or the install gate; the recommended preset survives inside the kit panel as the no-SKU fallback with the "Most popular" badge intact (WF-UX-002 invariant preserved); Step 2 was NOT collapsed (WF-UX-005 step-model invariant intact); no firmware / manifest / sources / `scripts/data/kits.json` / `scripts/utils/release-channels.js` / `scripts/utils/firmware-readiness.js` / `scripts/utils/module-availability.js` / `sw.js` / workflow / rescue-modal change. | Higher | (a) ✅ Step 1 exposes exactly three `[data-start-path]` buttons (`kit`, `custom`, `recovery`) — pinned by `__tests__/a11y-static-html.test.js` `WF-UX-006 — Step 1 kit / custom / recovery path split`. (b) ✅ Each path card is a real `<button type="button">` with an `aria-describedby`-linked description. (c) ✅ Kit-path end-to-end produces `config_string === "Ceiling-POE-VentIQ-RoomIQ"`, `state.led === 'none'`, `state.airiq === 'none'`, `state.fan === 'none'` — pinned by `__tests__/wizard-state.test.js` `WF-UX-006 — kit path resolves only to Release-One`. (d) ✅ Custom-path WF-WIZARD-AVAIL-001 availability classifications preserved (RoomIQ + VentIQ available-stable, AirIQ + PWM + DAC no-firmware, Relay design-pending, TRIAC blocked, LED available-preview) — pinned by `__tests__/wizard-state.test.js` `WF-UX-006 — custom path preserves unavailable-module honesty`. (e) ✅ Recovery card carries `data-rescue-open` and delegates to the existing rescue/recovery modal — pinned by `__tests__/kit-mode.test.js` `WF-UX-006 — Step 1 path selector`. (f) ✅ URL hydration: `configmode=kit`, `configmode=kit&sku=…`, `configmode=custom`, `configmode=manual` (back-compat), and `mount=…&power=…` (legacy manual share-link) all resolve to the correct path. (g) ✅ WF-UX-005 step labels (Start / Core / Power / Modules / Review and the descriptive H2s) unchanged; `__tests__/a11y-static-html.test.js` `WF-UX-005 — step model cleanup` green. (h) ✅ WF-LED-003 preview-channel acknowledgement and FanTRIAC HW-005 block intact; `__tests__/release-channel-ui.test.js` and `__tests__/module-availability.test.js` green. (i) ✅ Release-One stable install path byte-identical with the new path split. (j) ✅ No firmware / manifest / sources / kit / release-channel / workflow / deployment change. |
| **WF-UX-007** ✅ landed | Jargon and module-label cleanup per [Jargon / label policy](#jargon--label-policy). Step 4 primary card / group titles are now **outcome-first** (`Room sensing`, `Air quality sensing`, `Bathroom air sensing`, `Status LED ring`, `Fan and switching control`, `Fan relay control`, `PWM fan control`, `Analog fan control`, `TRIAC fan control`) with the technical Friendly Name + SKU layered into a secondary `[class~="module-group__meta"]` / `[class~="module-card__meta"]` line (`Sense360 RoomIQ · S360-200`, etc.). The Fan group H3 + chevron `aria-label` swap to `Fan and switching control` is static-markup only — `MODULE_LABELS` in [`scripts/state.js`](../scripts/state.js) still resolves the fan group to `"Fan / Switching"` so diagnostics / firmware-nearest / `__tests__/diagnostics-bundle.test.js` / `__tests__/firmware-not-available.test.js` keep the locked technical-secondary label. Pin/header / Core-rev technical detail stays in the existing `module-card__specs` definition list. The orphan `airiq.base` / `airiq.pro` entries at [`scripts/content/option-tooltips.js:125-164`](../scripts/content/option-tooltips.js#L125) are removed, and `airiq.none` is kept because the popover lookup contract still falls through to `null` cleanly when the wizard does not target it. **Decisions and non-goals:** the kit summary card at [`index.html:258-260`](../index.html#L258) was deliberately left alone (it is a kit listing, not a Step 4 primary label); the bathroom-toggle description / RoomIQ pairing hint / VentIQ firmware-target hint / fan variant warning / TRIAC firmware-target copy are all locked by `__tests__/module-selection-guidance.test.js` and remain unchanged; `MODULE_KEYS` / `MODULE_LABELS` / `MODULE_VARIANT_LABELS` / `MODULE_SEGMENT_FORMATTERS` / `parseConfigStringState` / `scripts/data/module-requirements.js` field values / `scripts/layout/state-summary.js` FIELD_MAP / `scripts/recommended-bundle.js` / `scripts/kit-mode.js` summary formatting / `scripts/utils/release-channels.js` / `scripts/utils/firmware-readiness.js` / `scripts/utils/module-availability.js` are all untouched; no firmware / manifest / `firmware-*.json` / `firmware/sources.json` / `scripts/data/kits.json` / `sw.js` / `_headers` / workflow file changed. | Medium | (a) ✅ Step 4 module-card / group primary titles are outcome-first — pinned by `__tests__/a11y-static-html.test.js` `WF-UX-007 — outcome-first Step 4 module labels with technical secondary tier` and `__tests__/module-selection-guidance.test.js` `WF-UX-007 — Step 4 primary labels are outcome-first; technical names move to the secondary tier`. (b) ✅ Technical Friendly Names + SKUs still discoverable in the secondary tier (`.module-group__meta` / `.module-card__meta` line + `.module-card__specs` `<dl>`) — pinned alongside the outcome titles. (c) ✅ AirIQ / VentIQ / RoomIQ / LED no longer appear as the standalone primary card label anywhere in Step 4. (d) ✅ Orphan `airiq.base` / `airiq.pro` entries are removed and the lookup falls through to `null` cleanly — pinned by `__tests__/option-tooltips.test.js`. (e) ✅ Bathroom toggle / RoomIQ pairing / VentIQ firmware-target / fan variant warning / TRIAC firmware-target copy unchanged — pinned by the existing `module-selection-guidance.test.js` assertions. (f) ✅ Config strings, manifest matching, kit matching, URL aliases, release channels, preview acknowledgement, module availability states, TRIAC HW-005 block, Voice quarantine, Release-One stable path, LED preview path, diagnostics / support technical labels — all byte-identical to pre-WF-UX-007. (g) ✅ No firmware / manifest / source / kit / workflow / deployment change. |
| **WF-HW-TEST-001** / **WF-HW-TEST-002** | Real-hardware flash + Improv handoff proof. Operator runs an actual flash against a Sense360 Core over Web Serial, captures the Improv handoff to Wi-Fi, exercises the post-flash panel, and records gaps that only show up on real serial. Findings filed as follow-up PRs. Proof container lives at [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md) (status: **pending — operator hardware test required**; WF-HW-TEST-001 captured pre-flight live-deployment evidence and the operator procedure; WF-HW-TEST-002 was the planned operator-evidence-collection follow-up but **no operator evidence was supplied**, so every proof row stays `pending` and no row was flipped to a recorded outcome by WF-HW-TEST-002 — LED preview channel, FanTRIAC blocked status, `REQUIRED_CONFIGS`, kits, manifest, firmware, and workflow surfaces are all unchanged by WF-HW-TEST-002, and `S360-300-BENCH-001` / RELEASE-007 remain separate gates that WF-HW-TEST-002 does **not** satisfy). | Hardware / operator | (a) Transcript or screenshot pair attached. (b) Any new findings filed as separate PRs, not folded into this one. (c) Recovery / rescue flow exercised against a real device. (d) WF-LED-003 preview-channel exposure verified end-to-end (LED toggle → preview ack → install) at least once before larger UX restructure lands. |
| **WF-WIZARD-AVAIL-001** ✅ landed | Module availability gating. Introduced [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js), a presentation-only classifier that maps every (module, variant) pair and every assembled `config_string` to one of seven states (`available-stable`, `available-preview`, `no-firmware`, `design-pending`, `blocked`, `legacy-only`, `hidden`). The classifier reads from the loaded manifest's `config_string`/`channel` set (derived in `state.js` via `deriveManifestIndex`) and from static per-variant overrides in the helper. Static overrides win — they encode reasons the manifest can't carry on its own. Current decisions, pinned by `__tests__/module-availability.test.js` and `__tests__/wizard-state.test.js`'s `WF-WIZARD-AVAIL-001 — module availability runtime integration` block: RoomIQ (S360-200) → `available-stable` (manifest-derived); VentIQ (S360-211) → `available-stable` (manifest-derived); LED (S360-300) → `available-preview` (manifest-derived; gated by the existing `channel:preview` acknowledgement); AirIQ (S360-210) → `no-firmware` (static override — documented hardware, no current build); Relay (S360-310) → `design-pending` (static override — no S360-310 schematic uploaded upstream); PWM (S360-311) → `no-firmware` (static override — S360-311-R4 schematic uploaded upstream in `sense360store/esphome-public`, no WebFlash build); DAC (S360-312) → `no-firmware` (static override — S360-312-R4 schematic uploaded upstream, no WebFlash build); TRIAC (S360-320) → `blocked` (static override — HW-005 + COMPLIANCE-001 still open despite the S360-320-R4 schematic upload; subsequently upgraded by WF-TRIAC-001 to `advanced-manual-warning` — see the row below); Voice → `legacy-only` (internal Core placeholder; `voice: 'none'` retained for share-link back-compat). Step 4 renders a per-card availability pill + detail copy with a `data-availability-state` hook. TRIAC originally gained an `is-blocked` affordance — radio is `disabled`, card is dimmed, accessibility name is set (later replaced by `is-advanced-warning` under WF-TRIAC-001). No schematic PDFs are committed in WebFlash; upstream schematic evidence is referenced only in copy and will be handled by `sense360store/esphome-public` follow-ups. The WF-UX-002 readiness body copy in `firmware-readiness.js` is unchanged; the new classification surfaces only through pills + data hooks. **Unchanged by this PR:** `firmware/*`, `manifest.json`, `firmware-*.json`, `firmware/sources.json`, `scripts/data/kits.json`, `scripts/utils/release-channels.js`, `scripts/utils/firmware-readiness.js`, `sw.js`, every workflow under `.github/workflows/`, `__tests__/fixtures/esphome-product-catalog.json`, `scripts/validate-product-import-readiness.js`. No `REQUIRED_CONFIGS` change, no LED-stable promotion, no FanTRIAC unblock, no AirIQ/Relay/PWM/DAC firmware introduction. | Medium | (a) ✅ Customer cannot mistake docs-only / design-pending / blocked modules for installable hardware — per-card pill + detail copy + `data-availability-state` data hook. (b) ✅ Voice is not customer-facing (`__tests__/a11y-static-html.test.js`). (c) ✅ AirIQ / Relay / PWM / DAC selectable for planning but classified non-installable. (d) ✅ TRIAC visible but radio disabled + `is-blocked` class (relaxed to selectable `is-advanced-warning` under WF-TRIAC-001). (e) ✅ Release-One stable install path byte-identical (`__tests__/release-channel-ui.test.js`, `__tests__/manifest-health.test.js` green). (f) ✅ LED preview still requires `channel:preview` acknowledgement (`__tests__/release-channel-ui.test.js` WF-LED-003 describe block intact). (g) ✅ No firmware / manifest / source / kit / workflow file changed. |
| **WF-TRIAC-001** ✅ landed | Advanced/manual-warning runtime UX for Sense360 TRIAC (S360-320). Added an eighth availability state `advanced-manual-warning` to [`scripts/utils/module-availability.js`](../scripts/utils/module-availability.js) (alongside the existing seven), with label **"Advanced / manual only"**, tone `danger`, and a load-bearing detail string that names every non-negotiable invariant: TRIAC controls mains-connected loads, is **not compliance-certified by WebFlash**, **not Release-One**, **not a kit / default option**, **not recommended**, and **no installable firmware has been imported yet**. Moved the `fan.triac` static override in [`scripts/data/module-requirements.js`](../scripts/data/module-requirements.js) from `state: 'blocked'` to `state: 'advanced-manual-warning'`. The TRIAC card now ships with an `is-advanced-warning` affordance (radio enabled, card border / inner styled danger-tone) and a sibling `[data-advanced-warning-region]` in [`index.html`](../index.html) that reveals only while TRIAC is the live selection. The region carries the load-bearing risk copy verbatim and an inline `[data-advanced-warning-acknowledge]` checkbox. New ack plumbing in [`scripts/state.js`](../scripts/state.js): a session-only `advancedWarningAcknowledgements` `Map<string,true>` keyed by `${moduleKey}:${variantKey}`, with helpers `isAdvancedWarningAcknowledged`, `setAdvancedWarningAcknowledged`, `clearAdvancedWarningAck`, `clearAdvancedWarningAcks`, `getActiveAdvancedWarningSelections`, `getOutstandingAdvancedWarningAcknowledgements`, `pruneInactiveAdvancedWarningAcks`, and `updateAdvancedWarningRegions`. The install gate (`updateFirmwareControls`) gained a new `advancedWarningAcksSatisfied` clause AND-ed into `readyToFlash`, with parallel tooltip / helper-text branches in every install-control block (Download .bin, Copy install link, esp-web-install activate button, mobile summary install). The ack is **orthogonal** to channel acknowledgements (preview / beta / development / deprecated); the WF-LED-003 preview acknowledgement model is unchanged. TRIAC firmware-target hint copy in [`index.html`](../index.html) rewritten to reflect the advanced/manual-warning posture and the not-imported-yet contract. **Decisions and non-goals:** advanced/manual-warning is **not a compliance certification claim** — it is an in-installer warning gate; the wizard's six canonical firmware-readiness headlines (WF-UX-002) are unchanged; the `blocked` state stays exported for any future genuinely-blocked module (no current consumers after this PR); the `blockedTokens` option name on `classifyConfigString` is kept as a back-compat alias for `advancedWarningTokens`; no firmware / manifest / `firmware-*.json` / `firmware/sources.json` / `scripts/data/kits.json` / `scripts/utils/release-channels.js` / `scripts/utils/firmware-readiness.js` / `scripts/import-firmware-sources.py` / `scripts/gen-manifests.py` / `scripts/validate-product-import-readiness.js` / `scripts/smoke-test-deployment.py` / `sw.js` / `_headers` / `.github/workflows/*` / `__tests__/fixtures/esphome-product-catalog.json` file was changed. **Unchanged by this PR:** Release-One stable artifact + manifest entry + kit + `REQUIRED_CONFIGS` membership (still `["Ceiling-POE-VentIQ-RoomIQ","Rescue"]`); LED preview artifact + channel:preview acknowledgement + manifest-only WF-LED-003 exposure; Rescue artifact + manifest; the `firmware/sources.json` `block_tokens` import-time block (FanTRIAC stays import-blocked under HW-005 + COMPLIANCE-001 — visibility in the wizard is **not** the same as import or installability). FanTRIAC remains not Release-One, not `REQUIRED_CONFIGS`, not kit / default, not recommended, not auto-selected, not compliance-certified. | Higher | (a) ✅ TRIAC card visible + selectable in the custom path (`is-advanced-warning`, `data-availability-state="advanced-manual-warning"`, pill text "Advanced / manual only", `aria-disabled` absent) — pinned by `__tests__/a11y-static-html.test.js` `WF-TRIAC-001 — advanced/manual-warning region static markup` and `__tests__/wizard-state.test.js` `WF-TRIAC-001 — TRIAC card gains the advanced/manual-warning affordance`. (b) ✅ Inline advanced-warning region revealed only while TRIAC is the live selection; ack checkbox drives `advancedWarningAcknowledgements`; deselecting TRIAC clears the stored ack — pinned by `__tests__/wizard-state.test.js` `WF-TRIAC-001 — advanced/manual-warning runtime integration`. (c) ✅ Install gate keeps `readyToFlash === false` for TRIAC selection without ack, even with a synthetic FanTRIAC manifest build (defense-in-depth) — pinned by the same describe block. (d) ✅ TRIAC selected against the real manifest (no FanTRIAC build) keeps install disabled even with the ack checked (no `currentFirmware` resolves) — pinned by the same describe block. (e) ✅ Release-One stable kit selection clears any prior TRIAC ack and never auto-picks TRIAC. (f) ✅ LED preview path unchanged: classification still `available-preview`, preview-channel acknowledgement still required, advanced-warning ack does NOT apply — pinned by `__tests__/release-channel-ui.test.js` WF-LED-003 describe block (green) and the WF-TRIAC-001 cross-check. (g) ✅ Eight availability states (`available-stable`, `available-preview`, `no-firmware`, `design-pending`, `blocked`, `advanced-manual-warning`, `legacy-only`, `hidden`) — pinned by `__tests__/module-availability.test.js`. (h) ✅ Recommended bundle (`scripts/recommended-bundle.js` `RECOMMENDED_STATE`) and kit-mode (`scripts/data/kits.json`) untouched. (i) ✅ No firmware / manifest / source / kit / workflow / deployment / `REQUIRED_CONFIGS` change. (j) ✅ WF-UX-002 six canonical firmware-readiness states unchanged; no seventh state introduced. |

Recommended sequencing: `WF-UX-QUICK-001` (immediate), then
`WF-UX-002` and `WF-UX-007` in either order (both relatively
contained), then `WF-UX-003` → `WF-UX-004` → `WF-UX-005` →
`WF-UX-006` (each may overlap structurally with the next). Run
the `WF-HW-TEST-001` / `WF-HW-TEST-002` operator flash after
`WF-UX-002` lands so the readiness-string copy is exercised on a
real flash; rerun before any larger restructure. As of `WF-UX-007`,
the only remaining item in the original sequence is the
operator-only `WF-HW-TEST-001` / `WF-HW-TEST-002` chain — and as
of WF-HW-TEST-002 it is still **pending — operator hardware test
required** because no operator evidence has been supplied yet (the
WF-HW-TEST-002 follow-up was a docs checkpoint only).

## Hardware/operator validation still required

The PRs above are scoped so each can land without real-hardware
flashing. The following gates still require operator validation
and are recorded under the `WF-HW-TEST-001` / `WF-HW-TEST-002`
chain (WF-HW-TEST-002 did not supply operator evidence; every
gate below remains **pending — operator hardware test required**
and the proof container at
[`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md)
flips no row from `pending` to a recorded outcome):

* End-to-end `<esp-web-install-button>` flash against a real
  S360-100 Core over Web Serial. Verifies that the wizard's
  install path actually reaches the upstream component without a
  regression introduced by any UX restructure.
* Improv Wi-Fi handoff after a successful flash. `improv: true` is
  in every non-rescue build ([`manifest.json:31`](../manifest.json),
  [`:96`](../manifest.json), `firmware-0.json`, `firmware-1.json`),
  but the journey does not surface it strongly; WF-UX-003 / WF-UX-004
  changes need to be exercised on a real device.
* `navigator.serial` connect/disconnect-driven preflight verdicts:
  connection-quality and device-visibility checks at
  [`scripts/state.js:347-388`](../scripts/state.js#L347) only
  resolve once a real port has been opened.
* Post-flash panel state-machine on real device boot
  ([`index.html:851-897`](../index.html#L851)) — the post-flash
  validation and handoff panels are unobserved without real
  hardware.
* Rescue / recovery mode against an actually-bricked device. Today
  Rescue can be opened from the header trigger
  ([`index.html:44-50`](../index.html#L44)) but the unbrick path
  is unverified without a partially-bricked unit.
* LED preview path end-to-end on a S360-300-equipped Core, gated
  on S360-300 bench verification per
  [`docs/led-preview-import-plan.md`](led-preview-import-plan.md).

## Acceptance criteria for future work

WF-UX-001 itself has these acceptance criteria:

1. `docs/wizard-ux-roadmap.md` exists and audits the wizard
   end-to-end with citations.
2. Findings are severity-classified (High / Medium / Low).
3. A target first-run flow is recorded.
4. Quick wins are separated from larger restructuring.
5. Improvements are split into multiple future PRs with per-PR
   acceptance criteria.
6. Hardware/operator validation gaps are explicit.
7. No runtime UI behaviour changes occur in this PR.
8. Release-One install behaviour is unchanged.
9. LED preview exposure is unchanged (WF-LED-003 policy intact).
10. FanTRIAC remains blocked under HW-005.

Per-PR criteria are recorded in the
[Roadmap table](#roadmap-broken-into-followup-prs); each follow-up
PR must meet its row's criteria before merging.

## Do-not-change guardrails

The following invariants must survive every WF-UX PR until the
matching upstream / hardware preconditions land:

* **Release-One install path** stays byte-identical with the LED
  toggle off — `Ceiling-POE-VentIQ-RoomIQ` resolves to the
  stable Release-One build via the existing
  [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js)
  gate.
* **LED preview exposure model.** Visible in normal mode, never
  auto-selected, always behind the `channel:preview`
  acknowledgement. WF-LED-003 invariants in
  [`docs/led-preview-import-plan.md`](led-preview-import-plan.md)
  remain authoritative.
* **`REQUIRED_CONFIGS`** stays production-only
  (`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`). WF-UX work does
  not promote LED.
* **FanTRIAC stays blocked** under HW-005. No
  `firmware/sources.json` `block_tokens` change.
* **No firmware import, no manifest regeneration, no new kit, no
  new release mode, no new preview toggle** until the matching
  upstream / hardware proof lands.
* **`__tests__/manifest-health.test.js`,
  `__tests__/manifest-required-configs.test.js`, and
  `__tests__/product-catalog-alignment.test.js`** keep passing
  on every WF-UX PR.
* **Provenance, signing, and freshness gates** in `state.js`
  remain pure — UX restructuring rewrites the *presentation*, not
  the *policy*.

## See also

* [`docs/ux-roadmap.md`](ux-roadmap.md) — May-2026 external
  review. Strategic vision; superseded as the live-audit roadmap by
  this document, but its principles (confidence-first install,
  prerequisites earlier, Wi-Fi explicit, primary/secondary action
  split) still hold.
* [`docs/led-preview-import-plan.md`](led-preview-import-plan.md) —
  WF-LED-001 / WF-LED-002 / WF-LED-003 history; the binding
  policy for any WF-UX work that touches the preview channel.
* [`docs/firmware-import.md`](firmware-import.md) — cross-repo
  import contract; out of WF-UX scope but referenced by any
  follow-up that needs new firmware.
* [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md) —
  cleanup history; WF-UX builds on the Release-One + Rescue +
  LED-preview surface area established there.
* [`docs/github-pages-surface-audit.md`](github-pages-surface-audit.md) —
  live-vs-repo deployment delta; informs the
  [Live vs in-repo snapshot](#live-vs-in-repo-snapshot-20260515)
  section here.
* [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md) —
  rationale for the production-only `REQUIRED_CONFIGS` allowlist
  that WF-UX work preserves.
* [`CLAUDE.md`](../CLAUDE.md) — canonical SKU table, platform
  standards, and conventions; the source of every "Friendly Name"
  the wizard's UX is normalised to.
* [`DEVELOPER.md`](../DEVELOPER.md) — developer-facing
  architectural notes that complement this UX-facing roadmap.
* [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md) —
  WF-IMPORT-GAP-001 WebFlash-side import readiness matrix.
  Documents when future upstream firmware artifacts may be imported
  into the WebFlash repo, what *class* of import they would be
  (`stable` / `preview` / `advanced / manual-warning` / `rescue` /
  `docs-only` / `legacy-only` / `none`), and what runtime exposure
  (`REQUIRED_CONFIGS`, kits, recommended path, preview / advanced
  acknowledgement) that import does and does not unlock. Out of
  WF-UX scope but referenced by any UX follow-up that would touch
  module availability, kits, the preview-channel exposure model,
  or the FanTRIAC block: the matrix preserves every WF-UX
  do-not-change guardrail and reserves the per-family follow-up
  PR identifiers (`WF-IMPORT-RELAY-001`, `WF-IMPORT-PWM-001`,
  `WF-IMPORT-DAC-001`, `WF-IMPORT-TRIAC-001`, `WF-LED-STABLE-001`,
  etc.) that any UX restructure must respect.
