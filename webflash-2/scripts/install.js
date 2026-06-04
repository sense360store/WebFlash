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

   The flash PROGRESS below is still a simulation (FLASH_PHASES + a
   requestAnimationFrame ring). PR 6 replaces it with the real ESP Web Tools
   install-button lifecycle. It is left untouched here so PR 5 stays scoped to
   the gate. */
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

/* Flash progress simulation (phases mirror an esptool run). PR 6 replaces this. */
const FLASH_PHASES = [
  { p: 'Connecting', sub: 'Opening serial port to your hub', to: 8, lines: ['$ esptool connect', 'Detecting chip type… ESP32-S3', 'Chip is ESP32-S3 (revision v0.2)'] },
  { p: 'Erasing', sub: 'Clearing existing firmware', to: 24, lines: ['Erasing flash (this may take a few seconds)…', 'Flash erased.'] },
  { p: 'Writing firmware', sub: 'Do not disconnect power or USB', to: 86, lines: ['Writing at 0x00000000…', 'Writing at 0x00040000… 38%', 'Writing at 0x000a0000… 71%', 'Writing at 0x00100000… 96%'] },
  { p: 'Verifying', sub: 'Checking the flashed image', to: 98, lines: ['Verifying hash of data…', 'Hash of data verified.'] },
  { p: 'Rebooting', sub: 'Starting your hub', to: 100, lines: ['Hard resetting via RTS pin…', '✓ Firmware installed successfully'] },
];

/**
 * @param {object} props
 * @param {{name: string, target: string}} props.device
 * @param {object|null} [props.build]   The resolved manifest build entry.
 * @param {object|null} [props.engine]  The engine facade (webflash-2/scripts/engine.js).
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

  // ----- async lifecycle -----
  let disposed = false;
  const abort = (typeof AbortController === 'function') ? new AbortController() : { abort() {}, signal: undefined };
  let raf = 0;
  let doneTimer = 0;
  mainEl.__dispose = () => {
    disposed = true;
    try { abort.abort(); } catch { /* AbortController not available */ }
    if (raf) cancelAnimationFrame(raf);
    if (doneTimer) clearTimeout(doneTimer);
  };

  // ----- scaffolding -----
  const statusbarEl = h('div', { class: 'statusbar' });
  const readyInner = h('div', { class: 'ready' });
  const swNoticeEl = h('div', { class: 'callout callout--warn', hidden: true });
  const freshnessControlsEl = h('div', {
    style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' },
    hidden: true,
  });
  const warnCalloutsEl = h('div');
  const acksEl = h('div');
  const installBtn = h('button', { class: 'btn btn--lg', onClick: () => { if (gate && gate.canInstall) startFlash(); } },
    icon('bolt'), ' Install firmware');

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

  // ----- before-you-flash acknowledgement -----
  const beforeFlashLabel = ackRow(false, (v, label) => {
    beforeFlashAck = v; label.classList.toggle('is-on', v); recompute();
  }, [
    'I understand I should ', h('b', null, 'keep the hub powered and connected'), ' and ',
    h('b', null, 'leave this tab open'), " until flashing finishes. Don't disconnect power or USB during the install.",
  ]);

  // ----- build prep view -----
  mount(mainEl,
    StepHead({ eyebrow: 'Step 2 — Install', eyebrowIcon: 'bolt', title: 'Prepare & install firmware',
      desc: "We'll run the real pre-flight checks, then flash your hub over USB." }),
    DeviceChip({ name: device.name, target: device.target, onEdit: onBack }),
    statusbarEl,
    swNoticeEl,
    h('div', { class: 'card', style: { padding: '8px 20px' } }, readyInner),
    freshnessControlsEl,
    warnCalloutsEl,
    beforeFlashLabel,
    acksEl,
    h('div', { class: 'stepnav' },
      h('button', { class: 'btn--ghost btn', onClick: onBack }, icon('arrowL'), ' Back'),
      h('span', { class: 'stepnav__spacer' }),
      installBtn,
    ),
  );

  renderWarnCallouts();
  renderAcks();
  recompute();        // initial synchronous render (capabilities + provenance)
  runPreflight();     // kick the async checks (freshness + SHA-256 integrity)

  return mainEl;

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

  // ----- flash progress simulation (PR 6 replaces with ESP Web Tools) -----
  function startFlash() {
    const R = 52, C = 2 * Math.PI * R;
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
    const fg = ringSvg.querySelector('[data-fg]');
    const pctText = ringSvg.querySelector('[data-pct]');
    const phaseEl = h('div', { class: 'flash__phase' });
    const subEl = h('div', { class: 'flash__sub' });
    const consoleEl = h('div', { class: 'console' });
    mount(mainEl, h('div', { class: 'flash fadein' }, ringSvg, phaseEl, subEl, consoleEl));

    let pi = 0, cur = 0, lineQueue = [...FLASH_PHASES[0].lines], lineTimer = 0;
    const setPct = (v) => { pctText.textContent = String(v); fg.style.strokeDashoffset = String(C - (v / 100) * C); };
    const setPhase = (idx) => { const p = FLASH_PHASES[idx]; phaseEl.textContent = p.p + '…'; subEl.textContent = p.sub; };
    const appendLine = (ln) => {
      consoleEl.appendChild(h('div', { class: 'ln' + (ln.startsWith('✓') ? ' ln--ok' : '') },
        ln.startsWith('$') ? h('b', null, ln) : ln));
      consoleEl.scrollTop = consoleEl.scrollHeight;
    };
    const pushLine = () => { if (lineQueue.length) appendLine(lineQueue.shift()); };

    setPhase(0); setPct(0); pushLine();

    const tick = () => {
      const phase = FLASH_PHASES[pi];
      const target = phase.to;
      const speed = phase.p === 'Writing firmware' ? 0.55 : 0.9;
      cur = Math.min(target, cur + speed);
      setPct(Math.round(cur));

      lineTimer += 1;
      if (lineTimer > 26) { lineTimer = 0; pushLine(); }

      if (cur >= target - 0.1) {
        if (pi < FLASH_PHASES.length - 1) {
          pi += 1; setPhase(pi); lineQueue = [...FLASH_PHASES[pi].lines]; lineTimer = 20;
        } else {
          lineQueue.forEach(appendLine); lineQueue = [];
          doneTimer = setTimeout(() => onFlashed && onFlashed(), 900);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
}
