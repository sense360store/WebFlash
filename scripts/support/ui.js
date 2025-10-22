import { createSupportBundle, createGzip } from './bundle.js';
import { getState, getStep } from '../state.js';
import { redact } from './redact.js';

const STYLE_ID = 'support-bundle-style';
const MAX_SERIAL_LINES = 2000;

const serialLogBuffer = [];
const downloadUrls = new Set();
const statusFlashTimers = new WeakMap();
let currentBundle = null;
let includeGzipByDefault = false;
let lastActiveElement = null;
const lifecycleEvents = [];

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.support-footer-button{position:fixed;right:16px;bottom:16px;z-index:950;padding:9px 14px;border:0;border-radius:18px;background:#2563eb;color:#fff;font:600 14px/1.2 inherit}
.support-footer-button:focus-visible,.support-footer-button:hover{outline:2px solid #1d4ed8;outline-offset:2px}
.support-modal-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(17,24,39,.55);z-index:1050}
.support-modal-backdrop.is-open{display:flex}
.support-modal{background:#fff;color:#111827;max-width:480px;width:100%;border-radius:12px;display:flex;flex-direction:column;max-height:90vh}
.support-modal header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px}
.support-modal h2{margin:0;font-size:18px}
.support-modal__close{background:none;border:0;font-size:22px;line-height:1;color:#6b7280;padding:4px}
.support-modal__body{padding:18px;overflow-y:auto}
.support-modal__intro{margin:0 0 10px;font-size:14px;color:#4b5563}
.support-modal__options{display:grid;gap:10px;margin-bottom:14px}
.support-checkbox{display:flex;align-items:flex-start;gap:8px;font-size:14px;color:#1f2937}
.support-checkbox input{margin-top:3px}
.support-modal__summary{margin-bottom:14px;padding:11px;font-size:13px;min-height:44px;color:#1f2937;background:#f3f4f6;border-radius:8px}
.support-modal__preview{margin-bottom:14px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:13px;color:#1f2937}
.support-preview__header{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.support-preview__title{flex:1 1 auto;font-weight:600}
.support-preview__actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.support-preview__actions button{flex:0 0 auto;padding:7px 11px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#1f2937;font:600 12px/1.1 inherit}
.support-preview__actions button[disabled]{opacity:.55}
.support-preview__toggle{border:0;background:none;color:#2563eb;font:600 13px/1.2 inherit;padding:6px 0}
.support-preview__toggle:focus-visible,.support-preview__toggle:hover{outline:2px solid #2563eb;outline-offset:2px}
.support-preview__refresh{border:1px solid #d1d5db;background:#fff;color:#1f2937;font:600 12px/1.1 inherit;padding:7px 11px;border-radius:6px}
.support-preview__refresh:focus-visible,.support-preview__refresh:hover{outline:2px solid #2563eb;outline-offset:2px}
.support-preview__body[hidden]{display:none}
.support-preview__content{margin:0;background:#0f172a;color:#f8fafc;padding:10px;border-radius:8px;font-family:SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap}
.support-modal__preview.is-open .support-preview__toggle{color:#1f2937}
.support-modal__actions{display:flex;flex-wrap:wrap;gap:8px}
.support-modal__actions button{flex:1 1 auto;min-width:112px;padding:9px;border-radius:8px;border:1px solid transparent;font:600 14px/1.1 inherit;background:#2563eb;color:#fff}
.support-modal__actions button.secondary{background:#fff;color:#1f2937;border-color:#d1d5db}
.support-modal__actions button[disabled]{opacity:.55;background:#d1d5db;color:#4b5563}
.support-modal__status{margin-top:10px;font-size:13px;color:#1f2937;min-height:18px}
.support-modal__status[data-status=error]{color:#b91c1c}
@media(max-width:600px){.support-footer-button{right:12px;left:12px;bottom:12px}.support-modal{max-width:100%}}
    `;
    document.head.appendChild(style);
}

function createSupportButton(openModal) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'support-footer-button';
    button.textContent = 'Support';
    button.addEventListener('click', openModal);
    document.body.appendChild(button);
    return button;
}

function limitSerialBuffer() {
    while (serialLogBuffer.length > MAX_SERIAL_LINES) {
        serialLogBuffer.shift();
    }
}

function pushSerialLog(line) {
    if (typeof line !== 'string') {
        return;
    }
    serialLogBuffer.push(line);
    limitSerialBuffer();
}

function recordLifecycleEvent(type, payload = {}) {
    if (!type) {
        return null;
    }

    const entry = {
        type: String(type),
        timestamp: new Date().toISOString()
    };

    if (payload && typeof payload === 'object') {
        const clean = {};
        Object.entries(payload).forEach(([key, value]) => {
            if (value === undefined || typeof value === 'function') {
                return;
            }

            if (value && typeof value === 'object') {
                try {
                    clean[key] = JSON.parse(JSON.stringify(value));
                } catch (error) {
                    clean[key] = String(value);
                }
            } else {
                clean[key] = value;
            }
        });

        if (Object.keys(clean).length > 0) {
            entry.detail = clean;
        }
    }

    lifecycleEvents.push(entry);
    if (lifecycleEvents.length > 100) {
        lifecycleEvents.splice(0, lifecycleEvents.length - 100);
    }

    return entry;
}

function flushDownloadUrls() {
    downloadUrls.forEach((url) => URL.revokeObjectURL(url));
    downloadUrls.clear();
}

function resolveAppInfo() {
    const metaScript = document.querySelector('script[data-app-info]');
    if (metaScript) {
        try {
            const parsed = JSON.parse(metaScript.textContent || '{}');
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (error) {
            console.warn('Unable to parse app info script', error);
        }
    }

    const meta = document.querySelector('meta[name="webflash-version"]');
    const commitMeta = document.querySelector('meta[name="webflash-commit"]');

    return {
        version: meta?.content || 'unknown',
        commit: commitMeta?.content || ''
    };
}

function gatherFirmwareContext() {
    const firmware = window.currentFirmware || null;
    const configString = window.currentConfigString || firmware?.config_string || null;

    if (!firmware && !configString) {
        return {};
    }

    const context = {};
    if (firmware) {
        context.deviceId = firmware.device_type || firmware.model || firmware.device || null;
        context.channel = firmware.channel || null;
        context.firmwareVersion = firmware.version || null;
        context.firmwareDescription = firmware.description || null;
        context.config_string = firmware.config_string || configString || null;
    }
    if (configString) {
        context.config_string = configString;
    }

    return context;
}

function gatherStateSnapshot() {
    const state = getState ? getState() : {};
    const step = getStep ? getStep() : undefined;
    const bundleApi = window.supportBundle;

    const snapshot = {
        ...state,
        wizardStep: step,
        createdAt: new Date().toISOString(),
        ...gatherFirmwareContext()
    };

    const guidanceState = typeof window !== 'undefined' ? window.webflashPostInstallGuidance : null;
    if (guidanceState && typeof guidanceState === 'object') {
        snapshot.postInstallGuidance = { ...guidanceState };
    } else {
        snapshot.postInstallGuidance = { seen: false };
    const rescueHistory = Array.isArray(window.webflashRescueInstallHistory)
        ? window.webflashRescueInstallHistory
        : [];

    if (rescueHistory.length > 0) {
        snapshot.rescueInstallHistory = rescueHistory.map(entry => ({ ...entry }));
        snapshot.rescueInstallCount = rescueHistory.length;
        snapshot.lastRescueInstall = rescueHistory[rescueHistory.length - 1];
    }

    const events = typeof bundleApi?.getEvents === 'function' ? bundleApi.getEvents() : [];
    if (Array.isArray(events) && events.length > 0) {
        snapshot.supportEvents = events.map(event => ({ ...event }));
    }

    Object.keys(snapshot).forEach((key) => {
        if (snapshot[key] === undefined || snapshot[key] === null || snapshot[key] === '') {
            delete snapshot[key];
        }
    });

    return snapshot;
}

function gatherCapabilities() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    return {
        webSerial: Boolean(nav && 'serial' in nav),
        webUSB: Boolean(nav && 'usb' in nav),
        ua: nav?.userAgent ?? '',
        platform: nav?.platform ?? '',
        locale: nav?.language ?? ''
    };
}

function formatSize(bytes) {
    if (!Number.isFinite(bytes)) {
        return '';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncateBody(body, max = 1190) {
    if (body.length <= max) {
        return body;
    }
    return `${body.slice(0, max - 3)}...`;
}

function buildMailto(bundle, options = {}) {
    const md5Short = bundle.md5.slice(0, 8);
    const deviceChannel = `${bundle.deviceId}/${bundle.channel}`;
    const subject = `[WebFlash] Crash ${md5Short} – ${deviceChannel}`;

    const lines = [
        bundle.summary,
        '',
        'Please attach the downloaded support bundle JSON (and gzip if created) before sending.',
        '',
        `File: ${bundle.fileName} (${formatSize(bundle.sizeBytes)})`
    ];

    if (options.includeGzip && bundle.gzFileName) {
        lines.push(`Gzip: ${bundle.gzFileName}`);
    }

    lines.push('', 'Add any extra details below:');

    const body = truncateBody(lines.join('\n'));
    const params = new URLSearchParams({
        subject,
        body
    });
    return `mailto:support@mysense360.com?${params.toString()}`;
}

function buildIssueUrl(bundle, options = {}) {
    const md5Short = bundle.md5.slice(0, 8);
    const title = `[Crash ${md5Short}]`;
    const checklist = [
        bundle.summary,
        '',
        '## Checklist',
        `- [ ] Attached support bundle JSON (${bundle.fileName})`,
        options.includeGzip && bundle.gzFileName ? `- [ ] Attached gzip archive (${bundle.gzFileName})` : '- [ ] Attached gzip archive (if created)',
        '- [ ] Added reproduction steps',
        '- [ ] Included browser and OS details'
    ].filter(Boolean).join('\n');

    const params = new URLSearchParams({
        title,
        body: checklist
    });

    return `https://github.com/sense360store/WebFlash/issues/new?${params.toString()}`;
}

function setStatus(statusEl, message, type = 'info', options = {}) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.dataset.status = type;
    statusEl.setAttribute('aria-live', 'polite');
    if (options.persist !== false) {
        const existingTimer = statusFlashTimers.get(statusEl);
        if (existingTimer) {
            clearTimeout(existingTimer);
            statusFlashTimers.delete(statusEl);
        }
        statusEl.dataset.lastMessage = message;
        statusEl.dataset.lastStatusType = type;
    }
}

function flashStatus(statusEl, message, type = 'info', duration = 1200) {
    if (!statusEl) {
        return;
    }

    const previousMessage = statusEl.dataset.lastMessage ?? statusEl.textContent ?? '';
    const previousType = statusEl.dataset.lastStatusType ?? statusEl.dataset.status ?? 'info';

    setStatus(statusEl, message, type, { persist: false });

    const existingTimer = statusFlashTimers.get(statusEl);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        setStatus(statusEl, previousMessage, previousType);
        statusFlashTimers.delete(statusEl);
    }, duration);

    statusFlashTimers.set(statusEl, timer);
}

async function copyTextToClipboard(text) {
    if (typeof text !== 'string') {
        return false;
    }

    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const doc = typeof document !== 'undefined' ? document : undefined;

    if (!doc || !doc.body) {
        return false;
    }

    try {
        if (nav?.clipboard?.writeText) {
            await nav.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        console.warn('navigator.clipboard.writeText failed', error);
    }

    let textarea;
    try {
        textarea = doc.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        doc.body.appendChild(textarea);
        if (typeof textarea.focus === 'function') {
            try {
                textarea.focus({ preventScroll: true });
            } catch (focusError) {
                textarea.focus();
            }
        }
        textarea.select();
        if (typeof doc.execCommand !== 'function') {
            return false;
        }
        const successful = doc.execCommand('copy');
        return successful;
    } catch (error) {
        console.warn('Fallback clipboard copy failed', error);
        return false;
    } finally {
        if (textarea && textarea.parentNode) {
            textarea.parentNode.removeChild(textarea);
        }
    }
}

function createModalElements(closeModal, onCreate) {
    const backdrop = document.createElement('div');
    backdrop.className = 'support-modal-backdrop';
    backdrop.tabIndex = -1;

    const modal = document.createElement('div');
    modal.className = 'support-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'support-modal-title');

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.id = 'support-modal-title';
    title.textContent = 'Create support bundle';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'support-modal__close';
    closeButton.setAttribute('aria-label', 'Close support dialog');
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', closeModal);

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'support-modal__body';

    const intro = document.createElement('p');
    intro.className = 'support-modal__intro';
    intro.textContent = 'Generate a diagnostic bundle to attach when contacting Sense360 support.';

    const optionsGroup = document.createElement('div');
    optionsGroup.className = 'support-modal__options';

    const serialOption = document.createElement('label');
    serialOption.className = 'support-checkbox';
    const serialInput = document.createElement('input');
    serialInput.type = 'checkbox';
    serialInput.checked = false;
    serialInput.setAttribute('data-support-serial', 'true');
    const serialText = document.createElement('span');
    serialText.innerHTML = '<strong>Include serial logs</strong> (redacted for SSID/password)';
    serialOption.appendChild(serialInput);
    serialOption.appendChild(serialText);

    const ipOption = document.createElement('label');
    ipOption.className = 'support-checkbox';
    const ipInput = document.createElement('input');
    ipInput.type = 'checkbox';
    ipInput.setAttribute('data-support-allow-ip', 'true');
    const ipText = document.createElement('span');
    ipText.innerHTML = '<strong>Allow IP addresses</strong> (may help with networking issues)';
    ipOption.appendChild(ipInput);
    ipOption.appendChild(ipText);

    const gzipOption = document.createElement('label');
    gzipOption.className = 'support-checkbox';
    const gzipInput = document.createElement('input');
    gzipInput.type = 'checkbox';
    gzipInput.checked = includeGzipByDefault;
    gzipInput.setAttribute('data-support-gzip', 'true');
    const gzipText = document.createElement('span');
    gzipText.innerHTML = '<strong>Also create .gz</strong> (smaller attachment for email)';
    gzipOption.appendChild(gzipInput);
    gzipOption.appendChild(gzipText);

    optionsGroup.appendChild(serialOption);
    optionsGroup.appendChild(ipOption);
    optionsGroup.appendChild(gzipOption);

    const summaryBox = document.createElement('div');
    summaryBox.className = 'support-modal__summary';
    summaryBox.setAttribute('data-support-summary', '');
    summaryBox.textContent = 'Summary will appear here after generating a bundle.';

    const previewSection = document.createElement('section');
    previewSection.className = 'support-modal__preview';

    const previewHeader = document.createElement('div');
    previewHeader.className = 'support-preview__header';

    const previewTitle = document.createElement('span');
    previewTitle.className = 'support-preview__title';
    previewTitle.textContent = 'Diagnostics preview';

    const previewRefreshButton = document.createElement('button');
    previewRefreshButton.type = 'button';
    previewRefreshButton.className = 'support-preview__refresh';
    previewRefreshButton.textContent = 'Refresh';

    const previewToggle = document.createElement('button');
    previewToggle.type = 'button';
    previewToggle.className = 'support-preview__toggle';
    previewToggle.setAttribute('aria-expanded', 'false');
    previewToggle.textContent = 'Show preview';

    previewHeader.appendChild(previewTitle);
    previewHeader.appendChild(previewRefreshButton);
    previewHeader.appendChild(previewToggle);

    const previewBody = document.createElement('div');
    previewBody.className = 'support-preview__body';
    previewBody.hidden = true;

    const previewActions = document.createElement('div');
    previewActions.className = 'support-preview__actions';

    const previewCopyButton = document.createElement('button');
    previewCopyButton.type = 'button';
    previewCopyButton.textContent = 'Copy preview';
    previewCopyButton.disabled = true;

    const previewDownloadButton = document.createElement('button');
    previewDownloadButton.type = 'button';
    previewDownloadButton.textContent = 'Download preview';
    previewDownloadButton.disabled = true;

    previewActions.appendChild(previewCopyButton);
    previewActions.appendChild(previewDownloadButton);

    const previewContent = document.createElement('pre');
    previewContent.className = 'support-preview__content';
    previewContent.setAttribute('tabindex', '0');
    previewContent.textContent = 'Preview diagnostics before sharing with support.';

    previewBody.appendChild(previewActions);
    previewBody.appendChild(previewContent);

    previewSection.appendChild(previewHeader);
    previewSection.appendChild(previewBody);

    const actions = document.createElement('div');
    actions.className = 'support-modal__actions';

    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.textContent = 'Create bundle';
    createButton.addEventListener('click', () => onCreate({
        serial: serialInput.checked,
        allowIPs: ipInput.checked,
        gzip: gzipInput.checked
    }));

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.textContent = 'Download';
    downloadButton.disabled = true;

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = 'Copy summary';
    copyButton.classList.add('secondary');
    copyButton.disabled = true;

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.textContent = 'Copy share link';
    shareButton.classList.add('secondary');

    const emailButton = document.createElement('button');
    emailButton.type = 'button';
    emailButton.textContent = 'Email support';
    emailButton.classList.add('secondary');
    emailButton.disabled = true;

    const issueButton = document.createElement('button');
    issueButton.type = 'button';
    issueButton.textContent = 'Open GitHub issue';
    issueButton.classList.add('secondary');
    issueButton.disabled = true;

    actions.appendChild(createButton);
    actions.appendChild(downloadButton);
    actions.appendChild(copyButton);
    actions.appendChild(shareButton);
    actions.appendChild(emailButton);
    actions.appendChild(issueButton);

    const status = document.createElement('p');
    status.className = 'support-modal__status';
    status.setAttribute('role', 'status');

    body.appendChild(intro);
    body.appendChild(optionsGroup);
    body.appendChild(summaryBox);
    body.appendChild(previewSection);
    body.appendChild(actions);
    body.appendChild(status);

    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);

    return {
        backdrop,
        modal,
        summaryBox,
        status,
        serialInput,
        ipInput,
        gzipInput,
        createButton,
        downloadButton,
        copyButton,
        shareButton,
        emailButton,
        issueButton,
        previewSection,
        previewToggle,
        previewBody,
        previewContent,
        previewCopyButton,
        previewDownloadButton,
        previewRefreshButton
    };
}

function trapFocus(modal) {
    const focusableSelectors = 'button, [href], input, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(modal.querySelectorAll(focusableSelectors)).filter((el) => !el.disabled);

    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleKeydown = (event) => {
        if (event.key === 'Tab') {
            if (event.shiftKey) {
                if (document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            modal.dispatchEvent(new CustomEvent('support:close'));
        }
    };

    modal.addEventListener('keydown', handleKeydown);

    return () => {
        modal.removeEventListener('keydown', handleKeydown);
    };
}

function initSupportUI() {
    ensureStyle();

    const appInfo = resolveAppInfo();

    const elements = createModalElements(closeModal, handleCreate);
    const {
        backdrop,
        modal,
        summaryBox,
        status,
        createButton,
        downloadButton,
        copyButton,
        emailButton,
        issueButton,
        serialInput,
        ipInput,
        previewSection,
        previewToggle,
        previewBody,
        previewContent,
        previewCopyButton,
        previewDownloadButton,
        previewRefreshButton
    } = elements;

    document.body.appendChild(backdrop);

    let removeFocusTrap = null;
    let currentPreviewText = '';
    let previewExpanded = false;

    function enableActions(enabled) {
        downloadButton.disabled = !enabled;
        copyButton.disabled = !enabled;
        emailButton.disabled = !enabled;
        issueButton.disabled = !enabled;
    }

    function getPreviewOptions() {
        return {
            serial: Boolean(serialInput?.checked),
            allowIPs: Boolean(ipInput?.checked)
        };
    }

    function buildPreviewText() {
        const options = getPreviewOptions();
        const errorsApi = window.supportErrors;
        const bundleApi = window.supportBundle;

        const rawErrors = typeof errorsApi?.getErrors === 'function' ? errorsApi.getErrors() : [];
        const rawSerial = typeof bundleApi?.getSerialLogs === 'function' ? bundleApi.getSerialLogs() : [];

        const sanitized = redact({ errors: rawErrors, serialLogs: rawSerial }, { allowIPs: options.allowIPs });

        const errors = Array.isArray(sanitized.errors) ? sanitized.errors : [];
        const serialLogs = Array.isArray(sanitized.serialLogs) ? sanitized.serialLogs : [];

        const payload = {
            errors,
            serialLogs: options.serial ? serialLogs : '[excluded by modal settings]'
        };

        const errorCount = errors.length;
        const serialCount = options.serial ? serialLogs.length : 0;
        const summaryParts = [`${errorCount} error${errorCount === 1 ? '' : 's'}`];

        if (options.serial) {
            summaryParts.push(`${serialCount} serial line${serialCount === 1 ? '' : 's'}`);
        } else {
            summaryParts.push('serial logs excluded');
        }

        currentPreviewText = JSON.stringify(payload, null, 2);
        previewContent.textContent = currentPreviewText;

        const hasContent = currentPreviewText.trim().length > 0;
        previewCopyButton.disabled = !hasContent;
        previewDownloadButton.disabled = !hasContent;

        setStatus(status, `Preview updated (${summaryParts.join(', ')}).`);
    }

    function setPreviewExpanded(expanded) {
        previewExpanded = expanded;
        previewBody.hidden = !expanded;
        previewSection.classList.toggle('is-open', expanded);
        previewToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        previewToggle.textContent = expanded ? 'Hide preview' : 'Show preview';

        if (expanded) {
            buildPreviewText();
        }
    }

    function refreshPreview() {
        buildPreviewText();
    }

    function openModal() {
        lastActiveElement = document.activeElement;
        backdrop.classList.add('is-open');
        removeFocusTrap = trapFocus(modal);
        refreshPreview();
        setTimeout(() => {
            modal.querySelector('button:not([disabled])')?.focus();
        }, 0);
    }

    function closeAndCleanup() {
        backdrop.classList.remove('is-open');
        if (removeFocusTrap) {
            removeFocusTrap();
            removeFocusTrap = null;
        }
        setPreviewExpanded(false);
        if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
            lastActiveElement.focus();
        }
    }

    function handleCreate(options) {
        enableActions(false);
        setStatus(status, 'Creating bundle…');
        createButton.disabled = true;

        const serialLines = options.serial ? [...serialLogBuffer] : undefined;

        createSupportBundle({
            app: appInfo,
            stateSnapshot: gatherStateSnapshot(),
            capabilities: gatherCapabilities(),
            serialLogLines: serialLines,
            includeIPs: options.allowIPs,
            esphomeYaml: window.currentFirmwareYaml
        }).then(async (bundle) => {
            currentBundle = {
                ...bundle,
                includeGzip: options.gzip,
                deviceId: bundle.payload?.state?.deviceId || bundle.payload?.state?.device || gatherFirmwareContext().deviceId || 'unknown-device',
                channel: bundle.payload?.state?.channel || gatherFirmwareContext().channel || 'unknown-channel'
            };

            summaryBox.textContent = bundle.summary;
            setStatus(status, `Bundle ready (${formatSize(bundle.sizeBytes)}, md5 ${bundle.md5.slice(0, 8)})`);
            createButton.disabled = false;
            enableActions(true);

            if (options.gzip) {
                try {
                    const { gzBlob, gzFileName } = await createGzip(bundle.jsonBlob, bundle.fileName);
                    currentBundle.gzBlob = gzBlob;
                    currentBundle.gzFileName = gzFileName;
                    setStatus(status, `Bundle ready (${formatSize(bundle.sizeBytes)}, md5 ${bundle.md5.slice(0, 8)}). Gzip prepared.`);
                } catch (error) {
                    console.error('Unable to create gzip', error);
                    setStatus(status, 'Bundle ready, but unable to generate gzip archive.', 'error');
                }
            } else {
                currentBundle.gzBlob = null;
                currentBundle.gzFileName = null;
            }
        }).catch((error) => {
            console.error('Failed to create support bundle', error);
            setStatus(status, 'Unable to create bundle. Check console for details.', 'error');
            createButton.disabled = false;
            currentBundle = null;
        });
    }

    function handleDownload() {
        if (!currentBundle) {
            return;
        }

        flushDownloadUrls();

        const url = URL.createObjectURL(currentBundle.jsonBlob);
        downloadUrls.add(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = currentBundle.fileName;
        link.click();

        if (currentBundle.includeGzip && currentBundle.gzBlob) {
            const gzUrl = URL.createObjectURL(currentBundle.gzBlob);
            downloadUrls.add(gzUrl);
            const gzLink = document.createElement('a');
            gzLink.href = gzUrl;
            gzLink.download = currentBundle.gzFileName;
            gzLink.click();
        }

        setStatus(status, 'Download started.');
    }

    function handlePreviewDownload() {
        if (!currentPreviewText.trim()) {
            return;
        }

        const blob = new Blob([currentPreviewText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        downloadUrls.add(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = `webflash-support-preview-${Date.now()}.txt`;
        link.click();
        setStatus(status, 'Preview download started.');
    }

    function handleCopy() {
        if (!currentBundle) {
            return;
        }
        const success = await copyTextToClipboard(currentBundle.summary);
        if (success) {
            flashStatus(status, 'Summary copied to clipboard.');
        } else {
            flashStatus(status, 'Unable to copy summary.', 'error');
        }
    }

    async function handleShareCopy() {
        const wizardSummary = window.wizardStateSummary || null;
        if (!wizardSummary || typeof wizardSummary.buildShareableUrl !== 'function') {
            flashStatus(status, 'Share link is not available.', 'error');
            return;
        }

        let state = {};
        try {
            state = typeof wizardSummary.getState === 'function' ? wizardSummary.getState() : {};
        } catch (error) {
            console.error('Unable to read wizard state', error);
            flashStatus(status, 'Unable to read current configuration.', 'error');
            return;
        }

        let url = '';
        try {
            url = wizardSummary.buildShareableUrl(state);
        } catch (error) {
            console.error('Failed to build shareable URL', error);
            flashStatus(status, 'Unable to create share link.', 'error');
            return;
        }

        if (!url) {
            flashStatus(status, 'Share link is not available.', 'error');
            return;
        }

        const success = await copyTextToClipboard(url);
        if (success) {
            flashStatus(status, 'Share link copied to clipboard.');
        } else {
            flashStatus(status, 'Unable to copy share link.', 'error');
        }
    }

    function handlePreviewCopy() {
        if (!currentPreviewText.trim()) {
            return;
        }

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(currentPreviewText).then(() => {
                setStatus(status, 'Preview copied to clipboard.');
            }).catch(() => {
                setStatus(status, 'Unable to copy preview.', 'error');
            });
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = currentPreviewText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            setStatus(status, 'Preview copied to clipboard.');
        } catch (error) {
            setStatus(status, 'Unable to copy preview.', 'error');
        }
        document.body.removeChild(textarea);
    }

    function handleEmail() {
        if (!currentBundle) {
            return;
        }
        const url = buildMailto(currentBundle, { includeGzip: currentBundle.includeGzip });
        window.location.href = url;
    }

    function handleIssue() {
        if (!currentBundle) {
            return;
        }
        const url = buildIssueUrl(currentBundle, { includeGzip: currentBundle.includeGzip });
        window.open(url, '_blank', 'noopener');
    }

    function closeModal() {
        closeAndCleanup();
    }

    downloadButton.addEventListener('click', handleDownload);
    copyButton.addEventListener('click', handleCopy);
    emailButton.addEventListener('click', handleEmail);
    issueButton.addEventListener('click', handleIssue);
    previewToggle.addEventListener('click', () => {
        setPreviewExpanded(!previewExpanded);
    });
    previewRefreshButton.addEventListener('click', refreshPreview);
    previewCopyButton.addEventListener('click', handlePreviewCopy);
    previewDownloadButton.addEventListener('click', handlePreviewDownload);
    serialInput.addEventListener('change', refreshPreview);
    ipInput.addEventListener('change', refreshPreview);

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
            closeModal();
        }
    });

    modal.addEventListener('support:close', () => {
        closeModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && backdrop.classList.contains('is-open')) {
            event.preventDefault();
            closeModal();
        }
    });

    createSupportButton(openModal);

    window.supportBundle = Object.freeze({
        open: openModal,
        pushSerial: pushSerialLog,
        clearSerial: () => {
            serialLogBuffer.length = 0;
        },
        getSerialLogs: () => [...serialLogBuffer],
        recordEvent: recordLifecycleEvent,
        getEvents: () => [...lifecycleEvents]
    });

    window.addEventListener('beforeunload', flushDownloadUrls);

    recordLifecycleEvent('support-ui-ready');
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSupportUI);
    } else {
        initSupportUI();
    }
}
