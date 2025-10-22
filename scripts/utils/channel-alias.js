const DEFAULT_CHANNEL_KEY = 'stable';

const CHANNEL_ALIAS_MAP = Object.freeze({
    general: 'stable',
    stable: 'stable',
    ga: 'stable',
    release: 'stable',
    prod: 'stable',
    production: 'stable',
    lts: 'stable',
    beta: 'beta',
    preview: 'preview',
    prerelease: 'preview',
    rc: 'beta',
    candidate: 'beta',
    dev: 'dev',
    alpha: 'dev',
    nightly: 'dev',
    canary: 'dev',
    experimental: 'dev'
});

function normalizeChannelKey(channel, options = {}) {
    const { allowNull = false, defaultKey = DEFAULT_CHANNEL_KEY } = options;
    const normalized = String(channel ?? '').trim().toLowerCase();

    if (!normalized) {
        return allowNull ? null : defaultKey;
    }

    const alias = CHANNEL_ALIAS_MAP[normalized] || normalized;
    if (!alias) {
        return allowNull ? null : defaultKey;
    }

    return alias;
}

export { CHANNEL_ALIAS_MAP, DEFAULT_CHANNEL_KEY, normalizeChannelKey };
