# UX & Flow Review (May 2026)

> Source: external review of `sense360store/WebFlash` against ESP Web Tools best practices.
> This document is **the roadmap of record** — implementation work should reference items here by section number rather than re-deriving the analysis.

## Calibration vs. live tree (May 2026)

The review was written against an older snapshot. Before acting on a recommendation, verify state against the current codebase. Confirmed deltas:

- **Wizard is 5 steps**, not 4: `Mounting → Core → Power → Modules → Review`. See `getMaxReachableStep()` in `scripts/state.js` and the sidebar in `index.html`.
- **`esp-web-tools@10`** is loaded from `unpkg`, not v9 (`index.html` `<script type="module" src="...esp-web-tools@10/...">`).
- Step 5 already ships several items the review flags as "improve":
  - Preflight checks panel with `Pass / Warning / Fail` semantics
  - Install gating on `Fail`, plus an `Accept preflight warnings` checkbox when only warnings are present
  - `Copy diagnostics` redacted JSON bundle
  - Sensor-health panel, error-log modal, changelog modal
  - Connection-quality telemetry from `navigator.serial` connect/disconnect events and ESP Web Tools `state-changed`
- Hero title is still `Sense360 Firmware Configuration Tool` — the framing recommendation in §2.1 / §5.1 still applies.
- The legacy `Wall` mount is markup-only and not selectable; the wizard exposes Ceiling-only today.

When the prose below conflicts with these facts, treat the live code as authoritative and update this doc as part of the change that closes the gap.

---

## Executive summary

WebFlash has the right ESP Web Tools foundation: manifest-driven `<esp-web-install-button>`, per-build `firmware-N.json`, Improv enabled in manifest data, a guided wizard, release notes, legacy access, downloads, and shareable links.

The main gap is **flow design**, not core capability. The product behaves like a *configuration selector with an installer attached* rather than a *guided installation journey*. The next step is to evolve from:

> "select hardware options, then reveal an installer"

into:

> "understand setup, confirm compatibility, install confidently, provision Wi-Fi clearly, recover smoothly when things fail."

---

## 1. Current state

### 1.1 What the tool currently does

- 5-step wizard: Mounting → Core → Power → Modules → Review
- Configuration matched against `manifest.json` builds (`build.config_string`)
- Auto-rendered `<esp-web-install-button>` for the matched firmware
- Fallback access to additional / legacy builds
- Pre-flash checklist + Step 5 preflight panel
- Release notes display
- Direct firmware download + copy firmware URL + sharable config URL
- Theme toggle, capability bar, browser-support warning
- Quick-start presets and remembered-choices behavior
- Generated manifests via `scripts/gen-manifests.py`
- Improv in every manifest entry (`"improv": true`)

### 1.2 Strong points

- **Architectural alignment with ESP Web Tools.** Standard install-button + manifest schema + Improv. Don't replace this — extend it via the documented overrides surface.
- **Helpful guided selection.** Wizard means users don't have to decode firmware filenames.
- **Trust-building support content.** Release notes, hardware requirements, known issues, changelog slots, and legacy fallback are already wired.
- **Useful utility actions.** Direct download, copy firmware URL, remembered choices, legacy access panel.

---

## 2. HCI issues in the current flow

### 2.1 The primary task is slightly obscured
**Issue.** The page title is "Sense360 Firmware Configuration Tool"; the subtitle emphasises configuration, not flashing.
**Why it matters.** First-time users arrive wanting to install firmware / set up the device.
**Impact.** Lower clarity of purpose, more hesitation, install action feels secondary.

### 2.2 The install path is too back-loaded
**Issue.** Users must complete all wizard steps before the install button appears.
**Impact.** Compatibility is unknown until late; abandonment risk; flow feels longer than it is.

### 2.3 Critical prerequisites appear too late
**Issue.** USB-C / BOOT / RESET guidance lives in the Step 5 review area.
**Impact.** Bootloader requirements surface as last-minute surprises; avoidable failure loops.
**Best-practice note.** Supported browser, cable expectations, when bootloader mode is needed, and what the serial chooser should show should appear *before or alongside* install, not as late-stage surprises.

### 2.4 Boot / reset guidance may be too absolute
**Issue.** The checklist prescribes BOOT/RESET every time; some devices don't need it.
**Impact.** Increases perceived complexity; teaches an unnecessary step as mandatory.
**Recommendation.** Default path = "click Install and connect device". Fallback = "if not detected, use BOOT/RESET recovery."

