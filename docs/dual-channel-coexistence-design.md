# Per-config dual-channel coexistence — design

Status: proposal, review-first. No code, schema, or test changes accompany this document.

## Problem statement

A single firmware config (identified by its `config_string`, for example
`Ceiling-POE-RoomIQ`) needs to be publishable as **stable at version X** and
**preview at version Y** at the same time, with Y ahead of X, and both offered to
the user in the installer. The user picks stable for production or opts into the
newer preview behind the existing acknowledgement gate.

The two repositories involved are:

- `sense360store/WebFlash` (this repo, the consumer) — owns `manifest.json`, the
  manifest-to-catalog alignment tests, `firmware/sources.json`, `scripts/data/kits.json`,
  and the installer surface.
- `sense360store/esphome-public` (the producer) — owns `config/product-catalog.json`
  and `config/webflash-builds.json`. The upstream schema change is described
  abstractly here so it can be applied in that repo separately.

### The key finding: the runtime already coexists; the catalog contract does not

The investigation found that **the runtime publishing and installer layers already
support two builds for one config**, and the live tree is already exercising it.
The single-version-per-config assumption survives in exactly one place: the
**product-catalog contract and the alignment tests that enforce it**. That place
is currently failing red on `main`.

Concretely, the live `manifest.json` already holds 15 builds and already ships the
same `config_string` twice:

```
Ceiling-POE-RoomIQ                            1.0.5      stable
Ceiling-POE-RoomIQ                            1.0.0      preview
```

(Both are real entries in `manifest.json`; both have backing source entries in
`firmware/sources.json` — a `stable` `1.0.5` entry and a `preview` `1.0.0` entry
for the same `config_string`.)

The vendored catalog fixture, however, carries only **one** row for that config
(`status: production`, `channel: stable`, `version: 1.0.5`), and the strict
version check blesses only that version. Running the alignment suite today
produces:

```
● manifest.json ↔ product catalog › manifest build version matches catalog version where defined
  manifest.json build "Ceiling-POE-RoomIQ" has version "1.0.0" but upstream
  catalog declares version "1.0.5". Regenerate after the next import.
    __tests__/product-catalog-alignment.test.js:384
```

Five tests fail in `__tests__/product-catalog-alignment.test.js` for the same
underlying reason (a second build sharing a `config_string`, at a version the
single catalog row does not name). This document treats that red state as the
live proof of the gap and the acceptance target: the design is "done" when stable
and preview coexist as first-class **without weakening the strict per-build
version check**.

---

## 1. Inventory — every place that assumes one version or one channel per config

The assumption is **not** uniform. The layers split cleanly into those that
already key by `(config_string, channel)` and tolerate two versions, and those
that collapse a config to a single scalar version/channel. The design only needs
to change the second group.

### 1a. Already multi-channel-aware (no change of model required)

