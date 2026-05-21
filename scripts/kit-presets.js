/**
 * @fileoverview Stage 1 kit bundle preset controller (WF-KIT-PRESETS-001).
 *
 * Wires the productized kit bundle cards in Step 1 to the existing wizard
 * state. The preset list lives in `scripts/data/kit-presets.js` (a static,
 * local mirror of upstream KIT-MATRIX-001). On selection of an available
 * preset the preset's `wizardState` is fed through the same `setState()`
 * the manual flow and the kit-mode SKU picker already use; the wizard then
 * advances to Step 5 so the user can review the resolved firmware.
 *
 * Critical: this controller never bypasses release-channel logic, firmware
 * readiness, provenance, freshness, or the install gate. The preview kit
 * (Bathroom Kit — PoE + Status Ring Preview) still requires the
 * preview-channel acknowledgement at install time — the preset just
 * pre-selects the LED toggle and resolves the user to the LED preview
 * build. Planned kits (Relay / TRIAC / PWM / DAC variants) are intentionally
 * non-installable: clicking them surfaces an explanation but never mutates
 * wizard state.
 *
 * @module kit-presets
 */

import { getState, setState, setStep, getMaxReachableStep } from './state.js';
import {
    KIT_PRESETS,
    findKitPresetById,
    isPresetAvailable,
    isPresetMatch
} from './data/kit-presets.js';
import {
    setActiveKitMetadata,
    setConfigurationMode,
    setSelectedKitSku
} from './services/diagnostics.js';
import { announce } from './utils/a11y.js';

const BUNDLE_PRESETS_SELECTOR = '[data-bundle-presets]';
const BUNDLE_PRESET_CARD_SELECTOR = '[data-bundle-preset-id]';
const BUNDLE_PRESET_AVAILABILITY_NOTICE_SELECTOR = '[data-bundle-preset-availability-notice]';

let lastAppliedPresetId = null;

function getBundlePresetsContainer() {
    return document.querySelector(BUNDLE_PRESETS_SELECTOR);
}

function getBundlePresetCards() {
    return Array.from(document.querySelectorAll(BUNDLE_PRESET_CARD_SELECTOR));
}

function getNoticeNode() {
    return document.querySelector(BUNDLE_PRESET_AVAILABILITY_NOTICE_SELECTOR);
}

function setNotice(message, tone = 'info') {
    const node = getNoticeNode();
    if (!node) return;
    if (!message) {
        node.hidden = true;
        node.textContent = '';
        node.removeAttribute('data-tone');
        return;
    }
    node.hidden = false;
    node.dataset.tone = tone;
    node.textContent = message;
}

function clearWizardModuleSelections() {
    return {
        mount: 'ceiling',
        power: null,
        bathroom: false,
        airiq: 'none',
        ventiq: 'none',
        roomiq: 'none',
        fan: 'none',
        led: 'none',
        voice: 'none'
    };
}

function appendPresetParamsToUrl(preset) {
    if (typeof window === 'undefined' || !window.history || !preset) {
        return;
    }
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('configmode', 'kit');
        url.searchParams.set('preset', preset.id);
        url.searchParams.delete('sku');
        window.history.replaceState(null, '', url.toString());
    } catch {
        // ignore — URL update is best-effort.
    }
}

function applyAvailablePreset(preset) {
    const cleared = clearWizardModuleSelections();
    setState({ ...cleared, ...preset.wizardState });

    lastAppliedPresetId = preset.id;
    setConfigurationMode('kit');
    setSelectedKitSku(preset.id);
    setActiveKitMetadata({
        sku: preset.id,
        display_name: preset.displayName,
        firmware_config_string: preset.firmwareConfigString,
        sample: false
    });
    appendPresetParamsToUrl(preset);

    refreshCardVisuals();

    const message = preset.requiresPreviewAcknowledgement
        ? `${preset.shortName} selected. Preview firmware — review the preview acknowledgement on Step 5 before install.`
        : `${preset.shortName} selected. Continuing to firmware review.`;
    announce(message);
    setNotice(message, preset.requiresPreviewAcknowledgement ? 'warning' : 'positive');

    const reachable = getMaxReachableStep();
    const target = Math.min(5, Number.isFinite(reachable) ? reachable : 5);
    setStep(target, { animate: true });
}

