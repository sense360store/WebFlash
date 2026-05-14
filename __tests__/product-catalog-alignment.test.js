import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// WF-PRODUCT-001 — product-catalog alignment guard.
//
// Verifies every active WebFlash firmware surface (sources.json,
// manifest.json, firmware-*.json, the firmware-publish workflow's
// REQUIRED_CONFIGS allowlist, and scripts/data/kits.json) is aligned with
// the upstream esphome-public product lifecycle catalog. WebFlash must not
// import or ship a config that the upstream catalog has marked blocked,
// legacy-compatible, deprecated, removed, hardware-pending, or compile-only.
//
// Catalog source-of-truth: sense360store/esphome-public/main/config/product-catalog.json
// CI default: load the vendored fixture at __tests__/fixtures/esphome-product-catalog.json.
// To validate against a freshly downloaded catalog instead, set
// PRODUCT_CATALOG_PATH to its absolute path before running the test.
//
// Rescue is a WebFlash-owned local recovery build and is intentionally not
// represented in the upstream catalog. Every check below exempts it
// explicitly via the RESCUE_CONFIG_STRING constant.

const repoRoot = process.cwd();
const sourcesPath = path.join(repoRoot, 'firmware', 'sources.json');
const manifestPath = path.join(repoRoot, 'manifest.json');
const kitsPath = path.join(repoRoot, 'scripts', 'data', 'kits.json');
const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    'firmware-publish.yml'
);
const fixturePath = path.join(
    repoRoot,
    '__tests__',
    'fixtures',
    'esphome-product-catalog.json'
);

const RESCUE_CONFIG_STRING = 'Rescue';

// Statuses considered eligible for general WebFlash exposure (manifests,
// kits). REQUIRED_CONFIGS and firmware/sources.json are stricter and only
// allow `production`.
const ELIGIBLE_STATUSES = new Set(['production', 'preview']);
const PRODUCTION_STATUS = 'production';

// FanTRIAC is blocked upstream pending S360-320 hardware verification (HW-005).
// While that status holds, it must not appear in any active WebFlash surface.
// Tracked here as a named constant so failure messages stay readable.
const FANTRIAC_CONFIG_STRING = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';

// WF-PRODUCT-003 — upstream promoted an LED-bearing sibling product
// (Ceiling-POE-VentIQ-RoomIQ-LED) to status=preview, channel=preview,
// version=1.0.0, webflash_build_matrix=true. The fixture mirrors that real
// upstream row so the preview-eligibility branch is exercised against real
// data instead of a synthetic placeholder. WebFlash has NOT imported,
// signed, manifested, or surfaced this preview — the assertions below pin
// that contract: the LED preview is recognised by the catalog fixture and
// would be eligible for manifests/kits if explicitly added later, but it
// must not appear in any active WebFlash surface today.
const LED_PREVIEW_CONFIG_STRING = 'Ceiling-POE-VentIQ-RoomIQ-LED';
const LED_PREVIEW_ARTIFACT_NAME =
    'Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin';

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadProductCatalog() {
    const overridePath = process.env.PRODUCT_CATALOG_PATH;
    if (overridePath && overridePath.length > 0) {
        if (!fs.existsSync(overridePath)) {
            throw new Error(
                `PRODUCT_CATALOG_PATH is set to "${overridePath}" but no file ` +
                    'exists at that path. Either unset the variable to fall back ' +
                    'to the fixture or point it at a downloaded copy of ' +
                    'sense360store/esphome-public/main/config/product-catalog.json.'
            );
        }
        return loadJson(overridePath);
    }
    return loadJson(fixturePath);
}

function buildCatalogIndex(catalog) {
    // Map config_string -> product entry. Legacy-compatible entries in the
    // upstream catalog have no config_string (they're identified by
    // legacy_config_id only), so they are intentionally skipped here; the
    // legacy-exposure guard below uses a separate index.
    const index = new Map();
    for (const product of catalog.products || []) {
        if (typeof product.config_string === 'string' && product.config_string.length > 0) {
            index.set(product.config_string, product);
        }
    }
    return index;
}

function buildLegacyIdIndex(catalog) {
    // Set of every legacy_config_id used by legacy-compatible upstream
    // entries, so we can assert none of them have leaked into active
    // WebFlash data surfaces.
    const ids = new Set();
    for (const product of catalog.products || []) {
        if (
            product.status === 'legacy-compatible' &&
            typeof product.legacy_config_id === 'string' &&
            product.legacy_config_id.length > 0
        ) {
            ids.add(product.legacy_config_id);
        }
    }
    return ids;
}

