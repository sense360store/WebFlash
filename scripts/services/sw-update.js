/**
 * @fileoverview Service worker registration + update detection for WebFlash.
 *
 * Replaces the inline `navigator.serviceWorker.register(...)` block that
 * used to live in app.js. Adds:
 *   - tracking of a waiting SW (an updated bundle that can take over once
 *     the page reloads),
 *   - a subscriber API so other modules (banner UI, install gate) can react
 *     to "update available",
 *   - `triggerSkipWaitingAndReload()` that posts SKIP_WAITING to the
 *     waiting worker and reloads the page once it takes control.
 *
 * The state object is intentionally simple — UI consumers re-render on
 * every notification and read the snapshot via `getServiceWorkerState()`.
 *
 * @module services/sw-update
 */

const subscribers = new Set();

let state = {
    supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    controlled: false,
    updateAvailable: false,
    updateDismissed: false,
    cacheClearRequested: false,
    registration: null
};

let reloadingForUpdate = false;

function snapshot() {
    return {
        supported: state.supported,
        controlled: state.controlled,
        updateAvailable: state.updateAvailable,
        updateDismissed: state.updateDismissed,
        cacheClearRequested: state.cacheClearRequested
    };
}

function notify() {
    const snap = snapshot();
    for (const cb of subscribers) {
        try {
            cb(snap);
        } catch (error) {
            console.warn('[sw-update] subscriber threw:', error);
        }
    }
}

function setUpdateAvailable(value) {
    const next = Boolean(value);
    if (state.updateAvailable === next) {
        return;
    }
    state.updateAvailable = next;
    if (!next) {
        state.updateDismissed = false;
    }
    notify();
}

function trackWaitingWorker(registration) {
    if (!registration) {
        return;
    }
    if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
    }
    registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) {
            return;
        }
        installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
            }
        });
    });
}

/**
 * Register the service worker (no-op if unsupported).
 * Safe to call multiple times — the browser dedupes via `navigator.serviceWorker.register`.
 */
export function initServiceWorkerUpdates(scriptUrl = './sw.js') {
    if (!state.supported) {
        notify();
        return Promise.resolve(null);
    }

    state.controlled = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        state.controlled = Boolean(navigator.serviceWorker.controller);
        if (reloadingForUpdate) {
            // Avoid reload loops: only the page that invoked
            // `triggerSkipWaitingAndReload()` should reload here.
            window.location.reload();
            return;
        }
        notify();
    });

    return navigator.serviceWorker.register(scriptUrl)
        .then((registration) => {
            state.registration = registration;
            trackWaitingWorker(registration);
            notify();
            return registration;
        })
        .catch((error) => {
            console.warn('[sw-update] Service worker registration failed:', error);
            notify();
            return null;
        });
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 * The callback is invoked synchronously with the current snapshot.
 */
export function subscribeServiceWorkerState(cb) {
    if (typeof cb !== 'function') {
        return () => {};
    }
    subscribers.add(cb);
    try {
        cb(snapshot());
    } catch (error) {
        console.warn('[sw-update] subscriber threw:', error);
    }
    return () => subscribers.delete(cb);
}

export function getServiceWorkerState() {
    return snapshot();
}

/**
 * Mark the pending update as "dismissed" so the install gate downgrades
 * from blocking to warning. The banner stays visible (in warning mode).
 */
export function dismissPendingUpdate() {
    if (!state.updateAvailable || state.updateDismissed) {
        return;
    }
    state.updateDismissed = true;
    notify();
}

/**
 * Tell the waiting worker to activate immediately, then reload once it
 * takes control. Falls back to a plain reload if there is no waiting
 * worker (best-effort recovery).
 */
export function triggerSkipWaitingAndReload() {
    if (reloadingForUpdate) {
        return;
    }
    reloadingForUpdate = true;
    const registration = state.registration;
    const waiting = registration && registration.waiting;
    if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange handler above will reload.
        return;
    }
    window.location.reload();
}

/**
 * Mark that a cache-clear was requested in this session. Surfaced in the
 * diagnostics bundle so support can tell the user already tried clearing.
 */
export function markCacheClearRequested() {
    state.cacheClearRequested = true;
    notify();
}

// Test-only reset to support deterministic unit tests.
export function __resetForTests() {
    subscribers.clear();
    reloadingForUpdate = false;
    state = {
        supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
        controlled: false,
        updateAvailable: false,
        updateDismissed: false,
        cacheClearRequested: false,
        registration: null
    };
}
