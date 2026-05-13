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

    // WF-CLEANUP-010: LED is excluded from Release-One via the same
    // block_tokens mechanism. No active kit can opt into LED until a
    // dedicated LED build is imported.
    test('no active kit enables LED for Release-One', () => {
        catalog.kits.forEach(kit => {
            expect(kit.wizard_state.led).toBe('none');
            expect(kit.firmware_config_string.toLowerCase()).not.toMatch(/(^|-)led(-|$)/);
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
});
