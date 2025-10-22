import {
    isRememberEnabled,
    setRememberEnabled,
    loadRememberedState,
    persistRememberedState
} from './remember-state.js';
import { escapeHtml } from './utils/escape-html.js';
import { normalizeChannelKey } from './utils/channel-alias.js';
import { generateEsphomeYaml } from './utils/esphome-yaml.js';

let currentStep = 1;
const totalSteps = 4;
const defaultConfiguration = {
    mounting: null,
    power: null,
    airiq: 'none',
    presence: 'none',
    comfort: 'none',
    fan: 'none'
};
const configuration = { ...defaultConfiguration };
const allowedOptions = {
    mounting: ['wall', 'ceiling'],
    power: ['usb', 'poe', 'pwr'],
    airiq: ['none', 'base', 'pro'],
    presence: ['none', 'base', 'pro'],
    comfort: ['none', 'base'],
    fan: ['none', 'pwm', 'analog']
};

const MODULE_KEYS = ['airiq', 'presence', 'comfort', 'fan'];
const MODULE_LABELS = {
    airiq: 'AirIQ',
    presence: 'Presence',
    comfort: 'Comfort',
    fan: 'Fan'
};

const MODULE_SEGMENT_FORMATTERS = {
    airiq: value => `AirIQ${value.charAt(0).toUpperCase() + value.slice(1)}`,
    presence: value => `Presence${value === 'base' ? '' : value.charAt(0).toUpperCase() + value.slice(1)}`,
    comfort: value => `Comfort${value === 'base' ? '' : value.charAt(0).toUpperCase() + value.slice(1)}`,
    fan: value => `Fan${value.toUpperCase()}`
};

function formatConfigSegment(moduleKey, moduleValue) {
    const key = (moduleKey || '').toString().trim().toLowerCase();
    const value = (moduleValue || '').toString().trim().toLowerCase();

    if (!key || !value || value === 'none') {
        return '';
    }

    const formatter = MODULE_SEGMENT_FORMATTERS[key];
    if (!formatter) {
        return '';
    }

    const segment = formatter(value);
    if (!segment) {
        return '';
    }

    return `-${segment}`;
}

let manifestLoadPromise = null;
let manifestData = null;
let manifestLoadError = null;
let manifestBuildsWithIndex = [];
let manifestConfigStringLookup = new Map();
let manifestAvailabilityIndex = new Map();

const RELEASE_NOTES_CHANNEL_SUFFIX_MAP = {
    stable: 'stable',
    general: 'stable',
    preview: 'preview',
    prerelease: 'preview',
    beta: 'beta',
    rc: 'beta',
    candidate: 'beta'
};

const CHANNEL_DISPLAY_MAP = {
    stable: {
        label: 'Stable Release',
        description: 'Recommended for production deployments with full validation.',
        notesFallback: 'Stable release notes are not available for this firmware version yet.'
    },
    preview: {
        label: 'Preview Release',
        description: 'Early-access builds for evaluating upcoming capabilities with limited validation.',
        notesFallback: 'Preview release notes are not yet available for this firmware version.'
    },
    beta: {
        label: 'Beta Release',
        description: 'Release candidate builds for broader testing ahead of stable rollout.',
        notesFallback: 'Beta release notes are not yet available for this firmware version.'
    },
    dev: {
        label: 'Development Build',
        description: 'Cutting-edge development firmware intended for advanced testing only.',
        notesFallback: 'Development build notes are not available for this firmware version.'
    }
};

const DEFAULT_CHANNEL_DISPLAY = {
    label: 'Firmware Build',
    description: 'Details for this firmware build.',
    notesFallback: 'No release notes available for this firmware version.'
};

const CHANNEL_PRIORITY_MAP = {
    general: 0,
    stable: 0,
    ga: 0,
    release: 0,
    prod: 0,
    production: 0,
    lts: 0,
    preview: 1,
    prerelease: 1,
    beta: 2,
    rc: 2,
    candidate: 2,
    dev: 3,
    alpha: 3,
    nightly: 3,
    canary: 3,
    experimental: 3
};

function normaliseChannelKey(channel) {
    return normalizeChannelKey(channel);
}

function getChannelDisplayInfo(channel) {
    const key = normaliseChannelKey(channel);
    const display = CHANNEL_DISPLAY_MAP[key] || DEFAULT_CHANNEL_DISPLAY;
    return { key, ...display };
}

function resolveReleaseNotesChannel(channel) {
    if (!channel) {
        return '';
    }

    const key = channel.toString().trim().toLowerCase();
    return RELEASE_NOTES_CHANNEL_SUFFIX_MAP[key] || key;
}

function getChannelPriority(channel) {
    const key = normaliseChannelKey(channel);
    if (Object.prototype.hasOwnProperty.call(CHANNEL_PRIORITY_MAP, key)) {
        return CHANNEL_PRIORITY_MAP[key];
    }
    return 99;
}

function parseVersionSegments(version) {
    if (!version) {
        return [];
    }

    const numericSegments = String(version)
        .match(/\d+/g);

    if (!numericSegments) {
        return [];
    }

    return numericSegments.map(segment => Number.parseInt(segment, 10));
}

function compareVersionsDesc(aVersion, bVersion) {
    const aSegments = parseVersionSegments(aVersion);
    const bSegments = parseVersionSegments(bVersion);
    const maxLength = Math.max(aSegments.length, bSegments.length);

    for (let index = 0; index < maxLength; index += 1) {
        const aValue = aSegments[index] ?? 0;
        const bValue = bSegments[index] ?? 0;

        if (aValue !== bValue) {
            return bValue - aValue;
        }
    }

    const aLabel = aVersion || '';
    const bLabel = bVersion || '';

    return bLabel.localeCompare(aLabel);
}

function sortBuildsByChannelAndVersion(builds) {
    if (!Array.isArray(builds)) {
        return [];
    }

    return builds.slice().sort((a, b) => {
        const priorityDiff = getChannelPriority(a.channel) - getChannelPriority(b.channel);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }
        return compareVersionsDesc(a.version, b.version);
    });
}

function normaliseMountingToken(value) {
    const token = (value || '').toString().trim().toLowerCase();
    if (allowedOptions.mounting.includes(token)) {
        return token;
    }
    return null;
}

function normalisePowerToken(value) {
    const token = (value || '').toString().trim().toLowerCase();
    if (allowedOptions.power.includes(token)) {
        return token;
    }
    return null;
}

function normaliseModuleValue(key, value) {
    const allowed = allowedOptions[key];
    if (!allowed) {
        return value;
    }

    const normalised = (value || '').toString().trim().toLowerCase();
    if (normalised && allowed.includes(normalised)) {
        return normalised;
    }

    if (!normalised) {
        if (allowed.includes('base')) {
            return 'base';
        }
        if (allowed.includes('none')) {
            return 'none';
        }
    }

    if (allowed.includes('none')) {
        return 'none';
    }

    return allowed[0];
}

function parseConfigStringState(configString) {
    if (!configString) {
        return null;
    }

    const segments = configString
        .split('-')
        .map(segment => segment.trim())
        .filter(Boolean);

    if (segments.length < 2) {
        return null;
    }

    const mounting = normaliseMountingToken(segments[0]);
    const power = normalisePowerToken(segments[1]);

    if (!mounting || !power) {
        return null;
    }

    const moduleState = {
        airiq: 'none',
        presence: 'none',
        comfort: 'none',
        fan: 'none'
    };

    for (let index = 2; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
            continue;
        }

        if (segment.startsWith('AirIQ')) {
            const suffix = segment.substring('AirIQ'.length);
            moduleState.airiq = normaliseModuleValue('airiq', suffix ? suffix.toLowerCase() : 'base');
        } else if (segment.startsWith('Presence')) {
            const suffix = segment.substring('Presence'.length);
            moduleState.presence = normaliseModuleValue('presence', suffix ? suffix.toLowerCase() : 'base');
        } else if (segment.startsWith('Comfort')) {
            const suffix = segment.substring('Comfort'.length);
            moduleState.comfort = normaliseModuleValue('comfort', suffix ? suffix.toLowerCase() : 'base');
        } else if (segment.startsWith('Fan')) {
            const suffix = segment.substring('Fan'.length);
            moduleState.fan = normaliseModuleValue('fan', suffix ? suffix.toLowerCase() : 'none');
        }
    }

    return {
        mounting,
        power,
        ...moduleState
    };
}

function buildBaseKey(state) {
    return `${state.mounting}|${state.power}`;
}

function buildModuleComboKey(state) {
    return MODULE_KEYS
        .map(key => `${key}=${state[key] ?? 'none'}`)
        .join('|');
}

function buildManifestContext(manifest) {
    manifestBuildsWithIndex = [];
    manifestConfigStringLookup = new Map();
    manifestAvailabilityIndex = new Map();

    const builds = Array.isArray(manifest?.builds) ? manifest.builds : [];

    builds.forEach((build, index) => {
        const buildWithIndex = { ...build, manifestIndex: index };
        buildWithIndex.firmwareId = getFirmwareId(buildWithIndex);
        manifestBuildsWithIndex.push(buildWithIndex);

        const configString = build.config_string;
        if (configString) {
            if (!manifestConfigStringLookup.has(configString)) {
                manifestConfigStringLookup.set(configString, []);
            }
            manifestConfigStringLookup.get(configString).push(buildWithIndex);

            const parsedState = parseConfigStringState(configString);
            if (parsedState) {
                const baseKey = buildBaseKey(parsedState);
                if (!manifestAvailabilityIndex.has(baseKey)) {
                    manifestAvailabilityIndex.set(baseKey, {
                        modules: {
                            airiq: new Set(),
                            presence: new Set(),
                            comfort: new Set(),
                            fan: new Set()
                        },
                        combos: new Set()
                    });
                }

                const availability = manifestAvailabilityIndex.get(baseKey);
                MODULE_KEYS.forEach(moduleKey => {
                    availability.modules[moduleKey].add(parsedState[moduleKey]);
                });
                availability.combos.add(buildModuleComboKey(parsedState));
            }
        }
    });

}

