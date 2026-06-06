/* WebFlash 2.0 — Step 1: Identify your hardware.

   WF2-IDENTIFY-RECO redesign. Step 1's kit chooser is a recommendation-first,
   two-view experience (the v3 design_handoff_installer_flow "Step 1 — Identify":
   README + flow-identify.jsx + app.css/mockups.css), replacing the #502
   master–detail browser. There are two customer-facing views with a toggle:

     View 1 — Recommendation (the default landing): one big .B__rec card for the
       catalogue's recommended kit (name, description, part chips) with an
       "Install this kit" primary CTA, plus a .B__more strip that teases the rest
       of the catalogue and links into View 2.
     View 2 — Browse (the full table): every catalogue kit in a sortable-feeling
       .ktable with search + channel filter chips and a sticky footer Continue.

   It stays bound to the real engine, exactly as PR 4 established:
     - kit cards/rows come from the real catalogue (scripts/data/kits.json),
       passed in as `kits`. There is no hardcoded kit list, and the recommended
       kit is the catalogue's own `recommended` flag (S360-KIT-BATH-P).
     - the firmware target and the installability verdict come from the engine's
       compatible-firmware lookup (`resolved` for the committed kit, `recResolved`
       for the recommendation card). The view renders the verdict; it never
       decides installability itself.
     - a configuration with no installable stable or preview build is blocked
       from Continue / Install and routed to the ESPHome source path instead.

   TRIAC fail-closed: the table and the recommendation strip surface ONLY real
   catalogue kits, and the catalogue has no FanTRIAC (or fan-only standalone)
   entry, so no TRIAC row can appear. FanTRIAC and the fan-only previews remain
   reachable only through "Build it module by module" (the advanced builder
   below), where a TRIAC selection still resolves to no signed build and is
   routed to source — the engine, not this view, owns that gate. */
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { StepHead } from './ui.js';
import { POWER, AIR, ROOMIQ, FAN, LED } from './data.js';

