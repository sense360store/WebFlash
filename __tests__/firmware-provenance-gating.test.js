import { jest } from '@jest/globals';

function renderDom() {
    document.body.innerHTML = `
    <div id="browser-warning"></div>
    <div class="progress-step" data-step="1"></div>
    <div class="progress-step" data-step="2"></div>
    <div class="progress-step" data-step="3"></div>
    <div class="progress-step" data-step="4"></div>
    <div class="progress-step" data-step="5"></div>
    <div id="step-1" class="wizard-step"><button class="btn-next" data-next>Next</button></div>
    <div id="step-2" class="wizard-step"><button class="btn-next" data-next>Next</button><input type="radio" name="mounting" value="ceiling" checked></div>
    <div id="step-3" class="wizard-step"><button class="btn-next" data-next>Next</button><input type="radio" name="power" value="usb" checked></div>
    <div id="step-4" class="wizard-step"></div>
    <div id="step-5" class="wizard-step">
      <div class="primary-action-group"><p data-ready-helper></p></div>
      <div class="firmware-selector" id="firmware-selector"><select id="firmware-version-select"></select></div>
      <div id="compatible-firmware"><p data-ready-helper></p></div>
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

const VALID_STABLE_FIRMWARE = Object.freeze({
    firmwareId: 'firmware-test-stable',
    manifestIndex: 0,
    channel: 'stable',
    version: '2.0.0',
    chipFamily: 'ESP32-S3',
    config_string: 'Ceiling-USB',
    sha256: 'c9674b9df0ab00e3357c5dc526566ac440b32537aaf808a1e12b2f9db9b90397',
    md5: '1eb1fea3994bbbeea11080159dbbe611',
    signature: 'KQvII0GBl7I+lDSWVrq4q+q80Hsy+uZ8vBPL+hhNlyQ=',
    source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    file_size: 524288,
    changelog: ['Stable build of Sense360 Ceiling-USB v2.0.0.'],
    parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v2.0.0-stable.bin', offset: 0 }],
    deprecated: false
});

describe('firmware provenance gating in state.js', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ builds: [] })
        }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });
        Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
        delete window.currentFirmware;
        delete window.latestFirmwareProvenance;
    });

    test('selecting a stable build with missing signature blocks before any download', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const broken = { ...VALID_STABLE_FIRMWARE, signature: '' };
        window.currentFirmware = broken;

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('firmware/configurations/'),
            expect.anything()
        );
        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.missingRequired).toContain('signature');
    });

    test('selecting a stable build with missing source_commit reports a blocking install reason', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const broken = { ...VALID_STABLE_FIRMWARE, source_commit: null };
        window.currentFirmware = broken;

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.blockingReasons.join(' ')).toMatch(
            /source commit identifier/i
        );
    });

    test('valid stable firmware progresses past the static provenance gate', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(window.latestFirmwareProvenance.ok).toBe(true);
        expect(window.latestFirmwareProvenance.status).toBe('pass');
    });

    test('renderFirmwareProvenanceSection surfaces source commit and verified checks', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.renderFirmwareProvenanceSection({ ...VALID_STABLE_FIRMWARE });

        expect(html).toContain('Source commit');
        expect(html).toContain('eec461a4f6d8');
        expect(html).toContain('Provenance verified');
        // Each required field should produce a passing check.
        expect(html.match(/status-pass/g).length).toBeGreaterThanOrEqual(5);
    });

    test('renderFirmwareProvenanceSection marks deprecated firmware in the panel', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const deprecated = {
            ...VALID_STABLE_FIRMWARE,
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.'
        };
        const html = __testHooks.renderFirmwareProvenanceSection(deprecated);

        expect(html).toContain('Deprecated');
        expect(html).toMatch(/data-firmware-provenance="warn"/);
    });

    test('suspicious file_size between placeholder and threshold blocks install', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE, file_size: 8192 };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.sizeClassification).toBe('suspicious');
        expect(window.latestFirmwareProvenance.blockingReasons.join(' ')).toMatch(
            /below the plausible-firmware threshold/i
        );
    });
});
