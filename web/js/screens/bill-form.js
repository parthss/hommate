import { html, raw } from '../dom.js';
import { get, post, put, del } from '../api.js';
import { session } from '../store.js';
import { icon, chev, field, isMe, money, pence } from '../ui.js';

const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export default {
  title: (ctx) => (ctx.params.id ? 'Edit bill' : 'Add a bill'),
  load: async (ctx) => (ctx.params.id ? { bill: (await get('/bills')).bills.find((b) => b.id === +ctx.params.id) } : {}),
  init(ctx) {
    const b = ctx.data.bill;
    ctx.state = b
      ? { title: b.title, amount: (b.amount / 100).toFixed(2), day: b.dayOfMonth, payer: b.payerId, busy: false, error: null }
      : { title: '', amount: '', day: 1, payer: session.me.id, busy: false, error: null };
  },
  view(ctx) {
    const s = ctx.state;
    const p = pence(s.amount);
    const n = session.members.length;
    const editing = !!ctx.params.id;
    if (editing && !ctx.data.bill) return html`<main class="screen no-tabs"><a class="back" href="#/house">${icon('back', 20)}House</a><div class="card empty"><span class="strong">That bill wasn’t found.</span></div></main>`;
    return html`
    <header class="navbar"><a href="#/house" class="text-btn">Cancel</a><h1>${editing ? 'Edit bill' : 'Add a bill'}</h1><span></span></header>
    <main class="screen form has-footer">
      <div class="amount-big"><label for="b-amount" class="small muted">Amount each month</label>
        <div class="amt"><span class="cur" aria-hidden="true">£</span><input id="b-amount" type="text" inputmode="decimal" placeholder="0.00" value="${s.amount}" data-input="amount"></div>
        ${Number.isFinite(p) && p > 0 ? html`<span class="small muted">${money(Math.round(p / n))} each, split ${n} ways</span>` : ''}</div>
      ${field('Bill name', { name: 'title', value: s.title, input: 'title', attrs: 'maxlength="40" autocomplete="off"' })}
      <section class="section" aria-labelledby="b-payer"><h2 id="b-payer" class="sec-label">Who pays it</h2>
        <div class="card pad people4" role="radiogroup" aria-labelledby="b-payer">
          ${session.members.map((m) => html`<button type="button" class="person-btn ${s.payer === m.id ? 'on' : 'solid'}" role="radio" aria-checked="${s.payer === m.id}" data-on="payer" data-id="${m.id}">
            <span class="av av-44 ${s.payer === m.id ? 'ring' : ''}" style="background:${m.color}" aria-hidden="true">${m.name[0]}</span><span>${isMe(m.id) ? 'You' : m.name}</span></button>`)}
        </div></section>
      <div class="card" style="padding:0 12px 0 16px">
        <label class="picker-row"><span class="grow">Day of the month</span><span class="val">${ordinal(s.day)}</span>${chev()}
          <select data-change="day" aria-label="Day of the month">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => html`<option value="${d}" ${d === s.day ? raw('selected') : ''}>${ordinal(d)}</option>`)}</select></label>
      </div>
      <p class="note">On that day each month, Hommate adds it to Expenses, paid by ${s.payer && isMe(s.payer) ? 'you' : session.members.find((m) => m.id === s.payer)?.name} and split equally between everyone.</p>
      ${editing ? html`<button type="button" class="text-btn danger" style="align-self:center;gap:6px" data-on="remove" data-confirm="Stop this bill? Past expenses stay as they are.">${icon('trash', 18)}Stop this bill</button>` : ''}
    </main>
    <footer class="footer-bar">
      ${s.error ? html`<p class="form-error" role="alert">${icon('info', 18)}${s.error}</p>` : ''}
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.busy ? raw('disabled') : ''}>Save bill</button>
    </footer>`;
  },
  actions: {
    amount: (ctx, el) => ctx.set({ amount: el.value.replace(/[^\d.]/g, ''), error: null }),
    title: (ctx, el) => { ctx.state.title = el.value; },
    payer: (ctx, el) => ctx.set({ payer: +el.dataset.id }),
    day: (ctx, el) => ctx.set({ day: +el.value }),
    save: async (ctx) => {
      const s = ctx.state;
      const body = { title: s.title.trim(), amount: pence(s.amount), payerId: s.payer, dayOfMonth: s.day };
      if (!body.title) return ctx.set({ error: 'Name the bill.' });
      if (!Number.isFinite(body.amount) || body.amount <= 0) return ctx.set({ error: 'Enter an amount above £0.' });
      ctx.set({ busy: true });
      try {
        if (ctx.params.id) await put('/bills/' + ctx.params.id, body); else await post('/bills', body);
        ctx.toast('Bill saved.');
        ctx.go('#/house', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    },
    remove: async (ctx) => { await del('/bills/' + ctx.params.id); ctx.toast('Bill stopped.'); ctx.go('#/house', true); }
  }
};
