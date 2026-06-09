/**
 * WF-LIVE-SMOKE-2-0-DEFAULT-001 — deployed 2.0 default smoke contract (guard).
 *
 * Companion to docs/release-gates/WF-LIVE-SMOKE-2-0-DEFAULT-001.md, which records
 * the live-origin smoke of https://sense360store.github.io/WebFlash/ (the deployed
 * GitHub Pages 2.0 default after WF2-CALLOUT-HIDDEN-FIX-001, WF2-KIT-BUNDLE-PICKER-001,
 * WF2-FAN-CONTROL-GATES-001, the fan-bundle import, and WF2-FAN-EXPANSION-001).
 *
 * The live HTTP fetch evidence lives in the doc. This guard pins the committed
 * repo state that PRODUCES that deployed surface, so a future change cannot
 * silently regress the smoke claims:
 *   - the default / recommended choice resolves to the stable Bathroom PoE build;
 *   - the stable default install path needs no additive fan / analog-fan ack;
 *   - every kit card resolves to a real manifest build on its declared channel;
 *   - no TRIAC anywhere in the picker, no standalone fan-only build as a kit card;
 *   - every fan kit is correctly gated by the additive install.js acknowledgements;
 *   - preview stays preview (no silent promotion);
 *   - the empty-callout-bar fix stays in app.css.
 *
 * Offline + deterministic: reads manifest.json, scripts/data/kits.json (through the
 * real kit-config loader), the pure install.js gate predicates, and app.css. No
 * network, no DOM, no engine mount. The build COUNT is intentionally not pinned
 * here (that belongs to the import/alignment suites) so a future legitimate import
 * does not trip this smoke guard as long as the default behaviour holds.
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildCatalogFromPayload } from '../scripts/utils/kit-config.js';
import {
  composeInstallEnabled,
  configRequiresFanControlAck,
  configRequiresDacAddressAck,
} from '../scripts/install.js';
// Stable surface (which configs are stable) is derived from kits.json, not
// hardcoded here. See __tests__/helpers/stable-surface.js for the contract.
import { stableConfigs } from './helpers/stable-surface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8'));
}

const STABLE_CONFIG = 'Ceiling-POE-VentIQ-RoomIQ';
const STANDALONE_FAN_ONLY = ['Ceiling-POE-FanPWM', 'Ceiling-POE-FanDAC'];

const manifest = readJson('manifest.json');
const builds = manifest.builds || [];
const buildByConfig = new Map(builds.map((b) => [b.config_string, b]));

const catalog = buildCatalogFromPayload(readJson('scripts/data/kits.json'));
const kits = catalog.kits;

describe('WF-LIVE-SMOKE-2-0-DEFAULT-001 — default install path', () => {
  test('the stable manifest builds match exactly the kits.json stable config set', () => {
    // Manifest channels (a DIFFERENT artifact) checked against the kits.json-derived
    // stable config set. If kits.json and the manifest ever disagree on which
    // configs ship stable, this fails — without comparing kits.json to itself.
    const stable = builds.filter((b) => b.channel === 'stable').map((b) => b.config_string);
    expect([...stable].sort()).toEqual([...stableConfigs]);
  });

  // The next two assertions read kits.json (via `kits`) and pin its recommended /
  // stable SKU membership. They are intentionally LEFT LITERAL: deriving the
  // expected SKUs from the kits.json-derived helper would compare kits.json to
  // itself (a tautology that can never fail). The canonical structural pin lives
  // in kits-json.test.js; the helper is used for the manifest cross-checks above
  // and below, which can actually drift.
  test('the only recommended kit is the stable Bathroom PoE bundle', () => {
    const recommended = kits.filter((k) => k.recommended);
    expect(recommended.map((k) => k.sku)).toEqual(['S360-KIT-BATH-P']);
    expect(recommended[0].firmware_config_string).toBe(STABLE_CONFIG);
    expect(recommended[0].firmware_channel).toBe('stable');
  });

  test('the Bathroom PoE and Bedroom PoE bundles declare the stable channel', () => {
    const stableKits = kits.filter((k) => k.firmware_channel === 'stable');
    expect(stableKits.map((k) => k.sku).sort()).toEqual(['S360-KIT-BATH-P', 'S360-KIT-BEDROOM-P'].sort());
  });

  test('the stable default install path requires no additive fan / analog-fan acknowledgement', () => {
    expect(configRequiresFanControlAck(STABLE_CONFIG)).toBe(false);
    expect(configRequiresDacAddressAck(STABLE_CONFIG)).toBe(false);
    // With a passing engine verdict and no additive acks required, install arms.
    expect(composeInstallEnabled({
      gateCanInstall: true, configString: STABLE_CONFIG, fanControlAck: false, dacAddressAck: false,
    })).toBe(true);
  });
});

describe('WF-LIVE-SMOKE-2-0-DEFAULT-001 — every kit card resolves to a real manifest build', () => {
  test('there is at least the seven-bundle picker surface (no empty picker)', () => {
    // 11 -> 7 after the stale v1.0.0-preview retirement removed the Kitchen /
    // Living / Corridor base bundles and the Bathroom Relay bundle together
    // with their builds.
    expect(kits.length).toBeGreaterThanOrEqual(7);
    expect(catalog.skipped).toEqual([]);
  });

  test('each kit config_string is a real manifest build with the matching channel', () => {
    kits.forEach((kit) => {
      const build = buildByConfig.get(kit.firmware_config_string);
      expect(build).toBeTruthy();
      expect(build.channel).toBe(kit.firmware_channel);
    });
  });
});

describe('WF-LIVE-SMOKE-2-0-DEFAULT-001 — nothing forbidden appears in the picker', () => {
  test('no TRIAC build exists in the manifest', () => {
    const triac = builds.filter((b) => b.config_string.toLowerCase().includes('triac'));
    expect(triac).toEqual([]);
  });

  test('no kit references a TRIAC config or selects the TRIAC fan driver', () => {
    kits.forEach((kit) => {
      expect(kit.firmware_config_string.toLowerCase()).not.toContain('triac');
      expect(kit.wizard_state.fan).not.toBe('triac');
    });
  });

  test('the standalone fan-only previews are retired and are never kit cards', () => {
    // The standalone FanPWM / FanDAC previews were retired with the stale
    // v1.0.0-preview batch (upstream's regenerated checksums-sha256.txt no
    // longer lists their assets), so they are out of the manifest entirely ...
    STANDALONE_FAN_ONLY.forEach((cfg) => {
      expect(buildByConfig.has(cfg)).toBe(false);
    });
    // ... and no customer kit card maps to a fan-only config either way.
    kits.forEach((kit) => {
      expect(STANDALONE_FAN_ONLY).not.toContain(kit.firmware_config_string);
    });
  });
});

describe('WF-LIVE-SMOKE-2-0-DEFAULT-001 — fan kits are correctly gated', () => {
  test('the additive acks match each kit fan driver, and never bypass a blocking engine', () => {
    kits.forEach((kit) => {
      const cfg = kit.firmware_config_string;
      const fan = kit.wizard_state.fan;
      const isFan = fan && fan !== 'none';
      const isDac = fan === 'analog';

      // Fan-control acknowledgement is required exactly when the kit drives a fan.
      expect(configRequiresFanControlAck(cfg)).toBe(Boolean(isFan));
      // The analog-fan (GP8403) address-switch acknowledgement is required exactly
      // for the FanDAC (0-10V analog) kits.
      expect(configRequiresDacAddressAck(cfg)).toBe(isDac);

      // The additive acks can only make install HARDER — a blocking engine verdict
      // is never bypassed, no matter how many acknowledgements are checked.
      expect(composeInstallEnabled({
        gateCanInstall: false, configString: cfg, fanControlAck: true, dacAddressAck: true,
      })).toBe(false);

      // With a passing engine verdict, a fan kit still blocks until its acks land.
      if (isFan) {
        expect(composeInstallEnabled({
          gateCanInstall: true, configString: cfg, fanControlAck: false, dacAddressAck: false,
        })).toBe(false);
        expect(composeInstallEnabled({
          gateCanInstall: true, configString: cfg, fanControlAck: true, dacAddressAck: isDac ? true : false,
        })).toBe(true);
      }
    });
  });

  test('exactly two FanDAC kits require the analog-fan address-switch acknowledgement', () => {
    const dacKits = kits.filter((k) => configRequiresDacAddressAck(k.firmware_config_string));
    expect(dacKits.map((k) => k.sku).sort()).toEqual(['S360-KIT-BATH-P-DAC', 'S360-KIT-KITCHEN-P-DAC']);
    dacKits.forEach((k) => expect(k.wizard_state.fan).toBe('analog'));
  });
});

describe('WF-LIVE-SMOKE-2-0-DEFAULT-001 — preview stays preview (no silent promotion)', () => {
  test('every manifest build is exactly one of stable / preview / rescue', () => {
    builds.forEach((b) => {
      expect(['stable', 'preview', 'rescue']).toContain(b.channel);
    });
  });

  test('the manifest stable-build count matches kits.json, with one rescue build and the rest preview', () => {
    const byChannel = (ch) => builds.filter((b) => b.channel === ch);
    // Manifest stable count cross-checked against the kits.json-derived stable set.
    expect(byChannel('stable')).toHaveLength(stableConfigs.length);
    expect(byChannel('rescue')).toHaveLength(1);
    expect(byChannel('preview').length).toBe(
      builds.length - byChannel('stable').length - byChannel('rescue').length
    );
  });

  test('no preview kit smuggles a buyable / default / stable flag', () => {
    kits.filter((k) => k.firmware_channel === 'preview').forEach((kit) => {
      expect(kit.recommended).toBe(false);
      expect(kit.buyable).toBeUndefined();
      expect(kit.isDefault).toBeUndefined();
    });
  });
});

describe('WF-LIVE-SMOKE-2-0-DEFAULT-001 — no empty callout bars', () => {
  test('app.css carries the [hidden] reset to display: none !important', () => {
    const css = readFileSync(join(REPO_ROOT, 'app.css'), 'utf8')
      // Strip comments so the explanatory comment cannot satisfy the guard.
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const hiddenRule = /\[hidden\]\s*\{[^}]*\}/.exec(css);
    expect(hiddenRule).not.toBeNull();
    expect(hiddenRule[0]).toMatch(/display\s*:\s*none\s*!important/);
  });
});
