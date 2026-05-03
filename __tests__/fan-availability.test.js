import { jest } from '@jest/globals';

const minimalManifest = { builds: [] };

function renderWizardDom() {
    document.body.innerHTML = `
        <div id="step-1" class="wizard-step">
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="mounting" value="wall">
            <input type="radio" name="mounting" value="ceiling">
        </div>
        <div id="step-2" class="wizard-step" hidden></div>
        <div id="step-3" class="wizard-step" hidden>
            <button class="btn-next" data-next disabled>Next</button>
            <input type="radio" name="power" value="usb">
            <input type="radio" name="power" value="poe">
            <input type="radio" name="power" value="pwr">
        </div>
        <div id="step-4" class="wizard-step" hidden>
            <div id="module-availability-hint"></div>
            <section class="module-group" data-module-group="airiq" data-expanded="false">
                <label class="module-card option-card" data-module-card="airiq" data-variant="none">
                    <input type="radio" name="airiq" value="none" checked>
                    <div class="module-card__inner"></div>
                </label>
                <label class="module-card option-card" data-module-card="airiq" data-variant="airiq">
                    <input type="radio" name="airiq" value="airiq">
                    <div class="module-card__inner"></div>
                </label>
            </section>
            <section class="module-group" data-module-group="fan" id="fan-module-section" data-expanded="false">
                <label class="module-card option-card" data-module-card="fan" data-variant="none">
                    <input type="radio" name="fan" value="none" checked>
                    <div class="module-card__inner"></div>
                </label>
                <label class="module-card option-card" data-module-card="fan" data-variant="relay">
                    <input type="radio" name="fan" value="relay">
                    <div class="module-card__inner"></div>
                </label>
                <label class="module-card option-card" data-module-card="fan" data-variant="pwm">
                    <input type="radio" name="fan" value="pwm">
                    <div class="module-card__inner"></div>
                </label>
                <label class="module-card option-card" data-module-card="fan" data-variant="analog">
                    <input type="radio" name="fan" value="analog">
                    <div class="module-card__inner"></div>
                </label>
                <label class="module-card option-card" data-module-card="fan" data-variant="triac">
                    <input type="radio" name="fan" value="triac">
                    <div class="module-card__inner"></div>
                </label>
            </section>
            <section class="module-group" data-module-group="led" data-expanded="false">
                <label class="module-card option-card" data-module-card="led" data-variant="none">
                    <input type="radio" name="led" value="none" checked>
                    <div class="module-card__inner"></div>
                </label>
                <label class="module-card option-card" data-module-card="led" data-variant="airiq">
                    <input type="radio" name="led" value="airiq">
                    <div class="module-card__inner"></div>
                </label>
            </section>
            <input type="radio" name="voice" value="none" checked>
            <input type="radio" name="ventiq" value="none" checked>
        </div>
        <div id="step-5" class="wizard-step" hidden></div>
    `;
}

function injectStaleUnavailableState(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    const card = input?.closest('.option-card');
    if (!card) return;
    card.classList.add('is-unavailable');
    card.setAttribute('aria-disabled', 'true');
    card.setAttribute('title', 'stale unavailable message');
    const status = document.createElement('p');
    status.className = 'option-status';
    status.setAttribute('data-option-status', 'true');
    status.textContent = 'stale status text';
    status.style.display = 'block';
    card.querySelector('.module-card__inner').appendChild(status);
}

function inspectCard(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    const card = input?.closest('.option-card');
    return {
        unavailable: card?.classList.contains('is-unavailable') || false,
        ariaDisabled: card?.getAttribute('aria-disabled'),
        title: card?.getAttribute('title'),
        statusText: card?.querySelector('[data-option-status]')?.textContent || '',
        statusDisplay: card?.querySelector('[data-option-status]')?.style.display || ''
    };
}

beforeAll(() => {
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(minimalManifest)
    }));
});

beforeEach(() => {
    jest.resetModules();
    renderWizardDom();
});

