/**
 * WF-WIZARD-AVAIL-001 — module availability classifier contract.
 *
 * Pins the per-(module, variant) classification rules and the per-config_string
 * classification rules against the current manifest shape (Release-One stable
 * + LED preview + Rescue) and against the static overrides for Voice (legacy),
 * AirIQ (no-firmware), Relay (design-pending), PWM/DAC (no-firmware) and TRIAC
 * (blocked under HW-005 + COMPLIANCE-001).
 *
 * This is a policy-level pin: the classifier is presentation-only and does NOT
 * gate install. release-channel-ui.test.js stays the install-gate interlock;
 * this file just makes sure the customer sees an honest pill in Step 4.
 */
import { describe, expect, test } from '@jest/globals';
import {
    AVAILABILITY_STATES,
    AVAILABILITY_LABELS,
    AVAILABILITY_REASON_CODES,
    MODULE_VARIANT_AVAILABILITY_OVERRIDES,
    classifyModuleVariant,
    classifyConfigString,
    deriveManifestIndex
} from '../scripts/utils/module-availability.js';

// Synthetic mirror of the current manifest.json shape: Release-One stable
// + LED preview + Rescue. Kept inline so test failures are obvious and the
// fixture cannot drift silently from the real manifest.
const CURRENT_MANIFEST_BUILDS = [
    { config_string: 'Ceiling-POE-VentIQ-RoomIQ', channel: 'stable' },
    { config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED', channel: 'preview' },
    { config_string: 'Rescue', channel: 'rescue' }
];

// Canonical (moduleKey, variantKey) → manifest segment token, mirroring
// MODULE_SEGMENT_FORMATTERS in scripts/state.js. Inlined so the classifier
// can be exercised without spinning up the full wizard.
const TOKENS = Object.freeze({
    roomiq: { roomiq: 'RoomIQ' },
    airiq: { airiq: 'AirIQ' },
    ventiq: { ventiq: 'VentIQ' },
    led: { led: 'LED' },
    fan: { relay: 'FanRelay', pwm: 'FanPWM', analog: 'FanDAC', triac: 'FanTRIAC' },
    voice: { none: 'Core' }
});

function canonicalTokenFor(moduleKey, variantKey) {
    return TOKENS[moduleKey]?.[variantKey] || null;
}

function classifyAgainstManifest(moduleKey, variantKey) {
    const index = deriveManifestIndex(CURRENT_MANIFEST_BUILDS);
    return classifyModuleVariant(moduleKey, variantKey, {
        canonicalTokenFor,
        manifestStableTokens: index.manifestStableTokens,
        manifestPreviewTokens: index.manifestPreviewTokens
    });
}

describe('WF-WIZARD-AVAIL-001 — classification states + labels are canonical', () => {
    test('seven distinct availability states are exported', () => {
        const values = Object.values(AVAILABILITY_STATES);
        expect(new Set(values).size).toBe(7);
        expect(values).toEqual(expect.arrayContaining([
            'available-stable',
            'available-preview',
            'no-firmware',
            'design-pending',
            'blocked',
            'legacy-only',
            'hidden'
        ]));
    });

    test('every state has a label (hidden is intentionally empty)', () => {
        Object.values(AVAILABILITY_STATES).forEach(state => {
            expect(typeof AVAILABILITY_LABELS[state]).toBe('string');
        });
        expect(AVAILABILITY_LABELS['available-stable']).toBe('Available');
        expect(AVAILABILITY_LABELS['available-preview']).toBe('Preview');
        expect(AVAILABILITY_LABELS['no-firmware']).toBe('No WebFlash firmware yet');
        expect(AVAILABILITY_LABELS['design-pending']).toBe('Design pending');
        expect(AVAILABILITY_LABELS['blocked']).toBe('Blocked');
        expect(AVAILABILITY_LABELS['legacy-only']).toBe('Legacy / manual only');
        expect(AVAILABILITY_LABELS.hidden).toBe('');
    });
});

describe('WF-WIZARD-AVAIL-001 — derive manifest index from current builds', () => {
    test('Release-One stable token set includes RoomIQ + VentIQ but not LED', () => {
        const index = deriveManifestIndex(CURRENT_MANIFEST_BUILDS);
        expect(index.manifestStableTokens.has('RoomIQ')).toBe(true);
        expect(index.manifestStableTokens.has('VentIQ')).toBe(true);
        expect(index.manifestStableTokens.has('LED')).toBe(false);
        expect(index.manifestStableConfigs.has('Ceiling-POE-VentIQ-RoomIQ')).toBe(true);
    });

    test('LED token is preview-only (not also reported as stable)', () => {
        const index = deriveManifestIndex(CURRENT_MANIFEST_BUILDS);
        expect(index.manifestPreviewTokens.has('LED')).toBe(true);
        expect(index.manifestStableTokens.has('LED')).toBe(false);
        expect(index.manifestPreviewConfigs.has('Ceiling-POE-VentIQ-RoomIQ-LED')).toBe(true);
    });

    test('Rescue does not contribute to module-token availability', () => {
        const index = deriveManifestIndex(CURRENT_MANIFEST_BUILDS);
        expect(index.manifestStableTokens.has('Rescue')).toBe(false);
        expect(index.manifestPreviewTokens.has('Rescue')).toBe(false);
        expect(index.manifestStableConfigs.has('Rescue')).toBe(false);
    });
});

describe('WF-WIZARD-AVAIL-001 — per-module classification against current manifest', () => {
    test('RoomIQ resolves to available-stable from manifest', () => {
        const result = classifyAgainstManifest('roomiq', 'roomiq');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_STABLE);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.MANIFEST_MATCH);
        expect(result.installable).toBe(true);
        expect(result.selectable).toBe(true);
    });

    test('VentIQ resolves to available-stable from manifest', () => {
        const result = classifyAgainstManifest('ventiq', 'ventiq');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_STABLE);
        expect(result.installable).toBe(true);
    });

    test('LED resolves to available-preview from manifest', () => {
        const result = classifyAgainstManifest('led', 'led');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_PREVIEW);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.PREVIEW_BUILD);
        expect(result.installable).toBe(true);
        // Preview tone matches the preview-channel acknowledgement gate.
        expect(result.tone).toBe('warning');
    });

    test('AirIQ static override → no-firmware (documented, no WebFlash build)', () => {
        const result = classifyAgainstManifest('airiq', 'airiq');
        expect(result.state).toBe(AVAILABILITY_STATES.NO_FIRMWARE);
        expect(result.installable).toBe(false);
        expect(result.selectable).toBe(true);
        expect(result.label).toBe('No WebFlash firmware yet');
    });

    test('Fan: Relay → design-pending (no S360-310 schematic uploaded upstream)', () => {
        const result = classifyAgainstManifest('fan', 'relay');
        expect(result.state).toBe(AVAILABILITY_STATES.DESIGN_PENDING);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.DESIGN_PENDING);
        expect(result.installable).toBe(false);
        expect(result.selectable).toBe(true);
        expect(result.detail).toMatch(/S360-310/);
    });

    test('Fan: PWM → no-firmware (S360-311-R4 schematic exists upstream, no build yet)', () => {
        const result = classifyAgainstManifest('fan', 'pwm');
        expect(result.state).toBe(AVAILABILITY_STATES.NO_FIRMWARE);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD);
        expect(result.installable).toBe(false);
        expect(result.selectable).toBe(true);
        // Reference S360-311-R4 schematic evidence in copy (per amendments).
        expect(result.detail).toMatch(/S360-311/);
        expect(result.detail).toMatch(/schematic/i);
    });

    test('Fan: DAC → no-firmware (S360-312-R4 schematic exists upstream, no build yet)', () => {
        const result = classifyAgainstManifest('fan', 'analog');
        expect(result.state).toBe(AVAILABILITY_STATES.NO_FIRMWARE);
        expect(result.installable).toBe(false);
        expect(result.selectable).toBe(true);
        expect(result.detail).toMatch(/S360-312/);
        expect(result.detail).toMatch(/schematic/i);
    });

    test('Fan: TRIAC → blocked under HW-005 (despite S360-320-R4 schematic upload)', () => {
        const result = classifyAgainstManifest('fan', 'triac');
        expect(result.state).toBe(AVAILABILITY_STATES.BLOCKED);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.HW_005);
        expect(result.installable).toBe(false);
        // Blocked variants are NOT selectable — the radio is disabled.
        expect(result.selectable).toBe(false);
        expect(result.detail).toMatch(/HW-005/);
        expect(result.detail).toMatch(/COMPLIANCE-001/);
    });

    test('Voice → legacy-only (internal Core placeholder, not customer-facing)', () => {
        const result = classifyModuleVariant('voice', 'none', { canonicalTokenFor });
        expect(result.state).toBe(AVAILABILITY_STATES.LEGACY_ONLY);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.INTERNAL_PLACEHOLDER);
        expect(result.installable).toBe(false);
    });

    test('"none" variants are classified as hidden (never drive a pill)', () => {
        // Variants the wizard always allows to be off. No customer-facing
        // signal needed; the pill stays empty.
        ['roomiq', 'airiq', 'ventiq', 'led'].forEach(moduleKey => {
            const result = classifyModuleVariant(moduleKey, 'none', { canonicalTokenFor });
            expect(result.state).toBe(AVAILABILITY_STATES.HIDDEN);
            expect(result.label).toBe('');
        });
        const fanNone = classifyModuleVariant('fan', 'none', { canonicalTokenFor });
        expect(fanNone.state).toBe(AVAILABILITY_STATES.HIDDEN);
    });
});

