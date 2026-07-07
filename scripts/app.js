/* WebFlash 2.0 — App state machine + shell. Ported from app.jsx.
   No-build ES module. The view is mounted by scripts/shell.js inside the
   production index.html (the sole entry since PR 13 removed the 1.0 view and the
   isolated /webflash-2/ standalone preview). The mounting entry injects the
   engine accessibility primitives and the engine itself, so the view renders
   state and calls engine actions but never owns an accessibility or trust gate
   (see docs/adr/0001-webflash-2-view-over-engine.md).

   PR 4 binds Step 1 (Identify) to the real engine: kits come from the real
   catalogue (scripts/data/kits.json), selections flow through the real setState,
   and the firmware target plus installability verdict come from the engine's
   compatible-firmware lookup over manifest.json. The view never decides what is
   installable; it renders the engine verdict and routes blocked configurations
   to the ESPHome source path instead of the install flow. */
import { h, mount } from './h.js';
import { WinBar } from './ui.js';
import { IdentifyStep, resetIdentifyPickerState, setIdentifyInitialView } from './identify.js';
import { InstallStep } from './install.js';
import { ConnectStep, PRODUCT_GUIDES_URL } from './connect.js';
import { AIR, POWER, DEFAULT_SEL, selToWizardState, wizardStateToSel } from './data.js';
import { openModal } from './modal.js';

// Brand logo, resolved relative to this module via import.meta.url (mirroring how
// scripts/shell.js resolves the 2.0 stylesheet). A page-relative 'assets/…'
// resolves against the host document, so it is only correct while the document
// sits at the same depth as assets/; module-relative resolution is robust to
// where the view is mounted.
const LOGO_URL = new URL('../assets/sense360-logo.png', import.meta.url).href;

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
  recKit: null, // the catalogue's recommended kit (the recommendation card hero)
  recResolved: null, // engine verdict for recKit, resolved once (null = pending)
  sel: { ...DEFAULT_SEL },
  resolved: null, // last engine compatible-firmware verdict (null = pending)
  kitVersions: new Map(), // config_string -> firmware version, for the Browse table
  theme: 'light',
};

// The catalogue's recommended kit — the WF2-IDENTIFY-RECO recommendation card's
// fixed hero — is the entry flagged `recommended` in kits.json (S360-KIT-BATH-P),
// falling back to the first kit if no flag is set. Never invented here; it is the
// catalogue's own flag.
function recommendedKit(kits) {
  if (!Array.isArray(kits) || kits.length === 0) return null;
  return kits.find((k) => k && k.recommended) || kits[0];
}

