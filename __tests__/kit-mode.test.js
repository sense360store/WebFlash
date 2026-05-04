/**
 * Tests for the Step 1 kit/SKU configuration mode controller.
 *
 * Covers:
 *  - Loading the kit catalog from kits.json
 *  - Selecting a known kit applies the right wizard state
 *  - Selecting an unknown SKU surfaces an error and offers manual fallback
 *  - Switching from kit to manual mode clears stale state
 *  - Kit-mode share links restore the selected kit
 *  - Manual share links are not broken
 */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

const setStateMock = jest.fn();
const setStepMock = jest.fn();
const getStateMock = jest.fn();
const getMaxReachableStepMock = jest.fn(() => 5);
const announceMock = jest.fn();
const setConfigurationModeMock = jest.fn();
const setSelectedKitSkuMock = jest.fn();
const setActiveKitMetadataMock = jest.fn();

const sampleCatalog = {
    schema_version: 1,
    kits: [
        {
            sku: 'S360-KIT-A',
            display_name: 'Test Kit A',
            wizard_state: {
                mount: 'ceiling',
                power: 'poe',
                bathroom: false,
                airiq: 'airiq',
                ventiq: 'none',
                roomiq: 'none',
                fan: 'none',
                led: 'none',
                voice: 'none'
            },
            firmware_config_string: 'Ceiling-POE-AirIQ'
        },
        {
            sku: 'S360-KIT-B',
            display_name: 'Test Kit B',
            wizard_state: {
                mount: 'ceiling',
                power: 'usb',
                bathroom: false,
                fan: 'pwm'
            },
            firmware_config_string: 'Ceiling-USB-Fan'
        }
    ]
};

function renderStepOne() {
    document.body.innerHTML = `
        <div id="webflash-a11y-live-region" role="status"></div>
        <div id="step-1">
            <fieldset data-config-mode-picker>
                <label><input type="radio" name="configMode" value="kit" data-config-mode-input checked></label>
                <label><input type="radio" name="configMode" value="manual" data-config-mode-input></label>
            </fieldset>
            <section data-kit-mode-panel>
                <input type="search" id="kit-select-search" data-kit-select-search>
                <datalist id="kit-select-options" data-kit-select-datalist></datalist>
                <select id="kit-select" data-kit-select>
                    <option value="">Select…</option>
                </select>
                <p data-kit-select-error hidden></p>
                <div data-kit-summary hidden></div>
                <button type="button" data-kit-mode-next disabled>Continue</button>
                <button type="button" data-kit-mode-switch-manual>Choose hardware manually instead</button>
            </section>
            <section data-manual-mode-panel hidden></section>
        </div>
    `;
}

async function loadKitMode({ url = 'http://localhost/' } = {}) {
    jest.resetModules();
    const { history } = window;
    history.replaceState(null, '', url);

    jest.unstable_mockModule('../scripts/state.js', () => ({
        getState: getStateMock,
        setState: setStateMock,
        setStep: setStepMock,
        getMaxReachableStep: getMaxReachableStepMock
    }));
    jest.unstable_mockModule('../scripts/services/diagnostics.js', () => ({
        setConfigurationMode: setConfigurationModeMock,
        setSelectedKitSku: setSelectedKitSkuMock,
        setActiveKitMetadata: setActiveKitMetadataMock
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({
        announce: announceMock
    }));

    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sampleCatalog)
    }));

    const module = await import('../scripts/kit-mode.js');
    await module.__testHooks.initKitMode();
    return module;
}

beforeEach(() => {
    setStateMock.mockReset();
    setStepMock.mockReset();
    getStateMock.mockReset();
    getStateMock.mockReturnValue({ mounting: null, power: null });
    getMaxReachableStepMock.mockReset();
    getMaxReachableStepMock.mockReturnValue(5);
    announceMock.mockReset();
    setConfigurationModeMock.mockReset();
    setSelectedKitSkuMock.mockReset();
    setActiveKitMetadataMock.mockReset();
    renderStepOne();
    // Reset cached catalog between tests
    return import('../scripts/utils/kit-config.js').then(({ resetCatalogCacheForTests }) => {
        resetCatalogCacheForTests();
    });
});

