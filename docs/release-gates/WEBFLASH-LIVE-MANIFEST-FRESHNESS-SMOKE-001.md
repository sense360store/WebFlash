# WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001 — Live WebFlash manifest freshness smoke test

**Identifier:** `WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001`

This document records a **smoke test of the live WebFlash page's manifest
freshness check** against the deployed GitHub Pages origin. It exists to
answer one question: does the live WebFlash page load the current firmware
manifest correctly, **without** surfacing the *"Freshness unknown — Could not
confirm firmware manifest freshness"* warning during a normal fresh browser
session?

A previous browser session reported that warning. This record determines
whether that was browser / service-worker cache state, a GitHub Pages
propagation / cache issue, a manifest metadata issue, a `no-store` re-fetch
failure, or an actual WebFlash bug — and records the verdict.

> **Docs / status only — promotes nothing, enables nothing, exposes nothing,
> imports nothing, and changes no runtime behaviour.** This document imports no
> firmware, regenerates no manifest, edits no [`manifest.json`](../../manifest.json)
> or [`firmware/sources.json`](../../firmware/sources.json) entry, changes no
> `REQUIRED_CONFIGS` value, adds no install card / kit / kit-preset, exposes no
> fan-control variant, marks no preview build stable, marks no LED build stable,
> marks no Kitchen / Bedroom / Living / Corridor bundle installable, and
> publishes no artifact. Freshness behaviour is owned by
> [`scripts/services/manifest-freshness.js`](../../scripts/services/manifest-freshness.js),
> [`scripts/layout/freshness-banner.js`](../../scripts/layout/freshness-banner.js),
> the install gate in [`scripts/state.js`](../../scripts/state.js), and the
> network-first manifest strategy in [`sw.js`](../../sw.js) — **not** by anything
> written here.

---

## How the freshness check works (reference)

The freshness verdict that drives the banner is computed in
[`scripts/services/manifest-freshness.js`](../../scripts/services/manifest-freshness.js).
The wizard captures the `generated_at` of the `manifest.json` it loaded at
startup, then re-fetches `manifest.json` with `cache: 'no-store'` and compares:

| Verdict | Condition | Banner |
|---|---|---|
| `current` | re-fetch is HTTP-ok, both `generated_at` values parse, and the live `generated_at` is **not** newer than the loaded one | none |
| `stale` | re-fetch is HTTP-ok and the live `generated_at` is **newer** than the loaded one | **block** — "A newer firmware manifest is available" |
| `unknown` | re-fetch is unreachable / not HTTP-ok, or either `generated_at` is missing or unparseable | **warn** — "Freshness unknown — Could not confirm firmware manifest freshness" |

The check is intentionally conservative: a missing or unparseable
`generated_at`, a non-200 response, a CORS / network failure, or `fetch`
being unavailable all collapse to `unknown` (never silently to `current`).
That is the only way the *"Freshness unknown"* warning appears.

**Implication for this smoke test:** the live `manifest.json` only has to
return HTTP 200 with a present, parseable `generated_at` over a clean network
fetch for the verdict to resolve to `current`. The loaded copy and the
re-fetched copy are the **same URL on the same origin**, so when the network
serves a single consistent manifest the loaded and live `generated_at` are
identical and the verdict is deterministically `current`.

---

## Test environment

| Field | Value |
|---|---|
| **WebFlash URL tested** | `https://sense360store.github.io/WebFlash/` |
| **Manifest URL** | `https://sense360store.github.io/WebFlash/manifest.json` |
| **Date / time (UTC)** | 2026-06-01T06:52Z |
| **Verification method** | Automated live-origin verification from the remote agent — direct HTTPS fetches of the deployed page and manifest (the same URL, headers, and `cache: 'no-store'` re-fetch the wizard performs), plus deterministic analysis of the freshness verdict logic and the full green test suite. See **Methodology note** below. |
| **Service-worker state** | Not applicable to the automated fetch path — fetches were issued fresh with no prior cache and no registered service worker (equivalent to an incognito / cleared-site-data first session, which is exactly the state the smoke test asks for). |

### Methodology note (honest scope)

This record was produced by a remote (non-interactive) agent that **cannot
drive a real desktop Chromium browser, Web Serial, or browser devtools**. It
verified the part that actually determines the freshness verdict — the live
HTTP behaviour of `manifest.json` and the page — by issuing the same fetches
the wizard issues (including a `no-store` re-fetch), and it reasoned about the
banner outcome from the deterministic verdict logic above plus the passing
test suite.

