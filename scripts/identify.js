/* WebFlash 2.0 — Step 1: Identify your hardware.

   PR 4 of the WebFlash 2.0 migration binds this step to the real engine:
     - kit cards come from the real catalogue (scripts/data/kits.json), passed
       in as `kits`. There is no hardcoded kit list.
     - the firmware target and the installability verdict come from the engine's
       compatible-firmware lookup, passed in as `resolved`. The view renders the
       verdict; it never decides installability itself.
     - a configuration with no installable stable or preview build is blocked
       from Continue and routed to the ESPHome source path instead. */
import { h } from './h.js';
import { icon } from './icons.js';
import { StepHead } from './ui.js';
import { POWER, AIR, ROOMIQ, FAN, LED } from './data.js';

function capitalize(value) {
  const text = (value || '').toString();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function KitParts(parts) {
  return h('div', { class: 'parts' },
    parts.map((p) =>
      h('span', { class: 'part' },
        h('span', { class: 'part__dot' }),
        p.label || p.name,
        p.sku && h('span', { class: 'part__sku' }, p.sku),
      ),
    ),
  );
}

/* A blocked configuration (no signed stable or preview build) is never routed
   to the install flow. This callout points the user at the ESPHome source path
   instead, exactly as the 1.0 view does for an unsupported selection. */
function SourceCallout(sourceUrl, configString) {
  return h('div', { class: 'callout callout--warn' },
    icon('alert'),
    h('span', null,
      h('b', null, 'No installable firmware for this configuration. '),
      "This combination doesn't have a signed WebFlash build yet, so it can't be flashed here. ",
      'You can build it from source with ',
      h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'ESPHome YAML'),
      configString ? [' (firmware target ', h('code', null, configString), ').'] : '.',
    ),
  );
}

function KitHero(kit, selected, onSelect, resolved) {
  // The live channel / installability for a kit is only known once it is the
  // active selection (the engine lookup runs against the selected state). For an
  // unselected card fall back to the catalogue's declared channel.
  const liveResolved = selected ? resolved : null;
  const isPreview = liveResolved ? liveResolved.isPreview : kit.firmware_channel === 'preview';
  const channelLabel = liveResolved && liveResolved.channel
    ? capitalize(liveResolved.channel)
    : (isPreview ? 'Preview' : 'Stable');
  const target = liveResolved && liveResolved.configString
    ? liveResolved.configString
    : kit.firmware_config_string;
  const flagLabel = kit.recommended ? 'Recommended for you' : (isPreview ? 'Preview channel' : 'Supported kit');

  return h('div', { class: 'kit-hero fadein' + (selected ? ' is-selected' : '') },
    h('div', { class: 'kit-hero__top' },
      h('div', { class: 'kit-hero__body' },
        h('span', { class: 'flag ' + (isPreview ? 'flag--preview' : 'flag--rec') }, flagLabel),
        h('h2', null, kit.display_name || kit.sku),
        kit.description && h('p', { class: 'kit-hero__desc' }, kit.description),
        kit.sample && h('p', { class: 'kit-hero__desc', style: { opacity: '0.75' } },
          'Sample configuration — replace with your purchased kit SKU.'),
        KitParts(kit.components || []),
      ),
      h('div', { class: 'devicebox' },
        h('span', { class: 'devicebox__tag' }, 'ceiling hub render'),
      ),
    ),
    h('div', { class: 'kit-hero__foot' },
      h('span', { class: 'kit-hero__target' },
        channelLabel + ' · ', h('b', null, target)),
      h('button', {
        class: selected ? 'btn' : 'btn--ghost btn',
        onClick: () => onSelect(kit),
      }, selected ? [icon('check'), ' Selected'] : 'Select this kit'),
    ),
  );
}

