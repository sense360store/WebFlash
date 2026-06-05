/**
 * WF2-FAN-EXPANSION-001 — surface the five imported fan bundles as kit cards.
 *
 * WF-IMPORT-FAN-BUNDLES-001 (#498) imported the five full-composition fan
 * bundles into manifest.json as preview builds. WF2-FAN-CONTROL-GATES-001 (#497)
 * already added the config-driven fan-control and FanDAC address acknowledgements
 * to the 2.0 install gate (scripts/install.js). This PR only adds the kit cards
 * (scripts/data/kits.json) — the gates fire automatically because they key off
 * the resolved build's config_string, not off the kit.
 *
 * This suite proves, against the REAL engine + the REAL manifest + the REAL
 * kits.json:
 *   A. each new fan kit's wizard_state resolves to its declared preview build;
 *   B. the additive install gate (config-driven) requires the fan-control
 *      acknowledgement for every fan kit and the FanDAC address acknowledgement
 *      for the two analog kits, and install stays blocked until the required
 *      acknowledgements are confirmed — the engine verdict always dominates;
 *   C. the advanced-builder AirIQ/DAC mutex does NOT block the kit-card path
 *      (the kit applies its config directly through the engine resolve).
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeInstallEnabled,
  configRequiresFanControlAck,
  configRequiresDacAddressAck,
  InstallStep,
} from '../scripts/install.js';

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));

// The five fan bundles this PR surfaces, mapped to their declared config string.
const NEW_FAN_KITS = [
  { sku: 'S360-KIT-BATH-P-PWM', config: 'Ceiling-POE-VentIQ-FanPWM-RoomIQ', dac: false },
  { sku: 'S360-KIT-BATH-P-DAC', config: 'Ceiling-POE-VentIQ-FanDAC-RoomIQ', dac: true },
  { sku: 'S360-KIT-KITCHEN-P-REL', config: 'Ceiling-POE-AirIQ-FanRelay-RoomIQ', dac: false },
  { sku: 'S360-KIT-KITCHEN-P-PWM', config: 'Ceiling-POE-AirIQ-FanPWM-RoomIQ', dac: false },
  { sku: 'S360-KIT-KITCHEN-P-DAC', config: 'Ceiling-POE-AirIQ-FanDAC-RoomIQ', dac: true },
];

// All six fan kits = the existing Bathroom Relay bundle plus the five new ones.
const ALL_FAN_KIT_SKUS = ['S360-KIT-BATH-P-REL', ...NEW_FAN_KITS.map((k) => k.sku)];
const DAC_KIT_SKUS = ['S360-KIT-BATH-P-DAC', 'S360-KIT-KITCHEN-P-DAC'];

function findKit(sku) {
  return (kitsJson.kits || []).find((k) => k.sku === sku);
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
});

// ===========================================================================
// A. Real-engine resolution for every new fan kit
// ===========================================================================
describe('WF2-FAN-EXPANSION-001 — new fan kits resolve to real preview builds', () => {
  function makeFetch() {
    return jest.fn((url) => {
      const u = String(url);
      if (u.includes('kits.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsJson) });
      if (u.includes('manifest.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifestJson) });
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
  }

  beforeEach(() => {
    jest.resetModules();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
  });

  it.each(NEW_FAN_KITS)('$sku resolves via the engine to $config (preview, installable)', async ({ sku, config }) => {
    const kit = findKit(sku);
    expect(kit).toBeTruthy();
    expect(kit.firmware_config_string).toBe(config);
    expect(kit.firmware_channel).toBe('preview');

    const engine = (await import('../scripts/engine.js')).default;
    const resolved = await engine.state.resolveCompatibleFirmware(kit.wizard_state);
    expect(resolved.configString).toBe(config);
    expect(resolved.installable).toBe(true);
    expect(resolved.isPreview).toBe(true);
    expect(resolved.channel).toBe('preview');
    expect(resolved.build).toBeTruthy();
  });

  it('the two FanDAC kits resolve even though they combine FanDAC with an air sensor (mutex bypass)', async () => {
    // The advanced-builder AirIQ/DAC mutex (scripts/data.js airiq.conflicts=['dac']
    // + the hard-disable in scripts/identify.js) is a VIEW-only affordance for the
    // module builder. The kit-card path feeds the kit's wizard_state straight
    // through the engine resolve, which never applies that mutex — so the address
    // acknowledgement, not a UI lockout, is the gate. Both DAC kits must resolve.
    const engine = (await import('../scripts/engine.js')).default;
    for (const sku of DAC_KIT_SKUS) {
      const kit = findKit(sku);
      // eslint-disable-next-line no-await-in-loop
      const resolved = await engine.state.resolveCompatibleFirmware(kit.wizard_state);
      expect(resolved.configString).toContain('FanDAC');
      expect(resolved.installable).toBe(true);
      expect(resolved.isPreview).toBe(true);
    }
  });
});

// ===========================================================================
// B. The additive install gate is config-driven (pure helpers + kits.json)
// ===========================================================================
describe('WF2-FAN-EXPANSION-001 — config-driven acknowledgement requirements', () => {
  it('all six fan kits require the fan-control acknowledgement', () => {
    expect(ALL_FAN_KIT_SKUS).toHaveLength(6);
    ALL_FAN_KIT_SKUS.forEach((sku) => {
      const kit = findKit(sku);
      expect(kit).toBeTruthy();
      expect(configRequiresFanControlAck(kit.firmware_config_string)).toBe(true);
    });
  });

  it('only the two FanDAC kits additionally require the address acknowledgement', () => {
    ALL_FAN_KIT_SKUS.forEach((sku) => {
      const kit = findKit(sku);
      const expectDac = DAC_KIT_SKUS.includes(sku);
      expect(configRequiresDacAddressAck(kit.firmware_config_string)).toBe(expectDac);
    });
  });

  it('install stays blocked until the required acknowledgements are confirmed (engine dominates)', () => {
    ALL_FAN_KIT_SKUS.forEach((sku) => {
      const kit = findKit(sku);
      const cfg = kit.firmware_config_string;
      const isDac = DAC_KIT_SKUS.includes(sku);

      // Engine blocking can never be overridden by the additive acknowledgements.
      expect(composeInstallEnabled({ gateCanInstall: false, configString: cfg, fanControlAck: true, dacAddressAck: true })).toBe(false);

      // With the engine passing, the fan-control ack alone is required (and, for
      // the analog kits, the address ack on top of it).
      expect(composeInstallEnabled({ gateCanInstall: true, configString: cfg, fanControlAck: false, dacAddressAck: false })).toBe(false);
      expect(composeInstallEnabled({ gateCanInstall: true, configString: cfg, fanControlAck: true, dacAddressAck: false })).toBe(!isDac);
      expect(composeInstallEnabled({ gateCanInstall: true, configString: cfg, fanControlAck: true, dacAddressAck: true })).toBe(true);
    });
  });
});

// ===========================================================================
// C. The InstallStep renders the right acknowledgement regions per kit
// ===========================================================================
describe('WF2-FAN-EXPANSION-001 — InstallStep gate regions per fan kit (fake engine)', () => {
  const a11yStub = { announce: jest.fn(), trapFocus: () => () => {}, restoreFocus: () => {}, getFocusableElements: () => [] };
  const OK_CAPS = { webSerial: true, secureContext: true, isMobile: false, browserName: 'Chrome' };

  // A controllable engine whose gate verdict is fixed, so the additive view-level
  // acknowledgements can be exercised in isolation (the real provenance / SHA-256
  // machinery can never pass in a unit test). Mirrors wf2-fan-control-gates.test.js.
  function makeFakeEngine({ canInstall = true } = {}) {
    const ID = { BROWSER_SUPPORT: 'browser-support', SECURE_CONTEXT: 'secure-context', MANIFEST_FRESHNESS: 'manifest-freshness', FIRMWARE_VERIFICATION: 'firmware-verification' };
    return {
      state: {
        INSTALL_GATE_CHECK_IDS: ID,
        evaluateInstallGate: () => ({ canInstall, blockingReason: '', checks: [], serviceWorker: { blocking: false } }),
        verifyFirmwareIntegrity: async () => ({ status: 'verified', message: 'ok' }),
        getManifestMetadataForAbout: () => ({}),
      },
      capabilities: { detectCapabilities: () => ({ ...OK_CAPS }), evaluateBrowserReadiness: () => ({ level: 'ok', reasons: [] }) },
      provenance: { validateFirmwareProvenance: () => ({ ok: true, blocking: false, failures: [], summary: 'ok' }) },
      channels: { getRequiredAcknowledgements: () => [], getFirmwareWarnings: () => [], getFirmwareAcknowledgementSignature: () => 'sig' },
      freshness: { checkManifestFreshness: async () => ({ verdict: 'current' }) },
      swUpdate: { getServiceWorkerState: () => ({ updateAvailable: false, updateDismissed: false }), triggerSkipWaitingAndReload: () => {} },
      postFlash: { service: { reset() {}, captureSelectedBuild() {}, dispatchLifecycle() {}, getSnapshot() { return null; } } },
      diagnostics: null,
    };
  }

  // A resolved-build shape with a config_string but no manifestIndex, so the
  // install affordance is the bare (gated) button rather than the ESP Web Tools
  // host — keeps the assertion on installBtn.disabled simple.
  function fakeBuild(config_string) {
    return { config_string, channel: 'preview', version: '1.0.0', firmwareId: 'fw-test' };
  }

  function mountStep(build, engine) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(InstallStep({
      device: { name: 'Test device', target: build.config_string },
      build, engine, a11y: a11yStub, onBack: () => {}, onFlashed: () => {},
    }));
    return root;
  }

  async function flush() {
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function check(el) {
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const installBtnOf = (root) => root.querySelector('.stepnav .btn--lg');

  it.each(NEW_FAN_KITS.filter((k) => !k.dac))('$sku (non-analog) blocks install until the fan-control ack is checked', async ({ config }) => {
    const root = mountStep(fakeBuild(config), makeFakeEngine({ canInstall: true }));
    await flush();
    const fanAck = root.querySelector('[data-fan-control-ack]');
    expect(fanAck).not.toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).toBeNull();
    expect(installBtnOf(root).disabled).toBe(true);
    check(fanAck);
    expect(installBtnOf(root).disabled).toBe(false);
  });

  it.each(NEW_FAN_KITS.filter((k) => k.dac))('$sku (analog) blocks install until BOTH the fan-control and address acks are checked', async ({ config }) => {
    const root = mountStep(fakeBuild(config), makeFakeEngine({ canInstall: true }));
    await flush();
    const fanAck = root.querySelector('[data-fan-control-ack]');
    const dacAck = root.querySelector('[data-dac-address-ack]');
    expect(fanAck).not.toBeNull();
    expect(dacAck).not.toBeNull();
    expect(installBtnOf(root).disabled).toBe(true);
    check(fanAck);
    expect(installBtnOf(root).disabled).toBe(true);
    check(dacAck);
    expect(installBtnOf(root).disabled).toBe(false);
  });

  it.each(NEW_FAN_KITS)('$sku never bypasses a blocking engine verdict even with every ack checked', async ({ config }) => {
    const root = mountStep(fakeBuild(config), makeFakeEngine({ canInstall: false }));
    await flush();
    check(root.querySelector('[data-fan-control-ack]'));
    const dacAck = root.querySelector('[data-dac-address-ack]');
    if (dacAck) check(dacAck);
    expect(installBtnOf(root).disabled).toBe(true);
  });
});

// ===========================================================================
// D. Real engine + DOM: the AirIQ FanDAC kit end-to-end
// ===========================================================================
describe('WF2-FAN-EXPANSION-001 — Kitchen FanDAC kit + real engine', () => {
  const a11yStub = { announce: jest.fn(), trapFocus: () => () => {}, restoreFocus: () => {}, getFocusableElements: () => [] };

  function makeFetch() {
    return jest.fn((url) => {
      const u = String(url);
      if (u.includes('kits.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsJson) });
      if (u.includes('manifest.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifestJson) });
      if (u.includes('.bin')) return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
  }

  async function flush() {
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    jest.resetModules();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
  });

  it('the Kitchen FanDAC kit surfaces both the fan-control and address acks alongside the preview-channel ack', async () => {
    const kit = findKit('S360-KIT-KITCHEN-P-DAC');
    const engine = (await import('../scripts/engine.js')).default;
    const { InstallStep: FreshInstallStep } = await import('../scripts/install.js');
    const resolved = await engine.state.resolveCompatibleFirmware(kit.wizard_state);
    expect(resolved.configString).toBe('Ceiling-POE-AirIQ-FanDAC-RoomIQ');
    expect(resolved.isPreview).toBe(true);
    expect(resolved.installable).toBe(true);

    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(FreshInstallStep({
      device: { name: 'Test device', target: resolved.configString },
      build: resolved.build, engine, a11y: a11yStub, onBack: () => {}, onFlashed: () => {},
    }));
    await flush();

    expect(root.querySelector('[data-fan-control-ack]')).not.toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).not.toBeNull();
    // Additive to (not a replacement for) the engine-owned preview-channel ack:
    // before-you-flash + channel:preview + fan-control + address => four acks.
    expect(root.querySelectorAll('label.ack').length).toBeGreaterThanOrEqual(4);
    expect(root.textContent).toMatch(/preview fan-control firmware/i);
    expect(root.textContent).toMatch(/0x59/);
    // The real gate still blocks (served bytes never match the SHA-256), so the
    // additive acknowledgements can only ever make install stricter, never arm it.
    expect(root.querySelector('.stepnav .btn--lg').disabled).toBe(true);
  });
});
