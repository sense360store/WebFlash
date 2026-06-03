/**
 * WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — fan-control room bundles in Simple
 * install.
 *
 * Upstream ROOM-BUNDLE-FAN-CONFIGS-001 (esphome-public #713) added five
 * full-composition Bathroom/Kitchen fan-control preview *configs* but published
 * NO firmware (compile-pending, no `.bin`, no release). This WebFlash slice does
 * NOT import firmware. Instead it:
 *
 *   1. declares the five fan-control room bundles (full copy + preview /
 *      fan-control / analog-fan-address acknowledgements), kept SEPARATE from the
 *      six always-present Simple bundles, and
 *   2. adds an import-readiness GATE so a fan-control card is only ever exposed
 *      when its exact firmware config_string is present in the LIVE manifest.
 *
 * These pins lock the contract:
 *   - the five fan-control bundles are declared, full room bundles, preview-only,
 *     never recommended/default/buyable, each requiring the preview + fan-control
 *     acknowledgements (analog ones also the address-switch acknowledgement),
 *   - NONE is exposable today (no matching firmware imported) → Simple install
 *     shows exactly the original six cards and leaks no fan token,
 *   - standalone fan-only configs + TRIAC never appear,
 *   - the FanDAC acknowledgement names 0x58 / 0x5A / forbidden 0x59,
 *   - the gate lights a card up — and resolves it to the exact config — when (and
 *     only when) the firmware is in the manifest, behind ALL the acknowledgements,
 *   - REQUIRED_CONFIGS / manifest / sources / kits stay unchanged.
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

const FAN_BUNDLE_IDS = [
    'S360-KIT-BATH-P-PWM',
    'S360-KIT-BATH-P-DAC',
    'S360-KIT-KITCHEN-P-REL',
    'S360-KIT-KITCHEN-P-PWM',
    'S360-KIT-KITCHEN-P-DAC'
];

const FAN_CONFIG_BY_ID = {
    'S360-KIT-BATH-P-PWM': 'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
    'S360-KIT-BATH-P-DAC': 'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
    'S360-KIT-KITCHEN-P-REL': 'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
    'S360-KIT-KITCHEN-P-PWM': 'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
    'S360-KIT-KITCHEN-P-DAC': 'Ceiling-POE-AirIQ-FanDAC-RoomIQ'
};

const DAC_BUNDLE_IDS = ['S360-KIT-BATH-P-DAC', 'S360-KIT-KITCHEN-P-DAC'];

// Configs that must NEVER be a Simple-install bundle.
const FORBIDDEN_SIMPLE_CONFIGS = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC', 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ'];

/* ===========================================================================
   Part A — fan-control bundle data module
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — fan-control bundle catalogue', () => {
    test('declares exactly the five full-composition fan-control bundles, in order', async () => {
        const { FAN_CONTROL_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        expect(FAN_CONTROL_BUNDLES.map(b => b.id)).toEqual(FAN_BUNDLE_IDS);
    });

    test('each fan-control bundle passes the validateFanControlBundle contract', async () => {
        const { FAN_CONTROL_BUNDLES, validateFanControlBundle } = await import('../scripts/data/simple-bundles.js');
        FAN_CONTROL_BUNDLES.forEach(bundle => {
            const result = validateFanControlBundle(bundle);
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
        });
    });

    test('every fan-control bundle is preview-only and never recommended/default/buyable', async () => {
        const { FAN_CONTROL_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        FAN_CONTROL_BUNDLES.forEach(bundle => {
            expect(bundle.channel).toBe('preview');
            expect(bundle.isDefault).toBe(false);
            expect(bundle.recommended).toBe(false);
            expect(bundle.buyable).toBe(false);
        });
    });

    test('every fan-control bundle requires BOTH the preview and the fan-control acknowledgement', async () => {
        const { FAN_CONTROL_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        FAN_CONTROL_BUNDLES.forEach(bundle => {
            expect(bundle.requiresPreviewAcknowledgement).toBe(true);
            expect(bundle.requiresFanControlAcknowledgement).toBe(true);
        });
    });

    test('exactly the two analog (0–10V) bundles require the address-switch acknowledgement', async () => {
        const { FAN_CONTROL_BUNDLES, bundleRequiresDacAddressAcknowledgement } = await import('../scripts/data/simple-bundles.js');
        const dacGated = FAN_CONTROL_BUNDLES.filter(bundleRequiresDacAddressAcknowledgement);
        expect(dacGated.map(b => b.id)).toEqual(DAC_BUNDLE_IDS);
        dacGated.forEach(bundle => {
            expect(bundle.fanDriver).toBe('dac');
            // The acknowledgement copy names the two required GP8403 addresses and
            // the forbidden one.
            expect(bundle.dacAddressAcknowledgement).toContain('0x58');
            expect(bundle.dacAddressAcknowledgement).toContain('0x5A');
            expect(bundle.dacAddressAcknowledgement).toContain('0x59');
        });
    });

    test('every fan-control bundle is a FULL room bundle (room sensors + fan), not a fan-only config', async () => {
        const { FAN_CONTROL_BUNDLES, isFullRoomBundle } = await import('../scripts/data/simple-bundles.js');
        FAN_CONTROL_BUNDLES.forEach(bundle => {
            expect(isFullRoomBundle(bundle)).toBe(true);
            expect(bundle.firmwareConfigString).toBe(FAN_CONFIG_BY_ID[bundle.id]);
            // Each carries a room sensor (VentIQ or AirIQ) AND a fan driver.
            const ws = bundle.wizardState;
            expect(ws.fan).not.toBe('none');
            expect(ws.ventiq !== 'none' || ws.airiq !== 'none').toBe(true);
            expect(ws.roomiq).toBe('roomiq');
        });
    });

    test('no fan-control bundle resolves to a standalone fan-only or TRIAC config', async () => {
        const { FAN_CONTROL_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const configs = FAN_CONTROL_BUNDLES.map(b => b.firmwareConfigString);
        FORBIDDEN_SIMPLE_CONFIGS.forEach(cfg => expect(configs).not.toContain(cfg));
        configs.forEach(cfg => {
            expect(cfg).not.toContain('FanTRIAC');
            expect(cfg).not.toContain('TRIAC');
            // Each is a full composition: it contains a room air sensor token.
            expect(/VentIQ|AirIQ/.test(cfg)).toBe(true);
            expect(cfg).toContain('RoomIQ');
        });
    });

    test('customer-facing fan-control fields expose no internal task/release/tracking IDs (WF-UX-008)', async () => {
        const { FAN_CONTROL_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const INTERNAL_ID_PATTERN = /RELEASE-[A-Z]+-\d|WF-IMPORT-[A-Z]+-\d|WF-TRIAC-\d|WF-HW-TEST|KIT-MATRIX-\d|HW-005|COMPLIANCE-\d|S360-300-BENCH|ROOM-BUNDLE-FAN-CONFIGS|FANDAC-I2C-ADDR|import-firmware-sources\.py|#\d{3}/;
        const customerFields = ['displayName', 'shortName', 'room', 'useCase', 'description', 'warning', 'dacAddressAcknowledgement'];
        FAN_CONTROL_BUNDLES.forEach(bundle => {
            customerFields.forEach(field => {
                expect(String(bundle[field] || '')).not.toMatch(INTERNAL_ID_PATTERN);
            });
            bundle.moduleSummary.forEach(item => expect(item).not.toMatch(INTERNAL_ID_PATTERN));
            // The internal mapping survives only in the developer-only upstreamRef.
            expect(bundle.upstreamRef).toMatch(/ROOM-BUNDLE-FAN-CONFIGS-001/);
        });
    });
});

/* ===========================================================================
   Part B — the import-readiness gate
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — import-readiness gate', () => {
    test('against the LIVE manifest, NO fan-control bundle is import-ready (nothing imported yet)', async () => {
        const { getExposableFanControlBundles } = await import('../scripts/data/simple-bundles.js');
        const manifest = readJson('manifest.json');
        const configs = (manifest.builds || []).map(b => b.config_string);
        expect(getExposableFanControlBundles(configs)).toEqual([]);
        // And none of the five configs is actually in the manifest.
        FAN_BUNDLE_IDS.forEach(id => {
            expect(configs).not.toContain(FAN_CONFIG_BY_ID[id]);
        });
    });

    test('a fan-control bundle becomes import-ready ONLY once its exact config is in the manifest', async () => {
        const { isFanControlBundleImportReady, findSimpleBundleById, FAN_CONTROL_BUNDLES, getExposableFanControlBundles } = await import('../scripts/data/simple-bundles.js');
        const pwm = FAN_CONTROL_BUNDLES.find(b => b.id === 'S360-KIT-BATH-P-PWM');
        // Empty manifest → not ready.
        expect(isFanControlBundleImportReady(pwm, [])).toBe(false);
        // Synthetic manifest containing the matching config → ready (and only it).
        const synthetic = ['Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-FanPWM-RoomIQ'];
        expect(isFanControlBundleImportReady(pwm, synthetic)).toBe(true);
        expect(getExposableFanControlBundles(synthetic).map(b => b.id)).toEqual(['S360-KIT-BATH-P-PWM']);
        // Accepts a Set too.
        expect(isFanControlBundleImportReady(pwm, new Set(synthetic))).toBe(true);
        // The gate never promotes a regular Simple bundle.
        expect(findSimpleBundleById('S360-KIT-BATH-P-PWM')).toBeNull();
    });

    test('the gate rejects a malformed / forbidden fan bundle even if its config is present', async () => {
        const { isFanControlBundleImportReady } = await import('../scripts/data/simple-bundles.js');
        // A fan-only (no room sensor) config must never pass, even if "in the manifest".
        const fanOnly = {
            id: 'BAD-FAN-ONLY',
            displayName: 'x', channel: 'preview', firmwareConfigString: 'Ceiling-POE-FanPWM',
            requiresPreviewAcknowledgement: true, requiresFanControlAcknowledgement: true,
            recommended: false, isDefault: false, buyable: false,
            wizardState: { mount: 'ceiling', power: 'poe', roomiq: 'none', airiq: 'none', ventiq: 'none', fan: 'pwm' }
        };
        expect(isFanControlBundleImportReady(fanOnly, ['Ceiling-POE-FanPWM'])).toBe(false);
        // A TRIAC config must never pass.
        const triac = {
            id: 'BAD-TRIAC',
            displayName: 'x', channel: 'preview', firmwareConfigString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            requiresPreviewAcknowledgement: true, requiresFanControlAcknowledgement: true,
            recommended: false, isDefault: false, buyable: false,
            wizardState: { mount: 'ceiling', power: 'poe', roomiq: 'roomiq', ventiq: 'ventiq', airiq: 'none', fan: 'triac' }
        };
        expect(isFanControlBundleImportReady(triac, ['Ceiling-POE-VentIQ-FanTRIAC-RoomIQ'])).toBe(false);
    });
});

/* ===========================================================================
   Part B.1 — wizardState ↔ config_string round-trip (real state.js)
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — each fan bundle wizardState resolves to its config_string', () => {
    const MODULE_SLOTS = ['airiq', 'ventiq', 'roomiq', 'fan', 'led'];

    test('parseConfigStringState(config) matches each fan bundle wizardState module slots', async () => {
        jest.resetModules();
        const { __testHooks } = await import('../scripts/state.js');
        const { FAN_CONTROL_BUNDLES } = await import('../scripts/data/simple-bundles.js');
        const { parseConfigStringState } = __testHooks;

        FAN_CONTROL_BUNDLES.forEach(bundle => {
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
   Part C — static markup: the staged DAC region + no leak today
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — static markup', () => {
    let html = '';
    let hero = null;

    beforeAll(() => {
        html = fs.readFileSync(HTML_PATH, 'utf-8');
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
        hero = document.querySelector('[data-simple-install]');
    });

    test('the analog-fan address-switch region is present, hidden by default, with a checkbox ack', () => {
        const region = hero.querySelector('[data-simple-bundle-dac-address]');
        expect(region).not.toBeNull();
        expect(region.hidden).toBe(true);
        const ack = hero.querySelector('[data-simple-bundle-dac-address-ack]');
        expect(ack).not.toBeNull();
        expect(ack.getAttribute('type')).toBe('checkbox');
    });

    test('the address-switch copy names 0x58 / 0x5A and the forbidden 0x59 and is not "verified"', () => {
        const region = hero.querySelector('[data-simple-bundle-dac-address]');
        const text = region.textContent;
        expect(text).toContain('0x58');
        expect(text).toContain('0x5A');
        expect(text).toContain('0x59');
        expect(text).toMatch(/not been physically verified/i);
        // No "stable" / "safe" / "certified" claim.
        expect(text).not.toMatch(/\b(certified|stable|safe)\b/i);
    });

    test('today the picker still shows exactly the original six cards (no fan-control card statically present)', () => {
        const cards = hero.querySelectorAll('[data-simple-bundle-card]');
        expect(cards).toHaveLength(6);
        const ids = Array.from(cards).map(c => c.getAttribute('data-simple-bundle-id'));
        FAN_BUNDLE_IDS.forEach(id => expect(ids).not.toContain(id));
    });

    test('no fan-driver / TRIAC token or full-composition fan config leaks into the static Simple surface', () => {
        const text = hero.textContent;
        ['FanPWM', 'FanDAC', 'FanTRIAC', 'TRIAC',
            'Ceiling-POE-VentIQ-FanPWM-RoomIQ', 'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
            'Ceiling-POE-AirIQ-FanRelay-RoomIQ', 'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
            'Ceiling-POE-AirIQ-FanDAC-RoomIQ'].forEach(token => {
            expect(text).not.toContain(token);
        });
        // No internal IDs leak into the staged region either.
        expect(text).not.toContain('FANDAC-I2C-ADDR-001');
        expect(text).not.toContain('ROOM-BUNDLE-FAN-CONFIGS-001');
    });
});

/* ===========================================================================
   Part D — controller: injection + gates (state.js / sw-update / a11y mocked)
   =========================================================================== */
