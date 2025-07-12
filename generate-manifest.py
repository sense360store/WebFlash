#!/usr/bin/env python3
"""
Generate manifest.json automatically based on deployed firmware files.
This script scans the firmware directory structure and creates ESP Web Tools manifest.
"""

import os
import json
import glob
from pathlib import Path
from datetime import datetime

def scan_firmware_directory(firmware_dir="firmware"):
    """Scan firmware directory and generate manifest entries."""
    
    builds = []
    
    if not os.path.exists(firmware_dir):
        print(f"Warning: Firmware directory {firmware_dir} not found")
        return builds
    
    # Scan for firmware files in the organized structure
    # firmware/[DeviceType]/[ChipFamily]/[Channel]/firmware-latest.bin
    pattern = os.path.join(firmware_dir, "*", "*", "*", "firmware-latest.bin")
    firmware_files = glob.glob(pattern)
    
    print(f"Found {len(firmware_files)} firmware files:")
    
    for firmware_file in firmware_files:
        # Parse path: firmware/DeviceType/ChipFamily/Channel/firmware-latest.bin
        parts = Path(firmware_file).parts
        
        if len(parts) >= 5:
            device_type = parts[1]
            chip_family = parts[2]
            channel = parts[3]
            
            # Create friendly name
            friendly_name = f"{device_type} ({chip_family})"
            if channel != "stable":
                friendly_name += f" - {channel.title()}"
            
            # Map chip family to ESP Web Tools format
            chip_family_map = {
                "ESP32": "ESP32",
                "ESP32S2": "ESP32-S2", 
                "ESP32S3": "ESP32-S3",
                "ESP32C3": "ESP32-C3"
            }
            
            web_tools_chip = chip_family_map.get(chip_family, chip_family)
            
            build_entry = {
                "name": friendly_name,
                "chipFamily": web_tools_chip,
                "improv": True,
                "parts": [
                    {
                        "path": firmware_file.replace("\\", "/"),  # Ensure forward slashes
                        "offset": 0
                    }
                ]
            }
            
            builds.append(build_entry)
            print(f"  Added: {friendly_name} -> {firmware_file}")
    
    # Also check for legacy firmware files
    legacy_pattern = os.path.join(firmware_dir, "*", "firmware-latest.bin")
    legacy_files = glob.glob(legacy_pattern)
    
    for legacy_file in legacy_files:
        # Skip if already processed in organized structure
        if any(organized_file.startswith(os.path.dirname(legacy_file)) for organized_file in firmware_files):
            continue
            
        parts = Path(legacy_file).parts
        if len(parts) >= 3:
            device_type = parts[1]
            
            # Create legacy entry
            build_entry = {
                "name": f"{device_type} (Legacy)",
                "chipFamily": "ESP32-S3",  # Default for legacy
                "improv": True,
                "parts": [
                    {
                        "path": legacy_file.replace("\\", "/"),
                        "offset": 0
                    }
                ]
            }
            
            builds.append(build_entry)
            print(f"  Added (Legacy): {device_type} -> {legacy_file}")
    
    return builds

def generate_manifest(firmware_dir="firmware", output_file="manifest.json"):
    """Generate complete manifest.json file."""
    
    # Scan for firmware builds
    builds = scan_firmware_directory(firmware_dir)
    
    if not builds:
        print("Warning: No firmware files found, creating empty manifest")
        builds = []
    
    # Create manifest structure
    manifest = {
        "name": "Sense360 Firmware",
        "version": datetime.now().strftime("%Y.%m.%d"),
        "new_install_prompt_erase": True,
        "new_install_improv_wait_time": 10,
        "builds": builds
    }
    
    # Write manifest file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"Generated manifest with {len(builds)} firmware options")
    print(f"Manifest saved to: {output_file}")
    
    return manifest

def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate ESP Web Tools manifest.json from firmware directory")
    parser.add_argument("--firmware-dir", default="firmware", help="Firmware directory to scan")
    parser.add_argument("--output", default="manifest.json", help="Output manifest file")
    
    args = parser.parse_args()
    
    generate_manifest(args.firmware_dir, args.output)

if __name__ == "__main__":
    main()