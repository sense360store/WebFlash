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
    // Real Ed25519 metadata is required for stable builds to pass the
    // static gate. The byte content here is not a real signature over
    // the test fixture; the static gate only verifies metadata presence
    // and (in production mode) refuses test_only key ids. We use a
    // synthetic key id that is not on the trust list so the static gate
    // accepts it.
    signature_ed25519: 'kgpXnONkJ8YZhazkL4U8NlOiFW1Xwbri37UI6jEOwfAOHzvR/YCxZ4m6NKJypOdvya8khHFjrw6rHSMaSu//Aw==',
    signature_key_id: 'unit-test-fixture-key',
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

    test('renderFirmwareDetailsPanel does not assert cryptographic verification before runtime check runs', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        // Forbidden pre-verification trust language; the panel must not
        // claim authenticity has passed before the runtime Ed25519
        // verification has actually run.
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

    test('signature_verified provenance check renders with status="pending" until runtime check runs', async () => {
        // Real Ed25519 verification cannot run inside the static
        // describeVerificationChecks() pass — it needs the binary bytes.
        // The static panel must therefore render the check as 'pending'
        // (not 'pass') so users do not mistake metadata-presence for
        // cryptographic authenticity.
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareProvenanceSection(build);
        expect(html).toMatch(/data-check-id="signature_verified"[^>]*data-check-status="pending"/);
        expect(html).not.toMatch(/data-check-id="signature_verified"[^>]*data-check-status="pass"/);
    });

    test('renderFirmwareDetailsPanel surfaces firmware target, configuration profile, chip family, and firmware path', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            chipFamily: 'ESP32-S3',
            config_string: 'Ceiling-USB',
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v2.0.0-stable.bin', offset: 0 }]
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(html).toContain('Firmware target');
        expect(html).toContain('Sense360-Ceiling-USB-v2.0.0-stable.bin');
        expect(html).toContain('Configuration profile');
        expect(html).toContain('Ceiling-USB');
        expect(html).toContain('Chip family');
        expect(html).toContain('ESP32-S3');
        expect(html).toContain('Firmware path');
        expect(html).toContain('firmware/configurations/Sense360-Ceiling-USB-v2.0.0-stable.bin');
    });

    test('renderFirmwareDetailsPanel surfaces SHA-256 metadata status with careful, fact-only language', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        // Truncated digest fingerprint is shown so the user can confirm identity.
        expect(html).toContain('c9674b9df0ab');
        expect(html).toContain('Metadata present in manifest');
        // The browser-side hashing behaviour is described as a fact, not a claim of authenticity.
        expect(html).toMatch(/Browser hashes the downloaded binary/i);
    });

    test('renderFirmwareDetailsPanel surfaces signature metadata as awaiting verification before runtime check runs', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            signed_by: 'Sense360 release pipeline'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(html).toContain('Signature metadata');
        expect(html).toContain('Signed by Sense360 release pipeline');
        // The browser DOES perform Ed25519 verification, but it cannot run
        // before the binary is downloaded. The pre-verification copy must
        // describe that future state honestly — never claim authenticity
        // has passed, and never resurrect the legacy "browser-side
        // signature checks are not performed" disclaimer.
        expect(html).toMatch(/authenticity will be verified before flashing/i);
        expect(html).not.toMatch(/Browser-side cryptographic signature checks are not performed/i);
        expect(html).not.toMatch(/authenticity verified/i);
    });

    test('renderFirmwareDetailsPanel never surfaces both legacy disclaimer and authenticity-pass copy together', async () => {
        // Belt-and-braces: even after we update individual rows we must
        // not ship a UI that contradicts itself. Asserting the absence of
        // the legacy "checks are not performed" copy on every render path
        // (pending, pass, fail) keeps the regression cost loud if a
        // future edit reintroduces it next to a real verification verdict.
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });

        // Pending render — verification has not run.
        const pendingHtml = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(pendingHtml).not.toMatch(/Browser-side cryptographic signature checks are not performed/i);

        // Simulate a successful verification by populating the merged
        // provenance state. The panel must NOT then carry both the legacy
        // disclaimer AND the "Cryptographic authenticity: pass" copy.
        const { applySignatureVerificationResult, validateFirmwareProvenance, TRUST_TIERS } =
            await import('../scripts/utils/firmware-provenance.js');
        const staticReport = validateFirmwareProvenance(build);
        const merged = applySignatureVerificationResult(staticReport, {
            ok: true,
            code: 'verified',
            keyId: 'sense360-prod-2026-02',
            keyStatus: 'active',
            message: 'Signature verified.'
        });
        __testHooks.setFirmwareVerificationState({
            status: 'verified',
            message: 'Firmware verified successfully.',
            firmwareId: build.firmwareId,
            parts: [],
            provenance: merged,
            authenticity: merged.tiers[TRUST_TIERS.AUTHENTICITY]
        });
        const passHtml = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(passHtml).not.toMatch(/Browser-side cryptographic signature checks are not performed/i);
        expect(passHtml).toMatch(/Firmware authenticity verified with pinned Sense360 production key/i);
    });

    test('renderFirmwareDetailsPanel surfaces a Verification checks tally from describeVerificationChecks', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(html).toContain('Verification checks');
        // Tally uses ' · ' separators with at least one passing check.
        expect(html).toMatch(/\d+ pass/);
        expect(html).toMatch(/firmware-details-panel__verification status-(pass|warn|fail)/);
    });

    test('renderFirmwareDetailsPanel renders a Recovery badge for rescue artifact_type even when channel is not rescue', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-rescue-fixture',
            channel: 'stable',
            version: '2.0.0',
            artifact_type: 'rescue'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: false });
        expect(html).toContain('data-firmware-panel-badge="rescue"');
        expect(html).toContain('Recovery');
    });

    test('renderFirmwareDetailsPanel recaps the channel and recommended badges inside the panel header', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        expect(html).toContain('data-firmware-panel-badge="stable"');
        expect(html).toContain('data-firmware-panel-badge="recommended"');
    });

    test('renderFirmwareDetailsPanel reports missing SHA-256 metadata explicitly', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            sha256: ''
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: false });
        expect(html).toContain('Metadata missing from manifest entry');
    });

    test('renderFirmwareDetailsPanel groups fact rows into Identity / Compatibility / Integrity / Verification sections', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            chipFamily: 'ESP32-S3',
            artifact_type: 'application'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });

        document.body.innerHTML = `<div id="probe">${html}</div>`;
        const groups = Array.from(document.querySelectorAll('[data-firmware-details-group]'));
        const groupKeys = groups.map(group => group.getAttribute('data-firmware-details-group'));
        expect(groupKeys).toEqual(['identity', 'compatibility', 'integrity', 'verification']);

        const identity = document.querySelector('[data-firmware-details-group="identity"]');
        const compatibility = document.querySelector('[data-firmware-details-group="compatibility"]');
        const integrity = document.querySelector('[data-firmware-details-group="integrity"]');
        const verification = document.querySelector('[data-firmware-details-group="verification"]');

        expect(identity.querySelector('.firmware-details-panel__group-title').textContent).toBe('Identity');
        expect(compatibility.querySelector('.firmware-details-panel__group-title').textContent).toBe('Compatibility');
        expect(integrity.querySelector('.firmware-details-panel__group-title').textContent).toBe('Integrity metadata');
        expect(verification.querySelector('.firmware-details-panel__group-title').textContent).toBe('Verification summary');

        expect(identity.textContent).toMatch(/Firmware target/);
        expect(identity.textContent).toMatch(/Firmware path/);
        expect(identity.textContent).toMatch(/Version/);
        expect(identity.textContent).toMatch(/Channel/);
        expect(compatibility.textContent).toMatch(/Configuration profile/);
        expect(compatibility.textContent).toMatch(/Chip family/);
        expect(compatibility.textContent).toMatch(/Artifact type/);
        expect(integrity.textContent).toMatch(/SHA-256/);
        expect(integrity.textContent).toMatch(/Signature metadata/);
        expect(verification.textContent).toMatch(/Verification checks/);
    });

    test('renderFirmwareDetailsPanel skips empty groups when their rows are absent', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // No chipFamily, no config_string, no artifact_type → Compatibility
        // group should not render at all rather than rendering an empty box.
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0',
            chipFamily: '',
            config_string: '',
            artifact_type: ''
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: false });
        document.body.innerHTML = `<div id="probe">${html}</div>`;
        expect(document.querySelector('[data-firmware-details-group="compatibility"]')).toBeNull();
        expect(document.querySelector('[data-firmware-details-group="identity"]')).not.toBeNull();
    });

    test('renderFirmwareDetailsPanel hides the technical fact rows behind a collapsed disclosure by default', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareDetailsPanel(build, { recommended: true });
        document.body.innerHTML = `<div id="probe">${html}</div>`;
        const disclosure = document.querySelector('[data-firmware-details-disclosure]');
        expect(disclosure).not.toBeNull();
        // Native <details> defaults to closed when the `open` attribute is absent.
        expect(disclosure.tagName.toLowerCase()).toBe('details');
        expect(disclosure.hasAttribute('open')).toBe(false);
        // The summary still surfaces the title + show-hint so the user knows
        // detailed metadata is one click away.
        const summary = disclosure.querySelector('summary');
        expect(summary).not.toBeNull();
        expect(summary.textContent).toMatch(/Firmware details/);
        expect(summary.textContent).toMatch(/Show technical metadata/);
        // The fact rows live inside the disclosure body so they render only on demand.
        const identity = document.querySelector('[data-firmware-details-group="identity"]');
        expect(identity.closest('[data-firmware-details-disclosure]')).toBe(disclosure);
    });

    test('renderFirmwareProvenanceSection keeps the verdict header visible and hides the per-check list behind a disclosure', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-stable',
            channel: 'stable',
            version: '2.0.0'
        });
        const html = __testHooks.renderFirmwareProvenanceSection(build);
        document.body.innerHTML = `<div id="probe">${html}</div>`;
        // Header (badge + summary) is rendered outside the disclosure so the
        // one-line verification status shows by default.
        const header = document.querySelector('.firmware-provenance__header');
        expect(header).not.toBeNull();
        expect(header.querySelector('.firmware-provenance__badge')).not.toBeNull();
        const disclosure = document.querySelector('[data-firmware-provenance-disclosure]');
        expect(disclosure).not.toBeNull();
        expect(disclosure.tagName.toLowerCase()).toBe('details');
        expect(disclosure.hasAttribute('open')).toBe(false);
        // Tier list, fact rows, and the per-check list all live inside the
        // collapsed disclosure body.
        const checks = document.querySelector('[data-firmware-provenance-checks]');
        expect(checks).not.toBeNull();
        expect(checks.closest('[data-firmware-provenance-disclosure]')).toBe(disclosure);
    });
});

