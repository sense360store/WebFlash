/**
 * Supply-chain and origin hardening guard (REPO-CUSTOMER-READY-001 S8).
 *
 * ESP Web Tools is vendored under vendor/esp-web-tools/ and index.html's meta
 * Content-Security-Policy is script-src 'self'. These tests pin that posture:
 *
 *   1. The meta CSP's script-src contains no remote origin — 'self' only. A
 *      reintroduced CDN origin (unpkg or any https:/http: source) fails here
 *      before it can ship.
 *   2. No file under vendor/ references unpkg — the vendored tree must be
 *      fully self-contained, never a shim that re-fetches from the CDN.
 *   3. index.html actually loads the vendored entry module and carries no
 *      unpkg reference, so the tightened CSP cannot silently break the
 *      installer by blocking a leftover remote script tag.
 *   4. scripts/origin-guard.js stays wired into the bootstrap and names the
 *      canonical deployment, so the non-canonical-origin warning cannot be
 *      dropped without failing CI.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');

function extractMetaCsp(html) {
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i,
  );
  return match ? match[1] : null;
}

function parseDirectives(csp) {
  const directives = new Map();
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      directives.set(tokens[0].toLowerCase(), tokens.slice(1));
    }
  }
  return directives;
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe('index.html meta CSP', () => {
  const csp = extractMetaCsp(indexHtml);

  test('a meta Content-Security-Policy is present', () => {
    expect(csp).toBeTruthy();
  });

  test("script-src is exactly 'self' — no remote script origin", () => {
    const directives = parseDirectives(csp);
    expect(directives.get('script-src')).toEqual(["'self'"]);
  });

  test('no directive lists a remote script host (unpkg or any scheme-full source)', () => {
    const directives = parseDirectives(csp);
    for (const key of ['default-src', 'script-src', 'worker-src']) {
      const sources = directives.get(key) ?? [];
      for (const source of sources) {
        expect(source).not.toMatch(/^https?:\/\//i);
        expect(source).not.toContain('unpkg');
      }
    }
  });
});

describe('vendored ESP Web Tools tree', () => {
  const vendorDir = join(ROOT, 'vendor');
  const vendorFiles = listFilesRecursive(vendorDir);

  test('vendor/esp-web-tools contains the entry module', () => {
    expect(
      vendorFiles.some((f) => f.endsWith(join('esp-web-tools', 'install-button.js'))),
    ).toBe(true);
  });

  test('no file under vendor/ references unpkg', () => {
    for (const file of vendorFiles) {
      const content = readFileSync(file, 'utf8');
      expect({ file, referencesUnpkg: content.includes('unpkg') }).toEqual({
        file,
        referencesUnpkg: false,
      });
    }
  });
});

describe('index.html script loading', () => {
  test('loads ESP Web Tools from the vendored path', () => {
    expect(indexHtml).toContain(
      '<script type="module" src="./vendor/esp-web-tools/install-button.js"></script>',
    );
  });

  test('carries no unpkg reference and no SRI attribute for a remote script', () => {
    expect(indexHtml).not.toContain('unpkg');
    expect(indexHtml).not.toContain('integrity=');
    expect(indexHtml).not.toContain('crossorigin=');
  });
});

describe('origin guard wiring', () => {
  const bootstrap = readFileSync(join(ROOT, 'scripts', 'bootstrap.js'), 'utf8');
  const originGuard = readFileSync(join(ROOT, 'scripts', 'origin-guard.js'), 'utf8');

  test('bootstrap.js imports scripts/origin-guard.js', () => {
    expect(bootstrap).toMatch(/import\s+['"]\.\/origin-guard\.js['"]/);
  });

  test('origin-guard names the canonical origin and installer URL', () => {
    expect(originGuard).toContain("'https://sense360store.github.io'");
    expect(originGuard).toContain("'https://sense360store.github.io/WebFlash/'");
  });
});
