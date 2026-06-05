/* WebFlash 2.0 — Step 1: Identify your hardware.

   PR 4 of the WebFlash 2.0 migration binds this step to the real engine:
     - kit cards come from the real catalogue (scripts/data/kits.json), passed
       in as `kits`. There is no hardcoded kit list.
     - the firmware target and the installability verdict come from the engine's
       compatible-firmware lookup, passed in as `resolved`. The view renders the
       verdict; it never decides installability itself.
     - a configuration with no installable stable or preview build is blocked
       from Continue and routed to the ESPHome source path instead. */
import { h, mount } from './h.js';
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

/* ---------- Kit picker (master–detail browser) ----------
   WF2 Step 1 redesign. Replaces the stacked KitHero cards with a compact,
   height-capped master list (search + channel chips) and a sticky detail panel,
   recreated from the design handoff prototype on the real engine. The list is
   the real catalogue (scripts/data/kits.json, passed in as `kits`); the firmware
   target + installability still come from the engine verdict (`resolved`) for
   the committed kit, and Continue still gates on that verdict.

   State ownership mirrors the prototype: the committed selection (kit/setKit) is
   lifted to the app, while the picker's own UI state — search query, channel
   filter, and which row's detail is focused — is local to this step. It lives in
   module scope (not app state) so it survives the app-level re-render a commit
   triggers, and so search/filter/focus changes can re-render only the list +
   detail without rebuilding the search input (which would drop the caret).
   resetIdentifyPickerState() clears it when the whole flow resets. */
const picker = { q: '', chan: 'all', focusId: null };

/**
 * Clears the picker's local UI state (search query, channel filter, focused
 * row). Called by the app when the flow resets so Step 1 returns to a clean
 * picker, matching the prototype's fresh-on-remount local state.
 */
export function resetIdentifyPickerState() {
  picker.q = '';
  picker.chan = 'all';
  picker.focusId = null;
}

// Channel metadata for the detail flag pill. `recommended` is its own visual key
// (teal) but resolves to the stable channel for filtering; preview is amber.
const FLAG_META = {
  recommended: { cls: 'flag--rec', tag: 'Recommended for you' },
  stable: { cls: 'flag--stable', tag: 'Stable firmware' },
  preview: { cls: 'flag--preview', tag: 'Preview channel' },
};

// The kit's resting channel key (drives the row dot + detail flag).
function kitChannelKey(kit) {
  if (kit.recommended) return 'recommended';
  return kit.firmware_channel === 'preview' ? 'preview' : 'stable';
}
// The channel a kit is filtered under by the All / Stable / Preview chips.
// Recommended kits ship on the stable channel, so they show under Stable.
function kitFilterChannel(kit) {
  return kit.firmware_channel === 'preview' ? 'preview' : 'stable';
}
// The mono "· Stable" / "· Preview" word shown in the row meta.
function channelWord(key) {
  return key === 'preview' ? 'Preview' : 'Stable';
}
// A short channel tagline for search. The catalogue has no `tagline` field, so
// this mirrors the prototype's per-channel supporting line.
function kitTagline(kit) {
  return kitFilterChannel(kit) === 'preview'
    ? 'Preview firmware · acknowledge before install'
    : 'Stable firmware · ready to install';
}
// Case-insensitive match over name + tagline + description + each part's
// label + SKU, gated by the active channel chip. The description is included
// because it is the catalogue's real supporting text (the spec's "tagline").
function kitMatches(kit, q, chan) {
  if (chan !== 'all' && kitFilterChannel(kit) !== chan) return false;
  const query = (q || '').trim().toLowerCase();
  if (!query) return true;
  const partsText = (kit.components || [])
    .map((p) => `${p.label || p.name || ''} ${p.sku || ''}`)
    .join(' ');
  const hay = `${kit.display_name || kit.sku} ${kitTagline(kit)} ${kit.description || ''} ${partsText}`.toLowerCase();
  return hay.includes(query);
}

