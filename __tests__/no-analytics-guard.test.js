/**
 * No-analytics trust guard (REPO-CUSTOMER-READY-001 S12).
 *
 * The trust statement in docs/firmware-provenance.md ("No analytics") promises
 * that the page makes no third party network request: no analytics, no
 * tracking, no phoning home. The enforcement is the Content-Security-Policy's
 * connect-src directive, which must allow exactly 'self' and blob: — nothing
 * else. This guard pins that directive in both policy sources (the meta CSP in
 * index.html, which is what GitHub Pages enforces, and the `_headers` file for
 * hosts that honour it) so a widened connect-src fails CI before it can ship.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

describe('no-analytics guard — connect-src stays \'self\' + blob: only', () => {
  test('index.html meta CSP connect-src is exactly \'self\' and blob:', () => {
    const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const match = indexHtml.match(
      /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i,
    );
    expect(match).toBeTruthy();
    const directives = parseDirectives(match[1]);
    expect(directives.get('connect-src')).toEqual(["'self'", 'blob:']);
  });

  test('_headers CSP connect-src is exactly \'self\' and blob:', () => {
    const headersFile = readFileSync(join(ROOT, '_headers'), 'utf8');
    const cspLine = headersFile
      .split('\n')
      .find((line) => line.trim().toLowerCase().startsWith('content-security-policy:'));
    expect(cspLine).toBeTruthy();
    const csp = cspLine.slice(cspLine.indexOf(':') + 1).trim();
    const directives = parseDirectives(csp);
    expect(directives.get('connect-src')).toEqual(["'self'", 'blob:']);
  });
});
