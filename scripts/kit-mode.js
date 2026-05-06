/**
 * @fileoverview Kit / SKU configuration mode controller.
 *
 * Wires the Step 1 kit picker to the existing wizard state. The kit catalog
 * is loaded from scripts/data/kits.json via scripts/utils/kit-config.js; on
 * selection the kit's wizard_state is fed through the same setState() that
 * manual selection uses, and the user is forwarded to Step 5 to review the
 * recommended firmware. Kit selection never bypasses provenance, the
 * release-channel UI, or the install gating logic in state.js.
 *
 * @module kit-mode
 */

import {
    getState,
    setState,
    setStep,
    getMaxReachableStep
} from './state.js';
import {
    findKitBySku,
    loadKitCatalog,
    mapKitToWizardState,
    normaliseSku,
    summariseKitModules
} from './utils/kit-config.js';
import { setActiveKitMetadata, setConfigurationMode, setSelectedKitSku } from './services/diagnostics.js';
import { announce } from './utils/a11y.js';

const POWER_LABELS = Object.freeze({
    usb: 'USB',
    poe: 'PoE PSU',
    pwr: '240v PSU'
});

const MOUNT_LABELS = Object.freeze({
    ceiling: 'Ceiling mount'
});

let currentMode = 'manual';
let cachedCatalog = null;
let activeKitSku = null;

function getModePicker() {
    return document.querySelector('[data-config-mode-picker]');
}

function getKitPanel() {
    return document.querySelector('[data-kit-mode-panel]');
}

function getManualPanel() {
    return document.querySelector('[data-manual-mode-panel]');
}

function getKitSelect() {
    return document.querySelector('[data-kit-select]');
}

function getKitSearchInput() {
    return document.querySelector('[data-kit-select-search]');
}

function getKitDatalist() {
    return document.querySelector('[data-kit-select-datalist]');
}

function getKitErrorNode() {
    return document.querySelector('[data-kit-select-error]');
}

function getKitSummaryNode() {
    return document.querySelector('[data-kit-summary]');
}

function getKitNextButton() {
    return document.querySelector('[data-kit-mode-next]');
}

function setError(message) {
    const node = getKitErrorNode();
    if (!node) {
        return;
    }
    if (!message) {
        node.hidden = true;
        node.textContent = '';
        return;
    }
    node.hidden = false;
    node.textContent = message;
    announce(message);
}

function buildKitSummary(kit, firmwareConfigString) {
    const node = getKitSummaryNode();
    if (!node) {
        return;
    }
    if (!kit) {
        node.hidden = true;
        node.innerHTML = '';
        return;
    }

    const state = kit.wizard_state || {};
    const moduleSummary = summariseKitModules(kit);
    const moduleText = moduleSummary.length ? moduleSummary.join(', ') : 'No expansion modules';
    const powerText = POWER_LABELS[state.power] || state.power || 'Unknown power source';
    const mountText = MOUNT_LABELS[state.mount] || state.mount || 'Unknown mount';

    const items = [
        { label: 'Mounting', value: mountText },
        { label: 'Power', value: powerText },
        { label: 'Modules', value: moduleText },
        { label: 'Firmware profile', value: firmwareConfigString || kit.firmware_config_string || 'Unknown' }
    ];

    if (state.bathroom) {
        items.splice(2, 0, { label: 'Bathroom mode', value: 'Enabled' });
    }

    const escape = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);

    const itemsHtml = items
        .map(item => `<li><strong>${escape(item.label)}:</strong> ${escape(item.value)}</li>`)
        .join('');

    node.innerHTML = `
        <p class="kit-summary__title">Selected kit: ${escape(kit.display_name || kit.sku)}</p>
        <ul class="kit-summary__list">${itemsHtml}</ul>
        <p class="kit-summary__why">Why: this firmware profile (<code>${escape(kit.firmware_config_string)}</code>) matches the selected core and the modules included in this kit. The recommended firmware will appear in Step 5 with full provenance and release-channel details.</p>
    `;
    node.hidden = false;
}

