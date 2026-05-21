import { escapeHtml } from './utils/escape-html.js';
import { normalizeChannelKey } from './utils/channel-alias.js';
import { MODULE_REQUIREMENT_MATRIX, getModuleMatrixEntry, getModuleVariantEntry } from './data/module-requirements.js';
import { parseConfigParams, mapToWizardConfiguration } from './utils/url-config.js';
import { recordFlashStart, recordFlashSuccess, recordFlashError, exportFlashHistoryText } from './utils/flash-history.js';
import { copyTextToClipboard } from './utils/copy-to-clipboard.js';
import {
    validateFirmwareProvenance,
    describeVerificationChecks,
    pickDefaultEligibleBuilds,
    applySignatureVerificationResult,
    applyHashVerificationResult,
    TRUST_TIERS,
    TIER_STATUSES
} from './utils/firmware-provenance.js';
import {
    verifyFirmwareSignature,
    extractSignatureFromBuild,
    SIGNATURE_RESULT_CODES,
    isWebCryptoEd25519Available,
    userFacingAuthenticityCopy
} from './utils/firmware-signature.js';
import {
    getChannelPolicy,
    getFirmwareBadges,
    getFirmwareWarnings,
    getRequiredAcknowledgements,
    getFirmwareAcknowledgementSignature,
    filterBuildsForMode,
    isBuildVisibleInMode,
    pickDefaultBuild,
    normaliseReleaseChannel
} from './utils/release-channels.js';
// Import error logging service early to capture all errors including manifest load failures
import './services/error-log.js';
import { detectCapabilities, evaluateBrowserReadiness } from './capabilities.js';
import {
    buildSupportBundle,
    copySupportBundle,
    redactValue,
    setSupportBundleStateProvider
} from './services/diagnostics.js';
import { postFlashService } from './services/post-flash.js';
import { getServiceWorkerState, subscribeServiceWorkerState } from './services/sw-update.js';
import { checkManifestFreshness } from './services/manifest-freshness.js';
import { notifyManifestFreshness as notifyFreshnessBanner } from './layout/freshness-banner.js';
import { findNearbyConfigStrings, getMismatchHighlights } from './utils/firmware-nearest.js';
import { FIRMWARE_READINESS_COPY, classifyFirmwareReadiness } from './utils/firmware-readiness.js';
import {
    AVAILABILITY_STATES,
    classifyModuleVariant,
    classifyConfigString,
    deriveManifestIndex
} from './utils/module-availability.js';

let currentStep = 1;
const totalSteps = 5;

function updateBottomDetailsVisibility(step) {
    const summaryElements = [
        document.querySelector('.module-step-grid__summary'),
        document.querySelector('[data-option-details-bottom]')
    ].filter(Boolean);

    if (!summaryElements.length) {
        return;
    }

    const shouldShow = step === 5;
    const ariaHiddenValue = shouldShow ? 'false' : 'true';

    summaryElements.forEach(element => {
        element.hidden = !shouldShow;
        element.setAttribute('aria-hidden', ariaHiddenValue);
    });
}

function getTotalSteps() {
    return totalSteps;
}
const MODULE_KEYS = Object.freeze(['voice', 'led', 'roomiq', 'airiq', 'fan', 'ventiq']);

// Hardware accessory modules whose availability is governed by the module
// matrix (conflicts) rather than firmware/manifest presence. Their option
// cards must never display a manifest-derived "not available" message — the
// user picks the SKUs they have, and any unsupported combination surfaces as
// a "Partial support" hint in updateModuleAvailabilityMessage instead of
// being silently locked out at the toggle.
const ALWAYS_AVAILABLE_MODULE_KEYS = Object.freeze(new Set(['fan', 'led', 'roomiq', 'airiq', 'ventiq']));

function isAlwaysAvailableModuleKey(key) {
    return ALWAYS_AVAILABLE_MODULE_KEYS.has(key);
}

const SUPPORTED_CONFIG_KEYS = Object.freeze([
    'mounting',
    'power',
    'bathroom',
    ...MODULE_KEYS
]);

function createValidatedMap(label, entries, { allowedKeys = null } = {}) {
    const map = {};
    const seen = new Set();
    const duplicates = new Set();

    entries.forEach(([key, value]) => {
        if (seen.has(key)) {
            duplicates.add(key);
            return;
        }

        seen.add(key);
        map[key] = value;
    });

    if (duplicates.size) {
        throw new Error(`[state] ${label} contains duplicate keys: ${Array.from(duplicates).join(', ')}`);
    }

    if (Array.isArray(allowedKeys) && allowedKeys.length) {
        const unsupported = Object.keys(map).filter(key => !allowedKeys.includes(key));
        if (unsupported.length) {
            throw new Error(`[state] ${label} contains unsupported keys: ${unsupported.join(', ')}`);
        }
    }

    return map;
}

const defaultConfiguration = createValidatedMap('defaultConfiguration', [
    ['mounting', null],
    ['power', null],
    ['bathroom', false],
    ['roomiq', 'none'],
    ['airiq', 'none'],
    ['ventiq', 'none'],
    ['fan', 'none'],
    ['voice', 'none'],
    ['led', 'none']
], { allowedKeys: SUPPORTED_CONFIG_KEYS });

const configuration = { ...defaultConfiguration };

const allowedOptions = createValidatedMap('allowedOptions', [
    ['mounting', ['ceiling']],
    ['power', ['usb', 'poe', 'pwr']],
    ['bathroom', [false, true]],
    ['roomiq', ['none', 'roomiq']],
    ['airiq', ['none', 'airiq']],
    ['ventiq', ['none', 'ventiq']],
    ['fan', ['none', 'relay', 'pwm', 'analog', 'triac']],
    ['voice', ['none']],
    ['led', ['none', 'led']]
], { allowedKeys: SUPPORTED_CONFIG_KEYS });

const MOUNT_LABELS = Object.freeze({
    ceiling: 'Ceiling mount'
});

const POWER_LABELS = Object.freeze({
    usb: 'USB power',
    poe: 'PoE module',
    pwr: 'PWR module'
});

const MODULE_VARIANT_LABELS = Object.freeze(createValidatedMap('MODULE_VARIANT_LABELS', [
    ['roomiq', Object.freeze({
        roomiq: 'Sense360 RoomIQ'
    })],
    ['airiq', Object.freeze({
        airiq: 'Sense360 AirIQ'
    })],
    ['ventiq', Object.freeze({
        ventiq: 'Sense360 VentIQ'
    })],
    ['fan', Object.freeze({
        relay: 'Sense360 Relay',
        pwm: 'Sense360 PWM',
        analog: 'Sense360 DAC',
        triac: 'Sense360 TRIAC'
    })],
    ['voice', Object.freeze({
        none: 'Sense360 Core'
    })],
    ['led', Object.freeze({
        none: 'No LED ring',
        led: 'Sense360 LED'
    })]
], { allowedKeys: MODULE_KEYS }));

const MODULE_LABELS = createValidatedMap('MODULE_LABELS', [
    ['roomiq', 'RoomIQ'],
    ['airiq', 'AirIQ'],
    ['ventiq', 'VentIQ'],
    ['fan', 'Fan / Switching'],
    ['voice', 'Core Type'],
    ['led', 'LED Ring']
], { allowedKeys: MODULE_KEYS });

// Fan variants are preserved as variant-specific tokens so the firmware-selection
// layer can pick the right binary per driver SKU. Different fan drivers (Relay,
// PWM, DAC, TRIAC) expose different pins/components/YAML substitutions, so
// collapsing them to a single "Fan" token would let the wizard hand a relay
// build to a PWM device. Mapping:
//   relay  -> FanRelay   (Sense360 Relay, S360-310)
//   pwm    -> FanPWM     (Sense360 PWM,   S360-311)
//   analog -> FanDAC     (Sense360 DAC,   S360-312 — wizard value stays
//                         `analog` for share-link/preset back-compat)
//   triac  -> FanTRIAC   (Sense360 TRIAC, S360-320)
const FAN_VARIANT_SEGMENT_TOKENS = Object.freeze({
    relay: 'FanRelay',
    pwm: 'FanPWM',
    analog: 'FanDAC',
    triac: 'FanTRIAC'
});

const MODULE_SEGMENT_FORMATTERS = createValidatedMap('MODULE_SEGMENT_FORMATTERS', [
    ['roomiq', value => value === 'roomiq' ? 'RoomIQ' : ''],
    ['airiq', value => value === 'airiq' ? 'AirIQ' : ''],
    ['ventiq', value => value === 'ventiq' ? 'VentIQ' : ''],
    ['fan', value => FAN_VARIANT_SEGMENT_TOKENS[value] || ''],
    ['voice', () => 'Core'],
    ['led', value => value === 'led' ? 'LED' : '']
], { allowedKeys: MODULE_KEYS });


function moduleHasSelectableVariants(moduleKey) {
    const moduleEntry = MODULE_REQUIREMENT_MATRIX[moduleKey];
    if (!moduleEntry || !moduleEntry.variants || typeof moduleEntry.variants !== 'object') {
        return false;
    }

    return Object.keys(moduleEntry.variants).some(variantKey => variantKey !== 'none');
}

function getVisibleModuleGroupKeys() {
    const isCeilingBathroom = configuration.mounting === 'ceiling' && configuration.bathroom === true;
    return MODULE_KEYS.filter(moduleKey => {
        if (!moduleHasSelectableVariants(moduleKey)) {
            return false;
        }
        if (moduleKey === 'ventiq') {
            return isCeilingBathroom;
        }
        if (moduleKey === 'airiq') {
            return !isCeilingBathroom;
        }
        return true;
    });
}

let activeModuleGroupKey = null;

let preFlashAcknowledged = false;
let preflightWarningsAcknowledged = false;
// Acknowledgements per channel-warning key (e.g. 'channel:beta', 'deprecated').
// Keyed acknowledgements let beta + deprecated be tracked independently
// without the user having to re-tick a single combined checkbox each time.
//
// Each entry stores the firmware-identity signature it was given against so
// that consent for one risky build cannot silently satisfy the gate for a
// *different* risky build that happens to share a channel. When the
// currently-selected firmware's signature differs from the stored one, the
// ack is treated as unsatisfied and pruned on the next read.
//
//   Map<key, { signature: string, value: true }>
const channelAcknowledgements = new Map();

// WF-TRIAC-001 — advanced/manual-warning acknowledgements.
//
// Orthogonal to channelAcknowledgements (which gates beta / preview /
// development / deprecated release-channel risk). The advanced-manual-
// warning gate is bound to a *module-variant selection* (e.g. `fan:triac`),
// not to a firmware-identity signature, because the wizard exposes the
// advanced/manual-warning module BEFORE any imported artifact exists.
//
// Keys are `${moduleKey}:${variantKey}` (e.g. `fan:triac`). The map only
// holds positive consent; deselecting the variant or switching to the kit
// path clears the entry via clearAdvancedWarningAcks() so a future
// reselection always requires fresh consent.
//
// Like the channel acks, this is session-only — never persisted.
//
//   Map<string, true>
const advancedWarningAcknowledgements = new Map();

function makeAdvancedWarningKey(moduleKey, variantKey) {
    return `${moduleKey}:${variantKey}`;
}

function isAdvancedWarningAcknowledged(moduleKey, variantKey) {
    if (!moduleKey || !variantKey) {
        return false;
    }
    return advancedWarningAcknowledgements.get(makeAdvancedWarningKey(moduleKey, variantKey)) === true;
}

function setAdvancedWarningAcknowledged(moduleKey, variantKey, value) {
    if (!moduleKey || !variantKey) {
        return;
    }
    const key = makeAdvancedWarningKey(moduleKey, variantKey);
    if (value === true) {
        advancedWarningAcknowledgements.set(key, true);
    } else {
        advancedWarningAcknowledgements.delete(key);
    }
}

function clearAdvancedWarningAck(moduleKey, variantKey) {
    if (!moduleKey || !variantKey) {
        return;
    }
    advancedWarningAcknowledgements.delete(makeAdvancedWarningKey(moduleKey, variantKey));
}

function clearAdvancedWarningAcks() {
    advancedWarningAcknowledgements.clear();
}

let currentFlashEntryId = null;
let flashStartTime = null;

// Release mode controls which channels are visible in the install path.
//   'normal'      — production install (default). Hides development + rescue.
//   'recovery'    — reveals rescue firmware so the user can rollback / unbrick.
//   'development' — reveals development builds for internal testing.
// The mode is opt-in via the URL (?mode=recovery / ?mode=development) so we
// never expose those builds without an explicit, intentional gesture from
// the user. See README "Release channels" for the policy.
const VALID_RELEASE_MODES = Object.freeze(new Set(['normal', 'recovery', 'development']));
let currentReleaseMode = 'normal';

function getReleaseMode() {
    return currentReleaseMode;
}

function applyReleaseMode(nextMode) {
    const target = VALID_RELEASE_MODES.has(nextMode) ? nextMode : 'normal';
    if (currentReleaseMode === target) {
        return;
    }
    currentReleaseMode = target;
    // A mode change re-filters which firmware tiers are visible (e.g. dev
    // builds appearing/disappearing). Channel acknowledgements for the
    // previously-selected firmware must not silently carry over to a
    // newly-revealed build, so clear them and force the user to re-consent
    // for the firmware they actually pick in the new mode.
    try {
        if (typeof channelAcknowledgements?.clear === 'function') {
            channelAcknowledgements.clear();
        }
    } catch {
        /* defensive */
    }
}

function setReleaseModeFromUrl(searchParams) {
    if (!searchParams || typeof searchParams.get !== 'function') {
        applyReleaseMode('normal');
        return;
    }
    const requested = (searchParams.get('mode') || '').toString().trim().toLowerCase();
    if (VALID_RELEASE_MODES.has(requested)) {
        applyReleaseMode(requested);
        return;
    }
    if (requested === 'rescue') {
        applyReleaseMode('recovery');
        return;
    }
    if (requested === 'dev' || requested === 'debug') {
        applyReleaseMode('development');
        return;
    }
    // Unknown / invalid mode parameter falls back to safe normal mode.
    applyReleaseMode('normal');
}

function setReleaseModeForTests(mode) {
    applyReleaseMode(mode);
}
const CONNECTION_QUALITY_THRESHOLDS = Object.freeze({
    failDisconnects: 3,
    failSerialFailures: 3,
    failRetries: 5,
    failStabilityWindowMs: 10_000,
    warnDisconnects: 1,
    warnSerialFailures: 1,
    warnRetries: 2,
    warnStabilityWindowMs: 30_000
});

const connectionQualityMetrics = {
    disconnects: 0,
    reconnectAttempts: 0,
    serialReadFailures: 0,
    serialWriteFailures: 0,
    retryCount: 0,
    stabilityWindowStart: Date.now()
};

// Tracks whether the user has reached a point where we have actual evidence
// about the serial link — a serial connect/disconnect event, an ESP Web Tools
// install lifecycle event, or a successful "Test browser & USB setup" run.
// Until then the connection-quality and device-visibility preflight checks
// surface a neutral "pending" state instead of failing on "0 events over 0s".
let preflightConnectionAttempted = false;

function getConnectionQualitySnapshot() {
    return {
        disconnects: Number(connectionQualityMetrics.disconnects) || 0,
        reconnectAttempts: Number(connectionQualityMetrics.reconnectAttempts) || 0,
        serialReadFailures: Number(connectionQualityMetrics.serialReadFailures) || 0,
        serialWriteFailures: Number(connectionQualityMetrics.serialWriteFailures) || 0,
        retryCount: Number(connectionQualityMetrics.retryCount) || 0,
        stabilityWindowMs: Math.max(0, Date.now() - (Number(connectionQualityMetrics.stabilityWindowStart) || Date.now()))
    };
}

function markPreflightConnectionAttempted() {
    if (preflightConnectionAttempted) {
        return;
    }
    preflightConnectionAttempted = true;
    if (currentStep === 5) {
        refreshPreflightDiagnostics();
    }
}

function hasPreflightConnectionBeenAttempted() {
    return preflightConnectionAttempted;
}

function resetPreflightConnectionAttemptedForTests() {
    preflightConnectionAttempted = false;
}

function updateConnectionQualityMetrics(partial = {}) {
    if (!partial || typeof partial !== 'object') {
        return getConnectionQualitySnapshot();
    }
    // Any metric/window update is evidence that something has happened on
    // the serial link — flip the connection-attempted flag so the pending
    // preflight checks can resolve to a real verdict.
    if (Object.keys(partial).length > 0) {
        preflightConnectionAttempted = true;
    }
    ['disconnects', 'reconnectAttempts', 'serialReadFailures', 'serialWriteFailures', 'retryCount'].forEach(key => {
        if (key in partial) {
            connectionQualityMetrics[key] = Math.max(0, Number(partial[key]) || 0);
        }
    });
    if ('stabilityWindowStart' in partial) {
        connectionQualityMetrics.stabilityWindowStart = Number(partial.stabilityWindowStart) || Date.now();
    }
    if (partial.resetStabilityWindow === true) {
        connectionQualityMetrics.stabilityWindowStart = Date.now();
    }
    if (currentStep === 5) {
        refreshPreflightDiagnostics();
    }
    return getConnectionQualitySnapshot();
}

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
    const next = Boolean(value);
    const changed = preFlashAcknowledged !== next;
    preFlashAcknowledged = next;
    if (changed) {
        refreshPreflightDiagnostics();
    }
    updateFirmwareControls();
}

function setPreflightWarningsAcknowledgement(value) {
    const next = Boolean(value);
    if (preflightWarningsAcknowledged === next) {
        return;
    }
    preflightWarningsAcknowledged = next;
    updateFirmwareControls();
}

function getChannelAcknowledgements(firmware) {
    return getRequiredAcknowledgements(firmware || window.currentFirmware);
}

function getCurrentFirmwareSignature(firmware) {
    return getFirmwareAcknowledgementSignature(firmware || window.currentFirmware);
}

function isChannelAcknowledged(key, firmware) {
    const entry = channelAcknowledgements.get(key);
    if (!entry || entry.value !== true) {
        return false;
    }
    const expected = getCurrentFirmwareSignature(firmware);
    if (!expected) {
        return false;
    }
    return entry.signature === expected;
}

function setChannelAcknowledgement(key, value) {
    if (!key) {
        return;
    }
    const next = Boolean(value);
    const signature = getCurrentFirmwareSignature();
    const existing = channelAcknowledgements.get(key);
    const matches = existing
        && existing.value === next
        && (next ? existing.signature === signature : true);
    if (matches) {
        return;
    }
    if (next) {
        if (!signature) {
            // Refuse to record an ack with no firmware context — there is
            // nothing to bind it to and a later signature change could not
            // safely invalidate it.
            return;
        }
        channelAcknowledgements.set(key, { signature, value: true });
    } else {
        channelAcknowledgements.delete(key);
    }
    pruneStaleChannelAcknowledgements();
    renderChannelAcknowledgementPanel();
    updateFirmwareControls();
    refreshPreflightDiagnostics();
}

function resetChannelAcknowledgements() {
    if (channelAcknowledgements.size === 0) {
        return;
    }
    channelAcknowledgements.clear();
    renderChannelAcknowledgementPanel();
    updateFirmwareControls();
}

/**
 * Drop any acknowledgements that no longer match the currently-selected
 * firmware's identity signature. Defensive layer: even if a code path forgets
 * to call resetPreFlashAcknowledgement after silently swapping the active
 * build, the next gate read will see a clean Map rather than stale consent.
 *
 * Returns true when the Map was modified so callers that need to re-render
 * the ack panel can do so.
 */
function pruneStaleChannelAcknowledgements(firmware) {
    if (channelAcknowledgements.size === 0) {
        return false;
    }
    const expected = getCurrentFirmwareSignature(firmware);
    if (!expected) {
        channelAcknowledgements.clear();
        return true;
    }
    let pruned = false;
    for (const [key, entry] of channelAcknowledgements) {
        if (!entry || entry.signature !== expected) {
            channelAcknowledgements.delete(key);
            pruned = true;
        }
    }
    return pruned;
}

