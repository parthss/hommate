import { html, raw } from '../dom.js';
import { get, post } from '../api.js';
import { session } from '../store.js';
import { icon, chev, badge, button, nameOf, isMe, member, dateLong, dayShort, dayLong, clock, ago, wd, addDays } from '../ui.js';

const ISSUE_ICON = { now: ['clock', 'danger'], properly: ['redo', ''], smell: ['smell', ''], other: ['bubble', ''] };

export function issueMeta(i, now) {
  const who = i.reporterId ? nameOf(i.reporterId, { you: 'You' }) : 'Someone';
  const to = i.tagId ? (isMe(i.tagId) ? raw('<strong class="strong" style="color:var(--label)">for you</strong>') : `for ${nameOf(i.tagId, { you: 'name' })}`) : 'everyone';
  const tail = i.onItId ? `${nameOf(i.onItId, { you: 'You' })} ${isMe(i.onItId) ? 'are' : 'is'} on it` : ago(i.createdAt, now);
  return html`${who} · ${to} · ${tail}`;
}

/** Mark a task done or not done, with an Undo toast. Shared by Today, Chores and chore detail. */
export async function toggleDone(ctx, task, { quiet = false } = {}) {
  const wasDone = task.status === 'done';
  task.status = wasDone ? 'open' : 'done';
  ctx.set({});
  try {
    await post(`/tasks/${task.id}/${wasDone ? 'undo' : 'done'}`);
  } catch (e) {
    task.status = wasDone ? 'done' : 'open';
    ctx.set({});
    throw e;
  }
  if (!wasDone && !quiet) {
    ctx.toast(`${task.title}: done.`, { undo: async () => { await post(`/tasks/${task.id}/undo`); await ctx.reload(); } });
  }
  await ctx.reload();
}

const checkBtn = (t, extra = '') => {
  const done = t.status === 'done';
  return html`<button type="button" class="check ${done ? 'done' : ''} ${t.overdue && !done ? 'late' : ''} ${extra}" data-on="toggle" data-id="${t.id}"
    aria-pressed="${done}" aria-label="${done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}">
    <span class="ring">${done ? icon('check', 16, 2.5) : ''}</span></button>`;
};
export { checkBtn };

