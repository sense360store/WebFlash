import { getOptionTooltip } from '../content/option-tooltips.js';

const infoButtons = Array.from(document.querySelectorAll('[data-option-info]'));
const popover = document.getElementById('option-info-popover');

if (infoButtons.length && popover) {
    const titleEl = popover.querySelector('[data-popover-title]');
    const summaryEl = popover.querySelector('[data-popover-summary]');
    const prosSection = popover.querySelector('[data-popover-pros-section]');
    const prosList = popover.querySelector('[data-popover-pros]');
    const consSection = popover.querySelector('[data-popover-cons-section]');
    const consList = popover.querySelector('[data-popover-cons]');
    const closeButton = popover.querySelector('[data-popover-close]');

    let activeTrigger = null;
    let restoreFocusTo = null;

    infoButtons.forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', popover.id);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            togglePopover(button);
        });

        button.addEventListener('keydown', (event) => {
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                togglePopover(button);
            }
        });
    });

    closeButton?.addEventListener('click', () => {
        closePopover();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !popover.hidden) {
            event.stopPropagation();
            event.preventDefault();
            closePopover();
        }
    });

    document.addEventListener('pointerdown', (event) => {
        const isWithinTrigger = activeTrigger?.contains(event.target);
        if (!popover.hidden && !popover.contains(event.target) && !isWithinTrigger) {
            closePopover();
        }
    });

    window.addEventListener('scroll', () => {
        if (!popover.hidden && activeTrigger) {
            positionPopover(activeTrigger);
        }
    }, true);

    window.addEventListener('resize', () => {
        if (!popover.hidden && activeTrigger) {
            positionPopover(activeTrigger);
        }
    });

    function togglePopover(button) {
        if (!popover.hidden && activeTrigger === button) {
            closePopover();
            return;
        }

        openPopover(button);
    }

    function openPopover(button) {
        const group = button.getAttribute('data-option-group');
        const value = button.getAttribute('data-option-value');
        const tooltip = getOptionTooltip(group, value);

        if (!tooltip) {
            closePopover();
            return;
        }

        infoButtons.forEach((otherButton) => {
            if (otherButton !== button) {
                otherButton.setAttribute('aria-expanded', 'false');
            }
        });

        button.setAttribute('aria-expanded', 'true');
        restoreFocusTo = button;
        activeTrigger = button;

        updateContent(tooltip);
        popover.hidden = false;
        popover.style.visibility = 'hidden';
        popover.style.left = '0px';
        popover.style.top = '0px';

        requestAnimationFrame(() => {
            positionPopover(button);
            popover.style.visibility = '';
            popover.focus({ preventScroll: true });
        });
    }

    function closePopover() {
        if (popover.hidden) {
            return;
        }

        popover.hidden = true;
        if (activeTrigger) {
            activeTrigger.setAttribute('aria-expanded', 'false');
        }

        if (restoreFocusTo && document.contains(restoreFocusTo)) {
            restoreFocusTo.focus({ preventScroll: true });
        }

        activeTrigger = null;
        restoreFocusTo = null;
    }

    function updateContent(tooltip) {
        if (titleEl) {
            titleEl.textContent = tooltip.title || '';
        }

        if (summaryEl) {
            summaryEl.textContent = tooltip.summary || '';
            summaryEl.toggleAttribute('hidden', !tooltip.summary);
        }

        populateList(prosList, prosSection, tooltip.pros);
        populateList(consList, consSection, tooltip.cons);
    }

    function populateList(listElement, sectionElement, items) {
        if (!listElement || !sectionElement) {
            return;
        }

        listElement.innerHTML = '';

        if (!Array.isArray(items) || items.length === 0) {
            sectionElement.hidden = true;
            return;
        }

        items.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = item;
            listElement.appendChild(li);
        });

        sectionElement.hidden = false;
    }

    function positionPopover(button) {
        const triggerRect = button.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        let top = triggerRect.bottom + window.scrollY + 12;
        let left = triggerRect.left + window.scrollX;
        const minLeft = window.scrollX + 16;

        if (left + popoverRect.width > viewportWidth - 16) {
            left = Math.max(16, viewportWidth - popoverRect.width - 16) + window.scrollX;
        }

        if (left < minLeft) {
            left = minLeft;
        }

        if (top + popoverRect.height > window.scrollY + viewportHeight - 16) {
            top = triggerRect.top + window.scrollY - popoverRect.height - 12;
        }

        if (top < window.scrollY + 16) {
            top = window.scrollY + 16;
        }

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
    }
}
