const TOKEN_REGEX = /\b[0-9a-fA-F]{64,}\b/g;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/g;
const IPV6_REGEX = /\b(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|:(?::[0-9A-Fa-f]{1,4}){1,7}|::1|::)\b/g;

const KEY_PLACEHOLDER = {
    ssid: '[REDACTED_SSID]',
    password: '[REDACTED_PASSWORD]',
    passphrase: '[REDACTED_PASSPHRASE]'
};

const INLINE_PATTERNS = [
    {
        regex: /(ssid\s*[:=]\s*)(['"])([^'"\r\n]*?)(\2)/gi,
        replacer: (_, prefix, quote) => `${prefix}${quote}[REDACTED_SSID]${quote}`
    },
    {
        regex: /(ssid\s*[:=]\s*)([^\s,;]+)/gi,
        replacer: (_, prefix) => `${prefix}[REDACTED_SSID]`
    },
    {
        regex: /(password\s*[:=]\s*)(['"])([^'"\r\n]*?)(\2)/gi,
        replacer: (_, prefix, quote) => `${prefix}${quote}[REDACTED_PASSWORD]${quote}`
    },
    {
        regex: /(password\s*[:=]\s*)([^\s,;]+)/gi,
        replacer: (_, prefix) => `${prefix}[REDACTED_PASSWORD]`
    },
    {
        regex: /(passphrase\s*[:=]\s*)(['"])([^'"\r\n]*?)(\2)/gi,
        replacer: (_, prefix, quote) => `${prefix}${quote}[REDACTED_PASSPHRASE]${quote}`
    },
    {
        regex: /(passphrase\s*[:=]\s*)([^\s,;]+)/gi,
        replacer: (_, prefix) => `${prefix}[REDACTED_PASSPHRASE]`
    },
    {
        regex: /(ssid\s+"?)([^"\s][^\r\n]*?)("?\s+)/gi,
        replacer: (_, prefix, __, suffix) => `${prefix}[REDACTED_SSID]${suffix}`
    },
    {
        regex: /(password\s+"?)([^"\s][^\r\n]*?)("?\s+)/gi,
        replacer: (_, prefix, __, suffix) => `${prefix}[REDACTED_PASSWORD]${suffix}`
    }
];

function isPlainObject(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function cloneDate(date) {
    return new Date(date.getTime());
}

function redactString(value, options = {}, keyHint) {
    if (typeof value !== 'string') {
        return value;
    }

    if (keyHint) {
        const lowerKey = keyHint.toLowerCase();
        if (lowerKey.includes('password')) {
            return KEY_PLACEHOLDER.password;
        }
        if (lowerKey.includes('passphrase')) {
            return KEY_PLACEHOLDER.passphrase;
        }
        if (lowerKey.includes('ssid')) {
            return KEY_PLACEHOLDER.ssid;
        }
    }

    let sanitised = value;

    INLINE_PATTERNS.forEach(({ regex, replacer }) => {
        sanitised = sanitised.replace(regex, replacer);
    });

    sanitised = sanitised.replace(TOKEN_REGEX, '[REDACTED_TOKEN]');
    sanitised = sanitised.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');

    if (!options.allowIPs) {
        sanitised = sanitised.replace(IPV4_REGEX, '[REDACTED_IP]');
        sanitised = sanitised.replace(IPV6_REGEX, '[REDACTED_IP]');
    }

    return sanitised;
}

function redactValue(value, options, keyHint) {
    if (typeof value === 'string') {
        return redactString(value, options, keyHint);
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item, options));
    }

    if (value instanceof Date) {
        return cloneDate(value);
    }

    if (value instanceof RegExp) {
        return new RegExp(value.source, value.flags);
    }

    if (isPlainObject(value)) {
        const clone = {};
        Object.keys(value).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (lowerKey in KEY_PLACEHOLDER) {
                clone[key] = KEY_PLACEHOLDER[lowerKey];
            } else {
                clone[key] = redactValue(value[key], options, key);
            }
        });
        return clone;
    }

    return value;
}

function redact(input, options = {}) {
    const finalOptions = {
        allowIPs: Boolean(options.allowIPs)
    };

    return redactValue(input, finalOptions);
}

export { redact };
