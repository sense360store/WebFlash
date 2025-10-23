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

function resolveEventTargetElement(event) {
    const { target } = event;

    if (target instanceof Element) {
        return target;
    }

    if (typeof event.composedPath === 'function') {
        const path = event.composedPath();
        for (const entry of path) {
            if (entry instanceof Element) {
                return entry;
            }
        }
    }

    if (target && typeof target === 'object' && 'parentElement' in target) {
        let parent = target.parentElement;
        while (parent) {
            if (parent instanceof Element) {
                return parent;
            }
            parent = parent.parentElement;
        }
    }

    return null;
}

function handleWizardNavigation(event) {
    const elementTarget = resolveEventTargetElement(event);
    if (!elementTarget) {
        return;
    }

    const nextTrigger = elementTarget.closest('[data-next]');
    const backTrigger = elementTarget.closest('[data-back]');

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
