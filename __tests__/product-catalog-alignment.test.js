import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
// Stable surface (stable configs, recommended/production configs) derived from
// kits.json, not hardcoded. See __tests__/helpers/stable-surface.js.
import { stableConfigs, recommendedConfigs } from './helpers/stable-surface.js';

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

// WEBFLASH-RELAY-001 — upstream #711 (RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001)
// added a structured per-entry WebFlash-import authorisation that is independent
// of the product-catalog lifecycle `status`. FanRelay / FanPWM / FanDAC keep
// status=hardware-pending + webflash_build_matrix=false (no committed upstream
// WebFlash build row) but carry webflash_import_eligibility.eligible=true in
// upstream config/preview-release-targets.json, which explicitly authorises an
// Advanced-install-only, acknowledgement-gated preview / manual-preview import.
// WebFlash honours that flag for import / manifest / kit eligibility ONLY. It is
// never honoured for REQUIRED_CONFIGS (which stays production-only — see the
// dedicated test below) and never when eligible !== true (FanTRIAC stays
// eligible=false and is rejected). This recognises a new, explicit upstream
// signal; it does not relax the lifecycle-status gate for entries that lack it.
const FANRELAY_CONFIG_STRING = 'Ceiling-POE-VentIQ-FanRelay-RoomIQ';
// WEBFLASH-PWM-001 — same two-concept eligibility model as FanRelay: catalog
// status stays hardware-pending + webflash_build_matrix=false, but
// webflash_import_eligibility.eligible=true authorises the Advanced-install-only
// preview / manual-preview import. Honoured for import / manifest / kit only,
// never REQUIRED_CONFIGS.
const FANPWM_CONFIG_STRING = 'Ceiling-POE-FanPWM';
const FANDAC_CONFIG_STRING = 'Ceiling-POE-FanDAC';

