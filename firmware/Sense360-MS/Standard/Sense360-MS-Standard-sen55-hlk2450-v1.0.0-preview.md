# Sense360-MS ESP32-S3 v1.0.0 Preview Release (with Sen55x + HLK2450)

## Device Information
Model: Sense360-MS
Device Type: Core Module
Variant: Standard-sen55-hlk2450
Built-in Sensors: LTR303, SCD40, SHT30
Expansion Modules: Sen55x, HLK2450
Chip Family: ESP32-S3
Version: v1.0.0
Channel: preview
Release Date: 2025-07-13

## Release Description
Preview firmware enabling the AirIQ and Presence expansion modules. Includes early testing updates for the Sen55x air quality stack and HLK2450 radar tuning ahead of general availability certification.

## Firmware Variants Summary

| Firmware File Name | Sensors Included |
|---------------------|------------------|
| Sense360-MS-Standard-v1.0.0-preview.bin | LTR303, SCD40, SHT30 |
| Sense360-MS-Standard-sen55-hlk2450-v1.0.0-preview.bin | LTR303, SCD40, SHT30, Sen55x, HLK2450 |

**Base firmware** (Sense360-MS-Standard-v1.0.0-preview.bin) supports the core sensors only.

**Add-on firmware** (Sense360-MS-Standard-sen55-hlk2450-v1.0.0-preview.bin) supports all core sensors plus the Sen55x and HLK2450 optional sensors.

## Key Features
- Advanced air quality monitoring with multiple sensors
- Light sensing with LTR303 sensor
- CO2 monitoring with SCD40 sensor
- Temperature and humidity sensing with SHT30 sensor
- **Sen55x particulate matter sensor** (PM1.0, PM2.5, PM4.0, PM10)
- **HLK2450 radar presence detection** (human presence, distance, movement)
- Wi-Fi connectivity with Improv Serial setup
- Comprehensive web dashboard for real-time monitoring
- MQTT integration for Home Assistant support
- Early access tuning for particulate averaging and radar sensitivity

## Hardware Requirements
- ESP32-S3 development board
- LTR303 light sensor
- SCD40 CO2 sensor
- SHT30 temperature/humidity sensor
- Sen55x particulate matter sensor
- HLK2450 radar sensor

## Known Issues
- Preview builds may include experimental calibration constants; validate deployments carefully
- CO2 sensor requires 3-minute warm-up period
- Sen55x sensor requires 30-second initialization
- HLK2450 sensor requires 10-second calibration
- Wi-Fi connection timeout after 60 seconds

## Changelog
- Aligns with the 1.0.0 general feature set while introducing telemetry adjustments under review
