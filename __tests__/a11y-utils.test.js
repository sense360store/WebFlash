/**
 * Unit tests for the shared accessibility helpers
 * (scripts/utils/a11y.js).
 */
import { describe, beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import {
    getFocusableElements,
    trapFocus,
    restoreFocus,
    announce,
    __testHooks
} from '../scripts/utils/a11y.js';

describe('a11y utils', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        const live = document.getElementById(__testHooks.LIVE_REGION_ID);
        const alert = document.getElementById(__testHooks.ALERT_REGION_ID);
        live?.remove();
        alert?.remove();
    });

    describe('getFocusableElements', () => {
        test('returns focusable elements in document order', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <button id="b1">one</button>
                <a href="#">link</a>
                <input id="i1" />
                <button id="b2" disabled>disabled</button>
                <input type="hidden" />
                <div tabindex="0" id="d1">div</div>
                <div tabindex="-1">excluded</div>
            `;
            document.body.appendChild(container);

            const ids = getFocusableElements(container).map(el => el.id || el.tagName.toLowerCase());
            expect(ids).toEqual(['b1', 'a', 'i1', 'd1']);
        });

        test('skips elements inside hidden ancestors', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <div hidden><button id="hidden-btn">x</button></div>
                <button id="visible-btn">y</button>
            `;
            document.body.appendChild(container);
            const ids = getFocusableElements(container).map(el => el.id);
            expect(ids).toEqual(['visible-btn']);
        });

        test('returns an empty array for null/undefined containers', () => {
            expect(getFocusableElements(null)).toEqual([]);
            expect(getFocusableElements(undefined)).toEqual([]);
        });
    });

    describe('trapFocus', () => {
        test('Tab from the last focusable wraps back to the first', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <button id="first">one</button>
                <button id="middle">two</button>
                <button id="last">three</button>
            `;
            document.body.appendChild(container);

            const detach = trapFocus(container);
            const last = container.querySelector('#last');
            const first = container.querySelector('#first');
            last.focus();

            const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            container.dispatchEvent(event);

            expect(document.activeElement).toBe(first);
            detach();
        });

        test('Shift+Tab from the first focusable wraps to the last', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <button id="first">one</button>
                <button id="last">two</button>
            `;
            document.body.appendChild(container);

            const detach = trapFocus(container);
            const first = container.querySelector('#first');
            const last = container.querySelector('#last');
            first.focus();

            const event = new KeyboardEvent('keydown', {
                key: 'Tab',
                shiftKey: true,
                bubbles: true,
                cancelable: true
            });
            container.dispatchEvent(event);

            expect(document.activeElement).toBe(last);
            detach();
        });

        test('detach function removes the keydown listener', () => {
            const container = document.createElement('div');
            container.innerHTML = '<button id="a">a</button><button id="b">b</button>';
            document.body.appendChild(container);

            const detach = trapFocus(container);
            detach();

            const b = container.querySelector('#b');
            b.focus();
            container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
            expect(document.activeElement).toBe(b);
        });
    });

    describe('restoreFocus', () => {
        test('restores focus to a connected element', () => {
            const trigger = document.createElement('button');
            document.body.appendChild(trigger);
            const other = document.createElement('button');
            document.body.appendChild(other);
            other.focus();

            restoreFocus(trigger);
            expect(document.activeElement).toBe(trigger);
        });

        test('is a no-op when the element is detached or null', () => {
            const detached = document.createElement('button');
            const other = document.createElement('button');
            document.body.appendChild(other);
            other.focus();

            restoreFocus(detached);
            restoreFocus(null);
            restoreFocus(undefined);

            expect(document.activeElement).toBe(other);
        });
    });

    describe('announce', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });

        test('updates the polite live region', () => {
            announce('Hello world');
            jest.runAllTimers();

            const region = document.getElementById(__testHooks.LIVE_REGION_ID);
            expect(region).not.toBeNull();
            expect(region.getAttribute('role')).toBe('status');
            expect(region.getAttribute('aria-live')).toBe('polite');
            expect(region.textContent).toBe('Hello world');
        });

        test('uses the alert region when assertive=true', () => {
            announce('Critical', { assertive: true });
            jest.runAllTimers();

            const alert = document.getElementById(__testHooks.ALERT_REGION_ID);
            expect(alert).not.toBeNull();
            expect(alert.getAttribute('role')).toBe('alert');
            expect(alert.getAttribute('aria-live')).toBe('assertive');
            expect(alert.textContent).toBe('Critical');
        });

        test('ignores empty messages', () => {
            announce('');
            announce(null);
            announce(undefined);
            jest.runAllTimers();

            expect(document.getElementById(__testHooks.LIVE_REGION_ID)).toBeNull();
            expect(document.getElementById(__testHooks.ALERT_REGION_ID)).toBeNull();
        });
    });
});
