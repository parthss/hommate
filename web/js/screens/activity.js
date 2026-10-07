import { html } from '../dom.js';
import { get, post } from '../api.js';
import { session } from '../store.js';
import { icon, avatar, backLink, badge, button, nameOf, isMe, money, fillTarget, ago, timeOf, dateShort, diffDays, dateLong } from '../ui.js';
import { swapSentence } from './chore-detail.js';

/** Avatar with a small status badge, shared with Activity history. */
export function actAvatar(a) {
  const sys = !a.actorId;
  const badgeIc = { done: ['check', 'var(--success)', 'var(--bg)'], money: ['£', 'var(--fill)', 'var(--label)'], swap: ['swap', 'var(--fill)', 'var(--label)'],
    edit: ['edit', 'var(--fill)', 'var(--label)'], alert: ['!', 'var(--danger)', 'var(--bg)'], issue: ['flag', 'var(--fill)', 'var(--label)'], join: ['plus', 'var(--fill)', 'var(--label)'] }[a.icon] || ['check', 'var(--fill)', 'var(--label)'];
  const inner = badgeIc[0].length === 1 ? badgeIc[0] : icon(badgeIc[0], 11, 2.5);
  return html`<span style="position:relative;flex:none">
    ${sys ? html`<span class="av sys" aria-hidden="true">${a.verb[0] === a.verb[0].toUpperCase() ? '?' : icon('house', 16)}</span>` : avatar(a.actorId, 32)}
    <span class="av-badge" style="background:${badgeIc[1]};color:${badgeIc[2]}">${inner}</span></span>`;
}

export function actText(a) {
  const anonymous = !a.actorId && a.verb[0] === a.verb[0].toUpperCase();
  const who = a.actorId ? nameOf(a.actorId, { you: 'You' }) : anonymous ? '' : 'Hommate';
  return html`${who ? html`<strong class="strong">${who}</strong> ` : ''}${fillTarget(a.verb, a.targetId)}`;
}

export default {
  title: 'Activity',
  tab: 'today',
  poll: true,
  load: () => get('/activity/feed'),
  view(ctx) {
    const d = ctx.data;
    session.bellDot = false;
    const today = d.now.slice(0, 10);
    const forMe = d.swaps.filter((s) => s.forMe);
    const waiting = d.swaps.filter((s) => !s.forMe);
    const groups = [];
    for (const a of d.recent) {
      const n = diffDays(a.at.slice(0, 10), today);
      const label = n === 0 ? 'Today' : n === 1 ? 'Yesterday' : 'Earlier';
      let g = groups.find((x) => x.label === label);
      if (!g) groups.push((g = { label, items: [] }));
      g.items.push(a);
    }

    return html`<main class="screen">
      ${backLink('#/today', 'Today')}
      <h1 class="t1" style="padding:0 6px">Activity</h1>

      ${forMe.length || waiting.length || d.answered.length ? html`<section class="card needs" aria-labelledby="ac-needs">
        <h2 id="ac-needs" class="h3">Needs you</h2>
        ${forMe.map((s) => html`<div class="col" style="gap:12px" data-key="s${s.id}">
          <div class="rowflex" style="align-items:flex-start;gap:12px">${avatar(s.fromId, 36)}
            <div class="col grow" style="gap:2px"><span><strong class="strong">${nameOf(s.fromId)}</strong> asked to swap</span>
              <span class="small muted">${swapSentence(s, today)}</span><span class="cap muted">${ago(s.createdAt, d.now)}</span></div></div>
          <div class="rowflex" style="gap:12px">${button('Accept', { on: 'answer', args: `data-id="${s.id}" data-a="accept"` })}${button('Decline', { variant: 'tertiary', on: 'answer', args: `data-id="${s.id}" data-a="decline"` })}</div>
        </div>`)}
        ${d.answered.map((s) => html`<div role="status" class="status-box" data-key="a${s.id}">
          <div class="rowflex between">${s.status === 'accepted' ? badge('Swap accepted', 'success') : html`<span class="small">Declined. ${nameOf(s.fromId)} keeps ${s.task.title}.</span>`}
          <button type="button" class="text-btn small" data-on="undo" data-id="${s.id}">Undo</button></div>
        </div>`)}
        ${waiting.map((s) => html`<a href="#/chore/${s.task.choreId}" class="rowflex" style="color:inherit;min-height:44px;border-top:1px solid var(--separator);padding-top:10px" data-key="w${s.id}">
          ${badge('Waiting', 'neutral')}<span class="grow small">You asked ${nameOf(s.toId)} to swap ${s.task.title}</span>${icon('chevron', 16)}</a>`)}
      </section>` : ''}

      ${groups.map((g) => html`<section class="card" aria-label="${g.label}" style="padding:16px 16px 4px">
        <h2 class="h3">${g.label}</h2>
        <ul class="sep">${g.items.map((a) => html`<li class="act-row ${a.id > d.seenBefore && !isMe(a.actorId) ? 'new' : ''}">
          ${actAvatar(a)}
          <span class="col grow"><span class="small" style="font-size:15px;line-height:21px">${actText(a)}</span>
            <span class="cap muted">${g.label === 'Earlier' ? dateShort(a.at.slice(0, 10)) : timeOf(a.at)}${a.id > d.seenBefore && !isMe(a.actorId) ? ' · new' : ''}</span></span>
          ${a.amount ? html`<span class="small strong">${money(a.amount)}</span>` : ''}
        </li>`)}</ul>
      </section>`)}
      ${!groups.length ? html`<section class="card empty"><span class="strong">Nothing yet.</span><span class="small muted">When housemates do things, you’ll see it here.</span></section>` : ''}
      <a href="#/history" class="text-btn" style="align-self:center">See full history ›</a>
    </main>`;
  },
  actions: {
    answer: async (ctx, el) => {
      await post(`/swaps/${el.dataset.id}/${el.dataset.a}`);
      await ctx.reload();
    },
    undo: async (ctx, el) => { await post(`/swaps/${el.dataset.id}/undo`); await ctx.reload(); }
  }
};
