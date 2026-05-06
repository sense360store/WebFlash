/**
 * @fileoverview Structured support diagnostics bundle for WebFlash.
 *
 * Builds a versioned, redacted JSON snapshot of the wizard, environment,
 * manifest, firmware, preflight, recovery, cache, and flash state so support
 * can reproduce a failed install / preflight / recovery without DevTools.
 *
 * The bundle is session-scoped, never sent anywhere, and redacted before it
 * leaves the page (passwords, tokens, MAC addresses, filesystem paths, URL
 * query strings). See README "Support Diagnostics".
 *
 * @module services/diagnostics
 */

import { detectCapabilities } from '../capabilities.js';
import { copyTextToClipboard } from '../utils/copy-to-clipboard.js';
import { downloadJsonFile } from '../utils/file-download.js';
import { getFlashHistory } from '../utils/flash-history.js';
import { validateFirmwareProvenance } from '../utils/firmware-provenance.js';
import {
    getChannelPolicy,
    getRequiredAcknowledgements,
    normaliseReleaseChannel
} from '../utils/release-channels.js';
import { announce } from '../utils/a11y.js';
import { getServiceWorkerState } from './sw-update.js';

export const SCHEMA_VERSION = 1;

export const REDACTION_PLACEHOLDERS = Object.freeze({
    PASSWORD: '[REDACTED_PASSWORD]',
    TOKEN: '[REDACTED_TOKEN]',
    MAC: '[REDACTED_MAC]',
    PATH: '[REDACTED_PATH]',
    SECRET: '[REDACTED_SECRET]',
    URL: '[REDACTED_URL]',
    DEFAULT: '[REDACTED]'
});

const RESCUE_MANIFEST_URL = './firmware/rescue/manifest.json';
const APP_VERSION_FALLBACK = '1.0.0';

const KEY_PASSWORD = /password|passphrase/i;
const KEY_TOKEN = /token|api_?key|authorization|cookie|jwt|bearer/i;
const KEY_SECRET = /secret|private/i;
const KEY_MAC = /(^|[^a-z])(mac|bssid)([^a-z]|$)/i;
const KEY_PATH = /path|filename|filepath/i;
const KEY_URL = /url|endpoint|href/i;
const KEY_DEFAULT = /^(uuid|serial|signature|checksum|ssid|private[_-]?key)$/i;

const VALUE_MAC = /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i;
const VALUE_PATH = /^([A-Z]:\\|\/(home|Users|var|etc|tmp|root)\/)/;

function categoryForKey(keyPath) {
    if (!keyPath) {
        return null;
    }
    const segment = String(keyPath).split('.').pop().split('[')[0];
    if (KEY_PASSWORD.test(segment)) return 'PASSWORD';
    if (KEY_TOKEN.test(segment)) return 'TOKEN';
    if (KEY_SECRET.test(segment)) return 'SECRET';
    if (KEY_MAC.test(segment)) return 'MAC';
    if (KEY_PATH.test(segment)) return 'PATH';
    if (KEY_URL.test(segment)) return 'URL';
    if (KEY_DEFAULT.test(segment)) return 'DEFAULT';
    return null;
}

function categoryForValue(value) {
    if (typeof value !== 'string') {
        return null;
    }
    if (VALUE_MAC.test(value)) return 'MAC';
    if (VALUE_PATH.test(value)) return 'PATH';
    return null;
}

function redactUrlValue(value) {
    try {
        const parsed = new URL(value, 'http://localhost');
        const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        if (parsed.search) {
            return `${base}?[REDACTED_QUERY]`;
        }
        return base;
    } catch {
        return REDACTION_PLACEHOLDERS.URL;
    }
}

export function redactValue(value, keyPath = '') {
    if (Array.isArray(value)) {
        return value.map((entry, index) => redactValue(entry, `${keyPath}[${index}]`));
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, nested]) => {
            const nextPath = keyPath ? `${keyPath}.${key}` : key;
            acc[key] = redactValue(nested, nextPath);
            return acc;
        }, {});
    }

    // Booleans/numbers/null are never sensitive on their own. This avoids
    // redacting *_present booleans whose key happens to share a token with a
    // sensitive name (e.g. signature_present, password_present).
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
        return value;
    }

    const keyCategory = categoryForKey(keyPath);
    if (keyCategory === 'URL' && typeof value === 'string' && value.length > 0) {
        return redactUrlValue(value);
    }
    if (keyCategory) {
        return REDACTION_PLACEHOLDERS[keyCategory];
    }

    const valueCategory = categoryForValue(value);
    if (valueCategory) {
        return REDACTION_PLACEHOLDERS[valueCategory];
    }

    return value;
}

