import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

const PANEL_HTML = `
<section
    class="post-flash-panel"
    data-post-flash-panel
    data-state="not_started"
    data-tone="idle"
    aria-live="polite"
    hidden
    aria-hidden="true"
>
    <header data-post-flash-header>
        <h3 data-post-flash-title></h3>
        <p data-post-flash-summary></p>
    </header>
    <dl data-post-flash-firmware-meta></dl>
    <h4 data-post-flash-next-steps-heading hidden aria-hidden="true">Next steps</h4>
    <ol data-post-flash-next-steps hidden aria-hidden="true"></ol>
    <ul data-post-flash-validation-list hidden></ul>
    <section data-post-flash-handoff="home-assistant" hidden aria-hidden="true">
        <ol data-post-flash-ha-steps></ol>
        <button type="button" data-post-flash-ha-open>Open Home Assistant</button>
    </section>
    <section data-post-flash-handoff="wifi" hidden aria-hidden="true">
        <p data-post-flash-wifi-status></p>
    </section>
    <section data-post-flash-handoff="recovery" hidden aria-hidden="true">
        <button type="button" data-post-flash-recovery-open data-rescue-open>Open Rescue &amp; Recovery</button>
        <details data-post-flash-recovery-fallback hidden></details>
    </section>
    <footer class="post-flash-support" data-prominence="subtle" hidden aria-hidden="true">
        <button type="button" data-post-flash-copy-bundle data-copy-support-bundle>Copy support bundle</button>
        <button type="button" data-post-flash-view-diagnostics>View diagnostics</button>
    </footer>
</section>
`;

async function loadPanelAndService() {
    jest.resetModules();
    const service = await import('../scripts/services/post-flash.js');
    const panel = await import('../scripts/layout/post-flash-panel.js');
    return { service, panel };
}

