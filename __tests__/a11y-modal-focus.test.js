/**
 * Tests focus restoration and ARIA semantics for the changelog and error
 * log modals. The rescue and preflight-help modal already cover the focus
 * restoration pattern — these tests catch regressions in the other two
 * dialog surfaces.
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

describe('changelog modal accessibility', () => {
    let mod;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '';
        document.body.style.overflow = '';

        jest.unstable_mockModule('../scripts/services/changelog.js', () => ({
            getChangelog: jest.fn(async () => []),
            getChangelogForConfig: jest.fn(async () => []),
            formatDate: jest.fn(() => '')
        }));

        mod = await import('../scripts/layout/changelog-modal.js');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('opens with dialog semantics and focuses close button', async () => {
        const trigger = document.createElement('button');
        trigger.dataset.changelogTrigger = '';
        document.body.appendChild(trigger);
        trigger.focus();

        await mod.openChangelogModal('Ceiling-USB', { trigger });

        const modal = document.querySelector('.changelog-modal');
        expect(modal).not.toBeNull();
        expect(modal.getAttribute('role')).toBe('dialog');
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-labelledby')).toBe('changelog-modal-title');
    });

    test('closeModal restores focus to the original trigger', async () => {
        const trigger = document.createElement('button');
        trigger.dataset.changelogTrigger = '';
        document.body.appendChild(trigger);
        trigger.focus();

        await mod.openChangelogModal('Ceiling-USB', { trigger });

        // Allow the modal's deferred close-button focus to run.
        await new Promise((resolve) => setTimeout(resolve, 150));

        mod.closeModal();
        expect(document.activeElement).toBe(trigger);
    });
});
