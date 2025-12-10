/**
 * @fileoverview Changelog service for managing firmware version history.
 * @module services/changelog
 */

/**
 * @typedef {Object} ChangelogEntry
 * @property {string} version - Firmware version
 * @property {string} channel - Release channel (stable, beta, preview)
 * @property {string} date - Build date
 * @property {string[]} changes - List of changes
 * @property {string[]} fixes - List of bug fixes
 * @property {string[]} knownIssues - Known issues
 */

/** @type {Object|null} Cached manifest data */
let cachedManifest = null;

/**
 * Fetches and caches the firmware manifest.
 * @returns {Promise<Object>}
 */
async function fetchManifest() {
    if (cachedManifest) {
        return cachedManifest;
    }

    try {
        const response = await fetch('./manifest.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch manifest: ${response.status}`);
        }
        cachedManifest = await response.json();
        return cachedManifest;
    } catch (error) {
        console.error('[changelog] Error fetching manifest:', error);
        throw error;
    }
}

/**
 * Gets all unique versions from the manifest, sorted by version number descending.
 * @returns {Promise<ChangelogEntry[]>}
 */
export async function getChangelog() {
    const manifest = await fetchManifest();
    const versionMap = new Map();

    // Group builds by version
    for (const build of manifest.builds || []) {
        const key = `${build.version}-${build.channel}`;

        if (!versionMap.has(key)) {
            versionMap.set(key, {
                version: build.version,
                channel: build.channel || 'stable',
                date: build.build_date || null,
                changes: build.changelog || [],
                features: build.features || [],
                knownIssues: build.known_issues || [],
                configs: []
            });
        }

        // Track which configurations have this version
        if (build.config_string && !versionMap.get(key).configs.includes(build.config_string)) {
            versionMap.get(key).configs.push(build.config_string);
        }
    }

    // Convert to array and sort by version descending
    const entries = Array.from(versionMap.values());
    entries.sort((a, b) => {
        // Sort by version (descending)
        const versionCompare = compareVersions(b.version, a.version);
        if (versionCompare !== 0) return versionCompare;

        // Then by channel (stable > beta > preview)
        const channelOrder = { stable: 0, beta: 1, preview: 2 };
        return (channelOrder[a.channel] || 3) - (channelOrder[b.channel] || 3);
    });

    return entries;
}

/**
 * Gets changelog entries for a specific configuration.
 * @param {string} configString - Configuration string (e.g., "Wall-USB-AirIQBase")
 * @returns {Promise<ChangelogEntry[]>}
 */
export async function getChangelogForConfig(configString) {
    const manifest = await fetchManifest();
    const normalizedConfig = configString.toLowerCase();

    const entries = [];
    const seenVersions = new Set();

    for (const build of manifest.builds || []) {
        if (build.config_string?.toLowerCase() === normalizedConfig) {
            const key = `${build.version}-${build.channel}`;
            if (!seenVersions.has(key)) {
                seenVersions.add(key);
                entries.push({
                    version: build.version,
                    channel: build.channel || 'stable',
                    date: build.build_date || null,
                    changes: build.changelog || [],
                    features: build.features || [],
                    knownIssues: build.known_issues || []
                });
            }
        }
    }

    entries.sort((a, b) => compareVersions(b.version, a.version));
    return entries;
}

/**
 * Gets the latest version for a given channel.
 * @param {string} [channel='stable'] - Release channel
 * @returns {Promise<string|null>}
 */
export async function getLatestVersion(channel = 'stable') {
    const manifest = await fetchManifest();
    let latestVersion = null;

    for (const build of manifest.builds || []) {
        if ((build.channel || 'stable') === channel) {
            if (!latestVersion || compareVersions(build.version, latestVersion) > 0) {
                latestVersion = build.version;
            }
        }
    }

    return latestVersion;
}

/**
 * Gets available versions for a specific configuration.
 * @param {string} configString - Configuration string
 * @param {string} [channel] - Optional channel filter
 * @returns {Promise<string[]>}
 */
export async function getVersionsForConfig(configString, channel = null) {
    const manifest = await fetchManifest();
    const normalizedConfig = configString.toLowerCase();
    const versions = new Set();

    for (const build of manifest.builds || []) {
        if (build.config_string?.toLowerCase() === normalizedConfig) {
            if (!channel || (build.channel || 'stable') === channel) {
                versions.add(build.version);
            }
        }
    }

    return Array.from(versions).sort((a, b) => compareVersions(b, a));
}

/**
 * Compares two semantic version strings.
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    const partsA = a.split('.').map(n => parseInt(n, 10) || 0);
    const partsB = b.split('.').map(n => parseInt(n, 10) || 0);

    const maxLength = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLength; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if (numA > numB) return 1;
        if (numA < numB) return -1;
    }

    return 0;
}

/**
 * Formats a date string for display.
 * @param {string} dateString - ISO date string
 * @returns {string}
 */
export function formatDate(dateString) {
    if (!dateString) return 'Unknown date';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

/**
 * Clears the cached manifest (useful for testing or forcing refresh).
 */
export function clearCache() {
    cachedManifest = null;
}

export const __testHooks = Object.freeze({
    compareVersions,
    formatDate,
    clearCache
});
