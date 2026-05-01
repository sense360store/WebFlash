import { describe, expect, test } from '@jest/globals';
import { mapToWizardConfiguration, parseConfigParams } from '../scripts/utils/url-config.js';

describe('config URL parser', () => {
  test('parses canonical configuration with core, AC power and PWM fan', () => {
    const params = new URLSearchParams('core=core&mount=ceiling&power=ac&fan=pwm');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Ceiling-PWR-Fan');
    expect(result.sanitizedConfig.core).toBe('none');
    expect(result.sanitizedConfig.mount).toBe('ceiling');
    expect(result.sanitizedConfig.power).toBe('pwr');
    expect(result.sanitizedConfig.fan).toBe('pwm');

    const wizardConfig = mapToWizardConfiguration(result.sanitizedConfig);
    expect(wizardConfig).toMatchObject({ voice: 'none', mounting: 'ceiling', power: 'pwr', fan: 'pwm' });
  });

  test('CoreVoice URLs still parse but no longer emit a Core- prefix', () => {
    const params = new URLSearchParams('core=corevoice&mount=ceiling&power=poe&airiq=airiq');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Ceiling-POE-AirIQ');
    expect(result.sanitizedConfig.core).toBe('none');

    const wizardConfig = mapToWizardConfiguration(result.sanitizedConfig);
    expect(wizardConfig).toMatchObject({ voice: 'none', mounting: 'ceiling', power: 'poe' });
  });

  test('marks missing required parameters including core', () => {
    const params = new URLSearchParams('airiq=airiq');
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
    const params = new URLSearchParams('core=core&mount=ceiling&power=usb&fan=pwm');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.forcedFanNone).toBe(false);
    expect(result.sanitizedConfig.fan).toBe('pwm');
    expect(result.configKey).toBe('Ceiling-USB-Fan');
  });

  test('coerces legacy mount=wall to ceiling for old shareable URLs', () => {
    const params = new URLSearchParams('core=core&mount=wall&power=usb');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedConfig.mount).toBe('ceiling');
    expect(result.configKey).toBe('Ceiling-USB');
  });

  test.each([
    ['airiq=prov', 'ventiq', 'Ceiling-USB-VentIQ'],
    ['airiq=AirIQProv', 'ventiq', 'Ceiling-USB-VentIQ'],
    ['airiq=pro', 'ventiq', 'Ceiling-USB-VentIQ'],
    ['airiq=AirIQPro', 'ventiq', 'Ceiling-USB-VentIQ']
  ])('legacy AirIQ Pro aliases (%s) collapse to canonical VentIQ', (airiqParam, expectedAirIq, expectedConfigKey) => {
    const params = new URLSearchParams(`core=core&mount=ceiling&power=usb&${airiqParam}`);
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedConfig.airiq).toBe(expectedAirIq);
    expect(result.configKey).toBe(expectedConfigKey);
  });

  test('supports legacy power alias', () => {
    const params = new URLSearchParams('core=core&mount=ceiling&power=pwr');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.configKey).toBe('Ceiling-PWR');
    expect(result.sanitizedConfig.power).toBe('pwr');
  });

  test('legacy fan=analog still parses but emits canonical Fan token', () => {
    const params = new URLSearchParams('core=core&mount=ceiling&power=usb&fan=analog');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configKey).toBe('Ceiling-USB-Fan');
    expect(result.sanitizedConfig.fan).toBe('analog');
  });

  test('legacy AirIQ aliases all canonicalise to airiq/ventiq', () => {
    const legacyShort = parseConfigParams(new URLSearchParams('core=core&mount=ceiling&power=usb&airiq=base'));
    expect(legacyShort.isValid).toBe(true);
    expect(legacyShort.configKey).toBe('Ceiling-USB-AirIQ');
    expect(legacyShort.sanitizedConfig.airiq).toBe('airiq');

    const legacyToken = parseConfigParams(new URLSearchParams('core=core&mount=ceiling&power=usb&airiq=AirIQBase'));
    expect(legacyToken.isValid).toBe(true);
    expect(legacyToken.configKey).toBe('Ceiling-USB-AirIQ');
    expect(legacyToken.sanitizedConfig.airiq).toBe('airiq');

    const proShort = parseConfigParams(new URLSearchParams('core=core&mount=ceiling&power=usb&airiq=pro'));
    expect(proShort.isValid).toBe(true);
    expect(proShort.configKey).toBe('Ceiling-USB-VentIQ');
    expect(proShort.sanitizedConfig.airiq).toBe('ventiq');

    const proToken = parseConfigParams(new URLSearchParams('core=core&mount=ceiling&power=usb&airiq=AirIQPro'));
    expect(proToken.isValid).toBe(true);
    expect(proToken.configKey).toBe('Ceiling-USB-VentIQ');
    expect(proToken.sanitizedConfig.airiq).toBe('ventiq');
  });

  test('reports invalid fan values', () => {
    const params = new URLSearchParams('core=core&mount=ceiling&power=usb&fan=linear');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'fan', type: 'invalid' })
      ])
    );
  });

  test('supports voice legacy alias for core', () => {
    const params = new URLSearchParams('voice=corevoice&mount=ceiling&power=usb');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.configKey).toBe('Ceiling-USB');
    expect(result.sanitizedConfig.core).toBe('none');
  });

  test('ignores deprecated/unknown query keys during parsing', () => {
    const params = new URLSearchParams('core=corevoice&mount=ceiling&power=ac&legacy=1&foo=bar');
    const result = parseConfigParams(params);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedConfig).not.toHaveProperty('presence');
    expect(result.sanitizedConfig).not.toHaveProperty('comfort');
    expect(result.configKey).toBe('Ceiling-PWR');
  });
});
