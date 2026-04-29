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
                        message: 'Conflicts with Bathroom AirIQ — only one air quality module can be active at a time.',
                        detail: 'Choose either standard AirIQ or Bathroom AirIQ, not both.'
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
                        message: 'Conflicts with Bathroom AirIQ — only one air quality module can be active at a time.',
                        detail: 'Choose either standard AirIQ or Bathroom AirIQ, not both.'
                    }
                ]
            }
        }
    },
    bathroomairiq: {
        label: 'Bathroom AirIQ Module',
        summary: 'Bathroom-optimized air quality sensing with humidity, pressure, VOC/NOx, and optional condensation detection.',
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
                label: 'Base',
                coreRevision: 'To be added',
                headers: ['To be added'],
                recommended: true,
                conflicts: [],
                sensors: [
                    'SHT4x (temperature, humidity)',
                    'BMP390 (pressure)',
                    'SGP41 (VOC / NOx)'
                ]
            },
            pro: {
                label: 'Pro',
                coreRevision: 'To be added',
                headers: ['To be added'],
                conflicts: [],
                sensors: [
                    'SHT4x (temperature, humidity)',
                    'BMP390 (pressure)',
                    'SGP41 (VOC / NOx)',
                    'MLX90614 (IR surface temperature / condensation risk)',
                    'SPS30 (PM1.0 / PM2.5 / PM10)'
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
                conflicts: []
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
        summary: 'Voice assistant integration for hands-free control and feedback.',
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
                coreRevision: 'Rev B core or newer',
                headers: ['J5 audio interface'],
                conflicts: [],
                sensors: [
                    'I2S microphone array',
                    'Audio DAC output'
                ],
                requires: [
                    {
                        module: 'led',
                        variants: ['base'],
                        message: 'Voice cores require LED Ring with integrated microphone.',
                        detail: 'The Core Voice module mandates an LED Ring for visual feedback and microphone integration.'
                    }
                ]
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
