/**
 * WF-UX-015 — Collapse firmware technical detail in Simple install.
 *
 * Builds on WF-UX-011 / WF-UX-012 / WF-UX-013. The Simple install path is now
 * genuinely simple: by default a normal customer sees one product card, the
 * included-hardware summary, one safety confirmation, the plain-language
 * readiness status, and the single ESP Web Tools Install action — nothing else.
 *
 * Every firmware / provenance / release metadata surface the Step 5 install
 * surface renders for the Advanced path is collapsed by default in simple mode:
 *   - the "Compatible Firmware" heading + selection and the firmware release
 *     selector,
 *   - the per-build identity inside .firmware-info (firmware/artifact filename,
 *     version, file size/date), the "View Release Notes" link, the description,
 *   - the "Firmware details" panel (Identity / source commit / SHA-256 /
 *     signature / changelog / known issues),
 *   - the provenance block + "Show verification details",
 *   - the "Show firmware file details" parts list,
 *   - the Key Features / Hardware Requirements metadata + release-notes section,
 *   - the whole "More actions" group (download / copy link / Home Assistant /
 *     recovery / support diagnostics).
 *
 * They are revealed in place only when the customer opens the single hero
 * "Technical details" disclosure (which sets data-technical-details-revealed on
 * <html>). Advanced install renders the full firmware card exactly as before.
 *
 * Status wording: an unticked safety confirmation reads "Confirm before
 * installing" (a calm, expected step), not "Needs attention"; genuine blocking
 * states still show warning / error copy ("Cannot install yet").
 *
 * Presentation-only — no firmware / manifest / sources / REQUIRED_CONFIGS /
 * installability / provenance / freshness surface is changed.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');
const CSS_PATH = path.resolve(REPO_ROOT, 'css/wizard-style.css');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf-8'));
}

// The firmware/provenance/release surfaces that simple mode must collapse by
// default. The ESP Web Tools Install button (.firmware-actions) is NOT here —
// it is the one action that stays visible.
const COLLAPSED_SURFACES = [
    '.compatible-firmware-heading',
    '#firmware-selector',
    '.firmware-info',
    '.firmware-details-panel',
    '.firmware-provenance',
    '.firmware-parts',
    '.firmware-metadata',
    '.release-notes-section',
    '.secondary-action-group'
];

/* ===========================================================================
   Part A — static markup + CSS contract (loads the real index.html body)
   =========================================================================== */
