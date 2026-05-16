import { jest } from '@jest/globals';

function renderDom() {
    document.body.innerHTML = `
    <div id="browser-warning"></div>
    <div data-preflight-banner-mount></div>
    <div data-freshness-banner-mount></div>
    <div data-about-panel-mount></div>
    <div class="progress-step" data-step="1"></div>
    <div class="progress-step" data-step="2"></div>
    <div class="progress-step" data-step="3"></div>
    <div class="progress-step" data-step="4"></div>
    <div class="progress-step" data-step="5"></div>
    <div id="step-1" class="wizard-step"><button class="btn-next" data-next>Next</button></div>
    <div id="step-2" class="wizard-step"><button class="btn-next" data-next>Next</button><input type="radio" name="mounting" value="wall" checked></div>
    <div id="step-3" class="wizard-step"><button class="btn-next" data-next>Next</button><input type="radio" name="power" value="usb" checked></div>
    <div id="step-4" class="wizard-step"></div>
    <div id="step-5" class="wizard-step">
      <div class="secondary-action-group"><p data-ready-helper></p></div>
      <div id="compatible-firmware">
        <p data-ready-helper></p>
        <esp-web-install-button data-webflash-install>
          <button slot="activate"></button>
        </esp-web-install-button>
      </div>
      <button data-module-summary-install></button>
      <button id="download-btn"></button>
      <button id="copy-firmware-url-btn"></button>
      <ul data-preflight-list>
        <li data-preflight-item="browser-support" data-status="pending"><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
        <li data-preflight-item="device-visibility" data-status="pending"><span data-preflight-status="device-visibility"></span><span data-preflight-detail="device-visibility"></span></li>
        <li data-preflight-item="connection-quality" data-status="pending"><span data-preflight-status="connection-quality"></span><span data-preflight-detail="connection-quality"></span></li>
        <li data-preflight-item="firmware-verification" data-status="pending"><span data-preflight-status="firmware-verification"></span><span data-preflight-detail="firmware-verification"></span></li>
        <li data-preflight-item="user-acknowledgement" data-status="pending"><span data-preflight-status="user-acknowledgement"></span><span data-preflight-detail="user-acknowledgement"></span></li>
      </ul>
    </div>`;
}

describe('cache freshness — build-info module', () => {
    test('exports BUILD_INFO with the three documented keys', async () => {
        const { BUILD_INFO } = await import('../scripts/build-info.js');
        expect(BUILD_INFO).toBeDefined();
        expect(BUILD_INFO).toEqual(expect.objectContaining({
            appVersion: expect.any(String),
            buildCommit: expect.any(String),
            buildTimestamp: expect.any(String)
        }));
    });

    test('object is frozen so consumers cannot mutate the build info', async () => {
        const { BUILD_INFO } = await import('../scripts/build-info.js');
        expect(Object.isFrozen(BUILD_INFO)).toBe(true);
    });
});

describe('cache freshness — manifest-freshness service', () => {
    test("returns 'current' when generated_at matches", async () => {
        const { checkManifestFreshness } = await import('../scripts/services/manifest-freshness.js');
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ generated_at: '2026-05-04T00:00:00.000Z' })
        }));
        const result = await checkManifestFreshness(
            { generated_at: '2026-05-04T00:00:00.000Z' },
            { fetchImpl }
        );
        expect(result.verdict).toBe('current');
    });

    test("returns 'stale' when live generated_at is newer", async () => {
        const { checkManifestFreshness } = await import('../scripts/services/manifest-freshness.js');
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ generated_at: '2026-06-01T00:00:00.000Z' })
        }));
        const result = await checkManifestFreshness(
            { generated_at: '2026-05-04T00:00:00.000Z' },
            { fetchImpl }
        );
        expect(result.verdict).toBe('stale');
        expect(result.liveGeneratedAt).toBe('2026-06-01T00:00:00.000Z');
    });

    test("returns 'unknown' on network error", async () => {
        const { checkManifestFreshness } = await import('../scripts/services/manifest-freshness.js');
        const fetchImpl = jest.fn(() => Promise.reject(new Error('offline')));
        const result = await checkManifestFreshness(
            { generated_at: '2026-05-04T00:00:00.000Z' },
            { fetchImpl }
        );
        expect(result.verdict).toBe('unknown');
        expect(result.error).toMatch(/offline|network/i);
    });

    test("returns 'unknown' when generated_at is missing on either side", async () => {
        const { checkManifestFreshness } = await import('../scripts/services/manifest-freshness.js');
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({})
        }));
        const result = await checkManifestFreshness(
            { generated_at: '2026-05-04T00:00:00.000Z' },
            { fetchImpl }
        );
        expect(result.verdict).toBe('unknown');
    });

    test('uses network-first behavior (cache: no-store)', async () => {
        const { checkManifestFreshness } = await import('../scripts/services/manifest-freshness.js');
        const fetchImpl = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ generated_at: '2026-05-04T00:00:00.000Z' })
        }));
        await checkManifestFreshness(
            { generated_at: '2026-05-04T00:00:00.000Z' },
            { fetchImpl }
        );
        expect(fetchImpl).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ cache: 'no-store' })
        );
    });
});