function listPerBuildManifests() {
    return fs
        .readdirSync(repoRoot)
        .filter(name => /^firmware-\d+\.json$/.test(name))
        .sort((a, b) => {
            const ai = parseInt(a.match(/(\d+)/)[1], 10);
            const bi = parseInt(b.match(/(\d+)/)[1], 10);
            return ai - bi;
        });
}

function parseRequiredConfigsFromWorkflow() {
    // Mirrors the regex pulled by __tests__/manifest-health.test.js. Kept
    // local rather than extracted into a shared util because that's a
    // refactor outside the scope of WF-PRODUCT-001.
    const yaml = fs.readFileSync(workflowPath, 'utf8');
    const arrayBlock = yaml.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
    if (!arrayBlock) {
        throw new Error(
            'Could not locate REQUIRED_CONFIGS=( ... ) in ' +
                '.github/workflows/firmware-publish.yml. The workflow shape ' +
                'changed; update __tests__/product-catalog-alignment.test.js to match.'
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
                'changed; update __tests__/product-catalog-alignment.test.js to match.'
        );
    }
    return entries;
}

function containsSegment(configString, token) {
    if (typeof configString !== 'string' || configString.length === 0) {
        return false;
    }
    return configString.split('-').includes(token);
}

const catalog = loadProductCatalog();
const catalogIndex = buildCatalogIndex(catalog);
const legacyIds = buildLegacyIdIndex(catalog);
const sources = loadJson(sourcesPath);
const manifest = loadJson(manifestPath);
const kits = loadJson(kitsPath);

describe('product catalog fixture shape', () => {
    test('schema_version is 1', () => {
        expect(catalog.schema_version).toBe(1);
    });

    test('lifecycle_statuses includes the statuses WebFlash branches on', () => {
        expect(Array.isArray(catalog.lifecycle_statuses)).toBe(true);
        for (const required of [
            'production',
            'preview',
            'blocked',
            'legacy-compatible'
        ]) {
            expect(catalog.lifecycle_statuses).toContain(required);
        }
    });

    test('products is a non-empty array', () => {
        expect(Array.isArray(catalog.products)).toBe(true);
        expect(catalog.products.length).toBeGreaterThan(0);
    });

    test('Release-One Ceiling-POE-VentIQ-RoomIQ is present and production', () => {
        const entry = catalogIndex.get('Ceiling-POE-VentIQ-RoomIQ');
        if (!entry) {
            throw new Error(
                'Catalog does not contain Ceiling-POE-VentIQ-RoomIQ. If you ' +
                    'are running with PRODUCT_CATALOG_PATH pointed at a real ' +
                    'upstream catalog, upstream has removed Release-One and ' +
                    'WebFlash must follow. Otherwise refresh the fixture from ' +
                    'sense360store/esphome-public/main/config/product-catalog.json.'
            );
        }
        expect(entry.status).toBe('production');
    });

    test('FanTRIAC entry is present and blocked', () => {
        const entry = catalogIndex.get(FANTRIAC_CONFIG_STRING);
        if (!entry) {
            throw new Error(
                `Catalog does not contain ${FANTRIAC_CONFIG_STRING}. ` +
                    'Upstream is the source of truth for this status; if it ' +
                    'has been removed entirely, drop the FanTRIAC guards below ' +
                    'and refresh the fixture.'
            );
        }
        expect(entry.status).toBe('blocked');
    });
});

