import { jest } from '@jest/globals';

describe('preset export JSON', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('serializer exports expected schema with metadata', async () => {
    const { serializePresetConfig } = await import('../scripts/utils/preset-storage.js');

    const payload = serializePresetConfig({
      id: 'preset-1',
      name: 'Wall USB',
      state: { mount: 'wall', power: 'usb', airiq: 'base', presence: 'none', comfort: 'none', fan: 'none' },
      configuration: { mounting: 'wall', power: 'usb', airiq: 'base', presence: 'none', comfort: 'none', fan: 'none' },
      createdAt: 10,
      updatedAt: 20,
      appliedAt: null,
      meta: { currentStep: 2 }
    });

    expect(payload).toMatchInlineSnapshot(`
{
  "hardwareTarget": "sense360-wall-usb",
  "preset": {
    "appliedAt": null,
    "configuration": {
      "airiq": "base",
      "comfort": "none",
      "fan": "none",
      "mounting": "wall",
      "power": "usb",
      "presence": "none",
    },
    "createdAt": 10,
    "id": "preset-1",
    "meta": {
      "currentStep": 2,
    },
    "name": "Wall USB",
    "state": {
      "airiq": "base",
      "comfort": "none",
      "fan": "none",
      "mount": "wall",
      "power": "usb",
      "presence": "none",
    },
    "updatedAt": 20,
  },
  "schemaVersion": 1,
}
`);
  });

  test('returns structured validation result for malformed payload', async () => {
    const { deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');

    expect(deserializePresetConfig(null)).toEqual({
      ok: false,
      code: 'invalid_payload_shape',
      message: 'Import payload must be an object.',
      fieldErrors: [{ path: '', message: 'Expected a JSON object payload.' }]
    });
  });

  test('returns field errors for missing required keys', async () => {
    const { validatePresetImportPayload } = await import('../scripts/utils/preset-storage.js');

    const result = validatePresetImportPayload({ schemaVersion: 1 });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('missing_required_keys');
    expect(result.fieldErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'hardwareTarget' }),
      expect.objectContaining({ path: 'preset' })
    ]));
  });

  test('returns field errors for invalid enum values', async () => {
    const { validatePresetImportPayload } = await import('../scripts/utils/preset-storage.js');

    const result = validatePresetImportPayload({
      schemaVersion: 1,
      hardwareTarget: 'sense360-wall-usb',
      preset: {
        id: 'preset-3',
        name: 'Invalid enums',
        state: { mount: 'desk', power: 'battery' },
        configuration: { mounting: 'floor', power: 'magic' }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'preset.state.mount' }),
      expect.objectContaining({ path: 'preset.state.power' }),
      expect.objectContaining({ path: 'preset.configuration.mounting' }),
      expect.objectContaining({ path: 'preset.configuration.power' })
    ]));
  });

  test('exported payload round-trips to equivalent preset', async () => {
    const { serializePresetConfig, deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');

    const source = {
      id: 'preset-2',
      name: 'Ceiling PoE',
      state: { mount: 'ceiling', power: 'poe', airiq: 'pro', presence: 'base', comfort: 'base', fan: 'pwm', currentStep: 3 },
      configuration: { mounting: 'ceiling', power: 'poe', airiq: 'pro', presence: 'base', comfort: 'base', fan: 'pwm' },
      createdAt: 11,
      updatedAt: 22,
      appliedAt: 33,
      meta: { currentStep: 3 }
    };

    const payload = serializePresetConfig(source);
    const imported = deserializePresetConfig(payload);

    expect(imported).toEqual({
      ok: true,
      data: {
        ...source,
        state: { ...source.state, fan: 'none' },
        configuration: { ...source.configuration, fan: 'none' }
      },
      metadata: {
        schemaVersion: 1,
        hardwareTarget: 'sense360-ceiling-poe'
      }
    });
  });
});
