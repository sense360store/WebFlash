# Sense360-MS ESP32-S3 v1.0.0 General Release

## Device Information
Model: Sense360-MS
Device Type: Core Module
Variant: Standard
Built-in Sensors: LTR303, SCD40, SHT30
Expansion Modules: None
Chip Family: ESP32-S3
Version: v1.0.0
Channel: general
Release Date: 2025-07-13

## Release Description
Core Module firmware for the Sense360 modular ESP32-S3 platform with essential environmental monitoring. Designed for Home Assistant integration with standardized expansion headers.

## Firmware Variants Summary

| Firmware File Name | Sensors Included |
|---------------------|------------------|
| Sense360-MS-Standard-v1.0.0-general.bin | LTR303, SCD40, SHT30 |
| Sense360-MS-Standard-sen55-hlk2450-v1.0.0-general.bin | LTR303, SCD40, SHT30, Sen55x, HLK2450 |

**Base firmware** (Sense360-MS-Standard-v1.0.0-general.bin) supports the core sensors only.

**Add-on firmware** (Sense360-MS-Standard-sen55-hlk2450-v1.0.0-general.bin) supports all core sensors plus the Sen55x and HLK2450 optional sensors.

## Key Features
- Core air quality monitoring with essential sensors
- Light sensing with LTR303 sensor
- CO2 monitoring with SCD40 sensor
- Temperature and humidity sensing with SHT30 sensor
- Wi-Fi connectivity with Improv Serial setup
- Comprehensive web dashboard for real-time monitoring
- MQTT integration for Home Assistant support
- Optimized for core sensor functionality

## Hardware Requirements
- ESP32-S3 development board
- LTR303 light sensor
- SCD40 CO2 sensor
- SHT30 temperature/humidity sensor

## Known Issues
- CO2 sensor requires 3-minute warm-up period
- Wi-Fi connection timeout after 60 seconds

## Changelog
- Initial release with core sensor support
- Integrated basic air quality monitoring
- Optimized for essential environmental sensing
- Core sensor calibration routines
