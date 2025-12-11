import { escapeHtml } from './utils/escape-html.js';
import { normalizeChannelKey } from './utils/channel-alias.js';
import { MODULE_REQUIREMENT_MATRIX, getModuleMatrixEntry, getModuleVariantEntry } from './data/module-requirements.js';
import { parseConfigParams, mapToWizardConfiguration } from './utils/url-config.js';
import { recordFlashStart, recordFlashSuccess, recordFlashError, exportFlashHistoryText } from './utils/flash-history.js';
// Import error logging service early to capture all errors including manifest load failures
import './services/error-log.js';

let currentStep = 1;
const totalSteps = 4;

function updateBottomDetailsVisibility(step) {
    const summaryElements = [
        document.querySelector('.module-step-grid__summary'),
        document.querySelector('[data-option-details-bottom]')
    ].filter(Boolean);

    if (!summaryElements.length) {
        return;
    }

    const shouldShow = step === 4;
    const ariaHiddenValue = shouldShow ? 'false' : 'true';

    summaryElements.forEach(element => {
        element.hidden = !shouldShow;
        element.setAttribute('aria-hidden', ariaHiddenValue);
    });
}

function getTotalSteps() {
    return totalSteps;
}
const defaultConfiguration = {
    mounting: null,
    power: null,
    bathroom: false,
    airiq: 'none',
    bathroomairiq: 'none',
    presence: 'none',
    comfort: 'none',
    fan: 'none',
    voice: 'none',
    bathroomairiq: 'none'
};
const configuration = { ...defaultConfiguration };
const allowedOptions = {
    mounting: ['wall', 'ceiling'],
    power: ['usb', 'poe', 'pwr'],
    bathroom: [false, true],
    airiq: ['none', 'base', 'pro'],
    bathroomairiq: ['none', 'base'],
    presence: ['none', 'base', 'pro'],
    comfort: ['none', 'base'],
    fan: ['none', 'pwm', 'analog'],
    voice: ['none', 'base'],
    bathroomairiq: ['none', 'base', 'pro']
};

const MOUNT_LABELS = Object.freeze({
    wall: 'Wall mount',
    ceiling: 'Ceiling mount'
});

const POWER_LABELS = Object.freeze({
    usb: 'USB power',
    poe: 'PoE module',
    pwr: 'PWR module'
});

const MODULE_VARIANT_LABELS = Object.freeze({
    airiq: Object.freeze({
        base: 'AirIQ Base module',
        pro: 'AirIQ Pro module'
    }),
    bathroomairiq: Object.freeze({
        base: 'Bathroom AirIQ Base module'
    }),
    presence: Object.freeze({
        base: 'Presence Base module',
        pro: 'Presence Pro module'
    }),
    comfort: Object.freeze({
        base: 'Comfort Base module'
    }),
    fan: Object.freeze({
        pwm: 'Fan PWM module',
        analog: 'Fan Analog module'
    }),
    voice: Object.freeze({
        base: 'Voice Base module'
    }),
    bathroomairiq: Object.freeze({
        base: 'Bathroom AirIQ Base module',
        pro: 'Bathroom AirIQ Pro module'
    })
});

const MODULE_KEYS = ['airiq', 'presence', 'comfort', 'fan', 'voice', 'bathroomairiq'];
const MODULE_LABELS = {
    airiq: 'AirIQ',
    bathroomairiq: 'Bathroom AirIQ',
    presence: 'Presence',
    comfort: 'Comfort',
    fan: 'Fan',
    voice: 'Voice',
    bathroomairiq: 'Bathroom AirIQ'
};

const MODULE_SEGMENT_FORMATTERS = {
    airiq: value => `AirIQ${value.charAt(0).toUpperCase() + value.slice(1)}`,
    bathroomairiq: value => `BathroomAirIQ${value === 'base' ? '' : value.charAt(0).toUpperCase() + value.slice(1)}`,
    presence: value => `Presence${value === 'base' ? '' : value.charAt(0).toUpperCase() + value.slice(1)}`,
    comfort: value => `Comfort${value === 'base' ? '' : value.charAt(0).toUpperCase() + value.slice(1)}`,
    fan: value => `Fan${value.toUpperCase()}`,
    voice: value => 'Voice',
    bathroomairiq: value => `BathroomAirIQ${value.charAt(0).toUpperCase() + value.slice(1)}`
};

let activeModuleGroupKey = null;

let moduleDetailPanelElement = null;
let moduleDetailPanelInitialized = false;
let activeModuleDetailKey = null;
let activeModuleDetailVariant = null;
let preFlashAcknowledged = false;
let currentFlashEntryId = null;
let flashStartTime = null;

function setWizardStepVisibility(stepElement, isVisible) {
    if (!stepElement) {
        return;
    }

    stepElement.hidden = !isVisible;
    stepElement.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
}

function updateWizardStepVisibility(activeStepNumber, { exclude = null } = {}) {
    const steps = Array.from(document.querySelectorAll('.wizard-step'));

    if (!steps.length) {
        return;
    }

    const excludedSteps = Array.isArray(exclude)
        ? exclude.filter(Boolean)
        : exclude
            ? [exclude]
            : [];

    steps.forEach(step => {
        const stepId = step.id || '';
        const stepNumber = Number(stepId.replace('step-', ''));
        const isActive = stepNumber === activeStepNumber;

        if (isActive) {
            setWizardStepVisibility(step, true);
            return;
        }

        if (excludedSteps.includes(step)) {
            return;
        }

        setWizardStepVisibility(step, false);
    });
}

function setPreFlashAcknowledgement(value) {
    preFlashAcknowledged = Boolean(value);
    updateFirmwareControls();
}

function resetPreFlashAcknowledgement() {
    const control = document.querySelector('[data-preflash-acknowledge]');

    if (control) {
        if ('checked' in control) {
            control.checked = false;
        }

        if (control.hasAttribute('aria-pressed')) {
            control.setAttribute('aria-pressed', 'false');
        }
    }

    setPreFlashAcknowledgement(false);
}

function applyModuleRecommendations() {
    Object.entries(MODULE_REQUIREMENT_MATRIX).forEach(([moduleKey, moduleEntry]) => {
        if (!moduleEntry || !moduleEntry.variants) {
            return;
        }

        Object.entries(moduleEntry.variants).forEach(([variantKey, variantEntry]) => {
            if (!variantEntry?.recommended) {
                return;
            }

            const selector = `label[data-module-card="${moduleKey}"][data-variant="${variantKey}"]`;
            const moduleCard = document.querySelector(selector);
            if (!moduleCard) {
                return;
            }

            if (moduleCard.querySelector('[data-recommended-chip]')) {
                return;
            }

            const header = moduleCard.querySelector('.module-card__header');
            if (!header) {
                return;
            }

            const chip = document.createElement('span');
            chip.className = 'module-card__chip';
            chip.dataset.recommendedChip = '';
            chip.textContent = 'Recommended';

            const stateElement = header.querySelector('.module-card__state');
            if (stateElement?.parentNode === header) {
                header.insertBefore(chip, stateElement);
            } else {
                header.appendChild(chip);
            }
        });
    });
}

function getDefaultState() {
    return {
        ...defaultConfiguration,
        mount: defaultConfiguration.mounting
    };
}

function getState() {
    return {
        ...configuration,
        mount: configuration.mounting
    };
}

function normalizeStateForConfiguration(state = {}) {
    if (!state || typeof state !== 'object') {
        return {};
    }

    const { mount, ...rest } = state;
    const normalized = { ...rest };

    if (mount !== undefined) {
        normalized.mounting = mount;
    }

    return normalized;
}

function setState(newState = {}, options = {}) {
    const normalizedState = normalizeStateForConfiguration(newState);
    applyConfiguration(normalizedState);

    if (!options.skipUrlUpdate) {
        updateUrlFromConfiguration();
    }

    return getState();
}

function replaceState(newState = {}, options = {}) {
    const mergedOptions = { skipUrlUpdate: true, ...options };
    return setState(newState, mergedOptions);
}

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

function ensureModuleDetailPanelElement() {
    if (moduleDetailPanelElement) {
        return moduleDetailPanelElement;
    }

    moduleDetailPanelElement = document.getElementById('module-requirements-panel');
    return moduleDetailPanelElement;
}

function formatHeaderList(headers = []) {
    const items = headers.filter(item => typeof item === 'string' && item.trim().length > 0);
    if (items.length === 0) {
        return '';
    }

    if (items.length === 1) {
        return items[0];
    }

    const initial = items.slice(0, -1);
    const last = items[items.length - 1];
    return `${initial.join(', ')} and ${last}`;
}

function isConflictActiveForConfig(conflict, state) {
    if (!conflict || !conflict.module) {
        return false;
    }

    const currentValue = state?.[conflict.module];
    if (!currentValue || currentValue === 'none') {
        return false;
    }

    if (Array.isArray(conflict.variants) && conflict.variants.length > 0) {
        return conflict.variants.includes(currentValue);
    }

    return true;
}

function formatConflictBadgeLabel(conflict) {
    const moduleKey = (conflict?.module || '').toString().trim();
    if (!moduleKey) {
        return 'Conflict';
    }

    const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;
    const variants = Array.isArray(conflict?.variants) ? conflict.variants.filter(Boolean) : [];

    if (!variants.length) {
        return moduleLabel;
    }

    const variantLabels = variants.map(variant => {
        if (moduleKey === 'fan') {
            return variant.toUpperCase();
        }
        if (variant === 'none') {
            return 'None';
        }
        return variant.charAt(0).toUpperCase() + variant.slice(1);
    });

    const uniqueLabels = Array.from(new Set(variantLabels));
    return `${moduleLabel} ${uniqueLabels.join('/')}`;
}

function collectVariantConflictMeta(moduleKey, variantKey, variant) {
    const conflicts = Array.isArray(variant?.conflicts) ? variant.conflicts : [];
    if (!conflicts.length) {
        return [];
    }

    return conflicts.map(conflict => {
        const isActive = isConflictActiveForConfig(conflict, configuration);
        const badgeLabel = formatConflictBadgeLabel(conflict);

        let defaultMessage = conflict.message;
        if (!defaultMessage) {
            let targetVariant = configuration[conflict.module];
            if (Array.isArray(conflict.variants) && conflict.variants.length === 1) {
                targetVariant = conflict.variants[0];
            }
            defaultMessage = `Incompatible with ${formatModuleSelectionLabel(conflict.module, targetVariant || 'none')}.`;
        }

        const detail = conflict.detail || defaultMessage;
        const tooltip = conflict.detail || conflict.message || defaultMessage;

        return {
            badgeLabel,
            detail,
            tooltip,
            isActive,
            message: defaultMessage
        };
    });
}

