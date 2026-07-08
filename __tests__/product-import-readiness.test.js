import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ELIGIBLE_STATUSES,
    PRODUCTION_STATUS,
    PREVIEW_STATUS,
    RESCUE_CONFIG_STRING,
    FANTRIAC_TOKEN,
    LED_PREVIEW_CONFIG_STRING,
    REQUIRED_CONFIGS_CHANNEL,
    REQUIRED_IMPORT_FIELDS,
    PREVIEW_IMPORT_FIELDS,
    STATUS_CHANNEL_MAP,
    isWebflashImportEligible,
    loadCatalog,
    loadSources,
    loadManifest,
    loadKits,
    parseRequiredConfigsFromWorkflow,
    parseRequiredConfigsFromWorkflowText,
    listConfigurationBins,
    listConfigurationSidecars,
    evaluateEntryCatalogShape,
    evaluateEntryAgainstSurfaces,
    crossCheckSurfaces,
    runValidation,
    formatMarkdown,
    formatJson
} from '../scripts/validate-product-import-readiness.js';
// The production (REQUIRED_CONFIGS) surface is derived from kits.json, not
// hardcoded. See __tests__/helpers/stable-surface.js for the anti-tautology
// contract. Imported as recommendedConfigs to avoid clashing with the local
// `requiredConfigs` (the value parsed from the workflow file).
import { recommendedConfigs } from './helpers/stable-surface.js';
// WF-SURFACE-SSOT-001: surface-coupled expectations (live build count, the
// retired-artifact register, per-config channel/version) derive from the
// reviewed expected-surface fixture.
import {
    expectedBuilds,
    expectedChannelOf,
    expectedVersionOf,
    expectedConfigurationBins,
    expectedConfigurationSidecars,
    retiredBuilds,
    retiredArtifacts as fixtureRetiredArtifacts,
    retiredConfigsStillAbsent
} from './helpers/expected-surface.js';

// WF-PRODUCT-004 — Product import readiness validator tests.
//
// All assertions read repo files only. No network. The happy-path tests
// consume the current fixture + on-disk surfaces; the negative tests feed
// synthetic in-memory catalogs / surfaces into the same evaluator so the
// fixture is never mutated.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const FIXTURE_PATH = path.join(
    REPO_ROOT,
    '__tests__',
    'fixtures',
    'esphome-product-catalog.json'
);
const SOURCES_PATH = path.join(REPO_ROOT, 'firmware', 'sources.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.json');
const KITS_PATH = path.join(REPO_ROOT, 'scripts', 'data', 'kits.json');
const WORKFLOW_PATH = path.join(
    REPO_ROOT,
    '.github',
    'workflows',
    'firmware-publish.yml'
);
const CONFIGURATIONS_DIR = path.join(REPO_ROOT, 'firmware', 'configurations');

const RELEASE_ONE_CONFIG = 'Ceiling-POE-VentIQ-RoomIQ';
const FANTRIAC_CONFIG = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';

const catalog = loadCatalog(FIXTURE_PATH);
const sources = loadSources(SOURCES_PATH);
const manifest = loadManifest(MANIFEST_PATH);
const kits = loadKits(KITS_PATH);
const requiredConfigs = parseRequiredConfigsFromWorkflow(WORKFLOW_PATH);
const configurationsBins = listConfigurationBins(CONFIGURATIONS_DIR);
const configurationsSidecars = listConfigurationSidecars(CONFIGURATIONS_DIR);

function runForFixture(overrides = {}) {
    return runValidation({
        catalog,
        sources,
        manifest,
        kits,
        requiredConfigs,
        configurationsBins,
        configurationsSidecars,
        filterConfig: null,
        ...overrides
    });
}

function findEntry(report, configString) {
    return report.entries.find(e => e.config_string === configString);
}

describe('WF-PRODUCT-004 — exported constants', () => {
    test('ELIGIBLE_STATUSES holds production + preview only', () => {
        expect([...ELIGIBLE_STATUSES].sort()).toEqual(['preview', 'production']);
    });

    test('REQUIRED_CONFIGS channel is stable', () => {
        expect(REQUIRED_CONFIGS_CHANNEL).toBe('stable');
    });

    test('STATUS_CHANNEL_MAP pins production→stable and preview→preview|beta', () => {
        expect(STATUS_CHANNEL_MAP[PRODUCTION_STATUS]).toEqual(['stable']);
        expect(STATUS_CHANNEL_MAP[PREVIEW_STATUS]).toEqual(['preview', 'beta']);
    });

    test('REQUIRED_IMPORT_FIELDS covers artifact_name + version + channel + wrappers', () => {
        expect(REQUIRED_IMPORT_FIELDS).toEqual(
            expect.arrayContaining([
                'artifact_name',
                'version',
                'channel',
                'webflash_wrapper',
                'product_yaml'
            ])
        );
    });

    test('RESCUE_CONFIG_STRING and FANTRIAC_TOKEN are exposed', () => {
        expect(RESCUE_CONFIG_STRING).toBe('Rescue');
        expect(FANTRIAC_TOKEN).toBe('FanTRIAC');
        expect(LED_PREVIEW_CONFIG_STRING).toBe('Ceiling-POE-VentIQ-RoomIQ-LED');
    });
});

