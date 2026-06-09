/**
 * Single source of truth for the WebFlash "stable surface": which customer kits
 * are stable, which are preview, and which is recommended. The authoritative data
 * lives in scripts/data/kits.json; this helper DERIVES the sets from it so test
 * files no longer hardcode literal SKU / config-string arrays that drift every
 * time a kit is promoted or demoted (the repeated "Bedroom is preview, only
 * Bathroom is stable" churn this refactor removes).
 *
 * ANTI-TAUTOLOGY CONTRACT (read before using):
 *   These derived sets are the EXPECTED value. A test must assert them against a
 *   DIFFERENT artifact so it still catches drift:
 *     - manifest build channels      (manifest.json)
 *     - the REQUIRED_CONFIGS allowlist (.github/workflows/firmware-publish.yml)
 *     - on-disk firmware files / install-gate predicates
 *   Never assert a kits.json-derived value against another kits.json-derived
 *   value (for example `catalog.kits.filter(k => k.recommended)` against
 *   `recommendedSkus`): both come from kits.json, so the comparison can never
 *   fail and catches nothing.
 *
 *   The one place that pins the STRUCTURAL SHAPE of kits.json itself (the
 *   per-SKU config-string mapping, the recommended/stable/preview membership)
 *   stays an explicit literal assertion in __tests__/kits-json.test.js. Deriving
 *   that pin from kits.json would be circular, so it is intentionally NOT routed
 *   through this helper.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KITS_JSON_PATH = join(__dirname, '..', '..', 'scripts', 'data', 'kits.json');

const payload = JSON.parse(readFileSync(KITS_JSON_PATH, 'utf8'));

/** The raw kit entries, exactly as authored in kits.json. */
export const kits = Array.isArray(payload.kits) ? payload.kits : [];

// A kit's channel defaults to 'stable' when firmware_channel is absent, mirroring
// the kit-config loader (scripts/utils/kit-config.js).
const channelOf = (kit) => kit.firmware_channel || 'stable';
const sortedUnique = (values) => [...new Set(values)].sort();

const recommendedKits = kits.filter((kit) => kit.recommended === true);
const stableKits = kits.filter((kit) => channelOf(kit) === 'stable');
const previewKits = kits.filter((kit) => channelOf(kit) === 'preview');

/** SKUs of the recommended kit(s), sorted and de-duplicated. */
export const recommendedSkus = sortedUnique(recommendedKits.map((kit) => kit.sku));
/** SKUs of every stable-channel kit, sorted and de-duplicated. */
export const stableSkus = sortedUnique(stableKits.map((kit) => kit.sku));
/** SKUs of every preview-channel kit, sorted and de-duplicated. */
export const previewSkus = sortedUnique(previewKits.map((kit) => kit.sku));

/** Firmware config strings of the recommended kit(s) (the production surface). */
export const recommendedConfigs = sortedUnique(
    recommendedKits.map((kit) => kit.firmware_config_string)
);
/** Firmware config strings of every stable-channel kit, sorted + de-duplicated. */
export const stableConfigs = sortedUnique(stableKits.map((kit) => kit.firmware_config_string));
/** Firmware config strings of every preview-channel kit, sorted + de-duplicated. */
export const previewConfigs = sortedUnique(previewKits.map((kit) => kit.firmware_config_string));

/**
 * Rescue is the standalone unbricking build, not a customer kit, so it is never
 * derived from kits.json. The publish workflow's REQUIRED_CONFIGS allowlist is
 * the production (recommended) config surface plus Rescue, in that order.
 */
export const RESCUE_CONFIG = 'Rescue';
export const requiredConfigs = [...recommendedConfigs, RESCUE_CONFIG];
