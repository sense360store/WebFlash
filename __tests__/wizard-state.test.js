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
            <div class="secondary-action-group"><p data-ready-helper></p></div>
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

        // Without mounting/power: max reachable is Step 2 (Core). Step 1
        // (Start) is always reachable; Step 2 unlocks once mounting is set
        // — see getMaxReachableStep() in scripts/state.js.
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

        // Without mounting/power, max reachable is Step 2 (Core). Step 1
        // (Start) is always reachable; Step 2 unlocks once mounting is set.
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

    test('fresh visit with no URL params lands on Step 1: Start', async () => {
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

    // WF-FRESHNESS-UX-001 — copy/test clarification. These tests pin the
    // user-facing wording so the override is unambiguous: continuing means
    // *using the firmware list already loaded in this browser*, not silently
    // trusting that the manifest is current.
    describe('WF-FRESHNESS-UX-001 — clarified freshness warning copy', () => {
        test("the unknown-verdict preflight detail names the recheck control and explains the override scope", async () => {
            const { __testHooks } = await import('../scripts/state.js');
            __testHooks.setManifestFreshnessState('unknown');
            const checks = await __testHooks.refreshPreflightDiagnostics();
            const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
            expect(freshnessCheck.state).toBe('warn');
            // Clearer wording: "firmware list" instead of "manifest", and the
            // override scope reads "firmware list already loaded in this
            // browser" so the user sees this is an explicit override of the
            // freshness check, not a silent pass.
            expect(freshnessCheck.detail).toMatch(/firmware list/i);
            expect(freshnessCheck.detail).toMatch(/already loaded in this browser/i);
            // Keep the recheck control discoverable by name.
            expect(freshnessCheck.detail).toMatch(/Recheck manifest freshness/i);
            // Old wording must not regress.
            expect(freshnessCheck.detail).not.toMatch(/install with the manifest you have/i);
        });

        test("the install-gate blocking reason on 'unknown' uses the clearer firmware-list wording", async () => {
            const { __testHooks } = await import('../scripts/state.js');
            __testHooks.setManifestFreshnessState('unknown');
            const verdict = __testHooks.evaluateFreshnessGate();
            expect(verdict.ok).toBe(false);
            expect(verdict.blockingReason).toMatch(/firmware list/i);
            expect(verdict.blockingReason).toMatch(/already loaded in this browser/i);
            expect(verdict.blockingReason).toMatch(/Recheck manifest freshness/i);
            expect(verdict.blockingReason).not.toMatch(/install with the manifest you have/i);
        });

        test("the acknowledged-verdict preflight detail describes the override the user actually accepted", async () => {
            const { __testHooks } = await import('../scripts/state.js');
            __testHooks.setManifestFreshnessState('unknown');
            __testHooks.setManifestFreshnessAcknowledgement(true);
            const checks = await __testHooks.refreshPreflightDiagnostics();
            const freshnessCheck = checks.find(check => check.key === 'manifest-freshness');
            expect(freshnessCheck.state).toBe('pass');
            expect(freshnessCheck.detail).toMatch(/acknowledged/i);
            expect(freshnessCheck.detail).toMatch(/firmware list already loaded in this browser/i);
            expect(freshnessCheck.detail).toMatch(/Recheck manifest freshness/i);
            expect(freshnessCheck.detail).not.toMatch(/install with the manifest you have/i);
        });

        test("the recheck button is still rendered when the verdict is 'unknown'", async () => {
            const { __testHooks } = await import('../scripts/state.js');
            __testHooks.setManifestFreshnessState('unknown');
            await __testHooks.refreshPreflightDiagnostics();

            const recheckBtn = document.querySelector('[data-manifest-freshness-recheck]');
            expect(recheckBtn).not.toBeNull();
            expect(recheckBtn.disabled).toBe(false);
            expect(recheckBtn.textContent).toMatch(/Recheck manifest freshness/i);
        });

        test('install stays blocked until the freshness acknowledgement is checked', async () => {
            const { __testHooks } = await import('../scripts/state.js');
            __testHooks.setManifestFreshnessState('unknown');
            // No acknowledgement yet → freshness gate is closed.
            expect(__testHooks.evaluateFreshnessGate().ok).toBe(false);
            // Toggling the inline ack checkbox flips the gate open.
            const ackInput = document.querySelector('[data-manifest-freshness-acknowledge]');
            expect(ackInput).not.toBeNull();
            ackInput.checked = true;
            ackInput.dispatchEvent(new Event('change', { bubbles: true }));
            expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);
        });

        test('freshness acknowledgement does not satisfy outstanding preview-channel acknowledgements', async () => {
            // Preview-channel ack and freshness ack are orthogonal gates.
            // Ticking the freshness ack must not collapse the preview ack
            // queue — the WF-LED-003 preview-channel exposure model stays
            // authoritative.
            const { __testHooks } = await import('../scripts/state.js');

            const previewBuild = {
                firmwareId: 'preview-test-build',
                channel: 'preview',
                version: '1.0.0',
                config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED',
                parts: [{ path: 'led.bin', offset: 0 }]
            };

            __testHooks.setManifestFreshnessState('unknown');
            __testHooks.setManifestFreshnessAcknowledgement(true);
            expect(__testHooks.evaluateFreshnessGate().ok).toBe(true);

            // Preview-channel acknowledgement queue is still populated
            // because the freshness ack does not satisfy it.
            const outstanding = __testHooks.getOutstandingChannelAcknowledgements(previewBuild);
            expect(outstanding.length).toBeGreaterThan(0);
            const outstandingKeys = outstanding.map(item => item.key);
            expect(outstandingKeys.some(key => /preview/i.test(key))).toBe(true);
            outstanding.forEach(item => {
                expect(__testHooks.isChannelAcknowledged(item.key, previewBuild)).toBe(false);
            });
        });

        test('freshness acknowledgement does not bypass the stale (hard fail) freshness verdict', async () => {
            // The override is for the 'unknown' verdict only. A 'stale'
            // verdict is a hard fail — even if the ack is set, the install
            // gate must remain closed and the blocking reason must point to
            // the stale manifest, not the unknown-override copy.
            const { __testHooks } = await import('../scripts/state.js');
            __testHooks.setManifestFreshnessState('stale');
            __testHooks.setManifestFreshnessAcknowledgement(true);

            const verdict = __testHooks.evaluateFreshnessGate();
            expect(verdict.ok).toBe(false);
            expect(verdict.manifestStaleBlocking).toBe(true);
            expect(verdict.blockingReason).toMatch(/newer firmware manifest/i);
            // The unknown-verdict override copy must not leak into the
            // hard-fail path.
            expect(verdict.blockingReason).not.toMatch(/already loaded in this browser/i);
            expect(verdict.blockingReason).not.toMatch(/check the acknowledgement/i);
        });
    });
});

