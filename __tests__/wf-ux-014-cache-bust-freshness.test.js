/**
 * WF-UX-014 — Fix the deployed Simple-install freshness-unknown copy and
 * cache-bust the runtime modules.
 *
 * WF-UX-013 already landed the calm Simple-install freshness copy in
 * scripts/simple-install.js. The bug it fixed was still visible on the live
 * GitHub Pages site because the JS module was served stale: index.html + CSS
 * (versioned / always-revalidated) deployed, but the bare ES module import of
 * scripts/simple-install.js kept serving the pre-WF-UX-013 "Cannot install yet"
 * copy from the browser/CDN/service-worker cache. WF-UX-014 is therefore a
 * deploy-layer fix:
 *
 *   - The customer-facing Simple-install freshness contract is re-pinned here so
 *     the deployed copy can never regress (Could not recheck for updates +
 *     Reload page / Continue; never "Cannot install yet" or "manifest"; stale
 *     stays a hard block with no continue; Advanced keeps full diagnostics).
 *   - The changed runtime module is cache-busted: app.js imports
 *     simple-install.js with a `?v=` token, index.html versions the bootstrap
 *     loader + CSS with the same token, bootstrap.js threads the token to app.js,
 *     and sw.js bumps CACHE_NAME so existing installs re-prime.
 *   - A support-only app-shell build marker (meta tags + diagnostics bundle +
 *     About panel) makes it easy to tell whether the live page is the
 *     post-WF-UX-014 app shell or a stale copy.
 *
 * Pure deploy-layer + presentation: no firmware / manifest / sources /
 * REQUIRED_CONFIGS / kits / install-gate change.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');
const APP_JS_PATH = path.resolve(REPO_ROOT, 'app.js');
const BOOTSTRAP_PATH = path.resolve(REPO_ROOT, 'scripts/bootstrap.js');
const SW_PATH = path.resolve(REPO_ROOT, 'sw.js');
const CSS_PATH = path.resolve(REPO_ROOT, 'css/wizard-style.css');

const read = (p) => fs.readFileSync(p, 'utf-8');

/* ===========================================================================
   Part A — Simple-install freshness copy contract (controller behaviour)

   Re-pins the WF-UX-013 mapping that WF-UX-014 is re-deploying, so the copy the
   live page will finally serve is exactly the calm copy and never the old one.
   =========================================================================== */