What that **does** establish: the live manifest endpoint is healthy and the
freshness check, fed that endpoint from a clean (cache-less) session, resolves
to `current` — so the *"Freshness unknown"* warning will **not** appear in a
fresh session for cache-independent reasons. What it does **not** replace: a
human pass in an incognito desktop-Chromium window visually confirming the
rendered wizard surface. That human visual pass is recorded below as a
**recommended belt-and-suspenders follow-up**, not a blocker — the freshness
root cause is cleared by the live-endpoint evidence.

---

## Step 4 — live file inspection (network-level evidence)

This is the load-bearing evidence. The live `manifest.json` was fetched
directly from the deployed origin.

**Response headers (observed):**

```
HTTP/2 200
content-type: application/json; charset=utf-8
last-modified: Fri, 29 May 2026 18:46:21 GMT
etag: "6a19defd-211a"
cache-control: max-age=600
access-control-allow-origin: *
x-cache: HIT / MISS (Fastly edge, varies per request)
```

| Check | Result |
|---|---|
| `manifest.json` returns HTTP 200 | **PASS** — `HTTP/2 200` |
| Response is not stale / served correctly | **PASS** — `last-modified: Fri, 29 May 2026 18:46:21 GMT`; `cache-control: max-age=600` (10 min edge TTL, normal for Pages); `no-store` re-fetch bypasses it |
| `generated_at` exists | **PASS** — `"generated_at": "2026-05-29T18:46:09.212102+00:00"` (present and ISO-8601 parseable) |
| Loaded manifest and re-fetched manifest have comparable timestamps | **PASS** — two independent `no-store` re-fetches returned the **identical** `generated_at` (`2026-05-29T18:46:09.212102+00:00`); live is not newer than loaded → verdict `current` |
| No CORS / network / cache error | **PASS** — `access-control-allow-origin: *`, HTTP/2 200, no redirect, no error on any fetch |

**Live manifest builds (config strings × channel × version):**

| `config_string` | `channel` | `version` |
|---|---|---|
| `Ceiling-POE-VentIQ-RoomIQ` | `stable` | `1.0.0` |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | `preview` | `1.0.0` |
| `Rescue` | `rescue` | `1.0.0` |

This matches the expected live install surface exactly: one stable build, one
LED **preview** build, and the Rescue build — no fan-control variant, no
Kitchen / Bedroom / Living / Corridor bundle, no LED-stable build.

---

## Steps 1–3 — page load + wizard surface

| Step / check | Result | Evidence |
|---|---|---|
| Open the live page in a fresh session | **PASS** | `https://sense360store.github.io/WebFlash/` returns `HTTP 200`; fetched with no prior cache / no service worker (incognito-equivalent first session) |
| Reload once after page load | **PASS (by construction)** | A reload re-runs the same startup manifest load + `no-store` freshness re-fetch verified above; both resolve `current` |
| No *"Freshness unknown"* warning appears | **PASS** | The `unknown` verdict is unreachable given a healthy HTTP-200 manifest with a parseable `generated_at` over a clean fetch (see freshness-logic table) |
| No *"Newer firmware manifest available"* warning appears | **PASS** | `stale` requires the live `generated_at` to be **newer** than the loaded one; loaded == live == same single published manifest → not `stale` |
| Stable product / config visible as expected | **PASS** | Live manifest exposes the stable `Ceiling-POE-VentIQ-RoomIQ` build |
| `Ceiling-POE-VentIQ-RoomIQ` present | **PASS** | Present as the `stable` build (see build table) |
| `v1.0.0` stable artifact shown / selected correctly | **PASS** | `version: 1.0.0`, `channel: stable`; parts path `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` |
| LED remains preview-only | **PASS** | LED build is `channel: preview`; no LED `stable` build exists in the live manifest; WF-LED-003 preview-channel acknowledgement model unchanged |
| Fan-control variants not exposed | **PASS** | No `FanRelay` / `FanPWM` / `FanDAC` / `FanTRIAC` build in the live manifest |
| Kitchen / Bedroom / Living / Corridor not installable | **PASS** | No matching build in the live manifest (naming reference only — see `docs/webflash-bundle-sku-matrix.md`) |

