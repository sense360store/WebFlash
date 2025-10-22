import { applyPreset, getMatchingPreset, recommendedPreset } from './query-presets.js';

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

    const applyRecommendedPreset = () => {
        try {
            applyPreset(recommendedPreset.state, { step: 4 });
        } catch (error) {
            console.error('[recommended-bundle] Failed to apply preset', error);
        }
    };

    const updateVisualState = (state) => {
        if (!state) {
            return;
        }

        let presetMatch = null;
        try {
            presetMatch = getMatchingPreset(state);
        } catch (error) {
            console.warn('[recommended-bundle] Unable to determine preset match', error);
        }

        const isActive = Boolean(presetMatch && presetMatch.name === recommendedPreset.name);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.toggle('is-active', isActive);

        if (description) {
            description.dataset.active = isActive ? 'true' : 'false';
        }
    };

    button.addEventListener('click', (event) => {
        event.preventDefault();
        applyRecommendedPreset();
    });

    button.setAttribute('aria-pressed', 'false');

    const summary = window.wizardStateSummary || null;
    if (summary && typeof summary.onStateChange === 'function') {
        summary.onStateChange(updateVisualState);
        try {
            if (typeof summary.getState === 'function') {
                updateVisualState(summary.getState());
            }
        } catch (error) {
            console.warn('[recommended-bundle] Unable to read initial state', error);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseRecommendedBundleCallout, { once: true });
} else {
    initialiseRecommendedBundleCallout();
}
