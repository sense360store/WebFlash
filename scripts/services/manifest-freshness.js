/**
 * @fileoverview Manifest freshness check.
 *
 * The wizard loads `manifest.json` once at startup. This module re-fetches
 * it with `cache: 'no-store'` to confirm the loaded copy is still the most
 * recent one published by the manifest pipeline.
 *
 * Verdicts:
 *   - 'current'  the loaded `generated_at` matches (or is newer than) the live
 *                manifest.
 *   - 'stale'    the live manifest has a newer `generated_at`.
 *   - 'unknown'  we could not reach the network, the response was not a usable
 *                manifest, or the metadata needed to compare was missing.
 *
 * The check is intentionally conservative: a missing or unparseable
 * `generated_at` collapses to 'unknown', never to 'current'. The install
 * gate then either hard-blocks (stale) or, depending on the install mode,
 * treats unknown as a calm non-blocking note (Simple install) or asks for
 * explicit acknowledgement (Advanced install). See evaluateFreshnessGate()
 * in scripts/state.js for the gate side.
 *
 * WF-UX-017 — diagnosis. Every non-'current' outcome now carries a structured
 * `reason` code so a failing live GitHub Pages recheck is observable instead of
 * collapsing to an opaque 'unknown'. The codes map to the distinct failure
 * points below:
 *
 *   - 'fetch-failed'         no fetch impl, or the network request threw
 *                            (offline, DNS, CSP connect-src, aborted).
 *   - 'http-error'           the request resolved but `response.ok` was false
 *                            (404 / 403 / 5xx from the CDN or Pages).
 *   - 'parse-failed'         a 2xx response whose body is NOT valid JSON — e.g.
 *                            a GitHub Pages 404 HTML page or an index.html
 *                            fallback served in place of manifest.json. This is
 *                            the most common real cause of a live "unknown" and
 *                            was previously indistinguishable from a transport
 *                            failure (both collapsed into the catch block).
 *   - 'missing-generated-at' the loaded copy or the live copy has no
 *                            `generated_at` string to compare.
 *   - 'invalid-generated-at' a `generated_at` is present but not a parseable
 *                            timestamp.
 *   - 'compare-failed'       defensive — the timestamp comparison itself threw.
 *   - 'same-or-newer'        verdict 'current': the loaded build is the latest.
 *   - 'stale'                verdict 'stale': a newer manifest is published.
 *
 * The legacy free-text `error` field is preserved alongside `reason` for
 * backward compatibility (diagnostics bundles and existing tests read it).
 *
 * @module services/manifest-freshness
 */

const MANIFEST_URL = 'manifest.json';

/**
 * Structured diagnosis codes for the freshness check. Exported so state.js and
 * tests can reference the canonical strings instead of duplicating literals.
 * @readonly
 */
export const FRESHNESS_REASON = Object.freeze({
    FETCH_FAILED: 'fetch-failed',
    HTTP_ERROR: 'http-error',
    PARSE_FAILED: 'parse-failed',
    MISSING_GENERATED_AT: 'missing-generated-at',
    INVALID_GENERATED_AT: 'invalid-generated-at',
    COMPARE_FAILED: 'compare-failed',
    SAME_OR_NEWER: 'same-or-newer',
    STALE: 'stale'
});

function parseTimestamp(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

function makeResult(verdict, reason, loadedGeneratedAt, liveGeneratedAt, error) {
    return {
        verdict,
        reason,
        loadedGeneratedAt: loadedGeneratedAt || null,
        liveGeneratedAt: liveGeneratedAt || null,
        error: error || null
    };
}

/**
 * @param {{generated_at?: string} | null | undefined} loadedMetadata
 *   The manifest metadata captured when the wizard loaded `manifest.json`
 *   on startup.
 * @param {{fetchImpl?: typeof fetch, manifestUrl?: string}} [options]
 * @returns {Promise<{verdict: 'current'|'stale'|'unknown', reason: string, loadedGeneratedAt: string|null, liveGeneratedAt: string|null, error: string|null}>}
 */
export async function checkManifestFreshness(loadedMetadata, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const url = options.manifestUrl || MANIFEST_URL;
    const loadedGeneratedAt = (loadedMetadata && typeof loadedMetadata.generated_at === 'string')
        ? loadedMetadata.generated_at
        : null;

    if (!fetchImpl) {
        return makeResult('unknown', FRESHNESS_REASON.FETCH_FAILED, loadedGeneratedAt, null, 'fetch unavailable');
    }

    let response;
    try {
        response = await fetchImpl(url, { cache: 'no-store' });
    } catch (error) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.FETCH_FAILED,
            loadedGeneratedAt,
            null,
            error && error.message ? error.message : 'network error'
        );
    }

    if (!response || !response.ok) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.HTTP_ERROR,
            loadedGeneratedAt,
            null,
            response ? `http ${response.status}` : 'no response'
        );
    }

    let live;
    try {
        live = await response.json();
    } catch (error) {
        // A 2xx response whose body is not JSON (a GitHub Pages 404 HTML page or
        // an index.html fallback served in place of manifest.json) lands here.
        // Separating this from a transport failure is the whole point of the
        // reason codes — on the live site this is the smoking gun for "unknown".
        return makeResult(
            'unknown',
            FRESHNESS_REASON.PARSE_FAILED,
            loadedGeneratedAt,
            null,
            error && error.message ? error.message : 'manifest response is not valid JSON'
        );
    }

    const liveGeneratedAt = (live && typeof live.generated_at === 'string')
        ? live.generated_at
        : null;

    if (!loadedGeneratedAt || !liveGeneratedAt) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.MISSING_GENERATED_AT,
            loadedGeneratedAt,
            liveGeneratedAt,
            'missing generated_at'
        );
    }

    const loadedMs = parseTimestamp(loadedGeneratedAt);
    const liveMs = parseTimestamp(liveGeneratedAt);
    if (loadedMs == null || liveMs == null) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.INVALID_GENERATED_AT,
            loadedGeneratedAt,
            liveGeneratedAt,
            'unparseable generated_at'
        );
    }

    try {
        if (liveMs > loadedMs) {
            return makeResult('stale', FRESHNESS_REASON.STALE, loadedGeneratedAt, liveGeneratedAt, null);
        }
        return makeResult('current', FRESHNESS_REASON.SAME_OR_NEWER, loadedGeneratedAt, liveGeneratedAt, null);
    } catch (error) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.COMPARE_FAILED,
            loadedGeneratedAt,
            liveGeneratedAt,
            error && error.message ? error.message : 'freshness comparison failed'
        );
    }
}
