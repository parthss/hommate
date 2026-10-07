import { html } from '../dom.js';
import { get } from '../api.js';
import { session } from '../store.js';
import { icon, avatar, nameOf, isMe, money, relDay, dateShort, diffDays, button } from '../ui.js';

const METHOD = { bank: 'Bank transfer', cash: 'Cash', other: 'Other' };
const when = (date, today) => { const n = diffDays(date, today); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : dateShort(date); };

export function expenseMeta(e, today) {
  const paid = e.payers.length > 1 ? `${e.payers.map((p) => nameOf(p.memberId, { you: 'You' })).join(' and ')} paid` : `${nameOf(e.payers[0]?.memberId, { you: 'You' })} paid`;
  const all = session.members.map((m) => m.id);
  const left = all.filter((id) => !e.sharedWith.includes(id));
  const notWho = left.length && left.length <= 2 ? ` · not ${left.map((id) => nameOf(id, { you: 'you' })).join(' or ')}` : '';
  return `${paid} · ${when(e.date, today)}${notWho}`;
}

export function myPart(e) {
  if (!e.included && e.myPaid === 0) return 'not included';
  const lent = e.myPaid - e.myShare;
  if (e.myPaid > 0 && lent > 0) return `you lent ${money(lent)}`;
  if (e.myPaid > 0 && lent < 0) return `you owe ${money(-lent)}`;
  if (e.myPaid > 0) return 'you’re even';
  return `your share ${money(e.myShare)}`;
}

export default {
  title: 'Expenses',
  tab: 'expenses',
  poll: true,
  load: () => get('/expenses'),
  view(ctx) {
    const d = ctx.data;
    const today = d.now.slice(0, 10);
    const owe = d.mine.filter((x) => isMe(x.from));
    const owed = d.mine.filter((x) => isMe(x.to));
    const total = (arr) => arr.reduce((a, x) => a + x.amount, 0);

    return html`<main class="screen">
      <header class="page-head center">
        <h1 class="t1">Expenses</h1>
        <a href="#/expense/new" class="icon-btn accent" aria-label="Add an expense">${icon('plus', 22, 2)}</a>
      </header>

      ${owe.length || owed.length ? html`<section class="card balance" aria-label="Your balance">
        <span class="small muted">${owe.length ? 'You owe' : 'You’re owed'}</span>
        <span class="money-big ${owe.length ? '' : 'success'}">${money(total(owe.length ? owe : owed))}</span>
        <span class="small muted">Simplified so the house makes the fewest payments.</span>
        <ul class="sep" aria-label="Who owes whom" style="margin-top:10px">
          ${(owe.length ? owe : owed).map((x) => {
            const other = owe.length ? x.to : x.from;
            return html`<li class="row tall">
              <span class="pair" aria-hidden="true">${avatar(x.from, 28)}${icon('arrow', 14)}${avatar(x.to, 28)}</span>
              <span class="col grow"><span>${owe.length ? `You owe ${nameOf(other)}` : `${nameOf(other)} owes you`}</span><span class="strong">${money(x.amount)}</span></span>
              ${owe.length ? button('Settle up', { variant: 'secondary', size: 'small', href: `#/settle?to=${other}` }) : button('They paid', { variant: 'tertiary', size: 'small', href: `#/settle?from=${other}` })}
            </li>`;
          })}
        </ul>
      </section>` : html`<section class="card settled-tile" aria-label="Your balance">
        <span class="round-icon" aria-hidden="true">${icon('check', 26, 2)}</span>
        <h2 class="t2">All settled up.</h2>
        <p class="muted">${d.debts.length ? 'You’re square with everyone. Others in the house still have some to settle.' : 'Nobody in the house owes anyone right now.'}</p>
      </section>`}

      <section class="card card-list" aria-labelledby="ex-recent" style="padding:16px 16px 4px">
        <div class="card-head" style="padding:0 0 4px"><h2 id="ex-recent" class="t2">Recent</h2></div>
        ${d.recent.length ? html`<ul class="sep">${d.recent.map((e) => e.kind === 'payment' ? paymentRow(e, today) : html`<li data-key="e${e.id}">
          <a href="#/expense/${e.id}" class="row-link" style="min-height:64px">
            ${avatar(e.payers[0]?.memberId, 36)}
            <span class="col grow"><span class="strong">${e.title}</span>
              <span class="small muted" style="display:flex;align-items:center;gap:4px"><span class="ellipsis">${expenseMeta(e, today)}</span>${e.recurring ? icon('repeat', 13) : ''}</span></span>
            <span class="right"><span class="strong">${money(e.amount)}</span><span class="cap muted">${myPart(e)}</span></span>
          </a></li>`)}</ul>` : html`<div class="empty"><span class="strong">No expenses yet.</span><span class="small muted">Tap + to add the first shop or bill.</span></div>`}
      </section>
    </main>`;
  }
};

function paymentRow(p, today) {
  const title = isMe(p.fromId) ? `You paid ${nameOf(p.toId)} back` : isMe(p.toId) ? `${nameOf(p.fromId)} paid you back` : `${nameOf(p.fromId)} paid ${nameOf(p.toId)}`;
  return html`<li data-key="p${p.id}"><a href="#/history?kind=money" class="row-link" style="min-height:64px">
    ${avatar(p.fromId, 36)}
    <span class="col grow"><span class="strong ellipsis">${title}</span><span class="small muted">${when(p.date, today)} · ${METHOD[p.method]}</span></span>
    <span class="right"><span class="strong">${money(p.amount)}</span><span class="cap muted">Settled</span></span>
  </a></li>`;
}
