import { createSupportBundle, createGzip } from './bundle.js';
import { getState, getStep } from '../state.js';

const STYLE_ID = 'support-bundle-style';
const MAX_SERIAL_LINES = 2000;

const serialLogBuffer = [];
const downloadUrls = new Set();
let currentBundle = null;
let includeGzipByDefault = false;
let lastActiveElement = null;

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

    const snapshot = {
        ...state,
        wizardStep: step,
        createdAt: new Date().toISOString(),
        ...gatherFirmwareContext()
    };

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

function setStatus(statusEl, message, type = 'info') {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.dataset.status = type;
    statusEl.setAttribute('aria-live', 'polite');
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
    actions.appendChild(emailButton);
    actions.appendChild(issueButton);

    const status = document.createElement('p');
    status.className = 'support-modal__status';
    status.setAttribute('role', 'status');

    body.appendChild(intro);
    body.appendChild(optionsGroup);
    body.appendChild(summaryBox);
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
        emailButton,
        issueButton
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
    const { backdrop, modal, summaryBox, status, createButton, downloadButton, copyButton, emailButton, issueButton } = elements;

    document.body.appendChild(backdrop);

    let removeFocusTrap = null;

    function enableActions(enabled) {
        downloadButton.disabled = !enabled;
        copyButton.disabled = !enabled;
        emailButton.disabled = !enabled;
        issueButton.disabled = !enabled;
    }

    function openModal() {
        lastActiveElement = document.activeElement;
        backdrop.classList.add('is-open');
        removeFocusTrap = trapFocus(modal);
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
            includeIPs: options.allowIPs
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

    function handleCopy() {
        if (!currentBundle) {
            return;
        }
        const text = currentBundle.summary;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                setStatus(status, 'Summary copied to clipboard.');
            }).catch(() => {
                setStatus(status, 'Unable to copy summary.', 'error');
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                setStatus(status, 'Summary copied to clipboard.');
            } catch (error) {
                setStatus(status, 'Unable to copy summary.', 'error');
            }
            document.body.removeChild(textarea);
        }
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

    elements.downloadButton.addEventListener('click', handleDownload);
    elements.copyButton.addEventListener('click', handleCopy);
    elements.emailButton.addEventListener('click', handleEmail);
    elements.issueButton.addEventListener('click', handleIssue);

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
        getSerialLogs: () => [...serialLogBuffer]
    });

    window.addEventListener('beforeunload', flushDownloadUrls);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSupportUI);
    } else {
        initSupportUI();
    }
}
