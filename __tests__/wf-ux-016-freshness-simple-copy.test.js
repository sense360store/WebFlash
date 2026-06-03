/**
 * WF-UX-016 — Route freshness-unknown through the Simple-install copy only.
 *
 * Background. The manifest-freshness check is represented twice in state.js:
 * once as a preflight diagnostic row AND once as the dedicated freshness gate
 * (evaluateFreshnessGate). An unknown-freshness verdict makes the
 * manifest-freshness preflight row a *blocking warn*, which flipped the
 * aggregate preflight verdict to "can't install". The Simple-install hero reads
 * the broadcast `reason`, and because the aggregate-preflight branch
 * ('preflight-fail') was checked BEFORE the freshness branch, the live Simple
 * path rendered "Cannot install yet" + the raw manifest-freshness message
 * ("WebFlash could not confirm whether the firmware list is up to date. Use
 * 'Recheck manifest freshness'…") instead of WF-UX-013's calm
 * "Could not recheck for updates" mapping. WF-UX-013/014 only fixed the
 * describeReadiness mapping + the deploy/cache layer; the raw state/preflight
 * copy was still being *routed* into Simple mode.
 *
 * WF-UX-016:
 *   1. state.js attributes the freshness axis to its own readiness reason
 *      (deriveInstallReadinessReason reads stale/unknown from the gate and the
 *      preflight verdict from the NON-freshness checks), so unknown freshness
 *      broadcasts 'freshness-unknown' (calm hero copy) and stale broadcasts
 *      'firmware-stale' (hard block, reload only) — never 'preflight-fail'.
 *   2. In Simple mode the manifest-freshness preflight row (revealed under
 *      "Setup checks") uses customer-safe copy: no "Manifest freshness", no
 *      "Recheck manifest freshness", no "could not confirm whether the firmware
 *      list is up to date", no raw acknowledgement copy. Advanced install keeps
 *      the full diagnostic wording.
 *
 * The real gate is untouched: Continue still ticks the authoritative
 * manifest-freshness acknowledgement, unknown still requires acknowledgement,
 * stale stays a hard block with no continue override. Presentation/deploy-layer
 * only — no firmware / manifest / sources / REQUIRED_CONFIGS / installability
 * change.
 *
 * Test layout note: every describe that imports the REAL scripts/state.js runs
 * before the controller describe at the end (which jest.unstable_mockModule()s
 * state.js). An ESM module mock persists for the rest of the file, so the mock
 * must come last — same ordering convention as wf-ux-015's test file.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');
const readJson = (rel) => JSON.parse(read(rel));

// The forbidden raw freshness phrases that must never reach the Simple path.
const FORBIDDEN_SIMPLE = [
    'Cannot install yet',
    'Manifest freshness',
    'Recheck manifest freshness',
    'could not confirm whether the firmware list is up to date',
    'I understand WebFlash could not confirm freshness'
];

function mockBrowserEnv() {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
    Object.defineProperty(global.navigator, 'serial', {
        value: { getPorts: jest.fn(() => Promise.resolve([])) },
        configurable: true
    });
}

/* ===========================================================================
   Part A — the readiness-reason routing fix (pure function in state.js)

   deriveInstallReadinessReason attributes the freshness axis to its own reason
   instead of letting the manifest-freshness preflight row double-count as a
   generic 'preflight-fail'. This is the unit that fixes the live bug.
   =========================================================================== */
