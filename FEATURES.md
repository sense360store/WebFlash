# WebFlash Features — moved

> **This document has been consolidated.** As of
> `WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001`, the WebFlash feature / roadmap /
> product-availability narrative is tracked in one canonical place instead of
> being duplicated and drifting here.

The previous contents of `FEATURES.md` had gone stale (for example, it listed
Sense360 AirIQ as a supported module and as the recommended bundle, which is no
longer true — AirIQ ships no WebFlash firmware, and the recommended state is
RoomIQ + VentIQ over PoE). Rather than maintain a second, diverging status
list, that content has been removed in favour of the canonical sources below.

## Where things live now

- **What WebFlash can install, what is preview-only, and what is blocked:**
  [`docs/sense360-webflash-status.md`](docs/sense360-webflash-status.md) — the
  canonical WebFlash Sense360 product & release status doc.
- **Upstream Sense360 product roadmap / lifecycle status (source of record):**
  `docs/sense360-roadmap-status.md` in
  [`sense360store/esphome-public`](https://github.com/sense360store/esphome-public/blob/main/docs/sense360-roadmap-status.md).
- **Live WebFlash PR queue (completed / active / blocked):**
  [`UPCOMING_PR.md`](UPCOMING_PR.md).
- **Wizard UX audit and PR sequence (WF-UX-\*):**
  [`docs/wizard-ux-roadmap.md`](docs/wizard-ux-roadmap.md).
- **Per-family firmware import readiness + reserved follow-up PR slots:**
  [`docs/webflash-import-readiness-matrix.md`](docs/webflash-import-readiness-matrix.md).
- **Catalog → WebFlash eligibility rules:** enforced by
  [`scripts/validate-product-import-readiness.js`](scripts/validate-product-import-readiness.js)
  and `__tests__/product-import-readiness.test.js`; the contract doc
  (`docs/product-import-readiness.md`) is archived — see
  [`docs/archive-index.md`](docs/archive-index.md).
