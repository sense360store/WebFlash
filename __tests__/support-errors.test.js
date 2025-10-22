import { jest } from '@jest/globals';

describe('support errors', () => {
    let logError;
    let getErrors;

    beforeEach(async () => {
        jest.resetModules();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
        ({ logError, getErrors } = await import('../scripts/support/errors.js'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('logError stores normalised entries and returns stored entry', () => {
        const entry = logError({
            message: 'Step render failed',
            stack: 'Error: Step render failed\n    at render',
            type: 'wizard',
            stepId: 'step-1'
        });

        expect(entry).toMatchObject({
            message: 'Step render failed',
            stack: 'Error: Step render failed\n    at render',
            type: 'wizard',
            stepId: 'step-1',
            cause: undefined
        });
        expect(typeof entry.ts).toBe('string');
        expect(getErrors()).toEqual([entry]);
    });

    test('logError deduplicates entries within the dedupe window', () => {
        const first = logError({
            message: 'Duplicate failure',
            stack: 'stack-trace'
        });

        expect(getErrors()).toHaveLength(1);

        jest.setSystemTime(new Date('2024-01-01T00:00:02.000Z'));
        const second = logError({
            message: 'Duplicate failure',
            stack: 'stack-trace'
        });

        expect(second).toBe(first);
        expect(getErrors()).toEqual([first]);

        jest.setSystemTime(new Date('2024-01-01T00:00:08.000Z'));
        const third = logError({
            message: 'Duplicate failure',
            stack: 'stack-trace'
        });

        expect(third).not.toBe(first);
        expect(getErrors()).toEqual([first, third]);
    });
});
