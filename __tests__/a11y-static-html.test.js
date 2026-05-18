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

describe('WF-WIZARD-AVAIL-001 — module availability pill slots in static index.html', () => {
    test('every selectable module group ships an availability pill + detail slot', () => {
        // Toggle-style module groups (RoomIQ, AirIQ, VentIQ, LED). The
        // pill + detail slots must be present in the static markup so the
        // runtime renderer never has to insert DOM ad-hoc.
        const groups = ['roomiq', 'airiq', 'ventiq', 'led'];
        for (const moduleKey of groups) {
            const section = document.getElementById(`${moduleKey}-module-section`);
            expect(section).not.toBeNull();
            const pill = section.querySelector('[data-module-availability-pill]');
            expect(pill).not.toBeNull();
            // Pill starts hidden so it never flashes before classification runs.
            expect(pill.hasAttribute('hidden')).toBe(true);
            const detail = section.querySelector('[data-module-availability-detail]');
            expect(detail).not.toBeNull();
            expect(detail.hasAttribute('hidden')).toBe(true);
        }
    });

    test('every non-none fan card ships an availability pill + detail slot', () => {
        // Includes TRIAC — the static markup carries the pill slot, and the
        // runtime renderer fills it with the blocked affordance.
        const variants = ['relay', 'pwm', 'analog', 'triac'];
        for (const variant of variants) {
            const card = document.querySelector(`.module-card[data-module-card="fan"][data-variant="${variant}"]`);
            expect(card).not.toBeNull();
            const pill = card.querySelector('[data-module-availability-pill]');
            expect(pill).not.toBeNull();
            expect(pill.hasAttribute('hidden')).toBe(true);
            const detail = card.querySelector('[data-module-availability-detail]');
            expect(detail).not.toBeNull();
            expect(detail.hasAttribute('hidden')).toBe(true);
        }
    });

    test('no customer-facing Voice module card is rendered in Step 4', () => {
        // voice:none is retained as the Core placeholder for share-link
        // back-compat; the only customer-facing voice-named input lives in
        // the Step 2 "Core Type" section, never in Step 4's module groups.
        const step4 = document.getElementById('step-4');
        expect(step4).not.toBeNull();
        const voiceCardsInStep4 = step4.querySelectorAll(
            '[data-module-group="voice"], [data-module-card="voice"]'
        );
        expect(voiceCardsInStep4.length).toBe(0);

        const voiceInputsInStep4 = step4.querySelectorAll('input[name="voice"]');
        expect(voiceInputsInStep4.length).toBe(0);
    });

    test('Step 2 Core radio is the only customer-facing voice-named input', () => {
        // Backwards-compat: voice:none = "Sense360 Core". This single radio
        // exists so legacy ?voice= share-links keep parsing.
        const voiceInputs = document.querySelectorAll('input[name="voice"]');
        expect(voiceInputs.length).toBe(1);
        const radio = voiceInputs[0];
        expect(radio.getAttribute('value')).toBe('none');
        expect(radio.closest('#step-2')).not.toBeNull();
    });

    test('static "Voice Module" title is not rendered as a customer-facing module card', () => {
        // The matrix entry exists for backwards-compat parsing, but the
        // wizard never shows a "Voice Module" headline.
        const step4 = document.getElementById('step-4');
        expect(step4).not.toBeNull();
        expect(step4.textContent).not.toMatch(/Voice Module/i);
    });

    test('WF-TRIAC-001 — TRIAC card is present in static markup so customers learn WHY it is advanced/manual-only', () => {
        // Visibility-with-context is the WF-WIZARD-AVAIL-001 contract; the
        // WF-TRIAC-001 update moves TRIAC from `.is-blocked` (radio
        // disabled) to `.is-advanced-warning` (radio enabled + inline ack
        // region revealed when selected).
        const triacCard = document.querySelector(
            '.module-card[data-module-card="fan"][data-variant="triac"]'
        );
        expect(triacCard).not.toBeNull();
        // SKU surfaced inline so the customer can map "advanced / manual
        // only TRIAC" back to the S360-320 hardware they may have ordered.
        expect(triacCard.textContent).toMatch(/S360-320/);
    });
});