describe('release-channel acknowledgement scoping (identity-bound consent)', () => {
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

    test('acknowledging beta v1 does not satisfy the gate for beta v2', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const v1 = makeBuild({
            firmwareId: 'firmware-beta-v1',
            channel: 'beta',
            version: '2.1.0',
            manifestIndex: 0,
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v2.1.0-beta.bin', offset: 0 }]
        });
        const v2 = makeBuild({
            firmwareId: 'firmware-beta-v2',
            channel: 'beta',
            version: '2.2.0',
            manifestIndex: 1,
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v2.2.0-beta.bin', offset: 0 }]
        });
        __testHooks.setFirmwareOptions([v1, v2], 'Ceiling-USB');

        const select = document.getElementById('firmware-version-select');
        select.value = 'firmware-beta-v1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        __testHooks.setChannelAcknowledgement('channel:beta', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(v1).length).toBe(0);

        // Switching to a different beta version must require a fresh ack —
        // the consent the user gave was for v1, not for "any beta build".
        select.value = 'firmware-beta-v2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(v2);
        expect(outstanding.map(item => item.key)).toContain('channel:beta');
    });

    test('acknowledging beta on hardware A does not satisfy the gate for the same beta on hardware B', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const usbBeta = makeBuild({
            firmwareId: 'firmware-beta-usb',
            channel: 'beta',
            version: '2.1.0',
            config_string: 'Ceiling-USB',
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v2.1.0-beta.bin', offset: 0 }]
        });
        __testHooks.setFirmwareOptions([usbBeta], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();
        __testHooks.setChannelAcknowledgement('channel:beta', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(usbBeta).length).toBe(0);

        // Re-render the firmware list under a different hardware profile
        // (e.g. user toggled USB → POE in step 4). The build is still "beta
        // v2.1.0" by name, but it is a different binary for different
        // hardware: the prior ack must not silently satisfy the gate.
        const poeBeta = makeBuild({
            firmwareId: 'firmware-beta-poe',
            channel: 'beta',
            version: '2.1.0',
            config_string: 'Ceiling-POE',
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-POE-v2.1.0-beta.bin', offset: 0 }]
        });
        __testHooks.setFirmwareOptions([poeBeta], 'Ceiling-POE');
        __testHooks.selectDefaultFirmware();
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(poeBeta);
        expect(outstanding.map(item => item.key)).toContain('channel:beta');
    });

    test('acknowledging a deprecated build does not satisfy the gate for a different deprecated build', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const oldA = makeBuild({
            firmwareId: 'firmware-stable-1.0.0',
            channel: 'stable',
            version: '1.0.0',
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.',
            manifestIndex: 0
        });
        const oldB = makeBuild({
            firmwareId: 'firmware-stable-1.1.0',
            channel: 'stable',
            version: '1.1.0',
            deprecated: true,
            deprecation_reason: 'Pulled due to provisioning bug.',
            manifestIndex: 1,
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v1.1.0-stable.bin', offset: 0 }]
        });
        __testHooks.setFirmwareOptions([oldA, oldB], 'Ceiling-USB');

        const select = document.getElementById('firmware-version-select');
        select.value = 'firmware-stable-1.0.0';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        __testHooks.setChannelAcknowledgement('deprecated', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(oldA).length).toBe(0);

        select.value = 'firmware-stable-1.1.0';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(oldB);
        expect(outstanding.map(item => item.key)).toContain('deprecated');
    });

    test('changing the deprecation reason alone forces re-acknowledgement', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const original = makeBuild({
            firmwareId: 'firmware-stable-old',
            channel: 'stable',
            version: '1.0.0',
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.'
        });
        __testHooks.setFirmwareOptions([original], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();
        __testHooks.setChannelAcknowledgement('deprecated', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(original).length).toBe(0);

        // Manifest update flips the deprecation reason — semantically a new
        // risk profile (e.g. "merely superseded" vs. "actively pulled for a
        // bug"). Re-render with the updated build and confirm the gate
        // demands a fresh ack.
        const updated = { ...original, deprecation_reason: 'Pulled due to provisioning bug.' };
        __testHooks.setFirmwareOptions([updated], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(updated);
        expect(outstanding.map(item => item.key)).toContain('deprecated');
    });

    test('acknowledging beta does not satisfy a preview gate (cross-channel leak protection)', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const beta = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0',
            manifestIndex: 0
        });
        const preview = makeBuild({
            firmwareId: 'firmware-preview',
            channel: 'preview',
            version: '3.0.0-rc.1',
            manifestIndex: 1,
            parts: [{ path: 'firmware/configurations/Sense360-Ceiling-USB-v3.0.0-rc.1-preview.bin', offset: 0 }]
        });
        __testHooks.setFirmwareOptions([beta, preview], 'Ceiling-USB');

        const select = document.getElementById('firmware-version-select');
        select.value = 'firmware-beta';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        __testHooks.setChannelAcknowledgement('channel:beta', true);

        select.value = 'firmware-preview';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(preview);
        expect(outstanding.map(item => item.key)).toContain('channel:preview');
    });

    test('re-acknowledging the same firmware (same identity) preserves consent', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const build = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0'
        });
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();
        __testHooks.setChannelAcknowledgement('channel:beta', true);
        expect(__testHooks.getOutstandingChannelAcknowledgements(build).length).toBe(0);

        // A no-op manifest refresh — same build, same identity. The ack must
        // survive: forcing the user to retick on every render would be a UX
        // regression and would spuriously change diagnostics state.
        __testHooks.setFirmwareOptions([build], 'Ceiling-USB');
        expect(__testHooks.getOutstandingChannelAcknowledgements(build).length).toBe(0);
    });

    test('refusing to acknowledge with no firmware selected leaves the Map empty', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // Try to record an ack with no firmware in scope. Without a signature
        // there is nothing to bind it to; the gate must reject the request
        // rather than silently storing a context-free "true".
        __testHooks.setChannelAcknowledgement('channel:beta', true);
        const stub = { firmwareId: 'fw-late', channel: 'beta', version: '2.1.0', config_string: 'Ceiling-USB' };
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(stub);
        expect(outstanding.map(item => item.key)).toContain('channel:beta');
    });

    test('signature pruning drops stale entries when the active firmware changes silently', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const beta = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.1.0'
        });
        __testHooks.setFirmwareOptions([beta], 'Ceiling-USB');
        __testHooks.selectDefaultFirmware();
        __testHooks.setChannelAcknowledgement('channel:beta', true);

        // Swap window.currentFirmware out from under the gate. This simulates
        // a code path that updates the live selection without going through
        // selectFirmwareById (e.g. an external manifest refresh that mutates
        // the build object). pruneStaleChannelAcknowledgements is the
        // defence-in-depth layer that catches this case.
        const replacement = makeBuild({
            firmwareId: 'firmware-beta',
            channel: 'beta',
            version: '2.2.0'
        });
        window.currentFirmware = replacement;
        const pruned = __testHooks.pruneStaleChannelAcknowledgements();
        expect(pruned).toBe(true);
        const outstanding = __testHooks.getOutstandingChannelAcknowledgements(replacement);
        expect(outstanding.map(item => item.key)).toContain('channel:beta');
    });
});