/* ---------- Compact list row (master) ---------- */
function KitRow(kit, { focused, selected, onFocus }) {
  const key = kitChannelKey(kit);
  return h('button', {
    class: 'kitrow' + (focused ? ' is-focused' : '') + (selected ? ' is-selected' : ''),
    type: 'button',
    // aria-pressed marks which row's detail is currently shown on the right.
    'aria-pressed': String(!!focused),
    onClick: () => onFocus(kit),
  },
    // Visually hidden marker so assistive tech announces the committed kit (the
    // check glyph is decorative / aria-hidden).
    selected && h('span', { class: 'sr-only' }, 'Selected. '),
    h('span', { class: 'kitrow__dot kitrow__dot--' + key }),
    h('span', { class: 'kitrow__main' },
      h('span', { class: 'kitrow__name' },
        kit.display_name || kit.sku,
        kit.recommended && h('span', { class: 'kitrow__rec' }, 'Recommended'),
      ),
      h('span', { class: 'kitrow__meta' },
        `${(kit.components || []).length} parts · ${channelWord(key)}`),
    ),
    h('span', { class: 'kitrow__right' },
      selected
        ? h('span', { class: 'kitrow__check' }, icon('check'))
        : icon('arrowR', { cls: 'kitrow__chev' }),
    ),
  );
}

/* ---------- Detail panel (detail) ----------
   `liveResolved` is the engine verdict, passed only when this kit is the
   committed selection (the engine resolves against the committed state). For a
   merely focused kit it is null and the panel falls back to the catalogue's
   declared channel + config_string. */
function KitDetail(kit, { selected, liveResolved, onSelect }) {
  const liveChannel = liveResolved && liveResolved.channel ? liveResolved.channel : null;
  const key = kit.recommended
    ? 'recommended'
    : ((liveChannel || kit.firmware_channel) === 'preview' ? 'preview' : 'stable');
  const meta = FLAG_META[key] || FLAG_META.stable;
  const word = liveChannel ? capitalize(liveChannel) : channelWord(key);
  const target = (liveResolved && liveResolved.configString) || kit.firmware_config_string || '';

  return h('div', { class: 'kitdetail fadein' },
    h('div', { class: 'kitdetail__head' },
      h('span', { class: 'flag ' + meta.cls }, meta.tag),
      h('h2', null, kit.display_name || kit.sku),
      kit.description && h('p', { class: 'kitdetail__desc' }, kit.description),
    ),
    h('div', { class: 'devicebox devicebox--detail' },
      h('span', { class: 'devicebox__tag' }, 'ceiling hub render'),
    ),
    h('div', { class: 'kitdetail__parts' },
      h('span', { class: 'kitdetail__lbl' }, 'Included boards'),
      KitParts(kit.components || []),
    ),
    h('div', { class: 'kitdetail__foot' },
      h('span', { class: 'kit-hero__target' }, word + ' · ', h('b', null, target)),
      h('button', {
        class: (selected ? 'btn' : 'btn--ghost btn') + ' btn--block',
        type: 'button',
        onClick: () => onSelect(kit),
      }, selected ? [icon('check'), ' Selected'] : 'Select this kit'),
    ),
  );
}

/* ---------- The picker (master + detail wired together) ----------
   Builds the two-column browser and owns the targeted re-render. The search
   input and channel chips are stable nodes; only the list, the count, and the
   detail panel are rebuilt on a search / filter / focus change. */
