// Resolves the correct app.js path for both root deployments (e.g. localhost)
// and the GitHub Pages /WebFlash/ subpath. Externalized from index.html so
// the meta Content-Security-Policy in index.html can keep `script-src 'self'`
// without needing to allow inline scripts.
//
// WF-UX-014 — the app shell entry is loaded with the `?v=` cache-bust token so a
// stale Pages/CDN/service-worker copy of app.js can never be served after a
// UX-only JS deploy. This bootstrap itself is fetched fresh because index.html
// (always revalidated) references it with the same token; the token then flows
// down to app.js and the changed modules it imports. Keep APP_SHELL_BUILD in
// lockstep with the `?v=` query in index.html and the sw.js CACHE_NAME.
const APP_SHELL_BUILD = '20260601';
const { pathname } = window.location;
const inRepoSubpath = pathname === '/WebFlash' || pathname.startsWith('/WebFlash/');
const scriptPath = inRepoSubpath ? '/WebFlash/app.js' : '/app.js';
import(`${scriptPath}?v=${APP_SHELL_BUILD}`);
