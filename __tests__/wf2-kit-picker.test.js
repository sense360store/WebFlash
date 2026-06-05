/**
 * WF2 Step 1 — kit picker (master–detail browser) redesign.
 *
 * Pins the behavior of the redesigned Identify kit picker that replaced the
 * stacked KitHero cards with a compact, height-capped master list plus a sticky
 * detail panel. These tests drive the real view + engine through the DOM, the
 * same way wf2-identify.test.js does (real kits.json + manifest.json served via
 * a fetch stub). They lock:
 *   - the master/detail layout + "Showing X of Y kits" count;
 *   - live search over name / SKU with the empty state + Clear filters reset;
 *   - the All / Stable / Preview channel chips;
 *   - focus (which detail shows) being independent of selection (what Continue
 *     commits) in both directions;
 *   - refocus-to-first-visible when the focused kit is filtered out, while the
 *     committed selection stays put;
 *   - the search input node staying stable across keystrokes (caret preserved).
 *
 * The picker wires the real catalogue, so the assertions derive their expected
 * counts from kits.json rather than hardcoding them.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));

const KITS = kitsJson.kits;
const TOTAL = KITS.length;
const RECOMMENDED = KITS.find((k) => k.recommended);
const PREVIEW_KITS = KITS.filter((k) => k.firmware_channel === 'preview');
const STABLE_KITS = KITS.filter((k) => k.firmware_channel !== 'preview');
const KITCHEN = KITS.find((k) => k.sku === 'S360-KIT-KITCHEN-P');
const BEDROOM = KITS.find((k) => k.sku === 'S360-KIT-BEDROOM-P');
const VENTIQ_KITS = KITS.filter((k) => k.components.some((c) => c.sku === 'S360-211'));

function makeFetch() {
  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('kits.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(kitsJson) });
    }
    if (u.includes('manifest.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifestJson) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

const a11yStub = {
  announce: () => {},
  trapFocus: () => () => {},
  restoreFocus: () => {},
  getFocusableElements: () => [],
};

// The engine round-trips setState/getState through the legacy form inputs, so
// reproduce the minimal skeleton (mirrors wf2-identify.test.js).
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
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(search = '') {
  if (search) window.history.replaceState({}, '', '/' + search);
  const engine = (await import('../scripts/engine.js')).default;
  const app = await import('../scripts/app.js');
  return { engine, app };
}

async function mountPicker(search = '') {
  const { engine, app } = await boot(search);
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true });
  await flush();
  return { root, app };
}

// ----- DOM helpers -----
const rows = (root) => [...root.querySelectorAll('.kit-list .kitrow')];
const rowName = (row) => (row.querySelector('.kitrow__name').firstChild.textContent || '').trim();
const rowByName = (root, name) => rows(root).find((r) => rowName(r) === name) || null;
const focusedRow = (root) => root.querySelector('.kit-list .kitrow.is-focused');
const selectedRows = (root) => [...root.querySelectorAll('.kit-list .kitrow.is-selected')];
const detailName = (root) => root.querySelector('.kit-aside .kitdetail h2').textContent;
const countText = (root) => root.querySelector('.kit-count').textContent;
const searchInput = (root) => root.querySelector('.kit-search__input');
const chipByLabel = (root, label) => [...root.querySelectorAll('.kit-chips .kit-chip')].find((c) => c.textContent === label);
const continueBtn = (root) => root.querySelector('.stepnav .btn--lg');

function type(root, value) {
  const input = searchInput(root);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

describe('WF2 kit picker — master/detail layout', () => {
  it('renders the height-capped master list, sticky detail, and the result count', async () => {
    const { root } = await mountPicker();

    // Master/detail browser is present (not the old stacked hero cards).
    expect(root.querySelector('.kit-picker')).not.toBeNull();
    expect(root.querySelector('.kit-browser')).not.toBeNull();
    expect(root.querySelector('.kit-aside')).not.toBeNull();
    expect(root.querySelector('.kit-search__input')).not.toBeNull();
    expect(root.querySelector('.kit-chips')).not.toBeNull();
    expect(root.querySelector('.kit-hero')).toBeNull();

    // One row per catalogue kit, and the count reflects the real total.
    expect(rows(root)).toHaveLength(TOTAL);
    expect(countText(root)).toBe(`Showing ${TOTAL} of ${TOTAL} kits`);
  });

  it('focuses the recommended kit by default and commits nothing until selected', async () => {
    const { root } = await mountPicker();

    // Default focus is the recommended kit; its detail shows the recommended flag.
    expect(focusedRow(root)).toBe(rowByName(root, RECOMMENDED.display_name));
    expect(detailName(root)).toBe(RECOMMENDED.display_name);
    expect(root.querySelector('.kit-aside .flag').textContent).toBe('Recommended for you');
    expect(root.querySelector('.kit-aside .flag').classList.contains('flag--rec')).toBe(true);
    expect(rowByName(root, RECOMMENDED.display_name).querySelector('.kitrow__rec').textContent).toBe('Recommended');

    // Nothing committed yet → no selected row, Continue disabled, ghost button.
    expect(selectedRows(root)).toHaveLength(0);
    expect(continueBtn(root).disabled).toBe(true);
    expect(root.querySelector('.kit-aside .btn--block').textContent).toMatch(/Select this kit/);
  });
});

describe('WF2 kit picker — search', () => {
  it('live-filters by name, updates the count, and matches part SKUs', async () => {
    const { root } = await mountPicker();

    // Search by a unique kit name.
    type(root, 'bedroom');
    expect(rows(root)).toHaveLength(1);
    expect(rowName(rows(root)[0])).toBe(BEDROOM.display_name);
    expect(countText(root)).toBe(`Showing 1 of ${TOTAL} kits`);

    // Search by a board SKU — matches every kit that includes that part.
    type(root, 'S360-211');
    expect(rows(root)).toHaveLength(VENTIQ_KITS.length);
    expect(countText(root)).toBe(`Showing ${VENTIQ_KITS.length} of ${TOTAL} kits`);
  });

  it('shows the empty state and Clear filters resets query + channel', async () => {
    const { root } = await mountPicker();

    chipByLabel(root, 'Preview').click();
    type(root, 'zzz-nothing-matches');
    expect(rows(root)).toHaveLength(0);
    const empty = root.querySelector('.kit-empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/No kits match/);

    empty.querySelector('.linkbtn').click();
    // Query and channel both reset → full catalogue, All chip active again.
    expect(searchInput(root).value).toBe('');
    expect(rows(root)).toHaveLength(TOTAL);
    expect(countText(root)).toBe(`Showing ${TOTAL} of ${TOTAL} kits`);
    expect(chipByLabel(root, 'All kits').classList.contains('is-on')).toBe(true);
  });

  it('toggles the clear (×) button with the query and keeps the input node stable', async () => {
    const { root } = await mountPicker();
    const before = searchInput(root);

    expect(root.querySelector('.kit-search__clear').hidden).toBe(true);
    type(root, 'ba');
    type(root, 'bath');
    // The input element is never rebuilt by the targeted re-render (caret kept).
    expect(searchInput(root)).toBe(before);
    expect(root.querySelector('.kit-search__clear').hidden).toBe(false);

    root.querySelector('.kit-search__clear').click();
    expect(before.value).toBe('');
    expect(root.querySelector('.kit-search__clear').hidden).toBe(true);
    expect(rows(root)).toHaveLength(TOTAL);
  });
});

describe('WF2 kit picker — channel filter chips', () => {
  it('filters by channel and reflects the active chip', async () => {
    const { root } = await mountPicker();

    chipByLabel(root, 'Stable').click();
    expect(rows(root)).toHaveLength(STABLE_KITS.length);
    expect(rowName(rows(root)[0])).toBe(RECOMMENDED.display_name);
    expect(chipByLabel(root, 'Stable').classList.contains('is-on')).toBe(true);
    expect(chipByLabel(root, 'Stable').getAttribute('aria-pressed')).toBe('true');
    expect(chipByLabel(root, 'All kits').getAttribute('aria-pressed')).toBe('false');

    chipByLabel(root, 'Preview').click();
    expect(rows(root)).toHaveLength(PREVIEW_KITS.length);
    // A preview kit's detail carries the amber preview flag.
    expect(root.querySelector('.kit-aside .flag').classList.contains('flag--preview')).toBe(true);

    chipByLabel(root, 'All kits').click();
    expect(rows(root)).toHaveLength(TOTAL);
  });
});

describe('WF2 kit picker — focus is independent of selection', () => {
  it('clicking a row focuses it without committing; the detail button commits', async () => {
    const { root } = await mountPicker();

    // Focus a non-recommended row: detail updates, but nothing is committed yet.
    rowByName(root, KITCHEN.display_name).click();
    expect(focusedRow(root)).toBe(rowByName(root, KITCHEN.display_name));
    expect(detailName(root)).toBe(KITCHEN.display_name);
    expect(selectedRows(root)).toHaveLength(0);
    expect(continueBtn(root).disabled).toBe(true);

    // Commit via the detail button → the focused kit becomes the selection.
    root.querySelector('.kit-aside .btn--block').click();
    await flush();
    expect(rowByName(root, KITCHEN.display_name).classList.contains('is-selected')).toBe(true);
    expect(rowByName(root, KITCHEN.display_name).querySelector('.kitrow__check')).not.toBeNull();
    expect(root.querySelector('.kit-aside .btn--block').textContent).toMatch(/Selected/);
    expect(continueBtn(root).disabled).toBe(false);
    expect(continueBtn(root).textContent).toMatch(/Continue with Kitchen Bundle/);
  });

  it('a committed kit stays selected while the user focuses other rows', async () => {
    const { root } = await mountPicker();

    rowByName(root, KITCHEN.display_name).click();
    root.querySelector('.kit-aside .btn--block').click();
    await flush();

    // Now focus a different row. Selection (Kitchen) must persist while focus moves.
    rowByName(root, BEDROOM.display_name).click();
    expect(focusedRow(root)).toBe(rowByName(root, BEDROOM.display_name));
    expect(detailName(root)).toBe(BEDROOM.display_name);
    expect(root.querySelector('.kit-aside .btn--block').textContent).toMatch(/Select this kit/);

    // Kitchen is selected-but-not-focused; Bedroom is focused-but-not-selected.
    expect(selectedRows(root)).toHaveLength(1);
    expect(rowName(selectedRows(root)[0])).toBe(KITCHEN.display_name);
    expect(rowByName(root, BEDROOM.display_name).classList.contains('is-selected')).toBe(false);
    // Continue still reflects the committed kit, not the focused one.
    expect(continueBtn(root).textContent).toMatch(/Continue with Kitchen Bundle/);
  });
});

describe('WF2 kit picker — refocus when the focused kit is filtered out', () => {
  it('refocuses the first visible result while keeping the committed selection', async () => {
    const { root } = await mountPicker();

    // Commit the recommended kit, leaving it focused.
    root.querySelector('.kit-aside .btn--block').click();
    await flush();
    expect(rowName(selectedRows(root)[0])).toBe(RECOMMENDED.display_name);

    // Search to something that excludes the focused+committed recommended kit.
    type(root, 'bedroom');
    // Detail refocuses to the first (only) visible result…
    expect(rows(root)).toHaveLength(1);
    expect(detailName(root)).toBe(BEDROOM.display_name);
    expect(focusedRow(root)).toBe(rowByName(root, BEDROOM.display_name));
    // …but the committed selection is unchanged (Continue still names it).
    expect(continueBtn(root).disabled).toBe(false);
    expect(continueBtn(root).textContent).toMatch(/Continue with Bathroom Bundle/);

    // Clearing the search brings the committed kit back, still selected.
    type(root, '');
    expect(rowByName(root, RECOMMENDED.display_name).classList.contains('is-selected')).toBe(true);
  });
});
