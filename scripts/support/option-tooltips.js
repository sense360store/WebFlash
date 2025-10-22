import { getOptionTooltip } from '../content/option-tooltips.js';

const TOOLTIP_ID_PREFIX = 'tooltip-text-';

function buildAccessibleDescription(info) {
    const parts = [];

    if (info.summary) {
        parts.push(info.summary);
    }

    if (info.pros?.length) {
        parts.push(`Pros: ${info.pros.join('; ')}`);
    }

    if (info.cons?.length) {
        parts.push(`Cons: ${info.cons.join('; ')}`);
    }

    if (info.measurements?.length) {
        parts.push(`Measurements: ${info.measurements.join('; ')}`);
    }

    if (info.learnMore?.label) {
        parts.push(`Learn more: ${info.learnMore.label}.`);
    }

    return parts.join(' ');
}

function createTooltipElement() {
    const tooltip = document.createElement('div');
    tooltip.className = 'option-tooltip-popover';
    tooltip.dataset.visible = 'false';
    tooltip.setAttribute('role', 'tooltip');

    const content = document.createElement('div');
    content.className = 'option-tooltip__content';
    tooltip.appendChild(content);

    document.body.appendChild(tooltip);
    return tooltip;
}

function renderList(items = [], className) {
    if (!items.length) {
        return null;
    }

    const list = document.createElement('ul');
    list.className = className;

    items.forEach((entry) => {
        const item = document.createElement('li');
        item.textContent = entry;
        list.appendChild(item);
    });

    return list;
}

function renderSection({ title, items, className }) {
    const section = document.createElement('div');
    section.className = 'option-tooltip__section';

    const heading = document.createElement('div');
    heading.className = 'option-tooltip__section-title';
    heading.textContent = title;
    section.appendChild(heading);

    if (Array.isArray(items)) {
        const list = renderList(items, className);
        if (list) {
            section.appendChild(list);
        }
    } else if (items) {
        const paragraph = document.createElement('p');
        paragraph.textContent = items;
        section.appendChild(paragraph);
    }

    return section;
}

