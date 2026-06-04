/**
 * WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — live Simple-install bundle-picker
 * verification.
 *
 * This is the automated backbone of the live / manual smoke checklist at
 * docs/live-smoke-easy-bundle-picker-current.md. It verifies the CURRENT
 * deployed Simple-install end-state after the bundle picker
 * (WF-EASY-BUNDLE-PICKER-001) and the import-gated fan-control expansion
 * (WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001) landed — and after the standalone
 * FanRelay / FanPWM / FanDAC previews were imported. It imports NO firmware and
 * changes NO surface: it reads the live manifest.json and the presentation-only
 * data helpers and pins what the deployed picker should show today.
 *
 * The two sibling tests already lock the picker contract
 * (`wf-easy-bundle-picker.test.js`) and the fan-expansion gate
 * (`wf-easy-bundle-picker-fan-expansion.test.js`) against synthetic fixtures.
 * This file is the *live-state* guard: it pins the six base cards against the
 * actual manifest end-state, proves the five fan-control cards stay
 * declared-but-hidden because no matching full-composition firmware is imported,
 * and — the genuinely new risk after the standalone fan-driver previews shipped —
 * proves the standalone `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` builds that
 * ARE now in the manifest never leak into the Simple-install surface.
 *
 * These pins back every deterministic row of the checklist:
 *   - the live manifest carries exactly nine builds,
 *   - all six base bundles resolve to a live build (Bathroom stable default +
 *     recommended; the Bathroom Relay card is import-ready and therefore visible),
 *   - none of the five fan-control expansion configs is in the manifest, so
 *     `getExposableFanControlBundles` is empty (declared-but-hidden),
 *   - a fan-control card becomes exposable ONLY when its exact full-composition
 *     config lands in the manifest (synthetic), never from a standalone fan-only
 *     config or a TRIAC config,
 *   - the standalone FanPWM / FanDAC builds present in the manifest never become
 *     a Simple-install bundle,
 *   - TRIAC never appears anywhere in the Simple-install surface,
 *   - the stable Bathroom PoE build is the only default-selectable build and
 *     carries no channel acknowledgement / freshness false-blocker,
 *   - preview bundles all gate on the channel:preview acknowledgement and every
 *     base build has a working release-notes affordance,
 *   - the checklist doc + canonical status doc stay in sync.
 *
 * Docs / test only — it reads files and pure helpers; it changes no surface.
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
    SIMPLE_BUNDLES,
    FAN_CONTROL_BUNDLES,
    getDefaultSimpleBundle,
    getExposableFanControlBundles,
    isFanControlBundleImportReady
} from '../scripts/data/simple-bundles.js';
import {
    pickDefaultBuild,
    getChannelPolicy,
    getRequiredAcknowledgements,
    normaliseReleaseChannel
} from '../scripts/utils/release-channels.js';

const REPO_ROOT = process.cwd();

function readText(relativePath) {
    return fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf8');
}
function readJson(relativePath) {
    return JSON.parse(readText(relativePath));
}

const manifest = readJson('manifest.json');
const builds = Array.isArray(manifest.builds) ? manifest.builds : [];
const liveConfigs = builds
    .map(b => (b && typeof b.config_string === 'string' ? b.config_string : null))
    .filter(Boolean);
const liveConfigSet = new Set(liveConfigs);
const buildByConfig = new Map(builds.map(b => [b.config_string, b]));

const STABLE_BATHROOM_POE = 'Ceiling-POE-VentIQ-RoomIQ';

// The six base bundle cards the deployed picker shows today, in order.
const BASE_BUNDLE_IDS = [
    'S360-KIT-BATH-P',
    'S360-KIT-KITCHEN-P',
    'S360-KIT-BEDROOM-P',
    'S360-KIT-LIVING-P',
    'S360-KIT-CORRIDOR-P',
    'S360-KIT-BATH-P-REL'
];
const BASE_CONFIG_BY_ID = {
    'S360-KIT-BATH-P': 'Ceiling-POE-VentIQ-RoomIQ',
    'S360-KIT-KITCHEN-P': 'Ceiling-POE-AirIQ-RoomIQ',
    'S360-KIT-BEDROOM-P': 'Ceiling-POE-RoomIQ',
    'S360-KIT-LIVING-P': 'Ceiling-POE-RoomIQ-LED',
    'S360-KIT-CORRIDOR-P': 'Ceiling-POE-RoomIQ-LED',
    'S360-KIT-BATH-P-REL': 'Ceiling-POE-VentIQ-FanRelay-RoomIQ'
};

// The five import-gated fan-control expansion cards — declared but hidden until
// their exact full-composition firmware is imported.
const FAN_EXPANSION_IDS = [
    'S360-KIT-BATH-P-PWM',
    'S360-KIT-BATH-P-DAC',
    'S360-KIT-KITCHEN-P-REL',
    'S360-KIT-KITCHEN-P-PWM',
    'S360-KIT-KITCHEN-P-DAC'
];
const FAN_EXPANSION_CONFIG_BY_ID = {
    'S360-KIT-BATH-P-PWM': 'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
    'S360-KIT-BATH-P-DAC': 'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
    'S360-KIT-KITCHEN-P-REL': 'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
    'S360-KIT-KITCHEN-P-PWM': 'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
    'S360-KIT-KITCHEN-P-DAC': 'Ceiling-POE-AirIQ-FanDAC-RoomIQ'
};

// Standalone fan-driver previews that ARE in the live manifest today but must
// NEVER surface as a Simple-install bundle (Advanced-install-only).
const STANDALONE_FAN_CONFIGS = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC'];
// TRIAC must never appear in the Simple-install surface at all.
const TRIAC_CONFIG = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';

/* ===========================================================================
   Part A — live manifest end-state
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — live manifest end-state', () => {
    test('manifest.json carries exactly nine builds', () => {
        expect(builds.length).toBe(9);
    });

    test('every base bundle config is present in the live manifest with the matching channel', () => {
        SIMPLE_BUNDLES.forEach(bundle => {
            expect(bundle.firmwareConfigString).toBe(BASE_CONFIG_BY_ID[bundle.id]);
            const build = buildByConfig.get(bundle.firmwareConfigString);
            expect(build).toBeDefined();
            expect(build.channel).toBe(bundle.channel);
        });
    });

    test('the Bathroom Relay base bundle is import-ready: its config IS in the live manifest (visible today)', () => {
        // S360-KIT-BATH-P-REL is one of the six ALWAYS-present base cards; its
        // FanRelay preview build was imported (WEBFLASH-RELAY-001), so the card
        // is backed by a real build and is shown today.
        expect(liveConfigSet.has('Ceiling-POE-VentIQ-FanRelay-RoomIQ')).toBe(true);
    });

    test('none of the five fan-control EXPANSION configs is in the live manifest (cards stay hidden)', () => {
        FAN_EXPANSION_IDS.forEach(id => {
            expect(liveConfigSet.has(FAN_EXPANSION_CONFIG_BY_ID[id])).toBe(false);
        });
    });
});

/* ===========================================================================
   Part B — base bundle exposure (the deployed picker today)
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — base bundle exposure', () => {
    test('exactly the six base bundle cards are declared, Bathroom first', () => {
        expect(SIMPLE_BUNDLES.map(b => b.id)).toEqual(BASE_BUNDLE_IDS);
    });

    test('Bathroom Bundle — PoE is the stable default + recommended choice', () => {
        const def = getDefaultSimpleBundle();
        expect(def.id).toBe('S360-KIT-BATH-P');
        expect(def.channel).toBe('stable');
        expect(def.isDefault).toBe(true);
        expect(def.recommended).toBe(true);
        expect(def.buyable).toBe(true);
        expect(def.firmwareConfigString).toBe(STABLE_BATHROOM_POE);
        expect(def.requiresPreviewAcknowledgement).toBe(false);
        expect(def.requiresFanControlAcknowledgement).toBe(false);
    });

    test('the Kitchen / Bedroom / Living / Corridor base previews appear and require the preview acknowledgement only', () => {
        const roomPreviews = ['S360-KIT-KITCHEN-P', 'S360-KIT-BEDROOM-P', 'S360-KIT-LIVING-P', 'S360-KIT-CORRIDOR-P'];
        roomPreviews.forEach(id => {
            const bundle = SIMPLE_BUNDLES.find(b => b.id === id);
            expect(bundle).toBeTruthy();
            expect(bundle.channel).toBe('preview');
            expect(bundle.isDefault).toBe(false);
            expect(bundle.recommended).toBe(false);
            expect(bundle.buyable).toBe(false);
            expect(bundle.requiresPreviewAcknowledgement).toBe(true);
            // Room previews are NOT fan bundles — no extra fan-control gate.
            expect(bundle.requiresFanControlAcknowledgement).toBe(false);
        });
    });

    test('only the Bathroom Relay base bundle carries the extra fan-control acknowledgement', () => {
        const fanGated = SIMPLE_BUNDLES.filter(b => b.requiresFanControlAcknowledgement);
        expect(fanGated.map(b => b.id)).toEqual(['S360-KIT-BATH-P-REL']);
        // Still preview + fan-control, never fan-control alone.
        expect(fanGated[0].requiresPreviewAcknowledgement).toBe(true);
        expect(fanGated[0].channel).toBe('preview');
    });
});

/* ===========================================================================
   Part C — fan-control expansion is declared-but-hidden today
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — fan-control expansion declared-but-hidden', () => {
    test('the five fan-control expansion bundles are declared, in order', () => {
        expect(FAN_CONTROL_BUNDLES.map(b => b.id)).toEqual(FAN_EXPANSION_IDS);
    });

    test('against the LIVE manifest no fan-control expansion card is exposable', () => {
        expect(getExposableFanControlBundles(liveConfigs)).toEqual([]);
        // ...because none of their exact configs is present.
        FAN_CONTROL_BUNDLES.forEach(bundle => {
            expect(isFanControlBundleImportReady(bundle, liveConfigs)).toBe(false);
        });
    });

    test('a fan-control card becomes exposable ONLY once its exact full-composition config is imported (synthetic)', () => {
        FAN_EXPANSION_IDS.forEach(id => {
            const cfg = FAN_EXPANSION_CONFIG_BY_ID[id];
            // Add only this one config to the live set → only this one card lights up.
            const synthetic = [...liveConfigs, cfg];
            const exposable = getExposableFanControlBundles(synthetic).map(b => b.id);
            expect(exposable).toEqual([id]);
        });
    });

    test('the gate never exposes a card from a standalone fan-only config or a TRIAC config', () => {
        // Even though Ceiling-POE-FanPWM / Ceiling-POE-FanDAC are in the live
        // manifest, they are not a full-composition room bundle config, so they
        // expose nothing. A TRIAC config never exposes anything either.
        const withStandalones = [...liveConfigs, ...STANDALONE_FAN_CONFIGS, TRIAC_CONFIG];
        expect(getExposableFanControlBundles(withStandalones)).toEqual([]);
    });
});

/* ===========================================================================
   Part D — standalone fan-driver previews + TRIAC never become Simple cards
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — standalone fan-driver + TRIAC stay out of Simple install', () => {
    test('the standalone FanPWM / FanDAC previews ARE in the live manifest (honest about current state)', () => {
        STANDALONE_FAN_CONFIGS.forEach(cfg => {
            expect(liveConfigSet.has(cfg)).toBe(true);
            expect(buildByConfig.get(cfg).channel).toBe('preview');
        });
    });

    test('no standalone fan-only config is the firmware target of ANY Simple bundle (base or fan-control)', () => {
        const allBundleConfigs = [
            ...SIMPLE_BUNDLES.map(b => b.firmwareConfigString),
            ...FAN_CONTROL_BUNDLES.map(b => b.firmwareConfigString)
        ];
        STANDALONE_FAN_CONFIGS.forEach(cfg => {
            expect(allBundleConfigs).not.toContain(cfg);
        });
    });

    test('no bundle (base or fan-control) resolves to a TRIAC config or carries a TRIAC token', () => {
        const allBundleConfigs = [
            ...SIMPLE_BUNDLES.map(b => b.firmwareConfigString),
            ...FAN_CONTROL_BUNDLES.map(b => b.firmwareConfigString)
        ];
        expect(allBundleConfigs).not.toContain(TRIAC_CONFIG);
        allBundleConfigs.forEach(cfg => {
            expect(cfg).not.toContain('FanTRIAC');
            expect(cfg).not.toContain('TRIAC');
        });
        // And TRIAC is not even in the manifest.
        expect(liveConfigSet.has(TRIAC_CONFIG)).toBe(false);
    });
});

/* ===========================================================================
   Part E — stable default + freshness / gating posture
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — stable default, no false blocker, gates authoritative', () => {
    test('the stable Bathroom PoE build is the only default-selectable manifest build', () => {
        const picked = pickDefaultBuild(builds, { mode: 'normal' });
        expect(picked).not.toBeNull();
        expect(picked.config_string).toBe(STABLE_BATHROOM_POE);
        expect(normaliseReleaseChannel(picked.channel)).toBe('stable');

        const defaultEligible = builds.filter(
            b => getChannelPolicy(b.channel).defaultSelectable && b.deprecated !== true
        );
        expect(defaultEligible.map(b => b.config_string)).toEqual([STABLE_BATHROOM_POE]);
    });

    test('the stable Bathroom build carries no channel acknowledgement and is not deprecated (no false freshness block)', () => {
        const stable = buildByConfig.get(STABLE_BATHROOM_POE);
        expect(stable).toBeDefined();
        expect(getChannelPolicy(stable.channel).requiresAcknowledgement).toBe(false);
        expect(getRequiredAcknowledgements(stable)).toEqual([]);
        expect(stable.deprecated).not.toBe(true);
    });

    test('every preview base bundle build still requires the channel:preview acknowledgement (install gating)', () => {
        SIMPLE_BUNDLES.filter(b => b.channel === 'preview').forEach(bundle => {
            const build = buildByConfig.get(bundle.firmwareConfigString);
            expect(build).toBeDefined();
            const policy = getChannelPolicy(build.channel);
            expect(policy.requiresAcknowledgement).toBe(true);
            const acks = getRequiredAcknowledgements(build).map(a => a.key);
            expect(acks).toContain('channel:preview');
        });
    });

    test('every base bundle build has a working release-notes affordance (no dead link)', () => {
        SIMPLE_BUNDLES.forEach(bundle => {
            const build = buildByConfig.get(bundle.firmwareConfigString);
            const hasUrl = typeof build.release_url === 'string' && build.release_url.trim() !== '';
            const changelog = Array.isArray(build.changelog)
                ? build.changelog.filter(e => typeof e === 'string' && e.trim() !== '')
                : [];
            expect(hasUrl || changelog.length > 0).toBe(true);
            if (typeof build.release_url === 'string') {
                expect(build.release_url.trim()).not.toBe('#');
            }
        });
    });
});

/* ===========================================================================
   Part F — no-change invariants
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — install / firmware / policy surfaces unchanged', () => {
    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = readText('.github/workflows/firmware-publish.yml');
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('manifest stays at 9 builds; scripts/data/kits.json stays Release-One-only', () => {
        expect(builds.length).toBe(9);
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('firmware/sources.json declares no fan-control expansion source', () => {
        const sources = readJson('firmware/sources.json');
        const list = Array.isArray(sources) ? sources : (sources.sources || []);
        const configs = list.map(s => s.config_string);
        FAN_EXPANSION_IDS.forEach(id => {
            expect(configs).not.toContain(FAN_EXPANSION_CONFIG_BY_ID[id]);
        });
    });
});

/* ===========================================================================
   Part G — checklist docs exist and stay in sync
   =========================================================================== */
