import { html, raw, esc } from '../dom.js';
import { get, post, patchApi } from '../api.js';
import { session, saveAccount, clearSession, prefs } from '../store.js';
import { icon, chev, avatar, seg, switchRow, isMe, nameOf, money, monthDay, button, badge, ago } from '../ui.js';
import { REMINDER_OPTS } from './chore-form.js';
import { pushState, enablePush, disablePush } from '../push.js';
import { applyTheme } from '../app.js';

const NOTIFS = [
  { id: 'remind', label: 'Chore reminders', desc: 'Before each of your chores is due.' },
  { id: 'overdue', label: 'Overdue nudges', desc: 'Once, the morning after a missed chore.' },
  { id: 'swaps', label: 'Swap requests', desc: 'When someone asks to swap with you.' },
  { id: 'expenses', label: 'New expenses', desc: 'When someone adds a cost you share.' },
  { id: 'weekly', label: 'Weekly summary', desc: 'Sunday evening: your week ahead.' }
];
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export default {
  title: 'House',
  tab: 'house',
  poll: true,
  async load() {
    const [acct, bills, issues, requests, push] = await Promise.all([get('/me'), get('/bills'), get('/issues?state=open'), get('/house/requests'), pushState().catch(() => 'unsupported')]);
    saveAccount(acct);
    return { bills: bills.bills, openIssues: issues.openCount, requests, push, now: issues.now };
  },
  view(ctx) {
    const d = ctx.data;
    const me = session.me, house = session.house;
    const n = session.members.length;
    const theme = prefs.get('theme', 'auto');
    const members = [...session.members].sort((a, b) => isMe(b.id) - isMe(a.id) || a.id - b.id);
    const pushText = { on: 'On for this phone', off: 'Off for this phone', denied: 'Blocked in your phone’s settings', 'needs-install': 'Add to Home Screen first', unsupported: 'Not available in this browser' }[d.push];

    return html`<main class="screen">
      <header class="page-head" style="padding-bottom:4px">
        <div class="stack"><h1 class="t1">${house.name}</h1><p class="small muted">${n} housemate${n === 1 ? '' : 's'} · Your house</p></div>
        ${me.isAdmin ? html`<button type="button" class="text-btn" data-on="rename">Rename</button>` : ''}
      </header>

      ${d.requests.requests.length ? html`<section class="section" aria-labelledby="h-requests">
        <h2 id="h-requests" class="sec-label">Join requests</h2>
        <ul class="card card-rows sep">
          ${d.requests.requests.map((r) => html`<li class="col" style="padding:14px 0;gap:10px" data-key="rq${r.id}">
            <div class="rowflex" style="gap:12px"><span class="av av-36 sys" aria-hidden="true">${r.name[0].toUpperCase()}</span>
              <span class="col grow"><span><strong class="strong">${r.name}</strong> wants to join</span>
                <span class="small muted">@${r.username} · ${ago(r.createdAt, d.now)}${r.returning ? ' · lived here before' : ''}</span></span></div>
            ${d.requests.canAnswer ? html`<div class="rowflex" style="gap:10px">
              ${button('Approve', { on: 'approve', size: 'small', args: `data-id="${r.id}" data-name="${esc(r.name)}"` })}
              ${button('Decline', { on: 'decline', variant: 'tertiary', size: 'small', args: `data-id="${r.id}" data-name="${esc(r.name)}"`, attrs: `data-confirm="Decline ${esc(r.name)}’s request?"` })}</div>`
              : html`<span class="cap muted">Waiting for an admin to answer.</span>`}
          </li>`)}
        </ul>
      </section>` : ''}

      <section class="section" aria-labelledby="h-members">
        <h2 id="h-members" class="sec-label">Housemates</h2>
        <ul class="card card-rows sep">
          ${members.map((m) => html`<li><a href="${isMe(m.id) ? '#/me' : `#/member/${m.id}`}" class="row-link">
            ${avatar(m.id, 36)}
            <span class="col grow"><span>${nameOf(m.id)}</span><span class="small muted">${m.isAdmin ? 'Admin · ' : ''}${isMe(m.id) ? 'Edit name, colour and password' : `@${m.username || ''} · Joined ${monthDay(m.joinedAt.slice(0, 10))}`}</span></span>${chev()}
          </a></li>`)}
        </ul>
        ${session.former.length ? html`<details class="note" style="padding:2px 6px"><summary style="cursor:pointer">Former housemates (${session.former.length})</summary>
          <ul class="card card-rows sep" style="margin-top:8px">${session.former.map((m) => html`<li><a href="#/member/${m.id}" class="row-link">${avatar(m.id, 32)}
            <span class="col grow"><span>${m.name}</span><span class="small muted">Left ${monthDay(m.leftAt.slice(0, 10))}</span></span>${chev()}</a></li>`)}</ul></details>` : ''}
      </section>

      <section class="section" aria-labelledby="h-invite">
        <h2 id="h-invite" class="sec-label">Invite code</h2>
        <div class="card pad-20 col" style="gap:12px">
          <span class="code-big" aria-label="Code ${house.inviteCode.split('').join(' ')}">${house.inviteCode}</span>
          <div class="rowflex">${button(ctx.state.copied ? 'Copied' : 'Copy code', { variant: 'secondary', size: 'small', on: 'copy' })}${button('Share', { variant: 'tertiary', size: 'small', on: 'share' })}</div>
          <p class="small muted">Anyone with this code can join ${house.name}.</p>
        </div>
      </section>

      <section class="section" aria-labelledby="h-history">
        <h2 id="h-history" class="sec-label">Records</h2>
        <div class="card card-rows sep">
          <a href="#/history" class="row-link tall"><span class="icon-bubble" aria-hidden="true">${icon('menu', 18)}</span>
            <span class="col grow"><span>Activity history</span><span class="small muted">Every chore, expense and swap, by everyone</span></span>${chev()}</a>
          <a href="#/issues" class="row-link tall"><span class="icon-bubble" aria-hidden="true">${icon('flag', 18)}</span>
            <span class="col grow"><span>House issues</span><span class="small muted">${d.openIssues} open · report something that needs sorting</span></span>${chev()}</a>
        </div>
      </section>

      <section class="section" aria-labelledby="h-notify">
        <h2 id="h-notify" class="sec-label">Notifications</h2>
        <div class="card card-rows sep">
          <div class="row tall" style="gap:12px">
            <span class="col grow"><span>This phone</span><span class="small ${d.push === 'on' ? 'success' : 'muted'}">${pushText}</span></span>
            ${d.push === 'on' ? html`<button type="button" class="text-btn small" data-on="testPush">Send a test</button>${button('Turn off', { variant: 'tertiary', size: 'small', on: 'pushOff' })}`
              : d.push === 'off' ? button('Turn on', { variant: 'secondary', size: 'small', on: 'pushOn' })
              : d.push === 'needs-install' ? html`<a href="#/install" class="text-btn small">How</a>` : ''}
          </div>
          ${NOTIFS.map((x) => html`<div style="padding:10px 0">${switchRow(x.label, me.prefs[x.id], 'pref', `data-id="${x.id}"`, x.desc)}</div>`)}
          <label class="picker-row"><span class="grow">Remind me</span><span class="val">${REMINDER_OPTS.find((o) => o[0] === String(me.reminderMinutes))?.[1] || '1 hour before'}</span>${chev()}
            <select data-change="remindLead" aria-label="Remind me">${REMINDER_OPTS.filter((o) => o[0] !== '' && o[0] !== '-1').map(([v, l]) => html`<option value="${v}" ${+v === me.reminderMinutes ? raw('selected') : ''}>${l}</option>`)}</select></label>
        </div>
      </section>

      <section class="section" aria-labelledby="h-bills">
        <h2 id="h-bills" class="sec-label">Recurring bills</h2>
        <ul class="card card-rows sep">
          ${d.bills.map((b) => html`<li><a href="#/bill/${b.id}" class="row-link tall">${avatar(b.payerId, 32)}
            <span class="col grow"><span>${b.title}</span>${b.payerLeft
              ? html`<span class="small danger">${nameOf(b.payerId, { you: 'name' })} left · pick a new payer</span>`
              : html`<span class="small muted">${ordinal(b.dayOfMonth)} of the month · ${nameOf(b.payerId, { you: 'You' })} ${isMe(b.payerId) ? 'pay' : 'pays'}</span>`}</span>
            <span class="right"><span class="strong">${money(b.amount)}</span><span class="cap muted">${money(b.each)} each</span></span></a></li>`)}
          <li><a href="#/bill/new" class="row-link" style="color:var(--link);min-height:52px">${icon('plus', 18)}Add a bill</a></li>
        </ul>
        <p class="note">Each bill is added to Expenses on its date and split equally.</p>
      </section>

      <section class="section" aria-labelledby="h-look">
        <h2 id="h-look" class="sec-label">Appearance</h2>
        <div class="card" style="padding:12px">${seg('theme', [{ label: 'Automatic', value: 'auto' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }], theme, 'theme', 'Appearance')}</div>
      </section>

      <section class="section" aria-labelledby="h-device">
        <h2 id="h-device" class="sec-label">This device</h2>
        <div class="card card-rows sep">
          <a href="#/install" class="row-link">${icon('share', 20)}<span class="grow">Add to Home Screen</span>${chev()}</a>
          <button type="button" class="opt" style="color:var(--danger);gap:12px" data-on="signout" data-confirm="Sign out on this phone?">${icon('close', 20)}<span>Sign out</span></button>
        </div>
      </section>
    </main>`;
  },
  actions: {
    rename: async (ctx) => {
      const name = window.prompt('House name', session.house.name);
      if (!name || name.trim() === session.house.name) return;
      saveAccount(await patchApi('/house', { name: name.trim() }));
      ctx.set({});
    },
    copy: async (ctx) => {
      try { await navigator.clipboard.writeText(session.house.inviteCode); ctx.set({ copied: true }); }
      catch { ctx.toast('Couldn’t copy. Press and hold the code instead.'); }
    },
    share: async (ctx) => {
      const url = `${location.origin}/#/join/${session.house.inviteCode}`;
      const text = `Join ${session.house.name} on Hommate. Code: ${session.house.inviteCode}`;
      if (navigator.share) { try { await navigator.share({ title: 'Hommate', text, url }); } catch { /* cancelled */ } }
      else { try { await navigator.clipboard.writeText(`${text}\n${url}`); ctx.toast('Invite link copied.'); } catch { ctx.toast(url); } }
    },
    pref: async (ctx, el) => {
      const id = el.dataset.id;
      const next = !session.me.prefs[id];
      session.me.prefs[id] = next; ctx.set({});
      saveAccount(await patchApi('/me', { prefs: { [id]: next } }));
    },
    remindLead: async (ctx, el) => { saveAccount(await patchApi('/me', { reminderMinutes: +el.value })); ctx.set({}); },
    pushOn: async (ctx) => { ctx.data.push = await enablePush(); ctx.set({}); ctx.toast('Notifications are on for this phone.'); },
    pushOff: async (ctx) => { ctx.data.push = await disablePush(); ctx.set({}); },
    testPush: async (ctx) => { await post('/push/test'); ctx.toast('Sent. It should arrive in a few seconds.'); },
    theme: (ctx, el) => { prefs.set('theme', el.dataset.value); applyTheme(); ctx.set({}); },
    approve: async (ctx, el) => {
      await post(`/house/requests/${el.dataset.id}/approve`);
      ctx.toast(`${el.dataset.name} is in. They’ll pick a colour next.`);
      await ctx.reload();
    },
    decline: async (ctx, el) => {
      await post(`/house/requests/${el.dataset.id}/decline`);
      ctx.toast(`Declined ${el.dataset.name}’s request.`);
      await ctx.reload();
    },
    signout: async (ctx) => {
      await post('/logout').catch(() => {});
      await disablePush().catch(() => {});
      clearSession();
      ctx.go('#/welcome', true);
    }
  }
};
