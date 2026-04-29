import { jest } from '@jest/globals';

const listPresetsMock = jest.fn();
const getPresetMock = jest.fn();
const serializePresetConfigMock = jest.fn();
const downloadJsonFileMock = jest.fn();
const cachedPreset = { id: 'p1', name: 'Office Profile', state: { mount: 'wall' }, configuration: { mounting: 'wall' } };

async function loadStateSummaryModule() {
    jest.unstable_mockModule('../scripts/utils/channel-alias.js', () => ({
        normalizeChannelKey: jest.fn(() => 'stable')
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
        getPreset: getPresetMock,
        savePreset: jest.fn(),
        upsertPresetByName: jest.fn(),
        renamePreset: jest.fn(() => ({ ok: true })),
        deletePreset: jest.fn(() => ({ ok: true })),
        markPresetApplied: jest.fn(() => ({ ok: true })),
        generatePresetName: jest.fn(() => 'Preset'),
        normalizePresetName: jest.fn(name => name),
        getCurrentWizardStep: jest.fn(() => 1),
        applyPresetStateToWizard: jest.fn(),
        PRESET_STORAGE_OPTIONS: { storageKey: 'wizard-presets' },
        serializePresetConfig: serializePresetConfigMock
    }));
    jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({
        downloadJsonFile: downloadJsonFileMock
    }));

    return import('../scripts/layout/state-summary.js');
}

function renderPresetManagerShell() {
    document.body.innerHTML = `
        <section id="preset-manager">
            <p data-preset-error hidden></p>
            <form data-preset-form>
                <input data-preset-name />
                <button data-preset-save type="submit">Save</button>
            </form>
            <p data-preset-empty></p>
            <ul data-preset-list></ul>
        </section>
    `;
}

describe('state-summary preset export', () => {
    beforeAll(async () => {
        renderPresetManagerShell();
        document.querySelector('[data-preset-list]').innerHTML = '';
        const error = document.querySelector('[data-preset-error]');
        error.textContent = '';
        global.validatePresetName = jest.fn(() => ({ valid: true, message: '', normalized: '' }));
        listPresetsMock.mockReturnValue({ ok: true, data: [cachedPreset] });
        await loadStateSummaryModule();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        document.querySelector('[data-preset-list]').innerHTML = '';
        const error = document.querySelector('[data-preset-error]');
        error.textContent = '';
        listPresetsMock.mockReset();
        getPresetMock.mockReset();
        serializePresetConfigMock.mockReset();
        downloadJsonFileMock.mockReset();
    });

    test('exports using cached preset data from listPresets cache', async () => {
        getPresetMock.mockReturnValue({ ok: true, data: cachedPreset });
        serializePresetConfigMock.mockReturnValue({ schemaVersion: 1, hardwareTarget: 'webflash', preset: { id: 'p1' } });

        const list = document.querySelector('[data-preset-list]');
        list.innerHTML = '<li data-preset-id="p1"><button type="button" data-preset-action="export">Export JSON</button></li>';
        list.querySelector('[data-preset-action="export"]').click();

        expect(downloadJsonFileMock).toHaveBeenCalledTimes(1);
        const [filename, payload] = downloadJsonFileMock.mock.calls[0];
        expect(filename.endsWith('.config.json')).toBe(true);
        expect(payload).toMatchObject({ schemaVersion: 1, hardwareTarget: 'webflash', preset: { id: 'p1' } });
    });

    test('exports by loading preset via getPreset on cache miss', async () => {
        const preset = { id: 'external-id', name: 'Warehouse', state: {}, configuration: {} };
        listPresetsMock.mockReturnValue({ ok: true, data: [] });
        getPresetMock.mockReturnValue({ ok: true, data: preset });
        serializePresetConfigMock.mockReturnValue({ schemaVersion: 2, hardwareTarget: 'esp32', preset: { id: 'external-id' } });

        const list = document.querySelector('[data-preset-list]');
        list.innerHTML = '<li data-preset-id="external-id"><button type="button" data-preset-action="export">Export JSON</button></li>';
        list.querySelector('[data-preset-action="export"]').click();

        expect(getPresetMock).toHaveBeenCalledTimes(1);
        expect(downloadJsonFileMock).toHaveBeenCalledTimes(1);
        const [filename, payload] = downloadJsonFileMock.mock.calls[0];
        expect(filename.endsWith('.config.json')).toBe(true);
        expect(payload).toMatchObject({ schemaVersion: 2, hardwareTarget: 'esp32', preset: { id: 'external-id' } });
    });

    test('does not export and shows error when getPreset read fails', async () => {
        listPresetsMock.mockReturnValue({ ok: true, data: [] });
        getPresetMock.mockReturnValue({ ok: false, error: { code: 'read_failed' } });

        const list = document.querySelector('[data-preset-list]');
        list.innerHTML = '<li data-preset-id="missing-id"><button type="button" data-preset-action="export">Export JSON</button></li>';
        list.querySelector('[data-preset-action="export"]').click();

        expect(downloadJsonFileMock).not.toHaveBeenCalled();
        expect(document.querySelector('[data-preset-error]').textContent).toBe('Could not read preset from storage.');
    });
});
