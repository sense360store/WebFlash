/**
 * @fileoverview HTML escaping utility for XSS prevention.
 * @module utils/escape-html
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * Converts the following characters to their HTML entity equivalents:
 * - `&` → `&amp;`
 * - `<` → `&lt;`
 * - `>` → `&gt;`
 * - `"` → `&quot;`
 * - `'` → `&#039;`
 *
 * @param {*} value - The value to escape. Will be converted to string.
 * @returns {string} The escaped string, or empty string if value is null/undefined.
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 * @example
 * escapeHtml(null) // Returns: ''
 */
export function escapeHtml(value) {
    if (value == null) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
