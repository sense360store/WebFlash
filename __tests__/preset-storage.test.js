import { jest } from '@jest/globals';

const defaultConfiguration = {
    mounting: null,
    power: null,
    airiq: 'none',
    presence: 'none',
    comfort: 'none',
    fan: 'none'
};

const allowedOptions = {
    mounting: ['wall', 'ceiling'],
    power: ['usb', 'poe', 'pwr'],
    airiq: ['none', 'base', 'pro'],
    presence: ['none', 'base', 'pro'],
    comfort: ['none', 'base'],
    fan: ['none', 'pwm', 'analog']
};

const totalSteps = 4;

const storageOptions = Object.freeze({
    defaultConfiguration,
    allowedOptions,
    totalSteps
});

async function loadPresetModule() {
    const module = await import('../scripts/preset-storage.js');
    return module;
}

describe('preset storage helpers', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('normalizes preset state snapshots with allowed values', async () => {
        const { normalizePresetState } = await loadPresetModule();

        const normalized = normalizePresetState({
            configuration: {
                mounting: 'ceiling',
                power: 'poe',
                airiq: 'base',
                presence: 'pro',
                comfort: 'none',
                fan: 'analog'
            },
            currentStep: 5
        }, storageOptions);

        expect(normalized).toEqual({
            configuration: {
                ...defaultConfiguration,
                mounting: 'ceiling',
                power: 'poe',
                airiq: 'base',
                presence: 'pro',
                fan: 'none'
            },
            currentStep: 4
        });
    });

    test('saving presets trims names and snapshots configuration', async () => {
        const { savePreset, listPresets } = await loadPresetModule();

        const saved = savePreset('  Lobby install  ', {
            mounting: 'wall',
            power: 'usb',
            airiq: 'pro',
            presence: 'base',
            comfort: 'none',
            fan: 'pwm'
        }, {
            ...storageOptions,
            currentStep: 3
        });

        expect(saved?.name).toBe('Lobby install');
        expect(saved?.state).toEqual({
            configuration: {
                ...defaultConfiguration,
                mounting: 'wall',
                power: 'usb',
                airiq: 'pro',
                presence: 'base',
                fan: 'pwm'
            },
            currentStep: 3
        });

        const presets = listPresets(storageOptions);
        expect(presets).toHaveLength(1);
        expect(presets[0].id).toBe(saved.id);
    });

    test('renaming and deleting presets updates the store', async () => {
        const { savePreset, renamePreset, listPresets, deletePreset } = await loadPresetModule();

        const saved = savePreset('Preset A', {
            mounting: 'wall',
            power: 'usb',
            airiq: 'base',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        }, {
            ...storageOptions,
            currentStep: 2
        });

        renamePreset(saved.id, ' Updated name ', storageOptions);
        let presets = listPresets(storageOptions);
        expect(presets).toHaveLength(1);
        expect(presets[0].name).toBe('Updated name');

        const deleted = deletePreset(saved.id);
        expect(deleted).toBe(true);

        presets = listPresets(storageOptions);
        expect(presets).toHaveLength(0);
    });

    test('markPresetApplied toggles the active preset selection', async () => {
        const { savePreset, markPresetApplied, listPresets } = await loadPresetModule();

        const saved = savePreset('Preset B', {
            mounting: 'wall',
            power: 'pwr',
            airiq: 'base',
            presence: 'base',
            comfort: 'none',
            fan: 'pwm'
        }, {
            ...storageOptions,
            currentStep: 4
        });

        const applied = markPresetApplied(saved.id, storageOptions);
        expect(applied?.id).toBe(saved.id);
        expect(applied?.state.configuration.power).toBe('pwr');

        const cleared = markPresetApplied(null, storageOptions);
        expect(cleared).toBeNull();

        const presets = listPresets(storageOptions);
        expect(presets).toHaveLength(1);
    });
});
