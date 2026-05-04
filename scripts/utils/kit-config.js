/**
 * @fileoverview Kit / SKU configuration helpers.
 *
 * The customer-friendly configuration mode lets a user pick a kit they
 * purchased instead of walking the per-module wizard. This module owns the
 * kit catalogue (loaded from scripts/data/kits.json) plus the deterministic
 * mapping from a kit entry to wizard state. It deliberately does NOT touch
 * firmware selection, provenance, or release-channel logic — kit selection
 * just sets the same state keys a user would set manually, and the existing
 * compatible-firmware lookup in state.js takes over from there.
 *
 * @module utils/kit-config
 */

const KIT_DATA_URL = './scripts/data/kits.json';
const SUPPORTED_SCHEMA_VERSION = 1;

const REQUIRED_KIT_FIELDS = Object.freeze([
    'sku',
    'display_name',
    'wizard_state',
    'firmware_config_string'
]);

const REQUIRED_WIZARD_STATE_KEYS = Object.freeze(['mount', 'power']);
const SUPPORTED_MOUNTS = Object.freeze(new Set(['ceiling']));
const SUPPORTED_POWER_VALUES = Object.freeze(new Set(['usb', 'poe', 'pwr']));
const SUPPORTED_MODULE_KEYS = Object.freeze(['airiq', 'ventiq', 'roomiq', 'fan', 'led', 'voice']);
const VALID_CHANNELS = Object.freeze(new Set(['stable', 'beta', 'preview', 'dev']));

let cachedCatalogPromise = null;

function normaliseSku(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateKitEntry(entry) {
    const errors = [];

    if (!isPlainObject(entry)) {
        return { valid: false, errors: ['Kit entry is not an object.'] };
    }

    REQUIRED_KIT_FIELDS.forEach(field => {
        if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
            errors.push(`Missing required kit field: ${field}.`);
        }
    });

    const wizardState = entry.wizard_state;
    if (!isPlainObject(wizardState)) {
        errors.push('wizard_state must be an object.');
    } else {
        REQUIRED_WIZARD_STATE_KEYS.forEach(key => {
            if (!wizardState[key]) {
                errors.push(`wizard_state.${key} is required.`);
            }
        });

        if (wizardState.mount && !SUPPORTED_MOUNTS.has(String(wizardState.mount).toLowerCase())) {
            errors.push(`Unsupported wizard_state.mount value: ${wizardState.mount}.`);
        }

        if (wizardState.power && !SUPPORTED_POWER_VALUES.has(String(wizardState.power).toLowerCase())) {
            errors.push(`Unsupported wizard_state.power value: ${wizardState.power}.`);
        }
    }

    if (entry.firmware_channel && !VALID_CHANNELS.has(String(entry.firmware_channel).toLowerCase())) {
        errors.push(`Unsupported firmware_channel: ${entry.firmware_channel}.`);
    }

    return { valid: errors.length === 0, errors };
}

function freezeKit(entry) {
    const wizardState = isPlainObject(entry.wizard_state) ? { ...entry.wizard_state } : {};
    if (typeof wizardState.bathroom !== 'boolean') {
        wizardState.bathroom = Boolean(wizardState.bathroom);
    }
    SUPPORTED_MODULE_KEYS.forEach(key => {
        if (wizardState[key] === undefined || wizardState[key] === null || wizardState[key] === '') {
            wizardState[key] = 'none';
        }
    });

    const components = Array.isArray(entry.components)
        ? entry.components
            .filter(component => isPlainObject(component) && (component.sku || component.label))
            .map(component => Object.freeze({
                sku: component.sku ? String(component.sku) : '',
                label: component.label ? String(component.label) : ''
            }))
        : [];

    return Object.freeze({
        sku: normaliseSku(entry.sku),
        display_name: String(entry.display_name || ''),
        description: entry.description ? String(entry.description) : '',
        recommended: Boolean(entry.recommended),
        sample: Boolean(entry.sample),
        wizard_state: Object.freeze(wizardState),
        components: Object.freeze(components),
        headers_required: Array.isArray(entry.headers_required)
            ? Object.freeze(entry.headers_required.map(item => String(item)))
            : Object.freeze([]),
        firmware_config_string: String(entry.firmware_config_string || ''),
        firmware_channel: entry.firmware_channel ? String(entry.firmware_channel).toLowerCase() : 'stable',
        product_url: entry.product_url ? String(entry.product_url) : '',
        image: entry.image ? String(entry.image) : '',
        notes: Array.isArray(entry.notes) ? Object.freeze(entry.notes.map(item => String(item))) : Object.freeze([]),
        known_limitations: Array.isArray(entry.known_limitations)
            ? Object.freeze(entry.known_limitations.map(item => String(item)))
            : Object.freeze([])
    });
}

/**
 * @typedef {Object} KitCatalog
 * @property {number} schema_version
 * @property {ReadonlyArray<Object>} kits  - Validated kit entries (frozen).
 * @property {ReadonlyArray<{sku: string, errors: string[]}>} skipped - Entries that failed validation.
 */

/**
 * Builds a catalog from a raw JSON payload. Invalid entries are skipped so
 * a malformed kit doesn't take down the whole wizard.
 *
 * @param {unknown} payload
 * @returns {KitCatalog}
 */
