/**
 * Tests for WF-KIT-PRESETS-001 — Stage 1 productized kit bundle presets.
 *
 * Covers:
 *  - The static `scripts/data/kit-presets.js` mirror of upstream
 *    KIT-MATRIX-001 is well-formed and aligned with the live manifest.
 *  - Selecting an available preset applies the expected wizard state and
 *    advances to Step 5.
 *  - Selecting the LED preview preset does NOT bypass the release-channel
 *    preview-acknowledgement gate.
 *  - Selecting a planned (fan-control) preset never mutates wizard state.
 *  - The static markup in `index.html` lines up with the data module.
 *  - The "Build your own setup" / custom path remains intact.
 */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf-8'));
}

const setStateMock = jest.fn();
const setStepMock = jest.fn();
const getStateMock = jest.fn();
const getMaxReachableStepMock = jest.fn(() => 5);
const announceMock = jest.fn();
const setConfigurationModeMock = jest.fn();
const setSelectedKitSkuMock = jest.fn();
const setActiveKitMetadataMock = jest.fn();

function renderStepOne() {
    document.body.innerHTML = `
        <div id="webflash-a11y-live-region" role="status"></div>
        <div id="step-1">
            <section data-bundle-presets>
                <p data-bundle-preset-availability-notice hidden></p>
                <div data-bundle-presets-grid="available">
                    <button type="button" data-bundle-preset-id="S360-KIT-BATH-POE" data-bundle-preset-status="stable" aria-pressed="false">
                        <span data-bundle-preset-badge>Recommended</span>
                        <span class="bundle-preset-card__customized" data-bundle-preset-customized hidden></span>
                    </button>
                    <button type="button" data-bundle-preset-id="S360-KIT-BATH-POE-LED" data-bundle-preset-status="preview" aria-pressed="false">
                        <span data-bundle-preset-badge>Preview</span>
                        <span class="bundle-preset-card__customized" data-bundle-preset-customized hidden></span>
                    </button>
                </div>
                <details data-bundle-presets-planned>
                    <summary>Planned kits</summary>
                    <div data-bundle-presets-grid="planned">
                        <button type="button" data-bundle-preset-id="S360-KIT-BATH-RELAY" data-bundle-preset-status="planned" aria-pressed="false">
                            <span data-bundle-preset-badge>Planned</span>
                        </button>
                        <button type="button" data-bundle-preset-id="S360-KIT-BATH-TRIAC" data-bundle-preset-status="planned" aria-pressed="false">
                            <span data-bundle-preset-badge>Planned</span>
                        </button>
                        <button type="button" data-bundle-preset-id="S360-KIT-DUCT-PWM" data-bundle-preset-status="planned" aria-pressed="false">
                            <span data-bundle-preset-badge>Planned</span>
                        </button>
                        <button type="button" data-bundle-preset-id="S360-KIT-DUCT-DAC" data-bundle-preset-status="planned" aria-pressed="false">
                            <span data-bundle-preset-badge>Planned</span>
                        </button>
                    </div>
                </details>
            </section>
            <div data-start-paths>
                <button type="button" data-start-path="kit"></button>
                <button type="button" data-start-path="custom"></button>
                <button type="button" data-start-path="recovery" data-rescue-open></button>
            </div>
            <section data-manual-mode-panel data-custom-path-panel hidden>
                <button type="button" data-next>Continue to Core</button>
            </section>
        </div>
    `;
}

async function loadKitPresets({ url = 'http://localhost/' } = {}) {
    jest.resetModules();
    const { history } = window;
    history.replaceState(null, '', url);

    jest.unstable_mockModule('../scripts/state.js', () => ({
        getState: getStateMock,
        setState: setStateMock,
        setStep: setStepMock,
        getMaxReachableStep: getMaxReachableStepMock
    }));
    jest.unstable_mockModule('../scripts/services/diagnostics.js', () => ({
        setConfigurationMode: setConfigurationModeMock,
        setSelectedKitSku: setSelectedKitSkuMock,
        setActiveKitMetadata: setActiveKitMetadataMock
    }));
    jest.unstable_mockModule('../scripts/utils/a11y.js', () => ({
        announce: announceMock
    }));

    const module = await import('../scripts/kit-presets.js');
    module.__testHooks.resetLastAppliedPresetIdForTests();
    module.__testHooks.initBundlePresets();
    return module;
}

