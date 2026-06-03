/**
 * WF-UX-016 (follow-up) — Fix the remaining Simple-install freshness leakage and
 * the dead "View Release Notes" link.
 *
 * WF-UX-016 part 1 already routed the freshness-unknown *reason* to the calm
 * Simple hero and made the preflight ROW copy mode-aware. But the live Simple
 * path still leaked the raw diagnostic wording from two surfaces that part 1
 * did not touch:
 *
 *   1. the freshness BANNER (scripts/layout/freshness-banner.js) — it rendered
 *      "WebFlash could not confirm whether the firmware list is up to date…"
 *      into [data-freshness-banner-mount]. Simple mode only CSS-hid it, but
 *      hidden text still counts in textContent, so the page still "contained"
 *      the banned phrase.
 *   2. the firmware-card readiness helper ([data-ready-helper] in state.js's
 *      updateFirmwareControls) — it echoed the raw freshness blockingReason
 *      ("…could not confirm… Use 'Recheck manifest freshness'…") regardless of
 *      install mode.
 *
 * And "View Release Notes" did nothing on GitHub Pages: it was an
 * <a href="#" onclick="toggleReleaseNotes(event)"> but the effective meta CSP
 * (script-src 'self' https://unpkg.com — no 'unsafe-inline') blocks inline
 * handlers, and the per-build .md it tried to fetch has never shipped on disk
 * (so the disclosure always fell back to "release notes are not available").
 *
 * This suite is the brutal acceptance net: in Simple mode the whole-page text
 * must not contain the raw freshness phrases UNLESS the manifest is truly stale,
 * and "View Release Notes" must open a real changelog/release or not render at
 * all. Advanced install keeps the full diagnostics. Presentation/deploy-layer
 * only — the freshness gate and every policy surface are untouched.
 *
 * Note: this file uses the REAL scripts/state.js throughout (no module mock), so
 * there is no mock-ordering constraint. The Simple-hero copy itself (a pure
 * function in scripts/simple-install.js) is re-pinned in its own minimal-DOM
 * describe at the end.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeEach, afterEach, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');
const readJson = (rel) => JSON.parse(read(rel));

// The raw freshness phrases that must never reach the Simple path for an
// *unknown* verdict. (The brutal acceptance list is the first four; the
// acknowledgement-checkbox sentence is added as an extra guard because it ships
// in the static preflight row and must be rewritten in Simple mode too.)
const FORBIDDEN_SIMPLE = Object.freeze([
    'Cannot install yet',
    'Manifest freshness',
    'Recheck manifest freshness',
    'could not confirm whether the firmware list is up to date',
    'I understand WebFlash could not confirm freshness'
]);

// A realistic Release-One stable build, blocked only by freshness once seeded.
const READY_BUILD = Object.freeze({
    firmwareId: 'release-one-stable-1.0.0',
    manifestIndex: 0,
    chipFamily: 'ESP32-S3',
    config_string: 'Ceiling-POE-VentIQ-RoomIQ',
    version: '1.0.0',
    channel: 'stable',
    deprecated: false,
    build_date: '2026-05-14T19:49:31.409630+00:00',
    file_size: 1087488,
    sha256: '9169f2ce486d14d3c0e0b1d6e9adf558480db6ec301f8eac1622fda4d7ceffcc',
    signature: 'AI6bXRN/YorXYrTs2Fb/tjPLi8FMqc+hSB+N+ETEIMo=',
    signature_key_id: 'dev-2026-01',
    source_commit: 'f75a31ad415f92afc5be81456404a705dbe3b820',
    source_url: 'https://github.com/sense360store/WebFlash/commit/f75a31ad415f92afc5be81456404a705dbe3b820',
    changelog: [
        'Production Release-One firmware for Ceiling-POE-VentIQ-RoomIQ.',
        'Builds the no-TRIAC Release-One configuration.'
    ],
    known_issues: ['Sense360 TRIAC is not included in this Release-One firmware.'],
    parts: [{ path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin', offset: 0 }]
});

function loadRealBody() {
    const html = read('index.html');
    document.documentElement.innerHTML = html
        .replace(/^[\s\S]*?<body[^>]*>/i, '')
        .replace(/<\/body>[\s\S]*$/i, '');
}

function mockBrowserEnv() {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
    Object.defineProperty(global.navigator, 'serial', {
        value: { getPorts: jest.fn(() => Promise.resolve([])) },
        configurable: true
    });
    window.confirm = jest.fn(() => true);
}

// All non-freshness preflight checks passing, so the freshness axis is the only
// remaining blocker (mirrors __tests__/cache-freshness.test.js).
function seedAllPassPreflight(__testHooks) {
    __testHooks.updateConnectionQualityMetrics({
        disconnects: 0,
        reconnectAttempts: 0,
        serialReadFailures: 0,
        serialWriteFailures: 0,
        retryCount: 0,
        stabilityWindowStart: Date.now() - 35000
    });
    window.latestPreflightChecks = [
        { key: 'browser-support', state: 'pass', detail: 'ok', blocking: false },
        { key: 'device-visibility', state: 'pass', detail: 'ok', blocking: false },
        { key: 'connection-quality', state: 'pass', detail: 'ok', blocking: false },
        { key: 'firmware-verification', state: 'pass', detail: 'ok', blocking: false },
        { key: 'user-acknowledgement', state: 'pass', detail: 'ok', blocking: false }
    ];
}

/**
 * Drive the real Step-5 install surface into "ready except for the freshness
 * axis" in the given install mode, then apply the freshness verdict. After this
 * the freshness banner, the firmware-card readiness helper, and the preflight
 * manifest-freshness row have all been (re-)rendered for `mode`.
 */
