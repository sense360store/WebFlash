#!/usr/bin/env node
// Audits the security-relevant response headers of a deployed WebFlash URL.
//
// Usage:
//   node scripts/check-headers.js <URL> [--json]
//   npm run check:headers -- https://sense360store.github.io/WebFlash/
//
// Findings are classified as `pass`, `warn`, or `fail`. Exit codes:
//   0  no `fail` findings
//   1  one or more `fail` findings
//   2  usage error (no URL or unparseable URL)
//
// Localhost (`localhost`, `127.0.0.1`, `::1`) is treated as a development
// host: the HTTPS-required rule is skipped, and missing CSP / Permissions-
// Policy are downgraded from `fail` to `warn`. GitHub Pages hosts
// (`*.github.io`) get the same downgrade plus an extra info finding
// pointing at the meta-CSP fallback in index.html, because GitHub Pages
// does not honor the repo-root `_headers` file.

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const PERMISSIONS_POLICY_DIRECTIVES = ['serial', 'usb'];

// REPO-CUSTOMER-READY-001 S12 — the expected script-src is 'self' only: ESP Web
// Tools is vendored under vendor/esp-web-tools/ (S8), so no remote script host
// is documented as allowed and any third-party script source now warns.
const KNOWN_BROAD_SCRIPT_HOSTS = new Set([]);

function isLocalhostHost(hostname) {
  if (!hostname) return false;
  return LOCALHOST_HOSTS.has(hostname.toLowerCase());
}

function isGitHubPagesHost(hostname) {
  if (!hostname) return false;
  return hostname.toLowerCase().endsWith('.github.io');
}

function lookupHeader(headers, name) {
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return value == null ? null : value;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

function parseCspDirectives(cspValue) {
  if (!cspValue) return {};
  const directives = {};
  for (const part of cspValue.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...tokens] = trimmed.split(/\s+/);
    directives[name.toLowerCase()] = tokens;
  }
  return directives;
}

