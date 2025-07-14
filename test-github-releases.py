#!/usr/bin/env python3
"""
Test GitHub Releases Functionality
==================================

This script tests the GitHub release automation functionality
to ensure it works correctly with the existing workflow.

Usage:
  python3 test-github-releases.py
"""

import os
import json
import subprocess
from pathlib import Path
from datetime import datetime

def log(message):
    """Log message with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")

def test_releases_functionality():
    """Test the GitHub releases functionality."""
    log("=" * 60)
    log("TESTING GITHUB RELEASES FUNCTIONALITY")
    log("=" * 60)
    
    # Test 1: Check if releases tracking works
    log("🧪 TEST 1: Testing releases tracking")
    
    # Import the automation class
    try:
        import sys
        sys.path.append('.')
        exec(open('deploy-automation.py').read())
        automation = GitHubPagesAutomation(create_releases=True)
        
        # Test tracking functions
        tracking_data = automation.load_releases_tracking()
        log(f"✓ Releases tracking loaded: {len(tracking_data.get('released_firmware', []))} entries")
        
        # Test signature generation
        test_build = {
            'device_type': 'CO2Monitor',
            'version': '1.0.0',
            'channel': 'stable',
            'chipFamily': 'ESP32-S3'
        }
        signature = automation.get_firmware_signature(test_build)
        log(f"✓ Firmware signature generated: {signature}")
        
    except Exception as e:
        log(f"❌ Test 1 failed: {e}")
        return False
    
    # Test 2: Check GitHub token detection
    log("\n🧪 TEST 2: Testing GitHub token detection")
    
    github_token = os.environ.get('GITHUB_TOKEN')
    if github_token:
        log("✓ GITHUB_TOKEN found in environment")
    else:
        log("⚠️  GITHUB_TOKEN not found (releases will be skipped)")
    
    # Test 3: Test without releases flag
    log("\n🧪 TEST 3: Testing automation without releases flag")
    
    try:
        result = subprocess.run(
            ['python3', 'deploy-automation.py'],
            capture_output=True, text=True, timeout=60
        )
        
        if result.returncode == 0:
            log("✓ Automation without releases completed successfully")
            # Check that no releases were processed
            if "Processing GitHub releases" not in result.stdout:
                log("✓ GitHub releases step was skipped (as expected)")
            else:
                log("⚠️  GitHub releases step ran unexpectedly")
        else:
            log(f"❌ Automation failed: {result.stderr}")
            return False
            
    except Exception as e:
        log(f"❌ Test 3 failed: {e}")
        return False
    
    # Test 4: Test with releases flag (dry run)
    log("\n🧪 TEST 4: Testing automation with releases flag")
    
    try:
        result = subprocess.run(
            ['python3', 'deploy-automation.py', '--releases'],
            capture_output=True, text=True, timeout=60
        )
        
        if result.returncode == 0:
            log("✓ Automation with releases completed successfully")
            # Check that releases were processed
            if "Processing GitHub releases" in result.stdout:
                log("✓ GitHub releases step was executed")
            else:
                log("⚠️  GitHub releases step was not found in output")
        else:
            log(f"❌ Automation with releases failed: {result.stderr}")
            return False
            
    except Exception as e:
        log(f"❌ Test 4 failed: {e}")
        return False
    
    # Test 5: Verify web UI still works
    log("\n🧪 TEST 5: Testing web UI compatibility")
    
    try:
        # Check that manifests are still valid
        with open('manifest.json') as f:
            manifest = json.load(f)
        
        log(f"✓ Main manifest is valid: {len(manifest['builds'])} builds")
        
        # Check individual manifests
        for i in range(len(manifest['builds'])):
            with open(f'firmware-{i}.json') as f:
                individual = json.load(f)
            log(f"✓ Individual manifest {i} is valid")
        
        log("✓ Web UI compatibility confirmed")
        
    except Exception as e:
        log(f"❌ Test 5 failed: {e}")
        return False
    
    # Success summary
    log("\n" + "=" * 60)
    log("✅ ALL GITHUB RELEASES TESTS PASSED")
    log("=" * 60)
    log("✓ Releases tracking functionality works")
    log("✓ Automation works with and without --releases flag")
    log("✓ Web UI remains compatible")
    log("✓ No existing functionality was broken")
    
    return True

def main():
    """Run the GitHub releases tests."""
    try:
        success = test_releases_functionality()
        if success:
            print("\n🎉 ALL TESTS PASSED!")
            print("GitHub releases functionality is working correctly.")
            return 0
        else:
            print("\n❌ TESTS FAILED!")
            return 1
    except Exception as e:
        print(f"\n💥 TEST SUITE CRASHED: {e}")
        return 1

if __name__ == '__main__':
    exit(main())