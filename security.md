# Security Audit — WebFlash

Audit date: 2026-06-06
Scope: full repository (static frontend, Python publishing pipeline, GitHub
Actions, firmware-signing trust model, HTTP headers / CSP, service worker).
Method: manual source review. No runtime/penetration testing was performed and
no hardware was exercised.

## Overall assessment

WebFlash has a **strong security posture**. It ships no third-party runtime
dependency of its own, escapes user-controlled strings before DOM insertion,
redacts secrets from diagnostics, enforces SHA-256 on every firmware download,
and gates production installs behind Ed25519 signature verification with a
pinned trust list. The threat model is unusually well documented
(`firmware-signing/README.md`).

The findings below are mostly supply-chain hardening and hygiene. The single
item worth fixing promptly is the **missing Subresource Integrity (SRI) on the
third-party `esp-web-tools` script**, because that script runs inside a
firmware flasher.

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | High | `esp-web-tools` loaded from unpkg without SRI + floating `@10` version | Open |
| 2 | Medium | GitHub Actions pinned to tags, not commit SHAs | Resolved |
| 3 | Medium | Signature binds firmware **bytes only**, not config/version (manifest-mapping gap) | Accepted / documented |
| 4 | Low | Committed `test_only` dev private key | By design — keep guarded |
| 5 | Low | `.gitignore` has no `.env` / `*.key` / `*.pem` patterns | Resolved |
| 6 | Low | CSP `style-src 'unsafe-inline'`; `frame-ancestors` only in `_headers` (not the meta CSP) | Partly by design |

---

## 1. High — `esp-web-tools` has no Subresource Integrity and uses a floating version

**Where:** `index.html` (the `<script type="module" src="https://unpkg.com/esp-web-tools@10/.../install-button.js?module">` tag) and the matching `script-src 'self' https://unpkg.com` allowance in `_headers` / the `index.html` CSP meta tag.

**Issue:** The only third-party script in the app is loaded from `unpkg.com`
with a floating major version (`@10`) and **no `integrity=` attribute**. If
unpkg serves a different/compromised build (CDN compromise, account takeover,
a malicious patch release within `@10`), arbitrary JavaScript executes inside
the page that drives Web Serial and writes firmware to the user's device. SRI
is the standard mitigation and the CSP already constrains the origin but cannot
detect tampered-but-same-origin content.

**Path to fix:**
1. Pin the exact version, e.g. `esp-web-tools@10.0.0`, instead of `@10`.
2. Compute the hash of the served file and add `integrity` + `crossorigin`:
   ```bash
   curl -sL "https://unpkg.com/esp-web-tools@10.0.0/dist/web/install-button.js" \
     | openssl dgst -sha384 -binary | openssl base64 -A
   ```
   ```html
   <script type="module"
           src="https://unpkg.com/esp-web-tools@10.0.0/dist/web/install-button.js"
           integrity="sha384-<HASH>"
           crossorigin="anonymous"></script>
   ```
   Note: esp-web-tools pulls transitive deps (lit, improv-wifi-serial-sdk) at
   runtime, so SRI covers only the entry module. For full coverage, **vendor**
   the bundle into the repo (served from `'self'`) and pin it like any other
   asset, which also lets you drop `unpkg.com` from `script-src`.
3. Add the chosen file(s) to `sw.js` (`STATIC_ASSETS` / `SCRIPT_MODULES`) if
   vendored, so offline behavior and the CSP stay consistent.

---

## 2. Medium — GitHub Actions are pinned to tags, not commit SHAs

**Where:** `.github/workflows/firmware-publish.yml`, `.github/workflows/firmware-import.yml` (e.g. `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`).

**Issue:** A mutable tag like `@v4` can be repointed by a compromised action
maintainer to malicious code, which would run in a workflow that holds the
GitHub Pages deploy identity and (in the publish job) the firmware signing
secret. GitHub's own actions are comparatively low risk, but full-SHA pinning
is the recommended supply-chain control.

**Fixed:** Every `uses:` in every workflow under `.github/workflows/` is now
pinned to a full commit SHA with the version in a trailing comment (landed
earlier as the SHA-pin change), e.g.:
```yaml
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
```
and `.github/dependabot.yml` now declares the `github-actions` ecosystem
(weekly) so Dependabot keeps each pin and its trailing version comment current.

**Already good:** workflows use only `push` / `workflow_dispatch` (no
`pull_request_target`), declare least-privilege `permissions:`
(`contents: read`, plus `pages: write` / `id-token: write` only where needed),
and pass `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` / `WEBFLASH_FIRMWARE_KEY_ID` via
env to Python rather than interpolating them into shell.

---

## 3. Medium — Signature binds firmware bytes only (manifest-mapping gap)

**Where:** `scripts/utils/firmware-signature.js`, `manifest.json` (`signature_ed25519`, `signature_key_id`), and the threat-model write-up in `firmware-signing/README.md` → *Manifest-mapping authenticity gap*.