function parseMaxAgeSeconds(cacheControl) {
  if (!cacheControl) return null;
  const match = cacheControl.match(/max-age\s*=\s*(\d+)/i);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function cacheAllowsRevalidation(cacheControl) {
  if (!cacheControl) return false;
  return /no-cache|must-revalidate|no-store/i.test(cacheControl);
}

/**
 * Pure header evaluator. Used both by the CLI and by the unit tests; does
 * no I/O.
 *
 * @param {string} url - The URL that was probed.
 * @param {Headers|Record<string,string>|null} headers - Response headers
 *   for the URL (Web `Headers` object or a plain object). May be `null`
 *   when the network probe failed.
 * @param {object} [options]
 * @param {string} [options.manifestCacheControl] - Cache-Control value of
 *   `<URL>/manifest.json` if separately probed.
 * @param {boolean} [options.manifestProbed] - True when manifest probe
 *   was attempted (regardless of outcome).
 * @returns {Array<{code:string, severity:string, message:string, header?:string}>}
 */
export function evaluateHeaders(url, headers, options = {}) {
  const findings = [];
  const { manifestCacheControl = null, manifestProbed = false } = options;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    findings.push({
      code: 'INVALID_URL',
      severity: 'fail',
      message: `Could not parse URL: ${url}`
    });
    return findings;
  }

  const isLocalhost = isLocalhostHost(parsed.hostname);
  const isGitHubPages = isGitHubPagesHost(parsed.hostname);
  const downgradeMissing = isLocalhost || isGitHubPages;

  if (parsed.protocol === 'http:' && !isLocalhost) {
    findings.push({
      code: 'INSECURE_SCHEME',
      severity: 'fail',
      message: `Site is served over http://. Use https:// for any non-localhost deployment.`
    });
  } else if (parsed.protocol === 'https:') {
    findings.push({
      code: 'HTTPS_PRESENT',
      severity: 'pass',
      message: 'Site is served over HTTPS.'
    });
  } else if (isLocalhost) {
    findings.push({
      code: 'LOCALHOST_SCHEME_OK',
      severity: 'pass',
      message: 'Localhost host detected; HTTPS requirement skipped for development.'
    });
  }

  if (isGitHubPages) {
    findings.push({
      code: 'GITHUB_PAGES_HEADERS_INERT',
      severity: 'warn',
      message: 'GitHub Pages host detected. The repo-root `_headers` file is not honored here; only headers from the `<meta http-equiv="Content-Security-Policy">` tag in index.html and GitHub\'s defaults reach browsers.'
    });
  }

  // Content-Security-Policy.
  const csp = lookupHeader(headers, 'content-security-policy');
  if (!csp) {
    findings.push({
      code: 'CSP_MISSING',
      severity: downgradeMissing ? 'warn' : 'fail',
      header: 'Content-Security-Policy',
      message: downgradeMissing
        ? 'No Content-Security-Policy response header. On GitHub Pages the meta-CSP fallback in index.html applies; on localhost the missing header is expected.'
        : 'No Content-Security-Policy response header on a production host.'
    });
  } else {
    const directives = parseCspDirectives(csp);
    const scriptSrc = directives['script-src'] || directives['default-src'] || [];
    const hasUnsafeInline = scriptSrc.some((t) => t === "'unsafe-inline'");
    const hasUnsafeEval = scriptSrc.some((t) => t === "'unsafe-eval'");
    const broadScriptHosts = scriptSrc.filter(
      (t) => /^https?:\/\//.test(t) && !KNOWN_BROAD_SCRIPT_HOSTS.has(t)
    );

    if (hasUnsafeInline) {
      findings.push({
        code: 'CSP_UNSAFE_INLINE',
        severity: 'fail',
        header: 'Content-Security-Policy',
        message: "CSP `script-src` allows 'unsafe-inline'. Hash or externalize inline scripts instead."
      });
    }
    if (hasUnsafeEval) {
      findings.push({
        code: 'CSP_UNSAFE_EVAL',
        severity: 'fail',
        header: 'Content-Security-Policy',
        message: "CSP `script-src` allows 'unsafe-eval'."
      });
    }
    if (broadScriptHosts.length > 0) {
      findings.push({
        code: 'CSP_BROAD_SCRIPT_HOST',
        severity: 'warn',
        header: 'Content-Security-Policy',
        message: `CSP allows third-party script source(s) outside the documented allowlist: ${broadScriptHosts.join(', ')}.`
      });
    }
    if (!hasUnsafeInline && !hasUnsafeEval && broadScriptHosts.length === 0) {
      findings.push({
        code: 'CSP_PRESENT',
        severity: 'pass',
        header: 'Content-Security-Policy',
        message: 'CSP present and reasonably restrictive.'
      });
    }
  }

  // Permissions-Policy.
  const permissionsPolicy = lookupHeader(headers, 'permissions-policy');
  if (!permissionsPolicy) {
    findings.push({
      code: 'PERMISSIONS_POLICY_MISSING',
      severity: downgradeMissing ? 'warn' : 'fail',
      header: 'Permissions-Policy',
      message: downgradeMissing
        ? 'No Permissions-Policy header. Expected on GitHub Pages and localhost; the live site cannot disable unused powerful features there.'
        : 'No Permissions-Policy header on a production host.'
    });
  } else {
    const lower = permissionsPolicy.toLowerCase();
    const missingDirectives = PERMISSIONS_POLICY_DIRECTIVES.filter(
      (d) => !lower.includes(d + '=')
    );
    if (missingDirectives.length > 0) {
      findings.push({
        code: 'PERMISSIONS_POLICY_MISSING_DIRECTIVES',
        severity: 'warn',
        header: 'Permissions-Policy',
        message: `Permissions-Policy is missing directives for: ${missingDirectives.join(', ')}.`
      });
    } else {
      findings.push({
        code: 'PERMISSIONS_POLICY_PRESENT',
        severity: 'pass',
        header: 'Permissions-Policy',
        message: 'Permissions-Policy present with serial/usb directives.'
      });
    }
  }

  // Frame protection: X-Frame-Options OR CSP frame-ancestors.
  const xFrameOptions = lookupHeader(headers, 'x-frame-options');
  const cspDirectives = parseCspDirectives(csp);
  const hasFrameAncestors = Array.isArray(cspDirectives['frame-ancestors']);
  if (xFrameOptions || hasFrameAncestors) {
    findings.push({
      code: 'FRAME_PROTECTION_PRESENT',
      severity: 'pass',
      message: 'Frame protection present (X-Frame-Options and/or CSP frame-ancestors).'
    });
  } else {
    findings.push({
      code: 'FRAME_PROTECTION_MISSING',
      severity: 'warn',
      message: 'No X-Frame-Options header and no CSP `frame-ancestors`. Clickjacking protection is unavailable. Note: meta-CSP cannot enforce frame-ancestors, so GitHub Pages cannot serve this protection from this repo.'
    });
  }

  // Cross-Origin-Opener-Policy.
  const coop = lookupHeader(headers, 'cross-origin-opener-policy');
  findings.push(coop
    ? { code: 'COOP_PRESENT', severity: 'pass', header: 'Cross-Origin-Opener-Policy', message: `Cross-Origin-Opener-Policy: ${coop}` }
    : { code: 'COOP_MISSING', severity: 'warn', header: 'Cross-Origin-Opener-Policy', message: 'Missing Cross-Origin-Opener-Policy.' }
  );

  // Cross-Origin-Resource-Policy.
  const corp = lookupHeader(headers, 'cross-origin-resource-policy');
  findings.push(corp
    ? { code: 'CORP_PRESENT', severity: 'pass', header: 'Cross-Origin-Resource-Policy', message: `Cross-Origin-Resource-Policy: ${corp}` }
    : { code: 'CORP_MISSING', severity: 'warn', header: 'Cross-Origin-Resource-Policy', message: 'Missing Cross-Origin-Resource-Policy.' }
  );

  // Referrer-Policy.
  const referrerPolicy = lookupHeader(headers, 'referrer-policy');
  findings.push(referrerPolicy
    ? { code: 'REFERRER_POLICY_PRESENT', severity: 'pass', header: 'Referrer-Policy', message: `Referrer-Policy: ${referrerPolicy}` }
    : { code: 'REFERRER_POLICY_MISSING', severity: 'warn', header: 'Referrer-Policy', message: 'Missing Referrer-Policy.' }
  );

  // Manifest Cache-Control. Only assert when we actually probed it.
  if (manifestProbed) {
    if (!manifestCacheControl) {
      findings.push({
        code: 'MANIFEST_CACHE_CONTROL_MISSING',
        severity: 'warn',
        header: 'Cache-Control',
        message: 'manifest.json has no Cache-Control header; default browser/CDN heuristics apply.'
      });
    } else {
      const maxAge = parseMaxAgeSeconds(manifestCacheControl);
      const allowsRevalidation = cacheAllowsRevalidation(manifestCacheControl);
      if (maxAge != null && maxAge > 86400 && !allowsRevalidation) {
        findings.push({
          code: 'MANIFEST_CACHE_TOO_AGGRESSIVE',
          severity: 'fail',
          header: 'Cache-Control',
          message: `manifest.json Cache-Control: ${manifestCacheControl}. max-age > 86400 with no revalidation directive risks serving stale firmware metadata.`
        });
      } else {
        findings.push({
          code: 'MANIFEST_CACHE_OK',
          severity: 'pass',
          header: 'Cache-Control',
          message: `manifest.json Cache-Control: ${manifestCacheControl}.`
        });
      }
    }
  }

  return findings;
}

