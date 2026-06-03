/**
 * WF-UX-017 — Make manifest "freshness unknown" non-blocking in Simple install,
 * and make the live freshness check diagnosable.
 *
 * WF-UX-014/016 made the Simple-install freshness COPY calm, but the install
 * still BLOCKED on an unknown verdict because the manifest-freshness signal was
 * counted twice: once as a blocking preflight *warn* (which flips
 * preflightPolicy.canInstall to false on the live site, where the freshness row
 * is part of window.latestPreflightChecks) AND once in the dedicated freshness
 * gate. The selected stable build is present, signed, provenance-verified and
 * installable, so "could not recheck the latest firmware list" must not block
 * the normal customer path.
 *
 * WF-UX-017:
 *   1. manifest-freshness.js attaches a structured `reason` code to every
 *      verdict so a failing live GitHub Pages recheck is observable
 *      (fetch-failed / http-error / parse-failed / missing-loaded-generated-at /
 *      missing-fetched-generated-at / missing-both-generated-at /
 *      invalid-generated-at / compare-failed / same-or-newer / stale).
 *   2. evaluateFreshnessGate() is the SOLE freshness authority: 'unknown' is
 *      non-blocking in Simple install (advanced keeps the acknowledgement gate),
 *      and the install gate stops counting the manifest-freshness row as a
 *      blocking preflight warn (evaluateGatingPreflightPolicy). Stale stays a
 *      hard block in BOTH modes.
 *   3. The readiness broadcast carries the freshness axis so the Simple hero can
 *      render a small, calm SECONDARY note ("Couldn't recheck for updates…")
 *      that is never the main status, and Setup checks can surface the code.
 *
 * Test layout note: every describe that imports the REAL scripts/state.js runs
 * BEFORE the controller describes at the end (which jest.unstable_mockModule()s
 * state.js). An ESM module mock persists for the rest of the file, so the mock
 * must come last — same ordering convention as the wf-ux-015 / wf-ux-016 files.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');
const readJson = (rel) => JSON.parse(read(rel));

function mockBrowserEnv() {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
    Object.defineProperty(global.navigator, 'serial', {
        value: { getPorts: jest.fn(() => Promise.resolve([])) },
        configurable: true
    });
    window.confirm = jest.fn(() => true);
}

/* ===========================================================================
   Part A — the diagnosis: manifest-freshness.js attaches structured reason
   codes (pure function; no state mock).
   =========================================================================== */
