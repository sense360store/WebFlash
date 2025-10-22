const PARAM_ALIASES = {
  mount: ['mount', 'mounting'],
  power: ['power'],
  airiq: ['airiq'],
  presence: ['presence'],
  comfort: ['comfort'],
  fan: ['fan'],
  model: ['model'],
  variant: ['variant'],
  sensor_addon: ['sensor_addon', 'sensor-addon']
};

const OPTION_MAPPINGS = {
  mount: new Map([
    ['wall', 'Wall'],
    ['ceiling', 'Ceiling']
  ]),
  power: new Map([
    ['usb', 'USB'],
    ['poe', 'POE'],
    ['pwr', 'PWR']
  ]),
  airiq: new Map([
    ['base', 'Base'],
    ['pro', 'Pro']
  ]),
  presence: new Map([
    ['base', 'Base'],
    ['pro', 'Pro']
  ]),
  comfort: new Map([
    ['base', 'Base']
  ]),
  fan: new Map([
    ['pwm', 'PWM'],
    ['analog', 'ANALOG']
  ])
};

const OPTIONAL_KEYS = new Set(['airiq', 'presence', 'comfort', 'fan']);
const REQUIRED_PARAM_KEYS = ['mount', 'power'];

const DEFAULT_CHANNEL_KEY = 'stable';
const CHANNEL_ALIAS_MAP = {
  general: 'stable',
  stable: 'stable',
  ga: 'stable',
  release: 'stable',
  beta: 'beta',
  preview: 'beta',
  dev: 'dev',
  nightly: 'dev',
  canary: 'dev'
};

const CHANNEL_PRIORITY_MAP = {
  stable: 0,
  general: 0,
  ga: 0,
  release: 0,
  beta: 1,
  preview: 1,
  dev: 2,
  nightly: 2,
  canary: 2,
  experimental: 2
};

let currentManifestUrl = null;

function cleanupManifestUrl() {
  if (currentManifestUrl) {
    try {
      URL.revokeObjectURL(currentManifestUrl);
    } catch (error) {
      console.warn('Unable to revoke manifest object URL', error);
    }
    currentManifestUrl = null;
  }
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) {
    return '';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
}

function formatBuildDate(dateLike) {
  if (!dateLike) {
    return '';
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return date.toLocaleDateString();
  } catch (_error) {
    return '';
  }
}

function getBuildTimestamp(dateLike) {
  if (!dateLike) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(dateLike);
  if (Number.isNaN(timestamp)) {
    return Number.NEGATIVE_INFINITY;
  }

  return timestamp;
}

function getCombinedSearchParams() {
  const params = new URLSearchParams();
  try {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  } catch (_error) {
    // Ignore parsing errors and continue with hash params if possible
  }

  try {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  } catch (_error) {
    // Ignore malformed hash parameters
  }

  return params;
}

function readParam(params, key) {
  const aliases = PARAM_ALIASES[key] || [key];
  for (const alias of aliases) {
    if (params.has(alias)) {
      const value = params.get(alias);
      if (typeof value === 'string') {
        return value.trim();
      }
    }
  }
  return null;
}

function normalizeValue(key, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === '') {
    return null;
  }

  if (OPTIONAL_KEYS.has(key) && normalized === 'none') {
    return 'none';
  }

  const mapping = OPTION_MAPPINGS[key];
  if (!mapping) {
    return null;
  }

  return mapping.get(normalized) || null;
}

function normalizeRequestedChannel(rawChannel) {
  if (rawChannel === null || rawChannel === undefined) {
    return null;
  }

  const normalized = String(rawChannel).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return CHANNEL_ALIAS_MAP[normalized] || normalized;
}

function normalizeManifestChannel(channel) {
  const normalized = String(channel ?? '').trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_CHANNEL_KEY;
  }

  return CHANNEL_ALIAS_MAP[normalized] || normalized || DEFAULT_CHANNEL_KEY;
}

function getChannelPriority(channel) {
  const normalized = normalizeManifestChannel(channel);
  if (Object.prototype.hasOwnProperty.call(CHANNEL_PRIORITY_MAP, normalized)) {
    return CHANNEL_PRIORITY_MAP[normalized];
  }
  return 99;
}

function readChannelFromParams(params = getCombinedSearchParams()) {
  const raw = readParam(params, 'channel');
  return normalizeRequestedChannel(raw);
}

