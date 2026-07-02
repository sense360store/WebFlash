/**
 * @jest-environment jsdom
 */

import {
    recordFlashStart,
    recordFlashSuccess,
    recordFlashError,
    getFlashHistory,
    clearFlashHistory,
    getFlashStats,
    formatHistoryEntry,
    exportFlashHistoryText
} from '../scripts/utils/flash-history.js';

describe('flash-history', () => {
    beforeEach(() => {
        clearFlashHistory();
    });

    describe('recordFlashStart', () => {
        test('records a flash start entry', () => {
            const id = recordFlashStart({
                configString: 'Wall-USB-AirIQBase',
                firmwareVersion: '1.0.0',
                channel: 'stable'
            });

            expect(id).toBeTruthy();
            const history = getFlashHistory();
            expect(history).toHaveLength(1);
            expect(history[0].configString).toBe('Wall-USB-AirIQBase');
            expect(history[0].firmwareVersion).toBe('1.0.0');
            expect(history[0].channel).toBe('stable');
            expect(history[0].status).toBe('started');
        });

        test('limits history to 50 entries', () => {
            for (let i = 0; i < 60; i++) {
                recordFlashStart({
                    configString: `Config-${i}`,
                    firmwareVersion: '1.0.0',
                    channel: 'stable'
                });
            }

            const history = getFlashHistory();
            expect(history).toHaveLength(50);
            expect(history[0].configString).toBe('Config-59');
        });
    });

    describe('recordFlashSuccess', () => {
        test('updates entry status to success', () => {
            const id = recordFlashStart({
                configString: 'Wall-USB',
                firmwareVersion: '1.0.0',
                channel: 'stable'
            });

            recordFlashSuccess(id, 5000);

            const history = getFlashHistory();
            expect(history[0].status).toBe('success');
            expect(history[0].duration).toBe(5000);
        });
    });

    describe('recordFlashError', () => {
        test('updates entry status to error with message', () => {
            const id = recordFlashStart({
                configString: 'Wall-USB',
                firmwareVersion: '1.0.0',
                channel: 'stable'
            });

            recordFlashError(id, 'Connection lost');

            const history = getFlashHistory();
            expect(history[0].status).toBe('error');
            expect(history[0].errorMessage).toBe('Connection lost');
        });
    });

    describe('getFlashStats', () => {
        test('returns correct statistics', () => {
            const id1 = recordFlashStart({ configString: 'A', firmwareVersion: '1.0.0', channel: 'stable' });
            recordFlashSuccess(id1, 3000);

            const id2 = recordFlashStart({ configString: 'B', firmwareVersion: '1.0.0', channel: 'stable' });
            recordFlashError(id2, 'Failed');

            recordFlashStart({ configString: 'C', firmwareVersion: '1.0.0', channel: 'stable' });

            const stats = getFlashStats();
            expect(stats.total).toBe(3);
            expect(stats.successful).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.inProgress).toBe(1);
            expect(stats.successRate).toBe(33);
        });
    });

    describe('formatHistoryEntry', () => {
        test('formats entry for display', () => {
            const entry = {
                id: 'test-123',
                timestamp: '2025-01-15T10:30:00.000Z',
                configString: 'Wall-USB-AirIQBase',
                firmwareVersion: '1.0.0',
                channel: 'stable',
                status: 'success',
                browser: 'Chrome',
                duration: 5000
            };

            const formatted = formatHistoryEntry(entry);
            expect(formatted).toContain('Wall-USB-AirIQBase');
            expect(formatted).toContain('v1.0.0');
            expect(formatted).toContain('stable');
            expect(formatted).toContain('Success');
            expect(formatted).toContain('5s');
        });
    });

    describe('exportFlashHistoryText', () => {
        test('exports empty history message when no entries', () => {
            const text = exportFlashHistoryText();
            expect(text).toBe('No flash history recorded.');
        });

        test('exports formatted history text', () => {
            const id = recordFlashStart({
                configString: 'Wall-USB',
                firmwareVersion: '1.0.0',
                channel: 'stable'
            });
            recordFlashSuccess(id, 3000);

            const text = exportFlashHistoryText();
            expect(text).toContain('=== WebFlash History ===');
            expect(text).toContain('Total: 1');
            expect(text).toContain('Success: 1');
            expect(text).toContain('Wall-USB');
        });
    });

    describe('clearFlashHistory', () => {
        test('clears all history entries', () => {
            recordFlashStart({ configString: 'A', firmwareVersion: '1.0.0', channel: 'stable' });
            recordFlashStart({ configString: 'B', firmwareVersion: '1.0.0', channel: 'stable' });

            clearFlashHistory();

            const history = getFlashHistory();
            expect(history).toHaveLength(0);
        });
    });

    describe('malformed localStorage tolerance', () => {
        const STORAGE_KEY = 'webflash-flash-history';

        test('drops non-object entries instead of throwing across all readers', () => {
            // localStorage is same-origin-writable; a corrupted or legacy
            // write can seed nulls/strings/numbers. None of the readers should
            // throw, and the junk entries must be filtered out.
            localStorage.setItem(STORAGE_KEY, '[null,"garbage",42,{"id":"a","status":"success","duration":10,"timestamp":"2026-01-01T00:00:00.000Z"}]');

            expect(() => getFlashHistory()).not.toThrow();
            const history = getFlashHistory();
            expect(history).toHaveLength(1);
            expect(history[0].id).toBe('a');

            expect(() => getFlashStats()).not.toThrow();
            expect(() => exportFlashHistoryText()).not.toThrow();
            // Recording must survive a poisoned store (it runs inside the live
            // ESP Web Tools state-changed handler).
            expect(() => recordFlashSuccess('a')).not.toThrow();
        });

        test('returns empty array when stored value is not an array', () => {
            localStorage.setItem(STORAGE_KEY, '{"not":"an-array"}');
            expect(getFlashHistory()).toEqual([]);
        });
    });
});
