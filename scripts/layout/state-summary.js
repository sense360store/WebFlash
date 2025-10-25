import { normalizeChannelKey } from '../utils/channel-alias.js';
import { copyTextToClipboard } from '../utils/copy-to-clipboard.js';
import { getModuleVariantEntry } from '../data/module-requirements.js';

(function () {
    const FIELD_MAP = [
        { key: 'mount', name: 'mounting', label: 'Mount' },
        { key: 'power', name: 'power', label: 'Power' },
        { key: 'airiq', name: 'airiq', label: 'AirIQ' },
        { key: 'presence', name: 'presence', label: 'Presence' },
        { key: 'comfort', name: 'comfort', label: 'Comfort' },
        { key: 'fan', name: 'fan', label: 'Fan' }
    ];
    const MODULE_VARIANT_KEYS = ['airiq', 'presence', 'comfort', 'fan'];
    const CORE_REVISION_PATTERN = /rev\s*([a-z])/i;
    const subscribers = new Set();
    const MOBILE_SUMMARY_BREAKPOINT = '(max-width: 720px)';
    let pending = false;
    let sidebarRefs = null;
    let moduleSummaryRefs = new Map();

    // Prevent ReferenceError on first load if mobile summary UI isn't present yet
    function createEmptyMobileSummaryRefs() {
        return {
            container: null,
            toggle: null,
            drawer: null,
            closeButton: null,
            label: null,
            summaryRefs: null
        };
    }

    let mobileSummaryRefs = createEmptyMobileSummaryRefs();
    let mobileSummaryMediaQuery = null;
    let presetManagerRefs = null;
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

    function getCoreRevisionRank(label) {
        if (!label) {
            return 0;
        }

        const match = CORE_REVISION_PATTERN.exec(label);
        if (!match) {
            return 0;
        }

        const letter = match[1].toLowerCase();
        if (!letter || letter.length !== 1) {
            return 0;
        }

        const code = letter.charCodeAt(0);
        if (code < 97 || code > 122) {
            return 0;
        }

        return code - 96;
    }

    function isStrictCoreRevision(label) {
        if (!label) {
            return false;
        }

        return !/or\s+newer/i.test(label);
    }

    function computeHardwareRequirements(state) {
        const requirements = {
            coreRevision: null,
            headers: []
        };

        let bestRank = 0;
        let bestLabel = null;
        let bestStrict = false;
        const headerSet = new Set();

        MODULE_VARIANT_KEYS.forEach(moduleKey => {
            const variantKey = state[moduleKey];
            if (!variantKey || variantKey === 'none') {
                return;
            }

            const entry = getModuleVariantEntry(moduleKey, variantKey);
            if (!entry) {
                return;
            }

            const label = entry.coreRevision || null;
            if (label) {
                const candidateRank = getCoreRevisionRank(label);
                const candidateStrict = isStrictCoreRevision(label);

                if (!bestLabel) {
                    bestLabel = label;
                    bestRank = candidateRank;
                    bestStrict = candidateStrict;
                } else if (candidateRank > bestRank) {
                    bestLabel = label;
                    bestRank = candidateRank;
                    bestStrict = candidateStrict;
                } else if (candidateRank === bestRank) {
                    if (candidateStrict && !bestStrict) {
                        bestLabel = label;
                        bestStrict = true;
                    } else if (candidateStrict === bestStrict && label.length < bestLabel.length) {
                        bestLabel = label;
                    }
                }
            }

            const headers = Array.isArray(entry.headers) ? entry.headers : [];
            headers.forEach(header => {
                const normalized = typeof header === 'string' ? header.trim() : '';
                if (!normalized || headerSet.has(normalized)) {
                    return;
                }

                headerSet.add(normalized);
                requirements.headers.push(normalized);
            });
        });

        requirements.coreRevision = bestLabel;
        return requirements;
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

            const hardwareRoot = card.querySelector('[data-hardware-summary]');
            const hardwareEmpty = card.querySelector('[data-hardware-summary-empty]');
            const hardwareCore = card.querySelector('[data-hardware-summary-core]');
            const hardwareHeaders = card.querySelector('[data-hardware-summary-headers]');

            sidebarRefs = {
                card,
                list,
                warning,
                hardwareRoot,
                hardwareEmpty,
                hardwareCore,
                hardwareHeaders,
                copyButton,
                resetButton
            };

            bindSummaryButtons(sidebarRefs);
        }

        return sidebarRefs;
    }

    function bindSummaryButtons(refs) {
        const { copyButton, resetButton } = refs;

        if (copyButton && copyButton.dataset.bound !== 'true') {
            copyButton.dataset.bound = 'true';
            if (!copyButton.dataset.defaultLabel) {
                copyButton.dataset.defaultLabel = copyButton.textContent || 'Copy sharable link';
            }
            copyButton.addEventListener('click', handleCopyLink);
        }

        if (resetButton && resetButton.dataset.bound !== 'true') {
            resetButton.dataset.bound = 'true';
            resetButton.addEventListener('click', handleReset);
        }
    }

    function ensureModuleSummaryRefs() {
        const body = document.body;
        if (!body) {
            return [];
        }

        if (!moduleSummaryRefs || typeof moduleSummaryRefs.clear !== 'function') {
            moduleSummaryRefs = new Map();
        }

        const nodes = Array.from(document.querySelectorAll('[data-module-summary]')).filter(node => body.contains(node));

        if (!nodes.length) {
            if (moduleSummaryRefs) {
                moduleSummaryRefs.clear();
            }
            return [];
        }

        const active = [];

        nodes.forEach(root => {
            let refs = moduleSummaryRefs.get(root);
            if (!refs) {
                const list = root.querySelector('[data-module-summary-list]');
                const warning = root.querySelector('[data-module-summary-warning]');
                const copyButton = root.querySelector('[data-module-summary-copy]');
                const resetButton = root.querySelector('[data-module-summary-reset]');
                const firmwareRoot = root.querySelector('[data-module-summary-firmware]');
                const firmwareEmpty = root.querySelector('[data-module-summary-firmware-empty]');
                const firmwareMeta = root.querySelector('[data-module-summary-firmware-meta]');
                const firmwareName = root.querySelector('[data-module-summary-firmware-name]');
                const firmwareSize = root.querySelector('[data-module-summary-firmware-size]');
                const installButton = root.querySelector('[data-module-summary-install]');

                if (list && !list.hasAttribute('aria-live')) {
                    list.setAttribute('aria-live', 'polite');
                }

                refs = {
                    root,
                    list,
                    warning,
                    copyButton,
                    resetButton,
                    firmwareRoot,
                    firmwareEmpty,
                    firmwareMeta,
                    firmwareName,
                    firmwareSize,
                    installButton,
                    variant: root.dataset.moduleSummaryVariant || 'module'
                };

                moduleSummaryRefs.set(root, refs);
            } else {
                refs.variant = root.dataset.moduleSummaryVariant || 'module';
            }

            bindSummaryButtons(refs);
            active.push(refs);
        });

        Array.from(moduleSummaryRefs.keys()).forEach(root => {
            if (!nodes.includes(root)) {
                moduleSummaryRefs.delete(root);
            }
        });

        return active;
    }

    function ensureMobileSummaryRefs() {
        const body = document.body;
        const container = document.querySelector('[data-mobile-summary]');
        const toggle = container ? container.querySelector('[data-mobile-summary-toggle]') : null;
        const drawer = container ? container.querySelector('[data-mobile-summary-drawer]') : null;
        const closeButton = container ? container.querySelector('[data-mobile-summary-close]') : null;
        const label = container ? container.querySelector('[data-mobile-summary-label]') : null;
        const root = container ? container.querySelector('[data-module-summary]') : null;

        if (!container || !body || !body.contains(container)) {
            if (mobileSummaryRefs && body) {
                body.classList.remove('is-mobile-summary-open');
            }
            mobileSummaryRefs = createEmptyMobileSummaryRefs();
            return null;
        }

        if (root) {
            ensureModuleSummaryRefs();
        }
        const toggle = container.querySelector('[data-mobile-summary-toggle]');
        const drawer = container.querySelector('[data-mobile-summary-drawer]');
        const closeButton = container.querySelector('[data-mobile-summary-close]');
        const label = container.querySelector('[data-mobile-summary-label]');

        if (!drawer) {
            body.classList.remove('is-mobile-summary-open');
            mobileSummaryRefs = createEmptyMobileSummaryRefs();
            return null;
        }

        if (!mobileSummaryRefs || mobileSummaryRefs.container !== container) {
            mobileSummaryRefs = {
                ...createEmptyMobileSummaryRefs(),
                container,
                toggle: toggle || null,
                drawer,
                closeButton,
                label,
                summaryRefs: root && moduleSummaryRefs ? moduleSummaryRefs.get(root) || null : null
                closeButton: closeButton || null,
                label: label || null
            };

            bindMobileSummaryControls(mobileSummaryRefs);
            updateMobileSummaryLabel(mobileSummaryRefs, false);
            setMobileSummaryOpen(false, mobileSummaryRefs);
        } else {
            mobileSummaryRefs.toggle = toggle || mobileSummaryRefs.toggle || null;
            mobileSummaryRefs.drawer = drawer || mobileSummaryRefs.drawer || null;
            mobileSummaryRefs.drawer = drawer;
            mobileSummaryRefs.closeButton = closeButton || mobileSummaryRefs.closeButton || null;
            mobileSummaryRefs.label = label || mobileSummaryRefs.label || null;
            mobileSummaryRefs.summaryRefs = root && moduleSummaryRefs ? moduleSummaryRefs.get(root) || null : mobileSummaryRefs.summaryRefs || null;
        }

        return mobileSummaryRefs;
    }

    function bindMobileSummaryControls(refs) {
        if (!refs) {
            return;
        }

        const { toggle, closeButton, drawer } = refs;

        if (toggle && toggle.dataset.mobileSummaryBound !== 'true') {
            toggle.addEventListener('click', handleMobileSummaryToggle);
            toggle.dataset.mobileSummaryBound = 'true';
        }

        if (closeButton && closeButton.dataset.mobileSummaryBound !== 'true') {
            closeButton.addEventListener('click', handleMobileSummaryClose);
            closeButton.dataset.mobileSummaryBound = 'true';
        }

        if (drawer && drawer.dataset.mobileSummaryBound !== 'true') {
            drawer.addEventListener('keydown', handleMobileSummaryKeydown);
            drawer.dataset.mobileSummaryBound = 'true';
        }
    }

    function updateMobileSummaryLabel(refs, open) {
        if (!refs || !refs.label) {
            return;
        }

        const openLabel = refs.label.getAttribute('data-open-label') || 'Hide summary';
        const closedLabel = refs.label.getAttribute('data-closed-label') || 'View summary';
        refs.label.textContent = open ? openLabel : closedLabel;
    }

    function setMobileSummaryOpen(open, refs = ensureMobileSummaryRefs()) {
        if (!refs) {
            return;
        }

        const { container, toggle, drawer } = refs;

        if (toggle) {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        if (drawer) {
            drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
            drawer.dataset.open = open ? 'true' : 'false';
        }

        updateMobileSummaryLabel(refs, open);

        if (container) {
            container.classList.toggle('is-open', Boolean(open));
        }

        const body = document.body;
        if (body) {
            if (open) {
                body.classList.add('is-mobile-summary-open');
            } else {
                body.classList.remove('is-mobile-summary-open');
            }
        }
    }

    function isMobileSummaryOpen(refs = ensureMobileSummaryRefs()) {
        return Boolean(refs?.container?.classList.contains('is-open'));
    }

    function handleMobileSummaryToggle(event) {
        event.preventDefault();
        const refs = ensureMobileSummaryRefs();
        if (!refs) {
            return;
        }

        const nextState = !isMobileSummaryOpen(refs);
        setMobileSummaryOpen(nextState, refs);

        if (nextState) {
            requestAnimationFrame(() => {
                if (refs.drawer) {
                    refs.drawer.focus();
                }
            });
        }
    }

    function handleMobileSummaryClose(event) {
        event.preventDefault();
        const refs = ensureMobileSummaryRefs();
        if (!refs) {
            return;
        }

        if (!isMobileSummaryOpen(refs)) {
            return;
        }

        setMobileSummaryOpen(false, refs);
        if (refs.toggle) {
            refs.toggle.focus();
        }
    }

    function handleMobileSummaryKeydown(event) {
        if (event.key !== 'Escape' && event.key !== 'Esc') {
            return;
        }

        const refs = ensureMobileSummaryRefs();
        if (!refs) {
            return;
        }

        if (!isMobileSummaryOpen(refs)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        setMobileSummaryOpen(false, refs);
        if (refs.toggle) {
            refs.toggle.focus();
        }
    }

    function handleMobileSummaryMediaChange(event) {
        if (!event || event.matches) {
            return;
        }

        setMobileSummaryOpen(false);
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

    function renderSummaryList(list, meta, variant = 'sidebar') {
        if (!list) {
            return;
        }

        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }

        FIELD_MAP.forEach(field => {
            if (variant === 'module') {
                const item = document.createElement('div');
                item.className = 'module-summary-card__item';
                item.setAttribute('role', 'listitem');

                const label = document.createElement('span');
                label.className = 'module-summary-card__item-label';
                label.textContent = field.label;

                const value = document.createElement('span');
                value.className = 'module-summary-card__item-value';
                value.textContent = meta[field.key].display;

                item.appendChild(label);
                item.appendChild(value);
                list.appendChild(item);
            } else {
                const item = document.createElement('li');
                const label = document.createElement('strong');
                label.textContent = field.label;
                item.appendChild(label);
                item.appendChild(document.createTextNode(`: ${meta[field.key].display}`));
                list.appendChild(item);
            }
        });
    }

    function renderHardwareSummary(refs, requirements) {
        if (!refs) {
            return;
        }

        const { hardwareRoot, hardwareEmpty, hardwareCore, hardwareHeaders } = refs;
        if (!hardwareRoot) {
            return;
        }

        const coreRevision = requirements?.coreRevision || null;
        const headers = Array.isArray(requirements?.headers) ? requirements.headers : [];
        const hasCore = Boolean(coreRevision);
        const hasHeaders = headers.length > 0;
        const hasContent = hasCore || hasHeaders;

        if (hardwareEmpty) {
            hardwareEmpty.hidden = hasContent;
        }

        if (hardwareCore) {
            if (hasCore) {
                hardwareCore.textContent = coreRevision;
                hardwareCore.hidden = false;
            } else {
                hardwareCore.textContent = '';
                hardwareCore.hidden = true;
            }
        }

        if (hardwareHeaders) {
            while (hardwareHeaders.firstChild) {
                hardwareHeaders.removeChild(hardwareHeaders.firstChild);
            }

            if (hasHeaders) {
                const fragment = document.createDocumentFragment();
                headers.forEach(header => {
                    const item = document.createElement('li');
                    item.textContent = header;
                    fragment.appendChild(item);
                });
                hardwareHeaders.appendChild(fragment);
                hardwareHeaders.hidden = false;
            } else {
                hardwareHeaders.hidden = true;
            }
        }

        if (hardwareRoot) {
            hardwareRoot.dataset.hardwareState = hasContent ? 'ready' : 'empty';
        }
    }

    function formatFirmwareName(firmware) {
        if (!firmware) {
            return '';
        }

        const versionSegment = firmware.version ? `-v${firmware.version}` : '';
        const channelSegment = firmware.channel ? `-${firmware.channel}` : '';
        const configString = (firmware.config_string || '').toString().trim();

        if (configString) {
            return `Sense360-${configString}${versionSegment}${channelSegment}.bin`;
        }

        const model = (firmware.model || 'Sense360').toString().trim() || 'Sense360';
        const variant = (firmware.variant || '').toString().trim();
        const sensorAddon = (firmware.sensor_addon || '').toString().trim();
        const variantSegment = variant ? `-${variant}` : '';
        const sensorSegment = sensorAddon ? `-${sensorAddon}` : '';

        return `${model}${variantSegment}${sensorSegment}${versionSegment}${channelSegment}.bin`;
    }

    function formatFirmwareSize(firmware) {
        const raw = Number(firmware?.file_size);
        if (!Number.isFinite(raw) || raw <= 0) {
            return '';
        }

        if (raw >= 1024 * 1024) {
            return `${(raw / (1024 * 1024)).toFixed(2)} MB`;
        }

        return `${(raw / 1024).toFixed(1)} KB`;
    }

    function renderFirmwareSummary(refs) {
        if (!refs || !refs.firmwareRoot) {
            return;
        }

        const { firmwareEmpty, firmwareMeta, firmwareName, firmwareSize } = refs;
        const firmware = window.currentFirmware || null;

        if (!firmware || !firmwareName) {
            if (firmwareEmpty) {
                firmwareEmpty.hidden = false;
            }
            if (firmwareMeta) {
                firmwareMeta.hidden = true;
            }
            if (firmwareName) {
                firmwareName.textContent = '';
            }
            if (firmwareSize) {
                firmwareSize.textContent = '';
            }
            return;
        }

        if (firmwareEmpty) {
            firmwareEmpty.hidden = true;
        }
        if (firmwareMeta) {
            firmwareMeta.hidden = false;
        }

        const displayName = formatFirmwareName(firmware);
        const sizeLabel = formatFirmwareSize(firmware);

        if (firmwareName) {
            firmwareName.textContent = displayName;
        }

        if (firmwareSize) {
            firmwareSize.textContent = sizeLabel ? `Size: ${sizeLabel}` : '';
        }
    }

    function renderSidebar(meta, state) {
        const sidebar = ensureSidebarRefs();
        const summaries = ensureModuleSummaryRefs();
        ensureMobileSummaryRefs();
        const targets = [];

        if (sidebar) {
            targets.push({ refs: sidebar, variant: 'sidebar' });
        }
        summaries.forEach(refs => {
            targets.push({ refs, variant: refs.variant || 'module' });
        });

        if (!targets.length) {
            return;
        }

        const hardwareRequirements = computeHardwareRequirements(state);

        targets.forEach(({ refs, variant }) => {
            const { list, warning } = refs;
            renderSummaryList(list, meta, variant);

            if (warning) {
                if (state.mount === 'ceiling' && state.fan && state.fan !== 'none') {
                    warning.textContent = 'Fan Module is not available on Ceiling mounts.';
                    warning.hidden = false;
                } else {
                    warning.hidden = true;
                }
            }

            renderHardwareSummary(refs, hardwareRequirements);
            renderFirmwareSummary(refs);
        });
    }

    async function handleCopyLink(event) {
        event.preventDefault();
        const button = event.currentTarget;
        if (!button) {
            return;
        }

        const state = getState();
        const url = buildShareableUrl(state);

        try {
            await copyTextToClipboard(url);
            showCopyFeedback(button, 'Copied');
        } catch (error) {
            console.error('[state-summary] Failed to copy link', error);
            showCopyFeedback(button, 'Copy failed');
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
        const base = `${window.location.origin}${window.location.pathname}`;
        window.location.href = base;
    }

    document.addEventListener('change', scheduleScan, true);
    document.addEventListener('click', scheduleScan, true);

    document.addEventListener('wizardSidebarReady', () => {
        sidebarRefs = null;
        if (moduleSummaryRefs) {
            moduleSummaryRefs.clear();
        }
        if (mobileSummaryRefs) {
            setMobileSummaryOpen(false, mobileSummaryRefs);
        }
        mobileSummaryRefs = createEmptyMobileSummaryRefs();
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
        if (typeof window.matchMedia === 'function') {
            mobileSummaryMediaQuery = window.matchMedia(MOBILE_SUMMARY_BREAKPOINT);
            if (mobileSummaryMediaQuery) {
                if (typeof mobileSummaryMediaQuery.addEventListener === 'function') {
                    mobileSummaryMediaQuery.addEventListener('change', handleMobileSummaryMediaChange);
                } else if (typeof mobileSummaryMediaQuery.addListener === 'function') {
                    mobileSummaryMediaQuery.addListener(handleMobileSummaryMediaChange);
                }
            }
        }

        ensureMobileSummaryRefs();
        if (mobileSummaryMediaQuery) {
            handleMobileSummaryMediaChange(mobileSummaryMediaQuery);
        }
        scheduleScan();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleDomReady);
    } else {
        handleDomReady();
    }
})();
