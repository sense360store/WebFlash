/**
 * WF2-FAN-EXPANSION-001 (history) / WF-H1-REIMPORT-CLEAN-001 W1 — the fan
 * bundle surface is delisted; the fan-control gates stay in force.
 *
 * WF-IMPORT-FAN-BUNDLES-001 (#498) imported the five full-composition fan
 * bundles as preview builds and WF2-FAN-EXPANSION-001 surfaced them as kit
 * cards. WF-H1-REIMPORT-CLEAN-001 W1 (decision R-D1) DELISTED all five: they
 * were built before the upstream credential gate (SEC-ESP-BUILD-GATES-001)
 * and cannot be rebuilt on the sanctioned pipeline, so the builds, sources,
 * and kit cards are gone (see the delisted_sources register in
 * firmware/sources.json). The config-driven fan-control and FanDAC address
 * acknowledgements (WF2-FAN-CONTROL-GATES-001, scripts/install.js) key off
 * the resolved build's config_string, not off kit or manifest data, so they
 * remain live code and MUST stay covered for any future fan re-import.
 *
 * This suite proves:
 *   A. the delisted state against the REAL kits.json + manifest.json: no fan
 *      kit card, no fan build, nothing for the engine to resolve;
 *   B. the additive install gate (config-driven) still requires the
 *      fan-control acknowledgement for every fan config and the FanDAC
 *      address acknowledgement for the analog configs — the engine verdict
 *      always dominates;
 *   C. the InstallStep still renders the acknowledgement regions per config;
 *   D. end-to-end with the real engine over a SYNTHETIC manifest carrying a
 *      FanDAC preview build: all four acknowledgements surface and install
 *      stays blocked.
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

// The five delisted fan bundle configs with the kit SKUs that retired with
// them (historical labels; neither exists in the served data any more).
const FAN_CONFIGS = [
  { sku: 'S360-KIT-BATH-P-PWM', config: 'Ceiling-POE-VentIQ-FanPWM-RoomIQ', dac: false },
  { sku: 'S360-KIT-BATH-P-DAC', config: 'Ceiling-POE-VentIQ-FanDAC-RoomIQ', dac: true },
  { sku: 'S360-KIT-KITCHEN-P-REL', config: 'Ceiling-POE-AirIQ-FanRelay-RoomIQ', dac: false },
  { sku: 'S360-KIT-KITCHEN-P-PWM', config: 'Ceiling-POE-AirIQ-FanPWM-RoomIQ', dac: false },
  { sku: 'S360-KIT-KITCHEN-P-DAC', config: 'Ceiling-POE-AirIQ-FanDAC-RoomIQ', dac: true },
];

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
});

// ===========================================================================
// A. The delisted state against the real served data
// ===========================================================================
describe('WF-H1-REIMPORT-CLEAN-001 W1 — the fan bundle surface is fully delisted', () => {
  it.each(FAN_CONFIGS)('$sku and its $config build are gone from kits.json and manifest.json', ({ sku, config }) => {
    expect((kitsJson.kits || []).find((k) => k.sku === sku)).toBeUndefined();
    expect((kitsJson.kits || []).some((k) => k.firmware_config_string === config)).toBe(false);
    expect((manifestJson.builds || []).some((b) => b.config_string === config)).toBe(false);
  });
});

// ===========================================================================
// B. The additive install gate is config-driven (pure helpers)
// ===========================================================================
describe('WF2-FAN-CONTROL-GATES-001 — config-driven acknowledgement requirements stay in force', () => {
  it('every fan config requires the fan-control acknowledgement', () => {
    expect(FAN_CONFIGS).toHaveLength(5);
    FAN_CONFIGS.forEach(({ config }) => {
      expect(configRequiresFanControlAck(config)).toBe(true);
    });
  });

  it('only the FanDAC configs additionally require the address acknowledgement', () => {
    FAN_CONFIGS.forEach(({ config, dac }) => {
      expect(configRequiresDacAddressAck(config)).toBe(dac);
    });
  });

  it('install stays blocked until the required acknowledgements are confirmed (engine dominates)', () => {
    FAN_CONFIGS.forEach(({ config: cfg, dac: isDac }) => {
      // Engine blocking can never be overridden by the additive acknowledgements.
      expect(composeInstallEnabled({ gateCanInstall: false, configString: cfg, fanControlAck: true, dacAddressAck: true })).toBe(false);

      // With the engine passing, the fan-control ack alone is required (and, for
      // the analog configs, the address ack on top of it).
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

  it.each(FAN_CONFIGS.filter((k) => !k.dac))('$sku (non-analog) blocks install until the fan-control ack is checked', async ({ config }) => {
    const root = mountStep(fakeBuild(config), makeFakeEngine({ canInstall: true }));
    await flush();
    const fanAck = root.querySelector('[data-fan-control-ack]');
    expect(fanAck).not.toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).toBeNull();
    expect(installBtnOf(root).disabled).toBe(true);
    check(fanAck);
    expect(installBtnOf(root).disabled).toBe(false);
  });

  it.each(FAN_CONFIGS.filter((k) => k.dac))('$sku (analog) blocks install until BOTH the fan-control and address acks are checked', async ({ config }) => {
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

  it.each(FAN_CONFIGS)('$sku never bypasses a blocking engine verdict even with every ack checked', async ({ config }) => {
    const root = mountStep(fakeBuild(config), makeFakeEngine({ canInstall: false }));
    await flush();
    check(root.querySelector('[data-fan-control-ack]'));
    const dacAck = root.querySelector('[data-dac-address-ack]');
    if (dacAck) check(dacAck);
    expect(installBtnOf(root).disabled).toBe(true);
  });
});

// ===========================================================================
// D. Real engine + DOM: an AirIQ FanDAC config end-to-end over a SYNTHETIC
//    manifest (the real manifest no longer carries any fan build after the
//    WF-H1-REIMPORT-CLEAN-001 W1 delisting; the acknowledgement composition
//    must keep working for any future clean fan re-import).
// ===========================================================================
describe('WF2-FAN-CONTROL-GATES-001 — AirIQ FanDAC config + real engine over a synthetic manifest', () => {
  const a11yStub = { announce: jest.fn(), trapFocus: () => () => {}, restoreFocus: () => {}, getFocusableElements: () => [] };

  const DAC_CONFIG = 'Ceiling-POE-AirIQ-FanDAC-RoomIQ';
  // The wizard_state the retired S360-KIT-KITCHEN-P-DAC kit card used to carry.
  const DAC_WIZARD_STATE = {
    mount: 'ceiling', power: 'poe', bathroom: false,
    airiq: 'airiq', ventiq: 'none', roomiq: 'roomiq',
    fan: 'analog', led: 'none', voice: 'none',
  };

  // Clone the real manifest and graft a synthetic FanDAC preview build onto
  // it, modelled on the real (surviving) LED preview build so the shape stays
  // realistic. This is test input only — the served manifest carries no fan
  // build.
  function makeSyntheticManifest() {
    const synthetic = JSON.parse(JSON.stringify(manifestJson));
    const template = synthetic.builds.find((b) => b.config_string === 'Ceiling-POE-VentIQ-RoomIQ-LED');
    const dacBuild = JSON.parse(JSON.stringify(template));
    dacBuild.config_string = DAC_CONFIG;
    dacBuild.modules = ['AirIQ', 'FanDAC', 'RoomIQ'];
    dacBuild.description = 'Synthetic FanDAC preview build (test only).';
    synthetic.builds.push(dacBuild);
    return synthetic;
  }
  const syntheticManifest = makeSyntheticManifest();

  function makeFetch() {
    return jest.fn((url) => {
      const u = String(url);
      if (u.includes('kits.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsJson) });
      if (u.includes('manifest.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(syntheticManifest) });
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

  it('a FanDAC config surfaces both the fan-control and address acks alongside the preview-channel ack', async () => {
    const engine = (await import('../scripts/engine.js')).default;
    const { InstallStep: FreshInstallStep } = await import('../scripts/install.js');
    const resolved = await engine.state.resolveCompatibleFirmware(DAC_WIZARD_STATE);
    expect(resolved.configString).toBe(DAC_CONFIG);
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

    // Dispose the step so its in-flight integrity verification cannot fire a
    // recompute after jsdom tears down.
    root.firstChild.__dispose();
  });
});
