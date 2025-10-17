import { getPref, setPref } from './prefs.js';
import { escapeHtml } from './utils/escape-html.js';

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

const DEFAULT_CHANNEL_KEY = 'stable';

const CHANNEL_ALIAS_MAP = {
    general: 'stable',
    stable: 'stable',
    ga: 'stable',
    release: 'stable',
    beta: 'beta',
    preview: 'beta',
    dev: 'dev',
    nightly: 'dev',
    canary: 'dev'
};

const CHANNEL_DISPLAY_MAP = {
    stable: {
        label: 'General Release',
        description: 'Recommended for most installations and validated for production deployments.',
        notesFallback: 'General release notes are not available for this firmware version yet.'
    },
    beta: {
        label: 'Preview Release',
        description: 'Preview upcoming capabilities with limited validation. Expect rapid updates.',
        notesFallback: 'Preview release notes are not yet available for this firmware version.'
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
    beta: 1,
    preview: 1,
    dev: 2,
    nightly: 2,
    canary: 2,
    experimental: 2
};

function normaliseChannelKey(channel) {
    const normalised = (channel || '').toString().trim().toLowerCase();

    if (!normalised) {
        return DEFAULT_CHANNEL_KEY;
    }

    return CHANNEL_ALIAS_MAP[normalised] || normalised || DEFAULT_CHANNEL_KEY;
}

function getChannelDisplayInfo(channel) {
    const key = normaliseChannelKey(channel);
    const display = CHANNEL_DISPLAY_MAP[key] || DEFAULT_CHANNEL_DISPLAY;
    return { key, ...display };
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

function escapeHtml(value) {
    const stringValue = String(value);
    const replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return stringValue.replace(/[&<>"']/g, char => replacements[char]);
}

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
    const selectors = [
        '#compatible-firmware esp-web-install-button button[slot="activate"]',
        '#legacy-firmware-list esp-web-install-button button[slot="activate"]'
    ];
    const installButtons = document.querySelectorAll(selectors.join(', '));
    installButtons.forEach(button => {
        if (button.dataset.checklistBound === 'true') {
            return;
        }
        button.addEventListener('click', () => {
            setChecklistCompletion(true);
        });
        button.dataset.checklistBound = 'true';
    });
}

function sanitizeRememberedState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
        return null;
    }

    const rawConfig = rawState.configuration;
    if (!rawConfig || typeof rawConfig !== 'object') {
        return null;
    }

    const sanitizedConfig = { ...defaultConfiguration };
    Object.entries(allowedOptions).forEach(([key, values]) => {
        const value = rawConfig[key];
        if (value !== undefined && values.includes(value)) {
            sanitizedConfig[key] = value;
        }
    });

    if (sanitizedConfig.mounting !== 'wall') {
        sanitizedConfig.fan = 'none';
    }

    let storedStep = null;
    if ('currentStep' in rawState) {
        const numericStep = Number.parseInt(rawState.currentStep, 10);
        if (Number.isInteger(numericStep)) {
            storedStep = Math.max(1, Math.min(totalSteps, numericStep));
        }
    }

    return {
        configuration: sanitizedConfig,
        currentStep: storedStep
    };
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

    setPref('rememberChoices', rememberChoices);

    if (!rememberChoices) {
        setPref('lastWizardState', null);
        rememberedState = null;
        return;
    }

    persistWizardState();
}

function setupRememberPreferenceControls() {
    rememberChoices = Boolean(getPref('rememberChoices'));
    rememberedState = rememberChoices ? sanitizeRememberedState(getPref('lastWizardState')) : null;

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

    const stateToPersist = {
        configuration: {
            mounting: configuration.mounting,
            power: configuration.power,
            airiq: configuration.airiq,
            presence: configuration.presence,
            comfort: configuration.comfort,
            fan: configuration.mounting === 'wall' ? configuration.fan : 'none'
        },
        currentStep
    };

    setPref('lastWizardState', stateToPersist);
    rememberedState = stateToPersist;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check browser compatibility
    if (!navigator.serial) {
        document.getElementById('browser-warning').style.display = 'block';
    }

    syncChecklistCompletion();
    setupRememberPreferenceControls();

    // Add event listeners
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
});

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