function isManifestReady() {
    return manifestData !== null;
}

async function loadManifestData() {
    if (manifestData) {
        return manifestData;
    }

    if (manifestLoadPromise) {
        return manifestLoadPromise;
    }

    manifestLoadPromise = fetch('manifest.json', { cache: 'no-store' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Manifest request failed with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            manifestData = data;
            manifestLoadError = null;
            buildManifestContext(data);
            return data;
        })
        .catch(error => {
            manifestLoadError = error;
            manifestLoadPromise = null;
            console.error('Failed to load manifest:', error);
            throw error;
        });

    return manifestLoadPromise;
}

const manifestReadyPromise = loadManifestData().catch(() => null);

let checklistCompleted = false;
let rememberChoices = false;
let rememberedState = null;

const REMEMBER_TOGGLE_SELECTOR = '[data-remember-toggle]';

const firmwareSelectorWrapper = document.getElementById('firmware-selector');
const firmwareVersionSelect = document.getElementById('firmware-version-select');
let firmwareOptions = [];
let firmwareOptionsMap = new Map();
let currentFirmwareSelectionId = null;
let toastTimeoutId = null;
let additionalFirmwareBuckets = new Map();
let firmwareStatusMessage = null;
let currentFirmwareYamlDownloadUrl = null;

window.currentFirmwareYaml = null;

function syncChecklistCompletion() {
    const section = document.querySelector('.pre-flash-checklist');
    if (!section) return;

    const completionValue = checklistCompleted ? 'true' : 'false';
    section.dataset.complete = completionValue;

    section.querySelectorAll('[data-checklist-item]').forEach(item => {
        item.dataset.complete = completionValue;
    });
}

function setChecklistCompletion(isComplete) {
    checklistCompleted = isComplete;
    syncChecklistCompletion();
}

function attachInstallButtonListeners() {
    const installHosts = document.querySelectorAll('#compatible-firmware esp-web-install-button');

    installHosts.forEach(host => {
        const activateButton = host.querySelector('button[slot="activate"]');

        if (activateButton && activateButton.dataset.checklistBound !== 'true') {
            activateButton.addEventListener('click', () => {
                const firmwareId = activateButton.dataset.firmwareId;
                if (firmwareId) {
                    selectFirmwareById(firmwareId, { syncSelector: false });
                }
                setChecklistCompletion(true);
            });
            activateButton.dataset.checklistBound = 'true';
        }

        if (host.dataset.serialLogBound === 'true') {
            return;
        }

        const bindLogForwarding = () => {
            if (host.dataset.serialLogBound === 'true') {
                return;
            }

            const forwardLogEvent = (event) => {
                const message = event?.detail?.message ?? event?.detail ?? '';
                if (typeof message !== 'string' || message.length === 0) {
                    return;
                }
                window.supportBundle?.pushSerial?.(message);
            };

            const resetSerialBuffer = (event) => {
                const detail = event?.detail;
                const state = typeof detail === 'string' ? detail : detail?.state;
                if (!state) {
                    return;
                }

                if (state === 'initializing' || state === 'preparing') {
                    const isInProgress = typeof detail === 'object'
                        ? detail.details?.done === false || detail.details === undefined
                        : true;

                    if (isInProgress) {
                        window.supportBundle?.clearSerial?.();
                    }
                }
            };

            // ESP Web Tools dispatches "log"/"console" events from the install button
            // to expose console output. Forward the payload to the support bundle so
            // that generated bundles include raw serial logs for troubleshooting.
            host.addEventListener('log', forwardLogEvent);
            host.addEventListener('console', forwardLogEvent);

            // The flashing dialog also emits "state-changed" events as the install
            // progresses. When a new session moves into the initializing/preparing
            // phase we reset the buffered log output so the bundle only contains the
            // latest attempt.
            host.addEventListener('state-changed', resetSerialBuffer);

            host.dataset.serialLogBound = 'true';
        };

        if (isManifestReady()) {
            bindLogForwarding();
        } else if (host.dataset.serialLogPending !== 'true') {
            host.dataset.serialLogPending = 'true';
            manifestReadyPromise
                .then(() => {
                    delete host.dataset.serialLogPending;
                    if (!document.body.contains(host)) {
                        return;
                    }
                    bindLogForwarding();
                })
                .catch(() => {
                    delete host.dataset.serialLogPending;
                });
        }
    });
}

function attachYamlActionHandlers() {
    const panel = document.querySelector('[data-firmware-yaml]');
    if (!panel) {
        return;
    }

    const copyButton = panel.querySelector('[data-yaml-copy]');
    if (copyButton) {
        copyButton.addEventListener('click', handleYamlCopy);
    }

    const downloadButton = panel.querySelector('[data-yaml-download]');
    if (downloadButton) {
        downloadButton.addEventListener('click', handleYamlDownload);
    }
}

function syncRememberToggleElements(sourceToggle) {
    const toggles = document.querySelectorAll(REMEMBER_TOGGLE_SELECTOR);
    toggles.forEach(toggle => {
        if (toggle !== sourceToggle) {
            toggle.checked = rememberChoices;
        }
    });
}

function handleRememberToggleChange(event) {
    rememberChoices = event.target.checked;
    syncRememberToggleElements(event.target);

    setRememberEnabled(rememberChoices);

    if (!rememberChoices) {
        rememberedState = null;
        return;
    }

    persistWizardState();
}

function setupRememberPreferenceControls() {
    rememberChoices = isRememberEnabled();
    rememberedState = rememberChoices
        ? loadRememberedState({
            defaultConfiguration,
            allowedOptions,
            totalSteps
        })
        : null;

    const toggles = document.querySelectorAll(REMEMBER_TOGGLE_SELECTOR);
    toggles.forEach(toggle => {
        toggle.checked = rememberChoices;
        toggle.addEventListener('change', handleRememberToggleChange);
    });
}

function persistWizardState() {
    if (!rememberChoices) {
        return;
    }

    const stateToPersist = persistRememberedState({
        mounting: configuration.mounting,
        power: configuration.power,
        airiq: configuration.airiq,
        presence: configuration.presence,
        comfort: configuration.comfort,
        fan: configuration.mounting === 'wall' ? configuration.fan : 'none'
    }, {
        defaultConfiguration,
        allowedOptions,
        totalSteps,
        currentStep
    });

    rememberedState = stateToPersist;
}

let wizardInitialized = false;

