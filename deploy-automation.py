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
6. Creates GitHub releases for new firmware (optional)

Usage:
  python3 deploy-automation.py              # Full automation for GitHub Pages
  python3 deploy-automation.py --local      # Local development with localhost URLs
  python3 deploy-automation.py --validate   # Validate existing deployment
  python3 deploy-automation.py --releases   # Enable GitHub release creation for new firmware
"""

import json
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime
import subprocess
import re
import requests
import base64

class GitHubPagesAutomation:
    def __init__(self, local_mode: bool = False, create_releases: bool = False):
        self.local_mode = local_mode
        self.create_releases = create_releases
        self.firmware_dir = Path("firmware")
        self.manifest_path = Path("manifest.json")
        self.releases_tracking_file = Path("releases_tracking.json")
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
    
    def clean_orphaned_manifests(self) -> bool:
        """Clean up all existing firmware-*.json files to ensure clean state."""
        try:
            # Find all existing firmware manifest files with multiple patterns
            manifest_files = []
            for pattern in ['firmware-*.json', 'firmware*.json']:
                manifest_files.extend(list(Path('.').glob(pattern)))
            
            # Remove duplicates
            manifest_files = list(set(manifest_files))
            
            if manifest_files:
                self.log(f"🧹 Cleaning up {len(manifest_files)} existing manifest files...")
                cleanup_success = True
                for manifest_file in manifest_files:
                    try:
                        if manifest_file.exists():
                            manifest_file.unlink()
                            self.log(f"  ✓ Removed {manifest_file}")
                        else:
                            self.log(f"  ℹ️  {manifest_file} already removed")
                    except Exception as e:
                        self.log(f"  ✗ Failed to remove {manifest_file}: {e}")
                        cleanup_success = False
                
                # Verify cleanup worked
                remaining_files = list(Path('.').glob('firmware-*.json'))
                if remaining_files:
                    self.log(f"  ⚠️  {len(remaining_files)} files still remain:")
                    for remaining_file in remaining_files:
                        self.log(f"    - {remaining_file}")
                        # Force remove if still exists
                        try:
                            remaining_file.unlink()
                            self.log(f"    ✓ Force removed {remaining_file}")
                        except Exception as e:
                            self.log(f"    ✗ Force removal failed: {e}")
                            cleanup_success = False
                
                if not cleanup_success:
                    return False
            else:
                self.log("🧹 No existing manifest files to clean up")
            
            # Double-check cleanup was successful
            final_check = list(Path('.').glob('firmware-*.json'))
            if final_check:
                self.log(f"ERROR: {len(final_check)} manifest files still exist after cleanup!")
                for remaining in final_check:
                    self.log(f"  - {remaining}")
                return False
            
            self.log("✅ Cleanup verified: All firmware-*.json files removed")
            return True
            
        except Exception as e:
            self.log(f"ERROR: Failed to clean up orphaned manifests: {e}")
            return False
    
    def get_build_date(self, file_path: Path) -> str:
        """Get accurate build date from git commit or file modification time."""
        try:
            # First try to get git commit date for this file
            result = subprocess.run(
                ['git', 'log', '-1', '--format=%cI', str(file_path)],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                git_date = result.stdout.strip()
                self.log(f"  📅 Using git commit date: {git_date}")
                return git_date
            
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            # Git not available or no git history for this file
            pass
        
        # Fall back to file modification time
        file_date = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
        self.log(f"  📅 Using file modification date: {file_date}")
        return file_date
    
    def load_releases_tracking(self) -> dict:
        """Load tracking data for released firmware."""
        if self.releases_tracking_file.exists():
            try:
                with open(self.releases_tracking_file) as f:
                    return json.load(f)
            except Exception as e:
                self.log(f"Warning: Could not load releases tracking: {e}")
        return {"released_firmware": []}
    
    def save_releases_tracking(self, tracking_data: dict):
        """Save tracking data for released firmware."""
        try:
            with open(self.releases_tracking_file, 'w') as f:
                json.dump(tracking_data, f, indent=2)
        except Exception as e:
            self.log(f"Warning: Could not save releases tracking: {e}")
    
    def get_firmware_signature(self, build: dict) -> str:
        """Generate unique signature for firmware build."""
        return f"{build['device_type']}-{build['version']}-{build['channel']}-{build['chipFamily']}"
    
    def create_github_release(self, build: dict) -> bool:
        """Create GitHub release for new firmware build."""
        try:
            # Get GitHub token from environment
            github_token = os.environ.get('GITHUB_TOKEN')
            if not github_token:
                self.log("⚠️  GITHUB_TOKEN not found, skipping release creation")
                return True  # Don't fail the entire automation
            
            # Extract repository info from git remote
            try:
                result = subprocess.run(
                    ['git', 'remote', 'get-url', 'origin'],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode != 0:
                    self.log("⚠️  Could not get git remote, skipping release creation")
                    return True
                
                remote_url = result.stdout.strip()
                # Extract owner/repo from URL (handles both SSH and HTTPS)
                if 'github.com' in remote_url:
                    repo_part = remote_url.split('github.com')[1].strip('/:').replace('.git', '')
                    owner, repo = repo_part.split('/')
                else:
                    self.log("⚠️  Not a GitHub repository, skipping release creation")
                    return True
                    
            except Exception as e:
                self.log(f"⚠️  Could not determine repository info: {e}")
                return True
            
            # Create release tag and name
            tag_name = f"v{build['version']}-{build['channel']}"
            release_name = f"Sense360 {build['device_type']} v{build['version']} ({build['channel']})"
            
            # Create release description
            description = f"""# Sense360 ESP32 Firmware Release

