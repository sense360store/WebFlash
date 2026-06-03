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
        // WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — the third, strongest gate, for
        // the 0–10V analog fan-control bundles: the installer must confirm the
        // GP8403 address-switch setting before install. Defaults false for every
        // bundle that does not drive an analog (0–10V) fan.
        requiresDacAddressAcknowledgement: Boolean(entry.requiresDacAddressAcknowledgement),
        // Which fan driver the bundle wires (relay | pwm | dac), or '' when the
        // bundle drives no fan. Presentation/classification only.
        fanDriver: entry.fanDriver ? String(entry.fanDriver) : '',
        buyable: Boolean(entry.buyable),
        warning: entry.warning ? String(entry.warning) : '',
        // Customer-facing address-switch acknowledgement copy (analog fan bundles
        // only). Plain language — it names the GP8403 addresses (0x58 / 0x5A) and
        // the forbidden 0x59, but never an internal task/release/tracking ID.
        dacAddressAcknowledgement: entry.dacAddressAcknowledgement ? String(entry.dacAddressAcknowledgement) : '',
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

/* ===========================================================================
   WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 — full-composition fan-control room
   bundles.
   ===========================================================================

   These are the Bathroom / Kitchen room bundles that ALSO drive a fan, built on
   top of the upstream full-composition fan-control preview configs (a fan-only
   firmware — `Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC` — is NEVER substituted;
   every entry carries the room-sensing modules PLUS the fan driver). TRIAC is
   deliberately excluded — it stays build-blocked upstream.

   Critically, these are kept SEPARATE from `SIMPLE_BUNDLES` and are
   import-gated: a fan-control card is only ever exposed in Simple install when
   its exact firmware `config_string` is present in the LIVE manifest (which only
   happens after a firmware-import PR has fetched the signed `.bin`, written the
   `.meta.json` sidecar, pinned the SHA-256 in `firmware/sources.json`, and
   regenerated `manifest.json`). Declaring a bundle here NEVER makes it
   installable — `getExposableFanControlBundles(manifestConfigStrings)` is the
   gate, and `manifest.json` is the source of truth.

   As of this change NONE of the five firmware configs has been compiled,
   published, or imported (the upstream room-bundle fan configs are
   metadata-only / compile-pending), so `getExposableFanControlBundles` against
   the live manifest returns an empty list and Simple install shows exactly the
   original six bundle cards. The definitions + gate + acknowledgement plumbing
   are staged so a future firmware-import PR lights up the matching card with no
   further wizard code change.

   Acknowledgement model (each is STRONGER than, never a replacement for, the
   ones before it):
     1. preview-channel acknowledgement   (release-channels.js, owned by state.js)
     2. fan-control acknowledgement        (every fan-control bundle)
     3. analog-fan address-switch ack      (the 0–10V / analog-driver bundles only)
*/

const FAN_CONTROL_PREVIEW_WARNING = 'This is preview fan-control firmware for installer and developer validation. It is not for normal production installs — it is not stable, not recommended, and not a customer default, and no hardware, bench, compliance, safety, or commercial-availability testing has been completed. You must accept both the preview-channel and the fan-control acknowledgements before installing. The stable Bathroom Bundle — PoE is the supported choice for most customers.';

const FAN_CONTROL_DAC_WARNING = 'This is preview 0–10V (analog / EC-fan / MVHR-style) fan-control firmware for installer and developer validation. As well as the preview-channel and fan-control acknowledgements, you must confirm the analog fan driver’s address-switch setting before installing: the GP8403 driver must be switched so IC1 uses 0x58 and IC2 uses 0x5A. Address 0x59 must not be used, because the room air-quality sensor already uses it on the shared bus. This address has not been physically verified. It is not stable, not recommended, not a customer default, and no hardware, bench, compliance, safety, or commercial-availability testing has been completed.';

const FAN_CONTROL_DAC_ADDRESS_ACK = 'I have set the analog fan driver (GP8403) address switches so IC1 uses 0x58 and IC2 uses 0x5A. I understand 0x59 must not be used with the room air-quality sensor on the shared bus, and that this address setting has not been physically verified.';