describe('cache freshness — sw-update service', () => {
    beforeEach(async () => {
        jest.resetModules();
    });

    test('exposes a snapshot with the documented shape', async () => {
        const mod = await import('../scripts/services/sw-update.js');
        mod.__resetForTests();
        const snap = mod.getServiceWorkerState();
        expect(snap).toEqual(expect.objectContaining({
            supported: expect.any(Boolean),
            controlled: expect.any(Boolean),
            updateAvailable: expect.any(Boolean),
            updateDismissed: expect.any(Boolean),
            cacheClearRequested: expect.any(Boolean)
        }));
    });

    test('subscribers are notified synchronously with the current snapshot', async () => {
        const mod = await import('../scripts/services/sw-update.js');
        mod.__resetForTests();
        const cb = jest.fn();
        mod.subscribeServiceWorkerState(cb);
        expect(cb).toHaveBeenCalled();
    });

    test('markCacheClearRequested flips the flag in the snapshot', async () => {
        const mod = await import('../scripts/services/sw-update.js');
        mod.__resetForTests();
        mod.markCacheClearRequested();
        expect(mod.getServiceWorkerState().cacheClearRequested).toBe(true);
    });

    test('dismissPendingUpdate is a no-op when nothing is pending', async () => {
        const mod = await import('../scripts/services/sw-update.js');
        mod.__resetForTests();
        mod.dismissPendingUpdate();
        expect(mod.getServiceWorkerState().updateDismissed).toBe(false);
    });
});

describe('cache freshness — cache-clear service', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('returns cancelled when the user declines the confirm dialog', async () => {
        const { clearWebFlashCache } = await import('../scripts/services/cache-clear.js');
        const reload = jest.fn();
        const result = await clearWebFlashCache({
            confirm: () => false,
            reload,
            navigatorOverride: { serviceWorker: {} }
        });
        expect(result.cleared).toBe(false);
        expect(result.reason).toBe('cancelled');
        expect(reload).not.toHaveBeenCalled();
    });

    test('posts CLEAR_CACHE to the active controller and unregisters the SW', async () => {
        const { clearWebFlashCache } = await import('../scripts/services/cache-clear.js');
        const postMessage = jest.fn();
        const unregister = jest.fn(() => Promise.resolve(true));
        const reload = jest.fn();
        const navOverride = {
            serviceWorker: {
                controller: { postMessage },
                getRegistrations: () => Promise.resolve([{ unregister }])
            }
        };
        const result = await clearWebFlashCache({
            confirm: () => true,
            reload,
            navigatorOverride: navOverride
        });
        expect(postMessage).toHaveBeenCalledTimes(1);
        const firstArg = postMessage.mock.calls[0][0];
        expect(firstArg).toEqual(expect.objectContaining({ type: 'CLEAR_CACHE' }));
        expect(unregister).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(result.cleared).toBe(true);
    });

    test('reloads even when there is no service worker controller', async () => {
        const { clearWebFlashCache } = await import('../scripts/services/cache-clear.js');
        const reload = jest.fn();
        const result = await clearWebFlashCache({
            confirm: () => true,
            reload,
            navigatorOverride: {}
        });
        expect(reload).toHaveBeenCalled();
        expect(result.cleared).toBe(false);
        expect(result.reason).toBe('no-service-worker');
    });
});

