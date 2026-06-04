/**
 * PR 7 (WebFlash 2.0 migration) — Improv connect and post-flash validation.
 *
 * Covers what PR 7 adds, replacing the simulated Wi-Fi step (the hardcoded
 * NETWORKS array plus the setTimeout scan / connect) with the real binding:
 *
 *   - real Wi-Fi provisioning happens over Improv Serial inside the ESP Web
 *     Tools install dialog that Step 2 opened; the 2.0 Connect step builds no
 *     Wi-Fi scan or password form of its own and never reads, logs, or stores
 *     an SSID or a password anywhere;
 *   - the 2.0 Install step feeds the engine's post-flash state machine
 *     (scripts/services/post-flash.js, exposed via engine.postFlash) the
 *     selected build and every ESP Web Tools lifecycle event;
 *   - the 2.0 Connect step renders that state machine's eight result states,
 *     the validation checks, and the handoffs, with the Home Assistant handoff
 *     shown only when the selected build advertises improv:true;
 *   - builds without Improv report the honest `unknown` validation result by
 *     default;
 *   - the NETWORKS simulation is gone from webflash-2/scripts/connect.js.
 *
 * The post-flash state machine itself is exhaustively unit-tested by
 * __tests__/post-flash-state-machine.test.js and post-flash-validation.test.js.
 * These tests pin the 2.0 view's binding to it.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
});

const ROOT = process.cwd();
const CONNECT_SRC = readFileSync(join(ROOT, 'webflash-2', 'scripts', 'connect.js'), 'utf8');
const INSTALL_SRC = readFileSync(join(ROOT, 'webflash-2', 'scripts', 'install.js'), 'utf8');
const ENGINE_SRC = readFileSync(join(ROOT, 'webflash-2', 'scripts', 'engine.js'), 'utf8');
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));

function makeFetch() {
  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('kits.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsJson) });
    }
    if (u.includes('manifest.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifestJson) });
    }
    if (u.includes('.bin')) {
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

const a11yStub = {
  announce: jest.fn(),
  trapFocus: () => () => {},
  restoreFocus: () => {},
  getFocusableElements: () => [],
};

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stateEvent(state, extra = {}) {
  return new CustomEvent('state-changed', { detail: { state, ...extra } });
}

const IMPROV_BUILD = Object.freeze({
  name: 'Sense360 Modular Platform Firmware',
  version: '2.0.0',
  channel: 'stable',
  config_string: 'Ceiling-POE-VentIQ-RoomIQ',
  source_commit: '49301128e122e9fe486e548828714290c8ee93b8',
  improv: true,
});

const NO_IMPROV_BUILD = Object.freeze({
  name: 'Sense360 Rescue',
  version: '2.0.0',
  channel: 'stable',
  config_string: 'Rescue',
  improv: false,
});

describe('PR 7 — the Wi-Fi simulation is deleted from connect.js', () => {
  it('no longer defines the NETWORKS array or a setTimeout scan / connect', () => {
    // The docstring may still reference the removed NETWORKS array for
    // historical context (exactly as the PR 6 install.js docstring references
    // the removed FLASH_PHASES), so the guards target the actual simulation
    // constructs rather than the word.
    expect(CONNECT_SRC).not.toMatch(/const\s+NETWORKS/);
    expect(CONNECT_SRC).not.toMatch(/NETWORKS\.map/);
    expect(CONNECT_SRC).not.toMatch(/setTimeout\s*\(/);
  });

  it('binds the Connect step to the engine post-flash state machine', () => {
    expect(CONNECT_SRC).toMatch(/engine\.postFlash/);
    expect(CONNECT_SRC).toMatch(/\.subscribe\(/);
  });

  it('never builds a credential input or reads input values in the Connect step', () => {
    // No password field and no input-value read: provisioning is the ESP Web
    // Tools dialog's job, observed only through the redacted snapshot. (Comments
    // may mention SSID / password to document the non-claim; the guards target
    // the actual credential-capture code constructs.)
    expect(CONNECT_SRC).not.toMatch(/type:\s*['"]password['"]/);
    expect(CONNECT_SRC).not.toMatch(/\.value\b/);
    expect(CONNECT_SRC).not.toMatch(/createElement\(\s*['"]input['"]/);
  });
});

describe('PR 7 — install.js feeds the post-flash state machine', () => {
  it('captures the selected build and forwards lifecycle events to the engine', () => {
    expect(INSTALL_SRC).toMatch(/engine\.postFlash\.service\.captureSelectedBuild/);
    expect(INSTALL_SRC).toMatch(/engine\.postFlash\.service\.dispatchLifecycle/);
  });
});

describe('PR 7 — engine.js exposes the post-flash state machine', () => {
  it('exposes the post-flash service surface the view consumes', () => {
    expect(ENGINE_SRC).toMatch(/postFlashService/);
    expect(ENGINE_SRC).toMatch(/postFlash/);
  });
});

describe('PR 7 — engine.postFlash binding', () => {
  let engine;

  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    engine = (await import('../webflash-2/scripts/engine.js')).default;
    engine.postFlash.service.reset();
  });

  it('exposes the singleton service, states, and check ids', () => {
    expect(typeof engine.postFlash.service.dispatchLifecycle).toBe('function');
    expect(typeof engine.postFlash.service.captureSelectedBuild).toBe('function');
    expect(typeof engine.postFlash.service.subscribe).toBe('function');
    expect(typeof engine.postFlash.service.markHandoffShown).toBe('function');
    expect(Object.values(engine.postFlash.POST_FLASH_STATES)).toEqual(
      expect.arrayContaining([
        'not_started', 'in_progress', 'completed',
        'completed_validation_passed', 'completed_validation_failed',
        'completed_validation_unknown', 'failed', 'cancelled',
      ]),
    );
    expect(engine.postFlash.VALIDATION_CHECK_IDS).toHaveLength(5);
  });

  it('the Install step seeds the service with the resolved build and lifecycle', async () => {
    const { InstallStep } = await import('../webflash-2/scripts/install.js');
    const resolved = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    const node = InstallStep({
      device: { name: 'Test device', target: resolved.configString },
      build: resolved.build,
      engine,
      a11y: a11yStub,
      onBack: () => {},
      onFlashed: () => {},
    });
    root.appendChild(node);
    await flush();

    // captureSelectedBuild ran on mount.
    expect(engine.postFlash.service.getSnapshot().selected_config).toBe(resolved.configString);

    // The component's lifecycle events flow into the state machine.
    const host = root.querySelector('esp-web-install-button');
    host.dispatchEvent(stateEvent('preparing'));
    expect(engine.postFlash.service.getStatus()).toBe('in_progress');
    host.dispatchEvent(stateEvent('finished'));
    expect(['completed', 'completed_validation_unknown', 'completed_validation_passed', 'completed_validation_failed'])
      .toContain(engine.postFlash.service.getStatus());
  });
});

describe('PR 7 — ConnectStep renders the post-flash validation panel', () => {
  let engine;
  let ConnectStep;

  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
    engine = (await import('../webflash-2/scripts/engine.js')).default;
    ({ ConnectStep } = await import('../webflash-2/scripts/connect.js'));
    engine.postFlash.service.reset();
  });

  function mountConnect(build) {
    const node = ConnectStep({
      device: { name: build ? build.name : 'Test device', target: build ? build.config_string : '' },
      build: build || null,
      engine,
      a11y: a11yStub,
      onDone: () => {},
      onSkip: () => {},
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(node);
    return { root, node };
  }

  it('renders the not_started state when no flash has run', () => {
    const { root } = mountConnect(IMPROV_BUILD);
    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel).not.toBeNull();
    expect(panel.dataset.state).toBe('not_started');
  });

  it('renders the in_progress state while flashing', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'writing' });
    const { root } = mountConnect(IMPROV_BUILD);
    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel.dataset.state).toBe('in_progress');
    expect(root.querySelector('[data-post-flash-title]').textContent).toMatch(/Installing/i);
  });

  it('shows the Home Assistant handoff only for improv:true builds', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    engine.postFlash.service.__unsafeForceValidationClose();
    const { root } = mountConnect(IMPROV_BUILD);

    const ha = root.querySelector('[data-post-flash-handoff="home-assistant"]');
    expect(ha).not.toBeNull();
    expect(ha.querySelectorAll('.pf-handoff__steps li').length).toBeGreaterThan(0);

    // Wi-Fi handoff describes provisioning over USB, never a credential.
    const wifi = root.querySelector('[data-post-flash-handoff="wifi"]');
    expect(wifi).not.toBeNull();
    expect(wifi.querySelector('[data-wifi-status]').dataset.wifiStatus).not.toBe('unavailable');
  });

  it('hides the Home Assistant handoff for improv:false builds and reports unknown', () => {
    engine.postFlash.service.captureSelectedBuild(NO_IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    engine.postFlash.service.__unsafeForceValidationClose();
    const { root } = mountConnect(NO_IMPROV_BUILD);

    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel.dataset.state).toBe('completed_validation_unknown');
    expect(root.querySelector('[data-post-flash-handoff="home-assistant"]')).toBeNull();

    const wifi = root.querySelector('[data-post-flash-handoff="wifi"]');
    expect(wifi.querySelector('[data-wifi-status]').dataset.wifiStatus).toBe('unavailable');
  });

  it('surfaces a failed validation in the check list', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    engine.postFlash.service.__unsafeApplyImprovInfo({
      firmware: 'NotSense360Firmware',
      version: '2.0.0',
      name: 'unknown-device',
    });
    engine.postFlash.service.__unsafeForceValidationClose();
    const { root } = mountConnect(IMPROV_BUILD);

    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel.dataset.state).toBe('completed_validation_failed');
    const failedRow = root.querySelector('[data-check-id="device_firmware_identity"]');
    expect(failedRow.dataset.checkStatus).toBe('failed');
  });

  it('shows the recovery handoff on a failed flash', () => {
    engine.postFlash.service.dispatchLifecycle({ state: 'preparing' });
    engine.postFlash.service.dispatchLifecycle({ state: 'error', message: 'cable dropped' });
    const { root } = mountConnect(IMPROV_BUILD);

    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel.dataset.state).toBe('failed');
    const recovery = root.querySelector('[data-post-flash-handoff="recovery"]');
    expect(recovery).not.toBeNull();
    expect(recovery.querySelector('[data-rescue-open]')).not.toBeNull();
  });

  it('renders the cancelled state', () => {
    engine.postFlash.service.dispatchLifecycle({ state: 'preparing' });
    engine.postFlash.service.dispatchLifecycle({ state: 'idle' });
    const { root } = mountConnect(IMPROV_BUILD);
    expect(root.querySelector('[data-wf2-post-flash-panel]').dataset.state).toBe('cancelled');
  });

  it('never renders Wi-Fi credentials even when an Improv frame carries them', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    // An Improv frame that (defensively) carries credentials must never reach
    // the snapshot or the rendered panel.
    engine.postFlash.service.dispatchLifecycle({
      state: 'writing',
      improvInfo: {
        firmware: 'Sense360 Modular Platform Firmware',
        version: '2.0.0',
        name: 'core',
        ssid: 'leak-ssid-value',
        password: 'leak-password-value',
      },
      provisioned: true,
    });
    engine.postFlash.service.__unsafeForceValidationClose();
    const { root } = mountConnect(IMPROV_BUILD);

    const text = root.textContent.toLowerCase();
    expect(text).not.toContain('leak-ssid-value');
    expect(text).not.toContain('leak-password-value');
    expect(text).not.toContain('ssid');
  });

  it('live-updates the panel as the state machine progresses', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    const { root } = mountConnect(IMPROV_BUILD);
    expect(root.querySelector('[data-wf2-post-flash-panel]').dataset.state).toBe('not_started');

    engine.postFlash.service.dispatchLifecycle({ state: 'preparing' });
    expect(root.querySelector('[data-wf2-post-flash-panel]').dataset.state).toBe('in_progress');

    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    engine.postFlash.service.__unsafeForceValidationClose();
    expect(root.querySelector('[data-wf2-post-flash-panel]').dataset.state).toMatch(/^completed/);
  });

  it('falls back to an honest notice when the engine is absent (design preview)', () => {
    const node = ConnectStep({
      device: { name: 'Preview device', target: 'Ceiling-POE-VentIQ-RoomIQ' },
      build: null,
      engine: null,
      a11y: a11yStub,
      onDone: () => {},
      onSkip: () => {},
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(node);
    expect(root.querySelector('[data-wf2-post-flash-panel]')).toBeNull();
    expect(root.textContent).toMatch(/published installer/i);
  });
});
