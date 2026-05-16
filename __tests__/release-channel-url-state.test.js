/**
 * URL state and shareable-link tests for the release-channel surface.
 *
 * The hardened gates require that:
 *   - shareable links preserve the user-selected mode (so the recipient
 *     reaches the same firmware tier they were intended to see), but
 *   - shareable links must NEVER carry channel acknowledgements, so a
 *     beta/preview/development risk acceptance never auto-replays for
 *     someone opening the URL.
 */

import { jest } from '@jest/globals';

function renderDom() {
    document.body.innerHTML = `
    <div id="browser-warning"></div>
    <div class="progress-step" data-step="1"></div>
    <div class="progress-step" data-step="2"></div>
    <div class="progress-step" data-step="3"></div>
    <div class="progress-step" data-step="4"></div>
    <div class="progress-step" data-step="5"></div>
    <div id="step-1" class="wizard-step"><button class="btn-next" data-next>Next</button></div>
    <div id="step-2" class="wizard-step"><button class="btn-next" data-next>Next</button>
      <input type="radio" name="mounting" value="ceiling" checked>
    </div>
    <div id="step-3" class="wizard-step"><button class="btn-next" data-next>Next</button>
      <input type="radio" name="power" value="usb" checked>
    </div>
    <div id="step-4" class="wizard-step"></div>
    <div id="step-5" class="wizard-step">
      <div class="secondary-action-group"><p data-ready-helper></p></div>
      <div class="firmware-selector" id="firmware-selector"><select id="firmware-version-select"></select></div>
      <div id="compatible-firmware"><p data-ready-helper></p></div>
      <section data-channel-acknowledgement-panel hidden aria-hidden="true"></section>
      <button data-module-summary-install></button>
      <button id="download-btn"></button>
      <button id="copy-firmware-url-btn"></button>
      <label class="pre-flash-checklist__acknowledgement"><input type="checkbox" data-preflash-acknowledge></label>
    </div>`;
}

describe('release-channel URL preservation', () => {
    beforeEach(() => {
        jest.resetModules();
        renderDom();
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ builds: [] })
        }));
        Object.defineProperty(global.navigator, 'serial', {
            value: { getPorts: jest.fn(() => Promise.resolve([])) },
            configurable: true
        });
    });

    test('?mode=development survives same-session navigation', async () => {
        const { setState, getDefaultState } = await import('../scripts/state.js');
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('development');

        // setState writes the URL via updateUrlFromConfiguration.
        setState({ ...getDefaultState(), mounting: 'ceiling', power: 'usb' });

        const search = new URLSearchParams(window.location.search);
        expect(search.get('mode')).toBe('development');
    });

    test('?mode=recovery survives same-session navigation', async () => {
        const { setState, getDefaultState } = await import('../scripts/state.js');
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('recovery');

        setState({ ...getDefaultState(), mounting: 'ceiling', power: 'usb' });

        const search = new URLSearchParams(window.location.search);
        expect(search.get('mode')).toBe('recovery');
    });

    test('normal mode does not emit a mode parameter', async () => {
        const { setState, getDefaultState } = await import('../scripts/state.js');
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('normal');

        setState({ ...getDefaultState(), mounting: 'ceiling', power: 'usb' });

        const search = new URLSearchParams(window.location.search);
        expect(search.has('mode')).toBe(false);
    });

    test('invalid ?mode=foo is dropped and never echoed back to the URL', async () => {
        // Simulate the page being loaded with an invalid mode by setting it
        // explicitly via the test hook. The reducer canonicalises invalid
        // input back to 'normal', so the URL update must NOT round-trip the
        // bad value.
        window.history.replaceState(null, '', '/?mode=foobar');
        const { setState, getDefaultState } = await import('../scripts/state.js');
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('foobar');
        expect(__testHooks.getReleaseMode()).toBe('normal');

        setState({ ...getDefaultState(), mounting: 'ceiling', power: 'usb' });

        const search = new URLSearchParams(window.location.search);
        expect(search.get('mode')).toBeNull();
    });

    test('shareable link URL never carries acknowledgement state', async () => {
        const { setState, getDefaultState } = await import('../scripts/state.js');
        const { __testHooks } = await import('../scripts/state.js');
        __testHooks.setReleaseModeForTests('normal');
        // Acknowledge a hypothetical beta gate; this state must NOT leak
        // into the URL at any point.
        __testHooks.setChannelAcknowledgement('channel:beta', true);

        setState({ ...getDefaultState(), mounting: 'ceiling', power: 'usb' });

        const search = window.location.search;
        expect(search).not.toMatch(/acknowledg/i);
        expect(search).not.toMatch(/channel/i);
        expect(search).not.toMatch(/(^|[?&])ack=/i);
    });
});
