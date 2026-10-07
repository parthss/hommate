// Hommate PWA: hash router and the small screen runtime every page uses.
import { html, patch, esc } from './dom.js';
import { session, loadSession, prefs, saveAccount, gate } from './store.js';
import { ApiError, get } from './api.js';
import { tabbar } from './ui.js';
import { registerSW } from './push.js';

import Welcome from './screens/welcome.js';
import { SignUp, LogIn, Start, CreateHouse, JoinHouse, Waiting, ProfileStep, Install } from './screens/onboarding.js';
import Today from './screens/today.js';
import Activity from './screens/activity.js';
import Chores from './screens/chores.js';
import Rota from './screens/rota.js';
import ChoreDetail from './screens/chore-detail.js';
import ChoreForm from './screens/chore-form.js';
import Expenses from './screens/expenses.js';
import ExpenseDetail from './screens/expense-detail.js';
import ExpenseForm from './screens/expense-form.js';
import SettleUp from './screens/settle.js';
import House from './screens/house.js';
import History from './screens/history.js';
import Issues from './screens/issues.js';
import IssueDetail from './screens/issue-detail.js';
import IssueForm from './screens/issue-form.js';
import BillForm from './screens/bill-form.js';
import { EditProfile, ChangePassword } from './screens/me.js';
import MemberDetail from './screens/member.js';

// Access: 'public' (signed out), 'account' (signed in, getting into a house), or the default:
// a full member of a house.
const ROUTES = [
  ['/welcome', Welcome, 'public'], ['/signup', SignUp, 'public'], ['/login', LogIn, 'public'],
  ['/start', Start, 'account'], ['/create', CreateHouse, 'account'], ['/join', JoinHouse, 'account'], ['/join/:code', JoinHouse, 'account'],
  ['/waiting', Waiting, 'account'], ['/about-you', ProfileStep, 'account'], ['/password', ChangePassword, 'any'],
  ['/install', Install], ['/today', Today], ['/activity', Activity],
  ['/chores', Chores], ['/rota', Rota], ['/chore/new', ChoreForm], ['/chore/:id/edit', ChoreForm], ['/chore/:id', ChoreDetail],
  ['/expenses', Expenses], ['/expense/new', ExpenseForm], ['/expense/:id/edit', ExpenseForm], ['/expense/:id', ExpenseDetail], ['/settle', SettleUp],
  ['/house', House], ['/member/:id', MemberDetail], ['/history', History], ['/issues', Issues], ['/issue/new', IssueForm], ['/issue/:id', IssueDetail],
  ['/bill/new', BillForm], ['/bill/:id', BillForm], ['/me', EditProfile]
].map(([path, screen, access]) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { path, re, keys, screen, access: access || 'member' };
});

/** Where this route should send someone instead, or null to show it. */
function redirectFor(r, params) {
  const where = gate();
  if (r.access === 'public') return session.token ? (where || '#/today') : null;
  if (!session.token) {
    if (params.code) try { sessionStorage.setItem('hommate.joinCode', params.code); } catch { /* ignore */ }
    return '#/welcome';
  }
  if (r.access === 'any') return null;
  if (r.access === 'account') {
    if (!where) return '#/today';
    if (where.startsWith('#/password')) return where;
    if (where === '#/about-you') return r.path === '/about-you' ? null : where;
    return r.path === '/about-you' ? where : null; // start / create / join / waiting
  }
  return where; // member screens
}

