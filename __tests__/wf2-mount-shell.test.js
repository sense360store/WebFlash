/**
 * PR 3 (WebFlash 2.0 migration) — Mount shell + real accessibility.
 *
 * Covers the accessibility wiring PR 3 adds to the 2.0 view that is mounted
 * inside the production shell under ?ui=2:
 *   - the inline stepper marks the active step with aria-current="step",
 *   - the view renders a single <main id="wf2-main-content"> landmark that the
 *     skip link targets,
 *   - step transitions announce through the engine live region,
 *   - prefers-reduced-motion suppresses smooth scrolling,
 *   - the modal primitive traps focus and restores it to the opener.
 *
 * The bootstrap branch (?ui=1 -> app.js, default -> shell.js after the PR 12 GA
 * cutover) is exercised in a browser, not jsdom (it runs a dynamic import keyed on
 * window.location at module load); the cutover flip itself is pinned by
 * wf2-ga-cutover.test.js. The static production shell that ?ui=1 keeps unchanged is
 * pinned by the existing a11y-static-html suite.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { WinBar } from '../scripts/ui.js';
import { openModal } from '../scripts/modal.js';
import {
  announce,
  trapFocus,
  restoreFocus,
  getFocusableElements,
} from '../scripts/utils/a11y.js';
import { mountWebFlash2, __testHooks } from '../scripts/app.js';

const STEPS = [
  { key: 'identify', label: 'Identify' },
  { key: 'install', label: 'Install' },
  { key: 'connect', label: 'Connect' },
];

describe('PR 3 — inline stepper aria-current', () => {
  it('marks only the active step with aria-current="step" inside a labelled progress nav', () => {
    const bar = WinBar({
      steps: STEPS, step: 1, maxReached: 2, onJump: () => {},
      logoUrl: 'logo.png', theme: 'light',
      onRescue: () => {}, onHelp: () => {}, onToggleTheme: () => {},
    });
    // The inline stepper is the labelled progress navigation landmark.
    const stepper = bar.querySelector('.istep');
    expect(stepper).not.toBeNull();
    expect(stepper.tagName.toLowerCase()).toBe('nav');
    expect(stepper.getAttribute('aria-label')).toBe('Progress');

    const nodes = bar.querySelectorAll('.istep__node');
    expect(nodes.length).toBe(3);
    expect(nodes[0].getAttribute('aria-current')).toBeNull();
    expect(nodes[1].getAttribute('aria-current')).toBe('step');
    expect(nodes[2].getAttribute('aria-current')).toBeNull();

    // Completed (index 0) and reached-but-future (index 2) nodes are
    // keyboard-operable jump-back buttons; the active node (index 1) is inert.
    expect(nodes[0].tagName.toLowerCase()).toBe('button');
    expect(nodes[1].tagName.toLowerCase()).toBe('div');
    expect(nodes[2].tagName.toLowerCase()).toBe('button');

    // The window bar keeps the Rescue affordance the rescue modal delegates on.
    expect(bar.querySelector('.winbar__brand')).not.toBeNull();
    expect(bar.querySelector('[data-rescue-open]')).not.toBeNull();

    // The theme toggle exposes its action and pressed state (light => not pressed).
    const themeBtn = bar.querySelector('.iconbtn--square');
    expect(themeBtn.getAttribute('aria-pressed')).toBe('false');
    expect(themeBtn.getAttribute('aria-label')).toMatch(/dark theme/i);
  });
});

describe('PR 3 — accessible modal focus trap and restoration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a labelled dialog, traps focus, and restores focus on close', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const innerBtn = document.createElement('button');
    innerBtn.textContent = 'Inside';

    const controller = openModal({
      title: 'WebFlash help',
      body: innerBtn,
      a11y: { trapFocus, restoreFocus, getFocusableElements, announce },
    });

    const dialog = document.querySelector('.wf2-modal');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId).textContent).toBe('WebFlash help');

    // Focus moved into the dialog (its first focusable, the close button).
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement.classList.contains('wf2-modal__close')).toBe(true);
    // The body content is reachable inside the trapped dialog.
    expect(getFocusableElements(dialog)).toContain(innerBtn);

    controller.close();
    expect(document.querySelector('.wf2-modal')).toBeNull();
    // Focus restored to the opener.
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape and on overlay click', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    openModal({
      title: 'WebFlash help',
      body: document.createElement('p'),
      a11y: { trapFocus, restoreFocus, getFocusableElements, announce },
    });
    expect(document.querySelector('.wf2-modal')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.wf2-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);

    // Re-open and dismiss via an overlay (backdrop) click.
    openModal({
      title: 'WebFlash help',
      body: document.createElement('p'),
      a11y: { trapFocus, restoreFocus, getFocusableElements, announce },
    });
    const overlay = document.querySelector('.wf2-modal__overlay');
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.wf2-modal')).toBeNull();
  });
});

describe('PR 3 — view mount and step announcements', () => {
  let scrollSpy;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('renders a single main landmark and announces the initial step', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const announceMock = jest.fn();

    mountWebFlash2(root, {
      a11y: { announce: announceMock, trapFocus, restoreFocus, getFocusableElements },
      prefersReducedMotion: () => false,
    });

    const mains = root.querySelectorAll('main#wf2-main-content');
    expect(mains.length).toBe(1);
    expect(mains[0].getAttribute('tabindex')).toBe('-1');
    // The shell renders the window bar with the inline stepper (no separate rail).
    expect(root.querySelector('.winbar')).not.toBeNull();
    expect(root.querySelector('.istep')).not.toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(announceMock).toHaveBeenCalledWith('Step 1 of 3: Identify');
  });

  it('announces step changes and honours prefers-reduced-motion', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const announceMock = jest.fn();

    mountWebFlash2(root, {
      a11y: { announce: announceMock, trapFocus, restoreFocus, getFocusableElements },
      prefersReducedMotion: () => true,
    });
    announceMock.mockClear();
    scrollSpy.mockClear();

    __testHooks.goTo(1);

    expect(announceMock).toHaveBeenCalledWith('Step 2 of 3: Install');
    // Reduced motion: programmatic scroll must not request smooth behaviour.
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    // The inline stepper re-renders with the new active step.
    const active = root.querySelector('.istep__node[aria-current="step"] .istep__lbl');
    expect(active.textContent).toBe('Install');
  });
});
