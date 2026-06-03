/**
 * WF-WIZARD-AVAIL-001 — module availability classifier contract.
 * WF-TRIAC-001 — TRIAC moved from `blocked` to `advanced-manual-warning`.
 *
 * Pins the per-(module, variant) classification rules and the per-config_string
 * classification rules against the current manifest shape (Release-One stable
 * + seven preview builds + Rescue) and against the static overrides for Voice
 * (legacy), Relay (available-preview — WEBFLASH-RELAY-001), PWM (available-preview
 * — WEBFLASH-PWM-001), DAC (available-preview —
 * WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001) and TRIAC
 * (advanced-manual-warning under HW-005 + COMPLIANCE-001 — visible + selectable
 * but install-gated by the orthogonal advanced/manual-warning acknowledgement
 * AND a future imported artifact).
 *
 * This is a policy-level pin: the classifier is presentation-only and does NOT
 * gate install. release-channel-ui.test.js stays the install-gate interlock for
 * the preview-channel acknowledgement; wizard-state.test.js pins the install
 * gate's advanced/manual-warning acknowledgement. This file just makes sure
 * the customer sees an honest pill + detail in Step 4.
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

// Synthetic mirror of the current manifest.json shape after WEBFLASH-PWM-001:
// Release-One stable + six preview builds (the VentIQ LED preview, the three
// first-batch previews, the FanRelay manual-preview, and the FanPWM
// manual-preview) + Rescue. Kept inline so test failures are obvious and the
// fixture cannot drift silently from the real manifest.
const CURRENT_MANIFEST_BUILDS = [
    { config_string: 'Ceiling-POE-AirIQ-RoomIQ', channel: 'preview' },
    { config_string: 'Ceiling-POE-FanPWM', channel: 'preview' },
    { config_string: 'Ceiling-POE-RoomIQ', channel: 'preview' },
    { config_string: 'Ceiling-POE-RoomIQ-LED', channel: 'preview' },
    { config_string: 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', channel: 'preview' },
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
    test('eight distinct availability states are exported (WF-TRIAC-001 added advanced-manual-warning)', () => {
        const values = Object.values(AVAILABILITY_STATES);
        expect(new Set(values).size).toBe(8);
        expect(values).toEqual(expect.arrayContaining([
            'available-stable',
            'available-preview',
            'no-firmware',
            'design-pending',
            'blocked',
            'advanced-manual-warning',
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
        expect(AVAILABILITY_LABELS['advanced-manual-warning']).toBe('Advanced / manual only');
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

    test('AirIQ resolves to available-preview from the manifest (no static override)', () => {
        // WF-PREVIEW-IMPORT-FIRST-BATCH-001 imported a Ceiling-POE-AirIQ-RoomIQ
        // preview build, so AirIQ is now manifest-derived like LED — the
        // static no-firmware override was removed.
        const result = classifyAgainstManifest('airiq', 'airiq');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_PREVIEW);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.PREVIEW_BUILD);
        expect(result.installable).toBe(true);
        expect(result.selectable).toBe(true);
        expect(result.label).toBe('Preview');
        // Preview tone matches the preview-channel acknowledgement gate.
        expect(result.tone).toBe('warning');
    });

    test('WEBFLASH-RELAY-001 — Fan: Relay → available-preview (FanRelay manual-preview build imported)', () => {
        const result = classifyAgainstManifest('fan', 'relay');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_PREVIEW);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.PREVIEW_BUILD);
        // Preview build exists → installable (still gated by the preview ack at install).
        expect(result.installable).toBe(true);
        expect(result.selectable).toBe(true);
        expect(result.tone).toBe('warning');
        expect(result.label).toBe('Preview');
        // Load-bearing manual-preview warning copy required by WEBFLASH-RELAY-001.
        expect(result.detail).toMatch(/S360-310/);
        expect(result.detail).toMatch(/preview \/ manual-preview firmware/i);
        expect(result.detail).toMatch(/installer \/ developer preview/i);
        expect(result.detail).toMatch(
            /no hardware, bench, compliance, safety, or commercial-availability proof/i
        );
        expect(result.detail).toMatch(/not for normal customers/i);
        expect(result.detail).toMatch(/stable Bathroom PoE/i);
        // WF-UX-008: no internal task / release / tracking IDs in rendered copy.
        expect(result.detail).not.toMatch(/WEBFLASH-RELAY-001/);
        expect(result.detail).not.toMatch(/HW-005/);
        expect(result.detail).not.toMatch(/RELEASE-/);
    });

    test('WEBFLASH-PWM-001 — Fan: PWM → available-preview (FanPWM manual-preview build imported)', () => {
        const result = classifyAgainstManifest('fan', 'pwm');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_PREVIEW);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.PREVIEW_BUILD);
        // Preview build exists → installable (still gated by the preview ack at install).
        expect(result.installable).toBe(true);
        expect(result.selectable).toBe(true);
        expect(result.tone).toBe('warning');
        expect(result.label).toBe('Preview');
        // Load-bearing manual-preview warning copy required by WEBFLASH-PWM-001.
        expect(result.detail).toMatch(/S360-311/);
        expect(result.detail).toMatch(/PWM fan control/i);
        expect(result.detail).toMatch(/preview \/ manual-preview firmware/i);
        expect(result.detail).toMatch(/installer \/ developer preview/i);
        expect(result.detail).toMatch(/low-voltage \/ DC/i);
        expect(result.detail).toMatch(
            /no hardware, bench, compliance, safety, or commercial-availability proof/i
        );
        expect(result.detail).toMatch(/not for normal customers/i);
        expect(result.detail).toMatch(/stable Bathroom PoE/i);
        // WF-UX-008: no internal task / release / tracking IDs in rendered copy.
        expect(result.detail).not.toMatch(/WEBFLASH-PWM-001/);
        expect(result.detail).not.toMatch(/HW-005/);
        expect(result.detail).not.toMatch(/RELEASE-/);
        expect(result.detail).not.toMatch(/S360-311-CURRENT-THERMAL/);
    });

    test('WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — Fan: DAC → available-preview (FanDAC manual-preview build imported)', () => {
        const result = classifyAgainstManifest('fan', 'analog');
        expect(result.state).toBe(AVAILABILITY_STATES.AVAILABLE_PREVIEW);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.PREVIEW_BUILD);
        // Preview build exists → installable (still gated by the preview ack at install).
        expect(result.installable).toBe(true);
        expect(result.selectable).toBe(true);
        expect(result.tone).toBe('warning');
        expect(result.label).toBe('Preview');
        // Load-bearing manual-preview warning copy required for the FanDAC import.
        expect(result.detail).toMatch(/S360-312/);
        expect(result.detail).toMatch(/analog fan control/i);
        expect(result.detail).toMatch(/preview \/ manual-preview firmware/i);
        expect(result.detail).toMatch(/installer \/ developer preview/i);
        expect(result.detail).toMatch(/0 to 10V/i);
        expect(result.detail).toMatch(
            /no hardware, bench, compliance, safety, or commercial-availability proof/i
        );
        expect(result.detail).toMatch(/not for normal customers/i);
        expect(result.detail).toMatch(/stable Bathroom PoE/i);
        // WF-UX-008: no internal task / release / tracking IDs in rendered copy.
        expect(result.detail).not.toMatch(/WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001/);
        expect(result.detail).not.toMatch(/HW-005/);
        expect(result.detail).not.toMatch(/RELEASE-/);
    });

    test('WF-TRIAC-001 — Fan: TRIAC → advanced-manual-warning (visible + selectable + not installable)', () => {
        const result = classifyAgainstManifest('fan', 'triac');
        expect(result.state).toBe(AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.HW_005_ADVANCED_MANUAL);
        // Classifier is conservative: it never reports an advanced-manual-
        // warning selection as installable, regardless of manifest contents.
        // The install gate in scripts/state.js owns the live ack +
        // manifest-match interlock.
        expect(result.installable).toBe(false);
        // WF-TRIAC-001: advanced-manual-warning IS selectable — the user
        // opts in deliberately and the install gate enforces the ack.
        expect(result.selectable).toBe(true);
        expect(result.tone).toBe('danger');
        expect(result.label).toBe('Advanced / manual only');
        // Copy must spell out the load-bearing facts so the customer cannot
        // mistake this for compliance certification or a Release-One option.
        expect(result.detail).toMatch(/mains-connected/i);
        expect(result.detail).toMatch(/not compliance-certified/i);
        expect(result.detail).toMatch(/not Release-One/i);
        expect(result.detail).toMatch(/not a kit/i);
        expect(result.detail).toMatch(/not recommended/i);
        expect(result.detail).toMatch(/no installable firmware/i);
        expect(result.detail).toMatch(/imported/i);
        // WF-UX-008: customer-visible detail copy must NOT leak internal
        // task / release / tracking IDs. The internal mapping survives only
        // in the machine-readable reasonCode (support/diagnostics can map it
        // back to the open hardware/compliance gates).
        expect(result.detail).not.toMatch(/HW-005/);
        expect(result.detail).not.toMatch(/COMPLIANCE-001/);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.HW_005_ADVANCED_MANUAL);
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

    test('WF-TRIAC-001 — Any FanTRIAC-bearing config is classified advanced-manual-warning (regardless of manifest content)', () => {
        // Even if a future synthetic manifest somehow shipped a FanTRIAC
        // build, the token short-circuit must keep the classifier reporting
        // non-installable. The install gate in scripts/state.js owns the
        // live ack + manifest-match check.
        const result = classifyConfigString('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', {
            manifestStableConfigs: new Set(['Ceiling-POE-VentIQ-FanTRIAC-RoomIQ']),
            manifestPreviewConfigs: new Set()
        });
        expect(result.state).toBe(AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING);
        expect(result.reasonCode).toBe(AVAILABILITY_REASON_CODES.HW_005_ADVANCED_MANUAL);
        expect(result.installable).toBe(false);
        expect(result.detail).toMatch(/FanTRIAC/);
        expect(result.detail).toMatch(/advanced\/manual-warning/i);
        // WF-UX-008: no internal task / release / tracking IDs in the
        // customer-visible detail — the reasonCode (asserted above) carries
        // the internal mapping for support/diagnostics.
        expect(result.detail).not.toMatch(/HW-005/);
        expect(result.detail).not.toMatch(/COMPLIANCE-001/);
        expect(result.detail).toMatch(/not Release-One/i);
        expect(result.detail).toMatch(/not compliance-certified/i);
    });

    test('WF-TRIAC-001 — legacy `blockedTokens` option alias still triggers the advanced-manual-warning classifier', () => {
        // Older callers may still pass the deprecated `blockedTokens`
        // option name. The classifier treats it as a synonym for
        // advancedWarningTokens so we don't break back-compat.
        const result = classifyConfigString('Ceiling-POE-VentIQ-FanTRIAC-RoomIQ', {
            manifestStableConfigs: new Set(),
            manifestPreviewConfigs: new Set(),
            blockedTokens: new Set(['FanTRIAC'])
        });
        expect(result.state).toBe(AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING);
        expect(result.installable).toBe(false);
    });

    test('Core + AirIQ config (no manifest match) → no-firmware', () => {
        const result = classifyAssembled('Ceiling-POE-AirIQ');
        expect(result.state).toBe(AVAILABILITY_STATES.NO_FIRMWARE);
        expect(result.installable).toBe(false);
    });

    test('Core + Relay config (no manifest match) → no-firmware at config layer', () => {
        // Note: the per-variant Relay classification is available-preview (a
        // FanRelay preview build was imported under WEBFLASH-RELAY-001), but the
        // config_string layer only knows whether the *assembled* string is in the
        // manifest. This synthetic Ceiling-USB-FanRelay string is NOT the imported
        // Ceiling-POE-VentIQ-FanRelay-RoomIQ config, so it resolves to no-firmware.
        // available-preview vs. no-firmware is a per-variant distinction the UI
        // surfaces through the per-card pill, not the assembled config_string pill.
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

    test('LED and AirIQ have no static override (rely on manifest derivation)', () => {
        // LED's and AirIQ's availability must change automatically if upstream
        // promotes their builds from preview to stable (or drops them). A
        // static override would freeze the pill at a stale state. AirIQ's
        // no-firmware override was removed by WF-PREVIEW-IMPORT-FIRST-BATCH-001
        // once a Ceiling-POE-AirIQ-RoomIQ preview build shipped.
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.led).toBeUndefined();
        expect(MODULE_VARIANT_AVAILABILITY_OVERRIDES.airiq).toBeUndefined();
    });

    test('WF-TRIAC-001 — TRIAC override never resolves to anything installable at classifier level, regardless of manifest', () => {
        // Defensive: if a future manifest somehow added FanTRIAC to its
        // token set, the static override must still win and the variant
        // must classify as advanced-manual-warning with installable=false.
        // The install gate in scripts/state.js is the authority on whether
        // a flash can actually fire (it requires the ack + manifest match).
        const result = classifyModuleVariant('fan', 'triac', {
            canonicalTokenFor,
            manifestStableTokens: new Set(['FanTRIAC']),
            manifestPreviewTokens: new Set()
        });
        expect(result.state).toBe(AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING);
        expect(result.installable).toBe(false);
        // Selectable so the user can pick it in the custom path.
        expect(result.selectable).toBe(true);
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