describe('WF-WIZARD-AVAIL-001 — module availability runtime integration', () => {
    function renderAvailabilityDom() {
        // Static markup that mirrors the production index.html for the
        // module groups + fan cards the availability renderer touches.
        // The pill / detail slots match the WF-WIZARD-AVAIL-001 hooks.
        document.body.innerHTML = `
            <div id="step-1" class="wizard-step">
                <input type="radio" name="mounting" value="ceiling">
            </div>
            <div id="step-2" class="wizard-step" hidden>
                <input type="radio" name="voice" value="none" checked>
            </div>
            <div id="step-3" class="wizard-step" hidden>
                <input type="radio" name="power" value="poe">
            </div>
            <div id="step-4" class="wizard-step" hidden>
                <div id="module-availability-hint"></div>
                <section class="module-group module-group--toggle" data-module-group="roomiq" id="roomiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="roomiq" data-variant-on="roomiq">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Room sensing</span>
                            <span class="module-group__meta">Sense360 RoomIQ · <span class="module-group__sku">S360-200</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="roomiq" value="none" checked>
                        <input type="radio" name="roomiq" value="roomiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="airiq" id="airiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="airiq" data-variant-on="airiq">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Air quality sensing</span>
                            <span class="module-group__meta">Sense360 AirIQ · <span class="module-group__sku">S360-210</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="airiq" value="none" checked>
                        <input type="radio" name="airiq" value="airiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="ventiq" id="ventiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="ventiq" data-variant-on="ventiq">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Bathroom air sensing</span>
                            <span class="module-group__meta">Sense360 VentIQ · <span class="module-group__sku">S360-211</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="ventiq" value="none" checked>
                        <input type="radio" name="ventiq" value="ventiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="led" id="led-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="led" data-variant-on="led">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Status LED ring</span>
                            <span class="module-group__meta">Sense360 LED · <span class="module-group__sku">S360-300</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="led" value="none" checked>
                        <input type="radio" name="led" value="led">
                    </div>
                </section>
                <section class="module-group" data-module-group="fan" id="fan-module-section">
                    <label class="module-card option-card" data-module-card="fan" data-variant="none">
                        <input type="radio" name="fan" value="none" checked>
                        <div class="module-card__inner"></div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="relay">
                        <input type="radio" name="fan" value="relay">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="pwm">
                        <input type="radio" name="fan" value="pwm">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="analog">
                        <input type="radio" name="fan" value="analog">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="triac">
                        <input type="radio" name="fan" value="triac">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                </section>
                <section class="firmware-target-preview" id="firmware-target-preview" data-firmware-target-preview>
                    <code class="firmware-target-preview__value" data-firmware-target-preview-value></code>
                    <p class="firmware-target-preview__warning" data-firmware-target-preview-warning hidden></p>
                </section>
            </div>
            <div id="step-5" class="wizard-step" hidden></div>
        `;
    }

    // Mirror the current manifest.json shape: Release-One stable + LED
    // preview + Rescue. Kept inline so the test pins decisions against the
    // real manifest channels rather than a synthetic mix.
    const currentManifest = {
        builds: [
            { config_string: 'Ceiling-POE-AirIQ-RoomIQ', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'd.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-RoomIQ', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'e.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-RoomIQ-LED', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'f.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-VentIQ-RoomIQ', channel: 'stable', chipFamily: 'ESP32-S3', parts: [{ path: 'a.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'b.bin', offset: 0 }] },
            { config_string: 'Rescue', channel: 'rescue', chipFamily: 'ESP32-S3', parts: [{ path: 'c.bin', offset: 0 }] }
        ]
    };

    beforeEach(() => {
        jest.resetModules();
        renderAvailabilityDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(currentManifest)
        }));
    });

    test('WF-TRIAC-001 — TRIAC card gains the advanced/manual-warning affordance and stays selectable', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const triacInput = document.querySelector('input[name="fan"][value="triac"]');
        const triacCard = triacInput.closest('.module-card');
        // WF-TRIAC-001 — radio is NOT disabled. Advanced-manual-warning is
        // visible AND selectable; the install gate enforces the ack +
        // manifest-match interlock.
        expect(triacInput.disabled).toBe(false);
        expect(triacCard.classList.contains('is-blocked')).toBe(false);
        expect(triacCard.classList.contains('is-advanced-warning')).toBe(true);
        // No aria-disabled — the card is interactive.
        expect(triacCard.hasAttribute('aria-disabled')).toBe(false);
        expect(triacCard.getAttribute('data-availability-state')).toBe('advanced-manual-warning');

        const pill = triacCard.querySelector('[data-module-availability-pill]');
        expect(pill.textContent).toBe('Advanced / manual only');
        expect(pill.dataset.availabilityState).toBe('advanced-manual-warning');
        expect(pill.dataset.availabilityTone).toBe('danger');
        expect(pill.hidden).toBe(false);

        const detail = triacCard.querySelector('[data-module-availability-detail]');
        expect(detail.textContent).toMatch(/mains-connected/i);
        expect(detail.textContent).toMatch(/not compliance-certified/i);
        expect(detail.textContent).toMatch(/not Release-One/i);
        expect(detail.textContent).toMatch(/not a kit/i);
        expect(detail.textContent).toMatch(/not recommended/i);
        expect(detail.textContent).toMatch(/no installable firmware/i);
        // WF-UX-008: the customer-visible TRIAC detail must not expose internal
        // task / release / tracking IDs. They survive only in the machine
        // reasonCode + the data-availability-state hook for support tooling.
        expect(detail.textContent).not.toMatch(/HW-005/);
        expect(detail.textContent).not.toMatch(/COMPLIANCE-001/);
    });

    test('Relay, PWM and DAC show available-preview', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        // WEBFLASH-RELAY-001 — FanRelay manual-preview build imported, so Relay
        // is available-preview (was design-pending).
        const relayPill = document.querySelector('.module-card[data-variant="relay"] [data-module-availability-pill]');
        expect(relayPill.dataset.availabilityState).toBe('available-preview');
        expect(relayPill.textContent).toBe('Preview');

        // WEBFLASH-PWM-001 — FanPWM manual-preview build imported, so PWM is
        // available-preview (was no-firmware).
        const pwmPill = document.querySelector('.module-card[data-variant="pwm"] [data-module-availability-pill]');
        expect(pwmPill.dataset.availabilityState).toBe('available-preview');
        expect(pwmPill.textContent).toBe('Preview');

        // WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — FanDAC manual-preview build
        // imported, so DAC is available-preview (was no-firmware).
        const dacPill = document.querySelector('.module-card[data-variant="analog"] [data-module-availability-pill]');
        expect(dacPill.dataset.availabilityState).toBe('available-preview');
        expect(dacPill.textContent).toBe('Preview');
    });

    test('RoomIQ and VentIQ resolve to available-stable from the manifest', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const roomiqPill = document.querySelector('#roomiq-module-section [data-module-availability-pill]');
        expect(roomiqPill.dataset.availabilityState).toBe('available-stable');
        expect(roomiqPill.textContent).toBe('Available');

        const ventiqPill = document.querySelector('#ventiq-module-section [data-module-availability-pill]');
        expect(ventiqPill.dataset.availabilityState).toBe('available-stable');
    });

    test('LED resolves to available-preview because it only appears in a preview build', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const ledPill = document.querySelector('#led-module-section [data-module-availability-pill]');
        expect(ledPill.dataset.availabilityState).toBe('available-preview');
        expect(ledPill.textContent).toBe('Preview');
        // Warning tone matches the preview-channel acknowledgement gate copy.
        expect(ledPill.dataset.availabilityTone).toBe('warning');
    });

    test('AirIQ resolves to available-preview (manifest-derived after the first preview import)', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const airiqPill = document.querySelector('#airiq-module-section [data-module-availability-pill]');
        expect(airiqPill.dataset.availabilityState).toBe('available-preview');
        expect(airiqPill.textContent).toBe('Preview');
        // Warning tone matches the preview-channel acknowledgement gate copy.
        expect(airiqPill.dataset.availabilityTone).toBe('warning');
    });

    test('WF-TRIAC-001 — classifyVariantForRender returns advanced-manual-warning for TRIAC, selectable=true, installable=false', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        const result = stateModule.__testHooks.classifyVariantForRender('fan', 'triac');
        expect(result.state).toBe('advanced-manual-warning');
        expect(result.installable).toBe(false);
        // WF-TRIAC-001 — selectable so the user can opt in through the
        // custom path; the install gate then enforces the orthogonal
        // advanced/manual-warning acknowledgement.
        expect(result.selectable).toBe(true);
        expect(result.tone).toBe('danger');
    });

    test('classifyVariantForRender returns available-preview (installable) for AirIQ', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        const result = stateModule.__testHooks.classifyVariantForRender('airiq', 'airiq');
        expect(result.state).toBe('available-preview');
        expect(result.installable).toBe(true);
        // AirIQ now has a Ceiling-POE-AirIQ-RoomIQ preview build; install still
        // gates on the preview-channel acknowledgement at Step 5.
        expect(result.selectable).toBe(true);
    });
});

