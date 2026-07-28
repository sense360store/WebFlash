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
// WF-SURFACE-SSOT-001: the build-surface expectations (which configs ship,
// which retired configs stay absent) derive from the reviewed
// expected-surface fixture. The kits.json STRUCTURAL pins below (which kit
// SKUs exist, which stay withheld, recommended/stable membership) are
// intentionally NOT derived from it — they are deliberate catalogue
// decisions and stay explicit literals (see the anti-tautology contract in
// __tests__/helpers/stable-surface.js).
import {
    isExpectedConfig,
    expectedChannelOf,
    retiredConfigsStillAbsent
} from './helpers/expected-surface.js';

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

    // WF2-KIT-BUNDLE-PICKER-001 — the customer room bundles in the 2.0 kit
    // picker. The picker reads kits.json directly, so these pins double as the
    // kit-card contract. The Kitchen / Living / Corridor base bundles were
    // retired together with their stale v1.0.0-preview builds (AirIQ-RoomIQ,
    // RoomIQ-LED): upstream's regenerated v1.0.0-preview checksums-sha256.txt
    // no longer lists those assets, so the builds left the manifest and a kit
    // card may never reference a config without a manifest build. The
    // AirIQ-RoomIQ config has since returned as the v1.0.6 STABLE import
    // (upstream promoted it to production / stable), but the
    // S360-KIT-KITCHEN-P kit stays withheld per the upstream catalog bundle
    // gating (owner waiver HW-AIRIQ-WAIVER-2026-06) — the stable build ships
    // through the advanced builder only until the bundle gating clears.
    describe('WF2-KIT-BUNDLE-PICKER-001 — room bundle picker', () => {
        const EXPECTED_BUNDLES = [
            { sku: 'S360-KIT-BATH-P', config: 'Ceiling-POE-VentIQ-RoomIQ', channel: 'stable' },
            { sku: 'S360-KIT-BEDROOM-P', config: 'Ceiling-POE-RoomIQ', channel: 'stable' }
        ];

        test('both base room bundles are present with the correct config string and channel', () => {
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

        test('S360-KIT-BATH-P is the only recommended / default bundle; Bedroom joins it on the stable channel', () => {
            const recommended = catalog.kits.filter(k => k.recommended);
            expect(recommended.map(k => k.sku)).toEqual(['S360-KIT-BATH-P']);

            const stable = catalog.kits.filter(k => k.firmware_channel === 'stable');
            expect(stable.map(k => k.sku).sort()).toEqual(['S360-KIT-BATH-P', 'S360-KIT-BEDROOM-P'].sort());
        });

        test('the withheld Kitchen and retired Living / Corridor base bundles stay out of kits.json', () => {
            // Kitchen: the AirIQ-RoomIQ config is imported and STABLE (per the
            // expected-surface fixture), but the S360-KIT-KITCHEN-P kit stays
            // withheld per the upstream catalog bundle gating (owner waiver
            // HW-AIRIQ-WAIVER-2026-06). This kit-membership rule is a
            // deliberate decision and stays an explicit literal.
            // Living / Corridor: their Ceiling-POE-RoomIQ-LED config is still
            // retired outright, so those kits stay out until it is re-imported.
            const withheldOrRetiredSkus = ['S360-KIT-KITCHEN-P', 'S360-KIT-LIVING-P', 'S360-KIT-CORRIDOR-P'];
            withheldOrRetiredSkus.forEach(sku => {
                expect(catalog.kits.find(k => k.sku === sku)).toBeUndefined();
            });
            // The Kitchen config serves on the PREVIEW channel per the fixture:
            // the owner decision of 2026-07-28 (SENSE360-CANONICALISATION-001,
            // upholding upstream PR #834) demoted the served presentation of
            // the v1.0.9 build to match its recorded preview channel. It stays
            // withheld from kits.json either way, never referenced by any kit
            // card. (If the config is ever retired again, the fixture loses it
            // and this fails loud so the withheld-kit rule gets revisited.)
            expect(expectedChannelOf('Ceiling-POE-AirIQ-RoomIQ')).toBe('preview');
            expect(manifestConfigStrings.has('Ceiling-POE-AirIQ-RoomIQ')).toBe(true);
            expect(catalog.kits.some(k => k.firmware_config_string === 'Ceiling-POE-AirIQ-RoomIQ')).toBe(false);
            // The Living / Corridor config left the manifest with its stale
            // v1.0.0-preview retirement and has not returned (fixture intent
            // plus manifest reality).
            expect(isExpectedConfig('Ceiling-POE-RoomIQ-LED')).toBe(false);
            expect(manifestConfigStrings.has('Ceiling-POE-RoomIQ-LED')).toBe(false);
            expect(catalog.kits.some(k => k.firmware_config_string === 'Ceiling-POE-RoomIQ-LED')).toBe(false);
        });

        test('every still-retired fixture config is absent from the manifest and from every kit card', () => {
            // Derived stays-retired guard: the expected-surface fixture's
            // retired register (minus any config that legitimately returned at
            // a new version/channel) must stay out of the manifest and out of
            // kits.json entirely. Re-importing one of these is a deliberate
            // surface change that edits the fixture in the same PR.
            for (const cs of retiredConfigsStillAbsent) {
                expect(manifestConfigStrings.has(cs)).toBe(false);
                expect(catalog.kits.some(k => k.firmware_config_string === cs)).toBe(false);
            }
        });

        test('standalone fan-only previews and TRIAC are not kit cards', () => {
            // Fan-only manual previews must never be a kit card, and TRIAC stays
            // build-blocked everywhere. A kit MAY drive a fan, but only as part of
            // a full room bundle (room sensors + fan), never as a fan-only config.
            const forbiddenFanOnly = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC'];
            catalog.kits.forEach(kit => {
                expect(forbiddenFanOnly).not.toContain(kit.firmware_config_string);
                expect(kit.firmware_config_string.toLowerCase()).not.toContain('triac');
                const state = kit.wizard_state;
                if (state.fan && state.fan !== 'none') {
                    const hasRoomSensor = state.roomiq && state.roomiq !== 'none';
                    const hasAirSensor = (state.ventiq && state.ventiq !== 'none')
                        || (state.airiq && state.airiq !== 'none');
                    expect(hasRoomSensor && hasAirSensor).toBe(true);
                    // Fan-control kits are preview-only and never recommended.
                    expect(kit.firmware_channel).toBe('preview');
                    expect(kit.recommended).toBe(false);
                }
            });
        });
    });

    // WF-H1-REIMPORT-CLEAN-001 W1 (decision R-D1) — the five full-composition
    // fan bundle kit cards surfaced by WF2-FAN-EXPANSION-001 retired with
    // their delisted pre-credential-gate v1.0.0-preview builds (see the
    // delisted_sources register in firmware/sources.json and
    // docs/rebuild-clean-credentials-001.md). The Bathroom Relay bundle
    // (S360-KIT-BATH-P-REL -> Ceiling-POE-VentIQ-FanRelay-RoomIQ) had already
    // retired with its stale v1.0.0-preview build. The fan-control and FanDAC
    // address acknowledgement gates (scripts/install.js) remain in force for
    // any future fan config; only the kit cards and builds are gone.
    describe('WF-H1-REIMPORT-CLEAN-001 W1 — fan bundle kit cards stay retired', () => {
        const RETIRED_FAN_KITS = [
            { sku: 'S360-KIT-BATH-P-PWM', config: 'Ceiling-POE-VentIQ-FanPWM-RoomIQ' },
            { sku: 'S360-KIT-BATH-P-DAC', config: 'Ceiling-POE-VentIQ-FanDAC-RoomIQ' },
            { sku: 'S360-KIT-KITCHEN-P-REL', config: 'Ceiling-POE-AirIQ-FanRelay-RoomIQ' },
            { sku: 'S360-KIT-KITCHEN-P-PWM', config: 'Ceiling-POE-AirIQ-FanPWM-RoomIQ' },
            { sku: 'S360-KIT-KITCHEN-P-DAC', config: 'Ceiling-POE-AirIQ-FanDAC-RoomIQ' }
        ];

        test('the catalogue holds exactly the two stable base bundles', () => {
            // The Bathroom (Release-One, recommended) and Bedroom base
            // bundles. Every fan bundle kit card retired with its delisted
            // build; the Kitchen / Living / Corridor base bundles stay
            // retired with their stale v1.0.0-preview builds.
            expect(catalog.kits).toHaveLength(2);
            expect(catalog.kits.map(k => k.sku)).toEqual(['S360-KIT-BATH-P', 'S360-KIT-BEDROOM-P']);
            expect(catalog.skipped).toEqual([]);
        });

        test('the five retired fan kit SKUs and their configs stay out until re-imported clean', () => {
            RETIRED_FAN_KITS.forEach(expected => {
                expect(catalog.kits.find(k => k.sku === expected.sku)).toBeUndefined();
                expect(isExpectedConfig(expected.config)).toBe(false);
                expect(manifestConfigStrings.has(expected.config)).toBe(false);
            });
        });

        test('the retired Bathroom Relay bundle and its config stay out until re-imported', () => {
            // Kit-membership rule stays literal; the config's retirement is
            // fixture intent (retired register) checked against the manifest.
            expect(catalog.kits.find(k => k.sku === 'S360-KIT-BATH-P-REL')).toBeUndefined();
            expect(isExpectedConfig('Ceiling-POE-VentIQ-FanRelay-RoomIQ')).toBe(false);
            expect(manifestConfigStrings.has('Ceiling-POE-VentIQ-FanRelay-RoomIQ')).toBe(false);
        });

        test('S360-KIT-BATH-P stays the only recommended kit; Bedroom joins it on the stable channel', () => {
            const recommended = catalog.kits.filter(k => k.recommended);
            expect(recommended.map(k => k.sku)).toEqual(['S360-KIT-BATH-P']);
            const stable = catalog.kits.filter(k => k.firmware_channel === 'stable');
            expect(stable.map(k => k.sku).sort()).toEqual(['S360-KIT-BATH-P', 'S360-KIT-BEDROOM-P'].sort());
        });

        test('the standalone fan-only previews and TRIAC are never kit cards', () => {
            const forbiddenFanOnly = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC'];
            catalog.kits.forEach(kit => {
                expect(forbiddenFanOnly).not.toContain(kit.firmware_config_string);
                expect(kit.firmware_config_string.toLowerCase()).not.toContain('triac');
                expect(kit.wizard_state.fan).not.toBe('triac');
            });
        });
    });
});