| Surface | File:line | Keying / behaviour |
|---|---|---|
| Source entry identity | `scripts/add-firmware-source.py:432-439` (`source_key`) and `:451-464` (`upsert_source`) | Keyed by `(source_repo, config_string, channel)`. Same `config_string` on two channels are distinct rows; `upsert` replaces by the triple, not by `config_string`. |
| Source file (live data) | `firmware/sources.json` | Already contains `Ceiling-POE-RoomIQ` twice: `stable`/`1.0.5` and `preview`/`1.0.0`. |
| Manifest build selection | `scripts/gen-manifests.py:1120-1170` (`select_latest_builds`), key built at `:1130` `("config", meta.config_string, meta.channel)` | Best-version bucketing is per `(config_string, channel)`. Newer-version replacement (`:1143`, `:1146`) only collapses within one channel, so a stable build and a preview build of one config both survive into the manifest. |
| Filename → version/channel parse | `scripts/gen-manifests.py:227-235` (`split_name_version_channel`); canonical pattern `scripts/validate-naming-policy.js:6` | Channel is a filename suffix (`-stable`/`-preview`/`-beta`), parsed independently of `config_string`. |
| Manifest build entry shape | `manifest.json` (generated) | Each build carries its own scalar `config_string` + `version` + `channel`. Two builds may share a `config_string`. |
| Installer manifest index | `scripts/state.js:1210`, `:1525`, `:1551-1554` (`manifestConfigStringLookup`) | `Map<config_string, build[]>` — an **array** of builds per config. Already designed to hold multiple builds (stable + preview) for one config. |
| Build grouping / sorting | `scripts/state.js:4709` (`groupBuildsByConfig`), `:1357` (`sortBuildsByChannelAndVersion`) | Groups by config, sorts candidates by channel priority then version. |
| Compatible-firmware resolution | `scripts/state.js:7302-7351` (`resolveCompatibleFirmware`); stable-wins at `:7340` | Returns **all** matching builds (`builds:` array) and defaults `build:` to the stable one when present, else the first candidate. `isPreview` and `channel` are returned per resolved build. This is exactly the dual-channel selection behaviour the design wants. |
| Channel gate policy | `scripts/utils/release-channels.js:82-91` (stable: `defaultSelectable:true`, `requiresAcknowledgement:false`), `:112-121` (preview: `defaultSelectable:false`, `requiresAcknowledgement:true`), `:423` (`filterBuildsForMode`), `:469-481` (`pickDefaultBuild`) | `pickDefaultBuild` returns the first `defaultSelectable` build, so stable auto-selects and preview never does; preview install is acknowledgement-gated. Channel-per-build, not channel-per-config. |
| Module availability derivation | `scripts/utils/module-availability.js:439-471` (`deriveManifestIndex`), consumed at `:408-416` | Builds separate `manifestStableConfigs` / `manifestPreviewConfigs` sets. A config present on both channels lands in **both** sets, so it can read `available-stable` while its preview lane stays known. |

The takeaway: from `firmware/sources.json` through `gen-manifests.py`,
`manifest.json`, and the entire installer/state/release-channel/module-availability
stack, dual-channel coexistence is already representable and already partly live.

### 1b. Assumes one version / one channel per config (the surfaces to change)

| Surface | File:line | The assumption |
|---|---|---|
| Catalog fixture schema | `__tests__/fixtures/esphome-product-catalog.json` | Each product row has scalar `status`, `channel`, `version`, `artifact_name`. There is no way to express "this config is stable at 1.0.5 **and** preview at 1.0.6". The LED row, for example, is a single `preview`/`1.0.3` entry. |
| Catalog index | `__tests__/product-catalog-alignment.test.js:125-128` (`buildCatalogIndex`), built at `:215` | `Map` keyed by `product.config_string`, last-write-wins. Collapses any config to one row, so a config can have at most one blessed `(version, channel)`. |
| **Strict version check** | `__tests__/product-catalog-alignment.test.js:369-391`; throw at `:384-389` | Iterates **every** manifest build, looks up the single catalog row by `config_string`, and requires `build.version === entry.version`. A second build at a different version is flagged as drift. **This is the failing check.** |
| Source asset-name check | `__tests__/product-catalog-alignment.test.js:278` area (version-tolerant) | Tolerant of version, but still resolves one catalog entry per `config_string`; a per-channel catalog will need it to resolve the right channel's `artifact_name`. |
| Import-eligibility gate | `__tests__/product-catalog-alignment.test.js:69-80` (`isWebflashImportEligible`), mirror in `scripts/validate-product-import-readiness.js:118` | Treats the catalog entry as atomic (eligible or not). Fine today; with two rows per config it must evaluate the right row. |
| Status→channel map | `scripts/validate-product-import-readiness.js:86-93` (`ELIGIBLE_STATUSES`, `REQUIRED_CONFIGS_CHANNEL='stable'`, `STATUS_CHANNEL_MAP={production:['stable'], preview:['preview','beta']}`) | One status → one channel set per entry; a config that is both production-stable and preview cannot be expressed in one row. |
| Build-count snapshot | `__tests__/product-catalog-alignment.test.js:1077` (`toBe(14)`); sorted `config_string` snapshot at `:685` (a `toEqual` list with **no duplicate** `config_string`) | Hardcodes the build count and a duplicate-free config list. A second build for one config breaks both (already failing at 15 with the duplicate `Ceiling-POE-RoomIQ`). |
| Pages-surface snapshot | `__tests__/github-pages-surface.test.js:84-86` (`toBe(14)`), `:107`/`:125`/`:136` (`expect(matches).toHaveLength(1)` after filtering by `config_string`), `:214` (`firmware-N.json` index ≤ 13) | Each config_string must filter to exactly one build, and the per-build manifest count is pinned. Both assume one build per config. |
| Kit channel field | `scripts/data/kits.json:7-8` (field docs), per-kit `firmware_channel` (e.g. `:40-41` BATH-P `stable`) | Each kit row names **one** `firmware_channel`. There is no way for one kit to say "available on both stable and preview". Today this is worked around by two kit rows pointing at related configs, and by `S360-KIT-BEDROOM-P → Ceiling-POE-RoomIQ` declaring `preview` even though that config now also ships stable. |
| `REQUIRED_CONFIGS` allowlist | `.github/workflows/firmware-publish.yml:226-232`; contract pinned at `__tests__/github-pages-surface.test.js:221` and `__tests__/manifest-required-configs.test.js` | Production-only allowlist of `config_string` values (`Ceiling-POE-VentIQ-RoomIQ`, `Rescue`). This stays production-only and does **not** change, but its validator must keep comparing against the **stable** catalog row, not whichever row wins last. |

