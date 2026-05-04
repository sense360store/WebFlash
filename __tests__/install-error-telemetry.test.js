import { jest } from '@jest/globals';

const logErrorMock = jest.fn();
const logWarningMock = jest.fn();
const logInfoMock = jest.fn();

async function loadOverrides() {
    jest.unstable_mockModule('../scripts/services/error-log.js', () => ({
        logError: logErrorMock,
        logWarning: logWarningMock,
        logInfo: logInfoMock
    }));
    return import('../scripts/utils/esp-web-tools-overrides.js');
}

describe('describeInstallError', () => {
    let mod;
    beforeEach(async () => {
        jest.resetModules();
        logErrorMock.mockReset();
        logWarningMock.mockReset();
        logInfoMock.mockReset();
        mod = await loadOverrides();
    });

    test('serial port busy → friendly hint about closing other serial apps', () => {
        const result = mod.describeInstallError('Failed to initialize. Make sure the device is plugged in...');
        expect(result.summary).toMatch(/serial port/);
        expect(result.hint).toMatch(/Arduino IDE|PlatformIO|ESPHome/);
    });

    test('connection failure → bootloader hint', () => {
        const result = mod.describeInstallError('Failed to connect to ESP32');
        expect(result.summary).toMatch(/USB/);
        expect(result.hint).toMatch(/BOOT.*RESET/);
    });

    test('permission denied → SecurityError hint about HTTPS', () => {
        const result = mod.describeInstallError('SecurityError: Permission denied');
        expect(result.summary).toMatch(/blocked access/);
        expect(result.hint).toMatch(/HTTPS/);
    });

    test('unknown error passes the original message through', () => {
        const result = mod.describeInstallError('A totally novel failure');
        expect(result.summary).toBe('A totally novel failure');
        expect(result.hint).toBeNull();
    });
});

describe('attachInstallErrorTelemetry', () => {
    let mod;
    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '';
        logErrorMock.mockReset();
        logWarningMock.mockReset();
        logInfoMock.mockReset();
        mod = await loadOverrides();
    });

    test('logs ERROR state-changed events through describeInstallError', () => {
        const button = document.createElement('div');
        document.body.appendChild(button);
        mod.attachInstallErrorTelemetry(button);

        button.dispatchEvent(new CustomEvent('state-changed', {
            detail: {
                state: 'ERROR',
                message: 'Failed to connect to ESP32',
                error: new Error('Failed to connect to ESP32')
            }
        }));

        expect(logErrorMock).toHaveBeenCalledTimes(1);
        const [source, message, context] = logErrorMock.mock.calls[0];
        expect(source).toBe('esp-web-tools');
        expect(message).toMatch(/USB/);
        expect(message).toMatch(/BOOT.*RESET/);
        expect(context.state).toBe('ERROR');
        expect(context.hint).toMatch(/BOOT/);
    });

    test('logs WARNING state-changed events through logWarning', () => {
        const button = document.createElement('div');
        mod.attachInstallErrorTelemetry(button);
        button.dispatchEvent(new CustomEvent('state-changed', {
            detail: { state: 'WARNING', message: 'Slow connection' }
        }));
        expect(logWarningMock).toHaveBeenCalledTimes(1);
        expect(logWarningMock.mock.calls[0][1]).toBe('Slow connection');
    });

    test('is idempotent — only attaches once per element', () => {
        const button = document.createElement('div');
        mod.attachInstallErrorTelemetry(button);
        mod.attachInstallErrorTelemetry(button);
        button.dispatchEvent(new CustomEvent('state-changed', {
            detail: { state: 'ERROR', message: 'Boom', error: new Error('Boom') }
        }));
        expect(logErrorMock).toHaveBeenCalledTimes(1);
    });
});
