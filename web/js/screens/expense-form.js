import { html, raw } from '../dom.js';
import { get, post, put } from '../api.js';
import { session } from '../store.js';
import { icon, chev, seg, field, nameOf, isMe, money, pence, dateShort, diffDays, words } from '../ui.js';
import { localToday } from './chore-form.js';

/** Same rounding as the server: parts always add up to the total. */
function apportion(total, weights) {
  const sum = weights.reduce((a, w) => a + w.w, 0);
  if (sum <= 0 || !Number.isFinite(total)) return new Map();
  const rows = weights.map((x, i) => { const ex = (total * x.w) / sum; return { id: x.id, i, f: Math.floor(ex), r: ex - Math.floor(ex) }; });
  let left = total - rows.reduce((a, r) => a + r.f, 0);
  [...rows].sort((a, b) => b.r - a.r || a.i - b.i).forEach((r) => { if (left > 0) { r.f++; left--; } });
  return new Map(rows.map((r) => [r.id, r.f]));
}

const fmt2 = (p) => (p / 100).toFixed(2);

export default {
  title: (ctx) => (ctx.params.id ? 'Edit expense' : 'Add expense'),
  focus: '#ae-amount',
  load: (ctx) => (ctx.params.id ? get('/expenses/' + ctx.params.id) : Promise.resolve({})),
  init(ctx) {
    const ids = session.members.map((m) => m.id);
    const base = {
      amount: '', title: '', date: localToday(), split: 'equal',
      paid: { [session.me.id]: true }, paidAmt: {},
      incl: Object.fromEntries(ids.map((id) => [id, true])),
      exact: {}, pct: Object.fromEntries(ids.map((id) => [id, String(+(100 / ids.length).toFixed(2))])), shares: Object.fromEntries(ids.map((id) => [id, 1])),
      error: null, busy: false
    };
    const d = ctx.data;
    if (d.expense) {
      const e = d.expense;
      base.amount = fmt2(e.amount); base.title = e.title; base.date = e.date; base.split = e.splitType;
      base.paid = Object.fromEntries(d.payers.map((p) => [p.memberId, true]));
      base.paidAmt = Object.fromEntries(d.payers.map((p) => [p.memberId, fmt2(p.amount)]));
      base.incl = Object.fromEntries(ids.map((id) => [id, d.shares.some((s) => s.memberId === id)]));
      for (const s of d.shares) {
        base.exact[s.memberId] = fmt2(s.amount);
        if (e.splitType === 'percent') base.pct[s.memberId] = String(s.value);
        if (e.splitType === 'shares') base.shares[s.memberId] = s.value;
      }
    }
    // Current housemates, plus anyone who has left but is part of this expense.
    const involved = new Set([...(d.payers || []), ...(d.shares || [])].map((x) => x.memberId));
    base.people = [...session.members, ...session.former.filter((m) => involved.has(m.id))];
    ctx.state = base;
  },
  view(ctx) {
    const s = ctx.state;
    const total = pence(s.amount);
    const okTotal = Number.isFinite(total) && total > 0;
    const people = s.people;
    const payers = people.filter((m) => s.paid[m.id]);
    const multi = payers.length > 1;
    const inc = people.filter((m) => s.incl[m.id]);

    // Who paid how much
    const paidOf = (id) => (multi ? pence(s.paidAmt[id] ?? '') : total);
    const paidSum = payers.reduce((a, m) => a + (paidOf(m.id) || 0), 0);
    const paidLeft = okTotal ? total - paidSum : 0;

    // Each person's share, plus a status line
    let shares = new Map(), status = '', bad = false;
    if (!inc.length) { status = 'Pick at least one person.'; bad = true; }
    else if (s.split === 'equal') { shares = apportion(total, inc.map((m) => ({ id: m.id, w: 1 }))); status = okTotal ? `${money(total)} split ${words[inc.length] || inc.length} ways.` : `Split ${words[inc.length] || inc.length} ways.`; }
    else if (s.split === 'shares') {
      const n = inc.reduce((a, m) => a + (s.shares[m.id] || 1), 0);
      shares = apportion(total, inc.map((m) => ({ id: m.id, w: s.shares[m.id] || 1 })));
      status = `${n} shares${okTotal ? ` · ${money(Math.round(total / n))} per share` : ''}.`;
    } else if (s.split === 'percent') {
      const vals = inc.map((m) => parseFloat(s.pct[m.id]) || 0);
      const sum = vals.reduce((a, b) => a + b, 0);
      shares = apportion(total, inc.map((m, i) => ({ id: m.id, w: vals[i] })));
      const left = +(100 - sum).toFixed(2);
      if (Math.abs(left) < 0.001) status = 'Adds up to 100%.';
      else { bad = true; status = left > 0 ? `${left}% still to assign.` : `${-left}% too much.`; }
    } else {
      for (const m of inc) shares.set(m.id, pence(s.exact[m.id] ?? '') || 0);
      const left = okTotal ? total - [...shares.values()].reduce((a, b) => a + b, 0) : 0;
      if (!okTotal) status = 'Enter the amount first.';
      else if (left === 0) status = `Adds up to ${money(total)}.`;
      else { bad = true; status = left > 0 ? `${money(left)} still to assign.` : `${money(-left)} too much.`; }
    }
    const dateLabel = (() => { const n = diffDays(s.date, localToday()); return n === 0 ? `Today, ${dateShort(s.date)}` : n === 1 ? `Yesterday, ${dateShort(s.date)}` : dateShort(s.date); })();
    const editing = !!ctx.params.id;

    return html`
    <header class="navbar">
      <a href="${editing ? `#/expense/${ctx.params.id}` : '#/expenses'}" class="text-btn">Cancel</a>
      <h1>${editing ? 'Edit expense' : 'Add expense'}</h1><span></span>
    </header>
    <main class="screen form has-footer">
      <div class="amount-big">
        <label for="ae-amount" class="small muted">Amount</label>
        <div class="amt"><span class="cur" aria-hidden="true">£</span>
          <input id="ae-amount" type="text" inputmode="decimal" placeholder="0.00" value="${s.amount}" data-input="amount" autocomplete="off"></div>
      </div>
      <form data-submit="save">${field('What was it for?', { name: 'title', value: s.title, input: 'title', attrs: 'maxlength="60" autocomplete="off" enterkeyhint="done"' })}</form>

      <section class="section" aria-labelledby="ae-paid">
        <div class="rowflex between" style="padding:0 6px"><h2 id="ae-paid" class="small muted" style="font-weight:400">Paid by</h2><span class="cap muted">Tap everyone who paid</span></div>
        <div class="card pad col" style="gap:14px">
          <div class="people4" role="group" aria-labelledby="ae-paid">
            ${people.map((m) => { const on = !!s.paid[m.id]; return html`<button type="button" class="person-btn ${on ? 'on' : ''}" data-on="payer" data-id="${m.id}" aria-pressed="${on}" aria-label="${nameOf(m.id)}${on ? ', paid' : ''}">
              <span class="av av-44 ${on ? 'ring' : ''}" style="background:${m.color}" aria-hidden="true">${m.name[0]}${on ? html`<span class="tick-badge">${icon('check', 12, 3)}</span>` : ''}</span>
              <span>${isMe(m.id) ? 'You' : m.name}</span></button>`; })}
          </div>
          ${!multi ? html`<p class="small muted">${payers[0] ? `${isMe(payers[0].id) ? 'You' : payers[0].name} paid the full ${okTotal ? money(total) : 'amount'}.` : ''} More than one person paid? Tap them too.</p>`
            : html`<div class="col" style="gap:4px;border-top:1px solid var(--separator);padding-top:10px">
              <span class="small muted">How much did each person pay?</span>
              ${payers.map((m) => html`<div class="row short" data-key="pa${m.id}"><span class="av av-28" style="background:${m.color}" aria-hidden="true">${m.name[0]}</span>
                <label class="grow" for="paid-${m.id}">${nameOf(m.id)}</label>
                <span class="mini-money"><span class="muted" aria-hidden="true">£</span><input id="paid-${m.id}" class="mini-input" type="text" inputmode="decimal" placeholder="0.00" value="${s.paidAmt[m.id] ?? ''}" data-input="paidAmt" data-id="${m.id}"></span></div>`)}
              <p role="status" class="small ${paidLeft === 0 && okTotal ? 'success' : 'danger'}" style="display:flex;gap:4px;align-items:center">
                ${icon(paidLeft === 0 && okTotal ? 'check' : 'info', 14)}${!okTotal ? 'Enter the amount first.' : paidLeft === 0 ? `Adds up to ${money(total)}.` : paidLeft > 0 ? `${money(paidLeft)} still to account for.` : `${money(-paidLeft)} too much.`}</p>
            </div>`}
        </div>
      </section>

      <div class="card" style="padding:0 12px 0 16px">
        <label class="picker-row"><span class="grow">Date</span><span class="val">${dateLabel}</span>${chev()}
          <input type="date" value="${s.date}" max="${localToday()}" data-change="date" aria-label="Date"></label>
      </div>

      <section class="section" aria-labelledby="ae-split">
        <h2 id="ae-split" class="sec-label">Split</h2>
        <div class="card" style="display:flex;flex-direction:column">
          <div style="padding:12px 12px 4px">${seg('split', [{ label: 'Equally', value: 'equal' }, { label: 'Exact', value: 'exact' }, { label: '%', value: 'percent' }, { label: 'Shares', value: 'shares' }], s.split, 'split', 'Split type')}</div>
          <ul class="sep" style="padding:0 16px 0 8px" aria-label="Each person’s share">
            ${people.map((m) => {
              const on = !!s.incl[m.id];
              const amt = shares.get(m.id) || 0;
              return html`<li class="rowflex" style="min-height:60px;gap:8px" data-key="sp${m.id}">
                <button type="button" class="check" style="width:40px" data-on="incl" data-id="${m.id}" aria-pressed="${on}" aria-label="Include ${nameOf(m.id)}"><span class="boxchk ${on ? 'on' : ''}">${on ? icon('check', 14, 2.5) : ''}</span></button>
                <span class="av" style="background:${m.color};opacity:${on ? 1 : 0.42}" aria-hidden="true">${m.name[0]}</span>
                <span class="col grow"><span style="color:${on ? 'var(--label)' : 'var(--label-secondary)'}">${nameOf(m.id)}</span>
                  ${!on ? html`<span class="small muted">Not included</span>` : s.split !== 'equal' && s.split !== 'exact' ? html`<span class="small muted">${okTotal ? money(amt) : '—'}</span>` : ''}</span>
                ${on && s.split === 'equal' ? html`<span class="strong">${okTotal ? money(amt) : '—'}</span>` : ''}
                ${on && s.split === 'exact' ? html`<span class="mini-money"><span class="muted" aria-hidden="true">£</span><input class="mini-input" type="text" inputmode="decimal" placeholder="0.00" aria-label="${nameOf(m.id)} amount" value="${s.exact[m.id] ?? ''}" data-input="exact" data-id="${m.id}"></span>` : ''}
                ${on && s.split === 'percent' ? html`<span class="mini-money"><input class="mini-input" style="width:72px" type="text" inputmode="decimal" aria-label="${nameOf(m.id)} percentage" value="${s.pct[m.id] ?? ''}" data-input="pct" data-id="${m.id}"><span class="muted">%</span></span>` : ''}
                ${on && s.split === 'shares' ? html`<span class="stepper"><button type="button" data-on="shares" data-id="${m.id}" data-d="-1" aria-label="Fewer shares for ${nameOf(m.id)}">−</button><span>${s.shares[m.id] || 1}</span><button type="button" data-on="shares" data-id="${m.id}" data-d="1" aria-label="More shares for ${nameOf(m.id)}">+</button></span>` : ''}
              </li>`;
            })}
          </ul>
        </div>
        <p role="status" class="note ${bad ? 'danger' : ''}" style="display:flex;gap:4px;align-items:center">${bad ? icon('info', 14) : ''}${status}</p>
      </section>
    </main>
    <footer class="footer-bar">
      ${s.error ? html`<p class="form-error" role="alert">${icon('info', 18)}${s.error}</p>` : ''}
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.busy ? raw('disabled') : ''}>${editing ? 'Save changes' : 'Add expense'}</button>
    </footer>`;
  },
  actions: {
    amount: (ctx, el) => {
      const v = el.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d*\.\d{0,2}).*$/, '$1');
      if (v !== el.value) el.value = v;
      ctx.set({ amount: v, error: null });
    },
    title: (ctx, el) => { ctx.state.title = el.value; if (ctx.state.error) ctx.set({ error: null }); },
    payer: (ctx, el) => {
      const id = +el.dataset.id, s = ctx.state;
      const count = Object.values(s.paid).filter(Boolean).length;
      if (s.paid[id] && count === 1) return; // someone must have paid
      const paid = { ...s.paid, [id]: !s.paid[id] };
      // Going from one payer to two: start the first payer on the full amount.
      const paidAmt = { ...s.paidAmt };
      if (count === 1 && paid[id]) { const first = +Object.keys(s.paid).find((k) => s.paid[k]); if (!paidAmt[first]) paidAmt[first] = s.amount; }
      ctx.set({ paid, paidAmt, error: null });
    },
    paidAmt: (ctx, el) => ctx.set({ paidAmt: { ...ctx.state.paidAmt, [el.dataset.id]: el.value }, error: null }),
    date: (ctx, el) => { if (el.value) ctx.set({ date: el.value }); },
    split: (ctx, el) => {
      const split = el.dataset.value, s = ctx.state;
      // Pre-fill exact amounts with the equal split so there's less to type.
      if (split === 'exact') {
        const t = pence(s.amount), inc = s.people.filter((m) => s.incl[m.id]);
        if (Number.isFinite(t) && inc.length) { const m = apportion(t, inc.map((x) => ({ id: x.id, w: 1 }))); s.exact = Object.fromEntries(inc.map((x) => [x.id, fmt2(m.get(x.id))])); }
      }
      if (split === 'percent') {
        const inc = s.people.filter((m) => s.incl[m.id]);
        const each = +(100 / (inc.length || 1)).toFixed(2);
        s.pct = Object.fromEntries(inc.map((x, i) => [x.id, String(i === inc.length - 1 ? +(100 - each * (inc.length - 1)).toFixed(2) : each)]));
      }
      ctx.set({ split, error: null });
    },
    incl: (ctx, el) => ctx.set({ incl: { ...ctx.state.incl, [el.dataset.id]: !ctx.state.incl[el.dataset.id] }, error: null }),
    exact: (ctx, el) => ctx.set({ exact: { ...ctx.state.exact, [el.dataset.id]: el.value }, error: null }),
    pct: (ctx, el) => ctx.set({ pct: { ...ctx.state.pct, [el.dataset.id]: el.value }, error: null }),
    shares: (ctx, el) => {
      const id = el.dataset.id, cur = ctx.state.shares[id] || 1;
      ctx.set({ shares: { ...ctx.state.shares, [id]: Math.max(1, Math.min(20, cur + +el.dataset.d)) } });
    },
    save: async (ctx) => {
      const s = ctx.state;
      const amount = pence(s.amount);
      if (!Number.isFinite(amount) || amount <= 0) return ctx.set({ error: 'Enter an amount above £0.' });
      if (!s.title.trim()) return ctx.set({ error: 'Say what it was for.' });
      const payerIds = s.people.filter((m) => s.paid[m.id]).map((m) => m.id);
      const payers = payerIds.length === 1 ? [{ memberId: payerIds[0], amount }] : payerIds.map((id) => ({ memberId: id, amount: pence(s.paidAmt[id] ?? '') || 0 }));
      const inc = s.people.filter((m) => s.incl[m.id]).map((m) => m.id);
      const entries = inc.map((id) => ({
        memberId: id,
        value: s.split === 'exact' ? pence(s.exact[id] ?? '') || 0 : s.split === 'percent' ? parseFloat(s.pct[id]) || 0 : s.split === 'shares' ? s.shares[id] || 1 : null
      }));
      ctx.set({ busy: true, error: null });
      try {
        const body = { title: s.title.trim(), amount, date: s.date, payers, split: { type: s.split, entries } };
        const r = ctx.params.id ? await put('/expenses/' + ctx.params.id, body) : await post('/expenses', body);
        ctx.toast(ctx.params.id ? 'Expense updated.' : 'Expense added.');
        ctx.go(ctx.params.id ? `#/expense/${r.id}` : '#/expenses', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};
