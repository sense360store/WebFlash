/**
 * @fileoverview Kit / SKU configuration mode controller and Step 1 path
 *   selector (WF-UX-006).
 *
 * Wires the Step 1 kit picker to the existing wizard state. The kit catalog
 * is loaded from scripts/data/kits.json via scripts/utils/kit-config.js; on
 * selection the kit's wizard_state is fed through the same setState() that
 * manual selection uses, and the user is forwarded to Step 5 to review the
 * recommended firmware. Kit selection never bypasses provenance, the
 * release-channel UI, or the install gating logic in state.js.
 *
 * WF-UX-006 layers a path controller on top of the legacy mode controller:
 * Step 1 exposes three customer-facing buttons (kit / custom / recovery).
 * `setPath('kit')` and `setPath('custom')` delegate to the existing
 * `setMode('kit'|'manual')` machinery (custom is the canonical alias for
 * manual). `setPath('recovery')` opens the existing rescue/recovery modal
 * without altering wizard state, configuration mode, or firmware policy.
 * The path value is presentation-only — it never enters config strings,
 * manifests, kits, release-channel policy, or the install gate.
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

const PATH_VALUES = Object.freeze(['kit', 'custom', 'recovery']);

let currentMode = 'manual';
let currentPath = null;
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

// WF-UX-006 — Step 1 path selector. `kit` and `custom` are the two
// wizard paths; `recovery` is a side-door that opens the existing rescue
// modal without changing wizard state. `custom` is the canonical alias
// for the legacy `manual` configuration mode.
function setPath(path, { silent = false } = {}) {
    if (!PATH_VALUES.includes(path)) {
        return;
    }

    if (path === 'recovery') {
        currentPath = 'recovery';
        const startGroup = getStartPathsGroup();
        if (startGroup) {
            startGroup.setAttribute('data-start-path-active', 'recovery');
        }
        // The recovery card delegates to the existing rescue/recovery
        // modal. We don't import openRescueModal at module load time
        // because rescue-modal.js is loaded lazily by app.js, and a
        // direct import here would race the first paint of Step 1.
        // The static markup tags the button with `data-rescue-open`, so
        // the delegated click handler in scripts/layout/rescue-modal.js
        // takes care of opening the modal. We just record the path and
        // announce.
        if (!silent) {
            announce('Recovery path selected. Opening rescue and recovery mode.');
        }
        return;
    }

    currentPath = path;
    setMode(path === 'kit' ? 'kit' : 'manual', { silent });

    const startGroup = getStartPathsGroup();
    if (startGroup) {
        startGroup.setAttribute('data-start-path-active', path);
    }

    if (!silent) {
        announce(path === 'kit'
            ? 'Kit path selected.'
            : 'Custom configuration path selected.');
    }
}

function clearPath({ silent = true } = {}) {
    currentPath = null;
    const startGroup = getStartPathsGroup();
    if (startGroup) {
        startGroup.removeAttribute('data-start-path-active');
    }
    const kitPanel = getKitPanel();
    const manualPanel = getManualPanel();
    if (kitPanel) {
        kitPanel.hidden = true;
    }
    if (manualPanel) {
        manualPanel.hidden = true;
    }
    if (!silent) {
        announce('Returned to path selection.');
    }
}

function getStartPathsGroup() {
    return document.querySelector('[data-start-paths]');
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

    // WF-UX-006 — Step 1 path buttons. The recovery button also carries
    // `data-rescue-open` so the rescue-modal's delegated click handler
    // opens the dialog; `setPath('recovery')` only records state +
    // announces, it does not duplicate the modal-open call.
    const startGroup = getStartPathsGroup();
    if (startGroup) {
        startGroup.addEventListener('click', (event) => {
            const button = event.target.closest('[data-start-path]');
            if (!button || !startGroup.contains(button)) {
                return;
            }
            const path = button.dataset.startPath;
            if (!PATH_VALUES.includes(path)) {
                return;
            }
            if (path !== 'recovery') {
                event.preventDefault();
            }
            setPath(path);
        });
    }

    document.querySelectorAll('[data-start-path-back]').forEach(backBtn => {
        backBtn.addEventListener('click', (event) => {
            event.preventDefault();
            clearPath({ silent: false });
        });
    });

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
            setPath('custom');
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
    //
    // WF-UX-006: `configmode=custom` is the canonical alias for the legacy
    // `configmode=manual` keyword. Older saved share-links with `manual` keep
    // resolving to the custom path. We do not introduce a separate `path=`
    // URL key — the `configmode=` namespace already covers it.
    try {
        const params = new URLSearchParams(window.location.search || '');
        const configMode = (params.get('configmode') || '').toLowerCase();
        const sku = params.get('sku');

        if (configMode === 'manual' || configMode === 'custom') {
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

    // WF-UX-006 — when the static Step-1 path cards are present, the
    // three cards own which panel is initially visible: a fresh visit
    // shows the three buttons with both panels collapsed. When the
    // cards are absent (legacy fixtures + older test rigs), preserve
    // the historic behaviour of pre-revealing the kit panel so the
    // existing kit-mode tests + saved share-links keep working.
    const hasStartPaths = Boolean(getStartPathsGroup());
    if (!hasStartPaths) {
        setMode('kit', { silent: true });
    }

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
        if (hasStartPaths) {
            setPath('custom', { silent: true });
        } else {
            setMode('manual', { silent: true });
        }
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
            if (hasStartPaths) {
                setPath('kit', { silent: true });
            }
        } else {
            setError(`No kit found for SKU "${requested.sku}". Choose hardware manually or pick a kit from the list.`);
            if (hasStartPaths) {
                setPath('kit', { silent: true });
            }
        }
    } else if (hasStartPaths) {
        // configmode=kit with no SKU → reveal the kit panel so the user
        // can pick from the list. With no configmode markers at all,
        // leave the three cards visible.
        try {
            const params = new URLSearchParams(window.location.search || '');
            const configMode = (params.get('configmode') || '').toLowerCase();
            if (configMode === 'kit') {
                setPath('kit', { silent: true });
            }
        } catch {
            // ignore
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
    setPath,
    clearPath,
    handleKitSelection,
    applyKitToWizard,
    getCurrentMode: () => currentMode,
    getCurrentPath: () => currentPath,
    getActiveKitSku: () => activeKitSku
});
