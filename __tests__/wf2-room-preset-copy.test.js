/**
 * WEBFLASH-TAXONOMY-RECONCILE-001 — rendered room-preset copy.
 *
 * Mounts the real 2.0 view over the real engine (real kits.json +
 * manifest.json via a fetch stub, same harness as wf2-kit-picker.test.js)
 * and asserts what a customer actually reads on Step 1:
 *
 *   - the landing leads with the room choice ("Choose your room");
 *   - the hero card leads with the room label and lists the other
 *     recommended rooms for the same physical preset;
 *   - board names stay visible as technical contents beneath the room
 *     label, and the firmware config string stays visible as the secondary
 *     technical identifier;
 *   - the preset is framed as a stable FIRMWARE preset — no rendered text
 *     claims anything is buyable, on sale, or a commercially available
 *     bundle, and no Base/Pro tier or internal programme ID leaks;
 *   - the advanced module builder stays reachable but secondary.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifestJson = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const kitsJson = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'kits.json'), 'utf8'));
const RECOMMENDED = kitsJson.kits.find(k => k.recommended);

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

async function mountFlow() {
  window.history.replaceState({}, '', '/');
  global.fetch = makeFetch();
  const engine = (await import('../scripts/engine.js')).default;
  const app = await import('../scripts/app.js');
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mountWebFlash2(root, { a11y: a11yStub, engine, prefersReducedMotion: () => true });
  await flush();
  return { root, app };
}

beforeEach(() => {
  jest.resetModules();
  renderLegacyForm();
});

describe('WEBFLASH-TAXONOMY-RECONCILE-001 — Step 1 is room-led', () => {
  it('the landing headline is the room choice, not a module or kit pitch', async () => {
    const { root } = await mountFlow();
    expect(root.querySelector('.idlede h1').textContent).toBe('Choose your room');
    const lede = root.querySelector('.idlede').textContent;
    // The lede must not lead with module names or model/variant tiers.
    expect(lede).not.toMatch(/AirIQ|VentIQ|RoomIQ|\bBase\b|\bPro\b|Sensor Bundle|Air Quality Starter/);
  });

  it('the hero card leads with the room label and lists the other recommended rooms', async () => {
    const { root } = await mountFlow();
    const card = root.querySelector('.B__rec');
    expect(card).toBeTruthy();
    expect(card.querySelector('h2').textContent).toBe(RECOMMENDED.room_label);
    expect(card.textContent).toMatch(/Also suitable for/i);
    // Every non-primary recommended room is named on the card.
    RECOMMENDED.recommended_rooms
      .filter(room => room.toLowerCase() !== RECOMMENDED.room_label.toLowerCase())
      .forEach(room => {
        expect(card.textContent.toLowerCase()).toContain(room.toLowerCase());
      });
  });

  it('board names stay visible as technical contents beneath the room label', async () => {
    const { root } = await mountFlow();
    const card = root.querySelector('.B__rec');
    RECOMMENDED.components.forEach(component => {
      expect(card.textContent).toContain(component.label);
      expect(card.textContent).toContain(component.sku);
    });
  });

  it('the config string stays visible as the secondary technical identifier', async () => {
    const { root } = await mountFlow();
    const target = root.querySelector('.B__target');
    expect(target).toBeTruthy();
    expect(target.textContent).toContain(RECOMMENDED.firmware_config_string);
  });

  it('the stable hero is framed as a firmware preset, never a buyable bundle', async () => {
    const { root } = await mountFlow();
    const rendered = root.textContent;
    expect(rendered).toMatch(/stable firmware preset/i);
    expect(rendered).not.toMatch(/buy now|\bbuy\b|on sale|in stock|add to cart|price|shop now|commercially available|available bundle/i);
    // No internal programme / decision IDs in rendered prose.
    expect(rendered).not.toMatch(/\bOD-SOT-\d+\b|\bWEBFLASH-[A-Z0-9-]+-\d{3}\b|\bWF-[A-Z0-9-]+-\d{3}\b/);
    // No Base/Pro/model/variant tier wording.
    expect(rendered).not.toMatch(/\b(Base|Basic)\b/);
    expect(rendered).not.toMatch(/\bPro\b(?!blem)/);
  });

  it('the advanced module builder stays reachable but secondary', async () => {
    const { root } = await mountFlow();
    const hatch = root.querySelector('.hatch');
    expect(hatch).toBeTruthy();
    expect(hatch.textContent).toMatch(/module by module/i);
  });
});
