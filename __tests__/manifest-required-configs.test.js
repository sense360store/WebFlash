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
// sense360store/esphome-public (or the equivalent CI workflow runs),
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

    test('Release-One source is the esphome-public RoomIQ stable build', () => {
        const releaseOne = sources.sources.find(
            s => s.config_string === 'Ceiling-POE-VentIQ-RoomIQ'
        );
        expect(releaseOne).toBeDefined();
        expect(releaseOne.source_repo).toBe('sense360store/esphome-public');

        // Version-agnostic: do NOT pin a specific release version here. The
        // source declaration legitimately moves ahead of manifest.json
        // whenever upstream cuts a new Release-One build (for example
        // v1.0.0 -> v1.0.2) and firmware/sources.json is updated before the
        // importer regenerates the manifest. Pinning a literal version string
        // re-broke CI on every bump. Assert the entry's internal consistency
        // and its standing defense-in-depth guarantees instead.
        expect(typeof releaseOne.release_tag).toBe('string');
        expect(typeof releaseOne.asset_name).toBe('string');

        // The release_tag version token (e.g. "1.0.2" from "v1.0.2") must
        // appear in the asset filename so the two can never silently drift.
        const versionToken = releaseOne.release_tag.replace(/^v/, '').split('-')[0];
        expect(versionToken).toMatch(/^\d+\.\d+\.\d+$/);
        expect(releaseOne.asset_name).toContain(`v${versionToken}`);

        // required_assets must carry the asset itself plus the upstream
        // SHA256 checksum manifest the importer verifies against.
        expect(Array.isArray(releaseOne.required_assets)).toBe(true);
        expect(releaseOne.required_assets).toContain(releaseOne.asset_name);
        expect(releaseOne.required_assets).toContain('checksums-sha256.txt');

        // Defense-in-depth: Release-One must block FanTRIAC and LED tokens.
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
        // Version-agnostic: the committed manifest may lag the source
        // declaration during the import window, so assert a valid semver
        // rather than a pinned literal. The stable channel is the invariant.
        expect(match.version).toMatch(/^\d+\.\d+\.\d+$/);
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
