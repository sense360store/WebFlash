/**
 * WF-UX-011 — Simple install mode for the stable Bathroom PoE kit.
 *
 * Adds a default product-focused "Simple install" landing for the stable
 * Sense360 Bathroom PoE kit that minimises choices and hides technical /
 * planning detail, while reusing the Step 5 install surface and preserving
 * every install gate. The full wizard is preserved behind "Advanced setup".
 *
 * These pins lock the WF-UX-011 contract:
 *   - the default page leads with the simple install path (hero precedes the
 *     wizard) and the install mode is controlled by data-install-mode,
 *   - the default path is product-focused and does not expose the config
 *     string / SKU unless "Technical details" is expanded,
 *   - Advanced setup (the full wizard) remains available,
 *   - the ESP Web Tools install button is the main action and the secondary
 *     actions (Download .bin / Copy install link / Open Home Assistant /
 *     Recovery) stay collapsed,
 *   - the readiness status is plain language (Ready / Needs attention / Cannot
 *     install yet), unknown freshness reads in plain language and avoids
 *     "manifest" wording, stale freshness stays a hard block,
 *   - the install-gate surfaces (preflight panel, channel acknowledgement
 *     panel, pre-flash checklist, freshness banner mount) are preserved,
 *   - LED stays preview-only (acknowledgement required), every fan variant
 *     stays non-installable, Rescue stays available,
 *   - no firmware / manifest / source / REQUIRED_CONFIGS / kits surface changed.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf-8'));
}

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

/* ===========================================================================
   Part A — static markup contract (loads the real index.html body, no scripts)
   =========================================================================== */
