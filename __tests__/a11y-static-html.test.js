/**
 * Accessibility checks for the static index.html that don't require
 * loading the full state.js module. Validates that the page ships with the
 * skip link, global live regions, dialog roles, and labelled critical
 * controls.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, expect, test } from '@jest/globals';

const HTML_PATH = path.resolve(process.cwd(), 'index.html');
let html = '';

beforeAll(() => {
    html = fs.readFileSync(HTML_PATH, 'utf-8');
    document.documentElement.innerHTML = html
        .replace(/^[\s\S]*?<body[^>]*>/i, '')
        .replace(/<\/body>[\s\S]*$/i, '');
});

describe('static accessibility hooks in index.html', () => {
    test('skip link target main-content exists and is focusable', () => {
        const skipLink = document.querySelector('a.skip-link[href="#main-content"]');
        expect(skipLink).not.toBeNull();
        expect(skipLink.textContent.trim()).toMatch(/skip/i);

        const main = document.getElementById('main-content');
        expect(main).not.toBeNull();
        expect(main.getAttribute('tabindex')).toBe('-1');
        expect(main.tagName.toLowerCase()).toBe('main');
    });

    test('global aria-live regions are present and visually hidden', () => {
        const polite = document.getElementById('webflash-a11y-live-region');
        const assertive = document.getElementById('webflash-a11y-alert-region');
        expect(polite).not.toBeNull();
        expect(polite.getAttribute('aria-live')).toBe('polite');
        expect(polite.classList.contains('sr-only')).toBe(true);
        expect(assertive).not.toBeNull();
        expect(assertive.getAttribute('aria-live')).toBe('assertive');
        expect(assertive.classList.contains('sr-only')).toBe(true);
    });

    test('every wizard step has a region role and labelled heading', () => {
        for (let i = 1; i <= 5; i++) {
            const step = document.getElementById(`step-${i}`);
            expect(step).not.toBeNull();
            expect(step.getAttribute('role')).toBe('region');
            const labelledById = step.getAttribute('aria-labelledby');
            expect(labelledById).toBe(`step-${i}-heading`);
            const heading = document.getElementById(labelledById);
            expect(heading).not.toBeNull();
            expect(['H2', 'H3']).toContain(heading.tagName);
        }
    });

    test('firmware select has a visible label and accessible description', () => {
        const select = document.getElementById('firmware-version-select');
        expect(select).not.toBeNull();
        const label = document.querySelector('label[for="firmware-version-select"]');
        expect(label).not.toBeNull();
        expect(label.textContent.trim()).toMatch(/firmware/i);
        const describedById = select.getAttribute('aria-describedby');
        expect(describedById).toBeTruthy();
        const description = document.getElementById(describedById);
        expect(description).not.toBeNull();
    });

    test('acknowledgement checkboxes have descriptive text', () => {
        const ack = document.querySelector('[data-preflash-acknowledge]');
        expect(ack).not.toBeNull();
        const describedById = ack.getAttribute('aria-describedby');
        expect(describedById).toBeTruthy();
        const description = document.getElementById(describedById);
        expect(description).not.toBeNull();
        expect(description.textContent.trim().length).toBeGreaterThan(10);

        const warnAck = document.querySelector('[data-preflight-warn-acknowledge-input]');
        expect(warnAck).not.toBeNull();
        const warnDescribedBy = warnAck.getAttribute('aria-describedby');
        expect(warnDescribedBy).toBeTruthy();
        expect(document.getElementById(warnDescribedBy)).not.toBeNull();
    });

    test('rescue trigger and theme toggle expose accessible labels', () => {
        const rescueTrigger = document.querySelector('[data-rescue-header-trigger]');
        expect(rescueTrigger).not.toBeNull();
        // Either an aria-label or visible text is required for an accessible name.
        const hasName =
            rescueTrigger.hasAttribute('aria-label')
            || rescueTrigger.querySelector('.rescue-entry-trigger__label')?.textContent?.trim();
        expect(Boolean(hasName)).toBe(true);

        const themeToggle = document.getElementById('theme-toggle');
        expect(themeToggle).not.toBeNull();
        expect(themeToggle.getAttribute('aria-label')).toMatch(/dark mode|light mode/i);
    });

    test('install / download / copy support buttons carry accessible names', () => {
        // download .bin
        const downloadBtn = document.getElementById('download-btn');
        expect(downloadBtn?.getAttribute('aria-label')).toMatch(/download/i);

        // copy install link
        const copyLinkBtn = document.getElementById('copy-firmware-url-btn');
        expect(copyLinkBtn?.getAttribute('aria-label')).toMatch(/copy/i);

        // copy support bundle (preflight panel)
        const copySupport = document.querySelector('[data-copy-support-bundle]');
        expect(copySupport).not.toBeNull();
        const supportLabel = copySupport.getAttribute('aria-label')
            || copySupport.textContent.trim();
        expect(supportLabel).toMatch(/support/i);
    });
});

describe('WF-UX-QUICK-001 — admin note removed and browser-support copy normalized', () => {
    test('no internal "Admin note" text appears in static index.html', () => {
        expect(html).not.toMatch(/Admin note/i);
    });

    test('no legacy "Chrome or Edge" / "Chrome/Edge" / "Chrome and Edge" copy in static index.html', () => {
        expect(html).not.toMatch(/Chrome or Edge/);
        expect(html).not.toMatch(/Chrome\/Edge/);
        expect(html).not.toMatch(/Chrome and Edge/);
    });

    test('static index.html uses the canonical "Chrome, Edge, or Opera" phrase', () => {
        expect(html).toMatch(/Chrome, Edge, or Opera/);
    });
});
