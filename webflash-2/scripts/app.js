/* WebFlash 2.0 — App state machine + shell. Ported from app.jsx.
   Standalone, no-build ES module. Two entry points mount this view:
     - webflash-2/scripts/shell.js   — inside the production index.html (?ui=2).
     - webflash-2/scripts/standalone.js — the isolated /webflash-2/ preview.
   Both pass the engine accessibility primitives in, so the view renders state
   and calls engine actions but never owns an accessibility or trust gate
   (see docs/adr/0001-webflash-2-view-over-engine.md). */
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { Rail } from './ui.js';
import { IdentifyStep } from './identify.js';
import { InstallStep } from './install.js';
import { ConnectStep } from './connect.js';
import { SENSING, POWER, buildTarget } from './data.js';
import { openModal } from './modal.js';

const STEPS = [
  { key: 'identify', label: 'Identify' },
  { key: 'install', label: 'Install' },
  { key: 'connect', label: 'Connect' },
];

const state = {
  step: 0,
  maxReached: 0,
  mode: 'kit',
  kit: null,
  sel: { power: 'poe', sensing: 'ventiq', fan: 'none', led: false },
  theme: 'light',
};

// Engine accessibility primitives, injected at mount time. Defaults are no-ops so
// the module never assumes a global; the real announce/focus helpers come from
// scripts/utils/a11y.js via the mounting entry point.
const a11y = {
  announce: () => {},
  trapFocus: () => () => {},
  restoreFocus: () => {},
  getFocusableElements: () => [],
};
// Honour prefers-reduced-motion for programmatic scrolling. Overridden at mount.
let prefersReducedMotion = () => false;

// Compute the active device (from kit or advanced build).
function computeDevice() {
  if (state.mode === 'kit' && state.kit) {
    return { device: { name: state.kit.name, target: state.kit.target }, isPreview: state.kit.channel === 'preview' };
  }
  const bits = [];
  const sn = SENSING.find((s) => s.id === state.sel.sensing);
  if (sn) bits.push(sn.name.replace('Sense360 ', ''));
  const pw = POWER.find((p) => p.id === state.sel.power);
  if (pw && pw.id !== 'usbc') bits.push(pw.name.replace('Sense360 ', ''));
  // Derive the preview channel from the selected modules and the resolved
  // target. Today the only advanced selection that maps to a stable WebFlash
  // build is the Bathroom PoE configuration (PoE power, VentIQ bathroom sensing,
  // no fan driver, no LED ring). Every other selection maps to a preview or
  // not-yet-stable build and must carry the preview acknowledgement into Step 2.
  // Without this, preview-only hardware such as the LED ring would reach Step 2
  // ungated (the second Codex finding on #477).
  // TODO(PR 4): replace this heuristic and buildTarget() with the 1.0 engine's
  // compatible-firmware lookup and release-channel resolution over manifest.json,
  // which returns the real channel for any selection.
  const { power, sensing, fan, led } = state.sel;
  const isStable = power === 'poe' && sensing === 'ventiq' && fan === 'none' && !led;
  return {
    device: {
      name: 'Custom Sense360 build' + (bits.length ? ' · ' + bits.join(' + ') : ''),
      target: buildTarget(state.sel),
    },
    isPreview: !isStable,
  };
}

function announceStep() {
  const label = STEPS[state.step] ? STEPS[state.step].label : '';
  a11y.announce(`Step ${state.step + 1} of ${STEPS.length}: ${label}`);
}

// ----- state transitions -----
function goTo(n) {
  state.step = n;
  state.maxReached = Math.max(state.maxReached, n);
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  render();
  announceStep();
}

function reset() {
  state.step = 0;
  state.maxReached = 0;
  state.mode = 'kit';
  state.kit = null;
  state.sel = { power: 'poe', sensing: 'ventiq', fan: 'none', led: false };
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  render();
  announceStep();
}

const setMode = (m) => { state.mode = m; render(); };
const setKit = (k) => { state.kit = k; render(); };
const setSel = (s) => { state.sel = s; render(); };

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  mount(themeBtn, icon(state.theme === 'dark' ? 'sun' : 'moon'));
}

