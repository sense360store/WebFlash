# Canonical SOT import (SENSE360-CANONICALISATION-001 PR 13)

**Canonical id:** `SENSE360-CANONICALISATION-001` PR 13
**Type:** Migration plan of record, committed before implementation. Charter
scope: *regenerate the commercial mirror from SOT; remove independent
commercial identity and availability declarations; enforce source SHA and
schema drift gates.* Repository: `sense360store/WebFlash`. Merge order:
after esphome-public PR 12 (#861), per programme dependency order.

## Starting truth

`scripts/data/sot-commercial-mirror.json` is the synchronized SOT
commercial-surface snapshot (WEBFLASH-TAXONOMY-RECONCILE-001), regenerated
only by `scripts/refresh-sot-mirror.py` from a local SOT checkout. It is
evidence, never commercial authority. As committed it was generated from
SOT `8df6ad69` (2026-07-15); SOT `main` has since advanced (OD-SOT-009 is
recorded as decided 2026-07-25 and two mirrored `shop_status` prose fields
changed), so the snapshot is stale. Every bundle remains planned, paused,
concept or internal; nothing is available or buyable, and this PR changes
none of that.

Two commercial identity chains exist today where the charter allows one:
preset display names in `scripts/data/kits.json` are pinned both to the
SOT mirror (the taxonomy guard joins each preset to its SOT record by id,
name, config, contents and rooms) and independently to
`__tests__/fixtures/room-bundle-skus.json`, a vendored copy of an
esphome-public naming file. Commercial bundle names are owned by SOT
alone; the second chain is an independent commercial identity declaration.

The refresh script derives buyability from SOT's single lifecycle rule
(`COMMERCIAL_STATUSES = {"available"}`) and fails loudly on an explicit
contradiction, but it accepts any unknown `status` string silently, and no
CI-runnable gate validates the checked-in mirror's schema or provenance
shape offline (the `--check` mode needs a SOT checkout CI does not have).

## Contracts that survive unchanged

1. **The mirror stays evidence, never authority.** SOT owns commercial
   names, status, visibility and buyability; the mirror is regenerated,
   never hand-authored, and carries full provenance.
2. **Commercial posture is unchanged.** All bundles stay non-available,
   non-buyable, internal; the posture flags stay all-false; no customer
   copy gains commerce language. A future SOT flip changes the mirror by
   regeneration, never by WebFlash editing.
3. **Customer-facing copy is out of scope.** Room preset naming and
   selection changes belong to PR 14; this PR touches data, generator and
   guards only, and the rendered wizard surface is unchanged.
4. **Install gates are untouched.** Commercial status is not an install
   gate; nothing here strengthens or weakens provenance, channel,
   signature or preflight gating.

## Slices

1. **Mirror regeneration.** Run `scripts/refresh-sot-mirror.py` against a
   clean SOT checkout at merged `main` (`ee2d1c5`), commit the diff with
   the source SHA it was generated from. Verify the regenerated posture
   flags remain all-false and every lifecycle field is unchanged (the
   expected diff is provenance plus the two `shop_status` prose fields).
2. **Single commercial identity chain.** Retire the independent
   display-name authority: the `room-bundle-skus.json` vendored fixture
   stops being a naming authority for preset display names, and the
   display-name pin moves to the SOT mirror record joined by
   `commercial_bundle_id` (the join the taxonomy guard already enforces).
   Sweep for any other independent commercial identity or availability
   declaration in `scripts/` and `__tests__/`; every finding is either
   re-derived from the mirror or removed with its reason recorded here.
3. **Source SHA and schema drift gates.**
   - Generation-time schema gate: the refresh script learns SOT's full
     bundle status vocabulary (`BUNDLE_STATUSES` in SOT
     `scripts/validate.py`) and fails loudly on an unknown status instead
     of silently deriving non-buyable from a typo or a schema change.
   - Offline mirror gates, CI-runnable without a SOT checkout: schema
     version pinned; provenance shape enforced (source repo, a full
     40-hex source SHA, commit date, source files, generator); per-row
     required fields present; `buyable` and `commercially_available`
     re-derived from `status` and `renderable` from `visibility` for
     every row; posture flags re-derived from the rows. Enforced in both
     the Python unit tests and the Jest taxonomy guard so either suite
     catches drift.
   - The `--check` mode stays the checkout-comparing gate for refresh
     time.
4. Docs, execution notes here, full verify pass (`npm test`,
   `gen-manifests --strict-validate --dry-run`), PR.

## Honesty limits

Nothing here changes commercial state, firmware, `manifest.json`,
`firmware/sources.json`, `REQUIRED_CONFIGS`, kits' wizard mappings, release
channels or install gates. No bundle becomes available, buyable, visible or
renderable; the mirror's posture flags remain all-false after
regeneration. The mirror remains synchronized evidence with provenance,
never commercial authority. Release-One (`Ceiling-POE-VentIQ-RoomIQ`)
remains the production stable customer baseline.