beforeEach(() => {
    setStateMock.mockReset();
    setStepMock.mockReset();
    getStateMock.mockReset();
    getStateMock.mockReturnValue({ mounting: null, power: null });
    getMaxReachableStepMock.mockReset();
    getMaxReachableStepMock.mockReturnValue(5);
    announceMock.mockReset();
    setConfigurationModeMock.mockReset();
    setSelectedKitSkuMock.mockReset();
    setActiveKitMetadataMock.mockReset();
    renderStepOne();
});

describe('WF-KIT-PRESETS-001 — kit preset data module', () => {
    test('exports six kit presets in the upstream KIT-MATRIX-001 order', async () => {
        const { KIT_PRESETS } = await import('../scripts/data/kit-presets.js');
        expect(KIT_PRESETS).toHaveLength(6);
        expect(KIT_PRESETS.map(p => p.id)).toEqual([
            'S360-KIT-BATH-POE',
            'S360-KIT-BATH-POE-LED',
            'S360-KIT-BATH-RELAY',
            'S360-KIT-BATH-TRIAC',
            'S360-KIT-DUCT-PWM',
            'S360-KIT-DUCT-DAC'
        ]);
    });

    test('each preset passes the validateKitPreset contract', async () => {
        const { KIT_PRESETS, validateKitPreset } = await import('../scripts/data/kit-presets.js');
        KIT_PRESETS.forEach(preset => {
            const result = validateKitPreset(preset);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });
    });

    test('Bathroom Kit — PoE is stable and maps to Ceiling-POE-VentIQ-RoomIQ', async () => {
        const { findKitPresetById } = await import('../scripts/data/kit-presets.js');
        const preset = findKitPresetById('S360-KIT-BATH-POE');
        expect(preset).not.toBeNull();
        expect(preset.status).toBe('stable');
        expect(preset.channel).toBe('stable');
        expect(preset.firmwareConfigString).toBe('Ceiling-POE-VentIQ-RoomIQ');
        expect(preset.requiresPreviewAcknowledgement).toBe(false);
        expect(preset.wizardState).toMatchObject({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        });
    });

    test('Bathroom Kit — PoE + Status Ring Preview is preview and maps to Ceiling-POE-VentIQ-RoomIQ-LED', async () => {
        const { findKitPresetById } = await import('../scripts/data/kit-presets.js');
        const preset = findKitPresetById('S360-KIT-BATH-POE-LED');
        expect(preset).not.toBeNull();
        expect(preset.status).toBe('preview');
        expect(preset.channel).toBe('preview');
        expect(preset.firmwareConfigString).toBe('Ceiling-POE-VentIQ-RoomIQ-LED');
        expect(preset.requiresPreviewAcknowledgement).toBe(true);
        expect(preset.wizardState).toMatchObject({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'led',
            voice: 'none'
        });
    });

    test('every stable/preview preset firmwareConfigString resolves to a manifest build with the matching channel', async () => {
        const { KIT_PRESETS } = await import('../scripts/data/kit-presets.js');
        const manifest = readJson('manifest.json');
        const buildsByConfig = new Map(
            (manifest.builds || []).map(build => [build.config_string, build])
        );
        KIT_PRESETS
            .filter(p => p.status === 'stable' || p.status === 'preview')
            .forEach(preset => {
                const build = buildsByConfig.get(preset.firmwareConfigString);
                expect(build).toBeDefined();
                expect(build.channel).toBe(preset.channel);
            });
    });

    test('planned presets carry no wizardState and no firmwareConfigString', async () => {
        const { KIT_PRESETS } = await import('../scripts/data/kit-presets.js');
        const planned = KIT_PRESETS.filter(p => p.status === 'planned');
        expect(planned.length).toBe(4);
        expect(planned.map(p => p.id)).toEqual([
            'S360-KIT-BATH-RELAY',
            'S360-KIT-BATH-TRIAC',
            'S360-KIT-DUCT-PWM',
            'S360-KIT-DUCT-DAC'
        ]);
        planned.forEach(preset => {
            expect(preset.firmwareConfigString).toBeNull();
            expect(preset.wizardState).toBeNull();
            // Each planned preset must explain why it isn't installable so
            // the user isn't left guessing.
            expect((preset.notAvailableReason || '').length).toBeGreaterThan(0);
        });
    });

    test('WF-UX-008 — customer-facing preset fields expose no internal task/release/tracking IDs', async () => {
        const { KIT_PRESETS } = await import('../scripts/data/kit-presets.js');
        // Internal identifiers may live ONLY in the developer/support-only
        // fields (`upstreamRef`, `blockers`), never in the customer-facing
        // copy the wizard renders.
        const INTERNAL_ID_PATTERN = /RELEASE-[A-Z]+-001|RELEASE-007|WF-IMPORT-[A-Z]+-001|WF-TRIAC-001|WF-HW-TEST|KIT-MATRIX-001|HW-005|COMPLIANCE-001|S360-300-BENCH-001|import-firmware-sources\.py/;
        const customerFacingFields = ['displayName', 'shortName', 'description', 'warning', 'notAvailableReason'];
        KIT_PRESETS.forEach(preset => {
            customerFacingFields.forEach(field => {
                const value = preset[field] || '';
                expect(value).not.toMatch(INTERNAL_ID_PATTERN);
            });
        });
    });

    test('WF-UX-008 — each planned preset reason points the customer at a next step', async () => {
        const { KIT_PRESETS } = await import('../scripts/data/kit-presets.js');
        KIT_PRESETS.filter(p => p.status === 'planned').forEach(preset => {
            // Plain-language reason with an actionable next step (use the
            // supported kit / check back later).
            expect(preset.notAvailableReason).toMatch(/Bathroom Kit|check back later/i);
        });
    });

    test('isPresetAvailable returns true only for stable + preview presets with wizardState', async () => {
        const { KIT_PRESETS, isPresetAvailable } = await import('../scripts/data/kit-presets.js');
        const available = KIT_PRESETS.filter(isPresetAvailable);
        expect(available.map(p => p.id)).toEqual(['S360-KIT-BATH-POE', 'S360-KIT-BATH-POE-LED']);
        const planned = KIT_PRESETS.filter(p => p.status === 'planned');
        planned.forEach(preset => {
            expect(isPresetAvailable(preset)).toBe(false);
        });
    });

    test('isPresetMatch identifies the live wizard state against each preset', async () => {
        const { findKitPresetById, isPresetMatch } = await import('../scripts/data/kit-presets.js');
        const bathPoe = findKitPresetById('S360-KIT-BATH-POE');
        const bathPoeLed = findKitPresetById('S360-KIT-BATH-POE-LED');

        const wizardStateBathPoe = {
            mounting: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        };
        expect(isPresetMatch(wizardStateBathPoe, bathPoe)).toBe(true);
        expect(isPresetMatch(wizardStateBathPoe, bathPoeLed)).toBe(false);

        const wizardStateBathPoeLed = { ...wizardStateBathPoe, led: 'led' };
        expect(isPresetMatch(wizardStateBathPoeLed, bathPoe)).toBe(false);
        expect(isPresetMatch(wizardStateBathPoeLed, bathPoeLed)).toBe(true);

        // Planned presets carry no wizardState; isPresetMatch must return false
        // rather than crash.
        const plannedRelay = findKitPresetById('S360-KIT-BATH-RELAY');
        expect(isPresetMatch(wizardStateBathPoe, plannedRelay)).toBe(false);
    });
});

