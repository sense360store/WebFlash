/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('preset name validation helper', () => {
    test('accepts blank names when auto-generation is allowed', async () => {
        const { validatePresetName } = await import('../scripts/utils/preset-storage.js');
        const result = validatePresetName('   ', { allowEmpty: true });
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('');
    });

    test('normalizes whitespace and validates length bounds', async () => {
        const { validatePresetName } = await import('../scripts/utils/preset-storage.js');
        const result = validatePresetName('  Living   Room  ');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('Living Room');
    });

    test('rejects names shorter than minimum length', async () => {
        const { validatePresetName, PRESET_NAME_RULES } = await import('../scripts/utils/preset-storage.js');
        const tooShort = 'a'.repeat(PRESET_NAME_RULES.minLength - 1);
        const result = validatePresetName(tooShort);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('minLength');
    });

    test('rejects names longer than maximum length', async () => {
        const { validatePresetName, PRESET_NAME_RULES } = await import('../scripts/utils/preset-storage.js');
        const tooLong = 'a'.repeat(PRESET_NAME_RULES.maxLength + 1);
        const result = validatePresetName(tooLong);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('maxLength');
    });
});

describe('preset manager input validation behavior', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="preset-manager">
                <form data-preset-form>
                    <input data-preset-name type="text" />
                    <button data-preset-save type="submit">Save</button>
                </form>
                <p data-preset-empty></p>
                <ul data-preset-list></ul>
            </div>
            <input type="radio" name="mounting" value="wall" checked>
            <input type="radio" name="power" value="usb" checked>
            <input type="radio" name="airiq" value="none" checked>
            <input type="radio" name="presence" value="none" checked>
            <input type="radio" name="comfort" value="none" checked>
            <input type="radio" name="fan" value="none" checked>
        `;
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ builds: [] })
        }));
    });

    test('handles invalid and blank names with expected save behavior', async () => {
        await import('../scripts/layout/state-summary.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        const input = document.querySelector('[data-preset-name]');
        const button = document.querySelector('[data-preset-save]');
        const form = document.querySelector('[data-preset-form]');

        input.value = 'ab';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(button.disabled).toBe(true);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        const errorId = input.getAttribute('aria-describedby');
        const error = document.getElementById(errorId);
        expect(error).not.toBeNull();
        expect(error.hidden).toBe(false);

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(document.querySelectorAll('[data-preset-id]')).toHaveLength(0);

        input.value = '   ';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(button.disabled).toBe(false);
        expect(input.getAttribute('aria-invalid')).toBe('false');
    });
});
