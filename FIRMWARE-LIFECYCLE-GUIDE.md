# Firmware Lifecycle Management Guide

## Overview

This guide explains how the automated firmware lifecycle management system works for the Sense360 ESP32 firmware project.

## System Architecture

The lifecycle management system consists of:

1. **Firmware Lifecycle Manager** (`firmware-lifecycle-manager.py`)
2. **CI/CD Pipeline** (GitHub Actions)
3. **WebFlash Interface** (Auto-updating web interface)
4. **Version Tracking** (Deployment history and metrics)

## How It Works

### 1. Adding New Firmware

To add new firmware to the system:

1. **Create YAML Configuration:**
   ```yaml
   # Required metadata in comments
   # device_type: CO2Monitor
   # chip_family: ESP32S3
   # version: 1.0.0
   # channel: stable
   # description: Environmental monitoring with CO2 sensor
   # features: CO2 sensing, Temperature, Humidity, WiFi

   esphome:
     name: co2-monitor
     friendly_name: CO2 Monitor
     # ... rest of configuration
   ```

2. **Add to Repository:**
   - Place the YAML file in `iot-firmware-src/esphome/`
   - Commit and push to trigger CI/CD pipeline

3. **Automatic Processing:**
   - System detects new/modified YAML files
   - Builds firmware using ESPHome
   - Deploys to WebFlash repository
   - Updates manifest.json and web interface

### 2. Firmware Naming Convention

The system automatically generates firmware names using this format:
```
Sense360-{DeviceType}-{ChipFamily}-v{Version}-{Channel}.bin
```

Examples:
- `Sense360-CO2Monitor-ESP32S3-v1.0.0-stable.bin`
- `Sense360-TempSensor-ESP32-v2.1.0-beta.bin`

### 3. Directory Structure

Firmware is organized in the WebFlash repository as:
```
WebFlash/
├── firmware/
│   ├── CO2Monitor/
│   │   ├── ESP32S3/
│   │   │   ├── stable/
│   │   │   │   ├── firmware-latest.bin
│   │   │   │   └── firmware-20250712-143022.bin
│   │   │   └── beta/
│   │   │       └── firmware-latest.bin
│   │   └── ESP32/
│   │       └── stable/
│   │           └── firmware-latest.bin
│   └── TempSensor/
│       └── ESP32/
│           └── stable/
│               └── firmware-latest.bin
├── manifest.json (auto-generated)
└── index.html (auto-updated)
```

### 4. Metadata Extraction

The system extracts metadata from YAML file comments:

| Field | Description | Example |
|-------|-------------|---------|
| `device_type` | Device category | `CO2Monitor`, `TempSensor` |
| `chip_family` | ESP32 variant | `ESP32`, `ESP32S3`, `ESP32S2`, `ESP32C3` |
| `version` | Firmware version | `1.0.0`, `2.1.3` |
| `channel` | Release channel | `stable`, `beta`, `alpha` |
| `description` | Brief description | `Environmental monitoring` |
| `features` | Comma-separated features | `CO2, Temperature, WiFi` |

### 5. Lifecycle Management Features

#### Change Detection
- **File Hashing:** Detects modifications using SHA-256
- **Smart Building:** Only builds changed configurations
- **Incremental Updates:** Processes only new/modified files

#### Deployment Tracking
- **Build History:** Records all build attempts
- **Deployment Log:** Tracks successful deployments
- **Version Control:** Maintains firmware version history
- **Statistics:** Build success/failure rates

#### Automatic Cleanup
- **Old Firmware Removal:** Cleans files older than 30 days
- **Archive Management:** Prevents repository bloat
- **Selective Cleanup:** Preserves latest versions

## Usage Examples

### Manual Lifecycle Management

```bash
# Scan for changes
python3 firmware-lifecycle-manager.py --scan

# Run full lifecycle (build + deploy)
python3 firmware-lifecycle-manager.py --full

# Clean old firmware files
python3 firmware-lifecycle-manager.py --clean-old --days 30
```

### CI/CD Integration

The system integrates with GitHub Actions:

```yaml
- name: Run firmware lifecycle management
  run: |
    python3 scripts/firmware-lifecycle-manager.py --full
```

### Web Interface Updates

The web interface automatically updates based on deployed firmware:

