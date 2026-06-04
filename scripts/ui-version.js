/**
 * @fileoverview WebFlash 2.0 migration — default-view resolution by surface.
 *
 * WebFlash ships two render layers behind one URL flag, both mounted in the same
 * production shell over the same 1.0 engine: the 1.0 view (`app.js`) and the 2.0
 * view (`webflash-2/scripts/shell.js`). Which one renders by default depends on
 * the *surface* the page is served from:
 *
 *   - As of the GA cutover (PR 12) every surface defaults to the 2.0 view,
 *     production (the GitHub Pages installer at `sense360store.github.io`)
 *     included. The cutover is the single commit that flipped the production
 *     default.
 *   - Before the cutover, production kept the 1.0 view while internal and beta
 *     surfaces (local development on `localhost` / `127.0.0.1`, and any
 *     non-production deployment) defaulted to the 2.0 view for dogfooding. That
 *     surface split is retained in the helpers below for the one-release rollback
 *     window; PR 13 removes the dual-view machinery entirely.
 *
 * The `?ui=` query parameter is always an explicit, per-visit override and wins
 * over the surface default: `?ui=1` is the one-release rollback to the 1.0 view,
 * and `?ui=2` explicitly selects the 2.0 view (now also the default). Any other
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
 * Hosts that serve the production installer. Before the GA cutover these hosts
 * defaulted to the 1.0 view; the cutover (PR 12) flipped them to the 2.0 view
 * like every other surface, so this list no longer changes the default. It is
 * retained for the one-release rollback window and is matched case-insensitively
 * and exactly (a look-alike host such as `evil-sense360store.github.io` must not
 * be treated as production). PR 13 removes the dual-view machinery entirely.
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

    // No explicit override: the 2.0 view is the default on every surface as of the
    // GA cutover (PR 12). ?ui=1 above stays the one-release rollback to the 1.0
    // view. isProductionHost(hostname) no longer changes the default; it is kept
    // (and still exercised by tests) for the rollback window and is removed with
    // the dual view in PR 13.
    return UI_V2;
}