describe('WF-UX-006 — kit path resolves only to Release-One', () => {
    // Kit-path invariant: applying the Sense360 Ceiling VentIQ + RoomIQ PoE
    // kit must produce config_string === "Ceiling-POE-VentIQ-RoomIQ", LED
    // must stay 'none', AirIQ must stay 'none', fan must stay 'none'.
    // WF-UX-006 changes the Step-1 surface, NOT the kit catalogue or the
    // config-string grammar.
    //
    // The fixture below mirrors enough of the production Step 4 markup
    // (bathroom checkbox, VentIQ + RoomIQ radios) for the wizard's
    // syncConfigurationFromInputs() pass to preserve the kit-applied
    // ventiq + bathroom values. Without the bathroom checkbox in the
    // DOM, sync zeroes both back to 'none'/false; the production wizard
    // does have the checkbox, so this rig faithfully simulates kit flow.

    function renderKitPathDom() {
        document.body.innerHTML = `
            <div id="step-1" class="wizard-step">
                <input type="radio" name="voice" value="none" checked>
            </div>
            <div id="step-2" class="wizard-step" hidden>
                <input type="radio" name="mounting" value="ceiling">
            </div>
            <div id="step-3" class="wizard-step" hidden>
                <input type="radio" name="power" value="poe">
            </div>
            <div id="step-4" class="wizard-step" hidden>
                <div id="module-availability-hint"></div>
                <input type="checkbox" name="bathroom">
                <section class="module-group" data-module-group="roomiq" id="roomiq-module-section">
                    <input type="radio" name="roomiq" value="none" checked>
                    <input type="radio" name="roomiq" value="roomiq">
                </section>
                <section class="module-group" data-module-group="airiq" id="airiq-module-section">
                    <input type="radio" name="airiq" value="none" checked>
                    <input type="radio" name="airiq" value="airiq">
                </section>
                <section class="module-group" data-module-group="ventiq" id="ventiq-module-section">
                    <input type="radio" name="ventiq" value="none" checked>
                    <input type="radio" name="ventiq" value="ventiq">
                </section>
                <section class="module-group" data-module-group="led" id="led-module-section">
                    <input type="radio" name="led" value="none" checked>
                    <input type="radio" name="led" value="led">
                </section>
                <section class="module-group" data-module-group="fan" id="fan-module-section">
                    <input type="radio" name="fan" value="none" checked>
                    <input type="radio" name="fan" value="relay">
                    <input type="radio" name="fan" value="pwm">
                    <input type="radio" name="fan" value="analog">
                    <input type="radio" name="fan" value="triac">
                </section>
            </div>
            <div id="step-5" class="wizard-step" hidden></div>
        `;
    }

    beforeEach(() => {
        jest.resetModules();
        window.history.replaceState(null, '', '/');
        renderKitPathDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(minimalManifest)
        }));
    });

    test('Release-One kit prefill produces config_string Ceiling-POE-VentIQ-RoomIQ', async () => {
        const stateModule = await import('../scripts/state.js');
        // Mirror what scripts/kit-mode.js applyKitToWizard() does after a
        // kit is selected: clear stale module picks, then setState with
        // the kit's wizard_state. Sourced verbatim from
        // scripts/data/kits.json (S360-KIT-CEILING-VENTIQ-ROOMIQ-POE).
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            airiq: 'none',
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            fan: 'none',
            led: 'none',
            voice: 'none'
        });

        const state = stateModule.getState();
        expect(state.mounting).toBe('ceiling');
        expect(state.power).toBe('poe');
        expect(state.bathroom).toBe(true);
        expect(state.ventiq).toBe('ventiq');
        expect(state.roomiq).toBe('roomiq');
        // Kit path never opts into LED — the LED preview stays gated by
        // the Step 4 toggle + preview-channel acknowledgement.
        expect(state.led).toBe('none');
        // Kit path never opts into AirIQ — VentIQ is the bathroom-mode pair.
        expect(state.airiq).toBe('none');
        // Kit path never opts into any fan driver.
        expect(state.fan).toBe('none');
        // Voice stays hidden / legacy-only per WF-WIZARD-AVAIL-001.
        expect(state.voice).toBe('none');

        const configString = stateModule.__testHooks.buildFirmwareTargetPreviewString(state);
        expect(configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('Release-One kit prefill makes Step 5 reachable end-to-end', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'none'
        });
        expect(stateModule.getMaxReachableStep()).toBe(5);
    });

    test('Release-One kit config string does not contain FanTRIAC, LED, or AirIQ tokens', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'none'
        });
        const configString = stateModule.__testHooks.buildFirmwareTargetPreviewString(stateModule.getState());
        // FanTRIAC remains blocked under HW-005 + COMPLIANCE-001.
        expect(configString.toLowerCase()).not.toContain('fantriac');
        // LED stays excluded from Release-One.
        expect(configString).not.toMatch(/(^|-)LED(-|$)/);
        // AirIQ is mutually exclusive with VentIQ.
        expect(configString).not.toMatch(/(^|-)AirIQ(-|$)/);
    });
});

