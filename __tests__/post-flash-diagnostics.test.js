import { describe, expect, test, beforeEach, jest } from '@jest/globals';

const detectCapabilitiesMock = jest.fn();
const getFlashHistoryMock = jest.fn();
const validateFirmwareProvenanceMock = jest.fn();

async function loadDiagnostics() {
    jest.resetModules();
    jest.unstable_mockModule('../scripts/capabilities.js', () => ({
        detectCapabilities: detectCapabilitiesMock,
        evaluateBrowserReadiness: jest.fn(() => ({ level: 'ok', reasons: [], capabilities: detectCapabilitiesMock() }))
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
    jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({
        downloadJsonFile: jest.fn(() => true)
    }));
    jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({
        copyTextToClipboard: jest.fn()
    }));
    return import('../scripts/services/diagnostics.js');
}

beforeEach(() => {
    detectCapabilitiesMock.mockReset();
    getFlashHistoryMock.mockReset();
    validateFirmwareProvenanceMock.mockReset();

    detectCapabilitiesMock.mockReturnValue({
        webSerial: true,
        webUSB: true,
        ua: 'Mozilla/5.0 Chrome/130.0.0.0',
        browser: 'chrome',
        browserName: 'Google Chrome',
        isSupported: true,
        secureContext: true,
        isMobile: false,
        os: 'macos',
        osName: 'macOS'
    });
    getFlashHistoryMock.mockReturnValue([]);
    validateFirmwareProvenanceMock.mockReturnValue({ status: 'pass' });
});

describe('support bundle includes post_flash section', () => {
    test('post_flash defaults to not_started when no provider snapshot', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle).toHaveProperty('post_flash');
        expect(bundle.post_flash.status).toBe('not_started');
        expect(bundle.post_flash.validation_attempted).toBe(false);
        expect(bundle.post_flash.validation_result).toBe('unknown');
        expect(bundle.post_flash.home_assistant_handoff_shown).toBe(false);
        expect(bundle.post_flash.wifi_handoff_shown).toBe(false);
        expect(bundle.post_flash.recovery_handoff_shown).toBe(false);
    });

    test('post_flash carries provider snapshot fields', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({
            postFlashSnapshot: {
                status: 'completed_validation_unknown',
                selected_firmware_version: '2.0.0',
                selected_firmware_name: 'Sense360 Modular Platform Firmware',
                selected_config: 'Ceiling-POE-AirIQ',
                selected_channel: 'stable',
                selected_commit: '49301128e122e9fe486e548828714290c8ee93b8',
                selected_improv_supported: true,
                validation_attempted: true,
                validation_result: 'unknown',
                validation_checks: [
                    { name: 'device_reconnect', status: 'not_available', detail: 'web serial unavailable' },
                    { name: 'device_firmware_identity', status: 'not_available', detail: null },
                    { name: 'version_match', status: 'not_available', detail: null },
                    { name: 'improv_endpoint_available', status: 'not_available', detail: null },
                    { name: 'wifi_provisioning_capability', status: 'not_available', detail: null }
                ],
                home_assistant_handoff_shown: true,
                wifi_handoff_shown: false,
                wifi_handoff_status: null,
                recovery_handoff_shown: false,
                last_error_message: null,
                started_at: '2026-05-04T12:00:00.000Z',
                finished_at: '2026-05-04T12:00:42.000Z',
                duration_ms: 42000
            }
        }));
        const bundle = buildSupportBundle();
        expect(bundle.post_flash.status).toBe('completed_validation_unknown');
        expect(bundle.post_flash.selected_firmware_version).toBe('2.0.0');
        expect(bundle.post_flash.selected_config).toBe('Ceiling-POE-AirIQ');
        expect(bundle.post_flash.validation_attempted).toBe(true);
        expect(bundle.post_flash.validation_checks).toHaveLength(5);
        expect(bundle.post_flash.home_assistant_handoff_shown).toBe(true);
    });

    test('post_flash bundle never includes Wi-Fi credentials even if provider leaks them', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        // Simulate a misbehaving provider that includes credentials. The
        // post-flash section field allowlist should not pass them through.
        setSupportBundleStateProvider(() => ({
            postFlashSnapshot: {
                status: 'completed_validation_passed',
                ssid: 'MyHomeWifi',
                password: 'supersecret',
                psk: 'supersecret',
                wifi_password: 'supersecret',
                validation_checks: [],
                selected_firmware_version: '2.0.0',
                selected_config: 'Ceiling-POE-AirIQ'
            }
        }));
        const bundle = buildSupportBundle();
        const serialised = JSON.stringify(bundle.post_flash).toLowerCase();
        expect(serialised).not.toContain('myhomewifi');
        // The redactor catches these key names anyway, but the allowlist
        // also drops them — assert neither passes through.
        expect(serialised).not.toMatch(/"ssid"\s*:/);
        expect(serialised).not.toMatch(/"password"\s*:/);
        expect(serialised).not.toMatch(/"psk"\s*:/);
        expect(serialised).not.toMatch(/"wifi_password"\s*:/);
    });

    test('post_flash defaults gracefully when provider returns malformed snapshot', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({ postFlashSnapshot: 'not-an-object' }));
        const bundle = buildSupportBundle();
        expect(bundle.post_flash.status).toBe('not_started');
    });
});
