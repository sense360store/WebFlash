/* WebFlash 2.0 — Step 1: Identify your hardware.

   Recommendation-first redesign (recreated from the design handoff over the real
   engine). Step 1 leads with the single recommended kit and a one-click "Install
   this kit" (RecommendView), and demotes the full catalogue to a dense, scannable
   table (BrowseView). This supersedes the #502 master-detail picker. The advanced
   module builder stays reachable for "different hardware".

   The engine binding from PR 4 is unchanged: kit cards come from the real
   catalogue (scripts/data/kits.json), and the firmware target + installability
   verdict come from the engine's compatible-firmware lookup (passed in as
   `resolved`). The view renders the verdict; it never decides installability
   itself, and a configuration with no signed stable or preview build is blocked
   from Continue and routed to the ESPHome source path. */
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { POWER, AIR, ROOMIQ, FAN, LED } from './data.js';

// ---------- channel helpers ----------
function kitIsPreview(kit) {
  return Boolean(kit && kit.firmware_channel === 'preview');
}
// The kit's resting channel key (drives the row / mini-kit dot + detail flag).
// Recommended kits ship stable, so they get the teal "recommended" key.
function kitFlag(kit) {
  if (kit && kit.recommended) return 'recommended';
  return kitIsPreview(kit) ? 'preview' : 'stable';
}
// The channel a kit is filtered under by the All / Stable / Preview chips.
function kitFilterChannel(kit) {
  return kitIsPreview(kit) ? 'preview' : 'stable';
}
const channelWord = (kit) => (kitIsPreview(kit) ? 'Preview' : 'Stable');

// A short channel tagline used for search. The catalogue has no `tagline`, so
// this mirrors the prototype's per-channel supporting line.
function kitTagline(kit) {
  return kitFilterChannel(kit) === 'preview'
    ? 'Preview firmware · acknowledge before install'
    : 'Stable firmware · ready to install';
}

// The recommended kit (the one the catalogue flags recommended), else the first
// kit, else null. Used as the recommendation-first default selection.
export function recommendedKit(kits) {
  if (!Array.isArray(kits) || kits.length === 0) return null;
  return kits.find((k) => k.recommended) || kits[0];
}

// A short kit name for the footer / Continue label (drop a trailing "— …").
function shortKitName(kit) {
  return (kit.display_name || kit.sku).split('—')[0].trim();
}

