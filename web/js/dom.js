// A tiny rendering layer: screens return HTML from the `html` template tag, and `patch`
// updates the page in place (so typing in an input never loses focus on re-render).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

function str(v) {
  if (v == null || v === false) return '';
  if (v === true) return 'true'; // for aria-checked="${on}" style attributes
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(str).join('');
  return esc(v);
}

/** html`<p>${text}</p>` escapes values; nested html`` and arrays are kept as markup. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += str(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/** Render markup into `root`, reusing existing DOM nodes where possible. */
export function patch(root, markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(markup);
  morphChildren(root, tpl.content);
}

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

function same(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  if (a.tagName !== b.tagName) return false;
  if (a.tagName === 'INPUT' && a.type !== (b.getAttribute('type') || 'text')) return false;
  return keyOf(a) === keyOf(b);
}

function morphChildren(from, to) {
  const toNodes = [...to.childNodes];
  const keyed = new Map();
  for (const n of from.childNodes) { const k = keyOf(n); if (k) keyed.set(k, n); }
  let i = 0;
  for (const next of toNodes) {
    const cur = from.childNodes[i] || null;
    const k = keyOf(next);
    let match = null;
    if (k && keyed.has(k)) { match = keyed.get(k); keyed.delete(k); }
    else if (cur && !keyOf(cur) && same(cur, next)) match = cur;
    if (match) {
      if (match !== cur) from.insertBefore(match, cur);
      update(match, next);
    } else {
      from.insertBefore(next, cur);
    }
    i++;
  }
  while (from.childNodes.length > toNodes.length) from.removeChild(from.lastChild);
}

function update(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  // attributes
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  // form state: never fight the person typing
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') {
    const v = b.tagName === 'TEXTAREA' ? b.textContent : b.getAttribute('value') ?? '';
    if (document.activeElement !== a && a.value !== v && a.type !== 'file') a.value = v;
    if (a.tagName === 'SELECT') {
      const sel = b.querySelector('option[selected]');
      morphChildren(a, b);
      if (sel && document.activeElement !== a) a.value = sel.getAttribute('value');
      return;
    }
    if (a.tagName === 'TEXTAREA') return;
  }
  morphChildren(a, b);
}
