/**
 * @fileoverview WF-UX-011 — Simple install mode controller (default view).
 *
 * Adds a product-focused "Simple install" landing for the stable Sense360
 * Bathroom PoE kit so a normal customer sees "install firmware for the kit I
 * bought" instead of a Core / Power / Modules / Channel build matrix. The full
 * multi-step wizard is preserved behind "Advanced setup".
 *
 * Design — reuse, never duplicate:
 *   - Simple mode applies the existing stable Release-One kit preset
 *     (`S360-KIT-BATH-POE` from scripts/data/kit-presets.js) through the same
 *     `setState()` the kit/manual flows use, then advances to the review/install
 *     step via `setStep()`. This lights up the *existing* Step 5 install surface
 *     (the ESP Web Tools `<esp-web-install-button>`, the secondary actions, and
 *     every install gate) underneath a simplified product chrome. No install
 *     logic, firmware selection, or gate is re-implemented here.
 *   - The plain-language readiness status is rendered from the
 *     `webflash:install-readiness-changed` broadcast that `state.js` emits from
 *     `updateFirmwareControls()`. The controller never recomputes a gate — it
 *     only maps the already-decided verdict to plain copy. Every gate
 *     (preflight policy, manifest freshness incl. the stale hard block,
 *     release-channel + advanced/manual acknowledgements, provenance /
 *     installability, the pre-flash checklist) stays authoritative in state.js.
 *
 * The active view is stored on `<html data-install-mode>` (mirrors the
 * theme-toggle pattern) and persisted to localStorage. Explicit advanced URL
 * intent (`configmode=custom|manual`, a non-stable `preset`, or
 * `installmode=advanced`) opens the wizard directly.
 *
 * WF-UX-014 — deploy/cache coupling. This module owns the customer-facing
 * Simple-install freshness copy (the calm `freshness-unknown` mapping in
 * `describeReadiness`). It is a bare ES module imported by app.js, so a stale
 * Pages/CDN/service-worker copy silently keeps showing old copy even after
 * index.html and the CSS (both versioned/revalidated) update — which is exactly
 * how WF-UX-013's calm "Could not recheck for updates" copy stayed
 * half-deployed while the live Simple path kept reading "Cannot install yet".
 * The fix is purely at the deploy layer: app.js imports this module with a `?v=`
 * cache-bust token, in lockstep with index.html's asset query and the sw.js
 * CACHE_NAME bump. Whenever this module's customer-facing copy changes, bump that
 * token too. See docs/deploy-notes.md. No gate or copy logic is changed here.
 *
 * @module simple-install
 */

import { setState, setStep, getMaxReachableStep } from './state.js';
import {
    SIMPLE_BUNDLES,
    findSimpleBundleById,
    getDefaultSimpleBundle,
    isSimpleBundlePreview
} from './data/simple-bundles.js';
import { triggerSkipWaitingAndReload } from './services/sw-update.js';
import { announce } from './utils/a11y.js';

const STORAGE_KEY = 'webflash-install-mode';
// WF-UX-011 / WF-EASY-BUNDLE-PICKER-001 — the Step-1 kit-preset id used by
// resolveInitialMode's `?preset=` deep-link handling. A deep link to any other
// preset opens the wizard (advanced) so its acknowledgement / module context is
// visible. This is distinct from the Simple-install bundle SKUs (S360-KIT-*-P).
const STABLE_PRESET_ID = 'S360-KIT-BATH-POE';
const REVIEW_STEP = 5;
// WF-EASY-BUNDLE-PICKER-001 — the default + recommended Simple-install bundle
// (the stable Bathroom PoE build). Selected on entry to Simple install.
const DEFAULT_BUNDLE_ID = getDefaultSimpleBundle().id;

const SIMPLE_INSTALL_SELECTOR = '[data-simple-install]';
const ADVANCED_BAR_SELECTOR = '[data-advanced-bar]';
const STATUS_SELECTOR = '[data-simple-install-status]';
// WF-UX-012 — the first-choice path picker and the single safety confirmation.
const PATH_CHOICE_SELECTOR = '[data-install-path]';
const CONFIRM_SELECTOR = '[data-simple-install-confirm]';
const PREFLASH_ACK_SELECTOR = '[data-preflash-acknowledge]';
// WF-UX-013 — the authoritative manifest-freshness acknowledgement that backs
// the calm "Continue with loaded firmware list" action. state.js keeps the
// freshness gate authoritative; this control only ticks its checkbox.
const FRESHNESS_ACK_SELECTOR = '[data-manifest-freshness-acknowledge]';
// WF-UX-013 — reflects whether a genuine preflight warning (not the calm
// freshness-unknown state) is the remaining blocker, so the Simple path can keep
// the "accept the risk" preflight acknowledgement hidden by default.
const WARN_CONTEXT_ATTR = 'data-install-warn-context';
// WF-UX-015 — the single "Technical details" disclosure and the <html> flag that
// reveals the otherwise-collapsed firmware / provenance / release metadata + the
// More-actions group in the Simple path. Mirrors the Setup-checks reveal pattern;
// state.js stays the sole authority for what the firmware card renders.
const TECH_DETAILS_SELECTOR = '[data-simple-install-tech]';
const TECH_DETAILS_LINK_SELECTOR = '[data-open-technical-details]';
const TECH_REVEAL_ATTR = 'data-technical-details-revealed';
// WF-UX-017 — the small, calm SECONDARY freshness note. It surfaces only the
// "freshness unknown" state (never stale, which the main status hard-blocks) and
// is never the main install status. Driven by the install-readiness freshness
// axis broadcast by state.js; the full diagnostics live behind "Setup checks".
const FRESHNESS_NOTE_SELECTOR = '[data-simple-install-freshness-note]';
const FRESHNESS_NOTE_TEXT_SELECTOR = '[data-simple-install-freshness-text]';
const FRESHNESS_NOTE_COPY = 'Couldn’t recheck for updates. You can reload, or continue with the firmware list already loaded.';