const HERO_DOM = `
    <div class="install-mode-bar" data-advanced-bar hidden aria-hidden="true">
        <button data-enter-simple>Back to simple install</button>
    </div>
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

    jest.unstable_mockModule('../scripts/state.js', () => ({
        setState,
        setStep,
        getMaxReachableStep
    }));
    jest.unstable_mockModule('../scripts/services/sw-update.js', () => ({
        triggerSkipWaitingAndReload,
        getServiceWorkerState: () => ({ updateAvailable: false, updateDismissed: false }),
        subscribeServiceWorkerState: () => () => {}
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({ announce }));

    document.documentElement.removeAttribute('data-install-mode');
    document.documentElement.removeAttribute('data-install-warn-context');
    document.body.innerHTML = dom;

    try { localStorage.clear(); } catch { /* ignore */ }
    window.history.replaceState({}, '', '/');

    const mod = await import('../scripts/simple-install.js');
    return { mod, triggerSkipWaitingAndReload };
}

describe('WF-UX-014 — Simple mode freshness-unknown renders the calm copy', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-install-warn-context');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('freshness-unknown renders "Could not recheck for updates" with the required body', async () => {
        const { mod } = await loadController();
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });
        expect(view.title).toBe('Could not recheck for updates');
        expect(view.detail).toBe(
            'WebFlash could not recheck the latest firmware list. Reload this page and try again. ' +
            'If this keeps happening, you can continue with the firmware list already loaded in this browser.'
        );
        expect(view.level).toBe('attention');
    });

    test('freshness-unknown does NOT render "Cannot install yet"', async () => {
        const { mod } = await loadController();
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });
        const text = `${view.title} ${view.detail}`.toLowerCase();
        expect(text).not.toContain('cannot install');
    });

    test('freshness-unknown does NOT render "manifest" (or the old "could not confirm" copy)', async () => {
        const { mod } = await loadController();
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });
        const text = `${view.title} ${view.detail}`.toLowerCase();
        expect(text).not.toContain('manifest');
        expect(text).not.toContain('could not confirm whether the firmware list');
        expect(text).not.toContain('accept the risk');
    });

    test('freshness-unknown offers exactly Reload page + Continue with loaded firmware list', async () => {
        const { mod } = await loadController();
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });
        expect(view.actions).toEqual([
            { action: 'reload', label: 'Reload page' },
            { action: 'continue', label: 'Continue with loaded firmware list' }
        ]);
    });

    test('rendering freshness-unknown into the hero produces the calm title + Reload/Continue buttons', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown', message: 'WebFlash could not confirm whether the firmware list is up to date.' });

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.dataset.level).toBe('attention');
        expect(status.querySelector('[data-simple-install-status-title]').textContent)
            .toBe('Could not recheck for updates');
        // Even though state.js handed in the old "could not confirm…" message, the
        // Simple hero ignores it for freshness-unknown and shows the calm copy.
        const rendered = status.textContent.toLowerCase();
        expect(rendered).not.toContain('cannot install');
        expect(rendered).not.toContain('manifest');

        const actions = Array.from(status.querySelectorAll('[data-simple-install-action]'))
            .map(b => b.dataset.simpleInstallAction)
            .sort();
        expect(actions).toEqual(['continue', 'reload']);
    });

    test('Continue ticks the authoritative manifest-freshness acknowledgement (gate not bypassed)', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const ack = document.querySelector('[data-manifest-freshness-acknowledge]');
        expect(ack.checked).toBe(false);
        document.querySelector('[data-simple-install-action="continue"]').click();
        expect(ack.checked).toBe(true);
    });
});

describe('WF-UX-014 — Simple mode stale stays a hard block with no continue override', () => {
    afterEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('firmware-stale is a hard block ("Cannot install yet"), Reload only, never Continue', async () => {
        const { mod } = await loadController();
        const view = mod.describeReadiness({ reason: 'firmware-stale' });
        expect(view.level).toBe('blocked');
        expect(view.title).toBe('Cannot install yet');
        const actions = view.actions.map(a => a.action);
        expect(actions).toContain('reload');
        expect(actions).not.toContain('continue');
    });

    test('stale and unknown are genuinely different verdicts (severity + override)', async () => {
        const { mod } = await loadController();
        const stale = mod.describeReadiness({ reason: 'firmware-stale' });
        const unknown = mod.describeReadiness({ reason: 'freshness-unknown' });
        // Unknown is calm (attention, offers continue); stale is a hard block.
        expect(unknown.level).toBe('attention');
        expect(stale.level).toBe('blocked');
        expect(unknown.actions.map(a => a.action)).toContain('continue');
        expect(stale.actions.map(a => a.action)).not.toContain('continue');
    });
});

/* ===========================================================================
   Part B — Advanced install still shows full diagnostics
   =========================================================================== */
describe('WF-UX-014 — Advanced install keeps the full diagnostics surface', () => {
    let html = '';
    let css = '';
    beforeAll(() => {
        html = read(HTML_PATH);
        css = read(CSS_PATH);
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
    });

    test('the preflight panel + details + support actions + warn-acknowledge survive in the DOM', () => {
        expect(document.querySelector('[data-preflight-panel]')).not.toBeNull();
        expect(document.querySelector('[data-preflight-details]')).not.toBeNull();
        expect(document.querySelector('[data-preflight-support-actions]')).not.toBeNull();
        expect(document.querySelector('[data-preflight-warn-acknowledge]')).not.toBeNull();
        expect(document.querySelectorAll('[data-ready-helper]').length).toBeGreaterThan(0);
    });

    test('every dedup display:none on the diagnostics surfaces is simple-scoped (Advanced keeps them)', () => {
        // Mirrors the WF-UX-013 guard: each rule hiding a dedup surface must be
        // scoped to data-install-mode="simple" (or the legit [hidden] toggle),
        // so the Advanced wizard never loses the surface.
        for (const selector of ['[data-ready-helper]', '.preflight-panel__warn-acknowledge']) {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const ruleRe = new RegExp(`([^{}]*${escaped}[^{]*)\\{[^}]*display:\\s*none[^}]*\\}`, 'g');
            const matches = css.match(ruleRe) || [];
            expect(matches.length).toBeGreaterThan(0);
            for (const rule of matches) {
                expect(rule.includes('[data-install-mode="simple"]') || /\[hidden\]/.test(rule)).toBe(true);
            }
        }
    });
});

/* ===========================================================================
   Part C — Cache-bust references for the changed runtime modules

   The core WF-UX-014 contract: the changed runtime module must be referenced
   with an updated version query so Pages/CDN/the SW cannot serve it stale.
   =========================================================================== */
describe('WF-UX-014 — cache-busted script references carry an updated version query', () => {
    const html = read(HTML_PATH);
    const appJs = read(APP_JS_PATH);
    const bootstrap = read(BOOTSTRAP_PATH);
    const sw = read(SW_PATH);

    const tokenFrom = (re, src) => {
        const m = src.match(re);
        return m ? m[1] : null;
    };

    test('app.js imports the changed runtime module simple-install.js with a ?v= cache-bust query', () => {
        expect(appJs).toMatch(/import\s+["']\.\/scripts\/simple-install\.js\?v=\d+["']/);
    });

    test('index.html versions the bootstrap loader so the always-fresh HTML refetches the module graph', () => {
        expect(html).toMatch(/src="\.\/scripts\/bootstrap\.js\?v=\d+"/);
    });

    test('bootstrap.js threads the cache-bust token onto the app.js import', () => {
        expect(bootstrap).toMatch(/APP_SHELL_BUILD\s*=\s*['"]\d+['"]/);
        // The dynamic import must actually use the token, not just declare it.
        expect(bootstrap).toMatch(/import\(`?\$\{scriptPath\}\?v=\$\{APP_SHELL_BUILD\}`?\)/);
    });

    test('index.html CSS links carry the bumped ?v= token (no longer the stale 20260515)', () => {
        expect(html).toMatch(/wizard-style\.css\?v=\d+/);
        expect(html).toMatch(/layout\.css\?v=\d+/);
        expect(html).not.toContain('?v=20260515');
    });

    test('the cache-bust token is consistent across index.html, bootstrap.js, and app.js', () => {
        const bootstrapTag = tokenFrom(/bootstrap\.js\?v=(\d+)/, html);
        const cssToken = tokenFrom(/wizard-style\.css\?v=(\d+)/, html);
        const appShellBuild = tokenFrom(/APP_SHELL_BUILD\s*=\s*['"](\d+)['"]/, bootstrap);
        const moduleToken = tokenFrom(/simple-install\.js\?v=(\d+)/, appJs);

        expect(bootstrapTag).not.toBeNull();
        expect(bootstrapTag).toBe(cssToken);
        expect(bootstrapTag).toBe(appShellBuild);
        expect(bootstrapTag).toBe(moduleToken);
    });

    test('sw.js CACHE_NAME is bumped past the stale webflash-v5 so installs re-prime', () => {
        const m = sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/);
        expect(m).not.toBeNull();
        expect(Number(m[1])).toBeGreaterThanOrEqual(6);
    });

    test('sw.js keeps the per-asset-class fetch strategy (cache-name bump is version-only)', () => {
        // Network-first for .bin + manifests, stale-while-revalidate for the shell
        // must all still be present — WF-UX-014 only changed the cache version.
        expect(sw).toMatch(/url\.pathname\.endsWith\('\.bin'\)/);
        expect(sw).toMatch(/url\.pathname\.endsWith\('manifest\.json'\)/);
        expect(sw).toMatch(/stale-while-revalidate/i);
    });
});

/* ===========================================================================
   Part D — support-only app-shell build marker
   =========================================================================== */
describe('WF-UX-014 — app-shell build marker (support-only)', () => {
    test('index.html ships the support-only build-marker meta tags', () => {
        const html = read(HTML_PATH);
        expect(html).toMatch(/<meta\s+name="webflash-app-version"\s+content="[^"]+">/);
        expect(html).toMatch(/<meta\s+name="webflash-app-shell"\s+content="[^"]+">/);
    });

    test('the app-shell marker matches the ?v= cache-bust token (date with/without dashes)', () => {
        const html = read(HTML_PATH);
        const appJs = read(APP_JS_PATH);
        const shell = html.match(/name="webflash-app-shell"\s+content="([^"]+)"/)[1];
        const moduleToken = appJs.match(/simple-install\.js\?v=(\d+)/)[1];
        // e.g. "2026-06-01" <-> "20260601": same build, two formats.
        expect(shell.replace(/-/g, '')).toBe(moduleToken);
    });

    test('build-info.js exports the bumped appVersion + an appShell marker', () => {
        const buildInfo = read(path.resolve(REPO_ROOT, 'scripts/build-info.js'));
        expect(buildInfo).toMatch(/appShell:\s*['"][^'"]+['"]/);
        // appVersion bumped off the pre-WF-UX-014 1.0.0 fallback so the live
        // About panel / support bundle visibly differ from a stale page.
        expect(buildInfo).toMatch(/appVersion:\s*['"]1\.0\.1['"]/);
    });

    test('diagnostics support bundle surfaces app_shell from the meta tag, falling back to "unknown"', async () => {
        jest.resetModules();
        jest.unstable_mockModule('../scripts/capabilities.js', () => ({
            detectCapabilities: jest.fn(() => ({ ua: '', browser: 'chrome', isSupported: true })),
            evaluateBrowserReadiness: jest.fn(() => ({ level: 'ok', reasons: [], capabilities: {} }))
        }));
        jest.unstable_mockModule('../scripts/utils/flash-history.js', () => ({
            getFlashHistory: jest.fn(() => []),
            recordFlashStart: jest.fn(), recordFlashSuccess: jest.fn(),
            recordFlashError: jest.fn(), exportFlashHistoryText: jest.fn()
        }));
        jest.unstable_mockModule('../scripts/utils/firmware-provenance.js', () => ({
            validateFirmwareProvenance: jest.fn(() => ({ status: 'pass' }))
        }));
        jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({ downloadJsonFile: jest.fn(() => true) }));
        jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({ copyTextToClipboard: jest.fn() }));

        const { buildSupportBundle } = await import('../scripts/services/diagnostics.js');

        // No meta present → graceful fallback.
        document.head.innerHTML = '';
        expect(buildSupportBundle().app).toHaveProperty('app_shell', 'unknown');

        // Meta present (as on the live page) → reported verbatim.
        document.head.innerHTML = '<meta name="webflash-app-shell" content="2026-06-01">';
        expect(buildSupportBundle().app.app_shell).toBe('2026-06-01');
        document.head.innerHTML = '';
    });

    test('the About panel renders an "App shell" row from BUILD_INFO', async () => {
        jest.resetModules();
        jest.unstable_mockModule('../scripts/services/cache-clear.js', () => ({
            clearWebFlashCache: jest.fn(() => Promise.resolve())
        }));
        const aboutMod = await import('../scripts/layout/about-panel.js');
        const buildInfoMod = await import('../scripts/build-info.js');

        const mount = document.createElement('div');
        aboutMod.__testHooks.renderInto(mount, null);

        const shellCell = mount.querySelector('[data-about="about-app-shell"]');
        expect(shellCell).not.toBeNull();
        expect(shellCell.textContent).toBe(String(buildInfoMod.BUILD_INFO.appShell));
        expect(shellCell.textContent).not.toBe('unknown');
    });
});

/* ===========================================================================
   Part E — presentation/deploy-layer only: no policy surfaces changed
   =========================================================================== */
describe('WF-UX-014 — deploy-layer + presentation only', () => {
    const readJson = (rel) => JSON.parse(read(path.resolve(REPO_ROOT, rel)));

    test('manifest carries Release-One stable + four preview builds + Rescue', () => {
        const configs = readJson('manifest.json').builds.map(b => b.config_string).sort();
        expect(configs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED', 'Rescue']);
    });

    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = read(path.resolve(REPO_ROOT, '.github/workflows/firmware-publish.yml'));
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('the simple-install controller still imports no release-channel / provenance / freshness-gate module', () => {
        const controller = read(path.resolve(REPO_ROOT, 'scripts/simple-install.js'));
        expect(controller).not.toMatch(/release-channels/);
        expect(controller).not.toMatch(/firmware-provenance/);
        expect(controller).not.toMatch(/manifest-freshness['"]/);
    });
});
