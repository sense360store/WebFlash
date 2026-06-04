/* WebFlash 2.0 — production-shell boot.

   PR 3 of the WebFlash 2.0 migration. Mounts the 2.0 view inside the production
   index.html when the page is loaded with ?ui=2. Reachable only through
   scripts/bootstrap.js, which imports this module instead of app.js when it sees
   ?ui=2; the default ?ui=1 path never imports this file.

   Mounting at the same origin is the whole point: the 2.0 view inherits the
   production Content-Security-Policy (the meta tag in index.html), the service
   worker (./sw.js), the manifest, and the response headers. There is no second
   site and no second CSP.

   This module does no trust or rendering work of its own. It registers the
   service worker through the engine, prepares the shared shell DOM, and hands off
   to the 2.0 view with the engine accessibility primitives. */
import { mountWebFlash2 } from './app.js';
import engine from './engine.js';
import { initServiceWorkerUpdates } from '../../scripts/services/sw-update.js';
import { openRescueModal } from '../../scripts/layout/rescue-modal.js';
import {
  announce,
  trapFocus,
  restoreFocus,
  getFocusableElements,
} from '../../scripts/utils/a11y.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Injects a stylesheet <link> once, keyed by href, into <head>.
 * @param {string} href
 */
function ensureStylesheet(href) {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Prepares the shared production shell for the 2.0 view:
 *   - hides the 1.0 markup (the .container) without removing it,
 *   - injects the 2.0 stylesheet and the extra font weights it needs (allowed by
 *     the existing CSP font-src; the page already preconnects to Google Fonts),
 *   - repoints the existing skip link at the 2.0 main landmark,
 *   - returns a clean root node for the view to mount into.
 * @returns {HTMLElement} the 2.0 root mount node.
 */
function prepareShell() {
  document.documentElement.setAttribute('data-ui', '2');

  // The 1.0 static markup stays in the DOM (inert: app.js is never imported under
  // ?ui=2) but is hidden so only the 2.0 view is visible.
  const legacy = document.querySelector('.container');
  if (legacy) legacy.hidden = true;

  // 2.0 stylesheet, resolved relative to this module so it works at the repo root
  // and under the GitHub Pages /WebFlash/ subpath.
  ensureStylesheet(new URL('../app.css', import.meta.url).href);
  // Extra font weights the 2.0 design uses (Inter 650, JetBrains Mono). The
  // production CSP already allows fonts.googleapis.com and fonts.gstatic.com.
  ensureStylesheet(
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&family=JetBrains+Mono:wght@400;500;600&display=swap'
  );

  // The 2.0 view renders its own <main id="wf2-main-content">. Point the shared
  // skip link at it instead of the now-hidden 1.0 #main-content.
  const skipLink = document.querySelector('a.skip-link');
  if (skipLink) skipLink.setAttribute('href', '#wf2-main-content');

  let root = document.getElementById('wf2-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'wf2-root';
    document.body.appendChild(root);
  }
  return root;
}

// Register the production service worker so freshness, SW-update gating, and
// offline behaviour are inherited exactly as in the 1.0 view. Safe no-op where
// Service Workers are unsupported.
initServiceWorkerUpdates('./sw.js');

mountWebFlash2(prepareShell(), {
  a11y: { announce, trapFocus, restoreFocus, getFocusableElements },
  engine,
  // The real recovery path. The production shell shares the 1.0 stylesheet (the
  // .rescue-modal styles in css/wizard-style.css) and ESP Web Tools, so the
  // unchanged 1.0 rescue modal renders and flashes the precached rescue binary
  // here exactly as it does in the 1.0 view. The rescue binary, the rescue
  // manifest, and rescue-modal.js are all precached by sw.js (STATIC_ASSETS /
  // SCRIPT_MODULES), so first-visit offline rescue works under ?ui=2 too.
  recovery: { openRescueModal },
  prefersReducedMotion,
});
