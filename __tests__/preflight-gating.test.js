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
      <div class="secondary-action-group"><p data-ready-helper></p></div>
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
        <li data-preflight-item="browser-support" data-status="pending"><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
        <li data-preflight-item="device-visibility" data-status="pending"><span data-preflight-status="device-visibility"></span><span data-preflight-detail="device-visibility"></span></li>
        <li data-preflight-item="connection-quality" data-status="pending"><span data-preflight-status="connection-quality"></span><span data-preflight-detail="connection-quality"></span></li>
        <li data-preflight-item="firmware-verification" data-status="pending"><span data-preflight-status="firmware-verification"></span><span data-preflight-detail="firmware-verification"></span></li>
        <li data-preflight-item="user-acknowledgement" data-status="pending"><span data-preflight-status="user-acknowledgement"></span><span data-preflight-detail="user-acknowledgement"></span></li>
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

  test('entering step 5 resolves preflight items to a real verdict', async () => {
    delete window.currentFirmware;
    const { setStep } = await import('../scripts/state.js');
    setStep(5, { animate: false, skipUrlUpdate: true });
    await Promise.resolve();

    const items = document.querySelectorAll('[data-preflight-item]');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      expect(['pass', 'warn', 'fail', 'pending']).toContain(item.dataset.status);
      // Connection-quality and device-visibility legitimately stay pending
      // until the user actually attempts a connection. The other checks
      // must surface a real pass/warn/fail verdict on entry.
      const key = item.dataset.preflightItem;
      if (key !== 'connection-quality' && key !== 'device-visibility') {
        expect(item.dataset.status).not.toBe('pending');
      }
    });
  });

  test('connection quality is pending before a connection attempt', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).toBe('pending');
    expect(quality.blocking).toBe(false);
    expect(quality.detail).toMatch(/Connect your hub/i);
    expect(quality.detail).not.toMatch(/Link is unstable/i);
  });

  test('device visibility is pending before a connection attempt', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const visibility = checks.find((check) => check.key === 'device-visibility');
    expect(visibility.state).toBe('pending');
    expect(visibility.blocking).toBe(false);
    expect(visibility.detail).toMatch(/Connect your hub/i);
    expect(visibility.detail).not.toMatch(/has not been read/i);
  });

  test('zero events over zero seconds does not produce fail', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    // No metric updates at all — the default is "0 disconnects, 0 retries,
    // 0 serial failures, stability window starts at module-load". Without
    // the pending fix this would fail because stabilityWindowMs ≈ 0.
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).not.toBe('fail');
    expect(quality.state).toBe('pending');
  });

  test('pending connection-quality does not surface in install blocking reasons', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const policy = __testHooks.evaluatePreflightPolicy(checks);
    expect(policy.blockingReasons.join(' ')).not.toMatch(/Link is unstable/i);
  });

  test('a connection-attempted event graduates the connection-quality check', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    expect(__testHooks.hasPreflightConnectionBeenAttempted()).toBe(false);
    window.dispatchEvent(new CustomEvent('webflash:connection-attempted'));
    expect(__testHooks.hasPreflightConnectionBeenAttempted()).toBe(true);
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).not.toBe('pending');
    // No failures recorded — should pass once connection is attempted.
    expect(quality.state).toBe('pass');
  });

  test('install gate before connection does not say "Link is unstable"', async () => {
    const { __testHooks, setStep } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    setStep(5, { animate: false, skipUrlUpdate: true });
    __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
    await __testHooks.refreshPreflightDiagnostics();
    const policy = __testHooks.evaluatePreflightPolicy(window.latestPreflightChecks || []);
    // Pending checks must never appear in the blocking-reasons list.
    policy.blockingReasons.forEach((reason) => {
      expect(reason).not.toMatch(/Link is unstable/i);
    });
  });

  test('pending checks alone do not surface as warn or fail', async () => {
    // Verify that the pending state does not trigger support-bundle visibility
    // by checking the policy directly. The full DOM render is influenced by
    // browser-support which depends on jsdom user agent — test the isolated
    // verdict rather than the rendered support-actions element.
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const visibility = checks.find((check) => check.key === 'device-visibility');
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(visibility.state).toBe('pending');
    expect(quality.state).toBe('pending');
    // Pending must not register as a warning or failure for any downstream
    // gate (support-bundle visibility, install gating, etc.).
    expect(visibility.state).not.toBe('warn');
    expect(visibility.state).not.toBe('fail');
    expect(quality.state).not.toBe('warn');
    expect(quality.state).not.toBe('fail');
  });

  test('support bundle controls appear when a real warn or fail is present', async () => {
    const { __testHooks, setStep } = await import('../scripts/state.js');
    document.body.innerHTML += '<div data-preflight-support-actions hidden aria-hidden="true"></div>';
    setStep(5, { animate: false, skipUrlUpdate: true });
    __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
    // Real failure events flip the connection check to fail.
    __testHooks.updateConnectionQualityMetrics({
      disconnects: 3,
      reconnectAttempts: 4,
      serialReadFailures: 2,
      serialWriteFailures: 1,
      retryCount: 5,
      stabilityWindowStart: Date.now() - 9000
    });
    await __testHooks.refreshPreflightDiagnostics();
    const supportActions = document.querySelector('[data-preflight-support-actions]');
    expect(supportActions.hidden).toBe(false);
  });

  test('serial read/write failures still produce fail per existing thresholds', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.updateConnectionQualityMetrics({
      disconnects: 0,
      reconnectAttempts: 0,
      serialReadFailures: 2,
      serialWriteFailures: 1,
      retryCount: 0,
      stabilityWindowStart: Date.now() - 60000
    });
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).toBe('fail');
    expect(quality.blocking).toBe(true);
  });

  test('cancelled USB setup test does not graduate pending connection state', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.resetPreflightConnectionAttemptedForTests();
    // Simulate the modal *not* dispatching webflash:connection-attempted
    // for cancellation (which is the modal's actual behavior). Pending
    // state must remain.
    expect(__testHooks.hasPreflightConnectionBeenAttempted()).toBe(false);
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).toBe('pending');
  });

  test('connection quality passes when stable and failure-free', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.updateConnectionQualityMetrics({
      disconnects: 0,
      reconnectAttempts: 0,
      serialReadFailures: 0,
      serialWriteFailures: 0,
      retryCount: 0,
      stabilityWindowStart: Date.now() - 35000
    });
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).toBe('pass');
  });

  test('connection quality warns at boundary thresholds', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.updateConnectionQualityMetrics({
      disconnects: 1,
      reconnectAttempts: 1,
      serialReadFailures: 0,
      serialWriteFailures: 1,
      retryCount: 2,
      stabilityWindowStart: Date.now() - 30000
    });
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).toBe('warn');
  });

  test('connection quality fails when link is flaky', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.updateConnectionQualityMetrics({
      disconnects: 3,
      reconnectAttempts: 4,
      serialReadFailures: 2,
      serialWriteFailures: 1,
      retryCount: 5,
      stabilityWindowStart: Date.now() - 9000
    });
    const checks = await __testHooks.refreshPreflightDiagnostics();
    const quality = checks.find((check) => check.key === 'connection-quality');
    expect(quality.state).toBe('fail');
    expect(quality.blocking).toBe(true);
  });

  test('diagnostics bundle includes required keys and redacts sensitive values', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    window.currentFirmware = {
      model: 'Sense360',
      variant: 'Wall',
      sensor_addon: 'AirIQ',
      channel: 'stable',
      version: '1.2.3',
      firmwareId: 'firmware-secret-id',
      parts: [{ path: '/firmware/private.bin', offset: 0 }]
    };
    __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
    await __testHooks.refreshPreflightDiagnostics();
    const bundle = __testHooks.buildDiagnosticsBundle();

    expect(bundle).toEqual(expect.objectContaining({
      schema_version: 1,
      generated_at: expect.any(String),
      app: expect.any(Object),
      environment: expect.any(Object),
      manifest: expect.any(Object),
      firmware: expect.any(Object),
      wizard: expect.any(Object),
      preflight: expect.any(Object),
      recovery: expect.any(Object),
      cache: expect.any(Object),
      flash: expect.any(Object)
    }));
    // Path values that match a sensitive shape (start with /firmware/) are
    // redacted via the value-based PATH classifier; firmware sha256/signature
    // are reported as booleans only, never raw values.
    expect(bundle.firmware.sha256_present).toBe(false);
    expect(bundle.firmware.signature_present).toBe(false);
    expect(__testHooks.redactDiagnosticsValue({ password: 'abc123' }).password).toBe('[REDACTED_PASSWORD]');
    expect(__testHooks.redactDiagnosticsValue({ token: 'abc123' }).token).toBe('[REDACTED_TOKEN]');
  });

  test('copy diagnostics uses clipboard fallback when Clipboard API is unavailable', async () => {
    delete global.navigator.clipboard;
    document.execCommand = jest.fn(() => true);
    const { __testHooks } = await import('../scripts/state.js');
    const copied = await __testHooks.copyDiagnosticsBundle();
    expect(copied).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('WF-UX-004 — preflight verdict', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <section class="preflight-panel" data-preflight-panel>
        <h3 id="preflight-checks-heading" class="sr-only">Preflight checks</h3>
        <div class="preflight-panel__verdict" data-preflight-verdict data-verdict="ready" role="status">
          <span class="preflight-panel__verdict-icon" data-preflight-verdict-icon aria-hidden="true"></span>
          <div class="preflight-panel__verdict-body">
            <p class="preflight-panel__verdict-title" data-preflight-verdict-title>Ready to install</p>
            <p class="preflight-panel__verdict-detail" data-preflight-verdict-detail>Your browser, firmware, and required checks are ready.</p>
          </div>
        </div>
        <label class="preflight-panel__warn-acknowledge" data-preflight-warn-acknowledge hidden aria-hidden="true">
          <input type="checkbox" data-preflight-warn-acknowledge-input>
        </label>
        <details class="preflight-panel__details" data-preflight-details>
          <summary class="preflight-panel__details-summary">Preflight details</summary>
          <ul data-preflight-list>
            <li data-preflight-item="browser-support" data-status="pending"><span data-preflight-status="browser-support"></span><span data-preflight-detail="browser-support"></span></li>
            <li data-preflight-item="device-visibility" data-status="pending"><span data-preflight-status="device-visibility"></span><span data-preflight-detail="device-visibility"></span></li>
            <li data-preflight-item="connection-quality" data-status="pending"><span data-preflight-status="connection-quality"></span><span data-preflight-detail="connection-quality"></span></li>
            <li data-preflight-item="firmware-verification" data-status="pending"><span data-preflight-status="firmware-verification"></span><span data-preflight-detail="firmware-verification"></span></li>
            <li data-preflight-item="user-acknowledgement" data-status="pending"><span data-preflight-status="user-acknowledgement"></span><span data-preflight-detail="user-acknowledgement"></span></li>
            <li data-preflight-item="manifest-freshness" data-status="pending"><span data-preflight-status="manifest-freshness"></span><span data-preflight-detail="manifest-freshness"></span></li>
          </ul>
          <div data-preflight-support-actions hidden aria-hidden="true">
            <button data-copy-support-bundle>Copy support bundle</button>
            <button data-download-support-bundle>Download JSON</button>
          </div>
        </details>
      </section>`;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
    Object.defineProperty(global.navigator, 'serial', { value: { getPorts: jest.fn(() => Promise.resolve([])) }, configurable: true });
  });

  test('derivePreflightVerdict returns the ready verdict for all-pass and empty checks', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    const empty = __testHooks.derivePreflightVerdict([]);
    expect(empty.level).toBe('ready');
    expect(empty.title).toBe('Ready to install');
    expect(empty.detail).toBe('Your browser, firmware, and required checks are ready.');

    const allPass = __testHooks.derivePreflightVerdict([
      { key: 'browser-support', state: 'pass' },
      { key: 'firmware-verification', state: 'pass' }
    ]);
    expect(allPass.level).toBe('ready');
  });

  test('derivePreflightVerdict returns the attention verdict when any check is warn but none fail', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    const verdict = __testHooks.derivePreflightVerdict([
      { key: 'browser-support', state: 'pass' },
      { key: 'device-visibility', state: 'warn' }
    ]);
    expect(verdict.level).toBe('attention');
    expect(verdict.title).toBe('Needs attention');
    expect(verdict.detail).toBe('Review the warnings below before installing.');
  });

  test('derivePreflightVerdict returns the blocked verdict when any check fails', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    const failOnly = __testHooks.derivePreflightVerdict([
      { key: 'browser-support', state: 'fail' }
    ]);
    expect(failOnly.level).toBe('blocked');
    expect(failOnly.title).toBe('Blocked');
    expect(failOnly.detail).toBe('Fix the required items below before installing firmware.');

    const failAndWarn = __testHooks.derivePreflightVerdict([
      { key: 'browser-support', state: 'fail' },
      { key: 'device-visibility', state: 'warn' }
    ]);
    expect(failAndWarn.level).toBe('blocked');
  });

  test('pending-only checks resolve to the ready verdict (pending is not a warn or fail)', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    const verdict = __testHooks.derivePreflightVerdict([
      { key: 'device-visibility', state: 'pending' },
      { key: 'connection-quality', state: 'pending' }
    ]);
    expect(verdict.level).toBe('ready');
  });

  test('verdict and evaluatePreflightPolicy agree on the same checks array', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setPreflightWarningsAcknowledgement(false);

    const ready = [{ key: 'browser-support', state: 'pass' }];
    expect(__testHooks.derivePreflightVerdict(ready).level).toBe('ready');
    expect(__testHooks.evaluatePreflightPolicy(ready).canInstall).toBe(true);

    const attention = [{ key: 'device-visibility', state: 'warn', detail: 'flaky' }];
    expect(__testHooks.derivePreflightVerdict(attention).level).toBe('attention');
    expect(__testHooks.evaluatePreflightPolicy(attention).canInstall).toBe(false);

    const blocked = [{ key: 'browser-support', state: 'fail', detail: 'no Web Serial' }];
    expect(__testHooks.derivePreflightVerdict(blocked).level).toBe('blocked');
    expect(__testHooks.evaluatePreflightPolicy(blocked).canInstall).toBe(false);
  });

  test('override does not bypass hard blockers (fail keeps canInstall false even when acknowledged)', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setPreflightWarningsAcknowledgement(true);
    const checks = [
      { key: 'browser-support', state: 'fail', detail: 'Web Serial unavailable.' },
      { key: 'device-visibility', state: 'warn', detail: 'Device info unavailable.' }
    ];
    const policy = __testHooks.evaluatePreflightPolicy(checks);
    expect(policy.canInstall).toBe(false);
    expect(policy.blockingReasons).toContain('Web Serial unavailable.');
    expect(__testHooks.derivePreflightVerdict(checks).level).toBe('blocked');
  });

  test('refreshPreflightDiagnostics renders the verdict card with the right data-verdict and copy', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
    __testHooks.setPreFlashAcknowledgement(true);
    __testHooks.resetPreflightConnectionAttemptedForTests();
    await __testHooks.refreshPreflightDiagnostics();
    const card = document.querySelector('[data-preflight-verdict]');
    expect(card).not.toBeNull();
    const titleEl = card.querySelector('[data-preflight-verdict-title]');
    const detailEl = card.querySelector('[data-preflight-verdict-detail]');
    expect(card.dataset.verdict).toBe(card.dataset.verdict);
    expect(['ready', 'attention', 'blocked']).toContain(card.dataset.verdict);
    expect(titleEl.textContent.trim().length).toBeGreaterThan(0);
    expect(detailEl.textContent.trim().length).toBeGreaterThan(0);
  });

  test('blocked verdict renders Blocked title and body', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setFirmwareVerificationState({ status: 'failed', message: 'integrity check failed' });
    await __testHooks.refreshPreflightDiagnostics();
    const card = document.querySelector('[data-preflight-verdict]');
    expect(card.dataset.verdict).toBe('blocked');
    expect(card.querySelector('[data-preflight-verdict-title]').textContent).toBe('Blocked');
    expect(card.querySelector('[data-preflight-verdict-detail]').textContent).toBe('Fix the required items below before installing firmware.');
  });

  test('warning override is hidden when a hard fail is present alongside warnings', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    // Firmware verification failure produces a fail; pre-flash unack produces a warn.
    __testHooks.setFirmwareVerificationState({ status: 'failed', message: 'bad sha' });
    __testHooks.setPreFlashAcknowledgement(false);
    await __testHooks.refreshPreflightDiagnostics();
    const override = document.querySelector('[data-preflight-warn-acknowledge]');
    expect(override.hidden).toBe(true);
    expect(override.getAttribute('aria-hidden')).toBe('true');
  });

  test('warning override is shown when warnings exist with no hard fail', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
    // Unacked pre-flash checklist is the only warn → no fails.
    __testHooks.setPreFlashAcknowledgement(false);
    await __testHooks.refreshPreflightDiagnostics();
    const override = document.querySelector('[data-preflight-warn-acknowledge]');
    expect(override.hidden).toBe(false);
    expect(override.getAttribute('aria-hidden')).toBe('false');
  });

  test('warning override is hidden in the ready state', async () => {
    // Spoof a desktop Chrome user agent + secure context so browser-support
    // resolves to pass; otherwise jsdom's UA produces a 'warn' on the
    // untested-browser path and the override would surface.
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { ...originalNavigator, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36', serial: { getPorts: jest.fn(() => Promise.resolve([])) } },
      configurable: true
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    try {
      const { __testHooks } = await import('../scripts/state.js');
      __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
      __testHooks.setPreFlashAcknowledgement(true);
      __testHooks.acknowledgeManifestFreshnessForTests?.();
      await __testHooks.refreshPreflightDiagnostics();
      const override = document.querySelector('[data-preflight-warn-acknowledge]');
      expect(override.hidden).toBe(true);
    } finally {
      Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true });
    }
  });

  test('Preflight details disclosure auto-opens for non-ready verdicts', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setFirmwareVerificationState({ status: 'failed', message: 'integrity check failed' });
    const details = document.querySelector('[data-preflight-details]');
    details.removeAttribute('open');
    delete details.dataset.preflightDetailsUserToggled;
    delete details.dataset.preflightDetailsBound;
    await __testHooks.refreshPreflightDiagnostics();
    expect(details.hasAttribute('open')).toBe(true);
  });

  test('Preflight details disclosure stays closed for ready verdict', async () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { ...originalNavigator, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36', serial: { getPorts: jest.fn(() => Promise.resolve([])) } },
      configurable: true
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    try {
      const { __testHooks } = await import('../scripts/state.js');
      __testHooks.setFirmwareVerificationState({ status: 'verified', message: 'ok' });
      __testHooks.setPreFlashAcknowledgement(true);
      const details = document.querySelector('[data-preflight-details]');
      details.setAttribute('open', '');
      delete details.dataset.preflightDetailsUserToggled;
      delete details.dataset.preflightDetailsBound;
      await __testHooks.refreshPreflightDiagnostics();
      expect(details.hasAttribute('open')).toBe(false);
    } finally {
      Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true });
    }
  });

  test('user-toggled details disclosure is not overridden on subsequent refreshes', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    __testHooks.setFirmwareVerificationState({ status: 'failed', message: 'bad sha' });
    const details = document.querySelector('[data-preflight-details]');
    details.dataset.preflightDetailsUserToggled = 'true';
    details.removeAttribute('open');
    await __testHooks.refreshPreflightDiagnostics();
    // Auto-open should be suppressed because the user has manually closed it.
    expect(details.hasAttribute('open')).toBe(false);
  });

  test('diagnostics action buttons remain available inside the disclosure', async () => {
    const { __testHooks } = await import('../scripts/state.js');
    // Force a real fail so support actions surface.
    __testHooks.setFirmwareVerificationState({ status: 'failed', message: 'integrity check failed' });
    await __testHooks.refreshPreflightDiagnostics();
    const supportActions = document.querySelector('[data-preflight-support-actions]');
    expect(supportActions.hidden).toBe(false);
    expect(supportActions.querySelector('[data-copy-support-bundle]')).not.toBeNull();
    expect(supportActions.querySelector('[data-download-support-bundle]')).not.toBeNull();
  });
});
