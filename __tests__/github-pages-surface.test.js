import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
// REQUIRED_CONFIGS production surface derived from kits.json, not hardcoded.
// See __tests__/helpers/stable-surface.js for the anti-tautology contract.
import { requiredConfigs } from './helpers/stable-surface.js';
// WF-SURFACE-SSOT-001: build count, per-build channel/version expectations,
// and the firmware-N index bound all derive from the reviewed
// expected-surface fixture. A surface change edits
// __tests__/fixtures/expected-surface.json in the same PR.
import {
    expectedBuilds,
    rescueBuild,
    expectedTotalBuildCount,
    expectedMaxFirmwareIndex,
    expectedChannelCounts,
    expectedPreviewConfigs
} from './helpers/expected-surface.js';

// WF-DEPLOY-001 — GitHub Pages surface guard.
//
// The live Pages origin drifted to a May-7 snapshot (source_commit
// 821e33017df5e66f812cf0d570800f73c083de15) because the `test` job in
// firmware-publish.yml had been failing on every push to main, which
// blocked the `build` and `deploy` jobs from running. The actual fix is
// in __tests__/firmware-provenance.test.js (a stale deprecated-build
// assertion was deleted), but the visible symptom — a wrong-shape live
// manifest — is the contract this file pins so a future cleanup or
// import cannot quietly break the deploy chain again.
//
// All assertions read repo files only. The live origin is verified by
// scripts/smoke-test-deployment.py post-deploy (see
// firmware-publish.yml smoke-test job); this file deliberately stays
// network-free so it can run in any environment.

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'manifest.json');
const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    'firmware-publish.yml'
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// The known-bad source_commit served by the May-7 stale deploy. Used as
// a negative assertion so a future revert / branch mishap that ships
// this exact snapshot fails CI loudly.
const STALE_DEPLOY_SOURCE_COMMIT =
    '821e33017df5e66f812cf0d570800f73c083de15';

// Legacy config_strings that lived in the May-7 stale manifest. These
// were dropped by WF-CLEANUP-004 because none have a backing .bin or a
// firmware/sources.json source entry; the deploy must not regress to
// shipping them. The FanTRIAC config is enforced separately via the
// block_tokens / manifest-health guard.
const STALE_LEGACY_CONFIG_STRINGS = [
    'Ceiling-POE-AirIQ',
    'Ceiling-POE-VentIQ',
    'Ceiling-PWR-AirIQ',
    'Ceiling-USB',
    'Ceiling-USB-AirIQ',
    'Ceiling-USB-FanPWM',
    'Ceiling-Voice-POE-AirIQ',
    'Ceiling-Voice-USB'
];

// Mirrors __tests__/manifest-health.test.js: hyphen-bounded segment
// match so "LED" does not false-match "LEDless" and "FanTRIAC" does not
// false-match any unrelated longer token.
function containsSegment(configString, token) {
    if (typeof configString !== 'string' || configString.length === 0) {
        return false;
    }
    return configString.split('-').includes(token);
}

function parseRequiredConfigsFromWorkflow() {
    const yaml = fs.readFileSync(workflowPath, 'utf8');
    const arrayBlock = yaml.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
    if (!arrayBlock) {
        throw new Error(
            'Could not locate REQUIRED_CONFIGS=( ... ) in ' +
                '.github/workflows/firmware-publish.yml. The workflow shape ' +
                'changed; update __tests__/github-pages-surface.test.js.'
        );
    }
    const entries = [];
    const entryRe = /"([^"\n]+)"/g;
    let m;
    while ((m = entryRe.exec(arrayBlock[1])) !== null) {
        entries.push(m[1]);
    }
    return entries;
}

describe('github-pages-surface — manifest shape pins the deploy contract', () => {
    test('manifest.json holds exactly the fixture-declared build count', () => {
        // Derived from the expected-surface fixture (currently three stable +
        // six preview + Rescue). An import/retirement edits the fixture in the
        // same PR; an unreviewed manifest change fails here in either
        // direction.
        expect(Array.isArray(manifest.builds)).toBe(true);
        expect(manifest.builds.length).toBe(expectedTotalBuildCount);
    });

    test('per-channel build counts match the fixture', () => {
        const byChannel = (ch) =>
            manifest.builds.filter(b => b.channel === ch).length;
        expect(byChannel('stable')).toBe(expectedChannelCounts.stable);
        expect(byChannel('preview')).toBe(expectedChannelCounts.preview);
        expect(byChannel('rescue')).toBe(expectedChannelCounts.rescue);
    });

    test('manifest.json source_commit is not the May-7 stale deploy SHA', () => {
        // Defence-in-depth: if a revert or a bad merge ever puts the
        // May-7 snapshot back on main, this assertion turns red before
        // it can reach the live origin.
        expect(manifest.source_commit).not.toBe(STALE_DEPLOY_SOURCE_COMMIT);
    });

    test('manifest.json source_commit looks like a real 40-char hex SHA', () => {
        expect(typeof manifest.source_commit).toBe('string');
        expect(manifest.source_commit).toMatch(/^[0-9a-f]{40}$/);
    });
});

