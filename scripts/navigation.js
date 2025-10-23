import { getStep, setStep, getTotalSteps } from './state.js';

function normalizeIndex(index) {
    if (typeof index !== 'number') {
        index = Number.parseInt(index, 10);
    }

    if (Number.isNaN(index)) {
        index = 0;
    }

    const total = Math.max(1, getTotalSteps());
    return Math.min(total - 1, Math.max(0, index));
}

export function goToStep(index, options = {}) {
    const normalized = normalizeIndex(index);
    return setStep(normalized + 1, options);
}

function handleWizardNavigation(event) {
    const nextTrigger = event.target.closest('[data-next]');
    const backTrigger = event.target.closest('[data-back]');

    if (nextTrigger && !nextTrigger.disabled) {
        event.preventDefault();
        const currentIndex = getStep() - 1;
        goToStep(currentIndex + 1, { animate: true });
        return;
    }

    if (backTrigger && !backTrigger.disabled) {
        event.preventDefault();
        const currentIndex = getStep() - 1;
        goToStep(currentIndex - 1, { animate: true });
    }
}

function ensureInitialStep() {
    if (document.querySelector('.wizard-step.is-active, .wizard-step.active')) {
        return;
    }

    goToStep(0, { animate: false, skipUrlUpdate: true });
}

document.addEventListener('click', handleWizardNavigation);
document.addEventListener('DOMContentLoaded', ensureInitialStep, { once: true });
