/* WebFlash 2.0 — Step 2: Install firmware. Ported from install.jsx.

   PR 5 of the WebFlash 2.0 migration replaced the simulated readiness checklist
   (the CHECKS array that auto-passed on setTimeout) with the real composite
   install gate, composed from the engine:
     - capability detection (Web Serial, secure context) via engine.capabilities,
     - static provenance via engine.provenance.validateFirmwareProvenance,
     - SHA-256 verification of the downloaded bytes via
       engine.state.verifyFirmwareIntegrity (SubtleCrypto in state.js),
     - manifest freshness via engine.freshness.checkManifestFreshness,
     - service-worker update via engine.swUpdate.getServiceWorkerState,
     - the seven-tier channel acknowledgement, bound to the firmware-identity
       signature via engine.channels.getFirmwareAcknowledgementSignature,
     - and the before-you-flash acknowledgement.
   engine.state.evaluateInstallGate folds those verdicts into a single
   machine-readable result; this view renders the preflight panel by stable
   check id (engine.state.INSTALL_GATE_CHECK_IDS) and arms install only when
   the gate passes. The view never owns a gate decision.

   PR 6 of the WebFlash 2.0 migration replaces the simulated flash (the
   FLASH_PHASES array plus a requestAnimationFrame ring) with real flashing
   through the ESP Web Tools <esp-web-install-button> web component, the same
   component the 1.0 view uses. The PR 5 gate stays authoritative over whether
   the component's activate button is armed; ESP Web Tools then drives
   connect / erase / write / verify, and this view maps its lifecycle events
   (initializing, manifest, preparing, erasing, writing, finished, error) onto
   the 2.0 progress ring and console. The ring and console are a live mirror of
   real esptool state, never a timer. Desktop Chromium stays enforced by the gate
   (Web Serial plus secure context), by the component's own unsupported /
   not-allowed fallbacks, and by an explicit mobile / unsupported banner derived
   from engine.capabilities.evaluateBrowserReadiness. */
import { h, mount, fromHTML } from './h.js';
import { icon } from './icons.js';
import { StepHead, DeviceChip } from './ui.js';

// Provenance + integrity always run in production trust mode, matching the 1.0
// install-trust mode (verifyCurrentFirmwareIntegrity hard-codes production): the
// deployed wizard refuses dev/test-key signatures and placeholder binaries. On
// the live (re-signed) deployment the stable build passes; on a local dev
// checkout the committed dev-signed stable build blocks here exactly as it does
// in the 1.0 view. The view never relaxes this.
const GATE_MODE = 'production';

// Maps the engine's machine-readable check status to the preflight row icon.
// Read by status (pass/warn/fail/pending), never by parsing the detail copy.
const READY_ICON = {
  pass: { cls: 'ready__ico--ok', name: 'check' },
  pending: { cls: 'ready__ico--wait', name: 'spinner', spin: true },
  warn: { cls: 'ready__ico--warn', name: 'alert' },
  fail: { cls: 'ready__ico--err', name: 'alert' },
};

function readyItem(name, sub, status) {
  const m = READY_ICON[status] || READY_ICON.pending;
  return h('div', { class: 'ready__item' },
    h('span', { class: 'ready__ico ' + m.cls }, icon(m.name, { cls: m.spin ? 'spin' : '' })),
    h('div', { class: 'ready__main' },
      h('div', { class: 'ready__name' }, name),
      h('div', { class: 'ready__sub' }, sub),
    ),
  );
}

// ESP Web Tools FlashState (the `state-changed` event detail.state) mapped onto
// the 2.0 progress ring. The lifecycle is OWNED by the upstream component; this
// table only describes how each real phase reads on the ring (phase label, sub
// copy, and the ring baseline percentage). The WRITING phase additionally tracks
// the real esptool byte percentage (detail.details.percentage). These are the
// canonical esp-web-tools FlashStateType values; any other state (idle, improv,
// …) is ignored here — PR 7 owns the connect/post-flash surface.
const FLASH_PHASE_META = Object.freeze({
  initializing: { label: 'Initializing', sub: 'Opening the serial port to your hub', pct: 3 },
  manifest: { label: 'Reading manifest', sub: 'Loading the firmware build list', pct: 8 },
  preparing: { label: 'Preparing', sub: 'Preparing the installation', pct: 14 },
  erasing: { label: 'Erasing', sub: 'Clearing the existing firmware', pct: 22 },
  writing: { label: 'Writing firmware', sub: 'Keep the hub powered and connected over USB', pct: 25 },
  finished: { label: 'Firmware installed', sub: 'Firmware written to your hub', pct: 100 },
  error: { label: 'Installation failed', sub: 'Check the details below, then try again', pct: 0 },
});
// During WRITING the ring tracks the real esptool byte percentage across this
// band (writing 0% -> 25, writing 100% -> 98), so the pre-write phases keep a
// short ramp and the finished state snaps to 100.
const WRITE_RING_BASE = 25;
const WRITE_RING_SPAN = 73;