function explainPlannedPreset(preset) {
    const lines = [];
    if (preset.notAvailableReason) {
        lines.push(preset.notAvailableReason);
    } else {
        lines.push(`${preset.shortName} is planned upstream but not yet available in WebFlash.`);
    }
    if (preset.warning) {
        lines.push(preset.warning);
    }
    const message = lines.join(' ');
    announce(message);
    setNotice(message, 'warning');
}

function handlePresetClick(presetId) {
    const preset = findKitPresetById(presetId);
    if (!preset) {
        return;
    }
    if (isPresetAvailable(preset)) {
        applyAvailablePreset(preset);
    } else {
        explainPlannedPreset(preset);
    }
}

function refreshCardVisuals() {
    const state = (() => {
        try {
            return getState();
        } catch {
            return null;
        }
    })();

    const cards = getBundlePresetCards();
    cards.forEach(card => {
        const presetId = card.dataset.bundlePresetId;
        const preset = findKitPresetById(presetId);
        if (!preset) {
            return;
        }
        const customizedLabel = card.querySelector('[data-bundle-preset-customized]');

        const isMatch = state ? isPresetMatch(state, preset) : false;
        const isLastApplied = lastAppliedPresetId === preset.id;

        if (isPresetAvailable(preset)) {
            card.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
            card.classList.toggle('is-active', isMatch);
            card.classList.toggle('is-customized', !isMatch && isLastApplied);
            if (customizedLabel) {
                customizedLabel.hidden = isMatch || !isLastApplied;
            }
        } else {
            card.setAttribute('aria-pressed', 'false');
            card.classList.remove('is-active');
            card.classList.remove('is-customized');
            if (customizedLabel) {
                customizedLabel.hidden = true;
            }
        }
    });
}

function attachListeners() {
    const container = getBundlePresetsContainer();
    if (!container) {
        return;
    }
    container.addEventListener('click', (event) => {
        const card = event.target.closest(BUNDLE_PRESET_CARD_SELECTOR);
        if (!card || !container.contains(card)) {
            return;
        }
        event.preventDefault();
        handlePresetClick(card.dataset.bundlePresetId);
    });

    // Re-render the active-state highlight whenever the wizard state
    // changes, so the user sees which preset (if any) the current
    // configuration matches. The wizard-state-observer surfaces the
    // wizardStateSummary singleton on window once initialised.
    const summary = (typeof window !== 'undefined') ? window.wizardStateSummary : null;
    if (summary && typeof summary.onStateChange === 'function') {
        summary.onStateChange(() => refreshCardVisuals());
    }
}

function hydrateFromUrl() {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const params = new URLSearchParams(window.location.search || '');
        const presetId = params.get('preset');
        if (!presetId) {
            return;
        }
        const preset = findKitPresetById(presetId);
        if (!preset) {
            return;
        }
        if (isPresetAvailable(preset)) {
            // Mirror the user clicking the card: prefill state + jump to
            // Step 5. The wizard's release-channel UI will then surface the
            // preview acknowledgement for the LED preview build.
            applyAvailablePreset(preset);
        } else {
            explainPlannedPreset(preset);
        }
    } catch {
        // ignore — hydrate is best-effort.
    }
}

function initBundlePresets() {
    if (!getBundlePresetsContainer()) {
        return;
    }
    attachListeners();
    refreshCardVisuals();
    hydrateFromUrl();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBundlePresets, { once: true });
    } else {
        initBundlePresets();
    }
}

export const __testHooks = Object.freeze({
    initBundlePresets,
    handlePresetClick,
    refreshCardVisuals,
    getLastAppliedPresetId: () => lastAppliedPresetId,
    resetLastAppliedPresetIdForTests: () => { lastAppliedPresetId = null; },
    KIT_PRESETS
});