describe('cache freshness — freshness banner', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
    });

    test('renders block-level banner when SW update is pending and not dismissed', async () => {
        const { __testHooks } = await import('../scripts/layout/freshness-banner.js');
        const active = __testHooks.pickActiveState(
            { updateAvailable: true, updateDismissed: false },
            'current',
            false
        );
        expect(active).not.toBeNull();
        expect(active.level).toBe('block');
        expect(active.kind).toBe('sw-update-block');
        expect(active.summary).toMatch(/Reload before flashing/i);
    });

    test('downgrades to warning when update is dismissed', async () => {
        const { __testHooks } = await import('../scripts/layout/freshness-banner.js');
        const active = __testHooks.pickActiveState(
            { updateAvailable: true, updateDismissed: true },
            'current',
            false
        );
        expect(active.level).toBe('warn');
        expect(active.kind).toBe('sw-update-warn');
    });

    test('renders block-level banner when manifest freshness is stale', async () => {
        const { __testHooks } = await import('../scripts/layout/freshness-banner.js');
        const active = __testHooks.pickActiveState(
            { updateAvailable: false, updateDismissed: false },
            'stale',
            false
        );
        expect(active.level).toBe('block');
        expect(active.kind).toBe('manifest-stale');
    });

    test('renders warning banner when freshness is unknown and not yet acknowledged', async () => {
        const { __testHooks } = await import('../scripts/layout/freshness-banner.js');
        const active = __testHooks.pickActiveState(
            { updateAvailable: false, updateDismissed: false },
            'unknown',
            false
        );
        expect(active.level).toBe('warn');
        expect(active.kind).toBe('manifest-unknown');
        expect(active.primary.label).toMatch(/Acknowledge/i);
    });

    test('renders nothing when SW is fine and manifest is current', async () => {
        const { __testHooks } = await import('../scripts/layout/freshness-banner.js');
        const active = __testHooks.pickActiveState(
            { updateAvailable: false, updateDismissed: false },
            'current',
            false
        );
        expect(active).toBeNull();
    });
});

describe('cache freshness — about panel', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
    });

    test('renders BUILD_INFO and manifest metadata, falling back to "unknown" for missing fields', async () => {
        const { __testHooks } = await import('../scripts/layout/about-panel.js');
        const mount = document.querySelector(__testHooks.MOUNT_SELECTOR);
        __testHooks.renderInto(mount, {
            manifest_version: 1,
            generated_at: '2026-05-04T00:00:00.000Z',
            source_commit: 'abc1234',
            freshness: 'current'
        });
        expect(mount.querySelector('[data-about="about-manifest-version"]').textContent).toBe('1');
        expect(mount.querySelector('[data-about="about-manifest-generated"]').textContent)
            .toContain('2026-05-04');
        expect(mount.querySelector('[data-about="about-manifest-commit"]').textContent).toBe('abc1234');
        expect(mount.querySelector('[data-about="about-manifest-freshness"]').textContent).toBe('current');
        expect(mount.querySelector('[data-cache-clear]')).not.toBeNull();
    });

    test('renders "unknown" when manifest metadata is missing entirely', async () => {
        const { __testHooks } = await import('../scripts/layout/about-panel.js');
        const mount = document.querySelector(__testHooks.MOUNT_SELECTOR);
        __testHooks.renderInto(mount, null);
        expect(mount.querySelector('[data-about="about-manifest-version"]').textContent).toBe('unknown');
        expect(mount.querySelector('[data-about="about-manifest-commit"]').textContent).toBe('unknown');
    });
});

