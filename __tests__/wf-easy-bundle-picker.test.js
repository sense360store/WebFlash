/**
 * WF-EASY-BUNDLE-PICKER-001 — Simple install bundle picker.
 *
 * Simple install used to resolve to a single fixed kit (the stable Bathroom PoE
 * build). It is now an easy bundle picker over the supported customer bundle
 * products: the stable Bathroom PoE bundle stays the default + recommended
 * choice, and the imported preview room bundles are visible behind clear Preview
 * labels and acknowledgement gates.
 *
 * These pins lock the contract:
 *   - the six allowed bundle cards appear (and only those),
 *   - the stable Bathroom PoE bundle is the default/recommended choice,
 *   - preview bundles are never default/recommended/buyable,
 *   - the Bathroom Relay bundle carries a stronger fan-control gate,
 *   - each bundle resolves to its expected firmware config in the live manifest,
 *   - FanPWM / FanDAC / TRIAC and any raw/manual config never appear in Simple,
 *   - REQUIRED_CONFIGS / manifest / sources / kits surfaces are unchanged,
 *   - Advanced install + Recovery survive and the install gates stay authoritative.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf-8'));
}

const ALLOWED_BUNDLE_IDS = [
    'S360-KIT-BATH-P',
    'S360-KIT-KITCHEN-P',
    'S360-KIT-BEDROOM-P',
    'S360-KIT-LIVING-P',
    'S360-KIT-CORRIDOR-P',
    'S360-KIT-BATH-P-REL'
];

const EXPECTED_CONFIG_BY_ID = {
    'S360-KIT-BATH-P': 'Ceiling-POE-VentIQ-RoomIQ',
    'S360-KIT-KITCHEN-P': 'Ceiling-POE-AirIQ-RoomIQ',
    'S360-KIT-BEDROOM-P': 'Ceiling-POE-RoomIQ',
    'S360-KIT-LIVING-P': 'Ceiling-POE-RoomIQ-LED',
    'S360-KIT-CORRIDOR-P': 'Ceiling-POE-RoomIQ-LED',
    'S360-KIT-BATH-P-REL': 'Ceiling-POE-VentIQ-FanRelay-RoomIQ'
};

// Standalone fan-driver configs + TRIAC must never surface in Simple install.
const FORBIDDEN_CONFIGS = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC', 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ'];

/* ===========================================================================
   Part A — bundle data module
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-001 — simple-bundles data module', () => {
    test('exports exactly the six allowed bundles, in order, Bathroom first', async () => {
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        expect(SIMPLE_BUNDLES.map(b => b.id)).toEqual(ALLOWED_BUNDLE_IDS);
    });

    test('every bundle passes the validateSimpleBundle contract', async () => {
        const { SIMPLE_BUNDLES, validateSimpleBundle } = await import('../scripts/data/simple-bundles.js');
        SIMPLE_BUNDLES.forEach(bundle => {
            const result = validateSimpleBundle(bundle);
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
        });
    });

    test('the Bathroom PoE bundle is the stable default + recommended + buyable choice', async () => {
        const { getDefaultSimpleBundle, findSimpleBundleById } = await import('../scripts/data/simple-bundles.js');
        const def = getDefaultSimpleBundle();
        expect(def.id).toBe('S360-KIT-BATH-P');
        expect(def.channel).toBe('stable');
        expect(def.isDefault).toBe(true);
        expect(def.recommended).toBe(true);
        expect(def.buyable).toBe(true);
        expect(def.requiresPreviewAcknowledgement).toBe(false);
        expect(def.requiresFanControlAcknowledgement).toBe(false);
        expect(def.firmwareConfigString).toBe('Ceiling-POE-VentIQ-RoomIQ');
        // Round-trip the id helper.
        expect(findSimpleBundleById('s360-kit-bath-p').id).toBe('S360-KIT-BATH-P');
    });

    test('preview bundles are never default/recommended/buyable and always require the preview acknowledgement', async () => {
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const previews = SIMPLE_BUNDLES.filter(b => b.channel === 'preview');
        expect(previews.map(b => b.id)).toEqual([
            'S360-KIT-KITCHEN-P',
            'S360-KIT-BEDROOM-P',
            'S360-KIT-LIVING-P',
            'S360-KIT-CORRIDOR-P',
            'S360-KIT-BATH-P-REL'
        ]);
        previews.forEach(bundle => {
            expect(bundle.isDefault).toBe(false);
            expect(bundle.recommended).toBe(false);
            expect(bundle.buyable).toBe(false);
            expect(bundle.requiresPreviewAcknowledgement).toBe(true);
        });
    });

    test('only the Bathroom Relay bundle carries the stronger fan-control acknowledgement', async () => {
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const fanGated = SIMPLE_BUNDLES.filter(b => b.requiresFanControlAcknowledgement);
        expect(fanGated.map(b => b.id)).toEqual(['S360-KIT-BATH-P-REL']);
        // The fan-control bundle is preview AND fan-control gated — both, never
        // fan-control alone (the validator enforces this too).
        const relay = fanGated[0];
        expect(relay.requiresPreviewAcknowledgement).toBe(true);
        expect(relay.firmwareConfigString).toBe('Ceiling-POE-VentIQ-FanRelay-RoomIQ');
    });

    test('each bundle resolves to its expected firmware config in the live manifest with the matching channel', async () => {
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const manifest = readJson('manifest.json');
        const buildsByConfig = new Map((manifest.builds || []).map(b => [b.config_string, b]));
        SIMPLE_BUNDLES.forEach(bundle => {
            expect(bundle.firmwareConfigString).toBe(EXPECTED_CONFIG_BY_ID[bundle.id]);
            const build = buildsByConfig.get(bundle.firmwareConfigString);
            expect(build).toBeDefined();
            expect(build.channel).toBe(bundle.channel);
        });
    });

    test('no bundle resolves to a standalone fan-driver or TRIAC config', async () => {
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const configs = SIMPLE_BUNDLES.map(b => b.firmwareConfigString);
        FORBIDDEN_CONFIGS.forEach(cfg => {
            expect(configs).not.toContain(cfg);
        });
        // No config carries a non-Relay fan token, and none carries TRIAC.
        configs.forEach(cfg => {
            expect(cfg).not.toContain('FanPWM');
            expect(cfg).not.toContain('FanDAC');
            expect(cfg).not.toContain('FanTRIAC');
        });
    });

    test('WF-UX-008 — customer-facing bundle fields expose no internal task/release/tracking IDs', async () => {
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const INTERNAL_ID_PATTERN = /RELEASE-[A-Z]+-001|RELEASE-007|WF-IMPORT-[A-Z]+-001|WF-TRIAC-001|WF-HW-TEST|KIT-MATRIX-001|HW-005|COMPLIANCE-001|S360-300-BENCH-001|import-firmware-sources\.py/;
        const customerFields = ['displayName', 'shortName', 'room', 'useCase', 'description', 'warning'];
        SIMPLE_BUNDLES.forEach(bundle => {
            customerFields.forEach(field => {
                expect(String(bundle[field] || '')).not.toMatch(INTERNAL_ID_PATTERN);
            });
            bundle.moduleSummary.forEach(item => expect(item).not.toMatch(INTERNAL_ID_PATTERN));
        });
    });
});

/* ===========================================================================
   Part A.1 — wizardState ↔ config_string round-trip (real state.js)
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-001 — each bundle wizardState resolves to its config_string', () => {
    const MODULE_SLOTS = ['airiq', 'ventiq', 'roomiq', 'fan', 'led'];

    test('parseConfigStringState(config) matches the bundle wizardState module slots', async () => {
        // Use the REAL state.js (Part C mocks it inside loadController; reset the
        // registry first so this dynamic import gets the unmocked module).
        jest.resetModules();
        const { __testHooks } = await import('../scripts/state.js');
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const { parseConfigStringState } = __testHooks;

        SIMPLE_BUNDLES.forEach(bundle => {
            const parsed = parseConfigStringState(bundle.firmwareConfigString);
            expect((parsed.power || '').toLowerCase()).toBe(bundle.wizardState.power);
            MODULE_SLOTS.forEach(slot => {
                expect(`${bundle.id}:${slot}=${parsed[slot] || 'none'}`)
                    .toBe(`${bundle.id}:${slot}=${bundle.wizardState[slot] || 'none'}`);
            });
        });
    });
});

/* ===========================================================================
   Part B — static markup contract (real index.html body, no scripts)
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-001 — Simple install static markup', () => {
    let html = '';
    let hero = null;

    beforeAll(() => {
        html = fs.readFileSync(HTML_PATH, 'utf-8');
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
        hero = document.querySelector('[data-simple-install]');
    });

    test('Simple install leads with "Choose your Sense360 kit"', () => {
        const heading = hero.querySelector('#simple-install-heading');
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toBe('Choose your Sense360 kit');
    });

    test('all six allowed bundle cards appear in the picker — and only those', () => {
        const picker = hero.querySelector('[data-simple-bundle-picker]');
        expect(picker).not.toBeNull();
        const ids = Array.from(picker.querySelectorAll('[data-simple-bundle-card]'))
            .map(card => card.getAttribute('data-simple-bundle-id'));
        expect(ids).toEqual(ALLOWED_BUNDLE_IDS);
    });

    test('the stable Bathroom PoE bundle card is selected by default and marked Recommended', () => {
        const bath = hero.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P"]');
        expect(bath.getAttribute('data-simple-bundle-channel')).toBe('stable');
        expect(bath.getAttribute('aria-checked')).toBe('true');
        expect(bath.getAttribute('aria-pressed')).toBe('true');
        expect(bath.classList.contains('is-active')).toBe(true);
        expect(bath.textContent).toMatch(/Recommended/i);
        // Exactly one card is active by default.
        const active = hero.querySelectorAll('[data-simple-bundle-card].is-active');
        expect(active).toHaveLength(1);
    });

    test('every preview bundle card is labelled Preview; none is Recommended', () => {
        const previews = hero.querySelectorAll('[data-simple-bundle-card][data-simple-bundle-channel="preview"]');
        expect(previews).toHaveLength(5);
        previews.forEach(card => {
            expect(card.textContent).toMatch(/Preview/i);
            expect(card.getAttribute('aria-checked')).toBe('false');
            expect(card.classList.contains('is-active')).toBe(false);
            expect(card.textContent).not.toMatch(/Recommended/i);
        });
    });

    test('the Bathroom Relay card carries the stronger fan-control marker', () => {
        const relay = hero.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-REL"]');
        expect(relay.getAttribute('data-simple-bundle-channel')).toBe('preview');
        expect(relay.textContent).toMatch(/Fan control/i);
    });

    test('FanPWM / FanDAC / TRIAC and any raw config string never appear in the Simple install surface', () => {
        const text = hero.textContent;
        ['FanPWM', 'FanDAC', 'FanTRIAC', 'TRIAC', 'Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC'].forEach(token => {
            expect(text).not.toContain(token);
        });
    });

    test('no config string or kit SKU leaks into the always-visible Simple copy (technical metadata stays collapsed)', () => {
        const tech = hero.querySelector('[data-simple-install-tech]');
        expect(tech.tagName).toBe('DETAILS');
        expect(tech.hasAttribute('open')).toBe(false);
        // Config + SKU live inside the collapsed Technical details disclosure.
        expect(tech.querySelector('[data-simple-install-tech-config]').textContent)
            .toContain('Ceiling-POE-VentIQ-RoomIQ');
        expect(tech.querySelector('[data-simple-install-tech-sku]').textContent)
            .toContain('S360-KIT-BATH-P');
        // Remove the disclosure: the remaining always-visible copy carries no
        // config string and no internal SKU token.
        const clone = hero.cloneNode(true);
        clone.querySelector('[data-simple-install-tech]')?.remove();
        expect(clone.textContent).not.toMatch(/Ceiling-POE-/);
        expect(clone.textContent).not.toMatch(/S360-KIT-/);
    });

    test('the fan-control region + preview note are present but hidden by default (stable Bathroom is default)', () => {
        const previewNote = hero.querySelector('[data-simple-bundle-preview-note]');
        const fanRegion = hero.querySelector('[data-simple-bundle-fan-control]');
        const fanAck = hero.querySelector('[data-simple-bundle-fan-control-ack]');
        expect(previewNote.hidden).toBe(true);
        expect(fanRegion.hidden).toBe(true);
        expect(fanAck).not.toBeNull();
        expect(fanAck.getAttribute('type')).toBe('checkbox');
    });

    test('Advanced install + Recovery links survive in the Simple path', () => {
        const links = hero.querySelector('[data-simple-install-links]');
        expect(links.querySelector('[data-enter-advanced]')).not.toBeNull();
        expect(links.querySelector('[data-rescue-open]')).not.toBeNull();
        // The full wizard, kit catalogue, and rescue modal survive elsewhere.
        expect(document.getElementById('step-5')).not.toBeNull();
        expect(document.querySelector('[data-start-path="custom"]')).not.toBeNull();
    });
});

/* ===========================================================================
   Part C — controller behaviour (state.js / sw-update / a11y mocked)
   =========================================================================== */
