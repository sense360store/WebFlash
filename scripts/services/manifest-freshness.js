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
 * WF-FRESHNESS-ROOT-MANIFEST-001 — root-manifest targeting + robust timestamp.
 * The live recheck must hit the ROOT firmware manifest — the same
 * `manifest.json` the wizard loaded — and read its top-level `generated_at`.
 *
 * HAR proof: browser DevTools confirmed the live `/WebFlash/manifest.json`
 * request succeeds, the response is JSON, and it carries top-level
 * `generated_at` (`2026-06-01T20:14:37.955988+00:00`) and `source_commit`
 * (`bacc3d97…`). So the live `missing-generated-at` warning was NOT a bad
 * published manifest — it was the LOADED metadata never being captured /
 * preserved (the capture below ran only in tests). The single opaque code is
 * now split into `missing-loaded-generated-at` / `missing-fetched-generated-at`
 * / `missing-both-generated-at` so the failing side is named.
 *
 * WF-MANIFEST-FRESHNESS-RACE-001 — startup ordering / race. Newer HAR evidence
 * (full page refresh directly into `step=5`) reconfirmed the deployed
 * `/WebFlash/manifest.json` returns HTTP 200 JSON with a top-level `generated_at`
 * on both the first and a second request, and that a manual "Check for update
 * again" succeeds. The remaining false `missing-generated-at` came from the
 * freshness check running on the initial review-step load BEFORE the wizard had
 * captured the loaded manifest metadata (the async manifest load was still in
 * flight). The fix lives caller-side in scripts/state.js
 * (`checkManifestFreshnessNow()` awaits the in-flight load and re-captures
 * metadata before comparing; `triggerManifestFreshnessCheckIfNeeded()` no longer
 * pre-marks the check as run). This module adds the `manifest-load-pending`
 * reason and an `options.manifestLoadPending` guard so a still-loading state is
 * reported distinctly and never misattributed to `missing-loaded-generated-at`.
 * See docs/wf-manifest-freshness-race-diagnosis.md (archived; see
 * docs/archive-index.md).
 *
 * Two failure modes produced a false missing-`generated_at` against a root
 * manifest that DOES carry `generated_at`:
 *
 *   1. Fetch-target drift. A *relative* `manifest.json` resolves against
 *      `document.baseURI`, which on GitHub Pages silently points at the domain
 *      root (`/manifest.json`) whenever the page URL lacks a trailing slash or
 *      a <base> tag is present — fetching a different document (or an HTML 404)
 *      that has no `generated_at`. resolveManifestUrl() now mirrors
 *      scripts/bootstrap.js and targets the absolute `/WebFlash/manifest.json`
 *      on the Pages subpath so the probe always lands on the root manifest, not
 *      firmware/sources.json, the rescue manifest, a per-build firmware part,
 *      or a stripped in-memory object.
 *   2. Object-shape drift. Some runtime callers carry the manifest inside a
 *      richer envelope (`{ manifest: { generated_at } }`). extractGeneratedAt()
 *      prefers the canonical top-level `generated_at` and falls back to a nested
 *      `manifest.generated_at`, on BOTH the loaded and the live side, so a valid
 *      timestamp under either shape resolves to current/stale rather than
 *      collapsing to unknown.
 *
 * Every result also carries a structured `diagnostics` block (fetched URL, HTTP
 * status, content-type, the live object's top-level keys, whether top-level /
 * nested `generated_at` exist, and which source supplied the comparison
 * timestamp) so a failing live recheck is observable instead of opaque.
 *
 * WF-UX-017 — diagnosis. Every non-'current' outcome also carries a structured
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
 *                            a common real cause of a live "unknown" and was
 *                            previously indistinguishable from a transport
 *                            failure (both collapsed into the catch block).
 *   - 'missing-loaded-generated-at'  the LOADED copy has no `generated_at` while
 *                            the live copy does — the common live cause (loaded
 *                            metadata was never captured/preserved).
 *   - 'missing-fetched-generated-at' the LIVE copy has no `generated_at` while
 *                            the loaded copy does — e.g. a wrong fetch target
 *                            (firmware/sources.json, the rescue manifest).
 *   - 'missing-both-generated-at'    neither copy has a `generated_at` string
 *                            (under either the top-level or nested
 *                            `manifest.generated_at` shape).
 *   - 'manifest-load-pending'  WF-MANIFEST-FRESHNESS-RACE-001 — the loaded
 *                            metadata is not available yet because the initial
 *                            manifest load is still in flight (a direct deep-link
 *                            into the review step reached the freshness check
 *                            before `loadManifestData()` resolved). This is a
 *                            TRANSIENT state, NOT a real missing-`generated_at`
 *                            failure: the caller is expected to await the load
 *                            and re-run rather than latch a verdict. It is kept
 *                            distinct from `missing-loaded-generated-at` so a
 *                            startup race is never misattributed to a bad or
 *                            uncaptured published manifest.
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
const PAGES_MANIFEST_URL = '/WebFlash/manifest.json';

