/**
 * PR 4 (WebFlash 2.0 migration) — Identify step on the real engine.
 *
 * Covers the bindings PR 4 adds to the 2.0 Identify step:
 *   - the pure engine compatible-firmware lookup
 *     (engine.state.resolveCompatibleFirmware) resolves a wizard-state snapshot
 *     to the real manifest builds by config_string, honouring the release gates;
 *   - a configuration with no installable stable or preview build is blocked
 *     from Continue and routed to the ESPHome source path (this subsumes the
 *     TRIAC guard);
 *   - the 2.0 view loads the real kit catalogue (kits.json), uses the real
 *     setState, and honours the ?configmode=kit&sku= and manual share links,
 *     including the unknown-SKU fallback.
 *
 * The engine modules (state.js etc.) load manifest.json and kits.json over
 * fetch, so each test serves the real on-disk JSON through a fetch stub and
 * imports the engine fresh (jest.resetModules) after setting the URL, so the
 * 1.0 URL hydration runs against the test's share link.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));
const RELEASE_ONE_KIT_SKU = kitsJson.kits[0].sku;

function makeFetch() {
  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('kits.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsJson) });
    }
    if (u.includes('manifest.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifestJson) });
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
// live. Reproduce the minimal 1.0 form skeleton so share-link hydration via
// engine.state.getState() behaves as in production.
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

// Let every pending microtask + the fetch macrotask settle so the async kit
// load and firmware resolution have re-rendered.
async function flush() {
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Import the engine + view fresh, after the test URL is in place, so the 1.0
// URL hydration in state.js runs against the share link under test.
async function boot(search = '') {
  if (search) {
    window.history.replaceState({}, '', '/' + search);
  }
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
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

describe('PR 4 — resolveCompatibleFirmware (pure engine lookup)', () => {
  it('resolves the Bathroom PoE selection to the stable Release-One build', async () => {
    const { engine } = await boot();
    const result = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', bathroom: true,
      ventiq: 'ventiq', roomiq: 'roomiq', airiq: 'none', fan: 'none', led: 'none',
    });
    expect(result.configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    expect(result.installable).toBe(true);
    expect(result.isPreview).toBe(false);
    expect(result.channel).toBe('stable');
    expect(result.reason).toBe('installable');
  });

  it('resolves an LED selection to the preview build and flags it preview', async () => {
    // Retargeted from the retired Ceiling-POE-RoomIQ-LED preview (stale
    // v1.0.0-preview retirement) to the surviving VentIQ LED preview
    // (Ceiling-POE-VentIQ-RoomIQ-LED, from v1.0.0-led-preview).
    const { engine } = await boot();
    const result = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', bathroom: true,
      roomiq: 'roomiq', led: 'led', airiq: 'none', ventiq: 'ventiq', fan: 'none',
    });
    expect(result.configString).toBe('Ceiling-POE-VentIQ-RoomIQ-LED');
    expect(result.installable).toBe(true);
    expect(result.isPreview).toBe(true);
    expect(result.channel).toBe('preview');
  });

  it('blocks a TRIAC selection — no signed build, routed to source', async () => {
    const { engine } = await boot();
    const result = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', bathroom: true,
      ventiq: 'ventiq', roomiq: 'roomiq', fan: 'triac',
    });
    expect(result.installable).toBe(false);
    expect(result.reason).toBe('no-build');
    expect(result.build).toBeNull();
  });

  it('resolves an AirIQ + DAC selection to the imported room-bundle preview build', async () => {
    // WF-IMPORT-FAN-BUNDLES-001 imported the five full-composition room-bundle
    // fan previews, so Ceiling-POE-AirIQ-FanDAC-RoomIQ now ships a signed preview
    // build and this pure manifest lookup finds it (previously "no-build" only
    // because the build was absent). The AirIQ/DAC conflict that keeps this combo
    // unselectable lives in the view layer (scripts/data.js airiq.conflicts=['dac']
    // + scripts/identify.js hard-disables the conflicting option) and is unchanged.
    // Install still gates on the preview-channel + fan-control + FanDAC-address
    // acknowledgements; nothing here weakens that.
    const { engine } = await boot();
    const result = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', airiq: 'airiq', roomiq: 'roomiq', fan: 'analog',
    });
    expect(result.configString).toBe('Ceiling-POE-AirIQ-FanDAC-RoomIQ');
    expect(result.installable).toBe(true);
    expect(result.isPreview).toBe(true);
    expect(result.channel).toBe('preview');
  });

  it('blocks a USB power selection that has no published build', async () => {
    const { engine } = await boot();
    const result = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'usb', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    expect(result.configString).toBe('Ceiling-USB-VentIQ-RoomIQ');
    expect(result.installable).toBe(false);
  });

  it('returns the incomplete verdict before mounting and power are chosen', async () => {
    const { engine } = await boot();
    const result = await engine.state.resolveCompatibleFirmware({ mount: 'ceiling' });
    expect(result.configString).toBe('');
    expect(result.installable).toBe(false);
    expect(result.reason).toBe('incomplete');
  });

  it('enforces AirIQ/VentIQ exclusivity exactly as setState does', async () => {
    const { engine } = await boot();
    // Both AirIQ and VentIQ requested with bathroom on: the engine keeps VentIQ
    // and drops AirIQ, resolving to the stable bathroom build.
    const result = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', bathroom: true,
      airiq: 'airiq', ventiq: 'ventiq', roomiq: 'roomiq',
    });
    expect(result.configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    expect(result.installable).toBe(true);
  });
});

describe('PR 4 — share-link parsing', () => {
  it('maps configmode=kit&sku to kit mode with the SKU', async () => {
    const { app } = await boot(`?configmode=kit&sku=${RELEASE_ONE_KIT_SKU}`);
    expect(app.__testHooks.getRequestedModeFromUrl()).toEqual({ mode: 'kit', sku: RELEASE_ONE_KIT_SKU });
  });

  it('maps configmode=custom and configmode=manual to advanced mode', async () => {
    const { app } = await boot('?configmode=custom');
    expect(app.__testHooks.getRequestedModeFromUrl()).toEqual({ mode: 'advanced', sku: '' });
    window.history.replaceState({}, '', '/?configmode=manual');
    expect(app.__testHooks.getRequestedModeFromUrl()).toEqual({ mode: 'advanced', sku: '' });
  });

  it('maps a legacy manual share link (mount/power params) to advanced mode', async () => {
    const { app } = await boot('?mount=ceiling&power=poe&airiq=airiq');
    expect(app.__testHooks.getRequestedModeFromUrl()).toEqual({ mode: 'advanced', sku: '' });
  });

  it('defaults to kit mode with no markers', async () => {
    const { app } = await boot('?foo=bar');
    expect(app.__testHooks.getRequestedModeFromUrl()).toEqual({ mode: 'kit', sku: '' });
  });
});

describe('PR 4 — Identify view bound to the engine', () => {
  it('loads the real catalogue and a kit share link enables Continue once installable', async () => {
    const { engine, app } = await boot(`?configmode=kit&sku=${RELEASE_ONE_KIT_SKU}`);
    const root = mountInto(app, engine);
    await flush();

    const viewState = app.__testHooks.getState();
    expect(viewState.mode).toBe('kit');
    expect(viewState.kits.length).toBeGreaterThan(0);
    expect(viewState.kit && viewState.kit.sku).toBe(RELEASE_ONE_KIT_SKU);
    expect(viewState.resolved.configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    expect(viewState.resolved.installable).toBe(true);

    const continueBtn = root.querySelector('.stepnav .btn--lg');
    expect(continueBtn).not.toBeNull();
    expect(continueBtn.disabled).toBe(false);
  });

  it('shows the unknown-SKU fallback and keeps the switch-to-advanced affordance', async () => {
    const { engine, app } = await boot('?configmode=kit&sku=NOPE-DOES-NOT-EXIST');
    const root = mountInto(app, engine);
    await flush();

    expect(app.__testHooks.getState().mode).toBe('kit');
    const warn = root.querySelector('.callout--warn');
    expect(warn).not.toBeNull();
    expect(warn.textContent).toMatch(/couldn't find a kit/i);

    // The "Build it module by module" hatch is the one-click switch to advanced.
    const hatchLink = root.querySelector('.hatch .linkbtn');
    expect(hatchLink).not.toBeNull();
    hatchLink.click();
    await flush();
    expect(app.__testHooks.getState().mode).toBe('advanced');
  });

  it('routes a blocked advanced selection to the source path and disables Continue', async () => {
    const { engine, app } = await boot('?configmode=manual');
    const root = mountInto(app, engine);
    await flush();

    // Default advanced selection (PoE + VentIQ) is the installable stable build.
    expect(app.__testHooks.getState().resolved.installable).toBe(true);

    // Switching to USB-C power yields a config with no published build.
    const usbOption = [...root.querySelectorAll('.opt')].find((b) => /USB-C/.test(b.textContent));
    expect(usbOption).not.toBeNull();
    usbOption.click();
    await flush();

    const resolved = app.__testHooks.getState().resolved;
    expect(resolved.installable).toBe(false);
    expect(resolved.configString).toBe('Ceiling-USB-VentIQ-RoomIQ');

    const continueBtn = root.querySelector('.aside .btn--block');
    expect(continueBtn.disabled).toBe(true);

    const callout = root.querySelector('.callout--warn');
    expect(callout).not.toBeNull();
    expect(callout.textContent).toMatch(/ESPHome YAML/);
    const sourceLink = callout.querySelector('a[href*="esphome-public"]');
    expect(sourceLink).not.toBeNull();
  });

  it('hydrates the advanced builder from a legacy manual share link', async () => {
    const { engine, app } = await boot('?configmode=manual&mount=ceiling&power=poe&airiq=airiq&roomiq=roomiq');
    const root = mountInto(app, engine);
    await flush();

    const viewState = app.__testHooks.getState();
    expect(viewState.mode).toBe('advanced');
    // RoomIQ and the air-quality board hydrate as independent axes.
    expect(viewState.sel.air).toBe('airiq');
    expect(viewState.sel.roomiq).toBe(true);
    expect(viewState.sel.power).toBe('poe');
    // The AirIQ-RoomIQ preview build was retired with the stale
    // v1.0.0-preview batch, so the hydrated config currently has no build and
    // resolves fail-closed. This flips back to installable (stable) when the
    // AirIQ-RoomIQ v1.0.6 stable import lands; the hydration assertions above
    // are this test's real subject.
    expect(viewState.resolved.configString).toBe('Ceiling-POE-AirIQ-RoomIQ');
    expect(viewState.resolved.installable).toBe(false);
  });
});