const HERO_DOM = `
    <div class="install-mode-bar" data-advanced-bar hidden aria-hidden="true">
        <button data-enter-simple>Back to simple install</button>
    </div>
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <div class="simple-bundle-picker" data-simple-bundle-picker>
            <button data-simple-bundle-card data-simple-bundle-id="S360-KIT-BATH-P" data-simple-bundle-channel="stable" aria-checked="true" class="is-active"></button>
            <button data-simple-bundle-card data-simple-bundle-id="S360-KIT-KITCHEN-P" data-simple-bundle-channel="preview" aria-checked="false"></button>
            <button data-simple-bundle-card data-simple-bundle-id="S360-KIT-BATH-P-REL" data-simple-bundle-channel="preview" aria-checked="false"></button>
        </div>
        <p data-simple-install-eyebrow>Stable firmware · v1.0.0</p>
        <h3 data-simple-bundle-selected-name>Bathroom Bundle — PoE</h3>
        <ul data-simple-install-summary><li class="simple-install__summary-item">Sense360 Core</li></ul>
        <p data-simple-bundle-preview-note hidden aria-hidden="true"><span data-simple-bundle-preview-note-text></span></p>
        <div data-simple-bundle-fan-control hidden aria-hidden="true">
            <label><input type="checkbox" data-simple-bundle-fan-control-ack></label>
        </div>
        <label class="simple-install__confirm"><input type="checkbox" data-simple-install-confirm></label>
        <details data-simple-install-tech>
            <summary>Technical details</summary>
            <dd data-simple-install-tech-sku>S360-KIT-BATH-P</dd>
            <dd data-simple-install-tech-config>Ceiling-POE-VentIQ-RoomIQ</dd>
            <dd data-simple-install-tech-channel>Stable</dd>
            <dd data-simple-install-tech-artifact>Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin</dd>
        </details>
        <button data-enter-advanced>Advanced install</button>
    </section>
    <div id="step-5">
        <p data-simple-install-cta><strong data-simple-install-cta-label>Install stable firmware.</strong></p>
        <input type="checkbox" data-preflash-acknowledge>
        <details data-preflight-details><summary>Preflight details</summary></details>
    </div>
`;