// ---------- shared parts chips ----------
function KitParts(parts) {
  return h('div', { class: 'parts' },
    (parts || []).map((p) =>
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

// Case-insensitive search over name + tagline + description + each part's label
// + SKU + the firmware target, gated by the active channel chip.
function kitMatches(kit, q, chan) {
  if (chan !== 'all' && kitFilterChannel(kit) !== chan) return false;
  const query = (q || '').trim().toLowerCase();
  if (!query) return true;
  const partsText = (kit.components || [])
    .map((p) => `${p.label || p.name || ''} ${p.sku || ''}`)
    .join(' ');
  const hay = `${kit.display_name || kit.sku} ${kitTagline(kit)} ${kit.description || ''} ${partsText} ${kit.firmware_config_string || ''}`.toLowerCase();
  return hay.includes(query);
}

/* ---------- Browse-table local UI state ----------
   The committed selection (kit / setKit) is lifted to the app; the browse
   table's own UI state — the search query and the channel filter — is local to
   this step. It lives in module scope so it survives the app-level re-render a
   commit triggers, and so search / filter changes can re-render only the table +
   count without rebuilding the search input (which would drop the caret).
   resetIdentifyPickerState() clears it when the whole flow resets. */
const browse = { q: '', chan: 'all' };

/**
 * Clears the browse table's local UI state (search query, channel filter).
 * Called by the app when the flow resets so Step 1 returns to a clean table.
 */
export function resetIdentifyPickerState() {
  browse.q = '';
  browse.chan = 'all';
}

// ---------- RecommendView (B): the recommendation / selection landing ----------
function RecommendView({ kit, isRec, kits, resolved, sourceUrl, onBrowse, onContinue, onUseRec, onAdvanced, kitError }) {
  const preview = kitIsPreview(kit);
  const installable = Boolean(resolved && resolved.installable);
  const blocked = Boolean(resolved && !resolved.installable && resolved.reason === 'no-build');

  // The framing flag: recommended (teal), your selection (teal), or preview
  // (amber) when a non-recommended preview kit was picked from the table.
  let flag;
  if (isRec) {
    flag = h('span', { class: 'flag flag--rec' }, icon('shield', { size: 13 }), ' Recommended');
  } else if (preview) {
    flag = h('span', { class: 'flag flag--preview' }, icon('alert', { size: 13 }), ' Preview channel');
  } else {
    flag = h('span', { class: 'flag flag--mine' }, icon('check', { size: 13 }), ' Your selection');
  }

  const reassure = preview
    ? h('span', { class: 'B__reassure B__reassure--warn' },
        icon('alert', { size: 15 }), ' Preview firmware · acknowledge before install')
    : h('span', { class: 'B__reassure' },
        icon('check', { size: 15 }), ' Stable firmware · right for most people');

  const others = kits.filter((k) => k.sku !== kit.sku).slice(0, 5);

  return h('div', { class: 'B viewfade' },
    h('div', { class: 'B__lede' },
      h('span', { class: 'mlbl' }, 'Step 1 · Identify'),
      h('h1', null, isRec ? 'Recommended for your setup' : 'Your selected kit'),
      h('p', null, isRec
        ? 'This is the supported Sense360 kit for most installs. Review it and install — or browse every kit.'
        : 'You picked this from the full catalogue. Install it, or keep browsing.'),
    ),

    kitError && h('div', { class: 'callout callout--warn' },
      icon('alert'),
      h('span', null, h('b', null, 'Unknown kit. '), kitError),
    ),

    h('div', { class: 'B__rec' },
      h('div', { class: 'B__device' }, h('span', { class: 'devicebox__tag' }, 'ceiling hub render')),
      h('div', { class: 'B__recbody' },
        flag,
        h('h2', null, kit.display_name || kit.sku),
        kit.description && h('p', null, kit.description),
        KitParts(kit.components || []),
      ),
      h('div', { class: 'B__cta' },
        h('button', { class: 'btn btn--lg', type: 'button', disabled: !installable, onClick: onContinue },
          'Install this kit ', icon('arrowR')),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: onBrowse }, 'See full details'),
        reassure,
      ),
    ),

    blocked && SourceCallout(sourceUrl, resolved.configString),

    h('div', { class: 'B__more' },
      h('div', { class: 'B__morehead' },
        h('span', { class: 'mlbl' }, isRec ? 'Not your hardware?' : 'Want the standard kit?'),
        isRec
          ? h('button', { class: 'linkbtn', type: 'button', onClick: onBrowse }, `Browse all ${kits.length} kits →`)
          : h('button', { class: 'linkbtn', type: 'button', onClick: onUseRec }, '← Use the recommended kit'),
      ),
      h('div', { class: 'B__strip' },
        others.map((k) => h('button', { class: 'minikit', type: 'button', onClick: onBrowse },
          h('span', { class: 'kitrow__dot kitrow__dot--' + kitFlag(k) }),
          h('span', { class: 'minikit__name' }, k.display_name || k.sku),
          h('span', { class: 'minikit__meta' }, `${(k.components || []).length} parts · ${channelWord(k)}`),
        )),
      ),
    ),

    h('div', { class: 'hatch' },
      h('span', null, 'Different hardware, or no kit?'),
      h('button', { class: 'linkbtn', type: 'button', onClick: onAdvanced }, 'Build it module by module →'),
    ),
  );
}

// ---------- BrowseView (C): the dense table browser ----------
function KitTableRow(kit, selected, onSelect) {
  const flag = kitFlag(kit);
  const boards = (kit.components || []).map((c) => c.sku).filter(Boolean);
  const name = kit.display_name || kit.sku;
  return h('tr', {
    class: selected ? 'is-sel' : '',
    // The whole row is the selection control, so make it keyboard operable:
    // focusable, Enter / Space select, with a descriptive label for assistive
    // tech (a plain clickable <tr> would otherwise be mouse only).
    tabindex: '0',
    'aria-label': (selected ? 'Selected. ' : '')
      + `${name}, ${channelWord(kit)} channel, ${(kit.components || []).length} parts. Select this kit.`,
    onClick: onSelect,
    onKeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
    },
  },
    h('td', null,
      h('span', { class: 'kt__name' },
        h('span', { class: 'kt__dot kt__dot--' + flag }),
        kit.display_name || kit.sku,
        kit.recommended && h('span', { class: 'kitrow__rec' }, 'Rec'),
      ),
    ),
    h('td', null, h('span', { class: 'kt__chan kt__chan--' + kitFilterChannel(kit) }, channelWord(kit))),
    h('td', { class: 'kt__parts' }, String((kit.components || []).length)),
    h('td', null,
      h('span', { class: 'kt__boards' },
        boards.slice(0, 4).map((sku) => h('span', { class: 'kt__board' }, sku)),
        boards.length > 4 && h('span', { class: 'kt__board' }, `+${boards.length - 4}`),
      ),
    ),
    h('td', { class: 'kt__target' }, kit.firmware_config_string || ''),
  );
}

