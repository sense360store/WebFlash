/* WebFlash 2.0 — App state machine + shell. Ported from app.jsx.
   Standalone, no-build ES module entry point for the /webflash-2/ preview. */
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { Rail } from './ui.js';
import { IdentifyStep } from './identify.js';
import { InstallStep } from './install.js';
import { ConnectStep } from './connect.js';
import { SENSING, POWER, buildTarget } from './data.js';

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
  return {
    device: {
      name: 'Custom Sense360 build' + (bits.length ? ' · ' + bits.join(' + ') : ''),
      target: buildTarget(state.sel),
    },
    isPreview: false,
  };
}

// ----- state transitions -----
function goTo(n) {
  state.step = n;
  state.maxReached = Math.max(state.maxReached, n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

function reset() {
  state.step = 0;
  state.maxReached = 0;
  state.mode = 'kit';
  state.kit = null;
  state.sel = { power: 'poe', sensing: 'ventiq', fan: 'none', led: false };
  window.scrollTo({ top: 0 });
  render();
}

const setMode = (m) => { state.mode = m; render(); };
const setKit = (k) => { state.kit = k; render(); };
const setSel = (s) => { state.sel = s; render(); };

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  mount(themeBtn, icon(state.theme === 'dark' ? 'sun' : 'moon'));
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
      h('button', { class: 'iconbtn', type: 'button' }, icon('help'), ' Help'),
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
let currentMain;

function render() {
  const railNode = Rail({ steps: STEPS, current: state.step, maxReached: state.maxReached, onJump: goTo });
  railSlot.replaceWith(railNode);
  railSlot = railNode;

  const mainNode = buildStep();
  if (currentMain) {
    currentMain.__dispose?.();
    currentMain.replaceWith(mainNode);
  }
  currentMain = mainNode;
}

function mountApp() {
  document.documentElement.setAttribute('data-theme', state.theme);
  railSlot = Rail({ steps: STEPS, current: state.step, maxReached: state.maxReached, onJump: goTo });
  currentMain = buildStep();
  const app = h('div', { class: 'app' }, Topbar(), railSlot, currentMain);
  mount(document.getElementById('root'), app);
}

mountApp();
