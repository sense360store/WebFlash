# Sense360 Wall Mount POE with AirIQ Base v1.0.0

## Configuration Details
- **Mounting Type**: Wall
- **Power Option**: POE Module
- **Expansion Modules**: AirIQ Base
- **Included Sensors**: SGP41, SCD41, MiCS4514, BMP390
- **Chip Family**: ESP32-S3
- **Version**: v1.0.0
- **Channel**: stable
- **Release Date**: 2025-07-25

## Description
Wall-mounted Sense360 with Power over Ethernet and AirIQ Base module for comprehensive air quality monitoring.

## Hardware Requirements
- ESP32-S3 WROOM Core Module
- POE Module for power and data
- AirIQ Base Module with SGP41, SCD41, MiCS4514, BMP390
- Wall mounting bracket

## Features
- Advanced air quality monitoring (VOC, CO2, gas detection)
- Atmospheric pressure sensing
- Power over Ethernet for single cable solution
- Home Assistant integration with air quality entities
- Real-time air quality index calculation

## Known Issues
- POE module requires 802.3af compliant switch
- Air quality sensors need 48-hour burn-in period

## Changelog
- Initial release with AirIQ Base support
- POE power management implementation
- Air quality calibration algorithms