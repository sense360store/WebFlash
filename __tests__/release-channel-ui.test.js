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
      <section data-channel-acknowledgement-panel hidden aria-hidden="true"></section>
      <button data-module-summary-install></button>
      <button id="download-btn"></button>
      <button id="copy-firmware-url-btn"></button>
      <label class="pre-flash-checklist__acknowledgement"><input type="checkbox" data-preflash-acknowledge></label>
      <ul data-preflight-list>
        <li data-preflight-item="browser-support" data-status="pending"><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
        <li data-preflight-item="device-visibility" data-status="pending"><span data-preflight-status="device-visibility"></span><span data-preflight-detail="device-visibility"></span></li>
        <li data-preflight-item="connection-quality" data-status="pending"><span data-preflight-status="connection-quality"></span><span data-preflight-detail="connection-quality"></span></li>
        <li data-preflight-item="firmware-verification" data-status="pending"><span data-preflight-status="firmware-verification"></span><span data-preflight-detail="firmware-verification"></span></li>
        <li data-preflight-item="user-acknowledgement" data-status="pending"><span data-preflight-status="user-acknowledgement"></span><span data-preflight-detail="user-acknowledgement"></span></li>
      </ul>
    </div>`;
}

const VALID_PROVENANCE = {
    sha256: 'c9674b9df0ab00e3357c5dc526566ac440b32537aaf808a1e12b2f9db9b90397',
    md5: '1eb1fea3994bbbeea11080159dbbe611',
    signature: 'KQvII0GBl7I+lDSWVrq4q+q80Hsy+uZ8vBPL+hhNlyQ=',
    source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    file_size: 524288,
    parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v2.0.0-stable.bin', offset: 0 }]
};

function makeBuild(overrides = {}) {
    const build = {
        ...VALID_PROVENANCE,
        firmwareId: overrides.firmwareId || `firmware-${overrides.channel || 'stable'}-${overrides.version || '2.0.0'}`,
        manifestIndex: overrides.manifestIndex ?? 0,
        chipFamily: 'ESP32-S3',
        config_string: 'Ceiling-USB',
        version: '2.0.0',
        channel: 'stable',
        deprecated: false,
        changelog: [`Hand-authored release notes for ${overrides.channel || 'stable'} ${overrides.version || '2.0.0'}.`],
        ...overrides,
        // Always preserve a unique parts entry so verification doesn't dedupe.
        parts: overrides.parts || [{ path: `firmware/configurations/Sense360-Ceiling-USB-v${overrides.version || '2.0.0'}-${overrides.channel || 'stable'}.bin`, offset: 0 }]
    };
    return build;
}

describe('release-channel UI wiring in state.js', () => {
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
        delete window.currentConfigString;
    });

    test('renderFirmwareDetailsPanel surfaces version, channel, source commit, build date and recommended status', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable-2.0.0',
            channel: 'stable',
            version: '2.0.0',
            build_date: '2026-04-30T15:12:58.139560+00:00',
            known_issues: ['Improv times out on slow hubs']
        });

        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(html).toContain('Firmware details');
        expect(html).toContain('v2.0.0');
        expect(html).toContain('Stable');
        expect(html).toContain('Yes — default for this configuration');
        expect(html).toContain('Active');
        expect(html).toContain('Source commit');
        expect(html).toContain('eec461a4f6d8');
        expect(html).toMatch(/Build date/);
        expect(html).toContain('Improv times out on slow hubs');
        expect(html).toContain('Hand-authored release notes');
    });

    test('renderFirmwareDetailsPanel marks deprecated firmware with reason', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable-1.0.0',
            channel: 'stable',
            version: '1.0.0',
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.'
        });

        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: false });
        expect(html).toContain('Deprecated');
        expect(html).toContain('Superseded by v2.0.0.');
        expect(html).not.toContain('Yes — default for this configuration');
    });

    test('selecting builds defaults to the stable, non-deprecated build', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const builds = [
            makeBuild({ firmwareId: 'firmware-beta-2.1.0', channel: 'beta', version: '2.1.0', manifestIndex: 0 }),
            makeBuild({ firmwareId: 'firmware-stable-old', channel: 'stable', version: '1.0.0', deprecated: true, deprecation_reason: 'Old.', manifestIndex: 1 }),
            makeBuild({ firmwareId: 'firmware-stable-current', channel: 'stable', version: '2.0.0', manifestIndex: 2 })
        ];
        __testHooks.setFirmwareOptions(builds, 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        expect(window.currentFirmware?.firmwareId).toBe('firmware-stable-current');
        expect(__testHooks.isFirmwareRecommendedDefault(window.currentFirmware)).toBe(true);
    });

    test('beta firmware renders a beta channel warning and a beta badge', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const card = document.querySelector('#compatible-firmware [data-firmware-detail]');
        expect(card).not.toBeNull();
        expect(card.dataset.channel).toBe('beta');
        expect(card.querySelector('[data-firmware-badge="beta"]')).not.toBeNull();
        const warning = card.querySelector('[data-firmware-channel-warning] [data-warning-key="channel:beta"]');
        expect(warning).not.toBeNull();
        expect(warning.textContent).toMatch(/beta/i);
    });

    test('preview firmware renders a stronger preview warning', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-preview',
            channel: 'preview',
            version: '3.0.0-rc.1'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const card = document.querySelector('#compatible-firmware [data-firmware-detail]');
        expect(card.dataset.channel).toBe('preview');
        const warning = card.querySelector('[data-warning-key="channel:preview"]');
        expect(warning).not.toBeNull();
        expect(warning.textContent).toMatch(/experimental/i);
    });

    test('deprecated firmware shows both a deprecation warning and a deprecated badge', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable-old',
            channel: 'stable',
            version: '1.0.0',
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const card = document.querySelector('#compatible-firmware [data-firmware-detail]');
        expect(card.dataset.deprecated).toBe('true');
        expect(card.querySelector('[data-firmware-badge="deprecated"]')).not.toBeNull();
        const warning = card.querySelector('[data-warning-key="deprecated"]');
        expect(warning).not.toBeNull();
        expect(warning.textContent).toMatch(/Superseded by v2\.0\.0/);
    });

    test('beta firmware mounts a channel-acknowledgement panel that gates install', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const panel = document.querySelector('[data-channel-acknowledgement-panel]');
        expect(panel.hidden).toBe(false);
        const checkbox = panel.querySelector('[data-channel-acknowledgement-input][data-acknowledgement-key="channel:beta"]');
        expect(checkbox).not.toBeNull();
        expect(checkbox.checked).toBe(false);

        // Outstanding acknowledgement keeps install gated.
        expect(__testHooks.getOutstandingChannelAcknowledgements(build).length).toBeGreaterThan(0);

        // Tick the acknowledgement → install gate is satisfied for this firmware.
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        expect(__testHooks.getOutstandingChannelAcknowledgements(build).length).toBe(0);
    });

    test('preview firmware also mounts an acknowledgement gate', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-preview',
            channel: 'preview',
            version: '3.0.0-rc.1'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const panel = document.querySelector('[data-channel-acknowledgement-panel]');
        expect(panel.hidden).toBe(false);
        expect(panel.querySelector('[data-acknowledgement-key="channel:preview"]')).not.toBeNull();
    });

    test('deprecated firmware mounts a deprecated acknowledgement', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable-old',
            channel: 'stable',
            version: '1.0.0',
            deprecated: true,
            deprecation_reason: 'Superseded.'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const panel = document.querySelector('[data-channel-acknowledgement-panel]');
        expect(panel.hidden).toBe(false);
        expect(panel.querySelector('[data-acknowledgement-key="deprecated"]')).not.toBeNull();
    });

    test('stable, non-deprecated firmware does not mount the acknowledgement panel', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const panel = document.querySelector('[data-channel-acknowledgement-panel]');
        expect(panel.hidden).toBe(true);
        expect(panel.querySelector('[data-channel-acknowledgement-input]')).toBeNull();
    });

    test('rescue and development builds do NOT appear in the dropdown when mode=normal', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('normal');

        const builds = [
            makeBuild({ firmwareId: 'firmware-stable', channel: 'stable', version: '2.0.0', manifestIndex: 0 }),
            makeBuild({ firmwareId: 'firmware-rescue', channel: 'rescue', version: '1.0.0', manifestIndex: 1 }),
            makeBuild({ firmwareId: 'firmware-dev', channel: 'dev', version: '99.0.0', manifestIndex: 2 })
        ];

        // Normal-mode filtering happens in findCompatibleFirmware before
        // setFirmwareOptions; replicate that behaviour here.
        const { filterBuildsForMode } = await import('../scripts/utils/release-channels.js');
        const visible = filterBuildsForMode(builds, 'normal');
        __testHooks.setFirmwareOptions(visible, 'Ceiling-USB');

        const select = document.getElementById('firmware-version-select');
        const optionValues = Array.from(select.options).map(option => option.value);
        expect(optionValues).toContain('firmware-stable');
        expect(optionValues).not.toContain('firmware-rescue');
        expect(optionValues).not.toContain('firmware-dev');
    });

    test('recovery mode reveals rescue firmware but still hides development', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('recovery');
        expect(__testHooks.getReleaseMode()).toBe('recovery');

        const builds = [
            makeBuild({ firmwareId: 'firmware-stable', channel: 'stable', version: '2.0.0', manifestIndex: 0 }),
            makeBuild({ firmwareId: 'firmware-rescue', channel: 'rescue', version: '1.0.0', manifestIndex: 1 }),
            makeBuild({ firmwareId: 'firmware-dev', channel: 'dev', version: '99.0.0', manifestIndex: 2 })
        ];
        const { filterBuildsForMode } = await import('../scripts/utils/release-channels.js');
        const visible = filterBuildsForMode(builds, 'recovery');
        __testHooks.setFirmwareOptions(visible, 'Ceiling-USB');

        const optionValues = Array.from(document.getElementById('firmware-version-select').options)
            .map(option => option.value);
        expect(optionValues).toContain('firmware-rescue');
        expect(optionValues).not.toContain('firmware-dev');
    });

    test('development mode reveals dev builds but still hides rescue', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('development');
        expect(__testHooks.getReleaseMode()).toBe('development');

        const builds = [
            makeBuild({ firmwareId: 'firmware-stable', channel: 'stable', version: '2.0.0', manifestIndex: 0 }),
            makeBuild({ firmwareId: 'firmware-rescue', channel: 'rescue', version: '1.0.0', manifestIndex: 1 }),
            makeBuild({ firmwareId: 'firmware-dev', channel: 'dev', version: '99.0.0', manifestIndex: 2 })
        ];
        const { filterBuildsForMode } = await import('../scripts/utils/release-channels.js');
        const visible = filterBuildsForMode(builds, 'development');
        __testHooks.setFirmwareOptions(visible, 'Ceiling-USB');

        const optionValues = Array.from(document.getElementById('firmware-version-select').options)
            .map(option => option.value);
        expect(optionValues).toContain('firmware-dev');
        expect(optionValues).not.toContain('firmware-rescue');
    });

    test('firmware-version select option text labels each option with channel and recommends the default', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const builds = [
            makeBuild({ firmwareId: 'firmware-stable', channel: 'stable', version: '2.0.0', manifestIndex: 0 }),
            makeBuild({ firmwareId: 'firmware-beta', channel: 'beta', version: '2.1.0', manifestIndex: 1 })
        ];
        __testHooks.setFirmwareOptions(builds, 'Ceiling-USB');

        const select = document.getElementById('firmware-version-select');
        const stableOption = Array.from(select.options).find(option => option.value === 'firmware-stable');
        const betaOption = Array.from(select.options).find(option => option.value === 'firmware-beta');

        expect(stableOption.textContent).toMatch(/Stable/);
        expect(stableOption.textContent).toMatch(/Recommended/);
        expect(stableOption.dataset.channel).toBe('stable');
        expect(stableOption.dataset.recommended).toBe('true');

        expect(betaOption.textContent).toMatch(/Beta/);
        expect(betaOption.textContent).not.toMatch(/Recommended/);
        expect(betaOption.dataset.channel).toBe('beta');
        expect(betaOption.dataset.recommended).toBeUndefined();
    });

    test('changelog and known_issues from manifest survive into the firmware card', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            changelog: ['Adds preflight checks for Improv timeouts.', 'Improves verification messages.'],
            known_issues: ['Bluetooth pairing pending firmware update.'],
            features: ['Improv Wi-Fi onboarding']
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const card = document.querySelector('#compatible-firmware [data-firmware-detail]');
        expect(card.textContent).toContain('Adds preflight checks for Improv timeouts.');
        expect(card.textContent).toContain('Bluetooth pairing pending firmware update.');
        expect(card.textContent).toContain('Improv Wi-Fi onboarding');
    });

    test('default selection skips a stable build with failed provenance and falls through', async () => {
        // Two stable builds: one with a mutable source_url (provenance-fails
        // in production mode), one valid. Expect the valid one to be picked
        // even though the failing build sorts first by manifestIndex.
        const { __testHooks } = await import('../scripts/state.js');
        const builds = [
            makeBuild({
                firmwareId: 'firmware-stable-broken',
                channel: 'stable',
                version: '2.1.0',
                manifestIndex: 0,
                source_url: 'https://github.com/sense360store/WebFlash/tree/main/firmware'
            }),
            makeBuild({
                firmwareId: 'firmware-stable-good',
                channel: 'stable',
                version: '2.0.0',
                manifestIndex: 1
            })
        ];
        __testHooks.setFirmwareOptions(builds, 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        expect(window.currentFirmware?.firmwareId).toBe('firmware-stable-good');
        expect(__testHooks.isFirmwareRecommendedDefault(window.currentFirmware)).toBe(true);
    });

    test('rc/candidate build on the beta channel still requires an acknowledgement', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-rc',
            channel: 'rc',
            version: '3.0.0-rc.1'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const panel = document.querySelector('[data-channel-acknowledgement-panel]');
        expect(panel.hidden).toBe(false);
        // 'rc' is a beta alias — gate is keyed by the canonical channel.
        expect(panel.querySelector('[data-acknowledgement-key="channel:beta"]')).not.toBeNull();
        expect(__testHooks.getOutstandingChannelAcknowledgements(build).length).toBe(1);
    });

    test('unknown channel mounts an unknown-channel acknowledgement panel', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-mystery',
            channel: 'wibble',
            version: '4.0.0'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();

        const panel = document.querySelector('[data-channel-acknowledgement-panel]');
        expect(panel.hidden).toBe(false);
        expect(panel.querySelector('[data-acknowledgement-key="channel:unknown"]')).not.toBeNull();
        const card = document.querySelector('#compatible-firmware [data-firmware-detail]');
        expect(card.dataset.channel).toBe('unknown');
        // Unknown channel must NOT be auto-selected as recommended even when
        // it is the only build available.
        expect(__testHooks.isFirmwareRecommendedDefault(window.currentFirmware)).toBe(false);
    });

    test('switching firmware (beta → deprecated) clears stale acknowledgements', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const beta = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0',
            manifestIndex: 0
        });
        const deprecated = makeBuild({
            firmwareId: 'firmware-stable-old',
            channel: 'stable',
            version: '1.0.0',
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.',
            manifestIndex: 1
        });
        __testHooks.setFirmwareOptions([beta, deprecated], 'Ceiling-USB');
        // Force-select beta first and acknowledge it.
        const select = document.getElementById('firmware-version-select');
        select.value = 'firmware-beta';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        __testHooks.setChannelAcknowledgement('channel:beta', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(beta).length).toBe(0);

        // Switching to the deprecated build must reset acknowledgements; the
        // beta ack must NOT silently satisfy the deprecated gate.
        select.value = 'firmware-stable-old';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(deprecated);
        expect(outstanding.map(item => item.key)).toContain('deprecated');
    });

    test('changing release mode resets acknowledgements', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('normal');

        const beta = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0'
        });
        __testHooks.setFirmwareOptions([beta], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();
        __testHooks.setChannelAcknowledgement('channel:beta', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(beta).length).toBe(0);

        __testHooks.setReleaseModeForTests('development');
        // Mode flip clears the acknowledgement Map so a freshly-revealed dev
        // build cannot silently inherit consent given for a beta firmware.
        expect(__testHooks.getOutstandingChannelAcknowledgements(beta).length).toBeGreaterThan(0);
    });

    test('renderFirmwareDetailsPanel surfaces artifact_type when present', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            artifact_type: 'application'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: false });
        expect(html).toContain('Artifact type');
        expect(html).toContain('application');
    });

    test('renderFirmwareDetailsPanel does not assert cryptographic verification language', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        // Forbidden trust language; the panel describes facts, not claims.
        const forbidden = [
            /signature verified/i,
            /cryptographically verified/i,
            /trusted firmware/i,
            /authenticity verified/i,
            /signed firmware verified/i
        ];
        for (const pattern of forbidden) {
            expect(html).not.toMatch(pattern);
        }
    });

    test('signature_verified provenance check renders with status="skip", never as a passing claim', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareProvenanceSection(build);
        expect(html).toMatch(/data-check-id="signature_verified"[^>]*data-check-status="skip"/);
        expect(html).not.toMatch(/data-check-id="signature_verified"[^>]*data-check-status="pass"/);
    });
});
