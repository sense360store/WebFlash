/**
 * PR 2 (WebFlash 2.0 migration) — Engine API seam smoke test.
 *
 * Goal: prove the 2.0 view can import the 1.0 logic as a view-agnostic engine.
 * This is the "trivial smoke import from a scratch module" acceptance criterion
 * from docs/webflash-2-migration-prompts.md (PR 2). The scratch module is
 * scripts/engine.js: a 2.0-side facade that imports each of the nine
 * engine modules and re-exports their view-agnostic surface. If any engine
 * module failed to import in a 2.0 context, the top-level import below would
 * throw and this suite would error before a single assertion ran.
 *
 * The seam is a pure re-export. These tests also pin that property by asserting
 * each re-export is the SAME reference as the underlying engine export, so the
 * seam can never quietly become a divergent reimplementation of the trust logic.
 *
 * No 1.0 behaviour is exercised here: the spot checks are pure, side-effect-free
 * calls only.
 */
import { describe, it, expect } from '@jest/globals';

import engine, {
    state,
    capabilities,
    channels,
    provenance,
    freshness,
    swUpdate,
    cache,
    kits,
    a11y,
    diagnostics,
    postFlash
} from '../scripts/engine.js';

// Direct imports of one representative export per engine module, used to prove
// the seam re-exports live references rather than reimplementing anything.
import { setState, verifyFirmwareIntegrity, evaluateInstallGate, INSTALL_GATE_CHECK_IDS } from '../scripts/state.js';
import { isStableChannel } from '../scripts/utils/release-channels.js';
import { validateFirmwareProvenance, CHECK_IDS } from '../scripts/utils/firmware-provenance.js';
import { checkManifestFreshness } from '../scripts/services/manifest-freshness.js';
import { postFlashService } from '../scripts/services/post-flash.js';
import { subscribeServiceWorkerState } from '../scripts/services/sw-update.js';
import { clearWebFlashCache } from '../scripts/services/cache-clear.js';
import { loadKitCatalog } from '../scripts/utils/kit-config.js';
import { getFocusableElements } from '../scripts/utils/a11y.js';
import { buildSupportBundle } from '../scripts/services/diagnostics.js';
import { detectCapabilities } from '../scripts/capabilities.js';

