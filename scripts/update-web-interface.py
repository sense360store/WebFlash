#!/usr/bin/env python3
"""
Update the web interface to show multiple firmware options dynamically.
This script modifies index.html to display all available firmware options.
"""

import json
import re
from pathlib import Path

def get_firmware_timestamp(build):
    """Get formatted timestamp for firmware build."""
    # Load timestamps if available
    try:
        with open("firmware-timestamps.json", 'r') as f:
            timestamps = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return "Unknown"
    
    # Try to find timestamp for this build
    for part in build.get('parts', []):
        firmware_path = part.get('path', '')
        if firmware_path and firmware_path in timestamps:
            timestamp_data = timestamps[firmware_path]
            added_date = timestamp_data.get('added', '')
            if added_date:
                try:
                    from datetime import datetime
                    dt = datetime.fromisoformat(added_date.replace('Z', '+00:00'))
                    return dt.strftime('%Y-%m-%d %H:%M UTC')
                except:
                    return added_date
    
    return "Unknown"

def generate_firmware_options_html(manifest_file="manifest.json"):
    """Generate HTML for firmware options based on manifest.json."""
    
    try:
        with open(manifest_file, 'r') as f:
            manifest = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error reading manifest: {e}")
        return ""
    
    builds = manifest.get("builds", [])
    if not builds:
        print("No builds found in manifest, creating empty state")
        return {
            'firmware_options': '''
                        <div class="no-firmware-message">
                            <h3>No Firmware Available</h3>
                            <p>No firmware files have been deployed yet. Check back later for available firmware options.</p>
                        </div>''',
            'device_filter_options': '',
            'channel_filter_options': ''
        }
    
    html_options = []
    
    # Group builds by device type for filtering
    device_types = set()
    channels = set()
    
    for build in builds:
        name = build.get("name", "Unknown")
        # Extract device type and channel from name
        device_type = name.split(" (")[0]  # "TemperatureSensor (ESP32S3)" -> "TemperatureSensor"
        channel = "stable"
        if "beta" in name.lower():
            channel = "beta"
        elif "alpha" in name.lower():
            channel = "alpha"
        
        device_types.add(device_type.lower().replace(" ", ""))
        channels.add(channel)
    
    # Generate filter options
    device_filter_options = []
    for device_type in sorted(device_types):
        device_filter_options.append(f'<option value="{device_type}">{device_type.title()}</option>')
    
    channel_filter_options = []
    for channel in sorted(channels):
        channel_filter_options.append(f'<option value="{channel}">{channel.title()}</option>')
    
    # Generate firmware option HTML
    for i, build in enumerate(builds):
        name = build.get("name", f"Firmware {i+1}")
        chip_family = build.get("chipFamily", "ESP32")
        
        # Extract info from name
        device_type = name.split(" (")[0]
        device_type_key = device_type.lower().replace(" ", "")
        
        channel = "stable"
        if "beta" in name.lower():
            channel = "beta"
        elif "alpha" in name.lower():
            channel = "alpha"
        
        # Create option ID
        option_id = f"{device_type_key}-{channel}"
        
        # Create description
        description = f"Firmware for {device_type} devices using {chip_family} chip family."
        
        # Create feature tags
        features = []
        features.append(chip_family)
        if "sensor" in device_type.lower():
            features.append("Multi-Sensor")
        if "monitor" in device_type.lower():
            features.append("Monitoring")
        if "temperature" in device_type.lower():
            features.append("Temperature")
        if "co2" in device_type.lower():
            features.append("CO2")
        features.append("Wireless")
        
        feature_tags = ' '.join([f'<span class="feature">{feature}</span>' for feature in features])
        
        # Determine if this should be checked (first stable option)
        checked = "checked" if i == 0 else ""
        
        # Channel badge class
        badge_class = "stable" if channel == "stable" else "beta" if channel == "beta" else "alpha"
        
        option_html = f'''
                        <div class="firmware-option" data-module="{device_type_key}" data-release="{channel}">
                            <input type="radio" id="{option_id}" name="firmware" value="{option_id}" {checked}>
                            <label for="{option_id}">
                                <div class="option-header">
                                    <strong>{name}</strong>
                                    <span class="version-badge {badge_class}">{channel.title()}</span>
                                </div>
                                <div class="option-meta">
                                    <span class="release-date">Updated: {get_firmware_timestamp(build)}</span>
                                </div>
                                <div class="option-description">
                                    {description}
                                </div>
                                <div class="option-features">
                                    {feature_tags}
                                </div>
                            </label>
                        </div>'''
        
        html_options.append(option_html)
    
    return {
        'firmware_options': '\n'.join(html_options),
        'device_filter_options': '\n'.join(device_filter_options),
        'channel_filter_options': '\n'.join(channel_filter_options)
    }

def update_index_html(html_file="index.html", manifest_file="manifest.json"):
    """Update index.html with generated firmware options."""
    
    # Generate new content
    content = generate_firmware_options_html(manifest_file)
    if not content:
        print("No content generated, skipping update")
        return False
    
    try:
        with open(html_file, 'r') as f:
            html_content = f.read()
    except FileNotFoundError:
        print(f"HTML file {html_file} not found")
        return False
    
    # Update device family filter options
    device_filter_pattern = r'(<select id="device-family"[^>]*>.*?<option value="all">All Families</option>)(.*?)(</select>)'
    new_device_options = f'<option value="all">All Families</option>\n                                {content["device_filter_options"]}'
    html_content = re.sub(device_filter_pattern, f'\\1\n                                {content["device_filter_options"]}\n                            \\3', html_content, flags=re.DOTALL)
    
    # Update release type filter options  
    release_filter_pattern = r'(<select id="release-type"[^>]*>.*?<option value="all">All Types</option>)(.*?)(</select>)'
    new_release_options = f'<option value="all">All Types</option>\n                                {content["channel_filter_options"]}'
    html_content = re.sub(release_filter_pattern, f'\\1\n                                {content["channel_filter_options"]}\n                            \\3', html_content, flags=re.DOTALL)
    
    # Update firmware options
    firmware_options_pattern = r'(<div class="firmware-options">)(.*?)(</div>)'
    html_content = re.sub(firmware_options_pattern, f'\\1{content["firmware_options"]}\n                    \\3', html_content, flags=re.DOTALL)
    
    # Write updated content
    with open(html_file, 'w') as f:
        f.write(html_content)
    
    print(f"Updated {html_file} with {len(content['firmware_options'].split('firmware-option'))-1} firmware options")
    return True

def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Update web interface with firmware options from manifest")
    parser.add_argument("--html", default="index.html", help="HTML file to update")
    parser.add_argument("--manifest", default="manifest.json", help="Manifest file to read")
    
    args = parser.parse_args()
    
    success = update_index_html(args.html, args.manifest)
    if success:
        print("Web interface updated successfully")
    else:
        print("Failed to update web interface")

if __name__ == "__main__":
    main()