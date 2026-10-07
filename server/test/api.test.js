// Run with: npm test   (uses Node's built-in test runner, no extra packages)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { openDb } from '../db.js';
import { createApp } from '../server.js';
import { seed, DEMO_PASSWORD } from '../seed.js';
import { setFakeNow } from '../lib/time.js';
import { apportion, computeShares, simplifyDebts, netBalances } from '../lib/money.js';
import { encrypt } from '../lib/push.js';
import { runJobs } from '../lib/scheduler.js';
import { pushLog } from '../lib/house.js';

const NOW = '2026-10-05T09:30:00';

async function boot() {
  setFakeNow(NOW);
  const db = openDb(':memory:');
  const demo = await seed(db, { now: NOW });
  const server = http.createServer(createApp({ db })).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const signIn = async (who, password = DEMO_PASSWORD) => (await call('POST', '/api/login', { username: who, password })).body.token;
  return { db, demo, server, call, signIn };
}

// ---- Money maths ----
test('apportion always adds up exactly', () => {
  const m = apportion(1000, [{ id: 1, w: 1 }, { id: 2, w: 1 }, { id: 3, w: 1 }]);
  assert.deepEqual([...m.values()], [334, 333, 333]);
  for (let total = 1; total < 500; total += 7) {
    const parts = apportion(total, [{ id: 'a', w: 2 }, { id: 'b', w: 3 }, { id: 'c', w: 5 }]);
    assert.equal([...parts.values()].reduce((a, b) => a + b, 0), total);
  }
});

test('split types', () => {
  assert.deepEqual(computeShares(4260, { type: 'equal', entries: [1, 2, 3, 4].map((memberId) => ({ memberId })) }).map((s) => s.amount), [1065, 1065, 1065, 1065]);
  assert.deepEqual(computeShares(4260, { type: 'shares', entries: [{ memberId: 1, value: 1 }, { memberId: 2, value: 2 }] }).map((s) => s.amount), [1420, 2840]);
  assert.deepEqual(computeShares(1000, { type: 'percent', entries: [{ memberId: 1, value: 33.33 }, { memberId: 2, value: 66.67 }] }).map((s) => s.amount), [333, 667]);
  assert.throws(() => computeShares(1000, { type: 'exact', entries: [{ memberId: 1, value: 400 }, { memberId: 2, value: 500 }] }), /add up/);
  assert.throws(() => computeShares(1000, { type: 'percent', entries: [{ memberId: 1, value: 50 }] }), /100%/);
});

test('debts simplify to the fewest payments', () => {
  const net = netBalances([1, 2, 3], {
    payers: [{ member_id: 1, amount: 3000 }],
    shares: [{ member_id: 1, amount: 1000 }, { member_id: 2, amount: 1000 }, { member_id: 3, amount: 1000 }],
    payments: [{ from_id: 2, to_id: 1, amount: 400 }]
  });
  assert.deepEqual(simplifyDebts(net), [{ from: 3, to: 1, amount: 1000 }, { from: 2, to: 1, amount: 600 }]);
});

// ---- Push encryption (RFC 8291) round trip ----
test('push payload decrypts with the browser keys', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = encrypt('{"title":"Hi"}', ua.getPublicKey().toString('base64url'), auth.toString('base64url'));
  // Decrypt as a browser would.
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const prkKey = hmac(auth, ua.computeSecret(asPub));
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), '{"title":"Hi"}');
  assert.equal(plain.at(-1), 2);
});

// ---- API ----
test('demo house matches the designs', async () => {
  const { server, call, signIn } = await boot();
  try {
    const maya = await signIn('maya');
    const ex = (await call('GET', '/api/expenses', null, maya)).body;
    assert.equal(ex.myNet, -2260);
    assert.deepEqual(ex.mine.map((d) => d.amount), [960, 780, 520]);
    const today = (await call('GET', '/api/today', null, maya)).body;
    assert.equal(today.overdue[0].title, 'Take bins out');
    assert.deepEqual(today.today.map((t) => t.title), ['Empty dishwasher', 'Hoover living room', 'Water the plants']);
    assert.equal(today.doneCount, 1);
    const rota = (await call('GET', '/api/rota?week=1', null, maya)).body;
    const dishes = rota.tasks.filter((t) => t.short === 'Dishes').map((t) => t.assigneeId);
    assert.deepEqual(dishes, [4, 1, 2, 3, 4, 1, 2]); // Leo, Maya, Sam, Raj… continuing the daily rotation
  } finally { server.close(); }
});

