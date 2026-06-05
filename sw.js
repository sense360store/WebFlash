/**
 * @fileoverview Service Worker for WebFlash offline support.
 *
 * CACHE POLICY (kept in sync with the README "Cache and version policy"
 * section). The policy is intentionally per-asset-class because firmware
 * binaries and the manifest list have very different freshness needs from
 * the static app shell.
 *
 *   App shell (HTML / CSS / JS / icons / module scripts):
 *     stale-while-revalidate. Pages render immediately from cache and the
 *     SW refreshes in the background. Update detection lives in
 *     scripts/services/sw-update.js — when a new SW is installed, the
 *     freshness banner prompts a reload before flashing.
 *
 *   manifest.json (and firmware/rescue/manifest.json):
 *     network-first. We never silently serve a stale manifest, because the
 *     wizard binds firmware selection to it. The page additionally
 *     re-fetches manifest.json with `cache: 'no-store'` before flashing
 *     (see scripts/services/manifest-freshness.js) so it can show the user
 *     a freshness verdict.
 *
 *   Firmware binaries (*.bin):
 *     network-first. Cached on success so a configuration the user has
 *     flashed once is available for subsequent attempts even if the network
 *     drops, but a network re-fetch is always preferred so the user gets the
 *     freshly published binary if one exists. NB: we do NOT use cache-only
 *     or cache-first here — flashing a stale binary would silently regress
 *     the device.
 *
 *     The rescue binary is the one exception that is *precached* via
 *     STATIC_ASSETS (see below). The rescue/recovery path is exactly what a
 *     user reaches for when their setup is broken — including their
 *     network — so we want the bundled known-good image available offline
 *     on first visit, not just after a prior successful fetch. The fetch
 *     handler still serves it network-first so a regenerated rescue binary
 *     from the live origin overrides the precache when reachable.
 *
 *   Cross-origin requests (e.g. unpkg ESP Web Tools):
 *     left to the browser; the SW does not intercept them.
 *
 * CACHE NAME LIFECYCLE:
 *   `webflash-v1` shipped with the original release. `webflash-v2` was
 *   introduced when the freshness/version banners were added so existing
 *   installs would purge the v1 cache once and re-prime with the new
 *   asset list (the new modules under scripts/services/ and the new
 *   freshness banner are not in the v1 manifest). The activate handler
 *   below removes any cache that starts with `webflash-` but is not the
 *   current name — keep that pattern stable so future bumps just work.
 *   `webflash-v6` (WF-UX-014) bumps the name so existing installs purge the
 *   v5 cache once and re-prime, which — together with the `?v=` asset-query
 *   bump on index.html / bootstrap.js / app.js's changed ESM imports — stops
 *   the service worker from serving a stale scripts/simple-install.js after a
 *   UX-only JS deploy (the mixed old/new UI WF-UX-013 hit on live). `webflash-v7`
 *   (WF-UX-015) bumps again for the same reason: simple-install.js's
 *   customer-facing copy + wizard-style.css's simple-mode collapse rules changed,
 *   so existing installs must purge v6 and re-prime. `webflash-v8` (WF-UX-016)
 *   bumps again: scripts/state.js now routes the freshness-unknown verdict
 *   through the calm Simple-install copy (and gives the preflight freshness row
 *   customer-safe labels in Simple mode). state.js has no per-import `?v=` token,
 *   so it rides this cache-name bump to re-prime — existing installs must purge
 *   v7 to pick up the fix. This is an asset-version reference only — the
 *   per-asset-class fetch strategy above is unchanged. See docs/deploy-notes.md.
 *   `webflash-v11` (WF-UX-018) bumps again for the same reason: scripts/state.js
 *   was fixed so the "View Release Notes" disclosure no longer re-selects the
 *   firmware (the re-select rebuilt the firmware card and detached the trigger
 *   mid-click, so the disclosure never opened on the live site). state.js still
 *   carries no per-import `?v=` token — it is imported by many modules, so a
 *   per-import query would split it into duplicate module instances — so it
 *   relies on this cache-name bump to re-prime; existing installs must purge v10
 *   to pick up the fix.
 *   `webflash-v12` (WF-EASY-BUNDLE-PICKER-001) bumps again: Simple install is now
 *   a bundle picker (index.html markup, css/wizard-style.css, scripts/simple-
 *   install.js with a new ?v= token, and a new scripts/data/simple-bundles.js
 *   data module in SCRIPT_MODULES below). Existing installs must purge v11 and
 *   re-prime so the picker ships intact. See docs/deploy-notes.md.
 *   `webflash-v13` (WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001) bumps again: the
 *   Simple-install bundle picker gained import-gated fan-control room bundles
 *   (index.html now carries the analog-fan address-switch acknowledgement region,
 *   scripts/simple-install.js injects import-ready fan-control cards, and
 *   scripts/data/simple-bundles.js declares them). No fan-control firmware ships
 *   yet, so the picker is visually unchanged today — but existing installs must
 *   purge v12 so the staged copy + gate deploy in lockstep. See docs/deploy-notes.md.
 *   `webflash-v14` (WebFlash 2.0 migration, beta default) bumps again:
 *   scripts/bootstrap.js now resolves the default view per surface via the new
 *   scripts/ui-version.js module (added to SCRIPT_MODULES below), so internal and
 *   beta surfaces default to the 2.0 view while production stays on the 1.0 view.
 *   The production default is unchanged, but the changed bootstrap + new module
 *   must re-prime so existing installs purge v13 and the host-aware resolver +
 *   its module are served as one set. See docs/deploy-notes.md.
 *   `webflash-v15` (WebFlash 2.0 GA cutover, PR 12) bumps again:
 *   scripts/ui-version.js now defaults EVERY surface (production included) to the
 *   2.0 view, keeping ?ui=1 as the one-release rollback. ui-version.js carries no
 *   per-import `?v=` token, so it rides this cache-name bump to re-prime; existing
 *   installs must purge v14 so the cutover resolver ships intact, in lockstep with
 *   the index.html / bootstrap / app.js `?v=` token (202606042) and the
 *   webflash-app-shell marker (2026-06-04-2). The activate handler below still
 *   purges every non-current `webflash-*` cache, so this bump just works; the
 *   per-asset-class fetch strategy is unchanged. See docs/deploy-notes.md.
 *   `webflash-v16` (WebFlash 2.0 migration, PR 13) bumps again: the 1.0 view and
 *   the dual-view `?ui` flag were removed after the GA cutover soaked one release.
 *   The 2.0 view (scripts/shell.js, folded in from the old webflash-2/ path) is
 *   now the only view and the precache list below was rewritten accordingly: the
 *   removed 1.0 render-layer modules, ui-version.js, and the old root app.js / ui.js
 *   are dropped, and the 2.0 view modules plus app.css were added. Existing installs
 *   must purge v15 so the single-view shell ships intact, in lockstep with the
 *   index.html / bootstrap `?v=` token (202606043) and the webflash-app-shell marker
 *   (2026-06-04-3). The activate purge and the per-asset-class fetch strategy are
 *   unchanged. See docs/deploy-notes.md.
 *
 * @module sw
 */

