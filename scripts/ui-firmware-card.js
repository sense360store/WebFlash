(function () {
    const DEFAULT_PLACEHOLDER = '—';

    function formatBytes(bytes) {
        if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
            return DEFAULT_PLACEHOLDER;
        }
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        const units = ['KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = -1;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        return `${value.toFixed(unitIndex === 0 ? 1 : 2)} ${units[unitIndex]}`;
    }

    function formatDate(dateLike) {
        if (!dateLike) {
            return DEFAULT_PLACEHOLDER;
        }
        const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
        if (Number.isNaN(date.getTime())) {
            return DEFAULT_PLACEHOLDER;
        }
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function createMetaRow(label, initialValue) {
        const title = document.createElement('dt');
        title.textContent = label;

        const value = document.createElement('dd');
        value.textContent = initialValue ?? DEFAULT_PLACEHOLDER;

        return { title, value };
    }

    function createSpinner() {
        const spinner = document.createElement('span');
        spinner.className = 'firmware-meta-card__spinner';
        spinner.setAttribute('role', 'status');
        spinner.setAttribute('aria-live', 'polite');
        spinner.textContent = 'Calculating…';
        return spinner;
    }

    function copyToClipboard(text) {
        if (!text) {
            return Promise.reject(new Error('Nothing to copy'));
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (successful) {
                    resolve();
                } else {
                    reject(new Error('Copy command rejected'));
                }
            } catch (error) {
                document.body.removeChild(textarea);
                reject(error);
            }
        });
    }

    function renderFirmwareCard(options) {
        const {
            assetUrl,
            filename,
            buildDate,
            metadataLoader
        } = options || {};

        const card = document.createElement('section');
        card.className = 'firmware-meta-card';

        const heading = document.createElement('header');
        heading.className = 'firmware-meta-card__header';

        const title = document.createElement('h4');
        title.textContent = 'Firmware details';
        heading.appendChild(title);
        card.appendChild(heading);

        const description = document.createElement('p');
        description.className = 'firmware-meta-card__subtitle';
        description.textContent = 'Metadata for the selected binary image.';
        card.appendChild(description);

        const list = document.createElement('dl');
        list.className = 'firmware-meta-card__grid';

        const parsedVersion = filename && typeof window.parseFirmwareVersionFromPath === 'function'
            ? window.parseFirmwareVersionFromPath(filename)
            : null;

        const versionRow = createMetaRow('Version', parsedVersion || DEFAULT_PLACEHOLDER);
        const dateRow = createMetaRow('Build date', formatDate(buildDate));
        const sizeRow = createMetaRow('Size', DEFAULT_PLACEHOLDER);
        const md5Row = createMetaRow('MD5', DEFAULT_PLACEHOLDER);

        md5Row.value.textContent = '';
        const spinner = createSpinner();
        md5Row.value.appendChild(spinner);

        list.appendChild(versionRow.title);
        list.appendChild(versionRow.value);
        list.appendChild(dateRow.title);
        list.appendChild(dateRow.value);
        list.appendChild(sizeRow.title);
        list.appendChild(sizeRow.value);
        list.appendChild(md5Row.title);
        list.appendChild(md5Row.value);

        card.appendChild(list);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary firmware-meta-card__copy';
        button.textContent = 'Copy .bin link';
        if (!assetUrl) {
            button.disabled = true;
            button.title = 'Firmware link is unavailable';
        }
        button.addEventListener('click', () => {
            button.disabled = true;
            copyToClipboard(assetUrl)
                .then(() => {
                    button.classList.add('is-success');
                    button.textContent = 'Link copied!';
                    setTimeout(() => {
                        button.classList.remove('is-success');
                        button.textContent = 'Copy .bin link';
                        button.disabled = false;
                    }, 2500);
                })
                .catch(() => {
                    button.classList.add('is-error');
                    button.textContent = 'Copy failed';
                    setTimeout(() => {
                        button.classList.remove('is-error');
                        button.textContent = 'Copy .bin link';
                        button.disabled = false;
                    }, 2500);
                });
        });
        card.appendChild(button);

        if (metadataLoader && typeof metadataLoader === 'function') {
            metadataLoader()
                .then((meta) => {
                    if (meta && typeof meta.sizeBytes === 'number' && !Number.isNaN(meta.sizeBytes)) {
                        sizeRow.value.textContent = formatBytes(meta.sizeBytes);
                    } else {
                        sizeRow.value.textContent = DEFAULT_PLACEHOLDER;
                    }

                    if (meta && meta.md5) {
                        md5Row.value.textContent = meta.md5;
                    } else {
                        md5Row.value.textContent = DEFAULT_PLACEHOLDER;
                    }
                })
                .catch(() => {
                    sizeRow.value.textContent = DEFAULT_PLACEHOLDER;
                    md5Row.value.textContent = DEFAULT_PLACEHOLDER;
                })
                .finally(() => {
                    if (spinner.parentNode) {
                        spinner.parentNode.removeChild(spinner);
                    }
                });
        } else {
            sizeRow.value.textContent = DEFAULT_PLACEHOLDER;
            md5Row.value.textContent = DEFAULT_PLACEHOLDER;
            if (spinner.parentNode) {
                spinner.parentNode.removeChild(spinner);
            }
        }

        return card;
    }

    window.renderFirmwareCard = renderFirmwareCard;
})();