async function fetchHeaders(url) {
  const response = await fetch(url, { method: 'GET', redirect: 'follow' });
  return { headers: response.headers, status: response.status };
}

async function probeManifest(baseUrl) {
  const manifestUrl = new URL('manifest.json', baseUrl).toString();
  try {
    const response = await fetch(manifestUrl, { method: 'GET', redirect: 'follow' });
    if (!response.ok) {
      return { probed: true, cacheControl: null };
    }
    return { probed: true, cacheControl: response.headers.get('cache-control') };
  } catch {
    return { probed: false, cacheControl: null };
  }
}

function printUsage() {
  console.error(`Usage: node scripts/check-headers.js <URL> [--json]

Audits the security headers of a deployed WebFlash URL.

Examples:
  node scripts/check-headers.js https://sense360store.github.io/WebFlash/
  npm run check:headers -- https://sense360store.github.io/WebFlash/
  node scripts/check-headers.js http://localhost:5000/ --json

Findings are classified as pass / warn / fail. Exit codes:
  0  no failures
  1  one or more failures
  2  usage error`);
}

function severitySymbol(severity) {
  switch (severity) {
    case 'pass': return '✅';
    case 'warn': return '⚠️ ';
    case 'fail': return '❌';
    default: return '  ';
  }
}

function formatHumanReport(url, findings) {
  const lines = [`Header audit for ${url}`, ''];
  const order = ['fail', 'warn', 'pass'];
  for (const severity of order) {
    const subset = findings.filter((f) => f.severity === severity);
    if (subset.length === 0) continue;
    lines.push(`${severity.toUpperCase()} (${subset.length}):`);
    for (const finding of subset) {
      lines.push(`  ${severitySymbol(severity)} [${finding.code}] ${finding.message}`);
    }
    lines.push('');
  }
  const counts = order.reduce((acc, s) => {
    acc[s] = findings.filter((f) => f.severity === s).length;
    return acc;
  }, {});
  lines.push(`Summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail.`);
  return lines.join('\n');
}

async function runCli(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    printUsage();
    return 2;
  }
  const jsonMode = args.includes('--json');
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    printUsage();
    return 2;
  }
  const url = positional[0];

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`Could not parse URL: ${url}`);
    printUsage();
    return 2;
  }

  let headers = null;
  let networkError = null;
  try {
    const result = await fetchHeaders(parsed.toString());
    headers = result.headers;
  } catch (error) {
    networkError = error;
  }

  const manifest = networkError
    ? { probed: false, cacheControl: null }
    : await probeManifest(parsed.toString());

  const findings = evaluateHeaders(parsed.toString(), headers, {
    manifestCacheControl: manifest.cacheControl,
    manifestProbed: manifest.probed
  });

  if (networkError) {
    findings.unshift({
      code: 'NETWORK_ERROR',
      severity: 'fail',
      message: `Could not fetch ${parsed.toString()}: ${networkError.message}`
    });
  }

  if (jsonMode) {
    console.log(JSON.stringify({ url: parsed.toString(), findings }, null, 2));
  } else {
    console.log(formatHumanReport(parsed.toString(), findings));
  }

  return findings.some((f) => f.severity === 'fail') ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv).then((code) => process.exit(code)).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export {
  isLocalhostHost,
  isGitHubPagesHost,
  parseCspDirectives,
  parseMaxAgeSeconds,
  cacheAllowsRevalidation
};
