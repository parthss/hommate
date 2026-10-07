import { html, raw } from '../dom.js';
import { get, post } from '../api.js';
import { icon, badge, button, avatar, backLink, nameOf, isMe, member, dateMed, dateShort, clock, relDay, ago, agoInline, dayLong, diffDays } from '../ui.js';
import { toggleDone } from './today.js';

const REMINDERS = { '-1': 'No reminder', 0: 'At the due time', 15: '15 minutes before', 30: '30 minutes before', 60: '1 hour before', 120: '2 hours before', 180: '3 hours before', 1440: '1 day before' };

function ruleText(c) {
  const days = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const when = c.repeat === 'once' ? `Once, ${dateMed(c.startDate)}`
    : c.repeat === 'daily' ? 'Every day'
    : c.repeat === 'monthly' ? `Monthly, on day ${c.days[0]}`
    : 'Every ' + c.days.map((d) => days[d]).join(' and ');
  const parts = [`${when}${c.dueTime ? ' by ' + clock(c.dueTime) : ''}`];
  parts.push(c.mode === 'turns' ? 'Takes turns' : c.mode === 'claim' ? 'Anyone can claim' : `${nameOf(c.ownerId, { you: 'You' })} ${isMe(c.ownerId) ? 'do' : 'does'} it`);
  parts.push(c.reminderMinutes == null ? 'Your usual reminder' : c.reminderMinutes === -1 ? 'No reminder' : `Reminder ${REMINDERS[c.reminderMinutes]}`);
  return parts.join(' · ');
}

function dueText(t, today) {
  const n = diffDays(today, t.dueDate);
  const time = t.dueTime ? ', ' + clock(t.dueTime) : ', any time';
  if (t.overdue) return `Was due ${n === -1 ? 'yesterday' : dateMed(t.dueDate)}${t.dueTime ? ', ' + clock(t.dueTime) : ''}`;
  if (n === 0) return `Due today${time}`;
  if (n === 1) return `Due tomorrow, ${dateMed(t.dueDate)}${time}`;
  return `Due ${dateMed(t.dueDate)}${time}`;
}

