/**
 * WF-UX-013 — Reduce Simple install warning noise and deduplicate manifest
 * freshness messaging.
 *
 * Builds on WF-UX-011 / WF-UX-012. The Simple install path now reads calm:
 *   - the manifest-freshness "unknown" state surfaces in exactly ONE place (the
 *     hero status), in plain language ("Could not recheck for updates") with two
 *     calm actions — Reload page, Continue with loaded firmware list — and never
 *     as a repeated "Cannot install yet" warning,
 *   - the duplicate freshness / blocking surfaces (the freshness banner, the
 *     preflight verdict box, and the install-readiness helper rendered into the
 *     firmware section + the More-actions group) are suppressed in simple mode,
 *   - the scary "accept the risk" preflight acknowledgement is hidden by default
 *     in simple mode (it returns, unchanged, only when a real preflight warning
 *     remains); the calm safety confirmation lives in the hero,
 *   - the preflight diagnostics stay collapsed until "Setup checks" reveals them,
 *   - a truly stale manifest stays a hard block ("Cannot install yet"),
 *   - the freshness / safety GATES are untouched (Continue ticks the
 *     authoritative manifest-freshness acknowledgement, never bypasses it),
 *   - Advanced install keeps the full diagnostics, and no firmware / manifest /
 *     source / REQUIRED_CONFIGS / kits surface changed.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');
const CSS_PATH = path.resolve(REPO_ROOT, 'css/wizard-style.css');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf-8'));
}

/* ===========================================================================
   Part A — static markup + CSS contract (no scripts)
   =========================================================================== */
