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

1. **Identify** — recommended-kit picker (stable + preview) and an advanced
   "build it module by module" path with live conflict gating, the TRIAC
   "not installable yet" guard, and a generated firmware target.
2. **Install** — auto-running pre-flight readiness checklist, the
   preview-channel acknowledgement gate, and an animated flash progress
   ring with a streaming esptool console.
3. **Connect** — Wi-Fi scan, password entry, Improv credential push, and the
   success screen. Light/dark theming throughout.

## What it is *not* (yet)

This is a **visual prototype**. The readiness checks, flash progress, and
Wi-Fi scan are **simulated** (timers + animation) — it does **not** drive real
Web Serial / ESP Web Tools, the live `manifest.json`, signing, or preflight.
The catalog in `scripts/data.js` mirrors the live Sense360 kits/SKUs/channels
but is a local copy. Wiring the design to the real flashing stack is a
separate, larger effort.

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
    data.js           hardware + firmware catalog (kits, modules, conflicts)
    ui.js             progress rail, step header, device chip
    identify.js       Step 1
    install.js        Step 2
    connect.js        Step 3
    app.js            state machine + shell + mount (entry point)
```

Each `*.jsx` component from the handoff maps to the same-named `*.js` module;
React local state becomes per-step closure state, and `setState`-driven
re-renders become targeted DOM updates.