/**
 * Scrubs sensitive substrings out of free-form text (error messages, log
 * lines). Unlike redactValue which replaces a whole value, this preserves
 * the surrounding text and only swaps the matched fragment for a placeholder.
 */
export function scrubSensitiveText(text) {
    if (typeof text !== 'string' || text.length === 0) {
        return text;
    }
    return text
        .replace(/[A-Z]:\\(?:[^\s\\]+\\)*[^\s\\]+/g, REDACTION_PLACEHOLDERS.PATH)
        .replace(/\/(?:home|Users|var|etc|tmp|root)\/[^\s'")]+/g, REDACTION_PLACEHOLDERS.PATH)
        .replace(/[0-9a-f]{2}([:-][0-9a-f]{2}){5}/gi, REDACTION_PLACEHOLDERS.MAC)
        .replace(/(?:Bearer\s+|token[=:]\s*|api[_-]?key[=:]\s*)[A-Za-z0-9._-]+/gi, REDACTION_PLACEHOLDERS.TOKEN);
}

const sessionState = {
    lastUsbTestResult: null,
    lastUsbTestTimestamp: null,
    lastRecoveryResult: null,
    lastRecoveryTimestamp: null,
    recoveryAcknowledged: false,
    bootloaderInstructionsShown: false,
    cacheClearRequested: null,
    updateAvailable: false,
    configurationMode: 'manual',
    selectedKitSku: null
};

export function recordUsbTestResult({ result, error = null, timestamp = null } = {}) {
    sessionState.lastUsbTestResult = result || null;
    sessionState.lastUsbTestTimestamp = timestamp
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();
    if (error && typeof error === 'object') {
        sessionState.lastUsbTestError = error.name || error.message || null;
    } else {
        // Clear any stale error from a previous attempt so a 'pass' /
        // 'cancelled' result doesn't carry forward an old error message
        // into diagnostics.
        delete sessionState.lastUsbTestError;
    }
}

export function recordRecoveryResult({ result, error = null, timestamp = null } = {}) {
    sessionState.lastRecoveryResult = result || null;
    sessionState.lastRecoveryTimestamp = timestamp
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();
    if (error && typeof error === 'object') {
        sessionState.lastRecoveryError = error.name || error.message || null;
    } else {
        // Clear any stale error from a previous attempt so a 'success' result
        // doesn't carry forward an old error message into diagnostics.
        delete sessionState.lastRecoveryError;
    }
}

export function recordCacheClearRequested(timestamp = Date.now()) {
    sessionState.cacheClearRequested = new Date(timestamp).toISOString();
}

export function recordRecoveryAcknowledged(value) {
    sessionState.recoveryAcknowledged = Boolean(value);
}

export function recordBootloaderInstructionsShown(value) {
    sessionState.bootloaderInstructionsShown = Boolean(value);
}

export function recordUpdateAvailable(value) {
    sessionState.updateAvailable = Boolean(value);
}

/**
 * Records which configuration mode the user is in. Called by the kit-mode
 * controller and by the manual-flow defaults. Mode is included in the
 * diagnostics bundle so support can tell whether a customer used the
 * kit picker or the per-module flow without inferring it from UI state.
 *
 * @param {string} mode - "kit" or "manual"
 */
export function setConfigurationMode(mode) {
    sessionState.configurationMode = mode === 'kit' ? 'kit' : 'manual';
}

/**
 * Records the SKU the user selected in kit mode. Stored verbatim — the
 * SKU is a product identifier, not customer-identifying data.
 *
 * @param {string|null} sku
 */
export function setSelectedKitSku(sku) {
    sessionState.selectedKitSku = typeof sku === 'string' && sku.trim().length > 0
        ? sku.trim().toUpperCase()
        : null;
}

export function getSessionDiagnosticsState() {
    return { ...sessionState };
}

export function resetSessionDiagnosticsStateForTests() {
    sessionState.lastUsbTestResult = null;
    sessionState.lastUsbTestTimestamp = null;
    sessionState.lastRecoveryResult = null;
    sessionState.lastRecoveryTimestamp = null;
    sessionState.recoveryAcknowledged = false;
    sessionState.bootloaderInstructionsShown = false;
    sessionState.cacheClearRequested = null;
    sessionState.updateAvailable = false;
    sessionState.configurationMode = 'manual';
    sessionState.selectedKitSku = null;
    delete sessionState.lastUsbTestError;
    delete sessionState.lastRecoveryError;
}

function readMeta(name) {
    if (typeof document === 'undefined' || !document.querySelector) {
        return null;
    }
    const meta = document.querySelector(`meta[name="${name}"]`);
    const content = meta?.getAttribute('content');
    return content && content.trim().length > 0 ? content.trim() : null;
}

function buildAppSection() {
    return {
        app_version: readMeta('webflash-app-version') || APP_VERSION_FALLBACK,
        build_commit: readMeta('webflash-build-commit') || 'unknown',
        build_timestamp: readMeta('webflash-build-timestamp') || 'unknown'
    };
}

function parseBrowserVersion(ua, browserKey) {
    if (!ua) return 'unknown';
    const patterns = {
        edge: /Edg\/([\d.]+)/,
        chrome: /Chrome\/([\d.]+)/,
        firefox: /Firefox\/([\d.]+)/,
        safari: /Version\/([\d.]+)/,
        opera: /OPR\/([\d.]+)/,
        brave: /Chrome\/([\d.]+)/
    };
    const re = patterns[browserKey];
    if (!re) return 'unknown';
    const match = ua.match(re);
    return match ? match[1] : 'unknown';
}

function buildEnvironmentSection() {
    let caps;
    try {
        caps = detectCapabilities();
    } catch {
        caps = {
            browser: 'unknown',
            browserName: 'unknown',
            ua: '',
            os: 'unknown',
            osName: 'unknown',
            isMobile: false,
            secureContext: false,
            webSerial: false
        };
    }
    return {
        browser: caps.browserName || caps.browser || 'unknown',
        browser_version: parseBrowserVersion(caps.ua, caps.browser),
        user_agent_redacted: true,
        platform: caps.osName || caps.os || 'unknown',
        mobile_detected: Boolean(caps.isMobile),
        secure_context: Boolean(caps.secureContext),
        web_serial_supported: Boolean(caps.webSerial)
    };
}

function buildManifestSection({ manifestData, manifestFreshness }) {
    if (!manifestData || typeof manifestData !== 'object') {
        return {
            manifest_version: null,
            generated_at: 'unknown',
            source_commit: 'unknown',
            freshness: manifestFreshness || 'unknown'
        };
    }
    const firstBuild = Array.isArray(manifestData.builds) ? manifestData.builds[0] : null;
    return {
        manifest_version: manifestData.manifest_version
            ?? (manifestData.version ? 1 : null),
        generated_at: manifestData.generated_at
            || firstBuild?.build_date
            || 'unknown',
        source_commit: manifestData.source_commit
            || firstBuild?.source_commit
            || 'unknown',
        freshness: manifestFreshness || 'unknown'
    };
}

// Severity ranking used to derive the warning level surfaced via diagnostics.
// 'positive' (stable) → none; everything else escalates from 'info' → 'danger'.
const RELEASE_WARNING_LEVEL_BY_TONE = Object.freeze({
    positive: 'none',
    info: 'info',
    warning: 'warning',
    danger: 'danger'
});

function buildFirmwareSection({
    currentFirmware,
    releaseMode = 'normal',
    firmwareIsRecommendedDefault = null,
    channelAcknowledgementsCompleted = null
}) {
    if (!currentFirmware || typeof currentFirmware !== 'object') {
        return {
            selected_config: null,
            selected_version: null,
            channel: null,
            selected_channel: null,
            recommended: false,
            deprecated: false,
            deprecation_reason: null,
            source_commit: null,
            source_url: null,
            sha256_present: false,
            signature_present: false,
            ed25519_signature_present: false,
            signature_key_id: null,
            provenance_status: 'unknown',
            release_warning_level: 'none',
            acknowledgement_required: false,
            acknowledgement_completed: false,
            mode: releaseMode || 'normal'
        };
    }

    let provenanceStatus = 'unknown';
    try {
        const report = validateFirmwareProvenance(currentFirmware);
        provenanceStatus = report.status || 'unknown';
    } catch {
        provenanceStatus = 'unknown';
    }

    const sha256Present = Boolean(currentFirmware.sha256
        || (Array.isArray(currentFirmware.parts) && currentFirmware.parts.some(p => p && p.sha256)));
    const signaturePresent = Boolean(currentFirmware.signature
        || (Array.isArray(currentFirmware.parts) && currentFirmware.parts.some(p => p && p.signature)));
    const ed25519SignaturePresent = Boolean(currentFirmware.signature_ed25519
        || (Array.isArray(currentFirmware.parts) && currentFirmware.parts.some(p => p && p.signature_ed25519)));
    const signatureKeyId = (typeof currentFirmware.signature_key_id === 'string' && currentFirmware.signature_key_id.trim())
        || (Array.isArray(currentFirmware.parts)
            ? (currentFirmware.parts.find(p => p && p.signature_key_id)?.signature_key_id || null)
            : null);

    const policy = getChannelPolicy(currentFirmware.channel);
    const canonicalChannel = normaliseReleaseChannel(currentFirmware.channel);
    const requiredAcks = getRequiredAcknowledgements(currentFirmware);
    const acknowledgementRequired = requiredAcks.length > 0;
    // Prefer the explicit "completed" boolean from the state provider when it
    // is wired through; fall back to "no acks required" → trivially complete.
    const acknowledgementCompleted = typeof channelAcknowledgementsCompleted === 'boolean'
        ? channelAcknowledgementsCompleted
        : !acknowledgementRequired;
    // Recommended is a presentation flag computed from the firmware list, not
    // a persisted manifest field. The state provider passes the result of
    // pickDefaultBuild here; treat anything else as "no default known".
    const recommended = firmwareIsRecommendedDefault === true;
    const releaseWarningLevel = RELEASE_WARNING_LEVEL_BY_TONE[policy.tone] || 'info';
    const deprecationReason = (typeof currentFirmware.deprecation_reason === 'string'
        && currentFirmware.deprecation_reason.trim())
        ? currentFirmware.deprecation_reason.trim()
        : null;

    return {
        selected_config: currentFirmware.config_string
            || currentFirmware.device_type
            || currentFirmware.model
            || null,
        selected_version: currentFirmware.version || null,
        channel: currentFirmware.channel || null,
        // Canonical-key alias for downstream consumers that don't want to
        // re-implement alias mapping (e.g. correlating 'rc' with 'beta').
        selected_channel: canonicalChannel,
        recommended,
        deprecated: Boolean(currentFirmware.deprecated),
        deprecation_reason: deprecationReason,
        source_commit: currentFirmware.source_commit || null,
        source_url: currentFirmware.source_url || null,
        sha256_present: sha256Present,
        signature_present: signaturePresent,
        // Real Ed25519 signature metadata. `signature_present` above is the
        // legacy salted-SHA256 'signature' field — useful for diagnosing
        // older fixtures, but only `ed25519_signature_present` is the
        // primitive that drives authenticity verification.
        ed25519_signature_present: ed25519SignaturePresent,
        signature_key_id: signatureKeyId,
        provenance_status: provenanceStatus,
        release_warning_level: releaseWarningLevel,
        acknowledgement_required: acknowledgementRequired,
        acknowledgement_completed: acknowledgementCompleted,
        mode: releaseMode || 'normal'
    };
}

function buildWizardSection({ stepInfo, configuration, currentFirmware }) {
    const config = configuration && typeof configuration === 'object' ? configuration : {};
    const moduleKeys = ['roomiq', 'airiq', 'ventiq', 'fan', 'led'];
    const selectedModules = moduleKeys.filter(key => {
        const value = config[key];
        return value && value !== 'none';
    });
    return {
        current_step: Number(stepInfo?.current ?? 1),
        max_reachable_step: Number(stepInfo?.maxReachable ?? 1),
        selected_core: config.voice && config.voice !== 'none' ? config.voice : 'core',
        selected_modules: selectedModules,
        selected_power: config.power || null,
        shareable_link_available: Boolean(config.mounting && config.power)
    };
}

function buildConfigurationSection({ configuration, kitMetadata, currentFirmware, sessionSnapshot }) {
    const config = configuration && typeof configuration === 'object' ? configuration : {};
    const moduleKeys = ['roomiq', 'airiq', 'ventiq', 'fan', 'led'];
    const selectedModules = moduleKeys.filter(key => {
        const value = config[key];
        return value && value !== 'none';
    });
    const selectedCore = config.voice && config.voice !== 'none' ? config.voice : 'core';
    const mode = sessionSnapshot.configurationMode === 'kit' ? 'kit' : 'manual';

    if (mode === 'kit') {
        return {
            mode: 'kit',
            sku: sessionSnapshot.selectedKitSku || null,
            kit_display_name: kitMetadata?.display_name || null,
            kit_sample: Boolean(kitMetadata?.sample),
            resolved_core: selectedCore,
            resolved_modules: selectedModules,
            resolved_power: config.power || null,
            resolved_firmware_config: kitMetadata?.firmware_config_string
                || currentFirmware?.config_string
                || null
        };
    }

    return {
        mode: 'manual',
        selected_core: selectedCore,
        selected_modules: selectedModules,
        selected_power: config.power || null
    };
}

function buildPreflightSection({ envCaps, sessionSnapshot }) {
    return {
        browser_supported: Boolean(envCaps?.isSupported),
        web_serial_supported: Boolean(envCaps?.webSerial),
        secure_context: Boolean(envCaps?.secureContext),
        mobile_detected: Boolean(envCaps?.isMobile),
        platform_hint: envCaps?.osName || envCaps?.os || 'unknown',
        last_usb_test_result: sessionSnapshot.lastUsbTestResult || null,
        last_usb_test_timestamp: sessionSnapshot.lastUsbTestTimestamp || null
    };
}

function buildRecoverySection({ releaseMode, sessionSnapshot }) {
    const modeActive = releaseMode === 'recovery';
    const lastError = sessionSnapshot.lastRecoveryError;
    return {
        mode_active: modeActive,
        rescue_manifest: RESCUE_MANIFEST_URL,
        recovery_acknowledged: Boolean(sessionSnapshot.recoveryAcknowledged),
        bootloader_instructions_shown: Boolean(sessionSnapshot.bootloaderInstructionsShown),
        last_recovery_result: sessionSnapshot.lastRecoveryResult || null,
        last_recovery_timestamp: sessionSnapshot.lastRecoveryTimestamp || null,
        last_recovery_error: lastError ? scrubSensitiveText(String(lastError)) : null
    };
}

function buildCacheSection({ sessionSnapshot, manifestFreshness }) {
    const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    const swControlled = swSupported && Boolean(navigator.serviceWorker?.controller);
    return {
        service_worker_supported: swSupported,
        service_worker_controlled: swControlled,
        update_available: Boolean(sessionSnapshot.updateAvailable),
        cache_clear_requested: sessionSnapshot.cacheClearRequested || null,
        manifest_freshness: manifestFreshness || 'unknown'
    };
}

function buildServiceWorkerSection() {
    let snap;
    try {
        snap = getServiceWorkerState();
    } catch {
        snap = null;
    }
    if (!snap || typeof snap !== 'object') {
        const fallbackSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
        const fallbackControlled = fallbackSupported && Boolean(navigator.serviceWorker?.controller);
        return {
            supported: fallbackSupported,
            controlled: fallbackControlled,
            update_available: false,
            update_dismissed: false,
            cache_clear_requested: false
        };
    }
    return {
        supported: Boolean(snap.supported),
        controlled: Boolean(snap.controlled),
        update_available: Boolean(snap.updateAvailable),
        update_dismissed: Boolean(snap.updateDismissed),
        cache_clear_requested: Boolean(snap.cacheClearRequested)
    };
}

const ERROR_CODE_PATTERNS = [
    { pattern: /securityerror|permission denied|blocked access/i, code: 'permission_denied' },
    { pattern: /failed to connect|failed to initialize/i, code: 'connect_failed' },
    { pattern: /serial port|busy|in use/i, code: 'serial_busy' },
    { pattern: /timeout|timed out/i, code: 'timeout' },
    { pattern: /verification|checksum|signature/i, code: 'verification_failed' }
];

function deriveErrorCode(message) {
    if (!message) return null;
    const text = String(message);
    for (const { pattern, code } of ERROR_CODE_PATTERNS) {
        if (pattern.test(text)) return code;
    }
    return 'unknown';
}

function deriveStage(status) {
    if (!status) return null;
    const map = {
        started: 'connect',
        success: 'finished',
        error: 'install',
        cancelled: 'connect'
    };
    return map[status] || status;
}

function buildFlashSection() {
    let history = [];
    try {
        history = getFlashHistory();
    } catch {
        history = [];
    }
    if (!Array.isArray(history) || history.length === 0) {
        return {
            last_attempt_started_at: null,
            last_attempt_finished_at: null,
            last_attempt_result: null,
            stage: null,
            error_code: null,
            error_message: null,
            recovery_attempt: false
        };
    }
    const latest = history[0];
    const startedAt = latest.timestamp || null;
    let finishedAt = null;
    if (latest.status === 'success' || latest.status === 'error') {
        if (startedAt && Number.isFinite(latest.duration) && latest.duration > 0) {
            try {
                finishedAt = new Date(new Date(startedAt).getTime() + latest.duration).toISOString();
            } catch {
                finishedAt = null;
            }
        }
    }
    const rawErrorMessage = latest.errorMessage || null;
    const errorMessage = rawErrorMessage ? scrubSensitiveText(rawErrorMessage) : null;
    const recoveryAttempt = typeof latest.configString === 'string'
        && /rescue|recovery/i.test(latest.configString);
    return {
        last_attempt_started_at: startedAt,
        last_attempt_finished_at: finishedAt,
        last_attempt_result: latest.status || null,
        stage: deriveStage(latest.status),
        error_code: rawErrorMessage ? deriveErrorCode(rawErrorMessage) : null,
        error_message: errorMessage,
        recovery_attempt: Boolean(recoveryAttempt)
    };
}

let stateProvider = () => ({});
let activeKitMetadata = null;

export function setSupportBundleStateProvider(provider) {
    if (typeof provider === 'function') {
        stateProvider = provider;
    }
}

/**
 * Records the kit currently selected in kit mode so the diagnostics bundle
 * can include the kit's friendly display name and resolved firmware
 * config_string. Pass null to clear (for example when the user switches
 * back to manual mode).
 *
 * @param {Object|null} kit
 */
export function setActiveKitMetadata(kit) {
    if (!kit || typeof kit !== 'object') {
        activeKitMetadata = null;
        return;
    }
    activeKitMetadata = {
        sku: kit.sku || null,
        display_name: kit.display_name || null,
        firmware_config_string: kit.firmware_config_string || null,
        sample: Boolean(kit.sample)
    };
}

export function buildSupportBundle() {
    const providerInput = (() => {
        try {
            return stateProvider() || {};
        } catch {
            return {};
        }
    })();

    const sessionSnapshot = getSessionDiagnosticsState();
    let envCaps;
    try {
        envCaps = detectCapabilities();
    } catch {
        envCaps = {};
    }

    const bundle = {
        schema_version: SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        app: buildAppSection(),
        environment: buildEnvironmentSection(),
        manifest: buildManifestSection({
            manifestData: providerInput.manifestData || null,
            manifestFreshness: providerInput.manifestFreshness || 'unknown'
        }),
        firmware: buildFirmwareSection({
            currentFirmware: providerInput.currentFirmware || null,
            releaseMode: providerInput.releaseMode || 'normal',
            firmwareIsRecommendedDefault: providerInput.firmwareIsRecommendedDefault === true,
            channelAcknowledgementsCompleted: typeof providerInput.channelAcknowledgementsCompleted === 'boolean'
                ? providerInput.channelAcknowledgementsCompleted
                : null
        }),
        wizard: buildWizardSection({
            stepInfo: providerInput.stepInfo || null,
            configuration: providerInput.configuration || null,
            currentFirmware: providerInput.currentFirmware || null
        }),
        configuration: buildConfigurationSection({
            configuration: providerInput.configuration || null,
            kitMetadata: providerInput.kitMetadata || activeKitMetadata,
            currentFirmware: providerInput.currentFirmware || null,
            sessionSnapshot
        }),
        preflight: buildPreflightSection({ envCaps, sessionSnapshot }),
        recovery: buildRecoverySection({
            releaseMode: providerInput.releaseMode || 'normal',
            sessionSnapshot
        }),
        cache: buildCacheSection({
            sessionSnapshot,
            manifestFreshness: providerInput.manifestFreshness || 'unknown'
        }),
        service_worker: buildServiceWorkerSection(),
        flash: buildFlashSection(),
        post_flash: buildPostFlashSection({
            postFlashSnapshot: providerInput.postFlashSnapshot || null
        }),
        missing_firmware: buildMissingFirmwareSection({
            firmwareStatusMessage: providerInput.firmwareStatusMessage || null,
            configStringRequested: providerInput.configStringRequested || null,
            kitMetadata: providerInput.kitMetadata || activeKitMetadata,
            sessionSnapshot
        })
    };

    return redactValue(bundle);
}

function buildMissingFirmwareSection({ firmwareStatusMessage, configStringRequested, kitMetadata, sessionSnapshot }) {
    const isUnavailable = firmwareStatusMessage
        && typeof firmwareStatusMessage === 'object'
        && firmwareStatusMessage.type === 'not-available';

    if (!isUnavailable) {
        return {
            status: 'available',
            requested_config_string: configStringRequested || null,
            expected_build_name: null,
            nearby_config_strings: [],
            mismatch_highlights: [],
            selected_hardware: [],
            configuration_mode: sessionSnapshot.configurationMode === 'kit' ? 'kit' : 'manual',
            selected_kit_sku: sessionSnapshot.selectedKitSku || null,
            kit_display_name: kitMetadata?.display_name || null
        };
    }

    const requested = firmwareStatusMessage.configString || configStringRequested || null;
    // expected_build_name carries the canonical Sense360-…-vX.Y.Z-channel.bin
    // that the wizard generated for the user's selection. It contains no
    // user-identifying data, but is named *_build_name (rather than
    // *_filename) on purpose so the diagnostic redaction layer doesn't treat
    // it as a filesystem path and replace it with [REDACTED_PATH].
    const expectedBuildName = firmwareStatusMessage.expectedFilename
        || (requested ? `Sense360-${requested}-v1.0.0-stable.bin` : null);
    const nearbyConfigStrings = Array.isArray(firmwareStatusMessage.nearbyConfigStrings)
        ? firmwareStatusMessage.nearbyConfigStrings.slice()
        : [];
    const mismatchHighlights = Array.isArray(firmwareStatusMessage.mismatchHighlights)
        ? firmwareStatusMessage.mismatchHighlights.map(item => ({
            key: item?.key || null,
            label: item?.label || null
        }))
        : [];
    const selectedHardware = Array.isArray(firmwareStatusMessage.selectedHardware)
        ? firmwareStatusMessage.selectedHardware.map(item => ({
            key: item?.key || null,
            label: item?.label || null,
            value: item?.value || null
        }))
        : [];
    const configurationMode = firmwareStatusMessage.configurationMode === 'kit'
        ? 'kit'
        : (sessionSnapshot.configurationMode === 'kit' ? 'kit' : 'manual');

    return {
        status: 'unavailable',
        requested_config_string: requested,
        expected_build_name: expectedBuildName,
        nearby_config_strings: nearbyConfigStrings,
        mismatch_highlights: mismatchHighlights,
        selected_hardware: selectedHardware,
        configuration_mode: configurationMode,
        selected_kit_sku: sessionSnapshot.selectedKitSku || null,
        kit_display_name: kitMetadata?.display_name || null
    };
}

function buildPostFlashSection({ postFlashSnapshot }) {
    if (!postFlashSnapshot || typeof postFlashSnapshot !== 'object') {
        return {
            status: 'not_started',
            selected_firmware_version: null,
            selected_config: null,
            validation_attempted: false,
            validation_result: 'unknown',
            validation_checks: [],
            home_assistant_handoff_shown: false,
            wifi_handoff_shown: false,
            recovery_handoff_shown: false
        };
    }
    const checks = Array.isArray(postFlashSnapshot.validation_checks)
        ? postFlashSnapshot.validation_checks.map(check => ({
            name: check?.name || null,
            status: check?.status || 'not_available',
            detail: check?.detail || null
        }))
        : [];
    return {
        status: postFlashSnapshot.status || 'not_started',
        selected_firmware_version: postFlashSnapshot.selected_firmware_version || null,
        selected_firmware_name: postFlashSnapshot.selected_firmware_name || null,
        selected_config: postFlashSnapshot.selected_config || null,
        selected_channel: postFlashSnapshot.selected_channel || null,
        selected_commit: postFlashSnapshot.selected_commit || null,
        selected_improv_supported: postFlashSnapshot.selected_improv_supported ?? null,
        validation_attempted: Boolean(postFlashSnapshot.validation_attempted),
        validation_result: postFlashSnapshot.validation_result || 'unknown',
        validation_checks: checks,
        home_assistant_handoff_shown: Boolean(postFlashSnapshot.home_assistant_handoff_shown),
        wifi_handoff_shown: Boolean(postFlashSnapshot.wifi_handoff_shown),
        wifi_handoff_status: postFlashSnapshot.wifi_handoff_status || null,
        recovery_handoff_shown: Boolean(postFlashSnapshot.recovery_handoff_shown),
        last_error_message: postFlashSnapshot.last_error_message || null,
        started_at: postFlashSnapshot.started_at || null,
        finished_at: postFlashSnapshot.finished_at || null,
        duration_ms: postFlashSnapshot.duration_ms ?? null
    };
}

function showLocalToast(message, duration = 2400) {
    if (typeof document === 'undefined' || !document.body) {
        return;
    }
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
    if (toast._diagnosticsTimeoutId) {
        clearTimeout(toast._diagnosticsTimeoutId);
    }
    toast._diagnosticsTimeoutId = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, duration);
}

export async function copySupportBundle(trigger = null) {
    const payload = JSON.stringify(buildSupportBundle(), null, 2);
    try {
        await copyTextToClipboard(payload);
        if (trigger && trigger.dataset) {
            trigger.dataset.copyState = 'success';
        }
        const message = 'Support bundle copied. Paste it into your support request.';
        showLocalToast(message);
        announce(message);
        return true;
    } catch (error) {
        if (trigger && trigger.dataset) {
            trigger.dataset.copyState = 'error';
        }
        const message = 'Could not copy automatically. Select and copy the support bundle manually.';
        showLocalToast(message);
        announce(message, { assertive: true });
        return false;
    }
}

export function downloadSupportBundle(trigger = null) {
    const bundle = buildSupportBundle();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `webflash-support-bundle-${stamp}.json`;
    const ok = downloadJsonFile(filename, bundle);
    if (trigger && trigger.dataset) {
        trigger.dataset.copyState = ok ? 'success' : 'error';
    }
    if (ok) {
        announce(`Support bundle downloaded as ${filename}.`);
    } else {
        announce('Could not download support bundle.', { assertive: true });
    }
    return ok;
}

const HANDLER_KEY = '__webflashSupportBundleClickHandler';

export function initSupportBundleActions() {
    if (typeof document === 'undefined') {
        return;
    }
    // Idempotent across module reloads — remove any previously attached handler
    // (stored on document) before binding a fresh one.
    if (document[HANDLER_KEY]) {
        document.removeEventListener('click', document[HANDLER_KEY]);
    }
    const handler = async event => {
        const copyTrigger = event.target.closest?.('[data-copy-support-bundle], [data-copy-diagnostics]');
        if (copyTrigger) {
            event.preventDefault();
            await copySupportBundle(copyTrigger);
            return;
        }
        const downloadTrigger = event.target.closest?.('[data-download-support-bundle]');
        if (downloadTrigger) {
            event.preventDefault();
            downloadSupportBundle(downloadTrigger);
        }
    };
    document.addEventListener('click', handler);
    document[HANDLER_KEY] = handler;

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            ?.then(registration => {
                if (registration && registration.waiting) {
                    recordUpdateAvailable(true);
                }
                registration?.addEventListener?.('updatefound', () => {
                    recordUpdateAvailable(true);
                });
            })
            .catch(() => {});
    }
}

export const __testHooks = Object.freeze({
    categoryForKey,
    categoryForValue,
    redactUrlValue,
    deriveErrorCode,
    parseBrowserVersion,
    resetActionsForTests: () => {
        if (typeof document !== 'undefined' && document[HANDLER_KEY]) {
            document.removeEventListener('click', document[HANDLER_KEY]);
            document[HANDLER_KEY] = null;
        }
    },
    resetStateProviderForTests: () => {
        stateProvider = () => ({});
    }
});
