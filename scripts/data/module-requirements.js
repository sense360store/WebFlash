// WF-WIZARD-AVAIL-001 — each `variants[...]` entry may carry an `availability`
// annotation. When present, it overrides any manifest-derived classification
// in scripts/utils/module-availability.js. Use static overrides for cases the
// manifest cannot disambiguate on its own (hardware blocks, upstream
// schematic vs. design-pending distinction, legacy quarantines). Variants
// without an annotation derive from the loaded manifest at runtime so adding
// a new manifest build automatically lights up the matching module pill.
const MODULE_REQUIREMENT_MATRIX = {
    roomiq: {
        label: 'Sense360 RoomIQ',
        summary: 'Room sensor board with presence, light, temperature, humidity, and pressure sensing.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: [],
                sensors: []
            },
            roomiq: {
                label: 'Sense360 RoomIQ',
                sku: 'S360-200',
                coreRevision: 'R4',
                headers: ['J3 sensor bus'],
                // WEBFLASH-TAXONOMY-RECONCILE-001: the radar modules are
                // connector-attached options (LD2450 on J2, SEN0609/C4001 on
                // J3), never PCB-mounted, and whether they are supplied in
                // shipped boxes is an open owner question upstream — copy
                // must not imply inclusion. Presence claims rest on the
                // PCB-mounted PIR.
                description: 'Room sensor board. On board: EKMC1601111 PIR (presence), LTR-303ALS (light), SHT4x (temperature/humidity), BMP581 (pressure). Connectors for optional LD2450 (J2) and SEN0609/C4001 (J3) radar modules — connector-attached, not included by default.',
                recommended: true,
                sensors: [
                    'EKMC1601111 PIR (presence, on board)',
                    'LTR-303ALS (light, on board)',
                    'SHT4x (temperature/humidity, on board)',
                    'BMP581 (pressure, on board)',
                    'LD2450 radar connector (J2, optional attachment)',
                    'SEN0609/C4001 radar connector (J3, optional attachment)'
                ],
                conflicts: []
                // availability: derived from manifest. RoomIQ ships in
                // Release-One stable today (`Ceiling-POE-VentIQ-RoomIQ`).
            }
        }
    },
    airiq: {
        label: 'Sense360 AirIQ',
        summary: 'Air quality board with CO₂, VOC, and gas sensing plus expansion connectors.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: []
            },
            airiq: {
                label: 'Sense360 AirIQ',
                sku: 'S360-210',
                coreRevision: 'R4',
                headers: ['J4 sensor bus', 'J7 auxiliary power'],
                // WEBFLASH-TAXONOMY-RECONCILE-001: SPS30 is an external
                // connector-supported attachment (PM entities only when it is
                // explicitly included). The formaldehyde sensor fitment is unresolved
                // upstream, is not exposed as a supported customer function,
                // and no on-board or connector-only sensor claim is made
                // either way. VOC and NOx are relative indices; the
                // MiCS-4514 is uncalibrated (indices only, never calibrated
                // gas readings).
                description: 'Ceiling air-quality board with CO₂ (SCD41), VOC and NOx indices (SGP41), and an uncalibrated gas sensor (MiCS-4514 with STM8). External connector for the optional SPS30 particulate module (not included). Formaldehyde sensor fitment unresolved; not currently exposed as a supported customer function.',
                recommended: true,
                // WF-WIZARD-AVAIL-001 static override, retained deliberately by
                // WEBFLASH-TAXONOMY-RECONCILE-001. This feeds only the legacy
                // presentation classifier (scripts/utils/module-availability.js)
                // — the 2.0 view resolves installability from the live engine
                // manifest verdict, which already serves the stable
                // Ceiling-POE-AirIQ-RoomIQ build through the advanced builder.
                // Relaxing this override is an exposure decision that follows
                // the SOT Kitchen go/no-go (the candidate bundle stays hidden /
                // not buyable / never the customer default), so it stays as-is
                // rather than being silently "fixed" here.
                availability: {
                    state: 'no-firmware',
                    reasonCode: 'no-manifest-build'
                },
                sensors: [
                    'SCD41 (CO₂, on board)',
                    'SGP41 (VOC / NOx indices, on board)',
                    'MiCS-4514 with STM8 (gas, uncalibrated, on board)',
                    'SPS30 connector (particulate matter, external, optional)'
                ],
                conflicts: [
                    {
                        module: 'fan',
                        variants: ['analog'],
                        message: 'Conflicts with DAC — analog control uses the shared DAC header.',
                        detail: 'Select PWM, Relay, or TRIAC fan control or remove the AirIQ module to free the DAC bus.'
                    },
                    {
                        module: 'ventiq',
                        variants: ['ventiq'],
                        message: 'Conflicts with VentIQ — AirIQ and VentIQ cannot both be enabled.',
                        detail: 'The Bathroom toggle drives VentIQ flow. Select AirIQ only when VentIQ is disabled, and set AirIQ to None when VentIQ is selected.'
                    }
                ]
            }
        }
    },
    ventiq: {
        label: 'Sense360 VentIQ',
        summary: 'Bathroom-focused air-quality board with onboard SGP41 plus IR temp and SPS30 connectors.',
        ceilingOnly: true,
        requiresBathroom: true,
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: [],
                sensors: []
            },
            ventiq: {
                label: 'Sense360 VentIQ',
                sku: 'S360-211',
                coreRevision: 'R4',
                headers: ['J4 sensor bus', 'J7 auxiliary power'],
                description: 'Smaller air-quality board for bathrooms. SGP41 (VOC / NOx indices) is the only on-board sensor; external connectors for optional IR surface-temperature and SPS30 particulate sensors (not included). In combined presets RoomIQ supplies the canonical temperature and humidity.',
                recommended: true,
                conflicts: [
                    {
                        module: 'airiq',
                        variants: ['airiq'],
                        message: 'Conflicts with AirIQ — AirIQ and VentIQ cannot both be enabled.',
                        detail: 'The Bathroom toggle drives VentIQ flow. Select VentIQ only when AirIQ is set to None, and disable VentIQ to use AirIQ.'
                    }
                ],
                sensors: [
                    'SGP41 (VOC / NOx indices, on board)',
                    'IR surface-temperature connector (external, optional)',
                    'SPS30 connector (particulate matter, external, optional)'
                ]
            }
        }
    },
    fan: {
        label: 'Fan / Switching',
        summary: 'Driver options for external fan and load switching control.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                description: 'No fan or switching driver installed.',
                conflicts: []
            },
            relay: {
                label: 'Sense360 Relay',
                sku: 'S360-310',
                coreRevision: 'R4',
                headers: ['S360-Relay-C'],
                description: 'On / off relay for bathroom fans.',
                conflicts: [],
                recommended: true,
                // WEBFLASH-RELAY-001: a FanRelay preview / manual-preview build
                // (Ceiling-POE-VentIQ-FanRelay-RoomIQ) was imported after upstream
                // marked it WebFlash-import eligible, so Relay is available-preview
                // (Advanced-install-only, acknowledgement-gated). The authoritative
                // override lives in scripts/utils/module-availability.js; this
                // declarative field is kept consistent with it.
                availability: {
                    state: 'available-preview',
                    reasonCode: 'preview-build'
                }
            },
            pwm: {
                label: 'Sense360 PWM',
                sku: 'S360-311',
                coreRevision: 'R4',
                headers: ['12vFan_PWM_PulseCounter'],
                description: '12V PWM fan driver, up to 4 fans with tach feedback.',
                conflicts: [],
                // WEBFLASH-PWM-001: a FanPWM preview / manual-preview build
                // (Ceiling-POE-FanPWM) was imported after upstream marked it
                // WebFlash-import eligible, so PWM is available-preview
                // (Advanced-install-only, acknowledgement-gated). The authoritative
                // override lives in scripts/utils/module-availability.js; this
                // declarative field is kept consistent with it.
                availability: {
                    state: 'available-preview',
                    reasonCode: 'preview-build'
                }
            },
            analog: {
                label: 'Sense360 DAC',
                sku: 'S360-312',
                coreRevision: 'R4',
                headers: ['Fan_GP8403'],
                description: '0 to 10V analog fan driver, for example Cloudlift S12.',
                // WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001: a FanDAC preview /
                // manual-preview build (Ceiling-POE-FanDAC) was imported by the
                // preview-eligible import automation after upstream marked it
                // WebFlash-import eligible, so DAC is available-preview
                // (Advanced-install-only, acknowledgement-gated). The
                // authoritative override lives in
                // scripts/utils/module-availability.js; this declarative field is
                // kept consistent with it.
                availability: {
                    state: 'available-preview',
                    reasonCode: 'preview-build'
                },
                conflicts: [
                    {
                        module: 'airiq',
                        variants: ['airiq'],
                        message: 'Conflicts with AirIQ — analog control occupies the shared DAC bus.',
                        detail: 'Disable AirIQ or switch the fan output to PWM mode.'
                    }
                ]
            },
            triac: {
                label: 'Sense360 TRIAC',
                sku: 'S360-320',
                coreRevision: 'R4',
                headers: ['TRIAC_Board'],
                description: 'Phase dimmer for mains fan or lamp.',
                conflicts: [],
                // WF-TRIAC-001: moved from 'blocked' to
                // 'advanced-manual-warning'. TRIAC controls mains-connected
                // loads and is not compliance-certified by WebFlash. The
                // wizard exposes TRIAC as visible + selectable in the custom
                // path; the install gate in scripts/state.js enforces an
                // explicit advanced/manual-warning acknowledgement AND a
                // future imported artifact before any flash can fire. TRIAC
                // remains not Release-One, not a kit / default, not
                // recommended, and not compliance-certified. HW-005 and
                // COMPLIANCE-001 stay open upstream. See
                // docs/webflash-import-readiness-matrix.md (WF-IMPORT-GAP-001)
                // and the WF-TRIAC-001 entry in docs/wizard-ux-roadmap.md
                // (both archived; see docs/archive-index.md).
                availability: {
                    state: 'advanced-manual-warning',
                    reasonCode: 'hw-005-advanced-manual'
                }
            }
        }
    },
    voice: {
        // WF-WIZARD-AVAIL-001: legacy quarantine. The `voice` module key is
        // retained ONLY as the internal "Core" placeholder so legacy share-links
        // (?voice=none → core in URL aliases) keep parsing. It is intentionally
        // not surfaced as a customer-facing module — `moduleHasSelectableVariants`
        // returns false for voice because the matrix has no non-`none` variant.
        label: 'Voice Module',
        summary: 'Legacy / manual only. Voice is not surfaced as a customer-selectable WebFlash module.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: [],
                recommended: true,
                availability: {
                    state: 'legacy-only',
                    reasonCode: 'internal-placeholder'
                }
            }
        }
    },
    led: {
        label: 'Sense360 LED',
        summary: 'Ring of WS2812B LEDs for visual feedback and status indication.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: [],
                recommended: true
            },
            led: {
                label: 'Sense360 LED',
                sku: 'S360-300',
                coreRevision: 'R4',
                headers: ['J11 LED data', 'J12 LED power'],
                description: 'Ring of WS2812B LEDs.',
                conflicts: [],
                sensors: [
                    'WS2812B addressable LEDs'
                ]
                // availability: derived from manifest. LED currently ships only
                // in the preview build (`Ceiling-POE-VentIQ-RoomIQ-LED`); the
                // release-channel acknowledgement gate still applies.
            }
        }
    }
};

function getModuleMatrixEntry(moduleKey) {
    return MODULE_REQUIREMENT_MATRIX[moduleKey] || null;
}

function getModuleVariantEntry(moduleKey, variantKey) {
    const moduleEntry = getModuleMatrixEntry(moduleKey);
    if (!moduleEntry) {
        return null;
    }

    const variants = moduleEntry.variants || {};
    return variants[variantKey] || null;
}

export { MODULE_REQUIREMENT_MATRIX, getModuleMatrixEntry, getModuleVariantEntry };
