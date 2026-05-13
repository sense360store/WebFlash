import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// Smoke check that the generated production manifest contains every
// config_string that firmware/sources.json declares as imported from an
// upstream release. Pairs with the bash REQUIRED_CONFIGS gate in
// .github/workflows/firmware-publish.yml — that gate enforces the broader
// allowlist; this test asserts the cross-repo importer side specifically.
//
// Until `python3 scripts/import-firmware-sources.py` has been run against
// sense360store/esphome-public v1.0.0 (or the equivalent CI workflow runs),
// the Ceiling-POE-VentIQ-RoomIQ entry will be absent from manifest.json and
// this test will fail with a clear "not yet imported" message. That is the
// intended signal: the test goes green the moment the importer runs and the
// regenerated manifest gets committed.

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'manifest.json');
const sourcesPath = path.join(repoRoot, 'firmware', 'sources.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));

const manifestConfigStrings = new Set(
    (manifest.builds || [])
        .map(b => b.config_string)
        .filter(cs => typeof cs === 'string' && cs.length > 0)
);

describe('firmware/sources.json ↔ manifest.json', () => {
    test('sources.json declares schema_version 1 with at least one entry', () => {
        expect(sources.schema_version).toBe(1);
        expect(Array.isArray(sources.sources)).toBe(true);
        expect(sources.sources.length).toBeGreaterThan(0);
    });

    test('every declared source has the fields the importer requires', () => {
        for (const entry of sources.sources) {
            expect(typeof entry.source_repo).toBe('string');
            expect(typeof entry.release_tag).toBe('string');
            expect(typeof entry.asset_name).toBe('string');
            expect(typeof entry.config_string).toBe('string');
            expect(Array.isArray(entry.required_assets)).toBe(true);
            expect(entry.required_assets).toContain(entry.asset_name);
            expect(entry.required_assets).toContain('checksums-sha256.txt');
        }
    });

    test('Release-One source is the esphome-public v1.0.0 RoomIQ build', () => {
        const releaseOne = sources.sources.find(
            s => s.config_string === 'Ceiling-POE-VentIQ-RoomIQ'
        );
        expect(releaseOne).toBeDefined();
        expect(releaseOne.source_repo).toBe('sense360store/esphome-public');
        expect(releaseOne.release_tag).toBe('v1.0.0');
        expect(releaseOne.asset_name).toBe(
            'Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin'
        );
        // Defense-in-depth: Release-One must block FanTRIAC and LED tokens
        // even though the v1.0.0 release ships neither asset.
        expect(releaseOne.block_tokens).toContain('FanTRIAC');
        expect(releaseOne.block_tokens).toContain('LED');
    });

    test('manifest.json contains the Ceiling-POE-VentIQ-RoomIQ build', () => {
        // This is the cross-repo proof: once the importer has run, the
        // regenerated manifest must include the imported config_string.
        if (!manifestConfigStrings.has('Ceiling-POE-VentIQ-RoomIQ')) {
            throw new Error(
                'Ceiling-POE-VentIQ-RoomIQ is not in manifest.json. ' +
                    'Run `python3 scripts/import-firmware-sources.py` (or the ' +
                    'firmware-import.yml workflow) and then ' +
                    '`python3 scripts/gen-manifests.py --summary` to regenerate.'
            );
        }
        const match = manifest.builds.find(
            b => b.config_string === 'Ceiling-POE-VentIQ-RoomIQ'
        );
        expect(match).toBeDefined();
        expect(match.version).toBe('1.0.0');
        expect(match.channel).toBe('stable');
    });

    test('no FanTRIAC entry is imported for Release-One', () => {
        // Release-One must NOT carry a FanTRIAC-tagged config_string. The
        // separately-committed Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ
        // placeholder predates the importer and is unrelated.
        const releaseOne = sources.sources.find(
            s => s.config_string === 'Ceiling-POE-VentIQ-RoomIQ'
        );
        expect(releaseOne).toBeDefined();
        expect(releaseOne.config_string).not.toMatch(/FanTRIAC/i);
        expect(releaseOne.asset_name).not.toMatch(/FanTRIAC/i);
        expect(releaseOne.block_tokens).toContain('FanTRIAC');
    });

    test('no LED requirement is added for Release-One', () => {
        const releaseOne = sources.sources.find(
            s => s.config_string === 'Ceiling-POE-VentIQ-RoomIQ'
        );
        expect(releaseOne).toBeDefined();
        expect(releaseOne.config_string).not.toMatch(/-LED/);
        expect(releaseOne.asset_name).not.toMatch(/-LED-/);
        expect(releaseOne.block_tokens).toContain('LED');
    });
});
