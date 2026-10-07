// Expenses, balances, settling up and recurring bills.
import { computeShares, checkPayers, netBalances, simplifyDebts, fmt, MoneyError } from '../lib/money.js';
import { shortDate } from '../lib/time.js';
import { bad, notFound, HttpError, activeMembers, logActivity, notify, nameOf } from '../lib/house.js';

/** Everything needed to work out balances for a house. */
export function houseBalances(db, houseId) {
  const live = `SELECT id FROM expenses WHERE house_id = ? AND deleted_at IS NULL`;
  const payers = db.all(`SELECT member_id, amount FROM expense_payers WHERE expense_id IN (${live})`, houseId);
  const shares = db.all(`SELECT member_id, amount FROM expense_shares WHERE expense_id IN (${live})`, houseId);
  const payments = db.all(`SELECT from_id, to_id, amount FROM payments WHERE house_id = ? AND deleted_at IS NULL`, houseId);
  // Include everyone who ever took part, so people who left still show if they owe.
  const ids = new Set(activeMembers(db, houseId).map((m) => m.id));
  for (const r of [...payers, ...shares]) ids.add(r.member_id);
  for (const p of payments) { ids.add(p.from_id); ids.add(p.to_id); }
  const net = netBalances([...ids], { payers, shares, payments });
  return { net, debts: simplifyDebts(net) };
}

function expenseRows(db, id) {
  return {
    payers: db.all('SELECT member_id, amount FROM expense_payers WHERE expense_id = ? ORDER BY amount DESC', id),
    shares: db.all('SELECT member_id, amount, value FROM expense_shares WHERE expense_id = ? ORDER BY member_id', id)
  };
}