const HERO_DOM = `
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <div class="simple-bundle-picker" data-simple-bundle-picker>
            <button data-simple-bundle-card data-simple-bundle-id="S360-KIT-BATH-P" data-simple-bundle-channel="stable" aria-checked="true" class="is-active"></button>
            <button data-simple-bundle-card data-simple-bundle-id="S360-KIT-KITCHEN-P" data-simple-bundle-channel="preview" aria-checked="false"></button>
        </div>
        <p data-simple-install-eyebrow>Stable firmware · v1.0.0</p>
        <h3 data-simple-bundle-selected-name>Bathroom Bundle — PoE</h3>
        <ul data-simple-install-summary></ul>
        <p data-simple-bundle-preview-note hidden aria-hidden="true"><span data-simple-bundle-preview-note-text></span></p>
        <div data-simple-bundle-fan-control hidden aria-hidden="true">
            <label><input type="checkbox" data-simple-bundle-fan-control-ack></label>
        </div>
        <div data-simple-bundle-dac-address hidden aria-hidden="true">
            <label><input type="checkbox" data-simple-bundle-dac-address-ack></label>
        </div>
        <label class="simple-install__confirm"><input type="checkbox" data-simple-install-confirm></label>
        <details data-simple-install-tech>
            <summary>Technical details</summary>
            <dd data-simple-install-tech-sku>S360-KIT-BATH-P</dd>
            <dd data-simple-install-tech-config>Ceiling-POE-VentIQ-RoomIQ</dd>
            <dd data-simple-install-tech-channel>Stable</dd>
            <dd data-simple-install-tech-artifact>x.bin</dd>
        </details>
        <button data-enter-advanced>Advanced install</button>
    </section>
    <div id="step-5">
        <p data-simple-install-cta><strong data-simple-install-cta-label>Install stable firmware.</strong></p>
        <input type="checkbox" data-preflash-acknowledge>
        <details data-preflight-details><summary>Preflight details</summary></details>
    </div>
`;

