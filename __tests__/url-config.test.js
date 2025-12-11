import { describe, expect, test } from '@jest/globals';
import { mapToWizardConfiguration, parseConfigParams } from '../scripts/utils/url-config.js';

describe('config URL parser', () => {
  test('parses valid configuration including core type, AC power and fan base', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=ac&fan=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Core-Wall-PWR-FanPWM');
    expect(result.sanitizedConfig.core).toBe('none');
    expect(result.sanitizedConfig.mount).toBe('wall');
    expect(result.sanitizedConfig.power).toBe('pwr');
    expect(result.sanitizedConfig.fan).toBe('pwm');

    const wizardConfig = mapToWizardConfiguration(result.sanitizedConfig);
    expect(wizardConfig).toMatchObject({ voice: 'none', mounting: 'wall', power: 'pwr', fan: 'pwm' });
  });

  test('parses CoreVoice configuration', () => {
    const params = new URLSearchParams('core=corevoice&mount=ceiling&power=poe&airiq=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('CoreVoice-Ceiling-POE-AirIQBase');
    expect(result.sanitizedConfig.core).toBe('base');

    const wizardConfig = mapToWizardConfiguration(result.sanitizedConfig);
    expect(wizardConfig).toMatchObject({ voice: 'base', mounting: 'ceiling', power: 'poe' });
  });

  test('marks missing required parameters including core', () => {
    const params = new URLSearchParams('airiq=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'core', type: 'missing' }),
        expect.objectContaining({ field: 'mount', type: 'missing' }),
        expect.objectContaining({ field: 'power', type: 'missing' })
      ])
    );
  });

  test('allows fan selection with ceiling mount', () => {
    const params = new URLSearchParams('core=core&mount=ceiling&power=usb&fan=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.forcedFanNone).toBe(false);
    expect(result.sanitizedConfig.fan).toBe('pwm');
    expect(result.configKey).toBe('Core-Ceiling-USB-FanPWM');
  });

  test('supports legacy power alias', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=pwr');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.configKey).toBe('Core-Wall-PWR');
    expect(result.sanitizedConfig.power).toBe('pwr');
  });

  test('parses analog fan selection', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=usb&fan=analog');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Core-Wall-USB-FanAnalog');
    expect(result.sanitizedConfig.fan).toBe('analog');
  });

  test('reports invalid fan values', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=usb&fan=linear');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'fan', type: 'invalid' })
      ])
    );
  });

  test('supports voice legacy alias for core', () => {
    const params = new URLSearchParams('voice=corevoice&mount=wall&power=usb');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.configKey).toBe('CoreVoice-Wall-USB');
    expect(result.sanitizedConfig.core).toBe('base');
  });
});
