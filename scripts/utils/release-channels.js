/**
 * @fileoverview Firmware release-channel taxonomy and presentation policy.
 *
 * The wizard surfaces firmware to users across several release tiers. Each
 * tier has a different audience, default-selection eligibility, visibility
 * rule, and acknowledgement requirement. Centralising those rules here keeps
 * the install gate (`state.js`) and the tests honest:
 *
 *   stable      Recommended for production. Default when valid + compatible.
 *   beta        Pre-release for testers. Visible warning + acknowledgement.
 *   preview     Experimental. Stronger warning + acknowledgement.
 *   development Internal only. Hidden unless development mode is enabled.
 *   rescue      Recovery / unbrick path. Hidden unless recovery mode entered.
 *   deprecated  Lifecycle-retired. Never default. Acknowledgement required.
 *   recommended Not a channel — a presentation flag set on the default pick.
 *
 * The module is pure data + helpers: no DOM, no state. Anything UI- or
 * state-dependent (default selection, install gating) consumes the policy
 * returned here.
 */

const STABLE_ALIASES = Object.freeze(['stable', 'general', 'ga', 'release', 'prod', 'production', 'lts']);
const BETA_ALIASES = Object.freeze(['beta', 'rc', 'candidate']);
const PREVIEW_ALIASES = Object.freeze(['preview', 'prerelease']);
const DEVELOPMENT_ALIASES = Object.freeze(['dev', 'development', 'alpha', 'nightly', 'canary', 'experimental']);
const RESCUE_ALIASES = Object.freeze(['rescue', 'recovery', 'rollback', 'restore', 'unbrick']);

const ALIAS_TO_CANONICAL = (() => {
    const map = new Map();
    STABLE_ALIASES.forEach(name => map.set(name, 'stable'));
    BETA_ALIASES.forEach(name => map.set(name, 'beta'));
    PREVIEW_ALIASES.forEach(name => map.set(name, 'preview'));
    DEVELOPMENT_ALIASES.forEach(name => map.set(name, 'development'));
    RESCUE_ALIASES.forEach(name => map.set(name, 'rescue'));
    return map;
})();

export const RELEASE_CHANNELS = Object.freeze(['stable', 'beta', 'preview', 'development', 'rescue']);

/**
 * Per-channel presentation + policy. Consumers MUST treat the structure as
 * read-only — the data is frozen.
 *
 * Field meanings:
 *   key                    Canonical channel name.
 *   label                  User-visible badge text.
 *   shortLabel             Compact label used in selectors.
 *   tone                   'positive' | 'info' | 'warning' | 'danger' — controls colour swatch.
 *   description            One-line audience description.
 *   warning                User-facing warning text. Empty when none.
 *   requiresAcknowledgement Whether install is gated behind explicit consent.
 *   acknowledgementLabel   Checkbox text shown when consent is required.
 *   defaultSelectable      Whether builds on this channel are eligible to be default-picked.
 *   hiddenByDefault        Whether builds on this channel must be filtered out of the
 *                          normal install path. Usage modes can re-enable them.
 *   reveal                 Mode key required to reveal hidden builds:
 *                            'recovery' for rescue, 'development' for development.
 *   priority               Sort priority (lower = preferred). Used by sortBuildsByChannelAndVersion.
 *   notesFallback          Release-notes fallback message when notes are missing.
 */
const CHANNEL_POLICY_DATA = {
    stable: {
        key: 'stable',
        label: 'Stable',
        shortLabel: 'Stable',
        tone: 'positive',
        description: 'Recommended for production deployments with full validation.',
        warning: '',
        requiresAcknowledgement: false,
        acknowledgementLabel: '',
        defaultSelectable: true,
        hiddenByDefault: false,
        reveal: null,
        priority: 0,
        notesFallback: 'Stable release notes are not available for this firmware version yet.'
    },
    beta: {
        key: 'beta',
        label: 'Beta',
        shortLabel: 'Beta',
        tone: 'info',
        description: 'Release candidate builds for broader testing ahead of stable rollout.',
        warning: 'Beta firmware is intended for testers. Functionality may regress between builds; revert to a stable build if issues appear.',
        requiresAcknowledgement: true,
        acknowledgementLabel: 'I understand this is a beta build and accept that it may be unstable.',
        defaultSelectable: false,
        hiddenByDefault: false,
        reveal: null,
        priority: 2,
        notesFallback: 'Beta release notes are not yet available for this firmware version.'
    },
    preview: {
        key: 'preview',
        label: 'Preview',
        shortLabel: 'Preview',
        tone: 'warning',
        description: 'Experimental early-access builds for evaluating upcoming capabilities with limited validation.',
        warning: 'Preview firmware is experimental. Features may break, data may be lost, and downgrade is not guaranteed. Do not install on production hubs.',
        requiresAcknowledgement: true,
        acknowledgementLabel: 'I understand this is an experimental preview build and accept the risk of running it.',
        defaultSelectable: false,
        hiddenByDefault: false,
        reveal: null,
        priority: 1,
        notesFallback: 'Preview release notes are not yet available for this firmware version.'
    },
    development: {
        key: 'development',
        label: 'Development',
        shortLabel: 'Dev',
        tone: 'danger',
        description: 'Internal development build for engineering and integration testing only.',
        warning: 'Development firmware is intended for internal testing. It is unsigned by the release pipeline, can be unstable, and is not supported.',
        requiresAcknowledgement: true,
        acknowledgementLabel: 'I am an internal/advanced user and accept that this development build is unsupported.',
        defaultSelectable: false,
        hiddenByDefault: true,
        reveal: 'development',
        priority: 3,
        notesFallback: 'Development build notes are not available for this firmware version.'
    },
    rescue: {
        key: 'rescue',
        label: 'Recovery',
        shortLabel: 'Recovery',
        tone: 'danger',
        description: 'Recovery firmware used to unbrick a hub or roll back to a known-good factory image.',
        warning: 'Recovery firmware is for unbricking, factory restore, or rollback only. Installing it will overwrite your current configuration; do not flash it as a regular update.',
        requiresAcknowledgement: false,
        acknowledgementLabel: '',
        defaultSelectable: false,
        hiddenByDefault: true,
        reveal: 'recovery',
        priority: 4,
        notesFallback: 'Recovery firmware notes are not available.'
    }
};

