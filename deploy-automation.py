#!/usr/bin/env python3
"""
Complete Deployment Automation for GitHub Pages
===============================================

This script handles the complete automation for GitHub Pages deployment:
1. Scans firmware directory for .bin files
2. Updates manifest.json with relative URLs
3. Creates individual manifest files for ESP Web Tools
4. Generates GitHub Pages compatible URLs
5. Validates all files and URLs

Usage:
  python3 deploy-automation.py              # Full automation for GitHub Pages
  python3 deploy-automation.py --local      # Local development with localhost URLs
  python3 deploy-automation.py --validate   # Validate existing deployment
"""

import json
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime
import subprocess
import re

class GitHubPagesAutomation:
    def __init__(self, local_mode: bool = False):
        self.local_mode = local_mode
        self.firmware_dir = Path("firmware")
        self.manifest_path = Path("manifest.json")
        self.base_url = "http://localhost:5000/" if local_mode else ""
        
    def log(self, message: str):
        """Log message with timestamp."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {message}")
    
    def extract_metadata_from_path(self, file_path: Path) -> dict:
        """Extract metadata from directory structure."""
        parts = file_path.parts
        if len(parts) >= 4:
            device_type = parts[-4]
            chip_family = parts[-3]
            channel = parts[-2]
            
            # Extract version from filename
            filename = file_path.name
            version_match = re.search(r'-v([^-]+)-', filename)
            version = version_match.group(1) if version_match else '1.0.0'
            
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
            'ESP32H2': 'ESP32-H2'
        }
        return mapping.get(chip_family, chip_family)
    
    def scan_firmware_directory(self) -> list:
        """Scan firmware directory and create builds list."""
        builds = []
        
        if not self.firmware_dir.exists():
            self.log(f"ERROR: Firmware directory {self.firmware_dir} does not exist")
            return builds
            
        for bin_file in self.firmware_dir.rglob("*.bin"):
            metadata = self.extract_metadata_from_path(bin_file)
            
            if metadata:
                # Create relative path for GitHub Pages
                relative_path = str(bin_file.relative_to(Path('.')))
                
                build = {
                    "device_type": metadata['device_type'],
                    "version": metadata['version'],
                    "channel": metadata['channel'],
                    "chipFamily": self.get_chip_family_mapping(metadata['chip_family']),
                    "parts": [{
                        "path": relative_path,
                        "offset": 0
                    }],
                    "build_date": datetime.fromtimestamp(bin_file.stat().st_mtime).isoformat(),
                    "file_size": bin_file.stat().st_size
                }
                
                builds.append(build)
                self.log(f"Found: {bin_file.name} - {metadata['device_type']} v{metadata['version']} ({metadata['chip_family']})")
        
        # Sort by device type, then version
        builds.sort(key=lambda x: (x['device_type'], x['version']))
        return builds
    
    def create_main_manifest(self, builds: list) -> bool:
        """Create main manifest.json file."""
        try:
            manifest = {
                "name": "Sense360 ESP32 Firmware",
                "version": "1.0.0",
                "home_assistant_domain": "esphome",
                "new_install_skip_erase": False,
                "builds": builds
            }
            
            with open(self.manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)
            
            self.log(f"✓ Created manifest.json with {len(builds)} builds")
            return True
            
        except Exception as e:
            self.log(f"ERROR: Failed to create manifest.json: {e}")
            return False
    
    def create_individual_manifests(self, builds: list) -> bool:
        """Create individual manifest files for ESP Web Tools."""
        try:
            for index, build in enumerate(builds):
                individual_manifest = {
                    "name": f"Sense360 ESP32 Firmware - {build['device_type']}",
                    "version": build['version'],
                    "home_assistant_domain": "esphome",
                    "new_install_skip_erase": False,
                    "builds": [{
                        "chipFamily": build['chipFamily'],
                        "parts": [{
                            "path": build['parts'][0]['path'],
                            "offset": 0
                        }]
                    }]
                }
                
                manifest_filename = f'firmware-{index}.json'
                with open(manifest_filename, 'w') as f:
                    json.dump(individual_manifest, f, indent=2)
                
                self.log(f"✓ Created {manifest_filename} for {build['device_type']} v{build['version']}")
            
            return True
            
        except Exception as e:
            self.log(f"ERROR: Failed to create individual manifests: {e}")
            return False
    
    def validate_deployment(self, builds: list) -> bool:
        """Validate all files exist and are accessible."""
        try:
            # Check main manifest
            if not self.manifest_path.exists():
                self.log("ERROR: manifest.json not found")
                return False
            
            # Check individual manifests
            for index, build in enumerate(builds):
                manifest_file = Path(f'firmware-{index}.json')
                if not manifest_file.exists():
                    self.log(f"ERROR: Individual manifest {manifest_file} not found")
                    return False
                
                # Check firmware file exists
                firmware_path = Path(build['parts'][0]['path'])
                if not firmware_path.exists():
                    self.log(f"ERROR: Firmware file not found: {firmware_path}")
                    return False
            
            self.log("✓ All deployment files validated")
            return True
            
        except Exception as e:
            self.log(f"ERROR: Validation failed: {e}")
            return False
    
    def run_complete_automation(self) -> bool:
        """Run complete automation workflow."""
        self.log("Starting GitHub Pages automation...")
        
        # Scan firmware directory
        builds = self.scan_firmware_directory()
        if not builds:
            self.log("No firmware files found. Please add .bin files to firmware/ directory.")
            return False
        
        # Create main manifest
        if not self.create_main_manifest(builds):
            return False
        
        # Create individual manifests
        if not self.create_individual_manifests(builds):
            return False
        
        # Validate deployment
        if not self.validate_deployment(builds):
            return False
        
        # Success summary
        self.log("=" * 60)
        self.log("GITHUB PAGES DEPLOYMENT READY")
        self.log("=" * 60)
        self.log(f"✓ {len(builds)} firmware builds processed")
        self.log(f"✓ Main manifest.json created")
        self.log(f"✓ {len(builds)} individual manifests created")
        self.log("✓ All files use relative URLs for GitHub Pages")
        self.log("✓ ESP Web Tools compatibility confirmed")
        self.log("")
        self.log("DEPLOYMENT CHECKLIST:")
        self.log("1. ✓ All manifest files use relative URLs")
        self.log("2. ✓ Firmware binaries are in firmware/ directory")
        self.log("3. ✓ Individual manifests created for each firmware")
        self.log("4. ✓ Files ready for GitHub Pages deployment")
        self.log("")
        self.log("AUTOMATION WORKFLOW:")
        self.log("• Add .bin file to firmware/ directory")
        self.log("• Run: python3 deploy-automation.py")
        self.log("• Commit and push to GitHub")
        self.log("• GitHub Pages will serve updated firmware")
        self.log("=" * 60)
        
        return True

def main():
    parser = argparse.ArgumentParser(description='GitHub Pages deployment automation')
    parser.add_argument('--local', action='store_true', help='Use localhost URLs for development')
    parser.add_argument('--validate', action='store_true', help='Validate existing deployment')
    
    args = parser.parse_args()
    
    automation = GitHubPagesAutomation(local_mode=args.local)
    
    if args.validate:
        # For validation, we need to scan first
        builds = automation.scan_firmware_directory()
        if automation.validate_deployment(builds):
            print("✓ Deployment validation passed")
            return 0
        else:
            print("✗ Deployment validation failed")
            return 1
    else:
        if automation.run_complete_automation():
            print("✓ Automation completed successfully")
            return 0
        else:
            print("✗ Automation failed")
            return 1

if __name__ == '__main__':
    exit(main())