describe('firmware/sources.json ↔ product catalog', () => {
    test('every source config_string is catalog-known and production', () => {
        for (const source of sources.sources || []) {
            const entry = catalogIndex.get(source.config_string);
            if (!entry) {
                throw new Error(
                    `firmware/sources.json declares config_string ` +
                        `"${source.config_string}" but it is not in the upstream ` +
                        'product catalog. Either remove the source or wait for ' +
                        'upstream to add the product before importing.'
                );
            }
            if (entry.status !== PRODUCTION_STATUS) {
                throw new Error(
                    `firmware/sources.json source "${source.config_string}" has ` +
                        `upstream status "${entry.status}". WebFlash only imports ` +
                        `from production-status catalog entries. Remove the source ` +
                        'or wait for upstream to promote it to production.'
                );
            }
        }
    });

    test('source asset_name matches catalog artifact_name when both are defined', () => {
        for (const source of sources.sources || []) {
            const entry = catalogIndex.get(source.config_string);
            if (!entry) {
                continue; // covered by the previous test's failure
            }
            if (typeof entry.artifact_name === 'string' && entry.artifact_name.length > 0) {
                if (source.asset_name !== entry.artifact_name) {
                    throw new Error(
                        `firmware/sources.json asset_name "${source.asset_name}" ` +
                            `does not match upstream catalog artifact_name ` +
                            `"${entry.artifact_name}" for config_string ` +
                            `"${source.config_string}".`
                    );
                }
            }
        }
    });

    test('no source declares the blocked FanTRIAC config', () => {
        for (const source of sources.sources || []) {
            expect(source.config_string).not.toBe(FANTRIAC_CONFIG_STRING);
            // Defense-in-depth segment check, mirroring the manifest-health guard.
            expect(containsSegment(source.config_string, 'FanTRIAC')).toBe(false);
        }
    });
});

describe('manifest.json ↔ product catalog', () => {
    test('every non-Rescue manifest build is catalog-known and eligible', () => {
        for (const build of manifest.builds || []) {
            if (build.config_string === RESCUE_CONFIG_STRING) {
                continue;
            }
            const entry = catalogIndex.get(build.config_string);
            if (!entry) {
                throw new Error(
                    `manifest.json build "${build.config_string}" is not in the ` +
                        'upstream product catalog. Either remove the build or ' +
                        'wait for upstream to add the product.'
                );
            }
            if (!ELIGIBLE_STATUSES.has(entry.status)) {
                throw new Error(
                    `manifest.json build "${build.config_string}" has upstream ` +
                        `status "${entry.status}". WebFlash only ships builds in ` +
                        `statuses [${[...ELIGIBLE_STATUSES].join(', ')}].`
                );
            }
        }
    });

    test('manifest build version matches catalog version where defined', () => {
        for (const build of manifest.builds || []) {
            if (build.config_string === RESCUE_CONFIG_STRING) {
                continue;
            }
            const entry = catalogIndex.get(build.config_string);
            if (!entry || typeof entry.version !== 'string') {
                continue;
            }
            if (build.version !== entry.version) {
                throw new Error(
                    `manifest.json build "${build.config_string}" has version ` +
                        `"${build.version}" but upstream catalog declares version ` +
                        `"${entry.version}". Regenerate after the next import.`
                );
            }
        }
    });

    test('no manifest build config_string carries the blocked FanTRIAC segment', () => {
        for (const build of manifest.builds || []) {
            if (containsSegment(build.config_string, 'FanTRIAC')) {
                throw new Error(
                    `manifest.json build "${build.config_string}" contains the ` +
                        'FanTRIAC token while upstream catalog status for ' +
                        `${FANTRIAC_CONFIG_STRING} is blocked. The build must be ` +
                        'removed until upstream promotes FanTRIAC to a ' +
                        'WebFlash-eligible status.'
                );
            }
        }
    });
});

describe('firmware-*.json ↔ product catalog (via manifest.json)', () => {
    // firmware-N.json files only carry chip/parts metadata, not the
    // config_string. We align them transitively: each per-build manifest's
    // part path must belong to a manifest.json build whose config_string is
    // already catalog-eligible (asserted in the manifest.json block above).
    // The check here makes the per-build manifest coverage explicit so a
    // future failure mode (a firmware-N.json referencing a part path that
    // never appears in manifest.json) surfaces against the catalog guard
    // rather than only against the manifest-health guard.
    test('every firmware-N.json part path maps to a manifest.json build', () => {
        const perBuild = listPerBuildManifests();
        expect(perBuild.length).toBeGreaterThan(0);

        const manifestPathToConfig = new Map();
        for (const build of manifest.builds || []) {
            for (const part of build.parts || []) {
                manifestPathToConfig.set(part.path, build.config_string);
            }
        }

        for (const name of perBuild) {
            const data = loadJson(path.join(repoRoot, name));
            for (const build of data.builds || []) {
                for (const part of build.parts || []) {
                    if (!manifestPathToConfig.has(part.path)) {
                        throw new Error(
                            `${name} references part path "${part.path}" that ` +
                                'is not present in manifest.json. The per-build ' +
                                'manifest is stale; regenerate via ' +
                                '`python3 scripts/gen-manifests.py --summary`.'
                        );
                    }
                }
            }
        }
    });
});

