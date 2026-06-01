/**
 * @fileoverview Main application entry point for WebFlash.
 * Imports all wizard modules and registers the service worker.
 * @module app
 */

// Import each wizard module exactly once to avoid duplicate initialization.
import "./scripts/theme-toggle.js";
import "./scripts/wizard-state-observer.js";
import "./scripts/state.js";
import { getManifestMetadataForAbout } from "./scripts/state.js";
import "./scripts/recommended-bundle.js";
import "./scripts/kit-mode.js";
import "./scripts/kit-presets.js";
import "./scripts/simple-install.js";
import "./scripts/compat-config.js";
import "./scripts/init-review.js";
import "./scripts/layout/state-summary.js";
import "./scripts/layout/firmware-note.js";
import "./scripts/layout/init-splitview.js";
import "./scripts/layout/option-info-popover.js";
import "./scripts/layout/rescue-entry.js";
import "./scripts/layout/post-flash-panel.js";
import { initPreflightHelpModal } from "./scripts/layout/preflight-help-modal.js";
import { initPreflightBanner } from "./scripts/layout/preflight-banner.js";
import { initSupportBundleActions, recordUpdateAvailable } from "./scripts/services/diagnostics.js";
import "./scripts/navigation.js";

initPreflightHelpModal();
initPreflightBanner();
initSupportBundleActions();

// ESP Web Tools enhancements - checkSameFirmware override for detecting installed firmware
import "./scripts/utils/esp-web-tools-overrides.js";

/**
 * Register service worker for offline support. The new sw-update service
 * owns registration + update detection so the freshness banner and the
 * install gate can react to a waiting SW. Only registers in production
 * (served over HTTPS or localhost).
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
                                recordUpdateAvailable(true);
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
