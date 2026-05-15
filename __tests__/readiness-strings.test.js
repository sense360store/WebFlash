/**
 * WF-UX-002 — Firmware readiness state model.
 *
 * Pins the canonical six-state readiness contract introduced in
 * scripts/state.js (`getFirmwareReadiness`) and the canonical user-facing
 * copy each state surfaces. Three different render sites (the Step 4
 * firmware-target preview, the Step 5 Compatible Firmware heading, and the
 * sidebar/mobile firmware mini-card) consume this struct, so changing the
 * copy here changes the wording everywhere.
 *
 * The helper is presentation-only. It does not mutate firmware selection,
 * channel acknowledgement, the install gate, or the release-channel
 * policy. The release-channel-ui.test.js WF-LED-003 describe block remains
 * the policy-level interlock for the LED preview exposure model; this
 * file pins the *headline*, not the gate.
 */
import { jest, describe, beforeEach, expect, test } from '@jest/globals';

const READINESS_COPY = Object.freeze({
    'no-selection': {
        headline: 'Choose your hardware to find firmware',
        body: 'Select mounting, power, and modules to see the matching firmware.'
    },
    'stable-ready': {
        headline: 'Firmware ready to install',
        body: 'This stable build matches your selected hardware.'
    },
    'preview-ready': {
        headline: 'Preview firmware available',
        body: 'This is an experimental preview build. Review the warning and acknowledge it before installing.'
    },
    'no-build': {
        headline: 'No published firmware for this exact selection',
        body: 'Adjust your hardware choices or pick a supported kit to find a matching build.'
    },
    'rescue-ready': {
        headline: 'Rescue firmware ready',
        body: 'Use this only for recovery or bootloader repair. It will overwrite your current configuration.'
    },
    'unsupported-browser': {
        headline: 'Browser not supported for flashing',
        body: 'Open this page in desktop Chrome, Edge, or Opera to install firmware over USB.'
    }
});

function renderMinimalDom() {
    document.body.innerHTML = `
        <div id="step-1" class="wizard-step">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-3" class="wizard-step">
            <input type="radio" name="power" value="poe">
        </div>
        <div id="step-4" class="wizard-step">
            <input type="radio" name="airiq" value="none" checked>
            <input type="radio" name="ventiq" value="none" checked>
            <input type="radio" name="roomiq" value="none" checked>
            <input type="radio" name="fan" value="none" checked>
            <input type="radio" name="led" value="none" checked>
            <section id="firmware-target-preview" data-firmware-target-preview>
                <code class="firmware-target-preview__value" data-firmware-target-preview-value></code>
                <p class="firmware-target-preview__warning" data-firmware-target-preview-warning hidden></p>
            </section>
        </div>
        <div id="step-5" class="wizard-step">
            <div id="firmware-selector"><select id="firmware-version-select"></select></div>
            <div class="firmware-section">
                <h3 class="compatible-firmware-heading">
                    <span data-compatible-firmware-label>Compatible Firmware</span>
                    <span data-compatible-firmware-selection></span>
                </h3>
            </div>
            <div id="compatible-firmware"></div>
        </div>
    `;
}

async function loadStateModule({ manifest = { builds: [] } } = {}) {
    jest.resetModules();
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(manifest)
    }));
    Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        configurable: true
    });
    Object.defineProperty(global.navigator, 'serial', {
        value: { getPorts: jest.fn(() => Promise.resolve([])) },
        configurable: true
    });
    return import('../scripts/state.js');
}

