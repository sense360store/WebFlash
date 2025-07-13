#!/usr/bin/env python3
"""
Generate manifest.json automatically based on deployed firmware files.
This script scans the firmware directory structure and creates ESP Web Tools manifest.
"""

import os
import json
import argparse
from pathlib import Path

def scan_firmware_directory(firmware_dir="firmware"):
    """Scan firmware directory and generate manifest entries."""
    
    firmware_path = Path(firmware_dir)
    if not firmware_path.exists():
        print(f"Firmware directory {firmware_dir} not found")
        return []
    
    builds = []
    
    # Scan for firmware files
    for firmware_file in firmware_path.rglob("firmware-latest.bin"):
        # Extract info from directory structure
        # Expected: firmware/DeviceType/ChipFamily/Channel/firmware-latest.bin
        parts = firmware_file.parts
        
        if len(parts) >= 4:
            device_type = parts[-4]  # DeviceType
            chip_family = parts[-3]  # ChipFamily  
            channel = parts[-2]     # Channel
            
            # Create build entry
            build_name = f"{device_type} ({chip_family})"
            if channel != "stable":
                build_name += f" - {channel.title()}"
            
            # Map chip family to supported chips
            chip_list = []
            if chip_family.upper() == "ESP32":
                chip_list = ["ESP32"]
            elif chip_family.upper() == "ESP32S2":
                chip_list = ["ESP32-S2"]
            elif chip_family.upper() == "ESP32S3":
                chip_list = ["ESP32-S3"]
            elif chip_family.upper() == "ESP32C3":
                chip_list = ["ESP32-C3"]
            else:
                chip_list = ["ESP32"]  # Default fallback
            
            # Calculate relative path from manifest location
            relative_path = str(firmware_file.relative_to(Path.cwd()))
            
            build_entry = {
                "name": build_name,
                "chipFamily": chip_family.upper(),
                "parts": [{
                    "path": relative_path,
                    "offset": 0
                }],
                "improv": True
            }
            
            builds.append(build_entry)
    
    return builds

def generate_manifest(firmware_dir="firmware", output_file="manifest.json"):
    """Generate complete manifest.json file."""
    
    builds = scan_firmware_directory(firmware_dir)
    
    if not builds:
        print("No firmware files found, creating empty manifest")
        builds = []
    
    manifest = {
        "name": "Sense360 ESP32 Firmware",
        "version": "2.0.0",
        "home_assistant_domain": "esphome",
        "new_install_skip_erase": False,
        "builds": builds
    }
    
    # Write manifest file
    with open(output_file, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print(f"Generated {output_file} with {len(builds)} firmware builds")
    return manifest

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Generate manifest.json from firmware directory")
    parser.add_argument("--firmware-dir", default="firmware", help="Firmware directory to scan")
    parser.add_argument("--output", default="manifest.json", help="Output manifest file")
    
    args = parser.parse_args()
    
    manifest = generate_manifest(args.firmware_dir, args.output)
    
    print("Manifest generated successfully:")
    print(json.dumps(manifest, indent=2))

if __name__ == "__main__":
    main()