function initializeWizard() {
    if (wizardInitialized) {
        return;
    }
    wizardInitialized = true;

    if (!navigator.serial) {
        const warning = document.getElementById('browser-warning');
        if (warning) {
            warning.style.display = 'block';
        }
    }

    syncChecklistCompletion();
    setupRememberPreferenceControls();

    document.querySelectorAll('input[name="mounting"]').forEach(input => {
        input.addEventListener('change', handleMountingChange);
    });

    document.querySelectorAll('input[name="power"]').forEach(input => {
        input.addEventListener('change', handlePowerChange);
    });

    document.querySelectorAll('input[name="airiq"]').forEach(input => {
        input.addEventListener('change', updateConfiguration);
    });

    document.querySelectorAll('input[name="presence"]').forEach(input => {
        input.addEventListener('change', updateConfiguration);
    });

    document.querySelectorAll('input[name="comfort"]').forEach(input => {
        input.addEventListener('change', updateConfiguration);
    });

    document.querySelectorAll('input[name="fan"]').forEach(input => {
        input.addEventListener('change', updateConfiguration);
    });

    initializeFromUrl();

    manifestReadyPromise
        .then(() => {
            updateModuleOptionAvailability();
            updateModuleAvailabilityMessage();

            if (currentStep === 4) {
                findCompatibleFirmware();
            }
        })
        .catch(() => {
            resetOptionAvailability();
            updateModuleAvailabilityMessage();
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWizard, { once: true });
} else {
    initializeWizard();
}

function handleMountingChange(e) {
    configuration.mounting = e.target.value;
    document.querySelector('#step-1 .btn-next').disabled = false;

    // Show/hide fan module based on mounting type
    updateFanModuleVisibility();

    updateConfiguration({ skipUrlUpdate: true });
    updateUrlFromConfiguration();
}

function handlePowerChange(e) {
    configuration.power = e.target.value;
    document.querySelector('#step-2 .btn-next').disabled = false;
    updateConfiguration({ skipUrlUpdate: true });
    updateUrlFromConfiguration();
}

function updateFanModuleVisibility() {
    const fanSection = document.getElementById('fan-module-section');
    if (configuration.mounting === 'ceiling') {
        fanSection.style.display = 'none';
        // Reset fan selection if ceiling mount
        document.querySelector('input[name="fan"][value="none"]').checked = true;
        configuration.fan = 'none';
    } else {
        fanSection.style.display = 'block';
    }
}

function syncConfigurationFromInputs() {
    configuration.airiq = document.querySelector('input[name="airiq"]:checked')?.value || 'none';
    configuration.presence = document.querySelector('input[name="presence"]:checked')?.value || 'none';
    configuration.comfort = document.querySelector('input[name="comfort"]:checked')?.value || 'none';

    if (configuration.mounting === 'wall') {
        configuration.fan = document.querySelector('input[name="fan"]:checked')?.value || 'none';
    } else {
        configuration.fan = 'none';
        const fanNoneInput = document.querySelector('input[name="fan"][value="none"]');
        if (fanNoneInput && !fanNoneInput.checked) {
            fanNoneInput.checked = true;
        }
    }
}

function getOptionStatusElement(card) {
    if (!card) {
        return null;
    }

    let status = card.querySelector('[data-option-status]');
    if (!status) {
        const container = card.querySelector('.option-content') || card;
        status = document.createElement('p');
        status.className = 'option-status';
        status.setAttribute('data-option-status', 'true');
        status.style.display = 'none';
        container.appendChild(status);
    }

    return status;
}

function applyOptionAvailabilityState(input, { available, reason }) {
    input.disabled = !available;
    const card = input.closest('.option-card');

    if (card) {
        if (available) {
            card.classList.remove('is-unavailable');
            card.removeAttribute('aria-disabled');
        } else {
            card.classList.add('is-unavailable');
            card.setAttribute('aria-disabled', 'true');
        }

        const status = card.querySelector('[data-option-status]');
        if (!available) {
            const statusElement = status || getOptionStatusElement(card);
            statusElement.textContent = reason || 'Not available for this configuration.';
            statusElement.style.display = 'block';
        } else if (status) {
            status.textContent = '';
            status.style.display = 'none';
        }
    }
}

function resetOptionAvailability() {
    MODULE_KEYS.forEach(key => {
        document.querySelectorAll(`input[name="${key}"]`).forEach(input => {
            input.disabled = false;
            const card = input.closest('.option-card');
            if (card) {
                card.classList.remove('is-unavailable');
                card.removeAttribute('aria-disabled');
                const status = card.querySelector('[data-option-status]');
                if (status) {
                    status.textContent = '';
                    status.style.display = 'none';
                }
            }
        });
    });
}

function formatMountingPowerLabel(state) {
    const parts = [];
    if (state.mounting) {
        parts.push(`${state.mounting.charAt(0).toUpperCase()}${state.mounting.slice(1)} mount`);
    }
    if (state.power) {
        parts.push(`${state.power.toUpperCase()} power`);
    }
    return parts.join(' + ');
}

function formatModuleSelectionLabel(key, value) {
    const label = MODULE_LABELS[key] || key;
    if (value === 'none') {
        return `${label} None`;
    }

    if (key === 'fan') {
        return `${label} ${value.toUpperCase()}`;
    }

    return `${label} ${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatOptionUnavailableReason(baseState, moduleKey, value) {
    const moduleLabel = formatModuleSelectionLabel(moduleKey, value);
    const combinationLabel = formatMountingPowerLabel(baseState);

    if (combinationLabel) {
        return `${moduleLabel} is not available for ${combinationLabel}.`;
    }

    return `${moduleLabel} is not available for the current selection.`;
}

function createModuleTag(label, variant = 'info') {
    return `<span class="module-tag module-tag--${variant}">${escapeHtml(label)}</span>`;
}

function updateModuleOptionAvailability() {
    if (manifestLoadError || !configuration.mounting || !configuration.power) {
        resetOptionAvailability();
        return;
    }

    if (!isManifestReady()) {
        return;
    }

    const baseState = {
        mounting: configuration.mounting,
        power: configuration.power
    };
    const baseKey = buildBaseKey(baseState);
    const availability = manifestAvailabilityIndex.get(baseKey) || null;

    MODULE_KEYS.forEach(key => {
        const options = Array.from(document.querySelectorAll(`input[name="${key}"]`));
        if (!options.length) {
            return;
        }

        const previouslyChecked = options.find(option => option.checked) || null;
        let selectionNeedsUpdate = false;

        options.forEach(input => {
            let available = true;
            let reason = '';

            if (!availability) {
                available = false;
                reason = formatOptionUnavailableReason(baseState, key, input.value);
            } else {
                const allowedValues = availability.modules[key];
                available = allowedValues.has(input.value);
                if (!available) {
                    reason = formatOptionUnavailableReason(baseState, key, input.value);
                }
            }

            if (!available && input.checked) {
                input.checked = false;
                selectionNeedsUpdate = true;
            }

            applyOptionAvailabilityState(input, { available, reason });
        });

        if (selectionNeedsUpdate) {
            const fallback = options.find(option => !option.disabled);
            if (fallback) {
                fallback.checked = true;
            } else if (previouslyChecked) {
                previouslyChecked.checked = true;
            }
        }
    });
}

function updateModuleAvailabilityMessage() {
    const hint = document.getElementById('module-availability-hint');
    if (!hint) {
        return;
    }

    hint.classList.remove('is-success', 'is-warning', 'is-error');

    if (manifestLoadError) {
        hint.classList.add('is-error');
        hint.innerHTML = '<strong>Unable to load firmware manifest.</strong> Module availability cannot be determined right now.';
        return;
    }

    if (!configuration.mounting || !configuration.power) {
        hint.innerHTML = 'Select a mounting and power option to see supported expansion modules.';
        return;
    }

    if (!isManifestReady()) {
        hint.innerHTML = 'Checking firmware coverage…';
        return;
    }

    const baseState = {
        mounting: configuration.mounting,
        power: configuration.power
    };
    const baseKey = buildBaseKey(baseState);
    const availability = manifestAvailabilityIndex.get(baseKey) || null;
    const combinationLabel = formatMountingPowerLabel(baseState);

    if (!availability) {
        hint.classList.add('is-warning');
        const label = combinationLabel ? escapeHtml(combinationLabel) : 'this selection';
        hint.innerHTML = `<strong>No firmware coverage yet.</strong> We don't have builds for ${label}.`;
        return;
    }

    const moduleComboKey = buildModuleComboKey(configuration);
    const unsupportedModules = MODULE_KEYS.filter(moduleKey => !availability.modules[moduleKey].has(configuration[moduleKey]));

    if (unsupportedModules.length > 0) {
        hint.classList.add('is-warning');
        const unavailableTags = unsupportedModules
            .map(moduleKey => createModuleTag(formatModuleSelectionLabel(moduleKey, configuration[moduleKey]), 'error'))
            .join(' ');
        const scopeLabel = combinationLabel ? ` for ${escapeHtml(combinationLabel)}` : '';
        hint.innerHTML = `<strong>Not available${scopeLabel}:</strong> ${unavailableTags}`;
        return;
    }

    if (!availability.combos.has(moduleComboKey)) {
        hint.classList.add('is-warning');
        const selectedTags = MODULE_KEYS
            .filter(moduleKey => configuration[moduleKey] !== 'none')
            .map(moduleKey => createModuleTag(formatModuleSelectionLabel(moduleKey, configuration[moduleKey]), 'info'))
            .join(' ') || createModuleTag('Core only', 'info');
        const label = combinationLabel ? escapeHtml(combinationLabel) : 'this selection';
        hint.innerHTML = `<strong>Partial support.</strong> ${label} is supported, but not with this exact module mix. ${selectedTags}`;
        return;
    }

    hint.classList.add('is-success');
    const selectedTags = MODULE_KEYS
        .filter(moduleKey => configuration[moduleKey] !== 'none')
        .map(moduleKey => createModuleTag(formatModuleSelectionLabel(moduleKey, configuration[moduleKey]), 'success'))
        .join(' ') || createModuleTag('Core only', 'success');
    const label = combinationLabel ? escapeHtml(combinationLabel) : 'this configuration';
    hint.innerHTML = `<strong>Firmware available!</strong> ${label} is ready for flashing. ${selectedTags}`;
}

function updateConfiguration(options = {}) {
    syncConfigurationFromInputs();
    updateModuleOptionAvailability();
    syncConfigurationFromInputs();
    updateModuleAvailabilityMessage();

    if (!options.skipUrlUpdate) {
        updateUrlFromConfiguration();
    } else {
        persistWizardState();
    }
}

function nextStep() {
    if (currentStep < totalSteps) {
        setStep(currentStep + 1, { animate: true });
    }
}

function previousStep() {
    if (currentStep > 1) {
        setStep(currentStep - 1, { animate: true });
    }
}

function setStep(targetStep, { skipUrlUpdate = false, animate = true } = {}) {
    if (targetStep < 1 || targetStep > totalSteps) {
        return;
    }

    const previousStep = currentStep;
    const targetStepElement = document.getElementById(`step-${targetStep}`);

    if (!targetStepElement) {
        return;
    }

    if (previousStep !== targetStep) {
        currentStep = targetStep;
    }

    updateProgressSteps(targetStep);

    if (animate && previousStep !== targetStep) {
        animateStepTransition(previousStep, targetStep);
    } else {
        document.querySelectorAll('.wizard-step').forEach(step => {
            const stepNumber = Number(step.id.replace('step-', ''));
            if (stepNumber === targetStep) {
                step.classList.add('active');
                step.classList.remove('entering', 'leaving');
            } else {
                step.classList.remove('active', 'entering', 'leaving');
            }
        });

        focusStep(targetStepElement);
    }

    if (currentStep === 3) {
        updateFanModuleVisibility();
        updateModuleOptionAvailability();
        updateModuleAvailabilityMessage();
    }

    if (currentStep === 4) {
        updateConfiguration({ skipUrlUpdate: true });
        updateSummary();
        findCompatibleFirmware();
    }

    if (!skipUrlUpdate) {
        updateUrlFromConfiguration();
    } else {
        persistWizardState();
    }
}

function updateProgressSteps(targetStep) {
    for (let i = 1; i <= totalSteps; i++) {
        const progressElement = document.querySelector(`.progress-step[data-step="${i}"]`);
        if (!progressElement) continue;

        if (i === targetStep) {
            progressElement.classList.add('active');
        } else {
            progressElement.classList.remove('active');
        }

        if (i < targetStep) {
            progressElement.classList.add('completed');
        } else {
            progressElement.classList.remove('completed');
        }
    }
}