### 1c. Upstream producer (described abstractly, applied separately)

- `config/product-catalog.json` — the lifecycle catalog WebFlash vendors as the
  fixture. Carries one `status`/`channel`/`version`/`artifact_name` per product.
- `config/webflash-builds.json` — the upstream build matrix. The downstream
  `webflash_build_matrix` flag and the `webflash_import_eligibility` object both
  originate here and are mirrored into the fixture.

Both share the same single-version-per-config shape and are the upstream half of
the change in section 2.

---

## 2. Target model — a config carries both a stable version and a preview version

The design principle: **the build remains the unit of truth; the catalog gains a
per-channel lane.** Nothing below changes how a build is identified
(`config_string` + `version` + `channel` stay scalar per build). The change is to
let the catalog describe two lanes for one config and to make alignment compare
each build to its own lane.

### 2a. Catalog schema (upstream `product-catalog.json`, mirrored into the fixture)

Two shapes were considered.

**Option A — two entries per config, keyed by `(config_string, channel)`.**
Keep the existing flat row shape; allow a config to appear twice, once per
channel:

```jsonc
{ "config_string": "Ceiling-POE-RoomIQ", "status": "production", "channel": "stable",  "version": "1.0.5", "artifact_name": "Sense360-Ceiling-POE-RoomIQ-v1.0.5-stable.bin" },
{ "config_string": "Ceiling-POE-RoomIQ", "status": "preview",    "channel": "preview", "version": "1.0.6", "artifact_name": "Sense360-Ceiling-POE-RoomIQ-v1.0.6-preview.bin" }
```

**Option B — one entry per config with a per-channel `channels` map:**

```jsonc
{
  "config_string": "Ceiling-POE-RoomIQ",
  "channels": {
    "stable":  { "status": "production", "version": "1.0.5", "artifact_name": "…-v1.0.5-stable.bin" },
    "preview": { "status": "preview",    "version": "1.0.6", "artifact_name": "…-v1.0.6-preview.bin" }
  }
}
```

