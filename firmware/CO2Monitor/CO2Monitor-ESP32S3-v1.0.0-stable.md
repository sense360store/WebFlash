# CO2Monitor ESP32-S3 v1.0.0 Stable Release

## Device Information
Model: Sense360-MS
Device Type: Multi Sensor AQI
Variant: Standard
Built-in Sensors: LTR303, SCD40, SHT30
Addon Sensors: Sen55x, HLK2450
Chip Family: ESP32-S3
Version: v1.0.0
Channel: stable
Release Date: 2025-07-13

## Release Description
Initial release with basic CO2 monitoring capabilities

## Features
- Basic CO2 level monitoring
- Temperature and humidity sensing
- Wi-Fi connectivity with Improv setup
- Web dashboard for real-time monitoring
- MQTT integration for Home Assistant
- Low power consumption optimizations

## Hardware Requirements
- ESP32-S3 development board
- CO2 sensor (MH-Z19B or similar)
- Temperature/humidity sensor (DHT22)
- 3.3V power supply

## Installation Notes
- Flash using ESP Web Tools
- Configure Wi-Fi using Improv protocol
- Default CO2 calibration included
- No additional hardware configuration required

## Known Issues
- CO2 sensor requires 3-minute warm-up period
- Wi-Fi connection timeout after 60 seconds

## Changelog
- Initial firmware release
- Basic CO2 monitoring implementation
- Web interface for sensor readings
- MQTT support for home automation