// WF-EASY-BUNDLE-PICKER-001 — Simple install is a bundle picker. The picker is a
// list of supported customer bundle products (data/simple-bundles.js); selecting
// a card feeds the bundle's wizardState through setState() so Step 5 resolves the
// matching firmware + every gate. The stable Bathroom PoE bundle is the default.
const BUNDLE_PICKER_SELECTOR = '[data-simple-bundle-picker]';
const BUNDLE_CARD_SELECTOR = '[data-simple-bundle-card]';
const BUNDLE_SELECTED_NAME_SELECTOR = '[data-simple-bundle-selected-name]';
const BUNDLE_EYEBROW_SELECTOR = '[data-simple-install-eyebrow]';
const BUNDLE_SUMMARY_SELECTOR = '[data-simple-install-summary]';
const BUNDLE_PREVIEW_NOTE_SELECTOR = '[data-simple-bundle-preview-note]';
const BUNDLE_PREVIEW_NOTE_TEXT_SELECTOR = '[data-simple-bundle-preview-note-text]';
// WF-EASY-BUNDLE-PICKER-001 — the additional, stronger fan-control gate for the
// Bathroom Relay bundle. It is layered ON TOP of the release-channel preview
// acknowledgement (which still gates install in state.js): the controller only
// lets the authoritative "Before you flash" acknowledgement become true when the
// fan-control acknowledgement is also satisfied, so install stays blocked until
// both are checked. It never weakens or replaces an existing gate.
const FAN_CONTROL_REGION_SELECTOR = '[data-simple-bundle-fan-control]';
const FAN_CONTROL_ACK_SELECTOR = '[data-simple-bundle-fan-control-ack]';
const FAN_CONTROL_WARNING_SELECTOR = '[data-simple-bundle-fan-control-warning]';
// Tech-details fields reflect the selected bundle (kept inside the collapsed
// "Technical details" disclosure so the always-visible copy stays plain).
const TECH_SKU_SELECTOR = '[data-simple-install-tech-sku]';
const TECH_CONFIG_SELECTOR = '[data-simple-install-tech-config]';
const TECH_CHANNEL_SELECTOR = '[data-simple-install-tech-channel]';
const TECH_ARTIFACT_SELECTOR = '[data-simple-install-tech-artifact]';
// The Step-5 install CTA copy ("Install stable firmware" / "Install preview
// firmware") tracks the selected bundle's channel.
const INSTALL_CTA_SELECTOR = '[data-simple-install-cta]';
const INSTALL_CTA_LABEL_SELECTOR = '[data-simple-install-cta-label]';

// The active bundle SKU (defaults to the stable Bathroom PoE bundle). Tracked so
// switching to advanced and back preserves the customer's choice.
let activeBundleId = DEFAULT_BUNDLE_ID;
// Guards the preflash mirror against a reverse-sync loop while the controller
// programmatically composes the authoritative acknowledgement.
let programmaticPreflashUpdate = false;

// A clean module slate so switching from the advanced wizard back into the
// stable kit never carries a stray module selection forward. Mirrors the
// kit-presets controller's clear-before-apply, then the preset's wizardState
// is layered on top.
const CLEARED_WIZARD_STATE = Object.freeze({
    mount: 'ceiling',
    power: null,
    bathroom: false,
    airiq: 'none',
    ventiq: 'none',
    roomiq: 'none',
    fan: 'none',
    led: 'none',
    voice: 'none'
});

let lastReadiness = null;

/**
 * Plain-language presentation of the install-readiness verdict broadcast by
 * state.js. Pure function over the verdict — introduces no gate.
 *
 * Deliberately avoids the word "manifest" in the default user path and keeps
 * freshness calm unless the build is truly stale (a hard block). WF-UX-013 —
 * unknown freshness reads as a calm "Could not recheck for updates" with two
 * plain actions (Reload page / Continue with loaded firmware list) and never
 * sounds like a dangerous manual override; only a truly stale build blocks hard.
 *
 * @param {{reason?: string, message?: string}|null} readiness
 * @returns {{level: string, title: string, detail: string, actions: Array<{action: string, label: string}>}}
 */
