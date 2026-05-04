import { jest } from '@jest/globals';

const ceilingPwrAirIqOnlyManifest = {
    builds: [
        {
            chipFamily: 'ESP32-S3',
            version: '1.0.0',
            channel: 'stable',
            config_string: 'Ceiling-PWR-AirIQ',
            mounting: 'Ceiling',
            power: 'PWR',
            modules: ['AirIQ'],
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-PWR-AirIQ-v1.0.0-stable.bin', offset: 0 }]
        }
    ]
};

function renderWizardDom() {
    document.body.innerHTML = `
        <div id="step-1" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-2" class="wizard-step" hidden></div>
        <div id="step-3" class="wizard-step" hidden>
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="power" value="usb">
            <input type="radio" name="power" value="poe">
            <input type="radio" name="power" value="pwr">
        </div>
        <div id="step-4" class="wizard-step" hidden>
            <div id="module-availability-hint"></div>
            <section class="bathroom-toggle-section" id="bathroom-toggle-section" style="display: none;">
                <label class="bathroom-toggle__label">
                    <input type="checkbox" name="bathroom" class="bathroom-toggle__checkbox">
                </label>
            </section>
            <section class="module-collection">
                <section class="module-group module-group--toggle" data-module-group="airiq" id="airiq-module-section" data-expanded="false">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" class="module-group__toggle-input" data-module-toggle data-module-key="airiq" data-variant-on="airiq">
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="airiq" value="none" checked>
                        <input type="radio" name="airiq" value="airiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="ventiq" id="ventiq-module-section" data-expanded="false" style="display: none;">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" class="module-group__toggle-input" data-module-toggle data-module-key="ventiq" data-variant-on="ventiq">
                    </label>
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
            </section>
            <input type="radio" name="voice" value="none" checked>
        </div>
        <div id="step-5" class="wizard-step" hidden></div>
    `;
}

beforeEach(() => {
    jest.resetModules();
    renderWizardDom();
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(ceilingPwrAirIqOnlyManifest)
    }));
});

async function selectCeilingPwr(stateModule) {
    await stateModule.__testHooks.manifestReadyPromise();

    const ceilingInput = document.querySelector('input[name="mounting"][value="ceiling"]');
    ceilingInput.checked = true;
    ceilingInput.dispatchEvent(new Event('change', { bubbles: true }));

    const pwrInput = document.querySelector('input[name="power"][value="pwr"]');
    pwrInput.checked = true;
    pwrInput.dispatchEvent(new Event('change', { bubbles: true }));
}

test('AirIQ "none" stays selectable on Ceiling+PWR even when manifest only ships Ceiling-PWR-AirIQ', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    await selectCeilingPwr(stateModule);

    const airiqNone = document.querySelector('input[name="airiq"][value="none"]');
    const airiqOn = document.querySelector('input[name="airiq"][value="airiq"]');

    expect(airiqNone.disabled).toBe(false);
    expect(airiqOn.disabled).toBe(false);
    expect(stateModule.getState().airiq).toBe('none');

    const airiqToggle = document.querySelector('[data-module-toggle][data-module-key="airiq"]');
    expect(airiqToggle.disabled).toBe(false);
    expect(airiqToggle.checked).toBe(false);
});

test('AirIQ checkbox can be toggled off on Ceiling+PWR without the wizard reverting the selection', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    await selectCeilingPwr(stateModule);

    const airiqToggle = document.querySelector('[data-module-toggle][data-module-key="airiq"]');

    airiqToggle.checked = true;
    airiqToggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(stateModule.getState().airiq).toBe('airiq');

    airiqToggle.checked = false;
    airiqToggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(stateModule.getState().airiq).toBe('none');
    expect(airiqToggle.checked).toBe(false);
});

test('VentIQ toggle is selectable on Ceiling+PWR when bathroom mode is enabled', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    await selectCeilingPwr(stateModule);

    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    bathroomCheckbox.checked = true;
    bathroomCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const ventiqOn = document.querySelector('input[name="ventiq"][value="ventiq"]');
    expect(ventiqOn.disabled).toBe(false);

    const ventiqToggle = document.querySelector('[data-module-toggle][data-module-key="ventiq"]');
    expect(ventiqToggle.disabled).toBe(false);

    ventiqToggle.checked = true;
    ventiqToggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(stateModule.getState().ventiq).toBe('ventiq');
    expect(stateModule.getState().airiq).toBe('none');
});