describe('WF-UX-011 — static markup', () => {
    let html = '';

    beforeAll(() => {
        html = fs.readFileSync(HTML_PATH, 'utf-8');
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
    });

    describe('the simple install path is the default first surface', () => {
        test('a simple-install hero exists and precedes the wizard step-1', () => {
            const hero = document.querySelector('[data-simple-install]');
            expect(hero).not.toBeNull();
            const step1 = document.getElementById('step-1');
            expect(step1).not.toBeNull();
            // Hero precedes the first wizard step in DOM order.
            expect(hero.compareDocumentPosition(step1) & FOLLOWING).toBeTruthy();
        });

        test('the hero leads with the product name and a single dominant install framing', () => {
            const hero = document.querySelector('[data-simple-install]');
            const heading = hero.querySelector('#simple-install-heading');
            expect(heading).not.toBeNull();
            expect(heading.textContent.trim()).toBe('Sense360 Bathroom PoE Kit');

            // The simple-mode install CTA names "Install stable firmware".
            const cta = document.querySelector('[data-simple-install-cta]');
            expect(cta).not.toBeNull();
            expect(cta.textContent).toMatch(/Install stable firmware/i);
        });

        test('the product summary is outcome-focused: Core, RoomIQ, VentIQ, PoE', () => {
            const hero = document.querySelector('[data-simple-install]');
            const items = Array.from(hero.querySelectorAll('.simple-install__summary-item'))
                .map(li => li.textContent.trim());
            expect(items.length).toBe(4);
            const joined = items.join(' | ');
            expect(joined).toMatch(/Sense360 Core/);
            expect(joined).toMatch(/RoomIQ/);
            expect(joined).toMatch(/VentIQ/);
            expect(joined).toMatch(/PoE|Power over Ethernet/);
        });
    });

    describe('default path hides the config string / SKU until Technical details is opened', () => {
        test('the config string and kit SKU live inside a collapsed Technical details disclosure', () => {
            const hero = document.querySelector('[data-simple-install]');
            const tech = hero.querySelector('[data-simple-install-tech]');
            expect(tech).not.toBeNull();
            expect(tech.tagName).toBe('DETAILS');
            // Collapsed by default — nothing technical is exposed up front.
            expect(tech.hasAttribute('open')).toBe(false);

            const config = hero.querySelector('[data-simple-install-tech-config]');
            const sku = hero.querySelector('[data-simple-install-tech-sku]');
            expect(config).not.toBeNull();
            expect(sku).not.toBeNull();
            expect(config.textContent).toContain('Ceiling-POE-VentIQ-RoomIQ');
            expect(sku.textContent).toContain('S360-KIT-BATH-POE');
            // Both must be inside the Technical details disclosure.
            expect(tech.contains(config)).toBe(true);
            expect(tech.contains(sku)).toBe(true);
        });

        test('no config string or SKU leaks into the always-visible hero copy', () => {
            const hero = document.querySelector('[data-simple-install]');
            const tech = hero.querySelector('[data-simple-install-tech]');
            // Remove the disclosure, then assert the remaining (always-visible)
            // hero text carries no config string and no internal SKU token.
            const clone = hero.cloneNode(true);
            const clonedTech = clone.querySelector('[data-simple-install-tech]');
            if (clonedTech) {
                clonedTech.remove();
            }
            const visibleText = clone.textContent;
            expect(visibleText).not.toMatch(/Ceiling-POE-VentIQ-RoomIQ/);
            expect(visibleText).not.toMatch(/S360-/);
        });
    });

    describe('Advanced setup remains available', () => {
        test('the hero exposes an Advanced install affordance', () => {
            // WF-UX-012 renamed the hero affordance to "Advanced install" and
            // promoted it into the first-choice path picker; a quiet
            // [data-enter-advanced] secondary link is also kept available.
            const advanced = document.querySelector('[data-simple-install] [data-enter-advanced]');
            expect(advanced).not.toBeNull();
            expect(advanced.textContent).toMatch(/Advanced install/i);
        });

        test('an advanced-mode bar offers a way back to simple install', () => {
            const bar = document.querySelector('[data-advanced-bar]');
            expect(bar).not.toBeNull();
            const back = bar.querySelector('[data-enter-simple]');
            expect(back).not.toBeNull();
            expect(back.textContent).toMatch(/simple/i);
        });

        test('the full wizard surfaces survive (steps, bundle presets, start paths, module picker)', () => {
            for (let i = 1; i <= 5; i++) {
                expect(document.getElementById(`step-${i}`)).not.toBeNull();
            }
            expect(document.querySelector('[data-bundle-presets]')).not.toBeNull();
            expect(document.querySelector('[data-start-paths]')).not.toBeNull();
            expect(document.querySelector('[data-start-path="custom"]')).not.toBeNull();
            // Module picker + LED preview + planned (fan) kits remain in the wizard.
            expect(document.getElementById('roomiq-module-section')).not.toBeNull();
            expect(document.getElementById('led-module-section')).not.toBeNull();
            expect(document.querySelector('[data-bundle-presets-planned]')).not.toBeNull();
        });
    });

    describe('install section: ESP Web Tools main action + collapsed secondary actions', () => {
        test('the dynamic ESP Web Tools mount and the secondary-action group are preserved', () => {
            // The install button is rendered into #compatible-firmware by state.js.
            expect(document.getElementById('compatible-firmware')).not.toBeNull();
            const group = document.querySelector('.secondary-action-group');
            expect(group).not.toBeNull();
        });

        test('Download / Copy / Open Home Assistant / Recovery stay collapsed in disclosures', () => {
            expect(document.querySelector('[data-secondary-section="install-options"]').tagName).toBe('DETAILS');
            expect(document.querySelector('[data-secondary-section="home-assistant"]').tagName).toBe('DETAILS');
            expect(document.querySelector('[data-secondary-section="recovery"]').tagName).toBe('DETAILS');

            expect(document.getElementById('download-btn')).not.toBeNull();
            expect(document.getElementById('copy-firmware-url-btn')).not.toBeNull();
            expect(document.getElementById('open-ha-integrations-btn')).not.toBeNull();
        });

        test('Rescue / Recovery stays available from the header, Step 1, and the install section', () => {
            expect(document.querySelector('[data-rescue-header-trigger]')).not.toBeNull();
            expect(document.querySelector('[data-start-path="recovery"]')).not.toBeNull();
            expect(document.querySelector('[data-review-recovery-open]')).not.toBeNull();
        });
    });

    describe('install-gate surfaces are preserved', () => {
        test('preflight panel, channel acknowledgement panel, pre-flash checklist, and freshness banner mount survive', () => {
            expect(document.querySelector('[data-preflight-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-details]')).not.toBeNull();
            expect(document.querySelector('[data-channel-acknowledgement-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflash-acknowledge]')).not.toBeNull();
            // The freshness gate's banner mount is untouched (gating intact); the
            // simple view suppresses it visually and surfaces freshness in the hero.
            expect(document.querySelector('[data-freshness-banner-mount]')).not.toBeNull();
        });
    });
});

