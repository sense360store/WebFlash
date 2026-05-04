/**
 * @fileoverview Manifest freshness check.
 *
 * The wizard loads `manifest.json` once at startup. This module re-fetches
 * it with `cache: 'no-store'` to confirm the loaded copy is still the most
 * recent one published by the manifest pipeline.
 *
 * Verdicts:
 *   - 'current'  the loaded `generated_at` matches the live manifest.
 *   - 'stale'    the live manifest has a newer `generated_at`.
 *   - 'unknown'  we could not reach the network or the live manifest is
 *                missing the metadata we need to compare.
 *
 * The check is intentionally conservative: a missing or unparseable
 * `generated_at` collapses to 'unknown', never to 'current'. The install
 * gate then either blocks (stale) or asks for explicit acknowledgement
 * (unknown).
 *
 * @module services/manifest-freshness
 */

const MANIFEST_URL = 'manifest.json';

function parseTimestamp(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {{generated_at?: string} | null | undefined} loadedMetadata
 *   The manifest metadata captured when the wizard loaded `manifest.json`
 *   on startup.
 * @param {{fetchImpl?: typeof fetch, manifestUrl?: string}} [options]
 * @returns {Promise<{verdict: 'current'|'stale'|'unknown', loadedGeneratedAt: string|null, liveGeneratedAt: string|null, error: string|null}>}
 */
export async function checkManifestFreshness(loadedMetadata, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const url = options.manifestUrl || MANIFEST_URL;
    const loadedGeneratedAt = (loadedMetadata && typeof loadedMetadata.generated_at === 'string')
        ? loadedMetadata.generated_at
        : null;

    if (!fetchImpl) {
        return {
            verdict: 'unknown',
            loadedGeneratedAt,
            liveGeneratedAt: null,
            error: 'fetch unavailable'
        };
    }

    try {
        const response = await fetchImpl(url, { cache: 'no-store' });
        if (!response || !response.ok) {
            return {
                verdict: 'unknown',
                loadedGeneratedAt,
                liveGeneratedAt: null,
                error: response ? `http ${response.status}` : 'no response'
            };
        }
        const live = await response.json();
        const liveGeneratedAt = (live && typeof live.generated_at === 'string')
            ? live.generated_at
            : null;

        if (!loadedGeneratedAt || !liveGeneratedAt) {
            return {
                verdict: 'unknown',
                loadedGeneratedAt,
                liveGeneratedAt,
                error: 'missing generated_at'
            };
        }

        const loadedMs = parseTimestamp(loadedGeneratedAt);
        const liveMs = parseTimestamp(liveGeneratedAt);
        if (loadedMs == null || liveMs == null) {
            return {
                verdict: 'unknown',
                loadedGeneratedAt,
                liveGeneratedAt,
                error: 'unparseable generated_at'
            };
        }

        if (liveMs > loadedMs) {
            return {
                verdict: 'stale',
                loadedGeneratedAt,
                liveGeneratedAt,
                error: null
            };
        }
        return {
            verdict: 'current',
            loadedGeneratedAt,
            liveGeneratedAt,
            error: null
        };
    } catch (error) {
        return {
            verdict: 'unknown',
            loadedGeneratedAt,
            liveGeneratedAt: null,
            error: error && error.message ? error.message : 'network error'
        };
    }
}