function getOutstandingChannelAcknowledgements(firmware) {
    pruneStaleChannelAcknowledgements(firmware);
    return getChannelAcknowledgements(firmware).filter(item => !isChannelAcknowledged(item.key, firmware));
}

// WF-TRIAC-001 — advanced/manual-warning ack helpers.
//
// Walk the active wizard configuration, identify every module variant whose
// classification is `advanced-manual-warning`, and return the ones whose
// per-variant acknowledgement has not been satisfied. The install gate in
// updateFirmwareControls() consumes this to keep TRIAC (and any future
// advanced/manual-warning module) from flashing without explicit consent —
// regardless of whether the manifest happens to carry a matching artifact.
//
// This is orthogonal to channel acknowledgements: the channel ack gates
// preview/beta/dev release-channel risk; the advanced-warning ack gates
// hardware-class risk that the wizard surfaces even when no firmware is
// imported yet.
function getActiveAdvancedWarningSelections(state = configuration) {
    if (!state || typeof state !== 'object') {
        return [];
    }
    const results = [];
    const moduleKeys = Array.isArray(MODULE_KEYS) ? MODULE_KEYS : [];
    moduleKeys.forEach(moduleKey => {
        // The state shape uses `mounting` for mount; module keys map 1:1.
        const variantKey = state[moduleKey];
        if (!variantKey || variantKey === 'none') {
            return;
        }
        let classification = null;
        try {
            classification = classifyVariantForRender(moduleKey, variantKey);
        } catch {
            classification = null;
        }
        if (classification && classification.state === AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING) {
            results.push({ moduleKey, variantKey, classification });
        }
    });
    return results;
}

function getOutstandingAdvancedWarningAcknowledgements(state = configuration) {
    return getActiveAdvancedWarningSelections(state).filter(
        ({ moduleKey, variantKey }) => !isAdvancedWarningAcknowledged(moduleKey, variantKey)
    );
}

function pruneInactiveAdvancedWarningAcks(state = configuration) {
    if (advancedWarningAcknowledgements.size === 0) {
        return false;
    }
    const activeKeys = new Set(
        getActiveAdvancedWarningSelections(state).map(
            ({ moduleKey, variantKey }) => makeAdvancedWarningKey(moduleKey, variantKey)
        )
    );
    let pruned = false;
    for (const key of Array.from(advancedWarningAcknowledgements.keys())) {
        if (!activeKeys.has(key)) {
            advancedWarningAcknowledgements.delete(key);
            pruned = true;
        }
    }
    return pruned;
}

function evaluatePreflightPolicy(checks = []) {
    const normalizedChecks = Array.isArray(checks) ? checks : [];
    const failChecks = normalizedChecks.filter(check => check?.state === 'fail');
    const warnChecks = normalizedChecks.filter(check => check?.state === 'warn');
    const blockingReasons = failChecks.map(check => check?.detail || `${check?.label || 'A required check'} failed.`);

    return {
        canInstall: failChecks.length === 0 && (!warnChecks.length || preflightWarningsAcknowledged),
        requiresWarnAcknowledgement: warnChecks.length > 0 && !preflightWarningsAcknowledged,
        blockingReasons
    };
}

// WF-UX-004: presentation-only verdict over the same checks array that feeds
// evaluatePreflightPolicy(). Returns one of three user-facing states — ready,
// attention, blocked — so the Step 5 preflight panel can render a single
// headline above the existing diagnostic rows. This helper introduces no new
// gating: it is a pure function over `checks` and `evaluatePreflightPolicy()`
// remains the install gate.
const PREFLIGHT_VERDICTS = Object.freeze({
    ready: Object.freeze({
        level: 'ready',
        title: 'Ready to install',
        detail: 'Your browser, firmware, and required checks are ready.'
    }),
    attention: Object.freeze({
        level: 'attention',
        title: 'Needs attention',
        detail: 'Review the warnings below before installing.'
    }),
    blocked: Object.freeze({
        level: 'blocked',
        title: 'Blocked',
        detail: 'Fix the required items below before installing firmware.'
    })
});

function derivePreflightVerdict(checks = []) {
    const list = Array.isArray(checks) ? checks : [];
    const hasFail = list.some(check => check?.state === 'fail');
    if (hasFail) {
        return PREFLIGHT_VERDICTS.blocked;
    }
    const hasWarn = list.some(check => check?.state === 'warn');
    if (hasWarn) {
        return PREFLIGHT_VERDICTS.attention;
    }
    return PREFLIGHT_VERDICTS.ready;
}

// Compute the install-gate verdict for cache-freshness state. Used at
// render time by `updateFirmwareControls()` and also at click time by the
// install/summary handlers as defense-in-depth — the rendered button is
// already disabled when freshness blocks, but a freshness state change
// between render and click (e.g. a waiting SW landing while the user is
// hovering the button) must still be caught.
function evaluateFreshnessGate() {
    const swState = (typeof getServiceWorkerState === 'function')
        ? getServiceWorkerState()
        : { updateAvailable: false, updateDismissed: false };
    const swUpdateBlocking = Boolean(swState.updateAvailable) && !swState.updateDismissed;
    const manifestStaleBlocking = manifestFreshnessHasRun && manifestFreshnessState === 'stale';
    const manifestUnknownBlocking = manifestFreshnessHasRun
        && manifestFreshnessState === 'unknown'
        && !manifestFreshnessAck;
    let blockingReason = '';
    if (swUpdateBlocking) {
        blockingReason = 'A WebFlash update is available. Reload before flashing to use the latest installer and firmware metadata.';
    } else if (manifestStaleBlocking) {
        blockingReason = 'A newer firmware manifest is available. Reload before flashing.';
    } else if (manifestUnknownBlocking) {
        blockingReason = 'WebFlash could not confirm whether the firmware list is up to date. Use “Recheck manifest freshness” to retry, or check the acknowledgement to continue with the firmware list already loaded in this browser.';
    }
    return {
        ok: !swUpdateBlocking && !manifestStaleBlocking && !manifestUnknownBlocking,
        blockingReason,
        swUpdateBlocking,
        manifestStaleBlocking,
        manifestUnknownBlocking
    };
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
    setPreflightWarningsAcknowledgement(false);
    resetChannelAcknowledgements();
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

    if (normalized.voice === 'airiq') {
        normalized.voice = 'none';
    }

    return enforceAirIQVentIQExclusivity(normalized);
}


function enforceAirIQVentIQExclusivity(state = {}) {
    if (!state || typeof state !== 'object') {
        return state;
    }

    const isCeilingBathroom = state.mounting === 'ceiling' && state.bathroom === true;

    if (!isCeilingBathroom) {
        state.ventiq = 'none';
    }

    const hasVentIQ = state.ventiq && state.ventiq !== 'none' && isCeilingBathroom;
    const hasAirIQ = state.airiq && state.airiq !== 'none';

    if (hasVentIQ) {
        state.airiq = 'none';
    } else if (hasAirIQ) {
        state.ventiq = 'none';
    }

    return state;
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

// Builds the canonical firmware-target config string from a wizard state
// snapshot. Used both by findCompatibleFirmware (which matches against
// manifest.builds[].config_string) and by the Step 4 firmware-target preview.
// The two MUST share this composer so the preview cannot drift from the
// string Step 5 actually uses to look up firmware. Returns '' if mounting
// or power haven't been chosen yet.
//
// Segment order: Mount-Power[-AirIQ|-VentIQ][-Fan{Variant}][-RoomIQ][-LED]
// Mirrors the published firmware filename convention (e.g.
// Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin).
function buildFirmwareTargetPreviewString(state = configuration) {
    if (!state || !state.mounting || !state.power) {
        return '';
    }

    const mountSegment = state.mounting.charAt(0).toUpperCase() + state.mounting.slice(1);
    const powerSegment = state.power.toUpperCase();

    let configString = `${mountSegment}-${powerSegment}`;
    configString += formatConfigSegment('airiq', state.airiq);
    configString += formatConfigSegment('ventiq', state.ventiq);
    configString += formatConfigSegment('fan', state.fan);
    configString += formatConfigSegment('roomiq', state.roomiq);
    configString += formatConfigSegment('led', state.led);

    return configString;
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
let manifestFreshness = 'unknown';
let manifestBuildsWithIndex = [];
let manifestConfigStringLookup = new Map();
let manifestAvailabilityIndex = new Map();
// WF-WIZARD-AVAIL-001 — derived from manifestBuildsWithIndex on every
// rebuild. Module-availability classification reads from these so the
// wizard automatically reflects manifest changes (adding a new stable build
// lights up the matching module pill without code changes).
let manifestAvailabilityTokens = {
    manifestStableTokens: new Set(),
    manifestPreviewTokens: new Set(),
    manifestStableConfigs: new Set(),
    manifestPreviewConfigs: new Set()
};
let manifestFreshnessState = 'unknown';
let manifestFreshnessDetail = null;
let manifestFreshnessAck = false;
let manifestFreshnessHasRun = false;
let manifestFreshnessRecheckInFlight = false;
let manifestFreshnessCheckPromise = null;
let manifestMetadata = null;

function getManifestFreshness() {
    return manifestFreshness;
}

function getManifestData() {
    return manifestData;
}

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
        const enabledOption = allowed.find(option => option !== 'none');
        if (enabledOption) {
            return enabledOption;
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

    // Check if first segment is Core/CoreVoice (new format) or mounting type (legacy format)
    let coreType = 'none';
    let mountingIndex = 0;
    const firstSegmentLower = segments[0].toLowerCase();

    if (firstSegmentLower === 'core' || firstSegmentLower === 'corevoice') {
        coreType = 'none';
        mountingIndex = 1;
    }

    // Ensure we have enough segments for mounting and power
    if (segments.length < mountingIndex + 2) {
        return null;
    }

    const mounting = normaliseMountingToken(segments[mountingIndex]);

    // Check if Voice segment appears between mounting and power (e.g., "Ceiling-Voice-USB")
    let powerIndex = mountingIndex + 1;
    if (segments[powerIndex] && segments[powerIndex].toLowerCase() === 'voice') {
        coreType = 'none';
        powerIndex += 1;
    }

    // Ensure we still have a power segment
    if (segments.length <= powerIndex) {
        return null;
    }

    const power = normalisePowerToken(segments[powerIndex]);

    if (!mounting || !power) {
        return null;
    }

    const moduleState = {
        bathroom: false,
        roomiq: 'none',
        airiq: 'none',
                fan: 'none',
        voice: coreType,
        led: 'none',
        ventiq: 'none'
    };

    for (let index = powerIndex + 1; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
            continue;
        }

        // Check VentIQ before Bathroom (since VentIQ starts with Bathroom)
        if (segment.startsWith('VentIQ')) {
            const suffix = segment.substring('VentIQ'.length);
            moduleState.ventiq = normaliseModuleValue('ventiq', suffix ? suffix.toLowerCase() : 'ventiq');
        } else if (segment === 'Bathroom') {
            moduleState.bathroom = true;
        } else if (segment === 'RoomIQ' || segment.startsWith('RoomIQ')) {
            moduleState.roomiq = 'roomiq';
        } else if (segment.startsWith('AirIQ')) {
            const suffix = segment.substring('AirIQ'.length);
            moduleState.airiq = normaliseModuleValue('airiq', suffix ? suffix.toLowerCase() : 'airiq');
        } else if (segment.startsWith('Fan')) {
            const suffix = segment.substring('Fan'.length).toLowerCase();
            // `dac` is the canonical token suffix for the DAC SKU; the
            // wizard value is still `analog`. Empty suffix is the legacy
            // `Fan` token (variant unknown) — fall through to `none` so the
            // user is prompted to pick a driver explicitly.
            const variantValue = suffix === 'dac' ? 'analog' : (suffix || 'none');
            moduleState.fan = normaliseModuleValue('fan', variantValue);
        } else if (segment.startsWith('Voice')) {
            moduleState.voice = 'none';
        } else if (segment === 'LED' || segment.startsWith('LED')) {
            moduleState.led = 'led';
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
    manifestAvailabilityTokens = deriveManifestIndex(
        Array.isArray(manifest?.builds) ? manifest.builds : []
    );

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
                            roomiq: new Set(),
                            airiq: new Set(),
                            fan: new Set(),
                            voice: new Set(),
                            led: new Set(),
                            ventiq: new Set()
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

function captureManifestMetadata(data) {
    if (!data || typeof data !== 'object') {
        manifestMetadata = null;
        return;
    }
    manifestMetadata = {
        manifest_version: typeof data.manifest_version === 'number' ? data.manifest_version : null,
        generated_at: typeof data.generated_at === 'string' ? data.generated_at : null,
        source_commit: typeof data.source_commit === 'string' ? data.source_commit : null
    };
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('webflash:manifest-metadata-updated'));
    }
}

function setManifestFreshnessState(verdict, detail = null) {
    const next = (verdict === 'current' || verdict === 'stale') ? verdict : 'unknown';
    const changed = next !== manifestFreshnessState;
    manifestFreshnessState = next;
    manifestFreshnessDetail = detail || null;
    // Setting an explicit verdict implies a freshness check has been
    // performed — flip the "has run" flag so the install gate starts
    // honouring the verdict. Without this, callers that bypass
    // checkManifestFreshnessNow (tests, future direct setters) would
    // silently leave the gate inert.
    manifestFreshnessHasRun = true;
    if (changed) {
        // A genuinely new verdict invalidates any prior acknowledgement —
        // the user should re-acknowledge if the new state is 'unknown'.
        manifestFreshnessAck = false;
    }
    if (typeof notifyFreshnessBanner === 'function') {
        try {
            notifyFreshnessBanner(manifestFreshnessState, manifestFreshnessAck);
        } catch (error) {
            console.warn('[state] freshness banner notify failed:', error);
        }
    }
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('webflash:manifest-freshness-updated'));
    }
    try {
        updateFirmwareControls();
    } catch (error) {
        // updateFirmwareControls may be hoisted but DOM bindings might
        // not exist during early init — swallow noisily but don't throw.
        console.warn('[state] updateFirmwareControls during freshness change:', error);
    }
    // Re-render the preflight panel so the manifest-freshness row reflects
    // the new verdict and (when unknown) shows the inline recovery controls.
    try {
        refreshPreflightDiagnostics();
    } catch (error) {
        console.warn('[state] refreshPreflightDiagnostics during freshness change:', error);
    }
}

function setManifestFreshnessAcknowledgement(value) {
    const next = Boolean(value);
    if (manifestFreshnessAck === next) {
        return;
    }
    manifestFreshnessAck = next;
    if (typeof notifyFreshnessBanner === 'function') {
        try {
            notifyFreshnessBanner(manifestFreshnessState, manifestFreshnessAck);
        } catch (error) {
            console.warn('[state] freshness banner notify failed:', error);
        }
    }
    try {
        updateFirmwareControls();
    } catch (error) {
        console.warn('[state] updateFirmwareControls during freshness ack:', error);
    }
    // Mirror the ack into the preflight row's detail copy and (if applicable)
    // the inline checkbox.
    try {
        refreshPreflightDiagnostics();
    } catch (error) {
        console.warn('[state] refreshPreflightDiagnostics during freshness ack:', error);
    }
}

async function checkManifestFreshnessNow(options = {}) {
    const { force = false } = options;
    if (manifestFreshnessCheckPromise && !force) {
        return manifestFreshnessCheckPromise;
    }
    manifestFreshnessCheckPromise = (async () => {
        const result = await checkManifestFreshness(manifestMetadata);
        manifestFreshnessHasRun = true;
        setManifestFreshnessState(result.verdict, result);
        return result;
    })();
    try {
        return await manifestFreshnessCheckPromise;
    } finally {
        manifestFreshnessCheckPromise = null;
    }
}

/**
 * Trigger the freshness check on first reach of the review step. Repeat
 * triggers on the same step are ignored unless `force` is set, so the
 * network is not hammered on every re-render.
 */
function triggerManifestFreshnessCheckIfNeeded() {
    if (manifestFreshnessHasRun) {
        return Promise.resolve(null);
    }
    manifestFreshnessHasRun = true;
    return checkManifestFreshnessNow().catch(() => null);
}

function getManifestMetadata() {
    return manifestMetadata
        ? { ...manifestMetadata, freshness: manifestFreshnessState }
        : null;
}

/**
 * Stable getter consumed by app.js -> initAboutPanel(). Decoupled from
 * the rest of the wizard's state surface to avoid an import cycle.
 */
