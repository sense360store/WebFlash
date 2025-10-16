// Lightweight observer that reads choices from the existing DOM.
// Works out-of-the-box with radios/selects; easy to wire later if you add a central store.
(function () {
  const state = {
    mount: null,   // 'wall' | 'ceiling'
    power: null,   // 'usb' | 'poe' | 'pwr'
    airiq: null,   // 'none' | 'base' | 'pro'
    presence: null,// 'none' | 'base' | 'pro'
    comfort: null, // 'none' | 'base'
    fan: null      // 'none' | 'pwm' | 'analog'
  };

  const listeners = new Set();
  function emit() { listeners.forEach(fn => fn(get())); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function get() { return JSON.parse(JSON.stringify(state)); }

  // Try to infer from typical controls in each step
  function scan() {
    // Mounting
    state.mount = pick('#step1, [data-step="1"], section:has(h2:contains("Mounting"))',
      { 'Wall': 'wall', 'Ceiling': 'ceiling' });
    // Power
    state.power = pick('#step2, [data-step="2"], section:has(h2:contains("Power"))',
      { 'USB': 'usb', 'POE': 'poe', 'PWR': 'pwr' });
    // Modules
    state.airiq    = pickByGroup('AirIQ',    { 'None':'none','Base':'base','Pro':'pro' });
    state.presence = pickByGroup('Presence', { 'None':'none','Base':'base','Pro':'pro' });
    state.comfort  = pickByGroup('Comfort',  { 'None':'none','Base':'base' });
    state.fan      = pickByGroup('Fan',      { 'None':'none','PWM':'pwm','Analog':'analog' });
    emit();
  }

  // Helpers: detect checked radio/selected buttons within a container
  function pick(containerSelector, map) {
    const c = bestContainer(containerSelector);
    if (!c) return null;
    // radios first
    const checked = c.querySelector('input[type="radio"]:checked');
    if (checked) return normalize(checked.value, map);
    // buttons/toggles with aria-pressed or selected class
    const pressed = c.querySelector('[aria-pressed="true"], .selected, .active');
    if (pressed) return normalize(text(pressed), map);
    // fallback: look for visually selected option markup
    const chosen = [...c.querySelectorAll('button, [role="radio"], .option')].find(el => el.getAttribute('data-selected') === 'true');
    if (chosen) return normalize(text(chosen), map);
    return null;
  }

  function pickByGroup(groupTitle, map) {
    const group = findGroupByHeading(groupTitle);
    if (!group) return null;
    const checked = group.querySelector('input[type="radio"]:checked');
    if (checked) return normalize(checked.value, map);
    const pressed = group.querySelector('[aria-pressed="true"], .selected, .active');
    if (pressed) return normalize(text(pressed), map);
    return null;
  }

  function bestContainer(sel) {
    try {
      const selectors = sel.split(',').map(s => s.trim()).filter(Boolean);
      for (const selector of selectors) {
        const found = querySelectorWithHasContains(selector);
        if (found) return found;
      }
    } catch {
      // ignore selector parsing issues
    }
    return null;
  }

  function querySelectorWithHasContains(selector) {
    if (!selector.includes(':has(')) {
      return document.querySelector(selector) || null;
    }

    const [baseSelector, rest] = selector.split(':has(');
    const innerSelector = rest.slice(0, -1); // remove trailing ')'
    const candidates = document.querySelectorAll(baseSelector || '*');
    for (const candidate of candidates) {
      if (elementHas(candidate, innerSelector)) {
        return candidate;
      }
    }
    return null;
  }

  function elementHas(element, innerSelector) {
    const containsMatch = innerSelector.match(/^(.*?):contains\((['"])(.*)\2\)$/);
    if (containsMatch) {
      const [, base, , textValue] = containsMatch;
      const trimmedBase = base.trim();
      const query = trimmedBase ? trimmedBase : '*';
      return Array.from(element.querySelectorAll(query)).some(child =>
        child.textContent && child.textContent.trim().toLowerCase().includes(textValue.trim().toLowerCase())
      );
    }
    return Boolean(element.querySelector(innerSelector));
  }

  function findGroupByHeading(title) {
    const headings = [...document.querySelectorAll('h3, h4, h5')];
    const lowerTitle = title.toLowerCase();
    const heading = headings.find(h => h.textContent && h.textContent.trim().toLowerCase().includes(lowerTitle));
    return heading ? heading.closest('section, fieldset, div') : null;
  }
  function normalize(labelOrValue, map) {
    if (!labelOrValue) return null;
    const s = String(labelOrValue).toLowerCase();
    for (const [k,v] of Object.entries(map)) {
      if (s.includes(k.toLowerCase())) return v;
    }
    const vals = Object.values(map);
    return vals.includes(s) ? s : null;
  }
  function text(el) { return (el.getAttribute('data-value') || el.textContent || '').trim(); }

  // Mutation observer to rescan when UI changes
  const mo = new MutationObserver(() => queueMicrotask(scan));
  if (document.body) {
    mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: false });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: false });
    });
  }

  // Also listen to common user events
  document.addEventListener('change', scan, true);
  document.addEventListener('click', scan, true);

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  window.WizardState = { get, onChange, rescan: scan };
})();