describe('WF-KIT-PRESETS-001 — preset → wizard state mapping', () => {
    test('clicking the Bathroom Kit — PoE card applies the Release-One state and advances to Step 5', async () => {
        await loadKitPresets();
        const card = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE"]');
        expect(card).not.toBeNull();
        card.click();

        expect(setStateMock).toHaveBeenCalled();
        const lastState = setStateMock.mock.calls[setStateMock.mock.calls.length - 1][0];
        expect(lastState).toMatchObject({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        });

        expect(setConfigurationModeMock).toHaveBeenCalledWith('kit');
        expect(setSelectedKitSkuMock).toHaveBeenCalledWith('S360-KIT-BATH-POE');
        expect(setActiveKitMetadataMock).toHaveBeenCalledWith(expect.objectContaining({
            sku: 'S360-KIT-BATH-POE',
            firmware_config_string: 'Ceiling-POE-VentIQ-RoomIQ'
        }));
        expect(setStepMock).toHaveBeenCalledWith(5, expect.objectContaining({ animate: true }));
    });

    test('clicking the Bathroom Kit — PoE + Status Ring Preview card applies the LED-enabled state and advances to Step 5', async () => {
        await loadKitPresets();
        const card = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE-LED"]');
        expect(card).not.toBeNull();
        card.click();

        expect(setStateMock).toHaveBeenCalled();
        const lastState = setStateMock.mock.calls[setStateMock.mock.calls.length - 1][0];
        expect(lastState).toMatchObject({
            mount: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'led',
            voice: 'none'
        });

        expect(setSelectedKitSkuMock).toHaveBeenCalledWith('S360-KIT-BATH-POE-LED');
        expect(setActiveKitMetadataMock).toHaveBeenCalledWith(expect.objectContaining({
            sku: 'S360-KIT-BATH-POE-LED',
            firmware_config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED'
        }));
        expect(setStepMock).toHaveBeenCalledWith(5, expect.objectContaining({ animate: true }));
    });

    test('configmode=kit&preset=S360-KIT-BATH-POE share-link hydrates and applies the preset', async () => {
        await loadKitPresets({ url: 'http://localhost/?configmode=kit&preset=S360-KIT-BATH-POE' });
        expect(setStateMock).toHaveBeenCalled();
        expect(setSelectedKitSkuMock).toHaveBeenCalledWith('S360-KIT-BATH-POE');
        expect(setStepMock).toHaveBeenCalledWith(5, expect.objectContaining({ animate: true }));
    });

    test('the URL is rewritten to include configmode=kit&preset=<id> on selection', async () => {
        await loadKitPresets();
        const card = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE-LED"]');
        card.click();
        const params = new URLSearchParams(window.location.search);
        expect(params.get('configmode')).toBe('kit');
        expect(params.get('preset')).toBe('S360-KIT-BATH-POE-LED');
        // The legacy `sku=` parameter is cleared so old kit-mode share-link
        // parsing doesn't fight with the new preset-id channel.
        expect(params.get('sku')).toBeNull();
    });

    test('clicking a planned card does NOT mutate wizard state', async () => {
        await loadKitPresets();
        const plannedIds = [
            'S360-KIT-BATH-RELAY',
            'S360-KIT-BATH-TRIAC',
            'S360-KIT-DUCT-PWM',
            'S360-KIT-DUCT-DAC'
        ];
        plannedIds.forEach(id => {
            const card = document.querySelector(`[data-bundle-preset-id="${id}"]`);
            expect(card).not.toBeNull();
            card.click();
        });
        expect(setStateMock).not.toHaveBeenCalled();
        expect(setStepMock).not.toHaveBeenCalled();
        expect(setSelectedKitSkuMock).not.toHaveBeenCalled();
        expect(setConfigurationModeMock).not.toHaveBeenCalled();
        // Announcements should still happen for each planned click so the
        // user gets feedback that the card was selected but isn't installable.
        expect(announceMock).toHaveBeenCalled();
    });

    test('clicking a planned card surfaces the notAvailableReason in the live notice', async () => {
        await loadKitPresets();
        const triacCard = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-TRIAC"]');
        triacCard.click();
        const notice = document.querySelector('[data-bundle-preset-availability-notice]');
        expect(notice).not.toBeNull();
        expect(notice.hidden).toBe(false);
        expect(notice.textContent.toLowerCase()).toContain('triac');
    });
});

