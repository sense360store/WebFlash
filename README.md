# WebFlash - Sense360 ESP32 Firmware Installer

This is the **public** repository containing the web-based firmware installer for Sense360 ESP32 devices.

## Live Web Interface

🌐 **https://sense360store.github.io/WebFlash**

## Features

- **Browser-based Installation**: Flash firmware directly from your web browser
- **Multi-device Support**: ESP32, ESP32-S2, ESP32-S3, ESP32-C3 compatibility
- **Automatic Updates**: Firmware manifest and web interface updated automatically
- **Timestamp Tracking**: See when each firmware was last updated
- **ESP Web Tools**: Built on the official ESP Web Tools library

## Repository Structure

```
WebFlash/
├── index.html                  # Main web interface
├── css/style.css              # Styling
├── manifest.json              # ESP Web Tools manifest
├── firmware-timestamps.json   # Firmware deployment timestamps
├── firmware/                  # Compiled firmware binaries
│   ├── DeviceType/
│   │   ├── ChipFamily/
│   │   │   ├── stable/
│   │   │   │   ├── firmware-latest.bin
│   │   │   │   └── *.bin
│   │   │   └── beta/
│   │   │       ├── firmware-latest.bin
│   │   │       └── *.bin
│   │   └── ...
│   └── ...
├── scripts/                   # Auto-generated scripts
│   └── update-web-interface.py
├── _headers                   # CORS headers for GitHub Pages
└── README.md                  # This file
```

## How It Works

### 1. Automatic Deployment

Firmware is automatically deployed from the private `iot-firmware-src` repository:

1. **Build**: ESPHome compiles firmware from YAML configurations
2. **Deploy**: Compiled binaries are pushed to this repository
3. **Update**: Manifest and web interface are automatically updated
4. **Publish**: GitHub Pages serves the updated web interface

### 2. Web Interface

The web interface provides:

- **Device Selection**: Choose your ESP32 device type
- **Firmware Filtering**: Filter by device family and release channel
- **One-Click Installation**: Connect and flash firmware via USB
- **Progress Tracking**: Real-time installation progress
- **Troubleshooting**: Built-in help and error handling

### 3. ESP Web Tools Integration

Uses the official ESP Web Tools library for:

- **Device Detection**: Automatic ESP32 chip identification
- **Secure Flashing**: Safe firmware installation process
- **Progress Monitoring**: Real-time installation feedback
- **Error Handling**: Comprehensive error reporting

## Browser Requirements

- **Chrome or Edge**: Web Serial API support required
- **HTTPS**: Secure context required for Web Serial API
- **Modern Browser**: Latest version recommended

## Firmware Information

### Naming Convention

```
Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin
```

Examples:
- `Sense360-CO2Monitor-ESP32S3-v2.0.1-beta.bin`
- `Sense360-TempSensor-ESP32-v1.0.0-stable.bin`

### Release Channels

- **Stable**: Production-ready firmware
- **Beta**: Testing releases with new features
- **Alpha**: Development builds (if available)

### Supported Devices

- **ESP32**: Original ESP32 with dual-core processor
- **ESP32-S2**: Single-core with enhanced security
- **ESP32-S3**: Dual-core with AI acceleration
- **ESP32-C3**: RISC-V based with Wi-Fi 6

## Installation Instructions

### 1. Prepare Your Device

1. Connect ESP32 to your computer via USB
2. Install USB drivers if needed (usually automatic)
3. Close any other programs using the serial port

### 2. Flash Firmware

1. Visit **https://sense360store.github.io/WebFlash**
2. Select your device type and firmware channel
3. Click "Connect & Install Firmware"
4. Choose your device from the popup
5. Wait for installation to complete

### 3. First Setup

After flashing:

1. Device will create a Wi-Fi hotspot (configureme-xxxx)
2. Connect to the hotspot with your phone/computer
3. Configure your Wi-Fi settings
4. Device will connect to your network

## Troubleshooting

### Device Not Detected

- **Check USB Connection**: Ensure cable is connected properly
- **Install Drivers**: Some devices need specific USB drivers
- **Try Different Cable**: Use a data cable, not charging-only
- **Check Browser**: Use Chrome or Edge browser

### Installation Failed

- **Download Mode**: Hold BOOT button while connecting
- **Close Other Programs**: Arduino IDE, serial monitors, etc.
- **Try Different Port**: Use a different USB port
- **Check Permissions**: Some systems need admin privileges

### Connection Issues

- **Network Problems**: Check Wi-Fi settings and password
- **Signal Strength**: Move closer to router during setup
- **Firewall**: Temporarily disable firewall if needed
- **Router Settings**: Some routers block new device connections

## Development

### Local Testing

```bash
# Serve locally
python3 -m http.server 8000

# Visit http://localhost:8000
```

### File Updates

The following files are automatically updated:

- `manifest.json`: Generated from deployed firmware
- `index.html`: Updated with available firmware options
- `firmware-timestamps.json`: Deployment timestamps

**Do not manually edit these files** - they are overwritten by automation.

## GitHub Pages Configuration

- **Source**: Deploy from main branch
- **Domain**: sense360store.github.io/WebFlash
- **CORS**: Configured via `_headers` file
- **HTTPS**: Enforced for Web Serial API compatibility

## Support

### Common Issues

1. **Browser Compatibility**: Use Chrome or Edge
2. **HTTPS Required**: Web Serial API needs secure context
3. **Device Drivers**: Install appropriate USB drivers
4. **Firewall/Antivirus**: May block serial port access

### Getting Help

- **GitHub Issues**: Report problems on this repository
- **Documentation**: Check troubleshooting section above
- **Community**: Ask questions in discussions

## Technical Details

### ESP Web Tools

- **Library**: https://unpkg.com/esp-web-tools@10
- **Protocol**: Web Serial API for device communication
- **Security**: Runs entirely in browser, no server required
- **Compatibility**: Works with all ESP32 variants

### Manifest Format

```json
{
  "name": "Sense360 ESP32 Firmware",
  "version": "2.0.0",
  "builds": [
    {
      "name": "Device Name",
      "chipFamily": "ESP32S3",
      "parts": [
        {
          "path": "firmware/path/to/firmware.bin",
          "offset": 0
        }
      ]
    }
  ]
}
```

## License

This project is licensed under the MIT License. See the ESP Web Tools library for its specific license terms.