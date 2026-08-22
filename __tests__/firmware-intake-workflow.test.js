/**
 * Firmware-intake workflow shape guard.
 *
 * .github/workflows/firmware-intake.yml is the combined intake happy path
 * (source authoring + import + retirement + fixture refresh + manifest regen
 * + tests, staged onto one intake/<config> branch with one PR to main). Its
 * safety posture is load-bearing, so this suite pins it textually, the same
 * way the REQUIRED_CONFIGS guards pin firmware-publish.yml's shape:
 *
 *   1. Triggers are workflow_dispatch + repository_dispatch(firmware-intake)
 *      ONLY — no push/schedule/pull_request trigger can ever run intake
 *      implicitly.
 *   2. Permissions are exactly contents+pull-requests write — no pages, no
 *      id-token, so the workflow cannot deploy even if a step tried.
 *   3. No deploy action is referenced; publication stays with
 *      firmware-publish.yml.
 *   4. Every git push targets the computed intake branch, never main, and
 *      the explicit main guard is present.
 *   5. Dispatch inputs (including the untrusted repository_dispatch payload)
 *      are passed through env only — no `${{ ... }}` interpolation inside
 *      any run body (shell-injection guard, mirroring add-firmware-source.yml
 *      / firmware-import.yml).
 *   6. The run drives scripts/firmware-intake.py and keeps the naming
 *      validator, manifest regeneration, readiness classifier, and both
 *      unit-test suites in the loop.
 *   7. The superseded Release 4 / Release 5 workflows still exist unchanged
 *      as recovery paths (backwards compatibility), and the old false claim
 *      that firmware-import runs "on the resulting merge" stays gone.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

const intakePath = join(WORKFLOWS, 'firmware-intake.yml');
const intakeYaml = readFileSync(intakePath, 'utf8');

/** Extract the top-level `on:` trigger block (up to the next top-level key). */
function topLevelBlock(yaml, key) {
    const re = new RegExp(`^${key}:\\s*$`, 'm');
    const start = yaml.search(re);
    if (start === -1) {
        return null;
    }
    const rest = yaml.slice(start);
    const afterFirstLine = rest.indexOf('\n') + 1;
    const next = rest.slice(afterFirstLine).search(/^[a-zA-Z_-]+:/m);
    return next === -1 ? rest : rest.slice(0, afterFirstLine + next);
}

/** Collect every `run:` body (block scalars and single-line runs). */
function runBodies(yaml) {
    const lines = yaml.split('\n');
    const bodies = [];
    let block = null;
    let indent = 0;
    for (const line of lines) {
        if (block !== null) {
            if (line.trim() === '') {
                block.push(line);
                continue;
            }
            const lead = line.match(/^(\s*)/)[1].length;
            if (lead > indent) {
                block.push(line);
                continue;
            }
            bodies.push(block.join('\n'));
            block = null;
        }
        const blockStart = line.match(/^(\s*)run: \|/);
        if (blockStart) {
            block = [];
            indent = blockStart[1].length;
            continue;
        }
        const single = line.match(/^\s*run: (?!\|)(.*)$/);
        if (single) {
            bodies.push(single[1]);
        }
    }
    if (block !== null) {
        bodies.push(block.join('\n'));
    }
    return bodies;
}

describe('firmware-intake workflow — trigger and permission posture', () => {
    test('triggers are workflow_dispatch and repository_dispatch(firmware-intake) only', () => {
        const onBlock = topLevelBlock(intakeYaml, 'on');
        expect(onBlock).not.toBeNull();
        expect(onBlock).toMatch(/workflow_dispatch:/);
        expect(onBlock).toMatch(/repository_dispatch:/);
        expect(onBlock).toMatch(/types: \[firmware-intake\]/);
        expect(onBlock).not.toMatch(/^\s{2}push:/m);
        expect(onBlock).not.toMatch(/^\s{2}schedule:/m);
        expect(onBlock).not.toMatch(/^\s{2}pull_request:/m);
        expect(onBlock).not.toMatch(/^\s{2}release:/m);
    });

    test('permissions are exactly contents:write + pull-requests:write', () => {
        const permBlock = topLevelBlock(intakeYaml, 'permissions');
        expect(permBlock).not.toBeNull();
        expect(permBlock).toMatch(/contents: write/);
        expect(permBlock).toMatch(/pull-requests: write/);
        expect(permBlock).not.toMatch(/pages/);
        expect(permBlock).not.toMatch(/id-token/);
    });

    test('no deploy action is referenced — publication stays with firmware-publish.yml', () => {
        expect(intakeYaml).not.toMatch(/deploy-pages/);
        expect(intakeYaml).not.toMatch(/upload-pages-artifact/);
        expect(intakeYaml).not.toMatch(/configure-pages/);
        expect(intakeYaml).toMatch(/firmware-publish\.yml remains the (sole )?publication boundary/);
    });
});

