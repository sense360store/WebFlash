/* WebFlash 2.0 — Step 3: Connect to Wi-Fi + post-flash validation.

   PR 7 of the WebFlash 2.0 migration deletes the simulated Wi-Fi step (the
   hardcoded NETWORKS array plus the setTimeout scan / connect) and binds this
   step to the engine.

   Real Wi-Fi provisioning happens over Improv Serial inside the ESP Web Tools
   install dialog that Step 2 already opened, on the same USB connection. This
   view never builds its own Wi-Fi scan or password form, so it never reads,
   logs, or stores an SSID or a password anywhere (no URL, no localStorage, no
   support bundle, no flash history). It only renders the engine's post-flash
   state machine (scripts/services/post-flash.js, exposed via engine.postFlash):
   the eight result states, the validation checks, and the handoffs.

   The Home Assistant handoff is shown only when the selected build advertises
   improv:true (the engine records this as selected_improv_supported); builds
   without Improv report the honest `unknown` validation result by default and
   surface a "Wi-Fi setup not available for this firmware" handoff instead. */
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { DeviceChip } from './ui.js';

const HOME_ASSISTANT_URL = 'https://my.home-assistant.io/redirect/integrations/';

// Copy + tone per post-flash result state. Mirrors the 1.0 post-flash panel so
// the two views speak the same honest language about what actually happened.
const STATE_COPY = Object.freeze({
  not_started: {
    title: 'Waiting for the install to finish',
    summary: 'Flash your hub in the previous step, then return here for Wi-Fi setup and verification.',
    tone: 'idle',
  },
  in_progress: {
    title: 'Installing firmware…',
    summary: 'Keep the hub connected and the cable still until the installer finishes.',
    tone: 'busy',
  },
  completed: {
    title: 'Flash completed',
    summary: 'Checking whether the hub came back online with the expected firmware…',
    tone: 'pending',
  },
  completed_validation_passed: {
    title: 'Your hub is flashed and verified',
    summary: 'The hub responded with the expected firmware. Finish Wi-Fi setup in the installer dialog, then adopt it in Home Assistant.',
    tone: 'success',
  },
  completed_validation_unknown: {
    title: 'Flash completed — verification unknown',
    summary: 'The flash finished but WebFlash could not automatically verify the running firmware. This is normal for many builds. Reconnect the hub and continue setup.',
    tone: 'unknown',
  },
  completed_validation_failed: {
    title: 'Flash completed but a check failed',
    summary: 'The hub responded with an unexpected firmware identity or version. Review the details below before continuing.',
    tone: 'warn',
  },
  failed: {
    title: 'Firmware flashing did not complete',
    summary: 'The installer reported an error before the flash could finish. Try again, or use Rescue & Recovery if the hub is in an unknown state.',
    tone: 'error',
  },
  cancelled: {
    title: 'Flash cancelled',
    summary: 'The flash was cancelled before it completed. You can run it again from the install step.',
    tone: 'cancelled',
  },
});

const VALIDATION_LABELS = Object.freeze({
  device_reconnect: 'Hub reconnected over USB',
  device_firmware_identity: 'Firmware identity',
  version_match: 'Version matches selection',
  improv_endpoint_available: 'Improv endpoint reachable',
  wifi_provisioning_capability: 'Wi-Fi provisioning',
});

const STATUS_LABELS = Object.freeze({
  passed: 'OK',
  failed: 'Issue',
  not_available: 'Not checked',
});

const HOME_ASSISTANT_STEPS = Object.freeze([
  'Power-cycle the hub.',
  'Wait for it to boot and join Wi-Fi.',
  'Open Home Assistant.',
  'Check Settings → Devices & services for a newly discovered ESPHome device.',
]);

// The four post-flash "completed" states where handoffs (Home Assistant /
// Wi-Fi) make sense; in_progress and the failure states do not show them.
const SHOW_HANDOFF_STATES = new Set([
  'completed',
  'completed_validation_passed',
  'completed_validation_unknown',
  'completed_validation_failed',
]);
const FAILURE_STATES = new Set(['failed', 'cancelled']);

