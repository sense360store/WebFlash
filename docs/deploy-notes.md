# WebFlash deploy notes

Operational notes for deploying the WebFlash static app shell to GitHub Pages.
This file is the canonical explanation of the cache-busting contract; the
inline comments in `index.html`, `scripts/bootstrap.js`, `app.js`, and `sw.js`
point back here.

## WF-UX-014 — cache-bust runtime modules after UX-only JS changes

### Why this exists

WebFlash has no bundler. `index.html` loads `scripts/bootstrap.js`, which
dynamic-imports `app.js`, which imports the rest of the wizard as **bare ES
modules** (`import "./scripts/simple-install.js"`). Each module is a separate
URL fetched by the browser.

GitHub Pages / the CDN / the registered service worker treat those module URLs
very differently from the HTML document:

- **`index.html`** is the navigation request — it is revalidated on every load,
  so HTML changes go live immediately.
- **CSS** is already cache-busted with a `?v=` query
  (`wizard-style.css?v=…`), so CSS changes go live as soon as the token bumps.
- **Bare ES module imports have no version query**, so a stale copy can be
  served from the browser HTTP cache, a CDN edge, or the service worker's
  `stale-while-revalidate` app-shell cache — *even after a new deploy*.

The visible failure mode (the reason this note exists): **WF-UX-013** moved the
Simple-install unknown-freshness copy from the scary "Cannot install yet" /
"could not confirm whether the firmware list is up to date" to the calm "Could
not recheck for updates" with Reload + Continue actions. That change touched
`index.html`, `css/wizard-style.css`, and `scripts/simple-install.js`. The
HTML + CSS halves deployed (versioned / revalidated), so the scary
"accept the risk" copy disappeared and the diagnostics collapsed — but
`scripts/simple-install.js` kept being served stale, so the live Simple path
**still showed the old "Cannot install yet" freshness copy**. A classic
mixed old/new UI.

### The contract

After any **UX-only JS change** to a customer-facing runtime module, bump the
cache-bust token in **all** of these places, in lockstep:

1. **`index.html`** — the `?v=` query on the versioned CSS links **and** on the
   `scripts/bootstrap.js` script tag. (`index.html` is always revalidated, so
   versioning the bootstrap loader here is what forces the rest of the chain to
   refetch.)
2. **`scripts/bootstrap.js`** — `APP_SHELL_BUILD`, appended to the dynamic
   `app.js` import.
3. **`app.js`** — the `?v=` query on the import of each **changed** module
   (e.g. `import "./scripts/simple-install.js?v=…"`). Unchanged modules
   (`state.js`, etc.) do not need a per-import token; they ride the cache-name
   bump in step 4. Only customer-facing-copy changes need a per-import bump.
4. **`sw.js`** — bump `CACHE_NAME` (`webflash-vN` → `webflash-vN+1`). The
   `activate` handler purges any `webflash-*` cache that is not the current
   name, so existing installs re-prime once. This is an **asset-version
   reference only** — the per-asset-class fetch strategy is unchanged.

Because the token flows from the always-fresh HTML (`index.html` →
`bootstrap.js?v=` → `app.js?v=` → changed `module.js?v=`), the new module URLs
are not present in any stale cache, so `stale-while-revalidate` has nothing
stale to serve and goes to the network. The app shell therefore refreshes on
the **first** load after deploy, with no second reload required, and the
cache-name bump cleans up the old entries on the next service-worker activation.

The token is date-based, with a build counter for same-day re-deploys
(`202606012` / `2026-06-01-2`, the second 2026-06-01 build — WF-UX-015's
collapsed Simple-install firmware detail), to match the existing CSS convention
and to read meaningfully in support tooling.

### Build marker (how to verify a deploy is live)

`index.html` carries support-only meta tags:

```html
<meta name="webflash-app-version" content="1.0.1">
<meta name="webflash-app-shell" content="2026-06-01-2">
```

These are read by `scripts/services/diagnostics.js` (`buildAppSection`) and
surface in the **Copy / Download support bundle** (`app.app_shell`) and in the
**"About this installer"** panel (`scripts/layout/about-panel.js`, the
"App shell" row, sourced from `scripts/build-info.js`). Because the marker rides
on the always-revalidated HTML, even a stale-JS page reports the correct shell —
so support can tell at a glance whether a customer is on the post-WF-UX-014 app
shell or a stale CDN/service-worker copy.

To confirm a deploy: load the page, open the support bundle (or About panel),
and check that `app_shell` / "App shell" reads the expected build date.

### Deploy trigger

The changed runtime files (`index.html`, `app.js`, `sw.js`, `scripts/**`) are
all in `.github/workflows/firmware-publish.yml`'s `on.push.paths`, so the
publish/deploy workflow runs on merge. `__tests__/**` and `docs/**` are **not**
trigger paths, which is fine — they do not need to deploy.

### Scope guardrails

This is a deploy-layer + presentation change only. It does **not** touch
`manifest.json`, `firmware/sources.json`, `REQUIRED_CONFIGS`, firmware binaries,
the release-channel policy, installability / provenance / freshness gate logic,
or the service-worker fetch **strategy** (only the cache **name**/version
reference).