function updateConfiguration(options = {}) {
    // Update AirIQ
    const airiqValue = document.querySelector('input[name="airiq"]:checked')?.value || 'none';
    configuration.airiq = airiqValue;

    // Update Presence module
    configuration.presence = document.querySelector('input[name="presence"]:checked')?.value || 'none';

    // Update Comfort module
    configuration.comfort = document.querySelector('input[name="comfort"]:checked')?.value || 'none';

    // Update Fan module (only if wall mount)
    if (configuration.mounting === 'wall') {
        configuration.fan = document.querySelector('input[name="fan"]:checked')?.value || 'none';
    }

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

function groupLegacyBuilds(builds) {
    const groupsMap = new Map();

    builds.forEach((build, index) => {
        if (!build.config_string) {
            const model = build.model || 'Unknown Model';
            const variant = build.variant || '';
            const key = `${model}||${variant}`;

            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    model,
                    variant,
                    builds: []
                });
            }

            groupsMap.get(key).builds.push({
                ...build,
                manifestIndex: index
            });
        }
    });

    return Array.from(groupsMap.values()).sort((a, b) => {
        const modelCompare = a.model.localeCompare(b.model);
        if (modelCompare !== 0) {
            return modelCompare;
        }
        return a.variant.localeCompare(b.variant);
    });
}