describe('WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001 — checklist docs in sync', () => {
    const smokeDocPath = path.resolve(REPO_ROOT, 'docs', 'live-smoke-easy-bundle-picker-current.md');

    test('the current live-smoke checklist doc exists with the manual verification template', () => {
        expect(fs.existsSync(smokeDocPath)).toBe(true);
        const doc = fs.readFileSync(smokeDocPath, 'utf8');
        expect(doc).toMatch(/WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001/);
        // Manual verification template fields.
        const lower = doc.toLowerCase();
        expect(lower).toContain('browser');
        expect(lower).toContain('generated_at');
        expect(lower).toContain('pass');
        // It names every base bundle config so the checklist stays honest.
        Object.values(BASE_CONFIG_BY_ID).forEach(cfg => expect(doc).toContain(cfg));
        // It names every hidden fan-control expansion config.
        Object.values(FAN_EXPANSION_CONFIG_BY_ID).forEach(cfg => expect(doc).toContain(cfg));
        // It documents the standalone fan-driver + TRIAC exclusions.
        STANDALONE_FAN_CONFIGS.forEach(cfg => expect(doc).toContain(cfg));
        expect(doc).toContain('TRIAC');
    });

    test('the canonical status doc references this live smoke record', () => {
        const status = readText('docs/sense360-webflash-status.md');
        expect(status).toMatch(/WF-EASY-BUNDLE-PICKER-LIVE-SMOKE-001/);
    });
});
