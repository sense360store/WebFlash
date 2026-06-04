/**
 * PR 12 (WebFlash 2.0 migration) — GA cutover.
 *
 * PR 11 (wf2-beta-default.test.js) set up scripts/ui-version.js as a host-aware
 * resolver: production defaulted to the 1.0 view, internal/beta surfaces to the
 * 2.0 view, with ?ui=1 / ?ui=2 as explicit per-visit overrides. PR 12 is the
 * single commit that flips the PRODUCTION default to the 2.0 view, so the 2.0
 * view is now the default on every surface and ?ui=1 is the one-release rollback.
 *
 * This suite pins the cutover delta and its deploy correctness:
 *   - resolveUiVersion now returns the 2.0 view as the surface default on the
 *     production host (the flip), while ?ui=1 still falls back to the 1.0 view,
 *   - bootstrap.js still resolves the entry through resolveUiVersion,
 *   - the changed tokenless resolver re-primes: CACHE_NAME is bumped past PR 11's
 *     webflash-v14 and the cache-bust token moves in lockstep,
 *   - the activate purge and the per-asset-class fetch strategy are unchanged.
 *
 * resolveUiVersion is pure, so it is unit tested directly; the bootstrap's
 * location-keyed dynamic import is exercised in a browser, not jsdom, so the
 * wiring is asserted by reading the shipped source (as the cache-bust suites do).
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { resolveUiVersion, isProductionHost } from '../scripts/ui-version.js';
import { BUILD_INFO } from '../scripts/build-info.js';

const REPO_ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');

const PROD_HOST = 'sense360store.github.io';

describe('WebFlash 2.0 GA cutover (PR 12) — production now defaults to the 2.0 view', () => {
  it('defaults the production host to the 2.0 view with no ?ui= (the cutover flip)', () => {
    expect(resolveUiVersion('', PROD_HOST)).toBe('2');
    expect(resolveUiVersion('?foo=bar', PROD_HOST)).toBe('2');
    // Case-insensitive host match still resolves to the 2.0 default.
    expect(resolveUiVersion('', 'Sense360Store.GitHub.io')).toBe('2');
  });

  it('keeps ?ui=1 as the working one-release rollback to the 1.0 view on production', () => {
    expect(resolveUiVersion('?ui=1', PROD_HOST)).toBe('1');
  });

  it('still serves ?ui=2 explicitly (now redundant with the default) on production', () => {
    expect(resolveUiVersion('?ui=2', PROD_HOST)).toBe('2');
  });

  it('defaults every other surface to the 2.0 view too, with ?ui=1 still the fallback', () => {
    for (const host of ['localhost', '127.0.0.1', '', 'neil.github.io', undefined]) {
      expect(resolveUiVersion('', host)).toBe('2');
    }
    expect(resolveUiVersion('?ui=1', 'localhost')).toBe('1');
  });

  it('treats an unrecognised ?ui= value as the 2.0 surface default on every host', () => {
    expect(resolveUiVersion('?ui=3', PROD_HOST)).toBe('2');
    expect(resolveUiVersion('?ui=foo', PROD_HOST)).toBe('2');
    expect(resolveUiVersion('?ui=', 'localhost')).toBe('2');
  });

  it('retains isProductionHost as a helper even though it no longer gates the default', () => {
    expect(isProductionHost(PROD_HOST)).toBe(true);
    expect(isProductionHost('evil-sense360store.github.io')).toBe(false);
  });
});

describe('WebFlash 2.0 GA cutover (PR 12) — deploy correctness', () => {
  const bootstrap = read('scripts/bootstrap.js');
  const sw = read('sw.js');
  const html = read('index.html');
  const appJs = read('app.js');

  it('bootstrap.js still resolves the entry through resolveUiVersion and mounts both at one origin', () => {
    expect(bootstrap).toMatch(/import\s*\{\s*resolveUiVersion\s*\}\s*from\s*['"]\.\/ui-version\.js['"]/);
    expect(bootstrap).toMatch(/resolveUiVersion\(\s*search\s*,\s*hostname\s*\)/);
    expect(bootstrap).toMatch(/webflash-2\/scripts\/shell\.js\?v=\$\{APP_SHELL_BUILD\}/);
    expect(bootstrap).toMatch(/\/app\.js\?v=\$\{APP_SHELL_BUILD\}/);
    // The 2.0 view tags data-ui="2"; the 1.0 fallback does not.
    expect(bootstrap).toMatch(/setAttribute\('data-ui', '2'\)/);
  });

  it('bumps sw.js CACHE_NAME past PR 11 (webflash-v14) so the changed resolver re-primes', () => {
    const m = sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(15);
  });

  it('keeps the new resolver module precached for offline use', () => {
    expect(sw).toMatch(/['"]\.\/scripts\/ui-version\.js['"]/);
  });

  it('keeps the cache-bust token in lockstep across index.html, bootstrap.js, app.js, build-info.js, and the app-shell marker', () => {
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

    expect(bootstrapTag).toBe('202606042');
    expect(cssToken).toBe(bootstrapTag);
    expect(layoutToken).toBe(bootstrapTag);
    expect(appShellBuild).toBe(bootstrapTag);
    expect(moduleToken).toBe(bootstrapTag);
    // The support-only markers are the same build in date form (dashes stripped).
    expect(shellMarker.replace(/-/g, '')).toBe(moduleToken);
    expect(String(BUILD_INFO.appShell).replace(/-/g, '')).toBe(moduleToken);
  });

  it('does not weaken the activate purge or the per-asset-class fetch strategy', () => {
    expect(sw).toMatch(/name\.startsWith\('webflash-'\)\s*&&\s*name !== CACHE_NAME/);
    expect(sw).toMatch(/url\.pathname\.endsWith\('\.bin'\)/);
    expect(sw).toMatch(/url\.pathname\.endsWith\('manifest\.json'\)/);
    expect(sw).toMatch(/stale-while-revalidate/i);
  });
});
