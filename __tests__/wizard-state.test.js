import { jest } from '@jest/globals';

const minimalManifest = { builds: [] };

function renderWizardDom() {
    document.body.innerHTML = `
        <div id="browser-warning" style="display:none"></div>
        <div class="progress-bar">
            <div class="progress-step" data-step="1"></div>
            <div class="progress-step" data-step="2"></div>
            <div class="progress-step" data-step="3"></div>
            <div class="progress-step" data-step="4"></div>
        </div>
        <div id="step-1" class="wizard-step">
            <button class="btn-next" disabled>Next</button>
            <input type="radio" name="mounting" value="wall">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-2" class="wizard-step">
            <button class="btn-next" disabled>Next</button>
            <input type="radio" name="power" value="usb">
            <input type="radio" name="power" value="poe">
            <input type="radio" name="power" value="pwr">
        </div>
        <div id="step-3" class="wizard-step">
            <div class="module-availability-hint" id="module-availability-hint"></div>
            <div id="fan-module-section"></div>
            <div class="module-group">
                <input type="radio" name="airiq" value="none" checked>
                <input type="radio" name="airiq" value="base">
                <input type="radio" name="airiq" value="pro">
            </div>
            <div class="module-group">
                <input type="radio" name="presence" value="none" checked>
                <input type="radio" name="presence" value="base">
                <input type="radio" name="presence" value="pro">
            </div>
            <div class="module-group">
                <input type="radio" name="comfort" value="none" checked>
                <input type="radio" name="comfort" value="base">
            </div>
            <div class="module-group">
                <input type="radio" name="fan" value="none" checked>
                <input type="radio" name="fan" value="pwm">
                <input type="radio" name="fan" value="analog">
            </div>
            <label><input type="checkbox" data-remember-toggle></label>
        </div>
        <div id="step-4" class="wizard-step">
            <section class="pre-flash-checklist" data-complete="false">
                <div data-checklist-item data-complete="false"></div>
            </section>
            <div id="config-summary"></div>
            <div class="primary-action-group"><p data-ready-helper></p></div>
            <div id="firmware-selector"><select id="firmware-version-select"></select></div>
            <div id="compatible-firmware"></div>
            <button id="download-btn" disabled></button>
            <button id="copy-firmware-url-btn" disabled></button>
            <label><input type="checkbox" data-remember-toggle></label>
        </div>
    `;
}

describe('wizard state module', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        renderWizardDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(minimalManifest)
        }));
    });

    test('manifest fetch occurs once even after compatibility lookup', async () => {
        const { __testHooks } = await import('../scripts/state.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const mounting = document.querySelector('input[name="mounting"][value="wall"]');
        const power = document.querySelector('input[name="power"][value="usb"]');

        mounting.checked = true;
        power.checked = true;

        mounting.dispatchEvent(new Event('change', { bubbles: true }));
        power.dispatchEvent(new Event('change', { bubbles: true }));

        await __testHooks.findCompatibleFirmware();

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('mounting and power inputs receive a single change listener', async () => {
        const mountingInputs = Array.from(document.querySelectorAll('input[name="mounting"]'));
        const powerInputs = Array.from(document.querySelectorAll('input[name="power"]'));

        const mountingSpies = mountingInputs.map(input => jest.spyOn(input, 'addEventListener'));
        const powerSpies = powerInputs.map(input => jest.spyOn(input, 'addEventListener'));

        await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        mountingSpies.forEach(spy => {
            const changeCalls = spy.mock.calls.filter(([eventName]) => eventName === 'change');
            expect(changeCalls).toHaveLength(1);
        });

        powerSpies.forEach(spy => {
            const changeCalls = spy.mock.calls.filter(([eventName]) => eventName === 'change');
            expect(changeCalls).toHaveLength(1);
        });
    });
});
