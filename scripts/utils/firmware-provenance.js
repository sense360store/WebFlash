/**
 * @fileoverview Firmware provenance and manifest validation.
 *
 * --- Trust model ---
 *
 * WebFlash is a supply-chain-sensitive surface — the wizard hands a binary
 * to ESP Web Tools that overwrites the device's flash. The provenance layer
 * is designed to be HONEST about what it actually does, so the install gate
 * is hard to bypass and is not confused with cryptographic authenticity.
 *
 * Concretely, the layer separates seven concerns. Each maps to one or more
 * checks in the result, with a stable machine-readable id:
 *
 *   1. Metadata presence — did the manifest entry ship the fields we need
 *      to even reason about provenance? (sha256_metadata_present,
 *      signature_metadata_present, source_commit_present, file_size_present,
 *      firmware_path_present, artifact_identity_present)
 *
 *   2. Hash integrity metadata — does the entry expose a SHA-256 we can
 *      check the binary against once it has been downloaded?
 *      (sha256_metadata_present)
 *
 *   3. Hash verification after download — IS performed by state.js when the
 *      browser supports SubtleCrypto: the downloaded bytes are hashed and
 *      compared to the manifest's `sha256`. That happens OUTSIDE this
 *      module; the static gate here only verifies the metadata is present.
 *
 *   4. Signature metadata presence — does the entry carry a `signature`
 *      blob? Important: the existing `signature` is a salted SHA-256 with a
 *      publicly-known salt; it is *integrity metadata*, NOT a public-key
 *      signature, and possession of the salt alone is not authentication.
 *      (signature_metadata_present)
 *
 *   5. Actual cryptographic signature verification — NOT IMPLEMENTED. The
 *      browser does not verify the firmware against a pinned trusted public
 *      key. The check `signature_verified` is therefore reported with
 *      `status: 'skip'` so consumers cannot accidentally interpret a `pass`
 *      as cryptographic authenticity.
 *
 *   6. Source provenance — does the entry name the source commit and a
 *      stable, IMMUTABLE source URL (e.g. /commit/<sha>, not /tree/main)?
 *      (source_commit_present, source_url_immutable)
 *
 *   7. Release/changelog completeness — does the build ship a human-authored
 *      changelog appropriate for its channel? (changelog_present)
 *
 * The result is intentionally machine-readable. `report.checks` is an array
 * of `{ id, label, status, severity, detail }` records keyed by stable ids
 * so other systems (UI, diagnostics, release-channel logic) can consume
 * provenance state without parsing strings.
 */

// ---------------------------------------------------------------------------
// Constants and field tables
// ---------------------------------------------------------------------------

export const REQUIRED_PROVENANCE_FIELDS = Object.freeze([
    'sha256',
    'signature',
    'source_commit',
    'file_size',
    'changelog'
]);

// Required fields whose absence is *always* a blocking failure for any
// remotely flashable firmware, regardless of channel. These are the
// primitives we need to even reason about provenance — without them we
// cannot integrity-check the binary or trace it back to a source tree, so
// non-stable channels are not exempt either.
//
// `firmware_path` and `artifact_identity` are also blocking primitives but
// are tracked as separate checks rather than top-level fields.
export const CRITICAL_PROVENANCE_FIELDS = Object.freeze([
    'sha256',
    'signature',
    'source_commit',
    'file_size'
]);

// Stable, machine-readable check IDs. Other systems (UI, diagnostics,
// release-channel logic) MUST consume `report.checks` by these ids; the
// `label` field is human copy and may be reworded without notice.
export const CHECK_IDS = Object.freeze({
    SHA256_METADATA_PRESENT: 'sha256_metadata_present',
    SIGNATURE_METADATA_PRESENT: 'signature_metadata_present',
    SIGNATURE_VERIFIED: 'signature_verified',
    SOURCE_COMMIT_PRESENT: 'source_commit_present',
    SOURCE_URL_IMMUTABLE: 'source_url_immutable',
    FIRMWARE_PATH_PRESENT: 'firmware_path_present',
    ARTIFACT_IDENTITY_PRESENT: 'artifact_identity_present',
    FILE_SIZE_PRESENT: 'file_size_present',
    FILE_SIZE_PLAUSIBLE: 'file_size_plausible',
    CHANGELOG_PRESENT: 'changelog_present',
    LIFECYCLE_STATUS: 'lifecycle_status',
    CHANNEL_ALLOWED_FOR_MODE: 'channel_allowed_for_mode'
});

