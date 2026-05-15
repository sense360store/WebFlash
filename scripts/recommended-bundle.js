import { getState as getWizardState, setState, setStep, getMaxReachableStep } from './state.js';

// WF-UX-002: Recommended preset retargeted to the published Release-One
// configuration (`Ceiling-POE-VentIQ-RoomIQ`). Keep this in lock-step with
// the `[data-preset="recommended"]` button's `data-preset-config` in
// index.html and with the kit definition in scripts/data/kits.json so the
// quick-start shortcut and the kit picker resolve to the same firmware.
const RECOMMENDED_STATE = Object.freeze({
    mount: 'ceiling',
    power: 'poe',
    bathroom: true,
    ventiq: 'ventiq',
    roomiq: 'roomiq',
    airiq: 'none',
    fan: 'none',
    led: 'none'
});

function normaliseStateShape(state) {
    if (!state || typeof state !== 'object') {
        return {
            mount: null,
            power: null,
            bathroom: false,
            ventiq: 'none',
            roomiq: 'none',
            airiq: 'none',
            fan: 'none',
            led: 'none'
        };
    }

    return {
        mount: state.mounting || null,
        power: state.power || null,
        bathroom: Boolean(state.bathroom),
        ventiq: state.ventiq || 'none',
        roomiq: state.roomiq || 'none',
        airiq: state.airiq || 'none',
        fan: state.fan || 'none',
        led: state.led || 'none'
    };
}

function isMatchingPreset(state, preset) {
    const current = normaliseStateShape(state);
    return Object.entries(preset).every(([key, value]) => current[key] === value);
}

function isRecommendedSelection(state) {
    return isMatchingPreset(state, RECOMMENDED_STATE);
}

function applyPreset(preset) {
    try {
        setState(preset);
        const reachableStep = getMaxReachableStep();
        if (Number.isFinite(reachableStep) && reachableStep >= 4) {
            setStep(4);
        }
    } catch (error) {
        console.error('[recommended-bundle] Failed to apply preset configuration', error);
    }
}

function applyRecommendedSelection() {
    applyPreset(RECOMMENDED_STATE);
}

function initialiseQuickStartPresets() {
    const container = document.querySelector('[data-quick-start-presets]');
    if (!container) {
        return;
    }

    const presetButtons = container.querySelectorAll('[data-preset-config]');
    if (!presetButtons.length) {
        return;
    }

    const updateButtonStates = (state) => {
        if (!state) return;

        presetButtons.forEach((button) => {
            try {
                const configStr = button.dataset.presetConfig;
                if (!configStr) return;

                const preset = JSON.parse(configStr);
                const isActive = isMatchingPreset(state, preset);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                button.classList.toggle('is-active', isActive);
            } catch (err) {
                console.warn('[quick-start] Failed to parse preset config', err);
            }
        });
    };

    presetButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            try {
                const configStr = button.dataset.presetConfig;
                if (!configStr) return;

                const preset = JSON.parse(configStr);
                applyPreset(preset);
            } catch (err) {
                console.error('[quick-start] Failed to apply preset', err);
            }
        });
        button.setAttribute('aria-pressed', 'false');
    });

    const summary = window.wizardStateSummary || null;
    if (summary && typeof summary.onStateChange === 'function') {
        summary.onStateChange(updateButtonStates);
        try {
            if (typeof summary.getState === 'function') {
                updateButtonStates(summary.getState());
                return;
            }
        } catch (error) {
            console.warn('[quick-start] Unable to read initial state from summary', error);
        }
    }

    try {
        updateButtonStates(getWizardState());
    } catch (error) {
        console.warn('[quick-start] Unable to read initial state', error);
    }
}

function initialiseRecommendedBundleCallout() {
    // Legacy support for old markup
    const callout = document.querySelector('[data-recommended-bundle]');
    if (!callout) {
        // Try new quick-start presets instead
        initialiseQuickStartPresets();
        return;
    }

    const button = callout.querySelector('[data-recommended-bundle-button]');
    const description = callout.querySelector('[data-recommended-bundle-description]');

    if (!button) {
        return;
    }

    const updateVisualState = (state) => {
        if (!state) {
            return;
        }

        const isActive = isRecommendedSelection(state);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.toggle('is-active', isActive);

        if (description) {
            description.dataset.active = isActive ? 'true' : 'false';
        }
    };

    button.addEventListener('click', (event) => {
        event.preventDefault();
        applyRecommendedSelection();
    });

    button.setAttribute('aria-pressed', 'false');

    const summary = window.wizardStateSummary || null;
    if (summary && typeof summary.onStateChange === 'function') {
        summary.onStateChange(updateVisualState);
        try {
            if (typeof summary.getState === 'function') {
                updateVisualState(summary.getState());
                return;
            }
        } catch (error) {
            console.warn('[recommended-bundle] Unable to read initial state from summary', error);
        }
    }

    try {
        updateVisualState(getWizardState());
    } catch (error) {
        console.warn('[recommended-bundle] Unable to read initial state', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseRecommendedBundleCallout, { once: true });
} else {
    initialiseRecommendedBundleCallout();
}