- **No Firmware:** Shows "No Firmware Available" message
- **Single Firmware:** Shows firmware details and install button
- **Multiple Firmware:** Shows selection interface with filtering

## Monitoring and Debugging

### Lifecycle Log

The system maintains a comprehensive log in `firmware-lifecycle.json`:

```json
{
  "firmware_history": {
    "co2-monitor.yaml": {
      "hash": "abc123...",
      "last_build": "2025-07-12T14:30:22Z",
      "metadata": {
        "device_type": "CO2Monitor",
        "chip_family": "ESP32S3",
        "version": "1.0.0",
        "channel": "stable"
      }
    }
  },
  "deployments": [
    {
      "timestamp": "2025-07-12T14:30:22Z",
      "yaml_file": "co2-monitor.yaml",
      "firmware_name": "Sense360-CO2Monitor-ESP32S3-v1.0.0-stable.bin",
      "status": "success"
    }
  ],
  "statistics": {
    "total_builds": 5,
    "successful_deployments": 4,
    "failed_builds": 1
  }
}
```

### Build Debugging

For build failures:

1. Check CI/CD logs for compilation errors
2. Verify YAML syntax and metadata
3. Ensure all required secrets are set
4. Check ESP32 board compatibility

### Deployment Verification

To verify successful deployment:

1. Check WebFlash repository for firmware files
2. Verify manifest.json includes new firmware
3. Test web interface shows updated options
4. Confirm ESP Web Tools can flash firmware

## Best Practices

### YAML Configuration

1. **Always include metadata comments**
2. **Use semantic versioning (x.y.z)**
3. **Test configurations locally first**
4. **Use appropriate release channels**

### Version Management

1. **Increment versions for changes**
2. **Use beta channel for testing**
3. **Promote to stable after validation**
4. **Document breaking changes**

### Repository Organization

1. **Keep YAML files in esphome/ directory**
2. **Use descriptive filenames**
3. **Include comprehensive documentation**
4. **Regular cleanup of old versions**

## Troubleshooting

### Common Issues

1. **Build Failures:**
   - Check ESPHome version compatibility
   - Verify platform/framework versions
   - Ensure all required libraries are available

2. **Deployment Issues:**
   - Verify SSH keys for WebFlash repository
   - Check repository permissions
   - Confirm CI/CD secrets are set

3. **Web Interface Problems:**
   - Verify manifest.json syntax
   - Check firmware file paths
   - Ensure ESP Web Tools compatibility

### Recovery Procedures

1. **Failed Build Recovery:**
   ```bash
   # Clean build cache
   rm -rf esphome/.esphome/build/
   
   # Rebuild manually
   python3 firmware-lifecycle-manager.py --full
   ```

2. **Deployment Recovery:**
   ```bash
   # Re-run deployment
   python3 firmware-lifecycle-manager.py --deploy
   ```

3. **Interface Recovery:**
   ```bash
   # Update web interface
   python3 firmware-lifecycle-manager.py --full
   ```

## Integration with External Systems

### Home Assistant
- Firmware includes Home Assistant API
- Automatic discovery and configuration
- OTA updates through Home Assistant

### ESPHome Dashboard
- Compatible with ESPHome dashboard
- Remote configuration updates
- Centralized device management

### Version Control
- Git-based version tracking
- Automated tagging of releases
- Branch-based development workflow

## Future Enhancements

### Planned Features

1. **Multi-Repository Support:** Deploy to multiple target repositories
2. **Rollback Capability:** Automatic rollback on failed deployments
3. **Testing Integration:** Automated firmware testing before deployment
4. **Notification System:** Alerts for build/deployment status
5. **Web Dashboard:** Real-time monitoring interface

### Extensibility

The system is designed to be extensible:

1. **Plugin System:** Support for custom build steps
2. **Custom Deployers:** Support for different deployment targets
3. **Webhook Integration:** Integration with external systems
4. **API Interface:** RESTful API for external control

## Conclusion

The firmware lifecycle management system provides:

- **Automated Build/Deploy Pipeline**
- **Version Control and Tracking**
- **Intelligent Change Detection**
- **Comprehensive Monitoring**
- **Easy Maintenance and Cleanup**

This system ensures reliable, consistent firmware deployment while minimizing manual intervention and potential errors.