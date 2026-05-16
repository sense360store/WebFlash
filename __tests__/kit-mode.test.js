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
            firmware_config_string: 'Ceiling-USB-FanPWM'
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

// WF-UX-006: Step 1 path-selector. The kit-mode controller layers a path
// model (kit / custom / recovery) on top of the legacy mode model
// (kit / manual). The fixture below mirrors the new index.html surface:
// three [data-start-path] buttons + the kit panel (hidden) + the custom
// panel (hidden, aliased as data-manual-mode-panel for back-compat) +
// the legacy radio picker as a hidden back-compat surface.
function renderStepOneWithPathCards() {
    document.body.innerHTML = `
        <div id="webflash-a11y-live-region" role="status"></div>
        <div id="step-1">
            <div class="start-paths" data-start-paths>
                <button type="button" data-start-path="kit">
                    <span class="start-path-card__title">I bought a kit</span>
                </button>
                <button type="button" data-start-path="custom">
                    <span class="start-path-card__title">Custom configuration</span>
                </button>
                <button type="button" data-start-path="recovery" data-rescue-open aria-haspopup="dialog">
                    <span class="start-path-card__title">Recovery</span>
                </button>
            </div>
            <fieldset class="config-mode-picker config-mode-picker--legacy" data-config-mode-picker aria-hidden="true" hidden>
                <label><input type="radio" name="configMode" value="kit" data-config-mode-input checked></label>
                <label><input type="radio" name="configMode" value="manual" data-config-mode-input></label>
            </fieldset>
            <section data-kit-mode-panel data-start-path-panel="kit" hidden>
                <button type="button" data-start-path-back>&larr; Choose a different path</button>
                <input type="search" id="kit-select-search" data-kit-select-search>
                <datalist id="kit-select-options" data-kit-select-datalist></datalist>
                <select id="kit-select" data-kit-select>
                    <option value="">Select…</option>
                </select>
                <p data-kit-select-error hidden></p>
                <div data-kit-summary hidden></div>
                <button type="button" data-kit-mode-next disabled>Continue</button>
                <button type="button" data-kit-mode-switch-manual>Switch to custom configuration</button>
            </section>
            <section data-manual-mode-panel data-custom-path-panel data-start-path-panel="custom" hidden>
                <button type="button" data-start-path-back>&larr; Choose a different path</button>
                <button type="button" data-next>Continue to Core</button>
            </section>
        </div>
    `;
}

