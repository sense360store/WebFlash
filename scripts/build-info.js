/**
 * @fileoverview Static app build/version metadata for WebFlash.
 *
 * This file is committed with safe fallback values. A future build pipeline
 * may overwrite the values below at release time, but the runtime app must
 * not depend on that ever happening — every consumer must tolerate any of
 * these fields being missing or set to "unknown" / "0.0.0-dev" without
 * crashing.
 *
 * Fields:
 *   appVersion     — semver string of the published WebFlash bundle.
 *   appShell       — WF-UX-014 app-shell build marker (date-based, matches the
 *                    `?v=` cache-bust token in index.html / app.js and the
 *                    `webflash-app-shell` meta tag). Lets support tell at a
 *                    glance whether the live page is running the post-WF-UX-014
 *                    app shell or a stale CDN/service-worker copy.
 *   buildCommit    — git short SHA of the source the bundle was built from.
 *   buildTimestamp — ISO 8601 timestamp of the build, or "unknown".
 *
 * Consumers (about panel, diagnostics) read this via:
 *   import { BUILD_INFO } from './build-info.js';
 *
 * Do not add secrets, tokens, signing material, or PII here. The contents
 * of this file are surfaced verbatim in the support/about UI and in the
 * "Copy diagnostics" payload.
 *
 * @module build-info
 */

export const BUILD_INFO = Object.freeze({
    appVersion: '1.0.1',
    appShell: '2026-06-01',
    buildCommit: 'unknown',
    buildTimestamp: 'unknown'
});
