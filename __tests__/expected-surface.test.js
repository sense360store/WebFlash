/**
 * WF-SURFACE-SSOT-001 — expected-surface fixture anchor suite.
 *
 * __tests__/fixtures/expected-surface.json is the reviewed single source of
 * truth for the deploy surface (per active build: config_string, version,
 * channel; plus Rescue and the retired-artifact register). Every other suite
 * derives its counts/sets/filenames from it via
 * __tests__/helpers/expected-surface.js. This suite is the anchor:
 *
 *   1. the fixture's derived views are internally consistent;
 *   2. manifest.json matches the fixture EXACTLY — per-build
 *      config/version/channel, in both directions (a build missing from the
 *      manifest fails, and a manifest build missing from the fixture fails,
 *      so a drifted fixture cannot auto-pass);
 *   3. every manifest part path is the canonical
 *      Sense360-<config>-v<version>-<channel>.bin filename derived from the
 *      fixture entry;
 *   4. the firmware-N.json namespace is exactly one file per expected build,
 *      contiguous from 0 to count - 1;
 *   5. the fixture agrees with the kits.json-derived stable surface
 *      (__tests__/helpers/stable-surface.js), so the two expectation helpers
 *      cannot drift apart silently.
 *
 * Promotion procedure: a surface change = the import/retire PR + one
 * expected-surface.json edit in the same PR, reviewed together. See
 * docs/expected-surface-fixture.md.
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
    expectedBuilds,
    rescueBuild,
    expectedManifestBuilds,
    expectedTotalBuildCount,
    expectedMaxFirmwareIndex,
    expectedConfigStrings,
    expectedStableConfigs,
    expectedPreviewConfigs,
    expectedChannelCounts,
    expectedConfigurationBins,
    expectedConfigurationFiles,
    retiredBuilds,
    retiredArtifacts,
    retiredConfigsStillAbsent,
    binNameFor,
    containsSegment
} from './helpers/expected-surface.js';
import {
    stableManifestConfigs,
    requiredConfigs,
    RESCUE_CONFIG
} from './helpers/stable-surface.js';

const repoRoot = process.cwd();
const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8')
);
const builds = manifest.builds || [];

describe('WF-SURFACE-SSOT-001 — fixture internal integrity', () => {
    test('derived views add up (stable + preview = application builds; + Rescue = total)', () => {
        expect(expectedStableConfigs.length + expectedPreviewConfigs.length).toBe(
            expectedBuilds.length
        );
        expect(expectedTotalBuildCount).toBe(expectedBuilds.length + 1);
        expect(expectedChannelCounts.stable).toBe(expectedStableConfigs.length);
        expect(expectedChannelCounts.preview).toBe(expectedPreviewConfigs.length);
        expect(expectedChannelCounts.rescue).toBe(1);
        expect(expectedMaxFirmwareIndex).toBe(expectedTotalBuildCount - 1);
        expect(expectedConfigStrings).toContain(RESCUE_CONFIG);
    });

    test('no expected or retired entry carries a FanTRIAC segment', () => {
        // The helper already fails loud at load; this restates the intent-side
        // FanTRIAC block visibly. The reality-side FanTRIAC guards (manifest,
        // disk, catalog, sources) live in their own suites and do not weaken.
        for (const entry of [...expectedManifestBuilds, ...retiredBuilds]) {
            expect(containsSegment(entry.config_string, 'FanTRIAC')).toBe(false);
        }
    });

    test('retired artifacts are disjoint from the expected on-disk files', () => {
        for (const name of retiredArtifacts) {
            expect(expectedConfigurationFiles).not.toContain(name);
        }
    });

    test('every still-absent retired config is genuinely outside the active surface', () => {
        for (const cs of retiredConfigsStillAbsent) {
            expect(expectedConfigStrings).not.toContain(cs);
        }
    });
});

describe('WF-SURFACE-SSOT-001 — manifest.json matches the fixture exactly', () => {
    test('the build count is exactly the fixture count', () => {
        expect(builds.length).toBe(expectedTotalBuildCount);
    });

    test('per-build config_string / version / channel triples match in both directions', () => {
        const actual = builds
            .map(b => ({
                config_string: b.config_string,
                version: b.version,
                channel: b.channel
            }))
            .sort((a, b) => a.config_string.localeCompare(b.config_string));
        const expected = expectedManifestBuilds
            .map(b => ({
                config_string: b.config_string,
                version: b.version,
                channel: b.channel
            }))
            .sort((a, b) => a.config_string.localeCompare(b.config_string));
        expect(actual).toEqual(expected);
    });

    test('no expected build ships deprecated', () => {
        for (const build of builds) {
            expect(build.deprecated).toBe(false);
        }
    });

    test('every manifest part path is the canonical filename derived from the fixture', () => {
        const byConfig = new Map(builds.map(b => [b.config_string, b]));
        for (const entry of expectedBuilds) {
            const build = byConfig.get(entry.config_string);
            expect(build).toBeDefined();
            expect(build.parts.length).toBeGreaterThan(0);
            expect(build.parts[0].path).toBe(
                `firmware/configurations/${binNameFor(entry)}`
            );
        }
        const rescue = byConfig.get(rescueBuild.config_string);
        expect(rescue).toBeDefined();
        expect(rescue.parts[0].path).toBe(
            `firmware/rescue/${binNameFor(rescueBuild)}`
        );
    });

    test('retired artifacts are referenced by no manifest part', () => {
        const partPaths = builds.flatMap(b => (b.parts || []).map(p => p.path));
        for (const artifact of retiredArtifacts) {
            for (const partPath of partPaths) {
                expect(path.basename(partPath)).not.toBe(artifact);
            }
        }
    });

    test('still-absent retired configs have no manifest build at all', () => {
        const present = new Set(builds.map(b => b.config_string));
        for (const cs of retiredConfigsStillAbsent) {
            expect(present.has(cs)).toBe(false);
        }
    });

    test('no retired config/channel pair resurfaces (a returned config must not ship the retired channel artifact)', () => {
        // E.g. Ceiling-POE-AirIQ-RoomIQ retired as a v1.0.0 preview and
        // returned as the v1.0.6 stable: the config may be present, but never
        // again as that retired preview build.
        for (const retired of retiredBuilds) {
            const offenders = builds.filter(
                b =>
                    b.config_string === retired.config_string &&
                    b.channel === retired.channel &&
                    b.version === retired.version
            );
            expect(offenders).toEqual([]);
        }
    });
});

describe('WF-SURFACE-SSOT-001 — firmware-N.json namespace matches the fixture', () => {
    const indices = fs
        .readdirSync(repoRoot)
        .map(name => name.match(/^firmware-(\d+)\.json$/))
        .filter(Boolean)
        .map(m => Number(m[1]))
        .sort((a, b) => a - b);

    test('exactly one per-build manifest per expected build', () => {
        expect(indices.length).toBe(expectedTotalBuildCount);
    });

    test('indices are contiguous from 0 to the fixture-derived max index', () => {
        expect(indices).toEqual(
            Array.from({ length: expectedTotalBuildCount }, (_, i) => i)
        );
        expect(indices[indices.length - 1]).toBe(expectedMaxFirmwareIndex);
    });
});

describe('WF-SURFACE-SSOT-001 — the two expectation helpers agree', () => {
    test('the fixture stable set equals the kits.json-derived stable surface', () => {
        // stable-surface.js derives the stable surface from kits.json plus the
        // sanctioned kit-withheld register; the expected-surface fixture
        // declares it directly. The two are independent files, so this
        // comparison catches either drifting: a kit promotion that forgot the
        // fixture edit, or a fixture edit that forgot the kit decision.
        expect([...expectedStableConfigs]).toEqual([...stableManifestConfigs]);
    });

    test('every REQUIRED_CONFIGS expectation is Rescue or a fixture stable config', () => {
        for (const cs of requiredConfigs) {
            if (cs === RESCUE_CONFIG) {
                continue;
            }
            expect(expectedStableConfigs).toContain(cs);
        }
    });

    test('the fixture preview set never intersects REQUIRED_CONFIGS expectations', () => {
        for (const cs of expectedPreviewConfigs) {
            expect(requiredConfigs).not.toContain(cs);
        }
    });

    test('expected bins all follow the canonical filename convention', () => {
        for (const name of expectedConfigurationBins) {
            expect(name).toMatch(
                /^Sense360-[A-Za-z0-9-]+-v\d+\.\d+\.\d+-(stable|preview)\.bin$/
            );
        }
    });
});