function animateStepTransition(fromStep, toStep) {
    const fromElement = fromStep ? document.getElementById(`step-${fromStep}`) : null;
    const toElement = document.getElementById(`step-${toStep}`);

    if (fromElement && fromElement !== toElement) {
        fromElement.classList.add('leaving');
        fromElement.classList.remove('entering');

        const handleLeave = (event) => {
            if (event.target !== fromElement || event.propertyName !== 'opacity') {
                return;
            }

            clearTimeout(leaveFallback);
            fromElement.removeEventListener('transitionend', handleLeave);
            fromElement.classList.remove('leaving');
        };

        const leaveFallback = setTimeout(() => {
            fromElement.removeEventListener('transitionend', handleLeave);
            fromElement.classList.remove('leaving');
        }, 450);

        fromElement.addEventListener('transitionend', handleLeave);
        fromElement.classList.remove('active');
    }

    if (!toElement) {
        return;
    }

    toElement.classList.remove('leaving');
    toElement.classList.add('entering');
    toElement.classList.remove('active');

    const activateStep = () => {
        toElement.classList.add('active');

        const handleEnter = (event) => {
            if (event.target !== toElement || event.propertyName !== 'opacity') {
                return;
            }

            clearTimeout(enterFallback);
            toElement.removeEventListener('transitionend', handleEnter);
            toElement.classList.remove('entering');
            focusStep(toElement);
        };

        const enterFallback = setTimeout(() => {
            toElement.removeEventListener('transitionend', handleEnter);
            toElement.classList.remove('entering');
            focusStep(toElement);
        }, 450);

        toElement.addEventListener('transitionend', handleEnter);
    };

    requestAnimationFrame(activateStep);
}

function focusStep(stepElement) {
    if (!stepElement) {
        return;
    }

    const focusableSelector = 'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusable = stepElement.querySelector(focusableSelector);

    if (focusable) {
        focusable.focus();
        return;
    }

    const heading = stepElement.querySelector('h2, h3, h4');
    if (heading) {
        if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
            heading.addEventListener('blur', () => {
                heading.removeAttribute('tabindex');
            }, { once: true });
        }

        heading.focus();
    }
}

function updateSummary() {
    let summaryHtml = '<div class="summary-grid">';

    // Mounting
    summaryHtml += `
        <div class="summary-item">
            <div class="summary-label">Mounting Type:</div>
            <div class="summary-value">${configuration.mounting ? configuration.mounting.charAt(0).toUpperCase() + configuration.mounting.slice(1) : 'Not selected'}</div>
        </div>
    `;

    // Power
    summaryHtml += `
        <div class="summary-item">
            <div class="summary-label">Power Option:</div>
            <div class="summary-value">${configuration.power ? configuration.power.toUpperCase() : 'Not selected'}</div>
        </div>
    `;

    // AirIQ
    if (configuration.airiq !== 'none') {
        const airiqSensors = {
            'base': ['SGP41', 'SCD41', 'MiCS4514', 'BMP390'],
            'pro': ['SGP41', 'SCD41', 'MiCS4514', 'BMP390', 'SEN0321', 'SPS30', 'SFA40']
        };
        summaryHtml += `
            <div class="summary-item">
                <div class="summary-label">AirIQ Module:</div>
                <div class="summary-value">${configuration.airiq.charAt(0).toUpperCase() + configuration.airiq.slice(1)}</div>
                <div class="summary-sensors">Includes: ${airiqSensors[configuration.airiq].join(', ')}</div>
            </div>
        `;
    }

    // Presence
    if (configuration.presence !== 'none') {
        const presenceSensors = {
            'base': ['SEN0609 mmWave sensor'],
            'pro': ['SEN0609 mmWave sensor', 'LD2450 24GHz radar']
        };
        summaryHtml += `
            <div class="summary-item">
                <div class="summary-label">Presence Module:</div>
                <div class="summary-value">${configuration.presence.charAt(0).toUpperCase() + configuration.presence.slice(1)}</div>
                <div class="summary-sensors">Includes: ${presenceSensors[configuration.presence].join(', ')}</div>
            </div>
        `;
    }

    // Comfort
    if (configuration.comfort !== 'none') {
        summaryHtml += `
            <div class="summary-item">
                <div class="summary-label">Comfort Module:</div>
                <div class="summary-value">${configuration.comfort.charAt(0).toUpperCase() + configuration.comfort.slice(1)}</div>
                <div class="summary-sensors">Includes: SHT40 (Temperature/Humidity), LTR-303 (Light)</div>
            </div>
        `;
    }

    // Fan
    if (configuration.fan !== 'none') {
        const fanTypes = {
            'pwm': 'Variable speed fan control via PWM',
            'analog': '0-10V analog fan control'
        };
        summaryHtml += `
            <div class="summary-item">
                <div class="summary-label">Fan Module:</div>
                <div class="summary-value">${configuration.fan.toUpperCase()}</div>
                <div class="summary-sensors">${fanTypes[configuration.fan]}</div>
            </div>
        `;
    }

    summaryHtml += '</div>';
    document.getElementById('config-summary').innerHTML = summaryHtml;
}

function updateFirmwareControls() {
    const isReady = Boolean(
        window.currentFirmware
        && Array.isArray(window.currentFirmware.parts)
        && window.currentFirmware.parts.length > 0
    );

    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.disabled = !isReady;
        downloadBtn.classList.toggle('is-ready', isReady);
    }

    const copyUrlBtn = document.getElementById('copy-firmware-url-btn');
    if (copyUrlBtn) {
        const clipboardSupported = Boolean(navigator.clipboard);
        const canCopy = clipboardSupported && isReady;
        copyUrlBtn.disabled = !canCopy;
        copyUrlBtn.classList.toggle('is-ready', canCopy);

        if (!clipboardSupported) {
            copyUrlBtn.title = 'Copy requires Clipboard API support';
        } else {
            copyUrlBtn.removeAttribute('title');
        }
    }

    const installButton = document.querySelector('#compatible-firmware esp-web-install-button button[slot="activate"]');
    if (installButton) {
        installButton.classList.toggle('is-ready', isReady);
    }

    const detailHelper = document.querySelector('#compatible-firmware [data-ready-helper]');
    if (detailHelper) {
        if (isReady) {
            detailHelper.textContent = 'Ready to flash';
            detailHelper.classList.add('is-visible');
        } else {
            detailHelper.textContent = '';
            detailHelper.classList.remove('is-visible');
        }
    }

    const primaryHelper = document.querySelector('.primary-action-group [data-ready-helper]');
    if (primaryHelper) {
        if (isReady) {
            if (primaryHelper.textContent !== 'Ready to flash') {
                primaryHelper.textContent = 'Ready to flash';
            }
            primaryHelper.classList.add('is-visible');
        } else {
            primaryHelper.textContent = '';
            primaryHelper.classList.remove('is-visible');
        }
    }
}

function groupBuildsByConfig(builds) {
    const configGroups = new Map();
    const modelBuckets = new Map();

    builds.forEach(build => {
        const configString = build.config_string;
        if (configString) {
            if (!configGroups.has(configString)) {
                configGroups.set(configString, []);
            }
            configGroups.get(configString).push(build);
            return;
        }

        const model = (build.model || '').toString().trim();
        if (!model) {
            return;
        }

        if (!modelBuckets.has(model)) {
            modelBuckets.set(model, new Map());
        }

        const variantRaw = (build.variant || '').toString().trim();
        const sensorAddonRaw = (build.sensor_addon || '').toString().trim();
        const variantKey = `${variantRaw || '__default__'}__${sensorAddonRaw || '__base__'}`;
        const variantMap = modelBuckets.get(model);

        if (!variantMap.has(variantKey)) {
            variantMap.set(variantKey, {
                variant: variantRaw,
                sensorAddon: sensorAddonRaw,
                builds: []
            });
        }

        variantMap.get(variantKey).builds.push(build);
    });

    return { configGroups, modelBuckets };
}

function getFirmwareDisplayName(firmware, fallbackConfigString = '') {
    if (!firmware) {
        return 'Sense360-Firmware.bin';
    }

    const versionSegment = firmware.version ? `-v${firmware.version}` : '';
    const channelSegment = firmware.channel ? `-${firmware.channel}` : '';
    const configString = (firmware.config_string || fallbackConfigString || '').toString().trim();

    if (configString) {
        return `Sense360-${configString}${versionSegment}${channelSegment}.bin`;
    }

    const model = (firmware.model || 'Sense360').toString().trim() || 'Sense360';
    const variant = (firmware.variant || '').toString().trim();
    const sensorAddon = (firmware.sensor_addon || '').toString().trim();
    const variantSegment = variant ? `-${variant}` : '';
    const sensorAddonSegment = sensorAddon ? `-${sensorAddon}` : '';

    return `${model}${variantSegment}${sensorAddonSegment}${versionSegment}${channelSegment}.bin`;
}

function renderFirmwarePartsSection(firmware) {
    const parts = getFirmwarePartsMetadata(firmware);
    if (!parts.length) {
        return '';
    }

    const listItems = parts
        .map(part => {
            const offsetText = part.offsetHex ? `Offset ${part.offsetHex}` : 'Offset not specified';
            return `
                <li class="firmware-part-row">
                    <span class="firmware-part-name">${escapeHtml(part.fileName)}</span>
                    <span class="firmware-part-offset">${escapeHtml(offsetText)}</span>
                </li>
            `;
        })
        .join('');

    const hint = parts.length > 1
        ? '<p class="firmware-parts-hint">Flash each file to the offset shown below.</p>'
        : '';

    return `
        <section class="firmware-parts" data-multi-part="${parts.length > 1}">
            <h4>${parts.length > 1 ? 'Firmware files' : 'Firmware file'}</h4>
            <ul class="firmware-parts-list">${listItems}</ul>
            ${hint}
        </section>
    `;
}

