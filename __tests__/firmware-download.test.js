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
            <label><input type="checkbox" data-remember-toggle></label>
        </div>
        <div id="step-4" class="wizard-step">
            <section class="pre-flash-checklist" data-complete="false">
                <div data-checklist-item data-complete="false"></div>
            </section>
            <div id="config-summary"></div>
            <div class="primary-action-group"><p data-ready-helper></p></div>
            <div id="firmware-selector"><select id="firmware-version-select"></select></div>
            <div id="compatible-firmware"></div>
            <button id="download-btn" disabled></button>
            <button id="copy-firmware-url-btn" disabled></button>
            <label><input type="checkbox" data-remember-toggle></label>
        </div>
        <div id="multi-part-download-modal" class="multi-part-modal-backdrop" hidden>
            <div class="multi-part-modal" role="dialog" aria-modal="true" aria-labelledby="multi-part-modal-title">
                <header class="multi-part-modal__header">
                    <h2 id="multi-part-modal-title">Multiple firmware files required</h2>
                    <button type="button" class="multi-part-modal__close" data-multi-part-close>&times;</button>
                </header>
                <div class="multi-part-modal__body">
                    <p class="multi-part-modal__intro"></p>
                    <ul class="multi-part-modal__list" data-multi-part-list></ul>
                </div>
                <footer class="multi-part-modal__footer">
                    <button type="button" data-multi-part-close></button>
                    <button type="button" data-multi-part-copy></button>
                </footer>
            </div>
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
    });

    test('single-part firmware triggers direct download', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();

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

        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        window.downloadFirmware();

        expect(clickSpy).not.toHaveBeenCalled();

        const modal = document.getElementById('multi-part-download-modal');
        expect(modal.hidden).toBe(false);
        const items = modal.querySelectorAll('.multi-part-modal__item');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain('bootloader.bin');
        expect(items[0].textContent).toContain('Offset 0x000000');
    });

    test('copyFirmwareUrl copies all part URLs for multi-part builds', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();

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

        const modal = document.getElementById('multi-part-download-modal');
        expect(modal.hidden).toBe(false);
    });

    test('renderSelectedFirmware lists firmware parts with offsets', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await __testHooks.loadManifestData();

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
