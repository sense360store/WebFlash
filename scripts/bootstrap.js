// Resolves the correct app entry for both root deployments (e.g. localhost) and
// the GitHub Pages /WebFlash/ subpath. Externalized from index.html so the meta
// Content-Security-Policy in index.html can keep `script-src 'self'` without
// needing to allow inline scripts.
//
// WebFlash 2.0 migration (PR 13): the 1.0 view and the dual-view `?ui` flag were
// removed after the GA cutover (PR 12) soaked one stable release. The 2.0 view is
// now the only view. This bootstrap mounts it from scripts/shell.js inside this
// production shell, so the view inherits this page's CSP, service worker,
// manifest, and headers. There is no second site, no `?ui=1` fallback, and no
// surface-resolution branch any more (scripts/ui-version.js was deleted).
//
// The `?v=` cache-bust token (APP_SHELL_BUILD) is fetched fresh because
// index.html (always revalidated) references this loader with the same token; the
// token then flows down to scripts/shell.js. The deeper 2.0 modules shell.js
// imports carry no token and re-prime on the sw.js CACHE_NAME bump, exactly like
// state.js. Keep APP_SHELL_BUILD in lockstep with the `?v=` query in index.html
// and the sw.js CACHE_NAME. See docs/deploy-notes.md.
const APP_SHELL_BUILD = '202607031';
const { pathname } = window.location;
const inRepoSubpath = pathname === '/WebFlash' || pathname.startsWith('/WebFlash/');
const base = inRepoSubpath ? '/WebFlash' : '';

document.documentElement.setAttribute('data-ui', '2');
import(`${base}/scripts/shell.js?v=${APP_SHELL_BUILD}`);
