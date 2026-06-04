/**
 * WF-FRESHNESS-ROOT-MANIFEST-001 — fix root manifest freshness check.
 *
 * The live Simple install showed "Firmware list check / WebFlash could not
 * recheck the latest firmware list… Diagnostic code: missing-generated-at"
 * even though the repository root `manifest.json` carries a valid top-level
 * `generated_at`. Two root causes:
 *
 *   1. LOADED side. `captureManifestMetadata()` was reachable only via
 *      __testHooks, so the production manifest load never recorded the loaded
 *      `generated_at`. With no loaded timestamp to compare, the live recheck
 *      always collapsed to `missing-generated-at`. The fix calls
 *      captureManifestMetadata() in loadManifestData()'s success path.
 *   2. LIVE side robustness. The probe must target the ROOT manifest
 *      (`/WebFlash/manifest.json` on GitHub Pages, not a relative path that can
 *      misresolve to the domain root, not firmware/sources.json, not the rescue
 *      manifest, not a per-build part) and must read `generated_at` under both
 *      the canonical top-level shape and a nested `manifest.generated_at`
 *      envelope. Every verdict now carries explicit diagnostics (fetched URL,
 *      HTTP status, content-type, top-level keys, generated_at presence, and the
 *      selected timestamp source).
 *
 * Test layout: Part A is the pure manifest-freshness.js unit surface; Part B
 * drives the REAL scripts/state.js end-to-end (capture-on-load regression guard,
 * current verdict + readiness axis, Simple-install note, stale hard block).
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');
const readJson = (rel) => JSON.parse(read(rel));

// Real on-disk artifacts — ties the unit assertions to the shipped files.
const ROOT_MANIFEST = readJson('manifest.json');
const SOURCES_JSON = readJson('firmware/sources.json');
const RESCUE_MANIFEST = readJson('firmware/rescue/manifest.json');

const FRESHNESS_SVC = '../scripts/services/manifest-freshness.js';
const okJson = (body) => jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }));

/* ===========================================================================
   Part A — manifest-freshness.js: root targeting, robust extraction, diagnostics
   =========================================================================== */
