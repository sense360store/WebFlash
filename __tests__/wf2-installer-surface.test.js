/**
 * Installer surface polish (ci/installer-surface).
 *
 * The Identify / Install / Connect flow surfaced only part of the manifest. The
 * Browse-table sticky-header clip is already fixed on main (overflow:clip plus the
 * --winbar-h / --ktable-head-h scroll-margin, pinned by ktable-overflow-clip.test.js
 * and ktable-sticky-offset.test.js). This file pins the two surfaces this PR adds:
 *
 *   1. Version in the Browse table (scripts/identify.js + scripts/app.js). Each kit
 *      row shows the firmware version read live from the manifest build whose
 *      config_string matches the kit, never hardcoded, and renders an empty cell
 *      (never a crash) when no build matches.
 *   2. Release notes on the Install step (scripts/install.js). The resolved build's
 *      changelog, known issues, and key features are surfaced in a disclosure, with
 *      the existing channel notes-fallback copy when a build ships no notes.
 *
 * Both drive the real view + engine through the DOM, serving the real on-disk
 * kits.json + manifest.json via a fetch stub and deriving expected versions from
 * the manifest rather than hardcoding them.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));
const RELEASE_ONE = kitsJson.kits.find((k) => k.recommended) || kitsJson.kits[0];
// No preview kit card survives the WF-H1-REIMPORT-CLEAN-001 W1 delisting;
// the Bedroom stable bundle is the second live row.
const SECOND_KIT = kitsJson.kits.find((k) => k.sku === 'S360-KIT-BEDROOM-P');

// Expected firmware version for a config_string, derived from the real manifest
// the way the engine resolves it (a stable build wins, else the first match).
// Every catalogue kit currently maps to exactly one build, so this is exact.
function manifestVersionFor(configString) {
  const matches = manifestJson.builds.filter((b) => b && b.config_string === configString);
  if (matches.length === 0) return '';
  const pick = matches.find((b) => b.channel === 'stable') || matches[0];
  return pick && pick.version ? String(pick.version) : '';
}

// ---------------------------------------------------------------------------
// The net-new styles ship with the markup they back (jsdom has no layout, so
// this only guards that the version-cell + release-notes CSS is present).
// ---------------------------------------------------------------------------
describe('Installer-surface styles (app.css)', () => {
  const css = readFileSync(join(ROOT, 'app.css'), 'utf8');

  it('ships the Browse version-cell and the Install release-notes styles', () => {
    expect(css).toContain('.kt-ver-tag {');
    expect(css).toContain('.relnotes__body {');
  });
});

// ---------------------------------------------------------------------------
// Shared app + engine harness for fixes 2 and 3 (mirrors wf2-kit-picker.test.js).
// ---------------------------------------------------------------------------
const a11yStub = {
  announce: () => {},
  trapFocus: () => () => {},
  restoreFocus: () => {},
  getFocusableElements: () => [],
};

function makeFetch(kitsOverride) {
  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('kits.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsOverride || kitsJson) });
    }
    if (u.includes('manifest.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifestJson) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

// The engine round-trips setState/getState through the legacy form inputs.
function renderLegacyForm() {
  const radio = (name, value) => `<input type="radio" name="${name}" value="${value}">`;
  document.body.innerHTML = `
    <form>
      ${radio('mounting', 'ceiling')}
      ${radio('power', 'usb')}${radio('power', 'poe')}${radio('power', 'pwr')}
      ${radio('airiq', 'none')}${radio('airiq', 'airiq')}
      ${radio('ventiq', 'none')}${radio('ventiq', 'ventiq')}
      ${radio('roomiq', 'none')}${radio('roomiq', 'roomiq')}
      ${radio('fan', 'none')}${radio('fan', 'relay')}${radio('fan', 'pwm')}${radio('fan', 'analog')}${radio('fan', 'triac')}
      ${radio('voice', 'none')}
      ${radio('led', 'none')}${radio('led', 'led')}
      <input type="checkbox" name="bathroom">
    </form>`;
}

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(search, kitsOverride) {
  if (search) window.history.replaceState({}, '', '/' + search);
  global.fetch = makeFetch(kitsOverride);
  const engine = (await import('../scripts/engine.js')).default;
  const app = await import('../scripts/app.js');
  return { engine, app };
}

// A kit deep link (?configmode=kit&sku=...) opens straight into the Browse table.
async function mountBrowse(kitsOverride) {
  const { engine, app } = await boot(`?configmode=kit&sku=${RELEASE_ONE.sku}`, kitsOverride);
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true });
  await flush();
  return { root, app };
}

const rows = (root) => [...root.querySelectorAll('.ktable__body .ktable__row')];
const rowName = (row) => (row.querySelector('.kt-name').firstChild.textContent || '').trim();
const rowByName = (root, name) => rows(root).find((r) => rowName(r) === name) || null;

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

// ---------------------------------------------------------------------------
// Fix 2 — version in the Browse table.
// ---------------------------------------------------------------------------
describe('Version in the Browse table (scripts/identify.js)', () => {
  it('adds a Version column header between Channel and Parts', async () => {
    const { root } = await mountBrowse();
    const heads = [...root.querySelectorAll('.ktable thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Preset', 'Channel', 'Version', 'Parts', 'Boards', 'Firmware target']);
  });

  it('shows each kit row its manifest version (read live, not hardcoded)', async () => {
    const { root } = await mountBrowse();

    const recExpected = manifestVersionFor(RELEASE_ONE.firmware_config_string);
    expect(recExpected).not.toBe('');
    expect(rowByName(root, RELEASE_ONE.display_name).querySelector('.kt-ver-tag').textContent)
      .toBe('v' + recExpected);

    const secondExpected = manifestVersionFor(SECOND_KIT.firmware_config_string);
    expect(secondExpected).not.toBe('');
    expect(rowByName(root, SECOND_KIT.display_name).querySelector('.kt-ver-tag').textContent)
      .toBe('v' + secondExpected);
  });

  it('every rendered version matches the manifest build for that kit', async () => {
    const { root } = await mountBrowse();
    rows(root).forEach((row) => {
      const kit = kitsJson.kits.find((k) => (k.display_name || k.sku) === rowName(row));
      const tag = row.querySelector('.kt-ver-tag');
      const expected = manifestVersionFor(kit.firmware_config_string);
      if (expected) {
        expect(tag.textContent).toBe('v' + expected);
      } else {
        expect(tag).toBeNull();
      }
    });
  });

  it('exposes the resolved versions on the app state, keyed by config_string', async () => {
    const { app } = await mountBrowse();
    const map = app.__testHooks.getState().kitVersions;
    expect(map instanceof Map).toBe(true);
    expect(map.get(RELEASE_ONE.firmware_config_string)).toBe(manifestVersionFor(RELEASE_ONE.firmware_config_string));
  });

  it('renders an empty version cell (no crash) for a kit with no matching build', async () => {
    const noBuildKit = {
      sku: 'S360-KIT-TEST-NOBUILD',
      display_name: 'Test Bundle — No Build',
      description: 'Synthetic kit whose config has no manifest build.',
      recommended: false,
      sample: false,
      wizard_state: {
        mount: 'ceiling', power: 'usb', bathroom: true,
        airiq: 'none', ventiq: 'ventiq', roomiq: 'roomiq', fan: 'none', led: 'none', voice: 'none',
      },
      components: [{ sku: 'S360-100', label: 'Sense360 Core' }],
      headers_required: [],
      // A real config shape that ships no build (USB power has no published build).
      firmware_config_string: 'Ceiling-USB-VentIQ-RoomIQ',
      firmware_channel: 'stable',
      notes: [],
      known_limitations: [],
    };
    const { root } = await mountBrowse({ schema_version: 1, kits: [RELEASE_ONE, noBuildKit] });

    // The table renders both rows; the missing version does not throw.
    expect(rows(root)).toHaveLength(2);
    const noBuildRow = rowByName(root, noBuildKit.display_name);
    expect(noBuildRow).not.toBeNull();
    expect(noBuildRow.querySelector('.kt-ver').textContent).toBe('');
    expect(noBuildRow.querySelector('.kt-ver-tag')).toBeNull();
    // The real kit alongside it still shows its version.
    expect(rowByName(root, RELEASE_ONE.display_name).querySelector('.kt-ver-tag').textContent)
      .toBe('v' + manifestVersionFor(RELEASE_ONE.firmware_config_string));
  });
});

// ---------------------------------------------------------------------------
// Fix 3 — release notes on the Install step.
// ---------------------------------------------------------------------------
describe('Release notes on the Install step (scripts/install.js)', () => {
  it('renders changelog, known issues, and key features from the build arrays', async () => {
    const { buildReleaseNotesSection } = await import('../scripts/install.js');
    const el = buildReleaseNotesSection({
      version: '1.2.3', channel: 'preview',
      changelog: ['Added the thing'],
      known_issues: ['A known bug'],
      features: ['Does the feature'],
      hardware_requirements: ['Needs a board'],
    });
    expect(el).not.toBeNull();
    expect(el.getAttribute('data-release-notes')).toBe('');
    const text = el.textContent;
    expect(text).toContain('Changelog');
    expect(text).toContain('Added the thing');
    expect(text).toContain('Known issues');
    expect(text).toContain('A known bug');
    expect(text).toContain('Key features');
    expect(text).toContain('Does the feature');
    // Hardware requirements (verbose build provenance) stay out of the notes.
    expect(text).not.toContain('Needs a board');
  });

  it('falls back to the existing "no release notes" copy when a build ships none', async () => {
    const { buildReleaseNotesSection, RELEASE_NOTES_FALLBACK } = await import('../scripts/install.js');
    const el = buildReleaseNotesSection({
      version: '1.0.0', channel: 'stable', changelog: [], known_issues: [], features: [],
    });
    expect(el.querySelector('.relnotes__empty').textContent).toBe(RELEASE_NOTES_FALLBACK);
    expect(RELEASE_NOTES_FALLBACK).toMatch(/no release notes available/i);
  });

  it('prefers the engine per-channel notes fallback when the engine is supplied', async () => {
    const { buildReleaseNotesSection } = await import('../scripts/install.js');
    const engineStub = {
      channels: {
        getChannelPolicy: () => ({ notesFallback: 'Preview release notes are not yet available for this firmware version.' }),
      },
    };
    const el = buildReleaseNotesSection(
      { version: '1.0.0', channel: 'preview', changelog: [], known_issues: [], features: [] },
      engineStub,
    );
    expect(el.querySelector('.relnotes__empty').textContent)
      .toMatch(/Preview release notes are not yet available/);
  });

  it('returns null when there is no resolved build', async () => {
    const { buildReleaseNotesSection } = await import('../scripts/install.js');
    expect(buildReleaseNotesSection(null)).toBeNull();
    expect(buildReleaseNotesSection(undefined)).toBeNull();
  });

  it('surfaces the selected firmware notes (and keeps the version) when the Install step mounts', async () => {
    const engine = (await import('../scripts/engine.js')).default;
    const { InstallStep } = await import('../scripts/install.js');
    const resolved = await engine.state.resolveCompatibleFirmware({
      mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq',
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.appendChild(InstallStep({
      device: { name: 'Test device', target: resolved.configString },
      build: resolved.build,
      engine,
      a11y: a11yStub,
      onBack: () => {},
      onFlashed: () => {},
    }));
    await flush();

    // The version still renders (the existing devsum surface is untouched).
    expect(root.querySelector('[data-firmware-version]')).not.toBeNull();

    // The release notes are reachable for the selected build.
    const notes = root.querySelector('[data-release-notes]');
    expect(notes).not.toBeNull();
    expect(notes.textContent).toContain('Release notes');
    // The stable Release-One build ships a changelog + known issues in the manifest.
    expect(notes.textContent).toContain('Changelog');
    expect(notes.textContent).toContain('Known issues');
  });
});