### 2.5 Browser support feedback is reactive
**Issue.** Users on unsupported browsers can still progress into the wizard.
**Impact.** Wasted effort, confusion, reduced trust.

### 2.6 Wi-Fi provisioning is not surfaced clearly
**Issue.** `improv: true` is set in manifests and the README mentions Wi-Fi setup, but the visible flow doesn't represent the post-install Improv journey.
**Impact.** Users may think flashing is the end; missed opportunity to reduce setup anxiety.
**Confidence.** Medium — based on code/content, not a live click-through.

### 2.7 Metadata quality issues reduce trust
**Examples.** Some `file_size` values look implausibly small for ESP32 firmware; some descriptions don't match config (e.g., a `Wall-USB-AirIQPro` entry described as a minimal config with no expansion modules).
**Impact.** Trust erosion, higher support burden, fear around flashing.
**Note.** In this repo, the firmware binaries under `firmware/configurations/` are placeholder stubs (~18 bytes), so any size validation has to handle that case explicitly — see §5.4.

### 2.8 Information architecture is mixed
**Issue.** Recommended install, legacy install, direct download, copy URL, and release notes all share the same review area.
**Impact.** Novices may not know which action is safest; download competes with install as if they're equivalent.
**Recommendation.** Make one clear primary path; label others as Advanced / Manual / Legacy.

### 2.9 The wizard is hardware-centric, not user-goal-centric
**Issue.** Asks for mounting / power / module composition before letting the user start.
**Impact.** Friction for users who think in product / SKU / box-label terms.

---

## 3. ESP Web Tools alignment

### 3.1 Strong alignment
- Uses `<esp-web-install-button>` directly
- Manifest-based firmware selection
- Improv in manifest data
- Per-build `firmware-N.json` generation
- Browser-only install, no local tooling

### 3.2 Partial alignment
- Improv is enabled, but the user journey doesn't advertise the "flash → provision Wi-Fi" sequence.
- Manifest-driven model exists, but users are abstracted away from it without enough confidence-building explanation.

### 3.3 Where the flow can improve
A best-practice ESP Web Tools experience makes these obvious:
- Supported device + browser + cable / setup
- When bootloader mode is needed
- What happens after flashing
- Whether Wi-Fi provisioning will follow
- What to do if install fails

The pieces exist; the gap is a single, confidence-first journey.

---

## 4. Planned state

**Goal.** Confidence-first installation experience built on the existing ESP Web Tools architecture.

**Principles.**
1. **Make the primary action obvious.** This is the official Sense360 firmware installer; it picks the right firmware, installs in-browser, and then guides Wi-Fi.
2. **Shift prerequisites earlier.** Browser, cable, and bootloader expectations *before* selection, not after.
3. **Preserve simplicity for novices.** Recommended path: pick product → confirm hardware → install → connect Wi-Fi → done.
4. **Keep technical power, but secondary.** Legacy builds, direct binary download, copy firmware URL, release notes — still available, just not competing with the main install.
5. **Improve trust signals.** Each firmware choice shows correct version, channel, clear description, realistic size, release date, meaningful notes only.
6. **Make post-install behavior explicit.** "After flashing, you'll be guided to connect this device to Wi-Fi."

---

## 5. Roadmap

### Now

#### 5.1 Reframe the product around installation
- **Problem.** Tool feels like a configuration utility, not a guided installer.
- **Change.** Hero copy: title → e.g. "Sense360 Firmware Installer". Subtitle → "Choose your hardware setup, install the right firmware, and connect your device to Wi-Fi."
- **Files.** `index.html` page header.

#### 5.2 Move prerequisites to the top of the flow
- **Problem.** Browser / cable / bootloader expectations are learned too late.
- **Change.** Compact "Before you start" panel above Step 1: Chrome or Edge, USB data cable, close other serial tools, BOOT/RESET only if device isn't detected.
- **Files.** `index.html` (new section near `.path-selector`), `css/layout.css` or `css/wizard-style.css`.

#### 5.3 Reframe BOOT/RESET as fallback, not mandatory
- **Problem.** Current copy makes recovery steps sound universal.
- **Change.** Split into "Normal install" and "If your device is not detected".
- **Files.** Step 5 markup in `index.html`; capability/preflight strings in `scripts/state.js` / `scripts/init-review.js`.

