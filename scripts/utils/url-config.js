const CONFIG_PARAM_ORDER = Object.freeze(['mount', 'power', 'airiq', 'presence', 'comfort', 'fan']);
const CONFIG_MODULE_KEYS = Object.freeze(['airiq', 'presence', 'comfort', 'fan']);
const REQUIRED_CONFIG_PARAMS = Object.freeze(['mount', 'power']);

const DEFAULT_SANITIZED_CONFIG = Object.freeze({
    mount: null,
    power: null,
    airiq: 'none',
    presence: 'none',
    comfort: 'none',
    fan: 'none'
});

const CONFIG_PARAM_DEFINITIONS = Object.freeze({
    mount: Object.freeze({
        required: true,
        aliases: Object.freeze(['mount', 'mounting']),
        options: new Map([
            ['wall', { wizardValue: 'wall', configSegment: 'Wall' }],
            ['ceiling', { wizardValue: 'ceiling', configSegment: 'Ceiling' }]
        ]),
        allowedValues: Object.freeze(['wall', 'ceiling'])
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
    airiq: Object.freeze({
        required: false,
        aliases: Object.freeze(['airiq']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['base', { wizardValue: 'base', configSegment: 'AirIQBase' }],
            ['pro', { wizardValue: 'pro', configSegment: 'AirIQPro' }]
        ]),
        allowedValues: Object.freeze(['none', 'base', 'pro'])
    }),
    presence: Object.freeze({
        required: false,
        aliases: Object.freeze(['presence']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['base', { wizardValue: 'base', configSegment: 'PresenceBase' }],
            ['pro', { wizardValue: 'pro', configSegment: 'PresencePro' }]
        ]),
        allowedValues: Object.freeze(['none', 'base', 'pro'])
    }),
    comfort: Object.freeze({
        required: false,
        aliases: Object.freeze(['comfort']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['base', { wizardValue: 'base', configSegment: 'ComfortBase' }]
        ]),
        allowedValues: Object.freeze(['none', 'base'])
    }),
    fan: Object.freeze({
        required: false,
        aliases: Object.freeze(['fan']),
        defaultOption: 'none',
        options: new Map([
            ['none', { wizardValue: 'none', configSegment: null }],
            ['base', { wizardValue: 'pwm', configSegment: 'FanPWM' }],
            ['analog', { wizardValue: 'analog', configSegment: 'FanAnalog' }]
        ]),
        allowedValues: Object.freeze(['none', 'base', 'analog']),
        legacyValues: new Map([
            ['pwm', 'base']
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

function parseConfigParams(inputParams) {
    const params = ensureSearchParams(inputParams);

    const sanitizedConfig = {
        mount: DEFAULT_SANITIZED_CONFIG.mount,
        power: DEFAULT_SANITIZED_CONFIG.power,
        airiq: DEFAULT_SANITIZED_CONFIG.airiq,
        presence: DEFAULT_SANITIZED_CONFIG.presence,
        comfort: DEFAULT_SANITIZED_CONFIG.comfort,
        fan: DEFAULT_SANITIZED_CONFIG.fan
    };

    const canonicalValues = {};
    const providedKeys = new Set();
    const presentKeys = new Set();
    const rawValues = {};
    const errors = [];
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

    let forcedFanNone = false;
    if (sanitizedConfig.mount === 'ceiling') {
        if (fanCanonicalValue && fanCanonicalValue !== 'none') {
            forcedFanNone = true;
        }
        sanitizedConfig.fan = 'none';
        configSegments.set('fan', null);
    }

    const isValid = errors.length === 0 && Boolean(sanitizedConfig.mount) && Boolean(sanitizedConfig.power);

    let configKey = null;
    if (isValid) {
        const segments = [];
        const mountSegment = configSegments.get('mount');
        const powerSegment = configSegments.get('power');

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
        isValid,
        configKey,
        forcedFanNone,
        paramCount: paramKeys.size
    };
}

function mapToWizardConfiguration(sanitizedConfig = DEFAULT_SANITIZED_CONFIG) {
    const safeConfig = sanitizedConfig && typeof sanitizedConfig === 'object'
        ? sanitizedConfig
        : DEFAULT_SANITIZED_CONFIG;

    return {
        mounting: safeConfig.mount ?? DEFAULT_SANITIZED_CONFIG.mount,
        power: safeConfig.power ?? DEFAULT_SANITIZED_CONFIG.power,
        airiq: safeConfig.airiq ?? DEFAULT_SANITIZED_CONFIG.airiq,
        presence: safeConfig.presence ?? DEFAULT_SANITIZED_CONFIG.presence,
        comfort: safeConfig.comfort ?? DEFAULT_SANITIZED_CONFIG.comfort,
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