function populateKitOptions(catalog) {
    cachedCatalog = catalog;
    const select = getKitSelect();
    const datalist = getKitDatalist();

    if (select) {
        // Preserve the placeholder option, drop the rest.
        while (select.options.length > 1) {
            select.remove(1);
        }
        catalog.kits.forEach(kit => {
            const option = document.createElement('option');
            option.value = kit.sku;
            option.textContent = kit.display_name
                ? `${kit.display_name} — ${kit.sku}`
                : kit.sku;
            select.appendChild(option);
        });
    }

    if (datalist) {
        datalist.innerHTML = '';
        catalog.kits.forEach(kit => {
            const option = document.createElement('option');
            option.value = kit.sku;
            option.label = kit.display_name || '';
            datalist.appendChild(option);
        });
    }
}

function setMode(mode, { silent = false } = {}) {
    const next = mode === 'kit' ? 'kit' : 'manual';
    currentMode = next;

    const kitPanel = getKitPanel();
    const manualPanel = getManualPanel();
    if (kitPanel) {
        kitPanel.hidden = next !== 'kit';
    }
    if (manualPanel) {
        manualPanel.hidden = next === 'kit';
    }

    const radios = document.querySelectorAll('[data-config-mode-input]');
    radios.forEach(radio => {
        radio.checked = radio.value === next;
    });

    setConfigurationMode(next);

    if (next === 'manual') {
        // Switching away from kit mode discards the kit selection but keeps
        // the user's existing module choices so Step 4 still reflects what
        // they had picked. The diagnostics SKU field is cleared so we don't
        // claim a kit was used.
        activeKitSku = null;
        setSelectedKitSku(null);
        setActiveKitMetadata(null);
        setError('');
        const select = getKitSelect();
        if (select) {
            select.value = '';
        }
        const search = getKitSearchInput();
        if (search) {
            search.value = '';
        }
        buildKitSummary(null);
        const nextBtn = getKitNextButton();
        if (nextBtn) {
            nextBtn.disabled = true;
        }
    }

    if (!silent) {
        announce(next === 'kit'
            ? 'Configuration mode set to kit / SKU.'
            : 'Configuration mode set to manual hardware selection.');
    }
}

function clearWizardModuleSelections() {
    // When switching to a kit we reset every module selection so a stale
    // pick from the manual flow doesn't combine with the kit definition.
    return {
        mount: 'ceiling',
        power: null,
        bathroom: false,
        airiq: 'none',
        ventiq: 'none',
        roomiq: 'none',
        fan: 'none',
        led: 'none',
        voice: 'none'
    };
}

function applyKitToWizard(kit) {
    if (!kit) {
        return;
    }
    const cleared = clearWizardModuleSelections();
    const kitState = mapKitToWizardState(kit);
    setState({ ...cleared, ...kitState });

    activeKitSku = kit.sku;
    setSelectedKitSku(kit.sku);
    setActiveKitMetadata(kit);
    buildKitSummary(kit, kit.firmware_config_string);
    appendKitParamsToUrl(kit);

    const summary = getKitSummaryNode();
    if (summary) {
        summary.hidden = false;
    }

    const nextBtn = getKitNextButton();
    if (nextBtn) {
        nextBtn.disabled = false;
    }

    setError('');
    announce(`Kit ${kit.display_name || kit.sku} selected. Mapped to firmware profile ${kit.firmware_config_string}.`);
}

function appendKitParamsToUrl(kit) {
    if (typeof window === 'undefined' || !window.history || !kit) {
        return;
    }
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('configmode', 'kit');
        url.searchParams.set('sku', kit.sku);
        window.history.replaceState(null, '', url.toString());
    } catch {
        // ignore — URL update is best effort, the share link still works.
    }
}

function handleKitSelection(rawValue) {
    const value = normaliseSku(rawValue);
    if (!value) {
        setError('');
        const summary = getKitSummaryNode();
        if (summary) {
            summary.hidden = true;
            summary.innerHTML = '';
        }
        const nextBtn = getKitNextButton();
        if (nextBtn) {
            nextBtn.disabled = true;
        }
        activeKitSku = null;
        setSelectedKitSku(null);
        setActiveKitMetadata(null);
        return;
    }

    if (!cachedCatalog) {
        setError('Kit catalog is still loading. Please retry in a moment.');
        return;
    }

    const kit = findKitBySku(cachedCatalog, value);
    if (!kit) {
        setError('We could not find that kit. Check the label or choose hardware manually.');
        const nextBtn = getKitNextButton();
        if (nextBtn) {
            nextBtn.disabled = true;
        }
        const summary = getKitSummaryNode();
        if (summary) {
            summary.hidden = true;
            summary.innerHTML = '';
        }
        activeKitSku = null;
        setSelectedKitSku(null);
        setActiveKitMetadata(null);
        return;
    }

    // Sync the dropdown + search field so they always agree.
    const select = getKitSelect();
    if (select && select.value !== kit.sku) {
        select.value = kit.sku;
    }
    const search = getKitSearchInput();
    if (search) {
        search.value = kit.sku;
    }

    applyKitToWizard(kit);
}