function seedFreshness({ __testHooks, setStep, mode, verdict }) {
    document.documentElement.setAttribute('data-install-mode', mode);
    setStep(5, { animate: false, skipUrlUpdate: true });

    __testHooks.setFirmwareOptions([{ ...READY_BUILD }], READY_BUILD.config_string);
    window.currentFirmware = { ...READY_BUILD };

    // Render the real firmware card so the [data-ready-helper] (and the rest of
    // the card) exist in the page exactly as the live site renders them.
    const container = document.getElementById('compatible-firmware');
    container.innerHTML = __testHooks.createFirmwareCardHtml(
        { ...READY_BUILD },
        { configString: READY_BUILD.config_string }
    );

    seedAllPassPreflight(__testHooks);
    __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
    __testHooks.setPreFlashAcknowledgement(true);

    // setManifestFreshnessState cascades to notifyFreshnessBanner →
    // updateFirmwareControls (reads the all-pass checks seeded above, so the
    // helper reaches the freshness branch) → refreshPreflightDiagnostics (syncs
    // the row for the active mode).
    __testHooks.setManifestFreshnessState(verdict);
}

/* ===========================================================================
   Part A — the brutal acceptance test: Simple-mode page text for an UNKNOWN
   freshness verdict must not contain any raw freshness phrase.
   =========================================================================== */