describe('github-pages-surface — expected builds present with correct channel', () => {
    // One assertion per fixture build (replacing the per-config literals that
    // re-broke on every import/promotion/version bump): each expected build is
    // present exactly once, on its declared channel and version,
    // non-deprecated. A channel regression (e.g. the LED preview silently
    // turning stable) is a fixture mismatch and fails here; making it stable
    // for real requires the reviewed fixture edit.
    test.each(expectedBuilds.map(b => [b.config_string, b]))(
        '%s is present once with the fixture channel and version, non-deprecated',
        (configString, expected) => {
            const matches = manifest.builds.filter(
                b => b.config_string === configString
            );
            expect(matches).toHaveLength(1);
            const build = matches[0];
            expect(build.channel).toBe(expected.channel);
            expect(build.version).toBe(expected.version);
            expect(build.deprecated).toBe(false);
        }
    );

    test('Rescue firmware is present on the rescue channel', () => {
        const matches = manifest.builds.filter(
            b => b.config_string === rescueBuild.config_string
        );
        expect(matches).toHaveLength(1);
        expect(matches[0].channel).toBe(rescueBuild.channel);
    });
});

describe('github-pages-surface — stale and blocked builds stay out', () => {
    test('no manifest build is the orphan FanTRIAC stable that the May-7 deploy still serves', () => {
        // Defence-in-depth on top of manifest-health.test.js. The May-7
        // live origin still serves Sense360-Ceiling-POE-VentIQ-FanTRIAC-
        // RoomIQ-v1.0.0-stable.bin; the new deploy must not.
        const offenders = manifest.builds
            .map(b => b.config_string)
            .filter(cs => containsSegment(cs, 'FanTRIAC'));
        expect(offenders).toEqual([]);
    });

    test('no manifest build carries a stale legacy AirIQ / PWR / USB / Voice config_string', () => {
        const present = new Set(
            manifest.builds.map(b => b.config_string).filter(Boolean)
        );
        const offenders = STALE_LEGACY_CONFIG_STRINGS.filter(cs =>
            present.has(cs)
        );
        expect(offenders).toEqual([]);
    });

    test('every manifest build references a .bin that exists on disk', () => {
        // Sister assertion to manifest-health.test.js. Keeps this file
        // self-contained: if the manifest references a missing binary
        // the Pages artifact upload will silently exclude it and the
        // live install will 404.
        for (const build of manifest.builds) {
            expect(Array.isArray(build.parts)).toBe(true);
            expect(build.parts.length).toBeGreaterThan(0);
            for (const part of build.parts) {
                expect(typeof part.path).toBe('string');
                expect(part.path.length).toBeGreaterThan(0);
                const resolved = path.resolve(repoRoot, part.path);
                expect(fs.existsSync(resolved)).toBe(true);
            }
        }
    });
});

describe('github-pages-surface — firmware-N.json namespace matches manifest', () => {
    test('every firmware-N.json (one per manifest build) exists and resolves to on-disk bins', () => {
        const perBuild = fs
            .readdirSync(repoRoot)
            .filter(name => /^firmware-\d+\.json$/.test(name))
            .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
        // One per-build manifest per manifest.json build, and the namespace
        // size itself is pinned to the fixture-declared build count.
        expect(perBuild.length).toBe(manifest.builds.length);
        expect(perBuild.length).toBe(expectedTotalBuildCount);
        for (const name of perBuild) {
            const filePath = path.join(repoRoot, name);
            expect(fs.existsSync(filePath)).toBe(true);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            expect(Array.isArray(data.builds)).toBe(true);
            expect(data.builds.length).toBe(1);
            const part = data.builds[0].parts[0];
            expect(typeof part.path).toBe('string');
            const resolved = path.resolve(repoRoot, part.path);
            expect(fs.existsSync(resolved)).toBe(true);
        }
    });

    test('no firmware-N.json beyond the fixture-derived max index exists (no stale per-build manifests)', () => {
        // The namespace is firmware-0 … firmware-(count - 1), one per build in
        // the generator's deterministic order, with the max index derived from
        // the expected-surface fixture. Anything past it would indicate the
        // manifest regenerator inherited a legacy index or a stale file
        // shipped in the Pages artifact.
        const repoFiles = fs.readdirSync(repoRoot);
        const offending = repoFiles.filter(name => {
            const match = name.match(/^firmware-(\d+)\.json$/);
            if (!match) return false;
            return Number(match[1]) > expectedMaxFirmwareIndex;
        });
        expect(offending).toEqual([]);
    });
});

describe('github-pages-surface — REQUIRED_CONFIGS allowlist contract', () => {
    test('REQUIRED_CONFIGS holds exactly Ceiling-POE-VentIQ-RoomIQ and Rescue', () => {
        // WF-LED-003 pinned this as production-only; LED preview must
        // not be in REQUIRED_CONFIGS (it's preview, not production).
        const required = parseRequiredConfigsFromWorkflow();
        // The workflow allowlist (a different artifact) is cross-checked against
        // the kits.json-derived production surface plus the standalone Rescue build.
        expect(new Set(required)).toEqual(new Set(requiredConfigs));
    });

    test('no preview build is in REQUIRED_CONFIGS (preview, not production)', () => {
        // Generalised from the original LED-only literal: every fixture
        // preview config must stay out of the production-only allowlist.
        const required = parseRequiredConfigsFromWorkflow();
        for (const cs of expectedPreviewConfigs) {
            expect(required).not.toContain(cs);
        }
    });
});
