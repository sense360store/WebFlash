/**
 * @fileoverview Banner shown when the running app or loaded firmware
 * manifest is out of date with respect to what the server is serving.
 *
 * Distinct from the early-startup compatibility banner
 * (preflight-banner.js): this one is driven by the service-worker update
 * lifecycle and the manifest-freshness check, not by Web Serial /
 * browser-support detection.
 *
 * Active states (highest severity first — only one banner is rendered):
 *
 *   1. SW update available, NOT yet dismissed   level=block
 *      — install is gated off in state.js.
 *   2. Manifest freshness === 'stale'           level=block
 *      — install is gated off until reload.
 *   3. SW update available, dismissed           level=warn
 *      — install allowed with visible warning.
 *   4. Manifest freshness === 'unknown',
 *      acknowledgement NOT yet given            level=warn
 *      — install allowed only after explicit ack via the freshness ack.
 *   5. Manifest freshness === 'unknown',
 *      acknowledgement given                    level=warn (still visible)
 *
 * If none of the above is true, the banner is removed.
 *
 * @module layout/freshness-banner
 */

import {
    subscribeServiceWorkerState,
    triggerSkipWaitingAndReload,
    dismissPendingUpdate
} from '../services/sw-update.js';

const MOUNT_SELECTOR = '[data-freshness-banner-mount]';

let lastSwState = null;
let lastFreshnessState = null;
let lastFreshnessAck = false;
let mountEl = null;

function ensureMount() {
    if (mountEl && document.body && document.body.contains(mountEl)) {
        return mountEl;
    }
    mountEl = document.querySelector(MOUNT_SELECTOR);
    return mountEl;
}

function createIcon(level) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('preflight-banner__icon');

    if (level === 'block') {
        const tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tri.setAttribute('d', 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', '12');
        line1.setAttribute('y1', '9');
        line1.setAttribute('x2', '12');
        line1.setAttribute('y2', '13');
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', '12');
        line2.setAttribute('y1', '17');
        line2.setAttribute('x2', '12.01');
        line2.setAttribute('y2', '17');
        svg.appendChild(tri);
        svg.appendChild(line1);
        svg.appendChild(line2);
    } else {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', '12');
        line1.setAttribute('y1', '8');
        line1.setAttribute('x2', '12');
        line1.setAttribute('y2', '12');
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', '12');
        line2.setAttribute('y1', '16');
        line2.setAttribute('x2', '12.01');
        line2.setAttribute('y2', '16');
        svg.appendChild(circle);
        svg.appendChild(line1);
        svg.appendChild(line2);
    }
    return svg;
}

function pickActiveState(swState, freshness, freshnessAck) {
    if (swState && swState.updateAvailable && !swState.updateDismissed) {
        return {
            kind: 'sw-update-block',
            level: 'block',
            eyebrow: 'Update required',
            title: 'A WebFlash update is available',
            summary: 'Reload before flashing to use the latest installer and firmware metadata.',
            primary: { label: 'Reload now', action: triggerSkipWaitingAndReload },
            secondary: { label: 'Continue without reloading', action: dismissPendingUpdate }
        };
    }
    if (freshness === 'stale') {
        return {
            kind: 'manifest-stale',
            level: 'block',
            eyebrow: 'Newer firmware list available',
            title: 'A newer firmware manifest is available',
            summary: 'Reload before flashing so the wizard uses the latest published firmware list.',
            primary: { label: 'Reload now', action: () => window.location.reload() }
        };
    }
    if (swState && swState.updateAvailable && swState.updateDismissed) {
        return {
            kind: 'sw-update-warn',
            level: 'warn',
            eyebrow: 'Update available',
            title: 'A WebFlash update is available',
            summary: 'You chose to continue with the current installer. Reload before flashing to pick up the latest installer and firmware metadata.',
            primary: { label: 'Reload now', action: triggerSkipWaitingAndReload }
        };
    }
    if (freshness === 'unknown') {
        return {
            kind: 'manifest-unknown',
            level: 'warn',
            eyebrow: 'Freshness unknown',
            title: 'Could not confirm firmware manifest freshness',
            summary: 'WebFlash could not confirm that the firmware manifest is current. Check your connection or reload before flashing.',
            primary: freshnessAck
                ? { label: 'Reload now', action: () => window.location.reload() }
                : { label: 'Acknowledge and continue', action: () => {
                    document.dispatchEvent(new CustomEvent('webflash:acknowledge-manifest-freshness'));
                } }
        };
    }
    return null;
}

function render() {
    const mount = ensureMount();
    if (!mount) {
        return;
    }
    const active = pickActiveState(lastSwState, lastFreshnessState, lastFreshnessAck);
    if (!active) {
        mount.innerHTML = '';
        return;
    }

    mount.innerHTML = '';
    const banner = document.createElement('section');
    banner.className = 'preflight-banner';
    banner.dataset.level = active.level;
    banner.dataset.freshnessKind = active.kind;
    banner.setAttribute('role', active.level === 'block' ? 'alert' : 'status');
    banner.setAttribute('aria-live', active.level === 'block' ? 'assertive' : 'polite');

    const header = document.createElement('div');
    header.className = 'preflight-banner__header';
    header.appendChild(createIcon(active.level));

    const text = document.createElement('div');
    text.className = 'preflight-banner__text';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'preflight-banner__eyebrow';
    eyebrow.textContent = active.eyebrow;
    text.appendChild(eyebrow);

    const title = document.createElement('h2');
    title.className = 'preflight-banner__title';
    title.textContent = active.title;
    text.appendChild(title);

    const summary = document.createElement('p');
    summary.className = 'preflight-banner__summary';
    summary.textContent = active.summary;
    text.appendChild(summary);

    header.appendChild(text);
    banner.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'preflight-banner__actions';

    if (active.primary) {
        const primary = document.createElement('button');
        primary.type = 'button';
        primary.className = 'btn btn-primary preflight-banner__action';
        primary.dataset.freshnessAction = 'primary';
        primary.textContent = active.primary.label;
        primary.addEventListener('click', (event) => {
            event.preventDefault();
            try {
                active.primary.action();
            } catch (error) {
                console.warn('[freshness-banner] primary action failed:', error);
            }
        });
        actions.appendChild(primary);
    }

    if (active.secondary) {
        const secondary = document.createElement('button');
        secondary.type = 'button';
        secondary.className = 'preflight-banner__dismiss';
        secondary.dataset.freshnessAction = 'secondary';
        secondary.textContent = active.secondary.label;
        secondary.addEventListener('click', (event) => {
            event.preventDefault();
            try {
                active.secondary.action();
            } catch (error) {
                console.warn('[freshness-banner] secondary action failed:', error);
            }
        });
        actions.appendChild(secondary);
    }

    banner.appendChild(actions);
    mount.appendChild(banner);
}

export function notifyServiceWorkerState(snapshot) {
    lastSwState = snapshot;
    render();
}

export function notifyManifestFreshness(verdict, acknowledged) {
    lastFreshnessState = verdict;
    lastFreshnessAck = Boolean(acknowledged);
    render();
}

/**
 * Idempotent init. Subscribes to SW state and renders the banner once the
 * mount point is in the DOM. Manifest freshness updates are pushed in by
 * state.js via `notifyManifestFreshness`.
 */
export function initFreshnessBanner() {
    const wire = () => {
        ensureMount();
        subscribeServiceWorkerState((snapshot) => {
            lastSwState = snapshot;
            render();
        });
        render();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
}

export const __testHooks = Object.freeze({
    MOUNT_SELECTOR,
    pickActiveState
});
