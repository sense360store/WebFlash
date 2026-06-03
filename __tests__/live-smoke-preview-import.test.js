import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
    pickDefaultBuild,
    getChannelPolicy,
    getRequiredAcknowledgements,
    filterBuildsForMode,
    normaliseReleaseChannel
} from '../scripts/utils/release-channels.js';
import { findKitPresetById } from '../scripts/data/kit-presets.js';
import {
    deriveManifestIndex,
    classifyModuleVariant,
    MODULE_VARIANT_AVAILABILITY_OVERRIDES
} from '../scripts/utils/module-availability.js';

// WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — automated half of the live/manual smoke
// checklist that verifies the deployed WebFlash behaviour after the first
// preview firmware batch (WF-PREVIEW-IMPORT-FIRST-BATCH-001) landed.
//
// The manual checklist lives at docs/live-smoke-preview-import.md and covers the
// browser-observable behaviour (Web Serial connect, release-note pop-overs,
// install-button enablement, screenshots) that a unit test cannot reach. This
// file locks the deterministic invariants that back every row of that checklist
// against the live repository state (manifest.json / firmware/sources.json /
// scripts/data/kit-presets.js / scripts/utils/release-channels.js /
// scripts/utils/module-availability.js):
//
//   - the manifest carries exactly the expected six builds,
//   - the preview imports are Advanced-install-only (never default-picked,
//     acknowledgement-gated),
//   - Simple install resolves only to the stable Bathroom PoE build,
//   - every preview build has working in-card release notes (no dead links),
//   - no TRIAC / fan-driver firmware was imported,
//   - AirIQ availability derives from the manifest (no static override),
//   - the stable Simple-install build is not blocked by a channel gate,
//   - the existing VentIQ LED preview still resolves and stays preview-only.
//
// Docs/test only: it reads files and pure helpers; it changes no surface.

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'manifest.json');
const sourcesPath = path.join(repoRoot, 'firmware', 'sources.json');
const smokeDocPath = path.join(repoRoot, 'docs', 'live-smoke-preview-import.md');
const statusDocPath = path.join(repoRoot, 'docs', 'sense360-webflash-status.md');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));

const builds = Array.isArray(manifest.builds) ? manifest.builds : [];
const buildByConfig = new Map(
    builds
        .filter(b => typeof b.config_string === 'string')
        .map(b => [b.config_string, b])
);

const STABLE_BATHROOM_POE = 'Ceiling-POE-VentIQ-RoomIQ';
const PREVIEW_FIRST_BATCH = Object.freeze([
    'Ceiling-POE-AirIQ-RoomIQ',
    'Ceiling-POE-RoomIQ',
    'Ceiling-POE-RoomIQ-LED'
]);
const VENTIQ_LED_PREVIEW = 'Ceiling-POE-VentIQ-RoomIQ-LED';
const RESCUE = 'Rescue';

const EXPECTED_BUILDS = Object.freeze([
    STABLE_BATHROOM_POE,
    VENTIQ_LED_PREVIEW,
    ...PREVIEW_FIRST_BATCH,
    RESCUE
]);