describe('WF-UX-015 — static markup + CSS contract', () => {
    let html = '';
    let css = '';
    let cssNoComments = '';

    beforeAll(() => {
        html = fs.readFileSync(HTML_PATH, 'utf-8');
        css = fs.readFileSync(CSS_PATH, 'utf-8');
        cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        document.documentElement.innerHTML = html
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
    });

    // Isolate the single WF-UX-015 collapse rule's selector list (comments
    // stripped so prose mentioning these surfaces can't masquerade as a rule).
    function collapseSelectorList() {
        const m = cssNoComments.match(
            /([^{}]*data-technical-details-revealed[^{}]*)\{\s*display:\s*none\s*!important;?\s*\}/
        );
        return m ? m[1] : '';
    }

    describe('the firmware/provenance/release metadata is collapsed by default', () => {
        test('a single simple-scoped rule hides every technical surface by default', () => {
            const selectorList = collapseSelectorList();
            expect(selectorList).not.toBe('');

            // Scoped to the Simple path AND gated on the not-yet-revealed state,
            // so opening Technical details (which sets the flag) reveals them.
            expect(selectorList).toContain('[data-install-mode="simple"]');
            expect(selectorList).toContain(':not([data-technical-details-revealed="true"])');

            for (const surface of COLLAPSED_SURFACES) {
                expect(selectorList).toContain(surface);
            }
        });

        test('the ESP Web Tools Install button is NOT collapsed (one install action stays)', () => {
            const selectorList = collapseSelectorList();
            // The install button lives in .firmware-actions / esp-web-install-button.
            expect(selectorList).not.toContain('.firmware-actions');
            expect(selectorList).not.toContain('esp-web-install-button');
        });

        test('the simple-mode collapse rule is scoped to #step-5 (does not leak elsewhere)', () => {
            const selectorList = collapseSelectorList();
            // Every collapsed surface is qualified by #step-5 in the selector list.
            const lines = selectorList.split(',').map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                expect(line).toContain('[data-install-mode="simple"]');
                expect(line).toContain('#step-5');
            }
        });
    });

    describe('Advanced install renders the full firmware card (every rule is simple-scoped)', () => {
        test('no display:none rule hides a technical surface outside the simple path', () => {
            for (const selector of COLLAPSED_SURFACES) {
                const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // The (?=[\s,{]) token boundary keeps these from matching the
                // legitimate BEM sub-element rules that share the prefix and
                // carry their own display:none (e.g. .firmware-parts-content,
                // .firmware-details-panel__summary::-webkit-details-marker).
                const ruleRe = new RegExp(`([^{}]*${escaped}(?=[\\s,{])[^{]*)\\{[^}]*display:\\s*none[^}]*\\}`, 'g');
                const matches = cssNoComments.match(ruleRe) || [];
                expect(matches.length).toBeGreaterThan(0);
                for (const rule of matches) {
                    expect(rule.includes('[data-install-mode="simple"]')).toBe(true);
                }
            }
        });

        test('no [data-install-mode="advanced"] rule hides any technical surface', () => {
            for (const surface of COLLAPSED_SURFACES) {
                const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`\\[data-install-mode="advanced"\\][^{]*${escaped}[^{]*\\{[^}]*display:\\s*none`);
                expect(cssNoComments).not.toMatch(re);
            }
        });

        test('the full firmware card surfaces all survive in the DOM (Advanced path)', () => {
            // The dynamic firmware card mounts here; the secondary-action group
            // (download / copy / Home Assistant / recovery) survives unchanged.
            expect(document.getElementById('compatible-firmware')).not.toBeNull();
            expect(document.querySelector('.compatible-firmware-heading')).not.toBeNull();
            expect(document.querySelector('#firmware-selector')).not.toBeNull();
            expect(document.querySelector('[data-secondary-action-group]')).not.toBeNull();
            expect(document.getElementById('download-btn')).not.toBeNull();
            expect(document.getElementById('copy-firmware-url-btn')).not.toBeNull();
        });
    });

    describe('Simple mode shows exactly one install action', () => {
        test('the install mount survives and is not inside a collapsed container', () => {
            const mount = document.getElementById('compatible-firmware');
            expect(mount).not.toBeNull();
            // The mount is not itself in the collapsed set (only the surrounding
            // metadata is) — the install button renders into it.
            expect(mount.closest('.firmware-details-panel, .firmware-provenance, .firmware-parts, .firmware-metadata, .secondary-action-group')).toBeNull();
        });

        test('the competing download / copy actions live inside the collapsed More-actions group', () => {
            const moreActions = document.querySelector('[data-secondary-action-group]');
            expect(moreActions).not.toBeNull();
            expect(moreActions.querySelector('#download-btn')).not.toBeNull();
            expect(moreActions.querySelector('#copy-firmware-url-btn')).not.toBeNull();
            // …and that group is in the simple-collapse set.
            expect(collapseSelectorList()).toContain('.secondary-action-group');
        });

        test('the hero names the single Install action', () => {
            const cta = document.querySelector('[data-simple-install-cta]');
            expect(cta).not.toBeNull();
            expect(cta.textContent).toMatch(/Install stable firmware/i);
            expect(cta.textContent).toMatch(/Install/);
        });
    });

    describe('the single "Technical details" disclosure carries the technical identity', () => {
        test('Technical details is a collapsed disclosure with kit / config / channel / artifact', () => {
            const hero = document.querySelector('[data-simple-install]');
            const tech = hero.querySelector('[data-simple-install-tech]');
            expect(tech.tagName).toBe('DETAILS');
            expect(tech.hasAttribute('open')).toBe(false);

            const sku = tech.querySelector('[data-simple-install-tech-sku]');
            const config = tech.querySelector('[data-simple-install-tech-config]');
            const artifact = tech.querySelector('[data-simple-install-tech-artifact]');
            expect(sku.textContent).toContain('S360-KIT-BATH-POE');
            expect(config.textContent).toContain('Ceiling-POE-VentIQ-RoomIQ');
            // Artifact filename lives behind the disclosure, never in the always-on copy.
            expect(artifact.textContent).toMatch(/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1\.0\.0-stable\.bin/);
        });

        test('nothing technical leaks into the always-visible hero copy', () => {
            const hero = document.querySelector('[data-simple-install]');
            const clone = hero.cloneNode(true);
            clone.querySelector('[data-simple-install-tech]')?.remove();
            // Config string, SKU, and the .bin artifact never appear outside the disclosure.
            expect(clone.textContent).not.toMatch(/Ceiling-POE-VentIQ-RoomIQ/);
            expect(clone.textContent).not.toMatch(/S360-/);
            expect(clone.textContent).not.toMatch(/\.bin/);
        });

        test('a "Technical details" secondary link sits alongside Setup checks / Advanced install / Recovery', () => {
            const links = document.querySelector('[data-simple-install-links]');
            expect(links.querySelector('[data-open-setup-checks]')).not.toBeNull();
            expect(links.querySelector('[data-open-technical-details]')).not.toBeNull();
            expect(links.querySelector('[data-enter-advanced]')).not.toBeNull();
            expect(links.querySelector('[data-rescue-open]')).not.toBeNull();

            const techLink = links.querySelector('[data-open-technical-details]');
            expect(techLink.textContent).toMatch(/Technical details/i);
            // It points at the single disclosure.
            expect(techLink.getAttribute('aria-controls')).toBe('simple-install-tech');
            expect(document.getElementById('simple-install-tech')).not.toBeNull();
        });
    });

    describe('every real install gate surface is preserved (no gate removed)', () => {
        test('preflight panel + details, warn-acknowledge, channel ack, pre-flash checklist, freshness mount survive', () => {
            expect(document.querySelector('[data-preflight-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-details]')).not.toBeNull();
            expect(document.querySelector('[data-preflight-warn-acknowledge]')).not.toBeNull();
            expect(document.querySelector('[data-channel-acknowledgement-panel]')).not.toBeNull();
            expect(document.querySelector('[data-preflash-acknowledge]')).not.toBeNull();
            expect(document.querySelector('[data-freshness-banner-mount]')).not.toBeNull();
        });
    });
});