**Recommendation: Option A.** It is the smaller change and aligns with how the
rest of the system already keys data. `firmware/sources.json`
(`add-firmware-source.py:432-439`) and `gen-manifests.py:1130` already key by
`(config_string, channel)`; the manifest already holds two rows for one config.
Option A makes the catalog match that grain, so the only code change is the index
and the lookups, not the row shape. Option B would force every existing
single-channel consumer (`buildCatalogIndex`, the source/kit/REQUIRED_CONFIGS
checks) to learn a nested shape at once. Option A degrades cleanly: a config with
one lane is just one row, exactly as today.

The single behavioural requirement Option A imposes: the catalog index must stop
being keyed by `config_string` alone (`product-catalog-alignment.test.js:125-128`)
and become keyed by `(config_string, channel)`, with a helper to fetch "the
stable row for this config" and "the preview row for this config".

### 2b. Manifest holding two builds for one config

No schema change. The manifest already holds two builds with the same
`config_string` and different `channel`/`version`, because `select_latest_builds`
buckets per `(config_string, channel)` (`gen-manifests.py:1130`). The only
consumer-side cleanup is that snapshot assertions which assumed one build per
config (section 1b) must move from "list of unique config strings" to "list of
`(config_string, channel)` pairs". The per-build `firmware-N.json` files are
already index-addressed and already 1:1 with builds, so two builds simply means
two per-build manifests — no schema change, only a count.

---

## 3. Per-channel alignment — keep both versions strict

The fix to `__tests__/product-catalog-alignment.test.js:369-391` is to compare a
build against the **catalog row for that build's channel**, not against whichever
row last won the `config_string` key.

Today (single-keyed, the failing logic at `:380-389`):

```js
const entry = catalogIndex.get(build.config_string);          // collapses channel
if (entry && build.version !== entry.version) { throw … }     // one blessed version
```

Target (per-channel, still strict — both lanes compared exactly):

```js
const entry = catalogIndex.get(`${build.config_string}::${build.channel}`); // per-lane
if (entry && build.version !== entry.version) { throw … }                   // same strict ===
```

The strictness is preserved exactly: the stable build must equal the stable
catalog version, the preview build must equal the preview catalog version, and a
mismatch on **either** lane is still a hard failure. The change is purely in which
catalog row a build is measured against. The `Ceiling-POE-RoomIQ` example then
passes because the preview `1.0.0` build measures against a preview catalog row at
`1.0.0`, and the stable `1.0.5` build measures against a stable catalog row at
`1.0.5` — instead of both being measured against the single `1.0.5` row.

Companion changes that ride along with the re-key:

- `buildCatalogIndex` (`:125-128`) keys by `(config_string, channel)` and exposes
  `getStableRow(config)` / `getPreviewRow(config)` helpers so the existing
  single-row callers (`:244`, `:278`, `:312`, `:456`, `:487`, `:579`, …) ask for
  the lane they mean rather than "the row".
- `isWebflashImportEligible` (`:69-80`) evaluates the specific lane's row.
- `REQUIRED_CONFIGS` validation (`github-pages-surface.test.js:221`,
  `manifest-required-configs.test.js`) explicitly asks for the **stable** row
  (`REQUIRED_CONFIGS_CHANNEL='stable'`, `validate-product-import-readiness.js:89`)
  so production-only stays production-only regardless of any preview lane.
- The build-count and config-list snapshots
  (`product-catalog-alignment.test.js:685`, `:1077`;
  `github-pages-surface.test.js:84-86`, `:107`/`:125`/`:136`, `:214`) move to
  `(config_string, channel)` pairs and to the new count. (These are test edits
  outside the scope of this document; they are listed so the phasing in section 7
  can sequence them.)

No gate is weakened. The version equality stays `===` on both lanes; the
production-only `REQUIRED_CONFIGS` rule is untouched; the FanTRIAC block, preview
acknowledgement, provenance, freshness, and signature gates are all unaffected.

---

## 4. Installer and kit surface

### 4a. The installer already lets the user choose a channel per config

This needs no new build. The resolution path already returns every build for a
config and defaults to stable:

- `manifestConfigStringLookup` is `Map<config_string, build[]>`
  (`state.js:1551-1554`), so a config with two builds yields both.