function capitalize(value) {
  const text = (value || '').toString();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

// Trim a kit's display name to its lead segment for a compact label (e.g. the
// footer selected-kit indicator / Continue button), dropping the "— PoE" suffix.
function shortKitName(kit) {
  if (!kit) return '';
  const name = kit.display_name || kit.sku || '';
  return name.split('—')[0].trim() || name;
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

// ---- channel helpers (shared by both views) ----
// The kit's resting channel key (drives the status dot + recommendation pill).
// `recommended` is its own visual key (accent) but ships on the stable channel.
function kitChannelKey(kit) {
  if (kit.recommended) return 'recommended';
  return kit.firmware_channel === 'preview' ? 'preview' : 'stable';
}
// The channel a kit is filtered under by the All / Stable / Preview chips.
// Recommended kits ship on the stable channel, so they show under Stable.
function kitFilterChannel(kit) {
  return kit.firmware_channel === 'preview' ? 'preview' : 'stable';
}
// The "Stable" / "Preview" word shown in row + minikit meta.
function channelWord(key) {
  return key === 'preview' ? 'Preview' : 'Stable';
}
// A short channel tagline used only to widen search matches. The catalogue has
// no `tagline` field, so this mirrors the per-channel supporting line.
function kitTagline(kit) {
  return kitFilterChannel(kit) === 'preview'
    ? 'Preview firmware · acknowledge before install'
    : 'Stable firmware · ready to install';
}
// Case-insensitive match over name + tagline + description + each part's label,
// SKU, and the firmware target, gated by the active channel chip.
function kitMatches(kit, q, chan) {
  if (chan !== 'all' && kitFilterChannel(kit) !== chan) return false;
  const query = (q || '').trim().toLowerCase();
  if (!query) return true;
  const partsText = (kit.components || [])
    .map((p) => `${p.label || p.name || ''} ${p.sku || ''}`)
    .join(' ');
  const hay = `${kit.display_name || kit.sku} ${kit.sku} ${kitTagline(kit)} ${kit.description || ''} ${partsText} ${kit.firmware_config_string || ''}`.toLowerCase();
  return hay.includes(query);
}

/* ---------- Step 1 kit selection — local view state ----------
   The committed selection (kit/setKit) is lifted to the app; this is the
   picker's own UI state — which of the two views is showing, plus the Browse
   view's search query and channel filter. It lives in module scope (not app
   state) so it survives the app-level re-render a commit triggers, and so a
   search / filter change can re-render only the table rows + count without
   rebuilding the search input (which would drop the caret).
   resetIdentifyPickerState() clears it when the whole flow resets. */
const picker = { view: 'rec', q: '', chan: 'all' };

/**
 * Clears the picker's local UI state (active view, search query, channel
 * filter). Called by the app when the flow resets so Step 1 returns to the
 * recommendation landing with a clean catalogue table.
 */
export function resetIdentifyPickerState() {
  picker.view = 'rec';
  picker.q = '';
  picker.chan = 'all';
}

/**
 * Sets which Step 1 view opens first. The app calls this during init so a
 * deep link to a specific catalogue kit (?configmode=kit&sku=…) opens straight
 * into the Browse table with that kit selected, while the default landing — and
 * every unknown-SKU / empty-catalogue fallback — stays on the recommendation
 * view. Presentation-only: it never changes the committed kit or the engine
 * verdict.
 *
 * @param {'rec'|'browse'} view
 */
export function setIdentifyInitialView(view) {
  if (view === 'rec' || view === 'browse') {
    picker.view = view;
  }
}

// The reassurance line under the recommendation CTA. A stable kit reads as the
// safe default (green check); a preview kit carries the acknowledge-first
// warning variant. The acknowledgement itself is still enforced by the engine
// at the Install step — this is reassurance copy, not a gate.
function Reassurance(isPreview) {
  if (isPreview) {
    return h('div', { class: 'B__reassure B__reassure--preview' },
      icon('alert', { size: 15 }),
      h('span', null, 'Preview firmware · acknowledge before install'));
  }
  return h('div', { class: 'B__reassure B__reassure--ok' },
    icon('check', { size: 15 }),
    h('span', null, 'Stable firmware · right for most people'));
}

// The escape hatch to the advanced module builder. Kept on every kit view so
// "I have different hardware" is always one click away (this is also where
// FanTRIAC and the fan-only previews are reached — the catalogue never lists
// them).
function Hatch(onAdvanced) {
  return h('div', { class: 'hatch' },
    h('span', null, 'Different hardware, or no kit?'),
    h('button', { class: 'linkbtn', type: 'button', onClick: onAdvanced },
      'Build it module by module →'),
  );
}

/* ---------- Recommendation view (View 1, default) ---------- */
function Minikit(kit, onBrowse) {
  const key = kitChannelKey(kit);
  return h('button', { class: 'minikit', type: 'button', onClick: onBrowse },
    h('span', { class: 'minikit__dot minikit__dot--' + key }),
    h('span', { class: 'minikit__main' },
      h('span', { class: 'minikit__name' }, kit.display_name || kit.sku),
      h('span', { class: 'minikit__meta' },
        `${(kit.components || []).length} parts · ${channelWord(kitFilterChannel(kit))}`),
    ),
  );
}

function MoreStrip({ kits, recKit, onBrowse }) {
  const others = kits.filter((k) => !recKit || k.sku !== recKit.sku);
  return h('div', { class: 'B__more' },
    h('div', { class: 'B__more-head' },
      h('span', { class: 'B__more-lbl' }, 'More configurations'),
      h('button', { class: 'linkbtn', type: 'button', onClick: onBrowse },
        `Browse all ${kits.length} kits →`),
    ),
    h('div', { class: 'minikit-row' },
      others.map((k) => Minikit(k, onBrowse)),
    ),
  );
}

function RecommendationView(props) {
  const { kits, recKit, recResolved, kitError, sourceUrl, onInstallKit, onBrowse, onAdvanced } = props;

  const lede = h('header', { class: 'idlede fadein' },
    h('div', { class: 'eyebrow' }, icon('chip', { size: 13 }), 'Step 1 · Identify'),
    h('h1', null, 'Recommended for your setup'),
    h('p', null,
      'Most Sense360 hubs ship as the Bathroom PoE kit. Install it in one click — ',
      'or browse the full catalogue to match your exact hardware.'),
  );

  // No catalogue at all: there is nothing to recommend, so point the user
  // straight at the advanced builder (parity with the 1.0 empty-catalogue path).
  if (!recKit) {
    return h('div', { class: 'main' }, lede,
      h('div', { class: 'callout callout--warn' },
        icon('alert'),
        h('span', null,
          h('b', null, 'No kits are available right now. '),
          'Build your hub module by module instead.'),
      ),
      Hatch(onAdvanced),
    );
  }

  // The recommendation card renders the engine verdict for the recommended kit
  // when it has resolved; until then it falls back to the catalogue's declared
  // channel + firmware target. The view owns no gate — `installable` is the
  // engine's verdict, and a blocked recommendation is routed to source.
  const isPreview = recResolved ? recResolved.isPreview : (recKit.firmware_channel === 'preview');
  const installable = Boolean(recResolved && recResolved.installable);
  const blocked = Boolean(recResolved && !recResolved.installable && recResolved.reason === 'no-build');
  const target = (recResolved && recResolved.configString) || recKit.firmware_config_string || '';
  const channelLabel = recResolved && recResolved.channel
    ? capitalize(recResolved.channel)
    : channelWord(kitFilterChannel(recKit));

  const pill = recKit.recommended
    ? h('span', { class: 'flag flag--rec' }, 'Recommended')
    : h('span', { class: 'flag ' + (isPreview ? 'flag--preview' : 'flag--stable') },
        isPreview ? 'Preview' : 'Stable');

  const card = h('div', { class: 'B__rec' + (isPreview ? ' B__rec--preview' : '') },
    h('div', { class: 'B__render' },
      h('div', { class: 'devicebox devicebox--rec' },
        h('span', { class: 'devicebox__tag' }, 'ceiling hub render')),
    ),
    h('div', { class: 'B__body' },
      pill,
      h('h2', null, recKit.display_name || recKit.sku),
      recKit.description && h('p', { class: 'B__desc' }, recKit.description),
      KitParts(recKit.components || []),
    ),
    h('div', { class: 'B__cta' },
      h('button', {
        class: 'btn btn--lg btn--block',
        type: 'button',
        disabled: !installable,
        onClick: () => onInstallKit(recKit, recResolved),
      }, 'Install this kit ', icon('arrowR')),
      h('button', { class: 'btn btn--ghost btn--block', type: 'button', onClick: onBrowse },
        'See full details'),
      Reassurance(isPreview),
      h('span', { class: 'B__target' }, channelLabel, ' · ', h('b', null, target)),
    ),
  );

  return h('div', { class: 'main' }, lede,
    kitError && h('div', { class: 'callout callout--warn' },
      icon('alert'),
      h('span', null, h('b', null, 'Unknown kit. '), kitError),
    ),
    card,
    blocked && SourceCallout(sourceUrl, target),
    MoreStrip({ kits, recKit, onBrowse }),
    Hatch(onAdvanced),
  );
}

/* ---------- Browse view (View 2, the full catalogue table) ---------- */
function KitTableRow(kit, { selected, recommended, onSelect }) {
  const dotKey = kitChannelKey(kit);
  const chanKey = kitFilterChannel(kit);
  const skus = (kit.components || []).map((c) => c.sku).filter(Boolean);
  const shown = skus.slice(0, 4);
  const extra = skus.length - shown.length;

  return h('tr', {
    class: 'ktable__row' + (selected ? ' is-selected' : '') + (recommended ? ' is-recommended' : ''),
    tabindex: '0',
    role: 'button',
    'aria-pressed': String(!!selected),
    onClick: onSelect,
    onKeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
    },
  },
    h('td', { class: 'kt-kit' },
      h('span', { class: 'kt-dot kt-dot--' + dotKey }),
      h('span', { class: 'kt-name' },
        kit.display_name || kit.sku,
        recommended && h('span', { class: 'kt-rec' }, 'Rec'),
      ),
    ),
    h('td', null, h('span', { class: 'kt-chan kt-chan--' + chanKey }, channelWord(chanKey))),
    h('td', { class: 'kt-parts' }, String((kit.components || []).length)),
    h('td', { class: 'kt-boards' },
      shown.map((s) => h('span', { class: 'kt-board' }, s)),
      extra > 0 && h('span', { class: 'kt-board kt-board--more' }, `+${extra}`),
    ),
    h('td', null, h('code', { class: 'kt-target' }, kit.firmware_config_string || '')),
  );
}

function BrowseView(props) {
  const { kits, kit, resolved, sourceUrl, setKit, onContinue, onRecommendation, onAdvanced } = props;
  const total = kits.length;
  const selectedSku = kit ? kit.sku : null;

  // --- toolbar: stable nodes the targeted re-render never rebuilds ---
  const searchInput = h('input', {
    class: 'C__search-input',
    type: 'text',
    autocomplete: 'off',
    placeholder: 'Search by name, board or SKU…',
    'aria-label': 'Search kits by name, board or SKU',
    value: picker.q,
    onInput: (e) => { picker.q = e.target.value; syncToolbar(); syncTable(); },
  });
  const clearBtn = h('button', {
    class: 'C__search-clear', type: 'button', 'aria-label': 'Clear search',
    onClick: () => { picker.q = ''; searchInput.value = ''; syncToolbar(); syncTable(); searchInput.focus(); },
  }, '×');
  const searchEl = h('div', { class: 'C__search' },
    icon('chip', { cls: 'C__search-ico' }),
    searchInput,
    clearBtn,
  );

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'stable', label: 'Stable' },
    { id: 'preview', label: 'Preview' },
  ];
  const chipEls = new Map();
  const chipsEl = h('div', { class: 'C__chips', role: 'group', 'aria-label': 'Filter kits by channel' },
    FILTERS.map((f) => {
      const el = h('button', {
        class: 'kit-chip', type: 'button',
        onClick: () => { picker.chan = f.id; syncToolbar(); syncTable(); },
      }, f.label);
      chipEls.set(f.id, el);
      return el;
    }),
  );

  const countEl = h('span', { class: 'C__count' });
  const bar = h('div', { class: 'C__bar' },
    h('button', { class: 'linkbtn C__back', type: 'button', onClick: onRecommendation },
      '← Recommendation'),
    h('span', { class: 'C__title' }, 'All firmware kits'),
    countEl,
    h('div', { class: 'C__tools' }, searchEl, chipsEl),
  );

  const tbody = h('tbody', { class: 'ktable__body' });
  const table = h('table', { class: 'ktable' },
    h('thead', null,
      h('tr', null,
        h('th', { class: 'kt-h-kit' }, 'Kit'),
        h('th', null, 'Channel'),
        h('th', null, 'Parts'),
        h('th', null, 'Boards'),
        h('th', null, 'Firmware target'),
      ),
    ),
    tbody,
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

  // Targeted re-render of the table rows + count. The search input and chips are
  // stable nodes outside tbody, so typing only re-mounts the rows (caret kept).
  function syncTable() {
    const filtered = kits.filter((k) => kitMatches(k, picker.q, picker.chan));
    countEl.textContent = `${filtered.length} of ${total}`;

    if (filtered.length === 0) {
      mount(tbody,
        h('tr', { class: 'ktable__empty-row' },
          h('td', { colspan: '5' },
            h('div', { class: 'ktable__empty' },
              `No kits match “${picker.q}”.`,
              h('button', {
                class: 'linkbtn', type: 'button',
                onClick: () => { picker.q = ''; picker.chan = 'all'; searchInput.value = ''; syncToolbar(); syncTable(); },
              }, 'Clear filters'),
            ),
          ),
        ),
      );
    } else {
      mount(tbody, filtered.map((k) =>
        KitTableRow(k, {
          selected: selectedSku === k.sku,
          recommended: Boolean(k.recommended),
          // Selecting a row commits the kit through the engine (setKit), which
          // resolves its verdict and re-renders this view with the footer
          // reflecting the gate verdict.
          onSelect: () => setKit(k),
        })));
    }
  }

  // --- footer: hint + selected-kit indicator + Continue (the gate verdict) ---
  // Continue advances only when the committed kit resolves to an installable
  // build; a blocked kit disables it and is routed to source (callout below).
  const installable = Boolean(kit && resolved && resolved.installable);
  const blocked = Boolean(kit && resolved && !resolved.installable && resolved.reason === 'no-build');
  const continueBtn = h('button', {
    class: 'btn btn--lg', type: 'button', disabled: !installable, onClick: onContinue,
  }, 'Continue ', icon('arrowR'));
  const footEl = h('div', { class: 'winfoot identify-step__foot' },
    h('div', { class: 'stepnav' },
      h('span', { class: 'winfoot__hint' },
        'Click a row to select · ',
        h('button', { class: 'linkbtn', type: 'button', onClick: onAdvanced },
          'Build module by module →'),
      ),
      h('span', { class: 'stepnav__spacer' }),
      kit
        ? h('span', { class: 'winfoot__sel' }, h('span', { class: 'winfoot__seldot' }), h('b', null, shortKitName(kit)))
        : null,
      continueBtn,
    ),
  );

  syncToolbar();
  syncTable();

  return h('div', { class: 'identify-step__browse fadein' },
    h('div', { class: 'browse-body' },
      bar,
      table,
      blocked && SourceCallout(sourceUrl, resolved.configString),
    ),
    footEl,
  );
}

