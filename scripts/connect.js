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
import { StepHead, DeviceChip } from './ui.js';

const HOME_ASSISTANT_URL = 'https://my.home-assistant.io/redirect/integrations/';

// PRODUCT-GUIDES-001 G3 — the customer product-guides site, published from
// sense360store/esphome-public via GitHub Pages. The post-flash "next steps"
// handoff links the guide for the flashed configuration so placement, the
// Home Assistant entities, updating, and recovery help are one click from the
// success state. The shell's Guides link (scripts/app.js -> ui.js WinBar)
// reuses this constant so both surfaces point at one site.
export const PRODUCT_GUIDES_URL = 'https://sense360store.github.io/esphome-public/';

// The served configurations with a dedicated product guide, keyed by the
// build's config_string (the same identity the manifest and the post-flash
// snapshot carry). Guide slugs mirror the site's nav
// (site/mkdocs.yml in sense360store/esphome-public). Any other configuration
// (for example Rescue) falls back to the guides overview page so the link is
// always honest — it never claims a per-product guide that does not exist.
export const PRODUCT_GUIDE_PATHS = Object.freeze({
  'Ceiling-POE-RoomIQ': 'products/ceiling-poe-roomiq/',
  'Ceiling-POE-AirIQ-RoomIQ': 'products/ceiling-poe-airiq-roomiq/',
  'Ceiling-POE-VentIQ-RoomIQ': 'products/ceiling-poe-ventiq-roomiq/',
  'Ceiling-POE-VentIQ-RoomIQ-LED': 'products/ceiling-poe-ventiq-roomiq-led/',
});

/**
 * Resolves the product-guide link for a flashed configuration.
 *
 * @param {string} configString  The build's config_string.
 * @returns {{url: string, exact: boolean}}  The guide URL, and whether it is
 *   the configuration's own guide (true) or the guides overview fallback.
 */
export function productGuideLink(configString) {
  const cfg = typeof configString === 'string' ? configString.trim() : '';
  const path = PRODUCT_GUIDE_PATHS[cfg];
  if (path) {
    return { url: PRODUCT_GUIDES_URL + path, exact: true };
  }
  return { url: PRODUCT_GUIDES_URL + 'products/', exact: false };
}

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
  const mainEl = h('div', { class: 'main' });

  const service = engine && engine.postFlash ? engine.postFlash.service : null;

  // Engine-absent fallback (a bare app.js mount with no engine, e.g. a shell
  // scaffolding unit test). There is no real flash and no post-flash state to
  // render, so show an honest notice instead of a simulated success screen.
  if (!service) {
    mount(mainEl,
      StepHead({ eyebrow: 'Step 3 — Connect', eyebrowIcon: 'wifi', title: 'Connect your hub to Wi-Fi',
        desc: 'Wi-Fi setup runs over the same USB connection in the published installer.' }),
      DeviceChip({ name: device.name, target: device.target }),
      h('div', { class: 'card', style: { padding: '22px' } },
        h('div', { class: 'callout callout--info' }, icon('info'),
          h('span', null, h('b', null, 'Wi-Fi setup runs in the published installer. '),
            'This design preview cannot open a USB connection. Use the live WebFlash installer to flash a hub and join it to Wi-Fi.'))),
      h('div', { class: 'stepnav' },
        h('span', { class: 'stepnav__spacer' }),
        h('button', { class: 'btn btn--lg', onClick: onDone }, 'Flash another hub')),
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
      StepHead({ eyebrow: 'Step 3 — Connect', eyebrowIcon: 'wifi', title: 'Connect your hub to Wi-Fi',
        desc: 'Your hub is flashed. Finish Wi-Fi setup over the same USB connection in the installer dialog — no app needed — then verify it below.' }),
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

  // PRODUCT-GUIDES-001 G3 — post-install "next steps": link the flashed
  // product's guide. Shown in the same completed states as the other handoffs.
  // The configuration comes from the post-flash snapshot (what was actually
  // flashed), falling back to the resolved build; a configuration without a
  // dedicated guide gets the guides overview instead of a broken link.
  function guideHandoff(snapshot) {
    if (!SHOW_HANDOFF_STATES.has(snapshot.status)) {
      return null;
    }
    const config = snapshot.selected_config || (build && build.config_string) || '';
    const guide = productGuideLink(config);
    const lead = guide.exact
      ? 'Your product guide covers where to mount the hub, the entities it adds to Home Assistant, how to update it, and how to recover it.'
      : 'The product guides cover mounting, the entities each product adds to Home Assistant, updating, and recovery.';
    return h('section', { class: 'pf-handoff', 'data-post-flash-handoff': 'product-guide' },
      h('h3', null, 'Next steps'),
      h('p', null, lead),
      h('a', { class: 'btn', href: guide.url, target: '_blank', rel: 'noopener noreferrer',
        'data-post-flash-guide-open': '', 'data-guide-match': guide.exact ? 'exact' : 'overview' },
        icon('info'), guide.exact ? ' Open the product guide' : ' Browse the product guides'));
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

  function actions(snapshot) {
    const children = [];
    if (SHOW_HANDOFF_STATES.has(snapshot.status) && snapshot.selected_improv_supported === true) {
      children.push(
        h('a', { class: 'btn btn--lg', href: HOME_ASSISTANT_URL, target: '_blank', rel: 'noopener noreferrer' },
          icon('home'), ' Open Home Assistant'));
    }
    children.push(
      h('button', { class: 'btn--ghost btn btn--lg', onClick: onDone }, 'Flash another hub'));
    return h('div', { class: 'success__actions' }, ...children);
  }

  function render(snapshot) {
    if (rendering) {
      return;
    }
    rendering = true;
    try {
      const copy = STATE_COPY[snapshot.status] || STATE_COPY.not_started;
      const busy = snapshot.status === 'in_progress' || snapshot.status === 'completed';

      // Root hook is wf2-namespaced so it can never be hijacked by the 1.0
      // post-flash-panel.js module (which does a global query for
      // [data-post-flash-panel]); the two views never manage the same DOM.
      const card = h('div', { class: 'card', 'data-wf2-post-flash-panel': '', 'data-state': snapshot.status,
        'data-tone': copy.tone, style: { padding: '22px' } },
        h('div', { class: 'pf-head' },
          busy
            ? icon('spinner', { cls: 'spin', size: 22, style: { color: 'var(--accent)' } })
            : null,
          h('div', null,
            h('h2', { class: 'pf-title', 'data-post-flash-title': '' }, copy.title),
            h('p', { class: 'pf-summary', 'data-post-flash-summary': '' }, copy.summary))),
        firmwareMeta(snapshot),
        validationList(snapshot),
        homeAssistantHandoff(snapshot),
        wifiHandoff(snapshot),
        guideHandoff(snapshot),
        recoveryHandoff(snapshot));

      mount(mainEl,
        ...head(),
        card,
        h('div', { class: 'stepnav' },
          onSkip ? h('button', { class: 'btn--quiet btn', onClick: onSkip }, 'Set up Wi-Fi later') : null,
          h('span', { class: 'stepnav__spacer' }),
          actions(snapshot)));

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
