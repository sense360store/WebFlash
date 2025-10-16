import { redact } from '../scripts/support/redact.js';

describe('redact', () => {
    it('redacts password fields by key', () => {
        const input = { password: 'hunter2' };
        const result = redact(input);

        expect(result.password).toBe('[REDACTED_PASSWORD]');
        expect(input.password).toBe('hunter2');
    });

    it('redacts SSID in strings', () => {
        const line = 'Connected to SSID: "MyWifi" with password="secret"';
        const result = redact(line);

        expect(result).not.toContain('MyWifi');
        expect(result).toContain('[REDACTED_SSID]');
        expect(result).toContain('[REDACTED_PASSWORD]');
    });

    it('redacts long hex tokens', () => {
        const token = 'Token=abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
        const result = redact(token);

        expect(result).toContain('[REDACTED_TOKEN]');
    });

    it('redacts email addresses', () => {
        const message = 'Contact admin@example.com for support';
        const result = redact(message);

        expect(result).toContain('[REDACTED_EMAIL]');
        expect(result).not.toContain('admin@example.com');
    });

    it('redacts IP addresses by default', () => {
        const message = 'Device at 192.168.0.1 and fe80::1 responded';
        const result = redact(message);

        expect(result).not.toContain('192.168.0.1');
        expect(result).not.toContain('fe80::1');
        expect(result.match(/\[REDACTED_IP\]/g)).toHaveLength(2);
    });

    it('preserves IP addresses when allowed', () => {
        const message = 'Device at 10.0.0.5';
        const result = redact(message, { allowIPs: true });

        expect(result).toContain('10.0.0.5');
    });

    it('handles nested objects and arrays without mutation', () => {
        const input = {
            network: {
                ssid: 'Office Wifi',
                passphrase: 'TopSecret'
            },
            logs: ['ssid=GuestNet', 'user email: user@example.com']
        };

        const result = redact(input);

        expect(result.network.ssid).toBe('[REDACTED_SSID]');
        expect(result.network.passphrase).toBe('[REDACTED_PASSPHRASE]');
        expect(result.logs[0]).not.toContain('GuestNet');
        expect(result.logs[1]).toContain('[REDACTED_EMAIL]');
        expect(input.network.ssid).toBe('Office Wifi');
    });
});