// ----- help modal -----
// Wires the topbar Help button to an accessible dialog so the focus-trap and
// focus-restoration accessibility pattern is real and exercised in this view.
// The Rescue button stays a no-op here; PR 8 binds it to the real recovery path.
function openHelp() {
  openModal({
    title: 'WebFlash help',
    a11y,
    body: [
      h('p', null,
        'WebFlash installs Sense360 firmware straight from your browser over USB. ',
        'Use a desktop Chromium browser (Chrome, Edge, or Opera) with a USB data cable.'),
      h('p', null,
        'Step through Identify, Install, and Connect. Each step unlocks the next once ',
        'its selections are valid. Press Escape to close this dialog.'),
    ],
  });
}

// ----- shell -----
let themeBtn;
function Topbar() {
  themeBtn = h('button', { class: 'iconbtn iconbtn--square', onClick: toggleTheme, 'aria-label': 'Toggle theme' },
    icon(state.theme === 'dark' ? 'sun' : 'moon'));
  return h('div', { class: 'topbar' },
    h('div', { class: 'brand' },
      h('img', { src: 'assets/sense360-logo.png', alt: 'Sense360' }),
      h('span', { class: 'brand__name' }, 'WebFlash ', h('span', null, '· Firmware Installer')),
    ),
    h('div', { class: 'topbar__right' },
      h('button', { class: 'iconbtn', type: 'button' }, icon('life'), ' Rescue'),
      h('button', { class: 'iconbtn', type: 'button', onClick: openHelp }, icon('help'), ' Help'),
      themeBtn,
    ),
  );
}

function buildStep() {
  const { device, isPreview } = computeDevice();
  if (state.step === 0) {
    return IdentifyStep({
      mode: state.mode, setMode,
      kit: state.kit, setKit,
      sel: state.sel, setSel,
      onContinue: () => goTo(1),
    });
  }
  if (state.step === 1) {
    return InstallStep({ device, isPreview, onBack: () => goTo(0), onFlashed: () => goTo(2) });
  }
  return ConnectStep({ device, onDone: reset, onSkip: reset });
}

let railSlot;
let mainRegion;
let currentMain;

function render() {
  const railNode = Rail({ steps: STEPS, current: state.step, maxReached: state.maxReached, onJump: goTo });
  railSlot.replaceWith(railNode);
  railSlot = railNode;

  const mainNode = buildStep();
  currentMain?.__dispose?.();
  mount(mainRegion, mainNode);
  currentMain = mainNode;
}

/**
 * Mounts the WebFlash 2.0 view into the given root element.
 *
 * @param {HTMLElement} root            Mount target inside the host shell.
 * @param {object} [options]
 * @param {object} [options.a11y]       Engine accessibility primitives
 *   ({ announce, trapFocus, restoreFocus, getFocusableElements }). Supplied by
 *   the mounting entry point so the view consumes the engine rather than
 *   importing it directly.
 * @param {() => boolean} [options.prefersReducedMotion]
 */
export function mountWebFlash2(root, options = {}) {
  if (options.a11y) {
    Object.assign(a11y, options.a11y);
  }
  if (typeof options.prefersReducedMotion === 'function') {
    prefersReducedMotion = options.prefersReducedMotion;
  }

  document.documentElement.setAttribute('data-theme', state.theme);

  railSlot = Rail({ steps: STEPS, current: state.step, maxReached: state.maxReached, onJump: goTo });
  // Stable main landmark + skip-link target. render() swaps the step inside it,
  // so the id and tabindex survive every step transition.
  mainRegion = h('main', { id: 'wf2-main-content', class: 'wf2-main-region', tabindex: '-1' });
  currentMain = buildStep();
  mainRegion.appendChild(currentMain);

  const app = h('div', { class: 'app' }, Topbar(), railSlot, mainRegion);
  mount(root, app);
  announceStep();
}

export const __testHooks = Object.freeze({ STEPS, goTo });
