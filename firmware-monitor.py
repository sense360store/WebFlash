#!/usr/bin/env python3
"""
Firmware monitoring and cleanup system.
Monitors firmware directory, adds timestamps, and manages cleanup.
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
import hashlib
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('firmware-monitor.log'),
        logging.StreamHandler()
    ]
)

class FirmwareMonitor:
    def __init__(self, firmware_dir="firmware", manifest_file="manifest.json"):
        self.firmware_dir = Path(firmware_dir)
        self.manifest_file = Path(manifest_file)
        self.timestamp_file = Path("firmware-timestamps.json")
        self.load_timestamps()
        
    def load_timestamps(self):
        """Load existing firmware timestamps."""
        if self.timestamp_file.exists():
            try:
                with open(self.timestamp_file, 'r') as f:
                    self.timestamps = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                self.timestamps = {}
        else:
            self.timestamps = {}
    
    def save_timestamps(self):
        """Save firmware timestamps."""
        with open(self.timestamp_file, 'w') as f:
            json.dump(self.timestamps, f, indent=2)
    
    def get_file_hash(self, file_path):
        """Calculate SHA-256 hash of a file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()
    
    def add_firmware_timestamp(self, firmware_path):
        """Add timestamp for new firmware."""
        file_path = Path(firmware_path)
        if not file_path.exists():
            return
        
        # Calculate file hash for tracking
        file_hash = self.get_file_hash(file_path)
        file_size = file_path.stat().st_size
        
        # Create timestamp record
        timestamp_data = {
            "added": datetime.now().isoformat(),
            "file_size": file_size,
            "file_hash": file_hash,
            "file_path": str(file_path),
            "version": self.extract_version_from_filename(file_path.name)
        }
        
        # Store timestamp
        self.timestamps[str(file_path)] = timestamp_data
        self.save_timestamps()
        
        logging.info(f"Added timestamp for firmware: {file_path}")
        return timestamp_data
    
    def extract_version_from_filename(self, filename):
        """Extract version from firmware filename."""
        # Pattern: Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin
        parts = filename.replace('.bin', '').split('-')
        for part in parts:
            if part.startswith('v') and len(part) > 1:
                return part[1:]  # Remove 'v' prefix
        return "unknown"
    
    def scan_firmware_directory(self):
        """Scan firmware directory and add timestamps for new files."""
        if not self.firmware_dir.exists():
            logging.warning(f"Firmware directory {self.firmware_dir} does not exist")
            return
        
        new_files = []
        for firmware_file in self.firmware_dir.rglob("*.bin"):
            file_path_str = str(firmware_file)
            
            # Check if file is already tracked
            if file_path_str not in self.timestamps:
                timestamp_data = self.add_firmware_timestamp(firmware_file)
                new_files.append((firmware_file, timestamp_data))
            else:
                # Check if file has changed
                current_hash = self.get_file_hash(firmware_file)
                stored_hash = self.timestamps[file_path_str].get("file_hash")
                
                if current_hash != stored_hash:
                    logging.info(f"Firmware file changed: {firmware_file}")
                    # Update timestamp for changed file
                    timestamp_data = self.add_firmware_timestamp(firmware_file)
                    new_files.append((firmware_file, timestamp_data))
        
        return new_files
    
    def cleanup_old_firmware(self, days_old=30):
        """Clean up firmware files older than specified days."""
        cutoff_date = datetime.now() - timedelta(days=days_old)
        cleaned_files = []
        
        for file_path_str, timestamp_data in list(self.timestamps.items()):
            file_path = Path(file_path_str)
            
            # Check if file still exists
            if not file_path.exists():
                logging.info(f"Removing timestamp for deleted file: {file_path}")
                del self.timestamps[file_path_str]
                cleaned_files.append(file_path_str)
                continue
            
            # Check if file is old
            added_date = datetime.fromisoformat(timestamp_data["added"])
            if added_date < cutoff_date:
                logging.info(f"Cleaning up old firmware: {file_path} (added: {added_date})")
                
                # Move to archive instead of deleting
                archive_dir = Path("firmware-archive")
                archive_dir.mkdir(exist_ok=True)
                
                archive_path = archive_dir / file_path.name
                shutil.move(file_path, archive_path)
                
                # Update timestamp record
                timestamp_data["archived"] = datetime.now().isoformat()
                timestamp_data["archive_path"] = str(archive_path)
                
                cleaned_files.append(file_path_str)
        
        if cleaned_files:
            self.save_timestamps()
            logging.info(f"Cleaned up {len(cleaned_files)} firmware files")
        
        return cleaned_files
    
    def generate_firmware_report(self):
        """Generate a report of all firmware files."""
        report = {
            "generated": datetime.now().isoformat(),
            "total_files": len(self.timestamps),
            "firmware_files": []
        }
        
        for file_path_str, timestamp_data in sorted(self.timestamps.items()):
            file_path = Path(file_path_str)
            
            firmware_info = {
                "filename": file_path.name,
                "path": file_path_str,
                "added": timestamp_data["added"],
                "version": timestamp_data.get("version", "unknown"),
                "size_mb": round(timestamp_data["file_size"] / (1024 * 1024), 2),
                "exists": file_path.exists(),
                "archived": timestamp_data.get("archived", False)
            }
            
            report["firmware_files"].append(firmware_info)
        
        return report
    
    def update_manifest_with_timestamps(self):
        """Update manifest.json with firmware timestamps."""
        if not self.manifest_file.exists():
            logging.warning(f"Manifest file {self.manifest_file} does not exist")
            return
        
        try:
            with open(self.manifest_file, 'r') as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            logging.error(f"Failed to load manifest file {self.manifest_file}")
            return
        
        # Add timestamps to manifest builds
        for build in manifest.get("builds", []):
            for part in build.get("parts", []):
                firmware_path = part.get("path", "")
                if firmware_path and firmware_path in self.timestamps:
                    part["added"] = self.timestamps[firmware_path]["added"]
                    part["version"] = self.timestamps[firmware_path]["version"]
        
        # Save updated manifest
        with open(self.manifest_file, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        logging.info("Updated manifest with firmware timestamps")
    
    def monitor_loop(self, check_interval=300):  # 5 minutes
        """Main monitoring loop."""
        logging.info(f"Starting firmware monitoring (check interval: {check_interval}s)")
        
        while True:
            try:
                # Scan for new firmware
                new_files = self.scan_firmware_directory()
                if new_files:
                    logging.info(f"Found {len(new_files)} new/changed firmware files")
                    
                    # Update manifest with timestamps
                    self.update_manifest_with_timestamps()
                    
                    # Trigger manifest regeneration
                    os.system("python3 scripts/generate-manifest.py")
                    os.system("python3 scripts/update-web-interface.py")
                
                # Clean up old firmware (check daily)
                if datetime.now().hour == 2 and datetime.now().minute < 5:  # 2 AM
                    self.cleanup_old_firmware(days_old=30)
                
                time.sleep(check_interval)
                
            except KeyboardInterrupt:
                logging.info("Monitoring stopped by user")
                break
            except Exception as e:
                logging.error(f"Error in monitoring loop: {e}")
                time.sleep(60)  # Wait 1 minute before retrying


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Firmware monitoring and cleanup system")
    parser.add_argument("--scan", action="store_true", help="Scan firmware directory once")
    parser.add_argument("--cleanup", action="store_true", help="Clean up old firmware")
    parser.add_argument("--report", action="store_true", help="Generate firmware report")
    parser.add_argument("--monitor", action="store_true", help="Start monitoring loop")
    parser.add_argument("--days", type=int, default=30, help="Days old for cleanup")
    
    args = parser.parse_args()
    
    monitor = FirmwareMonitor()
    
    if args.scan:
        new_files = monitor.scan_firmware_directory()
        if new_files:
            print(f"Found {len(new_files)} new/changed firmware files:")
            for file_path, timestamp_data in new_files:
                print(f"  - {file_path} (added: {timestamp_data['added']})")
        else:
            print("No new firmware files found")
    
    elif args.cleanup:
        cleaned_files = monitor.cleanup_old_firmware(days_old=args.days)
        if cleaned_files:
            print(f"Cleaned up {len(cleaned_files)} firmware files")
        else:
            print("No firmware files to clean up")
    
    elif args.report:
        report = monitor.generate_firmware_report()
        print(f"Firmware Report (Generated: {report['generated']})")
        print(f"Total files: {report['total_files']}")
        print("\nFirmware Files:")
        for fw in report['firmware_files']:
            status = "EXISTS" if fw['exists'] else "MISSING"
            if fw['archived']:
                status = "ARCHIVED"
            print(f"  - {fw['filename']} ({fw['version']}) - {fw['size_mb']}MB - {status}")
    
    elif args.monitor:
        monitor.monitor_loop()
    
    else:
        print("No action specified. Use --scan, --cleanup, --report, or --monitor")


if __name__ == "__main__":
    main()