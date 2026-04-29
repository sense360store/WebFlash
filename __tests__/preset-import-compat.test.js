import { jest } from '@jest/globals';

const upsertPresetByNameMock = jest.fn();
const applyPresetStateToWizardMock = jest.fn();
const markPresetAppliedMock = jest.fn();

async function loadStateSummaryModule() {
  jest.unstable_mockModule('../scripts/utils/channel-alias.js', () => ({ DEFAULT_CHANNEL_KEY: 'stable', normalizeChannelKey: jest.fn(() => 'stable') }));
  jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({ copyTextToClipboard: jest.fn() }));
  jest.unstable_mockModule('../scripts/data/module-requirements.js', () => ({ getModuleVariantEntry: jest.fn(() => null) }));
  jest.unstable_mockModule('../scripts/layout/qr-code-modal.js', () => ({ openQRCodeModal: jest.fn() }));
  jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({ downloadJsonFile: jest.fn() }));

  jest.unstable_mockModule('../scripts/utils/preset-storage.js', () => ({
    listPresets: jest.fn(() => ({ ok: true, data: [] })),
    getPreset: jest.fn(),
    savePreset: jest.fn(),
    upsertPresetByName: upsertPresetByNameMock,
    renamePreset: jest.fn(() => ({ ok: true })),
    deletePreset: jest.fn(() => ({ ok: true })),
    markPresetApplied: markPresetAppliedMock,
    generatePresetName: jest.fn(() => 'Preset'),
    normalizePresetName: jest.fn(name => name),
    getCurrentWizardStep: jest.fn(() => 1),
    applyPresetStateToWizard: applyPresetStateToWizardMock,
    PRESET_STORAGE_OPTIONS: { storageKey: 'wizard-presets' },
    serializePresetConfig: jest.fn(),
    deserializePresetConfig: jest.fn(payload => ({ ok: true, data: payload?.preset ?? null, metadata: { notices: [] } })),
    validatePresetName: jest.fn(() => ({ valid: true, message: '', normalized: '' }))
  }));

  return import('../scripts/layout/state-summary.js');
}

function renderShell() {
  document.body.innerHTML = `
    <input type="radio" name="mounting" value="wall" checked>
    <input type="radio" name="power" value="usb" checked>
    <section id="preset-manager">
      <p data-preset-error hidden></p>
      <form data-preset-form><input data-preset-name /><button data-preset-save type="submit">Save</button></form>
      <p data-preset-empty></p>
      <ul data-preset-list></ul>
    </section>
  `;
}

describe('preset import hardware compatibility', () => {
  beforeAll(async () => {
    jest.resetModules();
    renderShell();
    await loadStateSummaryModule();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    upsertPresetByNameMock.mockReturnValue({ ok: true, data: { id: 'p1', state: { mount: 'wall', power: 'usb' } } });
    markPresetAppliedMock.mockReturnValue({ ok: true });
  });

  test.each([
    {
      name: 'compatible target proceeds to save/apply',
      hardwareTarget: 'sense360-wall-usb',
      confirmReturn: true,
      expectConfirm: false,
      expectSaved: true,
      expectApplied: true,
      expectErrorContains: ''
    },
    {
      name: 'core voice import downgrades with non-blocking notice',
      hardwareTarget: 'sense360-wall-usb',
      confirmReturn: true,
      expectConfirm: false,
      expectSaved: true,
      expectApplied: true,
      expectErrorContains: ''
    },
    {
      name: 'warning target requires confirmation before save/apply',
      hardwareTarget: 'otherfamily-wall-usb',
      confirmReturn: false,
      expectConfirm: true,
      expectSaved: false,
      expectApplied: false,
      expectErrorContains: 'confirmation required'
    },
    {
      name: 'blocking target prevents save/apply',
      hardwareTarget: 'sense360-ceiling-poe',
      confirmReturn: true,
      expectConfirm: false,
      expectSaved: false,
      expectApplied: false,
      expectErrorContains: 'Import blocked'
    }
  ])('$name', async ({ hardwareTarget, confirmReturn, expectConfirm, expectSaved, expectApplied, expectErrorContains }) => {
    window.confirm = jest.fn(() => confirmReturn);
    const input = document.querySelector('[data-preset-import-input]');
    const payload = {
      schemaVersion: 1,
      hardwareTarget,
      preset: name.includes('core voice')
        ? { name: 'Import', state: { mount: 'wall', power: 'usb', voice: 'base' }, configuration: { mounting: 'wall', power: 'usb', voice: 'base' } }
        : { name: 'Import', state: { mount: 'wall', power: 'usb' }, configuration: { mounting: 'wall', power: 'usb' } }
    };

    if (name.includes('core voice')) {
      const { deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');
      deserializePresetConfig.mockReturnValueOnce({
        ok: true,
        data: { name: 'Import', state: { mount: 'wall', power: 'usb', voice: 'none' }, configuration: { mounting: 'wall', power: 'usb', voice: 'none' }, meta: {} },
        metadata: { notices: ['Core Voice is coming soon and was downgraded to Core.'] }
      });
    }

    Object.defineProperty(input, 'files', { value: [{ text: async () => JSON.stringify(payload) }], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    if (expectConfirm) {
      expect(window.confirm).toHaveBeenCalled();
    } else {
      expect(window.confirm).not.toHaveBeenCalled();
    }

    if (expectSaved) {
      expect(upsertPresetByNameMock).toHaveBeenCalled();
    } else {
      expect(upsertPresetByNameMock).not.toHaveBeenCalled();
    }

    if (expectApplied) {
      expect(applyPresetStateToWizardMock).toHaveBeenCalled();
    } else {
      expect(applyPresetStateToWizardMock).not.toHaveBeenCalled();
    }

    const errorText = document.querySelector('[data-preset-error]').textContent;
    if (expectErrorContains) {
      expect(errorText).toContain(expectErrorContains);
    } else {
      expect(errorText).toBe('');
    }

    if (name.includes('core voice')) {
      expect(document.querySelector('[data-preset-import-diagnostics]').textContent).toContain('Core Voice is coming soon and was downgraded to Core.');
    }
  });
});
