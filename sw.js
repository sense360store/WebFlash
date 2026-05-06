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
 *
 * @module sw
 */

const CACHE_NAME = 'webflash-v5';
const CACHE_VERSION = 4;

/**
 * Static assets to cache on install.
 * These are essential for the app to function offline.
 */
const STATIC_ASSETS = [
    './',
    './index.html',
    './app.js',
    './ui.js',
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
    './sense360-favicon-32.png'
];

/**
 * Script modules to cache.
 *
 * IMPORTANT: any new top-level script imported by index.html or app.js
 * must be listed here, otherwise it will be unavailable when the page is
 * loaded offline (the `import` statement will 404 against the SW cache).
 */
const SCRIPT_MODULES = [
    './scripts/bootstrap.js',
    './scripts/build-info.js',
    './scripts/capabilities.js',
    './scripts/compat-config.js',
    './scripts/init-review.js',
    './scripts/navigation.js',
    './scripts/prefs.js',
    './scripts/recommended-bundle.js',
    './scripts/kit-mode.js',
    './scripts/state.js',
    './scripts/ui-capability-bar.js',
    './scripts/wizard-state-observer.js',
    './scripts/data/module-requirements.js',
    './scripts/data/kits.json',
    './scripts/content/option-tooltips.js',
    './scripts/layout/about-panel.js',
    './scripts/layout/firmware-note.js',
    './scripts/layout/freshness-banner.js',
    './scripts/layout/init-splitview.js',
    './scripts/layout/option-info-popover.js',
    './scripts/layout/post-flash-panel.js',
    './scripts/layout/preflight-banner.js',
    './scripts/layout/preflight-help-modal.js',
    './scripts/layout/rescue-entry.js',
    './scripts/layout/rescue-modal.js',
    './scripts/layout/state-summary.js',
    './scripts/services/diagnostics.js',
    './scripts/services/post-flash.js',
    './scripts/utils/a11y.js',
    './scripts/utils/channel-alias.js',
    './scripts/utils/copy-to-clipboard.js',
    './scripts/utils/escape-html.js',
    './scripts/utils/file-download.js',
    './scripts/utils/firmware-nearest.js',
    './scripts/utils/firmware-provenance.js',
    './scripts/utils/firmware-signature.js',
    './scripts/utils/firmware-trusted-keys.js',
    './scripts/utils/flash-history.js',
    './scripts/utils/kit-config.js',
    './scripts/utils/preset-storage.js',
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
    // — that bypasses the SW entirely and goes straight to the network.
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
