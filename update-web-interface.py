#!/usr/bin/env python3
"""
Update the web interface to show multiple firmware options dynamically.
This script modifies index.html to display all available firmware options.
"""

import json
import argparse
import re
from pathlib import Path
from datetime import datetime

def get_firmware_timestamp(build):
    """Get formatted timestamp for firmware build."""
    if "timestamp" in build:
        try:
            dt = datetime.fromisoformat(build["timestamp"].replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d %H:%M UTC")
        except:
            pass
    return "Unknown"

def generate_firmware_options_html(manifest_file="manifest.json"):
    """Generate HTML for firmware options based on manifest.json."""
    try:
        with open(manifest_file, 'r') as f:
            manifest = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # No manifest or invalid JSON, return empty state
        return """        <div class="firmware-info" id="firmware-info">
            <h2>No Firmware Available</h2>
            <div class="firmware-details">
                <h3>Firmware Not Deployed</h3>
                <p>No firmware has been deployed yet. Add a YAML file to the iot-firmware-src repository to trigger automatic firmware building and deployment.</p>
                <div class="firmware-features">
                    <span class="feature-tag">Auto-Build</span>
                    <span class="feature-tag">Auto-Deploy</span>
                    <span class="feature-tag">Lifecycle Management</span>
                </div>
            </div>
        </div>"""
    
    builds = manifest.get("builds", [])
    
    if not builds:
        return """        <div class="firmware-info" id="firmware-info">
            <h2>No Firmware Available</h2>
            <div class="firmware-details">
                <h3>Firmware Not Deployed</h3>
                <p>No firmware has been deployed yet. Add a YAML file to the iot-firmware-src repository to trigger automatic firmware building and deployment.</p>
                <div class="firmware-features">
                    <span class="feature-tag">Auto-Build</span>
                    <span class="feature-tag">Auto-Deploy</span>
                    <span class="feature-tag">Lifecycle Management</span>
                </div>
            </div>
        </div>"""
    
    if len(builds) == 1:
        # Single firmware option
        build = builds[0]
        firmware_name = build.get("name", "ESP32 Firmware")
        chip_family = build.get("chipFamily", "ESP32")
        timestamp = get_firmware_timestamp(build)
        
        return f"""        <div class="firmware-info" id="firmware-info">
            <h2>Available Firmware</h2>
            <div class="firmware-details">
                <h3>{firmware_name}</h3>
                <p>Ready to install on {chip_family} devices</p>
                <p class="firmware-timestamp">Added: {timestamp}</p>
                <div class="firmware-features">
                    <span class="feature-tag">Auto-Detection</span>
                    <span class="feature-tag">{chip_family}</span>
                    <span class="feature-tag">Easy Installation</span>
                </div>
            </div>
        </div>"""
    
    # Multiple firmware options
    firmware_list = []
    for build in builds:
        firmware_name = build.get("name", "ESP32 Firmware")
        chip_family = build.get("chipFamily", "ESP32")
        timestamp = get_firmware_timestamp(build)
        
        firmware_list.append(f"""                <div class="firmware-option">
                    <h4>{firmware_name}</h4>
                    <p>Target: {chip_family} | Added: {timestamp}</p>
                </div>""")
    
    return f"""        <div class="firmware-info" id="firmware-info">
            <h2>Available Firmware</h2>
            <div class="firmware-details">
                <h3>Multiple Firmware Options</h3>
                <p>Choose from {len(builds)} available firmware options for your ESP32 device.</p>
                <div class="firmware-options">
{chr(10).join(firmware_list)}
                </div>
                <div class="firmware-features">
                    <span class="feature-tag">Auto-Detection</span>
                    <span class="feature-tag">Multi-Chip Support</span>
                    <span class="feature-tag">Easy Installation</span>
                </div>
            </div>
        </div>"""

def update_index_html(html_file="index.html", manifest_file="manifest.json"):
    """Update index.html with generated firmware options."""
    if not Path(html_file).exists():
        print(f"ERROR: {html_file} not found")
        return False
    
    with open(html_file, 'r') as f:
        content = f.read()
    
    # Generate new firmware info section
    new_firmware_info = generate_firmware_options_html(manifest_file)
    
    # Replace the firmware-info section
    pattern = r'<div class="firmware-info"[^>]*>.*?</div>\s*</div>'
    
    if re.search(pattern, content, re.DOTALL):
        content = re.sub(pattern, new_firmware_info, content, flags=re.DOTALL)
    else:
        print("WARNING: Could not find firmware-info section to replace")
        return False
    
    # Write updated content
    with open(html_file, 'w') as f:
        f.write(content)
    
    print(f"Updated {html_file} with firmware information")
    return True

def main():
    parser = argparse.ArgumentParser(description="Update web interface with firmware information")
    parser.add_argument("--html", default="index.html", help="HTML file to update")
    parser.add_argument("--manifest", default="manifest.json", help="Manifest file to read from")
    
    args = parser.parse_args()
    
    success = update_index_html(args.html, args.manifest)
    if not success:
        exit(1)

if __name__ == "__main__":
    main()