describe('post-flash panel rendering', () => {
    beforeEach(async () => {
        document.body.innerHTML = PANEL_HTML;
        // Pretend rescue modal is wired up.
        const trigger = document.createElement('button');
        trigger.dataset.rescueHeaderTrigger = '';
        document.body.appendChild(trigger);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('panel renders for not_started → in_progress → completed lifecycle', async () => {
        const { service, panel } = await loadPanelAndService();
        panel.__testHooks.bindPanelActions();
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const root = document.querySelector('[data-post-flash-panel]');
        expect(root.dataset.state).toBe('not_started');
        expect(root.hidden).toBe(true);

        service.postFlashService.captureSelectedBuild({
            name: 'Sense360 Modular Platform Firmware',
            version: '2.0.0',
            channel: 'stable',
            config_string: 'Ceiling-POE-AirIQ',
            improv: true,
            source_commit: 'abcdef1234567890'
        });
        service.postFlashService.dispatchLifecycle({ state: 'preparing' });
        panel.__testHooks.render(service.postFlashService.getSnapshot());
        expect(root.dataset.state).toBe('in_progress');
        expect(root.hidden).toBe(false);
        expect(document.querySelector('[data-post-flash-title]').textContent).toMatch(/Installing/i);
    });

    test('selected firmware details appear in result panel', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360 Modular Platform Firmware',
            version: '2.0.0',
            channel: 'stable',
            config_string: 'Ceiling-POE-AirIQ',
            improv: true,
            source_commit: '49301128e122e9fe486e548828714290c8ee93b8'
        });
        service.postFlashService.dispatchLifecycle({ state: 'finished' });
        service.postFlashService.__unsafeForceValidationClose?.() ||
            service.postFlashService.__unsafeApplyImprovInfo?.({});

        // Use the singleton service force-close via test hook.
        // postFlashService is a singleton with __unsafe* methods.
        if (typeof service.postFlashService.__unsafeForceValidationClose === 'function') {
            service.postFlashService.__unsafeForceValidationClose();
        }
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const dl = document.querySelector('[data-post-flash-firmware-meta]');
        const labels = Array.from(dl.querySelectorAll('dt')).map(dt => dt.textContent);
        const values = Array.from(dl.querySelectorAll('dd')).map(dd => dd.textContent);
        expect(labels).toEqual(expect.arrayContaining(['Firmware', 'Version', 'Channel', 'Configuration']));
        expect(values).toEqual(expect.arrayContaining([
            'Sense360 Modular Platform Firmware',
            '2.0.0',
            'stable',
            'Ceiling-POE-AirIQ'
        ]));
        expect(dl.textContent).toContain('49301128e122');
    });

    test('Home Assistant handoff appears for improv:true builds', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360', version: '2.0.0', channel: 'stable', config_string: 'Ceiling-POE-AirIQ', improv: true
        });
        service.postFlashService.dispatchLifecycle({ state: 'finished' });
        service.postFlashService.__unsafeForceValidationClose();
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const ha = document.querySelector('[data-post-flash-handoff="home-assistant"]');
        expect(ha.hidden).toBe(false);
        const steps = ha.querySelectorAll('[data-post-flash-ha-steps] li');
        expect(steps.length).toBeGreaterThan(0);
    });

    test('Home Assistant handoff hidden for improv:false builds (rescue)', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360', version: '2.0.0', channel: 'stable', config_string: 'Rescue', improv: false
        });
        service.postFlashService.dispatchLifecycle({ state: 'finished' });
        service.postFlashService.__unsafeForceValidationClose();
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const ha = document.querySelector('[data-post-flash-handoff="home-assistant"]');
        expect(ha.hidden).toBe(true);
    });

    test('Wi-Fi handoff appears with status text and never displays credentials', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360', version: '2.0.0', channel: 'stable', config_string: 'Ceiling-POE-AirIQ', improv: true
        });
        service.postFlashService.dispatchLifecycle({ state: 'finished' });
        service.postFlashService.__unsafeForceValidationClose();
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const wifi = document.querySelector('[data-post-flash-handoff="wifi"]');
        expect(wifi.hidden).toBe(false);
        const statusText = document.querySelector('[data-post-flash-wifi-status]').textContent;
        expect(statusText.toLowerCase()).not.toContain('ssid');
        expect(statusText.toLowerCase()).not.toContain('password');
    });

    test('Wi-Fi handoff shows unavailable for improv:false builds', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360', version: '2.0.0', channel: 'stable', config_string: 'Rescue', improv: false
        });
        service.postFlashService.dispatchLifecycle({ state: 'finished' });
        service.postFlashService.__unsafeForceValidationClose();
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const wifi = document.querySelector('[data-post-flash-handoff="wifi"]');
        expect(wifi.hidden).toBe(false);
        const statusEl = document.querySelector('[data-post-flash-wifi-status]');
        expect(statusEl.dataset.wifiStatus).toBe('unavailable');
    });

    test('recovery handoff appears after failed flash', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360', version: '2.0.0', channel: 'stable', config_string: 'Ceiling-POE-AirIQ', improv: true
        });
        service.postFlashService.dispatchLifecycle({ state: 'preparing' });
        service.postFlashService.dispatchLifecycle({ state: 'error', message: 'cable dropped' });
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const recovery = document.querySelector('[data-post-flash-handoff="recovery"]');
        expect(recovery.hidden).toBe(false);
        const button = recovery.querySelector('[data-post-flash-recovery-open]');
        expect(button.getAttribute('data-rescue-open')).not.toBeNull();
    });

    test('recovery handoff falls back to inline steps when rescue modal is unavailable', async () => {
        document.body.innerHTML = PANEL_HTML; // remove the rescue trigger
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.dispatchLifecycle({ state: 'preparing' });
        service.postFlashService.dispatchLifecycle({ state: 'error', message: 'fail' });
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const button = document.querySelector('[data-post-flash-recovery-open]');
        const fallback = document.querySelector('[data-post-flash-recovery-fallback]');
        expect(button.dataset.modalAvailable).toBe('false');
        expect(fallback.hidden).toBe(false);
    });

    test('failure state surfaces prominent support footer', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.dispatchLifecycle({ state: 'preparing' });
        service.postFlashService.dispatchLifecycle({ state: 'error', message: 'x' });
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const footer = document.querySelector('.post-flash-support');
        expect(footer.hidden).toBe(false);
        expect(footer.dataset.prominence).toBe('prominent');
    });

    test('success state surfaces subtle support footer', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.captureSelectedBuild({
            name: 'Sense360', version: '2.0.0', channel: 'stable', config_string: 'Ceiling-POE-AirIQ', improv: true
        });
        service.postFlashService.dispatchLifecycle({ state: 'finished' });
        // do not force-close — leave at completed (pending validation)
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const footer = document.querySelector('.post-flash-support');
        expect(footer.hidden).toBe(false);
    });

    test('user cancelled state renders cancelled summary', async () => {
        const { service, panel } = await loadPanelAndService();
        service.postFlashService.dispatchLifecycle({ state: 'preparing' });
        service.postFlashService.dispatchLifecycle({ state: 'idle' });
        panel.__testHooks.render(service.postFlashService.getSnapshot());

        const root = document.querySelector('[data-post-flash-panel]');
        expect(root.dataset.state).toBe('cancelled');
        const summary = document.querySelector('[data-post-flash-summary]').textContent;
        expect(summary.toLowerCase()).toContain('cancel');
    });
});