function renderTooltipContent(container, info) {
    container.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'option-tooltip__title';
    title.textContent = info.title;
    container.appendChild(title);

    if (info.summary) {
        const summary = document.createElement('p');
        summary.className = 'option-tooltip__summary';
        summary.textContent = info.summary;
        container.appendChild(summary);
    }

    if (info.pros?.length) {
        container.appendChild(
            renderSection({
                title: 'Pros',
                items: info.pros,
                className: 'option-tooltip__list'
            })
        );
    }

    if (info.cons?.length) {
        container.appendChild(
            renderSection({
                title: 'Cons',
                items: info.cons,
                className: 'option-tooltip__list'
            })
        );
    }

    if (info.measurements?.length) {
        container.appendChild(
            renderSection({
                title: 'Measurements',
                items: info.measurements,
                className: 'option-tooltip__measurements'
            })
        );
    }

    if (info.learnMore?.href) {
        const footer = document.createElement('div');
        footer.className = 'option-tooltip__footer';

        const link = document.createElement('a');
        link.className = 'option-tooltip__learn-more';
        link.href = info.learnMore.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = info.learnMore.label ?? 'Learn more';

        footer.appendChild(link);
        container.appendChild(footer);
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function positionTooltip(tooltip, trigger) {
    const triggerRect = trigger.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    tooltip.style.top = '0px';
    tooltip.style.left = '0px';
    tooltip.classList.remove('option-tooltip--above');

    const { width: tooltipWidth, height: tooltipHeight } = tooltip.getBoundingClientRect();

    const spacing = 12;
    let top = triggerRect.bottom + spacing + scrollY;
    let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2 + scrollX;

    const maxLeft = document.documentElement.scrollWidth - tooltipWidth - 16;
    left = clamp(left, 16 + scrollX, maxLeft);

    const triggerCenter = triggerRect.left + triggerRect.width / 2 + scrollX;
    const localCenter = triggerCenter - left;
    const minArrow = 12;
    const maxArrow = Math.max(tooltipWidth - 28, minArrow);
    const arrowLeft = clamp(localCenter - 8, minArrow, maxArrow);
    tooltip.style.setProperty('--tooltip-arrow-left', `${arrowLeft}px`);

    const viewportBottom = scrollY + window.innerHeight;
    if (top + tooltipHeight > viewportBottom - 12) {
        top = triggerRect.top - tooltipHeight - spacing + scrollY;
        tooltip.classList.add('option-tooltip--above');
    } else {
        tooltip.classList.remove('option-tooltip--above');
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

function hideTooltip(tooltip, triggerRef) {
    if (triggerRef) {
        triggerRef.setAttribute('aria-expanded', 'false');
    }

    tooltip.dataset.visible = 'false';
    tooltip.classList.remove('option-tooltip--above');
    tooltip.style.removeProperty('--tooltip-arrow-left');
}

function showTooltip({ tooltip, trigger, info, contentEl }) {
    renderTooltipContent(contentEl, info);
    tooltip.dataset.visible = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    tooltip.removeAttribute('hidden');
    tooltip.classList.remove('option-tooltip--above');
    positionTooltip(tooltip, trigger);
}

function setupAccessibleDescription(trigger, info, id) {
    let srText = trigger.querySelector(`#${id}`);

    if (!srText) {
        srText = document.createElement('span');
        srText.id = id;
        srText.className = 'sr-only';
        trigger.appendChild(srText);
    }

    srText.textContent = buildAccessibleDescription(info);
    trigger.setAttribute('aria-describedby', id);
}

function initOptionTooltips() {
    const triggers = Array.from(document.querySelectorAll('[data-option-info]'));

    if (!triggers.length) {
        return;
    }

    const tooltip = createTooltipElement();
    const contentEl = tooltip.querySelector('.option-tooltip__content');
    let activeTrigger = null;
    let hideTimeout = null;

    function scheduleHide() {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
        }

        hideTimeout = window.setTimeout(() => {
            if (activeTrigger) {
                hideTooltip(tooltip, activeTrigger);
                activeTrigger = null;
            }
        }, 160);
    }

    function cancelHide() {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    }

    function activateTrigger(trigger) {
        const group = trigger.dataset.optionGroup;
        const value = trigger.dataset.optionValue;
        const info = getOptionTooltip(group, value);

        if (!info) {
            return;
        }

        if (activeTrigger === trigger) {
            return;
        }

        if (activeTrigger && activeTrigger !== trigger) {
            activeTrigger.setAttribute('aria-expanded', 'false');
        }

        const descriptionId = `${TOOLTIP_ID_PREFIX}${group}-${value}`;
        setupAccessibleDescription(trigger, info, descriptionId);
        showTooltip({ tooltip, trigger, info, contentEl });
        activeTrigger = trigger;
    }

    triggers.forEach((trigger) => {
        const group = trigger.dataset.optionGroup;
        const value = trigger.dataset.optionValue;
        const info = getOptionTooltip(group, value);

        if (!info) {
            trigger.setAttribute('hidden', '');
            return;
        }

        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');

        trigger.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        trigger.addEventListener('mouseenter', () => {
            cancelHide();
            activateTrigger(trigger);
        });

        trigger.addEventListener('mouseleave', () => {
            scheduleHide();
        });

        trigger.addEventListener('focus', () => {
            cancelHide();
            activateTrigger(trigger);
        });

        trigger.addEventListener('blur', () => {
            scheduleHide();
        });

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (activeTrigger === trigger) {
                hideTooltip(tooltip, activeTrigger);
                activeTrigger = null;
            } else {
                cancelHide();
                activateTrigger(trigger);
            }
        });
    });

    tooltip.addEventListener('mouseenter', cancelHide);
    tooltip.addEventListener('mouseleave', scheduleHide);

    tooltip.addEventListener('focusin', cancelHide);
    tooltip.addEventListener('focusout', () => {
        window.requestAnimationFrame(() => {
            const activeElement = document.activeElement;
            if (!tooltip.contains(activeElement) && activeElement !== activeTrigger) {
                scheduleHide();
            }
        });
    });

    tooltip.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
    });

    document.addEventListener('pointerdown', (event) => {
        if (!activeTrigger) {
            return;
        }

        if (tooltip.contains(event.target) || activeTrigger.contains(event.target)) {
            return;
        }

        hideTooltip(tooltip, activeTrigger);
        activeTrigger = null;
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeTrigger) {
            hideTooltip(tooltip, activeTrigger);
            activeTrigger.focus();
            activeTrigger = null;
        }
    });

    window.addEventListener('scroll', () => {
        if (activeTrigger) {
            positionTooltip(tooltip, activeTrigger);
        }
    });

    window.addEventListener('resize', () => {
        if (activeTrigger) {
            positionTooltip(tooltip, activeTrigger);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOptionTooltips);
} else {
    initOptionTooltips();
}