function createFirmwareCardHtml(firmware, { configString = '', contextKey = 'primary', cardClassName = 'firmware-card' } = {}) {
    if (!firmware) {
        return '';
    }

    const metadataSections = [
        { key: 'features', title: 'Key Features' },
        { key: 'hardware_requirements', title: 'Hardware Requirements' },
        { key: 'known_issues', title: 'Known Issues' },
        { key: 'changelog', title: 'Changelog' }
    ];

    const metadataHtml = metadataSections
        .map(({ key, title }) => {
            const items = firmware[key];
            if (!Array.isArray(items) || items.length === 0) {
                return '';
            }

            const listItems = items
                .map(item => `<li>${escapeHtml(item)}</li>`)
                .join('');

            return `
                <section class="firmware-meta-section firmware-${key.replace(/_/g, '-')}">
                    <h4>${escapeHtml(title)}</h4>
                    <ul>${listItems}</ul>
                </section>
            `;
        })
        .filter(Boolean)
        .join('');

    const channelInfo = getChannelDisplayInfo(firmware.channel);
    const firmwareName = getFirmwareDisplayName(firmware, configString);
    const fileSize = Number(firmware.file_size);
    const sizeLabel = Number.isFinite(fileSize) && fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : '';
    const buildDate = firmware.build_date ? new Date(firmware.build_date) : null;
    const buildDateLabel = buildDate && !Number.isNaN(buildDate.getTime()) ? buildDate.toLocaleDateString() : '';
    const releaseNotesId = `${firmware.firmwareId}-release-notes-${contextKey}`;

    const metaParts = [];
    if (firmware.version) {
        const channelSuffix = firmware.channel ? `-${firmware.channel}` : '';
        metaParts.push(`<span class="firmware-version">${escapeHtml(`v${firmware.version}${channelSuffix}`)}</span>`);
    }
    if (sizeLabel) {
        metaParts.push(`<span class="firmware-size">${escapeHtml(sizeLabel)}</span>`);
    }
    if (buildDateLabel) {
        metaParts.push(`<span class="firmware-date">${escapeHtml(buildDateLabel)}</span>`);
    }

    metaParts.push(`
        <a href="#" class="release-notes-link" data-release-notes-trigger data-release-notes-id="${escapeHtml(releaseNotesId)}" data-notes-id="${escapeHtml(releaseNotesId)}" data-firmware-id="${escapeHtml(firmware.firmwareId)}" onclick="toggleReleaseNotes(event)">
            View Release Notes
        </a>
    `);

    const metadataBlock = metadataHtml
        ? `
            <div class="firmware-metadata">
                ${metadataHtml}
            </div>
        `
        : '';

    const partsSectionHtml = renderFirmwarePartsSection(firmware);

    const descriptionHtml = firmware.description
        ? `<p class="firmware-description">${escapeHtml(firmware.description)}</p>`
        : '';

    const manifestIndex = escapeHtml(String(firmware.manifestIndex));

    return `
        <div class="${cardClassName}" data-firmware-detail data-firmware-id="${escapeHtml(firmware.firmwareId)}" data-channel="${escapeHtml(channelInfo.key)}">
            <div class="firmware-item">
                <div class="firmware-info">
                    <div class="firmware-header">
                        <div class="firmware-name">${escapeHtml(firmwareName)}</div>
                        <span class="firmware-channel-tag is-${escapeHtml(channelInfo.key)}">${escapeHtml(channelInfo.label)}</span>
                    </div>
                    <div class="firmware-details">
                        ${metaParts.join('')}
                    </div>
                    ${descriptionHtml}
                </div>
                <div class="firmware-actions">
                    <esp-web-install-button manifest="firmware-${manifestIndex}.json" data-firmware-id="${escapeHtml(firmware.firmwareId)}">
                        <button slot="activate" class="btn btn-primary" data-firmware-id="${escapeHtml(firmware.firmwareId)}">
                            Install Firmware
                        </button>
                    </esp-web-install-button>
                    <p class="ready-helper" data-ready-helper role="status" aria-live="polite"></p>
                </div>
            </div>
            ${partsSectionHtml}
            ${metadataBlock}
            <div class="release-notes-section" id="${escapeHtml(releaseNotesId)}" data-release-notes-container data-loaded="false" style="display: none;">
                <div class="release-notes-content">
                    <div class="loading">Loading release notes...</div>
                </div>
            </div>
        </div>
    `;
}

function createFirmwareYamlPanel({ yaml = '', context = null } = {}) {
    if (!yaml || typeof yaml !== 'string' || yaml.trim().length === 0) {
        return '';
    }

    const moduleSummary = context?.moduleSummary || 'No expansion modules';
    const sensorsSummary = Array.isArray(context?.aggregatedSensors) && context.aggregatedSensors.length
        ? `Sensors: ${context.aggregatedSensors.join(', ')}`
        : 'Sensors: None listed';

    const infoLine = `${moduleSummary} • ${sensorsSummary}`;

    return `
        <section class="firmware-yaml-panel" data-firmware-yaml>
            <div class="firmware-yaml-header">
                <h4>ESPHome YAML</h4>
                <div class="firmware-yaml-actions">
                    <button type="button" class="btn btn-secondary" data-yaml-copy>Copy YAML</button>
                    <button type="button" class="btn btn-secondary" data-yaml-download>Download YAML</button>
                </div>
            </div>
            <pre class="firmware-yaml-code"><code>${escapeHtml(yaml)}</code></pre>
            <p class="firmware-yaml-meta">${escapeHtml(infoLine)}</p>
        </section>
    `;
}

function formatVariantHeadingLabel(bucket) {
    if (!bucket) {
        return '';
    }

    const variantLabel = (bucket.variant || '').trim();
    const sensorAddonLabel = (bucket.sensorAddon || '').trim();

    if (variantLabel && sensorAddonLabel) {
        return `${variantLabel} (${sensorAddonLabel})`;
    }

    if (variantLabel) {
        return variantLabel;
    }

    if (sensorAddonLabel) {
        return sensorAddonLabel;
    }

    return 'Base Firmware';
}

function renderModelBucketSections(buckets) {
    if (!(buckets instanceof Map) || buckets.size === 0) {
        return '';
    }

    const sections = [];

    buckets.forEach((bucketList, model) => {
        if (!Array.isArray(bucketList) || bucketList.length === 0) {
            return;
        }

        const variantSections = bucketList
            .map((bucket, bucketIndex) => {
                if (!bucket || !Array.isArray(bucket.builds) || bucket.builds.length === 0) {
                    return '';
                }

                const headingLabel = formatVariantHeadingLabel(bucket);
                const buildsHtml = bucket.builds
                    .map((build, buildIndex) => createFirmwareCardHtml(build, {
                        configString: build.config_string || '',
                        contextKey: `bucket-${model}-${bucketIndex}-${buildIndex}`,
                        cardClassName: 'firmware-card firmware-card--bucket'
                    }))
                    .join('');

                const variantAttributes = [
                    `class="firmware-bucket-group"`,
                    `data-model="${escapeHtml(model)}"`
                ];

                if (bucket.variant) {
                    variantAttributes.push(`data-variant="${escapeHtml(bucket.variant)}"`);
                }

                if (bucket.sensorAddon) {
                    variantAttributes.push(`data-sensor-addon="${escapeHtml(bucket.sensorAddon)}"`);
                }

                return `
                    <div ${variantAttributes.join(' ')}>
                        <h4 class="firmware-bucket-title">${escapeHtml(headingLabel)}</h4>
                        <div class="firmware-bucket-items">${buildsHtml}</div>
                    </div>
                `;
            })
            .filter(Boolean)
            .join('');

        if (!variantSections) {
            return;
        }

        sections.push(`
            <section class="firmware-bucket" data-firmware-model="${escapeHtml(model)}">
                <h3 class="firmware-bucket-heading">${escapeHtml(model)}</h3>
                ${variantSections}
            </section>
        `);
    });

    return sections.join('');
}

function clearFirmwareOptions() {
    firmwareOptions = [];
    firmwareOptionsMap = new Map();
    currentFirmwareSelectionId = null;
    window.currentFirmware = null;
    additionalFirmwareBuckets = new Map();
    firmwareStatusMessage = null;

    if (firmwareVersionSelect) {
        firmwareVersionSelect.innerHTML = '';
        firmwareVersionSelect.value = '';
    }

    if (firmwareSelectorWrapper) {
        firmwareSelectorWrapper.hidden = true;
    }

    renderSelectedFirmware();
    updateFirmwareControls();
}

function setFirmwareOptions(builds, configString, modelBuckets = new Map()) {
    firmwareOptions = Array.isArray(builds) ? builds.slice() : [];
    firmwareOptionsMap = new Map();

    firmwareOptions.forEach(build => {
        firmwareOptionsMap.set(build.firmwareId, build);
    });

    additionalFirmwareBuckets = new Map();

    if (modelBuckets instanceof Map) {
        modelBuckets.forEach((bucketList, model) => {
            if (!Array.isArray(bucketList) || bucketList.length === 0) {
                return;
            }

            const clonedBuckets = bucketList.map(bucket => ({
                variant: bucket.variant || '',
                sensorAddon: bucket.sensorAddon || '',
                builds: Array.isArray(bucket.builds) ? bucket.builds.slice() : []
            }));

            clonedBuckets.forEach(bucket => {
                bucket.builds.forEach(build => {
                    firmwareOptionsMap.set(build.firmwareId, build);
                });
            });

            additionalFirmwareBuckets.set(model, clonedBuckets);
        });
    }

    if (configString) {
        window.currentConfigString = configString;
    }

    if (!firmwareOptions.length) {
        currentFirmwareSelectionId = null;
        window.currentFirmware = null;
    }

    renderFirmwareSelector();
    renderSelectedFirmware();
    updateFirmwareControls();
}

