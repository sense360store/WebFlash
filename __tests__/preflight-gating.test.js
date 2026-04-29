import { jest } from '@jest/globals';

function renderDom() {
  document.body.innerHTML = `
    <div id="browser-warning"></div>
    <div class="progress-step" data-step="1"></div><div class="progress-step" data-step="2"></div><div class="progress-step" data-step="3"></div><div class="progress-step" data-step="4"></div><div class="progress-step" data-step="5"></div>
    <div id="step-1" class="wizard-step"><button class="btn-next" data-next>Next</button></div>
    <div id="step-2" class="wizard-step"><button class="btn-next" data-next>Next</button><input type="radio" name="mounting" value="wall" checked></div>
    <div id="step-3" class="wizard-step"><button class="btn-next" data-next>Next</button><input type="radio" name="power" value="usb" checked></div>
    <div id="step-4" class="wizard-step"></div>
    <div id="step-5" class="wizard-step">
      <div class="primary-action-group"><p data-ready-helper></p></div>
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
        <li data-preflight-item="browser-support"><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
        <li data-preflight-item="device-visibility"><span data-preflight-status="device-visibility"></span><span data-preflight-detail="device-visibility"></span></li>
        <li data-preflight-item="firmware-verification"><span data-preflight-status="firmware-verification"></span><span data-preflight-detail="firmware-verification"></span></li>
        <li data-preflight-item="user-acknowledgement"><span data-preflight-status="user-acknowledgement"></span><span data-preflight-detail="user-acknowledgement"></span></li>
      </ul>
    </div>`;
}

describe('preflight install gating', () => {
  beforeEach(() => {
    jest.resetModules();
    renderDom();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
    Object.defineProperty(global.navigator, 'serial', { value: { getPorts: jest.fn(() => Promise.resolve([])) }, configurable: true });
    window.confirm = jest.fn(() => true);
    window.currentFirmware = { parts: [{ path: 'fw.bin', offset: 0 }] };
  });

  function injectInstallControls() {
    const container = document.getElementById('compatible-firmware');
    container.innerHTML = `
      <p data-ready-helper></p>
      <esp-web-install-button data-webflash-install>
        <button slot="activate"></button>
      </esp-web-install-button>
    `;
  }

  test('pass policy allows install without extra blocking', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setPreflightWarningsAcknowledgement(false);
    const policy = __testHooks.evaluatePreflightPolicy([{ key: 'browser-support', state: 'pass', detail: 'ok' }]);
    expect(policy.canInstall).toBe(true);
    expect(policy.requiresWarnAcknowledgement).toBe(false);
    expect(policy.blockingReasons).toHaveLength(0);
  });

  test('fail policy blocks install with a blocking reason', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    const policy = __testHooks.evaluatePreflightPolicy([{ key: 'browser-support', state: 'fail', detail: 'Web Serial unavailable.' }]);
    expect(policy.canInstall).toBe(false);
    expect(policy.blockingReasons).toContain('Web Serial unavailable.');
  });

  test('warn policy requires acknowledgement and then allows install', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setPreflightWarningsAcknowledgement(false);
    const blockedPolicy = __testHooks.evaluatePreflightPolicy([{ key: 'device-visibility', state: 'warn', detail: 'Device info unavailable.' }]);
    expect(blockedPolicy.canInstall).toBe(false);
    expect(blockedPolicy.requiresWarnAcknowledgement).toBe(true);

    __testHooks.setPreflightWarningsAcknowledgement(true);
    const allowedPolicy = __testHooks.evaluatePreflightPolicy([{ key: 'device-visibility', state: 'warn', detail: 'Device info unavailable.' }]);
    expect(allowedPolicy.canInstall).toBe(true);
    expect(allowedPolicy.requiresWarnAcknowledgement).toBe(false);
  });

  test('step 5 keeps preflight panel visible in pre-install state', async () => {
    const { __testHooks, setStep } = await import('../scripts/state.js');
    setStep(5, { animate: false, skipUrlUpdate: true });
    __testHooks.setFirmwareVerificationState({ status: 'pending', message: 'Verifying...' });
    await __testHooks.refreshPreflightDiagnostics();

    expect(document.querySelector('[data-preflight-list]').hidden).not.toBe(true);
    expect(document.getElementById('step-5').hidden).toBe(false);
  });
});
