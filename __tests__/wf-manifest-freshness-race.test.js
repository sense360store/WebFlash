/**
 * WF-MANIFEST-FRESHNESS-RACE-001 — startup ordering / race fix.
 *
 * New HAR evidence (DevTools, full page refresh directly into `step=5`):
 *   - `/WebFlash/manifest.json` is fetched successfully and returns HTTP 200 JSON.
 *   - The JSON carries a top-level `generated_at` (and a second request to the
 *     same URL also returns valid JSON with `generated_at`).
 *   - A manual "Check for update again" succeeds.
 * So the live `missing-generated-at` warning was NEVER a bad published manifest
 * or a missing root `generated_at`. It is a STARTUP RACE: the review-step
 * freshness trigger can fire before the initial manifest load has resolved, so
 * the loaded metadata has not been captured yet. The manual recheck succeeds
 * only because by then the manifest has finished loading.
 *
 * The fix:
 *   1. loadManifestData() captures root manifest metadata immediately after
 *      parsing the JSON (regression guard — already covered, re-pinned here).
 *   2. checkManifestFreshnessNow() never compares with missing loaded metadata
 *      while the load is pending — it awaits the in-flight manifestLoadPromise
 *      (or starts a load), re-captures metadata, THEN compares.
 *   3. A genuinely still-pending load reports the distinct `manifest-load-pending`
 *      reason and does NOT latch manifestFreshnessHasRun.
 *   4. triggerManifestFreshnessCheckIfNeeded() does NOT pre-mark the check as run
 *      before checkManifestFreshnessNow() has actually completed.
 *
 * Part A pins the pure manifest-freshness.js guard; Part B drives the REAL
 * scripts/state.js end-to-end through the deep-link race.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8'));
const ROOT_MANIFEST = readJson('manifest.json');

const FRESHNESS_SVC = '../scripts/services/manifest-freshness.js';
const okJson = (body) => jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }));

/* A controllable fetch whose resolution is deferred until release() is called,
 * so a test can observe the freshness check WHILE the manifest load is still in
 * flight (the deep-link race window). */
function deferredManifestFetch(body) {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fetchImpl = jest.fn(() => gate.then(() => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body)
    })));
    return { fetchImpl, release };
}

/* ===========================================================================
   Part A — manifest-freshness.js: the manifest-load-pending guard
   =========================================================================== */
describe('WF-MANIFEST-FRESHNESS-RACE-001 — checkManifestFreshness (unit)', () => {
    beforeEach(() => jest.resetModules());

    test('manifest-load-pending is a distinct, exported reason code', async () => {
        const { FRESHNESS_REASON } = await import(FRESHNESS_SVC);
        expect(FRESHNESS_REASON.MANIFEST_LOAD_PENDING).toBe('manifest-load-pending');
        // It must be distinct from the definitive missing-loaded diagnosis.
        expect(FRESHNESS_REASON.MANIFEST_LOAD_PENDING)
            .not.toBe(FRESHNESS_REASON.MISSING_LOADED_GENERATED_AT);
    });

    test('missing loaded metadata + manifestLoadPending defers to manifest-load-pending WITHOUT fetching', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const fetchImpl = okJson(ROOT_MANIFEST);
        const r = await checkManifestFreshness(null, { fetchImpl, manifestLoadPending: true });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('manifest-load-pending');
        // The whole point: we refuse to compare, so the live manifest is NOT
        // even fetched, and the result is never blamed on the published file.
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(r.reason).not.toMatch(/missing-.*generated-at/);
    });

    test('manifestLoadPending is ignored once loaded metadata IS present (real comparison runs)', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const fetchImpl = okJson(ROOT_MANIFEST);
        const r = await checkManifestFreshness(
            { generated_at: ROOT_MANIFEST.generated_at },
            { fetchImpl, manifestLoadPending: true }
        );
        expect(fetchImpl).toHaveBeenCalled();
        expect(r.verdict).toBe('current');
        expect(r.reason).toBe('same-or-newer');
    });

    test('without the pending flag, missing loaded metadata is still the definitive missing-loaded diagnosis', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const r = await checkManifestFreshness(null, { fetchImpl: okJson(ROOT_MANIFEST) });
        expect(r.reason).toBe('missing-loaded-generated-at');
    });
});

/* ===========================================================================
   Part B — scripts/state.js end-to-end: the deep-link startup race
   =========================================================================== */
