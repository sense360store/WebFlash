import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
// REQUIRED_CONFIGS production surface derived from kits.json, not hardcoded.
// See __tests__/helpers/stable-surface.js for the anti-tautology contract.
import { requiredConfigs } from './helpers/stable-surface.js';

// WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001 — documentation guard.
//
// The WebFlash Sense360 product/release status narrative is consolidated into a
// single canonical doc (docs/sense360-webflash-status.md). This guard pins the
// invariants that consolidation depends on so the doc cannot silently drift away
// from the live install surface (manifest.json / firmware/sources.json /
// REQUIRED_CONFIGS) or start making claims the repo does not back:
//
//   - the canonical doc exists and the stale FEATURES.md redirects to it,
//   - the doc's release-selectable / preview targets match manifest exposure,
//   - FanPWM stays blocked (no manifest build, no source entry, not release-ready),
//   - LED stays preview-only (no LED-stable claim),
//   - S360-410 is never claimed verified,
//   - the doc links back to the upstream canonical roadmap.
//
// This is a docs-only guard: it reads files, it does not change any surface.

const repoRoot = process.cwd();
const canonicalDocPath = path.join(repoRoot, 'docs', 'sense360-webflash-status.md');
const featuresPath = path.join(repoRoot, 'FEATURES.md');
const manifestPath = path.join(repoRoot, 'manifest.json');
const sourcesPath = path.join(repoRoot, 'firmware', 'sources.json');
const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    'firmware-publish.yml'
);

const canonicalDoc = fs.readFileSync(canonicalDocPath, 'utf8');
const features = fs.readFileSync(featuresPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));

const manifestBuilds = manifest.builds || [];
const manifestByConfig = new Map(
    manifestBuilds
        .filter(b => typeof b.config_string === 'string')
        .map(b => [b.config_string, b])
);

function parseRequiredConfigsFromWorkflow() {
    // REQUIRED_CONFIGS lives as a bash array literal in firmware-publish.yml.
    // Same extraction the manifest-health guard uses — bounded to the
    // REQUIRED_CONFIGS=( ... ) block, pulling every "..." string out.
    const yaml = fs.readFileSync(workflowPath, 'utf8');
    const arrayBlock = yaml.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
    if (!arrayBlock) {
        throw new Error(
            'Could not locate REQUIRED_CONFIGS=( ... ) in ' +
                '.github/workflows/firmware-publish.yml. The workflow shape ' +
                'changed; update __tests__/sense360-webflash-status.test.js.'
        );
    }
    const entries = [];
    const entryRe = /"([^"\n]+)"/g;
    let m;
    while ((m = entryRe.exec(arrayBlock[1])) !== null) {
        entries.push(m[1]);
    }
    if (entries.length === 0) {
        throw new Error(
            'REQUIRED_CONFIGS=( ... ) parsed as empty. The workflow shape ' +
                'changed; update __tests__/sense360-webflash-status.test.js.'
        );
    }
    return entries;
}

describe('WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001 — canonical status doc exists', () => {
    test('docs/sense360-webflash-status.md exists and is the canonical doc', () => {
        expect(fs.existsSync(canonicalDocPath)).toBe(true);
        expect(canonicalDoc).toMatch(/WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001/);
        expect(canonicalDoc.toLowerCase()).toContain('canonical');
    });

    test('FEATURES.md is deprecated and redirects to the canonical doc', () => {
        expect(features.toLowerCase()).toContain('consolidated');
        expect(features).toContain('docs/sense360-webflash-status.md');
    });

    test('the doc links back to the upstream canonical roadmap', () => {
        expect(canonicalDoc).toContain('sense360-roadmap-status.md');
        expect(canonicalDoc).toContain('sense360store/esphome-public');
    });
});

