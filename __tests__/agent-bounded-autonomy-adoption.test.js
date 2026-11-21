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
//   - merging is owner-only: neither the conditional merge delegation nor
//     the review-and-decide delegation is adopted,
//   - the routine `sw.js` / `_headers` instructions point at the
//     never-autonomous rule,
//   - the tighter repository rules already in CLAUDE.md survive.
//
// Presence checks alone do not stop the section widening: a mutation that
// adds a permission elsewhere keeps every required phrase intact. So the
// owner-reserved paragraphs and bullets are pinned verbatim, the terminal
// states are pinned as an exact set, and negative scans reject any clause
// that grants autonomy over dispatch, merge, sign, publish, release, tag,
// deploy, promote or regenerate. Any edit to pinned text — tightening
// included — must update this test in the same owner-accepted PR.
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
const squash = (text) => text.replace(/\s+/g, ' ').trim();
const flat = squash(section);

// The paragraph of the adoption section that starts with `marker`, up to
// the next blank line, whitespace-collapsed.
function paragraph(marker) {
    const start = section.indexOf(marker);
    if (start === -1) return '';
    const rest = section.slice(start);
    const end = rest.indexOf('\n\n');
    return squash(end === -1 ? rest : rest.slice(0, end));
}

// Verbs that must never appear as an autonomous grant in this repository.
const RESERVED_VERBS =
    /\b(dispatch\w*|merg\w*|sign|signs|signing|publish\w*|releas(e|es|ing)|tag|tags|tagging|deploy\w*|promot\w*|regenerat\w*)\b/i;
const NEGATION = /\b(never|not|no|owner-reserved|owner-only)\b/i;

// Clauses of the section: sentences, `;`-separated parts and list items.
const clauses = flat.split(/(?:[.;:]\s+|\s-\s)/).filter(Boolean);

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

const PINNED_AUTONOMOUS = squash(`**Autonomous within an authorised task** (the distribution-scoped
instantiation of the SOT autonomous permissions): inspect source, data
files, generated manifests, history, PRs, and CI; add or update wizard,
documentation, and test code inside this repository's authority and
outside the never-autonomous surfaces below; run the Jest suite, the
naming-policy validator, and \`scripts/gen-manifests.py\` in
\`--dry-run\` mode only; inspect existing manifests, served binaries,
signatures, and release evidence read-only; remediate every
branch-caused test or CI failure; create and maintain one draft PR on a
\`claude/...\` branch; and prepare a separate SOT reconciliation
recommendation when distribution evidence materially changes programme
state.`);

const PINNED_NEVER_AUTONOMOUS_BULLETS = [
    `manifests: changing \`manifest.json\`, any \`firmware-*.json\`, or any
  generated manifest output, including running \`scripts/gen-manifests.py\`
  in writing mode and committing the result, adding or removing a
  \`REQUIRED_CONFIGS\` entry, or editing \`firmware/sources.json\`,
  \`firmware/sources-policy.json\`, or any firmware binary or \`.meta.json\`
  sidecar;`,
    `install gates: changing the install, download, provenance, SHA-256,
  signature, manifest freshness, service-worker update, preflight, or
  advanced/manual-warning acknowledgement gates (\`evaluateInstallGate\`,
  \`verifyFirmwareIntegrity\`, \`evaluatePreflightPolicy\` and the engine
  modules that feed them), and weakening or bypassing any gate in any way;`,
    `release channels: changing channel policy in
  \`scripts/utils/release-channels.js\` (\`defaultSelectable\`,
  \`requiresAcknowledgement\`, \`hiddenByDefault\`), promoting or demoting a
  build between channels, or exposing any kit, module, room preset, or
  channel that is not already exposed;`,
    `signing: generating, rotating, adding, or removing signing keys, editing
  the pinned trust list \`scripts/utils/firmware-trusted-keys.js\`, changing
  the signing step in \`.github/workflows/firmware-publish.yml\`, or
  claiming signature verification the engine has not performed;`,
    `dispatch any workflow that can import, publish, sign, or deploy
  firmware: in particular \`firmware-publish.yml\`, \`firmware-intake.yml\`,
  \`firmware-import.yml\`, and \`add-firmware-source.yml\`;`,
    `create or publish a tag or GitHub Release, or deploy the site;`,
    `merge any PR (see *Merge authority* below);`,
    `edit \`sw.js\` (the \`STATIC_ASSETS\` or \`SCRIPT_MODULES\` precache lists,
  \`CACHE_NAME\`, or any cache or fetch strategy) or \`_headers\` (CSP, CORS,
  cache rules) except under a task that explicitly authorises that edit; the
  routine instructions elsewhere in this file that tell you to make these
  edits apply only once a task has authorised them;`,
    `change commercial copy, bundle visibility, buyability, or
  \`scripts/data/sot-commercial-mirror.json\` other than through its
  generator from a local SOT checkout;`,
    `claim hardware, bench, compliance, customer, or commercial evidence, or
  author or amend operator attestations;`,
    `change SOT programme status in this repository.`,
].map(squash);

