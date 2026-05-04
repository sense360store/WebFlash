import { describe, expect, test, beforeEach, jest } from '@jest/globals';

const copyTextToClipboardMock = jest.fn();
const downloadJsonFileMock = jest.fn();
const detectCapabilitiesMock = jest.fn();
const getFlashHistoryMock = jest.fn();
const validateFirmwareProvenanceMock = jest.fn();

async function loadDiagnostics() {
    jest.resetModules();
    jest.unstable_mockModule('../scripts/utils/copy-to-clipboard.js', () => ({
        copyTextToClipboard: copyTextToClipboardMock
    }));
    jest.unstable_mockModule('../scripts/utils/file-download.js', () => ({
        downloadJsonFile: downloadJsonFileMock
    }));
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
    return import('../scripts/services/diagnostics.js');
}

beforeEach(() => {
    copyTextToClipboardMock.mockReset();
    downloadJsonFileMock.mockReset();
    detectCapabilitiesMock.mockReset();
    getFlashHistoryMock.mockReset();
    validateFirmwareProvenanceMock.mockReset();
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
    document.body.innerHTML = '';
    downloadJsonFileMock.mockReturnValue(true);
});

describe('copySupportBundle', () => {
    test('writes pretty-printed JSON to clipboard on success', async () => {
        copyTextToClipboardMock.mockResolvedValue(undefined);
        const { copySupportBundle } = await loadDiagnostics();
        const trigger = document.createElement('button');
        const ok = await copySupportBundle(trigger);
        expect(ok).toBe(true);
        expect(copyTextToClipboardMock).toHaveBeenCalledTimes(1);
        const payload = copyTextToClipboardMock.mock.calls[0][0];
        // Pretty-printed: must contain newlines and 2-space indent.
        expect(payload).toContain('\n  ');
        // Must parse as JSON.
        expect(() => JSON.parse(payload)).not.toThrow();
        const parsed = JSON.parse(payload);
        expect(parsed.schema_version).toBe(1);
    });

    test('marks trigger and shows toast on success', async () => {
        copyTextToClipboardMock.mockResolvedValue(undefined);
        const { copySupportBundle } = await loadDiagnostics();
        const trigger = document.createElement('button');
        await copySupportBundle(trigger);
        expect(trigger.dataset.copyState).toBe('success');
        const toast = document.getElementById('app-toast');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toMatch(/copied/i);
        expect(toast.textContent).toMatch(/support request/i);
    });

    test('falls back to error state and message when clipboard rejects', async () => {
        copyTextToClipboardMock.mockRejectedValue(new Error('denied'));
        const { copySupportBundle } = await loadDiagnostics();
        const trigger = document.createElement('button');
        const ok = await copySupportBundle(trigger);
        expect(ok).toBe(false);
        expect(trigger.dataset.copyState).toBe('error');
        const toast = document.getElementById('app-toast');
        expect(toast.textContent).toMatch(/Could not copy/i);
        expect(toast.textContent).toMatch(/manually/i);
    });

    test('still works when called without a trigger element', async () => {
        copyTextToClipboardMock.mockResolvedValue(undefined);
        const { copySupportBundle } = await loadDiagnostics();
        const ok = await copySupportBundle(null);
        expect(ok).toBe(true);
    });
});

describe('downloadSupportBundle', () => {
    test('calls downloadJsonFile with timestamped filename', async () => {
        const { downloadSupportBundle } = await loadDiagnostics();
        const trigger = document.createElement('button');
        const ok = downloadSupportBundle(trigger);
        expect(ok).toBe(true);
        expect(downloadJsonFileMock).toHaveBeenCalledTimes(1);
        const [filename, payload] = downloadJsonFileMock.mock.calls[0];
        expect(filename).toMatch(/^webflash-support-bundle-.+\.json$/);
        expect(payload.schema_version).toBe(1);
    });

    test('marks trigger.dataset.copyState=success when download succeeds', async () => {
        const { downloadSupportBundle } = await loadDiagnostics();
        const trigger = document.createElement('button');
        downloadSupportBundle(trigger);
        expect(trigger.dataset.copyState).toBe('success');
    });

    test('marks trigger.dataset.copyState=error when download returns false', async () => {
        downloadJsonFileMock.mockReturnValue(false);
        const { downloadSupportBundle } = await loadDiagnostics();
        const trigger = document.createElement('button');
        downloadSupportBundle(trigger);
        expect(trigger.dataset.copyState).toBe('error');
    });
});

describe('initSupportBundleActions delegated handlers', () => {
    test('clicking [data-copy-support-bundle] copies', async () => {
        copyTextToClipboardMock.mockResolvedValue(undefined);
        const mod = await loadDiagnostics();
        mod.__testHooks.resetActionsForTests();
        mod.initSupportBundleActions();

        const button = document.createElement('button');
        button.setAttribute('data-copy-support-bundle', '');
        document.body.appendChild(button);
        button.click();

        // wait for async click handler chain
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(copyTextToClipboardMock).toHaveBeenCalledTimes(1);
    });

    test('clicking legacy [data-copy-diagnostics] still copies', async () => {
        copyTextToClipboardMock.mockResolvedValue(undefined);
        const mod = await loadDiagnostics();
        mod.__testHooks.resetActionsForTests();
        mod.initSupportBundleActions();

        const button = document.createElement('button');
        button.setAttribute('data-copy-diagnostics', '');
        document.body.appendChild(button);
        button.click();

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(copyTextToClipboardMock).toHaveBeenCalledTimes(1);
    });

    test('clicking [data-download-support-bundle] downloads', async () => {
        const mod = await loadDiagnostics();
        mod.__testHooks.resetActionsForTests();
        mod.initSupportBundleActions();

        const button = document.createElement('button');
        button.setAttribute('data-download-support-bundle', '');
        document.body.appendChild(button);
        button.click();

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(downloadJsonFileMock).toHaveBeenCalledTimes(1);
    });

    test('initSupportBundleActions is idempotent', async () => {
        copyTextToClipboardMock.mockResolvedValue(undefined);
        const mod = await loadDiagnostics();
        mod.__testHooks.resetActionsForTests();
        mod.initSupportBundleActions();
        mod.initSupportBundleActions();
        mod.initSupportBundleActions();

        const button = document.createElement('button');
        button.setAttribute('data-copy-support-bundle', '');
        document.body.appendChild(button);
        button.click();

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(copyTextToClipboardMock).toHaveBeenCalledTimes(1);
    });
});