/* ===========================================================================
   Part B — the collapsed metadata is exactly where the firmware card renders
   the technical detail (real state.js render helpers, no mock)
   =========================================================================== */
describe('WF-UX-015 — the collapsed sections are where the technical metadata renders', () => {
    function renderDom() {
        document.body.innerHTML = `
            <div id="browser-warning"></div>
            <div class="progress-step" data-step="1"></div>
            <div class="progress-step" data-step="5"></div>
            <div id="step-5" class="wizard-step">
              <div class="secondary-action-group"><p data-ready-helper></p></div>
              <div class="firmware-selector" id="firmware-selector"><select id="firmware-version-select"></select></div>
              <div id="compatible-firmware"><p data-ready-helper></p></div>
              <section data-channel-acknowledgement-panel hidden aria-hidden="true"></section>
              <button id="download-btn"></button>
              <button id="copy-firmware-url-btn"></button>
              <label class="pre-flash-checklist__acknowledgement"><input type="checkbox" data-preflash-acknowledge></label>
            </div>`;
    }

    const RELEASE_ONE_BUILD = {
        firmwareId: 'firmware-stable-1.0.0',
        manifestIndex: 0,
        chipFamily: 'ESP32-S3',
        config_string: 'Ceiling-POE-VentIQ-RoomIQ',
        version: '1.0.0',
        channel: 'stable',
        deprecated: false,
        build_date: '2026-04-30T15:12:58.139560+00:00',
        sha256: 'c9674b9df0ab00e3357c5dc526566ac440b32537aaf808a1e12b2f9db9b90397',
        signature: 'KQvII0GBl7I+lDSWVrq4q+q80Hsy+uZ8vBPL+hhNlyQ=',
        signature_key_id: 'unit-test-fixture-key',
        source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
        source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
        file_size: 1135904,
        known_issues: ['Improv times out on slow hubs'],
        changelog: ['Initial Release-One stable firmware.'],
        parts: [{ path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin', offset: 0 }]
    };

    beforeEach(() => {
        jest.resetModules();
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });
        Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
        delete window.currentFirmware;
        delete window.currentConfigString;
    });

    function rootClassOf(htmlString) {
        const wrap = document.createElement('div');
        wrap.innerHTML = htmlString.trim();
        return wrap.firstElementChild ? wrap.firstElementChild.className : '';
    }

    test('source commit / SHA-256 / signature / artifact / known issues / changelog render inside .firmware-details-panel', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.renderFirmwareDetailsPanel(RELEASE_ONE_BUILD, { recommended: true });

        // The section that carries this metadata is the one simple mode collapses.
        expect(rootClassOf(html)).toContain('firmware-details-panel');
        expect(COLLAPSED_SURFACES).toContain('.firmware-details-panel');

        // …and it really does carry the technical detail the task lists.
        expect(html).toContain('Source commit');
        expect(html).toContain('eec461a4f6d8');
        expect(html).toContain('SHA-256');
        expect(html).toContain('Signature metadata');
        expect(html).toContain('Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin'); // artifact filename
        expect(html).toContain('Known issues');
        expect(html).toContain('Improv times out on slow hubs');
        expect(html).toContain('Changelog');
        expect(html).toContain('Initial Release-One stable firmware.');
    });

    test('the provenance "Show verification details" block renders inside .firmware-provenance', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.renderFirmwareProvenanceSection(RELEASE_ONE_BUILD);

        expect(rootClassOf(html)).toContain('firmware-provenance');
        expect(COLLAPSED_SURFACES).toContain('.firmware-provenance');
        expect(html).toContain('Show verification details');
    });
});