describe('WF-UX-016 — Simple-install freshness-unknown leaks no raw freshness copy (whole page)', () => {
    beforeEach(() => {
        jest.resetModules();
        loadRealBody();
        mockBrowserEnv();
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { delete window.currentFirmware; } catch { /* ignore */ }
        try { delete window.latestPreflightChecks; } catch { /* ignore */ }
    });

    test('the rendered page text contains NONE of the banned raw freshness phrases', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'unknown' });

        const pageText = document.body.textContent;
        for (const phrase of FORBIDDEN_SIMPLE) {
            expect(pageText).not.toContain(phrase);
        }
    });

    test('the freshness banner mount is empty in Simple mode (no hidden raw copy)', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'unknown' });

        const mount = document.querySelector('[data-freshness-banner-mount]');
        expect(mount).not.toBeNull();
        expect(mount.textContent.trim()).toBe('');
    });

    test('freshness is still surfaced — calmly (no banned phrases ≠ no signal)', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'unknown' });

        const pageText = document.body.textContent;
        // The Simple preflight row reads as a plain "Firmware list check" and the
        // card helper uses the calm "could not recheck" wording — both prove the
        // freshness state is communicated without the raw diagnostics.
        expect(pageText).toContain('Firmware list check');
        expect(pageText.toLowerCase()).toContain('could not recheck the latest firmware list');
    });

    test('the manifest-freshness preflight row carries customer-safe copy', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'unknown' });

        const row = document.querySelector('[data-preflight-item="manifest-freshness"]');
        expect(row.querySelector('.preflight-panel__label').textContent).toBe('Firmware list check');
        expect(row.querySelector('[data-manifest-freshness-recheck]').textContent).toBe('Check for updates again');
        expect(row.querySelector('#manifest-freshness-ack-description').textContent)
            .not.toContain('I understand WebFlash could not confirm freshness');
    });
});

/* ===========================================================================
   Part B — Advanced install is unchanged: the full diagnostic wording survives,
   which also proves the Simple suppression is strictly mode-scoped.
   =========================================================================== */
describe('WF-UX-016 — Advanced install still shows the full freshness diagnostics', () => {
    beforeEach(() => {
        jest.resetModules();
        loadRealBody();
        mockBrowserEnv();
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { delete window.currentFirmware; } catch { /* ignore */ }
        try { delete window.latestPreflightChecks; } catch { /* ignore */ }
    });

    test('Advanced-mode page text DOES contain the raw freshness diagnostics', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'advanced', verdict: 'unknown' });

        const pageText = document.body.textContent;
        // The banner + row + helper all keep the diagnostic wording in Advanced.
        expect(pageText).toContain('Manifest freshness');
        expect(pageText).toContain('Recheck manifest freshness');
        expect(pageText).toContain('could not confirm whether the firmware list is up to date');
    });

    test('the freshness banner renders the full diagnostic copy in Advanced mode', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'advanced', verdict: 'unknown' });

        const mount = document.querySelector('[data-freshness-banner-mount]');
        expect(mount.textContent).toContain('could not confirm whether the firmware list is up to date');
    });
});

/* ===========================================================================
   Part C — the stale exception. Stale is a hard block: it MAY say
   "Cannot install yet", must NOT offer continue, and acknowledgement cannot
   clear it. The freshness gate is untouched.
   =========================================================================== */
describe('WF-UX-016 — Simple stale stays a hard block (banned phrases allowed only here)', () => {
    beforeEach(() => {
        jest.resetModules();
        loadRealBody();
        mockBrowserEnv();
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { delete window.currentFirmware; } catch { /* ignore */ }
        try { delete window.latestPreflightChecks; } catch { /* ignore */ }
    });

    test('stale still hard-blocks install and acknowledgement cannot clear it', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'stale' });

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
        expect(__testHooks.evaluateFreshnessGate().manifestStaleBlocking).toBe(true);

        __testHooks.setManifestFreshnessAcknowledgement(true);
        const verdict = __testHooks.evaluateFreshnessGate();
        expect(verdict.ok).toBe(false);
        expect(verdict.manifestStaleBlocking).toBe(true);
    });

    // WF-UX-017 supersedes WF-UX-016 here: an unknown verdict is non-blocking in
    // Simple install (could-not-recheck ≠ stale). Stale (the test above) is still
    // the hard block. Advanced-mode acknowledgement gating is covered by
    // __tests__/cache-freshness.test.js and wf-ux-016-freshness-simple-copy.test.js.
    test('an unknown verdict is non-blocking in Simple install (WF-UX-017)', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'unknown' });

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);
    });
});

/* ===========================================================================
   Part D — the firmware-card readiness helper is mode-aware.
   =========================================================================== */
