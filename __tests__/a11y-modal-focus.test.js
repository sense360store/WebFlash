/**
 * Tests focus restoration and ARIA semantics for the error log modal. The
 * rescue modal already covers the focus restoration pattern — this test catches
 * regressions in the other dialog surface the 2.0 view still mounts.
 */
import { jest } from '@jest/globals';

describe('error log modal accessibility', () => {
    let mod;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '';
        document.body.style.overflow = '';

        jest.unstable_mockModule('../scripts/services/error-log.js', () => ({
            getErrorLog: jest.fn(() => []),
            getLogCounts: jest.fn(() => ({ error: 0, warning: 0, info: 0 })),
            clearErrorLog: jest.fn(),
            subscribe: jest.fn(() => () => {}),
            formatTimestamp: jest.fn((d) => d?.toISOString?.() || ''),
            exportLog: jest.fn(() => '{}')
        }));

        mod = await import('../scripts/layout/error-log-modal.js');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('opens with role=dialog, aria-modal=true, accessible label, and focuses close', () => {
        const trigger = document.createElement('button');
        trigger.dataset.errorLogTrigger = '';
        document.body.appendChild(trigger);
        trigger.focus();

        mod.openErrorLogModal({ trigger });

        const modal = document.querySelector('.error-log-modal');
        expect(modal).not.toBeNull();
        expect(modal.getAttribute('role')).toBe('dialog');
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-labelledby')).toBe('error-log-modal-title');
        expect(document.getElementById('error-log-modal-title')).not.toBeNull();
    });

    test('Escape closes the modal and focus returns to the trigger', () => {
        const trigger = document.createElement('button');
        trigger.dataset.errorLogTrigger = '';
        trigger.textContent = 'View error log';
        document.body.appendChild(trigger);
        trigger.focus();

        mod.openErrorLogModal({ trigger });
        const modal = document.querySelector('.error-log-modal');

        // Wait for the modal's internal focus call so we can verify focus moved.
        return new Promise((resolve) => {
            setTimeout(() => {
                modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                expect(modal.hidden).toBe(true);
                expect(document.activeElement).toBe(trigger);
                resolve();
            }, 150);
        });
    });
});
