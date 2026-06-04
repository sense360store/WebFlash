/**
 * PR 8 (WebFlash 2.0 migration) — Rescue and development modes.
 *
 * Covers the recovery and development-visibility wiring PR 8 adds to the 2.0
 * view that is mounted inside the production shell under ?ui=2:
 *   - the topbar Rescue button opens the real 1.0 rescue/recovery modal
 *     (scripts/layout/rescue-modal.js), injected by the production shell as the
 *     `recovery` mount option, with the trigger passed through so focus is
 *     restored to it on close;
 *   - the ?mode=recovery / ?mode=development opt-in is applied to the engine's
 *     authoritative release mode at mount, so development and recovery build
 *     visibility behaves exactly as in the 1.0 view;
 *   - the rescue binary, the rescue manifest, and rescue-modal.js stay precached
 *     by sw.js so first-visit offline rescue works.
 *
 * The view never owns the recovery gate: it only triggers the unchanged 1.0
 * modal, whose own a11y semantics are pinned by __tests__/rescue-modal.test.js.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// Reproduce the minimal 1.0 form skeleton so the engine's setState/getState
// round-trip works exactly as it does under the ?ui=2 production shell, which
// renders the (hidden) 1.0 markup.
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

// Import the engine + view fresh, after the test URL is in place, so the engine
// reads the share link / ?mode= under test.
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

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('PR 8 — engine seam exposes release-mode visibility', () => {
  it('re-exports getReleaseMode and setReleaseModeFromUrl as live references', async () => {
    const engine = (await import('../scripts/engine.js')).default;
    const stateMod = await import('../scripts/state.js');
    expect(typeof engine.state.getReleaseMode).toBe('function');
    expect(typeof engine.state.setReleaseModeFromUrl).toBe('function');
    expect(engine.state.getReleaseMode).toBe(stateMod.getReleaseMode);
    expect(engine.state.setReleaseModeFromUrl).toBe(stateMod.setReleaseModeFromUrl);
  });

  it('applies the URL ?mode= opt-in to the engine release mode', async () => {
    const engine = (await import('../scripts/engine.js')).default;
    // Default is the safe production mode.
    engine.state.setReleaseModeFromUrl(new URLSearchParams(''));
    expect(engine.state.getReleaseMode()).toBe('normal');

    engine.state.setReleaseModeFromUrl(new URLSearchParams('?mode=development'));
    expect(engine.state.getReleaseMode()).toBe('development');

    engine.state.setReleaseModeFromUrl(new URLSearchParams('?mode=recovery'));
    expect(engine.state.getReleaseMode()).toBe('recovery');

    // Unknown mode falls back to normal (no accidental exposure).
    engine.state.setReleaseModeFromUrl(new URLSearchParams('?mode=bogus'));
    expect(engine.state.getReleaseMode()).toBe('normal');
  });
});

describe('PR 8 — topbar Rescue button wiring', () => {
  it('opens the injected recovery path, passing the button as the focus trigger', async () => {
    const { engine, app } = await boot();
    const openRescueModal = jest.fn();
    const root = mountInto(app, engine, { recovery: { openRescueModal } });
    await flush();

    const button = root.querySelector('.topbar [data-rescue-open]');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');

    button.click();
    expect(openRescueModal).toHaveBeenCalledTimes(1);
    const arg = openRescueModal.mock.calls[0][0];
    expect(arg.trigger).toBe(button);
  });

  it('stays inert when no recovery path is wired (the isolated preview)', async () => {
    const { engine, app } = await boot();
    const root = mountInto(app, engine); // no recovery option
    await flush();

    const button = root.querySelector('.topbar [data-rescue-open]');
    expect(button).not.toBeNull();
    // Clicking must not throw when recovery is absent.
    expect(() => button.click()).not.toThrow();
  });

  it('opens the real 1.0 rescue modal end to end', async () => {
    const { engine, app } = await boot();
    const { openRescueModal, __testHooks } = await import('../scripts/layout/rescue-modal.js');
    try {
      const root = mountInto(app, engine, { recovery: { openRescueModal } });
      await flush();

      const button = root.querySelector('.topbar [data-rescue-open]');
      button.click();

      const modal = document.querySelector('.rescue-modal');
      expect(modal).not.toBeNull();
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.getAttribute('aria-hidden')).toBe('false');
      // The real modal owns the erase acknowledgement gate.
      expect(modal.querySelector('[data-rescue-ack]')).not.toBeNull();
    } finally {
      __testHooks.reset();
    }
  });
});

describe('PR 8 — development and recovery modes honoured at mount', () => {
  it('reveals development visibility under ?mode=development', async () => {
    const { engine, app } = await boot('?ui=2&mode=development');
    mountInto(app, engine);
    await flush();
    expect(engine.state.getReleaseMode()).toBe('development');
  });

  it('reveals recovery visibility under ?mode=recovery', async () => {
    const { engine, app } = await boot('?ui=2&mode=recovery');
    mountInto(app, engine);
    await flush();
    expect(engine.state.getReleaseMode()).toBe('recovery');
  });

  it('stays on normal mode for an ordinary load', async () => {
    const { engine, app } = await boot('?ui=2');
    mountInto(app, engine);
    await flush();
    expect(engine.state.getReleaseMode()).toBe('normal');
  });
});

describe('PR 8 — rescue binary precache invariant', () => {
  const swSource = readFileSync(join(ROOT, 'sw.js'), 'utf8');

  it('precaches the rescue binary and rescue manifest so first-visit offline rescue works', () => {
    expect(swSource).toContain('./firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin');
    expect(swSource).toContain('./firmware/rescue/manifest.json');
  });

  it('precaches the rescue modal module so the recovery flow loads offline', () => {
    expect(swSource).toContain('./scripts/layout/rescue-modal.js');
  });
});
