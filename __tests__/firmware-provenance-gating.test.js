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
    // Real Ed25519 signature metadata. The bytes here are valid base64
    // of a 64-byte signature value but were not generated against the
    // test fixture's bytes. The static gate only verifies metadata
    // presence and (in production mode) refuses test_only key ids; the
    // runtime gate (state.js + firmware-signature.js) does the actual
    // crypto check after download. We use a synthetic key id that is
    // not on the trust list so the static gate accepts metadata
    // presence; the production-mode refusal of the committed dev key
    // (which IS on the trust list as test_only) is exercised in
    // firmware-signature.test.js.
    signature_ed25519: 'kgpXnONkJ8YZhazkL4U8NlOiFW1Xwbri37UI6jEOwfAOHzvR/YCxZ4m6NKJypOdvya8khHFjrw6rHSMaSu//Aw==',
    signature_key_id: 'unit-test-fixture-key',
    source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    file_size: 524288,
    changelog: ['Stable v2.0.0 rollout for Sense360 Ceiling-USB; baseline build for production deployments.'],
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
            /source commit/i
        );
    });

    test('valid stable firmware progresses past the static provenance gate', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        // Static gate accepts the metadata. The runtime authenticity check
        // is still pending (no crypto.subtle in the test env), but the
        // STATIC report's `ok` flag is true because none of the
        // metadata-only checks fail.
        expect(window.latestFirmwareProvenance.ok).toBe(true);
        // Status is 'pass' for metadata; signature_verified stays 'pending'
        // until state.js calls applySignatureVerificationResult().
        expect(window.latestFirmwareProvenance.status).toBe('pass');
        expect(window.latestFirmwareProvenance.pending).toBe(true);
    });

    test('renderFirmwareProvenanceSection surfaces source commit and verified checks', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.renderFirmwareProvenanceSection({ ...VALID_STABLE_FIRMWARE });

        expect(html).toContain('Source commit');
        expect(html).toContain('eec461a4f6d8');
        // Panel header is now explicit about what passed: provenance metadata
        // checks, not signature verification.
        expect(html).toContain('Provenance metadata verified');
        // Each required field should produce a passing check.
        expect(html.match(/status-pass/g).length).toBeGreaterThanOrEqual(5);
        // The signature_verified check is in 'pending' state until the
        // runtime layer applies the actual Ed25519 verification result.
        expect(html).toMatch(/data-check-id="signature_verified"[^>]*data-check-status="pending"/);
    });

    test('renderFirmwareProvenanceSection does NOT overclaim cryptographic verification before runtime check runs', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const html = __testHooks.renderFirmwareProvenanceSection({ ...VALID_STABLE_FIRMWARE });

        // The signature_verified check must surface 'pending' (or fail), never
        // 'pass', until the runtime verification has actually executed.
        expect(html).toMatch(/data-check-id="signature_verified"[^>]*data-check-status="pending"/);
        // Forbidden phrasings that would overclaim verification while the
        // runtime check is still pending.
        const forbidden = [
            /Ed25519 signature verified/i,
            /signed firmware verified/i,
            /cryptographically verified firmware/i
        ];
        for (const pattern of forbidden) {
            expect(html).not.toMatch(pattern);
        }
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
        // Panel surfaces metadata-only verdict as 'pass' — the deprecated
        // marker is informational, not a metadata-tier failure. Status flips
        // to 'warn' only when authenticity hasn't been verified yet.
        expect(html).toMatch(/data-firmware-provenance="(warn|pass)"/);
    });

    test('suspicious file_size between placeholder and threshold blocks install', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE, file_size: 8192 };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.sizeClassification).toBe('suspicious');
        expect(window.latestFirmwareProvenance.blockingReasons.join(' ')).toMatch(
            /below the .*plausible threshold/i
        );
    });

    test('beta firmware missing sha256 fails BEFORE any download starts', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const broken = { ...VALID_STABLE_FIRMWARE, channel: 'beta', sha256: '' };
        window.currentFirmware = broken;

        await __testHooks.verifyCurrentFirmwareIntegrity();

        // Critical primitives are blocking on every flashable channel; no
        // network fetch should be issued for the firmware binary.
        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('firmware/configurations/'),
            expect.anything()
        );
        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.missingRequired).toContain('sha256');
    });

    test('rescue firmware missing sha256 fails BEFORE any download starts', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const broken = { ...VALID_STABLE_FIRMWARE, channel: 'rescue', sha256: '' };
        window.currentFirmware = broken;

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('firmware/configurations/'),
            expect.anything()
        );
        expect(window.latestFirmwareProvenance.ok).toBe(false);
    });

    test('mutable source_url on a stable build blocks install before any download', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        const broken = {
            ...VALID_STABLE_FIRMWARE,
            source_url: 'https://github.com/sense360store/WebFlash/tree/main/firmware'
        };
        window.currentFirmware = broken;

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('firmware/configurations/'),
            expect.anything()
        );
        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.sourceUrlMutable).toBe(true);
    });

    test('beta firmware with failed provenance stays blocked even when the channel acknowledgement is checked', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // Beta build with a mutable source_url — provenance fails in
        // production mode regardless of channel.
        const broken = {
            ...VALID_STABLE_FIRMWARE,
            firmwareId: 'firmware-beta-broken',
            channel: 'beta',
            source_url: 'https://github.com/sense360store/WebFlash/tree/main/firmware'
        };
        __testHooks.setFirmwareOptions([broken], 'Ceiling-USB');
        // Force-select via dropdown so the firmware is registered as the
        // current selection in the firmwareOptionsMap (not just on window).
        const select = document.getElementById('firmware-version-select');
        select.value = broken.firmwareId;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        await __testHooks.verifyCurrentFirmwareIntegrity();

        // Acknowledge the beta channel. This must NOT clear the provenance
        // failure — channel acknowledgement and provenance gating are
        // independent layers.
        __testHooks.setChannelAcknowledgement('channel:beta', true);

        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.sourceUrlMutable).toBe(true);
        // Verification state must remain failed; otherwise the install gate
        // would let the user proceed on a bad-provenance build.
        const installButton = document.querySelector('#compatible-firmware esp-web-install-button button[slot="activate"]');
        if (installButton) {
            expect(installButton.disabled).toBe(true);
        }
    });

    test('placeholder file_size on a stable build blocks install before any download', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // 18-byte placeholder fixture sentinel size — production gate must
        // refuse it so the wizard never advertises a placeholder as
        // installable to end users.
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE, file_size: 18 };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('firmware/configurations/'),
            expect.anything()
        );
        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.sizeClassification).toBe('placeholder');
        expect(window.latestFirmwareProvenance.blockingReasons.join(' ')).toMatch(
            /placeholder fixture/i
        );
        expect(window.latestFirmwareProvenance.blockingReasons.join(' ')).toMatch(
            /cannot be installed by the production WebFlash app/i
        );
    });

    test('placeholder firmware never surfaces "Firmware verified successfully" copy in production', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE, file_size: 18 };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        const html = __testHooks.renderFirmwareProvenanceSection({
            ...VALID_STABLE_FIRMWARE,
            file_size: 18
        });
        expect(html).not.toMatch(/firmware verified successfully/i);
        expect(html).toMatch(/placeholder fixture/i);
        // Provenance panel surfaces the rejection in its `data-firmware-provenance`
        // attribute so CSS / a11y tooling can react to the failed state.
        expect(html).toMatch(/data-firmware-provenance="fail"/);
    });

    test('static provenance failure leaves the firmware verification state in failed state', async () => {
        const { __testHooks } = await import('../scripts/state.js');
        // Suspicious size between placeholder and threshold should fail before
        // network IO is even attempted.
        window.currentFirmware = { ...VALID_STABLE_FIRMWARE, file_size: 8192 };

        await __testHooks.verifyCurrentFirmwareIntegrity();

        // No firmware fetch, and the verification state surfaces 'failed' so
        // the install button cannot enter a 'ready' state on top of it.
        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('firmware/configurations/'),
            expect.anything()
        );
        expect(window.latestFirmwareProvenance.ok).toBe(false);
        expect(window.latestFirmwareProvenance.status).toBe('fail');
    });
});