describe('WF-UX-017 — manifest-freshness reason codes', () => {
    const LOADED = { generated_at: '2026-05-04T00:00:00.000Z' };

    async function svc() {
        return import('../scripts/services/manifest-freshness.js');
    }

    test('exports the eleven canonical reason codes (missing-generated-at split per side + manifest-load-pending)', async () => {
        const { FRESHNESS_REASON } = await svc();
        expect(new Set(Object.values(FRESHNESS_REASON))).toEqual(new Set([
            'fetch-failed', 'http-error', 'parse-failed',
            'missing-loaded-generated-at', 'missing-fetched-generated-at', 'missing-both-generated-at',
            // WF-MANIFEST-FRESHNESS-RACE-001 — transient startup-race diagnosis.
            'manifest-load-pending',
            'invalid-generated-at', 'compare-failed', 'same-or-newer', 'stale'
        ]));
    });

    test("current verdict carries reason 'same-or-newer'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(LOADED) }));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('current');
        expect(r.reason).toBe('same-or-newer');
    });

    test("stale verdict carries reason 'stale'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true, json: () => Promise.resolve({ generated_at: '2026-06-01T00:00:00.000Z' })
        }));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('stale');
        expect(r.reason).toBe('stale');
    });

    test("a network throw is reason 'fetch-failed' (and keeps the legacy error string)", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.reject(new Error('offline')));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('fetch-failed');
        expect(r.error).toMatch(/offline/i);
    });

    test("a missing fetch impl is reason 'fetch-failed'", async () => {
        const { checkManifestFreshness } = await svc();
        const r = await checkManifestFreshness(LOADED, { fetchImpl: null });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('fetch-failed');
    });

    test("a non-ok response is reason 'http-error'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('http-error');
        expect(r.error).toMatch(/404/);
    });

    test("a 2xx HTML / non-JSON body is reason 'parse-failed' (the likely live-Pages cause)", async () => {
        const { checkManifestFreshness } = await svc();
        // A GitHub Pages 404 HTML page or index.html fallback served for
        // manifest.json: response.ok is true but the body is not JSON.
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON'))
        }));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('parse-failed');
    });

    test("a fetched manifest with no generated_at is reason 'missing-fetched-generated-at'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('missing-fetched-generated-at');
    });

    test("a missing LOADED generated_at (live has it) is reason 'missing-loaded-generated-at'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ generated_at: '2026-05-04T00:00:00.000Z' }) }));
        const r = await checkManifestFreshness(null, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('missing-loaded-generated-at');
    });

    test("neither side carrying generated_at is reason 'missing-both-generated-at'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
        const r = await checkManifestFreshness(null, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('missing-both-generated-at');
    });

    test("an unparseable generated_at is reason 'invalid-generated-at'", async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true, json: () => Promise.resolve({ generated_at: 'not-a-date' })
        }));
        const r = await checkManifestFreshness(LOADED, { fetchImpl });
        expect(r.verdict).toBe('unknown');
        expect(r.reason).toBe('invalid-generated-at');
    });

    test('still re-fetches with cache: no-store (network-first contract intact)', async () => {
        const { checkManifestFreshness } = await svc();
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(LOADED) }));
        await checkManifestFreshness(LOADED, { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }));
    });
});

/* ===========================================================================
   Part B — the gate + install-readiness (REAL scripts/state.js).
   =========================================================================== */