// Resolve each catalogue kit's firmware version from the live manifest, keyed by
// config_string, so the Browse table can show a per-row version. This reuses the
// exact engine lookup the Install step uses (resolveCompatibleFirmware), so a
// row's version always matches the build that kit would flash, and it never
// hardcodes a version. The lookup is a pure manifest read (no shared-state
// mutation); a kit whose config has no published build simply gets no entry, and
// its row renders no version rather than crashing. Re-renders once resolved so
// the table fills in. Deduped by config_string (Living / Corridor share one).
async function resolveKitVersions() {
  if (!engine || !Array.isArray(state.kits) || state.kits.length === 0) return;
  const configStrings = [...new Set(
    state.kits.map((kit) => kit && kit.firmware_config_string).filter(Boolean),
  )];
  const versions = new Map();
  await Promise.all(configStrings.map(async (configString) => {
    const kit = state.kits.find((k) => k && k.firmware_config_string === configString);
    if (!kit || !kit.wizard_state) return;
    try {
      const resolved = await engine.state.resolveCompatibleFirmware(kit.wizard_state);
      const version = resolved && resolved.build && typeof resolved.build.version === 'string'
        ? resolved.build.version.trim()
        : '';
      if (version) versions.set(configString, version);
    } catch {
      /* leave unset — the row renders no version, never crashes */
    }
  }));
  state.kitVersions = versions;
  render();
}

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
// flow. Defaults to null so a bare app.js mount in a unit test (without the
// production shell) leaves the topbar Rescue button inert rather than throwing.
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
  const air = AIR.find((a) => a.id === state.sel.air);
  if (air && air.id !== 'none') bits.push(air.name.replace('Sense360 ', ''));
  if (state.sel.roomiq) bits.push('RoomIQ');
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
// Note on exclusivity: the advanced builder's single air-quality choice already
// makes AirIQ and VentIQ mutually exclusive in the view, so the builder never
// sends the engine a state it would have to reduce. The engine's enforcement
// stays authoritative for share-link hydration (wizardStateToSel collapses any
// AirIQ+VentIQ combination to one choice). RoomIQ is an independent axis.
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

  // Keep the diagnostics session in step with the live kit / custom selection so
  // a support bundle copied from any 2.0 surface reflects the current mode.
  recordDiagnosticsConfiguration();

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
// REPO-CUSTOMER-READY-001 S10 — on a step change, move keyboard / assistive
// technology focus to the new step's heading, using the same programmatic
// tabindex="-1" + focus() pattern the modal surfaces use (modal.js /
// a11y.trapFocus). Called only from the real step transitions (goTo / reset),
// never from a plain re-render, so a selection change can never steal focus
// from the control the user is operating. Falls back to the stable main
// landmark (which already carries tabindex="-1") when a step renders no
// heading.
function focusStepHeading() {
  if (!mainRegion) return;
  const heading = mainRegion.querySelector('h1');
  const target = heading || mainRegion;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

function goTo(n) {
  state.step = n;
  state.maxReached = Math.max(state.maxReached, n);
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  render();
  focusStepHeading();
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
  // Clear the Step 1 kit-chooser's local UI state (active view, search query,
  // channel filter) so a fresh flow starts on the recommendation landing with a
  // clean catalogue table.
  resetIdentifyPickerState();
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  onSelectionChanged();
  focusStepHeading();
  announceStep();
}

const setMode = (m) => { state.mode = m; state.kitError = ''; onSelectionChanged(); };
const setKit = (k) => { state.kit = k; state.kitError = ''; onSelectionChanged(); };
const setSel = (s) => { state.sel = s; onSelectionChanged(); };

// WF2-IDENTIFY-RECO — the recommendation card's "Install this kit" action.
// Commits the recommended kit (so the install gate, diagnostics, and the Install
// step all key off it) and advances, reusing the verdict already resolved for
// the recommendation card. The engine stays authoritative: we only advance when
// its verdict is installable; a blocked recommendation stays on Step 1, where the
// view routes it to the ESPHome source path. setKit's async re-resolve confirms
// the same verdict on the next render, so this never advances on a stale gate.
function onInstallKit(kit, knownResolved) {
  if (!kit) return;
  state.kit = kit;
  state.kitError = '';
  if (knownResolved) state.resolved = knownResolved;
  syncSelection(); // sync engine state + diagnostics to this commit (re-resolves)
  if (state.resolved && state.resolved.installable) {
    goTo(1);
  } else {
    render();
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  // Rebuild the window bar so the toggle's sun/moon icon reflects the new theme.
  renderWinBar();
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
// REPO-CUSTOMER-READY-001 S9 — the help copy also points at the two recovery
// surfaces so they are discoverable before a device is ever connected: the
// topbar Rescue button (the real rescue/recovery modal) and the
// troubleshooting guide.
const TROUBLESHOOTING_URL = 'https://github.com/sense360store/WebFlash/blob/main/TROUBLESHOOTING.md';
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
      h('p', null,
        'Need to recover a hub that no longer boots or connects? Use the ',
        h('b', null, 'Rescue'), ' button in the top bar — it works before any device is set up here. ',
        'For connection, driver, and browser problems, see the ',
        h('a', { href: TROUBLESHOOTING_URL, target: '_blank', rel: 'noopener noreferrer' }, 'troubleshooting guide'),
        '.'),
    ],
  });
}