function updateModuleConflictBadges() {
    const badges = document.querySelectorAll('[data-conflict-badge]');
    badges.forEach(badge => {
        const moduleKey = badge.getAttribute('data-conflict-module');
        if (!moduleKey) {
            return;
        }

        const variantsAttr = badge.getAttribute('data-conflict-variants') || '';
        const variants = variantsAttr.split(/\s+/).map(value => value.trim()).filter(Boolean);
        const conflict = { module: moduleKey };

        if (variants.length > 0) {
            conflict.variants = variants;
        }

        const isActive = isConflictActiveForConfig(conflict, configuration);
        badge.classList.toggle('is-active', isActive);
        badge.setAttribute('aria-hidden', String(!isActive));
    });
}

function renderModuleDetailPanel() {
    const panel = ensureModuleDetailPanelElement();
    if (!panel) {
        return;
    }

    if (!activeModuleDetailKey || !MODULE_REQUIREMENT_MATRIX[activeModuleDetailKey]) {
        panel.innerHTML = '<div class="module-requirements-panel__placeholder">Highlight a module option to see required core revisions, headers, and conflicts.</div>';
        return;
    }

    const moduleEntry = getModuleMatrixEntry(activeModuleDetailKey);
    if (!moduleEntry) {
        panel.innerHTML = '<div class="module-requirements-panel__placeholder">Highlight a module option to see required core revisions, headers, and conflicts.</div>';
        return;
    }

    const variants = moduleEntry.variants || {};
    const selectedVariant = configuration[activeModuleDetailKey] || 'none';
    const effectiveVariant = variants[activeModuleDetailVariant] ? activeModuleDetailVariant : selectedVariant;

    let header = panel.querySelector('.module-detail__header');
    let variantsContainer = panel.querySelector('.module-detail__variants');

    if (!header || !variantsContainer) {
        panel.innerHTML = '';

        header = document.createElement('div');
        header.className = 'module-detail__header';

        const titleElement = document.createElement('h4');
        titleElement.className = 'module-detail__title';
        header.appendChild(titleElement);

        panel.appendChild(header);

        variantsContainer = document.createElement('div');
        variantsContainer.className = 'module-detail__variants';
        panel.appendChild(variantsContainer);
    }

    const titleElement = header.querySelector('.module-detail__title');
    if (titleElement) {
        titleElement.textContent = moduleEntry.label || MODULE_LABELS[activeModuleDetailKey] || activeModuleDetailKey;
    }

    let summaryElement = header.querySelector('.module-detail__summary');
    if (moduleEntry.summary) {
        if (!summaryElement) {
            summaryElement = document.createElement('p');
            summaryElement.className = 'module-detail__summary';
            header.appendChild(summaryElement);
        }
        summaryElement.textContent = moduleEntry.summary;
    } else if (summaryElement) {
        summaryElement.remove();
    }

    variantsContainer.innerHTML = '';

    Object.entries(variants).forEach(([variantKey, variant]) => {
        const cardClasses = ['module-variant-card'];
        if (variantKey === effectiveVariant) {
            cardClasses.push('is-highlighted');
        }
        if (variantKey === selectedVariant) {
            cardClasses.push('is-selected');
        }

        const coreRevision = variant.coreRevision
            ? escapeHtml(variant.coreRevision)
            : '<span class="module-variant-card__meta-value module-variant-card__meta-value--muted">No additional requirement</span>';

        const headers = Array.isArray(variant.headers) && variant.headers.length > 0
            ? escapeHtml(formatHeaderList(variant.headers))
            : '<span class="module-variant-card__meta-value module-variant-card__meta-value--muted">No additional headers</span>';

        const conflictMeta = collectVariantConflictMeta(activeModuleDetailKey, variantKey, variant);

        const badgesHtml = conflictMeta.length > 0
            ? `<div class="module-variant-card__badges">${conflictMeta.map(meta => `
                <span class="module-variant-card__badge${meta.isActive ? ' is-active' : ''}" title="${escapeHtml(meta.tooltip)}">
                    ${escapeHtml(meta.badgeLabel)}
                </span>
            `).join('')}</div>`
            : '';

        const detailItems = [];
        if (variant.coreRevision) {
            detailItems.push(`Requires ${escapeHtml(variant.coreRevision)}.`);
        }
        if (Array.isArray(variant.headers) && variant.headers.length > 0) {
            detailItems.push(`Needs ${escapeHtml(formatHeaderList(variant.headers))}.`);
        }
        conflictMeta.forEach(meta => {
            if (meta.detail) {
                detailItems.push(escapeHtml(meta.detail));
            }
        });

        const hasDetails = detailItems.length > 0;
        const detailId = `module-variant-details-${activeModuleDetailKey}-${variantKey}`;
        const accordionHtml = hasDetails
            ? `<button type="button" class="module-variant-card__accordion" data-variant-accordion aria-expanded="false" aria-controls="${detailId}">Advanced details</button>`
            : '';

        const detailsHtml = hasDetails
            ? `<div class="module-variant-card__panel" id="${detailId}" hidden><ul class="module-variant-card__panel-list">${detailItems.map(item => `<li>${item}</li>`).join('')}</ul></div>`
            : '';

        const variantLabel = variant.label
            ? variant.label
            : formatModuleSelectionLabel(activeModuleDetailKey, variantKey);

        const cardHtml = `
            <article class="${cardClasses.join(' ')}">
                <div class="module-variant-card__header">
                    <span class="module-variant-card__title">${escapeHtml(variantLabel)}</span>
                </div>
                <div class="module-variant-card__meta">
                    <span><strong>Core</strong><span class="module-variant-card__meta-value">${coreRevision}</span></span>
                    <span><strong>Headers</strong><span class="module-variant-card__meta-value">${headers}</span></span>
                </div>
                ${badgesHtml}
                ${accordionHtml}
                ${detailsHtml}
            </article>
        `;

        variantsContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

function setActiveModuleDetail(moduleKey, variantKey) {
    if (!moduleKey || !MODULE_REQUIREMENT_MATRIX[moduleKey]) {
        return;
    }

    const moduleEntry = getModuleMatrixEntry(moduleKey);
    const variants = moduleEntry?.variants || {};

    activeModuleDetailKey = moduleKey;
    if (variantKey && variants[variantKey]) {
        activeModuleDetailVariant = variantKey;
    } else {
        const selectedVariant = configuration[moduleKey] || 'none';
        activeModuleDetailVariant = variants[selectedVariant] ? selectedVariant : Object.keys(variants)[0] || null;
    }

    renderModuleDetailPanel();
}

function syncModuleDetailPanelToSelection() {
    if (!moduleDetailPanelInitialized) {
        return;
    }

    const panel = ensureModuleDetailPanelElement();
    if (!panel) {
        return;
    }

    if (!activeModuleDetailKey || !MODULE_REQUIREMENT_MATRIX[activeModuleDetailKey]) {
        const defaultModule = MODULE_KEYS.find(key => MODULE_REQUIREMENT_MATRIX[key]);
        if (defaultModule) {
            activeModuleDetailKey = defaultModule;
        }
    }

    if (!activeModuleDetailKey) {
        renderModuleDetailPanel();
        return;
    }

    setActiveModuleDetail(activeModuleDetailKey, activeModuleDetailVariant);
}

function initializeModuleDetailPanel() {
    if (moduleDetailPanelInitialized) {
        return;
    }

    const panel = ensureModuleDetailPanelElement();
    if (!panel) {
        return;
    }

    moduleDetailPanelInitialized = true;

    const handleHighlight = (event) => {
        const input = event?.target;
        if (!input || !input.name || !MODULE_REQUIREMENT_MATRIX[input.name]) {
            return;
        }
        setActiveModuleDetail(input.name, input.value || configuration[input.name] || 'none');
    };

    panel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-variant-accordion]');
        if (!button || !panel.contains(button)) {
            return;
        }

        const controlsId = button.getAttribute('aria-controls');
        const details = controlsId ? document.getElementById(controlsId) : null;
        if (!details) {
            return;
        }

        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        details.hidden = expanded;
    });

    document.querySelectorAll('[data-module-card] input[type="radio"]').forEach(input => {
        input.addEventListener('focus', handleHighlight);
        input.addEventListener('change', handleHighlight);

        const card = input.closest('.option-card');
        if (card && card.dataset.moduleDetailBound !== 'true') {
            card.addEventListener('mouseenter', () => {
                setActiveModuleDetail(input.name, input.value || configuration[input.name] || 'none');
            });
            card.dataset.moduleDetailBound = 'true';
        }
    });

    const defaultModule = MODULE_KEYS.find(key => MODULE_REQUIREMENT_MATRIX[key]);
    if (defaultModule) {
        setActiveModuleDetail(defaultModule, configuration[defaultModule] || 'none');
    } else {
        renderModuleDetailPanel();
    }
}

function describeVariantRequirements(moduleKey, variantKey) {
    const variant = getModuleVariantEntry(moduleKey, variantKey);
    if (!variant || variantKey === 'none') {
        return [];
    }

    const details = [];
    const requirementParts = [];

    if (variant.coreRevision) {
        requirementParts.push(`requires ${variant.coreRevision}`);
    }

    if (Array.isArray(variant.headers) && variant.headers.length > 0) {
        requirementParts.push(`needs ${formatHeaderList(variant.headers)}`);
    }

    if (requirementParts.length > 0) {
        details.push(`${formatModuleSelectionLabel(moduleKey, variantKey)} ${requirementParts.join(' and ')}.`);
    }

    if (Array.isArray(variant.conflicts)) {
        variant.conflicts.forEach(conflict => {
            if (!isConflictActiveForConfig(conflict, configuration)) {
                return;
            }

            if (conflict.message) {
                details.push(conflict.message);
            } else {
                const otherValue = configuration[conflict.module];
                details.push(`${formatModuleSelectionLabel(moduleKey, variantKey)} is incompatible with ${formatModuleSelectionLabel(conflict.module, otherValue)}.`);
            }
        });
    }

    return details;
}

function collectActiveConflictMessages(state) {
    const messages = [];
    const seen = new Set();

    MODULE_KEYS.forEach(moduleKey => {
        const variantKey = state[moduleKey];
        if (!variantKey || variantKey === 'none') {
            return;
        }

        const variant = getModuleVariantEntry(moduleKey, variantKey);
        if (!variant || !Array.isArray(variant.conflicts)) {
            return;
        }

        variant.conflicts.forEach(conflict => {
            if (!isConflictActiveForConfig(conflict, state)) {
                return;
            }

            let message = conflict.message;
            if (!message) {
                const otherValue = state[conflict.module];
                message = `${formatModuleSelectionLabel(moduleKey, variantKey)} is incompatible with ${formatModuleSelectionLabel(conflict.module, otherValue)}.`;
            }

            if (!seen.has(message)) {
                seen.add(message);
                messages.push(message);
            }
        });
    });

    return messages;
}