export function describeReadiness(readiness) {
    const reason = (readiness && readiness.reason) ? readiness.reason : 'pending';
    const message = (readiness && readiness.message) ? readiness.message : '';
    const RELOAD = { action: 'reload', label: 'Reload' };
    const DETAILS = { action: 'details', label: 'Show details' };

    switch (reason) {
        case 'ready':
            return {
                level: 'ready',
                title: 'Ready to install',
                detail: 'Your Sense360 Bathroom PoE kit is ready. Use the Install stable firmware button below to begin.',
                actions: []
            };
        case 'verifying':
            return {
                level: 'attention',
                title: 'Getting things ready…',
                detail: 'Checking the firmware download. This only takes a moment.',
                actions: []
            };
        case 'verification-failed':
            return {
                level: 'blocked',
                title: 'Cannot install yet',
                detail: message || 'The firmware could not be verified. Reload this page and try again.',
                actions: [RELOAD]
            };
        case 'safety-checklist':
            // WF-UX-015 — an unticked safety confirmation is an expected step on
            // the happy path, not a problem. Use the calm, instructional
            // "Confirm before installing" wording and reserve "Needs attention"
            // for genuine issues (unsupported browser, stale firmware list,
            // missing firmware, preflight warnings).
            return {
                level: 'attention',
                title: 'Confirm before installing',
                detail: 'Tick the safety confirmation below, then use the Install button to begin.',
                actions: []
            };
        case 'advanced-ack':
            return {
                level: 'attention',
                title: 'Needs attention',
                detail: 'Review and accept the advanced firmware warning below before installing.',
                actions: []
            };
        case 'channel-ack':
            return {
                level: 'attention',
                title: 'Needs attention',
                detail: 'Review and accept the firmware notice below before installing.',
                actions: []
            };
        case 'preflight-fail':
            return {
                level: 'blocked',
                title: 'Cannot install yet',
                detail: message || 'Your browser or USB connection is not ready. Open Show details to see what to fix.',
                actions: [DETAILS]
            };
        case 'preflight-warn':
            return {
                level: 'attention',
                title: 'Needs attention',
                detail: 'There are warnings to review. Open Show details, then accept them to continue.',
                actions: [DETAILS]
            };
        case 'update-available':
            return {
                level: 'blocked',
                title: 'Cannot install yet',
                detail: 'A newer version of this installer is available. Reload this page before installing.',
                actions: [RELOAD]
            };
        case 'firmware-stale':
            return {
                level: 'blocked',
                title: 'Cannot install yet',
                detail: 'A newer firmware version is available. Reload this page before installing.',
                actions: [RELOAD]
            };
        case 'freshness-unknown':
            // WF-UX-013 — unknown freshness is NOT stale. Present it as a single
            // calm, plain-language action set: Reload page (recommended) and
            // Continue with the firmware list already loaded in this browser
            // (which ticks the authoritative freshness acknowledgement). No
            // "manifest" wording, no "Cannot install yet", no "accept the risk".
            return {
                level: 'attention',
                title: 'Could not recheck for updates',
                detail: 'WebFlash could not recheck the latest firmware list. Reload this page and try again. If this keeps happening, you can continue with the firmware list already loaded in this browser.',
                actions: [
                    { action: 'reload', label: 'Reload page' },
                    { action: 'continue', label: 'Continue with loaded firmware list' }
                ]
            };
        case 'no-firmware':
        case 'pending':
        default:
            return {
                level: 'pending',
                title: 'Getting things ready…',
                detail: 'Preparing your firmware.',
                actions: []
            };
    }
}

function getHero() {
    return document.querySelector(SIMPLE_INSTALL_SELECTOR);
}

function getAdvancedBar() {
    return document.querySelector(ADVANCED_BAR_SELECTOR);
}

/**
 * Reflect the active path on the first-choice picker (Simple vs Advanced):
 * the matching option reads `aria-pressed="true"` + `.is-active`. Safe to call
 * when the picker is absent (older embeds / unit fixtures without it).
 *
 * @param {'simple'|'advanced'} next
 */
function syncPathChoice(next) {
    if (typeof document === 'undefined') {
        return;
    }
    document.querySelectorAll(PATH_CHOICE_SELECTOR).forEach((button) => {
        const isActive = button.getAttribute('data-install-path') === next;
        button.setAttribute('aria-pressed', String(isActive));
        button.classList.toggle('is-active', isActive);
    });
}

/**
 * Open the Step 5 preflight diagnostics ("Setup checks"). Reused by the status
 * "Show details" action and the Simple-card "Setup checks" link so there is a
 * single way to reveal the (otherwise hidden) diagnostic rows. The preflight
 * panel and its details disclosure stay in the DOM in simple mode — only the
 * always-on verdict box is visually suppressed — so opening it here works.
 */
function openPreflightDetails() {
    const details = document.querySelector('#step-5 [data-preflight-details]')
        || document.querySelector('[data-preflight-details]');
    if (!details) {
        return false;
    }
    // WF-UX-013 — mark the disclosure as explicitly revealed so the Simple-mode
    // CSS stops hiding the diagnostic rows. By default the Simple path keeps the
    // preflight diagnostics collapsed (even when state.js auto-expands the
    // disclosure for a non-ready verdict); "Setup checks" is the way in.
    details.setAttribute('data-setup-checks-revealed', 'true');
    details.open = true;
    const summary = details.querySelector('summary');
    if (summary && typeof summary.focus === 'function') {
        try { summary.focus(); } catch { /* ignore */ }
    }
    if (typeof details.scrollIntoView === 'function') {
        try { details.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ }
    }
    return true;
}

/**
 * WF-UX-015 — toggle the `<html data-technical-details-revealed>` flag that the
 * simple-mode CSS reads to reveal (or re-collapse) the firmware / provenance /
 * release metadata + the More-actions group in place. Pure presentation: it
 * never re-renders the firmware card or touches an install gate.
 *
 * @param {boolean} revealed
 */
function setTechnicalDetailsRevealed(revealed) {
    if (typeof document === 'undefined' || !document.documentElement) {
        return;
    }
    if (revealed) {
        document.documentElement.setAttribute(TECH_REVEAL_ATTR, 'true');
    } else {
        document.documentElement.removeAttribute(TECH_REVEAL_ATTR);
    }
}

