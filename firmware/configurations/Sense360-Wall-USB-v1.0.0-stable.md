# Sense360 Wall Mount USB Configuration v1.0.0

## Configuration Details
- **Mounting Type**: Wall
- **Power Option**: USB
- **Expansion Modules**: None (Base configuration)
- **Chip Family**: ESP32-S3
- **Version**: v1.0.0
- **Channel**: stable
- **Release Date**: 2025-07-25

## Description
Base firmware for Sense360 wall-mounted units with USB power. This is the minimal configuration with no expansion modules.

## Hardware Requirements
- ESP32-S3 WROOM Core Module
- USB-C power connection
- Wall mounting bracket

## Features
- Core module functionality
- Wi-Fi connectivity with Improv Serial
- Home Assistant integration
- OTA updates support
- Web dashboard

## Known Issues
- Initial Wi-Fi setup requires 60 seconds
- First boot takes 2 minutes for calibration

## Changelog
- Initial release with core functionality
- Wall mount specific optimizations
- USB power management