test('auth: no token, bad token', async () => {
  const { server, call } = await boot();
  try {
    assert.equal((await call('GET', '/api/today')).status, 401);
    assert.equal((await call('GET', '/api/today', null, 'nope')).status, 401);
  } finally { server.close(); }
});

test('create a house, ask to join, admin approves, add a rotating chore', async () => {
  const { server, call } = await boot();
  try {
    const ana = (await call('POST', '/api/register', { username: 'ana', name: 'Ana', password: 'correct horse' })).body;
    assert.ok(ana.token);
    assert.equal(ana.membership, null);
    const a = await call('POST', '/api/houses', { houseName: 'Oak Lane', color: '#6b4fd8' }, ana.token);
    assert.equal(a.status, 200);
    const code = a.body.membership.house.inviteCode;
    assert.match(code, /^OAK\d{3}$/);
    assert.equal(a.body.membership.me.isAdmin, true);

    const ben = (await call('POST', '/api/register', { username: 'Ben', name: 'Ben', password: 'another one' })).body;
    assert.equal(ben.user.username, 'ben');
    assert.equal((await call('GET', '/api/today', null, ben.token)).body.code, 'no-house');
    const req = await call('POST', '/api/join-requests', { code }, ben.token);
    assert.equal(req.body.request.houseName, 'Oak Lane');
    assert.equal((await call('GET', '/api/today', null, ben.token)).status, 403, 'no house data while waiting');

    const list = (await call('GET', '/api/house/requests', null, a.body.token ?? ana.token)).body.requests;
    assert.equal(list[0].username, 'ben');
    assert.equal((await call('POST', `/api/house/requests/${list[0].id}/approve`, {}, ana.token)).status, 200);
    let acct = (await call('GET', '/api/account', null, ben.token)).body;
    assert.equal(acct.membership.me.setupDone, false);
    assert.notEqual(acct.membership.me.color, '#6b4fd8', 'gets a free colour');
    acct = (await call('PATCH', '/api/me', { color: '#0f7b6c', setupDone: true }, ben.token)).body;
    assert.equal(acct.membership.me.setupDone, true);

    const ids = acct.membership.members.map((m) => m.id);
    const c = await call('POST', '/api/chores', { title: 'Bins', repeat: 'weekly', days: ['mon'], mode: 'turns', rotation: ids, startDate: '2026-10-05', dueTime: '20:00' }, ana.token);
    const detail = (await call('GET', `/api/chores/${c.body.id}`, null, ana.token)).body;
    assert.deepEqual(detail.turns.map((t) => t.memberId), [ids[0], ids[1]]);
    assert.equal((await call('GET', '/api/chores/1', null, ben.token)).status, 404, 'other houses are invisible');
  } finally { server.close(); }
});

test('accounts: usernames, wrong passwords, lockout', async () => {
  const { server, call } = await boot();
  try {
    assert.match((await call('POST', '/api/register', { username: 'maya', name: 'M', password: 'whatever1' })).body.error, /taken/);
    assert.match((await call('POST', '/api/register', { username: 'x', name: 'X', password: 'whatever1' })).body.error, /3–20/);
    assert.match((await call('POST', '/api/register', { username: 'newbie', name: 'N', password: 'short' })).body.error, /8 characters/);
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/login', { username: 'sam', password: 'nope' })).status, 400);
    const locked = await call('POST', '/api/login', { username: 'sam', password: DEMO_PASSWORD });
    assert.equal(locked.status, 429, 'locked even with the right password');
    assert.equal((await call('POST', '/api/login', { username: 'RAJ', password: DEMO_PASSWORD })).status, 200, 'usernames ignore case');
  } finally { server.close(); }
});

