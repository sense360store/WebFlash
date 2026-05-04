import { describe, expect, test, beforeEach, jest } from '@jest/globals';

const detectCapabilitiesMock = jest.fn();
const getFlashHistoryMock = jest.fn();
const validateFirmwareProvenanceMock = jest.fn();

async function loadDiagnostics() {
    jest.resetModules();
    jest.unstable_mockModule('../scripts/capabilities.js', () => ({
        detectCapabilities: detectCapabilitiesMock,
        evaluateBrowserReadiness: jest.fn(() => ({ level: 'ok', reasons: [] }))
    }));
    jest.unstable_mockModule('../scripts/utils/flash-history.js', () => ({
        getFlashHistory: getFlashHistoryMock,
        recordFlashStart: jest.fn(),
        recordFlashSuccess: jest.fn(),
        recordFlashError: jest.fn(),
        exportFlashHistoryText: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/utils/firmware-provenance.js', () => ({
        validateFirmwareProvenance: validateFirmwareProvenanceMock
    }));
    jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({
        copyTextToClipboard: jest.fn()
    }));
    jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({
        downloadJsonFile: jest.fn(() => true)
    }));
    return import('../scripts/services/diagnostics.js');
}

beforeEach(() => {
    detectCapabilitiesMock.mockReset();
    detectCapabilitiesMock.mockReturnValue({
        webSerial: true,
        ua: 'Chrome',
        browser: 'chrome',
        browserName: 'Chrome',
        isSupported: true,
        secureContext: true,
        isMobile: false,
        os: 'macos',
        osName: 'macOS'
    });
    getFlashHistoryMock.mockReturnValue([]);
    validateFirmwareProvenanceMock.mockReturnValue({ status: 'pass' });
});

describe('USB test session state', () => {
    test('recordUsbTestResult round-trips into bundle.preflight', async () => {
        const { recordUsbTestResult, buildSupportBundle } = await loadDiagnostics();
        recordUsbTestResult({ result: 'permission_denied', timestamp: '2026-05-04T00:00:00.000Z' });
        const bundle = buildSupportBundle();
        expect(bundle.preflight.last_usb_test_result).toBe('permission_denied');
        expect(bundle.preflight.last_usb_test_timestamp).toBe('2026-05-04T00:00:00.000Z');
    });

    test('default state has null USB test fields', async () => {
        const { buildSupportBundle, resetSessionDiagnosticsStateForTests } = await loadDiagnostics();
        resetSessionDiagnosticsStateForTests();
        const bundle = buildSupportBundle();
        expect(bundle.preflight.last_usb_test_result).toBeNull();
        expect(bundle.preflight.last_usb_test_timestamp).toBeNull();
    });

    test('records `cancelled` result when user dismisses picker', async () => {
        const { recordUsbTestResult, buildSupportBundle } = await loadDiagnostics();
        recordUsbTestResult({ result: 'cancelled' });
        const bundle = buildSupportBundle();
        expect(bundle.preflight.last_usb_test_result).toBe('cancelled');
        expect(bundle.preflight.last_usb_test_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe('Recovery session state', () => {
    test('recordRecoveryAcknowledged round-trips', async () => {
        const { recordRecoveryAcknowledged, buildSupportBundle } = await loadDiagnostics();
        recordRecoveryAcknowledged(true);
        const bundle = buildSupportBundle();
        expect(bundle.recovery.recovery_acknowledged).toBe(true);
    });

    test('recordBootloaderInstructionsShown round-trips', async () => {
        const { recordBootloaderInstructionsShown, buildSupportBundle } = await loadDiagnostics();
        recordBootloaderInstructionsShown(true);
        const bundle = buildSupportBundle();
        expect(bundle.recovery.bootloader_instructions_shown).toBe(true);
    });

    test('recordRecoveryResult round-trips with success', async () => {
        const { recordRecoveryResult, buildSupportBundle } = await loadDiagnostics();
        recordRecoveryResult({ result: 'success' });
        const bundle = buildSupportBundle();
        expect(bundle.recovery.last_recovery_result).toBe('success');
    });

    test('recordRecoveryResult round-trips with failure', async () => {
        const { recordRecoveryResult, buildSupportBundle } = await loadDiagnostics();
        recordRecoveryResult({ result: 'failed', error: new Error('flash error') });
        const bundle = buildSupportBundle();
        expect(bundle.recovery.last_recovery_result).toBe('failed');
    });
});

describe('Cache and update session state', () => {
    test('recordCacheClearRequested sets a timestamp string', async () => {
        const { recordCacheClearRequested, buildSupportBundle } = await loadDiagnostics();
        recordCacheClearRequested(Date.parse('2026-05-04T01:02:03Z'));
        const bundle = buildSupportBundle();
        expect(bundle.cache.cache_clear_requested).toBe('2026-05-04T01:02:03.000Z');
    });

    test('recordUpdateAvailable round-trips', async () => {
        const { recordUpdateAvailable, buildSupportBundle } = await loadDiagnostics();
        recordUpdateAvailable(true);
        const bundle = buildSupportBundle();
        expect(bundle.cache.update_available).toBe(true);
    });
});

describe('resetSessionDiagnosticsStateForTests', () => {
    test('clears all recorded session state', async () => {
        const mod = await loadDiagnostics();
        mod.recordUsbTestResult({ result: 'pass' });
        mod.recordRecoveryAcknowledged(true);
        mod.recordCacheClearRequested(Date.now());
        mod.recordUpdateAvailable(true);
        mod.resetSessionDiagnosticsStateForTests();

        const bundle = mod.buildSupportBundle();
        expect(bundle.preflight.last_usb_test_result).toBeNull();
        expect(bundle.recovery.recovery_acknowledged).toBe(false);
        expect(bundle.cache.cache_clear_requested).toBeNull();
        expect(bundle.cache.update_available).toBe(false);
    });
});
