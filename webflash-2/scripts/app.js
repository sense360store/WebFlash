/* WebFlash 2.0 — App state machine + shell. Ported from app.jsx.
   Standalone, no-build ES module. Two entry points mount this view:
     - webflash-2/scripts/shell.js   — inside the production index.html (?ui=2).
     - webflash-2/scripts/standalone.js — the isolated /webflash-2/ preview.
   Both inject the engine accessibility primitives, and (PR 4) the engine itself,
   so the view renders state and calls engine actions but never owns an
   accessibility or trust gate (see docs/adr/0001-webflash-2-view-over-engine.md).

   PR 4 binds Step 1 (Identify) to the real engine: kits come from the real
   catalogue (scripts/data/kits.json), selections flow through the real setState,
   and the firmware target plus installability verdict come from the engine's
   compatible-firmware lookup over manifest.json. The view never decides what is
   installable; it renders the engine verdict and routes blocked configurations
   to the ESPHome source path instead of the install flow. */
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { Rail } from './ui.js';
import { IdentifyStep } from './identify.js';
import { InstallStep } from './install.js';
import { ConnectStep } from './connect.js';
import { SENSING, POWER, DEFAULT_SEL, selToWizardState, wizardStateToSel } from './data.js';
import { openModal } from './modal.js';

const STEPS = [
  { key: 'identify', label: 'Identify' },
  { key: 'install', label: 'Install' },
  { key: 'connect', label: 'Connect' },
];

// Where a blocked configuration (no signed WebFlash build) is routed. This is
// the same open-source path the 1.0 view points to for unsupported selections.
const ESPHOME_SOURCE_URL = 'https://github.com/sense360store/esphome-public';

const state = {
  step: 0,
  maxReached: 0,
  mode: 'kit', // 'kit' | 'advanced'
  kits: [], // catalogue kits (from engine.kits.loadKitCatalog)
  kitError: '', // unknown-SKU fallback message
  kit: null, // selected catalogue kit
  sel: { ...DEFAULT_SEL },
  resolved: null, // last engine compatible-firmware verdict (null = pending)
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

// The 1.0 engine, injected at mount time (engine.js facade). When absent (a bare
// app.js mount in a unit test of the shell scaffolding), Step 1 renders its
// loading state and resolves nothing — there is no simulated fallback path.
let engine = null;

// The real recovery path, injected at mount time by the production shell
// (shell.js) as { openRescueModal }. It is the unchanged 1.0 rescue/recovery
// modal (scripts/layout/rescue-modal.js): the real rescue manifest, the
// erase-first install, the acknowledgement gate, and its own focus trap and
// restoration. The view only triggers it; it never reimplements the recovery
// flow. Left null in the isolated /webflash-2/ preview, which does not load the
// 1.0 stylesheet or ESP Web Tools, so the topbar Rescue button stays inert there.
let recovery = null;

// Monotonic token so a slow resolve from a superseded selection can never
// overwrite the verdict for the current one.
let resolveToken = 0;

// Compute the active device + the engine verdict for the current selection.
function computeDevice() {
  const resolved = state.resolved;
  if (state.mode === 'kit' && state.kit) {
    return {
      device: {
        name: state.kit.display_name || state.kit.sku,
        target: (resolved && resolved.configString) || state.kit.firmware_config_string || '',
      },
      isPreview: resolved ? resolved.isPreview : state.kit.firmware_channel === 'preview',
      installable: resolved ? resolved.installable : false,
    };
  }

  const bits = [];
  const sn = SENSING.find((s) => s.id === state.sel.sensing);
  if (sn) bits.push(sn.name.replace('Sense360 ', ''));
  const pw = POWER.find((p) => p.id === state.sel.power);
  if (pw && pw.id !== 'usbc') bits.push(pw.name.replace('Sense360 ', ''));
  return {
    device: {
      name: 'Custom Sense360 build' + (bits.length ? ' · ' + bits.join(' + ') : ''),
      target: (resolved && resolved.configString) || '',
    },
    isPreview: resolved ? resolved.isPreview : false,
    installable: resolved ? resolved.installable : false,
  };
}

function announceStep() {
  const label = STEPS[state.step] ? STEPS[state.step].label : '';
  a11y.announce(`Step ${state.step + 1} of ${STEPS.length}: ${label}`);
}

// Push the current Step 1 selection through the real engine and resolve the
// matching firmware. The wizard state is built from the view selection by
// selToWizardState() (kit mode uses the kit's own wizard_state). setState() is
// the authoritative engine transition — it keeps the engine state, the URL, and
// diagnostics in sync and applies AirIQ/VentIQ exclusivity and the bathroom
// toggle. resolveCompatibleFirmware() then returns the real manifest verdict
// (installable / preview / blocked) by config_string. The verdict is computed
// purely from the snapshot, so it is correct regardless of the host DOM.
//
// Note on exclusivity: the advanced builder's single "sensing" choice already
// makes AirIQ and VentIQ mutually exclusive in the view, so the builder never
// sends the engine a state it would have to reduce. The engine's enforcement
// stays authoritative for share-link hydration (wizardStateToSel collapses any
// AirIQ+VentIQ combination to one choice).
async function syncSelection() {
  const token = ++resolveToken;
  let wizardState = null;

  if (state.mode === 'kit' && state.kit) {
    wizardState = state.kit.wizard_state;
  } else if (state.mode === 'advanced') {
    wizardState = selToWizardState(state.sel);
  }

  if (engine && wizardState) {
    engine.state.setState(wizardState, { skipUrlUpdate: true });
  }

  render();

  if (!engine || !wizardState) {
    return;
  }

  try {
    const resolved = await engine.state.resolveCompatibleFirmware(wizardState);
    if (token !== resolveToken) return;
    state.resolved = resolved;
  } catch {
    if (token !== resolveToken) return;
    state.resolved = { configString: '', builds: [], build: null, installable: false, isPreview: false, channel: null, reason: 'no-build' };
  }
  render();
}

// A selection changed: mark the verdict pending, then re-resolve.
function onSelectionChanged() {
  state.resolved = null;
  syncSelection();
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
  state.kitError = '';
  state.sel = { ...DEFAULT_SEL };
  state.resolved = null;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  onSelectionChanged();
  announceStep();
}

const setMode = (m) => { state.mode = m; state.kitError = ''; onSelectionChanged(); };
const setKit = (k) => { state.kit = k; state.kitError = ''; onSelectionChanged(); };
const setSel = (s) => { state.sel = s; onSelectionChanged(); };

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  mount(themeBtn, icon(state.theme === 'dark' ? 'sun' : 'moon'));
}

