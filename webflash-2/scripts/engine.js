/**
 * @fileoverview WebFlash 2.0 engine seam.
 *
 * This is the single, view-agnostic import surface the WebFlash 2.0 view uses to
 * reach the WebFlash 1.0 engine. It is the pivot established by PR 2 of the
 * WebFlash 2.0 migration (see docs/webflash-2-migration.md Section 2 and
 * docs/adr/0001-webflash-2-view-over-engine.md).
 *
 * The 1.0 codebase is the logic and trust layer (the engine). The 2.0 components
 * are the render layer (the view). This module re-exports the named, view-agnostic
 * functions and constants the view is allowed to call, grouped one namespace per
 * engine module. It contains NO logic of its own: every export is a live reference
 * to the real engine function. Importing this module is identical to importing the
 * underlying engine modules directly, so there is no second code path to audit.
 *
 * View and engine boundary contract (the load-bearing rule of the migration):
 *
 *   1. The engine owns every gating decision. Provenance, channel acknowledgement,
 *      SHA-256 verification, manifest freshness, service-worker update,
 *      installability per the release gates, and the desktop only capability check
 *      are all decided by the engine. The view may not re-implement, relax, or
 *      short-circuit any of them.
 *   2. The view renders engine state and calls engine actions. It reads
 *      machine-readable check results by stable check id (provenance.CHECK_IDS),
 *      not by parsing summary or detail strings, and it invokes engine functions
 *      such as state.setState, the acknowledgement APIs, validateFirmwareProvenance,
 *      and the diagnostics builder.
 *   3. The view never owns a gate. If a check is blocking in 1.0, it is blocking in
 *      2.0.
 *
 * Trust non-claims carried by this seam:
 *   - No surface may claim cryptographic signature verification. The engine reports
 *     signature metadata only; the signature_verified check stays skip until real
 *     verification ships as a separate, explicit project. This seam exposes the
 *     same non-claim and adds none of its own.
 *   - This seam exposes only what 1.0 already exposes. It does not surface any kit,
 *     module, or channel the 1.0 engine does not already expose.
 *
 * Deliberate exclusions: this seam never re-exports the engine modules' test-only
 * surfaces (__testHooks, __testHelpers, __testing, __resetForTests, *ForTests) or
 * the 1.0-view render internals that live inside state.js (firmware-card HTML,
 * DOM control wiring, preflight rendering). Those stay private to the engine. The
 * 2.0 view does its own rendering and only consumes engine logic.
 *
 * Scope note (PR 2): all nine engine modules already expose named, view-agnostic
 * exports, so no render/logic extraction or `views/` boundary was required. The
 * compatible-firmware lookup the view will resolve selections against is currently
 * entangled with the 1.0 DOM inside state.js; exposing a pure lookup is the binding
 * work of PR 4 (Identify step on the real engine) and is intentionally not done
 * here. This module is a facade only and adds no runtime behaviour to either view
 * until the 2.0 shell is mounted under ?ui=2 in PR 3.
 *
 * @module webflash-2/engine
 */

// ---------------------------------------------------------------------------
// scripts/state.js — central state machine + stepper (public accessors only).
// state.js also owns the 1.0 render layer and the install gate, but those are
// internal to the module; only the view-agnostic state surface is re-exported.
// ---------------------------------------------------------------------------
import {
    getDefaultState,
    getState,
    setState,
    replaceState,
    getStep,
    getTotalSteps,
    setStep,
    getMaxReachableStep,
    getFirmwareReadiness
} from '../../scripts/state.js';
import { getManifestMetadataForAbout } from '../../scripts/state.js';

// ---------------------------------------------------------------------------
// scripts/utils/release-channels.js — seven-tier channel model, badges,
// warnings, acknowledgement requirements, and default-build selection.
// ---------------------------------------------------------------------------
import {
    RELEASE_CHANNELS,
    normaliseReleaseChannel,
    getChannelPolicy,
    isKnownChannel,
    isStableChannel,
    getFirmwareBadges,
    getFirmwareWarnings,
    getRequiredAcknowledgements,
    getFirmwareAcknowledgementSignature,
    filterBuildsForMode,
    isBuildVisibleInMode,
    pickDefaultBuild,
    getChannelPriority
} from '../../scripts/utils/release-channels.js';

// ---------------------------------------------------------------------------
// scripts/utils/firmware-provenance.js — the blocking install gate, stable
// check ids, trust-tier computation, and verification result application.
// ---------------------------------------------------------------------------
import {
    CHECK_IDS,
    REQUIRED_PROVENANCE_FIELDS,
    CRITICAL_PROVENANCE_FIELDS,
    TRUST_TIERS,
    TIER_STATUSES,
    ARTIFACT_TYPES,
    validateFirmwareProvenance,
    computeTrustTiersFromChecks,
    applySignatureVerificationResult,
    applyHashVerificationResult,
    pickDefaultEligibleBuilds,
    describeVerificationChecks
} from '../../scripts/utils/firmware-provenance.js';

// ---------------------------------------------------------------------------
// scripts/services/manifest-freshness.js — live no-store re-fetch verdict.
// ---------------------------------------------------------------------------
import {
    FRESHNESS_REASON,
    resolveManifestUrl,
    checkManifestFreshness
} from '../../scripts/services/manifest-freshness.js';

// ---------------------------------------------------------------------------
// scripts/services/sw-update.js — service-worker update detection + actions.
// ---------------------------------------------------------------------------
import {
    initServiceWorkerUpdates,
    subscribeServiceWorkerState,
    getServiceWorkerState,
    dismissPendingUpdate,
    triggerSkipWaitingAndReload,
    markCacheClearRequested
} from '../../scripts/services/sw-update.js';

