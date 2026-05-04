/**
 * @fileoverview "Clear cached installer data" implementation.
 *
 * What it does:
 *   1. Confirms with the user (the warning copy is fixed by spec).
 *   2. Posts {type:'CLEAR_CACHE'} to the active service worker, which
 *      deletes the WebFlash-owned cache (handled in sw.js).
 *   3. Unregisters the service worker so the next load fetches a fresh
 *      bundle from the network.
 *   4. Reloads the page.
 *
 * It does NOT touch:
 *   - device firmware,
 *   - localStorage / sessionStorage owned by other origins,
 *   - cookies, IndexedDB, or any caches outside the WebFlash SW namespace.
 *
 * @module services/cache-clear
 */

import { markCacheClearRequested } from './sw-update.js';

const CONFIRM_COPY = 'This clears cached WebFlash files and reloads the page. It does not erase or modify your device.';

async function postClearCache(controller) {
    if (typeof MessageChannel === 'undefined') {
        try {
            controller.postMessage({ type: 'CLEAR_CACHE' });
            return { success: true, reason: 'fire-and-forget' };
        } catch (error) {
            return { success: false, reason: error.message };
        }
    }
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        const timeoutId = setTimeout(() => resolve({ success: false, reason: 'timeout' }), 3000);
        channel.port1.onmessage = (event) => {
            clearTimeout(timeoutId);
            resolve(event.data || { success: false });
        };
        try {
            controller.postMessage({ type: 'CLEAR_CACHE' }, [channel.port2]);
        } catch (error) {
            clearTimeout(timeoutId);
            resolve({ success: false, reason: error.message });
        }
    });
}

/**
 * Run the clear-cached-installer-data flow.
 *
 * @param {{
 *   confirm?: (msg: string) => boolean,
 *   reload?: () => void,
 *   navigatorOverride?: Navigator
 * }} [options] for tests; production callers pass nothing.
 * @returns {Promise<{cleared: boolean, reason?: string}>}
 */
export async function clearWebFlashCache(options = {}) {
    const confirmFn = options.confirm
        || (typeof window !== 'undefined' ? window.confirm.bind(window) : null);
    const reloadFn = options.reload
        || (typeof window !== 'undefined' ? () => window.location.reload() : () => {});
    const nav = options.navigatorOverride
        || (typeof navigator !== 'undefined' ? navigator : null);

    if (!confirmFn || !confirmFn(CONFIRM_COPY)) {
        return { cleared: false, reason: 'cancelled' };
    }

    markCacheClearRequested();

    if (!nav || !('serviceWorker' in nav)) {
        // No SW to talk to; reloading is the best we can do.
        reloadFn();
        return { cleared: false, reason: 'no-service-worker' };
    }

    const controller = nav.serviceWorker.controller;
    if (controller) {
        await postClearCache(controller);
    }

    try {
        const registrations = await nav.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister().catch(() => false)));
    } catch (error) {
        // Non-fatal — the reload still gets us out of stale-cache land.
        console.warn('[cache-clear] unregister failed:', error);
    }

    reloadFn();
    return { cleared: true };
}

export const __testing = { CONFIRM_COPY };
