import { describe, expect, test } from '@jest/globals';
import { mapToWizardConfiguration, parseConfigParams } from '../scripts/utils/url-config.js';

describe('config URL parser', () => {
  test('parses valid configuration including core type, AC power and fan base', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=ac&fan=base');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Core-Wall-PWR-Fan');
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
    expect(result.configKey).toBe('Core-Ceiling-POE-AirIQ');
    expect(result.sanitizedConfig.core).toBe('none');

    const wizardConfig = mapToWizardConfiguration(result.sanitizedConfig);
    expect(wizardConfig).toMatchObject({ voice: 'none', mounting: 'ceiling', power: 'poe' });
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
    expect(result.configKey).toBe('Core-Ceiling-USB-Fan');
  });


  test.each([
    ['airiq=prov', 'ventiq', 'Core-Wall-USB-VentIQ'],
    ['airiq=AirIQProv', 'ventiq', 'Core-Wall-USB-VentIQ'],
    ['airiq=pro', 'ventiq', 'Core-Wall-USB-VentIQ'],
    ['airiq=AirIQPro', 'ventiq', 'Core-Wall-USB-VentIQ']
  ])('legacy AirIQ Pro aliases canonicalise to VentIQ (%s)', (airiqParam, expectedAirIq, expectedConfigKey) => {
    const params = new URLSearchParams(`core=core&mount=wall&power=usb&${airiqParam}`);
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedConfig.airiq).toBe(expectedAirIq);
    expect(result.configKey).toBe(expectedConfigKey);
  });

  test('supports legacy power alias', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=pwr');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.configKey).toBe('Core-Wall-PWR');
    expect(result.sanitizedConfig.power).toBe('pwr');
  });

  test('parses canonical fan=dac selection', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=usb&fan=dac');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Core-Wall-USB-Fan');
    expect(result.sanitizedConfig.fan).toBe('dac');
  });

  test('legacy fan=analog URLs alias to the canonical dac value', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=usb&fan=analog');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Core-Wall-USB-Fan');
    expect(result.sanitizedConfig.fan).toBe('dac');
  });


  test('supports legacy and canonical AirIQ aliases case-insensitively', () => {
    const legacyShort = parseConfigParams(new URLSearchParams('core=core&mount=wall&power=usb&airiq=prov'));
    expect(legacyShort.isValid).toBe(true);
    expect(legacyShort.configKey).toBe('Core-Wall-USB-VentIQ');
    expect(legacyShort.sanitizedConfig.airiq).toBe('ventiq');

    const legacyToken = parseConfigParams(new URLSearchParams('core=core&mount=wall&power=usb&airiq=AirIQProv'));
    expect(legacyToken.isValid).toBe(true);
    expect(legacyToken.configKey).toBe('Core-Wall-USB-VentIQ');
    expect(legacyToken.sanitizedConfig.airiq).toBe('ventiq');

    const canonicalShort = parseConfigParams(new URLSearchParams('core=core&mount=wall&power=usb&airiq=pro'));
    expect(canonicalShort.isValid).toBe(true);
    expect(canonicalShort.configKey).toBe('Core-Wall-USB-VentIQ');
    expect(canonicalShort.sanitizedConfig.airiq).toBe('ventiq');

    const canonicalToken = parseConfigParams(new URLSearchParams('core=core&mount=wall&power=usb&airiq=AirIQPro'));
    expect(canonicalToken.isValid).toBe(true);
    expect(canonicalToken.configKey).toBe('Core-Wall-USB-VentIQ');
    expect(canonicalToken.sanitizedConfig.airiq).toBe('ventiq');
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
    expect(result.configKey).toBe('Core-Wall-USB');
    expect(result.sanitizedConfig.core).toBe('none');
  });

  test('ignores deprecated/unknown query keys during parsing', () => {
    const params = new URLSearchParams('core=corevoice&mount=wall&power=ac&legacy=1&foo=bar');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedConfig).not.toHaveProperty('presence');
    expect(result.sanitizedConfig).not.toHaveProperty('comfort');
    expect(result.configKey).toBe('Core-Wall-PWR');
  });
});
