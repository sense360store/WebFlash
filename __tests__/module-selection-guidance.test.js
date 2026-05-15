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

    test('TRIAC card carries TRIAC-specific firmware-target copy', () => {
        const triacHint = document.querySelector('[data-firmware-impact="fan-triac"]');
        expect(triacHint).not.toBeNull();
        // The hint must single out TRIAC so users understand it is not
        // interchangeable with the other fan drivers.
        expect(triacHint.textContent).toMatch(/TRIAC-specific/i);
        expect(triacHint.textContent).toMatch(/fan firmware target/i);

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
