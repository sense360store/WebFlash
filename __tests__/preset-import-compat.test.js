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
    deserializePresetConfig: jest.fn(payload => payload?.preset ?? null),
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

  test('blocks import when mount/power target is incompatible', async () => {
    const input = document.querySelector('[data-preset-import-input]');
    const payload = { schemaVersion: 1, hardwareTarget: 'sense360-ceiling-poe', preset: { name: 'Bad', state: { mount: 'wall', power: 'usb' }, configuration: { mounting: 'wall', power: 'usb' } } };
    Object.defineProperty(input, 'files', { value: [{ text: async () => JSON.stringify(payload) }], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();

    expect(upsertPresetByNameMock).not.toHaveBeenCalled();
    expect(applyPresetStateToWizardMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-preset-error]').textContent).toContain('Import blocked');
  });

  test('requires explicit acknowledgement for warning-level mismatch', async () => {
    window.confirm = jest.fn(() => false);
    const input = document.querySelector('[data-preset-import-input]');
    const payload = { schemaVersion: 1, hardwareTarget: 'otherfamily-wall-usb', preset: { name: 'Warn', state: { mount: 'wall', power: 'usb' }, configuration: { mounting: 'wall', power: 'usb' } } };
    Object.defineProperty(input, 'files', { value: [{ text: async () => JSON.stringify(payload) }], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();

    expect(window.confirm).toHaveBeenCalled();
    expect(upsertPresetByNameMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-preset-error]').textContent).toContain('confirmation required');
  });
});
