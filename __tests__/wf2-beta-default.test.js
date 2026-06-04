/**
 * PR 11 (WebFlash 2.0 migration) — Beta default + S360-410 evidence gate.
 *
 * PR 11 makes ?ui=2 the default on the internal and beta surface while keeping
 * the production default at ?ui=1 and ?ui=1 as the always-available fallback.
 * The surface-resolution rule lives in scripts/ui-version.js as a pure function
 * so it can be unit tested without the bootstrap's dynamic-import side effect
 * (the bootstrap branch itself is exercised in a browser, not jsdom — see
 * wf2-mount-shell.test.js).
 *
 * This suite pins:
 *   - production still defaults to the 1.0 view (unchanged),
 *   - the internal / beta surfaces default to the 2.0 view,
 *   - ?ui=1 and ?ui=2 always override the surface default,
 *   - the bootstrap wires the resolver and the new module is precached and
 *     cache-busted in lockstep (deploy correctness).
 *
 * Nothing here flips the production default — that is the separate GA cutover,
 * gated on real S360-410 PoE flash evidence.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
    resolveUiVersion,
    isProductionHost,
    PRODUCTION_HOSTS,
    UI_V1,
    UI_V2,
} from '../scripts/ui-version.js';

const REPO_ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');

describe('PR 11 — production surface default is unchanged (1.0 view)', () => {
    it('defaults to the 1.0 view on the production GitHub Pages host with no ?ui=', () => {
        expect(resolveUiVersion('', 'sense360store.github.io')).toBe('1');
        expect(resolveUiVersion('?foo=bar', 'sense360store.github.io')).toBe('1');
    });

    it('matches the production host case-insensitively', () => {
        expect(isProductionHost('sense360store.github.io')).toBe(true);
        expect(isProductionHost('SENSE360STORE.GITHUB.IO')).toBe(true);
        expect(resolveUiVersion('', 'Sense360Store.GitHub.io')).toBe('1');
    });

    it('still honours ?ui=2 as a per-visit opt-in to the 2.0 view on production', () => {
        expect(resolveUiVersion('?ui=2', 'sense360store.github.io')).toBe('2');
    });

    it('still honours ?ui=1 on production', () => {
        expect(resolveUiVersion('?ui=1', 'sense360store.github.io')).toBe('1');
    });

    it('a look-alike host is not production (exact match only)', () => {
        expect(isProductionHost('evil-sense360store.github.io')).toBe(false);
        expect(isProductionHost('sense360store.github.io.evil.test')).toBe(false);
        expect(resolveUiVersion('', 'evil-sense360store.github.io')).toBe('2');
    });
});

describe('PR 11 — internal and beta surfaces default to the 2.0 view', () => {
    const betaHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '', // file:// has an empty hostname
        'neil.github.io', // a fork / preview Pages host
        'webflash-beta.example', // a future internal/beta origin
    ];

    it.each(betaHosts)('defaults to the 2.0 view on the non-production host %p', (host) => {
        expect(isProductionHost(host)).toBe(false);
        expect(resolveUiVersion('', host)).toBe('2');
    });

    it('keeps ?ui=1 as the working fallback to the 1.0 view on the beta surface', () => {
        expect(resolveUiVersion('?ui=1', 'localhost')).toBe('1');
    });

    it('still serves ?ui=2 explicitly on the beta surface', () => {
        expect(resolveUiVersion('?ui=2', 'localhost')).toBe('2');
    });
});

describe('PR 11 — only ?ui=1 / ?ui=2 are honoured as overrides', () => {
    it('ignores an unrecognised ?ui= value and falls back to the surface default', () => {
        // Production keeps the 1.0 view; beta keeps the 2.0 view.
        expect(resolveUiVersion('?ui=3', 'sense360store.github.io')).toBe('1');
        expect(resolveUiVersion('?ui=foo', 'sense360store.github.io')).toBe('1');
        expect(resolveUiVersion('?ui=', 'localhost')).toBe('2');
        expect(resolveUiVersion('?ui=22', 'localhost')).toBe('2');
    });

    it('tolerates an absent search string and an absent hostname', () => {
        expect(resolveUiVersion(undefined, undefined)).toBe('2'); // no host => not production
        expect(resolveUiVersion(undefined, 'sense360store.github.io')).toBe('1');
    });

    it('exports the canonical flag values and a single production host', () => {
        expect(UI_V1).toBe('1');
        expect(UI_V2).toBe('2');
        expect([...PRODUCTION_HOSTS]).toEqual(['sense360store.github.io']);
        expect(Object.isFrozen(PRODUCTION_HOSTS)).toBe(true);
    });
});

describe('PR 11 — bootstrap wiring and deploy correctness', () => {
    const bootstrap = read('scripts/bootstrap.js');
    const sw = read('sw.js');
    const html = read('index.html');
    const appJs = read('app.js');

    it('bootstrap.js resolves the entry through resolveUiVersion (not an inline ?ui check)', () => {
        expect(bootstrap).toMatch(/import\s*\{\s*resolveUiVersion\s*\}\s*from\s*['"]\.\/ui-version\.js['"]/);
        expect(bootstrap).toMatch(/resolveUiVersion\(\s*search\s*,\s*hostname\s*\)/);
        // The old inline `ui === '2'` gate is gone.
        expect(bootstrap).not.toMatch(/const\s+ui\s*=\s*new\s+URLSearchParams/);
    });

    it('bootstrap.js still mounts both entries inside the production shell with the cache-bust token', () => {
        expect(bootstrap).toMatch(/webflash-2\/scripts\/shell\.js\?v=\$\{APP_SHELL_BUILD\}/);
        expect(bootstrap).toMatch(/\/app\.js\?v=\$\{APP_SHELL_BUILD\}/);
    });

    it('the new resolver module is precached for offline use', () => {
        expect(sw).toMatch(/['"]\.\/scripts\/ui-version\.js['"]/);
    });

    it('the changed shell re-primes: CACHE_NAME bumped past v13 and tokens in lockstep', () => {
        const cacheV = Number(sw.match(/CACHE_NAME\s*=\s*'webflash-v(\d+)'/)[1]);
        expect(cacheV).toBeGreaterThanOrEqual(14);

        const tokenFrom = (re, src) => { const m = src.match(re); return m ? m[1] : null; };
        const bootstrapTag = tokenFrom(/bootstrap\.js\?v=(\d+)/, html);
        const cssToken = tokenFrom(/wizard-style\.css\?v=(\d+)/, html);
        const appShellBuild = tokenFrom(/APP_SHELL_BUILD\s*=\s*['"](\d+)['"]/, bootstrap);
        const moduleToken = tokenFrom(/simple-install\.js\?v=(\d+)/, appJs);
        const shellMarker = (html.match(/name="webflash-app-shell"\s+content="([^"]+)"/) || [])[1];

        expect(bootstrapTag).not.toBeNull();
        expect(bootstrapTag).toBe(cssToken);
        expect(bootstrapTag).toBe(appShellBuild);
        expect(bootstrapTag).toBe(moduleToken);
        expect(shellMarker.replace(/-/g, '')).toBe(moduleToken);
    });
});
