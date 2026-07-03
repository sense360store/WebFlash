/* WebFlash 2.0 — hardware + firmware data model.
   Mirrors the live Sense360 catalog (modules, conflicts, channels).

   PR 4 of the WebFlash 2.0 migration removed the two simulations that used to
   live here:
     - the hardcoded `KITS` array. Kits now come from the real catalogue
       (scripts/data/kits.json) via engine.kits.loadKitCatalog(), so the 2.0
       view never exposes a kit the 1.0 engine does not already expose.
     - `buildTarget()`. The canonical config_string and the installability
       verdict now come from the engine's compatible-firmware lookup
       (engine.state.resolveCompatibleFirmware) over manifest.json. The view no
       longer invents a target string of its own.

   What remains here is presentation metadata for the advanced builder (the
   per-option labels/SKUs/requirements) plus the pure mapping between the 2.0
   builder selection shape and the engine wizard-state keys. The mapping is the
   only place the two identifier sets meet, so the view cannot drift from the
   engine. */

// Planned (not-yet-installable) kit families surfaced under the advanced
// builder's "different hardware" hatch. Presentation only — none of these has a
// signed WebFlash build, so none is installable. The authoritative blocked
// verdict for any concrete selection still comes from the engine lookup.
export const PLANNED = [
  { name: 'Bathroom Kit — Relay Fan Control', reason: 'Firmware still in development' },
  { name: 'Bathroom Kit — TRIAC Fan Control', reason: 'Mains-load safety review in progress' },
  { name: 'Duct Fan Kit — PWM Fan Control', reason: 'Firmware still in development' },
  { name: 'Duct Fan Kit — 0–10V Fan Control', reason: 'Firmware still in development' },
];

// ---- Advanced builder sections ----
// `id` is the builder selection identifier; selToWizardState() maps it to the
// engine power value (usbc -> usb, poe -> poe, pwr -> pwr). The 240V PSU is
// S360-400, selected via power=pwr. `code` is the human-readable config_string
// token for reference only; the canonical config_string now comes from the
// engine lookup, never from concatenating `code` values in the view.
export const POWER = [
  { id: 'usbc', name: 'USB-C', sku: '—', desc: 'Standard USB-C power connection.', code: 'USB' },
  { id: 'poe', name: 'Sense360 PoE PSU', sku: 'S360-410', desc: 'Power over Ethernet module.', code: 'POE' },
  { id: 'pwr', name: 'Sense360 240V PSU', sku: 'S360-400', desc: 'External mains power module.', code: 'PWR' },
];

// The air-quality board is a single choice: None, AirIQ (S360-210), or the
// bathroom-tuned VentIQ (S360-211). AirIQ and VentIQ are mutually exclusive by
// construction here (one selection), and the engine enforces the same
// exclusivity for share-link hydration. AirIQ keeps only its cross-section
// conflict with the DAC fan driver (they contend for the same aux bus); the
// engine lookup remains the authoritative blocked verdict. `code` is the
// human-readable config_string token for reference only.
export const AIR = [
  {
    id: 'none', name: 'No air-quality board', sku: '—', code: 'None',
    desc: 'Skip the dedicated air-quality board.',
    req: [], conflicts: [],
  },
  {
    id: 'airiq', name: 'Sense360 AirIQ', sku: 'S360-210', code: 'AirIQ',
    desc: 'Balanced air quality: VOC, CO₂ and particulate coverage.',
    req: ['Core Rev B+', 'J4 bus', 'J7 aux power'], conflicts: ['dac'],
  },
  {
    id: 'ventiq', name: 'Sense360 VentIQ', sku: 'S360-211', code: 'VentIQ',
    desc: 'Humidity, temperature and air quality tuned for bathrooms.',
    req: ['Core Rev B+', 'J4 bus', 'J7 aux power'], conflicts: [],
    bathroom: true,
  },
];

// RoomIQ (S360-200) is the presence + environmental board. It is independent of
// the air-quality choice and coexists with AirIQ or VentIQ (or neither), so it
// is its own optional toggle rather than one of the air-quality radio options.
// The manifest confirms RoomIQ is optional: fan-only builds such as
// Ceiling-POE-FanDAC / Ceiling-POE-FanPWM carry no RoomIQ token, while
// Ceiling-POE-RoomIQ, Ceiling-POE-AirIQ-RoomIQ, and Ceiling-POE-VentIQ-RoomIQ
// all pair it with an independent air-quality choice.
export const ROOMIQ = {
  id: 'roomiq', name: 'Sense360 RoomIQ', sku: 'S360-200', code: 'RoomIQ',
  desc: 'Presence, light, temperature, humidity and pressure on one board.',
  req: ['Core R4', 'J3 sensor bus'],
};

// `code` is the human-readable config_string fan token for reference only
// (FanRelay, FanPWM, FanDAC, FanTRIAC). selToWizardState() maps the builder id
// to the engine fan value (dac -> analog). TRIAC keeps `advancedWarn` /
// `installable: false` as a builder presentation hint so the card reads as
// not-installable, but the authoritative blocked verdict for any selection now
// comes from the engine lookup (no matching build -> route to ESPHome source).
export const FAN = [
  { id: 'none', name: 'No fan / switching', sku: '—', code: 'None', desc: 'No fan or switching driver installed.', req: [], conflicts: [] },
  { id: 'relay', name: 'Sense360 Relay', sku: 'S360-310', code: 'FanRelay', desc: 'On/off relay for bathroom fans.', req: ['Core R4', 'S360-Relay-C'], conflicts: [] },
  { id: 'pwm', name: 'Sense360 PWM', sku: 'S360-311', code: 'FanPWM', desc: '12V PWM fan driver, up to 4 fans with tach feedback.', req: ['Core R4', '12vFan_PWM'], conflicts: [] },
  { id: 'dac', name: 'Sense360 DAC', sku: 'S360-312', code: 'FanDAC', desc: '0–10V analog fan driver (e.g. Cloudlift S12).', req: ['Core R4', 'Fan_GP8403'], conflicts: ['airiq'] },
  { id: 'triac', name: 'Sense360 TRIAC', sku: 'S360-320', code: 'FanTRIAC', desc: 'Phase dimmer for a mains fan or lamp.', req: ['Core R4', 'TRIAC_Board'], conflicts: [], advancedWarn: true, installable: false },
];

