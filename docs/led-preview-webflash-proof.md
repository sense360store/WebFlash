# LED Preview WebFlash Flash Proof — WF-HW-TEST-001

> **Status: pending — operator hardware test required.**
>
> This PR creates the proof container and records pre-flight evidence
> that the live WebFlash deployment is in the expected shape for an LED
> preview hardware flash. **It does not claim that a hardware flash has
> been performed.** No real Sense360 Core has been flashed against the
> live site from this PR's environment. Every operator/device/flash
> field below is `pending — operator hardware test required` until a
> human operator with a Sense360 Core, USB cable, and a supported
> desktop Chromium browser runs the procedure recorded here.

## Purpose and scope

* **In scope.** Create the proof container for WF-HW-TEST-001 (the
  operator-only row of [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md)
  §"Roadmap broken into follow-up PRs"). Capture the **pre-flight
  evidence** that the live deployment is the expected 3-build manifest
  (Release-One stable, LED preview, Rescue), that the LED preview `.bin`
  is reachable, that no stale FanTRIAC artifact is being served, and
  that the `source_commit` matches the merged Pages deploy. Record the
  step-by-step operator procedure, the exact fields the operator must
  collect, and the explicit do-not-change guardrails.
* **Out of scope.** Performing the flash. Touching firmware,
  manifests, `firmware/sources.json`, `REQUIRED_CONFIGS`, kits, wizard
  runtime, service worker, or workflows. Adding an LED kit. Marking the
  LED preview stable. Unblocking FanTRIAC. Regenerating manifests.
  Importing firmware. Changing wizard UX. None of these happen in this
  PR, regardless of the operator outcome recorded later.

## Preconditions

