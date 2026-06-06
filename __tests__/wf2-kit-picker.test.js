/**
 * WF2 Step 1 — Identify recommendation-first redesign (WF2-IDENTIFY-RECO).
 *
 * Pins the behaviour of the redesigned Identify step that supersedes the #502
 * master-detail picker: a recommendation-first landing (RecommendView) that
 * leads with the catalogue's recommended kit and a one-click "Install this kit",
 * plus a dense Browse table (BrowseView) for everyone else. These tests drive
 * the real view + engine through the DOM (real kits.json + manifest.json served
 * via a fetch stub), the same way wf2-identify.test.js does. They lock:
 *   - the recommendation landing leading with the recommended kit, committed by
 *     default, with the one-click install armed once it resolves;
 *   - the Browse table: one row per kit, the "N of M" count, the Rec badge,
 *     channel pills, board SKUs, and the firmware target;
 *   - live search over name / SKU / target with the empty state + Clear filters;
 *   - the All / Stable / Preview channel chips;
 *   - row click committing the selection (footer summary + Continue update);
 *   - the recommend <-> browse navigation and the "Your selection" reframing;
 *   - TRIAC fail-closed: no TRIAC card appears in the table.
 *
 * The view wires the real catalogue, so the assertions derive their expected
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

async function mountStep(search = '') {
  const { engine, app } = await boot(search);
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true });
  await flush();
  return { root, app };
}

// ----- DOM helpers -----
const recommendBody = (root) => root.querySelector('.B');
const browseBody = (root) => root.querySelector('.C');
const recName = (root) => root.querySelector('.B__recbody h2').textContent;
const recFlag = (root) => root.querySelector('.B__rec .flag');
const installBtn = (root) => root.querySelector('.B__cta .btn--lg');
const seeDetailsBtn = (root) => root.querySelector('.B__cta .btn--ghost');
const moreLink = (root) => root.querySelector('.B__more .linkbtn');
const miniKits = (root) => [...root.querySelectorAll('.minikit')];

const tableRows = (root) => [...root.querySelectorAll('.ktable tbody tr')].filter((r) => !r.querySelector('.ktable__empty'));
const rowByName = (root, name) => tableRows(root).find((r) => r.querySelector('.kt__name').textContent.includes(name)) || null;
const selectedRow = (root) => root.querySelector('.ktable tbody tr.is-sel');
const countText = (root) => root.querySelector('.C__count').textContent;
const searchInput = (root) => root.querySelector('.kit-search__input');
const chipByLabel = (root, label) => [...root.querySelectorAll('.chips .chip')].find((c) => c.textContent === label);
const backLink = (root) => root.querySelector('.C__bar .backlink');
const footer = (root) => root.querySelector('.winfoot');
const footerContinue = (root) => root.querySelector('.winfoot .btn');
const footerSel = (root) => root.querySelector('.winfoot .winfoot__sel');

function type(root, value) {
  const input = searchInput(root);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function gotoBrowse(root) {
  seeDetailsBtn(root).click();
  await flush();
}

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  global.fetch = makeFetch();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

describe('WF2-IDENTIFY-RECO — recommendation landing', () => {
  it('leads with the recommended kit, committed by default, install armed once resolved', async () => {
    const { root } = await mountStep();

    // The recommendation landing is shown (not the old master-detail picker).
    expect(recommendBody(root)).not.toBeNull();
    expect(browseBody(root)).toBeNull();
    expect(root.querySelector('.kit-picker')).toBeNull();

    // Recommended kit leads, with the teal Recommended flag.
    expect(recName(root)).toBe(RECOMMENDED.display_name);
    expect(recFlag(root).classList.contains('flag--rec')).toBe(true);
    expect(recFlag(root).textContent).toMatch(/Recommended/);

    // The headline uses the softer "Recommended for your setup" (no live USB
    // auto-detection is claimed).
    expect(root.querySelector('.B__lede h1').textContent).toBe('Recommended for your setup');

    // One-click install is armed (the recommended kit resolves to the stable build).
    expect(installBtn(root)).not.toBeNull();
    expect(installBtn(root).disabled).toBe(false);
    expect(installBtn(root).textContent).toMatch(/Install this kit/);

    // The demoted strip offers browsing + a mini-kit per other kit (capped at 5).
    expect(moreLink(root).textContent).toMatch(new RegExp(`Browse all ${TOTAL} kits`));
    expect(miniKits(root).length).toBe(Math.min(5, TOTAL - 1));

    // The recommendation landing intentionally omits the footer action bar.
    expect(footer(root).hidden).toBe(true);
  });

  it('keeps the advanced builder reachable from the landing', async () => {
    const { root, app } = await mountStep();
    const hatchLink = root.querySelector('.hatch .linkbtn');
    expect(hatchLink).not.toBeNull();
    expect(hatchLink.textContent).toMatch(/module by module/i);
    hatchLink.click();
    await flush();
    expect(app.__testHooks.getState().mode).toBe('advanced');
  });
});

describe('WF2-IDENTIFY-RECO — Browse table', () => {
  it('renders one row per kit with the count, Rec badge, channel pill and target', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);

    expect(browseBody(root)).not.toBeNull();
    expect(recommendBody(root)).toBeNull();
    expect(tableRows(root)).toHaveLength(TOTAL);
    expect(countText(root)).toBe(`${TOTAL} of ${TOTAL}`);

    // The recommended row carries the Rec badge and the recommended dot.
    const recRow = rowByName(root, RECOMMENDED.display_name);
    expect(recRow.querySelector('.kitrow__rec')).not.toBeNull();
    expect(recRow.querySelector('.kt__dot--recommended')).not.toBeNull();
    expect(recRow.querySelector('.kt__target').textContent).toBe(RECOMMENDED.firmware_config_string);

    // A preview kit carries the amber preview channel pill.
    const kitchenRow = rowByName(root, KITCHEN.display_name);
    expect(kitchenRow.querySelector('.kt__chan--preview')).not.toBeNull();

    // The footer action bar is present with the committed selection + Continue.
    expect(footer(root).hidden).toBe(false);
    expect(footerContinue(root)).not.toBeNull();
  });

  it('TRIAC stays fail-closed — no TRIAC card appears in the table', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);
    const targets = tableRows(root).map((r) => r.querySelector('.kt__target').textContent);
    expect(targets.every((t) => !/FanTRIAC/i.test(t))).toBe(true);
    expect(root.textContent).not.toMatch(/TRIAC/i);
  });
});

describe('WF2-IDENTIFY-RECO — Browse search', () => {
  it('live-filters by name, updates the count, and matches part SKUs', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);

    type(root, 'bedroom');
    expect(tableRows(root)).toHaveLength(1);
    expect(tableRows(root)[0].querySelector('.kt__name').textContent).toMatch(/Bedroom/);
    expect(countText(root)).toBe(`1 of ${TOTAL}`);

    type(root, 'S360-211');
    expect(tableRows(root)).toHaveLength(VENTIQ_KITS.length);
    expect(countText(root)).toBe(`${VENTIQ_KITS.length} of ${TOTAL}`);
  });

  it('shows the empty state and Clear filters resets query + channel', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);

    chipByLabel(root, 'Preview').click();
    type(root, 'zzz-nothing-matches');
    expect(tableRows(root)).toHaveLength(0);
    const empty = root.querySelector('.ktable__empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/No kits match/);

    empty.querySelector('.linkbtn').click();
    expect(searchInput(root).value).toBe('');
    expect(tableRows(root)).toHaveLength(TOTAL);
    expect(countText(root)).toBe(`${TOTAL} of ${TOTAL}`);
    expect(chipByLabel(root, 'All').classList.contains('is-on')).toBe(true);
  });

  it('toggles the clear (×) button with the query and keeps the input node stable', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);
    const before = searchInput(root);

    expect(root.querySelector('.kit-search__clear').hidden).toBe(true);
    type(root, 'ba');
    type(root, 'bath');
    // The input element is never rebuilt by the targeted re-render (caret kept).
    expect(searchInput(root)).toBe(before);
    expect(root.querySelector('.kit-search__clear').hidden).toBe(false);

    root.querySelector('.kit-search__clear').click();
    expect(before.value).toBe('');
    expect(tableRows(root)).toHaveLength(TOTAL);
  });
});

describe('WF2-IDENTIFY-RECO — channel filter chips', () => {
  it('filters by channel and reflects the active chip', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);

    chipByLabel(root, 'Stable').click();
    expect(tableRows(root)).toHaveLength(STABLE_KITS.length);
    expect(chipByLabel(root, 'Stable').classList.contains('is-on')).toBe(true);
    expect(chipByLabel(root, 'Stable').getAttribute('aria-pressed')).toBe('true');
    expect(chipByLabel(root, 'All').getAttribute('aria-pressed')).toBe('false');

    chipByLabel(root, 'Preview').click();
    expect(tableRows(root)).toHaveLength(PREVIEW_KITS.length);

    chipByLabel(root, 'All').click();
    expect(tableRows(root)).toHaveLength(TOTAL);
  });
});

describe('WF2-IDENTIFY-RECO — selection + navigation', () => {
  it('clicking a row commits it: the footer summary + Continue update', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);

    rowByName(root, KITCHEN.display_name).click();
    await flush();

    expect(selectedRow(root)).toBe(rowByName(root, KITCHEN.display_name));
    expect(footerSel(root).textContent).toMatch(/Kitchen Bundle/);
    // The Kitchen preview bundle resolves to an installable preview build, so
    // Continue is armed (the preview acknowledgement is enforced at install time).
    expect(footerContinue(root).disabled).toBe(false);
  });

  it('navigates browse <-> recommendation and reframes a non-recommended pick', async () => {
    const { root } = await mountStep();
    await gotoBrowse(root);

    // Pick the Kitchen (preview) kit, then go back to the landing.
    rowByName(root, KITCHEN.display_name).click();
    await flush();
    backLink(root).click();
    await flush();

    // The landing reframes to "Your selected kit" with the amber preview flag.
    expect(recommendBody(root)).not.toBeNull();
    expect(recName(root)).toBe(KITCHEN.display_name);
    expect(root.querySelector('.B__lede h1').textContent).toBe('Your selected kit');
    expect(recFlag(root).classList.contains('flag--preview')).toBe(true);

    // "Use the recommended kit" returns to the recommended selection.
    expect(moreLink(root).textContent).toMatch(/Use the recommended kit/);
    moreLink(root).click();
    await flush();
    expect(recName(root)).toBe(RECOMMENDED.display_name);
    expect(recFlag(root).classList.contains('flag--rec')).toBe(true);
  });
});
