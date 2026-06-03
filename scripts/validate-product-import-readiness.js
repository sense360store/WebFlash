#!/usr/bin/env node
/**
 * WF-PRODUCT-004 — Product import readiness validator.
 *
 * Advisory/reporting tool. Given an upstream product-catalog entry (or every
 * entry in a catalog file), answers four independent questions about WebFlash
 * exposure:
 *
 *   - import-eligible:           can the catalog entry be imported via
 *                                `scripts/import-firmware-sources.py`?
 *   - manifest-eligible:         can it appear in `manifest.json` /
 *                                `firmware-*.json` today, given the on-disk
 *                                `firmware/sources.json` +
 *                                `firmware/configurations/` state?
 *   - REQUIRED_CONFIGS-eligible: may the entry be added to the publish
 *                                workflow's `REQUIRED_CONFIGS` allowlist?
 *   - kit-eligible:              may a kit in `scripts/data/kits.json`
 *                                point at this config_string?
 *
 * The validator is read-only. It does **not** import firmware, regenerate
 * manifests, change `REQUIRED_CONFIGS`, modify kits, or touch any UI surface.
 * It exits non-zero when a catalog entry violates an eligibility rule or when
 * a live WebFlash surface references a catalog entry it should not reach.
 *
 * Eligibility & guardrails are the same shape the WF-PRODUCT-001 alignment
 * test enforces (see `__tests__/product-catalog-alignment.test.js`):
 *
 *   - `production` and `preview` are import / manifest / kit eligible;
 *     `blocked` / `legacy-compatible` / `deprecated` / `removed` /
 *     `hardware-pending` / `compile-only` are not.
 *   - `REQUIRED_CONFIGS` stays production-only on `channel: stable`. Preview
 *     entries (e.g. the LED preview today) MUST NOT enter the allowlist.
 *   - The `Rescue` config_string is a WebFlash-owned local build and is
 *     exempt by name from every catalog-membership check.
 *   - FanTRIAC token in any active surface is a failure regardless of
 *     catalog state (defence-in-depth with manifest-health.test.js).
 *
 * Usage:
 *
 *     node scripts/validate-product-import-readiness.js
 *     node scripts/validate-product-import-readiness.js \
 *         --catalog __tests__/fixtures/esphome-product-catalog.json
 *     node scripts/validate-product-import-readiness.js \
 *         --catalog /tmp/upstream-product-catalog.json \
 *         --config Ceiling-POE-VentIQ-RoomIQ-LED \
 *         --format markdown
 *     node scripts/validate-product-import-readiness.js --format json
 *
 * Exit codes:
 *   0 — every entry classified consistently, no cross-surface findings.
 *   1 — at least one eligibility / cross-surface violation.
 *   2 — usage error or file-load failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_CATALOG_PATH = path.join(
    REPO_ROOT,
    '__tests__',
    'fixtures',
    'esphome-product-catalog.json'
);
const DEFAULT_SOURCES_PATH = path.join(REPO_ROOT, 'firmware', 'sources.json');
const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.json');
const DEFAULT_KITS_PATH = path.join(REPO_ROOT, 'scripts', 'data', 'kits.json');
const DEFAULT_WORKFLOW_PATH = path.join(
    REPO_ROOT,
    '.github',
    'workflows',
    'firmware-publish.yml'
);
const DEFAULT_CONFIGURATIONS_DIR = path.join(
    REPO_ROOT,
    'firmware',
    'configurations'
);

// --- Public constants ------------------------------------------------------

export const ELIGIBLE_STATUSES = new Set(['production', 'preview']);
export const PRODUCTION_STATUS = 'production';
export const PREVIEW_STATUS = 'preview';
export const REQUIRED_CONFIGS_CHANNEL = 'stable';
export const STATUS_CHANNEL_MAP = {
    production: ['stable'],
    preview: ['preview', 'beta']
};
export const RESCUE_CONFIG_STRING = 'Rescue';
export const FANTRIAC_TOKEN = 'FanTRIAC';
export const LED_PREVIEW_CONFIG_STRING = 'Ceiling-POE-VentIQ-RoomIQ-LED';
export const REQUIRED_IMPORT_FIELDS = [
    'artifact_name',
    'version',
    'channel',
    'webflash_wrapper',
    'product_yaml'
];

// WEBFLASH-RELAY-001 — the manual-preview import lane (upstream #711) does not
// carry a committed WebFlash build row, so it has no `webflash_wrapper` and
// `webflash_build_matrix` stays false. It still must declare what to import:
// artifact_name + version + channel.
export const PREVIEW_IMPORT_FIELDS = ['artifact_name', 'version', 'channel'];

// WEBFLASH-RELAY-001 — WebFlash import is authorised either by a catalog
// lifecycle status in ELIGIBLE_STATUSES (production/preview) OR by an explicit
// upstream webflash_import_eligibility.eligible=true flag (config/preview-
// release-targets.json), which #711 set for FanRelay/FanPWM/FanDAC while their
// catalog status stays hardware-pending. The flag is honoured for import /
// manifest / kit eligibility only — never for REQUIRED_CONFIGS (production-only)
// and never when eligible !== true (FanTRIAC stays eligible=false / rejected).
export function isWebflashImportEligible(entry) {
    if (!entry) {
        return false;
    }
    if (ELIGIBLE_STATUSES.has(entry.status)) {
        return true;
    }
    return Boolean(
        entry.webflash_import_eligibility &&
            entry.webflash_import_eligibility.eligible === true
    );
}

// --- Helpers ---------------------------------------------------------------

function containsSegment(value, token) {
    if (typeof value !== 'string' || value.length === 0) return false;
    return value.split('-').includes(token);
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// --- Loaders ---------------------------------------------------------------

export function loadCatalog(catalogPath) {
    if (!fs.existsSync(catalogPath)) {
        throw new Error(`Catalog not found: ${catalogPath}`);
    }
    let parsed;
    try {
        parsed = readJsonFile(catalogPath);
    } catch (err) {
        throw new Error(`Catalog at ${catalogPath} is not valid JSON: ${err.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.products)) {
        throw new Error(
            `Catalog at ${catalogPath} is missing a 'products' array.`
        );
    }
    return parsed;
}

export function loadSources(sourcesPath) {
    return readJsonFile(sourcesPath);
}

export function loadManifest(manifestPath) {
    return readJsonFile(manifestPath);
}

export function loadKits(kitsPath) {
    return readJsonFile(kitsPath);
}

export function parseRequiredConfigsFromWorkflowText(yamlText) {
    if (typeof yamlText !== 'string') {
        throw new Error(
            'parseRequiredConfigsFromWorkflowText requires a string YAML body.'
        );
    }
    const arrayBlock = yamlText.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
    if (!arrayBlock) {
        throw new Error(
            "Could not locate 'REQUIRED_CONFIGS=( ... )' block in workflow YAML."
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

export function parseRequiredConfigsFromWorkflow(workflowPath) {
    const yamlText = fs.readFileSync(workflowPath, 'utf8');
    return parseRequiredConfigsFromWorkflowText(yamlText);
}

export function listConfigurationBins(configurationsDir) {
    if (!fs.existsSync(configurationsDir)) return [];
    return fs
        .readdirSync(configurationsDir)
        .filter(name => name.endsWith('.bin'));
}

export function listConfigurationSidecars(configurationsDir) {
    if (!fs.existsSync(configurationsDir)) return [];
    return fs
        .readdirSync(configurationsDir)
        .filter(name => name.endsWith('.meta.json'));
}

// --- Per-entry catalog evaluation ------------------------------------------

function blockedTokensInEntry(entry) {
    const blocked = Array.isArray(entry.blocked_modules) ? entry.blocked_modules : [];
    if (blocked.length === 0) return [];
    const haystacks = [];
    if (typeof entry.artifact_name === 'string') haystacks.push(entry.artifact_name);
    if (typeof entry.config_string === 'string') haystacks.push(entry.config_string);
    const hits = new Set();
    for (const token of blocked) {
        for (const h of haystacks) {
            // Match as a token segment so "LED" doesn't false-match "LEDless".
            // Also allow "." as a segment separator so an artifact_name like
            // ".bin" doesn't swallow the trailing token.
            if (h.split(/[-.]/).includes(token)) {
                hits.add(token);
            }
        }
    }
    return [...hits];
}

function missingImportFields(entry) {
    const missing = [];
    for (const key of REQUIRED_IMPORT_FIELDS) {
        if (!nonEmptyString(entry[key])) missing.push(key);
    }
    return missing;
}

export function evaluateEntryCatalogShape(entry) {
    // Pure function. No I/O, no surface inspection.
    const configString = entry.config_string;
    const legacyId = entry.legacy_config_id;
    const identifier = nonEmptyString(configString)
        ? configString
        : nonEmptyString(legacyId)
            ? `legacy:${legacyId}`
            : '<unknown>';

    const status = entry.status;
    const channel = entry.channel;
    const buildMatrix = entry.webflash_build_matrix === true;

    const shapeIssues = [];

    if (!nonEmptyString(status)) {
        shapeIssues.push("entry has no 'status'");
    }

    if (buildMatrix) {
        const missing = missingImportFields(entry);
        if (missing.length > 0) {
            shapeIssues.push(
                `webflash_build_matrix=true requires ${REQUIRED_IMPORT_FIELDS.join(', ')}; missing: ${missing.join(', ')}`
            );
        }
        if (ELIGIBLE_STATUSES.has(status) && nonEmptyString(channel)) {
            const allowed = STATUS_CHANNEL_MAP[status];
            if (allowed && !allowed.includes(channel)) {
                shapeIssues.push(
                    `status='${status}' requires channel∈[${allowed.join(', ')}], got '${channel}'`
                );
            }
        }
    }

    const blockedHits = blockedTokensInEntry(entry);
    if (blockedHits.length > 0) {
        shapeIssues.push(
            `blocked_modules ${blockedHits.join(', ')} appear as segment(s) of artifact_name/config_string`
        );
    }

    // --- import-eligibility -----------------------------------------------
    let importEligible = false;
    const importReasons = [];
    const previewImportFlag = Boolean(
        entry.webflash_import_eligibility &&
            entry.webflash_import_eligibility.eligible === true
    );
    if (ELIGIBLE_STATUSES.has(status) && buildMatrix) {
        // Committed WebFlash build-matrix lane: production/preview status with a
        // committed upstream build row (webflash_build_matrix=true + wrapper).
        const missing = missingImportFields(entry);
        if (missing.length > 0) {
            importReasons.push(`missing required import fields: ${missing.join(', ')}`);
        } else {
            const allowed = STATUS_CHANNEL_MAP[status] || [];
            if (!allowed.includes(channel)) {
                importReasons.push(
                    `channel='${channel}' is not allowed for status='${status}' (expected one of ${allowed.join(', ')})`
                );
            } else if (blockedHits.length > 0) {
                importReasons.push(
                    `blocked_modules ${blockedHits.join(', ')} appear in artifact_name/config_string`
                );
            } else {
                importEligible = true;
                importReasons.push('all import-eligibility criteria satisfied (build-matrix lane)');
            }
        }
    } else if (previewImportFlag) {
        // WEBFLASH-RELAY-001 manual-preview lane: upstream #711 set
        // webflash_import_eligibility.eligible=true while catalog status stays
        // hardware-pending + webflash_build_matrix=false (no committed upstream
        // build row). Requires the manual-preview import fields (no
        // webflash_wrapper), a preview channel, and absent blocked tokens.
        const missing = PREVIEW_IMPORT_FIELDS.filter(k => !nonEmptyString(entry[k]));
        if (missing.length > 0) {
            importReasons.push(
                `webflash_import_eligibility.eligible=true but missing manual-preview import fields: ${missing.join(', ')}`
            );
        } else if (channel !== PREVIEW_STATUS) {
            importReasons.push(
                `manual-preview lane requires channel='${PREVIEW_STATUS}', got '${channel || '<missing>'}'`
            );
        } else if (blockedHits.length > 0) {
            importReasons.push(
                `blocked_modules ${blockedHits.join(', ')} appear in artifact_name/config_string`
            );
        } else {
            importEligible = true;
            importReasons.push(
                'webflash_import_eligibility.eligible=true (manual-preview lane; status stays hardware-pending)'
            );
        }
    } else if (!ELIGIBLE_STATUSES.has(status)) {
        importReasons.push(
            `status='${status || '<missing>'}' is not in {${[...ELIGIBLE_STATUSES].join(', ')}} and webflash_import_eligibility.eligible!=true`
        );
    } else if (!buildMatrix) {
        importReasons.push(
            'webflash_build_matrix is not true and webflash_import_eligibility.eligible!=true'
        );
    }

    // --- manifest-eligibility (catalog level only) ------------------------
    const manifestReasonsCatalog = [];
    let manifestEligibleByCatalog = importEligible;
    if (!importEligible) {
        manifestReasonsCatalog.push('not import-eligible at catalog level');
    } else {
        manifestReasonsCatalog.push('catalog-level criteria satisfied; surface presence checked separately');
    }

    // --- REQUIRED_CONFIGS-eligibility (catalog level only) ----------------
    const requiredReasonsCatalog = [];
    let requiredEligibleByCatalog = false;
    if (status !== PRODUCTION_STATUS) {
        requiredReasonsCatalog.push(
            `REQUIRED_CONFIGS is production-only; status='${status || '<missing>'}'`
        );
    } else if (nonEmptyString(channel) && channel !== REQUIRED_CONFIGS_CHANNEL) {
        requiredReasonsCatalog.push(
            `REQUIRED_CONFIGS requires channel='${REQUIRED_CONFIGS_CHANNEL}'; got '${channel}'`
        );
    } else if (!importEligible) {
        requiredReasonsCatalog.push(
            'production entry is not import-eligible at catalog level'
        );
    } else {
        requiredEligibleByCatalog = true;
        requiredReasonsCatalog.push(
            'catalog-level criteria satisfied; surface presence checked separately'
        );
    }

    // --- kit-eligibility (catalog level only) -----------------------------
    const kitReasonsCatalog = [];
    let kitEligibleByCatalog = importEligible;
    if (!importEligible) {
        kitReasonsCatalog.push('not import-eligible at catalog level');
    } else {
        kitReasonsCatalog.push(
            'catalog-level criteria satisfied; kit exposure is a separate UX decision'
        );
    }

    return {
        identifier,
        config_string: nonEmptyString(configString) ? configString : null,
        legacy_config_id: nonEmptyString(legacyId) ? legacyId : null,
        status: nonEmptyString(status) ? status : null,
        channel: nonEmptyString(channel) ? channel : null,
        version: nonEmptyString(entry.version) ? entry.version : null,
        artifact_name: nonEmptyString(entry.artifact_name) ? entry.artifact_name : null,
        webflash_build_matrix: buildMatrix,
        blocked_modules: Array.isArray(entry.blocked_modules)
            ? [...entry.blocked_modules]
            : [],
        shape_issues: shapeIssues,
        catalog_eligibility: {
            import: { eligible: importEligible, reasons: importReasons },
            manifest: {
                eligible: manifestEligibleByCatalog,
                reasons: manifestReasonsCatalog
            },
            required_configs: {
                eligible: requiredEligibleByCatalog,
                reasons: requiredReasonsCatalog
            },
            kit: { eligible: kitEligibleByCatalog, reasons: kitReasonsCatalog }
        }
    };
}

// --- Surface overlay -------------------------------------------------------

export function evaluateEntryAgainstSurfaces(catalogReport, surfaces) {
    const cs = catalogReport.config_string;
    const surfacePresence = {
        in_sources: false,
        in_manifest: false,
        in_required_configs: false,
        in_kits: false,
        bin_on_disk: false,
        sidecar_on_disk: false
    };

    if (nonEmptyString(cs)) {
        surfacePresence.in_sources = (surfaces.sources?.sources || []).some(
            s => s.config_string === cs
        );
        surfacePresence.in_manifest = (surfaces.manifest?.builds || []).some(
            b => b.config_string === cs
        );
        surfacePresence.in_required_configs = (
            surfaces.requiredConfigs || []
        ).includes(cs);
        surfacePresence.in_kits = (surfaces.kits?.kits || []).some(
            k => k.firmware_config_string === cs
        );

        if (catalogReport.artifact_name) {
            surfacePresence.bin_on_disk = (surfaces.configurationsBins || []).includes(
                catalogReport.artifact_name
            );
            const sidecar = catalogReport.artifact_name.replace(/\.bin$/, '.meta.json');
            surfacePresence.sidecar_on_disk = (
                surfaces.configurationsSidecars || []
            ).includes(sidecar);
        }
    }

    // Manifest layer: catalog-eligible AND every concrete surface is present.
    const manifestReasons = [...catalogReport.catalog_eligibility.manifest.reasons];
    let manifestEligible = catalogReport.catalog_eligibility.manifest.eligible;
    if (manifestEligible) {
        if (!surfacePresence.in_sources) {
            manifestReasons.push('firmware/sources.json has no matching source entry');
            manifestEligible = false;
        }
        if (!surfacePresence.bin_on_disk) {
            manifestReasons.push(
                'firmware/configurations/<artifact_name> is not on disk'
            );
            manifestEligible = false;
        }
        if (!surfacePresence.sidecar_on_disk) {
            manifestReasons.push(
                'firmware/configurations/<artifact_name>.meta.json sidecar is not on disk'
            );
            manifestEligible = false;
        }
        if (!surfacePresence.in_manifest) {
            manifestReasons.push('manifest.json has no build with this config_string');
            manifestEligible = false;
        }
        if (manifestEligible) {
            manifestReasons.push('all manifest-eligibility surfaces present');
        }
    }

    // REQUIRED_CONFIGS layer: catalog-eligible AND manifest build present.
    const requiredReasons = [
        ...catalogReport.catalog_eligibility.required_configs.reasons
    ];
    let requiredEligible = catalogReport.catalog_eligibility.required_configs.eligible;
    if (requiredEligible && !surfacePresence.in_manifest) {
        requiredReasons.push('manifest.json has no build with this config_string yet');
        requiredEligible = false;
    }

    // Kit layer: catalog-eligible AND manifest build present.
    const kitReasons = [...catalogReport.catalog_eligibility.kit.reasons];
    let kitEligible = catalogReport.catalog_eligibility.kit.eligible;
    if (kitEligible && !surfacePresence.in_manifest) {
        kitReasons.push('manifest.json has no build with this config_string yet');
        kitEligible = false;
    }

    return {
        ...catalogReport,
        surface_presence: surfacePresence,
        effective_eligibility: {
            import: catalogReport.catalog_eligibility.import,
            manifest: { eligible: manifestEligible, reasons: manifestReasons },
            required_configs: {
                eligible: requiredEligible,
                reasons: requiredReasons
            },
            kit: { eligible: kitEligible, reasons: kitReasons }
        }
    };
}

// --- Cross-surface integrity -----------------------------------------------

function buildCatalogIndex(catalog) {
    const byConfigString = new Map();
    const legacyIds = new Set();
    for (const product of catalog?.products || []) {
        if (nonEmptyString(product.config_string)) {
            byConfigString.set(product.config_string, product);
        }
        if (
            product.status === 'legacy-compatible' &&
            nonEmptyString(product.legacy_config_id)
        ) {
            legacyIds.add(product.legacy_config_id);
        }
    }
    return { byConfigString, legacyIds };
}

export function crossCheckSurfaces({
    catalog,
    sources = { sources: [] },
    manifest = { builds: [] },
    kits = { kits: [] },
    requiredConfigs = []
}) {
    const findings = [];
    const { byConfigString, legacyIds } = buildCatalogIndex(catalog);

    const pushFinding = (surface, identifier, message) => {
        findings.push({ severity: 'error', surface, identifier, message });
    };

    // firmware/sources.json
    for (const source of sources?.sources || []) {
        const cs = source.config_string;
        if (cs === RESCUE_CONFIG_STRING) continue;
        if (containsSegment(cs, FANTRIAC_TOKEN)) {
            pushFinding(
                'firmware/sources.json',
                cs,
                'source config_string contains blocked FanTRIAC token'
            );
        }
        if (legacyIds.has(cs)) {
            pushFinding(
                'firmware/sources.json',
                cs,
                'source config_string matches a legacy_config_id from a legacy-compatible catalog entry'
            );
        }
        const entry = byConfigString.get(cs);
        if (!entry) {
            pushFinding(
                'firmware/sources.json',
                cs,
                'config_string is not in the upstream product catalog'
            );
            continue;
        }
        if (!isWebflashImportEligible(entry)) {
            pushFinding(
                'firmware/sources.json',
                cs,
                `upstream status='${entry.status}' is not import-eligible (must be production|preview, or carry webflash_import_eligibility.eligible=true)`
            );
        }
    }

    // manifest.json
    for (const build of manifest?.builds || []) {
        const cs = build.config_string;
        if (cs === RESCUE_CONFIG_STRING) continue;
        if (containsSegment(cs, FANTRIAC_TOKEN)) {
            pushFinding(
                'manifest.json',
                cs,
                'manifest build config_string contains blocked FanTRIAC token'
            );
        }
        if (legacyIds.has(cs)) {
            pushFinding(
                'manifest.json',
                cs,
                'manifest build config_string matches a legacy_config_id'
            );
        }
        const entry = byConfigString.get(cs);
        if (!entry) {
            pushFinding(
                'manifest.json',
                cs,
                'config_string is not in the upstream product catalog'
            );
            continue;
        }
        if (!isWebflashImportEligible(entry)) {
            pushFinding(
                'manifest.json',
                cs,
                `upstream status='${entry.status}' is not manifest-eligible (must be production|preview, or carry webflash_import_eligibility.eligible=true)`
            );
        }
    }

    // REQUIRED_CONFIGS
    for (const cs of requiredConfigs || []) {
        if (cs === RESCUE_CONFIG_STRING) continue;
        if (containsSegment(cs, FANTRIAC_TOKEN)) {
            pushFinding(
                'REQUIRED_CONFIGS',
                cs,
                'REQUIRED_CONFIGS entry contains blocked FanTRIAC token'
            );
        }
        if (legacyIds.has(cs)) {
            pushFinding(
                'REQUIRED_CONFIGS',
                cs,
                'REQUIRED_CONFIGS entry matches a legacy_config_id'
            );
        }
        const entry = byConfigString.get(cs);
        if (!entry) {
            pushFinding(
                'REQUIRED_CONFIGS',
                cs,
                'config_string is not in the upstream product catalog'
            );
            continue;
        }
        if (entry.status !== PRODUCTION_STATUS) {
            pushFinding(
                'REQUIRED_CONFIGS',
                cs,
                `REQUIRED_CONFIGS is production-only; upstream status='${entry.status}'`
            );
        } else if (
            nonEmptyString(entry.channel) &&
            entry.channel !== REQUIRED_CONFIGS_CHANNEL
        ) {
            pushFinding(
                'REQUIRED_CONFIGS',
                cs,
                `REQUIRED_CONFIGS requires channel='${REQUIRED_CONFIGS_CHANNEL}'; upstream channel='${entry.channel}'`
            );
        }
    }

    // scripts/data/kits.json
    for (const kit of kits?.kits || []) {
        const cs = kit.firmware_config_string;
        const id = `kit ${kit.sku || cs || '<unknown>'}`;
        if (cs === RESCUE_CONFIG_STRING) continue;
        if (containsSegment(cs, FANTRIAC_TOKEN)) {
            pushFinding(
                'scripts/data/kits.json',
                id,
                'kit firmware_config_string contains blocked FanTRIAC token'
            );
        }
        if (legacyIds.has(cs)) {
            pushFinding(
                'scripts/data/kits.json',
                id,
                'kit firmware_config_string matches a legacy_config_id'
            );
        }
        const entry = byConfigString.get(cs);
        if (!entry) {
            pushFinding(
                'scripts/data/kits.json',
                id,
                `firmware_config_string '${cs}' is not in the upstream product catalog`
            );
            continue;
        }
        if (!isWebflashImportEligible(entry)) {
            pushFinding(
                'scripts/data/kits.json',
                id,
                `firmware_config_string '${cs}' has upstream status='${entry.status}' (must be production|preview, or carry webflash_import_eligibility.eligible=true)`
            );
        }
    }

    return findings;
}

// --- Top-level validation --------------------------------------------------

export function runValidation({
    catalog,
    sources = { sources: [] },
    manifest = { builds: [] },
    kits = { kits: [] },
    requiredConfigs = [],
    configurationsBins = [],
    configurationsSidecars = [],
    filterConfig = null
}) {
    const surfaces = {
        sources,
        manifest,
        kits,
        requiredConfigs,
        configurationsBins,
        configurationsSidecars
    };

    const entries = [];
    for (const product of catalog?.products || []) {
        const catalogReport = evaluateEntryCatalogShape(product);
        if (filterConfig) {
            const matchesConfigString = catalogReport.config_string === filterConfig;
            const matchesLegacy =
                catalogReport.legacy_config_id &&
                (catalogReport.legacy_config_id === filterConfig ||
                    `legacy:${catalogReport.legacy_config_id}` === filterConfig);
            if (!matchesConfigString && !matchesLegacy) continue;
        }
        entries.push(evaluateEntryAgainstSurfaces(catalogReport, surfaces));
    }

    // When filtering to a single entry the cross-surface report can be
    // misleading (it scans the whole repo against the whole catalog); skip it.
    const crossSurface = filterConfig
        ? []
        : crossCheckSurfaces({ catalog, sources, manifest, kits, requiredConfigs });

    const counts = {
        total: entries.length,
        import_eligible: 0,
        manifest_eligible: 0,
        required_configs_eligible: 0,
        kit_eligible: 0,
        shape_violations: 0
    };
    for (const e of entries) {
        if (e.shape_issues.length > 0) counts.shape_violations += 1;
        if (e.effective_eligibility.import.eligible) counts.import_eligible += 1;
        if (e.effective_eligibility.manifest.eligible) counts.manifest_eligible += 1;
        if (e.effective_eligibility.required_configs.eligible)
            counts.required_configs_eligible += 1;
        if (e.effective_eligibility.kit.eligible) counts.kit_eligible += 1;
    }

    const ok = crossSurface.length === 0 && counts.shape_violations === 0;

    return {
        summary: {
            ...counts,
            cross_surface_findings: crossSurface.length,
            filter_config: filterConfig || null,
            ok
        },
        entries,
        cross_surface: crossSurface,
        ok
    };
}

// --- Formatters ------------------------------------------------------------

function formatBool(b) {
    return b ? '✅' : '❌';
}

export function formatMarkdown(report) {
    const lines = [];
    lines.push('# Product import readiness report');
    lines.push('');
    lines.push(`- entries: ${report.summary.total}`);
    lines.push(`- import-eligible: ${report.summary.import_eligible}`);
    lines.push(`- manifest-eligible: ${report.summary.manifest_eligible}`);
    lines.push(
        `- REQUIRED_CONFIGS-eligible: ${report.summary.required_configs_eligible}`
    );
    lines.push(`- kit-eligible: ${report.summary.kit_eligible}`);
    lines.push(`- shape violations: ${report.summary.shape_violations}`);
    lines.push(
        `- cross-surface findings: ${report.summary.cross_surface_findings}`
    );
    if (report.summary.filter_config) {
        lines.push(`- filter: \`${report.summary.filter_config}\``);
    }
    lines.push('');
    lines.push(`Overall: ${report.ok ? '✅ PASS' : '❌ FAIL'}`);
    lines.push('');

    lines.push('## Readiness table');
    lines.push('');
    lines.push(
        '| Identifier | Status | Channel | Import | Manifest | REQUIRED_CONFIGS | Kit | Surfaces present |'
    );
    lines.push(
        '|---|---|---|:---:|:---:|:---:|:---:|---|'
    );
    for (const e of report.entries) {
        const id = e.config_string || (e.legacy_config_id ? `legacy:${e.legacy_config_id}` : '<unknown>');
        const status = e.status || '—';
        const channel = e.channel || '—';
        const im = formatBool(e.effective_eligibility.import.eligible);
        const mn = formatBool(e.effective_eligibility.manifest.eligible);
        const rc = formatBool(e.effective_eligibility.required_configs.eligible);
        const kt = formatBool(e.effective_eligibility.kit.eligible);
        const p = e.surface_presence;
        const presenceBits = [];
        if (p.in_sources) presenceBits.push('sources');
        if (p.in_manifest) presenceBits.push('manifest');
        if (p.in_required_configs) presenceBits.push('REQUIRED_CONFIGS');
        if (p.in_kits) presenceBits.push('kits');
        if (p.bin_on_disk) presenceBits.push('.bin');
        if (p.sidecar_on_disk) presenceBits.push('.meta.json');
        const presence = presenceBits.length > 0 ? presenceBits.join(', ') : '—';
        lines.push(
            `| \`${id}\` | ${status} | ${channel} | ${im} | ${mn} | ${rc} | ${kt} | ${presence} |`
        );
    }
    lines.push('');

    lines.push('## Per-entry detail');
    for (const e of report.entries) {
        const id = e.config_string || (e.legacy_config_id ? `legacy:${e.legacy_config_id}` : '<unknown>');
        lines.push('');
        lines.push(`### \`${id}\``);
        lines.push('');
        lines.push(`- status: \`${e.status || '—'}\``);
        lines.push(`- channel: \`${e.channel || '—'}\``);
        lines.push(`- version: \`${e.version || '—'}\``);
        lines.push(`- artifact_name: \`${e.artifact_name || '—'}\``);
        lines.push(`- webflash_build_matrix: ${e.webflash_build_matrix}`);
        lines.push(
            `- blocked_modules: ${e.blocked_modules.length ? e.blocked_modules.map(t => `\`${t}\``).join(', ') : '—'}`
        );
        if (e.shape_issues.length > 0) {
            lines.push('- shape issues:');
            for (const m of e.shape_issues) lines.push(`  - ${m}`);
        }
        const elig = e.effective_eligibility;
        lines.push(`- import-eligible: ${formatBool(elig.import.eligible)}`);
        for (const r of elig.import.reasons) lines.push(`  - ${r}`);
        lines.push(`- manifest-eligible: ${formatBool(elig.manifest.eligible)}`);
        for (const r of elig.manifest.reasons) lines.push(`  - ${r}`);
        lines.push(
            `- REQUIRED_CONFIGS-eligible: ${formatBool(elig.required_configs.eligible)}`
        );
        for (const r of elig.required_configs.reasons) lines.push(`  - ${r}`);
        lines.push(`- kit-eligible: ${formatBool(elig.kit.eligible)}`);
        for (const r of elig.kit.reasons) lines.push(`  - ${r}`);
        const sp = e.surface_presence;
        lines.push('- surface presence:');
        lines.push(`  - firmware/sources.json: ${formatBool(sp.in_sources)}`);
        lines.push(`  - manifest.json: ${formatBool(sp.in_manifest)}`);
        lines.push(`  - REQUIRED_CONFIGS: ${formatBool(sp.in_required_configs)}`);
        lines.push(`  - scripts/data/kits.json: ${formatBool(sp.in_kits)}`);
        lines.push(`  - on-disk .bin: ${formatBool(sp.bin_on_disk)}`);
        lines.push(`  - on-disk .meta.json: ${formatBool(sp.sidecar_on_disk)}`);
    }
    lines.push('');

    lines.push('## Cross-surface findings');
    lines.push('');
    if (report.cross_surface.length === 0) {
        lines.push('No cross-surface findings.');
    } else {
        lines.push('| Surface | Identifier | Severity | Message |');
        lines.push('|---|---|---|---|');
        for (const f of report.cross_surface) {
            lines.push(
                `| ${f.surface} | \`${f.identifier}\` | ${f.severity} | ${f.message} |`
            );
        }
    }
    lines.push('');
    return lines.join('\n');
}

export function formatJson(report) {
    return JSON.stringify(report, null, 2);
}

// --- CLI ------------------------------------------------------------------

function parseArgs(argv) {
    const args = {
        catalog: DEFAULT_CATALOG_PATH,
        config: null,
        format: 'markdown',
        sources: DEFAULT_SOURCES_PATH,
        manifest: DEFAULT_MANIFEST_PATH,
        kits: DEFAULT_KITS_PATH,
        workflow: DEFAULT_WORKFLOW_PATH,
        configurationsDir: DEFAULT_CONFIGURATIONS_DIR,
        help: false
    };
    for (let i = 0; i < argv.length; i++) {
        const tok = argv[i];
        if (tok === '--catalog') args.catalog = argv[++i];
        else if (tok === '--config') args.config = argv[++i];
        else if (tok === '--format') args.format = argv[++i];
        else if (tok === '--sources') args.sources = argv[++i];
        else if (tok === '--manifest') args.manifest = argv[++i];
        else if (tok === '--kits') args.kits = argv[++i];
        else if (tok === '--workflow') args.workflow = argv[++i];
        else if (tok === '--configurations-dir') args.configurationsDir = argv[++i];
        else if (tok === '--help' || tok === '-h') args.help = true;
        else throw new Error(`Unknown argument: ${tok}`);
    }
    if (args.format !== 'markdown' && args.format !== 'json') {
        throw new Error(`Unknown --format value: ${args.format} (expected 'markdown' or 'json')`);
    }
    return args;
}

const HELP_TEXT = `Usage: node scripts/validate-product-import-readiness.js [options]

Options:
  --catalog <path>           Path to product-catalog.json
                             (default: __tests__/fixtures/esphome-product-catalog.json)
  --config <config_string>   Filter the report to a single catalog entry
  --format markdown|json     Output format (default: markdown)
  --sources <path>           Path to firmware/sources.json
  --manifest <path>          Path to manifest.json
  --kits <path>              Path to scripts/data/kits.json
  --workflow <path>          Path to .github/workflows/firmware-publish.yml
  --configurations-dir <path>
                             Path to firmware/configurations/

Exit codes:
  0  every entry classified consistently, no cross-surface findings
  1  at least one eligibility / cross-surface violation
  2  usage error or file-load failure
`;

export async function cliMain(argv) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (err) {
        process.stderr.write(`${err.message}\n\n${HELP_TEXT}`);
        return 2;
    }
    if (args.help) {
        process.stdout.write(HELP_TEXT);
        return 0;
    }

    let catalog;
    try {
        catalog = loadCatalog(args.catalog);
    } catch (err) {
        process.stderr.write(`Failed to load catalog: ${err.message}\n`);
        return 2;
    }

    let sources, manifest, kits, requiredConfigs;
    let configurationsBins = [];
    let configurationsSidecars = [];
    try {
        sources = fs.existsSync(args.sources) ? loadSources(args.sources) : { sources: [] };
        manifest = fs.existsSync(args.manifest) ? loadManifest(args.manifest) : { builds: [] };
        kits = fs.existsSync(args.kits) ? loadKits(args.kits) : { kits: [] };
        requiredConfigs = fs.existsSync(args.workflow)
            ? parseRequiredConfigsFromWorkflow(args.workflow)
            : [];
        configurationsBins = listConfigurationBins(args.configurationsDir);
        configurationsSidecars = listConfigurationSidecars(args.configurationsDir);
    } catch (err) {
        process.stderr.write(`Failed to load active surfaces: ${err.message}\n`);
        return 2;
    }

    const report = runValidation({
        catalog,
        sources,
        manifest,
        kits,
        requiredConfigs,
        configurationsBins,
        configurationsSidecars,
        filterConfig: args.config
    });

    const out = args.format === 'json' ? formatJson(report) : formatMarkdown(report);
    process.stdout.write(out + (out.endsWith('\n') ? '' : '\n'));
    return report.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    cliMain(process.argv.slice(2)).then(code => process.exit(code));
}