describe('WF-LED-003 — LED preview exposure model (manifest-only + module-toggle + preview-channel gate)', () => {
    // Policy-level interlock for the imported LED preview build's specific
    // identity. The upstream LED preview firmware lives in manifest.json
    // (imported by WF-LED-002) as:
    //   config_string='Ceiling-POE-VentIQ-RoomIQ-LED'
    //   channel='preview'
    //   version='1.0.0'
    //   parts[].path='firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin'
    //
    // WF-LED-003 records the exposure decision: the LED preview is reachable
    // only through the existing release-channel gate. Concretely:
    //
    //   1. It must not be auto-selected by pickDefaultBuild — even when it
    //      is the only build in the dropdown — because preview channels are
    //      defaultSelectable: false.
    //   2. It must require an explicit `channel:preview` acknowledgement
    //      before the install gate releases.
    //   3. It must remain visible in normal mode (no ?mode=… gate); the
    //      opt-in is "the user explicitly ticks the LED module toggle in
    //      step 4", not a release-mode toggle.
    //   4. The Preview badge must render with warning tone so the channel
    //      cannot be mistaken for stable.
    //   5. The build must never be silently labelled Recommended.
    //
    // release-channels.test.js already pins each of these against synthetic
    // preview fixtures. This block adds the LED-preview-specific
    // interlock so a future regression that targets the LED build by name
    // (e.g. a kit promotion or a preview.defaultSelectable flip motivated
    // by LED bench-verification work) breaks loudly against the policy.

    function makeLedPreviewBuild(overrides = {}) {
        return {
            firmwareId: 'firmware-ceiling-poe-ventiq-roomiq-led-preview',
            channel: 'preview',
            version: '1.0.0',
            config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED',
            deprecated: false,
            parts: [{
                path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin',
                offset: 0
            }],
            ...overrides
        };
    }

    test('pickDefaultBuild never auto-selects the LED preview build (only candidate)', async () => {
        const { pickDefaultBuild } = await import('../scripts/utils/release-channels.js');
        const led = makeLedPreviewBuild();
        // Sole candidate, normal mode: still must not auto-select. The
        // defaultSelectable=false guard on preview is the safety net that
        // keeps a preview build from being treated as the recommended
        // install when stable is absent.
        expect(pickDefaultBuild([led])).toBeNull();
    });

    test('pickDefaultBuild prefers stable Release-One over the LED preview', async () => {
        const { pickDefaultBuild } = await import('../scripts/utils/release-channels.js');
        const led = makeLedPreviewBuild();
        const releaseOne = {
            firmwareId: 'firmware-ceiling-poe-ventiq-roomiq-stable',
            channel: 'stable',
            version: '1.0.0',
            config_string: 'Ceiling-POE-VentIQ-RoomIQ',
            deprecated: false,
            parts: [{
                path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin',
                offset: 0
            }]
        };
        // The two builds carry different config_strings so they would not
        // share a wizard bucket in practice; the assertion is at the
        // policy layer to document that stable wins when both are
        // candidate-eligible.
        expect(pickDefaultBuild([led, releaseOne])).toBe(releaseOne);
    });

    test('LED preview build requires the channel:preview acknowledgement', async () => {
        const { getRequiredAcknowledgements } = await import('../scripts/utils/release-channels.js');
        const acks = getRequiredAcknowledgements(makeLedPreviewBuild());
        expect(acks).toHaveLength(1);
        expect(acks[0].key).toBe('channel:preview');
        expect(acks[0].label).toMatch(/preview/i);
    });

    test('LED preview build remains visible in normal mode (opt-in is the module toggle, not a release mode)', async () => {
        const { filterBuildsForMode, isBuildVisibleInMode } =
            await import('../scripts/utils/release-channels.js');
        const led = makeLedPreviewBuild();
        // Normal mode must keep preview builds visible — the wizard's
        // exposure gate is the LED module toggle in step 4 plus the
        // preview-channel acknowledgement, NOT a ?mode= URL toggle.
        expect(isBuildVisibleInMode(led, 'normal')).toBe(true);
        expect(filterBuildsForMode([led], 'normal')).toEqual([led]);
    });

    test('LED preview surfaces a Preview badge with warning tone', async () => {
        const { getFirmwareBadges } = await import('../scripts/utils/release-channels.js');
        const badges = getFirmwareBadges(makeLedPreviewBuild());
        const previewBadge = badges.find(badge => badge.key === 'preview');
        expect(previewBadge).toBeDefined();
        expect(previewBadge.label).toBe('Preview');
        expect(previewBadge.tone).toBe('warning');
    });

    test('LED preview build is never tagged Recommended by getFirmwareBadges default behaviour', async () => {
        const { getFirmwareBadges } = await import('../scripts/utils/release-channels.js');
        // recommended=true is caller-controlled, but the wizard only sets
        // it when pickDefaultBuild returns the build — which it cannot for
        // a preview build (defaultSelectable=false). Confirm the default
        // call path does not auto-promote the LED preview.
        const badges = getFirmwareBadges(makeLedPreviewBuild());
        expect(badges.find(badge => badge.key === 'recommended')).toBeUndefined();
    });
});
