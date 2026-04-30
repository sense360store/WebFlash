const optionTooltips = {

    core: {
        standard: {
            title: 'Core (Standard)',
            summary: 'The Core is the base Sense360 processing hub that all mounting, power, and expansion modules connect to.',
            pros: [
                'Required foundation for every Sense360 deployment.',
                'Keeps configuration simple when voice features are not needed.'
            ],
            cons: [
                'Does not include voice hardware by default.'
            ],
            measurements: [
                'Use the matched Core firmware family when generating install links.'
            ],
            learnMore: {
                label: 'Core platform overview',
                href: 'https://docs.sense360.com/core'
            }
        }
    },
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
            summary: 'Ceiling installs free up wall space and maximize coverage in open rooms.',
            pros: [
                'Keeps cabling hidden above drop ceilings or in conduit.',
                'Offers a broad motion sensing cone for RoomIQ Motion modules.'
            ],
            cons: [
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
            title: 'AirIQ',
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
                label: 'AirIQ specifications',
                href: 'https://docs.sense360.com/modules/airiq-base'
            }
        },
        pro: {
            title: 'AirIQ',
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
                label: 'AirIQ deployment tips',
                href: 'https://docs.sense360.com/modules/airiq-pro'
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
        },
        triac: {
            title: 'TRIAC Fan Module',
            summary: 'Phase dimmer for mains-voltage fans and lamps via the TRIAC_Board harness.',
            pros: [
                'Drives line-voltage AC fans, exhaust units, and dimmable lamps without an external dimmer.',
                'Single-board solution with onboard zero-cross detection and snubber.'
            ],
            cons: [
                'Requires mains wiring by a qualified electrician.',
                'Phase control may produce audible hum on some inductive loads.'
            ],
            measurements: [
                'Switches up to 2 A at 120/230 VAC, 50/60 Hz.',
                'Programmable minimum on-time to protect motor windings.'
            ],
            learnMore: {
                label: 'TRIAC fan wiring guide',
                href: 'https://docs.sense360.com/modules/fan-triac'
            }
        }
    },
    led: {
        none: {
            title: 'No LED Ring',
            summary: 'Skip the LED ring when visual status feedback is not required.',
            pros: [
                'Reduces power consumption and overall system cost.',
                'Suitable for headless installations where visual feedback is unnecessary.'
            ],
            cons: [
                'No visual status indication for device state or alerts.',
                'Not compatible with Core Voice configurations.'
            ],
            measurements: [
                'Power budget impact: 0 W (module disabled).'
            ],
            learnMore: {
                label: 'LED Ring overview',
                href: 'https://docs.sense360.com/modules/led-ring'
            }
        },
        base: {
            title: 'LED Ring',
            summary: 'Addressable RGB LED ring providing visual feedback for device status and alerts.',
            pros: [
                'Clear visual indication of device state, alerts, and sensor readings.',
                'Includes integrated I2S microphone for voice-enabled configurations.',
                'Customizable lighting patterns and colors via Home Assistant.'
            ],
            cons: [
                'Adds 0.8 W to the power budget at full brightness.',
                'Requires proper mounting orientation for optimal visibility.'
            ],
            measurements: [
                'WS2812B addressable LEDs with 24-bit color depth.',
                'Integrated MEMS microphone for Core Voice configurations.',
                'Maximum brightness: 60 mA per LED at full white.'
            ],
            learnMore: {
                label: 'LED Ring installation guide',
                href: 'https://docs.sense360.com/modules/led-ring-base'
            }
        }
    }
};

function getOptionTooltip(group, value) {
    return optionTooltips?.[group]?.[value] || null;
}

export { optionTooltips, getOptionTooltip };
export default optionTooltips;