describe('WF-TRIAC-001 — advanced/manual-warning region static markup', () => {
    // The advanced/manual-warning region is the new in-context surface
    // that lets customers (a) understand the load-bearing risk language
    // and (b) acknowledge the warning before any TRIAC flash can fire.
    // The runtime renderer in scripts/state.js reveals the region only
    // while TRIAC is the active selection.
    test('a single advanced-warning region is shipped in the static markup, scoped to fan=triac, hidden by default', () => {
        const regions = document.querySelectorAll('[data-advanced-warning-region]');
        expect(regions.length).toBe(1);
        const region = regions[0];
        expect(region.getAttribute('data-advanced-warning-module')).toBe('fan');
        expect(region.getAttribute('data-advanced-warning-variant')).toBe('triac');
        // Hidden until the runtime renderer reveals it — prevents a flash
        // of warning copy before the wizard has resolved the selection.
        expect(region.hasAttribute('hidden')).toBe(true);
        expect(region.getAttribute('aria-hidden')).toBe('true');
    });

    test('advanced-warning region carries the load-bearing risk language verbatim', () => {
        const region = document.querySelector('[data-advanced-warning-region][data-advanced-warning-variant="triac"]');
        expect(region).not.toBeNull();
        const text = region.textContent;
        // Each phrase is a non-negotiable contract per the WF-TRIAC-001
        // brief — load-bearing user-facing copy that survives future
        // tweaks.
        expect(text).toMatch(/mains-connected loads/i);
        expect(text).toMatch(/not compliance-certified/i);
        expect(text).toMatch(/not Release-One/i);
        expect(text).toMatch(/not a kit \/ default option/i);
        expect(text).toMatch(/not recommended/i);
        expect(text).toMatch(/no installable firmware has been imported yet/i);
        expect(text).toMatch(/advanced\/manual-warning artifact is imported/i);
    });

    test('advanced-warning region carries an acknowledgement checkbox bound to fan=triac', () => {
        const region = document.querySelector('[data-advanced-warning-region][data-advanced-warning-variant="triac"]');
        const ack = region?.querySelector('[data-advanced-warning-acknowledge]');
        expect(ack).not.toBeNull();
        expect(ack.tagName).toBe('INPUT');
        expect(ack.type).toBe('checkbox');
        expect(ack.getAttribute('data-advanced-warning-module')).toBe('fan');
        expect(ack.getAttribute('data-advanced-warning-variant')).toBe('triac');
        // Unchecked in the static markup so a fresh visit always re-prompts.
        expect(ack.checked).toBe(false);
    });

    test('advanced-warning region heading wires aria-labelledby for screen-reader announcement', () => {
        const region = document.querySelector('[data-advanced-warning-region][data-advanced-warning-variant="triac"]');
        expect(region.getAttribute('role')).toBe('region');
        const labelledBy = region.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        const heading = document.getElementById(labelledBy);
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toBe('Advanced / manual warning');
    });

    test('TRIAC firmware-impact hint copy reflects the WF-TRIAC-001 advanced/manual-warning posture', () => {
        const hint = document.querySelector('[data-firmware-impact="fan-triac"]');
        expect(hint).not.toBeNull();
        const text = hint.textContent;
        expect(text).toMatch(/advanced\/manual-warning/i);
        expect(text).toMatch(/acknowledg/i);
        expect(text).toMatch(/imported/i);
    });
});