/* ---------- Advanced module builder ---------- */
function Opt({ on, disabled, name, sku, desc, req, note, noteDanger, onClick }) {
  return h('button', {
    class: 'opt' + (on ? ' is-on' : '') + (disabled ? ' opt--disabled' : ''),
    disabled: !!disabled,
    onClick: () => !disabled && onClick(),
  },
    h('span', { class: 'opt__check' }, icon('check')),
    h('div', { class: 'opt__row' },
      h('span', { class: 'opt__name' }, name),
      sku && sku !== '—' && h('span', { class: 'opt__sku' }, sku),
    ),
    desc && h('div', { class: 'opt__desc' }, desc),
    req && req.length > 0 &&
      h('div', { class: 'reqline' }, req.map((r) => h('span', { class: 'reqtag' }, r))),
    note &&
      h('span', { class: 'opt__note' + (noteDanger ? ' opt__note--danger' : '') },
        icon('alert', { size: 13 }), ' ', note),
  );
}

function Section(title, hint, body) {
  return h('div', { class: 'bsection' },
    h('div', { class: 'bsection__head' },
      h('h3', null, title),
      hint && h('span', { class: 'hint' }, hint),
    ),
    h('div', { class: 'bsection__body' }, body),
  );
}

function AdvancedBuilder(sel, setSel) {
  const conflictsWith = (id) => {
    // collect ids that conflict with current selection. RoomIQ (presence) and
    // the LED ring carry no conflicts, so only the air-quality and fan choices
    // contribute. This keeps the AirIQ/DAC conflict working across sections.
    const active = [sel.air, sel.fan].filter((x) => x && x !== 'none');
    const all = [...AIR, ...FAN];
    const out = new Set();
    active.forEach((aid) => {
      const item = all.find((x) => x.id === aid);
      (item?.conflicts || []).forEach((c) => out.add(c));
    });
    return out.has(id);
  };

  return h('div', { class: 'builder fadein' },
    Section('Power', 'How the hub is powered',
      h('div', { class: 'optgrid' },
        POWER.map((p) =>
          Opt({ ...p, on: sel.power === p.id, onClick: () => setSel({ ...sel, power: p.id }) })),
      ),
    ),
    Section('Presence', 'Optional — Sense360 RoomIQ presence board',
      Opt({ ...ROOMIQ, on: sel.roomiq, onClick: () => setSel({ ...sel, roomiq: !sel.roomiq }) }),
    ),
    Section('Air quality', 'Choose one air-quality board',
      h('div', { class: 'optgrid' },
        AIR.map((a) => {
          const conflict = conflictsWith(a.id) && sel.air !== a.id;
          return Opt({
            ...a, on: sel.air === a.id, disabled: conflict,
            note: conflict ? 'Conflicts with current selection' : (a.bathroom ? 'Bathroom mode' : null),
            onClick: () => setSel({ ...sel, air: a.id }),
          });
        }),
      ),
    ),
    Section('Fan & switching', 'Optional fan driver',
      h('div', { class: 'optgrid' },
        FAN.map((f) => {
          const conflict = conflictsWith(f.id) && sel.fan !== f.id;
          const blocked = f.installable === false;
          return Opt({
            ...f, on: sel.fan === f.id, disabled: conflict || blocked,
            note: blocked ? 'Not installable in WebFlash yet'
              : conflict ? 'Conflicts with current selection'
                : f.advancedWarn ? 'Advanced — requires acknowledgement' : null,
            noteDanger: blocked,
            onClick: () => setSel({ ...sel, fan: f.id }),
          });
        }),
      ),
    ),
    Section('Status ring', 'Optional',
      Opt({ ...LED, on: sel.led, onClick: () => setSel({ ...sel, led: !sel.led }) }),
    ),
  );
}

function label(list, id) {
  const x = list.find((i) => i.id === id);
  return x ? x.name : '—';
}

function sumRow(k, v) {
  return h('div', { class: 'sum-row' },
    h('span', { class: 'sum-row__k' }, k),
    h('span', { class: 'sum-row__v' }, v),
  );
}