/**
 * Keep the reveal flag in lockstep with the disclosure's open state. Safe to
 * call when the disclosure is absent (older embeds / unit fixtures) — it then
 * resolves to "not revealed".
 */
function syncTechnicalDetailsRevealed() {
    if (typeof document === 'undefined') {
        return;
    }
    const tech = document.querySelector(TECH_DETAILS_SELECTOR);
    setTechnicalDetailsRevealed(Boolean(tech && tech.open));
}

/**
 * Open the single "Technical details" disclosure and reveal the collapsed
 * firmware-detail surfaces. Reused by the "Technical details" secondary link so
 * there is one way in, mirroring how "Setup checks" opens the preflight details.
 *
 * @returns {boolean} whether the disclosure was found.
 */
function openTechnicalDetails() {
    if (typeof document === 'undefined') {
        return false;
    }
    const tech = document.querySelector(TECH_DETAILS_SELECTOR);
    if (!tech) {
        return false;
    }
    tech.open = true;
    setTechnicalDetailsRevealed(true);
    const summary = tech.querySelector('summary');
    if (summary && typeof summary.focus === 'function') {
        try { summary.focus(); } catch { /* ignore */ }
    }
    if (typeof tech.scrollIntoView === 'function') {
        try { tech.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ }
    }
    return true;
}

/**
 * Bind the disclosure's native `toggle` so opening it from the summary triangle
 * (not only the "Technical details" link) reveals the collapsed surfaces, and
 * closing it re-collapses them. Idempotent; syncs the initial state once bound.
 */
function bindTechnicalDetailsDisclosure() {
    if (typeof document === 'undefined') {
        return;
    }
    const tech = document.querySelector(TECH_DETAILS_SELECTOR);
    if (tech && tech.dataset.techRevealBound !== 'true') {
        tech.addEventListener('toggle', () => {
            setTechnicalDetailsRevealed(tech.open);
        });
        tech.dataset.techRevealBound = 'true';
    }
    syncTechnicalDetailsRevealed();
}

/**
 * Mirror the Simple-card safety confirmation onto the authoritative Step 5
 * "Before you flash" acknowledgement so the install gate is never duplicated or
 * bypassed: state.js keeps reading `[data-preflash-acknowledge]`. The two stay
 * in sync in both directions without an event loop — each handler only copies
 * the boolean, and only the simple→real direction re-dispatches a `change` so
 * state.js recomputes the gate.
 */
function bindSafetyConfirmMirror() {
    if (typeof document === 'undefined') {
        return;
    }
    const heroAck = document.querySelector(CONFIRM_SELECTOR);
    if (heroAck && heroAck.dataset.confirmMirrorBound !== 'true') {
        // Forward: the hero confirmation composes (AND-ed with the fan-control
        // acknowledgement when the active bundle requires it) into the
        // authoritative [data-preflash-acknowledge] gate.
        heroAck.addEventListener('change', () => {
            syncPreflashFromHero();
        });
        heroAck.dataset.confirmMirrorBound = 'true';
    }

    const realAck = document.querySelector(PREFLASH_ACK_SELECTOR);
    if (realAck && realAck.dataset.simpleConfirmMirrorBound !== 'true') {
        // Reverse: keep the hero confirmation in step with a direct toggle of the
        // authoritative control (e.g. in advanced mode). Skipped while the
        // controller is composing the gate programmatically so the fan-control
        // AND-gate never bounces the hero checkbox back off.
        realAck.addEventListener('change', () => {
            if (programmaticPreflashUpdate) {
                return;
            }
            const hero = document.querySelector(CONFIRM_SELECTOR);
            if (hero && hero.checked !== realAck.checked) {
                hero.checked = realAck.checked;
            }
        });
        realAck.dataset.simpleConfirmMirrorBound = 'true';
    }

    // The fan-control acknowledgement (Bathroom Relay bundle) recomposes the
    // authoritative pre-flash gate and refreshes the hero status.
    const fanAck = document.querySelector(FAN_CONTROL_ACK_SELECTOR);
    if (fanAck && fanAck.dataset.fanControlAckBound !== 'true') {
        fanAck.addEventListener('change', () => {
            syncPreflashFromHero();
            renderStatus(window.webflashInstallReadiness || lastReadiness);
        });
        fanAck.dataset.fanControlAckBound = 'true';
    }
}

/**
 * Pull the current authoritative acknowledgement state into the Simple-card
 * confirmation so switching back into the simple view shows the real value.
 */
function syncSafetyConfirmFromGate() {
    if (typeof document === 'undefined') {
        return;
    }
    const heroAck = document.querySelector(CONFIRM_SELECTOR);
    const realAck = document.querySelector(PREFLASH_ACK_SELECTOR);
    if (heroAck && realAck && heroAck.checked !== realAck.checked) {
        heroAck.checked = realAck.checked;
    }
}

/**
 * WF-UX-017 — render the small, calm SECONDARY freshness note. It appears only
 * when the freshness axis is "unknown" (WebFlash could not recheck the latest
 * firmware list) AND that is non-blocking — i.e. not a hard block (stale /
 * pending SW update) and not already the main install status. It is never the
 * primary status above the Install button: the main status stays "Ready to
 * install" / "Confirm before installing", and the full freshness diagnostics +
 * reason code live behind "Setup checks". Safe to call when the note element is
 * absent (older embeds / unit fixtures).
 *
 * @param {object|null} readiness
 */
