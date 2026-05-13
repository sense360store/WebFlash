import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// WF-CLEANUP-006 — manifest health guard.
//
// After WF-CLEANUP-005 regenerated manifest.json and the firmware-*.json
// files from the actual on-disk firmware assets, the generated manifest
// state finally matched what is actually shippable. This suite is the
// automated guard that keeps it that way: it fails CI if a generated
// manifest references a missing .bin, if a normal firmware build lacks a
// .meta.json sidecar, if firmware-*.json files drift from manifest.json,
// or if a blocked/excluded token reappears in a generated manifest entry.
//
// All checks read directly from disk and parsed JSON. No regeneration is
// performed and no firmware artifact is modified.

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'manifest.json');
const sourcesPath = path.join(repoRoot, 'firmware', 'sources.json');
const configurationsDir = path.join(repoRoot, 'firmware', 'configurations');
const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    'firmware-publish.yml'
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));

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

function readPerBuildManifest(name) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, name), 'utf8'));
}

function containsBlockToken(configString, token) {
    // Match the token as a hyphen-bounded segment so that "LED" does not
    // false-match "LEDless" and "FanTRIAC" does not false-match an unrelated
    // longer token. config_string segments are joined by "-".
    if (typeof configString !== 'string' || configString.length === 0) {
        return false;
    }
    const segments = configString.split('-');
    return segments.includes(token);
}

function parseRequiredConfigsFromWorkflow() {
    // The workflow stores REQUIRED_CONFIGS as a bash array literal inside a
    // run: step. There is no better authoritative source — firmware/sources.json
    // only covers cross-repo imports (not Rescue), so it cannot stand in for
    // REQUIRED_CONFIGS. The regex is bounded to the array literal between
    // `REQUIRED_CONFIGS=(` and the next `)`, and we extract every "..."
    // string inside that block. If the workflow shape ever changes, this
    // throws with a clear message and the test fails loudly.
    const yaml = fs.readFileSync(workflowPath, 'utf8');
    const arrayBlock = yaml.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
    if (!arrayBlock) {
        throw new Error(
            'Could not locate REQUIRED_CONFIGS=( ... ) in ' +
                '.github/workflows/firmware-publish.yml. The workflow shape ' +
                'changed; update __tests__/manifest-health.test.js to match.'
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
                'changed; update __tests__/manifest-health.test.js to match.'
        );
    }
    return entries;
}

describe('manifest health — file references exist', () => {
    test('every manifest.json build part path resolves to a file on disk', () => {
        expect(Array.isArray(manifest.builds)).toBe(true);
        expect(manifest.builds.length).toBeGreaterThan(0);
        for (const build of manifest.builds) {
            expect(Array.isArray(build.parts)).toBe(true);
            expect(build.parts.length).toBeGreaterThan(0);
            for (const part of build.parts) {
                expect(typeof part.path).toBe('string');
                expect(part.path.length).toBeGreaterThan(0);
                const resolved = path.resolve(repoRoot, part.path);
                if (!fs.existsSync(resolved)) {
                    throw new Error(
                        `manifest.json references missing firmware file: ${part.path} ` +
                            `(config_string=${build.config_string ?? '<none>'}, ` +
                            `version=${build.version ?? '<none>'}, ` +
                            `channel=${build.channel ?? '<none>'}). ` +
                            'Regenerate manifest.json from the current firmware/ ' +
                            'tree via `python3 scripts/gen-manifests.py --summary`.'
                    );
                }
            }
        }
    });

    test('every firmware-N.json build part path resolves to a file on disk', () => {
        const perBuild = listPerBuildManifests();
        expect(perBuild.length).toBeGreaterThan(0);
        for (const name of perBuild) {
            const data = readPerBuildManifest(name);
            expect(Array.isArray(data.builds)).toBe(true);
            expect(data.builds.length).toBeGreaterThan(0);
            for (const build of data.builds) {
                expect(Array.isArray(build.parts)).toBe(true);
                for (const part of build.parts) {
                    expect(typeof part.path).toBe('string');
                    const resolved = path.resolve(repoRoot, part.path);
                    if (!fs.existsSync(resolved)) {
                        throw new Error(
                            `${name} references missing firmware file: ${part.path}. ` +
                                'Regenerate the per-build manifests via ' +
                                '`python3 scripts/gen-manifests.py --summary`.'
                        );
                    }
                }
            }
        }
    });
});