describe('WF-UX-006 — custom path preserves unavailable-module honesty', () => {
    // Custom-path invariant: the Step-4 module-availability classifier
    // (WF-WIZARD-AVAIL-001) keeps marking documented-but-not-installable
    // modules with their availability pills. WF-UX-006 must not regress
    // any of those classifications when the user picks the custom card.

    function renderAvailabilityDom() {
        document.body.innerHTML = `
            <div id="step-1" class="wizard-step">
                <input type="radio" name="voice" value="none" checked>
            </div>
            <div id="step-3" class="wizard-step" hidden>
                <input type="radio" name="power" value="poe">
            </div>
            <div id="step-4" class="wizard-step" hidden>
                <div id="module-availability-hint"></div>
                <section class="module-group module-group--toggle" data-module-group="roomiq" id="roomiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="roomiq" data-variant-on="roomiq">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Room sensing</span>
                            <span class="module-group__meta">Sense360 RoomIQ · <span class="module-group__sku">S360-200</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="roomiq" value="none" checked>
                        <input type="radio" name="roomiq" value="roomiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="airiq" id="airiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="airiq" data-variant-on="airiq">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Air quality sensing</span>
                            <span class="module-group__meta">Sense360 AirIQ · <span class="module-group__sku">S360-210</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="airiq" value="none" checked>
                        <input type="radio" name="airiq" value="airiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="led" id="led-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="led" data-variant-on="led">
                        <span class="module-group__summary-text">
                            <span class="module-group__title">Status LED ring</span>
                            <span class="module-group__meta">Sense360 LED · <span class="module-group__sku">S360-300</span></span>
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <span class="availability-detail" data-module-availability-detail hidden></span>
                        </span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="led" value="none" checked>
                        <input type="radio" name="led" value="led">
                    </div>
                </section>
                <section class="module-group" data-module-group="fan" id="fan-module-section">
                    <label class="module-card option-card" data-module-card="fan" data-variant="none">
                        <input type="radio" name="fan" value="none" checked>
                        <div class="module-card__inner"></div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="relay">
                        <input type="radio" name="fan" value="relay">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="pwm">
                        <input type="radio" name="fan" value="pwm">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="analog">
                        <input type="radio" name="fan" value="analog">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="triac">
                        <input type="radio" name="fan" value="triac">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                </section>
            </div>
            <div id="step-5" class="wizard-step" hidden></div>
        `;
    }

    const currentManifest = {
        builds: [
            { config_string: 'Ceiling-POE-AirIQ-RoomIQ', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'd.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-RoomIQ', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'e.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-RoomIQ-LED', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'f.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-VentIQ-RoomIQ', channel: 'stable', chipFamily: 'ESP32-S3', parts: [{ path: 'a.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'b.bin', offset: 0 }] },
            { config_string: 'Rescue', channel: 'rescue', chipFamily: 'ESP32-S3', parts: [{ path: 'c.bin', offset: 0 }] }
        ]
    };

    beforeEach(() => {
        jest.resetModules();
        window.history.replaceState(null, '', '/');
        renderAvailabilityDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(currentManifest)
        }));
    });

    test('WF-TRIAC-001 — TRIAC is selectable under the custom path as advanced-manual-warning', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();
        const result = stateModule.__testHooks.classifyVariantForRender('fan', 'triac');
        expect(result.state).toBe('advanced-manual-warning');
        expect(result.installable).toBe(false);
        // Custom-path TRIAC is selectable; the install gate is the
        // authority for whether the user can actually flash.
        expect(result.selectable).toBe(true);

        const triacInput = document.querySelector('input[name="fan"][value="triac"]');
        expect(triacInput).not.toBeNull();
        expect(triacInput.disabled).toBe(false);
    });

    test('LED stays available-preview (preview-channel acknowledgement gate intact)', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();
        const result = stateModule.__testHooks.classifyVariantForRender('led', 'led');
        expect(result.state).toBe('available-preview');
    });

    test('AirIQ resolves to available-preview in custom mode (manifest-derived preview build)', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();
        const result = stateModule.__testHooks.classifyVariantForRender('airiq', 'airiq');
        expect(result.state).toBe('available-preview');
        expect(result.installable).toBe(true);
    });

    test('Relay, PWM and DAC show available-preview', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();
        // WEBFLASH-RELAY-001 / WEBFLASH-PWM-001 / WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001
        // — Relay, PWM and DAC are all available-preview (FanRelay + FanPWM + FanDAC
        // manual-preview builds imported). TRIAC stays advanced-manual-warning.
        expect(stateModule.__testHooks.classifyVariantForRender('fan', 'relay').state).toBe('available-preview');
        expect(stateModule.__testHooks.classifyVariantForRender('fan', 'pwm').state).toBe('available-preview');
        expect(stateModule.__testHooks.classifyVariantForRender('fan', 'analog').state).toBe('available-preview');
    });
});