// Artifact-type taxonomy for size validation. The default is `application`,
// which targets full ESP32-S3 application partitions (~500 KB+).
export const ARTIFACT_TYPES = Object.freeze({
    APPLICATION: 'application',
    RESCUE: 'rescue',
    BOOTLOADER: 'bootloader',
    PARTITION_TABLE: 'partition_table',
    TEST_FIXTURE: 'test_fixture'
});

const KNOWN_ARTIFACT_TYPES = new Set(Object.values(ARTIFACT_TYPES));

// Real ESP32-S3 application partitions are roughly half a megabyte. Anything
// between the placeholder sentinel and this threshold is almost certainly a
// truncated build and gets a blocking warning.
export const MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES = 100 * 1024;

// Sentinel size for the placeholder stubs already committed to the repo
// (18-byte files used for tests and CI). Anything at or below this is
// treated as an intentional placeholder rather than suspicious data.
export const PLACEHOLDER_FIRMWARE_SIZE_BYTES = 64;

// Per-artifact-type minimum plausible size. Bootloaders and partition tables
// are legitimately tiny; full applications and rescue images are not.
export const MIN_PLAUSIBLE_SIZE_BY_ARTIFACT_TYPE = Object.freeze({
    [ARTIFACT_TYPES.APPLICATION]: 100 * 1024,
    [ARTIFACT_TYPES.RESCUE]: 50 * 1024,
    [ARTIFACT_TYPES.BOOTLOADER]: 1024,
    [ARTIFACT_TYPES.PARTITION_TABLE]: 256,
    [ARTIFACT_TYPES.TEST_FIXTURE]: 0
});

const STABLE_CHANNEL_ALIASES = new Set([
    'stable',
    'general',
    'ga',
    'release',
    'prod',
    'production',
    'lts'
]);

// Channels where missing changelog is a non-blocking warning. Users opting
// into preview/beta accept that documentation may be in flight.
const SOFT_CHANGELOG_CHANNELS = new Set([
    'preview',
    'prerelease',
    'beta',
    'rc',
    'candidate'
]);

// Channels where missing changelog is silent. Dev / rescue builds are
// internal/expert tooling and a release-note requirement adds friction
// without protecting any real user.
const PERMISSIVE_CHANGELOG_CHANNELS = new Set([
    'dev',
    'alpha',
    'nightly',
    'canary',
    'experimental',
    'test',
    'rescue'
]);

// Channels that may only be exposed when the wizard is running in
// development/test mode. If the install path is `production` (the default
// public deployment), these channels are themselves a blocking failure.
const DEVELOPMENT_ONLY_CHANNELS = new Set([
    'dev',
    'alpha',
    'nightly',
    'canary',
    'experimental',
    'test'
]);

// Detects auto-synthesised changelog lines historically emitted by
// gen-manifests.py. The shape was always exactly:
//
//   "<Channel> build of Sense360 <Descriptor> v<Version>."
//
// A real human note will not collapse into that single sentence. If the
// changelog is exactly one entry that matches this pattern we treat it as
// effectively missing — a generated changelog proves only that the
// generator ran, not that a human documented the release.
const SYNTH_CHANGELOG_PATTERN = /^(?:stable|general|preview|beta|dev|rescue)\s+build\s+of\s+sense360\s+.+\s+v\d+(?:\.\d+)*\.?$/i;

// Generic boilerplate that should NOT be accepted as a hand-authored
// changelog. Sidecar metadata can otherwise paper over missing provenance
// with filler text like "Initial release.".
const GENERIC_CHANGELOG_FILLERS = [
    /^initial release\.?$/i,
    /^first release\.?$/i,
    /^firmware release\.?$/i,
    /^see release notes\.?$/i,
    /^see release\.?$/i,
    /^tbd\.?$/i,
    /^todo\.?$/i,
    /^n\/?a\.?$/i,
    /^placeholder\.?$/i,
    /^no changes\.?$/i,
    /^nothing to report\.?$/i
];