/**
 * Structured diagnosis codes for the freshness check. Exported so state.js and
 * tests can reference the canonical strings instead of duplicating literals.
 * @readonly
 */
export const FRESHNESS_REASON = Object.freeze({
    FETCH_FAILED: 'fetch-failed',
    HTTP_ERROR: 'http-error',
    PARSE_FAILED: 'parse-failed',
    // WF-FRESHNESS-ROOT-MANIFEST-001 — the single opaque `missing-generated-at`
    // code is split so the FAILING SIDE is named. Live HAR capture proved the
    // deployed /WebFlash/manifest.json returns valid JSON with a top-level
    // `generated_at` (and `source_commit`), so a missing timestamp is almost
    // always the LOADED side (metadata never captured), which the old code hid.
    MISSING_LOADED_GENERATED_AT: 'missing-loaded-generated-at',
    MISSING_FETCHED_GENERATED_AT: 'missing-fetched-generated-at',
    MISSING_BOTH_GENERATED_AT: 'missing-both-generated-at',
    // WF-MANIFEST-FRESHNESS-RACE-001 — transient: the initial manifest load has
    // not resolved yet, so the loaded `generated_at` could not be captured. The
    // caller must await the load and re-run; this is never a published-manifest
    // fault and must not be confused with `missing-loaded-generated-at`.
    MANIFEST_LOAD_PENDING: 'manifest-load-pending',
    INVALID_GENERATED_AT: 'invalid-generated-at',
    COMPARE_FAILED: 'compare-failed',
    SAME_OR_NEWER: 'same-or-newer',
    STALE: 'stale'
});

/**
 * Resolve the URL the freshness probe should fetch. On GitHub Pages the wizard
 * is served from the `/WebFlash/` project subpath, so a *relative*
 * `manifest.json` resolves against `document.baseURI` — which silently points
 * at the domain root (`/manifest.json`) whenever the page URL has no trailing
 * slash or a <base> tag is present. That misdirected fetch returns a *different*
 * JSON document (or an HTML 404), which is exactly how a root manifest WITH
 * `generated_at` still produced a missing-`generated_at` verdict. Mirror
 * scripts/bootstrap.js: when we detect the `/WebFlash/` subpath, fetch the
 * absolute `/WebFlash/manifest.json` so the probe always targets the root
 * firmware manifest. Off Pages (localhost, a custom domain served at root) the
 * relative path is correct and preserved.
 *
 * @param {string} [pathname] explicit pathname (testing); defaults to
 *   `window.location.pathname` when available.
 * @returns {string}
 */
export function resolveManifestUrl(pathname) {
    const path = typeof pathname === 'string'
        ? pathname
        : ((typeof window !== 'undefined'
            && window.location
            && typeof window.location.pathname === 'string')
            ? window.location.pathname
            : '');
    const inRepoSubpath = path === '/WebFlash' || path.startsWith('/WebFlash/');
    return inRepoSubpath ? PAGES_MANIFEST_URL : MANIFEST_URL;
}

