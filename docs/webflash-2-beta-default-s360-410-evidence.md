# WebFlash 2.0 Beta Default — S360-410 PoE Flash Evidence

> **Status: pending — operator hardware test required.**
>
> The WebFlash 2.0 migration "beta default" PR (the `wf2-*` step that makes
> `?ui=2` the default on the internal and beta surface while production stays
> on `?ui=1`) is a code-and-test change only. It does **not** flash any
> hardware. This document is the fillable evidence container for the real
> Sense360 S360-410 PoE flash that a human operator performs against the 2.0
> view on the beta surface. Every operator/device/flash field below stays
> `pending — operator hardware test required` until an operator runs the
> procedure and records the captured values. **No agent and no PR in this
> chain claims that a hardware flash has been performed** — the agent cannot
> flash hardware.

## Why this gate exists

The migration cuts the production default over to the 2.0 view in a separate
GA cutover PR. The GA cutover is the master shipping gate, and it inherits the
1.0 rule unchanged: **do not flip the production default without a clean real
S360-410 PoE flash from the 2.0 view.** The beta default PR makes `?ui=2` the
default on the internal and beta surface so the maintainer can dogfood exactly
that path on real hardware and capture the evidence here. Until this container
holds a clean recorded flash, the GA cutover does not merge.

This separation is deliberate:

* The beta default PR changes only the default-view resolution by surface
  (production stays `ui=1`, internal and beta default to `ui=2`, `?ui=1` and
  `?ui=2` remain explicit overrides). It ships no firmware and weakens no gate.
* The GA cutover PR flips the production default. It requires the evidence
  below to be recorded and clean.

## What the beta default PR changed (agent side, no hardware)

* `scripts/ui-version.js` (new) — pure, side-effect-free resolver. Production
  host (`sense360store.github.io`) resolves to the 1.0 view; every other
  surface (local development on `localhost` / `127.0.0.1`, and any internal or
  beta origin) resolves to the 2.0 view. `?ui=1` and `?ui=2` always override.
* `scripts/bootstrap.js` — now resolves the default entry through
  `resolveUiVersion(search, hostname)` instead of the inline `?ui` check. Both
  entries still mount inside the same production shell and still thread the
  cache-bust token.
* `sw.js` — precaches `scripts/ui-version.js` and bumps `CACHE_NAME` to
  `webflash-v14` so existing installs re-prime the changed bootstrap plus the
  new module as one set.
* `index.html`, `app.js`, `scripts/build-info.js` — cache-bust token and
  app-shell marker bumped in lockstep (`202606041` / `2026-06-04-1`).
* `__tests__/wf2-beta-default.test.js` (new) — pins the surface-resolution rule
  and the deploy wiring.

What stays gated and unchanged: the install gate (provenance, channel
acknowledgement, SHA-256 verification, manifest freshness, service-worker
update, before-you-flash), the release-channel model, every firmware binary,
`manifest.json`, every `firmware-*.json`, `firmware/sources.json`,
`REQUIRED_CONFIGS`, `scripts/data/kits.json`, the rescue path, and the desktop
Chromium capability gate. No surface claims cryptographic signature
verification. The production default is unchanged.

## Operator note

