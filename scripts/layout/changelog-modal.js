/**
 * @fileoverview Changelog modal component for displaying firmware version history.
 * @module layout/changelog-modal
 */

import { getChangelog, getChangelogForConfig, formatDate } from '../services/changelog.js';

/** @type {HTMLElement|null} */
let modalElement = null;

/** @type {boolean} */
let isOpen = false;

/**
 * Creates the changelog modal element.
 * @returns {HTMLElement}
 */
function createModal() {
    if (modalElement) {
        return modalElement;
    }

    modalElement = document.createElement('div');
    modalElement.className = 'changelog-modal';
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    modalElement.setAttribute('aria-labelledby', 'changelog-modal-title');
    modalElement.setAttribute('aria-hidden', 'true');
    modalElement.hidden = true;

    modalElement.innerHTML = `
        <div class="changelog-modal__backdrop" data-changelog-backdrop></div>
        <div class="changelog-modal__container">
            <div class="changelog-modal__header">
                <h2 id="changelog-modal-title" class="changelog-modal__title">
                    <svg class="changelog-modal__title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    Firmware Changelog
                </h2>
                <button type="button" class="changelog-modal__close" data-changelog-close aria-label="Close changelog">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="changelog-modal__filters">
                <label class="changelog-modal__filter">
                    <span class="changelog-modal__filter-label">Channel:</span>
                    <select class="changelog-modal__filter-select" data-changelog-channel>
                        <option value="all">All Channels</option>
                        <option value="stable" selected>Stable</option>
                        <option value="beta">Beta</option>
                        <option value="preview">Preview</option>
                    </select>
                </label>
            </div>
            <div class="changelog-modal__body">
                <div class="changelog-modal__loading" data-changelog-loading>
                    <div class="changelog-modal__spinner"></div>
                    <p>Loading changelog...</p>
                </div>
                <div class="changelog-modal__content" data-changelog-content hidden></div>
                <div class="changelog-modal__empty" data-changelog-empty hidden>
                    <p>No changelog entries found.</p>
                </div>
                <div class="changelog-modal__error" data-changelog-error hidden>
                    <p data-changelog-error-message>Failed to load changelog.</p>
                    <button type="button" class="btn btn-secondary" data-changelog-retry>Retry</button>
                </div>
            </div>
        </div>
    `;

    // Bind event handlers
    const backdrop = modalElement.querySelector('[data-changelog-backdrop]');
    const closeBtn = modalElement.querySelector('[data-changelog-close]');
    const channelSelect = modalElement.querySelector('[data-changelog-channel]');
    const retryBtn = modalElement.querySelector('[data-changelog-retry]');

    if (backdrop) {
        backdrop.addEventListener('click', closeModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    if (channelSelect) {
        channelSelect.addEventListener('change', () => loadChangelog());
    }
    if (retryBtn) {
        retryBtn.addEventListener('click', () => loadChangelog());
    }

    // Handle escape key
    modalElement.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    document.body.appendChild(modalElement);
    return modalElement;
}

/**
 * Opens the changelog modal.
 * @param {string} [configString] - Optional configuration to filter by
 */
export async function openChangelogModal(configString = null) {
    const modal = createModal();

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    isOpen = true;

    // Store config string for filtering
    modal.dataset.configString = configString || '';

    // Focus the close button
    setTimeout(() => {
        const closeBtn = modal.querySelector('[data-changelog-close]');
        if (closeBtn) {
            closeBtn.focus();
        }
    }, 100);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Load changelog data
    await loadChangelog();
}

/**
 * Closes the changelog modal.
 */
export function closeModal() {
    if (!modalElement || !isOpen) {
        return;
    }

    modalElement.hidden = true;
    modalElement.setAttribute('aria-hidden', 'true');
    isOpen = false;

    // Restore body scroll
    document.body.style.overflow = '';

    // Return focus to trigger element if available
    const triggerBtn = document.querySelector('[data-changelog-trigger]');
    if (triggerBtn) {
        triggerBtn.focus();
    }
}

/**
 * Loads and renders the changelog.
 */
async function loadChangelog() {
    if (!modalElement) return;

    const loading = modalElement.querySelector('[data-changelog-loading]');
    const content = modalElement.querySelector('[data-changelog-content]');
    const empty = modalElement.querySelector('[data-changelog-empty]');
    const error = modalElement.querySelector('[data-changelog-error]');
    const channelSelect = modalElement.querySelector('[data-changelog-channel]');

    // Show loading state
    if (loading) loading.hidden = false;
    if (content) content.hidden = true;
    if (empty) empty.hidden = true;
    if (error) error.hidden = true;

    try {
        const configString = modalElement.dataset.configString;
        const channel = channelSelect?.value || 'stable';

        let entries;
        if (configString) {
            entries = await getChangelogForConfig(configString);
        } else {
            entries = await getChangelog();
        }

        // Filter by channel if not "all"
        if (channel !== 'all') {
            entries = entries.filter(e => e.channel === channel);
        }

        if (loading) loading.hidden = true;

        if (entries.length === 0) {
            if (empty) empty.hidden = false;
            return;
        }

        if (content) {
            content.hidden = false;
            content.innerHTML = renderChangelogEntries(entries);
        }

    } catch (err) {
        console.error('[changelog-modal] Error loading changelog:', err);
        if (loading) loading.hidden = true;
        if (error) {
            error.hidden = false;
            const errorMsg = error.querySelector('[data-changelog-error-message]');
            if (errorMsg) {
                errorMsg.textContent = `Failed to load changelog: ${err.message}`;
            }
        }
    }
}

/**
 * Renders changelog entries as HTML.
 * @param {Array} entries - Changelog entries
 * @returns {string}
 */
function renderChangelogEntries(entries) {
    return entries.map(entry => `
        <article class="changelog-entry" data-channel="${entry.channel}">
            <header class="changelog-entry__header">
                <div class="changelog-entry__version-info">
                    <h3 class="changelog-entry__version">v${escapeHtml(entry.version)}</h3>
                    <span class="changelog-entry__channel changelog-entry__channel--${entry.channel}">
                        ${escapeHtml(entry.channel)}
                    </span>
                </div>
                <time class="changelog-entry__date" datetime="${entry.date || ''}">
                    ${formatDate(entry.date)}
                </time>
            </header>
            <div class="changelog-entry__body">
                ${renderChangesList(entry.changes, 'Changes')}
                ${renderChangesList(entry.features, 'New Features')}
                ${renderChangesList(entry.knownIssues, 'Known Issues', 'warning')}
            </div>
            ${entry.configs && entry.configs.length > 0 ? `
                <footer class="changelog-entry__footer">
                    <span class="changelog-entry__configs-label">Available for:</span>
                    <span class="changelog-entry__configs">${entry.configs.slice(0, 3).map(c => escapeHtml(c)).join(', ')}${entry.configs.length > 3 ? ` +${entry.configs.length - 3} more` : ''}</span>
                </footer>
            ` : ''}
        </article>
    `).join('');
}

/**
 * Renders a list of changes.
 * @param {string[]} items - List items
 * @param {string} title - Section title
 * @param {string} [type] - Optional type for styling (e.g., 'warning')
 * @returns {string}
 */
function renderChangesList(items, title, type = '') {
    if (!items || items.length === 0) {
        return '';
    }

    const typeClass = type ? `changelog-entry__section--${type}` : '';

    return `
        <section class="changelog-entry__section ${typeClass}">
            <h4 class="changelog-entry__section-title">${escapeHtml(title)}</h4>
            <ul class="changelog-entry__list">
                ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </section>
    `;
}

/**
 * Escapes HTML special characters.
 * @param {string} str - Input string
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Creates a button to open the changelog modal.
 * @returns {HTMLButtonElement}
 */
export function createChangelogButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-tertiary changelog-trigger';
    button.setAttribute('data-changelog-trigger', '');
    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        View Changelog
    `;

    button.addEventListener('click', () => {
        const configString = window.currentConfigString || '';
        openChangelogModal(configString);
    });

    return button;
}

/**
 * Initializes the changelog modal and adds trigger button to the UI.
 */
export function initChangelogModal() {
    // Create modal on first interaction (lazy load)
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-changelog-trigger]');
        if (trigger) {
            const configString = trigger.dataset.configString || window.currentConfigString || '';
            openChangelogModal(configString);
        }
    });
}

export const __testHooks = Object.freeze({
    createModal,
    renderChangelogEntries,
    loadChangelog
});
