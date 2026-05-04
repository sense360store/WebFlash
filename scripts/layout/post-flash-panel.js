/**
 * @fileoverview Post-flash result panel.
 *
 * Renders a structured result region under the Step 5 install controls
 * driven by the post-flash service. Surfaces selected firmware details,
 * validation outcomes, and handoff actions (Home Assistant, Wi-Fi via
 * Improv, Rescue / Recovery).
 *
 * The panel does not store, log, or display Wi-Fi credentials.
 *
 * @module layout/post-flash-panel
 */

import { postFlashService, POST_FLASH_STATES } from '../services/post-flash.js';

const HOME_ASSISTANT_URL = 'https://my.home-assistant.io/redirect/integrations/';

const STATE_COPY = Object.freeze({
    [POST_FLASH_STATES.NOT_STARTED]: {
        title: 'Ready to install',
        summary: 'Install hasn’t started yet. Use the Install button on the firmware card above.',
        tone: 'idle'
    },
    [POST_FLASH_STATES.IN_PROGRESS]: {
        title: 'Installing firmware…',
        summary: 'Keep the device connected and the cable still until the installer finishes.',
        tone: 'busy'
    },
    [POST_FLASH_STATES.COMPLETED]: {
        title: 'Flash completed',
        summary: 'Checking whether the device came back online…',
        tone: 'pending'
    },
    [POST_FLASH_STATES.COMPLETED_VALIDATION_PASSED]: {
        title: 'Firmware was flashed and verified',
        summary: 'WebFlash detected the device responding with the expected firmware. Continue with setup below.',
        tone: 'success'
    },
    [POST_FLASH_STATES.COMPLETED_VALIDATION_UNKNOWN]: {
        title: 'Flash completed — verification unknown',
        summary: 'The flash finished but WebFlash could not automatically verify the running firmware. Reconnect the device and continue setup. This is normal for many builds.',
        tone: 'unknown'
    },
    [POST_FLASH_STATES.COMPLETED_VALIDATION_FAILED]: {
        title: 'Flash completed but a check failed',
        summary: 'The device responded with an unexpected firmware identity or version. Review the details below before continuing.',
        tone: 'warn'
    },
    [POST_FLASH_STATES.FAILED]: {
        title: 'Firmware flashing did not complete',
        summary: 'The installer reported an error before the flash could finish. Try the steps below or open Rescue / Recovery Mode.',
        tone: 'error'
    },
    [POST_FLASH_STATES.CANCELLED]: {
        title: 'Flash cancelled',
        summary: 'The flash was cancelled before it completed. You can run it again, or use Rescue / Recovery Mode if the device is in an unknown state.',
        tone: 'cancelled'
    }
});

const SUCCESS_NEXT_STEPS = [
    'Disconnect and reconnect the device.',
    'Wait about 30 seconds for it to boot.',
    'Continue with Wi-Fi setup or Home Assistant adoption.',
    'If the device does not appear, copy the support bundle.'
];

const FAILURE_NEXT_STEPS = [
    'Confirm you are using a USB data cable.',
    'Close other serial monitor apps.',
    'Re-enter BOOT/RESET mode.',
    'Try another USB port.',
    'Copy the support bundle if the problem continues.'
];

const HOME_ASSISTANT_STEPS = [
    'Power-cycle the device.',
    'Wait for the device to boot.',
    'Open Home Assistant.',
    'Check Settings > Devices & services for a newly discovered ESPHome device.',
    'If it does not appear, confirm the device is on Wi-Fi and copy the support bundle.'
];

const VALIDATION_LABELS = Object.freeze({
    device_reconnect: 'Device reconnected over serial',
    device_firmware_identity: 'Device firmware identity',
    version_match: 'Version matches selection',
    improv_endpoint_available: 'Improv endpoint reachable',
    wifi_provisioning_capability: 'Wi-Fi provisioning'
});

const STATUS_LABELS = Object.freeze({
    passed: 'OK',
    failed: 'Issue',
    not_available: 'Not checked'
});