describe('WF-WIZARD-AVAIL-001 — config_string classification', () => {
    function classifyAssembled(configString) {
        const index = deriveManifestIndex(CURRENT_MANIFEST_BUILDS);
        return classifyConfigString(configString, {
            manifestStableConfigs: index.manifestStableConfigs,
            manifestPreviewConfigs: index.manifestPreviewConfigs
        });
    }

    test('Release-One stable config → available-stable', () => {
        const result = classifyAssembled('Ceiling-POE-VentIQ-RoomIQ');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_STABLE);
        expect(result.installable).toBe(true);
    });

    test('LED preview config → available-preview', () => {
        const result = classifyAssembled('Ceiling-POE-VentIQ-RoomIQ-LED');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_PREVIEW);
        expect(result.installable).toBe(true);
        expect(result.tone).toBe('warning');
    });

    test('Any FanTRIAC-bearing config is BLOCKED, regardless of manifest content', () => {
        // Even if a future synthetic manifest somehow shipped a FanTRIAC
        // build, the blocked-token short-circuit must keep it non-installable
        // until HW-005 + COMPLIANCE-001 clear.
        const result = classifyConfigString('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', {
            manifestStableConfigs: new Set(['Ceiling-POE-VentIQ-FanTRIAC-RoomIQ']),
            manifestPreviewConfigs: new Set()
        });
        expect(result.state).toBe(AVAILABILITY_STATES.BLOCKED);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.HW_005);
        expect(result.installable).toBe(false);
        expect(result.detail).toMatch(/FanTRIAC/);
    });

    test('Core + AirIQ config (no manifest match) → no-firmware', () => {
        const result = classifyAssembled('Ceiling-POE-AirIQ');
        expect(result.state).toBe(AVAILABILITY_STATES.NO_FIRMWARE);
        expect(result.installable).toBe(false);
    });

    test('Core + Relay config (no manifest match) → no-firmware at config layer', () => {
        // Note: the per-variant Relay classification is design-pending, but
        // the config_string layer only knows whether the assembled string is
        // in the manifest. design-pending vs. no-firmware is a per-variant
        // distinction the UI surfaces through the per-card pill, not the
        // assembled config_string pill.
        const result = classifyAssembled('Ceiling-USB-FanRelay');
        expect(result.state).toBe(AVAILABILITY_STATES.NO_FIRMWARE);
    });

    test('Empty / missing config_string → hidden (Step 4 hasn\'t assembled one yet)', () => {
        expect(classifyAssembled('').state).toBe(AVAILABILITY_STATES.HIDDEN);
        expect(classifyAssembled(null).state).toBe(AVAILABILITY_STATES.HIDDEN);
        expect(classifyAssembled(undefined).state).toBe(AVAILABILITY_STATES.HIDDEN);
    });
});

