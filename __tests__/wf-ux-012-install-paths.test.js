/**
 * WF-UX-012 — Split Simple install and Advanced install paths at Step 1.
 *
 * Builds on WF-UX-011's Simple install mode by making the first choice an
 * explicit two-path picker:
 *   1. Simple install — recommended / default
 *   2. Advanced install
 *
 * The Simple install path shows one clean product card for the stable Sense360
 * Bathroom PoE kit (preselected, a single safety confirmation, the Install
 * action) and hides the planning / technical / preflight-diagnostic chrome. The
 * Advanced install path reveals the existing multi-step builder unchanged.
 *
 * These pins lock the WF-UX-012 contract:
 *   - the first screen shows Simple install + Advanced install choices,
 *   - Simple install is recommended and the default,
 *   - Simple install preselects the Bathroom PoE stable target and lands on the
 *     review/install step (so Core / Power / Modules / planned kits / fan
 *     variants / SKU search are not shown),
 *   - the Simple card carries one safety confirmation ("Confirm before
 *     installing") with no "accept the risk" wording, and it mirrors the
 *     authoritative pre-flash acknowledgement so install gates stay intact,
 *   - small secondary links (Setup checks / Advanced install / Recovery) stay,
 *   - Advanced install preserves the existing wizard behaviour,
 *   - LED stays preview-only (acknowledgement required), TRIAC stays
 *     advanced/manual-warning, every fan variant stays non-installable,
 *   - no firmware / manifest / source / REQUIRED_CONFIGS / kits surface changed.
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

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

/* ===========================================================================
   Part A — static markup contract (loads the real index.html body, no scripts)
   =========================================================================== */
