# Product import readiness

WF-PRODUCT-004 — advisory tool that answers a single question across four
independent dimensions:

> Given an upstream product-catalog entry, is WebFlash allowed to
> **import** it, **manifest** it, list it in **REQUIRED_CONFIGS**, or
> expose it as a **kit**?

`scripts/validate-product-import-readiness.js` implements the question;
this doc is the contract.

## Purpose and scope

The validator is **reporting only.** It does not import firmware,
regenerate manifests, change `REQUIRED_CONFIGS`, modify kits, or touch
any UI / wizard / service-worker / workflow surface. It exists to bridge
upstream lifecycle states to WebFlash import / exposure decisions before
any of those follow-up PRs land.

In scope:

- Read the upstream product catalog (either the vendored fixture or a
  freshly downloaded copy) and classify every entry against the four
  eligibility concepts below.
- Cross-check the live WebFlash surfaces — `firmware/sources.json`,
  `manifest.json`, the publish workflow's `REQUIRED_CONFIGS`, and
  `scripts/data/kits.json` — against the catalog's lifecycle. Surface
  any entry that has leaked past its allowed eligibility.
- Emit a Markdown or JSON report. Exit non-zero on violation so the
  tool can be wired into pre-merge checks later, if and when the team
  decides to gate on it.

Out of scope:

- Importing the upstream `.bin`. That stays with
  [`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py).
- Regenerating `manifest.json` or `firmware-*.json`. That stays with
  [`scripts/gen-manifests.py`](../scripts/gen-manifests.py).
- Modifying `firmware/sources.json`, `scripts/data/kits.json`,
  `REQUIRED_CONFIGS`, the wizard, the service worker, or the deploy
  pipeline.
- Deciding which preview entries get promoted to kits or to
  `REQUIRED_CONFIGS`. Those are deliberate UX/product decisions
  (see WF-LED-003).

## Readiness concepts

Four independent boolean dimensions; an entry can be eligible for some
and not others.

| Dimension | Question it answers |
|---|---|
| **import-eligible** | May the upstream `.bin` be imported via `scripts/import-firmware-sources.py`? |
| **manifest-eligible** | May the imported asset appear in `manifest.json` / `firmware-*.json` today? |
| **REQUIRED_CONFIGS-eligible** | May the config_string be added to the publish workflow's `REQUIRED_CONFIGS` allowlist? |
| **kit-eligible** | May a `scripts/data/kits.json` kit point at this config_string? |

`Rescue` is a WebFlash-owned local recovery build and is exempt by name
from every catalog-membership check throughout. The validator treats it
as a non-violation everywhere it appears.

## Import eligibility

An upstream catalog entry is import-eligible when **all** of the
following hold:

- `status` is `production` or `preview`. Every other lifecycle status
  (`blocked`, `legacy-compatible`, `deprecated`, `removed`,
  `hardware-pending`, `compile-only`) is ineligible by definition.
- `webflash_build_matrix` is `true`.
- Each of `artifact_name`, `version`, `channel`, `webflash_wrapper`,
  `product_yaml` is a non-empty string.
- `channel` matches `status`: `production` → `stable`;
  `preview` → `preview` or `beta`.
- No token in the entry's `blocked_modules` list appears as a hyphen-
  bounded segment of either `artifact_name` or `config_string`.

Catalog-shape consistency is checked separately and surfaces in the
report as `shape_issues`:

- `webflash_build_matrix: true` without one of the required import
  fields → shape issue.
- `status` ↔ `channel` mismatch (e.g. `status: preview` paired with
  `channel: stable`) → shape issue.
- A `blocked_modules` token appearing in `artifact_name` /
  `config_string` → shape issue.

`shape_issues` on any entry causes the validator to exit non-zero even
if the entry is not currently exposed by WebFlash.

Note on external evidence: the actual import also requires
release-side proof (a signed upstream GitHub Release artifact with the
canonical H2 sections, a matching SHA256 in `checksums-sha256.txt`,
optionally a pinned `expected_sha256` in `firmware/sources.json`). The
validator does not download or verify those — it reports import
eligibility at the catalog level and lets
[`scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py)
enforce the proof contract at import time.

## Manifest eligibility

An entry is manifest-eligible when it is import-eligible **and** the
on-disk WebFlash state already supports it:

