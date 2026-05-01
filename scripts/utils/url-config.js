/**
 * @fileoverview URL parameter parsing and validation for firmware configuration.
 * @module utils/url-config
 */

/**
 * Order of configuration parameters for consistent URL generation.
 * @type {readonly string[]}
 */
const CONFIG_PARAM_ORDER = Object.freeze(['core', 'mount', 'power', 'led', 'roomiq', 'airiq', 'bathroomairiq', 'fan']);

/**
 * Keys for optional module configuration parameters.
 * @type {readonly string[]}
 */
const CONFIG_MODULE_KEYS = Object.freeze(['led', 'roomiq', 'airiq', 'bathroomairiq', 'fan']);

/**
 * Required configuration parameters that must be present for a valid config.
 * @type {readonly string[]}
 */
const REQUIRED_CONFIG_PARAMS = Object.freeze(['core', 'mount', 'power']);

const DEFAULT_SANITIZED_CONFIG = Object.freeze({
    core: null,
    mount: null,
    power: null,
    led: 'none',
    roomiq: 'none',
    airiq: 'none',
    bathroomairiq: 'none',
    fan: 'none'
});

// Per CLAUDE.md the canonical config_string is Mounting-Power-Modules with no
// Core- prefix and a flat module taxonomy (no Base/Pro/Analog variants), so the
// URL parser is intentionally tolerant of legacy values for backwards compat
// with older shareable links but always emits canonical configSegments.
const CONFIG_PARAM_DEFINITIONS = Object.freeze({
    core: Object.freeze({
        required: true,
        aliases: Object.freeze(['core', 'coretype', 'voice']),
        options: new Map([
            ['core', { wizardValue: 'none', configSegment: null }],
            ['corevoice', { wizardValue: 'none', configSegment: null }]
        ]),
        allowedValues: Object.freeze(['core', 'corevoice']),
        legacyValues: new Map([
            ['none', 'core'],
            ['base', 'corevoice'],
            ['standard', 'core'],
            ['voice', 'corevoice']
        ])
    }),
    mount: Object.freeze({
        required: true,
        aliases: Object.freeze(['mount', 'mounting']),
        options: new Map([
            ['ceiling', { wizardValue: 'ceiling', configSegment: 'Ceiling' }]
        ]),
        allowedValues: Object.freeze(['ceiling']),
        legacyValues: new Map([
            ['wall', 'ceiling']
        ])
    }),
    power: Object.freeze({
        required: true,
        aliases: Object.freeze(['power']),
        options: new Map([
            ['usb', { wizardValue: 'usb', configSegment: 'USB' }],
            ['poe', { wizardValue: 'poe', configSegment: 'POE' }],
            ['ac', { wizardValue: 'pwr', configSegment: 'PWR' }]
        ]),
        allowedValues: Object.freeze(['usb', 'poe', 'ac']),
        legacyValues: new Map([
            ['pwr', 'ac']
        ])
    }),
    led: Object.freeze({
        required: false,
        aliases: Object.freeze(['led']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['airiq', { wizardValue: 'airiq', configSegment: 'LED' }]
        ]),
        allowedValues: Object.freeze(['none', 'airiq']),
        legacyValues: new Map([
            ['base', 'airiq']
        ])
    }),
    roomiq: Object.freeze({
        required: false,
        aliases: Object.freeze(['roomiq']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['roomiq', { wizardValue: 'roomiq', configSegment: 'RoomIQ' }]
        ]),
        allowedValues: Object.freeze(['none', 'roomiq']),
        legacyValues: new Map([
            ['base', 'roomiq']
        ])
    }),
    airiq: Object.freeze({
        required: false,
        aliases: Object.freeze(['airiq']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['airiq', { wizardValue: 'airiq', configSegment: 'AirIQ' }],
            ['ventiq', { wizardValue: 'ventiq', configSegment: 'VentIQ' }]
        ]),
        allowedValues: Object.freeze(['none', 'airiq', 'ventiq']),
        legacyValues: new Map([
            ['base', 'airiq'],
            ['airiqbase', 'airiq'],
            ['pro', 'ventiq'],
            ['prov', 'ventiq'],
            ['airiqpro', 'ventiq'],
            ['airiqprov', 'ventiq']
        ])
    }),
    bathroomairiq: Object.freeze({
        required: false,
        aliases: Object.freeze(['bathroomairiq', 'ventiq']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['ventiq', { wizardValue: 'ventiq', configSegment: 'VentIQ' }]
        ]),
        allowedValues: Object.freeze(['none', 'ventiq']),
        legacyValues: new Map([
            ['base', 'ventiq'],
            ['pro', 'ventiq'],
            ['bathroomairiq', 'ventiq'],
            ['bathroomairiqbase', 'ventiq'],
            ['bathroomairiqpro', 'ventiq']
        ])
    }),
    fan: Object.freeze({
        required: false,
        aliases: Object.freeze(['fan']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['relay', { wizardValue: 'relay', configSegment: 'Fan' }],
            ['pwm', { wizardValue: 'pwm', configSegment: 'Fan' }],
            ['analog', { wizardValue: 'analog', configSegment: 'Fan' }],
            ['triac', { wizardValue: 'triac', configSegment: 'Fan' }]
        ]),
        allowedValues: Object.freeze(['none', 'relay', 'pwm', 'analog', 'triac']),
        legacyValues: new Map([
            ['base', 'pwm']
        ])
    })
});