/**
 * Extract a manifest `generated_at` timestamp, tolerating two runtime shapes:
 *   - top-level `generated_at` (the canonical root manifest shape), preferred.
 *   - nested `manifest.generated_at` (a wrapped envelope some runtime callers
 *     pass), used as a fallback.
 * Returns the value plus which shape supplied it so the caller can record the
 * selected timestamp source in diagnostics. Returns a null value/source when
 * neither shape carries a non-empty string.
 *
 * @param {any} obj
 * @returns {{value: string|null, source: 'generated_at'|'manifest.generated_at'|null}}
 */
function extractGeneratedAt(obj) {
    if (!obj || typeof obj !== 'object') {
        return { value: null, source: null };
    }
    if (typeof obj.generated_at === 'string' && obj.generated_at) {
        return { value: obj.generated_at, source: 'generated_at' };
    }
    const nested = obj.manifest;
    if (nested && typeof nested === 'object'
        && typeof nested.generated_at === 'string' && nested.generated_at) {
        return { value: nested.generated_at, source: 'manifest.generated_at' };
    }
    return { value: null, source: null };
}

/**
 * Defensive content-type read — the fetch Response may be a minimal test double
 * with no `headers`. Returns null rather than throwing in that case.
 * @param {any} response
 * @returns {string|null}
 */
function readContentType(response) {
    try {
        if (response && response.headers && typeof response.headers.get === 'function') {
            return response.headers.get('content-type') || null;
        }
    } catch {
        /* ignore — diagnostics are best-effort */
    }
    return null;
}

function makeDiagnostics(overrides = {}) {
    return {
        fetchedUrl: null,
        httpStatus: null,
        contentType: null,
        topLevelKeys: null,
        hasGeneratedAt: false,
        hasNestedGeneratedAt: false,
        timestampSource: null,
        ...overrides
    };
}

