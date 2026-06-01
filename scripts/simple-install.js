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
import { findKitPresetById } from './data/kit-presets.js';
import { triggerSkipWaitingAndReload } from './services/sw-update.js';
import { announce } from './utils/a11y.js';

const STORAGE_KEY = 'webflash-install-mode';
const STABLE_PRESET_ID = 'S360-KIT-BATH-POE';
const REVIEW_STEP = 5;

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
            return {
                level: 'attention',
                title: 'Needs attention',
                detail: 'Confirm the safety check below before installing.',
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
        heroAck.addEventListener('change', () => {
            const realAck = document.querySelector(PREFLASH_ACK_SELECTOR);
            if (realAck && realAck.checked !== heroAck.checked) {
                realAck.checked = heroAck.checked;
                try {
                    realAck.dispatchEvent(new Event('change', { bubbles: true }));
                } catch {
                    // restricted environments — the value is still set.
                }
            }
        });
        heroAck.dataset.confirmMirrorBound = 'true';
    }

    const realAck = document.querySelector(PREFLASH_ACK_SELECTOR);
    if (realAck && realAck.dataset.simpleConfirmMirrorBound !== 'true') {
        realAck.addEventListener('change', () => {
            const hero = document.querySelector(CONFIRM_SELECTOR);
            if (hero && hero.checked !== realAck.checked) {
                hero.checked = realAck.checked;
            }
        });
        realAck.dataset.simpleConfirmMirrorBound = 'true';
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
 * Apply the stable Release-One kit preset and advance to the review/install
 * step. Idempotent — running it twice just re-applies the same state.
 */
function enterSimpleView() {
    const preset = findKitPresetById(STABLE_PRESET_ID);
    if (preset && preset.wizardState) {
        try {
            setState({ ...CLEARED_WIZARD_STATE, ...preset.wizardState });
        } catch (error) {
            console.warn('[simple-install] applying stable preset failed:', error);
        }
    }
    try {
        const reachable = getMaxReachableStep();
        const target = Math.min(REVIEW_STEP, Number.isFinite(reachable) ? reachable : REVIEW_STEP);
        setStep(target, { animate: false });
    } catch (error) {
        console.warn('[simple-install] advancing to review step failed:', error);
    }
    syncSafetyConfirmFromGate();
    renderStatus(window.webflashInstallReadiness || lastReadiness);
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
            : 'Simple install. Showing the stable Sense360 Bathroom PoE kit.');
        return;
    }

    if (target.closest('[data-open-setup-checks]')) {
        event.preventDefault();
        openPreflightDetails();
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
        announce('Simple install. Showing the stable Sense360 Bathroom PoE kit.');
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
    describeReadiness,
    syncPathChoice,
    openPreflightDetails,
    acknowledgeLoadedFirmwareList,
    bindSafetyConfirmMirror,
    syncSafetyConfirmFromGate,
    getLastReadiness: () => lastReadiness,
    resetForTests: () => { lastReadiness = null; },
    STORAGE_KEY,
    STABLE_PRESET_ID
});
