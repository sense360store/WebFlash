import { jest } from '@jest/globals';

const minimalManifest = { builds: [] };

function renderWizardDom() {
    document.body.innerHTML = `
        <div id="browser-warning" style="display:none"></div>
        <div class="progress-bar">
            <div class="progress-step" data-step="1"></div>
            <div class="progress-step" data-step="2"></div>
            <div class="progress-step" data-step="3"></div>
            <div class="progress-step" data-step="4"></div>
            <div class="progress-step" data-step="5"></div>
        </div>
        <div id="step-1" class="wizard-step">
            <button class="btn-next" data-next>Next</button>
            <input type="radio" name="voice" value="none" checked>
            <input type="radio" name="voice" value="base">
        </div>
        <div id="step-2" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="mounting" value="wall">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-3" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="power" value="usb">
            <input type="radio" name="power" value="poe">
            <input type="radio" name="power" value="pwr">
        </div>
        <div id="step-4" class="wizard-step">
            <div class="module-availability-hint" id="module-availability-hint"></div>
            <div id="fan-module-section"></div>
            <div class="module-group">
                <input type="radio" name="airiq" value="none" checked>
                <input type="radio" name="airiq" value="base">
                <input type="radio" name="airiq" value="pro">
            </div>
            <div class="module-group">
                <input type="radio" name="fan" value="none" checked>
                <input type="radio" name="fan" value="relay">
                <input type="radio" name="fan" value="pwm">
                <input type="radio" name="fan" value="analog">
                <input type="radio" name="fan" value="triac">
            </div>
        </div>
        <div id="step-5" class="wizard-step">
            <section class="pre-flash-checklist" data-diagnostics-state="idle">
                <div class="checklist-header">
                    <div class="checklist-header__text">
                        <h3 class="checklist-heading" id="pre-flash-title">Connection Diagnostics</h3>
                        <p class="checklist-subtitle" data-diagnostic-summary>Preparing diagnostics…</p>
                    </div>
                    <button type="button" class="checklist-refresh" data-diagnostic-refresh disabled>Retry checks</button>
                </div>
                <ul class="checklist-items">
                    <li class="checklist-item" data-diagnostic-item="browser" data-status="pending">
                        <span class="status-icon" data-diagnostic-status></span>
                        <div class="item-content">
                            <span class="item-title">Browser support</span>
                            <p class="item-text" data-diagnostic-message>Preparing check…</p>
                            <p class="item-tip" data-diagnostic-tip hidden></p>
                        </div>
                    </li>
                    <li class="checklist-item" data-diagnostic-item="webSerial" data-status="pending">
                        <span class="status-icon" data-diagnostic-status></span>
                        <div class="item-content">
                            <span class="item-title">Web Serial API</span>
                            <p class="item-text" data-diagnostic-message>Preparing check…</p>
                            <p class="item-tip" data-diagnostic-tip hidden></p>
                        </div>
                    </li>
                    <li class="checklist-item" data-diagnostic-item="ports" data-status="pending">
                        <span class="status-icon" data-diagnostic-status></span>
                        <div class="item-content">
                            <span class="item-title">Connected devices</span>
                            <p class="item-text" data-diagnostic-message>Preparing check…</p>
                            <p class="item-tip" data-diagnostic-tip hidden></p>
                        </div>
                    </li>
                    <li class="checklist-item" data-diagnostic-item="battery" data-status="pending">
                        <span class="status-icon" data-diagnostic-status></span>
                        <div class="item-content">
                            <span class="item-title">Battery readiness</span>
                            <p class="item-text" data-diagnostic-message>Preparing check…</p>
                            <p class="item-tip" data-diagnostic-tip hidden></p>
                        </div>
                    </li>
                </ul>
                <p class="diagnostic-error" data-diagnostic-error hidden></p>
            </section>
            <div class="primary-action-group"><p data-ready-helper></p></div>
            <div id="firmware-selector"><select id="firmware-version-select"></select></div>
            <div class="firmware-section">
                <h3 class="compatible-firmware-heading">
                    <span data-compatible-firmware-label>Compatible Firmware</span>
                    <span data-compatible-firmware-selection></span>
                </h3>
            </div>
            <div id="compatible-firmware"></div>
            <button id="download-btn" disabled></button>
            <button id="copy-firmware-url-btn" disabled></button>
        </div>
    `;
}

