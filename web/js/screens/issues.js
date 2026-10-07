import { html } from '../dom.js';
import { get } from '../api.js';
import { icon, seg, badge, backLink, avatar, nameOf, isMe, ago, plural } from '../ui.js';

export const TYPES = {
  now: { label: 'Needs doing now', desc: 'A chore can’t wait', ic: 'clock' },
  properly: { label: 'Not done properly', desc: 'A chore needs redoing', ic: 'redo' },
  smell: { label: 'Mess or smell', desc: 'Something’s grim', ic: 'smell' },
  other: { label: 'Something else', desc: 'Anything the house should know', ic: 'bubble' }
};
export const typeIcon = (type, size = 14) => html`<span class="type-ico ${type === 'now' ? 'now' : ''}" aria-hidden="true">${icon(TYPES[type].ic, size)}</span>`;

export default {
  title: 'House issues',
  tab: 'house',
  poll: true,
  load: (ctx) => get('/issues?state=' + (ctx.state.tab || 'open')),
  view(ctx) {
    const d = ctx.data;
    const tab = d.state;
    return html`<main class="screen">
      ${backLink(ctx.query.from === 'today' ? '#/today' : '#/house', ctx.query.from === 'today' ? 'Today' : 'House')}
      <header class="page-head" style="align-items:flex-start;padding-bottom:4px">
        <div class="stack" style="gap:4px"><h1 class="t1">House issues</h1><p class="small muted">Things that need sorting. Everyone in the house can see them.</p></div>
        <a href="#/issue/new" class="icon-btn accent" aria-label="Report an issue">${icon('plus', 22, 2)}</a>
      </header>
      ${seg('tab', [{ label: `Open · ${d.openCount}`, value: 'open' }, { label: 'Resolved', value: 'resolved' }], tab, 'tab', 'Show issues')}
      ${d.items.length ? d.items.map((i) => html`<a href="#/issue/${i.id}" class="card issue-card" data-key="i${i.id}">
        <span class="type-line">${typeIcon(i.type)}<span class="grow">${TYPES[i.type].label}</span>
          ${i.status === 'resolved' ? badge('Resolved', 'success') : html`<span class="cap strong" style="color:${i.onItId ? 'var(--link)' : 'var(--label-secondary)'}">${i.onItId ? `${nameOf(i.onItId, { you: 'You' })} ${isMe(i.onItId) ? 'are' : 'is'} on it` : 'Open'}</span>`}</span>
        <span class="strong" style="font-size:17px">${i.title}</span>
        <span class="rowflex small muted" style="gap:6px">
          ${i.reporterId ? avatar(i.reporterId, 24) : html`<span class="av av-24 sys" aria-hidden="true">?</span>`}
          <span class="grow ellipsis">${i.reporterId ? nameOf(i.reporterId, { you: 'You' }) : 'Someone'} · for ${i.tagId ? (isMe(i.tagId) ? 'you' : nameOf(i.tagId)) : 'everyone'} · ${ago(i.createdAt, d.now)}</span>
          ${isMe(i.tagId) && i.status === 'open' ? badge('For you', 'neutral') : ''}
        </span>
        <span class="cap muted">${plural(i.replies, 'reply', 'replies')}${i.agrees ? ` · ${i.agrees} agree${i.agrees === 1 ? 's' : ''}` : ''}</span>
      </a>`) : html`<section class="card empty">
        <span class="round-icon" aria-hidden="true">${icon('check', 24, 2)}</span>
        <span class="strong">${tab === 'open' ? 'Nothing to sort.' : 'Nothing resolved yet.'}</span>
        <span class="small muted">${tab === 'open' ? 'The house is in good shape.' : 'Resolved issues will show here.'}</span></section>`}
    </main>`;
  },
  actions: {
    tab: async (ctx, el) => { ctx.state.tab = el.dataset.value; await ctx.reload(); }
  }
};
