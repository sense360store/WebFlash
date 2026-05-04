// Resolves the correct app.js path for both root deployments (e.g. localhost)
// and the GitHub Pages /WebFlash/ subpath. Externalized from index.html so
// the meta Content-Security-Policy in index.html can keep `script-src 'self'`
// without needing to allow inline scripts. Logic is byte-for-byte equivalent
// to the previous inline loader.
const { pathname } = window.location;
const inRepoSubpath = pathname === '/WebFlash' || pathname.startsWith('/WebFlash/');
const scriptPath = inRepoSubpath ? '/WebFlash/app.js' : '/app.js';
import(scriptPath);