function getFirmwareId(build) {
    return `firmware-${build.manifestIndex}`;
}

function renderFirmwareSelector() {
    if (!firmwareVersionSelect || !firmwareSelectorWrapper) {
        return;
    }

    firmwareVersionSelect.innerHTML = '';

    if (!firmwareOptions.length) {
        firmwareSelectorWrapper.hidden = true;
        return;
    }

    firmwareOptions.forEach(build => {
        const option = document.createElement('option');
        const channelInfo = getChannelDisplayInfo(build.channel);
        const versionLabel = build.version ? `v${build.version}` : 'Unknown version';
        option.value = build.firmwareId;
        option.textContent = `${versionLabel} · ${channelInfo.label}`;
        firmwareVersionSelect.appendChild(option);
    });

    firmwareSelectorWrapper.hidden = false;

    let selectedValue = currentFirmwareSelectionId || '';
    if (selectedValue) {
        const optionExists = Array.from(firmwareVersionSelect.options).some(option => option.value === selectedValue);
        if (!optionExists) {
            selectedValue = '';
        }
    }

    if (!selectedValue) {
        selectedValue = firmwareVersionSelect.options[0]?.value ?? '';
    }

    if (selectedValue) {
        firmwareVersionSelect.value = selectedValue;
        if (currentFirmwareSelectionId !== selectedValue) {
            currentFirmwareSelectionId = selectedValue;
        }
    } else {
        firmwareVersionSelect.value = '';
    }
}

function selectFirmwareById(firmwareId, { updateConfigString = true, syncSelector = true, renderDetails = true } = {}) {
    if (!firmwareId || !firmwareOptionsMap.has(firmwareId)) {
        return;
    }

    const firmware = firmwareOptionsMap.get(firmwareId);
    const isPrimaryOption = firmwareOptions.some(option => option.firmwareId === firmwareId);

    if (isPrimaryOption) {
        currentFirmwareSelectionId = firmwareId;
    }

    window.currentFirmware = firmware;
    firmwareStatusMessage = null;

    if (updateConfigString) {
        if (firmware.config_string) {
            window.currentConfigString = firmware.config_string;
        } else if (!isPrimaryOption) {
            window.currentConfigString = null;
        }
    }

    if (syncSelector && firmwareVersionSelect && isPrimaryOption) {
        const optionExists = Array.from(firmwareVersionSelect.options).some(option => option.value === firmwareId);
        if (optionExists) {
            firmwareVersionSelect.value = firmwareId;
        }
    }

    if (renderDetails) {
        renderSelectedFirmware();
    }

    updateFirmwareControls();
}

function selectDefaultFirmware() {
    if (!firmwareOptions.length) {
        currentFirmwareSelectionId = null;
        window.currentFirmware = null;
        renderSelectedFirmware();
        updateFirmwareControls();
        return;
    }

    selectFirmwareById(firmwareOptions[0].firmwareId);
}

function renderSelectedFirmware() {
    const container = document.getElementById('compatible-firmware');
    if (!container) {
        return;
    }

    const firmware = window.currentFirmware;

    const sections = [];

    if (firmware) {
        const configContext = firmware.config_string || window.currentConfigString || '';
        sections.push(createFirmwareCardHtml(firmware, { configString: configContext, contextKey: 'primary' }));

        if (currentFirmwareYamlDownloadUrl) {
            URL.revokeObjectURL(currentFirmwareYamlDownloadUrl);
            currentFirmwareYamlDownloadUrl = null;
        }

        const yamlResult = generateEsphomeYaml({
            firmware,
            configString: configContext,
            manifest: manifestData
        });

        if (yamlResult?.yaml && yamlResult.yaml.trim()) {
            window.currentFirmwareYaml = {
                yaml: yamlResult.yaml,
                context: yamlResult.context
            };
            sections.push(createFirmwareYamlPanel(window.currentFirmwareYaml));
        } else {
            window.currentFirmwareYaml = null;
        }
    } else if (firmwareStatusMessage?.type === 'not-available' && firmwareStatusMessage.configString) {
        window.currentFirmwareYaml = null;
        if (currentFirmwareYamlDownloadUrl) {
            URL.revokeObjectURL(currentFirmwareYamlDownloadUrl);
            currentFirmwareYamlDownloadUrl = null;
        }
        const sanitizedConfig = escapeHtml(firmwareStatusMessage.configString);
        sections.push(`
            <div class="firmware-not-available">
                <h4>Firmware Not Available</h4>
                <p>The firmware for this configuration has not been built yet:</p>
                <p class="config-string">Sense360-${sanitizedConfig}-v1.0.0-stable.bin</p>
                <p class="help-text">Please contact support or check back later for this specific configuration.</p>
            </div>
        `);
    } else if (firmwareStatusMessage?.type === 'error' && firmwareStatusMessage.message) {
        window.currentFirmwareYaml = null;
        if (currentFirmwareYamlDownloadUrl) {
            URL.revokeObjectURL(currentFirmwareYamlDownloadUrl);
            currentFirmwareYamlDownloadUrl = null;
        }
        sections.push(`
            <div class="firmware-error">
                <h4>Error Loading Firmware</h4>
                <p>${escapeHtml(firmwareStatusMessage.message)}</p>
            </div>
        `);
    } else {
        window.currentFirmwareYaml = null;
        if (currentFirmwareYamlDownloadUrl) {
            URL.revokeObjectURL(currentFirmwareYamlDownloadUrl);
            currentFirmwareYamlDownloadUrl = null;
        }
        sections.push(`
            <div class="firmware-selection-placeholder">
                <p>Select a firmware release to see details.</p>
            </div>
        `);
    }

    const bucketHtml = renderModelBucketSections(additionalFirmwareBuckets);
    if (bucketHtml) {
        sections.push(`
            <div class="firmware-buckets-wrapper">
                ${bucketHtml}
            </div>
        `);
    }

    container.innerHTML = sections.join('');

    attachInstallButtonListeners();
    attachYamlActionHandlers();
}

async function findCompatibleFirmware() {
    clearFirmwareOptions();

    if (!configuration.mounting || !configuration.power) {
        window.currentConfigString = null;
        if (firmwareSelectorWrapper) {
            firmwareSelectorWrapper.hidden = true;
        }
        document.getElementById('compatible-firmware').innerHTML = `
            <div class="firmware-error">
                <h4>Incomplete Configuration</h4>
                <p>Please select both a mounting location and power option before checking firmware compatibility.</p>
            </div>
        `;
        updateFirmwareControls();
        attachInstallButtonListeners();
        return;
    }

    const previousConfigString = window.currentConfigString;
    let configString = '';

    configString += `${configuration.mounting.charAt(0).toUpperCase() + configuration.mounting.slice(1)}`;
    configString += `-${configuration.power.toUpperCase()}`;

    configString += formatConfigSegment('airiq', configuration.airiq);
    configString += formatConfigSegment('presence', configuration.presence);
    configString += formatConfigSegment('comfort', configuration.comfort);
    configString += formatConfigSegment('fan', configuration.fan);

    if (previousConfigString !== configString) {
        setChecklistCompletion(false);
    } else {
        syncChecklistCompletion();
    }

    window.currentConfigString = configString;

    // Load manifest to check if firmware exists
    try {
        await loadManifestData();

        const { configGroups, modelBuckets } = groupBuildsByConfig(manifestBuildsWithIndex);
        const sortedBuilds = sortBuildsByChannelAndVersion(configGroups.get(configString) || []);

        const bucketMap = new Map();
        modelBuckets.forEach((variantMap, model) => {
            const entries = Array.from(variantMap.values())
                .map(bucket => ({
                    variant: bucket.variant,
                    sensorAddon: bucket.sensorAddon,
                    builds: sortBuildsByChannelAndVersion(bucket.builds)
                }))
                .filter(bucket => Array.isArray(bucket.builds) && bucket.builds.length > 0);

            if (!entries.length) {
                return;
            }

            entries.sort((a, b) => {
                const labelA = formatVariantHeadingLabel(a).toLowerCase();
                const labelB = formatVariantHeadingLabel(b).toLowerCase();
                return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'base' });
            });

            bucketMap.set(model, entries);
        });

        if (sortedBuilds.length) {
            firmwareStatusMessage = null;
            setFirmwareOptions(sortedBuilds, configString, bucketMap);
            selectDefaultFirmware();
        } else {
            firmwareStatusMessage = { type: 'not-available', configString };
            setFirmwareOptions([], configString, bucketMap);
        }
    } catch (error) {
        console.error('Error loading manifest:', error);
        firmwareStatusMessage = {
            type: 'error',
            message: 'Unable to check firmware availability. Please try again later.'
        };
        setFirmwareOptions([], configString);
    }
}

if (firmwareVersionSelect) {
    firmwareVersionSelect.addEventListener('change', event => {
        const firmwareId = event.target.value;
        if (firmwareId) {
            selectFirmwareById(firmwareId, { syncSelector: false });
        }
    });
}

