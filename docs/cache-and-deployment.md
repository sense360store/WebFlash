# Cache policy and deployment headers

This page documents the cache / version freshness policy and the deployment
security headers. It was relocated from the repository README when it became
a short front door (REPO-CUSTOMER-READY-001 S4).

## Cache and version policy

WebFlash refuses to flash firmware while the running installer code or the
loaded firmware manifest may be stale. Three independent surfaces enforce
this; all three are visible in the **About this installer** panel and in the
**Copy diagnostics** payload.

### App build / version metadata

- Source of truth: the `webflash-app-version` `<meta>` tag in
  [`../index.html`](../index.html), read by
  [`../scripts/services/diagnostics.js`](../scripts/services/diagnostics.js).
- The app must tolerate the tag being missing without crashing: diagnostics
  falls back to its `APP_VERSION_FALLBACK` constant and renders missing
  fields as `unknown` rather than redacting or omitting them.

### Manifest version / generated metadata

- `manifest.json` carries top-level `manifest_version` (schema number),
  `generated_at` (ISO 8601 UTC), and `source_commit` (git SHA), injected
  by [`../scripts/gen-manifests.py`](../scripts/gen-manifests.py). The git SHA
  is reused from the existing `detect_source_commit()` helper.
- The wizard captures these on initial manifest load and exposes them via
  the About panel and `Copy diagnostics`.

### Service worker update behavior

- Registration and update detection live in
  [`../scripts/services/sw-update.js`](../scripts/services/sw-update.js).
- When the SW reports a waiting worker, the freshness banner shows
  *"A WebFlash update is available. Reload before flashing."* with a
  **Reload now** action. Clicking **Reload now** posts `SKIP_WAITING` to
  the waiting worker and reloads once it takes control.
- A secondary **Continue without reloading** button dismisses the block
  and downgrades the banner to a warning. See the install gating policy
  below for the resulting behavior.

### Manifest freshness behavior

- After the wizard loads `manifest.json` it re-fetches the same URL with
  `cache: 'no-store'` (see
  [`../scripts/services/manifest-freshness.js`](../scripts/services/manifest-freshness.js))
  and compares the live `generated_at` to the loaded one. The verdict is
  one of:
  - `current` — install allowed.
  - `stale` — a newer manifest is published; install is blocked until the
    user reloads.
  - `unknown` — the network call failed or `generated_at` was missing /
    unparseable. The freshness banner shows
    *"WebFlash could not confirm that the firmware manifest is current.
    Check your connection or reload before flashing."* The user must click
    **Acknowledge and continue** before the install gate opens.

### Install gating policy (the matrix)

The same matrix is enforced in
[`../scripts/state.js`](../scripts/state.js) under the `CACHE FRESHNESS POLICY`
comment block (search for that string). It composes with — does not
replace — the existing pre-flash checklist, preflight policy, and
release-channel acknowledgements.

| Condition                                        | Install button | Visible UI                       |
| ------------------------------------------------ | -------------- | -------------------------------- |
| SW update pending **and not** dismissed          | **Disabled**   | Block-level banner + Reload now  |
| SW update pending **and** dismissed              | Allowed        | Warning banner + Reload now      |
| Manifest freshness `current`                     | Allowed        | (no banner)                      |
| Manifest freshness `stale`                       | **Disabled**   | Block-level banner + Reload now  |
| Manifest freshness `unknown`, **not** ack'd      | **Disabled**   | Warning banner + Acknowledge     |
| Manifest freshness `unknown`, ack'd              | Allowed        | Warning banner stays visible     |

### Cache clear behavior

- The About panel exposes **Clear cached installer data**. Implemented in
  [`../scripts/services/cache-clear.js`](../scripts/services/cache-clear.js).
- It posts `CLEAR_CACHE` to the active service worker (which deletes the
  WebFlash-owned cache only), unregisters the worker, and reloads the
  page. **It does not modify or erase your device.** It does not touch
  cookies, localStorage outside the WebFlash namespace, IndexedDB, or any
  caches outside the SW.

### Per-asset cache policy

Documented in the comment block at the top of
[`../sw.js`](../sw.js):

| Asset class                 | Strategy                  | Why                                                  |
| --------------------------- | ------------------------- | ---------------------------------------------------- |
| App shell (HTML/CSS/JS/img) | stale-while-revalidate    | Update detection drives the reload prompt.           |
| `manifest.json`             | network-first             | Page also re-fetches with `cache: 'no-store'`.       |
| Firmware binaries (`*.bin`) | network-first             | Cached on success so a previously-flashed config is offline-available; never serve stale. The rescue binary is additionally precached so first-visit offline rescue works. |
| Cross-origin (unpkg ESPWT)  | not intercepted           | Browser-managed.                                     |

The cache name lives in the `CACHE_NAME` constant in `sw.js` (currently
`webflash-v20`); the constant in `sw.js` is the source of truth and bumping
it is how forced refreshes are landed. The `activate` handler purges any
cache that starts with `webflash-` but is not the current name, so
subsequent bumps just work.

## Deployment & security headers

The live site is hosted on GitHub Pages
(<https://sense360store.github.io/WebFlash/>). GitHub Pages does **not**
honor the `_headers` file at the repo root — that file follows the
Netlify / Cloudflare Pages convention and is committed so a future
migration to one of those hosts automatically gets the full security
header set (CSP, Permissions-Policy, COOP, CORP, Referrer-Policy,
X-Frame-Options).

On GitHub Pages today the effective Content-Security-Policy reaches
browsers via a `<meta http-equiv="Content-Security-Policy">` tag in
`index.html` that mirrors the directives in `_headers`. Meta tags cannot
enforce `frame-ancestors`, `report-uri`, or `sandbox`, so clickjacking
protection (X-Frame-Options / frame-ancestors) is unavailable on GitHub
Pages and is a known limitation of this hosting choice.

To audit any deployment's response headers, run:

```bash
npm run check:headers -- https://sense360store.github.io/WebFlash/
```

The script (`scripts/check-headers.js`) classifies each finding as
`pass`, `warn`, or `fail` and exits non-zero on any failure. Localhost
hosts (for `python3 -m http.server`-style local dev) and `*.github.io`
hosts get an automatic downgrade so the missing CSP / Permissions-Policy
on those hosts is reported as `warn` rather than `fail`. Pass `--json`
for machine-readable output suitable for CI.

The only third-party runtime dependency is
`https://unpkg.com/esp-web-tools@10/dist/web/install-button.js`, allowed
by the CSP `script-src`. Fonts (Inter, JetBrains Mono) are self-hosted
under `assets/fonts/` via `@font-face` rules in `app.css`, so `style-src`
and `font-src` stay `'self'`. There are no analytics, no other CDNs, and no
inline scripts — the bootstrap loader was externalized to
`scripts/bootstrap.js` so the CSP `script-src` can remain `'self'` plus
the documented unpkg origin without `'unsafe-inline'`.
