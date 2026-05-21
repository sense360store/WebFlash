/**
 * @fileoverview Productized Sense360 kit bundle presets for Stage 1.
 *
 * WF-KIT-PRESETS-001 — Stage 1 of the WebFlash wizard leads with
 * customer-facing productized kit bundles instead of asking the user to
 * either type a SKU or walk the manual configuration flow. Each preset in
 * this list maps to a kit intent declared upstream in
 * `sense360store/esphome-public` under KIT-MATRIX-001 (PR #542). This file
 * is a *static, local mirror* of the upstream kit intent matrix — WebFlash
 * deliberately does not fetch the upstream file at runtime so the wizard
 * remains a fully static page. Bump this list when the upstream matrix
 * changes (with a follow-up `WF-KIT-PRESETS-NNN` PR).
 *
 * Status meanings:
 *   stable    — productized + installable today. `wizardState` and
 *               `firmwareConfigString` are required; both must resolve to a
 *               build present in `manifest.json` with `channel: 'stable'`.
 *   preview   — productized + installable today on the preview channel.
 *               `wizardState` and `firmwareConfigString` are required; the
 *               matching manifest build carries `channel: 'preview'`. Install
 *               still gates behind the existing release-channel acknowledgement
 *               in `scripts/utils/release-channels.js` — this module does NOT
 *               bypass that gate.
 *   planned   — kit intent declared upstream but no installable WebFlash
 *               firmware. `wizardState` and `firmwareConfigString` must be
 *               `null`; selecting the card surfaces an explanation rather
 *               than mutating wizard state. The card stays disabled until a
 *               future follow-up PR imports the corresponding firmware.
 *
 * IMPORTANT: every field here is presentation-only. None of this data enters
 * `manifest.json`, `firmware/sources.json`, `REQUIRED_CONFIGS`,
 * `scripts/data/kits.json`, or any install gate. Preset *existence* does not
 * imply installability — installability is still decided by the live
 * manifest, firmware-readiness logic, release-channel logic, and preflight.
 *
 * @module data/kit-presets
 */

const PLANNED_RESON_COPY = Object.freeze({
    fanReleaseTracking: 'Fan-driver kits depend on per-driver firmware builds upstream. WebFlash will surface this kit once the corresponding firmware lands and is imported via scripts/import-firmware-sources.py.'
});