// ----- recovery / rescue -----
// Opens the real 1.0 rescue/recovery modal (scripts/layout/rescue-modal.js),
// injected by the production shell as `recovery.openRescueModal`. The modal owns
// its own accessible focus trap and restoration, the real rescue manifest, and
// the erase-first install behind the acknowledgement gate, so the view never
// owns the recovery trust gate. No-op when recovery is not wired (the isolated
// preview), matching the pre-PR-8 inert button.
function openRescue(event) {
  if (!recovery || typeof recovery.openRescueModal !== 'function') return;
  const trigger = event && event.currentTarget ? event.currentTarget : null;
  recovery.openRescueModal({ trigger });
}

// ----- help modal -----
// Wires the topbar Help button to an accessible dialog so the focus-trap and
// focus-restoration accessibility pattern is real and exercised in this view.
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
      h('button',
        { class: 'iconbtn', type: 'button', 'data-rescue-open': '', 'aria-haspopup': 'dialog', onClick: openRescue },
        icon('life'), ' Rescue'),
      h('button', { class: 'iconbtn', type: 'button', onClick: openHelp }, icon('help'), ' Help'),
      themeBtn,
    ),
  );
}

function buildStep() {
  const { device } = computeDevice();
  // The resolved manifest build entry (PR 4 lookup) is what the PR 5 install
  // gate validates: provenance, SHA-256 integrity, and the channel
  // acknowledgement identity all key off it. Null until Step 1 resolves a build.
  const build = state.resolved && state.resolved.build ? state.resolved.build : null;
  if (state.step === 0) {
    return IdentifyStep({
      mode: state.mode, setMode,
      kits: state.kits, kitError: state.kitError,
      kit: state.kit, setKit,
      sel: state.sel, setSel,
      resolved: state.resolved,
      sourceUrl: ESPHOME_SOURCE_URL,
      onContinue: () => goTo(1),
    });
  }
  if (state.step === 1) {
    return InstallStep({ device, build, engine, a11y, onBack: () => goTo(0), onFlashed: () => goTo(2) });
  }
  // PR 7 — the Connect step renders the engine's post-flash validation panel
  // (eight states), with the Home Assistant handoff shown only for improv:true
  // builds. The engine + resolved build are passed so the panel reads the real
  // snapshot; it never reads or stores Wi-Fi credentials.
  return ConnectStep({ device, build, engine, a11y, onDone: reset, onSkip: reset });
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

// Read the requested Step 1 mode + kit SKU from the URL, mirroring the 1.0
// kit-mode contract: ?configmode=kit[&sku=…], ?configmode=custom|manual, or a
// legacy manual share link (mount/power/module params). A dedicated configmode=
// namespace keeps the kit picker independent of the release-mode ?mode= knob.
function getRequestedModeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const configMode = (params.get('configmode') || '').toLowerCase();
    const sku = params.get('sku');

    if (configMode === 'manual' || configMode === 'custom') {
      return { mode: 'advanced', sku: '' };
    }
    if (configMode === 'kit' || sku) {
      return { mode: 'kit', sku: sku || '' };
    }
    if (urlHasManualMarkers()) {
      return { mode: 'advanced', sku: '' };
    }
  } catch {
    // ignore malformed URLs
  }
  return { mode: 'kit', sku: '' };
}

