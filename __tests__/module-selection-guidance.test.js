/**
 * Tests for the Step 4 module-selection guidance changes:
 *  - Bathroom Installation copy explains VentIQ vs AirIQ.
 *  - RoomIQ helper copy says it can pair with AirIQ or VentIQ.
 *  - Fan / Switching helper copy says variant choice changes firmware.
 *  - TRIAC variant copy is TRIAC-specific.
 *  - Step 4 firmware-target preview tracks the actual config string and
 *    surfaces a neutral warning when no matching build is published.
 *  - AirIQ/VentIQ exclusivity is unchanged.
 *  - RoomIQ does not conflict with AirIQ or VentIQ in the matrix.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, beforeEach, expect, test, jest } from '@jest/globals';

const HTML_PATH = path.resolve(process.cwd(), 'index.html');
let html = '';

beforeAll(() => {
    html = fs.readFileSync(HTML_PATH, 'utf-8');
});

function loadStep4Markup() {
    document.documentElement.innerHTML = html
        .replace(/^[\s\S]*?<body[^>]*>/i, '')
        .replace(/<\/body>[\s\S]*$/i, '');
}

describe('Step 4 static copy: customer-facing module-selection guidance', () => {
    beforeAll(() => {
        loadStep4Markup();
    });

    test('Bathroom Installation copy explains the VentIQ-vs-AirIQ swap', () => {
        const description = document.querySelector('.bathroom-toggle__description');
        expect(description).not.toBeNull();
        expect(description.textContent.trim()).toBe(
            'Use VentIQ instead of AirIQ for bathroom-focused air-quality sensing.'
        );
    });

    test('Bathroom Installation supporting copy explains mutual exclusivity', () => {
        const detail = document.querySelector('[data-bathroom-toggle-detail]');
        expect(detail).not.toBeNull();
        // The mutual-exclusivity language is what teaches users why AirIQ
        // disappears when bathroom mode is on.
        expect(detail.textContent).toMatch(/mutually exclusive/i);
        expect(detail.textContent).toMatch(/VentIQ is shown/i);
        expect(detail.textContent).toMatch(/AirIQ is hidden/i);
    });

    test('Bathroom checkbox is wired to its supporting copy via aria-describedby', () => {
        const checkbox = document.querySelector('input[name="bathroom"]');
        const detail = document.querySelector('[data-bathroom-toggle-detail]');
        expect(checkbox).not.toBeNull();
        expect(detail).not.toBeNull();
        // The descriptive copy must be announced with the checkbox so screen
        // readers understand the swap behaviour, not just the label.
        const describedBy = (checkbox.getAttribute('aria-describedby') || '').split(/\s+/);
        expect(describedBy).toContain(detail.id);
    });

    test('RoomIQ helper copy explains pairing with AirIQ or VentIQ', () => {
        const hint = document.querySelector('[data-roomiq-pairing-hint]');
        expect(hint).not.toBeNull();
        expect(hint.textContent.trim()).toBe(
            'RoomIQ can be used with either AirIQ or VentIQ.'
        );
    });

    test('RoomIQ pairing hint is announced with its toggle via aria-describedby', () => {
        const toggle = document.querySelector(
            '#roomiq-module-section input[type="checkbox"][data-module-toggle]'
        );
        const hint = document.querySelector('[data-roomiq-pairing-hint]');
        expect(toggle).not.toBeNull();
        expect(hint).not.toBeNull();
        const describedBy = (toggle.getAttribute('aria-describedby') || '').split(/\s+/);
        expect(describedBy).toContain(hint.id);
    });

    test('RoomIQ section does not advertise a conflict with AirIQ or VentIQ', () => {
        const roomiqSection = document.getElementById('roomiq-module-section');
        expect(roomiqSection).not.toBeNull();
        const conflictBadges = roomiqSection.querySelectorAll('[data-conflict-badge]');
        const conflictModules = Array.from(conflictBadges).map(
            badge => badge.getAttribute('data-conflict-module')
        );
        expect(conflictModules).not.toContain('airiq');
        expect(conflictModules).not.toContain('ventiq');
    });

    test('Fan/Switching helper copy explains the firmware impact', () => {
        const fanHint = document.querySelector('[data-fan-firmware-hint]');
        expect(fanHint).not.toBeNull();
        expect(fanHint.textContent).toMatch(/exact fan or switching board/i);
        expect(fanHint.textContent).toMatch(/changes the firmware/i);
    });

    test('Fan/Switching variant warning lists the four driver builds', () => {
        const variantWarning = document.querySelector('[data-fan-variant-warning]');
        expect(variantWarning).not.toBeNull();
        const text = variantWarning.textContent;
        expect(text).toMatch(/Relay/);
        expect(text).toMatch(/PWM/);
        expect(text).toMatch(/DAC/);
        expect(text).toMatch(/TRIAC/);
        expect(text).toMatch(/different firmware/i);
    });

    test('WF-TRIAC-001 — TRIAC card carries TRIAC-specific advanced/manual-warning firmware-target copy', () => {
        const triacHint = document.querySelector('[data-firmware-impact="fan-triac"]');
        expect(triacHint).not.toBeNull();
        // WF-TRIAC-001 — the hint singles out TRIAC AND surfaces the
        // advanced/manual-warning posture so users understand it is not
        // installable without acknowledging the warning AND a future
        // imported artifact.
        expect(triacHint.textContent).toMatch(/Sense360 TRIAC/i);
        expect(triacHint.textContent).toMatch(/advanced\/manual-warning/i);
        expect(triacHint.textContent).toMatch(/acknowledg/i);
        expect(triacHint.textContent).toMatch(/imported/i);

        const triacCard = triacHint.closest('[data-module-card="fan"][data-variant="triac"]');
        expect(triacCard).not.toBeNull();
    });

    test('VentIQ section carries firmware-target copy explaining the AirIQ swap', () => {
        const hint = document.querySelector('[data-firmware-impact="ventiq"]');
        expect(hint).not.toBeNull();
        expect(hint.textContent).toMatch(/VentIQ firmware target/i);
        expect(hint.textContent).toMatch(/instead of AirIQ/i);
    });

    test('RoomIQ section carries a firmware-impact hint', () => {
        const hint = document.querySelector('[data-firmware-impact="roomiq"]');
        expect(hint).not.toBeNull();
        expect(hint.textContent).toMatch(/Adds RoomIQ to the firmware target/i);
    });

    test('Step 4 ships the firmware-target preview block with a heading and warning slot', () => {
        const preview = document.getElementById('firmware-target-preview');
        expect(preview).not.toBeNull();

        const heading = preview.querySelector('.firmware-target-preview__heading');
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toMatch(/Firmware target preview/i);

        const value = preview.querySelector('[data-firmware-target-preview-value]');
        expect(value).not.toBeNull();

        const warning = preview.querySelector('[data-firmware-target-preview-warning]');
        expect(warning).not.toBeNull();
        // Default state: hidden until we know the target is unpublished.
        expect(warning.hasAttribute('hidden')).toBe(true);
        // WF-UX-002 retargets this warning to the canonical no-build body
        // shared with Step 5 and the sidebar firmware card.
        expect(warning.textContent).toMatch(/Adjust your hardware choices/i);

        // The preview lives inside Step 4 so users see it before reaching review.
        const step4 = preview.closest('#step-4');
        expect(step4).not.toBeNull();
    });
});

describe('module-requirements: RoomIQ stays compatible with AirIQ and VentIQ', () => {
    test('the RoomIQ matrix entry declares no conflicts', async () => {
        const { MODULE_REQUIREMENT_MATRIX } = await import('../scripts/data/module-requirements.js');
        const roomiq = MODULE_REQUIREMENT_MATRIX.roomiq;
        expect(roomiq).toBeTruthy();
        expect(Array.isArray(roomiq.variants.roomiq.conflicts)).toBe(true);
        expect(roomiq.variants.roomiq.conflicts).toEqual([]);
    });

    test('AirIQ and VentIQ remain mutually exclusive in the requirement matrix', async () => {
        const { MODULE_REQUIREMENT_MATRIX } = await import('../scripts/data/module-requirements.js');
        const airiqConflicts = MODULE_REQUIREMENT_MATRIX.airiq.variants.airiq.conflicts || [];
        const ventiqConflicts = MODULE_REQUIREMENT_MATRIX.ventiq.variants.ventiq.conflicts || [];

        expect(airiqConflicts.some(conflict => conflict.module === 'ventiq')).toBe(true);
        expect(ventiqConflicts.some(conflict => conflict.module === 'airiq')).toBe(true);
    });

    test('Neither AirIQ nor VentIQ list RoomIQ as a conflict', async () => {
        const { MODULE_REQUIREMENT_MATRIX } = await import('../scripts/data/module-requirements.js');
        const airiqConflicts = MODULE_REQUIREMENT_MATRIX.airiq.variants.airiq.conflicts || [];
        const ventiqConflicts = MODULE_REQUIREMENT_MATRIX.ventiq.variants.ventiq.conflicts || [];

        expect(airiqConflicts.every(conflict => conflict.module !== 'roomiq')).toBe(true);
        expect(ventiqConflicts.every(conflict => conflict.module !== 'roomiq')).toBe(true);
    });
});

async function loadStateModuleWithFreshDom() {
    jest.resetModules();
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ builds: [] })
    }));
    Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        configurable: true
    });
    Object.defineProperty(global.navigator, 'serial', {
        value: { getPorts: jest.fn(() => Promise.resolve([])) },
        configurable: true
    });
    return import('../scripts/state.js');
}

function renderStep4Dom() {
    document.body.innerHTML = `
        <div id="step-1" class="wizard-step">
            <input type="radio" name="mounting" value="ceiling" checked>
        </div>
        <div id="step-2" class="wizard-step" hidden></div>
        <div id="step-3" class="wizard-step" hidden>
            <input type="radio" name="power" value="poe" checked>
            <input type="radio" name="power" value="usb">
        </div>
        <div id="step-4" class="wizard-step" hidden>
            <div id="module-availability-hint"></div>
            <section class="bathroom-toggle-section" id="bathroom-toggle-section" style="display: none;">
                <input type="checkbox" name="bathroom" class="bathroom-toggle__checkbox">
            </section>
            <section class="module-collection">
                <section class="module-group" data-module-group="roomiq" id="roomiq-module-section">
                    <input type="checkbox" data-module-toggle data-module-key="roomiq" data-variant-on="roomiq">
                    <span class="module-group__firmware-hint" data-firmware-impact="roomiq" hidden>Adds RoomIQ to the firmware target.</span>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="roomiq" value="none" checked>
                        <input type="radio" name="roomiq" value="roomiq">
                    </div>
                </section>
                <section class="module-group" data-module-group="airiq" id="airiq-module-section">
                    <input type="checkbox" data-module-toggle data-module-key="airiq" data-variant-on="airiq">
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="airiq" value="none" checked>
                        <input type="radio" name="airiq" value="airiq">
                    </div>
                </section>
                <section class="module-group" data-module-group="ventiq" id="ventiq-module-section" style="display: none;">
                    <input type="checkbox" data-module-toggle data-module-key="ventiq" data-variant-on="ventiq">
                    <span class="module-group__firmware-hint" data-firmware-impact="ventiq" hidden>Uses the VentIQ firmware target instead of AirIQ.</span>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="ventiq" value="none" checked>
                        <input type="radio" name="ventiq" value="ventiq">
                    </div>
                </section>
                <section class="module-group" data-module-group="fan" id="fan-module-section" data-expanded="false">
                    <input type="radio" name="fan" value="none" checked>
                    <input type="radio" name="fan" value="relay">
                    <input type="radio" name="fan" value="pwm">
                    <input type="radio" name="fan" value="analog">
                    <input type="radio" name="fan" value="triac">
                </section>
                <section class="module-group" data-module-group="led" id="led-module-section">
                    <input type="checkbox" data-module-toggle data-module-key="led" data-variant-on="led">
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="led" value="none" checked>
                        <input type="radio" name="led" value="led">
                    </div>
                </section>
            </section>
            <section id="firmware-target-preview" data-firmware-target-preview>
                <h3 class="firmware-target-preview__heading">Firmware target preview</h3>
                <code class="firmware-target-preview__value" data-firmware-target-preview-value>Select mounting and power to generate a firmware target.</code>
                <p class="firmware-target-preview__warning" data-firmware-target-preview-warning hidden>Adjust your hardware choices or pick a supported kit to find a matching build.</p>
            </section>
        </div>
        <div id="step-5" class="wizard-step" hidden></div>
    `;
}

describe('buildFirmwareTargetPreviewString composes the canonical config string', () => {
    test('returns empty string until mounting and power are picked', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        const { buildFirmwareTargetPreviewString } = stateModule.__testHooks;

        expect(buildFirmwareTargetPreviewString({})).toBe('');
        expect(buildFirmwareTargetPreviewString({ mounting: 'ceiling' })).toBe('');
        expect(buildFirmwareTargetPreviewString({ power: 'poe' })).toBe('');
    });

    test('builds Ceiling-POE-AirIQ from a basic ceiling+POE+AirIQ selection', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        const { buildFirmwareTargetPreviewString } = stateModule.__testHooks;

        const config = buildFirmwareTargetPreviewString({
            mounting: 'ceiling',
            power: 'poe',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'none',
            roomiq: 'none',
            led: 'none'
        });

        expect(config).toBe('Ceiling-POE-AirIQ');
    });

    test('builds Ceiling-POE-VentIQ-FanTRIAC-RoomIQ for the worked PR example', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        const { buildFirmwareTargetPreviewString } = stateModule.__testHooks;

        const config = buildFirmwareTargetPreviewString({
            mounting: 'ceiling',
            power: 'poe',
            bathroom: true,
            airiq: 'none',
            ventiq: 'ventiq',
            fan: 'triac',
            roomiq: 'roomiq',
            led: 'none'
        });

        expect(config).toBe('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ');
    });

    test('appends LED segment when the LED ring is selected', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        const { buildFirmwareTargetPreviewString } = stateModule.__testHooks;

        const config = buildFirmwareTargetPreviewString({
            mounting: 'ceiling',
            power: 'usb',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'none',
            roomiq: 'none',
            led: 'led'
        });

        expect(config).toBe('Ceiling-USB-AirIQ-LED');
    });
});

describe('Step 4 firmware-target preview reacts to module selection', () => {
    beforeEach(() => {
        // Pre-populate URL state so initializeWizard pre-selects the
        // mounting + power values that drive the preview composer.
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&step=4');
        renderStep4Dom();
    });

    test('preview displays the assembled config string when RoomIQ is toggled', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        stateModule.__testHooks.initializeWizard();

        // Toggle RoomIQ on; then trigger the same updateConfiguration path
        // user interaction would invoke. We do this by checking the radio
        // and dispatching the change event the wizard listens for.
        const roomiqOn = document.querySelector('input[name="roomiq"][value="roomiq"]');
        roomiqOn.checked = true;
        roomiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const value = document.querySelector('[data-firmware-target-preview-value]');
        // No air-quality module selected → config string is Ceiling-POE-RoomIQ.
        expect(value.textContent).toBe('Ceiling-POE-RoomIQ');
    });

    test('preview includes -VentIQ when bathroom + VentIQ are selected', async () => {
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&bathroom=true&step=4');
        const stateModule = await loadStateModuleWithFreshDom();
        stateModule.__testHooks.initializeWizard();

        const ventiqOn = document.querySelector('input[name="ventiq"][value="ventiq"]');
        ventiqOn.checked = true;
        ventiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const value = document.querySelector('[data-firmware-target-preview-value]');
        expect(value.textContent).toContain('-VentIQ');
        expect(value.textContent).not.toContain('-AirIQ');
    });

    test('preview includes -FanTRIAC when the TRIAC variant is selected', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        stateModule.__testHooks.initializeWizard();

        const triac = document.querySelector('input[name="fan"][value="triac"]');
        triac.checked = true;
        triac.dispatchEvent(new Event('change', { bubbles: true }));

        const value = document.querySelector('[data-firmware-target-preview-value]');
        expect(value.textContent).toContain('-FanTRIAC');
    });

    test('Ceiling + POE + VentIQ + FanTRIAC + RoomIQ renders the worked PR example', async () => {
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&bathroom=true&step=4');
        const stateModule = await loadStateModuleWithFreshDom();
        stateModule.__testHooks.initializeWizard();

        const ventiqOn = document.querySelector('input[name="ventiq"][value="ventiq"]');
        ventiqOn.checked = true;
        ventiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const triac = document.querySelector('input[name="fan"][value="triac"]');
        triac.checked = true;
        triac.dispatchEvent(new Event('change', { bubbles: true }));

        const roomiqOn = document.querySelector('input[name="roomiq"][value="roomiq"]');
        roomiqOn.checked = true;
        roomiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const value = document.querySelector('[data-firmware-target-preview-value]');
        expect(value.textContent).toBe('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ');
    });

    test('preview prompt asks for mounting/power until both are picked', async () => {
        // Reset URL to a clean slate so the wizard does not pre-populate
        // power from a previous test, then re-render DOM without any
        // checked radios. updateFirmwareTargetPreview must report the
        // incomplete state.
        window.history.replaceState(null, '', window.location.pathname);
        document.body.innerHTML = `
            <div id="step-4" class="wizard-step">
                <section id="firmware-target-preview" data-firmware-target-preview>
                    <code class="firmware-target-preview__value" data-firmware-target-preview-value></code>
                    <p class="firmware-target-preview__warning" data-firmware-target-preview-warning hidden></p>
                </section>
            </div>
        `;

        const stateModule = await loadStateModuleWithFreshDom();
        const { updateFirmwareTargetPreview, replaceState } = stateModule;
        // Clear configuration state so neither mounting nor power is set.
        replaceState({ mounting: null, power: null });
        stateModule.__testHooks.updateFirmwareTargetPreview();

        const value = document.querySelector('[data-firmware-target-preview-value]');
        expect(value.textContent).toMatch(/Select mounting and power/i);

        const root = document.getElementById('firmware-target-preview');
        expect(root.dataset.firmwareTargetState).toBe('incomplete');
    });

    test('warning appears when the assembled target is not in the manifest', async () => {
        // Manifest fetch returns a manifest that does NOT include the
        // RoomIQ-bearing config we are about to assemble. The preview
        // should still show the assembled config string and surface the
        // canonical WF-UX-002 no-build body warning.
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&step=4');
        jest.resetModules();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                builds: [
                    { config_string: 'Ceiling-POE-AirIQ' }
                ]
            })
        }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });

        const stateModule = await import('../scripts/state.js');
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        const roomiqOn = document.querySelector('input[name="roomiq"][value="roomiq"]');
        roomiqOn.checked = true;
        roomiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const airiqOn = document.querySelector('input[name="airiq"][value="airiq"]');
        airiqOn.checked = true;
        airiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const value = document.querySelector('[data-firmware-target-preview-value]');
        expect(value.textContent).toBe('Ceiling-POE-AirIQ-RoomIQ');

        const warning = document.querySelector('[data-firmware-target-preview-warning]');
        expect(warning.hasAttribute('hidden')).toBe(false);
        // WF-UX-002: warning text is sourced from the central readiness
        // helper's no-build body so the wording stays in lockstep with the
        // Step 5 heading and the sidebar firmware mini-card.
        expect(warning.textContent.trim()).toBe('Adjust your hardware choices or pick a supported kit to find a matching build.');

        const root = document.getElementById('firmware-target-preview');
        expect(root.dataset.firmwareTargetState).toBe('unpublished');
    });

    test('warning is hidden when the assembled target matches a manifest build', async () => {
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&step=4');
        jest.resetModules();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                builds: [
                    { config_string: 'Ceiling-POE-AirIQ' }
                ]
            })
        }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });

        const stateModule = await import('../scripts/state.js');
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        const airiqOn = document.querySelector('input[name="airiq"][value="airiq"]');
        airiqOn.checked = true;
        airiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        const value = document.querySelector('[data-firmware-target-preview-value]');
        expect(value.textContent).toBe('Ceiling-POE-AirIQ');

        const warning = document.querySelector('[data-firmware-target-preview-warning]');
        expect(warning.hasAttribute('hidden')).toBe(true);

        const root = document.getElementById('firmware-target-preview');
        expect(root.dataset.firmwareTargetState).toBe('available');
    });
});

describe('Module firmware-impact hints reveal only when the module is selected', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&step=4');
        renderStep4Dom();
    });

    test('RoomIQ firmware hint stays hidden until RoomIQ is selected', async () => {
        const stateModule = await loadStateModuleWithFreshDom();
        stateModule.__testHooks.initializeWizard();

        const hint = document.querySelector('[data-firmware-impact="roomiq"]');
        expect(hint.hidden).toBe(true);

        const roomiqOn = document.querySelector('input[name="roomiq"][value="roomiq"]');
        roomiqOn.checked = true;
        roomiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        expect(hint.hidden).toBe(false);
    });

    test('VentIQ firmware hint reveals when VentIQ is picked', async () => {
        window.history.replaceState(null, '', '?mount=ceiling&power=poe&bathroom=true&step=4');
        const stateModule = await loadStateModuleWithFreshDom();
        stateModule.__testHooks.initializeWizard();

        const hint = document.querySelector('[data-firmware-impact="ventiq"]');
        expect(hint.hidden).toBe(true);

        const ventiqOn = document.querySelector('input[name="ventiq"][value="ventiq"]');
        ventiqOn.checked = true;
        ventiqOn.dispatchEvent(new Event('change', { bubbles: true }));

        expect(hint.hidden).toBe(false);
    });
});

describe('Existing kit/SKU mode behaviour stays unchanged', () => {
    test('kits.json continues to map to manifest config strings (no roomiq/led drift)', async () => {
        const kitsPath = path.resolve(process.cwd(), 'scripts/data/kits.json');
        const manifestPath = path.resolve(process.cwd(), 'manifest.json');
        const kits = JSON.parse(fs.readFileSync(kitsPath, 'utf-8'));
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        const manifestConfigs = new Set(
            manifest.builds.map(build => build.config_string).filter(Boolean)
        );

        // Every kit's firmware_config_string must still resolve to a build
        // in the manifest. If the new RoomIQ/LED segments leaked into the
        // canonical kit definitions this would fail because none of the
        // existing manifest builds carry those tokens.
        for (const kit of kits.kits) {
            expect(manifestConfigs.has(kit.firmware_config_string)).toBe(true);
        }
    });
});

describe('WF-UX-007 — Step 4 primary labels are outcome-first; technical names move to the secondary tier', () => {
    beforeAll(() => {
        loadStep4Markup();
    });

    // Pairs the Step 4 toggle-group selector with its outcome-first primary
    // label and its expected technical-secondary "<Friendly name> · <SKU>"
    // string. Tests below assert that the primary title element carries the
    // outcome wording (not the Friendly name on its own) and that the
    // Friendly name + SKU appear in the .module-group__meta line.
    const toggleGroupCases = [
        {
            key: 'roomiq',
            primary: 'Room sensing',
            technicalName: 'Sense360 RoomIQ',
            sku: 'S360-200',
        },
        {
            key: 'airiq',
            primary: 'Air quality sensing',
            technicalName: 'Sense360 AirIQ',
            sku: 'S360-210',
        },
        {
            key: 'ventiq',
            primary: 'Bathroom air sensing',
            technicalName: 'Sense360 VentIQ',
            sku: 'S360-211',
        },
        {
            key: 'led',
            primary: 'Status LED ring',
            technicalName: 'Sense360 LED',
            sku: 'S360-300',
        },
    ];

    test.each(toggleGroupCases)(
        '$key: primary title is outcome-first ("$primary"); Friendly name + SKU live in the meta tier',
        ({ key, primary, technicalName, sku }) => {
            const section = document.querySelector(`[data-module-group="${key}"]`);
            const title = section?.querySelector('.module-group__title');
            const meta = section?.querySelector('.module-group__meta');

            expect(title?.textContent.trim()).toBe(primary);
            expect(title?.textContent).not.toContain(technicalName);
            expect(title?.textContent).not.toContain(sku);

            const metaText = meta?.textContent.replace(/\s+/g, ' ').trim() || '';
            expect(metaText).toContain(technicalName);
            expect(metaText).toContain(sku);
            expect(metaText).toContain('·');
        }
    );

    const fanVariantCases = [
        {
            variant: 'relay',
            primary: 'Fan relay control',
            technicalName: 'Sense360 Relay',
            sku: 'S360-310',
        },
        {
            variant: 'pwm',
            primary: 'PWM fan control',
            technicalName: 'Sense360 PWM',
            sku: 'S360-311',
        },
        {
            variant: 'analog',
            primary: 'Analog fan control',
            technicalName: 'Sense360 DAC',
            sku: 'S360-312',
        },
        {
            variant: 'triac',
            primary: 'TRIAC fan control',
            technicalName: 'Sense360 TRIAC',
            sku: 'S360-320',
        },
    ];

    test.each(fanVariantCases)(
        'fan card variant=$variant: primary is outcome-first ("$primary"); meta line carries "$technicalName · $sku"',
        ({ variant, primary, technicalName, sku }) => {
            const card = document.querySelector(`[data-module-card="fan"][data-variant="${variant}"]`);
            const title = card?.querySelector('.module-card__title');
            const meta = card?.querySelector('.module-card__meta');

            expect(title?.textContent.trim()).toBe(primary);
            expect(title?.textContent).not.toContain(technicalName);
            expect(title?.textContent).not.toContain(sku);

            const metaText = meta?.textContent.replace(/\s+/g, ' ').trim() || '';
            expect(metaText).toBe(`${technicalName} · ${sku}`);
        }
    );

    test('Fan / Switching group H3 reads "Fan and switching control"; chevron aria-label matches', () => {
        const fanSection = document.querySelector('[data-module-group="fan"]');
        const heading = fanSection?.querySelector('h3.module-group__title');
        expect(heading?.textContent.trim()).toBe('Fan and switching control');

        const chevron = fanSection?.querySelector('[data-module-group-toggle]');
        expect(chevron?.getAttribute('aria-label')).toBe('Change fan and switching control');
    });

    test('AirIQ / VentIQ / RoomIQ / LED are no longer the standalone primary card label anywhere in Step 4', () => {
        const technicalOnlyLabels = [
            'AirIQ',
            'VentIQ',
            'RoomIQ',
            'LED',
        ];

        // Collect every primary title element in Step 4 module markup.
        const primarySelectors = [
            '[data-module-group="roomiq"] .module-group__title',
            '[data-module-group="airiq"] .module-group__title',
            '[data-module-group="ventiq"] .module-group__title',
            '[data-module-group="led"] .module-group__title',
            '[data-module-card="fan"] .module-card__title',
        ];
        const primaryTitles = primarySelectors.flatMap(selector =>
            Array.from(document.querySelectorAll(selector))
        );

        for (const element of primaryTitles) {
            const text = element.textContent.trim();
            for (const technical of technicalOnlyLabels) {
                expect(text).not.toBe(technical);
            }
        }
    });

    test('module-card__specs definition lists still expose SKU / Core / Headers for every fan variant', () => {
        // Pin/header technical detail must stay discoverable in the
        // secondary spec tier so support can still reference J3/J4/etc.
        const fanCardsWithSpecs = ['relay', 'pwm', 'analog', 'triac'];
        for (const variant of fanCardsWithSpecs) {
            const card = document.querySelector(`[data-module-card="fan"][data-variant="${variant}"]`);
            const specs = card?.querySelector('.module-card__specs');
            expect(specs).not.toBeNull();

            const labels = Array.from(specs.querySelectorAll('dt')).map(dt => dt.textContent.trim());
            expect(labels).toEqual(expect.arrayContaining(['SKU', 'Core', 'Headers']));
        }
    });

    test('locked bathroom / firmware-target / RoomIQ pairing copy is preserved (WF-UX-002/004 invariants)', () => {
        // WF-UX-007 must not regress the locked secondary-copy strings that
        // explain *why* AirIQ vs VentIQ swap and how Step 5 firmware is
        // resolved. These all live outside the primary title surface and
        // remain intentionally jargon-bearing.
        const bathroomDescription = document.querySelector('.bathroom-toggle__description');
        expect(bathroomDescription?.textContent.trim()).toBe(
            'Use VentIQ instead of AirIQ for bathroom-focused air-quality sensing.'
        );

        const roomiqHint = document.querySelector('[data-roomiq-pairing-hint]');
        expect(roomiqHint?.textContent.trim()).toBe(
            'RoomIQ can be used with either AirIQ or VentIQ.'
        );

        const ventiqFirmwareHint = document.querySelector('[data-firmware-impact="ventiq"]');
        expect(ventiqFirmwareHint?.textContent).toMatch(/VentIQ firmware target/i);
        expect(ventiqFirmwareHint?.textContent).toMatch(/instead of AirIQ/i);

        const fanVariantWarning = document.querySelector('[data-fan-variant-warning]');
        expect(fanVariantWarning?.textContent).toMatch(/Relay/);
        expect(fanVariantWarning?.textContent).toMatch(/PWM/);
        expect(fanVariantWarning?.textContent).toMatch(/DAC/);
        expect(fanVariantWarning?.textContent).toMatch(/TRIAC/);
    });
});