const CACHE_NAME = 'webflash-v17';
const CACHE_VERSION = 5;

/**
 * Static assets to cache on install.
 * These are essential for the app to function offline.
 */
const STATIC_ASSETS = [
    './',
    './index.html',
    './app.css',
    './manifest.json',
    './firmware/rescue/manifest.json',
    // The rescue binary is precached because the rescue/recovery flow is
    // exactly the path users hit when their setup is broken — including their
    // network. Pinning the binary here guarantees the rescue modal can flash
    // the bundled known-good image even on a first visit that goes offline
    // before the user clicks Install. Versioned filename means cache
    // invalidation rides on the cache name (CACHE_NAME) rather than per-file.
    './firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin',
    './css/wizard-style.css',
    './css/capability-bar.css',
    './css/theme.css',
    './css/layout.css',
    './css/features.css',
    './css/device-qr.css',
    './sense360-logo-new.png',
    './sense360-favicon-32.png',
    './assets/sense360-logo.png'
];

/**
 * Script modules to cache for offline use.
 *
 * IMPORTANT: any new module imported by index.html, scripts/bootstrap.js, or the
 * 2.0 view (scripts/shell.js and the modules it pulls in) must be listed here,
 * otherwise it will be unavailable when the page is loaded offline (the `import`
 * statement will 404 against the SW cache). Conversely, every entry below MUST
 * exist on disk: cache.addAll() rejects the whole install if any URL 404s.
 *
 * After the WebFlash 2.0 GA (PR 13) this is the single-view module graph: the
 * bootstrap, the 2.0 view (folded in from the old webflash-2/ path), and the 1.0
 * engine the view renders over.
 */