describe('cache freshness — diagnostics integration', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
        Object.defineProperty(global.navigator, 'serial', { value: { getPorts: jest.fn(() => Promise.resolve([])) }, configurable: true });
        window.confirm = jest.fn(() => true);
    });

    test('diagnostics bundle includes app, manifest, and service_worker blocks', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const bundle = __testHooks.buildDiagnosticsBundle();

        expect(bundle.app).toEqual(expect.objectContaining({
            app_version: expect.any(String),
            build_commit: expect.any(String),
            build_timestamp: expect.any(String)
        }));
        // Each manifest field is either populated (string/number) or null
        // when no manifest has been loaded yet.
        expect(bundle.manifest).toHaveProperty('manifest_version');
        expect(bundle.manifest).toHaveProperty('generated_at');
        expect(bundle.manifest).toHaveProperty('source_commit');
        expect(bundle.manifest).toHaveProperty('freshness');
        expect(typeof bundle.manifest.freshness).toBe('string');
        expect(bundle.service_worker).toEqual(expect.objectContaining({
            supported: expect.any(Boolean),
            controlled: expect.any(Boolean),
            update_available: expect.any(Boolean),
            update_dismissed: expect.any(Boolean),
            cache_clear_requested: expect.any(Boolean)
        }));
    });

    test('redactDiagnosticsValue does not redact the new app/manifest/service_worker keys', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const redacted = __testHooks.redactDiagnosticsValue({
            app: { app_version: '1.2.3', build_commit: 'abc', build_timestamp: 't' },
            manifest: { manifest_version: 1, generated_at: 'g', source_commit: 'sc', freshness: 'current' },
            service_worker: { supported: true, controlled: true, update_available: false, update_dismissed: false, cache_clear_requested: false }
        });
        expect(redacted.app.app_version).toBe('1.2.3');
        expect(redacted.app.build_commit).toBe('abc');
        expect(redacted.manifest.manifest_version).toBe(1);
        expect(redacted.manifest.generated_at).toBe('g');
        expect(redacted.manifest.source_commit).toBe('sc');
        expect(redacted.manifest.freshness).toBe('current');
        expect(redacted.service_worker.update_available).toBe(false);
    });

    test('captureManifestMetadata + getManifestMetadata round-trip', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.captureManifestMetadata({
            manifest_version: 1,
            generated_at: '2026-05-04T00:00:00.000Z',
            source_commit: 'deadbeef'
        });
        const md = __testHooks.getManifestMetadata();
        expect(md.manifest_version).toBe(1);
        expect(md.generated_at).toBe('2026-05-04T00:00:00.000Z');
        expect(md.source_commit).toBe('deadbeef');
        expect(typeof md.freshness).toBe('string');
    });

    test('manifest freshness state reflects in diagnostics bundle', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('stale');
        const bundle = __testHooks.buildDiagnosticsBundle();
        expect(bundle.manifest.freshness).toBe('stale');
    });
});