export default {
  title: 'Chore',
  tab: 'chores',
  poll: true,
  load: (ctx) => get('/chores/' + ctx.params.id),
  init(ctx) {
    // Arriving from "Swap" on Today opens the swap sheet straight away.
    if (ctx.query.swap && ctx.data.current && isMe(ctx.data.current.assigneeId) && !ctx.data.swap) openSwap(ctx);
  },
  view(ctx) {
    const { chore: c, current: t, turns, history, justDone, swap } = ctx.data;
    const today = ctx.data.now.slice(0, 10);
    const mine = t && isMe(t.assigneeId);
    const turnLabel = !t ? 'Nothing scheduled' : !t.assigneeId ? 'Up for grabs' : mine ? 'Your turn' : c.mode === 'turns' ? `${nameOf(t.assigneeId)}’s turn` : `${nameOf(t.assigneeId)} is on it`;

    return html`<main class="screen">
      <div class="top-actions">
        ${backLink('#/chores', 'Chores')}
        ${c.archived ? '' : html`<a href="#/chore/${c.id}/edit" class="text-btn">Edit</a>`}
      </div>
      <header class="col" style="gap:4px;padding:0 6px 4px">
        <h1 class="t1">${c.title}</h1>
        <p class="small muted" style="display:flex;align-items:flex-start;gap:6px">${c.repeat !== 'once' ? html`<span style="flex:none;margin-top:3px">${icon('repeat', 14)}</span>` : ''}<span>${c.archived ? 'This chore was removed.' : ruleText(c)}</span></p>
      </header>

      ${t ? html`<section class="card pad-20 col" aria-labelledby="cd-now" style="gap:16px">
        ${justDone ? html`<div class="rowflex between">${badge(`Done ${isMe(justDone.memberId) ? 'by you' : 'by ' + nameOf(justDone.memberId)} ${agoInline(justDone.doneAt, ctx.data.now)}`, 'success')}
          <button type="button" class="lm-btn lm-btn-tertiary lm-btn-small" data-on="undo" data-id="${justDone.id}">Undo</button></div>` : ''}
        <div class="rowflex" style="gap:14px">
          ${t.assigneeId ? avatar(t.assigneeId, 52) : html`<span class="av av-52 sys" aria-hidden="true">?</span>`}
          <div class="col" style="gap:2px">
            <span class="small muted">${justDone ? 'Next up' : 'On it now'}</span>
            <h2 id="cd-now" class="t2">${justDone && mine ? 'You’re next' : turnLabel}</h2>
            <span class="small ${t.overdue ? 'danger' : 'muted'}">${dueText(t, today)}</span>
          </div>
        </div>
        ${swap ? swapBox(ctx, swap) : html`<div class="rowflex wrap" style="gap:12px">
          ${t.assigneeId ? button('Mark done', { on: 'done', args: `data-id="${t.id}"`, variant: mine || !justDone ? 'primary' : 'tertiary' }) : button('Claim it', { on: 'claim', args: `data-id="${t.id}"` })}
          ${mine && !c.archived ? button('Request swap', { variant: 'tertiary', on: 'openSwap' }) : ''}
        </div>`}
      </section>` : justDone ? html`<section class="card pad-20 rowflex between">${badge('Done', 'success')}<button type="button" class="lm-btn lm-btn-tertiary lm-btn-small" data-on="undo" data-id="${justDone.id}">Undo</button></section>` : ''}

      ${turns.length > 1 || (c.mode !== 'claim' && turns.length) ? html`<section class="card" aria-labelledby="cd-rota" style="padding:16px 16px 4px">
        <h2 id="cd-rota" class="h3" style="margin-bottom:4px">${c.mode === 'turns' ? 'Turn order' : 'Coming up'}</h2>
        <ol class="sep">${turns.map((x, i) => html`<li class="row">
          ${x.memberId ? avatar(x.memberId, 32) : html`<span class="av sys" aria-hidden="true">?</span>`}
          <span class="grow" style="font-weight:${i === 0 ? 600 : 400}">${x.memberId ? nameOf(x.memberId) : 'Unclaimed'}</span>
          <span class="small nowrap" style="color:${i === 0 ? 'var(--link)' : 'var(--label-secondary)'};font-weight:${i === 0 ? 600 : 400}">${i === 0 ? 'Now · ' : i === 1 ? 'Next · ' : ''}${dateShort(x.date)}</span>
        </li>`)}</ol>
      </section>` : ''}

      ${history.length ? html`<section class="card" aria-labelledby="cd-hist" style="padding:16px 16px 4px">
        <h2 id="cd-hist" class="h3" style="margin-bottom:4px">History</h2>
        <ul class="sep">${history.map((h) => html`<li class="row">
          ${avatar(h.memberId, 28)}
          <span class="col grow"><span>${nameOf(h.memberId)}</span>
            <span class="small muted">${h.doneAt ? `${dateShort(h.doneAt.slice(0, 10))}, ${clock(h.doneAt.slice(11, 16))}` : `Was due ${dateShort(h.dueDate)}`}</span></span>
          ${h.note === 'On time' ? badge('On time', 'success') : html`<span class="cap strong ${h.status === 'missed' ? 'danger' : 'muted'}">${h.note}</span>`}
        </li>`)}</ul>
      </section>` : ''}

      ${ctx.data.openIssues.map((i) => html`<a href="#/issue/${i.id}" class="card pad rowflex" style="color:inherit">${badge('Open issue', 'danger')}<span class="grow ellipsis">${i.title}</span></a>`)}

      ${c.archived ? '' : html`<a href="#/issue/new?chore=${c.id}" class="text-btn" style="align-self:center;gap:6px">${icon('flag', 18)}Report a problem with this chore</a>`}
    </main>
    ${ctx.state.sheet === 'swap' ? swapSheet(ctx) : ''}`;
  },
  actions: {
    done: async (ctx) => { await toggleDone(ctx, ctx.data.current); },
    undo: async (ctx, el) => { await post(`/tasks/${el.dataset.id}/undo`); await ctx.reload(); },
    claim: async (ctx, el) => { await post(`/tasks/${el.dataset.id}/claim`); ctx.toast('It’s yours.'); await ctx.reload(); },
    openSwap: (ctx) => openSwap(ctx),
    closeSheet: (ctx, el, ev) => { if (!ev.target.closest('.sheet') || el.matches('.text-btn')) ctx.set({ sheet: null }); },
    pickPerson: (ctx, el) => {
      const p = ctx.state.options.people.find((x) => x.id === +el.dataset.id);
      ctx.set({ to: p.id, give: p.suggested });
    },
    pickGive: (ctx, el) => ctx.set({ give: el.dataset.id ? +el.dataset.id : null }),
    sendSwap: async (ctx) => {
      if (!ctx.state.to) return;
      ctx.set({ busy: true });
      try {
        await post('/swaps', { taskId: ctx.data.current.id, toId: ctx.state.to, giveTaskId: ctx.state.give });
        ctx.set({ sheet: null, busy: false });
        ctx.toast(`Asked ${nameOf(ctx.state.to, { you: 'name' })}. You’ll hear back in Activity.`);
        await ctx.reload();
      } catch (e) { ctx.set({ busy: false }); throw e; }
    },
    cancelSwap: async (ctx) => { await post(`/swaps/${ctx.data.swap.id}/cancel`); ctx.toast('Swap request cancelled.'); await ctx.reload(); },
    accept: async (ctx) => { await post(`/swaps/${ctx.data.swap.id}/accept`); ctx.toast('Swap accepted.'); await ctx.reload(); },
    decline: async (ctx) => { await post(`/swaps/${ctx.data.swap.id}/decline`); ctx.toast('Swap declined.'); await ctx.reload(); }
  }
};

async function openSwap(ctx) {
  ctx.set({ sheet: 'swap', options: null, to: null, give: null });
  const options = await get(`/tasks/${ctx.data.current.id}/swap-options`);
  ctx.set({ options });
}