describe('WF-UX-002 — getFirmwareReadiness canonical copy', () => {
    beforeEach(() => {
        renderMinimalDom();
        delete window.currentFirmware;
    });

    test('helper is exported as a public API and via __testHooks', async () => {
        const stateModule = await loadStateModule();
        expect(typeof stateModule.getFirmwareReadiness).toBe('function');
        expect(typeof stateModule.__testHooks.getFirmwareReadiness).toBe('function');
        expect(stateModule.__testHooks.FIRMWARE_READINESS_COPY).toBeDefined();
    });

    test('every readiness tag has the approved canonical headline and body', async () => {
        const { __testHooks } = await loadStateModule();
        const copy = __testHooks.FIRMWARE_READINESS_COPY;
        Object.entries(READINESS_COPY).forEach(([kind, expected]) => {
            expect(copy[kind]).toBeDefined();
            expect(copy[kind].headline).toBe(expected.headline);
            expect(copy[kind].body).toBe(expected.body);
        });
    });

    test('no-selection: empty mounting/power yields the canonical no-selection copy', async () => {
        const stateModule = await loadStateModule();
        stateModule.replaceState({ mounting: null, power: null });
        const readiness = stateModule.getFirmwareReadiness();
        expect(readiness.kind).toBe('no-selection');
        expect(readiness.headline).toBe(READINESS_COPY['no-selection'].headline);
        expect(readiness.body).toBe(READINESS_COPY['no-selection'].body);
        expect(readiness.firmware).toBeNull();
    });

    test('stable-ready: a selected stable build yields stable-ready copy', async () => {
        const stateModule = await loadStateModule();
        stateModule.replaceState({ mounting: 'ceiling', power: 'poe' });
        const readiness = stateModule.getFirmwareReadiness({
            firmware: { channel: 'stable', config_string: 'Ceiling-POE-VentIQ-RoomIQ', version: '1.0.0' }
        });
        expect(readiness.kind).toBe('stable-ready');
        expect(readiness.headline).toBe(READINESS_COPY['stable-ready'].headline);
        expect(readiness.body).toBe(READINESS_COPY['stable-ready'].body);
        expect(readiness.tone).toBe('positive');
    });

    test('preview-ready: a selected preview build yields preview-ready copy', async () => {
        const stateModule = await loadStateModule();
        stateModule.replaceState({ mounting: 'ceiling', power: 'poe' });
        const readiness = stateModule.getFirmwareReadiness({
            firmware: {
                channel: 'preview',
                config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED',
                version: '1.0.0'
            }
        });
        expect(readiness.kind).toBe('preview-ready');
        expect(readiness.headline).toBe(READINESS_COPY['preview-ready'].headline);
        expect(readiness.body).toBe(READINESS_COPY['preview-ready'].body);
        expect(readiness.tone).toBe('warning');
    });

    test('preview-ready does not bypass the preview-channel acknowledgement', async () => {
        // The readiness helper is presentation-only. The preview-channel
        // acknowledgement must still be required at the policy layer; this
        // assertion pairs with the WF-LED-003 describe block in
        // release-channel-ui.test.js so a future regression that wires the
        // readiness helper into the install gate also breaks this test.
        const { getRequiredAcknowledgements } = await import('../scripts/utils/release-channels.js');
        const ledPreview = {
            channel: 'preview',
            config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED',
            version: '1.0.0',
            firmwareId: 'firmware-led-preview',
            parts: [{
                path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin',
                offset: 0
            }]
        };
        const acks = getRequiredAcknowledgements(ledPreview);
        expect(acks).toHaveLength(1);
        expect(acks[0].key).toBe('channel:preview');
    });

    test('no-build: assembled config has no manifest match and a not-available status is set', async () => {
        const { __testHooks, getFirmwareReadiness, replaceState } = await loadStateModule({
            manifest: { builds: [{ config_string: 'Ceiling-POE-VentIQ-RoomIQ' }] }
        });
        await __testHooks.manifestReadyPromise();
        replaceState({ mounting: 'ceiling', power: 'poe', airiq: 'airiq' });
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-AirIQ',
            expectedFilename: 'Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        const readiness = getFirmwareReadiness();
        expect(readiness.kind).toBe('no-build');
        expect(readiness.headline).toBe(READINESS_COPY['no-build'].headline);
        expect(readiness.body).toBe(READINESS_COPY['no-build'].body);
    });

    test('no-build also fires when the assembled config is simply absent from the manifest', async () => {
        const { __testHooks, getFirmwareReadiness, replaceState } = await loadStateModule({
            manifest: { builds: [{ config_string: 'Ceiling-POE-VentIQ-RoomIQ' }] }
        });
        await __testHooks.manifestReadyPromise();
        replaceState({ mounting: 'ceiling', power: 'poe', airiq: 'airiq' });
        const readiness = getFirmwareReadiness();
        expect(readiness.kind).toBe('no-build');
    });

    test('rescue-ready: a selected rescue build yields rescue-ready copy', async () => {
        const stateModule = await loadStateModule();
        stateModule.replaceState({ mounting: 'ceiling', power: 'poe' });
        const readiness = stateModule.getFirmwareReadiness({
            firmware: { channel: 'rescue', config_string: 'Rescue', version: '1.0.0' }
        });
        expect(readiness.kind).toBe('rescue-ready');
        expect(readiness.headline).toBe(READINESS_COPY['rescue-ready'].headline);
        expect(readiness.body).toBe(READINESS_COPY['rescue-ready'].body);
        expect(readiness.tone).toBe('danger');
    });

    test('unsupported-browser: webSerial:false dominates over selection', async () => {
        const stateModule = await loadStateModule();
        stateModule.replaceState({ mounting: 'ceiling', power: 'poe' });
        // Even with a stable build "selected", an unsupported browser must
        // surface the unsupported-browser copy first — install will fail
        // anyway and the user needs to know to switch browsers, not to
        // think they're ready to flash.
        const readiness = stateModule.getFirmwareReadiness({
            capabilities: { webSerial: false },
            firmware: { channel: 'stable', config_string: 'Ceiling-POE-VentIQ-RoomIQ', version: '1.0.0' }
        });
        expect(readiness.kind).toBe('unsupported-browser');
        expect(readiness.headline).toBe(READINESS_COPY['unsupported-browser'].headline);
        expect(readiness.body).toBe(READINESS_COPY['unsupported-browser'].body);
    });

    test('helper is presentation-only: never mutates firmware selection or status', async () => {
        const { getFirmwareReadiness, __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-AirIQ',
            expectedFilename: 'Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        const before = __testHooks.getFirmwareStatusMessage();
        getFirmwareReadiness();
        getFirmwareReadiness();
        getFirmwareReadiness();
        expect(__testHooks.getFirmwareStatusMessage()).toEqual(before);
    });
});

describe('WF-UX-002 — Step 4 firmware-target preview pulls warning text from the helper', () => {
    beforeEach(() => {
        renderMinimalDom();
        delete window.currentFirmware;
    });

    test('the unpublished warning matches the canonical no-build body', async () => {
        const { __testHooks, replaceState } = await loadStateModule({
            manifest: { builds: [{ config_string: 'Ceiling-POE-VentIQ-RoomIQ' }] }
        });
        await __testHooks.manifestReadyPromise();

        // Assemble a config string that is NOT in the manifest. The
        // updateFirmwareTargetPreview routine must surface the canonical
        // no-build body string, not the legacy "not published yet" copy.
        replaceState({ mounting: 'ceiling', power: 'poe', airiq: 'airiq' });
        __testHooks.updateFirmwareTargetPreview();

        const root = document.getElementById('firmware-target-preview');
        const warning = root.querySelector('[data-firmware-target-preview-warning]');
        expect(warning).not.toBeNull();
        expect(warning.hasAttribute('hidden')).toBe(false);
        expect(warning.textContent.trim()).toBe(READINESS_COPY['no-build'].body);
        // The data-attribute value is the public CSS hook; keep it stable.
        expect(root.dataset.firmwareTargetState).toBe('unpublished');
    });
});

describe('WF-UX-002 — Step 5 heading surfaces the no-build headline', () => {
    beforeEach(() => {
        renderMinimalDom();
        delete window.currentFirmware;
    });

    test('selection span shows the canonical no-build headline when status is not-available', async () => {
        const { __testHooks } = await loadStateModule();
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

        const selection = document.querySelector('[data-compatible-firmware-selection]');
        expect(selection).not.toBeNull();
        expect(selection.textContent.trim()).toBe(READINESS_COPY['no-build'].headline);
        expect(selection.getAttribute('data-readiness')).toBe('no-build');
    });

    test('selection span stays empty when nothing is selected and there is no error status', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage(null);
        __testHooks.renderSelectedFirmware();

        const selection = document.querySelector('[data-compatible-firmware-selection]');
        expect(selection.textContent.trim()).toBe('');
        expect(selection.hasAttribute('data-readiness')).toBe(false);
    });
});