async function loadController({ dom = '', search = '' } = {}) {
    jest.resetModules();

    const setState = jest.fn();
    const setStep = jest.fn();
    const getMaxReachableStep = jest.fn(() => 5);

    jest.unstable_mockModule('../scripts/state.js', () => ({
        setState,
        setStep,
        getMaxReachableStep
    }));
    jest.unstable_mockModule('../scripts/services/sw-update.js', () => ({
        triggerSkipWaitingAndReload: jest.fn(),
        getServiceWorkerState: () => ({ updateAvailable: false, updateDismissed: false }),
        subscribeServiceWorkerState: () => () => {}
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({ announce: jest.fn() }));

    document.documentElement.removeAttribute('data-install-mode');
    document.body.innerHTML = dom;
    try { localStorage.clear(); } catch { /* ignore */ }
    window.history.replaceState({}, '', '/' + (search ? `?${search}` : ''));

    const mod = await import('../scripts/simple-install.js');
    return { mod, setState, setStep, getMaxReachableStep };
}

describe('WF-EASY-BUNDLE-PICKER-001 — bundle selection applies firmware + advances', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('entering simple selects the stable Bathroom bundle by default', async () => {
        const { mod, setState, setStep } = await loadController({ dom: HERO_DOM });
        setState.mockClear();
        setStep.mockClear();

        mod.__testHooks.resetForTests();
        mod.applyMode('simple', { persist: false });

        // Default selection = the stable Bathroom PoE bundle.
        expect(mod.__testHooks.getActiveBundleId()).toBe('S360-KIT-BATH-P');
        const applied = setState.mock.calls[setState.mock.calls.length - 1][0];
        expect(applied.power).toBe('poe');
        expect(applied.ventiq).toBe('ventiq');
        expect(applied.roomiq).toBe('roomiq');
        expect(applied.fan).toBe('none');
        expect(applied.led).toBe('none');
        expect(setStep).toHaveBeenCalledWith(5, { animate: false });

        // Stable default: no preview note, no fan-control region.
        expect(document.querySelector('[data-simple-bundle-preview-note]').hidden).toBe(true);
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(true);
        expect(document.querySelector('[data-simple-install-cta-label]').textContent)
            .toMatch(/Install stable firmware/i);
    });

    test('selecting a preview bundle applies its config, reveals the preview note, and flips the CTA copy', async () => {
        const { mod, setState } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        setState.mockClear();

        document.querySelector('[data-simple-bundle-id="S360-KIT-KITCHEN-P"]').click();

        expect(mod.__testHooks.getActiveBundleId()).toBe('S360-KIT-KITCHEN-P');
        const applied = setState.mock.calls[setState.mock.calls.length - 1][0];
        expect(applied.airiq).toBe('airiq');
        expect(applied.ventiq).toBe('none');
        // Preview note shown; fan-control region stays hidden; CTA says preview.
        expect(document.querySelector('[data-simple-bundle-preview-note]').hidden).toBe(false);
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(true);
        expect(document.querySelector('[data-simple-install-cta-label]').textContent)
            .toMatch(/Install preview firmware/i);
        // Technical details reflect the selected bundle.
        expect(document.querySelector('[data-simple-install-tech-config]').textContent)
            .toBe('Ceiling-POE-AirIQ-RoomIQ');
        expect(document.querySelector('[data-simple-install-tech-sku]').textContent)
            .toBe('S360-KIT-KITCHEN-P');
        // The active card highlight follows the selection.
        expect(document.querySelector('[data-simple-bundle-id="S360-KIT-KITCHEN-P"]').classList.contains('is-active')).toBe(true);
        expect(document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P"]').classList.contains('is-active')).toBe(false);
    });
});

describe('WF-EASY-BUNDLE-PICKER-001 — Bathroom Relay carries a stronger fan-control gate', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('the safety confirmation alone does NOT satisfy the authoritative gate until the fan-control acknowledgement is checked', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });

        // Select the Bathroom Relay bundle.
        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-REL"]').click();
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(false);

        const safety = document.querySelector('[data-simple-install-confirm]');
        const fanAck = document.querySelector('[data-simple-bundle-fan-control-ack]');
        const preflash = document.querySelector('[data-preflash-acknowledge]');

        // Tick the safety confirmation only — the authoritative pre-flash gate
        // stays UNsatisfied because the fan-control acknowledgement is missing.
        safety.checked = true;
        safety.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(false);

        // Tick the fan-control acknowledgement — now the authoritative gate is
        // satisfied (both acknowledgements present).
        fanAck.checked = true;
        fanAck.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(true);

        // Unticking the fan-control acknowledgement re-blocks the gate.
        fanAck.checked = false;
        fanAck.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(false);
    });

    test('switching back to a stable bundle clears the fan-control acknowledgement so a future reselection re-prompts', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });

        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-REL"]').click();
        const fanAck = document.querySelector('[data-simple-bundle-fan-control-ack]');
        fanAck.checked = true;

        // Re-select the stable Bathroom bundle: fan-control region hides + ack clears.
        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P"]').click();
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(true);
        expect(fanAck.checked).toBe(false);
    });

    test('a non-fan stable bundle: ticking the safety confirmation satisfies the gate directly (no regression)', async () => {
        const { mod } = await loadController({ dom: HERO_DOM });
        mod.applyMode('simple', { persist: false });
        // Default is the stable Bathroom bundle (no fan-control requirement).
        const safety = document.querySelector('[data-simple-install-confirm]');
        const preflash = document.querySelector('[data-preflash-acknowledge]');
        safety.checked = true;
        safety.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(true);
    });
});

