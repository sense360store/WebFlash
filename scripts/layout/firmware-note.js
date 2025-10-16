(function () {
    let observedButton = null;
    let buttonObserver = null;
    let copyTimer = null;
    let subscribedToState = false;

    function isVisible(element) {
        return !!(element && (element.offsetParent || element.getClientRects().length));
    }

    function findDownloadButton() {
        const byId = document.getElementById('download-btn');
        if (isVisible(byId)) {
            return byId;
        }

        const candidates = Array.from(document.querySelectorAll('button, a'));
        return candidates.find(element => {
            if (!isVisible(element)) {
                return false;
            }
            const text = element.textContent || '';
            return /download firmware/i.test(text);
        }) || null;
    }

    function ensureSidebar() {
        const meta = document.getElementById('sb-fw-meta');
        if (!meta) {
            return;
        }

        updateMeta(meta);

        if (!subscribedToState && window.wizardStateSummary && typeof window.wizardStateSummary.onStateChange === 'function') {
            window.wizardStateSummary.onStateChange(() => updateMeta(meta));
            subscribedToState = true;
        }

        const button = findDownloadButton();
        if (button && observedButton !== button) {
            if (buttonObserver) {
                buttonObserver.disconnect();
            }
            observedButton = button;
            buttonObserver = new MutationObserver(() => updateMeta(meta));
            buttonObserver.observe(button, { attributes: true, childList: true, subtree: true });
        }
    }

    function updateMeta(target) {
        if (!target) {
            return;
        }

        const button = findDownloadButton();
        if (!button) {
            return;
        }

        const labelText = (button.textContent || '').trim() || 'Download Firmware';
        target.innerHTML = '';

        const label = document.createElement('div');
        label.className = 'sidebar-fw-label';
        label.textContent = labelText;
        target.appendChild(label);

        const note = document.createElement('p');
        note.className = 'sidebar-fw-note';
        note.textContent = 'Selected firmware will be downloaded via the main button below.';
        target.appendChild(note);

        const link = button.getAttribute('data-href') || button.getAttribute('href');
        const resolved = resolveUrl(link);
        if (resolved) {
            const actions = document.createElement('div');
            actions.className = 'sidebar-actions';

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn';
            copyBtn.textContent = 'Copy .bin link';
            copyBtn.dataset.defaultLabel = copyBtn.textContent;
            copyBtn.addEventListener('click', () => handleCopy(resolved, copyBtn));

            actions.appendChild(copyBtn);
            target.appendChild(actions);
        }
    }

    function resolveUrl(url) {
        if (!url) {
            return null;
        }

        try {
            return new URL(url, window.location.href).href;
        } catch (error) {
            return url;
        }
    }

    async function handleCopy(url, button) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                fallbackCopy(url);
            }
            showCopyStatus(button, 'Copied');
        } catch (error) {
            console.error('[firmware-note] Failed to copy firmware link', error);
            showCopyStatus(button, 'Copy failed');
        }
    }

    function fallbackCopy(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', 'true');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
    }

    function showCopyStatus(button, message) {
        if (!button) {
            return;
        }

        const defaultLabel = button.dataset.defaultLabel || 'Copy .bin link';
        button.textContent = message;

        if (copyTimer) {
            clearTimeout(copyTimer);
        }

        copyTimer = setTimeout(() => {
            button.textContent = defaultLabel;
        }, 1200);
    }

    document.addEventListener('wizardSidebarReady', ensureSidebar);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureSidebar);
    } else {
        ensureSidebar();
    }
})();
