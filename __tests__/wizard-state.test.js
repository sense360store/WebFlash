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
        </div>
        <div id="step-1" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="mounting" value="wall">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-2" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="power" value="usb">
            <input type="radio" name="power" value="poe">
            <input type="radio" name="power" value="pwr">
        </div>
        <div id="step-3" class="wizard-step">
            <div class="module-availability-hint" id="module-availability-hint"></div>
            <div id="fan-module-section"></div>
            <div class="module-group">
                <input type="radio" name="airiq" value="none" checked>
                <input type="radio" name="airiq" value="base">
                <input type="radio" name="airiq" value="pro">
            </div>
            <div class="module-group">
                <input type="radio" name="presence" value="none" checked>
                <input type="radio" name="presence" value="base">
                <input type="radio" name="presence" value="pro">
            </div>
            <div class="module-group">
                <input type="radio" name="comfort" value="none" checked>
                <input type="radio" name="comfort" value="base">
            </div>
            <div class="module-group">
                <input type="radio" name="fan" value="none" checked>
                <input type="radio" name="fan" value="pwm">
                <input type="radio" name="fan" value="analog">
            </div>
            <label><input type="checkbox" data-remember-toggle></label>
        </div>
        <div id="step-4" class="wizard-step">
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
            <div id="config-summary"></div>
            <div class="primary-action-group"><p data-ready-helper></p></div>
            <div id="firmware-selector"><select id="firmware-version-select"></select></div>
            <div id="compatible-firmware"></div>
            <button id="download-btn" disabled></button>
            <button id="copy-firmware-url-btn" disabled></button>
            <label><input type="checkbox" data-remember-toggle></label>
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

    test('wizard navigation handles text node click targets', async () => {
        const stateModule = await import('../scripts/state.js');
        await import('../scripts/navigation.js');

        expect(stateModule.getStep()).toBe(1);

        const nextButton = document.querySelector('#step-1 .btn-next');
        nextButton.disabled = false;
        const textNode = nextButton.firstChild;
        expect(textNode).not.toBeNull();

        if (textNode && typeof textNode.closest !== 'function') {
            Object.defineProperty(textNode, 'closest', {
                value: () => null,
                configurable: true
            });
        }

        const clickEvent = new MouseEvent('click', { bubbles: true });
        expect(() => textNode.dispatchEvent(clickEvent)).not.toThrow();

        expect(stateModule.getStep()).toBe(2);
    });
});