// ----- diagnostics / support bundle (PR 9) -----
// Wire the engine's redacted schema_version:1 support bundle into the 2.0 view.
// The bundle builder, every section, and the redaction (passwords, tokens, MACs,
// filesystem paths, URL query strings) all live in the engine
// (scripts/services/diagnostics.js, re-exported via engine.diagnostics). The view
// only supplies a snapshot of its own resolved state and renders the copy /
// download actions. It never assembles the bundle, so it cannot leak a firmware
// binary, a raw sha256 / signature, or a Wi-Fi password — that contract is the
// engine's, not re-implemented here.
//
// The 1.0 view installs its own state provider in state.js, but that provider
// reads the 1.0 render-layer globals (window.currentFirmware /
// window.currentConfigString) that the 2.0 view never populates — it resolves
// builds through the pure engine.state.resolveCompatibleFirmware lookup instead.
// So under ?ui=2 the view installs its own provider that reflects the 2.0
// resolved build and selection. The schema and field names are unchanged; only
// the values come from the 2.0 view's own state.
function buildDiagnosticsSnapshot() {
  if (!engine || !engine.diagnostics) {
    return {};
  }

  const resolved = state.resolved;
  const build = resolved && resolved.build ? resolved.build : null;

  let configuration = {};
  try {
    configuration = engine.state.getState();
  } catch {
    configuration = {};
  }

  // Top-level manifest metadata (generated_at / manifest_version / source_commit
  // / freshness). The 2.0 view's firmware resolve loads the manifest into the
  // engine, so this is populated once a build has resolved.
  let manifestData = null;
  try {
    manifestData = engine.state.getManifestMetadataForAbout();
  } catch {
    manifestData = null;
  }
  const manifestFreshness = (manifestData && manifestData.freshness) || 'unknown';

  let releaseMode = 'normal';
  try {
    releaseMode = engine.state.getReleaseMode() || 'normal';
  } catch {
    releaseMode = 'normal';
  }

  // Recommended-default is derived (not stored on the build), so compute it at
  // snapshot time exactly as the 1.0 provider does: the resolved build is the
  // recommended default only when it is the channel model's default-selectable
  // pick among the builds matching this config_string. A preview-only config
  // resolves to a preview build, which is never default-selectable, so it reads
  // as not-recommended — matching the 1.0 bundle.
  let firmwareIsRecommendedDefault = false;
  try {
    const builds = resolved && Array.isArray(resolved.builds) ? resolved.builds : [];
    const def = engine.channels.pickDefaultBuild(builds, { mode: releaseMode });
    firmwareIsRecommendedDefault = Boolean(build && def && def === build);
  } catch {
    firmwareIsRecommendedDefault = false;
  }

  let postFlashSnapshot = null;
  try {
    postFlashSnapshot = engine.postFlash.service.getSnapshot();
  } catch {
    postFlashSnapshot = null;
  }

  return {
    configuration,
    // The 2.0 flow has three steps (Identify, Install, Connect); report them
    // 1-indexed so the bundle's current_step / max_reachable_step read honestly
    // for this view rather than borrowing the 1.0 five-step numbering.
    stepInfo: { current: state.step + 1, maxReachable: state.maxReached + 1 },
    manifestData,
    manifestFreshness,
    currentFirmware: build,
    releaseMode,
    firmwareIsRecommendedDefault,
    // channelAcknowledgementsCompleted is intentionally left unset: the 2.0
    // channel-acknowledgement state lives inside the InstallStep gate, not in a
    // shared store this snapshot can read. The engine's buildFirmwareSection then
    // falls back to "no acknowledgement required => complete", which is honest —
    // it never reports a required acknowledgement as satisfied without evidence.
    postFlashSnapshot,
    configStringRequested: (resolved && resolved.configString) || null,
  };
}

// Record the active configuration mode (kit vs custom) and the selected kit into
// the engine's diagnostics session state so the bundle's configuration section
// reflects the 2.0 selection, mirroring how the 1.0 kit-mode controller records
// it. Called on every selection change. The SKU and kit display name are product
// identifiers, not customer data; no Wi-Fi credential is ever recorded.
function recordDiagnosticsConfiguration() {
  if (!engine || !engine.diagnostics) {
    return;
  }
  if (state.mode === 'kit' && state.kit) {
    engine.diagnostics.setConfigurationMode('kit');
    engine.diagnostics.setSelectedKitSku(state.kit.sku || null);
    engine.diagnostics.setActiveKitMetadata({
      sku: state.kit.sku || null,
      display_name: state.kit.display_name || null,
      firmware_config_string: state.kit.firmware_config_string || null,
      sample: Boolean(state.kit.sample),
    });
  } else {
    engine.diagnostics.setConfigurationMode('manual');
    engine.diagnostics.setSelectedKitSku(null);
    engine.diagnostics.setActiveKitMetadata(null);
  }
}

