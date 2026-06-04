/**
 * PR 6 (WebFlash 2.0 migration) — Real flashing through ESP Web Tools.
 *
 * Covers what PR 6 adds, replacing the simulated flash (the FLASH_PHASES array
 * plus a requestAnimationFrame ring) with the real ESP Web Tools
 * <esp-web-install-button> web component:
 *
 *   - the 2.0 Install step renders the real component pointed at the resolved
 *     build's manifest (firmware-<index>.json), the same component the 1.0 view
 *     drives;
 *   - the visible "Install firmware" button is the component's [slot=activate]
 *     button and stays disabled until the PR 5 gate passes (the gate, not the
 *     view, decides when flashing can start);
 *   - the component's lifecycle events (initializing, manifest, preparing,
 *     erasing, writing, finished, error) are mapped onto the 2.0 progress ring
 *     and console, with WRITING tracking the real esptool byte percentage;
 *   - finished advances to the connect step; error surfaces a retry path;
 *   - desktop Chromium is enforced (mobile / unsupported fallback message);
 *   - the FLASH_PHASES + requestAnimationFrame simulation is gone from
 *     webflash-2/scripts/install.js.
 *
 * The gate cannot pass in this environment (GATE_MODE is production and the
 * committed builds are dev-signed, so provenance blocks), exactly as the PR 5
 * suite asserts. That is fine: the lifecycle mapping is decoupled from the gate,
 * so these tests dispatch the same `state-changed` events the component would
 * emit once a real flash is under way and assert the ring / console mirror them.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => {
  // Back jsdom's crypto with Node's webcrypto so verifyFirmwareIntegrity's
  // SHA-256 path runs for real during the preflight that mounting kicks off.
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
});

const ROOT = process.cwd();
const INSTALL_SRC = readFileSync(join(ROOT, 'webflash-2', 'scripts', 'install.js'), 'utf8');
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
      // Arbitrary bytes — they will not match the manifest SHA-256, so the verify
      // row resolves to a blocking fail and the gate stays closed, mirroring a
      // local dev checkout. The lifecycle-mapping tests do not depend on the gate.
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

function stateEvent(state, extra = {}) {
  return new CustomEvent('state-changed', { detail: { state, ...extra } });
}

const RELEASE_ONE_STATE = Object.freeze({
  mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
});

describe('PR 6 — the flash simulation is deleted from install.js', () => {
  it('no longer defines the FLASH_PHASES data or runs a requestAnimationFrame ring', () => {
    // The simulation code is gone (the data array and the rAF loop). The PR
    // docstring may still reference the old names for historical context, exactly
    // as the PR 5 comment references the removed CHECKS array, so the guards are
    // scoped to the actual simulation constructs rather than to the words.
    expect(INSTALL_SRC).not.toMatch(/const\s+FLASH_PHASES/);
    expect(INSTALL_SRC).not.toMatch(/requestAnimationFrame\s*\(/);
    expect(INSTALL_SRC).not.toMatch(/cancelAnimationFrame\s*\(/);
  });

  it('drives the real ESP Web Tools component and maps its state-changed events', () => {
    expect(INSTALL_SRC).toMatch(/esp-web-install-button/);
    expect(INSTALL_SRC).toMatch(/state-changed/);
  });
});

describe('PR 6 — InstallStep renders the real ESP Web Tools component', () => {
  let engine;
  let InstallStep;

  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    engine = (await import('../webflash-2/scripts/engine.js')).default;
    ({ InstallStep } = await import('../webflash-2/scripts/install.js'));
  });

  async function mountStep(wizardState, opts = {}) {
    const resolved = await engine.state.resolveCompatibleFirmware(wizardState);
    const onFlashed = jest.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const node = InstallStep({
      device: { name: 'Test device', target: resolved.configString },
      build: resolved.build,
      engine: opts.engine || engine,
      a11y: a11yStub,
      onBack: () => {},
      onFlashed,
    });
    root.appendChild(node);
    await flush();
    return { root, node, resolved, onFlashed };
  }

  it('points the component at the resolved build manifest (firmware-<index>.json)', async () => {
    const { root, resolved } = await mountStep(RELEASE_ONE_STATE);
    const host = root.querySelector('esp-web-install-button');
    expect(host).not.toBeNull();
    expect(resolved.build).toBeTruthy();
    expect(host.getAttribute('manifest')).toBe(`firmware-${resolved.build.manifestIndex}.json`);
    // The activate button lives in the component's activate slot.
    const activate = host.querySelector('button[slot="activate"]');
    expect(activate).not.toBeNull();
    expect(activate.classList.contains('btn--lg')).toBe(true);
  });

  it('keeps the activate button disabled until the PR 5 gate passes', async () => {
    const { root } = await mountStep(RELEASE_ONE_STATE);
    const activate = root.querySelector('esp-web-install-button button[slot="activate"]');
    // Before-you-flash is unchecked and the served .bin bytes do not match the
    // manifest SHA-256, so the gate cannot arm the button here.
    expect(activate.disabled).toBe(true);
  });

  it('ships the desktop-only unsupported / not-allowed fallback slots', async () => {
    const { root } = await mountStep(RELEASE_ONE_STATE);
    const host = root.querySelector('esp-web-install-button');
    const unsupported = host.querySelector('[slot="unsupported"]');
    const notAllowed = host.querySelector('[slot="not-allowed"]');
    expect(unsupported).not.toBeNull();
    expect(notAllowed).not.toBeNull();
    expect(unsupported.textContent).toMatch(/Chrome/);
    expect(unsupported.textContent).toMatch(/mobile/i);
    expect(notAllowed.textContent).toMatch(/HTTPS/);
  });

  describe('maps the ESP Web Tools lifecycle onto the 2.0 ring and console', () => {
    it('reveals the progress view on the first lifecycle event and hides the prep view', async () => {
      const { root, node } = await mountStep(RELEASE_ONE_STATE);
      const prepEl = node.children[0];
      const flashEl = node.children[1];
      expect(prepEl.hidden).toBe(false);
      expect(flashEl.hidden).toBe(true);

      root.querySelector('esp-web-install-button').dispatchEvent(stateEvent('initializing', { message: '$ esptool connect' }));

      expect(prepEl.hidden).toBe(true);
      expect(flashEl.hidden).toBe(false);
      expect(root.querySelector('.flash')).not.toBeNull();
      expect(root.querySelector('.console').textContent).toMatch(/esptool connect/);
    });

    it('tracks the real writing byte percentage on the ring', async () => {
      const { root } = await mountStep(RELEASE_ONE_STATE);
      const host = root.querySelector('esp-web-install-button');
      host.dispatchEvent(stateEvent('writing', { message: 'Writing progress: 50%', details: { percentage: 50 } }));
      // Writing maps the 0..100 byte percentage onto the 25..98 ring band:
      // round(25 + 0.5 * 73) === 62.
      expect(root.querySelector('[data-pct]').textContent).toBe('62');
      expect(root.querySelector('.console').textContent).toMatch(/Writing firmware… 50%/);
      expect(root.querySelector('.flash__phase').textContent).toMatch(/Writing firmware…/);
    });

    it('throttles the writing console to roughly every 20 percent', async () => {
      const { root } = await mountStep(RELEASE_ONE_STATE);
      const host = root.querySelector('esp-web-install-button');
      for (const p of [1, 5, 10, 19, 21, 45, 61, 88]) {
        host.dispatchEvent(stateEvent('writing', { details: { percentage: p } }));
      }
      const writeLines = [...root.querySelectorAll('.console .ln')]
        .filter((ln) => /Writing firmware…/.test(ln.textContent));
      // Buckets crossed: 0 (1,5,10,19), 1 (21), 2 (45), 3 (61), 4 (88) -> 5 lines.
      expect(writeLines.length).toBe(5);
    });

    it('snaps the ring to 100 and advances to connect on finished', async () => {
      const { root, onFlashed } = await mountStep(RELEASE_ONE_STATE);
      const host = root.querySelector('esp-web-install-button');
      jest.useFakeTimers();
      try {
        host.dispatchEvent(stateEvent('writing', { details: { percentage: 100 } }));
        host.dispatchEvent(stateEvent('finished', { message: 'Done!' }));

        expect(root.querySelector('[data-pct]').textContent).toBe('100');
        expect(root.querySelector('.console').textContent).toMatch(/installed successfully/i);
        // The advance is deferred so the success state is visible first.
        expect(onFlashed).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1200);
        expect(onFlashed).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('surfaces the error message and a retry path on error, without advancing', async () => {
      const { root, node, onFlashed } = await mountStep(RELEASE_ONE_STATE);
      const host = root.querySelector('esp-web-install-button');
      host.dispatchEvent(stateEvent('error', { message: 'Failed to connect to ESP32' }));

      const errorBox = root.querySelector('[data-flash-error]');
      expect(errorBox).not.toBeNull();
      expect(errorBox.hidden).toBe(false);
      expect(errorBox.textContent).toMatch(/Failed to connect to ESP32/);
      expect(onFlashed).not.toHaveBeenCalled();

      // "Try again" returns to the prep view so the armed component can re-run.
      const retry = [...errorBox.querySelectorAll('button')].find((b) => /try again/i.test(b.textContent));
      expect(retry).toBeTruthy();
      retry.click();
      expect(node.children[0].hidden).toBe(false);  // prep view back
      expect(node.children[1].hidden).toBe(true);   // flash view hidden
    });

    it('ignores non-flash lifecycle states (idle / improv)', async () => {
      const { node } = await mountStep(RELEASE_ONE_STATE);
      const host = node.querySelector('esp-web-install-button');
      host.dispatchEvent(stateEvent('idle'));
      host.dispatchEvent(stateEvent('improv-state'));
      // The prep view stays; no progress view is built for unknown states.
      expect(node.children[0].hidden).toBe(false);
      expect(node.children[1].hidden).toBe(true);
      expect(node.querySelector('.flash')).toBeNull();
    });
  });

  describe('desktop Chromium enforcement (mobile / unsupported fallback)', () => {
    it('shows the mobile fallback banner and never arms install on a mobile device', async () => {
      const mobileCaps = {
        webSerial: false, secureContext: true, isMobile: true,
        browserName: 'Safari', os: 'ios', osName: 'iOS / iPadOS',
      };
      const mobileEngine = {
        ...engine,
        capabilities: {
          detectCapabilities: () => mobileCaps,
          evaluateBrowserReadiness: engine.capabilities.evaluateBrowserReadiness,
        },
      };
      const { root } = await mountStep(RELEASE_ONE_STATE, { engine: mobileEngine });

      const banner = root.querySelector('[data-unsupported-banner]');
      expect(banner).not.toBeNull();
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toMatch(/mobile/i);

      const activate = root.querySelector('esp-web-install-button button[slot="activate"]');
      expect(activate.disabled).toBe(true);
    });

    it('hides the unsupported banner on a capable desktop browser', async () => {
      const desktopCaps = {
        webSerial: true, secureContext: true, isMobile: false,
        browserName: 'Google Chrome', os: 'linux', osName: 'Linux',
      };
      const desktopEngine = {
        ...engine,
        capabilities: {
          detectCapabilities: () => desktopCaps,
          evaluateBrowserReadiness: engine.capabilities.evaluateBrowserReadiness,
        },
      };
      const { root } = await mountStep(RELEASE_ONE_STATE, { engine: desktopEngine });
      const banner = root.querySelector('[data-unsupported-banner]');
      expect(banner.hidden).toBe(true);
    });
  });
});