describe('WF-UX-016 — the readiness helper uses calm freshness copy only in Simple mode', () => {
    beforeEach(() => {
        jest.resetModules();
        loadRealBody();
        mockBrowserEnv();
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-install-mode');
        try { delete window.currentFirmware; } catch { /* ignore */ }
        try { delete window.latestPreflightChecks; } catch { /* ignore */ }
    });

    function helperText() {
        const helper = document.querySelector('#compatible-firmware [data-ready-helper]');
        return helper ? helper.textContent : '';
    }

    test('Simple mode: the helper carries NO freshness wording — unknown is non-blocking (WF-UX-017)', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'simple', verdict: 'unknown' });

        // WF-UX-017 — unknown no longer blocks the Simple stable path, so the
        // firmware-card helper drops the freshness signal entirely (neither the
        // raw diagnostics NOR the calm "could not recheck" copy). The freshness
        // signal moved to the hero's small secondary note + the (collapsed)
        // Setup-checks row — see wf-ux-017-freshness-nonblocking.test.js.
        const text = helperText().toLowerCase();
        expect(text).not.toContain('recheck manifest freshness');
        expect(text).not.toContain('could not confirm whether the firmware list is up to date');
        expect(text).not.toContain('could not recheck');
    });

    test('Advanced mode: the helper keeps the diagnostic reason (regression guard)', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        seedFreshness({ __testHooks, setStep, mode: 'advanced', verdict: 'unknown' });

        expect(helperText()).toContain('could not confirm whether the firmware list is up to date');
    });
});

/* ===========================================================================
   Part E — "View Release Notes" is never a dead "#" link; it opens a real
   release/changelog or does not render at all.
   =========================================================================== */
describe('WF-UX-016 — View Release Notes opens a real changelog/release or is not rendered', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '<div id="browser-warning"></div><div id="compatible-firmware"></div>';
        mockBrowserEnv();
    });

    afterEach(() => {
        try { delete window.currentFirmware; } catch { /* ignore */ }
    });

    function cardWrap(html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        return wrap;
    }

    test('the stable build renders a real <button> trigger — never href="#" and no inline onclick', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.createFirmwareCardHtml({ ...READY_BUILD }, { configString: READY_BUILD.config_string });

        expect(html).not.toContain('href="#"');
        expect(html).not.toMatch(/onclick=/i);

        const trigger = cardWrap(html).querySelector('[data-release-notes-trigger]');
        expect(trigger).not.toBeNull();
        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger.hasAttribute('href')).toBe(false);
        expect(trigger.textContent.trim()).toBe('View Release Notes');
    });

    test('a build with a release_url renders a real external link (not "#")', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const url = 'https://github.com/sense360store/esphome-public/releases/tag/v1.0.0';
        const html = __testHooks.createFirmwareCardHtml(
            { ...READY_BUILD, release_url: url },
            { configString: READY_BUILD.config_string }
        );

        expect(html).not.toContain('href="#"');
        const link = cardWrap(html).querySelector('[data-release-notes-external]');
        expect(link).not.toBeNull();
        expect(link.tagName).toBe('A');
        expect(link.getAttribute('href')).toBe(url);
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    test('a build with no changelog and no URL renders no trigger and no empty section', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.createFirmwareCardHtml(
            { ...READY_BUILD, changelog: [] },
            { configString: READY_BUILD.config_string }
        );

        const wrap = cardWrap(html);
        expect(wrap.querySelector('[data-release-notes-trigger]')).toBeNull();
        expect(wrap.querySelector('[data-release-notes-external]')).toBeNull();
        expect(html).not.toContain('View Release Notes');
        expect(html).not.toContain('release-notes-section');
    });

    test('clicking the trigger (delegated, CSP-safe) loads the shipped changelog — not a "not available" fallback', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // Only set window.currentFirmware (not setFirmwareOptions): the toggle's
        // selectFirmwareById then no-ops on an unregistered id, so it cannot
        // re-render/detach the card, and loadReleaseNotes reads the changelog off
        // window.currentFirmware.
        window.currentFirmware = { ...READY_BUILD };

        const container = document.getElementById('compatible-firmware');
        container.innerHTML = __testHooks.createFirmwareCardHtml({ ...READY_BUILD }, { configString: READY_BUILD.config_string });

        const trigger = container.querySelector('[data-release-notes-trigger]');
        // A bubbling click — the only wiring is the delegated document listener
        // (there is no inline onclick), so this proves the CSP-safe path works.
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        const section = document.getElementById(trigger.dataset.releaseNotesId);
        expect(section).not.toBeNull();
        // data-loaded + rendered content persist regardless of how the toggle
        // settles, proving the click reached loadReleaseNotes with real content.
        expect(section.dataset.loaded).toBe('true');
        expect(section.textContent).toContain('Production Release-One firmware for Ceiling-POE-VentIQ-RoomIQ.');
        expect(section.textContent).not.toContain('not available');
        expect(section.textContent).not.toContain('Loading release notes');
    });

    test('the static index.html ships no dead "#" release-notes link', () => {
        const html = read('index.html');
        expect(html).not.toMatch(/href="#"[^>]*release-notes/i);
        expect(html).not.toMatch(/release-notes[^>]*href="#"/i);
    });
});