- `resolveCompatibleFirmware` (`state.js:7302-7351`) returns `builds:` (all
  candidates for the config) and `build:` (the resolved default). The default is
  `matching.find(isStableChannel) || matching[0]` (`:7340`): stable wins when
  present; a preview-only config resolves to its preview build.
- `pickDefaultBuild` (`release-channels.js:469-481`) selects the first
  `defaultSelectable` build, which is stable (`:90`); preview is never
  auto-selected (`:120`) and install is acknowledgement-gated (`:118`).

So for a config that ships both lanes, the user is shown the stable build as the
recommended default and the preview build as a selectable alternative carrying the
`channel:preview` acknowledgement. **What the user sees:** a stable option flashed
by default, plus a preview option labelled with the preview badge/warning tone
that requires checking the experimental-build acknowledgement before install — the
existing WF-LED-003 exposure model, now applied to a config that also has a stable
lane rather than only to preview-only configs.

The one honest gap is presentation: today this dual presentation is incidental
(it falls out of two builds existing), not an explicit "Stable / Preview" toggle
on the config. Whether to add an explicit per-config channel switch in the review
step is a UX decision deferred to a follow-up; the engine already supports it.

### 4b. How a kit expresses availability on both channels

`scripts/data/kits.json` carries one `firmware_channel` per kit row
(`:7-8`, `:40-41`). It cannot say "this kit is available on stable and preview".
Two viable expressions:

1. **Two kit rows** (smallest, no schema change). One kit row per channel (a
   stable kit and a preview kit pointing at the same `config_string`). This is how
   the catalogue partially behaves already — `S360-KIT-BATH-P` is the stable
   Bathroom kit while preview room bundles are separate rows. The downside is row
   duplication and a SKU per lane.

2. **A `firmware_channels` array** on the kit row, replacing the scalar
   `firmware_channel`. The kit resolver (`kit-config.js`, validated against
   `manifest.json`) would then resolve the user's chosen channel against the
   config's available builds, defaulting to stable via the same
   `pickDefaultBuild` rule. This keeps one kit row per product and lets the review
   step show the stable/preview choice inline.

**Recommendation:** start with two rows (phase-friendly, zero schema risk) and
only introduce `firmware_channels` if/when an explicit per-kit channel toggle is
prioritised. Either way the install gate is unchanged: kit metadata never bypasses
the channel acknowledgement (`kits.json:8`), so a preview kit still gates on
`channel:preview`.

Note a latent inconsistency to resolve during phasing: `S360-KIT-BEDROOM-P`
already declares `firmware_channel: preview` for `Ceiling-POE-RoomIQ`, but that
config now also ships stable `1.0.5` and `resolveCompatibleFirmware` will default
that kit to the **stable** build. The kit's declared channel and the resolver's
default diverge. The per-channel model makes this explicit instead of accidental.

---

## 5. Promotion flow

Promotion and new-preview-cut are both expressed as catalog-lane edits plus a
normal import; neither removes the other lane.

**Promote a config to stable at the preview's version (or a new stable version):**

1. Upstream sets/updates the config's **stable** lane in `product-catalog.json`
   (Option A: the `stable` row) to the promoted version, leaving the `preview`
   lane in place (or clearing it if preview is now equal to stable — a deliberate
   choice, not a side effect).
2. WebFlash adds/updates the **stable** `firmware/sources.json` entry for that
   `(config_string, stable)` (`add-firmware-source.py` upserts by the triple, so
   the preview entry is untouched), imports the `.bin`
   (`import-firmware-sources.py`, with `expected_sha256` and `block_tokens`
   enforced), and regenerates the manifest.
3. `select_latest_builds` (`gen-manifests.py:1130-1146`) replaces only the stable
   build for that config; the preview build for the same config survives because
   it lives under a different `(config_string, channel)` key.
4. Per-channel alignment (section 3) compares the new stable build to the stable
   catalog row and the unchanged preview build to the preview catalog row. Both
   strict, both pass.