describe('wizard state module', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        renderWizardDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(minimalManifest)
        }));
        Object.defineProperty(window, 'isSecureContext', {
            value: true,
            configurable: true
        });
        Object.defineProperty(global.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            configurable: true
        });
        Object.defineProperty(global.navigator, 'serial', {
            value: {
                getPorts: jest.fn(() => Promise.resolve([]))
            },
            configurable: true
        });
        Object.defineProperty(global.navigator, 'getBattery', {
            value: jest.fn(() => Promise.resolve({ level: 0.9, charging: true })),
            configurable: true
        });
    });

    test('manifest fetch occurs once even after compatibility lookup', async () => {
        const { __testHooks } = await import('../scripts/state.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const mounting = document.querySelector('input[name="mounting"][value="wall"]');
        const power = document.querySelector('input[name="power"][value="usb"]');

        mounting.checked = true;
        power.checked = true;

        mounting.dispatchEvent(new Event('change', { bubbles: true }));
        power.dispatchEvent(new Event('change', { bubbles: true }));

        await __testHooks.findCompatibleFirmware();

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('mounting and power inputs receive a single change listener', async () => {
        const mountingInputs = Array.from(document.querySelectorAll('input[name="mounting"]'));
        const powerInputs = Array.from(document.querySelectorAll('input[name="power"]'));

        const mountingSpies = mountingInputs.map(input => jest.spyOn(input, 'addEventListener'));
        const powerSpies = powerInputs.map(input => jest.spyOn(input, 'addEventListener'));

        await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        mountingSpies.forEach(spy => {
            const changeCalls = spy.mock.calls.filter(([eventName]) => eventName === 'change');
            expect(changeCalls).toHaveLength(1);
        });

        powerSpies.forEach(spy => {
            const changeCalls = spy.mock.calls.filter(([eventName]) => eventName === 'change');
            expect(changeCalls).toHaveLength(1);
        });
    });

    test('wizard initializes without accessing localStorage', async () => {
        const originalGlobalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        const originalWindowDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

        const failingGetter = jest.fn(() => {
            throw new Error('localStorage should not be accessed');
        });

        try {
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                get: failingGetter
            });

            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                get: failingGetter
            });

            await import('../scripts/state.js');
            document.dispatchEvent(new Event('DOMContentLoaded'));

            const mountingWall = document.querySelector('input[name="mounting"][value="wall"]');
            const nextButton = document.querySelector('#step-1 .btn-next');
            expect(nextButton).not.toBeNull();

            mountingWall.checked = true;
            mountingWall.dispatchEvent(new Event('change', { bubbles: true }));

            expect(nextButton.disabled).toBe(false);
            expect(failingGetter).not.toHaveBeenCalled();
        } finally {
            if (originalGlobalDescriptor) {
                Object.defineProperty(globalThis, 'localStorage', originalGlobalDescriptor);
            } else {
                delete globalThis.localStorage;
            }

            if (originalWindowDescriptor) {
                Object.defineProperty(window, 'localStorage', originalWindowDescriptor);
            } else {
                delete window.localStorage;
            }
        }
    });

    test('progress steps reflect max reachable step after configuration changes', async () => {
        const stateModule = await import('../scripts/state.js');
        await import('../scripts/navigation.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));

        stateModule.setState(stateModule.getDefaultState(), { skipUrlUpdate: true });
        stateModule.setStep(1, { animate: false, skipUrlUpdate: true });

        expect(stateModule.getState().mounting).toBeNull();
        expect(stateModule.getState().power).toBeNull();

        const step1 = document.querySelector('.progress-step[data-step="1"]');
        const step2 = document.querySelector('.progress-step[data-step="2"]');
        const step3 = document.querySelector('.progress-step[data-step="3"]');
        const step4 = document.querySelector('.progress-step[data-step="4"]');
        const step5 = document.querySelector('.progress-step[data-step="5"]');

        // Without mounting/power: can reach Core (1) and Mounting (2)
        expect(step1.dataset.reachable).toBe('true');
        expect(step2.dataset.reachable).toBe('true');
        expect(step3.dataset.reachable).toBe('false');
        expect(step3.getAttribute('aria-disabled')).toBe('true');
        expect(step4.dataset.reachable).toBe('false');
        expect(step5.dataset.reachable).toBe('false');

        const mountingWall = document.querySelector('input[name="mounting"][value="wall"]');
        mountingWall.checked = true;
        mountingWall.dispatchEvent(new Event('change', { bubbles: true }));

        // After mounting selected: can reach up to Power (3)
        expect(step3.dataset.reachable).toBe('true');
        expect(step3.hasAttribute('aria-disabled')).toBe(false);
        expect(step4.dataset.reachable).toBe('false');
        expect(step5.dataset.reachable).toBe('false');

        const powerUsb = document.querySelector('input[name="power"][value="usb"]');
        powerUsb.checked = true;
        powerUsb.dispatchEvent(new Event('change', { bubbles: true }));

        // After power selected: can reach all steps
        expect(step4.dataset.reachable).toBe('true');
        expect(step5.dataset.reachable).toBe('true');
        expect(step4.hasAttribute('aria-disabled')).toBe(false);
        expect(step5.hasAttribute('aria-disabled')).toBe(false);
    });

    test('clicking progress steps only navigates to reachable steps', async () => {
        const stateModule = await import('../scripts/state.js');
        await import('../scripts/navigation.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));

        stateModule.setState(stateModule.getDefaultState(), { skipUrlUpdate: true });
        stateModule.setStep(1, { animate: false, skipUrlUpdate: true });

        const step4Progress = document.querySelector('.progress-step[data-step="4"]');
        expect(step4Progress).not.toBeNull();

        expect(stateModule.getState().mounting).toBeNull();
        expect(stateModule.getState().power).toBeNull();

        // Step 4 (Modules) is not reachable without mounting and power
        step4Progress.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(stateModule.getStep()).toBe(1);

        const mountingWall = document.querySelector('input[name="mounting"][value="wall"]');
        const powerUsb = document.querySelector('input[name="power"][value="usb"]');

        mountingWall.checked = true;
        mountingWall.dispatchEvent(new Event('change', { bubbles: true }));

        powerUsb.checked = true;
        powerUsb.dispatchEvent(new Event('change', { bubbles: true }));

        // Now step 4 (Modules) should be reachable
        step4Progress.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(stateModule.getStep()).toBe(4);
    });

    test('wizard navigation handles text node targets and advances to the next step', async () => {
        const stateModule = await import('../scripts/state.js');
        await import('../scripts/navigation.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));

        const nextButton = document.querySelector('#step-1 .btn-next');
        expect(nextButton).not.toBeNull();
        nextButton.setAttribute('data-next', '');
        nextButton.disabled = false;

        const textNode = nextButton.firstChild;
        expect(textNode).not.toBeNull();
        textNode.closest = () => null;

        stateModule.setStep(1, { animate: false, skipUrlUpdate: true });

        const clickEvent = new MouseEvent('click', { bubbles: true });

        expect(() => textNode.dispatchEvent(clickEvent)).not.toThrow();
        expect(stateModule.getStep()).toBe(2);
    });

    test('progress steps reflect reachability when mounting and power change', async () => {
        const stateModule = await import('../scripts/state.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));

        const steps = Array.from(document.querySelectorAll('.progress-step'));
        expect(steps).toHaveLength(5);

        const expectReachabilityMatchesState = () => {
            const maxReachable = stateModule.getMaxReachableStep();

            steps.forEach((step, index) => {
                const stepNumber = index + 1;
                const isReachable = stepNumber <= maxReachable;
                expect(step.dataset.reachable).toBe(String(isReachable));

                if (isReachable) {
                    expect(step.hasAttribute('aria-disabled')).toBe(false);
                } else {
                    expect(step.getAttribute('aria-disabled')).toBe('true');
                }
            });
        };

        expectReachabilityMatchesState();

        const mounting = document.querySelector('input[name="mounting"][value="wall"]');
        mounting.checked = true;
        mounting.dispatchEvent(new Event('change', { bubbles: true }));

        expectReachabilityMatchesState();

        const power = document.querySelector('input[name="power"][value="usb"]');
        power.checked = true;
        power.dispatchEvent(new Event('change', { bubbles: true }));

        expectReachabilityMatchesState();
    });

    test('clicking progress steps respects reachability rules', async () => {
        const stateModule = await import('../scripts/state.js');
        await import('../scripts/navigation.js');

        document.dispatchEvent(new Event('DOMContentLoaded'));

        stateModule.replaceState(stateModule.getDefaultState(), { skipUrlUpdate: true });
        stateModule.setStep(1, { animate: false, skipUrlUpdate: true });

        // Without mounting/power, max reachable is 2 (Core + Mounting)
        expect(stateModule.getMaxReachableStep()).toBe(2);
        const step4 = document.querySelector('.progress-step[data-step="4"]');
        const step5 = document.querySelector('.progress-step[data-step="5"]');

        expect(stateModule.getStep()).toBe(1);

        // Step 4 (Modules) not reachable yet
        step4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(stateModule.getStep()).toBe(1);

        const mounting = document.querySelector('input[name="mounting"][value="wall"]');
        mounting.checked = true;
        mounting.dispatchEvent(new Event('change', { bubbles: true }));

        // After mounting, max reachable is 3, step 5 still not reachable
        step5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(stateModule.getStep()).toBe(1);

        const power = document.querySelector('input[name="power"][value="usb"]');
        power.checked = true;
        power.dispatchEvent(new Event('change', { bubbles: true }));

        // After power, all steps reachable
        step4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(stateModule.getStep()).toBe(4);

        step5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(stateModule.getStep()).toBe(5);
    });

    test('compatible firmware heading reflects active selection', async () => {
        // Reset URL so the wizard starts at step 1 with no preset config —
        // a previous test in this describe block clicks mounting+power and
        // navigates to step 5, which leaves `?mount=wall&power=usb&step=5`
        // in the JSDOM URL. Without this reset, initializeFromUrl would
        // jump straight to step 5 and the WF-UX-002 no-build readiness
        // headline would (correctly) appear before this test starts.
        window.history.replaceState(null, '', window.location.pathname);
        const { __testHooks } = await import('../scripts/state.js');

        const headingSelection = document.querySelector('[data-compatible-firmware-selection]');
        const headingLabel = document.querySelector('[data-compatible-firmware-label]');
        expect(headingSelection).not.toBeNull();
        expect(headingLabel).not.toBeNull();
        expect(headingSelection.textContent.trim()).toBe('');
        expect(headingLabel.textContent.trim()).toBe('Compatible Firmware');

        window.currentFirmware = {
            firmwareId: 'firmware-123',
            manifestIndex: 123,
            release_tag: 'core-wall-usb',
            version: '0.3.1',
            channel: 'stable',
            parts: []
        };

        __testHooks.setFirmwareStatusMessage(null);
        __testHooks.renderSelectedFirmware();

        expect(headingSelection.textContent.trim()).toBe('core-wall-usb v0.3.1');
        expect(headingLabel.textContent.trim()).toBe('Compatible Firmware:');

        window.currentFirmware = {
            firmwareId: 'firmware-456',
            manifestIndex: 124,
            release_tag: '',
            config_string: 'Wall-USB-AirIQPro',
            version: '1.2.3',
            channel: 'beta',
            parts: []
        };

        __testHooks.setFirmwareStatusMessage(null);
        __testHooks.renderSelectedFirmware();

        expect(headingSelection.textContent.trim()).toBe('sense360-wall-usb-airiqpro v1.2.3');
        expect(headingLabel.textContent.trim()).toBe('Compatible Firmware:');

        window.currentFirmware = null;
        __testHooks.setFirmwareStatusMessage(null);
        __testHooks.renderSelectedFirmware();

        expect(headingSelection.textContent.trim()).toBe('');
        expect(headingSelection.hasAttribute('data-readiness')).toBe(false);
        expect(headingLabel.textContent.trim()).toBe('Compatible Firmware');

        // WF-UX-002: when the wizard knows the configuration is not in the
        // manifest, the heading surfaces the canonical no-build headline so
        // the user is not staring at a bare "Compatible Firmware" label
        // alongside the not-available card below.
        window.currentFirmware = null;
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-AirIQ',
            expectedFilename: 'Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();

        expect(headingSelection.textContent.trim()).toBe('No published firmware for this exact selection');
        expect(headingSelection.getAttribute('data-readiness')).toBe('no-build');
        expect(headingLabel.textContent.trim()).toBe('Compatible Firmware:');

        __testHooks.setFirmwareStatusMessage(null);
    });

    test('replaceState coerces legacy voice base to none', async () => {
        const stateModule = await import('../scripts/state.js');

        stateModule.replaceState({ mount: 'wall', power: 'usb', voice: 'base' }, { skipUrlUpdate: true });

        expect(stateModule.getState().voice).toBe('none');
    });

    test('fresh visit with no URL params lands on Step 1: Get started', async () => {
        window.history.replaceState(null, '', '/');

        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();

        expect(stateModule.getStep()).toBe(1);
    });

    test('kit-mode share link (configmode/sku only) lands on Step 1', async () => {
        window.history.replaceState(null, '', '?configmode=kit&sku=S360-KIT-CEILING-AIRIQ');

        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();

        expect(stateModule.getStep()).toBe(1);
    });

    test('configmode=manual without other markers lands on Step 1', async () => {
        window.history.replaceState(null, '', '?configmode=manual');

        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();

        expect(stateModule.getStep()).toBe(1);
    });

    test('manual share link with mount+power advances past Step 1', async () => {
        window.history.replaceState(null, '', '?mount=ceiling&power=usb');

        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();

        expect(stateModule.getStep()).toBeGreaterThan(1);
    });

    test('explicit step= URL param is honored even with no other markers', async () => {
        window.history.replaceState(null, '', '?step=2');

        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();

        expect(stateModule.getStep()).toBe(2);
    });
});

function renderManifestFreshnessDom() {
    document.body.innerHTML = `
        <div id="browser-warning"></div>
        <div data-preflight-banner-mount></div>
        <div data-freshness-banner-mount></div>
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
            <div class="primary-action-group"><p data-ready-helper></p></div>
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
                <li data-preflight-item="manifest-freshness" data-status="pending">
                    <span data-preflight-status="manifest-freshness"></span>
                    <span data-preflight-detail="manifest-freshness"></span>
                    <div data-manifest-freshness-actions hidden aria-hidden="true">
                        <button type="button" data-manifest-freshness-recheck>Recheck manifest freshness</button>
                        <label data-manifest-freshness-ack-control hidden aria-hidden="true">
                            <input type="checkbox" data-manifest-freshness-acknowledge>
                            <span>Acknowledge</span>
                        </label>
                    </div>
                </li>
            </ul>
        </div>`;
}

describe('manifest freshness recovery in step 5', () => {
    beforeEach(() => {
        jest.resetModules();
        renderManifestFreshnessDom();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });
    });

    test("'unknown' freshness surfaces an explicit warn signal in the preflight list", async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck).toBeDefined();
        expect(freshnessCheck.state).toBe('warn');
        expect(freshnessCheck.detail).toMatch(/could not confirm/i);
        expect(freshnessCheck.detail).toMatch(/Recheck manifest freshness/i);
        expect(freshnessCheck.blocking).toBe(true);

        const item = document.querySelector('[data-preflight-item="manifest-freshness"]');
        expect(item.dataset.status).toBe('warn');

        const actions = document.querySelector('[data-manifest-freshness-actions]');
        expect(actions.hidden).toBe(false);
        expect(actions.getAttribute('aria-hidden')).toBe('false');

        const ackControl = document.querySelector('[data-manifest-freshness-ack-control]');
        expect(ackControl.hidden).toBe(false);
        const recheckBtn = document.querySelector('[data-manifest-freshness-recheck]');
        expect(recheckBtn).not.toBeNull();
        expect(recheckBtn.disabled).toBe(false);
    });

    test("'current' freshness collapses the preflight row to pass and hides recovery controls", async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('current');
        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('pass');
        expect(freshnessCheck.blocking).toBe(false);

        const actions = document.querySelector('[data-manifest-freshness-actions]');
        expect(actions.hidden).toBe(true);
        const ackControl = document.querySelector('[data-manifest-freshness-ack-control]');
        expect(ackControl.hidden).toBe(true);
    });

    test("'stale' freshness surfaces a fail signal that adds a blocking reason", async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('stale');
        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('fail');
        expect(freshnessCheck.blocking).toBe(true);

        const policy = __testHooks.evaluatePreflightPolicy(checks);
        expect(policy.canInstall).toBe(false);
        expect(policy.blockingReasons.join(' ')).toMatch(/newer firmware manifest/i);

        const actions = document.querySelector('[data-manifest-freshness-actions]');
        expect(actions.hidden).toBe(false);
        const ackControl = document.querySelector('[data-manifest-freshness-ack-control]');
        // 'stale' is a hard fail — no inline acknowledgement, only reload.
        expect(ackControl.hidden).toBe(true);
    });

    test('inline acknowledgement clears the unknown freshness gate without a reload', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        await __testHooks.refreshPreflightDiagnostics();

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
        expect(__testHooks.evaluateFreshnessGate().blockingReason).toMatch(/Recheck manifest freshness/i);

        const ackInput = document.querySelector('[data-manifest-freshness-acknowledge]');
        ackInput.checked = true;
        ackInput.dispatchEvent(new Event('change', { bubbles: true }));

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);

        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('pass');
        expect(freshnessCheck.detail).toMatch(/acknowledged/i);
    });

    test('blocking copy on the unknown gate names the recheck and acknowledgement controls', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        const verdict = __testHooks.evaluateFreshnessGate();
        expect(verdict.ok).toBe(false);
        expect(verdict.blockingReason).toMatch(/Recheck manifest freshness/i);
        expect(verdict.blockingReason).toMatch(/acknowledgement/i);
        expect(verdict.blockingReason).not.toMatch(/warning above/i);
    });

    test('Recheck manifest freshness button re-runs the probe and updates the verdict in-session', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.captureManifestMetadata({
            manifest_version: 1,
            generated_at: '2026-05-04T00:00:00.000Z',
            source_commit: 'abc1234'
        });

        // First probe: simulate a network error → verdict 'unknown'.
        global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
        await __testHooks.checkManifestFreshnessNow({ force: true });
        await __testHooks.refreshPreflightDiagnostics();

        let freshnessCheck = (window.latestPreflightChecks || []).find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('warn');
        expect(__testHooks.getManifestFreshness !== undefined).toBe(true);

        // Now make the recheck succeed: matching generated_at → verdict 'current'.
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ generated_at: '2026-05-04T00:00:00.000Z' })
        }));

        const recheckBtn = document.querySelector('[data-manifest-freshness-recheck]');
        expect(recheckBtn).not.toBeNull();
        recheckBtn.click();

        // Allow the async recheck + refresh to settle.
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));

        const checks = await __testHooks.refreshPreflightDiagnostics();
        freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('pass');
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);

        const actions = document.querySelector('[data-manifest-freshness-actions]');
        expect(actions.hidden).toBe(true);
    });

    test('inline acknowledgement does NOT satisfy the freshness gate when the verdict is stale', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('stale');
        // The acknowledgement is a no-op for stale (the row hides the ack
        // control entirely). Even if a stray setter sets it, the gate must
        // remain blocked because stale is a hard fail.
        __testHooks.setManifestFreshnessAcknowledgement(true);
        const verdict = __testHooks.evaluateFreshnessGate();
        expect(verdict.ok).toBe(false);
        expect(verdict.manifestStaleBlocking).toBe(true);
    });

    test('a fresh unknown verdict after acknowledgement re-blocks the gate', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setManifestFreshnessState('unknown');
        __testHooks.setManifestFreshnessAcknowledgement(true);
        expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);

        // Simulate a recheck that produces a different verdict and then
        // bounces back to 'unknown'. The state setter clears ack on a real
        // verdict change.
        __testHooks.setManifestFreshnessState('current');
        __testHooks.setManifestFreshnessState('unknown');

        expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
        const checks = await __testHooks.refreshPreflightDiagnostics();
        const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
        expect(freshnessCheck.state).toBe('warn');
    });
});