function readExpense(db, body, houseId, today) {
  const title = String(body.title || '').trim().replace(/\s+/g, ' ');
  if (!title) throw bad('Say what it was for.');
  if (title.length > 60) throw bad('Keep the description under 60 characters.');
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw bad('Enter an amount above £0.');
  if (amount > 10_000_00) throw bad('That’s over £10,000. Check the amount.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : today;
  const memberIds = new Set(db.all('SELECT id FROM members WHERE house_id = ?', houseId).map((m) => m.id));
  const payers = (body.payers || []).map((p) => ({ memberId: Number(p.memberId), amount: Number(p.amount) }));
  if (payers.some((p) => !memberIds.has(p.memberId))) throw bad('One of the payers isn’t in this house.');
  checkPayers(amount, payers);
  const split = { type: body.split?.type, entries: (body.split?.entries || []).map((e) => ({ memberId: Number(e.memberId), value: e.value })) };
  if (split.entries.some((e) => !memberIds.has(e.memberId))) throw bad('Someone in the split isn’t in this house.');
  const shares = computeShares(amount, split);
  return { title, amount, date, payers, split, shares };
}

function saveRows(db, expenseId, f) {
  db.run('DELETE FROM expense_payers WHERE expense_id = ?', expenseId);
  db.run('DELETE FROM expense_shares WHERE expense_id = ?', expenseId);
  for (const p of f.payers) if (p.amount > 0) db.run('INSERT INTO expense_payers (expense_id, member_id, amount) VALUES (?, ?, ?)', expenseId, p.memberId, p.amount);
  for (const s of f.shares) db.run('INSERT INTO expense_shares (expense_id, member_id, amount, value) VALUES (?, ?, ?, ?)', expenseId, s.memberId, s.amount, s.value);
}

const splitWords = (type, n) => type === 'equal' ? `split equally between ${n}` : type === 'exact' ? 'split by exact amounts' : type === 'percent' ? 'split by percentage' : 'split by shares';

/** Create an expense (used by the API and by recurring bills). */
export function createExpense(db, houseId, actorId, now, f, { billId = null } = {}) {
  const id = db.insert('INSERT INTO expenses (house_id, title, amount, date, split_type, bill_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    houseId, f.title, f.amount, f.date, f.split.type, billId, actorId, now);
  saveRows(db, id, f);
  const payerText = f.payers.length > 1 ? 'paid by ' + f.payers.map((p) => nameOf(db, p.memberId)).join(' and ') : `paid by ${nameOf(db, f.payers[0].memberId)}`;
  logActivity(db, houseId, now, {
    actor: actorId, cat: 'money', icon: 'money', verb: billId ? `added the ${f.title} bill` : `added ${f.title}`,
    detail: `${fmt(f.amount)} · ${billId ? payerText + ' · monthly' : splitWords(f.split.type, f.shares.length)}`, amount: f.amount, refType: 'expense', refId: id
  });
  const sharers = f.shares.filter((s) => s.amount > 0).map((s) => s.memberId).filter((m) => m !== actorId);
  notify(db, sharers, 'expenses', { title: billId ? `${f.title} bill added` : `${nameOf(db, actorId)} added ${f.title}`, body: `${fmt(f.amount)} · tap to see your share`, url: `#/expense/${id}` });
  return id;
}

export default function register(route, { db }) {
  // Balances plus the recent list (expenses and payments, newest first).
  route('GET', '/api/expenses', ({ me, house, now, query }) => {
    const { net, debts } = houseBalances(db, house.id);
    const limit = Math.min(100, Number(query.limit) || 40);
    const expenses = db.all(`SELECT * FROM expenses WHERE house_id = ? AND deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT ?`, house.id, limit).map((e) => {
      const { payers, shares } = expenseRows(db, e.id);
      const myShare = shares.find((s) => s.member_id === me.id)?.amount ?? 0;
      const myPaid = payers.find((p) => p.member_id === me.id)?.amount ?? 0;
      return {
        kind: 'expense', id: e.id, title: e.title, amount: e.amount, date: e.date, splitType: e.split_type, recurring: !!e.bill_id,
        payers: payers.map((p) => ({ memberId: p.member_id, amount: p.amount })),
        sharedWith: shares.map((s) => s.member_id), myShare, myPaid, included: shares.some((s) => s.member_id === me.id),
        createdAt: e.created_at
      };
    });
    const payments = db.all(`SELECT * FROM payments WHERE house_id = ? AND deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT ?`, house.id, limit)
      .map((p) => ({ kind: 'payment', id: p.id, fromId: p.from_id, toId: p.to_id, amount: p.amount, method: p.method, date: p.date, createdAt: p.created_at }));
    const recent = [...expenses, ...payments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    return {
      now,
      myNet: net.get(me.id) || 0,
      debts,                                   // the whole house, simplified
      mine: debts.filter((d) => d.from === me.id || d.to === me.id),
      recent
    };
  });

  route('GET', '/api/expenses/:id', ({ me, house, params }) => {
    const e = db.get('SELECT * FROM expenses WHERE id = ? AND house_id = ?', Number(params.id), house.id);
    if (!e) throw notFound('That expense');
    const { payers, shares } = expenseRows(db, e.id);
    const history = db.all(`SELECT * FROM activity WHERE ref_type = 'expense' AND ref_id = ? ORDER BY id DESC`, e.id)
      .map((a) => ({ actorId: a.actor_id, verb: a.verb, detail: a.detail, at: a.created_at }));
    return {
      expense: {
        id: e.id, title: e.title, amount: e.amount, date: e.date, splitType: e.split_type, recurring: !!e.bill_id,
        deleted: !!e.deleted_at, createdBy: e.created_by, createdAt: e.created_at
      },
      payers: payers.map((p) => ({ memberId: p.member_id, amount: p.amount })),
      shares: shares.map((s) => ({ memberId: s.member_id, amount: s.amount, value: s.value })),
      history
    };
  });

  route('POST', '/api/expenses', ({ me, house, now, today, body }) => {
    const f = readExpense(db, body, house.id, today);
    return { id: db.tx(() => createExpense(db, house.id, me.id, now, f)) };
  });

  route('PUT', '/api/expenses/:id', ({ me, house, now, today, body, params }) => {
    const e = db.get('SELECT * FROM expenses WHERE id = ? AND house_id = ? AND deleted_at IS NULL', Number(params.id), house.id);
    if (!e) throw notFound('That expense');
    const f = readExpense(db, body, house.id, today);
    db.tx(() => {
      db.run('UPDATE expenses SET title = ?, amount = ?, date = ?, split_type = ? WHERE id = ?', f.title, f.amount, f.date, f.split.type, e.id);
      saveRows(db, e.id, f);
      const changes = [];
      if (e.amount !== f.amount) changes.push(`Amount ${fmt(e.amount)} → ${fmt(f.amount)}`);
      if (e.title !== f.title) changes.push(`Renamed from ${e.title}`);
      if (e.date !== f.date) changes.push(`Date ${shortDate(e.date)} → ${shortDate(f.date)}`);
      if (e.split_type !== f.split.type) changes.push(splitWords(f.split.type, f.shares.length).replace(/^s/, 'S'));
      logActivity(db, house.id, now, { actor: me.id, cat: 'money', icon: 'edit', verb: `edited ${f.title}`, detail: changes.join(' · ') || 'Changed who paid or the split', refType: 'expense', refId: e.id });
    });
    return { id: e.id };
  });

  route('DELETE', '/api/expenses/:id', ({ me, house, now, params }) => {
    const e = db.get('SELECT * FROM expenses WHERE id = ? AND house_id = ? AND deleted_at IS NULL', Number(params.id), house.id);
    if (!e) throw notFound('That expense');
    db.run('UPDATE expenses SET deleted_at = ? WHERE id = ?', now, e.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'money', icon: 'edit', verb: `deleted ${e.title}`, detail: fmt(e.amount), refType: 'expense', refId: e.id });
    return { ok: true };
  });

  route('POST', '/api/expenses/:id/restore', ({ me, house, now, params }) => {
    const e = db.get('SELECT * FROM expenses WHERE id = ? AND house_id = ? AND deleted_at IS NOT NULL', Number(params.id), house.id);
    if (!e) throw notFound('That expense');
    db.run('UPDATE expenses SET deleted_at = NULL WHERE id = ?', e.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'money', icon: 'edit', verb: `restored ${e.title}`, detail: fmt(e.amount), refType: 'expense', refId: e.id });
    return { ok: true };
  });

  // ---- Settling up (records only: Hommate never moves money) ----
  route('POST', '/api/payments', ({ me, house, now, today, body }) => {
    const fromId = body.fromId ? Number(body.fromId) : me.id;
    const toId = Number(body.toId);
    if (fromId !== me.id && toId !== me.id) throw new HttpError(403, 'You can only record payments you made or received.');
    // Former housemates count too, so balances with people who've left can still be settled.
    const ids = new Set(db.all('SELECT id FROM members WHERE house_id = ?', house.id).map((m) => m.id));
    if (!ids.has(fromId) || !ids.has(toId) || fromId === toId) throw bad('Pick who the payment was between.');
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) throw bad('Enter an amount above £0.');
    const method = ['bank', 'cash', 'other'].includes(body.method) ? body.method : 'other';
    const id = db.tx(() => {
      const id = db.insert('INSERT INTO payments (house_id, from_id, to_id, amount, method, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        house.id, fromId, toId, amount, method, today, now);
      const methodLabel = { bank: 'Bank transfer', cash: 'Cash', other: 'Other' }[method];
      logActivity(db, house.id, now, fromId === me.id
        ? { actor: me.id, cat: 'money', icon: 'money', verb: 'paid {target} back', detail: `${fmt(amount)} · ${methodLabel}`, target: toId, amount, refType: 'payment', refId: id }
        : { actor: me.id, cat: 'money', icon: 'money', verb: 'recorded a payment from {target}', detail: `${fmt(amount)} · ${methodLabel}`, target: fromId, amount, refType: 'payment', refId: id });
      const other = fromId === me.id ? toId : fromId;
      notify(db, [other], 'expenses', { title: 'Payment recorded', body: fromId === me.id ? `${me.name} paid you ${fmt(amount)}.` : `${me.name} recorded your payment of ${fmt(amount)}.`, url: '#/expenses' });
      return id;
    });
    return { id };
  });

  route('DELETE', '/api/payments/:id', ({ me, house, now, params }) => {
    const p = db.get('SELECT * FROM payments WHERE id = ? AND house_id = ? AND deleted_at IS NULL', Number(params.id), house.id);
    if (!p) throw notFound('That payment');
    if (p.from_id !== me.id && p.to_id !== me.id) throw new HttpError(403, 'Only the two people involved can undo a payment.');
    db.run('UPDATE payments SET deleted_at = ? WHERE id = ?', now, p.id);
    const a = db.get(`SELECT id FROM activity WHERE ref_type = 'payment' AND ref_id = ?`, p.id);
    if (a) db.run('DELETE FROM activity WHERE id = ?', a.id);
    return { ok: true };
  });

  // ---- Recurring bills ----
  route('GET', '/api/bills', ({ house }) => {
    const n = activeMembers(db, house.id).length || 1;
    return {
      bills: db.all('SELECT * FROM bills WHERE house_id = ? AND active = 1 ORDER BY day_of_month, id', house.id).map((b) => ({
        id: b.id, title: b.title, amount: b.amount, payerId: b.payer_id, dayOfMonth: b.day_of_month, each: Math.round(b.amount / n), lastRun: b.last_run,
        payerLeft: !db.get('SELECT 1 FROM members WHERE id = ? AND left_at IS NULL', b.payer_id)
      }))
    };
  });

  const readBill = (body, houseId) => {
    const title = String(body.title || '').trim();
    if (!title) throw bad('Name the bill.');
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) throw bad('Enter an amount above £0.');
    const day = Number(body.dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 28) throw bad('Pick a day between the 1st and the 28th.');
    const payerId = Number(body.payerId);
    if (!activeMembers(db, houseId).some((m) => m.id === payerId)) throw bad('Pick who pays it.');
    return { title, amount, day, payerId };
  };

  route('POST', '/api/bills', ({ me, house, now, today, body }) => {
    const b = readBill(body, house.id);
    // If this month's date has already passed, start next month.
    const month = today.slice(0, 7);
    const lastRun = +today.slice(8, 10) > b.day ? month : null;
    const id = db.insert('INSERT INTO bills (house_id, title, amount, payer_id, day_of_month, last_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      house.id, b.title, b.amount, b.payerId, b.day, lastRun, now);
    logActivity(db, house.id, now, { actor: me.id, cat: 'money', icon: 'edit', verb: `added the recurring bill ${b.title}`, detail: `${fmt(b.amount)} on day ${b.day} of each month · ${nameOf(db, b.payerId)} pays`, refType: 'bill', refId: id });
    return { id };
  });

  route('PUT', '/api/bills/:id', ({ me, house, now, body, params }) => {
    const bill = db.get('SELECT * FROM bills WHERE id = ? AND house_id = ? AND active = 1', Number(params.id), house.id);
    if (!bill) throw notFound('That bill');
    const b = readBill(body, house.id);
    db.run('UPDATE bills SET title = ?, amount = ?, payer_id = ?, day_of_month = ? WHERE id = ?', b.title, b.amount, b.payerId, b.day, bill.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'money', icon: 'edit', verb: `edited the ${b.title} bill`, detail: `${fmt(b.amount)} on day ${b.day} · ${nameOf(db, b.payerId)} pays`, refType: 'bill', refId: bill.id });
    return { id: bill.id };
  });

  route('DELETE', '/api/bills/:id', ({ me, house, now, params }) => {
    const bill = db.get('SELECT * FROM bills WHERE id = ? AND house_id = ? AND active = 1', Number(params.id), house.id);
    if (!bill) throw notFound('That bill');
    db.run('UPDATE bills SET active = 0 WHERE id = ?', bill.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'money', icon: 'edit', verb: `stopped the ${bill.title} bill`, refType: 'bill', refId: bill.id });
    return { ok: true };
  });
}

export { MoneyError };
