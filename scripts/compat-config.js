import { DEFAULT_CHANNEL_KEY, normalizeChannelKey } from './utils/channel-alias.js';
import { parseConfigParams, REQUIRED_CONFIG_PARAMS } from './utils/url-config.js';

const DEFAULT_VALIDATION_ERROR = {
  title: 'Direct Install Link Incomplete',
  description: 'Direct install links must include the following query parameters:',
  requiredParams: REQUIRED_CONFIG_PARAMS,
  guidance: 'Check mount/power query parameters.',
  messages: []
};

const CHANNEL_PRIORITY_MAP = {
  stable: 0,
  general: 0,
  ga: 0,
  release: 0,
  prod: 0,
  production: 0,
  lts: 0,
  preview: 1,
  prerelease: 1,
  beta: 2,
  rc: 2,
  candidate: 2,
  dev: 3,
  alpha: 3,
  nightly: 3,
  canary: 3,
  experimental: 3
};

let currentManifestUrl = null;


function normalizeHardwareToken(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function deriveHardwareTargetDescriptor(configuration = {}) {
  const mount = normalizeHardwareToken(configuration.mounting || configuration.mount);
  const power = normalizeHardwareToken(configuration.power);
  const family = normalizeHardwareToken(configuration.family);

  const tokens = ['sense360'];
  if (mount) tokens.push(mount);
  if (power) tokens.push(power);
  if (family) tokens.push(family);

  return {
    family: family || 'sense360',
    mount,
    power,
    normalizedTarget: tokens.join('-')
  };
}

function parseHardwareTarget(target) {
  const normalized = normalizeHardwareToken(target);
  if (!normalized) {
    return { family: null, mount: null, power: null, normalizedTarget: null };
  }

  const tokens = normalized.split('-').filter(Boolean);
  const [family, mount, power] = tokens;
  return {
    family: family || null,
    mount: mount || null,
    power: power || null,
    normalizedTarget: normalized
  };
}

function verifyImportedPresetCompatibility(importedHardwareTarget, currentConfiguration = {}) {
  const imported = parseHardwareTarget(importedHardwareTarget);
  const current = deriveHardwareTargetDescriptor(currentConfiguration);

  const mismatches = [];
  if (imported.mount && current.mount && imported.mount !== current.mount) {
    mismatches.push({ key: 'mounting', imported: imported.mount, current: current.mount, blocking: true });
  }
  if (imported.power && current.power && imported.power !== current.power) {
    mismatches.push({ key: 'power', imported: imported.power, current: current.power, blocking: true });
  }
  if (imported.family && current.family && imported.family !== current.family) {
    mismatches.push({ key: 'family', imported: imported.family, current: current.family, blocking: false });
  }

  let level = 'compatible';
  if (mismatches.some((entry) => entry.blocking)) {
    level = 'incompatible-blocking';
  } else if (mismatches.length > 0) {
    level = 'incompatible-warning';
  }

  const messages = mismatches.map((entry) => {
    const label = entry.key === 'mounting' ? 'Mounting' : entry.key.charAt(0).toUpperCase() + entry.key.slice(1);
    return `${label} mismatch (import: ${entry.imported}, current: ${entry.current})`;
  });

  return { level, mismatches, messages, importedTarget: imported.normalizedTarget, currentTarget: current.normalizedTarget };
}

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
  if (params.has(key)) {
    const value = params.get(key);
    if (typeof value === 'string') {
      return value.trim();
    }
  }
  return null;
}

function normalizeRequestedChannel(rawChannel) {
  if (rawChannel === null || rawChannel === undefined) {
    return null;
  }

  return normalizeChannelKey(rawChannel, { allowNull: true });
}

