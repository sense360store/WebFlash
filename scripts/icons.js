/* WebFlash 2.0 — icon set (stroke, 24x24), ported 1:1 from the design's ui.jsx.
   icon(name, { cls, size, style }) returns a live <svg> element. */
import { fromHTML } from './h.js';

/* Simple stroke icons: parent gets fill=none, stroke=currentColor, sw=1.75. */
const STROKE = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  arrowR: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  arrowL: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><line x1="12" y1="19.5" x2="12.01" y2="19.5"/><path d="M2 9a15 15 0 0 1 20 0"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  spinner: '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9"/>',
  usb: '<circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none"/><path d="M12 18.5V5"/><polyline points="8.5 8 12 4.5 15.5 8"/><path d="M8 13l-2.5 1.5v2"/><circle cx="5.5" cy="16.5" r="1.2" fill="currentColor" stroke="none"/><path d="M16 11l2.5-1.5V7"/><rect x="16.8" y="4.6" width="3.2" height="2.6" rx="0.5" fill="currentColor" stroke="none"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  life: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.9" y1="4.9" x2="9.2" y2="9.2"/><line x1="14.8" y1="14.8" x2="19.1" y2="19.1"/><line x1="14.8" y1="9.2" x2="19.1" y2="4.9"/><line x1="9.2" y1="14.8" x2="4.9" y2="19.1"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>',
  download: '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>',
  edit: '<path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/>',
  // REPO-CUSTOMER-READY-001 S9 — the mobile / unsupported handoff "copy link"
  // affordance (two overlapping sheets, the conventional copy glyph).
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  // WF2-SHELL-FULLPAGE-001 — the v3 theme toggle uses a stroked crescent moon
  // (the design's ui.jsx Ic.moon), replacing the previous filled-glyph moon.
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
};

/* Filled / custom-attribute icons stored as complete <svg> markup. */
const RAW = {
  sun:
    '<svg viewBox="0 0 24 24" fill="none">' +
    '<circle cx="12" cy="12" r="4.1" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<line x1="12" y1="2.4" x2="12" y2="4.6"/><line x1="12" y1="19.4" x2="12" y2="21.6"/>' +
    '<line x1="2.4" y1="12" x2="4.6" y2="12"/><line x1="19.4" y1="12" x2="21.6" y2="12"/>' +
    '<line x1="5.2" y1="5.2" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="18.8" y2="18.8"/>' +
    '<line x1="5.2" y1="18.8" x2="6.8" y2="17.2"/><line x1="17.2" y1="6.8" x2="18.8" y2="5.2"/>' +
    '</g></svg>',
};

function markup(name) {
  if (RAW[name]) return RAW[name];
  const body = STROKE[name];
  if (body == null) throw new Error(`Unknown icon: ${name}`);
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>'
  );
}

export function icon(name, { cls = '', size, style } = {}) {
  const svg = fromHTML(markup(name));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (cls) svg.setAttribute('class', cls);
  if (size != null) {
    svg.style.width = `${size}px`;
    svg.style.height = `${size}px`;
  }
  if (style) Object.assign(svg.style, style);
  return svg;
}