function buildConfigResultFromParams(params = getCombinedSearchParams()) {
  const mountValue = normalizeValue('mount', readParam(params, 'mount'));
  const powerValue = normalizeValue('power', readParam(params, 'power'));

  const missingRequired = [];
  if (!mountValue) {
    missingRequired.push('mount');
  }

  if (!powerValue) {
    missingRequired.push('power');
  }

  if (missingRequired.length > 0) {
    return {
      configKey: null,
      missingRequired,
      invalidOptional: []
    };
  }

  const segments = [`${mountValue}`, `${powerValue}`];
  const invalidOptional = [];

  const moduleKeys = [
    { key: 'airiq', prefix: 'AirIQ' },
    { key: 'presence', prefix: 'Presence' },
    { key: 'comfort', prefix: 'Comfort' },
    { key: 'fan', prefix: 'Fan', transform: (value) => value }
  ];

  for (const { key, prefix, transform } of moduleKeys) {
    const raw = readParam(params, key);
    const normalized = normalizeValue(key, raw);

    if (normalized === null) {
      if (raw) {
        invalidOptional.push(key);
        return {
          configKey: null,
          missingRequired,
          invalidOptional
        };
      }
      continue;
    }

    if (normalized === 'none') {
      continue;
    }

    const formatted = typeof transform === 'function'
      ? transform(normalized)
      : normalized;
    segments.push(`${prefix}${formatted}`);
  }

  return {
    configKey: segments.join('-'),
    missingRequired,
    invalidOptional
  };
}

function buildConfigKeyFromParams(params = getCombinedSearchParams()) {
  const { configKey } = buildConfigResultFromParams(params);
  return configKey;
}