describe('WF-UX-016 — deriveInstallReadinessReason routes the freshness axis', () => {
    function loadStateHooks() {
        jest.resetModules();
        document.body.innerHTML = '<div id="browser-warning"></div>';
        mockBrowserEnv();
        return import('../scripts/state.js').then(m => m.__testHooks);
    }

    // The happy-path inputs: firmware present, verified, safety acknowledged,
    // no advanced/channel acks outstanding, every NON-freshness preflight check
    // passing. The freshness axis is what the individual tests vary.
    const READY_BASE = Object.freeze({
        hasFirmware: true,
        isPending: false,
        isFailed: false,
        isAcknowledged: true,
        advancedWarningAcksSatisfied: true,
        channelAcksSatisfied: true,
        nonFreshnessCanInstall: true,
        nonFreshnessRequiresWarnAck: false,
        swUpdateBlocking: false,
        manifestStaleBlocking: false,
        manifestUnknownBlocking: false,
        readyToFlash: true
    });

    test('unknown freshness (the only blocker) resolves to "freshness-unknown", NOT "preflight-fail"', async () => {
        const { deriveInstallReadinessReason } = await loadStateHooks();
        // Unknown freshness makes the manifest-freshness row a blocking warn, so
        // the *aggregate* preflight verdict would say "can't install". But the
        // NON-freshness verdict is clean, so the reason must be the calm
        // freshness reason — this is the regression the live site hit.
        const reason = deriveInstallReadinessReason({
            ...READY_BASE,
            manifestUnknownBlocking: true,
            readyToFlash: false
        });
        expect(reason).toBe('freshness-unknown');
        expect(reason).not.toBe('preflight-fail');
    });

    test('stale freshness resolves to "firmware-stale" (hard block), NOT "preflight-fail"', async () => {
        const { deriveInstallReadinessReason } = await loadStateHooks();
        const reason = deriveInstallReadinessReason({
            ...READY_BASE,
            manifestStaleBlocking: true,
            readyToFlash: false
        });
        expect(reason).toBe('firmware-stale');
        expect(reason).not.toBe('preflight-fail');
    });

    test('a genuine NON-freshness preflight failure still wins over unknown freshness', async () => {
        const { deriveInstallReadinessReason } = await loadStateHooks();
        // e.g. unsupported browser / device-not-visible co-occurring with unknown
        // freshness: the real preflight problem is more important and must take
        // priority so the user is not told to "reload" when the browser is the
        // blocker.
        const reason = deriveInstallReadinessReason({
            ...READY_BASE,
            nonFreshnessCanInstall: false,
            manifestUnknownBlocking: true,
            readyToFlash: false
        });
        expect(reason).toBe('preflight-fail');
    });

    test('the earlier gates still take priority (firmware / verification / safety / acks)', async () => {
        const { deriveInstallReadinessReason } = await loadStateHooks();
        expect(deriveInstallReadinessReason({ ...READY_BASE, hasFirmware: false, readyToFlash: false }))
            .toBe('no-firmware');
        expect(deriveInstallReadinessReason({ ...READY_BASE, isPending: true, readyToFlash: false }))
            .toBe('verifying');
        expect(deriveInstallReadinessReason({ ...READY_BASE, isFailed: true, readyToFlash: false }))
            .toBe('verification-failed');
        // An unticked safety confirmation is still surfaced before freshness so
        // the customer ticks one thing at a time.
        expect(deriveInstallReadinessReason({
            ...READY_BASE, isAcknowledged: false, manifestUnknownBlocking: true, readyToFlash: false
        })).toBe('safety-checklist');
        expect(deriveInstallReadinessReason({ ...READY_BASE, channelAcksSatisfied: false, readyToFlash: false }))
            .toBe('channel-ack');
    });

    test('a clean state still resolves to "ready"', async () => {
        const { deriveInstallReadinessReason } = await loadStateHooks();
        expect(deriveInstallReadinessReason(READY_BASE)).toBe('ready');
    });
});

/* ===========================================================================
   Part B — the preflight freshness ROW copy is mode-aware (real state.js)

   When Simple mode reveals the preflight row under "Setup checks" it must read
   customer-safe copy; Advanced install (and the no-attribute pre-JS default)
   keeps the full diagnostic wording.
   =========================================================================== */