const KIT_PRESETS_DATA = [
    {
        id: 'S360-KIT-BATH-POE',
        displayName: 'Sense360 Bathroom Kit — PoE',
        shortName: 'Bathroom Kit — PoE',
        description: 'Sense360 Core with the VentIQ bathroom air-quality module and the RoomIQ room sensor, powered over Ethernet. Recommended for production deployments.',
        status: 'stable',
        channel: 'stable',
        badge: 'Recommended',
        badgeTone: 'positive',
        warning: '',
        requiresPreviewAcknowledgement: false,
        firmwareConfigString: 'Ceiling-POE-VentIQ-RoomIQ',
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            roomiq: 'roomiq',
            ventiq: 'ventiq',
            airiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        },
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BATH-POE)',
        blockers: []
    },
    {
        id: 'S360-KIT-BATH-POE-LED',
        displayName: 'Sense360 Bathroom Kit — PoE + Status Ring Preview',
        shortName: 'Bathroom Kit — PoE + Status Ring Preview',
        description: 'Extends the Bathroom PoE kit with the Sense360 LED status ring. Preview firmware — requires acknowledging the preview channel before install.',
        status: 'preview',
        channel: 'preview',
        badge: 'Preview',
        badgeTone: 'warning',
        warning: 'Preview firmware is experimental and not validated for production deployments. The preview-channel acknowledgement on Step 5 must be checked before install.',
        requiresPreviewAcknowledgement: true,
        firmwareConfigString: 'Ceiling-POE-VentIQ-RoomIQ-LED',
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            roomiq: 'roomiq',
            ventiq: 'ventiq',
            airiq: 'none',
            fan: 'none',
            led: 'led',
            voice: 'none'
        },
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-300', label: 'Sense360 LED ring' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BATH-POE-LED)',
        blockers: [
            'S360-300-BENCH-001 — LED hardware bench verification',
            'WF-HW-TEST-001 / WF-HW-TEST-003 — operator-evidence proof for the LED flash path',
            'RELEASE-007 — upstream LED stable promotion'
        ]
    },
    {
        id: 'S360-KIT-BATH-RELAY',
        displayName: 'Sense360 Bathroom Kit — Relay Fan Control',
        shortName: 'Bathroom Kit — Relay Fan Control',
        description: 'Planned bathroom kit with the Sense360 Relay (S360-310) driving a single-speed bathroom fan. Not yet available in WebFlash.',
        status: 'planned',
        channel: null,
        badge: 'Planned',
        badgeTone: 'neutral',
        warning: '',
        requiresPreviewAcknowledgement: false,
        firmwareConfigString: null,
        wizardState: null,
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-310', label: 'Sense360 Relay' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BATH-RELAY)',
        notAvailableReason: 'Awaiting upstream RELEASE-RELAY-001 firmware import (WF-IMPORT-RELAY-001).',
        blockers: [
            'RELEASE-RELAY-001 — S360-310 firmware promotion',
            'WF-IMPORT-RELAY-001 — WebFlash import follow-up'
        ]
    },
    {
        id: 'S360-KIT-BATH-TRIAC',
        displayName: 'Sense360 Bathroom Kit — TRIAC Fan Control',
        shortName: 'Bathroom Kit — TRIAC Fan Control',
        description: 'Planned bathroom kit with the Sense360 TRIAC (S360-320) phase-dimmed fan control. Not yet available in WebFlash; mains-load compliance work is still open.',
        status: 'planned',
        channel: null,
        badge: 'Planned',
        badgeTone: 'neutral',
        warning: 'TRIAC controls mains-connected loads. The S360-320 hardware path is not compliance-certified by WebFlash and FanTRIAC firmware remains blocked from Release-One under HW-005.',
        requiresPreviewAcknowledgement: false,
        firmwareConfigString: null,
        wizardState: null,
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-320', label: 'Sense360 TRIAC' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BATH-TRIAC)',
        notAvailableReason: 'FanTRIAC is blocked from Release-One under HW-005 and no compliance-certified firmware has been imported. Tracked separately under WF-TRIAC-001 (in-installer warning UX) and WF-IMPORT-TRIAC-001 (future import).',
        blockers: [
            'HW-005 — S360-320 mains-load compliance',
            'RELEASE-TRIAC-001 — upstream firmware promotion',
            'WF-IMPORT-TRIAC-001 — WebFlash import follow-up'
        ]
    },
    {
        id: 'S360-KIT-DUCT-PWM',
        displayName: 'Sense360 Duct Fan Kit — PWM Fan Control',
        shortName: 'Duct Fan Kit — PWM Fan Control',
        description: 'Planned duct-fan kit driving up to four 12V PWM fans (Sense360 PWM, S360-311). Not yet available in WebFlash.',
        status: 'planned',
        channel: null,
        badge: 'Planned',
        badgeTone: 'neutral',
        warning: '',
        requiresPreviewAcknowledgement: false,
        firmwareConfigString: null,
        wizardState: null,
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-311', label: 'Sense360 PWM' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-DUCT-PWM)',
        notAvailableReason: PLANNED_RESON_COPY.fanReleaseTracking,
        blockers: [
            'RELEASE-PWM-001 — S360-311 firmware promotion',
            'WF-IMPORT-PWM-001 — WebFlash import follow-up'
        ]
    },
    {
        id: 'S360-KIT-DUCT-DAC',
        displayName: 'Sense360 Duct Fan Kit — 0–10V Fan Control',
        shortName: 'Duct Fan Kit — 0–10V Fan Control',
        description: 'Planned duct-fan kit driving a 0–10V analog fan (Sense360 DAC, S360-312, e.g. Cloudlift S12). Not yet available in WebFlash.',
        status: 'planned',
        channel: null,
        badge: 'Planned',
        badgeTone: 'neutral',
        warning: '',
        requiresPreviewAcknowledgement: false,
        firmwareConfigString: null,
        wizardState: null,
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-312', label: 'Sense360 DAC' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-DUCT-DAC)',
        notAvailableReason: PLANNED_RESON_COPY.fanReleaseTracking,
        blockers: [
            'RELEASE-DAC-001 — S360-312 firmware promotion',
            'WF-IMPORT-DAC-001 — WebFlash import follow-up'
        ]
    }
];

const VALID_STATUSES = Object.freeze(new Set(['stable', 'preview', 'planned']));
const REQUIRED_WIZARD_KEYS = Object.freeze(['mount', 'power']);
const SUPPORTED_MODULE_KEYS = Object.freeze(['airiq', 'ventiq', 'roomiq', 'fan', 'led', 'voice']);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freezeComponent(component) {
    return Object.freeze({
        sku: component.sku ? String(component.sku) : '',
        label: component.label ? String(component.label) : ''
    });
}

function freezeWizardState(state) {
    if (!isPlainObject(state)) {
        return null;
    }
    const normalised = { ...state };
    SUPPORTED_MODULE_KEYS.forEach(key => {
        if (normalised[key] === undefined || normalised[key] === null || normalised[key] === '') {
            normalised[key] = 'none';
        }
    });
    if (typeof normalised.bathroom !== 'boolean') {
        normalised.bathroom = Boolean(normalised.bathroom);
    }
    return Object.freeze(normalised);
}

