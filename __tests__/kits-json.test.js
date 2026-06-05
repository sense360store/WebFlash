/**
 * Smoke tests for scripts/data/kits.json.
 *
 * Each kit's firmware_config_string MUST exist as a build.config_string
 * in manifest.json. If you add a new kit but forget to also add the
 * matching firmware build, this suite fails.
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalogFromPayload } from '../scripts/utils/kit-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8'));
}

describe('scripts/data/kits.json', () => {
    const payload = readJson('scripts/data/kits.json');
    const catalog = buildCatalogFromPayload(payload);
    const manifest = readJson('manifest.json');
    const manifestConfigStrings = new Set(
        (manifest.builds || []).map(build => build.config_string).filter(Boolean)
    );

    test('declares schema_version 1', () => {
        expect(payload.schema_version).toBe(1);
    });

    test('every kit entry parses successfully', () => {
        expect(catalog.kits.length).toBeGreaterThan(0);
        expect(catalog.skipped).toEqual([]);
    });

    test('every kit firmware_config_string exists in manifest.json', () => {
        catalog.kits.forEach(kit => {
            expect(manifestConfigStrings.has(kit.firmware_config_string)).toBe(true);
        });
    });

    test('every kit has a unique uppercased SKU', () => {
        const seen = new Set();
        catalog.kits.forEach(kit => {
            expect(kit.sku).toMatch(/^[A-Z0-9-]+$/);
            expect(seen.has(kit.sku)).toBe(false);
            seen.add(kit.sku);
        });
    });

    test('every kit_state mount is "ceiling"', () => {
        catalog.kits.forEach(kit => {
            expect(kit.wizard_state.mount).toBe('ceiling');
        });
    });

    test('every kit_state power is one of usb/poe/pwr', () => {
        const allowed = new Set(['usb', 'poe', 'pwr']);
        catalog.kits.forEach(kit => {
            expect(allowed.has(kit.wizard_state.power)).toBe(true);
        });
    });

    test('AirIQ and VentIQ are mutually exclusive in any kit definition', () => {
        catalog.kits.forEach(kit => {
            const state = kit.wizard_state;
            const hasAir = state.airiq && state.airiq !== 'none';
            const hasVent = state.ventiq && state.ventiq !== 'none';
            expect(hasAir && hasVent).toBe(false);
        });
    });

    test('VentIQ kits also enable bathroom mode', () => {
        catalog.kits.forEach(kit => {
            const state = kit.wizard_state;
            if (state.ventiq && state.ventiq !== 'none') {
                expect(state.bathroom).toBe(true);
            }
        });
    });

    // WF-CLEANUP-010: FanTRIAC is globally blocked from Release-One via
    // firmware/sources.json block_tokens and the manifest-health guard.
    // No active kit can reference a FanTRIAC firmware build until the
    // S360-320 hardware verification work lands and a separate FanTRIAC
    // source is imported.
    test('no active kit references a FanTRIAC firmware config', () => {
        catalog.kits.forEach(kit => {
            expect(kit.firmware_config_string.toLowerCase()).not.toContain('fantriac');
        });
    });

    // WF-CLEANUP-010 / WF2-KIT-BUNDLE-PICKER-001: LED is excluded from the
    // STABLE Release-One config via firmware/sources.json block_tokens. LED room
    // bundles are allowed, but only on the preview channel — they resolve to the
    // preview Ceiling-POE-RoomIQ-LED build, never to a stable build.
    test('no STABLE-channel kit enables LED; LED is preview-only', () => {
        catalog.kits.forEach(kit => {
            const ledOn = kit.wizard_state.led && kit.wizard_state.led !== 'none';
            const configHasLed = /(^|-)led(-|$)/.test(kit.firmware_config_string.toLowerCase());
            if (ledOn || configHasLed) {
                expect(kit.firmware_channel).toBe('preview');
            }
        });
    });

    // WF-CLEANUP-010: at least one active kit must map to the current
    // Release-One config so the kit-mode picker has a working path on
    // the cleaned manifest.
    test('at least one active kit maps to the current Release-One config', () => {
        const releaseOne = 'Ceiling-POE-VentIQ-RoomIQ';
        const matching = catalog.kits.filter(kit => kit.firmware_config_string === releaseOne);
        expect(matching.length).toBeGreaterThanOrEqual(1);
    });

    // WF2-KIT-BUNDLE-PICKER-001 — the five customer room bundles restored into
    // the 2.0 kit picker. The picker reads kits.json directly, so these pins
    // double as the kit-card contract.
    describe('WF2-KIT-BUNDLE-PICKER-001 — room bundle picker', () => {
        const EXPECTED_BUNDLES = [
            { sku: 'S360-KIT-BATH-P', config: 'Ceiling-POE-VentIQ-RoomIQ', channel: 'stable' },
            { sku: 'S360-KIT-KITCHEN-P', config: 'Ceiling-POE-AirIQ-RoomIQ', channel: 'preview' },
            { sku: 'S360-KIT-BEDROOM-P', config: 'Ceiling-POE-RoomIQ', channel: 'preview' },
            { sku: 'S360-KIT-LIVING-P', config: 'Ceiling-POE-RoomIQ-LED', channel: 'preview' },
            { sku: 'S360-KIT-CORRIDOR-P', config: 'Ceiling-POE-RoomIQ-LED', channel: 'preview' }
        ];

        test('all five base room bundles are present with the correct config string and channel', () => {
            EXPECTED_BUNDLES.forEach(expected => {
                const kit = catalog.kits.find(k => k.sku === expected.sku);
                expect(kit).toBeTruthy();
                expect(kit.firmware_config_string).toBe(expected.config);
                expect(kit.firmware_channel).toBe(expected.channel);
            });
        });

        test('every bundle config resolves to a real manifest build', () => {
            EXPECTED_BUNDLES.forEach(expected => {
                expect(manifestConfigStrings.has(expected.config)).toBe(true);
            });
        });

        test('S360-KIT-BATH-P is the only default / recommended / stable bundle', () => {
            const recommended = catalog.kits.filter(k => k.recommended);
            expect(recommended.map(k => k.sku)).toEqual(['S360-KIT-BATH-P']);

            const stable = catalog.kits.filter(k => k.firmware_channel === 'stable');
            expect(stable.map(k => k.sku)).toEqual(['S360-KIT-BATH-P']);
        });

        test('the four preview bundles are never recommended / stable / buyable', () => {
            const previewSkus = ['S360-KIT-KITCHEN-P', 'S360-KIT-BEDROOM-P', 'S360-KIT-LIVING-P', 'S360-KIT-CORRIDOR-P'];
            previewSkus.forEach(sku => {
                const kit = catalog.kits.find(k => k.sku === sku);
                expect(kit).toBeTruthy();
                expect(kit.recommended).toBe(false);
                expect(kit.firmware_channel).toBe('preview');
                // The schema carries no "buyable" / "default" flag; preview kits
                // must never smuggle one in (it would otherwise be dropped, but
                // pin the intent so a future schema change cannot regress it).
                expect(kit.buyable).toBeUndefined();
                expect(kit.isDefault).toBeUndefined();
            });
        });

        test('Living and Corridor are separate cards sharing the LED preview build', () => {
            const living = catalog.kits.find(k => k.sku === 'S360-KIT-LIVING-P');
            const corridor = catalog.kits.find(k => k.sku === 'S360-KIT-CORRIDOR-P');
            expect(living.sku).not.toBe(corridor.sku);
            expect(living.firmware_config_string).toBe('Ceiling-POE-RoomIQ-LED');
            expect(corridor.firmware_config_string).toBe('Ceiling-POE-RoomIQ-LED');
        });

        test('standalone fan-only previews and TRIAC are not kit cards', () => {
            const forbidden = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC'];
            catalog.kits.forEach(kit => {
                expect(forbidden).not.toContain(kit.firmware_config_string);
                expect(kit.firmware_config_string.toLowerCase()).not.toContain('triac');
                expect(kit.wizard_state.fan).toBe('none');
            });
        });

        test('the Bathroom Relay fan-control bundle is deferred and not present yet', () => {
            expect(catalog.kits.find(k => k.sku === 'S360-KIT-BATH-P-REL')).toBeUndefined();
        });
    });
});