describe('WF-UX-016 — manifest-freshness preflight row copy is routed through the install mode', () => {
    function renderRowDom() {
        document.body.innerHTML = `
            <div id="browser-warning"></div>
            <div data-preflight-banner-mount></div>
            <div data-freshness-banner-mount></div>
            <div class="progress-step" data-step="1"></div>
            <div class="progress-step" data-step="5"></div>
            <div id="step-5" class="wizard-step">
                <div id="compatible-firmware"><p data-ready-helper></p></div>
                <button id="download-btn"></button>
                <button id="copy-firmware-url-btn"></button>
                <ul data-preflight-list>
                    <li class="preflight-panel__item" data-preflight-item="browser-support" data-status="pending"><span class="preflight-panel__label">Browser support</span><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
                    <li class="preflight-panel__item preflight-panel__item--manifest-freshness" data-preflight-item="manifest-freshness" data-status="pending">
                        <span class="preflight-panel__label">Manifest freshness</span>
                        <span data-preflight-status="manifest-freshness"></span>
                        <p data-preflight-detail="manifest-freshness"></p>
                        <div data-manifest-freshness-actions hidden aria-hidden="true">
                            <button type="button" data-manifest-freshness-recheck>Recheck manifest freshness</button>
                            <label data-manifest-freshness-ack-control hidden aria-hidden="true">
                                <input type="checkbox" data-manifest-freshness-acknowledge aria-describedby="manifest-freshness-ack-description">
                                <span id="manifest-freshness-ack-description">I understand WebFlash could not confirm freshness and want to continue with the firmware list already loaded in this browser.</span>
                            </label>
                        </div>
                    </li>
                </ul>
            </div>`;
    }

    beforeEach(() => {
        jest.resetModules();
        renderRowDom();
        mockBrowserEnv();
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
    });

    function rowText() {
        const item = document.querySelector('[data-preflight-item="manifest-freshness"]');
        return {
            label: item.querySelector('.preflight-panel__label').textContent,
            detail: item.querySelector('[data-preflight-detail="manifest-freshness"]').textContent,
            recheck: item.querySelector('[data-manifest-freshness-recheck]').textContent,
            ackDesc: item.querySelector('#manifest-freshness-ack-description').textContent
        };
    }

    test('Simple mode: the revealed row carries customer-safe copy (no raw freshness labels)', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.documentElement.setAttribute('data-install-mode', 'simple');
        __testHooks.setManifestFreshnessState('unknown');
        await __testHooks.refreshPreflightDiagnostics();

        const { label, detail, recheck, ackDesc } = rowText();
        const blob = `${label} ${detail} ${recheck} ${ackDesc}`;
        for (const phrase of FORBIDDEN_SIMPLE) {
            expect(blob).not.toContain(phrase);
        }
        // …and it still reads as a real, plain-language freshness surface.
        expect(label).toBe('Firmware list check');
        expect(recheck).toBe('Check for updates again');
        expect(detail.toLowerCase()).toContain('firmware list');
    });

    test('Simple mode: an acknowledged unknown verdict still reads plainly', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.documentElement.setAttribute('data-install-mode', 'simple');
        __testHooks.setManifestFreshnessState('unknown');
        __testHooks.setManifestFreshnessAcknowledgement(true);
        await __testHooks.refreshPreflightDiagnostics();

        const { detail } = rowText();
        expect(detail).not.toContain('could not confirm whether the firmware list is up to date');
        expect(detail.toLowerCase()).toContain('already loaded in this browser');
    });

    test('Advanced install (no-attribute default): the row keeps the full diagnostic wording', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // No data-install-mode attribute — the pre-JS / Advanced default.
        __testHooks.setManifestFreshnessState('unknown');
        await __testHooks.refreshPreflightDiagnostics();

        const { label, detail, recheck, ackDesc } = rowText();
        expect(label).toBe('Manifest freshness');
        expect(recheck).toMatch(/Recheck manifest freshness/i);
        expect(detail).toMatch(/could not confirm whether the firmware list is up to date/i);
        expect(ackDesc).toMatch(/I understand WebFlash could not confirm freshness/i);
    });

    test('switching Advanced → Simple re-renders the row with customer-safe copy', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        await __testHooks.refreshPreflightDiagnostics();
        expect(rowText().label).toBe('Manifest freshness');

        document.documentElement.setAttribute('data-install-mode', 'simple');
        await __testHooks.refreshPreflightDiagnostics();
        expect(rowText().label).toBe('Firmware list check');
        expect(rowText().recheck).toBe('Check for updates again');
    });
});

/* ===========================================================================
   Part C — the real freshness gate is untouched (defense against un-gating)
   =========================================================================== */
