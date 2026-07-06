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
| S6 | PENDING | — | WebFlash link checker CI workflow. |
| S7 | EXECUTED | — | `docs/security/advisory-default-credentials-DRAFT.md` created per D4: affected stable versions (Ceiling-POE-VentIQ-RoomIQ ≤ v1.0.4, Ceiling-POE-RoomIQ ≤ v1.0.5, Ceiling-POE-AirIQ-RoomIQ ≤ v1.0.6), plain language risk statement by credential class (no literal values), reflash instructions via the canonical flasher URL, post flash verification steps, and the publication gate (owner publishes as a GHSA only after WF-H1-REIMPORT-CLEAN-001 lands). Marked DRAFT in title and body; not linked from any user facing surface. |
| S8 | PENDING (HOLD) | — | Supply chain and origin hardening; owner review and manual smoke required before merge. |
| S9 | PENDING | — | Mobile handoff and rescue discoverability. |
| S10 | PENDING | — | Motion and focus polish. |
| S11 | PENDING | — | Brand and link preview polish. |
| S12 | PENDING | — | Trust statement and connect-src guard test. |