test('fan PWM and analog options stay available on Ceiling+PWR', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();
    await stateModule.__testHooks.manifestReadyPromise();

    const ceilingInput = document.querySelector('input[name="mounting"][value="ceiling"]');
    ceilingInput.checked = true;
    ceilingInput.dispatchEvent(new Event('change', { bubbles: true }));

    const pwrInput = document.querySelector('input[name="power"][value="pwr"]');
    pwrInput.checked = true;
    pwrInput.dispatchEvent(new Event('change', { bubbles: true }));

    for (const value of ['none', 'relay', 'pwm', 'analog', 'triac']) {
        const inspection = inspectCard('fan', value);
        expect(inspection.unavailable).toBe(false);
        expect(inspection.title).toBeNull();
        expect(inspection.statusText).toBe('');
    }
});

test('updateConfiguration clears stale unavailable state on fan options', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();
    await stateModule.__testHooks.manifestReadyPromise();

    const ceilingInput = document.querySelector('input[name="mounting"][value="ceiling"]');
    ceilingInput.checked = true;
    ceilingInput.dispatchEvent(new Event('change', { bubbles: true }));

    const pwrInput = document.querySelector('input[name="power"][value="pwr"]');
    pwrInput.checked = true;
    pwrInput.dispatchEvent(new Event('change', { bubbles: true }));

    injectStaleUnavailableState('fan', 'pwm');
    injectStaleUnavailableState('fan', 'analog');

    expect(inspectCard('fan', 'pwm').unavailable).toBe(true);
    expect(inspectCard('fan', 'analog').unavailable).toBe(true);

    const fanRelay = document.querySelector('input[name="fan"][value="relay"]');
    fanRelay.checked = true;
    fanRelay.dispatchEvent(new Event('change', { bubbles: true }));

    for (const value of ['pwm', 'analog']) {
        const inspection = inspectCard('fan', value);
        expect(inspection.unavailable).toBe(false);
        expect(inspection.title).toBeNull();
        expect(inspection.statusText).toBe('');
        expect(inspection.statusDisplay).toBe('none');
    }
});

test('LED options stay available regardless of mounting and power', async () => {
    const stateModule = await import('../scripts/state.js');
    stateModule.__testHooks.initializeWizard();
    await stateModule.__testHooks.manifestReadyPromise();

    const ceilingInput = document.querySelector('input[name="mounting"][value="ceiling"]');
    ceilingInput.checked = true;
    ceilingInput.dispatchEvent(new Event('change', { bubbles: true }));

    const pwrInput = document.querySelector('input[name="power"][value="pwr"]');
    pwrInput.checked = true;
    pwrInput.dispatchEvent(new Event('change', { bubbles: true }));

    for (const value of ['none', 'airiq']) {
        const inspection = inspectCard('led', value);
        expect(inspection.unavailable).toBe(false);
        expect(inspection.statusText).toBe('');
    }
});

test('compatibilityNotes for fan variants do not surface as error messages', async () => {
    const moduleRequirements = await import('../scripts/data/module-requirements.js');
    const fanEntry = moduleRequirements.MODULE_REQUIREMENT_MATRIX.fan;

    for (const [variantKey, variant] of Object.entries(fanEntry.variants)) {
        if (Array.isArray(variant?.compatibilityNotes)) {
            throw new Error(
                `Fan variant "${variantKey}" defines compatibilityNotes; these surface as user-facing error ` +
                `messages on cards that should always be selectable. Use the conflicts matrix instead.`
            );
        }
    }
});

test('LED variants do not define compatibilityNotes', async () => {
    const moduleRequirements = await import('../scripts/data/module-requirements.js');
    const ledEntry = moduleRequirements.MODULE_REQUIREMENT_MATRIX.led;

    for (const [variantKey, variant] of Object.entries(ledEntry.variants)) {
        if (Array.isArray(variant?.compatibilityNotes)) {
            throw new Error(
                `LED variant "${variantKey}" defines compatibilityNotes; these surface as user-facing error ` +
                `messages on cards that should always be selectable. Use the conflicts matrix instead.`
            );
        }
    }
});
