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

async function findCompatibleFirmware() {
    const downloadBtn = document.getElementById('download-btn');
    const setReadyState = (isReady) => {
        if (downloadBtn) {
            downloadBtn.disabled = !isReady;
            downloadBtn.classList.toggle('is-ready', isReady);
        }

        const installButton = document.querySelector('#compatible-firmware esp-web-install-button button[slot="activate"]');
        if (installButton) {
            installButton.classList.toggle('is-ready', isReady);
        }

        const helperTexts = document.querySelectorAll('[data-ready-helper]');
        helperTexts.forEach(helper => {
            if (isReady) {
                if (helper.textContent !== 'Ready to flash') {
                    helper.textContent = 'Ready to flash';
                }
                helper.classList.add('is-visible');
            } else {
                helper.classList.remove('is-visible');
                if (helper.textContent) {
                    helper.textContent = '';
                }
            }
        });
    };

    setReadyState(false);

    // Ensure required selections are present before building the config string
    if (!configuration.mounting || !configuration.power) {
        document.getElementById('compatible-firmware').innerHTML = `
            <div class="firmware-error">
                <h4>Incomplete Configuration</h4>
                <p>Please select both a mounting location and power option before checking firmware compatibility.</p>
            </div>
        `;
        attachInstallButtonListeners();
        return;
    }

    // Generate firmware filename based on configuration
    const previousConfigString = window.currentConfigString;
    let configString = '';

    // Add mounting type
    configString += `${configuration.mounting.charAt(0).toUpperCase() + configuration.mounting.slice(1)}`;

    // Add power option
    configString += `-${configuration.power.toUpperCase()}`;

    // Add modules
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

    // Load manifest to check if firmware exists
    try {
        const response = await fetch('manifest.json');
        const manifest = await response.json();
        const legacyGroups = groupLegacyBuilds(manifest.builds);

        // Find matching firmware in manifest
        let matchingFirmware = null;
        for (const build of manifest.builds) {
            // Check if this build matches our configuration
            if (build.config_string === configString) {
                matchingFirmware = build;
                break;
            }
        }

        const sanitizedConfigString = escapeHtml(configString);

        if (matchingFirmware) {
            // Store firmware info globally
            window.currentFirmware = matchingFirmware;
            window.currentConfigString = configString;

            const metadataSections = [
                { key: 'features', title: 'Key Features' },
                { key: 'hardware_requirements', title: 'Hardware Requirements' },
                { key: 'known_issues', title: 'Known Issues' },
                { key: 'changelog', title: 'Changelog' }
            ];

            const metadataHtml = metadataSections
                .map(({ key, title }) => {
                    const items = matchingFirmware[key];
                    if (!Array.isArray(items) || items.length === 0) {
                        return '';
                    }

                    const listItems = items
                        .map(item => `<li>${escapeHtml(item)}</li>`)
                        .join('');

                    return `
                        <section class="firmware-meta-section firmware-${key.replace(/_/g, '-')}">
                            <h4>${title}</h4>
                            <ul>${listItems}</ul>
                        </section>
                    `;
                })
                .filter(Boolean)
                .join('');

            const firmwareVersion = matchingFirmware.version ?? '';
            const firmwareChannel = matchingFirmware.channel ?? '';
            const firmwareName = `Sense360-${configString}-v${firmwareVersion}-${firmwareChannel}.bin`;
            const sanitizedFirmwareName = escapeHtml(firmwareName);

            const fileSize = Number(matchingFirmware.file_size);
            const fileSizeLabel = Number.isFinite(fileSize) && fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : '';
            const sanitizedFileSizeLabel = escapeHtml(fileSizeLabel);

            const buildDate = matchingFirmware.build_date ? new Date(matchingFirmware.build_date) : null;
            const buildDateLabel = buildDate && !Number.isNaN(buildDate.getTime()) ? buildDate.toLocaleDateString() : '';
            const sanitizedBuildDateLabel = escapeHtml(buildDateLabel);

            const metadataBlock = metadataHtml
                ? `
                    <div class="firmware-metadata">
                        ${metadataHtml}
                    </div>
                `
                : '';

            // Firmware exists - show install option
            const firmwareHtml = `
                <div class="firmware-item">
                    <div class="firmware-info">
                        <div class="firmware-name">${sanitizedFirmwareName}</div>
                        <div class="firmware-details">
                            <span class="firmware-size">${sanitizedFileSizeLabel}</span>
                            <span class="firmware-date">${sanitizedBuildDateLabel}</span>
                            <a href="#" class="release-notes-link" onclick="toggleReleaseNotes(event)">View Release Notes</a>
                        </div>
                    </div>
                    <div class="firmware-actions">
                        <esp-web-install-button manifest="firmware-${manifest.builds.indexOf(matchingFirmware)}.json">
                            <button slot="activate" class="btn btn-primary">
                                Install Firmware
                            </button>
                        </esp-web-install-button>
                        <p class="ready-helper" data-ready-helper role="status" aria-live="polite"></p>
                    </div>
                </div>
                ${metadataBlock}
                <div class="release-notes-section" id="release-notes" style="display: none;">
                    <div class="release-notes-content">
                        <div class="loading">Loading release notes...</div>
                    </div>
                </div>
            `;
            document.getElementById('compatible-firmware').innerHTML = firmwareHtml;
            setReadyState(true);
            attachInstallButtonListeners();
        } else {
            // Firmware doesn't exist - show message
            const notAvailableHtml = `
                <div class="firmware-not-available">
                    <h4>Firmware Not Available</h4>
                    <p>The firmware for this configuration has not been built yet:</p>
                    <p class="config-string">Sense360-${sanitizedConfigString}-v1.0.0-general.bin</p>
                    <p class="help-text">Please contact support or check back later for this specific configuration.</p>
                </div>
            `;
            document.getElementById('compatible-firmware').innerHTML = notAvailableHtml;
            attachInstallButtonListeners();
        }

        renderLegacyFirmware(legacyGroups);
    } catch (error) {
        console.error('Error loading manifest:', error);
        const errorHtml = `
            <div class="firmware-error">
                <h4>Error Loading Firmware</h4>
                <p>Unable to check firmware availability. Please try again later.</p>
            </div>
        `;
        document.getElementById('compatible-firmware').innerHTML = errorHtml;
        attachInstallButtonListeners();
        renderLegacyFirmware([]);
    }
}