/* ---------- The step ---------- */
export function IdentifyStep({ mode, setMode, kits, kitError, kit, setKit, sel, setSel, resolved, sourceUrl, onContinue }) {
  const head = StepHead({
    eyebrow: 'Step 1 — Identify',
    eyebrowIcon: 'chip',
    title: mode === 'kit' ? "Let's find your hardware" : 'Build your hub',
    desc: mode === 'kit'
      ? 'Most customers have the standard Bathroom PoE kit. Confirm it below — or build a setup module by module.'
      : "Pick the exact boards in your hub. We'll resolve the matching firmware target as you go.",
  });

  if (mode === 'kit') {
    // The Continue gate is the engine verdict for the selected kit. A kit can
    // only advance once the engine resolves it to an installable build; a kit
    // that resolves to no build is routed to the source path, never to install.
    const selectedInstallable = Boolean(kit && resolved && resolved.installable);
    const selectedBlocked = Boolean(kit && resolved && !resolved.installable && resolved.reason === 'no-build');

    return h('div', { class: 'main' }, head,
      kitError && h('div', { class: 'callout callout--warn' },
        icon('alert'),
        h('span', null, h('b', null, 'Unknown kit. '), kitError),
      ),
      kits.length === 0 && !kitError && h('div', { class: 'callout callout--warn' },
        icon('alert'),
        h('span', null,
          h('b', null, 'No kits are available right now. '),
          'Build your hub module by module instead.'),
      ),
      kits.map((k) =>
        h('div', { style: { marginBottom: '18px' } },
          KitHero(k, kit?.sku === k.sku, setKit, resolved))),
      selectedBlocked && SourceCallout(sourceUrl, resolved.configString),
      h('div', { class: 'hatch' },
        h('span', null, 'Different hardware, or no kit?'),
        h('button', { class: 'linkbtn', onClick: () => setMode('advanced') },
          'Build it module by module →'),
      ),
      h('div', { class: 'stepnav' },
        h('span', { class: 'stepnav__spacer' }),
        h('button', { class: 'btn btn--lg', disabled: !selectedInstallable, onClick: onContinue },
          'Continue ' + (kit ? `with ${(kit.display_name || kit.sku).split('—')[0].trim()} ` : ''),
          icon('arrowR')),
      ),
    );
  }

  // mode === 'advanced'
  const advHasInputs = Boolean(sel.power);
  const advInstallable = Boolean(advHasInputs && resolved && resolved.installable);
  const advBlocked = Boolean(advHasInputs && resolved && !resolved.installable && resolved.reason === 'no-build');
  const targetString = resolved && resolved.configString ? resolved.configString : '';

  return h('div', { class: 'main' }, head,
    h('div', { class: 'with-aside' },
      h('div', null,
        AdvancedBuilder(sel, setSel),
        advBlocked && SourceCallout(sourceUrl, targetString),
        h('div', { class: 'hatch' },
          h('span', null, 'Have the standard kit after all?'),
          h('button', { class: 'linkbtn', onClick: () => setMode('kit') },
            '← Back to kit picker'),
        ),
      ),
      h('aside', { class: 'aside' },
        h('div', { class: 'summary-card' },
          h('h4', null, 'Your configuration'),
          sumRow('Power', label(POWER, sel.power)),
          sumRow('Presence', sel.roomiq ? ROOMIQ.name : '—'),
          sumRow('Air quality', sel.air && sel.air !== 'none' ? label(AIR, sel.air) : '—'),
          sumRow('Fan', label(FAN, sel.fan) || 'None'),
          sumRow('Status ring', sel.led ? 'Included' : '—'),
        ),
        h('div', { class: 'target-card' },
          h('h4', null, 'Firmware target'),
          advHasInputs && targetString
            ? h('code', { class: advInstallable ? '' : 'muted' }, targetString)
            : h('code', { class: 'muted' },
                advHasInputs ? 'Checking firmware availability…' : 'Select power to find firmware…'),
        ),
        h('button', { class: 'btn btn--block', disabled: !advInstallable, onClick: onContinue },
          'Continue ', icon('arrowR')),
      ),
    ),
  );
}
