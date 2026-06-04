/* WebFlash 2.0 — standalone preview entry.
   Boots the 2.0 view inside the isolated /webflash-2/index.html design preview.
   The production entry is shell.js (mounted under ?ui=2). This entry exists so
   the standalone preview keeps working after app.js stopped auto-mounting.

   It wires the same engine accessibility primitives as the production shell, but
   imports them from the leaf a11y module directly rather than through the engine
   facade, so the standalone preview does not pull the full state.js engine. */
import { mountWebFlash2 } from './app.js';
import { announce, trapFocus, restoreFocus, getFocusableElements } from '../../scripts/utils/a11y.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

mountWebFlash2(document.getElementById('root'), {
  a11y: { announce, trapFocus, restoreFocus, getFocusableElements },
  prefersReducedMotion,
});