describe('PR 2 — WebFlash 2.0 engine seam', () => {
    it('imports every engine module from a 2.0-side module without throwing', () => {
        // Reaching this assertion proves the top-level import of the seam (which
        // imports state.js, release-channels.js, firmware-provenance.js,
        // manifest-freshness.js, sw-update.js, cache-clear.js, kit-config.js,
        // a11y.js, and diagnostics.js) succeeded in the jsdom 2.0 context.
        expect(engine).toBeDefined();
    });

    it('exposes one frozen namespace per engine module via the default export', () => {
        expect(Object.isFrozen(engine)).toBe(true);
        expect(Object.keys(engine).sort()).toEqual([
            'a11y',
            'cache',
            'capabilities',
            'channels',
            'diagnostics',
            'freshness',
            'kits',
            'postFlash',
            'provenance',
            'state',
            'swUpdate'
        ]);
        for (const namespace of Object.values(engine)) {
            expect(Object.isFrozen(namespace)).toBe(true);
        }
    });

    it('named namespace exports are the same objects as the default export bundles', () => {
        expect(engine.state).toBe(state);
        expect(engine.capabilities).toBe(capabilities);
        expect(engine.channels).toBe(channels);
        expect(engine.provenance).toBe(provenance);
        expect(engine.freshness).toBe(freshness);
        expect(engine.swUpdate).toBe(swUpdate);
        expect(engine.cache).toBe(cache);
        expect(engine.kits).toBe(kits);
        expect(engine.a11y).toBe(a11y);
        expect(engine.diagnostics).toBe(diagnostics);
        expect(engine.postFlash).toBe(postFlash);
        // The post-flash namespace re-exports the live singleton service.
        expect(postFlash.service).toBe(postFlashService);
    });

    describe('state machine surface', () => {
        it('exposes the documented view-agnostic accessors', () => {
            for (const name of [
                'getDefaultState',
                'getState',
                'setState',
                'replaceState',
                'getStep',
                'getTotalSteps',
                'setStep',
                'getMaxReachableStep',
                'getFirmwareReadiness',
                'getManifestMetadataForAbout'
            ]) {
                expect(typeof state[name]).toBe('function');
            }
        });

        it('re-exports the live state.js functions', () => {
            expect(state.setState).toBe(setState);
        });

        it('exposes the PR 5 install-gate bindings as live references', () => {
            // SHA-256 verification of the downloaded bytes + the composite gate.
            expect(typeof state.verifyFirmwareIntegrity).toBe('function');
            expect(typeof state.evaluateInstallGate).toBe('function');
            expect(state.verifyFirmwareIntegrity).toBe(verifyFirmwareIntegrity);
            expect(state.evaluateInstallGate).toBe(evaluateInstallGate);
            // Stable preflight-panel check ids the view renders by.
            expect(state.INSTALL_GATE_CHECK_IDS).toBe(INSTALL_GATE_CHECK_IDS);
            expect(state.INSTALL_GATE_CHECK_IDS && typeof state.INSTALL_GATE_CHECK_IDS).toBe('object');
            expect(Object.values(state.INSTALL_GATE_CHECK_IDS)).toEqual(
                expect.arrayContaining(['browser-support', 'secure-context', 'manifest-freshness', 'firmware-verification'])
            );
        });

        it('does not leak the 1.0 render internals or test hooks', () => {
            expect(state.__testHooks).toBeUndefined();
            expect(state.updateFirmwareControls).toBeUndefined();
            expect(state.findCompatibleFirmware).toBeUndefined();
            expect(state.createFirmwareCardHtml).toBeUndefined();
        });
    });

    describe('capabilities surface', () => {
        it('exposes the desktop / Web Serial / secure-context detection', () => {
            expect(typeof capabilities.detectCapabilities).toBe('function');
            expect(typeof capabilities.evaluateBrowserReadiness).toBe('function');
        });

        it('re-exports the live capabilities function', () => {
            expect(capabilities.detectCapabilities).toBe(detectCapabilities);
        });
    });

    describe('release-channels surface', () => {
        it('exposes the channel model API', () => {
            expect(Array.isArray(channels.RELEASE_CHANNELS)).toBe(true);
            for (const name of [
                'normaliseReleaseChannel',
                'getChannelPolicy',
                'isKnownChannel',
                'isStableChannel',
                'getFirmwareBadges',
                'getFirmwareWarnings',
                'getRequiredAcknowledgements',
                'getFirmwareAcknowledgementSignature',
                'filterBuildsForMode',
                'isBuildVisibleInMode',
                'pickDefaultBuild',
                'getChannelPriority'
            ]) {
                expect(typeof channels[name]).toBe('function');
            }
        });

        it('re-exports the live release-channels functions', () => {
            expect(channels.isStableChannel).toBe(isStableChannel);
            // Pure spot check that the live function works through the seam.
            expect(channels.isStableChannel('stable')).toBe(true);
            expect(channels.isStableChannel('preview')).toBe(false);
        });

        it('does not leak the release-channels test helpers', () => {
            expect(channels.__testHelpers).toBeUndefined();
        });
    });

    describe('provenance gate surface', () => {
        it('exposes the blocking install gate and stable check ids', () => {
            expect(typeof provenance.validateFirmwareProvenance).toBe('function');
            expect(provenance.CHECK_IDS && typeof provenance.CHECK_IDS).toBe('object');
            expect(Object.keys(provenance.CHECK_IDS).length).toBeGreaterThan(0);
            for (const name of [
                'computeTrustTiersFromChecks',
                'applySignatureVerificationResult',
                'applyHashVerificationResult',
                'pickDefaultEligibleBuilds',
                'describeVerificationChecks'
            ]) {
                expect(typeof provenance[name]).toBe('function');
            }
        });

        it('re-exports the live firmware-provenance gate and check ids', () => {
            expect(provenance.validateFirmwareProvenance).toBe(validateFirmwareProvenance);
            expect(provenance.CHECK_IDS).toBe(CHECK_IDS);
        });
    });

    describe('manifest freshness surface', () => {
        it('exposes the freshness verdict API', () => {
            expect(typeof freshness.checkManifestFreshness).toBe('function');
            expect(typeof freshness.resolveManifestUrl).toBe('function');
            expect(freshness.FRESHNESS_REASON && typeof freshness.FRESHNESS_REASON).toBe('object');
        });

        it('re-exports the live manifest-freshness function', () => {
            expect(freshness.checkManifestFreshness).toBe(checkManifestFreshness);
        });
    });

    describe('service-worker update surface', () => {
        it('exposes the update detection and actions', () => {
            for (const name of [
                'initServiceWorkerUpdates',
                'subscribeServiceWorkerState',
                'getServiceWorkerState',
                'dismissPendingUpdate',
                'triggerSkipWaitingAndReload',
                'markCacheClearRequested'
            ]) {
                expect(typeof swUpdate[name]).toBe('function');
            }
        });

        it('re-exports the live sw-update function', () => {
            expect(swUpdate.subscribeServiceWorkerState).toBe(subscribeServiceWorkerState);
        });
    });

    describe('cache-clear surface', () => {
        it('exposes the cache clearing action', () => {
            expect(typeof cache.clearWebFlashCache).toBe('function');
        });

        it('re-exports the live cache-clear function', () => {
            expect(cache.clearWebFlashCache).toBe(clearWebFlashCache);
        });
    });

    describe('kit catalogue surface', () => {
        it('exposes the loader and mapping helpers', () => {
            for (const name of [
                'loadKitCatalog',
                'buildCatalogFromPayload',
                'findKitBySku',
                'mapKitToWizardState',
                'summariseKitModules',
                'normaliseSku',
                'validateKitEntry'
            ]) {
                expect(typeof kits[name]).toBe('function');
            }
            expect(typeof kits.SUPPORTED_SCHEMA_VERSION).not.toBe('undefined');
        });

        it('re-exports the live kit-config loader', () => {
            expect(kits.loadKitCatalog).toBe(loadKitCatalog);
        });
    });

    describe('accessibility surface', () => {
        it('exposes the focus and live-region primitives', () => {
            for (const name of ['getFocusableElements', 'trapFocus', 'restoreFocus', 'announce']) {
                expect(typeof a11y[name]).toBe('function');
            }
        });

        it('re-exports the live a11y function and it works through the seam', () => {
            expect(a11y.getFocusableElements).toBe(getFocusableElements);
            // Pure, side-effect-free spot check.
            expect(a11y.getFocusableElements(null)).toEqual([]);
        });
    });

    describe('diagnostics / support bundle surface', () => {
        it('exposes the redacted bundle builder and recorders', () => {
            expect(diagnostics.SCHEMA_VERSION).toBe(1);
            for (const name of [
                'redactValue',
                'scrubSensitiveText',
                'buildSupportBundle',
                'copySupportBundle',
                'downloadSupportBundle',
                'initSupportBundleActions',
                'setSupportBundleStateProvider',
                'setActiveKitMetadata',
                'setConfigurationMode',
                'setSelectedKitSku',
                'getSessionDiagnosticsState',
                'recordUpdateAvailable'
            ]) {
                expect(typeof diagnostics[name]).toBe('function');
            }
        });

        it('re-exports the live diagnostics builder', () => {
            expect(diagnostics.buildSupportBundle).toBe(buildSupportBundle);
        });

        it('does not leak the diagnostics test hooks', () => {
            expect(diagnostics.__testHooks).toBeUndefined();
        });
    });
});
