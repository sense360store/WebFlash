#!/bin/bash
echo 'Auto-updating manifest and web interface...'

# Check if cleanup flag is provided
if [ "$1" == "--cleanup" ] || [ "$1" == "-c" ]; then
    echo 'Running cleanup mode (removes deleted firmware entries)...'
    python3 scripts/cleanup-manifest.py --regenerate
else
    echo 'Running normal update mode...'
    python3 scripts/generate-manifest.py --firmware-dir firmware
    python3 scripts/update-web-interface.py --html index.html
fi

echo '✓ Manifest and web interface updated!'
echo 'You can now commit and push the changes.'

