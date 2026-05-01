import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { __testHooks } from '../scripts/state.js';

const { parseConfigStringState, formatConfigSegment, MODULE_VARIANT_LABELS } = __testHooks;

describe('MODULE_VARIANT_LABELS uses canonical Sense360 friendly names', () => {
    test('AirIQ, VentIQ, fan variants, and LED labels match the SKU table', () => {
        expect(MODULE_VARIANT_LABELS.airiq.base).toBe('Sense360 AirIQ');
        expect(MODULE_VARIANT_LABELS.ventiq.base).toBe('Sense360 VentIQ');
        expect(MODULE_VARIANT_LABELS.fan.relay).toBe('Sense360 Fan Relay');
        expect(MODULE_VARIANT_LABELS.fan.pwm).toBe('Sense360 Fan PWM');
        expect(MODULE_VARIANT_LABELS.fan.analog).toBe('Sense360 Fan DAC');
        expect(MODULE_VARIANT_LABELS.fan.triac).toBe('Sense360 TRIAC');
        expect(MODULE_VARIANT_LABELS.led.base).toBe('Sense360 LED');
    });

    test('no variant label leaks Base/Pro/Analog terminology', () => {
        for (const [moduleKey, variants] of Object.entries(MODULE_VARIANT_LABELS)) {
            for (const [variantKey, label] of Object.entries(variants)) {
                expect(label).not.toMatch(/\b(Base|Pro|Analog)\b/);
            }
        }
    });
});

describe('formatConfigSegment emits canonical tokens only', () => {
    test('AirIQ never emits AirIQBase or AirIQPro', () => {
        expect(formatConfigSegment('airiq', 'base')).toBe('-AirIQ');
        expect(formatConfigSegment('airiq', 'none')).toBe('');
    });

    test('VentIQ emits -VentIQ when active', () => {
        expect(formatConfigSegment('ventiq', 'airiq')).toBe('-VentIQ');
        expect(formatConfigSegment('ventiq', 'none')).toBe('');
    });

    test('Fan collapses every variant to a single canonical Fan token', () => {
        expect(formatConfigSegment('fan', 'relay')).toBe('-Fan');
        expect(formatConfigSegment('fan', 'pwm')).toBe('-Fan');
        expect(formatConfigSegment('fan', 'analog')).toBe('-Fan');
        expect(formatConfigSegment('fan', 'triac')).toBe('-Fan');
        expect(formatConfigSegment('fan', 'none')).toBe('');
    });

    test('formatter never emits validator-disallowed tokens', () => {
        const disallowed = /(FanPWM|FanAnalog|FanRelay|FanTRIAC|AirIQBase|AirIQPro|BathroomAirIQ)/;
        const samples = [
            ['airiq', 'base'],
            ['ventiq', 'airiq'],
            ['fan', 'relay'],
            ['fan', 'pwm'],
            ['fan', 'analog'],
            ['fan', 'triac'],
            ['voice', 'base'],
            ['led', 'airiq']
        ];
        for (const [key, value] of samples) {
            expect(formatConfigSegment(key, value)).not.toMatch(disallowed);
        }
    });
});

describe('parseConfigStringState handles both legacy and current tokens', () => {
    test('parses canonical wizard configurations into the right state', () => {
        const ceilingPoeAirIq = parseConfigStringState('Ceiling-POE-AirIQ');
        expect(ceilingPoeAirIq).toMatchObject({ mounting: 'ceiling', power: 'poe', airiq: 'airiq' });

        const ceilingPoeVentIq = parseConfigStringState('Ceiling-POE-VentIQ');
        expect(ceilingPoeVentIq).toMatchObject({ mounting: 'ceiling', power: 'poe', ventiq: 'airiq' });

        const corePrefixed = parseConfigStringState('Core-Ceiling-POE');
        expect(corePrefixed).toMatchObject({ mounting: 'ceiling', power: 'poe' });
    });

    test('still parses legacy FanPWM / FanRelay / FanTRIAC tokens for old shareable links', () => {
        expect(parseConfigStringState('Wall-USB-FanPWM').fan).toBe('pwm');
        expect(parseConfigStringState('Wall-USB-FanRelay').fan).toBe('relay');
        expect(parseConfigStringState('Wall-USB-FanTRIAC').fan).toBe('triac');
    });

    test('manifest config_strings either parse cleanly or are recognised legacy formats', () => {
        const manifestPath = path.join(process.cwd(), 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const configStrings = Array.from(new Set(
            manifest.builds
                .map(build => build.config_string)
                .filter(Boolean)
        ));
        expect(configStrings.length).toBeGreaterThan(0);

        // Standalone legacy configs that the parser is not expected to decode:
        //   - single-segment specials (POE, Rescue)
        //   - configs without a power token (the parser requires mounting + power)
        //   - non-Sense360 mounting prefixes (Mini-, Fan-)
        //   - the legacy Ceiling-S3-Full debug build
        const knownLegacy = new Set([
            'Fan-PWM',
            'Mini-AirIQ',
            'Mini-AirIQ-Advanced',
            'Mini-AirIQ-Basic',
            'Mini-AirIQ-LD2412',
            'POE',
            'Rescue',
            'Ceiling-S3-Full',
            'Core-Ceiling',
            'Core-Ceiling-VentIQ',
            'Core-Wall',
            'CoreVoice-Ceiling',
            'CoreVoice-Wall'
        ]);

        for (const configString of configStrings) {
            if (knownLegacy.has(configString)) {
                continue;
            }
            const parsed = parseConfigStringState(configString);
            expect(parsed).not.toBeNull();
            expect(typeof parsed.mounting).toBe('string');
            expect(typeof parsed.power).toBe('string');
        }
    });
});