describe('WF-MANIFEST-FRESHNESS-RACE-001 — state.js end-to-end', () => {
    function renderDom() {
        document.body.innerHTML = `
        <div id="browser-warning"></div>
        <div data-freshness-banner-mount></div>
        <div class="progress-step" data-step="1"></div>
        <div class="progress-step" data-step="5"></div>
        <div id="step-5" class="wizard-step">
          <section class="simple-install" data-simple-install>
            <div class="simple-install__status" data-simple-install-status data-level="pending"></div>
            <p class="simple-install__freshness-note" data-simple-install-freshness-note hidden>
              <span data-simple-install-freshness-text></span>
            </p>
          </section>
          <div id="compatible-firmware"><p data-ready-helper></p></div>
          <button id="download-btn"></button>
          <button id="copy-firmware-url-btn"></button>
          <ul data-preflight-list>
            <li data-preflight-item="manifest-freshness" data-status="pending">
              <span class="preflight-panel__label">Manifest freshness</span>
              <span data-preflight-status="manifest-freshness"></span>
              <p data-preflight-detail="manifest-freshness"></p>
              <p data-freshness-reason-code hidden></p>
              <div data-manifest-freshness-actions hidden>
                <button type="button" data-manifest-freshness-recheck>Recheck manifest freshness</button>
                <label data-manifest-freshness-ack-control hidden><input type="checkbox" data-manifest-freshness-acknowledge></label>
              </div>
            </li>
          </ul>
        </div>`;
    }

    beforeEach(() => {
        jest.resetModules();
        window.history.replaceState({}, '', '/');
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ROOT_MANIFEST) }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });
        Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { delete window.webflashInstallReadiness; } catch { /* ignore */ }
    });

    test('the review-step trigger fired BEFORE the manifest load resolves waits, then yields current — never missing-generated-at', async () => {
        // Deep-link race: the initial manifest load is in flight when the
        // freshness trigger fires (exactly what setStep(totalSteps) does).
        const { fetchImpl, release } = deferredManifestFetch(ROOT_MANIFEST);
        global.fetch = fetchImpl;

        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;

        // The init manifest load is pending (deferred fetch). Metadata is not
        // captured yet, so a naive comparison now would mis-blame the loaded side.
        expect(mod.getManifestMetadataForAbout()).toBeNull();

        // Fire the trigger while the load is still pending.
        const triggered = __testHooks.triggerManifestFreshnessCheckIfNeeded();

        // CRITICAL: the check must NOT be marked run before it has a real result.
        expect(__testHooks.getManifestFreshnessHasRun()).toBe(false);

        // Now let the manifest load (and the checker's own probe) resolve.
        release();
        const result = await triggered;

        expect(result.verdict).toBe('current');
        expect(result.reason).toBe('same-or-newer');
        expect(result.reason).not.toMatch(/missing-.*generated-at/);
        // Only NOW is the check latched as run.
        expect(__testHooks.getManifestFreshnessHasRun()).toBe(true);
        // The loaded metadata was captured during the awaited load.
        expect(mod.getManifestMetadataForAbout().generated_at).toBe(ROOT_MANIFEST.generated_at);
    });

    test('checkManifestFreshnessNow waits for the in-flight load to capture metadata before comparing', async () => {
        const { fetchImpl, release } = deferredManifestFetch(ROOT_MANIFEST);
        global.fetch = fetchImpl;

        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;

        // Metadata not captured yet — load still pending.
        expect(mod.getManifestMetadataForAbout()).toBeNull();

        const checkPromise = __testHooks.checkManifestFreshnessNow();
        // Synchronously, the checker is suspended awaiting the load — no premature run.
        expect(__testHooks.getManifestFreshnessHasRun()).toBe(false);

        release();
        const result = await checkPromise;
        expect(result.loadedGeneratedAt).toBe(ROOT_MANIFEST.generated_at);
        expect(result.verdict).toBe('current');
    });

    test('first refresh produces the SAME result as a manual recheck (both current, no missing-generated-at)', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;

        // Initial-refresh path: the trigger drives the very first check.
        const firstRefresh = await __testHooks.triggerManifestFreshnessCheckIfNeeded();
        expect(firstRefresh.verdict).toBe('current');
        expect(firstRefresh.reason).not.toMatch(/missing-.*generated-at/);

        // Manual "Check for update again" path: a forced recheck once loaded.
        const manualRecheck = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(manualRecheck.verdict).toBe('current');
        expect(manualRecheck.reason).toBe(firstRefresh.reason);
    });

    test('manual recheck still works after the manifest has loaded', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        await __testHooks.loadManifestData({ forceReload: true });
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('current');
        expect(result.reason).toBe('same-or-newer');
    });

    test('a stale published manifest still hard-blocks (the race fix does not soften staleness)', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        await __testHooks.loadManifestData({ forceReload: true });

        // Live recheck returns a NEWER generated_at than the loaded copy.
        const newer = { ...ROOT_MANIFEST, generated_at: '2999-01-01T00:00:00.000Z' };
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(newer) }));
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('stale');

        const gate = __testHooks.evaluateFreshnessGate();
        expect(gate.ok).toBe(false);
        expect(gate.manifestStaleBlocking).toBe(true);
    });

    test('a failed manifest load still reports a real error (missing-loaded-generated-at), not a deferred pending state', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;

        // Force a load that fails on every retry → loaded metadata is cleared and
        // manifestLoadError is set.
        global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
        await expect(__testHooks.loadManifestData({ forceReload: true, maxRetries: 1 })).rejects.toThrow();
        const md = mod.getManifestMetadataForAbout();
        expect(md === null || md.generated_at === null).toBe(true);

        // A subsequent recheck must NOT silently re-fetch and pretend current; the
        // definitively-failed load surfaces the real missing-loaded diagnosis even
        // though the live probe succeeds.
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ROOT_MANIFEST) }));
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('unknown');
        expect(result.reason).toBe('missing-loaded-generated-at');
        expect(result.reason).not.toBe('manifest-load-pending');
    });

    test('re-entrant triggers during the in-flight load share one check and do not double-latch', async () => {
        const { fetchImpl, release } = deferredManifestFetch(ROOT_MANIFEST);
        global.fetch = fetchImpl;
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;

        // Multiple step re-entries while the load is pending.
        const a = __testHooks.triggerManifestFreshnessCheckIfNeeded();
        const b = __testHooks.triggerManifestFreshnessCheckIfNeeded();
        expect(__testHooks.getManifestFreshnessHasRun()).toBe(false);

        release();
        const [ra, rb] = await Promise.all([a, b]);
        expect(ra.verdict).toBe('current');
        expect(rb.verdict).toBe('current');
        expect(__testHooks.getManifestFreshnessHasRun()).toBe(true);
    });
});