export function swapSentence(s, today) {
  const from = nameOf(s.fromId, { you: 'name' }), to = nameOf(s.toId, { you: 'name' });
  const fromMe = isMe(s.fromId);
  const a = s.task, b = s.give;
  const youThey = (meText, other) => (fromMe ? meText : other);
  if (!b) return fromMe ? `You asked ${to} to do ${a.title} on ${dateMed(a.dueDate)} for you.` : `${from} asked you to do ${a.title} on ${dateMed(a.dueDate)} for them.`;
  if (b.choreId === a.choreId) {
    return fromMe
      ? `You asked ${to} to swap turns. If ${to} accepts, ${to} does it on ${dateMed(a.dueDate)} and you take ${dateMed(b.dueDate)}.`
      : `${from} asked to swap turns. You’d do it on ${dateMed(a.dueDate)} and ${from} would take your ${dateMed(b.dueDate)}.`;
  }
  return fromMe
    ? `You asked ${to} to take ${a.title} on ${dateMed(a.dueDate)}. You’d take their ${b.title} on ${dateMed(b.dueDate)}.`
    : `You’d take ${a.title} on ${dateShort(a.dueDate)}. ${from} would take your ${b.title} ${a.dueDate === b.dueDate ? 'the same day' : 'on ' + dateShort(b.dueDate)}.`;
}

function swapBox(ctx, s) {
  const today = ctx.data.now.slice(0, 10);
  const fromMe = isMe(s.fromId);
  return html`<div role="status" class="status-box">
    ${badge(fromMe ? 'Swap requested' : 'Swap request for you', 'neutral')}
    <p class="small">${swapSentence(s, today)}</p>
    ${fromMe
      ? html`<div class="rowflex between"><span class="cap muted">Waiting for ${nameOf(s.toId, { you: 'name' })} · sent ${agoInline(s.createdAt, ctx.data.now)}</span>
          <button type="button" class="text-btn small" data-on="cancelSwap">Cancel request</button></div>`
      : isMe(s.toId) ? html`<div class="rowflex" style="gap:12px;margin-top:4px">${button('Accept', { on: 'accept' })}${button('Decline', { on: 'decline', variant: 'tertiary' })}</div>`
      : html`<span class="cap muted">Waiting for ${nameOf(s.toId)}</span>`}
  </div>`;
}

function swapSheet(ctx) {
  const o = ctx.state.options;
  const t = ctx.data.current;
  const sel = o?.people.find((p) => p.id === ctx.state.to);
  return html`<div class="sheet-back" data-on="closeSheet">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sw-title">
      <span class="sheet-grip" aria-hidden="true"></span>
      <div class="rowflex between"><h2 id="sw-title" class="t2">Request a swap</h2><button type="button" class="text-btn" data-on="closeSheet">Cancel</button></div>
      <p class="small muted">${t.title} · ${dateMed(t.dueDate)}${t.dueTime ? ', ' + clock(t.dueTime) : ''}</p>
      ${!o ? html`<div class="skeleton" style="height:100px"></div>` : html`
        <section class="section"><h3 class="sec-label">Who do you want to ask?</h3>
          <div class="card pad people4" role="group">
            ${o.people.map((p) => html`<button type="button" class="person-btn ${ctx.state.to === p.id ? 'on' : ''}" data-on="pickPerson" data-id="${p.id}" aria-pressed="${ctx.state.to === p.id}">
              <span class="av av-44 ${ctx.state.to === p.id ? 'ring' : ''}" style="background:${p.color}" aria-hidden="true">${p.name[0]}</span><span>${p.name}</span></button>`)}
          </div></section>
        ${sel ? html`<section class="section"><h3 class="sec-label">In return, you take…</h3>
          <div class="card card-rows sep" role="radiogroup">
            <button type="button" class="opt" role="radio" aria-checked="${!ctx.state.give}" data-on="pickGive" data-id=""><span class="grow">Nothing, it’s a favour</span><span class="radio ${!ctx.state.give ? 'on' : ''}">${!ctx.state.give ? icon('check', 14, 2.5) : ''}</span></button>
            ${sel.tasks.filter((x) => x.id !== t.id).map((x) => html`<button type="button" class="opt" role="radio" aria-checked="${ctx.state.give === x.id}" data-on="pickGive" data-id="${x.id}">
              <span class="col grow"><span>${x.title}</span><span class="small muted">${dateShort(x.dueDate)}${x.dueTime ? ', ' + clock(x.dueTime) : ''}${x.id === sel.suggested ? ' · their next turn' : ''}</span></span>
              <span class="radio ${ctx.state.give === x.id ? 'on' : ''}">${ctx.state.give === x.id ? icon('check', 14, 2.5) : ''}</span></button>`)}
          </div></section>` : ''}
        <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="sendSwap" ${sel && !ctx.state.busy ? '' : raw('disabled')}>${sel ? `Ask ${sel.name}` : 'Pick someone'}</button>`}
    </div>
  </div>`;
}