// Fan-driver / TRIAC tokens that must NOT have been imported by this batch.
const FORBIDDEN_FAN_TOKENS = Object.freeze(['FanTRIAC', 'FanRelay', 'FanPWM', 'FanDAC']);

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — manifest carries exactly the expected six builds', () => {
    test('manifest.json has exactly 6 builds', () => {
        expect(builds.length).toBe(6);
    });

    test('the six config strings match the expected live set', () => {
        const configs = builds.map(b => b.config_string).sort();
        expect(configs).toEqual([...EXPECTED_BUILDS].sort());
    });

    test('channel assignment matches the live posture (1 stable, 4 preview, 1 rescue)', () => {
        expect(buildByConfig.get(STABLE_BATHROOM_POE).channel).toBe('stable');
        expect(buildByConfig.get(VENTIQ_LED_PREVIEW).channel).toBe('preview');
        PREVIEW_FIRST_BATCH.forEach(cfg => {
            expect(buildByConfig.get(cfg).channel).toBe('preview');
        });
        expect(buildByConfig.get(RESCUE).channel).toBe('rescue');

        const channelCounts = builds.reduce((acc, b) => {
            acc[b.channel] = (acc[b.channel] || 0) + 1;
            return acc;
        }, {});
        expect(channelCounts).toEqual({ stable: 1, preview: 4, rescue: 1 });
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — preview imports are Advanced-install-only', () => {
    test('no preview build is ever auto-selected as the default', () => {
        // pickDefaultBuild only returns a defaultSelectable, non-deprecated,
        // mode-visible build. With the live manifest that can only be the
        // stable Bathroom PoE build.
        const picked = pickDefaultBuild(builds, { mode: 'normal' });
        expect(picked).not.toBeNull();
        expect(picked.config_string).toBe(STABLE_BATHROOM_POE);
        expect(normaliseReleaseChannel(picked.channel)).toBe('stable');
    });

    test('each preview build requires the channel:preview acknowledgement before install', () => {
        [...PREVIEW_FIRST_BATCH, VENTIQ_LED_PREVIEW].forEach(cfg => {
            const build = buildByConfig.get(cfg);
            const policy = getChannelPolicy(build.channel);
            expect(policy.key).toBe('preview');
            expect(policy.defaultSelectable).toBe(false);
            expect(policy.requiresAcknowledgement).toBe(true);

            const acks = getRequiredAcknowledgements(build);
            const keys = acks.map(a => a.key);
            expect(keys).toContain('channel:preview');
        });
    });

    test('preview builds are visible in normal mode but the stable build is the only default-eligible one', () => {
        // Preview is hiddenByDefault:false, so it shows up in the Advanced
        // (normal-mode) firmware list — it is just never the default pick.
        const visible = filterBuildsForMode(builds, 'normal').map(b => b.config_string);
        [...PREVIEW_FIRST_BATCH, VENTIQ_LED_PREVIEW, STABLE_BATHROOM_POE].forEach(cfg => {
            expect(visible).toContain(cfg);
        });
        const defaultEligible = filterBuildsForMode(builds, 'normal').filter(
            b => getChannelPolicy(b.channel).defaultSelectable && b.deprecated !== true
        );
        expect(defaultEligible.map(b => b.config_string)).toEqual([STABLE_BATHROOM_POE]);
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — Simple install resolves only to stable Bathroom PoE', () => {
    test('the Simple-install kit preset maps to the stable Bathroom PoE config', () => {
        // simple-install.js applies the S360-KIT-BATH-POE preset and lights up
        // the existing install surface. That preset must resolve only to the
        // stable build, with every preview-bearing module slot cleared.
        const preset = findKitPresetById('S360-KIT-BATH-POE');
        expect(preset).toBeTruthy();
        expect(preset.firmwareConfigString).toBe(STABLE_BATHROOM_POE);
        expect(preset.channel).toBe('stable');

        const state = preset.wizardState;
        expect(state.led).toBe('none');
        expect(state.airiq).toBe('none');
        expect(state.fan).toBe('none');
        expect(state.voice).toBe('none');
        expect(state.ventiq).toBe('ventiq');
        expect(state.roomiq).toBe('roomiq');
        expect(state.power).toBe('poe');
    });

    test('the stable Simple-install build carries no channel acknowledgement gate', () => {
        const stable = buildByConfig.get(STABLE_BATHROOM_POE);
        const policy = getChannelPolicy(stable.channel);
        expect(policy.requiresAcknowledgement).toBe(false);
        expect(getRequiredAcknowledgements(stable)).toEqual([]);
        // Not deprecated, so freshness/preflight are the only remaining gates —
        // and an unknown freshness verdict is non-blocking for stable.
        expect(stable.deprecated).not.toBe(true);
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — preview release notes exist and are not dead links', () => {
    test('every preview build renders a real release-notes affordance (URL or embedded changelog)', () => {
        // state.js renders "View Release Notes" only when a build has either a
        // release_url (external link) or a non-empty changelog (in-card
        // disclosure). With neither, no trigger renders — so a preview build
        // with neither would be a dead/missing link.
        [...PREVIEW_FIRST_BATCH, VENTIQ_LED_PREVIEW].forEach(cfg => {
            const build = buildByConfig.get(cfg);
            const hasUrl = typeof build.release_url === 'string' && build.release_url.trim() !== '';
            const changelog = Array.isArray(build.changelog)
                ? build.changelog.filter(e => typeof e === 'string' && e.trim() !== '')
                : [];
            expect(hasUrl || changelog.length > 0).toBe(true);
        });
    });

    test('no manifest build references a literal dead "#" release link', () => {
        for (const build of builds) {
            if (typeof build.release_url === 'string') {
                expect(build.release_url.trim()).not.toBe('#');
            }
        }
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — no TRIAC / fan-driver firmware imported', () => {
    test('no manifest build config_string carries a fan-driver token', () => {
        for (const build of builds) {
            const cfg = build.config_string || '';
            for (const token of FORBIDDEN_FAN_TOKENS) {
                expect(cfg).not.toContain(token);
            }
        }
    });

    test('no firmware/sources.json entry imports a fan-driver asset', () => {
        for (const entry of sources.sources || []) {
            const cfg = entry.config_string || '';
            const asset = entry.asset_name || '';
            for (const token of FORBIDDEN_FAN_TOKENS) {
                expect(cfg).not.toContain(token);
                expect(asset).not.toContain(token);
            }
        }
    });

    test('every source entry still blocks FanTRIAC via block_tokens', () => {
        for (const entry of sources.sources || []) {
            expect(Array.isArray(entry.block_tokens)).toBe(true);
            expect(entry.block_tokens).toContain('FanTRIAC');
        }
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — AirIQ availability derives from the manifest', () => {
    test('AirIQ has no static availability override', () => {
        // The static no-firmware override was removed when the AirIQ preview
        // build shipped; re-adding it would make the pill lie.
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.airiq).toBeUndefined();
    });

    test('AirIQ classifies as available-preview from the live manifest', () => {
        const index = deriveManifestIndex(builds);
        const result = classifyModuleVariant('airiq', 'airiq', {
            canonicalTokenFor: (moduleKey, variantKey) =>
                moduleKey === 'airiq' && variantKey === 'airiq' ? 'AirIQ' : null,
            manifestStableTokens: index.manifestStableTokens,
            manifestPreviewTokens: index.manifestPreviewTokens
        });
        expect(result.state).toBe('available-preview');
        expect(result.installable).toBe(true);
    });

    test('AirIQ token is preview-only — never reported as stable', () => {
        const index = deriveManifestIndex(builds);
        expect(index.manifestPreviewTokens.has('AirIQ')).toBe(true);
        expect(index.manifestStableTokens.has('AirIQ')).toBe(false);
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — existing VentIQ LED preview is preserved', () => {
    test('the VentIQ LED preview build still resolves and stays preview-only', () => {
        const led = buildByConfig.get(VENTIQ_LED_PREVIEW);
        expect(led).toBeDefined();
        expect(led.channel).toBe('preview');
        // It is distinct from the first-batch RoomIQ+LED preview.
        expect(VENTIQ_LED_PREVIEW).not.toBe('Ceiling-POE-RoomIQ-LED');
        expect(buildByConfig.get('Ceiling-POE-RoomIQ-LED')).toBeDefined();
    });

    test('the VentIQ LED preview source entry is unchanged (v1.0.0-led-preview, pinned sha)', () => {
        const entry = (sources.sources || []).find(
            s => s.config_string === VENTIQ_LED_PREVIEW
        );
        expect(entry).toBeTruthy();
        expect(entry.release_tag).toBe('v1.0.0-led-preview');
        expect(entry.expected_sha256).toBe(
            '93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3'
        );
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — Rescue / recovery path is preserved', () => {
    test('the Rescue build is present on the rescue channel', () => {
        const rescue = buildByConfig.get(RESCUE);
        expect(rescue).toBeDefined();
        expect(normaliseReleaseChannel(rescue.channel)).toBe('rescue');
    });

    test('Rescue is hidden in normal mode and revealed only in recovery mode', () => {
        const rescue = buildByConfig.get(RESCUE);
        expect(filterBuildsForMode([rescue], 'normal')).toEqual([]);
        expect(filterBuildsForMode([rescue], 'recovery')).toEqual([rescue]);
    });
});

describe('WF-LIVE-SMOKE-PREVIEW-IMPORT-001 — checklist docs exist and stay in sync', () => {
    test('the live smoke checklist doc exists with the manual verification template', () => {
        expect(fs.existsSync(smokeDocPath)).toBe(true);
        const doc = fs.readFileSync(smokeDocPath, 'utf8');
        expect(doc).toMatch(/WF-LIVE-SMOKE-PREVIEW-IMPORT-001/);
        // The doc must carry the manual verification template fields.
        expect(doc.toLowerCase()).toContain('browser');
        expect(doc.toLowerCase()).toContain('generated_at');
        expect(doc.toLowerCase()).toContain('pass');
        // It must name every expected build so the checklist stays honest.
        EXPECTED_BUILDS.forEach(cfg => {
            expect(doc).toContain(cfg);
        });
    });

    test('the canonical status doc references the live smoke record', () => {
        const status = fs.readFileSync(statusDocPath, 'utf8');
        expect(status).toMatch(/WF-LIVE-SMOKE-PREVIEW-IMPORT-001/);
    });
});
