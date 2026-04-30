const MODULE_REQUIREMENT_MATRIX = {
    airiq: {
        label: 'AirIQ Module',
        summary: 'Air quality stack for particulate, VOC, and CO₂ sensors.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: []
            },
            base: {
                label: 'Base',
                coreRevision: 'Rev B core or newer',
                headers: ['J4 sensor bus', 'J7 auxiliary power'],
                recommended: true,
                conflicts: [
                    {
                        module: 'fan',
                        variants: ['analog'],
                        message: 'Conflicts with Fan Analog — analog control uses the shared DAC header.',
                        detail: 'Select PWM fan control or remove the AirIQ Base module to free the DAC bus.'
                    },
                    {
                        module: 'bathroomairiq',
                        variants: ['base'],
                        message: 'Compatible with VentIQ in bathroom mode.',
                        detail: 'Disable VentIQ to use AirIQ Base, or keep VentIQ enabled and set AirIQ to None.'
                    }
                ]
            },
            pro: {
                label: 'Pro',
                coreRevision: 'Rev C core or newer',
                headers: ['J4 sensor bus', 'J6 particulate harness', 'J7 auxiliary power'],
                conflicts: [
                    {
                        module: 'fan',
                        variants: ['analog'],
                        message: 'Conflicts with Fan Analog — the Pro particulate harness occupies the DAC header.',
                        detail: 'Choose PWM fan control or downgrade AirIQ to Base to regain analog fan support.'
                    },
                    {
                        module: 'bathroomairiq',
                        variants: ['base'],
                        message: 'Compatible with VentIQ in bathroom mode.',
                        detail: 'Disable VentIQ to use AirIQ Base, or keep VentIQ enabled and set AirIQ to None.'
                    }
                ]
            }
        }
    },
    bathroomairiq: {
        label: 'Sense360 VentIQ',
        summary: 'Bathroom air-quality module with humidity, pressure, and VOC/NOx sensing.',
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
            base: {
                label: 'Sense360 VentIQ',
                coreRevision: 'Rev C core or newer',
                headers: ['J4 sensor bus', 'J7 auxiliary power'],
                recommended: true,
                conflicts: [],
                sensors: [
                    'SHT4x (temperature, humidity)',
                    'BMP390 (pressure)',
                    'SGP41 (VOC / NOx)'
                ]
            }
        }
    },
    fan: {
        label: 'Fan / Switching',
        summary: 'Driver options for external fan and load switching control.',
        variants: {
            none: {
                label: 'Sense360 Fan Relay',
                coreRevision: 'R4',
                headers: ['S360-Relay-C'],
                conflicts: [],
                recommended: true
            },
            pwm: {
                label: 'Sense360 Fan PWM',
                coreRevision: 'R4',
                headers: ['12vFan_PWM_PulseCounter'],
                conflicts: [],
                compatibilityNotes: [
                    {
                        mounting: 'ceiling',
                        power: 'pwr',
                        message: 'PWM fan control is not supported for Ceiling mount with PWR power.'
                    }
                ]
            },
            analog: {
                label: 'Sense360 Fan DAC',
                coreRevision: 'R4',
                headers: ['Fan_GP8403'],
                conflicts: [
                    {
                        module: 'airiq',
                        variants: ['base', 'pro'],
                        message: 'Conflicts with AirIQ Base/Pro — analog control occupies the shared DAC bus.',
                        detail: 'Disable AirIQ or switch the fan output to PWM mode.'
                    }
                ]
            }
        }
    },
    voice: {
        label: 'Voice Module',
        summary: 'Voice assistant integration is not currently available.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: [],
                recommended: true
            }
        }
    },
    led: {
        label: 'LED Ring',
        summary: 'Visual feedback ring with optional microphone integration for voice-enabled cores.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: [],
                recommended: true
            },
            base: {
                label: 'Base',
                coreRevision: 'Rev A core or newer',
                headers: ['J11 LED data', 'J12 LED power'],
                conflicts: [],
                sensors: [
                    'WS2812B addressable LED ring',
                    'Integrated I2S microphone (voice models)'
                ]
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