- A `firmware/sources.json` entry maps to the catalog's `config_string`.
- The configured `artifact_name` is present in `firmware/configurations/`
  as both a `.bin` and a sibling `.meta.json` sidecar.
- `manifest.json` contains a build whose `config_string` matches the
  catalog entry.

Preview entries may be manifest-eligible — this was the precondition
WF-LED-002 needed in order to ship the LED preview alongside Release-One
without promoting it to `REQUIRED_CONFIGS` or kits.

## REQUIRED_CONFIGS eligibility

`REQUIRED_CONFIGS` (in `.github/workflows/firmware-publish.yml`) is the
publish-time allowlist: the workflow refuses to deploy if any entry in
that array is missing from the regenerated `manifest.json`. The
validator's REQUIRED_CONFIGS layer answers "may this catalog entry be
added to that array?":

- `status` must be `production`.
- `channel` must be `stable`.
- A `manifest.json` build must already exist for the `config_string`.
- The catalog entry must already be import-eligible.

Production status is necessary but not sufficient. Adding a config to
`REQUIRED_CONFIGS` is a deliberate decision: it commits WebFlash to
shipping that build on every deploy. The validator surfaces the
eligibility ceiling; the workflow file is the actual allowlist.

Preview entries — including today's LED preview
(`Ceiling-POE-VentIQ-RoomIQ-LED`) — are **never** REQUIRED_CONFIGS
eligible. A future WF-LED-004 may revisit this only after upstream
promotes the LED catalog entry to `status: production`.

## Kit eligibility

Kits in `scripts/data/kits.json` are a customer-facing UX surface.
Kit eligibility tracks:

- `status` is `production` or `preview`.
- A `manifest.json` build exists for the `config_string`.

Whether a kit-eligible config actually ships as a kit is a separate
product decision. The validator reports "could this be a kit" rather
than "must this be a kit". Today only the Release-One config string
has a corresponding kit; the LED preview is kit-eligible but is not
currently exposed as a kit (the WF-LED-003 decision was manifest-only
exposure via the existing preview-channel gate).

## Current classifications

For the fixture at
`__tests__/fixtures/esphome-product-catalog.json` (synchronised against
upstream by WF-PRODUCT-003):

| `config_string` | Status | Channel | Import | Manifest | REQUIRED_CONFIGS | Kit | Currently exposed in kits? |
|---|---|---|:---:|:---:|:---:|:---:|---|
| `Ceiling-POE-VentIQ-RoomIQ` | production | stable | ✅ | ✅ | ✅ | ✅ | Yes |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | preview | preview | ✅ | ✅ | ❌ | ✅ | No (deferred under WF-LED-003) |
| `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` | blocked | — | ❌ | ❌ | ❌ | ❌ | No |
| `legacy:sense360-core-c-poe` | legacy-compatible | — | ❌ | ❌ | ❌ | ❌ | No |

The legacy-compatible representative has no `config_string` upstream —
it is identified by `legacy_config_id` only. The fixture intentionally
keeps one such entry so the legacy-leakage branch of the validator is
exercised.

## CLI usage

```bash
# Default: validate every entry in the fixture, Markdown output.
node scripts/validate-product-import-readiness.js

# Same, explicit catalog argument.
node scripts/validate-product-import-readiness.js \
  --catalog __tests__/fixtures/esphome-product-catalog.json

# Validate against a freshly downloaded upstream catalog.
curl -sLo /tmp/product-catalog.json \
  https://raw.githubusercontent.com/sense360store/esphome-public/main/config/product-catalog.json
node scripts/validate-product-import-readiness.js \
  --catalog /tmp/product-catalog.json

# Filter to a single catalog entry.
node scripts/validate-product-import-readiness.js \
  --config Ceiling-POE-VentIQ-RoomIQ-LED

# Machine-readable output.
node scripts/validate-product-import-readiness.js --format json

# All options.
node scripts/validate-product-import-readiness.js --help
```

Exit codes:

- `0` — every entry classified consistently, no cross-surface findings.
- `1` — at least one eligibility / cross-surface violation.
- `2` — usage error or file-load failure.

The Jest suite at `__tests__/product-import-readiness.test.js`
imports the same functions directly and pins every classification
against the current fixture + on-disk surfaces. The convenience
script alias `npm run test:product-import-readiness` runs just that
suite.

## Report examples

