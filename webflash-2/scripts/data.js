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
export const POWER = [
  { id: 'usbc', name: 'USB-C', sku: '—', desc: 'Standard USB-C power connection.', code: 'USBC' },
  { id: 'poe', name: 'Sense360 PoE PSU', sku: 'S360-410', desc: 'Power over Ethernet module.', code: 'POE' },
  { id: '240v', name: 'Sense360 240V PSU', sku: 'S360-420', desc: 'External mains power module.', code: '240V' },
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

export const FAN = [
  { id: 'none', name: 'No fan / switching', sku: '—', code: 'None', desc: 'No fan or switching driver installed.', req: [], conflicts: [] },
  { id: 'relay', name: 'Sense360 Relay', sku: 'S360-310', code: 'Relay', desc: 'On/off relay for bathroom fans.', req: ['Core R4', 'S360-Relay-C'], conflicts: [] },
  { id: 'pwm', name: 'Sense360 PWM', sku: 'S360-311', code: 'PWM', desc: '12V PWM fan driver, up to 4 fans with tach feedback.', req: ['Core R4', '12vFan_PWM'], conflicts: [] },
  { id: 'dac', name: 'Sense360 DAC', sku: 'S360-312', code: 'DAC', desc: '0–10V analog fan driver (e.g. Cloudlift S12).', req: ['Core R4', 'Fan_GP8403'], conflicts: ['airiq'] },
  { id: 'triac', name: 'Sense360 TRIAC', sku: 'S360-320', code: 'TRIAC', desc: 'Phase dimmer for a mains fan or lamp.', req: ['Core R4', 'TRIAC_Board'], conflicts: [], advancedWarn: true, installable: false },
];

export const LED = { id: 'led', name: 'Sense360 LED ring', sku: 'S360-300', code: 'LED', desc: 'Visual feedback ring with optional microphone for voice-enabled cores.', req: ['Core R4', 'J11 data', 'J12 power'] };

// ---- Readiness checks (preflight) ----
export const CHECKS = [
  { id: 'browser', name: 'Browser support', okSub: 'Chrome 124 · Web Serial available', waitSub: 'Checking Web Serial support…' },
  { id: 'secure', name: 'Secure context', okSub: 'Served over HTTPS', waitSub: 'Verifying secure origin…' },
  { id: 'manifest', name: 'Firmware manifest', okSub: 'Up to date · checked just now', waitSub: 'Fetching latest manifest…' },
  { id: 'verify', name: 'Firmware verification', okSub: 'Signature valid · ed25519 dev-2026-01', waitSub: 'Verifying signature…' },
];

export function buildTarget(sel) {
  // sel: { power, sensing, fan, led }
  const parts = ['S360', 'CEIL'];
  const pw = (POWER.find((p) => p.id === sel.power) || {}).code;
  if (pw) parts.push(pw);
  const sn = (SENSING.find((s) => s.id === sel.sensing) || {}).code;
  if (sn) parts.push(sn);
  if (sel.fan && sel.fan !== 'none') {
    const fn = (FAN.find((f) => f.id === sel.fan) || {}).code;
    if (fn) parts.push(fn);
  }
  if (sel.led) parts.push('LED');
  return parts.join('-').toUpperCase();
}
