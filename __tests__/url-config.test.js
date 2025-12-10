import { describe, expect, test } from '@jest/globals';
import { mapToWizardConfiguration, parseConfigParams } from '../scripts/utils/url-config.js';

describe('config URL parser', () => {
  test('parses valid configuration including AC power and fan base', () => {
    const params = new URLSearchParams('mount=wall&power=ac&fan=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Wall-PWR-FanPWM');
    expect(result.sanitizedConfig.mount).toBe('wall');
    expect(result.sanitizedConfig.power).toBe('pwr');
    expect(result.sanitizedConfig.fan).toBe('pwm');

    const wizardConfig = mapToWizardConfiguration(result.sanitizedConfig);
    expect(wizardConfig).toMatchObject({ mounting: 'wall', power: 'pwr', fan: 'pwm' });
  });

  test('marks missing required parameters', () => {
    const params = new URLSearchParams('airiq=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'mount', type: 'missing' }),
        expect.objectContaining({ field: 'power', type: 'missing' })
      ])
    );
  });

  test('allows fan selection with ceiling mount', () => {
    const params = new URLSearchParams('mount=ceiling&power=usb&fan=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.forcedFanNone).toBe(false);
    expect(result.sanitizedConfig.fan).toBe('pwm');
    expect(result.configKey).toBe('Ceiling-USB-FanPWM');
  });

  test('supports legacy power alias', () => {
    const params = new URLSearchParams('mount=wall&power=pwr');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.configKey).toBe('Wall-PWR');
    expect(result.sanitizedConfig.power).toBe('pwr');
  });

  test('parses analog fan selection', () => {
    const params = new URLSearchParams('mount=wall&power=usb&fan=analog');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Wall-USB-FanAnalog');
    expect(result.sanitizedConfig.fan).toBe('analog');
  });

  test('reports invalid fan values', () => {
    const params = new URLSearchParams('mount=wall&power=usb&fan=linear');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'fan', type: 'invalid' })
      ])
    );
  });
});