describe('REQUIRED_CONFIGS ↔ product catalog', () => {
    test('every REQUIRED_CONFIGS entry is Rescue or production-status in catalog', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required.length).toBeGreaterThan(0);

        for (const configString of required) {
            if (configString === RESCUE_CONFIG_STRING) {
                continue;
            }
            const entry = catalogIndex.get(configString);
            if (!entry) {
                throw new Error(
                    `REQUIRED_CONFIGS entry "${configString}" is not in the ` +
                        'upstream product catalog. Remove it from the workflow ' +
                        'allowlist or wait for upstream to add the product.'
                );
            }
            if (entry.status !== PRODUCTION_STATUS) {
                throw new Error(
                    `REQUIRED_CONFIGS entry "${configString}" has upstream ` +
                        `status "${entry.status}". The publish allowlist only ` +
                        'admits production-status configs and the Rescue ' +
                        'exception.'
                );
            }
        }
    });

    test('REQUIRED_CONFIGS does not list the blocked FanTRIAC config', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(FANTRIAC_CONFIG_STRING);
    });
});

describe('scripts/data/kits.json ↔ product catalog', () => {
    test('every active kit firmware_config_string is Rescue or catalog-eligible', () => {
        for (const kit of kits.kits || []) {
            if (kit.firmware_config_string === RESCUE_CONFIG_STRING) {
                continue;
            }
            const entry = catalogIndex.get(kit.firmware_config_string);
            if (!entry) {
                throw new Error(
                    `Kit "${kit.sku}" references firmware_config_string ` +
                        `"${kit.firmware_config_string}" which is not in the ` +
                        'upstream product catalog. Remove the kit or wait for ' +
                        'upstream to add the product.'
                );
            }
            if (!ELIGIBLE_STATUSES.has(entry.status)) {
                throw new Error(
                    `Kit "${kit.sku}" maps to firmware_config_string ` +
                        `"${kit.firmware_config_string}" which has upstream ` +
                        `status "${entry.status}". Kits may only point at ` +
                        `statuses [${[...ELIGIBLE_STATUSES].join(', ')}].`
                );
            }
        }
    });

    test('no active kit references the blocked FanTRIAC config', () => {
        for (const kit of kits.kits || []) {
            expect(kit.firmware_config_string).not.toBe(FANTRIAC_CONFIG_STRING);
            expect(containsSegment(kit.firmware_config_string, 'FanTRIAC')).toBe(false);
        }
    });
});

describe('legacy-compatible upstream entries are not exposed by WebFlash', () => {
    // Legacy-compatible catalog entries have no config_string upstream — they
    // are identified by legacy_config_id only. The risk is that a WebFlash
    // surface picks up that legacy_config_id verbatim as a config_string,
    // bypassing the eligibility checks above (which key on config_string).
    // Assert none of those identifiers leak into any active surface.
    test('no active WebFlash surface uses any legacy_config_id verbatim', () => {
        if (legacyIds.size === 0) {
            return; // fixture or catalog has no legacy-compatible entries
        }

        const offenders = [];

        for (const source of sources.sources || []) {
            if (legacyIds.has(source.config_string)) {
                offenders.push(
                    `firmware/sources.json source "${source.config_string}"`
                );
            }
        }
        for (const build of manifest.builds || []) {
            if (legacyIds.has(build.config_string)) {
                offenders.push(
                    `manifest.json build "${build.config_string}"`
                );
            }
        }
        for (const required of parseRequiredConfigsFromWorkflow()) {
            if (legacyIds.has(required)) {
                offenders.push(`REQUIRED_CONFIGS entry "${required}"`);
            }
        }
        for (const kit of kits.kits || []) {
            if (legacyIds.has(kit.firmware_config_string)) {
                offenders.push(
                    `kit "${kit.sku}" firmware_config_string ` +
                        `"${kit.firmware_config_string}"`
                );
            }
        }

        if (offenders.length > 0) {
            throw new Error(
                'Legacy-compatible upstream entries are exposed as active ' +
                    `WebFlash firmware: ${offenders.join('; ')}. Legacy YAMLs ` +
                    'are retained upstream for manual users only and must not ' +
                    'be promoted to a shippable WebFlash surface.'
            );
        }
    });
});