let manifestLoadPromise = null;
let manifestData = null;
let manifestLoadError = null;
let manifestBuildsWithIndex = [];
let manifestConfigStringLookup = new Map();
let manifestAvailabilityIndex = new Map();

const SIGNATURE_SALT_TEXT = 'Sense360 Firmware Signing Salt v1';
const signatureSaltBytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(SIGNATURE_SALT_TEXT)
    : null;

function createEmptyVerificationState(status = 'idle', message = '') {
    return {
        status,
        message,
        parts: new Map(),
        firmwareId: null
    };
}

let firmwareVerificationState = createEmptyVerificationState();
let firmwareVerificationToken = 0;

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
        bathroom: false,
        airiq: 'none',
        presence: 'none',
        comfort: 'none',
        fan: 'none',
        voice: 'none',
        bathroomairiq: 'none'
    };

    for (let index = 2; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
            continue;
        }

        // Check BathroomAirIQ before Bathroom (since BathroomAirIQ starts with Bathroom)
        if (segment.startsWith('BathroomAirIQ')) {
            const suffix = segment.substring('BathroomAirIQ'.length);
            moduleState.bathroomairiq = normaliseModuleValue('bathroomairiq', suffix ? suffix.toLowerCase() : 'base');
        } else if (segment === 'Bathroom') {
            moduleState.bathroom = true;
        } else if (segment.startsWith('AirIQ')) {
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
        } else if (segment.startsWith('Voice')) {
            const suffix = segment.substring('Voice'.length);
            moduleState.voice = normaliseModuleValue('voice', suffix ? suffix.toLowerCase() : 'base');
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
                            fan: new Set(),
                            voice: new Set(),
                            bathroomairiq: new Set()
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

async function loadManifestData(options = {}) {
    const { forceReload = false, maxRetries = 3 } = options;

    if (manifestData && !forceReload) {
        return manifestData;
    }

    if (manifestLoadPromise && !forceReload) {
        return manifestLoadPromise;
    }

    // Reset state for fresh load attempt
    if (forceReload) {
        manifestLoadPromise = null;
        manifestLoadError = null;
    }

    const attemptFetch = async (attempt = 1) => {
        try {
            const response = await fetch('manifest.json', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Manifest request failed with status ${response.status}`);
            }
            const data = await response.json();
            manifestData = data;
            manifestLoadError = null;
            buildManifestContext(data);
            return data;
        } catch (error) {
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
                console.warn(`Manifest load attempt ${attempt} failed, retrying in ${delay}ms...`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
                return attemptFetch(attempt + 1);
            }
            manifestLoadError = error;
            manifestLoadPromise = null;
            console.error('Failed to load manifest after all retries:', error);
            throw error;
        }
    };

    manifestLoadPromise = attemptFetch();
    return manifestLoadPromise;
}

async function handleRetryManifestLoad() {
    const hint = document.getElementById('module-availability-hint');
    if (hint) {
        hint.classList.remove('is-error');
        hint.innerHTML = 'Retrying compatibility data load…';
    }

    try {
        await loadManifestData({ forceReload: true });
        updateModuleOptionAvailability();
        updateModuleAvailabilityMessage();
        if (currentStep === 4) {
            findCompatibleFirmware();
        }
    } catch (error) {
        updateModuleAvailabilityMessage();
    }
}

const manifestReadyPromise = loadManifestData().catch(() => null);

const firmwareSelectorWrapper = document.getElementById('firmware-selector');
const firmwareVersionSelect = document.getElementById('firmware-version-select');
let compatibleFirmwareHeading = document.querySelector('.compatible-firmware-heading');
let compatibleFirmwareHeadingLabel = compatibleFirmwareHeading?.querySelector('[data-compatible-firmware-label]') || null;
let compatibleFirmwareHeadingSelection = compatibleFirmwareHeading?.querySelector('[data-compatible-firmware-selection]') || null;
let defaultCompatibleFirmwareHeadingLabel = compatibleFirmwareHeadingLabel?.textContent.trim() || '';
let firmwareOptions = [];
let firmwareOptionsMap = new Map();
let currentFirmwareSelectionId = null;
let toastTimeoutId = null;
let additionalFirmwareBuckets = new Map();
let firmwareStatusMessage = null;

function getHomeAssistantIntegrationsButton() {
    return document.getElementById('open-ha-integrations-btn');
}

function setHomeAssistantIntegrationsButtonEnabled(isEnabled) {
    const button = getHomeAssistantIntegrationsButton();
    if (!button) {
        return;
    }

    button.disabled = !isEnabled;
    button.classList.toggle('is-ready', isEnabled);

    if (isEnabled) {
        button.removeAttribute('title');
    } else {
        button.title = 'Available after firmware install completes';
    }
}

function handleInstallStateEvent(event) {
    const detail = event?.detail;
    const state = typeof detail === 'string' ? detail : detail?.state;
    const message = detail?.message;

    if (!state) {
        return;
    }

    if (state === 'finished') {
        setHomeAssistantIntegrationsButtonEnabled(true);
        // Record successful flash
        if (currentFlashEntryId) {
            const duration = flashStartTime ? Date.now() - flashStartTime : 0;
            recordFlashSuccess(currentFlashEntryId, duration);
            currentFlashEntryId = null;
            flashStartTime = null;
        }
        return;
    }

    if (state === 'error') {
        // Record failed flash
        if (currentFlashEntryId) {
            const errorMsg = message || 'Installation failed';
            recordFlashError(currentFlashEntryId, errorMsg);
            currentFlashEntryId = null;
            flashStartTime = null;
        }
    }

    if (state !== 'idle') {
        setHomeAssistantIntegrationsButtonEnabled(false);
    }
}

function openHomeAssistantIntegrations(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    let openedApp = false;

    try {
        const target = window.open(HOME_ASSISTANT_APP_URL, '_blank', 'noopener,noreferrer');
        openedApp = target !== null;
    } catch (error) {
        openedApp = false;
    }

    if (!openedApp) {
        window.open(HOME_ASSISTANT_WEB_FALLBACK_URL, '_blank', 'noopener,noreferrer');
    }
}

let wizardInitialized = false;

function bindPreFlashAcknowledgementControl() {
    const control = document.querySelector('[data-preflash-acknowledge]');

    if (!control) {
        resetPreFlashAcknowledgement();
        return;
    }

    if (control.dataset.preflashAcknowledgeBound === 'true') {
        setPreFlashAcknowledgement('checked' in control ? control.checked : control.getAttribute('aria-pressed') === 'true');
        return;
    }

    const deriveState = () => {
        if ('checked' in control) {
            return Boolean(control.checked);
        }

        const ariaPressed = control.getAttribute('aria-pressed');
        return ariaPressed === 'true';
    };

    const syncState = () => {
        setPreFlashAcknowledgement(deriveState());
    };

    const eventName = 'checked' in control ? 'change' : 'click';
    control.addEventListener(eventName, syncState);
    control.dataset.preflashAcknowledgeBound = 'true';

    syncState();
}

function ensureSingleActiveWizardStep() {
    const steps = Array.from(document.querySelectorAll('.wizard-step'));
    if (!steps.length) {
        return;
    }

    const targetStepElement = document.getElementById(`step-${currentStep}`) || steps.find(step => step.classList.contains('active')) || steps[0];

    steps.forEach(step => {
        if (step === targetStepElement) {
            step.classList.add('active');
            step.classList.remove('entering', 'leaving');
        } else {
            step.classList.remove('active', 'entering', 'leaving');
        }
    });

    const targetStepId = targetStepElement?.id || '';
    const targetStepNumber = Number(targetStepId.replace('step-', '')) || currentStep;
    updateWizardStepVisibility(targetStepNumber);
}

function bindWizardEventListeners() {
    const inputBindings = [
        { selector: 'input[name="mounting"]', datasetKey: 'mountingBound', handler: handleMountingChange },
        { selector: 'input[name="power"]', datasetKey: 'powerBound', handler: handlePowerChange },
        { selector: 'input[name="bathroom"]', datasetKey: 'bathroomBound', handler: handleBathroomChange },
        { selector: 'input[name="airiq"]', datasetKey: 'airiqBound', handler: updateConfiguration },
        { selector: 'input[name="presence"]', datasetKey: 'presenceBound', handler: updateConfiguration },
        { selector: 'input[name="comfort"]', datasetKey: 'comfortBound', handler: updateConfiguration },
        { selector: 'input[name="fan"]', datasetKey: 'fanBound', handler: updateConfiguration },
        { selector: 'input[name="bathroomairiq"]', datasetKey: 'bathroomairiqBound', handler: updateConfiguration }
    ];

    inputBindings.forEach(({ selector, datasetKey, handler }) => {
        document.querySelectorAll(selector).forEach(input => {
            if (input.dataset[datasetKey] === 'true') {
                return;
            }
            input.addEventListener('change', handler);
            input.dataset[datasetKey] = 'true';
        });
    });

}

function initializeWizard() {
    if (wizardInitialized) {
        return;
    }
    wizardInitialized = true;

    try {
        const warning = document.getElementById('browser-warning');
        if (warning && (!navigator || !navigator.serial)) {
            warning.style.display = 'block';
        }
    } catch (error) {
        console.error('Wizard initialization encountered an error during setup:', error);
        Object.assign(configuration, defaultConfiguration);

        const nextButton = document.querySelector('#step-1 .btn-next');
        if (nextButton) {
            nextButton.disabled = true;
        }

        if (typeof window !== 'undefined' && window?.history?.replaceState) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }

    try {
        bindWizardEventListeners();
        bindModuleGroupToggleListeners();
        updateModuleGroupSummaries();
    } catch (error) {
        console.error('Failed to bind wizard events:', error);
    }

    try {
        applyModuleRecommendations();
    } catch (error) {
        console.error('Failed to apply module recommendations:', error);
    }

    try {
        initializeModuleDetailPanel();
    } catch (error) {
        console.error('Failed to initialize module detail panel:', error);
    }

    try {
        attachInstallButtonListeners();
    } catch (error) {
        console.error('Failed to attach install button listeners:', error);
    }

    try {
        bindPreFlashAcknowledgementControl();
    } catch (error) {
        console.error('Failed to bind pre-flash acknowledgement control:', error);
    }

    try {
        initializeFromUrl();
    } catch (error) {
        console.error('Failed to initialize wizard from URL:', error);
    }

    try {
        ensureSingleActiveWizardStep();
        updateFirmwareControls();
    } catch (error) {
        console.error('Failed to finalize wizard initialization:', error);
    }

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

function resolveElementForStepNavigation(source) {
    if (!source) {
        return null;
    }

    if (typeof source === 'string') {
        try {
            return document.querySelector(source);
        } catch (error) {
            return null;
        }
    }

    if (typeof Element !== 'undefined' && source instanceof Element) {
        return source;
    }

    if (source?.target) {
        return resolveElementForStepNavigation(source.target);
    }

    return null;
}

function findStepNextButton(source) {
    const element = resolveElementForStepNavigation(source);
    if (!element) {
        return null;
    }

    const stepElement = element?.classList?.contains('wizard-step') ? element : element.closest?.('.wizard-step');
    if (!stepElement) {
        return null;
    }

    return stepElement.querySelector('.btn-next[data-next]');
}

function setStepNextButtonDisabled(source, disabled) {
    const nextButton = findStepNextButton(source);
    if (nextButton) {
        nextButton.disabled = disabled;
    }
}

function handleMountingChange(e) {
    configuration.mounting = e.target.value;
    setStepNextButtonDisabled(e, false);

    // Show/hide modules based on mounting type
    updateFanModuleVisibility();
    // Show/hide bathroom options based on mounting type (ceiling only)
    updateBathroomVisibility();

    updateConfiguration({ skipUrlUpdate: true });
    updateProgressSteps(getStep());
    updateUrlFromConfiguration();
}

function handlePowerChange(e) {
    configuration.power = e.target.value;
    setStepNextButtonDisabled(e, false);
    updateConfiguration({ skipUrlUpdate: true });
    updateProgressSteps(getStep());
    updateUrlFromConfiguration();
}

function updateFanModuleVisibility() {
    const fanSection = document.getElementById('fan-module-section');
    if (!fanSection) {
        return;
    }

    fanSection.style.display = '';
    const isExpanded = fanSection.dataset.expanded === 'true';
    setModuleGroupExpanded(fanSection, isExpanded);

    updateModuleGroupSummaries();
}

function updateBathroomVisibility() {
    const bathroomSection = document.getElementById('bathroom-toggle-section');
    if (!bathroomSection) {
        return;
    }

    // Bathroom is only available for ceiling installations
    const shouldHideBathroom = configuration.mounting !== 'ceiling';

    if (shouldHideBathroom) {
        bathroomSection.style.display = 'none';
        configuration.bathroom = false;
        const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
        if (bathroomCheckbox && bathroomCheckbox.checked) {
            bathroomCheckbox.checked = false;
        }
    } else {
        bathroomSection.style.display = '';
    }

    updateBathroomAirIQModuleVisibility();
}

function updateBathroomAirIQModuleVisibility() {
    const bathroomAirIQSection = document.getElementById('bathroomairiq-module-section');
    if (!bathroomAirIQSection) {
        return;
    }

    // Bathroom AirIQ is only available when ceiling mount AND bathroom is enabled
    const shouldHideBathroomAirIQ = configuration.mounting !== 'ceiling' || !configuration.bathroom;

    if (shouldHideBathroomAirIQ) {
        bathroomAirIQSection.style.display = 'none';
        closeModuleGroup('bathroomairiq');

        const bathroomAirIQNoneInput = document.querySelector('input[name="bathroomairiq"][value="none"]');
        if (bathroomAirIQNoneInput && !bathroomAirIQNoneInput.checked) {
            bathroomAirIQNoneInput.checked = true;
        }

        configuration.bathroomairiq = 'none';
    } else {
        bathroomAirIQSection.style.display = '';
        const isExpanded = bathroomAirIQSection.dataset.expanded === 'true';
        setModuleGroupExpanded(bathroomAirIQSection, isExpanded);
    }

    updateModuleGroupSummaries();
}

function handleBathroomChange(e) {
    configuration.bathroom = e.target.checked;
    updateBathroomAirIQModuleVisibility();
    updateConfiguration({ skipUrlUpdate: true });
    updateProgressSteps(getStep());
    updateUrlFromConfiguration();
}

function syncConfigurationFromInputs() {
    configuration.airiq = document.querySelector('input[name="airiq"]:checked')?.value || 'none';
    configuration.presence = document.querySelector('input[name="presence"]:checked')?.value || 'none';
    configuration.comfort = document.querySelector('input[name="comfort"]:checked')?.value || 'none';

    // Bathroom checkbox (ceiling only)
    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    if (configuration.mounting === 'ceiling' && bathroomCheckbox) {
        configuration.bathroom = bathroomCheckbox.checked;
    } else {
        configuration.bathroom = false;
    }

    // Bathroom AirIQ (ceiling + bathroom only)
    if (configuration.mounting === 'ceiling' && configuration.bathroom) {
        configuration.bathroomairiq = document.querySelector('input[name="bathroomairiq"]:checked')?.value || 'none';
    } else {
        configuration.bathroomairiq = 'none';
        const bathroomAirIQNoneInput = document.querySelector('input[name="bathroomairiq"][value="none"]');
        if (bathroomAirIQNoneInput && !bathroomAirIQNoneInput.checked) {
            bathroomAirIQNoneInput.checked = true;
        }
    }

    if (configuration.mounting === 'wall') {
        configuration.fan = document.querySelector('input[name="fan"]:checked')?.value || 'none';
    } else {
        configuration.fan = 'none';
        const fanNoneInput = document.querySelector('input[name="fan"][value="none"]');
        if (fanNoneInput && !fanNoneInput.checked) {
            fanNoneInput.checked = true;
        }
    }

    if (configuration.mounting === 'ceiling') {
        configuration.bathroomairiq = document.querySelector('input[name="bathroomairiq"]:checked')?.value || 'none';
    } else {
        configuration.bathroomairiq = 'none';
        const bathroomAirIQNoneInput = document.querySelector('input[name="bathroomairiq"][value="none"]');
        if (bathroomAirIQNoneInput && !bathroomAirIQNoneInput.checked) {
            bathroomAirIQNoneInput.checked = true;
        }
    }
}

function getOptionStatusElement(card) {
    if (!card) {
        return null;
    }

    let status = card.querySelector('[data-option-status]');
    if (!status) {
        const container = card.querySelector('.module-card__inner') || card.querySelector('.option-content') || card;
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

function updateModuleGroupSummaries() {
    const groups = document.querySelectorAll('[data-module-group]');
    groups.forEach(group => {
        const key = group.getAttribute('data-module-group');
        if (!key) {
            return;
        }

        const summary = group.querySelector('[data-module-group-summary]');
        if (!summary) {
            return;
        }

        const value = configuration[key] || 'none';
        summary.textContent = `Selected: ${formatModuleSelectionLabel(key, value || 'none')}`;
    });
}

function setModuleGroupExpanded(groupElement, expanded) {
    if (!groupElement) {
        return;
    }

    const body = groupElement.querySelector('[data-module-group-body]');
    const toggle = groupElement.querySelector('[data-module-group-toggle]');
    groupElement.dataset.expanded = expanded ? 'true' : 'false';

    if (body) {
        body.hidden = !expanded;
    }

    if (toggle) {
        toggle.setAttribute('aria-expanded', String(expanded));
    }
}

function focusModuleGroupSelection(groupElement) {
    if (!groupElement) {
        return;
    }

    const body = groupElement.querySelector('[data-module-group-body]');
    if (!body || body.hidden) {
        return;
    }

    let target = body.querySelector('input[type="radio"]:checked:not(:disabled)');
    if (!target) {
        target = body.querySelector('input[type="radio"]:not(:disabled)');
    }

    if (target) {
        requestAnimationFrame(() => {
            try {
                target.focus();
            } catch (error) {
                // Ignore focus errors
            }
        });
    }
}

function openModuleGroup(key, { focus = false } = {}) {
    if (!key) {
        return;
    }

    const target = document.querySelector(`[data-module-group="${key}"]`);
    if (!target) {
        return;
    }

    const groups = document.querySelectorAll('[data-module-group]');
    groups.forEach(group => {
        setModuleGroupExpanded(group, group === target);
    });

    activeModuleGroupKey = key;

    if (focus) {
        focusModuleGroupSelection(target);
    }
}

function closeModuleGroup(key) {
    if (!key) {
        return;
    }

    const group = document.querySelector(`[data-module-group="${key}"]`);
    if (!group) {
        return;
    }

    setModuleGroupExpanded(group, false);

    if (activeModuleGroupKey === key) {
        activeModuleGroupKey = null;
    }
}

function bindModuleGroupToggleListeners() {
    activeModuleGroupKey = null;

    document.querySelectorAll('[data-module-group-body]').forEach(body => {
        const group = body.closest('[data-module-group]');
        if (!group) {
            return;
        }

        const expanded = group.dataset.expanded === 'true';
        body.hidden = expanded ? false : true;

        if (expanded) {
            const key = group.getAttribute('data-module-group');
            if (key) {
                activeModuleGroupKey = key;
            }
        }
    });

    document.querySelectorAll('[data-module-group-toggle]').forEach(toggle => {
        const group = toggle.closest('[data-module-group]');
        if (!group) {
            return;
        }

        if (!toggle.getAttribute('data-module-group-key')) {
            const key = group.getAttribute('data-module-group');
            if (key) {
                toggle.setAttribute('data-module-group-key', key);
            }
        }

        const expanded = group.dataset.expanded === 'true';
        toggle.setAttribute('aria-expanded', String(expanded));

        if (toggle.dataset.moduleGroupToggleBound === 'true') {
            return;
        }

        toggle.addEventListener('click', event => {
            event.preventDefault();

            const key = toggle.getAttribute('data-module-group-key');
            if (!key) {
                return;
            }

            const parentGroup = toggle.closest('[data-module-group]');
            const isExpanded = parentGroup?.dataset?.expanded === 'true';

            if (isExpanded) {
                closeModuleGroup(key);
            } else {
                openModuleGroup(key, { focus: true });
            }
        });

        toggle.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            const key = toggle.getAttribute('data-module-group-key');
            if (!key) {
                return;
            }
            openModuleGroup(key, { focus: true });
        });

        toggle.dataset.moduleGroupToggleBound = 'true';
    });
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
        hint.innerHTML = '<strong>Unable to load compatibility data.</strong> Module availability cannot be determined right now. <button type="button" class="btn-retry-manifest">Retry</button>';
        const retryButton = hint.querySelector('.btn-retry-manifest');
        if (retryButton) {
            retryButton.addEventListener('click', handleRetryManifestLoad, { once: true });
        }
        return;
    }

    if (!configuration.mounting || !configuration.power) {
        hint.innerHTML = 'Select a mounting and power option to see supported expansion modules.';
        return;
    }

    if (!isManifestReady()) {
        hint.innerHTML = 'Checking module support…';
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
        hint.innerHTML = `<strong>No compatibility data yet.</strong> Module support for ${label} is still being mapped.`;
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
        const detailMessages = unsupportedModules
            .flatMap(moduleKey => describeVariantRequirements(moduleKey, configuration[moduleKey]))
            .filter(message => typeof message === 'string' && message.trim().length > 0);
        const detailsHtml = detailMessages.length > 0
            ? `<ul class="module-hint-details">${detailMessages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`
            : '';
        hint.innerHTML = `<strong>Not available${scopeLabel}:</strong> ${unavailableTags}${detailsHtml}`;
        return;
    }

    if (!availability.combos.has(moduleComboKey)) {
        hint.classList.add('is-warning');
        const selectedTags = MODULE_KEYS
            .filter(moduleKey => configuration[moduleKey] !== 'none')
            .map(moduleKey => createModuleTag(formatModuleSelectionLabel(moduleKey, configuration[moduleKey]), 'info'))
            .join(' ') || createModuleTag('Core only', 'info');
        const label = combinationLabel ? escapeHtml(combinationLabel) : 'this selection';
        const conflictMessages = collectActiveConflictMessages(configuration)
            .filter(message => typeof message === 'string' && message.trim().length > 0);
        const conflictDetails = conflictMessages.length > 0
            ? `<ul class="module-hint-details">${conflictMessages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`
            : '';
        hint.innerHTML = `<strong>Partial support.</strong> ${label} is supported, but not with this exact module mix. ${selectedTags}${conflictDetails}`;
        return;
    }

    hint.classList.add('is-success');
    const selectedTags = MODULE_KEYS
        .filter(moduleKey => configuration[moduleKey] !== 'none')
        .map(moduleKey => createModuleTag(formatModuleSelectionLabel(moduleKey, configuration[moduleKey]), 'success'))
        .join(' ') || createModuleTag('Core only', 'success');
    const label = combinationLabel ? escapeHtml(combinationLabel) : 'this configuration';
    hint.innerHTML = `<strong>Fully supported.</strong> ${label} supports this module selection. ${selectedTags}`;
}

function updateConfiguration(options = {}) {
    syncConfigurationFromInputs();
    updateModuleOptionAvailability();
    syncConfigurationFromInputs();
    updateModuleAvailabilityMessage();
    syncModuleDetailPanelToSelection();
    updateModuleConflictBadges();
    updateModuleGroupSummaries();

    if (!options.skipUrlUpdate) {
        updateUrlFromConfiguration();
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

function getStep() {
    return currentStep;
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

    updateFirmwareControls();
    updateBottomDetailsVisibility(currentStep);

    updateProgressSteps(targetStep);

    const previousStepElement = previousStep !== targetStep ? document.getElementById(`step-${previousStep}`) : null;
    updateWizardStepVisibility(targetStep, { exclude: animate ? previousStepElement : null });

    if (animate && previousStep !== targetStep) {
        animateStepTransition(previousStep, targetStep);
    } else {
        document.querySelectorAll('.wizard-step').forEach(step => {
            const stepNumber = Number(step.id.replace('step-', ''));
            if (stepNumber === targetStep) {
                step.classList.add('active', 'is-active');
                step.classList.remove('entering', 'leaving');
            } else {
                step.classList.remove('active', 'is-active', 'entering', 'leaving');
            }
        });

        setWizardStepVisibility(targetStepElement, true);
        focusStep(targetStepElement);
    }

    if (currentStep === 3) {
        updateFanModuleVisibility();
        updateBathroomVisibility();
        updateModuleOptionAvailability();
        updateModuleAvailabilityMessage();
        syncModuleDetailPanelToSelection();
    }

    if (currentStep === 4) {
        updateConfiguration({ skipUrlUpdate: true });
        updateSummary();
        findCompatibleFirmware();
    }

    if (!skipUrlUpdate) {
        updateUrlFromConfiguration();
    }

    const mobileSummaryRoot = document.querySelector('[data-mobile-summary] [data-module-summary]');
    if (mobileSummaryRoot) {
        const targetVariant = currentStep === 4 ? 'review' : 'module';
        mobileSummaryRoot.dataset.moduleSummaryVariant = targetVariant;
    }

    window.renderSidebar?.(currentStep);
}

function updateProgressSteps(targetStep) {
    const maxReachable = getMaxReachableStep();
    const safeTargetStep = Math.min(Math.max(targetStep, 1), totalSteps);

    for (let i = 1; i <= totalSteps; i++) {
        const progressElement = document.querySelector(`.progress-step[data-step="${i}"]`);
        if (!progressElement) continue;

        const isReachable = i <= maxReachable;
        progressElement.dataset.reachable = String(isReachable);

        if (isReachable) {
            progressElement.removeAttribute('aria-disabled');
        } else {
            progressElement.setAttribute('aria-disabled', 'true');
        }

        if (i === safeTargetStep) {
            progressElement.classList.add('active');
        } else {
            progressElement.classList.remove('active');
        }

        if (i < safeTargetStep) {
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
            setWizardStepVisibility(fromElement, false);
        };

        const leaveFallback = setTimeout(() => {
            fromElement.removeEventListener('transitionend', handleLeave);
            fromElement.classList.remove('leaving');
            setWizardStepVisibility(fromElement, false);
        }, 450);

        fromElement.addEventListener('transitionend', handleLeave);
        fromElement.classList.remove('active', 'is-active');
    }

    if (!toElement) {
        return;
    }

    toElement.classList.remove('leaving');
    toElement.classList.add('entering');
    toElement.classList.remove('active', 'is-active');
    setWizardStepVisibility(toElement, true);

    const activateStep = () => {
        toElement.classList.add('active', 'is-active');

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
    const summaryContainer = document.getElementById('config-summary');

    if (!summaryContainer) {
        return;
    }

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
    summaryContainer.innerHTML = summaryHtml;
}

function updateFirmwareControls() {
    const hasFirmware = Boolean(
        window.currentFirmware
        && Array.isArray(window.currentFirmware.parts)
        && window.currentFirmware.parts.length > 0
    );
    const canWebSerial = Boolean(navigator?.serial);
    const onReviewStep = currentStep === 4;
    const shouldShowInstallControls = canWebSerial && onReviewStep;
    const verificationStatus = (firmwareVerificationState.status || '').toString().toLowerCase();
    const isVerified = verificationStatus === 'verified';
    const isPending = verificationStatus === 'pending';
    const isFailed = verificationStatus === 'failed';
    const isAcknowledged = Boolean(preFlashAcknowledged);
    const readyToFlash = hasFirmware && isVerified && isAcknowledged;

    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.hidden = !onReviewStep;
        downloadBtn.setAttribute('aria-hidden', onReviewStep ? 'false' : 'true');

        if (onReviewStep) {
            downloadBtn.disabled = !readyToFlash;
            downloadBtn.classList.toggle('is-ready', readyToFlash);

            if (!hasFirmware) {
                downloadBtn.title = 'Select a firmware option to download.';
            } else if (!isVerified) {
                downloadBtn.title = isFailed ? (firmwareVerificationState.message || 'Verification failed') : 'Firmware verification in progress.';
            } else if (!isAcknowledged) {
                downloadBtn.title = 'Acknowledge the pre-flash checklist to continue.';
            } else {
                downloadBtn.removeAttribute('title');
            }
        } else {
            downloadBtn.disabled = true;
            downloadBtn.classList.remove('is-ready');
            downloadBtn.removeAttribute('title');
        }
    }

    const copyUrlBtn = document.getElementById('copy-firmware-url-btn');
    if (copyUrlBtn) {
        const clipboardSupported = Boolean(navigator.clipboard);
        const canCopy = clipboardSupported && readyToFlash;
        copyUrlBtn.disabled = !canCopy;
        copyUrlBtn.classList.toggle('is-ready', canCopy);

        if (!clipboardSupported) {
            copyUrlBtn.title = 'Copy requires Clipboard API support';
        } else if (!hasFirmware) {
            copyUrlBtn.title = 'Select a firmware option first';
        } else if (!isVerified) {
            copyUrlBtn.title = isFailed ? (firmwareVerificationState.message || 'Verification failed') : 'Firmware verification in progress.';
        } else if (!isAcknowledged) {
            copyUrlBtn.title = 'Acknowledge the pre-flash checklist to continue.';
        } else {
            copyUrlBtn.removeAttribute('title');
        }
    }

    const installHost = document.querySelector('#compatible-firmware esp-web-install-button[data-webflash-install]');
    if (installHost) {
        installHost.hidden = !shouldShowInstallControls;
        installHost.setAttribute('aria-hidden', shouldShowInstallControls ? 'false' : 'true');
        installHost.classList.toggle('is-ready', shouldShowInstallControls && readyToFlash);
    }

    const installButton = installHost?.querySelector('button[slot="activate"]')
        || document.querySelector('#compatible-firmware esp-web-install-button button[slot="activate"]');
    if (installButton) {
        installButton.hidden = !shouldShowInstallControls;
        installButton.setAttribute('aria-hidden', shouldShowInstallControls ? 'false' : 'true');

        if (shouldShowInstallControls) {
            installButton.classList.toggle('is-ready', readyToFlash);
            installButton.disabled = !readyToFlash;
            if (!readyToFlash && hasFirmware) {
                if (!isVerified) {
                    const message = isFailed ? (firmwareVerificationState.message || 'Verification failed') : 'Firmware verification in progress.';
                    installButton.title = message;
                } else if (!isAcknowledged) {
                    installButton.title = 'Acknowledge the pre-flash checklist to continue.';
                } else {
                    installButton.removeAttribute('title');
                }
            } else {
                installButton.removeAttribute('title');
            }
        } else {
            installButton.classList.remove('is-ready');
            installButton.disabled = true;
            installButton.removeAttribute('title');
        }
    }

    const helperContext = (() => {
        if (!hasFirmware) {
            return { text: '', isError: false, isWarning: false };
        }
        if (isPending) {
            return { text: 'Verifying firmware…', isError: false, isWarning: false };
        }
        if (isFailed) {
            const message = firmwareVerificationState.message || 'Verification failed';
            return { text: message, isError: true, isWarning: false };
        }
        if (isVerified && !isAcknowledged) {
            return { text: 'Review the pre-flash checklist and acknowledge before continuing.', isError: false, isWarning: true };
        }
        if (isVerified) {
            return { text: 'Ready to flash', isError: false, isWarning: false };
        }
        return { text: 'Awaiting verification…', isError: false, isWarning: false };
    })();

    const summaryInstallButton = document.querySelector('[data-module-summary-install]');
    if (summaryInstallButton) {
        summaryInstallButton.hidden = !shouldShowInstallControls;
        summaryInstallButton.setAttribute('aria-hidden', shouldShowInstallControls ? 'false' : 'true');

        if (shouldShowInstallControls) {
            summaryInstallButton.disabled = !readyToFlash;
            if (!hasFirmware) {
                summaryInstallButton.title = 'Select a firmware option to install.';
            } else if (!isVerified) {
                const message = isFailed ? (firmwareVerificationState.message || 'Verification failed') : 'Firmware verification in progress.';
                summaryInstallButton.title = message;
            } else if (!isAcknowledged) {
                summaryInstallButton.title = 'Acknowledge the pre-flash checklist to continue.';
            } else {
                summaryInstallButton.removeAttribute('title');
            }
        } else {
            summaryInstallButton.disabled = true;
            summaryInstallButton.removeAttribute('title');
        }
    }

    const detailHelper = document.querySelector('#compatible-firmware [data-ready-helper]');
    if (detailHelper) {
        if (helperContext.text) {
            detailHelper.textContent = helperContext.text;
            detailHelper.classList.add('is-visible');
        } else {
            detailHelper.textContent = '';
            detailHelper.classList.remove('is-visible');
        }
        detailHelper.classList.toggle('is-error', helperContext.isError);
        detailHelper.classList.toggle('is-warning', helperContext.isWarning);
    }

    const primaryHelper = document.querySelector('.primary-action-group [data-ready-helper]');
    if (primaryHelper) {
        if (helperContext.text) {
            primaryHelper.textContent = helperContext.text;
            primaryHelper.classList.add('is-visible');
        } else {
            primaryHelper.textContent = '';
            primaryHelper.classList.remove('is-visible');
        }
        primaryHelper.classList.toggle('is-error', helperContext.isError);
        primaryHelper.classList.toggle('is-warning', helperContext.isWarning);
    }

    const installAssumptions = document.querySelector('[data-install-assumptions]');
    if (installAssumptions) {
        const mountValue = (configuration.mounting || '').toString().trim().toLowerCase();
        const powerValue = (configuration.power || '').toString().trim().toLowerCase();
        const mountLabel = MOUNT_LABELS[mountValue];
        const powerLabel = POWER_LABELS[powerValue];

        const moduleSegments = MODULE_KEYS
            .map(moduleKey => {
                const variant = (configuration[moduleKey] || '').toString().trim().toLowerCase();
                if (!variant) {
                    return '';
                }

                const moduleLabelMap = MODULE_VARIANT_LABELS[moduleKey] || {};
                const mappedLabel = moduleLabelMap[variant];
                if (mappedLabel) {
                    return escapeHtml(mappedLabel);
                }

                const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;
                if (variant === 'none') {
                    const safeModuleLabel = escapeHtml(moduleLabel);
                    const missingCopy = escapeHtml('not connected');
                    return `${safeModuleLabel} <span class="install-assumptions__missing">${missingCopy}</span>`;
                }

                const formattedVariant = `${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
                return escapeHtml(`${moduleLabel} ${formattedVariant}`);
            })
            .filter(Boolean);

        const shouldShowAssumptions = onReviewStep && Boolean(mountLabel && powerLabel);

        if (shouldShowAssumptions) {
            const safeMountLabel = mountLabel ? escapeHtml(mountLabel) : '';
            const safePowerLabel = powerLabel ? escapeHtml(powerLabel) : '';
            const parts = [safeMountLabel, safePowerLabel, ...moduleSegments].filter(Boolean);
            installAssumptions.innerHTML = `This firmware expects: ${parts.join(', ')}.`;
        } else {
            installAssumptions.innerHTML = '';
        }

        installAssumptions.hidden = !shouldShowAssumptions;
        installAssumptions.setAttribute('aria-hidden', shouldShowAssumptions ? 'false' : 'true');
    }
}

async function refreshPreflightDiagnostics() {
    return null;
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

function normaliseVerificationStatus(status) {
    const key = (status || '').toString().toLowerCase();
    if (key === 'pending' || key === 'verified' || key === 'failed') {
        return key;
    }
    return 'unknown';
}

function getPartVerificationContext(part) {
    if (!part) {
        return { status: 'unknown', message: '' };
    }

    const state = firmwareVerificationState;
    const existing = state.parts.get(part.resolvedUrl);
    if (existing) {
        const status = normaliseVerificationStatus(existing.status);
        return {
            status,
            message: existing.message || '',
            sha256Match: existing.sha256Match ?? null,
            signatureMatch: existing.signatureMatch ?? null
        };
    }

    const globalStatus = normaliseVerificationStatus(state.status);
    if (globalStatus === 'pending') {
        return { status: 'pending', message: 'Verification pending…' };
    }
    if (globalStatus === 'failed') {
        return { status: 'failed', message: state.message || 'Verification failed.' };
    }
    if (globalStatus === 'verified') {
        return { status: 'verified', message: 'Checksum and signature verified.' };
    }

    return { status: 'unknown', message: '' };
}

function formatFirmwareOffset(offset) {
    if (offset === null || offset === undefined || Number.isNaN(offset)) {
        return '';
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
            const sha256 = typeof part?.sha256 === 'string' ? part.sha256.trim() : '';
            const signature = typeof part?.signature === 'string' ? part.signature.trim() : '';
            const md5 = typeof part?.md5 === 'string' ? part.md5.trim() : '';

            return {
                index,
                path,
                resolvedUrl,
                fileName,
                offset,
                offsetHex,
                sha256,
                signature,
                md5
            };
        })
        .filter(Boolean);
}

function arrayBufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    let result = '';
    for (let index = 0; index < bytes.length; index += 1) {
        result += bytes[index].toString(16).padStart(2, '0');
    }
    return result;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
}

async function computeSha256Hex(buffer) {
    const digest = await window.crypto.subtle.digest('SHA-256', buffer);
    return arrayBufferToHex(digest);
}

async function computeSignatureBase64(buffer) {
    if (!signatureSaltBytes) {
        throw new Error('Signature salt unavailable for verification.');
    }
    const dataBytes = new Uint8Array(buffer);
    const combined = new Uint8Array(dataBytes.length + signatureSaltBytes.length);
    combined.set(dataBytes, 0);
    combined.set(signatureSaltBytes, dataBytes.length);
    const digest = await window.crypto.subtle.digest('SHA-256', combined);
    return arrayBufferToBase64(digest);
}

async function verifyFirmwarePart(part) {
    const result = {
        resolvedUrl: part.resolvedUrl,
        fileName: part.fileName,
        status: 'failed',
        message: '',
        sha256Match: false,
        signatureMatch: false,
        expectedSha256: (part.sha256 || '').toLowerCase(),
        expectedSignature: (part.signature || '').trim(),
        computedSha256: '',
        computedSignature: ''
    };

    const targetName = part.fileName || 'firmware part';

    try {
        if (!part.resolvedUrl) {
            throw new Error(`Missing URL for ${targetName}.`);
        }
        if (!result.expectedSha256) {
            throw new Error(`Missing checksum for ${targetName}.`);
        }
        if (!result.expectedSignature) {
            throw new Error(`Missing signature for ${targetName}.`);
        }

        const response = await fetch(part.resolvedUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Unable to download ${targetName} (HTTP ${response.status}).`);
        }

        const buffer = await response.arrayBuffer();
        const computedSha = await computeSha256Hex(buffer);
        result.computedSha256 = computedSha;
        result.sha256Match = computedSha === result.expectedSha256;

        const computedSignature = await computeSignatureBase64(buffer);
        result.computedSignature = computedSignature;
        result.signatureMatch = computedSignature === result.expectedSignature;

        if (result.sha256Match && result.signatureMatch) {
            result.status = 'verified';
            result.message = 'Checksum and signature verified.';
        } else if (!result.sha256Match) {
            result.message = `Checksum mismatch for ${targetName}.`;
        } else if (!result.signatureMatch) {
            result.message = `Signature mismatch for ${targetName}.`;
        } else {
            result.message = `Verification failed for ${targetName}.`;
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Verification failed.';
        if (!result.message) {
            result.message = errorMessage;
        }
    }

    return result;
}

function setFirmwareVerificationStateForTests(state) {
    if (!state || typeof state !== 'object') {
        firmwareVerificationState = createEmptyVerificationState();
        return;
    }

    let partsEntries = [];
    if (state.parts instanceof Map) {
        partsEntries = Array.from(state.parts.entries());
    } else if (Array.isArray(state.parts)) {
        partsEntries = state.parts.filter(entry => Array.isArray(entry) && entry.length === 2);
    }

    firmwareVerificationState = {
        status: state.status || 'idle',
        message: state.message || '',
        parts: new Map(partsEntries),
        firmwareId: state.firmwareId || null
    };
}

async function verifyCurrentFirmwareIntegrity() {
    const firmware = window.currentFirmware;
    const token = ++firmwareVerificationToken;

    if (!firmware) {
        firmwareVerificationState = createEmptyVerificationState();
        renderSelectedFirmware();
        updateFirmwareControls();
        return;
    }

    const parts = getFirmwarePartsMetadata(firmware);
    if (!parts.length) {
        firmwareVerificationState = {
            status: 'failed',
            message: 'No firmware files available for verification.',
            parts: new Map(),
            firmwareId: firmware.firmwareId || null
        };
        renderSelectedFirmware();
        updateFirmwareControls();
        return;
    }

    if (!window.crypto || !window.crypto.subtle || !signatureSaltBytes) {
        const failureMap = new Map();
        parts.forEach(part => {
            failureMap.set(part.resolvedUrl, {
                status: 'failed',
                message: 'Firmware verification not supported in this browser.',
                sha256Match: false,
                signatureMatch: false
            });
        });
        firmwareVerificationState = {
            status: 'failed',
            message: 'Firmware verification is not supported in this browser.',
            parts: failureMap,
            firmwareId: firmware.firmwareId || null
        };
        renderSelectedFirmware();
        updateFirmwareControls();
        return;
    }

    const pendingMap = new Map();
    parts.forEach(part => {
        pendingMap.set(part.resolvedUrl, {
            status: 'pending',
            message: 'Verification pending…'
        });
    });

    firmwareVerificationState = {
        status: 'pending',
        message: 'Verifying firmware…',
        parts: pendingMap,
        firmwareId: firmware.firmwareId || null
    };
    renderSelectedFirmware();
    updateFirmwareControls();

    try {
        const results = await Promise.all(parts.map(part => verifyFirmwarePart(part)));
        if (token !== firmwareVerificationToken) {
            return;
        }

        const resultMap = new Map();
        let overallStatus = 'verified';
        let overallMessage = 'Firmware verified successfully.';

        results.forEach(result => {
            const status = normaliseVerificationStatus(result.status);
            resultMap.set(result.resolvedUrl, {
                status,
                message: result.message || '',
                sha256Match: result.sha256Match,
                signatureMatch: result.signatureMatch
            });

            if (status !== 'verified' && overallStatus === 'verified') {
                overallStatus = 'failed';
                overallMessage = result.message || 'Firmware verification failed.';
            }
        });

        firmwareVerificationState = {
            status: overallStatus,
            message: overallMessage,
            parts: resultMap,
            firmwareId: firmware.firmwareId || null
        };
    } catch (error) {
        if (token !== firmwareVerificationToken) {
            return;
        }
        console.error('Firmware verification failed:', error);
        const failureMap = new Map();
        parts.forEach(part => {
            failureMap.set(part.resolvedUrl, {
                status: 'failed',
                message: 'Verification aborted due to an unexpected error.',
                sha256Match: false,
                signatureMatch: false
            });
        });
        firmwareVerificationState = {
            status: 'failed',
            message: 'Unexpected error verifying firmware.',
            parts: failureMap,
            firmwareId: firmware.firmwareId || null
        };
    } finally {
        if (token === firmwareVerificationToken) {
            renderSelectedFirmware();
            updateFirmwareControls();
        }
    }
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

function renderFirmwarePartsSection(firmware) {
    const parts = getFirmwarePartsMetadata(firmware);
    if (!parts.length) {
        return '';
    }

    const firmwareId = (firmware?.firmwareId || 'firmware').toString();
    const normalisedId = firmwareId.replace(/[^a-zA-Z0-9_-]+/g, '-');
    const contentId = `${normalisedId}-parts`;
    const collapsedIcon = '+';
    const expandedIcon = '−';
    const collapsedLabel = 'Show firmware file details';
    const expandedLabel = 'Hide firmware file details';
    const overallStatus = normaliseVerificationStatus(firmwareVerificationState.status);
    const overallMessage = (() => {
        if (overallStatus === 'pending') {
            return 'Verifying firmware…';
        }
        if (overallStatus === 'verified') {
            return firmwareVerificationState.message || 'Firmware verified successfully.';
        }
        if (overallStatus === 'failed') {
            return firmwareVerificationState.message || 'Firmware verification failed.';
        }
        return '';
    })();

    const listItems = parts
        .map(part => {
            const offsetText = part.offsetHex ? `Offset ${part.offsetHex}` : 'Offset not specified';
            const verification = getPartVerificationContext(part);
            const partStatus = normaliseVerificationStatus(verification.status);
            const statusMessage = verification.message
                || (partStatus === 'verified'
                    ? 'Checksum and signature verified.'
                    : partStatus === 'pending'
                        ? 'Verification pending…'
                        : partStatus === 'failed'
                            ? 'Verification failed.'
                            : '');
            const checksumValue = part.sha256 || '';
            const signatureValue = part.signature || '';
            const checksumDisplay = checksumValue || 'Unavailable';
            const signatureDisplay = signatureValue || 'Unavailable';
            const checksumCopyButton = checksumValue
                ? `<button type="button" class="copy-inline-btn" data-copy-text="${escapeHtml(checksumValue)}" data-copy-label="SHA-256 checksum">Copy</button>`
                : '';
            const signatureCopyButton = signatureValue
                ? `<button type="button" class="copy-inline-btn" data-copy-text="${escapeHtml(signatureValue)}" data-copy-label="Signature blob">Copy</button>`
                : '';

            return `
                <li class="firmware-part-row" data-verification-status="${escapeHtml(partStatus)}">
                    <div class="firmware-part-main">
                        <span class="firmware-part-name">${escapeHtml(part.fileName)}</span>
                        <span class="firmware-part-offset">${escapeHtml(offsetText)}</span>
                    </div>
                    <div class="firmware-part-detail">
                        <span class="firmware-part-label">SHA-256</span>
                        <code class="firmware-part-code">${escapeHtml(checksumDisplay)}</code>
                        ${checksumCopyButton}
                    </div>
                    <div class="firmware-part-detail">
                        <span class="firmware-part-label">Signature</span>
                        <code class="firmware-part-code">${escapeHtml(signatureDisplay)}</code>
                        ${signatureCopyButton}
                        <span class="firmware-part-status status-${escapeHtml(partStatus)}">${escapeHtml(statusMessage)}</span>
                    </div>
                </li>
            `;
        })
        .join('');

    const hint = parts.length > 1
        ? '<p class="firmware-parts-hint">Flash each file to the offset shown below.</p>'
        : '';

    const statusNotice = overallMessage
        ? `<p class="firmware-verification-message status-${escapeHtml(overallStatus)}">${escapeHtml(overallMessage)}</p>`
        : '';

    return `
        <section class="firmware-parts" data-multi-part="${parts.length > 1}" data-verification-status="${escapeHtml(overallStatus)}">
            <button
                type="button"
                class="firmware-parts-toggle"
                data-firmware-parts-toggle
                data-collapsed-icon="${escapeHtml(collapsedIcon)}"
                data-expanded-icon="${escapeHtml(expandedIcon)}"
                data-collapsed-label="${escapeHtml(collapsedLabel)}"
                data-expanded-label="${escapeHtml(expandedLabel)}"
                aria-controls="${escapeHtml(contentId)}"
                aria-expanded="false"
            >
                <span class="firmware-parts-toggle-icon" aria-hidden="true">${escapeHtml(collapsedIcon)}</span>
                <span class="firmware-parts-toggle-label">${escapeHtml(collapsedLabel)}</span>
            </button>
            <div id="${escapeHtml(contentId)}" class="firmware-parts-content" hidden>
                <h4>${parts.length > 1 ? 'Firmware files' : 'Firmware file'}</h4>
                <ul class="firmware-parts-list">${listItems}</ul>
                ${hint}
                ${statusNotice}
            </div>
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
                    <p class="ready-helper" data-ready-helper role="status" aria-live="polite"></p>
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
                    <esp-web-install-button manifest="firmware-${manifestIndex}.json" data-firmware-id="${escapeHtml(firmware.firmwareId)}" data-webflash-install>
                        <button slot="activate" class="btn btn-primary" data-firmware-id="${escapeHtml(firmware.firmwareId)}">
                            Install Firmware
                        </button>
                    </esp-web-install-button>
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
    firmwareVerificationToken += 1;
    firmwareVerificationState = createEmptyVerificationState();

    if (firmwareVersionSelect) {
        firmwareVersionSelect.innerHTML = '';
        firmwareVersionSelect.value = '';
    }

    if (firmwareSelectorWrapper) {
        firmwareSelectorWrapper.hidden = true;
    }

    renderSelectedFirmware();
    resetPreFlashAcknowledgement();
    updateFirmwareControls();
    updateCompatibleFirmwareHeading();
}

function setFirmwareOptions(builds, configString, modelBuckets = new Map()) {
    firmwareOptions = Array.isArray(builds) ? builds.slice() : [];
    firmwareOptionsMap = new Map();
    firmwareVerificationToken += 1;
    firmwareVerificationState = createEmptyVerificationState();

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
    if (!firmwareOptions.length) {
        resetPreFlashAcknowledgement();
    }
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

function ensureCompatibleFirmwareHeadingRefs() {
    if (compatibleFirmwareHeadingSelection && compatibleFirmwareHeadingLabel) {
        return;
    }

    const heading = document.querySelector('.compatible-firmware-heading');
    if (!heading) {
        return;
    }

    compatibleFirmwareHeading = heading;
    compatibleFirmwareHeadingLabel = heading.querySelector('[data-compatible-firmware-label]') || compatibleFirmwareHeadingLabel;
    compatibleFirmwareHeadingSelection = heading.querySelector('[data-compatible-firmware-selection]') || compatibleFirmwareHeadingSelection;

    if (!defaultCompatibleFirmwareHeadingLabel && compatibleFirmwareHeadingLabel) {
        const labelText = compatibleFirmwareHeadingLabel.textContent?.trim();
        defaultCompatibleFirmwareHeadingLabel = labelText || 'Compatible Firmware';
    }
}

function slugifyFirmwareHeadingSource(value) {
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function ensureSense360Prefix(value) {
    const trimmed = (value || '').toString().trim();
    if (!trimmed) {
        return '';
    }

    if (/^sense360[-_\s]/i.test(trimmed)) {
        return trimmed;
    }

    return `Sense360-${trimmed.replace(/^[-_\s]+/, '')}`;
}

function deriveFirmwareIdentifierSlug(firmware) {
    const releaseTag = (firmware.release_tag || '').toString().trim();
    if (releaseTag) {
        return slugifyFirmwareHeadingSource(releaseTag);
    }

    const configString = (firmware.config_string || '').toString().trim();
    if (configString) {
        return slugifyFirmwareHeadingSource(ensureSense360Prefix(configString));
    }

    const deviceType = (firmware.device_type || firmware.deviceType || '').toString().trim();
    if (deviceType) {
        return slugifyFirmwareHeadingSource(ensureSense360Prefix(deviceType));
    }

    const parts = Array.isArray(firmware.parts) ? firmware.parts : [];
    if (parts.length > 0) {
        const firstPart = parts[0];
        let partPath = '';
        if (firstPart && typeof firstPart === 'object') {
            partPath = (firstPart.path || firstPart.name || firstPart.filename || '').toString();
        } else if (firstPart) {
            partPath = firstPart.toString();
        }

        const trimmedPath = partPath.trim();
        if (trimmedPath) {
            const filename = trimmedPath.split('/').pop() || trimmedPath;
            const withoutExtension = filename.replace(/\.[^.]+$/, '');
            const withoutVersion = withoutExtension.replace(/[-_]?v\d[\w.-]*$/i, '');
            const normalized = ensureSense360Prefix(withoutVersion || withoutExtension);
            return slugifyFirmwareHeadingSource(normalized);
        }
    }

    return 'sense360-firmware';
}

function getCompatibleFirmwareHeadingText(firmware) {
    if (!firmware) {
        return '';
    }

    const versionRaw = (firmware.version || '').toString().trim();
    const version = versionRaw ? `v${versionRaw.replace(/^v+/i, '')}` : '';
    const slug = deriveFirmwareIdentifierSlug(firmware);

    const parts = [slug, version].filter(Boolean);
    return parts.join(' ').trim();
}

function updateCompatibleFirmwareHeading() {
    ensureCompatibleFirmwareHeadingRefs();

    if (!compatibleFirmwareHeadingSelection) {
        return;
    }

    const hasBlockingStatus = firmwareStatusMessage?.type === 'not-available'
        || firmwareStatusMessage?.type === 'error';

    let selectionText = '';
    if (window.currentFirmware && !hasBlockingStatus) {
        selectionText = getCompatibleFirmwareHeadingText(window.currentFirmware);
    }

    const labelText = defaultCompatibleFirmwareHeadingLabel || 'Compatible Firmware';
    if (compatibleFirmwareHeadingLabel) {
        compatibleFirmwareHeadingLabel.textContent = selectionText ? `${labelText}:` : labelText;
    }

    compatibleFirmwareHeadingSelection.textContent = selectionText;
}

function setFirmwareStatusMessageForTests(message) {
    firmwareStatusMessage = message;
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
    firmwareVerificationToken += 1;
    firmwareVerificationState = createEmptyVerificationState();

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
    } else {
        updateCompatibleFirmwareHeading();
    }

    resetPreFlashAcknowledgement();
    updateFirmwareControls();
    verifyCurrentFirmwareIntegrity();
}

function selectDefaultFirmware() {
    if (!firmwareOptions.length) {
        currentFirmwareSelectionId = null;
        window.currentFirmware = null;
        firmwareVerificationToken += 1;
        firmwareVerificationState = createEmptyVerificationState();
        renderSelectedFirmware();
        resetPreFlashAcknowledgement();
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
    } else if (firmwareStatusMessage?.type === 'not-available' && firmwareStatusMessage.configString) {
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
        sections.push(`
            <div class="firmware-error">
                <h4>Error Loading Firmware</h4>
                <p>${escapeHtml(firmwareStatusMessage.message)}</p>
            </div>
        `);
    } else {
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
    updateCompatibleFirmwareHeading();
}

function attachInstallButtonListeners() {
    const installHosts = document.querySelectorAll('esp-web-install-button[data-webflash-install]');

    installHosts.forEach(host => {
        const activateButton = host.querySelector('button[slot="activate"]');

        if (activateButton && activateButton.dataset.installBound !== 'true') {
            activateButton.addEventListener('click', event => {
                if (!window.confirm('Keep the device connected and powered during flashing. Continue?')) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                const firmwareId = activateButton.dataset.firmwareId;
                if (firmwareId) {
                    selectFirmwareById(firmwareId, { syncSelector: false });
                }
                setHomeAssistantIntegrationsButtonEnabled(false);

                // Record flash start in history
                const firmware = selectedFirmware || firmwareList.find(f => f.firmwareId === firmwareId);
                if (firmware) {
                    flashStartTime = Date.now();
                    currentFlashEntryId = recordFlashStart({
                        configString: firmware.config_string || window.currentConfigString || 'Unknown',
                        firmwareVersion: firmware.version || 'Unknown',
                        channel: firmware.channel || 'Unknown'
                    });
                }
            });
            activateButton.dataset.installBound = 'true';
        }

        if (host.dataset.installStateBound !== 'true') {
            const handleInstallStateChange = (event) => {
                handleInstallStateEvent(event);
            };

            host.addEventListener('state-changed', handleInstallStateChange);
            host.addEventListener('install-success', handleInstallStateChange);
            host.addEventListener('install-complete', handleInstallStateChange);

            host.dataset.installStateBound = 'true';
        }
    });

    bindSummaryInstallButton();
}

function bindSummaryInstallButton() {
    const summaryButton = document.querySelector('[data-module-summary-install]');
    if (!summaryButton || summaryButton.dataset.installRelay === 'true') {
        return;
    }

    summaryButton.dataset.installRelay = 'true';
    summaryButton.addEventListener('click', event => {
        event.preventDefault();
        const primaryInstall = document.querySelector('#compatible-firmware esp-web-install-button button[slot="activate"]');

        if (primaryInstall && !primaryInstall.disabled) {
            primaryInstall.click();
            return;
        }

        const stepFour = document.getElementById('step-4');
        if (stepFour) {
            stepFour.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

async function findCompatibleFirmware() {
    clearFirmwareOptions();

    if (!configuration.mounting || !configuration.power) {
        window.currentConfigString = null;
        if (firmwareSelectorWrapper) {
            firmwareSelectorWrapper.hidden = true;
        }

        const compatibleFirmwareElement = document.getElementById('compatible-firmware');
        if (!compatibleFirmwareElement) {
            console.warn('Compatible firmware container not found.');
            return;
        }

        compatibleFirmwareElement.innerHTML = `
            <div class="firmware-error">
                <h4>Incomplete Configuration</h4>
                <p>Please select both a mounting location and power option before checking firmware compatibility.</p>
            </div>
        `;
        updateFirmwareControls();
        attachInstallButtonListeners();
        updateCompatibleFirmwareHeading();
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

async function copyFirmwareUrl() {
    const firmware = window.currentFirmware;
    const parts = getFirmwarePartsMetadata(firmware);

    if (!parts.length) {
        showToast('Nothing to copy');
        return;
    }

    if (parts.length > 1) {
        await copyFirmwarePartsToClipboard(parts);
        return;
    }

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
        showToast('Firmware link copied');
    } catch (error) {
        console.error('Failed to copy firmware URL:', error);
        showToast('Copy failed');
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

document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-firmware-parts-toggle]');
    if (!toggle) {
        return;
    }

    event.preventDefault();

    const controlsId = toggle.getAttribute('aria-controls');
    if (!controlsId) {
        return;
    }

    const content = document.getElementById(controlsId);
    if (!content) {
        return;
    }

    const shouldExpand = content.hasAttribute('hidden');
    const collapsedIcon = toggle.getAttribute('data-collapsed-icon') || '+';
    const expandedIcon = toggle.getAttribute('data-expanded-icon') || '−';
    const collapsedLabel = toggle.getAttribute('data-collapsed-label') || 'Show firmware file details';
    const expandedLabel = toggle.getAttribute('data-expanded-label') || 'Hide firmware file details';

    if (shouldExpand) {
        content.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
    } else {
        content.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
    }

    const iconElement = toggle.querySelector('.firmware-parts-toggle-icon');
    if (iconElement) {
        iconElement.textContent = shouldExpand ? expandedIcon : collapsedIcon;
    } else {
        toggle.textContent = shouldExpand ? `${expandedIcon} ${expandedLabel}` : `${collapsedIcon} ${collapsedLabel}`;
    }

    const labelElement = toggle.querySelector('.firmware-parts-toggle-label');
    if (labelElement) {
        labelElement.textContent = shouldExpand ? expandedLabel : collapsedLabel;
    } else if (!iconElement) {
        toggle.textContent = shouldExpand ? `${expandedIcon} ${expandedLabel}` : `${collapsedIcon} ${collapsedLabel}`;
    }

    toggle.classList.toggle('is-expanded', shouldExpand);
});

document.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-copy-text]');
    if (!trigger) {
        return;
    }

    event.preventDefault();

    if (!navigator.clipboard) {
        showToast('Copy not supported');
        return;
    }

    const value = trigger.getAttribute('data-copy-text') || '';
    if (!value) {
        showToast('Nothing to copy');
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        const label = trigger.getAttribute('data-copy-label') || 'Value';
        showToast(`${label} copied`);
    } catch (error) {
        console.error('Failed to copy value:', error);
        showToast('Copy failed');
    }
});

function downloadFirmware() {
    const firmware = window.currentFirmware;
    const parts = getFirmwarePartsMetadata(firmware);

    const verificationStatus = (firmwareVerificationState.status || '').toString().toLowerCase();
    if (verificationStatus !== 'verified') {
        if (verificationStatus === 'pending') {
            showToast('Firmware verification in progress');
        } else if (verificationStatus === 'failed') {
            showToast(firmwareVerificationState.message || 'Firmware verification failed');
        } else {
            showToast('Verifying firmware…');
            if (verificationStatus === 'idle' && firmware) {
                verifyCurrentFirmwareIntegrity();
            }
        }
        return;
    }

    if (!parts.length) {
        showToast('Nothing to download');
        return;
    }

    const triggerDownload = (part) => {
        if (!part?.resolvedUrl) {
            return;
        }
        const link = document.createElement('a');
        link.href = part.resolvedUrl;
        link.download = getFirmwareDisplayName(firmware, window.currentConfigString || '') || part.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (parts.length > 1) {
        parts.forEach(part => triggerDownload(part));
        showToast(`Started downloads for ${parts.length} files`);
        return;
    }

    triggerDownload(parts[0]);
}


function initializeFromUrl() {
    const searchParams = new URLSearchParams(window.location.search || '');
    const parsed = parseConfigParams(searchParams);
    const sanitizedConfig = mapToWizardConfiguration(parsed.sanitizedConfig);

    applyConfiguration(sanitizedConfig);

    const maxStep = getMaxReachableStep();
    let targetStep;

    let parsedStep = null;
    const stepValue = searchParams.get('step');
    if (stepValue) {
        const numericStep = parseInt(stepValue, 10);
        if (!Number.isNaN(numericStep) && numericStep >= 1 && numericStep <= totalSteps) {
            parsedStep = numericStep;
        }
    }

    if (parsedStep) {
        targetStep = Math.min(parsedStep, maxStep);
    } else if (!configuration.mounting) {
        targetStep = 1;
    } else if (!configuration.power) {
        targetStep = 2;
    } else if (MODULE_KEYS.some(key => parsed.providedKeys.has(key))) {
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

    if (configuration.mounting !== 'ceiling') {
        configuration.bathroomairiq = 'none';
    }

    if (configuration.mounting) {
        const mountingInput = document.querySelector(`input[name="mounting"][value="${configuration.mounting}"]`);
        if (mountingInput) {
            mountingInput.checked = true;
            setStepNextButtonDisabled(mountingInput, false);
        }
    } else {
        setStepNextButtonDisabled('#step-1', true);
    }

    if (configuration.power) {
        const powerInput = document.querySelector(`input[name="power"][value="${configuration.power}"]`);
        if (powerInput) {
            powerInput.checked = true;
            setStepNextButtonDisabled(powerInput, false);
        }
    } else {
        setStepNextButtonDisabled('#step-2', true);
    }

    ['airiq', 'bathroomairiq', 'presence', 'comfort', 'fan', 'voice'].forEach(key => {
        const value = configuration[key];
        const input = document.querySelector(`input[name="${key}"][value="${value}"]`);
        if (input) {
            input.checked = true;
        }
    });

    updateFanModuleVisibility();
    updateBathroomVisibility();
    updateConfiguration({ skipUrlUpdate: true });
    updateProgressSteps(getStep());
    updateModuleGroupSummaries();
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

function updateUrlFromConfiguration() {
    const params = new URLSearchParams();

    if (configuration.mounting) {
        params.set('mount', configuration.mounting);
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
}

window.nextStep = nextStep;
window.previousStep = previousStep;
window.downloadFirmware = downloadFirmware;
window.copyFirmwareUrl = copyFirmwareUrl;
window.toggleReleaseNotes = toggleReleaseNotes;
window.openHomeAssistantIntegrations = openHomeAssistantIntegrations;

export const __testHooks = Object.freeze({
    initializeWizard,
    loadManifestData,
    findCompatibleFirmware,
    manifestReadyPromise: () => manifestReadyPromise,
    isManifestReady,
    renderSelectedFirmware,
    getFirmwarePartsMetadata,
    refreshPreflightDiagnostics,
    setFirmwareVerificationState: setFirmwareVerificationStateForTests,
    setFirmwareStatusMessage: setFirmwareStatusMessageForTests,
    updateFirmwareControls,
    setPreFlashAcknowledgement
});

export {
    getDefaultState,
    getState,
    setState,
    replaceState,
    getStep,
    getTotalSteps,
    setStep,
    getMaxReachableStep
};
