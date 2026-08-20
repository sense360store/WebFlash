/**
 * @fileoverview WebFlash 2.0 engine seam.
 *
 * This is the single, view-agnostic import surface the WebFlash 2.0 view uses to
 * reach the WebFlash 1.0 engine. It is the pivot established by PR 2 of the
 * WebFlash 2.0 migration (see docs/webflash-2-migration.md Section 2,
 * archived — see docs/archive-index.md, and
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
 * Trust claims carried by this seam:
 *   - Cryptographic signature verification is ENFORCED. state.verifyFirmwareIntegrity
 *     runs real Ed25519 verification of the downloaded bytes against the pinned
 *     trust list (scripts/utils/firmware-trusted-keys.js) alongside the SHA-256
 *     integrity check, and state.evaluateInstallGate refuses to arm install
 *     unless BOTH verdicts pass. The signature_verified provenance check flips
 *     from 'pending' to 'pass'/'fail' based on that runtime result; a missing,
 *     tampered, or test_only-key signature blocks install in production mode.
 *     No surface may claim verification the engine has not actually performed.
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
 * exports, so no render/logic extraction or `views/` boundary was required. PR 4
 * (Identify step on the real engine) added the pure compatible-firmware lookup
 * `state.resolveCompatibleFirmware`, which resolves a wizard-state snapshot to the
 * real manifest builds by config_string without touching the 1.0 DOM or the shared
 * `configuration` object. PR 5 (Install gate on the real engine) added two more
 * view-agnostic bindings on the same principle: `state.verifyFirmwareIntegrity`
 * (SHA-256 integrity AND Ed25519 authenticity verification of the downloaded
 * bytes via SubtleCrypto, owned by state.js) and `state.evaluateInstallGate`
 * (the pure composite gate over provenance, integrity + authenticity,
 * freshness, service-worker, the seven-tier channel
 * acknowledgement, and the before-you-flash acknowledgement), plus the
 * `capabilities` namespace for the desktop / Web Serial / secure-context decision.
 * This module remains a facade only; every export is a live reference to the real
 * engine function.
 *
 * @module engine
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
    applyUrlConfiguration,
    replaceState,
    getStep,
    getTotalSteps,
    setStep,
    getMaxReachableStep,
    getFirmwareReadiness,
    resolveCompatibleFirmware,
    verifyFirmwareIntegrity,
    evaluateInstallGate,
    INSTALL_GATE_CHECK_IDS,
    getReleaseMode,
    setReleaseModeFromUrl
} from './state.js';
import { getManifestMetadataForAbout } from './state.js';

// ---------------------------------------------------------------------------
// scripts/capabilities.js — desktop / Web Serial / secure-context detection.
// The engine owns the capability decision; the view renders it.
// ---------------------------------------------------------------------------
import {
    detectCapabilities,
    evaluateBrowserReadiness
} from './capabilities.js';

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
} from './utils/release-channels.js';

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
} from './utils/firmware-provenance.js';

// ---------------------------------------------------------------------------
// scripts/services/manifest-freshness.js — live no-store re-fetch verdict.
// ---------------------------------------------------------------------------
import {
    FRESHNESS_REASON,
    resolveManifestUrl,
    checkManifestFreshness
} from './services/manifest-freshness.js';

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
} from './services/sw-update.js';

// ---------------------------------------------------------------------------
// scripts/services/cache-clear.js — Cache Storage clearing for recovery.
// ---------------------------------------------------------------------------
import { clearWebFlashCache } from './services/cache-clear.js';

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
} from './utils/kit-config.js';

// ---------------------------------------------------------------------------
// scripts/utils/a11y.js — focus trap, focus restoration, live-region announce.
// ---------------------------------------------------------------------------
import {
    getFocusableElements,
    trapFocus,
    restoreFocus,
    announce
} from './utils/a11y.js';

// ---------------------------------------------------------------------------
// scripts/services/post-flash.js — post-flash validation + handoff state
// machine (eight result states). The engine owns the lifecycle-to-result
// reduction and the honest validation aggregation; the view renders snapshots
// and never claims a passed check without engine evidence. It never reads,
// logs, or stores Wi-Fi credentials.
// ---------------------------------------------------------------------------
import {
    postFlashService,
    POST_FLASH_STATES,
    VALIDATION_CHECK_IDS
} from './services/post-flash.js';

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
} from './services/diagnostics.js';

/** Central state machine and stepper. The view reads and drives wizard state through these. */
export const state = Object.freeze({
    getDefaultState,
    getState,
    setState,
    applyUrlConfiguration,
    replaceState,
    getStep,
    getTotalSteps,
    setStep,
    getMaxReachableStep,
    getFirmwareReadiness,
    getManifestMetadataForAbout,
    resolveCompatibleFirmware,
    // PR 5 — view-agnostic install-gate bindings. verifyFirmwareIntegrity runs
    // SHA-256 verification of the downloaded bytes against the manifest AND
    // Ed25519 signature verification of the same bytes against the pinned
    // trust list; evaluateInstallGate folds every engine verdict (provenance,
    // integrity, authenticity, freshness, service-worker, channel
    // acknowledgement, before-you-flash) into a single machine-readable gate
    // result keyed by INSTALL_GATE_CHECK_IDS and refuses install unless the
    // hash and signature verdicts BOTH pass.
    verifyFirmwareIntegrity,
    evaluateInstallGate,
    INSTALL_GATE_CHECK_IDS,
    // PR 8 — release-mode visibility. setReleaseModeFromUrl applies the URL's
    // ?mode= opt-in (recovery / development) to the engine's authoritative
    // release mode, and getReleaseMode reports it. resolveCompatibleFirmware and
    // the channel model already read getReleaseMode(), so the 2.0 view inherits
    // the exact 1.0 visibility rules for development and recovery builds without
    // owning the decision.
    getReleaseMode,
    setReleaseModeFromUrl
});

/** Desktop / Web Serial / secure-context capability detection. The engine decides; the view renders. */
export const capabilities = Object.freeze({
    detectCapabilities,
    evaluateBrowserReadiness
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

/**
 * Post-flash validation and handoff state machine (PR 7). The view feeds the
 * shared singleton the selected build and the ESP Web Tools lifecycle events,
 * then renders the resulting eight-state snapshot. The engine owns the honest
 * validation aggregation (never `passed` without evidence, `unknown` by
 * default) and never reads, logs, or stores Wi-Fi credentials. `service` is a
 * live reference to the same singleton the 1.0 view drives.
 */
export const postFlash = Object.freeze({
    service: postFlashService,
    POST_FLASH_STATES,
    VALIDATION_CHECK_IDS
});

/** The full engine surface, one namespace per engine module. */
export const engine = Object.freeze({
    state,
    capabilities,
    channels,
    provenance,
    freshness,
    swUpdate,
    cache,
    kits,
    a11y,
    diagnostics,
    postFlash
});

export default engine;