describe('WF-PRODUCT-004 — current fixture classifications', () => {
    const report = runForFixture();

    test('Release-One is fully eligible across all four surfaces', () => {
        const e = findEntry(report, RELEASE_ONE_CONFIG);
        expect(e).toBeDefined();
        expect(e.shape_issues).toEqual([]);
        expect(e.effective_eligibility.import.eligible).toBe(true);
        expect(e.effective_eligibility.manifest.eligible).toBe(true);
        expect(e.effective_eligibility.required_configs.eligible).toBe(true);
        expect(e.effective_eligibility.kit.eligible).toBe(true);
    });

    test('Release-One is present in every active surface', () => {
        const e = findEntry(report, RELEASE_ONE_CONFIG);
        expect(e.surface_presence.in_sources).toBe(true);
        expect(e.surface_presence.in_manifest).toBe(true);
        expect(e.surface_presence.in_required_configs).toBe(true);
        expect(e.surface_presence.in_kits).toBe(true);
        expect(e.surface_presence.bin_on_disk).toBe(true);
        expect(e.surface_presence.sidecar_on_disk).toBe(true);
    });

    test('LED preview is import + manifest + kit eligible but NOT REQUIRED_CONFIGS eligible', () => {
        const e = findEntry(report, LED_PREVIEW_CONFIG_STRING);
        expect(e).toBeDefined();
        expect(e.shape_issues).toEqual([]);
        expect(e.effective_eligibility.import.eligible).toBe(true);
        expect(e.effective_eligibility.manifest.eligible).toBe(true);
        expect(e.effective_eligibility.kit.eligible).toBe(true);
        expect(e.effective_eligibility.required_configs.eligible).toBe(false);
        expect(
            e.effective_eligibility.required_configs.reasons.some(r =>
                /production-only/i.test(r)
            )
        ).toBe(true);
    });

    test('LED preview is present in sources + manifest but absent from REQUIRED_CONFIGS + kits', () => {
        const e = findEntry(report, LED_PREVIEW_CONFIG_STRING);
        expect(e.surface_presence.in_sources).toBe(true);
        expect(e.surface_presence.in_manifest).toBe(true);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
        expect(e.surface_presence.bin_on_disk).toBe(true);
        expect(e.surface_presence.sidecar_on_disk).toBe(true);
    });

    test('FanTRIAC blocked entry is ineligible on every surface', () => {
        const e = findEntry(report, FANTRIAC_CONFIG);
        expect(e).toBeDefined();
        expect(e.effective_eligibility.import.eligible).toBe(false);
        expect(e.effective_eligibility.manifest.eligible).toBe(false);
        expect(e.effective_eligibility.required_configs.eligible).toBe(false);
        expect(e.effective_eligibility.kit.eligible).toBe(false);
    });

    test('FanTRIAC blocked entry is absent from every active surface', () => {
        const e = findEntry(report, FANTRIAC_CONFIG);
        expect(e.surface_presence.in_sources).toBe(false);
        expect(e.surface_presence.in_manifest).toBe(false);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
    });

    test('legacy-compatible representative is ineligible on every surface', () => {
        const legacy = report.entries.find(e => e.status === 'legacy-compatible');
        expect(legacy).toBeDefined();
        expect(legacy.config_string).toBeNull();
        expect(legacy.legacy_config_id).not.toBeNull();
        expect(legacy.effective_eligibility.import.eligible).toBe(false);
        expect(legacy.effective_eligibility.manifest.eligible).toBe(false);
        expect(legacy.effective_eligibility.required_configs.eligible).toBe(false);
        expect(legacy.effective_eligibility.kit.eligible).toBe(false);
    });

    test('current state passes the validator with no cross-surface findings', () => {
        expect(report.cross_surface).toEqual([]);
        expect(report.summary.shape_violations).toBe(0);
        expect(report.ok).toBe(true);
    });

    test('summary counts derive from the catalog fixture and the expected surface', () => {
        // WF-SURFACE-SSOT-001 — derived, not hardcoded:
        //   - total: one report entry per catalog product (the validator must
        //     not silently drop rows).
        //   - manifest_eligible / kit_eligible: effective manifest / kit
        //     eligibility requires catalog authorisation PLUS a live
        //     firmware/sources.json entry, and every live source backs exactly
        //     one shipping non-Rescue build — so both counts equal the
        //     expected-surface application-build count. A source declared
        //     without its same-PR fixture edit (or vice versa) fails here.
        //   - required_configs_eligible: production-status catalog rows
        //     (eligibility is permission, not presence — the live
        //     REQUIRED_CONFIGS allowlist still keeps only Release-One +
        //     Rescue, asserted separately below).
        // import_eligible stays a HARDCODED reviewed count: deriving it
        // through isWebflashImportEligible would re-run the validator's own
        // authorisation logic over the same catalog (a tautology that could
        // never catch an unreviewed eligibility flip in a row no other test
        // pins individually). Today: Release-One + RoomIQ + AirIQ-RoomIQ
        // (production), VentIQ-RoomIQ-LED (preview), 3 single-driver fan
        // manual-previews, 5 room-bundle fan previews. CI-PIPELINE-CLARITY-001
        // P4 de-listed Ceiling-POE-RoomIQ-LED (never built / served, no
        // upstream artifact) from preview to hardware-pending, dropping the
        // import-eligible count from 13 to 12.
        expect(report.summary.total).toBe(catalog.products.length);
        expect(report.summary.import_eligible).toBe(12);
        expect(report.summary.manifest_eligible).toBe(expectedBuilds.length);
        expect(report.summary.kit_eligible).toBe(expectedBuilds.length);
        expect(report.summary.required_configs_eligible).toBe(
            catalog.products.filter(p => p.status === 'production').length
        );
    });
});

