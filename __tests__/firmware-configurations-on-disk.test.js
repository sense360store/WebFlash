import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
// WF-SURFACE-SSOT-001: the expected file list is DERIVED from the reviewed
// expected-surface fixture (config_string + version + channel per build →
// canonical Sense360-<config>-v<version>-<channel>.bin + .meta.json names).
// A surface change edits __tests__/fixtures/expected-surface.json in the same
// PR; this suite then enforces that the directory matches it exactly.
import {
    expectedConfigurationBins,
    expectedConfigurationSidecars,
    expectedConfigurationFiles,
    retiredArtifacts,
    retiredSidecars
} from './helpers/expected-surface.js';

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
// exactly the application binaries the expected-surface fixture declares,
// plus their sidecars, and additionally rejects any FanTRIAC segment in any
// filename in the directory. The retired-artifact register in the fixture
// (the five stale v1.0.0-preview artifacts retired in #553) keeps its teeth
// through the explicit stays-retired test below: a retired artifact may
// never reappear even when its CONFIG has legitimately returned at another
// version/channel (the AirIQ-RoomIQ case — retired as a v1.0.0 preview,
// shipping again as the v1.0.6 stable).
//
// The Rescue artifact lives under firmware/rescue/ and is intentionally
// out of scope for this test — it is built in-tree, not imported, and
// has its own per-product manifest layout.
//
// A superseded version left on disk after an in-place bump (e.g. two
// Release-One stables side by side) fails the exact-file-list pin: the
// fixture declares exactly one version per config, so the leftover file is
// an unexpected entry.

const repoRoot = process.cwd();
const configurationsDir = path.join(repoRoot, 'firmware', 'configurations');

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
    test('directory contains exactly the expected files', () => {
        const actual = fs.readdirSync(configurationsDir).sort();
        expect(actual).toEqual([...expectedConfigurationFiles]);
    });

    test('no unexpected .bin file exists in firmware/configurations/', () => {
        const bins = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.bin'));
        const unexpected = bins.filter(
            name => !expectedConfigurationBins.includes(name)
        );
        expect(unexpected).toEqual([]);
    });

    test('no unexpected .meta.json sidecar exists in firmware/configurations/', () => {
        const sidecars = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.meta.json'));
        const unexpected = sidecars.filter(
            name => !expectedConfigurationSidecars.includes(name)
        );
        expect(unexpected).toEqual([]);
    });

    test('no retired artifact or sidecar reappears on disk', () => {
        // Explicit stays-retired teeth on top of the exact-file-list pin: the
        // fixture's retired register names each artifact retired in #553, and
        // none of them may come back — not even when the config itself has
        // returned at a different version/channel.
        const onDisk = new Set(fs.readdirSync(configurationsDir));
        for (const name of [...retiredArtifacts, ...retiredSidecars]) {
            expect(onDisk.has(name)).toBe(false);
        }
    });

    test('no filename in firmware/configurations/ contains a FanTRIAC segment', () => {
        // FanTRIAC remains globally blocked under HW-005. Mirrors the
        // manifest-health.test.js check, but applied to the on-disk
        // file list so a re-introduced orphan binary (the WF-CLEANUP-002
        // scenario) is caught at the filesystem layer before
        // gen-manifests.py can pick it up. Intentionally independent of the
        // expected-surface fixture: even a fixture that wrongly declared a
        // FanTRIAC build (itself rejected at helper load time) could not
        // green-light a FanTRIAC file here.
        const offenders = fs
            .readdirSync(configurationsDir)
            .filter(name => containsSegment(name, 'FanTRIAC'));
        expect(offenders).toEqual([]);
    });

    test('every expected binary is a non-empty regular file', () => {
        for (const name of expectedConfigurationBins) {
            const filePath = path.join(configurationsDir, name);
            const stat = fs.statSync(filePath);
            expect(stat.isFile()).toBe(true);
            expect(stat.size).toBeGreaterThan(0);
        }
    });

    test('every expected sidecar parses as JSON', () => {
        for (const name of expectedConfigurationSidecars) {
            const filePath = path.join(configurationsDir, name);
            const raw = fs.readFileSync(filePath, 'utf8');
            expect(() => JSON.parse(raw)).not.toThrow();
        }
    });
});
