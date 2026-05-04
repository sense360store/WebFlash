import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

async function loadPostFlash() {
    jest.resetModules();
    return import('../scripts/services/post-flash.js');
}

describe('post-flash validation checks', () => {
    let mod;
    let service;

    beforeEach(async () => {
        mod = await loadPostFlash();
        service = mod.__testHooks.createPostFlashService();
    });

    afterEach(() => {
        service.reset();
    });

    test('all five canonical checks are tracked', () => {
        const ids = service.getSnapshot().validation_checks.map(c => c.name);
        expect(ids).toEqual([
            'device_reconnect',
            'device_firmware_identity',
            'version_match',
            'improv_endpoint_available',
            'wifi_provisioning_capability'
        ]);
    });

    test('improv:false build marks Improv-derived checks not_available with reason', () => {
        service.captureSelectedBuild({ version: '2.0.0', config_string: 'Rescue', improv: false, channel: 'stable' });
        service.dispatchLifecycle({ state: 'writing' });
        service.dispatchLifecycle({ state: 'finished' });
        service.__unsafeForceValidationClose();
        const checks = service.getSnapshot().validation_checks;
        const byId = Object.fromEntries(checks.map(c => [c.name, c]));
        expect(byId.improv_endpoint_available.status).toBe('not_available');
        expect(byId.improv_endpoint_available.detail).toMatch(/improv/i);
        expect(byId.device_firmware_identity.status).toBe('not_available');
        expect(byId.version_match.status).toBe('not_available');
        expect(byId.wifi_provisioning_capability.status).toBe('not_available');
    });

    test('matching Improv version yields version_match passed', () => {
        service.captureSelectedBuild({
            name: 'Sense360 Modular Platform Firmware',
            version: '2.0.0',
            improv: true,
            channel: 'stable',
            config_string: 'Ceiling-POE-AirIQ'
        });
        service.dispatchLifecycle({ state: 'writing' });
        service.dispatchLifecycle({ state: 'finished' });
        service.__unsafeApplyImprovInfo({
            firmware: 'Sense360 Modular Platform Firmware',
            version: 'v2.0.0',
            name: 'core'
        });
        const versionCheck = service.getSnapshot().validation_checks.find(c => c.name === 'version_match');
        expect(versionCheck.status).toBe('passed');
    });

    test('mismatched Improv version yields version_match failed', () => {
        service.captureSelectedBuild({
            name: 'Sense360 Modular Platform Firmware',
            version: '2.0.0',
            improv: true,
            channel: 'stable',
            config_string: 'Ceiling-POE-AirIQ'
        });
        service.dispatchLifecycle({ state: 'finished' });
        service.__unsafeApplyImprovInfo({
            firmware: 'Sense360 Modular Platform Firmware',
            version: '1.0.0'
        });
        const versionCheck = service.getSnapshot().validation_checks.find(c => c.name === 'version_match');
        expect(versionCheck.status).toBe('failed');
    });

    test('Improv frame on improv:true build flips improv_endpoint_available to passed', () => {
        service.captureSelectedBuild({
            name: 'Sense360 Modular Platform Firmware',
            version: '2.0.0',
            improv: true,
            channel: 'stable',
            config_string: 'Ceiling-POE-AirIQ'
        });
        service.dispatchLifecycle({ state: 'finished' });
        service.__unsafeApplyImprovInfo({ firmware: 'Sense360', version: '2.0.0' });
        const endpoint = service.getSnapshot().validation_checks.find(c => c.name === 'improv_endpoint_available');
        expect(endpoint.status).toBe('passed');
    });

    test('wifi provisioning failure yields failed', () => {
        service.captureSelectedBuild({
            name: 'Sense360 Modular Platform Firmware',
            version: '2.0.0',
            improv: true,
            channel: 'stable',
            config_string: 'Ceiling-POE-AirIQ'
        });
        service.dispatchLifecycle({ state: 'finished' });
        service.__unsafeApplyWifiSignal('failed', 'Wi-Fi setup failed: invalid credentials');
        const wifi = service.getSnapshot().validation_checks.find(c => c.name === 'wifi_provisioning_capability');
        expect(wifi.status).toBe('failed');
        // Aggregation should now resolve to failed once we close.
        service.__unsafeForceValidationClose();
        expect(service.getSnapshot().status).toBe('completed_validation_failed');
    });

    test('aggregation: any failed → failed; default → unknown; never falsely passed', () => {
        // Any failed → failed
        const a = mod.__testHooks.createPostFlashService();
        a.captureSelectedBuild({ name: 'Sense360', version: '2.0.0', improv: true, channel: 'stable' });
        a.dispatchLifecycle({ state: 'finished' });
        a.__unsafeApplyWifiSignal('failed');
        a.__unsafeForceValidationClose();
        expect(a.getSnapshot().status).toBe('completed_validation_failed');

        // No failed, not all passed → unknown
        const b = mod.__testHooks.createPostFlashService();
        b.captureSelectedBuild({ name: 'Sense360', version: '2.0.0', improv: true, channel: 'stable' });
        b.dispatchLifecycle({ state: 'finished' });
        b.__unsafeForceValidationClose();
        expect(b.getSnapshot().status).toBe('completed_validation_unknown');
    });
});
