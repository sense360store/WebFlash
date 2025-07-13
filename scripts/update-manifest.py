#!/usr/bin/env python3
"""
Firmware Binary Management Script
================================

Automatically scans firmware/ directory and updates manifest.json for ESP Web Tools.
Extracts metadata from filename/directory structure following naming convention:
  Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin

Usage:
  python3 scripts/update-manifest.py
  python3 scripts/update-manifest.py --firmware-dir custom/firmware/path
"""

import os
import json
import argparse
from pathlib import Path
from datetime import datetime
import re

class FirmwareBinaryManager:
    def __init__(self, firmware_dir: str = "firmware", manifest_path: str = "manifest.json"):
        self.firmware_dir = Path(firmware_dir)
        self.manifest_path = Path(manifest_path)
        
    def extract_metadata_from_filename(self, filename: str) -> dict:
        """Extract metadata from firmware filename following naming convention."""
        # Pattern: Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin
        pattern = r'Sense360-(.+?)-(.+?)-v(.+?)-(.+?)\.bin'
        match = re.match(pattern, filename)
        
        if match:
            device_type, chip_family, version, channel = match.groups()
            return {
                'device_type': device_type,
                'chip_family': chip_family,
                'version': version,
                'channel': channel
            }
        
        # Fallback: extract from directory structure if filename doesn't match
        return None
    
    def extract_metadata_from_path(self, file_path: Path) -> dict:
        """Extract metadata from directory structure: firmware/[DeviceType]/[ChipFamily]/[Channel]/"""
        parts = file_path.parts
        
        # Find firmware directory index
        firmware_index = -1
        for i, part in enumerate(parts):
            if part == 'firmware':
                firmware_index = i
                break
        
        if firmware_index >= 0 and len(parts) > firmware_index + 3:
            device_type = parts[firmware_index + 1]
            chip_family = parts[firmware_index + 2]
            channel = parts[firmware_index + 3]
            
            # Try to extract version from filename
            version_match = re.search(r'v(\d+\.\d+\.\d+)', file_path.name)
            version = version_match.group(1) if version_match else "1.0.0"
            
            return {
                'device_type': device_type,
                'chip_family': chip_family,
                'version': version,
                'channel': channel
            }
        
        return None
    
    def get_chip_family_mapping(self, chip_family: str) -> str:
        """Map chip family to ESP Web Tools format."""
        mapping = {
            'ESP32': 'ESP32',
            'ESP32S2': 'ESP32-S2',
            'ESP32S3': 'ESP32-S3',
            'ESP32C3': 'ESP32-C3',
            'ESP32C6': 'ESP32-C6',
            'ESP32H2': 'ESP32-H2',
            'WROOM1': 'ESP32',  # Legacy mapping
            'WROOM32': 'ESP32'  # Legacy mapping
        }
        return mapping.get(chip_family, chip_family)
    
    def scan_firmware_directory(self) -> list:
        """Scan firmware directory and return list of firmware files with metadata."""
        if not self.firmware_dir.exists():
            print(f"Firmware directory {self.firmware_dir} does not exist")
            return []
        
        firmware_files = []
        
        # Find all .bin files in firmware directory
        for bin_file in self.firmware_dir.rglob('*.bin'):
            if bin_file.is_file():
                # Extract metadata from filename first
                metadata = self.extract_metadata_from_filename(bin_file.name)
                
                # If filename extraction failed, try directory structure
                if not metadata:
                    metadata = self.extract_metadata_from_path(bin_file)
                
                if metadata:
                    # Get relative path from firmware directory
                    relative_path = bin_file.relative_to(Path('.'))
                    
                    firmware_files.append({
                        'path': str(relative_path),
                        'filename': bin_file.name,
                        'metadata': metadata,
                        'size': bin_file.stat().st_size,
                        'modified': datetime.fromtimestamp(bin_file.stat().st_mtime).isoformat()
                    })
                    
                    print(f"Found firmware: {bin_file.name}")
                    print(f"  Device: {metadata['device_type']}")
                    print(f"  Chip: {metadata['chip_family']}")
                    print(f"  Version: {metadata['version']}")
                    print(f"  Channel: {metadata['channel']}")
                    print(f"  Path: {relative_path}")
                    print()
                else:
                    print(f"Warning: Could not extract metadata from {bin_file.name}")
        
        return firmware_files
    
    def generate_manifest_builds(self, firmware_files: list) -> list:
        """Generate manifest builds array from firmware files."""
        builds = []
        
        # Group firmware by chip family for proper manifest structure
        chip_groups = {}
        for firmware in firmware_files:
            chip_family = self.get_chip_family_mapping(firmware['metadata']['chip_family'])
            
            if chip_family not in chip_groups:
                chip_groups[chip_family] = []
            
            chip_groups[chip_family].append(firmware)
        
        # Create build entries for each chip family
        for chip_family, firmware_list in chip_groups.items():
            # For each chip family, create a build with all firmware variants
            for firmware in firmware_list:
                build = {
                    "chipFamily": chip_family,
                    "parts": [
                        {
                            "path": firmware['path'],
                            "offset": 0
                        }
                    ]
                }
                
                # Add metadata if available
                metadata = firmware['metadata']
                build["version"] = metadata['version']
                build["channel"] = metadata['channel']
                build["device_type"] = metadata['device_type']
                build["filename"] = firmware['filename']
                build["size"] = firmware['size']
                build["modified"] = firmware['modified']
                
                builds.append(build)
        
        return builds
    
    def update_manifest(self) -> bool:
        """Update manifest.json with all available firmware."""
        print("Scanning firmware directory...")
        firmware_files = self.scan_firmware_directory()
        
        if not firmware_files:
            print("No firmware files found")
            return False
        
        print(f"Found {len(firmware_files)} firmware files")
        
        # Generate manifest builds
        builds = self.generate_manifest_builds(firmware_files)
        
        # Create manifest structure
        manifest = {
            "name": "Sense360 ESP32 Firmware",
            "version": "2.0.0",
            "home_assistant_domain": "esphome",
            "new_install_skip_erase": False,
            "builds": builds
        }
        
        # Add metadata
        manifest["updated"] = datetime.now().isoformat()
        manifest["total_firmware"] = len(firmware_files)
        manifest["chip_families"] = list(set(self.get_chip_family_mapping(f['metadata']['chip_family']) for f in firmware_files))
        
        # Write manifest file
        try:
            with open(self.manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)
            
            print(f"Updated {self.manifest_path} with {len(builds)} firmware builds")
            print(f"Chip families: {', '.join(manifest['chip_families'])}")
            return True
            
        except Exception as e:
            print(f"Error writing manifest: {e}")
            return False
    
    def validate_manifest(self) -> bool:
        """Validate generated manifest.json format."""
        try:
            with open(self.manifest_path, 'r') as f:
                manifest = json.load(f)
            
            # Check required fields
            required_fields = ['name', 'builds']
            for field in required_fields:
                if field not in manifest:
                    print(f"Error: Missing required field '{field}' in manifest")
                    return False
            
            # Check builds structure
            if not isinstance(manifest['builds'], list):
                print("Error: 'builds' must be an array")
                return False
            
            for i, build in enumerate(manifest['builds']):
                if 'chipFamily' not in build:
                    print(f"Error: Build {i} missing 'chipFamily'")
                    return False
                
                if 'parts' not in build or not isinstance(build['parts'], list):
                    print(f"Error: Build {i} missing or invalid 'parts' array")
                    return False
                
                for j, part in enumerate(build['parts']):
                    if 'path' not in part:
                        print(f"Error: Build {i}, part {j} missing 'path'")
                        return False
                    
                    # Check if file exists
                    if not Path(part['path']).exists():
                        print(f"Warning: Firmware file {part['path']} not found")
            
            print("Manifest validation passed")
            return True
            
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in manifest: {e}")
            return False
        except Exception as e:
            print(f"Error validating manifest: {e}")
            return False

def main():
    parser = argparse.ArgumentParser(description="Update manifest.json with firmware binaries")
    parser.add_argument("--firmware-dir", default="firmware", help="Firmware directory path")
    parser.add_argument("--manifest", default="manifest.json", help="Manifest file path")
    parser.add_argument("--validate", action="store_true", help="Validate manifest after update")
    
    args = parser.parse_args()
    
    manager = FirmwareBinaryManager(args.firmware_dir, args.manifest)
    
    if manager.update_manifest():
        if args.validate:
            manager.validate_manifest()
        print("Manifest update completed successfully")
    else:
        print("Manifest update failed")
        exit(1)

if __name__ == "__main__":
    main()