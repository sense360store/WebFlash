/**
 * @fileoverview Error log viewer modal component for displaying application errors.
 * @module layout/error-log-modal
 */

import { getErrorLog, getLogCounts, clearErrorLog, subscribe, formatTimestamp, exportLog } from '../services/error-log.js';

/** @type {HTMLElement|null} */
let modalElement = null;

/** @type {boolean} */
let isOpen = false;

/** @type {string} */
let currentFilter = 'all';

/** @type {Function|null} */
let unsubscribe = null;

/**
 * Creates the error log modal element.
 * @returns {HTMLElement}
 */
function createModal() {
    if (modalElement) {
        return modalElement;
    }

    modalElement = document.createElement('div');
    modalElement.className = 'error-log-modal';
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    modalElement.setAttribute('aria-labelledby', 'error-log-modal-title');
    modalElement.setAttribute('aria-hidden', 'true');
    modalElement.hidden = true;

    modalElement.innerHTML = `
        <div class="error-log-modal__backdrop" data-error-log-backdrop></div>
        <div class="error-log-modal__container">
            <div class="error-log-modal__header">
                <h2 id="error-log-modal-title" class="error-log-modal__title">
                    <svg class="error-log-modal__title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Error Log
                    <span class="error-log-modal__badge" data-error-log-badge hidden>0</span>
                </h2>
                <button type="button" class="error-log-modal__close" data-error-log-close aria-label="Close error log">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="error-log-modal__filters">
                <div class="error-log-modal__filter-group">
                    <label class="error-log-modal__filter">
                        <span class="error-log-modal__filter-label">Filter:</span>
                        <select class="error-log-modal__filter-select" data-error-log-filter>
                            <option value="all">All</option>
                            <option value="error">Errors</option>
                            <option value="warning">Warnings</option>
                            <option value="info">Info</option>
                        </select>
                    </label>
                </div>
                <div class="error-log-modal__filter-actions">
                    <button type="button" class="btn btn-sm btn-secondary" data-error-log-export>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Export
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" data-error-log-clear>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Clear
                    </button>
                </div>
            </div>
            <div class="error-log-modal__body">
                <div class="error-log-modal__empty" data-error-log-empty>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <p>No errors recorded</p>
                    <p class="error-log-modal__empty-hint">Application errors will appear here when they occur.</p>
                </div>
                <div class="error-log-modal__content" data-error-log-content hidden>
                    <ul class="error-log-list" data-error-log-list></ul>
                </div>
            </div>
        </div>
    `;

    // Bind event handlers
    const backdrop = modalElement.querySelector('[data-error-log-backdrop]');
    const closeBtn = modalElement.querySelector('[data-error-log-close]');
    const filterSelect = modalElement.querySelector('[data-error-log-filter]');
    const exportBtn = modalElement.querySelector('[data-error-log-export]');
    const clearBtn = modalElement.querySelector('[data-error-log-clear]');

    if (backdrop) {
        backdrop.addEventListener('click', closeModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderLogEntries();
        });
    }
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExport);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', handleClear);
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
 * Opens the error log modal.
 */
export function openErrorLogModal() {
    const modal = createModal();

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    isOpen = true;

    // Subscribe to log updates
    unsubscribe = subscribe(() => {
        if (isOpen) {
            renderLogEntries();
            updateBadge();
        }
    });

    // Focus the close button
    setTimeout(() => {
        const closeBtn = modal.querySelector('[data-error-log-close]');
        if (closeBtn) {
            closeBtn.focus();
        }
    }, 100);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Render current entries
    renderLogEntries();
    updateBadge();
}

/**
 * Closes the error log modal.
 */
export function closeModal() {
    if (!modalElement || !isOpen) {
        return;
    }

    modalElement.hidden = true;
    modalElement.setAttribute('aria-hidden', 'true');
    isOpen = false;

    // Unsubscribe from updates
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    // Restore body scroll
    document.body.style.overflow = '';

    // Return focus to trigger element if available
    const triggerBtn = document.querySelector('[data-error-log-trigger]');
    if (triggerBtn) {
        triggerBtn.focus();
    }
}

/**
 * Renders the log entries in the modal.
 */