// URL patterns that point at MUTABLE source references (branches, latest
// release tag, HEAD). These cannot be trusted as provenance evidence — the
// content they refer to changes over time, so they do not pin the build to
// the specific tree it was produced from.
const MUTABLE_SOURCE_URL_PATTERNS = [
    /\/tree\/(?:main|master|develop|dev|trunk|head)(?:\/|$|\?|#)/i,
    /\/blob\/(?:main|master|develop|dev|trunk|head)(?:\/|$|\?|#)/i,
    /\/commits\/(?:main|master|develop|dev|trunk|head)(?:\/|$|\?|#)/i,
    /\/raw\/(?:main|master|develop|dev|trunk|head)(?:\/|$|\?|#)/i,
    /\/releases\/latest(?:\/|$|\?|#)/i,
    /[?&]ref=(?:main|master|develop|dev|trunk|head)(?:&|$)/i
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseChannel(channel) {
    if (!channel && channel !== 0) {
        return '';
    }
    return String(channel).trim().toLowerCase();
}

function isStableChannel(channel) {
    return STABLE_CHANNEL_ALIASES.has(normaliseChannel(channel));
}

function normaliseMode(mode) {
    const key = String(mode || '').trim().toLowerCase();
    if (key === 'development' || key === 'dev' || key === 'debug') {
        return 'development';
    }
    if (key === 'test' || key === 'testing') {
        return 'test';
    }
    return 'production';
}

function normaliseArtifactType(value) {
    const key = String(value || '').trim().toLowerCase();
    if (KNOWN_ARTIFACT_TYPES.has(key)) {
        return key;
    }
    return ARTIFACT_TYPES.APPLICATION;
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
            return 'SHA-256 metadata';
        case 'signature':
            return 'signature metadata';
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

function getFirmwarePath(build) {
    if (!build || typeof build !== 'object') {
        return '';
    }
    if (Array.isArray(build.parts)) {
        for (const part of build.parts) {
            if (part && typeof part.path === 'string' && part.path.trim()) {
                return part.path.trim();
            }
        }
    }
    if (typeof build.path === 'string' && build.path.trim()) {
        return build.path.trim();
    }
    return '';
}

function getArtifactIdentity(build) {
    if (!build || typeof build !== 'object') {
        return '';
    }
    if (typeof build.config_string === 'string' && build.config_string.trim()) {
        return build.config_string.trim();
    }
    const model = typeof build.model === 'string' ? build.model.trim() : '';
    const variant = typeof build.variant === 'string' ? build.variant.trim() : '';
    if (model) {
        return variant ? `${model}/${variant}` : model;
    }
    if (typeof build.firmwareId === 'string' && build.firmwareId.trim()) {
        return build.firmwareId.trim();
    }
    return '';
}

/**
 * Decide how missing/synthesised changelog entries should be treated for a
 * given channel.
 *   - 'fail' = block install (stable channels)
 *   - 'warn' = surface warning, do not block (preview/beta)
 *   - 'allow' = silent, dev/rescue builds
 */
export function changelogSeverityForChannel(channel) {
    const key = normaliseChannel(channel);
    if (STABLE_CHANNEL_ALIASES.has(key)) {
        return 'fail';
    }
    if (PERMISSIVE_CHANGELOG_CHANNELS.has(key)) {
        return 'allow';
    }
    if (SOFT_CHANGELOG_CHANNELS.has(key)) {
        return 'warn';
    }
    // Unknown channel — be cautious and surface a warning rather than silently
    // accepting whatever metadata showed up.
    return 'warn';
}

/**
 * Return true when the only changelog entry matches the historical
 * gen-manifests.py auto-synthesis pattern. Multi-entry changelogs that
 * include the synth line plus real notes are not flagged — only the
 * "generator ran but nobody wrote anything" case.
 */
export function changelogLooksSynthesised(changelog) {
    if (!Array.isArray(changelog) || changelog.length !== 1) {
        return false;
    }
    const entry = changelog[0];
    if (typeof entry !== 'string') {
        return false;
    }
    return SYNTH_CHANGELOG_PATTERN.test(entry.trim());
}

/**
 * Return true when every changelog entry is a generic boilerplate filler
 * (e.g. "Initial release.", "TBD"). Stable builds with only filler text
 * are treated as missing a human-authored changelog.
 */
export function changelogLooksFiller(changelog) {
    if (!Array.isArray(changelog) || changelog.length === 0) {
        return false;
    }
    return changelog.every(entry => {
        if (typeof entry !== 'string') {
            return false;
        }
        const trimmed = entry.trim();
        if (!trimmed) {
            return true;
        }
        return GENERIC_CHANGELOG_FILLERS.some(rx => rx.test(trimmed));
    });
}

/**
 * Return true when the URL points at a mutable reference (branch, HEAD,
 * /releases/latest). These cannot be trusted as provenance evidence — they
 * resolve to different content over time. Returns false for empty input
 * (no URL is not the same thing as a bad URL).
 */
export function isMutableSourceUrl(url) {
    if (typeof url !== 'string') {
        return false;
    }
    const trimmed = url.trim();
    if (!trimmed) {
        return false;
    }
    return MUTABLE_SOURCE_URL_PATTERNS.some(rx => rx.test(trimmed));
}

/**
 * Return true when `url` references the given source `commit` (full SHA or
 * the typical 7+ char short prefix used by GitHub-style commit URLs).
 */
export function sourceUrlMatchesCommit(url, commit) {
    if (typeof url !== 'string' || typeof commit !== 'string') {
        return false;
    }
    const u = url.trim();
    const c = commit.trim();
    if (!u || !c) {
        return false;
    }
    if (u.includes(c)) {
        return true;
    }
    if (c.length >= 7) {
        return u.includes(c.slice(0, 7));
    }
    return false;
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

// ---------------------------------------------------------------------------
// Check builders
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProvenanceCheck
 * @property {string} id Stable machine-readable id.
 * @property {string} label Human copy. May change without notice.
 * @property {'pass'|'warn'|'fail'|'skip'} status Result of this check.
 * @property {'block'|'warn'|'info'} severity How a fail is treated by the gate.
 * @property {string} detail One-line human explanation.
 */

function makeCheck(id, label, status, severity, detail) {
    return { id, label, status, severity, detail };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate the provenance metadata for a single manifest build entry.
 *
 * @param {object} build A `manifest.json` `builds[]` entry.
 * @param {object} [options]
 * @param {'production'|'development'|'test'} [options.mode] Trust-mode for
 *     the validation. In `production`, dev/test channels and mutable source
 *     URLs are blocking. In `development`, they are warnings. Defaults to
 *     `production`.
 * @param {number} [options.minPlausibleSize] Override the suspicious-size threshold
 *     (used only when no `artifact_type` is set on the build).
 * @param {number} [options.placeholderSize] Override the placeholder sentinel.
 * @param {boolean} [options.allowPlaceholderSize] When true, placeholder-sized
 *     binaries (<= sentinel) are not flagged at all. Defaults to true so the
 *     fixture binaries shipped with the repo do not trip the install gate.
 * @returns {object} Validation report. See `ProvenanceCheck` for the shape
 *     of each entry in `report.checks`. Top-level fields:
 *     - `ok` (bool)
 *     - `status` ('pass'|'warn'|'fail')
 *     - `blocking` (bool) true when any check failed with severity 'block'
 *     - `checks` (ProvenanceCheck[]) stable machine-readable shape
 *     - `failures` (Array<{id,label,detail}>) blocking checks only
 *     - `warnings` (string[]) human-readable, non-blocking warnings
 *     - `blockingReasons` (string[]) human-readable failure summaries
 *     - `missingRequired` (string[]) legacy back-compat
 *     - `verifiedFields` (string[]) legacy back-compat
 *     - `summary` (string) one-line overall summary
 */
export function validateFirmwareProvenance(build, options = {}) {
    const mode = normaliseMode(options.mode);
    const placeholderSize = Number.isFinite(options.placeholderSize)
        ? options.placeholderSize
        : PLACEHOLDER_FIRMWARE_SIZE_BYTES;
    const allowPlaceholderSize = options.allowPlaceholderSize !== false;
    const localOnly = build?.local_only === true;
    const artifactType = normaliseArtifactType(build?.artifact_type);
    // Test fixtures and bootloader-class artifacts have their own minima; for
    // application/rescue we use the per-type table with a manual override
    // available via `options.minPlausibleSize` for back-compat.
    const minByType = MIN_PLAUSIBLE_SIZE_BY_ARTIFACT_TYPE[artifactType];
    const minPlausibleSize = Number.isFinite(options.minPlausibleSize)
        ? options.minPlausibleSize
        : (Number.isFinite(minByType) ? minByType : MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES);

    const channel = normaliseChannel(build?.channel);
    const stable = isStableChannel(channel);
    const deprecated = build?.deprecated === true;
    const changelogSeverity = changelogSeverityForChannel(channel);

    /** @type {ProvenanceCheck[]} */
    const checks = [];

    // 1. Critical metadata presence -----------------------------------------
    // These primitives are blocking for any remotely flashable firmware,
    // regardless of channel — without them we cannot integrity-check the
    // binary or trace it back to a tree.
    const fieldChecks = [
        ['sha256', CHECK_IDS.SHA256_METADATA_PRESENT, 'SHA-256 metadata'],
        ['signature', CHECK_IDS.SIGNATURE_METADATA_PRESENT, 'Signature metadata'],
        ['source_commit', CHECK_IDS.SOURCE_COMMIT_PRESENT, 'Source commit'],
        ['file_size', CHECK_IDS.FILE_SIZE_PRESENT, 'Declared file size']
    ];

    fieldChecks.forEach(([field, id, label]) => {
        const present = fieldIsPresent(build, field);
        // Test fixtures don't need a meaningful file_size and are exempt;
        // every other primitive is still required even for fixtures so that
        // bench/test runs catch metadata regressions.
        const exempt = field === 'file_size' && artifactType === ARTIFACT_TYPES.TEST_FIXTURE;
        const severity = (localOnly && field !== 'sha256' && field !== 'signature')
            ? 'warn'
            : 'block';
        if (present) {
            checks.push(makeCheck(id, label, 'pass', severity,
                `${label} present in manifest entry.`));
        } else if (exempt) {
            checks.push(makeCheck(id, label, 'skip', 'info',
                `${label} skipped for test_fixture artifact.`));
        } else {
            checks.push(makeCheck(id, label, 'fail', severity,
                `${label} missing from manifest entry.`));
        }
    });

    // 2. Firmware path + artifact identity (also blocking primitives) -------
    const firmwarePath = getFirmwarePath(build);
    checks.push(firmwarePath
        ? makeCheck(CHECK_IDS.FIRMWARE_PATH_PRESENT, 'Firmware path', 'pass', 'block',
            'Firmware URL/path present in manifest entry.')
        : makeCheck(CHECK_IDS.FIRMWARE_PATH_PRESENT, 'Firmware path', 'fail', 'block',
            'Firmware URL/path missing from manifest entry.'));

    const artifactIdentity = getArtifactIdentity(build);
    checks.push(artifactIdentity
        ? makeCheck(CHECK_IDS.ARTIFACT_IDENTITY_PRESENT, 'Artifact identity', 'pass', 'block',
            `Artifact identity present (${artifactIdentity}).`)
        : makeCheck(CHECK_IDS.ARTIFACT_IDENTITY_PRESENT, 'Artifact identity', 'fail', 'block',
            'Artifact identity (config_string/model) missing from manifest entry.'));

    // 3. Channel allowed for the active mode --------------------------------
    if (DEVELOPMENT_ONLY_CHANNELS.has(channel)) {
        if (mode === 'production') {
            checks.push(makeCheck(
                CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE,
                'Channel allowed for mode',
                'fail',
                'block',
                `Channel '${channel}' is only available in development/test mode.`
            ));
        } else {
            checks.push(makeCheck(
                CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE,
                'Channel allowed for mode',
                'pass',
                'info',
                `Channel '${channel}' is permitted in ${mode} mode.`
            ));
        }
    } else {
        checks.push(makeCheck(
            CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE,
            'Channel allowed for mode',
            'pass',
            'info',
            channel
                ? `Channel '${channel}' is allowed.`
                : 'No channel declared; treated as default.'
        ));
    }

    // 4. Source URL immutability --------------------------------------------
    const sourceUrl = typeof build?.source_url === 'string' ? build.source_url.trim() : '';
    const sourceCommit = typeof build?.source_commit === 'string' ? build.source_commit.trim() : '';
    if (!sourceUrl) {
        checks.push(makeCheck(
            CHECK_IDS.SOURCE_URL_IMMUTABLE,
            'Source URL pinned to commit',
            'skip',
            'info',
            'No source_url declared.'
        ));
    } else if (isMutableSourceUrl(sourceUrl)) {
        const severity = mode === 'production' ? 'block' : 'warn';
        checks.push(makeCheck(
            CHECK_IDS.SOURCE_URL_IMMUTABLE,
            'Source URL pinned to commit',
            'fail',
            severity,
            `source_url '${sourceUrl}' references a mutable branch/tag (e.g. /tree/main, /releases/latest); pin to a commit SHA.`
        ));
    } else if (sourceCommit && !sourceUrlMatchesCommit(sourceUrl, sourceCommit)) {
        const severity = mode === 'production' ? 'block' : 'warn';
        checks.push(makeCheck(
            CHECK_IDS.SOURCE_URL_IMMUTABLE,
            'Source URL pinned to commit',
            'fail',
            severity,
            `source_url '${sourceUrl}' does not contain the source_commit (${sourceCommit.slice(0, 12)}…).`
        ));
    } else {
        checks.push(makeCheck(
            CHECK_IDS.SOURCE_URL_IMMUTABLE,
            'Source URL pinned to commit',
            'pass',
            'info',
            sourceCommit
                ? 'Source URL pins to the recorded source commit.'
                : 'Source URL does not reference a mutable branch/tag.'
        ));
    }

    // 5. Cryptographic signature verification (NOT IMPLEMENTED) -------------
    // We always emit this check so consumers see explicitly that browser-side
    // signature verification is out of scope. status='skip' so a 'pass' on
    // signature_metadata_present cannot be misread as authenticity.
    checks.push(makeCheck(
        CHECK_IDS.SIGNATURE_VERIFIED,
        'Cryptographic signature verification',
        'skip',
        'info',
        'Browser-side signature verification is not yet implemented. Signature metadata presence does not by itself prove cryptographic authenticity.'
    ));

    // 6. File size sanity ---------------------------------------------------
    const sizeReport = classifySize(build?.file_size, { minPlausibleSize, placeholderSize });
    if (artifactType === ARTIFACT_TYPES.TEST_FIXTURE && mode !== 'production') {
        checks.push(makeCheck(
            CHECK_IDS.FILE_SIZE_PLAUSIBLE,
            'File size sanity',
            'pass',
            'info',
            'Test fixture: any size accepted in development/test mode.'
        ));
    } else if (sizeReport.classification === 'plausible') {
        checks.push(makeCheck(
            CHECK_IDS.FILE_SIZE_PLAUSIBLE,
            'File size sanity',
            'pass',
            'block',
            `File size ${sizeReport.value} bytes is within plausible firmware range.`
        ));
    } else if (sizeReport.classification === 'placeholder') {
        if (allowPlaceholderSize) {
            checks.push(makeCheck(
                CHECK_IDS.FILE_SIZE_PLAUSIBLE,
                'File size sanity',
                'pass',
                'info',
                `File size ${sizeReport.value} bytes is a known placeholder fixture.`
            ));
        } else {
            checks.push(makeCheck(
                CHECK_IDS.FILE_SIZE_PLAUSIBLE,
                'File size sanity',
                'warn',
                'warn',
                `File size ${sizeReport.value} bytes looks like a placeholder build.`
            ));
        }
    } else if (sizeReport.classification === 'suspicious') {
        checks.push(makeCheck(
            CHECK_IDS.FILE_SIZE_PLAUSIBLE,
            'File size sanity',
            'fail',
            'block',
            `File size ${sizeReport.value} bytes is below the ${sizeReport.threshold}-byte plausible threshold for ${artifactType}; refusing to install a suspiciously small binary.`
        ));
    } else {
        checks.push(makeCheck(
            CHECK_IDS.FILE_SIZE_PLAUSIBLE,
            'File size sanity',
            'fail',
            'block',
            'File size could not be determined.'
        ));
    }

    // 7. Changelog ----------------------------------------------------------
    const rawChangelog = build?.changelog;
    const hasChangelog = fieldIsPresent(build, 'changelog');
    const synthesised = changelogLooksSynthesised(rawChangelog);
    const filler = changelogLooksFiller(rawChangelog);
    const changelogMissing = !hasChangelog || synthesised || filler;
    if (!changelogMissing) {
        checks.push(makeCheck(
            CHECK_IDS.CHANGELOG_PRESENT,
            'Changelog',
            'pass',
            changelogSeverity === 'fail' ? 'block' : 'warn',
            'Human-authored changelog provided.'
        ));
    } else {
        let detail;
        if (synthesised) {
            detail = 'Changelog appears auto-generated; a human-authored entry is required.';
        } else if (filler) {
            detail = 'Changelog only contains generic boilerplate (e.g. "Initial release"); a substantive entry is required.';
        } else if (changelogSeverity === 'allow') {
            detail = 'No changelog (allowed for this channel).';
        } else if (changelogSeverity === 'warn') {
            detail = 'No human-authored changelog (warning).';
        } else {
            detail = 'No human-authored changelog (required).';
        }
        if (changelogSeverity === 'allow') {
            checks.push(makeCheck(
                CHECK_IDS.CHANGELOG_PRESENT,
                'Changelog',
                'pass',
                'info',
                synthesised || filler
                    ? 'Auto-generated/filler changelog tolerated for this channel.'
                    : detail
            ));
        } else if (changelogSeverity === 'warn') {
            checks.push(makeCheck(
                CHECK_IDS.CHANGELOG_PRESENT,
                'Changelog',
                'fail',
                'warn',
                detail
            ));
        } else {
            checks.push(makeCheck(
                CHECK_IDS.CHANGELOG_PRESENT,
                'Changelog',
                'fail',
                'block',
                detail
            ));
        }
    }

    // 8. Lifecycle status ---------------------------------------------------
    if (deprecated) {
        const reason = (typeof build?.deprecation_reason === 'string' && build.deprecation_reason.trim())
            ? build.deprecation_reason.trim()
            : '';
        if (reason) {
            checks.push(makeCheck(
                CHECK_IDS.LIFECYCLE_STATUS,
                'Lifecycle status',
                'warn',
                'warn',
                `Marked deprecated. Reason: ${reason}`
            ));
        } else {
            // Deprecated without a reason is a content-quality failure that
            // warns at the runtime gate (the manifest gate fails it harder).
            checks.push(makeCheck(
                CHECK_IDS.LIFECYCLE_STATUS,
                'Lifecycle status',
                'fail',
                'warn',
                'Marked deprecated without a deprecation_reason.'
            ));
        }
    } else {
        checks.push(makeCheck(
            CHECK_IDS.LIFECYCLE_STATUS,
            'Lifecycle status',
            'pass',
            'info',
            'Build is not marked deprecated.'
        ));
    }

    // ---------------------------------------------------------------------
    // Aggregate
    // ---------------------------------------------------------------------
    const failures = checks
        .filter(check => check.status === 'fail' && check.severity === 'block')
        .map(check => ({ id: check.id, label: check.label, detail: check.detail }));

    const warningCheckDetails = checks
        .filter(check => (check.status === 'fail' && check.severity === 'warn')
            || (check.status === 'warn'))
        .map(check => check.detail);

    const blockingReasons = failures.map(f => f.detail);

    // ----- legacy back-compat fields ---------------------------------------
    const missingRequired = [];
    const verifiedFields = [];

    const legacyFieldByCheckId = {
        [CHECK_IDS.SHA256_METADATA_PRESENT]: 'sha256',
        [CHECK_IDS.SIGNATURE_METADATA_PRESENT]: 'signature',
        [CHECK_IDS.SOURCE_COMMIT_PRESENT]: 'source_commit',
        [CHECK_IDS.FILE_SIZE_PRESENT]: 'file_size'
    };
    checks.forEach(check => {
        const legacyField = legacyFieldByCheckId[check.id];
        if (!legacyField) {
            return;
        }
        if (check.status === 'pass') {
            verifiedFields.push(legacyField);
        } else if (check.status === 'fail') {
            missingRequired.push(legacyField);
        }
    });
    const changelogCheck = checks.find(c => c.id === CHECK_IDS.CHANGELOG_PRESENT);
    if (changelogCheck) {
        if (changelogCheck.status === 'pass') {
            verifiedFields.push('changelog');
        } else if (changelogCheck.status === 'fail') {
            missingRequired.push('changelog');
        }
    }
    const sizeCheck = checks.find(c => c.id === CHECK_IDS.FILE_SIZE_PLAUSIBLE);
    if (sizeCheck && sizeCheck.status === 'pass'
            && sizeReport.classification === 'plausible') {
        verifiedFields.push('file_size_plausible');
    }

    const blocking = failures.length > 0;
    let status;
    if (blocking) {
        status = 'fail';
    } else if (warningCheckDetails.length > 0) {
        status = 'warn';
    } else {
        status = 'pass';
    }

    let summary;
    if (status === 'fail') {
        summary = blockingReasons[0];
    } else if (status === 'warn') {
        summary = warningCheckDetails[0];
    } else {
        summary = stable
            ? 'Provenance metadata verified for stable firmware.'
            : 'Provenance metadata verified.';
    }

    return {
        ok: !blocking,
        status,
        blocking,
        checks,
        failures,
        warnings: warningCheckDetails,
        blockingReasons,
        channel,
        stable,
        deprecated,
        artifactType,
        mode,
        missingRequired,
        verifiedFields,
        summary,
        sizeClassification: sizeReport.classification,
        sizeBytes: sizeReport.value ?? null,
        changelogSeverity,
        changelogSynthesised: synthesised,
        changelogFiller: filler,
        sourceUrlMutable: isMutableSourceUrl(sourceUrl),
        localOnly
    };
}

/**
 * Filter that excludes deprecated builds from default-selection candidates.
 * Keeps the original ordering otherwise.
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
 * `key` is the legacy stable identifier preserved for back-compat — newer
 * consumers should read `report.checks` instead.
 */
export function describeVerificationChecks(build, options = {}) {
    const report = validateFirmwareProvenance(build, options);
    const legacyKeyByCheckId = {
        [CHECK_IDS.SHA256_METADATA_PRESENT]: 'sha256',
        [CHECK_IDS.SIGNATURE_METADATA_PRESENT]: 'signature',
        [CHECK_IDS.SOURCE_COMMIT_PRESENT]: 'source_commit',
        [CHECK_IDS.FILE_SIZE_PRESENT]: 'file_size',
        [CHECK_IDS.FILE_SIZE_PLAUSIBLE]: 'file_size_plausible',
        [CHECK_IDS.CHANGELOG_PRESENT]: 'changelog',
        [CHECK_IDS.LIFECYCLE_STATUS]: 'deprecated',
        [CHECK_IDS.SOURCE_URL_IMMUTABLE]: 'source_url_immutable',
        [CHECK_IDS.FIRMWARE_PATH_PRESENT]: 'firmware_path',
        [CHECK_IDS.ARTIFACT_IDENTITY_PRESENT]: 'artifact_identity',
        [CHECK_IDS.SIGNATURE_VERIFIED]: 'signature_verified',
        [CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE]: 'channel_allowed'
    };
    const entries = report.checks.map(check => ({
        key: legacyKeyByCheckId[check.id] || check.id,
        id: check.id,
        label: check.label,
        ok: check.status === 'pass' || check.status === 'skip',
        status: check.status,
        severity: check.severity,
        detail: check.detail
    }));
    return { entries, report };
}
