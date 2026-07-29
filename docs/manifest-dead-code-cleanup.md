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

1. **Audit inventory.** Executed 2026-07-29; the full inventory with
   dispositions under the evidence test:

   | Surface | Items | Disposition | Basis |
   |---|---|---|---|
   | Presets | S360-KIT-BATH-P, S360-KIT-BEDROOM-P | KEEP | Live, served, guard-joined to SOT and the manifest. |
   | Active sources | 4 rows | KEEP | Each backs a served manifest build; coherence guarded by manifest-health. |
   | Delisted sources | 5 rows | KEEP (immutable history) | The WF-H1-REIMPORT-CLEAN-001 register; never rewritten; new pins added (slice 3). |
   | Manifest entries | 5 builds | KEEP | All backed by on-disk binaries plus sidecars; served surface unchanged. |
   | Imported artifacts | 4 `.bin` + sidecars, Rescue | KEEP | Published binaries are immutable; never deleted or overwritten. |
   | Fixtures | esphome-product-catalog.json, expected-surface.json | KEEP | Both consumed by live guards. |
   | gen-manifests legacy `model`/`variant` parse path | fallback branch, `describe_legacy`, legacy sort | **REMOVE** | Zero legacy binaries on disk (all five live under the canonical paths); the importer writes only canonical names; the naming-policy validator enforces the shape; manifest holds zero legacy builds (no build carries `model`). Replaced by a hard, descriptive error so a stray binary fails the build instead of minting a Model/Variant product. |
   | `FirmwareMetadata` legacy fields (`model`, `variant`, `sensor_addon`) | dataclass fields, always None | KEEP (schema stability) | Field removal would churn the dataclass and constructors for zero served change; always None by construction now the parser raises. |
   | state.js legacy `build.model`/`variant` handling | defensive read paths | KEEP (with reason) | The engine file owns the install gates; the branches read live manifest fields defensively and process empty sets (zero legacy builds, structurally starved by the generator error). Removing them would refactor gate-owning code for no served benefit. |
   | url-config legacy alias groups | incl. the `wall` → `ceiling` pair | KEEP (published contract) | Old customer links must keep resolving; the Wall entry is an alias mapping, not a product branch; doubt means keep. |
   | `sample` kit-field machinery | kits.json fields, kit-config parse, app.js copy | **REMOVE** | Parsed and copied but read nowhere (no renderer, no filter, no test); sample kits were removed long ago; dead data plumbing end to end. |
   | firmware-nearest | module + test | KEEP | Live: consumed by state.js, pinned by its own suite. |

2. **Execute removals.** Executed 2026-07-29, exactly the two REMOVE
   rows: the gen-manifests legacy parse path is now a hard `ValueError`
   (with `describe_legacy` deleted and `sort_artifacts` simplified to
   the configuration-only ordering — verified byte-identical: the strict
   dry-run regenerates the committed manifest with zero diff), and the
   `sample` plumbing is deleted at all three sites. The error path is
   unit-verified (a Model/Variant-shaped filename now raises).
3. **History posture.** Executed 2026-07-29. Verified no delisted config
   is served without a fresh active source entry (the re-imported AirIQ
   config has one; nothing else overlaps), and added the previously
   missing pins to `__tests__/manifest-health.test.js`: every delisted
   row keeps its provenance fields, and a delisted config may appear in
   the manifest only alongside an active source entry (the deliberate
   re-import path).
4. Docs, execution notes here, full verify pass, PR. **Executed
   2026-07-29**; verify output recorded in the PR body.

## Honesty limits

Nothing here changes the served firmware surface, commercial state,
channels, install gates or provenance. Removals are dead-code removals
proven by the evidence test, never behaviour changes; kept legacy layers
are kept deliberately with reasons. Release-One
(`Ceiling-POE-VentIQ-RoomIQ`) remains the production stable customer
baseline.