describe('WEBFLASH-RELAY-001 — FanRelay manual-preview import eligibility', () => {
    const report = runForFixture();
    const FANRELAY_CONFIG = 'Ceiling-POE-VentIQ-FanRelay-RoomIQ';

    test('PREVIEW_IMPORT_FIELDS is the manual-preview lane field set (no wrapper)', () => {
        expect(PREVIEW_IMPORT_FIELDS).toEqual(['artifact_name', 'version', 'channel']);
        expect(PREVIEW_IMPORT_FIELDS).not.toContain('webflash_wrapper');
    });

    test('FanRelay stays import eligible at catalog level but is retired from manifest + kit surfaces', () => {
        const e = findEntry(report, FANRELAY_CONFIG);
        expect(e).toBeDefined();
        // Status stays hardware-pending; the eligibility flag is what authorises it.
        expect(e.status).toBe('hardware-pending');
        expect(e.shape_issues).toEqual([]);
        expect(e.effective_eligibility.import.eligible).toBe(true);
        // The stale v1.0.0-preview retirement removed the source entry, so
        // effective manifest / kit eligibility drops with it.
        expect(e.effective_eligibility.manifest.eligible).toBe(false);
        expect(e.effective_eligibility.kit.eligible).toBe(false);
        expect(e.effective_eligibility.required_configs.eligible).toBe(false);
        expect(
            e.effective_eligibility.required_configs.reasons.some(r =>
                /production-only/i.test(r)
            )
        ).toBe(true);
        // The import reason must name the manual-preview lane explicitly.
        expect(
            e.effective_eligibility.import.reasons.some(r =>
                /manual-preview lane/i.test(r)
            )
        ).toBe(true);
    });

    test('FanRelay is retired from every active surface (sources, manifest, disk, kits, REQUIRED_CONFIGS)', () => {
        // The stale v1.0.0-preview retirement removed the source entry, the
        // .bin + sidecar pair, the manifest build, and the Bathroom Relay kit
        // card (upstream's regenerated checksums-sha256.txt no longer lists
        // the asset). The production-only REQUIRED_CONFIGS allowlist is
        // unchanged: FanRelay must never enter it.
        const e = findEntry(report, FANRELAY_CONFIG);
        expect(e.surface_presence.in_sources).toBe(false);
        expect(e.surface_presence.in_manifest).toBe(false);
        expect(e.surface_presence.bin_on_disk).toBe(false);
        expect(e.surface_presence.sidecar_on_disk).toBe(false);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
    });

    test('isWebflashImportEligible honours the flag but stays strict otherwise', () => {
        // The flag authorises import; bare hardware-pending without it does not.
        expect(
            isWebflashImportEligible({
                status: 'hardware-pending',
                webflash_import_eligibility: { eligible: true }
            })
        ).toBe(true);
        expect(isWebflashImportEligible({ status: 'hardware-pending' })).toBe(false);
        expect(
            isWebflashImportEligible({
                status: 'hardware-pending',
                webflash_import_eligibility: { eligible: false }
            })
        ).toBe(false);
        expect(isWebflashImportEligible({ status: 'production' })).toBe(true);
        expect(isWebflashImportEligible({ status: 'preview' })).toBe(true);
        expect(isWebflashImportEligible({ status: 'blocked' })).toBe(false);
    });

    test('a flagged manual-preview entry still needs artifact_name + version + preview channel', () => {
        // eligible=true alone is not enough — the lane must declare what to import.
        const missingFields = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Flagged-NoFields',
            status: 'hardware-pending',
            webflash_build_matrix: false,
            webflash_import_eligibility: { eligible: true }
        });
        expect(missingFields.catalog_eligibility.import.eligible).toBe(false);

        // A flagged entry whose channel is not preview is rejected.
        const wrongChannel = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Flagged-Stable',
            status: 'hardware-pending',
            channel: 'stable',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Flagged-Stable-v1.0.0-stable.bin',
            webflash_build_matrix: false,
            webflash_import_eligibility: { eligible: true }
        });
        expect(wrongChannel.catalog_eligibility.import.eligible).toBe(false);

        // A correctly-shaped flagged manual-preview entry IS import-eligible but
        // NEVER REQUIRED_CONFIGS-eligible (hardware-pending is not production).
        const ok = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Flagged-Ok',
            status: 'hardware-pending',
            channel: 'preview',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Flagged-Ok-v1.0.0-preview.bin',
            webflash_build_matrix: false,
            webflash_import_eligibility: { eligible: true }
        });
        expect(ok.catalog_eligibility.import.eligible).toBe(true);
        expect(ok.catalog_eligibility.required_configs.eligible).toBe(false);
    });
});