describe('manifest health — sidecars exist for normal firmware', () => {
    test('every firmware/configurations/*.bin has a sibling .meta.json', () => {
        // Rescue firmware under firmware/rescue/ is exempt: it ships its own
        // per-product firmware/rescue/manifest.json instead of a
        // <asset>.meta.json sidecar. See docs/webflash-cleanup-audit.md.
        const bins = fs
            .readdirSync(configurationsDir)
            .filter(name => name.endsWith('.bin'));
        expect(bins.length).toBeGreaterThan(0);
        const missing = [];
        for (const bin of bins) {
            const sidecar = bin.replace(/\.bin$/, '.meta.json');
            if (!fs.existsSync(path.join(configurationsDir, sidecar))) {
                missing.push(sidecar);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'firmware/configurations/ binaries are missing required ' +
                    `.meta.json sidecars: ${missing.join(', ')}`
            );
        }
    });
});

describe('manifest health — manifest.json and firmware-*.json in sync', () => {
    const perBuild = listPerBuildManifests();

    test('firmware-*.json count matches manifest.json build count', () => {
        expect(perBuild.length).toBe(manifest.builds.length);
    });

    test('every firmware-N.json corresponds to a manifest.json build by part path', () => {
        const manifestPaths = new Set(
            manifest.builds.flatMap(b => b.parts.map(p => p.path))
        );
        const orphans = [];
        for (const name of perBuild) {
            const data = readPerBuildManifest(name);
            expect(data.builds.length).toBe(1);
            const partPaths = data.builds[0].parts.map(p => p.path);
            for (const p of partPaths) {
                if (!manifestPaths.has(p)) {
                    orphans.push({ name, path: p });
                }
            }
        }
        if (orphans.length > 0) {
            throw new Error(
                'firmware-*.json files reference paths that are not in ' +
                    'manifest.json (stale per-build manifest): ' +
                    orphans.map(o => `${o.name} -> ${o.path}`).join('; ')
            );
        }
    });

    test('every manifest.json build has a matching firmware-N.json', () => {
        const perBuildPaths = new Set(
            perBuild.flatMap(name =>
                readPerBuildManifest(name).builds.flatMap(b =>
                    b.parts.map(p => p.path)
                )
            )
        );
        const missing = [];
        for (const build of manifest.builds) {
            for (const part of build.parts) {
                if (!perBuildPaths.has(part.path)) {
                    missing.push(part.path);
                }
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'manifest.json builds have no matching firmware-N.json ' +
                    `(per-build manifest missing): ${missing.join(', ')}`
            );
        }
    });
});

describe('manifest health — blocked/excluded tokens stay out of generated manifests', () => {
    test('no manifest build config_string contains FanTRIAC', () => {
        // FanTRIAC is globally blocked while S360-320 hardware verification
        // is pending. See firmware/sources.json block_tokens and
        // docs/webflash-cleanup-audit.md.
        const offenders = manifest.builds
            .map(b => b.config_string)
            .filter(cs => typeof cs === 'string' && containsBlockToken(cs, 'FanTRIAC'));
        if (offenders.length > 0) {
            throw new Error(
                'FanTRIAC is blocked but appears in manifest.json config_strings: ' +
                    offenders.join(', ')
            );
        }
    });

    test('each firmware/sources.json source enforces its own block_tokens on the matching manifest build', () => {
        // Per-source enforcement: do NOT globally ban tokens like LED (the
        // repo may add an LED build later). Instead, for each source that
        // declares block_tokens, find its matching manifest build by
        // config_string and assert none of the blocked tokens appear in
        // that build's config_string.
        for (const entry of sources.sources) {
            if (!Array.isArray(entry.block_tokens) || entry.block_tokens.length === 0) {
                continue;
            }
            const build = manifest.builds.find(
                b => b.config_string === entry.config_string
            );
            if (!build) {
                continue;
            }
            for (const token of entry.block_tokens) {
                if (containsBlockToken(build.config_string, token)) {
                    throw new Error(
                        `Source ${entry.source_repo}@${entry.release_tag} blocks ` +
                            `token "${token}" but it appears in manifest build ` +
                            `config_string="${build.config_string}".`
                    );
                }
            }
        }
    });
});

describe('manifest health — REQUIRED_CONFIGS alignment', () => {
    test('every REQUIRED_CONFIGS entry appears as a manifest config_string', () => {
        const required = parseRequiredConfigsFromWorkflow();
        const present = new Set(
            manifest.builds
                .map(b => b.config_string)
                .filter(cs => typeof cs === 'string')
        );
        const missing = required.filter(cs => !present.has(cs));
        if (missing.length > 0) {
            throw new Error(
                'REQUIRED_CONFIGS entries are missing from manifest.json: ' +
                    `${missing.join(', ')}. Regenerate via ` +
                    '`python3 scripts/gen-manifests.py --summary` after ensuring ' +
                    'the corresponding firmware is on disk.'
            );
        }
    });
});