function normalizeModelLookupValue(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function createModelSignature(model, variant, sensorAddon) {
  const normalizedModel = model.toLowerCase();
  const normalizedVariant = variant.toLowerCase();
  const normalizedAddon = sensorAddon ? sensorAddon.toLowerCase() : '__base__';
  return `${normalizedModel}::${normalizedVariant}::${normalizedAddon}`;
}

function buildModelLookupFromParams(params = getCombinedSearchParams()) {
  const model = normalizeModelLookupValue(readParam(params, 'model'));
  const variant = normalizeModelLookupValue(readParam(params, 'variant'));

  if (!model || !variant) {
    return null;
  }

  const sensorAddonRaw = normalizeModelLookupValue(readParam(params, 'sensor_addon'));
  const sensorAddon = sensorAddonRaw && sensorAddonRaw.toLowerCase() === 'none'
    ? null
    : sensorAddonRaw;

  return {
    type: 'model',
    model,
    variant,
    sensorAddon,
    signature: createModelSignature(model, variant, sensorAddon)
  };
}

function buildInstallLookupFromParams(params = getCombinedSearchParams()) {
  const configKey = buildConfigKeyFromParams(params);
  if (configKey) {
    return {
      type: 'config',
      key: configKey
    };
  }

  return buildModelLookupFromParams(params);
}

function readInstallQueryParams() {
  const params = getCombinedSearchParams();
  const { configKey, missingRequired, invalidOptional } = buildConfigResultFromParams(params);

  let validationError = null;

  if (!configKey) {
    if (missingRequired.length > 0) {
      validationError = {
        title: 'Direct Install Link Incomplete',
        description: 'Direct install links must include the following query parameters:',
        requiredParams: REQUIRED_PARAM_KEYS,
        guidance: 'Check mount/power query parameters.'
      };
    } else if (invalidOptional.length > 0) {
      const formatted = invalidOptional.map((key) => key.charAt(0).toUpperCase() + key.slice(1));
      validationError = {
        title: 'Unsupported Module Parameters',
        description: `Remove or correct unsupported values for: ${formatted.join(', ')}.`,
        requiredParams: REQUIRED_PARAM_KEYS,
        guidance: 'Check mount/power query parameters.'
      };
    } else {
      validationError = {
        title: 'Direct Install Link Incomplete',
        description: 'Direct install links must include the following query parameters:',
        requiredParams: REQUIRED_PARAM_KEYS,
        guidance: 'Check mount/power query parameters.'
      };
    }
  }

  return {
    lookup: buildInstallLookupFromParams(params),
    channel: readChannelFromParams(params)
  };
}

function ensureContainer() {
  let container = document.getElementById('compat-config-installer');
  if (container) {
    return container;
  }

  container = document.createElement('section');
  container.id = 'compat-config-installer';
  container.className = 'firmware-section compat-config-installer';
  container.style.display = 'none';

  const wizardMain = document.querySelector('.wizard-main');
  if (wizardMain) {
    wizardMain.insertAdjacentElement('afterbegin', container);
  } else {
    document.body.insertAdjacentElement('afterbegin', container);
  }

  return container;
}

function renderStatus(container, message) {
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'compat-config-title';
  heading.textContent = 'Direct Install';
  container.appendChild(heading);

  const status = document.createElement('p');
  status.className = 'compat-config-status';
  status.textContent = message;
  container.appendChild(status);

  container.style.display = '';
}

function describeLookupForDisplay(lookup) {
  if (!lookup || lookup.type !== 'model') {
    if (!lookup || !lookup.key) {
      return {
        heading: 'Configuration',
        value: ''
      };
    }

    return {
      heading: 'Configuration',
      value: lookup.key
    };
  }

  const segments = [lookup.model];
  if (lookup.variant) {
    segments.push(lookup.variant);
  }
  if (lookup.sensorAddon) {
    segments.push(lookup.sensorAddon);
  }

  return {
    heading: 'Device',
    value: segments.join(' · ')
  };
}

function renderNoMatch(container, lookup, channel) {
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'compat-config-title';
  heading.textContent = 'Direct Install';
  container.appendChild(heading);

  const message = document.createElement('div');
  message.className = 'firmware-not-available';

  const title = document.createElement('h4');
  title.textContent = 'Firmware Not Found';
  message.appendChild(title);

  const lookupDisplay = describeLookupForDisplay(lookup);
  const isModelLookup = lookup && lookup.type === 'model';

  const description = document.createElement('p');
  if (channel) {
    description.textContent = isModelLookup
      ? 'The requested firmware device selection and channel were not found in the manifest:'
      : 'The requested firmware configuration and channel were not found in the manifest:';
  } else {
    description.textContent = isModelLookup
      ? 'The requested firmware device selection was not found in the manifest:'
      : 'The requested firmware configuration was not found in the manifest:';
  }
  message.appendChild(description);

  const config = document.createElement('p');
  config.className = 'config-string';
  config.textContent = lookupDisplay.value || '—';
  message.appendChild(config);

  if (channel) {
    const channelLine = document.createElement('p');
    channelLine.className = 'config-channel';
    channelLine.textContent = `Channel: ${channel}`;
    message.appendChild(channelLine);
  }

  container.appendChild(message);
  container.style.display = '';
}

function renderError(container, errorMessage) {
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'compat-config-title';
  heading.textContent = 'Direct Install';
  container.appendChild(heading);

  const errorBox = document.createElement('div');
  errorBox.className = 'firmware-error';

  const title = document.createElement('h4');
  title.textContent = 'Unable to Load Manifest';
  errorBox.appendChild(title);

  const message = document.createElement('p');
  message.textContent = errorMessage;
  errorBox.appendChild(message);

  container.appendChild(errorBox);
  container.style.display = '';
}

function renderParameterError(container, errorDetails) {
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'compat-config-title';
  heading.textContent = 'Direct Install';
  container.appendChild(heading);

  const errorBox = document.createElement('div');
  errorBox.className = 'firmware-error compat-config-parameter-error';

  const title = document.createElement('h4');
  title.textContent = errorDetails?.title || 'Direct Install Link Incomplete';
  errorBox.appendChild(title);

  if (errorDetails?.description) {
    const description = document.createElement('p');
    description.textContent = errorDetails.description;
    errorBox.appendChild(description);
  }

  const requiredParams = Array.isArray(errorDetails?.requiredParams)
    ? errorDetails.requiredParams
    : REQUIRED_PARAM_KEYS;

  if (requiredParams.length > 0) {
    const list = document.createElement('ul');
    list.className = 'compat-config-required-params';

    for (const param of requiredParams) {
      const item = document.createElement('li');
      item.textContent = param;
      list.appendChild(item);
    }

    errorBox.appendChild(list);
  }

  const guidanceText = errorDetails?.guidance || 'Check mount/power query parameters.';
  if (guidanceText) {
    const guidance = document.createElement('p');
    guidance.className = 'compat-config-guidance';
    guidance.textContent = guidanceText;
    errorBox.appendChild(guidance);
  }

  container.appendChild(errorBox);
  container.style.display = '';
}

function createOneOffManifest(manifest, build) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid manifest data');
  }

  if (!build || typeof build !== 'object') {
    throw new Error('Invalid build data');
  }

  const parts = Array.isArray(build.parts)
    ? build.parts.map((part) => {
        if (!part || typeof part.path !== 'string' || part.path.trim() === '') {
          return null;
        }

        let resolvedPath = part.path;
        try {
          resolvedPath = new URL(part.path, window.location.href).href;
        } catch (_error) {
          // Fallback to the original path if resolution fails
        }

        return {
          ...part,
          path: resolvedPath
        };
      }).filter(Boolean)
    : [];

  if (parts.length === 0) {
    throw new Error('No firmware parts available for install');
  }

  const manifestFields = [
    'name',
    'version',
    'home_assistant_domain',
    'new_install_skip_erase',
    'new_install_prompt_erase'
  ];

  const payload = {};

  for (const field of manifestFields) {
    if (field in manifest) {
      payload[field] = manifest[field];
    }
  }

  const buildClone = {
    ...build,
    parts
  };

  payload.builds = [buildClone];

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  cleanupManifestUrl();
  currentManifestUrl = URL.createObjectURL(blob);
  return currentManifestUrl;
}

