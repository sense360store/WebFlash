#!/usr/bin/env node
/**
 * promote-to-stable.js — WebFlash side of the cross-repo promote-to-stable helper.
 *
 * Performs the single, deterministic, auditable WebFlash edit that promotes
 * config C to stable version V, replacing the manual multi-step chain:
 *
 *   1. Point the kit(s) at the stable channel. Every kit in
 *      scripts/data/kits.json whose firmware_config_string === C has its
 *      firmware_channel set to "stable". Because the slice-2 single source of
 *      truth (scripts/data/kits.json, consumed by __tests__/helpers/stable-surface.js)
 *      DERIVES the stable surface from firmware_channel, this same edit is what
 *      makes C "read as stable" in the single-source declaration. A config that
 *      mapped to more than one kit card would flip every matching card (none
 *      does today: the duplicate-card guard pins one card per config, and the
 *      former Living / Corridor pair that shared a build is retired).
 *
 *   2. Retire any SUPERSEDED preview for C. For each preview source entry in
 *      firmware/sources.json whose config_string === C, the entry is removed
 *      and its on-disk .bin + .meta.json are deleted — but ONLY when the
 *      preview's version is <= V.
 *
 * THE ONE RULE THAT MUST NEVER BE VIOLATED:
 *   Retire a preview for C only if its version <= V. If a preview for C exists
 *   at a version GREATER than V it is an ahead-of-stable preview and is left
 *   completely untouched. If the version comparison is ambiguous (a preview
 *   version that is not a clean numeric version) the tool refuses to proceed
 *   and writes nothing. This is the entire reason previews are not auto-retired.
 *
 * On the WebFlash side V is used ONLY for this guard comparison. The kit-channel
 * flip does not consume V (a kit channel is just "stable").
 *
 * What this tool deliberately does NOT do:
 *   - It never commits, pushes, signs, or merges. It only edits files.
 *   - It does not regenerate manifest.json / firmware-*.json. After retiring a
 *     preview you must regenerate the manifest (it prints the exact command).
 *   - It does not import the stable .bin for C@V. That is the separate importer
 *     step and is a precondition for a coherent promotion.
 *   - It does not edit the canonical structural test pins that encode the stable
 *     set; it prints which ones a reviewer must update.
 *
 * Usage:
 *   node scripts/promote-to-stable.js <config_string> <version> [--dry-run]
 *   node scripts/promote-to-stable.js Ceiling-POE-RoomIQ-LED 1.1.0 --dry-run
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const KITS_REL = 'scripts/data/kits.json';
const SOURCES_REL = 'firmware/sources.json';
const CONFIG_DIR_REL = 'firmware/configurations';
const MANIFEST_REGEN = 'python3 scripts/gen-manifests.py --summary';

const STABLE = 'stable';
const PREVIEW = 'preview';

/** Refusal carries a human-readable reason; main() turns it into exit code 2. */
export class PromotionError extends Error {}

const VERSION_RE = /^\d+(?:\.\d+)*$/;

/**
 * Normalize a version: strip an optional leading "v" and require a clean dotted
 * run of integers. Anything else (e.g. a pre-release suffix) is ambiguous and
 * refused, so an ambiguous version can never drive the retirement guard.
 */
export function normalizeVersion(raw, label = 'version') {
    if (raw === undefined || raw === null) {
        throw new PromotionError(`${label} is required`);
    }
    let candidate = String(raw).trim();
    if (candidate[0] === 'v' || candidate[0] === 'V') {
        candidate = candidate.slice(1);
    }
    if (!VERSION_RE.test(candidate)) {
        throw new PromotionError(
            `${label} ${JSON.stringify(raw)} is not a clean numeric version ` +
                '(expected e.g. 1.0.5); refusing rather than guess'
        );
    }
    return candidate;
}

/** Compare two normalized dotted-integer versions. Returns -1, 0, or 1. */
export function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da < db) return -1;
        if (da > db) return 1;
    }
    return 0;
}