function BrowseView({ kits, kit, onSelect, onBack }) {
  const selectedSku = kit ? kit.sku : null;
  const tbody = h('tbody');
  const countEl = h('span', { class: 'C__count' });

  const searchInput = h('input', {
    class: 'kit-search__input', type: 'text', autocomplete: 'off',
    placeholder: 'Filter by name, board or SKU…', 'aria-label': 'Filter kits by name, board or SKU',
    value: browse.q,
    onInput: (e) => { browse.q = e.target.value; syncToolbar(); syncTable(); },
  });
  const clearBtn = h('button', {
    class: 'kit-search__clear', type: 'button', 'aria-label': 'Clear search',
    onClick: () => { browse.q = ''; searchInput.value = ''; syncToolbar(); syncTable(); searchInput.focus(); },
  }, '×');
  const search = h('div', { class: 'kit-search', style: { maxWidth: '280px' } },
    icon('chip', { cls: 'kit-search__ico' }), searchInput, clearBtn);

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'stable', label: 'Stable' },
    { id: 'preview', label: 'Preview' },
  ];
  const chipEls = new Map();
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter kits by channel' },
    FILTERS.map((f) => {
      const el = h('button', { class: 'chip', type: 'button',
        onClick: () => { browse.chan = f.id; syncToolbar(); syncTable(); } }, f.label);
      chipEls.set(f.id, el);
      return el;
    }));

  function syncToolbar() {
    clearBtn.hidden = !browse.q;
    FILTERS.forEach((f) => {
      const el = chipEls.get(f.id);
      if (!el) return;
      const on = browse.chan === f.id;
      el.setAttribute('class', 'chip' + (on ? ' is-on' : ''));
      el.setAttribute('aria-pressed', String(on));
    });
  }

  function syncTable() {
    const filtered = kits.filter((k) => kitMatches(k, browse.q, browse.chan));
    countEl.textContent = `${filtered.length} of ${kits.length}`;
    if (filtered.length === 0) {
      mount(tbody, h('tr', null,
        h('td', { colspan: '5', class: 'ktable__empty' },
          `No kits match “${browse.q}”. `,
          h('button', { class: 'linkbtn', type: 'button',
            onClick: () => { browse.q = ''; browse.chan = 'all'; searchInput.value = ''; syncToolbar(); syncTable(); } },
            'Clear filters'),
        )));
      return;
    }
    mount(tbody, ...filtered.map((k) => KitTableRow(k, selectedSku === k.sku, () => onSelect(k))));
  }

  const table = h('table', { class: 'ktable' },
    h('thead', null, h('tr', null,
      h('th', null, 'Kit'), h('th', null, 'Channel'), h('th', null, 'Parts'),
      h('th', null, 'Boards'), h('th', null, 'Firmware target'))),
    tbody);

  syncToolbar();
  syncTable();

  return h('div', { class: 'C viewfade' },
    h('div', { class: 'C__bar' },
      h('button', { class: 'backlink', type: 'button', onClick: onBack }, icon('arrowL'), ' Recommendation'),
      h('span', { class: 'C__title' }, 'All firmware kits'),
      countEl,
      h('span', { class: 'winfoot__spacer' }),
      search,
      chips,
    ),
    h('div', { class: 'C__tablewrap' }, table),
  );
}

