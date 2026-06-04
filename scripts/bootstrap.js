// Resolves the correct app entry for both root deployments (e.g. localhost) and
// the GitHub Pages /WebFlash/ subpath. Externalized from index.html so the meta
// Content-Security-Policy in index.html can keep `script-src 'self'` without
// needing to allow inline scripts.
//
// WebFlash 2.0 migration: this is the single shared bootstrap for both views.
// Which view renders by default is decided per surface by resolveUiVersion()
// (scripts/ui-version.js): production (sense360store.github.io) defaults to the
// 1.0 view (app.js), and the internal / beta surfaces default to the 2.0 view
// (webflash-2/scripts/shell.js). Either way the 2.0 view mounts inside the SAME
// production shell, so it inherits this page's CSP, service worker, manifest,
// and headers. ?ui=1 and ?ui=2 are explicit per-visit overrides; ?ui=1 is the
// fallback to the 1.0 view on the beta surface and ?ui=2 is the opt-in to the
// 2.0 view on production. The production default stays the 1.0 view until the GA
// cutover, which is the single commit that flips it.
//
// WF-UX-014 — the app entry is loaded with the `?v=` cache-bust token so a stale
// Pages/CDN/service-worker copy can never be served after a UX-only JS deploy.
// This bootstrap itself is fetched fresh because index.html (always revalidated)
// references it with the same token; the token then flows down to the entry and
// the changed modules it imports. The static ui-version.js import has no token
// and rides the sw.js CACHE_NAME bump to re-prime, exactly like state.js. Keep
// APP_SHELL_BUILD in lockstep with the `?v=` query in index.html and the sw.js
// CACHE_NAME.
import { resolveUiVersion } from './ui-version.js';

const APP_SHELL_BUILD = '202606041';
const { pathname, search, hostname } = window.location;
const inRepoSubpath = pathname === '/WebFlash' || pathname.startsWith('/WebFlash/');
const base = inRepoSubpath ? '/WebFlash' : '';

if (resolveUiVersion(search, hostname) === '2') {
    document.documentElement.setAttribute('data-ui', '2');
    import(`${base}/webflash-2/scripts/shell.js?v=${APP_SHELL_BUILD}`);
} else {
    import(`${base}/app.js?v=${APP_SHELL_BUILD}`);
}