async function toggleReleaseNotes(event) {
    event.preventDefault();
    const notesSection = document.getElementById('release-notes');
    const link = event.target;

    if (notesSection.style.display === 'none') {
        notesSection.style.display = 'block';
        link.textContent = 'Hide Release Notes';

        // Load release notes if not already loaded
        if (notesSection.querySelector('.loading')) {
            await loadReleaseNotes();
        }
    } else {
        notesSection.style.display = 'none';
        link.textContent = 'View Release Notes';
    }
}

async function loadReleaseNotes() {
    const notesSection = document.getElementById('release-notes');
    const configString = window.currentConfigString;
    const firmware = window.currentFirmware;

    try {
        // Try to load release notes file
        const notesPath = `firmware/configurations/Sense360-${configString}-v${firmware.version}-${firmware.channel}.md`;
        const response = await fetch(notesPath);

        const contentContainer = notesSection.querySelector('.release-notes-content');
        if (!contentContainer) {
            return;
        }

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
            const noNotesMessage = document.createElement('p');
            noNotesMessage.className = 'no-notes';
            noNotesMessage.textContent = 'No release notes available for this firmware version.';
            contentContainer.replaceChildren(noNotesMessage);
        }
    } catch (error) {
        console.error('Error loading release notes:', error);
        const notesElement = document.getElementById('release-notes');
        if (!notesElement) {
            return;
        }

        const contentContainer = notesElement.querySelector('.release-notes-content');
        if (!contentContainer) {
            return;
        }

        const errorMessage = document.createElement('p');
        errorMessage.className = 'error';
        errorMessage.textContent = 'Unable to load release notes.';
        contentContainer.replaceChildren(errorMessage);
    }
}

function downloadFirmware() {
    if (window.currentFirmware && window.currentConfigString) {
        const firmware = window.currentFirmware;
        const configString = window.currentConfigString;
        const firmwarePath = firmware.parts[0].path;

        // Create a link element and trigger download
        const link = document.createElement('a');
        link.href = firmwarePath;
        link.download = `Sense360-${configString}-v${firmware.version}-${firmware.channel}.bin`;
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
