import { html } from '../dom.js';
import { get } from '../api.js';
import { session } from '../store.js';
import { icon, backLink, isMe, monthDay, dayShort, nameOf } from '../ui.js';

export default {
  title: 'Rota',
  tab: 'chores',
  poll: true,
  load: (ctx) => get('/rota?week=' + (ctx.state.week || 0)),
  view(ctx) {
    const d = ctx.data;
    const week = d.offset;
    // You first, then everyone else in join order.
    const people = [...session.members].sort((a, b) => (isMe(b.id) - isMe(a.id)) || a.id - b.id);
    const label = week === 0 ? 'This week' : week === 1 ? 'Next week' : week === -1 ? 'Last week' : `${-week} weeks ago`;
    const range = `${+d.start.slice(8)}${d.start.slice(5, 7) === d.end.slice(5, 7) ? '' : ' ' + monthDay(d.start).split(' ')[1]}–${monthDay(d.end)}`;
    return html`<main class="screen">
      ${backLink('#/chores', 'Chores')}
      <header class="page-head center" style="padding-bottom:4px">
        <div class="stack"><h1 class="t1">Rota</h1><span class="small muted">${label} · ${range}</span></div>
        <div class="rowflex" style="gap:4px">
          <button type="button" class="icon-btn plain" data-on="week" data-d="-1" aria-label="Previous week" ${week <= -4 ? 'disabled' : ''}>${icon('back', 20)}</button>
          <button type="button" class="icon-btn plain" data-on="week" data-d="1" aria-label="Next week" ${week >= 1 ? 'disabled' : ''}>${icon('chevron', 20)}</button>
        </div>
      </header>
      <section class="card rota" aria-label="Who has which chore each day" style="--cols:${people.length}">
        <div class="rota-head"><span></span>
          ${people.map((p) => html`<span><span class="av av-28" style="background:${p.color}" aria-hidden="true">${p.name[0]}</span><span class="ellipsis" style="max-width:100%">${isMe(p.id) ? 'You' : p.name}</span></span>`)}
        </div>
        ${d.days.map((day) => html`<div class="rota-row ${day.isToday ? 'today' : ''}">
          <span class="rota-day"><span>${dayShort(day.date)}</span><span class="n">${+day.date.slice(8)}</span></span>
          ${people.map((p) => html`<span class="rota-cell">
            ${d.tasks.filter((t) => t.dueDate === day.date && t.assigneeId === p.id).map((t) => html`<a href="#/chore/${t.choreId}" class="rchip ${t.status === 'done' ? 'done' : t.overdue || t.status === 'missed' ? 'late' : ''}"
              aria-label="${t.title}, ${nameOf(p.id, { you: 'You' })}, ${dayShort(day.date)}${t.status === 'done' ? ', done' : t.overdue ? ', overdue' : t.status === 'missed' ? ', missed' : ''}">${t.short}</a>`)}
          </span>`)}
        </div>`)}
      </section>
      <div class="legend"><span><i style="background:var(--danger-tint);outline:1px solid var(--danger)"></i>Overdue</span><span><i style="background:var(--success-tint);outline:1px solid var(--success)"></i>Done</span></div>
      ${d.unclaimed.length ? html`<section class="card pad col" aria-labelledby="r-grabs" style="gap:10px">
        <h2 id="r-grabs" class="h3">Up for grabs ${week === 0 ? 'this week' : week === 1 ? 'next week' : ''}</h2>
        <div class="rowflex wrap">${d.unclaimed.map((t) => html`<a class="pill-link" href="#/chores?filter=unclaimed">${t.title}</a>`)}</div>
      </section>` : ''}
    </main>`;
  },
  actions: {
    week: async (ctx, el) => {
      ctx.state.week = Math.max(-4, Math.min(1, (ctx.state.week || 0) + +el.dataset.d));
      await ctx.reload();
    }
  }
};
