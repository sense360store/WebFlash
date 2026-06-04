// Resolves the correct app entry for both root deployments (e.g. localhost) and
// the GitHub Pages /WebFlash/ subpath. Externalized from index.html so the meta
// Content-Security-Policy in index.html can keep `script-src 'self'` without
// needing to allow inline scripts.
//
// WebFlash 2.0 migration (PR 3): this is the single shared bootstrap for both
// views. The default (?ui=1, or no ?ui) loads the 1.0 view (app.js) unchanged.
// ?ui=2 loads the 2.0 view inside the SAME production shell (webflash-2/scripts/
// shell.js), so the 2.0 view inherits this page's CSP, service worker, manifest,
// and headers. The default stays ?ui=1 until the GA cutover (PR 12).
//
// WF-UX-014 — the app entry is loaded with the `?v=` cache-bust token so a stale
// Pages/CDN/service-worker copy can never be served after a UX-only JS deploy.
// This bootstrap itself is fetched fresh because index.html (always revalidated)
// references it with the same token; the token then flows down to the entry and
// the changed modules it imports. Keep APP_SHELL_BUILD in lockstep with the `?v=`
// query in index.html and the sw.js CACHE_NAME.
const APP_SHELL_BUILD = '202606016';
const { pathname, search } = window.location;
const inRepoSubpath = pathname === '/WebFlash' || pathname.startsWith('/WebFlash/');
const base = inRepoSubpath ? '/WebFlash' : '';

const ui = new URLSearchParams(search).get('ui');
if (ui === '2') {
    document.documentElement.setAttribute('data-ui', '2');
    import(`${base}/webflash-2/scripts/shell.js?v=${APP_SHELL_BUILD}`);
} else {
    import(`${base}/app.js?v=${APP_SHELL_BUILD}`);
}