/* ---------- The kit chooser (the two views + the toggle between them) ---------- */
function KitChooser(props) {
  // A stable container the app mounts; the active view is mounted inside it. A
  // view toggle (See full details / Browse all / back to recommendation) is a
  // local re-render here, so it never re-resolves the engine or rebuilds the
  // app. Committing a kit (Install this kit / a Browse row) goes through the app
  // (setKit / onInstallKit), which re-renders this step and reads picker.view.
  const root = h('div', { class: 'identify-step' });

  function renderView() {
    if (picker.view === 'browse') {
      mount(root, BrowseView({ ...props, onRecommendation: showRec, onAdvanced }));
    } else {
      mount(root, RecommendationView({ ...props, onBrowse: showBrowse, onAdvanced }));
    }
  }
  function showBrowse() { picker.view = 'browse'; renderView(); }
  function showRec() { picker.view = 'rec'; renderView(); }
  function onAdvanced() { props.setMode('advanced'); }

  renderView();
  return root;
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
export function IdentifyStep(props) {
  const { mode } = props;

  // mode === 'kit' — the recommendation-first kit chooser (two views).
  if (mode === 'kit') {
    return KitChooser(props);
  }

  // mode === 'advanced' — the module-by-module builder (unchanged).
  const { setMode, sel, setSel, resolved, sourceUrl, onContinue } = props;
  const head = StepHead({
    eyebrow: 'Step 1 — Identify',
    eyebrowIcon: 'chip',
    title: 'Build your hub',
    desc: "Pick the exact boards in your hub. We'll resolve the matching firmware target as you go.",
  });

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