describe('WF-UX-005 — step model cleanup', () => {
    // Canonical mapping pinned for this PR:
    //   Step | Stepper label | H2 heading
    //   1    | Start         | Start with your hardware
    //   2    | Core          | Confirm your Core
    //   3    | Power         | Choose power
    //   4    | Modules       | Pick modules
    //   5    | Review        | Review and install
    const STEPPER_LABELS = ['Start', 'Core', 'Power', 'Modules', 'Review'];
    const H2_HEADINGS = [
        'Start with your hardware',
        'Confirm your Core',
        'Choose power',
        'Pick modules',
        'Review and install'
    ];

    test('wizard step panels appear in DOM source order 1 → 5', () => {
        const main = document.getElementById('main-content');
        expect(main).not.toBeNull();
        const panels = Array.from(main.querySelectorAll(':scope > .wizard-step'));
        expect(panels.length).toBe(5);
        panels.forEach((panel, index) => {
            expect(panel.id).toBe(`step-${index + 1}`);
        });
    });

    test('Step 2 does not precede Step 1 in DOM source order', () => {
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        expect(step1).not.toBeNull();
        expect(step2).not.toBeNull();
        // step-1 must come before step-2 in document order.
        expect(step1.compareDocumentPosition(step2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('desktop sidebar stepper carries the canonical short labels in order', () => {
        const items = Array.from(document.querySelectorAll('.wizard-stepper__list > .wizard-stepper__item'));
        expect(items.length).toBe(5);
        items.forEach((item, index) => {
            const anchor = item.querySelector('.wizard-stepper__node[data-step]');
            expect(anchor).not.toBeNull();
            expect(anchor.getAttribute('data-step')).toBe(String(index + 1));
            const label = anchor.querySelector('.step-label');
            expect(label).not.toBeNull();
            expect(label.textContent.trim()).toBe(STEPPER_LABELS[index]);
        });
    });

    test('mobile progress bar carries the canonical short labels in order', () => {
        const items = Array.from(document.querySelectorAll('.progress-bar--mobile .progress-step[data-step]'));
        expect(items.length).toBe(5);
        items.forEach((item, index) => {
            expect(item.getAttribute('data-step')).toBe(String(index + 1));
            const label = item.querySelector('.step-label');
            expect(label).not.toBeNull();
            expect(label.textContent.trim()).toBe(STEPPER_LABELS[index]);
        });
    });

    test('desktop and mobile stepper labels match step-for-step', () => {
        const desktop = Array.from(document.querySelectorAll('.wizard-stepper__list .wizard-stepper__node .step-label'))
            .map(el => el.textContent.trim());
        const mobile = Array.from(document.querySelectorAll('.progress-bar--mobile .progress-step .step-label'))
            .map(el => el.textContent.trim());
        expect(desktop).toEqual(STEPPER_LABELS);
        expect(mobile).toEqual(STEPPER_LABELS);
        expect(desktop).toEqual(mobile);
    });

    test('every step h2 carries the canonical descriptive heading', () => {
        for (let i = 1; i <= 5; i++) {
            const heading = document.getElementById(`step-${i}-heading`);
            expect(heading).not.toBeNull();
            expect(heading.tagName).toBe('H2');
            expect(heading.textContent.trim()).toBe(H2_HEADINGS[i - 1]);
        }
    });

    test('legacy step-1 labels and headings are gone from static index.html', () => {
        // Desktop stepper used to say "Get started", mobile said "Mounting",
        // and the h2 said "Pick a starting point". None survive WF-UX-005.
        const desktopLabels = Array.from(document.querySelectorAll('.wizard-stepper__list .step-label'))
            .map(el => el.textContent.trim());
        const mobileLabels = Array.from(document.querySelectorAll('.progress-bar--mobile .step-label'))
            .map(el => el.textContent.trim());
        expect(desktopLabels).not.toContain('Get started');
        expect(mobileLabels).not.toContain('Mounting');

        const step1Heading = document.getElementById('step-1-heading');
        expect(step1Heading.textContent.trim()).not.toBe('Pick a starting point');
        expect(step1Heading.textContent.trim()).not.toBe('Get started');
    });

    test('legacy step-2/step-3/step-4/step-5 headings are gone from static index.html', () => {
        const legacyByStep = {
            2: 'Configure your Core',
            3: 'How is the hub powered?',
            4: 'Add expansion modules'
        };
        for (const [step, legacy] of Object.entries(legacyByStep)) {
            const heading = document.getElementById(`step-${step}-heading`);
            expect(heading.textContent.trim()).not.toBe(legacy);
        }
        // Step 5 used to render the ampersand entity "Review &amp; install";
        // the canonical heading drops the ampersand for "Review and install".
        const step5Heading = document.getElementById('step-5-heading');
        expect(step5Heading.textContent.trim()).toBe('Review and install');
    });

    test('Step 1 keeps the hidden mounting=ceiling default input', () => {
        // Mounting is the only supported value (Ceiling per CLAUDE.md) and
        // is auto-applied as the default. The hidden input is what lets
        // getMaxReachableStep() unlock Step 3 without a visible mounting
        // picker on Step 1.
        const step1 = document.getElementById('step-1');
        expect(step1).not.toBeNull();
        const mountingDefault = step1.querySelector('input[type="hidden"][name="mounting"][value="ceiling"][data-mounting-default]');
        expect(mountingDefault).not.toBeNull();
    });

    test('Step 2 keeps the voice=none Core radio for share-link back-compat', () => {
        // WF-WIZARD-AVAIL-001 + CLAUDE.md: voice='none' is the Core
        // placeholder retained so legacy ?voice= share links still parse.
        // WF-UX-005 must not collapse Step 2 or remove this radio.
        const step2 = document.getElementById('step-2');
        expect(step2).not.toBeNull();
        const voiceRadio = step2.querySelector('input[type="radio"][name="voice"][value="none"]');
        expect(voiceRadio).not.toBeNull();
        expect(voiceRadio.hasAttribute('checked')).toBe(true);
    });

    test('data-step + aria-labelledby wiring is unchanged for every step', () => {
        // Pin the IDs and ARIA wiring so a future restructure can't silently
        // detach the stepper from the panels. The numeric IDs are what
        // setStep() / getMaxReachableStep() rely on (state.js + navigation.js).
        for (let i = 1; i <= 5; i++) {
            const panel = document.getElementById(`step-${i}`);
            expect(panel).not.toBeNull();
            expect(panel.getAttribute('aria-labelledby')).toBe(`step-${i}-heading`);

            const stepperAnchor = document.querySelector(
                `.wizard-stepper__list .wizard-stepper__node[data-step="${i}"]`
            );
            expect(stepperAnchor).not.toBeNull();
            expect(stepperAnchor.getAttribute('href')).toBe(`#step-${i}`);

            const mobileNode = document.querySelector(
                `.progress-bar--mobile .progress-step[data-step="${i}"]`
            );
            expect(mobileNode).not.toBeNull();
        }
    });
});

describe('WF-UX-006 — Step 1 kit / custom / recovery path split', () => {
    // WF-UX-006 makes Step 1 the path split between (a) the supported kit,
    // (b) custom planning, and (c) recovery. The split is presentation-only:
    // no firmware / manifest / sources / kit / release-channel / workflow
    // surface changes. These pins lock the static markup contract so a
    // future restructure can't silently regress the three-button surface.

    test('Step 1 exposes exactly three [data-start-path] buttons', () => {
        const step1 = document.getElementById('step-1');
        expect(step1).not.toBeNull();
        const buttons = step1.querySelectorAll('[data-start-path]');
        expect(buttons.length).toBe(3);
        const paths = Array.from(buttons).map(btn => btn.getAttribute('data-start-path'));
        expect(paths).toEqual(['kit', 'custom', 'recovery']);
    });

    test('each path button is a real <button type="button">', () => {
        const buttons = document.querySelectorAll('[data-start-path]');
        buttons.forEach(button => {
            expect(button.tagName).toBe('BUTTON');
            expect(button.getAttribute('type')).toBe('button');
        });
    });

    test('kit path button uses the canonical "I bought a kit" copy', () => {
        const kitButton = document.querySelector('[data-start-path="kit"]');
        expect(kitButton).not.toBeNull();
        expect(kitButton.textContent).toMatch(/I bought a kit/);
        // Description copy: avoid implying unsupported modules are
        // installable; reference Release-One hardware as the prefill.
        expect(kitButton.textContent).toMatch(/Release-One/);
    });

    test('custom path button uses the canonical "Custom configuration" copy + WF-WIZARD-AVAIL-001-aligned warning', () => {
        const customButton = document.querySelector('[data-start-path="custom"]');
        expect(customButton).not.toBeNull();
        expect(customButton.textContent).toMatch(/Custom configuration/);
        // The custom-path description must name the unavailable-module
        // caveat in plain language — no "advanced users only" hedging.
        expect(customButton.textContent).toMatch(/Some modules are not yet available in WebFlash/);
    });

    test('recovery path button uses the canonical "Recovery" copy and an explicit recovery warning', () => {
        const recoveryButton = document.querySelector('[data-start-path="recovery"]');
        expect(recoveryButton).not.toBeNull();
        expect(recoveryButton.textContent).toMatch(/Recovery/);
        // Risk-specific copy: never say "advanced" without naming the
        // bootloader/recovery-repair use case.
        expect(recoveryButton.textContent).toMatch(/Use this only for recovery or bootloader repair/);
    });

    test('recovery path button delegates to the existing rescue modal via data-rescue-open', () => {
        // WF-UX-006 must NOT change rescue firmware logic. The recovery
        // card piggybacks on the existing delegated handler in
        // scripts/layout/rescue-modal.js (data-rescue-open).
        const recoveryButton = document.querySelector('[data-start-path="recovery"]');
        expect(recoveryButton.hasAttribute('data-rescue-open')).toBe(true);
        expect(recoveryButton.getAttribute('aria-haspopup')).toBe('dialog');
    });

    test('each path button has an accessible description', () => {
        const buttons = document.querySelectorAll('[data-start-path]');
        buttons.forEach(button => {
            const describedBy = button.getAttribute('aria-describedby');
            expect(describedBy).toBeTruthy();
            const descriptionEl = document.getElementById(describedBy);
            expect(descriptionEl).not.toBeNull();
            expect(descriptionEl.textContent.trim().length).toBeGreaterThan(0);
        });
    });

    test('Step 1 H2 still reads "Start with your hardware" (WF-UX-005 invariant)', () => {
        const heading = document.getElementById('step-1-heading');
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toBe('Start with your hardware');
    });

    test('Step 1 keeps the hidden data-mounting-default ceiling input', () => {
        // Preserved across WF-UX-006 because state.js + share-link parsing
        // still rely on ceiling being the implicit default mounting value.
        const step1 = document.getElementById('step-1');
        const mountingDefault = step1.querySelector('input[data-mounting-default]');
        expect(mountingDefault).not.toBeNull();
        expect(mountingDefault.getAttribute('value')).toBe('ceiling');
    });

    test('kit panel is hidden by default and revealed on kit-path selection', () => {
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        expect(kitPanel).not.toBeNull();
        // Static markup: hidden until the kit card is clicked. The
        // kit-mode controller toggles this via setPath('kit').
        expect(kitPanel.hasAttribute('hidden')).toBe(true);
        expect(kitPanel.getAttribute('data-start-path-panel')).toBe('kit');
    });

    test('custom panel is hidden by default and revealed on custom-path selection', () => {
        // The custom panel preserves the [data-manual-mode-panel] hook so
        // existing kit-mode tests and saved share-links keep parsing.
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(customPanel).not.toBeNull();
        expect(customPanel.hasAttribute('hidden')).toBe(true);
        expect(customPanel.getAttribute('data-start-path-panel')).toBe('custom');
        // Back-compat alias.
        expect(customPanel.hasAttribute('data-manual-mode-panel')).toBe(true);
    });

    test('the recommended preset survives inside the kit panel as the no-SKU fallback', () => {
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        const recommendedPreset = kitPanel.querySelector('[data-preset="recommended"]');
        expect(recommendedPreset).not.toBeNull();
        // WF-UX-002 invariant: the "Most popular" badge stays on the
        // recommended preset button. WF-UX-006 just relocates it from the
        // legacy manual panel into the kit-panel no-SKU fallback section.
        const badge = recommendedPreset.querySelector('.quick-start-card__badge');
        expect(badge).not.toBeNull();
        expect(badge.textContent.trim()).toBe('Most popular');
        // The preset still resolves to Release-One — never LED, never an
        // unsupported config.
        const config = JSON.parse(recommendedPreset.getAttribute('data-preset-config'));
        expect(config.led || 'none').toBe('none');
        expect(config.fan || 'none').toBe('none');
        expect(config.airiq || 'none').toBe('none');
        expect(config.ventiq).toBe('ventiq');
        expect(config.roomiq).toBe('roomiq');
    });

    test('custom panel does not introduce a customer-facing Voice card', () => {
        // Voice stays hidden / legacy-only per WF-WIZARD-AVAIL-001.
        const customPanel = document.querySelector('[data-custom-path-panel]');
        expect(customPanel).not.toBeNull();
        const voiceMentions = customPanel.querySelectorAll('input[name="voice"]:not([type="hidden"])');
        expect(voiceMentions.length).toBe(0);
    });

    test('TRIAC card is still rendered in Step 4 markup (WF-WIZARD-AVAIL-001 invariant unchanged)', () => {
        // WF-UX-006 does not alter Step 4 module availability gating.
        const triacCard = document.querySelector(
            '.module-card[data-module-card="fan"][data-variant="triac"]'
        );
        expect(triacCard).not.toBeNull();
        expect(triacCard.textContent).toMatch(/S360-320/);
    });

    test('legacy [data-config-mode-picker] radios are retained only as a hidden back-compat surface', () => {
        // WF-UX-006: the new path cards own the customer-facing surface.
        // The legacy [data-config-mode-input] radios are kept (hidden) so
        // the kit-mode change-listener and older share-links keep working.
        const legacyPicker = document.querySelector('[data-config-mode-picker]');
        expect(legacyPicker).not.toBeNull();
        // The picker is removed from the accessibility tree and is not
        // visible to users.
        expect(legacyPicker.classList.contains('config-mode-picker--legacy')).toBe(true);
        expect(legacyPicker.hasAttribute('hidden')).toBe(true);
        expect(legacyPicker.getAttribute('aria-hidden')).toBe('true');
    });
});

describe('WF-UX-007 — outcome-first Step 4 module labels with technical secondary tier', () => {
    const groupCases = [
        {
            key: 'roomiq',
            primary: 'Room sensing',
            technicalName: 'Sense360 RoomIQ',
            sku: 'S360-200',
        },
        {
            key: 'airiq',
            primary: 'Air quality sensing',
            technicalName: 'Sense360 AirIQ',
            sku: 'S360-210',
        },
        {
            key: 'ventiq',
            primary: 'Bathroom air sensing',
            technicalName: 'Sense360 VentIQ',
            sku: 'S360-211',
        },
        {
            key: 'led',
            primary: 'Status LED ring',
            technicalName: 'Sense360 LED',
            sku: 'S360-300',
        },
    ];

    test.each(groupCases)(
        '$key toggle group: primary title is "$primary" and meta line carries "$technicalName · $sku"',
        ({ key, primary, technicalName, sku }) => {
            const section = document.querySelector(`[data-module-group="${key}"]`);
            expect(section).not.toBeNull();

            const title = section.querySelector('.module-group__title');
            expect(title).not.toBeNull();
            expect(title.textContent.trim()).toBe(primary);
            expect(title.textContent).not.toContain(technicalName);

            const meta = section.querySelector('.module-group__meta');
            expect(meta).not.toBeNull();
            const metaText = meta.textContent.replace(/\s+/g, ' ').trim();
            expect(metaText).toContain(technicalName);
            expect(metaText).toContain(sku);
            expect(metaText).toContain('·');

            const skuSpan = meta.querySelector('.module-group__sku');
            expect(skuSpan).not.toBeNull();
            expect(skuSpan.textContent.trim()).toBe(sku);
        }
    );

    const fanVariantCases = [
        {
            variant: 'relay',
            primary: 'Fan relay control',
            technicalName: 'Sense360 Relay',
            sku: 'S360-310',
        },
        {
            variant: 'pwm',
            primary: 'PWM fan control',
            technicalName: 'Sense360 PWM',
            sku: 'S360-311',
        },
        {
            variant: 'analog',
            primary: 'Analog fan control',
            technicalName: 'Sense360 DAC',
            sku: 'S360-312',
        },
        {
            variant: 'triac',
            primary: 'TRIAC fan control',
            technicalName: 'Sense360 TRIAC',
            sku: 'S360-320',
        },
    ];

    test.each(fanVariantCases)(
        'fan card variant=$variant: primary title is "$primary" and meta line carries "$technicalName · $sku"',
        ({ variant, primary, technicalName, sku }) => {
            const card = document.querySelector(`[data-module-card="fan"][data-variant="${variant}"]`);
            expect(card).not.toBeNull();

            const title = card.querySelector('.module-card__title');
            expect(title).not.toBeNull();
            expect(title.textContent.trim()).toBe(primary);
            expect(title.textContent).not.toContain(technicalName);

            const meta = card.querySelector('.module-card__meta');
            expect(meta).not.toBeNull();
            const metaText = meta.textContent.replace(/\s+/g, ' ').trim();
            expect(metaText).toBe(`${technicalName} · ${sku}`);

            // The SKU also stays discoverable in the existing specs <dl> so
            // support keeps the technical surface in the secondary tier.
            const specs = card.querySelector('.module-card__specs');
            expect(specs).not.toBeNull();
            expect(specs.textContent).toContain(sku);
        }
    );

    test('fan group H3 reads "Fan and switching control" with matching chevron aria-label', () => {
        const fanSection = document.querySelector('[data-module-group="fan"]');
        expect(fanSection).not.toBeNull();

        const heading = fanSection.querySelector('h3.module-group__title');
        expect(heading).not.toBeNull();
        expect(heading.textContent.trim()).toBe('Fan and switching control');

        const chevron = fanSection.querySelector('[data-module-group-toggle]');
        expect(chevron).not.toBeNull();
        expect(chevron.getAttribute('aria-label')).toBe('Change fan and switching control');
    });

    test('fan "None" variant card keeps its plain heading (no SKU meta line)', () => {
        const noneCard = document.querySelector('[data-module-card="fan"][data-variant="none"]');
        expect(noneCard).not.toBeNull();

        const title = noneCard.querySelector('.module-card__title');
        expect(title).not.toBeNull();
        expect(title.textContent.trim()).toBe('None');

        // The "None" card is not a SKU; no meta line should be rendered.
        const meta = noneCard.querySelector('.module-card__meta');
        expect(meta).toBeNull();
    });

    test('Step 4 module-card titles are not the only place the technical Friendly name surfaces', () => {
        // Step 4 primary titles are outcome-first; the Friendly name must
        // appear in a separate secondary tier (meta line or specs) so
        // support and customers can still find the technical name.
        const technicalNames = [
            'Sense360 RoomIQ',
            'Sense360 AirIQ',
            'Sense360 VentIQ',
            'Sense360 LED',
            'Sense360 Relay',
            'Sense360 PWM',
            'Sense360 DAC',
            'Sense360 TRIAC',
        ];

        // Confirm no primary title element holds a Friendly name verbatim.
        const titles = Array.from(
            document.querySelectorAll(
                '[data-module-group="roomiq"] .module-group__title, [data-module-group="airiq"] .module-group__title, [data-module-group="ventiq"] .module-group__title, [data-module-group="led"] .module-group__title, [data-module-card="fan"] .module-card__title'
            )
        );
        for (const title of titles) {
            const text = title.textContent.trim();
            for (const technical of technicalNames) {
                expect(text).not.toBe(technical);
            }
        }

        // Confirm every Friendly name still appears somewhere in Step 4
        // markup (secondary tier).
        const step4 = document.getElementById('step-4');
        expect(step4).not.toBeNull();
        const step4Text = step4.textContent;
        for (const technical of technicalNames) {
            expect(step4Text).toContain(technical);
        }
    });
});
