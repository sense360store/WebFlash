# DOCS-CONSOLIDATION-VERIFY-001 — WebFlash docs verification (downstream record)

**Identifier:** `DOCS-CONSOLIDATION-VERIFY-001`

This is the WebFlash-side verification record for the cross-repo docs
consolidation. It confirms the canonical WebFlash status doc
([`docs/sense360-webflash-status.md`](sense360-webflash-status.md),
`WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001`) still matches the live repository
state and that `FEATURES.md` redirects to it.

> **Docs-only.** This record imports no firmware, regenerates no manifests,
> edits no `firmware/sources.json` entry, changes no `REQUIRED_CONFIGS` value,
> adds no kit, and changes no runtime UI surface. It is additive documentation.

## Verification results

| # | Check | Result |
|---|---|---|
| 1 | `README.md` references the canonical status doc | **PASS** — `README.md` points to `docs/sense360-webflash-status.md` |
| 2 | `FEATURES.md` redirects to the canonical status doc | **PASS** — `FEATURES.md` is a redirect stub citing `WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001` |
| 3 | `docs/sense360-webflash-status.md` internal links resolve | **PASS** — every relative link resolves to an existing file |
| 4 | `manifest.json` matches the doc's "supported products" table | **PASS** — 3 builds: `Ceiling-POE-VentIQ-RoomIQ` (stable), `Ceiling-POE-VentIQ-RoomIQ-LED` (preview), `Rescue` |
| 5 | `REQUIRED_CONFIGS` matches the doc | **PASS** — `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` (production-only) in `.github/workflows/firmware-publish.yml`; LED preview deliberately excluded |
| 6 | No FanPWM install card / release-selectable claim | **PASS** — S360-311 PWM stays `no-firmware`, hidden, no manifest build |
| 7 | No LED-stable claim | **PASS** — S360-300 stays `available-preview`; LED stable blocked behind upstream `RELEASE-007` + `S360-300-BENCH-001` |
| 8 | S360-410 PoE blocker still visible | **PASS** — PoE covered transitively only; broader PoE bundles remain blocked |
| 9 | FanTRIAC stays blocked from Release-One | **PASS** — `block_tokens: ["FanTRIAC", "LED"]` on the Release-One source stands |

## Upstream source of record

Product lifecycle status is owned upstream by
`docs/sense360-roadmap-status.md` in `sense360store/esphome-public`
(`DOCS-CONSOLIDATION-ROADMAP-001`), verified there under the same
`DOCS-CONSOLIDATION-VERIFY-001` pass. WebFlash mirrors only the slice it can
ship a signed `.bin` for; when the two disagree, upstream wins for lifecycle and
the WebFlash manifest wins for what flashes today.

## Hard guardrails honoured

No firmware imported · no manifest / `firmware/sources.json` change · no
`REQUIRED_CONFIGS` change · no kit added · no product promoted · no runtime UI
change. This record is additive documentation only.

## Conclusion

The canonical WebFlash status doc matches the live `manifest.json` /
`REQUIRED_CONFIGS` state, `FEATURES.md` redirects cleanly, all links resolve,
and only supported / release-selectable products are exposed.
**DOCS-CONSOLIDATION-VERIFY-001: verified (WebFlash side).**
