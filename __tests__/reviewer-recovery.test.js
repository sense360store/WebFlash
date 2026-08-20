/**
 * SENSE360-REVIEW-RELEASE-001 (#604) — reviewer recovery / reflash contract.
 *
 * The reviewer unit is Sense360 Core + RoomIQ + AirIQ. A reviewer must be able
 * to recover or reflash it from a documented link without knowing the config
 * string, without touching the fan / TRIAC / experimental journey, and without
 * being told anything about commercial availability.
 *
 * The defect this suite pins: the 2.0 view is the sole view and never calls the
 * 1.0 initializeWizard(), so nothing applied the URL to the engine before the
 * builder read it back — every share link collapsed to the bare Ceiling-POE
 * default. engine.state.applyUrlConfiguration() is the engine-owned hydration
 * that fixes it. It resolves a SELECTION only: no step is jumped, no firmware
 * is chosen, and every gate still runs.
 *
 * Anti-tautology: the reviewer link is asserted against the served manifest and
 * the reviewed served-surface fixture, never against itself.
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { applyUrlConfiguration } from '../scripts/state.js';
import { __testHooks } from '../scripts/state.js';
import { wizardStateToSel, selToWizardState } from '../scripts/data.js';

const { buildFirmwareTargetPreviewString } = __testHooks;

const REVIEW_CONFIG = 'Ceiling-POE-AirIQ-RoomIQ';

// The documented reviewer recovery link. Module SELECTIONS only — the reviewer
// never types, sees or needs the config string.
const REVIEWER_QUERY = 'core=core&mount=ceiling&power=poe&airiq=airiq&roomiq=roomiq';

const FAN_TOKENS = ['FanRelay', 'FanPWM', 'FanDAC', 'FanTRIAC', 'TRIAC'];

const repoFile = (...p) => path.join(process.cwd(), ...p);
const readJson = (...p) => JSON.parse(fs.readFileSync(repoFile(...p), 'utf8'));

const manifest = readJson('manifest.json');
const kits = readJson('scripts', 'data', 'kits.json');
const surface = readJson('__tests__', 'fixtures', 'expected-surface.json');

const hydrate = (query = REVIEWER_QUERY) => applyUrlConfiguration(new URLSearchParams(query));

describe('the reviewer link resolves the exact review composition', () => {
    test('module params alone resolve to Ceiling-POE-AirIQ-RoomIQ', () => {
        expect(buildFirmwareTargetPreviewString(hydrate())).toBe(REVIEW_CONFIG);
    });

    test('the reviewer never supplies a config string', () => {
        // The link carries board selections, not the firmware identifier.
        expect(REVIEWER_QUERY).not.toMatch(/Ceiling-POE/i);
        for (const key of new URLSearchParams(REVIEWER_QUERY).keys()) {
            expect(['core', 'mount', 'power', 'airiq', 'roomiq']).toContain(key);
        }
    });

    test('the resolved config is actually served by the manifest', () => {
        const build = manifest.builds.find(b => b.config_string === REVIEW_CONFIG);
        expect(build).toBeDefined();
        expect(build.version).toBe('1.0.9');
    });

    test('the link round-trips deterministically through the builder mapping', () => {
        // hydrate -> builder selection -> wizard state is the mapping the view
        // commits through syncSelection(). Assert it preserves the composition
        // rather than routing through setState(), whose applyConfiguration()
        // re-reads the 1.0 `input[name=...]` radios; those exist in the served
        // page but not under jsdom, so a setState round-trip here would measure
        // the harness, not the contract.
        const wizard = hydrate();
        const sel = wizardStateToSel(wizard);
        expect(sel.air).toBe('airiq');
        expect(sel.roomiq).toBe(true);
        expect(sel.fan).toBe('none');

        const back = selToWizardState(sel);
        expect(back.airiq).toBe('airiq');
        expect(back.roomiq).toBe('roomiq');
        expect(back.ventiq).toBe('none');
        expect(buildFirmwareTargetPreviewString({ ...back, mounting: back.mount }))
            .toBe(REVIEW_CONFIG);
    });

    test('hydration is idempotent', () => {
        expect(buildFirmwareTargetPreviewString(hydrate())).toBe(REVIEW_CONFIG);
        expect(buildFirmwareTargetPreviewString(hydrate())).toBe(REVIEW_CONFIG);
    });

    test('hydration is not AirIQ-specific — existing share links resolve too', () => {
        expect(buildFirmwareTargetPreviewString(
            hydrate('core=core&mount=ceiling&power=poe&ventiq=ventiq&roomiq=roomiq&bathroom=true')
        )).toBe('Ceiling-POE-VentIQ-RoomIQ');
        expect(buildFirmwareTargetPreviewString(
            hydrate('core=core&mount=ceiling&power=poe&roomiq=roomiq')
        )).toBe('Ceiling-POE-RoomIQ');
    });
});

describe('no new customer room preset or default is created', () => {
    test('kits.json exposes no AirIQ preset', () => {
        for (const kit of kits.kits) {
            expect(kit.wizard_state.airiq === 'airiq').toBe(false);
        }
    });

    test('the recommended and only-recommended preset stays Bathroom PoE', () => {
        const recommended = kits.kits.filter(k => k.recommended);
        expect(recommended).toHaveLength(1);
        expect(recommended[0].sku).toBe('S360-KIT-BATH-P');
    });

    test('the review config is not a preset in any form', () => {
        // Scope to the preset ENTRIES: the file's authoring notes legitimately
        // record retired Kitchen fan cards as history.
        const entries = JSON.stringify(kits.kits).toLowerCase();
        expect(entries).not.toContain(REVIEW_CONFIG.toLowerCase());
        expect(entries).not.toContain('kitchen');
        // No preset SELECTS AirIQ (every entry pins airiq to "none").
        for (const kit of kits.kits) {
            expect(kit.wizard_state.airiq).toBe('none');
        }
    });
});

describe('fan, TRIAC and experimental paths stay outside the reviewer journey', () => {
    test('the reviewer selection carries no fan module', () => {
        const wizard = hydrate();
        expect(wizard.fan).toBe('none');
        expect(wizardStateToSel(wizard).fan).toBe('none');
    });

    test('the resolved config string contains no fan or TRIAC token', () => {
        const target = buildFirmwareTargetPreviewString(hydrate());
        for (const token of FAN_TOKENS) {
            expect(target).not.toContain(token);
        }
    });

    test('the served build for the reviewer config carries no fan or TRIAC token', () => {
        const build = manifest.builds.find(b => b.config_string === REVIEW_CONFIG);
        for (const token of FAN_TOKENS) {
            expect(JSON.stringify(build)).not.toContain(token);
        }
    });

    test('adding a fan param would change the target, so the link must not carry one', () => {
        // Guards the link shape itself: a fan selection resolves elsewhere.
        const withFan = buildFirmwareTargetPreviewString(
            hydrate(`${REVIEWER_QUERY}&fan=relay`)
        );
        expect(withFan).not.toBe(REVIEW_CONFIG);
        expect(new URLSearchParams(REVIEWER_QUERY).has('fan')).toBe(false);
    });
});

describe('engine gates stay active on the reviewer build', () => {
    const build = manifest.builds.find(b => b.config_string === REVIEW_CONFIG);

    test('the build is served on the preview channel, so the channel acknowledgement applies', () => {
        expect(build.channel).toBe('preview');
        const declared = surface.builds.find(b => b.config_string === REVIEW_CONFIG);
        expect(declared.channel).toBe('preview');
    });

    test('integrity and signature material is present for the install gate', () => {
        const part = build.parts[0];
        expect(part.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(part.signature_ed25519).toEqual(expect.any(String));
        expect(part.signature_ed25519.length).toBeGreaterThan(0);
        expect(part.signature_key_id).toEqual(expect.any(String));
    });

    test('hydration resolves a selection only and arms no install', () => {
        const wizard = hydrate();
        // No acknowledgement, gate verdict or firmware choice is carried in the
        // hydrated selection — the engine decides those afterwards.
        for (const key of Object.keys(wizard)) {
            expect(key).not.toMatch(/acknowledg|gate|install|signature|verified/i);
        }
    });
});

describe('the reviewer path makes no commercial claim', () => {
    const doc = fs.readFileSync(repoFile('docs', 'reviewer-recovery.md'), 'utf8');

    test('the recovery record carries no buyability or pricing copy', () => {
        expect(doc).not.toMatch(/buy now|add to cart|purchase|order now|in stock|for sale/i);
        expect(doc).not.toMatch(/[£$€]\s?\d/);
    });

    test('the record does not name the review unit as a commercial room product', () => {
        // OD-SOT-011 is unresolved: the review unit is not Kitchen and not
        // Bathroom. The record may CITE those names when describing the open
        // decision, but must not label the unit itself.
        expect(doc).not.toMatch(/the (Kitchen|Bathroom) review unit/i);
        expect(doc).toMatch(/OD-SOT-011/);
    });

    test('the record states the artifact-parity position', () => {
        expect(doc).toMatch(/OD-SOT-012/);
        expect(doc.toLowerCase()).toContain('artifact parity');
    });

    test('the record separates route mechanics from customer-doc discoverability', () => {
        // The route working is not the same as a reviewer being able to find
        // it. Both states must stay named, and neither may be collapsed into a
        // single "ready".
        const lower = doc.toLowerCase();
        expect(lower).toContain('route mechanics');
        expect(lower).toContain('discoverability');
        // The customer-doc gap and its owning repository must stay recorded.
        expect(doc).toMatch(/esphome-public/);
        expect(lower).toMatch(/no canonical customer-facing document|not yet discoverable/);
    });

    test('the record does not claim the reviewer already receives the link from customer docs', () => {
        expect(doc).not.toMatch(/the reviewer opens one documented link/i);
        expect(doc).not.toMatch(/customer docs (already|now) (point|link)/i);
    });
});

describe('a missing or unserved configuration cannot silently install', () => {
    test('a config with no manifest build is not resolvable', () => {
        const target = buildFirmwareTargetPreviewString(
            hydrate('core=core&mount=ceiling&power=pwr&airiq=airiq&roomiq=roomiq&led=led')
        );
        const served = manifest.builds.some(b => b.config_string === target);
        expect(served).toBe(false);
    });

    test('every served build the reviewer could reach declares integrity material', () => {
        for (const build of manifest.builds) {
            for (const part of build.parts) {
                expect(part.sha256).toMatch(/^[0-9a-f]{64}$/);
            }
        }
    });
});