// ---------------------------------------------------------------------------
// scripts/services/cache-clear.js — Cache Storage clearing for recovery.
// ---------------------------------------------------------------------------
import { clearWebFlashCache } from '../../scripts/services/cache-clear.js';

// ---------------------------------------------------------------------------
// scripts/utils/kit-config.js — kit catalogue loader + wizard-state mapping.
// ---------------------------------------------------------------------------
import {
    KIT_DATA_URL,
    SUPPORTED_SCHEMA_VERSION,
    loadKitCatalog,
    buildCatalogFromPayload,
    findKitBySku,
    mapKitToWizardState,
    summariseKitModules,
    normaliseSku,
    validateKitEntry
} from '../../scripts/utils/kit-config.js';

// ---------------------------------------------------------------------------
// scripts/utils/a11y.js — focus trap, focus restoration, live-region announce.
// ---------------------------------------------------------------------------
import {
    getFocusableElements,
    trapFocus,
    restoreFocus,
    announce
} from '../../scripts/utils/a11y.js';

// ---------------------------------------------------------------------------
// scripts/services/diagnostics.js — redacted schema_version:1 support bundle.
// ---------------------------------------------------------------------------
import {
    SCHEMA_VERSION,
    REDACTION_PLACEHOLDERS,
    redactValue,
    scrubSensitiveText,
    buildSupportBundle,
    copySupportBundle,
    downloadSupportBundle,
    initSupportBundleActions,
    setSupportBundleStateProvider,
    setActiveKitMetadata,
    setConfigurationMode,
    setSelectedKitSku,
    getSessionDiagnosticsState,
    recordUsbTestResult,
    recordRecoveryResult,
    recordCacheClearRequested,
    recordRecoveryAcknowledged,
    recordBootloaderInstructionsShown,
    recordUpdateAvailable
} from '../../scripts/services/diagnostics.js';

/** Central state machine and stepper. The view reads and drives wizard state through these. */
export const state = Object.freeze({
    getDefaultState,
    getState,
    setState,
    replaceState,
    getStep,
    getTotalSteps,
    setStep,
    getMaxReachableStep,
    getFirmwareReadiness,
    getManifestMetadataForAbout
});

/** Seven-tier release-channel model: badges, warnings, acknowledgement needs, default-build pick. */
export const channels = Object.freeze({
    RELEASE_CHANNELS,
    normaliseReleaseChannel,
    getChannelPolicy,
    isKnownChannel,
    isStableChannel,
    getFirmwareBadges,
    getFirmwareWarnings,
    getRequiredAcknowledgements,
    getFirmwareAcknowledgementSignature,
    filterBuildsForMode,
    isBuildVisibleInMode,
    pickDefaultBuild,
    getChannelPriority
});

/** The blocking provenance install gate. Read results by CHECK_IDS, never by parsing strings. */
export const provenance = Object.freeze({
    CHECK_IDS,
    REQUIRED_PROVENANCE_FIELDS,
    CRITICAL_PROVENANCE_FIELDS,
    TRUST_TIERS,
    TIER_STATUSES,
    ARTIFACT_TYPES,
    validateFirmwareProvenance,
    computeTrustTiersFromChecks,
    applySignatureVerificationResult,
    applyHashVerificationResult,
    pickDefaultEligibleBuilds,
    describeVerificationChecks
});

/** Manifest freshness verdict (current / stale / unknown) from a live no-store re-fetch. */
export const freshness = Object.freeze({
    FRESHNESS_REASON,
    resolveManifestUrl,
    checkManifestFreshness
});

/** Service-worker update detection and the skip-waiting / reload actions. */
export const swUpdate = Object.freeze({
    initServiceWorkerUpdates,
    subscribeServiceWorkerState,
    getServiceWorkerState,
    dismissPendingUpdate,
    triggerSkipWaitingAndReload,
    markCacheClearRequested
});

/** Cache Storage clearing used by the recovery path. */
export const cache = Object.freeze({
    clearWebFlashCache
});

/** Kit catalogue loader (kits.json) plus SKU lookup and wizard-state mapping. */
export const kits = Object.freeze({
    KIT_DATA_URL,
    SUPPORTED_SCHEMA_VERSION,
    loadKitCatalog,
    buildCatalogFromPayload,
    findKitBySku,
    mapKitToWizardState,
    summariseKitModules,
    normaliseSku,
    validateKitEntry
});

/** Accessibility primitives: focusable enumeration, focus trap, focus restore, live-region announce. */
export const a11y = Object.freeze({
    getFocusableElements,
    trapFocus,
    restoreFocus,
    announce
});

/** Redacted schema_version:1 support bundle builder plus the session recorders it reads. */
export const diagnostics = Object.freeze({
    SCHEMA_VERSION,
    REDACTION_PLACEHOLDERS,
    redactValue,
    scrubSensitiveText,
    buildSupportBundle,
    copySupportBundle,
    downloadSupportBundle,
    initSupportBundleActions,
    setSupportBundleStateProvider,
    setActiveKitMetadata,
    setConfigurationMode,
    setSelectedKitSku,
    getSessionDiagnosticsState,
    recordUsbTestResult,
    recordRecoveryResult,
    recordCacheClearRequested,
    recordRecoveryAcknowledged,
    recordBootloaderInstructionsShown,
    recordUpdateAvailable
});

/** The full engine surface, one namespace per engine module. */
export const engine = Object.freeze({
    state,
    channels,
    provenance,
    freshness,
    swUpdate,
    cache,
    kits,
    a11y,
    diagnostics
});

export default engine;
