import { jest } from '@jest/globals';

describe('preset storage duplicate name handling', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('normalizePresetName treats case and surrounding spaces as duplicates', async () => {
        const { normalizePresetName } = await import('../scripts/utils/preset-storage.js');

        expect(normalizePresetName(' Office ')).toBe('office');
        expect(normalizePresetName('OFFICE')).toBe('office');
        expect(normalizePresetName('office')).toBe('office');
    });

    test('upsertPresetByName overwrites existing preset in place', async () => {
        const {
            savePreset,
            upsertPresetByName,
            listPresets
        } = await import('../scripts/utils/preset-storage.js');

        const storage = new Map();
        const storageAdapter = {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, value)
        };

        const options = { storage: storageAdapter, storageKey: 'test.presets', maxEntries: 20 };

        const initial = savePreset('Office', {
            mounting: 'wall',
            power: 'usb',
            airiq: 'none',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        }, options);

        const replaced = upsertPresetByName(' office ', {
            mounting: 'ceiling',
            power: 'poe',
            airiq: 'base',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        }, options);

        const presets = listPresets(options);

        expect(replaced).not.toBeNull();
        expect(replaced.id).toBe(initial.id);
        expect(presets).toHaveLength(1);
        expect(presets[0].id).toBe(initial.id);
        expect(presets[0].configuration.mounting).toBe('ceiling');
        expect(presets[0].configuration.power).toBe('poe');
        expect(presets[0].name).toBe('office');
    });

    test('savePreset keeps duplicate names as separate entries when not overwriting', async () => {
        const {
            savePreset,
            listPresets
        } = await import('../scripts/utils/preset-storage.js');

        const storage = new Map();
        const storageAdapter = {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, value)
        };

        const options = { storage: storageAdapter, storageKey: 'test.presets.no.overwrite', maxEntries: 20 };

        savePreset('Office', {
            mounting: 'wall',
            power: 'usb',
            airiq: 'none',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        }, options);

        savePreset('OFFICE', {
            mounting: 'ceiling',
            power: 'poe',
            airiq: 'none',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        }, options);

        const presets = listPresets(options);
        expect(presets).toHaveLength(2);
    });
});
