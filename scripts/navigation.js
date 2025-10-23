import { getStep, setStep, getTotalSteps, getMaxReachableStep } from './state.js';

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

function resolveEventTarget(event) {
    if (event.target instanceof Element) {
        return event.target;
    }

    if (typeof event.composedPath === 'function') {
        const elementTarget = event.composedPath().find(node => node instanceof Element);
        if (elementTarget) {
            return elementTarget;
        }
    }

    return null;
}

function handleWizardNavigation(event) {
    const target = resolveEventTarget(event);
    if (!target) {
        return;
    }

    const progressTrigger = target.closest('.progress-step');
    if (progressTrigger) {
        const stepValue = Number.parseInt(progressTrigger.getAttribute('data-step'), 10);
        if (!Number.isNaN(stepValue)) {
            const maxReachable = getMaxReachableStep();
            if (stepValue <= maxReachable) {
                event.preventDefault();
                setStep(stepValue, { animate: true });
            } else {
                event.preventDefault();
            }
        }
        return;
    }

    const nextTrigger = target.closest('[data-next]');
    const backTrigger = target.closest('[data-back]');

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
