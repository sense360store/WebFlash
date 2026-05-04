import { describe, expect, test } from '@jest/globals';
import {
    RELEASE_CHANNELS,
    normaliseReleaseChannel,
    getChannelPolicy,
    isStableChannel,
    isKnownChannel,
    getFirmwareBadges,
    getFirmwareWarnings,
    getRequiredAcknowledgements,
    filterBuildsForMode,
    isBuildVisibleInMode,
    pickDefaultBuild,
    getChannelPriority
} from '../scripts/utils/release-channels.js';

const STABLE_BUILD = Object.freeze({
    firmwareId: 'fw-stable',
    channel: 'stable',
    version: '2.0.0',
    deprecated: false
});

const BETA_BUILD = Object.freeze({
    firmwareId: 'fw-beta',
    channel: 'beta',
    version: '2.1.0',
    deprecated: false
});

const PREVIEW_BUILD = Object.freeze({
    firmwareId: 'fw-preview',
    channel: 'preview',
    version: '3.0.0-rc.1',
    deprecated: false
});

const DEV_BUILD = Object.freeze({
    firmwareId: 'fw-dev',
    channel: 'dev',
    version: '99.0.0',
    deprecated: false
});

const RESCUE_BUILD = Object.freeze({
    firmwareId: 'fw-rescue',
    channel: 'rescue',
    version: '1.0.0',
    deprecated: false
});

const DEPRECATED_STABLE = Object.freeze({
    firmwareId: 'fw-stable-old',
    channel: 'stable',
    version: '1.0.0',
    deprecated: true,
    deprecation_reason: 'Superseded by v2.0.0.'
});

describe('release-channels — taxonomy', () => {
    test('exports the canonical channel list', () => {
        expect(RELEASE_CHANNELS).toEqual(['stable', 'beta', 'preview', 'development', 'rescue']);
    });

    test('normalises common synonyms to canonical keys', () => {
        expect(normaliseReleaseChannel('stable')).toBe('stable');
        expect(normaliseReleaseChannel('GA')).toBe('stable');
        expect(normaliseReleaseChannel('General')).toBe('stable');
        expect(normaliseReleaseChannel('release')).toBe('stable');
        expect(normaliseReleaseChannel('rc')).toBe('beta');
        expect(normaliseReleaseChannel('candidate')).toBe('beta');
        expect(normaliseReleaseChannel('prerelease')).toBe('preview');
        expect(normaliseReleaseChannel('alpha')).toBe('development');
        expect(normaliseReleaseChannel('nightly')).toBe('development');
        expect(normaliseReleaseChannel('rescue')).toBe('rescue');
        expect(normaliseReleaseChannel('recovery')).toBe('rescue');
    });

    test('isStableChannel only accepts stable aliases', () => {
        expect(isStableChannel('stable')).toBe(true);
        expect(isStableChannel('GA')).toBe(true);
        expect(isStableChannel('beta')).toBe(false);
        expect(isStableChannel('preview')).toBe(false);
        expect(isStableChannel('rescue')).toBe(false);
    });

    test('isKnownChannel rejects unknown channels', () => {
        expect(isKnownChannel('stable')).toBe(true);
        expect(isKnownChannel('beta')).toBe(true);
        expect(isKnownChannel('made-up')).toBe(false);
        expect(isKnownChannel('')).toBe(false);
        expect(isKnownChannel(null)).toBe(false);
    });

    test('getChannelPolicy returns frozen policy for each channel', () => {
        const stable = getChannelPolicy('stable');
        expect(stable.label).toBe('Stable');
        expect(stable.tone).toBe('positive');
        expect(stable.requiresAcknowledgement).toBe(false);
        expect(stable.defaultSelectable).toBe(true);
        expect(stable.hiddenByDefault).toBe(false);

        const beta = getChannelPolicy('beta');
        expect(beta.label).toBe('Beta');
        expect(beta.requiresAcknowledgement).toBe(true);
        expect(beta.defaultSelectable).toBe(false);

        const preview = getChannelPolicy('preview');
        expect(preview.tone).toBe('warning');
        expect(preview.requiresAcknowledgement).toBe(true);

        const dev = getChannelPolicy('dev');
        expect(dev.tone).toBe('danger');
        expect(dev.hiddenByDefault).toBe(true);
        expect(dev.reveal).toBe('development');

        const rescue = getChannelPolicy('rescue');
        expect(rescue.label).toBe('Recovery');
        expect(rescue.hiddenByDefault).toBe(true);
        expect(rescue.reveal).toBe('recovery');
    });

    test('getChannelPriority orders channels with stable first', () => {
        expect(getChannelPriority('stable')).toBe(0);
        expect(getChannelPriority('preview')).toBe(1);
        expect(getChannelPriority('beta')).toBe(2);
        expect(getChannelPriority('dev')).toBe(3);
        expect(getChannelPriority('rescue')).toBe(4);
    });
});

