# REPO-CUSTOMER-READY-001 — WebFlash execution log

This file carries the ratified owner decisions of the REPO-CUSTOMER-READY-001
programme and the local execution log for this repository. One programme
session executes exactly one step in exactly one repository, opens exactly one
PR, marks its step EXECUTED here in the same PR, then stops. Later sessions
read this file to find the lowest numbered non EXECUTED step for this
repository. The esphome-public counterpart lives at
`docs/repo-customer-ready-001.md` on
[`sense360store/esphome-public`](https://github.com/sense360store/esphome-public).

## Ratified owner decisions (2026-07-05)

- **D1:** WebFlash is licensed MIT (© 2026 Sense360), byte identical to the
  standard MIT text. The README "device owners and authorized distributors"
  sentence is removed and replaced with the licence statement.
- **D2:** A NOTICE section (in the WebFlash README §License and a NOTICE file)
  states that binaries under `firmware/` are build artifacts of
  sense360store/esphome-public distributed under its MIT terms, integrity
  assured by ed25519 signing, and are not relicensed by this repository's
  licence.
- **D3:** Support routing: GitHub Issues for defects on both repos; community
  Q&A via GitHub Discussions on esphome-public (owner enables in console);
  order and warranty matters route to the mysense360.com contact page. The
  canonical flasher URL is https://sense360store.github.io/WebFlash/ and
  every reference to "WebFlash" as a destination uses it, never the
  storefront.
- **D4:** The default credential advisory is authored as an in tree DRAFT
  only; publication is an owner action gated on WF-H1-REIMPORT-CLEAN-001
  landing.
- **D5:** Both READMEs become front doors under 100 lines: what this is,
  flash or adopt in three steps, where to get help. Displaced content moves
  under docs/ with every inbound reference repointed in the same PR.
- **D6:** esphome-public LICENSE copyright year updated; its README gains a
  licence split statement: firmware configurations MIT, hardware designs
  CERN-OHL-P, experimental lane posture per COMPLIANCE-001.

## Step sequence (programme wide)

- **S1** — esphome-public additive bundle (execution log, D6, SUPPORT.md,
  CONTRIBUTING.md, issue templates, PR template, `docs/release-channels.md`).
- **S2** — WebFlash additive bundle (this file, D1, D2, SUPPORT.md,
  CONTRIBUTING.md, extended issue templates, PR template).
- **S3** — esphome-public README front door per D5.
- **S4** — WebFlash README front door per D5 (1004 lines to under 100),
  linking `docs/release-channels.md` on esphome-public and TROUBLESHOOTING.md
  prominently.
- **S5** — esphome-public link checker CI (one new workflow).
- **S6** — WebFlash link checker CI (one new workflow; ignore list covers the
  two release gate records and archive index paths).
- **S7** — WebFlash advisory DRAFT
  (`docs/security/advisory-default-credentials-DRAFT.md`, per D4; not linked
  from any user facing surface).

Extension, installer improvement steps (ratified by owner 2026-07-05), all
targeting WebFlash only; WebFlash session order is therefore S6, S7, S8, S9,
S10, S11, S12:

- **S8** — Supply chain and origin hardening (vendor esp-web-tools 10.2.1,
  `script-src 'self'`, `scripts/origin-guard.js`, guard test). **HOLD:
  owner review and manual smoke required before merge.**
- **S9** — Mobile handoff and rescue discoverability.
- **S10** — Motion and focus polish (`prefers-reduced-motion`, step focus).
- **S11** — Brand and link preview polish (self hosted Murecho font, brand
  tokens, `theme-color` / OpenGraph meta, apple touch icon).
- **S12** — Trust statement ("No analytics" section in
  `docs/firmware-provenance.md`, `connect-src` guard test).

## Local execution log (WebFlash steps)

| Step | Status | PR | Notes |
|---|---|---|---|
| S2 | EXECUTED | [#576](https://github.com/sense360store/WebFlash/pull/576) | LICENSE (D1), NOTICE + README §License notice (D2), SUPPORT.md (D3), CONTRIBUTING.md, flash failure and firmware request issue templates, PULL_REQUEST_TEMPLATE.md, this file. |
| S4 | EXECUTED | [#577](https://github.com/sense360store/WebFlash/pull/577) | README rewritten as a front door under 100 lines (D5) keeping the D1 licence statement and D2 notice; displaced content relocated to `docs/user-guide.md`, `docs/hardware-options.md`, `docs/kit-configuration.md`, `docs/release-channel-policy.md`, `docs/firmware-provenance.md`, `docs/cache-and-deployment.md` with a new `docs/README.md` index; inbound references repointed (`CLAUDE.md`, `CONTRIBUTING.md`, PR template, `DEVELOPER.md`, `docs/architecture.md`); canonical flasher URL set in README, SUPPORT.md, and the docs index (SUPPORT.md carried no storefront flasher link to correct; the stale `flash.sense360.com` kit example was corrected instead). |
| S6 | EXECUTED | [#579](https://github.com/sense360store/WebFlash/pull/579) | New workflow `.github/workflows/docs-link-check.yml` (no existing workflow modified): deterministic, network free markdown link checker over kept docs verifying every relative link resolves to a file in the tree; external URLs out of scope. Ignore list covers the release gate records (`docs/release-gates/`, byte stable evidence documents, which includes the two named by the programme manifest) and the archive index paths (`docs/archive-index.md`, `docs/docs-disposition-manifest.md`, whose rows intentionally reference deleted files); `firmware/` release note artifacts are excluded as published artifacts. Verified passing on the current tree before the PR opened (27 kept markdown files, 198 relative links). |
| S7 | EXECUTED | [#578](https://github.com/sense360store/WebFlash/pull/578) | `docs/security/advisory-default-credentials-DRAFT.md` created per D4: affected stable versions (Ceiling-POE-VentIQ-RoomIQ ≤ v1.0.4, Ceiling-POE-RoomIQ ≤ v1.0.5, Ceiling-POE-AirIQ-RoomIQ ≤ v1.0.6), plain language risk statement by credential class (no literal values), reflash instructions via the canonical flasher URL, post flash verification steps, and the publication gate (owner publishes as a GHSA only after WF-H1-REIMPORT-CLEAN-001 lands). Marked DRAFT in title and body; not linked from any user facing surface. |
| S8 | EXECUTED | [#580](https://github.com/sense360store/WebFlash/pull/580) | Supply chain and origin hardening. esp-web-tools 10.2.1 vendored under `vendor/esp-web-tools/` (complete `dist/web/` tree, byte identical to the npm tarball, registry sha512 verified, Apache-2.0 LICENSE alongside); index.html script tag repointed at the vendored path with the unpkg URL, SRI attribute, and crossorigin removed; meta CSP tightened to `script-src 'self'`; `scripts/origin-guard.js` created and imported from bootstrap (frame bust plus a warning banner naming https://sense360store.github.io/WebFlash/ on any non canonical origin); guard test `__tests__/supply-chain-guard.test.js` pins no remote script origin in the meta CSP and no unpkg reference under `vendor/`. `sw.js`, `_headers`, and `scripts/check-headers.js` untouched (outside the step's writable surface; follow-ups noted in the PR). **Merge remains on HOLD per the programme manifest: owner review and manual smoke (wizard renders, device reaches the install gate) required before merge.** |
| S9 | EXECUTED | [#581](https://github.com/sense360store/WebFlash/pull/581) | Polish bundle (S9+S10+S11+S12 in one PR per the ratified extension). Mobile handoff: the install step's blocked capability states (mobile, no Web Serial, insecure context) carry designed copy (what Web Serial is, why desktop Chromium is needed) plus a copy link button for continuing on desktop, with honest fallback when clipboard access is denied (`scripts/install.js`, `scripts/icons.js`, `app.css`). Rescue audit: the topbar Rescue button is already a visible entry point on every step before a device is connected, so no shell link was added; the help modal now points at Rescue and links TROUBLESHOOTING.md (`scripts/app.js`). Presentation only; the engine gate stays authoritative. |
| S10 | EXECUTED | [#581](https://github.com/sense360store/WebFlash/pull/581) | Motion and focus polish. `css/features.css` and `css/layout.css` gain sheet local `prefers-reduced-motion` handling (spinners stop, transitions collapse) under the existing project wide safety net in `css/theme.css`; step changes move focus to the new step heading via the modal `tabindex="-1"` pattern (`focusStepHeading` in `scripts/app.js`, called only from goTo/reset, never a plain re-render). Keyboard walkthrough result documented in the PR. |
| S11 | EXECUTED | [#581](https://github.com/sense360store/WebFlash/pull/581) | Brand and link preview polish. Murecho (latin + latin-ext, variable 400-700) self hosted under `vendor/fonts/` with its OFL licence alongside, `font-src` stays `'self'`; brand tokens (`--brand: #00bf63` plus derived and dark theme values) applied to primary actions and stable channel badges, colour only, no layout change; `theme-color`, `og:title`, `og:description`, and a 180x180 apple touch icon derived from the existing favicon added to the index.html head. Follow ups noted in the PR: sw.js precache and the deploy token bump are outside this bundle's writable surfaces. |
| S12 | EXECUTED | [#581](https://github.com/sense360store/WebFlash/pull/581) | Trust statement. "No analytics" section added to `docs/firmware-provenance.md` (no analytics, no tracking, no third party requests, backed by the CSP); new guard test `__tests__/no-analytics-guard.test.js` pins `connect-src` to exactly `'self'` and `blob:` in both the meta CSP and `_headers`; stale post S8 CSP descriptions updated to `script-src 'self'` (comments in `scripts/state.js` and `scripts/install.js`, the `KNOWN_BROAD_SCRIPT_HOSTS` expectation in `scripts/check-headers.js`, and its test fixtures) — strings and expectations only, no logic. |
