/**
 * @fileoverview Theme toggle functionality for dark/light mode switching.
 * Persists user preference to localStorage and respects system preference as fallback.
 * @module theme-toggle
 */

const STORAGE_KEY = 'theme-preference';

/**
 * Get the current effective theme based on user preference or system setting.
 * @returns {'light' | 'dark'} The current theme
 */
function getEffectiveTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply theme to the document and update toggle button state.
 * @param {'light' | 'dark'} theme - The theme to apply
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
        toggle.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    }
}

/**
 * Toggle between light and dark themes.
 */
function toggleTheme() {
    const current = getEffectiveTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
}

/**
 * Initialize theme toggle functionality.
 */
function initThemeToggle() {
    // Apply saved or system preference theme on load
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
        applyTheme(savedTheme);
    }
    // If no saved preference, let CSS media queries handle it (no data-theme attribute)

    // Set up toggle button click handler
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.addEventListener('click', toggleTheme);
    }

    // Listen for system preference changes (only affects users without explicit preference)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only update if user hasn't set an explicit preference
        if (!localStorage.getItem(STORAGE_KEY)) {
            // CSS will handle this via media queries, but we can update aria-label
            const toggle = document.getElementById('theme-toggle');
            if (toggle) {
                const newTheme = e.matches ? 'dark' : 'light';
                toggle.setAttribute('aria-label', `Switch to ${newTheme === 'dark' ? 'light' : 'dark'} mode`);
                toggle.setAttribute('title', `Switch to ${newTheme === 'dark' ? 'light' : 'dark'} mode`);
            }
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
} else {
    initThemeToggle();
}
