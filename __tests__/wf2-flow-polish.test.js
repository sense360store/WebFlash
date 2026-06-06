/**
 * WF2-FLOW-POLISH (completion) — the polish-pass items the v3 installer-flow
 * redesign still owed after the install reskin (#512) and the first polish slice
 * (#513, which landed the narrow-window shell rule and the CSP style hardening).
 *
 * This slice completes the polish spec the redesign queue tracks for the Install
 * step on the full-page shell:
 *   - device-render placeholder in the Selected device panel,
 *   - icon mapping (deviceGlyph) from the resolved config_string,
 *   - an accessibility pass on the new install panels (the status pill is a live
 *     region; the panel titles are real <h2> headings),
 *   - dark-theme rules that follow the new .statuspill (and the removal of the
 *     now-dead .statusbar rules the reskin replaced),
 *   - the deploy cache-bust the combined view change still needed.
 *
 * It is a view + CSS + deploy-marker slice. It never touches the engine, the
 * install gate, the resolved build, the manifest, firmware, release channels,
 * kits, or the service-worker fetch strategy. TRIAC stays fail-closed (no
 * FanTRIAC config resolves to an installable build, so it never reaches this
 * view), and the additive fan-control / FanDAC acknowledgements are unchanged.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { InstallStep, deviceGlyph } from '../scripts/install.js';

const ROOT = process.cwd();
const INSTALL_SRC = readFileSync(join(ROOT, 'scripts', 'install.js'), 'utf8');
const APP_CSS = readFileSync(join(ROOT, 'app.css'), 'utf8');
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const BOOTSTRAP_SRC = readFileSync(join(ROOT, 'scripts', 'bootstrap.js'), 'utf8');
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');

// Strip CSS comments so an explanatory comment that names .statusbar cannot
// satisfy (or defeat) a guard that is about the live rule.
const CSS_NO_COMMENTS = APP_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const a11yStub = { announce: jest.fn(), trapFocus: () => () => {}, restoreFocus: () => {}, getFocusableElements: () => [] };
const OK_CAPS = { webSerial: true, secureContext: true, isMobile: false, browserName: 'Chrome' };

// A minimal, fully controllable engine — the same shape the fan-control-gates
// suite uses — so the view renders without the real provenance / integrity
// machinery (which can never pass in a unit test). Nothing here is under test
// except the view's polish markup.
function makeFakeEngine() {
  const ID = {
    BROWSER_SUPPORT: 'browser-support',
    SECURE_CONTEXT: 'secure-context',
    MANIFEST_FRESHNESS: 'manifest-freshness',
    FIRMWARE_VERIFICATION: 'firmware-verification',
  };
  return {
    state: {
      INSTALL_GATE_CHECK_IDS: ID,
      evaluateInstallGate: () => ({ canInstall: true, blockingReason: '', checks: [], serviceWorker: { blocking: false } }),
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

function mountStep(target) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const node = InstallStep({
    device: { name: 'Test device', target },
    build: { config_string: target, channel: 'preview', version: '1.0.0', firmwareId: 'fw-test' },
    engine: makeFakeEngine(),
    a11y: a11yStub,
    onBack: () => {},
    onFlashed: () => {},
  });
  root.appendChild(node);
  return { root, node };
}

// ===========================================================================
// Icon mapping (deviceGlyph) — presentation only, config-driven.
// ===========================================================================
describe('WF2-FLOW-POLISH — deviceGlyph icon mapping', () => {
  it('maps a fan-driver config to the inline-driver plug glyph', () => {
    expect(deviceGlyph('Ceiling-POE-VentIQ-FanRelay-RoomIQ')).toBe('plug');
    expect(deviceGlyph('Ceiling-POE-FanPWM')).toBe('plug');
    expect(deviceGlyph('Ceiling-POE-VentIQ-FanDAC-RoomIQ')).toBe('plug');
    expect(deviceGlyph('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ')).toBe('plug');
  });

  it('maps an air-quality config to the sensor-board box glyph', () => {
    expect(deviceGlyph('Ceiling-POE-VentIQ-RoomIQ')).toBe('box');
    expect(deviceGlyph('Ceiling-POE-AirIQ-RoomIQ')).toBe('box');
  });

  it('falls back to the hub chip glyph for a plain hub config', () => {
    expect(deviceGlyph('Ceiling-POE-RoomIQ')).toBe('chip');
    expect(deviceGlyph('Ceiling-POE-RoomIQ-LED')).toBe('chip');
    expect(deviceGlyph('')).toBe('chip');
    expect(deviceGlyph(null)).toBe('chip');
    expect(deviceGlyph(undefined)).toBe('chip');
  });
});

// ===========================================================================
// Rendered markup — device render placeholder + a11y panel structure.
// ===========================================================================
describe('WF2-FLOW-POLISH — Install step polish markup', () => {
  it('renders a decorative device-render placeholder in the Selected device panel', () => {
    const { root } = mountStep('Ceiling-POE-VentIQ-RoomIQ');
    const render = root.querySelector('[data-device-render]');
    expect(render).not.toBeNull();
    // Decorative: hidden from assistive tech, and it carries a glyph (an <svg>).
    expect(render.getAttribute('aria-hidden')).toBe('true');
    expect(render.querySelector('svg')).not.toBeNull();
  });

  it('makes the pre-flight status pill a polite live region (a11y)', () => {
    const { root } = mountStep('Ceiling-POE-VentIQ-RoomIQ');
    const pill = root.querySelector('.statuspill');
    expect(pill).not.toBeNull();
    expect(pill.getAttribute('role')).toBe('status');
    expect(pill.getAttribute('aria-live')).toBe('polite');
  });

  it('promotes the panel titles to <h2> headings under the step <h1>', () => {
    const { root } = mountStep('Ceiling-POE-VentIQ-RoomIQ');
    expect(root.querySelector('h1')).not.toBeNull();
    const titles = [...root.querySelectorAll('h2.panel__title')].map((el) => el.textContent);
    expect(titles).toEqual(expect.arrayContaining(['Pre-flight checks', 'Selected device', 'Confirm & install']));
  });

  it('does not regress the install affordance: install button still lives in the .stepnav', () => {
    const { root } = mountStep('Ceiling-POE-VentIQ-RoomIQ');
    expect(root.querySelector('.stepnav .btn--lg')).not.toBeNull();
  });
});

// ===========================================================================
// Source / stylesheet guards — dark theme, dead-rule cleanup, reduced motion.
// ===========================================================================
describe('WF2-FLOW-POLISH — stylesheet polish', () => {
  it('routes the dark-mode status brighten to the .statuspill (not the removed .statusbar)', () => {
    expect(APP_CSS).toMatch(/:root\[data-theme="dark"\]\s*\.statuspill--ok/);
    expect(APP_CSS).toMatch(/:root\[data-theme="dark"\]\s*\.statuspill--wait/);
  });

  it('removes the now-dead .statusbar rules the reskin replaced', () => {
    // The live rule (and its --ok/--wait/--err variants) must be gone; an
    // explanatory comment that mentions .statusbar is stripped before matching.
    expect(CSS_NO_COMMENTS).not.toMatch(/\.statusbar(--[a-z]+)?\s*\{/);
  });

  it('resets the heading margin on the now-<h2> panel titles', () => {
    expect(APP_CSS).toMatch(/\.panel__title\s*\{[^}]*margin:\s*0/);
  });

  it('adds the device-render placeholder styles', () => {
    expect(APP_CSS).toMatch(/\.install__devicebox/);
  });

  it('keeps the global reduced-motion guard that covers the new transitions', () => {
    expect(APP_CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

// ===========================================================================
// Deploy cache-bust — the combined v3 view change must re-prime returning users.
// ===========================================================================
describe('WF2-FLOW-POLISH — deploy cache-bust in lockstep', () => {
  it('keeps the index.html ?v= token and bootstrap APP_SHELL_BUILD in lockstep', () => {
    const htmlToken = /\?v=(\d+)"/.exec(INDEX_HTML);
    const bootstrapToken = /APP_SHELL_BUILD\s*=\s*'(\d+)'/.exec(BOOTSTRAP_SRC);
    expect(htmlToken).not.toBeNull();
    expect(bootstrapToken).not.toBeNull();
    expect(htmlToken[1]).toBe(bootstrapToken[1]);
    // Every ?v= query in index.html shares the one token.
    const tokens = [...INDEX_HTML.matchAll(/\?v=(\d+)"/g)].map((m) => m[1]);
    expect(new Set(tokens).size).toBe(1);
  });

  it('advances the service-worker cache name past the pre-redesign baseline', () => {
    const m = /const\s+CACHE_NAME\s*=\s*'webflash-v(\d+)'/.exec(SW_SRC);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(18);
  });

  it('keeps a webflash-app-shell marker present for the support bundle', () => {
    expect(INDEX_HTML).toMatch(/name="webflash-app-shell"\s+content="[\d-]+"/);
  });
});

// ===========================================================================
// Source-level pins so the polish wiring cannot silently regress.
// ===========================================================================
describe('WF2-FLOW-POLISH — install.js wiring', () => {
  it('exports the deviceGlyph icon-mapping helper', () => {
    expect(INSTALL_SRC).toMatch(/export function deviceGlyph/);
  });

  it('declares the status pill as a polite live region', () => {
    expect(INSTALL_SRC).toMatch(/statuspillEl\s*=\s*h\([^)]*role:\s*'status'/s);
    expect(INSTALL_SRC).toMatch(/statuspillEl\s*=\s*h\([^)]*aria-live':\s*'polite'/s);
  });

  it('renders the device-render placeholder hook', () => {
    expect(INSTALL_SRC).toMatch(/data-device-render/);
  });
});
