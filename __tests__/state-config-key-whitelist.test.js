/**
 * @jest-environment jsdom
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import { getState, setState, replaceState } from '../scripts/state.js';

describe('configuration key whitelist (applyConfiguration hardening)', () => {
    beforeEach(() => {
        // Reset to a known ceiling/PoE baseline between cases.
        replaceState({ mounting: 'ceiling', power: 'poe' });
    });

    test('drops unsupported keys instead of copying them into state', () => {
        setState({ mounting: 'ceiling', power: 'poe', bathroomairiq: 'ventiq', bogusKey: 'x' });
        const state = getState();
        expect('bathroomairiq' in state).toBe(false);
        expect('bogusKey' in state).toBe(false);
    });

    test('does not pollute the prototype via a __proto__ own-key', () => {
        // A JSON.parse-derived object can carry a __proto__ own-property; the
        // whitelist must refuse it before the Object.assign [[Set]] path.
        const payload = JSON.parse('{"mounting":"ceiling","power":"poe","__proto__":{"polluted":true}}');
        setState(payload);
        expect(({}).polluted).toBeUndefined();
        expect(getState().polluted).toBeUndefined();
    });

    test('preserves supported keys (whitelist does not over-filter)', () => {
        // Module keys are re-derived from DOM inputs by updateConfiguration,
        // which are absent in a bare jsdom, so assert on mounting/power which
        // the whitelist must pass straight through.
        setState({ mounting: 'ceiling', power: 'poe' });
        const state = getState();
        expect(state.mounting).toBe('ceiling');
        expect(state.power).toBe('poe');
    });
});