// True when the URL carries explicit manual configuration params (the legacy
// share-link shape). Used to decide whether to hydrate the advanced builder from
// the engine state: a bare ?configmode=manual keeps the builder default, while a
// real share link with module params hydrates from the engine.
function urlHasManualMarkers() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const manualMarkers = ['core', 'mount', 'power', 'airiq', 'ventiq', 'roomiq', 'fan', 'led', 'voice', 'bathroom'];
    return manualMarkers.some((key) => params.has(key));
  } catch {
    return false;
  }
}

// Load the real kit catalogue and hydrate Step 1 from the URL, then resolve the
// initial selection against the engine.
async function initFromEngine() {
  // Honour the release-mode opt-in (?mode=recovery / ?mode=development) before
  // resolving any firmware. The engine's resolveCompatibleFirmware and the
  // channel model read getReleaseMode(), so applying the URL mode here makes
  // development and recovery build visibility behave exactly as the 1.0 view
  // does. Normal loads (no ?mode) stay on the production 'normal' mode.
  if (engine.state && typeof engine.state.setReleaseModeFromUrl === 'function') {
    try {
      engine.state.setReleaseModeFromUrl(new URLSearchParams(window.location.search || ''));
    } catch {
      // Malformed URL: the engine defaults to safe 'normal' mode itself.
    }
  }

  let catalog = { kits: [], skipped: [] };
  try {
    catalog = await engine.kits.loadKitCatalog();
  } catch {
    catalog = { kits: [], skipped: [] };
  }
  // The loader already drops invalid (skipped) entries; only valid kits surface.
  state.kits = Array.isArray(catalog.kits) ? catalog.kits.slice() : [];

  const requested = getRequestedModeFromUrl();
  if (requested.mode === 'advanced') {
    state.mode = 'advanced';
    // A real manual share link (module params present) hydrates the builder from
    // the engine state that initializeWizard() already applied from the URL. A
    // bare ?configmode=manual keeps the supported Bathroom PoE default.
    if (urlHasManualMarkers()) {
      try {
        state.sel = wizardStateToSel(engine.state.getState());
      } catch {
        state.sel = { ...DEFAULT_SEL };
      }
    } else {
      state.sel = { ...DEFAULT_SEL };
    }
  } else if (requested.sku) {
    const kit = engine.kits.findKitBySku(catalog, requested.sku);
    if (kit) {
      state.mode = 'kit';
      state.kit = kit;
    } else {
      // Unknown SKU: fall back to the kit picker with a clear message and a
      // one-click switch to the advanced builder (the "Build it module by
      // module" hatch already renders below the kit list).
      state.mode = 'kit';
      state.kitError = `We couldn't find a kit matching "${requested.sku}". Pick a kit below, or switch to advanced setup to choose your boards.`;
    }
  } else {
    state.mode = 'kit';
  }

  render();
  syncSelection();
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
 * @param {object} [options.engine]     The engine facade (webflash-2/scripts/engine.js).
 *   Required for the real Step 1 binding (kits, setState, firmware lookup).
 * @param {object} [options.recovery]   The real recovery path
 *   ({ openRescueModal }) from scripts/layout/rescue-modal.js. Supplied by the
 *   production shell (PR 8) so the topbar Rescue button opens the real rescue
 *   modal. Omitted by the isolated preview, which leaves the button inert.
 * @param {() => boolean} [options.prefersReducedMotion]
 */
export function mountWebFlash2(root, options = {}) {
  if (options.a11y) {
    Object.assign(a11y, options.a11y);
  }
  if (typeof options.prefersReducedMotion === 'function') {
    prefersReducedMotion = options.prefersReducedMotion;
  }
  if (options.engine) {
    engine = options.engine;
  }
  if (options.recovery) {
    recovery = options.recovery;
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

  if (engine) {
    initFromEngine();
  }
}

export const __testHooks = Object.freeze({
  STEPS,
  goTo,
  getRequestedModeFromUrl,
  getState: () => state,
  getRecovery: () => recovery,
});