Default Markdown output (abbreviated; see the full output via
`node scripts/validate-product-import-readiness.js`):

```text
# Product import readiness report

- entries: 4
- import-eligible: 2
- manifest-eligible: 2
- REQUIRED_CONFIGS-eligible: 1
- kit-eligible: 2
- shape violations: 0
- cross-surface findings: 0

Overall: ✅ PASS

## Readiness table

| Identifier | Status | Channel | Import | Manifest | REQUIRED_CONFIGS | Kit | Surfaces present |
|---|---|---|:---:|:---:|:---:|:---:|---|
| `Ceiling-POE-VentIQ-RoomIQ` | production | stable | ✅ | ✅ | ✅ | ✅ | sources, manifest, REQUIRED_CONFIGS, kits, .bin, .meta.json |
| `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` | blocked | — | ❌ | ❌ | ❌ | ❌ | — |
| `Ceiling-POE-VentIQ-RoomIQ-LED` | preview | preview | ✅ | ✅ | ❌ | ✅ | sources, manifest, .bin, .meta.json |
| `legacy:sense360-core-c-poe` | legacy-compatible | — | ❌ | ❌ | ❌ | ❌ | — |
```

JSON output (top-level shape):

```json
{
  "summary": {
    "total": 4,
    "import_eligible": 2,
    "manifest_eligible": 2,
    "required_configs_eligible": 1,
    "kit_eligible": 2,
    "shape_violations": 0,
    "cross_surface_findings": 0,
    "filter_config": null,
    "ok": true
  },
  "entries": [ /* per-entry detail; see formatJson */ ],
  "cross_surface": [],
  "ok": true
}
```

## Failure examples

The validator exits non-zero in these representative scenarios.

**Preview entry leaked into `REQUIRED_CONFIGS`**

```
| REQUIRED_CONFIGS | `Ceiling-POE-VentIQ-RoomIQ-LED` | error | REQUIRED_CONFIGS is production-only; upstream status='preview' |
```

**FanTRIAC token reintroduced in any active surface**

```
| firmware/sources.json | `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` | error | source config_string contains blocked FanTRIAC token |
| manifest.json         | `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` | error | manifest build config_string contains blocked FanTRIAC token |
```

**Catalog entry marketed as a WebFlash build but missing import fields**

```
shape issue: webflash_build_matrix=true requires artifact_name, version, channel, webflash_wrapper, product_yaml; missing: artifact_name
```

**Channel ↔ status mismatch**

```
shape issue: status='production' requires channel∈[stable], got 'preview'
```

**Legacy-compatible identifier exposed in an active surface**

```
| firmware/sources.json | `sense360-core-c-poe` | error | source config_string matches a legacy_config_id from a legacy-compatible catalog entry |
```

## Relationship to upstream catalog

The vendored fixture at
`__tests__/fixtures/esphome-product-catalog.json` is the offline
default — CI runs against it so the suite stays hermetic. To validate
against a freshly downloaded upstream catalog without refreshing the
fixture, pass `--catalog /path/to/upstream/config/product-catalog.json`
(or set `PRODUCT_CATALOG_PATH` for the alignment test).

Refresh the fixture (separate PR) only when upstream promotes a new
config WebFlash needs to ship, or when a status WebFlash relies on
changes (e.g. FanTRIAC leaving `blocked`). The validator's contract
mirrors what `__tests__/product-catalog-alignment.test.js` already
enforces; the readiness report is the human-readable explanation
behind those tests.

## Relationship to WebFlash import

The readiness validator is a *pre-import* advisory: it answers "could
WebFlash legally import this entry today?" and "do today's active
surfaces match what the catalog says they should?". The actual import
flow stays unchanged:

1. Add an entry to `firmware/sources.json` declaring the upstream
   `source_repo` / `release_tag` / `asset_name` and any per-source
   `block_tokens` (e.g. the LED preview source carries
   `block_tokens: ["FanTRIAC"]` only; the Release-One source keeps
   `["FanTRIAC", "LED"]`).
2. Run `scripts/import-firmware-sources.py` to fetch + verify + stage
   the `.bin` and write the `.meta.json` sidecar.
3. Run `scripts/gen-manifests.py --summary` to sign and regenerate
   `manifest.json` + `firmware-*.json`.
4. Optionally promote to `REQUIRED_CONFIGS` (production-only) and/or
   `scripts/data/kits.json` in a deliberate follow-up.

