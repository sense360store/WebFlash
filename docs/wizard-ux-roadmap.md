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
PR-sized units (`WF-UX-QUICK-001` through `WF-UX-007` plus
`WF-HW-TEST-001`). It is paired with — but does not replace —
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
| **Ready to install** | All checks `pass`. | Install enabled. |
| **Needs attention** | Any check `warn`, no `fail`. | Install enabled only after the existing "Accept preflight warnings" checkbox (matches current `preflightWarningsAcknowledged` semantics at [`state.js:459-462`](../scripts/state.js#L459)). |
| **Blocked** | Any check `fail`. | Install disabled with a single, action-oriented reason. |

Per-row detail and support-bundle controls move into a "Why?" /
"Diagnostics" disclosure so the user is not asked to interpret six
parallel rows. The aggregate verdict must remain a pure function
of the existing `evaluatePreflightPolicy()` output — no new gating
logic, no policy regression for finding #9.

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

Today both paths land on the same Step 5; the only difference is
that the kit path skips Steps 2-4. WF-UX-006 introduces deeper
divergence:

* **Kit path.** Shorter, outcome-first copy. No SKU codes, no header
  pinouts, no firmware-target-preview, no module-conflict badges.
  Show: kit name, included modules in plain language, "your firmware
  will be vX.Y.Z (stable)", install card. Provenance + release-channel
  acknowledgement still apply per
  [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js).
* **Custom path.** Full module wizard with the existing constraint
  matrix from
  [`scripts/data/module-requirements.js`](../scripts/data/module-requirements.js).
  Jargon and SKU codes stay reachable through tooltips / a glossary,
  not in primary headings. Step 4 keeps the conflict badges (e.g.
  AirIQ ↔ DAC at
  [`index.html:619-621`](../index.html#L619)).
* **Recovery path.** Skip Steps 2-4 entirely; show the rescue build
  with its existing warning copy per
  [`scripts/utils/release-channels.js:141-155`](../scripts/utils/release-channels.js#L141).

The kit catalogue today holds exactly one entry
([`scripts/data/kits.json:13-41`](../scripts/data/kits.json#L13)),
which is enough to validate the split; expansion of the catalogue
is gated on future product decisions and is out of scope for
WF-UX-006.

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
  affordance each — WF-UX-003 decides whether to keep the
  mobile-drawer Install at [`index.html:969`](../index.html#L969)
  or remove it.

The post-install Home Assistant CTA is its own primary in the
post-flash panel ([`index.html:869-873`](../index.html#L869)), not
on the pre-install Step 5 footer.

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
| **WF-UX-003** | Primary CTA + review-page hierarchy. Make `<esp-web-install-button>` visually dominant; demote Download .bin / Copy install link / Open Home Assistant to a "More actions" group; remove the self-referential `Other options …` label at [`index.html:840`](../index.html#L840); decide and document whether [`index.html:969`](../index.html#L969) (mobile drawer Install) stays as the mobile primary or is removed. | Medium | (a) One install affordance per viewport, confirmed by a manual screenshot pair in the PR. (b) `getRequiredAcknowledgements` and `channelAcksSatisfied` gating unchanged — install button stays disabled until acknowledgements are satisfied. (c) `__tests__/release-channel-ui.test.js` green. (d) Provenance + freshness gates untouched. |
| **WF-UX-004** | Preflight redesign. Aggregate the six per-check rows at [`index.html:746-789`](../index.html#L746) into a single headline verdict (Ready / Needs attention / Blocked) per [Preflight model](#preflight-model); move per-check detail to a collapsible "Why?" disclosure; move "Copy support bundle" / "Download JSON" to a Diagnostics section. | Medium | (a) Headline verdict derives purely from `evaluatePreflightPolicy()` ([`scripts/state.js:558-569`](../scripts/state.js#L558)); no new gating logic. (b) `__tests__/preflight-*.test.js` suite (10 files) passes unchanged or with surgical updates. (c) The "Accept preflight warnings" master checkbox semantics survive. (d) Manifest-freshness recheck + ack control still wired. |
| **WF-UX-005** | Step-model cleanup. Align desktop sidebar ([`index.html:113-165`](../index.html#L113)) + mobile bar ([`index.html:169-190`](../index.html#L169)) + step-1 `<h2>` ([`index.html:243`](../index.html#L243)) on a single label. Reorder DOM so Step 1 markup precedes Step 2 ([`index.html:193-320`](../index.html#L193) → swap). Decide whether Step 2 ("Configure your Core") survives as a separate step or collapses into Step 1 (it currently exposes a single Core radio). | Medium / high | (a) Step 1 has the same label across desktop, mobile, and `<h2>`. (b) DOM source order matches user-visible order. (c) `getMaxReachableStep()` ([`scripts/state.js:6556-6566`](../scripts/state.js#L6556)) still correctly gates step access; `__tests__/wizard-state.test.js` green. (d) Step 5 review surface unchanged. |
| **WF-UX-006** | Kit vs custom-path split per [Kit vs custom configuration split](#kit-vs-custom-configuration-split). Distinct copy depth per path; kit users get plain-language module names, custom users get the conflict matrix. Recovery enters Rescue directly. | Higher | (a) Kit-mode end-to-end resolves to Release-One via `scripts/data/kits.json` unchanged. (b) Manual-mode reaches Step 5 identically to today for `Ceiling-POE-VentIQ-RoomIQ` and (with LED toggle) `Ceiling-POE-VentIQ-RoomIQ-LED`. (c) `__tests__/kits-json.test.js` + `__tests__/kit-mode.test.js` green. (d) Preview acknowledgement gate still enforced on the LED preview path. |
| **WF-UX-007** | Jargon and module-label cleanup per [Jargon / label policy](#jargon--label-policy). Outcome-first labels; SKUs and pinouts move into popover / specs detail. Delete the orphan `airiq.base` / `airiq.pro` entries in [`scripts/content/option-tooltips.js:125-164`](../scripts/content/option-tooltips.js#L125). | Medium | (a) Every primary heading in Step 4 uses the canonical Friendly Name from [`CLAUDE.md:23-35`](../CLAUDE.md#L23). (b) SKU codes remain discoverable in popovers / specs. (c) No Model/Variant nomenclature regressions (per [`CLAUDE.md:131-132`](../CLAUDE.md#L131)). (d) `__tests__/module-selection-guidance.test.js` and `__tests__/airiq-ventiq-availability.test.js` green. |
| **WF-HW-TEST-001** | Real-hardware flash + Improv handoff proof. Operator runs an actual flash against a Sense360 Core over Web Serial, captures the Improv handoff to Wi-Fi, exercises the post-flash panel, and records gaps that only show up on real serial. Findings filed as follow-up PRs. Proof container lives at [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md) (status: **pending — operator hardware test required**; pre-flight live-deployment evidence captured, hardware flash not yet performed). | Hardware / operator | (a) Transcript or screenshot pair attached. (b) Any new findings filed as separate PRs, not folded into this one. (c) Recovery / rescue flow exercised against a real device. (d) WF-LED-003 preview-channel exposure verified end-to-end (LED toggle → preview ack → install) at least once before larger UX restructure lands. |

Recommended sequencing: `WF-UX-QUICK-001` (immediate), then
`WF-UX-002` and `WF-UX-007` in either order (both relatively
contained), then `WF-UX-003` → `WF-UX-004` → `WF-UX-005` →
`WF-UX-006` (each may overlap structurally with the next). Run
`WF-HW-TEST-001` after `WF-UX-002` lands so the readiness-string
copy is exercised on a real flash; rerun before any larger
restructure.

## Hardware/operator validation still required

The PRs above are scoped so each can land without real-hardware
flashing. The following gates still require operator validation
and are recorded under `WF-HW-TEST-001`:

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
