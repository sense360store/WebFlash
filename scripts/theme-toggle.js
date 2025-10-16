(function () {
    const themeAPI = window.WebFlashTheme || {
        getTheme: () => (typeof window.getTheme === 'function' ? window.getTheme() : 'auto'),
        setTheme: (mode) => (typeof window.setTheme === 'function' ? window.setTheme(mode) : 'auto')
    };

    const modes = ['auto', 'dark', 'light'];
    const icons = {
        auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a1 1 0 0 1 1 1v1.26A8 8 0 0 1 20.74 11H22a1 1 0 1 1 0 2h-1.26A8 8 0 0 1 13 19.74V21a1 1 0 1 1-2 0v-1.26A8 8 0 0 1 3.26 13H2a1 1 0 1 1 0-2h1.26A8 8 0 0 1 11 4.26V3a1 1 0 0 1 1-1Zm0 5a5 5 0 1 0 0 10a5 5 0 0 0 0-10Z"></path></svg>',
        dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.002 3a1 1 0 0 1 .86.48a7 7 0 0 0 7.658 3.234a1 1 0 0 1 1.276 1.147A9 9 0 1 1 12.474 3.14a1 1 0 0 1-.472-.14Zm-2.3 2.767A7 7 0 1 0 18.234 17.3 8.992 8.992 0 0 1 9.702 5.767Z"></path></svg>',
        light: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm0 12a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm7-5a1 1 0 0 1 1 1v.002a1 1 0 1 1-2 0V13a1 1 0 0 1 1-1ZM6 12a1 1 0 0 1 1-1h.002a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm11.071-6.071a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707Zm-12.02.707a1 1 0 0 1 1.414-1.414l.707.707a1 1 0 0 1-1.414 1.414l-.707-.707Zm12.02 12.02a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707Zm-12.02.707a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707ZM12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8Z"></path></svg>'
    };

    function getNextMode(current) {
        const index = modes.indexOf(current);
        if (index === -1) {
            return modes[0];
        }
        return modes[(index + 1) % modes.length];
    }

    function formatLabel(mode) {
        return mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '';
    }

    function createToggle() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle';
        button.setAttribute('role', 'button');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'theme-toggle__icon';
        button.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'theme-toggle__label';
        button.appendChild(labelSpan);

        function update(mode, resolved) {
            const readable = formatLabel(mode);
            const resolvedLabel = mode === 'auto' ? formatLabel(resolved || document.documentElement.getAttribute('data-theme')) : '';
            iconSpan.innerHTML = icons[mode] || '';
            labelSpan.textContent = readable;
            button.setAttribute('data-mode', mode);
            button.setAttribute('aria-pressed', mode === 'auto' ? 'false' : 'true');
            button.setAttribute('aria-label', `Theme: ${readable}`);
            button.setAttribute('title', `Theme: ${readable}`);
            if (resolvedLabel) {
                button.setAttribute('data-resolved-theme', resolvedLabel);
            } else {
                button.removeAttribute('data-resolved-theme');
            }
        }

        button.addEventListener('click', () => {
            const next = getNextMode(themeAPI.getTheme());
            const resolved = themeAPI.setTheme(next);
            update(next, resolved);
        });

        document.addEventListener('themechange', (event) => {
            const mode = event.detail.mode;
            const resolved = event.detail.resolved;
            update(mode, resolved);
        });

        const initialMode = themeAPI.getTheme();
        const initialResolved = document.documentElement.getAttribute('data-theme');
        update(initialMode, initialResolved);

        return button;
    }

    function ensureToolbar() {
        const header = document.querySelector('.container > header') || document.querySelector('header');
        if (!header) {
            return document.body;
        }

        let toolbar = header.querySelector('.header-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'header-toolbar';
            header.appendChild(toolbar);
        }

        return toolbar;
    }

    const toggle = createToggle();
    ensureToolbar().appendChild(toggle);
})();