5. If the config is production, it may now also enter `REQUIRED_CONFIGS` — but
   that is the orthogonal production decision, still gated on `status:production` +
   `channel:stable`.

**Cut a new preview ahead of current stable:** the mirror image — upstream sets
the `preview` lane to a version greater than the stable lane; WebFlash imports the
preview `(config_string, preview)` source entry and regenerates. The stable lane
and stable build are untouched. The strict preview-lane comparison ensures the
manifest's preview build version equals the catalog's preview version.

The pointer being "set" in both directions is just the per-channel catalog row;
because the catalog is keyed per lane, moving one lane never disturbs the other.

---

## 6. Migration and back-compat

The design degrades to today's behaviour whenever a config has only one lane.

- **Single-channel configs (the common case).** A config with only a stable lane
  is one catalog row, one source entry, one manifest build — byte-identical to
  today. The per-channel index simply finds one row under the `(config, stable)`
  key and no row under `(config, preview)`. `resolveCompatibleFirmware` returns a
  single candidate and stable-wins is a no-op.
- **Catalog index default.** `buildCatalogIndex` re-keyed to `(config, channel)`
  must provide a back-compat accessor for the many callers that still pass a bare
  `config_string` (`:244`, `:258`, `:278`, `:312`, `:456`, `:487`, `:579`, …).
  The accessor's default lane is **stable**, so existing single-row lookups keep
  resolving the stable row exactly as `catalogIndex.get(config_string)` does now.
- **Sources / importer / generator.** No migration: they already key by
  `(config_string, channel)`. Existing single-channel entries are unaffected.
- **Kits.** Keeping the scalar `firmware_channel` valid (interpreted as a
  single-lane kit) means no kit migration is forced; `firmware_channels` (if
  adopted) is additive with a stable default.
- **`REQUIRED_CONFIGS`.** Unchanged. It enumerates stable production configs and
  the validator asks for the stable lane, so adding a preview lane to a config
  never pulls it into the allowlist.
- **Upstream fixture refresh.** The vendored fixture must be refreshed to the
  per-lane shape in lockstep with the upstream `product-catalog.json` change; the
  manifest is already ahead of it (the current red state), so the first WebFlash
  slice that adopts per-lane alignment also turns the suite green.

Nothing regresses: every config that has one channel today behaves exactly as
today, and the only configs that gain behaviour are those an importer deliberately
gives a second lane.

---

## 7. Phasing — smallest first, each independently shippable

Each slice is reviewable and leaves the tree green.

1. **Upstream (separate repo): add the per-channel lane to `product-catalog.json`
   and `config/webflash-builds.json`** using Option A
   (`(config_string, channel)` rows). Ship behind the existing producer review.
   No WebFlash change yet. Deliverable: upstream catalog can describe two lanes.

2. **WebFlash fixture + catalog index re-key.** Refresh
   `__tests__/fixtures/esphome-product-catalog.json` to the per-lane rows and
   re-key `buildCatalogIndex` (`product-catalog-alignment.test.js:125-128`) to
   `(config_string, channel)` with a stable-default accessor. No alignment logic
   change yet; existing single-row callers keep resolving stable. Deliverable:
   the index can address lanes; nothing else moves.

3. **Per-channel strict version check.** Change the strict check
   (`product-catalog-alignment.test.js:384-389`) to compare each build to its own
   lane's catalog row. This is the slice that turns the current red suite green
   for `Ceiling-POE-RoomIQ`. Deliverable: dual-version configs pass strict
   alignment; both lanes stay strict.

4. **Snapshot/count migration.** Move the duplicate-free `config_string`
   snapshots and hardcoded counts
   (`product-catalog-alignment.test.js:685`, `:1077`;
   `github-pages-surface.test.js:84-86`, `:107`/`:125`/`:136`, `:214`) to
   `(config_string, channel)` pairs and the real count. Deliverable: snapshots
   describe lanes, not configs.

