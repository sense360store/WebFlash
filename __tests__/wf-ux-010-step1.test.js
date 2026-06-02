/**
 * WF-UX-010 — Simplify Step 1 available-kit selection for normal users.
 *
 * Step 1 still carried several competing concepts (available bundles, preview
 * bundle, planned kits, "I bought a kit", advanced setup, recovery, SKU
 * search). WF-UX-010 reworks the *presentation* so a normal customer
 * immediately sees the safe primary path — "the Sense360 Bathroom PoE kit,
 * install stable firmware" — while preserving the preview path, the planned
 * kits, advanced setup, recovery, the SKU search fallback, and every install
 * gate.
 *
 * This is a presentation-only change. These pins lock:
 *   - the stable kit is the single dominant primary card and precedes the
 *     preview / planned / advanced options in DOM order,
 *   - the LED kit stays a clearly-marked, visually secondary preview,
 *   - planned (fan-control) kits stay collapsed behind the disclosure,
 *   - Advanced setup and Recovery survive but are visually secondary,
 *   - the SKU search survives as a fallback (not the first task),
 *   - no firmware / manifest / source / config surface changed,
 *   - LED stays preview-only and every fan variant stays non-installable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, beforeAll, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const HTML_PATH = path.resolve(REPO_ROOT, 'index.html');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf-8'));
}

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

beforeAll(() => {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    document.documentElement.innerHTML = html
        .replace(/^[\s\S]*?<body[^>]*>/i, '')
        .replace(/<\/body>[\s\S]*$/i, '');
});

describe('WF-UX-010 — the stable kit is the dominant primary card', () => {
    test('exactly one bundle card is the dominant primary, and it is the stable Bathroom PoE kit', () => {
        const primaries = document.querySelectorAll('.bundle-preset-card--primary');
        expect(primaries.length).toBe(1);
        const primary = primaries[0];
        expect(primary.getAttribute('data-bundle-preset-id')).toBe('S360-KIT-BATH-POE');
        expect(primary.getAttribute('data-bundle-preset-status')).toBe('stable');
        expect(primary.getAttribute('data-bundle-preset-channel')).toBe('stable');
    });

    test('the primary card leads with product name, then "Stable", then SKU/config detail', () => {
        const primary = document.querySelector('.bundle-preset-card--primary');

        // Product name first.
        const title = primary.querySelector('.bundle-preset-card__title');
        expect(title).not.toBeNull();
        expect(title.textContent).toMatch(/Sense360 Bathroom PoE Kit/i);

        // "Stable" second (channel sub-line), above the technical detail.
        const channel = primary.querySelector('.bundle-preset-card__channel');
        expect(channel).not.toBeNull();
        expect(channel.textContent).toMatch(/stable/i);

        // Technical SKU/config detail stays in the tertiary meta line.
        const meta = primary.querySelector('.bundle-preset-card__meta');
        expect(meta).not.toBeNull();
        expect(meta.textContent).toMatch(/S360-KIT-BATH-POE/);

        // The channel line comes before the meta line in DOM order.
        expect(channel.compareDocumentPosition(meta) & FOLLOWING).toBeTruthy();

        // The dominant card carries an explicit install affordance.
        const cta = primary.querySelector('.bundle-preset-card__cta');
        expect(cta).not.toBeNull();
        expect(cta.textContent).toMatch(/install stable firmware/i);
    });

    test('the available bundles are stacked so the primary dominates the layout', () => {
        const grid = document.querySelector('[data-bundle-presets-grid="available"]');
        expect(grid).not.toBeNull();
        expect(grid.classList.contains('bundle-presets__grid--stacked')).toBe(true);
    });
});

describe('WF-UX-010 — primary precedes preview / planned / advanced in DOM order', () => {
    test('stable primary appears before the preview card, the planned kits, and Advanced setup', () => {
        const step1 = document.getElementById('step-1');
        const primary = step1.querySelector('.bundle-preset-card--primary');
        const preview = step1.querySelector('.bundle-preset-card--preview');
        const firstPlanned = step1.querySelector(
            '[data-bundle-presets-grid="planned"] [data-bundle-preset-id]'
        );
        const advanced = step1.querySelector('[data-start-path="custom"]');

        expect(primary).not.toBeNull();
        expect(preview).not.toBeNull();
        expect(firstPlanned).not.toBeNull();
        expect(advanced).not.toBeNull();

        expect(primary.compareDocumentPosition(preview) & FOLLOWING).toBeTruthy();
        expect(preview.compareDocumentPosition(firstPlanned) & FOLLOWING).toBeTruthy();
        expect(firstPlanned.compareDocumentPosition(advanced) & FOLLOWING).toBeTruthy();
    });
});

describe('WF-UX-010 — LED stays a clearly-marked, visually secondary preview', () => {
    test('the LED kit is the secondary preview card and is never promoted to primary', () => {
        const preview = document.querySelector('.bundle-preset-card--preview');
        expect(preview).not.toBeNull();
        expect(preview.getAttribute('data-bundle-preset-id')).toBe('S360-KIT-BATH-POE-LED');
        expect(preview.getAttribute('data-bundle-preset-status')).toBe('preview');
        expect(preview.getAttribute('data-bundle-preset-channel')).toBe('preview');
        // Visually secondary, never the dominant primary card.
        expect(preview.classList.contains('bundle-preset-card--secondary')).toBe(true);
        expect(preview.classList.contains('bundle-preset-card--primary')).toBe(false);
    });

    test('the LED card is clearly marked Preview and names the acknowledgement', () => {
        const preview = document.querySelector('.bundle-preset-card--preview');
        const badge = preview.querySelector('[data-bundle-preset-badge]');
        expect(badge).not.toBeNull();
        expect(badge.textContent.trim()).toBe('Preview');
        const channel = preview.querySelector('.bundle-preset-card__channel');
        expect(channel).not.toBeNull();
        expect(channel.textContent).toMatch(/preview/i);
        expect(preview.textContent).toMatch(/acknowledge/i);
    });
});

describe('WF-UX-010 — planned kits stay collapsed behind a disclosure', () => {
    test('the planned kits live in a <details> that is collapsed by default', () => {
        const planned = document.querySelector('[data-bundle-presets-planned]');
        expect(planned).not.toBeNull();
        expect(planned.tagName.toLowerCase()).toBe('details');
        // Collapsed by default — not the first thing a normal customer sees.
        expect(planned.hasAttribute('open')).toBe(false);
    });

    test('the disclosure reads "Coming soon / not installable yet"', () => {
        const planned = document.querySelector('[data-bundle-presets-planned]');
        const summary = planned.querySelector('summary');
        expect(summary).not.toBeNull();
        expect(summary.textContent).toMatch(/coming soon|not installable yet/i);
    });

    test('all four fan-control kits stay inside the collapsed disclosure', () => {
        const planned = document.querySelector('[data-bundle-presets-planned]');
        const plannedCards = planned.querySelectorAll('[data-bundle-preset-id]');
        const ids = Array.from(plannedCards).map(c => c.getAttribute('data-bundle-preset-id')).sort();
        expect(ids).toEqual([
            'S360-KIT-BATH-RELAY',
            'S360-KIT-BATH-TRIAC',
            'S360-KIT-DUCT-DAC',
            'S360-KIT-DUCT-PWM'
        ]);
    });
});

describe('WF-UX-010 — Advanced setup and Recovery survive but are secondary', () => {
    test('Step 1 still exposes exactly the three kit/custom/recovery paths', () => {
        const step1 = document.getElementById('step-1');
        const buttons = step1.querySelectorAll('[data-start-path]');
        const paths = Array.from(buttons).map(b => b.getAttribute('data-start-path'));
        expect(paths).toEqual(['kit', 'custom', 'recovery']);
    });

    test('Advanced setup still exists and is visually quiet, not equal weight to the kit card', () => {
        const advanced = document.querySelector('[data-start-path="custom"]');
        expect(advanced).not.toBeNull();
        expect(advanced.textContent).toMatch(/Advanced setup/);
        expect(advanced.classList.contains('start-path-card--quiet')).toBe(true);
        expect(advanced.classList.contains('bundle-preset-card--primary')).toBe(false);
    });

    test('Recovery still exists, is visually quiet, and keeps the rescue-modal delegation', () => {
        const recovery = document.querySelector('[data-start-path="recovery"]');
        expect(recovery).not.toBeNull();
        expect(recovery.textContent).toMatch(/Recovery/);
        expect(recovery.classList.contains('start-path-card--quiet')).toBe(true);
        // Rescue logic is untouched — the card still delegates to the existing
        // rescue modal handler.
        expect(recovery.hasAttribute('data-rescue-open')).toBe(true);
        expect(recovery.getAttribute('aria-haspopup')).toBe('dialog');
    });

    test('the path group is framed as a secondary "other ways to start" surface', () => {
        const group = document.querySelector('[data-start-paths]');
        expect(group).not.toBeNull();
        expect(group.classList.contains('start-paths--secondary')).toBe(true);
        const heading = document.getElementById('start-paths-heading');
        expect(heading).not.toBeNull();
        expect(heading.textContent).toMatch(/other ways to start/i);
        // The secondary paths come after the dominant primary kit card.
        const primary = document.querySelector('.bundle-preset-card--primary');
        expect(primary.compareDocumentPosition(group) & FOLLOWING).toBeTruthy();
    });
});

describe('WF-UX-010 — SKU search stays a fallback, not the first cognitive task', () => {
    test('the SKU search lives inside the kit panel, hidden until the kit path is chosen', () => {
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        expect(kitPanel).not.toBeNull();
        // Hidden by default — revealed only after the customer picks the kit path.
        expect(kitPanel.hasAttribute('hidden')).toBe(true);
        const search = kitPanel.querySelector('[data-kit-select-search]');
        expect(search).not.toBeNull();
    });

    test('the dominant stable kit card precedes the SKU search panel', () => {
        const primary = document.querySelector('.bundle-preset-card--primary');
        const kitPanel = document.querySelector('[data-kit-mode-panel]');
        expect(primary.compareDocumentPosition(kitPanel) & FOLLOWING).toBeTruthy();
    });
});

describe('WF-UX-010 — presentation-only: install / firmware surfaces unchanged', () => {
    test('manifest carries Release-One stable + four preview builds + Rescue', () => {
        const manifest = readJson('manifest.json');
        expect(manifest.builds.length).toBe(6);
        const configs = manifest.builds.map(b => b.config_string).sort();
        expect(configs).toEqual([
            'Ceiling-POE-AirIQ-RoomIQ',
            'Ceiling-POE-RoomIQ',
            'Ceiling-POE-RoomIQ-LED',
            'Ceiling-POE-VentIQ-RoomIQ',
            'Ceiling-POE-VentIQ-RoomIQ-LED',
            'Rescue'
        ]);
    });

    test('REQUIRED_CONFIGS stays production-only (Release-One + Rescue)', () => {
        const workflow = fs.readFileSync(
            path.resolve(REPO_ROOT, '.github/workflows/firmware-publish.yml'),
            'utf-8'
        );
        const block = workflow.match(/REQUIRED_CONFIGS=\(([\s\S]*?)\)/);
        expect(block).not.toBeNull();
        const entries = (block[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
        expect(entries).toEqual(['Ceiling-POE-VentIQ-RoomIQ', 'Rescue']);
    });

    test('scripts/data/kits.json stays Release-One-only', () => {
        const kits = readJson('scripts/data/kits.json');
        expect(kits.kits).toHaveLength(1);
        expect(kits.kits[0].firmware_config_string).toBe('Ceiling-POE-VentIQ-RoomIQ');
    });

    test('firmware/sources.json declares Release-One + four preview sources, no fan driver', () => {
        const sources = readJson('firmware/sources.json');
        const cfgs = (sources.sources || []).map(s => s.config_string).sort();
        expect(cfgs).toEqual(['Ceiling-POE-AirIQ-RoomIQ', 'Ceiling-POE-RoomIQ', 'Ceiling-POE-RoomIQ-LED', 'Ceiling-POE-VentIQ-RoomIQ', 'Ceiling-POE-VentIQ-RoomIQ-LED']);
        for (const entry of sources.sources || []) {
            ['FanRelay', 'FanPWM', 'FanDAC', 'FanTRIAC'].forEach(token => {
                expect(entry.config_string || '').not.toContain(token);
                expect(entry.asset_name || '').not.toContain(token);
            });
        }
    });
});

describe('WF-UX-010 — LED stays preview-only; fan variants stay non-installable', () => {
    test('the LED bundle preset is preview, gated on acknowledgement, and the build is preview-channel', async () => {
        const { findKitPresetById, isPresetAvailable } = await import('../scripts/data/kit-presets.js');
        const led = findKitPresetById('S360-KIT-BATH-POE-LED');
        expect(led).not.toBeNull();
        expect(led.status).toBe('preview');
        expect(led.channel).toBe('preview');
        expect(led.requiresPreviewAcknowledgement).toBe(true);
        expect(isPresetAvailable(led)).toBe(true);

        const manifest = readJson('manifest.json');
        const ledBuild = manifest.builds.find(b => b.config_string === 'Ceiling-POE-VentIQ-RoomIQ-LED');
        expect(ledBuild).toBeDefined();
        expect(ledBuild.channel).toBe('preview');
    });

    test('the LED build still requires the channel:preview acknowledgement', async () => {
        const { getRequiredAcknowledgements } = await import('../scripts/utils/release-channels.js');
        const manifest = readJson('manifest.json');
        const ledBuild = manifest.builds.find(b => b.config_string === 'Ceiling-POE-VentIQ-RoomIQ-LED');
        const acks = getRequiredAcknowledgements(ledBuild);
        expect(acks.some(a => a.key === 'channel:preview')).toBe(true);
    });

    test('every fan-control kit (Relay / TRIAC / PWM / DAC) stays planned and non-installable', async () => {
        const { KIT_PRESETS, isPresetAvailable } = await import('../scripts/data/kit-presets.js');
        const fanKits = KIT_PRESETS.filter(p => /RELAY|TRIAC|PWM|DAC/.test(p.id));
        expect(fanKits.map(p => p.id).sort()).toEqual([
            'S360-KIT-BATH-RELAY',
            'S360-KIT-BATH-TRIAC',
            'S360-KIT-DUCT-DAC',
            'S360-KIT-DUCT-PWM'
        ]);
        fanKits.forEach(preset => {
            expect(preset.status).toBe('planned');
            expect(preset.firmwareConfigString).toBeNull();
            expect(preset.wizardState).toBeNull();
            expect(isPresetAvailable(preset)).toBe(false);
        });
    });

    test('the installable (available) grid advertises no fan-driver SKU', () => {
        const available = document.querySelector('[data-bundle-presets-grid="available"]');
        expect(available).not.toBeNull();
        const skus = Array.from(available.querySelectorAll('.bundle-preset-card__component-sku'))
            .map(s => s.textContent.trim());
        // Fan-driver SKUs (Relay/PWM/DAC/TRIAC) must never appear in the
        // installable bundle cards — only Core / RoomIQ / VentIQ / LED / PoE PSU.
        ['S360-310', 'S360-311', 'S360-312', 'S360-320'].forEach(sku => {
            expect(skus).not.toContain(sku);
        });
    });
});
