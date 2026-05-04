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

describe('buildSupportBundle — schema and shape', () => {
    test('schema_version is integer 1', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.schema_version).toBe(1);
    });

    test('generated_at is an ISO8601 string', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(typeof bundle.generated_at).toBe('string');
        expect(bundle.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('all nine top-level sections are present', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        ['app', 'environment', 'manifest', 'firmware', 'wizard', 'preflight', 'recovery', 'cache', 'flash'].forEach(key => {
            expect(bundle).toHaveProperty(key);
            expect(typeof bundle[key]).toBe('object');
        });
    });
});

describe('buildSupportBundle — app and environment', () => {
    test('app section has required fields with fallback values', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.app).toHaveProperty('app_version');
        expect(bundle.app).toHaveProperty('build_commit');
        expect(bundle.app).toHaveProperty('build_timestamp');
        expect(bundle.app.app_version).toBe('1.0.0');
        expect(bundle.app.build_commit).toBe('unknown');
        expect(bundle.app.build_timestamp).toBe('unknown');
    });

    test('app reads from <meta> tags when present', async () => {
        document.head.innerHTML = `
            <meta name="webflash-app-version" content="2.5.0">
            <meta name="webflash-build-commit" content="abc1234">
            <meta name="webflash-build-timestamp" content="2026-05-04T12:00:00Z">
        `;
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.app.app_version).toBe('2.5.0');
        expect(bundle.app.build_commit).toBe('abc1234');
        expect(bundle.app.build_timestamp).toBe('2026-05-04T12:00:00Z');
        document.head.innerHTML = '';
    });

    test('environment uses detectCapabilities output', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.environment.browser).toBe('Google Chrome');
        expect(bundle.environment.platform).toBe('macOS');
        expect(bundle.environment.web_serial_supported).toBe(true);
        expect(bundle.environment.secure_context).toBe(true);
        expect(bundle.environment.mobile_detected).toBe(false);
        expect(bundle.environment.user_agent_redacted).toBe(true);
    });

    test('environment reflects unsupported browser', async () => {
        detectCapabilitiesMock.mockReturnValue({
            webSerial: false,
            ua: 'Mozilla/5.0 Firefox/120.0',
            browser: 'firefox',
            browserName: 'Mozilla Firefox',
            isSupported: false,
            secureContext: true,
            isMobile: false,
            os: 'linux',
            osName: 'Linux'
        });
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.environment.web_serial_supported).toBe(false);
        expect(bundle.preflight.web_serial_supported).toBe(false);
        expect(bundle.preflight.browser_supported).toBe(false);
    });
});

describe('buildSupportBundle — firmware and provenance', () => {
    test('firmware fields populated from current selection', async () => {
        validateFirmwareProvenanceMock.mockReturnValue({ status: 'warn' });
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({
            currentFirmware: {
                config_string: 'Ceiling-POE-AirIQ',
                version: '2.0.0',
                channel: 'stable',
                recommended: true,
                deprecated: false,
                source_commit: 'abc123',
                source_url: 'https://github.com/example/repo/commit/abc123',
                sha256: 'deadbeef',
                signature: 'sig'
            }
        }));
        const bundle = buildSupportBundle();
        expect(bundle.firmware.selected_config).toBe('Ceiling-POE-AirIQ');
        expect(bundle.firmware.selected_version).toBe('2.0.0');
        expect(bundle.firmware.channel).toBe('stable');
        expect(bundle.firmware.recommended).toBe(true);
        expect(bundle.firmware.deprecated).toBe(false);
        expect(bundle.firmware.sha256_present).toBe(true);
        expect(bundle.firmware.signature_present).toBe(true);
        expect(bundle.firmware.provenance_status).toBe('warn');
    });

    test('firmware sha256/signature only reported as booleans, never raw values', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({
            currentFirmware: {
                config_string: 'X',
                sha256: 'abcdef',
                signature: 'mysignature'
            }
        }));
        const bundle = buildSupportBundle();
        expect(bundle.firmware.sha256_present).toBe(true);
        expect(bundle.firmware.signature_present).toBe(true);
        const json = JSON.stringify(bundle);
        expect(json).not.toContain('abcdef');
        expect(json).not.toContain('mysignature');
    });
});

