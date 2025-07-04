import { ESPFlasher } from './esp-flasher.js';
import { SerialMonitor } from './serial-monitor.js';

class ESP32FlasherApp {
    constructor() {
        this.flasher = new ESPFlasher();
        this.serialMonitor = new SerialMonitor();
        this.manifest = null;
        this.connectedDevice = null;
        
        this.initializeElements();
        this.bindEvents();
        this.checkBrowserSupport();
        this.loadManifest();
    }

    initializeElements() {
        this.elements = {
            connectBtn: document.getElementById('connect-btn'),
            flashBtn: document.getElementById('flash-btn'),
            sendCommandBtn: document.getElementById('send-command-btn'),
            clearSerialBtn: document.getElementById('clear-serial-btn'),
            provisionWifiBtn: document.getElementById('provision-wifi-btn'),
            
            browserWarning: document.getElementById('browser-warning'),
            httpsWarning: document.getElementById('https-warning'),
            deviceInfo: document.getElementById('device-info'),
            firmwareInfo: document.getElementById('firmware-info'),
            wifiSection: document.getElementById('wifi-section'),
            flashProgress: document.getElementById('flash-progress'),
            
            deviceName: document.getElementById('device-name'),
            chipType: document.getElementById('chip-type'),
            connectionStatus: document.getElementById('connection-status'),
            firmwareName: document.getElementById('firmware-name'),
            firmwareVersion: document.getElementById('firmware-version'),
            flashStatus: document.getElementById('flash-status'),
            progressFill: document.getElementById('progress-fill'),
            
            serialOutput: document.getElementById('serial-output'),
            serialCommand: document.getElementById('serial-command'),
            wifiSsid: document.getElementById('wifi-ssid'),
            wifiPassword: document.getElementById('wifi-password')
        };
    }

