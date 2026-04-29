/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

function renderWizardInputs() {
    document.body.innerHTML = `
        <section id="preset-manager">
            <p data-preset-error hidden></p>
            <form data-preset-form>
                <input data-preset-name type="text" />
                <button data-preset-save type="submit">Save</button>
            </form>
            <p data-preset-empty></p>
            <ul data-preset-list></ul>
        </section>

        <input type="radio" name="mounting" value="wall" checked>
        <input type="radio" name="power" value="usb" checked>
        <input type="radio" name="airiq" value="none" checked>
        <input type="radio" name="presence" value="none" checked>
        <input type="radio" name="comfort" value="none" checked>
        <input type="radio" name="fan" value="none" checked>
    `;
}

const listPresetsMock = jest.fn();
const savePresetMock = jest.fn();
const upsertPresetByNameMock = jest.fn();
const markPresetAppliedMock = jest.fn();

async function loadStateSummaryModule() {
    jest.unstable_mockModule('../scripts/utils/channel-alias.js', () => ({
        DEFAULT_CHANNEL_KEY: 'stable',
        normalizeChannelKey: jest.fn(value => value ?? 'stable')
    }));
    jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({
        copyTextToClipboard: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/data/module-requirements.js', () => ({
        getModuleVariantEntry: jest.fn(() => null)
    }));
    jest.unstable_mockModule('../scripts/layout/qr-code-modal.js', () => ({
        openQRCodeModal: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/utils/preset-storage.js', () => ({
        listPresets: listPresetsMock,
        getPreset: jest.fn(),
        savePreset: savePresetMock,
        upsertPresetByName: upsertPresetByNameMock,
        renamePreset: jest.fn(() => ({ ok: true })),
        deletePreset: jest.fn(() => ({ ok: true })),
        markPresetApplied: markPresetAppliedMock,
        generatePresetName: jest.fn(() => 'Preset 1'),
        normalizePresetName: jest.fn(name => String(name || '').trim().replace(/\s+/g, ' ')),
        getCurrentWizardStep: jest.fn(() => 2),
        applyPresetStateToWizard: jest.fn(),
        PRESET_STORAGE_OPTIONS: { storageKey: 'wizard-presets' },
        serializePresetConfig: jest.fn(),
        deserializePresetConfig: jest.fn(),
        validatePresetName: jest.fn(name => {
            const normalized = String(name || '').trim().replace(/\s+/g, ' ');
            return { valid: normalized.length >= 3 || normalized.length === 0, normalized, message: '' };
        })
    }));
    jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({
        downloadJsonFile: jest.fn()
    }));

    return import('../scripts/layout/state-summary.js');
}

describe('preset manager save flow', () => {
    beforeAll(async () => {
        renderWizardInputs();
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ builds: [] }) }));
        window.confirm = jest.fn(() => true);
        await loadStateSummaryModule();
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    beforeEach(() => {
        listPresetsMock.mockReset();
        savePresetMock.mockReset();
        upsertPresetByNameMock.mockReset();
        markPresetAppliedMock.mockReset();

        listPresetsMock.mockReturnValue([]);
        document.querySelector('[data-preset-name]').value = '';
        document.querySelector('[data-preset-error]').textContent = '';
    });

    test('save success marks preset as applied using returned save result object', () => {
        savePresetMock.mockReturnValue({ ok: true, data: { id: 'preset-1' } });
        listPresetsMock.mockReturnValue([]);

        const input = document.querySelector('[data-preset-name]');
        const form = document.querySelector('[data-preset-form]');
        input.value = 'Office Preset';

        expect(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))).not.toThrow();
        expect(savePresetMock).toHaveBeenCalledTimes(1);
        expect(markPresetAppliedMock).toHaveBeenCalledWith('preset-1', { storageKey: 'wizard-presets' });
    });

    test('storage failure shows error and does not call markPresetApplied', () => {
        savePresetMock.mockReturnValue({ ok: false, error: { code: 'write_failed' } });

        const input = document.querySelector('[data-preset-name]');
        const form = document.querySelector('[data-preset-form]');
        input.value = 'Warehouse Preset';

        expect(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))).not.toThrow();
        expect(markPresetAppliedMock).not.toHaveBeenCalled();
        expect(document.querySelector('[data-preset-error]').textContent).toBe('Could not save preset due to a storage error.');
    });
});