The following must be true before an operator can run this procedure.
The repo-side preconditions were verified in this PR by reading the
in-repo files; the live-deployment preconditions were verified by
`curl` against the published GitHub Pages origin (see
[Live deployment state](#live-deployment-state) for the captured
evidence).

| Precondition | Verified | How |
| --- | --- | --- |
| Live `manifest.json` reachable. | Yes | `curl https://sense360store.github.io/WebFlash/manifest.json` returns parsable JSON. |
| Live `manifest.source_commit` matches the merged WF-DEPLOY-001 deploy. | Yes | `source_commit = fd55680227c9cb1636ebc542d82e962eab687cc9`. No `821e330…` (the pre-deploy stale commit) appears. |
| Live `manifest.json` contains exactly the 3 expected builds. | Yes | `Ceiling-POE-VentIQ-RoomIQ` (stable), `Ceiling-POE-VentIQ-RoomIQ-LED` (preview), `Rescue`. |
| LED preview `.bin` reachable on Pages. | Yes | `HEAD` returns `HTTP/2 200`, `content-length: 1135904`, `content-type: application/octet-stream`. |
| FanTRIAC `.bin` not served on Pages. | Yes | `HEAD` returns `HTTP/2 404`. |
| LED preview is `channel: preview`. | Yes | Live manifest's LED build carries `"channel": "preview"`. |
| LED preview is **not** in `REQUIRED_CONFIGS`. | Yes (repo) | `.github/workflows/firmware-publish.yml` allowlist is `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`. Unchanged by this PR. |
| LED preview is **not** in `scripts/data/kits.json`. | Yes (repo) | Only kit is `S360-KIT-CEILING-VENTIQ-ROOMIQ-POE` (Release-One). Unchanged. |
| Release-One source still carries `block_tokens: ["FanTRIAC", "LED"]`. | Yes (repo) | `firmware/sources.json` source entry 0. |
| LED preview source carries `block_tokens: ["FanTRIAC"]` only. | Yes (repo) | `firmware/sources.json` source entry 1. |
| Operator hardware available. | **No** | Operator gate. See [Hardware under test](#hardware-under-test). |
| Operator browser available. | **No** | Operator gate. See [Operator environment](#operator-environment). |

## Live deployment state

Captured by this PR via read-only `curl` requests against
`https://sense360store.github.io/WebFlash/` at the time of authoring
(2026-05-15).

### `manifest.json` summary

```text
source_commit:  fd55680227c9cb1636ebc542d82e962eab687cc9
generated_at:   2026-05-15T18:49:47.508846+00:00
builds:
  - config_string: Ceiling-POE-VentIQ-RoomIQ        channel: stable   version: 1.0.0
  - config_string: Ceiling-POE-VentIQ-RoomIQ-LED    channel: preview  version: 1.0.0
  - config_string: Rescue                           channel: rescue   version: 1.0.0
```

* No `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` build present.
* No legacy `Ceiling-POE-AirIQ` / `Ceiling-USB` / `Ceiling-USB-AirIQ`
  / `Ceiling-USB-FanPWM` / `Ceiling-Voice-POE-AirIQ` / `Ceiling-Voice-USB`
  / `Ceiling-POE-VentIQ` builds present.
* `source_commit` is the post-WF-DEPLOY-001 commit. The previously
  documented stale `source_commit = 821e33017df5e66f812cf0d570800f73c083de15`
  (see [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) "Live vs
  in-repo snapshot") no longer appears live.

### LED preview firmware

```text
URL:           https://sense360store.github.io/WebFlash/firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin
HTTP:          200
content-type:  application/octet-stream
content-length: 1135904
```

Local `.bin` SHA256 matches both the in-repo manifest entry and the
upstream-pinned `expected_sha256` declared in
[`firmware/sources.json`](../firmware/sources.json):

```text
93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3
```

The live per-build manifest at
`https://sense360store.github.io/WebFlash/firmware-1.json` resolves to
the same `.bin` path and version
(`Sense360 ESP32 Firmware - Core Module` / `1.0.0`).

### FanTRIAC firmware (must remain absent)

```text
URL:    https://sense360store.github.io/WebFlash/firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin
HTTP:   404
```

The orphan FanTRIAC asset that WF-CLEANUP-002 removed from the repo and
that the WF-CLEANUP-008 / WF-LED-003 audit chain confirmed was being
served stale is no longer served. FanTRIAC remains blocked under HW-005.

### Live root

```text
URL:    https://sense360store.github.io/WebFlash/
HTTP:   200
content-type: text/html; charset=utf-8
```

## Firmware under test

The operator-side test exercises the LED preview build only. Release-One
is unchanged by this exercise and is exercised separately whenever an
operator runs the WF-HW-TEST-001 Release-One arm (recorded in the
roadmap, not in this doc).

| Field | Value |
| --- | --- |
| `config_string` | `Ceiling-POE-VentIQ-RoomIQ-LED` |
| Asset name | `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin` |
| Channel | `preview` |
| Version | `1.0.0` |
| `chipFamily` | `ESP32-S3` |
| File size | 1,135,904 bytes |
| SHA256 | `93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3` |
| Signing key id | `sense360-prod-2026-02` |
| `improv` | `true` |
| Source repo | `sense360store/esphome-public` |
| Source release tag | [`v1.0.0-led-preview`](https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-led-preview) |
| `block_tokens` (per source) | `["FanTRIAC"]` |

## Hardware under test

| Field | Value |
| --- | --- |
| Sense360 Core SKU | pending — operator hardware test required |
| Core revision | pending — operator hardware test required |
| LED ring SKU (`S360-300`) attached? | pending — operator hardware test required |
| RoomIQ (`S360-200`) attached? | pending — operator hardware test required |
| VentIQ (`S360-211`) attached? | pending — operator hardware test required |
| Power (PoE / 240V / USB) | pending — operator hardware test required |
| USB data cable verified | pending — operator hardware test required |
| Device serial (last 4) | pending — operator hardware test required |

## Operator environment

| Field | Value |
| --- | --- |
| Date / time (UTC) | pending — operator hardware test required |
| Operator | pending — operator hardware test required |
| OS | pending — operator hardware test required |
| Browser + version | pending — operator hardware test required |
| Live URL used | `https://sense360store.github.io/WebFlash/` (must be the live Pages origin, **not** a local dev server) |
| Stale site data / service worker cleared? | pending — operator hardware test required |
| Web Serial support confirmed? | pending — operator hardware test required |

## Test procedure

The operator runs this end-to-end on a single device, against the live
Pages origin, in a supported desktop Chromium browser (Chrome, Edge, or
Opera on Windows / macOS / Linux — Web Serial gate per
[`scripts/capabilities.js`](../scripts/capabilities.js) and the WF-UX-QUICK-001
copy normalisation). The Sense360 Core must be USB-connected with a data
cable, set to a flashable mode (normal or bootloader), and not in use by
another process holding the serial port.

1. Open `https://sense360store.github.io/WebFlash/` in a supported
   desktop Chromium browser. Do **not** use a local dev server, a
   mirror, or a cached preview origin.
2. Clear stale site data and any stuck service worker for the origin if
   the wizard reports a manifest-freshness or SW-update warning. The
   service worker is intentionally `webflash-v5`; the freshness banner
   in [`scripts/layout/freshness-banner.js`](../scripts/layout/freshness-banner.js)
   gates install until the deployed manifest matches the served one.
3. Step 1 (**Start**) — leave the kit/manual picker on the manual flow
   for this runbook (mounting defaults to Ceiling via the hidden
   `mounting=ceiling` input; per WF-UX-005 the user is no longer asked
   to pick a mounting in Step 1).
4. In Step 2 (**Core**) confirm the **Core** radio is selected
   (`voice='none'`) and click Next.
5. In Step 3 (**Power**) pick **PoE**.
6. In Step 4 (**Modules**) turn the **Bathroom** toggle on so the VentIQ
   / RoomIQ modules are reachable, then enable:
   * **Sense360 VentIQ** (S360-211).
   * **Sense360 RoomIQ** (S360-200).
   * **Sense360 LED** (S360-300) — this toggle exists in
     [`index.html:659-673`](../index.html#L659) and is wired into the
     wizard via `scripts/state.js` (`MODULE_KEYS`, `MODULE_SEGMENT_FORMATTERS`,
     `parseConfigStringState`) and `scripts/data/module-requirements.js`
     (`Sense360 LED` variant entry).
7. In Step 5 confirm that the selected configuration string is
   **`Ceiling-POE-VentIQ-RoomIQ-LED`**. The wizard's diagnostics /
   support-bundle JSON also records this value.
8. Confirm that the selected firmware asset is
   **`Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin`**.
9. Confirm that the channel badge reads **Preview** (warning tone) and
   that a **Recommended** badge is **not** shown for this build. The
   release-channel gate in
   [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js)
   sets `preview.defaultSelectable = false`, so the LED preview is never
   auto-selected. (If Release-One was somehow auto-selected, the
   operator manually selects the LED preview build from the firmware
   version dropdown.)
10. Confirm that install is gated behind the **`channel:preview`**
    acknowledgement checkbox with the experimental-build warning copy
    (`getRequiredAcknowledgements` returns the preview acknowledgement).
11. Tick the preview acknowledgement.
12. Tick the **Before you flash** checkbox.
13. Click the `<esp-web-install-button>` Install button and select the
    correct USB serial port from the Web Serial picker. Record the
    Web Serial connection result.
14. Allow the flash to complete. Record the flash result and (if shown)
    the duration.
15. Observe the post-flash panel:
    * Record whether Improv Wi-Fi handoff is offered.
    * If offered, attempt Wi-Fi provisioning through Improv. Record the
      result.
    * Record whether the Home Assistant handoff CTA appears.
    * Physically inspect the LED ring; record its behaviour (off /
      static / animated / colour / fault pattern).
16. Export the support bundle JSON (`Copy diagnostics` / equivalent
    affordance). Record the file or paste a redacted excerpt that shows
    the selected `config_string` and the install outcome. Do not paste
    Wi-Fi credentials, device tokens, or anything matched by
    `SENSITIVE_KEY_PATTERN` in `scripts/state.js` — they are redacted
    automatically, but double-check before pasting.

If the flash starts but fails, record the failure point, copy any
`<esp-web-install-button>` error text verbatim, and note the
`state-changed` event sequence shown in the support bundle. Do **not**
edit any firmware, manifest, or runtime code in response — file a
follow-up PR with the diagnosis instead.

## Proof record

Every row stays `pending — operator hardware test required` until a
human operator runs the procedure above and fills it in. Do not invent
values to make rows look complete.

| Field | Recorded value |
| --- | --- |
| Date / time (UTC) | pending — operator hardware test required |
| Operator | pending — operator hardware test required |
| Device / hardware used | pending — operator hardware test required |
| Browser and version | pending — operator hardware test required |
| OS | pending — operator hardware test required |
| Live URL | `https://sense360store.github.io/WebFlash/` (recorded) |
| Manifest `source_commit` | `fd55680227c9cb1636ebc542d82e962eab687cc9` (recorded — live) |
| Config string | `Ceiling-POE-VentIQ-RoomIQ-LED` (target) — operator confirmation pending |
| Firmware asset | `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin` (target) — operator confirmation pending |
| Firmware channel | `preview` (target) — operator confirmation pending |
| Firmware version | `1.0.0` (target) — operator confirmation pending |
| SHA256 | `93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3` (target) — operator confirmation pending |
| Web Serial connection result | pending — operator hardware test required |
| Flash result | pending — operator hardware test required |
| Flash duration | pending — operator hardware test required |
| Post-flash result | pending — operator hardware test required |
| Improv Wi-Fi handoff shown? | pending — operator hardware test required |
| Improv Wi-Fi handoff completed? | pending — operator hardware test required |
| Home Assistant handoff shown? | pending — operator hardware test required |
| LED ring physically verified? | pending — operator hardware test required |
| Support bundle filename / excerpt | pending — operator hardware test required |
| Screenshots / notes | pending — operator hardware test required |
| Known issues encountered | pending — operator hardware test required |

## Support bundle summary

```text
pending — operator hardware test required

(Operator pastes a redacted excerpt of the support bundle JSON here
after the flash. At a minimum the excerpt should show:
  - selected config_string
  - selected build channel + version
  - install outcome
  - any error code(s)
Wi-Fi credentials and device tokens must remain redacted; the
SENSITIVE_KEY_PATTERN redactor in scripts/state.js handles them
automatically, but double-check before pasting.)
```

## Results

* **Overall status:** pending — operator hardware test required.
* No flash claim is made by this PR.

## What passed

This PR verifies the **pre-flight** state only. The following passed at
the time of authoring; none of them imply that a hardware flash has
succeeded.

* Live `manifest.json` reachable and parseable.
* Live `manifest.source_commit` is the current
  `fd55680227c9cb1636ebc542d82e962eab687cc9`; the pre-WF-DEPLOY-001
  stale `821e330…` commit no longer appears.
* Live `manifest.json` contains exactly the 3 expected builds:
  Release-One stable, LED preview, Rescue.
* LED preview `.bin` reachable on Pages (`HTTP 200`, 1,135,904 bytes).
* FanTRIAC `.bin` returns `HTTP 404` (correctly absent).
* In-repo `Ceiling-POE-VentIQ-RoomIQ-LED` `.bin` SHA256 matches both the
  manifest entry and the upstream-pinned `expected_sha256` in
  `firmware/sources.json`.
* Release-One source still carries `block_tokens: ["FanTRIAC", "LED"]`;
  LED preview source carries `block_tokens: ["FanTRIAC"]` only.
* `REQUIRED_CONFIGS` (`.github/workflows/firmware-publish.yml`) is the
  expected production-only allowlist
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
* `scripts/data/kits.json` is Release-One only.
* The preview-channel exposure model in
  [`scripts/utils/release-channels.js`](../scripts/utils/release-channels.js)
  is unchanged from WF-LED-003: `defaultSelectable: false`,
  `requiresAcknowledgement: true`, `hiddenByDefault: false`.

## What failed / was not tested

The hardware portion of WF-HW-TEST-001 was not exercised by this PR.
Every item below is **not tested** — none of them is a failure of the
LED preview path itself.

* Web Serial connect against a Sense360 Core: **not tested**.
* `<esp-web-install-button>` flash of the LED preview build: **not tested**.
* Flash duration / completion verdict: **not tested**.
* Post-flash boot of the device: **not tested**.
* Improv Wi-Fi handoff: **not tested**.
* Improv Wi-Fi provisioning completion: **not tested**.
* Home Assistant handoff CTA: **not tested**.
* LED ring physical behaviour after flash: **not tested**.
* Support bundle export after a real flash: **not tested**.
* Rescue / recovery flow against an actually-bricked device: **not tested**
  (tracked separately under the WF-HW-TEST-001 rescue arm in
  [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md)).

## Remaining validation gaps

Per the WF-HW-TEST-001 row in
[`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) §"Roadmap broken
into follow-up PRs" and §"Hardware/operator validation still required",
these gates still require an operator with real hardware:

* End-to-end `<esp-web-install-button>` flash of the LED preview build
  against a Sense360 Core over Web Serial from the live Pages origin.
* Improv Wi-Fi handoff verified on a real flash (the `improv: true`
  flag is set in `manifest.json`, but the journey has never been
  exercised end-to-end against a real device under the LED preview
  config).
* `navigator.serial` connect / disconnect telemetry resolving to the
  expected preflight verdicts after a real port is opened.
* Post-flash panel state machine ([`index.html:851-897`](../index.html#L851))
  observed on a real device boot under LED preview firmware.
* LED ring physical behaviour (off / static / animated / fault pattern)
  on an `S360-300`-equipped Core.
* The Release-One arm of WF-HW-TEST-001 (LED toggle off →
  `Ceiling-POE-VentIQ-RoomIQ` stable flash) — exercised separately and
  recorded in a future proof container, not in this doc.
* The rescue arm of WF-HW-TEST-001 (recovery mode against a partially
  bricked device) — exercised separately.

When an operator runs the procedure, append the captured values to the
[Proof record](#proof-record), the [Support bundle summary](#support-bundle-summary),
and the [Results](#results) sections, and flip the overall status from
**pending** to **proven** or **attempted, failed** as appropriate. Do
not retroactively edit the pre-flight evidence in
[Live deployment state](#live-deployment-state); capture fresh evidence
alongside it if the live manifest has rolled since this PR landed.

## Do-not-change guardrails

This PR (and any future operator-driven update to this proof doc) must
preserve every invariant below. The same guardrails apply whether the
recorded flash status ends up **proven**, **attempted, failed**, or
stays **pending**.

| Item | Why |
| --- | --- |
| `firmware/configurations/*` | No new firmware lands in a proof PR. |
| `firmware/rescue/*` | Rescue is its own surface. |
| `firmware/sources.json` | Source list is owned by the import / cleanup chain. |
| `manifest.json` | Generated only by `gen-manifests.py`, only after an import. |
| Every `firmware-*.json` | Same as `manifest.json`. |
| `scripts/data/kits.json` | Kit exposure is a future WF-LED-004 decision. |
| `.github/workflows/*` | `REQUIRED_CONFIGS` stays production-only. |
| `sw.js` | No new top-level scripts; cache policy unchanged. |
| `index.html` | No UI exposure of the LED preview beyond the existing module toggle. |
| All of `scripts/` runtime | No wizard runtime, release-channel, or install-logic edits. |
| Signing keys / `firmware-signing/` | No signing operations. |
| Release-One `block_tokens` | Stays `["FanTRIAC", "LED"]`. |
| LED preview `block_tokens` | Stays `["FanTRIAC"]`. |
| FanTRIAC blocked status | Stays blocked under HW-005. |
| LED preview channel | Stays `preview`. Never marked `stable` here. |
| `REQUIRED_CONFIGS` | Stays `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`. LED never added. |
| LED preview exposure model | Stays exactly the WF-LED-003 Option A surface (manifest-only, preview ack required, never auto-selected). |

This proof PR does **not**:

* import LED firmware,
* regenerate manifests,
* add LED UI,
* add an LED kit,
* relax preview gating,
* unblock FanTRIAC,
* add the LED preview to `REQUIRED_CONFIGS`,
* edit any service worker, workflow, or wizard runtime file, or
* claim that a real LED preview flash has succeeded.

## See also

* [`docs/led-preview-import-plan.md`](led-preview-import-plan.md) —
  the WF-LED-001 / WF-LED-002 / WF-LED-003 plan that imported the LED
  preview, regenerated the manifest, and pinned the Option A exposure
  model. This proof doc closes the operator-validation loop opened by
  that plan.
* [`docs/firmware-import.md`](firmware-import.md) — full cross-repo
  import contract; the LED preview source entry in `firmware/sources.json`
  was created under that contract.
* [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md) —
  audit history; explains why FanTRIAC stays blocked and why
  `REQUIRED_CONFIGS` stays production-only.
* [`docs/github-pages-surface-audit.md`](github-pages-surface-audit.md) —
  live-vs-repo deployed-surface audit; the pre-flight evidence in this
  doc is the next-deploy update of that audit's live snapshot.
* [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) — defines
  WF-HW-TEST-001 in its roadmap table and lists the operator gates this
  proof container is designed to absorb.
* [`DEVELOPER.md`](../DEVELOPER.md) — maintainer-facing entry point;
  links to this proof doc from the wizard UX roadmap pointer.
* [`CLAUDE.md`](../CLAUDE.md) — repo-level instructions; references
  this proof doc alongside the LED preview / FanTRIAC / `REQUIRED_CONFIGS`
  guardrails.