function renderFreshnessNote(readiness) {
    if (typeof document === 'undefined') {
        return;
    }
    const note = document.querySelector(FRESHNESS_NOTE_SELECTOR);
    if (!note) {
        return;
    }
    const freshness = (readiness && typeof readiness.freshness === 'object') ? readiness.freshness : null;
    const reason = (readiness && readiness.reason) ? readiness.reason : '';
    const show = Boolean(
        freshness
        && freshness.state === 'unknown'
        && freshness.hasRun
        && !freshness.hardBlock
        // When the MAIN status already speaks to freshness (the Advanced-style
        // 'freshness-unknown' reason, or a stale hard block), the secondary note
        // would just duplicate it — suppress it.
        && reason !== 'freshness-unknown'
        && reason !== 'firmware-stale'
    );

    const textEl = note.querySelector(FRESHNESS_NOTE_TEXT_SELECTOR);
    if (textEl) {
        textEl.textContent = show ? FRESHNESS_NOTE_COPY : '';
    }
    note.hidden = !show;
    note.setAttribute('aria-hidden', show ? 'false' : 'true');
}

/**
 * Render the plain-language status into the simple hero. Safe to call when the
 * hero is hidden (advanced mode) — it just keeps the status warm.
 *
 * @param {object|null} readiness
 */
export function renderStatus(readiness) {
    lastReadiness = readiness || null;

    // WF-UX-013 — keep the scary "accept the risk" preflight acknowledgement
    // suppressed in the Simple path unless a genuine non-freshness preflight
    // warning is the remaining blocker (reason === 'preflight-warn'). The
    // calm freshness-unknown state is handled entirely by the hero below.
    if (typeof document !== 'undefined' && document.documentElement) {
        const reason = (readiness && readiness.reason) ? readiness.reason : '';
        document.documentElement.setAttribute(
            WARN_CONTEXT_ATTR,
            reason === 'preflight-warn' ? 'real-warn' : 'calm'
        );
    }

    // WF-UX-017 — the calm secondary freshness note is independent of the main
    // status, so render it first (and even when the status node is absent).
    renderFreshnessNote(readiness);

    const node = document.querySelector(STATUS_SELECTOR);
    if (!node) {
        return;
    }
    const view = describeReadiness(readiness);
    node.dataset.level = view.level;

    const titleEl = node.querySelector('[data-simple-install-status-title]');
    const detailEl = node.querySelector('[data-simple-install-status-detail]');
    const actionsEl = node.querySelector('[data-simple-install-status-actions]');

    if (titleEl) {
        titleEl.textContent = view.title;
    }
    if (detailEl) {
        detailEl.textContent = view.detail;
    }
    if (actionsEl) {
        actionsEl.innerHTML = '';
        if (Array.isArray(view.actions) && view.actions.length > 0) {
            view.actions.forEach(action => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `btn ${action.action === 'reload' ? 'btn-primary' : 'btn-secondary'} simple-install__status-action`;
                button.dataset.simpleInstallAction = action.action;
                button.textContent = action.label;
                actionsEl.appendChild(button);
            });
            actionsEl.hidden = false;
            actionsEl.setAttribute('aria-hidden', 'false');
        } else {
            actionsEl.hidden = true;
            actionsEl.setAttribute('aria-hidden', 'true');
        }
    }
}

/**
 * Resolve the active bundle object, falling back to the default (stable
 * Bathroom PoE) bundle if the tracked id no longer resolves.
 *
 * @returns {Object}
 */
function getActiveBundle() {
    return findSimpleBundleById(activeBundleId) || getDefaultSimpleBundle();
}

/**
 * Friendly firmware artifact filename for the (collapsed) Technical details
 * display. Presentation-only — the real install path resolves the build via
 * state.js + manifest.json; this is just the human-readable file name.
 *
 * @param {Object} bundle
 * @returns {string}
 */
function bundleArtifactName(bundle) {
    if (!bundle || !bundle.firmwareConfigString) {
        return '';
    }
    const channel = bundle.channel === 'preview' ? 'preview' : 'stable';
    return `Sense360-${bundle.firmwareConfigString}-v1.0.0-${channel}.bin`;
}

/**
 * True only when the active bundle's fan-control acknowledgement is satisfied
 * (or the active bundle does not require one). Used to compose the authoritative
 * pre-flash gate so the Bathroom Relay bundle stays blocked until the
 * fan-control acknowledgement is checked.
 *
 * @returns {boolean}
 */
function fanControlSatisfied() {
    const bundle = getActiveBundle();
    if (!bundle || !bundle.requiresFanControlAcknowledgement) {
        return true;
    }
    const ack = document.querySelector(FAN_CONTROL_ACK_SELECTOR);
    return Boolean(ack && ack.checked);
}

/**
 * Compose the authoritative "Before you flash" acknowledgement
 * ([data-preflash-acknowledge], read by state.js) from the hero safety
 * confirmation AND the fan-control acknowledgement (when the active bundle
 * requires it). This ANDs in the extra fan-control requirement so install stays
 * blocked until BOTH are satisfied; it never weakens the gate. The
 * preview-channel acknowledgement stays a SEPARATE, authoritative gate owned by
 * state.js — this never touches or bypasses it.
 */