describe('WF-UX-017 — Simple install: unknown is non-blocking, stale still blocks', () => {
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
          <div class="secondary-action-group"><p data-ready-helper></p></div>
          <div id="compatible-firmware">
            <p data-ready-helper></p>
            <esp-web-install-button data-webflash-install><button slot="activate"></button></esp-web-install-button>
          </div>
          <button data-module-summary-install></button>
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

    const BUILD = {
        firmwareId: 'release-one-stable-1.0.0',
        channel: 'stable',
        version: '1.0.0',
        config_string: 'Ceiling-POE-VentIQ-RoomIQ',
        parts: [{ path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin', offset: 0 }],
        source_commit: 'abc1234',
        changelog: ['Initial Release-One stable firmware.'],
        sha256: '0'.repeat(64),
        signature: 'sig',
        signature_key_id: 'dev-2026-01'
    };

    const ALL_PASS = [
        { key: 'browser-support', state: 'pass', detail: 'ok', blocking: false },
        { key: 'device-visibility', state: 'pass', detail: 'ok', blocking: false },
        { key: 'connection-quality', state: 'pass', detail: 'ok', blocking: false },
        { key: 'firmware-verification', state: 'pass', detail: 'ok', blocking: false },
        { key: 'user-acknowledgement', state: 'pass', detail: 'ok', blocking: false }
    ];

    beforeEach(() => {
        jest.resetModules();
        renderDom();
        mockBrowserEnv();
        window.currentFirmware = { ...BUILD };
        document.documentElement.setAttribute('data-install-mode', 'simple');
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { delete window.currentFirmware; } catch { /* ignore */ }
        try { delete window.latestPreflightChecks; } catch { /* ignore */ }
    });

    /**
     * Drive the install surface to "ready except for the freshness axis", then
     * apply the verdict. window.latestPreflightChecks is (re)seeded all-pass as
     * the LAST step so the install gate reads a clean non-freshness policy
     * (setManifestFreshnessState rebuilds the array via refreshPreflightDiagnostics).
     */
    function injectInstallControls() {
        document.getElementById('compatible-firmware').innerHTML = `
            <p data-ready-helper></p>
            <esp-web-install-button data-webflash-install><button slot="activate"></button></esp-web-install-button>
        `;
    }

    function arrange(__testHooks, { verdict, acknowledged = true }) {
        const { setStep } = __testHooks;
        setStep(5, { animate: false, skipUrlUpdate: true });
        __testHooks.setFirmwareOptions([{ ...BUILD }], BUILD.config_string);
        window.currentFirmware = { ...BUILD };
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(acknowledged);
        __testHooks.setManifestFreshnessState(verdict);
        // Re-inject the install controls (the firmware render replaces
        // #compatible-firmware) and seed an all-pass NON-freshness preflight set
        // as the LAST step, then run the gate so it reads the clean policy.
        injectInstallControls();
        window.latestPreflightChecks = ALL_PASS.map(c => ({ ...c }));
        __testHooks.updateFirmwareControls();
    }

    test('unknown freshness does NOT block the stable signed firmware (button enabled)', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        arrange({ ...__testHooks, setStep: mod.setStep }, { verdict: 'unknown' });

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);
        const installButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        expect(installButton.disabled).toBe(false);
        const readiness = __testHooks.getInstallReadiness();
        expect(readiness.ready).toBe(true);
    });

    test('the ready state appears when safety is confirmed and firmware is verified (reason "ready")', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        arrange({ ...__testHooks, setStep: mod.setStep }, { verdict: 'unknown', acknowledged: true });

        const readiness = __testHooks.getInstallReadiness();
        expect(readiness.reason).toBe('ready');
        expect(readiness.level).toBe('ready');
    });

    test('freshness-unknown is NOT the main status — safety unchecked reads "safety-checklist", not "freshness-unknown"', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        arrange({ ...__testHooks, setStep: mod.setStep }, { verdict: 'unknown', acknowledged: false });

        const readiness = __testHooks.getInstallReadiness();
        expect(readiness.reason).toBe('safety-checklist');
        expect(readiness.reason).not.toBe('freshness-unknown');
    });

    test('the readiness broadcast carries the freshness axis (state + reason) for the secondary note', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        // Inject a verdict WITH a diagnosis reason so the broadcast surfaces it.
        const { setStep } = mod;
        setStep(5, { animate: false, skipUrlUpdate: true });
        __testHooks.setFirmwareOptions([{ ...BUILD }], BUILD.config_string);
        window.currentFirmware = { ...BUILD };
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('unknown', { reason: 'parse-failed', error: 'not JSON' });
        window.latestPreflightChecks = ALL_PASS.map(c => ({ ...c }));
        __testHooks.updateFirmwareControls();

        const readiness = __testHooks.getInstallReadiness();
        expect(readiness.freshness).toEqual(expect.objectContaining({
            state: 'unknown',
            hasRun: true,
            hardBlock: false,
            reason: 'parse-failed'
        }));
    });

    test('stale freshness STILL hard-blocks in Simple mode (reason "firmware-stale", reload required)', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        arrange({ ...__testHooks, setStep: mod.setStep }, { verdict: 'stale' });

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
        expect(__testHooks.evaluateFreshnessGate().manifestStaleBlocking).toBe(true);
        const installButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        expect(installButton.disabled).toBe(true);
        const readiness = __testHooks.getInstallReadiness();
        expect(readiness.ready).toBe(false);
        expect(readiness.reason).toBe('firmware-stale');
    });

    test('Setup checks reveals the freshness diagnosis reason code on the row', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        mod.setStep(5, { animate: false, skipUrlUpdate: true });
        __testHooks.setManifestFreshnessState('unknown', { reason: 'parse-failed', error: 'not JSON' });
        await __testHooks.refreshPreflightDiagnostics();

        const row = document.querySelector('[data-preflight-item="manifest-freshness"]');
        expect(row.getAttribute('data-freshness-reason')).toBe('parse-failed');
        const codeEl = row.querySelector('[data-freshness-reason-code]');
        expect(codeEl.hidden).toBe(false);
        expect(codeEl.textContent).toContain('parse-failed');
    });

    test('checkManifestFreshnessNow surfaces a live parse-failed end-to-end (diagnosis)', async () => {
        const mod = await import('../scripts/state.js');
        const { __testHooks } = mod;
        // Live recheck hits an HTML/non-JSON body — the classic live-Pages cause.
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token <'))
        }));
        const result = await __testHooks.checkManifestFreshnessNow({ force: true });
        expect(result.verdict).toBe('unknown');
        expect(result.reason).toBe('parse-failed');
        expect(__testHooks.getManifestFreshnessDetail().reason).toBe('parse-failed');
    });
});