describe('WF-TRIAC-001 — advanced/manual-warning runtime integration', () => {
    // Pins the WF-TRIAC-001 advanced/manual-warning gate end-to-end:
    //   - TRIAC card is selectable in the custom path.
    //   - The inline ack region reveals only while TRIAC is the live
    //     selection; the checkbox drives the per-(module,variant) ack map.
    //   - The install gate keeps `readyToFlash === false` until both an
    //     advanced/manual-warning artifact is imported AND the ack is
    //     checked, regardless of the other usual gates.
    //   - Switching to a different fan variant or to the kit-cleared state
    //     drops the stored ack so a future TRIAC reselection re-prompts.
    //   - Release-One stable + LED preview paths are byte-identical to
    //     pre-WF-TRIAC-001.

    function renderTriacDom() {
        document.body.innerHTML = `
            <div id="step-1" class="wizard-step">
                <input type="radio" name="mounting" value="ceiling">
            </div>
            <div id="step-2" class="wizard-step" hidden>
                <input type="radio" name="voice" value="none" checked>
            </div>
            <div id="step-3" class="wizard-step" hidden>
                <input type="radio" name="power" value="poe">
            </div>
            <div id="step-4" class="wizard-step" hidden>
                <div id="module-availability-hint"></div>
                <input type="checkbox" name="bathroom">
                <section class="module-group module-group--toggle" data-module-group="roomiq" id="roomiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="roomiq" data-variant-on="roomiq">
                        <span class="availability-pill" data-module-availability-pill hidden></span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="roomiq" value="none" checked>
                        <input type="radio" name="roomiq" value="roomiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="airiq" id="airiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="airiq" data-variant-on="airiq">
                        <span class="availability-pill" data-module-availability-pill hidden></span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="airiq" value="none" checked>
                        <input type="radio" name="airiq" value="airiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="ventiq" id="ventiq-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="ventiq" data-variant-on="ventiq">
                        <span class="availability-pill" data-module-availability-pill hidden></span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="ventiq" value="none" checked>
                        <input type="radio" name="ventiq" value="ventiq">
                    </div>
                </section>
                <section class="module-group module-group--toggle" data-module-group="led" id="led-module-section">
                    <label class="module-group__summary module-group__summary--toggle">
                        <input type="checkbox" data-module-toggle data-module-key="led" data-variant-on="led">
                        <span class="availability-pill" data-module-availability-pill hidden></span>
                    </label>
                    <div class="module-group__hidden-controls" hidden>
                        <input type="radio" name="led" value="none" checked>
                        <input type="radio" name="led" value="led">
                    </div>
                </section>
                <section class="module-group" data-module-group="fan" id="fan-module-section">
                    <label class="module-card option-card" data-module-card="fan" data-variant="none">
                        <input type="radio" name="fan" value="none" checked>
                        <div class="module-card__inner"></div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="relay">
                        <input type="radio" name="fan" value="relay">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="pwm">
                        <input type="radio" name="fan" value="pwm">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="analog">
                        <input type="radio" name="fan" value="analog">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <label class="module-card option-card" data-module-card="fan" data-variant="triac">
                        <input type="radio" name="fan" value="triac">
                        <div class="module-card__inner">
                            <span class="availability-pill" data-module-availability-pill hidden></span>
                            <p class="availability-detail" data-module-availability-detail hidden></p>
                        </div>
                    </label>
                    <div
                        class="module-card__advanced-warning"
                        data-advanced-warning-region
                        data-advanced-warning-module="fan"
                        data-advanced-warning-variant="triac"
                        hidden
                        aria-hidden="true"
                    >
                        <h4>Advanced / manual warning</h4>
                        <label>
                            <input
                                type="checkbox"
                                data-advanced-warning-acknowledge
                                data-advanced-warning-module="fan"
                                data-advanced-warning-variant="triac"
                            >
                            <span>I understand</span>
                        </label>
                    </div>
                </section>
            </div>
            <div id="step-5" class="wizard-step">
                <div class="secondary-action-group"><p data-ready-helper></p></div>
                <div id="firmware-selector" hidden>
                    <select id="firmware-version-select"></select>
                </div>
                <div id="compatible-firmware"><p data-ready-helper></p></div>
                <section data-channel-acknowledgement-panel hidden aria-hidden="true"></section>
                <button id="download-btn" disabled></button>
                <button id="copy-firmware-url-btn" disabled></button>
                <button data-module-summary-install hidden></button>
                <label class="pre-flash-checklist__acknowledgement"><input type="checkbox" data-preflash-acknowledge></label>
                <ul data-preflight-list>
                    <li data-preflight-item="browser-support" data-status="pass"><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
                </ul>
            </div>
        `;
    }

    const releaseOneOnlyManifest = {
        builds: [
            { config_string: 'Ceiling-POE-VentIQ-RoomIQ', channel: 'stable', chipFamily: 'ESP32-S3', parts: [{ path: 'a.bin', offset: 0 }] },
            { config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED', channel: 'preview', chipFamily: 'ESP32-S3', parts: [{ path: 'b.bin', offset: 0 }] },
            { config_string: 'Rescue', channel: 'rescue', chipFamily: 'ESP32-S3', parts: [{ path: 'c.bin', offset: 0 }] }
        ]
    };

    beforeEach(() => {
        jest.resetModules();
        window.history.replaceState(null, '', '/');
        renderTriacDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(releaseOneOnlyManifest)
        }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });
        delete window.currentFirmware;
        delete window.currentConfigString;
    });

    test('TRIAC card is visible and selectable in the custom path', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const triacInput = document.querySelector('input[name="fan"][value="triac"]');
        const triacCard = triacInput.closest('.module-card');
        expect(triacInput.disabled).toBe(false);
        expect(triacCard.classList.contains('is-advanced-warning')).toBe(true);
        expect(triacCard.classList.contains('is-blocked')).toBe(false);
        expect(triacCard.hasAttribute('aria-disabled')).toBe(false);
        expect(triacCard.getAttribute('data-availability-state')).toBe('advanced-manual-warning');

        const pill = triacCard.querySelector('[data-module-availability-pill]');
        expect(pill.textContent).toBe('Advanced / manual only');
        expect(pill.dataset.availabilityTone).toBe('danger');
    });

    test('Advanced-warning region is hidden when TRIAC is not selected, revealed when it is', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const region = document.querySelector('[data-advanced-warning-region]');
        expect(region).not.toBeNull();
        expect(region.hidden).toBe(true);

        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'triac',
            voice: 'none'
        });
        stateModule.__testHooks.updateAdvancedWarningRegions();
        expect(region.hidden).toBe(false);

        const checkbox = region.querySelector('[data-advanced-warning-acknowledge]');
        expect(checkbox).not.toBeNull();
        expect(checkbox.checked).toBe(false);
        expect(checkbox.disabled).toBe(false);
    });

    test('TRIAC selection requires the advanced/manual-warning ack — install gate blocks otherwise (defense in depth with synthetic manifest)', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        // Select TRIAC.
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'triac',
            voice: 'none'
        });

        // Defense-in-depth: inject a SYNTHETIC FanTRIAC manifest entry so
        // the manifest-match check passes. Real WebFlash never ships this;
        // the test proves the ack still gates install even when (by some
        // future regression) a FanTRIAC build appears in the manifest.
        const syntheticBuild = {
            firmwareId: 'firmware-ceiling-poe-fantriac-roomiq-synthetic',
            chipFamily: 'ESP32-S3',
            channel: 'stable',
            version: '1.0.0',
            config_string: 'Ceiling-POE-FanTRIAC-RoomIQ',
            deprecated: false,
            parts: [{ path: 'firmware/configurations/synthetic-fantriac.bin', offset: 0 }],
            md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        };
        stateModule.__testHooks.setFirmwareOptions([syntheticBuild], 'Ceiling-POE-FanTRIAC-RoomIQ');
        stateModule.__testHooks.selectDefaultFirmware();

        // Mark verification + pre-flash ack as satisfied so only the
        // advanced-warning gate stands between us and "ready". Verification
        // requires a matching firmwareId.
        stateModule.__testHooks.setFirmwareVerificationState({
            status: 'verified',
            message: 'Firmware verified successfully.',
            firmwareId: syntheticBuild.firmwareId,
            parts: [],
            provenance: null,
            authenticity: null
        });
        stateModule.__testHooks.setPreFlashAcknowledgement(true);

        // Without the advanced-warning ack the install gate must block.
        stateModule.__testHooks.updateFirmwareControls();
        expect(stateModule.__testHooks.isAdvancedWarningAcknowledged('fan', 'triac')).toBe(false);
        const outstanding = stateModule.__testHooks.getOutstandingAdvancedWarningAcknowledgements();
        expect(outstanding).toHaveLength(1);
        expect(outstanding[0].moduleKey).toBe('fan');
        expect(outstanding[0].variantKey).toBe('triac');
    });

    test('Checking the advanced-warning ack flips outstanding count to zero (with synthetic manifest)', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'triac',
            voice: 'none'
        });

        stateModule.__testHooks.setAdvancedWarningAcknowledged('fan', 'triac', true);
        expect(stateModule.__testHooks.isAdvancedWarningAcknowledged('fan', 'triac')).toBe(true);
        expect(stateModule.__testHooks.getOutstandingAdvancedWarningAcknowledgements()).toHaveLength(0);
    });

    test('Deselecting TRIAC clears the advanced-warning ack', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'triac',
            voice: 'none'
        });
        stateModule.__testHooks.setAdvancedWarningAcknowledged('fan', 'triac', true);
        expect(stateModule.__testHooks.isAdvancedWarningAcknowledged('fan', 'triac')).toBe(true);

        // Switch to PWM. The renderer + pruneInactiveAdvancedWarningAcks
        // must drop the consent entry so re-picking TRIAC re-prompts.
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'pwm',
            voice: 'none'
        });
        stateModule.__testHooks.updateAdvancedWarningRegions();
        expect(stateModule.__testHooks.isAdvancedWarningAcknowledged('fan', 'triac')).toBe(false);
    });

    test('TRIAC selected without any imported artifact stays not installable (real manifest)', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'triac',
            voice: 'none'
        });

        // Even if the customer ticks the ack, the real manifest has no
        // FanTRIAC build → window.currentFirmware stays null → install
        // gate stays disabled. This pins the no-build / not-imported
        // behaviour required by WF-TRIAC-001.
        stateModule.__testHooks.setAdvancedWarningAcknowledged('fan', 'triac', true);
        stateModule.__testHooks.findCompatibleFirmware();
        stateModule.__testHooks.updateFirmwareControls();

        const downloadBtn = document.getElementById('download-btn');
        expect(downloadBtn.disabled).toBe(true);
        expect(window.currentFirmware).toBeFalsy();
    });

    test('Release-One stable kit selection never auto-picks TRIAC and clears any prior TRIAC ack', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();

        // Pre-condition: user picked TRIAC and acknowledged the warning.
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            airiq: 'none',
            ventiq: 'none',
            roomiq: 'none',
            led: 'none',
            fan: 'triac',
            voice: 'none'
        });
        stateModule.__testHooks.setAdvancedWarningAcknowledged('fan', 'triac', true);
        expect(stateModule.__testHooks.isAdvancedWarningAcknowledged('fan', 'triac')).toBe(true);

        // Apply the Release-One kit state (mirrors what
        // scripts/kit-mode.js applyKitToWizard does).
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            airiq: 'none',
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            fan: 'none',
            led: 'none',
            voice: 'none'
        });

        const state = stateModule.getState();
        expect(state.fan).toBe('none');
        expect(stateModule.__testHooks.isAdvancedWarningAcknowledged('fan', 'triac')).toBe(false);
        const configString = stateModule.__testHooks.buildFirmwareTargetPreviewString(state);
        expect(configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
        expect(configString.toLowerCase()).not.toContain('fantriac');
    });

    test('LED preview path is unchanged — module classification + preview-channel acknowledgement still apply', async () => {
        const stateModule = await import('../scripts/state.js');
        stateModule.__testHooks.initializeWizard();
        await stateModule.__testHooks.manifestReadyPromise();
        stateModule.__testHooks.updateModuleVariantAvailability();

        const ledClassification = stateModule.__testHooks.classifyVariantForRender('led', 'led');
        expect(ledClassification.state).toBe('available-preview');
        expect(ledClassification.installable).toBe(true);

        // Preview acks are completely orthogonal to advanced-warning acks.
        // Selecting LED must not require the advanced-warning ack, and
        // selecting TRIAC must not require the preview ack.
        stateModule.setState({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            airiq: 'none',
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            led: 'led',
            fan: 'none',
            voice: 'none'
        });
        expect(stateModule.__testHooks.getOutstandingAdvancedWarningAcknowledgements()).toHaveLength(0);
    });
});
