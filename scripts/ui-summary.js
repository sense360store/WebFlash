import { getState, getStep, subscribe } from './state.js';
import { createSharableLink, updateUrl } from './query-presets.js';

const labels = {
    mount: 'Mounting',
    power: 'Power',
    airiq: 'AirIQ',
    presence: 'Presence',
    comfort: 'Comfort',
    fan: 'Fan'
};

function sentenceCase(value) {
    if (!value) {
        return '';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatModuleValue(value) {
    if (!value || value === 'none') {
        return 'None';
    }
    return sentenceCase(value);
}

function ensureSummaryContainer() {
    let summaryHost = document.getElementById('wizard-summary');
    if (summaryHost) {
        summaryHost.classList.add('wizard-summary', 'summary-wrap');
        return summaryHost;
    }

    summaryHost = document.createElement('aside');
    summaryHost.id = 'wizard-summary';
    summaryHost.className = 'wizard-summary summary-wrap';
    document.body.appendChild(summaryHost);
    return summaryHost;
}

function createSummaryRow(label, key) {
    const row = document.createElement('div');
    row.className = 'summary-card__row';
    row.dataset.summaryKey = key;

    const labelEl = document.createElement('span');
    labelEl.className = 'summary-card__label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'summary-card__value';
    valueEl.dataset.summaryValue = key;
    valueEl.textContent = 'Not selected';

    row.appendChild(labelEl);
    row.appendChild(valueEl);

    return row;
}

function createSummaryCard() {
    const host = ensureSummaryContainer();
    host.innerHTML = '';

    const card = document.createElement('section');
    card.className = 'summary-card';
    card.setAttribute('aria-live', 'polite');

    const heading = document.createElement('h2');
    heading.className = 'summary-card__title';
    heading.textContent = 'Configuration summary';

    const intro = document.createElement('p');
    intro.className = 'summary-card__intro summary-note';
    intro.textContent = 'Selections update automatically as you move through the wizard.';

    const rows = document.createElement('div');
    rows.className = 'summary-card__rows';

    Object.entries(labels).forEach(([key, label]) => {
        rows.appendChild(createSummaryRow(label, key));
    });

    const warning = document.createElement('div');
    warning.className = 'summary-card__warning';
    warning.dataset.summaryFanWarning = 'true';
    warning.hidden = true;
    warning.textContent = 'Fan not available on Ceiling';

    const actions = document.createElement('div');
    actions.className = 'summary-card__actions summary-actions';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn summary-card__copy primary';
    copyButton.textContent = 'Copy sharable link';

    const status = document.createElement('p');
    status.className = 'summary-card__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    actions.appendChild(copyButton);
    actions.appendChild(status);

    card.appendChild(heading);
    card.appendChild(intro);
    card.appendChild(rows);
    card.appendChild(warning);
    card.appendChild(actions);

    host.appendChild(card);

    return { card, copyButton, status, warning };
}

function updateRowValue(root, key, value, options = {}) {
    const valueEl = root.querySelector(`[data-summary-value="${key}"]`);
    if (!valueEl) {
        return;
    }

    valueEl.textContent = value;
    valueEl.dataset.empty = options.isEmpty ? 'true' : 'false';
}

function applySummaryState(cardElements, state) {
    const { card, warning, status } = cardElements;

    if (status) {
        status.textContent = '';
        delete status.dataset.statusType;
    }

    updateRowValue(card, 'mount', state.mount ? sentenceCase(state.mount) : 'Not selected', {
        isEmpty: !state.mount
    });

    updateRowValue(card, 'power', state.power ? state.power.toUpperCase() : 'Not selected', {
        isEmpty: !state.power
    });

    updateRowValue(card, 'airiq', formatModuleValue(state.airiq));
    updateRowValue(card, 'presence', formatModuleValue(state.presence));
    updateRowValue(card, 'comfort', formatModuleValue(state.comfort));

    if (state.mount === 'ceiling') {
        updateRowValue(card, 'fan', 'Unavailable', { isEmpty: true });
        warning.hidden = false;
    } else {
        updateRowValue(card, 'fan', formatModuleValue(state.fan));
        warning.hidden = state.fan !== 'none';
        if (state.fan === 'none') {
            warning.hidden = true;
        }
    }
}

function bindCopyButton(cardElements) {
    const { copyButton, status } = cardElements;

    if (!copyButton) {
        return;
    }

    copyButton.addEventListener('click', async () => {
        const state = getState();
        const step = getStep();

        updateUrl(state, step);
        const shareUrl = createSharableLink(null, state, step);

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                const input = document.createElement('input');
                input.value = shareUrl;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
            }
            status.textContent = 'Sharable link copied to clipboard!';
            status.dataset.statusType = 'success';
        } catch (error) {
            console.error('Unable to copy link', error);
            status.textContent = 'Unable to copy link. Copy it manually from the address bar.';
            status.dataset.statusType = 'error';
        }
    });
}

function initSummary() {
    document.addEventListener('DOMContentLoaded', () => {
        const cardElements = createSummaryCard();
        bindCopyButton(cardElements);

        subscribe((state) => {
            applySummaryState(cardElements, state);
        });
    });
}

initSummary();
