/**
 * PR 10 (WebFlash 2.0 migration) — Test and audit parity.
 *
 * The Phase 3 binding PRs (4 to 9) each pinned the happy path and the key
 * blocking path for the subsystem they wired. PR 10 brings the 2.0 view bound to
 * the engine up to the SAME test and audit depth the 1.0 view already enjoys, by
 * driving the RENDERED 2.0 components through the full trust matrix the 1.0 Jest
 * suites cover. It is a tests-only PR: no runtime, engine, view, manifest,
 * firmware, service-worker, or workflow file changes.
 *
 * The six dimensions, mapped to the 1.0 suites they reach parity with:
 *
 *   1. Provenance gate — the rendered InstallStep keeps install disarmed and the
 *      Firmware verification row failing whenever static provenance blocks, across
 *      stable / beta / preview / rescue, in the same production trust mode the 1.0
 *      view uses; and the rendered pass copy never claims cryptographic signature
 *      verification (parity with firmware-provenance*.test.js / firmware-signature
 *      .test.js, at the 2.0 view layer).
 *   2. Channel-acknowledgement prune-on-mismatch — the rendered preview ack is
 *      load-bearing (install will not arm without it) and is bound to THIS build's
 *      firmware-identity signature, so a different resolved build re-prompts
 *      (parity with the release-channel acknowledgement contract).
 *   3. Freshness matrix — the rendered InstallStep reflects stale (hard block,
 *      recheck only) and unknown (block until the inline acknowledgement) exactly
 *      as the 1.0 inline freshness controls do (parity with cache-freshness.test.js).
 *   4. Kit-config rejection paths — the 2.0 Identify view surfaces only valid
 *      catalogue kits, routes a kit that resolves to no signed build to the source
 *      path, and shows the empty-catalogue fallback (parity with kit-config.test.js
 *      at the 2.0 view layer; complements the advanced-mode rejection PR 4 pinned).
 *   5. Accessibility focus and modal behaviour — the window bar Help affordance opens a
 *      labelled dialog with a real focus trap and restores focus on Escape, and the
 *      modal traps Tab / Shift+Tab inside itself (parity with a11y-modal-focus
 *      .test.js / a11y-utils.test.js, at the 2.0 view layer).
 *   6. Post-flash states — the ConnectStep renders the two remaining post-flash
 *      states the PR 7 suite did not pin: the transient `completed` state and the
 *      fully validated `completed_validation_passed` state (parity with
 *      post-flash-state-machine.test.js / post-flash-panel.test.js).
 *
 * The view is bound to the REAL engine throughout. Where a test isolates one gate
 * dimension, it stubs only the ASYNC INPUTS the view feeds the engine (the
 * provenance verdict, the SHA-256 integrity result, the freshness verdict, the
 * detected capabilities) while the composition itself (state.evaluateInstallGate)
 * stays the real engine function. Stubbing an input is how the 1.0 gate tests
 * exercise each matrix cell; it never relaxes a gate.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  announce,
  trapFocus,
  restoreFocus,
  getFocusableElements,
} from '../scripts/utils/a11y.js';
import { openModal } from '../scripts/modal.js';

beforeAll(() => {
  // jsdom's default crypto does not always expose subtle.digest; back it with
  // Node's webcrypto so the real verifyFirmwareIntegrity SHA-256 path runs when a
  // test leaves it unstubbed.
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
});

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));
const INSTALL_SRC = readFileSync(join(ROOT, 'scripts', 'install.js'), 'utf8');

const OK_CAPS = Object.freeze({ webSerial: true, secureContext: true, isMobile: false, browserName: 'Chrome' });

// A fetch stub for the app-level Identify tests. Serves a (possibly synthetic)
// kit catalogue and the real on-disk manifest; .bin requests resolve to bytes
// that will not match any SHA-256 (the kit tests never reach the install gate).
function makeFetch(kitsPayload = kitsJson) {
  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('kits.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsPayload) });
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

// Real engine accessibility primitives. The a11y parity tests use these (not
// stubs) so the focus trap and focus restoration are genuinely exercised.
const realA11y = { announce, trapFocus, restoreFocus, getFocusableElements };

// A no-op a11y for the install/post-flash render tests, which assert DOM state,
// not focus behaviour.
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
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// A provenance-complete synthetic build, identity-stable across channels. The
// install gate tests use synthetic builds so they do not depend on the committed
// repo signing key (which is test_only, so the real builds block in production
// mode); the gate composition under test is the real engine function.
function makeBuild(channel = 'preview', overrides = {}) {
  const sha = 'a'.repeat(64);
  return {
    config_string: `Audit-${channel}`,
    channel,
    version: '1.0.0',
    name: 'Sense360 Audit Firmware',
    sha256: sha,
    signature: 'cccccccccccccccccccccccccccccccccccccccccccc=',
    signature_ed25519: 'b'.repeat(86),
    signature_key_id: 'dev-2026-01',
    source_commit: '1234567890abcdef1234567890abcdef12345678',
    source_url: 'https://github.com/sense360store/WebFlash/commit/1234567890abcdef1234567890abcdef12345678',
    file_size: 900000,
    changelog: ['Adds the bench-tested calibration profile for the audit-parity build.'],
    parts: [{ path: 'firmware/test.bin', offset: 0, sha256: sha }],
    ...overrides,
  };
}

// Wraps the real engine, overriding only the async INPUTS the InstallStep feeds
// the gate. The composition (state.evaluateInstallGate), the channel model, the
// check ids, and the post-flash service all stay live references to the real
// engine. Capabilities default to a desktop-Chromium pass and the service worker
// to no-update so a test can isolate the single dimension it targets; jsdom
// reports no Web Serial, so without the capabilities default every gate would
// block on browser support.
function makeTestEngine(base, o = {}) {
  const state = { ...base.state };
  if (o.verifyFirmwareIntegrity) state.verifyFirmwareIntegrity = o.verifyFirmwareIntegrity;
  const provenance = { ...base.provenance };
  if (o.validateFirmwareProvenance) provenance.validateFirmwareProvenance = o.validateFirmwareProvenance;
  const freshness = { ...base.freshness };
  if (o.checkManifestFreshness) freshness.checkManifestFreshness = o.checkManifestFreshness;
  return {
    ...base,
    capabilities: { ...base.capabilities, detectCapabilities: o.detectCapabilities || (() => ({ ...OK_CAPS })) },
    provenance,
    state,
    freshness,
    swUpdate: {
      ...base.swUpdate,
      getServiceWorkerState: () => o.serviceWorker || { updateAvailable: false, updateDismissed: false },
    },
  };
}

// Status of a rendered preflight row, read from the icon class the view assigns
// per engine status (never by parsing the detail copy).
const READY_ICON_STATUS = { 'ready__ico--ok': 'pass', 'ready__ico--wait': 'pending', 'ready__ico--warn': 'warn', 'ready__ico--err': 'fail' };
function readyRow(root, name) {
  return [...root.querySelectorAll('.ready__item')].find(
    (item) => item.querySelector('.ready__name')?.textContent === name,
  ) || null;
}
function readyStatus(root, name) {
  const row = readyRow(root, name);
  if (!row) return null;
  const ico = row.querySelector('.ready__ico');
  for (const cls of Object.keys(READY_ICON_STATUS)) {
    if (ico.classList.contains(cls)) return READY_ICON_STATUS[cls];
  }
  return null;
}

// Toggle a rendered acknowledgement checkbox (before-you-flash, channel, or the
// freshness unknown acknowledgement) by matching its visible text. The view's h()
// onChange binding reads event.target.checked, so set checked then dispatch.
function setAck(label, checked) {
  const input = label.querySelector('input[type="checkbox"]');
  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function findAck(root, matcher) {
  return [...root.querySelectorAll('label.ack')].find((l) => matcher.test(l.textContent)) || null;
}
const BEFORE_FLASH_RE = /keep the hub powered/i;
const FRESHNESS_ACK_RE = /already loaded in this browser/i;
function beforeFlashAck(root) { return findAck(root, BEFORE_FLASH_RE); }
function freshnessUnknownAck(root) { return findAck(root, FRESHNESS_ACK_RE); }
// The channel acknowledgement is the ack that is neither the before-you-flash
// checklist nor the freshness unknown acknowledgement.
function channelAck(root) {
  return [...root.querySelectorAll('label.ack')].find(
    (l) => !BEFORE_FLASH_RE.test(l.textContent) && !FRESHNESS_ACK_RE.test(l.textContent),
  ) || null;
}

async function mountInstall(engine, build, props = {}) {
  const { InstallStep } = await import('../scripts/install.js');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const node = InstallStep({
    device: { name: 'Audit device', target: build ? build.config_string : '' },
    build,
    engine,
    a11y: a11yStub,
    onBack: () => {},
    onFlashed: () => {},
    ...props,
  });
  root.appendChild(node);
  await flush();
  const installBtn = root.querySelector('.stepnav .btn--lg');
  return { root, node, installBtn };
}

// ---------------------------------------------------------------------------
// 1. Provenance gate parity (2.0 view)
// ---------------------------------------------------------------------------
describe('PR 10 — provenance gate parity (2.0 view bound to the engine)', () => {
  let baseEngine;
  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    baseEngine = (await import('../scripts/engine.js')).default;
    baseEngine.postFlash.service.reset();
  });

  // Acceptance: "every blocking provenance check blocks install in the 2.0 view
  // across stable, beta, preview, and rescue." Here the REAL provenance gate runs
  // (only capabilities + freshness are neutralised so provenance is the sole
  // failing row), proving the rendered view honours it for every channel.
  for (const channel of ['stable', 'beta', 'preview', 'rescue']) {
    it(`keeps the Firmware verification row failing and install disarmed for a blocking ${channel} build`, async () => {
      const build = makeBuild(channel);
      delete build.sha256; // strip a critical primitive -> real provenance blocks in any mode
      const engine = makeTestEngine(baseEngine, {
        checkManifestFreshness: async () => ({ verdict: 'current' }),
      });
      // Sanity: the real engine's static gate agrees this build blocks.
      expect(engine.provenance.validateFirmwareProvenance(build, { mode: 'production' }).blocking).toBe(true);

      const { root, installBtn } = await mountInstall(engine, build);
      expect(readyStatus(root, 'Firmware verification')).toBe('fail');
      expect(installBtn).not.toBeNull();
      expect(installBtn.disabled).toBe(true);
    });
  }

  it('renders all four real preflight rows by stable label, not a timer simulation', async () => {
    const engine = makeTestEngine(baseEngine, {
      validateFirmwareProvenance: () => ({ ok: true, blocking: false, failures: [], summary: 'ok' }),
      verifyFirmwareIntegrity: async () => ({ status: 'verified', parts: [] }),
      checkManifestFreshness: async () => ({ verdict: 'current' }),
    });
    const { root } = await mountInstall(engine, makeBuild('stable'));
    const names = [...root.querySelectorAll('.ready__name')].map((el) => el.textContent);
    expect(names).toEqual(
      expect.arrayContaining(['Browser support', 'Secure context', 'Firmware manifest', 'Firmware verification']),
    );
  });

  it('renders the verification pass copy as a non-claim — never asserts signature verification', async () => {
    const engine = makeTestEngine(baseEngine, {
      validateFirmwareProvenance: () => ({ ok: true, blocking: false, failures: [], summary: 'ok' }),
      verifyFirmwareIntegrity: async () => ({ status: 'verified', parts: [] }),
      checkManifestFreshness: async () => ({ verdict: 'current' }),
    });
    const { root } = await mountInstall(engine, makeBuild('stable'));
    expect(readyStatus(root, 'Firmware verification')).toBe('pass');
    const verifyRow = readyRow(root, 'Firmware verification');
    const sub = verifyRow.querySelector('.ready__sub').textContent;
    expect(sub).toMatch(/SHA-256 integrity/i);
    expect(sub).toMatch(/signature metadata present/i);
    // The trust non-claim must hold over the WHOLE rendered step, not just one row.
    expect(root.textContent).not.toMatch(/signature (valid|verified)/i);
  });

  it('drives the gate in production trust mode (the view never relaxes provenance)', () => {
    // Source-level audit pin: the InstallStep hardcodes the production trust mode,
    // matching the 1.0 verifyCurrentFirmwareIntegrity. A regression to a relaxed
    // mode would let dev/test-key signatures through.
    expect(INSTALL_SRC).toMatch(/const\s+GATE_MODE\s*=\s*'production'/);
  });
});

// ---------------------------------------------------------------------------
// 2. Channel-acknowledgement prune-on-mismatch (2.0 view)
// ---------------------------------------------------------------------------
describe('PR 10 — channel acknowledgement prune-on-mismatch (2.0 view)', () => {
  let baseEngine;
  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    baseEngine = (await import('../scripts/engine.js')).default;
    baseEngine.postFlash.service.reset();
  });

  // Every non-acknowledgement gate is satisfied so the preview channel ack is the
  // deciding factor in the rendered view.
  function passingEngine() {
    return makeTestEngine(baseEngine, {
      validateFirmwareProvenance: () => ({ ok: true, blocking: false, failures: [], summary: 'ok' }),
      verifyFirmwareIntegrity: async () => ({ status: 'verified', parts: [] }),
      checkManifestFreshness: async () => ({ verdict: 'current' }),
    });
  }

  it('will not arm install for a preview build until the channel ack is checked', async () => {
    const engine = passingEngine();
    const { root, installBtn } = await mountInstall(engine, makeBuild('preview'));

    // A preview build renders the before-you-flash checklist plus the preview
    // channel acknowledgement.
    expect(channelAck(root)).not.toBeNull();
    expect(installBtn.disabled).toBe(true);

    setAck(beforeFlashAck(root), true);
    await flush();
    // Before-you-flash alone is not enough: the channel ack is still outstanding.
    expect(installBtn.disabled).toBe(true);

    setAck(channelAck(root), true);
    await flush();
    expect(installBtn.disabled).toBe(false);

    // Unchecking the channel ack re-blocks install — it is load-bearing.
    setAck(channelAck(root), false);
    await flush();
    expect(installBtn.disabled).toBe(true);
  });

  it('binds the acknowledgement to THIS build identity, so a different build re-prompts', async () => {
    // The view records each ack against the build's firmware-identity signature.
    // Two builds that differ in identity yield different signatures, which is the
    // prune-on-mismatch the engine gate enforces.
    const buildA = makeBuild('preview', { config_string: 'Audit-preview-A', version: '1.0.0' });
    const buildB = makeBuild('preview', { config_string: 'Audit-preview-B', version: '1.1.0' });
    const sigA = baseEngine.channels.getFirmwareAcknowledgementSignature(buildA);
    const sigB = baseEngine.channels.getFirmwareAcknowledgementSignature(buildB);
    expect(sigA).toBeTruthy();
    expect(sigA).not.toBe(sigB);

    // Arm install for build A.
    const engineA = passingEngine();
    const a = await mountInstall(engineA, buildA);
    setAck(beforeFlashAck(a.root), true);
    setAck(channelAck(a.root), true);
    await flush();
    expect(a.installBtn.disabled).toBe(false);

    // A different resolved build is a fresh InstallStep: the prior ack is not
    // carried, so install starts disarmed and the user must re-acknowledge.
    const engineB = passingEngine();
    const b = await mountInstall(engineB, buildB);
    expect(b.installBtn.disabled).toBe(true);
    expect(channelAck(b.root)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Manifest freshness matrix (2.0 view rendering)
// ---------------------------------------------------------------------------
describe('PR 10 — manifest freshness matrix (2.0 view rendering)', () => {
  let baseEngine;
  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    baseEngine = (await import('../scripts/engine.js')).default;
    baseEngine.postFlash.service.reset();
  });

  // A stable build (no channel ack) with provenance + integrity passing, so the
  // freshness verdict is the only variable the rendered controls react to.
  function freshnessEngine(verdict) {
    return makeTestEngine(baseEngine, {
      validateFirmwareProvenance: () => ({ ok: true, blocking: false, failures: [], summary: 'ok' }),
      verifyFirmwareIntegrity: async () => ({ status: 'verified', parts: [] }),
      checkManifestFreshness: async () => ({ verdict }),
    });
  }

  it('renders a stale manifest as a hard block with a recheck control and no acknowledgement', async () => {
    const engine = freshnessEngine('stale');
    const { root, installBtn } = await mountInstall(engine, makeBuild('stable'));

    expect(readyStatus(root, 'Firmware manifest')).toBe('fail');
    expect([...root.querySelectorAll('button')].some((b) => /recheck manifest freshness/i.test(b.textContent))).toBe(true);
    // Stale is not acknowledgeable — only unknown is.
    expect(freshnessUnknownAck(root)).toBeNull();

    setAck(beforeFlashAck(root), true);
    await flush();
    expect(installBtn.disabled).toBe(true);
  });

  it('renders an unknown manifest as blocking until the inline acknowledgement clears it', async () => {
    const engine = freshnessEngine('unknown');
    const { root, installBtn } = await mountInstall(engine, makeBuild('stable'));

    expect(readyStatus(root, 'Firmware manifest')).toBe('warn');
    expect([...root.querySelectorAll('button')].some((b) => /recheck manifest freshness/i.test(b.textContent))).toBe(true);
    expect(freshnessUnknownAck(root)).not.toBeNull();

    setAck(beforeFlashAck(root), true);
    await flush();
    // Before-you-flash alone leaves the unknown freshness block in place.
    expect(installBtn.disabled).toBe(true);

    setAck(freshnessUnknownAck(root), true);
    await flush();
    expect(readyStatus(root, 'Firmware manifest')).toBe('pass');
    expect(installBtn.disabled).toBe(false);
  });

  it('renders a current manifest as a clean pass with no freshness controls', async () => {
    const engine = freshnessEngine('current');
    const { root } = await mountInstall(engine, makeBuild('stable'));
    expect(readyStatus(root, 'Firmware manifest')).toBe('pass');
    expect(freshnessUnknownAck(root)).toBeNull();
    expect([...root.querySelectorAll('button')].some((b) => /recheck manifest freshness/i.test(b.textContent))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Kit-config rejection paths (2.0 Identify view bound to the engine)
// ---------------------------------------------------------------------------
describe('PR 10 — kit-config rejection paths (2.0 view)', () => {
  // Reproduce the minimal 1.0 form skeleton so the engine setState/getState
  // round-trip works as it does under the ?ui=2 production shell.
  function renderLegacyForm() {
    const radio = (name, value) => `<input type="radio" name="${name}" value="${value}">`;
    document.body.innerHTML = `
      <form>
        ${radio('mounting', 'ceiling')}
        ${radio('power', 'usb')}${radio('power', 'poe')}${radio('power', 'pwr')}
        ${radio('airiq', 'none')}${radio('airiq', 'airiq')}
        ${radio('ventiq', 'none')}${radio('ventiq', 'ventiq')}
        ${radio('roomiq', 'none')}${radio('roomiq', 'roomiq')}
        ${radio('fan', 'none')}${radio('fan', 'relay')}${radio('fan', 'pwm')}${radio('fan', 'analog')}${radio('fan', 'triac')}
        ${radio('voice', 'none')}
        ${radio('led', 'none')}${radio('led', 'led')}
        <input type="checkbox" name="bathroom">
      </form>`;
  }

  async function boot(search, kitsPayload) {
    if (search) window.history.replaceState({}, '', '/' + search);
    global.fetch = makeFetch(kitsPayload);
    const engine = (await import('../scripts/engine.js')).default;
    const app = await import('../scripts/app.js');
    return { engine, app };
  }

  function mountInto(app, engine) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true });
    return root;
  }

  beforeEach(() => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    renderLegacyForm();
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.history.replaceState({}, '', '/');
  });

  it('surfaces only valid catalogue kits and silently drops malformed entries', async () => {
    const payload = {
      schema_version: 1,
      kits: [
        {
          sku: 'S360-KIT-VALID-POE',
          display_name: 'Valid PoE Kit',
          wizard_state: { mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq' },
          firmware_config_string: 'Ceiling-POE-VentIQ-RoomIQ',
        },
        { sku: 'S360-KIT-BROKEN' }, // missing display_name / wizard_state / firmware_config_string
      ],
    };
    const { engine, app } = await boot('?configmode=kit', payload);
    const root = mountInto(app, engine);
    await flush();

    const viewKits = app.__testHooks.getState().kits;
    expect(viewKits).toHaveLength(1);
    expect(viewKits[0].sku).toBe('S360-KIT-VALID-POE');
    // The malformed entry never reaches the rendered catalogue.
    expect(root.textContent).not.toMatch(/S360-KIT-BROKEN/);
  });

  it('routes a kit that resolves to no signed build to the source path and disables Continue', async () => {
    // A USB-power kit is a valid catalogue entry, but no Ceiling-USB build ships,
    // so the engine resolves it to no-build. The kit view must block Continue and
    // route to ESPHome source — the kit-mode analogue of the advanced-mode block.
    const payload = {
      schema_version: 1,
      kits: [
        {
          sku: 'S360-KIT-USB-AUDIT',
          display_name: 'USB Audit Kit',
          wizard_state: { mount: 'ceiling', power: 'usb', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq' },
          firmware_config_string: 'Ceiling-USB-VentIQ-RoomIQ',
        },
      ],
    };
    const { engine, app } = await boot('?configmode=kit&sku=S360-KIT-USB-AUDIT', payload);
    const root = mountInto(app, engine);
    await flush();

    const viewState = app.__testHooks.getState();
    expect(viewState.kit && viewState.kit.sku).toBe('S360-KIT-USB-AUDIT');
    expect(viewState.resolved.installable).toBe(false);
    expect(viewState.resolved.reason).toBe('no-build');

    const continueBtn = root.querySelector('.stepnav .btn--lg');
    expect(continueBtn.disabled).toBe(true);

    const callout = root.querySelector('.callout--warn');
    expect(callout).not.toBeNull();
    expect(callout.textContent).toMatch(/ESPHome YAML/);
    expect(callout.querySelector('a[href*="esphome-public"]')).not.toBeNull();
  });

  it('shows the empty-catalogue fallback when no valid kits load', async () => {
    const { engine, app } = await boot('?configmode=kit', { schema_version: 1, kits: [] });
    const root = mountInto(app, engine);
    await flush();

    expect(app.__testHooks.getState().kits).toHaveLength(0);
    const callout = root.querySelector('.callout--warn');
    expect(callout).not.toBeNull();
    expect(callout.textContent).toMatch(/No kits are available/i);
    // The escape hatch to the advanced builder is always offered.
    expect([...root.querySelectorAll('.linkbtn')].some((b) => /module by module/i.test(b.textContent))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Accessibility focus and modal behaviour (2.0 view, real a11y)
// ---------------------------------------------------------------------------
describe('PR 10 — accessibility focus and modal behaviour (2.0 view)', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.history.replaceState({}, '', '/');
  });

  it('opens the window bar Help affordance as a labelled dialog and restores focus on Escape', async () => {
    const app = await import('../scripts/app.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    // Mount with the REAL engine a11y primitives so the focus trap and restore run.
    app.mountWebFlash2(root, { a11y: realA11y, prefersReducedMotion: () => true });

    const helpBtn = [...root.querySelectorAll('.winbar button')].find((b) => /help/i.test(b.textContent));
    expect(helpBtn).not.toBeNull();
    helpBtn.focus();
    expect(document.activeElement).toBe(helpBtn);

    helpBtn.click();
    const dialog = document.querySelector('.wf2-modal');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId).textContent).toBe('WebFlash help');
    // Focus moved into the dialog.
    expect(dialog.contains(document.activeElement)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.wf2-modal')).toBeNull();
    // Focus restored to the opener.
    expect(document.activeElement).toBe(helpBtn);
  });

  it('traps Tab and Shift+Tab inside the modal (real focus trap)', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const first = document.createElement('button');
    first.textContent = 'First';
    const second = document.createElement('button');
    second.textContent = 'Second';

    openModal({ title: 'WebFlash help', body: [first, second], a11y: realA11y });

    const dialog = document.querySelector('.wf2-modal');
    const focusables = getFocusableElements(dialog);
    expect(focusables.length).toBeGreaterThanOrEqual(3); // close button + the two body buttons
    const firstFocusable = focusables[0];
    const lastFocusable = focusables[focusables.length - 1];

    // Tab from the last focusable wraps to the first.
    lastFocusable.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(firstFocusable);

    // Shift+Tab from the first focusable wraps to the last.
    firstFocusable.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(lastFocusable);
  });

  it('renders a single focusable skip-link target main landmark for the shared skip link', async () => {
    const app = await import('../scripts/app.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    app.mountWebFlash2(root, { a11y: realA11y, prefersReducedMotion: () => true });

    const mains = root.querySelectorAll('main#wf2-main-content');
    expect(mains.length).toBe(1);
    // tabindex="-1" lets the production skip link (href="#wf2-main-content") move
    // focus to the region without making it a tab stop.
    expect(mains[0].getAttribute('tabindex')).toBe('-1');
  });
});

// ---------------------------------------------------------------------------
// 6. Post-flash validation states (2.0 ConnectStep) — the two PR 7 left unpinned
// ---------------------------------------------------------------------------
describe('PR 10 — post-flash validation states (2.0 view)', () => {
  let engine;
  let ConnectStep;
  let serialConnectHandler;

  const IMPROV_BUILD = Object.freeze({
    name: 'Sense360 Modular Platform Firmware',
    version: '2.0.0',
    channel: 'stable',
    config_string: 'Ceiling-POE-VentIQ-RoomIQ',
    improv: true,
  });

  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
    engine = (await import('../scripts/engine.js')).default;
    ConnectStep = (await import('../scripts/connect.js')).ConnectStep;
    engine.postFlash.service.reset();
    serialConnectHandler = null;
  });

  afterEach(() => {
    engine.postFlash.service.reset();
    try { delete navigator.serial; } catch { /* ignore */ }
  });

  function mountConnect(build) {
    const node = ConnectStep({
      device: { name: build.name, target: build.config_string },
      build,
      engine,
      a11y: a11yStub,
      onDone: () => {},
      onSkip: () => {},
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(node);
    return { root };
  }

  // Stub navigator.serial so the post-flash service can bind its connect listener
  // and we can fire a reconnect (jsdom has no real Web Serial). The device_reconnect
  // check stays not_available without this, so completed_validation_passed is
  // otherwise unreachable in jsdom — exactly the caveat post-flash-state-machine
  // .test.js documents.
  function stubSerial() {
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      writable: true,
      value: {
        addEventListener: (type, fn) => { if (type === 'connect') serialConnectHandler = fn; },
        removeEventListener: () => {},
      },
    });
  }

  it('renders the transient completed state while validation is still open', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    // finished moves to COMPLETED and opens validation; without any conclusive
    // signal (and no real Web Serial) the snapshot stays `completed`.
    engine.postFlash.service.dispatchLifecycle({ state: 'writing' });
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    expect(engine.postFlash.service.getStatus()).toBe('completed');

    const { root } = mountConnect(IMPROV_BUILD);
    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel.dataset.state).toBe('completed');
    expect(root.querySelector('[data-post-flash-title]').textContent).toMatch(/Flash completed/i);
    expect(root.querySelector('[data-post-flash-summary]').textContent).toMatch(/came back online/i);
    // `completed` is a handoff state, so the improv build shows the HA handoff.
    expect(root.querySelector('[data-post-flash-handoff="home-assistant"]')).not.toBeNull();
  });

  it('renders completed_validation_passed when every validation check passes', () => {
    stubSerial();
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'writing' });
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    // The connect listener must have bound, or device_reconnect cannot pass.
    expect(typeof serialConnectHandler).toBe('function');

    // Firmware identity + version match, Improv endpoint reachable.
    engine.postFlash.service.__unsafeApplyImprovInfo({
      firmware: 'Sense360-Core',
      version: '2.0.0',
      name: 'core',
    });
    // Wi-Fi provisioning reported done (no credential is read).
    engine.postFlash.service.__unsafeApplyWifiSignal('provisioned');
    // Device reconnected over USB after the flash.
    serialConnectHandler();

    expect(engine.postFlash.service.getStatus()).toBe('completed_validation_passed');

    const { root } = mountConnect(IMPROV_BUILD);
    const panel = root.querySelector('[data-wf2-post-flash-panel]');
    expect(panel.dataset.state).toBe('completed_validation_passed');
    expect(panel.dataset.tone).toBe('success');
    expect(root.querySelector('[data-post-flash-title]').textContent).toMatch(/flashed and verified/i);

    // Every validation row reports OK; none failed.
    const rows = [...root.querySelectorAll('[data-check-id]')];
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.dataset.checkStatus === 'passed')).toBe(true);

    // The Home Assistant handoff shows; the Wi-Fi line reports the honest state
    // and never an SSID or password.
    expect(root.querySelector('[data-post-flash-handoff="home-assistant"]')).not.toBeNull();
    const wifi = root.querySelector('[data-wifi-status]');
    expect(wifi.dataset.wifiStatus).toBe('already_done');
    const text = root.textContent.toLowerCase();
    expect(text).not.toContain('ssid');
    expect(text).not.toContain('password');
  });
});
