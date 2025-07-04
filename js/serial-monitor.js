export class SerialMonitor {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isMonitoring = false;
        this.onDataReceived = null;
        this.decoder = new TextDecoder();
        this.encoder = new TextEncoder();
    }

    setPort(port) {
        this.port = port;
    }

    async startMonitoring() {
        if (!this.port || this.isMonitoring) return;

        try {
            this.isMonitoring = true;
            console.log('Starting serial monitor...');
            
            // Get reader and writer
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            
            console.log('Serial monitor started successfully');
            
            // Start reading loop
            this.readLoop();
            
        } catch (error) {
            console.error('Failed to start monitoring:', error);
            this.isMonitoring = false;
            throw error;
        }
    }

    async readLoop() {
        try {
            while (this.isMonitoring && this.reader) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    break;
                }
                
                if (value) {
                    const text = this.decoder.decode(value);
                    if (this.onDataReceived) {
                        this.onDataReceived(text);
                    }
                }
            }
        } catch (error) {
            if (this.isMonitoring) {
                console.error('Serial read error:', error);
            }
        }
    }

    async sendCommand(command) {
        if (!this.writer) return;

        try {
            const data = this.encoder.encode(command + '\n');
            await this.writer.write(data);
        } catch (error) {
            console.error('Failed to send command:', error);
        }
    }

    async stopMonitoring() {
        this.isMonitoring = false;
        
        if (this.reader) {
            await this.reader.cancel();
            this.reader.releaseLock();
            this.reader = null;
        }
        
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
    }
}
