/**
 * ktable-overflow-clip — Browse table (.ktable) sticky-header root-cause guard.
 *
 * Root cause of the long-standing "first row hidden under the header" bug:
 * `.ktable` carried `overflow: hidden`, which makes the table its OWN scroll
 * container. A `position: sticky` thead resolves its `top` offset against the
 * nearest scroll-container ancestor, so with `overflow: hidden` the thead's
 * `top: var(--winbar-h)` (60px) was measured from the table's own top edge
 * instead of the page viewport. The table never scrolls internally, but sticky
 * still enforces the 60px minimum, so the header cells were pushed 60px DOWN
 * from the table top at every scroll position and laid over the first body row
 * (the recommended row read as hidden). It also meant the header never actually
 * pinned under the .winbar on page scroll — it scrolled away with the table.
 *
 * `overflow: clip` clips the rounded corners exactly like hidden but does NOT
 * establish a scroll container, so the sticky thead resolves against the page
 * viewport: it sits flush at the table top at rest and pins under the .winbar
 * while scrolling. Geometry verified in headless Chromium against the Browse
 * view at desktop (1440px) and <=760px: at scroll 0 the first row is no longer
 * covered (0px vs the old 60px), and the header pins at viewport top 60px on
 * scroll. jsdom has no layout engine, so this is a CSS-text invariant.
 *
 * scroll-margin-top is deliberately untouched: it only affects programmatic
 * scrollIntoView / anchor / focus scrolling, and no .ktable row is ever
 * scrolled into view, so it could never have caused or fixed this clip.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
// Strip /* ... */ comments first so the assertions test real declarations, not
// the explanatory prose (which deliberately names the rejected `overflow: hidden`).
const css = readFileSync(join(ROOT, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// The bare `.ktable { ... }` rule body (not `.ktable thead th`, not `.ktable__row`).
const ktableBlock = () => {
  const m = css.match(/\.ktable\s*\{([^}]*)\}/);
  expect(m).not.toBeNull();
  return m[1];
};

describe('Browse table sticky-header root cause (.ktable overflow)', () => {
  it('.ktable clips with overflow: clip so it does not become a scroll container', () => {
    expect(ktableBlock()).toMatch(/overflow:\s*clip/);
  });

  it('.ktable must NOT use overflow: hidden (that captures the sticky thead and hides the first row)', () => {
    expect(ktableBlock()).not.toMatch(/overflow:\s*hidden/);
  });

  it('.ktable still rounds its corners (clip preserves border-radius clipping)', () => {
    expect(ktableBlock()).toMatch(/border-radius:\s*var\(--r-lg\)/);
  });

  it('the sticky thead top offset is unchanged (the fix is the overflow lever, not the offset)', () => {
    const th = css.match(/\.ktable thead th\s*\{([^}]*)\}/);
    expect(th).not.toBeNull();
    expect(th[1]).toMatch(/position:\s*sticky/);
    expect(th[1]).toMatch(/top:\s*var\(--winbar-h\)/);
  });
});