5. **Validator lane-awareness.** Update `validate-product-import-readiness.js`
   (`:86-93`, `:118`) and the source/kit eligibility checks to evaluate the lane a
   surface refers to, keeping `REQUIRED_CONFIGS` stable-only. Deliverable: the
   advisory validator and the cross-surface checks understand lanes.

6. **Kit channel expression (optional).** Either add the second kit rows or
   introduce `firmware_channels` with a stable default
   (`kits.json`, `kit-config.js`). Resolve the `S360-KIT-BEDROOM-P` declared-vs-
   resolved channel divergence noted in section 4b. Deliverable: a kit can be
   offered on both lanes.

7. **Explicit per-config channel UI (optional, deferred).** If product wants an
   explicit "Stable / Preview" control on the review step rather than the
   incidental dual presentation, build it over the already-returned `builds:`
   array from `resolveCompatibleFirmware`. Deliverable: an explicit channel toggle;
   no engine change.

Slices 1–5 are the core (they make stable+preview coexist and turn the suite
green). Slices 6–7 are surface polish and can be deferred without blocking
coexistence.

---

## 8. Risks and open questions

- **Fixture/upstream lockstep.** The fixture is a vendored mirror; slices 2–3
  assume the upstream change (slice 1) is merged or the fixture is hand-mirrored
  to the agreed shape. If they drift, the per-lane check measures against the
  wrong shape. Mitigation: land slice 1 first and pin the fixture to the upstream
  commit.
- **The tree is already red.** `main` currently fails five alignment tests because
  a second build was imported ahead of the catalog change. The design must land
  (at least slices 2–4) to restore green; until then the Pages deploy gate is
  blocked. This is urgency, not just a future feature.
- **Option A row duplication ergonomics.** Two rows per config is more verbose in
  the catalog and easy to half-update (change stable, forget preview). A consis-
  tency lint (does every `(config, channel)` row have a matching source/build?)
  would help; out of scope here but worth reserving.
- **`artifact_name` per lane.** The version-tolerant source asset-name check
  (`product-catalog-alignment.test.js:278` area) must resolve the right lane's
  `artifact_name`; if it keeps resolving "the row" it can match the wrong lane's
  filename. Slice 5 must cover it.
- **Kit channel semantics.** Should a kit that names `preview` still auto-resolve
  to stable when a stable build exists (current `resolveCompatibleFirmware`
  behaviour), or should a preview kit force the preview build? This is a product
  decision, surfaced by `S360-KIT-BEDROOM-P` today. The engine currently does the
  former.
- **Promotion equality.** When preview is promoted to stable at the same version,
  is the preview lane cleared, kept (so the config shows the same version on both
  channels), or left to the importer? Needs a stated convention so promotion does
  not silently leave a stale preview lane.
- **`REQUIRED_CONFIGS` invariant.** The design asserts production-only stays
  production-only; reviewers should confirm no slice lets a preview lane influence
  `REQUIRED_CONFIGS` membership (`firmware-publish.yml:226-232`).
- **No hardware or signature claims.** This is a catalog/alignment contract change
  only. It makes no claim about signature verification, hardware bench
  verification, or compliance for any preview lane; the preview acknowledgement
  gate remains the user-facing guard.

---

## Appendix — evidence the runtime already coexists (current live state)

- `manifest.json`: 15 builds, including `Ceiling-POE-RoomIQ` at both `1.0.5`/
  `stable` and `1.0.0`/`preview`.
- `firmware/sources.json`: two `Ceiling-POE-RoomIQ` entries (`stable`/`1.0.5`,
  `preview`/`1.0.0`).
- Failing today (the gap this design closes):
  `__tests__/product-catalog-alignment.test.js` — `manifest build version matches
  catalog version where defined` throws
  `manifest.json build "Ceiling-POE-RoomIQ" has version "1.0.0" but upstream
  catalog declares version "1.0.5"` (`:384`), plus four count/recognition
  snapshots that assumed one build per config.
