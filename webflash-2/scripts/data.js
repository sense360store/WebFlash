/* WebFlash 2.0 — hardware + firmware data model.
   Mirrors the live Sense360 catalog (kits, modules, conflicts, channels).
   Ported verbatim from the design handoff's data.js into ES module exports. */

// ---- Recommended / preview / planned kits ----
export const KITS = [
  {
    id: 'bath-poe',
    flag: 'recommended',
    name: 'Sense360 Bathroom PoE Kit',
    tagline: 'Stable firmware · ready to install',
    desc:
      'The current Sense360 ceiling kit: bathroom air-quality sensing plus room sensing, powered over Ethernet. This is the supported install for most customers.',
    parts: [
      { name: 'Sense360 Core', sku: 'S360-100' },
      { name: 'Sense360 RoomIQ', sku: 'S360-200' },
      { name: 'Sense360 VentIQ', sku: 'S360-211' },
      { name: 'Sense360 PoE PSU', sku: 'S360-410' },
    ],
    channel: 'stable',
    target: 'S360-KIT-BATH-POE',
    installable: true,
  },
  {
    id: 'bath-poe-led',
    flag: 'preview',
    name: 'Bathroom PoE Kit + LED Status Ring',
    tagline: 'Preview firmware · acknowledge before install',
    desc:
      "Adds the Sense360 LED status ring to the Bathroom PoE kit. Preview firmware is experimental — you'll acknowledge the preview channel before installing.",
    parts: [
      { name: 'Sense360 Core', sku: 'S360-100' },
      { name: 'Sense360 RoomIQ', sku: 'S360-200' },
      { name: 'Sense360 VentIQ', sku: 'S360-211' },
      { name: 'Sense360 LED ring', sku: 'S360-300' },
      { name: 'Sense360 PoE PSU', sku: 'S360-410' },
    ],
    channel: 'preview',
    target: 'S360-KIT-BATH-POE-LED',
    installable: true,
    requiresPreviewAck: true,
  },
];

export const PLANNED = [
  { name: 'Bathroom Kit — Relay Fan Control', reason: 'Firmware still in development' },
  { name: 'Bathroom Kit — TRIAC Fan Control', reason: 'Mains-load safety review in progress' },
  { name: 'Duct Fan Kit — PWM Fan Control', reason: 'Firmware still in development' },
  { name: 'Duct Fan Kit — 0–10V Fan Control', reason: 'Firmware still in development' },
];

// ---- Advanced builder sections ----
// `code` is the canonical config_string power token used by buildTarget():
// USB, POE, PWR (mains). `id` matches the 1.0 engine's power identifiers
// (usbc, poe, pwr). The 240V PSU is S360-400 selected via power=pwr.
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

// `code` is the canonical config_string fan token (FanRelay, FanPWM, FanDAC,
// FanTRIAC) used by buildTarget(). TRIAC carries installable:false: it has no
// signed WebFlash build, so the builder must block it (card + Continue gate).
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

// The manifest resolves builds by config_string in the form
// `Ceiling-<POWER>-<air sensor>-<fan>-RoomIQ[-LED]`, for example
// `Ceiling-POE-VentIQ-RoomIQ`. buildTarget() emits that canonical convention so
// the preview speaks the same identifiers as the engine and the manifest.
// TODO(PR 4): replace buildTarget() with the 1.0 engine's compatible-firmware
// lookup over manifest.json (scripts/state.js). This helper only formats a
// display string; it does not resolve against the manifest and must not gate an
// install.
export function buildTarget(sel) {
  // sel: { power, sensing, fan, led }
  const parts = ['Ceiling'];
  const power = POWER.find((p) => p.id === sel.power);
  if (power && power.code) parts.push(power.code);
  const sensing = SENSING.find((s) => s.id === sel.sensing);
  // Air-quality sensors (AirIQ / VentIQ) precede the room sensor in the string.
  if (sensing && sensing.id !== 'roomiq') parts.push(sensing.code);
  if (sel.fan && sel.fan !== 'none') {
    const fan = FAN.find((f) => f.id === sel.fan);
    if (fan && fan.code) parts.push(fan.code);
  }
  // Every shipped ceiling build carries RoomIQ; the preview always pairs it.
  parts.push('RoomIQ');
  if (sel.led) parts.push('LED');
  return parts.join('-');
}
