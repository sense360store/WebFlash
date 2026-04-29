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
      ...source,
      state: { ...source.state, fan: 'none' },
      configuration: { ...source.configuration, fan: 'none' }
    });
  });
});
