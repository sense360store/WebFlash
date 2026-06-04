# WebFlash 2.0 — design preview

A standalone, self-contained preview of the **WebFlash 2.0** redesign, ported
from the Claude Design handoff (`WebFlash 2.0.html` + its React/Babel
prototype) into the repo's own conventions: **vanilla ES modules, no build
step, no React/Babel runtime**.

It lives alongside the production installer and does not touch it — open
`/webflash-2/` to view. The current production wizard at the repository root
is unchanged.

## What it is

A faithful, **pixel-for-pixel** rebuild of the three-step 2.0 flow:

1. **Identify** — kit picker and an advanced "build it module by module" path.
   As of PR 4 of the migration this step is **bound to the real engine**: kits
   load from the real catalogue (`scripts/data/kits.json`), selections flow
   through the real `setState`, and the firmware target plus installability
   verdict come from the engine's compatible-firmware lookup over
   `manifest.json`. A configuration with no installable build is routed to the
   ESPHome source path instead of the install flow, and the
   `?configmode=kit&sku=` and manual share links are honoured.
2. **Install** — the real composite install gate (capabilities, provenance,
   SHA-256 integrity, manifest freshness, service-worker update, the seven-tier
   channel acknowledgement, and the before-you-flash check), then real flashing
   through the ESP Web Tools install-button web component with a progress ring
   and console driven by its lifecycle events.
3. **Connect** — Wi-Fi scan, password entry, Improv credential push, and the
   success screen. Light/dark theming throughout.

## What it is *not* (yet)

Step 1 (Identify) and Step 2 (Install) are wired to the real engine: the
pre-flight readiness panel is the real composite install gate (PR 5) and the
flash is real, driven by the ESP Web Tools install-button lifecycle (PR 6). The
**Connect** step is still a **visual prototype**: its Wi-Fi scan and Improv
credential push are **simulated** (timers + animation) and do **not** drive real
Improv Serial. That is bound in the next migration PR (PR 7 Improv).

The real, fully functional 2.0 view runs inside the production shell at
**`?ui=2`** (the same origin as the 1.0 installer), where the engine can reach
the root `manifest.json` and `scripts/data/kits.json` and the ESP Web Tools
install-button component is loaded for real flashing. Opening the isolated
`/webflash-2/` preview directly cannot reach those root files, so its Identify
step shows the honest empty states (no kits resolved, build-from-source) and its
Install step cannot open a USB connection (it says so rather than leaving an
inert button). The local module-presentation data in `scripts/data.js`
(power/sensing/fan/LED option labels) mirrors the live Sense360 SKUs.

## Run locally

No build step — serve the repo root over HTTP and open the page in a desktop
Chromium browser (Chrome / Edge / Opera):

```bash
python3 -m http.server 5000
# → http://localhost:5000/webflash-2/
```

## Layout

```
webflash-2/
  index.html          entry (loads app.css + scripts/app.js as an ES module)
  app.css             design system — copied verbatim from the handoff
  assets/             brand logo + favicon (the official Sense360 assets)
  scripts/
    h.js              tiny hyperscript/DOM helper (the only "framework")
    icons.js          icon set (ported 1:1 from the prototype's ui.jsx)
    data.js           advanced-builder option labels + selection<->engine mapping
    engine.js         view-agnostic facade over the 1.0 engine (kits, state, lookup)
    ui.js             progress rail, step header, device chip
    identify.js       Step 1
    install.js        Step 2
    connect.js        Step 3
    app.js            state machine + shell + mount (entry point)
```

Each `*.jsx` component from the handoff maps to the same-named `*.js` module;
React local state becomes per-step closure state, and `setState`-driven
re-renders become targeted DOM updates.