describe('WEBFLASH-PWM-001 — FanPWM manual-preview import eligibility', () => {
    const report = runForFixture();
    const FANPWM_CONFIG = 'Ceiling-POE-FanPWM';

    test('FanPWM stays import eligible at catalog level but is retired from manifest + kit surfaces', () => {
        const e = findEntry(report, FANPWM_CONFIG);
        expect(e).toBeDefined();
        // Status stays hardware-pending; the eligibility flag is what authorises it.
        expect(e.status).toBe('hardware-pending');
        expect(e.shape_issues).toEqual([]);
        expect(e.effective_eligibility.import.eligible).toBe(true);
        // The stale v1.0.0-preview retirement removed the source entry, so
        // effective manifest / kit eligibility drops with it.
        expect(e.effective_eligibility.manifest.eligible).toBe(false);
        expect(e.effective_eligibility.kit.eligible).toBe(false);
        expect(e.effective_eligibility.required_configs.eligible).toBe(false);
        expect(
            e.effective_eligibility.required_configs.reasons.some(r =>
                /production-only/i.test(r)
            )
        ).toBe(true);
        // The import reason must name the manual-preview lane explicitly.
        expect(
            e.effective_eligibility.import.reasons.some(r =>
                /manual-preview lane/i.test(r)
            )
        ).toBe(true);
    });

    test('FanPWM is retired from every active surface (sources, manifest, disk, kits, REQUIRED_CONFIGS)', () => {
        // The stale v1.0.0-preview retirement removed the source entry, the
        // .bin + sidecar pair, and the manifest build (upstream's regenerated
        // checksums-sha256.txt no longer lists the asset).
        const e = findEntry(report, FANPWM_CONFIG);
        expect(e.surface_presence.in_sources).toBe(false);
        expect(e.surface_presence.in_manifest).toBe(false);
        expect(e.surface_presence.bin_on_disk).toBe(false);
        expect(e.surface_presence.sidecar_on_disk).toBe(false);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
    });
});

describe('WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — FanDAC manual-preview import eligibility', () => {
    const report = runForFixture();
    const FANDAC_CONFIG = 'Ceiling-POE-FanDAC';

    test('FanDAC stays import eligible at catalog level but is retired from manifest + kit surfaces', () => {
        const e = findEntry(report, FANDAC_CONFIG);
        expect(e).toBeDefined();
        // Status stays hardware-pending; the eligibility flag is what authorises it.
        expect(e.status).toBe('hardware-pending');
        expect(e.shape_issues).toEqual([]);
        expect(e.effective_eligibility.import.eligible).toBe(true);
        // The stale v1.0.0-preview retirement removed the source entry, so
        // effective manifest / kit eligibility drops with it.
        expect(e.effective_eligibility.manifest.eligible).toBe(false);
        expect(e.effective_eligibility.kit.eligible).toBe(false);
        expect(e.effective_eligibility.required_configs.eligible).toBe(false);
        expect(
            e.effective_eligibility.required_configs.reasons.some(r =>
                /production-only/i.test(r)
            )
        ).toBe(true);
        // The import reason must name the manual-preview lane explicitly.
        expect(
            e.effective_eligibility.import.reasons.some(r =>
                /manual-preview lane/i.test(r)
            )
        ).toBe(true);
    });

    test('FanDAC is retired from every active surface (sources, manifest, disk, kits, REQUIRED_CONFIGS)', () => {
        // The stale v1.0.0-preview retirement removed the source entry, the
        // .bin + sidecar pair, and the manifest build (upstream's regenerated
        // checksums-sha256.txt no longer lists the asset).
        const e = findEntry(report, FANDAC_CONFIG);
        expect(e.surface_presence.in_sources).toBe(false);
        expect(e.surface_presence.in_manifest).toBe(false);
        expect(e.surface_presence.bin_on_disk).toBe(false);
        expect(e.surface_presence.sidecar_on_disk).toBe(false);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
    });
});