describe('WF-WIZARD-AVAIL-001 — static overrides are explicit and minimal', () => {
    test('Voice is the only module with a "none" override (it carries the Core placeholder)', () => {
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.voice?.none).toBeDefined();
        // Other "none" variants must derive at runtime so adding/removing
        // hardware via the manifest doesn't require a code change.
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.roomiq?.none).toBeUndefined();
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.airiq?.none).toBeUndefined();
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.ventiq?.none).toBeUndefined();
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.led?.none).toBeUndefined();
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.fan?.none).toBeUndefined();
    });

    test('Fan overrides cover every non-none variant', () => {
        // Every fan driver SKU must carry an explicit override so the wizard
        // never silently downgrades any of them to "looks installable".
        const variants = Object.keys(MODULE_VARIANT_AVAILABILITY_OVERRIDES.fan || {});
        expect(variants.sort()).toEqual(['analog', 'pwm', 'relay', 'triac']);
    });

    test('LED has no static override (relies on manifest derivation)', () => {
        // LED's availability must change automatically if upstream promotes
        // the LED build from preview to stable. A static override would
        // freeze LED at "available-preview" forever.
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.led).toBeUndefined();
    });

    test('TRIAC override never resolves to anything installable, regardless of manifest', () => {
        // Defensive: if a future manifest somehow added FanTRIAC to its
        // token set, the static override must still win and the variant
        // must classify as blocked.
        const result = classifyModuleVariant('fan', 'triac', {
            canonicalTokenFor,
            manifestStableTokens: new Set(['FanTRIAC']),
            manifestPreviewTokens: new Set()
        });
        expect(result.state).toBe(AVAILABILITY_STATES.BLOCKED);
        expect(result.installable).toBe(false);
    });
});

describe('WF-WIZARD-AVAIL-001 — guardrails the install gate still owns', () => {
    test('available-preview is NOT a free install — caller must still apply preview ack', () => {
        // The classifier marks LED preview as installable in the sense
        // that there IS a build, but the preview-channel acknowledgement
        // gate in release-channels.js still applies. The tone is "warning"
        // so the UI knows to surface that gate alongside the pill.
        const result = classifyAgainstManifest('led', 'led');
        expect(result.installable).toBe(true);
        expect(result.tone).toBe('warning');
    });

    test('available-stable label does not promise install — only that a build matches', () => {
        // The label is "Available". Provenance, freshness, preflight, and
        // signing gates all still apply at install time. This is a copy
        // assertion to keep the label honest.
        const result = classifyAgainstManifest('roomiq', 'roomiq');
        expect(result.label).toBe('Available');
    });
});