describe('buildSupportBundle — wizard', () => {
    test('wizard step and selected modules', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({
            stepInfo: { current: 4, maxReachable: 5 },
            configuration: {
                mounting: 'ceiling',
                power: 'poe',
                airiq: 'airiq',
                fan: 'pwm',
                led: 'none'
            }
        }));
        const bundle = buildSupportBundle();
        expect(bundle.wizard.current_step).toBe(4);
        expect(bundle.wizard.max_reachable_step).toBe(5);
        expect(bundle.wizard.selected_modules).toEqual(['airiq', 'fan']);
        expect(bundle.wizard.selected_power).toBe('poe');
        expect(bundle.wizard.shareable_link_available).toBe(true);
    });
});

describe('buildSupportBundle — recovery and cache', () => {
    test('recovery.mode_active true when releaseMode is recovery', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({ releaseMode: 'recovery' }));
        const bundle = buildSupportBundle();
        expect(bundle.recovery.mode_active).toBe(true);
        expect(bundle.recovery.rescue_manifest).toBe('./firmware/rescue/manifest.json');
    });

    test('recovery.mode_active false in normal mode', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({ releaseMode: 'normal' }));
        const bundle = buildSupportBundle();
        expect(bundle.recovery.mode_active).toBe(false);
    });

    test('cache.service_worker_supported reflects navigator', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(typeof bundle.cache.service_worker_supported).toBe('boolean');
        expect(typeof bundle.cache.service_worker_controlled).toBe('boolean');
    });

    test('cache.manifest_freshness mirrors provider value', async () => {
        const { buildSupportBundle, setSupportBundleStateProvider } = await loadDiagnostics();
        setSupportBundleStateProvider(() => ({ manifestFreshness: 'current' }));
        const bundle = buildSupportBundle();
        expect(bundle.cache.manifest_freshness).toBe('current');
        expect(bundle.manifest.freshness).toBe('current');
    });
});

describe('buildSupportBundle — flash history', () => {
    test('uses latest flash entry when present', async () => {
        getFlashHistoryMock.mockReturnValue([
            {
                id: 'a',
                timestamp: '2026-05-04T00:00:00.000Z',
                configString: 'Ceiling-POE-AirIQ',
                firmwareVersion: '2.0.0',
                channel: 'stable',
                status: 'error',
                errorMessage: 'Permission denied opening serial port',
                browser: 'Chrome',
                duration: 0
            }
        ]);
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.flash.last_attempt_started_at).toBe('2026-05-04T00:00:00.000Z');
        expect(bundle.flash.last_attempt_result).toBe('error');
        expect(bundle.flash.error_code).toBe('permission_denied');
        expect(bundle.flash.error_message).toContain('Permission denied');
    });

    test('flash.recovery_attempt true when configString includes Rescue', async () => {
        getFlashHistoryMock.mockReturnValue([{
            timestamp: '2026-05-04T00:00:00.000Z',
            configString: 'Sense360 Rescue v1.0.0',
            status: 'error',
            duration: 0
        }]);
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.flash.recovery_attempt).toBe(true);
    });

    test('flash section is null/false when history empty', async () => {
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.flash.last_attempt_started_at).toBeNull();
        expect(bundle.flash.last_attempt_result).toBeNull();
        expect(bundle.flash.recovery_attempt).toBe(false);
    });

    test('flash error message scrubs embedded paths and MACs', async () => {
        getFlashHistoryMock.mockReturnValue([{
            timestamp: '2026-05-04T00:00:00.000Z',
            configString: 'X',
            status: 'error',
            errorMessage: 'Wrote to /home/alice/secret.bin from MAC aa:bb:cc:dd:ee:ff',
            duration: 0
        }]);
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.flash.error_message).not.toContain('/home/alice');
        expect(bundle.flash.error_message).toContain('[REDACTED_PATH]');
        expect(bundle.flash.error_message).toContain('[REDACTED_MAC]');
    });

    test('flash error message scrubs Bearer token substring', async () => {
        getFlashHistoryMock.mockReturnValue([{
            timestamp: '2026-05-04T00:00:00.000Z',
            configString: 'X',
            status: 'error',
            errorMessage: 'Auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.abc123',
            duration: 0
        }]);
        const { buildSupportBundle } = await loadDiagnostics();
        const bundle = buildSupportBundle();
        expect(bundle.flash.error_message).not.toContain('eyJhbGci');
        expect(bundle.flash.error_message).toContain('[REDACTED_TOKEN]');
    });
});
