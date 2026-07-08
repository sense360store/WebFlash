/**
 * Unit tests for scripts/promote-to-stable.js (WebFlash side).
 *
 * The headline contract is the retirement guard, the one rule that must never
 * be violated: a preview for C is retired only when its version <= V; an
 * ahead-of-stable preview (version > V) is left completely untouched; an
 * ambiguous version refuses the whole operation. These tests exercise the pure
 * planning + text-edit functions in isolation (in-memory inputs, no repo
 * mutation) so the guard is pinned deterministically.
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    PromotionError,
    normalizeVersion,
    compareVersions,
    computePlan,
    flipKitChannelsInText,
    removeSourceEntriesInText,
} from '../scripts/promote-to-stable.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function kit(sku, configString, channel) {
    const k = { sku, firmware_config_string: configString };
    if (channel !== undefined) k.firmware_channel = channel;
    return k;
}

function previewSource(configString, version) {
    return {
        config_string: configString,
        channel: 'preview',
        version,
        asset_name: `Sense360-${configString}-v${version}-preview.bin`,
    };
}

describe('normalizeVersion', () => {
    test('accepts clean dotted integers and strips a leading v', () => {
        expect(normalizeVersion('1.0.5')).toBe('1.0.5');
        expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
        expect(normalizeVersion(' 2.0 ')).toBe('2.0');
    });

    test('refuses ambiguous / non-numeric versions', () => {
        for (const bad of ['1.0.0-rc1', '1.0.x', 'latest', '', 'v', '1.0.0+build']) {
            expect(() => normalizeVersion(bad)).toThrow(PromotionError);
        }
    });
});

describe('compareVersions', () => {
    test('orders versions and pads missing segments with zero', () => {
        expect(compareVersions('1.0.0', '1.0.5')).toBe(-1);
        expect(compareVersions('1.0.5', '1.0.0')).toBe(1);
        expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
        expect(compareVersions('1.2', '1.10')).toBe(-1); // numeric, not lexical
    });
});

describe('computePlan — kit channel flip', () => {
    test('flips every kit (card) that maps to C, including shared-config cards', () => {
        const kits = {
            kits: [
                kit('S360-KIT-LIVING-P', 'Ceiling-POE-RoomIQ-LED', 'preview'),
                kit('S360-KIT-CORRIDOR-P', 'Ceiling-POE-RoomIQ-LED', 'preview'),
                kit('S360-KIT-BATH-P', 'Ceiling-POE-VentIQ-RoomIQ', 'stable'),
            ],
        };
        const plan = computePlan({
            kits,
            sources: { sources: [] },
            configString: 'Ceiling-POE-RoomIQ-LED',
            version: '1.1.0',
        });
        expect(plan.kitFlips.map((f) => f.sku).sort()).toEqual([
            'S360-KIT-CORRIDOR-P',
            'S360-KIT-LIVING-P',
        ]);
        expect(plan.kitsAlreadyStable).toEqual([]);
    });

    test('treats an absent firmware_channel as already stable', () => {
        const kits = { kits: [kit('S360-KIT-X', 'Ceiling-POE-RoomIQ')] };
        const plan = computePlan({
            kits,
            sources: { sources: [] },
            configString: 'Ceiling-POE-RoomIQ',
            version: '1.0.5',
        });
        expect(plan.kitFlips).toEqual([]);
        expect(plan.kitsAlreadyStable).toEqual(['S360-KIT-X']);
    });

    test('refuses when no kit maps to C', () => {
        expect(() =>
            computePlan({
                kits: { kits: [kit('S360-KIT-BATH-P', 'Ceiling-POE-VentIQ-RoomIQ', 'stable')] },
                sources: { sources: [] },
                configString: 'Ceiling-POE-Nope',
                version: '1.0.0',
            })
        ).toThrow(PromotionError);
    });
});

describe('computePlan — retirement guard (the one rule)', () => {
    const kits = { kits: [kit('S360-KIT-X', 'Ceiling-POE-RoomIQ-LED', 'preview')] };

    test('retires a preview whose version is <= V', () => {
        const sources = { sources: [previewSource('Ceiling-POE-RoomIQ-LED', '1.0.0')] };
        const plan = computePlan({ kits, sources, configString: 'Ceiling-POE-RoomIQ-LED', version: '1.1.0' });
        expect(plan.retire.map((r) => r.assetName)).toEqual([
            'Sense360-Ceiling-POE-RoomIQ-LED-v1.0.0-preview.bin',
        ]);
        expect(plan.preservedAhead).toEqual([]);
    });

    test('retires a preview whose version equals V (== is <=)', () => {
        const sources = { sources: [previewSource('Ceiling-POE-RoomIQ-LED', '1.0.0')] };
        const plan = computePlan({ kits, sources, configString: 'Ceiling-POE-RoomIQ-LED', version: '1.0.0' });
        expect(plan.retire).toHaveLength(1);
        expect(plan.preservedAhead).toEqual([]);
    });

    test('LEAVES an ahead-of-stable preview (version > V) completely untouched', () => {
        const sources = { sources: [previewSource('Ceiling-POE-RoomIQ-LED', '1.2.0')] };
        const plan = computePlan({ kits, sources, configString: 'Ceiling-POE-RoomIQ-LED', version: '1.1.0' });
        expect(plan.retire).toEqual([]);
        expect(plan.preservedAhead.map((p) => p.assetName)).toEqual([
            'Sense360-Ceiling-POE-RoomIQ-LED-v1.2.0-preview.bin',
        ]);
    });

    test('mixed previews: retires only the <= V ones, preserves the ahead one', () => {
        const sources = {
            sources: [
                previewSource('Ceiling-POE-RoomIQ-LED', '0.9.0'),
                previewSource('Ceiling-POE-RoomIQ-LED', '1.1.0'),
                previewSource('Ceiling-POE-RoomIQ-LED', '2.0.0'),
            ],
        };
        const plan = computePlan({ kits, sources, configString: 'Ceiling-POE-RoomIQ-LED', version: '1.1.0' });
        expect(plan.retire.map((r) => r.version).sort()).toEqual(['0.9.0', '1.1.0']);
        expect(plan.preservedAhead.map((p) => p.version)).toEqual(['2.0.0']);
    });

    test('refuses the whole operation when a preview version is ambiguous', () => {
        const sources = { sources: [previewSource('Ceiling-POE-RoomIQ-LED', '1.0.0-rc1')] };
        expect(() =>
            computePlan({ kits, sources, configString: 'Ceiling-POE-RoomIQ-LED', version: '1.1.0' })
        ).toThrow(PromotionError);
    });

    test('ignores stable source entries for C (only previews are retirement candidates)', () => {
        const sources = {
            sources: [
                { config_string: 'Ceiling-POE-RoomIQ-LED', channel: 'stable', version: '1.1.0', asset_name: 'x-stable.bin' },
            ],
        };
        const plan = computePlan({ kits, sources, configString: 'Ceiling-POE-RoomIQ-LED', version: '1.1.0' });
        expect(plan.retire).toEqual([]);
        expect(plan.preservedAhead).toEqual([]);
    });
});

describe('flipKitChannelsInText — surgical, format-preserving edit', () => {
    const sample = [
        '{',
        '    "kits": [',
        '        {',
        '            "sku": "S360-KIT-LIVING-P",',
        '            "firmware_config_string": "Ceiling-POE-RoomIQ-LED",',
        '            "firmware_channel": "preview"',
        '        },',
        '        {',
        '            "sku": "S360-KIT-CORRIDOR-P",',
        '            "firmware_config_string": "Ceiling-POE-RoomIQ-LED",',
        '            "firmware_channel": "preview"',
        '        },',
        '        {',
        '            "sku": "S360-KIT-BATH-P",',
        '            "firmware_config_string": "Ceiling-POE-VentIQ-RoomIQ",',
        '            "firmware_channel": "stable"',
        '        }',
        '    ]',
        '}',
        '',
    ].join('\n');

    test('flips exactly the matching cards and changes nothing else byte-wise', () => {
        const { text, flipped } = flipKitChannelsInText(sample, 'Ceiling-POE-RoomIQ-LED');
        expect(flipped.sort()).toEqual(['S360-KIT-CORRIDOR-P', 'S360-KIT-LIVING-P']);
        // Exactly two lines differ (the two firmware_channel values).
        const before = sample.split('\n');
        const after = text.split('\n');
        const diffs = before.filter((line, i) => line !== after[i]);
        expect(diffs).toEqual(['            "firmware_channel": "preview"', '            "firmware_channel": "preview"']);
        const parsed = JSON.parse(text);
        const led = parsed.kits.filter((k) => k.firmware_config_string === 'Ceiling-POE-RoomIQ-LED');
        expect(led.every((k) => k.firmware_channel === 'stable')).toBe(true);
        const bath = parsed.kits.find((k) => k.sku === 'S360-KIT-BATH-P');
        expect(bath.firmware_channel).toBe('stable');
    });

    test('is a no-op (byte-identical) when the target is already stable', () => {
        const { text, flipped } = flipKitChannelsInText(sample, 'Ceiling-POE-VentIQ-RoomIQ');
        expect(flipped).toEqual([]);
        expect(text).toBe(sample);
    });

    test('against the real kits.json: no preview kit card remains, so every flip is a byte-identical no-op', () => {
        // Retargeted twice: first from Ceiling-POE-AirIQ-RoomIQ /
        // S360-KIT-KITCHEN-P after the stale v1.0.0-preview retirement, then
        // from the Bathroom PWM fan bundle after WF-H1-REIMPORT-CLEAN-001 W1
        // delisted all five fan preview kit cards. The surviving catalogue is
        // stable-only (Bathroom + Bedroom), so the helper must be a strict
        // no-op against the real file for both a stable config and a config
        // with no kit card at all.
        const raw = readFileSync(join(REPO_ROOT, 'scripts/data/kits.json'), 'utf8');
        const stableFlip = flipKitChannelsInText(raw, 'Ceiling-POE-RoomIQ');
        expect(stableFlip.flipped).toEqual([]);
        expect(stableFlip.text).toBe(raw);
        const delistedFlip = flipKitChannelsInText(raw, 'Ceiling-POE-VentIQ-FanPWM-RoomIQ');
        expect(delistedFlip.flipped).toEqual([]);
        expect(delistedFlip.text).toBe(raw);
    });
});

describe('removeSourceEntriesInText — minimal-diff entry removal', () => {
    test('removes exactly the named asset entry and round-trips the rest', () => {
        // Retargeted three times: first from the RoomIQ-LED preview entry
        // after the stale v1.0.0-preview retirement, then from the VentIQ
        // FanPWM room-bundle preview after WF-H1-REIMPORT-CLEAN-001 W1
        // delisted the five fan previews, then to the clean v1.0.1 LED preview
        // after the W2 rebuild re-import bumped the surviving LED preview
        // entry from v1.0.0 to v1.0.1. The VentIQ LED preview is a surviving
        // entry (in-memory removal only; nothing is written back).
        const raw = readFileSync(join(REPO_ROOT, 'firmware/sources.json'), 'utf8');
        const target = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.1-preview.bin';
        const out = removeSourceEntriesInText(raw, [target]);
        const before = JSON.parse(raw);
        const after = JSON.parse(out);
        expect(after.sources).toHaveLength(before.sources.length - 1);
        expect(after.sources.some((s) => s.asset_name === target)).toBe(false);
        // Every other entry survives unchanged.
        const keptNames = new Set(after.sources.map((s) => s.asset_name));
        before.sources
            .filter((s) => s.asset_name !== target)
            .forEach((s) => expect(keptNames.has(s.asset_name)).toBe(true));
    });
});