function attachListeners() {
    const picker = getModePicker();
    if (picker) {
        picker.addEventListener('change', (event) => {
            const target = event.target;
            if (target && target.matches('[data-config-mode-input]')) {
                setMode(target.value);
            }
        });
    }

    const select = getKitSelect();
    if (select) {
        select.addEventListener('change', () => {
            handleKitSelection(select.value);
        });
    }

    const search = getKitSearchInput();
    if (search) {
        const onSubmit = () => handleKitSelection(search.value);
        search.addEventListener('change', onSubmit);
        search.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                onSubmit();
            }
        });
    }

    const switchManualBtn = document.querySelector('[data-kit-mode-switch-manual]');
    if (switchManualBtn) {
        switchManualBtn.addEventListener('click', (event) => {
            event.preventDefault();
            setMode('manual');
        });
    }

    const nextBtn = getKitNextButton();
    if (nextBtn) {
        nextBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const state = getState();
            if (!activeKitSku || !state.mounting || !state.power) {
                setError('Pick a kit before continuing.');
                return;
            }
            const reachable = getMaxReachableStep();
            const target = Math.min(5, Number.isFinite(reachable) ? reachable : 5);
            setStep(target, { animate: true });
        });
    }
}

function getRequestedModeFromUrl() {
    // Note: we deliberately do not consume the existing `mode=` URL param —
    // that's already wired to the release-mode picker (recovery / development
    // / normal). A dedicated `configmode=` namespace keeps the kit picker
    // independent of release-mode handling and avoids surprises if someone
    // shares a link with both knobs set.
    try {
        const params = new URLSearchParams(window.location.search || '');
        const configMode = (params.get('configmode') || '').toLowerCase();
        const sku = params.get('sku');

        if (configMode === 'manual') {
            return { mode: 'manual', sku: '' };
        }
        if (configMode === 'kit' || sku) {
            return { mode: 'kit', sku: sku || '' };
        }

        // If the URL already carries an explicit manual configuration
        // (mount/power/module params from a legacy share link) we stay in
        // manual mode so we don't second-guess the user's intent.
        const manualMarkers = ['mount', 'power', 'airiq', 'ventiq', 'roomiq', 'fan', 'led', 'voice', 'bathroom'];
        if (manualMarkers.some(key => params.has(key))) {
            return { mode: 'manual', sku: '' };
        }
    } catch {
        // ignore
    }
    return { mode: 'kit', sku: '' };
}

async function initKitMode() {
    if (!getModePicker()) {
        return;
    }

    attachListeners();
    setMode('kit', { silent: true });

    let catalog;
    try {
        catalog = await loadKitCatalog();
    } catch (error) {
        console.warn('[kit-mode] Failed to load kit catalog', error);
        catalog = { schema_version: 1, kits: [], skipped: [] };
    }

    populateKitOptions(catalog);

    const requested = getRequestedModeFromUrl();
    if (requested.mode === 'manual') {
        setMode('manual', { silent: true });
        return;
    }

    if (requested.sku) {
        const kit = findKitBySku(catalog, requested.sku);
        if (kit) {
            const select = getKitSelect();
            if (select) {
                select.value = kit.sku;
            }
            const search = getKitSearchInput();
            if (search) {
                search.value = kit.sku;
            }
            applyKitToWizard(kit);
        } else {
            setError(`No kit found for SKU "${requested.sku}". Choose hardware manually or pick a kit from the list.`);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKitMode, { once: true });
} else {
    initKitMode();
}

export const __testHooks = Object.freeze({
    initKitMode,
    setMode,
    handleKitSelection,
    applyKitToWizard,
    getCurrentMode: () => currentMode,
    getActiveKitSku: () => activeKitSku
});