async function loadKitModeWithPathCards({ url = 'http://localhost/' } = {}) {
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

describe('WF-UX-006 — Step 1 path selector', () => {
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
        renderStepOneWithPathCards();
        return import('../scripts/utils/kit-config.js').then(({ resetCatalogCacheForTests }) => {
            resetCatalogCacheForTests();
        });
    });

    test('fresh load with the new path cards leaves both panels hidden and no path active', async () => {
        const module = await loadKitModeWithPathCards();
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(kitPanel.hidden).toBe(true);
        expect(customPanel.hidden).toBe(true);
        expect(module.__testHooks.getCurrentPath()).toBeNull();
    });

    test('clicking the kit path button reveals the kit panel and records currentPath="kit"', async () => {
        const module = await loadKitModeWithPathCards();
        const kitButton = document.querySelector('[data-start-path="kit"]');
        kitButton.click();

        expect(module.__testHooks.getCurrentPath()).toBe('kit');
        expect(module.__testHooks.getCurrentMode()).toBe('kit');
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(kitPanel.hidden).toBe(false);
        expect(customPanel.hidden).toBe(true);
        expect(setConfigurationModeMock).toHaveBeenCalledWith('kit');
    });

    test('clicking the custom path button reveals the custom panel and records currentPath="custom"', async () => {
        const module = await loadKitModeWithPathCards();
        const customButton = document.querySelector('[data-start-path="custom"]');
        customButton.click();

        expect(module.__testHooks.getCurrentPath()).toBe('custom');
        // setPath('custom') delegates to setMode('manual') internally.
        expect(module.__testHooks.getCurrentMode()).toBe('manual');
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(kitPanel.hidden).toBe(true);
        expect(customPanel.hidden).toBe(false);
        expect(setConfigurationModeMock).toHaveBeenCalledWith('manual');
    });

    test('clicking the recovery card records currentPath="recovery" without altering wizard mode', async () => {
        const module = await loadKitModeWithPathCards();
        // Recovery card carries data-rescue-open so the rescue-modal's
        // delegated handler opens the dialog. setPath('recovery') itself
        // does not call openRescueModal directly — it just records the
        // path and announces. The kit panel and custom panel must stay
        // hidden so the user can return to the path picker.
        const recoveryButton = document.querySelector('[data-start-path="recovery"]');
        recoveryButton.click();

        expect(module.__testHooks.getCurrentPath()).toBe('recovery');
        // setMode is NOT called for recovery — wizard configuration mode
        // stays at its previous value (the kit-mode init default).
        expect(setConfigurationModeMock).not.toHaveBeenCalledWith('recovery');
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(kitPanel.hidden).toBe(true);
        expect(customPanel.hidden).toBe(true);
    });

    test('clicking the recovery card preserves the [data-rescue-open] attribute so the rescue modal handler fires', async () => {
        await loadKitModeWithPathCards();
        const recoveryButton = document.querySelector('[data-start-path="recovery"]');
        // The rescue-modal click delegation lives in
        // scripts/layout/rescue-modal.js (data-rescue-open). The card's
        // attribute is the single source of truth that the delegation
        // engages — verify it is present and not stripped by setPath.
        expect(recoveryButton.hasAttribute('data-rescue-open')).toBe(true);
        recoveryButton.click();
        expect(recoveryButton.hasAttribute('data-rescue-open')).toBe(true);
    });

    test('switching from kit to custom via setPath clears kit diagnostics', async () => {
        const module = await loadKitModeWithPathCards();
        const kitButton = document.querySelector('[data-start-path="kit"]');
        kitButton.click();
        const select = document.querySelector('[data-kit-select]');
        select.value = 'S360-KIT-A';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(module.__testHooks.getActiveKitSku()).toBe('S360-KIT-A');

        const customButton = document.querySelector('[data-start-path="custom"]');
        customButton.click();
        expect(module.__testHooks.getCurrentPath()).toBe('custom');
        expect(module.__testHooks.getActiveKitSku()).toBeNull();
        expect(setSelectedKitSkuMock).toHaveBeenLastCalledWith(null);
    });

    test('clicking the in-panel back button returns the user to path selection', async () => {
        const module = await loadKitModeWithPathCards();
        const kitButton = document.querySelector('[data-start-path="kit"]');
        kitButton.click();
        expect(module.__testHooks.getCurrentPath()).toBe('kit');

        // Use the back link inside the kit panel.
        const backBtn = document.querySelector('[data-kit-mode-panel] [data-start-path-back]');
        backBtn.click();
        expect(module.__testHooks.getCurrentPath()).toBeNull();
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(kitPanel.hidden).toBe(true);
        expect(customPanel.hidden).toBe(true);
    });

    test('configmode=kit URL hydrates to kit path with kit panel visible', async () => {
        const module = await loadKitModeWithPathCards({ url: 'http://localhost/?configmode=kit' });
        expect(module.__testHooks.getCurrentPath()).toBe('kit');
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        expect(kitPanel.hidden).toBe(false);
    });

    test('configmode=kit&sku=… URL hydrates to kit path with kit pre-selected', async () => {
        const module = await loadKitModeWithPathCards({ url: 'http://localhost/?configmode=kit&sku=S360-KIT-B' });
        expect(module.__testHooks.getCurrentPath()).toBe('kit');
        const select = document.querySelector('[data-kit-select]');
        expect(select.value).toBe('S360-KIT-B');
        expect(setStateMock).toHaveBeenCalled();
    });

    test('configmode=custom URL hydrates to custom path', async () => {
        const module = await loadKitModeWithPathCards({ url: 'http://localhost/?configmode=custom' });
        expect(module.__testHooks.getCurrentPath()).toBe('custom');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(customPanel.hidden).toBe(false);
    });

    test('configmode=manual URL is accepted as a back-compat alias for custom', async () => {
        const module = await loadKitModeWithPathCards({ url: 'http://localhost/?configmode=manual' });
        // Old share-links with configmode=manual hydrate to the new
        // custom path so saved links keep resolving.
        expect(module.__testHooks.getCurrentPath()).toBe('custom');
        expect(module.__testHooks.getCurrentMode()).toBe('manual');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(customPanel.hidden).toBe(false);
    });

    test('manual share link with mount/power params hydrates to custom path', async () => {
        const module = await loadKitModeWithPathCards({ url: 'http://localhost/?mount=ceiling&power=usb' });
        expect(module.__testHooks.getCurrentPath()).toBe('custom');
        expect(module.__testHooks.getCurrentMode()).toBe('manual');
    });

    test('fresh visit with no URL params leaves both panels hidden (user picks a card)', async () => {
        const module = await loadKitModeWithPathCards({ url: 'http://localhost/' });
        expect(module.__testHooks.getCurrentPath()).toBeNull();
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(kitPanel.hidden).toBe(true);
        expect(customPanel.hidden).toBe(true);
    });

    test('setPath is exposed via __testHooks and only accepts known path values', async () => {
        const module = await loadKitModeWithPathCards();
        expect(typeof module.__testHooks.setPath).toBe('function');

        module.__testHooks.setPath('kit');
        expect(module.__testHooks.getCurrentPath()).toBe('kit');

        module.__testHooks.setPath('custom');
        expect(module.__testHooks.getCurrentPath()).toBe('custom');

        module.__testHooks.setPath('recovery');
        expect(module.__testHooks.getCurrentPath()).toBe('recovery');

        // Unknown path values are ignored — the current path stays as it was.
        module.__testHooks.setPath('garbage');
        expect(module.__testHooks.getCurrentPath()).toBe('recovery');
    });
});
