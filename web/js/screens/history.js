import { html } from '../dom.js';
import { get } from '../api.js';
import { session } from '../store.js';
import { seg, backLink, isMe, fillTarget, timeOf, dateShort, diffDays, money } from '../ui.js';
import { actAvatar, actText } from './activity.js';

const qs = (s, before) => `/activity?kind=${s.kind}&person=${s.person}${before ? '&before=' + before : ''}`;

export default {
  title: 'Activity history',
  tab: 'house',
  async load(ctx) {
    ctx.state.kind = ctx.state.kind || ctx.query.kind || 'all';
    ctx.state.person = ctx.state.person || ctx.query.person || 'all';
    return get(qs(ctx.state));
  },
  view(ctx) {
    const s = ctx.state, d = ctx.data;
    const today = d.now.slice(0, 10);
    const days = [];
    for (const a of d.items) {
      const day = a.at.slice(0, 10);
      const n = diffDays(day, today);
      const label = n === 0 ? `Today · ${dateShort(day)}` : n === 1 ? `Yesterday · ${dateShort(day)}` : dateShort(day);
      let g = days.find((x) => x.day === day);
      if (!g) days.push((g = { day, label, items: [] }));
      g.items.push(a);
    }
    const people = [{ id: 'all', label: 'Everyone' }, ...[...session.members].sort((a, b) => isMe(b.id) - isMe(a.id)).map((m) => ({ id: String(m.id), label: isMe(m.id) ? 'You' : m.name, color: m.color, i: m.name[0] })), ...session.former.map((m) => ({ id: String(m.id), label: `${m.name} (left)`, color: m.color, i: m.name[0] }))];

    return html`<main class="screen">
      ${backLink('#/house', 'House')}
      <header class="col" style="gap:4px;padding:0 6px 4px">
        <h1 class="t1">Activity history</h1>
        <p class="small muted">Everything anyone at ${session.house.name} has done in Hommate.</p>
      </header>
      ${seg('kind', [{ label: 'All', value: 'all' }, { label: 'Chores', value: 'chores' }, { label: 'Money', value: 'money' }, { label: 'Swaps', value: 'swaps' }, { label: 'Issues', value: 'issues' }], s.kind, 'kind', 'Type of activity')}
      <div class="chips" role="group" aria-label="Who">
        ${people.map((p) => html`<button type="button" class="chip ${p.id === 'all' ? 'plain' : ''} ${s.person === p.id ? 'on' : ''}" data-on="person" data-id="${p.id}" aria-pressed="${s.person === p.id}">
          ${p.color ? html`<span class="av av-24" style="background:${p.color}" aria-hidden="true">${p.i}</span>` : ''}${p.label}</button>`)}
      </div>
      ${!days.length ? html`<section class="card empty"><span class="strong">Nothing to show.</span><span class="small muted">Try another type or person.</span></section>` : ''}
      ${days.map((g) => html`<section class="card" aria-label="${g.label}" style="padding:16px 16px 4px" data-key="d${g.day}">
        <h2 class="h3">${g.label}</h2>
        <ol class="sep">${g.items.map((a) => html`<li class="act-row" data-key="a${a.id}">
          ${actAvatar(a)}
          <span class="col grow"><span style="font-size:15px;line-height:21px">${actText(a)}</span>
            ${a.detail ? html`<span class="small muted">${fillTarget(a.detail, a.targetId)}</span>` : ''}</span>
          <span class="cap muted nowrap" style="padding-top:2px">${timeOf(a.at)}</span>
        </li>`)}</ol>
      </section>`)}
      ${d.more ? html`<div style="display:flex;justify-content:center"><button type="button" class="lm-btn lm-btn-tertiary lm-btn-medium" data-on="older">Show older</button></div>` : ''}
    </main>`;
  },
  actions: {
    kind: async (ctx, el) => { ctx.state.kind = el.dataset.value; ctx.set({}); await ctx.reload(); },
    person: async (ctx, el) => { ctx.state.person = el.dataset.id; ctx.set({}); await ctx.reload(); },
    older: async (ctx) => {
      const last = ctx.data.items.at(-1);
      const more = await get(qs(ctx.state, last.id));
      ctx.data.items.push(...more.items);
      ctx.data.more = more.more;
      ctx.set({});
    }
  }
};
