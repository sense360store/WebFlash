/**
 * ktable-sticky-offset — Browse table (.ktable) sticky-header clip fix.
 *
 * The catalogue table's thead is `position: sticky; top: <winbar height>` so it
 * pins just under the 60px .winbar. A row that is scrolled/focus-stepped to the
 * top rests at `.ktable__row { scroll-margin-top }` below the scrollport start.
 * The previous value was only the winbar height (60px), so the rendered sticky
 * thead (≈43.4px desktop / ≈39.4px at <=760px, measured in Chromium) hid the top
 * of the targeted row — the recommended/first row landed under the pinned header.
 *
 * The offset now covers the winbar height PLUS the rendered thead height, sourced
 * from single-source-of-truth custom properties so the winbar height used by the
 * bar, the sticky thead `top`, and the row offset can never drift apart. jsdom
 * has no layout engine, so these are CSS-text invariants; the rendered geometry
 * (old value clips by ~40px, new value clears flush) was verified in headless
 * Chromium against the live Browse view at desktop and <=760px widths.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, 'app.css'), 'utf8');

const block = (selector) => {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  expect(m).not.toBeNull();
  return m[1];
};

describe('Browse table sticky-header offset (.ktable)', () => {
  it(':root defines the winbar height and the rendered thead height as metrics', () => {
    const root = css.match(/:root\s*\{([\s\S]*?)\}/);
    expect(root).not.toBeNull();
    expect(root[1]).toMatch(/--winbar-h:\s*60px/);
    expect(root[1]).toMatch(/--ktable-head-h:\s*44px/);
  });

  it('.winbar height and the sticky thead top both resolve from --winbar-h (kept consistent)', () => {
    expect(block('.winbar')).toMatch(/height:\s*var\(--winbar-h\)/);
    expect(block('.ktable thead th')).toMatch(/top:\s*var\(--winbar-h\)/);
  });

  it('.ktable__row scroll-margin-top clears the winbar PLUS the sticky thead', () => {
    const row = block('.ktable__row');
    expect(row).toMatch(/scroll-margin-top:\s*calc\(\s*var\(--winbar-h\)\s*\+\s*var\(--ktable-head-h\)\s*\)/);
    // Regression guard: must not regress to the winbar-only value.
    expect(row).not.toMatch(/scroll-margin-top:\s*60px/);
  });

  it('the <=760px breakpoint shrinks --ktable-head-h to match the smaller (11px padding) header', () => {
    const idx = css.indexOf('--ktable-head-h: 40px');
    expect(idx).toBeGreaterThan(-1);
    // The override sits inside a max-width:760px media query (the nearest @media
    // before it), so the row offset tracks the smaller header at this breakpoint.
    const enclosingMedia = css.slice(css.lastIndexOf('@media', idx), idx);
    expect(enclosingMedia).toMatch(/@media \(max-width:\s*760px\)/);
  });

  it('does not change the sticky header behaviour, z-index, or the separate-borders divider', () => {
    const th = block('.ktable thead th');
    expect(th).toMatch(/position:\s*sticky/);
    expect(th).toMatch(/z-index:\s*5/);
    expect(th).toMatch(/box-shadow:\s*inset 0 -1px 0 var\(--border\)/);
    // The header still owns its background (separate-borders model, unchanged).
    expect(th).toMatch(/background:\s*var\(--bg-elev\)/);
  });
});