export const LED = { id: 'led', name: 'Sense360 LED ring', sku: 'S360-300', code: 'LED', desc: 'Visual feedback ring with optional microphone for voice-enabled cores.', req: ['Core R4', 'J11 data', 'J12 power'] };

// ---- Readiness checks (preflight) ----
// PR 5 of the WebFlash 2.0 migration removed the simulated `CHECKS` array (the
// readiness checklist that auto-passed on setTimeout). The Install step now
// composes the real install gate from the engine and renders the preflight
// panel from the machine-readable results keyed by
// engine.state.INSTALL_GATE_CHECK_IDS. There is no simulated readiness data
// left here; the panel rows and their statuses come from
// engine.state.evaluateInstallGate(). The firmware-verification row enforces
// real Ed25519 signature verification alongside the SHA-256 integrity check;
// it asserts verification only when the engine's runtime verdict passed.

// ---- Builder selection <-> engine wizard-state mapping ----
// The advanced builder tracks a small UI selection shape with two independent
// sensing axes:
//   { power: 'usbc'|'poe'|'pwr', roomiq: boolean, air: 'none'|'airiq'|'ventiq',
//     fan: 'none'|'relay'|'pwm'|'dac'|'triac', led: boolean }
// RoomIQ (presence) and the air-quality board are separate selections because
// the hardware and the manifest treat them independently. The engine
// (scripts/state.js) speaks a different vocabulary for two fields: power uses
// `usb` (not `usbc`) and the DAC fan driver is `analog` (not `dac`, which is the
// SKU shorthand). These two maps are the single translation point, so the view
// cannot drift from the engine identifiers.
const POWER_TO_ENGINE = Object.freeze({ usbc: 'usb', poe: 'poe', pwr: 'pwr' });
const ENGINE_TO_POWER = Object.freeze({ usb: 'usbc', poe: 'poe', pwr: 'pwr' });
const FAN_TO_ENGINE = Object.freeze({ none: 'none', relay: 'relay', pwm: 'pwm', dac: 'analog', triac: 'triac' });
const ENGINE_TO_FAN = Object.freeze({ none: 'none', relay: 'relay', pwm: 'pwm', analog: 'dac', triac: 'triac' });

// The advanced builder's default selection: the supported Bathroom PoE
// configuration (PoE power, RoomIQ presence on, VentIQ bathroom air-quality
// board, no fan driver, no LED), which resolves to the stable Release-One build
// Ceiling-POE-VentIQ-RoomIQ.
export const DEFAULT_SEL = Object.freeze({ power: 'poe', roomiq: true, air: 'ventiq', fan: 'none', led: false });

/**
 * Maps the advanced builder selection to the engine wizard-state object that
 * setState() and resolveCompatibleFirmware() consume. The two sensing axes map
 * to engine fields independently: RoomIQ (S360-200) is its own optional presence
 * board, and the air-quality choice selects AirIQ, the bathroom VentIQ, or
 * neither. VentIQ implies the bathroom toggle, which the engine also enforces.
 *
 * @param {{power?: string, roomiq?: boolean, air?: string, fan?: string, led?: boolean}} sel
 * @returns {object} wizard-state for engine.state.setState()
 */
export function selToWizardState(sel = {}) {
  const air = sel.air || 'none';
  return {
    mount: 'ceiling',
    power: POWER_TO_ENGINE[sel.power] || null,
    bathroom: air === 'ventiq',
    roomiq: sel.roomiq ? 'roomiq' : 'none',
    airiq: air === 'airiq' ? 'airiq' : 'none',
    ventiq: air === 'ventiq' ? 'ventiq' : 'none',
    fan: FAN_TO_ENGINE[sel.fan] || 'none',
    led: sel.led ? 'led' : 'none',
    voice: 'none',
  };
}

/**
 * Inverse of selToWizardState: derives the advanced builder selection shape from
 * an engine wizard-state snapshot (engine.state.getState()). Used to hydrate the
 * builder from a manual share link. Both sensing axes are read back
 * independently: the RoomIQ toggle from the engine `roomiq` field, and the
 * air-quality choice from `ventiq` / `airiq` (engine-enforced exclusivity
 * collapses any AirIQ+VentIQ combination to VentIQ).
 *
 * @param {object} state - engine wizard-state snapshot
 * @returns {{power: string, roomiq: boolean, air: string, fan: string, led: boolean}}
 */
export function wizardStateToSel(state = {}) {
  const air = state.ventiq && state.ventiq !== 'none'
    ? 'ventiq'
    : state.airiq && state.airiq !== 'none'
      ? 'airiq'
      : 'none';
  return {
    power: ENGINE_TO_POWER[state.power] || 'poe',
    roomiq: Boolean(state.roomiq && state.roomiq !== 'none'),
    air,
    fan: ENGINE_TO_FAN[state.fan] || 'none',
    led: Boolean(state.led && state.led !== 'none'),
  };
}