describe('kit-mode controller', () => {
    test('populates the kit dropdown from the catalog', async () => {
        await loadKitMode();
        const select = document.querySelector('[data-kit-select]');
        const options = select.querySelectorAll('option');
        // 1 placeholder + 2 kits
        expect(options).toHaveLength(3);
        expect(options[1].value).toBe('S360-KIT-A');
        expect(options[2].value).toBe('S360-KIT-B');
    });

    test('selecting a known kit applies the corresponding wizard state', async () => {
        await loadKitMode();
        const select = document.querySelector('[data-kit-select]');
        select.value = 'S360-KIT-A';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        expect(setStateMock).toHaveBeenCalled();
        const lastState = setStateMock.mock.calls[setStateMock.mock.calls.length - 1][0];
        expect(lastState).toMatchObject({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'none'
        });
        expect(setSelectedKitSkuMock).toHaveBeenCalledWith('S360-KIT-A');
        expect(setActiveKitMetadataMock).toHaveBeenCalledWith(expect.objectContaining({ sku: 'S360-KIT-A' }));

        const summary = document.querySelector('[data-kit-summary]');
        expect(summary.hidden).toBe(false);
        expect(summary.textContent).toContain('Test Kit A');
        expect(summary.textContent).toContain('Ceiling-POE-AirIQ');

        const nextBtn = document.querySelector('[data-kit-mode-next]');
        expect(nextBtn.disabled).toBe(false);
    });

    test('typing an unknown SKU into the search box surfaces an error', async () => {
        await loadKitMode();
        const search = document.querySelector('[data-kit-select-search]');
        search.value = 'S360-KIT-NOPE';
        search.dispatchEvent(new Event('change', { bubbles: true }));

        const errorNode = document.querySelector('[data-kit-select-error]');
        expect(errorNode.hidden).toBe(false);
        expect(errorNode.textContent).toMatch(/could not find/i);

        const nextBtn = document.querySelector('[data-kit-mode-next]');
        expect(nextBtn.disabled).toBe(true);

        // Did NOT touch wizard state for an unknown SKU.
        expect(setStateMock).not.toHaveBeenCalled();
    });

    test('switching to manual mode hides kit panel and clears kit diagnostics', async () => {
        const module = await loadKitMode();
        const select = document.querySelector('[data-kit-select]');
        select.value = 'S360-KIT-A';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(module.__testHooks.getActiveKitSku()).toBe('S360-KIT-A');

        module.__testHooks.setMode('manual');

        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const manualPanel = document.querySelector('[data-manual-mode-panel]');
        expect(kitPanel.hidden).toBe(true);
        expect(manualPanel.hidden).toBe(false);
        expect(module.__testHooks.getActiveKitSku()).toBeNull();
        expect(setSelectedKitSkuMock).toHaveBeenLastCalledWith(null);
        expect(setActiveKitMetadataMock).toHaveBeenLastCalledWith(null);
    });

    test('switching from manual back to kit re-shows the kit panel', async () => {
        const module = await loadKitMode();
        module.__testHooks.setMode('manual');
        module.__testHooks.setMode('kit');

        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const manualPanel = document.querySelector('[data-manual-mode-panel]');
        expect(kitPanel.hidden).toBe(false);
        expect(manualPanel.hidden).toBe(true);
    });

    test('"Continue with this kit" advances to step 5 once a kit is selected', async () => {
        await loadKitMode();
        getStateMock.mockReturnValue({ mounting: 'ceiling', power: 'poe' });
        const select = document.querySelector('[data-kit-select]');
        select.value = 'S360-KIT-A';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const nextBtn = document.querySelector('[data-kit-mode-next]');
        nextBtn.click();

        expect(setStepMock).toHaveBeenCalledWith(5, expect.objectContaining({ animate: true }));
    });

    test('"Continue with this kit" is a no-op when no kit is selected', async () => {
        await loadKitMode();
        const nextBtn = document.querySelector('[data-kit-mode-next]');
        nextBtn.disabled = false; // simulate a stale enabled state
        nextBtn.click();
        expect(setStepMock).not.toHaveBeenCalled();
    });

    test('share link with sku= restores kit mode and pre-selects the kit', async () => {
        await loadKitMode({ url: 'http://localhost/?configmode=kit&sku=S360-KIT-B' });
        const select = document.querySelector('[data-kit-select]');
        expect(select.value).toBe('S360-KIT-B');
        expect(setStateMock).toHaveBeenCalled();
        const lastState = setStateMock.mock.calls[setStateMock.mock.calls.length - 1][0];
        expect(lastState.power).toBe('usb');
        expect(lastState.fan).toBe('pwm');
    });

    test('share link with unknown sku= shows an error', async () => {
        await loadKitMode({ url: 'http://localhost/?configmode=kit&sku=S360-KIT-MISSING' });
        const errorNode = document.querySelector('[data-kit-select-error]');
        expect(errorNode.hidden).toBe(false);
        expect(errorNode.textContent).toMatch(/no kit found/i);
    });

    test('manual share link with mount/power params keeps manual mode', async () => {
        const module = await loadKitMode({ url: 'http://localhost/?mount=ceiling&power=usb' });
        expect(module.__testHooks.getCurrentMode()).toBe('manual');
        const manualPanel = document.querySelector('[data-manual-mode-panel]');
        expect(manualPanel.hidden).toBe(false);
    });

    test('configmode=manual share link forces manual mode', async () => {
        const module = await loadKitMode({ url: 'http://localhost/?configmode=manual' });
        expect(module.__testHooks.getCurrentMode()).toBe('manual');
    });

    test('clearing the search input resets the summary and disables Continue', async () => {
        await loadKitMode();
        const select = document.querySelector('[data-kit-select]');
        select.value = 'S360-KIT-A';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const search = document.querySelector('[data-kit-select-search]');
        search.value = '';
        search.dispatchEvent(new Event('change', { bubbles: true }));

        const summary = document.querySelector('[data-kit-summary]');
        expect(summary.hidden).toBe(true);
        const nextBtn = document.querySelector('[data-kit-mode-next]');
        expect(nextBtn.disabled).toBe(true);
    });
});
