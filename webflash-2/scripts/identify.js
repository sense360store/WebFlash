/* WebFlash 2.0 — Step 1: Identify your hardware. Ported from identify.jsx. */
import { h } from './h.js';
import { icon } from './icons.js';
import { StepHead } from './ui.js';
import { POWER, SENSING, FAN, LED, KITS, buildTarget } from './data.js';

function KitParts(parts) {
  return h('div', { class: 'parts' },
    parts.map((p) =>
      h('span', { class: 'part' },
        h('span', { class: 'part__dot' }),
        p.name,
        h('span', { class: 'part__sku' }, p.sku),
      ),
    ),
  );
}

function KitHero(kit, selected, onSelect) {
  const isPreview = kit.flag === 'preview';
  return h('div', { class: 'kit-hero fadein' + (selected ? ' is-selected' : '') },
    h('div', { class: 'kit-hero__top' },
      h('div', { class: 'kit-hero__body' },
        h('span', { class: 'flag ' + (isPreview ? 'flag--preview' : 'flag--rec') },
          isPreview ? 'Preview channel' : 'Recommended for you'),
        h('h2', null, kit.name),
        h('p', { class: 'kit-hero__desc' }, kit.desc),
        KitParts(kit.parts),
      ),
      h('div', { class: 'devicebox' },
        h('span', { class: 'devicebox__tag' }, 'ceiling hub render'),
      ),
    ),
    h('div', { class: 'kit-hero__foot' },
      h('span', { class: 'kit-hero__target' },
        (isPreview ? 'Preview' : 'Stable') + ' · ', h('b', null, kit.target)),
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
    // collect ids that conflict with current selection
    const active = [sel.sensing, sel.fan].filter(Boolean);
    const all = [...SENSING, ...FAN];
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
    Section('Sensing', 'Choose one air-quality board',
      h('div', { class: 'optgrid' },
        SENSING.map((s) => {
          const conflict = conflictsWith(s.id) && sel.sensing !== s.id;
          return Opt({
            ...s, on: sel.sensing === s.id, disabled: conflict,
            note: conflict ? 'Conflicts with current selection' : (s.bathroom ? 'Bathroom mode' : null),
            onClick: () => setSel({ ...sel, sensing: s.id }),
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
            ...f, on: sel.fan === f.id, disabled: conflict,
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
export function IdentifyStep({ mode, setMode, kit, setKit, sel, setSel, onContinue }) {
  const advancedTarget = buildTarget(sel);
  const advValid = sel.power && sel.sensing;

  const head = StepHead({
    eyebrow: 'Step 1 — Identify',
    eyebrowIcon: 'chip',
    title: mode === 'kit' ? "Let's find your hardware" : 'Build your hub',
    desc: mode === 'kit'
      ? 'Most customers have the standard Bathroom PoE kit. Confirm it below — or build a setup module by module.'
      : "Pick the exact boards in your hub. We'll generate the matching firmware target as you go.",
  });

  if (mode === 'kit') {
    return h('div', { class: 'main' }, head,
      KITS.map((k) =>
        h('div', { style: { marginBottom: '18px' } },
          KitHero(k, kit?.id === k.id, setKit))),
      h('div', { class: 'hatch' },
        h('span', null, 'Different hardware, or no kit?'),
        h('button', { class: 'linkbtn', onClick: () => setMode('advanced') },
          'Build it module by module →'),
      ),
      h('div', { class: 'stepnav' },
        h('span', { class: 'stepnav__spacer' }),
        h('button', { class: 'btn btn--lg', disabled: !kit, onClick: onContinue },
          'Continue ' + (kit ? `with ${kit.name.split('—')[0].trim()} ` : ''),
          icon('arrowR')),
      ),
    );
  }

  // mode === 'advanced'
  return h('div', { class: 'main' }, head,
    h('div', { class: 'with-aside' },
      h('div', null,
        AdvancedBuilder(sel, setSel),
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
          sumRow('Sensing', label(SENSING, sel.sensing)),
          sumRow('Fan', label(FAN, sel.fan) || 'None'),
          sumRow('Status ring', sel.led ? 'Included' : '—'),
        ),
        h('div', { class: 'target-card' },
          h('h4', null, 'Firmware target'),
          advValid
            ? h('code', null, advancedTarget)
            : h('code', { class: 'muted' }, 'Select power + sensing to generate a target…'),
        ),
        h('button', { class: 'btn btn--block', disabled: !advValid, onClick: onContinue },
          'Continue ', icon('arrowR')),
      ),
    ),
  );
}
