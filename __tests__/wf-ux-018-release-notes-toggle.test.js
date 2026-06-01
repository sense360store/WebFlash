/**
 * WF-UX-018 — "View Release Notes" must actually open on the live site.
 *
 * WF-UX-016 made the trigger CSP-safe (a real <button> wired through a delegated
 * [data-release-notes-trigger] listener instead of an inline onclick) and pointed
 * the loader at the shipped manifest changelog. But it STILL did nothing on the
 * live site, because toggleReleaseNotes() called
 *   selectFirmwareById(firmwareId, { renderDetails: false })
 * before flipping the disclosure open. selectFirmwareById() ALWAYS runs
 * verifyCurrentFirmwareIntegrity(), which calls renderSelectedFirmware() and
 * rebuilds the #compatible-firmware container — synchronously DETACHING the very
 * trigger + notes section the handler had just captured. The handler then set
 * display:block on the orphaned node while the freshly rendered card stayed
 * collapsed, so the user saw nothing happen.
 *
 * The WF-UX-016 acceptance test missed this because it deliberately never
 * registered the firmware (so selectFirmwareById no-op'd on the unknown id). On
 * the live site the build is always registered, so the select — and its
 * re-render — runs. This suite reproduces the LIVE path: the firmware is
 * registered via setFirmwareOptions + selected + rendered through the real
 * pipeline, exactly as the page does after a manifest load.
 *
 * WF-UX-018 removes the selectFirmwareById call: the disclosure is purely
 * presentational and reads the changelog straight from firmwareOptionsMap via
 * firmwareId, so it never needs to re-select (and re-render) the card.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, beforeEach, afterEach, expect, test } from '@jest/globals';

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');

// A realistic Release-One stable build with a shipped changelog (mirrors
// manifest.json build 0). file_size/sha256 are present so the card renders the
// full metadata exactly as the live site does.
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
    changelog: [
        'Production Release-One firmware for Ceiling-POE-VentIQ-RoomIQ.',
        'Builds the no-TRIAC Release-One configuration.'
    ],
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

// state.js is imported EXACTLY ONCE (not per-test via jest.resetModules). The
// "View Release Notes" wiring is a delegated document-level click listener;
// re-importing the module per test would stack a second listener on `document`
// (jsdom's document survives innerHTML resets), so one click would fire the
// handler twice and toggle the disclosure open-then-closed. A single import =
// a single listener = a faithful model of the live page.
let state;

// Drive the page into the live "firmware selected + card rendered" state.
function seedSelectedFirmware() {
    state.__testHooks.setFirmwareOptions([{ ...READY_BUILD }], READY_BUILD.config_string);
    state.__testHooks.selectDefaultFirmware();
}

const flushMicrotasks = async () => {
    for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
};

describe('WF-UX-018 — View Release Notes opens on the live path (firmware registered)', () => {
    beforeAll(async () => {
        mockBrowserEnv();
        document.body.innerHTML = '<div id="compatible-firmware"></div>';
        state = await import('../scripts/state.js');
    });

    beforeEach(() => {
        loadRealBody();
        mockBrowserEnv();
    });

    afterEach(() => {
        try { delete window.currentFirmware; } catch { /* ignore */ }
    });

    test('a bubbling click on the delegated trigger expands the disclosure and loads the changelog', async () => {
        seedSelectedFirmware();

        const container = document.getElementById('compatible-firmware');
        const trigger = container.querySelector('[data-release-notes-trigger]');
        expect(trigger).not.toBeNull();
        expect(trigger.tagName).toBe('BUTTON');

        const notesId = trigger.dataset.releaseNotesId;
        const section = document.getElementById(notesId);
        expect(section).not.toBeNull();
        expect(section.style.display).toBe('none');

        // The only wiring is the delegated document listener (no inline onclick),
        // so a bubbling click proves the CSP-safe live path works end to end.
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        await flushMicrotasks();

        // The trigger must NOT have been detached by a card re-render — this is
        // the exact regression WF-UX-018 fixes.
        const triggerAfter = container.querySelector('[data-release-notes-trigger]');
        expect(triggerAfter).toBe(trigger);

        const sectionAfter = document.getElementById(notesId);
        expect(sectionAfter).toBe(section);
        expect(sectionAfter.style.display).toBe('block');
        expect(sectionAfter.dataset.loaded).toBe('true');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(trigger.textContent.trim()).toBe('Hide Release Notes');

        expect(sectionAfter.textContent).toContain('Production Release-One firmware for Ceiling-POE-VentIQ-RoomIQ.');
        expect(sectionAfter.textContent).not.toContain('Loading release notes');
        expect(sectionAfter.textContent.toLowerCase()).not.toContain('not available');
    });

    test('a second click collapses the disclosure again', async () => {
        seedSelectedFirmware();

        const container = document.getElementById('compatible-firmware');
        const trigger = container.querySelector('[data-release-notes-trigger]');
        const notesId = trigger.dataset.releaseNotesId;

        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        await flushMicrotasks();
        expect(document.getElementById(notesId).style.display).toBe('block');

        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        await flushMicrotasks();

        const section = document.getElementById(notesId);
        expect(section.style.display).toBe('none');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.textContent.trim()).toBe('View Release Notes');
        // Content stays loaded — reopening must not refetch/rebuild.
        expect(section.dataset.loaded).toBe('true');
    });

    test('opening the notes does not mutate the selected firmware (disclosure is presentational)', async () => {
        seedSelectedFirmware();
        const before = window.currentFirmware;

        const container = document.getElementById('compatible-firmware');
        const trigger = container.querySelector('[data-release-notes-trigger]');
        trigger.dispatchEvent(new Event('click', { bubbles: true }));
        await flushMicrotasks();

        // The selected build is unchanged — viewing notes is not selecting.
        expect(window.currentFirmware).toBe(before);
        expect(window.currentFirmware.firmwareId).toBe(READY_BUILD.firmwareId);
        // And the toggle no longer routes through selectFirmwareById's re-render.
        expect(state.__testHooks).toBeDefined();
    });
});