function buildCatalogFromPayload(payload) {
    if (!isPlainObject(payload)) {
        return { schema_version: SUPPORTED_SCHEMA_VERSION, kits: Object.freeze([]), skipped: Object.freeze([]) };
    }

    const declaredVersion = Number(payload.schema_version);
    if (Number.isFinite(declaredVersion) && declaredVersion > SUPPORTED_SCHEMA_VERSION) {
        // Future-version kit data: refuse rather than guess at unknown fields.
        return { schema_version: SUPPORTED_SCHEMA_VERSION, kits: Object.freeze([]), skipped: Object.freeze([]) };
    }

    const rawKits = Array.isArray(payload.kits) ? payload.kits : [];
    const seenSkus = new Set();
    const kits = [];
    const skipped = [];

    rawKits.forEach(rawEntry => {
        const { valid, errors } = validateKitEntry(rawEntry);
        if (!valid) {
            skipped.push(Object.freeze({
                sku: normaliseSku(rawEntry?.sku) || '',
                errors: Object.freeze(errors)
            }));
            return;
        }

        const frozen = freezeKit(rawEntry);
        if (!frozen.sku || seenSkus.has(frozen.sku)) {
            skipped.push(Object.freeze({
                sku: frozen.sku,
                errors: Object.freeze(['Duplicate or empty SKU.'])
            }));
            return;
        }

        seenSkus.add(frozen.sku);
        kits.push(frozen);
    });

    return Object.freeze({
        schema_version: SUPPORTED_SCHEMA_VERSION,
        kits: Object.freeze(kits),
        skipped: Object.freeze(skipped)
    });
}

/**
 * Loads the kit catalog from KIT_DATA_URL. Subsequent calls return the same
 * cached promise so the wizard never re-fetches.
 *
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<KitCatalog>}
 */
function loadKitCatalog({ fetchImpl } = {}) {
    if (cachedCatalogPromise) {
        return cachedCatalogPromise;
    }

    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) {
        cachedCatalogPromise = Promise.resolve(buildCatalogFromPayload(null));
        return cachedCatalogPromise;
    }

    cachedCatalogPromise = fetcher(KIT_DATA_URL, { cache: 'no-store' })
        .then(response => {
            if (!response || !response.ok) {
                throw new Error(`Kit catalog fetch failed: ${response ? response.status : 'no response'}`);
            }
            return response.json();
        })
        .then(payload => buildCatalogFromPayload(payload))
        .catch(error => {
            console.warn('[kit-config] Failed to load kit catalog', error);
            return buildCatalogFromPayload(null);
        });

    return cachedCatalogPromise;
}

function resetCatalogCacheForTests() {
    cachedCatalogPromise = null;
}

/**
 * Looks up a kit by SKU. Match is case- and whitespace-insensitive.
 *
 * @param {KitCatalog} catalog
 * @param {string} sku
 * @returns {Object|null} The matching kit entry, or null if not found.
 */
function findKitBySku(catalog, sku) {
    if (!catalog || !Array.isArray(catalog.kits)) {
        return null;
    }
    const target = normaliseSku(sku);
    if (!target) {
        return null;
    }
    return catalog.kits.find(entry => entry.sku === target) || null;
}

/**
 * Maps a kit entry to the state shape consumed by setState() in state.js.
 *
 * @param {Object} kit
 * @returns {Object} Wizard state object suitable for setState().
 */
function mapKitToWizardState(kit) {
    if (!kit || !isPlainObject(kit.wizard_state)) {
        return {};
    }

    const state = { ...kit.wizard_state };

    // Defensive normalisation — the catalog freezer already does this but
    // tests may pass synthetic kits in.
    SUPPORTED_MODULE_KEYS.forEach(key => {
        if (state[key] === undefined || state[key] === null || state[key] === '') {
            state[key] = 'none';
        }
    });

    if (typeof state.bathroom !== 'boolean') {
        state.bathroom = Boolean(state.bathroom);
    }

    return state;
}

/**
 * Returns a human-readable list of selected modules for the explanation
 * panel ("This kit maps to: AirIQ, Fan PWM ...").
 *
 * @param {Object} kit
 * @returns {string[]}
 */
function summariseKitModules(kit) {
    if (!kit || !isPlainObject(kit.wizard_state)) {
        return [];
    }

    const summaries = [];
    const state = kit.wizard_state;
    if (state.airiq && state.airiq !== 'none') {
        summaries.push('AirIQ');
    }
    if (state.ventiq && state.ventiq !== 'none') {
        summaries.push('VentIQ');
    }
    if (state.roomiq && state.roomiq !== 'none') {
        summaries.push('RoomIQ');
    }
    if (state.fan && state.fan !== 'none') {
        const labels = { relay: 'Fan Relay', pwm: 'Fan PWM', analog: 'Fan DAC', triac: 'TRIAC' };
        summaries.push(labels[state.fan] || 'Fan driver');
    }
    if (state.led && state.led !== 'none') {
        summaries.push('LED');
    }
    return summaries;
}

export {
    KIT_DATA_URL,
    SUPPORTED_SCHEMA_VERSION,
    buildCatalogFromPayload,
    findKitBySku,
    loadKitCatalog,
    mapKitToWizardState,
    normaliseSku,
    resetCatalogCacheForTests,
    summariseKitModules,
    validateKitEntry
};
