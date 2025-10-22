const MODULE_DEFINITIONS = {
    AirIQBase: {
        name: 'AirIQ Base Module',
        sensors: [
            'SGP41 VOC/NOx sensor',
            'SCD41 CO₂ sensor',
            'MiCS4514 gas sensor',
            'BMP390 barometric pressure sensor'
        ]
    },
    AirIQPro: {
        name: 'AirIQ Pro Module',
        extends: ['AirIQBase'],
        sensors: [
            'SEN0321 formaldehyde sensor',
            'SPS30 particulate matter sensor',
            'SFA40 differential pressure sensor'
        ]
    },
    Presence: {
        name: 'Presence Module',
        sensors: [
            'LD2450 24GHz radar presence sensor',
            'SEN0609 mmWave occupancy sensor'
        ]
    },
    Comfort: {
        name: 'Comfort Module',
        sensors: [
            'SHT40 temperature and humidity sensor',
            'LTR-303 ambient light sensor'
        ]
    },
    FanPWM: {
        name: 'Fan Module (PWM)',
        sensors: [
            'PWM fan control output'
        ]
    },
    FanAnalog: {
        name: 'Fan Module (0-10V Analog)',
        sensors: [
            '0-10V analog fan control output'
        ]
    }
};

function humanizeSegment(segment) {
    if (!segment) {
        return '';
    }

    const trimmed = segment.trim();
    if (!trimmed) {
        return '';
    }

    if (trimmed.toUpperCase() === trimmed) {
        return trimmed;
    }

    return trimmed
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normaliseModuleId(value) {
    if (!value) {
        return '';
    }

    return value.toString().trim();
}

function inferModulesFromConfigString(configString) {
    if (!configString) {
        return [];
    }

    const parts = configString.split('-').slice(2);
    return parts.map(normaliseModuleId).filter(Boolean);
}

function collectModuleSensors(moduleId, visited = new Set()) {
    const sensors = [];
    const id = normaliseModuleId(moduleId);
    if (!id || visited.has(id)) {
        return sensors;
    }

    visited.add(id);
    const definition = MODULE_DEFINITIONS[id];
    if (definition) {
        const bases = Array.isArray(definition.extends)
            ? definition.extends
            : definition.extends
                ? [definition.extends]
                : [];

        bases.forEach(baseId => {
            collectModuleSensors(baseId, visited).forEach(sensor => {
                if (!sensors.includes(sensor)) {
                    sensors.push(sensor);
                }
            });
        });

        (definition.sensors || []).forEach(sensor => {
            if (sensor && !sensors.includes(sensor)) {
                sensors.push(sensor);
            }
        });
    }

    return sensors;
}

function buildModuleEntries(moduleIds) {
    const entries = [];
    const aggregated = new Set();

    moduleIds.forEach(rawId => {
        const id = normaliseModuleId(rawId);
        if (!id) {
            return;
        }

        const definition = MODULE_DEFINITIONS[id] || null;
        const name = definition?.name || `${humanizeSegment(id)} Module`.trim();
        const sensors = collectModuleSensors(id);

        sensors.forEach(sensor => aggregated.add(sensor));

        entries.push({
            id,
            name,
            sensors
        });
    });

    return { entries, aggregated: Array.from(aggregated) };
}

function toSlug(value) {
    if (!value) {
        return '';
    }
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function buildFriendlyName(configString) {
    if (!configString) {
        return 'Sense360 Device';
    }

    const segments = configString.split('-').filter(Boolean);
    const [mounting, power, ...modules] = segments;

    const parts = [];
    if (mounting) {
        parts.push(humanizeSegment(mounting));
    }
    if (power) {
        parts.push(humanizeSegment(power));
    }
    modules.forEach(module => {
        if (module) {
            parts.push(humanizeSegment(module));
        }
    });

    if (!parts.length) {
        return 'Sense360 Device';
    }

    return `Sense360 ${parts.join(' · ')}`.trim();
}

function yamlScalar(value) {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'number') {
        if (Number.isFinite(value)) {
            return String(value);
        }
        return 'null';
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    return JSON.stringify(String(value));
}

function normalisePart(part) {
    if (!part || typeof part !== 'object') {
        return null;
    }

    const path = typeof part.path === 'string' ? part.path : '';
    const offset = typeof part.offset === 'number' && Number.isFinite(part.offset)
        ? part.offset
        : null;
    const md5 = typeof part.md5 === 'string' ? part.md5 : null;

    if (!path && offset === null && !md5) {
        return null;
    }

    return {
        path,
        offset,
        md5
    };
}

function buildEsphomeYamlContext({ firmware = null, configString = '', manifest = null } = {}) {
    const resolvedConfig = (configString || firmware?.config_string || '').toString().trim();
    if (!resolvedConfig) {
        return null;
    }

    const version = firmware?.version || null;
    const channel = firmware?.channel || null;
    const manifestIndex = Number.isFinite(firmware?.manifestIndex) ? Number(firmware.manifestIndex) : null;
    const deviceType = firmware?.device_type || firmware?.model || null;
    const modules = Array.isArray(firmware?.modules) && firmware.modules.length
        ? firmware.modules.map(normaliseModuleId)
        : inferModulesFromConfigString(resolvedConfig);

    const { entries: moduleEntries, aggregated } = buildModuleEntries(modules);

    const parts = Array.isArray(firmware?.parts)
        ? firmware.parts.map(normalisePart).filter(Boolean)
        : [];

    const slug = toSlug(resolvedConfig);
    const deviceName = slug ? `sense360-${slug}` : 'sense360-device';
    const friendlyName = buildFriendlyName(resolvedConfig);
    const md5 = typeof firmware?.md5 === 'string' ? firmware.md5 : null;
    const fileSize = Number.isFinite(firmware?.file_size) ? Number(firmware.file_size) : null;
    const manifestHash = manifest && typeof manifest?.version === 'string' ? manifest.version : null;
    const generatedAt = new Date().toISOString();
    const moduleSummary = moduleEntries.length
        ? moduleEntries.map(entry => entry.name).join(', ')
        : 'No expansion modules';

    const projectVersion = version
        ? `v${version}${channel ? `-${channel}` : ''}`
        : (channel || 'custom');

    const yamlFileName = `${deviceName || 'sense360-device'}.yaml`;

    return {
        configString: resolvedConfig,
        version,
        channel,
        manifestIndex,
        deviceType,
        modules: moduleEntries,
        aggregatedSensors: aggregated,
        parts,
        slug,
        deviceName,
        friendlyName,
        md5,
        fileSize,
        manifestVersion: manifestHash,
        generatedAt,
        moduleSummary,
        projectVersion,
        yamlFileName
    };
}

function buildYamlFromContext(context) {
    if (!context) {
        return '';
    }

    const lines = [];
    lines.push(`# Auto-generated ESPHome package for ${context.configString}`);
    lines.push(`# Generated at ${context.generatedAt}`);
    if (context.manifestVersion) {
        lines.push(`# Manifest version ${context.manifestVersion}`);
    }
    lines.push('');
    lines.push('substitutions:');
    lines.push(`  device_name: ${yamlScalar(context.deviceName)}`);
    lines.push(`  friendly_name: ${yamlScalar(context.friendlyName)}`);
    lines.push(`  sense360_config_string: ${yamlScalar(context.configString)}`);
    lines.push(`  sense360_firmware_channel: ${yamlScalar(context.channel || 'unknown')}`);
    lines.push(`  sense360_firmware_version: ${yamlScalar(context.version || 'unknown')}`);
    if (context.parts[0]?.path) {
        lines.push(`  sense360_primary_binary: ${yamlScalar(context.parts[0].path)}`);
    }
    lines.push('');
    lines.push('esphome:');
    lines.push('  name: ${device_name}');
    lines.push('  friendly_name: ${friendly_name}');
    lines.push('  name_add_mac_suffix: true');
    lines.push('  project:');
    lines.push('    name: sense360.webflash');
    lines.push(`    version: ${yamlScalar(context.projectVersion)}`);
    lines.push('');
    lines.push('dashboard_import:');
    lines.push(`  package_import_url: ${yamlScalar('./manifest.json')}`);
    lines.push('');
    lines.push('sense360:');
    lines.push(`  config_string: ${yamlScalar(context.configString)}`);
    lines.push(`  module_summary: ${yamlScalar(context.moduleSummary)}`);
    if (context.modules.length) {
        lines.push('  modules:');
        context.modules.forEach(module => {
            lines.push('    - id: ' + yamlScalar(module.id));
            lines.push('      name: ' + yamlScalar(module.name));
            if (module.sensors.length) {
                lines.push('      sensors:');
                module.sensors.forEach(sensor => {
                    lines.push('        - ' + yamlScalar(sensor));
                });
            } else {
                lines.push('      sensors: []');
            }
        });
    } else {
        lines.push('  modules: []');
    }

    if (context.aggregatedSensors.length) {
        lines.push('  aggregated_sensors:');
        context.aggregatedSensors.forEach(sensor => {
            lines.push('    - ' + yamlScalar(sensor));
        });
    }

    lines.push('  firmware:');
    lines.push(`    version: ${yamlScalar(context.version || 'unknown')}`);
    lines.push(`    channel: ${yamlScalar(context.channel || 'unknown')}`);
    if (context.deviceType) {
        lines.push(`    device_type: ${yamlScalar(context.deviceType)}`);
    }
    if (context.manifestIndex !== null && context.manifestIndex !== undefined) {
        lines.push(`    manifest_index: ${yamlScalar(context.manifestIndex)}`);
    }
    if (context.md5) {
        lines.push(`    md5: ${yamlScalar(context.md5)}`);
    }
    if (context.fileSize) {
        lines.push(`    file_size_bytes: ${yamlScalar(context.fileSize)}`);
    }
    if (context.parts.length) {
        lines.push('    parts:');
        context.parts.forEach(part => {
            lines.push('      - path: ' + yamlScalar(part.path));
            if (part.offset !== null && part.offset !== undefined) {
                lines.push('        offset: ' + yamlScalar(part.offset));
            }
            if (part.md5) {
                lines.push('        md5: ' + yamlScalar(part.md5));
            }
        });
    } else {
        lines.push('    parts: []');
    }

    lines.push(`  generated_at: ${yamlScalar(context.generatedAt)}`);

    lines.push('');
    lines.push('# Add your Wi-Fi credentials and other integration details below.');
    lines.push('wifi:');
    lines.push('  ssid: !secret wifi_ssid');
    lines.push('  password: !secret wifi_password');
    lines.push('');
    lines.push('logger:');
    lines.push('  level: INFO');
    lines.push('');
    lines.push('api:');
    lines.push('');
    lines.push('ota:');

    return `${lines.join('\n')}\n`;
}

function generateEsphomeYaml(options = {}) {
    const context = buildEsphomeYamlContext(options);
    if (!context) {
        return { yaml: '', context: null };
    }

    const yaml = buildYamlFromContext(context);
    return { yaml, context };
}

export {
    MODULE_DEFINITIONS,
    buildEsphomeYamlContext,
    buildYamlFromContext,
    generateEsphomeYaml
};
