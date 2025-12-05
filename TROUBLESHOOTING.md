# Troubleshooting Guide

Common issues and solutions for WebFlash firmware installation.

## Table of Contents

- [Browser Issues](#browser-issues)
- [Connection Issues](#connection-issues)
- [Installation Issues](#installation-issues)
- [Configuration Issues](#configuration-issues)
- [Wi-Fi Setup Issues](#wi-fi-setup-issues)
- [Device Issues](#device-issues)
- [Advanced Debugging](#advanced-debugging)

## Browser Issues

### Unsupported Browser

**Symptoms:**
- "Web Serial not supported" message
- Install button disabled or missing
- Serial port selection not available

**Solutions:**
1. Use Chrome, Edge, or Opera browser (version 89+)
2. Update browser to latest version
3. Enable experimental features:
   - Navigate to `chrome://flags`
   - Search for "Web Serial API"
   - Enable the feature
   - Restart browser

**Note:** Firefox and Safari do not fully support Web Serial API.

### Browser Permissions Denied

**Symptoms:**
- "Permission denied" when selecting port
- Device list empty after clicking "Connect"

**Solutions:**
1. Check site permissions:
   - Click lock icon in address bar
   - Verify "Serial port" is allowed
   - Reset permissions and try again
2. Close other tabs using serial ports
3. Restart browser
4. Clear site data and reload

### CORS or Network Errors

**Symptoms:**
- "Failed to fetch" during installation
- Manifest loading errors
- Resources blocked messages

**Solutions:**
1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
2. Disable browser extensions temporarily
3. Check using official URL: https://sense360store.github.io/WebFlash/
4. Try incognito/private browsing mode
5. Verify internet connection

## Connection Issues

### Device Not Detected

**Symptoms:**
- Empty port list when clicking "Connect"
- Device not showing up in serial port selection
- "No compatible devices found"

**Solutions:**
1. **Check USB cable:**
   - Use data-capable cable (not charge-only)
   - Try different cable
   - Verify cable supports data transfer

2. **Check USB port:**
   - Try different USB port
   - Use USB 2.0 port if 3.0 causes issues
   - Avoid USB hubs if possible

3. **Check other software:**
   - Close Arduino IDE
   - Close PlatformIO
   - Close other serial terminal programs
   - Close other instances of WebFlash

4. **Check drivers (Windows):**
   - Install CP210x USB to UART drivers
   - Install CH340 drivers if applicable
   - Check Device Manager for unknown devices

5. **Check permissions (Linux):**
   ```bash
   # Add user to dialout group
   sudo usermod -a -G dialout $USER

   # Log out and log back in

   # Verify permissions
   ls -l /dev/ttyUSB*
   ```

6. **Check permissions (macOS):**
   - Grant Terminal/Browser accessibility permissions
   - System Preferences > Security & Privacy > Privacy

### Connection Drops During Installation

**Symptoms:**
- Installation starts but fails midway
- "Device disconnected" error
- Progress bar stops

**Solutions:**
1. Use shorter, higher-quality USB cable
2. Connect directly to computer (not through hub)
3. Try different USB port
4. Ensure device has stable power
5. Disable USB selective suspend (Windows):
   - Control Panel > Power Options
   - Change plan settings > Advanced
   - USB settings > Disable selective suspend

## Installation Issues

### Installation Fails Immediately

**Symptoms:**
- Error message right after clicking Install
- Cannot enter bootloader mode
- Installation aborts at 0%

**Solutions:**
1. **Enter bootloader mode manually:**
   - Hold BOOT button on device
   - Press and release RESET button
   - Release BOOT button
   - Try installation again

2. **Reset device:**
   - Disconnect USB
   - Wait 10 seconds
   - Reconnect USB
   - Try again

3. **Check firmware file:**
   - Verify firmware downloaded completely
   - Check file size is not 0 bytes
   - Try different firmware version

### Installation Fails Partway

**Symptoms:**
- Progress bar stops at specific percentage
- Verification errors
- Checksum failures

**Solutions:**
1. **Retry installation:**
   - Refresh browser page
   - Reconnect device
   - Start installation again

2. **Check USB connection:**
   - Ensure cable firmly connected
   - Try different cable or port
   - Avoid USB hubs

3. **Check device memory:**
   - Device may have corrupted flash
   - Try rescue firmware if available
   - Contact support for RMA

### Verification Fails

**Symptoms:**
- "Verification failed" message
- Firmware installed but won't boot
- Device stuck in boot loop

**Solutions:**
1. Re-install firmware:
   - Complete erase first (if option available)
   - Install again
   - Verify installation completes

2. Try different firmware:
   - Switch to stable channel
   - Try older version
   - Verify configuration matches hardware

3. Factory reset:
   - Hold BOOT during power-up
   - Use rescue firmware to restore
   - Contact support if persists

## Configuration Issues

### Wrong Firmware Selected

**Symptoms:**
- Device not functioning after flash
- Missing features or sensors
- Errors in device logs

**Solutions:**
1. Identify correct configuration:
   - Check physical hardware
   - Note mounting type (Wall/Ceiling)
   - Identify power source (USB/POE/PWR)
   - List installed modules

2. Re-flash with correct firmware:
   - Select proper configuration in wizard
   - Verify all options match hardware
   - Install correct firmware

### Unsure of Configuration

**Symptoms:**
- Don't know which firmware to select
- Multiple options seem correct
- Hardware specifications unclear

**Solutions:**
1. Check device documentation
2. Look for labels or markings on device
3. Contact support with:
   - Device photos
   - Serial number
   - Purchase information
   - Installed modules

### Module Not Working After Flash

**Symptoms:**
- Specific module not responding
- Sensor data missing
- Feature not available

**Solutions:**
1. Verify module selected in configuration
2. Check module physically connected
3. Verify module compatible with mounting type
4. Re-flash with module enabled
5. Check module requires specific power option

## Wi-Fi Setup Issues

### Wi-Fi Prompt Not Appearing

**Symptoms:**
- Installation completes but no Wi-Fi prompt
- Browser doesn't ask for credentials
- Improv setup window missing

**Solutions:**
1. Keep browser window open after flashing
2. Wait 30 seconds for device to boot
3. Refresh page and try "Configure Wi-Fi" if available
4. Check firmware has Improv support enabled
5. Try different browser

### Wi-Fi Connection Fails

**Symptoms:**
- Credentials entered but connection fails
- Device not joining network
- Cannot find device on network

**Solutions:**
1. **Verify Wi-Fi credentials:**
   - Check SSID spelling (case-sensitive)
   - Verify password correct
   - Ensure no special characters causing issues

2. **Check network compatibility:**
   - Device requires 2.4GHz network
   - 5GHz-only networks not supported
   - Check router broadcasts 2.4GHz SSID

3. **Router settings:**
   - Disable AP isolation
   - Enable DHCP
   - Check MAC filtering not blocking device
   - Verify not at DHCP address limit

4. **Signal strength:**
   - Move device closer to router
   - Reduce interference
   - Check router antenna position

### Cannot Find Device on Network

**Symptoms:**
- Wi-Fi connected but device not accessible
- IP address unknown
- Home Assistant not discovering device

**Solutions:**
1. Check router DHCP client list for device
2. Use network scanner to find device:
   ```bash
   # Using nmap
   nmap -sn 192.168.1.0/24

   # Using arp-scan
   sudo arp-scan --local
   ```
3. Check Home Assistant integrations for auto-discovery
4. Wait 5 minutes for mDNS propagation
5. Restart router if device not appearing

## Device Issues

### Device Not Responding After Flash

**Symptoms:**
- Device appears dead
- No LED activity
- Not connecting to network

**Solutions:**
1. **Power cycle:**
   - Disconnect power
   - Wait 10 seconds
   - Reconnect power

2. **Check power supply:**
   - Verify adequate power for configuration
   - USB port may not provide enough power
   - Try powered USB hub or wall adapter

3. **Check for boot loops:**
   - Connect to serial monitor
   - Check for repeating error messages
   - May indicate wrong firmware

4. **Re-flash firmware:**
   - Verify correct configuration
   - Try stable channel
   - Complete full installation

### Device Constantly Rebooting

**Symptoms:**
- LED flashing pattern indicates reboot
- Cannot complete Wi-Fi setup
- Serial output shows boot messages repeating

**Solutions:**
1. Wrong firmware configuration - re-flash correct version
2. Insufficient power - use better power source
3. Hardware fault - contact support
4. Corrupted flash - erase and re-install

### Partial Functionality

**Symptoms:**
- Some sensors working, others not
- Features missing
- Intermittent operation

**Solutions:**
1. Verify firmware configuration matches hardware
2. Check all modules properly connected
3. Verify module compatibility with power source
4. Re-flash firmware with correct options
5. Contact support with configuration details

## Advanced Debugging

### Serial Console Monitoring

For developers and advanced users:

```bash
# Using screen (Linux/macOS)
screen /dev/ttyUSB0 115200

# Using PuTTY (Windows)
# Set COM port and baud rate 115200

# Using esptool
esptool.py --port /dev/ttyUSB0 monitor
```

Common error messages:
- `Brownout detector`: Insufficient power
- `Fatal exception`: Wrong firmware or hardware fault
- `Boot mode`: Stuck in bootloader, re-flash needed

### Checking Firmware Version

After successful flash and network connection:

1. Access device web interface (if available)
2. Check Home Assistant device information
3. Use serial console to view boot messages
4. Check logs for version information

### Accessing Device Logs

Real-time logs during installation:

1. Keep browser console open (F12)
2. Monitor ESP Web Tools output
3. Check for error messages
4. Share logs with support if needed

Export support bundle:

1. Complete wizard through Review step
2. Click "Copy Support Info" button
3. Share with support team

### Complete Reset

If all else fails:

1. **Full erase (if available in ESP Web Tools):**
   - Select "Erase device" option
   - Complete erase
   - Re-install firmware

2. **Manual erase via esptool:**
   ```bash
   esptool.py --port /dev/ttyUSB0 erase_flash
   ```

3. **Re-flash via WebFlash:**
   - Start from beginning
   - Verify configuration
   - Complete installation
   - Set up Wi-Fi

## Getting Additional Help

If issues persist after trying these solutions:

1. **Gather information:**
   - Device configuration (mounting, power, modules)
   - Firmware version and channel
   - Browser type and version
   - Operating system
   - Error messages (exact text or screenshots)
   - Support bundle from WebFlash

2. **Contact support:**
   - Email with all gathered information
   - Include serial number if available
   - Describe steps already attempted
   - Share support bundle and logs

3. **Community resources:**
   - Check Home Assistant community forums
   - Review ESPHome documentation
   - Search for similar issues

## Prevention Best Practices

To avoid issues:

1. **Always:**
   - Use quality USB cables
   - Verify configuration before flashing
   - Use stable firmware for production
   - Keep browser updated
   - Test on stable network

2. **Never:**
   - Disconnect during flashing
   - Use untested beta firmware in production
   - Mix configurations (e.g., Wall firmware on Ceiling mount)
   - Skip verification step
   - Ignore hardware requirements

3. **Recommended:**
   - Test new firmware on one device first
   - Keep record of working configurations
   - Document any custom settings
   - Maintain firmware version inventory
   - Create network before flashing multiple devices

## Platform-Specific Notes

### Windows
- May require driver installation (CP210x, CH340)
- Disable antivirus temporarily if blocking serial access
- Use Device Manager to verify COM port

### macOS
- Usually works without additional drivers
- Grant browser security permissions
- Check /dev/cu.* devices

### Linux
- Add user to dialout group
- Check udev rules for serial devices
- Verify permissions on /dev/ttyUSB* or /dev/ttyACM*

### ChromeOS
- Limited serial support
- May require Developer Mode
- Use Android version of Chrome if available

## Error Code Reference

Common ESP Web Tools errors:

- **Error 1**: Connection failed - check cable and port
- **Error 2**: Upload failed - retry or check device
- **Error 3**: Verification failed - re-flash firmware
- **Error 4**: Timeout - check connection and device state

Improv Serial errors:

- **Error 1**: Wi-Fi scan failed - device issue
- **Error 2**: Invalid credentials - check SSID/password
- **Error 3**: Connection timeout - network issue
- **Error 4**: DHCP failed - router configuration

## Additional Resources

- [ESP Web Tools Documentation](https://esphome.github.io/esp-web-tools/)
- [ESPHome Documentation](https://esphome.io/)
- [Home Assistant Community](https://community.home-assistant.io/)
- [Developer Guide](DEVELOPER.md)
- [Main Documentation](README.md)