// The persistent footer action bar contents for the Browse table: selection
// summary + Continue, plus the advanced hatch. Returns the children (not a
// wrapping element) because the shell's footer slot is itself the .winfoot bar.
function BrowseFooter({ kit, resolved, onContinue, onAdvanced }) {
  const installable = Boolean(kit && resolved && resolved.installable);
  return [
    h('span', { class: 'winfoot__hint' },
      'Click a row to select · ',
      h('button', { class: 'linkbtn', type: 'button', onClick: onAdvanced }, 'Build module by module →'),
    ),
    h('span', { class: 'winfoot__spacer' }),
    kit && h('span', { class: 'winfoot__sel' },
      h('span', { class: 'winfoot__seldot' }), ' ', h('b', null, shortKitName(kit)), ' selected'),
    h('button', { class: 'btn', type: 'button', disabled: !installable, onClick: onContinue },
      'Continue ', icon('arrowR')),
  ];
}

/* ---------- Advanced module builder (unchanged) ---------- */
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

/* ---------- The step ----------
   Returns { body, foot }: the body renders into the window content area and the
   foot, when present, into the persistent footer action bar (.winfoot). The
   recommendation landing and the advanced builder keep their primary action
   in-content (no foot); the Browse table uses the footer. */
export function IdentifyStep({ mode, setMode, view, setView, kits, kitError, kit, setKit, sel, setSel, resolved, sourceUrl, onContinue }) {
  if (mode === 'kit') {
    // Empty catalogue: offer the advanced builder as the only path forward.
    if (kits.length === 0) {
      return {
        body: h('div', { class: 'main' },
          h('div', { class: 'callout callout--warn' },
            icon('alert'),
            h('span', null,
              h('b', null, 'No kits are available right now. '),
              'Build your hub module by module instead.'),
          ),
          h('div', { class: 'hatch' },
            h('span', null, 'No kit catalogue loaded.'),
            h('button', { class: 'linkbtn', type: 'button', onClick: () => setMode('advanced') },
              'Build it module by module →'),
          ),
        ),
        foot: null,
      };
    }

    const activeKit = kit || recommendedKit(kits);

    if (view === 'browse') {
      return {
        body: BrowseView({
          kits, kit: activeKit,
          onSelect: setKit,
          onBack: () => setView('recommend'),
        }),
        foot: BrowseFooter({
          kit: activeKit, resolved, onContinue,
          onAdvanced: () => setMode('advanced'),
        }),
      };
    }

    // Recommendation landing (default). The primary action is in-content, so no
    // footer is shown (matching the design).
    return {
      body: RecommendView({
        kit: activeKit,
        isRec: Boolean(activeKit && recommendedKit(kits) && activeKit.sku === recommendedKit(kits).sku),
        kits, resolved, sourceUrl, kitError,
        onBrowse: () => setView('browse'),
        onContinue,
        onUseRec: () => setKit(recommendedKit(kits)),
        onAdvanced: () => setMode('advanced'),
      }),
      foot: null,
    };
  }

  // mode === 'advanced' — the module builder keeps its in-content summary + Continue.
  const advHasInputs = Boolean(sel.power);
  const advInstallable = Boolean(advHasInputs && resolved && resolved.installable);
  const advBlocked = Boolean(advHasInputs && resolved && !resolved.installable && resolved.reason === 'no-build');
  const targetString = resolved && resolved.configString ? resolved.configString : '';

  return {
    body: h('div', { class: 'main' },
      h('div', { class: 'flowhead' },
        h('span', { class: 'mlbl' }, 'Step 1 · Identify'),
        h('h1', null, 'Build your hub'),
        h('p', null, "Pick the exact boards in your hub. We'll resolve the matching firmware target as you go."),
      ),
      h('div', { class: 'with-aside' },
        h('div', null,
          AdvancedBuilder(sel, setSel),
          advBlocked && SourceCallout(sourceUrl, targetString),
          h('div', { class: 'hatch' },
            h('span', null, 'Have the standard kit after all?'),
            h('button', { class: 'linkbtn', type: 'button', onClick: () => setMode('kit') },
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
          h('button', { class: 'btn btn--block', type: 'button', disabled: !advInstallable, onClick: onContinue },
            'Continue ', icon('arrowR')),
        ),
      ),
    ),
    foot: null,
  };
}