/* ===========================================================================
   Part B — controller behaviour (state.js / sw-update / a11y mocked)
   =========================================================================== */
const HERO_DOM = `
    <div class="install-mode-bar" data-advanced-bar hidden aria-hidden="true">
        <button data-enter-simple>Back to simple install</button>
    </div>
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <h2 id="simple-install-heading">Sense360 Bathroom PoE Kit</h2>
        <div class="simple-install__status" data-simple-install-status data-level="pending" role="status">
            <p data-simple-install-status-title></p>
            <p data-simple-install-status-detail></p>
            <div data-simple-install-status-actions hidden></div>
        </div>
        <details class="simple-install__tech" data-simple-install-tech><summary>Technical details</summary></details>
        <button data-enter-advanced>Advanced setup</button>
    </section>
    <div id="step-5">
        <details data-preflight-details><summary>Preflight details</summary></details>
    </div>
`;

async function loadController({ dom = '', search = '', stored = null } = {}) {
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
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({
        announce
    }));

    document.documentElement.removeAttribute('data-install-mode');
    document.body.innerHTML = dom;

    try {
        localStorage.clear();
    } catch { /* ignore */ }
    if (stored) {
        localStorage.setItem('webflash-install-mode', stored);
    }
    window.history.replaceState({}, '', '/' + (search ? `?${search}` : ''));

    const mod = await import('../scripts/simple-install.js');
    return { mod, setState, setStep, getMaxReachableStep, triggerSkipWaitingAndReload, announce };
}

describe('WF-UX-011 — initial mode resolution', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('defaults to simple with a clean URL and no stored preference', async () => {
        const { mod } = await loadController({ dom: '' });
        expect(mod.resolveInitialMode()).toBe('simple');
    });

    test('an explicit wizard path (configmode=custom) opens advanced', async () => {
        const { mod } = await loadController({ dom: '', search: 'configmode=custom' });
        expect(mod.resolveInitialMode()).toBe('advanced');
    });

    test('a non-stable preset deep link (LED preview) opens advanced', async () => {
        const { mod } = await loadController({ dom: '', search: 'preset=S360-KIT-BATH-POE-LED' });
        expect(mod.resolveInitialMode()).toBe('advanced');
    });

    test('the stable preset deep link stays simple', async () => {
        const { mod } = await loadController({ dom: '', search: 'preset=S360-KIT-BATH-POE' });
        expect(mod.resolveInitialMode()).toBe('simple');
    });

    test('installmode override and stored preference are honoured', async () => {
        const overrideAdvanced = await loadController({ dom: '', search: 'installmode=advanced' });
        expect(overrideAdvanced.mod.resolveInitialMode()).toBe('advanced');

        const overrideSimple = await loadController({ dom: '', search: 'installmode=simple&configmode=custom' });
        expect(overrideSimple.mod.resolveInitialMode()).toBe('simple');

        const storedAdvanced = await loadController({ dom: '', stored: 'advanced' });
        expect(storedAdvanced.mod.resolveInitialMode()).toBe('advanced');
    });
});