function parseTimestamp(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

function makeResult(verdict, reason, loadedGeneratedAt, liveGeneratedAt, error, diagnostics) {
    return {
        verdict,
        reason,
        loadedGeneratedAt: loadedGeneratedAt || null,
        liveGeneratedAt: liveGeneratedAt || null,
        error: error || null,
        diagnostics: diagnostics || makeDiagnostics()
    };
}

/**
 * @param {{generated_at?: string, manifest?: {generated_at?: string}} | null | undefined} loadedMetadata
 *   The manifest metadata captured when the wizard loaded `manifest.json`
 *   on startup. Both a top-level `generated_at` and a nested
 *   `manifest.generated_at` are supported.
 * @param {{fetchImpl?: typeof fetch, manifestUrl?: string, manifestLoadPending?: boolean}} [options]
 *   `manifestLoadPending` (WF-MANIFEST-FRESHNESS-RACE-001): the caller knows the
 *   initial manifest load has not resolved yet, so missing loaded metadata is a
 *   startup race rather than a published-manifest fault. When set and the loaded
 *   `generated_at` is absent, the comparison is deferred with the distinct
 *   `manifest-load-pending` reason instead of fetching and reporting a bogus
 *   `missing-loaded-generated-at`.
 * @returns {Promise<{verdict: 'current'|'stale'|'unknown', reason: string, loadedGeneratedAt: string|null, liveGeneratedAt: string|null, error: string|null, diagnostics: object}>}
 */
export async function checkManifestFreshness(loadedMetadata, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const url = options.manifestUrl || resolveManifestUrl();
    const loadedGeneratedAt = extractGeneratedAt(loadedMetadata).value;
    const diagnostics = makeDiagnostics({ fetchedUrl: url });

    // WF-MANIFEST-FRESHNESS-RACE-001 — startup ordering guard. If the loaded
    // metadata has not been captured yet because the initial manifest load is
    // still in flight, refuse to compare and report the transient
    // `manifest-load-pending` reason. The caller (checkManifestFreshnessNow) is
    // expected to await the load and re-run. This prevents a direct deep-link
    // into the review step from latching a false `missing-loaded-generated-at`
    // verdict against a live manifest that DOES carry `generated_at`.
    if (!loadedGeneratedAt && options.manifestLoadPending) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.MANIFEST_LOAD_PENDING,
            loadedGeneratedAt,
            null,
            'manifest load still pending — freshness comparison deferred',
            diagnostics
        );
    }

    if (!fetchImpl) {
        return makeResult('unknown', FRESHNESS_REASON.FETCH_FAILED, loadedGeneratedAt, null, 'fetch unavailable', diagnostics);
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
            error && error.message ? error.message : 'network error',
            diagnostics
        );
    }

    if (!response || !response.ok) {
        if (response) {
            diagnostics.httpStatus = typeof response.status === 'number' ? response.status : null;
            diagnostics.contentType = readContentType(response);
        }
        return makeResult(
            'unknown',
            FRESHNESS_REASON.HTTP_ERROR,
            loadedGeneratedAt,
            null,
            response ? `http ${response.status}` : 'no response',
            diagnostics
        );
    }

    diagnostics.httpStatus = typeof response.status === 'number' ? response.status : null;
    diagnostics.contentType = readContentType(response);

    let live;
    try {
        live = await response.json();
    } catch (error) {
        // A 2xx response whose body is not JSON (a GitHub Pages 404 HTML page or
        // an index.html fallback served in place of manifest.json) lands here.
        // Separating this from a transport failure is the whole point of the
        // reason codes — on the live site this is a smoking gun for "unknown".
        return makeResult(
            'unknown',
            FRESHNESS_REASON.PARSE_FAILED,
            loadedGeneratedAt,
            null,
            error && error.message ? error.message : 'manifest response is not valid JSON',
            diagnostics
        );
    }

    // Record the live object's shape so a missing/unexpected target is observable
    // (e.g. firmware/sources.json or a per-build object served for manifest.json
    // would surface here with no `generated_at` among its top-level keys).
    if (live && typeof live === 'object') {
        diagnostics.topLevelKeys = Object.keys(live);
        diagnostics.hasGeneratedAt = typeof live.generated_at === 'string' && Boolean(live.generated_at);
        diagnostics.hasNestedGeneratedAt = Boolean(
            live.manifest && typeof live.manifest === 'object'
            && typeof live.manifest.generated_at === 'string' && live.manifest.generated_at
        );
    }

    const liveExtract = extractGeneratedAt(live);
    const liveGeneratedAt = liveExtract.value;
    diagnostics.timestampSource = liveExtract.source;

    if (!loadedGeneratedAt || !liveGeneratedAt) {
        // WF-FRESHNESS-ROOT-MANIFEST-001 — name the side that is missing so a
        // live warning is actionable. The HAR shows the fetched manifest carries
        // `generated_at`, so `missing-loaded-generated-at` points the diagnosis
        // straight at the loaded-metadata capture rather than the published file.
        let missingReason;
        let missingError;
        if (!loadedGeneratedAt && !liveGeneratedAt) {
            missingReason = FRESHNESS_REASON.MISSING_BOTH_GENERATED_AT;
            missingError = 'missing generated_at on both loaded and fetched manifest';
        } else if (!loadedGeneratedAt) {
            missingReason = FRESHNESS_REASON.MISSING_LOADED_GENERATED_AT;
            missingError = 'missing generated_at on loaded manifest';
        } else {
            missingReason = FRESHNESS_REASON.MISSING_FETCHED_GENERATED_AT;
            missingError = 'missing generated_at on fetched manifest';
        }
        return makeResult(
            'unknown',
            missingReason,
            loadedGeneratedAt,
            liveGeneratedAt,
            missingError,
            diagnostics
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
            'unparseable generated_at',
            diagnostics
        );
    }

    try {
        if (liveMs > loadedMs) {
            return makeResult('stale', FRESHNESS_REASON.STALE, loadedGeneratedAt, liveGeneratedAt, null, diagnostics);
        }
        return makeResult('current', FRESHNESS_REASON.SAME_OR_NEWER, loadedGeneratedAt, liveGeneratedAt, null, diagnostics);
    } catch (error) {
        return makeResult(
            'unknown',
            FRESHNESS_REASON.COMPARE_FAILED,
            loadedGeneratedAt,
            liveGeneratedAt,
            error && error.message ? error.message : 'freshness comparison failed',
            diagnostics
        );
    }
}
