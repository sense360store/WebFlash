import { getState as getWizardState, setState, setStep, getMaxReachableStep } from './state.js';

const RECOMMENDED_STATE = Object.freeze({
    mount: 'wall',
    power: 'usb',
    airiq: 'base',
    presence: 'base',
    comfort: 'none',
    fan: 'none'
});

function normaliseStateShape(state) {
    if (!state || typeof state !== 'object') {
        return {
            mount: null,
            power: null,
            airiq: 'none',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        };
    }

    return {
        mount: state.mount || null,
        power: state.power || null,
        airiq: state.airiq || 'none',
        presence: state.presence || 'none',
        comfort: state.comfort || 'none',
        fan: state.fan || 'none'
    };
}

function isRecommendedSelection(state) {
    const current = normaliseStateShape(state);
    return Object.entries(RECOMMENDED_STATE).every(([key, value]) => current[key] === value);
}

function applyRecommendedSelection() {
    try {
        setState(RECOMMENDED_STATE);
        const reachableStep = getMaxReachableStep();
        if (Number.isFinite(reachableStep) && reachableStep >= 4) {
            setStep(4);
        }
    } catch (error) {
        console.error('[recommended-bundle] Failed to apply recommended configuration', error);
    }
}

function initialiseRecommendedBundleCallout() {
    const callout = document.querySelector('[data-recommended-bundle]');
    if (!callout) {
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
