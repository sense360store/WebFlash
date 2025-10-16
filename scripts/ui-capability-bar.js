const STATUS_TEXT = {
    available: 'Available',
    unavailable: 'Unavailable',
    partial: 'Check requirements'
};

function createChip(label, status) {
    const chip = document.createElement('span');
    chip.className = 'capability-chip';
    chip.dataset.status = status;

    const labelEl = document.createElement('span');
    labelEl.className = 'capability-chip-label';
    labelEl.textContent = label;

    const statusEl = document.createElement('span');
    statusEl.className = 'capability-chip-status';
    statusEl.textContent = STATUS_TEXT[status] ?? status;

    chip.appendChild(labelEl);
    chip.appendChild(statusEl);

    return chip;
}

function createCopyButton(capabilities) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'capability-copy-btn';
    button.textContent = 'Copy support info';

    const feedback = document.createElement('span');
    feedback.className = 'capability-copy-feedback';
    feedback.setAttribute('aria-live', 'polite');

    const supportInfoLines = [
        `User agent: ${capabilities.ua || 'Unknown'}`,
        `Web Serial: ${capabilities.webSerial ? 'Available' : 'Unavailable'}`,
        `WebUSB: ${capabilities.webUSB ? 'Available' : 'Unavailable'}`,
        `Detected browser: ${capabilities.browser}`
    ];
    const supportInfo = supportInfoLines.join('\n');

    async function writeToClipboard(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    button.addEventListener('click', async () => {
        try {
            await writeToClipboard(supportInfo);
            feedback.textContent = 'Support info copied to clipboard.';
        } catch (err) {
            console.error('Unable to copy support info', err);
            feedback.textContent = 'Copy failed. Please copy manually.';
        }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'capability-copy';
    wrapper.appendChild(button);
    wrapper.appendChild(feedback);

    return wrapper;
}

export function renderCapabilityBar(capabilities) {
    const bar = document.createElement('div');
    bar.id = 'capability-bar';
    bar.className = 'capability-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Browser capability status');

    const chipsWrapper = document.createElement('div');
    chipsWrapper.className = 'capability-bar__chips';

    const serialStatus = capabilities.webSerial ? 'available' : 'unavailable';
    const usbStatus = capabilities.webUSB ? 'available' : 'unavailable';
    const improvStatus = capabilities.webSerial && capabilities.webUSB ? 'available' : 'partial';

    chipsWrapper.appendChild(createChip('Web Serial', serialStatus));
    chipsWrapper.appendChild(createChip('WebUSB', usbStatus));
    chipsWrapper.appendChild(createChip('Improv-ready', improvStatus));

    bar.appendChild(chipsWrapper);
    bar.appendChild(createCopyButton(capabilities));

    return bar;
}
