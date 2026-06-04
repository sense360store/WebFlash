/* WebFlash 2.0 — Step 2: Install firmware. Ported from install.jsx.
   Faithful visual prototype: the readiness checklist auto-passes on timers and
   the flash progress is a simulated esptool run (no real Web Serial here). */
import { h, mount, fromHTML } from './h.js';
import { icon } from './icons.js';
import { StepHead, DeviceChip } from './ui.js';
import { CHECKS } from './data.js';

const READY_ICON = {
  ok: { cls: 'ready__ico--ok', name: 'check' },
  wait: { cls: 'ready__ico--wait', name: 'spinner', spin: true },
  warn: { cls: 'ready__ico--warn', name: 'alert' },
  err: { cls: 'ready__ico--err', name: 'alert' },
};

function readyItem(name, sub, status) {
  const m = READY_ICON[status] || READY_ICON.wait;
  return h('div', { class: 'ready__item' },
    h('span', { class: 'ready__ico ' + m.cls }, icon(m.name, { cls: m.spin ? 'spin' : '' })),
    h('div', { class: 'ready__main' },
      h('div', { class: 'ready__name' }, name),
      h('div', { class: 'ready__sub' }, sub),
    ),
  );
}

/* Flash progress simulation (phases mirror an esptool run). */
const FLASH_PHASES = [
  { p: 'Connecting', sub: 'Opening serial port to your hub', to: 8, lines: ['$ esptool connect', 'Detecting chip type… ESP32-S3', 'Chip is ESP32-S3 (revision v0.2)'] },
  { p: 'Erasing', sub: 'Clearing existing firmware', to: 24, lines: ['Erasing flash (this may take a few seconds)…', 'Flash erased.'] },
  { p: 'Writing firmware', sub: 'Do not disconnect power or USB', to: 86, lines: ['Writing at 0x00000000…', 'Writing at 0x00040000… 38%', 'Writing at 0x000a0000… 71%', 'Writing at 0x00100000… 96%'] },
  { p: 'Verifying', sub: 'Checking the flashed image', to: 98, lines: ['Verifying hash of data…', 'Hash of data verified.'] },
  { p: 'Rebooting', sub: 'Starting your hub', to: 100, lines: ['Hard resetting via RTS pin…', '✓ Firmware installed successfully'] },
];

export function InstallStep({ device, isPreview, onBack, onFlashed }) {
  const mainEl = h('div', { class: 'main' });

  // ----- local state -----
  const statuses = CHECKS.map(() => 'wait');
  let ready = false;
  let ack = false;
  let previewAck = false;

  const timers = [];
  let raf = 0;
  let doneTimer = 0;

  const clearReadinessTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };
  mainEl.__dispose = () => {
    clearReadinessTimers();
    if (raf) cancelAnimationFrame(raf);
    if (doneTimer) clearTimeout(doneTimer);
  };

  // ----- prep view scaffolding -----
  const statusbarEl = h('div', { class: 'statusbar' });
  const readyInner = h('div', { class: 'ready' });
  const installBtn = h('button', { class: 'btn btn--lg', onClick: () => canInstall() && startFlash() },
    icon('bolt'), ' Install firmware');

  const canInstall = () => ready && ack && (!isPreview || previewAck);

  function renderStatusbar() {
    statusbarEl.className = 'statusbar ' + (ready ? 'statusbar--ok' : 'statusbar--wait');
    mount(statusbarEl,
      ready ? icon('shield') : icon('spinner', { cls: 'spin' }),
      ready
        ? h('span', null, h('b', null, 'Ready to install.'),
            ' Everything checks out — your hub is connected and the firmware is verified.')
        : h('span', null, h('b', null, 'Running pre-flight checks…'),
            ' This takes a couple of seconds.'),
    );
  }

  function renderReady() {
    const allOk = statuses.every((s) => s === 'ok');
    const items = CHECKS.map((c, i) =>
      readyItem(c.name, statuses[i] === 'ok' ? c.okSub : c.waitSub, statuses[i]));
    items.push(readyItem('Hub connected over USB',
      allOk ? 'ESP32-S3 detected on /dev/ttyUSB0' : 'Waiting on the checks above…',
      allOk ? 'ok' : 'wait'));
    mount(readyInner, ...items);
  }

  function updateGate() { installBtn.disabled = !canInstall(); }

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

  // ----- build prep view -----
  const ackLabel = ackRow(false, (v, label) => {
    ack = v; label.classList.toggle('is-on', v); updateGate();
  }, [
    'I understand I should ', h('b', null, 'keep the hub powered and connected'), ' and ',
    h('b', null, 'leave this tab open'), " until flashing finishes. Don't disconnect power or USB during the install.",
  ]);

  const previewLabel = isPreview
    ? ackRow(false, (v, label) => { previewAck = v; label.classList.toggle('is-on', v); updateGate(); },
        ['I accept the ', h('b', null, 'preview channel'), ' and understand this firmware is experimental.'])
    : null;

  mount(mainEl,
    StepHead({ eyebrow: 'Step 2 — Install', eyebrowIcon: 'bolt', title: 'Prepare & install firmware',
      desc: "We'll run a few safety checks automatically, then flash your hub over USB." }),
    DeviceChip({ name: device.name, target: device.target, onEdit: onBack }),
    statusbarEl,
    h('div', { class: 'card', style: { padding: '8px 20px' } }, readyInner),
    isPreview && h('div', { class: 'callout callout--warn' },
      icon('alert'),
      h('span', null, h('b', null, 'Preview firmware.'),
        " This build is experimental and may be unstable. It hasn't completed the full stable release process. Acknowledge below to continue."),
    ),
    ackLabel,
    previewLabel,
    h('div', { class: 'stepnav' },
      h('button', { class: 'btn--ghost btn', onClick: onBack }, icon('arrowL'), ' Back'),
      h('span', { class: 'stepnav__spacer' }),
      installBtn,
    ),
  );

  renderStatusbar();
  renderReady();
  updateGate();

  // ----- start the auto-running readiness checklist -----
  CHECKS.forEach((_, i) => {
    const t = setTimeout(() => {
      statuses[i] = 'ok';
      renderReady();
      if (statuses.every((s) => s === 'ok')) {
        ready = true;
        renderStatusbar();
        renderReady();
        updateGate();
      }
    }, 600 + i * 520);
    timers.push(t);
  });

  // ----- flash progress simulation -----
  function startFlash() {
    clearReadinessTimers();
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

  return mainEl;
}