async function loadController({ dom = '', manifestConfigStrings = null } = {}) {
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
    if (manifestConfigStrings === null) {
        delete window.webflashManifestConfigStrings;
    } else {
        window.webflashManifestConfigStrings = manifestConfigStrings;
    }

    const mod = await import('../scripts/simple-install.js');
    return { mod, setState, setStep };
}

describe('WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — controller injection', () => {
    afterEach(() => {
        try { delete window.webflashManifestConfigStrings; } catch { /* ignore */ }
        window.history.replaceState({}, '', '/');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('with no matching firmware in the manifest, no fan-control card is injected', async () => {
        const { mod } = await loadController({ dom: HERO_DOM, manifestConfigStrings: ['Ceiling-POE-VentIQ-RoomIQ'] });
        mod.__testHooks.injectFanControlCards();
        const cards = document.querySelectorAll('[data-simple-bundle-card]');
        expect(cards).toHaveLength(2); // the fixture's two static cards, no fan card
        FAN_BUNDLE_IDS.forEach(id => {
            expect(document.querySelector(`[data-simple-bundle-id="${id}"]`)).toBeNull();
        });
    });

    test('once a fan config lands in the manifest, its card is injected exactly once and resolves to the exact config', async () => {
        const { mod, setState } = await loadController({
            dom: HERO_DOM,
            manifestConfigStrings: ['Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-FanPWM-RoomIQ']
        });
        mod.__testHooks.injectFanControlCards();
        mod.__testHooks.injectFanControlCards(); // idempotent

        const card = document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-PWM"]');
        expect(card).not.toBeNull();
        expect(document.querySelectorAll('[data-simple-bundle-id="S360-KIT-BATH-P-PWM"]')).toHaveLength(1);
        expect(card.getAttribute('data-simple-bundle-channel')).toBe('preview');
        expect(card.textContent).toMatch(/Preview/i);
        expect(card.textContent).toMatch(/Fan control/i);

        // Selecting it feeds the exact full-composition config's wizardState.
        setState.mockClear();
        card.click();
        expect(mod.__testHooks.getActiveBundleId()).toBe('S360-KIT-BATH-P-PWM');
        const applied = setState.mock.calls[setState.mock.calls.length - 1][0];
        expect(applied.power).toBe('poe');
        expect(applied.ventiq).toBe('ventiq');
        expect(applied.roomiq).toBe('roomiq');
        expect(applied.fan).toBe('pwm');
        // Preview note + fan-control region show; the analog region stays hidden.
        expect(document.querySelector('[data-simple-bundle-preview-note]').hidden).toBe(false);
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(false);
        expect(document.querySelector('[data-simple-bundle-dac-address]').hidden).toBe(true);
    });

    test('a PWM fan bundle stays blocked until BOTH the safety confirmation and the fan-control ack are checked', async () => {
        const { mod } = await loadController({
            dom: HERO_DOM,
            manifestConfigStrings: ['Ceiling-POE-VentIQ-FanPWM-RoomIQ']
        });
        mod.__testHooks.injectFanControlCards();
        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-PWM"]').click();

        const safety = document.querySelector('[data-simple-install-confirm]');
        const fanAck = document.querySelector('[data-simple-bundle-fan-control-ack]');
        const preflash = document.querySelector('[data-preflash-acknowledge]');

        safety.checked = true;
        safety.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(false); // fan-control ack still missing

        fanAck.checked = true;
        fanAck.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(true);
    });

    test('an analog (DAC) fan bundle additionally requires the address-switch ack — three gates, all AND-ed', async () => {
        const { mod } = await loadController({
            dom: HERO_DOM,
            manifestConfigStrings: ['Ceiling-POE-VentIQ-FanDAC-RoomIQ']
        });
        mod.__testHooks.injectFanControlCards();
        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-DAC"]').click();

        // The analog-fan region is revealed for a DAC bundle.
        expect(document.querySelector('[data-simple-bundle-dac-address]').hidden).toBe(false);
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(false);

        const safety = document.querySelector('[data-simple-install-confirm]');
        const fanAck = document.querySelector('[data-simple-bundle-fan-control-ack]');
        const dacAck = document.querySelector('[data-simple-bundle-dac-address-ack]');
        const preflash = document.querySelector('[data-preflash-acknowledge]');

        safety.checked = true;
        safety.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(false);

        fanAck.checked = true;
        fanAck.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(false); // address-switch ack still missing

        dacAck.checked = true;
        dacAck.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(true); // all three satisfied

        // Unticking the address-switch ack re-blocks the gate.
        dacAck.checked = false;
        dacAck.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preflash.checked).toBe(false);
    });

    test('switching back to the stable Bathroom bundle clears the fan-control + address-switch acks and hides both regions', async () => {
        const { mod } = await loadController({
            dom: HERO_DOM,
            manifestConfigStrings: ['Ceiling-POE-VentIQ-FanDAC-RoomIQ']
        });
        mod.__testHooks.injectFanControlCards();
        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P-DAC"]').click();
        const fanAck = document.querySelector('[data-simple-bundle-fan-control-ack]');
        const dacAck = document.querySelector('[data-simple-bundle-dac-address-ack]');
        fanAck.checked = true;
        dacAck.checked = true;

        document.querySelector('[data-simple-bundle-id="S360-KIT-BATH-P"]').click();
        expect(document.querySelector('[data-simple-bundle-fan-control]').hidden).toBe(true);
        expect(document.querySelector('[data-simple-bundle-dac-address]').hidden).toBe(true);
        expect(fanAck.checked).toBe(false);
        expect(dacAck.checked).toBe(false);
    });
});

/* ===========================================================================
   Part E — no-change invariants
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — install / firmware / policy surfaces unchanged', () => {
    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = fs.readFileSync(path.resolve(REPO_ROOT, '.github/workflows/firmware-publish.yml'), 'utf-8');
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('manifest stays at 9 builds with none of the five fan-control configs; kits.json stays Release-One-only', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(9);
        const configs = manifest.builds.map(b => b.config_string);
        Object.values(FAN_CONFIG_BY_ID).forEach(cfg => expect(configs).not.toContain(cfg));
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('firmware/sources.json has no source for any of the five fan-control configs', () => {
        const sources = readJson('firmware/sources.json');
        const list = Array.isArray(sources) ? sources : (sources.sources || []);
        const configs = list.map(s => s.config_string);
        Object.values(FAN_CONFIG_BY_ID).forEach(cfg => expect(configs).not.toContain(cfg));
    });

    test('no .bin / .meta.json exists on disk for any of the five fan-control configs', () => {
        const dir = path.resolve(REPO_ROOT, 'firmware/configurations');
        const files = fs.readdirSync(dir);
        ['FanPWM-RoomIQ', 'FanDAC-RoomIQ', 'AirIQ-FanRelay', 'AirIQ-FanPWM', 'AirIQ-FanDAC'].forEach(token => {
            expect(files.some(f => f.includes(token))).toBe(false);
        });
    });

    test('the SIMPLE_BUNDLES picker list is unchanged (still six, Bathroom stable default)', async () => {
        const { SIMPLE_BUNDLES, getDefaultSimpleBundle } = await import('../scripts/data/simple-bundles.js');
        expect(SIMPLE_BUNDLES).toHaveLength(6);
        const def = getDefaultSimpleBundle();
        expect(def.id).toBe('S360-KIT-BATH-P');
        expect(def.channel).toBe('stable');
        expect(def.recommended).toBe(true);
        expect(def.buyable).toBe(true);
    });
});
