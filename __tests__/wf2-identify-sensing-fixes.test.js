/**
 * wf2-identify-sensing-fixes — follow-up bugfix PR for the WebFlash 2.0 Identify
 * step and shell (the GA default view at the repository root).
 *
 * Bug 1 — RoomIQ (S360-200) was mis-grouped as one of three mutually exclusive
 *   "air-quality board" radio options, and selToWizardState hardcoded
 *   roomiq:'roomiq'. RoomIQ is a presence + environmental board that coexists
 *   with AirIQ or VentIQ, and the manifest proves it is optional
 *   (Ceiling-POE-FanDAC / Ceiling-POE-FanPWM carry no RoomIQ token). RoomIQ is
 *   now its own optional toggle, the air-quality choice is a single
 *   None / AirIQ / VentIQ selection, the two axes map to the engine fields
 *   independently, and the selToWizardState <-> wizardStateToSel round-trip is
 *   stable.
 * Bug 2 — the brand logo is resolved relative to the module via import.meta.url
 *   (mirroring how scripts/shell.js resolves the stylesheet) instead of a
 *   page-relative 'assets/…', so the <img> is correct regardless of where the
 *   host document lives.
 * Bug 3 — the FIRMWARE TARGET card was a hardcoded dark navy gradient that
 *   clashed with the light UI. It now uses the light surface tokens (matching
 *   the YOUR CONFIGURATION card) with an accent mono string, keeping a dark
 *   variant under [data-theme="dark"].
 *
 * The engine modules load manifest.json / kits.json over fetch, so each test
 * serves the real on-disk JSON through a fetch stub and imports the engine fresh
 * (jest.resetModules) after setting the URL.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AIR,
  ROOMIQ,
  FAN,
  DEFAULT_SEL,
  selToWizardState,
  wizardStateToSel,
} from '../scripts/data.js';
// WF-SURFACE-SSOT-001: per-config channel expectations derive from the
// reviewed expected-surface fixture so a promotion is a single fixture edit.
// The axis-mapping and config-string-formation assertions (this suite's real
// subject) stay literal.
import { expectedChannelOf } from './helpers/expected-surface.js';

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
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

const a11yStub = {
  announce: () => {},
  trapFocus: () => () => {},
  restoreFocus: () => {},
  getFocusableElements: () => [],
};

// The shell renders the (hidden) 1.0 form markup, so setState rounds through the
// real form inputs. Reproduce the minimal form skeleton.
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
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

// The visible .opt cards in the mounted advanced builder, matched by name.
function optByName(root, name) {
  return [...root.querySelectorAll('.opt')]
    .find((o) => o.querySelector('.opt__name')?.textContent === name) || null;
}

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

describe('Bug 1 — RoomIQ is an independent axis from the air-quality choice', () => {
  it('the air-quality list is exactly None / AirIQ / VentIQ and never RoomIQ', () => {
    expect(AIR.map((a) => a.id)).toEqual(['none', 'airiq', 'ventiq']);
    expect(AIR.some((a) => a.id === 'roomiq')).toBe(false);
    // RoomIQ is its own toggle definition, not part of the air-quality list.
    expect(ROOMIQ.id).toBe('roomiq');
    expect(ROOMIQ.sku).toBe('S360-200');
  });

  it('AirIQ keeps only the cross-section DAC conflict (no VentIQ conflict)', () => {
    const airiq = AIR.find((a) => a.id === 'airiq');
    const ventiq = AIR.find((a) => a.id === 'ventiq');
    expect(airiq.conflicts).toEqual(['dac']);
    expect(ventiq.conflicts).toEqual([]);
    expect(FAN.find((f) => f.id === 'dac').conflicts).toEqual(['airiq']);
  });

  it('selToWizardState maps the two axes to engine fields independently', () => {
    expect(selToWizardState({ power: 'poe', roomiq: true, air: 'airiq' })).toMatchObject({
      roomiq: 'roomiq', airiq: 'airiq', ventiq: 'none', bathroom: false,
    });
    expect(selToWizardState({ power: 'poe', roomiq: true, air: 'ventiq' })).toMatchObject({
      roomiq: 'roomiq', airiq: 'none', ventiq: 'ventiq', bathroom: true,
    });
    // RoomIQ off is honoured (it is optional), independent of the air board.
    expect(selToWizardState({ power: 'poe', roomiq: false, air: 'airiq' })).toMatchObject({
      roomiq: 'none', airiq: 'airiq', ventiq: 'none',
    });
    expect(selToWizardState({ power: 'poe', roomiq: false, air: 'none' })).toMatchObject({
      roomiq: 'none', airiq: 'none', ventiq: 'none', bathroom: false,
    });
  });

  it('selToWizardState only ever sets one of airiq/ventiq (exclusivity preserved)', () => {
    for (const air of ['none', 'airiq', 'ventiq']) {
      const ws = selToWizardState({ power: 'poe', roomiq: true, air });
      const both = ws.airiq !== 'none' && ws.ventiq !== 'none';
      expect(both).toBe(false);
    }
  });

  it('the selToWizardState -> wizardStateToSel round-trip is stable', () => {
    const powers = ['usbc', 'poe', 'pwr'];
    const airs = ['none', 'airiq', 'ventiq'];
    const fans = ['none', 'relay', 'pwm', 'dac', 'triac'];
    for (const power of powers) {
      for (const roomiq of [true, false]) {
        for (const air of airs) {
          for (const fan of fans) {
            for (const led of [true, false]) {
              const sel = { power, roomiq, air, fan, led };
              expect(wizardStateToSel(selToWizardState(sel))).toEqual(sel);
            }
          }
        }
      }
    }
  });

  it('DEFAULT_SEL is RoomIQ-on + VentIQ and resolves to the Release-One build', async () => {
    // The default selection must stay STABLE — pinned by kits-json.test.js
    // and the expected-surface anchor suite; the channel derives from the
    // fixture here.
    expect(DEFAULT_SEL).toMatchObject({ roomiq: true, air: 'ventiq', power: 'poe' });
    const { engine } = await boot();
    const resolved = await engine.state.resolveCompatibleFirmware(selToWizardState(DEFAULT_SEL));
    expect(resolved.configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    expect(resolved.installable).toBe(true);
    expect(resolved.channel).toBe(expectedChannelOf('Ceiling-POE-VentIQ-RoomIQ'));
  });

  it('RoomIQ + AirIQ -> Ceiling-POE-AirIQ-RoomIQ; RoomIQ + VentIQ -> Ceiling-POE-VentIQ-RoomIQ', async () => {
    const { engine } = await boot();
    const airiq = await engine.state.resolveCompatibleFirmware(
      selToWizardState({ power: 'poe', roomiq: true, air: 'airiq' }));
    expect(airiq.configString).toBe('Ceiling-POE-AirIQ-RoomIQ');
    // Resolves installable on its fixture-declared channel (currently stable
    // after the AirIQ-RoomIQ promotion); the config-string formation is this
    // test's real subject (Bug 1).
    expect(airiq.installable).toBe(true);
    expect(airiq.channel).toBe(expectedChannelOf('Ceiling-POE-AirIQ-RoomIQ'));

    const ventiq = await engine.state.resolveCompatibleFirmware(
      selToWizardState({ power: 'poe', roomiq: true, air: 'ventiq' }));
    expect(ventiq.configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    expect(ventiq.installable).toBe(true);
  });

  it('AirIQ + DAC resolves to the imported room-bundle preview build; the mutex stays the UI gate', async () => {
    // WF-IMPORT-FAN-BUNDLES-001 imported Ceiling-POE-AirIQ-FanDAC-RoomIQ as a
    // preview build, so the pure resolver now finds it (previously "no-build"
    // only because the build was absent). The AirIQ/DAC conflict asserted above
    // (airiq.conflicts=['dac'], dac.conflicts=['airiq']) is unchanged and remains
    // the selection gate: the advanced builder hard-disables the conflicting
    // option, so a user can never construct this combo in the wizard. Install
    // still gates on the preview-channel + fan-control + FanDAC-address
    // acknowledgements.
    const { engine } = await boot();
    const channel = expectedChannelOf('Ceiling-POE-AirIQ-FanDAC-RoomIQ');
    const resolved = await engine.state.resolveCompatibleFirmware(
      selToWizardState({ power: 'poe', roomiq: true, air: 'airiq', fan: 'dac' }));
    expect(resolved.configString).toBe('Ceiling-POE-AirIQ-FanDAC-RoomIQ');
    expect(resolved.installable).toBe(true);
    expect(resolved.isPreview).toBe(channel === 'preview');
    expect(resolved.channel).toBe(channel);
  });
});

describe('Bug 1 — advanced builder renders RoomIQ and air-quality as separate sections', () => {
  it('shows a Presence (RoomIQ) toggle and a None/AirIQ/VentIQ air-quality choice', async () => {
    const { engine, app } = await boot('?configmode=manual');
    const root = mountInto(app, engine);
    await flush();

    const heads = [...root.querySelectorAll('.bsection__head h3')].map((h3) => h3.textContent);
    expect(heads).toContain('Presence');
    expect(heads).toContain('Air quality');
    expect(heads).not.toContain('Sensing');

    // The air-quality hint is the corrected label.
    const airHead = [...root.querySelectorAll('.bsection__head')]
      .find((b) => b.querySelector('h3')?.textContent === 'Air quality');
    expect(airHead.querySelector('.hint').textContent).toBe('Choose one air-quality board');

    // RoomIQ is its own option; the air grid is None/AirIQ/VentIQ.
    expect(optByName(root, 'Sense360 RoomIQ')).not.toBeNull();
    expect(optByName(root, 'No air-quality board')).not.toBeNull();
    expect(optByName(root, 'Sense360 AirIQ')).not.toBeNull();
    expect(optByName(root, 'Sense360 VentIQ')).not.toBeNull();
  });

  it('toggling RoomIQ off drops it from the target independent of the air board', async () => {
    const { engine, app } = await boot('?configmode=manual');
    const root = mountInto(app, engine);
    await flush();

    // Default advanced selection is RoomIQ-on + VentIQ -> stable build.
    expect(app.__testHooks.getState().resolved.configString).toBe('Ceiling-POE-VentIQ-RoomIQ');
    const roomiqToggle = optByName(root, 'Sense360 RoomIQ');
    expect(roomiqToggle.classList.contains('is-on')).toBe(true);

    roomiqToggle.click();
    await flush();

    const state = app.__testHooks.getState();
    // VentIQ is still selected; only RoomIQ changed, and VentIQ-without-RoomIQ
    // has no signed build, proving the two axes are independent.
    expect(state.sel.air).toBe('ventiq');
    expect(state.sel.roomiq).toBe(false);
    expect(state.resolved.configString.includes('RoomIQ')).toBe(false);
    expect(state.resolved.installable).toBe(false);
  });

  it('switching the air board to AirIQ keeps RoomIQ on (Ceiling-POE-AirIQ-RoomIQ)', async () => {
    const { engine, app } = await boot('?configmode=manual');
    const root = mountInto(app, engine);
    await flush();

    optByName(root, 'Sense360 AirIQ').click();
    await flush();

    const state = app.__testHooks.getState();
    expect(state.sel.air).toBe('airiq');
    expect(state.sel.roomiq).toBe(true);
    expect(state.resolved.configString).toBe('Ceiling-POE-AirIQ-RoomIQ');
    // The config resolves installable on its fixture-declared channel
    // (currently stable after the AirIQ-RoomIQ promotion); RoomIQ staying on
    // through the air-board switch is this test's real subject (Bug 1).
    expect(state.resolved.installable).toBe(true);
    expect(state.resolved.channel).toBe(expectedChannelOf('Ceiling-POE-AirIQ-RoomIQ'));
  });

  it('the summary panel shows Presence and Air quality as separate rows', async () => {
    const { engine, app } = await boot('?configmode=manual');
    const root = mountInto(app, engine);
    await flush();

    const rows = [...root.querySelectorAll('.summary-card .sum-row')].map((r) => ({
      k: r.querySelector('.sum-row__k').textContent,
      v: r.querySelector('.sum-row__v').textContent,
    }));
    const byKey = (k) => rows.find((r) => r.k === k);
    expect(byKey('Presence')).toBeTruthy();
    expect(byKey('Air quality')).toBeTruthy();
    expect(byKey('Sensing')).toBeUndefined();
    expect(byKey('Presence').v).toBe('Sense360 RoomIQ');
    expect(byKey('Air quality').v).toBe('Sense360 VentIQ');
  });
});

describe('Bug 2 — the brand logo resolves relative to the module', () => {
  it('the window bar logo src is module-relative and absolute, not page-relative', async () => {
    const { engine, app } = await boot();
    const root = mountInto(app, engine);
    await flush();

    const img = root.querySelector('.winbar__brand img');
    expect(img).not.toBeNull();
    const src = img.getAttribute('src');
    // Module-relative resolution points at the root assets/ and is absolute, so
    // it is correct no matter where the host document lives.
    expect(src).toMatch(/\/assets\/sense360-logo\.png$/);
    expect(src).not.toBe('assets/sense360-logo.png');
    expect(/^[a-z]+:\/\//.test(src)).toBe(true);
  });
});

describe('Bug 3 — FIRMWARE TARGET card uses the light surface tokens', () => {
  const css = readFileSync(join(ROOT, 'app.css'), 'utf8');

  it('the base .target-card uses surface + border tokens, not the dark navy gradient', () => {
    const block = css.match(/\.target-card\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const body = block[1];
    expect(body).toContain('var(--surface)');
    expect(body).toContain('var(--border)');
    expect(body).not.toContain('linear-gradient');
    expect(body).not.toContain('var(--text) 0%');
    // The config string is not auto-selected (no forced user-select on the card).
    expect(body).not.toContain('user-select');
  });

  it('the mono config string is an accent token, not a hardcoded bright highlight', () => {
    const codeBlock = css.match(/\.target-card code\s*\{([^}]*)\}/);
    expect(codeBlock).not.toBeNull();
    expect(codeBlock[1]).toContain('var(--accent)');
    expect(codeBlock[1]).not.toContain('#5EEAD4');
  });

  it('a dark variant is kept under [data-theme="dark"]', () => {
    expect(css).toContain('[data-theme="dark"] .target-card');
  });

  it('global ::selection stays subtle', () => {
    expect(css).toMatch(/::selection\s*\{[^}]*var\(--accent-soft\)/);
  });
});