function isWebflashImportEligible(entry) {
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

// Strip the "-vX.Y.Z" semver token from an artifact filename so the
// source-vs-catalog identity comparison survives a version bump.
// firmware/sources.json is the one surface that legitimately leads: a source is
// declared (e.g. v1.0.2) before the importer regenerates the manifest and the
// vendored fixture is refreshed, so comparing the exact versioned filename
// re-breaks CI on every bump before the fixture catches up. The config_string
// identity, the stable / preview channel suffix, and the blocked-token guards
// are all preserved by comparing the version-stripped base instead of the full
// filename. (The manifest <-> catalog version check below stays strict because
// those two surfaces move together in the import commit.)
function stripArtifactVersion(name) {
    if (typeof name !== 'string') {
        return name;
    }
    return name.replace(/-v\d+\.\d+\.\d+/i, '');
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
    test('every source config_string is catalog-known and eligible', () => {
        // WF-LED-002 widened the sources.json policy from production-only to
        // production + preview (mirroring the manifest/kit eligibility set).
        // REQUIRED_CONFIGS stays production-only via its own separate test
        // below, so the publish allowlist is unaffected.
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
            if (!isWebflashImportEligible(entry)) {
                throw new Error(
                    `firmware/sources.json source "${source.config_string}" has ` +
                        `upstream status "${entry.status}" and no ` +
                        'webflash_import_eligibility.eligible=true authorisation. ' +
                        `WebFlash only imports from catalog entries in statuses ` +
                        `[${[...ELIGIBLE_STATUSES].join(', ')}] OR entries upstream ` +
                        'has explicitly marked webflash_import_eligibility.eligible=true. ' +
                        'Remove the source or wait for upstream to promote / authorise it.'
                );
            }
        }
    });

    test('source asset_name matches catalog artifact_name base (version-tolerant)', () => {
        // Version-tolerant identity check. Compare the config_string (the map
        // key) plus the version-stripped artifact base — which still encodes the
        // stable / preview channel suffix — instead of the exact versioned
        // filename. firmware/sources.json may carry a freshly declared upstream
        // version (e.g. v1.0.2) before the vendored fixture is refreshed, so an
        // exact filename equality would false-fail on every bump. A genuine
        // product or channel drift still fails because the stripped bases differ.
        // The blocked-token and eligibility protections live in their own tests
        // and are unaffected.
        for (const source of sources.sources || []) {
            const entry = catalogIndex.get(source.config_string);
            if (!entry) {
                continue; // covered by the previous test's failure
            }
            if (typeof entry.artifact_name === 'string' && entry.artifact_name.length > 0) {
                const sourceBase = stripArtifactVersion(source.asset_name);
                const catalogBase = stripArtifactVersion(entry.artifact_name);
                if (sourceBase !== catalogBase) {
                    throw new Error(
                        `firmware/sources.json asset_name "${source.asset_name}" ` +
                            `does not match upstream catalog artifact_name ` +
                            `"${entry.artifact_name}" for config_string ` +
                            `"${source.config_string}" even after stripping the ` +
                            `version token ("${sourceBase}" vs "${catalogBase}"). ` +
                            'The product identity or channel drifted, not just the version.'
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
            if (!isWebflashImportEligible(entry)) {
                throw new Error(
                    `manifest.json build "${build.config_string}" has upstream ` +
                        `status "${entry.status}" and no ` +
                        'webflash_import_eligibility.eligible=true authorisation. ' +
                        `WebFlash only ships builds in statuses ` +
                        `[${[...ELIGIBLE_STATUSES].join(', ')}] OR entries upstream ` +
                        'has explicitly marked webflash_import_eligibility.eligible=true.'
                );
            }
        }
    });

    test('manifest build version matches catalog version where defined', () => {
        // Strict by design: manifest.json and the vendored catalog fixture are
        // coupled surfaces — both move to the new version together in the import
        // commit (see firmware/sources.json -> importer -> gen-manifests, and the
        // fixture refresh that rides along). A drift between them is a real
        // integrity failure, not the benign "source declared ahead of the import"
        // window that the source-side asset_name check above tolerates.
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
            if (!isWebflashImportEligible(entry)) {
                throw new Error(
                    `Kit "${kit.sku}" maps to firmware_config_string ` +
                        `"${kit.firmware_config_string}" which has upstream ` +
                        `status "${entry.status}" and no ` +
                        'webflash_import_eligibility.eligible=true authorisation. ' +
                        `Kits may only point at statuses ` +
                        `[${[...ELIGIBLE_STATUSES].join(', ')}] OR import-eligible entries.`
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
    // Pins the LED-preview contract across the WF-PRODUCT-003 awareness
    // baseline and the WF-LED-002 import. The fixture-side assertions are
    // unchanged: upstream still publishes the LED preview entry as
    // status=preview with the same artifact_name/version/channel. The
    // active-surface assertions split: import surfaces (firmware/sources.json
    // + manifest.json) now reference the LED preview build, while the
    // production-only allowlists (REQUIRED_CONFIGS, kits.json) still do not.

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
        // Documents that the LED preview is admissible under the existing
        // eligibility rules (preview is part of ELIGIBLE_STATUSES). The
        // WF-LED-002 manifest assertion below is the positive proof.
        const entry = catalogIndex.get(LED_PREVIEW_CONFIG_STRING);
        expect(entry).toBeDefined();
        expect(ELIGIBLE_STATUSES.has(entry.status)).toBe(true);
    });

    test('firmware/sources.json references the LED preview source entry', () => {
        // WF-LED-002 flip: sources.json now carries a second entry for the
        // LED preview build (alongside Release-One). The Release-One source
        // entry must remain present and unchanged — that is enforced by
        // __tests__/manifest-required-configs.test.js.
        const ledSource = (sources.sources || []).find(
            s => s.config_string === LED_PREVIEW_CONFIG_STRING
        );
        expect(ledSource).toBeDefined();
        expect(ledSource.asset_name).toBe(LED_PREVIEW_ARTIFACT_NAME);
        expect(ledSource.channel).toBe('preview');
        expect(ledSource.version).toBe('1.0.0');
        // LED preview source must block FanTRIAC only — blocking LED here
        // would make the importer reject the LED preview's own asset.
        expect(ledSource.block_tokens).toEqual(['FanTRIAC']);
    });

    test('manifest.json contains the LED preview build', () => {
        // WF-LED-002 flip: manifest.json now carries the LED preview build
        // as channel=preview. Release-One stable and Rescue remain present
        // and unchanged.
        const ledBuild = (manifest.builds || []).find(
            b => b.config_string === LED_PREVIEW_CONFIG_STRING
        );
        expect(ledBuild).toBeDefined();
        expect(ledBuild.channel).toBe('preview');
        expect(ledBuild.version).toBe('1.0.0');
        expect(ledBuild.chipFamily).toBe('ESP32-S3');
        expect(ledBuild.improv).toBe(true);
        // Sense360 LED ring belongs in the modules list for this build.
        expect(ledBuild.modules).toEqual(
            expect.arrayContaining(['VentIQ', 'RoomIQ', 'LED'])
        );
    });

    test('REQUIRED_CONFIGS does not list the LED preview', () => {
        // WF-LED-002 invariant: REQUIRED_CONFIGS stays production-only. The
        // LED preview enters manifest.json but the publish allowlist must
        // not gain a preview-channel entry until upstream promotes the LED
        // build to status: production.
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(LED_PREVIEW_CONFIG_STRING);
    });

    test('any kit referencing the LED preview stays preview-channel and out of REQUIRED_CONFIGS', () => {
        // WF2-KIT-BUNDLE-PICKER-001 superseded the WF-LED-002/WF-LED-003 "kits
        // stay Release-One-only" deferral: the LED preview build is now surfaced
        // as the Living Room / Corridor room-bundle cards. That is kit-eligible by
        // the lifecycle model (preview = import + manifest + kit eligible). The
        // production-only REQUIRED_CONFIGS invariant is unchanged — the LED preview
        // must never enter it, and any kit on it must declare the preview channel.
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(LED_PREVIEW_CONFIG_STRING);
        for (const kit of kits.kits || []) {
            if (kit.firmware_config_string === 'Ceiling-POE-RoomIQ-LED') {
                expect(kit.firmware_channel).toBe('preview');
            }
            // The VentIQ LED preview is a manifest-only build, never a kit card.
            expect(kit.firmware_config_string).not.toBe(LED_PREVIEW_CONFIG_STRING);
        }
    });

    test('manifest.json builds resolve to two stables + six preview builds + Rescue', () => {
        // Snapshot lock updated by the stale v1.0.0-preview retirement: the
        // manifest now exposes nine builds. Five stale v1.0.0-preview builds
        // (Ceiling-POE-AirIQ-RoomIQ, Ceiling-POE-FanDAC, Ceiling-POE-FanPWM,
        // Ceiling-POE-RoomIQ-LED, Ceiling-POE-VentIQ-FanRelay-RoomIQ) were
        // retired because upstream regenerated the v1.0.0-preview
        // checksums-sha256.txt without their assets, so the importer fails
        // closed on them. What remains: the Release-One + RoomIQ stables,
        // the LED preview (Ceiling-POE-VentIQ-RoomIQ-LED, from
        // v1.0.0-led-preview), the five full-composition room-bundle fan
        // previews (all from v1.0.0-preview, still listed in the regenerated
        // checksums file and authorised by
        // webflash_import_eligibility.eligible=true), and Rescue.
        const configStrings = (manifest.builds || []).map(b => b.config_string).sort();
        expect(configStrings).toEqual(
            [
                'Ceiling-POE-AirIQ-FanDAC-RoomIQ',
                'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
                'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
                'Ceiling-POE-RoomIQ',
                'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
                'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
                'Ceiling-POE-VentIQ-RoomIQ',
                'Ceiling-POE-VentIQ-RoomIQ-LED',
                'Rescue'
            ].sort()
        );
    });

    test('scripts/data/kits.json references the customer room bundles', () => {
        // The catalogue holds seven kits: the stable Bathroom (Release-One)
        // and Bedroom base bundles plus the five full-composition fan bundles
        // surfaced by WF2-FAN-EXPANSION-001. The Kitchen / Living / Corridor
        // base bundles and the Bathroom Relay bundle retired together with
        // their stale v1.0.0-preview builds (AirIQ-RoomIQ, RoomIQ-LED,
        // VentIQ-FanRelay-RoomIQ) — a kit card may never reference a config
        // without a manifest build. Every remaining config string must be a
        // real manifest build, and only the stable Release-One config may be
        // the recommended / stable default. The production-only
        // REQUIRED_CONFIGS allowlist is unaffected (see the REQUIRED_CONFIGS
        // assertions above).
        const manifestConfigs = new Set((manifest.builds || []).map(b => b.config_string));
        const kitConfigs = (kits.kits || []).map(k => k.firmware_config_string);
        expect(kitConfigs).toEqual([
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-RoomIQ',
            'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
            'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
            'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
            'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
            'Ceiling-POE-AirIQ-FanDAC-RoomIQ'
        ]);
        for (const cfg of kitConfigs) {
            expect(manifestConfigs.has(cfg)).toBe(true);
        }

        // Cross-check the MANIFEST's stable-channel builds against the kits.json-derived
        // stable config set (the helper). Comparing a different artifact (the manifest)
        // to the kits.json-derived set catches drift in either direction without
        // comparing kits.json to itself.
        const manifestStableConfigs = (manifest.builds || [])
            .filter(b => b.channel === 'stable')
            .map(b => b.config_string)
            .sort();
        expect([...new Set(manifestStableConfigs)]).toEqual([...stableConfigs]);

        // The workflow REQUIRED_CONFIGS allowlist (a different artifact) is the
        // production surface (the kits.json-derived recommended configs) plus the
        // standalone Rescue build.
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).toEqual([...recommendedConfigs, RESCUE_CONFIG_STRING]);
    });
});

describe('WEBFLASH-RELAY-001 — FanRelay preview import recognition', () => {
    // Pins the two-concept eligibility model upstream #711 introduced:
    // FanRelay keeps catalog status=hardware-pending + webflash_build_matrix=false
    // (no committed upstream WebFlash build row) but carries the separate
    // webflash_import_eligibility.eligible=true authorisation. The WEBFLASH-RELAY-001
    // import was later RETIRED: upstream's regenerated v1.0.0-preview
    // checksums-sha256.txt no longer lists the VentIQ-FanRelay asset, so the
    // importer fails closed on it. Eligibility recognition stands (the fixture
    // row is unchanged), but the source entry, manifest build, on-disk pair,
    // and Bathroom Relay kit are gone until a re-verifiable artifact ships.
    // FanTRIAC stays eligible=false / blocked.

    test('fixture FanRelay row keeps status=hardware-pending but carries webflash_import_eligibility.eligible=true', () => {
        const entry = catalogIndex.get(FANRELAY_CONFIG_STRING);
        if (!entry) {
            throw new Error(
                `Catalog fixture does not contain ${FANRELAY_CONFIG_STRING}. ` +
                    'WEBFLASH-RELAY-001 mirrors the real upstream FanRelay row; if it ' +
                    'has been removed, refresh the fixture from upstream ' +
                    'config/product-catalog.json + config/preview-release-targets.json.'
            );
        }
        expect(entry.status).toBe('hardware-pending');
        expect(entry.webflash_build_matrix).toBe(false);
        expect(entry.webflash_import_eligibility).toBeDefined();
        expect(entry.webflash_import_eligibility.eligible).toBe(true);
        // Status alone is NOT import-eligible; the explicit flag is what authorises it.
        expect(ELIGIBLE_STATUSES.has(entry.status)).toBe(false);
        expect(isWebflashImportEligible(entry)).toBe(true);
        expect(entry.artifact_name).toBe(
            'Sense360-Ceiling-POE-VentIQ-FanRelay-RoomIQ-v1.0.0-preview.bin'
        );
        expect(entry.version).toBe('1.0.0');
        expect(entry.channel).toBe('preview');
    });

    test('FanTRIAC remains catalog-ineligible (no webflash_import_eligibility=true)', () => {
        const entry = catalogIndex.get(FANTRIAC_CONFIG_STRING);
        expect(entry).toBeDefined();
        expect(entry.status).toBe('blocked');
        expect(isWebflashImportEligible(entry)).toBe(false);
    });

    test('the retired VentIQ FanRelay preview is out of firmware/sources.json', () => {
        const src = (sources.sources || []).find(
            s => s.config_string === FANRELAY_CONFIG_STRING
        );
        expect(src).toBeUndefined();
    });

    test('the retired VentIQ FanRelay preview is out of manifest.json', () => {
        const build = (manifest.builds || []).find(
            b => b.config_string === FANRELAY_CONFIG_STRING
        );
        expect(build).toBeUndefined();
    });

    test('FanRelay is NOT in REQUIRED_CONFIGS (production-only) and no longer a kit', () => {
        // The preview Bathroom Relay kit (S360-KIT-BATH-P-REL) retired with the
        // build; the production-only REQUIRED_CONFIGS allowlist is unchanged.
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(FANRELAY_CONFIG_STRING);
        const relayKits = (kits.kits || []).filter(k => k.firmware_config_string === FANRELAY_CONFIG_STRING);
        expect(relayKits).toEqual([]);
    });
});

describe('WEBFLASH-PWM-001 — FanPWM preview import recognition', () => {
    // Mirrors the FanRelay recognition above for the FanPWM manual-preview build
    // (Ceiling-POE-FanPWM, from the same upstream v1.0.0-preview release). Catalog
    // status stays hardware-pending + webflash_build_matrix=false; the explicit
    // webflash_import_eligibility.eligible=true flag still authorises a preview
    // import. The WEBFLASH-PWM-001 import was later RETIRED: upstream's
    // regenerated v1.0.0-preview checksums-sha256.txt no longer lists the
    // standalone FanPWM asset, so the importer fails closed on it. Eligibility
    // recognition stands (the fixture row is unchanged), but the source entry,
    // manifest build, and on-disk pair are gone until a re-verifiable artifact
    // ships. FanTRIAC stays eligible=false / blocked.

    test('fixture FanPWM row keeps status=hardware-pending but carries webflash_import_eligibility.eligible=true', () => {
        const entry = catalogIndex.get(FANPWM_CONFIG_STRING);
        if (!entry) {
            throw new Error(
                `Catalog fixture does not contain ${FANPWM_CONFIG_STRING}. ` +
                    'WEBFLASH-PWM-001 mirrors the real upstream FanPWM row; if it ' +
                    'has been removed, refresh the fixture from upstream ' +
                    'config/product-catalog.json + config/preview-release-targets.json.'
            );
        }
        expect(entry.status).toBe('hardware-pending');
        expect(entry.webflash_build_matrix).toBe(false);
        expect(entry.webflash_import_eligibility).toBeDefined();
        expect(entry.webflash_import_eligibility.eligible).toBe(true);
        // Status alone is NOT import-eligible; the explicit flag is what authorises it.
        expect(ELIGIBLE_STATUSES.has(entry.status)).toBe(false);
        expect(isWebflashImportEligible(entry)).toBe(true);
        expect(entry.artifact_name).toBe(
            'Sense360-Ceiling-POE-FanPWM-v1.0.0-preview.bin'
        );
        expect(entry.version).toBe('1.0.0');
        expect(entry.channel).toBe('preview');
    });

    test('the retired standalone FanPWM preview is out of firmware/sources.json', () => {
        const src = (sources.sources || []).find(
            s => s.config_string === FANPWM_CONFIG_STRING
        );
        expect(src).toBeUndefined();
    });

    test('the retired standalone FanPWM preview is out of manifest.json', () => {
        const build = (manifest.builds || []).find(
            b => b.config_string === FANPWM_CONFIG_STRING
        );
        expect(build).toBeUndefined();
    });

    test('FanPWM is NOT in REQUIRED_CONFIGS (production-only) and NOT in kits', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(FANPWM_CONFIG_STRING);
        for (const kit of kits.kits || []) {
            expect(kit.firmware_config_string).not.toBe(FANPWM_CONFIG_STRING);
        }
    });
});

describe('WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — FanDAC preview import recognition', () => {
    // FanDAC was the third fan-driver preview, imported by the preview-eligible
    // import automation under the same two-concept eligibility model as
    // FanRelay / FanPWM: catalog status stays hardware-pending +
    // webflash_build_matrix=false; the explicit
    // webflash_import_eligibility.eligible=true flag still authorises a preview
    // import. The import was later RETIRED: upstream's regenerated
    // v1.0.0-preview checksums-sha256.txt no longer lists the standalone FanDAC
    // asset, so the importer fails closed on it. Eligibility recognition stands
    // (the fixture row is unchanged), but the source entry, manifest build, and
    // on-disk pair are gone until a re-verifiable artifact ships. FanTRIAC
    // stays eligible=false / blocked.

    test('fixture FanDAC row keeps status=hardware-pending but carries webflash_import_eligibility.eligible=true', () => {
        const entry = catalogIndex.get(FANDAC_CONFIG_STRING);
        if (!entry) {
            throw new Error(
                `Catalog fixture does not contain ${FANDAC_CONFIG_STRING}. ` +
                    'WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 mirrors the real upstream ' +
                    'FanDAC row; if it has been removed, refresh the fixture from ' +
                    'upstream config/product-catalog.json + config/preview-release-targets.json.'
            );
        }
        expect(entry.status).toBe('hardware-pending');
        expect(entry.webflash_build_matrix).toBe(false);
        expect(entry.webflash_import_eligibility).toBeDefined();
        expect(entry.webflash_import_eligibility.eligible).toBe(true);
        // Status alone is NOT import-eligible; the explicit flag is what authorises it.
        expect(ELIGIBLE_STATUSES.has(entry.status)).toBe(false);
        expect(isWebflashImportEligible(entry)).toBe(true);
        expect(entry.artifact_name).toBe(
            'Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin'
        );
        expect(entry.version).toBe('1.0.0');
        expect(entry.channel).toBe('preview');
    });

    test('the retired standalone FanDAC preview is out of firmware/sources.json', () => {
        const src = (sources.sources || []).find(
            s => s.config_string === FANDAC_CONFIG_STRING
        );
        expect(src).toBeUndefined();
    });

    test('the retired standalone FanDAC preview is out of manifest.json', () => {
        const build = (manifest.builds || []).find(
            b => b.config_string === FANDAC_CONFIG_STRING
        );
        expect(build).toBeUndefined();
    });

    test('FanDAC is NOT in REQUIRED_CONFIGS (production-only) and NOT in kits', () => {
        const required = parseRequiredConfigsFromWorkflow();
        expect(required).not.toContain(FANDAC_CONFIG_STRING);
        for (const kit of kits.kits || []) {
            expect(kit.firmware_config_string).not.toBe(FANDAC_CONFIG_STRING);
        }
    });
});

describe('WF-IMPORT-FAN-BUNDLES-001 — full-composition fan bundle preview import recognition', () => {
    // The five published full-composition Bathroom / Kitchen fan-control
    // room-bundle preview artifacts (upstream esphome-public #720, shared
    // v1.0.0-preview release). Same two-concept eligibility model as the
    // single-driver fan previews: catalog status stays hardware-pending +
    // webflash_build_matrix=false, but webflash_import_eligibility.eligible=true
    // (ROOM-BUNDLE-FAN-WEBFLASH-ELIGIBILITY-001) authorises the Advanced-install-only,
    // acknowledgement-gated preview import — present in sources + manifest.
    // WF2-FAN-EXPANSION-001 then surfaced all five as preview kit cards (kit
    // eligible by the lifecycle model), so they are now present in kits.json too;
    // they stay absent from the production-only REQUIRED_CONFIGS. FanTRIAC stays
    // eligible=false / blocked.
    const FAN_BUNDLES = [
        {
            config: 'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
            sha256: '6d988708558881d653ffbc7429ef8779a574878ac0ee26d745bf645be85befba',
            modules: ['VentIQ', 'FanPWM', 'RoomIQ']
        },
        {
            config: 'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
            sha256: 'a08c82f735aa058614afda71dbec2d220d23a0a4fbb4cb46088adb82a41d8ef8',
            modules: ['VentIQ', 'FanDAC', 'RoomIQ']
        },
        {
            config: 'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
            sha256: '97e54930f26074e38326fbeaff7a222c828df38a33be509327e77a0b0f24a83f',
            modules: ['AirIQ', 'FanRelay', 'RoomIQ']
        },
        {
            config: 'Ceiling-POE-AirIQ-FanDAC-RoomIQ',
            sha256: '903a37dc2faf3e1f87016c435e6076752b8c776e7a862f8986d5b5a4b19a994b',
            modules: ['AirIQ', 'FanDAC', 'RoomIQ']
        },
        {
            config: 'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
            sha256: '0ca10a2f3e867ae5693e36149276b0176294b2391fa9ef02ba7059d9c853a1cc',
            modules: ['AirIQ', 'FanPWM', 'RoomIQ']
        }
    ];

    test.each(FAN_BUNDLES)(
        'fixture $config keeps status=hardware-pending but carries webflash_import_eligibility.eligible=true',
        ({ config }) => {
            const entry = catalogIndex.get(config);
            expect(entry).toBeDefined();
            expect(entry.status).toBe('hardware-pending');
            expect(entry.webflash_build_matrix).toBe(false);
            expect(entry.webflash_import_eligibility).toBeDefined();
            expect(entry.webflash_import_eligibility.eligible).toBe(true);
            // Status alone is NOT import-eligible; the explicit flag is what authorises it.
            expect(ELIGIBLE_STATUSES.has(entry.status)).toBe(false);
            expect(isWebflashImportEligible(entry)).toBe(true);
            expect(entry.version).toBe('1.0.0');
            expect(entry.channel).toBe('preview');
        }
    );

    test.each(FAN_BUNDLES)(
        'firmware/sources.json carries $config (channel preview, pinned SHA, block_tokens FanTRIAC + LED)',
        ({ config, sha256 }) => {
            const src = (sources.sources || []).find(s => s.config_string === config);
            expect(src).toBeDefined();
            expect(src.channel).toBe('preview');
            expect(src.version).toBe('1.0.0');
            expect(src.release_tag).toBe('v1.0.0-preview');
            expect(src.asset_name).toBe(`Sense360-${config}-v1.0.0-preview.bin`);
            expect(src.expected_sha256).toBe(sha256);
            expect(src.block_tokens).toEqual(['FanTRIAC', 'LED']);
        }
    );

    test.each(FAN_BUNDLES)(
        'manifest.json carries the $config preview build with the pinned SHA',
        ({ config, sha256, modules }) => {
            const build = (manifest.builds || []).find(b => b.config_string === config);
            expect(build).toBeDefined();
            expect(build.channel).toBe('preview');
            expect(build.version).toBe('1.0.0');
            expect(build.sha256).toBe(sha256);
            expect(build.modules).toEqual(expect.arrayContaining(modules));
        }
    );

    // WF2-FAN-EXPANSION-001 — each fan-bundle config is now surfaced by exactly
    // one preview kit card. Map config -> the kit SKU that carries it.
    const FAN_BUNDLE_KIT_SKU = {
        'Ceiling-POE-VentIQ-FanPWM-RoomIQ': 'S360-KIT-BATH-P-PWM',
        'Ceiling-POE-VentIQ-FanDAC-RoomIQ': 'S360-KIT-BATH-P-DAC',
        'Ceiling-POE-AirIQ-FanRelay-RoomIQ': 'S360-KIT-KITCHEN-P-REL',
        'Ceiling-POE-AirIQ-FanDAC-RoomIQ': 'S360-KIT-KITCHEN-P-DAC',
        'Ceiling-POE-AirIQ-FanPWM-RoomIQ': 'S360-KIT-KITCHEN-P-PWM'
    };

    test.each(FAN_BUNDLES)(
        '$config is NOT in REQUIRED_CONFIGS (production-only) but IS a preview kit card after WF2-FAN-EXPANSION-001',
        ({ config }) => {
            // Production-only allowlist is unchanged: the preview fan bundles must
            // never enter REQUIRED_CONFIGS.
            const required = parseRequiredConfigsFromWorkflow();
            expect(required).not.toContain(config);

            // WF2-FAN-EXPANSION-001 surfaced each config as exactly one preview
            // kit card, never recommended and always on the preview channel.
            const matching = (kits.kits || []).filter(k => k.firmware_config_string === config);
            expect(matching).toHaveLength(1);
            expect(matching[0].sku).toBe(FAN_BUNDLE_KIT_SKU[config]);
            expect(matching[0].firmware_channel).toBe('preview');
            expect(matching[0].recommended).toBe(false);
        }
    );

    test('manifest.json holds exactly nine builds and no FanTRIAC reappears', () => {
        // 14 -> 9 after the stale v1.0.0-preview retirement; the five
        // full-composition fan bundles in this describe block all survive.
        expect((manifest.builds || []).length).toBe(9);
        for (const build of manifest.builds || []) {
            expect(containsSegment(build.config_string, 'FanTRIAC')).toBe(false);
        }
    });
});
