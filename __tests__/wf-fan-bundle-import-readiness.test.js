/**
 * WF-FAN-BUNDLE-IMPORT-READINESS-001 — prepare import-readiness checks for the
 * five upcoming full-composition fan-control room-bundle artifacts.
 *
 * WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 (#474) already declared + import-gated
 * the five fan-control room bundles. Upstream `ROOM-BUNDLE-FAN-CONFIGS-001` /
 * #713 added the product YAMLs, #716 recorded compile proof, #717 planned
 * publication — but no `.bin`, no release asset, and no WebFlash import exists
 * yet. This slice imports NO firmware. It adds the *expected import shape*
 * (`scripts/data/fan-bundle-import-readiness.js`) so the future firmware-import
 * PR is small and mechanical, and locks it with the pins below.
 *
 * The pins assert:
 *   - one readiness expectation per fan bundle, each carrying the expected
 *     config_string, artifact filename, sidecar, channel (preview), block_tokens,
 *     full-room flag, Simple-picker gate, and required acknowledgements,
 *   - the expected artifact filename is canonical (naming-policy conformant) and
 *     derives from config_string + version + channel,
 *   - the ready-to-fill firmware/sources.json skeleton matches a real preview
 *     source entry's shape EXCEPT the human-pinned expected_sha256 (never faked),
 *   - the FanDAC expectations require the address-switch acknowledgement naming
 *     0x58 / 0x5A / forbidden 0x59,
 *   - against the live manifest/sources every card stays HIDDEN (nothing imported),
 *   - a synthetic manifest/source entry makes exactly the matching card exposable,
 *   - standalone fan-only configs + TRIAC never light a card up,
 *   - no expectation is stable/default/recommended/buyable, and the live
 *     REQUIRED_CONFIGS / manifest / sources / kits / on-disk surfaces are unchanged.
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
    FAN_BUNDLE_IMPORT_EXPECTATIONS,
    EXPECTED_FAN_BUNDLE_CHANNEL,
    EXPECTED_FAN_BUNDLE_VERSION,
    EXPECTED_FAN_BUNDLE_BLOCK_TOKENS,
    STANDALONE_FAN_ONLY_CONFIGS,
    deriveExpectedArtifactName,
    deriveExpectedSidecarName,
    buildFanBundleImportExpectation,
    getFanBundleImportExpectation,
    buildExpectedSourceEntry,
    validateFanBundleImportExpectation,
    getFanBundleImportReadinessReport
} from '../scripts/data/fan-bundle-import-readiness.js';
import {
    FAN_CONTROL_BUNDLES,
    SIMPLE_BUNDLES,
    getExposableFanControlBundles,
    isFanControlBundleImportReady
} from '../scripts/data/simple-bundles.js';
import { CANONICAL_PATTERN } from '../scripts/validate-naming-policy.js';

const REPO_ROOT = process.cwd();

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf-8'));
}

// The five future fan-control room bundles, in order, and their exact configs.
const FAN_BUNDLE_IDS = [
    'S360-KIT-BATH-P-PWM',
    'S360-KIT-BATH-P-DAC',
    'S360-KIT-KITCHEN-P-REL',
    'S360-KIT-KITCHEN-P-PWM',
    'S360-KIT-KITCHEN-P-DAC'
];
const FAN_CONFIG_BY_ID = {
    'S360-KIT-BATH-P-PWM': 'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
    'S360-KIT-BATH-P-DAC': 'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
    'S360-KIT-KITCHEN-P-REL': 'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
    'S360-KIT-KITCHEN-P-PWM': 'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
    'S360-KIT-KITCHEN-P-DAC': 'Ceiling-POE-AirIQ-FanDAC-RoomIQ'
};
const DAC_BUNDLE_IDS = ['S360-KIT-BATH-P-DAC', 'S360-KIT-KITCHEN-P-DAC'];
const TRIAC_CONFIG = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';

const manifest = readJson('manifest.json');
const liveConfigs = (manifest.builds || []).map(b => b.config_string);
const sourcesDoc = readJson('firmware/sources.json');
const liveSourceConfigs = (sourcesDoc.sources || []).map(s => s.config_string);

/* ===========================================================================
   Part A — readiness expectation data integrity
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — expectation data', () => {
    test('declares exactly one expectation per fan-control bundle, in order', () => {
        expect(FAN_BUNDLE_IMPORT_EXPECTATIONS.map(e => e.id)).toEqual(FAN_BUNDLE_IDS);
        // Derived 1:1 from the bundle definitions — no drift.
        expect(FAN_BUNDLE_IMPORT_EXPECTATIONS.map(e => e.id)).toEqual(
            FAN_CONTROL_BUNDLES.map(b => b.id)
        );
    });

    test('each expectation carries the exact expected config_string, channel preview, and version', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.configString).toBe(FAN_CONFIG_BY_ID[e.id]);
            expect(e.expectedChannel).toBe(EXPECTED_FAN_BUNDLE_CHANNEL);
            expect(EXPECTED_FAN_BUNDLE_CHANNEL).toBe('preview');
            expect(e.expectedVersion).toBe(EXPECTED_FAN_BUNDLE_VERSION);
        });
    });

    test('every expectation passes validateFanBundleImportExpectation', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            const result = validateFanBundleImportExpectation(e);
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
        });
    });

    test('buildFanBundleImportExpectation matches the frozen list for each bundle', () => {
        FAN_CONTROL_BUNDLES.forEach((bundle, i) => {
            const built = buildFanBundleImportExpectation(bundle);
            expect(built.id).toBe(FAN_BUNDLE_IMPORT_EXPECTATIONS[i].id);
            expect(built.expectedArtifactName).toBe(FAN_BUNDLE_IMPORT_EXPECTATIONS[i].expectedArtifactName);
        });
    });

    test('getFanBundleImportExpectation resolves by id and by config_string', () => {
        FAN_BUNDLE_IDS.forEach(id => {
            expect(getFanBundleImportExpectation(id).id).toBe(id);
            expect(getFanBundleImportExpectation(FAN_CONFIG_BY_ID[id]).id).toBe(id);
        });
        expect(getFanBundleImportExpectation('nope')).toBeNull();
        expect(getFanBundleImportExpectation('')).toBeNull();
    });

    test('no expectation is stable/default/recommended/buyable (preview-only)', () => {
        // The expectation is preview-only; the underlying bundle carries no
        // stable/default/recommended/buyable flag.
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.expectedChannel).toBe('preview');
            const bundle = FAN_CONTROL_BUNDLES.find(b => b.id === e.id);
            expect(bundle.channel).toBe('preview');
            expect(bundle.isDefault).toBe(false);
            expect(bundle.recommended).toBe(false);
            expect(bundle.buyable).toBe(false);
        });
    });
});

/* ===========================================================================
   Part B — expected artifact filename (the mechanical-import anchor)
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — expected artifact filename', () => {
    test('each expected artifact name is canonical and derives from config + version + channel', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.expectedArtifactName).toBe(
                `Sense360-${e.configString}-v${e.expectedVersion}-${e.expectedChannel}.bin`
            );
            expect(CANONICAL_PATTERN.test(e.expectedArtifactName)).toBe(true);
        });
    });

    test('deriveExpectedArtifactName / deriveExpectedSidecarName round-trip', () => {
        const cfg = 'Ceiling-POE-VentIQ-FanPWM-RoomIQ';
        const artifact = deriveExpectedArtifactName(cfg);
        expect(artifact).toBe('Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin');
        expect(deriveExpectedSidecarName(artifact)).toBe(
            'Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.meta.json'
        );
        // The canonical pattern accepts the sidecar name too.
        expect(CANONICAL_PATTERN.test(deriveExpectedSidecarName(artifact))).toBe(true);
        expect(deriveExpectedArtifactName('')).toBeNull();
        expect(deriveExpectedSidecarName('not-a-bin')).toBeNull();
    });

    test('the expected sidecar name matches the artifact name on each expectation', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.expectedSidecarName).toBe(deriveExpectedSidecarName(e.expectedArtifactName));
        });
    });

    test('no expected artifact name collides with an already-imported on-disk binary', () => {
        const onDisk = new Set(fs.readdirSync(path.resolve(REPO_ROOT, 'firmware/configurations')));
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(onDisk.has(e.expectedArtifactName)).toBe(false);
        });
    });
});

/* ===========================================================================
   Part C — the ready-to-fill firmware/sources.json skeleton
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — expected source-entry skeleton', () => {
    test('the skeleton carries the full preview source shape, channel preview, FanTRIAC+LED block tokens', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            const entry = buildExpectedSourceEntry(e);
            expect(entry.source_repo).toBe('sense360store/esphome-public');
            expect(entry.release_tag).toBe('v1.0.0-preview');
            expect(entry.channel).toBe('preview');
            expect(entry.version).toBe('1.0.0');
            expect(entry.config_string).toBe(e.configString);
            expect(entry.asset_name).toBe(e.expectedArtifactName);
            expect(entry.min_size_bytes).toBeGreaterThan(0);
            expect(entry.required_assets[0]).toBe(e.expectedArtifactName);
            expect(entry.required_assets).toEqual(
                expect.arrayContaining(['checksums-sha256.txt', 'checksums-md5.txt', 'manifest.json'])
            );
            expect(entry.required_release_body_sections).toEqual([
                'Changelog', 'Known Issues', 'Features', 'Hardware Requirements'
            ]);
            expect(entry.block_tokens).toEqual([...EXPECTED_FAN_BUNDLE_BLOCK_TOKENS]);
            expect(entry.block_tokens).toEqual(['FanTRIAC', 'LED']);
        });
    });

    test('the skeleton deliberately omits expected_sha256 — the import PR supplies the real pin', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            const entry = buildExpectedSourceEntry(e);
            expect(Object.prototype.hasOwnProperty.call(entry, 'expected_sha256')).toBe(false);
            expect(e.requiresPinnedSha256).toBe(true);
        });
    });

    test('the skeleton key-set is a subset of a real imported preview source entry (mechanical import)', () => {
        // Use the standalone FanRelay preview source as the reference shape.
        const reference = (sourcesDoc.sources || []).find(
            s => s.config_string === 'Ceiling-POE-VentIQ-FanRelay-RoomIQ'
        );
        expect(reference).toBeTruthy();
        const referenceKeys = new Set(Object.keys(reference));
        const skeleton = buildExpectedSourceEntry(FAN_BUNDLE_IMPORT_EXPECTATIONS[0]);
        Object.keys(skeleton).forEach(key => {
            expect(referenceKeys.has(key)).toBe(true);
        });
        // The only mandatory field the skeleton lacks is the human-pinned SHA.
        expect(referenceKeys.has('expected_sha256')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(skeleton, 'expected_sha256')).toBe(false);
    });
});

/* ===========================================================================
   Part D — required acknowledgements
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — required acknowledgements', () => {
    test('every expectation requires BOTH the preview and the fan-control acknowledgement', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.requiresPreviewAcknowledgement).toBe(true);
            expect(e.requiresFanControlAcknowledgement).toBe(true);
        });
    });

    test('exactly the two analog (FanDAC) expectations require the address-switch acknowledgement', () => {
        const dacGated = FAN_BUNDLE_IMPORT_EXPECTATIONS.filter(e => e.requiresDacAddressAcknowledgement);
        expect(dacGated.map(e => e.id)).toEqual(DAC_BUNDLE_IDS);
        dacGated.forEach(e => {
            expect(e.fanDriver).toBe('dac');
        });
    });

    test('the FanDAC address-switch acknowledgement copy names 0x58 / 0x5A and the forbidden 0x59', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.filter(e => e.requiresDacAddressAcknowledgement).forEach(e => {
            expect(e.dacAddressAcknowledgement).toContain('0x58');
            expect(e.dacAddressAcknowledgement).toContain('0x5A');
            expect(e.dacAddressAcknowledgement).toContain('0x59');
        });
        // Non-analog expectations carry no address-switch acknowledgement copy.
        FAN_BUNDLE_IMPORT_EXPECTATIONS.filter(e => e.fanDriver !== 'dac').forEach(e => {
            expect(e.requiresDacAddressAcknowledgement).toBe(false);
            expect(e.dacAddressAcknowledgement).toBe('');
        });
    });

    test('the readiness report lists the outstanding acknowledgements per bundle', () => {
        const report = getFanBundleImportReadinessReport({ manifestConfigStrings: liveConfigs });
        report.entries.forEach(entry => {
            expect(entry.outstandingAcknowledgements).toContain('channel:preview');
            expect(entry.outstandingAcknowledgements).toContain('fan-control');
            if (DAC_BUNDLE_IDS.includes(entry.id)) {
                expect(entry.outstandingAcknowledgements).toContain('analog-fan-address-switch');
            } else {
                expect(entry.outstandingAcknowledgements).not.toContain('analog-fan-address-switch');
            }
        });
    });
});

/* ===========================================================================
   Part E — full room-bundle flag + no TRIAC + no standalone fan-only
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — full room bundle, no TRIAC, no fan-only', () => {
    test('every expectation is a FULL room bundle (room sensors + fan driver)', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.fullRoomBundle).toBe(true);
            expect(/RoomIQ/.test(e.configString)).toBe(true);
            expect(/VentIQ|AirIQ/.test(e.configString)).toBe(true);
        });
    });

    test('no expectation resolves to a standalone fan-only config', () => {
        const configs = FAN_BUNDLE_IMPORT_EXPECTATIONS.map(e => e.configString);
        STANDALONE_FAN_ONLY_CONFIGS.forEach(cfg => expect(configs).not.toContain(cfg));
    });

    test('no expectation config or artifact carries a TRIAC token', () => {
        FAN_BUNDLE_IMPORT_EXPECTATIONS.forEach(e => {
            expect(e.configString).not.toContain('FanTRIAC');
            expect(e.configString).not.toContain('TRIAC');
            expect(e.expectedArtifactName).not.toContain('FanTRIAC');
            expect(e.expectedArtifactName).not.toContain('TRIAC');
        });
    });

    test('a synthetic TRIAC expectation is rejected by the validator', () => {
        const triac = buildFanBundleImportExpectation({
            id: 'BAD-TRIAC',
            firmwareConfigString: TRIAC_CONFIG,
            channel: 'preview',
            fanDriver: 'triac',
            requiresPreviewAcknowledgement: true,
            requiresFanControlAcknowledgement: true,
            wizardState: { mount: 'ceiling', power: 'poe', roomiq: 'roomiq', ventiq: 'ventiq', airiq: 'none', fan: 'triac' }
        });
        const result = validateFanBundleImportExpectation(triac);
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/TRIAC/);
    });

    test('a synthetic fan-only expectation is rejected by the validator', () => {
        const fanOnly = buildFanBundleImportExpectation({
            id: 'BAD-FAN-ONLY',
            firmwareConfigString: 'Ceiling-POE-FanPWM',
            channel: 'preview',
            fanDriver: 'pwm',
            requiresPreviewAcknowledgement: true,
            requiresFanControlAcknowledgement: true,
            wizardState: { mount: 'ceiling', power: 'poe', roomiq: 'none', ventiq: 'none', airiq: 'none', fan: 'pwm' }
        });
        const result = validateFanBundleImportExpectation(fanOnly);
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/full room bundle|fan-only|RoomIQ/);
    });
});

/* ===========================================================================
   Part F — the import-readiness gate (synthetic manifest / source entries)
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — manifest-gated exposure', () => {
    test('against the LIVE manifest no fan-control card is exposable (nothing imported)', () => {
        const report = getFanBundleImportReadinessReport({
            manifestConfigStrings: liveConfigs,
            sourceConfigStrings: liveSourceConfigs
        });
        expect(report.allHiddenToday).toBe(true);
        expect(report.exposableIds).toEqual([]);
        report.entries.forEach(entry => {
            expect(entry.declared).toBe(true);
            expect(entry.inManifest).toBe(false);
            expect(entry.inSources).toBe(false);
            expect(entry.exposable).toBe(false);
        });
        // Cross-check the raw gate too.
        expect(getExposableFanControlBundles(liveConfigs)).toEqual([]);
    });

    test('a synthetic manifest entry makes exactly the matching card exposable', () => {
        FAN_BUNDLE_IDS.forEach(id => {
            const cfg = FAN_CONFIG_BY_ID[id];
            const synthetic = [...liveConfigs, cfg];
            const report = getFanBundleImportReadinessReport({ manifestConfigStrings: synthetic });
            expect(report.exposableIds).toEqual([id]);
            expect(report.allHiddenToday).toBe(false);
            const row = report.entries.find(e => e.id === id);
            expect(row.inManifest).toBe(true);
            expect(row.exposable).toBe(true);
            // Every other row stays hidden.
            report.entries.filter(e => e.id !== id).forEach(other => {
                expect(other.exposable).toBe(false);
            });
        });
    });

    test('a synthetic source entry alone (no manifest build) does NOT expose a card', () => {
        // sources.json presence is informational; exposure is manifest-gated, so a
        // declared source without a regenerated manifest build keeps the card hidden.
        FAN_BUNDLE_IDS.forEach(id => {
            const cfg = FAN_CONFIG_BY_ID[id];
            const report = getFanBundleImportReadinessReport({
                manifestConfigStrings: liveConfigs,
                sourceConfigStrings: [...liveSourceConfigs, cfg]
            });
            const row = report.entries.find(e => e.id === id);
            expect(row.inSources).toBe(true);
            expect(row.inManifest).toBe(false);
            expect(row.exposable).toBe(false);
        });
        expect(getFanBundleImportReadinessReport({
            manifestConfigStrings: liveConfigs,
            sourceConfigStrings: [...liveSourceConfigs, ...Object.values(FAN_CONFIG_BY_ID)]
        }).exposableIds).toEqual([]);
    });

    test('standalone fan-only configs and a TRIAC config never expose any card', () => {
        const withStandalonesAndTriac = [
            ...liveConfigs,
            ...STANDALONE_FAN_ONLY_CONFIGS,
            TRIAC_CONFIG
        ];
        const report = getFanBundleImportReadinessReport({ manifestConfigStrings: withStandalonesAndTriac });
        expect(report.exposableIds).toEqual([]);
        expect(report.allHiddenToday).toBe(true);
        expect(getExposableFanControlBundles(withStandalonesAndTriac)).toEqual([]);
    });

    test('the readiness report agrees with isFanControlBundleImportReady on the underlying bundles', () => {
        const synthetic = [...liveConfigs, 'Ceiling-POE-AirIQ-FanDAC-RoomIQ'];
        const report = getFanBundleImportReadinessReport({ manifestConfigStrings: synthetic });
        report.entries.forEach(entry => {
            const bundle = FAN_CONTROL_BUNDLES.find(b => b.id === entry.id);
            expect(entry.exposable).toBe(isFanControlBundleImportReady(bundle, synthetic));
        });
    });
});

/* ===========================================================================
   Part G — no-change invariants (live surfaces unchanged)
   =========================================================================== */
