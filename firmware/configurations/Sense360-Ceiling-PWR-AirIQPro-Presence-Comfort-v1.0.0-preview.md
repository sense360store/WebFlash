# Sense360 Ceiling Mount PWR with Full Sensor Suite v1.0.0 (Preview)

## Configuration Details
- **Mounting Type**: Ceiling
- **Power Option**: PWR Module
- **Expansion Modules**: AirIQ Pro, Presence (LD2450, SEN0609), Comfort (SHT40, LTR-303)
- **Included Sensors**: SGP41, SCD41, MiCS4514, BMP390, SEN0321, SPS30, SFA40, LD2450, SEN0609, SHT40, LTR-303
- **Chip Family**: ESP32-S3
- **Version**: v1.0.0
- **Channel**: preview
- **Release Date**: 2025-07-25

## Description
Preview firmware for ceiling-mounted Sense360 builds using the full module stack. Includes beta tuning for particulate averaging and presence detection heuristics ahead of general rollout.

## Hardware Requirements
- ESP32-S3 WROOM Core Module
- PWR Module for external power
- AirIQ Pro Module (all sensors)
- Presence Module with LD2450 and SEN0609
- Comfort Module sensors (SHT40, LTR-303)

## Features
- Experimental smoothing for SPS30 particulate data feeds
- Updated radar occupancy classification profiles for LD2450
- Comfort module telemetry refinements under validation
- Improv Wi-Fi provisioning compatible with ESP Web Tools
- MQTT telemetry structured for Home Assistant dashboards

## Preview Notes
- Preview builds may require manual recalibration after flashing
- Provide feedback on radar motion sensitivity adjustments
