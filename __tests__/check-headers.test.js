import { describe, test, expect } from '@jest/globals';
import {
  evaluateHeaders,
  isLocalhostHost,
  isGitHubPagesHost,
  parseCspDirectives,
  parseMaxAgeSeconds,
  cacheAllowsRevalidation
} from '../scripts/check-headers.js';

const FULL_HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://fonts.googleapis.com; frame-ancestors 'none'; object-src 'none'",
  'permissions-policy': 'serial=(self), usb=(self), camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'cross-origin',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY'
};

function findingsByCode(findings) {
  return new Map(findings.map((f) => [f.code, f]));
}

describe('check-headers helpers', () => {
  test('isLocalhostHost matches loopback names case-insensitively', () => {
    expect(isLocalhostHost('localhost')).toBe(true);
    expect(isLocalhostHost('LOCALHOST')).toBe(true);
    expect(isLocalhostHost('127.0.0.1')).toBe(true);
    expect(isLocalhostHost('::1')).toBe(true);
    expect(isLocalhostHost('example.com')).toBe(false);
    expect(isLocalhostHost('')).toBe(false);
  });

  test('isGitHubPagesHost matches *.github.io', () => {
    expect(isGitHubPagesHost('sense360store.github.io')).toBe(true);
    expect(isGitHubPagesHost('foo.bar.github.io')).toBe(true);
    expect(isGitHubPagesHost('github.io')).toBe(false);
    expect(isGitHubPagesHost('example.com')).toBe(false);
  });

  test('parseCspDirectives splits on semicolons and lowercases names', () => {
    const directives = parseCspDirectives(
      "default-src 'self'; script-src 'self' https://unpkg.com; FRAME-ancestors 'none'"
    );
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['script-src']).toEqual(["'self'", 'https://unpkg.com']);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
  });

  test('parseMaxAgeSeconds extracts numeric value', () => {
    expect(parseMaxAgeSeconds('public, max-age=31536000')).toBe(31536000);
    expect(parseMaxAgeSeconds('max-age=0')).toBe(0);
    expect(parseMaxAgeSeconds('no-cache')).toBeNull();
    expect(parseMaxAgeSeconds(null)).toBeNull();
  });

  test('cacheAllowsRevalidation detects revalidation directives', () => {
    expect(cacheAllowsRevalidation('public, max-age=60, must-revalidate')).toBe(true);
    expect(cacheAllowsRevalidation('no-cache')).toBe(true);
    expect(cacheAllowsRevalidation('no-store')).toBe(true);
    expect(cacheAllowsRevalidation('public, max-age=60')).toBe(false);
  });
});

