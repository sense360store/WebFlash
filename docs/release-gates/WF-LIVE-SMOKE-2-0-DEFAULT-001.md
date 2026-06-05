# WF-LIVE-SMOKE-2-0-DEFAULT-001 — Live smoke on the deployed 2.0 default

**Identifier:** `WF-LIVE-SMOKE-2-0-DEFAULT-001`

This document records a **smoke test of the deployed GitHub Pages 2.0 default
installer** against the live origin `https://sense360store.github.io/WebFlash/`.
It is the live-deployment confirmation queued after the 2.0 view became the sole
production installer and the kit picker plus its install gates were rebuilt on
it. It answers one question: does the deployed default behave the way the merged
PRs say it should?

The dependency PRs that this record verifies are deployed:

- **WF2-CALLOUT-HIDDEN-FIX-001** (#495) — the empty amber `.callout--warn` bars
  no longer paint around the install verdict.
- **WF2-KIT-BUNDLE-PICKER-001** (#496) — the five base room bundles restored
  into the 2.0 kit picker.
- **WF2-FAN-CONTROL-GATES-001** (#497) — the additive fan-control and analog-fan
  (FanDAC) address-switch acknowledgements restored in the 2.0 install gate, plus
  the Bathroom Relay preview kit.
- **WF-IMPORT-FAN-BUNDLES-001** (#498) — the five full-composition fan-control
  room-bundle previews imported into `manifest.json` (9 → 14 builds).
- **WF2-FAN-EXPANSION-001** (#500) — the five imported fan bundles surfaced as
  preview kit cards (6 → 11 kits).

> **Docs / test only — promotes nothing, enables nothing, exposes nothing,
> imports nothing, and changes no runtime behaviour.** This record imports no
> firmware, regenerates no manifest, edits no [`manifest.json`](../../manifest.json)
> or [`firmware/sources.json`](../../firmware/sources.json) entry, changes no
> `REQUIRED_CONFIGS` value, adds no kit or install card, marks no preview build
> stable, exposes no TRIAC or standalone fan-only build as a kit, and weakens no
> install gate. The only files it adds are this Markdown record and the
> deterministic guard test
> [`__tests__/wf-live-smoke-2-0-default.test.js`](../../__tests__/wf-live-smoke-2-0-default.test.js).

---

## Test environment

| Field | Value |
|---|---|
| **WebFlash URL tested** | `https://sense360store.github.io/WebFlash/` |
| **Manifest URL** | `https://sense360store.github.io/WebFlash/manifest.json` |
| **Date / time (UTC)** | 2026-06-05 |
| **App shell marker (repo)** | `webflash-app-shell = 2026-06-04-3`, `webflash-app-version = 1.0.1`, cache-bust `?v=202606043` |
| **Verification method** | Automated live-origin verification from the remote agent — direct HTTPS fetches of the deployed page assets the wizard loads (`manifest.json`, `scripts/data/kits.json`, `scripts/install.js`, `app.css`, the brand logo) — combined with deterministic analysis of the engine gate logic and the full green test suite. See **Methodology note** below. |

### Methodology note (honest scope)

This record was produced by a remote (non-interactive) agent that **cannot drive
a real desktop Chromium browser, Web Serial, or browser devtools**. It verified
the parts that actually determine the deployed behaviour — the live data the
wizard renders and the live gate code it runs — by fetching them directly from
the deployed origin, and it reasoned about the rendered outcome from the
deterministic engine + view logic plus the passing test suite.

What that **does** establish: the deployed origin serves the expected manifest
(one stable build, the previews, Rescue), the expected eleven-kit picker (one
stable / recommended bundle, the rest preview), the live fan-control / FanDAC
acknowledgement gate code, the empty-callout-bar CSS fix, and the brand logo
asset. What it does **not** replace: a human pass in an incognito desktop-Chromium
window visually confirming the rendered wizard surface (logo paints, no empty
amber bars, the picker cards read correctly, the acknowledgement checkboxes
appear and gate). That human visual pass is recorded below as a **recommended
follow-up**, not a blocker — the contract-level and gate-code-level evidence is
the load-bearing part and it is green.

One tooling limitation worth noting: the markdown-converting fetch tool returns
only the visible body text of `index.html` (the title and skip link), so the
`<head>` meta tags and script tags could not be quoted directly from the live
HTML. The deploy is nonetheless proven current by the other live assets fetched
from the **same commit** — most decisively `manifest.json` whose `generated_at`
is dated the day of this record (see below) — so the served `index.html` shell is
that same commit's shell.

---

## Live-origin evidence (network-level)

This is the load-bearing evidence. Each asset was fetched directly from the
deployed origin.

### 1. `manifest.json` — HTTP 200, fresh, 14 builds

| Check | Result |
|---|---|
| HTTP 200 | **PASS** |
| `generated_at` present and current | **PASS** — `2026-06-05T11:41:17.396224+00:00` (dated the day of this record → the deploy is current) |
| Build count | **PASS** — 14 builds |
| Channel split | **PASS** — 1 `stable`, 12 `preview`, 1 `rescue` |
| The single stable build | **PASS** — `Ceiling-POE-VentIQ-RoomIQ` (the Release-One Bathroom PoE build), `version 1.0.0` |
| No TRIAC build | **PASS** — no `config_string` contains `FanTRIAC` |

Live manifest builds (config string × channel):

| `config_string` | `channel` |
|---|---|
| `Ceiling-POE-VentIQ-RoomIQ` | **stable** |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | preview |
| `Ceiling-POE-AirIQ-RoomIQ` | preview |
| `Ceiling-POE-RoomIQ` | preview |
| `Ceiling-POE-RoomIQ-LED` | preview |
| `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview |
| `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | preview |
| `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | preview |
| `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | preview |
| `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | preview |
| `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | preview |
| `Ceiling-POE-FanPWM` | preview (standalone fan-only — advanced builder only) |
| `Ceiling-POE-FanDAC` | preview (standalone fan-only — advanced builder only) |
| `Rescue` | rescue |

### 2. `scripts/data/kits.json` — HTTP 200, 11 kits, one stable/recommended

| Check | Result |
|---|---|
| HTTP 200 | **PASS** |
| Kit count | **PASS** — 11 kits |
| Only stable / recommended kit | **PASS** — `S360-KIT-BATH-P` → `Ceiling-POE-VentIQ-RoomIQ` (the only `recommended: true`, the only `firmware_channel: stable`) |
| The other ten kits | **PASS** — all `preview`, none recommended |
| No fan-only / TRIAC kit | **PASS** — no kit maps to `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` / any TRIAC config |

Deployed kit cards (SKU → config string → channel):

| SKU | config string | channel |
|---|---|---|
| `S360-KIT-BATH-P` (recommended) | `Ceiling-POE-VentIQ-RoomIQ` | **stable** |
| `S360-KIT-KITCHEN-P` | `Ceiling-POE-AirIQ-RoomIQ` | preview |
| `S360-KIT-BEDROOM-P` | `Ceiling-POE-RoomIQ` | preview |
| `S360-KIT-LIVING-P` | `Ceiling-POE-RoomIQ-LED` | preview |
| `S360-KIT-CORRIDOR-P` | `Ceiling-POE-RoomIQ-LED` | preview |
| `S360-KIT-BATH-P-REL` | `Ceiling-POE-VentIQ-FanRelay-RoomIQ` | preview |
| `S360-KIT-BATH-P-PWM` | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | preview |
| `S360-KIT-BATH-P-DAC` | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | preview |
| `S360-KIT-KITCHEN-P-REL` | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | preview |
| `S360-KIT-KITCHEN-P-PWM` | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | preview |
| `S360-KIT-KITCHEN-P-DAC` | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | preview |

Every kit config string above is present in the live manifest table on the
matching channel, so every kit card resolves to a real installable build.

### 3. `scripts/install.js` — HTTP 200, the additive gate is live

The deployed install module carries the WF2-FAN-CONTROL-GATES-001 gate code:

| Check | Result |
|---|---|
| `composeInstallEnabled` defined | **PASS** |
| `configRequiresFanControlAck` defined | **PASS** |
| `configRequiresDacAddressAck` defined | **PASS** |
| `FAN_CONTROL_TOKENS` | **PASS** — `['FanRelay', 'FanPWM', 'FanDAC']` |
| Fan-control warning copy | **PASS** — `"preview fan-control firmware"` present |
| FanDAC analog address copy | **PASS** — `0x58`, `0x5A`, `0x59`, and the `FANDAC-I2C-ADDR-001` pending reference all present |

`composeInstallEnabled` is **additive and engine-dominated**: it returns
`false` whenever the engine verdict is blocking, regardless of acknowledgements,
and otherwise AND-s the config-driven fan-control / FanDAC acknowledgements on
top. It can only make install harder, never bypass the engine-owned gate
(provenance, SHA-256 integrity, manifest freshness, service-worker update, and
the engine's own `channel:preview` acknowledgement stay authoritative).

### 4. `app.css` — HTTP 200, the empty-callout-bar fix is live

| Check | Result |
|---|---|
| HTTP 200 | **PASS** |
| `[hidden]` reset present | **PASS** — `[hidden] { display: none !important; }` |

The `!important` reset re-establishes the user-agent `[hidden]` behaviour over
the author `.callout { display: flex }` rule, so the `hidden`-attributed
service-worker notice, unsupported-browser banner, and freshness controls no
longer paint as empty amber bars around the install verdict.

### 5. Brand logo asset — HTTP 200

| Check | Result |
|---|---|
| `assets/sense360-logo.png` HTTP 200 | **PASS** — valid `image/png`, ~20.8 KB |

`scripts/app.js` resolves the logo module-relatively
(`new URL('../assets/sense360-logo.png', import.meta.url)`), and the asset serves
200 from the live origin, so the brand logo source is deployed and reachable. The
visual paint is part of the recommended human pass below.

---

## Smoke checklist (the queued claims)

| Claim | Result | Evidence |
|---|---|---|
| The logo renders | **PASS (asset level)** | `assets/sense360-logo.png` HTTP 200, valid PNG; module-relative `LOGO_URL` in the deployed `scripts/app.js`. Visual paint → recommended human pass. |
| Base bundles show with the correct channels | **PASS** | Live `kits.json` — Bathroom PoE = stable / recommended; Kitchen / Bedroom / Living / Corridor (+ the six fan bundles) = preview. Each resolves to a live manifest build on its channel. |
| Fan-control + FanDAC acknowledgements gate | **PASS** | Deployed `scripts/install.js` — `configRequiresFanControlAck` for any fan kit, `configRequiresDacAddressAck` for the two FanDAC kits, AND-ed into `composeInstallEnabled` on top of the engine-owned preview-channel ack. |
| No TRIAC appears in the picker | **PASS** | No TRIAC build in the live manifest; no kit references a TRIAC config or selects `fan: 'triac'`. |
| No standalone fan build appears in the picker | **PASS** | `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` exist in the manifest (advanced-builder reachable) but no kit card maps to them. |
| Freshness `unknown` is non-blocking; `stale` hard-blocks | **PASS (deterministic)** | See the freshness matrix below. |
| No empty callout bars | **PASS** | Live `app.css` `[hidden] { display: none !important; }`. Visual confirmation → recommended human pass. |

### Manifest freshness matrix (engine-owned, `scripts/state.js`)

The freshness gate composed by `evaluateInstallGate` resolves as follows (pinned
by [`__tests__/wf2-install-gate.test.js`](../../__tests__/wf2-install-gate.test.js)):

| Verdict | Row status | Install | Notes |
|---|---|---|---|
| `current` | pass | **allowed** | live `generated_at` not newer than the loaded one |
| `pending` | pending | **allowed** | bootstrap (unrun) state — the default before the check completes; it is **not** evidence of a stale manifest, so it never blocks the user |
| `unknown` | warn | **blocks until acknowledged** | acknowledgeable soft warn — the user can recheck or acknowledge to continue with the loaded list |
| `stale` | fail | **hard-blocks** | a newer manifest is published; the only resolution is to reload — it is **not** acknowledgeable |

So the queued claim reads precisely as: the bootstrap / `unknown` path never hard
-stops the default install (pending is non-blocking; unknown is acknowledgeable),
while `stale` is the one freshness verdict that cannot be acknowledged away.

---

## Deterministic guard test

[`__tests__/wf-live-smoke-2-0-default.test.js`](../../__tests__/wf-live-smoke-2-0-default.test.js)
pins the committed repo state that produces the deployed surface verified above,
so a future change cannot silently regress these smoke claims. It is offline and
deterministic (reads `manifest.json`, `scripts/data/kits.json` through the real
kit-config loader, the pure `install.js` gate predicates, and `app.css`; no
network, no DOM, no engine mount). It pins:

- exactly one stable manifest build, `Ceiling-POE-VentIQ-RoomIQ`, and it is the
  only recommended / stable kit;
- the stable default install path needs neither additive acknowledgement;
- every kit card resolves to a real manifest build on its declared channel;
- no TRIAC anywhere; the two standalone fan-only builds exist but are never kit
  cards;
- the additive acknowledgements match each kit's fan driver (fan-control for
  every fan kit, address-switch for exactly the two FanDAC kits) and never
  bypass a blocking engine verdict;
- preview stays preview (one stable, one rescue, the rest preview; no preview kit
  carries a buyable / default / recommended flag);
- the `[hidden]` callout reset stays in `app.css`.

The build **count** is intentionally not pinned here (that belongs to the import
and catalog-alignment suites) so a future legitimate import does not trip this
smoke guard as long as the default behaviour holds.

---

## Recorded result

| Field | Value |
|---|---|
| **WebFlash URL tested** | `https://sense360store.github.io/WebFlash/` |
| **Browser / OS** | Automated HTTPS client from the remote agent (no GUI browser available in this environment). Recommended human re-confirm: Chrome / Edge / Opera on Windows / macOS / Linux. |
| **Date / time** | 2026-06-05 (UTC) |
| **Service worker** | Fetches issued with no prior cache and no registered service worker (incognito-equivalent first session) |
| **Default install target** | `Ceiling-POE-VentIQ-RoomIQ` (stable, v1.0.0) via the recommended `S360-KIT-BATH-P` kit |
| **Picker contents** | 11 kit cards (1 stable + 10 preview); no TRIAC; no standalone fan-only card |
| **Install gate** | engine-owned gate authoritative; additive fan-control / FanDAC acknowledgements live and config-driven; preview builds gated by `channel:preview` |
| **Empty callout bars** | none (CSS `[hidden]` reset deployed) |
| **Screenshots** | None (no GUI browser in this environment) |
| **Pass / fail** | **PASS** |

### Verdict

**Result: PASS.** The deployed GitHub Pages 2.0 default serves exactly the
intended surface. The default and only recommended choice resolves to the stable
Bathroom PoE build; the ten preview kits resolve to real preview builds and stay
behind the engine's preview-channel acknowledgement; the additive fan-control and
FanDAC analog-address acknowledgements are live and strictly tighten install for
the fan kits; no TRIAC and no standalone fan-only build appears as a kit card; the
freshness gate treats the bootstrap / `unknown` state as non-hard-blocking while
`stale` hard-blocks; and the empty-callout-bar fix is deployed. No regression was
found, so nothing was scoped to change.

### Recommended (non-blocking) follow-up

Because this record was produced without a GUI browser, a human operator running
one incognito desktop-Chromium pass — load
`https://sense360store.github.io/WebFlash/`, confirm the logo paints, confirm no
empty amber bars appear around the install verdict, glance over the eleven kit
cards and their stable / preview labels, select a fan kit and confirm the
fan-control acknowledgement appears (and the analog-address one for a FanDAC kit),
and confirm the stable Bathroom kit installs with no extra acknowledgement — would
visually close the loop. This PASS record covers the contract-level and
gate-code-level health; the human pass covers the rendered pixels.

---

## Validation run with this record

- `npm test` — **62 suites, 1103 tests passed** (1088 pre-existing + 15 in the new
  guard). No pre-existing test was modified.
- `npm test -- wf-live-smoke-2-0-default` — **15 passed** (the new guard).
- `python3 scripts/gen-manifests.py --strict-validate --dry-run` — **not run in
  this environment** (the signing path needs the Python `cryptography` Ed25519
  bindings, which are not installed here). Not load-bearing for this change: it
  touches no firmware, no `manifest.json`, no `firmware/sources.json`, and no
  signing input, and the manifest-health guard
  ([`__tests__/manifest-health.test.js`](../../__tests__/manifest-health.test.js))
  is green in the `npm test` run above.

## Do-not-change confirmation

This record adds **only** one Markdown file and one Jest guard test. Every
firmware binary, `manifest.json`, every `firmware-*.json`, `firmware/sources.json`,
the `REQUIRED_CONFIGS = ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` allowlist,
`scripts/data/kits.json`, `scripts/data/module-requirements.js`, every file under
`scripts/` (including `scripts/install.js`, `scripts/state.js`,
`scripts/services/manifest-freshness.js`, and `scripts/utils/release-channels.js`),
every other test, `app.css`, every `css/*.css` sheet, `sw.js`, `_headers`,
`index.html`, and every `.github/workflows/*` file are **byte-identical**. No
runtime behaviour changed. No firmware imported. No kit added. No preview build
made stable / recommended / default / buyable. No TRIAC or standalone fan-only
build exposed as a kit. No install gate weakened. No browser-side
signature-verification claim. No hardware / bench / compliance / safety /
commercial-availability proof claimed. The FanTRIAC build block, the
preview-channel acknowledgement model, and the `FANDAC-I2C-ADDR-001` pending
status all stand.