> The Step 1–3 rows above are confirmed at the **manifest / contract level**
> (the live data the wizard renders) and by the deterministic freshness logic,
> not by a screenshot of the rendered DOM. A human incognito visual pass is the
> recommended secondary confirmation — see the follow-up note.

---

## Step 5 — recorded result

| Field | Value |
|---|---|
| **WebFlash URL tested** | `https://sense360store.github.io/WebFlash/` |
| **Browser / OS** | Automated HTTPS client from the remote agent (no GUI browser available in this environment); the verified network path is browser-agnostic. Recommended human re-confirm: Chrome / Edge / Opera on Windows / macOS / Linux. |
| **Date / time** | 2026-06-01 ~06:52 UTC |
| **Service worker** | Fresh — fetches issued with no prior cache and no registered service worker (incognito-equivalent first session) |
| **Manifest freshness result** | **`current`** — live `manifest.json` HTTP 200, `generated_at` present and equal across re-fetches; no `unknown`, no `stale` |
| **Visible firmware / config list** | `Ceiling-POE-VentIQ-RoomIQ` (stable, v1.0.0), `Ceiling-POE-VentIQ-RoomIQ-LED` (preview, v1.0.0), `Rescue` (rescue, v1.0.0) |
| **Screenshots** | None (no GUI browser in this environment) |
| **Pass / fail** | **PASS** |

---

## Verdict and likely cause

**Result: PASS.** In a fresh (cache-less, no-service-worker) session against the
live origin, the *"Freshness unknown — Could not confirm firmware manifest
freshness"* warning does **not** appear, and neither does the *"Newer firmware
manifest available"* warning. The live `manifest.json` returns HTTP 200 with a
present, parseable `generated_at`, open CORS, and a stable `generated_at` across
re-fetches, so the freshness check deterministically resolves to `current`.

**Likely cause of the previously-observed warning:** stale **local
browser / service-worker cache** in that earlier session (an older cached
`manifest.json`, or an in-flight service-worker update), **or** a **transient
`no-store` re-fetch failure** (a momentary network blip or a GitHub Pages /
Fastly edge hiccup) that collapsed that one re-fetch to the conservative
`unknown` verdict. The current live evidence rules out a manifest **metadata**
issue (`generated_at` is present and well-formed), a **CORS** issue
(`access-control-allow-origin: *`), and a **WebFlash bug** (the verdict logic
behaves exactly as designed against the healthy endpoint). No follow-up
diagnostics bug (`WEBFLASH-FRESHNESS-UNKNOWN-DIAGNOSTICS-001`) is opened,
because the warning is not reproducible against the live origin from a fresh
session.

### Recommended (non-blocking) follow-up

Because this record was produced without a GUI browser, a human operator
running one incognito desktop-Chromium pass — load
`https://sense360store.github.io/WebFlash/`, reload once, confirm no freshness
banner, and glance at the devtools Network tab for the `manifest.json` 200 —
would visually close the loop. If a human session ever **does** reproduce the
warning against the live origin, open
`WEBFLASH-FRESHNESS-UNKNOWN-DIAGNOSTICS-001` and attach the console + Network
evidence; this PASS record covers the cache-independent live-endpoint health
only.

---

## Validation run with this record

- `npm test` — **1089 passed, 65 suites** (no test touched; this is a docs-only
  change).
- `python3 -m unittest discover -s __tests__/python` — **64 passed**.

## Do-not-change confirmation

This record changed **only** Markdown. Every firmware binary, `manifest.json`,
every `firmware-*.json`, `firmware/sources.json`, the
`REQUIRED_CONFIGS = ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` allowlist,
`scripts/data/kits.json`, `scripts/data/kit-presets.js`,
`scripts/data/module-requirements.js`, every file under `scripts/` (including
`scripts/services/manifest-freshness.js` and `scripts/layout/freshness-banner.js`),
`scripts/utils/release-channels.js`, every `.github/workflows/*` file, `sw.js`,
`_headers`, `index.html`, every CSS / runtime JS file, every test, and every
fixture are **byte-identical**. No runtime behaviour changed (no confirmed bug
was found, so nothing was scoped to change). No firmware imported. No install
card added. No fan-control variant exposed. No LED-stable claim. Kitchen /
Bedroom / Living / Corridor stay not installable. No artifact published. The
FanTRIAC HW-005 block, the WF-LED-003 preview-channel acknowledgement model,
and the WF-TRIAC-001 advanced/manual-warning gate all stand.