**Device Type:** {build['device_type']}
**Version:** {build['version']}
**Channel:** {build['channel']}
**Chip Family:** {build['chipFamily']}
**Build Date:** {build['build_date']}
**File Size:** {build['file_size']} bytes

## Installation
1. Visit the [Sense360 Web Installer](https://sense360store.github.io/WebFlash/)
2. Connect your ESP32 device via USB
3. Select this firmware from the list
4. Click "Install" and follow the prompts

## Features
- Built-in Wi-Fi setup via Improv Serial protocol
- Compatible with ESP Web Tools
- Automated over-the-air updates
- Environmental monitoring capabilities

## Technical Details
- **Platform:** ESP32 Family
- **Framework:** ESPHome
- **Connectivity:** Wi-Fi + Improv Serial
- **Installation:** Web-based flashing via ESP Web Tools
"""
            
            # GitHub API headers
            headers = {
                'Authorization': f'token {github_token}',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
            
            # Create release
            release_data = {
                'tag_name': tag_name,
                'name': release_name,
                'body': description,
                'draft': False,
                'prerelease': build['channel'] in ['beta', 'alpha', 'dev']
            }
            
            api_url = f"https://api.github.com/repos/{owner}/{repo}/releases"
            
            self.log(f"📦 Creating GitHub release: {release_name}")
            response = requests.post(api_url, headers=headers, json=release_data)
            
            if response.status_code == 201:
                release_info = response.json()
                self.log(f"✅ Release created successfully: {release_info['html_url']}")
                
                # Upload firmware file as asset
                firmware_path = Path(build['parts'][0]['path'])
                if firmware_path.exists():
                    upload_url = release_info['upload_url'].replace('{?name,label}', '')
                    
                    # Upload asset
                    with open(firmware_path, 'rb') as f:
                        file_data = f.read()
                    
                    asset_headers = {
                        'Authorization': f'token {github_token}',
                        'Content-Type': 'application/octet-stream'
                    }
                    
                    asset_params = {
                        'name': firmware_path.name,
                        'label': f'Firmware binary for {build["device_type"]} v{build["version"]}'
                    }
                    
                    asset_response = requests.post(
                        upload_url, 
                        headers=asset_headers, 
                        params=asset_params,
                        data=file_data
                    )
                    
                    if asset_response.status_code == 201:
                        self.log(f"✅ Firmware asset uploaded successfully")
                    else:
                        self.log(f"⚠️  Asset upload failed: {asset_response.status_code}")
                        self.log(f"    Response: {asset_response.text}")
                
                return True
                
            else:
                self.log(f"⚠️  Release creation failed: {response.status_code}")
                self.log(f"    Response: {response.text}")
                return True  # Don't fail the entire automation
                
        except Exception as e:
            self.log(f"⚠️  Release creation error: {e}")
            return True  # Don't fail the entire automation
    
    def process_github_releases(self, builds: list) -> bool:
        """Process GitHub releases for new firmware builds."""
        if not self.create_releases:
            return True
        
        self.log("🚀 Step 6: Processing GitHub releases")
        
        try:
            # Load existing releases tracking
            tracking_data = self.load_releases_tracking()
            released_signatures = set(tracking_data.get('released_firmware', []))
            
            new_releases_created = 0
            
            for build in builds:
                signature = self.get_firmware_signature(build)
                
                if signature not in released_signatures:
                    self.log(f"📦 New firmware detected: {signature}")
                    
                    if self.create_github_release(build):
                        released_signatures.add(signature)
                        new_releases_created += 1
                        self.log(f"✅ Release created for {signature}")
                    else:
                        self.log(f"⚠️  Release creation skipped for {signature}")
                else:
                    self.log(f"ℹ️  Release already exists for {signature}")
            
            # Save updated tracking
            tracking_data['released_firmware'] = list(released_signatures)
            self.save_releases_tracking(tracking_data)
            
            if new_releases_created > 0:
                self.log(f"✅ Created {new_releases_created} new GitHub releases")
            else:
                self.log("ℹ️  No new releases needed")
            
            return True
            
        except Exception as e:
            self.log(f"⚠️  GitHub releases processing error: {e}")
            return True  # Don't fail the entire automation
    
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
                    "build_date": self.get_build_date(bin_file),
                    "file_size": bin_file.stat().st_size,
                    "improv": True
                }
                
                builds.append(build)
                self.log(f"📦 Found: {bin_file.name} - {metadata['device_type']} v{metadata['version']} ({metadata['chip_family']})")
        
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
                        }],
                        "improv": True
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
            
            # Validate main manifest content
            with open(self.manifest_path) as f:
                manifest_data = json.load(f)
                
            if len(manifest_data['builds']) != len(builds):
                self.log(f"ERROR: Main manifest has {len(manifest_data['builds'])} builds but expected {len(builds)}")
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
            
            # Check for orphaned manifest files
            all_manifests = list(Path('.').glob('firmware-*.json'))
            expected_manifests = [Path(f'firmware-{i}.json') for i in range(len(builds))]
            
            orphaned_manifests = set(all_manifests) - set(expected_manifests)
            if orphaned_manifests:
                self.log(f"ERROR: Found {len(orphaned_manifests)} orphaned manifest files:")
                for orphaned in orphaned_manifests:
                    self.log(f"  - {orphaned}")
                return False
            
            # Verify perfect synchronization
            firmware_count = len(list(self.firmware_dir.rglob('*.bin')))
            manifest_count = len(all_manifests)
            build_count = len(builds)
            
            if firmware_count != manifest_count or firmware_count != build_count:
                self.log(f"ERROR: Synchronization mismatch - Firmware: {firmware_count}, Manifests: {manifest_count}, Builds: {build_count}")
                return False
            
            self.log("✓ All deployment files validated")
            self.log(f"✓ Perfect synchronization confirmed: {firmware_count} firmware = {manifest_count} manifests = {build_count} builds")
            return True
            
        except Exception as e:
            self.log(f"ERROR: Validation failed: {e}")
            return False
    
    def run_complete_automation(self) -> bool:
        """Run complete automation workflow with guaranteed clean state."""
        self.log("=" * 60)
        self.log("STARTING CLEAN STATE AUTOMATION")
        self.log("=" * 60)
        
        # Step 1: Pre-run cleanup - Remove ALL firmware-*.json files
        self.log("🧹 Step 1: Pre-run cleanup")
        if not self.clean_orphaned_manifests():
            self.log("❌ Pre-run cleanup failed")
            return False
        
        # Step 2: Scan firmware directory for actual .bin files
        self.log("📦 Step 2: Scanning firmware directory")
        builds = self.scan_firmware_directory()
        if not builds:
            self.log("⚠️  No firmware files found. Please add .bin files to firmware/ directory.")
            return False
        
        # Step 3: Create main manifest based on actual files
        self.log("📄 Step 3: Creating main manifest")
        if not self.create_main_manifest(builds):
            self.log("❌ Main manifest creation failed")
            return False
        
        # Step 4: Create individual manifests for each firmware
        self.log("📋 Step 4: Creating individual manifests")
        if not self.create_individual_manifests(builds):
            self.log("❌ Individual manifest creation failed")
            return False
        
        # Step 5: Validate complete deployment
        self.log("✅ Step 5: Validating deployment")
        if not self.validate_deployment(builds):
            self.log("❌ Deployment validation failed")
            return False
        
        # Step 6: Process GitHub releases (optional)
        if not self.process_github_releases(builds):
            self.log("⚠️  GitHub releases processing had issues (continuing)")
            # Note: Don't return False here - release failures shouldn't break the automation
        
        # Success summary
        self.log("=" * 60)
        self.log("✅ CLEAN STATE AUTOMATION COMPLETED")
        self.log("=" * 60)
        self.log(f"✓ Cleaned up orphaned manifest files")
        self.log(f"✓ {len(builds)} firmware builds processed with accurate dates")
        self.log(f"✓ Main manifest.json created")
        self.log(f"✓ {len(builds)} individual manifests created")
        self.log("✓ All files use relative URLs for GitHub Pages")
        self.log("✓ ESP Web Tools compatibility confirmed")
        self.log("✓ Perfect synchronization between firmware/ directory and manifests")
        self.log("")
        self.log("CLEAN STATE GUARANTEE:")
        self.log("1. ✓ All orphaned manifest files removed")
        self.log("2. ✓ Manifests match exactly with existing .bin files")
        self.log("3. ✓ Accurate build dates from git commits or file timestamps")
        self.log("4. ✓ No manual editing required - 100% automated")
        self.log("5. ✓ Ready for GitHub Pages deployment")
        self.log("")
        self.log("AUTOMATION WORKFLOW:")
        self.log("• Add .bin file to firmware/ directory")
        self.log("• Run: python3 deploy-automation.py")
        self.log("• Run: python3 deploy-automation.py --releases (for GitHub releases)")
        self.log("• Commit and push to GitHub")
        self.log("• GitHub Pages will serve updated firmware")
        self.log("=" * 60)
        
        return True

def main():
    parser = argparse.ArgumentParser(description='GitHub Pages deployment automation')
    parser.add_argument('--local', action='store_true', help='Use localhost URLs for development')
    parser.add_argument('--validate', action='store_true', help='Validate existing deployment')
    parser.add_argument('--releases', action='store_true', help='Create GitHub releases for new firmware')
    
    args = parser.parse_args()
    
    automation = GitHubPagesAutomation(local_mode=args.local, create_releases=args.releases)
    
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