async function toggleReleaseNotes(event) {
    event.preventDefault();
    const link = event.currentTarget;
    if (!link) {
        return;
    }

    const notesId = link.dataset.releaseNotesId || link.dataset.notesId;
    if (!notesId) {
        return;
    }

    const notesSection = document.getElementById(notesId);
    if (!notesSection) {
        return;
    }

    const firmwareId = link.dataset.firmwareId;
    if (firmwareId) {
        selectFirmwareById(firmwareId, { updateConfigString: false, renderDetails: false });
    }

    const isHidden = notesSection.style.display === 'none' || notesSection.style.display === '';
    if (isHidden) {
        notesSection.style.display = 'block';
        link.textContent = 'Hide Release Notes';

        if (notesSection.dataset.loaded !== 'true') {
            await loadReleaseNotes({
                notesSection,
                firmwareId: firmwareId || (window.currentFirmware?.firmwareId ?? '')
            });
        }
    } else {
        notesSection.style.display = 'none';
        link.textContent = 'View Release Notes';
    }
}

function buildReleaseNotesPathFromPart(partPath, channel) {
    if (!partPath) {
        return '';
    }

    const releaseNotesChannel = resolveReleaseNotesChannel(channel);
    const lastSlashIndex = partPath.lastIndexOf('/');
    const directory = lastSlashIndex >= 0 ? partPath.substring(0, lastSlashIndex + 1) : '';
    const fileName = lastSlashIndex >= 0 ? partPath.substring(lastSlashIndex + 1) : partPath;

    if (!fileName.endsWith('.bin')) {
        return '';
    }

    const baseName = fileName.substring(0, fileName.length - 4);
    const lastHyphenIndex = baseName.lastIndexOf('-');
    if (lastHyphenIndex === -1) {
        return '';
    }

    const prefix = baseName.substring(0, lastHyphenIndex);
    const channelSuffix = releaseNotesChannel ? `-${releaseNotesChannel}` : '';

    return `${directory}${prefix}${channelSuffix}.md`;
}

async function loadReleaseNotes({ notesSection, firmwareId }) {
    if (!notesSection) {
        return;
    }

    const contentContainer = notesSection.querySelector('.release-notes-content');
    if (!contentContainer) {
        return;
    }

    const firmware = (firmwareId && firmwareOptionsMap.get(firmwareId)) || window.currentFirmware;
    const channelInfo = getChannelDisplayInfo(firmware?.channel);

    const showFallbackMessage = (message) => {
        const fallback = document.createElement('p');
        fallback.className = 'no-notes';
        fallback.textContent = message;
        contentContainer.replaceChildren(fallback);
    };

    if (!firmware || !firmware.version) {
        showFallbackMessage(channelInfo.notesFallback);
        notesSection.dataset.loaded = 'true';
        return;
    }

    const primaryPartPath = Array.isArray(firmware.parts) && firmware.parts.length > 0
        ? firmware.parts[0].path
        : '';

    const notesPath = buildReleaseNotesPathFromPart(primaryPartPath, firmware.channel);

    if (!notesPath) {
        showFallbackMessage(channelInfo.notesFallback);
        notesSection.dataset.loaded = 'true';
        return;
    }

    try {
        const response = await fetch(notesPath);

        if (response.ok) {
            const markdown = await response.text();
            const lines = markdown.split('\n');
            const fragment = document.createDocumentFragment();

            let currentList = null;
            let currentParagraph = null;

            const closeParagraph = () => {
                currentParagraph = null;
            };

            const closeList = () => {
                currentList = null;
            };

            lines.forEach(rawLine => {
                const line = rawLine.trim();

                if (line === '') {
                    closeParagraph();
                    closeList();
                    return;
                }

                const isHeader = line.startsWith('# ')
                    || line.startsWith('## ')
                    || line.startsWith('### ');
                const isListItem = line.startsWith('- ');

                if (isHeader) {
                    closeParagraph();
                    closeList();

                    let headerElement = null;
                    if (line.startsWith('### ')) {
                        headerElement = document.createElement('h4');
                        headerElement.textContent = line.substring(4);
                    } else if (line.startsWith('## ')) {
                        headerElement = document.createElement('h3');
                        headerElement.textContent = line.substring(3);
                    } else if (line.startsWith('# ')) {
                        headerElement = document.createElement('h2');
                        headerElement.textContent = line.substring(2);
                    }

                    if (headerElement) {
                        fragment.appendChild(headerElement);
                    }

                    return;
                }

                if (isListItem) {
                    closeParagraph();

                    if (!currentList) {
                        currentList = document.createElement('ul');
                        fragment.appendChild(currentList);
                    }

                    const listItem = document.createElement('li');
                    listItem.textContent = line.substring(2);
                    currentList.appendChild(listItem);
                    return;
                }

                closeList();

                if (!currentParagraph) {
                    currentParagraph = document.createElement('p');
                    fragment.appendChild(currentParagraph);
                    currentParagraph.textContent = line;
                } else {
                    currentParagraph.textContent = `${currentParagraph.textContent} ${line}`.trim();
                }
            });

            contentContainer.replaceChildren(fragment);
        } else {
            showFallbackMessage(channelInfo.notesFallback);
        }
    } catch (error) {
        console.error('Error loading release notes:', error);
        const errorMessage = document.createElement('p');
        errorMessage.className = 'error';
        errorMessage.textContent = 'Unable to load release notes.';
        contentContainer.replaceChildren(errorMessage);
    } finally {
        notesSection.dataset.loaded = 'true';
    }
}

const MULTI_PART_MODAL_ID = 'multi-part-download-modal';

let multiPartModalElements = null;
let multiPartModalRestoreFocus = null;

function formatFirmwareOffset(offset) {
    if (!Number.isFinite(offset)) {
        return null;
    }

    const hex = Math.max(0, Math.trunc(offset)).toString(16).toUpperCase();
    const padded = hex.padStart(Math.max(6, hex.length), '0');
    return `0x${padded}`;
}

function getFirmwarePartsMetadata(firmware) {
    if (!firmware || !Array.isArray(firmware.parts) || firmware.parts.length === 0) {
        return [];
    }

    return firmware.parts
        .map((part, index) => {
            const path = typeof part?.path === 'string' ? part.path.trim() : '';
            if (!path) {
                return null;
            }

            let resolvedUrl = path;
            try {
                resolvedUrl = new URL(path, window.location.href).href;
            } catch (error) {
                console.warn('Unable to resolve firmware part URL:', error);
            }

            const fileName = path.split('/').filter(Boolean).pop() || `firmware-part-${index + 1}.bin`;
            const offsetValue = Number(part?.offset);
            const offset = Number.isFinite(offsetValue) ? Math.trunc(offsetValue) : null;
            const offsetHex = formatFirmwareOffset(offset);

            return {
                index,
                path,
                resolvedUrl,
                fileName,
                offset,
                offsetHex
            };
        })
        .filter(Boolean);
}

function buildFirmwarePartsClipboardText(parts) {
    if (!Array.isArray(parts) || parts.length === 0) {
        return '';
    }

    return parts
        .map(part => {
            const offsetLabel = part.offsetHex ? part.offsetHex : 'offset unknown';
            return `${part.fileName} @ ${offsetLabel} -> ${part.resolvedUrl}`;
        })
        .join('\n');
}

function getResolvedFirmwareUrl() {
    const parts = getFirmwarePartsMetadata(window.currentFirmware);
    if (!parts.length) {
        return null;
    }

    const [primaryPart] = parts;
    return primaryPart?.resolvedUrl || null;
}

function ensureMultiPartModalElements() {
    if (multiPartModalElements) {
        return multiPartModalElements;
    }

    const backdrop = document.getElementById(MULTI_PART_MODAL_ID);
    if (!backdrop) {
        return null;
    }

    const modal = backdrop.querySelector('.multi-part-modal');
    const list = backdrop.querySelector('[data-multi-part-list]');
    const copyButton = backdrop.querySelector('[data-multi-part-copy]');
    const closeButtons = Array.from(backdrop.querySelectorAll('[data-multi-part-close]'));

    multiPartModalElements = {
        backdrop,
        modal,
        list,
        copyButton,
        closeButtons,
        currentParts: []
    };

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            closeMultiPartModal();
        });
    });

    backdrop.addEventListener('click', event => {
        if (event.target === backdrop) {
            closeMultiPartModal();
        }
    });

    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            if (!multiPartModalElements?.currentParts?.length) {
                return;
            }
            await copyFirmwarePartsToClipboard(multiPartModalElements.currentParts);
        });
    }

    return multiPartModalElements;
}

function renderMultiPartModalContent(firmware, parts) {
    const elements = ensureMultiPartModalElements();
    if (!elements || !elements.list) {
        return;
    }

    const listItems = parts
        .map(part => {
            const offsetLabel = part.offsetHex ? `Offset ${part.offsetHex}` : 'Offset not specified';
            const downloadName = part.fileName || getFirmwareDisplayName(firmware, window.currentConfigString || '');

            return `
                <li class="multi-part-modal__item">
                    <div class="multi-part-modal__item-info">
                        <span class="multi-part-modal__item-name">${escapeHtml(part.fileName)}</span>
                        <span class="multi-part-modal__item-offset">${escapeHtml(offsetLabel)}</span>
                    </div>
                    <div class="multi-part-modal__item-actions">
                        <a href="${escapeHtml(part.resolvedUrl)}" download="${escapeHtml(downloadName)}">Download</a>
                    </div>
                </li>
            `;
        })
        .join('');

    elements.list.innerHTML = listItems;
}

function openMultiPartModal(firmware, parts) {
    if (!Array.isArray(parts) || parts.length === 0) {
        return;
    }

    const elements = ensureMultiPartModalElements();
    if (!elements || !elements.backdrop) {
        return;
    }

    renderMultiPartModalContent(firmware, parts);
    elements.currentParts = parts;

    multiPartModalRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    elements.backdrop.hidden = false;

    const focusTarget = elements.copyButton
        || elements.list?.querySelector('a')
        || elements.closeButtons?.[0]
        || null;

    if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
    }

    if (!elements.keydownHandler) {
        elements.keydownHandler = event => {
            if (event.key === 'Escape') {
                closeMultiPartModal();
            }
        };
    }

    document.addEventListener('keydown', elements.keydownHandler);
}