describe('WF-PREVIEW-IMPORT-FIRST-BATCH-001 — first preview batch eligibility', () => {
    const report = runForFixture();

    // Of the first preview batch, AirIQ-RoomIQ was promoted by upstream to
    // production / stable and re-imported as v1.0.6 stable; RoomIQ-LED stays
    // retired (upstream's regenerated v1.0.0-preview checksums-sha256.txt no
    // longer lists its asset, so the importer fails closed on it).

    test('Ceiling-POE-AirIQ-RoomIQ is a promoted stable: fully eligible, shipping in sources + manifest + disk', () => {
        const e = findEntry(report, 'Ceiling-POE-AirIQ-RoomIQ');
        expect(e).toBeDefined();
        expect(e.status).toBe('production');
        expect(e.shape_issues).toEqual([]);
        expect(e.effective_eligibility.import.eligible).toBe(true);
        expect(e.effective_eligibility.manifest.eligible).toBe(true);
        expect(e.effective_eligibility.kit.eligible).toBe(true);
        // production + stable is REQUIRED_CONFIGS-ELIGIBLE at catalog level;
        // eligibility is permission, not presence (see the surface test below).
        expect(e.effective_eligibility.required_configs.eligible).toBe(true);
    });

    test('Ceiling-POE-AirIQ-RoomIQ ships everywhere except kits + REQUIRED_CONFIGS (Kitchen kit withheld)', () => {
        // The v1.0.6 stable import put the config back in sources, the
        // manifest, and on disk. The S360-KIT-KITCHEN-P kit card stays
        // withheld per the upstream catalog bundle gating (owner waiver
        // HW-AIRIQ-WAIVER-2026-06), and the live REQUIRED_CONFIGS allowlist
        // stays Release-One + Rescue until a deliberate WF-REQUIRED-001-style
        // decision adds it.
        const e = findEntry(report, 'Ceiling-POE-AirIQ-RoomIQ');
        expect(e.surface_presence.in_sources).toBe(true);
        expect(e.surface_presence.in_manifest).toBe(true);
        expect(e.surface_presence.bin_on_disk).toBe(true);
        expect(e.surface_presence.sidecar_on_disk).toBe(true);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
    });

    test('Ceiling-POE-RoomIQ-LED is de-listed: not import / manifest / kit / REQUIRED_CONFIGS eligible', () => {
        // CI-PIPELINE-CLARITY-001 P4 (matches esphome-public P4a): this config
        // was never built or served (no upstream artifact), so it is de-listed
        // from release-eligibility — catalog status moved preview ->
        // hardware-pending, webflash_build_matrix=false, and it was removed from
        // the WebFlash Add-Source picker. The catalog entry is preserved so the
        // config can be built and re-listed later.
        const e = findEntry(report, 'Ceiling-POE-RoomIQ-LED');
        expect(e).toBeDefined();
        expect(e.status).toBe('hardware-pending');
        expect(e.shape_issues).toEqual([]);
        // hardware-pending without an explicit webflash_import_eligibility flag
        // is not import-eligible; manifest / kit eligibility drop with it.
        expect(e.effective_eligibility.import.eligible).toBe(false);
        expect(e.effective_eligibility.manifest.eligible).toBe(false);
        expect(e.effective_eligibility.kit.eligible).toBe(false);
        // Non-production status is never production-only REQUIRED_CONFIGS eligible.
        expect(e.effective_eligibility.required_configs.eligible).toBe(false);
    });

    test('Ceiling-POE-RoomIQ-LED is retired from sources, manifest, disk, kits, and REQUIRED_CONFIGS', () => {
        const e = findEntry(report, 'Ceiling-POE-RoomIQ-LED');
        expect(e.surface_presence.in_sources).toBe(false);
        expect(e.surface_presence.in_manifest).toBe(false);
        expect(e.surface_presence.bin_on_disk).toBe(false);
        expect(e.surface_presence.sidecar_on_disk).toBe(false);
        expect(e.surface_presence.in_required_configs).toBe(false);
        expect(e.surface_presence.in_kits).toBe(false);
    });

    test('the v1.0.0-preview artifacts retired in the stale-source cleanup stay retired', () => {
        // WF-SURFACE-SSOT-001: the retired register is the expected-surface
        // fixture's `retired` list (the five v1.0.0-preview artifacts whose
        // assets left upstream's regenerated checksums-sha256.txt in #553).
        // None of the retired artifacts may reappear on disk, and none of
        // their configs may resolve to a build on the retired channel.
        expect(retiredBuilds.length).toBeGreaterThan(0);
        for (const artifact of fixtureRetiredArtifacts) {
            expect(configurationsBins).not.toContain(artifact);
            expect(configurationsSidecars).not.toContain(
                artifact.replace(/\.bin$/, '.meta.json')
            );
        }
        const retiredConfigChannelPairs = new Set(
            retiredBuilds.map(r => `${r.config_string}@${r.channel}`)
        );
        const retiredChannelBuilds = (manifest.builds || []).filter(b =>
            retiredConfigChannelPairs.has(`${b.config_string}@${b.channel}`)
        );
        expect(retiredChannelBuilds).toEqual([]);
        // Configs that have not returned are absent outright; a config that
        // returned at a new version/channel (AirIQ-RoomIQ: retired as the
        // v1.0.0 preview, shipping as the promoted stable) is present ONLY in
        // its fixture-declared form.
        const byConfig = new Map(
            (manifest.builds || []).map(b => [b.config_string, b])
        );
        for (const cfg of retiredConfigsStillAbsent) {
            expect(byConfig.has(cfg)).toBe(false);
        }
        const airiqRoomiq = byConfig.get('Ceiling-POE-AirIQ-RoomIQ');
        expect(airiqRoomiq).toBeDefined();
        expect(airiqRoomiq.channel).toBe(expectedChannelOf('Ceiling-POE-AirIQ-RoomIQ'));
        expect(airiqRoomiq.version).toBe(expectedVersionOf('Ceiling-POE-AirIQ-RoomIQ'));
    });

    test('the promoted stable and the retired previews introduce no cross-surface violations', () => {
        expect(report.cross_surface).toEqual([]);
        expect(report.ok).toBe(true);
    });
});

