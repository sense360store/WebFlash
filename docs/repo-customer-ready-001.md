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
  order and warranty matters route to the mysense360.com contact page.
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

## Local execution log (WebFlash steps)

| Step | Status | PR | Notes |
|---|---|---|---|
| S2 | EXECUTED | #TBD | LICENSE (D1), NOTICE + README §License notice (D2), SUPPORT.md (D3), CONTRIBUTING.md, flash failure and firmware request issue templates, PULL_REQUEST_TEMPLATE.md, this file. |
| S4 | PENDING | — | WebFlash README front door per D5. |
| S6 | PENDING | — | WebFlash link checker CI workflow. |
| S7 | PENDING | — | Advisory DRAFT per D4. |