function renderLegacyFirmware(groups) {
    const section = document.getElementById('legacy-firmware-section');
    const list = document.getElementById('legacy-firmware-list');
    const panel = document.getElementById('legacy-firmware-panel');

    if (!section || !list) {
        return;
    }

    if (!groups.length) {
        section.style.display = 'none';
        list.innerHTML = '';
        if (panel) {
            panel.removeAttribute('open');
        }
        return;
    }

    const legacyHtml = groups.map(group => {
        const modelText = group.model || 'Unknown Model';
        const variantText = group.variant || '';
        const sanitizedModel = escapeHtml(modelText);
        const sanitizedVariant = escapeHtml(variantText);
        const variantTag = variantText ? `<span class="legacy-group-variant">${sanitizedVariant}</span>` : '';

        const buildsHtml = group.builds.map(build => {
            const versionLabel = build.version ? `v${build.version}${build.channel ? `-${build.channel}` : ''}` : '';
            const buildDate = build.build_date ? new Date(build.build_date) : null;
            const buildDateLabel = buildDate && !isNaN(buildDate.getTime()) ? buildDate.toLocaleDateString() : '';
            const fileSize = Number(build.file_size);
            const sizeLabel = Number.isFinite(fileSize) && fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : '';
            const metaParts = [];
            if (versionLabel) metaParts.push(escapeHtml(versionLabel));
            if (buildDateLabel) metaParts.push(escapeHtml(buildDateLabel));
            if (sizeLabel) metaParts.push(escapeHtml(sizeLabel));
            const metaHtml = metaParts.length ? `<div class="legacy-build-meta">${metaParts.join(' · ')}</div>` : '';
            const description = build.description || 'No description available for this firmware build.';
            const sanitizedDescription = escapeHtml(description);
            const buildName = variantText ? `${modelText} · ${variantText}` : modelText;
            const sanitizedBuildName = escapeHtml(buildName);

            return `
                <div class="legacy-build-card">
                    <div class="legacy-build-info">
                        <div class="legacy-build-name">${sanitizedBuildName}</div>
                        ${metaHtml}
                        <p class="legacy-build-description">${sanitizedDescription}</p>
                    </div>
                    <div class="legacy-build-actions">
                        <esp-web-install-button manifest="firmware-${build.manifestIndex}.json" class="legacy-install-button">
                            <button slot="activate" class="btn btn-primary btn-small">Install Firmware</button>
                        </esp-web-install-button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <section class="legacy-build-group">
                <header class="legacy-group-header">
                    <h4 class="legacy-group-title">${sanitizedModel}</h4>
                    ${variantTag}
                </header>
                <div class="legacy-builds">
                    ${buildsHtml}
                </div>
            </section>
        `;
    }).join('');

    list.innerHTML = legacyHtml;
    section.style.display = 'block';
    attachInstallButtonListeners();
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
    const groups = new Map();

    builds.forEach(build => {
        if (!build.config_string) {
            return;
        }

        if (!groups.has(build.config_string)) {
            groups.set(build.config_string, []);
        }

        groups.get(build.config_string).push(build);
    });

    return groups;
}

function clearFirmwareOptions() {
    firmwareOptions = [];
    firmwareOptionsMap = new Map();
    currentFirmwareSelectionId = null;
    window.currentFirmware = null;

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

function setFirmwareOptions(builds, configString) {
    firmwareOptions = Array.isArray(builds) ? builds.slice() : [];
    firmwareOptionsMap = new Map(
        firmwareOptions.map(build => [build.firmwareId, build])
    );

    if (configString) {
        window.currentConfigString = configString;
    }

    if (!firmwareOptions.length) {
        currentFirmwareSelectionId = null;
        window.currentFirmware = null;
    }

    renderFirmwareSelector();
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

    const selectedValue = currentFirmwareSelectionId || (firmwareVersionSelect.options[0]?.value ?? '');
    if (selectedValue) {
        firmwareVersionSelect.value = selectedValue;
    }
}

function selectFirmwareById(firmwareId, { updateConfigString = true, syncSelector = true, renderDetails = true } = {}) {
    if (!firmwareId || !firmwareOptionsMap.has(firmwareId)) {
        return;
    }

    const firmware = firmwareOptionsMap.get(firmwareId);
    currentFirmwareSelectionId = firmwareId;
    window.currentFirmware = firmware;

    if (updateConfigString && firmware.config_string) {
        window.currentConfigString = firmware.config_string;
    }

    if (syncSelector && firmwareVersionSelect) {
        firmwareVersionSelect.value = firmwareId;
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

    if (!firmware) {
        container.innerHTML = `
            <div class="firmware-selection-placeholder">
                <p>Select a firmware release to see details.</p>
            </div>
        `;
        attachInstallButtonListeners();
        return;
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
    const firmwareVersion = firmware.version ?? '';
    const firmwareChannel = firmware.channel ?? '';
    const firmwareName = `Sense360-${window.currentConfigString}-v${firmwareVersion}${firmwareChannel ? `-${firmwareChannel}` : ''}.bin`;
    const fileSize = Number(firmware.file_size);
    const sizeLabel = Number.isFinite(fileSize) && fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : '';
    const buildDate = firmware.build_date ? new Date(firmware.build_date) : null;
    const buildDateLabel = buildDate && !Number.isNaN(buildDate.getTime()) ? buildDate.toLocaleDateString() : '';
    const releaseNotesId = `${firmware.firmwareId}-release-notes`;
    const sanitizedConfigString = escapeHtml(firmware.config_string || window.currentConfigString || '');
    const sanitizedVersion = escapeHtml(firmwareVersion);
    const sanitizedChannel = escapeHtml(firmwareChannel);

    const metaParts = [];
    if (firmware.version) {
        metaParts.push(`<span class="firmware-version">${escapeHtml(`v${firmware.version}${firmwareChannel ? `-${firmwareChannel}` : ''}`)}</span>`);
    }
    if (sizeLabel) {
        metaParts.push(`<span class="firmware-size">${escapeHtml(sizeLabel)}</span>`);
    }
    if (buildDateLabel) {
        metaParts.push(`<span class="firmware-date">${escapeHtml(buildDateLabel)}</span>`);
    }

    metaParts.push(`
        <a href="#" class="release-notes-link" data-release-notes-trigger data-release-notes-id="${releaseNotesId}" data-notes-id="${releaseNotesId}" data-firmware-id="${firmware.firmwareId}" data-config-string="${sanitizedConfigString}" data-version="${sanitizedVersion}" data-channel="${sanitizedChannel}" onclick="toggleReleaseNotes(event)">
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

    const descriptionHtml = firmware.description
        ? `<p class="firmware-description">${escapeHtml(firmware.description)}</p>`
        : '';

    container.innerHTML = `
        <div class="firmware-card" data-firmware-detail data-firmware-id="${firmware.firmwareId}" data-channel="${escapeHtml(channelInfo.key)}">
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
                    <esp-web-install-button manifest="firmware-${firmware.manifestIndex}.json" data-firmware-id="${firmware.firmwareId}">
                        <button slot="activate" class="btn btn-primary" data-firmware-id="${firmware.firmwareId}">
                            Install Firmware
                        </button>
                    </esp-web-install-button>
                    <p class="ready-helper" data-ready-helper role="status" aria-live="polite"></p>
                </div>
            </div>
            ${metadataBlock}
            <div class="release-notes-section" id="${releaseNotesId}" data-release-notes-container data-loaded="false" style="display: none;">
                <div class="release-notes-content">
                    <div class="loading">Loading release notes...</div>
                </div>
            </div>
        </div>
    `;

    attachInstallButtonListeners();
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
        renderLegacyFirmware([]);
        return;
    }

    const previousConfigString = window.currentConfigString;
    let configString = '';

    configString += `${configuration.mounting.charAt(0).toUpperCase() + configuration.mounting.slice(1)}`;
    configString += `-${configuration.power.toUpperCase()}`;

    if (configuration.airiq !== 'none') {
        configString += `-AirIQ${configuration.airiq.charAt(0).toUpperCase() + configuration.airiq.slice(1)}`;
    }

    if (configuration.presence !== 'none') {
        configString += `-Presence${configuration.presence.charAt(0).toUpperCase() + configuration.presence.slice(1)}`;
    }

    if (configuration.comfort !== 'none') {
        configString += `-Comfort${configuration.comfort.charAt(0).toUpperCase() + configuration.comfort.slice(1)}`;
    }

    if (configuration.fan !== 'none') {
        configString += `-Fan${configuration.fan.toUpperCase()}`;
    }

    if (previousConfigString !== configString) {
        setChecklistCompletion(false);
    } else {
        syncChecklistCompletion();
    }

    window.currentConfigString = configString;

    try {
        const response = await fetch('manifest.json', { cache: 'no-store' });
        const manifest = await response.json();
        const buildsWithIndex = manifest.builds.map((build, index) => {
            const enriched = { ...build, manifestIndex: index };
            enriched.firmwareId = getFirmwareId(enriched);
            return enriched;
        });

        const groupedBuilds = groupBuildsByConfig(buildsWithIndex);
        const sortedBuilds = (groupedBuilds.get(configString) || [])
            .slice()
            .sort((a, b) => {
                const priorityDiff = getChannelPriority(a.channel) - getChannelPriority(b.channel);
                if (priorityDiff !== 0) {
                    return priorityDiff;
                }
                return compareVersionsDesc(a.version, b.version);
            });

        renderLegacyFirmware(groupLegacyBuilds(manifest.builds));

        if (sortedBuilds.length) {
            setFirmwareOptions(sortedBuilds, configString);
            selectDefaultFirmware();
        } else {
            document.getElementById('compatible-firmware').innerHTML = `
                <div class="firmware-not-available">
                    <h4>Firmware Not Available</h4>
                    <p>The firmware for this configuration has not been built yet:</p>
                    <p class="config-string">Sense360-${escapeHtml(configString)}-v1.0.0-stable.bin</p>
                    <p class="help-text">Please contact support or check back later for this specific configuration.</p>
                </div>
            `;
            if (firmwareSelectorWrapper) {
                firmwareSelectorWrapper.hidden = true;
            }
            window.currentFirmware = null;
            updateFirmwareControls();
            attachInstallButtonListeners();
        }
    } catch (error) {
        console.error('Error loading manifest:', error);
        document.getElementById('compatible-firmware').innerHTML = `
            <div class="firmware-error">
                <h4>Error Loading Firmware</h4>
                <p>Unable to check firmware availability. Please try again later.</p>
            </div>
        `;
        if (firmwareSelectorWrapper) {
            firmwareSelectorWrapper.hidden = true;
        }
        window.currentFirmware = null;
        updateFirmwareControls();
        attachInstallButtonListeners();
        renderLegacyFirmware([]);
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
                configString: link.dataset.configString || window.currentConfigString || '',
                version: link.dataset.version || (window.currentFirmware?.version ?? ''),
                channel: link.dataset.channel || (window.currentFirmware?.channel ?? '')
            });
        }
    } else {
        notesSection.style.display = 'none';
        link.textContent = 'View Release Notes';
    }
}

async function loadReleaseNotes({ notesSection, configString, version, channel }) {
    if (!notesSection) {
        return;
    }

    const contentContainer = notesSection.querySelector('.release-notes-content');
    if (!contentContainer) {
        return;
    }

    const channelInfo = getChannelDisplayInfo(channel);

    const showFallbackMessage = (message) => {
        const fallback = document.createElement('p');
        fallback.className = 'no-notes';
        fallback.textContent = message;
        contentContainer.replaceChildren(fallback);
    };

    if (!configString || !version) {
        showFallbackMessage(channelInfo.notesFallback);
        notesSection.dataset.loaded = 'true';
        return;
    }

    try {
        const channelSuffix = channel ? `-${channel}` : '';
        const notesPath = `firmware/configurations/Sense360-${configString}-v${version}${channelSuffix}.md`;
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

function getResolvedFirmwareUrl() {
    if (!window.currentFirmware || !Array.isArray(window.currentFirmware.parts) || window.currentFirmware.parts.length === 0) {
        return null;
    }

    const firmwarePath = window.currentFirmware.parts[0].path;
    if (!firmwarePath) {
        return null;
    }

    try {
        return new URL(firmwarePath, window.location.href).href;
    } catch (error) {
        console.warn('Unable to resolve firmware URL:', error);
        return firmwarePath;
    }
}

async function copyFirmwareUrl() {
    if (!navigator.clipboard) {
        showToast('Copy not supported');
        return;
    }

    const firmwareUrl = getResolvedFirmwareUrl();
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
    if (window.currentFirmware && window.currentConfigString) {
        const firmware = window.currentFirmware;
        const configString = window.currentConfigString;
        const firmwarePath = firmware.parts[0].path;

        // Create a link element and trigger download
        const link = document.createElement('a');
        link.href = firmwarePath;
        const channelSuffix = firmware.channel ? `-${firmware.channel}` : '';
        link.download = `Sense360-${configString}-v${firmware.version}${channelSuffix}.bin`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
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
