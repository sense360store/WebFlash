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

    test('summary counts match the fixture today', () => {
        // 8 entries after WEBFLASH-RELAY-001: Release-One (production), FanTRIAC
        // (blocked), 1 legacy-compatible, FOUR preview builds (the VentIQ LED
        // preview plus the three first-batch previews AirIQ-RoomIQ / RoomIQ /
        // RoomIQ-LED), and the FanRelay manual-preview (status hardware-pending
        // but webflash_import_eligibility.eligible=true).
        expect(report.summary.total).toBe(8);
        expect(report.summary.import_eligible).toBe(6); // Release-One + 4 previews + FanRelay
        expect(report.summary.manifest_eligible).toBe(6);
        expect(report.summary.required_configs_eligible).toBe(1); // Release-One only
        expect(report.summary.kit_eligible).toBe(6);
    });
});

describe('WEBFLASH-RELAY-001 — FanRelay manual-preview import eligibility', () => {
    const report = runForFixture();
    const FANRELAY_CONFIG = 'Ceiling-POE-VentIQ-FanRelay-RoomIQ';

    test('PREVIEW_IMPORT_FIELDS is the manual-preview lane field set (no wrapper)', () => {
        expect(PREVIEW_IMPORT_FIELDS).toEqual(['artifact_name', 'version', 'channel']);
        expect(PREVIEW_IMPORT_FIELDS).not.toContain('webflash_wrapper');
    });

    test('FanRelay is import + manifest + kit eligible but NOT REQUIRED_CONFIGS eligible', () => {
        const e = findEntry(report, FANRELAY_CONFIG);
        expect(e).toBeDefined();
        // Status stays hardware-pending; the eligibility flag is what authorises it.
        expect(e.status).toBe('hardware-pending');
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
        // The import reason must name the manual-preview lane explicitly.
        expect(
            e.effective_eligibility.import.reasons.some(r =>
                /manual-preview lane/i.test(r)
            )
        ).toBe(true);
    });

    test('FanRelay is present in sources + manifest + on disk, absent from REQUIRED_CONFIGS + kits', () => {
        const e = findEntry(report, FANRELAY_CONFIG);
        expect(e.surface_presence.in_sources).toBe(true);
        expect(e.surface_presence.in_manifest).toBe(true);
        expect(e.surface_presence.bin_on_disk).toBe(true);
        expect(e.surface_presence.sidecar_on_disk).toBe(true);
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

describe('WF-PREVIEW-IMPORT-FIRST-BATCH-001 — first preview batch eligibility', () => {
    const report = runForFixture();
    const FIRST_BATCH = [
        'Ceiling-POE-AirIQ-RoomIQ',
        'Ceiling-POE-RoomIQ',
        'Ceiling-POE-RoomIQ-LED'
    ];

    test.each(FIRST_BATCH)(
        '%s is import + manifest + kit eligible but NOT REQUIRED_CONFIGS eligible',
        (configString) => {
            const e = findEntry(report, configString);
            expect(e).toBeDefined();
            expect(e.status).toBe('preview');
            expect(e.shape_issues).toEqual([]);
            expect(e.effective_eligibility.import.eligible).toBe(true);
            expect(e.effective_eligibility.manifest.eligible).toBe(true);
            expect(e.effective_eligibility.kit.eligible).toBe(true);
            // Preview is never production-only REQUIRED_CONFIGS eligible.
            expect(e.effective_eligibility.required_configs.eligible).toBe(false);
            expect(
                e.effective_eligibility.required_configs.reasons.some(r =>
                    /production-only/i.test(r)
                )
            ).toBe(true);
        }
    );

    test.each(FIRST_BATCH)(
        '%s is present in sources + manifest + on disk, absent from REQUIRED_CONFIGS + kits',
        (configString) => {
            const e = findEntry(report, configString);
            expect(e.surface_presence.in_sources).toBe(true);
            expect(e.surface_presence.in_manifest).toBe(true);
            expect(e.surface_presence.bin_on_disk).toBe(true);
            expect(e.surface_presence.sidecar_on_disk).toBe(true);
            expect(e.surface_presence.in_required_configs).toBe(false);
            expect(e.surface_presence.in_kits).toBe(false);
        }
    );

    test('the first preview batch introduces no cross-surface violations', () => {
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
        const required = parseRequiredConfigsFromWorkflow(WORKFLOW_PATH);
        expect(new Set(required)).toEqual(
            new Set([RELEASE_ONE_CONFIG, RESCUE_CONFIG_STRING])
        );
    });
});

describe('WF-PRODUCT-004 — surface helpers', () => {
    test('listConfigurationBins returns the on-disk Release-One + LED preview .bin pair', () => {
        const bins = listConfigurationBins(CONFIGURATIONS_DIR);
        expect(bins).toEqual(
            expect.arrayContaining([
                'Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin',
                'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin'
            ])
        );
    });

    test('listConfigurationSidecars returns matching .meta.json files', () => {
        const sidecars = listConfigurationSidecars(CONFIGURATIONS_DIR);
        expect(sidecars).toEqual(
            expect.arrayContaining([
                'Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.meta.json',
                'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.meta.json'
            ])
        );
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