describe('WF-PRODUCT-004 — synthetic catalog-shape violations', () => {
    test('preview with stable channel is import-ineligible', () => {
        const result = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Preview-Stable',
            status: 'preview',
            channel: 'stable',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Preview-Stable-v1.0.0-stable.bin',
            webflash_build_matrix: true,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        expect(result.catalog_eligibility.import.eligible).toBe(false);
        expect(result.shape_issues.some(s => /channel/i.test(s))).toBe(true);
    });

    test('production with preview channel is import-ineligible', () => {
        const result = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Production-Preview',
            status: 'production',
            channel: 'preview',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Production-Preview-v1.0.0-preview.bin',
            webflash_build_matrix: true,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        expect(result.catalog_eligibility.import.eligible).toBe(false);
        expect(result.shape_issues.some(s => /channel/i.test(s))).toBe(true);
    });

    test('webflash_build_matrix=true without artifact_name fails import and shape', () => {
        const result = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Missing-Artifact',
            status: 'production',
            channel: 'stable',
            version: '1.0.0',
            // artifact_name intentionally omitted
            webflash_build_matrix: true,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        expect(result.catalog_eligibility.import.eligible).toBe(false);
        expect(result.shape_issues.some(s => /artifact_name/.test(s))).toBe(true);
    });

    test('blocked status is never import-eligible regardless of other fields', () => {
        const result = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Blocked',
            status: 'blocked',
            channel: 'stable',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Blocked-v1.0.0-stable.bin',
            webflash_build_matrix: true,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        expect(result.catalog_eligibility.import.eligible).toBe(false);
        expect(result.catalog_eligibility.required_configs.eligible).toBe(false);
        expect(result.catalog_eligibility.kit.eligible).toBe(false);
    });

    test('legacy-compatible status is never eligible for any surface', () => {
        const result = evaluateEntryCatalogShape({
            legacy_config_id: 'sense360-legacy-thing',
            status: 'legacy-compatible',
            webflash_build_matrix: false
        });
        expect(result.catalog_eligibility.import.eligible).toBe(false);
        expect(result.catalog_eligibility.manifest.eligible).toBe(false);
        expect(result.catalog_eligibility.required_configs.eligible).toBe(false);
        expect(result.catalog_eligibility.kit.eligible).toBe(false);
        expect(result.identifier).toBe('legacy:sense360-legacy-thing');
    });

    test('preview entry is never REQUIRED_CONFIGS-eligible at catalog level', () => {
        const result = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Preview-Ok',
            status: 'preview',
            channel: 'preview',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Preview-Ok-v1.0.0-preview.bin',
            webflash_build_matrix: true,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        expect(result.catalog_eligibility.import.eligible).toBe(true);
        expect(result.catalog_eligibility.required_configs.eligible).toBe(false);
    });

    test('production-with-stable but no webflash_build_matrix is import-ineligible', () => {
        const result = evaluateEntryCatalogShape({
            config_string: 'Synthetic-No-Matrix',
            status: 'production',
            channel: 'stable',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-No-Matrix-v1.0.0-stable.bin',
            webflash_build_matrix: false,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        expect(result.catalog_eligibility.import.eligible).toBe(false);
        expect(
            result.catalog_eligibility.import.reasons.some(r =>
                /webflash_build_matrix/i.test(r)
            )
        ).toBe(true);
    });
});

describe('WF-PRODUCT-004 — synthetic surface overlays', () => {
    test('catalog-eligible entry with no source/manifest/disk fails manifest layer', () => {
        const shape = evaluateEntryCatalogShape({
            config_string: 'Synthetic-Stable-Ok',
            status: 'production',
            channel: 'stable',
            version: '1.0.0',
            artifact_name: 'Sense360-Synthetic-Stable-Ok-v1.0.0-stable.bin',
            webflash_build_matrix: true,
            product_yaml: 'products/synthetic.yaml',
            webflash_wrapper: 'products/webflash/synthetic.yaml'
        });
        const overlay = evaluateEntryAgainstSurfaces(shape, {
            sources: { sources: [] },
            manifest: { builds: [] },
            kits: { kits: [] },
            requiredConfigs: [],
            configurationsBins: [],
            configurationsSidecars: []
        });
        expect(overlay.effective_eligibility.import.eligible).toBe(true);
        expect(overlay.effective_eligibility.manifest.eligible).toBe(false);
        expect(overlay.effective_eligibility.required_configs.eligible).toBe(false);
        expect(overlay.effective_eligibility.kit.eligible).toBe(false);
    });
});

describe('WF-PRODUCT-004 — synthetic cross-surface violations', () => {
    test('REQUIRED_CONFIGS containing the LED preview is flagged', () => {
        const findings = crossCheckSurfaces({
            catalog,
            sources: { sources: [] },
            manifest: { builds: [] },
            kits: { kits: [] },
            requiredConfigs: [
                RELEASE_ONE_CONFIG,
                LED_PREVIEW_CONFIG_STRING,
                RESCUE_CONFIG_STRING
            ]
        });
        const ledFinding = findings.find(
            f =>
                f.surface === 'REQUIRED_CONFIGS' &&
                f.identifier === LED_PREVIEW_CONFIG_STRING
        );
        expect(ledFinding).toBeDefined();
        expect(ledFinding.severity).toBe('error');
        expect(ledFinding.message).toMatch(/production-only/i);
    });

    test('sources.json containing the blocked FanTRIAC entry is flagged', () => {
        const findings = crossCheckSurfaces({
            catalog,
            sources: {
                sources: [
                    {
                        config_string: FANTRIAC_CONFIG,
                        asset_name: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin'
                    }
                ]
            },
            manifest: { builds: [] },
            kits: { kits: [] },
            requiredConfigs: []
        });
        expect(
            findings.some(
                f =>
                    f.surface === 'firmware/sources.json' &&
                    f.identifier === FANTRIAC_CONFIG
            )
        ).toBe(true);
    });

    test('manifest.json containing a FanTRIAC-tokened config_string is flagged', () => {
        const findings = crossCheckSurfaces({
            catalog,
            sources: { sources: [] },
            manifest: {
                builds: [{ config_string: FANTRIAC_CONFIG, parts: [] }]
            },
            kits: { kits: [] },
            requiredConfigs: []
        });
        expect(
            findings.some(
                f =>
                    f.surface === 'manifest.json' &&
                    f.message.toLowerCase().includes('fantriac')
            )
        ).toBe(true);
    });

    test('kits.json pointing at a blocked catalog entry is flagged', () => {
        const findings = crossCheckSurfaces({
            catalog,
            sources: { sources: [] },
            manifest: { builds: [] },
            kits: {
                kits: [
                    {
                        sku: 'S360-KIT-BAD',
                        firmware_config_string: FANTRIAC_CONFIG
                    }
                ]
            },
            requiredConfigs: []
        });
        expect(
            findings.some(f => f.surface === 'scripts/data/kits.json')
        ).toBe(true);
    });

    test('Rescue is exempt from catalog-membership checks across every surface', () => {
        const findings = crossCheckSurfaces({
            catalog,
            sources: { sources: [{ config_string: RESCUE_CONFIG_STRING }] },
            manifest: {
                builds: [{ config_string: RESCUE_CONFIG_STRING, parts: [] }]
            },
            kits: {
                kits: [
                    {
                        sku: 'S360-KIT-RESCUE',
                        firmware_config_string: RESCUE_CONFIG_STRING
                    }
                ]
            },
            requiredConfigs: [RESCUE_CONFIG_STRING]
        });
        expect(findings).toEqual([]);
    });

    test('sources.json containing a catalog-unknown config is flagged', () => {
        const findings = crossCheckSurfaces({
            catalog,
            sources: { sources: [{ config_string: 'Ceiling-Not-A-Real-Config' }] },
            manifest: { builds: [] },
            kits: { kits: [] },
            requiredConfigs: []
        });
        expect(
            findings.some(
                f =>
                    f.surface === 'firmware/sources.json' &&
                    /not in the upstream product catalog/i.test(f.message)
            )
        ).toBe(true);
    });
});

describe('WF-PRODUCT-004 — output formats', () => {
    const report = runForFixture();

    test('formatJson produces parseable JSON', () => {
        const json = formatJson(report);
        expect(() => JSON.parse(json)).not.toThrow();
        const parsed = JSON.parse(json);
        expect(parsed.summary).toBeDefined();
        expect(Array.isArray(parsed.entries)).toBe(true);
        expect(Array.isArray(parsed.cross_surface)).toBe(true);
        expect(typeof parsed.ok).toBe('boolean');
    });

    test('formatMarkdown contains the readiness table header', () => {
        const md = formatMarkdown(report);
        expect(md).toMatch(/# Product import readiness report/);
        expect(md).toMatch(/## Readiness table/);
        expect(md).toMatch(/\| Identifier \| Status \| Channel \|/);
    });

    test('formatMarkdown lists every fixture entry in the readiness table', () => {
        const md = formatMarkdown(report);
        expect(md).toMatch(/\| `Ceiling-POE-VentIQ-RoomIQ` \|/);
        expect(md).toMatch(/\| `Ceiling-POE-VentIQ-RoomIQ-LED` \|/);
        expect(md).toMatch(/\| `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` \|/);
        expect(md).toMatch(/\| `legacy:sense360-core-c-poe` \|/);
    });

    test('formatMarkdown ends with the cross-surface findings section', () => {
        const md = formatMarkdown(report);
        expect(md).toMatch(/## Cross-surface findings/);
        expect(md).toMatch(/No cross-surface findings\./);
    });
});

describe('WF-PRODUCT-004 — filter behaviour', () => {
    test('--config narrows the report to the named entry', () => {
        const report = runForFixture({ filterConfig: LED_PREVIEW_CONFIG_STRING });
        expect(report.entries).toHaveLength(1);
        expect(report.entries[0].config_string).toBe(LED_PREVIEW_CONFIG_STRING);
    });

    test('--config skipping a non-matching catalog yields an empty report', () => {
        const report = runForFixture({ filterConfig: 'Ceiling-Definitely-Not-Present' });
        expect(report.entries).toEqual([]);
        // Filtered reports skip cross-surface checks intentionally.
        expect(report.cross_surface).toEqual([]);
        expect(report.ok).toBe(true);
    });
});

describe('WF-PRODUCT-004 — workflow YAML parsing', () => {
    test('parseRequiredConfigsFromWorkflowText extracts entries from an inline array', () => {
        const yamlText = `
          run: |
            REQUIRED_CONFIGS=(
              "Ceiling-POE-VentIQ-RoomIQ"
              "Rescue"
            )
            echo hi
        `;
        expect(parseRequiredConfigsFromWorkflowText(yamlText)).toEqual([
            'Ceiling-POE-VentIQ-RoomIQ',
            'Rescue'
        ]);
    });

    test('parseRequiredConfigsFromWorkflowText throws when the array is absent', () => {
        expect(() =>
            parseRequiredConfigsFromWorkflowText('no_required_configs_here: true')
        ).toThrow(/REQUIRED_CONFIGS/);
    });

    test('the on-disk workflow file parses to the production+Rescue allowlist', () => {
        // Defence-in-depth with __tests__/github-pages-surface.test.js. The
        // validator MUST see the same allowlist the publish workflow gates on.
        // The production surface is the kits.json-derived recommended config set
        // (a different artifact from the workflow YAML parsed into `required`).
        const required = parseRequiredConfigsFromWorkflow(WORKFLOW_PATH);
        expect(new Set(required)).toEqual(
            new Set([...recommendedConfigs, RESCUE_CONFIG_STRING])
        );
    });
});

describe('WF-PRODUCT-004 — surface helpers', () => {
    // WF-SURFACE-SSOT-001: the helper listings are pinned to the full
    // fixture-derived file sets (stronger than the old contains-style spot
    // checks, and a version bump is now a single fixture edit).
    test('listConfigurationBins returns exactly the fixture-declared .bin set', () => {
        const bins = listConfigurationBins(CONFIGURATIONS_DIR);
        expect([...bins].sort()).toEqual([...expectedConfigurationBins]);
    });

    test('listConfigurationSidecars returns exactly the fixture-declared .meta.json set', () => {
        const sidecars = listConfigurationSidecars(CONFIGURATIONS_DIR);
        expect([...sidecars].sort()).toEqual([...expectedConfigurationSidecars]);
    });
});

describe('WF-PRODUCT-004 — non-OK exit when cross-surface violations exist', () => {
    test('runValidation marks ok=false when a synthetic violation is injected', () => {
        const violatedRequired = [
            RELEASE_ONE_CONFIG,
            LED_PREVIEW_CONFIG_STRING, // preview must never be required
            RESCUE_CONFIG_STRING
        ];
        const report = runValidation({
            catalog,
            sources,
            manifest,
            kits,
            requiredConfigs: violatedRequired,
            configurationsBins,
            configurationsSidecars
        });
        expect(report.ok).toBe(false);
        expect(report.cross_surface.length).toBeGreaterThan(0);
        expect(
            report.cross_surface.some(
                f =>
                    f.surface === 'REQUIRED_CONFIGS' &&
                    f.identifier === LED_PREVIEW_CONFIG_STRING
            )
        ).toBe(true);
    });
});