The readiness validator can be run before step 1 to sanity-check the
upstream catalog, and after step 3 to confirm the resulting surface
state still matches the catalog. Neither is automated by this PR.

## Do-not-change guardrails

WF-PRODUCT-004 is reporting-only and explicitly does **not** modify:

- `firmware/sources.json`
- `manifest.json`
- `firmware-*.json`
- `firmware/configurations/*`
- `firmware/rescue/*`
- `scripts/data/kits.json`
- `__tests__/fixtures/esphome-product-catalog.json`
- `index.html`
- `scripts/state.js`
- `scripts/utils/release-channels.js`
- `sw.js`
- `.github/workflows/*`
- any wizard / UI / signing / deployment surface

Invariants that travel through this PR unchanged:

- Release-One is `Ceiling-POE-VentIQ-RoomIQ`, `channel: stable`,
  `version: 1.0.0`.
- LED preview (`Ceiling-POE-VentIQ-RoomIQ-LED`) stays on
  `channel: preview`, manifest-only exposure, no kit, no
  `REQUIRED_CONFIGS` entry (WF-LED-003).
- FanTRIAC stays blocked at the **importer / catalog** layer
  under HW-005 + COMPLIANCE-001. The catalog eligibility classifier
  in [`scripts/validate-product-import-readiness.js`](../scripts/validate-product-import-readiness.js)
  treats any FanTRIAC-token-bearing entry as ineligible for import,
  manifest, kit, and `REQUIRED_CONFIGS`. **Note:** [WF-TRIAC-001](wizard-ux-roadmap.md#wf-triac-001--landed)
  added a wizard-side `advanced-manual-warning` availability state
  for `fan=triac` that makes TRIAC **selectable** in the custom
  path (behind an inline acknowledgement). That is a customer-facing
  *visibility* change; the classifier rules in this document are
  unchanged, and no FanTRIAC artifact may be imported via the
  upstream `sense360store/esphome-public` catalog until upstream
  promotes it AND `WF-IMPORT-TRIAC-001` opens the import PR. TRIAC
  visibility in the wizard is **not** the same as TRIAC
  importability under this validator.
- `REQUIRED_CONFIGS` is production-only and holds exactly
  `Ceiling-POE-VentIQ-RoomIQ` + `Rescue`.
- `Rescue` is exempt by name from every catalog-membership check.

## See also

- [`docs/firmware-import.md`](firmware-import.md) — the cross-repo
  import contract this validator is an advisory layer for.
- [`docs/led-preview-import-plan.md`](led-preview-import-plan.md) —
  the WF-LED-001 / -002 / -003 planning and decision history; the
  LED preview's classification under this validator is the live
  embodiment of that plan.
- [`docs/webflash-required-configs-cleanup.md`](webflash-required-configs-cleanup.md) —
  rationale for the production-only `REQUIRED_CONFIGS` policy.
- [`docs/webflash-cleanup-audit.md`](webflash-cleanup-audit.md) —
  baseline audit that scoped the WF-CLEANUP and WF-PRODUCT work.
- [`docs/github-pages-surface-audit.md`](github-pages-surface-audit.md) —
  deployed-surface contract this validator's expectations align with.
- [`__tests__/product-catalog-alignment.test.js`](../__tests__/product-catalog-alignment.test.js) —
  the WF-PRODUCT-001 / -002 / -003 alignment guard; the readiness
  validator's rules are the human-readable form of those test
  assertions.
- [`__tests__/manifest-health.test.js`](../__tests__/manifest-health.test.js) —
  on-disk manifest/sidecar consistency guard; complementary to the
  cross-surface checks the readiness validator performs against the
  catalog.
- [`__tests__/product-import-readiness.test.js`](../__tests__/product-import-readiness.test.js) —
  the Jest suite pinning the rules described in this document.
- [`docs/webflash-import-readiness-matrix.md`](webflash-import-readiness-matrix.md) —
  WF-IMPORT-GAP-001 WebFlash-side import readiness matrix. This
  validator answers *catalog → eligibility*; the matrix answers
  *eligibility → import sequencing* (which families may be imported,
  what import class they would land in, what exposure that does and
  does not unlock, and which deliberate follow-up PRs split the
  per-family imports). Documentation-only, with no firmware /
  manifest / source / kit / runtime / workflow / test change.