function ensureSearchParams(input) {
    if (input instanceof URLSearchParams) {
        return input;
    }

    if (!input) {
        return new URLSearchParams();
    }

    try {
        return new URLSearchParams(input);
    } catch (_error) {
        return new URLSearchParams();
    }
}

/**
 * @typedef {Object} ParsedConfig
 * @property {Object} sanitizedConfig - Validated configuration values
 * @property {Object} canonicalValues - Canonical (normalized) values for each param
 * @property {Set<string>} providedKeys - Set of parameter keys that were provided
 * @property {Set<string>} presentKeys - Set of parameter keys present in input
 * @property {Object} rawValues - Original raw values from input
 * @property {Array<{type: string, field: string, message: string}>} errors - Validation errors
 * @property {boolean} isValid - Whether the configuration is valid
 * @property {string|null} configKey - Generated config key for firmware lookup
 * @property {boolean} forcedFanNone - Reserved for future use (always false)
 * @property {number} paramCount - Total number of parameters in input
 */

/**
 * Parses and validates URL configuration parameters.
 *
 * Handles:
 * - Required parameters (mount, power)
 * - Optional module parameters (airiq, bathroomairiq, fan)
 * - Legacy value aliases (e.g., 'pwr' → 'ac')
 * - Optional module parameters with defaults
 *
 * @param {URLSearchParams|string|Object} inputParams - Input parameters to parse
 * @returns {ParsedConfig} Parsed and validated configuration
 * @example
 * const result = parseConfigParams('core=core&mount=ceiling&power=usb&airiq=airiq');
 * if (result.isValid) {
 *   console.log(result.configKey); // 'Ceiling-USB-AirIQ'
 * }
 */
