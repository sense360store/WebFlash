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
            airiq: {
                label: 'AirIQ',
                coreRevision: 'Rev B core or newer',
                headers: ['J4 sensor bus', 'J7 auxiliary power'],
                recommended: true,
                conflicts: [
                    {
                        module: 'fan',
                        variants: ['analog'],
                        message: 'Conflicts with Fan Analog — analog control uses the shared DAC header.',
                        detail: 'Select PWM fan control or remove the AirIQ module to free the DAC bus.'
                    },
                    {
                        module: 'ventiq',
                        variants: ['airiq'],
                        message: 'Conflicts with VentIQ — AirIQ and VentIQ cannot both be enabled.',
                        detail: 'The Bathroom toggle drives VentIQ flow. Select AirIQ only when VentIQ is disabled, and set AirIQ to None when VentIQ is selected.'
                    }
                ]
            }
        }
    },
    ventiq: {
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
            airiq: {
                label: 'Sense360 VentIQ',
                coreRevision: 'Rev C core or newer',
                headers: ['J4 sensor bus', 'J7 auxiliary power'],
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
                label: 'None',
                coreRevision: null,
                headers: [],
                description: 'No fan or switching driver installed.',
                conflicts: []
            },
            relay: {
                label: 'Sense360 Fan Relay',
                sku: 'S360-310',
                coreRevision: 'R4',
                headers: ['S360-Relay-C'],
                description: 'On / off relay for bathroom fans.',
                conflicts: [],
                recommended: true
            },
            pwm: {
                label: 'Sense360 Fan PWM',
                sku: 'S360-311',
                coreRevision: 'R4',
                headers: ['12vFan_PWM_PulseCounter'],
                description: '12V PWM fan driver, up to 4 fans with tach feedback.',
                conflicts: []
            },
            analog: {
                label: 'Sense360 Fan DAC',
                sku: 'S360-312',
                coreRevision: 'R4',
                headers: ['Fan_GP8403'],
                description: '0 to 10V analog fan driver, for example Cloudlift S12.',
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
                conflicts: []
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
            airiq: {
                label: 'LED Ring',
                sku: 'S360-300',
                coreRevision: 'R4',
                headers: ['J11 LED data', 'J12 LED power'],
                description: 'Ring of WS2812B LEDs.',
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
