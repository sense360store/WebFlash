(function () {
    const STORAGE_KEY = 'sense360-theme';
    const root = document.documentElement;

    const prefersDark = () => mediaQuery ? mediaQuery.matches : false;

    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const getStoredTheme = () => {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return null;
        }
    };

    const storeTheme = (theme) => {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            /* noop */
        }
    };

    const resolveTheme = () => {
        const stored = getStoredTheme();
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
        return prefersDark() ? 'dark' : 'light';
    };

    const applyTheme = (theme) => {
        root.setAttribute('data-theme', theme);
        toggleButton.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        toggleIcon.textContent = theme === 'dark' ? '🌙' : '🌞';
        toggleLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
    };

    const toggleTheme = () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        storeTheme(next);
    };

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'theme-toggle';
    toggleButton.setAttribute('aria-label', 'Toggle theme');
    toggleButton.addEventListener('click', toggleTheme);

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'theme-toggle__icon';
    toggleButton.appendChild(toggleIcon);

    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'theme-toggle__label';
    toggleButton.appendChild(toggleLabel);

    const initTheme = resolveTheme();
    applyTheme(initTheme);
    storeTheme(initTheme);

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', (event) => {
            const stored = getStoredTheme();
            if (stored === 'light' || stored === 'dark') {
                return;
            }
            applyTheme(event.matches ? 'dark' : 'light');
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(toggleButton);
    });
})();