function renderLogEntries() {
    if (!modalElement) return;

    const content = modalElement.querySelector('[data-error-log-content]');
    const empty = modalElement.querySelector('[data-error-log-empty]');
    const list = modalElement.querySelector('[data-error-log-list]');

    let entries = getErrorLog();

    // Apply filter
    if (currentFilter !== 'all') {
        entries = entries.filter(entry => entry.type === currentFilter);
    }

    if (entries.length === 0) {
        if (content) content.hidden = true;
        if (empty) empty.hidden = false;
        return;
    }

    if (empty) empty.hidden = true;
    if (content) content.hidden = false;

    if (list) {
        list.innerHTML = entries.map(entry => renderLogEntry(entry)).join('');

        // Add click handlers for expandable entries
        list.querySelectorAll('[data-error-expand]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.error-log-item');
                if (item) {
                    item.classList.toggle('error-log-item--expanded');
                    const isExpanded = item.classList.contains('error-log-item--expanded');
                    btn.setAttribute('aria-expanded', isExpanded);
                }
            });
        });
    }
}

/**
 * Renders a single log entry.
 * @param {Object} entry - Log entry
 * @returns {string}
 */
function renderLogEntry(entry) {
    const hasDetails = entry.stack || entry.context;
    const typeIcon = getTypeIcon(entry.type);

    return `
        <li class="error-log-item error-log-item--${entry.type}">
            <div class="error-log-item__main">
                <span class="error-log-item__icon">${typeIcon}</span>
                <div class="error-log-item__content">
                    <div class="error-log-item__header">
                        <span class="error-log-item__source">${escapeHtml(entry.source)}</span>
                        <time class="error-log-item__time" datetime="${entry.timestamp.toISOString()}">
                            ${formatTimestamp(entry.timestamp)}
                        </time>
                    </div>
                    <p class="error-log-item__message">${escapeHtml(entry.message)}</p>
                </div>
                ${hasDetails ? `
                    <button type="button" class="error-log-item__expand" data-error-expand aria-expanded="false" aria-label="Show details">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
            ${hasDetails ? `
                <div class="error-log-item__details">
                    ${entry.stack ? `
                        <div class="error-log-item__stack">
                            <strong>Stack Trace:</strong>
                            <pre>${escapeHtml(entry.stack)}</pre>
                        </div>
                    ` : ''}
                    ${entry.context ? `
                        <div class="error-log-item__context">
                            <strong>Context:</strong>
                            <pre>${escapeHtml(JSON.stringify(entry.context, null, 2))}</pre>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </li>
    `;
}

/**
 * Gets the icon for a log entry type.
 * @param {string} type - Entry type
 * @returns {string}
 */
function getTypeIcon(type) {
    switch (type) {
        case 'error':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>`;
        case 'warning':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>`;
        case 'info':
        default:
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>`;
    }
}

/**
 * Updates the badge count.
 */
function updateBadge() {
    if (!modalElement) return;

    const badge = modalElement.querySelector('[data-error-log-badge]');
    if (badge) {
        const counts = getLogCounts();
        if (counts.error > 0) {
            badge.textContent = counts.error;
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    }
}

/**
 * Handles export button click.
 */
function handleExport() {
    const logData = exportLog();
    const blob = new Blob([logData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `webflash-error-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Handles clear button click.
 */
function handleClear() {
    if (confirm('Are you sure you want to clear all log entries?')) {
        clearErrorLog();
        renderLogEntries();
        updateBadge();
    }
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
 * Creates a button to open the error log modal.
 * @returns {HTMLButtonElement}
 */
export function createErrorLogButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-tertiary error-log-trigger';
    button.setAttribute('data-error-log-trigger', '');
    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        View Error Log
        <span class="error-log-trigger__badge" data-error-log-trigger-badge hidden>0</span>
    `;

    // Update badge on log changes
    subscribe(() => {
        const badge = button.querySelector('[data-error-log-trigger-badge]');
        if (badge) {
            const counts = getLogCounts();
            if (counts.error > 0) {
                badge.textContent = counts.error;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        }
    });

    button.addEventListener('click', openErrorLogModal);

    return button;
}

/**
 * Initializes the error log modal.
 */
export function initErrorLogModal() {
    // Create modal on first interaction (lazy load)
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-error-log-trigger]');
        if (trigger) {
            openErrorLogModal();
        }
    });
}

export const __testHooks = Object.freeze({
    createModal,
    renderLogEntry,
    renderLogEntries
});