/* ===========================================================================
   Part F — the Simple hero copy itself (pure function in simple-install.js).
   Minimal DOM so initSimpleInstall() no-ops; describeReadiness is pure.
   =========================================================================== */
describe('WF-UX-016 — the Simple hero copy stays calm for unknown / hard for stale', () => {
    beforeEach(() => {
        jest.resetModules();
        document.documentElement.removeAttribute('data-install-mode');
        document.body.innerHTML = '<div id="browser-warning"></div>';
        mockBrowserEnv();
    });

    test('freshness-unknown → "Could not recheck for updates" + Reload / Continue (no banned phrases)', async () => {
        const { describeReadiness } = await import('../scripts/simple-install.js');
        const view = describeReadiness({
            reason: 'freshness-unknown',
            // Even when state.js hands in the raw blocking message, the hero
            // must ignore it for freshness-unknown.
            message: 'WebFlash could not confirm whether the firmware list is up to date. Use “Recheck manifest freshness” to retry.'
        });

        expect(view.title).toBe('Could not recheck for updates');
        expect(view.level).toBe('attention');
        const blob = `${view.title} ${view.detail}`;
        for (const phrase of FORBIDDEN_SIMPLE) {
            expect(blob).not.toContain(phrase);
        }
        const actions = view.actions.map(a => a.action);
        expect(actions).toEqual(['reload', 'continue']);
    });

    test('firmware-stale → "Cannot install yet", Reload only, never Continue', async () => {
        const { describeReadiness } = await import('../scripts/simple-install.js');
        const view = describeReadiness({ reason: 'firmware-stale' });

        expect(view.level).toBe('blocked');
        expect(view.title).toBe('Cannot install yet');
        const actions = view.actions.map(a => a.action);
        expect(actions).toContain('reload');
        expect(actions).not.toContain('continue');
    });
});

/* ===========================================================================
   Part G — presentation/deploy-layer only: no policy surface changed.
   =========================================================================== */
describe('WF-UX-016 — no firmware / manifest / sources / REQUIRED_CONFIGS change', () => {
    test('manifest carries Release-One stable + five preview builds + Rescue', () => {
        const configs = readJson('manifest.json').builds.map(b => b.config_string).sort();
        expect(configs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED', 'Rescue']);
    });

    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = read('.github/workflows/firmware-publish.yml');
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('firmware/sources.json declares Release-One + five preview sources', () => {
        const cfgs = (readJson('firmware/sources.json').sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
    });

    test('the release-notes loader no longer references the dead per-build .md path builder', () => {
        const state = read('scripts/state.js');
        expect(state).not.toMatch(/buildReleaseNotesPathFromPart/);
        expect(state).not.toMatch(/resolveReleaseNotesChannel/);
    });
});
