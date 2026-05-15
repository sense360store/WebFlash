/**
 * @fileoverview WF-UX-002 — canonical firmware-readiness copy.
 *
 * Six presentation-only tags, one phrase per state. Three render sites
 * consume this module:
 *   1. scripts/state.js → updateFirmwareTargetPreview() (Step 4 warning)
 *      and updateCompatibleFirmwareHeading() (Step 5 heading), plus the
 *      richer `getFirmwareReadiness({ ... })` wrapper that reads from the
 *      live wizard state, manifest, capabilities, and selected build.
 *   2. scripts/state.js → renderFirmwareNotAvailable() (the H4 reuses the
 *      no-build headline so Step 5's heading and the not-available card
 *      read identically).
 *   3. scripts/layout/state-summary.js → renderFirmwareSummary() (sidebar
 *      + mobile-drawer firmware mini-card empty state).
 *
 * The module is pure data + a single pure function — no DOM, no module
 * state, no other imports. Keeping it dependency-free lets layout files
 * import the copy table without dragging the full state.js graph in,
 * which matters for unit tests that mock state.js's transitive deps
 * (e.g. preset-manager + state-summary-export tests).
 *
 * Acknowledgement gating, install policy, channel visibility, and
 * provenance verification all live elsewhere — this module governs
 * *headlines*, not gates. See scripts/utils/release-channels.js for the
 * channel policy and scripts/state.js (`channelAcksSatisfied`,
 * `evaluatePreflightPolicy`, freshness gate) for install-time gating.
 */

export const FIRMWARE_READINESS_KINDS = Object.freeze([
    'no-selection',
    'stable-ready',
    'preview-ready',
    'no-build',
    'rescue-ready',
    'unsupported-browser'
]);

export const FIRMWARE_READINESS_COPY = Object.freeze({
    'no-selection': Object.freeze({
        headline: 'Choose your hardware to find firmware',
        body: 'Select mounting, power, and modules to see the matching firmware.',
        tone: 'info'
    }),
    'stable-ready': Object.freeze({
        headline: 'Firmware ready to install',
        body: 'This stable build matches your selected hardware.',
        tone: 'positive'
    }),
    'preview-ready': Object.freeze({
        headline: 'Preview firmware available',
        body: 'This is an experimental preview build. Review the warning and acknowledge it before installing.',
        tone: 'warning'
    }),
    'no-build': Object.freeze({
        headline: 'No published firmware for this exact selection',
        body: 'Adjust your hardware choices or pick a supported kit to find a matching build.',
        tone: 'warning'
    }),
    'rescue-ready': Object.freeze({
        headline: 'Rescue firmware ready',
        body: 'Use this only for recovery or bootloader repair. It will overwrite your current configuration.',
        tone: 'danger'
    }),
    'unsupported-browser': Object.freeze({
        headline: 'Browser not supported for flashing',
        body: 'Open this page in desktop Chrome, Edge, or Opera to install firmware over USB.',
        tone: 'danger'
    })
});

/**
 * Pure-data classifier. Given a snapshot of the inputs the wizard would
 * normally read live, return one of the six readiness kinds.
 *
 * Inputs are explicitly named so this function can be unit-tested without
 * spinning up the full wizard. The state.js wrapper
 * (`getFirmwareReadiness`) provides the live snapshot; tests can call
 * this classifier directly with synthetic inputs.
 *
 * @param {Object} input
 * @param {string} [input.configString] - Assembled config_string (empty/null
 *   when mounting or power are not yet picked).
 * @param {boolean} [input.manifestHasConfig] - Whether the loaded manifest
 *   contains a build matching `configString`.
 * @param {string} [input.firmwareChannel] - Canonical channel of the
 *   currently-selected build (`'stable'`, `'preview'`, `'rescue'`, etc.),
 *   or null/undefined when no firmware is selected.
 * @param {boolean} [input.hasFirmware] - Whether window.currentFirmware is
 *   populated. Defaults to Boolean(input.firmwareChannel).
 * @param {boolean} [input.hasNotAvailableStatus] - Whether the wizard has
 *   set firmwareStatusMessage to type 'not-available'.
 * @param {boolean} [input.browserSupported] - Whether the browser exposes
 *   Web Serial. Defaults to true so server-side / non-browser environments
 *   don't get an "unsupported" verdict by accident.
 * @returns {'no-selection'|'stable-ready'|'preview-ready'|'no-build'|'rescue-ready'|'unsupported-browser'}
 */
export function classifyFirmwareReadiness({
    configString = '',
    manifestHasConfig = false,
    firmwareChannel = null,
    hasFirmware,
    hasNotAvailableStatus = false,
    browserSupported = true
} = {}) {
    if (!browserSupported) {
        return 'unsupported-browser';
    }

    const firmwareSelected = hasFirmware !== undefined ? Boolean(hasFirmware) : Boolean(firmwareChannel);
    if (firmwareSelected) {
        switch (firmwareChannel) {
            case 'rescue':
                return 'rescue-ready';
            case 'preview':
                return 'preview-ready';
            case 'stable':
                return 'stable-ready';
            default:
                // beta / development / unknown channels: treat as preview-shaped
                // so the headline does not promise stability the build cannot
                // back. The acknowledgement gate stays the source of truth for
                // whether install actually fires.
                return 'preview-ready';
        }
    }

    if (!configString) {
        return 'no-selection';
    }

    if (hasNotAvailableStatus) {
        return 'no-build';
    }

    if (manifestHasConfig) {
        // Manifest knows this config but no build has been resolved into
        // window.currentFirmware yet (mid-load, or release-mode hides the
        // matching tier). Fall back to no-selection so the wizard does not
        // promise readiness before it has actually settled on a build.
        return 'no-selection';
    }

    return 'no-build';
}

/**
 * Convenience: classify and return the canonical copy bundle in one call.
 */
export function getFirmwareReadinessCopy(input) {
    const kind = classifyFirmwareReadiness(input);
    const copy = FIRMWARE_READINESS_COPY[kind];
    return {
        kind,
        headline: copy.headline,
        body: copy.body,
        tone: copy.tone
    };
}
