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

async function loadRememberModule() {
    const module = await import('../scripts/remember-state.js');
    return module;
}

beforeEach(() => {
    jest.resetModules();
    delete window.wizardRememberState;
});

afterEach(() => {
    delete window.wizardRememberState;
});

describe('remember-state in-memory behavior', () => {
    test('normalizes structured remember-state payloads', async () => {
        const { normalizeRememberedState } = await loadRememberModule();

        const normalized = normalizeRememberedState({
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

    test('migrates legacy flat configuration snapshots', async () => {
        const { normalizeRememberedState } = await loadRememberModule();

        const normalized = normalizeRememberedState({
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

    test('persists structured snapshots in memory', async () => {
        const { persistRememberedState, loadRememberedState } = await loadRememberModule();

        persistRememberedState({
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

        const remembered = loadRememberedState({
            defaultConfiguration,
            allowedOptions,
            totalSteps
        });

        expect(remembered).toEqual({
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
    });

    test('disabling remember clears stored configuration', async () => {
        const {
            persistRememberedState,
            loadRememberedState,
            setRememberEnabled,
            isRememberEnabled
        } = await loadRememberModule();

        persistRememberedState({
            mounting: 'wall',
            power: 'usb',
            airiq: 'base',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        }, {
            defaultConfiguration,
            allowedOptions,
            totalSteps,
            currentStep: 2
        });

        expect(loadRememberedState({ defaultConfiguration, allowedOptions, totalSteps })).not.toBeNull();

        setRememberEnabled(true);
        expect(isRememberEnabled()).toBe(true);

        setRememberEnabled(false);
        expect(isRememberEnabled()).toBe(false);
        expect(loadRememberedState({ defaultConfiguration, allowedOptions, totalSteps })).toBeNull();
    });
});
