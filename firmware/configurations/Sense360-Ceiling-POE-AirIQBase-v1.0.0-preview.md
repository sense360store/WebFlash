# Sense360 Ceiling Mount POE with AirIQ Base v1.0.0 (Preview)

## Configuration Details
- **Mounting Type**: Ceiling
- **Power Option**: POE Module
- **Expansion Modules**: AirIQ Base
- **Included Sensors**: SGP41, SCD41, MiCS4514, BMP390
- **Chip Family**: ESP32-S3
- **Version**: v1.0.0
- **Channel**: preview
- **Release Date**: 2025-07-25

## Description
Preview firmware for ceiling-mounted POE builds with the AirIQ Base module. Includes early adjustments to POE startup timing and sensor calibration flows.

## Hardware Requirements
- ESP32-S3 WROOM Core Module
- POE Module for power and data
- AirIQ Base Module with SGP41, SCD41, MiCS4514, BMP390
- Ceiling mounting hardware

## Features
- Experimental VOC calibration sequences for validation
- Updated POE negotiation behaviour under review
- Improv Wi-Fi provisioning compatible with ESP Web Tools
- MQTT telemetry formatted for Home Assistant integrations

## Preview Notes
- Monitor POE switch compatibility and calibration stability during testing