describe('WF-UX-016 — the freshness gate stays authoritative', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <div id="browser-warning"></div>
            <div data-freshness-banner-mount></div>
            <div id="step-5" class="wizard-step">
                <ul data-preflight-list>
                    <li data-preflight-item="manifest-freshness" data-status="pending">
                        <span class="preflight-panel__label">Manifest freshness</span>
                        <span data-preflight-status="manifest-freshness"></span>
                        <p data-preflight-detail="manifest-freshness"></p>
                        <div data-manifest-freshness-actions hidden>
                            <button type="button" data-manifest-freshness-recheck>Recheck manifest freshness</button>
                            <label data-manifest-freshness-ack-control hidden><input type="checkbox" data-manifest-freshness-acknowledge></label>
                        </div>
                    </li>
                </ul>
            </div>`;
        mockBrowserEnv();
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
    });

    // WF-UX-017 supersedes WF-UX-016 here: in Simple install an unknown verdict
    // ("could not recheck", NOT stale) is non-blocking — the loaded stable build
    // is signed + provenance-verified + installable. The dedicated acknowledgement
    // gate is still honoured OUTSIDE Simple install (advanced / pre-JS default).
    test('unknown freshness is non-blocking in Simple mode but still blocks in Advanced until acknowledged (WF-UX-017)', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.documentElement.setAttribute('data-install-mode', 'simple');
        __testHooks.setManifestFreshnessState('unknown');
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);

        // Advanced / pre-JS default: the acknowledgement gate is unchanged.
        document.documentElement.removeAttribute('data-install-mode');
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
        const ack = document.querySelector('[data-manifest-freshness-acknowledge]');
        ack.checked = true;
        ack.dispatchEvent(new Event('change', { bubbles: true }));
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);
    });

    test('stale freshness is a hard block that acknowledgement cannot clear', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.documentElement.setAttribute('data-install-mode', 'simple');
        __testHooks.setManifestFreshnessState('stale');
        __testHooks.setManifestFreshnessAcknowledgement(true);
        const verdict = __testHooks.evaluateFreshnessGate();
        expect(verdict.ok).toBe(false);
        expect(verdict.manifestStaleBlocking).toBe(true);
    });

    test('the unknown-verdict data check still carries the diagnostic detail (mode-independent)', async () => {
        // refreshPreflightDiagnostics returns the canonical check objects; the
        // data contract (consumed by support bundles etc.) is unchanged — only
        // the *rendered* Simple-mode copy is plain-language.
        const { __testHooks } = await import('../scripts/state.js');
        document.documentElement.setAttribute('data-install-mode', 'simple');
        __testHooks.setManifestFreshnessState('unknown');
        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(c => c.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('warn');
        expect(freshnessCheck.blocking).toBe(true);
        expect(freshnessCheck.detail).toMatch(/could not confirm/i);
    });
});

/* ===========================================================================
   Part D — presentation/deploy-layer only: no policy surfaces changed
   =========================================================================== */
describe('WF-UX-016 — no firmware / manifest / sources / REQUIRED_CONFIGS change', () => {
    test('manifest carries Release-One stable + six preview builds + Rescue', () => {
        const configs = readJson('manifest.json').builds.map(b => b.config_string).sort();
        expect(configs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-FanDAC', 'Ceiling-POE-FanPWM', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED', 'Rescue']);
    });

    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = read('.github/workflows/firmware-publish.yml');
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('firmware/sources.json declares Release-One + six preview sources', () => {
        const cfgs = (readJson('firmware/sources.json').sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-FanDAC', 'Ceiling-POE-FanPWM', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
    });

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('the simple-install controller still imports no release-channel / provenance / freshness-gate module', () => {
        const controller = read('scripts/simple-install.js');
        expect(controller).not.toMatch(/release-channels/);
        expect(controller).not.toMatch(/firmware-provenance/);
        expect(controller).not.toMatch(/manifest-freshness['"]/);
    });
});

/* ===========================================================================
   Part E — deploy coupling. The fix lives in scripts/state.js, which has no
   per-import ?v= token and rides the sw.js CACHE_NAME bump (docs/deploy-notes.md
   step 3/4). Bump the cache name so existing installs purge v7 and re-prime; the
   five-way ?v= token equality stays intact as a regression guard.
   =========================================================================== */
describe('WF-UX-016 — the state.js change is re-primed via a CACHE_NAME bump', () => {
    const html = read('index.html');
    const appJs = read('app.js');
    const bootstrap = read('scripts/bootstrap.js');
    const sw = read('sw.js');
    const tokenFrom = (re, src) => { const m = src.match(re); return m ? m[1] : null; };

    test('sw.js CACHE_NAME is bumped to at least webflash-v8 so existing installs re-prime state.js', () => {
        const m = sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/);
        expect(m).not.toBeNull();
        expect(Number(m[1])).toBeGreaterThanOrEqual(8);
    });

    test('state.js is in the service worker app-shell module list (so the cache-name bump re-primes it)', () => {
        expect(sw).toMatch(/['"]\.\/scripts\/state\.js['"]/);
    });

    test('the per-asset ?v= tokens stay in lockstep (state.js needs no per-import token)', () => {
        const bootstrapTag = tokenFrom(/bootstrap\.js\?v=(\d+)/, html);
        const cssToken = tokenFrom(/wizard-style\.css\?v=(\d+)/, html);
        const appShellBuild = tokenFrom(/APP_SHELL_BUILD\s*=\s*['"](\d+)['"]/, bootstrap);
        const moduleToken = tokenFrom(/simple-install\.js\?v=(\d+)/, appJs);
        const shellMarker = (html.match(/name="webflash-app-shell"\s+content="([^"]+)"/) || [])[1];

        expect(bootstrapTag).not.toBeNull();
        expect(bootstrapTag).toBe(cssToken);
        expect(bootstrapTag).toBe(appShellBuild);
        expect(bootstrapTag).toBe(moduleToken);
        expect(shellMarker.replace(/-/g, '')).toBe(moduleToken);
    });

    test('the per-asset-class fetch strategy is unchanged (cache-name bump is version-only)', () => {
        expect(sw).toMatch(/url\.pathname\.endsWith\('\.bin'\)/);
        expect(sw).toMatch(/url\.pathname\.endsWith\('manifest\.json'\)/);
        expect(sw).toMatch(/stale-while-revalidate/i);
    });
});

/* ===========================================================================
   Part F — the Simple-install hero copy for freshness-unknown (controller).

   MUST BE LAST: this describe jest.unstable_mockModule()s scripts/state.js for
   the controller unit, and an ESM module mock persists for the rest of the file.

   With the reason routed to 'freshness-unknown', the hero renders the calm
   mapping. These tests pin the customer-facing surface end-to-end through the
   simple-install controller's renderStatus.
   =========================================================================== */
const HERO_DOM = `
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <div class="simple-install__card" data-simple-install-card>
            <div class="simple-install__status" data-simple-install-status data-level="pending" role="status">
                <p data-simple-install-status-title></p>
                <p data-simple-install-status-detail></p>
                <div data-simple-install-status-actions hidden></div>
            </div>
        </div>
    </section>
    <div id="step-5">
        <section class="review-task review-task--safety">
            <section class="preflight-panel" data-preflight-panel>
                <details class="preflight-panel__details" data-preflight-details>
                    <ul class="preflight-panel__list" data-preflight-list>
                        <li data-preflight-item="manifest-freshness">
                            <label data-manifest-freshness-ack-control hidden>
                                <input type="checkbox" data-manifest-freshness-acknowledge>
                            </label>
                        </li>
                    </ul>
                </details>
            </section>
            <label><input type="checkbox" data-preflash-acknowledge></label>
        </section>
    </div>
`;

async function loadController({ dom = '' } = {}) {
    jest.resetModules();
    const setState = jest.fn();
    const setStep = jest.fn();
    const getMaxReachableStep = jest.fn(() => 5);
    const triggerSkipWaitingAndReload = jest.fn();
    const announce = jest.fn();

    jest.unstable_mockModule('../scripts/state.js', () => ({ setState, setStep, getMaxReachableStep }));
    jest.unstable_mockModule('../scripts/services/sw-update.js', () => ({
        triggerSkipWaitingAndReload,
        getServiceWorkerState: () => ({ updateAvailable: false, updateDismissed: false }),
        subscribeServiceWorkerState: () => () => {}
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({ announce }));

    document.documentElement.removeAttribute('data-install-mode');
    document.body.innerHTML = dom;
    try { localStorage.clear(); } catch { /* ignore */ }
    window.history.replaceState({}, '', '/');

    const mod = await import('../scripts/simple-install.js');
    return { mod };
}

describe('WF-UX-016 — Simple mode freshness-unknown renders calm copy, never the raw labels', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('renders "Could not recheck for updates" (the calm title)', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.querySelector('[data-simple-install-status-title]').textContent)
            .toBe('Could not recheck for updates');
        expect(status.dataset.level).toBe('attention');
    });

    test('does NOT contain any raw freshness label, even when state.js hands in the raw message', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        // state.js may still pass the raw blocking reason as `message`; the hero
        // must ignore it for freshness-unknown and show only the calm copy.
        mod.renderStatus({
            reason: 'freshness-unknown',
            message: 'WebFlash could not confirm whether the firmware list is up to date. Use “Recheck manifest freshness” to retry.'
        });

        const rendered = document.querySelector('[data-simple-install-status]').textContent;
        for (const phrase of FORBIDDEN_SIMPLE) {
            expect(rendered).not.toContain(phrase);
        }
    });

    test('offers exactly Reload page + Continue with loaded firmware list', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const buttons = Array.from(
            document.querySelectorAll('[data-simple-install-action]')
        ).map(b => ({ action: b.dataset.simpleInstallAction, label: b.textContent }));
        expect(buttons).toEqual([
            { action: 'reload', label: 'Reload page' },
            { action: 'continue', label: 'Continue with loaded firmware list' }
        ]);
    });

    test('Continue drives the authoritative manifest-freshness acknowledgement (gate not bypassed)', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const ack = document.querySelector('[data-manifest-freshness-acknowledge]');
        expect(ack.checked).toBe(false);
        document.querySelector('[data-simple-install-action="continue"]').click();
        expect(ack.checked).toBe(true);
    });

    test('stale stays a hard block ("Cannot install yet"), Reload only, never Continue', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        const view = mod.describeReadiness({ reason: 'firmware-stale' });
        expect(view.level).toBe('blocked');
        expect(view.title).toBe('Cannot install yet');
        const actions = view.actions.map(a => a.action);
        expect(actions).toContain('reload');
        expect(actions).not.toContain('continue');
    });
});