describe('release-channels — badges', () => {
    test('stable build returns just a stable badge', () => {
        const badges = getFirmwareBadges(STABLE_BUILD);
        expect(badges).toHaveLength(1);
        expect(badges[0]).toMatchObject({ key: 'stable', label: 'Stable', tone: 'positive' });
    });

    test('beta build returns a beta badge', () => {
        const badges = getFirmwareBadges(BETA_BUILD);
        expect(badges[0]).toMatchObject({ key: 'beta', label: 'Beta', tone: 'info' });
    });

    test('preview build returns a preview badge with warning tone', () => {
        const badges = getFirmwareBadges(PREVIEW_BUILD);
        expect(badges[0]).toMatchObject({ key: 'preview', label: 'Preview', tone: 'warning' });
    });

    test('rescue build returns a recovery badge with danger tone', () => {
        const badges = getFirmwareBadges(RESCUE_BUILD);
        expect(badges[0]).toMatchObject({ key: 'rescue', label: 'Recovery', tone: 'danger' });
    });

    test('appends a recommended badge when the build is the default pick', () => {
        const badges = getFirmwareBadges(STABLE_BUILD, { recommended: true });
        expect(badges).toHaveLength(2);
        expect(badges.find(badge => badge.key === 'recommended')).toBeTruthy();
    });

    test('appends a deprecated badge for retired builds', () => {
        const badges = getFirmwareBadges(DEPRECATED_STABLE);
        expect(badges.find(badge => badge.key === 'deprecated')).toMatchObject({
            label: 'Deprecated',
            tone: 'danger'
        });
        expect(badges.find(badge => badge.key === 'deprecated').description)
            .toMatch(/superseded/i);
    });

    test('badges include both recommended and deprecated when applicable', () => {
        const badges = getFirmwareBadges(DEPRECATED_STABLE, { recommended: true });
        const keys = badges.map(badge => badge.key);
        expect(keys).toContain('stable');
        expect(keys).toContain('recommended');
        expect(keys).toContain('deprecated');
    });
});

describe('release-channels — warnings', () => {
    test('stable builds have no warnings', () => {
        expect(getFirmwareWarnings(STABLE_BUILD)).toEqual([]);
    });

    test('beta builds surface a beta warning', () => {
        const warnings = getFirmwareWarnings(BETA_BUILD);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].key).toBe('channel:beta');
        expect(warnings[0].message).toMatch(/beta/i);
        expect(warnings[0].message).toMatch(/tester/i);
    });

    test('preview builds surface a stronger experimental warning', () => {
        const warnings = getFirmwareWarnings(PREVIEW_BUILD);
        expect(warnings[0].severity).toBe('warning');
        expect(warnings[0].message).toMatch(/experimental/i);
    });

    test('development builds warn about being unsupported', () => {
        const warnings = getFirmwareWarnings(DEV_BUILD);
        expect(warnings[0].severity).toBe('danger');
        expect(warnings[0].message).toMatch(/internal/i);
    });

    test('rescue builds describe rollback intent', () => {
        const warnings = getFirmwareWarnings(RESCUE_BUILD);
        expect(warnings[0].message).toMatch(/recovery|unbrick|rollback/i);
    });

    test('deprecated builds surface a deprecation warning regardless of channel', () => {
        const warnings = getFirmwareWarnings(DEPRECATED_STABLE);
        expect(warnings.find(warning => warning.key === 'deprecated')).toBeTruthy();
        expect(warnings.find(warning => warning.key === 'deprecated').message)
            .toMatch(/Superseded by v2\.0\.0/);
    });
});