const FROZEN_CHANNEL_POLICY = Object.freeze(
    Object.fromEntries(
        Object.entries(CHANNEL_POLICY_DATA).map(([key, value]) => [key, Object.freeze({ ...value })])
    )
);

const DEFAULT_POLICY = Object.freeze({
    key: 'unknown',
    label: 'Firmware Build',
    shortLabel: 'Build',
    tone: 'info',
    description: 'Details for this firmware build.',
    warning: '',
    requiresAcknowledgement: false,
    acknowledgementLabel: '',
    defaultSelectable: false,
    hiddenByDefault: false,
    reveal: null,
    priority: 99,
    notesFallback: 'No release notes available for this firmware version.'
});

const DEPRECATED_BADGE = Object.freeze({
    key: 'deprecated',
    label: 'Deprecated',
    tone: 'danger',
    description: 'This firmware build has been superseded and is no longer recommended.',
    warning: 'This firmware build is deprecated. Install only if you have a specific reason to do so; new deployments should pick a current stable build instead.',
    requiresAcknowledgement: true,
    acknowledgementLabel: 'I understand this firmware is deprecated and accept the risk of installing it.'
});

const RECOMMENDED_BADGE = Object.freeze({
    key: 'recommended',
    label: 'Recommended',
    tone: 'positive',
    description: 'Selected by default because it is the latest stable build for this configuration.'
});

/**
 * Normalise any channel name (synonym, mixed case, whitespace) to the
 * canonical taxonomy key. Returns 'unknown' for unrecognised values so the
 * caller can decide how to surface them — historically we have been cautious
 * with unknown channels rather than silently treating them as stable.
 */
export function normaliseReleaseChannel(channel) {
    if (channel === null || channel === undefined) {
        return 'unknown';
    }
    const key = String(channel).trim().toLowerCase();
    if (!key) {
        return 'unknown';
    }
    return ALIAS_TO_CANONICAL.get(key) || 'unknown';
}

/**
 * Return the immutable policy object for a given channel name (alias-aware).
 * Returns the DEFAULT_POLICY when the channel is unknown.
 */
export function getChannelPolicy(channel) {
    const key = normaliseReleaseChannel(channel);
    return FROZEN_CHANNEL_POLICY[key] || DEFAULT_POLICY;
}

/**
 * True when the channel is known to the wizard. Convenience wrapper for tests
 * and validation pipelines.
 */
export function isKnownChannel(channel) {
    return normaliseReleaseChannel(channel) !== 'unknown';
}

/**
 * True when the channel is one of the stable aliases. Mirrors the predicate
 * already used by firmware-provenance.js.
 */
export function isStableChannel(channel) {
    return normaliseReleaseChannel(channel) === 'stable';
}

/**
 * Build presentation badges for a firmware entry.
 *
 * Returns an array `{ key, label, tone, description }` ordered:
 *   1. The channel badge (always present).
 *   2. A `recommended` badge if the build is the auto-selected default.
 *   3. A `deprecated` badge if the build is lifecycle-retired.
 *
 * Callers can render any prefix of the array; the channel badge is the
 * primary identifier so it always comes first.
 */
export function getFirmwareBadges(build, { recommended = false } = {}) {
    if (!build || typeof build !== 'object') {
        return [];
    }
    const policy = getChannelPolicy(build.channel);
    const badges = [{
        key: policy.key,
        label: policy.label,
        tone: policy.tone,
        description: policy.description
    }];
    if (recommended) {
        badges.push({ ...RECOMMENDED_BADGE });
    }
    if (build.deprecated === true) {
        badges.push({
            ...DEPRECATED_BADGE,
            description: build.deprecation_reason
                ? `Deprecated: ${build.deprecation_reason}`
                : DEPRECATED_BADGE.description
        });
    }
    return badges;
}

