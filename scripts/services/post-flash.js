/**
 * @fileoverview Post-flash validation and handoff state machine.
 *
 * Tracks the install lifecycle reported by ESP Web Tools' `state-changed`
 * event and produces a structured result so the wizard can distinguish
 * "firmware was flashed" from "the device is actually ready to use".
 *
 * Result states: not_started, in_progress, completed,
 * completed_validation_passed, completed_validation_failed,
 * completed_validation_unknown, failed, cancelled.
 *
 * Validation is best-effort and honest: when a signal is unavailable we
 * report `not_available` for that check and `unknown` overall. We never
 * claim `passed` without evidence. We never read or store Wi-Fi
 * credentials.
 *
 * @module services/post-flash
 */

export const POST_FLASH_STATES = Object.freeze({
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    COMPLETED_VALIDATION_PASSED: 'completed_validation_passed',
    COMPLETED_VALIDATION_FAILED: 'completed_validation_failed',
    COMPLETED_VALIDATION_UNKNOWN: 'completed_validation_unknown',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

export const VALIDATION_CHECK_IDS = Object.freeze([
    'device_reconnect',
    'device_firmware_identity',
    'version_match',
    'improv_endpoint_available',
    'wifi_provisioning_capability'
]);

const HANDOFF_KINDS = Object.freeze(['home_assistant', 'wifi', 'recovery']);

const DEFAULT_VALIDATION_TIMEOUT_MS = 20000;
const IMPROV_WAIT_GRACE_MS = 5000;

const IN_PROGRESS_LIFECYCLE_TOKENS = new Set([
    'preparing', 'manifest', 'initializing', 'erasing', 'writing'
]);

function makeInitialChecks() {
    return VALIDATION_CHECK_IDS.map(id => ({
        name: id,
        status: 'not_available',
        detail: null
    }));
}

function makeInitialSnapshot() {
    return {
        status: POST_FLASH_STATES.NOT_STARTED,
        selected_firmware_version: null,
        selected_firmware_name: null,
        selected_config: null,
        selected_channel: null,
        selected_commit: null,
        selected_improv_supported: null,
        validation_attempted: false,
        validation_result: 'unknown',
        validation_checks: makeInitialChecks(),
        home_assistant_handoff_shown: false,
        wifi_handoff_shown: false,
        recovery_handoff_shown: false,
        wifi_handoff_status: null,
        last_error_message: null,
        started_at: null,
        finished_at: null,
        duration_ms: null
    };
}

function normaliseStateToken(value) {
    if (typeof value !== 'string') {
        return null;
    }
    return value.trim().toLowerCase();
}

function normaliseVersion(version) {
    if (typeof version !== 'string') {
        return '';
    }
    let v = version.trim();
    if (v[0] === 'v' || v[0] === 'V') {
        v = v.slice(1);
    }
    return v.toLowerCase();
}

function readImprovInfo(detail) {
    if (!detail || typeof detail !== 'object') {
        return null;
    }
    const candidate = detail.improvInfo || detail.improv_info || detail.improv || null;
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }
    return candidate;
}

function maskFirmwareName(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    // Take the first alphanumeric token as the family identifier — e.g.
    // "Sense360 Modular Platform Firmware" → "sense360" and
    // "Sense360-Core" → "sense360" but "NotSense360Firmware" → the full
    // run, which will not match "sense360" as expected.
    const lower = trimmed.toLowerCase();
    const match = lower.match(/^[a-z0-9]+/);
    return match ? match[0] : 'unknown';
}

function buildBundleSnapshot(snapshot) {
    return {
        status: snapshot.status,
        selected_firmware_version: snapshot.selected_firmware_version,
        selected_firmware_name: snapshot.selected_firmware_name,
        selected_config: snapshot.selected_config,
        selected_channel: snapshot.selected_channel,
        selected_commit: snapshot.selected_commit,
        selected_improv_supported: snapshot.selected_improv_supported,
        validation_attempted: snapshot.validation_attempted,
        validation_result: snapshot.validation_result,
        validation_checks: snapshot.validation_checks.map(check => ({
            name: check.name,
            status: check.status,
            detail: check.detail
        })),
        home_assistant_handoff_shown: snapshot.home_assistant_handoff_shown,
        wifi_handoff_shown: snapshot.wifi_handoff_shown,
        wifi_handoff_status: snapshot.wifi_handoff_status,
        recovery_handoff_shown: snapshot.recovery_handoff_shown,
        last_error_message: snapshot.last_error_message,
        started_at: snapshot.started_at,
        finished_at: snapshot.finished_at,
        duration_ms: snapshot.duration_ms
    };
}

function createPostFlashService() {
    let snapshot = makeInitialSnapshot();
    const subscribers = new Set();
    let validationTimer = null;
    let serialConnectListener = null;
    let validationDeadline = null;
    let lastObservedLifecycle = null;
    let selectedBuild = null;
    let manifestRef = null;

    function notify() {
        const payload = buildBundleSnapshot(snapshot);
        subscribers.forEach(fn => {
            try { fn(payload); } catch { /* keep other subscribers alive */ }
        });
    }

    function setStatus(next) {
        if (snapshot.status === next) {
            return;
        }
        snapshot.status = next;
        if (next === POST_FLASH_STATES.IN_PROGRESS && !snapshot.started_at) {
            snapshot.started_at = new Date().toISOString();
        }
        if (
            next !== POST_FLASH_STATES.NOT_STARTED
            && next !== POST_FLASH_STATES.IN_PROGRESS
            && !snapshot.finished_at
        ) {
            snapshot.finished_at = new Date().toISOString();
            if (snapshot.started_at) {
                snapshot.duration_ms = new Date(snapshot.finished_at).getTime()
                    - new Date(snapshot.started_at).getTime();
            }
        }
    }

    function setCheck(id, status, detail = null) {
        const check = snapshot.validation_checks.find(c => c.name === id);
        if (!check) {
            return false;
        }
        if (check.status === status && check.detail === detail) {
            return false;
        }
        check.status = status;
        check.detail = detail;
        return true;
    }

    function captureSelectedBuild(build) {
        selectedBuild = build || null;
        if (!build) {
            return;
        }
        snapshot.selected_firmware_version = build.version || null;
        snapshot.selected_firmware_name = build.name || null;
        snapshot.selected_config = build.config_string || null;
        snapshot.selected_channel = build.channel || null;
        snapshot.selected_commit = build.source_commit || null;
        snapshot.selected_improv_supported = build.improv === true
            ? true
            : (build.improv === false ? false : null);
    }

    function captureManifest(manifest) {
        manifestRef = manifest || null;
    }

    function clearValidationTimer() {
        if (validationTimer !== null) {
            clearTimeout(validationTimer);
            validationTimer = null;
        }
    }

    function clearSerialConnectListener() {
        if (
            serialConnectListener
            && typeof navigator !== 'undefined'
            && navigator.serial
            && typeof navigator.serial.removeEventListener === 'function'
        ) {
            navigator.serial.removeEventListener('connect', serialConnectListener);
        }
        serialConnectListener = null;
    }

    function aggregateValidation() {
        const checks = snapshot.validation_checks;
        const anyFailed = checks.some(c => c.status === 'failed');
        if (anyFailed) {
            snapshot.validation_result = 'failed';
            return POST_FLASH_STATES.COMPLETED_VALIDATION_FAILED;
        }
        const allPassed = checks.every(c => c.status === 'passed');
        if (allPassed) {
            snapshot.validation_result = 'passed';
            return POST_FLASH_STATES.COMPLETED_VALIDATION_PASSED;
        }
        snapshot.validation_result = 'unknown';
        return POST_FLASH_STATES.COMPLETED_VALIDATION_UNKNOWN;
    }

    function finishValidation(reason) {
        clearValidationTimer();
        clearSerialConnectListener();
        validationDeadline = null;
        const aggregated = aggregateValidation();
        if (reason) {
            // Annotate any not_available checks with the reason on first
            // close so the support bundle records the cause.
            snapshot.validation_checks.forEach(check => {
                if (check.status === 'not_available' && check.detail === null) {
                    check.detail = reason;
                }
            });
        }
        setStatus(aggregated);
        notify();
    }

    function startValidation() {
        snapshot.validation_attempted = true;

        // Seed checks based on the selected build's declared capabilities.
        const improvSupported = snapshot.selected_improv_supported === true;
        if (!improvSupported) {
            setCheck('improv_endpoint_available', 'not_available', 'no improv on this build');
            setCheck('device_firmware_identity', 'not_available', 'no improv on this build');
            setCheck('version_match', 'not_available', 'no improv on this build');
            setCheck('wifi_provisioning_capability', 'not_available', 'no improv on this build');
        }

        // Bind a one-shot serial connect listener for the device_reconnect
        // check. If Web Serial is unavailable, the check stays not_available.
        if (
            typeof navigator !== 'undefined'
            && navigator.serial
            && typeof navigator.serial.addEventListener === 'function'
        ) {
            serialConnectListener = () => {
                setCheck('device_reconnect', 'passed', 'serial connect observed after flash');
                clearSerialConnectListener();
                maybeCloseValidation();
            };
            navigator.serial.addEventListener('connect', serialConnectListener);
        } else {
            setCheck('device_reconnect', 'not_available', 'web serial unavailable');
        }

        const waitMs = (() => {
            const fromManifest = manifestRef && Number(manifestRef.new_install_improv_wait_time);
            if (Number.isFinite(fromManifest) && fromManifest > 0) {
                return fromManifest * 1000 + IMPROV_WAIT_GRACE_MS;
            }
            return DEFAULT_VALIDATION_TIMEOUT_MS;
        })();

        validationDeadline = Date.now() + waitMs;
        validationTimer = setTimeout(() => {
            finishValidation('validation window expired without conclusive signal');
        }, waitMs);

        notify();
    }

    function maybeCloseValidation() {
        // Close early if every check has resolved one way or another.
        const allResolved = snapshot.validation_checks.every(c => c.status !== 'not_available');
        if (allResolved) {
            finishValidation(null);
        }
    }

    function applyImprovInfo(improvInfo) {
        if (!improvInfo) {
            return;
        }
        if (snapshot.selected_improv_supported !== true) {
            return;
        }
        setCheck('improv_endpoint_available', 'passed', 'improv frame observed');

        const expectedName = selectedBuild?.name || manifestRef?.name || null;
        const reportedFirmware = typeof improvInfo.firmware === 'string' ? improvInfo.firmware : null;
        if (expectedName && reportedFirmware) {
            const expectedToken = maskFirmwareName(expectedName);
            const reportedToken = maskFirmwareName(reportedFirmware);
            if (expectedToken && reportedToken) {
                if (expectedToken === reportedToken) {
                    setCheck('device_firmware_identity', 'passed', `family ${expectedToken}`);
                } else {
                    setCheck('device_firmware_identity', 'failed', 'firmware family mismatch');
                }
            }
        } else if (reportedFirmware) {
            setCheck('device_firmware_identity', 'passed', `family ${maskFirmwareName(reportedFirmware) || 'reported'}`);
        }

        const reportedVersion = typeof improvInfo.version === 'string' ? improvInfo.version : null;
        const expectedVersion = selectedBuild?.version || manifestRef?.version || null;
        if (reportedVersion && expectedVersion) {
            if (normaliseVersion(reportedVersion) === normaliseVersion(expectedVersion)) {
                setCheck('version_match', 'passed', `device reports ${reportedVersion}`);
            } else {
                setCheck('version_match', 'failed', `device reports ${reportedVersion}, expected ${expectedVersion}`);
            }
        }

        // wifi_provisioning_capability is "passed" only on an explicit
        // provisioning success below — receiving Improv info alone does
        // not prove provisioning succeeded.
        maybeCloseValidation();
    }

    function applyWifiSignal(kind, message = null) {
        if (kind === 'provisioned') {
            setCheck('wifi_provisioning_capability', 'passed', 'improv reported provisioned');
            snapshot.wifi_handoff_status = 'already_done';
        } else if (kind === 'failed') {
            setCheck('wifi_provisioning_capability', 'failed', message || 'improv provisioning failed');
            snapshot.wifi_handoff_status = 'failed';
        }
        maybeCloseValidation();
    }

    function dispatchLifecycle(detail) {
        const rawState = typeof detail === 'string' ? detail : detail?.state;
        const state = normaliseStateToken(rawState);
        if (!state) {
            return;
        }

        // Capture Improv info regardless of state — the install button
        // emits it during multiple lifecycle events.
        const improvInfo = readImprovInfo(detail);
        if (improvInfo) {
            applyImprovInfo(improvInfo);
        }

        // Detect explicit Wi-Fi provisioning signals if the host emits them.
        const wifiKind = (() => {
            if (typeof detail === 'object' && detail) {
                if (detail.provisioned === true || state === 'provisioned') {
                    return 'provisioned';
                }
                if (state === 'provision_error' || detail.provisionError) {
                    return 'failed';
                }
            }
            return null;
        })();
        if (wifiKind) {
            applyWifiSignal(wifiKind, detail?.message || null);
        }

        if (IN_PROGRESS_LIFECYCLE_TOKENS.has(state)) {
            if (
                snapshot.status === POST_FLASH_STATES.NOT_STARTED
                || snapshot.status === POST_FLASH_STATES.CANCELLED
                || snapshot.status === POST_FLASH_STATES.FAILED
            ) {
                resetForNewAttempt();
            }
            setStatus(POST_FLASH_STATES.IN_PROGRESS);
            lastObservedLifecycle = state;
            notify();
            return;
        }

        if (state === 'finished') {
            setStatus(POST_FLASH_STATES.COMPLETED);
            lastObservedLifecycle = state;
            notify();
            startValidation();
            return;
        }

        if (state === 'error') {
            const message = typeof detail?.message === 'string' ? detail.message : null;
            const errorMessage = detail?.error?.message || message || 'install error';
            snapshot.last_error_message = errorMessage;
            clearValidationTimer();
            clearSerialConnectListener();
            setStatus(POST_FLASH_STATES.FAILED);
            lastObservedLifecycle = state;
            notify();
            return;
        }

        if (state === 'idle') {
            // ESP Web Tools does not emit an explicit cancellation signal.
            // If we previously saw a non-idle lifecycle and never reached
            // finished/error and there is no detail.error, treat the return
            // to idle as a heuristic cancellation.
            const wasInProgress = snapshot.status === POST_FLASH_STATES.IN_PROGRESS;
            const hasError = Boolean(detail?.error);
            if (wasInProgress && !hasError) {
                clearValidationTimer();
                clearSerialConnectListener();
                setStatus(POST_FLASH_STATES.CANCELLED);
                notify();
            }
            lastObservedLifecycle = state;
            return;
        }

        lastObservedLifecycle = state;
    }

    function markHandoffShown(kind, status = null) {
        if (!HANDOFF_KINDS.includes(kind)) {
            return;
        }
        if (kind === 'home_assistant') {
            snapshot.home_assistant_handoff_shown = true;
        } else if (kind === 'wifi') {
            snapshot.wifi_handoff_shown = true;
            if (typeof status === 'string') {
                snapshot.wifi_handoff_status = status;
            }
        } else if (kind === 'recovery') {
            snapshot.recovery_handoff_shown = true;
        }
        notify();
    }

    function resetForNewAttempt() {
        clearValidationTimer();
        clearSerialConnectListener();
        const carriedBuild = {
            version: snapshot.selected_firmware_version,
            name: snapshot.selected_firmware_name,
            config: snapshot.selected_config,
            channel: snapshot.selected_channel,
            commit: snapshot.selected_commit,
            improv: snapshot.selected_improv_supported
        };
        snapshot = makeInitialSnapshot();
        // Re-attach the captured build so it survives a retry.
        snapshot.selected_firmware_version = carriedBuild.version;
        snapshot.selected_firmware_name = carriedBuild.name;
        snapshot.selected_config = carriedBuild.config;
        snapshot.selected_channel = carriedBuild.channel;
        snapshot.selected_commit = carriedBuild.commit;
        snapshot.selected_improv_supported = carriedBuild.improv;
    }

    return {
        STATES: POST_FLASH_STATES,

        getSnapshot() {
            return buildBundleSnapshot(snapshot);
        },

        subscribe(fn) {
            if (typeof fn !== 'function') {
                return () => {};
            }
            subscribers.add(fn);
            try { fn(buildBundleSnapshot(snapshot)); } catch { /* swallow */ }
            return () => subscribers.delete(fn);
        },

        captureSelectedBuild,
        captureManifest,
        dispatchLifecycle,
        markHandoffShown,

        getStatus() {
            return snapshot.status;
        },

        reset() {
            clearValidationTimer();
            clearSerialConnectListener();
            snapshot = makeInitialSnapshot();
            notify();
        },

        // Test-only entry points.
        __unsafeForceValidationClose() {
            finishValidation('forced for tests');
        },
        __unsafeApplyImprovInfo(info) {
            applyImprovInfo(info);
        },
        __unsafeApplyWifiSignal(kind, message) {
            applyWifiSignal(kind, message);
        },
        __unsafeGetInternalState() {
            return {
                lastObservedLifecycle,
                validationDeadline,
                hasSerialListener: serialConnectListener !== null,
                hasTimer: validationTimer !== null,
                selectedBuild,
                manifestRef
            };
        }
    };
}

export const postFlashService = createPostFlashService();

export const __testHooks = Object.freeze({
    createPostFlashService,
    POST_FLASH_STATES,
    VALIDATION_CHECK_IDS,
    DEFAULT_VALIDATION_TIMEOUT_MS,
    IMPROV_WAIT_GRACE_MS
});