describe('firmware-intake workflow — push and injection safety', () => {
    test('every git push targets the intake branch, never main', () => {
        const pushes = intakeYaml
            .split('\n')
            .filter((line) => /git push/.test(line));
        expect(pushes.length).toBeGreaterThan(0);
        for (const line of pushes) {
            expect(line).toMatch(/"\$\{INTAKE_BRANCH\}"/);
            expect(line).not.toMatch(/\bmain\b/);
        }
        expect(intakeYaml).toMatch(/Refusing to target main/);
    });

    test('no expression interpolation inside run bodies (env-only input passing)', () => {
        const bodies = runBodies(intakeYaml);
        expect(bodies.length).toBeGreaterThan(0);
        for (const body of bodies) {
            expect(body).not.toContain('${{');
        }
    });

    test('dispatch inputs are shape-validated before use (dry_run included)', () => {
        expect(intakeYaml).toMatch(/\^\[A-Za-z0-9\]\[A-Za-z0-9-\]\{0,63\}\$/);
        expect(intakeYaml).toMatch(/config_string has an invalid shape/);
        // dry_run reaches a GITHUB_ENV write, so it must be validated to an
        // exact boolean literal — the GITHUB_ENV newline-injection guard.
        expect(intakeYaml).toMatch(/dry_run must be exactly true or false/);
    });

    test('push steps re-guard the intake/ branch prefix at push time', () => {
        const guards = intakeYaml.match(/intake\/\*\)/g) || [];
        expect(guards.length).toBeGreaterThanOrEqual(2);
    });
});

describe('firmware-intake workflow — pipeline steps stay wired', () => {
    test('drives the combined orchestrator and the existing gates', () => {
        expect(intakeYaml).toMatch(/scripts\/firmware-intake\.py/);
        expect(intakeYaml).toMatch(/validate-naming-policy\.js firmware\/configurations/);
        expect(intakeYaml).toMatch(/gen-manifests\.py/);
        expect(intakeYaml).toMatch(/validate:product-import-readiness/);
        expect(intakeYaml).toMatch(/npm test -- --ci/);
        expect(intakeYaml).toMatch(/unittest discover -s __tests__\/python/);
    });

    test('stages only the allowlisted intake paths (never git add -A)', () => {
        // Command position only — the comment explaining the rule may name it.
        expect(intakeYaml).not.toMatch(/^\s*git add -A\b/m);
        expect(intakeYaml).toMatch(/firmware\/sources\.json/);
        expect(intakeYaml).toMatch(/__tests__\/fixtures\/esphome-product-catalog\.json/);
        expect(intakeYaml).toMatch(/__tests__\/fixtures\/expected-surface\.json/);
    });

    test('labels retired entries with the run URL and resolves them, scoped, to the PR number', () => {
        expect(intakeYaml).toMatch(/--retired-in "\$\{RUN_URL\}"/);
        expect(intakeYaml).toMatch(/--set-retired-in/);
        expect(intakeYaml).toMatch(/--retired-in-match "\$\{RUN_URL\}"/);
    });

    test('the committed expected-surface fixture carries no unresolved retired_in placeholder', () => {
        // The orchestrator's CLI default label is a placeholder; the workflow
        // always overrides it with the run URL, and a local operator run must
        // resolve it before merging. A placeholder in the committed fixture
        // is always a mistake.
        const fixture = readFileSync(
            join(ROOT, '__tests__', 'fixtures', 'expected-surface.json'),
            'utf8'
        );
        expect(fixture).not.toContain('PENDING-INTAKE-PR');
    });

    test('authorisation language pins the WebFlash-owned eligibility lanes', () => {
        expect(intakeYaml).toMatch(/webflash_build_matrix/);
        expect(intakeYaml).toMatch(/webflash_import_eligibility/);
        expect(intakeYaml).toMatch(/never consulted|never by upstream lifecycle status|never from upstream/i);
    });
});

describe('firmware-intake workflow — backwards compatibility with Release 4/5', () => {
    test('the superseded workflows still exist as recovery paths', () => {
        expect(existsSync(join(WORKFLOWS, 'add-firmware-source.yml'))).toBe(true);
        expect(existsSync(join(WORKFLOWS, 'firmware-import.yml'))).toBe(true);
        const addSource = readFileSync(
            join(WORKFLOWS, 'add-firmware-source.yml'),
            'utf8'
        );
        const importYaml = readFileSync(
            join(WORKFLOWS, 'firmware-import.yml'),
            'utf8'
        );
        expect(addSource).toMatch(/workflow_dispatch:/);
        expect(importYaml).toMatch(/workflow_dispatch:/);
    });

    test('the false "runs on the resulting merge" chaining claim stays gone', () => {
        const addSource = readFileSync(
            join(WORKFLOWS, 'add-firmware-source.yml'),
            'utf8'
        );
        // firmware-import.yml is a separate manual dispatch; nothing runs it
        // on merge. The corrected comments must say so, and the old claim
        // must not come back.
        expect(addSource).not.toMatch(/which run on the resulting merge/);
        expect(addSource).not.toMatch(
            /On merge, the existing[\s\S]{0,80}firmware-import/
        );
        expect(addSource).toMatch(/SEPARATE\s+MANUAL/i);
        expect(addSource).toMatch(/does NOT\s*(\n\s*#\s*)?trigger it|does NOT[\s\S]{0,40}trigger/);
    });
});
