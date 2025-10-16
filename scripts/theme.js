/* QA checklist:
 * - Body text vs background contrast ≥ 7:1 in both themes.
 * - Buttons (accent) vs text contrast ≥ 4.5:1.
 * - Inputs (text vs fill) ≥ 4.5:1.
 * - Links must remain visible when unfocused and have hover/active states.
 * - Verify in Chrome/Edge (Windows/macOS), Safari (macOS/iOS), Firefox (desktop).
 * - Confirm no element becomes illegible in the wizard steps, check chips, accordions, and the serial log viewer.
 */
(function () {
    const THEME_KEY = 'theme';
    const root = document.documentElement;
    const validModes = new Set(['auto', 'light', 'dark']);
    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    let currentMode = 'auto';
    let mediaListener = null;

    if (!root.hasAttribute('data-density')) {
        root.setAttribute('data-density', 'comfortable');
    }

    function readStoredTheme() {
        try {
            const stored = localStorage.getItem(THEME_KEY);
            return validModes.has(stored) ? stored : null;
        } catch (error) {
            return null;
        }
    }

    function persist(mode) {
        try {
            localStorage.setItem(THEME_KEY, mode);
        } catch (error) {
            // no-op when storage is unavailable
        }
    }

    function resolveSystemPreference() {
        return mediaQuery ? mediaQuery.matches : false;
    }

    function notify(mode, resolvedMode) {
        root.setAttribute('data-theme-mode', mode);
        const event = new CustomEvent('themechange', {
            detail: { mode, resolved: resolvedMode }
        });
        document.dispatchEvent(event);
    }

    function apply(mode) {
        const resolvedMode = mode === 'auto' ? (resolveSystemPreference() ? 'dark' : 'light') : mode;
        root.setAttribute('data-theme', resolvedMode);
        notify(mode, resolvedMode);
        return resolvedMode;
    }

    function enableMediaListener() {
        if (!mediaQuery || mediaListener) {
            return;
        }

        mediaListener = function (event) {
            if (currentMode === 'auto') {
                apply('auto');
            }
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', mediaListener);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(mediaListener);
        }
    }

    function disableMediaListener() {
        if (!mediaQuery || !mediaListener) {
            return;
        }

        if (typeof mediaQuery.removeEventListener === 'function') {
            mediaQuery.removeEventListener('change', mediaListener);
        } else if (typeof mediaQuery.removeListener === 'function') {
            mediaQuery.removeListener(mediaListener);
        }

        mediaListener = null;
    }

    function getTheme() {
        return currentMode;
    }

    function setTheme(mode) {
        const nextMode = validModes.has(mode) ? mode : 'auto';
        if (currentMode === nextMode) {
            // Ensure we still persist the value in case storage was cleared.
            persist(nextMode);
            return apply(nextMode);
        }

        currentMode = nextMode;
        persist(nextMode);

        if (nextMode === 'auto') {
            enableMediaListener();
        } else {
            disableMediaListener();
        }

        return apply(nextMode);
    }

    currentMode = readStoredTheme() || 'auto';

    if (currentMode === 'auto') {
        enableMediaListener();
    }

    apply(currentMode);
    persist(currentMode);

    window.WebFlashTheme = Object.freeze({ getTheme, setTheme });
    window.getTheme = getTheme;
    window.setTheme = setTheme;
})();