    bindEvents() {
        this.elements.connectBtn.addEventListener('click', () => this.connectDevice());
        this.elements.flashBtn.addEventListener('click', () => this.flashFirmware());
        this.elements.sendCommandBtn.addEventListener('click', () => this.sendCommand());
        this.elements.clearSerialBtn.addEventListener('click', () => this.clearSerial());
        this.elements.provisionWifiBtn.addEventListener('click', () => this.provisionWifi());
        
        this.elements.serialCommand.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCommand();
        });

        // Serial monitor events
        this.serialMonitor.onDataReceived = (data) => {
            this.handleSerialData(data);
        };

        // Flasher events
        this.flasher.onProgress = (progress) => {
            this.updateFlashProgress(progress);
        };

        this.flasher.onStatusChange = (status) => {
            this.updateFlashStatus(status);
        };
    }

    checkBrowserSupport() {
        console.log('Checking browser support...');
        console.log('User agent:', navigator.userAgent);
        console.log('Protocol:', location.protocol);
        console.log('Hostname:', location.hostname);
        
        if (!navigator.serial) {
            console.error('Web Serial API not supported');
            this.elements.browserWarning.classList.remove('hidden');
            this.elements.connectBtn.disabled = true;
            return false;
        }

        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            console.error('HTTPS required for Web Serial API');
            this.elements.httpsWarning.classList.remove('hidden');
            this.elements.connectBtn.disabled = true;
            return false;
        }

        console.log('Browser support OK');
        return true;
    }

    async loadManifest() {
        try {
            const response = await fetch('./manifest.json');
            this.manifest = await response.json();
            console.log('Manifest loaded:', this.manifest);
        } catch (error) {
            console.error('Failed to load manifest:', error);
            this.updateFlashStatus('Failed to load firmware manifest');
        }
    }

    async connectDevice() {
        try {
            this.elements.connectBtn.disabled = true;
            this.elements.connectBtn.textContent = 'Connecting...';
            
            console.log('Requesting serial port...');
            const device = await this.flasher.connect();
            console.log('Device connected:', device);
            this.connectedDevice = device;
            
            this.elements.deviceName.textContent = device.name || 'ESP32 Device';
            this.elements.chipType.textContent = device.chipType || 'Detecting...';
            this.elements.connectionStatus.textContent = 'Connected';
            
            this.elements.deviceInfo.classList.remove('hidden');
            this.elements.connectBtn.textContent = 'Disconnect';
            this.elements.connectBtn.disabled = false;
            
            // Enable serial monitor
            this.serialMonitor.setPort(device.port);
            this.elements.sendCommandBtn.disabled = false;
            
            // Enable flash button if manifest is loaded
            if (this.manifest) {
                this.elements.flashBtn.disabled = false;
                this.updateFirmwareInfo();
            }
            
            // Start serial monitoring
            this.serialMonitor.startMonitoring();
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.elements.connectBtn.textContent = 'Connect Device';
            this.elements.connectBtn.disabled = false;
            
            // Provide user-friendly error messages
            let errorMessage = 'Connection failed';
            if (error.name === 'NotFoundError') {
                errorMessage = 'No device selected or no compatible devices found';
            } else if (error.name === 'NotAllowedError') {
                errorMessage = 'Device access denied by user';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Security error - make sure you\'re using HTTPS';
            } else if (error.message) {
                errorMessage = 'Connection failed: ' + error.message;
            }
            
            this.updateFlashStatus(errorMessage);
        }
    }

    async flashFirmware() {
        if (!this.connectedDevice || !this.manifest) {
            this.updateFlashStatus('No device connected or manifest not loaded');
            return;
        }

        try {
            this.elements.flashBtn.disabled = true;
            this.elements.flashProgress.classList.remove('hidden');
            this.updateFlashStatus('Preparing to flash...');
            
            const chipFamily = this.connectedDevice.chipType || 'ESP32';
            const build = this.manifest.builds.find(b => b.chipFamily === chipFamily);
            
            if (!build) {
                throw new Error(`No firmware found for chip family: ${chipFamily}`);
            }

            await this.flasher.flashFirmware(build);
            
            this.updateFlashStatus('Firmware flashed successfully!');
            this.elements.progressFill.style.width = '100%';
            
            // Check for Improv support after flashing
            setTimeout(() => {
                this.checkImprovSupport();
            }, 2000);
            
        } catch (error) {
            console.error('Flashing failed:', error);
            this.updateFlashStatus('Flashing failed: ' + error.message);
        } finally {
            this.elements.flashBtn.disabled = false;
        }
    }

    updateFirmwareInfo() {
        if (this.manifest) {
            this.elements.firmwareName.textContent = this.manifest.name;
            this.elements.firmwareVersion.textContent = this.manifest.version;
            this.elements.firmwareInfo.classList.remove('hidden');
        }
    }

    updateFlashProgress(progress) {
        this.elements.progressFill.style.width = `${progress}%`;
    }

    updateFlashStatus(status) {
        this.elements.flashStatus.textContent = status;
    }

    sendCommand() {
        const command = this.elements.serialCommand.value;
        if (command && this.connectedDevice) {
            this.serialMonitor.sendCommand(command);
            this.elements.serialCommand.value = '';
        }
    }

    clearSerial() {
        this.elements.serialOutput.innerHTML = '';
    }

    handleSerialData(data) {
        const output = this.elements.serialOutput;
        const line = document.createElement('div');
        line.className = 'serial-line';
        line.textContent = data;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
        
        // Check for Improv messages
        if (data.includes('IMPROV')) {
            this.elements.wifiSection.classList.remove('hidden');
        }
    }

    checkImprovSupport() {
        // Send Improv identification command
        this.serialMonitor.sendCommand('IMPROV\n');
    }

    async provisionWifi() {
        const ssid = this.elements.wifiSsid.value;
        const password = this.elements.wifiPassword.value;
        
        if (!ssid) {
            alert('Please enter Wi-Fi network name');
            return;
        }

        try {
            this.elements.provisionWifiBtn.disabled = true;
            this.elements.provisionWifiBtn.textContent = 'Provisioning...';
            
            // Send Improv Wi-Fi provisioning command
            const command = `IMPROV:WIFI:${ssid}:${password}`;
            this.serialMonitor.sendCommand(command);
            
            setTimeout(() => {
                this.elements.provisionWifiBtn.disabled = false;
                this.elements.provisionWifiBtn.textContent = 'Provision Wi-Fi';
            }, 3000);
            
        } catch (error) {
            console.error('Wi-Fi provisioning failed:', error);
            this.elements.provisionWifiBtn.disabled = false;
            this.elements.provisionWifiBtn.textContent = 'Provision Wi-Fi';
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ESP32FlasherApp();
});
