# Manifest and dead-code cleanup (SENSE360-CANONICALISATION-001 PR 15)

**Canonical id:** `SENSE360-CANONICALISATION-001` PR 15
**Type:** Migration plan of record, committed before implementation. Charter
scope: *audit every preset, source, manifest entry and imported artifact;
remove stale fixtures, sample kits, unreachable branches and obsolete
translation code; preserve immutable historical binaries without presenting
them as active products.* Repository: `sense360store/WebFlash`, stacked on
PR 14; merge order after it.

## Starting truth (survey of 2026-07-29)

- `manifest.json` declares five builds (two stable, two preview, Rescue);
  four imported `.bin` files sit under `firmware/configurations/` with
  their `.meta.json` sidecars, plus the in-tree Rescue build. The
  manifest-health guard already pins manifest ↔ disk ↔ per-build-manifest
  coherence and the blocked-token rules.
- `firmware/sources.json` carries four active source entries and a
  five-entry `delisted_sources` register (the pre-credential-gate builds
  removed under WF-H1-REIMPORT-CLEAN-001) — the register is immutable
  history, not an active surface.
- Two test fixtures remain (`esphome-product-catalog.json`,
  `expected-surface.json`); both are live, consumed by guards. The former
  `room-bundle-skus.json` fixture was retired by PR 13.
- There is no i18n / natural-language translation code; the word
  "translation" in the tree is one mapping comment. The charter's
  "obsolete translation code" therefore means the legacy token /
  identity translation layers: the deprecated `model` / `variant` code
  path in `scripts/gen-manifests.py` (documented deprecated; possibly
  unreachable now that every binary lives under
  `firmware/configurations/`), the legacy URL alias set in
  `scripts/utils/url-config.js` (a published-link compatibility
  contract — old links must keep resolving), the lingering "Wall" branch
  in those aliases (never a supported product), and the `sample` kit
  field machinery (both presets carry `sample: false`; sample kits were
  removed long ago).

## Evidence test for every removal

A thing is removed only when ALL hold: it has zero live consumers in the
tree; it is not a published compatibility contract (an old customer link,
a tag-pinned path, a served file); and it is not immutable history (a
delisted-register row, a historical record, a published binary). Anything
kept gets its reason recorded in the audit. Two absolutes: **no published
`.bin` is ever deleted or overwritten**, and the `delisted_sources`
register is never rewritten.

## Contracts that survive unchanged

1. The served surface is unchanged: no manifest entry, source entry,
   channel, preset or binary is added, removed or re-channelled.
2. Old customer links keep resolving: the URL alias compatibility layer
   stays for every alias that a published link could carry; only aliases
   provably never published (the audit must show this from the alias
   history) are candidates, and doubt means keep.
3. The manifest-health, taxonomy, identity-chain and drift gates from
   PRs 13 and 14 are not weakened.
4. Immutable history stays and stays labelled as history: the delisted
   register and any historical binaries are preserved without being
   presented as active products.

## Slices

1. **Audit inventory.** A table in this doc covering every preset (2),
   source entry (4 active + 5 delisted), manifest entry (5), imported
   artifact (4 + Rescue), fixture (2), and each legacy code branch
   (gen-manifests `model`/`variant` path, url-config alias groups
   including the Wall branch, the `sample` field machinery,
   `firmware-nearest` and any other candidate the sweep surfaces), each
   with a disposition and its basis under the evidence test.
2. **Execute removals.** Only inventory rows whose disposition is
   remove-with-evidence; each removal deletes the dead code and its
   dead-only guards in the same commit, and the audit row records what
   proved unreachability (for the gen-manifests legacy path: no binary
   outside `firmware/configurations/` exists and the strict validator
   forbids new ones).
3. **History posture.** Verify nothing presents a delisted or historical
   artifact as an active product (manifest excludes them; guards agree),
   and add a pin only where a class is unguarded.
4. Docs, execution notes here, full verify pass, PR.

## Honesty limits

Nothing here changes the served firmware surface, commercial state,
channels, install gates or provenance. Removals are dead-code removals
proven by the evidence test, never behaviour changes; kept legacy layers
are kept deliberately with reasons. Release-One
(`Ceiling-POE-VentIQ-RoomIQ`) remains the production stable customer
baseline.