// True when the ESP Web Tools custom element is registered. The production
// index.html loads it from the unpkg origin allowed by the CSP, so it is present
// there. In a unit test (or any host that loads no third-party script) the
// component is absent; this flag lets the view show an honest notice instead of
// an inert button.
function espWebToolsRegistered() {
  return typeof customElements !== 'undefined'
    && typeof customElements.get === 'function'
    && Boolean(customElements.get('esp-web-install-button'));
}

/**
 * @param {object} props
 * @param {{name: string, target: string}} props.device
 * @param {object|null} [props.build]   The resolved manifest build entry.
 * @param {object|null} [props.engine]  The engine facade (scripts/engine.js).
 * @param {object|null} [props.a11y]    Engine accessibility primitives (announce).
 * @param {() => void} props.onBack
 * @param {() => void} props.onFlashed
 */
export function InstallStep({ device, build = null, engine = null, a11y = null, onBack, onFlashed }) {
  const mainEl = h('div', { class: 'main' });

  // ----- engine-derived inputs, fixed for this build -----
  const capabilities = engine ? engine.capabilities.detectCapabilities() : null;
  const provenance = (engine && build) ? engine.provenance.validateFirmwareProvenance(build, { mode: GATE_MODE }) : null;
  const requiredAcks = (engine && build) ? engine.channels.getRequiredAcknowledgements(build) : [];
  const channelWarnings = (engine && build) ? engine.channels.getFirmwareWarnings(build) : [];
  // The firmware-identity signature binds every acknowledgement to THIS build.
  // A different resolved build yields a different signature, so a prior
  // acknowledgement no longer satisfies the gate (prune-on-mismatch).
  const signature = (engine && build) ? engine.channels.getFirmwareAcknowledgementSignature(build) : null;
  const MANIFEST_FRESHNESS_ID = engine ? engine.state.INSTALL_GATE_CHECK_IDS.MANIFEST_FRESHNESS : 'manifest-freshness';

  // ----- mutable gate inputs -----
  let integrity = null;                                // async SHA-256 result
  let freshness = { verdict: 'pending', acknowledged: false };
  let beforeFlashAck = false;
  const channelAccepted = new Map();                   // ackKey -> signature it was accepted against
  let gate = null;
  let wasReady = false;

  // ----- real flash-progress state (driven by ESP Web Tools, never a timer) -----
  // The ring + console nodes are built lazily on the first lifecycle event; these
  // references and the transition trackers are mutated only by handleFlashLifecycle.
  let ringFg = null;
  let ringPctText = null;
  let ringCirc = 0;
  let phaseEl = null;
  let subEl = null;
  let consoleEl = null;
  let errorEl = null;
  let flashStarted = false;
  let lastState = '';
  let lastConsoleLine = '';
  let lastWriteBucket = -1;

  // ----- async lifecycle -----
  let disposed = false;
  const abort = (typeof AbortController === 'function') ? new AbortController() : { abort() {}, signal: undefined };
  let doneTimer = 0;
  mainEl.__dispose = () => {
    disposed = true;
    try { abort.abort(); } catch { /* AbortController not available */ }
    if (doneTimer) clearTimeout(doneTimer);
  };

  // ----- scaffolding -----
  const statusbarEl = h('div', { class: 'statusbar' });
  const readyInner = h('div', { class: 'ready' });
  const swNoticeEl = h('div', { class: 'callout callout--warn', hidden: true });
  // Desktop-only / mobile fallback. The PR 5 gate is the real block (its
  // browser-support row fails on mobile or without Web Serial); this banner is
  // the prominent, plain-language message that the install path will not work.
  const unsupportedBannerEl = h('div', { class: 'callout callout--warn', 'data-unsupported-banner': '', hidden: true });
  // Honest notice for the standalone design preview, where ESP Web Tools is not
  // loaded so a real USB flash cannot run.
  const ewtNoticeEl = h('div', { class: 'callout callout--info', 'data-ewt-unavailable-notice': '', hidden: true });
  const freshnessControlsEl = h('div', {
    style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' },
    hidden: true,
  });
  const warnCalloutsEl = h('div');
  const acksEl = h('div');

  // ----- the install affordance: the ESP Web Tools activate button -----
  // The visible "Install firmware" button is the component's [slot=activate]
  // button. ESP Web Tools opens its install dialog and runs the real flash when
  // this button is clicked; a disabled button emits no click, so the PR 5 gate
  // (updateGate -> installBtn.disabled) controls whether flashing can start. The
  // capture-phase guard is defense in depth for a gate that changed between
  // render and click (e.g. freshness going stale), matching the 1.0 view.
  const installBtn = h('button', { slot: 'activate', class: 'btn btn--lg' }, icon('bolt'), ' Install firmware');
  installBtn.addEventListener('click', (event) => {
    if (!gate || !gate.canInstall) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // When a build is resolved, render the real component so it drives the flash.
  // The relative manifest path matches the 1.0 view (firmware-<index>.json
  // resolved against the production document), so it is correct at the repo root
  // and under the GitHub Pages /WebFlash/ subpath. Without a build there is
  // nothing to flash, so we fall back to the bare (gated, disabled) button.
  const manifestIndex = (build && build.manifestIndex != null) ? build.manifestIndex : null;
  let installHost;
  if (manifestIndex != null) {
    installHost = h('esp-web-install-button',
      {
        manifest: `firmware-${manifestIndex}.json`,
        'data-webflash-install': '',
        'data-firmware-id': build.firmwareId || '',
      },
      installBtn,
      // Desktop-Chromium-only fallbacks rendered by the component when Web Serial
      // is unavailable (covers mobile, Safari, Firefox) or the context is
      // insecure. They project through the component's shadow DOM in production.
      h('span', { slot: 'unsupported' },
        h('span', { class: 'wf2-ewt-fallback' },
          'Web Serial flashing needs desktop ', h('b', null, 'Chrome'), ', ', h('b', null, 'Edge'),
          ', or ', h('b', null, 'Opera'), '. Mobile browsers, Safari, and Firefox cannot flash over USB.')),
      h('span', { slot: 'not-allowed' },
        h('span', { class: 'wf2-ewt-fallback' },
          'Web flashing needs a secure connection. Open this page over ', h('b', null, 'HTTPS'), ' and try again.')),
    );
    installHost.addEventListener('state-changed', (event) => handleFlashLifecycle(event && event.detail));
  } else {
    installHost = installBtn;
  }

  function ackRow(checked, onToggle, body) {
    const box = h('span', { class: 'ack__box' }, icon('check'));
    const input = h('input', {
      type: 'checkbox', checked, hidden: true,
      onChange: (e) => onToggle(e.target.checked, label),
    });
    const label = h('label', { class: 'ack' + (checked ? ' is-on' : '') },
      box, input, h('span', { class: 'ack__text' }, body));
    return label;
  }

  // ----- gate composition (engine-owned) + render -----
  function recompute() {
    if (!engine) {
      gate = null;
      installBtn.disabled = true;
      return;
    }
    gate = engine.state.evaluateInstallGate({
      build,
      capabilities,
      provenance,
      integrity,
      freshness,
      serviceWorker: engine.swUpdate.getServiceWorkerState(),
      acknowledgements: { required: requiredAcks, signature, accepted: channelAccepted },
      beforeFlashAcknowledged: beforeFlashAck,
    });
    renderStatusbar();
    renderReady();
    renderSwNotice();
    renderFreshnessControls();
    updateGate();
  }

  function renderStatusbar() {
    const ready = Boolean(gate && gate.canInstall);
    const anyPending = Boolean(gate && gate.checks.some((c) => c.status === 'pending'));
    statusbarEl.className = 'statusbar ' + (ready ? 'statusbar--ok' : 'statusbar--wait');
    if (ready) {
      mount(statusbarEl, icon('shield'),
        h('span', null, h('b', null, 'Ready to install.'),
          ' Everything checks out — your hub is ready to flash.'));
    } else if (anyPending) {
      mount(statusbarEl, icon('spinner', { cls: 'spin' }),
        h('span', null, h('b', null, 'Running pre-flight checks…'),
          ' This takes a moment.'));
    } else {
      mount(statusbarEl, icon('alert'),
        h('span', null, h('b', null, 'Action needed before installing.'),
          gate && gate.blockingReason ? ' ' + gate.blockingReason : ''));
    }
  }

  function renderReady() {
    const items = (gate ? gate.checks : []).map((c) => readyItem(c.label, c.detail, c.status));
    mount(readyInner, ...items);
  }

  function renderSwNotice() {
    const blocking = Boolean(gate && gate.serviceWorker && gate.serviceWorker.blocking);
    swNoticeEl.hidden = !blocking;
    if (blocking) {
      mount(swNoticeEl, icon('alert'),
        h('span', null, h('b', null, 'Update available. '), gate.serviceWorker.reason, ' '),
        h('button', { class: 'btn btn--ghost', onClick: () => engine.swUpdate.triggerSkipWaitingAndReload() }, 'Reload'));
    }
  }

  // The manifest-freshness recovery controls (recheck button + the unknown
  // acknowledgement) mirror the 1.0 inline controls. They surface only when the
  // freshness verdict is stale or unknown; the happy path keeps the panel clean.
  function renderFreshnessControls() {
    const row = gate ? gate.checks.find((c) => c.id === MANIFEST_FRESHNESS_ID) : null;
    const unknown = Boolean(row && row.status === 'warn');
    const stale = Boolean(row && row.status === 'fail');
    const show = unknown || stale;
    freshnessControlsEl.hidden = !show;
    if (!show) { mount(freshnessControlsEl); return; }

    const children = [
      h('button', { class: 'btn btn--ghost', onClick: recheckFreshness }, 'Recheck manifest freshness'),
    ];
    if (unknown) {
      children.push(ackRow(freshness.acknowledged, (v, label) => {
        freshness = { ...freshness, acknowledged: v };
        label.classList.toggle('is-on', v);
        recompute();
      }, ['Continue with the firmware list already loaded in this browser.']));
    }
    mount(freshnessControlsEl, ...children);
  }

  function updateGate() {
    const ready = Boolean(gate && gate.canInstall);
    installBtn.disabled = !ready;
    installBtn.classList.toggle('is-ready', ready);
    if (!ready && gate && gate.blockingReason) {
      installBtn.title = gate.blockingReason;
    } else {
      installBtn.removeAttribute('title');
    }
    if (ready && !wasReady && a11y && typeof a11y.announce === 'function') {
      a11y.announce('Pre-flight checks passed. Ready to install firmware.');
    }
    wasReady = ready;
  }

  // Channel acknowledgement checkboxes (rendered once; the gate re-reads the
  // accepted map on every recompute). Each checkbox records the firmware
  // signature it was accepted against so a build change invalidates it.
  function renderAcks() {
    const rows = requiredAcks.map((ackItem) => ackRow(false, (v, label) => {
      if (v) channelAccepted.set(ackItem.key, signature);
      else channelAccepted.delete(ackItem.key);
      label.classList.toggle('is-on', v);
      recompute();
    }, [ackItem.label]));
    mount(acksEl, ...rows);
  }

  // Channel warning callouts (seven-tier; rendered once from the engine).
  function renderWarnCallouts() {
    const callouts = channelWarnings.map((w) => h('div', { class: 'callout callout--warn' },
      icon('alert'), h('span', null, w.message)));
    mount(warnCalloutsEl, ...callouts);
  }

  // Desktop-only / mobile fallback message. Derived from the engine's browser
  // readiness evaluation over the detected capabilities; surfaced only when the
  // page genuinely cannot flash (mobile, no Web Serial, insecure context).
  function renderUnsupportedBanner() {
    if (!engine || !capabilities) { unsupportedBannerEl.hidden = true; return; }
    const readiness = engine.capabilities.evaluateBrowserReadiness(capabilities);
    const blocker = readiness.reasons.find((r) => r.severity === 'block');
    if (readiness.level === 'block' && blocker) {
      unsupportedBannerEl.hidden = false;
      mount(unsupportedBannerEl, icon('alert'),
        h('span', null, h('b', null, blocker.title + '. '), blocker.message));
    } else {
      unsupportedBannerEl.hidden = true;
    }
  }

  // Standalone-preview honesty: when ESP Web Tools is not registered there is no
  // way to open a USB connection, so say so rather than leave an inert button.
  function renderEwtNotice() {
    const show = manifestIndex != null && !espWebToolsRegistered();
    ewtNoticeEl.hidden = !show;
    if (show) {
      mount(ewtNoticeEl, icon('info'),
        h('span', null, h('b', null, 'Flashing runs in the published installer. '),
          'This design preview cannot open a USB connection. Use the live WebFlash installer to flash a hub.'));
    }
  }
  // If the component registers after this step mounts (a late unpkg load under
  // ?ui=2), drop the notice once it defines.
  if (manifestIndex != null && !espWebToolsRegistered()
    && typeof customElements !== 'undefined' && typeof customElements.whenDefined === 'function') {
    customElements.whenDefined('esp-web-install-button').then(() => {
      if (disposed) return;
      renderEwtNotice();
    }).catch(() => { /* never registers (standalone preview) */ });
  }

  // ----- before-you-flash acknowledgement -----
  const beforeFlashLabel = ackRow(false, (v, label) => {
    beforeFlashAck = v; label.classList.toggle('is-on', v); recompute();
  }, [
    'I understand I should ', h('b', null, 'keep the hub powered and connected'), ' and ',
    h('b', null, 'leave this tab open'), " until flashing finishes. Don't disconnect power or USB during the install.",
  ]);

  // ----- support bundle (PR 9) -----
  // The preflight panel is one of the three 2.0 surfaces that expose the engine's
  // redacted schema_version:1 support bundle (alongside the rescue / recovery
  // modal and the error log modal). The buttons carry the same
  // [data-copy-support-bundle] / [data-download-support-bundle] hooks the 1.0
  // preflight help modal uses, driven by the same delegated handler the view
  // wires through engine.diagnostics.initSupportBundleActions(). The bundle is
  // built and redacted entirely by the engine; this panel never assembles or
  // stores it, so it cannot leak a firmware binary, a raw sha256 / signature, or
  // a Wi-Fi password. Rendered only when the engine is present (the bare scaffold
  // mount has no bundle to copy).
  const supportEl = engine ? h('div', { class: 'wf2-support', 'data-wf2-support': '' },
    h('h3', { class: 'wf2-support__title' }, 'Sharing this with support?'),
    h('p', { class: 'wf2-support__text' },
      'Copy a structured, redacted snapshot of your browser, manifest, firmware ',
      'selection, preflight, and recent flash attempts. Wi-Fi passwords, tokens, ',
      'MAC addresses, and filesystem paths are stripped before it leaves your browser.'),
    h('div', { class: 'wf2-support__actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-copy-support-bundle': '' },
        icon('shield'), ' Copy support bundle'),
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-download-support-bundle': '' },
        icon('download'), ' Download JSON'),
    ),
  ) : null;

  // ----- prep view + (hidden) real flash-progress view -----
  // Both live inside mainEl so the ESP Web Tools host stays attached for the whole
  // flash: when flashing starts we hide the prep view and reveal the progress
  // view, but the component (inside the hidden prep view) keeps driving the flash
  // and emitting the lifecycle events this view mirrors.
  const prepEl = h('div', null,
    StepHead({ eyebrow: 'Step 2 — Install', eyebrowIcon: 'bolt', title: 'Prepare & install firmware',
      desc: "We'll run the real pre-flight checks, then flash your hub over USB." }),
    DeviceChip({ name: device.name, target: device.target, onEdit: onBack }),
    unsupportedBannerEl,
    statusbarEl,
    swNoticeEl,
    h('div', { class: 'card', style: { padding: '8px 20px' } }, readyInner),
    freshnessControlsEl,
    warnCalloutsEl,
    beforeFlashLabel,
    acksEl,
    ewtNoticeEl,
    h('div', { class: 'stepnav' },
      h('button', { class: 'btn--ghost btn', onClick: onBack }, icon('arrowL'), ' Back'),
      h('span', { class: 'stepnav__spacer' }),
      installHost,
    ),
    supportEl,
  );
  const flashEl = h('div', { hidden: true });

  mount(mainEl, prepEl, flashEl);

  renderWarnCallouts();
  renderAcks();
  renderUnsupportedBanner();
  renderEwtNotice();
  recompute();        // initial synchronous render (capabilities + provenance)
  runPreflight();     // kick the async checks (freshness + SHA-256 integrity)
  capturePostFlashBuild();  // seed the post-flash state machine for the Connect step

  return mainEl;

  // ----- post-flash state machine seeding (PR 7) -----
  // Reset the shared post-flash service and capture the build that is about to
  // be flashed, so the Connect step's validation panel reports against THIS
  // selection. The manifest (with its name / improv-wait metadata) is captured
  // by the engine's manifest load during the Step 1 resolve, so only the build
  // needs seeding here. Only the build's identity fields are read; no Wi-Fi
  // credential ever enters the snapshot.
  function capturePostFlashBuild() {
    if (!engine || !engine.postFlash || !build) {
      return;
    }
    try {
      engine.postFlash.service.reset();
      engine.postFlash.service.captureSelectedBuild(build);
    } catch {
      /* defensive — never block install on post-flash wiring */
    }
  }

  // ----- async preflight -----
  function runPreflight() {
    if (!engine) {
      return;
    }
    // Manifest freshness: re-fetch with no-store and compare generated_at.
    (async () => {
      try {
        const result = await engine.freshness.checkManifestFreshness(engine.state.getManifestMetadataForAbout());
        if (disposed) return;
        freshness = { verdict: result.verdict, acknowledged: freshness.acknowledged };
      } catch {
        if (disposed) return;
        freshness = { verdict: 'unknown', acknowledged: freshness.acknowledged };
      }
      recompute();
    })();

    // SHA-256 integrity of the downloaded bytes (skipped when no build, in
    // which case the verify row stays a blocking pending state).
    if (build) {
      (async () => {
        try {
          const result = await engine.state.verifyFirmwareIntegrity(build, { mode: GATE_MODE, signal: abort.signal });
          if (disposed) return;
          integrity = result;
        } catch {
          if (disposed) return;
          integrity = { status: 'failed', message: 'Firmware verification failed.' };
        }
        recompute();
      })();
    }
  }

  async function recheckFreshness() {
    if (!engine) {
      return;
    }
    freshness = { verdict: 'pending', acknowledged: false };
    recompute();
    try {
      const result = await engine.freshness.checkManifestFreshness(engine.state.getManifestMetadataForAbout());
      if (disposed) return;
      freshness = { verdict: result.verdict, acknowledged: false };
    } catch {
      if (disposed) return;
      freshness = { verdict: 'unknown', acknowledged: false };
    }
    recompute();
  }

  // ----- real flash progress, driven by ESP Web Tools lifecycle events -----
  // The ring + console (built lazily in buildFlashView, below) are updated only
  // from the component's `state-changed` detail. There is no timer.

  function buildFlashView() {
    const R = 52, C = 2 * Math.PI * R;
    ringCirc = C;
    const ringSvg = fromHTML(
      `<svg class="flash__ring" width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--bg-elev)" stroke-width="9"/>
        <circle data-fg cx="66" cy="66" r="${R}" fill="none" stroke="url(#wf2-flash-grad)" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"
          transform="rotate(-90 66 66)" style="transition: stroke-dashoffset .3s"/>
        <defs>
          <linearGradient id="wf2-flash-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--accent)"/>
            <stop offset="100%" stop-color="var(--green)"/>
          </linearGradient>
        </defs>
        <text x="66" y="62" text-anchor="middle" font-size="26" font-weight="700"
          fill="var(--text)" font-family="var(--font-mono)" data-pct>0</text>
        <text x="66" y="82" text-anchor="middle" font-size="11" fill="var(--text-muted)"
          font-family="var(--font-mono)" letter-spacing="1">PERCENT</text>
      </svg>`);
    ringFg = ringSvg.querySelector('[data-fg]');
    ringPctText = ringSvg.querySelector('[data-pct]');
    phaseEl = h('div', { class: 'flash__phase' });
    subEl = h('div', { class: 'flash__sub' });
    errorEl = h('div', { class: 'callout callout--warn', 'data-flash-error': '', hidden: true });
    consoleEl = h('div', { class: 'console' });
    mount(flashEl, h('div', { class: 'flash fadein' }, ringSvg, phaseEl, subEl, errorEl, consoleEl));
  }

  function showFlashView() {
    if (!consoleEl) buildFlashView();
    prepEl.hidden = true;
    flashEl.hidden = false;
  }

  function setRing(pct) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    if (ringPctText) ringPctText.textContent = String(v);
    if (ringFg) ringFg.style.strokeDashoffset = String(ringCirc - (v / 100) * ringCirc);
  }

  function appendConsole(line) {
    if (!consoleEl || !line) return;
    const isOk = line.startsWith('✓');
    const isCmd = line.startsWith('$');
    consoleEl.appendChild(h('div', { class: 'ln' + (isOk ? ' ln--ok' : '') },
      isCmd ? h('b', null, line) : line));
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  // Fallback console line when the component reports no message for a phase.
  function defaultConsoleLine(state) {
    switch (state) {
      case 'initializing': return '$ esptool connect';
      case 'manifest': return 'Reading firmware manifest…';
      case 'preparing': return 'Preparing installation…';
      case 'erasing': return 'Erasing flash…';
      case 'finished': return '✓ Firmware installed successfully';
      case 'error': return 'Installation failed.';
      default: return '';
    }
  }

  function retryFlash() {
    flashStarted = false;
    lastState = '';
    lastConsoleLine = '';
    lastWriteBucket = -1;
    if (errorEl) errorEl.hidden = true;
    if (consoleEl) mount(consoleEl);
    setRing(0);
    flashEl.hidden = true;
    prepEl.hidden = false;
    recompute();  // re-read the gate so the armed button is ready for another run
  }

  // Map one ESP Web Tools lifecycle event onto the ring + console.
  function handleFlashLifecycle(detail) {
    if (disposed) return;

    // PR 7 — forward every lifecycle event (including idle, improv frames, and
    // the Wi-Fi provisioning signals this view does not render itself) to the
    // engine's post-flash state machine so the Connect step's validation panel
    // can report the honest eight-state result. The service owns the lifecycle
    // to result reduction; this view never decides the validation outcome and
    // never reads or stores the Wi-Fi credentials ESP Web Tools provisions.
    if (engine && engine.postFlash) {
      try {
        engine.postFlash.service.dispatchLifecycle(detail);
      } catch {
        /* never block the flash UI on post-flash bookkeeping */
      }
    }

    const rawState = typeof detail === 'string' ? detail : (detail && detail.state);
    const state = typeof rawState === 'string' ? rawState.toLowerCase() : '';
    const meta = FLASH_PHASE_META[state];
    if (!meta) return;  // ignore idle / improv / unknown states for the ring

    if (!flashStarted) {
      flashStarted = true;
      showFlashView();
    }

    // Ring: WRITING tracks the real byte percentage; other phases use the ramp.
    let pct = meta.pct;
    let writePct = null;
    if (state === 'writing') {
      const raw = detail && detail.details && typeof detail.details.percentage === 'number'
        ? detail.details.percentage : 0;
      writePct = Math.max(0, Math.min(100, raw));
      pct = WRITE_RING_BASE + (writePct / 100) * WRITE_RING_SPAN;
    }
    setRing(pct);

    if (phaseEl) phaseEl.textContent = (state === 'finished' || state === 'error') ? meta.label : meta.label + '…';
    if (subEl) subEl.textContent = meta.sub;

    // Console: append a line on each phase transition, plus throttled progress
    // during WRITING (every 20%) so the log reads like an esptool run without one
    // line per percent.
    const message = (detail && typeof detail.message === 'string') ? detail.message.trim() : '';
    if (state === 'writing') {
      const shown = Math.round(writePct);
      const bucket = Math.floor(shown / 20);
      if (bucket !== lastWriteBucket) {
        lastWriteBucket = bucket;
        appendConsole(`Writing firmware… ${shown}%`);
      }
    } else if (state !== lastState) {
      const line = message || defaultConsoleLine(state);
      if (line && line !== lastConsoleLine) {
        appendConsole(line);
        lastConsoleLine = line;
      }
    }
    lastState = state;

    if (a11y && typeof a11y.announce === 'function' && state !== 'writing') {
      a11y.announce(meta.label);
    }

    if (state === 'error') {
      const reason = (detail && (detail.message
        || (detail.details && (detail.details.error || detail.details.details)))) || 'Installation failed.';
      if (errorEl) {
        errorEl.hidden = false;
        mount(errorEl, icon('alert'),
          h('span', null, h('b', null, 'Flashing failed. '), String(reason), ' '),
          h('button', { class: 'btn btn--ghost', onClick: retryFlash }, 'Try again'));
      }
      return;
    }

    if (state === 'finished') {
      setRing(100);
      appendConsole('✓ Firmware installed successfully');
      if (a11y && typeof a11y.announce === 'function') {
        a11y.announce('Firmware installed successfully.');
      }
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        if (!disposed && typeof onFlashed === 'function') onFlashed();
      }, 1100);
    }
  }
}