describe('WF-FRESHNESS-ROOT-MANIFEST-001 — checkManifestFreshness (unit)', () => {
    beforeEach(() => jest.resetModules());

    test('the shipped root manifest.json has a top-level generated_at', () => {
        expect(typeof ROOT_MANIFEST.generated_at).toBe('string');
        expect(ROOT_MANIFEST.generated_at.length).toBeGreaterThan(0);
    });

    test('root manifest with top-level generated_at returns current / same-or-newer', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const fetchImpl = okJson(ROOT_MANIFEST);
        const r = await checkManifestFreshness(
            { generated_at: ROOT_MANIFEST.generated_at },
            { fetchImpl }
        );
        expect(r.verdict).toBe('current');
        expect(r.reason).toBe('same-or-newer');
        expect(r.diagnostics.timestampSource).toBe('generated_at');
        expect(r.diagnostics.hasGeneratedAt).toBe(true);
    });

    test('current verdict resolves end-to-end when BOTH sides are the real root manifest', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const r = await checkManifestFreshness(ROOT_MANIFEST, { fetchImpl: okJson(ROOT_MANIFEST) });
        expect(r.verdict).toBe('current');
        expect(r.loadedGeneratedAt).toBe(ROOT_MANIFEST.generated_at);
        expect(r.liveGeneratedAt).toBe(ROOT_MANIFEST.generated_at);
    });

    test('a nested manifest.generated_at on the LOADED side is supported', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const loaded = { manifest: { generated_at: '2026-05-04T00:00:00.000Z' } };
        const live = { generated_at: '2026-05-04T00:00:00.000Z' };
        const r = await checkManifestFreshness(loaded, { fetchImpl: okJson(live) });
        expect(r.verdict).toBe('current');
        expect(r.loadedGeneratedAt).toBe('2026-05-04T00:00:00.000Z');
    });

    test('a nested manifest.generated_at on the LIVE side is supported and recorded as the source', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const loaded = { generated_at: '2026-05-04T00:00:00.000Z' };
        const live = { manifest: { generated_at: '2026-06-01T00:00:00.000Z' } };
        const r = await checkManifestFreshness(loaded, { fetchImpl: okJson(live) });
        expect(r.verdict).toBe('stale');
        expect(r.liveGeneratedAt).toBe('2026-06-01T00:00:00.000Z');
        expect(r.diagnostics.hasNestedGeneratedAt).toBe(true);
        expect(r.diagnostics.hasGeneratedAt).toBe(false);
        expect(r.diagnostics.timestampSource).toBe('manifest.generated_at');
    });

    test('the wrong JSON (firmware/sources.json) reports missing-fetched-generated-at with fetched URL + top-level keys', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const r = await checkManifestFreshness(
            { generated_at: ROOT_MANIFEST.generated_at },
            { fetchImpl: okJson(SOURCES_JSON), manifestUrl: '/WebFlash/manifest.json' }
        );
        expect(r.verdict).toBe('unknown');
        // Loaded side has generated_at, the wrong target does not → fetched side.
        expect(r.reason).toBe('missing-fetched-generated-at');
        expect(r.diagnostics.fetchedUrl).toBe('/WebFlash/manifest.json');
        expect(r.diagnostics.topLevelKeys).toEqual(expect.arrayContaining(['schema_version', 'sources']));
        expect(r.diagnostics.hasGeneratedAt).toBe(false);
        expect(r.diagnostics.hasNestedGeneratedAt).toBe(false);
    });

    test('the rescue manifest (no generated_at) also reports missing-fetched-generated-at', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        // Guard the premise: the rescue manifest must NOT carry generated_at.
        expect(RESCUE_MANIFEST.generated_at).toBeUndefined();
        const r = await checkManifestFreshness(
            { generated_at: ROOT_MANIFEST.generated_at },
            { fetchImpl: okJson(RESCUE_MANIFEST) }
        );
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('missing-fetched-generated-at');
    });

    test('the missing-generated-at diagnostic is split per side (loaded / fetched / both)', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const T = '2026-05-04T00:00:00.000Z';

        const loadedMissing = await checkManifestFreshness(null, { fetchImpl: okJson({ generated_at: T }) });
        expect(loadedMissing.reason).toBe('missing-loaded-generated-at');

        const fetchedMissing = await checkManifestFreshness({ generated_at: T }, { fetchImpl: okJson({}) });
        expect(fetchedMissing.reason).toBe('missing-fetched-generated-at');

        const bothMissing = await checkManifestFreshness(null, { fetchImpl: okJson({}) });
        expect(bothMissing.reason).toBe('missing-both-generated-at');

        // The flat `missing-generated-at` code is retired.
        const { FRESHNESS_REASON } = await import(FRESHNESS_SVC);
        expect(Object.values(FRESHNESS_REASON)).not.toContain('missing-generated-at');
    });

    test('stale: a newer live generated_at is diagnosed as stale', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const r = await checkManifestFreshness(
            { generated_at: '2026-05-04T00:00:00.000Z' },
            { fetchImpl: okJson({ generated_at: '2026-06-01T00:00:00.000Z' }) }
        );
        expect(r.verdict).toBe('stale');
        expect(r.reason).toBe('stale');
    });

    test('fetch-failed / http-error / parse-failed remain diagnosed and carry diagnostics', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const loaded = { generated_at: ROOT_MANIFEST.generated_at };

        const failed = await checkManifestFreshness(loaded, {
            fetchImpl: jest.fn(() => Promise.reject(new Error('offline'))),
            manifestUrl: '/WebFlash/manifest.json'
        });
        expect(failed.verdict).toBe('unknown');
        expect(failed.reason).toBe('fetch-failed');
        expect(failed.diagnostics.fetchedUrl).toBe('/WebFlash/manifest.json');

        const httpErr = await checkManifestFreshness(loaded, {
            fetchImpl: jest.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }))
        });
        expect(httpErr.verdict).toBe('unknown');
        expect(httpErr.reason).toBe('http-error');
        expect(httpErr.diagnostics.httpStatus).toBe(404);

        const parseErr = await checkManifestFreshness(loaded, {
            fetchImpl: jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }))
        });
        expect(parseErr.verdict).toBe('unknown');
        expect(parseErr.reason).toBe('parse-failed');
    });

    test('content-type is captured when the response exposes headers', async () => {
        const { checkManifestFreshness } = await import(FRESHNESS_SVC);
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
            json: () => Promise.resolve(ROOT_MANIFEST)
        }));
        const r = await checkManifestFreshness({ generated_at: ROOT_MANIFEST.generated_at }, { fetchImpl });
        expect(r.diagnostics.contentType).toBe('application/json');
        expect(r.diagnostics.httpStatus).toBe(200);
    });
});

describe('WF-FRESHNESS-ROOT-MANIFEST-001 — resolveManifestUrl (GitHub Pages base path)', () => {
    beforeEach(() => jest.resetModules());

    test('the /WebFlash/ Pages subpath resolves to the absolute /WebFlash/manifest.json', async () => {
        const { resolveManifestUrl } = await import(FRESHNESS_SVC);
        expect(resolveManifestUrl('/WebFlash/')).toBe('/WebFlash/manifest.json');
        expect(resolveManifestUrl('/WebFlash/index.html')).toBe('/WebFlash/manifest.json');
        expect(resolveManifestUrl('/WebFlash')).toBe('/WebFlash/manifest.json');
    });

    test('a root deployment keeps the relative manifest.json', async () => {
        const { resolveManifestUrl } = await import(FRESHNESS_SVC);
        expect(resolveManifestUrl('/')).toBe('manifest.json');
        expect(resolveManifestUrl('/index.html')).toBe('manifest.json');
    });

    test('checkManifestFreshness fetches the resolved Pages URL and records it', async () => {
        const { checkManifestFreshness, resolveManifestUrl } = await import(FRESHNESS_SVC);
        const fetchImpl = okJson(ROOT_MANIFEST);
        const r = await checkManifestFreshness(
            { generated_at: ROOT_MANIFEST.generated_at },
            { fetchImpl, manifestUrl: resolveManifestUrl('/WebFlash/') }
        );
        expect(fetchImpl).toHaveBeenCalledWith('/WebFlash/manifest.json', expect.objectContaining({ cache: 'no-store' }));
        expect(r.diagnostics.fetchedUrl).toBe('/WebFlash/manifest.json');
    });
});