// ----- shell -----
// The app-shell window bar (brand lockup + inline stepper + Rescue / Help /
// theme actions), the design's flow-shell FlowBar. It is rebuilt on every step
// change and theme toggle so the inline stepper and the sun/moon icon stay in
// sync. The Rescue button keeps the [data-rescue-open] / aria-haspopup hooks the
// real rescue-modal delegated handler listens for, so recovery still routes to
// the engine modal, not a reimplemented gate.
function buildWinBar() {
  return WinBar({
    steps: STEPS,
    step: state.step,
    maxReached: state.maxReached,
    onJump: goTo,
    logoUrl: LOGO_URL,
    theme: state.theme,
    guidesUrl: PRODUCT_GUIDES_URL,
    onRescue: openRescue,
    onHelp: openHelp,
    onToggleTheme: toggleTheme,
  });
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
      recKit: state.recKit, recResolved: state.recResolved, onInstallKit,
      sel: state.sel, setSel,
      resolved: state.resolved,
      kitVersions: state.kitVersions,
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

let winbarSlot;
let mainRegion;
let footSlot;
let currentMain;

// Replace the window bar in place. Used by render() on a step change (so the
// inline stepper advances) and by toggleTheme() (so the sun/moon icon flips).
function renderWinBar() {
  const node = buildWinBar();
  winbarSlot.replaceWith(node);
  winbarSlot = node;
}

function render() {
  renderWinBar();

  // A step returns either a body node (with an optional __dispose) or a
  // { body, foot } pair. `foot` is the persistent footer action bar (.winfoot)
  // for the steps that own one; the recommendation landing and the flash /
  // success states omit it, matching the design. Slice 1 keeps the existing step
  // bodies unchanged, so they return a bare body node and the footer stays hidden.
  const step = buildStep();
  const body = step && step.nodeType ? step : step.body;
  const foot = step && step.nodeType ? null : (step.foot || null);

  currentMain?.__dispose?.();
  mount(mainRegion, body);
  currentMain = body;

  if (foot) {
    mount(footSlot, foot);
    footSlot.hidden = false;
  } else {
    mount(footSlot);
    footSlot.hidden = true;
  }

  // Scroll the content body (not the page) back to the top on a step change.
  mainRegion.scrollTop = 0;
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
  state.recKit = recommendedKit(state.kits);

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
      // A deep link to a specific catalogue kit opens straight into the Browse
      // table with that kit selected (the recommendation landing is for the
      // no-link default and the fallbacks below).
      state.mode = 'kit';
      state.kit = kit;
      setIdentifyInitialView('browse');
    } else {
      // Unknown SKU: fall back to the recommendation view with a clear message
      // and the always-present "Build it module by module" escape hatch.
      state.mode = 'kit';
      state.kitError = `We couldn't find a kit matching "${requested.sku}". Pick a kit below, or switch to advanced setup to choose your boards.`;
    }
  } else {
    state.mode = 'kit';
  }

  render();

  // Resolve the recommended kit's verdict once for the recommendation card. This
  // is a pure manifest lookup (it never mutates the engine's shared state), so it
  // is independent of the committed selection: the card always renders the
  // engine's verdict for the recommended kit, while syncSelection() below
  // resolves whatever (if anything) is committed.
  if (engine && state.recKit) {
    try {
      state.recResolved = await engine.state.resolveCompatibleFirmware(state.recKit.wizard_state);
    } catch {
      state.recResolved = null;
    }
    render();
  }

  // Resolve every catalogue kit's manifest version for the Browse table. Fire and
  // forget: it re-renders once the per-config lookups settle, so the version
  // column fills in without blocking the recommendation landing or the selection.
  resolveKitVersions();

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
 * @param {object} [options.engine]     The engine facade (scripts/engine.js).
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

  // PR 9 — install the 2.0 support-bundle state provider and the delegated copy /
  // download action handler. The provider makes the engine's redacted bundle
  // reflect the 2.0 resolved build and selection; initSupportBundleActions binds
  // the [data-copy-support-bundle] / [data-download-support-bundle] controls that
  // the 2.0 preflight panel and the reused 1.0 rescue + error-log modals render.
  // Both are idempotent, so this is safe across remounts.
  if (engine && engine.diagnostics) {
    engine.diagnostics.setSupportBundleStateProvider(buildDiagnosticsSnapshot);
    engine.diagnostics.initSupportBundleActions();
  }

  document.documentElement.setAttribute('data-theme', state.theme);

  winbarSlot = buildWinBar();
  // Stable main landmark + skip-link target (the .winbody content region). render()
  // swaps the step inside it, so the id and tabindex survive every step transition.
  mainRegion = h('main', { id: 'wf2-main-content', class: 'wf2-main-region winbody', tabindex: '-1' });
  // The persistent footer action bar. Steps that own a footer (Install, Connect,
  // Browse) fill it via render(); otherwise it stays hidden.
  footSlot = h('div', { class: 'winfoot', hidden: true });

  const initial = buildStep();
  currentMain = initial && initial.nodeType ? initial : initial.body;
  mainRegion.appendChild(currentMain);

  // The app shell: a centered window (.win) with the window bar, the scrolling
  // content body, and the footer action bar, on the page background (.stage).
  const win = h('div', { class: 'win' }, winbarSlot, mainRegion, footSlot);
  const app = h('div', { class: 'stage' }, win);
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
