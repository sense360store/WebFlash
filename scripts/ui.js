/* WebFlash 2.0 — shared UI primitives (progress rail, step header, device chip).
   Ported from the design's ui.jsx. */
import { h } from './h.js';
import { icon } from './icons.js';

/* ---------- Progress rail ---------- */
export function Rail({ steps, current, maxReached, onJump }) {
  const nav = h('nav', { class: 'rail', 'aria-label': 'Progress' });
  steps.forEach((s, i) => {
    const done = i < current;
    const active = i === current;
    const clickable = i <= maxReached && i !== current;

    if (i > 0) {
      nav.appendChild(h('span', { class: 'rail__line', style: { '--fill': i <= current ? 1 : 0 } }));
    }

    const cls =
      'rail__step' +
      (active ? ' is-active' : '') +
      (done ? ' is-done' : '') +
      (clickable ? ' is-clickable' : '');

    nav.appendChild(
      h('div', {
        class: cls,
        // aria-current="step" marks the active step for assistive technology so
        // the progress rail announces where the user is in the flow.
        'aria-current': active ? 'step' : null,
        onClick: () => clickable && onJump(i),
      },
        h('span', { class: 'rail__dot' }, done ? icon('check', { size: 15 }) : String(i + 1)),
        h('span', { class: 'rail__label' }, s.label),
      ),
    );
  });
  return nav;
}

/* ---------- Step header ---------- */
export function StepHead({ eyebrow, eyebrowIcon, title, desc }) {
  return h('header', { class: 'stephead fadein' },
    eyebrow &&
      h('div', { class: 'eyebrow' },
        eyebrowIcon && icon(eyebrowIcon, { size: 13 }),
        eyebrow,
      ),
    h('h1', null, title),
    desc && h('p', null, desc),
  );
}

/* ---------- Device summary chip ---------- */
export function DeviceChip({ name, target, onEdit }) {
  return h('div', { class: 'devchip fadein' },
    h('div', { class: 'devchip__ico' }, icon('chip')),
    h('div', { class: 'devchip__main' },
      h('div', { class: 'devchip__name' }, name),
      h('div', { class: 'devchip__meta' }, target),
    ),
    onEdit &&
      h('button', { class: 'iconbtn devchip__edit', onClick: onEdit },
        icon('edit'), ' Change',
      ),
  );
}