describe('release-channels — acknowledgements', () => {
    test('stable builds need no acknowledgements', () => {
        expect(getRequiredAcknowledgements(STABLE_BUILD)).toEqual([]);
    });

    test('beta builds require a single channel acknowledgement', () => {
        const acks = getRequiredAcknowledgements(BETA_BUILD);
        expect(acks).toHaveLength(1);
        expect(acks[0].key).toBe('channel:beta');
        expect(acks[0].label).toMatch(/beta/i);
    });

    test('preview builds require a single channel acknowledgement', () => {
        const acks = getRequiredAcknowledgements(PREVIEW_BUILD);
        expect(acks).toHaveLength(1);
        expect(acks[0].key).toBe('channel:preview');
    });

    test('development builds require a single channel acknowledgement', () => {
        const acks = getRequiredAcknowledgements(DEV_BUILD);
        expect(acks).toHaveLength(1);
        expect(acks[0].key).toBe('channel:development');
    });

    test('deprecated stable builds require a separate deprecated acknowledgement', () => {
        const acks = getRequiredAcknowledgements(DEPRECATED_STABLE);
        expect(acks.map(item => item.key)).toEqual(['deprecated']);
    });

    test('deprecated beta builds require BOTH channel and deprecated acknowledgements', () => {
        const acks = getRequiredAcknowledgements({ ...BETA_BUILD, deprecated: true });
        const keys = acks.map(item => item.key);
        expect(keys).toContain('channel:beta');
        expect(keys).toContain('deprecated');
    });

    test('rescue builds do not gate install behind an acknowledgement (the warning copy is enough)', () => {
        // Entering recovery mode is itself the explicit consent gesture.
        expect(getRequiredAcknowledgements(RESCUE_BUILD)).toEqual([]);
    });
});

describe('release-channels — visibility filter', () => {
    const ALL_BUILDS = Object.freeze([STABLE_BUILD, BETA_BUILD, PREVIEW_BUILD, DEV_BUILD, RESCUE_BUILD]);

    test('normal mode hides development and rescue', () => {
        const visible = filterBuildsForMode(ALL_BUILDS, 'normal');
        const ids = visible.map(build => build.firmwareId);
        expect(ids).toEqual(['fw-stable', 'fw-beta', 'fw-preview']);
    });

    test('recovery mode reveals rescue but still hides development', () => {
        const visible = filterBuildsForMode(ALL_BUILDS, 'recovery');
        const ids = visible.map(build => build.firmwareId);
        expect(ids).toContain('fw-rescue');
        expect(ids).not.toContain('fw-dev');
    });

    test('development mode reveals dev but still hides rescue', () => {
        const visible = filterBuildsForMode(ALL_BUILDS, 'development');
        const ids = visible.map(build => build.firmwareId);
        expect(ids).toContain('fw-dev');
        expect(ids).not.toContain('fw-rescue');
    });

    test('all mode shows everything (used by diagnostics)', () => {
        const visible = filterBuildsForMode(ALL_BUILDS, 'all');
        expect(visible).toHaveLength(ALL_BUILDS.length);
    });

    test('isBuildVisibleInMode mirrors the filter for individual builds', () => {
        expect(isBuildVisibleInMode(STABLE_BUILD, 'normal')).toBe(true);
        expect(isBuildVisibleInMode(DEV_BUILD, 'normal')).toBe(false);
        expect(isBuildVisibleInMode(DEV_BUILD, 'development')).toBe(true);
        expect(isBuildVisibleInMode(RESCUE_BUILD, 'normal')).toBe(false);
        expect(isBuildVisibleInMode(RESCUE_BUILD, 'recovery')).toBe(true);
    });
});

describe('release-channels — default selection', () => {
    test('prefers a stable build over beta/preview', () => {
        const default_ = pickDefaultBuild([BETA_BUILD, STABLE_BUILD, PREVIEW_BUILD]);
        expect(default_).toBe(STABLE_BUILD);
    });

    test('skips deprecated stable builds and falls back to a non-deprecated stable', () => {
        const default_ = pickDefaultBuild([DEPRECATED_STABLE, STABLE_BUILD]);
        expect(default_).toBe(STABLE_BUILD);
    });

    test('returns null when no defaultable build exists in normal mode', () => {
        // Only beta/preview/dev/rescue/deprecated → no candidate.
        const default_ = pickDefaultBuild([BETA_BUILD, PREVIEW_BUILD, DEV_BUILD, RESCUE_BUILD, DEPRECATED_STABLE]);
        expect(default_).toBeNull();
    });

    test('respects mode visibility when selecting defaults', () => {
        // Development build is hidden in normal mode and is also non-defaultable
        // anyway, so this is mostly a regression test.
        const default_ = pickDefaultBuild([DEV_BUILD, STABLE_BUILD], { mode: 'normal' });
        expect(default_).toBe(STABLE_BUILD);
    });
});
