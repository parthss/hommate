import { html, raw } from '../dom.js';
import { get, post } from '../api.js';
import { icon, badge, backLink, avatar, button, nameOf, isMe, ago, agoInline, timeOf, dateShort, diffDays } from '../ui.js';
import { TYPES, typeIcon } from './issues.js';

const stamp = (at, now) => {
  const n = diffDays(at.slice(0, 10), now.slice(0, 10));
  return n === 0 ? timeOf(at) : n === 1 ? `Yesterday, ${timeOf(at)}` : `${dateShort(at.slice(0, 10))}, ${timeOf(at)}`;
};

export default {
  title: 'Issue',
  tab: 'house',
  poll: true,
  load: (ctx) => get('/issues/' + ctx.params.id),
  view(ctx) {
    const { issue: i, agreed, thread } = ctx.data;
    const now = ctx.data.now || new Date().toISOString().slice(0, 19);
    const open = i.status === 'open';
    return html`<main class="screen" style="padding-bottom:calc(env(safe-area-inset-bottom) + 150px)">
      ${backLink('#/issues', 'Issues')}
      <header class="col" style="gap:8px;padding:0 6px 4px">
        <span class="type-line">${typeIcon(i.type)}${TYPES[i.type].label} · for ${i.tagId ? (isMe(i.tagId) ? 'you' : nameOf(i.tagId)) : 'everyone'}</span>
        <h1 class="t1">${i.title}</h1>
        <span class="rowflex small muted" style="gap:6px">${i.reporterId ? avatar(i.reporterId, 24) : html`<span class="av av-24 sys" aria-hidden="true">?</span>`}
          ${i.reporterId ? `${nameOf(i.reporterId, { you: 'You' })} reported this` : 'Posted without a name'}${i.mine && i.anonymous ? ' (only you can see it was you)' : ''} · ${stamp(i.createdAt, now)}</span>
      </header>

      ${i.detail || i.chore ? html`<section class="card pad col" aria-label="Issue" style="gap:10px">
        ${i.detail ? html`<p>${i.detail}</p>` : ''}
        ${i.chore ? html`<a href="#/chore/${i.chore.id}" class="rowflex small" style="gap:6px">${icon('chores', 16)}About: ${i.chore.title} ›</a>` : ''}
      </section>` : ''}

      <section class="card pad col" aria-label="Status" style="gap:14px">
        ${open ? html`
          ${i.onItId ? html`<div class="rowflex" style="gap:12px">${avatar(i.onItId, 36)}<span class="col"><span class="strong">${nameOf(i.onItId, { you: 'You' })} ${isMe(i.onItId) ? 'are' : 'is'} on it</span>
            ${ctx.data.issue.onItNote ? html`<span class="small muted">${ctx.data.issue.onItNote}</span>` : ''}</span></div>` : html`<span class="small muted">Nobody has picked this up yet.</span>`}
          <div class="rowflex wrap" style="gap:10px">
            <button type="button" class="toggle-pill ${agreed ? 'on' : ''}" data-on="agree" aria-pressed="${agreed}">${icon('check', 16, 2)}Me too · ${i.agrees}</button>
            ${!i.onItId || isMe(i.onItId) ? button(isMe(i.onItId) ? 'I’m not on it' : 'I’m on it', { variant: 'secondary', size: 'small', on: 'onit' }) : ''}
            ${button('Mark resolved', { variant: 'tertiary', size: 'small', on: 'resolve' })}
          </div>` : html`<div role="status" class="rowflex between">
            ${badge(`Resolved${i.resolvedBy ? ` by ${isMe(i.resolvedBy) ? 'you' : nameOf(i.resolvedBy)}` : ''} ${i.resolvedAt ? agoInline(i.resolvedAt, now) : ''}`, 'success')}
            ${button('Reopen', { variant: 'tertiary', size: 'small', on: 'reopen' })}</div>`}
      </section>

      <section class="card" aria-labelledby="id-replies" style="padding:16px 16px 4px">
        <h2 id="id-replies" class="h3">Replies</h2>
        ${thread.length ? html`<ol class="thread sep">${thread.map((m) => html`<li data-key="m${m.id}">${avatar(m.memberId, 32)}
          <span class="col grow"><span class="rowflex" style="gap:6px"><strong class="strong">${nameOf(m.memberId, { you: 'You' })}</strong><span class="cap muted">${stamp(m.at, now)}</span></span>
            <span class="${m.kind === 'event' ? 'event-text' : ''}">${m.text}</span></span></li>`)}</ol>`
          : html`<p class="small muted" style="padding:8px 0 16px">No replies yet.</p>`}
      </section>
    </main>
    <form class="reply-bar" data-submit="reply">
      <label for="id-reply" class="sr-only">Reply</label>
      <input id="id-reply" type="text" placeholder="Reply to the house" value="${ctx.state.text || ''}" data-input="text" maxlength="1000" autocomplete="off" enterkeyhint="send">
      <button type="submit" class="icon-btn accent" style="width:40px;height:40px" aria-label="Send reply" ${ctx.state.text?.trim() ? '' : raw('disabled')}>${icon('up', 20, 2)}</button>
    </form>`;
  },
  actions: {
    text: (ctx, el) => ctx.set({ text: el.value }),
    reply: async (ctx) => {
      const text = (ctx.state.text || '').trim();
      if (!text) return;
      await post(`/issues/${ctx.params.id}/replies`, { text });
      ctx.state.text = '';
      const input = document.getElementById('id-reply'); if (input) input.value = '';
      await ctx.reload();
    },
    agree: async (ctx) => { await post(`/issues/${ctx.params.id}/agree`); await ctx.reload(); },
    onit: async (ctx) => { await post(`/issues/${ctx.params.id}/onit`); await ctx.reload(); },
    resolve: async (ctx) => { await post(`/issues/${ctx.params.id}/resolve`); ctx.toast('Marked resolved.'); await ctx.reload(); },
    reopen: async (ctx) => { await post(`/issues/${ctx.params.id}/reopen`); await ctx.reload(); }
  }
};
