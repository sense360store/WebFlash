import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { __testHooks } from '../scripts/state.js';

const { parseConfigStringState, formatConfigSegment, MODULE_VARIANT_LABELS } = __testHooks;

describe('MODULE_VARIANT_LABELS uses canonical Sense360 friendly names', () => {
    test('AirIQ, VentIQ, RoomIQ, fan variants, and LED labels match the SKU table', () => {
        expect(MODULE_VARIANT_LABELS.roomiq.roomiq).toBe('Sense360 RoomIQ');
        expect(MODULE_VARIANT_LABELS.airiq.airiq).toBe('Sense360 AirIQ');
        expect(MODULE_VARIANT_LABELS.ventiq.ventiq).toBe('Sense360 VentIQ');
        expect(MODULE_VARIANT_LABELS.fan.relay).toBe('Sense360 Relay');
        expect(MODULE_VARIANT_LABELS.fan.pwm).toBe('Sense360 PWM');
        expect(MODULE_VARIANT_LABELS.fan.analog).toBe('Sense360 DAC');
        expect(MODULE_VARIANT_LABELS.fan.triac).toBe('Sense360 TRIAC');
        expect(MODULE_VARIANT_LABELS.led.led).toBe('Sense360 LED');
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
    test('AirIQ emits -AirIQ when state value matches the SKU code', () => {
        expect(formatConfigSegment('airiq', 'airiq')).toBe('-AirIQ');
        expect(formatConfigSegment('airiq', 'none')).toBe('');
    });

    test('VentIQ emits -VentIQ when state value matches the SKU code', () => {
        expect(formatConfigSegment('ventiq', 'ventiq')).toBe('-VentIQ');
        expect(formatConfigSegment('ventiq', 'none')).toBe('');
    });

    test('RoomIQ emits -RoomIQ when state value matches the SKU code', () => {
        expect(formatConfigSegment('roomiq', 'roomiq')).toBe('-RoomIQ');
        expect(formatConfigSegment('roomiq', 'none')).toBe('');
    });

    test('LED emits -LED when state value matches the SKU code', () => {
        expect(formatConfigSegment('led', 'led')).toBe('-LED');
        expect(formatConfigSegment('led', 'none')).toBe('');
    });

    test('Fan preserves the selected variant in the config string token', () => {
        expect(formatConfigSegment('fan', 'relay')).toBe('-FanRelay');
        expect(formatConfigSegment('fan', 'pwm')).toBe('-FanPWM');
        expect(formatConfigSegment('fan', 'analog')).toBe('-FanDAC');
        expect(formatConfigSegment('fan', 'triac')).toBe('-FanTRIAC');
        expect(formatConfigSegment('fan', 'none')).toBe('');
    });

    test('formatter never emits validator-disallowed tokens', () => {
        // FanPWM, FanRelay, FanTRIAC, and FanDAC are now the canonical
        // variant-specific tokens. The legacy generic `Fan` and the
        // historical `FanAnalog` (replaced by FanDAC) remain disallowed
        // for new builds.
        const disallowed = /(FanAnalog|AirIQBase|AirIQPro|BathroomAirIQ)/;
        const samples = [
            ['roomiq', 'roomiq'],
            ['airiq', 'airiq'],
            ['ventiq', 'ventiq'],
            ['fan', 'relay'],
            ['fan', 'pwm'],
            ['fan', 'analog'],
            ['fan', 'triac'],
            ['voice', 'none'],
            ['led', 'led']
        ];
        for (const [key, value] of samples) {
            expect(formatConfigSegment(key, value)).not.toMatch(disallowed);
        }
    });
});

describe('formatConfigSegment and parseConfigStringState round-trip cleanly', () => {
    test('Each canonical state value round-trips through the parser', () => {
        // Build a config_string from canonical state, parse it back, expect the same canonical values.
        const cases = [
            { state: { airiq: 'airiq' }, fragment: '-AirIQ', stateKey: 'airiq', expected: 'airiq' },
            { state: { ventiq: 'ventiq' }, fragment: '-VentIQ', stateKey: 'ventiq', expected: 'ventiq' },
            { state: { roomiq: 'roomiq' }, fragment: '-RoomIQ', stateKey: 'roomiq', expected: 'roomiq' },
            { state: { led: 'led' }, fragment: '-LED', stateKey: 'led', expected: 'led' },
            { state: { fan: 'relay' }, fragment: '-FanRelay', stateKey: 'fan', expected: 'relay' },
            { state: { fan: 'pwm' }, fragment: '-FanPWM', stateKey: 'fan', expected: 'pwm' },
            { state: { fan: 'analog' }, fragment: '-FanDAC', stateKey: 'fan', expected: 'analog' },
            { state: { fan: 'triac' }, fragment: '-FanTRIAC', stateKey: 'fan', expected: 'triac' }
        ];
        for (const { state, fragment, stateKey, expected } of cases) {
            for (const [moduleKey, value] of Object.entries(state)) {
                expect(formatConfigSegment(moduleKey, value)).toBe(fragment);
            }
            const parsed = parseConfigStringState(`Ceiling-POE${fragment}`);
            expect(parsed[stateKey]).toBe(expected);
        }
    });
});

describe('parseConfigStringState handles both legacy and current tokens', () => {
    test('parses canonical wizard configurations into the right state', () => {
        const ceilingPoeAirIq = parseConfigStringState('Ceiling-POE-AirIQ');
        expect(ceilingPoeAirIq).toMatchObject({ mounting: 'ceiling', power: 'poe', airiq: 'airiq' });

        const ceilingPoeVentIq = parseConfigStringState('Ceiling-POE-VentIQ');
        expect(ceilingPoeVentIq).toMatchObject({ mounting: 'ceiling', power: 'poe', ventiq: 'ventiq' });

        const corePrefixed = parseConfigStringState('Core-Ceiling-POE');
        expect(corePrefixed).toMatchObject({ mounting: 'ceiling', power: 'poe' });
    });

    test('parses canonical Fan{Variant} tokens into the matching wizard value', () => {
        expect(parseConfigStringState('Ceiling-USB-FanRelay').fan).toBe('relay');
        expect(parseConfigStringState('Ceiling-USB-FanPWM').fan).toBe('pwm');
        expect(parseConfigStringState('Ceiling-USB-FanDAC').fan).toBe('analog');
        expect(parseConfigStringState('Ceiling-USB-FanTRIAC').fan).toBe('triac');
    });

    test('still parses the legacy FanAnalog token for old shareable links', () => {
        // FanAnalog was the historical token before the SKU was renamed to
        // "Sense360 DAC" (S360-312); old share-links must still resolve.
        expect(parseConfigStringState('Ceiling-USB-FanAnalog').fan).toBe('analog');
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

        // Standalone special-case configs that the parser is not expected to
        // decode (single-segment recovery build).
        const knownLegacy = new Set([
            'Rescue'
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