const FAILURE_STATES = new Set([POST_FLASH_STATES.FAILED, POST_FLASH_STATES.CANCELLED]);
const UNKNOWN_OR_FAIL_STATES = new Set([
    POST_FLASH_STATES.COMPLETED_VALIDATION_UNKNOWN,
    POST_FLASH_STATES.COMPLETED_VALIDATION_FAILED,
    POST_FLASH_STATES.FAILED,
    POST_FLASH_STATES.CANCELLED
]);
const SHOW_HANDOFF_STATES = new Set([
    POST_FLASH_STATES.COMPLETED,
    POST_FLASH_STATES.COMPLETED_VALIDATION_PASSED,
    POST_FLASH_STATES.COMPLETED_VALIDATION_UNKNOWN,
    POST_FLASH_STATES.COMPLETED_VALIDATION_FAILED
]);

function isRescueModalAvailable() {
    if (typeof document === 'undefined') {
        return false;
    }
    if (typeof window !== 'undefined' && window.__rescueModalReady === true) {
        return true;
    }
    // The rescue-entry module renders a header trigger and registers the
    // delegated [data-rescue-open] click handler. Either signal indicates
    // the modal is available.
    return Boolean(
        document.querySelector('[data-rescue-header-trigger]')
        || document.querySelector('[data-rescue-modal-ready]')
    );
}

function setHidden(el, hidden) {
    if (!el) {
        return;
    }
    el.hidden = Boolean(hidden);
    el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

function fillList(el, items) {
    if (!el) {
        return;
    }
    el.replaceChildren();
    items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        el.appendChild(li);
    });
}

function renderFirmwareMeta(panel, snapshot) {
    const dl = panel.querySelector('[data-post-flash-firmware-meta]');
    if (!dl) {
        return;
    }
    const fields = [
        ['Firmware', snapshot.selected_firmware_name || '—'],
        ['Version', snapshot.selected_firmware_version || '—'],
        ['Channel', snapshot.selected_channel || '—'],
        ['Configuration', snapshot.selected_config || '—']
    ];
    if (snapshot.selected_commit) {
        fields.push(['Source commit', snapshot.selected_commit.slice(0, 12)]);
    }
    dl.replaceChildren();
    fields.forEach(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.appendChild(dt);
        dl.appendChild(dd);
    });
}

function renderValidationList(panel, snapshot) {
    const ul = panel.querySelector('[data-post-flash-validation-list]');
    if (!ul) {
        return;
    }
    ul.replaceChildren();
    if (!snapshot.validation_attempted) {
        ul.hidden = true;
        return;
    }
    ul.hidden = false;
    snapshot.validation_checks.forEach(check => {
        const li = document.createElement('li');
        li.dataset.checkId = check.name;
        li.dataset.checkStatus = check.status;
        const label = document.createElement('span');
        label.className = 'post-flash-validation__label';
        label.textContent = VALIDATION_LABELS[check.name] || check.name;
        const status = document.createElement('span');
        status.className = `post-flash-validation__status post-flash-validation__status--${check.status}`;
        status.textContent = STATUS_LABELS[check.status] || check.status;
        li.appendChild(label);
        li.appendChild(status);
        if (check.detail) {
            const detail = document.createElement('span');
            detail.className = 'post-flash-validation__detail';
            detail.textContent = check.detail;
            li.appendChild(detail);
        }
        ul.appendChild(li);
    });
}

