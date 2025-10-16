(function () {
    const wizardState = window.webflashWizard && window.webflashWizard.state;
    if (!wizardState) {
        console.warn('WebFlash summary panel could not find wizard state shim.');
        return;
    }

    const LABELS = {
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

    function ensureSummaryHost() {
        const host = document.getElementById('wizard-summary');
        if (!host) {
            return null;
        }
        host.innerHTML = '';
        return host;
    }

    function createRow(label, key) {
        const row = document.createElement('div');
        row.className = 'summary-card__row';
        row.dataset.summaryKey = key;

        const labelEl = document.createElement('span');
        labelEl.className = 'summary-card__label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'summary-card__value';
        valueEl.dataset.summaryValue = key;
        valueEl.dataset.empty = 'true';
        valueEl.textContent = 'Not selected';

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        return row;
    }

    function createSummaryCard() {
        const host = ensureSummaryHost();
        if (!host) {
            return null;
        }

        const card = document.createElement('section');
        card.className = 'summary-card';
        card.setAttribute('aria-live', 'polite');

        const heading = document.createElement('h2');
        heading.className = 'summary-card__title';
        heading.textContent = 'Configuration summary';

        const intro = document.createElement('p');
        intro.className = 'summary-card__intro';
        intro.textContent = 'Selections update automatically as you move through the wizard.';

        const rows = document.createElement('div');
        rows.className = 'summary-card__rows';
        Object.entries(LABELS).forEach(([key, label]) => {
            rows.appendChild(createRow(label, key));
        });

        const warning = document.createElement('div');
        warning.className = 'summary-card__warning';
        warning.dataset.summaryFanWarning = 'true';
        warning.hidden = true;
        warning.textContent = 'Fan not available on Ceiling';

        const actions = document.createElement('div');
        actions.className = 'summary-card__actions';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn btn-secondary summary-card__copy';
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

    function updateRowValue(root, key, value, { isEmpty = false } = {}) {
        if (!root) {
            return;
        }
        const valueEl = root.querySelector(`[data-summary-value="${key}"]`);
        if (!valueEl) {
            return;
        }

        valueEl.textContent = value;
        valueEl.dataset.empty = isEmpty ? 'true' : 'false';
    }

    function applyState(cardElements, snapshot) {
        if (!cardElements) {
            return;
        }

        const { card, warning, status } = cardElements;
        if (status) {
            status.textContent = '';
            delete status.dataset.statusType;
        }

        updateRowValue(card, 'mount', snapshot.mount ? sentenceCase(snapshot.mount) : 'Not selected', {
            isEmpty: !snapshot.mount
        });

        updateRowValue(card, 'power', snapshot.power ? snapshot.power.toUpperCase() : 'Not selected', {
            isEmpty: !snapshot.power
        });

        updateRowValue(card, 'airiq', formatModuleValue(snapshot.airiq));
        updateRowValue(card, 'presence', formatModuleValue(snapshot.presence));
        updateRowValue(card, 'comfort', formatModuleValue(snapshot.comfort));

        if (snapshot.mount === 'ceiling') {
            updateRowValue(card, 'fan', 'Unavailable', { isEmpty: true });
            if (warning) {
                warning.hidden = false;
            }
        } else {
            updateRowValue(card, 'fan', formatModuleValue(snapshot.fan), {
                isEmpty: snapshot.fan === 'none'
            });
            if (warning) {
                warning.hidden = true;
            }
        }
    }

    function bindCopyButton(cardElements) {
        if (!cardElements || !cardElements.copyButton) {
            return;
        }

        const { copyButton, status } = cardElements;
        copyButton.addEventListener('click', async () => {
            if (typeof window.updateUrlFromConfiguration === 'function') {
                try {
                    window.updateUrlFromConfiguration();
                } catch (error) {
                    console.warn('Unable to refresh sharable URL before copying.', error);
                }
            }

            const shareUrl = window.location.href;

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

                if (status) {
                    status.textContent = 'Sharable link copied to clipboard!';
                    status.dataset.statusType = 'success';
                }
            } catch (error) {
                console.error('Unable to copy link', error);
                if (status) {
                    status.textContent = 'Unable to copy link. Copy it manually from the address bar.';
                    status.dataset.statusType = 'error';
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const cardElements = createSummaryCard();
        if (!cardElements) {
            return;
        }

        bindCopyButton(cardElements);

        const applySnapshot = (snapshot) => {
            applyState(cardElements, snapshot || wizardState.getState());
        };

        applySnapshot(wizardState.getState());
        wizardState.subscribe(applySnapshot);
    });
})();