function syncPreflashFromHero() {
    if (typeof document === 'undefined') {
        return;
    }
    const real = document.querySelector(PREFLASH_ACK_SELECTOR);
    if (!real) {
        return;
    }
    const hero = document.querySelector(CONFIRM_SELECTOR);
    const desired = Boolean(hero && hero.checked) && fanControlSatisfied();
    if (real.checked !== desired) {
        programmaticPreflashUpdate = true;
        real.checked = desired;
        try {
            real.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {
            // restricted environments — the value is still set.
        }
        programmaticPreflashUpdate = false;
    }
}

/**
 * Reflect the active selection across the bundle picker cards: the matching
 * card reads `aria-pressed`/`aria-checked` true + `.is-active`. Safe to call
 * when the picker is absent (unit fixtures without it).
 *
 * @param {string} activeId
 */
function syncBundleCards(activeId) {
    document.querySelectorAll(BUNDLE_CARD_SELECTOR).forEach((card) => {
        const isActive = card.getAttribute('data-simple-bundle-id') === activeId;
        card.setAttribute('aria-pressed', String(isActive));
        card.setAttribute('aria-checked', String(isActive));
        card.classList.toggle('is-active', isActive);
    });
}

/**
 * Render the selected bundle into the detail card: the bundle name, the
 * channel/version eyebrow, the included-hardware summary, the collapsed
 * Technical details (SKU / config / channel / firmware file), the Step-5 install
 * CTA copy, the preview note (preview bundles only), and the fan-control region
 * (the Bathroom Relay bundle only). Every write is guarded so this is safe with
 * minimal unit fixtures. Presentation-only — no install gate is recomputed here.
 *
 * @param {Object} bundle
 */
function renderSelectedBundle(bundle) {
    if (typeof document === 'undefined' || !bundle) {
        return;
    }
    const preview = isSimpleBundlePreview(bundle);

    const nameEl = document.querySelector(BUNDLE_SELECTED_NAME_SELECTOR);
    if (nameEl) {
        nameEl.textContent = bundle.displayName;
    }

    const eyebrow = document.querySelector(BUNDLE_EYEBROW_SELECTOR);
    if (eyebrow) {
        eyebrow.textContent = preview ? 'Preview firmware · v1.0.0' : 'Stable firmware · v1.0.0';
    }

    const summary = document.querySelector(BUNDLE_SUMMARY_SELECTOR);
    if (summary) {
        summary.innerHTML = '';
        bundle.moduleSummary.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'simple-install__summary-item';
            li.textContent = item;
            summary.appendChild(li);
        });
    }

    const sku = document.querySelector(TECH_SKU_SELECTOR);
    if (sku) {
        sku.textContent = bundle.id;
    }
    const config = document.querySelector(TECH_CONFIG_SELECTOR);
    if (config) {
        config.textContent = bundle.firmwareConfigString || '';
    }
    const channel = document.querySelector(TECH_CHANNEL_SELECTOR);
    if (channel) {
        channel.textContent = preview ? 'Preview' : 'Stable';
    }
    const artifact = document.querySelector(TECH_ARTIFACT_SELECTOR);
    if (artifact) {
        artifact.textContent = bundleArtifactName(bundle);
    }

    const ctaLabel = document.querySelector(INSTALL_CTA_LABEL_SELECTOR);
    if (ctaLabel) {
        ctaLabel.textContent = preview ? 'Install preview firmware.' : 'Install stable firmware.';
    }

    // Preview note: a calm reminder that a preview-channel acknowledgement is
    // required at install. The copy is static in the markup; the controller only
    // toggles visibility. Shown for every preview bundle (including the relay
    // bundle, which ALSO shows the stronger fan-control region below).
    const previewNote = document.querySelector(BUNDLE_PREVIEW_NOTE_SELECTOR);
    if (previewNote) {
        previewNote.hidden = !preview;
        previewNote.setAttribute('aria-hidden', String(!preview));
    }

    // Fan-control region: the additional, stronger gate for the Bathroom Relay
    // bundle. When the active bundle does not require it, clear the stored ack so
    // a future reselection re-prompts.
    const requiresFanControl = Boolean(bundle.requiresFanControlAcknowledgement);
    const fanRegion = document.querySelector(FAN_CONTROL_REGION_SELECTOR);
    if (fanRegion) {
        fanRegion.hidden = !requiresFanControl;
        fanRegion.setAttribute('aria-hidden', String(!requiresFanControl));
    }
    if (!requiresFanControl) {
        const ack = document.querySelector(FAN_CONTROL_ACK_SELECTOR);
        if (ack && ack.checked) {
            ack.checked = false;
        }
    }

    syncBundleCards(bundle.id);
}

/**
 * Select a Simple-install bundle: track it, feed its wizardState through the
 * same setState() the wizard/kit flows use (so Step 5 resolves the matching
 * firmware + every gate), render the detail card, recompose the authoritative
 * pre-flash gate (fan-control), and advance to the review/install step.
 * Idempotent. Returns the resolved bundle.
 *
 * @param {string} bundleId
 * @param {{advance?: boolean}} [options]
 * @returns {Object}
 */
