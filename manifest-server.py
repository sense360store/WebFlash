#!/usr/bin/env python3
"""
Simple HTTP server for serving firmware manifests dynamically.
This handles the dynamic manifest generation for ESP Web Tools.
"""

import http.server
import socketserver
import urllib.parse
import json
import os
from pathlib import Path

class ManifestRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        # Handle dynamic manifest requests
        if parsed_path.path == '/selected-firmware.json':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Return empty manifest - will be replaced by JavaScript
            empty_manifest = {
                "name": "Select Firmware",
                "version": "1.0.0",
                "builds": []
            }
            self.wfile.write(json.dumps(empty_manifest).encode())
            return
        
        # Handle CORS preflight
        if self.command == 'OPTIONS':
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            return
            
        # Add CORS headers to all responses
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            super().end_headers()
        
        # Default file serving
        super().do_GET()

def main():
    PORT = 5000
    Handler = ManifestRequestHandler
    
    # Change to WebFlash directory
    os.chdir(Path(__file__).parent)
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving firmware installer at http://localhost:{PORT}")
        print("Press Ctrl+C to stop the server")
        httpd.serve_forever()

if __name__ == "__main__":
    main()