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
// exactly the intended application binaries (Release-One stable, the VentIQ
// LED preview, the three first-batch previews, the three single-driver fan
// manual-previews, and the five full-composition room-bundle fan previews,
// all imported from upstream v1.0.0-preview) plus their sidecars, and
// additionally rejects any FanTRIAC segment in any filename in the directory.
//
// The Rescue artifact lives under firmware/rescue/ and is intentionally
// out of scope for this test — it is built in-tree, not imported, and
// has its own per-product manifest layout.

const repoRoot = process.cwd();
const configurationsDir = path.join(repoRoot, 'firmware', 'configurations');

// Version-agnostic Release-One resolution. The Release-One stable build is
// bumped in place whenever upstream cuts a new version (e.g. v1.0.0 -> v1.0.2);
// the importer stages the new .bin and prunes the superseded one, so exactly
// one Sense360-Ceiling-POE-VentIQ-RoomIQ-v<semver>-stable.bin must be on disk.
// Pinning a literal version re-broke this guard on every bump; resolving from
// disk and asserting the singleton keeps the stale-binary protection intact
// (two versions present => count !== 1 => fail) without the version coupling.
const RELEASE_ONE_STABLE_RE =
    /^Sense360-Ceiling-POE-VentIQ-RoomIQ-v\d+\.\d+\.\d+-stable\.bin$/;
function resolveReleaseOneBin() {
    const matches = fs
        .readdirSync(configurationsDir)
        .filter(name => RELEASE_ONE_STABLE_RE.test(name));
    if (matches.length !== 1) {
        throw new Error(
            'Expected exactly one Release-One stable .bin matching ' +
                `${RELEASE_ONE_STABLE_RE} in firmware/configurations/, found ` +
                `${matches.length}: [${matches.join(', ')}]. A superseded ` +
                'version was likely left on disk; regenerate after import.'
        );
    }
    return matches[0];
}
const RELEASE_ONE_BIN = resolveReleaseOneBin();
const RELEASE_ONE_SIDECAR = RELEASE_ONE_BIN.replace(/\.bin$/, '.meta.json');
const ROOMIQ_STABLE_BIN = 'Sense360-Ceiling-POE-RoomIQ-v1.0.5-stable.bin';
const ROOMIQ_STABLE_SIDECAR = ROOMIQ_STABLE_BIN.replace(/\.bin$/, '.meta.json');
const LED_PREVIEW_BIN = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin';
const LED_PREVIEW_SIDECAR = 'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.meta.json';

// WF-PREVIEW-IMPORT-FIRST-BATCH-001 — two first-batch preview builds
// imported from upstream sense360store/esphome-public v1.0.0-preview.
const FIRST_BATCH_BINS = Object.freeze([
    'Sense360-Ceiling-POE-AirIQ-RoomIQ-v1.0.0-preview.bin',
    'Sense360-Ceiling-POE-RoomIQ-LED-v1.0.0-preview.bin'
]);
const FIRST_BATCH_SIDECARS = Object.freeze(
    FIRST_BATCH_BINS.map(name => name.replace(/\.bin$/, '.meta.json'))
);

// WEBFLASH-RELAY-001 — FanRelay manual-preview build imported from the same
// upstream v1.0.0-preview release (upstream marked it WebFlash-import eligible).
const FANRELAY_BIN = 'Sense360-Ceiling-POE-VentIQ-FanRelay-RoomIQ-v1.0.0-preview.bin';
const FANRELAY_SIDECAR = FANRELAY_BIN.replace(/\.bin$/, '.meta.json');

// WEBFLASH-PWM-001 — FanPWM manual-preview build imported from the same upstream
// v1.0.0-preview release (upstream marked it WebFlash-import eligible).
const FANPWM_BIN = 'Sense360-Ceiling-POE-FanPWM-v1.0.0-preview.bin';
const FANPWM_SIDECAR = FANPWM_BIN.replace(/\.bin$/, '.meta.json');

// WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — FanDAC manual-preview build imported
// from the same upstream v1.0.0-preview release (upstream marked it WebFlash-
// import eligible) by the preview-eligible import automation.
const FANDAC_BIN = 'Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin';
const FANDAC_SIDECAR = FANDAC_BIN.replace(/\.bin$/, '.meta.json');

// WF-IMPORT-FAN-BUNDLES-001 — the five full-composition Bathroom / Kitchen
// fan-control room-bundle preview builds imported from the same upstream
// v1.0.0-preview release (upstream ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001
// marked them WebFlash-import eligible). Advanced-install-only previews; none
// carries a FanTRIAC or LED token.
const FAN_BUNDLE_BINS = Object.freeze([
    'Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin',
    'Sense360-Ceiling-POE-VentIQ-FanDAC-RoomIQ-v1.0.0-preview.bin',
    'Sense360-Ceiling-POE-AirIQ-FanRelay-RoomIQ-v1.0.0-preview.bin',
    'Sense360-Ceiling-POE-AirIQ-FanDAC-RoomIQ-v1.0.0-preview.bin',
    'Sense360-Ceiling-POE-AirIQ-FanPWM-RoomIQ-v1.0.0-preview.bin'
]);
const FAN_BUNDLE_SIDECARS = Object.freeze(
    FAN_BUNDLE_BINS.map(name => name.replace(/\.bin$/, '.meta.json'))
);

const EXPECTED_BINS = Object.freeze([
    RELEASE_ONE_BIN,
    ROOMIQ_STABLE_BIN,
    LED_PREVIEW_BIN,
    ...FIRST_BATCH_BINS,
    FANRELAY_BIN,
    FANPWM_BIN,
    FANDAC_BIN,
    ...FAN_BUNDLE_BINS
]);
const EXPECTED_SIDECARS = Object.freeze([
    RELEASE_ONE_SIDECAR,
    ROOMIQ_STABLE_SIDECAR,
    LED_PREVIEW_SIDECAR,
    ...FIRST_BATCH_SIDECARS,
    FANRELAY_SIDECAR,
    FANPWM_SIDECAR,
    FANDAC_SIDECAR,
    ...FAN_BUNDLE_SIDECARS
]);

const EXPECTED_FILES = Object.freeze([...EXPECTED_BINS, ...EXPECTED_SIDECARS]);

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
        const expected = [...EXPECTED_FILES].sort();
        expect(actual).toEqual(expected);
    });

    test('no unexpected .bin file exists in firmware/configurations/', () => {
        const bins = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.bin'));
        const unexpected = bins.filter(name => !EXPECTED_BINS.includes(name));
        expect(unexpected).toEqual([]);
    });

    test('no unexpected .meta.json sidecar exists in firmware/configurations/', () => {
        const sidecars = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.meta.json'));
        const unexpected = sidecars.filter(
            name => !EXPECTED_SIDECARS.includes(name)
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

    test('every expected binary is a non-empty regular file', () => {
        for (const name of EXPECTED_BINS) {
            const filePath = path.join(configurationsDir, name);
            const stat = fs.statSync(filePath);
            expect(stat.isFile()).toBe(true);
            expect(stat.size).toBeGreaterThan(0);
        }
    });

    test('every expected sidecar parses as JSON', () => {
        for (const name of EXPECTED_SIDECARS) {
            const filePath = path.join(configurationsDir, name);
            const raw = fs.readFileSync(filePath, 'utf8');
            expect(() => JSON.parse(raw)).not.toThrow();
        }
    });
});
