#!/usr/bin/env python3
"""
Add timestamp to firmware files when they're deployed.
This script is called by the CI/CD pipeline to track firmware deployments.
"""

import os
import json
import hashlib
from datetime import datetime
from pathlib import Path

def get_file_hash(file_path):
    """Calculate SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()

def extract_metadata_from_filename(filename):
    """Extract metadata from firmware filename."""
    # Pattern: Sense360-[DeviceType]-[ChipFamily]-v[Version]-[Channel].bin
    parts = filename.replace('.bin', '').split('-')
    
    metadata = {
        "device_type": "unknown",
        "chip_family": "unknown", 
        "version": "unknown",
        "channel": "unknown"
    }
    
    if len(parts) >= 4:
        metadata["device_type"] = parts[1] if len(parts) > 1 else "unknown"
        metadata["chip_family"] = parts[2] if len(parts) > 2 else "unknown"
        
        # Find version (starts with 'v')
        for part in parts:
            if part.startswith('v') and len(part) > 1:
                metadata["version"] = part[1:]  # Remove 'v' prefix
                break
        
        # Last part is usually channel
        if len(parts) > 3:
            metadata["channel"] = parts[-1]
    
    return metadata

def add_firmware_timestamp(firmware_path, build_info=None):
    """Add timestamp for deployed firmware."""
    file_path = Path(firmware_path)
    
    if not file_path.exists():
        print(f"ERROR: Firmware file not found: {firmware_path}")
        return False
    
    # Load existing timestamps
    timestamp_file = Path("firmware-timestamps.json")
    if timestamp_file.exists():
        try:
            with open(timestamp_file, 'r') as f:
                timestamps = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            timestamps = {}
    else:
        timestamps = {}
    
    # Calculate file info
    file_hash = get_file_hash(file_path)
    file_size = file_path.stat().st_size
    metadata = extract_metadata_from_filename(file_path.name)
    
    # Create timestamp record
    timestamp_data = {
        "added": datetime.now().isoformat(),
        "file_size": file_size,
        "file_hash": file_hash,
        "file_path": str(file_path),
        "filename": file_path.name,
        "metadata": metadata
    }
    
    # Add build info if provided
    if build_info:
        timestamp_data["build_info"] = build_info
    
    # Add environment info
    timestamp_data["deployment_info"] = {
        "github_sha": os.environ.get("GITHUB_SHA"),
        "github_ref": os.environ.get("GITHUB_REF"),
        "github_actor": os.environ.get("GITHUB_ACTOR"),
        "github_workflow": os.environ.get("GITHUB_WORKFLOW"),
        "github_run_id": os.environ.get("GITHUB_RUN_ID")
    }
    
    # Store timestamp
    timestamps[str(file_path)] = timestamp_data
    
    # Save timestamps
    with open(timestamp_file, 'w') as f:
        json.dump(timestamps, f, indent=2)
    
    print(f"Added timestamp for firmware: {file_path}")
    print(f"  Device: {metadata['device_type']}")
    print(f"  Chip: {metadata['chip_family']}")
    print(f"  Version: {metadata['version']}")
    print(f"  Channel: {metadata['channel']}")
    print(f"  Size: {round(file_size / (1024 * 1024), 2)} MB")
    print(f"  Hash: {file_hash[:16]}...")
    
    return True

def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Add timestamp to firmware files")
    parser.add_argument("firmware_path", help="Path to firmware file")
    parser.add_argument("--build-date", help="Build date")
    parser.add_argument("--build-time", help="Build time")
    parser.add_argument("--esphome-version", help="ESPHome version used")
    
    args = parser.parse_args()
    
    # Prepare build info
    build_info = {}
    if args.build_date:
        build_info["build_date"] = args.build_date
    if args.build_time:
        build_info["build_time"] = args.build_time
    if args.esphome_version:
        build_info["esphome_version"] = args.esphome_version
    
    # Add timestamp
    success = add_firmware_timestamp(args.firmware_path, build_info)
    
    if success:
        print("Firmware timestamp added successfully")
    else:
        print("Failed to add firmware timestamp")
        exit(1)

if __name__ == "__main__":
    main()