/**
 * Compute the warning copy a user must see before flashing a given build.
 * Returns an array of `{ key, severity, message }` where severity is one of
 * 'info' | 'warning' | 'danger' so the UI can colour each block consistently.
 *
 * - Stable, valid builds return [].
 * - Beta / preview / dev / rescue add their channel warning.
 * - Deprecated adds the deprecated warning regardless of channel.
 */
export function getFirmwareWarnings(build) {
    if (!build || typeof build !== 'object') {
        return [];
    }
    const warnings = [];
    const policy = getChannelPolicy(build.channel);
    if (policy.warning) {
        warnings.push({
            key: `channel:${policy.key}`,
            severity: policy.tone === 'positive' ? 'info' : policy.tone,
            message: policy.warning
        });
    }
    if (build.deprecated === true) {
        const reason = build.deprecation_reason
            ? ` Reason: ${build.deprecation_reason}`
            : '';
        warnings.push({
            key: 'deprecated',
            severity: 'warning',
            message: `${DEPRECATED_BADGE.warning}${reason}`
        });
    }
    return warnings;
}

/**
 * Return all acknowledgements that must be checked before install can proceed
 * for a given build. Each entry is `{ key, label, channel }`.
 *
 * - Stable builds return [].
 * - Beta / preview / development each contribute one acknowledgement.
 * - Deprecated builds always require a separate acknowledgement on top of any
 *   channel acknowledgement.
 * - Rescue does not require acknowledgement — entering recovery mode is itself
 *   the consent gesture, and the warning copy is shown to confirm intent.
 */
export function getRequiredAcknowledgements(build) {
    if (!build || typeof build !== 'object') {
        return [];
    }
    const acknowledgements = [];
    const policy = getChannelPolicy(build.channel);
    if (policy.requiresAcknowledgement && policy.acknowledgementLabel) {
        acknowledgements.push({
            key: `channel:${policy.key}`,
            label: policy.acknowledgementLabel,
            channel: policy.key
        });
    }
    if (build.deprecated === true) {
        acknowledgements.push({
            key: 'deprecated',
            label: DEPRECATED_BADGE.acknowledgementLabel,
            channel: policy.key
        });
    }
    return acknowledgements;
}

/**
 * Filter a list of builds to those visible in a given mode.
 *
 * Modes:
 *   'normal'      — production install path. Hides development + rescue.
 *   'recovery'    — recovery / rollback path. Reveals rescue. Still hides dev.
 *   'development' — internal/debug path. Reveals development. Still hides rescue.
 *   'all'         — show every build (used by diagnostics + tests).
 */
export function filterBuildsForMode(builds, mode = 'normal') {
    if (!Array.isArray(builds)) {
        return [];
    }
    if (mode === 'all') {
        return builds.slice();
    }
    return builds.filter(build => isBuildVisibleInMode(build, mode));
}

/**
 * True when a single build is visible in the requested mode. Builds without
 * a recognised channel pass through (we surface unknown channels rather than
 * silently dropping them, but they are flagged via getChannelPolicy).
 */
export function isBuildVisibleInMode(build, mode = 'normal') {
    if (!build || typeof build !== 'object') {
        return false;
    }
    if (mode === 'all') {
        return true;
    }
    const policy = getChannelPolicy(build.channel);
    if (!policy.hiddenByDefault) {
        return true;
    }
    if (mode === 'recovery' && policy.reveal === 'recovery') {
        return true;
    }
    if (mode === 'development' && policy.reveal === 'development') {
        return true;
    }
    return false;
}

/**
 * Pick the default firmware build from a list, applying:
 *   1. Mode visibility filter.
 *   2. Default-selectable filter (no beta/preview/dev/rescue).
 *   3. Deprecated filter (never auto-pick a deprecated build).
 *
 * The first build that satisfies all three wins; sort order from the caller
 * is respected. Returns `null` if no candidate exists, in which case the
 * caller should fall back to the first visible build (the firmware version
 * dropdown still shows non-default entries the user can select manually).
 */
export function pickDefaultBuild(builds, { mode = 'normal' } = {}) {
    if (!Array.isArray(builds) || builds.length === 0) {
        return null;
    }
    const visible = filterBuildsForMode(builds, mode);
    const eligible = visible.find(build => {
        if (!build || build.deprecated === true) {
            return false;
        }
        return getChannelPolicy(build.channel).defaultSelectable;
    });
    return eligible || null;
}

/**
 * Sort priority lookup. Lower values appear first when the dropdown is
 * sorted by channel + version. `state.js` already implements its own sort
 * but consumes this priority via the policy data so the two stay in sync.
 */
export function getChannelPriority(channel) {
    return getChannelPolicy(channel).priority;
}

export const __testHelpers = Object.freeze({
    DEPRECATED_BADGE,
    RECOMMENDED_BADGE,
    DEFAULT_POLICY
});
