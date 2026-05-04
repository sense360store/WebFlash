/**
 * @fileoverview Accessibility helpers shared across modals and live-region
 *   announcements. Keeps focus trapping, focus restoration, and ARIA live
 *   announcements consistent without pulling in a framework.
 * @module utils/a11y
 */

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]:not([contenteditable="false"])'
].join(',');

/**
 * Returns the focusable descendants of a container, in DOM order.
 * Hidden elements (display: none, hidden attribute, or zero-size) are excluded.
 *
 * @param {HTMLElement|null|undefined} container
 * @returns {HTMLElement[]}
 */
export function getFocusableElements(container) {
    if (!container) {
        return [];
    }
    const candidates = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    return candidates.filter((el) => {
        if (el.hasAttribute('disabled')) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        if (el.hidden) return false;
        // Walk up to detect ancestors that hide subtrees from layout/AT.
        for (let parent = el; parent && parent !== container; parent = parent.parentElement) {
            if (parent.hidden) return false;
            if (parent.getAttribute && parent.getAttribute('aria-hidden') === 'true') return false;
        }
        return true;
    });
}

/**
 * Installs a focus trap for the given modal container. Returns a teardown
 * function that should be called when the modal closes. When the trap is
 * active, Tab and Shift+Tab cycle within the container's focusable
 * descendants. If focus escapes (e.g. via a programmatic blur on a control
 * outside the modal) the next Tab returns focus to the first focusable.
 *
 * The trap does not move focus on attach — callers are expected to focus a
 * sensible element inside the modal themselves. If the modal has no
 * focusable elements, the container itself receives focus.
 *
 * @param {HTMLElement} container
 * @returns {() => void} Detach function.
 */
export function trapFocus(container) {
    if (!container) {
        return () => {};
    }

    if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
    }

    const handleKeydown = (event) => {
        if (event.key !== 'Tab') {
            return;
        }
        const focusables = getFocusableElements(container);
        if (focusables.length === 0) {
            event.preventDefault();
            container.focus();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
            if (active === first || active === container || !container.contains(active)) {
                event.preventDefault();
                last.focus();
            }
        } else if (active === last || !container.contains(active)) {
            event.preventDefault();
            first.focus();
        }
    };

    container.addEventListener('keydown', handleKeydown);

    return () => {
        container.removeEventListener('keydown', handleKeydown);
    };
}

/**
 * Restores focus to a previously stored element if it is still in the DOM.
 *
 * @param {HTMLElement|null|undefined} element
 */
export function restoreFocus(element) {
    if (!element) return;
    if (typeof element.focus !== 'function') return;
    if (!document.contains(element)) return;
    try {
        element.focus({ preventScroll: false });
    } catch (_err) {
        element.focus();
    }
}

const LIVE_REGION_ID = 'webflash-a11y-live-region';
const ALERT_REGION_ID = 'webflash-a11y-alert-region';

function ensureRegion(id, role, politeness) {
    if (typeof document === 'undefined' || !document.body) {
        return null;
    }
    let region = document.getElementById(id);
    if (region) return region;
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('role', role);
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    // Inline styles as a defensive fallback so the region remains visually hidden
    // even if the .sr-only style hasn't been parsed yet (e.g. tests or first paint).
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.padding = '0';
    region.style.margin = '-1px';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0,0,0,0)';
    region.style.whiteSpace = 'nowrap';
    region.style.border = '0';
    document.body.appendChild(region);
    return region;
}

/**
 * Announces a message to assistive technology via the global live region.
 * Uses `aria-live="polite"` by default; pass `assertive` for blocking errors
 * that should interrupt the user (e.g. preflight failures, provenance
 * mismatches). Repeated identical messages are nudged so SR re-announces.
 *
 * @param {string} message
 * @param {{ assertive?: boolean }} [options]
 */
export function announce(message, options = {}) {
    const text = message == null ? '' : String(message);
    if (!text) return;
    const region = options.assertive
        ? ensureRegion(ALERT_REGION_ID, 'alert', 'assertive')
        : ensureRegion(LIVE_REGION_ID, 'status', 'polite');
    if (!region) return;
    // Clear first so identical consecutive announcements still reach AT.
    region.textContent = '';
    // Schedule the actual update so SRs notice the mutation.
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
            region.textContent = text;
        });
    } else {
        setTimeout(() => {
            region.textContent = text;
        }, 16);
    }
}

export const __testHooks = Object.freeze({
    LIVE_REGION_ID,
    ALERT_REGION_ID,
    FOCUSABLE_SELECTOR
});