export function ConnectStep({ device, build = null, engine = null, a11y = null, onDone, onSkip }) {
  // The step fills the window content area as a flex column so the footer action
  // bar sits at the bottom while the post-flash panel scrolls above it.
  const mainEl = h('div', { class: 'flowstep' });

  const service = engine && engine.postFlash ? engine.postFlash.service : null;

  // Compact flow header (the design's flowhead), shared by the engine-absent
  // fallback and the live panel.
  function flowHead(desc) {
    return h('div', { class: 'flowhead' },
      h('span', { class: 'mlbl' }, 'Step 3 · Connect'),
      h('h1', null, 'Connect your hub to Wi-Fi'),
      h('p', null, desc),
    );
  }

  // Engine-absent fallback (a bare app.js mount with no engine, e.g. a shell
  // scaffolding unit test). There is no real flash and no post-flash state to
  // render, so show an honest notice instead of a simulated success screen.
  if (!service) {
    mount(mainEl,
      h('div', { class: 'flowbody' },
        h('div', { class: 'flowcol' },
          flowHead('Wi-Fi setup runs over the same USB connection in the published installer.'),
          DeviceChip({ name: device.name, target: device.target }),
          h('div', { class: 'card', style: { padding: '22px' } },
            h('div', { class: 'callout callout--info' }, icon('info'),
              h('span', null, h('b', null, 'Wi-Fi setup runs in the published installer. '),
                'This design preview cannot open a USB connection. Use the live WebFlash installer to flash a hub and join it to Wi-Fi.'))),
        ),
      ),
      h('div', { class: 'winfoot' },
        h('span', { class: 'winfoot__spacer' }),
        h('button', { class: 'btn', onClick: onDone }, 'Flash another hub')),
    );
    return mainEl;
  }

  // Record-once guards so showing a handoff (which writes a diagnostics marker
  // via markHandoffShown -> notify) cannot loop the subscriber. `rendering`
  // additionally blocks any re-entrant render the marker write would trigger.
  const recorded = { home_assistant: false, recovery: false, wifi: null };
  let rendering = false;

  function recordHandoffs(snapshot) {
    const improv = snapshot.selected_improv_supported === true;
    if (SHOW_HANDOFF_STATES.has(snapshot.status)) {
      if (improv && !recorded.home_assistant) {
        recorded.home_assistant = true;
        service.markHandoffShown('home_assistant');
      }
      const wifiStatus = improv ? (snapshot.wifi_handoff_status || 'continue') : 'unavailable';
      if (recorded.wifi !== wifiStatus) {
        recorded.wifi = wifiStatus;
        service.markHandoffShown('wifi', wifiStatus);
      }
    }
    if (FAILURE_STATES.has(snapshot.status) && !recorded.recovery) {
      recorded.recovery = true;
      service.markHandoffShown('recovery');
    }
  }

  function head() {
    return [
      flowHead('Your hub is flashed. Finish Wi-Fi setup over the same USB connection in the installer dialog — no app needed — then verify it below.'),
      DeviceChip({ name: device.name, target: device.target }),
    ];
  }

  function firmwareMeta(snapshot) {
    const fields = [
      ['Firmware', snapshot.selected_firmware_name || (build && build.name) || '—'],
      ['Version', snapshot.selected_firmware_version || '—'],
      ['Channel', snapshot.selected_channel || '—'],
      ['Configuration', snapshot.selected_config || (build && build.config_string) || '—'],
    ];
    if (snapshot.selected_commit) {
      fields.push(['Source commit', snapshot.selected_commit.slice(0, 12)]);
    }
    return h('dl', { class: 'pf-meta' },
      fields.flatMap(([label, value]) => [
        h('dt', null, label),
        h('dd', null, value),
      ]));
  }

  function validationList(snapshot) {
    if (!snapshot.validation_attempted) {
      return null;
    }
    return h('ul', { class: 'pf-checks', 'data-post-flash-validation-list': '' },
      snapshot.validation_checks.map((check) =>
        h('li', { 'data-check-id': check.name, 'data-check-status': check.status },
          h('span', { class: 'pf-checks__label' }, VALIDATION_LABELS[check.name] || check.name),
          h('span', { class: 'pf-checks__status pf-checks__status--' + check.status },
            STATUS_LABELS[check.status] || check.status),
          check.detail && h('span', { class: 'pf-checks__detail' }, check.detail))));
  }

  // Home Assistant handoff — only when the selected build advertises improv:true.
  function homeAssistantHandoff(snapshot) {
    const show = SHOW_HANDOFF_STATES.has(snapshot.status)
      && snapshot.selected_improv_supported === true;
    if (!show) {
      return null;
    }
    return h('section', { class: 'pf-handoff', 'data-post-flash-handoff': 'home-assistant' },
      h('h3', null, 'Adopt in Home Assistant'),
      h('ol', { class: 'pf-handoff__steps' }, HOME_ASSISTANT_STEPS.map((s) => h('li', null, s))),
      h('a', { class: 'btn', href: HOME_ASSISTANT_URL, target: '_blank', rel: 'noopener noreferrer',
        'data-post-flash-ha-open': '' }, icon('home'), ' Open Home Assistant'));
  }

  // Wi-Fi handoff status line. Never displays an SSID or a password — it only
  // describes whether Improv Wi-Fi setup is available / done / failed.
  function wifiHandoff(snapshot) {
    if (!SHOW_HANDOFF_STATES.has(snapshot.status)) {
      return null;
    }
    let label;
    let status;
    if (snapshot.selected_improv_supported !== true) {
      label = 'Wi-Fi setup is not available for this firmware.';
      status = 'unavailable';
    } else if (snapshot.wifi_handoff_status === 'failed') {
      label = 'Wi-Fi setup failed — copy the support bundle and try again.';
      status = 'failed';
    } else if (snapshot.wifi_handoff_status === 'already_done') {
      label = 'Wi-Fi setup already completed.';
      status = 'already_done';
    } else {
      label = 'Finish Wi-Fi setup using the installer’s Wi-Fi step over the same USB connection.';
      status = 'continue';
    }
    return h('section', { class: 'pf-handoff', 'data-post-flash-handoff': 'wifi' },
      h('p', { 'data-post-flash-wifi-status': '', 'data-wifi-status': status }, label));
  }

  // Recovery handoff on a failed / cancelled flash. The rescue modal itself is
  // wired by PR 8; here we surface the recovery affordance with the same
  // [data-rescue-open] hook the 1.0 rescue handler delegates on.
  function recoveryHandoff(snapshot) {
    if (!FAILURE_STATES.has(snapshot.status)) {
      return null;
    }
    return h('section', { class: 'pf-handoff', 'data-post-flash-handoff': 'recovery' },
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-rescue-open': '' },
        icon('life'), ' Open Rescue & Recovery'));
  }

  // Footer action-bar items: Open Home Assistant (only for an improv build in a
  // handoff state) plus the always-present "Flash another hub" reset.
  function footActions(snapshot) {
    const children = [];
    if (SHOW_HANDOFF_STATES.has(snapshot.status) && snapshot.selected_improv_supported === true) {
      children.push(
        h('a', { class: 'btn', href: HOME_ASSISTANT_URL, target: '_blank', rel: 'noopener noreferrer' },
          icon('home'), ' Open Home Assistant'));
    }
    children.push(
      h('button', { class: 'btn--ghost btn', onClick: onDone }, 'Flash another hub'));
    return children;
  }

  function render(snapshot) {
    if (rendering) {
      return;
    }
    rendering = true;
    try {
      const copy = STATE_COPY[snapshot.status] || STATE_COPY.not_started;
      const busy = snapshot.status === 'in_progress' || snapshot.status === 'completed';
      const isSuccess = copy.tone === 'success';

      // Root hook is wf2-namespaced so it can never be hijacked by the 1.0
      // post-flash-panel.js module (which does a global query for
      // [data-post-flash-panel]); the two views never manage the same DOM. A
      // validated success gets the design's green check badge in the panel head.
      const card = h('div', { class: 'card', 'data-wf2-post-flash-panel': '', 'data-state': snapshot.status,
        'data-tone': copy.tone, style: { padding: '22px' } },
        h('div', { class: 'pf-head' },
          busy
            ? icon('spinner', { cls: 'spin', size: 22, style: { color: 'var(--accent)' } })
            : isSuccess
              ? h('span', { class: 'success__badge success__badge--sm' }, icon('check', { style: { strokeWidth: '2.5' } }))
              : null,
          h('div', null,
            h('h2', { class: 'pf-title', 'data-post-flash-title': '' }, copy.title),
            h('p', { class: 'pf-summary', 'data-post-flash-summary': '' }, copy.summary))),
        firmwareMeta(snapshot),
        validationList(snapshot),
        homeAssistantHandoff(snapshot),
        wifiHandoff(snapshot),
        recoveryHandoff(snapshot));

      // Flow layout: the post-flash panel scrolls in the body; the actions live
      // in the persistent footer action bar.
      mount(mainEl,
        h('div', { class: 'flowbody' },
          h('div', { class: 'flowcol' }, ...head(), card)),
        h('div', { class: 'winfoot' },
          onSkip ? h('button', { class: 'btn--quiet btn', onClick: onSkip }, 'Set up Wi-Fi later') : null,
          h('span', { class: 'winfoot__spacer' }),
          ...footActions(snapshot)));

      if (a11y && typeof a11y.announce === 'function') {
        a11y.announce(copy.title);
      }

      recordHandoffs(snapshot);
    } finally {
      rendering = false;
    }
  }

  // subscribe() invokes render synchronously with the current snapshot, then on
  // every subsequent lifecycle / validation update.
  const unsubscribe = service.subscribe(render);
  mainEl.__dispose = () => {
    try { unsubscribe(); } catch { /* already torn down */ }
  };

  return mainEl;
}