describe('WF-UX-011 — applying the install modes', () => {
    test('entering simple applies the stable Release-One preset and lands on the review step', async () => {
        const { mod, setState, setStep } = await loadController({ dom: HERO_DOM });
        setState.mockClear();
        setStep.mockClear();

        mod.applyMode('simple', { persist: false });

        expect(document.documentElement.getAttribute('data-install-mode')).toBe('simple');
        expect(setState).toHaveBeenCalledTimes(1);
        const applied = setState.mock.calls[0][0];
        // The stable Bathroom PoE kit: PoE power, VentIQ + RoomIQ, no LED, no fan.
        expect(applied.power).toBe('poe');
        expect(applied.ventiq).toBe('ventiq');
        expect(applied.roomiq).toBe('roomiq');
        expect(applied.led).toBe('none');
        expect(applied.fan).toBe('none');
        // Advances to the review/install step (capped at the reachable step).
        expect(setStep).toHaveBeenCalledWith(5, { animate: false });

        const hero = document.querySelector('[data-simple-install]');
        const bar = document.querySelector('[data-advanced-bar]');
        expect(hero.hidden).toBe(false);
        expect(bar.hidden).toBe(true);
    });

    test('entering advanced reveals the wizard from step 1 and never re-applies a preset', async () => {
        const { mod, setState, setStep } = await loadController({ dom: HERO_DOM });
        setState.mockClear();
        setStep.mockClear();

        mod.applyMode('advanced', { persist: false });

        expect(document.documentElement.getAttribute('data-install-mode')).toBe('advanced');
        expect(setState).not.toHaveBeenCalled();
        expect(setStep).toHaveBeenCalledWith(1, { animate: false });

        const hero = document.querySelector('[data-simple-install]');
        const bar = document.querySelector('[data-advanced-bar]');
        expect(hero.hidden).toBe(true);
        expect(bar.hidden).toBe(false);
    });

    test('the Advanced setup / Back-to-simple controls toggle the mode via delegation', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });

        document.querySelector('[data-enter-advanced]').click();
        expect(document.documentElement.getAttribute('data-install-mode')).toBe('advanced');

        document.querySelector('[data-enter-simple]').click();
        expect(document.documentElement.getAttribute('data-install-mode')).toBe('simple');
    });
});

describe('WF-UX-011 — plain-language readiness status', () => {
    test('the three customer-facing statuses map from the gate verdict', async () => {
        const { mod } = await loadController({ dom: '' });
        expect(mod.describeReadiness({ reason: 'ready' }).title).toBe('Ready to install');
        // WF-UX-015 — an unticked safety confirmation reads "Confirm before
        // installing" (a calm, expected step), not "Needs attention".
        expect(mod.describeReadiness({ reason: 'safety-checklist' }).title).toBe('Confirm before installing');
        expect(mod.describeReadiness({ reason: 'preflight-fail' }).title).toBe('Cannot install yet');
    });

    test('stale freshness is a hard block ("Cannot install yet") with a Reload action', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'firmware-stale' });
        expect(view.level).toBe('blocked');
        expect(view.title).toBe('Cannot install yet');
        expect(view.actions.map(a => a.action)).toContain('reload');
    });

    test('a waiting installer update is a hard block with a Reload action', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'update-available' });
        expect(view.level).toBe('blocked');
        expect(view.actions.map(a => a.action)).toContain('reload');
    });

    // WF-UX-013 superseded the unknown-freshness copy + actions: a calm
    // "Could not recheck for updates" with Reload page / Continue (no "manifest",
    // no "Cannot install yet", no scary override). The plain-language + not-stale
    // contract this test guards is preserved; the exact copy is pinned by
    // __tests__/wf-ux-013-simple-install-noise.test.js.
    test('unknown freshness reads in plain language, avoids "manifest", and stays "needs attention"', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'freshness-unknown' });
        // The default user path must avoid "manifest" wording and never read as
        // a hard "Cannot install yet" block.
        expect(`${view.title} ${view.detail}`.toLowerCase()).not.toContain('manifest');
        expect(view.title.toLowerCase()).not.toContain('cannot install');
        // Not a scary hard block — it is "needs attention".
        expect(view.level).toBe('attention');
        expect(view.actions.map(a => a.action).sort()).toEqual(['continue', 'reload']);
    });

    test('renderStatus writes the verdict into the hero and never surfaces "manifest" for unknown freshness', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.renderStatus({ reason: 'freshness-unknown' });

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.dataset.level).toBe('attention');
        expect(status.querySelector('[data-simple-install-status-detail]').textContent.toLowerCase())
            .not.toContain('manifest');

        const actions = Array.from(status.querySelectorAll('[data-simple-install-action]'))
            .map(b => b.dataset.simpleInstallAction).sort();
        expect(actions).toEqual(['continue', 'reload']);
    });

    test('the Show details action opens the technical preflight diagnostics', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        // A preflight failure still offers a Show details action into the
        // diagnostics (WF-UX-013 dropped the details action from the calm
        // freshness-unknown state, which now uses Reload / Continue instead).
        mod.renderStatus({ reason: 'preflight-fail' });

        const details = document.querySelector('#step-5 [data-preflight-details]');
        expect(details.open).toBe(false);
        document.querySelector('[data-simple-install-action="details"]').click();
        expect(details.open).toBe(true);
    });
});