export default {
  title: 'Today',
  tab: 'today',
  poll: true,
  load: () => get('/today'),
  view(ctx) {
    const d = ctx.data;
    const today = d.now.slice(0, 10);
    const hour = +d.now.slice(11, 13);
    const greet = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
    session.bellDot = d.bell.unseen > 0 || d.bell.swapsForMe > 0;
    const pct = d.totalCount ? Math.round((d.doneCount / d.totalCount) * 100) : 0;
    const left = d.today.filter((t) => t.status !== 'done').length + d.overdue.filter((t) => t.status !== 'done').length;
    const me = session.me;

    return html`<main class="screen">
      <header class="page-head">
        <div class="stack">
          <p class="small muted">${dateLong(today)}</p>
          <h1 class="t1">${greet}, ${me.name}</h1>
        </div>
        <a href="#/activity" class="icon-btn plain" style="position:relative" aria-label="Activity${session.bellDot ? ', new' : ''}">
          ${icon('bell', 22)}${session.bellDot ? html`<span class="dot"></span>` : ''}
        </a>
      </header>

      <section class="card" aria-label="Your chores today" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:10px">
        <div class="card-head"><span class="small muted">Your chores today</span><span class="small muted">${left === 0 ? 'All done' : `${left} still to do`}</span></div>
        ${d.totalCount
          ? html`<div class="rowflex" style="align-items:baseline"><span class="big-num">${d.doneCount}</span><span class="muted">of ${d.totalCount} done</span></div>
            <div class="progress" role="progressbar" aria-label="Chores done today" aria-valuemin="0" aria-valuemax="${d.totalCount}" aria-valuenow="${d.doneCount}"><div style="width:${pct}%"></div></div>`
          : html`<div class="rowflex" style="align-items:baseline"><span class="big-num" style="font-size:28px">Nothing due</span></div><span class="small muted">Enjoy the day off.</span>`}
      </section>

      ${d.overdue.map((t) => html`<section class="alert-tile ${t.status === 'done' ? 'ok' : ''}" aria-label="Overdue">
        ${checkBtn(t, 'big')}
        <a href="#/chore/${t.choreId}" class="col grow" style="gap:2px;color:inherit">
          ${t.status === 'done' ? badge('Done just now', 'success') : badge('Overdue', 'danger')}
          <span class="strong">${t.title}</span>
          <span class="small muted">Was due ${dayLong(t.dueDate)}${t.dueTime ? ', ' + clock(t.dueTime) : ''}</span>
        </a>
        ${t.swap ? '' : button('Swap', { variant: 'tertiary', size: 'small', href: `#/chore/${t.choreId}?swap=${t.id}` })}
      </section>`)}

      ${d.issues.open ? html`<section class="card" aria-labelledby="t-issues" style="padding:16px 12px 4px 16px;display:flex;flex-direction:column">
        <div class="card-head" style="padding-right:4px">
          <h2 id="t-issues" class="h3">House issues <span class="muted" style="font-weight:400">· ${d.issues.open} open</span></h2>
          <a href="#/issues" class="more-link">See all ›</a>
        </div>
        <ul class="sep" style="margin-top:4px">
          ${d.issues.top.map((i) => html`<li><a href="#/issue/${i.id}" class="row-link" style="min-height:64px">
            <span class="icon-bubble ${ISSUE_ICON[i.type][1]}" aria-hidden="true">${icon(ISSUE_ICON[i.type][0], 18)}</span>
            <span class="col grow"><span class="strong">${i.title}</span><span class="small muted">${issueMeta(i, d.now)}</span></span>${chev()}
          </a></li>`)}
        </ul>
      </section>` : ''}

      <section class="card" aria-labelledby="t-due" style="padding:16px 12px 4px 8px;display:flex;flex-direction:column">
        <div class="card-head" style="padding:0 4px 4px 8px"><h2 id="t-due" class="t2">Due today</h2></div>
        ${d.today.length ? html`<ul class="sep">
          ${d.today.map((t) => html`<li class="rowflex" style="gap:6px;min-height:62px" data-key="t${t.id}">
            ${checkBtn(t)}
            <a href="#/chore/${t.choreId}" class="row-link" style="min-height:52px;gap:8px">
              <span class="col grow"><span class="strong ${t.status === 'done' ? 'title-done' : ''}">${t.title}</span>
                <span class="small ${t.overdue ? 'danger' : 'muted'}">${t.status === 'done' ? 'Done' : t.dueTime ? `By ${clock(t.dueTime)}` : 'Any time today'} · ${t.repeat}</span></span>${chev()}
            </a></li>`)}
        </ul>` : html`<p class="small muted" style="padding:4px 8px 16px">Nothing else on your list today.</p>`}
      </section>

      <section class="card pad" aria-labelledby="t-week" style="display:flex;flex-direction:column;gap:12px">
        <div class="card-head"><h2 id="t-week" class="t2">This week</h2><a href="#/rota" class="more-link">Full rota ›</a></div>
        <ol class="week7" aria-label="Your chores per day">
          ${d.week.map((w) => html`<li aria-label="${dayLong(w.date)} ${+w.date.slice(8)}: ${w.count ? w.count + (w.count === 1 ? ' chore' : ' chores') : 'nothing for you'}">
            <span class="cap muted" aria-hidden="true">${'MTWTFSS'[wd(w.date)]}</span>
            <span class="num ${w.isToday ? 'today' : ''}" aria-hidden="true">${+w.date.slice(8)}</span>
            <span class="dots" aria-hidden="true">${Array.from({ length: Math.min(w.count, 4) }, () => html`<span style="background:${me.color}"></span>`)}</span>
          </li>`)}
        </ol>
        ${d.later.length ? html`<ul class="sep" style="border-top:1px solid var(--separator)">
          ${d.later.slice(0, 5).map((t) => html`<li><a href="#/chore/${t.choreId}" class="row" style="min-height:52px;color:inherit">
            <span class="small strong muted" style="flex:none;width:40px">${dayShort(t.dueDate)}</span>
            <span class="grow ellipsis">${t.title}</span>
            <span class="small muted nowrap">${t.swap ? 'Swap pending' : t.dueTime ? clock(t.dueTime) : 'Anytime'}</span></a></li>`)}
        </ul>` : html`<p class="small muted">Nothing else for you this week.</p>`}
      </section>
    </main>`;
  },
  actions: {
    toggle: async (ctx, el) => {
      const id = +el.dataset.id;
      const t = [...ctx.data.today, ...ctx.data.overdue].find((x) => x.id === id);
      if (t) await toggleDone(ctx, t);
    }
  }
};