test('admin resets a password; the person must choose a new one', async () => {
  const { server, call, signIn, demo } = await boot();
  try {
    const maya = await signIn('maya');
    const leoOld = await signIn('leo');
    assert.equal((await call('POST', `/api/members/${demo.members.leo}/reset-password`, {}, leoOld)).status, 403, 'only admins');
    const r = (await call('POST', `/api/members/${demo.members.leo}/reset-password`, {}, maya)).body;
    assert.match(r.tempPassword, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal((await call('GET', '/api/today', null, leoOld)).status, 401, 'old sessions end');
    const leo = await signIn('leo', r.tempPassword);
    assert.equal((await call('GET', '/api/today', null, leo)).body.code, 'must-change');
    const ok = await call('POST', '/api/account/password', { current: r.tempPassword, password: 'leo-new-password' }, leo);
    assert.equal(ok.body.user.mustChange, false);
    assert.equal((await call('GET', '/api/today', null, leo)).status, 200);
  } finally { server.close(); }
});

test('admin removes someone: rotations carry on, balance stays, they can rejoin', async () => {
  const { db, server, call, signIn, demo } = await boot();
  try {
    const maya = await signIn('maya');
    const sam = await signIn('sam');
    const { sam: S, raj: R, leo: L, maya: M } = demo.members;
    assert.equal((await call('POST', `/api/members/${M}/remove`, {}, maya)).status, 400, 'the last admin can’t go');
    const preview = (await call('GET', `/api/members/${S}/removal`, null, maya)).body;
    assert.ok(preview.rotations.includes('Take bins out'));
    assert.equal(preview.net, 780);

    assert.equal((await call('POST', `/api/members/${S}/remove`, {}, maya)).status, 200);
    // Bins: Maya's overdue turn stays; Sam was next (Sun 11) — now Raj is, then Leo.
    const bins = (await call('GET', `/api/chores/${demo.chores.bins}`, null, maya)).body;
    assert.deepEqual(bins.turns.map((t) => t.memberId), [M, R, L]);
    assert.equal(bins.turns[1].date, '2026-10-11');
    // Recycling was Sam and Raj: now just Raj.
    const rec = (await call('GET', `/api/chores/${demo.chores.recycle}`, null, maya)).body;
    assert.equal(rec.chore.mode, 'one');
    assert.equal(rec.chore.ownerId, R);
    assert.equal(db.get(`SELECT COUNT(*) n FROM tasks WHERE assignee_id = ? AND status = 'open'`, S).n, 0);
    // Money: Maya still owes Sam.
    const ex = (await call('GET', '/api/expenses', null, maya)).body;
    assert.ok(ex.mine.some((d) => d.to === S && d.amount === 780));
    const acct = (await call('GET', '/api/account', null, maya)).body;
    assert.ok(acct.membership.former.some((m) => m.id === S && m.left));
    // Sam is out, sees why, and can ask again.
    assert.equal((await call('GET', '/api/today', null, sam)).body.code, 'no-house');
    const samAcct = (await call('GET', '/api/account', null, sam)).body;
    assert.equal(samAcct.removedFrom.houseName, 'Elm Road');
    await call('POST', '/api/join-requests', { code: 'ELM482' }, sam);
    const req = (await call('GET', '/api/house/requests', null, maya)).body.requests.find((r) => r.username === 'sam');
    assert.equal(req.returning, true);
    const back = (await call('POST', `/api/house/requests/${req.id}/approve`, {}, maya)).body;
    assert.equal(back.memberId, S, 'gets their old place back');
  } finally { server.close(); }
});

test('admins: promote, and never zero admins', async () => {
  const { server, call, signIn, demo } = await boot();
  try {
    const maya = await signIn('maya');
    assert.equal((await call('POST', `/api/members/${demo.members.maya}/admin`, { isAdmin: false }, maya)).status, 400);
    assert.equal((await call('POST', `/api/members/${demo.members.raj}/admin`, { isAdmin: true }, maya)).status, 200);
    const raj = await signIn('raj');
    const reqs = (await call('GET', '/api/house/requests', null, raj)).body;
    assert.equal(reqs.canAnswer, true);
    assert.equal(reqs.requests[0].username, 'tom');
    assert.equal((await call('POST', `/api/house/requests/${reqs.requests[0].id}/decline`, {}, raj)).status, 200);
    const tom = await signIn('tom');
    assert.equal((await call('GET', '/api/account', null, tom)).body.declined.houseName, 'Elm Road');
  } finally { server.close(); }
});

test('swaps: request, accept, rotation continues', async () => {
  const { server, call, signIn, demo } = await boot();
  try {
    const leo = await signIn('leo');
    const bath = (await call('GET', `/api/chores/${demo.chores.bath}`, null, leo)).body;
    assert.equal(bath.swap.fromId, demo.members.maya);
    assert.equal((await call('POST', `/api/swaps/${bath.swap.id}/accept`, {}, leo)).status, 200);
    const after = (await call('GET', `/api/chores/${demo.chores.bath}`, null, leo)).body;
    assert.deepEqual(after.turns.slice(0, 4).map((t) => t.memberId), [demo.members.leo, demo.members.maya, demo.members.sam, demo.members.raj]);
    // Answering twice is refused
    assert.equal((await call('POST', `/api/swaps/${bath.swap.id}/accept`, {}, leo)).status, 400);
  } finally { server.close(); }
});

test('expenses: multi-payer, exact split, edit, delete', async () => {
  const { server, call, signIn, demo } = await boot();
  try {
    const maya = await signIn('maya');
    const { maya: m, sam: s, raj: r } = demo.members;
    const bad = await call('POST', '/api/expenses', { title: 'X', amount: 6000, payers: [{ memberId: m, amount: 4000 }], split: { type: 'equal', entries: [{ memberId: m }] } }, maya);
    assert.match(bad.body.error, /payers add up/);
    const ok = await call('POST', '/api/expenses', {
      title: 'Big shop', amount: 6000, date: '2026-10-05',
      payers: [{ memberId: m, amount: 4000 }, { memberId: s, amount: 2000 }],
      split: { type: 'exact', entries: [{ memberId: m, value: 2000 }, { memberId: s, value: 2500 }, { memberId: r, value: 1500 }] }
    }, maya);
    assert.equal(ok.status, 200);
    let ex = (await call('GET', '/api/expenses', null, maya)).body;
    assert.equal(ex.myNet, -2260 + 2000);
    const sum = [...ex.debts].reduce((a, d) => a + d.amount, 0);
    assert.ok(sum > 0);
    await call('DELETE', `/api/expenses/${ok.body.id}`, {}, maya);
    ex = (await call('GET', '/api/expenses', null, maya)).body;
    assert.equal(ex.myNet, -2260);
  } finally { server.close(); }
});

test('anonymous issues never reveal the reporter', async () => {
  const { server, call, signIn } = await boot();
  try {
    const sam = await signIn('sam');
    const leo = await signIn('leo');
    const r = await call('POST', '/api/issues', { type: 'other', title: 'Hall light flickers', anonymous: true }, sam);
    const seen = (await call('GET', `/api/issues/${r.body.id}`, null, leo)).body.issue;
    assert.equal(seen.reporterId, null);
    const hist = (await call('GET', '/api/activity?kind=issues', null, leo)).body.items[0];
    assert.equal(hist.actorId, null);
    const mine = (await call('GET', `/api/issues/${r.body.id}`, null, sam)).body.issue;
    assert.equal(mine.mine, true);
  } finally { server.close(); }
});

test('scheduler: reminders, overdue log, monthly bill', async () => {
  const { db, server, demo } = await boot();
  try {
    const house = db.get('SELECT * FROM houses');
    pushLog.length = 0;
    runJobs(db, house, '2026-10-05T18:05:00'); // an hour before "Hoover living room" (7 pm)
    assert.ok(pushLog.some((p) => p.memberId === demo.members.maya && p.payload.title === 'Hoover living room'));
    runJobs(db, house, '2026-10-05T18:10:00');
    assert.equal(pushLog.filter((p) => p.payload.title === 'Hoover living room').length, 1, 'no double reminder');
    // Energy bill on the 15th
    runJobs(db, house, '2026-10-15T09:01:00');
    const energy = db.get(`SELECT * FROM expenses WHERE title = 'Energy'`);
    assert.equal(energy.amount, 14800);
    runJobs(db, house, '2026-10-15T10:00:00');
    assert.equal(db.get(`SELECT COUNT(*) n FROM expenses WHERE title = 'Energy'`).n, 1, 'bill runs once a month');
  } finally { server.close(); }
});