describe('WF-UX-011 — the hero mirrors the install gate (no bypass)', () => {
    test('a blocked install-readiness broadcast flips the hero to "Cannot install yet"', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });

        document.dispatchEvent(new CustomEvent('webflash:install-readiness-changed', {
            detail: { ready: false, level: 'blocked', reason: 'firmware-stale', message: '' }
        }));

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.dataset.level).toBe('blocked');
        expect(status.querySelector('[data-simple-install-status-title]').textContent).toBe('Cannot install yet');
    });

    test('a ready broadcast flips the hero to "Ready to install" with no extra actions', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });

        document.dispatchEvent(new CustomEvent('webflash:install-readiness-changed', {
            detail: { ready: true, level: 'ready', reason: 'ready', message: 'Ready to flash' }
        }));

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.dataset.level).toBe('ready');
        expect(status.querySelector('[data-simple-install-status-title]').textContent).toBe('Ready to install');
        expect(status.querySelector('[data-simple-install-status-actions]').hidden).toBe(true);
    });
});

/* ===========================================================================
   Part C — no-change invariants (firmware / manifest / policy surfaces)
   =========================================================================== */
describe('WF-UX-011 — presentation-only: install / firmware surfaces unchanged', () => {
    test('manifest carries Release-One stable + five preview builds + Rescue', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(7);
        const configs = manifest.builds.map(b => b.config_string).sort();
        expect(configs).toEqual([
            'Ceiling-POE-AirIQ-RoomIQ',
            'Ceiling-POE-RoomIQ',
            'Ceiling-POE-RoomIQ-LED',
            'Ceiling-POE-VentIQ-FanRelay-RoomIQ',
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

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('firmware/sources.json declares Release-One + five preview sources, no PWM/DAC/TRIAC driver', () => {
        const sources = readJson('firmware/sources.json');
        const cfgs = (sources.sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
        for (const entry of sources.sources || []) {
            ['FanPWM', 'FanDAC', 'FanTRIAC'].forEach(token => {
                expect(entry.config_string || '').not.toContain(token);
                expect(entry.asset_name || '').not.toContain(token);
            });
        }
    });

    test('LED stays preview-only and still requires the channel:preview acknowledgement', async () => {
        const { findKitPresetById, isPresetAvailable } = await import('../scripts/data/kit-presets.js');
        const led = findKitPresetById('S360-KIT-BATH-POE-LED');
        expect(led.status).toBe('preview');
        expect(led.requiresPreviewAcknowledgement).toBe(true);
        expect(isPresetAvailable(led)).toBe(true);

        const { getRequiredAcknowledgements } = await import('../scripts/utils/release-channels.js');
        const manifest = readJson('manifest.json');
        const ledBuild = manifest.builds.find(b => b.config_string === 'Ceiling-POE-VentIQ-RoomIQ-LED');
        const acks = getRequiredAcknowledgements(ledBuild);
        expect(acks.some(a => a.key === 'channel:preview')).toBe(true);
    });

    test('every fan-control kit (Relay / TRIAC / PWM / DAC) stays planned and non-installable', async () => {
        const { KIT_PRESETS, isPresetAvailable } = await import('../scripts/data/kit-presets.js');
        const fanKits = KIT_PRESETS.filter(p => /RELAY|TRIAC|PWM|DAC/.test(p.id));
        expect(fanKits.length).toBe(4);
        fanKits.forEach(preset => {
            expect(preset.status).toBe('planned');
            expect(preset.firmwareConfigString).toBeNull();
            expect(preset.wizardState).toBeNull();
            expect(isPresetAvailable(preset)).toBe(false);
        });
    });
});
