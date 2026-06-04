# ADR 0001: WebFlash 2.0 is a view over the 1.0 engine

- Status: Accepted
- Date: 2026-06-04
- Owner: Neil
- Deciders: WebFlash maintainers
- Related: [strategy](../webflash-2-migration.md), [delivery plan](../webflash-2-migration-delivery.md), [per-PR runbook](../webflash-2-migration-prompts.md)

## Context

WebFlash 1.0, the production installer at the repository root, is a mature trust
system. Its value is an auditable install gate: provenance validation, the
seven-tier release-channel acknowledgement model, SHA-256 verification of the
downloaded bytes, the manifest-freshness and service-worker-update matrix, the
redacted diagnostics bundle, and the desktop Chromium capability gate. None of
that should be rebuilt.

PR #477 merged a standalone WebFlash 2.0 design preview at `/webflash-2/`, ported
from the Claude Design handoff into vanilla ES modules. It is a presentation
layer only. Its readiness checklist, flash progress, Wi-Fi scan, and kit picker
are all simulated, and it does not drive Web Serial, ESP Web Tools, the live
manifest, signing, or preflight.

We need to ship the 2.0 redesign as the production installer without regressing
the trust model, the release-channel gating, the provenance gate, the freshness
and cache gating, or accessibility.

## Decision

Adopt approach A: the 2.0 deliverable is a view over the 1.0 engine, shipped
behind a `?ui=2` flag at the same origin, then cut over.

- The 1.0 codebase is the logic and trust layer (the engine). `scripts/state.js`,
  `scripts/utils/*`, `scripts/services/*`, the manifest pipeline, ESP Web Tools,
  `sw.js`, the CSP, and `scripts/data/kits.json` stay unchanged.
- The 2.0 components, already vanilla ESM after #477, become the render layer.
- The view ships behind `?ui=2` at the same origin, so it inherits the CSP, the
  service worker, the manifest, and the headers. It is never a separate site.
- The default stays `ui=1` until parity holds. PR 12 flips the default and keeps
  `?ui=1` as a one-release rollback; PR 13 removes the old view.
- Each simulation is deleted in the same PR that binds its real engine module.
  No dead simulated code paths survive behind the flag.

## View and engine boundary contract

This is the load-bearing rule of the migration.

1. The engine owns every gating decision. Provenance, channel acknowledgement,
   SHA-256 verification, manifest freshness, service-worker update,
   installability per the release gates, and the desktop only capability check
   are all decided by the engine. The view may not re-implement, relax, or
   short-circuit any of them.
2. The view renders engine state and calls engine actions. It reads the
   machine-readable check results by stable check id, not by parsing summary or
   detail strings, and it invokes engine functions such as `setState`, the
   compatible-firmware lookup, `validateFirmwareProvenance`, the acknowledgement
   APIs, the flasher, and the diagnostics builder.
3. The view never owns a gate. If a check is blocking in 1.0, it is blocking in
   2.0. A binding PR that cannot yet enforce a blocking gate is not mergeable,
   even behind the flag, because the beta dogfood (PR 11) and the GA cutover
   (PR 12) inherit whatever shipped.

Corollary on trust claims: the migration makes no new trust claim. Cryptographic
signature verification stays unimplemented and unclaimed, the
`signature_verified` check stays skip, and no 2.0 surface may imply otherwise.
Implementing real verification is a separate, explicit project (strategy
Section 8).

## Consequences

Positive:

- `main` stays releasable after every merge. Production stays on 1.0 until the
  default cutover at PR 12. Before GA every revert is a plain commit revert with
  no production impact, and rolling back the site default after GA is a git
  revert of the cutover commit plus the GitHub Pages rebuild it triggers, not a
  flag flip, because GitHub Pages serves a static default with no remotely
  mutable flag.
- The audit surface is not duplicated. There is one trust model, reviewed once.
- Per-PR review (the Codex bot) stays the safety mechanism, and the binding chain
  lands as small, sequential, reviewable units.

Costs:

- The engine must expose view-agnostic, named exports (PR 2). Where 1.0 render
  and logic are entangled, the logic is extracted behind exports and a `views/`
  boundary, with no 1.0 behaviour change.
- Two render layers coexist behind the flag from PR 3 to PR 12. This is
  deliberate and time-boxed.

## Alternatives considered

- Approach B, build a parallel backend for `/webflash-2/`. Rejected. It
  duplicates the trust model, doubles the audit surface, and reintroduces exactly
  the failures the 1.0 gate prevents. The value of this repo is the gate, and
  forking it is the wrong move.
- One large PR. Rejected as the delivery method. It would touch the whole trust
  model at once and get shallow review, coupling unrelated subsystems so a bug in
  one binding blocks another.
- A long-lived `webflash-2-integration` branch merged once at the end. Rejected
  as the primary method. It buys isolation that the `?ui=2` flag already provides
  for free, drifts from `main`, and turns the cutover into one giant merge. Kept
  only as a fallback if `main` churns heavily during the binding chain.
- Rewrite the 1.0 view in place. Rejected. There is no safe intermediate state
  and no flag to roll back to.

The delivery method (many small trunk-based PRs, each gated behind `?ui=2`, with
the default held at `ui=1` until PR 12) is recorded in full in the
[delivery plan](../webflash-2-migration-delivery.md).

## References

- Strategy: [`docs/webflash-2-migration.md`](../webflash-2-migration.md), in
  particular Section 2 (decision), Section 3 (simulation-to-real mapping), and
  Section 7 (GA acceptance gates).
- Delivery plan: [`docs/webflash-2-migration-delivery.md`](../webflash-2-migration-delivery.md).
- Per-PR runbook: [`docs/webflash-2-migration-prompts.md`](../webflash-2-migration-prompts.md).
- Origin preview: PR #477 (`/webflash-2/`).