function selectBundle(bundleId, { advance = true } = {}) {
    const bundle = findSimpleBundleById(bundleId) || getDefaultSimpleBundle();
    activeBundleId = bundle.id;

    if (bundle.wizardState) {
        try {
            setState({ ...CLEARED_WIZARD_STATE, ...bundle.wizardState });
        } catch (error) {
            console.warn('[simple-install] applying bundle failed:', error);
        }
    }

    renderSelectedBundle(bundle);
    // The active bundle (and thus its fan-control requirement) may have changed,
    // so recompose the authoritative pre-flash gate.
    syncPreflashFromHero();

    if (advance) {
        try {
            const reachable = getMaxReachableStep();
            const target = Math.min(REVIEW_STEP, Number.isFinite(reachable) ? reachable : REVIEW_STEP);
            setStep(target, { animate: false });
        } catch (error) {
            console.warn('[simple-install] advancing to review step failed:', error);
        }
    }

    renderStatus(window.webflashInstallReadiness || lastReadiness);
    return bundle;
}

/**
 * Plain-language live-region announcement for a bundle selection. Names the
 * acknowledgement(s) the customer still has to complete before install.
 *
 * @param {Object} bundle
 */
function announceBundleSelection(bundle) {
    if (!bundle) {
        return;
    }
    let message = `${bundle.displayName} selected.`;
    if (bundle.requiresFanControlAcknowledgement) {
        message += ' Preview firmware with fan control. Review and accept the preview and fan-control acknowledgements before installing.';
    } else if (bundle.requiresPreviewAcknowledgement) {
        message += ' Preview firmware. Review and accept the preview acknowledgement before installing.';
    } else {
        message += ' Stable firmware. Confirm before installing, then use the Install button.';
    }
    announce(message);
}

/**
 * Enter the Simple-install view: select the active bundle (the default stable
 * Bathroom PoE bundle on first entry; the customer's last choice thereafter) and
 * land on the review/install step. Idempotent.
 */
function enterSimpleView() {
    syncSafetyConfirmFromGate();
    selectBundle(activeBundleId || DEFAULT_BUNDLE_ID, { advance: true });
    syncTechnicalDetailsRevealed();
}

/**
 * Reveal the full wizard from the first step so the customer can pick a
 * different kit or build a custom configuration.
 */
function enterAdvancedView() {
    try {
        setStep(1, { animate: false });
    } catch (error) {
        console.warn('[simple-install] returning to wizard failed:', error);
    }
}

/**
 * Set the active install view. Toggles the `<html data-install-mode>`
 * attribute, the hidden state of the hero / advanced bar, persists the choice,
 * and runs the matching entry routine.
 *
 * @param {'simple'|'advanced'} mode
 * @param {{persist?: boolean}} [options]
 */
export function applyMode(mode, { persist = true } = {}) {
    const next = mode === 'advanced' ? 'advanced' : 'simple';

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-install-mode', next);
    }

    const hero = getHero();
    if (hero) {
        hero.hidden = next !== 'simple';
        hero.setAttribute('aria-hidden', String(next !== 'simple'));
    }
    const advancedBar = getAdvancedBar();
    if (advancedBar) {
        advancedBar.hidden = next !== 'advanced';
        advancedBar.setAttribute('aria-hidden', String(next !== 'advanced'));
    }

    syncPathChoice(next);

    if (persist) {
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // ignore — persistence is best-effort.
        }
    }

    if (next === 'simple') {
        enterSimpleView();
    } else {
        enterAdvancedView();
    }

    return next;
}

/**
 * Decide the initial view. Explicit advanced intent in the URL wins, then the
 * stored choice, then the simple default.
 *
 * @returns {'simple'|'advanced'}
 */