const PINNED_WORKFLOW_DISTINCTION = squash(`**Workflow distinction**: routine PR CI and validation inspection is
autonomous; branch-caused CI remediation is autonomous; dispatching or
rerunning any workflow is owner-reserved in this repository.`);

const PINNED_TERMINAL_STATES = squash(`**Terminal states**: the five SOT terminal states apply exactly as defined
in the SOT contract (\`READY_FOR_OWNER_REVIEW\`, \`BLOCKED_OWNER_DECISION\`,
\`BLOCKED_EXTERNAL_ACCESS\`, \`BLOCKED_AUTHORITY_CONFLICT\`,
\`UNSAFE_TO_PROCEED\`), and this repository defines no sixth local state.
The conjunctive escalation rule is preserved unchanged: the owner may be
interrupted only when **all four** SOT threshold conditions hold
simultaneously.`);

const PINNED_NO_MERGE_DELEGATION = squash(`This repository **does not adopt the conditional merge delegation**
defined in the SOT operating model. No owner instruction authorising that
delegation for WebFlash specifically has been recorded, so **WebFlash
merges remain owner-only**: every PR here, whatever its state, is merged
by the owner.`);

const PINNED_NO_REVIEW_DELEGATION = squash(`This repository also **does not adopt the review-and-decide
delegation** defined in the SOT operating model: reviewing and accepting
every PR here, agent-authored or not, remains owner-only.`);

const PINNED_NO_SELF_ACCEPT = squash(`Agents never self-accept or self-merge a PR, including a governance
amendment such as this one that would create or widen the agent's own
authority. CI green, a clean mergeable state and owner silence are not
acceptance.`);

const TERMINAL_STATES = [
    'READY_FOR_OWNER_REVIEW',
    'BLOCKED_OWNER_DECISION',
    'BLOCKED_EXTERNAL_ACCESS',
    'BLOCKED_AUTHORITY_CONFLICT',
    'UNSAFE_TO_PROCEED',
];

