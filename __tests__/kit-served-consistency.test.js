/**
 * PRODUCT-KITS-CONSISTENCY-001 (N1) — kit / served-source drift guard.
 *
 * The flasher screenshot exposed two display bugs that were both caused by
 * scripts/data/kits.json drifting from the served firmware reality:
 *
 *   1. A kit row showed a stale firmware version because a version had been
 *      hand-copied into display data instead of read from the served manifest.
 *   2. The Bedroom bundle's description claimed "Preview firmware — acknowledge
 *      the preview channel" while the config (Ceiling-POE-RoomIQ) is served
 *      STABLE and its badge already keyed off the real stable channel.
 *
 * This suite makes that class of drift impossible to reintroduce silently. For
 * every VISIBLE kit in kits.json it asserts, against three independent
 * reviewed sources, that:
 *
 *   - the kit's firmware_channel equals the served channel for its config
 *     (__tests__/fixtures/expected-surface.json — the reviewed served surface);
 *   - the manifest build the kit resolves to (the exact source the picker reads
 *     its per-row version from, live) carries the served version — so the
 *     DISPLAYED version can never diverge from served reality;
 *   - the kit maps to a release-ready catalog config (production, or preview
 *     with an explicit preview badge) — NEVER a hardware-pending / compile-only
 *     / blocked config (the PRODUCT-KITS-CONSISTENCY-001 SAFETY RULE: a
 *     hardware-pending config must never be surfaced as an installable kit);
 *   - the kit's display_name equals the canonical consumer bundle name
 *     (__tests__/fixtures/room-bundle-skus.json — a vendored mirror of
 *     config/room-bundle-skus.json in esphome-public);
 *   - kits.json never carries its own copy of a firmware version (single
 *     source: the version is resolved live from the served manifest).
 *
 * Anti-tautology: this test never lets kits.json validate itself. Every
 * assertion compares kits.json against a DIFFERENT reviewed file (the served
 * surface, the manifest, the product catalog, the canonical name mirror), so a
 * kits.json edit alone cannot make the suite pass.
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogFromPayload } from '../scripts/utils/kit-config.js';
import {
    expectedChannelOf,
    expectedVersionOf,
    isExpectedConfig
} from './helpers/expected-surface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

// The product catalog: CI uses the vendored fixture; set PRODUCT_CATALOG_PATH
// to an absolute path to validate against a fresh upstream catalog (same knob
// the product-catalog-alignment suite uses).
function loadProductCatalog() {
    const override = process.env.PRODUCT_CATALOG_PATH;
    if (override && override.length > 0) {
        if (!fs.existsSync(override)) {
            throw new Error(
                `PRODUCT_CATALOG_PATH is set to "${override}" but no file exists there.`
            );
        }
        return JSON.parse(fs.readFileSync(override, 'utf8'));
    }
    return loadJson(path.join('__tests__', 'fixtures', 'esphome-product-catalog.json'));
}

// Catalog statuses a config may hold to be exposed as an installable KIT. This
// is deliberately stricter than the import-eligibility rule in
// product-catalog-alignment.test.js: a hardware-pending config may be
// import-eligible via webflash_import_eligibility, but it may NEVER be a
// visible kit. Kit visibility = release-ready only.
const KIT_ELIGIBLE_STATUSES = new Set(['production', 'preview']);

describe('PRODUCT-KITS-CONSISTENCY-001 — visible kits track served reality', () => {
    const catalog = buildCatalogFromPayload(loadJson(path.join('scripts', 'data', 'kits.json')));
    const rawKits = loadJson(path.join('scripts', 'data', 'kits.json')).kits;
    const manifest = loadJson('manifest.json');
    const productCatalog = loadProductCatalog();
    const nameMirror = loadJson(path.join('__tests__', 'fixtures', 'room-bundle-skus.json'));

    const manifestByConfig = new Map(
        (manifest.builds || [])
            .filter(b => b && b.config_string)
            .map(b => [b.config_string, b])
    );
    const catalogByConfig = new Map(
        (productCatalog.products || [])
            .filter(p => p && p.config_string)
            .map(p => [p.config_string, p])
    );
    const canonicalNameByConfig = new Map(
        (nameMirror.bundles || [])
            .filter(b => b && b.config_string)
            .map(b => [b.config_string, b.consumer_name])
    );

    const visibleKits = catalog.kits;

    test('the catalogue parses and exposes at least one visible kit', () => {
        expect(catalog.skipped).toEqual([]);
        expect(visibleKits.length).toBeGreaterThan(0);
    });

    test('every visible kit resolves to a real manifest build', () => {
        visibleKits.forEach(kit => {
            expect(manifestByConfig.has(kit.firmware_config_string)).toBe(true);
        });
    });

    test('every visible kit config is part of the reviewed served surface', () => {
        visibleKits.forEach(kit => {
            expect(isExpectedConfig(kit.firmware_config_string)).toBe(true);
        });
    });

    test("every visible kit's firmware_channel equals the served channel", () => {
        visibleKits.forEach(kit => {
            expect(kit.firmware_channel).toBe(expectedChannelOf(kit.firmware_config_string));
        });
    });

    test("every visible kit's served manifest version equals the reviewed served version", () => {
        // This is the exact build scripts/app.js reads the picker's per-row
        // version from (resolveKitVersions -> build.version), so pinning it here
        // pins the DISPLAYED version to served reality.
        visibleKits.forEach(kit => {
            const build = manifestByConfig.get(kit.firmware_config_string);
            expect(typeof build.version).toBe('string');
            expect(build.version).toBe(expectedVersionOf(kit.firmware_config_string));
        });
    });

    test('SAFETY RULE: no visible kit maps to a non-release-ready catalog config', () => {
        visibleKits.forEach(kit => {
            const product = catalogByConfig.get(kit.firmware_config_string);
            expect(product).toBeTruthy();
            // Production, or preview — never hardware-pending / compile-only /
            // blocked. A hardware-pending config must never be an installable kit.
            expect(KIT_ELIGIBLE_STATUSES.has(product.status)).toBe(true);
            // A preview-status config may be a kit only with an explicit preview
            // badge (firmware_channel: preview). Production configs are stable.
            if (product.status === 'preview') {
                expect(kit.firmware_channel).toBe('preview');
            } else {
                expect(kit.firmware_channel).toBe('stable');
            }
        });
    });

    test("every visible kit's display_name matches the canonical bundle name", () => {
        visibleKits.forEach(kit => {
            const canonical = canonicalNameByConfig.get(kit.firmware_config_string);
            expect(canonical).toBeTruthy();
            expect(kit.display_name).toBe(canonical);
        });
    });

    test('kits.json never carries its own copy of a firmware version', () => {
        // Single source: the version is resolved live from the served manifest.
        // A `version` / `firmware_version` field on a kit entry would be exactly
        // the drift that produced the stale-version bug, so ban it outright.
        rawKits.forEach(entry => {
            expect(entry).not.toHaveProperty('version');
            expect(entry).not.toHaveProperty('firmware_version');
        });
    });

    test('Bedroom description no longer claims preview firmware', () => {
        // Regression pin for bug 2: the Bedroom bundle is served stable, so its
        // description must not tell the user to acknowledge a preview channel.
        const bedroom = visibleKits.find(k => k.sku === 'S360-KIT-BEDROOM-P');
        expect(bedroom).toBeTruthy();
        expect(bedroom.firmware_channel).toBe('stable');
        expect(bedroom.description.toLowerCase()).not.toContain('preview');
        expect(bedroom.description.toLowerCase()).not.toContain('acknowledge');
    });
});
