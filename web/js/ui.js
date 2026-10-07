// Shared UI pieces: icons, avatars, Lumen components and formatting.
import { html, raw } from './dom.js';
import { session } from './store.js';

// ---- Icons (24px grid, 1.5 stroke, from the designs) ----
const P = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  house: '<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
  chores: '<path d="m4 7 2 2 3.5-3.5M12 7.5h8M4 16l2 2 3.5-3.5M12 16.5h8"/>',
  today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.5"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  smell: '<path d="M8 20c0-2 2-2.5 2-4.5S8 13 8 11M12 20c0-2 2-2.5 2-4.5S12 13 12 11M16 20c0-2 2-2.5 2-4.5S16 13 16 11"/><path d="M6 7.5h12"/>',
  redo: '<path d="M4.5 9.5A8 8 0 1 1 4 14"/><path d="M4 4.5v5h5"/>',
  bubble: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5z"/>',
  repeat: '<path d="m17 2.5 3 3-3 3"/><path d="M4 11.5v-2a4 4 0 0 1 4-4h12"/><path d="m7 21.5-3-3 3-3"/><path d="M20 12.5v2a4 4 0 0 1-4 4H4"/>',
  swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.75" r="0.6" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7"/>',
  arrow: '<path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
  share: '<path d="M12 3.5v11"/><path d="m8 7.5 4-4 4 4"/><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>',
  dots: '<circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/>',
  menu: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  camera: '<path d="M4.5 8h3l1.5-2.5h6L16.5 8h3A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-9A1.5 1.5 0 0 1 4.5 8z"/><circle cx="12" cy="13.5" r="3.5"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>'
};
export const icon = (name, size = 24, stroke = 1.5, cls = '') =>
  raw(`<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);
export const chev = () => raw(`<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P.chevron}</svg>`);

// ---- People ----
/** Current or former housemate by id. */
export const member = (id) => session.members.find((m) => m.id === id) || session.former?.find((m) => m.id === id) || null;
export const isMe = (id) => id != null && id === session.me?.id;
/** "Maya (you)" style full name, or "You" when short. People who've left show as "Sam (left)". */
export function nameOf(id, { you = 'full' } = {}) {
  const m = member(id);
  if (!m) return 'Someone';
  if (isMe(id)) return you === 'full' ? `${m.name} (you)` : you === 'You' ? 'You' : you === 'you' ? 'you' : m.name;
  return m.left ? `${m.name} (left)` : m.name;
}
export function avatar(id, size = 32, extra = '') {
  const m = member(id);
  const label = m ? m.name : '?';
  return html`<span class="av av-${size} ${extra}" style="background:${m ? m.color : 'var(--fill)'}" aria-hidden="true">${label.charAt(0).toUpperCase()}</span>`;
}

// ---- Lumen components ----
export const button = (label, { variant = 'primary', size = 'medium', on, href, attrs = '', cls = '', disabled = false, args = '' } = {}) => href
  ? html`<a class="lm-btn lm-btn-${variant} lm-btn-${size} ${cls}" href="${href}" ${raw(attrs)}>${label}</a>`
  : html`<button type="button" class="lm-btn lm-btn-${variant} lm-btn-${size} ${cls}" ${on ? raw(`data-on="${on}"`) : ''} ${raw(args)} ${disabled ? raw('disabled') : ''} ${raw(attrs)}>${label}</button>`;

export const badge = (label, tone = 'neutral', withIcon = true) => html`<span class="lm-badge lm-badge-${tone}">${withIcon && tone === 'success' ? icon('check', 14) : ''}${withIcon && tone === 'danger' ? icon('info', 14) : ''}${label}</span>`;

/** Inset segmented control. options: [{label, value}] */
export function seg(name, options, value, on, label = '') {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const w = 100 / options.length;
  return html`<div class="lm-seg lm-seg-inset seg-full" role="radiogroup" aria-label="${label || name}">
    <span class="lm-seg-thumb" style="width:calc(${w}% - ${4 / options.length}px);transform:translateX(${idx * 100}%)"></span>
    ${options.map((o, i) => html`<button type="button" role="radio" class="lm-seg-opt ${i === idx || i === idx + 1 ? 'lm-seg-nodiv' : ''}" aria-checked="${i === idx}" data-on="${on}" data-value="${o.value}">${o.label}</button>`)}
  </div>`;
}

export const switchRow = (label, on, action, args = '', desc = '') => html`
  <label class="lm-switch-row lm-switch-full">
    <span class="col grow"><span>${label}</span>${desc ? html`<span class="small muted">${desc}</span>` : ''}</span>
    <button type="button" role="switch" class="lm-switch" aria-checked="${!!on}" aria-label="${label}" data-on="${action}" ${raw(args)}>
      <span class="lm-switch-glyph lm-switch-glyph-on"></span><span class="lm-switch-glyph lm-switch-glyph-off"></span><span class="lm-switch-knob"></span>
    </button>
  </label>`;

/** Floating-label text field. */
export const field = (label, { name, value = '', type = 'text', input, attrs = '', msg = '', error = false } = {}) => html`
  <div class="lm-field ${error ? 'lm-field-error' : ''}">
    <input id="f-${name}" name="${name}" type="${type}" value="${value}" placeholder=" " ${input ? raw(`data-input="${input}"`) : ''} ${raw(attrs)}>
    <label class="lm-field-label" for="f-${name}">${label}</label>
    ${msg ? html`<span class="lm-field-msg">${error ? icon('info', 14) : ''}${msg}</span>` : ''}
  </div>`;

export const backLink = (href, label) => html`<a class="back" href="${href}">${icon('back', 20)}${label}</a>`;

export function tabbar(active, { dot = false } = {}) {
  const t = (id, href, label, ic) => html`<a href="${href}" ${active === id ? raw('aria-current="page"') : ''}>${icon(ic)}${id === 'today' && dot ? html`<span class="tab-dot" aria-label="New activity"></span>` : ''}<span>${label}</span></a>`;
  return html`<nav class="tabbar" aria-label="Main">
    ${t('today', '#/today', 'Today', 'today')}${t('chores', '#/chores', 'Chores', 'chores')}${t('expenses', '#/expenses', 'Expenses', 'receipt')}${t('house', '#/house', 'House', 'house')}
  </nav>`;
}

// ---- Formatting ----
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const utc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const wd = (d) => (new Date(utc(d)).getUTCDay() + 6) % 7;
export const addDays = (d, n) => new Date(utc(d) + n * 86400000).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export const dayShort = (d) => DAYS[wd(d)];
export const dayLong = (d) => DAYS_LONG[wd(d)];
/** 'Tue 6 Oct' */
export const dateShort = (d) => `${DAYS[wd(d)]} ${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
/** 'Tue 6 October' */
export const dateMed = (d) => `${DAYS[wd(d)]} ${+d.slice(8, 10)} ${MONTHS_LONG[+d.slice(5, 7) - 1]}`;
/** 'Monday 5 October' */
export const dateLong = (d) => `${DAYS_LONG[wd(d)]} ${+d.slice(8, 10)} ${MONTHS_LONG[+d.slice(5, 7) - 1]}`;
export const monthDay = (d) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
export function clock(t) {
  if (!t) return 'anytime';
  const h = +t.slice(0, 2), m = t.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
/** 'Today', 'Tomorrow', 'Yesterday', 'Sat' (this week) or 'Sat 17 Oct'. */
export function relDay(d, today, { long = false } = {}) {
  const n = diffDays(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n <= 6) return long ? dayLong(d) : dayShort(d);
  return dateShort(d);
}
/** When a task is due, for list rows: 'Today 7:00 pm', 'Sun 8:00 pm', 'Sat, anytime'. */
export function dueLabel(t, today) {
  const n = diffDays(today, t.dueDate);
  const day = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : (n > 1 && n <= 6) || (n < 0 && n >= -6) ? dayShort(t.dueDate) : dateShort(t.dueDate);
  return t.dueTime ? `${day} ${clock(t.dueTime)}` : `${day}, anytime`;
}
/** Activity timestamps: '25 min ago', '8:52 am', 'Yesterday', 'Sat 3 Oct'. */
export function ago(at, now) {
  if (!at) return '';
  const d = at.slice(0, 10), today = now.slice(0, 10);
  if (d === today) {
    const mins = Math.round((Date.parse(now + 'Z') - Date.parse(at + 'Z')) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return clock(at.slice(11, 16));
  }
  if (diffDays(d, today) === 1) return 'Yesterday';
  return dateShort(d);
}
export const timeOf = (at) => clock(at.slice(11, 16));

export const money = (p) => (p < 0 ? '−' : '') + '£' + (Math.abs(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** '42.6' → 4260; returns NaN when not a valid amount. */
export function pence(s) {
  const v = String(s ?? '').replace(/[£,\s]/g, '');
  if (!/^\d*(\.\d{0,2})?$/.test(v) || v === '' || v === '.') return NaN;
  return Math.round(parseFloat(v) * 100);
}
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const listJoin = (arr) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr.at(-1);
export const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Replace {target} in activity text with "you" or the person's name. */
export function fillTarget(text, targetId) {
  if (!text) return '';
  if (isMe(targetId)) return text.replace(/\{target\}’s/g, 'your').replace(/\{target\}/g, 'you');
  return text.replace(/\{target\}/g, nameOf(targetId, { you: 'name' }));
}

/** ago() for the middle of a sentence: 'just now', '25 min ago', 'at 8:52 am', 'yesterday', 'on Sat 3 Oct'. */
export function agoInline(at, now) {
  const s = ago(at, now);
  if (s === 'Just now' || s === 'Yesterday') return s.toLowerCase();
  if (/min ago$/.test(s)) return s;
  return /\d:\d\d/.test(s) ? 'at ' + s : 'on ' + s;
}
