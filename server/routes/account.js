// Accounts and getting into a house: sign up, sign in, passwords, creating a house,
// asking to join one, and push subscriptions (which belong to the account).
import {
  hashPassword, checkPassword, cleanUsername, checkNewPassword, startSession, login
} from '../lib/auth.js';
import { accountOf, HEXES } from '../lib/account.js';
import {
  bad, notFound, HttpError, makeInviteCode, activeMembers, adminIds, logActivity, notify, PREF_DEFAULTS
} from '../lib/house.js';

export const cleanName = (s, what, max = 40) => {
  const v = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (!v) throw bad(`Enter ${what}.`);
  if (v.length > max) throw bad(`Keep ${what} under ${max} characters.`);
  return v;
};

export default function register(route, { db, vapid }) {
  const account = (user, now) => accountOf(db, db.get('SELECT * FROM users WHERE id = ?', user.id), vapid, now);

  // ---- Sign up / sign in ----
  route('POST', '/api/register', async ({ body, now }) => {
    const username = cleanUsername(body.username);
    const name = cleanName(body.name, 'your name', 30);
    const password = checkNewPassword(body.password, username);
    if (db.get('SELECT 1 FROM users WHERE username = ?', username)) throw bad('That username is taken. Try another.');
    const hash = await hashPassword(password);
    const id = db.insert('INSERT INTO users (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)', username, name, hash, now);
    const user = db.get('SELECT * FROM users WHERE id = ?', id);
    return { token: startSession(db, id, now), ...account(user, now) };
  }, { auth: false });

  route('POST', '/api/login', async ({ body, now }) => {
    const user = await login(db, body.username, body.password, now);
    return { token: startSession(db, user.id, now), ...account(user, now) };
  }, { auth: false });

  route('POST', '/api/logout', ({ tokenHash }) => {
    db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    return { ok: true };
  }, { auth: 'user' });

  route('GET', '/api/account', ({ user, now }) => account(user, now), { auth: 'user' });

  route('POST', '/api/account/password', async ({ user, body, now, tokenHash }) => {
    if (!(await checkPassword(String(body.current ?? ''), user.pass_hash))) throw bad('Your current password isn’t right.');
    const next = checkNewPassword(body.password, user.username);
    if (next === body.current) throw bad('Choose a password you haven’t just used.');
    db.run('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?', await hashPassword(next), user.id);
    // Sign out everywhere else; this device stays signed in.
    db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, tokenHash);
    return account(user, now);
  }, { auth: 'user' });

  route('POST', '/api/account/signout-all', ({ user }) => {
    db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
    return { ok: true };
  }, { auth: 'user' });

  route('PATCH', '/api/account', ({ user, body, now }) => {
    const name = cleanName(body.name, 'your name', 30);
    db.run('UPDATE users SET name = ? WHERE id = ?', name, user.id);
    return account(user, now);
  }, { auth: 'user' });

  // ---- Create a house (you become its admin) ----
  route('POST', '/api/houses', ({ user, me, body, now }) => {
    if (me) throw bad('You’re already in a house.');
    const houseName = cleanName(body.houseName, 'a house name');
    if (!HEXES.has(body.color)) throw bad('Pick a colour.');
    db.tx(() => {
      db.run(`UPDATE join_requests SET status = 'cancelled', answered_at = ? WHERE user_id = ? AND status = 'pending'`, now, user.id);
      const code = makeInviteCode(db, houseName);
      const houseId = db.insert('INSERT INTO houses (name, invite_code, created_at) VALUES (?, ?, ?)', houseName, code, now);
      const memberId = db.insert('INSERT INTO members (house_id, user_id, name, color, is_admin, prefs, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
        houseId, user.id, user.name, body.color, JSON.stringify(PREF_DEFAULTS), now);
      logActivity(db, houseId, now, { actor: memberId, cat: 'house', icon: 'join', verb: `created ${houseName}` });
    });
    return account(user, now);
  }, { auth: 'user' });

  // ---- Ask to join a house with its code ----
  route('GET', '/api/invite/:code', ({ params }) => {
    const house = db.get('SELECT * FROM houses WHERE invite_code = ?', params.code.toUpperCase());
    if (!house) throw notFound('That code');
    const members = activeMembers(db, house.id);
    return { house: { name: house.name }, members: members.map((m) => ({ name: m.name, color: m.color, isAdmin: !!m.is_admin })) };
  }, { auth: 'user' });

  route('POST', '/api/join-requests', ({ user, me, body, now }) => {
    if (me) throw bad('You’re already in a house.');
    const house = db.get('SELECT * FROM houses WHERE invite_code = ?', String(body.code || '').toUpperCase());
    if (!house) throw notFound('That code');
    if (activeMembers(db, house.id).length >= 12) throw bad('This house is full.');
    const id = db.tx(() => {
      db.run(`UPDATE join_requests SET status = 'cancelled', answered_at = ? WHERE user_id = ? AND status = 'pending'`, now, user.id);
      return db.insert('INSERT INTO join_requests (house_id, user_id, created_at) VALUES (?, ?, ?)', house.id, user.id, now);
    });
    notify(db, adminIds(db, house.id), null, {
      title: 'Request to join', body: `${user.name} (@${user.username}) wants to join ${house.name}. Tap to answer.`,
      url: '#/house', tag: `join-${id}`
    });
    return account(user, now);
  }, { auth: 'user' });

  route('DELETE', '/api/join-requests/mine', ({ user, now }) => {
    db.run(`UPDATE join_requests SET status = 'cancelled', answered_at = ? WHERE user_id = ? AND status = 'pending'`, now, user.id);
    return account(user, now);
  }, { auth: 'user' });

  // ---- Push subscriptions (per account, so pending people can hear back) ----
  route('POST', '/api/push/subscribe', ({ user, body, now }) => {
    const s = body.subscription;
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) throw bad('That subscription looks incomplete.');
    if (!/^https:\/\//.test(s.endpoint)) throw bad('Push endpoints must use HTTPS.');
    db.run('DELETE FROM push_subs WHERE endpoint = ?', s.endpoint);
    db.run('INSERT INTO push_subs (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)', user.id, s.endpoint, s.keys.p256dh, s.keys.auth, now);
    return { ok: true };
  }, { auth: 'user' });

  route('POST', '/api/push/unsubscribe', ({ user, body }) => {
    db.run('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?', user.id, String(body.endpoint || ''));
    return { ok: true };
  }, { auth: 'user' });
}

export { HttpError };
