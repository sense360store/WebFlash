(function () {
    document.addEventListener('wizardSidebarReady', () => {
        window.renderSidebar?.(1);
    });

    function findWizardRoot() {
        const direct = document.querySelector('.wizard-container');
        if (direct) {
            return direct;
        }

        const layout = document.querySelector('.wizard-layout');
        if (layout) {
            return layout;
        }

        const stepOne = document.getElementById('step-1');
        if (stepOne) {
            const container = stepOne.closest('.wizard-container, .wizard-layout, main, body > div');
            if (container) {
                return container;
            }
        }

        const heading = Array.from(document.querySelectorAll('h2')).find(node => /step\s*1/i.test(node.textContent || ''));
        if (heading) {
            const container = heading.closest('.wizard-container, .wizard-layout, main, body > div');
            if (container) {
                return container;
            }
        }

        return null;
    }

    function createSidebar(sidebar) {
        if (!sidebar) {
            return;
        }

        const configCard = document.createElement('div');
        configCard.className = 'sidebar-card';
        configCard.id = 'sb-config';
        configCard.innerHTML = `
            <h4>Your configuration</h4>
            <ul class="sidebar-list" id="sb-config-list"></ul>
            <section class="sidebar-hardware" aria-label="Hardware requirements" data-hardware-summary>
                <h5 class="sidebar-hardware__title">Hardware requirements</h5>
                <p class="sidebar-hardware__empty sidebar-muted" data-hardware-summary-empty>None yet</p>
                <p class="sidebar-hardware__core" data-hardware-summary-core hidden></p>
                <ul class="sidebar-hardware__headers" data-hardware-summary-headers hidden></ul>
            </section>
            <div class="sidebar-actions">
                <button class="btn primary" id="sb-copy-link" type="button">Copy sharable link</button>
                <button class="btn btn-qr" id="sb-show-qr" type="button" aria-label="Show QR code">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/>
                        <rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/>
                        <rect x="14" y="14" width="3" height="3"/>
                        <rect x="18" y="14" width="3" height="3"/>
                        <rect x="14" y="18" width="3" height="3"/>
                        <rect x="18" y="18" width="3" height="3"/>
                    </svg>
                    <span class="btn-qr__label">QR Code</span>
                </button>
                <button class="btn" id="sb-reset" type="button">Start over</button>
            </div>
        `;

        const capabilitiesCard = document.createElement('div');
        capabilitiesCard.className = 'sidebar-card';
        capabilitiesCard.id = 'sb-capabilities';
        capabilitiesCard.innerHTML = `
            <h4>Capabilities</h4>
            <div id="sb-cap-mount"></div>
        `;

        const firmwareCard = document.createElement('div');
        firmwareCard.className = 'sidebar-card';
        firmwareCard.id = 'sb-firmware';
        firmwareCard.innerHTML = `
            <h4>Firmware</h4>
            <div id="sb-fw-meta">Selected build will appear here.</div>
        `;

        sidebar.appendChild(configCard);
        sidebar.appendChild(capabilitiesCard);
        sidebar.appendChild(firmwareCard);

        const mountPoint = capabilitiesCard.querySelector('#sb-cap-mount');
        if (mountPoint) {
            mountPoint.innerHTML = '';
            if (typeof window.renderCapabilityBar === 'function') {
                try {
                    window.renderCapabilityBar(mountPoint);
                } catch (error) {
                    console.error('[splitview] Failed to render capability bar', error);
                }
            } else {
                const note = document.createElement('p');
                note.className = 'sidebar-fw-note sidebar-muted';
                note.textContent = 'Uses Web Serial (Chrome/Edge).';
                mountPoint.appendChild(note);
            }
        }
    }

    function setupSplitView() {
        const root = findWizardRoot();
        if (!root || !root.parentElement) {
            return;
        }

        if (root.classList.contains('wizard-shell') || root.closest('.wizard-shell')) {
            return;
        }

        const parent = root.parentElement;
        const shell = document.createElement('div');
        shell.className = 'wizard-shell';

        const main = document.createElement('div');
        main.className = 'wizard-main';

        const sidebar = document.createElement('aside');
        sidebar.className = 'wizard-sidebar';
        sidebar.dataset.wizardSummary = '';
        sidebar.setAttribute('aria-label', 'Quick summary and actions');

        parent.insertBefore(shell, root);
        main.appendChild(root);
        shell.appendChild(main);
        shell.appendChild(sidebar);

        createSidebar(sidebar);

        function renderSidebar(step) {
            if (!sidebar) {
                return;
            }

            const shouldShow = Number(step) === 4;
            sidebar.style.display = shouldShow ? '' : 'none';
        }

        window.renderSidebar = renderSidebar;
        renderSidebar(1);

        if (document.body) {
            document.body.classList.add('has-wizard-sidebar');
        }

        document.dispatchEvent(new CustomEvent('wizardSidebarReady', {
            detail: { sidebar }
        }));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupSplitView);
    } else {
        setupSplitView();
    }
})();