describe('WF-UX-012 — static markup', () => {
    let html = '';

    beforeAll(() => {
        html = fs.readFileSync(HTML_PATH, 'utf-8');
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
    });

    describe('the first screen presents exactly two primary install paths', () => {
        test('a Simple / Advanced path picker exists and precedes the wizard step-1', () => {
            const picker = document.querySelector('[data-install-path-choice]');
            expect(picker).not.toBeNull();

            const simple = picker.querySelector('[data-install-path="simple"]');
            const advanced = picker.querySelector('[data-install-path="advanced"]');
            expect(simple).not.toBeNull();
            expect(advanced).not.toBeNull();
            expect(simple.textContent).toMatch(/Simple install/i);
            expect(advanced.textContent).toMatch(/Advanced install/i);

            // Exactly two primary choices — no third path competes at Step 1.
            expect(picker.querySelectorAll('[data-install-path]')).toHaveLength(2);

            // The picker is on the first screen, before the wizard's step-1.
            const step1 = document.getElementById('step-1');
            expect(step1).not.toBeNull();
            expect(picker.compareDocumentPosition(step1) & FOLLOWING).toBeTruthy();
        });

        test('Simple install is the recommended default; Advanced install is not pre-pressed', () => {
            const simple = document.querySelector('[data-install-path="simple"]');
            const advanced = document.querySelector('[data-install-path="advanced"]');
            expect(simple.getAttribute('aria-pressed')).toBe('true');
            expect(advanced.getAttribute('aria-pressed')).toBe('false');
            // Recommended marker lives on (only) the simple choice.
            expect(simple.querySelector('[data-install-path-recommended]')).not.toBeNull();
            expect(simple.textContent).toMatch(/Recommended/i);
            expect(advanced.querySelector('[data-install-path-recommended]')).toBeNull();
        });
    });

    describe('the Simple install path is one clean product card', () => {
        test('the card names the product, the stable v1.0.0 firmware, and the included hardware', () => {
            const hero = document.querySelector('[data-simple-install]');
            const card = hero.querySelector('[data-simple-install-card]');
            expect(card).not.toBeNull();

            const heading = card.querySelector('#simple-install-heading');
            expect(heading.textContent.trim()).toBe('Sense360 Bathroom PoE Kit');

            // Stable firmware version is surfaced in the card (matches the
            // current production target — manifest.json version 1.0.0).
            expect(card.querySelector('.simple-install__eyebrow').textContent)
                .toMatch(/Stable firmware/i);
            expect(card.textContent).toMatch(/v1\.0\.0/);

            // Included-hardware summary: Core, RoomIQ, VentIQ, PoE.
            const items = Array.from(card.querySelectorAll('.simple-install__summary-item'))
                .map(li => li.textContent.trim());
            expect(items).toHaveLength(4);
            const joined = items.join(' | ');
            expect(joined).toMatch(/Sense360 Core/);
            expect(joined).toMatch(/RoomIQ/);
            expect(joined).toMatch(/VentIQ/);
            expect(joined).toMatch(/PoE|Power over Ethernet/);
        });

        test('there is exactly one safety confirmation checkbox using calm "Confirm before installing" copy', () => {
            const hero = document.querySelector('[data-simple-install]');
            const confirms = hero.querySelectorAll('[data-simple-install-confirm]');
            expect(confirms).toHaveLength(1);

            const input = confirms[0];
            expect(input.tagName).toBe('INPUT');
            expect(input.getAttribute('type')).toBe('checkbox');

            const label = input.closest('label');
            expect(label).not.toBeNull();
            expect(label.textContent).toMatch(/Confirm before installing/i);
            // No scary "accept the risk" wording in the default Simple path.
            expect(label.textContent.toLowerCase()).not.toContain('accept the risk');
        });

        test('the primary Install action is named and the ESP Web Tools mount survives', () => {
            const cta = document.querySelector('[data-simple-install-cta]');
            expect(cta).not.toBeNull();
            expect(cta.textContent).toMatch(/Install stable firmware/i);
            expect(document.getElementById('compatible-firmware')).not.toBeNull();
        });

        test('config string + kit SKU stay inside a collapsed Technical details disclosure', () => {
            const hero = document.querySelector('[data-simple-install]');
            const tech = hero.querySelector('[data-simple-install-tech]');
            expect(tech.tagName).toBe('DETAILS');
            expect(tech.hasAttribute('open')).toBe(false);

            const config = hero.querySelector('[data-simple-install-tech-config]');
            const sku = hero.querySelector('[data-simple-install-tech-sku]');
            expect(config.textContent).toContain('Ceiling-POE-VentIQ-RoomIQ');
            expect(sku.textContent).toContain('S360-KIT-BATH-POE');
            expect(tech.contains(config)).toBe(true);
            expect(tech.contains(sku)).toBe(true);

            // Nothing technical leaks into the always-visible card copy.
            const clone = hero.cloneNode(true);
            clone.querySelector('[data-simple-install-tech]')?.remove();
            expect(clone.textContent).not.toMatch(/Ceiling-POE-VentIQ-RoomIQ/);
            expect(clone.textContent).not.toMatch(/S360-/);
        });

        test('the Simple card embeds none of the Core/Power/Modules choices, planned kits, fan variants, or SKU search', () => {
            const hero = document.querySelector('[data-simple-install]');
            // Wizard build steps are not inside the simple card.
            expect(hero.querySelector('#step-2, #step-3, #step-4')).toBeNull();
            // Kit catalogue / planned kits / fan variants / SKU search are not inside it.
            expect(hero.querySelector('[data-bundle-presets]')).toBeNull();
            expect(hero.querySelector('[data-bundle-presets-planned]')).toBeNull();
            expect(hero.querySelector('[data-start-paths]')).toBeNull();
            expect(hero.querySelector('[data-kit-select-search]')).toBeNull();
            expect(hero.querySelector('#roomiq-module-section, #led-module-section')).toBeNull();
        });
    });

    describe('small secondary links stay available in the Simple path', () => {
        test('Setup checks, Advanced install, and Recovery links are present and quiet', () => {
            const links = document.querySelector('[data-simple-install-links]');
            expect(links).not.toBeNull();

            const setup = links.querySelector('[data-open-setup-checks]');
            const advanced = links.querySelector('[data-enter-advanced]');
            const recovery = links.querySelector('[data-rescue-open]');
            expect(setup).not.toBeNull();
            expect(advanced).not.toBeNull();
            expect(recovery).not.toBeNull();

            expect(setup.textContent).toMatch(/Setup checks/i);
            expect(advanced.textContent).toMatch(/Advanced install/i);
            expect(recovery.textContent).toMatch(/Recovery/i);
        });
    });

    describe('Advanced install preserves the existing multi-step builder', () => {
        test('all five steps, the kit catalogue, planned kits, custom path, modules, and SKU search survive', () => {
            for (let i = 1; i <= 5; i++) {
                expect(document.getElementById(`step-${i}`)).not.toBeNull();
            }
            expect(document.querySelector('[data-bundle-presets]')).not.toBeNull();
            expect(document.querySelector('[data-bundle-presets-planned]')).not.toBeNull();
            expect(document.querySelector('[data-start-path="custom"]')).not.toBeNull();
            expect(document.querySelector('[data-kit-select-search]')).not.toBeNull();
            // Module picker + LED preview flow remain in the wizard.
            expect(document.getElementById('roomiq-module-section')).not.toBeNull();
            expect(document.getElementById('led-module-section')).not.toBeNull();
        });
    });

    describe('every real install gate surface is preserved (no gate removed)', () => {
        test('preflight panel + details, warn-acknowledge, channel acknowledgement, pre-flash checklist, freshness mount survive', () => {
            expect(document.querySelector('[data-preflight-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-details]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-warn-acknowledge]')).not.toBeNull();
            expect(document.querySelector('[data-channel-acknowledgement-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflash-acknowledge]')).not.toBeNull();
            expect(document.querySelector('[data-freshness-banner-mount]')).not.toBeNull();
        });

        test('the authoritative pre-flash acknowledgement still lives inside the Step 5 safety task', () => {
            const safetyTask = document.querySelector('.review-task--safety');
            expect(safetyTask).not.toBeNull();
            expect(safetyTask.querySelector('[data-preflight-panel]')).not.toBeNull();
            expect(safetyTask.querySelector('[data-preflash-acknowledge]')).not.toBeNull();
        });
    });

    describe('the Simple view hides clutter without removing gates (CSS contract)', () => {
        test('simple mode suppresses the preflight verdict box and the verbose pre-flash checklist', () => {
            const css = fs.readFileSync(CSS_PATH, 'utf-8');
            expect(css).toMatch(/\[data-install-mode="simple"\][^{]*\.preflight-panel__verdict/);
            expect(css).toMatch(/\[data-install-mode="simple"\][^{]*\.pre-flash-checklist/);
        });
    });
});

/* ===========================================================================
   Part B — controller behaviour (state.js / sw-update / a11y mocked)
   =========================================================================== */
const FIXTURE_DOM = `
    <div class="install-mode-bar" data-advanced-bar hidden aria-hidden="true">
        <button data-enter-simple>Back to simple install</button>
    </div>
    <section class="simple-install" data-simple-install aria-labelledby="simple-install-heading" hidden aria-hidden="true">
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
                <span>Confirm before installing.</span>
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
            <label><input type="checkbox" data-preflash-acknowledge></label>
        </section>
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

describe('WF-UX-012 — Simple install is the default and preselects the stable target', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('a clean URL with no stored preference resolves to simple', async () => {
        const { mod } = await loadController({ dom: '' });
        expect(mod.resolveInitialMode()).toBe('simple');
    });

    test('entering simple preselects the stable Bathroom PoE kit and lands on the review/install step', async () => {
        const { mod, setState, setStep } = await loadController({ dom: FIXTURE_DOM });
        setState.mockClear();
        setStep.mockClear();

        mod.applyMode('simple', { persist: false });

        expect(document.documentElement.getAttribute('data-install-mode')).toBe('simple');
        // Exactly one preset application — the stable Bathroom PoE kit.
        expect(setState).toHaveBeenCalledTimes(1);
        const applied = setState.mock.calls[0][0];
        expect(applied.power).toBe('poe');
        expect(applied.ventiq).toBe('ventiq');
        expect(applied.roomiq).toBe('roomiq');
        expect(applied.led).toBe('none');
        expect(applied.fan).toBe('none');
        // Advances to the review/install step (away from Core/Power/Modules
        // and the planned-kit / SKU-search Step 1 surfaces).
        expect(setStep).toHaveBeenCalledWith(5, { animate: false });

        // The picker reflects the active path.
        expect(document.querySelector('[data-install-path="simple"]').getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelector('[data-install-path="advanced"]').getAttribute('aria-pressed')).toBe('false');
    });
});

describe('WF-UX-012 — Advanced install preserves the wizard', () => {
    test('entering advanced reveals the wizard from step 1 and never re-applies a preset', async () => {
        const { mod, setState, setStep } = await loadController({ dom: FIXTURE_DOM });
        setState.mockClear();
        setStep.mockClear();

        mod.applyMode('advanced', { persist: false });

        expect(document.documentElement.getAttribute('data-install-mode')).toBe('advanced');
        expect(setState).not.toHaveBeenCalled();
        expect(setStep).toHaveBeenCalledWith(1, { animate: false });

        // Hero hidden, advanced bar shown, picker reflects advanced.
        expect(document.querySelector('[data-simple-install]').hidden).toBe(true);
        expect(document.querySelector('[data-advanced-bar]').hidden).toBe(false);
        expect(document.querySelector('[data-install-path="advanced"]').getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelector('[data-install-path="simple"]').getAttribute('aria-pressed')).toBe('false');
    });

    test('the path picker toggles modes via delegation', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        document.querySelector('[data-install-path="advanced"]').click();
        expect(document.documentElement.getAttribute('data-install-mode')).toBe('advanced');

        document.querySelector('[data-install-path="simple"]').click();
        expect(document.documentElement.getAttribute('data-install-mode')).toBe('simple');
    });
});

describe('WF-UX-012 — the safety confirmation drives the real gate (no bypass)', () => {
    test('checking the Simple-card confirmation checks the authoritative pre-flash acknowledgement and fires change', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        const heroAck = document.querySelector('[data-simple-install-confirm]');
        const realAck = document.querySelector('[data-preflash-acknowledge]');
        let realChangeFired = false;
        realAck.addEventListener('change', () => { realChangeFired = true; });

        heroAck.checked = true;
        heroAck.dispatchEvent(new Event('change', { bubbles: true }));

        expect(realAck.checked).toBe(true);
        expect(realChangeFired).toBe(true);
    });

    test('toggling the authoritative pre-flash acknowledgement reflects back into the Simple card', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        const heroAck = document.querySelector('[data-simple-install-confirm]');
        const realAck = document.querySelector('[data-preflash-acknowledge]');

        realAck.checked = true;
        realAck.dispatchEvent(new Event('change', { bubbles: true }));

        expect(heroAck.checked).toBe(true);
    });

    test('a blocked install-readiness broadcast flips the Simple card to "Cannot install yet"', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        document.dispatchEvent(new CustomEvent('webflash:install-readiness-changed', {
            detail: { ready: false, level: 'blocked', reason: 'firmware-stale', message: '' }
        }));

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.dataset.level).toBe('blocked');
        expect(status.querySelector('[data-simple-install-status-title]').textContent).toBe('Cannot install yet');
    });
});

describe('WF-UX-012 — Setup checks opens the preflight diagnostics', () => {
    test('the Setup checks link expands the Step 5 preflight details', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        const details = document.querySelector('#step-5 [data-preflight-details]');
        expect(details.open).toBe(false);
        document.querySelector('[data-open-setup-checks]').click();
        expect(details.open).toBe(true);
    });
});

/* ===========================================================================
   Part C — no-change invariants (firmware / manifest / policy / safety gates)
   =========================================================================== */
describe('WF-UX-012 — presentation-only: install / firmware surfaces unchanged', () => {
    test('manifest carries Release-One stable + seven preview builds + Rescue', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(9);
        const configs = manifest.builds.map(b => b.config_string).sort();
        expect(configs).toEqual([
            'Ceiling-POE-AirIQ-RoomIQ',
            'Ceiling-POE-FanDAC',
            'Ceiling-POE-FanPWM',
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

    test('firmware/sources.json declares Release-One + seven preview sources, no TRIAC driver', () => {
        const sources = readJson('firmware/sources.json');
        const cfgs = (sources.sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-FanDAC', 'Ceiling-POE-FanPWM', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
        for (const entry of sources.sources || []) {
            ['FanTRIAC'].forEach(token => {
                expect(entry.config_string || '').not.toContain(token);
                expect(entry.asset_name || '').not.toContain(token);
            });
        }
    });

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });
});

describe('WF-UX-012 — preview LED and TRIAC safety gates are unchanged', () => {
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

    test('TRIAC stays advanced/manual-warning — any FanTRIAC config classifies non-installable', async () => {
        const { classifyConfigString, AVAILABILITY_STATES } =
            await import('../scripts/utils/module-availability.js');
        const result = classifyConfigString('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', {
            manifestStableConfigs: new Set(['Ceiling-POE-VentIQ-FanTRIAC-RoomIQ']),
            manifestPreviewConfigs: new Set()
        });
        expect(result.state).toBe(AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING);
        expect(result.installable).toBe(false);
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
