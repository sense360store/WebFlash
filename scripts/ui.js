/* WebFlash 2.0 — shared UI primitives (progress rail, step header, device chip).
   Ported from the design's ui.jsx. */
import { h } from './h.js';
import { icon } from './icons.js';

/* ---------- App-shell window bar (brand + inline stepper + actions) ----------
   The design's flow-shell.jsx FlowBar: a slim header that hosts the brand
   lockup, a compact inline stepper that reflects the current step, and the
   Rescue / Help / theme actions. It replaces the previous separate full-width
   progress rail. Completed and previously reached steps render as real
   <button>s so the jump-back affordance is keyboard operable; the current step
   is a non-interactive node marked aria-current="step", and not-yet-reached
   steps are inert. The nav keeps aria-label="Progress" so it is announced as the
   progress landmark exactly as the old rail was. */
export function WinBar({ steps, step, maxReached, onJump, logoUrl, theme, onRescue, onHelp, onToggleTheme }) {
  const stepper = h('nav', { class: 'istep', 'aria-label': 'Progress' });
  steps.forEach((s, i) => {
    const done = i < step;
    const active = i === step;
    const clickable = i <= maxReached && i !== step;

    if (i > 0) {
      stepper.appendChild(h('span', { class: 'istep__sep' + (i <= step ? ' is-done' : '') }));
    }

    const dot = h('span', { class: 'istep__dot' }, done ? icon('check', { size: 13 }) : String(i + 1));
    const lbl = h('span', { class: 'istep__lbl' }, s.label);

    if (clickable) {
      stepper.appendChild(
        h('button', {
          class: 'istep__node' + (done ? ' is-done' : ''),
          type: 'button',
          'aria-label': `Go to step ${i + 1}: ${s.label}`,
          onClick: () => onJump(i),
        }, dot, lbl),
      );
    } else {
      stepper.appendChild(
        h('div', {
          class: 'istep__node' + (active ? ' is-active' : ''),
          // aria-current="step" marks the active step for assistive technology so
          // the stepper announces where the user is in the flow.
          'aria-current': active ? 'step' : null,
        }, dot, lbl),
      );
    }
  });

  return h('div', { class: 'winbar' },
    h('div', { class: 'winbar__brand' },
      h('img', { src: logoUrl, alt: 'Sense360' }),
      h('span', { class: 'winbar__name' }, 'WebFlash ', h('span', null, '· Firmware Installer')),
    ),
    stepper,
    h('div', { class: 'winbar__right' },
      h('button',
        { class: 'iconbtn', type: 'button', 'data-rescue-open': '', 'aria-haspopup': 'dialog', onClick: onRescue },
        icon('life'), ' Rescue'),
      h('button', { class: 'iconbtn', type: 'button', onClick: onHelp }, icon('help'), ' Help'),
      h('button',
        { class: 'iconbtn iconbtn--square', type: 'button',
          'aria-label': theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
          'aria-pressed': String(theme === 'dark'),
          title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
          onClick: onToggleTheme },
        icon(theme === 'dark' ? 'sun' : 'moon')),
    ),
  );
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