/* ===========================================================================
   Part C — controller behaviour (state.js / sw-update / a11y mocked)
   =========================================================================== */
const FIXTURE_DOM = `
    <div class="install-mode-bar" data-advanced-bar hidden aria-hidden="true">
        <button data-enter-simple>Back to simple install</button>
    </div>
    <section class="simple-install" data-simple-install hidden aria-hidden="true">
        <div class="install-path-choice" data-install-path-choice role="group">
            <button type="button" data-install-path="simple" aria-pressed="true" class="is-active">Simple install</button>
            <button type="button" data-install-path="advanced" aria-pressed="false">Advanced install</button>
        </div>
        <div class="simple-install__card" data-simple-install-card>
            <h2 id="simple-install-heading">Sense360 Bathroom PoE Kit</h2>
            <div class="simple-install__status" data-simple-install-status data-level="pending" role="status">
                <p data-simple-install-status-title></p>
                <p data-simple-install-status-detail></p>
                <div data-simple-install-status-actions hidden></div>
            </div>
            <label class="simple-install__confirm">
                <input type="checkbox" data-simple-install-confirm>
                <span>Confirm before installing.</span>
            </label>
            <details class="simple-install__tech" data-simple-install-tech id="simple-install-tech">
                <summary>Technical details</summary>
                <dd data-simple-install-tech-config>Ceiling-POE-VentIQ-RoomIQ</dd>
            </details>
            <p data-simple-install-links>
                <button type="button" data-open-setup-checks>Setup checks</button>
                <button type="button" data-open-technical-details aria-controls="simple-install-tech">Technical details</button>
                <button type="button" data-enter-advanced>Advanced install</button>
                <button type="button" data-rescue-open>Recovery</button>
            </p>
        </div>
    </section>
    <div id="step-5">
        <section class="review-task review-task--safety">
            <label><input type="checkbox" data-preflash-acknowledge></label>
        </section>
        <details data-preflight-details><summary>Preflight details</summary></details>
    </div>
`;