function normalizeManifestChannel(channel) {
  return normalizeChannelKey(channel, { defaultKey: DEFAULT_CHANNEL_KEY });
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

function buildInstallLookupFromParams(params = getCombinedSearchParams(), parsedConfig = parseConfigParams(params)) {
  if (parsedConfig && parsedConfig.configKey) {
    return {
      type: 'config',
      key: parsedConfig.configKey
    };
  }

  return null;
}

function readInstallQueryParams() {
  const params = getCombinedSearchParams();
  const parsedConfig = parseConfigParams(params);
  const channel = readChannelFromParams(params);

  const hasConfigParams = parsedConfig?.presentKeys instanceof Set && parsedConfig.presentKeys.size > 0;
  const hasInstallParams = hasConfigParams;

  if (!hasInstallParams) {
    return {
      lookup: null,
      channel,
      validationError: null,
      hasInstallParams: false
    };
  }

  let validationError = null;
  const lookup = buildInstallLookupFromParams(params, parsedConfig);

  if (!lookup) {
    const errorMessages = Array.isArray(parsedConfig.errors)
      ? parsedConfig.errors.map((error) => error?.message).filter(Boolean)
      : [];

    if (errorMessages.length > 0) {
      validationError = {
        title: 'Direct Install Link Incomplete',
        description: 'Direct install links must include the following query parameters:',
        requiredParams: REQUIRED_CONFIG_PARAMS,
        guidance: 'Check mount/power query parameters.',
        messages: errorMessages
      };
    } else {
      validationError = { ...DEFAULT_VALIDATION_ERROR };
    }
  }

  return {
    lookup,
    channel,
    validationError,
    hasInstallParams: true
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
  return {
    heading: 'Configuration',
    value: lookup?.key || ''
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

  const description = document.createElement('p');
  description.textContent = channel
    ? 'The requested firmware configuration and channel were not found in the manifest:'
    : 'The requested firmware configuration was not found in the manifest:';
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

  const detailedMessages = Array.isArray(errorDetails?.messages)
    ? errorDetails.messages.filter((message) => typeof message === 'string' && message.trim().length > 0)
    : [];

  if (detailedMessages.length > 0) {
    const messageList = document.createElement('ul');
    messageList.className = 'compat-config-error-messages';

    for (const message of detailedMessages) {
      const item = document.createElement('li');
      item.textContent = message;
      messageList.appendChild(item);
    }

    errorBox.appendChild(messageList);
  }

  const requiredParams = Array.isArray(errorDetails?.requiredParams)
    ? errorDetails.requiredParams
    : REQUIRED_CONFIG_PARAMS;

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

function formatFallbackFileName(build) {
  const versionSuffix = build && build.version ? `-v${build.version}` : '';
  const channelSuffix = build && build.channel ? `-${build.channel}` : '';

  if (build && typeof build.config_string === 'string' && build.config_string.trim()) {
    return `Sense360-${build.config_string.trim()}${versionSuffix}${channelSuffix}.bin`;
  }

  return `Sense360-Firmware${versionSuffix}${channelSuffix}.bin`;
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
  const inferredName = extractFirmwareFileName(build) || formatFallbackFileName(build);
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

  // Add unsupported browser slot
  const unsupportedSlot = document.createElement('span');
  unsupportedSlot.setAttribute('slot', 'unsupported');
  unsupportedSlot.innerHTML = `
    <span class="esp-web-tools-unsupported">
      Web Serial requires <strong>Chrome</strong> or <strong>Edge</strong> on desktop.
      <a href="https://developer.mozilla.org/docs/Web/API/Web_Serial_API" target="_blank" rel="noopener noreferrer">Learn more</a>
    </span>
  `;

  // Add not-allowed (non-HTTPS) slot
  const notAllowedSlot = document.createElement('span');
  notAllowedSlot.setAttribute('slot', 'not-allowed');
  notAllowedSlot.innerHTML = `
    <span class="esp-web-tools-not-allowed">
      Web flashing requires a <strong>secure context (HTTPS)</strong>.
      Please access this page via HTTPS.
    </span>
  `;

  installButton.appendChild(activateButton);
  installButton.appendChild(unsupportedSlot);
  installButton.appendChild(notAllowedSlot);
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
  const { lookup, channel: requestedChannel, validationError, hasInstallParams } = readInstallQueryParams();

  if (!hasInstallParams) {
    return;
  }

  const container = ensureContainer();

  if (!lookup) {
    renderParameterError(container, validationError || DEFAULT_VALIDATION_ERROR);
    return;
  }

  renderStatus(container, 'Looking up firmware build…');

  try {
    const manifest = await loadManifest();
    const builds = Array.isArray(manifest.builds) ? manifest.builds : [];
    const normalizedConfigKey = lookup.key.toLowerCase();
    const matchingBuilds = builds.filter((build) => {
      if (!build || typeof build.config_string !== 'string') {
        return false;
      }
      return build.config_string.toLowerCase() === normalizedConfigKey;
    });

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
  initializeCompatInstall,
  readInstallQueryParams,
  renderParameterError,
  REQUIRED_CONFIG_PARAMS,
  verifyImportedPresetCompatibility,
  deriveHardwareTargetDescriptor
};
