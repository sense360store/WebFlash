/**
 * WF2-IDENTIFY-RECO — Step 1 recommendation-first kit chooser (two views).
 *
 * Pins the behaviour of the redesigned Identify step that replaced the #502
 * master–detail browser with the v3 design_handoff_installer_flow two-view
 * experience:
 *   - View 1 (Recommendation): the .B__rec card for the catalogue's recommended
 *     kit, its part chips, the "Install this kit" / "See full details" CTAs, the
 *     stable-vs-preview reassurance line, and the .B__more teaser strip
 *     ("Browse all N kits" + minikit cards) that crosses into View 2;
 *   - View 2 (Browse): the .ktable of every catalogue kit, the "N of M" count,
 *     live search over name / board / SKU, the All / Stable / Preview channel
 *     chips with the empty state, the status dot + Rec pill + channel pill +
 *     board tags + firmware-target columns, and the sticky footer Continue;
 *   - the toggle in both directions (See full details / Browse all / minikit ->
 *     Browse; back-to-recommendation -> View 1);
 *   - view-over-engine: "Install this kit" and the Browse footer "Continue" bind
 *     to the engine verdict (resolved.installable), and a kit with no signed
 *     build is routed to the ESPHome source path;
 *   - TRIAC fail-closed: neither view ever surfaces a TRIAC row, because the
 *     catalogue has no FanTRIAC entry (the engine-level TRIAC block is pinned by
 *     wf2-identify.test.js and stays untouched).
 *
 * Drives the real view + engine through the DOM (real kits.json + manifest.json
 * served via a fetch stub), deriving expected counts from kits.json rather than
 * hardcoding them.
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
const BEDROOM = KITS.find((k) => k.sku === 'S360-KIT-BEDROOM-P');
const VENTIQ_KITS = KITS.filter((k) => k.components.some((c) => c.sku === 'S360-211'));

// A fetch stub that serves the real on-disk JSON, optionally overriding kits.json
// with a synthetic catalogue (used for the blocked-recommendation path).
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

async function boot(search = '', kitsOverride) {
  if (search) window.history.replaceState({}, '', '/' + search);
  global.fetch = makeFetch(kitsOverride);
  const engine = (await import('../scripts/engine.js')).default;
  const app = await import('../scripts/app.js');
  return { engine, app };
}

async function mountFlow(search = '', kitsOverride) {
  const { engine, app } = await boot(search, kitsOverride);
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true });
  await flush();
  return { root, app };
}

// ----- DOM helpers -----
const recCard = (root) => root.querySelector('.B__rec');
const installBtn = (root) => root.querySelector('.B__cta .btn--lg');
const seeDetailsBtn = (root) => root.querySelector('.B__cta .btn--ghost');
const browseAllLink = (root) => root.querySelector('.B__more-head .linkbtn');
const minikits = (root) => [...root.querySelectorAll('.minikit')];
const table = (root) => root.querySelector('.ktable');
const rows = (root) => [...root.querySelectorAll('.ktable__body .ktable__row')];
const rowName = (row) => (row.querySelector('.kt-name').firstChild.textContent || '').trim();
const rowByName = (root, name) => rows(root).find((r) => rowName(r) === name) || null;
const countText = (root) => (root.querySelector('.C__count') || {}).textContent;
const searchInput = (root) => root.querySelector('.C__search-input');
const chipByLabel = (root, label) => [...root.querySelectorAll('.C__chips .kit-chip')].find((c) => c.textContent === label);
const continueBtn = (root) => root.querySelector('.identify-step__foot .btn--lg');
const backLink = (root) => root.querySelector('.C__back');
const hatchLink = (root) => [...root.querySelectorAll('.linkbtn')].find((b) => /module by module/i.test(b.textContent));

function type(root, value) {
  const input = searchInput(root);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/');
});

describe('WF2-IDENTIFY-RECO — View 1: recommendation landing', () => {
  it('opens on the recommendation view (not the table) with the v3 lede', async () => {
    const { root } = await mountFlow();

    expect(root.querySelector('.identify-step')).not.toBeNull();
    expect(recCard(root)).not.toBeNull();
    // The full catalogue table is View 2; it is not rendered on the landing.
    expect(table(root)).toBeNull();

    expect(root.querySelector('.idlede h1').textContent).toBe('Recommended for your setup');
    expect(root.querySelector('.idlede .eyebrow').textContent).toMatch(/step 1/i);
  });

  it('renders the catalogue recommended kit with its pill, parts and CTAs', async () => {
    const { root } = await mountFlow();

    expect(recCard(root).querySelector('h2').textContent).toBe(RECOMMENDED.display_name);
    // The recommendation pill is the accent "Recommended" flag for the rec-flagged kit.
    const pill = recCard(root).querySelector('.flag');
    expect(pill.classList.contains('flag--rec')).toBe(true);
    expect(pill.textContent).toMatch(/recommended/i);

    // One part chip per catalogue component (dot + name + SKU).
    const chips = [...recCard(root).querySelectorAll('.parts .part')];
    expect(chips).toHaveLength(RECOMMENDED.components.length);
    expect(chips[0].querySelector('.part__sku').textContent).toBe(RECOMMENDED.components[0].sku);

    // Primary CTA + ghost "See full details".
    expect(installBtn(root).textContent).toMatch(/install this kit/i);
    expect(seeDetailsBtn(root).textContent).toMatch(/see full details/i);
  });

  it('shows the stable reassurance line (green check) for the stable recommended kit', async () => {
    const { root } = await mountFlow();
    const reassure = recCard(root).querySelector('.B__reassure');
    expect(reassure.classList.contains('B__reassure--ok')).toBe(true);
    expect(reassure.textContent).toMatch(/stable firmware/i);
    expect(reassure.textContent).toMatch(/right for most people/i);
  });

  it('renders the More strip: "Browse all N kits" + a minikit per non-recommended kit', async () => {
    const { root } = await mountFlow();

    expect(browseAllLink(root).textContent).toMatch(new RegExp(`Browse all ${TOTAL} kits`));
    // One minikit per other catalogue kit (the recommended kit is the hero card).
    expect(minikits(root)).toHaveLength(TOTAL - 1);
    const firstMini = minikits(root)[0];
    expect(firstMini.querySelector('.minikit__meta').textContent).toMatch(/\d+ parts · (Stable|Preview)/);

    // The escape hatch to the advanced builder is always offered.
    expect(hatchLink(root)).not.toBeNull();
  });

  it('"Install this kit" reflects the engine verdict and advances to Install', async () => {
    const { root, app } = await mountFlow();

    // The recommended kit resolves to the stable Release-One build, so the CTA is
    // armed once the verdict has resolved.
    expect(app.__testHooks.getState().recResolved.installable).toBe(true);
    expect(installBtn(root).disabled).toBe(false);

    installBtn(root).click();
    await flush();

    // Committing through the engine + advancing to the Install step (step index 1).
    const viewState = app.__testHooks.getState();
    expect(viewState.kit.sku).toBe(RECOMMENDED.sku);
    expect(viewState.resolved.installable).toBe(true);
    expect(viewState.step).toBe(1);
  });
});

describe('WF2-IDENTIFY-RECO — toggling into View 2 (Browse)', () => {
  it('switches to the table from "See full details"', async () => {
    const { root } = await mountFlow();
    expect(table(root)).toBeNull();
    seeDetailsBtn(root).click();
    expect(table(root)).not.toBeNull();
    expect(recCard(root)).toBeNull();
  });

  it('switches to the table from "Browse all N kits"', async () => {
    const { root } = await mountFlow();
    browseAllLink(root).click();
    expect(table(root)).not.toBeNull();
  });

  it('switches to the table from a minikit card', async () => {
    const { root } = await mountFlow();
    minikits(root)[0].click();
    expect(table(root)).not.toBeNull();
  });
});

describe('WF2-IDENTIFY-RECO — View 2: catalogue table', () => {
  async function mountBrowse() {
    const ctx = await mountFlow();
    seeDetailsBtn(ctx.root).click();
    return ctx;
  }

  it('renders one row per catalogue kit with the real "N of M" count', async () => {
    const { root } = await mountBrowse();
    expect(rows(root)).toHaveLength(TOTAL);
    expect(countText(root)).toBe(`${TOTAL} of ${TOTAL}`);

    // Column headers (Version added between Channel and Parts).
    const heads = [...root.querySelectorAll('.ktable thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Kit', 'Channel', 'Version', 'Parts', 'Boards', 'Firmware target']);
  });

  // WF-H1-REIMPORT-CLEAN-001 W1 delisted every preview kit card, so the real
  // catalogue is stable-only (Bathroom + Bedroom) and no real kit carries
  // more than four boards. The preview-pill and board-overflow renderings are
  // still live code paths, so they stay covered through a synthetic catalogue
  // (the real kits plus one preview card mapped to the real LED preview
  // build) served via the existing kitsOverride harness.
  const SYNTH_LED_PREVIEW_KIT = {
    sku: 'S360-KIT-SYNTH-LED-P',
    display_name: 'Synthetic LED Preview Bundle',
    recommended: false,
    wizard_state: { mount: 'ceiling', power: 'poe', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq', led: 'led' },
    components: [
      { sku: 'S360-100', label: 'Sense360 Core' },
      { sku: 'S360-200', label: 'Sense360 RoomIQ' },
      { sku: 'S360-211', label: 'Sense360 VentIQ' },
      { sku: 'S360-300', label: 'Sense360 LED' },
      { sku: 'S360-410', label: 'Sense360 PoE PSU' },
    ],
    firmware_config_string: 'Ceiling-POE-VentIQ-RoomIQ-LED',
    firmware_channel: 'preview',
  };
  const SYNTH_CATALOGUE = { ...kitsJson, kits: [...KITS, SYNTH_LED_PREVIEW_KIT] };

  async function mountBrowseSynth() {
    const ctx = await mountFlow('', SYNTH_CATALOGUE);
    seeDetailsBtn(ctx.root).click();
    return ctx;
  }

  it('marks the recommended row (accent dot + Rec pill) and channel pills per kit', async () => {
    const { root } = await mountBrowseSynth();
    const recRow = rowByName(root, RECOMMENDED.display_name);
    expect(recRow.querySelector('.kt-dot--recommended')).not.toBeNull();
    expect(recRow.querySelector('.kt-rec').textContent).toMatch(/rec/i);
    expect(recRow.querySelector('.kt-chan--stable')).not.toBeNull();

    const previewRow = rowByName(root, SYNTH_LED_PREVIEW_KIT.display_name);
    expect(previewRow.querySelector('.kt-chan--preview')).not.toBeNull();
    expect(previewRow.querySelector('.kt-dot--preview')).not.toBeNull();
  });

  it('shows board SKU tags (first 4 + overflow) and the mono firmware target', async () => {
    const { root } = await mountBrowseSynth();
    const row = rowByName(root, SYNTH_LED_PREVIEW_KIT.display_name);
    // A kit with more than four boards collapses the rest into a "+N" tag.
    const tags = [...row.querySelectorAll('.kt-board')];
    expect(tags.length).toBe(5); // 4 SKUs + the overflow tag
    expect(row.querySelector('.kt-board--more').textContent).toBe(`+${SYNTH_LED_PREVIEW_KIT.components.length - 4}`);
    expect(row.querySelector('.kt-target').textContent).toBe(SYNTH_LED_PREVIEW_KIT.firmware_config_string);

    // The real four-board recommended kit renders all four tags, no overflow.
    const realRow = rowByName(root, RECOMMENDED.display_name);
    expect([...realRow.querySelectorAll('.kt-board')].length).toBe(RECOMMENDED.components.length);
    expect(realRow.querySelector('.kt-board--more')).toBeNull();
  });

  it('live-filters by name / SKU and keeps the search input node stable', async () => {
    const { root } = await mountBrowse();
    const before = searchInput(root);

    type(root, 'bedroom');
    expect(rows(root)).toHaveLength(1);
    expect(rowName(rows(root)[0])).toBe(BEDROOM.display_name);
    expect(countText(root)).toBe(`1 of ${TOTAL}`);

    // The input element is never rebuilt by the targeted re-render (caret kept).
    type(root, 'S360-211');
    expect(searchInput(root)).toBe(before);
    expect(rows(root)).toHaveLength(VENTIQ_KITS.length);
  });

  it('shows the empty state and Clear filters resets query + channel', async () => {
    const { root } = await mountBrowse();

    chipByLabel(root, 'Preview').click();
    type(root, 'zzz-nothing-matches');
    expect(rows(root)).toHaveLength(0);
    const empty = root.querySelector('.ktable__empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/No kits match/);

    empty.querySelector('.linkbtn').click();
    expect(searchInput(root).value).toBe('');
    expect(rows(root)).toHaveLength(TOTAL);
    expect(chipByLabel(root, 'All').classList.contains('is-on')).toBe(true);
  });

  it('filters by channel and reflects the active chip', async () => {
    const { root } = await mountBrowse();

    chipByLabel(root, 'Stable').click();
    expect(rows(root)).toHaveLength(STABLE_KITS.length);
    expect(rowName(rows(root)[0])).toBe(RECOMMENDED.display_name);
    expect(chipByLabel(root, 'Stable').getAttribute('aria-pressed')).toBe('true');
    expect(chipByLabel(root, 'All').getAttribute('aria-pressed')).toBe('false');

    chipByLabel(root, 'Preview').click();
    expect(rows(root)).toHaveLength(PREVIEW_KITS.length);

    chipByLabel(root, 'All').click();
    expect(rows(root)).toHaveLength(TOTAL);
  });

  it('Continue is disabled until a row is selected, then reflects the verdict and advances', async () => {
    const { root, app } = await mountBrowse();
    // Nothing committed yet on a fresh browse from the landing.
    expect(continueBtn(root).disabled).toBe(true);
    expect(root.querySelector('.winfoot__sel')).toBeNull();

    // Retargeted from the Kitchen Relay preview kit after
    // WF-H1-REIMPORT-CLEAN-001 W1 delisted the fan preview kit cards; the
    // Bedroom stable bundle is a surviving non-recommended kit card.
    rowByName(root, BEDROOM.display_name).click();
    await flush();

    // The committed kit resolves to an installable stable build, so the
    // footer Continue is armed and the selected-kit indicator names it.
    const viewState = app.__testHooks.getState();
    expect(viewState.kit.sku).toBe(BEDROOM.sku);
    expect(viewState.resolved.isPreview).toBe(false);
    expect(continueBtn(root).disabled).toBe(false);
    expect(root.querySelector('.winfoot__sel').textContent).toMatch(/Bedroom/);

    continueBtn(root).click();
    await flush();
    expect(app.__testHooks.getState().step).toBe(1);
  });

  it('returns to the recommendation view via the back link', async () => {
    const { root } = await mountBrowse();
    expect(table(root)).not.toBeNull();
    backLink(root).click();
    expect(recCard(root)).not.toBeNull();
    expect(table(root)).toBeNull();
  });
});

describe('WF2-IDENTIFY-RECO — TRIAC fail-closed (catalogue-only surfaces)', () => {
  it('the catalogue has no TRIAC / fan-only standalone entry to surface', () => {
    expect(KITS.some((k) => /triac/i.test(k.firmware_config_string))).toBe(false);
    // Fan-only standalone previews (no RoomIQ/air sensor) are never room-bundle
    // kits, so the catalogue carries none.
    expect(KITS.some((k) => k.firmware_config_string === 'Ceiling-POE-FanPWM')).toBe(false);
    expect(KITS.some((k) => k.firmware_config_string === 'Ceiling-POE-FanDAC')).toBe(false);
  });

  it('neither view ever renders a TRIAC row or chip', async () => {
    const { root } = await mountFlow();
    expect(root.textContent).not.toMatch(/triac/i);

    seeDetailsBtn(root).click();
    expect(table(root)).not.toBeNull();
    expect(root.textContent).not.toMatch(/triac/i);
    // Every firmware target shown is a real catalogue config string.
    const targets = rows(root).map((r) => r.querySelector('.kt-target').textContent);
    targets.forEach((t) => expect(/triac/i.test(t)).toBe(false));
  });
});

describe('WF2-IDENTIFY-RECO — view over engine (blocked recommendation)', () => {
  it('routes a recommended kit with no signed build to the source path and disarms Install', async () => {
    // A recommended kit whose config has no published build (USB power) must read
    // its blocked verdict from the engine: the CTA disarms and the ESPHome source
    // callout appears. The view owns no gate.
    const blockedCatalogue = {
      schema_version: 1,
      kits: [
        {
          sku: 'S360-KIT-USB-RECO',
          display_name: 'USB Recommendation',
          recommended: true,
          wizard_state: { mount: 'ceiling', power: 'usb', bathroom: true, ventiq: 'ventiq', roomiq: 'roomiq' },
          firmware_config_string: 'Ceiling-USB-VentIQ-RoomIQ',
        },
      ],
    };
    const { root, app } = await mountFlow('?configmode=kit', blockedCatalogue);

    expect(app.__testHooks.getState().recResolved.installable).toBe(false);
    expect(app.__testHooks.getState().recResolved.reason).toBe('no-build');
    expect(installBtn(root).disabled).toBe(true);

    const callout = root.querySelector('.callout--warn');
    expect(callout).not.toBeNull();
    expect(callout.textContent).toMatch(/ESPHome YAML/);
    expect(callout.querySelector('a[href*="esphome-public"]')).not.toBeNull();
  });
});
