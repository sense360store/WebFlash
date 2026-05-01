import { jest } from '@jest/globals';

const minimalManifest = { builds: [] };

function renderWizardDom() {
    document.body.innerHTML = `
        <div id="step-1" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="mounting" value="wall">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-2" class="wizard-step" hidden></div>
        <div id="step-3" class="wizard-step" hidden>
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="power" value="usb">
            <input type="radio" name="power" value="poe">
        </div>
        <div id="step-4" class="wizard-step" hidden>
            <div id="module-availability-hint"></div>
            <section class="bathroom-toggle-section" id="bathroom-toggle-section" style="display: none;">
                <label class="bathroom-toggle__label">
                    <input type="checkbox" name="bathroom" class="bathroom-toggle__checkbox">
                </label>
            </section>
            <section class="module-collection">
                <section class="module-group" data-module-group="airiq" id="airiq-module-section" data-expanded="false">
                    <input type="radio" name="airiq" value="none" checked>
                    <input type="radio" name="airiq" value="airiq">
                </section>
                <section class="module-group" data-module-group="ventiq" id="ventiq-module-section" data-expanded="false" style="display: none;">
                    <input type="radio" name="ventiq" value="none" checked>
                    <input type="radio" name="ventiq" value="airiq">
                </section>
                <section class="module-group" data-module-group="fan" id="fan-module-section" data-expanded="false">
                    <input type="radio" name="fan" value="none" checked>
                    <input type="radio" name="fan" value="relay">
                    <input type="radio" name="fan" value="pwm">
                    <input type="radio" name="fan" value="dac">
                    <input type="radio" name="fan" value="triac">
                </section>
            </section>
        </div>
        <div id="step-5" class="wizard-step" hidden></div>
    `;
}

beforeAll(() => {
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(minimalManifest)
    }));
});

beforeEach(() => {
    jest.resetModules();
    renderWizardDom();
});

test('bathroom checkbox toggles configuration.bathroom and switches AirIQ <-> VentIQ section', async () => {
    const stateModule = await import('../scripts/state.js');

    // Initialize wizard
    stateModule.__testHooks.initializeWizard();

    // Set mounting to ceiling
    const ceilingInput = document.querySelector('input[name="mounting"][value="ceiling"]');
    ceilingInput.checked = true;
    ceilingInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Verify bathroom section is visible
    const bathroomSection = document.getElementById('bathroom-toggle-section');
    expect(bathroomSection.style.display).not.toBe('none');

    // Verify state is ceiling/false bathroom and AirIQ is shown, VentIQ hidden
    let state = stateModule.getState();
    expect(state.mounting).toBe('ceiling');
    expect(state.bathroom).toBe(false);

    const airIQSection = document.getElementById('airiq-module-section');
    const ventIQSection = document.getElementById('ventiq-module-section');
    expect(airIQSection.style.display).not.toBe('none');
    expect(ventIQSection.style.display).toBe('none');

    // Check bathroom checkbox -> should switch from AirIQ to VentIQ
    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    expect(bathroomCheckbox).toBeTruthy();
    bathroomCheckbox.checked = true;
    bathroomCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    state = stateModule.getState();
    expect(state.bathroom).toBe(true);

    // VentIQ section should be visible, AirIQ section should be hidden
    expect(ventIQSection.style.display).not.toBe('none');
    expect(airIQSection.style.display).toBe('none');

    // Unchecking should switch back: AirIQ visible, VentIQ hidden
    bathroomCheckbox.checked = false;
    bathroomCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    state = stateModule.getState();
    expect(state.bathroom).toBe(false);
    expect(airIQSection.style.display).not.toBe('none');
    expect(ventIQSection.style.display).toBe('none');
});

test('bathroom state persists in URL after toggle', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    const ceilingInput = document.querySelector('input[name="mounting"][value="ceiling"]');
    ceilingInput.checked = true;
    ceilingInput.dispatchEvent(new Event('change', { bubbles: true }));

    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    bathroomCheckbox.checked = true;
    bathroomCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const url = window.location.search;
    expect(url).toContain('bathroom=true');
});

test('bathroom checkbox is restored from URL when reloading', async () => {
    // Simulate URL with bathroom=true
    window.history.replaceState(null, '', '?mount=ceiling&power=usb&bathroom=true&step=4');

    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    const state = stateModule.getState();
    expect(state.mounting).toBe('ceiling');
    expect(state.bathroom).toBe(true);

    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    expect(bathroomCheckbox.checked).toBe(true);
});

test('unchecking bathroom on ceiling clears bathroom and ventiq from URL', async () => {
    window.history.replaceState(null, '', '?mount=ceiling&power=usb&bathroom=true&ventiq=airiq&step=4');

    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    let state = stateModule.getState();
    expect(state.bathroom).toBe(true);

    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    expect(bathroomCheckbox.checked).toBe(true);

    const ventIQSection = document.getElementById('ventiq-module-section');

    bathroomCheckbox.checked = false;
    bathroomCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    state = stateModule.getState();
    expect(state.bathroom).toBe(false);
    expect(state.ventiq).toBe('none');

    expect(ventIQSection.style.display).toBe('none');

    const url = window.location.search;
    expect(url).toContain('bathroom=false');
    expect(url).not.toContain('ventiq=airiq');
});

test('switching mounting from ceiling to wall clears bathroom from URL', async () => {
    window.history.replaceState(null, '', '?mount=ceiling&power=usb&bathroom=true&step=4');

    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();

    expect(stateModule.getState().bathroom).toBe(true);

    const wallInput = document.querySelector('input[name="mounting"][value="wall"]');
    wallInput.checked = true;
    wallInput.dispatchEvent(new Event('change', { bubbles: true }));

    const state = stateModule.getState();
    expect(state.mounting).toBe('wall');
    expect(state.bathroom).toBe(false);

    const url = window.location.search;
    expect(url).not.toContain('bathroom=true');
});