function extractFirmwareFileName(build) {
  if (build && Array.isArray(build.parts)) {
    for (const part of build.parts) {
      if (part && typeof part.path === 'string') {
        const trimmedPath = part.path.trim();
        if (trimmedPath) {
          const lastSlash = trimmedPath.lastIndexOf('/');
          return lastSlash >= 0 ? trimmedPath.slice(lastSlash + 1) : trimmedPath;
        }
      }
    }
  }

  return null;
}

function formatFallbackFileName(build, lookup) {
  const versionSuffix = build && build.version ? `-v${build.version}` : '';
  const channelSuffix = build && build.channel ? `-${build.channel}` : '';

  if (build && typeof build.config_string === 'string' && build.config_string.trim()) {
    return `Sense360-${build.config_string.trim()}${versionSuffix}${channelSuffix}.bin`;
  }

  if (lookup && lookup.type === 'model') {
    const segments = [lookup.model];
    if (lookup.variant) {
      segments.push(lookup.variant);
    }
    if (lookup.sensorAddon) {
      segments.push(lookup.sensorAddon);
    }
    const base = segments.filter(Boolean).join('-') || 'Sense360-Firmware';
    return `${base}${versionSuffix}${channelSuffix}.bin`;
  }

  return `Sense360-Firmware${versionSuffix}${channelSuffix}.bin`;
}

function getModelSignatureForBuild(build) {
  if (!build || typeof build !== 'object') {
    return null;
  }

  const model = normalizeModelLookupValue(build.model);
  const variant = normalizeModelLookupValue(build.variant);
  if (!model || !variant) {
    return null;
  }

  const sensorAddonRaw = normalizeModelLookupValue(build.sensor_addon);
  const sensorAddon = sensorAddonRaw && sensorAddonRaw.toLowerCase() === 'none'
    ? null
    : sensorAddonRaw;

  return createModelSignature(model, variant, sensorAddon);
}

