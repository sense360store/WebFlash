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
                conflicts: [
                    {
                        module: 'fan',
                        variants: ['analog'],
                        message: 'Conflicts with Fan Analog — analog control uses the shared DAC header.',
                        detail: 'Select PWM fan control or remove the AirIQ Base module to free the DAC bus.'
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
                        module: 'presence',
                        variants: ['pro'],
                        message: 'Conflicts with Presence Pro — both modules require the secondary UART header.',
                        detail: 'Use Presence Base or remove one of the modules to avoid UART contention.'
                    }
                ]
            }
        }
    },
    presence: {
        label: 'Presence Module',
        summary: 'mmWave radar for occupancy detection.',
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
                headers: ['J2 radar slot'],
                conflicts: []
            },
            pro: {
                label: 'Pro',
                coreRevision: 'Rev D core',
                headers: ['J2 radar slot', 'J8 secondary UART'],
                conflicts: [
                    {
                        module: 'airiq',
                        variants: ['pro'],
                        message: 'Conflicts with AirIQ Pro — UART header cannot be shared.',
                        detail: 'Select AirIQ Base or remove one of the modules.'
                    }
                ]
            }
        }
    },
    comfort: {
        label: 'Comfort Module',
        summary: 'Temperature and ambient light sensors for comfort tuning.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: []
            },
            base: {
                label: 'Base',
                coreRevision: 'Rev A core or newer',
                headers: ['J3 environmental header'],
                conflicts: []
            }
        }
    },
    fan: {
        label: 'Fan Module',
        summary: 'Output driver options for external fan control.',
        variants: {
            none: {
                label: 'None',
                coreRevision: null,
                headers: [],
                conflicts: []
            },
            pwm: {
                label: 'PWM',
                coreRevision: 'Rev A core or newer',
                headers: ['J9 PWM driver'],
                conflicts: []
            },
            analog: {
                label: 'Analog',
                coreRevision: 'Rev C core or newer',
                headers: ['J4 analog DAC', 'J10 isolation harness'],
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
