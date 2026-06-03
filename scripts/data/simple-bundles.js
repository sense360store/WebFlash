/**
 * @fileoverview WF-EASY-BUNDLE-PICKER-001 — Simple-install bundle catalogue.
 *
 * The default "Simple install" view used to resolve to a single fixed kit (the
 * stable Sense360 Bathroom PoE build). This module turns Simple install into an
 * easy bundle picker over the supported customer *bundle products* — one card
 * per buyable/installable room bundle — while keeping the stable Bathroom PoE
 * build the default and recommended choice.
 *
 * Each entry maps a customer-facing bundle SKU to a firmware `config_string`
 * that already exists in `manifest.json`. The picker NEVER invents a firmware
 * combination: every `firmwareConfigString` here resolves to a real build, and
 * `wizardState` is fed through the same `setState()` the wizard/kit flows use so
 * Step 5 resolves the exact same firmware, gates, and provenance.
 *
 * Why a `.js` data module (not `simple-bundles.json`):
 *   The wizard is a static, bundler-free page and the test runner uses native
 *   ESM with `transform: {}`. The established directly-imported data-module
 *   pattern is `scripts/data/kit-presets.js` (frozen export + helpers), which
 *   both the browser and Jest import natively with no fetch/JSON-assertion
 *   plumbing. This file mirrors that pattern.
 *
 * IMPORTANT — presentation-only / no-bypass invariants:
 *   - Nothing here enters `manifest.json`, `firmware/sources.json`,
 *     `REQUIRED_CONFIGS`, or `scripts/data/kits.json`. Bundle *existence* never
 *     implies installability — the live manifest, firmware-readiness,
 *     release-channel acknowledgement, provenance, freshness, and preflight
 *     engines stay authoritative.
 *   - `channel: 'preview'` bundles still gate behind the release-channel
 *     preview acknowledgement in `scripts/utils/release-channels.js` at install
 *     time. The picker only *surfaces* the requirement; it never satisfies it.
 *   - The Bathroom Relay bundle additionally requires a fan-control
 *     acknowledgement (`requiresFanControlAcknowledgement: true`) on top of the
 *     preview acknowledgement. This is a *stronger* gate, never a weaker one.
 *   - `buyable` marks shop-ready bundles. Only the stable Bathroom PoE bundle is
 *     buyable today; preview bundles are firmware-build proof only — not stable,
 *     not recommended, not a customer default, not buyable.
 *
 * WF-UX-008 — customer-facing vs developer-only fields.
 *   Customer-facing (rendered): `displayName`, `shortName`, `room`, `useCase`,
 *   `description`, `badges`, `moduleSummary`, `components`, `warning`. These MUST
 *   stay free of internal task / release / tracking IDs and read as plain
 *   language. Developer/support-only (NEVER rendered): `upstreamRef`.
 *
 * Bundle set (upstream #712 — only Bathroom Relay has a built full fan-control
 * room-bundle config today; FanPWM / FanDAC ship only as standalone manual
 * previews and are NOT room-bundle products, so they are intentionally absent
 * here; FanTRIAC stays build-blocked):
 *   - S360-KIT-BATH-P       Bathroom Bundle — PoE                 (stable, default)
 *   - S360-KIT-KITCHEN-P    Kitchen Bundle — PoE                  (preview)
 *   - S360-KIT-BEDROOM-P    Bedroom Bundle — PoE                  (preview)
 *   - S360-KIT-LIVING-P     Living Room Bundle — PoE              (preview)
 *   - S360-KIT-CORRIDOR-P   Landing / Corridor Bundle — PoE       (preview)
 *   - S360-KIT-BATH-P-REL   Bathroom Bundle — PoE + Relay Fan     (preview + fan-control)
 *
 * @module data/simple-bundles
 */

const PREVIEW_WARNING = 'Preview firmware is experimental and is not validated for production. It is not the recommended choice for most customers. You must acknowledge the preview channel before installing — the stable Bathroom Bundle — PoE is the supported default.';

