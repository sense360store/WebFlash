/**
 * PR 12 (WebFlash 2.0 migration) — GA cutover.
 *
 * Pins the one-line default flip and the cache bump that ship the 2.0 view as the
 * production default while keeping the 1.0 view reachable at ?ui=1 for one release.
 *
 * The bootstrap runs a dynamic import keyed on window.location at module load, so
 * it is exercised in a real browser, not jsdom. This suite therefore reads the
 * shipped source as text (the same technique the WF-UX-014/015/016/017 cache-bust
 * suites use for bootstrap.js / sw.js) and pins:
 *   - the routing: ?ui=1 -> 1.0 view (app.js); default / ?ui=2 -> 2.0 shell,
 *   - the 2.0 view is the DEFAULT (the old opt-in `ui === '2'` gate is gone),
 *   - CACHE_NAME is bumped so existing installs re-prime the cutover shell,
 *   - the cache-bust token stays in lockstep across the shell,
 *   - neither the activate purge nor the per-asset-class fetch strategy weakened.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');

const bootstrap = read('scripts/bootstrap.js');
const sw = read('sw.js');
const html = read('index.html');
const appJs = read('app.js');

describe('WebFlash 2.0 GA cutover (PR 12) — default flips to the 2.0 view', () => {
  it('keeps ?ui=1 as the explicit 1.0 rollback and makes 2.0 the default', () => {
    // The 1.0 view is now the opt-out, gated behind ?ui=1.
    expect(bootstrap).toMatch(/if \(ui === '1'\) \{/);
    // 2.0 is no longer opt-in: the pre-cutover `ui === '2'` gate must be gone.
    expect(bootstrap).not.toMatch(/ui === '2'/);

    const oneGate = bootstrap.indexOf("ui === '1'");
    const appImport = bootstrap.indexOf('/app.js?v=');
    const elseKw = bootstrap.indexOf('} else {');
    const dataUi = bootstrap.indexOf("setAttribute('data-ui', '2')");
    const shellImport = bootstrap.indexOf('webflash-2/scripts/shell.js?v=');

    // app.js (the 1.0 view) sits inside the ?ui=1 branch, before the else.
    expect(oneGate).toBeGreaterThan(-1);
    expect(appImport).toBeGreaterThan(oneGate);
    expect(appImport).toBeLessThan(elseKw);

    // The default else branch mounts the 2.0 shell and tags data-ui="2".
    expect(elseKw).toBeGreaterThan(-1);
    expect(dataUi).toBeGreaterThan(elseKw);
    expect(shellImport).toBeGreaterThan(elseKw);
  });

  it('mounts both views at the same origin behind the shared cache-bust token', () => {
    expect(bootstrap).toMatch(/APP_SHELL_BUILD\s*=\s*'202606041'/);
    // Both entries thread the token; neither hardcodes a bare URL.
    const tokenedImports = bootstrap.match(/import\(`[^`]*\?v=\$\{APP_SHELL_BUILD\}`\)/g) || [];
    expect(tokenedImports).toHaveLength(2);
  });

  it('bumps sw.js CACHE_NAME to at least webflash-v14 so installs re-prime the cutover shell', () => {
    const m = sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(14);
  });

  it('keeps the cache-bust token in lockstep across index.html, bootstrap.js, app.js, and the app-shell marker', () => {
    const tokenFrom = (re, src) => {
      const m = src.match(re);
      return m ? m[1] : null;
    };
    const bootstrapTag = tokenFrom(/bootstrap\.js\?v=(\d+)/, html);
    const cssToken = tokenFrom(/wizard-style\.css\?v=(\d+)/, html);
    const layoutToken = tokenFrom(/layout\.css\?v=(\d+)/, html);
    const appShellBuild = tokenFrom(/APP_SHELL_BUILD\s*=\s*'(\d+)'/, bootstrap);
    const moduleToken = tokenFrom(/simple-install\.js\?v=(\d+)/, appJs);
    const shellMarker = (html.match(/name="webflash-app-shell"\s+content="([^"]+)"/) || [])[1];

    expect(bootstrapTag).toBe('202606041');
    expect(cssToken).toBe(bootstrapTag);
    expect(layoutToken).toBe(bootstrapTag);
    expect(appShellBuild).toBe(bootstrapTag);
    expect(moduleToken).toBe(bootstrapTag);
    // The support-only marker is the same build in date form (dashes stripped).
    expect(shellMarker.replace(/-/g, '')).toBe(moduleToken);
  });

  it('does not weaken the activate purge or the per-asset-class fetch strategy', () => {
    // The activate handler still purges every non-current webflash-* cache.
    expect(sw).toMatch(/name\.startsWith\('webflash-'\)\s*&&\s*name !== CACHE_NAME/);
    // The cache bump is version-only: network-first + stale-while-revalidate stand.
    expect(sw).toMatch(/url\.pathname\.endsWith\('\.bin'\)/);
    expect(sw).toMatch(/url\.pathname\.endsWith\('manifest\.json'\)/);
    expect(sw).toMatch(/stale-while-revalidate/i);
  });
});