function renderInstall(container, manifestData, build, lookup) {
  const manifestUrl = createOneOffManifest(manifestData, build);

  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'compat-config-title';
  heading.textContent = 'Direct Install';
  container.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'compat-config-subtitle';
  const lookupDisplay = describeLookupForDisplay(lookup);
  if (lookupDisplay.value) {
    subtitle.textContent = `${lookupDisplay.heading}: ${lookupDisplay.value}`;
    container.appendChild(subtitle);
  }

  const firmwareItem = document.createElement('div');
  firmwareItem.className = 'firmware-item compat-config-item';

  const firmwareInfo = document.createElement('div');
  firmwareInfo.className = 'firmware-info';

  const firmwareName = document.createElement('div');
  firmwareName.className = 'firmware-name';
  const inferredName = extractFirmwareFileName(build) || formatFallbackFileName(build, lookup);
  firmwareName.textContent = inferredName;
  firmwareInfo.appendChild(firmwareName);

  const firmwareDetails = document.createElement('div');
  firmwareDetails.className = 'firmware-details';

  const sizeLabel = formatFileSize(build.file_size);
  if (sizeLabel) {
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'firmware-size';
    sizeSpan.textContent = sizeLabel;
    firmwareDetails.appendChild(sizeSpan);
  }

  const dateLabel = formatBuildDate(build.build_date);
  if (dateLabel) {
    const dateSpan = document.createElement('span');
    dateSpan.className = 'firmware-date';
    dateSpan.textContent = dateLabel;
    firmwareDetails.appendChild(dateSpan);
  }

  firmwareInfo.appendChild(firmwareDetails);

  if (typeof build.description === 'string' && build.description.trim() !== '') {
    const description = document.createElement('p');
    description.className = 'firmware-description';
    description.textContent = build.description.trim();
    firmwareInfo.appendChild(description);
  }

  firmwareItem.appendChild(firmwareInfo);

  const actionContainer = document.createElement('div');
  actionContainer.className = 'firmware-actions';

  const installButton = document.createElement('esp-web-install-button');
  installButton.setAttribute('manifest', manifestUrl);

  const activateButton = document.createElement('button');
  activateButton.setAttribute('slot', 'activate');
  activateButton.className = 'btn btn-primary';
  activateButton.textContent = 'Install Firmware';

  installButton.appendChild(activateButton);
  actionContainer.appendChild(installButton);
  firmwareItem.appendChild(actionContainer);

  container.appendChild(firmwareItem);
  container.style.display = '';
}

async function loadManifest() {
  const response = await fetch('./manifest.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function initializeCompatInstall() {
  const { lookup, channel: requestedChannel } = readInstallQueryParams();
  if (!lookup) {
    return;
  }

  renderStatus(container, 'Looking up firmware build…');

  try {
    const manifest = await loadManifest();
    const builds = Array.isArray(manifest.builds) ? manifest.builds : [];
    let matchingBuilds = [];

    if (lookup.type === 'model') {
      const targetSignature = lookup.signature || null;
      if (targetSignature) {
        matchingBuilds = builds.filter((build) => {
          const buildSignature = getModelSignatureForBuild(build);
          return buildSignature === targetSignature;
        });
      }
    } else {
      const normalizedConfigKey = lookup.key.toLowerCase();
      matchingBuilds = builds.filter((build) => {
        if (!build || typeof build.config_string !== 'string') {
          return false;
        }
        return build.config_string.toLowerCase() === normalizedConfigKey;
      });
    }

    if (matchingBuilds.length === 0) {
      renderNoMatch(container, lookup, requestedChannel || undefined);
      return;
    }

    let selectedBuild = null;

    if (requestedChannel) {
      const normalizedRequestedChannel = normalizeManifestChannel(requestedChannel);
      const channelMatches = matchingBuilds.filter((build) => {
        return normalizeManifestChannel(build.channel) === normalizedRequestedChannel;
      });

      selectedBuild = channelMatches[0] || null;

      if (!selectedBuild) {
        renderNoMatch(container, lookup, requestedChannel);
        return;
      }
    } else {
      let bestPriority = Number.POSITIVE_INFINITY;
      let bestTimestamp = Number.NEGATIVE_INFINITY;

      for (const build of matchingBuilds) {
        const priority = getChannelPriority(build.channel);
        const timestamp = getBuildTimestamp(build.build_date);

        if (priority < bestPriority) {
          bestPriority = priority;
          bestTimestamp = timestamp;
          selectedBuild = build;
          continue;
        }

        if (priority === bestPriority && timestamp > bestTimestamp) {
          bestTimestamp = timestamp;
          selectedBuild = build;
        }
      }
    }

    if (!selectedBuild) {
      renderNoMatch(container, lookup, requestedChannel || undefined);
      return;
    }

    renderInstall(container, manifest, selectedBuild, lookup);
  } catch (error) {
    console.error('Direct install lookup failed', error);
    renderError(container, 'Please refresh the page and try again.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeCompatInstall();
});

window.addEventListener('beforeunload', () => {
  cleanupManifestUrl();
});

export {
  buildConfigKeyFromParams,
  buildConfigResultFromParams,
  initializeCompatInstall,
  readInstallQueryParams,
  renderParameterError,
  REQUIRED_PARAM_KEYS
};