describe('WF-FAN-BUNDLE-IMPORT-READINESS-001 — live surfaces unchanged (no firmware imported)', () => {
    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = fs.readFileSync(
            path.resolve(REPO_ROOT, '.github/workflows/firmware-publish.yml'), 'utf-8'
        );
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('manifest stays at 9 builds with none of the five fan-control configs', () => {
        expect(manifest.builds.length).toBe(9);
        Object.values(FAN_CONFIG_BY_ID).forEach(cfg => expect(liveConfigs).not.toContain(cfg));
    });

    test('firmware/sources.json declares no fan-control room-bundle source', () => {
        Object.values(FAN_CONFIG_BY_ID).forEach(cfg => expect(liveSourceConfigs).not.toContain(cfg));
    });

    test('no .bin / .meta.json exists on disk for any of the five fan-control configs', () => {
        const files = fs.readdirSync(path.resolve(REPO_ROOT, 'firmware/configurations'));
        ['FanPWM-RoomIQ', 'FanDAC-RoomIQ', 'AirIQ-FanRelay', 'AirIQ-FanPWM', 'AirIQ-FanDAC'].forEach(token => {
            expect(files.some(f => f.includes(token))).toBe(false);
        });
    });

    test('kits.json stays Release-One-only; the six-card Simple picker is unchanged', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
        expect(SIMPLE_BUNDLES).toHaveLength(6);
        expect(SIMPLE_BUNDLES[0].id).toBe('S360-KIT-BATH-P');
        expect(SIMPLE_BUNDLES[0].channel).toBe('stable');
    });

    test('this readiness module is NOT a wizard runtime dependency (not registered in sw.js)', () => {
        const sw = fs.readFileSync(path.resolve(REPO_ROOT, 'sw.js'), 'utf-8');
        expect(sw).not.toContain('fan-bundle-import-readiness');
    });
});
