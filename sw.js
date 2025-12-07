/**
 * @fileoverview Service Worker for WebFlash offline support.
 * Caches static assets and firmware manifests for offline access.
 * @module sw
 */

const CACHE_NAME = 'webflash-v1';
const CACHE_VERSION = 1;

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
    './css/wizard-style.css',
    './css/capability-bar.css',
    './css/theme.css',
    './css/layout.css',
    './sense360-logo-new.png',
    './sense360-favicon-32.png'
];

/**
 * Script modules to cache.
 */
const SCRIPT_MODULES = [
    './scripts/capabilities.js',
    './scripts/compat-config.js',
    './scripts/init-review.js',
    './scripts/navigation.js',
    './scripts/prefs.js',
    './scripts/recommended-bundle.js',
    './scripts/state.js',
    './scripts/ui-capability-bar.js',
    './scripts/wizard-state-observer.js',
    './scripts/data/module-requirements.js',
    './scripts/content/option-tooltips.js',
    './scripts/layout/firmware-note.js',
    './scripts/layout/init-splitview.js',
    './scripts/layout/option-info-popover.js',
    './scripts/layout/state-summary.js',
    './scripts/utils/channel-alias.js',
    './scripts/utils/copy-to-clipboard.js',
    './scripts/utils/escape-html.js',
    './scripts/utils/flash-history.js',
    './scripts/utils/preset-storage.js',
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
                return self.skipWaiting();
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
 * Fetch event - serve from cache, fall back to network.
 * Uses a "stale-while-revalidate" strategy for most assets.
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

    // For firmware binaries (.bin), use network-first strategy
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

    // For manifest.json, use network-first to get latest firmware list
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

    // For static assets, use stale-while-revalidate
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
 * Message event - handle cache clearing requests.
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME)
                .then(() => {
                    console.log('[SW] Cache cleared');
                    if (event.ports[0]) {
                        event.ports[0].postMessage({ success: true });
                    }
                })
        );
    }
});
