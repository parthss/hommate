import { html, raw } from '../dom.js';
import { get, post, del } from '../api.js';
import { session } from '../store.js';
import { icon, seg, backLink, nameOf, isMe, money, pence, button } from '../ui.js';

const METHODS = [{ id: 'bank', label: 'Bank transfer' }, { id: 'cash', label: 'Cash' }, { id: 'other', label: 'Other' }];

export default {
  title: 'Settle up',
  load: () => get('/expenses'),
  init(ctx) {
    const mine = ctx.data.mine;
    const owe = mine.filter((d) => isMe(d.from));
    const dir = ctx.query.from ? 'received' : ctx.query.to || owe.length || !mine.length ? 'paid' : 'received';
    const who = +(ctx.query.to || ctx.query.from) || (dir === 'paid' ? owe[0]?.to : mine.find((d) => isMe(d.to))?.from) || session.members.find((m) => !isMe(m.id))?.id;
    ctx.state = { dir, who, method: 'bank', amount: '', recorded: null, busy: false };
    ctx.state.amount = suggested(ctx);
  },
  view(ctx) {
    const s = ctx.state;
    const others = [...session.members.filter((m) => !isMe(m.id)), ...session.former.filter((m) => balanceWith(ctx, m.id) !== 0)];
    const amount = pence(s.amount);
    const ok = Number.isFinite(amount) && amount > 0 && s.who;
    const name = nameOf(s.who, { you: 'name' });

    if (s.recorded) {
      return html`<main class="screen no-tabs">
        ${backLink('#/expenses', 'Expenses')}
        <section role="status" class="card settled-tile" style="margin-top:12px;padding:32px 20px">
          <span class="round-icon" aria-hidden="true">${icon('check', 26, 2)}</span>
          <h2 class="t2">Payment recorded.</h2>
          <p class="muted">${s.recorded.square ? `You and ${name} are square. ` : ''}${name} will see it in Activity.</p>
          <div class="rowflex wrap" style="justify-content:center;gap:12px;margin-top:12px">
            ${button('Undo', { variant: 'tertiary', on: 'undo' })}
            ${button('Back to expenses', { variant: 'secondary', href: '#/expenses' })}
          </div>
        </section></main>`;
    }

    return html`<main class="screen has-footer">
      ${backLink('#/expenses', 'Expenses')}
      <h1 class="t1" style="padding:0 6px">Settle up</h1>
      ${seg('dir', [{ label: 'I paid someone', value: 'paid' }, { label: 'Someone paid me', value: 'received' }], s.dir, 'dir', 'Direction')}
      <section class="section" aria-labelledby="su-who">
        <h2 id="su-who" class="sec-label">${s.dir === 'paid' ? 'Who are you paying?' : 'Who paid you?'}</h2>
        <div class="card pad people4" role="radiogroup" aria-labelledby="su-who">
          ${others.map((m) => { const on = s.who === m.id; const bal = balanceWith(ctx, m.id); return html`<button type="button" class="person-btn ${on ? 'on' : 'solid'}" role="radio" aria-checked="${on}" data-on="who" data-id="${m.id}">
            <span class="av av-44 ${on ? 'ring' : ''}" style="background:${m.color}" aria-hidden="true">${m.name[0]}</span>
            <span>${m.left ? m.name + ' (left)' : m.name}</span><span class="sub2">${bal > 0 ? `you owe ${money(bal)}` : bal < 0 ? `owes you ${money(-bal)}` : 'square'}</span></button>`; })}
        </div>
      </section>
      <section class="card amount-big" aria-label="Amount" style="padding:16px">
        <label for="su-amount" class="small muted">${s.dir === 'paid' ? `You’re paying ${name}` : `${name} paid you`}</label>
        <div class="amt"><span class="cur" aria-hidden="true">£</span><input id="su-amount" type="text" inputmode="decimal" placeholder="0.00" value="${s.amount}" data-input="amount"></div>
        <span class="cap muted">${hint(ctx)}</span>
      </section>
      <section class="section" aria-labelledby="su-how">
        <h2 id="su-how" class="sec-label">How was it paid?</h2>
        <div class="card card-rows sep" role="radiogroup" aria-labelledby="su-how">
          ${METHODS.map((m) => html`<button type="button" class="opt" role="radio" aria-checked="${s.method === m.id}" data-on="method" data-id="${m.id}">
            <span class="grow">${m.label}</span><span class="radio ${s.method === m.id ? 'on' : ''}" aria-hidden="true">${s.method === m.id ? icon('check', 14, 2.5) : ''}</span></button>`)}
        </div>
        <p class="note">Hommate doesn’t move money. Pay ${name} your usual way, then record it here so everyone’s balances update.</p>
      </section>
    </main>
    <footer class="footer-bar">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="record" ${ok && !s.busy ? '' : raw('disabled')}>
        ${ok ? (s.dir === 'paid' ? `Record ${money(amount)} to ${name}` : `Record ${money(amount)} from ${name}`) : 'Enter an amount'}</button>
    </footer>`;
  },
  actions: {
    dir: (ctx, el) => { ctx.state.dir = el.dataset.value; ctx.state.amount = suggested(ctx); ctx.set({}); },
    who: (ctx, el) => { ctx.state.who = +el.dataset.id; ctx.state.amount = suggested(ctx); ctx.set({}); },
    method: (ctx, el) => ctx.set({ method: el.dataset.id }),
    amount: (ctx, el) => ctx.set({ amount: el.value.replace(/[^\d.]/g, '') }),
    record: async (ctx) => {
      const s = ctx.state;
      const amount = pence(s.amount);
      ctx.set({ busy: true });
      try {
        const body = s.dir === 'paid' ? { toId: s.who, amount, method: s.method } : { fromId: s.who, toId: session.me.id, amount, method: s.method };
        const r = await post('/payments', body);
        const bal = Math.abs(balanceWith(ctx, s.who));
        ctx.set({ busy: false, recorded: { id: r.id, square: amount === bal } });
      } catch (e) { ctx.set({ busy: false }); throw e; }
    },
    undo: async (ctx) => {
      await del('/payments/' + ctx.state.recorded.id);
      ctx.toast('Payment removed.');
      ctx.set({ recorded: null });
    }
  }
};

/** Positive: I owe them. Negative: they owe me. (Based on the simplified debts.) */
function balanceWith(ctx, id) {
  let v = 0;
  for (const d of ctx.data.mine) {
    if (isMe(d.from) && d.to === id) v += d.amount;
    if (isMe(d.to) && d.from === id) v -= d.amount;
  }
  return v;
}

function suggested(ctx) {
  const b = balanceWith(ctx, ctx.state.who);
  const v = ctx.state.dir === 'paid' ? b : -b;
  return v > 0 ? (v / 100).toFixed(2) : '';
}

function hint(ctx) {
  const b = balanceWith(ctx, ctx.state.who);
  const v = ctx.state.dir === 'paid' ? b : -b;
  return v > 0 ? 'The full amount. You can record part of it.' : 'Nothing is owed here right now, but you can still record a payment.';
}