async function loadController({ dom = '' } = {}) {
    jest.resetModules();

    const setState = jest.fn();
    const setStep = jest.fn();
    const getMaxReachableStep = jest.fn(() => 5);
    const triggerSkipWaitingAndReload = jest.fn();
    const announce = jest.fn();

    jest.unstable_mockModule('../scripts/state.js', () => ({
        setState,
        setStep,
        getMaxReachableStep
    }));
    jest.unstable_mockModule('../scripts/services/sw-update.js', () => ({
        triggerSkipWaitingAndReload,
        getServiceWorkerState: () => ({ updateAvailable: false, updateDismissed: false }),
        subscribeServiceWorkerState: () => () => {}
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({ announce }));

    document.documentElement.removeAttribute('data-install-mode');
    document.documentElement.removeAttribute('data-technical-details-revealed');
    document.body.innerHTML = dom;

    try { localStorage.clear(); } catch { /* ignore */ }
    window.history.replaceState({}, '', '/');

    const mod = await import('../scripts/simple-install.js');
    return { mod, setState, setStep };
}

describe('WF-UX-015 — Technical details disclosure reveals the collapsed metadata', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-technical-details-revealed');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('simple mode starts with the technical detail collapsed', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });
        expect(document.documentElement.getAttribute('data-install-mode')).toBe('simple');
        // No reveal flag → the WF-UX-015 CSS keeps the firmware metadata collapsed.
        expect(document.documentElement.hasAttribute('data-technical-details-revealed')).toBe(false);
        expect(document.querySelector('[data-simple-install-tech]').open).toBe(false);
    });

    test('the "Technical details" link opens the disclosure and sets the reveal flag', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        document.querySelector('[data-open-technical-details]').click();

        expect(document.querySelector('[data-simple-install-tech]').open).toBe(true);
        expect(document.documentElement.getAttribute('data-technical-details-revealed')).toBe('true');
    });

    test('closing the disclosure re-collapses the metadata (toggle keeps the flag in lockstep)', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        const tech = document.querySelector('[data-simple-install-tech]');
        document.querySelector('[data-open-technical-details]').click();
        expect(document.documentElement.getAttribute('data-technical-details-revealed')).toBe('true');

        // The customer closes it again from the native summary triangle.
        tech.open = false;
        tech.dispatchEvent(new Event('toggle'));
        expect(document.documentElement.hasAttribute('data-technical-details-revealed')).toBe(false);
    });

    test('opening the disclosure from the summary triangle also reveals (no link needed)', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });

        const tech = document.querySelector('[data-simple-install-tech]');
        tech.open = true;
        tech.dispatchEvent(new Event('toggle'));
        expect(document.documentElement.getAttribute('data-technical-details-revealed')).toBe('true');
    });

    test('the reveal helper no-ops gracefully when the disclosure is absent', async () => {
        const { mod } = await loadController({ dom: '' });
        expect(() => mod.__testHooks.openTechnicalDetails()).not.toThrow();
        expect(mod.__testHooks.openTechnicalDetails()).toBe(false);
    });
});

describe('WF-UX-015 — Simple mode status wording', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        document.documentElement.removeAttribute('data-technical-details-revealed');
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    test('an unticked safety confirmation reads "Confirm before installing", not "Needs attention"', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'safety-checklist' });
        expect(view.title).toBe('Confirm before installing');
        expect(view.title).not.toBe('Needs attention');
        // It is still an actionable nudge, never an error.
        expect(view.level).toBe('attention');
        expect(view.detail.toLowerCase()).not.toContain('needs attention');
    });

    test('genuine blocking states still show warning / error copy ("Cannot install yet")', async () => {
        const { mod } = await loadController({ dom: '' });
        for (const reason of ['verification-failed', 'preflight-fail', 'update-available', 'firmware-stale']) {
            const view = mod.describeReadiness({ reason });
            expect(view.level).toBe('blocked');
            expect(view.title).toBe('Cannot install yet');
        }
    });

    test('a genuine preflight warning still reads "Needs attention"', async () => {
        const { mod } = await loadController({ dom: '' });
        const view = mod.describeReadiness({ reason: 'preflight-warn' });
        expect(view.title).toBe('Needs attention');
        expect(view.level).toBe('attention');
    });

    test('the safety-checklist verdict renders into the hero with the calm title', async () => {
        const { mod } = await loadController({ dom: FIXTURE_DOM });
        mod.applyMode('simple', { persist: false });
        mod.renderStatus({ reason: 'safety-checklist' });

        const status = document.querySelector('[data-simple-install-status]');
        expect(status.querySelector('[data-simple-install-status-title]').textContent)
            .toBe('Confirm before installing');
    });
});