function effectiveChannel(kit) {
    // Mirrors the kit-config loader / stable-surface helper: an absent
    // firmware_channel defaults to "stable".
    return kit.firmware_channel || STABLE;
}

/**
 * Pure planning. Reads the two parsed documents and the target (C, V) and
 * returns the decisions: which kit cards flip, which previews retire, which are
 * preserved because they are ahead of V. Throws PromotionError on any refusal.
 * Performs no I/O.
 *
 * @returns {{
 *   configString: string, version: string,
 *   kitFlips: Array<{sku: string, from: string}>,
 *   kitsAlreadyStable: string[],
 *   retire: Array<{configString: string, version: string, assetName: string}>,
 *   preservedAhead: Array<{configString: string, version: string, assetName: string}>,
 * }}
 */
export function computePlan({ kits, sources, configString, version }) {
    const v = normalizeVersion(version);

    const kitList = Array.isArray(kits.kits) ? kits.kits : [];
    const matchingKits = kitList.filter(
        (k) => k.firmware_config_string === configString
    );
    if (matchingKits.length === 0) {
        throw new PromotionError(
            `no kit in ${KITS_REL} has firmware_config_string ` +
                `"${configString}"; nothing to point at the stable channel`
        );
    }

    const kitFlips = [];
    const kitsAlreadyStable = [];
    for (const kit of matchingKits) {
        const channel = effectiveChannel(kit);
        if (channel === STABLE) {
            kitsAlreadyStable.push(kit.sku);
        } else {
            kitFlips.push({ sku: kit.sku, from: channel });
        }
    }

    const sourceList = Array.isArray(sources.sources) ? sources.sources : [];
    const previewSources = sourceList.filter(
        (s) => s.config_string === configString && s.channel === PREVIEW
    );

    const retire = [];
    const preservedAhead = [];
    for (const src of previewSources) {
        // The guard is only safe with an unambiguous version. A preview whose
        // version cannot be parsed makes the whole operation refuse.
        let pv;
        try {
            pv = normalizeVersion(src.version, 'preview version');
        } catch (err) {
            throw new PromotionError(
                `preview source for "${configString}" has an ambiguous version ` +
                    `${JSON.stringify(src.version)} (asset ${src.asset_name}); ` +
                    'refusing to proceed. Resolve the version before promoting.'
            );
        }
        const record = {
            configString,
            version: pv,
            assetName: src.asset_name,
        };
        if (compareVersions(pv, v) <= 0) {
            retire.push(record); // pv <= V : superseded, safe to retire
        } else {
            preservedAhead.push(record); // pv > V : ahead-of-stable, untouched
        }
    }

    return {
        configString,
        version: v,
        kitFlips,
        kitsAlreadyStable,
        retire,
        preservedAhead,
    };
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Surgically set firmware_channel to "stable" for every kit whose
 * firmware_config_string === configString, preserving kits.json's hand
 * formatting (a full JSON re-serialize would reflow the whole file). The edit
 * is verified by re-parsing: the result must deep-equal the original document
 * with exactly the target kits flipped, otherwise it throws and nothing is
 * written.
 *
 * Returns { text, flipped: string[] }.
 */
export function flipKitChannelsInText(rawText, configString) {
    const before = JSON.parse(rawText);
    const re = new RegExp(
        `("firmware_config_string":\\s*"${escapeRegExp(configString)}",` +
            `\\s*\\n\\s*"firmware_channel":\\s*")([^"]*)(")`,
        'g'
    );
    const flipped = [];
    const text = rawText.replace(re, (match, pre, oldChannel, post) => {
        if (oldChannel === STABLE) return match;
        return `${pre}${STABLE}${post}`;
    });

    // Build the expected parsed result and verify the surgical edit produced
    // exactly that (no more, no less).
    const expected = JSON.parse(rawText);
    for (const kit of expected.kits || []) {
        if (kit.firmware_config_string === configString) {
            if ((kit.firmware_channel || STABLE) !== STABLE) {
                flipped.push(kit.sku);
            }
            if ('firmware_channel' in kit) {
                kit.firmware_channel = STABLE;
            }
        }
    }
    const after = JSON.parse(text);
    if (JSON.stringify(after) !== JSON.stringify(expected)) {
        throw new PromotionError(
            `failed to safely edit ${KITS_REL} (surgical channel flip did not ` +
                'produce the expected document); no files written'
        );
    }
    // Sanity: untouched kits are byte-identical except the flipped channel lines.
    void before;
    return { text, flipped };
}

/**
 * Remove the source entries whose asset_name is in assetNames, re-serializing
 * firmware/sources.json (which round-trips byte-identically at 4-space indent).
 * Guards against silent mass-reformat: if the file would not round-trip cleanly
 * it throws instead of reflowing every entry.
 */
export function removeSourceEntriesInText(rawText, assetNames) {
    const roundTrip = `${JSON.stringify(JSON.parse(rawText), null, 4)}\n`;
    if (roundTrip !== rawText) {
        throw new PromotionError(
            `${SOURCES_REL} does not round-trip cleanly; refusing to rewrite it ` +
                'to avoid a mass reformat. Retire the preview entry by hand.'
        );
    }
    const doc = JSON.parse(rawText);
    const toRemove = new Set(assetNames);
    const kept = (doc.sources || []).filter((s) => !toRemove.has(s.asset_name));
    const newDoc = { ...doc, sources: kept };
    return `${JSON.stringify(newDoc, null, 4)}\n`;
}

function metaPathForAsset(assetName) {
    return assetName.replace(/\.bin$/, '.meta.json');
}

function readJson(relativePath) {
    return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8'));
}

function formatPlan(plan, { dryRun }) {
    const lines = [];
    const mode = dryRun ? 'DRY RUN (no files written)' : 'APPLY';
    lines.push('='.repeat(72));
    lines.push(`promote-to-stable (WebFlash) — ${mode}`);
    lines.push(`  config_string : ${plan.configString}`);
    lines.push(`  version (V)   : ${plan.version}   (used only for the retirement guard)`);
    lines.push('='.repeat(72));

    lines.push(`\nKit channel + single-source declaration  (${KITS_REL})`);
    if (plan.kitFlips.length === 0) {
        lines.push('    (no kit needs flipping — already on the stable channel)');
    }
    for (const flip of plan.kitFlips) {
        lines.push(`    ${flip.sku}: firmware_channel "${flip.from}" -> "stable"`);
    }
    for (const sku of plan.kitsAlreadyStable) {
        lines.push(`    ${sku}: firmware_channel already "stable" (unchanged)`);
    }
    lines.push(
        '    (flipping firmware_channel here is the slice-2 single-source ' +
            'update; the stable surface derives from it)'
    );

    lines.push(`\nSuperseded preview retirement  (${SOURCES_REL} + ${CONFIG_DIR_REL}/)`);
    if (plan.retire.length === 0) {
        lines.push('    (no superseded preview to retire)');
    }
    for (const r of plan.retire) {
        lines.push(
            `    RETIRE preview v${r.version} (<= V ${plan.version}): remove source ` +
                `entry + delete ${r.assetName} + ${metaPathForAsset(r.assetName)}`
        );
    }
    for (const p of plan.preservedAhead) {
        lines.push(
            `    KEEP preview v${p.version} (> V ${plan.version}, ahead-of-stable): ` +
                `${p.assetName} left completely untouched [GUARD]`
        );
    }

    return lines.join('\n');
}

function nextSteps(plan) {
    const lines = ['\nNEXT STEPS (this tool does not do these):'];
    if (plan.retire.length > 0) {
        lines.push(`  1. Regenerate the manifest:  ${MANIFEST_REGEN}`);
        lines.push(
            '     (drops the retired preview build from manifest.json + ' +
                'firmware-*.json)'
        );
    } else {
        lines.push(
            '  1. Ensure the stable .bin for this config@version is already ' +
                'imported, then regenerate the manifest if anything changed:'
        );
        lines.push(`       ${MANIFEST_REGEN}`);
    }
    lines.push(
        '  2. Update the canonical structural pins that encode the stable set ' +
            '(these are deliberately literal):'
    );
    lines.push('       __tests__/kits-json.test.js (stable SKU membership)');
    lines.push('       __tests__/wf-live-smoke-2-0-default.test.js (stable SKU literals)');
    lines.push(
        '       __tests__/firmware-configurations-on-disk.test.js (EXPECTED_FILES, if a .bin was deleted)'
    );
    lines.push(
        '     and refresh the vendored upstream catalog fixture ' +
            '(__tests__/fixtures/esphome-product-catalog.json) if upstream promoted this config.'
    );
    lines.push('  3. Run the suite:  npm test');
    lines.push('  4. Review the diff and open a review-first PR. Do not merge.');
    return lines.join('\n');
}

function applyPlan(plan) {
    const written = [];
    const deleted = [];
    const missing = [];

    if (plan.kitFlips.length > 0) {
        const kitsPath = join(REPO_ROOT, KITS_REL);
        const raw = readFileSync(kitsPath, 'utf8');
        const { text } = flipKitChannelsInText(raw, plan.configString);
        if (text !== raw) {
            writeFileSync(kitsPath, text);
            written.push(KITS_REL);
        }
    }

    if (plan.retire.length > 0) {
        const sourcesPath = join(REPO_ROOT, SOURCES_REL);
        const raw = readFileSync(sourcesPath, 'utf8');
        const assetNames = plan.retire.map((r) => r.assetName);
        const text = removeSourceEntriesInText(raw, assetNames);
        if (text !== raw) {
            writeFileSync(sourcesPath, text);
            written.push(SOURCES_REL);
        }
        for (const r of plan.retire) {
            for (const rel of [
                join(CONFIG_DIR_REL, r.assetName),
                join(CONFIG_DIR_REL, metaPathForAsset(r.assetName)),
            ]) {
                const abs = join(REPO_ROOT, rel);
                if (existsSync(abs)) {
                    unlinkSync(abs);
                    deleted.push(rel);
                } else {
                    missing.push(rel);
                }
            }
        }
    }

    return { written, deleted, missing };
}

function parseArgs(argv) {
    const positionals = [];
    let dryRun = false;
    for (const arg of argv) {
        if (arg === '--dry-run') dryRun = true;
        else if (arg === '--help' || arg === '-h') return { help: true };
        else positionals.push(arg);
    }
    return { configString: positionals[0], version: positionals[1], dryRun };
}

const USAGE =
    'Usage: node scripts/promote-to-stable.js <config_string> <version> [--dry-run]';

export function main(argv) {
    const args = parseArgs(argv);
    if (args.help || !args.configString || !args.version) {
        console.log(USAGE);
        return args.help ? 0 : 2;
    }

    let plan;
    try {
        plan = computePlan({
            kits: readJson(KITS_REL),
            sources: readJson(SOURCES_REL),
            configString: args.configString,
            version: args.version,
        });
    } catch (err) {
        if (err instanceof PromotionError) {
            console.error(`REFUSING TO PROCEED: ${err.message}`);
            return 2;
        }
        throw err;
    }

    console.log(formatPlan(plan, { dryRun: args.dryRun }));

    if (args.dryRun) {
        console.log(
            '\nDry run only. Re-run without --dry-run to write the changes.'
        );
        console.log(nextSteps(plan));
        return 0;
    }

    const hasWork =
        plan.kitFlips.length > 0 || plan.retire.length > 0;
    if (!hasWork) {
        console.log('\nNothing to write (already at the target state).');
        return 0;
    }

    const result = applyPlan(plan);
    console.log('\nWrote:');
    for (const rel of result.written) console.log(`  edited  ${rel}`);
    for (const rel of result.deleted) console.log(`  deleted ${rel}`);
    for (const rel of result.missing) {
        console.log(`  (already absent) ${rel}`);
    }
    console.log(nextSteps(plan));
    console.log(
        '\nThis tool did not commit, push, sign, or merge anything.'
    );
    return 0;
}

// Only run when invoked directly (so the pure functions can be unit tested).
const invokedDirectly =
    process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
    process.exit(main(process.argv.slice(2)));
}
