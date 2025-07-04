# Sense360 ESP32 Installer

A web-based installer for Sense360 v2.0.0 firmware using the official ESP Web Tools library. This tool provides a simple, browser-based interface for flashing Sense360 firmware to ESP32 devices via USB.

## Features

- **Browser-based flashing** - No software installation required
- **ESP Web Tools integration** - Uses the official, battle-tested ESP Web Tools library
- **Multi-chip support** - ESP32, ESP32-S2, ESP32-C3, ESP32-S3
- **Automatic device detection** - Detects connected ESP32 devices automatically
- **Wi-Fi provisioning** - Supports Improv protocol for easy Wi-Fi setup
- **User-friendly interface** - Clean, minimal design with built-in troubleshooting

## Requirements

- **Chrome or Edge browser** (Web Serial API support required)
- **HTTPS connection** (required for Web Serial API)
- **ESP32 device** with USB connection

## Usage

1. Visit the deployed application at: [Your GitHub Pages URL]
2. Connect your ESP32 device via USB
3. Click "Connect Device" button
4. Select your device from the browser's device picker
5. Follow the on-screen instructions to flash firmware

## Local Development

To run this project locally:

1. Clone the repository
2. Serve the files using a local web server (HTTPS required)
3. Open in Chrome or Edge browser

### Using Python:
```bash
python3 -m http.server 5000
```

### Using Node.js:
```bash
npx http-server -p 5000
```

## Deployment

This project is designed for deployment on GitHub Pages. The included GitHub Actions workflow automatically deploys the site when changes are pushed to the main branch.

### GitHub Pages Setup

1. Go to your repository's Settings > Pages
2. Select "Deploy from a branch" as the source
3. Choose "main" branch and "/ (root)" folder
4. The site will be available at `https://yourusername.github.io/repository-name`

## Firmware Files

Place your firmware binary files in the `firmware/` directory and update the `manifest.json` file accordingly.

### Manifest Format

The `manifest.json` file defines the available firmware builds:

```json
{
  "name": "Your Firmware Name",
  "version": "1.0.0",
  "new_install_prompt_erase": true,
  "new_install_improv_wait_time": 10,
  "builds": [
    {
      "chipFamily": "ESP32",
      "improv": true,
      "parts": [
        {
          "path": "firmware/esp32-firmware.bin",
          "offset": 0
        }
      ]
    }
  ]
}
```

## CORS Configuration

If hosting firmware files on a different domain, ensure proper CORS headers are configured:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Browser Compatibility

This application requires browsers that support the Web Serial API:

- ✅ Chrome 89+
- ✅ Edge 89+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

## Troubleshooting

### Device Not Detected
- Ensure ESP32 is connected via USB
- Try a different USB cable or port
- Check that you're using Chrome or Edge
- Verify the site is accessed via HTTPS

### Flashing Issues
- Hold the BOOT button while connecting (if available)
- Close other applications that might be using the serial port
- Try resetting the device before flashing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is open source and available under the MIT License.

## Credits

- Built with [ESP Web Tools](https://github.com/esphome/esp-web-tools)
- Inspired by [squeezelite-esp32-installer](https://github.com/sle118/squeezelite-esp32-installer)
- Uses the Web Serial API for device communication