const FAN_CONTROL_WARNING = 'This bundle drives a bathroom fan through the Sense360 Relay. As well as the preview-channel acknowledgement, you must confirm the fan-control acknowledgement before installing, and you are responsible for the fan wiring and local safety rules. It is preview firmware — not stable, not recommended, and not a customer default. Use the stable Bathroom Bundle — PoE for a normal install.';

const SIMPLE_BUNDLES_DATA = [
    {
        id: 'S360-KIT-BATH-P',
        displayName: 'Bathroom Bundle — PoE',
        shortName: 'Bathroom — PoE',
        room: 'Bathroom',
        useCase: 'Bathroom presence and air-quality sensing, powered over Ethernet. The supported install for most customers.',
        description: 'Sense360 Core with the RoomIQ room sensor and the VentIQ bathroom air-quality module, powered over Ethernet. This is the stable, recommended Sense360 kit.',
        firmwareConfigString: 'Ceiling-POE-VentIQ-RoomIQ',
        channel: 'stable',
        badges: ['Recommended'],
        badgeTone: 'positive',
        recommended: true,
        isDefault: true,
        requiresPreviewAcknowledgement: false,
        requiresFanControlAcknowledgement: false,
        buyable: true,
        warning: '',
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'VentIQ bathroom air sensing',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
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
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BATH-P) — stable Release-One Ceiling-POE-VentIQ-RoomIQ'
    },
    {
        id: 'S360-KIT-KITCHEN-P',
        displayName: 'Kitchen Bundle — PoE',
        shortName: 'Kitchen — PoE',
        room: 'Kitchen',
        useCase: 'Kitchen presence and broad air-quality sensing (CO₂, VOC, gas), powered over Ethernet.',
        description: 'Sense360 Core with the RoomIQ room sensor and the AirIQ air-quality module, powered over Ethernet. Preview firmware — acknowledge the preview channel before installing.',
        firmwareConfigString: 'Ceiling-POE-AirIQ-RoomIQ',
        channel: 'preview',
        badges: ['Preview'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: false,
        buyable: false,
        warning: PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'AirIQ air-quality sensing',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-210', label: 'Sense360 AirIQ' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-KITCHEN-P) — preview Ceiling-POE-AirIQ-RoomIQ'
    },
    {
        id: 'S360-KIT-BEDROOM-P',
        displayName: 'Bedroom Bundle — PoE',
        shortName: 'Bedroom — PoE',
        room: 'Bedroom',
        useCase: 'Bedroom presence and comfort sensing, powered over Ethernet.',
        description: 'Sense360 Core with the RoomIQ room sensor, powered over Ethernet. Preview firmware — acknowledge the preview channel before installing.',
        firmwareConfigString: 'Ceiling-POE-RoomIQ',
        channel: 'preview',
        badges: ['Preview'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: false,
        buyable: false,
        warning: PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            airiq: 'none',
            ventiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BEDROOM-P) — preview Ceiling-POE-RoomIQ'
    },
    {
        id: 'S360-KIT-LIVING-P',
        displayName: 'Living Room Bundle — PoE',
        shortName: 'Living Room — PoE',
        room: 'Living room',
        useCase: 'Living-room presence sensing with the LED status ring, powered over Ethernet.',
        description: 'Sense360 Core with the RoomIQ room sensor and the LED status ring, powered over Ethernet. Preview firmware — acknowledge the preview channel before installing.',
        firmwareConfigString: 'Ceiling-POE-RoomIQ-LED',
        channel: 'preview',
        badges: ['Preview'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: false,
        buyable: false,
        warning: PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'LED status ring',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-300', label: 'Sense360 LED' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            led: 'led',
            airiq: 'none',
            ventiq: 'none',
            fan: 'none',
            voice: 'none'
        },
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-LIVING-P) — preview Ceiling-POE-RoomIQ-LED'
    },
    {
        id: 'S360-KIT-CORRIDOR-P',
        displayName: 'Landing / Corridor Bundle — PoE',
        shortName: 'Landing / Corridor — PoE',
        room: 'Landing / corridor',
        useCase: 'Landing or corridor presence sensing with the LED status ring, powered over Ethernet.',
        description: 'Sense360 Core with the RoomIQ room sensor and the LED status ring, powered over Ethernet — tuned for landings and corridors. Preview firmware — acknowledge the preview channel before installing.',
        firmwareConfigString: 'Ceiling-POE-RoomIQ-LED',
        channel: 'preview',
        badges: ['Preview'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: false,
        buyable: false,
        warning: PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'LED status ring',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-300', label: 'Sense360 LED' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            led: 'led',
            airiq: 'none',
            ventiq: 'none',
            fan: 'none',
            voice: 'none'
        },
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-CORRIDOR-P) — preview Ceiling-POE-RoomIQ-LED (shares the Living Room build)'
    },
    {
        id: 'S360-KIT-BATH-P-REL',
        displayName: 'Bathroom Bundle — PoE + Relay Fan Control',
        shortName: 'Bathroom — PoE + Relay',
        room: 'Bathroom (with fan)',
        useCase: 'Bathroom presence and air-quality sensing plus on/off fan control through the Sense360 Relay, powered over Ethernet.',
        description: 'The Bathroom PoE bundle plus the Sense360 Relay for on/off bathroom fan control. Preview firmware with an extra fan-control acknowledgement — not the recommended choice for most customers.',
        firmwareConfigString: 'Ceiling-POE-VentIQ-FanRelay-RoomIQ',
        channel: 'preview',
        badges: ['Preview', 'Fan control'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: true,
        buyable: false,
        warning: FAN_CONTROL_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'VentIQ bathroom air sensing',
            'Relay fan control',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-310', label: 'Sense360 Relay' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            roomiq: 'roomiq',
            ventiq: 'ventiq',
            fan: 'relay',
            airiq: 'none',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'KIT-MATRIX-001 (S360-KIT-BATH-P-REL) — preview Ceiling-POE-VentIQ-FanRelay-RoomIQ; upstream #712 (only built full fan-control room bundle)'
    }
];