function freezePreset(entry) {
    const components = Array.isArray(entry.components)
        ? entry.components.filter(item => isPlainObject(item)).map(freezeComponent)
        : [];
    return Object.freeze({
        id: String(entry.id || ''),
        displayName: String(entry.displayName || ''),
        shortName: String(entry.shortName || entry.displayName || ''),
        description: String(entry.description || ''),
        status: String(entry.status || ''),
        channel: entry.channel ? String(entry.channel) : null,
        badge: entry.badge ? String(entry.badge) : '',
        badgeTone: entry.badgeTone ? String(entry.badgeTone) : 'neutral',
        warning: entry.warning ? String(entry.warning) : '',
        requiresPreviewAcknowledgement: Boolean(entry.requiresPreviewAcknowledgement),
        firmwareConfigString: entry.firmwareConfigString ? String(entry.firmwareConfigString) : null,
        wizardState: freezeWizardState(entry.wizardState),
        components: Object.freeze(components),
        upstreamRef: String(entry.upstreamRef || ''),
        notAvailableReason: entry.notAvailableReason ? String(entry.notAvailableReason) : '',
        blockers: Object.freeze(Array.isArray(entry.blockers)
            ? entry.blockers.map(item => String(item))
            : [])
    });
}

/**
 * Frozen list of Stage 1 kit bundle presets. The order is the customer-facing
 * order — installable bundles first, planned bundles after.
 *
 * @type {ReadonlyArray<Readonly<Object>>}
 */
export const KIT_PRESETS = Object.freeze(KIT_PRESETS_DATA.map(freezePreset));

/**
 * Returns the preset with the matching id, or null. Match is case-insensitive
 * for the upstream SKU-style identifier.
 *
 * @param {string} id
 * @returns {Object|null}
 */
export function findKitPresetById(id) {
    if (typeof id !== 'string') {
        return null;
    }
    const target = id.trim().toUpperCase();
    if (!target) {
        return null;
    }
    return KIT_PRESETS.find(preset => preset.id.toUpperCase() === target) || null;
}

/**
 * True when the wizard configuration exactly matches a preset's wizardState.
 * Used by the controller to mark a preset card as the currently-active selection.
 *
 * @param {Object} state - Live wizard state (with `mounting` or `mount`).
 * @param {Object} preset
 * @returns {boolean}
 */
export function isPresetMatch(state, preset) {
    if (!preset || !preset.wizardState || !isPlainObject(state)) {
        return false;
    }
    const wizard = preset.wizardState;
    const mount = state.mounting || state.mount;
    if (mount !== wizard.mount) return false;
    if ((state.power || null) !== (wizard.power || null)) return false;
    if (Boolean(state.bathroom) !== Boolean(wizard.bathroom)) return false;
    return SUPPORTED_MODULE_KEYS.every(key => {
        const stateValue = state[key] || 'none';
        const wizardValue = wizard[key] || 'none';
        return stateValue === wizardValue;
    });
}

/**
 * True when the preset has a working installable mapping. Planned presets
 * return false. Stable and preview presets return true (gating still happens
 * downstream — preview presets still require the preview-channel acknowledgement
 * in `scripts/utils/release-channels.js`).
 *
 * @param {Object} preset
 * @returns {boolean}
 */
export function isPresetAvailable(preset) {
    return Boolean(
        preset
        && (preset.status === 'stable' || preset.status === 'preview')
        && preset.wizardState
        && preset.firmwareConfigString
    );
}

/**
 * Validates a preset entry. Used by the unit test pin so a malformed preset
 * can't slip through review.
 *
 * @param {Object} preset
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateKitPreset(preset) {
    const errors = [];
    if (!isPlainObject(preset)) {
        return { valid: false, errors: ['Preset is not an object.'] };
    }
    if (!preset.id || typeof preset.id !== 'string') {
        errors.push('Preset id is required.');
    }
    if (!preset.displayName) {
        errors.push('Preset displayName is required.');
    }
    if (!VALID_STATUSES.has(preset.status)) {
        errors.push(`Preset status must be one of stable | preview | planned (got ${preset.status}).`);
    }
    if (preset.status === 'stable' || preset.status === 'preview') {
        if (!preset.firmwareConfigString) {
            errors.push(`Preset ${preset.id} (${preset.status}) requires firmwareConfigString.`);
        }
        if (!isPlainObject(preset.wizardState)) {
            errors.push(`Preset ${preset.id} (${preset.status}) requires wizardState.`);
        } else {
            REQUIRED_WIZARD_KEYS.forEach(key => {
                if (!preset.wizardState[key]) {
                    errors.push(`Preset ${preset.id} wizardState.${key} is required.`);
                }
            });
        }
        if (preset.status === 'preview' && !preset.requiresPreviewAcknowledgement) {
            errors.push(`Preset ${preset.id} is preview but does not flag requiresPreviewAcknowledgement.`);
        }
    } else if (preset.status === 'planned') {
        if (preset.firmwareConfigString) {
            errors.push(`Preset ${preset.id} is planned and must NOT carry firmwareConfigString.`);
        }
        if (preset.wizardState) {
            errors.push(`Preset ${preset.id} is planned and must NOT carry wizardState (would silently mutate wizard).`);
        }
    }
    return { valid: errors.length === 0, errors };
}

export const SUPPORTED_KIT_PRESET_STATUSES = Object.freeze(['stable', 'preview', 'planned']);