function closeMultiPartModal() {
    if (!multiPartModalElements || !multiPartModalElements.backdrop) {
        return;
    }

    multiPartModalElements.backdrop.hidden = true;
    if (multiPartModalElements.keydownHandler) {
        document.removeEventListener('keydown', multiPartModalElements.keydownHandler);
    }

    if (multiPartModalRestoreFocus && typeof multiPartModalRestoreFocus.focus === 'function') {
        multiPartModalRestoreFocus.focus();
    }

    multiPartModalRestoreFocus = null;
}

async function copyFirmwarePartsToClipboard(parts) {
    if (!navigator.clipboard) {
        showToast('Copy not supported');
        return false;
    }

    const clipboardText = buildFirmwarePartsClipboardText(parts);
    if (!clipboardText) {
        showToast('Nothing to copy');
        return false;
    }

    try {
        await navigator.clipboard.writeText(clipboardText);
        const label = parts.length === 1 ? 'link' : 'links';
        showToast(`Copied ${parts.length} ${label}`);
        return true;
    } catch (error) {
        console.error('Failed to copy firmware URLs:', error);
        showToast('Copy failed');
        return false;
    }
}

async function handleYamlCopy(event) {
    if (event) {
        event.preventDefault();
    }

    const yaml = window.currentFirmwareYaml?.yaml;
    if (!yaml || !yaml.trim()) {
        showToast('Nothing to copy');
        return;
    }

    if (!navigator.clipboard) {
        showToast('Copy not supported');
        return;
    }

    try {
        await navigator.clipboard.writeText(yaml);
        showToast('YAML copied to clipboard');
    } catch (error) {
        console.error('Failed to copy YAML snippet:', error);
        showToast('Copy failed');
    }
}

function handleYamlDownload(event) {
    if (event) {
        event.preventDefault();
    }

    const yamlPayload = window.currentFirmwareYaml;
    const yaml = yamlPayload?.yaml;
    if (!yaml || !yaml.trim()) {
        showToast('Nothing to download');
        return;
    }

    if (currentFirmwareYamlDownloadUrl) {
        URL.revokeObjectURL(currentFirmwareYamlDownloadUrl);
        currentFirmwareYamlDownloadUrl = null;
    }

    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    currentFirmwareYamlDownloadUrl = url;

    const link = document.createElement('a');
    link.href = url;
    link.download = yamlPayload?.context?.yamlFileName || 'sense360-firmware.yaml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
        if (currentFirmwareYamlDownloadUrl === url) {
            URL.revokeObjectURL(url);
            currentFirmwareYamlDownloadUrl = null;
        }
    }, 1000);

    showToast('YAML download started');
}

async function copyFirmwareUrl() {
    const firmware = window.currentFirmware;
    const parts = getFirmwarePartsMetadata(firmware);

    if (!parts.length) {
        showToast('Nothing to copy');
        return;
    }

    if (parts.length > 1) {
        openMultiPartModal(firmware, parts);

        if (!navigator.clipboard) {
            showToast('Copy not supported');
            return;
        }

        await copyFirmwarePartsToClipboard(parts);
    } else {
        if (!navigator.clipboard) {
            showToast('Copy not supported');
            return;
        }

        const firmwareUrl = parts[0].resolvedUrl;
        if (!firmwareUrl) {
            showToast('Nothing to copy');
            return;
        }

        try {
            await navigator.clipboard.writeText(firmwareUrl);
            showToast('Copied');
        } catch (error) {
            console.error('Failed to copy firmware URL:', error);
            showToast('Copy failed');
        }
    }

    const copyUrlBtn = document.getElementById('copy-firmware-url-btn');
    if (copyUrlBtn) {
        copyUrlBtn.blur();
    }
}

function showToast(message, options = {}) {
    const { duration = 2000 } = options;
    let toast = document.getElementById('app-toast');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.className = 'app-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
    }

    toastTimeoutId = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, duration);
}

function downloadFirmware() {
    const firmware = window.currentFirmware;
    const parts = getFirmwarePartsMetadata(firmware);

    if (!parts.length) {
        return;
    }

    if (parts.length > 1) {
        openMultiPartModal(firmware, parts);
        return;
    }

    const [primaryPart] = parts;
    if (!primaryPart?.resolvedUrl) {
        return;
    }

    const link = document.createElement('a');
    link.href = primaryPart.resolvedUrl;
    link.download = getFirmwareDisplayName(firmware, window.currentConfigString || '') || primaryPart.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function initializeFromUrl() {
    const { parsedConfig, providedKeys, parsedStep, hasParams } = parseConfigurationFromLocation();

    const shouldRestoreRememberedState = Boolean(rememberChoices && rememberedState && !hasParams);
    const initialConfig = shouldRestoreRememberedState ? rememberedState.configuration : parsedConfig;

    applyConfiguration(initialConfig);

    const maxStep = getMaxReachableStep();
    let targetStep;

    if (shouldRestoreRememberedState) {
        if (typeof rememberedState.currentStep === 'number') {
            targetStep = Math.min(rememberedState.currentStep, maxStep);
        } else if (!configuration.mounting) {
            targetStep = 1;
        } else if (!configuration.power) {
            targetStep = 2;
        } else {
            targetStep = Math.min(4, maxStep);
        }
    } else if (parsedStep) {
        targetStep = Math.min(parsedStep, maxStep);
    } else if (!configuration.mounting) {
        targetStep = 1;
    } else if (!configuration.power) {
        targetStep = 2;
    } else if (['airiq', 'presence', 'comfort', 'fan'].some(key => providedKeys.has(key))) {
        targetStep = Math.min(4, maxStep);
    } else {
        targetStep = Math.min(3, maxStep);
    }

    setStep(targetStep, { skipUrlUpdate: true, animate: false });
}

function applyConfiguration(initialConfig) {
    Object.assign(configuration, defaultConfiguration, initialConfig);

    if (configuration.mounting !== 'wall') {
        configuration.fan = 'none';
    }

    if (configuration.mounting) {
        const mountingInput = document.querySelector(`input[name="mounting"][value="${configuration.mounting}"]`);
        if (mountingInput) {
            mountingInput.checked = true;
            document.querySelector('#step-1 .btn-next').disabled = false;
        }
    } else {
        document.querySelector('#step-1 .btn-next').disabled = true;
    }

    if (configuration.power) {
        const powerInput = document.querySelector(`input[name="power"][value="${configuration.power}"]`);
        if (powerInput) {
            powerInput.checked = true;
            document.querySelector('#step-2 .btn-next').disabled = false;
        }
    } else {
        document.querySelector('#step-2 .btn-next').disabled = true;
    }

    ['airiq', 'presence', 'comfort', 'fan'].forEach(key => {
        const value = configuration[key];
        const input = document.querySelector(`input[name="${key}"][value="${value}"]`);
        if (input) {
            input.checked = true;
        }
    });

    updateFanModuleVisibility();
    updateConfiguration({ skipUrlUpdate: true });
}

function getMaxReachableStep() {
    if (!configuration.mounting) {
        return 1;
    }

    if (!configuration.power) {
        return 2;
    }

    return 4;
}

function parseConfigurationFromLocation() {
    const combinedParams = new URLSearchParams();
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
    const hashParams = new URLSearchParams(hash);

    hashParams.forEach((value, key) => {
        combinedParams.set(key, value);
    });

    searchParams.forEach((value, key) => {
        combinedParams.set(key, value);
    });

    const parsedConfig = { ...defaultConfiguration };
    const providedKeys = new Set();
    const hasParams = Array.from(combinedParams.keys()).length > 0;

    Object.keys(allowedOptions).forEach(key => {
        const value = combinedParams.get(key);
        if (value && allowedOptions[key].includes(value)) {
            parsedConfig[key] = value;
            providedKeys.add(key);
        }
    });

    let parsedStep = null;
    const stepValue = combinedParams.get('step');
    if (stepValue) {
        const numericStep = parseInt(stepValue, 10);
        if (!Number.isNaN(numericStep) && numericStep >= 1 && numericStep <= totalSteps) {
            parsedStep = numericStep;
        }
    }

    return { parsedConfig, providedKeys, parsedStep, hasParams };
}

function updateUrlFromConfiguration() {
    const params = new URLSearchParams();

    if (configuration.mounting) {
        params.set('mounting', configuration.mounting);
    }

    if (configuration.power) {
        params.set('power', configuration.power);
    }

    params.set('airiq', configuration.airiq || 'none');
    params.set('presence', configuration.presence || 'none');
    params.set('comfort', configuration.comfort || 'none');

    if (configuration.mounting === 'wall') {
        params.set('fan', configuration.fan || 'none');
    } else {
        params.set('fan', 'none');
    }

    params.set('step', String(currentStep));

    const paramString = params.toString();
    const newUrl = paramString ? `${window.location.pathname}?${paramString}` : window.location.pathname;
    history.replaceState(null, '', newUrl);
    persistWizardState();
}

window.nextStep = nextStep;
window.previousStep = previousStep;
window.downloadFirmware = downloadFirmware;
window.copyFirmwareUrl = copyFirmwareUrl;
window.toggleReleaseNotes = toggleReleaseNotes;

export const __testHooks = Object.freeze({
    initializeWizard,
    loadManifestData,
    findCompatibleFirmware,
    manifestReadyPromise: () => manifestReadyPromise,
    isManifestReady,
    renderSelectedFirmware,
    getFirmwarePartsMetadata
});
