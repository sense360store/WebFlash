/**
 * @fileoverview WebFlash 2.0 migration — default-view resolution by surface.
 *
 * WebFlash ships two render layers behind one URL flag, both mounted in the same
 * production shell over the same 1.0 engine: the 1.0 view (`app.js`) and the 2.0
 * view (`webflash-2/scripts/shell.js`). Which one renders by default depends on
 * the *surface* the page is served from:
 *
 *   - Production (the GitHub Pages installer at `sense360store.github.io`) keeps
 *     the 1.0 view as its default. The GA cutover is the single commit that flips
 *     the production default to the 2.0 view; nothing before it may change the
 *     production default.
 *   - Every other surface is an internal or beta surface: local development on
 *     `localhost` / `127.0.0.1`, and any internal or beta deployment on a
 *     non-production host. These default to the 2.0 view so it can be dogfooded
 *     ahead of the GA cutover.
 *
 * The `?ui=` query parameter is always an explicit, per-visit override and wins
 * over the surface default: `?ui=1` is the fallback to the 1.0 view on the beta
 * surface, and `?ui=2` is the opt-in to the 2.0 view on production. Any other
 * `?ui=` value is ignored and the surface default applies.
 *
 * This module is intentionally pure and side-effect free (no DOM read, no
 * dynamic import) so the surface-resolution rule is unit testable on its own.
 * The side-effecting bootstrap (`scripts/bootstrap.js`) reads
 * `window.location`, calls `resolveUiVersion()`, and loads the chosen entry.
 *
 * @module ui-version
 */

/** The 1.0 view flag value. */
export const UI_V1 = '1';

/** The 2.0 view flag value. */
export const UI_V2 = '2';

/**
 * Hosts that serve the production installer. On these hosts the default view is
 * the 1.0 view until the GA cutover. Every host not in this list is treated as
 * an internal or beta surface and defaults to the 2.0 view.
 *
 * Matched case-insensitively and exactly: a look-alike host such as
 * `evil-sense360store.github.io` must not be treated as production. When a real
 * beta or staging origin is added, it does NOT belong here — only production
 * hosts that must stay on the 1.0 view until the GA cutover do.
 */
export const PRODUCTION_HOSTS = Object.freeze(['sense360store.github.io']);

/**
 * @param {string} [hostname] `window.location.hostname` for the current surface.
 * @returns {boolean} true when the surface is a production installer host.
 */
export function isProductionHost(hostname) {
    return PRODUCTION_HOSTS.includes(String(hostname == null ? '' : hostname).toLowerCase());
}

/**
 * Resolve which view should render for the current visit.
 *
 * @param {string} [search]   `window.location.search` (e.g. "?ui=2").
 * @param {string} [hostname] `window.location.hostname` (e.g. "localhost").
 * @returns {'1'|'2'} The view flag: '1' for the 1.0 view, '2' for the 2.0 view.
 */
export function resolveUiVersion(search, hostname) {
    // An explicit ?ui=1 / ?ui=2 is a per-visit override and always wins, so the
    // 1.0 fallback stays reachable on the beta surface and the 2.0 opt-in stays
    // reachable on production. Any other ?ui= value (missing, empty, or an
    // unrecognised token) falls through to the surface default.
    const requested = new URLSearchParams(search || '').get('ui');
    if (requested === UI_V1 || requested === UI_V2) {
        return requested;
    }

    // No explicit override: the surface decides. Production stays on the 1.0 view
    // until the GA cutover; internal and beta surfaces default to the 2.0 view.
    return isProductionHost(hostname) ? UI_V1 : UI_V2;
}
