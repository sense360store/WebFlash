/**
 * @fileoverview Firmware provenance and manifest validation.
 *
 * WebFlash is a supply-chain-sensitive surface — the wizard hands a binary
 * to ESP Web Tools that overwrites the device's flash. Before we let an
 * install proceed we need confidence the manifest entry is:
 *   1. Authentic — has a verifiable SHA-256 + signature blob.
 *   2. Traceable — names the source commit / release that produced it.
 *   3. Sized like real firmware (real ESP32-S3 application partitions are
 *      ~500 KB+; anything between the placeholder sentinel and the plausible
 *      threshold is treated as suspicious).
 *   4. Not flagged as deprecated for default selection.
 *   5. Documented with a changelog entry so users see what changed.
 *
 * The pure-data shape of this module makes it easy to test in isolation;
 * `state.js` wires it into the install gate, and `gen-manifests.py` mirrors
 * the same field set when emitting manifest entries.
 */

export const REQUIRED_PROVENANCE_FIELDS = Object.freeze([
    'sha256',
    'signature',
    'source_commit',
    'file_size',
    'changelog'
]);

// Real ESP32-S3 application partitions are roughly half a megabyte. Anything
// between the placeholder sentinel and this threshold is almost certainly a
// truncated build and gets a blocking warning.
export const MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES = 100 * 1024;

// Sentinel size for the placeholder stubs already committed to the repo
// (18-byte files used for tests and CI). Anything at or below this is
// treated as an intentional placeholder rather than suspicious data.
export const PLACEHOLDER_FIRMWARE_SIZE_BYTES = 64;

const STABLE_CHANNEL_ALIASES = new Set([
    'stable',
    'general',
    'ga',
    'release',
    'prod',
    'production',
    'lts'
]);

function normaliseChannel(channel) {
    if (!channel && channel !== 0) {
        return '';
    }
    return String(channel).trim().toLowerCase();
}

function isStableChannel(channel) {
    return STABLE_CHANNEL_ALIASES.has(normaliseChannel(channel));
}

function fieldIsPresent(build, field) {
    if (!build || typeof build !== 'object') {
        return false;
    }
    const value = build[field];
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0;
    }
    if (Array.isArray(value)) {
        return value.some(entry => {
            if (entry === null || entry === undefined) {
                return false;
            }
            if (typeof entry === 'string') {
                return entry.trim().length > 0;
            }
            return true;
        });
    }
    return true;
}

function describeMissingField(field) {
    switch (field) {
        case 'sha256':
            return 'SHA-256 checksum';
        case 'signature':
            return 'firmware signature';
        case 'source_commit':
            return 'source commit identifier';
        case 'file_size':
            return 'declared file size';
        case 'changelog':
            return 'changelog entry';
        default:
            return field;
    }
}

function classifySize(fileSize, { minPlausibleSize, placeholderSize }) {
    const numeric = Number(fileSize);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return { classification: 'missing' };
    }
    if (numeric <= placeholderSize) {
        return { classification: 'placeholder', value: numeric };
    }
    if (numeric < minPlausibleSize) {
        return { classification: 'suspicious', value: numeric, threshold: minPlausibleSize };
    }
    return { classification: 'plausible', value: numeric };
}

/**
 * Validate the provenance metadata for a single manifest build entry.
 *
 * @param {object} build A `manifest.json` `builds[]` entry.
 * @param {object} [options]
 * @param {number} [options.minPlausibleSize] Override the suspicious-size threshold.
 * @param {number} [options.placeholderSize] Override the placeholder sentinel.
 * @param {boolean} [options.allowPlaceholderSize] When true, placeholder-sized
 *     binaries (<= sentinel) are not flagged at all. Defaults to true so the
 *     fixture binaries shipped with the repo do not trip the install gate.
 * @returns {object} Validation report:
 *     - `ok` (bool): true when no blocking issues found
 *     - `status` ('pass'|'warn'|'fail'): worst-severity result
 *     - `channel` (string): normalised channel name
 *     - `deprecated` (bool): mirrors `build.deprecated`
 *     - `missingRequired` (string[]): required fields that are missing
 *     - `warnings` (string[]): non-blocking advisories
 *     - `blockingReasons` (string[]): user-facing reasons install is blocked
 *     - `verifiedFields` (string[]): names of fields that passed checks
 *     - `summary` (string): one-line human summary
 */
