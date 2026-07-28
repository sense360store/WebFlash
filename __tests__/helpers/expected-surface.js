/**
 * WF-SURFACE-SSOT-001 — single source of truth for the expected WebFlash
 * deploy surface. The reviewed declaration lives in
 * __tests__/fixtures/expected-surface.json (per active build: config_string,
 * version, channel; plus the Rescue entry and the retired-artifact register).
 * This helper validates the fixture's internal shape at load time and DERIVES
 * everything the suites used to hardcode:
 *
 *   - total build count and per-channel counts,
 *   - the stable / preview config sets,
 *   - the expected .bin / .meta.json filenames (canonical
 *     Sense360-<config_string>-v<version>-<channel>.bin convention),
 *   - the firmware-N.json index bound (count - 1),
 *   - the retired-artifact "stays retired" register.
 *
 * DIRECTION OF ENFORCEMENT (read before using):
 *   The fixture is the reviewed INTENT; the tests compare REALITY
 *   (manifest.json, the firmware/configurations/ directory, the
 *   firmware-N.json namespace, sources/kits cross-checks) against it exactly,
 *   in both directions — a missing entry fails AND an unexpected entry fails.
 *   A fixture edit alone (without the matching surface change) therefore
 *   cannot auto-pass; it turns the comparing suites red, which is the point:
 *   a surface change is one import/retire PR plus one expected-surface.json
 *   edit, reviewed together. See docs/expected-surface-fixture.md
 *   (archived; see docs/archive-index.md).
 *
 * ANTI-TAUTOLOGY NOTE: this helper never reads manifest.json, the firmware
 * directory, kits.json, or any other live surface. It reads only the
 * hand-reviewed fixture, so asserting a live artifact against these exports
 * is always a real comparison between two independent files.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'expected-surface.json');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const CONFIG_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const ACTIVE_CHANNELS = new Set(['stable', 'preview']);

function fail(message) {
    throw new Error(
        `__tests__/fixtures/expected-surface.json is malformed: ${message}. ` +
            'The fixture is the reviewed deploy-surface declaration; fix the ' +
            'fixture, do not work around it in a test.'
    );
}

// Hyphen-bounded segment match (mirrors manifest-health.test.js) so "LED"
// does not false-match "LEDless" and "FanTRIAC" does not false-match any
// unrelated longer token.
export function containsSegment(value, token) {
    if (typeof value !== 'string' || value.length === 0) {
        return false;
    }
    return value.split('-').includes(token);
}

function validateEntry(entry, label) {
    if (!entry || typeof entry !== 'object') {
        fail(`${label} is not an object`);
    }
    if (typeof entry.config_string !== 'string' || !CONFIG_RE.test(entry.config_string)) {
        fail(`${label} config_string "${entry.config_string}" is not a valid config token`);
    }
    if (typeof entry.version !== 'string' || !SEMVER_RE.test(entry.version)) {
        fail(`${label} (${entry.config_string}) version "${entry.version}" is not X.Y.Z semver`);
    }
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

if (fixture.schema_version !== 1) {
    fail(`schema_version must be 1, got ${fixture.schema_version}`);
}
if (!Array.isArray(fixture.builds) || fixture.builds.length === 0) {
    fail('builds must be a non-empty array');
}
if (!fixture.rescue || typeof fixture.rescue !== 'object') {
    fail('rescue entry is missing');
}
if (!Array.isArray(fixture.retired)) {
    fail('retired must be an array (may be empty)');
}

fixture.builds.forEach((entry, i) => {
    validateEntry(entry, `builds[${i}]`);
    if (!ACTIVE_CHANNELS.has(entry.channel)) {
        fail(
            `builds[${i}] (${entry.config_string}) channel "${entry.channel}" ` +
                'must be stable or preview'
        );
    }
    // FanTRIAC stays globally blocked (HW-005): the reviewed surface may
    // never declare a FanTRIAC-bearing build. This is fail-fast
    // defence-in-depth on the INTENT side; the manifest / on-disk / catalog
    // guards keep their own independent FanTRIAC assertions on the REALITY
    // side, so this cannot weaken them.
    if (containsSegment(entry.config_string, 'FanTRIAC')) {
        fail(
            `builds[${i}] (${entry.config_string}) carries the blocked FanTRIAC token`
        );
    }
});

// Keep the fixture diff-stable for review: builds sorted by config_string,
// no duplicate config.
{
    const configs = fixture.builds.map(b => b.config_string);
    const sorted = [...configs].sort();
    if (configs.join('\n') !== sorted.join('\n')) {
        fail('builds must be sorted by config_string');
    }
    if (new Set(configs).size !== configs.length) {
        fail('builds must not declare the same config_string twice');
    }
}

validateEntry(fixture.rescue, 'rescue');
if (fixture.rescue.config_string !== 'Rescue' || fixture.rescue.channel !== 'rescue') {
    fail('rescue entry must be config_string "Rescue" on channel "rescue"');
}

fixture.retired.forEach((entry, i) => {
    validateEntry(entry, `retired[${i}]`);
    if (!ACTIVE_CHANNELS.has(entry.channel)) {
        fail(
            `retired[${i}] (${entry.config_string}) channel "${entry.channel}" ` +
                'must be stable or preview'
        );
    }
});
{
    const keys = fixture.retired.map(
        r => `${r.config_string}@v${r.version}-${r.channel}`
    );
    if (new Set(keys).size !== keys.length) {
        fail('retired must not declare the same artifact twice');
    }
}

/**
 * Canonical artifact filename for a fixture entry. `file_channel` names the
 * immutable channel baked into the published filename when it differs from
 * the SERVED channel — a presentation demotion (owner decision of 2026-07-28,
 * SENSE360-CANONICALISATION-001: Ceiling-POE-AirIQ-RoomIQ presents preview
 * while its published v1.0.9 stable-named binary stays exactly where it is).
 * Promotion the other way is impossible: gen-manifests.py rejects any
 * channel_presentation that is not a demotion.
 */