describe('WF-PRODUCT-003 — upstream LED preview recognition', () => {
    // Pins the awareness-but-non-exposure contract introduced by
    // WF-PRODUCT-003: upstream PRODUCT-009 promoted Ceiling-POE-VentIQ-RoomIQ-LED
    // to a preview build with webflash_build_matrix=true, the fixture mirrors
    // that real upstream row, but WebFlash has not imported, signed,
    // manifested, or surfaced it. These tests explicitly assert both halves
    // of that contract so a regression on either side (fixture drift OR
    // accidental active-surface exposure) fails this guard, not just the
    // existing eligibility rules.

    test('fixture exposes the LED preview entry as status=preview', () => {
        const entry = catalogIndex.get(LED_PREVIEW_CONFIG_STRING);
        if (!entry) {
            throw new Error(
                `Catalog fixture does not contain ${LED_PREVIEW_CONFIG_STRING}. ` +
                    'WF-PRODUCT-003 mirrored the real upstream LED preview into ' +
                    'the fixture; if it has been removed, either upstream ' +
                    'demoted/withdrew the preview (refresh the fixture and ' +
                    'these tests) or the fixture was edited incorrectly.'
            );
        }
        expect(entry.status).toBe('preview');
    });

    test('LED preview carries the upstream artifact_name, version, and channel', () => {
        const entry = catalogIndex.get(LED_PREVIEW_CONFIG_STRING);
        expect(entry).toBeDefined();
        expect(entry.artifact_name).toBe(LED_PREVIEW_ARTIFACT_NAME);
        expect(entry.version).toBe('1.0.0');
        expect(entry.channel).toBe('preview');
    });

    test('LED preview status is in the manifest/kit eligibility set', () => {
        // Documents that if a future PR imports the LED preview and adds it
        // to manifest.json / kits.json, the existing eligibility rules will
        // admit it (preview is part of ELIGIBLE_STATUSES). This is the
        // "would be allowed later" half of the contract.
        const entry = catalogIndex.get(LED_PREVIEW_CONFIG_STRING);
        expect(entry).toBeDefined();
        expect(ELIGIBLE_STATUSES.has(entry.status)).toBe(true);
    });

    test('firmware/sources.json does not reference the LED preview', () => {
        // firmware/sources.json is production-only; the LED preview must not
        // appear here until upstream promotes it to production AND WebFlash
        // imports the signed artifact.
        for (const source of sources.sources || []) {
            expect(source.config_string).not.toBe(LED_PREVIEW_CONFIG_STRING);
            expect(source.asset_name).not.toBe(LED_PREVIEW_ARTIFACT_NAME);
        }
    });

    test('manifest.json does not reference the LED preview', () => {
        for (const build of manifest.builds || []) {
            expect(build.config_string).not.toBe(LED_PREVIEW_CONFIG_STRING);
            for (const part of build.parts || []) {
                expect(part.path).not.toContain(LED_PREVIEW_ARTIFACT_NAME);
            }
        }
    });

    test('REQUIRED_CONFIGS does not list the LED preview', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(LED_PREVIEW_CONFIG_STRING);
    });

    test('no active kit references the LED preview', () => {
        for (const kit of kits.kits || []) {
            expect(kit.firmware_config_string).not.toBe(LED_PREVIEW_CONFIG_STRING);
        }
    });

    test('manifest.json builds resolve to exactly Release-One + Rescue', () => {
        // Snapshot lock for WF-PRODUCT-003: the manifest is unchanged by
        // this PR and must continue to expose only Release-One + Rescue.
        // If a later PR legitimately adds the LED preview to the manifest,
        // update this expectation in the same change so the contract stays
        // self-documenting.
        const configStrings = (manifest.builds || []).map(b => b.config_string).sort();
        expect(configStrings).toEqual(
            ['Ceiling-POE-VentIQ-RoomIQ', 'Rescue'].sort()
        );
    });

    test('scripts/data/kits.json references only Release-One', () => {
        // Mirror lock for the kit catalog: WF-PRODUCT-003 does not add an
        // LED kit. Update this expectation deliberately if/when a future PR
        // ships LED through the kit-config path.
        const kitConfigs = (kits.kits || []).map(k => k.firmware_config_string);
        expect(kitConfigs).toEqual(['Ceiling-POE-VentIQ-RoomIQ']);
    });
});