describe('WF-UX-013 — static markup + CSS contract', () => {
    let html = '';
    let css = '';

    beforeAll(() => {
        html = fs.readFileSync(HTML_PATH, 'utf-8');
        css = fs.readFileSync(CSS_PATH, 'utf-8');
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
    });

    describe('the hero is the single manifest-freshness surface (dedup)', () => {
        test('the duplicate freshness / blocking surfaces are suppressed in simple mode', () => {
            // Freshness banner + preflight verdict box (WF-UX-011/012) stay hidden.
            expect(css).toMatch(/\[data-install-mode="simple"\][^{]*\[data-freshness-banner-mount\]/);
            expect(css).toMatch(/\[data-install-mode="simple"\][^{]*\.preflight-panel__verdict/);
            // WF-UX-013 — the install-readiness helper (rendered into BOTH the
            // firmware section and the More-actions group) echoes the same
            // blocking sentence the hero shows; it is hidden in simple mode.
            expect(css).toMatch(/\[data-install-mode="simple"\][^{]*\[data-ready-helper\][^{]*\{[^}]*display:\s*none/);
        });

        test('the only always-on freshness surface left in the Simple path is the hero status', () => {
            // The hero owns a single, live status region for the freshness verdict.
            const statuses = document.querySelectorAll('[data-simple-install] [data-simple-install-status]');
            expect(statuses).toHaveLength(1);
            // The freshness preflight row still exists for diagnostics, but lives
            // inside the (collapsed) preflight details disclosure — never an
            // always-on second warning.
            const freshnessRow = document.querySelector('[data-preflight-item="manifest-freshness"]');
            expect(freshnessRow).not.toBeNull();
            expect(freshnessRow.closest('[data-preflight-details]')).not.toBeNull();
        });
    });

    describe('the scary "accept the risk" acknowledgement is removed from the Simple path by default', () => {
        test('simple mode hides the preflight warn-acknowledge by default', () => {
            expect(css).toMatch(
                /\[data-install-mode="simple"\][^{]*\.preflight-panel__warn-acknowledge[^{]*\{[^}]*display:\s*none/
            );
        });

        test('the original warn-acknowledge returns only when a real warning remains', () => {
            // The exception is gated on the real-warn context the controller sets.
            expect(css).toMatch(/data-install-warn-context="real-warn"[^{]*\.preflight-panel__warn-acknowledge/);
        });

        test('the original "accept the risk" control + copy still exist in the DOM (for Advanced / real warnings)', () => {
            const warnAck = document.querySelector('[data-preflight-warn-acknowledge]');
            expect(warnAck).not.toBeNull();
            expect(warnAck.textContent.toLowerCase()).toContain('accept the risk');
            expect(document.querySelector('[data-preflight-warn-acknowledge-input]')).not.toBeNull();
        });

        test('the hero safety confirmation is calm and never says "accept the risk"', () => {
            const confirm = document.querySelector('[data-simple-install-confirm]');
            expect(confirm).not.toBeNull();
            const label = confirm.closest('label');
            expect(label.textContent).toMatch(/Confirm before installing/i);
            expect(label.textContent).toMatch(/keep the hub powered and connected during installation/i);
            expect(label.textContent.toLowerCase()).not.toContain('accept the risk');
        });
    });

    describe('preflight diagnostics stay collapsed until Setup checks reveals them', () => {
        test('simple mode hides the preflight detail rows + diagnostics until the disclosure is explicitly revealed', () => {
            expect(css).toMatch(/data-setup-checks-revealed[^{]*\.preflight-panel__list/);
            expect(css).toMatch(/data-setup-checks-revealed[^{]*\.preflight-panel__diagnostics/);
            // The disclosure summary stays hidden in simple mode (WF-UX-012).
            expect(css).toMatch(/\[data-install-mode="simple"\][^{]*\.preflight-panel__details-summary/);
        });

        test('the diagnostic rows, the diagnostics bundle, and the freshness acknowledge control all live inside the disclosure', () => {
            const details = document.querySelector('[data-preflight-details]');
            expect(details).not.toBeNull();
            expect(details.querySelector('[data-preflight-list]')).not.toBeNull();
            expect(details.querySelector('[data-preflight-support-actions]')).not.toBeNull();
            expect(details.querySelector('[data-manifest-freshness-acknowledge]')).not.toBeNull();
        });
    });

    describe('support / debug metadata stays collapsed in the Simple path', () => {
        test('the hero technical details + the firmware target details remain disclosures, not always-on copy', () => {
            // Hero config-string / SKU stay behind a collapsed disclosure.
            const tech = document.querySelector('[data-simple-install-tech]');
            expect(tech.tagName).toBe('DETAILS');
            expect(tech.hasAttribute('open')).toBe(false);
        });

        test('hardware requirements live in the (simple-mode-hidden) summary card, not the install surface', () => {
            const hardware = document.querySelector('[data-hardware-summary]');
            expect(hardware).not.toBeNull();
            // It belongs to the module summary card, which simple mode hides
            // (sidebar / mobile summary), never the always-on hero.
            expect(hardware.closest('[data-simple-install]')).toBeNull();
        });
    });

    describe('Advanced install is untouched (every WF-UX-013 rule is simple-scoped)', () => {
        test('no dedup rule hides Advanced-install chrome (every display:none is simple-scoped or the legit [hidden] toggle)', () => {
            // For each dedup surface, every rule that sets display:none must be
            // EITHER scoped to data-install-mode="simple" (WF-UX-013) OR the
            // pre-existing mode-agnostic [hidden] toggle that state.js drives.
            // Anything else would hide the surface in the Advanced wizard too.
            const dedupSelectors = [
                '[data-ready-helper]',
                '.preflight-panel__warn-acknowledge'
            ];
            for (const selector of dedupSelectors) {
                const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const ruleRe = new RegExp(`([^{}]*${escaped}[^{]*)\\{[^}]*display:\\s*none[^}]*\\}`, 'g');
                const matches = css.match(ruleRe) || [];
                expect(matches.length).toBeGreaterThan(0);
                for (const rule of matches) {
                    const scoped = rule.includes('[data-install-mode="simple"]') || /\[hidden\]/.test(rule);
                    expect(scoped).toBe(true);
                }
            }
        });

        test('the full diagnostics surfaces survive in the DOM for the Advanced path', () => {
            expect(document.querySelector('[data-preflight-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-details]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-support-actions]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-warn-acknowledge]')).not.toBeNull();
            expect(document.querySelectorAll('[data-ready-helper]').length).toBeGreaterThan(0);
        });
    });
});

/* ===========================================================================
   Part B — controller behaviour (state.js / sw-update / a11y mocked)
   =========================================================================== */
const NOISE_DOM = `
    <div class="install-mode-bar" data-advanced-bar hidden aria-hidden="true">
        <button data-enter-simple>Back to simple install</button>
    </div>
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <div class="install-path-choice" data-install-path-choice role="group">
            <button type="button" data-install-path="simple" aria-pressed="true" class="is-active">Simple install</button>
            <button type="button" data-install-path="advanced" aria-pressed="false">Advanced install</button>
        </div>
        <div class="simple-install__card" data-simple-install-card>
            <h2 id="simple-install-heading">Sense360 Bathroom PoE Kit</h2>
            <div class="simple-install__status" data-simple-install-status data-level="pending" role="status">
                <p data-simple-install-status-title></p>
                <p data-simple-install-status-detail></p>
                <div data-simple-install-status-actions hidden></div>
            </div>
            <label class="simple-install__confirm">
                <input type="checkbox" data-simple-install-confirm>
                <span>Confirm before installing. I understand and will keep the hub powered and connected during installation.</span>
            </label>
            <details class="simple-install__tech" data-simple-install-tech><summary>Technical details</summary></details>
            <p data-simple-install-links>
                <button type="button" data-open-setup-checks>Setup checks</button>
                <button type="button" data-enter-advanced>Advanced install</button>
                <button type="button" data-rescue-open>Recovery</button>
            </p>
        </div>
    </section>
    <div id="step-5">
        <section class="review-task review-task--safety">
            <section class="preflight-panel" data-preflight-panel>
                <label class="preflight-panel__warn-acknowledge" data-preflight-warn-acknowledge hidden aria-hidden="true">
                    <input type="checkbox" data-preflight-warn-acknowledge-input>
                    <span>Accept preflight warnings and continue. I understand the warnings above and accept the risk of installing anyway.</span>
                </label>
                <details class="preflight-panel__details" data-preflight-details>
                    <summary class="preflight-panel__details-summary">Preflight details</summary>
                    <ul class="preflight-panel__list" data-preflight-list>
                        <li data-preflight-item="manifest-freshness">
                            <div data-manifest-freshness-actions hidden>
                                <label data-manifest-freshness-ack-control hidden>
                                    <input type="checkbox" data-manifest-freshness-acknowledge>
                                </label>
                            </div>
                        </li>
                    </ul>
                    <div class="preflight-panel__diagnostics" data-preflight-support-actions hidden></div>
                </details>
            </section>
            <label><input type="checkbox" data-preflash-acknowledge></label>
        </section>
        <div id="compatible-firmware"><p data-ready-helper></p></div>
        <div class="secondary-action-group"><p data-ready-helper></p></div>
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
    return { mod, setState, setStep, triggerSkipWaitingAndReload, announce };
}

describe('WF-UX-013 — calm plain-language unknown-freshness copy', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-install-warn-context');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('unknown freshness uses the required plain-language copy + two calm actions', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });

        expect(view.title).toBe('Could not recheck for updates');
        expect(view.detail).toBe(
            'WebFlash could not recheck the latest firmware list. Reload this page and try again. ' +
            'If this keeps happening, you can continue with the firmware list already loaded in this browser.'
        );

        // Exactly two calm actions: Reload page + Continue with loaded firmware list.
        expect(view.actions).toEqual([
            { action: 'reload', label: 'Reload page' },
            { action: 'continue', label: 'Continue with loaded firmware list' }
        ]);
    });

    test('unknown freshness never reads as "manifest", "Cannot install yet", or "accept the risk"', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });
        const text = `${view.title} ${view.detail}`.toLowerCase();
        expect(text).not.toContain('manifest');
        expect(text).not.toContain('cannot install');
        expect(text).not.toContain('accept the risk');
        // Unknown is NOT stale — it stays "needs attention", not a hard block.
        expect(view.level).toBe('attention');
    });

    test('a truly stale manifest stays a hard block with a Reload action', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'firmware-stale' });
        expect(view.level).toBe('blocked');
        expect(view.title).toBe('Cannot install yet');
        expect(view.actions.map(a => a.action)).toContain('reload');
        // The stale block must NOT offer a "continue anyway" override.
        expect(view.actions.map(a => a.action)).not.toContain('continue');
    });
});

describe('WF-UX-013 — the hero is the single freshness surface + drives the warn context', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-install-warn-context');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('rendering unknown freshness shows the calm hero status with Reload + Continue', async () => {
        const { mod } = await loadController({ dom: NOISE_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.dataset.level).toBe('attention');
        expect(status.querySelector('[data-simple-install-status-title]').textContent)
            .toBe('Could not recheck for updates');

        const actions = Array.from(status.querySelectorAll('[data-simple-install-action]'))
            .map(b => b.dataset.simpleInstallAction)
            .sort();
        expect(actions).toEqual(['continue', 'reload']);
    });

    test('the calm freshness state keeps the scary warn-acknowledge context off', async () => {
        const { mod } = await loadController({ dom: NOISE_DOM });
        mod.applyMode('simple', { persist: false });

        mod.renderStatus({ reason: 'freshness-unknown' });
        expect(document.documentElement.getAttribute('data-install-warn-context')).toBe('calm');

        // A genuine preflight warning flips the context so the original control returns.
        mod.renderStatus({ reason: 'preflight-warn' });
        expect(document.documentElement.getAttribute('data-install-warn-context')).toBe('real-warn');

        // Ready clears the warn context again.
        mod.renderStatus({ reason: 'ready' });
        expect(document.documentElement.getAttribute('data-install-warn-context')).toBe('calm');
    });
});

describe('WF-UX-013 — Continue backs the freshness gate (never bypasses it)', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-install-warn-context');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('clicking "Continue with loaded firmware list" ticks the authoritative manifest-freshness acknowledgement', async () => {
        const { mod } = await loadController({ dom: NOISE_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const ack = document.querySelector('[data-manifest-freshness-acknowledge]');
        expect(ack.checked).toBe(false);
        let changeFired = false;
        ack.addEventListener('change', () => { changeFired = true; });

        const continueBtn = document.querySelector('[data-simple-install-action="continue"]');
        expect(continueBtn).not.toBeNull();
        continueBtn.click();

        // The gate's own control is ticked and notified — state.js stays authoritative.
        expect(ack.checked).toBe(true);
        expect(changeFired).toBe(true);
    });

    test('Continue only touches the freshness acknowledgement — the safety acknowledgement stays untouched', async () => {
        const { mod } = await loadController({ dom: NOISE_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const preflash = document.querySelector('[data-preflash-acknowledge]');
        expect(preflash.checked).toBe(false);

        document.querySelector('[data-simple-install-action="continue"]').click();

        // Acknowledging freshness must not auto-accept the separate safety gate.
        expect(preflash.checked).toBe(false);
    });

    test('the Continue acknowledgement helper no-ops gracefully when the control is absent', async () => {
        const { mod } = await loadController({ dom: NOISE_DOM });
        document.querySelector('[data-manifest-freshness-acknowledge]').closest('[data-preflight-details]').remove();
        // Must not throw when the freshness control is not on the page.
        expect(() => mod.__testHooks.acknowledgeLoadedFirmwareList()).not.toThrow();
        expect(mod.__testHooks.acknowledgeLoadedFirmwareList()).toBe(false);
    });
});

describe('WF-UX-013 — Setup checks reveals the otherwise-collapsed diagnostics', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-install-warn-context');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('Setup checks opens the preflight disclosure AND marks it explicitly revealed', async () => {
        const { mod } = await loadController({ dom: NOISE_DOM });
        mod.applyMode('simple', { persist: false });

        const details = document.querySelector('#step-5 [data-preflight-details]');
        // Collapsed by default and NOT yet marked revealed (so simple-mode CSS hides the rows).
        expect(details.hasAttribute('data-setup-checks-revealed')).toBe(false);

        document.querySelector('[data-open-setup-checks]').click();

        expect(details.open).toBe(true);
        expect(details.getAttribute('data-setup-checks-revealed')).toBe('true');
    });
});

/* ===========================================================================
   Part C — no-change invariants (firmware / manifest / policy surfaces)
   =========================================================================== */
describe('WF-UX-013 — presentation-only: firmware / manifest / policy surfaces unchanged', () => {
    test('manifest carries Release-One stable + four preview builds + Rescue', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(6);
        const configs = manifest.builds.map(b => b.config_string).sort();
        expect(configs).toEqual([
            'Ceiling-POE-AirIQ-RoomIQ',
            'Ceiling-POE-RoomIQ',
            'Ceiling-POE-RoomIQ-LED',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-VentIQ-RoomIQ-LED',
            'Rescue'
        ]);
    });

    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = fs.readFileSync(
            path.resolve(REPO_ROOT, '.github/workflows/firmware-publish.yml'),
            'utf-8'
        );
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('firmware/sources.json declares Release-One + four preview sources, no fan driver', () => {
        const sources = readJson('firmware/sources.json');
        const cfgs = (sources.sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
    });

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('the simple-install controller imports no release-channel / provenance / freshness gate module', () => {
        const controller = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/simple-install.js'), 'utf-8');
        expect(controller).not.toMatch(/release-channels/);
        expect(controller).not.toMatch(/firmware-provenance/);
        expect(controller).not.toMatch(/manifest-freshness['"]/);
    });
});
