import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// WEBFLASH-ARCH-DOCS-001 — architecture documentation guard.
//
// The best architectural explanation (the two halves meeting at manifest.json,
// the desktop-only constraint, the ESP Web Tools standard, the cross-repo
// contract, and the deploy gate) was promoted out of the AI-facing CLAUDE.md
// into a human-facing doc (docs/architecture.md). This guard pins the
// invariants that promotion depends on so the doc and its inbound links cannot
// silently disappear or drift:
//
//   - the human-facing architecture doc exists,
//   - it covers the two-halves model, the manifest boundary, the desktop
//     constraint, the ESP Web Tools standard, the cross-repo contract, and the
//     deploy gate (naming the manifest-health guard, block_tokens, and
//     REQUIRED_CONFIGS),
//   - CLAUDE.md links to it (de-duplication anchor),
//   - README.md links to it under the Overview.
//
// This is a docs-only guard: it reads files, it changes no surface. Mirrors the
// style of __tests__/sense360-webflash-status.test.js.

const repoRoot = process.cwd();
const archDocPath = path.join(repoRoot, 'docs', 'architecture.md');
const claudePath = path.join(repoRoot, 'CLAUDE.md');
const readmePath = path.join(repoRoot, 'README.md');

const archDoc = fs.readFileSync(archDocPath, 'utf8');
const claude = fs.readFileSync(claudePath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');

describe('WEBFLASH-ARCH-DOCS-001 — human-facing architecture doc exists', () => {
    test('docs/architecture.md exists and is the architecture doc', () => {
        expect(fs.existsSync(archDocPath)).toBe(true);
        expect(archDoc).toMatch(/WEBFLASH-ARCH-DOCS-001/);
        expect(archDoc.toLowerCase()).toContain('architecture');
    });

    test('it covers the two-halves model and the manifest.json boundary', () => {
        expect(archDoc.toLowerCase()).toMatch(/two halves/);
        expect(archDoc).toContain('manifest.json');
        expect(archDoc.toLowerCase()).toContain('publishing pipeline');
        expect(archDoc.toLowerCase()).toContain('wizard frontend');
    });

    test('it explains the desktop-only Web Serial constraint and the ESP Web Tools standard', () => {
        expect(archDoc).toMatch(/Web Serial/);
        expect(archDoc.toLowerCase()).toMatch(/chromium/);
        expect(archDoc).toMatch(/ESP Web Tools/);
    });

    test('it states WebFlash is downstream of esphome-public and links its system-architecture doc', () => {
        expect(archDoc.toLowerCase()).toContain('downstream');
        expect(archDoc).toContain('sense360store/esphome-public');
        expect(archDoc).toContain('firmware/sources.json');
        expect(archDoc).toContain('docs/system-architecture.md');
    });
});

describe('WEBFLASH-ARCH-DOCS-001 — deploy gate is documented', () => {
    test('the doc names the manifest-health guard, block_tokens, and REQUIRED_CONFIGS', () => {
        expect(archDoc).toContain('manifest-health');
        expect(archDoc).toContain('__tests__/manifest-health.test.js');
        expect(archDoc).toContain('block_tokens');
        expect(archDoc).toContain('REQUIRED_CONFIGS');
    });

    test('the doc explains both the publish trigger and the publish gate', () => {
        expect(archDoc).toContain('firmware-publish.yml');
        expect(archDoc.toLowerCase()).toMatch(/on push|on-push|trigger/);
        expect(archDoc.toLowerCase()).toMatch(/gate/);
    });
});

describe('WEBFLASH-ARCH-DOCS-001 — inbound links keep the docs from drifting', () => {
    test('CLAUDE.md links to docs/architecture.md instead of duplicating the prose', () => {
        expect(claude).toContain('docs/architecture.md');
    });

    test('README.md links to docs/architecture.md', () => {
        expect(readme).toContain('docs/architecture.md');
    });

    test('the canonical SKU table is not copied into docs/architecture.md', () => {
        // The authoritative SKU table stays in CLAUDE.md; architecture.md must
        // link to it rather than duplicate it. The CLAUDE.md table header row
        // must NOT appear in the architecture doc.
        expect(claude).toContain('| Group | Type | Friendly name | SKU | Rev | Old name | What it does |');
        expect(archDoc).not.toContain('| Group | Type | Friendly name | SKU | Rev | Old name | What it does |');
        expect(archDoc).toContain('CLAUDE.md');
    });
});