describe('AGENT-BOUNDED-AUTONOMY-001 — owner reservations are pinned verbatim', () => {
    test('the autonomous permissions paragraph is exactly the pinned text', () => {
        expect(paragraph('**Autonomous within an authorised task**')).toBe(PINNED_AUTONOMOUS);
    });

    test('the autonomous permissions grant no reserved verb outside read-only inspection', () => {
        const grants = paragraph('**Autonomous within an authorised task**').split(/[;:]\s+/).filter(
            (clause) => !/read-only/.test(clause)
        );
        for (const clause of grants) {
            expect(clause).not.toMatch(RESERVED_VERBS);
        }
    });

    test('every pinned never-autonomous bullet is present verbatim', () => {
        const start = section.indexOf('**Never autonomous in this repository**');
        const end = section.indexOf('**Read-only observation stays allowed**');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const bullets = section
            .slice(start, end)
            .split(/\n- /)
            .slice(1)
            .map(squash);
        for (const pinned of PINNED_NEVER_AUTONOMOUS_BULLETS) {
            expect(bullets).toContain(pinned);
        }
    });

    test('the workflow distinction keeps dispatch owner-reserved', () => {
        expect(paragraph('**Workflow distinction**')).toBe(PINNED_WORKFLOW_DISTINCTION);
    });

    test('no clause anywhere in the section grants autonomy over a reserved action', () => {
        const offending = clauses.filter(
            (clause) =>
                /\bautonomous(ly)?\b/i.test(clause) &&
                RESERVED_VERBS.test(clause) &&
                !NEGATION.test(clause)
        );
        expect(offending).toEqual([]);
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
    test('the terminal states paragraph is exactly the pinned text', () => {
        expect(paragraph('**Terminal states**')).toBe(PINNED_TERMINAL_STATES);
    });

    test('the section names exactly the five SOT terminal states, no more', () => {
        const named = new Set(flat.match(/\b(?:READY|BLOCKED|UNSAFE)_[A-Z_]+\b/g) || []);
        expect([...named].sort()).toEqual([...TERMINAL_STATES].sort());
        expect(flat).not.toMatch(/\b[A-Z]+_TO_MERGE\b/);
    });

    test('no local sixth state is defined and the escalation rule stays conjunctive', () => {
        expect(flat).toMatch(/no sixth local state/i);
        expect(flat).toMatch(/only when \*\*all four\*\* SOT threshold conditions hold/);
        expect(flat).not.toMatch(/\b(any|either|one|some) (of )?(the )?(four|threshold)\b/i);
    });
});

// No owner instruction adopting a delegation for WebFlash is recorded, so
// the guard pins non-adoption outright. Adopting one later is its own
// owner-accepted PR, which must change these assertions in the same diff.
describe('AGENT-BOUNDED-AUTONOMY-001 — merge authority', () => {
    test('the conditional merge delegation is not adopted and merges stay owner-only', () => {
        expect(flat).toContain(PINNED_NO_MERGE_DELEGATION);
    });

    test('the review-and-decide delegation is not adopted', () => {
        expect(flat).toContain(PINNED_NO_REVIEW_DELEGATION);
    });

    test('no sentence adopts any delegation or records an authorising instruction', () => {
        const adopting = clauses.filter(
            (clause) =>
                /\b(adopts?|adopted)\b/i.test(clause) &&
                /delegation/i.test(clause) &&
                !/\bnot\b/i.test(clause)
        );
        expect(adopting).toEqual([]);
        expect(flat).not.toMatch(/authori[sz]ing (owner )?instruction\s*:/i);
    });

    test('other repositories’ delegations are not treated as covering WebFlash', () => {
        expect(flat).toMatch(/does not transfer by implication/i);
        expect(flat).toContain('esphome-public');
        expect(flat).toContain('sense360zones');
    });

    test('the agent never self-accepts or self-merges its own PR', () => {
        expect(flat).toContain(PINNED_NO_SELF_ACCEPT);
    });
});

describe('AGENT-BOUNDED-AUTONOMY-001 — routine sw.js / _headers edits need authorisation', () => {
    const POINTER = /never autonomous \(see \*Bounded agent autonomy\* above\)/;

    function lineContaining(fragment) {
        const line = claude.split('\n').find((l) => l.includes(fragment));
        expect(line).toBeDefined();
        return line;
    }

    test('the STATIC_ASSETS / SCRIPT_MODULES instruction points at the rule', () => {
        const line = lineContaining('add them to `STATIC_ASSETS` or `SCRIPT_MODULES` in `sw.js`');
        expect(line).toMatch(POINTER);
        expect(line).toMatch(/only under a task that explicitly authorises it/);
    });

    test('the CACHE_NAME instruction points at the rule', () => {
        const line = lineContaining('The cache name lives in `CACHE_NAME` in `sw.js`');
        expect(line).toMatch(POINTER);
        expect(line).toMatch(/only under a task that explicitly authorises it/);
    });

    test('the CSP instruction for `_headers` points at the rule', () => {
        const line = lineContaining('update the CSP there');
        expect(line).toMatch(/editing `_headers` is never autonomous \(see \*Bounded agent autonomy\* above\)/);
        expect(line).toMatch(/only under a task that explicitly authorises it/);
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