function parseConfigParams(inputParams) {
    const params = ensureSearchParams(inputParams);

    const sanitizedConfig = {
        core: DEFAULT_SANITIZED_CONFIG.core,
        mount: DEFAULT_SANITIZED_CONFIG.mount,
        power: DEFAULT_SANITIZED_CONFIG.power,
        led: DEFAULT_SANITIZED_CONFIG.led,
        roomiq: DEFAULT_SANITIZED_CONFIG.roomiq,
        airiq: DEFAULT_SANITIZED_CONFIG.airiq,
        bathroomairiq: DEFAULT_SANITIZED_CONFIG.bathroomairiq,
        fan: DEFAULT_SANITIZED_CONFIG.fan
    };

    const canonicalValues = {};
    const providedKeys = new Set();
    const presentKeys = new Set();
    const rawValues = {};
    const errors = [];
    const notices = [];
    const configSegments = new Map();
    let fanCanonicalValue = null;

    for (const key of CONFIG_PARAM_ORDER) {
        const definition = CONFIG_PARAM_DEFINITIONS[key];
        const { aliases, options } = definition;
        const defaultOptionKey = definition.defaultOption || null;

        let rawValue = null;
        if (Array.isArray(aliases)) {
            for (const alias of aliases) {
                if (params.has(alias)) {
                    rawValue = params.get(alias);
                    presentKeys.add(key);
                    break;
                }
            }
        } else if (typeof aliases === 'string' && params.has(aliases)) {
            rawValue = params.get(aliases);
            presentKeys.add(key);
        }

        rawValues[key] = rawValue;

        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
            if (definition.required) {
                errors.push({
                    type: 'missing',
                    field: key,
                    message: `Missing required parameter: ${key}`
                });
            } else if (defaultOptionKey && options.has(defaultOptionKey)) {
                const defaultOption = options.get(defaultOptionKey);
                sanitizedConfig[key] = defaultOption.wizardValue;
                configSegments.set(key, defaultOption.configSegment || null);
            }
            continue;
        }

        const trimmed = String(rawValue).trim();
        let canonicalValue = trimmed.toLowerCase();

        if (definition.legacyValues instanceof Map && definition.legacyValues.has(canonicalValue)) {
            canonicalValue = definition.legacyValues.get(canonicalValue);
        }

        if (!options.has(canonicalValue)) {
            const allowedValues = Array.isArray(definition.allowedValues)
                ? definition.allowedValues
                : Array.from(options.keys());

            errors.push({
                type: 'invalid',
                field: key,
                value: trimmed,
                allowed: allowedValues,
                message: `Invalid value for ${key}: "${trimmed}". Expected one of: ${allowedValues.join(', ')}.`
            });

            if (!definition.required && defaultOptionKey && options.has(defaultOptionKey)) {
                const defaultOption = options.get(defaultOptionKey);
                sanitizedConfig[key] = defaultOption.wizardValue;
                configSegments.set(key, defaultOption.configSegment || null);
            }

            continue;
        }

        const option = options.get(canonicalValue);
        sanitizedConfig[key] = option.wizardValue;
        configSegments.set(key, option.configSegment || null);
        canonicalValues[key] = canonicalValue;
        providedKeys.add(key);

        if (key === 'fan') {
            fanCanonicalValue = canonicalValue;
        }
    }

    for (const key of CONFIG_PARAM_ORDER) {
        if (sanitizedConfig[key] === undefined || sanitizedConfig[key] === null) {
            const definition = CONFIG_PARAM_DEFINITIONS[key];
            const defaultOptionKey = definition.defaultOption;

            if (defaultOptionKey && definition.options.has(defaultOptionKey)) {
                const defaultOption = definition.options.get(defaultOptionKey);
                sanitizedConfig[key] = defaultOption.wizardValue;
                if (!configSegments.has(key)) {
                    configSegments.set(key, defaultOption.configSegment || null);
                }
            } else if (key !== 'mount' && key !== 'power') {
                sanitizedConfig[key] = DEFAULT_SANITIZED_CONFIG[key];
                if (!configSegments.has(key)) {
                    configSegments.set(key, null);
                }
            }
        } else if (!configSegments.has(key)) {
            configSegments.set(key, null);
        }
    }

    const forcedFanNone = false;
    const forcedBathroomAirIQNone = false;

    const isValid = errors.length === 0 && Boolean(sanitizedConfig.core) && Boolean(sanitizedConfig.mount) && Boolean(sanitizedConfig.power);

    let configKey = null;
    if (isValid) {
        const segments = [];
        const coreSegment = configSegments.get('core');
        const mountSegment = configSegments.get('mount');
        const powerSegment = configSegments.get('power');

        if (coreSegment) {
            segments.push(coreSegment);
        }

        if (mountSegment) {
            segments.push(mountSegment);
        }

        if (powerSegment) {
            segments.push(powerSegment);
        }

        for (const moduleKey of CONFIG_MODULE_KEYS) {
            const segment = configSegments.get(moduleKey);
            if (segment) {
                segments.push(segment);
            }
        }

        configKey = segments.join('-');
    }

    const paramKeys = new Set();
    if (params && typeof params.forEach === 'function') {
        params.forEach((_value, key) => {
            paramKeys.add(key);
        });
    }

    return {
        sanitizedConfig,
        canonicalValues,
        providedKeys,
        presentKeys,
        rawValues,
        errors,
        notices,
        isValid,
        configKey,
        forcedFanNone,
        forcedBathroomAirIQNone,
        paramCount: paramKeys.size
    };
}

/**
 * Maps a sanitized configuration to wizard state format.
 *
 * @param {Object} [sanitizedConfig] - Sanitized config from parseConfigParams
 * @returns {Object} Configuration in wizard state format
 * @example
 * const wizardConfig = mapToWizardConfiguration({ mount: 'ceiling', power: 'usb' });
 * // Returns: { mounting: 'ceiling', power: 'usb', airiq: 'none', ... }
 */
function mapToWizardConfiguration(sanitizedConfig = DEFAULT_SANITIZED_CONFIG) {
    const safeConfig = sanitizedConfig && typeof sanitizedConfig === 'object'
        ? sanitizedConfig
        : DEFAULT_SANITIZED_CONFIG;

    return {
        voice: safeConfig.core ?? DEFAULT_SANITIZED_CONFIG.core,
        mounting: safeConfig.mount ?? DEFAULT_SANITIZED_CONFIG.mount,
        power: safeConfig.power ?? DEFAULT_SANITIZED_CONFIG.power,
        led: safeConfig.led ?? DEFAULT_SANITIZED_CONFIG.led,
        roomiq: safeConfig.roomiq ?? DEFAULT_SANITIZED_CONFIG.roomiq,
        airiq: safeConfig.airiq ?? DEFAULT_SANITIZED_CONFIG.airiq,
        bathroomairiq: safeConfig.bathroomairiq ?? DEFAULT_SANITIZED_CONFIG.bathroomairiq,
        fan: safeConfig.fan ?? DEFAULT_SANITIZED_CONFIG.fan
    };
}

export {
    CONFIG_MODULE_KEYS,
    CONFIG_PARAM_ORDER,
    DEFAULT_SANITIZED_CONFIG,
    REQUIRED_CONFIG_PARAMS,
    mapToWizardConfiguration,
    parseConfigParams
};
