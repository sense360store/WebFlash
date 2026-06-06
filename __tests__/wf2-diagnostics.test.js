/**
 * PR 9 (WebFlash 2.0 migration) — Diagnostics and support bundle.
 *
 * Covers the wiring PR 9 adds so the 2.0 view (mounted under ?ui=2) exposes the
 * engine's redacted schema_version:1 support bundle on the same surfaces the 1.0
 * view does:
 *   - the 2.0 view installs its own support-bundle state provider at mount, so
 *     the bundle reflects the 2.0 resolved build and kit / custom selection. The
 *     1.0 provider in state.js reads the 1.0 render-layer globals
 *     (window.currentFirmware / window.currentConfigString) that the 2.0 view
 *     never populates, so without this the firmware section would be empty;
 *   - the view wires the delegated copy / download action handler
 *     (initSupportBundleActions) so the [data-copy-support-bundle] /
 *     [data-download-support-bundle] controls work — the same controls the 2.0
 *     preflight panel and the reused 1.0 rescue + error-log modals render;
 *   - the preflight panel exposes the copy / download actions;
 *   - the bundle matches the 1.0 schema by section and field, redacts the
 *     required categories, and never leaks a firmware binary, a raw sha256 /
 *     signature value, or a Wi-Fi password.
 *
 * The bundle builder, every section, and the redaction all live in the engine
 * (scripts/services/diagnostics.js); the suites under __tests__/diagnostics-*.js
 * pin the builder and the redactor directly. This file pins the 2.0 *wiring* and
 * the resulting bundle's fidelity to the 2.0 view's own state.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));
const RELEASE_ONE_KIT_SKU = kitsJson.kits[0].sku;
const RELEASE_ONE_CONFIG = 'Ceiling-POE-VentIQ-RoomIQ';

// The 1.0 top-level bundle sections, mirrored from __tests__/diagnostics-bundle.test.js,
// plus the configuration + service_worker sections the builder also emits.
const TOP_LEVEL_SECTIONS = [
  'app', 'environment', 'manifest', 'firmware', 'wizard', 'configuration',
  'preflight', 'recovery', 'cache', 'service_worker', 'flash', 'post_flash',
  'missing_firmware',
];

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
      // Arbitrary bytes — enough to let the InstallStep async preflight run
      // without an unhandled rejection. The support actions render and work
      // independent of the integrity verdict.
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

const a11yStub = {
  announce: () => {},
  trapFocus: () => () => {},
  restoreFocus: () => {},
  getFocusableElements: () => [],
};

// The ?ui=2 production shell renders the (hidden) 1.0 markup, so the engine's
// setState/getState round-trip through the real form inputs exactly as it does
// live. Reproduce the minimal 1.0 form skeleton so share-link hydration behaves
// as in production.
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

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Import the engine + view fresh, after the test URL is in place, so the engine
// reads the share link under test.
async function boot(search = '') {
  if (search) {
    window.history.replaceState({}, '', '/' + search);
  }
  const engine = (await import('../scripts/engine.js')).default;
  const app = await import('../scripts/app.js');
  return { engine, app };
}

function mountInto(app, engine, extra = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true, ...extra });
  return root;
}

// Boot the view in kit mode on the Release-One SKU and let it resolve the build.
async function bootResolvedKit() {
  const { engine, app } = await boot(`?ui=2&configmode=kit&sku=${RELEASE_ONE_KIT_SKU}`);
  const root = mountInto(app, engine);
  await flush();
  return { engine, app, root };
}

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  if (Object.prototype.hasOwnProperty.call(navigator, 'clipboard')) {
    delete navigator.clipboard;
  }
  jest.restoreAllMocks();
});

describe('PR 9 — the 2.0 view installs a support-bundle provider at mount', () => {
  it('builds a schema_version:1 bundle that reflects the 2.0 resolved build', async () => {
    const { engine, app } = await bootResolvedKit();
    // The kit selection resolved a real manifest build through the pure lookup.
    expect(app.__testHooks.getState().resolved.configString).toBe(RELEASE_ONE_CONFIG);

    const bundle = engine.diagnostics.buildSupportBundle();
    expect(bundle.schema_version).toBe(1);
    // The firmware section is populated from the 2.0 resolved build, not from the
    // 1.0 window.currentFirmware global (which the 2.0 view never sets).
    expect(bundle.firmware.selected_config).toBe(RELEASE_ONE_CONFIG);
    expect(bundle.firmware.channel).toBe('stable');
    expect(bundle.firmware.selected_channel).toBe('stable');
    // Release-One is the channel model's default-selectable pick, so it reads as
    // the recommended default — matching the 1.0 bundle.
    expect(bundle.firmware.recommended).toBe(true);
  });

  it('reflects the live kit / custom configuration mode in the bundle', async () => {
    const { engine } = await bootResolvedKit();
    const bundle = engine.diagnostics.buildSupportBundle();
    expect(bundle.configuration.mode).toBe('kit');
    expect(bundle.configuration.sku).toBe(RELEASE_ONE_KIT_SKU.toUpperCase());
    expect(bundle.configuration.kit_display_name).toBe(kitsJson.kits[0].display_name);
    expect(bundle.configuration.resolved_firmware_config).toBe(RELEASE_ONE_CONFIG);
  });

  it('populates the manifest section from the engine metadata, not "unknown"', async () => {
    const { engine } = await bootResolvedKit();
    const bundle = engine.diagnostics.buildSupportBundle();
    expect(bundle.manifest.manifest_version).toBe(manifestJson.manifest_version);
    expect(bundle.manifest.generated_at).toBe(manifestJson.generated_at);
    expect(bundle.manifest.source_commit).toBe(manifestJson.source_commit);
  });

  it('reports the 2.0 three-step flow in the wizard section', async () => {
    const { engine, app } = await bootResolvedKit();
    app.__testHooks.goTo(1); // advance to the Install step
    const bundle = engine.diagnostics.buildSupportBundle();
    expect(bundle.wizard.current_step).toBe(2);
    expect(bundle.wizard.max_reachable_step).toBeGreaterThanOrEqual(2);
  });
});

describe('PR 9 — preflight panel exposes copy and download actions', () => {
  async function mountInstallStep() {
    const { engine, app, root } = await bootResolvedKit();
    app.__testHooks.goTo(1);
    await flush();
    return { engine, app, root };
  }

  it('renders the copy and download support-bundle controls in the preflight panel', async () => {
    const { root } = await mountInstallStep();
    const support = root.querySelector('[data-wf2-support]');
    expect(support).not.toBeNull();
    expect(support.querySelector('[data-copy-support-bundle]')).not.toBeNull();
    expect(support.querySelector('[data-download-support-bundle]')).not.toBeNull();
    // Honest, no-claim copy: it never implies cryptographic signature verification.
    expect(support.textContent).toMatch(/redacted/i);
    expect(support.textContent).not.toMatch(/signature (valid|verified)/i);
  });

  it('copies a schema_version:1 bundle when the copy control is clicked', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { root } = await mountInstallStep();
    const copyBtn = root.querySelector('[data-wf2-support] [data-copy-support-bundle]');
    copyBtn.click();
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(payload.schema_version).toBe(1);
    expect(payload.firmware.selected_config).toBe(RELEASE_ONE_CONFIG);
    expect(copyBtn.dataset.copyState).toBe('success');
  });

  it('downloads the bundle when the download control is clicked', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    // The real downloadJsonFile clicks a temporary <a download>; jsdom cannot
    // navigate, so stub the anchor click (the download wiring is proven by the
    // object-URL creation and the success state, not by a real file save).
    const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const { root } = await mountInstallStep();
      const downloadBtn = root.querySelector('[data-wf2-support] [data-download-support-bundle]');
      downloadBtn.click();
      await flush();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(downloadBtn.dataset.copyState).toBe('success');
    } finally {
      anchorClick.mockRestore();
      delete global.URL.createObjectURL;
      delete global.URL.revokeObjectURL;
    }
  });
});

describe('PR 9 — rescue / recovery modal and error log modal surfaces', () => {
  // These are the unchanged 1.0 modals (scripts/layout/rescue-modal.js and
  // error-log-modal.js) that the production shell reuses under ?ui=2. They ship
  // the [data-copy-support-bundle] / [data-download-support-bundle] controls; PR 9
  // makes them work under ?ui=2 by calling initSupportBundleActions at mount.
  it('copies the 2.0 bundle from the rescue / recovery modal', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { engine, app } = await boot(`?ui=2&configmode=kit&sku=${RELEASE_ONE_KIT_SKU}`);
    const { openRescueModal, __testHooks } = await import('../scripts/layout/rescue-modal.js');
    try {
      const root = mountInto(app, engine, { recovery: { openRescueModal } });
      await flush();

      root.querySelector('.winbar [data-rescue-open]').click();
      const modal = document.querySelector('.rescue-modal');
      expect(modal).not.toBeNull();

      const copyBtn = modal.querySelector('[data-copy-support-bundle]');
      expect(copyBtn).not.toBeNull();
      copyBtn.click();
      await flush();

      expect(writeText).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(writeText.mock.calls[0][0]);
      expect(payload.schema_version).toBe(1);
      expect(payload.firmware.selected_config).toBe(RELEASE_ONE_CONFIG);
    } finally {
      __testHooks.reset();
    }
  });

  it('downloads the 2.0 bundle from the error log modal', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = jest.fn();
    const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { engine, app } = await boot('?ui=2');
    const { openErrorLogModal } = await import('../scripts/layout/error-log-modal.js');
    try {
      mountInto(app, engine);
      await flush();

      openErrorLogModal();
      const modal = document.querySelector('.error-log-modal');
      expect(modal).not.toBeNull();

      const downloadBtn = modal.querySelector('[data-download-support-bundle]');
      expect(downloadBtn).not.toBeNull();
      downloadBtn.click();
      await flush();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(downloadBtn.dataset.copyState).toBe('success');
    } finally {
      anchorClick.mockRestore();
      delete global.URL.createObjectURL;
      delete global.URL.revokeObjectURL;
      document.querySelector('.error-log-modal')?.remove();
    }
  });
});

describe('PR 9 — bundle schema parity and redaction', () => {
  it('carries the same top-level sections as the 1.0 bundle', async () => {
    const { engine } = await bootResolvedKit();
    const bundle = engine.diagnostics.buildSupportBundle();
    TOP_LEVEL_SECTIONS.forEach((key) => {
      expect(bundle).toHaveProperty(key);
      expect(typeof bundle[key]).toBe('object');
    });
  });

  it('never leaks the resolved build raw sha256 or signature values', async () => {
    const { engine, app } = await bootResolvedKit();
    const build = app.__testHooks.getState().resolved.build;
    // The real Release-One build ships these primitives; the bundle reports their
    // presence as booleans and must never serialize the raw values.
    expect(typeof build.sha256).toBe('string');
    expect(build.sha256.length).toBeGreaterThan(0);

    const bundle = engine.diagnostics.buildSupportBundle();
    const serialized = JSON.stringify(bundle);

    expect(bundle.firmware.sha256_present).toBe(true);
    expect(bundle.firmware.ed25519_signature_present).toBe(true);
    expect(serialized).not.toContain(build.sha256);
    if (build.signature) {
      expect(serialized).not.toContain(build.signature);
    }
    if (build.signature_ed25519) {
      expect(serialized).not.toContain(build.signature_ed25519);
    }
    // No firmware binary path or parts blob rides along in the firmware section.
    expect(bundle.firmware).not.toHaveProperty('parts');
  });

  it('redacts a URL query string end to end through the wired bundle', async () => {
    const { engine } = await boot('?ui=2');
    // Adversarial provider: a firmware identity whose source_url carries a secret
    // in the query string. The URL-keyed redaction must strip it.
    engine.diagnostics.setSupportBundleStateProvider(() => ({
      currentFirmware: {
        config_string: 'Ceiling-POE-VentIQ-RoomIQ',
        version: '1.0.0',
        channel: 'stable',
        source_url: 'https://github.com/o/r/commit/abc123?token=SUPERSECRET&x=1',
      },
    }));
    const bundle = engine.diagnostics.buildSupportBundle();
    expect(bundle.firmware.source_url).toBe('https://github.com/o/r/commit/abc123?[REDACTED_QUERY]');
    expect(JSON.stringify(bundle)).not.toContain('SUPERSECRET');
  });

  it('exposes the engine redactor, which strips passwords, tokens, MACs, and paths', async () => {
    const { engine } = await boot('?ui=2');
    const { redactValue, REDACTION_PLACEHOLDERS } = engine.diagnostics;
    const redacted = redactValue({
      wifi_password: 'hunter2',
      api_token: 'abcd.efgh.ijkl',
      device_mac: 'AA:BB:CC:DD:EE:FF',
      log_path: '/home/neil/secret/firmware.bin',
    });
    expect(redacted.wifi_password).toBe(REDACTION_PLACEHOLDERS.PASSWORD);
    expect(redacted.api_token).toBe(REDACTION_PLACEHOLDERS.TOKEN);
    expect(redacted.device_mac).toBe(REDACTION_PLACEHOLDERS.MAC);
    expect(redacted.log_path).toBe(REDACTION_PLACEHOLDERS.PATH);
  });
});