describe('evaluateHeaders', () => {
  test('returns INVALID_URL when URL cannot be parsed', () => {
    const findings = evaluateHeaders('not a url', null);
    expect(findings.map((f) => f.code)).toContain('INVALID_URL');
  });

  test('HTTPS production host with full headers passes everything', () => {
    const findings = evaluateHeaders('https://example.com/', FULL_HEADERS);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('HTTPS_PRESENT');
    expect(codes).toContain('CSP_PRESENT');
    expect(codes).toContain('PERMISSIONS_POLICY_PRESENT');
    expect(codes).toContain('FRAME_PROTECTION_PRESENT');
    expect(codes).toContain('COOP_PRESENT');
    expect(codes).toContain('CORP_PRESENT');
    expect(codes).toContain('REFERRER_POLICY_PRESENT');
    expect(findings.filter((f) => f.severity === 'fail')).toHaveLength(0);
  });

  test('HTTP non-localhost fails INSECURE_SCHEME', () => {
    const findings = evaluateHeaders('http://example.com/', FULL_HEADERS);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('INSECURE_SCHEME');
    expect(findings.find((f) => f.code === 'INSECURE_SCHEME').severity).toBe('fail');
  });

  test('HTTP localhost does NOT fail INSECURE_SCHEME', () => {
    const findings = evaluateHeaders('http://localhost:5000/', {});
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain('INSECURE_SCHEME');
    expect(codes).toContain('LOCALHOST_SCHEME_OK');
  });

  test('localhost downgrades missing CSP and Permissions-Policy from fail to warn', () => {
    const findings = evaluateHeaders('http://localhost:5000/', {});
    const map = findingsByCode(findings);
    expect(map.get('CSP_MISSING').severity).toBe('warn');
    expect(map.get('PERMISSIONS_POLICY_MISSING').severity).toBe('warn');
    expect(findings.filter((f) => f.severity === 'fail')).toHaveLength(0);
  });

  test('GitHub Pages host emits GITHUB_PAGES_HEADERS_INERT and downgrades missing headers to warn', () => {
    const findings = evaluateHeaders('https://sense360store.github.io/WebFlash/', {});
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('GITHUB_PAGES_HEADERS_INERT');
    const map = findingsByCode(findings);
    expect(map.get('CSP_MISSING').severity).toBe('warn');
    expect(map.get('PERMISSIONS_POLICY_MISSING').severity).toBe('warn');
    expect(findings.filter((f) => f.severity === 'fail')).toHaveLength(0);
  });

  test('non-GitHub-Pages production host without CSP fails CSP_MISSING', () => {
    const findings = evaluateHeaders('https://example.com/', {});
    const map = findingsByCode(findings);
    expect(map.get('CSP_MISSING').severity).toBe('fail');
    expect(map.get('PERMISSIONS_POLICY_MISSING').severity).toBe('fail');
  });

  test("CSP with 'unsafe-inline' in script-src fails CSP_UNSAFE_INLINE", () => {
    const headers = {
      ...FULL_HEADERS,
      'content-security-policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
    };
    const findings = evaluateHeaders('https://example.com/', headers);
    const map = findingsByCode(findings);
    expect(map.get('CSP_UNSAFE_INLINE').severity).toBe('fail');
  });

  test("CSP with 'unsafe-eval' fails CSP_UNSAFE_EVAL", () => {
    const headers = {
      ...FULL_HEADERS,
      'content-security-policy':
        "default-src 'self'; script-src 'self' 'unsafe-eval'; frame-ancestors 'none'"
    };
    const findings = evaluateHeaders('https://example.com/', headers);
    const map = findingsByCode(findings);
    expect(map.get('CSP_UNSAFE_EVAL').severity).toBe('fail');
  });

  test('CSP with broad third-party script source warns', () => {
    const headers = {
      ...FULL_HEADERS,
      'content-security-policy':
        "default-src 'self'; script-src 'self' https://evil.example.com; frame-ancestors 'none'"
    };
    const findings = evaluateHeaders('https://example.com/', headers);
    const map = findingsByCode(findings);
    expect(map.get('CSP_BROAD_SCRIPT_HOST').severity).toBe('warn');
  });

  test('Permissions-Policy without serial/usb directives warns', () => {
    const headers = {
      ...FULL_HEADERS,
      'permissions-policy': 'camera=(), microphone=()'
    };
    const findings = evaluateHeaders('https://example.com/', headers);
    const map = findingsByCode(findings);
    expect(map.get('PERMISSIONS_POLICY_MISSING_DIRECTIVES').severity).toBe('warn');
  });

  test('missing COOP / CORP / Referrer-Policy each warn individually', () => {
    const headers = {
      'content-security-policy': "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
      'permissions-policy': 'serial=(self), usb=(self)',
      'x-frame-options': 'DENY'
    };
    const findings = evaluateHeaders('https://example.com/', headers);
    const map = findingsByCode(findings);
    expect(map.get('COOP_MISSING').severity).toBe('warn');
    expect(map.get('CORP_MISSING').severity).toBe('warn');
    expect(map.get('REFERRER_POLICY_MISSING').severity).toBe('warn');
  });

  test('missing both X-Frame-Options and CSP frame-ancestors warns', () => {
    const headers = {
      ...FULL_HEADERS,
      'content-security-policy': "default-src 'self'; script-src 'self' https://unpkg.com"
    };
    delete headers['x-frame-options'];
    const findings = evaluateHeaders('https://example.com/', headers);
    const map = findingsByCode(findings);
    expect(map.get('FRAME_PROTECTION_MISSING').severity).toBe('warn');
  });

  test('manifest Cache-Control with long max-age and no revalidation fails', () => {
    const findings = evaluateHeaders('https://example.com/', FULL_HEADERS, {
      manifestProbed: true,
      manifestCacheControl: 'public, max-age=31536000'
    });
    const map = findingsByCode(findings);
    expect(map.get('MANIFEST_CACHE_TOO_AGGRESSIVE').severity).toBe('fail');
  });

  test('manifest Cache-Control with no-cache or must-revalidate passes', () => {
    const findings = evaluateHeaders('https://example.com/', FULL_HEADERS, {
      manifestProbed: true,
      manifestCacheControl: 'no-cache, must-revalidate'
    });
    const map = findingsByCode(findings);
    expect(map.get('MANIFEST_CACHE_OK').severity).toBe('pass');
  });

  test('manifest Cache-Control short max-age passes', () => {
    const findings = evaluateHeaders('https://example.com/', FULL_HEADERS, {
      manifestProbed: true,
      manifestCacheControl: 'public, max-age=60'
    });
    const map = findingsByCode(findings);
    expect(map.get('MANIFEST_CACHE_OK').severity).toBe('pass');
  });

  test('manifest probe was attempted but Cache-Control missing warns', () => {
    const findings = evaluateHeaders('https://example.com/', FULL_HEADERS, {
      manifestProbed: true,
      manifestCacheControl: null
    });
    const map = findingsByCode(findings);
    expect(map.get('MANIFEST_CACHE_CONTROL_MISSING').severity).toBe('warn');
  });

  test('manifest probe not attempted skips manifest findings', () => {
    const findings = evaluateHeaders('https://example.com/', FULL_HEADERS, {
      manifestProbed: false
    });
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain('MANIFEST_CACHE_OK');
    expect(codes).not.toContain('MANIFEST_CACHE_CONTROL_MISSING');
    expect(codes).not.toContain('MANIFEST_CACHE_TOO_AGGRESSIVE');
  });

  test('accepts a Headers-like object with .get()', () => {
    const headers = new Map(Object.entries(FULL_HEADERS));
    headers.get = (name) => Object.entries(FULL_HEADERS).find(
      ([k]) => k.toLowerCase() === name.toLowerCase()
    )?.[1] ?? null;
    const findings = evaluateHeaders('https://example.com/', headers);
    expect(findings.find((f) => f.code === 'CSP_PRESENT').severity).toBe('pass');
  });
});
