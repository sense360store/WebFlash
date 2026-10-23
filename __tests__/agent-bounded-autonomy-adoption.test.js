import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// AGENT-BOUNDED-AUTONOMY-001 — WebFlash adoption contract guard.
//
// The bounded agent autonomy contract is owned by sense360store/SOT
// (CLAUDE-OPERATING-MODEL.md, section "AGENT-BOUNDED-AUTONOMY-001: bounded
// autonomy"). Its rollout plan requires WebFlash to reference that section
// from CLAUDE.md and to tighten it for distribution work: manifests, install
// gates, release channels and signing are never autonomous. This guard pins
// the adoption section so it cannot silently disappear, drift from the SOT
// contract, or widen the agent's authority:
//
//   - CLAUDE.md carries the adoption section naming the programme ID and
//     linking the SOT operating model instead of duplicating it,
//   - the distribution tightening lists manifests, install gates, release
//     channels and signing as never autonomous,
//   - the five SOT terminal states are named and no local sixth is added,
//   - merging is either covered by a quoted, sourced owner instruction for
//     WebFlash, or stated plainly as owner-only,
//   - the tighter repository rules already in CLAUDE.md survive.
//
// This is a docs-only guard: it reads files, it changes no surface. Mirrors
// the style of __tests__/architecture-doc.test.js.

const repoRoot = process.cwd();
const claudePath = path.join(repoRoot, 'CLAUDE.md');
const claude = fs.readFileSync(claudePath, 'utf8');

const SECTION_HEADING = '### Bounded agent autonomy (AGENT-BOUNDED-AUTONOMY-001)';
const OPERATING_MODEL_URL =
    'https://github.com/sense360store/SOT/blob/main/CLAUDE-OPERATING-MODEL.md';

function adoptionSection() {
    const start = claude.indexOf(SECTION_HEADING);
    if (start === -1) return '';
    const rest = claude.slice(start + SECTION_HEADING.length);
    const next = rest.search(/^## /m);
    return next === -1 ? rest : rest.slice(0, next);
}

const section = adoptionSection();
// Collapse whitespace so assertions survive line wrapping.
const flat = section.replace(/\s+/g, ' ');

describe('AGENT-BOUNDED-AUTONOMY-001 — adoption section exists', () => {
    test('CLAUDE.md carries the adoption section', () => {
        expect(claude).toContain(SECTION_HEADING);
        expect(section.length).toBeGreaterThan(0);
    });

    test('it names the programme ID and adopts the contract', () => {
        expect(flat).toMatch(/adopts AGENT-BOUNDED-AUTONOMY-001/);
    });

    test('it references the SOT operating model by its canonical main link', () => {
        expect(section).toContain('CLAUDE-OPERATING-MODEL.md');
        expect(section).toContain(OPERATING_MODEL_URL);
    });

    test('it records adoption provenance as an SOT main commit', () => {
        expect(section).toMatch(
            /https:\/\/github\.com\/sense360store\/SOT\/commit\/[0-9a-f]{40}/
        );
    });

    test('it states local rules tighten and never loosen the contract', () => {
        expect(flat).toMatch(/tighten but never loosen/i);
        expect(flat).toMatch(/stricter safety rule wins/i);
        expect(flat).toContain('BLOCKED_AUTHORITY_CONFLICT');
    });
});

describe('AGENT-BOUNDED-AUTONOMY-001 — distribution tightening', () => {
    function neverAutonomousList() {
        const start = section.indexOf('**Never autonomous in this repository**');
        expect(start).toBeGreaterThan(-1);
        const rest = section.slice(start);
        const end = rest.indexOf('**Read-only observation stays allowed**');
        expect(end).toBeGreaterThan(-1);
        return rest.slice(0, end).replace(/\s+/g, ' ').toLowerCase();
    }

    test('manifests are never autonomous', () => {
        const list = neverAutonomousList();
        expect(list).toContain('manifest.json');
        expect(list).toMatch(/manifests?\b/);
    });

    test('install gates are never autonomous', () => {
        expect(neverAutonomousList()).toMatch(/install gates?/);
    });

    test('release channels are never autonomous', () => {
        expect(neverAutonomousList()).toMatch(/release channels?/);
    });

    test('signing is never autonomous', () => {
        expect(neverAutonomousList()).toMatch(/signing/);
    });

    test('publishing, tagging, releasing and workflow dispatch stay owner-reserved', () => {
        const list = neverAutonomousList();
        expect(list).toMatch(/tag/);
        expect(list).toMatch(/release/);
        expect(list).toMatch(/dispatch/);
        expect(list).toContain('firmware-publish.yml');
    });
});

describe('AGENT-BOUNDED-AUTONOMY-001 — terminal states', () => {
    test('the five SOT terminal states are named', () => {
        for (const state of [
            'READY_FOR_OWNER_REVIEW',
            'BLOCKED_OWNER_DECISION',
            'BLOCKED_EXTERNAL_ACCESS',
            'BLOCKED_AUTHORITY_CONFLICT',
            'UNSAFE_TO_PROCEED',
        ]) {
            expect(section).toContain(state);
        }
    });

    test('no local sixth state is defined and the escalation rule stays conjunctive', () => {
        expect(flat).toMatch(/no sixth local state/i);
        expect(flat).toMatch(/all four/i);
    });
});

describe('AGENT-BOUNDED-AUTONOMY-001 — merge authority', () => {
    const adoptsDelegation = /adopts the conditional merge delegation/i.test(flat);

    test('merging is owner-only, or an authorising owner instruction is quoted with its source', () => {
        if (adoptsDelegation) {
            expect(flat).toMatch(/Authorising instruction/);
            expect(section).toMatch(
                /https:\/\/github\.com\/sense360store\/(WebFlash|SOT)\/[^\s)]+/
            );
        } else {
            expect(flat).toMatch(/merges remain owner-only/i);
            expect(flat).toMatch(/does not adopt the conditional merge delegation/i);
        }
    });

    test('other repositories’ delegations are not treated as covering WebFlash', () => {
        expect(flat).toMatch(/does not transfer by implication/i);
        expect(flat).toContain('esphome-public');
        expect(flat).toContain('sense360zones');
    });

    test('the agent never self-accepts or self-merges its own PR', () => {
        expect(flat).toMatch(/never self-accept/i);
    });
});

describe('AGENT-BOUNDED-AUTONOMY-001 — tighter repository rules survive', () => {
    test('existing WebFlash guardrails are still present in CLAUDE.md', () => {
        expect(claude).toContain('Never push to `main` directly.');
        expect(claude).toContain('Never weaken a blocking gate');
        expect(claude).toContain('**Preview stays gated.**');
        expect(claude).toContain('**FanTRIAC stays import-blocked.**');
        expect(claude).toContain('docs/standing-invariants.md');
    });
});