export function getManifestMetadataForAbout() {
    return getManifestMetadata();
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

    manifestFreshness = 'loading';
    const attemptFetch = async (attempt = 1) => {
        if (typeof fetch !== 'function') {
            const error = new Error('fetch API is not available in this environment');
            manifestLoadError = error;
            manifestLoadPromise = null;
            manifestFreshness = 'error';
            throw error;
        }
        try {
            const response = await fetch('manifest.json', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Manifest request failed with status ${response.status}`);
            }
            const data = await response.json();
            manifestData = data;
            manifestLoadError = null;
            manifestFreshness = 'current';
            buildManifestContext(data);
            try {
                postFlashService.captureManifest(data);
            } catch { /* defensive — do not block manifest load on post-flash wiring */ }
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
            manifestFreshness = 'error';
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

// Freshness is verified lazily — the check fires on first reach of the
// review step (see triggerManifestFreshnessCheckIfNeeded(), wired into
// setStep below). This avoids a network round-trip on initial wizard
// load and keeps non-flashing flows zero-cost.

if (typeof document !== 'undefined') {
    document.addEventListener('webflash:acknowledge-manifest-freshness', () => {
        setManifestFreshnessAcknowledgement(true);
    });
}

// Re-render install controls whenever the service worker update state
// changes (e.g. a waiting worker installs, or the user dismisses the
// pending update). The first invocation runs synchronously and is a no-op
// if the install button isn't in the DOM yet.
if (typeof subscribeServiceWorkerState === 'function') {
    subscribeServiceWorkerState(() => {
        try {
            updateFirmwareControls();
        } catch (error) {
            // DOM bindings may not exist yet during early init.
        }
    });
}

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
    const rawState = typeof detail === 'string' ? detail : detail?.state;
    const message = detail?.message;
    const state = typeof rawState === 'string' ? rawState.toLowerCase() : rawState;

    if (!state) {
        return;
    }

    // Forward the lifecycle event to the post-flash service so it can drive
    // the post-flash result panel without each event handler tracking its
    // own state.
    try {
        postFlashService.dispatchLifecycle(detail);
    } catch (err) {
        console.warn('[state] postFlashService.dispatchLifecycle failed', err);
    }

    if (state === 'preparing' || state === 'manifest' || state === 'initializing') {
        markPreflightConnectionAttempted();
        updateConnectionQualityMetrics({ resetStabilityWindow: true });
    }

    if (state === 'finished') {
        setHomeAssistantIntegrationsButtonEnabled(true);
        markPreflightConnectionAttempted();
        updateConnectionQualityMetrics({ resetStabilityWindow: true });
        // Record successful flash
        if (currentFlashEntryId) {
            const duration = flashStartTime ? Date.now() - flashStartTime : 0;
            recordFlashSuccess(currentFlashEntryId, duration);
            currentFlashEntryId = null;
            flashStartTime = null;
        }
        refreshPreflightDiagnostics();
        return;
    }

    if (state === 'error') {
        markPreflightConnectionAttempted();
        const snapshot = getConnectionQualitySnapshot();
        updateConnectionQualityMetrics({
            serialReadFailures: snapshot.serialReadFailures + 1,
            retryCount: snapshot.retryCount + 1
        });
        refreshPreflightDiagnostics();
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

function bindSerialDisconnectListener() {
    if (typeof navigator === 'undefined' || !navigator.serial || typeof navigator.serial.addEventListener !== 'function') {
        return;
    }
    if (navigator.serial._webflashDisconnectBound) {
        return;
    }
    navigator.serial._webflashDisconnectBound = true;
    navigator.serial.addEventListener('disconnect', () => {
        markPreflightConnectionAttempted();
        const snapshot = getConnectionQualitySnapshot();
        updateConnectionQualityMetrics({
            disconnects: snapshot.disconnects + 1,
            resetStabilityWindow: true
        });
        refreshPreflightDiagnostics();
    });
    navigator.serial.addEventListener('connect', () => {
        markPreflightConnectionAttempted();
        const snapshot = getConnectionQualitySnapshot();
        updateConnectionQualityMetrics({
            reconnectAttempts: snapshot.reconnectAttempts + 1,
            resetStabilityWindow: true
        });
        refreshPreflightDiagnostics();
    });
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
        { selector: 'input[name="fan"]', datasetKey: 'fanBound', handler: updateConfiguration },
        { selector: 'input[name="led"]', datasetKey: 'ledBound', handler: updateConfiguration },
        { selector: 'input[name="roomiq"]', datasetKey: 'roomiqBound', handler: updateConfiguration },
        { selector: 'input[name="ventiq"]', datasetKey: 'ventiqBound', handler: updateConfiguration }
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
        initializeModuleToggles();
    } catch (error) {
        console.error('Failed to initialize module toggles:', error);
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
        // WF-TRIAC-001 — wire the delegated change listener for the inline
        // advanced/manual-warning acknowledgement checkbox(es). Bound once
        // (the listener guards itself against duplicate binding).
        bindAdvancedWarningAcknowledgementListener();
    } catch (error) {
        console.error('Failed to bind advanced/manual-warning acknowledgement listener:', error);
    }

    try {
        initializeFromUrl();
    } catch (error) {
        console.error('Failed to initialize wizard from URL:', error);
    }

    try {
        ensureSingleActiveWizardStep();
        updateFirmwareControls();
        // Render the static availability pills (advanced/manual-warning
        // TRIAC, design-pending Relay, no-firmware AirIQ/PWM/DAC) before the
        // manifest finishes loading so the customer never sees a flash of
        // "everything looks installable" copy at first paint.
        updateModuleVariantAvailability();
    } catch (error) {
        console.error('Failed to finalize wizard initialization:', error);
    }

    manifestReadyPromise
        .then(() => {
            updateModuleOptionAvailability();
            updateModuleAvailabilityMessage();
            // Manifest now populated → re-evaluate availability of the
            // currently-shown firmware target so the warning toggles
            // correctly without waiting for the next user interaction.
            updateModuleVariantAvailability();
            updateFirmwareTargetPreview();

            if (currentStep === 4) {
                findCompatibleFirmware();
            }
        })
        .catch(() => {
            resetOptionAvailability();
            updateModuleAvailabilityMessage();
            updateModuleVariantAvailability();
            updateFirmwareTargetPreview();
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

    updateAirIQVentIQVisibility();
}

function updateAirIQVentIQVisibility() {
    const ventIQSections = Array.from(document.querySelectorAll('[data-module-group="ventiq"], #ventiq-module-section'));
    const airIQSections = Array.from(document.querySelectorAll('[data-module-group="airiq"], #airiq-module-section'));

    if (!ventIQSections.length && !airIQSections.length) {
        return;
    }

    if (ventIQSections.length > 1) {
        console.warn('[state] Invalid DOM: multiple VentIQ module-group sections found. Applying visibility updates to all sections defensively.');
    }
    if (airIQSections.length > 1) {
        console.warn('[state] Invalid DOM: multiple AirIQ module-group sections found. Applying visibility updates to all sections defensively.');
    }

    const isBathroomMode = configuration.mounting === 'ceiling' && configuration.bathroom === true;

    if (isBathroomMode) {
        airIQSections.forEach(section => {
            section.style.display = 'none';
        });
        closeModuleGroup('airiq');

        const airiqNoneInput = document.querySelector('input[name="airiq"][value="none"]');
        if (airiqNoneInput && !airiqNoneInput.checked) {
            airiqNoneInput.checked = true;
        }
        configuration.airiq = 'none';

        ventIQSections.forEach(section => {
            section.style.display = '';
            const isExpanded = section.dataset.expanded === 'true';
            setModuleGroupExpanded(section, isExpanded);
        });
    } else {
        ventIQSections.forEach(section => {
            section.style.display = 'none';
        });
        closeModuleGroup('ventiq');

        const ventiqNoneInput = document.querySelector('input[name="ventiq"][value="none"]');
        if (ventiqNoneInput && !ventiqNoneInput.checked) {
            ventiqNoneInput.checked = true;
        }
        configuration.ventiq = 'none';

        airIQSections.forEach(section => {
            section.style.display = '';
            const isExpanded = section.dataset.expanded === 'true';
            setModuleGroupExpanded(section, isExpanded);
        });
    }

    updateModuleGroupSummaries();
}

function handleBathroomChange(e) {
    configuration.bathroom = e.target.checked;
    updateAirIQVentIQVisibility();
    updateConfiguration({ skipUrlUpdate: true });
    updateProgressSteps(getStep());
    updateUrlFromConfiguration();
}

function syncConfigurationFromInputs() {
    const selectedAirIQ = document.querySelector('input[name="airiq"]:checked')?.value || 'none';

    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    if (configuration.mounting === 'ceiling' && bathroomCheckbox) {
        configuration.bathroom = bathroomCheckbox.checked;
    } else {
        configuration.bathroom = false;
    }

    const canUseVentIQ = configuration.mounting === 'ceiling' && configuration.bathroom;
    const selectedVentIQ = canUseVentIQ
        ? (document.querySelector('input[name="ventiq"]:checked')?.value || 'none')
        : 'none';

    configuration.airiq = selectedAirIQ;
    configuration.ventiq = selectedVentIQ;

    if (configuration.ventiq !== 'none') {
        configuration.airiq = 'none';
        const airiqNoneInput = document.querySelector('input[name="airiq"][value="none"]');
        if (airiqNoneInput && !airiqNoneInput.checked) {
            airiqNoneInput.checked = true;
        }
    } else if (configuration.airiq !== 'none') {
        configuration.ventiq = 'none';
        const ventiqNoneInput = document.querySelector('input[name="ventiq"][value="none"]');
        if (ventiqNoneInput && !ventiqNoneInput.checked) {
            ventiqNoneInput.checked = true;
        }
    }

    if (!canUseVentIQ) {
        configuration.ventiq = 'none';
        const ventiqNoneInput = document.querySelector('input[name="ventiq"][value="none"]');
        if (ventiqNoneInput && !ventiqNoneInput.checked) {
            ventiqNoneInput.checked = true;
        }
    }

    configuration.fan = document.querySelector('input[name="fan"]:checked')?.value || 'none';

    // RoomIQ - sync from inputs
    configuration.roomiq = document.querySelector('input[name="roomiq"]:checked')?.value || 'none';

    // LED Ring - sync from inputs
    configuration.led = document.querySelector('input[name="led"]:checked')?.value || 'none';

    // Voice (Core Type) - sync from inputs
    configuration.voice = document.querySelector('input[name="voice"]:checked')?.value || 'none';
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
    // Hardware accessory modules (fan/led) are governed by the module matrix
    // and must never show a manifest-derived availability error, regardless of
    // what the caller passes in. Force them to the "available" state so any
    // stale status text from a previous render is cleared.
    if (input?.name && isAlwaysAvailableModuleKey(input.name)) {
        available = true;
        reason = '';
    }

    input.disabled = !available;
    const card = input.closest('.option-card');

    if (card) {
        if (available) {
            card.classList.remove('is-unavailable');
            card.removeAttribute('aria-disabled');
            card.removeAttribute('title');
        } else {
            card.classList.add('is-unavailable');
            card.setAttribute('aria-disabled', 'true');
            card.setAttribute('title', reason || 'Not available for this configuration.');
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

        const availabilityHint = card.querySelector('[data-module-availability-hint]');
        if (availabilityHint) {
            availabilityHint.textContent = !available ? (reason || 'Not available for this configuration.') : '';
            availabilityHint.hidden = available;
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
                card.removeAttribute('title');
                const status = card.querySelector('[data-option-status]');
                if (status) {
                    status.textContent = '';
                    status.style.display = 'none';
                }
                const availabilityHint = card.querySelector('[data-module-availability-hint]');
                if (availabilityHint) {
                    availabilityHint.textContent = '';
                    availabilityHint.hidden = true;
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

    if (key === 'voice') {
        return 'Core';
    }

    if (value === 'none') {
        return `${label} None`;
    }

    if (key === 'fan') {
        if (value === 'relay') {
            return `${label} Relay`;
        }
        return `${label} ${value.toUpperCase()}`;
    }

    return `${label} ${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function updateModuleGroupSummaries() {
    const visibleKeys = new Set(getVisibleModuleGroupKeys());
    const groups = document.querySelectorAll('[data-module-group]');
    groups.forEach(group => {
        const key = group.getAttribute('data-module-group');
        if (!key) {
            return;
        }

        const isVisible = visibleKeys.has(key);
        group.style.display = isVisible ? '' : 'none';
        if (!isVisible) {
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

function syncModuleToggleStates() {
    document.querySelectorAll('[data-module-toggle]').forEach(checkbox => {
        const moduleKey = checkbox.getAttribute('data-module-key');
        const variantOn = checkbox.getAttribute('data-variant-on');
        if (!moduleKey || !variantOn) {
            return;
        }

        const currentValue = configuration[moduleKey] || 'none';
        checkbox.checked = currentValue === variantOn;

        const onRadio = document.querySelector(`input[name="${moduleKey}"][value="${variantOn}"]`);
        const isUnavailable = !!(onRadio && onRadio.disabled);
        checkbox.disabled = isUnavailable;

        const group = checkbox.closest('[data-module-group]');
        if (group) {
            group.classList.toggle('is-on', checkbox.checked);
            group.classList.toggle('is-unavailable', isUnavailable);
        }
    });
}

function initializeModuleToggles() {
    document.querySelectorAll('[data-module-toggle]').forEach(checkbox => {
        if (checkbox.dataset.moduleToggleBound === 'true') {
            return;
        }
        checkbox.dataset.moduleToggleBound = 'true';

        checkbox.addEventListener('change', () => {
            const moduleKey = checkbox.getAttribute('data-module-key');
            const variantOn = checkbox.getAttribute('data-variant-on');
            if (!moduleKey || !variantOn) {
                return;
            }

            const targetValue = checkbox.checked ? variantOn : 'none';
            const radio = document.querySelector(`input[name="${moduleKey}"][value="${targetValue}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

    syncModuleToggleStates();
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
    if (!target || !getVisibleModuleGroupKeys().includes(key)) {
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

function clearAlwaysAvailableModuleOptions() {
    MODULE_KEYS.forEach(key => {
        if (!isAlwaysAvailableModuleKey(key)) {
            return;
        }
        document.querySelectorAll(`input[name="${key}"]`).forEach(input => {
            applyOptionAvailabilityState(input, { available: true, reason: '' });
        });
    });
}

function updateModuleOptionAvailability() {
    if (manifestLoadError || !configuration.mounting || !configuration.power) {
        resetOptionAvailability();
        return;
    }

    if (!isManifestReady()) {
        clearAlwaysAvailableModuleOptions();
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

            // Fan / Switching driver options and LED Ring options are hardware
            // accessory choices and are always selectable; their compatibility is
            // driven by the module matrix (conflicts) rather than manifest presence.
            if (isAlwaysAvailableModuleKey(key)) {
                applyOptionAvailabilityState(input, { available: true, reason: '' });
                return;
            }

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
        hint.innerHTML = '<div class="module-status-bar__content"><strong>Unable to load compatibility data.</strong> Module availability cannot be determined right now. <button type="button" class="btn-retry-manifest">Retry</button></div>';
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
    const unsupportedModules = MODULE_KEYS.filter(moduleKey => !isAlwaysAvailableModuleKey(moduleKey) && !availability.modules[moduleKey].has(configuration[moduleKey]));

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
        hint.innerHTML = `<div class="module-status-bar__content"><strong>Not available${scopeLabel}:</strong> ${unavailableTags}${detailsHtml}</div>`;
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
        hint.innerHTML = `<div class="module-status-bar__content"><strong>Partial support.</strong> ${label} is supported, but not with this exact module mix. ${selectedTags}${conflictDetails}</div>`;
        return;
    }

    hint.classList.add('is-success');
    const selectedTags = MODULE_KEYS
        .filter(moduleKey => configuration[moduleKey] !== 'none')
        .map(moduleKey => createModuleTag(formatModuleSelectionLabel(moduleKey, configuration[moduleKey]), 'success'))
        .join(' ') || createModuleTag('Core only', 'success');
    const label = combinationLabel ? escapeHtml(combinationLabel) : 'this configuration';
    hint.innerHTML = `<div class="module-status-bar__content"><strong>Fully supported.</strong> ${label} supports this module selection. ${selectedTags}</div>`;
}

function updateConfiguration(options = {}) {
    syncConfigurationFromInputs();
    updateModuleOptionAvailability();
    syncConfigurationFromInputs();
    updateModuleAvailabilityMessage();
    syncModuleToggleStates();
    updateModuleConflictBadges();
    updateModuleGroupSummaries();
    updateModuleFirmwareImpactHints();
    updateModuleVariantAvailability();
    updateFirmwareTargetPreview();

    if (!options.skipUrlUpdate) {
        updateUrlFromConfiguration();
    }
}

// Reveals the small "Adds RoomIQ to the firmware target." / "Uses the VentIQ
// firmware target instead of AirIQ." hints so the user understands which
// selections actually change the firmware identifier built in
// updateFirmwareTargetPreview() below. Hints stay hidden until their module
// is selected so the panel does not become a wall of text.
function updateModuleFirmwareImpactHints() {
    if (typeof document === 'undefined') {
        return;
    }

    const hints = [
        { selector: '[data-firmware-impact="roomiq"]', shouldShow: () => configuration.roomiq === 'roomiq' },
        { selector: '[data-firmware-impact="ventiq"]', shouldShow: () => configuration.ventiq === 'ventiq' }
    ];

    hints.forEach(({ selector, shouldShow }) => {
        const node = document.querySelector(selector);
        if (!node) {
            return;
        }

        const visible = Boolean(shouldShow());
        node.hidden = !visible;
        if (visible) {
            node.removeAttribute('aria-hidden');
        } else {
            node.setAttribute('aria-hidden', 'true');
        }
    });
}

// WF-UX-002 — single firmware-readiness verdict.
//
// Reads (does not mutate) the wizard's selection, the loaded manifest, the
// currently selected firmware build, the last firmware status message, the
// active release mode, and the browser capabilities. Returns one of six
// canonical readiness tags plus the user-facing copy each render site
// should display (see FIRMWARE_READINESS_COPY at module top).
//
// The helper is presentation-only: it does not touch acknowledgement
// state, install-gate logic, channel policy, or firmware selection. The
// existing release-channel + provenance + freshness gates remain
// authoritative for whether install actually fires; this helper only
// dictates the *headline* the user sees.
function getFirmwareReadiness({
    state = configuration,
    capabilities,
    firmware,
    status,
    mode
} = {}) {
    const caps = capabilities || (typeof detectCapabilities === 'function' ? detectCapabilities() : null);
    const browserSupported = !caps || caps.webSerial !== false;
    const selected = firmware !== undefined ? firmware : (typeof window !== 'undefined' ? window.currentFirmware : null);
    const statusMessage = status !== undefined ? status : firmwareStatusMessage;
    const releaseMode = mode || (typeof getReleaseMode === 'function' ? getReleaseMode() : 'normal');
    const configString = buildFirmwareTargetPreviewString(state);

    const kind = classifyFirmwareReadiness({
        configString,
        manifestHasConfig: Boolean(configString && manifestConfigStringLookup && manifestConfigStringLookup.has(configString)),
        firmwareChannel: selected ? normaliseReleaseChannel(selected.channel) : null,
        hasFirmware: Boolean(selected),
        hasNotAvailableStatus: Boolean(statusMessage && statusMessage.type === 'not-available'),
        browserSupported
    });

    const copy = FIRMWARE_READINESS_COPY[kind];
    return {
        kind,
        headline: copy.headline,
        body: copy.body,
        tone: copy.tone,
        configString,
        firmware: selected || null,
        releaseMode,
        browserSupported
    };
}

// Renders the Step 4 firmware-target preview block using the same config
// string composer (buildFirmwareTargetPreviewString) that Step 5 uses to
// match against manifest builds. The preview MUST stay aligned with the
// actual install-time match — if it drifts, users see one identifier on
// Step 4 and a different "not available" filename on Step 5.
//
// When mounting/power are not yet picked the preview prompts the user to
// continue. When the assembled config string has no matching manifest
// build the preview surfaces the canonical no-build copy from
// getFirmwareReadiness(). Module selection itself is never blocked here.
function updateFirmwareTargetPreview() {
    if (typeof document === 'undefined') {
        return;
    }

    const root = document.getElementById('firmware-target-preview');
    if (!root) {
        return;
    }

    const valueEl = root.querySelector('[data-firmware-target-preview-value]');
    const warningEl = root.querySelector('[data-firmware-target-preview-warning]');

    const configString = buildFirmwareTargetPreviewString(configuration);

    if (!configString) {
        if (valueEl) {
            valueEl.textContent = 'Select mounting and power to generate a firmware target.';
            valueEl.classList.remove('firmware-target-preview__value--ready');
        }
        if (warningEl) {
            warningEl.hidden = true;
            warningEl.removeAttribute('data-availability-state');
        }
        root.dataset.firmwareTargetState = 'incomplete';
        return;
    }

    if (valueEl) {
        valueEl.textContent = configString;
        valueEl.classList.add('firmware-target-preview__value--ready');
    }

    // WF-WIZARD-AVAIL-001 — classify the assembled config_string against
    // manifest + block-token set so the Step 4 preview can expose the same
    // availability vocabulary the per-card pills use. The visible warning
    // body stays the canonical WF-UX-002 `no-build` copy from
    // firmware-readiness.js so the Step 4 / Step 5 / sidebar surfaces all
    // continue to read identically. The classification is surfaced only via
    // the `data-availability-state` data hook (for CSS + tests) so future
    // styling differentiation does not require breaking the readiness
    // contract.
    const classification = classifyConfigString(configString, {
        manifestStableConfigs: manifestAvailabilityTokens.manifestStableConfigs,
        manifestPreviewConfigs: manifestAvailabilityTokens.manifestPreviewConfigs
    });
    const isAvailable = classification.installable;

    if (warningEl) {
        if (!isAvailable) {
            warningEl.textContent = FIRMWARE_READINESS_COPY['no-build'].body;
            warningEl.dataset.availabilityState = classification.state;
        } else {
            warningEl.removeAttribute('data-availability-state');
        }
        warningEl.hidden = isAvailable;
    }
    root.dataset.firmwareTargetState = isAvailable ? 'available' : 'unpublished';
    root.dataset.availabilityState = classification.state;
}

// WF-WIZARD-AVAIL-001 — per-variant availability pill renderer.
//
// Walks every module-group / module-card in Step 4, asks the availability
// classifier for the appropriate state, and projects the result into the
// per-card pill + detail slots. Also disables the radio for `blocked`
// variants (currently only `fan=triac` under HW-005) so the user cannot
// promise an install path the wizard can never fulfil.
//
// The classification result is the SAME object the test suite asserts
// against — no separate "view model" — so any test pinning a pill state
// pins the runtime decision too.
function getCanonicalManifestTokenForVariant(moduleKey, variantKey) {
    if (variantKey === 'none') {
        return null;
    }
    const formatter = MODULE_SEGMENT_FORMATTERS[moduleKey];
    if (typeof formatter !== 'function') {
        return null;
    }
    const token = formatter(variantKey);
    return typeof token === 'string' && token.length > 0 ? token : null;
}

function classifyVariantForRender(moduleKey, variantKey) {
    return classifyModuleVariant(moduleKey, variantKey, {
        canonicalTokenFor: getCanonicalManifestTokenForVariant,
        manifestStableTokens: manifestAvailabilityTokens.manifestStableTokens,
        manifestPreviewTokens: manifestAvailabilityTokens.manifestPreviewTokens
    });
}

function applyAvailabilityPill(target, classification) {
    if (!target) {
        return;
    }

    const pill = target.querySelector('[data-module-availability-pill]');
    if (pill) {
        if (classification.label) {
            pill.textContent = classification.label;
            pill.dataset.availabilityState = classification.state;
            pill.dataset.availabilityTone = classification.tone;
            pill.hidden = false;
            pill.removeAttribute('aria-hidden');
        } else {
            pill.textContent = '';
            pill.removeAttribute('data-availability-state');
            pill.removeAttribute('data-availability-tone');
            pill.hidden = true;
            pill.setAttribute('aria-hidden', 'true');
        }
    }

    const detail = target.querySelector('[data-module-availability-detail]');
    if (detail) {
        if (classification.detail) {
            detail.textContent = classification.detail;
            detail.hidden = false;
            detail.removeAttribute('aria-hidden');
        } else {
            detail.textContent = '';
            detail.hidden = true;
            detail.setAttribute('aria-hidden', 'true');
        }
    }
}

function applyAvailabilityAffordance(input, card, classification) {
    if (!input || !card) {
        return;
    }
    const isBlocked = classification.state === AVAILABILITY_STATES.BLOCKED;
    const isAdvancedWarning = classification.state === AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING;
    const wasBlocked = card.classList.contains('is-blocked');
    const wasAdvancedWarning = card.classList.contains('is-advanced-warning');

    if (isBlocked) {
        input.disabled = true;
        card.classList.add('is-blocked');
        card.classList.remove('is-advanced-warning');
        card.setAttribute('aria-disabled', 'true');
        card.setAttribute('data-availability-state', classification.state);
        const titleSource = classification.detail || classification.label;
        if (titleSource) {
            card.setAttribute('title', titleSource);
        }
        return;
    }

    if (isAdvancedWarning) {
        // WF-TRIAC-001 — visible + selectable. The radio stays enabled so
        // the customer can opt in deliberately; the install gate in
        // updateFirmwareControls() enforces the acknowledgement + manifest
        // match before any flash can fire. Do NOT set aria-disabled here —
        // the card is interactive.
        if (wasBlocked) {
            input.disabled = false;
        }
        card.classList.remove('is-blocked');
        card.classList.add('is-advanced-warning');
        if (card.getAttribute('aria-disabled') === 'true' && !card.classList.contains('is-unavailable')) {
            card.removeAttribute('aria-disabled');
        }
        card.setAttribute('data-availability-state', classification.state);
        const titleSource = classification.detail || classification.label;
        if (titleSource) {
            card.setAttribute('title', titleSource);
        }
        return;
    }

    // Neither blocked nor advanced-warning — clear any affordance this
    // function owns. Other code paths own input.disabled for unrelated
    // reasons (e.g. unsupported combos in updateModuleOptionAvailability),
    // so only flip input.disabled back when WE were the ones that set it.
    if (wasBlocked || wasAdvancedWarning) {
        input.disabled = false;
    }
    card.classList.remove('is-blocked');
    card.classList.remove('is-advanced-warning');
    if (card.getAttribute('aria-disabled') === 'true' && !card.classList.contains('is-unavailable')) {
        card.removeAttribute('aria-disabled');
    }
    card.removeAttribute('data-availability-state');
    if (card.getAttribute('title')) {
        card.removeAttribute('title');
    }
}

// Legacy alias — older callers may still reference applyBlockedAffordance.
// Kept until every call site is verified migrated; safe forwarder.
function applyBlockedAffordance(input, card, classification) {
    applyAvailabilityAffordance(input, card, classification);
}

function updateModuleVariantAvailability() {
    if (typeof document === 'undefined') {
        return;
    }

    // Per-fan-variant cards (the only fan-group radios we render).
    document.querySelectorAll('.module-card[data-module-card="fan"]').forEach(card => {
        const variantKey = card.getAttribute('data-variant');
        if (!variantKey || variantKey === 'none') {
            return;
        }
        const classification = classifyVariantForRender('fan', variantKey);
        applyAvailabilityPill(card, classification);
        const radio = card.querySelector(`input[name="fan"][value="${variantKey}"]`);
        applyAvailabilityAffordance(radio, card, classification);
    });

    // Toggle-style module groups (RoomIQ / AirIQ / VentIQ / LED). Each
    // exposes a single non-`none` variant whose key matches data-variant-on.
    document.querySelectorAll('.module-group--toggle[data-module-group]').forEach(group => {
        const moduleKey = group.getAttribute('data-module-group');
        if (!moduleKey || moduleKey === 'voice') {
            return;
        }
        const toggle = group.querySelector('[data-module-toggle]');
        const variantKey = toggle?.getAttribute('data-variant-on') || null;
        if (!variantKey) {
            return;
        }
        const classification = classifyVariantForRender(moduleKey, variantKey);
        applyAvailabilityPill(group, classification);
    });

    // WF-TRIAC-001 — refresh the inline advanced/manual-warning region(s)
    // so the ack checkbox reflects the live state. Pruning happens here too
    // because deselecting the variant should drop the previously-granted
    // consent.
    updateAdvancedWarningRegions();
}

// WF-TRIAC-001 — drive the per-card advanced/manual-warning region.
//
// The region lives in static markup (index.html) as a sibling to its
// module-card. It is revealed when the variant is currently selected, and
// the inline checkbox is bound to advancedWarningAcknowledgements via
// setAdvancedWarningAcknowledged(). When the variant is NOT selected the
// region collapses (hidden) and the stored ack is dropped so a future
// reselection always re-prompts the customer.
function getAdvancedWarningRegions() {
    if (typeof document === 'undefined') {
        return [];
    }
    return Array.from(document.querySelectorAll('[data-advanced-warning-region]'));
}

function isVariantCurrentlySelected(moduleKey, variantKey) {
    if (!moduleKey || !variantKey) {
        return false;
    }
    // The wizard state object uses module keys directly (`fan`, `roomiq`, …).
    return configuration[moduleKey] === variantKey;
}

function updateAdvancedWarningRegions() {
    const regions = getAdvancedWarningRegions();
    if (regions.length === 0) {
        return;
    }

    regions.forEach(region => {
        const moduleKey = region.getAttribute('data-advanced-warning-module');
        const variantKey = region.getAttribute('data-advanced-warning-variant');
        if (!moduleKey || !variantKey) {
            return;
        }

        const classification = (() => {
            try {
                return classifyVariantForRender(moduleKey, variantKey);
            } catch {
                return null;
            }
        })();
        const isAdvancedWarning = classification?.state === AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING;
        const isSelected = isVariantCurrentlySelected(moduleKey, variantKey);

        // Region is interactive only when the variant is the live
        // selection. With the variant deselected the stored ack is
        // dropped so the customer must re-consent on the next selection.
        if (!isSelected) {
            clearAdvancedWarningAck(moduleKey, variantKey);
        }

        const shouldShow = Boolean(isAdvancedWarning && isSelected);
        region.hidden = !shouldShow;
        if (shouldShow) {
            region.removeAttribute('aria-hidden');
        } else {
            region.setAttribute('aria-hidden', 'true');
        }

        const checkbox = region.querySelector('[data-advanced-warning-acknowledge]');
        if (checkbox) {
            const ackState = isAdvancedWarningAcknowledged(moduleKey, variantKey);
            if (checkbox.checked !== ackState) {
                checkbox.checked = ackState;
            }
            // The radio for the parent card is enabled — keep the checkbox
            // operable while the variant is selected.
            checkbox.disabled = !shouldShow;
        }
    });
}

function handleAdvancedWarningAckChange(event) {
    const target = event?.target;
    if (!target || !target.matches?.('[data-advanced-warning-acknowledge]')) {
        return;
    }
    const moduleKey = target.getAttribute('data-advanced-warning-module');
    const variantKey = target.getAttribute('data-advanced-warning-variant');
    if (!moduleKey || !variantKey) {
        return;
    }
    setAdvancedWarningAcknowledged(moduleKey, variantKey, target.checked === true);
    updateFirmwareControls();
    try {
        refreshPreflightDiagnostics();
    } catch {
        /* defensive — Step 4 may run before Step 5 is wired up */
    }
}

function bindAdvancedWarningAcknowledgementListener() {
    if (typeof document === 'undefined') {
        return;
    }
    // Single delegated listener for any advanced-warning checkbox added by
    // the static markup. Re-binding is safe because we attach to document
    // only once per module load.
    if (document._wfAdvancedWarningAckListenerBound) {
        return;
    }
    document.addEventListener('change', handleAdvancedWarningAckChange, true);
    document._wfAdvancedWarningAckListenerBound = true;
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

    // First reach of the review step kicks off the manifest freshness
    // check (network-first re-fetch). The check is idempotent across
    // re-entries; see triggerManifestFreshnessCheckIfNeeded().
    if (currentStep === totalSteps) {
        triggerManifestFreshnessCheckIfNeeded();
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

    if (currentStep === 4) {
        updateFanModuleVisibility();
        updateBathroomVisibility();
        updateModuleOptionAvailability();
        updateModuleAvailabilityMessage();
        syncModuleToggleStates();
    }

    if (currentStep === 5) {
        if (previousStep !== 5) {
            // Reset the connection-quality stability window when the user
            // first arrives at the review step so the preflight check is
            // measured against the time the device is actually expected to
            // be connected rather than the time elapsed since page load.
            // This deliberately bypasses updateConnectionQualityMetrics so
            // the "connection attempted" flag stays false — merely opening
            // step 5 must not graduate the check out of pending.
            connectionQualityMetrics.stabilityWindowStart = Date.now();
        }
        bindSerialDisconnectListener();
        updateConfiguration({ skipUrlUpdate: true });
        updateSummary();
        findCompatibleFirmware();
        refreshPreflightDiagnostics();
    }

    if (!skipUrlUpdate) {
        updateUrlFromConfiguration();
    }

    const mobileSummaryRoot = document.querySelector('[data-mobile-summary] [data-module-summary]');
    if (mobileSummaryRoot) {
        const targetVariant = currentStep === 5 ? 'review' : 'module';
        mobileSummaryRoot.dataset.moduleSummaryVariant = targetVariant;
    }

    window.renderSidebar?.(currentStep);
}

function updateProgressSteps(targetStep) {
    const maxReachable = getMaxReachableStep();
    const safeTargetStep = Math.min(Math.max(targetStep, 1), totalSteps);

    for (let i = 1; i <= totalSteps; i++) {
        const progressElements = document.querySelectorAll(`.progress-step[data-step="${i}"]`);
        if (!progressElements.length) continue;

        const isReachable = i <= maxReachable;
        const isCurrent = i === safeTargetStep;
        const isCompleted = i < safeTargetStep;

        progressElements.forEach(progressElement => {
            progressElement.dataset.reachable = String(isReachable);

            if (isReachable) {
                progressElement.removeAttribute('aria-disabled');
            } else {
                progressElement.setAttribute('aria-disabled', 'true');
            }

            if (isCurrent) {
                progressElement.classList.add('active');
                progressElement.setAttribute('aria-current', 'step');
            } else {
                progressElement.classList.remove('active');
                progressElement.removeAttribute('aria-current');
            }

            if (isCompleted) {
                progressElement.classList.add('completed');
            } else {
                progressElement.classList.remove('completed');
            }

            // Compose an accessible name that includes step status. Visible
            // labels are kept terse for layout reasons; AT users get the full
            // context (step number, name, completion / availability).
            const labelEl = progressElement.querySelector('.step-label');
            const baseLabel = labelEl ? labelEl.textContent.trim() : `Step ${i}`;
            let stateSuffix;
            if (isCurrent) {
                stateSuffix = 'current step';
            } else if (isCompleted) {
                stateSuffix = 'completed';
            } else if (!isReachable) {
                stateSuffix = 'not yet available';
            } else {
                stateSuffix = 'available';
            }
            progressElement.setAttribute('aria-label', `Step ${i}: ${baseLabel} — ${stateSuffix}`);
        });
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

    const isCeilingBathroom = configuration.mounting === 'ceiling' && configuration.bathroom === true;
    const rows = [];

    rows.push({
        label: 'Mounting Type:',
        value: configuration.mounting
            ? (MOUNT_LABELS[configuration.mounting] || configuration.mounting)
            : 'Not selected'
    });

    rows.push({
        label: 'Power Option:',
        value: configuration.power
            ? (POWER_LABELS[configuration.power] || configuration.power.toUpperCase())
            : 'Not selected'
    });

    // Step 4 module ordering: RoomIQ → AirIQ/VentIQ → Fan → LED.
    // Voice is omitted because the Core has a single variant. AirIQ and
    // VentIQ are mutually exclusive — bathroom toggle picks which one
    // is shown, mirroring getVisibleModuleGroupKeys above.
    const summaryModuleKeys = ['roomiq', 'airiq', 'ventiq', 'fan', 'led'];
    summaryModuleKeys.forEach(moduleKey => {
        const variant = configuration[moduleKey];
        if (!variant || variant === 'none') return;
        if (moduleKey === 'airiq' && isCeilingBathroom) return;
        if (moduleKey === 'ventiq' && !isCeilingBathroom) return;

        const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;
        const variantLabel = MODULE_VARIANT_LABELS[moduleKey]?.[variant]
            || (variant.charAt(0).toUpperCase() + variant.slice(1));
        const description = getModuleVariantEntry(moduleKey, variant)?.description || '';

        rows.push({
            label: `${moduleLabel}:`,
            value: variantLabel,
            description
        });
    });

    const itemsHtml = rows.map(row => {
        const sensors = row.description
            ? `<div class="summary-sensors">${escapeHtml(row.description)}</div>`
            : '';
        return `
        <div class="summary-item">
            <div class="summary-label">${escapeHtml(row.label)}</div>
            <div class="summary-value">${escapeHtml(row.value)}</div>
            ${sensors}
        </div>
    `;
    }).join('');

    summaryContainer.innerHTML = `<div class="summary-grid">${itemsHtml}</div>`;
}

function updateFirmwareControls() {
    const downloadBtn = document.getElementById('download-btn');
    const downloadBtnHost = downloadBtn?.closest?.('.wizard-step') || null;
    const downloadBtnStepNumber = downloadBtnHost?.id
        ? Number(downloadBtnHost.id.replace('step-', ''))
        : NaN;
    const reviewStepNumber = Number.isFinite(downloadBtnStepNumber) && downloadBtnStepNumber > 0
        ? downloadBtnStepNumber
        : totalSteps;
    const firmwareIsRegistered = Boolean(
        window.currentFirmware
        && window.currentFirmware.firmwareId
        && firmwareOptionsMap.has(window.currentFirmware.firmwareId)
    );
    const hasFirmware = Boolean(
        window.currentFirmware
        && Array.isArray(window.currentFirmware.parts)
        && window.currentFirmware.parts.length > 0
        && firmwareIsRegistered
    );
    const canWebSerial = Boolean(navigator?.serial);
    const onReviewStep = currentStep === reviewStepNumber;
    const shouldShowInstallControls = canWebSerial && onReviewStep;
    const verificationStatus = (firmwareVerificationState.status || '').toString().toLowerCase();
    const isVerified = verificationStatus === 'verified';
    const isPending = verificationStatus === 'pending';
    const isFailed = verificationStatus === 'failed';
    const isAcknowledged = Boolean(preFlashAcknowledged);
    const preflightChecks = Array.isArray(window.latestPreflightChecks) ? window.latestPreflightChecks : [];
    const preflightPolicy = evaluatePreflightPolicy(preflightChecks);
    const blockingReason = preflightPolicy.blockingReasons[0] || '';
    const outstandingChannelAcks = getOutstandingChannelAcknowledgements(window.currentFirmware);
    const channelAcksSatisfied = outstandingChannelAcks.length === 0;
    const channelBlockingReason = channelAcksSatisfied
        ? ''
        : 'Acknowledge the firmware-channel warning before installing.';

    // WF-TRIAC-001 — advanced/manual-warning acknowledgement gate.
    // Orthogonal to channelAcksSatisfied. Today only fan=triac trips this
    // gate. Drops any stale acks (e.g. the user deselected the variant in
    // the same tick) before checking.
    pruneInactiveAdvancedWarningAcks(configuration);
    const outstandingAdvancedWarningAcks = getOutstandingAdvancedWarningAcknowledgements(configuration);
    const advancedWarningAcksSatisfied = outstandingAdvancedWarningAcks.length === 0;
    const advancedWarningBlockingReason = advancedWarningAcksSatisfied
        ? ''
        : 'Acknowledge the advanced/manual warning for the selected module before installing.';

    // CACHE FRESHNESS POLICY (see comment block near top of this file).
    // The freshness gate only kicks in once the freshness check has
    // actually been performed (or an explicit verdict has been set).
    // Until then the default 'unknown' state is the bootstrap state —
    // not evidence of a stale manifest — and must not block the user.
    const freshness = evaluateFreshnessGate();
    const { ok: freshnessOk, blockingReason: freshnessBlockingReason, swUpdateBlocking, manifestStaleBlocking } = freshness;

    const readyToFlash = hasFirmware && isVerified && isAcknowledged && preflightPolicy.canInstall && channelAcksSatisfied && advancedWarningAcksSatisfied && freshnessOk;

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
            } else if (!advancedWarningAcksSatisfied) {
                downloadBtn.title = advancedWarningBlockingReason;
            } else if (!channelAcksSatisfied) {
                downloadBtn.title = channelBlockingReason;
            } else if (!preflightPolicy.canInstall && blockingReason) {
                downloadBtn.title = blockingReason;
            } else if (!freshnessOk && freshnessBlockingReason) {
                downloadBtn.title = freshnessBlockingReason;
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
        } else if (!advancedWarningAcksSatisfied) {
            copyUrlBtn.title = advancedWarningBlockingReason;
        } else if (!channelAcksSatisfied) {
            copyUrlBtn.title = channelBlockingReason;
        } else if (!preflightPolicy.canInstall && blockingReason) {
            copyUrlBtn.title = blockingReason;
        } else if (!freshnessOk && freshnessBlockingReason) {
            copyUrlBtn.title = freshnessBlockingReason;
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
                } else if (!advancedWarningAcksSatisfied) {
                    installButton.title = advancedWarningBlockingReason;
                } else if (!channelAcksSatisfied) {
                    installButton.title = channelBlockingReason;
                } else if (!preflightPolicy.canInstall && blockingReason) {
                    installButton.title = blockingReason;
                } else if (!freshnessOk && freshnessBlockingReason) {
                    installButton.title = freshnessBlockingReason;
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
        if (!advancedWarningAcksSatisfied) {
            return { text: advancedWarningBlockingReason, isError: false, isWarning: true };
        }
        if (!channelAcksSatisfied) {
            return { text: channelBlockingReason, isError: false, isWarning: true };
        }
        if (!preflightPolicy.canInstall && blockingReason) {
            return { text: blockingReason, isError: true, isWarning: false };
        }
        if (!freshnessOk && freshnessBlockingReason) {
            const isHardBlock = swUpdateBlocking || manifestStaleBlocking;
            return { text: freshnessBlockingReason, isError: isHardBlock, isWarning: !isHardBlock };
        }
        if (preflightPolicy.requiresWarnAcknowledgement) {
            return { text: 'Warnings detected. Check “Accept preflight warnings” to continue installation.', isError: false, isWarning: true };
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
            } else if (!advancedWarningAcksSatisfied) {
                summaryInstallButton.title = advancedWarningBlockingReason;
            } else if (!channelAcksSatisfied) {
                summaryInstallButton.title = channelBlockingReason;
            } else if (!preflightPolicy.canInstall && blockingReason) {
                summaryInstallButton.title = blockingReason;
            } else if (!freshnessOk && freshnessBlockingReason) {
                summaryInstallButton.title = freshnessBlockingReason;
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

    const primaryHelper = document.querySelector('.secondary-action-group [data-ready-helper]');
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
    const statusList = document.querySelector('[data-preflight-list]');
    if (!statusList) {
        return [];
    }

    const createCheck = ({ key, label, state, detail, blocking = false }) => ({
        key,
        label,
        state,
        detail: detail || '',
        blocking: Boolean(blocking)
    });

    const getFirmwareVerificationCheck = () => {
        const verificationStatus = (firmwareVerificationState?.status || '').toString().toLowerCase();
        if (verificationStatus === 'verified') {
            return createCheck({
                key: 'firmware-verification',
                label: 'Firmware verification',
                state: 'pass',
                detail: firmwareVerificationState.message || 'SHA-256 integrity check passed.',
                blocking: false
            });
        }
        if (verificationStatus === 'failed') {
            return createCheck({
                key: 'firmware-verification',
                label: 'Firmware verification',
                state: 'fail',
                detail: firmwareVerificationState.message || 'Firmware verification failed.',
                blocking: true
            });
        }
        if (verificationStatus === 'pending') {
            return createCheck({
                key: 'firmware-verification',
                label: 'Firmware verification',
                state: 'warn',
                detail: firmwareVerificationState.message || 'Verification is still in progress.',
                blocking: true
            });
        }

        return createCheck({
            key: 'firmware-verification',
            label: 'Firmware verification',
            state: 'warn',
            detail: 'Choose firmware to start verification.',
            blocking: true
        });
    };

    const getDeviceVisibilityCheck = () => {
        const statusElement = document.querySelector('[data-device-status]');
        const warningElement = document.querySelector('[data-device-warning]');
        const errorElement = document.querySelector('[data-device-error]:not([hidden])');
        const connected = statusElement?.classList.contains('device-info-panel__status--connected');
        const warningText = warningElement && !warningElement.hidden ? warningElement.textContent?.trim() : '';

        if (connected) {
            return createCheck({
                key: 'device-visibility',
                label: 'Device connection visibility',
                state: warningText ? 'warn' : 'pass',
                detail: warningText || 'Device is connected and readable.',
                blocking: false
            });
        }

        if (errorElement) {
            const errorMessage = errorElement.querySelector('[data-device-error-message]')?.textContent?.trim();
            return createCheck({
                key: 'device-visibility',
                label: 'Device connection visibility',
                state: 'warn',
                detail: errorMessage || 'Unable to read device info. You can continue if the device is connected.',
                blocking: false
            });
        }

        // Before any connect/disconnect/install event, treat device visibility
        // as "not checked yet" rather than a warning — there is no evidence of
        // a problem, just no data. The check resolves to pass/warn once the
        // device-info panel reports a real status.
        return createCheck({
            key: 'device-visibility',
            label: 'Device connection visibility',
            state: 'pending',
            detail: 'Connect your hub to test this check.',
            blocking: false
        });
    };

    const getConnectionQualityCheck = () => {
        const metrics = getConnectionQualitySnapshot();
        const serialFailures = metrics.serialReadFailures + metrics.serialWriteFailures;
        const stabilitySeconds = Math.floor(metrics.stabilityWindowMs / 1000);
        const hasFailureEvents =
            metrics.disconnects > 0
            || serialFailures > 0
            || metrics.retryCount > 0;

        // Until the user has actually attempted to connect (or we have
        // captured a failure event), show a neutral pending state. Zero
        // events over zero seconds is not evidence of an unstable link —
        // it just means the check has not run yet.
        if (!preflightConnectionAttempted && !hasFailureEvents) {
            return createCheck({
                key: 'connection-quality',
                label: 'Connection quality',
                state: 'pending',
                detail: 'Connect your hub to test this check.',
                blocking: false
            });
        }

        const fail =
            metrics.disconnects >= CONNECTION_QUALITY_THRESHOLDS.failDisconnects
            || serialFailures >= CONNECTION_QUALITY_THRESHOLDS.failSerialFailures
            || metrics.retryCount >= CONNECTION_QUALITY_THRESHOLDS.failRetries
            // Stability-window threshold only fires alongside a real failure
            // event. Otherwise a freshly-reset window misreads as instability
            // even with zero observed problems.
            || (hasFailureEvents
                && metrics.stabilityWindowMs < CONNECTION_QUALITY_THRESHOLDS.failStabilityWindowMs);

        if (fail) {
            return createCheck({
                key: 'connection-quality',
                label: 'Connection quality',
                state: 'fail',
                detail: `Link is unstable (${metrics.disconnects} disconnects, ${metrics.reconnectAttempts} reconnect attempts, ${serialFailures} serial failures, ${metrics.retryCount} retries over ${stabilitySeconds}s). Reconnect the cable/device, then retry once the connection stays stable for at least 30 seconds.`,
                blocking: true
            });
        }

        const warn =
            metrics.disconnects >= CONNECTION_QUALITY_THRESHOLDS.warnDisconnects
            || serialFailures >= CONNECTION_QUALITY_THRESHOLDS.warnSerialFailures
            || metrics.retryCount >= CONNECTION_QUALITY_THRESHOLDS.warnRetries
            || (hasFailureEvents
                && metrics.stabilityWindowMs < CONNECTION_QUALITY_THRESHOLDS.warnStabilityWindowMs);

        if (warn) {
            return createCheck({
                key: 'connection-quality',
                label: 'Connection quality',
                state: 'warn',
                detail: `Minor link instability detected (${metrics.disconnects} disconnects, ${metrics.reconnectAttempts} reconnect attempts, ${serialFailures} serial failures, ${metrics.retryCount} retries over ${stabilitySeconds}s). You can proceed, but a stable USB/serial link for 30+ seconds is recommended.`,
                blocking: false
            });
        }

        return createCheck({
            key: 'connection-quality',
            label: 'Connection quality',
            state: 'pass',
            detail: `Connection remained stable for ${stabilitySeconds}s with no disconnects or serial failures. Safe to continue.`,
            blocking: false
        });
    };

    const browserReadiness = evaluateBrowserReadiness(detectCapabilities());
    const browserCheckState = browserReadiness.level === 'block'
        ? 'fail'
        : browserReadiness.level === 'warn' ? 'warn' : 'pass';
    const browserCheckDetail = browserReadiness.level === 'ok'
        ? `Web Serial is available in ${browserReadiness.capabilities.browserName || 'this browser'}.`
        : (browserReadiness.reasons[0]?.message || 'Browser readiness check failed.');

    const getManifestFreshnessCheck = () => {
        if (!manifestFreshnessHasRun) {
            return createCheck({
                key: 'manifest-freshness',
                label: 'Manifest freshness',
                state: 'pending',
                detail: 'Manifest freshness check has not run yet. It runs automatically when you reach this step.',
                blocking: false
            });
        }
        if (manifestFreshnessState === 'current') {
            return createCheck({
                key: 'manifest-freshness',
                label: 'Manifest freshness',
                state: 'pass',
                detail: 'Firmware manifest matches the published list.',
                blocking: false
            });
        }
        if (manifestFreshnessState === 'stale') {
            return createCheck({
                key: 'manifest-freshness',
                label: 'Manifest freshness',
                state: 'fail',
                detail: 'A newer firmware manifest is available. Reload to pick up the latest published firmware list.',
                blocking: true
            });
        }
        // 'unknown' verdict: surface as an actionable warn until the user
        // explicitly acknowledges the inline checkbox. Once acknowledged,
        // resolve to pass so the preflight panel does not also require the
        // global "Accept preflight warnings" checkbox — the freshness gate
        // is already satisfied by manifestFreshnessAck.
        if (manifestFreshnessAck) {
            return createCheck({
                key: 'manifest-freshness',
                label: 'Manifest freshness',
                state: 'pass',
                detail: 'WebFlash could not confirm whether the firmware list is up to date. You acknowledged this and chose to continue with the firmware list already loaded in this browser. Use “Recheck manifest freshness” to retry the check.',
                blocking: false
            });
        }
        return createCheck({
            key: 'manifest-freshness',
            label: 'Manifest freshness',
            state: 'warn',
            detail: 'WebFlash could not confirm whether the firmware list is up to date. Use “Recheck manifest freshness” to retry before installing — or, if you continue, check the acknowledgement to use the firmware list already loaded in this browser.',
            blocking: true
        });
    };

    const checks = [
        createCheck({
            key: 'browser-support',
            label: 'Browser support',
            state: browserCheckState,
            detail: browserCheckDetail,
            blocking: browserCheckState === 'fail'
        }),
        getDeviceVisibilityCheck(),
        getConnectionQualityCheck(),
        getFirmwareVerificationCheck(),
        createCheck({
            key: 'user-acknowledgement',
            label: 'User acknowledgement',
            state: preFlashAcknowledged ? 'pass' : 'warn',
            detail: preFlashAcknowledged
                ? 'Pre-flash checklist acknowledged.'
                : 'Review and acknowledge the pre-flash checklist before installing.',
            blocking: !preFlashAcknowledged
        }),
        getManifestFreshnessCheck()
    ];
    const hasFails = checks.some(check => check.state === 'fail');
    const hasWarnings = checks.some(check => check.state === 'warn');
    // WF-UX-004: the warning override is meaningful only when warnings are the
    // sole obstacle. If a hard fail is present too, no amount of ticking the
    // override will unlock install (evaluatePreflightPolicy requires zero
    // fails) — so hide the control rather than tease an action that won't
    // help.
    const showWarnOverride = hasWarnings && !hasFails;
    const warningsAcknowledgeControl = document.querySelector('[data-preflight-warn-acknowledge]');
    const warningsAcknowledgeInput = warningsAcknowledgeControl?.matches?.('input[type="checkbox"]')
        ? warningsAcknowledgeControl
        : warningsAcknowledgeControl?.querySelector('input[type="checkbox"]')
            || document.querySelector('[data-preflight-warn-acknowledge-input]');
    if (warningsAcknowledgeControl) {
        warningsAcknowledgeControl.hidden = !showWarnOverride;
        warningsAcknowledgeControl.setAttribute('aria-hidden', showWarnOverride ? 'false' : 'true');
        if (warningsAcknowledgeControl.dataset.preflightWarnBound !== 'true') {
            warningsAcknowledgeControl.addEventListener('change', event => {
                setPreflightWarningsAcknowledgement(Boolean(event?.target?.checked));
            });
            warningsAcknowledgeControl.dataset.preflightWarnBound = 'true';
        }
        if (!showWarnOverride) {
            if (warningsAcknowledgeInput && 'checked' in warningsAcknowledgeInput) {
                warningsAcknowledgeInput.checked = false;
            }
            setPreflightWarningsAcknowledgement(false);
        }
    } else if (!showWarnOverride) {
        setPreflightWarningsAcknowledgement(false);
    }

    const STATUS_LABELS = Object.freeze({
        pass: 'Pass',
        warn: 'Warning',
        fail: 'Fail',
        pending: 'Not checked yet'
    });
    const STATUS_ICONS = Object.freeze({
        pass: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.4 11.2 3.2 8l1.1-1.1 2.1 2.1 5.3-5.3L12.8 4z"></path></svg>',
        warn: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.6 15 14H1L8 1.6zm0 4.2a.9.9 0 0 0-.9.9v3a.9.9 0 1 0 1.8 0v-3a.9.9 0 0 0-.9-.9zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path></svg>',
        fail: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4.7 3.6 3.3 3.3 3.3-3.3 1.1 1.1-3.3 3.3 3.3 3.3-1.1 1.1-3.3-3.3-3.3 3.3-1.1-1.1 3.3-3.3-3.3-3.3 1.1-1.1z"></path></svg>',
        pending: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm-.75 1.75v3.93l3.05 1.82.75-1.27-2.3-1.36V4.75h-1.5z"></path></svg>'
    });

    checks.forEach(check => {
        const item = statusList.querySelector(`[data-preflight-item="${check.key}"]`);
        const statusNode = statusList.querySelector(`[data-preflight-status="${check.key}"]`);
        const detailNode = statusList.querySelector(`[data-preflight-detail="${check.key}"]`);
        if (!item || !statusNode || !detailNode) {
            return;
        }

        const state = ['pass', 'warn', 'fail', 'pending'].includes(check.state) ? check.state : 'warn';
        item.dataset.status = state;
        statusNode.classList.remove('status-pass', 'status-warn', 'status-fail', 'status-pending');
        statusNode.classList.add(`status-${state}`);
        statusNode.innerHTML = `${STATUS_ICONS[state]}<span>${STATUS_LABELS[state]}</span>`;
        detailNode.textContent = check.detail;
    });

    // The manifest-freshness preflight item exposes inline recovery controls
    // (recheck button, acknowledgement checkbox). They are surfaced only when
    // the freshness verdict is unknown or stale — on the happy path the row
    // stays as a plain pass entry. Wiring is idempotent so repeated calls to
    // refreshPreflightDiagnostics() do not stack listeners.
    syncManifestFreshnessInlineControls(statusList);

    // Support bundle controls live behind the failures/warnings — keep them
    // hidden on the happy path so Step 5 stays simple by default. Surface
    // them as soon as any check is non-passing so the user can grab the
    // diagnostics they need to triage.
    const supportActions = document.querySelector('[data-preflight-support-actions]');
    if (supportActions) {
        const hasIssues = checks.some(check => check.state === 'warn' || check.state === 'fail');
        supportActions.hidden = !hasIssues;
        supportActions.setAttribute('aria-hidden', hasIssues ? 'false' : 'true');
    }

    // WF-UX-004: render the single headline verdict above the diagnostic rows
    // and toggle the details disclosure open for non-ready states so users
    // see the specifics immediately. The user's manual toggle wins — once
    // they have explicitly opened or closed the disclosure, we stop fighting
    // them on subsequent refreshes.
    renderPreflightVerdict(checks);

    window.latestPreflightChecks = checks;
    return checks;
}

const PREFLIGHT_VERDICT_ICONS = Object.freeze({
    ready: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6zm-1.1 11.5L5.4 9.7l1.2-1.2 2.3 2.3 4.5-4.5 1.2 1.2-5.7 5.7z"/></svg>',
    attention: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.7 19 17.5H1L10 1.7zm0 5.6a1 1 0 0 0-1 1v3.4a1 1 0 1 0 2 0V8.3a1 1 0 0 0-1-1zm0 7.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg>',
    blocked: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6zM6.1 5l8.9 8.9-1.1 1.1L5 6.1 6.1 5zm7.8 0L15 6.1 6.1 15 5 13.9 13.9 5z"/></svg>'
});

function renderPreflightVerdict(checks) {
    const card = document.querySelector('[data-preflight-verdict]');
    if (!card) {
        return;
    }
    const verdict = derivePreflightVerdict(checks);
    card.dataset.verdict = verdict.level;

    const iconNode = card.querySelector('[data-preflight-verdict-icon]');
    if (iconNode) {
        iconNode.innerHTML = PREFLIGHT_VERDICT_ICONS[verdict.level] || '';
    }
    const titleNode = card.querySelector('[data-preflight-verdict-title]');
    if (titleNode) {
        titleNode.textContent = verdict.title;
    }
    const detailNode = card.querySelector('[data-preflight-verdict-detail]');
    if (detailNode) {
        detailNode.textContent = verdict.detail;
    }

    const details = document.querySelector('[data-preflight-details]');
    if (details && details.dataset.preflightDetailsUserToggled !== 'true') {
        if (details.dataset.preflightDetailsBound !== 'true') {
            details.addEventListener('toggle', () => {
                details.dataset.preflightDetailsUserToggled = 'true';
            });
            details.dataset.preflightDetailsBound = 'true';
        }
        const shouldOpen = verdict.level !== 'ready';
        if (shouldOpen) {
            details.setAttribute('open', '');
        } else {
            details.removeAttribute('open');
        }
    }
}

function syncManifestFreshnessInlineControls(statusList) {
    if (!statusList) {
        return;
    }
    const item = statusList.querySelector('[data-preflight-item="manifest-freshness"]');
    if (!item) {
        return;
    }

    const actions = item.querySelector('[data-manifest-freshness-actions]');
    const recheckBtn = item.querySelector('[data-manifest-freshness-recheck]');
    const ackControl = item.querySelector('[data-manifest-freshness-ack-control]');
    const ackInput = item.querySelector('[data-manifest-freshness-acknowledge]');

    const showActions = manifestFreshnessHasRun
        && (manifestFreshnessState === 'unknown' || manifestFreshnessState === 'stale');
    const showAck = manifestFreshnessHasRun && manifestFreshnessState === 'unknown';

    if (actions) {
        actions.hidden = !showActions;
        actions.setAttribute('aria-hidden', showActions ? 'false' : 'true');
    }
    if (ackControl) {
        ackControl.hidden = !showAck;
        ackControl.setAttribute('aria-hidden', showAck ? 'false' : 'true');
    }

    if (recheckBtn) {
        if (recheckBtn.dataset.manifestFreshnessRecheckBound !== 'true') {
            recheckBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                if (manifestFreshnessRecheckInFlight) {
                    return;
                }
                manifestFreshnessRecheckInFlight = true;
                const originalLabel = recheckBtn.textContent;
                recheckBtn.disabled = true;
                recheckBtn.textContent = 'Rechecking…';
                try {
                    await checkManifestFreshnessNow({ force: true });
                } catch (error) {
                    console.warn('[state] manifest freshness recheck failed:', error);
                } finally {
                    manifestFreshnessRecheckInFlight = false;
                    recheckBtn.textContent = originalLabel;
                    try {
                        await refreshPreflightDiagnostics();
                    } catch (error) {
                        console.warn('[state] refresh after manifest recheck failed:', error);
                    }
                }
            });
            recheckBtn.dataset.manifestFreshnessRecheckBound = 'true';
        }
        recheckBtn.disabled = manifestFreshnessRecheckInFlight;
    }

    if (ackInput) {
        if (ackInput.dataset.manifestFreshnessAckBound !== 'true') {
            ackInput.addEventListener('change', (event) => {
                setManifestFreshnessAcknowledgement(Boolean(event?.target?.checked));
            });
            ackInput.dataset.manifestFreshnessAckBound = 'true';
        }
        if (!showAck) {
            // The row is no longer in the unknown state — drop any stale
            // acknowledgement check mark so the next unknown verdict starts
            // from an unchecked baseline.
            if ('checked' in ackInput && ackInput.checked) {
                ackInput.checked = false;
            }
        } else if ('checked' in ackInput) {
            ackInput.checked = manifestFreshnessAck;
        }
    }
}

// Diagnostics builder lives in scripts/services/diagnostics.js. State.js
// supplies a state provider so the bundle can reach private module
// variables (configuration, currentStep, manifestData, manifestFreshness,
// currentFirmware, releaseMode) without exporting them.
setSupportBundleStateProvider(() => {
    const firmware = typeof window !== 'undefined' ? window.currentFirmware : null;
    // Recommended-default is derived (not stored on the firmware entry) so it
    // must be computed at snapshot time. Acknowledgement completion is read
    // from the live `channelAcknowledgements` Map rather than the DOM so the
    // diagnostics bundle reflects state even before the panel renders.
    let firmwareIsRecommendedDefault = false;
    let channelAcknowledgementsCompleted = true;
    try {
        firmwareIsRecommendedDefault = isFirmwareRecommendedDefault(firmware);
    } catch {
        firmwareIsRecommendedDefault = false;
    }
    try {
        channelAcknowledgementsCompleted = getOutstandingChannelAcknowledgements(firmware).length === 0;
    } catch {
        channelAcknowledgementsCompleted = false;
    }
    return {
        configuration: { ...configuration },
        stepInfo: { current: currentStep, maxReachable: getMaxReachableStep() },
        manifestData: getManifestData(),
        // Diagnostics surfaces the freshness *verdict* (current/stale/unknown)
        // produced by the freshness check service, not the manifest-load
        // lifecycle ('loading'/'error'). The verdict is what the freshness
        // banner and install gate use, so support snapshots must match.
        manifestFreshness: manifestFreshnessState,
        currentFirmware: firmware,
        releaseMode: getReleaseMode(),
        firmwareIsRecommendedDefault,
        channelAcknowledgementsCompleted,
        postFlashSnapshot: postFlashService.getSnapshot(),
        firmwareStatusMessage: firmwareStatusMessage ? { ...firmwareStatusMessage } : null,
        configStringRequested: typeof window !== 'undefined' ? window.currentConfigString || null : null
    };
});



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
        return { status: 'verified', message: 'SHA-256 integrity check passed.' };
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

async function verifyFirmwarePart(part, { signatureB64 = '', keyId = '', mode = 'production' } = {}) {
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
        computedSignature: '',
        // Real Ed25519 (RFC 8032) verification result. The legacy salted-
        // SHA256 fields above remain for back-compat diagnostics; the
        // authenticity verdict that the install gate consumes lives here.
        ed25519: {
            attempted: false,
            ok: false,
            code: SIGNATURE_RESULT_CODES.MISSING_SIGNATURE,
            message: 'Ed25519 signature verification not yet attempted.',
            keyId: keyId || ''
        }
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

        // Run real cryptographic authenticity verification. This is the
        // only check that proves bytes were authorised by the holder of
        // a pinned private key — the SHA-256 / salted-hash checks above
        // only prove the bytes match the manifest, which a manifest-only
        // attacker can satisfy by editing both files together.
        if (signatureB64) {
            result.ed25519.attempted = true;
            const sigResult = await verifyFirmwareSignature(buffer, signatureB64, { keyId, mode });
            result.ed25519.ok = sigResult.ok === true;
            result.ed25519.code = sigResult.code;
            result.ed25519.message = sigResult.message;
            result.ed25519.keyId = sigResult.keyId || keyId || '';
            result.ed25519.keyStatus = sigResult.keyStatus;
        } else {
            result.ed25519.code = SIGNATURE_RESULT_CODES.MISSING_SIGNATURE;
            result.ed25519.message = 'Manifest entry has no signature_ed25519 field.';
        }

        // Authenticity verdict drives the overall part status. SHA-256 must
        // also pass — if the bytes don't match the manifest's hash, the
        // signature is moot (bytes might be tampered but happen to verify
        // against an unrelated signature).
        if (result.sha256Match && result.ed25519.ok) {
            result.status = 'verified';
            result.message = `Integrity (SHA-256) and authenticity (Ed25519, key '${result.ed25519.keyId}') verified.`;
        } else if (!result.sha256Match) {
            result.status = 'failed';
            result.message = `SHA-256 mismatch for ${targetName}; refusing to install.`;
        } else if (!result.ed25519.ok && signatureB64) {
            result.status = 'failed';
            result.message = `Authenticity check failed for ${targetName}: ${result.ed25519.message}`;
        } else if (!signatureB64) {
            // SHA-256 matched but no Ed25519 signature was supplied. The
            // static gate already blocked this for stable channels; this
            // branch only fires for non-stable builds in dev mode.
            result.status = 'failed';
            result.message = `${targetName} has no Ed25519 signature; cannot prove authenticity.`;
        } else {
            result.message = `Integrity check failed for ${targetName}.`;
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
        firmwareId: state.firmwareId || null,
        provenance: state.provenance || null,
        authenticity: state.authenticity || null
    };
}

async function verifyCurrentFirmwareIntegrity() {
    const firmware = window.currentFirmware;
    const token = ++firmwareVerificationToken;

    if (!firmware) {
        firmwareVerificationState = createEmptyVerificationState();
        renderSelectedFirmware();
        updateFirmwareControls();
        refreshPreflightDiagnostics();
        return;
    }

    // Run the static provenance gate before touching the network. If a stable
    // build is missing required metadata (sha256/signature/source_commit/etc.)
    // we refuse to even attempt the SHA-256 download so the install path stays
    // closed.
    const provenanceReport = validateFirmwareProvenance(firmware);
    window.latestFirmwareProvenance = provenanceReport;
    if (!provenanceReport.ok) {
        firmwareVerificationState = {
            status: 'failed',
            message: provenanceReport.summary || 'Firmware provenance validation failed.',
            parts: new Map(),
            firmwareId: firmware.firmwareId || null,
            provenance: provenanceReport
        };
        renderSelectedFirmware();
        updateFirmwareControls();
        refreshPreflightDiagnostics();
        return;
    }

    const parts = getFirmwarePartsMetadata(firmware);
    if (!parts.length) {
        firmwareVerificationState = {
            status: 'failed',
            message: 'No firmware files available for verification.',
            parts: new Map(),
            firmwareId: firmware.firmwareId || null,
            provenance: provenanceReport
        };
        renderSelectedFirmware();
        updateFirmwareControls();
        refreshPreflightDiagnostics();
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
            firmwareId: firmware.firmwareId || null,
            provenance: provenanceReport
        };
        renderSelectedFirmware();
        updateFirmwareControls();
        refreshPreflightDiagnostics();
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
        firmwareId: firmware.firmwareId || null,
        provenance: provenanceReport
    };
    renderSelectedFirmware();
    updateFirmwareControls();
    refreshPreflightDiagnostics();

    try {
        const sigInfo = extractSignatureFromBuild(firmware) || {};
        // The deployed wizard ALWAYS verifies in production mode — that
        // means signatures from test_only / dev keys are refused at the
        // install gate even when the named key id is on the trust list.
        // The mode is hard-coded here rather than read from a URL param
        // or runtime flag because relaxing it would let any reader of
        // the public repo install forged firmware on end-user devices.
        const installTrustMode = 'production';
        const results = await Promise.all(parts.map(part => verifyFirmwarePart(part, {
            signatureB64: sigInfo.signatureB64 || '',
            keyId: sigInfo.keyId || '',
            mode: installTrustMode
        })));
        if (token !== firmwareVerificationToken) {
            return;
        }

        const resultMap = new Map();
        let overallStatus = 'verified';
        let overallMessage = 'Firmware verified successfully.';
        // Authenticity rolls up across all parts: a single failed
        // signature blocks the whole install. We carry the worst result so
        // the merged provenance report shows it on the authenticity tier.
        let aggregatedSigResult = {
            ok: true,
            code: SIGNATURE_RESULT_CODES.VERIFIED,
            message: 'Firmware authenticity verified with pinned Sense360 production key.'
        };
        let aggregatedHash = { matches: true, message: '' };

        results.forEach(result => {
            const status = normaliseVerificationStatus(result.status);
            resultMap.set(result.resolvedUrl, {
                status,
                message: result.message || '',
                sha256Match: result.sha256Match,
                signatureMatch: result.signatureMatch,
                ed25519: result.ed25519 || null
            });

            if (status !== 'verified' && overallStatus === 'verified') {
                overallStatus = 'failed';
                overallMessage = result.message || 'Firmware verification failed.';
            }

            // Track the worst hash + signature result for the tiered UI.
            if (!result.sha256Match && aggregatedHash.matches) {
                aggregatedHash = {
                    matches: false,
                    message: result.message || `SHA-256 mismatch for ${result.fileName || 'firmware part'}.`
                };
            }
            const sig = result.ed25519 || {};
            if (aggregatedSigResult.ok && (!sig.ok || !sig.attempted)) {
                aggregatedSigResult = {
                    ok: false,
                    code: sig.code || SIGNATURE_RESULT_CODES.MISSING_SIGNATURE,
                    message: sig.message
                        || (sig.attempted
                            ? `Signature verification failed for ${result.fileName || 'firmware part'}.`
                            : 'No Ed25519 signature was supplied for this firmware part.'),
                    keyId: sig.keyId,
                    keyStatus: sig.keyStatus
                };
            }
        });

        // Merge the runtime results back into the provenance report so the
        // metadata / integrity / authenticity tiers all reflect what
        // actually happened rather than the static-only snapshot.
        let mergedProvenance = applySignatureVerificationResult(provenanceReport, aggregatedSigResult);
        mergedProvenance = applyHashVerificationResult(mergedProvenance, aggregatedHash);
        window.latestFirmwareProvenance = mergedProvenance;

        firmwareVerificationState = {
            status: overallStatus,
            message: overallMessage,
            parts: resultMap,
            firmwareId: firmware.firmwareId || null,
            provenance: mergedProvenance,
            // Top-level field that's easy to read for diagnostics: the
            // authenticity tier is what the install gate ultimately keys
            // off of.
            authenticity: mergedProvenance.tiers?.[TRUST_TIERS.AUTHENTICITY] || TIER_STATUSES.PENDING
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
            firmwareId: firmware.firmwareId || null,
            provenance: provenanceReport
        };
    } finally {
        if (token === firmwareVerificationToken) {
            renderSelectedFirmware();
            updateFirmwareControls();
            refreshPreflightDiagnostics();
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

function renderFirmwareProvenanceSection(firmware) {
    if (!firmware) {
        return '';
    }

    const { entries: rawEntries, report: staticReport } = describeVerificationChecks(firmware);
    if (!rawEntries.length) {
        return '';
    }

    // When the runtime layer has produced a merged report (post-download),
    // surface that one. Otherwise show the static gate's verdict — its
    // signature_verified check sits in 'pending' until the bytes are
    // hashed and verified.
    const mergedReport = (firmwareVerificationState
        && firmwareVerificationState.firmwareId === (firmware.firmwareId || null)
        && firmwareVerificationState.provenance
        && firmwareVerificationState.provenance.checks)
        ? firmwareVerificationState.provenance
        : null;
    const report = mergedReport || staticReport;
    const entries = mergedReport
        ? report.checks.map(check => ({
            key: check.id,
            id: check.id,
            label: check.label,
            ok: check.status === 'pass' || check.status === 'skip',
            pending: check.status === 'pending',
            status: check.status,
            severity: check.severity,
            detail: check.detail
        }))
        : rawEntries;

    const overallStatus = report.status;
    const overallLabel = overallStatus === 'pass'
        ? 'Provenance metadata verified'
        : overallStatus === 'warn'
            ? 'Provenance has warnings'
            : 'Provenance check failed';

    const sourceCommit = (firmware.source_commit || '').toString().trim();
    const sourceUrl = (firmware.source_url || '').toString().trim();
    const signedBy = (firmware.signed_by || '').toString().trim();
    const signatureKeyId = (firmware.signature_key_id || '').toString().trim();

    const iconForStatus = (status) => {
        if (status === 'pass') return '✓';
        if (status === 'warn') return '⚠';
        if (status === 'fail') return '✕';
        if (status === 'pending') return '…';
        return '–';
    };

    // Three-tier trust panel (metadata / integrity / authenticity).
    // Renders ABOVE the per-check list so the user reads the simplified
    // "what does this prove?" verdict before the long enumeration.
    const tiersHtml = (() => {
        const tiers = report.tiers;
        if (!tiers) {
            return '';
        }
        const tierMeta = [
            {
                key: TRUST_TIERS.METADATA,
                label: 'Manifest metadata',
                tooltip: 'Manifest entry carries the fields needed to even reason about provenance: SHA-256, signature, source commit, file size, build path.'
            },
            {
                key: TRUST_TIERS.INTEGRITY,
                label: 'Byte-level integrity',
                tooltip: 'Downloaded firmware bytes match the SHA-256 declared in the manifest. Proves the bytes are exactly what the manifest expected.'
            },
            {
                key: TRUST_TIERS.AUTHENTICITY,
                label: 'Cryptographic authenticity',
                tooltip: 'Downloaded firmware bytes verify against an Ed25519 signature whose public key is pinned in the WebFlash trust list. Proves the bytes were authorised by Sense360 (or whoever holds the pinned key) — the only check that defends against a manifest-tampering attacker.'
            }
        ];
        const tierItems = tierMeta.map(meta => {
            const status = tiers[meta.key] || 'pending';
            const detail = (tiers.details && tiers.details[meta.key]) || '';
            return `
                <li class="firmware-provenance__tier status-${escapeHtml(status)}" data-trust-tier="${escapeHtml(meta.key)}" data-trust-tier-status="${escapeHtml(status)}">
                    <span class="firmware-provenance__tier-icon" aria-hidden="true">${iconForStatus(status)}</span>
                    <div class="firmware-provenance__tier-body">
                        <span class="firmware-provenance__tier-label">${escapeHtml(meta.label)}</span>
                        <span class="firmware-provenance__tier-status">${escapeHtml(status)}</span>
                        <span class="firmware-provenance__tier-detail">${escapeHtml(detail || meta.tooltip)}</span>
                    </div>
                </li>
            `;
        }).join('');
        return `
            <ol class="firmware-provenance__tiers" data-firmware-provenance-tiers aria-label="Trust tiers">
                ${tierItems}
            </ol>
        `;
    })();

    const checksHtml = entries
        .map(entry => {
            // Map skip → status-info so consumers can style it as "not
            // applicable" rather than reading it as a passing check.
            const statusClass = entry.status === 'skip' ? 'info' : entry.status;
            return `
            <li class="firmware-provenance__check status-${escapeHtml(statusClass)}" data-check-id="${escapeHtml(entry.id || entry.key)}" data-check-status="${escapeHtml(entry.status)}">
                <span class="firmware-provenance__check-icon" aria-hidden="true">${iconForStatus(entry.status)}</span>
                <div class="firmware-provenance__check-body">
                    <span class="firmware-provenance__check-label">${escapeHtml(entry.label)}</span>
                    <span class="firmware-provenance__check-detail">${escapeHtml(entry.detail)}</span>
                </div>
            </li>
        `;
        })
        .join('');

    const factsHtml = (() => {
        const facts = [];
        if (sourceCommit) {
            const commitDisplay = sourceCommit.length > 12 ? `${sourceCommit.slice(0, 12)}…` : sourceCommit;
            const linkHtml = sourceUrl
                ? `<a class="firmware-provenance__commit-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(commitDisplay)}</code></a>`
                : `<code>${escapeHtml(commitDisplay)}</code>`;
            facts.push(`<div class="firmware-provenance__fact"><span class="firmware-provenance__fact-label">Source commit</span>${linkHtml}</div>`);
        }
        if (signedBy) {
            facts.push(`<div class="firmware-provenance__fact"><span class="firmware-provenance__fact-label">Signed by</span><span>${escapeHtml(signedBy)}</span></div>`);
        }
        if (signatureKeyId) {
            facts.push(`<div class="firmware-provenance__fact"><span class="firmware-provenance__fact-label">Signing key</span><code>${escapeHtml(signatureKeyId)}</code></div>`);
        }
        if (Number.isFinite(Number(firmware.file_size)) && Number(firmware.file_size) > 0) {
            const bytes = Number(firmware.file_size);
            const kb = bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
            facts.push(`<div class="firmware-provenance__fact"><span class="firmware-provenance__fact-label">File size</span><span>${escapeHtml(kb)}</span></div>`);
        }
        if (report.deprecated) {
            facts.push(`<div class="firmware-provenance__fact firmware-provenance__fact--warning"><span class="firmware-provenance__fact-label">Lifecycle</span><span>Deprecated</span></div>`);
        }
        return facts.length
            ? `<div class="firmware-provenance__facts">${facts.join('')}</div>`
            : '';
    })();

    const hasAdvancedDetails = Boolean(tiersHtml || factsHtml || checksHtml);
    const advancedHtml = hasAdvancedDetails
        ? `
            <details class="firmware-provenance__disclosure" data-firmware-provenance-disclosure>
                <summary class="firmware-provenance__summary-toggle">Show verification details</summary>
                <div class="firmware-provenance__body">
                    ${tiersHtml}
                    ${factsHtml}
                    <ul class="firmware-provenance__checks" data-firmware-provenance-checks>
                        ${checksHtml}
                    </ul>
                </div>
            </details>
        `
        : '';

    return `
        <section class="firmware-provenance" data-firmware-provenance="${escapeHtml(overallStatus)}" aria-label="Firmware verification status">
            <header class="firmware-provenance__header">
                <span class="firmware-provenance__badge status-${escapeHtml(overallStatus)}">${escapeHtml(overallLabel)}</span>
                <p class="firmware-provenance__summary">${escapeHtml(report.summary)}</p>
            </header>
            ${advancedHtml}
        </section>
    `;
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
                    ? 'SHA-256 integrity check passed.'
                    : partStatus === 'pending'
                        ? 'Integrity check pending…'
                        : partStatus === 'failed'
                            ? 'Integrity check failed.'
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

// Builds whose static provenance gate fails should never be auto-selected as
// the default. The install gate would block them anyway, but defaulting to a
// failing build is a confusing UX and risks normalising bad provenance state.
// Wraps `pickDefaultBuild` from release-channels with an extra provenance
// pre-filter so the safety filters compose: mode visibility → channel
// defaultSelectable → non-deprecated → non-failing-provenance.
function pickProvenanceSafeDefaultBuild(builds) {
    const releaseMode = getReleaseMode();
    if (!Array.isArray(builds) || builds.length === 0) {
        return null;
    }
    const safeBuilds = builds.filter(build => {
        try {
            return validateFirmwareProvenance(build).ok;
        } catch {
            return false;
        }
    });
    return pickDefaultBuild(safeBuilds, { mode: releaseMode });
}

function isFirmwareRecommendedDefault(firmware) {
    if (!firmware) {
        return false;
    }
    const candidate = pickProvenanceSafeDefaultBuild(firmwareOptions);
    return Boolean(candidate && candidate.firmwareId === firmware.firmwareId);
}

function renderFirmwareBadges(firmware, { recommended }) {
    const badges = getFirmwareBadges(firmware, { recommended });
    if (!badges.length) {
        return '';
    }
    return badges
        .map(badge => `<span
                class="firmware-channel-tag is-${escapeHtml(badge.key)} tone-${escapeHtml(badge.tone)}"
                data-firmware-badge="${escapeHtml(badge.key)}"
                title="${escapeHtml(badge.description || '')}"
            >${escapeHtml(badge.label)}</span>`)
        .join('');
}

function renderFirmwareWarningsBlock(firmware) {
    const warnings = getFirmwareWarnings(firmware);
    if (!warnings.length) {
        return '';
    }
    const items = warnings
        .map(warning => `
            <li class="firmware-channel-warning__item severity-${escapeHtml(warning.severity)}" data-warning-key="${escapeHtml(warning.key)}">
                <span class="firmware-channel-warning__icon" aria-hidden="true">!</span>
                <span class="firmware-channel-warning__message">${escapeHtml(warning.message)}</span>
            </li>
        `)
        .join('');
    return `
        <ul class="firmware-channel-warning" data-firmware-channel-warning>
            ${items}
        </ul>
    `;
}

// Build the "Signature metadata" row body for the firmware details panel.
// The wizard now performs real Ed25519 verification, so this row must
// reflect the actual verification state — not a static "we don't verify"
// disclaimer. Drives the copy from the merged provenance report when
// available, falling back to "metadata present, awaiting verification"
// when the verifier has not yet run.
function renderSignatureMetadataRowValue(firmware, { hasSignatureMetadata, signedBy }) {
    if (!hasSignatureMetadata) {
        return '<span class="firmware-details-panel__no">Missing from manifest entry.</span>';
    }
    const channel = normaliseReleaseChannel(firmware?.channel);
    const stable = channel === 'stable';

    const merged = (firmwareVerificationState
        && firmwareVerificationState.firmwareId === (firmware.firmwareId || null)
        && firmwareVerificationState.provenance
        && Array.isArray(firmwareVerificationState.provenance.checks))
        ? firmwareVerificationState.provenance
        : null;
    const verifiedCheck = merged
        ? merged.checks.find(c => c && c.id === 'signature_verified')
        : null;

    let copy;
    let toneClass;
    if (verifiedCheck && verifiedCheck.status === 'pass') {
        copy = userFacingAuthenticityCopy(SIGNATURE_RESULT_CODES.VERIFIED, { stable });
        toneClass = 'firmware-details-panel__yes';
    } else if (verifiedCheck && verifiedCheck.status === 'fail') {
        copy = userFacingAuthenticityCopy(verifiedCheck.verificationCode, { stable });
        toneClass = 'firmware-details-panel__no';
    } else if (verifiedCheck && verifiedCheck.status === 'warn') {
        copy = userFacingAuthenticityCopy(verifiedCheck.verificationCode, { stable });
        toneClass = 'firmware-details-panel__warn';
    } else {
        // Pending — verification has not yet run, or this firmware is not
        // the one currently being verified. Either way, do not claim
        // authenticity has passed.
        copy = userFacingAuthenticityCopy(null, { stable });
        toneClass = 'firmware-details-panel__pending';
    }

    const signedByHint = signedBy
        ? ` <span class="firmware-details-panel__hint">Signed by ${escapeHtml(signedBy)}.</span>`
        : '';
    const detailHint = copy.detail
        ? ` <span class="firmware-details-panel__hint">${escapeHtml(copy.detail)}</span>`
        : '';
    return `<span class="${toneClass}">${escapeHtml(copy.message)}</span>${signedByHint}${detailHint}`;
}

function renderFirmwareDetailsPanel(firmware, { recommended } = {}) {
    if (!firmware) {
        return '';
    }
    const policy = getChannelPolicy(firmware.channel);
    const channelKey = normaliseReleaseChannel(firmware.channel);
    const fileSize = Number(firmware.file_size);
    const sizeLabel = Number.isFinite(fileSize) && fileSize > 0
        ? (fileSize >= 1024 ? `${(fileSize / 1024).toFixed(1)} KB` : `${fileSize} B`)
        : '';
    const buildDate = firmware.build_date ? new Date(firmware.build_date) : null;
    const buildDateLabel = buildDate && !Number.isNaN(buildDate.getTime()) ? buildDate.toLocaleString() : '';
    const sourceCommit = (firmware.source_commit || '').toString().trim();
    const sourceUrl = (firmware.source_url || '').toString().trim();
    const knownIssues = Array.isArray(firmware.known_issues) ? firmware.known_issues : [];
    const changelog = Array.isArray(firmware.changelog) ? firmware.changelog : [];
    const rollbackSupported = firmware.rollback_supported === true;
    const configString = (firmware.config_string || '').toString().trim();
    const chipFamily = (firmware.chipFamily || '').toString().trim();
    const sha256 = (firmware.sha256 || '').toString().trim();
    const hasSignatureMetadata = typeof firmware.signature === 'string'
        && firmware.signature.trim().length > 0;
    const signedBy = (firmware.signed_by || '').toString().trim();
    const firmwareTarget = getFirmwareDisplayName(firmware, configString);
    const artifactType = (typeof firmware.artifact_type === 'string' && firmware.artifact_type.trim())
        ? firmware.artifact_type.trim()
        : '';
    const isRescueArtifact = artifactType === 'rescue';
    const firmwarePath = (() => {
        if (Array.isArray(firmware.parts)) {
            const part = firmware.parts.find(p => p && typeof p.path === 'string' && p.path.trim());
            if (part) {
                return part.path.trim();
            }
        }
        if (typeof firmware.path === 'string' && firmware.path.trim()) {
            return firmware.path.trim();
        }
        return '';
    })();

    let provenanceSummary = null;
    try {
        const { entries, report } = describeVerificationChecks(firmware);
        const counts = entries.reduce((acc, entry) => {
            const key = entry.status || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        provenanceSummary = { counts, status: report.status, summary: report.summary };
    } catch {
        provenanceSummary = null;
    }

    // Recap the channel/recommended/deprecated badges inside the panel so the
    // user can inspect everything in one place. We append a Recovery badge
    // when artifact_type === 'rescue' and the channel badge isn't already
    // surfacing 'Recovery' (avoids duplication on the rescue channel).
    const panelBadges = getFirmwareBadges(firmware, { recommended }).map(badge => ({ ...badge }));
    if (isRescueArtifact && !panelBadges.some(badge => badge.key === 'rescue')) {
        panelBadges.push({
            key: 'rescue',
            label: 'Recovery',
            tone: 'danger',
            description: 'Recovery / rollback firmware artifact.'
        });
    }
    const badgesHtml = panelBadges.length
        ? `
            <div class="firmware-details-panel__badges" data-firmware-details-badges>
                ${panelBadges.map(badge => `
                    <span
                        class="firmware-channel-tag is-${escapeHtml(badge.key)} tone-${escapeHtml(badge.tone)}"
                        data-firmware-panel-badge="${escapeHtml(badge.key)}"
                        title="${escapeHtml(badge.description || '')}"
                    >${escapeHtml(badge.label)}</span>
                `).join('')}
            </div>
        `
        : '';

    const factRow = (label, value) => ({ label, value });

    const identityRows = [];
    identityRows.push(factRow(
        'Firmware target',
        `<code class="firmware-details-panel__code">${escapeHtml(firmwareTarget)}</code>`
    ));
    if (firmwarePath) {
        identityRows.push(factRow(
            'Firmware path',
            `<code class="firmware-details-panel__code">${escapeHtml(firmwarePath)}</code>`
        ));
    }
    if (firmware.version) {
        identityRows.push(factRow('Version', escapeHtml(`v${firmware.version}`)));
    }
    identityRows.push(factRow(
        'Channel',
        `<span class="firmware-details-panel__channel tone-${escapeHtml(policy.tone)}">${escapeHtml(policy.label)}</span>`
    ));
    identityRows.push(factRow(
        'Recommended',
        recommended
            ? '<span class="firmware-details-panel__yes">Yes — default for this configuration</span>'
            : '<span class="firmware-details-panel__no">No</span>'
    ));
    identityRows.push(factRow(
        'Lifecycle',
        firmware.deprecated === true
            ? `<span class="firmware-details-panel__deprecated">Deprecated${firmware.deprecation_reason ? ` — ${escapeHtml(firmware.deprecation_reason)}` : ''}</span>`
            : '<span class="firmware-details-panel__active">Active</span>'
    ));
    if (buildDateLabel) {
        identityRows.push(factRow('Build date', escapeHtml(buildDateLabel)));
    }
    if (sourceCommit) {
        const display = sourceCommit.length > 12 ? `${sourceCommit.slice(0, 12)}…` : sourceCommit;
        identityRows.push(factRow(
            'Source commit',
            sourceUrl
                ? `<a class="firmware-details-panel__link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(display)}</code></a>`
                : `<code>${escapeHtml(display)}</code>`
        ));
    }
    if (sourceUrl && !sourceCommit) {
        identityRows.push(factRow(
            'Source',
            `<a class="firmware-details-panel__link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a>`
        ));
    }
    identityRows.push(factRow(
        'Rollback',
        rollbackSupported
            ? '<span class="firmware-details-panel__yes">Supported via Recovery firmware</span>'
            : '<span class="firmware-details-panel__no">Use Recovery firmware to roll back</span>'
    ));

    const compatibilityRows = [];
    if (configString) {
        compatibilityRows.push(factRow(
            'Configuration profile',
            `<code class="firmware-details-panel__code">${escapeHtml(configString)}</code>`
        ));
    }
    if (chipFamily) {
        compatibilityRows.push(factRow('Chip family', escapeHtml(chipFamily)));
    }
    if (artifactType) {
        compatibilityRows.push(factRow('Artifact type', escapeHtml(artifactType)));
    }

    const integrityRows = [];
    integrityRows.push(factRow(
        'SHA-256',
        sha256
            ? `<code class="firmware-details-panel__code firmware-details-panel__hash" title="${escapeHtml(sha256)}">${escapeHtml(sha256.length > 24 ? `${sha256.slice(0, 12)}…${sha256.slice(-8)}` : sha256)}</code> <span class="firmware-details-panel__hint">Metadata present in manifest. Browser hashes the downloaded binary and compares against this value before flashing.</span>`
            : '<span class="firmware-details-panel__no">Metadata missing from manifest entry.</span>'
    ));
    integrityRows.push(factRow(
        'Signature metadata',
        renderSignatureMetadataRowValue(firmware, { hasSignatureMetadata, signedBy })
    ));
    if (sizeLabel) {
        integrityRows.push(factRow('File size', escapeHtml(sizeLabel)));
    }

    const verificationRows = [];
    if (provenanceSummary) {
        const counts = provenanceSummary.counts || {};
        const tallyParts = [];
        if (counts.pass) tallyParts.push(`${counts.pass} pass`);
        if (counts.warn) tallyParts.push(`${counts.warn} warn`);
        if (counts.fail) tallyParts.push(`${counts.fail} fail`);
        if (counts.skip) tallyParts.push(`${counts.skip} not applicable`);
        const tallyText = tallyParts.join(' · ') || '—';
        const summaryText = provenanceSummary.summary || '';
        verificationRows.push(factRow(
            'Verification checks',
            `<span class="firmware-details-panel__verification status-${escapeHtml(provenanceSummary.status)}">${escapeHtml(tallyText)}</span>${summaryText ? ` <span class="firmware-details-panel__hint">${escapeHtml(summaryText)}</span>` : ''}`
        ));
    }

    const renderRows = rows => rows.map(row => `
        <div class="firmware-details-panel__row">
            <dt class="firmware-details-panel__label">${escapeHtml(row.label)}</dt>
            <dd class="firmware-details-panel__value">${row.value}</dd>
        </div>
    `).join('');

    const groups = [
        { key: 'identity', title: 'Identity', rows: identityRows },
        { key: 'compatibility', title: 'Compatibility', rows: compatibilityRows },
        { key: 'integrity', title: 'Integrity metadata', rows: integrityRows },
        { key: 'verification', title: 'Verification summary', rows: verificationRows }
    ];

    const groupsHtml = groups
        .filter(group => group.rows.length > 0)
        .map(group => `
            <section class="firmware-details-panel__group" data-firmware-details-group="${escapeHtml(group.key)}">
                <h4 class="firmware-details-panel__group-title">${escapeHtml(group.title)}</h4>
                <dl class="firmware-details-panel__facts">${renderRows(group.rows)}</dl>
            </section>
        `).join('');

    const knownIssuesHtml = knownIssues.length
        ? `
            <section class="firmware-details-panel__section firmware-details-panel__section--issues">
                <h4>Known issues</h4>
                <ul>${knownIssues.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </section>
        `
        : '';

    const changelogHtml = changelog.length
        ? `
            <section class="firmware-details-panel__section firmware-details-panel__section--changelog">
                <h4>Changelog</h4>
                <ul>${changelog.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </section>
        `
        : '';

    return `
        <section
            class="firmware-details-panel tone-${escapeHtml(policy.tone)}"
            data-firmware-details-panel
            data-firmware-channel="${escapeHtml(channelKey)}"
            aria-label="Firmware details"
        >
            <details class="firmware-details-panel__disclosure" data-firmware-details-disclosure>
                <summary class="firmware-details-panel__summary">
                    <span class="firmware-details-panel__title">Firmware details</span>
                    <span class="firmware-details-panel__summary-hint">Show technical metadata</span>
                </summary>
                <div class="firmware-details-panel__body">
                    <p class="firmware-details-panel__description">${escapeHtml(policy.description)}</p>
                    ${badgesHtml}
                    <div class="firmware-details-panel__groups">${groupsHtml}</div>
                    ${knownIssuesHtml}
                    ${changelogHtml}
                </div>
            </details>
        </section>
    `;
}

function createFirmwareCardHtml(firmware, { configString = '', contextKey = 'primary', cardClassName = 'firmware-card' } = {}) {
    if (!firmware) {
        return '';
    }

    const metadataSections = [
        { key: 'features', title: 'Key Features', collapsible: false },
        { key: 'hardware_requirements', title: 'Hardware Requirements', collapsible: true }
    ];

    const metadataHtml = metadataSections
        .map(({ key, title, collapsible }) => {
            const items = firmware[key];
            if (!Array.isArray(items) || items.length === 0) {
                return '';
            }

            const listItems = items
                .map(item => `<li>${escapeHtml(item)}</li>`)
                .join('');

            const sectionClass = `firmware-meta-section firmware-${key.replace(/_/g, '-')}`;

            if (collapsible) {
                return `
                    <section class="${sectionClass}">
                        <details class="firmware-meta-section__disclosure" data-firmware-meta-disclosure="${escapeHtml(key)}">
                            <summary class="firmware-meta-section__summary"><h4>${escapeHtml(title)}</h4></summary>
                            <ul>${listItems}</ul>
                        </details>
                    </section>
                `;
            }

            return `
                <section class="${sectionClass}">
                    <h4>${escapeHtml(title)}</h4>
                    <ul>${listItems}</ul>
                </section>
            `;
        })
        .filter(Boolean)
        .join('');

    const channelInfo = getChannelDisplayInfo(firmware.channel);
    const policy = getChannelPolicy(firmware.channel);
    const recommended = isFirmwareRecommendedDefault(firmware);
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
    const provenanceSectionHtml = renderFirmwareProvenanceSection(firmware);
    const detailsPanelHtml = renderFirmwareDetailsPanel(firmware, { recommended });
    const warningsHtml = renderFirmwareWarningsBlock(firmware);
    const badgeHtml = renderFirmwareBadges(firmware, { recommended });

    const descriptionHtml = firmware.description
        ? `<p class="firmware-description">${escapeHtml(firmware.description)}</p>`
        : '';

    const manifestIndex = escapeHtml(String(firmware.manifestIndex));

    // Surface the canonical release-channel taxonomy on the card so the DOM
    // reflects the hardened mapping (e.g. unknown → 'unknown', rc → 'beta',
    // recovery → 'rescue'). The legacy `channelInfo.key` is still used
    // internally for release-notes lookup but it can silently treat unknown
    // channels as stable, which is exactly what the hardened gate forbids
    // surfacing to the UI.
    const canonicalChannelKey = normaliseReleaseChannel(firmware.channel);

    return `
        <div class="${cardClassName}" data-firmware-detail data-firmware-id="${escapeHtml(firmware.firmwareId)}" data-channel="${escapeHtml(canonicalChannelKey)}" data-recommended="${recommended ? 'true' : 'false'}" data-deprecated="${firmware.deprecated === true ? 'true' : 'false'}">
            <div class="firmware-item">
                <div class="firmware-info">
                    <p class="ready-helper" data-ready-helper role="status" aria-live="polite"></p>
                    <div class="firmware-header">
                        <div class="firmware-name">${escapeHtml(firmwareName)}</div>
                        <div class="firmware-badges" data-firmware-badges>${badgeHtml}</div>
                    </div>
                    <div class="firmware-details">
                        ${metaParts.join('')}
                    </div>
                    ${descriptionHtml}
                    ${warningsHtml}
                </div>
                <div class="firmware-actions">
                    <esp-web-install-button manifest="firmware-${manifestIndex}.json" data-firmware-id="${escapeHtml(firmware.firmwareId)}" data-webflash-install>
                        <button slot="activate" class="btn btn-primary" data-firmware-id="${escapeHtml(firmware.firmwareId)}">
                            Install Firmware
                        </button>
                        <span slot="unsupported">
                            <span class="esp-web-tools-unsupported">
                                Web Serial requires <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Opera</strong> on desktop.
                                <a href="https://developer.mozilla.org/docs/Web/API/Web_Serial_API" target="_blank" rel="noopener noreferrer">Learn more</a>
                            </span>
                        </span>
                        <span slot="not-allowed">
                            <span class="esp-web-tools-not-allowed">
                                Web flashing requires a <strong>secure context (HTTPS)</strong>.
                                Please access this page via HTTPS.
                            </span>
                        </span>
                    </esp-web-install-button>
                </div>
            </div>
            ${detailsPanelHtml}
            ${provenanceSectionHtml}
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
    } else {
        // The manifest set may have shifted under the user (e.g. a hardware
        // toggle in step 4 swapped which beta/preview build is offered). Drop
        // any acknowledgement that is no longer bound to the live selection's
        // identity so consent for the previous build cannot satisfy the gate
        // for whatever is now in `window.currentFirmware`.
        if (pruneStaleChannelAcknowledgements()) {
            renderChannelAcknowledgementPanel();
        }
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

    const recommendedDefault = pickProvenanceSafeDefaultBuild(firmwareOptions);
    firmwareOptions.forEach(build => {
        const option = document.createElement('option');
        const policy = getChannelPolicy(build.channel);
        const versionLabel = build.version ? `v${build.version}` : 'Unknown version';
        const deprecatedSuffix = build.deprecated === true ? ' · Deprecated' : '';
        const recommendedSuffix = recommendedDefault && build.firmwareId === recommendedDefault.firmwareId
            ? ' · Recommended'
            : '';
        option.value = build.firmwareId;
        option.textContent = `${versionLabel} · ${policy.label}${deprecatedSuffix}${recommendedSuffix}`;
        option.dataset.channel = policy.key;
        if (build.deprecated === true) {
            option.dataset.deprecated = 'true';
        }
        if (recommendedSuffix) {
            option.dataset.recommended = 'true';
        }
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

    // WF-UX-002: when no build matches, surface the canonical no-build
    // readiness headline next to the heading so the user does not see a
    // blank "Compatible Firmware" label paired with the not-available card
    // below. Stable / preview / rescue paths fall through to selectionText
    // above and never reach the no-build branch.
    const readinessText = !selectionText && firmwareStatusMessage?.type === 'not-available'
        ? FIRMWARE_READINESS_COPY['no-build'].headline
        : '';

    const headingHasContent = Boolean(selectionText || readinessText);

    const labelText = defaultCompatibleFirmwareHeadingLabel || 'Compatible Firmware';
    if (compatibleFirmwareHeadingLabel) {
        compatibleFirmwareHeadingLabel.textContent = headingHasContent ? `${labelText}:` : labelText;
    }

    if (selectionText) {
        compatibleFirmwareHeadingSelection.textContent = selectionText;
        compatibleFirmwareHeadingSelection.removeAttribute('data-readiness');
    } else if (readinessText) {
        compatibleFirmwareHeadingSelection.textContent = readinessText;
        compatibleFirmwareHeadingSelection.setAttribute('data-readiness', 'no-build');
    } else {
        compatibleFirmwareHeadingSelection.textContent = '';
        compatibleFirmwareHeadingSelection.removeAttribute('data-readiness');
    }
}

function setFirmwareStatusMessageForTests(message) {
    firmwareStatusMessage = message;
}

function getFirmwareStatusMessageForTests() {
    return firmwareStatusMessage ? { ...firmwareStatusMessage } : null;
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

    try {
        postFlashService.captureSelectedBuild(firmware);
    } catch { /* defensive */ }

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

    // Default selection rules (composed of safety filters in order):
    //   1. Mode visibility — strip dev/rescue tiers in normal mode.
    //   2. defaultSelectable channel — stable only.
    //   3. Non-deprecated — deprecated stays user-selectable but never auto-picked.
    //   4. Non-failing provenance — never auto-pick a build whose static gate
    //      already failed; the install gate would block it anyway and
    //      defaulting to it implies trust we cannot assert.
    // If every build is filtered out, we fall back to the first non-deprecated
    // build, then to the first build of any kind, so the dropdown is never
    // left empty. The user keeps the choice, but they have to make it
    // explicitly and the install gate still blocks bad provenance / channel
    // acknowledgements.
    const channelDefault = pickProvenanceSafeDefaultBuild(firmwareOptions);
    if (channelDefault) {
        selectFirmwareById(channelDefault.firmwareId);
        return;
    }
    const eligible = pickDefaultEligibleBuilds(firmwareOptions);
    const target = eligible.length ? eligible[0] : firmwareOptions[0];
    selectFirmwareById(target.firmwareId);
}

function renderChannelAcknowledgementPanel() {
    const panel = document.querySelector('[data-channel-acknowledgement-panel]');
    if (!panel) {
        return;
    }
    const firmware = window.currentFirmware;
    // Drop any acks bound to a previous firmware identity before we paint —
    // otherwise the panel could render a stale "checked" tick that no longer
    // satisfies the gate.
    pruneStaleChannelAcknowledgements(firmware);
    const acknowledgements = getChannelAcknowledgements(firmware);
    if (!firmware || acknowledgements.length === 0) {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML = '';
        return;
    }

    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');

    const heading = '<h3 class="channel-acknowledgement-panel__title">Acknowledgement required</h3>';
    const intro = '<p class="channel-acknowledgement-panel__intro">Confirm you have read the warnings above before installing this firmware.</p>';
    const items = acknowledgements
        .map(item => {
            const checked = isChannelAcknowledged(item.key, firmware) ? 'checked' : '';
            return `
                <label class="channel-acknowledgement-panel__item">
                    <input
                        type="checkbox"
                        data-channel-acknowledgement-input
                        data-acknowledgement-key="${escapeHtml(item.key)}"
                        ${checked}
                    >
                    <span>${escapeHtml(item.label)}</span>
                </label>
            `;
        })
        .join('');
    panel.innerHTML = `${heading}${intro}<div class="channel-acknowledgement-panel__items">${items}</div>`;
}

function bindChannelAcknowledgementPanel() {
    const panel = document.querySelector('[data-channel-acknowledgement-panel]');
    if (!panel || panel.dataset.bound === 'true') {
        return;
    }
    panel.dataset.bound = 'true';
    panel.addEventListener('change', event => {
        const target = event.target;
        if (!target || !target.matches('[data-channel-acknowledgement-input]')) {
            return;
        }
        const key = target.dataset.acknowledgementKey;
        if (!key) {
            return;
        }
        setChannelAcknowledgement(key, Boolean(target.checked));
    });
}

function renderFirmwareNotAvailable(status) {
    const configString = status?.configString || '';
    const sanitizedConfig = escapeHtml(configString);
    const expectedFilename = status?.expectedFilename || `Sense360-${configString}-v1.0.0-stable.bin`;
    const sanitizedFilename = escapeHtml(expectedFilename);
    const nearby = Array.isArray(status?.nearbyConfigStrings) ? status.nearbyConfigStrings : [];
    const highlights = Array.isArray(status?.mismatchHighlights) ? status.mismatchHighlights : [];
    const selectedHardware = Array.isArray(status?.selectedHardware) ? status.selectedHardware : [];
    const mode = status?.configurationMode === 'kit' ? 'kit' : 'manual';

    const selectedHardwareHtml = selectedHardware.length
        ? `<ul class="firmware-not-available__hardware-list">${selectedHardware
            .map(item => `<li><span class="firmware-not-available__hardware-label">${escapeHtml(item.label)}:</span> <span class="firmware-not-available__hardware-value">${escapeHtml(item.value)}</span></li>`)
            .join('')}</ul>`
        : '<p class="firmware-not-available__hardware-empty">No additional hardware selected.</p>';

    const highlightsHtml = highlights.length
        ? `
            <p class="firmware-not-available__check">Check that your selected modules are correct, especially:</p>
            <ul class="firmware-not-available__highlights">${highlights
                .map(item => `<li>${escapeHtml(item.label)}</li>`)
                .join('')}</ul>
        `
        : '';

    const nearbyHtml = nearby.length
        ? `
            <h5 class="firmware-not-available__section-heading">Nearby available firmware</h5>
            <ul class="firmware-not-available__nearby" data-firmware-not-available-nearby>${nearby
                .map(value => `<li><code>${escapeHtml(value)}</code></li>`)
                .join('')}</ul>
            <p class="firmware-not-available__nearby-note">These are nearby published builds, not recommended replacements. Only flash one if it actually matches your hardware.</p>
        `
        : '<p class="firmware-not-available__nearby-empty" data-firmware-not-available-nearby-empty>No nearby firmware builds are currently published for this mounting and power option.</p>';

    let nextSteps;
    if (nearby.length) {
        nextSteps = 'If one of these matches your actual hardware, go back and adjust your selections. Otherwise contact support.';
    } else {
        nextSteps = 'No nearby firmware builds are currently published. Contact support or publish firmware for this configuration.';
    }
    if (mode === 'kit') {
        nextSteps += ' Check that you selected the correct kit or SKU from your order.';
    } else {
        nextSteps += ' Go back and confirm each installed module.';
    }

    return `
        <div class="firmware-not-available" role="alert" data-firmware-not-available data-firmware-not-available-mode="${escapeHtml(mode)}">
            <h4>${escapeHtml(FIRMWARE_READINESS_COPY['no-build'].headline)}</h4>
            <p class="firmware-not-available__lead">This exact combination has not been published yet.</p>

            <h5 class="firmware-not-available__section-heading">Selected configuration</h5>
            <p class="config-string" data-firmware-not-available-config>${sanitizedConfig}</p>

            <h5 class="firmware-not-available__section-heading">Selected hardware</h5>
            <div data-firmware-not-available-hardware>${selectedHardwareHtml}</div>

            ${highlightsHtml}

            ${nearbyHtml}

            <details class="firmware-not-available__details">
                <summary>Technical details</summary>
                <p class="firmware-not-available__filename-label">Expected firmware:</p>
                <p class="config-string" data-firmware-not-available-filename>${sanitizedFilename}</p>
            </details>

            <p class="firmware-not-available__next-steps" data-firmware-not-available-next-steps>${escapeHtml(nextSteps)}</p>

            <div class="firmware-not-available__actions">
                <button
                    type="button"
                    class="firmware-not-available__support-button"
                    data-copy-support-bundle
                    data-firmware-not-available-support
                >Copy support bundle</button>
                <span class="firmware-not-available__support-hint">Includes the missing-firmware diagnostics so support can help faster.</span>
            </div>
        </div>
    `;
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
        sections.push(renderFirmwareNotAvailable(firmwareStatusMessage));
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
    renderChannelAcknowledgementPanel();
    bindChannelAcknowledgementPanel();
    updateCompatibleFirmwareHeading();
}

function attachInstallButtonListeners() {
    const installHosts = document.querySelectorAll('esp-web-install-button[data-webflash-install]');

    installHosts.forEach(host => {
        const activateButton = host.querySelector('button[slot="activate"]');

        if (activateButton && activateButton.dataset.installBound !== 'true') {
            activateButton.addEventListener('click', event => {
                const policy = evaluatePreflightPolicy(window.latestPreflightChecks || []);
                const outstandingAcks = getOutstandingChannelAcknowledgements(window.currentFirmware);
                const freshness = evaluateFreshnessGate();
                if (!policy.canInstall || outstandingAcks.length > 0 || !freshness.ok) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const detailHelper = document.querySelector('#compatible-firmware [data-ready-helper]');
                    const primaryHelper = document.querySelector('.secondary-action-group [data-ready-helper]');
                    let message;
                    if (outstandingAcks.length > 0) {
                        message = 'Acknowledge the firmware-channel warning before installing.';
                    } else if (!policy.canInstall) {
                        message = policy.blockingReasons[0] || 'Resolve preflight checks before installing.';
                    } else {
                        message = freshness.blockingReason || 'Resolve preflight checks before installing.';
                    }
                    [detailHelper, primaryHelper].filter(Boolean).forEach(helper => {
                        helper.textContent = message;
                        helper.classList.add('is-visible', 'is-error');
                        helper.classList.remove('is-warning');
                    });
                    // Re-render install controls so the disabled/title state
                    // catches up with the freshness change that just blocked
                    // this click (covers the "freshness went stale between
                    // render and click" case).
                    if (!freshness.ok) {
                        try {
                            updateFirmwareControls();
                        } catch (error) {
                            // DOM may not be in a re-renderable state; the
                            // helper-text update above is the user-facing
                            // signal we care about.
                        }
                    }
                    return;
                }
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
        const policy = evaluatePreflightPolicy(window.latestPreflightChecks || []);
        const freshness = evaluateFreshnessGate();
        if (!policy.canInstall
            || getOutstandingChannelAcknowledgements(window.currentFirmware).length > 0
            || !freshness.ok) {
            updateFirmwareControls();
            return;
        }
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
    const configString = buildFirmwareTargetPreviewString(configuration);

    window.currentConfigString = configString;

    // Load manifest to check if firmware exists
    try {
        await loadManifestData();

        // Apply release-mode visibility before grouping. In normal mode this
        // strips development + rescue builds from every config bucket so they
        // never appear in the install path. Recovery / development modes
        // re-reveal the relevant tier; the user opted in via ?mode=… on the URL.
        const releaseMode = getReleaseMode();
        const visibleBuilds = filterBuildsForMode(manifestBuildsWithIndex, releaseMode);
        const { configGroups, modelBuckets } = groupBuildsByConfig(visibleBuilds);
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
                return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'airiq' });
            });

            bucketMap.set(model, entries);
        });

        if (sortedBuilds.length) {
            firmwareStatusMessage = null;
            setFirmwareOptions(sortedBuilds, configString, bucketMap);
            selectDefaultFirmware();
        } else {
            firmwareStatusMessage = buildNotAvailableStatusMessage(configString, visibleBuilds);
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

function buildNotAvailableStatusMessage(configString, availableBuilds) {
    const expectedFilename = `Sense360-${configString}-v1.0.0-stable.bin`;
    const availableConfigStrings = Array.from(new Set(
        (availableBuilds || [])
            .map(build => build && typeof build.config_string === 'string' ? build.config_string : null)
            .filter(value => Boolean(value) && value !== configString)
    ));
    const nearbyConfigStrings = findNearbyConfigStrings(configString, availableConfigStrings, { limit: 3 });
    const mismatchHighlights = getMismatchHighlights(configString, nearbyConfigStrings);
    const selectedHardware = describeSelectedHardware();
    const configurationMode = getConfigurationModeForDiagnostics();
    return {
        type: 'not-available',
        configString,
        expectedFilename,
        nearbyConfigStrings,
        mismatchHighlights,
        selectedHardware,
        configurationMode
    };
}

function describeSelectedHardware() {
    const items = [];
    if (configuration.mounting) {
        const label = MOUNT_LABELS[configuration.mounting] || configuration.mounting;
        items.push({ key: 'mounting', label: 'Mounting', value: label });
    }
    if (configuration.power) {
        const label = POWER_LABELS[configuration.power] || configuration.power.toUpperCase();
        items.push({ key: 'power', label: 'Power', value: label });
    }
    if (configuration.bathroom === true) {
        items.push({ key: 'bathroom', label: 'Bathroom', value: 'Yes' });
    }
    MODULE_KEYS.forEach(moduleKey => {
        const value = configuration[moduleKey];
        if (!value || value === 'none') {
            return;
        }
        const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;
        const variantLabel = MODULE_VARIANT_LABELS[moduleKey]?.[value] || value;
        items.push({ key: moduleKey, label: moduleLabel, value: variantLabel });
    });
    return items;
}

function getConfigurationModeForDiagnostics() {
    try {
        const modePicker = typeof document !== 'undefined'
            ? document.querySelector('[data-config-mode-picker] [data-mode-input]:checked')
            : null;
        const value = modePicker?.value;
        if (value === 'kit' || value === 'manual') {
            return value;
        }
    } catch {
        /* defensive */
    }
    const sku = getSelectedKitSkuForDiagnostics();
    return sku ? 'kit' : 'manual';
}

function getSelectedKitSkuForDiagnostics() {
    try {
        const select = typeof document !== 'undefined'
            ? document.querySelector('[data-kit-select]')
            : null;
        const value = select?.value;
        if (typeof value === 'string' && value.trim()) {
            return value.trim().toUpperCase();
        }
    } catch {
        /* defensive */
    }
    return null;
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
    const fileNameWithChannel = `${prefix}${channelSuffix}.md`;

    if (releaseNotesChannel === 'stable') {
        return `${directory}${fileNameWithChannel}`;
    }

    return `firmware/previews/${fileNameWithChannel}`;
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
    // [data-copy-diagnostics] and [data-copy-support-bundle] are handled by
    // initSupportBundleActions() in scripts/services/diagnostics.js.

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
    setReleaseModeFromUrl(searchParams);
    const parsed = parseConfigParams(searchParams);
    const sanitizedConfig = mapToWizardConfiguration(parsed.sanitizedConfig);

    if (searchParams.has('bathroom')) {
        const bathroomRaw = (searchParams.get('bathroom') || '').trim().toLowerCase();
        sanitizedConfig.bathroom = bathroomRaw === 'true' || bathroomRaw === '1';
    }

    if (searchParams.has('ventiq')) {
        const ventiqRaw = (searchParams.get('ventiq') || '').trim().toLowerCase();
        sanitizedConfig.ventiq = allowedOptions.ventiq.includes(ventiqRaw) ? ventiqRaw : 'none';
    }

    // Ceiling is currently the only supported mounting (see CLAUDE.md), so
    // pre-select it on first load when no URL value was provided. This lets
    // Step 1 act as a "Get started / quick-start preset" landing screen
    // instead of forcing users through a one-option radio.
    if (!sanitizedConfig.mounting) {
        sanitizedConfig.mounting = 'ceiling';
    }

    applyConfiguration(sanitizedConfig);

    if (Array.isArray(parsed.notices) && parsed.notices.length) {
        parsed.notices.forEach(notice => {
            if (notice?.message) {
                showToast(notice.message);
            }
        });
    }

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

    // A fresh visit has no manual-config URL markers (mount/power/module
    // keys). The kit-mode flow uses its own URL namespace (configmode, sku)
    // and stays on Step 1 until the user clicks "Continue", so links carrying
    // only those params should also land on Step 1: Get started.
    const hasManualConfigMarkers = parsed.presentKeys && parsed.presentKeys.size > 0;

    if (parsedStep) {
        targetStep = Math.min(parsedStep, maxStep);
    } else if (!hasManualConfigMarkers) {
        targetStep = 1;
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
    Object.assign(configuration, defaultConfiguration, enforceAirIQVentIQExclusivity({ ...initialConfig }));

    if (configuration.mounting !== 'ceiling') {
        configuration.ventiq = 'none';
    }

    configuration.voice = 'none';

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
        setStepNextButtonDisabled('#step-3', true);
    }

    ['roomiq', 'airiq', 'ventiq', 'fan', 'voice'].forEach(key => {
        const value = configuration[key];
        const input = document.querySelector(`input[name="${key}"][value="${value}"]`);
        if (input) {
            input.checked = true;
        }
    });

    const bathroomCheckbox = document.querySelector('input[name="bathroom"]');
    if (bathroomCheckbox) {
        bathroomCheckbox.checked = configuration.mounting === 'ceiling' && configuration.bathroom === true;
    }

    updateFanModuleVisibility();
    updateBathroomVisibility();
    updateConfiguration({ skipUrlUpdate: true });
    updateProgressSteps(getStep());
    updateModuleGroupSummaries();
}

function getMaxReachableStep() {
    if (!configuration.mounting) {
        return 2;
    }

    if (!configuration.power) {
        return 3;
    }

    return 5;
}

function updateUrlFromConfiguration() {
    const params = new URLSearchParams();

    if (configuration.mounting) {
        params.set('mount', configuration.mounting);
    }

    if (configuration.power) {
        params.set('power', configuration.power);
    }

    params.set('voice', configuration.voice || 'none');
    params.set('led', configuration.led || 'none');
    params.set('roomiq', configuration.roomiq || 'none');
    params.set('airiq', configuration.airiq || 'none');

    params.set('fan', configuration.fan || 'none');

    if (configuration.mounting === 'ceiling') {
        params.set('bathroom', configuration.bathroom ? 'true' : 'false');
        if (configuration.bathroom) {
            params.set('ventiq', configuration.ventiq || 'none');
        }
    }

    params.set('step', String(currentStep));

    // Preserve the kit/SKU URL state set by scripts/kit-mode.js so a fresh
    // setState() (e.g. when navigating between steps) doesn't strip the kit
    // share-link params. Manual mode never writes these, so this is a no-op
    // there.
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const existing = new URLSearchParams(window.location.search);
            ['configmode', 'sku'].forEach(key => {
                const value = existing.get(key);
                if (value !== null && value !== undefined && value !== '') {
                    params.set(key, value);
                }
            });
        }
    } catch (_error) {
        // ignore — preserving these params is best-effort.
    }

    // Preserve the release mode opt-in (?mode=recovery / ?mode=development) so
    // it survives same-session navigation. We re-emit the canonical, validated
    // value from getReleaseMode() rather than passing through the raw URL
    // param, which means an invalid `mode=foo` is silently dropped on the
    // first navigation. Channel acknowledgements are intentionally NOT
    // preserved — the user must re-consent on every fresh load.
    const activeMode = getReleaseMode();
    if (activeMode && activeMode !== 'normal') {
        params.set('mode', activeMode);
    }

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

// Other modules (e.g. the preflight setup-help modal) signal that the user
// has interacted with the device by dispatching this event on window. Keep
// the coupling loose so callers don't need to import state.js directly.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('webflash:connection-attempted', () => {
        markPreflightConnectionAttempted();
    });
}

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
    getFirmwareStatusMessage: getFirmwareStatusMessageForTests,
    buildNotAvailableStatusMessage,
    describeSelectedHardware,
    updateFirmwareControls,
    attachInstallButtonListeners,
    setPreFlashAcknowledgement,
    setPreflightWarningsAcknowledgement,
    evaluatePreflightPolicy,
    derivePreflightVerdict,
    evaluateFreshnessGate,
    updateConnectionQualityMetrics,
    markPreflightConnectionAttempted,
    hasPreflightConnectionBeenAttempted,
    resetPreflightConnectionAttemptedForTests,
    buildDiagnosticsBundle: buildSupportBundle,
    redactDiagnosticsValue: redactValue,
    copyDiagnosticsBundle: copySupportBundle,
    getManifestFreshness,
    parseConfigStringState,
    formatConfigSegment,
    buildFirmwareTargetPreviewString,
    updateFirmwareTargetPreview,
    updateModuleVariantAvailability,
    classifyVariantForRender,
    getFirmwareReadiness,
    FIRMWARE_READINESS_COPY,
    updateModuleFirmwareImpactHints,
    MODULE_VARIANT_LABELS,
    verifyCurrentFirmwareIntegrity,
    renderFirmwareProvenanceSection,
    renderFirmwareDetailsPanel,
    renderChannelAcknowledgementPanel,
    setReleaseModeForTests,
    getReleaseMode,
    setChannelAcknowledgement,
    getOutstandingChannelAcknowledgements,
    isChannelAcknowledged,
    pruneStaleChannelAcknowledgements,
    getCurrentFirmwareSignature,
    isAdvancedWarningAcknowledged,
    setAdvancedWarningAcknowledged,
    clearAdvancedWarningAck,
    clearAdvancedWarningAcks,
    getActiveAdvancedWarningSelections,
    getOutstandingAdvancedWarningAcknowledgements,
    pruneInactiveAdvancedWarningAcks,
    updateAdvancedWarningRegions,
    selectDefaultFirmware,
    setFirmwareOptions,
    isFirmwareRecommendedDefault,
    captureManifestMetadata,
    setManifestFreshnessState,
    setManifestFreshnessAcknowledgement,
    checkManifestFreshnessNow,
    getManifestMetadata,
    postFlashService
});

export {
    getDefaultState,
    getState,
    setState,
    replaceState,
    getStep,
    getTotalSteps,
    setStep,
    getMaxReachableStep,
    getFirmwareReadiness
};
