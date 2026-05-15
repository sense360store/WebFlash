import { jest } from '@jest/globals';

function renderMinimalDom() {
    document.body.innerHTML = `
        <div id="step-4" class="wizard-step"></div>
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

async function loadStateModule() {
    jest.resetModules();
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ builds: [] })
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

describe('renderFirmwareNotAvailable — selected configuration and filename', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('rendered HTML includes the generated config string', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const configEl = container.querySelector('[data-firmware-not-available-config]');
        expect(configEl).toBeTruthy();
        expect(configEl.textContent).toBe('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ');
    });

    test('rendered HTML includes the expected firmware filename', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const filenameEl = container.querySelector('[data-firmware-not-available-filename]');
        expect(filenameEl).toBeTruthy();
        expect(filenameEl.textContent).toBe('Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin');
    });

    test('rendered HTML uses friendly customer-facing language', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const html = container.innerHTML;
        // WF-UX-002: the H4 now reuses the canonical no-build readiness
        // headline so Step 5's heading, Step 4's preview warning, and the
        // not-available card all speak the same language. The technical
        // "This exact combination has not been published yet." line stays
        // as the per-card explainer.
        expect(html).toContain('No published firmware for this exact selection');
        expect(html).toContain('This exact combination has not been published yet.');
        expect(html).not.toMatch(/No compatible manifest entry was found\./i);
        expect(html).not.toMatch(/config token mismatch/i);
    });
});

describe('renderFirmwareNotAvailable — selected hardware summary', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('hardware summary lists each selected module', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [
                { key: 'mounting', label: 'Mounting', value: 'Ceiling mount' },
                { key: 'power', label: 'Power', value: 'PoE module' },
                { key: 'ventiq', label: 'VentIQ', value: 'Sense360 VentIQ' },
                { key: 'fan', label: 'Fan / Switching', value: 'Sense360 TRIAC' },
                { key: 'roomiq', label: 'RoomIQ', value: 'Sense360 RoomIQ' }
            ],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const hardwareNode = container.querySelector('[data-firmware-not-available-hardware]');
        expect(hardwareNode).toBeTruthy();
        const items = Array.from(hardwareNode.querySelectorAll('li')).map(li => li.textContent.trim());
        expect(items.some(text => text.includes('Ceiling mount'))).toBe(true);
        expect(items.some(text => text.includes('PoE module'))).toBe(true);
        expect(items.some(text => text.includes('Sense360 VentIQ'))).toBe(true);
        expect(items.some(text => text.includes('Sense360 TRIAC'))).toBe(true);
        expect(items.some(text => text.includes('Sense360 RoomIQ'))).toBe(true);
    });

    test('shows an empty-hardware fallback when nothing was selected beyond mounting/power', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE',
            expectedFilename: 'Sense360-Ceiling-POE-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        expect(container.innerHTML).toContain('No additional hardware selected');
    });
});

describe('renderFirmwareNotAvailable — nearby available builds', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('lists each nearby build when present', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [
                'Ceiling-POE-VentIQ-FanTRIAC',
                'Ceiling-POE-VentIQ-RoomIQ',
                'Ceiling-POE-VentIQ'
            ],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const nearbyEl = container.querySelector('[data-firmware-not-available-nearby]');
        expect(nearbyEl).toBeTruthy();
        const codeNodes = Array.from(nearbyEl.querySelectorAll('code')).map(node => node.textContent);
        expect(codeNodes).toContain('Ceiling-POE-VentIQ-FanTRIAC');
        expect(codeNodes).toContain('Ceiling-POE-VentIQ-RoomIQ');
        expect(codeNodes).toContain('Ceiling-POE-VentIQ');
    });

    test('omits the nearby section and shows a fallback when none exist', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        expect(container.querySelector('[data-firmware-not-available-nearby]')).toBeFalsy();
        expect(container.querySelector('[data-firmware-not-available-nearby-empty]')).toBeTruthy();
        expect(container.innerHTML).toContain('No nearby firmware builds');
    });

    test('uses the heading "Nearby available firmware" rather than "Recommended replacements"', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: ['Ceiling-POE-VentIQ-FanTRIAC'],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const headings = Array.from(container.querySelectorAll('h4, h5')).map(node => node.textContent.trim());
        expect(headings).toContain('Nearby available firmware');
        expect(headings).not.toEqual(expect.arrayContaining([expect.stringMatching(/Recommended replacement/i)]));
        // Disclaimer text should explicitly clarify these are not recommended replacements.
        expect(container.innerHTML).toMatch(/not recommended replacements/i);
    });
});

describe('renderFirmwareNotAvailable — mismatch highlights', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('RoomIQ shows up in the mismatch guidance when relevant', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: ['Ceiling-POE-VentIQ-FanTRIAC'],
            mismatchHighlights: [
                { key: 'presence', label: 'RoomIQ' }
            ],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const html = container.innerHTML;
        expect(html).toMatch(/RoomIQ/);
    });

    test('Fan variant shows up in the mismatch guidance when relevant', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: ['Ceiling-POE-VentIQ-RoomIQ'],
            mismatchHighlights: [
                { key: 'fan', label: 'Fan / Switching: TRIAC' }
            ],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const html = container.innerHTML;
        expect(html).toMatch(/TRIAC/);
        expect(html).toMatch(/Fan \/ Switching/);
    });
});

describe('renderFirmwareNotAvailable — next steps differ by mode', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('kit mode tells the user to check the selected kit/SKU', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: ['Ceiling-POE-VentIQ-FanTRIAC'],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'kit'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const nextStepsEl = container.querySelector('[data-firmware-not-available-next-steps]');
        expect(nextStepsEl).toBeTruthy();
        expect(nextStepsEl.textContent).toMatch(/kit or SKU/);
    });

    test('manual mode tells the user to confirm installed modules', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: ['Ceiling-POE-VentIQ-FanTRIAC'],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const nextStepsEl = container.querySelector('[data-firmware-not-available-next-steps]');
        expect(nextStepsEl).toBeTruthy();
        expect(nextStepsEl.textContent).toMatch(/confirm each installed module/);
    });

    test('nearby-builds-present message references adjusting selections vs contacting support', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: ['Ceiling-POE-VentIQ-FanTRIAC'],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const nextStepsEl = container.querySelector('[data-firmware-not-available-next-steps]');
        expect(nextStepsEl.textContent).toMatch(/go back and adjust your selections/);
    });

    test('no-nearby-builds message points to support', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const nextStepsEl = container.querySelector('[data-firmware-not-available-next-steps]');
        expect(nextStepsEl.textContent).toMatch(/Contact support|publish firmware/i);
    });
});

describe('renderFirmwareNotAvailable — copy support bundle action', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('renders a copy-support-bundle button hooked into the existing handler', async () => {
        const { __testHooks } = await loadStateModule();
        __testHooks.setFirmwareStatusMessage({
            type: 'not-available',
            configString: 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ',
            expectedFilename: 'Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin',
            nearbyConfigStrings: [],
            mismatchHighlights: [],
            selectedHardware: [],
            configurationMode: 'manual'
        });
        __testHooks.renderSelectedFirmware();
        const container = document.getElementById('compatible-firmware');
        const supportBtn = container.querySelector('[data-firmware-not-available-support]');
        expect(supportBtn).toBeTruthy();
        expect(supportBtn.hasAttribute('data-copy-support-bundle')).toBe(true);
    });
});

describe('buildNotAvailableStatusMessage — wiring', () => {
    beforeEach(() => {
        renderMinimalDom();
    });

    test('produces an expected_filename matching the canonical pattern', async () => {
        const { __testHooks } = await loadStateModule();
        const status = __testHooks.buildNotAvailableStatusMessage('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', []);
        expect(status.expectedFilename).toBe('Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin');
        expect(status.configString).toBe('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ');
        expect(Array.isArray(status.nearbyConfigStrings)).toBe(true);
        expect(Array.isArray(status.mismatchHighlights)).toBe(true);
        expect(Array.isArray(status.selectedHardware)).toBe(true);
    });

    test('selects only available builds for nearby suggestions', async () => {
        const { __testHooks } = await loadStateModule();
        const status = __testHooks.buildNotAvailableStatusMessage('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', [
            { config_string: 'Ceiling-POE-VentIQ-FanTRIAC' },
            { config_string: 'Ceiling-POE-VentIQ' },
            { config_string: 'Ceiling-USB' },
            { config_string: 'Wall-POE-VentIQ' }
        ]);
        expect(status.nearbyConfigStrings).toContain('Ceiling-POE-VentIQ-FanTRIAC');
        expect(status.nearbyConfigStrings).toContain('Ceiling-POE-VentIQ');
        expect(status.nearbyConfigStrings).not.toContain('Ceiling-USB');
        expect(status.nearbyConfigStrings).not.toContain('Wall-POE-VentIQ');
    });
});
