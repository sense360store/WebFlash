# WF-MANIFEST-FRESHNESS-RACE-001 — manifest freshness startup race

This note records the **updated** diagnosis of the live `missing-generated-at`
freshness warning, superseding the WF-FRESHNESS-ROOT-MANIFEST-001 hypothesis with
new HAR evidence and pinning the actual root cause: a **startup ordering / race**,
not a bad manifest file and not a missing `generated_at` in the deployed root
manifest.

## New HAR evidence (full page refresh directly into `step=5`)

Browser DevTools, captured on a full page refresh that lands directly on the
review step (`step=5`):

- `/WebFlash/manifest.json` is fetched **successfully**.
- It returns **HTTP 200 JSON**.
- The returned JSON includes a **top-level `generated_at`**.
- A **second** `/WebFlash/manifest.json` request also returns valid JSON with
  `generated_at`.
- When the user manually clicks **"Check for update again"**, the check
  **succeeds**.

Conclusion: this is **not** a bad manifest file and **not** a missing
`generated_at` in the deployed root manifest. The published file is correct on
every request.

## Updated root cause — startup ordering / race

The freshness check can run on the initial Step 5 load **before the loaded
manifest metadata has been captured/preserved**. The wizard kicks off
`loadManifestData()` asynchronously at module init; on a direct deep-link into
the review step, `setStep(totalSteps)` calls
`triggerManifestFreshnessCheckIfNeeded()` while that load is still in flight. At
that instant `manifestMetadata` is still `null`, so the comparison ran against a
null loaded `generated_at` and reported a missing-generated-at verdict — even
though the live `/WebFlash/manifest.json` it fetched carries `generated_at`.

On a manual **"Check for update again"**, the manifest has already finished
loading, `manifestMetadata` is populated, and the same check succeeds. That is
exactly why the manual recheck always worked while the initial refresh did not.

Two latches turned the transient race into a sticky warning:

1. `triggerManifestFreshnessCheckIfNeeded()` set `manifestFreshnessHasRun = true`
   **before** `checkManifestFreshnessNow()` had actually completed, so the
   premature (still-loading) invocation latched the gate and blocked the real
   check from ever running.
2. `checkManifestFreshnessNow()` compared `manifestMetadata` immediately, with no
   guard for the load still being pending.

## The fix

1. **Capture on load.** `loadManifestData()` already captures the root manifest
   metadata (`generated_at`, `manifest_version`, `source_commit`) via
   `captureManifestMetadata()` immediately after parsing the manifest JSON on
   every successful load (WF-FRESHNESS-ROOT-MANIFEST-001). Re-pinned here.
2. **Wait, don't guess.** `checkManifestFreshnessNow()` never runs the comparison
   with missing loaded metadata while the load is still pending. When
   `manifestMetadata` is missing and the load has not definitively failed, it:
   - awaits the active `manifestLoadPromise` (or calls/awaits
     `loadManifestData()`), then
   - re-captures metadata, then
   - runs the freshness comparison.
   A load that has **already failed** (`manifestLoadError` set) is left alone, so
   the recheck still reports the real `missing-loaded-generated-at` error instead
   of silently re-fetching a manifest the wizard never actually loaded.
3. **No premature latch.** `manifestFreshnessHasRun` is not set to `true` until
   the checker has a real fetch/check result.
   `triggerManifestFreshnessCheckIfNeeded()` no longer pre-marks the check as run;
   it relies on `checkManifestFreshnessNow()` to dedup concurrent callers (via
   `manifestFreshnessCheckPromise`) and to flip the flag only on a real result, so
   re-entrant step changes during the in-flight load are safe and idempotent.
4. **A distinct transient code.** A genuinely still-pending load is reported as
   `manifest-load-pending` (verdict `unknown`) and does **not** latch a verdict —
   it is kept separate from the definitive `missing-loaded-generated-at`,
   `missing-fetched-generated-at`, and `missing-both-generated-at` diagnoses so a
   startup race is never misattributed to a bad or uncaptured published manifest.

## Reason codes (delta)

| `reason` | `verdict` | Meaning |
|---|---|---|
| `manifest-load-pending` | unknown | **Transient.** The initial manifest load has not resolved yet, so the loaded `generated_at` was not captured. The caller awaits the load and re-runs; never latched, never blamed on the published file. |
| `missing-loaded-generated-at` | unknown | The loaded copy lacks `generated_at` *after* the load resolved (e.g. a definitively failed load) while the live copy has it. |
| `missing-fetched-generated-at` | unknown | The live copy lacks `generated_at` (wrong fetch target). |
| `missing-both-generated-at` | unknown | Neither copy has a `generated_at` string. |

## Acceptance

- A full page refresh directly into `step=5` must **not** show `Diagnostic code:
  missing-generated-at` when `/WebFlash/manifest.json` contains a top-level
  `generated_at`.
- Manual **"Check for update again"** and the initial refresh produce the **same**
  freshness result.

Both are pinned by `__tests__/wf-manifest-freshness-race.test.js`:

- direct Step 5 trigger fired *before* the manifest load resolves waits, then
  yields `current` — never missing-generated-at;
- the checker waits for the manifest load / captured metadata before comparing;
- the first refresh produces the same result as a manual recheck (both
  `current`);
- a stale manifest still hard-blocks;
- a failed manifest load still reports a real error
  (`missing-loaded-generated-at`), not a deferred pending state.

## What this change does **not** touch

No firmware binary, `manifest.json`, `firmware-*.json`, `firmware/sources.json`,
`REQUIRED_CONFIGS`, `scripts/data/kits.json`, release-channel policy, provenance
verification, the install gate's stale hard-block, or the service-worker fetch
strategy. The freshness **verdict semantics** (current / stale / unknown) are
unchanged — only the startup ordering around when the comparison runs is fixed.
