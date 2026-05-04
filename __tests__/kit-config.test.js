import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import {
    buildCatalogFromPayload,
    findKitBySku,
    loadKitCatalog,
    mapKitToWizardState,
    normaliseSku,
    resetCatalogCacheForTests,
    summariseKitModules,
    validateKitEntry
} from '../scripts/utils/kit-config.js';

describe('validateKitEntry', () => {
    test('accepts a valid entry', () => {
        const entry = {
            sku: 'S360-KIT-CEILING-AIRIQ-POE',
            display_name: 'Sense360 Ceiling AirIQ Kit (PoE)',
            wizard_state: { mount: 'ceiling', power: 'poe', airiq: 'airiq' },
            firmware_config_string: 'Ceiling-POE-AirIQ'
        };
        const result = validateKitEntry(entry);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('rejects missing required fields', () => {
        const result = validateKitEntry({ sku: 'X' });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.stringMatching(/display_name/),
            expect.stringMatching(/wizard_state/),
            expect.stringMatching(/firmware_config_string/)
        ]));
    });

    test('rejects unsupported mount values', () => {
        const result = validateKitEntry({
            sku: 'X',
            display_name: 'X',
            wizard_state: { mount: 'wall', power: 'usb' },
            firmware_config_string: 'Wall-USB'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(err => /mount/.test(err))).toBe(true);
    });

    test('rejects unsupported power values', () => {
        const result = validateKitEntry({
            sku: 'X',
            display_name: 'X',
            wizard_state: { mount: 'ceiling', power: 'solar' },
            firmware_config_string: 'Ceiling-Solar'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(err => /power/.test(err))).toBe(true);
    });

    test('rejects unsupported firmware_channel', () => {
        const result = validateKitEntry({
            sku: 'X',
            display_name: 'X',
            wizard_state: { mount: 'ceiling', power: 'usb' },
            firmware_config_string: 'Ceiling-USB',
            firmware_channel: 'unstable'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(err => /firmware_channel/.test(err))).toBe(true);
    });
});

describe('buildCatalogFromPayload', () => {
    const validEntry = {
        sku: 'S360-KIT-A',
        display_name: 'Kit A',
        wizard_state: { mount: 'ceiling', power: 'poe', airiq: 'airiq' },
        firmware_config_string: 'Ceiling-POE-AirIQ'
    };

    test('returns frozen kits for valid entries and skips invalid ones', () => {
        const catalog = buildCatalogFromPayload({
            schema_version: 1,
            kits: [validEntry, { sku: 'BAD' }]
        });
        expect(catalog.kits).toHaveLength(1);
        expect(catalog.kits[0].sku).toBe('S360-KIT-A');
        expect(catalog.skipped).toHaveLength(1);
        expect(catalog.skipped[0].sku).toBe('BAD');
        expect(Object.isFrozen(catalog.kits[0])).toBe(true);
    });

    test('refuses payloads with a future schema_version', () => {
        const catalog = buildCatalogFromPayload({ schema_version: 99, kits: [validEntry] });
        expect(catalog.kits).toHaveLength(0);
    });

    test('deduplicates kits by SKU', () => {
        const catalog = buildCatalogFromPayload({
            schema_version: 1,
            kits: [validEntry, { ...validEntry, display_name: 'Duplicate' }]
        });
        expect(catalog.kits).toHaveLength(1);
        expect(catalog.skipped).toHaveLength(1);
    });

    test('normalises SKU case and whitespace', () => {
        const catalog = buildCatalogFromPayload({
            schema_version: 1,
            kits: [{ ...validEntry, sku: '  s360-kit-a  ' }]
        });
        expect(catalog.kits[0].sku).toBe('S360-KIT-A');
    });

    test('treats null payload as an empty catalog', () => {
        const catalog = buildCatalogFromPayload(null);
        expect(catalog.kits).toEqual([]);
        expect(catalog.skipped).toEqual([]);
    });

    test('default-fills missing module slots in wizard_state', () => {
        const catalog = buildCatalogFromPayload({
            schema_version: 1,
            kits: [validEntry]
        });
        const state = catalog.kits[0].wizard_state;
        expect(state.airiq).toBe('airiq');
        expect(state.ventiq).toBe('none');
        expect(state.roomiq).toBe('none');
        expect(state.fan).toBe('none');
        expect(state.led).toBe('none');
        expect(state.voice).toBe('none');
        expect(state.bathroom).toBe(false);
    });
});

describe('findKitBySku', () => {
    const catalog = buildCatalogFromPayload({
        schema_version: 1,
        kits: [
            {
                sku: 'S360-KIT-A',
                display_name: 'Kit A',
                wizard_state: { mount: 'ceiling', power: 'poe' },
                firmware_config_string: 'Ceiling-POE'
            }
        ]
    });

    test('matches case-insensitively', () => {
        expect(findKitBySku(catalog, 's360-kit-a')).toBeTruthy();
        expect(findKitBySku(catalog, '  S360-KIT-A  ')).toBeTruthy();
    });

    test('returns null for unknown SKUs', () => {
        expect(findKitBySku(catalog, 'NOPE')).toBeNull();
        expect(findKitBySku(catalog, '')).toBeNull();
        expect(findKitBySku(catalog, null)).toBeNull();
    });
});

describe('mapKitToWizardState', () => {
    test('returns a state object suitable for setState()', () => {
        const kit = {
            wizard_state: {
                mount: 'ceiling',
                power: 'poe',
                bathroom: false,
                airiq: 'airiq'
            }
        };
        const state = mapKitToWizardState(kit);
        expect(state).toMatchObject({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'airiq',
            ventiq: 'none',
            roomiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none',
            bathroom: false
        });
    });

    test('returns empty object for invalid kit', () => {
        expect(mapKitToWizardState(null)).toEqual({});
        expect(mapKitToWizardState({})).toEqual({});
    });
});

describe('summariseKitModules', () => {
    test('lists selected modules in human-readable form', () => {
        const kit = { wizard_state: { airiq: 'airiq', fan: 'pwm', led: 'led' } };
        expect(summariseKitModules(kit)).toEqual(['AirIQ', 'Fan PWM', 'LED']);
    });

    test('returns empty array when no modules are selected', () => {
        const kit = { wizard_state: { airiq: 'none', fan: 'none', led: 'none' } };
        expect(summariseKitModules(kit)).toEqual([]);
    });
});

describe('normaliseSku', () => {
    test('uppercases and trims', () => {
        expect(normaliseSku('  s360-kit-a  ')).toBe('S360-KIT-A');
    });

    test('returns empty string for non-strings', () => {
        expect(normaliseSku(null)).toBe('');
        expect(normaliseSku(undefined)).toBe('');
        expect(normaliseSku(42)).toBe('');
    });
});

describe('loadKitCatalog', () => {
    beforeEach(() => {
        resetCatalogCacheForTests();
    });

    test('loads and parses a JSON payload', async () => {
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                schema_version: 1,
                kits: [
                    {
                        sku: 'S360-KIT-X',
                        display_name: 'Kit X',
                        wizard_state: { mount: 'ceiling', power: 'usb' },
                        firmware_config_string: 'Ceiling-USB'
                    }
                ]
            })
        }));
        const catalog = await loadKitCatalog({ fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(catalog.kits).toHaveLength(1);
        expect(catalog.kits[0].sku).toBe('S360-KIT-X');
    });

    test('returns an empty catalog when fetch fails', async () => {
        const fetchImpl = jest.fn(() => Promise.reject(new Error('boom')));
        const catalog = await loadKitCatalog({ fetchImpl });
        expect(catalog.kits).toEqual([]);
    });

    test('returns an empty catalog when response is not ok', async () => {
        const fetchImpl = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
        const catalog = await loadKitCatalog({ fetchImpl });
        expect(catalog.kits).toEqual([]);
    });

    test('caches the result', async () => {
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ schema_version: 1, kits: [] })
        }));
        await loadKitCatalog({ fetchImpl });
        await loadKitCatalog({ fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
