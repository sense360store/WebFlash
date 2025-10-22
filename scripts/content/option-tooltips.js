const optionTooltips = {
    mounting: {
        wall: {
            title: 'Wall Mount',
            summary: 'Install on an interior wall to keep every expansion module within reach and maintain the designed airflow path.',
            pros: [
                'Supports the full Sense360 module catalog including Fan control accessories.',
                'Easy to service without ladders; ideal for frequent module swaps.'
            ],
            cons: [
                'Needs 120 mm × 120 mm of flat wall surface and a clean cable exit.',
                'Avoid direct sunlight or HVAC vents that could skew air quality readings.'
            ],
            measurements: [
                'Mount the hub 140–160 cm (55–63 in) above the finished floor for best sensor coverage.',
                'Leave at least 75 mm (3 in) of side clearance to remove front-loading modules.'
            ],
            learnMore: {
                label: 'View wall mounting guide',
                href: 'https://docs.sense360.com/install/wall-mount'
            }
        },
        ceiling: {
            title: 'Ceiling Mount',
            summary: 'Ceiling installs free up wall space and maximize presence detection in open rooms.',
            pros: [
                'Keeps cabling hidden above drop ceilings or in conduit.',
                'Offers a broad motion sensing cone for Presence Base/Pro modules.'
            ],
            cons: [
                'Fan module is not supported because of exhaust restrictions overhead.',
                'Requires access to joists or anchors rated for 1.5 kg to secure the chassis.'
            ],
            measurements: [
                'Install between 2.4–3.6 m (8–12 ft) above the floor; center in the zone being monitored.',
                'Allow 150 mm (6 in) of clearance around the hub for unobstructed airflow.'
            ],
            learnMore: {
                label: 'Ceiling mounting checklist',
                href: 'https://docs.sense360.com/install/ceiling-mount'
            }
        }
    },
    power: {
        usb: {
            title: 'USB Power',
            summary: 'Power the hub through the USB-C service port using a dedicated wall adapter.',
            pros: [
                'Quick to deploy with the included 5 V / 3 A Sense360 power supply.',
                'Ideal for desktop lab validation or temporary demo stations.'
            ],
            cons: [
                'Cable runs longer than 2 m (6.5 ft) can introduce voltage drop.',
                'Requires access to a nearby AC receptacle.'
            ],
            measurements: [
                'Use a USB-C cable rated for 3 A minimum.',
                'Verify 4.75–5.25 V at the hub under load using the diagnostics screen.'
            ],
            learnMore: {
                label: 'USB power best practices',
                href: 'https://docs.sense360.com/power/usb'
            }
        },
        poe: {
            title: 'POE Module',
            summary: 'Deliver data and power through a single Ethernet cable using the POE expansion module.',
            pros: [
                'Supports IEEE 802.3af/at injectors and switches up to 25 W.',
                'Network resilience with auto-restart if power is interrupted.'
            ],
            cons: [
                'Adds 14 mm depth to the hub profile—verify clearance in recessed boxes.',
                'Requires Category 5e or better cabling for full current delivery.'
            ],
            measurements: [
                'Budget at least 7 W for the hub plus 4–8 W per attached sensor module.',
                'Maximum tested cable run: 90 m (295 ft) including patch panels.'
            ],
            learnMore: {
                label: 'POE wiring reference',
                href: 'https://docs.sense360.com/power/poe'
            }
        },
        pwr: {
            title: 'PWR Module',
            summary: 'Use the barrel-jack PWR module when a building low-voltage feed is available.',
            pros: [
                'Accepts 12–24 VDC input, enabling centralized power supplies.',
                'Integrated surge suppression protects downstream modules.'
            ],
            cons: [
                'Requires wiring into a field-supplied DC power source.',
                'Bulkier cabling that may need strain relief in tight enclosures.'
            ],
            measurements: [
                'Size conductors for 1.5 A continuous draw at 12 V (0.75 A at 24 V).',
                'Trim the harness to maintain < 1.5 % voltage drop end-to-end.'
            ],
            learnMore: {
                label: 'Low-voltage power design notes',
                href: 'https://docs.sense360.com/power/pwr-module'
            }
        }
    },
    airiq: {
        none: {
            title: 'No AirIQ Module',
            summary: 'Skip the AirIQ module when air quality monitoring is not required for this deployment.',
            pros: [
                'Reduces overall cost and power draw.',
                'Frees an expansion bay for other specialty sensors.'
            ],
            cons: [
                'No volatile organic compound (VOC) or particulate feedback from this hub.'
            ],
            measurements: [
                'Power budget impact: 0 W (module disabled).'
            ],
            learnMore: {
                label: 'AirIQ module overview',
                href: 'https://docs.sense360.com/modules/airiq'
            }
        },
        base: {
            title: 'AirIQ Base',
            summary: 'Balanced sensing for air quality metrics in offices, classrooms, and hospitality spaces.',
            pros: [
                'Combines gas, particulate, and pressure sensors for cross-validated readings.',
                'Factory-calibrated profiles with weekly self-check routines.'
            ],
            cons: [
                'Consumes one expansion slot and increases power budget by 1.8 W.',
                'Requires filter replacement every 18 months for peak accuracy.'
            ],
            measurements: [
                'SGP41 VOC index resolution: 1 point, warm-up < 30 s.',
                'SCD41 CO₂ accuracy: ±40 ppm between 400–1000 ppm.'
            ],
            learnMore: {
                label: 'AirIQ Base specifications',
                href: 'https://docs.sense360.com/modules/airiq-base'
            }
        },
        pro: {
            title: 'AirIQ Pro',
            summary: 'Comprehensive air quality analytics with industrial-grade particulate and formaldehyde sensing.',
            pros: [
                'Adds SPS30 laser particulate counter and SEN0321 formaldehyde sensor.',
                'Provides automatic trend exports for BMS integrations.'
            ],
            cons: [
                'Draws 2.6 W and benefits from continuous airflow—avoid enclosed cabinets.',
                'Requires quarterly filter cleaning in dusty environments.'
            ],
            measurements: [
                'PM2.5 accuracy: ±10 µg/m³ at 25 °C and 40 % RH.',
                'Formaldehyde detection range: 0–5 ppm with 0.01 ppm resolution.'
            ],
            learnMore: {
                label: 'AirIQ Pro deployment tips',
                href: 'https://docs.sense360.com/modules/airiq-pro'
            }
        }
    },
    presence: {
        none: {
            title: 'No Presence Module',
            summary: 'Exclude motion detection when the hub is only gathering environmental data.',
            pros: [
                'Eliminates radar emissions for spaces with strict RF policies.',
                'Reduces standby power draw by 0.9 W.'
            ],
            cons: [
                'No occupancy signals for HVAC or lighting automation.'
            ],
            measurements: [
                'Power budget impact: 0 W (module disabled).'
            ],
            learnMore: {
                label: 'Presence module capabilities',
                href: 'https://docs.sense360.com/modules/presence'
            }
        },
        base: {
            title: 'Presence Base',
            summary: 'Single-sensor mmWave coverage for small rooms, focus booths, or restrooms.',
            pros: [
                'Detects micro-movements through fabric partitions up to 4.5 m (15 ft).',
                'Built-in guard zones reduce false positives near doorways.'
            ],
            cons: [
                'Cone coverage tapers beyond 90°; plan for wall or corner mounting.',
                'Slight warm-up period (~20 s) after power cycling.'
            ],
            measurements: [
                'Optimal mounting height: 2.4 m (8 ft) with a 60° vertical field of view.',
                'Detection radius: 4.5 m (15 ft) for seated occupancy.'
            ],
            learnMore: {
                label: 'Presence Base layout guide',
                href: 'https://docs.sense360.com/modules/presence-base'
            }
        },
        pro: {
            title: 'Presence Pro',
            summary: 'Dual-sensor radar for large collaboration areas requiring directional motion cues.',
            pros: [
                'LD2450 radar adds zone tracking for up to four simultaneous occupants.',
                'Adaptive algorithms maintain sensitivity in high-reflection environments.'
            ],
            cons: [
                'Requires firmware 1.4 or newer to expose zone telemetry.',
                'Draws an extra 1.3 W compared to Presence Base.'
            ],
            measurements: [
                'Coverage ellipse: 6.5 m × 5 m (21 ft × 16 ft) when ceiling-mounted at 3 m (10 ft).',
                'Update rate: 10 Hz with ±0.3 m positional accuracy.'
            ],
            learnMore: {
                label: 'Presence Pro zoning tips',
                href: 'https://docs.sense360.com/modules/presence-pro'
            }
        }
    },
    comfort: {
        none: {
            title: 'No Comfort Module',
            summary: 'Use when a building already feeds temperature and ambient light data from other systems.',
            pros: [
                'Frees capacity for specialty modules such as access control.',
                'Removes 0.6 W from the power budget.'
            ],
            cons: [
                'No local humidity or lux feedback for adaptive comfort scenes.'
            ],
            measurements: [
                'Power budget impact: 0 W (module disabled).'
            ],
            learnMore: {
                label: 'Comfort module insight',
                href: 'https://docs.sense360.com/modules/comfort'
            }
        },
        base: {
            title: 'Comfort Base',
            summary: 'Essential ambient sensing for temperature, humidity, and light-level automation.',
            pros: [
                'Includes SHT40 temperature/humidity with ±0.2 °C accuracy after calibration.',
                'LTR-303 ambient light sensor supports 0–65k lux with auto-ranging.'
            ],
            cons: [
                'Adds 0.6 W to the total load and needs airflow to avoid heat soaking.',
                'Requires seasonal recalibration if mounted near HVAC diffusers.'
            ],
            measurements: [
                'Recommended mounting height matches main hub placement to avoid stratification.',
                'Light sensor window should face open space; avoid shading by signage.'
            ],
            learnMore: {
                label: 'Comfort Base integration notes',
                href: 'https://docs.sense360.com/modules/comfort-base'
            }
        }
    },
    fan: {
        none: {
            title: 'No Fan Module',
            summary: 'Leave the fan bay open when external HVAC handles all airflow mixing.',
            pros: [
                'Zero additional power draw or mechanical noise.',
                'Best choice for acoustically sensitive rooms.'
            ],
            cons: [
                'No direct fan relay output for standalone ventilation control.'
            ],
            measurements: [
                'Power budget impact: 0 W (module disabled).'
            ],
            learnMore: {
                label: 'Fan control overview',
                href: 'https://docs.sense360.com/modules/fan'
            }
        },
        pwm: {
            title: 'PWM Fan Module',
            summary: 'Provides 25 kHz PWM output for EC fans and in-duct boosters requiring precise speed control.',
            pros: [
                'Fine-grained 0–100 % speed setpoints with automatic ramp profiles.',
                'Monitors tach feedback to confirm commanded RPM.'
            ],
            cons: [
                'Requires 4-wire fan cabling with dedicated tachometer lead.',
                'Adds 1.1 W to the load at full duty cycle.'
            ],
            measurements: [
                'PWM signal: 5 V logic, 25 kHz frequency, 0.1 % resolution.',
                'Tach input accepts 5–12 V pulses up to 6 kHz.'
            ],
            learnMore: {
                label: 'PWM fan wiring diagram',
                href: 'https://docs.sense360.com/modules/fan-pwm'
            }
        },
        analog: {
            title: 'Analog Fan Module',
            summary: 'Controls legacy HVAC blowers using a 0–10 V analog output stage.',
            pros: [
                'Compatible with VFDs, economizers, and dampers expecting 0–10 V control.',
                'Includes isolation amplifier to prevent ground loops with building controllers.'
            ],
            cons: [
                'Requires calibration of minimum/maximum voltage at commissioning.',
                'Slightly slower response (200 ms) compared to PWM modulation.'
            ],
            measurements: [
                '0–10 V output sourcing up to 5 mA; programmable floor value.',
                'Galvanic isolation rated for 2.5 kV between control and field wiring.'
            ],
            learnMore: {
                label: 'Analog fan integration guide',
                href: 'https://docs.sense360.com/modules/fan-analog'
            }
        }
    }
};

function getOptionTooltip(group, value) {
    return optionTooltips?.[group]?.[value] || null;
}

export { optionTooltips, getOptionTooltip };
export default optionTooltips;