describe('WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001 — supported targets match manifest exposure', () => {
    test('Release-One stable is release-selectable and in manifest + REQUIRED_CONFIGS', () => {
        const required = parseRequiredConfigsFromWorkflow();
        const releaseOne = manifestByConfig.get('Ceiling-POE-VentIQ-RoomIQ');
        expect(releaseOne).toBeDefined();
        expect(releaseOne.channel).toBe('stable');
        expect(required).toContain('Ceiling-POE-VentIQ-RoomIQ');
        // The doc must name the release-selectable stable target.
        expect(canonicalDoc).toContain('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('LED is preview-only — preview channel, not in REQUIRED_CONFIGS, no stable claim', () => {
        const required = parseRequiredConfigsFromWorkflow();
        const led = manifestByConfig.get('Ceiling-POE-VentIQ-RoomIQ-LED');
        expect(led).toBeDefined();
        expect(led.channel).toBe('preview');
        expect(required).not.toContain('Ceiling-POE-VentIQ-RoomIQ-LED');
        // The doc must describe LED as preview-only and carry an explicit
        // "not stable" disclaimer rather than claiming LED is stable.
        expect(canonicalDoc).toMatch(/preview[- ]only/i);
        expect(canonicalDoc).toMatch(/not[- ]?\s*stable|no LED-stable claim/i);
    });

    test('REQUIRED_CONFIGS is production-only (Release-One + Rescue)', () => {
        const required = parseRequiredConfigsFromWorkflow();
        // Workflow allowlist (a different artifact) cross-checked against the
        // kits.json-derived production surface plus the standalone Rescue build.
        expect(required).toEqual(requiredConfigs);
    });
});

describe('WEBFLASH-DOCS-CONSOLIDATION-SENSE360-001 — blocked hardware stays blocked', () => {
    // WEBFLASH-RELAY-001 + WEBFLASH-PWM-001 — FanRelay and FanPWM are now exposed
    // manual-previews (see the dedicated describe blocks below). FanDAC / FanTRIAC stay out.
    const fanTokens = ['FanTRIAC'];

    test('no FanDAC/FanTRIAC firmware is exposed in manifest.json', () => {
        for (const build of manifestBuilds) {
            const cs = build.config_string || '';
            for (const token of fanTokens) {
                expect(cs).not.toContain(token);
            }
        }
    });

    test('no FanDAC/FanTRIAC firmware has a firmware/sources.json source entry', () => {
        for (const entry of sources.sources || []) {
            const cs = entry.config_string || '';
            const asset = entry.asset_name || '';
            for (const token of fanTokens) {
                expect(cs).not.toContain(token);
                expect(asset).not.toContain(token);
            }
        }
    });

    test('the doc keeps the S360-410 PoE blocker visible and makes no verified claim', () => {
        expect(canonicalDoc).toContain('S360-410');
        expect(canonicalDoc.toLowerCase()).toContain('blocked');
        // No "S360-410 ... verified" claim may appear.
        expect(canonicalDoc).not.toMatch(/S360-410[^.\n]*\bverified\b/i);
    });
});

describe('WEBFLASH-RELAY-001 — FanRelay is an exposed manual-preview, not a customer default', () => {
    const FANRELAY_CONFIG = 'Ceiling-POE-VentIQ-FanRelay-RoomIQ';

    test('the retired FanRelay preview is out of manifest.json', () => {
        // Retired with the stale v1.0.0-preview batch: upstream's regenerated
        // checksums-sha256.txt no longer lists the VentIQ FanRelay asset, so
        // the importer fails closed on it and the build left the manifest.
        const build = manifestByConfig.get(FANRELAY_CONFIG);
        expect(build).toBeUndefined();
    });

    test('the retired FanRelay preview is out of firmware/sources.json', () => {
        const entry = (sources.sources || []).find(
            s => s.config_string === FANRELAY_CONFIG
        );
        expect(entry).toBeUndefined();
    });

    test('FanRelay is NOT in REQUIRED_CONFIGS (production-only)', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(FANRELAY_CONFIG);
    });

    test('the doc records FanRelay as a preview / manual-preview, Advanced-install-only target', () => {
        expect(canonicalDoc).toMatch(/FanRelay|S360-310/);
        // The doc must frame FanRelay as preview / manual-preview, not stable.
        expect(canonicalDoc.toLowerCase()).toMatch(/manual-preview|preview/);
        // It must steer normal customers to the stable Bathroom PoE build and
        // make no hardware/compliance claim for FanRelay.
        expect(canonicalDoc.toLowerCase()).toMatch(
            /not for normal customers|advanced install|advanced-install/
        );
    });
});

describe('WEBFLASH-PWM-001 — FanPWM is an exposed manual-preview, not a customer default', () => {
    const FANPWM_CONFIG = 'Ceiling-POE-FanPWM';

    test('the retired standalone FanPWM preview is out of manifest.json', () => {
        // Retired with the stale v1.0.0-preview batch: upstream's regenerated
        // checksums-sha256.txt no longer lists the standalone FanPWM asset, so
        // the importer fails closed on it and the build left the manifest.
        const build = manifestByConfig.get(FANPWM_CONFIG);
        expect(build).toBeUndefined();
    });

    test('the retired standalone FanPWM preview is out of firmware/sources.json', () => {
        const entry = (sources.sources || []).find(
            s => s.config_string === FANPWM_CONFIG
        );
        expect(entry).toBeUndefined();
    });

    test('FanPWM is NOT in REQUIRED_CONFIGS (production-only)', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(FANPWM_CONFIG);
    });

    test('the doc records FanPWM as a preview / manual-preview, Advanced-install-only target', () => {
        expect(canonicalDoc).toMatch(/FanPWM|S360-311/);
        // The doc must frame FanPWM as preview / manual-preview, not stable.
        expect(canonicalDoc.toLowerCase()).toMatch(/manual-preview|preview/);
        // It must steer normal customers to the stable Bathroom PoE build and
        // make no hardware/compliance claim for FanPWM.
        expect(canonicalDoc.toLowerCase()).toMatch(
            /not for normal customers|advanced install|advanced-install/
        );
    });
});