/* ===========================================================================
   Part D — no-change invariants
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-001 — install / firmware / policy surfaces unchanged', () => {
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

    test('manifest stays at 9 builds; scripts/data/kits.json stays Release-One-only', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(9);
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('the only default-selectable manifest build is the stable Bathroom PoE build (previews never auto-select)', async () => {
        const { getChannelPolicy } = await import('../scripts/utils/release-channels.js');
        const manifest = readJson('manifest.json');
        const defaultEligible = (manifest.builds || []).filter(
            b => getChannelPolicy(b.channel).defaultSelectable && b.deprecated !== true
        );
        expect(defaultEligible.map(b => b.config_string)).toEqual(['Ceiling-POE-VentIQ-RoomIQ']);
    });

    test('every preview bundle build still requires the channel:preview acknowledgement', async () => {
        const { getRequiredAcknowledgements } = await import('../scripts/utils/release-channels.js');
        const { SIMPLE_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const manifest = readJson('manifest.json');
        const buildsByConfig = new Map((manifest.builds || []).map(b => [b.config_string, b]));
        SIMPLE_BUNDLES.filter(b => b.channel === 'preview').forEach(bundle => {
            const build = buildsByConfig.get(bundle.firmwareConfigString);
            const acks = getRequiredAcknowledgements(build);
            expect(acks.some(a => a.key === 'channel:preview')).toBe(true);
        });
    });

    test('manifest freshness + release notes survive: every bundle build has provenance and a release affordance', () => {
        const manifest = readJson('manifest.json');
        const buildsByConfig = new Map((manifest.builds || []).map(b => [b.config_string, b]));
        Object.values(EXPECTED_CONFIG_BY_ID).forEach(cfg => {
            const build = buildsByConfig.get(cfg);
            expect(build).toBeDefined();
            // provenance + signature present
            expect(typeof build.sha256).toBe('string');
            expect(build.sha256.length).toBeGreaterThan(0);
            // release-notes affordance: a URL or an embedded changelog
            const hasUrl = typeof build.release_url === 'string' && build.release_url.trim() !== '';
            const changelog = Array.isArray(build.changelog) ? build.changelog.filter(Boolean) : [];
            expect(hasUrl || changelog.length > 0).toBe(true);
        });
    });
});