**Issue:** The Ed25519 signature is computed over the raw `.bin` bytes, not
over a canonical envelope that includes `config_string`, `version`, or
`channel`. An attacker who can edit `manifest.json` (but does not hold the
private key) could move a validly signed binary onto a different config/version
entry. This is explicitly acknowledged and accepted in the repo's docs.

**Compensating controls already present:** download-time SHA-256 check;
`scripts/utils/firmware-provenance.js` cross-checks `config_string` against the
binary filename; the `REQUIRED_CONFIGS` allowlist; network-first caching of
`manifest.json`.

**Path to fix (when real firmware ships at scale):** introduce a v2 signature
over a canonical JSON envelope `{kid, config_string, version, channel, sha256,
file_size}` and verify the envelope in `firmware-signature.js`. Keep this as a
deliberate, separate project — do not silently claim it is done. Per the repo's
trust model, never surface a `signature_verified: true` claim that the code
does not actually back.

---

## 4. Low — Committed `test_only` development private key (by design)

**Where:** `firmware-signing/keys/dev-2026-01-private.pem` / `.raw.b64`; trust metadata in `firmware-signing/trusted-keys.json` and `scripts/utils/firmware-trusted-keys.js`.

**Assessment:** This is **intentional and safe as configured**. The key is
`status: "test_only"`, exists so CI/test fixtures can exercise the real
verification path, and the production gate (`mode: 'production'`) hard-refuses
`test_only` keys (`KEY_TEST_ONLY_IN_PRODUCTION`). The real production key
(`sense360-prod-2026-02`, `status: "active"`) has its private half only in the
`WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` CI secret. A Jest backstop
(`__tests__/firmware-signature.test.js`) fails if `dev-2026-01` is ever
promoted to `active`.

**Path to keep it safe:**
- Never set `dev-2026-01` `status` to `active` (the backstop guards this — keep
  it).
- When rotating, follow `firmware-signing/README.md`; never commit an `active`
  key's private half.

---

## 5. Low — `.gitignore` lacks secret-file patterns

**Where:** `.gitignore` (currently `node_modules/`, `.DS_Store`, `__pycache__/`, `*.pyc`).

**Issue:** No defense-in-depth against accidentally committing local secret
files. No such files are produced by the normal workflow today, so impact is
low.

**Fixed:** `.gitignore` now carries the secret-file patterns:
```gitignore
.env
.env.*
*.key
*.pem
*.p12
*.pfx
secrets/
```
plus a negation that keeps the intentional `test_only` dev key pair tracked (it
is already committed, and the negation also makes `git check-ignore` and any
future re-add treat it as not ignored):
```gitignore
!firmware-signing/keys/dev-2026-01-*.pem
```
The matching `dev-2026-01-*.raw.b64` files are not caught by any pattern above,
so they need no negation. Confirmed after the change: `git ls-files` still
tracks `firmware-signing/keys/dev-2026-01-private.pem` and the signature
backstop (`__tests__/firmware-signature.test.js`) stays green.

---

## 6. Low — CSP details (`unsafe-inline` styles; meta-tag limits)

**Where:** `_headers` and the CSP `<meta>` in `index.html`.

**Issues:**
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` permits
  inline styles. Low risk on a site with no user-generated HTML, but it weakens
  CSP.
- `frame-ancestors` / `report-uri` live only in `_headers`; the `<meta>` CSP
  cannot express them, and **GitHub Pages does not apply `_headers`**, so on the
  live Pages deployment clickjacking protection relies on `X-Frame-Options:
  DENY` (which is also header-only and likewise not applied by Pages). This is a
  documented platform limitation.

**Path to fix:**
- Move remaining inline styles into the existing stylesheets and drop
  `'unsafe-inline'` (or adopt per-load `nonce`s).
- If clickjacking protection on the Pages deployment matters, front the site
  with a CDN that honors `_headers`, or add a small framebusting guard.

---

## Verified-good (no action needed)

- No `eval` / `new Function` / `document.write`. `innerHTML` writes route
  user-controlled values through `escapeHtml()` (`scripts/utils/escape-html.js`).
- URL/share-link parsing (`scripts/utils/url-config.js`) validates against
  whitelists; no unsanitized `location` sinks.
- `postMessage` is page↔service-worker only; no untrusted cross-origin handlers.
- Diagnostics and flash history redact passwords/secrets/keys before
  storage/export; WiFi credentials are never persisted.
- SHA-256 is enforced at import time (`scripts/import-firmware-sources.py`,
  against upstream `checksums-sha256.txt` and any pinned `expected_sha256`) and
  at download time.
- No hardcoded tokens/keys in source; secrets are CI-injected env vars only.
- No runtime npm dependencies; dev deps (`jest`, `jest-environment-jsdom`) are
  current.

## Suggested fix order

1. (#1) Add SRI + exact version pin to `esp-web-tools`, or vendor it.
2. (#2) SHA-pin GitHub Actions + add Dependabot.
3. (#5) Tighten `.gitignore`.
4. (#6) Remove `style-src 'unsafe-inline'`.
5. (#3) Plan the v2 envelope signature before large-scale real-firmware rollout.