const VALID_CHANNELS = Object.freeze(new Set(['stable', 'preview']));
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

function freezeBundle(entry) {
    const components = Array.isArray(entry.components)
        ? entry.components.filter(item => isPlainObject(item)).map(freezeComponent)
        : [];
    return Object.freeze({
        id: String(entry.id || ''),
        displayName: String(entry.displayName || ''),
        shortName: String(entry.shortName || entry.displayName || ''),
        room: String(entry.room || ''),
        useCase: String(entry.useCase || ''),
        description: String(entry.description || ''),
        firmwareConfigString: entry.firmwareConfigString ? String(entry.firmwareConfigString) : null,
        channel: String(entry.channel || ''),
        badges: Object.freeze(Array.isArray(entry.badges) ? entry.badges.map(b => String(b)) : []),
        badgeTone: entry.badgeTone ? String(entry.badgeTone) : 'neutral',
        recommended: Boolean(entry.recommended),
        isDefault: Boolean(entry.isDefault),
        requiresPreviewAcknowledgement: Boolean(entry.requiresPreviewAcknowledgement),
        requiresFanControlAcknowledgement: Boolean(entry.requiresFanControlAcknowledgement),
        buyable: Boolean(entry.buyable),
        warning: entry.warning ? String(entry.warning) : '',
        moduleSummary: Object.freeze(Array.isArray(entry.moduleSummary)
            ? entry.moduleSummary.map(item => String(item))
            : []),
        components: Object.freeze(components),
        wizardState: freezeWizardState(entry.wizardState),
        upstreamRef: String(entry.upstreamRef || '')
    });
}

/**
 * Frozen, ordered list of Simple-install bundle products. The order is the
 * customer-facing order — the stable/recommended Bathroom bundle leads.
 *
 * @type {ReadonlyArray<Readonly<Object>>}
 */
export const SIMPLE_BUNDLES = Object.freeze(SIMPLE_BUNDLES_DATA.map(freezeBundle));

/**
 * Case-insensitive lookup by bundle SKU. Returns the bundle or null.
 *
 * @param {string} id
 * @returns {Object|null}
 */
export function findSimpleBundleById(id) {
    if (typeof id !== 'string') {
        return null;
    }
    const target = id.trim().toUpperCase();
    if (!target) {
        return null;
    }
    return SIMPLE_BUNDLES.find(bundle => bundle.id.toUpperCase() === target) || null;
}