/* ===========================================================================
   Part D — no-change invariants (firmware / manifest / policy surfaces)
   =========================================================================== */
describe('WF-UX-015 — presentation-only: firmware / manifest / policy surfaces unchanged', () => {
    test('manifest carries Release-One stable + five preview builds + Rescue', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(7);
        const configs = manifest.builds.map(b => b.config_string).sort();
        expect(configs).toEqual([
            'Ceiling-POE-AirIQ-RoomIQ',
            'Ceiling-POE-RoomIQ',
            'Ceiling-POE-RoomIQ-LED',
            'Ceiling-POE-VentIQ-FanRelay-RoomIQ',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-VentIQ-RoomIQ-LED',
            'Rescue'
        ]);
    });

    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = fs.readFileSync(
            path.resolve(REPO_ROOT, '.github/workflows/firmware-publish.yml'),
            'utf-8'
        );
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('firmware/sources.json declares Release-One + five preview sources', () => {
        const sources = readJson('firmware/sources.json');
        const cfgs = (sources.sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
    });

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('the simple-install controller still imports no release-channel / provenance / freshness gate module', () => {
        const controller = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/simple-install.js'), 'utf-8');
        expect(controller).not.toMatch(/release-channels/);
        expect(controller).not.toMatch(/firmware-provenance/);
        expect(controller).not.toMatch(/manifest-freshness['"]/);
    });
});

/* ===========================================================================
   Part E — deploy coupling (WF-UX-015 changed both wizard-style.css and
   simple-install.js, so the cache-bust token + CACHE_NAME must be bumped past
   the WF-UX-014 baseline or the change ships stale — the exact WF-UX-013→014
   bug). Structural lockstep is pinned by wf-ux-014-cache-bust-freshness.test.js;
   here we pin only that WF-UX-015 actually advanced the version markers.
   =========================================================================== */
describe('WF-UX-015 — the changed CSS + module are cache-busted past the WF-UX-014 baseline', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const appJs = fs.readFileSync(path.resolve(REPO_ROOT, 'app.js'), 'utf-8');
    const sw = fs.readFileSync(path.resolve(REPO_ROOT, 'sw.js'), 'utf-8');

    const tokenFrom = (re, src) => { const m = src.match(re); return m ? m[1] : null; };

    test('the wizard-style.css link and simple-install.js import share one token, bumped past 20260601', () => {
        const cssToken = tokenFrom(/wizard-style\.css\?v=(\d+)/, html);
        const moduleToken = tokenFrom(/simple-install\.js\?v=(\d+)/, appJs);
        expect(cssToken).not.toBeNull();
        expect(moduleToken).not.toBeNull();
        expect(cssToken).toBe(moduleToken);
        // Strictly greater than the WF-UX-014 baseline so neither asset is served stale.
        expect(Number(cssToken)).toBeGreaterThan(20260601);
    });

    test('sw.js CACHE_NAME is bumped to at least webflash-v7 so existing installs re-prime', () => {
        const m = sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/);
        expect(m).not.toBeNull();
        expect(Number(m[1])).toBeGreaterThanOrEqual(7);
    });

    test('the app-shell build marker still mirrors the bumped token (dashes stripped)', () => {
        const shell = html.match(/name="webflash-app-shell"\s+content="([^"]+)"/)[1];
        const moduleToken = appJs.match(/simple-install\.js\?v=(\d+)/)[1];
        expect(shell.replace(/-/g, '')).toBe(moduleToken);
    });
});