function renderNextSteps(panel, snapshot) {
    const ol = panel.querySelector('[data-post-flash-next-steps]');
    const heading = panel.querySelector('[data-post-flash-next-steps-heading]');
    if (!ol || !heading) {
        return;
    }
    if (snapshot.status === POST_FLASH_STATES.NOT_STARTED) {
        setHidden(ol, true);
        setHidden(heading, true);
        return;
    }
    if (FAILURE_STATES.has(snapshot.status)) {
        heading.textContent = 'Try this';
        fillList(ol, FAILURE_NEXT_STEPS);
    } else if (snapshot.status === POST_FLASH_STATES.IN_PROGRESS) {
        heading.textContent = 'While the flash runs';
        fillList(ol, ['Keep the cable still.', 'Don’t close the browser tab.', 'Wait for the result panel to update.']);
    } else if (
        snapshot.status === POST_FLASH_STATES.COMPLETED
        || snapshot.status === POST_FLASH_STATES.COMPLETED_VALIDATION_PASSED
        || snapshot.status === POST_FLASH_STATES.COMPLETED_VALIDATION_UNKNOWN
        || snapshot.status === POST_FLASH_STATES.COMPLETED_VALIDATION_FAILED
    ) {
        heading.textContent = 'Next steps';
        fillList(ol, SUCCESS_NEXT_STEPS);
    }
    setHidden(ol, false);
    setHidden(heading, false);
}

function renderHomeAssistantHandoff(panel, snapshot) {
    const section = panel.querySelector('[data-post-flash-handoff="home-assistant"]');
    if (!section) {
        return;
    }
    const stepsEl = section.querySelector('[data-post-flash-ha-steps]');
    const shouldShow = SHOW_HANDOFF_STATES.has(snapshot.status)
        && snapshot.selected_improv_supported === true;
    if (!shouldShow) {
        setHidden(section, true);
        return;
    }
    fillList(stepsEl, HOME_ASSISTANT_STEPS);
    setHidden(section, false);
    if (!section.dataset.handoffRecorded) {
        postFlashService.markHandoffShown('home_assistant');
        section.dataset.handoffRecorded = 'true';
    }
}

function renderWifiHandoff(panel, snapshot) {
    const section = panel.querySelector('[data-post-flash-handoff="wifi"]');
    if (!section) {
        return;
    }
    const status = section.querySelector('[data-post-flash-wifi-status]');
    const shouldShow = SHOW_HANDOFF_STATES.has(snapshot.status);
    if (!shouldShow) {
        setHidden(section, true);
        return;
    }

    let label;
    let handoffStatus;
    if (snapshot.selected_improv_supported !== true) {
        label = 'Wi-Fi setup is not available for this firmware.';
        handoffStatus = 'unavailable';
    } else if (snapshot.wifi_handoff_status === 'failed') {
        label = 'Wi-Fi setup failed — copy the support bundle below.';
        handoffStatus = 'failed';
    } else if (snapshot.wifi_handoff_status === 'already_done') {
        label = 'Wi-Fi setup already completed.';
        handoffStatus = 'already_done';
    } else {
        label = 'Continue to Wi-Fi setup using the installer’s Wi-Fi step (over the same USB connection).';
        handoffStatus = 'continue';
    }
    if (status) {
        status.textContent = label;
        status.dataset.wifiStatus = handoffStatus;
    }
    setHidden(section, false);
    if (section.dataset.lastWifiStatus !== handoffStatus) {
        postFlashService.markHandoffShown('wifi', handoffStatus);
        section.dataset.lastWifiStatus = handoffStatus;
    }
}

function renderRecoveryHandoff(panel, snapshot) {
    const section = panel.querySelector('[data-post-flash-handoff="recovery"]');
    if (!section) {
        return;
    }
    const shouldShow = FAILURE_STATES.has(snapshot.status);
    if (!shouldShow) {
        setHidden(section, true);
        return;
    }

    const button = section.querySelector('[data-post-flash-recovery-open]');
    const fallback = section.querySelector('[data-post-flash-recovery-fallback]');
    const modalAvailable = isRescueModalAvailable();
    if (button) {
        if (modalAvailable) {
            button.removeAttribute('disabled');
            button.dataset.modalAvailable = 'true';
            button.setAttribute('data-rescue-open', '');
        } else {
            button.setAttribute('disabled', 'true');
            button.dataset.modalAvailable = 'false';
            button.removeAttribute('data-rescue-open');
        }
    }
    if (fallback) {
        setHidden(fallback, modalAvailable);
        if (!modalAvailable) {
            fallback.open = true;
        }
    }
    setHidden(section, false);
    if (!section.dataset.handoffRecorded) {
        postFlashService.markHandoffShown('recovery');
        section.dataset.handoffRecorded = 'true';
    }
}

