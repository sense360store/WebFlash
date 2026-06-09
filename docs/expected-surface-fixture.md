# The expected-surface fixture (WF-SURFACE-SSOT-001)

`__tests__/fixtures/expected-surface.json` is the **reviewed, single source of
truth for the deploy surface**. It declares, per active build, the
`config_string`, `version`, and `channel`; plus the standalone Rescue entry
and the **retired register** (artifacts that left the surface and must never
reappear — currently the five v1.0.0-preview artifacts retired in #553).

`__tests__/helpers/expected-surface.js` validates the fixture at load time and
derives everything the suites used to hardcode — total build count,
per-channel counts, the stable / preview config sets, the expected
`.bin` / `.meta.json` filenames (from the canonical
`Sense360-<config_string>-v<version>-<channel>.bin` convention), and the
`firmware-N.json` index bound (count − 1). Tests import the derived values
instead of repeating literals.

## Direction of enforcement

The fixture is the reviewed **intent**; the tests compare **reality** against
it — `manifest.json`, the `firmware/configurations/` directory listing, the
`firmware-N.json` namespace, and the sources / kits cross-checks. Every
comparison is exact and bidirectional: a build missing from reality fails,
and an unexpected build in reality fails. Because of that, **a drifted
fixture cannot auto-pass** — editing the fixture without the matching surface
change turns the comparing suites red (verified by mutation: a version drift,
a channel drift, and a phantom build each fail 8–14 tests). The anchor suite
is `__tests__/expected-surface.test.js`.

## The promotion / import / retirement procedure

A surface change is **one PR containing both halves, reviewed together**:

1. The surface change itself — the `firmware/sources.json` entry, the
   imported `.bin` + `.meta.json`, the regenerated `manifest.json` +
   `firmware-*.json` (via `scripts/gen-manifests.py`), and any kit decision.
2. **One edit to `__tests__/fixtures/expected-surface.json`**:
   - *Import*: add the build row (config, version, channel), keeping `builds`
     sorted by `config_string`.
   - *Version bump in place*: change the row's `version`.
   - *Promotion (preview → stable)*: change the row's `channel` — and make the
     matching kit decision, because the anchor suite cross-checks the fixture
     stable set against the kits.json-derived stable surface
     (`__tests__/helpers/stable-surface.js`, including its
     `kitWithheldStableConfigs` register).
   - *Retirement*: move the row from `builds` to `retired` (keep the retired
     version/channel as they shipped, add `retired_in` + `reason`). Retired
     rows give the "stays retired" guards their teeth — do not delete them.

No other test edit should be needed for a pure surface change. If a suite
still fails after the fixture edit, it is guarding something deliberately
independent (see below) and the failure is a real decision to make, not
churn.

If an automated import run commits a surface change to `main` without the
fixture edit (the workflow does not edit fixtures), the guards go red by
design; the fix is the one-line fixture edit, not a multi-suite rebaseline.

## What stays independent (deliberately NOT derived)

- **kits.json structural pins** (`__tests__/kits-json.test.js`): which kit
  SKUs exist, which are recommended/stable, and the withheld-kit rules
  (`S360-KIT-KITCHEN-P` stays out under owner waiver HW-AIRIQ-WAIVER-2026-06).
  Kit membership is a product decision, not a build-surface fact.
- **The kits.json-derived production surface**
  (`__tests__/helpers/stable-surface.js`): `REQUIRED_CONFIGS` expectations
  still derive from kits.json. The anchor suite asserts the two helpers agree
  so they cannot drift apart.
- **Naming-policy checks** (`scripts/validate-naming-policy.js` and its
  tests): the filename grammar is enforced on its own.
- **FanTRIAC guards**: every reality-side FanTRIAC assertion (manifest, disk,
  sources, catalog) remains an explicit independent check. The fixture
  *additionally* refuses to declare a FanTRIAC build at load time — that is
  defence-in-depth on the intent side, never a substitute.
- **The upstream product-catalog fixture**
  (`__tests__/fixtures/esphome-product-catalog.json`) and its eligibility
  counts: catalog lifecycle is upstream's claim, refreshed by
  `scripts/refresh-product-catalog-fixture.py`, not a deploy-surface fact.
  (The one hardcoded count that remains is `import_eligible` in
  `__tests__/product-import-readiness.test.js` — deriving it would re-run the
  validator's own logic and could never fail.)