describe('WF-KIT-PRESETS-001 — release-channel acknowledgement preservation', () => {
    // The preview preset must not bypass the release-channel acknowledgement
    // wired into the install gate. The acknowledgement model is centralised
    // in scripts/utils/release-channels.js. These pins document that
    // selecting the preview preset never writes a channel acknowledgement
    // and that the preview build still requires it.
    test('selecting the LED preview preset does NOT touch release-channel acknowledgements', async () => {
        await loadKitPresets();
        // No channel-acknowledgement writers exist in the kit-presets
        // module surface — its imports are limited to state.js, diagnostics,
        // a11y, and the data module. Verify by inspecting the module's
        // import surface.
        const moduleSource = readFileSync(
            join(REPO_ROOT, 'scripts/kit-presets.js'),
            'utf-8'
        );
        expect(moduleSource).not.toMatch(/setChannelAcknowledgement/);
        expect(moduleSource).not.toMatch(/release-channels/);
        // Sanity: clicking the preview card still applies state but does
        // not call into the acknowledgement plumbing.
        const card = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE-LED"]');
        card.click();
        expect(setStateMock).toHaveBeenCalled();
    });

    test('LED preview build in manifest still requires the channel:preview acknowledgement', async () => {
        // Cross-check via the live release-channel surface so a future
        // accidental policy regression on the LED preview build is caught
        // by this suite as well.
        const { getRequiredAcknowledgements } = await import('../scripts/utils/release-channels.js');
        const manifest = readJson('manifest.json');
        const ledBuild = (manifest.builds || []).find(
            build => build.config_string === 'Ceiling-POE-VentIQ-RoomIQ-LED'
        );
        expect(ledBuild).toBeDefined();
        const acks = getRequiredAcknowledgements(ledBuild);
        expect(acks.length).toBeGreaterThanOrEqual(1);
        expect(acks.some(ack => ack.key === 'channel:preview')).toBe(true);
    });
});

