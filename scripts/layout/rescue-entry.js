/**
 * @fileoverview Mounts the visible entry points (page-header link and the
 *   prereq-panel fallback) that open the rescue / recovery modal.
 * @module layout/rescue-entry
 */

import { initRescueModal, openRescueModal } from './rescue-modal.js';

function attachHeaderEntry() {
    const trigger = document.querySelector('[data-rescue-header-trigger]');
    if (!trigger) {
        return;
    }
    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openRescueModal({ trigger });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initRescueModal();
    attachHeaderEntry();
});