/* ===========================================================================
   Part C — Advanced install is unchanged: unknown still blocks until
   acknowledged, full diagnostics survive. Proves the Simple change is scoped.
   =========================================================================== */
describe('WF-UX-017 — Advanced install still gates + diagnoses unknown freshness', () => {
    function renderDom() {
        document.body.innerHTML = `
        <div id="browser-warning"></div>
        <div id="step-5" class="wizard-step">
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
        renderDom();
        mockBrowserEnv();
        // No data-install-mode attribute → the Advanced / pre-JS default.
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
    });

    test('unknown still blocks until acknowledged in Advanced mode', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
        __testHooks.setManifestFreshnessAcknowledgement(true);
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);
    });

    test('the manifest-freshness preflight check is still a blocking warn (diagnostic data unchanged)', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(c => c.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('warn');
        expect(freshnessCheck.blocking).toBe(true);
        expect(freshnessCheck.detail).toMatch(/could not confirm/i);
    });

    test('the diagnosis reason code is surfaced in Advanced mode too', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown', { reason: 'http-error', error: 'http 404' });
        await __testHooks.refreshPreflightDiagnostics();
        const row = document.querySelector('[data-preflight-item="manifest-freshness"]');
        expect(row.getAttribute('data-freshness-reason')).toBe('http-error');
    });
});

/* ===========================================================================
   Part D — static markup / CSS / no-change invariants (no module import).
   =========================================================================== */
describe('WF-UX-017 — static surfaces: collapse, release notes, no-policy-change', () => {
    const html = read('index.html');
    const css = read('css/wizard-style.css');

    test('Simple mode still hides the firmware card details by default (WF-UX-015 collapse intact)', () => {
        const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const m = cssNoComments.match(
            /([^{}]*data-technical-details-revealed[^{}]*)\{\s*display:\s*none\s*!important;?\s*\}/
        );
        expect(m).not.toBeNull();
        const selectorList = m[1];
        for (const surface of ['.firmware-details-panel', '.firmware-provenance', '.firmware-metadata', '.release-notes-section', '.secondary-action-group', '#firmware-selector']) {
            expect(selectorList).toContain(surface);
        }
    });

    test('the Simple hero ships the small secondary freshness note element (hidden by default)', () => {
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
        const note = document.querySelector('[data-simple-install] [data-simple-install-freshness-note]');
        expect(note).not.toBeNull();
        expect(note.hasAttribute('hidden')).toBe(true);
        expect(note.querySelector('[data-simple-install-freshness-text]')).not.toBeNull();
        // It is a SECONDARY note, never the main status box.
        expect(note.matches('[data-simple-install-status]')).toBe(false);
    });

    test('the freshness note carries a calm Reload affordance + a Setup checks link (details behind disclosures)', () => {
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
        const note = document.querySelector('[data-simple-install-freshness-note]');
        expect(note.querySelector('[data-simple-install-freshness-reload]')).not.toBeNull();
        expect(note.querySelector('[data-open-setup-checks]')).not.toBeNull();
    });

    test('the index.html ships no dead "#" release-notes link (WF-UX-016 fix intact)', () => {
        expect(html).not.toMatch(/href="#"[^>]*release-notes/i);
        expect(html).not.toMatch(/release-notes[^>]*href="#"/i);
    });

    test('manifest / sources carry the first preview batch; kits / REQUIRED_CONFIGS unchanged (Release-One + Rescue)', () => {
        expect(readJson('manifest.json').builds.map(b => b.config_string).sort())
            .toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED', 'Rescue']);
        expect((readJson('firmware/sources.json').sources || []).map(s => s.config_string).sort())
            .toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        const workflow = read('.github/workflows/firmware-publish.yml');
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('the simple-install controller imports no release-channel / provenance / freshness-service module', () => {
        const controller = read('scripts/simple-install.js');
        expect(controller).not.toMatch(/release-channels/);
        expect(controller).not.toMatch(/firmware-provenance/);
        expect(controller).not.toMatch(/manifest-freshness['"]/);
    });

    test('sw.js keeps the per-asset-class fetch strategy (only the cache name bumped)', () => {
        const sw = read('sw.js');
        expect(sw).toMatch(/url\.pathname\.endsWith\('\.bin'\)/);
        expect(sw).toMatch(/url\.pathname\.endsWith\('manifest\.json'\)/);
        expect(sw).toMatch(/stale-while-revalidate/i);
        const m = sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/);
        expect(Number(m[1])).toBeGreaterThanOrEqual(10);
    });

    test('the app-shell cache-bust token stays in lockstep across the shell', () => {
        const appJs = read('app.js');
        const bootstrap = read('scripts/bootstrap.js');
        const tokenFrom = (re, src) => { const m = src.match(re); return m ? m[1] : null; };
        const bootstrapTag = tokenFrom(/bootstrap\.js\?v=(\d+)/, html);
        const cssToken = tokenFrom(/wizard-style\.css\?v=(\d+)/, html);
        const appShellBuild = tokenFrom(/APP_SHELL_BUILD\s*=\s*['"](\d+)['"]/, bootstrap);
        const moduleToken = tokenFrom(/simple-install\.js\?v=(\d+)/, appJs);
        const shellMarker = (html.match(/name="webflash-app-shell"\s+content="([^"]+)"/) || [])[1];
        expect(bootstrapTag).toBe(cssToken);
        expect(bootstrapTag).toBe(appShellBuild);
        expect(bootstrapTag).toBe(moduleToken);
        expect(shellMarker.replace(/-/g, '')).toBe(moduleToken);
    });
});

/* ===========================================================================
   Part E — the Simple hero secondary note (controller; state.js mocked).
   MUST BE LAST: this describe jest.unstable_mockModule()s scripts/state.js.
   =========================================================================== */
const HERO_DOM = `
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <div class="simple-install__card" data-simple-install-card>
            <div class="simple-install__status" data-simple-install-status data-level="pending" role="status">
                <p data-simple-install-status-title></p>
                <p data-simple-install-status-detail></p>
                <div data-simple-install-status-actions hidden></div>
            </div>
            <p class="simple-install__freshness-note" data-simple-install-freshness-note hidden aria-hidden="true">
                <span data-simple-install-freshness-text></span>
                <button type="button" data-simple-install-freshness-reload>Reload</button>
                <button type="button" data-open-setup-checks>Setup checks</button>
            </p>
        </div>
    </section>
    <div id="step-5">
        <details data-preflight-details><summary>Preflight</summary></details>
        <label><input type="checkbox" data-preflash-acknowledge></label>
    </div>
`;

async function loadController({ dom = '' } = {}) {
    jest.resetModules();
    const setState = jest.fn();
    const setStep = jest.fn();
    const getMaxReachableStep = jest.fn(() => 5);
    jest.unstable_mockModule('../scripts/state.js', () => ({ setState, setStep, getMaxReachableStep }));
    jest.unstable_mockModule('../scripts/services/sw-update.js', () => ({
        triggerSkipWaitingAndReload: jest.fn(),
        getServiceWorkerState: () => ({ updateAvailable: false, updateDismissed: false }),
        subscribeServiceWorkerState: () => () => {}
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({ announce: jest.fn() }));

    document.documentElement.removeAttribute('data-install-mode');
    document.body.innerHTML = dom;
    try { localStorage.clear(); } catch { /* ignore */ }
    window.history.replaceState({}, '', '/');
    const mod = await import('../scripts/simple-install.js');
    return { mod };
}

describe('WF-UX-017 — the calm secondary freshness note (Simple hero controller)', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    const READY_UNKNOWN = {
        reason: 'ready',
        ready: true,
        freshness: { state: 'unknown', hasRun: true, acknowledged: false, hardBlock: false, reason: 'parse-failed' }
    };

    test('the note appears for unknown freshness, with the required copy, while the MAIN status stays "Ready to install"', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus(READY_UNKNOWN);

        const note = document.querySelector('[data-simple-install-freshness-note]');
        expect(note.hidden).toBe(false);
        expect(note.querySelector('[data-simple-install-freshness-text]').textContent)
            .toBe('Couldn’t recheck for updates. You can reload, or continue with the firmware list already loaded.');

        // The main status is the ready state, never a freshness block.
        const status = document.querySelector('[data-simple-install-status]');
        expect(status.querySelector('[data-simple-install-status-title]').textContent).toBe('Ready to install');
        expect(status.textContent.toLowerCase()).not.toContain('could not recheck');
    });

    test('the note never says "Cannot install yet", "manifest", or "accept the risk"', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus(READY_UNKNOWN);
        const text = document.querySelector('[data-simple-install-freshness-note]').textContent.toLowerCase();
        expect(text).not.toContain('cannot install');
        expect(text).not.toContain('manifest');
        expect(text).not.toContain('accept the risk');
    });

    test('the note is hidden when freshness is current', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'ready', ready: true, freshness: { state: 'current', hasRun: true, hardBlock: false } });
        const note = document.querySelector('[data-simple-install-freshness-note]');
        expect(note.hidden).toBe(true);
        expect(note.querySelector('[data-simple-install-freshness-text]').textContent).toBe('');
    });

    test('the note is hidden for a stale hard block (the main status owns that)', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'firmware-stale', ready: false, freshness: { state: 'stale', hasRun: true, hardBlock: true } });
        expect(document.querySelector('[data-simple-install-freshness-note]').hidden).toBe(true);
    });

    test('the note still appears while the customer has not yet confirmed safety (reason safety-checklist)', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({
            reason: 'safety-checklist',
            ready: false,
            freshness: { state: 'unknown', hasRun: true, acknowledged: false, hardBlock: false, reason: 'fetch-failed' }
        });
        const note = document.querySelector('[data-simple-install-freshness-note]');
        expect(note.hidden).toBe(false);
        // The main status is the calm "Confirm before installing" — not freshness.
        expect(document.querySelector('[data-simple-install-status-title]').textContent)
            .toBe('Confirm before installing');
    });

    test('the freshness-note Reload button is wired via the delegated (CSP-safe) click handler', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus(READY_UNKNOWN);

        // jsdom can neither spy on nor reassign window.location.reload, and a real
        // reload is a no-op there. Prove the delegated handler MATCHED the button
        // by asserting it cancelled the event (the handler calls preventDefault()
        // before the try/catch-wrapped reload). The reload call itself is a single
        // line identical to the already-shipped status 'reload' action. console is
        // silenced to swallow jsdom's "Not implemented: navigation" notice.
        const btn = document.querySelector('[data-simple-install-freshness-reload]');
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const ev = new Event('click', { bubbles: true, cancelable: true });
        btn.dispatchEvent(ev);
        errSpy.mockRestore();
        expect(ev.defaultPrevented).toBe(true);
    });

    test('renderFreshnessNote no-ops gracefully when the note element is absent', async () => {
        const { mod } = await loadController({ dom: '<div id="browser-warning"></div>' });
        expect(() => mod.__testHooks.renderFreshnessNote(READY_UNKNOWN)).not.toThrow();
    });
});
