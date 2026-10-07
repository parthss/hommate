import { html } from '../dom.js';
import { get, del, post } from '../api.js';
import { icon, avatar, backLink, nameOf, isMe, money, dateMed, dateShort, timeOf, listJoin, button, badge } from '../ui.js';

const SPLIT = { equal: 'Split equally', exact: 'Split by exact amounts', percent: 'Split by percentage', shares: 'Split by shares' };

export default {
  title: 'Expense',
  tab: 'expenses',
  load: (ctx) => get('/expenses/' + ctx.params.id),
  view(ctx) {
    const { expense: e, payers, shares, history } = ctx.data;
    const single = payers.length === 1 ? payers[0].memberId : null;
    const mine = shares.find((s) => isMe(s.memberId));
    const iPaid = payers.find((p) => isMe(p.memberId))?.amount || 0;
    const payerNames = payers.filter((p) => !isMe(p.memberId)).map((p) => nameOf(p.memberId));
    const sub = `${dateMed(e.date)} · ${e.splitType === 'equal' ? `split equally between ${shares.length}` : SPLIT[e.splitType].toLowerCase()}`;

    let yourNote;
    if (!mine && !iPaid) yourNote = 'You’re not part of this one.';
    else if (iPaid) {
      const back = iPaid - (mine?.amount || 0);
      yourNote = back > 0 ? `You paid ${money(iPaid)}, so the others owe you ${money(back)}.` : back < 0 ? `You paid ${money(iPaid)} and still owe ${money(-back)}.` : `You paid exactly your share.`;
    } else yourNote = single ? `You owe ${nameOf(single)} this. It’s in your overall balance.` : `Added to your overall balance with ${listJoin(payerNames)}.`;

    return html`<main class="screen">
      <div class="top-actions">${backLink('#/expenses', 'Expenses')}${e.deleted ? '' : html`<a href="#/expense/${e.id}/edit" class="text-btn">Edit</a>`}</div>
      <header class="col" style="gap:2px;padding:0 6px 4px">
        ${e.deleted ? badge('Deleted', 'danger') : ''}
        <h1 class="t1">${e.title}</h1>
        <span class="money-big">${money(e.amount)}</span>
        <span class="small muted" style="display:flex;gap:6px;align-items:center">${e.recurring ? icon('repeat', 14) : ''}${sub}${e.recurring ? ' · monthly bill' : ''}</span>
      </header>

      <section class="card pad-20 rowflex between" aria-label="Your part" style="gap:12px">
        <div class="col"><span class="small muted">Your share</span><span class="t2">${money(mine?.amount || 0)}</span><span class="small muted">${yourNote}</span></div>
        ${mine && !iPaid && !e.deleted ? button('Settle up', { variant: 'secondary', size: 'small', href: single ? `#/settle?to=${single}` : '#/settle' }) : ''}
      </section>

      <section class="card" aria-labelledby="xd-paid" style="padding:16px 16px 4px">
        <h2 id="xd-paid" class="h3" style="margin-bottom:4px">Paid by</h2>
        <ul class="sep">${payers.map((p) => html`<li class="row">${avatar(p.memberId, 32)}<span class="grow">${nameOf(p.memberId)}</span><span class="strong">${money(p.amount)}</span></li>`)}</ul>
      </section>

      <section class="card" aria-labelledby="xd-split" style="padding:16px 16px 4px">
        <h2 id="xd-split" class="h3" style="margin-bottom:4px">${SPLIT[e.splitType]}</h2>
        <ul class="sep">${shares.map((s) => {
          const paid = payers.find((p) => p.memberId === s.memberId)?.amount || 0;
          const back = paid - s.amount;
          const note = paid ? `Paid ${money(paid)}${back > 0 ? ` · gets back ${money(back)}` : back < 0 ? ` · owes ${money(-back)}` : ''}`
            : single ? `Owes ${nameOf(single, { you: 'you' })} ${money(s.amount)}` : `Owes ${money(s.amount)}`;
          const val = e.splitType === 'percent' ? `${+s.value}%` : e.splitType === 'shares' ? `${s.value} share${s.value === 1 ? '' : 's'}` : '';
          return html`<li class="row">${avatar(s.memberId, 32)}
            <span class="col grow"><span>${nameOf(s.memberId)}${val ? html` <span class="muted small">· ${val}</span>` : ''}</span><span class="small muted">${note}</span></span>
            <span class="strong">${money(s.amount)}</span></li>`;
        })}</ul>
      </section>

      <section class="card" aria-labelledby="xd-hist" style="padding:16px 16px 4px">
        <h2 id="xd-hist" class="h3" style="margin-bottom:4px">History</h2>
        <ul class="sep">
          ${history.map((h) => html`<li class="col" style="padding:12px 0">
            <span class="small"><strong class="strong">${h.actorId ? nameOf(h.actorId, { you: 'You' }) : 'Hommate'}</strong> ${h.verb}</span>
            ${h.detail ? html`<span class="small muted">${h.detail}</span>` : ''}
            <span class="cap muted">${dateShort(h.at.slice(0, 10))}, ${timeOf(h.at)}</span></li>`)}
          <li><a href="#/history?kind=money" class="row more-link" style="min-height:48px">All house activity ›</a></li>
        </ul>
      </section>

      ${e.deleted
        ? html`<button type="button" class="text-btn" style="align-self:center" data-on="restore">Restore expense</button>`
        : html`<button type="button" class="text-btn danger" style="align-self:center;gap:6px" data-on="remove" data-confirm="Delete this expense? Everyone’s balances will update.">${icon('trash', 18)}Delete expense</button>`}
    </main>`;
  },
  actions: {
    remove: async (ctx) => {
      const id = ctx.params.id;
      await del('/expenses/' + id);
      ctx.toast('Expense deleted.', { undo: async () => { await post(`/expenses/${id}/restore`); ctx.go('#/expense/' + id); } });
      ctx.go('#/expenses', true);
    },
    restore: async (ctx) => { await post(`/expenses/${ctx.params.id}/restore`); ctx.toast('Expense restored.'); await ctx.reload(); }
  }
};
