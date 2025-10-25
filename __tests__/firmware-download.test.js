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
            <button class="btn-next" disabled>Next</button>
            <input type="radio" name="mounting" value="wall">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-2" class="wizard-step">
            <button class="btn-next" disabled>Next</button>
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
            <div class="primary-action-group"><p data-ready-helper></p></div>
            <div id="firmware-selector"><select id="firmware-version-select"></select></div>
            <div id="compatible-firmware"></div>
            <button id="download-btn" disabled></button>
            <button id="copy-firmware-url-btn" disabled></button>
        </div>
    `;
}

describe('firmware download interactions', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        renderWizardDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(minimalManifest)
        }));
        Object.defineProperty(global.navigator, 'clipboard', {
            value: {
                writeText: jest.fn(() => Promise.resolve())
            },
            configurable: true
        });
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

    test('single-part firmware triggers direct download', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();
        await __testHooks.refreshPreflightDiagnostics({ force: true });

        window.currentFirmware = {
            firmwareId: 'firmware-1',
            manifestIndex: 1,
            version: '1.0.0',
            channel: 'stable',
            config_string: 'TestConfig',
            parts: [
                {
                    path: '/firmware/Sense360-TestConfig-v1.0.0-stable.bin',
                    offset: 0
                }
            ]
        };
        window.currentConfigString = 'TestConfig';
        __testHooks.setFirmwareVerificationState({
            status: 'verified',
            message: 'Test verification complete',
            parts: []
        });

        const appendSpy = jest.spyOn(document.body, 'appendChild');
        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        window.downloadFirmware();

        expect(clickSpy).toHaveBeenCalledTimes(1);
        const appendedAnchor = appendSpy.mock.calls.pop()?.[0];
        expect(appendedAnchor).toBeInstanceOf(HTMLAnchorElement);
        expect(appendedAnchor.href).toContain('/firmware/Sense360-TestConfig-v1.0.0-stable.bin');
        expect(appendedAnchor.download).toBe('Sense360-TestConfig-v1.0.0-stable.bin');

        clickSpy.mockRestore();
        appendSpy.mockRestore();
    });

    test('multi-part firmware opens modal with all parts', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();
        await __testHooks.refreshPreflightDiagnostics({ force: true });

        window.currentFirmware = {
            firmwareId: 'firmware-2',
            manifestIndex: 2,
            version: '2.0.0',
            channel: 'stable',
            config_string: 'Wall-USB',
            parts: [
                { path: '/firmware/bootloader.bin', offset: 0 },
                { path: '/firmware/application.bin', offset: 65536 }
            ]
        };
        window.currentConfigString = 'Wall-USB';
        __testHooks.setFirmwareVerificationState({
            status: 'verified',
            message: 'Test verification complete',
            parts: []
        });

        const appendSpy = jest.spyOn(document.body, 'appendChild');
        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        window.downloadFirmware();

        expect(clickSpy).toHaveBeenCalledTimes(2);
        const anchors = appendSpy.mock.calls
            .map(call => call[0])
            .filter(node => node instanceof HTMLAnchorElement);
        expect(anchors).toHaveLength(2);
        expect(anchors[0].href).toContain('/firmware/bootloader.bin');
        expect(anchors[1].href).toContain('/firmware/application.bin');

        clickSpy.mockRestore();
        appendSpy.mockRestore();
        expect(document.getElementById('multi-part-download-modal')).toBeNull();
    });

    test('copyFirmwareUrl copies all part URLs for multi-part builds', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();
        await __testHooks.refreshPreflightDiagnostics({ force: true });

        const firmware = {
            firmwareId: 'firmware-3',
            manifestIndex: 3,
            version: '3.0.0',
            channel: 'stable',
            config_string: 'Wall-USB',
            parts: [
                { path: '/firmware/boot.bin', offset: 0 },
                { path: '/firmware/app.bin', offset: 65536 }
            ]
        };

        window.currentFirmware = firmware;
        window.currentConfigString = 'Wall-USB';
        __testHooks.setFirmwareVerificationState({
            status: 'verified',
            message: 'Test verification complete',
            parts: []
        });

        await window.copyFirmwareUrl();

        expect(global.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
        const copiedText = global.navigator.clipboard.writeText.mock.calls[0][0];
        expect(copiedText).toContain('boot.bin @ 0x000000 ->');
        expect(copiedText).toContain('app.bin @ 0x010000 ->');

        expect(document.getElementById('multi-part-download-modal')).toBeNull();
    });

    test('renderSelectedFirmware lists firmware parts with offsets', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();
        await __testHooks.refreshPreflightDiagnostics({ force: true });

        const firmware = {
            firmwareId: 'firmware-4',
            manifestIndex: 4,
            version: '4.0.0',
            channel: 'stable',
            config_string: 'Wall-USB',
            parts: [
                { path: '/firmware/bootloader.bin', offset: 0 },
                { path: '/firmware/application.bin', offset: 65536 }
            ]
        };

        window.currentFirmware = firmware;
        window.currentConfigString = 'Wall-USB';
        __testHooks.setFirmwareVerificationState({
            status: 'verified',
            message: 'Test verification complete',
            parts: []
        });

        __testHooks.renderSelectedFirmware();

        const names = Array.from(document.querySelectorAll('.firmware-part-name')).map(node => node.textContent.trim());
        const offsets = Array.from(document.querySelectorAll('.firmware-part-offset')).map(node => node.textContent.trim());

        expect(names).toEqual(['bootloader.bin', 'application.bin']);
        expect(offsets).toEqual(['Offset 0x000000', 'Offset 0x010000']);
    });
});