describe('cache freshness — install gating policy', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
        Object.defineProperty(global.navigator, 'serial', { value: { getPorts: jest.fn(() => Promise.resolve([])) }, configurable: true });
        window.confirm = jest.fn(() => true);
        window.currentFirmware = { parts: [{ path: 'fw.bin', offset: 0 }] };
    });

    function injectInstallControls() {
        const container = document.getElementById('compatible-firmware');
        container.innerHTML = `
          <p data-ready-helper></p>
          <esp-web-install-button data-webflash-install>
            <button slot="activate"></button>
          </esp-web-install-button>
        `;
    }

    function registerFirmware(__testHooks) {
        const build = {
            firmwareId: 'test-build-1',
            channel: 'stable',
            version: '1.0.0',
            config_string: 'Ceiling-USB',
            parts: [{ path: 'fw.bin', offset: 0 }],
            source_commit: 'abc1234',
            changelog: ['initial'],
            md5: '0'.repeat(32),
            sha256: '0'.repeat(64)
        };
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        window.currentFirmware = build;
    }

    async function clearOtherPreflightGates(__testHooks) {
        // Mark connection metrics so the connection-quality preflight passes,
        // and seed window.latestPreflightChecks with all-pass entries so the
        // freshness gate is the only remaining blocker.
        __testHooks.updateConnectionQualityMetrics({
            disconnects: 0,
            reconnectAttempts: 0,
            serialReadFailures: 0,
            serialWriteFailures: 0,
            retryCount: 0,
            stabilityWindowStart: Date.now() - 35000
        });
        window.latestPreflightChecks = [
            { key: 'browser-support', state: 'pass', detail: 'ok', blocking: false },
            { key: 'device-visibility', state: 'pass', detail: 'ok', blocking: false },
            { key: 'connection-quality', state: 'pass', detail: 'ok', blocking: false },
            { key: 'firmware-verification', state: 'pass', detail: 'ok', blocking: false },
            { key: 'user-acknowledgement', state: 'pass', detail: 'ok', blocking: false }
        ];
    }

    test('install button stays disabled while manifest freshness is stale', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('stale');
        __testHooks.updateFirmwareControls();

        const installButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        expect(installButton).not.toBeNull();
        expect(installButton.disabled).toBe(true);
        expect(installButton.title).toMatch(/newer firmware manifest/i);
    });

    test("install button stays disabled while manifest freshness is 'unknown' and not acknowledged", async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('unknown');
        __testHooks.updateFirmwareControls();

        const installButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        expect(installButton).not.toBeNull();
        expect(installButton.disabled).toBe(true);
        expect(installButton.title).toMatch(/could not confirm/i);
    });

    test("acknowledging 'unknown' freshness clears the freshness block on the install button", async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('unknown');
        __testHooks.setManifestFreshnessAcknowledgement(true);
        __testHooks.updateFirmwareControls();

        const installButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        expect(installButton).not.toBeNull();
        // Acknowledgement clears the freshness block; other preflight gates
        // may keep the button disabled but the title should no longer show
        // the freshness reason.
        if (installButton.title) {
            expect(installButton.title).not.toMatch(/could not confirm/i);
            expect(installButton.title).not.toMatch(/newer firmware manifest/i);
        }
    });

    test('summary install button title explains the freshness reason when manifest is stale', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('stale');
        __testHooks.updateFirmwareControls();

        const summaryButton = document.querySelector('[data-module-summary-install]');
        expect(summaryButton).not.toBeNull();
        expect(summaryButton.disabled).toBe(true);
        expect(summaryButton.title).toMatch(/newer firmware manifest/i);
    });

    test("summary install button title explains the freshness reason when verdict is 'unknown' and not acknowledged", async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('unknown');
        __testHooks.updateFirmwareControls();

        const summaryButton = document.querySelector('[data-module-summary-install]');
        expect(summaryButton).not.toBeNull();
        expect(summaryButton.disabled).toBe(true);
        expect(summaryButton.title).toMatch(/could not confirm/i);
    });

    test('install activate handler blocks the click if freshness goes stale between render and click', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        // Freshness is 'current' at render time so the button is enabled and
        // the click handler is bound to the actual activate button.
        __testHooks.setManifestFreshnessState('current');
        __testHooks.attachInstallButtonListeners();
        __testHooks.updateFirmwareControls();

        // Now simulate a stale verdict landing after the user moused down on
        // the button. The defensive check inside the click handler must
        // catch this even though the button was rendered enabled.
        __testHooks.setManifestFreshnessState('stale');

        const activateButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        // Force-enable to bypass the rendered disabled state — we are
        // exercising the click-handler defense, not the disabled state.
        activateButton.disabled = false;

        const clickEvent = new Event('click', { bubbles: true, cancelable: true });
        activateButton.dispatchEvent(clickEvent);

        expect(clickEvent.defaultPrevented).toBe(true);
        const helper = document.querySelector('#compatible-firmware [data-ready-helper]');
        expect(helper.textContent).toMatch(/newer firmware manifest/i);
        expect(helper.classList.contains('is-error')).toBe(true);
    });

    test('summary install button click handler does not delegate to primary install when freshness is stale', async () => {
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        await clearOtherPreflightGates(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        __testHooks.setManifestFreshnessState('current');
        __testHooks.attachInstallButtonListeners();
        __testHooks.updateFirmwareControls();

        // Stale verdict lands before the user reaches the summary button.
        __testHooks.setManifestFreshnessState('stale');

        const primaryInstall = document.querySelector('#compatible-firmware esp-web-install-button button[slot="activate"]');
        const primarySpy = jest.spyOn(primaryInstall, 'click');

        const summaryButton = document.querySelector('[data-module-summary-install]');
        summaryButton.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

        // Summary delegates to primary only when all gates pass; freshness
        // failure must short-circuit before the delegate call.
        expect(primarySpy).not.toHaveBeenCalled();
        // The summary button must show the freshness reason after the
        // re-render triggered by its handler.
        expect(summaryButton.title).toMatch(/newer firmware manifest/i);
    });
});

// Service-worker update state is set by the sw-update.js module via
// internal lifecycle events (the public surface only exposes a snapshot
// reader and `dismissPendingUpdate`). To drive `updateAvailable` / the
// dismissed flag deterministically we mock the sw-update module per test.
// The freshness-banner and diagnostics modules import the same module —
// the mock provides every export so importing state.js (which transitively
// loads diagnostics.js) does not blow up.
function mockSwUpdate(snapshot = {}) {
    jest.unstable_mockModule('../scripts/services/sw-update.js', () => ({
        getServiceWorkerState: () => ({
            supported: true,
            controlled: true,
            updateAvailable: false,
            updateDismissed: false,
            cacheClearRequested: false,
            ...snapshot
        }),
        subscribeServiceWorkerState: () => () => {},
        initServiceWorkerUpdates: () => Promise.resolve(null),
        dismissPendingUpdate: () => {},
        triggerSkipWaitingAndReload: () => {},
        markCacheClearRequested: () => {},
        __resetForTests: () => {}
    }));
}

