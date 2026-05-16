import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// WF-STALE-001 — defense-in-depth on the firmware/configurations/ disk
// state. Complements the existing guards by closing the one gap they
// leave open:
//
//   - manifest-health.test.js asserts every *.bin under
//     firmware/configurations/ has a sibling .meta.json sidecar. It does
//     NOT assert which .bin files exist.
//   - github-pages-surface.test.js asserts every manifest entry resolves
//     to an on-disk .bin. It does NOT assert that no extra .bin files
//     exist on disk.
//
// A stale .bin + matching sidecar landing on disk before manifest
// regeneration would pass both. This file pins the on-disk file list to
// exactly the two intended application binaries (Release-One stable +
// LED preview) plus their sidecars, and additionally rejects any
// FanTRIAC segment in any filename in the directory.
//
// The Rescue artifact lives under firmware/rescue/ and is intentionally
// out of scope for this test — it is built in-tree, not imported, and
// has its own per-product manifest layout.

const repoRoot = process.cwd();
const configurationsDir = path.join(repoRoot, 'firmware', 'configurations');

const RELEASE_ONE_BIN = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin';
const RELEASE_ONE_SIDECAR = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.meta.json';
const LED_PREVIEW_BIN = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin';
const LED_PREVIEW_SIDECAR = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.meta.json';

const EXPECTED_FILES = Object.freeze([
    RELEASE_ONE_BIN,
    RELEASE_ONE_SIDECAR,
    LED_PREVIEW_BIN,
    LED_PREVIEW_SIDECAR
]);

// Hyphen-bounded segment match so "LED" does not false-match "LEDless"
// and "FanTRIAC" does not false-match any unrelated longer token.
// Filenames are extension-stripped before splitting on "-".
function containsSegment(filename, token) {
    if (typeof filename !== 'string' || filename.length === 0) {
        return false;
    }
    const stem = filename.replace(/\.(bin|meta\.json)$/i, '');
    return stem.split('-').includes(token);
}

describe('firmware/configurations/ on-disk state — WF-STALE-001', () => {
    test('directory contains exactly the four expected files', () => {
        const actual = fs.readdirSync(configurationsDir).sort();
        const expected = [...EXPECTED_FILES].sort();
        expect(actual).toEqual(expected);
    });

    test('no other .bin file exists in firmware/configurations/', () => {
        const bins = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.bin'));
        const unexpected = bins.filter(
            name => name !== RELEASE_ONE_BIN && name !== LED_PREVIEW_BIN
        );
        expect(unexpected).toEqual([]);
    });

    test('no other .meta.json sidecar exists in firmware/configurations/', () => {
        const sidecars = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.meta.json'));
        const unexpected = sidecars.filter(
            name =>
                name !== RELEASE_ONE_SIDECAR && name !== LED_PREVIEW_SIDECAR
        );
        expect(unexpected).toEqual([]);
    });

    test('no filename in firmware/configurations/ contains a FanTRIAC segment', () => {
        // FanTRIAC remains globally blocked under HW-005. Mirrors the
        // manifest-health.test.js check, but applied to the on-disk
        // file list so a re-introduced orphan binary (the WF-CLEANUP-002
        // scenario) is caught at the filesystem layer before
        // gen-manifests.py can pick it up.
        const offenders = fs
            .readdirSync(configurationsDir)
            .filter(name => containsSegment(name, 'FanTRIAC'));
        expect(offenders).toEqual([]);
    });

    test('both expected binaries are non-empty regular files', () => {
        for (const name of [RELEASE_ONE_BIN, LED_PREVIEW_BIN]) {
            const filePath = path.join(configurationsDir, name);
            const stat = fs.statSync(filePath);
            expect(stat.isFile()).toBe(true);
            expect(stat.size).toBeGreaterThan(0);
        }
    });

    test('both expected sidecars parse as JSON', () => {
        for (const name of [RELEASE_ONE_SIDECAR, LED_PREVIEW_SIDECAR]) {
            const filePath = path.join(configurationsDir, name);
            const raw = fs.readFileSync(filePath, 'utf8');
            expect(() => JSON.parse(raw)).not.toThrow();
        }
    });
});