function KitPicker({ kits, kit, setKit, resolved }) {
  const selectedSku = kit ? kit.sku : null;

  // Initialise focus to the committed kit (e.g. a kit share link), else the
  // first kit. Re-derive if the remembered focus is no longer in the catalogue.
  if (!picker.focusId || !kits.some((k) => k.sku === picker.focusId)) {
    picker.focusId = selectedSku && kits.some((k) => k.sku === selectedSku)
      ? selectedSku
      : (kits[0] ? kits[0].sku : null);
  }

  const listEl = h('div', { class: 'kit-list', 'aria-label': 'Firmware kits' });
  const countEl = h('div', { class: 'kit-count' });
  const asideEl = h('aside', { class: 'kit-aside' });
  let lastDetailSku = null;

  // --- toolbar: stable nodes the targeted re-render never rebuilds ---
  const searchInput = h('input', {
    class: 'kit-search__input',
    type: 'text',
    autocomplete: 'off',
    placeholder: 'Search kits, boards or SKU…',
    'aria-label': 'Search kits, boards or SKU',
    value: picker.q,
    onInput: (e) => { picker.q = e.target.value; syncToolbar(); syncList(); },
  });
  const clearBtn = h('button', {
    class: 'kit-search__clear', type: 'button', 'aria-label': 'Clear search',
    onClick: () => { picker.q = ''; searchInput.value = ''; syncToolbar(); syncList(); searchInput.focus(); },
  }, '×');
  const search = h('div', { class: 'kit-search' },
    icon('chip', { cls: 'kit-search__ico' }),
    searchInput,
    clearBtn,
  );

  const FILTERS = [
    { id: 'all', label: 'All kits' },
    { id: 'stable', label: 'Stable' },
    { id: 'preview', label: 'Preview' },
  ];
  const chipEls = new Map();
  const chips = h('div', { class: 'kit-chips', role: 'group', 'aria-label': 'Filter kits by channel' },
    FILTERS.map((f) => {
      const el = h('button', {
        class: 'kit-chip', type: 'button',
        onClick: () => { picker.chan = f.id; syncToolbar(); syncList(); },
      }, f.label);
      chipEls.set(f.id, el);
      return el;
    }),
  );

  // Reflect q + chan onto the stable toolbar nodes (no rebuild → caret kept).
  function syncToolbar() {
    clearBtn.hidden = !picker.q;
    FILTERS.forEach((f) => {
      const el = chipEls.get(f.id);
      if (!el) return;
      const on = picker.chan === f.id;
      el.setAttribute('class', 'kit-chip' + (on ? ' is-on' : ''));
      el.setAttribute('aria-pressed', String(on));
    });
  }

  // --- targeted re-render of list + count + detail ---
  function syncList() {
    const filtered = kits.filter((k) => kitMatches(k, picker.q, picker.chan));

    // The detail must always reflect a selectable (visible) row: if the focused
    // kit was filtered out, refocus the first visible result. When nothing
    // matches there is no selectable row, so keep the last focus so the panel
    // does not vanish (the empty state + Clear filters drives recovery). This is
    // the one deliberate deviation from the prototype, which keeps focus stable.
    let focusKit = kits.find((k) => k.sku === picker.focusId) || null;
    if (filtered.length && (!focusKit || !filtered.some((k) => k.sku === picker.focusId))) {
      focusKit = filtered[0];
      picker.focusId = focusKit.sku;
    }
    if (!focusKit) focusKit = filtered[0] || kits[0] || null;

    if (filtered.length === 0) {
      mount(listEl,
        h('div', { class: 'kit-empty' },
          `No kits match “${picker.q}”.`,
          h('button', {
            class: 'linkbtn', type: 'button',
            onClick: () => { picker.q = ''; picker.chan = 'all'; searchInput.value = ''; syncToolbar(); syncList(); },
          }, 'Clear filters'),
        ),
      );
    } else {
      mount(listEl, filtered.map((k) =>
        KitRow(k, {
          focused: !!(focusKit && focusKit.sku === k.sku),
          selected: selectedSku === k.sku,
          onFocus: () => { picker.focusId = k.sku; syncList(); },
        })));
    }

    countEl.textContent = `Showing ${filtered.length} of ${kits.length} kits`;

    // Only re-mount the detail (replaying its fadein) when the focused kit
    // actually changes — not on every keystroke that leaves focus unchanged.
    const sku = focusKit ? focusKit.sku : null;
    if (sku !== lastDetailSku) {
      lastDetailSku = sku;
      const isSelected = !!(focusKit && selectedSku === focusKit.sku);
      mount(asideEl, focusKit
        ? KitDetail(focusKit, { selected: isSelected, liveResolved: isSelected ? resolved : null, onSelect: setKit })
        : null);
    }
  }

  syncToolbar();
  syncList();

  return h('div', { class: 'kit-picker' },
    h('div', { class: 'kit-browser' },
      h('div', { class: 'kit-toolbar' }, search, chips),
      listEl,
      countEl,
    ),
    asideEl,
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
      kits.length > 0 && KitPicker({ kits, kit, setKit, resolved }),
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
