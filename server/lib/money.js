// Money maths. All amounts are integer pence.

export class MoneyError extends Error { constructor(m) { super(m); this.name = 'MoneyError'; } }

/**
 * Share `total` across weights so the parts add up exactly (largest remainder method).
 * weights: [{ id, w }] → Map(id → pence)
 */
export function apportion(total, weights) {
  const sum = weights.reduce((a, x) => a + x.w, 0);
  if (sum <= 0) throw new MoneyError('Nothing to split between.');
  const rows = weights.map((x, i) => {
    const exact = (total * x.w) / sum;
    return { id: x.id, i, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let left = total - rows.reduce((a, r) => a + r.floor, 0);
  // Hand out the leftover pennies to the biggest fractions (ties: list order).
  [...rows].sort((a, b) => b.frac - a.frac || a.i - b.i).forEach((r) => { if (left > 0) { r.floor++; left--; } });
  return new Map(rows.map((r) => [r.id, r.floor]));
}

/**
 * Work out each person's share of an expense.
 * split: { type: 'equal'|'exact'|'percent'|'shares', entries: [{ memberId, value }] }
 *   equal   → value ignored
 *   exact   → value in pence
 *   percent → value in percent (may have decimals)
 *   shares  → value is a positive whole number
 * Returns [{ memberId, amount, value }]
 */
export function computeShares(total, split) {
  if (!Number.isInteger(total) || total <= 0) throw new MoneyError('Enter an amount above £0.');
  const entries = (split.entries || []).filter((e) => e && e.memberId != null);
  if (!entries.length) throw new MoneyError('Pick at least one person.');
  const ids = new Set(entries.map((e) => e.memberId));
  if (ids.size !== entries.length) throw new MoneyError('Each person can only appear once.');

  switch (split.type) {
    case 'equal': {
      const m = apportion(total, entries.map((e) => ({ id: e.memberId, w: 1 })));
      return entries.map((e) => ({ memberId: e.memberId, amount: m.get(e.memberId), value: null }));
    }
    case 'exact': {
      const vals = entries.map((e) => Math.round(Number(e.value)));
      if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new MoneyError('Amounts can’t be negative.');
      const sum = vals.reduce((a, b) => a + b, 0);
      if (sum !== total) throw new MoneyError(`The amounts add up to ${fmt(sum)}, not ${fmt(total)}.`);
      return entries.map((e, i) => ({ memberId: e.memberId, amount: vals[i], value: vals[i] }));
    }
    case 'percent': {
      const vals = entries.map((e) => Number(e.value));
      if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new MoneyError('Percentages can’t be negative.');
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.001) throw new MoneyError(`The percentages add up to ${+sum.toFixed(2)}%, not 100%.`);
      const m = apportion(total, entries.map((e, i) => ({ id: e.memberId, w: vals[i] })));
      return entries.map((e, i) => ({ memberId: e.memberId, amount: m.get(e.memberId), value: vals[i] }));
    }
    case 'shares': {
      const vals = entries.map((e) => Number(e.value));
      if (vals.some((v) => !Number.isInteger(v) || v < 1)) throw new MoneyError('Shares must be whole numbers, 1 or more.');
      const m = apportion(total, entries.map((e, i) => ({ id: e.memberId, w: vals[i] })));
      return entries.map((e, i) => ({ memberId: e.memberId, amount: m.get(e.memberId), value: vals[i] }));
    }
    default:
      throw new MoneyError('Unknown split type.');
  }
}

/** payers: [{ memberId, amount }] must add up to the total. */
export function checkPayers(total, payers) {
  if (!payers?.length) throw new MoneyError('Pick who paid.');
  if (new Set(payers.map((p) => p.memberId)).size !== payers.length) throw new MoneyError('Each payer can only appear once.');
  if (payers.some((p) => !Number.isInteger(p.amount) || p.amount < 0)) throw new MoneyError('Payments can’t be negative.');
  const sum = payers.reduce((a, p) => a + p.amount, 0);
  if (sum !== total) throw new MoneyError(`The payers add up to ${fmt(sum)}, not ${fmt(total)}.`);
}

/**
 * Net position per member: positive = the house owes them, negative = they owe.
 * net = paid − share + payments sent − payments received
 */
export function netBalances(memberIds, { payers, shares, payments }) {
  const net = new Map(memberIds.map((id) => [id, 0]));
  const add = (id, v) => net.set(id, (net.get(id) || 0) + v);
  for (const p of payers) add(p.member_id, p.amount);
  for (const s of shares) add(s.member_id, -s.amount);
  for (const p of payments) { add(p.from_id, p.amount); add(p.to_id, -p.amount); }
  return net;
}

/**
 * Turn net balances into the fewest simple payments: the biggest debtor pays the
 * biggest creditor, and so on. Returns [{ from, to, amount }].
 */
export function simplifyDebts(net) {
  const debtors = [], creditors = [];
  for (const [id, v] of net) {
    if (v < 0) debtors.push({ id, v: -v });
    else if (v > 0) creditors.push({ id, v });
  }
  const order = (a, b) => b.v - a.v || a.id - b.id;
  debtors.sort(order); creditors.sort(order);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].v -= amt; creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

export const fmt = (p) => (p < 0 ? '−' : '') + '£' + (Math.abs(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parse "42.6", "£42.60", "1,200" → pence. Returns NaN when invalid. */
export function toPence(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}