/**
 * The default + recommended bundle (the stable Bathroom PoE build). Falls back
 * to the first bundle if no explicit default is flagged.
 *
 * @returns {Object}
 */
export function getDefaultSimpleBundle() {
    return SIMPLE_BUNDLES.find(bundle => bundle.isDefault) || SIMPLE_BUNDLES[0];
}

/**
 * True when the bundle resolves to a firmware build (every bundle here is
 * installable; the helper exists so callers don't reach into shape details).
 * Installability is still gated downstream by the live manifest, readiness,
 * release-channel acknowledgement, provenance, freshness, and preflight.
 *
 * @param {Object} bundle
 * @returns {boolean}
 */
export function isSimpleBundleInstallable(bundle) {
    return Boolean(
        bundle
        && VALID_CHANNELS.has(bundle.channel)
        && bundle.firmwareConfigString
        && bundle.wizardState
    );
}

/**
 * True when the bundle's firmware is on the preview channel (so install gates
 * behind the release-channel preview acknowledgement).
 *
 * @param {Object} bundle
 * @returns {boolean}
 */
export function isSimpleBundlePreview(bundle) {
    return Boolean(bundle && bundle.channel === 'preview');
}

/**
 * Validate a single bundle entry. Used by the unit-test pin so a malformed
 * bundle can't slip through review.
 *
 * @param {Object} bundle
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSimpleBundle(bundle) {
    const errors = [];
    if (!isPlainObject(bundle)) {
        return { valid: false, errors: ['Bundle is not an object.'] };
    }
    if (!bundle.id || typeof bundle.id !== 'string') {
        errors.push('Bundle id is required.');
    }
    if (!bundle.displayName) {
        errors.push('Bundle displayName is required.');
    }
    if (!VALID_CHANNELS.has(bundle.channel)) {
        errors.push(`Bundle ${bundle.id} channel must be stable | preview (got ${bundle.channel}).`);
    }
    if (!bundle.firmwareConfigString) {
        errors.push(`Bundle ${bundle.id} requires firmwareConfigString.`);
    }
    if (!isPlainObject(bundle.wizardState)) {
        errors.push(`Bundle ${bundle.id} requires wizardState.`);
    } else {
        REQUIRED_WIZARD_KEYS.forEach(key => {
            if (!bundle.wizardState[key]) {
                errors.push(`Bundle ${bundle.id} wizardState.${key} is required.`);
            }
        });
    }
    // Channel ↔ acknowledgement consistency.
    if (bundle.channel === 'preview' && !bundle.requiresPreviewAcknowledgement) {
        errors.push(`Bundle ${bundle.id} is preview but does not flag requiresPreviewAcknowledgement.`);
    }
    if (bundle.channel === 'stable' && bundle.requiresPreviewAcknowledgement) {
        errors.push(`Bundle ${bundle.id} is stable but flags requiresPreviewAcknowledgement.`);
    }
    // Stable + recommended/default/buyable consistency: only a stable bundle may
    // be recommended, default, or buyable.
    if (bundle.channel !== 'stable') {
        if (bundle.recommended) {
            errors.push(`Bundle ${bundle.id} is ${bundle.channel} but flagged recommended.`);
        }
        if (bundle.isDefault) {
            errors.push(`Bundle ${bundle.id} is ${bundle.channel} but flagged default.`);
        }
        if (bundle.buyable) {
            errors.push(`Bundle ${bundle.id} is ${bundle.channel} but flagged buyable.`);
        }
    }
    // A fan-control bundle must also carry a preview acknowledgement (the
    // fan-control gate is additional, never a replacement).
    if (bundle.requiresFanControlAcknowledgement && !bundle.requiresPreviewAcknowledgement) {
        errors.push(`Bundle ${bundle.id} requires a fan-control acknowledgement but not a preview acknowledgement.`);
    }
    return { valid: errors.length === 0, errors };
}

export const SUPPORTED_SIMPLE_BUNDLE_CHANNELS = Object.freeze(['stable', 'preview']);