const root = document.getElementById('app');
let current = null; // { screen, ctx }
let pollTimer = null;

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function route() {
  const { path, query } = parseHash();
  let match = null;
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; }
  }
  if (!match) return go(session.token ? (gate() || '#/today') : '#/welcome', true);
  const redirect = redirectFor(match, match.params);
  if (redirect && redirect.split('?')[0] !== '#' + path) return go(redirect, true);

  const prev = current;
  const ctx = makeCtx(match.screen, match.params, query);
  current = { screen: match.screen, ctx };
  document.title = (typeof match.screen.title === 'function' ? match.screen.title(ctx) : match.screen.title) || 'Hommate';
  // Keep the old screen visible while the new one loads, unless it's slow.
  const slow = setTimeout(() => { if (current?.ctx === ctx) render(true); }, 250);
  try {
    if (match.screen.load) ctx.data = await match.screen.load(ctx);
    if (match.screen.init) match.screen.init(ctx);
  } catch (e) {
    ctx.error = e;
  }
  clearTimeout(slow);
  if (current?.ctx !== ctx) return; // navigated away meanwhile
  render();
  if (!prev || prev.screen !== match.screen || prev.ctx.params.id !== ctx.params.id) window.scrollTo(0, 0);
  if (match.screen.focus) setTimeout(() => root.querySelector(match.screen.focus)?.focus(), 50);
  schedulePoll();
}

function makeCtx(screen, params, query) {
  const ctx = {
    params, query, data: null, state: {}, error: null,
    set(patch) { Object.assign(ctx.state, typeof patch === 'function' ? patch(ctx.state) : patch); if (current?.ctx === ctx) render(); },
    async reload() {
      if (!screen.load) return render();
      try { ctx.data = await screen.load(ctx); ctx.error = null; } catch (e) { if (!ctx.data) ctx.error = e; else throw e; }
      if (current?.ctx === ctx) render();
    },
    go, toast,
    refreshSession: refreshSession
  };
  return ctx;
}

function render(loading = false) {
  if (!current) return;
  const { screen, ctx } = current;
  let body;
  if (ctx.error && !ctx.data) body = errorView(ctx.error);
  else if (!ctx.data && screen.load) body = loading ? html`<main class="screen"><div class="skeleton"></div><div class="skeleton"></div></main>` : html``;
  else {
    try { body = screen.view(ctx); }
    catch (e) { console.error(e); body = errorView(e); }
  }
  const tab = screen.tab ? tabbar(screen.tab, { dot: !!session.bellDot && screen.tab !== 'today' }) : '';
  patch(root, html`${body}${tab}`);
}

function errorView(e) {
  const offline = e instanceof ApiError && e.status === 0;
  return html`<main class="screen no-tabs">
    <div class="card empty" style="margin-top:40px">
      <span class="t2">${offline ? 'You’re offline.' : 'That didn’t load.'}</span>
      <span class="muted">${e.message || 'Something went wrong.'}</span>
      <div class="rowflex" style="margin-top:12px"><button class="lm-btn lm-btn-primary lm-btn-medium" data-global="retry">Try again</button>
      <a class="lm-btn lm-btn-tertiary lm-btn-medium" href="#/today">Go to Today</a></div>
    </div></main>`;
}

export function go(hash, replace = false) {
  if (replace) { history.replaceState(null, '', hash); route(); }
  else if (location.hash === hash) route();
  else location.hash = hash;
}

// ---- Events: elements declare data-on / data-input / data-change / data-submit ----
async function runAction(name, el, ev) {
  if (!current) return;
  const { screen, ctx } = current;
  const fn = screen.actions?.[name];
  if (!fn) return console.warn('No action', name);
  try {
    await fn(ctx, el, ev);
  } catch (e) {
    toast(e.message || 'Something went wrong.', { error: true });
    if (!(e instanceof ApiError)) console.error(e);
  }
}

root.addEventListener('click', (ev) => {
  const g = ev.target.closest('[data-global]');
  if (g?.dataset.global === 'retry') { ev.preventDefault(); return route(); }
  const el = ev.target.closest('[data-on]');
  if (!el || el.disabled) return;
  ev.preventDefault();
  if (el.dataset.confirm && !window.confirm(el.dataset.confirm)) return;
  runAction(el.dataset.on, el, ev);
});
root.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-input]');
  if (el) runAction(el.dataset.input, el, ev);
});
root.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-change]');
  if (el) runAction(el.dataset.change, el, ev);
});
root.addEventListener('submit', (ev) => {
  const el = ev.target.closest('[data-submit]');
  if (el) { ev.preventDefault(); runAction(el.dataset.submit, el, ev); }
});
root.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('input[data-enter]')) { ev.preventDefault(); runAction(ev.target.dataset.enter, ev.target, ev); }
  if (ev.key === 'Escape' && current?.ctx.state.sheet) current.ctx.set({ sheet: null });
});

