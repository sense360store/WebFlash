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

describe('WF-UX-004 — preflight verdict + details disclosure', () => {
    test('preflight panel keeps its labelled-by heading', () => {
        const panel = document.querySelector('[data-preflight-panel]');
        expect(panel).not.toBeNull();
        const labelledBy = panel.getAttribute('aria-labelledby');
        expect(labelledBy).toBe('preflight-checks-heading');
        const heading = document.getElementById('preflight-checks-heading');
        expect(heading).not.toBeNull();
        // The heading is intentionally visually hidden — the visible headline
        // is the verdict card. Assistive tech still resolves the section name.
        expect(heading.classList.contains('sr-only')).toBe(true);
    });

    test('verdict card has the right ARIA hooks and default copy', () => {
        const card = document.querySelector('[data-preflight-verdict]');
        expect(card).not.toBeNull();
        expect(card.getAttribute('role')).toBe('status');
        expect(card.getAttribute('aria-live')).toBe('polite');
        // Default state is ready until refreshPreflightDiagnostics() runs.
        expect(card.getAttribute('data-verdict')).toBe('ready');

        const title = card.querySelector('[data-preflight-verdict-title]');
        const detail = card.querySelector('[data-preflight-verdict-detail]');
        expect(title).not.toBeNull();
        expect(detail).not.toBeNull();
        expect(title.textContent.trim()).toBe('Ready to install');
        expect(detail.textContent.trim()).toBe('Your browser, firmware, and required checks are ready.');
    });

    test('Preflight details disclosure exists and wraps the diagnostic list', () => {
        const details = document.querySelector('[data-preflight-details]');
        expect(details).not.toBeNull();
        expect(details.tagName.toLowerCase()).toBe('details');
        const summary = details.querySelector('summary');
        expect(summary).not.toBeNull();
        expect(summary.textContent.trim()).toMatch(/preflight details/i);
        // The diagnostic list lives inside the disclosure (demoted from the
        // headline) so the verdict dominates the visual hierarchy.
        expect(details.querySelector('[data-preflight-list]')).not.toBeNull();
    });

    test('Diagnostics subsection wraps support-bundle actions inside the disclosure', () => {
        const details = document.querySelector('[data-preflight-details]');
        const supportActions = details.querySelector('[data-preflight-support-actions]');
        expect(supportActions).not.toBeNull();
        // Hidden by default — surfaces only when checks are non-pass.
        expect(supportActions.hidden).toBe(true);
        expect(supportActions.querySelector('[data-copy-support-bundle]')).not.toBeNull();
        expect(supportActions.querySelector('[data-download-support-bundle]')).not.toBeNull();
        const heading = supportActions.querySelector('h4');
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toBe('Diagnostics');
    });

    test('warning override is hidden by default and keeps its aria-describedby', () => {
        const override = document.querySelector('[data-preflight-warn-acknowledge]');
        expect(override).not.toBeNull();
        // Hidden until refreshPreflightDiagnostics() surfaces a warn-only state.
        expect(override.hasAttribute('hidden')).toBe(true);
        const input = override.querySelector('input[type="checkbox"]');
        expect(input).not.toBeNull();
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy)).not.toBeNull();
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

describe('WF-UX-002 — quick-start presets only point to manifest-backed configs', () => {
    // Static-only check: every quick-start preset's resolved config_string
    // must exist in the in-repo manifest.json. Mirrors the buildFirmwareTargetPreviewString
    // composition rules in scripts/state.js so a stale preset pointed at a
    // dropped config_string fails this suite without needing to spin up
    // the full wizard.

    function loadManifestConfigStrings() {
        const manifestPath = path.resolve(process.cwd(), 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        return new Set(
            (manifest.builds || [])
                .map(build => (build && typeof build.config_string === 'string') ? build.config_string : null)
                .filter(Boolean)
        );
    }

    function presetToConfigString(preset) {
        const mount = preset.mount || preset.mounting;
        const power = preset.power;
        if (!mount || !power) {
            return '';
        }
        const segments = [
            mount.charAt(0).toUpperCase() + mount.slice(1),
            power.toUpperCase()
        ];
        if (preset.airiq && preset.airiq !== 'none') {
            segments.push(preset.airiq === 'airiq' ? 'AirIQ' : preset.airiq);
        }
        if (preset.ventiq && preset.ventiq !== 'none') {
            segments.push('VentIQ');
        }
        if (preset.fan && preset.fan !== 'none') {
            const fanLabel = ({
                relay: 'FanRelay',
                pwm: 'FanPWM',
                analog: 'FanDAC',
                triac: 'FanTRIAC'
            })[preset.fan] || `Fan${preset.fan}`;
            segments.push(fanLabel);
        }
        if (preset.roomiq && preset.roomiq !== 'none') {
            segments.push('RoomIQ');
        }
        if (preset.led && preset.led !== 'none') {
            segments.push('LED');
        }
        return segments.join('-');
    }

    test('every preset in index.html resolves to a config_string present in manifest.json', () => {
        const manifestConfigs = loadManifestConfigStrings();
        const presetButtons = document.querySelectorAll('[data-preset-config]');
        expect(presetButtons.length).toBeGreaterThan(0);

        presetButtons.forEach(button => {
            const raw = button.getAttribute('data-preset-config');
            expect(raw).toBeTruthy();
            const preset = JSON.parse(raw);
            const configString = presetToConfigString(preset);
            expect(configString).not.toBe('');
            expect(manifestConfigs.has(configString)).toBe(true);
        });
    });

    test('the recommended preset retargets to the Release-One Ceiling-POE-VentIQ-RoomIQ config', () => {
        const recommended = document.querySelector('[data-preset="recommended"]');
        expect(recommended).not.toBeNull();
        const preset = JSON.parse(recommended.getAttribute('data-preset-config'));
        // WF-UX-002: the legacy preset pointed at Ceiling-POE-AirIQ — a
        // config dropped from manifest.json after WF-LED-002. The retargeted
        // preset must match Release-One so the shortcut and the kit picker
        // resolve to the same firmware.
        expect(preset.mount).toBe('ceiling');
        expect(preset.power).toBe('poe');
        expect(preset.bathroom).toBe(true);
        expect(preset.ventiq).toBe('ventiq');
        expect(preset.roomiq).toBe('roomiq');
        expect(preset.airiq).toBe('none');
        expect(preset.fan).toBe('none');
        expect(preset.led).toBe('none');
    });

    test('the stale Ceiling-USB / "minimal" preset is removed', () => {
        const minimal = document.querySelector('[data-preset="minimal"]');
        expect(minimal).toBeNull();
        const presetButtons = document.querySelectorAll('[data-preset-config]');
        presetButtons.forEach(button => {
            const preset = JSON.parse(button.getAttribute('data-preset-config'));
            expect(presetToConfigString(preset)).not.toBe('Ceiling-USB');
        });
    });

    test('the "Most popular" badge survives on the recommended preset', () => {
        const badge = document.querySelector('[data-preset="recommended"] .quick-start-card__badge');
        expect(badge).not.toBeNull();
        expect(badge.textContent.trim()).toBe('Most popular');
    });

    test('no preset opts into the LED preview — preview channel exposure stays gated by the module toggle', () => {
        const presetButtons = document.querySelectorAll('[data-preset-config]');
        presetButtons.forEach(button => {
            const preset = JSON.parse(button.getAttribute('data-preset-config'));
            expect(preset.led || 'none').toBe('none');
        });
    });
});

describe('WF-UX-003 — primary CTA hierarchy on Step 5', () => {
    test('self-referential "Other options — the main Install button" copy is gone', () => {
        expect(html).not.toMatch(/Other options/i);
        expect(html).not.toMatch(/main Install button/i);
    });

    test('legacy action-row-label class is no longer used in static index.html', () => {
        expect(html).not.toMatch(/action-row-label/);
    });

    test('firmware section carries a short lead pointing at the Install Firmware action on the card', () => {
        const firmwareSection = document.querySelector('.firmware-section');
        expect(firmwareSection).not.toBeNull();
        const lead = firmwareSection.querySelector('.firmware-section__lead');
        expect(lead).not.toBeNull();
        const leadText = lead.textContent.trim();
        expect(leadText).toMatch(/Install Firmware/);
        expect(leadText).toMatch(/firmware card below/i);
        // The lead must precede the Compatible Firmware heading so the install
        // context reads before the per-card readiness label.
        const heading = firmwareSection.querySelector('.compatible-firmware-heading');
        expect(heading).not.toBeNull();
        expect(lead.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('Step 5 footer wraps secondary actions in a renamed secondary-action-group', () => {
        const step5 = document.getElementById('step-5');
        expect(step5).not.toBeNull();
        const group = step5.querySelector('.secondary-action-group');
        expect(group).not.toBeNull();
        // The ready-helper status target must live inside the renamed
        // container so the state.js selector still finds it.
        const helper = group.querySelector('[data-ready-helper]');
        expect(helper).not.toBeNull();
        // The misleading legacy class must not survive on this container.
        expect(step5.querySelector('.primary-action-group')).toBeNull();
    });

    test('Step 5 footer has a "More actions" heading above the demoted controls', () => {
        const step5 = document.getElementById('step-5');
        const group = step5.querySelector('.secondary-action-group');
        const label = group.querySelector('.secondary-actions-label');
        expect(label).not.toBeNull();
        expect(['H2', 'H3', 'H4']).toContain(label.tagName);
        expect(label.textContent.trim()).toBe('More actions');
        // The Download / Copy / Open HA controls must follow the heading so
        // the label introduces them rather than trailing them.
        const controls = group.querySelector('.primary-action-controls');
        expect(controls).not.toBeNull();
        expect(label.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('Step 5 "Open Home Assistant" is demoted to btn-secondary', () => {
        const openHa = document.getElementById('open-ha-integrations-btn');
        expect(openHa).not.toBeNull();
        expect(openHa.classList.contains('btn-secondary')).toBe(true);
        expect(openHa.classList.contains('btn-primary')).toBe(false);
    });

    test('the three demoted controls remain reachable with their existing accessible names', () => {
        const step5 = document.getElementById('step-5');
        const group = step5.querySelector('.secondary-action-group');
        const download = group.querySelector('#download-btn');
        const copyLink = group.querySelector('#copy-firmware-url-btn');
        const openHa = group.querySelector('#open-ha-integrations-btn');
        expect(download).not.toBeNull();
        expect(copyLink).not.toBeNull();
        expect(openHa).not.toBeNull();
        expect(download.getAttribute('aria-label')).toMatch(/download/i);
        expect(copyLink.getAttribute('aria-label')).toMatch(/copy/i);
        // Open HA keeps its visible-text label.
        expect(openHa.textContent.trim()).toMatch(/Open Home Assistant/);
    });

    test('post-flash Home Assistant CTA stays primary — only the pre-install footer was demoted', () => {
        // The pre-install footer button at index.html:844 was changed from
        // btn-primary to btn-secondary. The post-flash next-step button at
        // index.html:872 (data-post-flash-ha-open) remains primary because it
        // is the dominant action *after* a successful flash. Pin both so a
        // future regression on either side breaks this test.
        const postFlashHa = document.querySelector('[data-post-flash-ha-open]');
        expect(postFlashHa).not.toBeNull();
        expect(postFlashHa.classList.contains('btn-primary')).toBe(true);
    });

    test('real install affordance is still the ESP Web Tools button container, not a duplicate', () => {
        // The firmware section retains a placeholder for the upstream
        // <esp-web-install-button> rendered by state.js — Step 5 must not
        // ship a hand-rolled install button that bypasses ESP Web Tools.
        const compatible = document.getElementById('compatible-firmware');
        expect(compatible).not.toBeNull();
        const step5 = document.getElementById('step-5');
        // No <esp-web-install-button> in the static markup (state.js injects
        // it); no rogue button[data-install] inside Step 5 either.
        expect(step5.querySelector('esp-web-install-button')).toBeNull();
        expect(step5.querySelector('button[data-install]')).toBeNull();
    });
});

describe('WF-UX-002 — canonical firmware readiness copy in static index.html', () => {
    test('Step 4 firmware-target-preview warning carries the canonical no-build body', () => {
        const warning = document.querySelector('[data-firmware-target-preview-warning]');
        expect(warning).not.toBeNull();
        expect(warning.textContent.trim()).toBe(
            'Adjust your hardware choices or pick a supported kit to find a matching build.'
        );
        // Warning is hidden until updateFirmwareTargetPreview promotes it.
        expect(warning.hasAttribute('hidden')).toBe(true);
    });

    test('mobile summary firmware-empty starts on the no-selection headline', () => {
        const empty = document.querySelector('[data-module-summary-firmware-empty]');
        expect(empty).not.toBeNull();
        expect(empty.textContent.trim()).toBe('Choose your hardware to find firmware');
    });

    test('legacy "No build selected yet." copy is gone from static index.html', () => {
        expect(html).not.toMatch(/No build selected yet/i);
    });

    test('legacy "This exact firmware target is not published yet" copy is gone from static index.html', () => {
        expect(html).not.toMatch(/firmware target is not published yet/i);
    });

    test('browser-warning panel uses the canonical unsupported-browser headline and body', () => {
        const panel = document.getElementById('browser-warning');
        expect(panel).not.toBeNull();
        const heading = panel.querySelector('h3');
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toBe('Browser not supported for flashing');
        expect(panel.textContent).toMatch(/Open this page in desktop Chrome, Edge, or Opera to install firmware over USB\./);
    });
});
