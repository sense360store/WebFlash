import { normalizeChannelKey } from '../utils/channel-alias.js';
import { copyTextToClipboard } from '../utils/copy-to-clipboard.js';
import {
    listPresets,
    savePreset,
    renamePreset,
    deletePreset,
    getPreset,
    markPresetApplied
} from '../remember-state.js';

(function () {
    const FIELD_MAP = [
        { key: 'mount', name: 'mounting', label: 'Mount' },
        { key: 'power', name: 'power', label: 'Power' },
        { key: 'airiq', name: 'airiq', label: 'AirIQ' },
        { key: 'presence', name: 'presence', label: 'Presence' },
        { key: 'comfort', name: 'comfort', label: 'Comfort' },
        { key: 'fan', name: 'fan', label: 'Fan' }
    ];

    const PRESET_STORAGE_OPTIONS = Object.freeze({
        defaultConfiguration: {
            mounting: null,
            power: null,
            airiq: 'none',
            presence: 'none',
            comfort: 'none',
            fan: 'none'
        },
        allowedOptions: {
            mounting: ['wall', 'ceiling'],
            power: ['usb', 'poe', 'pwr'],
            airiq: ['none', 'base', 'pro'],
            presence: ['none', 'base', 'pro'],
            comfort: ['none', 'base'],
            fan: ['none', 'pwm', 'analog']
        },
        totalSteps: 4
    });

    const subscribers = new Set();
    let pending = false;
    let sidebarRefs = null;
    let presetManagerRefs = null;
    const presetCache = new Map();
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

    function mapSummaryStateToConfiguration(state) {
        return {
            mounting: state.mount || null,
            power: state.power || null,
            airiq: state.airiq || 'none',
            presence: state.presence || 'none',
            comfort: state.comfort || 'none',
            fan: state.mount === 'wall' ? (state.fan || 'none') : 'none'
        };
    }

    function generatePresetName(state) {
        const segments = [];

        if (state.mount) {
            segments.push(state.mount === 'wall' ? 'Wall mount' : 'Ceiling mount');
        }

        if (state.power) {
            segments.push(`${state.power.toUpperCase()} power`);
        }

        const moduleSegments = [];
        if (state.airiq && state.airiq !== 'none') {
            moduleSegments.push(`AirIQ ${formatValue(state.airiq)}`);
        }
        if (state.presence && state.presence !== 'none') {
            moduleSegments.push(`Presence ${formatValue(state.presence)}`);
        }
        if (state.comfort && state.comfort !== 'none') {
            moduleSegments.push(`Comfort ${formatValue(state.comfort)}`);
        }
        if (state.fan && state.fan !== 'none') {
            moduleSegments.push(`Fan ${state.fan.toUpperCase()}`);
        }

        if (moduleSegments.length) {
            segments.push(moduleSegments.join(' + '));
        }

        if (!segments.length) {
            return `Preset ${presetCache.size + 1}`;
        }

        return segments.join(' • ');
    }

    function clampPresetStep(step) {
        const numeric = Number.parseInt(step, 10);
        if (!Number.isFinite(numeric) || numeric < 1) {
            return null;
        }

        return Math.min(PRESET_STORAGE_OPTIONS.totalSteps, numeric);
    }

    function getCurrentWizardStep() {
        const active = document.querySelector('.progress-step.active');
        if (!active) {
            return null;
        }

        const value = Number.parseInt(active.getAttribute('data-step'), 10);
        return Number.isFinite(value) ? value : null;
    }

    function setWizardStep(targetStep) {
        const normalized = clampPresetStep(targetStep);
        const current = getCurrentWizardStep();

        if (!normalized || !current || normalized === current) {
            return;
        }

        const stepFn = normalized > current ? window.nextStep : window.previousStep;
        if (typeof stepFn !== 'function') {
            return;
        }

        let safety = 0;
        let updatedCurrent = current;
        const limit = PRESET_STORAGE_OPTIONS.totalSteps * 2;

        while (updatedCurrent !== normalized && safety < limit) {
            stepFn();
            safety += 1;
            const nextValue = getCurrentWizardStep();
            if (!Number.isFinite(nextValue) || nextValue === updatedCurrent) {
                break;
            }
            updatedCurrent = nextValue;
        }
    }

    function applyRadioSelection(name, value) {
        if (value === null || value === undefined) {
            return;
        }

        const selector = `input[name="${name}"][value="${value}"]`;
        const input = document.querySelector(selector);

        if (!input) {
            return;
        }

        if (!input.checked) {
            input.checked = true;
        }

        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function applyPresetStateToWizard(presetState) {
        if (!presetState || typeof presetState !== 'object') {
            return;
        }

        const configuration = presetState.configuration || {};
        const mount = configuration.mounting || null;
        const power = configuration.power || null;
        const airiq = configuration.airiq || 'none';
        const presence = configuration.presence || 'none';
        const comfort = configuration.comfort || 'none';
        const fan = mount === 'wall' ? (configuration.fan || 'none') : 'none';

        if (mount) {
            applyRadioSelection('mounting', mount);
        }
        if (power) {
            applyRadioSelection('power', power);
        }

        applyRadioSelection('airiq', airiq);
        applyRadioSelection('presence', presence);
        applyRadioSelection('comfort', comfort);
        applyRadioSelection('fan', fan);

        if (presetState.currentStep) {
            setWizardStep(presetState.currentStep);
        }
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
        updatePresetSaveState(state);
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

    function ensurePresetManagerRefs() {
        if (presetManagerRefs && document.body.contains(presetManagerRefs.root)) {
            return presetManagerRefs;
        }

        const root = document.getElementById('preset-manager');
        if (!root) {
            presetManagerRefs = null;
            return null;
        }

        const list = root.querySelector('[data-preset-list]');
        const empty = root.querySelector('[data-preset-empty]');
        const form = root.querySelector('[data-preset-form]');
        const nameInput = root.querySelector('[data-preset-name]');
        const saveButton = root.querySelector('[data-preset-save]');

        if (!list || !empty || !form || !nameInput || !saveButton) {
            presetManagerRefs = null;
            return null;
        }

        presetManagerRefs = { root, list, empty, form, nameInput, saveButton };
        bindPresetManager(presetManagerRefs);
        return presetManagerRefs;
    }

    function bindPresetManager(refs) {
        const { list, form, nameInput } = refs;

        if (form.dataset.presetBound !== 'true') {
            form.addEventListener('submit', handlePresetSave);
            form.dataset.presetBound = 'true';
        }

        if (nameInput.dataset.presetBound !== 'true') {
            nameInput.addEventListener('input', () => updatePresetSaveState(getState()));
            nameInput.dataset.presetBound = 'true';
        }

        if (list.dataset.presetBound !== 'true') {
            list.addEventListener('click', handlePresetListClick);
            list.dataset.presetBound = 'true';
        }
    }

    function updatePresetEmptyState(presets) {
        const refs = ensurePresetManagerRefs();
        if (!refs) {
            return;
        }

        refs.empty.hidden = presets.length > 0;
        refs.list.hidden = presets.length === 0;
    }

    function renderPresetList() {
        const refs = ensurePresetManagerRefs();
        if (!refs) {
            return;
        }

        const presets = listPresets(PRESET_STORAGE_OPTIONS);
        presetCache.clear();

        while (refs.list.firstChild) {
            refs.list.removeChild(refs.list.firstChild);
        }

        const fragment = document.createDocumentFragment();

        presets.forEach(preset => {
            presetCache.set(preset.id, preset);

            const item = document.createElement('li');
            item.className = 'preset-panel__item';
            item.dataset.presetId = preset.id;

            const name = document.createElement('span');
            name.className = 'preset-panel__item-name';
            name.textContent = preset.name;
            item.appendChild(name);

            const actions = document.createElement('div');
            actions.className = 'preset-panel__actions';

            const applyButton = document.createElement('button');
            applyButton.type = 'button';
            applyButton.className = 'preset-panel__action-button';
            applyButton.dataset.presetAction = 'apply';
            applyButton.textContent = 'Apply';
            actions.appendChild(applyButton);

            const renameButton = document.createElement('button');
            renameButton.type = 'button';
            renameButton.className = 'preset-panel__action-button';
            renameButton.dataset.presetAction = 'rename';
            renameButton.textContent = 'Rename';
            actions.appendChild(renameButton);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'preset-panel__action-button';
            deleteButton.dataset.presetAction = 'delete';
            deleteButton.textContent = 'Delete';
            actions.appendChild(deleteButton);

            item.appendChild(actions);
            fragment.appendChild(item);
        });

        refs.list.appendChild(fragment);
        updatePresetEmptyState(presets);
    }

    function updatePresetSaveState(state) {
        const refs = ensurePresetManagerRefs();
        if (!refs) {
            return;
        }

        const hasMount = Boolean(state.mount);
        const hasPower = Boolean(state.power);
        refs.saveButton.disabled = !(hasMount && hasPower);
    }

    function handlePresetSave(event) {
        event.preventDefault();

        const refs = ensurePresetManagerRefs();
        if (!refs) {
            return;
        }

        const state = getState();
        if (!state.mount || !state.power) {
            return;
        }

        const configuration = mapSummaryStateToConfiguration(state);
        const rawName = refs.nameInput.value;
        const trimmedName = typeof rawName === 'string' ? rawName.trim() : '';
        const presetName = trimmedName || generatePresetName(state);
        const currentStep = getCurrentWizardStep();

        const saved = savePreset(presetName, configuration, {
            ...PRESET_STORAGE_OPTIONS,
            currentStep
        });

        if (saved) {
            markPresetApplied(saved.id, PRESET_STORAGE_OPTIONS);
        }

        refs.nameInput.value = '';
        renderPresetList();
        updatePresetSaveState(state);
        refs.nameInput.focus();
    }

    function handlePresetListClick(event) {
        const actionElement = event.target.closest('[data-preset-action]');
        if (!actionElement) {
            return;
        }

        const item = actionElement.closest('[data-preset-id]');
        if (!item) {
            return;
        }

        event.preventDefault();

        const presetId = item.dataset.presetId;
        const action = actionElement.dataset.presetAction;

        if (!presetId || !action) {
            return;
        }

        if (action === 'apply') {
            applyPresetById(presetId);
        } else if (action === 'rename') {
            handlePresetRename(presetId);
        } else if (action === 'delete') {
            handlePresetDelete(presetId);
        }
    }

    function applyPresetById(presetId) {
        const preset = presetCache.get(presetId) || getPreset(presetId, PRESET_STORAGE_OPTIONS);
        if (!preset) {
            return;
        }

        applyPresetStateToWizard(preset.state);
        markPresetApplied(preset.id, PRESET_STORAGE_OPTIONS);
        renderPresetList();
    }

    function handlePresetRename(presetId) {
        const preset = presetCache.get(presetId) || getPreset(presetId, PRESET_STORAGE_OPTIONS);
        if (!preset) {
            return;
        }

        const result = window.prompt('Rename preset', preset.name);
        if (result === null) {
            return;
        }

        const trimmed = result.trim();
        if (!trimmed) {
            return;
        }

        renamePreset(presetId, trimmed, PRESET_STORAGE_OPTIONS);
        renderPresetList();
    }

    function handlePresetDelete(presetId) {
        const preset = presetCache.get(presetId) || getPreset(presetId, PRESET_STORAGE_OPTIONS);
        if (!preset) {
            return;
        }

        const confirmed = window.confirm(`Delete preset "${preset.name}"?`);
        if (!confirmed) {
            return;
        }

        deletePreset(presetId);
        renderPresetList();
    }

    function initializePresetManager() {
        const refs = ensurePresetManagerRefs();
        if (!refs) {
            return;
        }

        renderPresetList();
        updatePresetSaveState(getState());
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
            await copyTextToClipboard(url);
            showCopyFeedback(copyButton, 'Copied');
        } catch (error) {
            console.error('[state-summary] Failed to copy link', error);
            showCopyFeedback(copyButton, 'Copy failed');
        }
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

            const presetApi = window.queryPresets || null;
            if (presetApi && typeof presetApi.getMatchingPreset === 'function') {
                try {
                    const preset = presetApi.getMatchingPreset(state);
                    if (preset && preset.name) {
                        params.set('preset', preset.name);
                    }
                } catch (error) {
                    console.warn('[state-summary] unable to resolve preset', error);
                }
            }
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
            markPresetApplied(null, PRESET_STORAGE_OPTIONS);
        } catch (error) {
            console.warn('[state-summary] Unable to reset presets', error);
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

    function handleDomReady() {
        initializePresetManager();
        scheduleScan();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleDomReady);
    } else {
        handleDomReady();
    }
})();
