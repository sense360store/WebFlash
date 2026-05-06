import { describe, expect, test } from '@jest/globals';
import { findNearbyConfigStrings, getMismatchHighlights } from '../scripts/utils/firmware-nearest.js';

describe('findNearbyConfigStrings — required mounting/power match', () => {
    test('drops candidates with a different mounting', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            'Wall-POE-VentIQ',
            'Ceiling-POE-VentIQ',
            'Ceiling-POE-VentIQ-FanTRIAC'
        ]);
        expect(result).not.toContain('Wall-POE-VentIQ');
        expect(result).toContain('Ceiling-POE-VentIQ');
        expect(result).toContain('Ceiling-POE-VentIQ-FanTRIAC');
    });

    test('drops candidates with a different power option', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            'Ceiling-USB-VentIQ-FanTRIAC',
            'Ceiling-PWR-VentIQ-FanTRIAC',
            'Ceiling-POE-VentIQ-FanTRIAC'
        ]);
        expect(result).not.toContain('Ceiling-USB-VentIQ-FanTRIAC');
        expect(result).not.toContain('Ceiling-PWR-VentIQ-FanTRIAC');
        expect(result).toContain('Ceiling-POE-VentIQ-FanTRIAC');
    });

    test('returns an empty list when there are no available configs', () => {
        expect(findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [])).toEqual([]);
        expect(findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', null)).toEqual([]);
    });

    test('omits the target from the suggested list even if duplicated', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ', [
            'Ceiling-POE-VentIQ',
            'Ceiling-POE-AirIQ'
        ]);
        expect(result).not.toContain('Ceiling-POE-VentIQ');
    });

    test('excludes the special Rescue config from suggestions', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            'Rescue',
            'Ceiling-POE-VentIQ'
        ]);
        expect(result).not.toContain('Rescue');
        expect(result).toContain('Ceiling-POE-VentIQ');
    });
});

describe('findNearbyConfigStrings — ranking heuristic', () => {
    test('prefers same air-quality family (VentIQ near VentIQ over AirIQ)', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            'Ceiling-POE-AirIQ',
            'Ceiling-POE-VentIQ',
            'Ceiling-POE-VentIQ-FanTRIAC'
        ]);
        expect(result[0]).toBe('Ceiling-POE-VentIQ-FanTRIAC');
        expect(result[1]).toBe('Ceiling-POE-VentIQ');
        expect(result.slice(0, 2)).not.toContain('Ceiling-POE-AirIQ');
    });

    test('prefers same fan variant', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC', [
            'Ceiling-POE-VentIQ-FanPWM',
            'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ'
        ]);
        expect(result[0]).toBe('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ');
    });

    test('returns up to 3 nearby configs by default', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            'Ceiling-POE-VentIQ-FanTRIAC',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-VentIQ',
            'Ceiling-POE-AirIQ'
        ]);
        expect(result.length).toBeLessThanOrEqual(3);
    });

    test('respects explicit limit option', () => {
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            'Ceiling-POE-VentIQ-FanTRIAC',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-VentIQ',
            'Ceiling-POE-AirIQ'
        ], { limit: 2 });
        expect(result.length).toBeLessThanOrEqual(2);
    });

    test('top suggestion for the canonical example matches the spec', () => {
        // Example selected config from the PR:
        //   Ceiling-POE-VentIQ-FanTRIAC-RoomIQ
        // Potential nearby matches per the spec:
        //   Ceiling-POE-VentIQ-FanTRIAC
        //   Ceiling-POE-VentIQ-RoomIQ
        //   Ceiling-POE-VentIQ
        const available = [
            'Ceiling-POE-AirIQ',
            'Ceiling-POE-VentIQ',
            'Ceiling-POE-VentIQ-FanTRIAC',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Wall-POE-VentIQ-FanTRIAC',
            'Ceiling-USB'
        ];
        const result = findNearbyConfigStrings('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', available);
        expect(result).toEqual([
            'Ceiling-POE-VentIQ-FanTRIAC',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-VentIQ'
        ]);
    });
});

describe('getMismatchHighlights — what selections to double-check', () => {
    test('flags fan variant when no nearby build matches it', () => {
        const target = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';
        const nearby = ['Ceiling-POE-VentIQ', 'Ceiling-POE-VentIQ-RoomIQ'];
        const highlights = getMismatchHighlights(target, nearby);
        const fanHighlight = highlights.find(h => h.key === 'fan');
        expect(fanHighlight).toBeTruthy();
        expect(fanHighlight.label).toMatch(/TRIAC/i);
    });

    test('flags RoomIQ presence when no nearby build matches it', () => {
        const target = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';
        const nearby = ['Ceiling-POE-VentIQ', 'Ceiling-POE-VentIQ-FanTRIAC'];
        const highlights = getMismatchHighlights(target, nearby);
        const presenceHighlight = highlights.find(h => h.key === 'presence');
        expect(presenceHighlight).toBeTruthy();
        expect(presenceHighlight.label).toBe('RoomIQ');
    });

    test('does not flag a module if some nearby build covers it', () => {
        const target = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';
        const nearby = ['Ceiling-POE-VentIQ-FanTRIAC', 'Ceiling-POE-VentIQ-RoomIQ'];
        const highlights = getMismatchHighlights(target, nearby);
        // fan is covered by Ceiling-POE-VentIQ-FanTRIAC, presence by Ceiling-POE-VentIQ-RoomIQ
        expect(highlights.find(h => h.key === 'fan')).toBeFalsy();
        expect(highlights.find(h => h.key === 'presence')).toBeFalsy();
    });

    test('returns an empty list when target has no module decisions to flag', () => {
        const highlights = getMismatchHighlights('Ceiling-POE', []);
        expect(highlights).toEqual([]);
    });
});
