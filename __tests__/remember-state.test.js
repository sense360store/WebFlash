import { jest } from '@jest/globals';

class MemoryStorage {
    constructor() {
        this.store = new Map();
    }

    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    setItem(key, value) {
        this.store.set(key, String(value));
    }

    removeItem(key) {
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }
}

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
    const storage = new MemoryStorage();
    global.window = { localStorage: storage };
    globalThis.__rememberStateStorage = storage;
    const module = await import('../scripts/remember-state.js');
    return { module, storage };
}

beforeEach(() => {
    jest.resetModules();
    delete globalThis.__rememberStateStorage;
});

afterEach(() => {
    delete global.window;
    delete globalThis.__rememberStateStorage;
});

describe('remember-state persistence', () => {
    test('normalizes structured remember-state payloads', async () => {
        const { module } = await loadRememberModule();
        const { normalizeRememberedState } = module;

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
        const { module } = await loadRememberModule();
        const { normalizeRememberedState } = module;

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

    test('persists structured snapshots to localStorage', async () => {
        const { module, storage } = await loadRememberModule();
        const { persistRememberedState } = module;

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

        const raw = storage.getItem('sense360.lastWizardState');
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw);
        expect(parsed).toEqual({
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

    test('loads legacy snapshots from storage with migration', async () => {
        const { module, storage } = await loadRememberModule();
        const { loadRememberedState } = module;

        const legacySnapshot = {
            mounting: 'ceiling',
            power: 'pwr',
            airiq: 'base',
            presence: 'none',
            comfort: 'none',
            fan: 'analog'
        };
        storage.setItem('sense360.lastWizardState', JSON.stringify(legacySnapshot));

        const remembered = loadRememberedState({
            defaultConfiguration,
            allowedOptions,
            totalSteps
        });

        expect(remembered).toEqual({
            configuration: {
                ...defaultConfiguration,
                mounting: 'ceiling',
                power: 'pwr',
                airiq: 'base',
                fan: 'none'
            },
            currentStep: null
        });
    });

    test('retains remembered step even when configuration is default', async () => {
        const { module } = await loadRememberModule();
        const { normalizeRememberedState } = module;

        const normalized = normalizeRememberedState({
            configuration: { ...defaultConfiguration },
            currentStep: 3
        }, {
            defaultConfiguration,
            allowedOptions,
            totalSteps
        });

        expect(normalized).toEqual({
            configuration: { ...defaultConfiguration },
            currentStep: 3
        });
    });

    test('disabling remember clears stored configuration', async () => {
        const { module, storage } = await loadRememberModule();
        const { setRememberEnabled } = module;

        storage.setItem('sense360.lastWizardState', JSON.stringify({ configuration: { mounting: 'wall' } }));

        setRememberEnabled(true);
        expect(storage.getItem('sense360.rememberChoices')).toBe('true');

        setRememberEnabled(false);
        expect(storage.getItem('sense360.rememberChoices')).toBe('false');
        expect(storage.getItem('sense360.lastWizardState')).toBeNull();
    });
});
