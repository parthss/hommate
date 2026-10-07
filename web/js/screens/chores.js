import { html } from '../dom.js';
import { get, post } from '../api.js';
import { prefs } from '../store.js';
import { icon, badge, seg, avatar, nameOf, isMe, dueLabel, plural } from '../ui.js';
import { toggleDone } from './today.js';

const GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Later this week' },
  { key: 'later', label: 'Coming up' }
];

export default {
  title: 'Chores',
  tab: 'chores',
  poll: true,
  load: (ctx) => {
    ctx.state.filter = ctx.state.filter || ctx.query.filter || prefs.get('choresFilter', 'mine');
    return get('/chores?filter=' + ctx.state.filter);
  },
  view(ctx) {
    const d = ctx.data;
    const today = d.now.slice(0, 10);
    const filter = ctx.state.filter;
    const head = html`<header class="page-head center">
        <h1 class="t1">Chores</h1>
        <div class="rowflex">
          <a href="#/rota" class="text-btn">Rota</a>
          <a href="#/chore/new" class="icon-btn accent" aria-label="Add a chore">${icon('plus', 22, 2)}</a>
        </div>
      </header>`;
    const filters = seg('filter', [{ label: 'Mine', value: 'mine' }, { label: 'All', value: 'all' }, { label: 'Unclaimed', value: 'unclaimed' }], filter, 'filter', 'Show chores');

    if (d.total === 0) {
      return html`<main class="screen">${head}${filters}
        <section class="card empty" aria-labelledby="e-title" style="padding:36px 24px;gap:10px">
          <span class="round-icon blue" aria-hidden="true">${icon('chores', 26)}</span>
          <h2 id="e-title" class="t2">No chores yet.</h2>
          <p class="muted">Add the jobs your house shares, like bins, bathroom and hoovering, and choose who does them.</p>
          <div style="margin-top:8px"><a class="lm-btn lm-btn-primary lm-btn-large" href="#/chore/new">Add a chore</a></div>
        </section></main>`;
    }

    const groups = filter === 'unclaimed'
      ? [{ key: 'grabs', label: 'Up for grabs', items: d.items }]
      : GROUPS.map((g) => ({ ...g, items: d.items.filter((t) => t.group === g.key) }));
    const shown = groups.filter((g) => g.items.length);

    return html`<main class="screen">${head}${filters}
      ${filter === 'unclaimed'
        ? html`<p class="hint">Anyone can take these. Claiming one adds it to your list.</p>`
        : html`<p class="hint">Tap the circle, or swipe a chore left, to mark it done.</p>`}
      ${shown.length ? shown.map((g) => html`<section class="card card-list" aria-label="${g.label}" data-key="g-${g.key}">
        <div class="card-head" style="align-items:center">
          ${g.key === 'overdue' ? badge('Overdue', 'danger') : html`<h2 class="h3">${g.label}</h2>`}
          <span class="cap muted">${plural(g.items.length, 'chore')}</span>
        </div>
        <ul class="sep">${g.items.map((t) => row(ctx, t, today))}</ul>
      </section>`) : html`<section class="card empty">
        <span class="strong">${filter === 'mine' ? 'Nothing on your list.' : filter === 'unclaimed' ? 'Nothing up for grabs.' : 'Nothing coming up.'}</span>
        <span class="small muted">${filter === 'mine' ? 'Check Unclaimed for jobs anyone can take.' : 'New chores you add will show here.'}</span>
      </section>`}
    </main>`;
  },
  actions: {
    filter: async (ctx, el) => {
      ctx.state.filter = el.dataset.value;
      ctx.state.swiped = null;
      prefs.set('choresFilter', ctx.state.filter);
      ctx.set({});
      await ctx.reload();
    },
    toggle: async (ctx, el) => {
      const t = ctx.data.items.find((x) => x.id === +el.dataset.id);
      ctx.state.swiped = null;
      if (t) await toggleDone(ctx, t);
    },
    swipe: (ctx, el, ev) => ctx.set({ swiped: ev.open ? +el.dataset.id : null }),
    claim: async (ctx, el) => {
      await post(`/tasks/${el.dataset.id}/claim`);
      ctx.toast('Added to your list.');
      await ctx.reload();
    }
  }
};

function row(ctx, t, today) {
  const done = t.status === 'done';
  const claimable = !t.assigneeId;
  const swiped = ctx.state.swiped === t.id && !done && !claimable;
  const when = done ? 'Done' : t.swap ? `${dueLabel(t, today)} · swap pending` : dueLabel(t, today);
  return html`<li class="swipe" data-key="c${t.id}">
    ${!claimable && !done ? html`<button type="button" class="swipe-act" data-on="toggle" data-id="${t.id}" tabindex="-1" aria-hidden="${!swiped}">${icon('check', 20, 2)}Done</button>` : ''}
    <div class="swipe-body" ${!claimable && !done ? html`data-swipe="swipe" data-id="${t.id}" data-open="${swiped ? 1 : 0}"` : ''} style="${swiped ? 'transform:translateX(-88px)' : ''}">
      ${claimable ? html`<span style="flex:none;width:8px"></span>` : html`<button type="button" class="check ${done ? 'done' : ''} ${t.overdue && !done ? 'late' : ''}" data-on="toggle" data-id="${t.id}"
        aria-pressed="${done}" aria-label="${done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}${isMe(t.assigneeId) ? '' : ' for ' + nameOf(t.assigneeId, { you: 'name' })}"><span class="ring">${done ? icon('check', 16, 2.5) : ''}</span></button>`}
      <a href="#/chore/${t.choreId}" class="col grow" style="min-height:52px;justify-content:center;color:inherit">
        <span class="strong ${done ? 'title-done' : ''}">${t.title}</span>
        <span class="small meta ${t.overdue && !done ? 'danger' : 'muted'}">${when} <span aria-hidden="true">·</span> ${t.repeat !== 'One-off' ? icon('repeat', 13) : ''}${t.repeat}${t.mode === 'turns' ? ', takes turns' : ''}</span>
      </a>
      ${claimable
        ? html`<button type="button" class="lm-btn lm-btn-secondary lm-btn-small" data-on="claim" data-id="${t.id}">Claim</button>`
        : html`<span role="img" aria-label="${nameOf(t.assigneeId)}">${avatar(t.assigneeId, 30)}</span>`}
    </div>
  </li>`;
}
