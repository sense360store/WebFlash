/* WebFlash 2.0 — minimal hyperscript helpers.
   This is the entire "framework": a thin wrapper over document.createElement
   that lets the ported step modules build DOM trees declaratively (with inline
   event handlers) instead of pulling in React/Babel. Desktop-Chromium only,
   matching the WebFlash Web Serial target. */

/* Build an HTML element.
   props supports: class/className, style (object), dataset (object),
   on<Event> handlers (onClick, onChange, onInput… — functions only),
   boolean props (disabled/checked/hidden/autofocus), and any other
   attribute name. Children may be nodes, strings/numbers, arrays, or
   null/false/undefined (skipped). There is intentionally no raw-innerHTML
   prop: this helper only ever builds text nodes and attributes, so no
   caller can smuggle markup through it. Use fromHTML() for the handful of
   static SVG strings that need parsing. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, kids);
  return el;
}

function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (k === 'ref' && typeof v === 'function') v(el);
    else if (k.startsWith('on')) {
      // Only function handlers are honoured. A string here would otherwise
      // fall through to setAttribute('onclick', str) and become an inline
      // event handler — an injection footgun. Ignore non-function on* props.
      if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'disabled' || k === 'checked' || k === 'hidden' || k === 'autofocus') {
      el[k] = !!v;
      if (v) el.setAttribute(k, '');
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === true) continue;
    el.appendChild(kid && kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
}

/* Parse an SVG (or any) markup string into a single live element.
   <template> parses the fragment in the correct namespace context, so
   <svg> markup becomes proper SVG-namespaced nodes. */
export function fromHTML(str) {
  const tpl = document.createElement('template');
  tpl.innerHTML = str.trim();
  return tpl.content.firstElementChild;
}

/* Remove all children of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* Replace the children of a node with the given nodes. */
export function mount(node, ...kids) {
  clear(node);
  append(node, kids);
  return node;
}