export function resolveInitialMode() {
    let params;
    try {
        params = new URLSearchParams((typeof window !== 'undefined' && window.location && window.location.search) || '');
    } catch {
        params = new URLSearchParams('');
    }

    const override = (params.get('installmode') || '').trim().toLowerCase();
    if (override === 'simple') {
        return 'simple';
    }
    if (override === 'advanced') {
        return 'advanced';
    }

    // Any explicit wizard path (kit picker, custom/manual) opens the wizard.
    const configMode = (params.get('configmode') || '').trim().toLowerCase();
    if (configMode) {
        return 'advanced';
    }

    // A deep link to a non-stable preset (e.g. the LED preview) belongs in the
    // wizard so its acknowledgement / module context is visible.
    const preset = (params.get('preset') || '').trim().toUpperCase();
    if (preset && preset !== STABLE_PRESET_ID) {
        return 'advanced';
    }

    let stored = '';
    try {
        stored = (localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
    } catch {
        stored = '';
    }
    if (stored === 'advanced') {
        return 'advanced';
    }

    return 'simple';
}

/**
 * Acknowledge the "freshness unknown" gate so the customer can continue with
 * the firmware list already loaded in this browser. WF-UX-013 — this ticks the
 * authoritative manifest-freshness acknowledgement ([data-manifest-freshness-acknowledge])
 * and re-dispatches `change` so state.js recomputes the gate. The acknowledgement
 * stays authoritative in state.js; this never bypasses it. No-ops gracefully when
 * the control is absent (older embeds / unit fixtures).
 *
 * @returns {boolean} whether the acknowledgement control was found.
 */
function acknowledgeLoadedFirmwareList() {
    if (typeof document === 'undefined') {
        return false;
    }
    const ack = document.querySelector(FRESHNESS_ACK_SELECTOR);
    if (!ack) {
        return false;
    }
    if (!ack.checked) {
        ack.checked = true;
        try {
            ack.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {
            // restricted environments — the value is still set.
        }
    }
    return true;
}

function handleStatusAction(target) {
    const button = target.closest('[data-simple-install-action]');
    if (!button) {
        return false;
    }
    const action = button.dataset.simpleInstallAction;
    if (action === 'continue') {
        acknowledgeLoadedFirmwareList();
        return true;
    }
    if (action === 'reload') {
        const reason = lastReadiness && lastReadiness.reason;
        if (reason === 'update-available' && typeof triggerSkipWaitingAndReload === 'function') {
            try {
                triggerSkipWaitingAndReload();
                return true;
            } catch {
                // fall through to a plain reload
            }
        }
        try {
            window.location.reload();
        } catch {
            // jsdom / restricted environments — nothing else to do.
        }
        return true;
    }
    if (action === 'details') {
        openPreflightDetails();
        return true;
    }
    return false;
}

function handleDocumentClick(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
        return;
    }

    // WF-EASY-BUNDLE-PICKER-001 — the Simple-install bundle picker. Selecting a
    // card feeds the bundle's wizardState through setState() so Step 5 resolves
    // the matching firmware + gates. Preview bundles still gate behind the
    // release-channel preview acknowledgement; the Bathroom Relay bundle also
    // gates behind the fan-control acknowledgement.
    const bundleCard = target.closest(BUNDLE_CARD_SELECTOR);
    if (bundleCard) {
        event.preventDefault();
        const bundle = selectBundle(bundleCard.getAttribute('data-simple-bundle-id'), { advance: true });
        announceBundleSelection(bundle);
        return;
    }

    // WF-UX-012 — the first-choice path picker. An explicit Simple/Advanced
    // button takes priority and routes through the same applyMode() the legacy
    // [data-enter-*] links use, so the picker, the secondary links, and the
    // advanced-bar "back" control stay consistent.
    const pathButton = target.closest('[data-install-path]');
    if (pathButton) {
        event.preventDefault();
        const path = pathButton.getAttribute('data-install-path') === 'advanced' ? 'advanced' : 'simple';
        applyMode(path);
        announce(path === 'advanced'
            ? 'Advanced install. The full firmware wizard is now shown.'
            : 'Simple install. Choose your Sense360 kit.');
        return;
    }

    // WF-UX-017 — the secondary freshness note's "Reload" affordance. Unknown
    // freshness is never a pending-SW-update, so a plain reload is correct here
    // (the SW skip-waiting path stays reserved for the 'update-available' status
    // action). Setup checks is handled by the shared [data-open-setup-checks] case.
    if (target.closest('[data-simple-install-freshness-reload]')) {
        event.preventDefault();
        try {
            window.location.reload();
        } catch {
            // jsdom / restricted environments — nothing else to do.
        }
        return;
    }

    if (target.closest('[data-open-setup-checks]')) {
        event.preventDefault();
        openPreflightDetails();
        return;
    }

    // WF-UX-015 — the "Technical details" secondary link opens the single hero
    // disclosure and reveals the collapsed firmware-detail surfaces.
    if (target.closest(TECH_DETAILS_LINK_SELECTOR)) {
        event.preventDefault();
        openTechnicalDetails();
        return;
    }

    if (target.closest('[data-enter-advanced]')) {
        event.preventDefault();
        applyMode('advanced');
        announce('Advanced install. The full firmware wizard is now shown.');
        return;
    }
    if (target.closest('[data-enter-simple]')) {
        event.preventDefault();
        applyMode('simple');
        announce('Simple install. Choose your Sense360 kit.');
        return;
    }
    handleStatusAction(target);
}

function subscribeReadiness() {
    if (typeof document === 'undefined') {
        return;
    }
    document.addEventListener('webflash:install-readiness-changed', (event) => {
        renderStatus(event && event.detail ? event.detail : null);
    });
}

/**
 * Idempotent init. No-ops on any page that does not ship the simple-install
 * hero (so unrelated tests and embeds are unaffected).
 */
export function initSimpleInstall() {
    if (!getHero()) {
        return;
    }
    document.addEventListener('click', handleDocumentClick);
    subscribeReadiness();
    bindSafetyConfirmMirror();
    bindTechnicalDetailsDisclosure();
    const mode = resolveInitialMode();
    applyMode(mode, { persist: false });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSimpleInstall, { once: true });
    } else {
        initSimpleInstall();
    }
}

export const __testHooks = Object.freeze({
    initSimpleInstall,
    applyMode,
    resolveInitialMode,
    renderStatus,
    renderFreshnessNote,
    describeReadiness,
    syncPathChoice,
    openPreflightDetails,
    openTechnicalDetails,
    setTechnicalDetailsRevealed,
    syncTechnicalDetailsRevealed,
    bindTechnicalDetailsDisclosure,
    acknowledgeLoadedFirmwareList,
    bindSafetyConfirmMirror,
    syncSafetyConfirmFromGate,
    // WF-EASY-BUNDLE-PICKER-001 — bundle picker hooks.
    selectBundle,
    getActiveBundle,
    getActiveBundleId: () => activeBundleId,
    renderSelectedBundle,
    syncPreflashFromHero,
    fanControlSatisfied,
    bundleArtifactName,
    announceBundleSelection,
    SIMPLE_BUNDLES,
    DEFAULT_BUNDLE_ID,
    resetActiveBundleForTests: () => { activeBundleId = DEFAULT_BUNDLE_ID; },
    getLastReadiness: () => lastReadiness,
    resetForTests: () => { lastReadiness = null; activeBundleId = DEFAULT_BUNDLE_ID; },
    STORAGE_KEY,
    STABLE_PRESET_ID,
    TECH_REVEAL_ATTR
});