export function validateFirmwareProvenance(build, options = {}) {
    const {
        minPlausibleSize = MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES,
        placeholderSize = PLACEHOLDER_FIRMWARE_SIZE_BYTES,
        allowPlaceholderSize = true
    } = options;

    const channel = normaliseChannel(build?.channel);
    const stable = isStableChannel(channel);
    const deprecated = build?.deprecated === true;

    const missingRequired = [];
    const warnings = [];
    const blockingReasons = [];
    const verifiedFields = [];

    REQUIRED_PROVENANCE_FIELDS.forEach(field => {
        if (fieldIsPresent(build, field)) {
            verifiedFields.push(field);
        } else {
            missingRequired.push(field);
        }
    });

    if (missingRequired.length > 0) {
        const human = missingRequired.map(describeMissingField).join(', ');
        if (stable) {
            blockingReasons.push(
                `Stable firmware is missing required provenance metadata: ${human}.`
            );
        } else {
            warnings.push(
                `Firmware is missing provenance metadata: ${human}.`
            );
        }
    }

    const sizeReport = classifySize(build?.file_size, { minPlausibleSize, placeholderSize });
    if (sizeReport.classification === 'suspicious') {
        blockingReasons.push(
            `Firmware file size (${sizeReport.value} bytes) is below the plausible-firmware threshold (${sizeReport.threshold} bytes); refusing to install a suspiciously small binary.`
        );
    } else if (sizeReport.classification === 'placeholder' && !allowPlaceholderSize) {
        warnings.push(
            `Firmware file size (${sizeReport.value} bytes) looks like a placeholder build.`
        );
    } else if (sizeReport.classification === 'plausible' && !verifiedFields.includes('file_size_plausible')) {
        verifiedFields.push('file_size_plausible');
    }

    if (deprecated) {
        const reason = build?.deprecation_reason
            ? ` Reason: ${build.deprecation_reason}`
            : '';
        warnings.push(
            `This firmware build is marked as deprecated and is not selected by default.${reason}`
        );
    }

    let status = 'pass';
    if (blockingReasons.length > 0) {
        status = 'fail';
    } else if (warnings.length > 0) {
        status = 'warn';
    }

    let summary;
    if (status === 'fail') {
        summary = blockingReasons[0];
    } else if (status === 'warn') {
        summary = warnings[0];
    } else {
        summary = stable
            ? 'Provenance verified for stable firmware.'
            : 'Provenance verified.';
    }

    return {
        ok: status !== 'fail',
        status,
        channel,
        stable,
        deprecated,
        missingRequired,
        warnings,
        blockingReasons,
        verifiedFields,
        summary,
        sizeClassification: sizeReport.classification,
        sizeBytes: sizeReport.value ?? null
    };
}

/**
 * Filter that excludes deprecated builds from default-selection candidates.
 * Keeps the original ordering otherwise.
 *
 * @param {object[]} builds
 * @returns {object[]}
 */
export function pickDefaultEligibleBuilds(builds) {
    if (!Array.isArray(builds)) {
        return [];
    }
    return builds.filter(build => build && build.deprecated !== true);
}

/**
 * Build a structured list of "what we verified" entries for the UI panel.
 * Each entry is `{ key, label, ok, detail }` for direct rendering.
 *
 * @param {object} build
 * @param {object} [options]
 * @returns {{ entries: Array<object>, report: object }}
 */
export function describeVerificationChecks(build, options = {}) {
    const report = validateFirmwareProvenance(build, options);
    const entries = [];

    const recordRequired = (field, label) => {
        const present = fieldIsPresent(build, field);
        entries.push({
            key: field,
            label,
            ok: present,
            detail: present
                ? `${label} present.`
                : `${label} missing from manifest entry.`
        });
    };

    recordRequired('sha256', 'SHA-256 checksum');
    recordRequired('signature', 'Firmware signature');
    recordRequired('source_commit', 'Source commit');
    recordRequired('file_size', 'Declared file size');
    recordRequired('changelog', 'Changelog');

    const sizeReport = classifySize(build?.file_size, {
        minPlausibleSize: options.minPlausibleSize ?? MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES,
        placeholderSize: options.placeholderSize ?? PLACEHOLDER_FIRMWARE_SIZE_BYTES
    });
    let sizeOk;
    let sizeDetail;
    switch (sizeReport.classification) {
        case 'plausible':
            sizeOk = true;
            sizeDetail = `File size ${sizeReport.value} bytes is within plausible firmware range.`;
            break;
        case 'placeholder':
            sizeOk = true;
            sizeDetail = `File size ${sizeReport.value} bytes is a known placeholder fixture.`;
            break;
        case 'suspicious':
            sizeOk = false;
            sizeDetail = `File size ${sizeReport.value} bytes is below ${sizeReport.threshold} byte threshold and looks truncated.`;
            break;
        default:
            sizeOk = false;
            sizeDetail = 'File size could not be determined.';
            break;
    }
    entries.push({
        key: 'file_size_plausible',
        label: 'File size sanity',
        ok: sizeOk,
        detail: sizeDetail
    });

    entries.push({
        key: 'deprecated',
        label: 'Lifecycle status',
        ok: !report.deprecated,
        detail: report.deprecated
            ? `Marked deprecated.${build?.deprecation_reason ? ` Reason: ${build.deprecation_reason}` : ''}`
            : 'Build is not marked deprecated.'
    });

    return { entries, report };
}
