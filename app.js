/**
 * @fileoverview Main application entry point for WebFlash.
 * Imports all wizard modules and registers the service worker.
 * @module app
 */

// Import each wizard module exactly once to avoid duplicate initialization.
import "./scripts/wizard-state-observer.js";
import "./scripts/state.js";
import "./scripts/recommended-bundle.js";
import "./scripts/compat-config.js";
import "./scripts/init-review.js";
import "./scripts/layout/state-summary.js";
import "./scripts/layout/firmware-note.js";
import "./scripts/layout/init-splitview.js";
import "./scripts/layout/option-info-popover.js";
import "./scripts/navigation.js";

/**
 * Register service worker for offline support.
 * Only registers in production (served over HTTPS or localhost).
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('[WebFlash] Service worker registered:', registration.scope);

                // Check for updates periodically
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('[WebFlash] New version available');
                            }
                        });
                    }
                });
            })
            .catch((error) => {
                console.warn('[WebFlash] Service worker registration failed:', error);
            });
    });
}
