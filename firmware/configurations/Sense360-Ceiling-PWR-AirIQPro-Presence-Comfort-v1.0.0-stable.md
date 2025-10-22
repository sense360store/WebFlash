# Sense360 Ceiling Mount PWR with Full Sensor Suite v1.0.0 (Stable)

## Configuration Details
- **Mounting Type**: Ceiling
- **Power Option**: PWR Module
- **Expansion Modules**: AirIQ Pro, Presence (LD2450, SEN0609), Comfort (SHT40, LTR-303)
- **Included Sensors**: SGP41, SCD41, MiCS4514, BMP390, SEN0321, SPS30, SFA40, LD2450, SEN0609, SHT40, LTR-303
- **Chip Family**: ESP32-S3
- **Version**: v1.0.0
- **Channel**: stable
- **Release Date**: 2025-07-25

## Description
Stable release firmware for ceiling-mounted Sense360 units with external power and the full AirIQ Pro + Presence + Comfort stack. Recommended for production deployments needing the complete sensor suite.

## Hardware Requirements
- ESP32-S3 WROOM Core Module
- PWR Module for external power
- AirIQ Pro Module (all sensors)
- Presence Module with LD2450 and SEN0609
- Comfort Module sensors (SHT40, LTR-303)

## Features
- Aggregated air quality monitoring across VOC, particulate, and gas sensors
- Dual presence detection through LD2450 radar and SEN0609 IR sensor
- Comfort metrics delivered via temperature, humidity, and light sensors
- Improv Wi-Fi provisioning compatible with ESP Web Tools
- MQTT telemetry structured for Home Assistant dashboards