/* ===========================================================================
   Part B — scripts/state.js end-to-end (REAL module).
   =========================================================================== */
describe('WF-FRESHNESS-ROOT-MANIFEST-001 — state.js end-to-end', () => {
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
        // jsdom shares window.location across resetModules within a file. Reset
        // the URL so state.js's init lands on Step 1 (a lingering ?step=5 would
        // drive init to the review step and run refreshPreflightDiagnostics
        // before the module body finishes evaluating).
        window.history.replaceState({}, '', '/');
        renderDom();
        // Default load returns the REAL root manifest (with generated_at).
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

    test('loadManifestData captures the root manifest top-level generated_at (regression guard)', async () => {
        const mod = await import('../scripts/state.js');
        await mod.__testHooks.loadManifestData({ forceReload: true });
        const md = mod.getManifestMetadataForAbout();
        expect(md).not.toBeNull();
        expect(md.generated_at).toBe(ROOT_MANIFEST.generated_at);
    });

    test('a root manifest with generated_at yields verdict current — never a missing-generated-at warning', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        await __testHooks.loadManifestData({ forceReload: true });
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('current');
        expect(result.reason).toBe('same-or-newer');
        expect(result.reason).not.toMatch(/missing-.*generated-at/);
    });

    test('a live-shaped root manifest (HAR fields: top-level generated_at + source_commit) is captured during loadManifestData', async () => {
        // Mirrors the live HAR response shape the DevTools capture proved.
        const LIVE_SHAPED = {
            name: 'Sense360 Modular Platform Firmware',
            version: '1.0.0',
            manifest_version: 1,
            generated_at: '2026-06-01T20:14:37.955988+00:00',
            source_commit: 'bacc3d97245e17cb531aa85d7994f99f2f9889b2',
            builds: ROOT_MANIFEST.builds
        };
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LIVE_SHAPED) }));
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        await __testHooks.loadManifestData({ forceReload: true });

        // The loaded metadata the freshness checker receives carries generated_at.
        const md = mod.getManifestMetadataForAbout();
        expect(md.generated_at).toBe(LIVE_SHAPED.generated_at);
        expect(md.source_commit).toBe(LIVE_SHAPED.source_commit);

        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.loadedGeneratedAt).toBe(LIVE_SHAPED.generated_at);
        expect(result.verdict).toBe('current');
        expect(result.reason).not.toMatch(/missing-.*generated-at/);
    });

    test('a failed reload clears loaded metadata — no false-current after the failure', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        // Prime a good load so loaded metadata is populated.
        await __testHooks.loadManifestData({ forceReload: true });
        expect(mod.getManifestMetadataForAbout().generated_at).toBe(ROOT_MANIFEST.generated_at);

        // Force-reload fails on every retry.
        global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
        await expect(__testHooks.loadManifestData({ forceReload: true, maxRetries: 1 })).rejects.toThrow();

        // Stale loaded metadata must NOT survive — otherwise a recheck could read
        // current against a now-untrustworthy timestamp.
        const md = mod.getManifestMetadataForAbout();
        expect(md === null || md.generated_at === null).toBe(true);

        // Even if the live recheck succeeds, the verdict is unknown (loaded gone),
        // never a false current.
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ROOT_MANIFEST) }));
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('unknown');
        expect(result.reason).toBe('missing-loaded-generated-at');
    });

    test('the install-readiness freshness axis reads current after a healthy manifest load', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        await __testHooks.loadManifestData({ forceReload: true });
        await __testHooks.checkManifestFreshnessNow({ force: true });

        const readiness = __testHooks.getInstallReadiness();
        expect(readiness).not.toBeNull();
        expect(readiness.freshness.state).toBe('current');
        expect(readiness.freshness.hardBlock).toBe(false);
    });

    test('stale manifest still hard-blocks in Simple install', async () => {
        document.documentElement.setAttribute('data-install-mode', 'simple');
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        __testHooks.setManifestFreshnessState('stale');
        const gate = __testHooks.evaluateFreshnessGate();
        expect(gate.ok).toBe(false);
        expect(gate.manifestStaleBlocking).toBe(true);
        expect(gate.blockingReason).toMatch(/newer firmware manifest is available/i);
    });

    test('checkManifestFreshnessNow still diagnoses a live parse-failed (HTML served for manifest.json)', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        await __testHooks.loadManifestData({ forceReload: true });
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }));
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('unknown');
        expect(result.reason).toBe('parse-failed');
        expect(__testHooks.getManifestFreshnessDetail().reason).toBe('parse-failed');
    });
});
