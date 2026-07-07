/**
 * PRODUCT-GUIDES-001 G3 — surfacing the customer product guides in WebFlash.
 *
 * G3 adds three guide surfaces to the flasher:
 *   - a post-install "next steps" element in the Connect step that links the
 *     flashed configuration's product guide (config_string -> guide URL), with
 *     an honest fallback to the guides overview for any configuration that has
 *     no dedicated guide (for example Rescue);
 *   - a Guides link in the app-shell window bar (scripts/ui.js WinBar), wired by
 *     scripts/app.js;
 *   - Guides links in README.md and SUPPORT.md.
 *
 * These tests pin the config_string -> guide-URL mapping and the surfaces that
 * consume it. They never assert firmware, release, or gate behaviour — G3
 * changes none of that.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

describe('PRODUCT-GUIDES-001 G3 — config_string to guide-URL mapping', () => {
  let productGuideLink;
  let PRODUCT_GUIDES_URL;
  let PRODUCT_GUIDE_PATHS;

  beforeEach(async () => {
    jest.resetModules();
    ({ productGuideLink, PRODUCT_GUIDES_URL, PRODUCT_GUIDE_PATHS } = await import('../scripts/connect.js'));
  });

  it('points at the Pages site published from esphome-public', () => {
    expect(PRODUCT_GUIDES_URL).toBe('https://sense360store.github.io/esphome-public/');
  });

  it('maps each of the four served configurations to its own guide', () => {
    const served = [
      'Ceiling-POE-RoomIQ',
      'Ceiling-POE-AirIQ-RoomIQ',
      'Ceiling-POE-VentIQ-RoomIQ',
      'Ceiling-POE-VentIQ-RoomIQ-LED',
    ];
    served.forEach((config) => {
      const link = productGuideLink(config);
      expect(link.exact).toBe(true);
      expect(link.url.startsWith(PRODUCT_GUIDES_URL)).toBe(true);
      expect(link.url).toBe(PRODUCT_GUIDES_URL + PRODUCT_GUIDE_PATHS[config]);
      // A per-product guide lives under products/<slug>/.
      expect(link.url).toMatch(/\/products\/ceiling-poe-[a-z-]+\/$/);
    });
  });

  it('falls back to the guides overview for a configuration without a guide', () => {
    ['Rescue', '', 'Ceiling-USBC-RoomIQ', 'not-a-config'].forEach((config) => {
      const link = productGuideLink(config);
      expect(link.exact).toBe(false);
      expect(link.url).toBe(PRODUCT_GUIDES_URL + 'products/');
    });
  });

  it('tolerates non-string input without throwing', () => {
    [null, undefined, 42, {}].forEach((bad) => {
      const link = productGuideLink(bad);
      expect(link.exact).toBe(false);
      expect(link.url).toBe(PRODUCT_GUIDES_URL + 'products/');
    });
  });
});

describe('PRODUCT-GUIDES-001 G3 — the Connect step post-install guide handoff', () => {
  let engine;
  let ConnectStep;
  let PRODUCT_GUIDES_URL;
  const a11yStub = {
    announce: jest.fn(),
    trapFocus: () => () => {},
    restoreFocus: () => {},
    getFocusableElements: () => [],
  };

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

  const IMPROV_BUILD = Object.freeze({
    name: 'Sense360 Modular Platform Firmware',
    version: '2.0.0',
    channel: 'stable',
    config_string: 'Ceiling-POE-VentIQ-RoomIQ',
    improv: true,
  });

  const RESCUE_BUILD = Object.freeze({
    name: 'Sense360 Rescue',
    version: '2.0.0',
    channel: 'stable',
    config_string: 'Rescue',
    improv: false,
  });

  beforeEach(async () => {
    jest.resetModules();
    a11yStub.announce.mockReset();
    global.fetch = makeFetch();
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
    engine = (await import('../scripts/engine.js')).default;
    ({ ConnectStep, PRODUCT_GUIDES_URL } = await import('../scripts/connect.js'));
    engine.postFlash.service.reset();
  });

  function mountConnect(build) {
    const node = ConnectStep({
      device: { name: build ? build.name : 'Test device', target: build ? build.config_string : '' },
      build: build || null,
      engine,
      a11y: a11yStub,
      onDone: () => {},
      onSkip: () => {},
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(node);
    return root;
  }

  it('links the flashed product guide after a completed flash', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    engine.postFlash.service.__unsafeForceValidationClose();
    const root = mountConnect(IMPROV_BUILD);

    const handoff = root.querySelector('[data-post-flash-handoff="product-guide"]');
    expect(handoff).not.toBeNull();
    const link = handoff.querySelector('[data-post-flash-guide-open]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(PRODUCT_GUIDES_URL + 'products/ceiling-poe-ventiq-roomiq/');
    expect(link.dataset.guideMatch).toBe('exact');
    // External link hygiene.
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('falls back to the guides overview for a configuration without a guide', () => {
    engine.postFlash.service.captureSelectedBuild(RESCUE_BUILD);
    engine.postFlash.service.dispatchLifecycle({ state: 'finished' });
    engine.postFlash.service.__unsafeForceValidationClose();
    const root = mountConnect(RESCUE_BUILD);

    const link = root.querySelector('[data-post-flash-guide-open]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(PRODUCT_GUIDES_URL + 'products/');
    expect(link.dataset.guideMatch).toBe('overview');
  });

  it('does not show the guide handoff before a flash has completed', () => {
    engine.postFlash.service.captureSelectedBuild(IMPROV_BUILD);
    const root = mountConnect(IMPROV_BUILD);
    expect(root.querySelector('[data-wf2-post-flash-panel]').dataset.state).toBe('not_started');
    expect(root.querySelector('[data-post-flash-handoff="product-guide"]')).toBeNull();
  });

  it('does not show the guide handoff on a failed flash', () => {
    engine.postFlash.service.dispatchLifecycle({ state: 'preparing' });
    engine.postFlash.service.dispatchLifecycle({ state: 'error', message: 'cable dropped' });
    const root = mountConnect(IMPROV_BUILD);
    expect(root.querySelector('[data-wf2-post-flash-panel]').dataset.state).toBe('failed');
    expect(root.querySelector('[data-post-flash-handoff="product-guide"]')).toBeNull();
  });
});

describe('PRODUCT-GUIDES-001 G3 — the shell Guides link', () => {
  let WinBar;
  const STEPS = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '';
    ({ WinBar } = await import('../scripts/ui.js'));
  });

  it('renders a Guides link in the window bar when a guides URL is supplied', () => {
    const bar = WinBar({
      steps: STEPS, step: 0, maxReached: 1, onJump: () => {},
      logoUrl: 'logo.png', theme: 'light',
      guidesUrl: 'https://sense360store.github.io/esphome-public/',
      onRescue: () => {}, onHelp: () => {}, onToggleTheme: () => {},
    });
    const link = bar.querySelector('[data-guides-link]');
    expect(link).not.toBeNull();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://sense360store.github.io/esphome-public/');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toMatch(/guides/i);
  });

  it('omits the Guides link when no guides URL is supplied (bare scaffold mount)', () => {
    const bar = WinBar({
      steps: STEPS, step: 0, maxReached: 1, onJump: () => {},
      logoUrl: 'logo.png', theme: 'light',
      onRescue: () => {}, onHelp: () => {}, onToggleTheme: () => {},
    });
    expect(bar.querySelector('[data-guides-link]')).toBeNull();
  });
});

describe('PRODUCT-GUIDES-001 G3 — README and SUPPORT link the guides site', () => {
  const GUIDES_URL = 'https://sense360store.github.io/esphome-public/';

  it('README.md links the product guides', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain(GUIDES_URL);
    expect(readme.toLowerCase()).toContain('product guide');
  });

  it('SUPPORT.md links the product guides', () => {
    const support = readFileSync(join(ROOT, 'SUPPORT.md'), 'utf8');
    expect(support).toContain(GUIDES_URL);
    expect(support.toLowerCase()).toContain('product guide');
  });
});
