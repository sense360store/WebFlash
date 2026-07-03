/**
 * PR 5 (WebFlash 2.0 migration) — Install gate on the real engine.
 *
 * Covers the bindings PR 5 adds, replacing the simulated readiness checklist
 * (the CHECKS array that auto-passed on setTimeout) with the real composite
 * install gate:
 *
 *   - engine.state.evaluateInstallGate composes provenance, SHA-256 integrity,
 *     manifest freshness, service-worker update, the seven-tier channel
 *     acknowledgement (bound to the firmware-identity signature), and the
 *     before-you-flash acknowledgement into one machine-readable result keyed by
 *     INSTALL_GATE_CHECK_IDS;
 *   - engine.state.verifyFirmwareIntegrity verifies the downloaded bytes against
 *     the manifest SHA-256 via SubtleCrypto without touching the DOM;
 *   - the 2.0 InstallStep renders the preflight panel by stable check id and arms
 *     install only when the gate passes;
 *   - the CHECKS simulation is gone from scripts/data.js.
 *
 * Node 22's crypto.webcrypto.subtle implements the same Web Crypto SHA-256
 * surface the wizard uses, so we patch globalThis.crypto to exercise the real
 * integrity verifier.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { webcrypto, createHash, createPrivateKey, sign as nodeSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  evaluateInstallGate,
  INSTALL_GATE_CHECK_IDS,
  verifyFirmwareIntegrity,
} from '../scripts/state.js';
import { validateFirmwareProvenance } from '../scripts/utils/firmware-provenance.js';
import {
  getRequiredAcknowledgements,
  getFirmwareAcknowledgementSignature,
} from '../scripts/utils/release-channels.js';

beforeAll(() => {
  // jsdom's default crypto does not always expose subtle.digest; back it with
  // Node's webcrypto so verifyFirmwareIntegrity's SHA-256 path runs for real.
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
});

const OK_CAPS = Object.freeze({ webSerial: true, secureContext: true, isMobile: false, browserName: 'Chrome' });

// Sign fixture bytes with the committed dev-2026-01 test_only key (its private
// half is in the repo precisely so tests can exercise the REAL verification
// path end to end). Development mode accepts it; production mode refuses it.
function loadDevPrivateKey() {
  const raw = readFileSync(join(process.cwd(), 'firmware-signing/keys/dev-2026-01-private.raw.b64'), 'utf8').trim();
  const seed = Buffer.from(raw, 'base64');
  // Ed25519 PKCS#8 wrapper for a raw 32-byte private key seed.
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
}

function signWithDevKey(messageBytes) {
  return nodeSign(null, Buffer.from(messageBytes), loadDevPrivateKey()).toString('base64');
}

// A provenance-complete build. Production mode rejects the committed dev
// (test_only) signing key for stable/rescue, so the gate-composition tests use
// development mode where a complete dev-signed build passes; the blocking-path
// tests strip a critical field, which blocks in any mode and any channel.
function makeBuild(channel = 'preview', overrides = {}) {
  const sha = 'a'.repeat(64);
  return {
    config_string: `Test-${channel}`,
    channel,
    version: '1.0.0',
    sha256: sha,
    signature: 'cccccccccccccccccccccccccccccccccccccccccccc=',
    signature_ed25519: 'b'.repeat(86),
    signature_key_id: 'dev-2026-01',
    source_commit: '1234567890abcdef1234567890abcdef12345678',
    source_url: 'https://github.com/sense360store/WebFlash/commit/1234567890abcdef1234567890abcdef12345678',
    file_size: 900000,
    changelog: ['Adds the bench-tested room sensing calibration profile for the preview channel.'],
    parts: [{ path: 'firmware/test.bin', offset: 0, sha256: sha }],
    ...overrides,
  };
}

function gateInputs(overrides = {}) {
  return {
    build: makeBuild('preview'),
    capabilities: OK_CAPS,
    provenance: { ok: true, blocking: false, failures: [], summary: 'ok' },
    // The Ed25519 verdict is now enforced: a 'verified' integrity result must
    // carry a passing signature verdict (verifyFirmwareIntegrity produces
    // one), or the gate fails closed.
    integrity: { status: 'verified', message: 'ok', signature: { ok: true, code: 'verified' } },
    freshness: { verdict: 'current', acknowledged: false },
    serviceWorker: { updateAvailable: false, updateDismissed: false },
    acknowledgements: { required: [], signature: null, accepted: {} },
    beforeFlashAcknowledged: true,
    ...overrides,
  };
}

describe('PR 5 — evaluateInstallGate (engine-owned composition)', () => {
  it('arms install when every gate component is satisfied', () => {
    const gate = evaluateInstallGate(gateInputs());
    expect(gate.canInstall).toBe(true);
    expect(gate.blockingReason).toBe('');
  });

  it('renders exactly the four preflight rows keyed by stable check id', () => {
    const gate = evaluateInstallGate(gateInputs());
    expect(gate.checks.map((c) => c.id)).toEqual([
      INSTALL_GATE_CHECK_IDS.BROWSER_SUPPORT,
      INSTALL_GATE_CHECK_IDS.SECURE_CONTEXT,
      INSTALL_GATE_CHECK_IDS.MANIFEST_FRESHNESS,
      INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION,
    ]);
  });

  describe('blocking provenance blocks install across every channel', () => {
    // Acceptance: "every blocking provenance check blocks install in the 2.0
    // view across stable, beta, preview, and rescue". A complete build minus a
    // critical primitive (sha256) blocks in validateFirmwareProvenance for every
    // channel, and the composed gate must refuse install + fail the verify row.
    for (const channel of ['stable', 'beta', 'preview', 'rescue']) {
      it(`blocks a ${channel} build whose provenance is blocking`, () => {
        const build = makeBuild(channel);
        delete build.sha256;
        const provenance = validateFirmwareProvenance(build, { mode: 'production' });
        expect(provenance.blocking).toBe(true);

        const gate = evaluateInstallGate(gateInputs({ build, provenance }));
        const verifyRow = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION);
        expect(verifyRow.status).toBe('fail');
        expect(verifyRow.blocking).toBe(true);
        expect(gate.canInstall).toBe(false);
      });
    }

    it('lets a provenance-clean build of any channel through (development mode)', () => {
      for (const channel of ['stable', 'beta', 'preview', 'rescue']) {
        const build = makeBuild(channel);
        const provenance = validateFirmwareProvenance(build, { mode: 'development' });
        expect(provenance.ok).toBe(true);
        // Satisfy any channel acknowledgement this build requires.
        const required = getRequiredAcknowledgements(build);
        const signature = getFirmwareAcknowledgementSignature(build);
        const accepted = {};
        required.forEach((a) => { accepted[a.key] = signature; });
        const gate = evaluateInstallGate(gateInputs({
          build, provenance,
          acknowledgements: { required, signature, accepted },
        }));
        expect(gate.canInstall).toBe(true);
      }
    });
  });

  describe('firmware verification row enforces SHA-256 integrity AND Ed25519 authenticity', () => {
    it('is pending (blocking) while integrity has not resolved', () => {
      const gate = evaluateInstallGate(gateInputs({ integrity: null }));
      const verifyRow = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION);
      expect(verifyRow.status).toBe('pending');
      expect(gate.canInstall).toBe(false);
    });

    it('fails when the SHA-256 integrity check failed', () => {
      const gate = evaluateInstallGate(gateInputs({ integrity: { status: 'failed', message: 'SHA-256 mismatch' } }));
      const verifyRow = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION);
      expect(verifyRow.status).toBe('fail');
      expect(gate.canInstall).toBe(false);
    });

    it('passes and claims Ed25519 verification only when the signature verdict passed', () => {
      const gate = evaluateInstallGate(gateInputs());
      const verifyRow = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION);
      expect(verifyRow.status).toBe('pass');
      expect(verifyRow.detail).toMatch(/SHA-256 integrity/i);
      expect(verifyRow.detail).toMatch(/Ed25519 signature verified/i);
      expect(gate.canInstall).toBe(true);
    });

    it('fails closed when the bytes verified but the Ed25519 verdict failed', () => {
      const gate = evaluateInstallGate(gateInputs({
        integrity: {
          status: 'verified',
          message: 'ok',
          signature: { ok: false, code: 'signature_invalid', message: 'Firmware authenticity verification failed.' },
        },
      }));
      const verifyRow = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION);
      expect(verifyRow.status).toBe('fail');
      expect(verifyRow.blocking).toBe(true);
      expect(verifyRow.detail).toMatch(/authenticity verification failed/i);
      expect(gate.canInstall).toBe(false);
      expect(gate.blockingReason).toMatch(/authenticity verification failed/i);
    });

    it('fails closed when a verified integrity result carries NO Ed25519 verdict at all', () => {
      // A composition that skipped signature verification (the pre-enforcement
      // shape) must not arm install: an unverified signature is not a passed
      // signature.
      const gate = evaluateInstallGate(gateInputs({ integrity: { status: 'verified', message: 'ok' } }));
      const verifyRow = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.FIRMWARE_VERIFICATION);
      expect(verifyRow.status).toBe('fail');
      expect(verifyRow.detail).toMatch(/authenticity has not been verified/i);
      expect(gate.canInstall).toBe(false);
    });
  });

  describe('channel acknowledgement prunes on a firmware-identity mismatch', () => {
    const build = makeBuild('preview');
    const required = getRequiredAcknowledgements(build);
    const signature = getFirmwareAcknowledgementSignature(build);

    it('requires the preview acknowledgement and blocks until accepted', () => {
      expect(required.some((a) => a.key === 'channel:preview')).toBe(true);
      const gate = evaluateInstallGate(gateInputs({
        build,
        provenance: validateFirmwareProvenance(build, { mode: 'development' }),
        acknowledgements: { required, signature, accepted: {} },
      }));
      expect(gate.acknowledgement.satisfied).toBe(false);
      expect(gate.canInstall).toBe(false);
    });

    it('accepts an acknowledgement recorded against the current signature', () => {
      const accepted = { 'channel:preview': signature };
      const gate = evaluateInstallGate(gateInputs({
        build,
        provenance: validateFirmwareProvenance(build, { mode: 'development' }),
        acknowledgements: { required, signature, accepted },
      }));
      expect(gate.acknowledgement.satisfied).toBe(true);
      expect(gate.canInstall).toBe(true);
    });

    it('prunes an acknowledgement recorded against a different signature', () => {
      // The user accepted the preview risk for a DIFFERENT build identity. The
      // current build's signature no longer matches, so the ack does not count.
      const accepted = { 'channel:preview': 'c=preview|id=|url=other|v=2.0.0|cfg=Other|d=no|dr=' };
      const gate = evaluateInstallGate(gateInputs({
        build,
        provenance: validateFirmwareProvenance(build, { mode: 'development' }),
        acknowledgements: { required, signature, accepted },
      }));
      expect(gate.acknowledgement.satisfied).toBe(false);
      expect(gate.canInstall).toBe(false);
    });

    it('treats a Map accepted store the same way as a plain object', () => {
      const accepted = new Map([['channel:preview', signature]]);
      const gate = evaluateInstallGate(gateInputs({
        build,
        provenance: validateFirmwareProvenance(build, { mode: 'development' }),
        acknowledgements: { required, signature, accepted },
      }));
      expect(gate.canInstall).toBe(true);
    });
  });

  describe('manifest freshness matrix', () => {
    const cases = [
      ['current', false, true],
      ['stale', false, false],
      ['unknown', false, false],
      ['unknown', true, true],
      ['pending', false, true],
    ];
    for (const [verdict, acknowledged, expectInstall] of cases) {
      it(`verdict=${verdict} acknowledged=${acknowledged} -> canInstall=${expectInstall}`, () => {
        const gate = evaluateInstallGate(gateInputs({ freshness: { verdict, acknowledged } }));
        expect(gate.canInstall).toBe(expectInstall);
      });
    }

    it('marks a stale manifest row blocking', () => {
      const gate = evaluateInstallGate(gateInputs({ freshness: { verdict: 'stale', acknowledged: false } }));
      const row = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.MANIFEST_FRESHNESS);
      expect(row.status).toBe('fail');
      expect(row.blocking).toBe(true);
    });
  });

  describe('service-worker update matrix', () => {
    it('blocks install when an update is available and not dismissed', () => {
      const gate = evaluateInstallGate(gateInputs({ serviceWorker: { updateAvailable: true, updateDismissed: false } }));
      expect(gate.serviceWorker.blocking).toBe(true);
      expect(gate.canInstall).toBe(false);
      expect(gate.blockingReason).toMatch(/update is available/i);
    });

    it('does not block once the update is dismissed', () => {
      const gate = evaluateInstallGate(gateInputs({ serviceWorker: { updateAvailable: true, updateDismissed: true } }));
      expect(gate.serviceWorker.blocking).toBe(false);
      expect(gate.canInstall).toBe(true);
    });
  });

  describe('capability and before-you-flash gating', () => {
    it('blocks when Web Serial is unavailable', () => {
      const gate = evaluateInstallGate(gateInputs({ capabilities: { webSerial: false, secureContext: true } }));
      const row = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.BROWSER_SUPPORT);
      expect(row.status).toBe('fail');
      expect(gate.canInstall).toBe(false);
    });

    it('blocks on an insecure context', () => {
      const gate = evaluateInstallGate(gateInputs({ capabilities: { webSerial: true, secureContext: false } }));
      const row = gate.checks.find((c) => c.id === INSTALL_GATE_CHECK_IDS.SECURE_CONTEXT);
      expect(row.status).toBe('fail');
      expect(gate.canInstall).toBe(false);
    });

    it('blocks until the before-you-flash checklist is acknowledged', () => {
      const gate = evaluateInstallGate(gateInputs({ beforeFlashAcknowledged: false }));
      expect(gate.beforeFlash.satisfied).toBe(false);
      expect(gate.canInstall).toBe(false);
      expect(gate.blockingReason).toMatch(/pre-flash checklist/i);
    });
  });
});

describe('verifyFirmwareIntegrity (SHA-256 + Ed25519 of the downloaded bytes)', () => {
  function bytesAndHash(text) {
    const buf = Buffer.from(text, 'utf8');
    const hash = createHash('sha256').update(buf).digest('hex');
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { arrayBuffer, hash };
  }

  // A build whose bytes, SHA-256, and Ed25519 signature are all mutually
  // consistent, signed by the committed dev-2026-01 (test_only) key.
  function signedBuild(channel, text, overrides = {}) {
    const { arrayBuffer, hash } = bytesAndHash(text);
    const sigB64 = signWithDevKey(new Uint8Array(arrayBuffer));
    const build = makeBuild(channel, {
      sha256: hash,
      signature_ed25519: sigB64,
      signature_key_id: 'dev-2026-01',
      parts: [{ path: 'firmware/test.bin', offset: 0, sha256: hash }],
      ...overrides,
    });
    return { build, arrayBuffer };
  }

  function fetchServing(arrayBuffer) {
    return jest.fn(() => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(arrayBuffer) }));
  }

  it('verifies when the bytes match the SHA-256 AND the Ed25519 signature verifies', async () => {
    const { build, arrayBuffer } = signedBuild('preview', 'firmware-bytes-A');
    const fetchImpl = fetchServing(arrayBuffer);

    const result = await verifyFirmwareIntegrity(build, { mode: 'development', fetchImpl });
    expect(result.status).toBe('verified');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.parts[0].sha256Match).toBe(true);
    expect(result.parts[0].ed25519.ok).toBe(true);
    expect(result.signature.ok).toBe(true);
    expect(result.signature.code).toBe('verified');
    // The merged provenance report reflects the enforced runtime verdict.
    const sigCheck = result.provenance.checks.find((c) => c.id === 'signature_verified');
    expect(sigCheck.status).toBe('pass');
  });

  it('fails when the downloaded bytes do not match the manifest SHA-256', async () => {
    // The signature covers different bytes than the manifest hash claims —
    // the SHA-256 gate fails first and independently of the signature gate.
    const { arrayBuffer } = bytesAndHash('firmware-bytes-A');
    const build = makeBuild('preview', {
      sha256: 'd'.repeat(64),
      signature_ed25519: signWithDevKey(new Uint8Array(arrayBuffer)),
      signature_key_id: 'dev-2026-01',
      parts: [{ path: 'firmware/test.bin', offset: 0, sha256: 'd'.repeat(64) }],
    });
    const fetchImpl = fetchServing(arrayBuffer);

    const result = await verifyFirmwareIntegrity(build, { mode: 'development', fetchImpl });
    expect(result.status).toBe('failed');
    expect(result.parts[0].sha256Match).toBe(false);
    expect(result.message).toMatch(/SHA-256 mismatch/i);
  });

  it('fails when the signature is tampered even though the SHA-256 matches', async () => {
    // A manifest-only attacker can keep sha256 consistent with tampered
    // bytes, but cannot produce a verifying Ed25519 signature. Simulate by
    // corrupting the signature: hash gate passes, signature gate blocks.
    const { build, arrayBuffer } = signedBuild('preview', 'firmware-bytes-A');
    const sigBytes = Buffer.from(build.signature_ed25519, 'base64');
    sigBytes[0] ^= 0xff;
    build.signature_ed25519 = sigBytes.toString('base64');
    const fetchImpl = fetchServing(arrayBuffer);

    const result = await verifyFirmwareIntegrity(build, { mode: 'development', fetchImpl });
    expect(result.status).toBe('failed');
    expect(result.parts[0].sha256Match).toBe(true);
    expect(result.parts[0].ed25519.ok).toBe(false);
    expect(result.signature.ok).toBe(false);
    expect(result.message).toMatch(/authenticity verification failed/i);
    const sigCheck = result.provenance.checks.find((c) => c.id === 'signature_verified');
    expect(sigCheck.status).toBe('fail');
  });

  it('blocks a test_only-key-signed build in production mode', async () => {
    // The committed dev-2026-01 key is test_only: anyone with read access to
    // the repo could sign with it, so production mode must refuse it even
    // though the signature mathematically verifies. Preview channel is used
    // so the static gate passes and the REFUSAL comes from the runtime
    // signature check (stable/rescue are already refused statically).
    const { build, arrayBuffer } = signedBuild('preview', 'firmware-bytes-A');
    const fetchImpl = fetchServing(arrayBuffer);

    const result = await verifyFirmwareIntegrity(build, { mode: 'production', fetchImpl });
    expect(result.status).toBe('failed');
    expect(result.parts[0].sha256Match).toBe(true);
    expect(result.signature.ok).toBe(false);
    expect(result.signature.code).toBe('key_test_only_in_production');
    expect(result.message).toMatch(/test-only key/i);
  });

  it('fails when the build carries no Ed25519 signature at all', async () => {
    const { arrayBuffer, hash } = bytesAndHash('firmware-bytes-A');
    const build = makeBuild('preview', {
      sha256: hash,
      parts: [{ path: 'firmware/test.bin', offset: 0, sha256: hash }],
    });
    delete build.signature_ed25519;
    delete build.signature_key_id;
    // An unsigned build already blocks at the static provenance gate, so no
    // download even starts — enforcement fails closed before the network.
    const fetchImpl = fetchServing(arrayBuffer);
    const result = await verifyFirmwareIntegrity(build, { mode: 'development', fetchImpl });
    expect(result.status).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to download when the static provenance gate blocks', async () => {
    const build = makeBuild('stable');
    delete build.sha256; // critical-field failure -> provenance blocks
    const fetchImpl = jest.fn();

    const result = await verifyFirmwareIntegrity(build, { mode: 'production', fetchImpl });
    expect(result.status).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports an HTTP failure as a verification failure, not a crash', async () => {
    const build = makeBuild('preview');
    const fetchImpl = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    const result = await verifyFirmwareIntegrity(build, { mode: 'development', fetchImpl });
    expect(result.status).toBe('failed');
    expect(result.parts[0].sha256Match).toBe(false);
  });
});

describe('PR 5 — InstallStep bound to the engine', () => {
  const ROOT = process.cwd();
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
        // Arbitrary bytes — they will not match the manifest SHA-256, so the
        // verify row resolves to a (blocking) fail. That is enough to exercise
        // the wiring; the happy-path integrity logic is covered above.
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
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    jest.resetModules();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
  });

  async function mountInstallStep(wizardState) {
    const engine = (await import('../scripts/engine.js')).default;
    const { InstallStep } = await import('../scripts/install.js');
    const resolved = await engine.state.resolveCompatibleFirmware(wizardState);
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
    return { root, node, resolved, engine };
  }

  it('renders the four real preflight rows by label, not a timer simulation', async () => {
    const { root } = await mountInstallStep({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    const rowNames = [...root.querySelectorAll('.ready__name')].map((el) => el.textContent);
    expect(rowNames).toEqual(
      expect.arrayContaining(['Browser support', 'Secure context', 'Firmware manifest', 'Firmware verification']),
    );
  });

  it('keeps the install button disabled until the gate passes', async () => {
    const { root } = await mountInstallStep({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    const installBtn = root.querySelector('.stepnav .btn--lg');
    expect(installBtn).not.toBeNull();
    // Before-you-flash is unchecked and the served .bin bytes do not match the
    // manifest SHA-256, so the gate cannot be satisfied here.
    expect(installBtn.disabled).toBe(true);
  });

  it('surfaces a channel acknowledgement checkbox for a preview build', async () => {
    // Retargeted from the retired Ceiling-POE-RoomIQ-LED preview (stale
    // v1.0.0-preview retirement) to the surviving VentIQ LED preview
    // (Ceiling-POE-VentIQ-RoomIQ-LED, from v1.0.0-led-preview).
    const { root, resolved } = await mountInstallStep({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq', led: 'led',
    });
    expect(resolved.isPreview).toBe(true);
    // Two acknowledgements render for a preview build: the before-you-flash
    // checklist plus the preview channel acknowledgement.
    const acks = root.querySelectorAll('label.ack');
    expect(acks.length).toBeGreaterThanOrEqual(2);
    expect(root.textContent).toMatch(/preview/i);
  });

  it('shows the resolved build version and channel read from the manifest', async () => {
    const { root, resolved } = await mountInstallStep({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    // The label must mirror the resolved build's version and channel, read
    // from the manifest — not a hardcoded version string, which would
    // re-break on every firmware bump (it last broke on the 1.0.2 -> 1.0.4
    // import). The stable Bathroom PoE selection resolves to the
    // Ceiling-POE-VentIQ-RoomIQ build.
    const fwEl = root.querySelector('[data-firmware-version]');
    expect(fwEl).not.toBeNull();
    expect(fwEl.textContent).toBe(`Firmware v${resolved.build.version} (${resolved.build.channel})`);
    // Cross-check the resolved build against the manifest fixture so the
    // assertion stays grounded in real manifest data rather than being
    // purely self-referential.
    const manifestBuild = manifestJson.builds.find(
      (b) => b.config_string === resolved.build.config_string,
    );
    expect(manifestBuild).toBeDefined();
    expect(resolved.build.version).toBe(manifestBuild.version);
    expect(resolved.build.channel).toBe(manifestBuild.channel);
    expect(fwEl.textContent).toBe(`Firmware v${manifestBuild.version} (${manifestBuild.channel})`);
  });
});

describe('formatFirmwareVersion', () => {
  it('formats version and channel from the build entry', async () => {
    const { formatFirmwareVersion } = await import('../scripts/install.js');
    expect(formatFirmwareVersion({ version: '1.0.2', channel: 'stable' })).toBe('Firmware v1.0.2 (stable)');
    expect(formatFirmwareVersion({ version: '1.0.0', channel: 'preview' })).toBe('Firmware v1.0.0 (preview)');
  });

  it('omits the channel suffix when the build has no channel', async () => {
    const { formatFirmwareVersion } = await import('../scripts/install.js');
    expect(formatFirmwareVersion({ version: '2.3.4' })).toBe('Firmware v2.3.4');
  });

  it('fails gracefully when a build lacks a version', async () => {
    const { formatFirmwareVersion } = await import('../scripts/install.js');
    expect(formatFirmwareVersion({ channel: 'stable' })).toBe('Firmware version unknown');
    expect(formatFirmwareVersion(null)).toBe('');
    expect(formatFirmwareVersion(undefined)).toBe('');
  });
});

describe('PR 5 — the CHECKS simulation is deleted', () => {
  it('no longer exports a simulated readiness CHECKS array from data.js', async () => {
    const data = await import('../scripts/data.js');
    expect(data.CHECKS).toBeUndefined();
  });
});
