import { jest } from '@jest/globals';

function renderWizardInputs() {
    document.body.innerHTML = `
        <input type="radio" name="mounting" value="wall">
        <input type="radio" name="mounting" value="ceiling">

        <input type="radio" name="power" value="usb">
        <input type="radio" name="power" value="poe">
        <input type="radio" name="power" value="pwr">

        <input type="radio" name="airiq" value="none">
        <input type="radio" name="airiq" value="base">
        <input type="radio" name="airiq" value="pro">

        <input type="radio" name="presence" value="none">
        <input type="radio" name="presence" value="base">
        <input type="radio" name="presence" value="pro">

        <input type="radio" name="comfort" value="none">
        <input type="radio" name="comfort" value="base">

        <input type="radio" name="fan" value="none">
        <input type="radio" name="fan" value="pwm">
        <input type="radio" name="fan" value="analog">
    `;
}

describe('preset apply and normalization', () => {
    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        renderWizardInputs();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
    });

    test('save + apply uses full state mapping for mount/power/airiq/presence/comfort/fan and currentStep', async () => {
        const stateModule = await import('../scripts/state.js');
        const presetStorage = await import('../scripts/utils/preset-storage.js');

        const preset = presetStorage.savePreset(
            'Full Wall Config',
            { mounting: 'wall', power: 'pwr', airiq: 'pro', presence: 'base', comfort: 'base', fan: 'analog' },
            {
                ...presetStorage.PRESET_STORAGE_OPTIONS,
                state: { mount: 'wall', power: 'pwr', airiq: 'pro', presence: 'base', comfort: 'base', fan: 'analog' },
                currentStep: 4
            }
        );

        presetStorage.applyPresetStateToWizard(preset.state);

        expect(stateModule.getState()).toMatchObject({
            mount: 'wall', power: 'pwr', airiq: 'pro', presence: 'base', comfort: 'base', fan: 'analog'
        });
        expect(document.querySelector('input[name="mounting"][value="wall"]').checked).toBe(true);
        expect(document.querySelector('input[name="power"][value="pwr"]').checked).toBe(true);
        expect(document.querySelector('input[name="airiq"][value="pro"]').checked).toBe(true);
        expect(document.querySelector('input[name="presence"][value="base"]').checked).toBe(true);
        expect(document.querySelector('input[name="comfort"][value="base"]').checked).toBe(true);
        expect(document.querySelector('input[name="fan"][value="analog"]').checked).toBe(true);
        expect(preset.state.currentStep).toBe(4);
    });

    test('fan normalizes to none for non-wall mount in both normalized state and configuration', async () => {
        const stateModule = await import('../scripts/state.js');
        const presetStorage = await import('../scripts/utils/preset-storage.js');

        const preset = presetStorage.savePreset(
            'Ceiling Normalized',
            { mounting: 'ceiling', power: 'usb', airiq: 'base', presence: 'pro', comfort: 'base', fan: 'analog' },
            {
                ...presetStorage.PRESET_STORAGE_OPTIONS,
                state: { mount: 'ceiling', power: 'usb', airiq: 'base', presence: 'pro', comfort: 'base', fan: 'pwm' },
                currentStep: 3
            }
        );

        expect(preset.state.fan).toBe('none');
        expect(preset.configuration.fan).toBe('none');

        presetStorage.applyPresetStateToWizard(preset.state);
        expect(stateModule.getState()).toMatchObject({
            mount: 'ceiling', power: 'usb', airiq: 'base', presence: 'pro', comfort: 'base', fan: 'none'
        });
        expect(document.querySelector('input[name="mounting"][value="ceiling"]').checked).toBe(true);
        expect(document.querySelector('input[name="fan"][value="none"]').checked).toBe(true);
    });
});