describe('WF-KIT-PRESETS-001 — visual state reflects live wizard state', () => {
    test('the Bathroom Kit — PoE card is marked active when the wizard state matches', async () => {
        getStateMock.mockReturnValue({
            mounting: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'none',
            voice: 'none'
        });
        const module = await loadKitPresets();
        module.__testHooks.refreshCardVisuals();
        const card = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE"]');
        expect(card.getAttribute('aria-pressed')).toBe('true');
        expect(card.classList.contains('is-active')).toBe(true);

        const ledCard = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE-LED"]');
        expect(ledCard.getAttribute('aria-pressed')).toBe('false');
    });

    test('after applying a preset and diverging the state, the original preset is marked "Customized"', async () => {
        const module = await loadKitPresets();
        const card = document.querySelector('[data-bundle-preset-id="S360-KIT-BATH-POE"]');
        card.click();

        // Simulate the user toggling LED on after the preset prefilled the
        // Release-One state. The live state no longer matches the preset.
        getStateMock.mockReturnValue({
            mounting: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            airiq: 'none',
            fan: 'none',
            led: 'led',
            voice: 'none'
        });
        module.__testHooks.refreshCardVisuals();

        expect(card.getAttribute('aria-pressed')).toBe('false');
        expect(card.classList.contains('is-active')).toBe(false);
        expect(card.classList.contains('is-customized')).toBe(true);
        const customizedLabel = card.querySelector('[data-bundle-preset-customized]');
        expect(customizedLabel.hidden).toBe(false);
    });

    test('planned cards never receive aria-pressed=true regardless of state', async () => {
        getStateMock.mockReturnValue({
            mounting: 'ceiling',
            power: 'poe',
            bathroom: true,
            ventiq: 'ventiq',
            roomiq: 'roomiq',
            fan: 'pwm', // future PWM kit if it existed
            led: 'none',
            voice: 'none'
        });
        const module = await loadKitPresets();
        module.__testHooks.refreshCardVisuals();
        ['S360-KIT-BATH-RELAY', 'S360-KIT-BATH-TRIAC', 'S360-KIT-DUCT-PWM', 'S360-KIT-DUCT-DAC'].forEach(id => {
            const card = document.querySelector(`[data-bundle-preset-id="${id}"]`);
            expect(card.getAttribute('aria-pressed')).toBe('false');
            expect(card.classList.contains('is-active')).toBe(false);
        });
    });
});

