/* @ds-bundle: {"format":4,"namespace":"Lumen","components":[{"name":"Button"},{"name":"TextLink"},{"name":"NavBar"},{"name":"HeroTile"},{"name":"Card"},{"name":"SegmentedControl"},{"name":"Switch"},{"name":"TextField"},{"name":"Badge"}]} */
(function () {
  var React = window.React, h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function assign(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function omit(p, keys) { var o = {}; for (var k in p) if (keys.indexOf(k) < 0) o[k] = p[k]; return o; }
  var ICONS = {
    'chevron-right': [['path', { d: 'M9.5 5.5 16 12l-6.5 6.5' }]],
    'chevron-down': [['path', { d: 'M5.5 9.5 12 16l6.5-6.5' }]],
    search: [['circle', { cx: 10.5, cy: 10.5, r: 6 }], ['path', { d: 'm15 15 5 5' }]],
    bag: [['path', { d: 'M5 8.5h14l-1 11.5H6z' }], ['path', { d: 'M8.75 8.5V7a3.25 3.25 0 0 1 6.5 0v1.5' }]],
    close: [['path', { d: 'm6.5 6.5 11 11M17.5 6.5l-11 11' }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
    'arrow-up-right': [['path', { d: 'M8 16 16 8M9.5 8H16v6.5' }]],
    info: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 11v5.5' }], ['circle', { cx: 12, cy: 7.75, r: 0.6, fill: 'currentColor', stroke: 'none' }]]
  };
  function Icon(p) {
    var parts = ICONS[p.name] || [];
    return h('svg', { viewBox: '0 0 24 24', width: p.size || 24, height: p.size || 24, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: p.className },
      parts.map(function (s, i) { return h(s[0], assign(s[1], { key: i })); }));
  }
  function Button(p) {
    var variant = p.variant || 'primary', size = p.size || 'medium';
    var rest = omit(p, ['variant', 'size', 'className', 'children', 'href']);
    return h(p.href ? 'a' : 'button', assign(rest, { href: p.href, className: cx('lm-btn', 'lm-btn-' + variant, 'lm-btn-' + size, p.className) }), p.children);
  }
  function TextLink(p) {
    var rest = omit(p, ['external', 'className', 'children']);
    return h('a', assign(rest, { className: cx('lm-link', p.className) }), p.children, h(Icon, { name: p.external ? 'arrow-up-right' : 'chevron-right', size: 14 }));
  }
  function NavBar(p) {
    var links = p.links || [];
    return h('nav', { className: 'lm-nav', 'aria-label': 'Main' },
      h('div', { className: 'lm-nav-inner' },
        h('a', { className: 'lm-nav-brand', href: p.brandHref || '#' }, p.brand),
        h('ul', { className: 'lm-nav-links' }, links.map(function (l, i) {
          return h('li', { key: i }, h('a', { href: l.href || '#', 'aria-current': l.current ? 'page' : undefined }, l.label));
        })),
        h('div', { className: 'lm-nav-tools' },
          p.onSearch !== false ? h('button', { type: 'button', 'aria-label': 'Search', onClick: p.onSearch || undefined }, h(Icon, { name: 'search', size: 16 })) : null,
          p.onBag ? h('button', { type: 'button', 'aria-label': 'Bag', onClick: p.onBag }, h(Icon, { name: 'bag', size: 16 })) : null)));
  }
  function HeroTile(p) {
    var tone = p.tone || 'default';
    return h('section', { className: cx('lm-hero', tone !== 'default' && 'lm-hero-' + tone, p.className) },
      p.eyebrow ? h('p', { className: 'lm-hero-eyebrow' }, p.eyebrow) : null,
      h('h2', { className: 'lm-hero-title' }, p.title),
      p.subtitle ? h('p', { className: 'lm-hero-sub' }, p.subtitle) : null,
      (p.primary || p.secondary) ? h('div', { className: 'lm-hero-ctas' },
        p.primary ? h(Button, { variant: 'primary', href: p.primary.href, onClick: p.primary.onClick }, p.primary.label) : null,
        p.secondary ? h(Button, { variant: 'secondary', href: p.secondary.href, onClick: p.secondary.onClick }, p.secondary.label) : null) : null,
      p.children ? h('div', { className: 'lm-hero-media' }, p.children) : null);
  }
  function Card(p) {
    var rest = omit(p, ['eyebrow', 'title', 'body', 'media', 'footer', 'className', 'children', 'interactive']);
    return h('article', assign(rest, { className: cx('lm-card', p.interactive && 'lm-card-interactive', p.className) }),
      p.eyebrow ? h('span', { className: 'lm-card-eyebrow' }, p.eyebrow) : null,
      h('h3', { className: 'lm-card-title' }, p.title),
      p.body ? h('p', { className: 'lm-card-body' }, p.body) : null,
      p.children,
      p.media ? h('div', { className: 'lm-card-media' }, p.media) : null,
      p.footer ? h('div', { className: 'lm-card-footer' }, p.footer) : null);
  }
  var fid = 0;
  function SegmentedControl(p) {
    var opts = p.options || [], variant = p.variant || 'pill';
    var st = React.useState(p.defaultValue != null ? p.defaultValue : (opts[0] && opts[0].value));
    var value = p.value != null ? p.value : st[0];
    var sel = -1; opts.forEach(function (o, i) { if (o.value === value) sel = i; });
    function pick(v) { if (p.value == null) st[1](v); if (p.onChange) p.onChange(v); }
    function onKey(e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d || !opts.length) return; e.preventDefault();
      var n = (Math.max(sel, 0) + d + opts.length) % opts.length; pick(opts[n].value);
      var btns = e.currentTarget.querySelectorAll('[role=radio]'); if (btns[n]) btns[n].focus();
    }
    var inset = variant === 'inset';
    return h('div', { className: cx('lm-seg', inset && 'lm-seg-inset', p.className), role: 'radiogroup', 'aria-label': p.label, onKeyDown: onKey },
      inset && sel >= 0 ? h('span', { className: 'lm-seg-thumb', 'aria-hidden': true, style: { width: 'calc((100% - 4px) / ' + opts.length + ')', transform: 'translateX(' + (sel * 100) + '%)' } }) : null,
      opts.map(function (o, i) {
        var on = i === sel;
        return h('button', { key: o.value, type: 'button', role: 'radio', tabIndex: on || (sel < 0 && i === 0) ? 0 : -1, className: cx('lm-seg-opt', inset && (on || i - 1 === sel) && 'lm-seg-nodiv'), 'aria-checked': String(on), onClick: function () { pick(o.value); } }, o.label);
      }));
  }
  function Switch(p) {
    var st = React.useState(!!p.defaultChecked);
    var on = p.checked != null ? !!p.checked : st[0];
    function flip() { if (p.disabled) return; var n = !on; if (p.checked == null) st[1](n); if (p.onChange) p.onChange(n); }
    var ref = React.useRef(null); if (!ref.current) ref.current = 'lm-s-' + (++fid);
    var id = p.id || ref.current;
    var sw = h('button', { id: id, type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': p.label ? undefined : p['aria-label'], 'aria-labelledby': p.label ? id + '-l' : undefined, disabled: p.disabled, onClick: function (e) { e.stopPropagation(); flip(); },
        className: cx('lm-switch', p.tone === 'accent' && 'lm-switch-accent', p.size === 'small' && 'lm-switch-small', !p.label && p.className) },
      p.showLabels ? h('span', { className: 'lm-switch-glyph lm-switch-glyph-on', 'aria-hidden': true }) : null,
      p.showLabels ? h('span', { className: 'lm-switch-glyph lm-switch-glyph-off', 'aria-hidden': true }) : null,
      h('span', { className: 'lm-switch-knob', 'aria-hidden': true }));
    if (!p.label) return sw;
    return h('div', { className: cx('lm-switch-row', p.fullWidth && 'lm-switch-full', p.disabled && 'lm-switch-disabled', p.className), onClick: flip },
      h('span', { id: id + '-l' }, p.label), sw);
  }
  function TextField(p) {
    var ref = React.useRef(null); if (!ref.current) ref.current = 'lm-f-' + (++fid);
    var id = p.id || ref.current, msg = p.error || p.helper;
    var rest = omit(p, ['label', 'helper', 'error', 'className', 'id']);
    return h('div', { className: cx('lm-field', p.error && 'lm-field-error', p.className) },
      h('input', assign(rest, { id: id, placeholder: ' ', 'aria-invalid': p.error ? true : undefined, 'aria-describedby': msg ? id + '-m' : undefined })),
      h('label', { className: 'lm-field-label', htmlFor: id }, p.label),
      msg ? h('div', { className: 'lm-field-msg', id: id + '-m' }, p.error ? h(Icon, { name: 'info', size: 14 }) : null, msg) : null);
  }
  function Badge(p) {
    var tone = p.tone || 'highlight';
    var icon = tone === 'success' ? 'check' : tone === 'danger' ? 'info' : null;
    return h('span', { className: cx('lm-badge', 'lm-badge-' + tone, p.className) }, icon ? h(Icon, { name: icon, size: 14 }) : null, p.children);
  }
  window.Lumen = assign(window.Lumen || {}, { Button: Button, TextLink: TextLink, NavBar: NavBar, HeroTile: HeroTile, Card: Card, SegmentedControl: SegmentedControl, Switch: Switch, TextField: TextField, Badge: Badge, Icon: Icon });
})();
