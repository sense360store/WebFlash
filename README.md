# Sense360 ESP32 Firmware WebFlash Interface

A simplified firmware management system for ESP32 devices using ESP Web Tools. This system automatically updates the firmware manifest when new binaries are uploaded.

## ✨ One-Step Firmware Addition Process

1. **Upload firmware binary** to the appropriate directory:
   ```
   firmware/[DeviceType]/[ChipFamily]/[Channel]/Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin
   ```

2. **Automatic manifest update** - The system automatically:
   - Scans the firmware directory
   - Extracts metadata from filename/path
   - Updates `manifest.json` with new firmware
   - ESP Web Tools shows new firmware immediately

## 📁 Directory Structure

```
WebFlash/
├── firmware/                          # Firmware binaries
│   ├── CO2Monitor/ESP32S3/stable/     # CO2 Monitor firmware
│   ├── EnvMonitor/ESP32/stable/       # Environmental Monitor firmware
│   ├── EnvMonitor/ESP32/beta/         # Beta versions
│   └── TempSensor/ESP32C3/stable/     # Temperature sensor firmware
├── scripts/
│   ├── update-manifest.py             # Automatic manifest generator
│   └── demo-add-firmware.sh           # Demo script
├── .github/workflows/
│   └── update-manifest.yml            # GitHub Actions automation
├── manifest.json                      # ESP Web Tools manifest (auto-generated)
├── index.html                         # Main installer interface
└── README.md                          # This file
```

## 🔧 Firmware Naming Convention

Firmware files must follow this naming pattern:
```
Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin
```

**Examples:**
- `Sense360-CO2Monitor-ESP32S3-v1.0.1-stable.bin`
- `Sense360-EnvMonitor-ESP32-v2.1.0-stable.bin`
- `Sense360-TempSensor-ESP32C3-v1.5.0-beta.bin`

**Parameters:**
- **DeviceType**: `CO2Monitor`, `EnvMonitor`, `TempSensor`, etc.
- **ChipFamily**: `ESP32`, `ESP32S2`, `ESP32S3`, `ESP32C3`, `ESP32C6`, `ESP32H2`
- **Version**: Semantic version (e.g., `1.0.1`, `2.1.0`)
- **Channel**: `stable`, `beta`, `alpha`

## 🚀 Usage

### Manual Update
```bash
# Update manifest with all firmware in directory
python3 scripts/update-manifest.py --validate

# Use custom firmware directory
python3 scripts/update-manifest.py --firmware-dir custom/path --validate
```

### Automatic GitHub Actions
The system automatically updates the manifest when:
- New `.bin` files are pushed to the `firmware/` directory
- Changes are made to existing firmware files

### Demo
```bash
# See the one-step process in action
./scripts/demo-add-firmware.sh
```

## 📊 Current Firmware Status

The system currently manages:
- **4 firmware builds** across **2 chip families** (ESP32, ESP32-S3)
- **2 device types** (CO2Monitor, EnvMonitor)
- **2 channels** (stable, beta)

## 🔍 Manifest Structure

The auto-generated `manifest.json` includes:
- **ESP Web Tools compatibility** - Standard format
- **Metadata extraction** - Device type, chip family, version, channel
- **File information** - Size, modification date, path
- **Validation** - Ensures all firmware files exist

## 🛠️ Technical Details

### ESP Web Tools Integration
- Uses official ESP Web Tools library
- Automatic chip detection
- Built-in flashing progress
- Improv Wi-Fi provisioning support

### Browser Requirements
- Chrome or Edge browsers (Web Serial API)
- HTTPS connection required
- Modern browser with Web Serial support

### Supported Chips
- ESP32 (all variants)
- ESP32-S2
- ESP32-S3  
- ESP32-C3
- ESP32-C6
- ESP32-H2

## 🔄 Workflow

1. **Developer uploads firmware** → `firmware/DeviceType/ChipFamily/Channel/`
2. **GitHub Actions triggers** → Detects new `.bin` files
3. **Script scans directory** → Finds all firmware binaries
4. **Metadata extraction** → Parses filename and directory structure
5. **Manifest update** → Generates new `manifest.json`
6. **ESP Web Tools reads** → Shows all available firmware automatically
7. **User selects firmware** → Flashes to device via browser

## 🎯 Benefits

- **Zero manual HTML editing** - Everything updates automatically
- **Consistent naming** - Enforced naming convention
- **Metadata tracking** - Version, size, modification dates
- **Multi-chip support** - Works with all ESP32 variants
- **GitHub Pages compatible** - Static hosting, no server required
- **Professional interface** - Clean, modern design