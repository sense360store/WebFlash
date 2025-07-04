export class ESPFlasher {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.onProgress = null;
        this.onStatusChange = null;
    }

    async connect() {
        try {
            // Request serial port with no filters to show all available devices
            this.port = await navigator.serial.requestPort({});

            console.log('Port selected:', this.port);
            
            // Open the port
            await this.port.open({
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            console.log('Port opened successfully');

            // Get device info
            const deviceInfo = await this.getDeviceInfo();
            
            const portInfo = this.port.getInfo();
            console.log('Port info:', portInfo);
            
            return {
                port: this.port,
                name: portInfo.usbProductName || 'Serial Device',
                chipType: deviceInfo.chipType || 'ESP32',
                ...deviceInfo
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
            throw error;
        }
    }

    async getDeviceInfo() {
        try {
            // Enter bootloader mode
            await this.enterBootloader();
            
            // Read chip ID
            const chipId = await this.readChipId();
            
            return {
                chipType: this.getChipType(chipId),
                chipId: chipId
            };
            
        } catch (error) {
            console.error('Failed to get device info:', error);
            return { chipType: 'ESP32' };
        }
    }

    async enterBootloader() {
        if (!this.port) return;
        
        try {
            // Set DTR and RTS to enter bootloader
            await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
            await this.delay(100);
            await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
            await this.delay(100);
            await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
            
        } catch (error) {
            console.error('Failed to enter bootloader:', error);
        }
    }

    async readChipId() {
        // This is a simplified version - in a real implementation,
        // you would send ESP-specific commands to read the chip ID
        return 0x00000000; // Default ESP32 chip ID
    }

    getChipType(chipId) {
        // Map chip IDs to chip types
        const chipTypes = {
            0x00000000: 'ESP32',
            0x00000002: 'ESP32-S2',
            0x00000005: 'ESP32-C3',
            0x00000009: 'ESP32-S3',
            0x0000000C: 'ESP32-C2',
            0x0000000D: 'ESP32-C6',
            0x00000010: 'ESP32-H2'
        };
        
        return chipTypes[chipId] || 'ESP32';
    }

    async flashFirmware(build) {
        if (!this.port || !build.parts || build.parts.length === 0) {
            throw new Error('No firmware parts to flash');
        }

        try {
            if (this.onStatusChange) {
                this.onStatusChange('Entering bootloader mode...');
            }
            
            await this.enterBootloader();
            
            for (let i = 0; i < build.parts.length; i++) {
                const part = build.parts[i];
                
                if (this.onStatusChange) {
                    this.onStatusChange(`Flashing part ${i + 1}/${build.parts.length}...`);
                }
                
                await this.flashPart(part);
                
                if (this.onProgress) {
                    this.onProgress(((i + 1) / build.parts.length) * 100);
                }
            }
            
            if (this.onStatusChange) {
                this.onStatusChange('Resetting device...');
            }
            
            await this.resetDevice();
            
        } catch (error) {
            console.error('Firmware flashing failed:', error);
            throw error;
        }
    }

    async flashPart(part) {
        try {
            // Download firmware file
            const response = await fetch(part.path);
            if (!response.ok) {
                throw new Error(`Failed to download firmware: ${response.statusText}`);
            }
            
            const firmwareData = await response.arrayBuffer();
            
            // In a real implementation, you would:
            // 1. Send flash begin command with offset and size
            // 2. Send firmware data in chunks
            // 3. Send flash end command
            
            // For now, we'll simulate the flashing process
            await this.simulateFlashing(firmwareData, part.offset);
            
        } catch (error) {
            console.error('Failed to flash part:', error);
            throw error;
        }
    }

    async simulateFlashing(data, offset) {
        // Simulate flashing process with delays
        const chunkSize = 1024;
        const chunks = Math.ceil(data.byteLength / chunkSize);
        
        for (let i = 0; i < chunks; i++) {
            // Simulate writing chunk
            await this.delay(10);
            
            if (this.onProgress) {
                const progress = (i / chunks) * 100;
                this.onProgress(progress);
            }
        }
    }

    async resetDevice() {
        if (!this.port) return;
        
        try {
            // Reset the device
            await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
            await this.delay(100);
            await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
            
        } catch (error) {
            console.error('Failed to reset device:', error);
        }
    }

    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
            this.reader = null;
        }
        
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
        
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
