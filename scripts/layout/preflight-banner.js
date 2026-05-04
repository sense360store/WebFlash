/**
 * @fileoverview Early compatibility banner shown above the wizard. Surfaces
 * mobile / insecure-context / missing-Web-Serial / unsupported-browser
 * problems before the user spends time configuring hardware, with an
 * action that opens the setup help modal.
 * @module layout/preflight-banner
 */

import { detectCapabilities, evaluateBrowserReadiness } from '../capabilities.js';
import { openPreflightHelpModal } from './preflight-help-modal.js';

const MOUNT_SELECTOR = '[data-preflight-banner-mount]';

const LEVEL_LABEL = {
    ok: 'Ready',
    warn: 'Heads up',
    block: 'Action required'
};

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

    if (level === 'ok') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M20 6 9 17l-5-5');
        svg.appendChild(path);
    } else {
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
    }

    return svg;
}

/**
 * Renders the banner into the supplied mount element. Safe to call multiple
 * times — any previous content is replaced.
 *
 * @param {HTMLElement} mount
 * @param {ReturnType<typeof evaluateBrowserReadiness>} [readiness]
 * @returns {HTMLElement|null}
 */
export function renderPreflightBanner(mount, readiness = evaluateBrowserReadiness(detectCapabilities())) {
    if (!mount) {
        return null;
    }
    mount.innerHTML = '';

    const banner = document.createElement('section');
    banner.className = 'preflight-banner';
    banner.dataset.level = readiness.level;
    banner.setAttribute('role', readiness.level === 'block' ? 'alert' : 'status');
    banner.setAttribute('aria-live', readiness.level === 'block' ? 'assertive' : 'polite');

    const header = document.createElement('div');
    header.className = 'preflight-banner__header';

    header.appendChild(createIcon(readiness.level));

    const text = document.createElement('div');
    text.className = 'preflight-banner__text';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'preflight-banner__eyebrow';
    eyebrow.textContent = LEVEL_LABEL[readiness.level] || LEVEL_LABEL.warn;
    text.appendChild(eyebrow);

    const title = document.createElement('h2');
    title.className = 'preflight-banner__title';
    title.textContent = readiness.level === 'ok'
        ? 'Your browser appears compatible with WebFlash'
        : (readiness.reasons[0]?.title || 'Setup needs attention');
    text.appendChild(title);

    const summary = document.createElement('p');
    summary.className = 'preflight-banner__summary';
    if (readiness.level === 'ok') {
        summary.textContent = `Detected ${readiness.capabilities.browserName || 'a Chromium browser'} on ${readiness.capabilities.osName}. Web Serial is available, so you can connect your hub when you reach the install step.`;
    } else {
        summary.textContent = readiness.reasons[0]?.message
            || 'We hit a problem checking your browser. Open setup help for the full list.';
    }
    text.appendChild(summary);

    if (readiness.reasons.length > 1) {
        const list = document.createElement('ul');
        list.className = 'preflight-banner__reasons';
        readiness.reasons.slice(1).forEach((reason) => {
            const li = document.createElement('li');
            li.textContent = `${reason.title}: ${reason.message}`;
            list.appendChild(li);
        });
        text.appendChild(list);
    }

    header.appendChild(text);
    banner.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'preflight-banner__actions';

    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = readiness.level === 'block'
        ? 'btn btn-primary preflight-banner__action'
        : 'btn btn-secondary preflight-banner__action';
    helpBtn.dataset.preflightHelpOpen = 'true';
    helpBtn.textContent = readiness.level === 'block'
        ? 'Open setup help'
        : 'Test browser & USB setup';
    helpBtn.addEventListener('click', (event) => {
        event.preventDefault();
        openPreflightHelpModal({ trigger: helpBtn });
    });
    actions.appendChild(helpBtn);

    if (readiness.level !== 'block') {
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'preflight-banner__dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss browser readiness banner');
        dismiss.textContent = 'Dismiss';
        dismiss.addEventListener('click', () => {
            banner.remove();
        });
        actions.appendChild(dismiss);
    }

    banner.appendChild(actions);
    mount.appendChild(banner);

    return banner;
}

/**
 * Mounts the banner once the DOM is ready. Idempotent — additional calls are
 * no-ops if the banner is already mounted.
 */
export function initPreflightBanner() {
    const ensure = () => {
        const mount = document.querySelector(MOUNT_SELECTOR);
        if (!mount || mount.dataset.preflightBannerInitialized === 'true') {
            return;
        }
        mount.dataset.preflightBannerInitialized = 'true';
        renderPreflightBanner(mount);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensure);
    } else {
        ensure();
    }
}

export const __testHooks = Object.freeze({
    MOUNT_SELECTOR,
    LEVEL_LABEL
});
