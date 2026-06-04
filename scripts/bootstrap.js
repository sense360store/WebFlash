// Resolves the correct app entry for both root deployments (e.g. localhost) and
// the GitHub Pages /WebFlash/ subpath. Externalized from index.html so the meta
// Content-Security-Policy in index.html can keep `script-src 'self'` without
// needing to allow inline scripts.
//
// WebFlash 2.0 migration: this is the single shared bootstrap for both views.
// As of the GA cutover (PR 12) the default (no ?ui, or ?ui=2) loads the 2.0 view
// inside the SAME production shell (webflash-2/scripts/shell.js), so it inherits
// this page's CSP, service worker, manifest, and headers. The 1.0 view (app.js)
// stays reachable at ?ui=1 as the one-release rollback fallback; PR 13 removes it.
//
// WF-UX-014 — the app entry is loaded with the `?v=` cache-bust token so a stale
// Pages/CDN/service-worker copy can never be served after a UX-only JS deploy.
// This bootstrap itself is fetched fresh because index.html (always revalidated)
// references it with the same token; the token then flows down to the entry and
// the changed modules it imports. Keep APP_SHELL_BUILD in lockstep with the `?v=`
// query in index.html and the sw.js CACHE_NAME.
const APP_SHELL_BUILD = '202606041';
const { pathname, search } = window.location;
const inRepoSubpath = pathname === '/WebFlash' || pathname.startsWith('/WebFlash/');
const base = inRepoSubpath ? '/WebFlash' : '';

// PR 12 GA cutover: 2.0 is the default; ?ui=1 is the explicit 1.0 rollback.
const ui = new URLSearchParams(search).get('ui');
if (ui === '1') {
    import(`${base}/app.js?v=${APP_SHELL_BUILD}`);
} else {
    document.documentElement.setAttribute('data-ui', '2');
    import(`${base}/webflash-2/scripts/shell.js?v=${APP_SHELL_BUILD}`);
}
