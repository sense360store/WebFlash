# PRODUCT-GUIDES-001 — customer product guides on GitHub Pages (tracking)

Programme tracking file (guardrail 7) for the WebFlash side of
PRODUCT-GUIDES-001. The lowest non-EXECUTED step is the next step a session
executes. This repo owns only G3 (surfacing the guides in the flasher); G1 and
G2 run in `sense360store/esphome-public`, which hosts the site itself.

**Goal.** A customer-grade docs site for the four served products, hosted from
`sense360store/esphome-public` via mkdocs-material. WebFlash surfaces those
guides from the flasher: a post-install "next steps" link, a shell docs link,
and README / SUPPORT links.

## Step status

| Step | Repo | Scope | Status |
|---|---|---|---|
| G1 | esphome-public | Scaffold: `site/` mkdocs tree, derivation script, Pages deploy workflow, CONTRIBUTING gate line | **EXECUTED** (esphome-public PR #802) |
| G2 | esphome-public | The four product guides + generated comparison matrix | **EXECUTED** (esphome-public) |
| G3 | WebFlash | Post-install "next steps" guide link, shell Guides link, README / SUPPORT links | **EXECUTED** (this PR) |

The G2 EXECUTED status was confirmed against `sense360store/esphome-public`
`main` (`docs/product-guides-001.md` raw) before this step ran, per the session
protocol.

## Decisions of record (ratified by merging G1 in esphome-public)

- **D-G1** Hosting: esphome-public repo, GitHub Pages via Actions; the guides
  version alongside the YAML they are derived from.
- **D-G2** Site source: a dedicated `site/` directory with an explicitly curated
  nav. Engineer docs stay out of the customer nav.
- **D-G3** Custom domain: later, console action (Pages settings CNAME).
- **D-G4** Placement and LED facts: guides ship with clearly marked "guidance
  being finalised" blocks rather than blocking on owner input.
- **D-G5** The LED preview product gets a guide with the preview channel warning
  prominent.

## What G3 created (this repo)

- **Post-install "next steps".** The Connect step (`scripts/connect.js`) renders
  a `[data-post-flash-handoff="product-guide"]` section in the completed states,
  linking the flashed configuration's product guide. The mapping
  (`productGuideLink` / `PRODUCT_GUIDE_PATHS`) keys off the build's
  `config_string` — the same identity the manifest and the post-flash snapshot
  carry — with the four served configs (`Ceiling-POE-RoomIQ`,
  `Ceiling-POE-AirIQ-RoomIQ`, `Ceiling-POE-VentIQ-RoomIQ`,
  `Ceiling-POE-VentIQ-RoomIQ-LED`) mapped to their own guide and every other
  configuration (for example Rescue) falling back to the guides overview so the
  link is never broken.
- **Shell Guides link.** The app-shell window bar (`scripts/ui.js` `WinBar`,
  wired by `scripts/app.js`) renders a `[data-guides-link]` anchor to the guides
  site. It renders only when the mounting view supplies the URL, so bare
  scaffold mounts are unchanged.
- **README / SUPPORT links.** `README.md` and `SUPPORT.md` link the guides site
  in their help sections.
- **Tests.** `__tests__/product-guides-links.test.js` pins the
  `config_string` -> guide-URL mapping, the fallback, the Connect-step handoff
  (shown only in completed states, exact vs overview), the shell link, and the
  README / SUPPORT links.

## Deviations / notes of record

- **Shell docs link location.** The manifest names `index.html shell section`
  as the writable surface for the shell docs link. WebFlash renders no visible
  persistent chrome in `index.html` itself — the app-shell window bar is
  JS-rendered by `scripts/ui.js` `WinBar` (mounted by `scripts/app.js`), which
  the code comments already call "the app-shell window bar". The Guides link is
  therefore implemented in the JS-rendered shell (the actual, visible shell) so
  it appears in the running app; `index.html` is left unchanged.
- **No cache-version bump.** The behaviour change touches JS the service worker
  precaches. A forced-refresh cache bump requires editing `sw.js` `CACHE_NAME`,
  the `index.html` / `bootstrap.js` `?v=` token, and the `webflash-app-shell`
  marker in lockstep — `sw.js` and `bootstrap.js` are outside G3's writable
  surfaces, so no partial bump was made here. The bump should accompany the
  deploy that ships this change.
- **No release-surface / gate change.** G3 adds only outbound links to the
  guides site. No firmware, `manifest.json`, `firmware/sources.json`,
  `REQUIRED_CONFIGS`, kit, release-channel, or install-gate logic changed. The
  guide links are plain external navigations (`<a target="_blank">`), not
  `fetch` / `connect-src`, so no CSP origin was added.

## Log

- 2026-07-07 — G3 executed in the WebFlash checkout: post-install "next steps"
  guide link (config_string -> guide URL with overview fallback), shell Guides
  link, README / SUPPORT links, and tests. Full test suite green (72 suites);
  manifest generator dry-run clean (no drift); naming-policy validator passed;
  deployed-headers check 0 fail. One held PR; HOLD FOR OWNER.
