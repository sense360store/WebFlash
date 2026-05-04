/**
 * @fileoverview "About / Support" panel — renders app build info, the
 * loaded firmware manifest's metadata, and the "Clear cached installer
 * data" button.
 *
 * Mount point: `[data-about-panel-mount]` (added in index.html).
 *
 * Manifest metadata is read from a state.js getter passed in at init time
 * (kept loose to avoid an import cycle).
 *
 * @module layout/about-panel
 */

import { BUILD_INFO } from '../build-info.js';
import { clearWebFlashCache } from '../services/cache-clear.js';

const MOUNT_SELECTOR = '[data-about-panel-mount]';

function fmt(value) {
    if (value === null || value === undefined || value === '') {
        return 'unknown';
    }
    return String(value);
}

function renderInto(mount, manifestMetadata) {
    if (!mount) {
        return;
    }
    mount.innerHTML = '';

    const panel = document.createElement('section');
    panel.className = 'about-panel';
    panel.setAttribute('aria-labelledby', 'about-panel-title');

    const title = document.createElement('h2');
    title.id = 'about-panel-title';
    title.className = 'about-panel__title';
    title.textContent = 'About this installer';
    panel.appendChild(title);

    const list = document.createElement('dl');
    list.className = 'about-panel__list';

    const rows = [
        ['WebFlash app', fmt(BUILD_INFO.appVersion), 'about-app-version'],
        ['Build', fmt(BUILD_INFO.buildCommit), 'about-build-commit'],
        ['Build timestamp', fmt(BUILD_INFO.buildTimestamp), 'about-build-timestamp'],
        ['Firmware manifest', manifestMetadata && manifestMetadata.generated_at
            ? `generated ${manifestMetadata.generated_at}`
            : 'generated unknown', 'about-manifest-generated'],
        ['Manifest version', manifestMetadata && manifestMetadata.manifest_version != null
            ? String(manifestMetadata.manifest_version)
            : 'unknown', 'about-manifest-version'],
        ['Manifest source commit', fmt(manifestMetadata && manifestMetadata.source_commit), 'about-manifest-commit'],
        ['Freshness', fmt(manifestMetadata && manifestMetadata.freshness), 'about-manifest-freshness']
    ];

    for (const [label, value, testHook] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dd.dataset.about = testHook;
        list.appendChild(dt);
        list.appendChild(dd);
    }
    panel.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'about-panel__actions';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-secondary';
    clearBtn.dataset.cacheClear = 'true';
    clearBtn.textContent = 'Clear cached installer data';
    clearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        clearWebFlashCache().catch((error) => {
            console.warn('[about-panel] cache clear failed:', error);
        });
    });
    actions.appendChild(clearBtn);

    const note = document.createElement('p');
    note.className = 'about-panel__note';
    note.textContent = 'Clearing cached installer data does not erase or modify your device. It only removes WebFlash files cached in this browser and reloads the page.';
    actions.appendChild(note);

    panel.appendChild(actions);
    mount.appendChild(panel);
}

/**
 * Initialise the panel. `getManifestMetadata` is called at render time and
 * on every refresh, so the panel always reflects the latest manifest state.
 *
 * @param {() => ({manifest_version?: number, generated_at?: string, source_commit?: string, freshness?: string} | null)} getManifestMetadata
 */
export function initAboutPanel(getManifestMetadata = () => null) {
    const wire = () => {
        const mount = document.querySelector(MOUNT_SELECTOR);
        if (!mount || mount.dataset.aboutPanelInitialized === 'true') {
            return;
        }
        mount.dataset.aboutPanelInitialized = 'true';
        const refresh = () => renderInto(mount, getManifestMetadata());
        refresh();
        document.addEventListener('webflash:manifest-metadata-updated', refresh);
        document.addEventListener('webflash:manifest-freshness-updated', refresh);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
}

export const __testHooks = Object.freeze({
    MOUNT_SELECTOR,
    renderInto
});