export function binNameFor(entry) {
    return `Sense360-${entry.config_string}-v${entry.version}-${entry.file_channel || entry.channel}.bin`;
}

/** Canonical sidecar filename for a fixture entry. */
export function sidecarNameFor(entry) {
    return binNameFor(entry).replace(/\.bin$/, '.meta.json');
}

const freezeAll = (arr) => Object.freeze(arr.map(e => Object.freeze({ ...e })));
const sortedUnique = (values) => Object.freeze([...new Set(values)].sort());

/** The raw fixture payload (frozen). */
export const expectedSurface = fixture;

/** Active application builds (firmware/configurations/), excluding Rescue. */
export const expectedBuilds = freezeAll(fixture.builds);

/** The standalone Rescue build (firmware/rescue/). */
export const rescueBuild = Object.freeze({ ...fixture.rescue });

/** Every expected manifest build: application builds plus Rescue. */
export const expectedManifestBuilds = Object.freeze([...expectedBuilds, rescueBuild]);

/** Total expected manifest.json build count (application builds + Rescue). */
export const expectedTotalBuildCount = expectedManifestBuilds.length;

/** Highest valid firmware-N.json index (one per manifest build, 0-based). */
export const expectedMaxFirmwareIndex = expectedTotalBuildCount - 1;

/** Every expected manifest config_string (including Rescue), sorted. */
export const expectedConfigStrings = sortedUnique(
    expectedManifestBuilds.map(b => b.config_string)
);

/** Stable-channel config_strings, sorted. */
export const expectedStableConfigs = sortedUnique(
    expectedBuilds.filter(b => b.channel === 'stable').map(b => b.config_string)
);

/** Preview-channel config_strings, sorted. */
export const expectedPreviewConfigs = sortedUnique(
    expectedBuilds.filter(b => b.channel === 'preview').map(b => b.config_string)
);

/** Per-channel build counts (rescue is always the single Rescue build). */
export const expectedChannelCounts = Object.freeze({
    stable: expectedStableConfigs.length,
    preview: expectedPreviewConfigs.length,
    rescue: 1
});

/** Expected .bin filenames under firmware/configurations/, sorted. */
export const expectedConfigurationBins = sortedUnique(expectedBuilds.map(binNameFor));

/** Expected .meta.json sidecar filenames under firmware/configurations/, sorted. */
export const expectedConfigurationSidecars = sortedUnique(
    expectedBuilds.map(sidecarNameFor)
);

/** The exact expected firmware/configurations/ directory listing, sorted. */
export const expectedConfigurationFiles = sortedUnique([
    ...expectedConfigurationBins,
    ...expectedConfigurationSidecars
]);

/** Retired artifact register (raw entries, frozen). */
export const retiredBuilds = freezeAll(fixture.retired);

/** Retired artifact .bin filenames — these may never reappear on disk. */
export const retiredArtifacts = sortedUnique(retiredBuilds.map(binNameFor));

/** Retired artifact .meta.json filenames — these may never reappear on disk. */
export const retiredSidecars = sortedUnique(retiredBuilds.map(sidecarNameFor));

/**
 * Retired config_strings whose config has NOT returned in the active surface
 * (a retired config may legitimately return at a different version/channel —
 * e.g. Ceiling-POE-AirIQ-RoomIQ retired as a v1.0.0 preview and returned as
 * the v1.0.6 stable). These configs must be absent from manifest.json,
 * firmware/sources.json, and every kit card.
 */
export const retiredConfigsStillAbsent = sortedUnique(
    retiredBuilds
        .map(r => r.config_string)
        .filter(cs => !expectedConfigStrings.includes(cs))
);

// A retired artifact must never simultaneously be an expected artifact.
for (const name of retiredArtifacts) {
    if (expectedConfigurationBins.includes(name)) {
        fail(`retired artifact "${name}" is also declared as an active build`);
    }
}

const buildByConfig = new Map(
    expectedManifestBuilds.map(b => [b.config_string, b])
);

/** The expected build entry for a config_string, or null when not declared. */
export function expectedBuildFor(configString) {
    return buildByConfig.get(configString) || null;
}

/** True when the config_string is part of the expected surface (incl. Rescue). */
export function isExpectedConfig(configString) {
    return buildByConfig.has(configString);
}

/**
 * The expected channel for a declared config_string. Throws on an undeclared
 * config so a typo or a silently-removed build fails loud instead of
 * comparing against undefined.
 */
export function expectedChannelOf(configString) {
    const build = buildByConfig.get(configString);
    if (!build) {
        fail(`expectedChannelOf("${configString}") — config is not declared in the expected surface`);
    }
    return build.channel;
}

/** The expected version for a declared config_string (throws when absent). */
export function expectedVersionOf(configString) {
    const build = buildByConfig.get(configString);
    if (!build) {
        fail(`expectedVersionOf("${configString}") — config is not declared in the expected surface`);
    }
    return build.version;
}