const SCRIPT_MODULES = [
    './scripts/bootstrap.js',
    // 2.0 view (folded in from webflash-2/scripts/).
    './scripts/shell.js',
    './scripts/app.js',
    './scripts/connect.js',
    './scripts/data.js',
    './scripts/engine.js',
    './scripts/h.js',
    './scripts/icons.js',
    './scripts/identify.js',
    './scripts/install.js',
    './scripts/modal.js',
    './scripts/ui.js',
    // Engine: central state machine + capability detection.
    './scripts/state.js',
    './scripts/capabilities.js',
    // Engine data (kits.json is fetched at runtime by utils/kit-config.js).
    './scripts/data/module-requirements.js',
    './scripts/data/kits.json',
    // Shared modals the 2.0 view reuses (rescue / recovery + error log) plus the
    // freshness banner state.js drives.
    './scripts/layout/rescue-modal.js',
    './scripts/layout/error-log-modal.js',
    './scripts/layout/freshness-banner.js',
    // Engine services.
    './scripts/services/cache-clear.js',
    './scripts/services/diagnostics.js',
    './scripts/services/error-log.js',
    './scripts/services/manifest-freshness.js',
    './scripts/services/post-flash.js',
    './scripts/services/sw-update.js',
    // Engine utilities.
    './scripts/utils/a11y.js',
    './scripts/utils/channel-alias.js',
    './scripts/utils/copy-to-clipboard.js',
    './scripts/utils/escape-html.js',
    './scripts/utils/file-download.js',
    './scripts/utils/firmware-nearest.js',
    './scripts/utils/firmware-provenance.js',
    './scripts/utils/firmware-readiness.js',
    './scripts/utils/firmware-signature.js',
    './scripts/utils/firmware-trusted-keys.js',
    './scripts/utils/flash-history.js',
    './scripts/utils/kit-config.js',
    './scripts/utils/module-availability.js',
    './scripts/utils/release-channels.js',
    './scripts/utils/url-config.js'
];

/**
 * Install event - cache static assets.
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll([...STATIC_ASSETS, ...SCRIPT_MODULES]);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                // Note: we do NOT call skipWaiting() here. The page-side
                // sw-update.js controls activation timing so the user can
                // confirm the update before it takes over (see
                // SKIP_WAITING handler below).
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

/**
 * Activate event - clean up old caches.
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('webflash-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activated and cleaned old caches');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - per-asset-class strategy. See the cache-policy block at
 * the top of this file for the rationale.
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip cross-origin requests except for ESP Web Tools
    if (url.origin !== self.location.origin && !url.href.includes('unpkg.com/esp-web-tools')) {
        return;
    }

    // Firmware binaries: network-first. Cached on success for rescue
    // fallback, but never returned cache-only when the network is healthy
    // (flashing a stale binary would silently regress the device).
    if (url.pathname.endsWith('.bin')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Manifests: network-first. The page additionally re-fetches with
    // `cache: 'no-store'` before flashing to compute a freshness verdict
    // (scripts/services/manifest-freshness.js). WF-UX-017 — `cache: 'no-store'`
    // only bypasses the HTTP cache, NOT the service worker: that request still
    // reaches this handler, where network-first re-fetches it fresh (and falls
    // back to the cached copy only on a network error). Either way the response
    // is a real manifest with `generated_at`, so the freshness check resolves to
    // current/stale — never the opaque "unknown". A live "unknown" therefore
    // points at the response NOT being a usable manifest (an HTML 404/SPA
    // fallback served for manifest.json → reason `parse-failed`, or a non-2xx →
    // `http-error`), which the freshness reason codes now make observable.
    if (url.pathname.endsWith('manifest.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // App shell (HTML / CSS / module scripts / icons): stale-while-revalidate.
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                const fetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse.ok) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => cachedResponse);

                return cachedResponse || fetchPromise;
            })
    );
});

/**
 * Message event handlers.
 *
 *   CLEAR_CACHE  — wipes the WebFlash-owned cache. Triggered by the
 *                  "Clear cached installer data" button.
 *   SKIP_WAITING — activates a waiting SW immediately. Triggered by the
 *                  "Reload now" button on the freshness banner.
 */
self.addEventListener('message', (event) => {
    if (!event.data || typeof event.data.type !== 'string') {
        return;
    }
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME)
                .then(() => {
                    console.log('[SW] Cache cleared');
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ success: true });
                    }
                })
        );
        return;
    }
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