#### 5.4 Validate manifest metadata in the publishing pipeline
- **Problem.** Wrong descriptions and suspicious file sizes undermine trust (§2.7).
- **Change.** Add validation in `scripts/gen-manifests.py` (or a sibling validator) for:
  - description vs `config_string` consistency
  - implausibly small `file_size` (warn-only while placeholder stubs are committed; tighten threshold once real binaries land)
  - missing release notes for stable channel
  - missing `hardware_requirements` fields when expected
- **Wire into.** `.github/workflows/firmware-publish.yml` after the existing `Generate firmware manifests` step.
- **Note.** Current repo binaries are ~18-byte placeholders, so any hard "size > N KB" check has to be opt-in or behind a `STRICT` flag.

#### 5.5 Surface Wi-Fi provisioning explicitly
- **Problem.** Improv works but isn't visible in the journey.
- **Change.** Pre-install copy: "After firmware is installed, WebFlash can help connect the device to Wi-Fi via Improv Serial." Post-install state: prompt to begin Wi-Fi setup.
- **Files.** Step 5 markup; possibly a new helper in `scripts/init-review.js`.

### Next

#### 5.6 Collapse the wizard to a faster decision flow
- **Problem.** 5 steps may be more than many users need now that Wall is hidden and Voice exposes only `none`.
- **Change.** Either compress to 3 steps (product / hardware / review) or progressively disclose module options only when relevant.

#### 5.7 Stronger "Recommended firmware" card
- **Change.** High-trust card with recommended badge, version, channel, hardware summary, release notes, install button.

#### 5.8 Separate primary and advanced actions
- **Change.** Primary = Install Firmware. Secondary = release notes. Advanced = download binary / copy link / legacy builds.

#### 5.9 Improve failure / recovery UX
- **Change.** Friendly states for unsupported browser, no serial device, permission denied, flashing failed, reconnect/retry. Step 5 already has the plumbing — gap is presentation.

### Later

#### 5.10 Product-first entry points
- **Change.** Start from product SKU, printed config code, QR code, or "scan label" / "enter model code".

#### 5.11 Visual installation state feedback
- **Change.** Layer a visual step state around ESP Web Tools' lifecycle: detect → connect → erase → flash → verify → provision Wi-Fi → done.

#### 5.12 Analytics-friendly milestones
- **Change.** Track non-sensitive milestones (page load, configuration completed, install clicked / succeeded / failed, Wi-Fi provisioning started / completed) for funnel visibility.

---

## 6. AI-ready improvement backlog

**High priority**
1. Hero copy reframed for installation (§5.1)
2. Top-of-page prerequisites block (§5.2)
3. BOOT/RESET as conditional recovery (§5.3)
4. Manifest metadata validation in build automation (§5.4)
5. Improv / Wi-Fi setup made explicit (§5.5)
6. Reorganize primary vs. advanced actions (§5.8)
7. Clearer browser / serial-device recovery states (§5.9)

**Medium priority**
8. Shorten wizard (§5.6)
9. Recommended firmware summary card (§5.7)
10. Richer install progress framing (§5.11)
11. Better legacy-build separation (§5.8)
12. Product / SKU-first selection (§5.10)

**Lower priority**
13. Polished timeline visuals
14. More celebratory success state
15. Richer release-note presentation
16. Theme refinements

---

## 7. Acceptance criteria for the next version

**UX.**
- A first-time user can tell within ~5 seconds that this page installs Sense360 firmware.
- Browser and cable requirements are visible before configuration begins.
- BOOT/RESET reads as fallback guidance, not always mandatory.
- The main install path is visually dominant over manual / legacy paths.
- If Wi-Fi provisioning follows flashing, that's explained before install begins.

**Content.**
- Firmware descriptions match the actual hardware config.
- Reported firmware sizes are believable and validated.
- Release notes load only when meaningful and available.
- Legacy options are clearly labeled as advanced / manual.

**Technical.**
- Per-build manifest generation remains automated.
- ESP Web Tools install buttons remain manifest-based.
- Improv support remains enabled where intended.
- Metadata validation prevents bad descriptions and invalid size data from shipping.

---

## 8. Final recommendation

The implementation is sound and worth building on. The fastest win is not a rewrite — it's a **flow correction**:

1. Make install the clear primary task.
2. Move prerequisites earlier.
3. Present recovery guidance conditionally.
4. Make post-flash Wi-Fi setup explicit.
5. Clean up manifest metadata trust issues.

That gets WebFlash from "configuration tool with an installer attached" to a polished, best-practice ESP Web Tools experience while preserving the strong base already in place.
