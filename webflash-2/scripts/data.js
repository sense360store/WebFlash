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

export const SENSING = [
  {
    id: 'roomiq', name: 'Sense360 RoomIQ', sku: 'S360-200', code: 'RoomIQ',
    desc: 'Presence, light, temperature, humidity and pressure on one board.',
    req: ['Core R4', 'J3 sensor bus'], conflicts: [],
  },
  {
    id: 'airiq', name: 'Sense360 AirIQ', sku: 'S360-210', code: 'AirIQ',
    desc: 'Balanced air quality: VOC, CO₂ and particulate coverage.',
    req: ['Core Rev B+', 'J4 bus', 'J7 aux power'], conflicts: ['ventiq', 'dac'],
  },
  {
    id: 'ventiq', name: 'Sense360 VentIQ', sku: 'S360-211', code: 'VentIQ',
    desc: 'Humidity, temperature and air quality tuned for bathrooms.',
    req: ['Core Rev B+', 'J4 bus', 'J7 aux power'], conflicts: ['airiq'],
    bathroom: true,
  },
];

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
// The `verify` check is terminal:'skip', not a pass. WebFlash 1.0 does not
// perform cryptographic signature verification and reports signature_verified as
// skip; the 2.0 preview mirrors that non-claim. Do not render it as a pass and
// do not reintroduce a "signature valid" claim until real verification ships.
export const CHECKS = [
  { id: 'browser', name: 'Browser support', okSub: 'Chrome 124 · Web Serial available', waitSub: 'Checking Web Serial support…' },
  { id: 'secure', name: 'Secure context', okSub: 'Served over HTTPS', waitSub: 'Verifying secure origin…' },
  { id: 'manifest', name: 'Firmware manifest', okSub: 'Up to date · checked just now', waitSub: 'Fetching latest manifest…' },
  { id: 'verify', name: 'Firmware verification', terminal: 'skip', skipSub: 'Signature metadata present', waitSub: 'Checking firmware metadata…' },
];

// ---- Builder selection <-> engine wizard-state mapping ----
// The advanced builder tracks a small UI selection shape:
//   { power: 'usbc'|'poe'|'pwr', sensing: 'roomiq'|'airiq'|'ventiq',
//     fan: 'none'|'relay'|'pwm'|'dac'|'triac', led: boolean }
// The engine (scripts/state.js) speaks a different vocabulary for two of these:
// power uses `usb` (not `usbc`) and the DAC fan driver is `analog` (not `dac`,
// which is the SKU shorthand). These two maps are the single translation point,
// so the view cannot drift from the engine identifiers.
const POWER_TO_ENGINE = Object.freeze({ usbc: 'usb', poe: 'poe', pwr: 'pwr' });
const ENGINE_TO_POWER = Object.freeze({ usb: 'usbc', poe: 'poe', pwr: 'pwr' });
const FAN_TO_ENGINE = Object.freeze({ none: 'none', relay: 'relay', pwm: 'pwm', dac: 'analog', triac: 'triac' });
const ENGINE_TO_FAN = Object.freeze({ none: 'none', relay: 'relay', pwm: 'pwm', analog: 'dac', triac: 'triac' });

// The advanced builder's default selection: the supported Bathroom PoE
// configuration (PoE power, VentIQ bathroom sensing, no fan driver, no LED),
// which resolves to the stable Release-One build.
export const DEFAULT_SEL = Object.freeze({ power: 'poe', sensing: 'ventiq', fan: 'none', led: false });

/**
 * Maps the advanced builder selection to the engine wizard-state object that
 * setState() and resolveCompatibleFirmware() consume. Every ceiling build
 * carries RoomIQ, so RoomIQ is always present; the "sensing" choice selects the
 * optional air-quality board (AirIQ or the bathroom VentIQ). VentIQ implies the
 * bathroom toggle, which the engine also enforces.
 *
 * @param {{power?: string, sensing?: string, fan?: string, led?: boolean}} sel
 * @returns {object} wizard-state for engine.state.setState()
 */
export function selToWizardState(sel = {}) {
  const sensing = sel.sensing || 'roomiq';
  return {
    mount: 'ceiling',
    power: POWER_TO_ENGINE[sel.power] || null,
    bathroom: sensing === 'ventiq',
    roomiq: 'roomiq',
    airiq: sensing === 'airiq' ? 'airiq' : 'none',
    ventiq: sensing === 'ventiq' ? 'ventiq' : 'none',
    fan: FAN_TO_ENGINE[sel.fan] || 'none',
    led: sel.led ? 'led' : 'none',
    voice: 'none',
  };
}

/**
 * Inverse of selToWizardState: derives the advanced builder selection shape
 * from an engine wizard-state snapshot (engine.state.getState()). Used to
 * hydrate the builder from a manual share link and to reflect engine-enforced
 * exclusivity (AirIQ/VentIQ) back into the UI.
 *
 * @param {object} state - engine wizard-state snapshot
 * @returns {{power: string, sensing: string, fan: string, led: boolean}}
 */
export function wizardStateToSel(state = {}) {
  const sensing = state.ventiq && state.ventiq !== 'none'
    ? 'ventiq'
    : state.airiq && state.airiq !== 'none'
      ? 'airiq'
      : 'roomiq';
  return {
    power: ENGINE_TO_POWER[state.power] || 'poe',
    sensing,
    fan: ENGINE_TO_FAN[state.fan] || 'none',
    led: Boolean(state.led && state.led !== 'none'),
  };
}
