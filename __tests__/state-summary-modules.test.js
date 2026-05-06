import { jest } from '@jest/globals';

async function loadStateSummaryModule() {
    jest.unstable_mockModule('../scripts/utils/channel-alias.js', () => ({
        DEFAULT_CHANNEL_KEY: 'stable',
        normalizeChannelKey: jest.fn(() => 'stable')
    }));
    jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({
        copyTextToClipboard: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/data/module-requirements.js', () => ({
        getModuleVariantEntry: jest.fn((moduleKey, variant) => {
            if (variant === 'roomiq') return { label: 'Sense360 RoomIQ' };
            if (variant === 'airiq') return { label: 'Sense360 AirIQ' };
            if (variant === 'ventiq') return { label: 'Sense360 VentIQ' };
            if (variant === 'led') return { label: 'Sense360 LED' };
            if (variant === 'relay') return { label: 'Sense360 Fan Relay' };
            return null;
        })
    }));
    jest.unstable_mockModule('../scripts/layout/qr-code-modal.js', () => ({
        openQRCodeModal: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/utils/preset-storage.js', () => ({
        listPresets: jest.fn(() => ({ ok: true, data: [] })),
        getPreset: jest.fn(),
        savePreset: jest.fn(),
        upsertPresetByName: jest.fn(),
        renamePreset: jest.fn(() => ({ ok: true })),
        deletePreset: jest.fn(() => ({ ok: true })),
        markPresetApplied: jest.fn(() => ({ ok: true })),
        generatePresetName: jest.fn(() => 'Preset'),
        normalizePresetName: jest.fn(name => name),
        getCurrentWizardStep: jest.fn(() => 4),
        applyPresetStateToWizard: jest.fn(),
        PRESET_STORAGE_OPTIONS: { storageKey: 'wizard-presets' },
        serializePresetConfig: jest.fn(),
        deserializePresetConfig: jest.fn(),
        validatePresetName: jest.fn(() => ({ valid: true, message: '', normalized: '' }))
    }));
    jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({
        downloadJsonFile: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/compat-config.js', () => ({
        verifyImportedPresetCompatibility: jest.fn(() => ({ level: 'compatible', messages: [] }))
    }));

    return import('../scripts/layout/state-summary.js');
}

function renderWizardShell({ bathroomChecked = false, selections = {} } = {}) {
    const radios = (name, values, selectedValue) => values
        .map(v => `<input type="radio" name="${name}" value="${v}"${v === selectedValue ? ' checked' : ''}>`)
        .join('');

    document.body.innerHTML = `
        <input type="hidden" name="mounting" value="${selections.mounting ?? 'ceiling'}">
        <div>${radios('power', ['usb', 'poe', 'pwr'], selections.power ?? 'usb')}</div>
        <div>${radios('voice', ['none'], 'none')}</div>
        <div>${radios('roomiq', ['none', 'roomiq'], selections.roomiq ?? 'none')}</div>
        <div>${radios('airiq', ['none', 'airiq'], selections.airiq ?? 'none')}</div>
        <div>${radios('ventiq', ['none', 'ventiq'], selections.ventiq ?? 'none')}</div>
        <div>${radios('fan', ['none', 'relay', 'pwm', 'analog', 'triac'], selections.fan ?? 'none')}</div>
        <div>${radios('led', ['none', 'led'], selections.led ?? 'none')}</div>
        <input type="checkbox" name="bathroom"${bathroomChecked ? ' checked' : ''}>
        <aside data-module-summary data-module-summary-variant="module">
            <div data-module-summary-list role="list"></div>
            <p data-module-summary-warning hidden></p>
        </aside>
    `;
}

async function flushScheduledRender() {
    document.body.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => queueMicrotask(resolve));
    await new Promise(resolve => setTimeout(resolve, 0));
}

function getRowLabels() {
    const list = document.querySelector('[data-module-summary-list]');
    return Array.from(list.querySelectorAll('.module-summary-card__item-label')).map(el => el.textContent.trim());
}

function getRowValues() {
    const list = document.querySelector('[data-module-summary-list]');
    return Array.from(list.querySelectorAll('.module-summary-card__item')).map(item => {
        const label = item.querySelector('.module-summary-card__item-label')?.textContent.trim();
        const value = item.querySelector('.module-summary-card__item-value')?.textContent.trim();
        return [label, value];
    });
}

describe('state-summary module rows', () => {
    beforeAll(async () => {
        renderWizardShell();
        await loadStateSummaryModule();
    });

    test('renders RoomIQ, AirIQ, Fan, and LED Ring rows when not in bathroom mode', async () => {
        renderWizardShell({
            bathroomChecked: false,
            selections: { roomiq: 'roomiq', airiq: 'airiq', fan: 'relay', led: 'led' }
        });
        await flushScheduledRender();

        const labels = getRowLabels();
        expect(labels).toEqual(expect.arrayContaining(['RoomIQ', 'AirIQ', 'Fan', 'LED Ring']));
        expect(labels).not.toContain('VentIQ');
    });

    test('swaps AirIQ for VentIQ when bathroom toggle is on', async () => {
        renderWizardShell({
            bathroomChecked: true,
            selections: { roomiq: 'roomiq', ventiq: 'ventiq', fan: 'relay', led: 'led' }
        });
        await flushScheduledRender();

        const labels = getRowLabels();
        expect(labels).toContain('VentIQ');
        expect(labels).not.toContain('AirIQ');
    });

    test('shows the resolved variant label for each selected module', async () => {
        renderWizardShell({
            bathroomChecked: false,
            selections: { roomiq: 'roomiq', airiq: 'airiq', fan: 'relay', led: 'led' }
        });
        await flushScheduledRender();

        const rows = Object.fromEntries(getRowValues());
        expect(rows.RoomIQ).toBe('Sense360 RoomIQ');
        expect(rows.AirIQ).toBe('Sense360 AirIQ');
        expect(rows['LED Ring']).toBe('Sense360 LED');
        expect(rows.Fan).toBe('Sense360 Fan Relay');
    });

    test('renders None for unselected modules instead of hiding them', async () => {
        renderWizardShell({
            bathroomChecked: false,
            selections: {}
        });
        await flushScheduledRender();

        const rows = Object.fromEntries(getRowValues());
        expect(rows.RoomIQ).toBe('None');
        expect(rows.AirIQ).toBe('None');
        expect(rows['LED Ring']).toBe('None');
        expect(rows.Fan).toBe('None');
    });
});