function renderSupportFooter(panel, snapshot) {
    const footer = panel.querySelector('.post-flash-support');
    if (!footer) {
        return;
    }
    if (snapshot.status === POST_FLASH_STATES.NOT_STARTED) {
        setHidden(footer, true);
        return;
    }
    setHidden(footer, false);
    const prominent = UNKNOWN_OR_FAIL_STATES.has(snapshot.status);
    footer.dataset.prominence = prominent ? 'prominent' : 'subtle';
}

function resetHandoffRecordedFlags(panel) {
    panel.querySelectorAll('[data-post-flash-handoff]').forEach(section => {
        delete section.dataset.handoffRecorded;
        delete section.dataset.lastWifiStatus;
    });
}

function render(snapshot) {
    if (typeof document === 'undefined') {
        return;
    }
    const panel = document.querySelector('[data-post-flash-panel]');
    if (!panel) {
        return;
    }
    const previousState = panel.dataset.state;
    panel.dataset.state = snapshot.status;

    // When the lifecycle moves from a terminal state back to in_progress
    // (a retry), reset cached "shown" markers so handoffs can be recorded
    // again for the new attempt.
    if (
        previousState
        && previousState !== snapshot.status
        && snapshot.status === POST_FLASH_STATES.IN_PROGRESS
    ) {
        resetHandoffRecordedFlags(panel);
    }

    const copy = STATE_COPY[snapshot.status] || STATE_COPY[POST_FLASH_STATES.NOT_STARTED];
    panel.dataset.tone = copy.tone;

    const titleEl = panel.querySelector('[data-post-flash-title]');
    const summaryEl = panel.querySelector('[data-post-flash-summary]');
    if (titleEl) {
        titleEl.textContent = copy.title;
    }
    if (summaryEl) {
        summaryEl.textContent = copy.summary;
    }

    renderFirmwareMeta(panel, snapshot);
    renderValidationList(panel, snapshot);
    renderNextSteps(panel, snapshot);
    renderHomeAssistantHandoff(panel, snapshot);
    renderWifiHandoff(panel, snapshot);
    renderRecoveryHandoff(panel, snapshot);
    renderSupportFooter(panel, snapshot);

    setHidden(panel, snapshot.status === POST_FLASH_STATES.NOT_STARTED);
}

function bindPanelActions() {
    if (typeof document === 'undefined') {
        return;
    }
    const panel = document.querySelector('[data-post-flash-panel]');
    if (!panel || panel.dataset.actionsBound === 'true') {
        return;
    }
    panel.dataset.actionsBound = 'true';

    panel.addEventListener('click', event => {
        const haTrigger = event.target.closest('[data-post-flash-ha-open]');
        if (haTrigger) {
            event.preventDefault();
            try {
                window.open(HOME_ASSISTANT_URL, '_blank', 'noopener,noreferrer');
            } catch { /* ignore */ }
            return;
        }
        const viewDiagnostics = event.target.closest('[data-post-flash-view-diagnostics]');
        if (viewDiagnostics) {
            event.preventDefault();
            const errorLogTrigger = document.querySelector('[data-error-log-open]');
            if (errorLogTrigger && typeof errorLogTrigger.click === 'function') {
                errorLogTrigger.click();
            }
        }
    });
}

export function initPostFlashPanel() {
    bindPanelActions();
    postFlashService.subscribe(render);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPostFlashPanel);
    } else {
        initPostFlashPanel();
    }
}

export const __testHooks = Object.freeze({
    render,
    bindPanelActions,
    STATE_COPY,
    SUCCESS_NEXT_STEPS,
    FAILURE_NEXT_STEPS,
    HOME_ASSISTANT_STEPS,
    isRescueModalAvailable
});