const FAN_CONTROL_BUNDLES_DATA = [
    {
        id: 'S360-KIT-BATH-P-PWM',
        displayName: 'Bathroom Bundle — PoE + PWM Fan Control',
        shortName: 'Bathroom — PoE + PWM',
        room: 'Bathroom (with fan)',
        useCase: 'Bathroom presence and air-quality sensing plus low-voltage PWM fan-speed control, powered over Ethernet.',
        description: 'The Bathroom PoE bundle plus low-voltage PWM fan-speed control through the Sense360 PWM driver. Preview fan-control firmware for installer and developer validation — not the recommended choice for most customers.',
        firmwareConfigString: 'Ceiling-POE-VentIQ-FanPWM-RoomIQ',
        channel: 'preview',
        fanDriver: 'pwm',
        badges: ['Preview', 'Fan control'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: true,
        requiresDacAddressAcknowledgement: false,
        buyable: false,
        warning: FAN_CONTROL_PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'VentIQ bathroom air sensing',
            'PWM fan-speed control',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-311', label: 'Sense360 PWM' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            roomiq: 'roomiq',
            ventiq: 'ventiq',
            airiq: 'none',
            fan: 'pwm',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'ROOM-BUNDLE-FAN-CONFIGS-001 / upstream #713 (S360-KIT-BATH-P-PWM) — Ceiling-POE-VentIQ-FanPWM-RoomIQ; buildable-preview-compile-pending, no published artifact yet'
    },
    {
        id: 'S360-KIT-BATH-P-DAC',
        displayName: 'Bathroom Bundle — PoE + 0–10V Fan Control',
        shortName: 'Bathroom — PoE + 0–10V',
        room: 'Bathroom (with fan)',
        useCase: 'Bathroom presence and air-quality sensing plus 0–10V analog (EC fan / MVHR-style) fan-speed control, powered over Ethernet.',
        description: 'The Bathroom PoE bundle plus 0–10V analog fan-speed control through the Sense360 analog fan driver. Preview fan-control firmware with an extra address-switch step for installer and developer validation — not the recommended choice for most customers.',
        firmwareConfigString: 'Ceiling-POE-VentIQ-FanDAC-RoomIQ',
        channel: 'preview',
        fanDriver: 'dac',
        badges: ['Preview', 'Fan control'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: true,
        requiresDacAddressAcknowledgement: true,
        buyable: false,
        warning: FAN_CONTROL_DAC_WARNING,
        dacAddressAcknowledgement: FAN_CONTROL_DAC_ADDRESS_ACK,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'VentIQ bathroom air sensing',
            '0–10V analog fan-speed control',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-211', label: 'Sense360 VentIQ' },
            { sku: 'S360-312', label: 'Sense360 DAC' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            roomiq: 'roomiq',
            ventiq: 'ventiq',
            airiq: 'none',
            fan: 'analog',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'ROOM-BUNDLE-FAN-CONFIGS-001 / upstream #713 (S360-KIT-BATH-P-DAC) — Ceiling-POE-VentIQ-FanDAC-RoomIQ; buildable-preview-compile-pending; address policy FANDAC-I2C-ADDR-001 (PENDING); no published artifact yet'
    },
    {
        id: 'S360-KIT-KITCHEN-P-REL',
        displayName: 'Kitchen Bundle — PoE + Relay Extract Control',
        shortName: 'Kitchen — PoE + Relay',
        room: 'Kitchen (with fan)',
        useCase: 'Kitchen presence and broad air-quality sensing plus on/off relay extract-fan control, powered over Ethernet.',
        description: 'The Kitchen PoE bundle plus on/off relay extract / boost control through the Sense360 Relay. Preview fan-control firmware for installer and developer validation — not the recommended choice for most customers.',
        firmwareConfigString: 'Ceiling-POE-AirIQ-FanRelay-RoomIQ',
        channel: 'preview',
        fanDriver: 'relay',
        badges: ['Preview', 'Fan control'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: true,
        requiresDacAddressAcknowledgement: false,
        buyable: false,
        warning: FAN_CONTROL_PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'AirIQ air-quality sensing',
            'Relay extract / boost control',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-210', label: 'Sense360 AirIQ' },
            { sku: 'S360-310', label: 'Sense360 Relay' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'relay',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'ROOM-BUNDLE-FAN-CONFIGS-001 / upstream #713 (S360-KIT-KITCHEN-P-REL) — Ceiling-POE-AirIQ-FanRelay-RoomIQ; buildable-preview-compile-pending, no published artifact yet'
    },
    {
        id: 'S360-KIT-KITCHEN-P-PWM',
        displayName: 'Kitchen Bundle — PoE + PWM Extract Control',
        shortName: 'Kitchen — PoE + PWM',
        room: 'Kitchen (with fan)',
        useCase: 'Kitchen presence and broad air-quality sensing plus low-voltage PWM extract-fan control, powered over Ethernet.',
        description: 'The Kitchen PoE bundle plus low-voltage PWM extract-fan control through the Sense360 PWM driver. Preview fan-control firmware for installer and developer validation — not the recommended choice for most customers.',
        firmwareConfigString: 'Ceiling-POE-AirIQ-FanPWM-RoomIQ',
        channel: 'preview',
        fanDriver: 'pwm',
        badges: ['Preview', 'Fan control'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: true,
        requiresDacAddressAcknowledgement: false,
        buyable: false,
        warning: FAN_CONTROL_PREVIEW_WARNING,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'AirIQ air-quality sensing',
            'PWM extract-fan control',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-210', label: 'Sense360 AirIQ' },
            { sku: 'S360-311', label: 'Sense360 PWM' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'pwm',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'ROOM-BUNDLE-FAN-CONFIGS-001 / upstream #713 (S360-KIT-KITCHEN-P-PWM) — Ceiling-POE-AirIQ-FanPWM-RoomIQ; buildable-preview-compile-pending, no published artifact yet'
    },
    {
        id: 'S360-KIT-KITCHEN-P-DAC',
        displayName: 'Kitchen Bundle — PoE + 0–10V Extract Control',
        shortName: 'Kitchen — PoE + 0–10V',
        room: 'Kitchen (with fan)',
        useCase: 'Kitchen presence and broad air-quality sensing plus 0–10V analog (EC fan / MVHR-style) extract-fan control, powered over Ethernet.',
        description: 'The Kitchen PoE bundle plus 0–10V analog extract-fan control through the Sense360 analog fan driver. Preview fan-control firmware with an extra address-switch step for installer and developer validation — not the recommended choice for most customers.',
        firmwareConfigString: 'Ceiling-POE-AirIQ-FanDAC-RoomIQ',
        channel: 'preview',
        fanDriver: 'dac',
        badges: ['Preview', 'Fan control'],
        badgeTone: 'warning',
        recommended: false,
        isDefault: false,
        requiresPreviewAcknowledgement: true,
        requiresFanControlAcknowledgement: true,
        requiresDacAddressAcknowledgement: true,
        buyable: false,
        warning: FAN_CONTROL_DAC_WARNING,
        dacAddressAcknowledgement: FAN_CONTROL_DAC_ADDRESS_ACK,
        moduleSummary: [
            'Sense360 Core',
            'RoomIQ room sensing',
            'AirIQ air-quality sensing',
            '0–10V analog extract-fan control',
            'Power over Ethernet (PoE)'
        ],
        components: [
            { sku: 'S360-100', label: 'Sense360 Core' },
            { sku: 'S360-200', label: 'Sense360 RoomIQ' },
            { sku: 'S360-210', label: 'Sense360 AirIQ' },
            { sku: 'S360-312', label: 'Sense360 DAC' },
            { sku: 'S360-410', label: 'Sense360 PoE PSU' }
        ],
        wizardState: {
            mount: 'ceiling',
            power: 'poe',
            bathroom: false,
            roomiq: 'roomiq',
            airiq: 'airiq',
            ventiq: 'none',
            fan: 'analog',
            led: 'none',
            voice: 'none'
        },
        upstreamRef: 'ROOM-BUNDLE-FAN-CONFIGS-001 / upstream #713 (S360-KIT-KITCHEN-P-DAC) — Ceiling-POE-AirIQ-FanDAC-RoomIQ; buildable-preview-compile-pending; address policy FANDAC-I2C-ADDR-001 (PENDING); no published artifact yet'
    }
];

/**
 * Frozen, ordered list of the full-composition fan-control room bundles. These
 * are NOT installable by their mere presence — see
 * `getExposableFanControlBundles`. Declared so a firmware-import PR lights up the
 * matching card with no wizard-code change.
 *
 * @type {ReadonlyArray<Readonly<Object>>}
 */
export const FAN_CONTROL_BUNDLES = Object.freeze(FAN_CONTROL_BUNDLES_DATA.map(freezeBundle));

const FORBIDDEN_FAN_CONTROL_TOKENS = Object.freeze(['FanTRIAC', 'TRIAC']);

/**
 * True when the bundle is a FULL room bundle — it carries the room-sensing
 * hardware (RoomIQ + a room air sensor: VentIQ or AirIQ) AND a fan driver. This
 * is what separates a real room-bundle product from a fan-only / manual firmware
 * (e.g. `Ceiling-POE-FanPWM`), which must never be offered as a Simple-install
 * bundle.
 *
 * @param {Object} bundle
 * @returns {boolean}
 */
export function isFullRoomBundle(bundle) {
    const ws = bundle && bundle.wizardState;
    if (!ws) {
        return false;
    }
    const hasRoomSensor = ws.roomiq && ws.roomiq !== 'none';
    const hasAirSensor = (ws.ventiq && ws.ventiq !== 'none') || (ws.airiq && ws.airiq !== 'none');
    const hasFan = ws.fan && ws.fan !== 'none';
    return Boolean(hasRoomSensor && hasAirSensor && hasFan);
}

/**
 * True when the bundle drives an analog (0–10V) fan and therefore requires the
 * GP8403 address-switch acknowledgement on top of the preview + fan-control
 * acknowledgements.
 *
 * @param {Object} bundle
 * @returns {boolean}
 */
export function bundleRequiresDacAddressAcknowledgement(bundle) {
    return Boolean(bundle && bundle.requiresDacAddressAcknowledgement);
}

/**
 * Validate a fan-control bundle entry. On top of the base bundle contract this
 * enforces the fan-expansion invariants so a malformed/forbidden bundle can't
 * slip through review:
 *   - preview channel only (never stable/default/recommended/buyable),
 *   - both the preview AND fan-control acknowledgements are required,
 *   - analog (DAC) bundles also require the address-switch acknowledgement and
 *     carry its copy (mentioning 0x58 / 0x5A and the forbidden 0x59),
 *   - it is a FULL room bundle (not a fan-only / manual config),
 *   - it carries no TRIAC token.
 *
 * @param {Object} bundle
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFanControlBundle(bundle) {
    const base = validateSimpleBundle(bundle);
    const errors = base.errors.slice();
    if (!isPlainObject(bundle)) {
        return { valid: false, errors };
    }
    if (bundle.channel !== 'preview') {
        errors.push(`Fan-control bundle ${bundle.id} must be on the preview channel.`);
    }
    if (bundle.recommended || bundle.isDefault || bundle.buyable) {
        errors.push(`Fan-control bundle ${bundle.id} must never be recommended/default/buyable.`);
    }
    if (!bundle.requiresPreviewAcknowledgement) {
        errors.push(`Fan-control bundle ${bundle.id} must require the preview acknowledgement.`);
    }
    if (!bundle.requiresFanControlAcknowledgement) {
        errors.push(`Fan-control bundle ${bundle.id} must require the fan-control acknowledgement.`);
    }
    if (!isFullRoomBundle(bundle)) {
        errors.push(`Fan-control bundle ${bundle.id} must be a full room bundle (room sensors + fan), not a fan-only config.`);
    }
    const cfg = String(bundle.firmwareConfigString || '');
    FORBIDDEN_FAN_CONTROL_TOKENS.forEach(token => {
        if (cfg.includes(token)) {
            errors.push(`Fan-control bundle ${bundle.id} must not resolve to a ${token} config.`);
        }
    });
    if (bundle.fanDriver === 'dac') {
        if (!bundle.requiresDacAddressAcknowledgement) {
            errors.push(`Analog fan-control bundle ${bundle.id} must require the address-switch acknowledgement.`);
        }
        const ack = String(bundle.dacAddressAcknowledgement || '');
        ['0x58', '0x5A', '0x59'].forEach(addr => {
            if (!ack.includes(addr)) {
                errors.push(`Analog fan-control bundle ${bundle.id} acknowledgement must mention ${addr}.`);
            }
        });
    } else if (bundle.requiresDacAddressAcknowledgement) {
        errors.push(`Non-analog fan-control bundle ${bundle.id} must not require the address-switch acknowledgement.`);
    }
    return { valid: errors.length === 0, errors };
}

function toConfigSet(manifestConfigStrings) {
    if (manifestConfigStrings instanceof Set) {
        return manifestConfigStrings;
    }
    return new Set(Array.isArray(manifestConfigStrings) ? manifestConfigStrings : []);
}

/**
 * The prerequisite gate. A fan-control bundle is import-ready (and may therefore
 * be exposed in Simple install) ONLY when:
 *   - it passes `validateFanControlBundle` (shape + acknowledgement contract),
 *   - it is a full room bundle on the preview channel,
 *   - AND its exact firmware `config_string` is present in the LIVE manifest.
 *
 * The manifest is the source of truth: a build only lands there after a
 * firmware-import PR fetched the signed `.bin`, wrote the `.meta.json` sidecar,
 * pinned the SHA-256 in `firmware/sources.json`, and regenerated `manifest.json`
 * (the manifest-health guard enforces those sidecar/SHA invariants in CI). So
 * manifest presence transitively proves the import prerequisites; declaring a
 * bundle here never makes it installable on its own.
 *
 * @param {Object} bundle
 * @param {Set<string>|string[]} manifestConfigStrings  config_strings in the live manifest
 * @returns {boolean}
 */
export function isFanControlBundleImportReady(bundle, manifestConfigStrings) {
    if (!bundle || !validateFanControlBundle(bundle).valid) {
        return false;
    }
    if (bundle.channel !== 'preview' || !isFullRoomBundle(bundle)) {
        return false;
    }
    return toConfigSet(manifestConfigStrings).has(bundle.firmwareConfigString);
}

/**
 * The ordered list of fan-control bundles that are import-ready against the
 * supplied live-manifest config_strings. With no matching firmware imported this
 * returns `[]`, so Simple install shows only the original six bundle cards.
 *
 * @param {Set<string>|string[]} manifestConfigStrings
 * @returns {Object[]}
 */
export function getExposableFanControlBundles(manifestConfigStrings) {
    const configs = toConfigSet(manifestConfigStrings);
    return FAN_CONTROL_BUNDLES.filter(bundle => isFanControlBundleImportReady(bundle, configs));
}