describe('cache freshness — install gating with SW update waiting', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
        Object.defineProperty(global.navigator, 'serial', { value: { getPorts: jest.fn(() => Promise.resolve([])) }, configurable: true });
        window.confirm = jest.fn(() => true);
        window.currentFirmware = { parts: [{ path: 'fw.bin', offset: 0 }] };
    });

    function injectInstallControls() {
        const container = document.getElementById('compatible-firmware');
        container.innerHTML = `
          <p data-ready-helper></p>
          <esp-web-install-button data-webflash-install>
            <button slot="activate"></button>
          </esp-web-install-button>
        `;
    }

    function registerFirmware(__testHooks) {
        const build = {
            firmwareId: 'test-build-1',
            channel: 'stable',
            version: '1.0.0',
            config_string: 'Ceiling-USB',
            parts: [{ path: 'fw.bin', offset: 0 }],
            source_commit: 'abc1234',
            changelog: ['initial'],
            md5: '0'.repeat(32),
            sha256: '0'.repeat(64)
        };
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        window.currentFirmware = build;
    }

    function seedAllPassPreflight(__testHooks) {
        __testHooks.updateConnectionQualityMetrics({
            disconnects: 0,
            reconnectAttempts: 0,
            serialReadFailures: 0,
            serialWriteFailures: 0,
            retryCount: 0,
            stabilityWindowStart: Date.now() - 35000
        });
        window.latestPreflightChecks = [
            { key: 'browser-support', state: 'pass', detail: 'ok', blocking: false },
            { key: 'device-visibility', state: 'pass', detail: 'ok', blocking: false },
            { key: 'connection-quality', state: 'pass', detail: 'ok', blocking: false },
            { key: 'firmware-verification', state: 'pass', detail: 'ok', blocking: false },
            { key: 'user-acknowledgement', state: 'pass', detail: 'ok', blocking: false }
        ];
    }

    test('evaluateFreshnessGate reports a block when a SW update is waiting and not dismissed', async () => {
        mockSwUpdate({ updateAvailable: true, updateDismissed: false });
        const { __testHooks } = await import('../scripts/state.js');
        const verdict = __testHooks.evaluateFreshnessGate();
        expect(verdict.ok).toBe(false);
        expect(verdict.swUpdateBlocking).toBe(true);
        expect(verdict.blockingReason).toMatch(/WebFlash update is available/i);
    });

    test('evaluateFreshnessGate clears the SW-update block once the user dismisses the pending update', async () => {
        mockSwUpdate({ updateAvailable: true, updateDismissed: true });
        const { __testHooks } = await import('../scripts/state.js');
        const verdict = __testHooks.evaluateFreshnessGate();
        expect(verdict.swUpdateBlocking).toBe(false);
        // No other freshness signal is set, so the gate is fully open.
        expect(verdict.ok).toBe(true);
        expect(verdict.blockingReason).toBe('');
    });

    test('install button and summary install button both block with SW-update reason when an update is waiting', async () => {
        mockSwUpdate({ updateAvailable: true, updateDismissed: false });
        const { __testHooks, setStep } = await import('../scripts/state.js');
        setStep(5, { animate: false, skipUrlUpdate: true });
        registerFirmware(__testHooks);
        injectInstallControls();
        seedAllPassPreflight(__testHooks);
        __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
        __testHooks.setPreFlashAcknowledgement(true);
        // Manifest is fresh; only the SW-update path should block install.
        __testHooks.setManifestFreshnessState('current');
        __testHooks.updateFirmwareControls();

        const installButton = document.querySelector('esp-web-install-button button[slot="activate"]');
        expect(installButton).not.toBeNull();
        expect(installButton.disabled).toBe(true);
        expect(installButton.title).toMatch(/WebFlash update is available/i);

        const summaryButton = document.querySelector('[data-module-summary-install]');
        expect(summaryButton).not.toBeNull();
        expect(summaryButton.disabled).toBe(true);
        expect(summaryButton.title).toMatch(/WebFlash update is available/i);
    });
});
