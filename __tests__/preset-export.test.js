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
      state: { mount: 'wall', power: 'usb', airiq: 'airiq', fan: 'none', voice: 'none' },
      configuration: { mounting: 'wall', power: 'usb', airiq: 'airiq', fan: 'none', voice: 'none' },
      createdAt: 10,
      updatedAt: 20,
      appliedAt: null,
      meta: { currentStep: 2 }
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      hardwareTarget: 'sense360-wall-usb',
      preset: {
        id: 'preset-1',
        name: 'Wall USB',
        state: { mount: 'wall', power: 'usb', airiq: 'airiq', fan: 'none', voice: 'none' },
        configuration: { mounting: 'wall', power: 'usb', airiq: 'airiq', fan: 'none', voice: 'none' },
        createdAt: 10,
        updatedAt: 20,
        appliedAt: null,
        meta: { currentStep: 2 }
      }
    });
  });

  test('serializer allows overriding schema version with numeric value', async () => {
    const { serializePresetConfig } = await import('../scripts/utils/preset-storage.js');

    const preset = {
      id: 'preset-v2',
      name: 'Wall USB v2',
      state: { mount: 'wall', power: 'usb', airiq: 'airiq', fan: 'pwm', voice: 'none' },
      configuration: { mounting: 'wall', power: 'usb', airiq: 'airiq', fan: 'pwm', voice: 'none' },
      createdAt: 100,
      updatedAt: 200,
      appliedAt: null,
      meta: { currentStep: 2 }
    };

    const payload = serializePresetConfig(preset, { schemaVersion: 2 });

    expect(payload).toEqual({
      schemaVersion: 2,
      hardwareTarget: 'sense360-wall-usb',
      preset: {
        ...preset,
        state: { ...preset.state, fan: 'pwm' },
        configuration: { ...preset.configuration, fan: 'pwm' }
      }
    });
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

  test('deserializer accepts unknown numeric schema version and preserves metadata', async () => {
    const { deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');

    const payload = {
      schemaVersion: 999,
      hardwareTarget: 'sense360-wall-usb',
      preset: {
        id: 'preset-future',
        name: 'Future Schema',
        state: { mount: 'wall', power: 'usb', airiq: 'airiq', fan: 'analog', voice: 'none' },
        configuration: { mounting: 'wall', power: 'usb', airiq: 'airiq', fan: 'analog', voice: 'none' },
        createdAt: 1,
        updatedAt: 2,
        appliedAt: null
      }
    };

    const result = deserializePresetConfig(payload);

    expect(result.ok).toBe(true);
    expect(result.metadata).toEqual({
      schemaVersion: 999,
      hardwareTarget: 'sense360-wall-usb',
      notices: []
    });
  });

  test('validator returns field error for non-numeric schema version', async () => {
    const { validatePresetImportPayload } = await import('../scripts/utils/preset-storage.js');

    const result = validatePresetImportPayload({
      schemaVersion: '1',
      hardwareTarget: 'sense360-wall-usb',
      preset: {
        id: 'preset-bad-schema',
        name: 'Bad Schema',
        state: { mount: 'wall', power: 'usb' },
        configuration: { mounting: 'wall', power: 'usb' }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'schemaVersion' })
    ]));
  });

  test('exported payload round-trips to equivalent preset', async () => {
    const { serializePresetConfig, deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');

    const source = {
      id: 'preset-2',
      name: 'Ceiling PoE',
      state: { mount: 'ceiling', power: 'poe', airiq: 'ventiq', fan: 'pwm', voice: 'none', currentStep: 3 },
      configuration: { mounting: 'ceiling', power: 'poe', airiq: 'ventiq', fan: 'pwm', voice: 'none' },
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
        hardwareTarget: 'sense360-ceiling-poe',
        notices: []
      }
    });
  });

  test.each([
    {
      name: 'mixed-case + whitespace enum values normalize, optional modules default to none, and step clamps high',
      input: {
        schemaVersion: 1,
        hardwareTarget: 'sense360-wall-usb',
        preset: {
          id: 'fixture-1',
          name: ' Fixture 1 ',
          state: { mount: ' Wall ', power: 'USB', currentStep: 99 },
          configuration: { mounting: ' Wall ', power: 'USB' },
          meta: { currentStep: 99 }
        }
      },
      expected: {
        state: { mount: 'wall', power: 'usb', airiq: 'none', fan: 'none', voice: 'none', currentStep: 4 },
        configuration: { mounting: 'wall', power: 'usb', airiq: 'none', fan: 'none', voice: 'none' },
        meta: { currentStep: 4 }
      }
    },
    {
      name: 'currentStep clamps low bound to 1',
      input: {
        schemaVersion: 1,
        hardwareTarget: 'sense360-wall-usb',
        preset: {
          id: 'fixture-2',
          name: 'Fixture 2',
          state: { mount: 'wall', power: 'usb', currentStep: 0 },
          configuration: { mounting: 'wall', power: 'usb' },
          meta: { currentStep: -5 }
        }
      },
      expected: {
        state: { mount: 'wall', power: 'usb', airiq: 'none', fan: 'none', voice: 'none', currentStep: 1 },
        configuration: { mounting: 'wall', power: 'usb', airiq: 'none', fan: 'none', voice: 'none' },
        meta: { currentStep: 1 }
      }
    }
  ])('normalize-on-import regression: $name', async ({ input, expected }) => {
    const { deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');
    const result = deserializePresetConfig(input);

    expect(result.ok).toBe(true);
    expect(result.data.state).toEqual(expected.state);
    expect(result.data.configuration).toEqual(expected.configuration);
    expect(result.data.meta).toEqual(expected.meta);
  });

  test.each([
    {
      name: 'fan pwm gets coerced to none on ceiling mount in state/configuration',
      input: {
        schemaVersion: 1,
        hardwareTarget: 'sense360-ceiling-poe',
        preset: {
          id: 'fixture-fan-1',
          name: 'Ceiling PWM',
          state: { mount: 'ceiling', power: 'poe', fan: 'pwm' },
          configuration: { mounting: 'ceiling', power: 'poe', fan: 'pwm' }
        }
      }
    }
  ])('fan coercion regression: $name', async ({ input }) => {
    const { deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');
    const result = deserializePresetConfig(input);

    expect(result.ok).toBe(true);
    expect(result.data.state.fan).toBe('none');
    expect(result.data.configuration.fan).toBe('none');
  });

  test.each([
    {
      name: 'negative timestamps normalize to fallback/null',
      input: {
        schemaVersion: 1,
        hardwareTarget: 'sense360-wall-usb',
        preset: {
          id: 'fixture-ts-neg',
          name: 'Negative TS',
          state: { mount: 'wall', power: 'usb' },
          configuration: { mounting: 'wall', power: 'usb' },
          createdAt: -1,
          updatedAt: -2,
          appliedAt: -3
        }
      },
      expected: { createdAt: null, updatedAt: 'number', appliedAt: null }
    },
    {
      name: 'non-finite timestamps normalize to fallback/null',
      input: {
        schemaVersion: 1,
        hardwareTarget: 'sense360-wall-usb',
        preset: {
          id: 'fixture-ts-nonfinite',
          name: 'Non Finite TS',
          state: { mount: 'wall', power: 'usb' },
          configuration: { mounting: 'wall', power: 'usb' },
          createdAt: Number.NaN,
          updatedAt: Number.POSITIVE_INFINITY,
          appliedAt: Number.NEGATIVE_INFINITY
        }
      },
      expected: { createdAt: null, updatedAt: 'number', appliedAt: null }
    }
  ])('timestamp normalization regression: $name', async ({ input, expected }) => {
    const { deserializePresetConfig } = await import('../scripts/utils/preset-storage.js');
    const result = deserializePresetConfig(input);

    expect(result.ok).toBe(true);
    if (expected.createdAt === null) {
      expect(result.data.createdAt).toBe(result.data.updatedAt);
    }
    if (expected.updatedAt === 'number') {
      expect(Number.isFinite(result.data.updatedAt)).toBe(true);
      expect(result.data.updatedAt).toBeGreaterThanOrEqual(0);
    }
    expect(result.data.appliedAt).toBe(expected.appliedAt);
  });
});
