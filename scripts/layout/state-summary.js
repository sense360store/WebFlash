import { normalizeChannelKey } from '../utils/channel-alias.js';

(function () {
    const FIELD_MAP = [
        { key: 'mount', name: 'mounting', label: 'Mount' },
        { key: 'power', name: 'power', label: 'Power' },
        { key: 'airiq', name: 'airiq', label: 'AirIQ' },
        { key: 'presence', name: 'presence', label: 'Presence' },
        { key: 'comfort', name: 'comfort', label: 'Comfort' },
        { key: 'fan', name: 'fan', label: 'Fan' }
    ];

    const subscribers = new Set();
    let pending = false;
    let sidebarRefs = null;
    let copyResetTimer = null;

    function normaliseChannelKey(channel) {
        return normalizeChannelKey(channel, { allowNull: true });
    }

    function readFieldMeta(field) {
        const { name } = field;
        let input = document.querySelector(`input[name="${name}"]:checked`);

        if (!input) {
            input = document.querySelector(`[data-selected="true"][name="${name}"]`);
        }

        let value = input ? input.value ?? input.getAttribute('value') : null;
        if (value === '') {
            value = null;
        }

        let display = null;
        if (input) {
            const labelledBy = input.getAttribute('aria-labelledby');
            if (labelledBy) {
                const labelElement = document.getElementById(labelledBy);
                if (labelElement && labelElement.textContent) {
                    display = labelElement.textContent.trim();
                }
            }

            if (!display) {
                const card = input.closest('.option-card');
                if (card) {
                    const title = card.querySelector('.option-title');
                    if (title && title.textContent) {
                        display = title.textContent.trim();
                    } else {
                        const labelText = card.textContent;
                        if (labelText) {
                            display = labelText.trim();
                        }
                    }
                }
            }

            if (!display) {
                const explicit = input.getAttribute('data-label') || input.getAttribute('aria-label');
                if (explicit) {
                    display = explicit.trim();
                }
            }
        }

        if (!display) {
            display = formatValue(value);
        }

        return { value, display };
    }

    function formatValue(value) {
        if (!value) {
            return 'Not selected';
        }

        if (value.toLowerCase() === 'none') {
            return 'None';
        }

        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function captureStateMeta() {
        const meta = {};
        FIELD_MAP.forEach(field => {
            meta[field.key] = readFieldMeta(field);
        });
        return meta;
    }

    function getState() {
        const meta = captureStateMeta();
        const state = {};
        FIELD_MAP.forEach(field => {
            state[field.key] = meta[field.key].value || null;
        });
        return state;
    }

    function onStateChange(callback) {
        if (typeof callback !== 'function') {
            return () => {};
        }

        subscribers.add(callback);
        try {
            callback(getState());
        } catch (error) {
            console.error('[state-summary] subscriber failed during initial call', error);
        }

        return () => {
            subscribers.delete(callback);
        };
    }

    function notifySubscribers() {
        pending = false;
        const meta = captureStateMeta();
        const state = {};
        FIELD_MAP.forEach(field => {
            state[field.key] = meta[field.key].value || null;
        });

        subscribers.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                console.error('[state-summary] subscriber failed', error);
            }
        });

        renderSidebar(meta, state);
    }

    function scheduleScan() {
        if (pending) {
            return;
        }

        pending = true;
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(notifySubscribers);
        } else {
            setTimeout(notifySubscribers, 0);
        }
    }

    function ensureSidebarRefs() {
        const card = document.getElementById('sb-config');
        const list = document.getElementById('sb-config-list');
        const copyButton = document.getElementById('sb-copy-link');
        const resetButton = document.getElementById('sb-reset');

        if (!card || !list || !copyButton || !resetButton) {
            sidebarRefs = null;
            return null;
        }

        if (!sidebarRefs || sidebarRefs.card !== card) {
            let warning = card.querySelector('[data-sidebar-warning]');
            if (!warning) {
                warning = document.createElement('p');
                warning.className = 'sidebar-warning';
                warning.dataset.sidebarWarning = 'true';
                warning.hidden = true;
                const actions = card.querySelector('.sidebar-actions');
                if (actions) {
                    actions.before(warning);
                } else {
                    list.after(warning);
                }
            }

            if (!list.hasAttribute('aria-live')) {
                list.setAttribute('aria-live', 'polite');
            }

            sidebarRefs = {
                card,
                list,
                warning,
                copyButton,
                resetButton
            };

            bindSidebarButtons(sidebarRefs);
        }

        return sidebarRefs;
    }

    function bindSidebarButtons(refs) {
        const { copyButton, resetButton } = refs;

        if (copyButton && copyButton.dataset.bound !== 'true') {
            copyButton.dataset.bound = 'true';
            copyButton.dataset.defaultLabel = copyButton.textContent || 'Copy sharable link';
            copyButton.addEventListener('click', handleCopyLink);
        }

        if (resetButton && resetButton.dataset.bound !== 'true') {
            resetButton.dataset.bound = 'true';
            resetButton.addEventListener('click', handleReset);
        }
    }

    function renderSidebar(meta, state) {
        const refs = ensureSidebarRefs();
        if (!refs) {
            return;
        }

        const { list, warning } = refs;
        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }

        const fragment = document.createDocumentFragment();
        FIELD_MAP.forEach(field => {
            const item = document.createElement('li');
            const label = document.createElement('strong');
            label.textContent = field.label;
            item.appendChild(label);
            item.appendChild(document.createTextNode(`: ${meta[field.key].display}`));
            fragment.appendChild(item);
        });

        list.appendChild(fragment);

        if (state.mount === 'ceiling' && state.fan && state.fan !== 'none') {
            warning.textContent = 'Fan Module is not available on Ceiling mounts.';
            warning.hidden = false;
        } else {
            warning.hidden = true;
        }
    }

    async function handleCopyLink(event) {
        event.preventDefault();
        const refs = ensureSidebarRefs();
        if (!refs) {
            return;
        }

        const { copyButton } = refs;
        const state = getState();
        const url = buildShareableUrl(state);

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                fallbackCopy(url);
            }
            showCopyFeedback(copyButton, 'Copied');
        } catch (error) {
            console.error('[state-summary] Failed to copy link', error);
            showCopyFeedback(copyButton, 'Copy failed');
        }
    }

    function fallbackCopy(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', 'true');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
    }

    function showCopyFeedback(button, message) {
        if (!button) {
            return;
        }

        const defaultLabel = button.dataset.defaultLabel || 'Copy sharable link';
        button.textContent = message;

        if (copyResetTimer) {
            clearTimeout(copyResetTimer);
        }

        copyResetTimer = setTimeout(() => {
            button.textContent = defaultLabel;
        }, 1200);
    }

    /**
     * Builds a shareable URL containing the current wizard selections.
     * The optional `channel` query parameter targets a specific firmware channel
     * so support can generate links that open directly to the desired release.
     */
    function buildShareableUrl(state) {
        const params = new URLSearchParams();
        const currentFirmware = window.currentFirmware || null;
        const firmwareConfig = (currentFirmware?.config_string || '').toString().trim();
        const firmwareModel = (currentFirmware?.model || '').toString().trim();
        const firmwareVariant = (currentFirmware?.variant || '').toString().trim();
        const firmwareSensorAddon = (currentFirmware?.sensor_addon || '').toString().trim();
        const useModelLookup = !firmwareConfig && firmwareModel && firmwareVariant;

        if (useModelLookup) {
            params.set('model', firmwareModel);
            params.set('variant', firmwareVariant);
            if (firmwareSensorAddon) {
                params.set('sensor_addon', firmwareSensorAddon);
            }
        } else {
            if (state.mount) {
                params.set('mount', state.mount);
            }
            if (state.power) {
                params.set('power', state.power);
            }

            params.set('airiq', state.airiq || 'none');
            params.set('presence', state.presence || 'none');
            params.set('comfort', state.comfort || 'none');
            params.set('fan', state.fan || 'none');
        }

        if (currentFirmware && currentFirmware.channel) {
            const channel = normaliseChannelKey(currentFirmware.channel);
            if (channel) {
                params.set('channel', channel);
            }
        }

        const base = `${window.location.origin}${window.location.pathname}`;
        const query = params.toString();
        return query ? `${base}?${query}` : base;
    }

    function handleReset(event) {
        event.preventDefault();
        try {
            const rememberApi = window.wizardRememberState;
            if (rememberApi && typeof rememberApi.clear === 'function') {
                rememberApi.clear();
            } else {
                const storage = window.localStorage;
                if (storage) {
                    storage.removeItem('sense360.lastWizardState');
                    storage.removeItem('lastWizardState');
                }
            }
        } catch (error) {
            console.warn('[state-summary] Unable to clear remembered state', error);
        }

        const base = `${window.location.origin}${window.location.pathname}`;
        window.location.href = base;
    }

    document.addEventListener('change', scheduleScan, true);
    document.addEventListener('click', scheduleScan, true);

    document.addEventListener('wizardSidebarReady', () => {
        sidebarRefs = null;
        scheduleScan();
    });

    const api = {
        getState,
        onStateChange,
        buildShareableUrl
    };

    Object.defineProperty(window, 'wizardStateSummary', {
        value: api,
        writable: false,
        configurable: false
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleScan);
    } else {
        scheduleScan();
    }
})();
