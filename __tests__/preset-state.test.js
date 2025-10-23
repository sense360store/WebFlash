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

async function loadPresetModule() {
    return import('../scripts/remember-state.js');
}

beforeEach(() => {
    jest.resetModules();
    delete window.wizardPresetState;
});

afterEach(() => {
    delete window.wizardPresetState;
});

describe('preset storage utilities', () => {
    test('normalizes structured preset state payloads', async () => {
        const { normalizePresetState } = await loadPresetModule();

        const normalized = normalizePresetState({
            configuration: {
                mounting: 'wall',
                power: 'usb',
                airiq: 'base',
                presence: 'pro',
                comfort: 'none',
                fan: 'analog'
            },
            currentStep: 3
        }, {
            defaultConfiguration,
            allowedOptions,
            totalSteps
        });

        expect(normalized).toEqual({
            configuration: {
                ...defaultConfiguration,
                mounting: 'wall',
                power: 'usb',
                airiq: 'base',
                presence: 'pro',
                fan: 'analog'
            },
            currentStep: 3
        });
    });

    test('migrates legacy flat preset snapshots', async () => {
        const { normalizePresetState } = await loadPresetModule();

        const normalized = normalizePresetState({
            mounting: 'wall',
            power: 'poe',
            airiq: 'pro',
            presence: 'none',
            comfort: 'none',
            fan: 'pwm'
        }, {
            defaultConfiguration,
            allowedOptions,
            totalSteps
        });

        expect(normalized).toEqual({
            configuration: {
                ...defaultConfiguration,
                mounting: 'wall',
                power: 'poe',
                airiq: 'pro',
                fan: 'pwm'
            },
            currentStep: null
        });
    });

    test('saves, lists, and clears presets without remember state', async () => {
        const {
            savePreset,
            listPresets,
            markPresetApplied,
            deletePreset,
            getPreset
        } = await loadPresetModule();

        const preset = savePreset('  Test Preset  ', {
            mounting: 'wall',
            power: 'usb',
            airiq: 'pro',
            presence: 'base',
            comfort: 'none',
            fan: 'analog'
        }, {
            defaultConfiguration,
            allowedOptions,
            totalSteps,
            currentStep: 4
        });

        expect(preset.name).toBe('Test Preset');
        expect(preset.state).toEqual({
            configuration: {
                ...defaultConfiguration,
                mounting: 'wall',
                power: 'usb',
                airiq: 'pro',
                presence: 'base',
                fan: 'analog'
            },
            currentStep: 4
        });

        const presets = listPresets({ defaultConfiguration, allowedOptions, totalSteps });
        expect(presets).toHaveLength(1);
        expect(presets[0].id).toBe(preset.id);

        const applied = markPresetApplied(preset.id, { defaultConfiguration, allowedOptions, totalSteps });
        expect(applied?.id).toBe(preset.id);

        markPresetApplied(null, { defaultConfiguration, allowedOptions, totalSteps });
        expect(getPreset(preset.id, { defaultConfiguration, allowedOptions, totalSteps })).not.toBeNull();

        expect(deletePreset(preset.id)).toBe(true);
        expect(listPresets({ defaultConfiguration, allowedOptions, totalSteps })).toHaveLength(0);
    });
});