> The physical flash and the attached evidence are a manual step the maintainer
> performs. The agent cannot flash hardware: it has no Web Serial, no USB, and
> no device. Everything in the [Evidence checklist](#evidence-checklist),
> [Eight-state validation result](#eight-state-validation-result), and
> [Improv provisioning result](#improv-provisioning-result) sections is recorded
> by the operator after a real flash, not by the agent.

## Hardware under test

The S360-410 is the **Sense360 PoE PSU** (PoE to 5V). On the beta surface the
operator flashes a real Sense360 Core powered through the S360-410, exercising
the PoE power path end to end from the 2.0 view.

| Field | Value |
| --- | --- |
| Sense360 Core SKU (`S360-100`) | pending — operator hardware test required |
| Core revision | pending — operator hardware test required |
| Power module | `S360-410` (Sense360 PoE PSU) |
| Other modules attached (RoomIQ / VentIQ / AirIQ / LED) | pending — operator hardware test required |
| USB data cable verified | pending — operator hardware test required |
| Device serial (last 4) | pending — operator hardware test required |

## Operator environment

| Field | Value |
| --- | --- |
| Date / time (UTC) | pending — operator hardware test required |
| Operator | pending — operator hardware test required |
| OS | pending — operator hardware test required |
| Browser + version (desktop Chromium: Chrome / Edge / Opera) | pending — operator hardware test required |
| Beta surface URL used | pending — operator hardware test required (the internal / beta origin, served from the same shell; confirm it loaded the 2.0 view by default with no `?ui=` query) |
| View confirmed as 2.0 by default (no `?ui=2` in the URL) | pending — operator hardware test required |
| `?ui=1` fallback confirmed to load the 1.0 view on the same surface | pending — operator hardware test required |
| Stale site data / service worker cleared before the run | pending — operator hardware test required |
| Web Serial support confirmed | pending — operator hardware test required |

## Procedure

The operator runs this end to end on a single device, against the beta surface,
in a supported desktop Chromium browser. The Sense360 Core must be USB connected
with a data cable, powered through the S360-410 PoE PSU, set to a flashable mode,
and not held open by another process on the serial port.

1. Open the beta surface in a supported desktop Chromium browser **without** any
   `?ui=` query. Confirm the 2.0 view renders by default. Record the URL.
2. Open the same surface with `?ui=1` and confirm it falls back to the 1.0 view,
   then return to the default (no `?ui=`) 2.0 view for the flash.
3. Clear stale site data and any stuck service worker if the wizard reports a
   manifest-freshness or service-worker-update warning. Install stays gated
   until freshness and the update banner resolve.
4. Build the target selection in the 2.0 view. Record the resolved
   `config_string` and confirm it matches a real `manifest.json` build.
5. Confirm the firmware version, channel, and asset filename shown for the
   resolved build. If the build is a non-stable channel, confirm the channel
   acknowledgement is required before install and tick it.
6. Tick the before-you-flash acknowledgement. Confirm the install control only
   arms once the full gate passes.
7. Click the `<esp-web-install-button>` Install button, pick the correct USB
   serial port, and allow the flash to complete. Record the Web Serial connect
   result and the flash result.
8. Observe the post-flash validation panel and record the terminal state from
   the eight-state machine below.
9. If the build advertises `improv: true`, attempt Wi-Fi provisioning over
   Improv Serial and record the result. SSID and password are never read,
   logged, or stored; do not paste them here.
10. Export the support bundle and record a redacted excerpt that shows the
    selected `config_string` and the install outcome. Do not paste anything
    matched by `SENSITIVE_KEY_PATTERN` in `scripts/state.js`.

If the flash starts but fails, record the failure point, copy any
`<esp-web-install-button>` error text verbatim, and note the `state-changed`
sequence shown in the support bundle. Do not edit any firmware, manifest, or
runtime code in response; file a follow-up with the diagnosis instead.

## Evidence checklist

Every row stays `pending — operator hardware test required` until a human
operator runs the procedure and fills it in. Do not invent values to make rows
look complete.

| Field | Recorded value |
| --- | --- |
| Date / time (UTC) | pending — operator hardware test required |
| Operator | pending — operator hardware test required |
| Device / hardware used | pending — operator hardware test required (Sense360 Core + S360-410 PoE PSU) |
| Browser and version | pending — operator hardware test required |
| OS | pending — operator hardware test required |
| Beta surface URL | pending — operator hardware test required |
| View was 2.0 by default (no `?ui=`) | pending — operator hardware test required |
| `?ui=1` fallback loaded the 1.0 view | pending — operator hardware test required |
| **Config string** | pending — operator hardware test required |
| **Firmware version** | pending — operator hardware test required |
| **Firmware channel** | pending — operator hardware test required |
| Firmware asset filename | pending — operator hardware test required |
| Channel acknowledgement required / ticked | pending — operator hardware test required |
| Web Serial connect result | pending — operator hardware test required |
| Flash result | pending — operator hardware test required |
| Flash duration | pending — operator hardware test required |
| **Eight-state validation result** | pending — operator hardware test required (see below) |
| **Improv provisioning result** | pending — operator hardware test required (see below) |
| Home Assistant handoff shown | pending — operator hardware test required |
| Support bundle filename / excerpt | pending — operator hardware test required |
| Screenshots / notes | pending — operator hardware test required |
| Known issues encountered | pending — operator hardware test required |

## Eight-state validation result

The post-flash validation state machine
([`scripts/services/post-flash.js`](../scripts/services/post-flash.js)) reports
exactly one terminal state. Record which one the 2.0 post-flash panel showed,
and the per-check verdicts that drove it.

The eight states are:

1. `not_started`
2. `in_progress`
3. `completed`
4. `completed_validation_passed`
5. `completed_validation_failed`
6. `completed_validation_unknown`
7. `failed`
8. `cancelled`

| Field | Recorded value |
| --- | --- |
| Terminal post-flash state (one of the eight) | pending — operator hardware test required |
| `device_reconnect` | pending — operator hardware test required |
| `device_firmware_identity` | pending — operator hardware test required |
| `version_match` | pending — operator hardware test required |
| `improv_endpoint_available` | pending — operator hardware test required |
| `wifi_provisioning_capability` | pending — operator hardware test required |

`completed_validation_unknown` is an honest, acceptable outcome when a signal is
unavailable; it is not a failure. Record exactly what the panel reported rather
than forcing a `passed`.

## Improv provisioning result

Improv Serial provisioning is offered only when the flashed build advertises
`improv: true`. SSID and password are never read, logged, or stored anywhere,
including this document.

| Field | Recorded value |
| --- | --- |
| Build advertises `improv: true` | pending — operator hardware test required |
| Improv Wi-Fi handoff offered | pending — operator hardware test required |
| Improv provisioning attempted | pending — operator hardware test required |
| Improv provisioning result | pending — operator hardware test required |
| Credentials confirmed not persisted (URL / localStorage / support bundle / flash history) | pending — operator hardware test required |

## Result

* **Overall status:** pending — operator hardware test required.
* No flash claim is made by the beta default PR.
* The GA cutover does not flip the production default until this container holds
  a clean recorded S360-410 PoE flash from the 2.0 view.

## Do-not-change guardrails

The beta default PR, and any future operator-driven update to this container,
must preserve every invariant below:

| Item | Why |
| --- | --- |
| The install gate | Provenance, channel acknowledgement, SHA-256 verification, freshness, service-worker update, and before-you-flash stay authoritative and engine-owned. |
| `signature_verified` | Stays `skip`. No surface claims cryptographic signature verification. |
| Exposed kits / modules / channels | The 2.0 view exposes nothing the 1.0 view does not. The release gates are the source of truth. |
| Production default | Stays the 1.0 view until the separate GA cutover. |
| Every firmware binary, `manifest.json`, `firmware-*.json`, `firmware/sources.json` | No import or regeneration in a view-migration PR. |
| `REQUIRED_CONFIGS`, `scripts/data/kits.json` | Unchanged by the view migration. |
| Rescue path and rescue binary | Untouched. |
| Desktop Chromium capability gate | The mobile and unsupported fallback stays intact. |

## See also

* [`docs/webflash-2-migration.md`](webflash-2-migration.md) — the controlling
  strategy, including the GA acceptance gates and the S360-410 master shipping
  gate.
* [`docs/webflash-2-migration-delivery.md`](webflash-2-migration-delivery.md) —
  the delivery plan; the beta default step is releasable on `main` with the
  production default unchanged.
* [`docs/adr/0001-webflash-2-view-over-engine.md`](adr/0001-webflash-2-view-over-engine.md)
  — the view/engine boundary contract the 2.0 view must honour.
* [`docs/led-preview-webflash-proof.md`](led-preview-webflash-proof.md) — the
  operator-evidence container this one is modelled on.