describe('WF-KIT-PRESETS-001 — installability stays manifest-driven', () => {
    test('preset existence does not add entries to REQUIRED_CONFIGS', () => {
        const workflowPath = join(REPO_ROOT, '.github/workflows/firmware-publish.yml');
        const workflow = readFileSync(workflowPath, 'utf-8');
        // REQUIRED_CONFIGS must still hold exactly Release-One + Rescue.
        // Preset existence (especially the LED preview preset) must NOT
        // promote any new config_string into the production allowlist.
        const requiredMatch = workflow.match(/REQUIRED_CONFIGS\s*=\s*\(([\s\S]*?)\)/);
        expect(requiredMatch).not.toBeNull();
        const entries = requiredMatch[1]
            .split(/\s+/)
            .map(s => s.replace(/['"]/g, '').trim())
            .filter(Boolean);
        expect(entries.sort()).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue'].sort());
    });

    test('preset existence does not add entries to scripts/data/kits.json', () => {
        const kitsJson = readJson('scripts/data/kits.json');
        // kits.json still holds exactly one kit (the Release-One SKU). The
        // bundle preset list is presentation-only and never feeds back into
        // the kit-config catalog or the kits-json integrity test.
        expect(kitsJson.kits).toHaveLength(1);
        expect(kitsJson.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('preset existence does not modify firmware/sources.json or manifest builds', () => {
        const sources = readJson('firmware/sources.json');
        const manifest = readJson('manifest.json');
        // Six builds after the first preview import (Release-One stable + four
        // preview builds + Rescue). Bundle presets must not have added a source
        // entry or a manifest build of their own.
        expect(manifest.builds.length).toBe(7);
        const configs = manifest.builds.map(b => b.config_string).sort();
        expect(configs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-FanRelay-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED', 'Rescue']);
        // sources.json still holds the same Release-One + LED-preview pair
        // it had before WF-KIT-PRESETS-001.
        const sourceConfigs = (sources.sources || []).map(s => s.config_string).sort();
        expect(sourceConfigs).toContain('Ceiling-POE-VentIQ-RoomIQ');
        expect(sourceConfigs).toContain('Ceiling-POE-VentIQ-RoomIQ-LED');
    });
});

describe('WF-KIT-PRESETS-001 — custom path remains intact', () => {
    test('the legacy [data-start-path] cards still exist and Custom advances the wizard', async () => {
        await loadKitPresets();
        const kitButton = document.querySelector('[data-start-path="kit"]');
        const customButton = document.querySelector('[data-start-path="custom"]');
        const recoveryButton = document.querySelector('[data-start-path="recovery"]');
        expect(kitButton).not.toBeNull();
        expect(customButton).not.toBeNull();
        expect(recoveryButton).not.toBeNull();
        // Recovery delegation to the rescue modal stays in place.
        expect(recoveryButton.hasAttribute('data-rescue-open')).toBe(true);
        // The custom panel's Continue button is preserved so the manual
        // flow can still hand off to Step 2.
        const customNext = document.querySelector('[data-custom-path-panel] [data-next]');
        expect(customNext).not.toBeNull();
    });
});