// Swipe left on a chore row to reveal "Done" (Chores screen).
let drag = null;
root.addEventListener('pointerdown', (ev) => {
  const body = ev.target.closest('[data-swipe]');
  if (!body || ev.target.closest('button,a') && ev.target.closest('button')) return;
  drag = { body, x: ev.clientX, y: ev.clientY, dx: 0, start: body.dataset.open === '1' ? -88 : 0, moved: false };
});
root.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (!drag.moved && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
  if (Math.abs(dx) > 6) drag.moved = true;
  if (!drag.moved) return;
  drag.dx = Math.min(0, Math.max(-120, drag.start + dx));
  drag.body.classList.add('dragging');
  drag.body.style.transform = `translateX(${drag.dx}px)`;
});
const endDrag = (ev) => {
  if (!drag) return;
  const d = drag; drag = null;
  d.body.classList.remove('dragging');
  d.body.style.transform = '';
  if (!d.moved) return;
  const open = d.dx < -50;
  runAction(d.body.dataset.swipe, d.body, { open });
  // swallow the click that follows a drag
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  root.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 350);
};
root.addEventListener('pointerup', endDrag);
root.addEventListener('pointercancel', () => { if (drag) { drag.body.style.transform = ''; drag.body.classList.remove('dragging'); drag = null; } });

// ---- Toasts ----
let toastTimer = null;
export function toast(message, { undo, error = false, ms = 4000 } = {}) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = 'toast' + (error ? ' error' : '');
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = async () => { el.hidden = true; try { await undo(); } catch (e) { toast(e.message, { error: true }); } };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? Math.max(ms, 6000) : ms);
}

// ---- Keep data fresh ----
function schedulePoll() {
  clearInterval(pollTimer);
  if (!current?.screen.poll) return;
  pollTimer = setInterval(() => softRefresh(), 30_000);
}
function softRefresh() {
  if (!current || document.hidden || current.ctx.state.sheet || current.ctx.state.busy) return;
  if (root.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) return;
  current.ctx.reload().catch(() => {});
  refreshBell();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { softRefresh(); refreshSession(); } });

async function refreshBell() {
  if (!session.token || gate()) return;
  try {
    const t = await get('/today');
    const dot = t.bell.unseen > 0 || t.bell.swapsForMe > 0;
    if (dot !== !!session.bellDot) { session.bellDot = dot; render(); }
  } catch { /* offline */ }
}

/** Re-read the account (house, housemates, requests) and move on if our situation changed. */
export async function refreshSession() {
  if (!session.token) return;
  try {
    const before = gate();
    saveAccount(await get('/account'));
    const after = gate();
    if (after !== before) go(after || '#/today', true);
  } catch { /* offline: keep cached */ }
}

// ---- Theme ----
const media = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const pref = prefs.get('theme', 'auto');
  const dark = pref === 'dark' || (pref === 'auto' && media.matches);
  document.documentElement.className = dark ? 'lm-dark' : 'lm-light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161617' : '#f5f5f7');
}
media.addEventListener?.('change', applyTheme);

// ---- Offline banner ----
function offlineBanner() {
  let el = document.getElementById('offline');
  if (navigator.onLine) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'offline'; el.className = 'offline-bar'; el.textContent = 'Offline. Changes need a connection to the house server.'; document.body.appendChild(el); }
}
window.addEventListener('online', () => { offlineBanner(); softRefresh(); });
window.addEventListener('offline', offlineBanner);

// ---- Start ----
applyTheme();
loadSession();
offlineBanner();
window.addEventListener('hashchange', route);
route();
registerSW();
if (session.token) { refreshSession(); refreshBell(); }

// The service worker asks us to navigate when a notification is tapped.
navigator.serviceWorker?.addEventListener('message', (ev) => {
  if (ev.data?.type === 'navigate' && ev.data.url) go(ev.data.url);
  if (ev.data?.type === 'refresh') softRefresh();
});
