/**
 * WF2-FAN-CONTROL-GATES-001 — fan-control and FanDAC address acknowledgements
 * in the 2.0 install gate, plus the Bathroom Relay preview kit.
 *
 * PR 13 deleted the stronger acknowledgements that lived in the old
 * simple-install.js. This restores them in the 2.0 view (scripts/install.js) as
 * ADDITIVE, config-driven, view-level clauses, AND-ed into the flash-enable
 * condition exactly as WF-TRIAC-001 added its advanced/manual-warning
 * acknowledgement to the 1.0 gate. The engine verdict
 * (engine.state.evaluateInstallGate) stays authoritative: these clauses can only
 * make install HARDER, never bypass or weaken it, and they are strictly additive
 * to the engine-owned preview-channel acknowledgement.
 *
 * The suite has three layers:
 *   A. the pure, config-driven gate contract + the recovered copy;
 *   B. a DOM integration with a controllable fake engine, so the additive gate
 *      can be exercised against a passing AND a blocking engine verdict;
 *   C. a DOM integration with the REAL engine over the live manifest + kits.json,
 *      proving the Bathroom Relay kit resolves to the preview FanRelay build and
 *      that the fan-control acknowledgement coexists with the preview-channel one.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeInstallEnabled,
  configRequiresFanControlAck,
  configRequiresDacAddressAck,
  FAN_CONTROL_TOKENS,
  FAN_CONTROL_WARNING,
  FAN_CONTROL_ACK_TEXT,
  FAN_DAC_ADDRESS_WARNING,
  FAN_DAC_ADDRESS_ACK_TEXT,
  InstallStep,
} from '../scripts/install.js';

const STABLE_CONFIG = 'Ceiling-POE-VentIQ-RoomIQ';
const RELAY_CONFIG = 'Ceiling-POE-VentIQ-FanRelay-RoomIQ';
const PWM_CONFIG = 'Ceiling-POE-FanPWM';
const DAC_CONFIG = 'Ceiling-POE-VentIQ-FanDAC-RoomIQ'; // synthetic full-composition FanDAC
const TRIAC_CONFIG = 'Ceiling-POE-VentIQ-FanTRIAC-RoomIQ';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
});

// ===========================================================================
// A. Pure, config-driven gate contract + recovered copy
// ===========================================================================
describe('WF2-FAN-CONTROL-GATES-001 — config-driven acknowledgement requirements', () => {
  it('requires the fan-control acknowledgement for any fan-control token', () => {
    expect(configRequiresFanControlAck(RELAY_CONFIG)).toBe(true);
    expect(configRequiresFanControlAck(PWM_CONFIG)).toBe(true);
    expect(configRequiresFanControlAck(DAC_CONFIG)).toBe(true);
    expect(FAN_CONTROL_TOKENS).toEqual(['FanRelay', 'FanPWM', 'FanDAC']);
  });

  it('does not require the fan-control acknowledgement for non-fan configs', () => {
    expect(configRequiresFanControlAck(STABLE_CONFIG)).toBe(false);
    expect(configRequiresFanControlAck('Ceiling-POE-RoomIQ-LED')).toBe(false);
    expect(configRequiresFanControlAck('Ceiling-POE-AirIQ-RoomIQ')).toBe(false);
    expect(configRequiresFanControlAck('')).toBe(false);
    expect(configRequiresFanControlAck(null)).toBe(false);
  });

  it('keeps TRIAC out of the fan-control token set (it stays build-blocked separately)', () => {
    expect(configRequiresFanControlAck(TRIAC_CONFIG)).toBe(false);
    expect(configRequiresDacAddressAck(TRIAC_CONFIG)).toBe(false);
  });

  it('requires the FanDAC address acknowledgement only for FanDAC configs', () => {
    expect(configRequiresDacAddressAck(DAC_CONFIG)).toBe(true);
    expect(configRequiresDacAddressAck('Ceiling-POE-FanDAC')).toBe(true);
    expect(configRequiresDacAddressAck(RELAY_CONFIG)).toBe(false);
    expect(configRequiresDacAddressAck(PWM_CONFIG)).toBe(false);
    expect(configRequiresDacAddressAck(STABLE_CONFIG)).toBe(false);
  });

  describe('composeInstallEnabled is additive and engine-dominated', () => {
    it('mirrors the engine verdict exactly for a non-fan config (no extra acks)', () => {
      expect(composeInstallEnabled({ gateCanInstall: true, configString: STABLE_CONFIG, fanControlAck: false, dacAddressAck: false })).toBe(true);
      expect(composeInstallEnabled({ gateCanInstall: false, configString: STABLE_CONFIG, fanControlAck: true, dacAddressAck: true })).toBe(false);
    });

    it('requires the fan-control acknowledgement on top of the engine verdict (FanRelay / FanPWM)', () => {
      for (const cfg of [RELAY_CONFIG, PWM_CONFIG]) {
        expect(composeInstallEnabled({ gateCanInstall: true, configString: cfg, fanControlAck: false, dacAddressAck: false })).toBe(false);
        expect(composeInstallEnabled({ gateCanInstall: true, configString: cfg, fanControlAck: true, dacAddressAck: false })).toBe(true);
      }
    });

    it('requires BOTH the fan-control and address acknowledgements for FanDAC', () => {
      expect(composeInstallEnabled({ gateCanInstall: true, configString: DAC_CONFIG, fanControlAck: false, dacAddressAck: false })).toBe(false);
      expect(composeInstallEnabled({ gateCanInstall: true, configString: DAC_CONFIG, fanControlAck: true, dacAddressAck: false })).toBe(false);
      expect(composeInstallEnabled({ gateCanInstall: true, configString: DAC_CONFIG, fanControlAck: false, dacAddressAck: true })).toBe(false);
      expect(composeInstallEnabled({ gateCanInstall: true, configString: DAC_CONFIG, fanControlAck: true, dacAddressAck: true })).toBe(true);
    });

    it('never enables install on the acknowledgements alone — the engine verdict dominates', () => {
      // Engine blocks: no combination of additive acknowledgements can flip it on.
      for (const cfg of [STABLE_CONFIG, RELAY_CONFIG, DAC_CONFIG]) {
        expect(composeInstallEnabled({ gateCanInstall: false, configString: cfg, fanControlAck: true, dacAddressAck: true })).toBe(false);
      }
    });
  });

  describe('recovered (not invented) copy', () => {
    it('the fan-control warning is the installer/developer preview copy with no production / verified claim', () => {
      expect(FAN_CONTROL_WARNING).toMatch(/preview fan-control firmware/i);
      expect(FAN_CONTROL_WARNING).toMatch(/installer and developer validation/i);
      expect(FAN_CONTROL_WARNING).toMatch(/not a normal production install/i);
      expect(FAN_CONTROL_WARNING).toMatch(/not stable, not recommended, and not a customer default/i);
      expect(FAN_CONTROL_WARNING).toMatch(/no hardware, bench, compliance, safety, or commercial-availability/i);
      expect(FAN_CONTROL_ACK_TEXT).toMatch(/fan wiring and my local safety rules/i);
    });

    it('the FanDAC address copy names the 0x58 / 0x5A policy, the forbidden 0x59 (SGP41 on AirIQ / VentIQ), and the pending bench reference', () => {
      for (const copy of [FAN_DAC_ADDRESS_WARNING, FAN_DAC_ADDRESS_ACK_TEXT]) {
        expect(copy).toMatch(/0x58/);
        expect(copy).toMatch(/0x5A/);
        expect(copy).toMatch(/0x59/);
        expect(copy).toMatch(/GP8403/);
        expect(copy).toMatch(/SGP41/);
        expect(copy).toMatch(/AirIQ \/ VentIQ/);
        // FANDAC-I2C-ADDR-001 is referenced as PENDING bench verification — never
        // as a recorded / passed hardware result.
        expect(copy).toMatch(/FANDAC-I2C-ADDR-001/);
        expect(copy).toMatch(/pending bench verification/i);
        expect(copy).toMatch(/not been physically verified/i);
        // No hardware-verified claim anywhere.
        expect(copy).not.toMatch(/hardware[- ]verified/i);
        expect(copy).not.toMatch(/bench[- ]verified/i);
      }
    });
  });
});

// ===========================================================================
// B. DOM integration with a controllable fake engine
// ===========================================================================
describe('WF2-FAN-CONTROL-GATES-001 — additive gate in the InstallStep (fake engine)', () => {
  const a11yStub = { announce: jest.fn(), trapFocus: () => () => {}, restoreFocus: () => {}, getFocusableElements: () => [] };

  const OK_CAPS = { webSerial: true, secureContext: true, isMobile: false, browserName: 'Chrome' };

  // A minimal engine whose install-gate verdict is fully controllable, so the
  // additive view-level acknowledgements can be exercised against a passing AND a
  // blocking engine result without fighting the real provenance / integrity
  // machinery (which can never pass in a unit test). The fake gate IGNORES its
  // inputs — the only thing under test here is the view's additive composition.
  function makeFakeEngine({ canInstall = true, blockingReason = '' } = {}) {
    const ID = {
      BROWSER_SUPPORT: 'browser-support',
      SECURE_CONTEXT: 'secure-context',
      MANIFEST_FRESHNESS: 'manifest-freshness',
      FIRMWARE_VERIFICATION: 'firmware-verification',
    };
    return {
      state: {
        INSTALL_GATE_CHECK_IDS: ID,
        evaluateInstallGate: () => ({ canInstall, blockingReason, checks: [], serviceWorker: { blocking: false } }),
        verifyFirmwareIntegrity: async () => ({ status: 'verified', message: 'ok' }),
        getManifestMetadataForAbout: () => ({}),
      },
      capabilities: {
        detectCapabilities: () => ({ ...OK_CAPS }),
        evaluateBrowserReadiness: () => ({ level: 'ok', reasons: [] }),
      },
      provenance: { validateFirmwareProvenance: () => ({ ok: true, blocking: false, failures: [], summary: 'ok' }) },
      channels: {
        getRequiredAcknowledgements: () => [],
        getFirmwareWarnings: () => [],
        getFirmwareAcknowledgementSignature: () => 'sig',
      },
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
    const node = InstallStep({
      device: { name: 'Test device', target: build ? build.config_string : '' },
      build, engine, a11y: a11yStub, onBack: () => {}, onFlashed: () => {},
    });
    root.appendChild(node);
    return { root, node };
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

  it('renders no fan-control / address regions for a non-fan config and arms install (no regression)', async () => {
    const { root } = mountStep(fakeBuild(STABLE_CONFIG), makeFakeEngine({ canInstall: true }));
    await flush();
    expect(root.querySelector('[data-fan-control-ack]')).toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).toBeNull();
    expect(root.querySelector('[data-fan-control-gates]').children.length).toBe(0);
    expect(installBtnOf(root).disabled).toBe(false);
  });

  it('blocks a FanRelay install until the fan-control acknowledgement is checked', async () => {
    const { root } = mountStep(fakeBuild(RELAY_CONFIG), makeFakeEngine({ canInstall: true }));
    await flush();
    const fanAck = root.querySelector('[data-fan-control-ack]');
    expect(fanAck).not.toBeNull();
    // FanRelay never surfaces the analog-fan address region.
    expect(root.querySelector('[data-dac-address-ack]')).toBeNull();
    // Engine says canInstall, but the additive fan-control ack still blocks.
    expect(installBtnOf(root).disabled).toBe(true);
    check(fanAck);
    expect(installBtnOf(root).disabled).toBe(false);
  });

  it('blocks a FanDAC install until BOTH the fan-control and address acknowledgements are checked', async () => {
    const { root } = mountStep(fakeBuild(DAC_CONFIG), makeFakeEngine({ canInstall: true }));
    await flush();
    const fanAck = root.querySelector('[data-fan-control-ack]');
    const dacAck = root.querySelector('[data-dac-address-ack]');
    expect(fanAck).not.toBeNull();
    expect(dacAck).not.toBeNull();
    expect(installBtnOf(root).disabled).toBe(true);
    check(fanAck);
    // Fan-control alone is not enough for a 0-10V analog fan.
    expect(installBtnOf(root).disabled).toBe(true);
    check(dacAck);
    expect(installBtnOf(root).disabled).toBe(false);
  });

  it('never bypasses a blocking engine verdict, even with every acknowledgement checked', async () => {
    const { root } = mountStep(fakeBuild(DAC_CONFIG), makeFakeEngine({ canInstall: false, blockingReason: 'Engine blocked.' }));
    await flush();
    check(root.querySelector('[data-fan-control-ack]'));
    check(root.querySelector('[data-dac-address-ack]'));
    // The engine verdict dominates: install stays disabled.
    expect(installBtnOf(root).disabled).toBe(true);
  });

  it('surfaces the recovered fan-control + FanDAC address copy in the rendered regions', async () => {
    const { root } = mountStep(fakeBuild(DAC_CONFIG), makeFakeEngine({ canInstall: true }));
    await flush();
    const text = root.textContent;
    expect(text).toMatch(/preview fan-control firmware/i);
    expect(text).toMatch(/0x58/);
    expect(text).toMatch(/0x5A/);
    expect(text).toMatch(/0x59/);
    expect(text).toMatch(/GP8403/);
    expect(text).toMatch(/SGP41/);
    expect(text).toMatch(/FANDAC-I2C-ADDR-001/);
    expect(text).toMatch(/pending bench verification/i);
  });
});

// ===========================================================================
// C. DOM integration with the REAL engine. After WF-H1-REIMPORT-CLEAN-001 W1
//    delisted every fan preview build, the live manifest carries no fan
//    config — so the delisted state is asserted against the REAL files, and
//    the acknowledgement rendering is exercised over a SYNTHETIC manifest
//    (real manifest + grafted FanRelay / FanDAC preview builds modelled on
//    the surviving LED preview build). The gates are config-driven and must
//    keep working for any future clean fan re-import.
// ===========================================================================
describe('WF2-FAN-CONTROL-GATES-001 — fan configs + real engine', () => {
  const ROOT = process.cwd();
  const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));

  const a11yStub = { announce: jest.fn(), trapFocus: () => () => {}, restoreFocus: () => {}, getFocusableElements: () => [] };

  const KITCHEN_RELAY_CONFIG = 'Ceiling-POE-AirIQ-FanRelay-RoomIQ';
  const VENTIQ_DAC_CONFIG = 'Ceiling-POE-VentIQ-FanDAC-RoomIQ';

  // Test input only — the served manifest carries no fan build.
  function makeSyntheticManifest() {
    const synthetic = JSON.parse(JSON.stringify(manifestJson));
    const template = synthetic.builds.find((b) => b.config_string === 'Ceiling-POE-VentIQ-RoomIQ-LED');
    for (const [config, modules] of [
      [KITCHEN_RELAY_CONFIG, ['AirIQ', 'FanRelay', 'RoomIQ']],
      [VENTIQ_DAC_CONFIG, ['VentIQ', 'FanDAC', 'RoomIQ']],
    ]) {
      const build = JSON.parse(JSON.stringify(template));
      build.config_string = config;
      build.modules = modules;
      build.description = 'Synthetic fan preview build (test only).';
      synthetic.builds.push(build);
    }
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

  async function mountForState(wizardState) {
    const engine = (await import('../scripts/engine.js')).default;
    const { InstallStep: FreshInstallStep } = await import('../scripts/install.js');
    const resolved = await engine.state.resolveCompatibleFirmware(wizardState);
    const root = document.createElement('div');
    document.body.appendChild(root);
    const node = FreshInstallStep({
      device: { name: 'Test device', target: resolved.configString },
      build: resolved.build, engine, a11y: a11yStub, onBack: () => {}, onFlashed: () => {},
    });
    root.appendChild(node);
    await flush();
    return { root, resolved };
  }

  it('every relay kit card and fan build is delisted from the REAL kits.json and manifest.json', () => {
    // The Bathroom Relay kit (S360-KIT-BATH-P-REL) retired with its stale
    // v1.0.0-preview build; the Kitchen Relay kit (S360-KIT-KITCHEN-P-REL)
    // and every other fan bundle delisted at WF-H1-REIMPORT-CLEAN-001 W1
    // (pre-credential-gate binaries, decision R-D1).
    expect((kitsJson.kits || []).find((k) => k.sku === 'S360-KIT-BATH-P-REL')).toBeUndefined();
    expect((kitsJson.kits || []).find((k) => k.sku === 'S360-KIT-KITCHEN-P-REL')).toBeUndefined();
    expect((manifestJson.builds || []).find((b) => b.config_string === RELAY_CONFIG)).toBeUndefined();
    expect((manifestJson.builds || []).find((b) => b.config_string === KITCHEN_RELAY_CONFIG)).toBeUndefined();
    expect((manifestJson.builds || []).some((b) => /Fan(Relay|PWM|DAC|TRIAC)/.test(b.config_string))).toBe(false);
  });

  it('renders the fan-control acknowledgement (not the address one) for a FanRelay config, alongside the preview channel ack', async () => {
    // The wizard_state the retired Kitchen Relay kit card used to carry,
    // resolved over the synthetic manifest.
    const { root, resolved } = await mountForState({
      mount: 'ceiling', power: 'poe', bathroom: false, roomiq: 'roomiq', airiq: 'airiq', ventiq: 'none', fan: 'relay', led: 'none', voice: 'none',
    });
    expect(resolved.configString).toBe(KITCHEN_RELAY_CONFIG);
    expect(resolved.isPreview).toBe(true);
    expect(resolved.installable).toBe(true);

    expect(root.querySelector('[data-fan-control-ack]')).not.toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).toBeNull();
    // Additive to (not a replacement for) the engine-owned preview-channel ack:
    // before-you-flash + channel:preview + fan-control => at least three acks.
    expect(root.querySelectorAll('label.ack').length).toBeGreaterThanOrEqual(3);
    expect(root.textContent).toMatch(/preview/i);
    expect(root.textContent).toMatch(/preview fan-control firmware/i);
    // The real gate still blocks here (served bytes never match the SHA-256), so
    // install cannot be armed — the additive ack only ever makes it stricter.
    const installBtn = root.querySelector('.stepnav .btn--lg');
    expect(installBtn.disabled).toBe(true);
  });

  it('a real Advanced-builder FanDAC config surfaces both the fan-control and address acknowledgements', async () => {
    // Reached through the Advanced builder (fan = analog), proving the gate is
    // config-driven rather than kit-driven. Retargeted twice: from the
    // standalone Ceiling-POE-FanDAC manual preview (retired with the stale
    // v1.0.0-preview batch) to the VentIQ FanDAC room bundle, now grafted
    // into the synthetic manifest after WF-H1-REIMPORT-CLEAN-001 W1 delisted
    // the real fan builds.
    const { root, resolved } = await mountForState({
      mount: 'ceiling', power: 'poe', bathroom: true, roomiq: 'roomiq', airiq: 'none', ventiq: 'ventiq', fan: 'analog', led: 'none', voice: 'none',
    });
    expect(resolved.configString).toContain('FanDAC');
    expect(resolved.installable).toBe(true);
    expect(root.querySelector('[data-fan-control-ack]')).not.toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).not.toBeNull();
    expect(root.textContent).toMatch(/FANDAC-I2C-ADDR-001/);
    expect(root.textContent).toMatch(/0x59/);
  });

  it('the stable Release-One config surfaces neither additive acknowledgement (no regression)', async () => {
    const { root, resolved } = await mountForState({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    expect(resolved.configString).toBe(STABLE_CONFIG);
    expect(root.querySelector('[data-fan-control-ack]')).toBeNull();
    expect(root.querySelector('[data-dac-address-ack]')).toBeNull();
    expect(root.querySelector('[data-fan-control-gates]').children.length).toBe(0);
  });
});
