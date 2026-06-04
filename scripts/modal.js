/* WebFlash 2.0 — accessible modal dialog.

   PR 3 of the WebFlash 2.0 migration. A single, reusable dialog primitive the
   2.0 view uses for any modal surface. It does not own its focus logic: the
   engine accessibility primitives (trapFocus, restoreFocus) are passed in by the
   caller so the view stays a consumer of the 1.0 engine, never a reimplementer
   of trust or accessibility behaviour (see docs/adr/0001-webflash-2-view-over-engine.md).

   Behaviour, matching the 1.0 modal semantics:
     - role="dialog", aria-modal="true", labelled by its own title.
     - On open, focus moves into the dialog (first focusable, else the dialog).
     - While open, Tab / Shift+Tab are trapped inside the dialog.
     - Escape, the close button, and an overlay click all dismiss.
     - On close, focus is restored to the element that opened the dialog. */
import { h } from './h.js';

let openCount = 0;

/**
 * Opens an accessible modal dialog and returns a controller with `close()`.
 *
 * @param {object} opts
 * @param {string} opts.title            Dialog title (also the accessible name).
 * @param {Node|Node[]} opts.body        Dialog body content.
 * @param {object} opts.a11y             Engine a11y primitives.
 * @param {(el: HTMLElement) => (() => void)} opts.a11y.trapFocus
 * @param {(el: Element|null) => void} opts.a11y.restoreFocus
 * @param {(message: string, options?: object) => void} [opts.a11y.announce]
 * @param {() => HTMLElement[]} [opts.a11y.getFocusableElements]
 * @param {() => void} [opts.onClose]    Called after the dialog is torn down.
 * @returns {{ close: () => void, dialog: HTMLElement, overlay: HTMLElement }}
 */
export function openModal({ title, body, a11y, onClose }) {
  const opener = document.activeElement;
  const titleId = `wf2-modal-title-${++openCount}`;

  const closeBtn = h(
    'button',
    { class: 'iconbtn iconbtn--square wf2-modal__close', type: 'button', 'aria-label': 'Close dialog' },
    '✕'
  );

  const dialog = h(
    'div',
    {
      class: 'wf2-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
    },
    h('div', { class: 'wf2-modal__head' }, h('h2', { id: titleId, class: 'wf2-modal__title' }, title), closeBtn),
    h('div', { class: 'wf2-modal__body' }, body)
  );

  const overlay = h('div', { class: 'wf2-modal__overlay' }, dialog);

  let detachTrap = () => {};
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    detachTrap();
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    a11y.restoreFocus(opener);
    if (typeof onClose === 'function') onClose();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  // Overlay (backdrop) click dismisses; clicks inside the dialog do not.
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);

  document.body.appendChild(overlay);

  // Trap focus and move focus into the dialog. trapFocus does not move focus on
  // attach, so the dialog focuses a sensible element itself.
  detachTrap = a11y.trapFocus(dialog);
  document.addEventListener('keydown', onKeydown, true);

  const focusables =
    typeof a11y.getFocusableElements === 'function' ? a11y.getFocusableElements(dialog) : [];
  if (focusables.length > 0) {
    focusables[0].focus();
  } else {
    dialog.focus();
  }

  if (typeof a11y.announce === 'function') {
    a11y.announce(`${title} dialog opened`);
  }

  return { close, dialog, overlay };
}
