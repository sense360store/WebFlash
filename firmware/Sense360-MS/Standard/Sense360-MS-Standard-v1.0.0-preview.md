# Sense360-MS ESP32-S3 v1.0.0 Preview Release

## Device Information
Model: Sense360-MS
Device Type: Core Module
Variant: Standard
Built-in Sensors: LTR303, SCD40, SHT30
Expansion Modules: None
Chip Family: ESP32-S3
Version: v1.0.0
Channel: preview
Release Date: 2025-07-13

## Release Description
Preview firmware for the Sense360 modular ESP32-S3 platform with essential environmental monitoring. Intended for early access testing of upcoming improvements prior to general availability.

## Firmware Variants Summary

| Firmware File Name | Sensors Included |
|---------------------|------------------|
| Sense360-MS-Standard-v1.0.0-preview.bin | LTR303, SCD40, SHT30 |
| Sense360-MS-Standard-sen55-hlk2450-v1.0.0-preview.bin | LTR303, SCD40, SHT30, Sen55x, HLK2450 |

**Base firmware** (Sense360-MS-Standard-v1.0.0-preview.bin) supports the core sensors only.

**Add-on firmware** (Sense360-MS-Standard-sen55-hlk2450-v1.0.0-preview.bin) supports all core sensors plus the Sen55x and HLK2450 optional sensors.

## Key Features
- Core air quality monitoring with essential sensors
- Light sensing with LTR303 sensor
- CO2 monitoring with SCD40 sensor
- Temperature and humidity sensing with SHT30 sensor
- Wi-Fi connectivity with Improv Serial setup
- Comprehensive web dashboard for real-time monitoring
- MQTT integration for Home Assistant support
- Includes early access fixes and telemetry enhancements awaiting general certification

## Hardware Requirements
- ESP32-S3 development board
- LTR303 light sensor
- SCD40 CO2 sensor
- SHT30 temperature/humidity sensor

## Known Issues
- Preview builds may introduce experimental changes; report regressions via project issues
- CO2 sensor requires 3-minute warm-up period
- Wi-Fi connection timeout after 60 seconds

## Changelog
- Same feature set as the 1.0.0 general release with in-progress improvements under validation
