/* WebFlash 2.0 — Step 3: Connect to Wi-Fi + success. Ported from connect.jsx.
   Faithful visual prototype: the scan and Improv credential push are simulated. */
import { h, mount, fromHTML } from './h.js';
import { icon } from './icons.js';
import { StepHead, DeviceChip } from './ui.js';

const NETWORKS = [
  { ssid: 'Home-WiFi', bars: 3, lock: true },
  { ssid: 'Home-WiFi-5G', bars: 3, lock: true },
  { ssid: 'Sense360-Guest', bars: 2, lock: true },
  { ssid: 'Neighbour_2.4', bars: 1, lock: true },
];

function wifiBars(n) {
  return fromHTML(
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M5 12.5a10 10 0 0 1 14 0" opacity="${n >= 3 ? 1 : 0.25}"/>
      <path d="M8.5 16a5 5 0 0 1 7 0" opacity="${n >= 2 ? 1 : 0.25}"/>
      <line x1="12" y1="19.5" x2="12.01" y2="19.5" opacity="${n >= 1 ? 1 : 0.25}"/>
    </svg>`);
}

export function ConnectStep({ device, onDone, onSkip }) {
  const mainEl = h('div', { class: 'main' });

  let phase = 'scan'; // scan | form | connecting | done
  let picked = null;
  let pw = '';
  let timer = 0;

  mainEl.__dispose = () => { if (timer) clearTimeout(timer); };

  const schedule = (ms, fn) => { if (timer) clearTimeout(timer); timer = setTimeout(fn, ms); };

  function setPhase(p) {
    phase = p;
    render();
    if (phase === 'scan') schedule(1400, () => setPhase('form'));
    else if (phase === 'connecting') schedule(2600, () => setPhase('done'));
  }

  function head() {
    return [
      StepHead({ eyebrow: 'Step 3 — Connect', eyebrowIcon: 'wifi', title: 'Connect your hub to Wi-Fi',
        desc: 'Your hub is flashed. Now join it to your network over the same USB connection — no app needed.' }),
      DeviceChip({ name: device.name, target: device.target }),
    ];
  }

  function render() {
    if (phase === 'done') {
      mount(mainEl,
        h('div', { class: 'success fadein' },
          h('div', { class: 'success__badge' }, icon('check', { style: { strokeWidth: 2.5 } })),
          h('h1', null, 'Your hub is online'),
          h('p', null,
            `${device.name} is flashed and connected to `,
            h('b', null, picked?.ssid || 'Wi-Fi'),
            '. It should appear in Home Assistant within a minute.'),
          h('div', { class: 'success__actions' },
            h('a', { class: 'btn btn--lg', href: '#', onClick: (e) => e.preventDefault() },
              icon('home'), ' Open Home Assistant'),
            h('button', { class: 'btn--ghost btn btn--lg', onClick: onDone }, 'Flash another hub'),
          ),
        ),
      );
      return;
    }

    if (phase === 'connecting') {
      mount(mainEl,
        h('div', { class: 'flash fadein', style: { paddingTop: '60px' } },
          icon('spinner', { cls: 'spin', size: 46, style: { color: 'var(--accent)', margin: '0 auto 22px', display: 'block' } }),
          h('div', { class: 'flash__phase' }, `Connecting to ${picked?.ssid}…`),
          h('div', { class: 'flash__sub' }, 'Sending credentials to your hub over Improv Serial'),
        ),
      );
      return;
    }

    // phase: scan | form
    const connectBtn = h('button', {
      class: 'btn btn--lg',
      disabled: !picked || pw.length < 1,
      onClick: () => setPhase('connecting'),
    }, icon('wifi'), ' Connect');

    let cardBody;
    if (phase === 'scan') {
      cardBody = h('div', { style: { textAlign: 'center', padding: '26px 0', color: 'var(--text-muted)' } },
        icon('spinner', { cls: 'spin', size: 30, style: { color: 'var(--accent)', margin: '0 auto 14px', display: 'block' } }),
        'Scanning for nearby networks…');
    } else {
      const pwField = picked
        ? h('div', { class: 'field fadein' },
            h('label', { for: 'wifipw' }, `Password for “${picked.ssid}”`),
            h('input', {
              id: 'wifipw', class: 'input', type: 'password', placeholder: 'Wi-Fi password',
              value: pw, autofocus: true,
              onInput: (e) => { pw = e.target.value; connectBtn.disabled = !picked || pw.length < 1; },
            }),
          )
        : null;

      cardBody = [
        h('div', { class: 'field', style: { marginBottom: '18px' } },
          h('label', null, 'Choose a network'),
          h('div', { class: 'wifi-list' },
            NETWORKS.map((n) =>
              h('button', {
                class: 'wifi-row' + (picked?.ssid === n.ssid ? ' is-on' : ''),
                onClick: () => { picked = n; render(); },
              },
                h('span', { class: 'wifi-row__meta', style: { color: 'var(--accent)' } }, wifiBars(n.bars)),
                h('span', { class: 'wifi-row__name' }, n.ssid),
                n.lock && h('span', { class: 'wifi-row__meta' }, icon('lock', { size: 15 })),
              )),
          ),
        ),
        pwField,
      ];
    }

    mount(mainEl,
      ...head(),
      h('div', { class: 'card', style: { padding: '22px' } }, cardBody),
      h('div', { class: 'stepnav' },
        h('button', { class: 'btn--quiet btn', onClick: onSkip }, 'Skip — set up Wi-Fi later'),
        h('span', { class: 'stepnav__spacer' }),
        connectBtn,
      ),
    );
  }

  setPhase('scan');
  return mainEl;
}
